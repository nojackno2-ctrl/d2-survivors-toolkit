// 在隱藏視窗裡執行，G 是遊戲模組（engine.js 加上的 __ 前綴匯出）
const ILVL = 99;
const SEED_TRIES = 4000;      // 每件物品最多試幾個種子找「全部最高」的合法 roll
const SEED_MAX_SPACE = 20000; // 可能組合在這以內時，大多找得到全滿的種子

export function boot(G, itemstatsText, gameIdentity = {}) {
  const stats = JSON.parse(itemstatsText);
  G.__setData(stats);
  const defs = {
    unique: new Map(G.__uniques.map((d) => [d.name, d])),
    set: new Map(G.__sets.map((d) => [d.name, d])),
    runeword: new Map(G.__runewords.map((d) => [d.name, d])),
  };
  const bases = new Map(G.__bases.map((b) => [b.name, b]));
  const propsOf = { unique: (n) => stats.uniques[n]?.props, set: (n) => stats.setItems[n]?.props, runeword: (n) => stats.runewords[n]?.props };

  // 符文之語沒有指定底材：挑孔數夠、類型符合、等級最高的底材
  // 底材類型（與遊戲收藏的分類相同）：單手／雙手武器、盾牌、頭盔、盔甲；其他為 null
  function kindOf(b) {
    if (b?.type === "weapon") return b.twoHand ? "two-hand" : "one-hand";
    return b?.type === "shield" || b?.type === "head" || b?.type === "body" ? b.type : null;
  }
  function runewordBase(def, kind) {
    const ok = G.__bases.filter((b) => def.types.some((t) => G.__isType(b.itype, t)) && !def.excluded?.some((t) => G.__isType(b.itype, t))
      && (!kind || kindOf(b) === kind)
      && Math.max(...(stats.bases[b.name]?.sockets ?? [0])) >= def.runes.length);
    const rank = (b) => [stats.bases[b.name]?.level ?? b.level ?? 0, stats.bases[b.name]?.defense?.[1] ?? 0];
    ok.sort((a, b) => { const [la, da] = rank(a), [lb, db] = rank(b); return lb - la || db - da; });
    return ok[0] ?? null;
  }
  function make(rarity, name, baseName, eth = false) {
    const def = defs[rarity].get(name);
    if (!def) return null;
    if (rarity === "unique") return G.__makeUnique(def, ILVL, ILVL);
    if (rarity === "set") return G.__makeSet(def, ILVL, ILVL);
    const base = (baseName && bases.get(baseName)) || runewordBase(def);
    return base ? G.__makeRuneword(def, base, !!eth, ILVL, ILVL) : null;
  }
  // 與遊戲掉落相同：以種子產生並附上 roll，遊戲可重現驗證
  function seededMake(seed, rarity, name, baseName, eth = false) {
    const it = G.__seeded(seed, () => make(rarity, name, baseName, eth));
    if (it?.stats) it.roll = [1, seed, ILVL];
    return it;
  }
  const pinned = (fn, value = 0.9999999) => { const r = Math.random; Math.random = () => value; try { return fn(); } finally { Math.random = r; } };
  const key = (it) => JSON.stringify([it.mods, it.defense ?? null]);
  // 可變動屬性組合數（太大就不值得找種子）
  function space(rarity, name) {
    let n = 1;
    for (const p of propsOf[rarity](name) ?? []) n *= Math.max(1, p.max - p.min + 1);
    return n;
  }
  const newId = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36);

  // 魔法／稀有：用遊戲掉落的同一個函式在指定底材上隨機詞綴，附上 roll 讓遊戲可重現驗證
  function generateAffix(rarity, baseName, free) {
    const base = bases.get(baseName);
    if (!base || !G.__makeAffix) return null;
    const seed = Math.floor(Math.random() * 4294967296);
    const it = G.__seeded(seed, () => G.__makeAffix(base, rarity, ILVL, ILVL));
    if (!it) return null;
    if (free) return { item: it, legit: false };
    it.roll = [1, seed, ILVL];
    return { item: it, legit: true };
  }

  // 產生一件物品；max=true 時所有屬性取最高。回傳 { item, legit }
  // free=true（解除修改限制）：直接取最高值，不找合法種子，也不保留遊戲用來驗證的 stats／roll
  function generate(rarity, name, max, baseName, free) {
    if (!defs[rarity]?.has(name)) return null;
    if (free) {
      const it = max ? pinned(() => make(rarity, name, baseName)) : make(rarity, name, baseName);
      if (!it) return null;
      it.id = newId();
      delete it.roll; // 保留 stats：新版遊戲讀檔會丟掉沒有 stats 的物品
      return { item: it, legit: false, max };
    }
    if (!max) {
      // 隨機（跟掉落一樣）：實測（Insight 批次 8 件）帶 roll 的符文之語讀回時會被遊戲改寫（roll[0] 1→2），造成 seed 故障，
      // 還有法杖技能超過 3 項（StaffMods）。因此每個種子都去掉 roll 後經遊戲的 __itemFault 檢查，只取通過者。
      for (let i = 0; i < SEED_TRIES; i++) {
        const seed = Math.floor(Math.random() * 4294967296), it = seededMake(seed, rarity, name, baseName);
        if (!it) return null;
        delete it.roll;
        if (!G.__itemFault || !G.__itemFault(JSON.parse(JSON.stringify(it)))) return { item: it, legit: true };
      }
      return null;
    }
    const best = pinned(() => make(rarity, name, baseName));
    if (!best) return null;
    const want = key(best);
    // 先找「全部最高」的種子：找得到就跟遊戲掉落的完全一樣（含 roll）。
    // 找不到（屬性組合太多）就用全部最高、保留 stats、不帶 roll：遊戲的合法性檢查一樣通過，讀檔也不會改回去。
    // （不能拿掉 stats：新版遊戲讀檔時會把沒有 stats、屬性又多的物品整件丟掉）
    if (space(rarity, name) <= SEED_MAX_SPACE) {
      for (let i = 0; i < SEED_TRIES; i++) {
        const seed = Math.floor(Math.random() * 4294967296), it = seededMake(seed, rarity, name, baseName);
        if (!it) break;
        if (key(it) === want) return { item: it, legit: true, max: true };
      }
    }
    best.id = newId();
    delete best.roll;
    return { item: best, legit: true, max: true };
  }

  // ---------- 固定品質（暗金／套裝／符文之語）自訂 ----------
  // 遊戲以 stats（原始屬性列）為準重新計算 mods，且只逐列檢查「在該列原版範圍內」。
  // 所以自訂只改 stats 的數值／隨機參數，再交給遊戲自己的整理函式重算 mods，最後用遊戲的檢查確認。
  const clone = (x) => JSON.parse(JSON.stringify(x));
  const cleaned = (it) => { try { return G.__sanitize ? G.__sanitize(clone(it)) : clone(it); } catch (_) { return null; } };
  const staffOf = (it) => (it?.mods ?? []).filter((m) => m.staff);
  function samples(rarity, name, baseName, n, eth) {
    const out = [];
    for (let i = 0; i < n; i++) { const it = seededMake(Math.floor(Math.random() * 4294967296), rarity, name, baseName, eth); if (it) out.push(it); }
    return out;
  }
  function fixedInfo(rarity, name, baseName, eth = false) {
    if (!defs[rarity]?.has(name)) return { error: "找不到這件固定物品" };
    const def = defs[rarity].get(name);
    const base = rarity === "runeword" ? (baseName && bases.get(baseName)) || runewordBase(def) : bases.get(def.base);
    if (!base) return { error: "找不到可用的底材" };
    const lo = pinned(() => make(rarity, name, base.name, eth), 0), hi = pinned(() => make(rarity, name, base.name, eth));
    if (!lo || !hi || !Array.isArray(hi.stats)) return { error: "這件物品沒有可自訂的原始屬性" };
    const n = hi.stats.length, probe = samples(rarity, name, base.name, 16, eth).filter((x) => x.stats?.length === n);
    const varIdx = [];
    for (let i = 0; i < n; i++) if (lo.stats[i]?.stat === hi.stats[i].stat && lo.stats[i].value !== hi.stats[i].value) varIdx.push(i);
    // 同一組屬性共用一次擲值（例如四項屬性相同）：兩端與取樣都完全一致才併成一組
    const groups = [];
    for (const i of varIdx) {
      const g = groups.find((g) => { const j = g.idx[0]; return lo.stats[j].value === lo.stats[i].value && hi.stats[j].value === hi.stats[i].value && probe.every((p) => p.stats[j].value === p.stats[i].value); });
      if (g) g.idx.push(i); else groups.push({ idx: [i], lo: Math.min(lo.stats[i].value, hi.stats[i].value), hi: Math.max(lo.stats[i].value, hi.stats[i].value) });
    }
    const hiC = cleaned(hi);
    for (const g of groups) {
      const t = clone(hi); for (const i of g.idx) t.stats[i].value = g.lo;
      const tc = cleaned(t); g.labels = [];
      if (hiC && tc && tc.mods.length === hiC.mods.length) hiC.mods.forEach((m, k) => { const o = tc.mods[k]; if (o && o.stat === m.stat && o.value !== m.value) g.labels.push({ stat: m.stat, ...(m.implicit && { implicit: true }), hi: m.value, lo: o.value }); });
      g.rawStat = hi.stats[g.idx[0]].stat;
      g.at = hi.stats[g.idx[0]].value;
    }
    // 隨機項目一：stats 的參數每次掉落不同（例如奧瑪斯長袍的隨機技能、地獄火炬的職業）
    const wide = samples(rarity, name, base.name, 500, eth).filter((x) => x.stats?.length === n), params = [];
    for (let i = 0; i < n; i++) {
      const set = new Map();
      for (const p of wide) if (p.stats[i].param !== undefined && !set.has(p.stats[i].param)) set.set(p.stats[i].param, p);
      if (set.size < 2) continue;
      const opts = [...set.entries()].sort((a, b) => a[0] - b[0]);
      const sig = opts.map(([, it]) => (it.mods ?? []).map((m) => m.stat));
      params.push({ index: i, rawStat: hi.stats[i].stat, options: opts.map(([param], k) => ({ param, mods: sig[k].filter((s) => !sig.every((x) => x.includes(s))) })) });
    }
    // 隨機項目二：符文之語的法杖技能（StaffMods，最多 3 項、每項最高 +3）
    let staff = null;
    const staffSeen = new Set();
    for (const p of wide) for (const m of staffOf(p)) staffSeen.add(m.stat);
    if (staffSeen.size) staff = { max: 3, valueMax: 3, options: [...staffSeen].sort() };
    // 隨機項目三：符文之語的底材固有加成（automagic），每次掉落隨機選一列；各列取取樣中數值最高的一組
    let autos = null;
    if (rarity === "runeword") {
      const best = new Map();
      for (const p of wide) {
        const a = (p.mods ?? []).filter((m) => m.auto);
        if (!a.length) continue;
        const sig = a.map((m) => m.stat).sort().join("|"), sum = a.reduce((t, m) => t + (m.value || 0), 0);
        if (!best.has(sig) || best.get(sig).sum < sum) best.set(sig, { sum, mods: a.map(({ stat, value }) => ({ stat, value, auto: true })) });
      }
      if (best.size > 1) autos = [...best.values()].map((x) => ({ mods: x.mods }));
    }
    return { base: base.name, rarity, name, groups, params, staff, autos, canEth: rarity === "runeword", eth: !!eth };
  }
  // spec: { rarity, name, base, eth, values: [{ idx:[...], value }], params: { 索引: 參數 }, staff: [{ stat, value }] }
  function fixedBuild(spec) {
    const { rarity, name } = spec;
    if (!defs[rarity]?.has(name)) return { error: "找不到這件固定物品" };
    const info = fixedInfo(rarity, name, spec.base, spec.eth);
    if (info.error) return info;
    const it = pinned(() => make(rarity, name, info.base, spec.eth));
    if (!it?.stats) return { error: "無法產生這件物品" };
    for (const v of spec.values ?? []) {
      const g = info.groups.find((g) => g.idx.join() === v.idx.join());
      if (!g) return { error: "找不到對應的屬性" };
      const value = Math.round(Number(v.value));
      if (!Number.isFinite(value) || value < g.lo || value > g.hi) return { error: `數值 ${v.value} 超出原版範圍 ${g.lo}～${g.hi}` };
      for (const i of v.idx) it.stats[i].value = value;
    }
    for (const [i, param] of Object.entries(spec.params ?? {})) {
      const p = info.params.find((p) => p.index === Number(i));
      if (!p || !p.options.some((o) => o.param === param)) return { error: "隨機項目不在原版可選範圍" };
      it.stats[Number(i)].param = param;
    }
    if (rarity === "runeword") {
      const list = spec.staff ?? staffOf(it).map(({ stat, value }) => ({ stat, value }));
      if (list.length > 3) return { error: "法杖技能最多 3 項" };
      for (const m of list) if (!info.staff?.options.includes(m.stat) || !Number.isInteger(m.value) || m.value < 1 || m.value > 3) return { error: "法杖技能不在原版可選範圍" };
      it.mods = [...it.mods.filter((m) => !m.staff), ...list.map((m) => ({ stat: m.stat, value: m.value, staff: true }))];
      if (spec.auto !== undefined) {
        const row = info.autos?.[spec.auto];
        if (!row) return { error: "底材固有加成不在原版可選範圍" };
        it.mods = [...it.mods.filter((m) => !m.auto), ...row.mods.map((m) => ({ ...m }))];
      }
    }
    delete it.roll; it.id = newId();
    const out = cleaned(it);
    if (!out) return { error: "遊戲不接受這組屬性" };
    const bad = G.__itemFault ? G.__itemFault(clone(out)) : null;
    if (bad) return { error: `遊戲判定不合規則：${bad.why ?? bad.fault}` };
    return { item: out };
  }

  // 詞綴比對：回傳每個詞綴可涵蓋的屬性列（含 alike／also 複合屬性）
  function affixMatches(base, rarity, mods) {
    return G.__affixes.filter(a => G.__affixApplies(a, base, a.cls) && !(rarity === "rare" && a.d2?.magicOnly)).flatMap(a => {
      const out = [];
      for (let i = 0; i < mods.length; i++) {
        const m = mods[i], d = a.d2 ?? {}, alike = d.alike ?? [];
        if (m.stat !== a.stat || typeof m.value !== "number" || m.value < a.min || m.value > a.max || m.length !== d.length) continue;
        const used = [i]; let valid = true;
        for (const stat of alike) {
          const j = mods.findIndex((x, n) => !used.includes(n) && x.stat === stat && x.value === m.value);
          if (j < 0) { valid = false; break; } used.push(j);
        }
        if (!valid) continue;
        if (!d.also) { out.push({ affix: a, used }); continue; }
        // 同一屬性可能出現多組（例如兩個閃電傷害詞綴），每個可能的搭配都列出
        mods.forEach((x, j) => { if (!used.includes(j) && x.stat === d.also.stat && x.value >= d.also.min && x.value <= d.also.max) out.push({ affix: a, used: [...used, j] }); });
      }
      return out;
    });
  }
  // 原版規則（Diablo II）：魔法最多 1 前綴 + 1 後綴；稀有 2～6 個詞綴（Arreat Summit 官方說明）、前後綴各最多 3 個；稀有珠寶最多 4 個；同群組不可重複
  const AFFIX_LIMIT = { magic: { pre: 1, suf: 1, min: 1, max: 2 }, rare: { pre: 3, suf: 3, min: 2, max: 6 }, rareJewel: { pre: 3, suf: 3, min: 2, max: 4 } };
  const limitOf = (base, rarity) => AFFIX_LIMIT[rarity === "rare" && (base.type === "jewel" || base.itype === "jewl") ? "rareJewel" : rarity];
  // 遊戲將職業限定技能詞綴歸入 prefix:125；複合詞綴依實際指派計為一個。
  const affixGroup = a => a.kind === "prefix" && a.cls ? "prefix:125" : (a.d2?.group ?? "n:" + a.name);
  function affixPlan(base, rarity, mods) {
    const lim = limitOf(base, rarity), matches = affixMatches(base, rarity, mods);
    const covered = new Array(mods.length).fill(false), groups = new Set(), pick = [];
    let pre = 0, suf = 0;
    const dfs = () => {
      const i = covered.indexOf(false);
      if (i < 0) return pick.length >= lim.min && pick.length <= lim.max;
      for (const x of matches) {
        if (!x.used.includes(i) || x.used.some(j => covered[j])) continue;
        const isPre = x.affix.kind === "prefix", g = affixGroup(x.affix);
        if ((isPre ? pre >= lim.pre : suf >= lim.suf) || groups.has(g)) continue;
        x.used.forEach(j => covered[j] = true); groups.add(g); pick.push(x); isPre ? pre++ : suf++;
        if (dfs()) return true;
        x.used.forEach(j => covered[j] = false); groups.delete(g); pick.pop(); isPre ? pre-- : suf--;
      }
      return false;
    };
    return dfs() ? pick.map(x => x.affix) : null;
  }
  // 底材固有屬性：以遊戲產生器取樣
  const implicitCache = new Map();
  function baseImplicits(base) {
    if (implicitCache.has(base.name)) return implicitCache.get(base.name);
    const r = {};
    for (let i = 0; i < 6 || (i < 400 && Object.keys(r).some(k => r[k].auto)); i++) {
      const it = G.__seeded(Math.floor(Math.random() * 4294967296), () => G.__makeAffix(base, "magic", ILVL, ILVL));
      for (const m of it?.mods ?? []) if (m.implicit || m.auto) {
        const k = m.stat, v = r[k] ??= [m.value, m.value];
        if (m.auto) v.auto = true;
        v[0] = Math.min(v[0], m.value); v[1] = Math.max(v[1], m.value);
      }
    }
    implicitCache.set(base.name, r);
    return r;
  }
  // 固定品質：屬性種類、數量與每項上下限都必須與物品定義相符
  function fixedProblems(rarity, def, base, item) {
    const low = pinned(() => make(rarity, def.name, base.name), 0), high = pinned(() => make(rarity, def.name, base.name));
    if (!low || !high) return ["error.generate"];
    const out = [], remaining = (item.mods ?? []).filter(m => !m.auto && !m.staff);
    // 符文之語的法杖技能（StaffMods）：最多 3 項、單一技能、每項最高 +3（遊戲規則）
    const staff = (item.mods ?? []).filter(m => m.staff);
    if (staff.length && item.rarity !== "runeword") out.push({ code: "extra", stat: staff[0].stat });
    if (staff.length > 3) out.push({ code: "error", why: "法杖技能超過 3 項" });
    for (const m of staff) if (!/^skill:[A-Za-z]+$/.test(m.stat) || !Number.isInteger(m.value) || m.value < 1 || m.value > 3) out.push({ code: "range", stat: m.stat, value: m.value, min: 1, max: 3 });
    // 職業底材的固有詞綴可隨機選擇不同組合，不能用最低與最高擲值的陣列索引配對。
    const autoMods = (item.mods ?? []).filter(m => m.auto), autoSeen = new Set();
    if (autoMods.length && !G.__makeAffix) return [{ code: "error", why: "缺少遊戲詞綴產生器，無法驗證職業底材屬性。" }];
    const autoRanges = autoMods.length ? baseImplicits(base) : {};
    if (!autoMods.length && low.mods.some(m => m.auto) && high.mods.some(m => m.auto)) out.push({ code: "error", why: "職業底材缺少固有屬性，無法驗證。" });
    for (const m of autoMods) {
      const r = autoRanges[m.stat];
      if (!r?.auto || autoSeen.has(m.stat)) out.push({ code: "implicit", stat: m.stat });
      else if (!(m.value > 0 && m.value <= Math.ceil(r[1] * 1.05))) out.push({ code: "range", stat: m.stat, value: m.value, min: r[0], max: r[1] });
      autoSeen.add(m.stat);
    }
    // 無形物品：底材防禦與基礎傷害提高（最多 1.5 倍）
    const eth = item.ethereal ? 1.5 : 1;
    const lowFixed = low.mods.filter(m => !m.auto), highFixed = high.mods.filter(m => !m.auto);
    lowFixed.forEach((m, i) => {
      const h = highFixed[i];
      if (!h) { out.push({ code: "error", why: "遊戲產生的固定屬性不一致，無法驗證。" }); return; }
      const lo = Math.min(m.value, h.value), hi = Math.max(m.value, h.value) * (m.implicit && typeof m.value === "number" ? eth : 1) + (m.implicit && eth > 1 ? 1 : 0);
      // 隨機技能類屬性（例如奧瑪斯長袍）每次產生的技能不同：只要同一類即可
      const classSkill = (s) => /^classskills\d+$/.test(s), kind = (s) => classSkill(s) ? "classskills" : s.split(":")[0], random = m.stat !== h?.stat && (m.stat.includes(":") || classSkill(m.stat));
      // 觸發／充能技能的等級隨物品等級變化（例如 proc:struck:blizzard:20 → 低等級掉落為 16）：同技能、等級不超過原版最高即可
      const lv = /^(proc|charge):(.+):(\d+)$/.exec(m.stat), lvOk = (x) => { const k = /^(proc|charge):(.+):(\d+)$/.exec(x.stat); return k && k[1] === lv[1] && k[2] === lv[2] && Number(k[3]) >= 1 && Number(k[3]) <= Number(lv[3]); };
      const same = remaining.filter(x => (random ? kind(x.stat) === kind(m.stat) : lv ? lvOk(x) : x.stat === m.stat) && !!x.implicit === !!m.implicit);
      if (!same.length) return out.push({ code: "missing", stat: m.stat });
      const j = remaining.indexOf(same.find(x => typeof m.value === "number" ? x.value >= lo - 1e-9 && x.value <= hi + 1e-9 : x.value === m.value) ?? same[0]);
      const x = remaining[j];
      if (typeof m.value === "number" ? !(x.value >= lo - 1e-9 && x.value <= hi + 1e-9) : x.value !== m.value) out.push({ code: "range", stat: m.stat, value: x.value, min: lo, max: hi });
      remaining.splice(j, 1);
    });
    for (const x of remaining) out.push({ code: "extra", stat: x.stat });
    if (typeof item.defense === "number" && typeof low.defense === "number") {
      const lo = Math.min(low.defense, high.defense), hi = Math.ceil(Math.max(low.defense, high.defense) * eth);
      if (item.defense < lo || item.defense > hi) out.push({ code: "defense", value: item.defense, min: lo, max: hi });
    }
    return out;
  }
  // 編輯中（尚未完成）的詞綴組合：複合詞綴可以只出現一部分，數量只看上限
  function partialFeasible(base, rarity, mods) {
    const lim = limitOf(base, rarity);
    const list = G.__affixes.filter(a => G.__affixApplies(a, base, a.cls) && !(rarity === "rare" && a.d2?.magicOnly));
    const matches = [];
    for (const a of list) {
      const d = a.d2 ?? {}, parts = [[a.stat, a.min, a.max, d.length], ...(d.alike ?? []).map(s => [s, a.min, a.max]), ...(d.also ? [[d.also.stat, d.also.min, d.also.max]] : [])];
      const opts = parts.map(([s, lo, hi, len]) => [-1, ...mods.map((m, i) => i).filter(i => mods[i].stat === s && (!mods[i].kind || mods[i].kind === a.kind) && typeof mods[i].value === "number" && mods[i].value >= lo && mods[i].value <= hi && (len === undefined || mods[i].length === undefined || mods[i].length === len))]);
      const walk = (k, used) => {
        if (k === parts.length) { const u = used.filter(i => i >= 0); const equal = used.slice(0, 1 + (d.alike?.length ?? 0)).filter(i => i >= 0).map(i => mods[i].value); if (u.length && new Set(u).size === u.length && new Set(equal).size <= 1) matches.push({ affix: a, used: u }); return; }
        for (const i of opts[k]) walk(k + 1, [...used, i]);
      };
      walk(0, []);
    }
    const covered = new Array(mods.length).fill(false), groups = new Set();
    let pre = 0, suf = 0, n = 0;
    const dfs = () => {
      const i = covered.indexOf(false);
      if (i < 0) return n <= lim.max;
      for (const x of matches) {
        if (!x.used.includes(i) || x.used.some(j => covered[j])) continue;
        const isPre = x.affix.kind === "prefix", g = affixGroup(x.affix);
        if ((isPre ? pre >= lim.pre : suf >= lim.suf) || groups.has(g) || n >= lim.max) continue;
        x.used.forEach(j => covered[j] = true); groups.add(g); isPre ? pre++ : suf++; n++;
        if (dfs()) return true;
        x.used.forEach(j => covered[j] = false); groups.delete(g); isPre ? pre-- : suf--; n--;
      }
      return false;
    };
    return dfs();
  }
  // 查詢物品詞綴欄位上限、目前指派已用數量與可用屬性的前後綴歸屬
  function affixSlots(item, mods = []) {
    const empty = { limit: null, used: { pre: 0, suf: 0 }, kinds: {} };
    if (!item || typeof item !== "object") return empty;
    const base = bases.get(item.base || item.name);
    if (!base || !["magic", "rare"].includes(item.rarity)) return empty;
    const lim = limitOf(base, item.rarity);
    if (!lim) return empty;
    const limit = item.rarity === "rare" && base.type === "charm"
      ? { pre: 0, suf: 0, max: 0 } : { pre: lim.pre, suf: lim.suf, max: lim.max };
    if (limit.max === 0) return { limit, used: { pre: 0, suf: 0 }, kinds: {} };

    // 此底材與品質可用的詞綴屬性（排除稀有不可用的 magicOnly）
    const affixes = (G.__affixes ?? []).filter(a => G.__affixApplies?.(a, base, a.cls) && !(item.rarity === "rare" && a.d2?.magicOnly));
    const kinds = {};
    for (const a of affixes) {
      const k = a.kind;
      if (!k) continue;
      const statsInA = [a.stat, ...(a.d2?.alike ?? []), ...(a.d2?.also?.stat ? [a.d2.also.stat] : [])];
      for (const s of statsInA) {
        if (!s) continue;
        if (!kinds[s]) kinds[s] = k;
        else if (kinds[s] !== k) kinds[s] = "both";
      }
    }

    // 依目前 mods 以可行指派推算已用前綴與後綴數量
    const free = (mods ?? []).filter(m => m && !m.implicit && !m.auto);
    if (!free.length) return { limit, used: { pre: 0, suf: 0 }, kinds };

    const withStat = free.filter(m => m.stat);
    const emptyPre = free.filter(m => !m.stat && m.kind === "prefix").length;
    const emptySuf = free.filter(m => !m.stat && m.kind === "suffix").length;

    const matches = [];
    for (const a of affixes) {
      const d = a.d2 ?? {};
      const parts = [[a.stat, a.min, a.max, d.length], ...(d.alike ?? []).map(s => [s, a.min, a.max]), ...(d.also ? [[d.also.stat, d.also.min, d.also.max]] : [])];
      const opts = parts.map(([s, lo, hi, len]) => [
        -1,
        ...withStat.map((m, i) => i).filter(i => {
          const m = withStat[i];
          if (m.stat !== s) return false;
          if (m.kind && m.kind !== a.kind) return false;
          if (len !== undefined && m.length !== undefined && m.length !== len) return false;
          if (typeof m.value === "number" && Number.isFinite(m.value)) {
            if (m.value < lo || m.value > hi) return false;
          }
          return true;
        })
      ]);
      const walk = (k, used) => {
        if (k === parts.length) {
          const u = used.filter(i => i >= 0);
          const equal = used.slice(0, 1 + (d.alike?.length ?? 0)).filter(i => i >= 0).map(i => withStat[i].value);
          if (u.length && new Set(u).size === u.length && new Set(equal).size <= 1) matches.push({ affix: a, used: u });
          return;
        }
        for (const i of opts[k]) walk(k + 1, [...used, i]);
      };
      walk(0, []);
    }

    const covered = new Array(withStat.length).fill(false), groups = new Set();
    let pre = 0, suf = 0, n = 0;
    let best = { pre: 0, suf: 0, count: -1 };

    const dfs = () => {
      const count = covered.filter(Boolean).length;
      if (count > best.count) {
        best = { pre, suf, count };
      }
      const i = covered.indexOf(false);
      if (i < 0) return n <= lim.max;
      for (const x of matches) {
        if (!x.used.includes(i) || x.used.some(j => covered[j])) continue;
        const isPre = x.affix.kind === "prefix", g = affixGroup(x.affix);
        if ((isPre ? pre >= lim.pre : suf >= lim.suf) || groups.has(g) || n >= lim.max) continue;
        x.used.forEach(j => covered[j] = true); groups.add(g); isPre ? pre++ : suf++; n++;
        if (dfs()) return true;
        x.used.forEach(j => covered[j] = false); groups.delete(g); isPre ? pre-- : suf--; n--;
      }
      return false;
    };

    const ok = dfs();
    let resPre = (ok ? pre : best.pre) + emptyPre;
    let resSuf = (ok ? suf : best.suf) + emptySuf;

    if (!ok) {
      const explicitPre = emptyPre + withStat.filter(m => m.kind === "prefix" || (!m.kind && kinds[m.stat] === "prefix")).length;
      const explicitSuf = emptySuf + withStat.filter(m => m.kind === "suffix" || (!m.kind && kinds[m.stat] === "suffix")).length;
      resPre = Math.max(resPre, explicitPre);
      resSuf = Math.max(resSuf, explicitSuf);
    }

    return {
      limit,
      used: { pre: resPre, suf: resSuf },
      kinds
    };
  }
  // 在目前屬性之外，依原版規則還能加入哪些屬性：[{ stat, implicit, value }]（value 為建議值＝原版最大值）
  function allowedStats(item, mods) {
    const base = bases.get(item.base);
    if (!base) return [];
    const out = [], add = (stat, implicit, value, length) => {
      const x = out.find(x => x.stat === stat && x.implicit === implicit);
      if (!x) out.push({ stat, implicit, value, ...(length !== undefined && { length }) });
      else if (typeof value === "number" && value > x.value) { x.value = value; if (length !== undefined) x.length = length; }
    };
    if (defs[item.rarity]) {
      // 指定物品時只看它；訂製時（尚無名稱）看此底材所有仍符合目前屬性的固定物品
      const named = defs[item.rarity].get(item.name);
      const list = named ? [named] : [...defs[item.rarity].values()].filter(d => item.rarity === "runeword"
        ? d.types.some(t => G.__isType(base.itype, t)) && !d.excluded?.some(t => G.__isType(base.itype, t)) && Math.max(...(stats.bases[base.name]?.sockets ?? [0])) >= d.runes.length
        : d.base === base.name);
      for (const def of list) {
        let high; try { high = pinned(() => make(item.rarity, def.name, base.name)); } catch { continue; }
        const remaining = [...mods], left = [];
        for (const m of high?.mods ?? []) {
          const j = remaining.findIndex(x => x.stat === m.stat && !!x.implicit === !!m.implicit);
          if (j >= 0) remaining.splice(j, 1); else left.push(m);
        }
        if (remaining.length) continue; // 目前屬性已不屬於這件物品
        for (const m of left) add(m.stat, !!m.implicit, m.value);
      }
      return out;
    }
    const imp = baseImplicits(base);
    for (const [stat, r] of Object.entries(imp)) if (!mods.some(m => m.stat === stat && (m.implicit || m.auto))) add(stat, true, r[1]);
    if (!AFFIX_LIMIT[item.rarity]) return out;
    const free = mods.filter(m => !m.implicit && !m.auto);
    if (!partialFeasible(base, item.rarity, free)) return out;
    for (const a of G.__affixes.filter(a => G.__affixApplies(a, base, a.cls) && !(item.rarity === "rare" && a.d2?.magicOnly) && (!item.requestKind || a.kind === item.requestKind))) {
      const d = a.d2 ?? {};
      for (const [stat, max, len] of [[a.stat, a.max, d.length], ...(d.alike ?? []).map(s => [s, a.max]), ...(d.also ? [[d.also.stat, d.also.max]] : [])]) {
        const linked = [a.stat, ...(d.alike ?? [])];
        const values = linked.includes(stat) ? [max, ...free.filter(m => linked.includes(m.stat) && m.value >= a.min && m.value <= a.max).map(m => m.value)] : [max];
        for (const value of new Set(values)) if (partialFeasible(base, item.rarity, [...free, { stat, value, ...(item.requestKind && { kind: item.requestKind }), ...(len !== undefined && { length: len }) }])) add(stat, false, value, len);
      }
    }
    return out;
  }
  // 依原版規則檢查一件物品；回傳問題清單（空陣列 = 合理）
  function validate(item) {
    const out = [];
    if (!item || typeof item !== "object") return [{ code: "format" }];
    if (item.type === "quest" || ["rune", "gem", "quest"].includes(bases.get(item.base)?.type)) return out;
    const base = bases.get(item.base);
    // 特殊物品（例如 Wirt's Leg）不在底材表：沒有屬性就放行
    if (!base) return defs[item.rarity]?.has(item.name) || !item.base || (item.base === item.name && !(item.mods ?? []).length) ? out : [{ code: "base" }];
    if (base.type !== item.type && item.type) out.push({ code: "type" });
    const mods = item.mods ?? [];
    if (mods.some(m => typeof m.value === "number" && !Number.isFinite(m.value))) out.push({ code: "nan" });
    if (defs[item.rarity]) {
      const def = defs[item.rarity].get(item.name);
      if (!def) return [...out, { code: "name" }];
      const okBase = item.rarity === "runeword"
        ? def.types.some(t => G.__isType(base.itype, t)) && !def.excluded?.some(t => G.__isType(base.itype, t)) && Math.max(...(stats.bases[base.name]?.sockets ?? [0])) >= def.runes.length
        : def.base === base.name;
      if (!okBase) return [...out, { code: "defBase" }];
      return [...out, ...fixedProblems(item.rarity, def, base, item)];
    }
    if (!["normal", "magic", "rare"].includes(item.rarity)) return [...out, { code: "rarity" }];
    if (item.rarity === "normal" && (base.type === "ring" || base.type === "amulet" || base.type === "charm" || base.itype === "circ")) out.push({ code: "normalBase" });
    if (item.rarity === "rare" && base.type === "charm") out.push({ code: "rareCharm" });
    const imp = baseImplicits(base), seen = new Set();
    for (const m of mods.filter(m => m.implicit || m.auto)) {
      const r = imp[m.stat];
      if (!r || seen.has(m.stat)) out.push({ code: "implicit", stat: m.stat });
      else if (r.auto ? !(m.value > 0 && m.value <= Math.ceil(r[1] * 1.05)) : !(m.value >= r[0] && m.value <= r[1])) out.push({ code: "range", stat: m.stat, value: m.value, min: r[0], max: r[1] });
      seen.add(m.stat);
    }
    const free = mods.filter(m => !m.implicit && !m.auto);
    if (item.rarity === "normal") { if (free.length) out.push({ code: "normalMods" }); return out; }
    if (!affixPlan(base, item.rarity, free)) {
      const ranges = this?.affixInfo?.(base.name, item.rarity)?.ranges ?? {};
      for (const m of free) {
        const list = ranges[m.stat];
        if (!list) out.push({ code: "affixStat", stat: m.stat });
        else if (!list.some(([a, b]) => m.value >= a && m.value <= b)) out.push({ code: "range", stat: m.stat, value: m.value, min: Math.min(...list.map(r => r[0])), max: Math.max(...list.map(r => r[1])) });
      }
      out.push({ code: "affixCombo", rarity: item.rarity });
    }
    return out;
  }

  return {
    capabilities(gameScript = gameIdentity.gameScript) {
      return { supported: true, gameScript: gameScript || null, weaponSets: typeof G.__weaponSetActive === "function" };
    },
    // 依原版規則檢查物品（未解除限制時使用）；回傳每件物品的問題清單
    // 屬性下拉選單用：modsList 每一組是「其他列的屬性」，回傳每組還能加入的屬性
    // 取得詞綴欄位上限、目前指派已用數量與可用屬性前後綴歸屬
        affixSlots(item, mods) {
          return affixSlots(item, mods);
        },
        allowedStatsMany(item, modsList) {
      return modsList.map(mods => { try { return allowedStats(item, mods); } catch (e) { return null; } });
    },
    validateItems(items) {
      return items.map(it => { try { return validate.call(this, it); } catch (e) { return [{ code: "error", why: String(e.message ?? e) }]; } });
    },
    // 全部可收藏的物品清單：{ rarity, name, base, type, lvl }
    catalog() {
      const out = [];
      for (const d of G.__uniques) out.push({ rarity: "unique", name: d.name, base: d.base, type: bases.get(d.base)?.type, lvl: d.lvl });
      for (const d of G.__sets) out.push({ rarity: "set", name: d.name, base: d.base, type: bases.get(d.base)?.type, lvl: d.lvl, set: d.set });
      // 網頁版「網站提供遊戲資料」模式的物品資料沒有符文之語，遊戲本身在這個模式也做不出來
      const rwOk = !!stats.runewords && !!stats.runes;
      // 符文之語的收藏單位是「名稱＋底材類型」：遊戲對每個類型各收一次（G.__runewordKinds 與遊戲的 r(name) 相同）
      for (const d of G.__runewords) {
        if (!rwOk) { out.push({ rarity: "runeword", name: d.name, base: d.types?.[0], type: "weapon", lvl: d.lvl, unavailable: true }); continue; }
        for (const kind of G.__runewordKinds(d.name)) {
          const b = runewordBase(d, kind);
          if (b) out.push({ rarity: "runeword", name: d.name, base: b.name, type: b.type, lvl: d.lvl, kind });
        }
      }
      return out;
    },
    // 底材名稱 → 底材類型（收藏頁用來判斷已收藏的符文之語屬於哪一類）
    kindMap() {
      return Object.fromEntries(G.__bases.map((b) => [b.name, kindOf(b)]));
    },
    // list: [{ rarity, name, base? }]
    // 產生後再用遊戲讀檔時的整理函式檢查一次，遊戲會丟掉的就不交出去
    generateMany(list, max) {
      return list.map((x) => {
        try {
          const r = x.rarity === "magic" || x.rarity === "rare" ? generateAffix(x.rarity, x.base, x.free) : generate(x.rarity, x.name, x.max ?? max, x.base, x.free);
          if (r?.item && G.__sanitize && !G.__sanitize(JSON.parse(JSON.stringify(r.item)))) return { rejected: true, name: x.name, rarity: x.rarity };
          return r ?? { failed: true, name: x.name, rarity: x.rarity };
        } catch (e) { return { error: String(e.message ?? e), name: x.name, rarity: x.rarity }; }
      });
    },
    // 使用遊戲產生器取得此物品各屬性的最高擲值；其他品質沒有固定的物品上限。
    itemModMax(item) {
      if (!defs[item?.rarity]?.has(item.name)) return null;
      const low = pinned(() => make(item.rarity, item.name, item.base), 0);
      const high = pinned(() => make(item.rarity, item.name, item.base));
      if (!low || !high) return null;
      const collect = (it) => {
        const out = {};
        for (const m of it.mods ?? []) {
          if (typeof m.value !== "number" || !Number.isFinite(m.value)) continue;
          const key = `${m.implicit ? "1" : "0"}:${m.stat}`;
          (out[key] ??= []).push(m.value);
        }
        return out;
      };
      const mins = collect(low), maxs = collect(high), values = {};
      for (const [key, list] of Object.entries(maxs)) values[key] = list.map((max, i) => {
        const min = mins[key]?.[i];
        return min === undefined ? null : [Math.min(min, max), Math.max(min, max)];
      });
      return values;
    },
    affixInfo(baseName, rarity, mods = []) {
      const base = bases.get(baseName);
      if (!base || !G.__affixes || !G.__affixApplies) return null;
      const affixes = G.__affixes.filter(a => G.__affixApplies(a, base, a.cls) && !(rarity === "rare" && a.d2?.magicOnly));
      const ranges = {}, byKind = { prefix: {}, suffix: {} };
      const add = (stat, min, max, kind) => {
        if (!stat || !Number.isFinite(min) || !Number.isFinite(max)) return;
        (ranges[stat] ??= []).push([min, max]);
        if (byKind[kind]) (byKind[kind][stat] ??= []).push([min, max]);
      };
      for (const a of affixes) {
        add(a.stat, a.min, a.max, a.kind);
        for (const stat of a.d2?.alike ?? []) add(stat, a.min, a.max, a.kind);
        if (a.d2?.also) add(a.d2.also.stat, a.d2.also.min, a.d2.also.max, a.kind);
      }
      const combinations = affixes.map(a => ({ kind: a.kind, stat: a.stat, min: a.min, max: a.max, alike: a.d2?.alike ?? [], also: a.d2?.also ?? null }));
      return { ranges, byKind, combinations };
    },
    // 統一的屬性範圍資料庫：固定品質物品用遊戲產生器的上下限，其餘依底材可用詞綴。
    // 回傳 { fixed: { "implicit:stat": [[min,max],...] } | null, affix: { stat: [[min,max],...] } }
    statRanges(item) {
      let fixed = null;
      try { fixed = this.itemModMax(item); } catch (_) {}
      const info = this.affixInfo(item?.base, item?.rarity);
      const base = bases.get(item?.base);
      let implicit = {};
      if (base && G.__makeAffix) { try { implicit = baseImplicits(base); } catch (_) {} }
      return { fixed, implicit, affix: info?.ranges ?? {}, affixByKind: info?.byKind ?? {} };
    },
    // 依遊戲的詞綴組合規則推導名稱；無法唯一確定時不猜測。
    resolveName(item) {
      const base = bases.get(item.base);
      if (!base) return { error: "找不到指定底材。" };
      if (item.rarity === "normal") {
        if (base.type === "ring" || base.type === "amulet" || base.type === "charm" || base.itype === "circ")
          return { error: "遊戲不會產生此底材的普通品質物品。" };
        return { name: base.name };
      }
      if (item.rarity === "rare") {
        if (item.name && item.previousRarity === "rare") return { name: item.name };
        const generated = generateAffix("rare", base.name, true)?.item;
        return generated?.rarity === "rare" ? { name: generated.name } : { error: "遊戲無法為此底材產生稀有名稱。" };
      }
      if (item.rarity === "magic") {
        if (!G.__affixes || !G.__affixApplies) return { error: "遊戲詞綴資料不可用。" };
        const mods = (item.mods ?? []).filter(m => !m.implicit && !m.auto);
        const matches = G.__affixes.filter(a => G.__affixApplies(a, base, a.cls)).flatMap(a => {
          const out = [];
          for (let i = 0; i < mods.length; i++) {
            const m = mods[i], d = a.d2 ?? {}, alike = d.alike ?? [];
            if (m.stat !== a.stat || m.value < a.min || m.value > a.max || m.length !== d.length) continue;
            const used = [i]; let valid = true;
            for (const stat of alike) {
              const j = mods.findIndex((x, n) => !used.includes(n) && x.stat === stat && x.value === m.value);
              if (j < 0) { valid = false; break; } used.push(j);
            }
            if (valid && d.also) {
              const j = mods.findIndex((x, n) => !used.includes(n) && x.stat === d.also.stat && x.value >= d.also.min && x.value <= d.also.max);
              if (j < 0) valid = false; else used.push(j);
            }
            if (valid) out.push({ affix: a, used });
          }
          return out;
        });
        const prefixes = [null, ...matches.filter(x => x.affix.kind === "prefix")];
        const suffixes = [null, ...matches.filter(x => x.affix.kind === "suffix")];
        const names = new Set();
        for (const p of prefixes) for (const q of suffixes) {
          if (!p && !q) continue;
          const indices = [...(p?.used ?? []), ...(q?.used ?? [])];
          if (indices.length !== mods.length || new Set(indices).size !== mods.length) continue;
          names.add([p?.affix.name, base.name, q?.affix.name].filter(Boolean).join(" "));
        }
        if (names.has(item.name) && item.previousRarity === "magic") return { name: item.name };
        if (names.size === 1) return { name: [...names][0] };
        return { error: names.size ? "這組屬性對應多個遊戲詞綴名稱，無法唯一決定名稱。" : "這組屬性無法對應遊戲的魔法詞綴名稱。" };
      }
      const entries = defs[item.rarity];
      if (!entries) return { error: "不支援的物品品質。" };
      const compatible = (def) => item.rarity === "runeword"
        ? def.types.some(t => G.__isType(base.itype, t)) && !def.excluded?.some(t => G.__isType(base.itype, t))
        : def.base === base.name;
      const existing = entries.get(item.name);
      if (existing && item.previousRarity === item.rarity && compatible(existing)) return { name: existing.name };
      const signature = (mods) => (mods ?? []).map(m => `${m.implicit ? 1 : 0}:${m.stat}`).sort().join("|");
      const wanted = signature(item.mods), candidates = [];
      for (const def of entries.values()) {
        if (!compatible(def)) continue;
        try {
          const low = pinned(() => make(item.rarity, def.name, base.name), 0);
          const high = pinned(() => make(item.rarity, def.name, base.name));
          if (!low || !high || signature(low.mods) !== wanted || signature(high.mods) !== wanted) continue;
          const remaining = [...(item.mods ?? [])];
          const ok = low.mods.every((m, i) => {
            const h = high.mods[i];
            if (!h || m.stat !== h.stat || !!m.implicit !== !!h.implicit) return false;
            const j = remaining.findIndex(x => x.stat === m.stat && !!x.implicit === !!m.implicit &&
              (typeof m.value === "number" && typeof h.value === "number" ? x.value >= Math.min(m.value, h.value) && x.value <= Math.max(m.value, h.value) : x.value === m.value));
            if (j < 0) return false; remaining.splice(j, 1); return true;
          });
          if (ok) candidates.push(def.name);
        } catch (_) {}
      }
      if (candidates.length === 1) return { name: candidates[0] };
      return { error: candidates.length ? "這組屬性符合多件固定物品，無法唯一決定名稱。" : "這組屬性不符合任何可辨識的固定物品，無法決定名稱。" };
    },
    // 製作裝備用：全部底材（含部位與需求等級）
    affixOk() { return !!G.__makeAffix; },
    // 恰西強化：{ key: { name, maxRank, endless } }；遊戲讀檔時 ranks 會被限制在 maxRank，額外強化只對 endless 項目、且 ranks 已滿時有效（最多 999）
    rankDefs() {
      if (!G.__rankDefs) return null;
      return Object.fromEntries(Object.entries(G.__rankDefs).map(([k, d]) => [k, { name: d.name, maxRank: d.maxRank, endless: !!d.endless, baseCost: d.baseCost }]));
    },
    // 技能修改：{ 職業: [{ id, name, passive, options: [{ id, name, describe }] }] }，只列該職業有、且有修改選項的技能（跟遊戲的檢查一樣）
    skillModDefs(classes) {
      if (!G.__classKits || !G.__modDefs) return null;
      const out = {};
      for (const c of classes) {
        const kit = G.__classKits[c];
        if (!kit) continue;
        const list = [];
        for (const [passive, defs] of [[false, kit.skills], [true, kit.passives]])
          for (const [id, d] of Object.entries(defs ?? {})) {
            const opts = G.__modDefs[id];
            if (opts?.length) list.push({ id, name: d?.name ?? id, passive, options: opts.map((o) => ({ id: o.id, name: o.name, describe: o.describe })) });
          }
        out[c] = list;
      }
      return out;
    },
    bases() { return G.__bases.map((b) => ({ name: b.name, type: b.type, itype: b.itype, level: b.level ?? 0, size: b.size, sockets: stats.bases[b.name]?.sockets ?? null })); },
    // 可以做成這個符文之語的底材
    fixedInfo(rarity, name, baseName, eth) { try { return fixedInfo(rarity, name, baseName, eth); } catch (e) { return { error: String(e.message ?? e) }; } },
    fixedBuild(spec) { try { return fixedBuild(spec); } catch (e) { return { error: String(e.message ?? e) }; } },
    runewordBases(name) {
      const def = defs.runeword.get(name);
      if (!def) return [];
      return G.__bases.filter((b) => def.types.some((t) => G.__isType(b.itype, t)) && !def.excluded?.some((t) => G.__isType(b.itype, t))
        && Math.max(...(stats.bases[b.name]?.sockets ?? [0])) >= def.runes.length).map((b) => b.name);
    },
    // 用遊戲自己的檢查：回傳每件物品的問題（null 為合法）；這個版本找不到檢查函式時回傳 null
    faults(items) {
      if (!G.__itemFault) return null;
      return items.map((it) => { try { return G.__itemFault(JSON.parse(JSON.stringify(it))); } catch (e) { return { why: String(e.message ?? e) }; } });
    },
    // 遊戲讀檔時的整理結果（與遊戲 sanitize 相同）；失敗回傳 null
    sanitizeItem(it) { if (!G.__sanitize) return null; try { const c = JSON.parse(JSON.stringify(it)); return G.__sanitize(c) ? c : null; } catch (e) { return null; } },
    saveFaults(save) { if (!G.__saveFaults) return null; try { return G.__saveFaults(save, 50); } catch (e) { return [String(e.message ?? e)]; } },
  };
}
