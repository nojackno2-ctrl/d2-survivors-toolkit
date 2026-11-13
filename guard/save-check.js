// 存檔檢查與遊戲診斷純邏輯模組（ES module，不依賴 DOM，供 guard.html、editor.html 與 Node 測試共用）
export const TESTED_GAME_BUILD = "20261105.3";
export const LOCALE = "zh-TW";
export const CLASSES = ["amazon", "sorceress", "necromancer", "paladin", "barbarian", "druid", "assassin"];
export const CLASS_ZH = {
  amazon: "亞馬遜",
  sorceress: "魔法使",
  necromancer: "死靈法師",
  paladin: "聖騎士",
  barbarian: "野蠻人",
  druid: "德魯伊",
  assassin: "刺客",
};
export const SLOT_ZH = {
  weapon: "武器",
  shield: "副手",
  head: "頭盔",
  body: "盔甲",
  gloves: "手套",
  belt: "腰帶",
  boots: "鞋子",
  amulet: "護身符",
  ring1: "戒指1",
  ring2: "戒指2",
};
export const GRID = { stash: [10, 12], inventory: [10, 4], charms: [5, 4] };

// 遊戲診斷訊息的每個項目（來源：遊戲 C.fact／z.fact 登記）；key 為診斷訊息中的欄位名
export const DIAG_FACTS = {
  build: "遊戲版本與組建編號",
  app: "網頁版（網址）或桌面版",
  browser: "瀏覽器 User-Agent",
  screen: "視窗與螢幕尺寸、像素比",
  memory: "JS 記憶體與裝置記憶體",
  uptime: "頁面已開啟時間",
  page: "頁面環境：偵測 d2_zh.js 中文化書籤，以及 7 個瀏覽器原生函式是否被替換（WeakMap.get、Storage.setItem、drawImage、putImageData、addEventListener、requestAnimationFrame、devicePixelRatio）",
  desktop: "桌面版資訊",
  "last session": "上一次工作階段如何結束",
  "lighter start": "上次在局中當掉後以較輕設定啟動",
  run: "目前的局（職業、難度、幕、等級、怪物數）",
  "game files": "遊戲檔案來源（hosted／桌面）",
  menus: "選單樣式",
  fonts: "字型載入",
  "skipped game files": "略過的遊戲檔案",
  store: "商店樣式",
  sound: "音效狀態",
  steering: "操控狀態",
  death: "上次死亡原因",
  "monster art": "怪物圖片記憶體",
  textures: "GPU 貼圖記憶體",
  viewport: "視窗大小",
  "freed texture": "已釋放的貼圖",
  renderer: "繪圖引擎與顯示卡",
  "gpu limits": "GPU 限制",
  display: "顯示狀態",
  frames: "影格統計",
  stalls: "卡頓統計",
  "render scale": "繪製縮放",
  "leaderboard queue": "排行榜佇列：等待上傳與被伺服器拒絕的局數及拒絕原因",
};

export const NATIVE_CHECKS = [
  ["WeakMap.get", (w) => w?.WeakMap?.prototype?.get],
  ["Storage.setItem", (w) => w?.Storage?.prototype?.setItem],
  ["drawImage", (w) => w?.CanvasRenderingContext2D?.prototype?.drawImage],
  ["putImageData", (w) => w?.CanvasRenderingContext2D?.prototype?.putImageData],
  ["addEventListener", (w) => w?.EventTarget?.prototype?.addEventListener],
  ["requestAnimationFrame", (w) => w?.requestAnimationFrame],
  ["devicePixelRatio", (w) => (w ? Object.getOwnPropertyDescriptor(w, "devicePixelRatio")?.get : undefined)],
];

// 與遊戲 ie() 相同的判斷：回傳遊戲「page」欄位會寫的內容（null = 遊戲沒看到異常）
export function gameSeesPage(w = globalThis) {
  const native = (f) => typeof f !== "function" || /\[native code\]\s*\}\s*$/.test(Function.prototype.toString.call(f));
  const replaced = NATIVE_CHECKS.filter(([, g]) => {
    try { return !native(g(w)); } catch { return false; }
  }).map(([n]) => n);
  const v = w?.__D2ZH_VERSION;
  const parts = [
    w?.__D2ZH ? `the d2_zh.js bookmarklet${typeof v === "string" ? " " + v : ""}` : null,
    replaced.length ? `replaced ${replaced.join(", ")}` : null,
  ].filter(Boolean);
  return { text: parts.length ? parts.join("; ") : null, replaced, zh: !!w?.__D2ZH };
}

// 解析玩家貼上的遊戲診斷訊息
export function parseDiag(text) {
  const facts = {};
  for (const line of String(text ?? "").split(/\r?\n/)) {
    const m = /^([a-z][a-z ]*?):\s*(.*)$/.exec(line.trim());
    if (m && !/^\[/.test(line.trim())) facts[m[1]] ??= m[2];
  }
  return facts;
}

export function alternateWeaponItems(s) {
  return Object.values(s?.weaponSets ?? {}).flatMap((set) => [set?.weapon, set?.shield]).filter(Boolean);
}

export function allItems(s) {
  if (!s || typeof s !== "object") return [];
  const flat = (o) => Object.values(o ?? {}).flatMap((v) => v ?? []);
  return [
    ...flat(s.stashTabs),
    ...(s.uniques ?? []),
    ...flat(s.inventoryByClass),
    ...flat(s.charmsByClass),
    ...flat(s.stockByClass),
    ...flat(s.gambleByClass),
    ...flat(s.akaraByClass),
    ...Object.values(s.equippedByClass ?? {}).flatMap((o) => Object.values(o ?? {})),
    ...alternateWeaponItems(s),
    ...Object.values(s.mercs ?? {}).flatMap((m) => Object.values(m?.hired ?? {}).flatMap((h) => Object.values(h?.worn ?? {}))),
    ...Object.values(s.imbueByClass ?? {}),
  ].filter((it) => it && typeof it === "object");
}

// 與 allItems 同範圍，但附上位置說明，讓玩家知道問題物品在哪裡
export function itemsWithWhere(s) {
  if (!s || typeof s !== "object") return [];
  const out = [];
  const cz = (c) => CLASS_ZH[c] ?? c;
  const add = (where, list) => {
    for (const it of list ?? []) if (it && typeof it === "object") out.push({ item: it, where });
  };
  for (const [t, v] of Object.entries(s.stashTabs ?? {})) add(`共用倉庫 → 分頁 ${t}`, v);
  add("獨特收藏庫", s.uniques);
  for (const [c, v] of Object.entries(s.inventoryByClass ?? {})) add(`${cz(c)} → 背包`, v);
  for (const [c, v] of Object.entries(s.charmsByClass ?? {})) add(`${cz(c)} → 咒符欄`, v);
  for (const [c, v] of Object.entries(s.stockByClass ?? {})) add(`${cz(c)} → 恰西商店`, v);
  for (const [c, v] of Object.entries(s.gambleByClass ?? {})) add(`${cz(c)} → 賭博商店`, v);
  for (const [c, v] of Object.entries(s.akaraByClass ?? {})) add(`${cz(c)} → 阿卡拉商店`, v);
  for (const [c, o] of Object.entries(s.equippedByClass ?? {})) {
    for (const [slot, it] of Object.entries(o ?? {})) add(`${cz(c)} → 身上裝備 → ${SLOT_ZH[slot] ?? slot}`, [it]);
  }
  add("備用武器", alternateWeaponItems(s));
  for (const [c, m] of Object.entries(s.mercs ?? {})) {
    for (const h of Object.values(m?.hired ?? {})) {
      for (const [slot, it] of Object.entries(h?.worn ?? {})) add(`${cz(c)} → 傭兵 → ${SLOT_ZH[slot] ?? slot}`, [it]);
    }
  }
  for (const [c, it] of Object.entries(s.imbueByClass ?? {})) add(`${cz(c)} → 附魔欄`, [it]);
  return out;
}

// 遊戲對「獨特／符文之語且沒有 stats」的物品直接略過檢查；其他品質沒有 roll（種子）就會被判定不合法
export const riskyItem = (it) => it.type !== "quest" && !((it.rarity === "unique" || it.rarity === "runeword") && !it.stats) && !it.roll;
export const hasForge = (it) => Boolean(it?.forge || it?.forgeHeld);

export function isFakeUnique(it, assets) {
  return Boolean(it && it.rarity === "unique" && it.type !== "quest" && assets?.sets?.[it.name] && !assets?.uniques?.[it.name]);
}

function fakeContainers(s) {
  return [...Object.entries(s?.stashTabs ?? {}), ...Object.entries(s?.inventoryByClass ?? {}), ...Object.entries(s?.charmsByClass ?? {})];
}

export function fakeUniqueItems(s, assets) {
  return fakeContainers(s).flatMap(([, arr]) => (arr ?? []).filter((it) => isFakeUnique(it, assets)).map((it) => ({ it })));
}

export function removeFakeUniques(s, assets) {
  for (const [, arr] of fakeContainers(s)) {
    if (!Array.isArray(arr)) continue;
    for (let i = arr.length - 1; i >= 0; i--) if (isFakeUnique(arr[i], assets)) arr.splice(i, 1);
  }
}

export function stashLabel(tabKey) {
  if (/^shared\d+$/.test(tabKey)) return "共用倉庫 " + tabKey.slice(-1);
  if (CLASS_ZH[tabKey]) return `${CLASS_ZH[tabKey]} 個人倉庫`;
  return `倉庫 ${tabKey}`;
}

export function stashConts(s) {
  const out = [];
  for (const [t, arr] of Object.entries(s?.stashTabs ?? {})) {
    if (Array.isArray(arr)) out.push({ id: "st:" + t, label: stashLabel(t), kind: "stash", arr: () => arr });
  }
  return out;
}

// 需要移動的物品：缺座標、超出格子、或與前面物品重疊
export function overlapping(c, sizeOf = () => [1, 1]) {
  const [cols, rows] = GRID[c.kind] ?? [10, 12];
  const occ = new Set(), bad = [];
  for (const it of c.arr()) {
    const [w, h] = sizeOf(it), a = it.at;
    const ok0 = a && Number.isInteger(a.x) && Number.isInteger(a.y) && a.x >= 0 && a.y >= 0 && a.x + w <= cols && a.y + h <= rows;
    const cells = [];
    if (ok0) for (let x = 0; x < w; x++) for (let y = 0; y < h; y++) cells.push(a.x + x + "," + (a.y + y));
    if (!ok0 || cells.some((k) => occ.has(k))) bad.push(it);
    else cells.forEach((k) => occ.add(k));
  }
  return bad;
}

export function stashOverlaps(s, sizeOf = () => [1, 1]) {
  return stashConts(s).map((c) => ({ label: c.label, items: overlapping(c, sizeOf) })).filter((b) => b.items.length);
}

export function freeSpot(c, it, skip, sizeOf = () => [1, 1]) {
  const [cols, rows] = GRID[c.kind] ?? [10, 12], [w, h] = sizeOf(it), occ = new Set();
  c.arr().forEach((o) => {
    if (o === skip) return;
    const [ow, oh] = sizeOf(o), pos = o.at ?? { x: 0, y: 0 }, a = { x: Number(pos.x) || 0, y: Number(pos.y) || 0 };
    for (let x = 0; x < ow; x++) for (let y = 0; y < oh; y++) occ.add(a.x + x + "," + (a.y + y));
  });
  for (let y = 0; y + h <= rows; y++) {
    for (let x = 0; x + w <= cols; x++) {
      let ok = true;
      for (let dx = 0; dx < w && ok; dx++) for (let dy = 0; dy < h && ok; dy++) if (occ.has(x + dx + "," + (y + dy))) ok = false;
      if (ok) return { x, y };
    }
  }
  return null;
}

export function repackStash(s, sizeOf = () => [1, 1]) {
  for (const c of stashConts(s)) {
    const bad = new Set(overlapping(c, sizeOf)), arr = c.arr(), keep = arr.filter((it) => !bad.has(it)), tmp = { kind: c.kind, arr: () => keep };
    for (const it of arr) {
      if (bad.has(it)) {
        const at = freeSpot(tmp, it, undefined, sizeOf);
        if (!at) throw new Error(c.label + " 空間不足，無法容納所有物品；請先刪除部分物品。");
        it.at = at;
        keep.push(it);
      }
    }
  }
}

// 遊戲上傳 points 旗標使用固定的三難度容許額；載入時屬性由目前恰西等級與歷史重建。
export function attributeChecks(s) {
  const attributes = ["strength", "dexterity", "vitality", "energy"];
  const out = [];
  if (!s?.heroes || typeof s.heroes !== "object" || Array.isArray(s.heroes)) return [{ unknown: true, text: "屬性點未驗證：缺少角色資料" }];
  for (const [cls, hero] of Object.entries(s.heroes)) {
    for (const key of ["kept", "run"]) {
      const state = hero?.[key];
      if (state == null) continue;
      const name = CLASS_ZH[cls] ?? cls, label = name + " " + key;
      const unknown = () => out.push({ unknown: true, text: "屬性點未驗證：" + label });
      const b = state.build, level = state.run?.level;
      if (
        !b || !Array.isArray(b.history) || !b.history.every((x) => typeof x === "string") ||
        !Number.isInteger(level) || level < 1 || level > 99 ||
        !Number.isInteger(b.unspent ?? 0) || (b.unspent ?? 0) < 0
      ) {
        unknown();
        continue;
      }
      const used = (b.unspent ?? 0) + b.history.reduce((n, x) => n + (attributes.some((a) => x === "attribute:" + a) ? 5 : attributes.some((a) => x === "point:" + a) ? 1 : 0), 0);
      const cap = 5 * Math.max(0, level - 1) + 5 * 3 + 20;
      out.push({ ok: used <= cap, text: (used <= cap ? "屬性點合規：" : "屬性點不合規：") + label + "（" + used + " / " + cap + "）" });
    }
  }
  return out.length ? out : [{ unknown: true, text: "屬性點未驗證：沒有可檢查的角色" }];
}

// 依遊戲上傳紀錄的 flags 規則與載入檢查（2026-11-13 自官方 20261105.3 反編譯，saveTransfer 的 Pa／ka／ja 與載入流程）：
// ‧level：經驗值須在 0～該等級上限之間（上限＝round((5+4×(等級−1)^1.35)×1.1^max(0,等級−25)×1.1^max(0,等級−89))＋1）。
//   實機（D2S1 存檔副本）99 級的經驗值恰好等於此公式的上限（5865600），所以 99 級也照同一條檢查。
// ‧skills：同一角色的技能欄不可有重複技能。
// ‧跨模式：專家存檔須帶 mode:"hc"，一般存檔不得帶 mode，否則遊戲載入時判定為被編輯。
export const xpCap = (lv) => Math.round((5 + 4 * (lv - 1) ** 1.35) * 1.1 ** Math.max(0, lv - 25) * 1.1 ** Math.max(0, lv - 89));

export function flagChecks(s, mode = "softcore") {
  if (!s || typeof s !== "object") s = {};
  const out = [], states = [];
  for (const [cls, hero] of Object.entries(s.heroes ?? {})) {
    for (const key of ["kept", "run"]) {
      const st = hero?.[key];
      if (st && typeof st === "object") states.push([cls, key, st]);
    }
  }
  const label = (cls, key) => `${CLASS_ZH[cls] ?? cls}（${key === "run" ? "進行中" : "保留"}）`;
  const badXp = states.filter(([, , st]) => {
    const lv = st.run?.level, xp = st.run?.xp;
    return Number.isInteger(lv) && lv >= 1 && lv <= 99 && Number.isFinite(xp) && (xp < 0 || xp > xpCap(lv) + 1);
  });
  // 沒有角色資料（例如全新存檔、進度尚在 underway）時不能說「通過」，標示未驗證
  const checked = states.filter(([, , st]) => Number.isInteger(st.run?.level) && Number.isFinite(st.run?.xp));
  out.push(
    badXp.length
      ? {
          ok: false,
          text: `經驗值超過等級上限：${badXp.map(([c, k]) => label(c, k)).join("、")}`,
          note: "遊戲上傳紀錄的 level 旗標",
          fix: () => {
            for (const [, , st] of badXp) st.run.xp = Math.max(0, Math.min(st.run.xp, xpCap(st.run.level)));
          },
          fixText: "經驗值設為該等級上限",
        }
      : checked.length
      ? { ok: true, text: "經驗值與等級相符" }
      : { unknown: true, text: "經驗值未驗證：存檔裡沒有可檢查的角色進度" }
  );
  const dupSkills = states.filter(([, , st]) => {
    const ids = (st.build?.skills ?? []).map((x) => x?.id);
    return new Set(ids).size !== ids.length;
  });
  out.push(
    dupSkills.length
      ? {
          ok: false,
          text: `技能欄有重複技能：${dupSkills.map(([c, k]) => label(c, k)).join("、")}`,
          note: "遊戲上傳紀錄的 skills 旗標",
          fix: () => {
            for (const [, , st] of dupSkills) {
              const seen = new Set();
              st.build.skills = st.build.skills.filter((x) => !seen.has(x?.id) && seen.add(x?.id));
            }
          },
          fixText: "移除重複技能",
        }
      : states.some(([, , st]) => Array.isArray(st.build?.skills))
      ? { ok: true, text: "技能欄沒有重複" }
      : { unknown: true, text: "技能重複未驗證：存檔裡沒有可檢查的角色進度" }
  );
  const wantHc = mode === "hardcore", modeBad = wantHc ? s.mode !== "hc" : s.mode !== undefined;
  out.push(
    modeBad
      ? {
          ok: false,
          text: wantHc ? '硬核存檔缺少 mode:"hc" 標記' : `一般存檔帶有 mode:"${s.mode}"（只有硬核存檔應有）`,
          note: "遊戲載入時判定為被編輯",
          fix: () => {
            if (wantHc) s.mode = "hc";
            else delete s.mode;
          },
          fixText: wantHc ? "補上硬核標記" : "移除模式標記",
        }
      : { ok: true, text: "存檔模式與儲存槽相符" }
  );
  return out;
}

// 存檔檢查完整清單（不依賴 DOM，修正動作透過回呼或直接修改存檔物件）
export function detect(s, opts = {}) {
  if (!s || typeof s !== "object") s = {};
  const {
    mode = "softcore",
    seal = "sealed",
    faultyItems = null,
    traceKeys = [],
    gameSaveFaults = null,
    assets = null,
    sizeOf = () => [1, 1],
    itemName = (it) => it?.name || it?.base || "?",
    onRegenRunewords = null,
    onMaxItems = null,
    onClearTraces = null,
  } = opts;
  const out = [];
  out.push(...attributeChecks(s));
  out.push(...flagChecks(s, mode));
  // 收藏中的符文之語隨機種子對不上（遊戲 itemFault 判定 seed）：遊戲的 sanitize 修不好，改為依同名同底材重新產生
  const seedBad = (faultyItems ?? []).filter((it) => it.rarity === "runeword" && (s.uniques ?? []).includes(it));
  if (seedBad.length) {
    out.push({
      ok: false,
      text: `收藏中的符文之語 ${seedBad.length} 件隨機種子對不上（遊戲判定「not what its roll makes」）`,
      note: "遊戲的 sanitize 無法修正",
      fixText: "依同名重新產生",
      fix: onRegenRunewords ? () => onRegenRunewords(seedBad) : () => { for (const it of seedBad) delete it.roll; },
    });
  }
  out.push(seal === "sealed" ? { ok: true, text: "簽章正確" } : { ok: false, text: "簽章損壞或不存在", note: "寫入時自動修復" });
  const gold = Number(s.gold ?? 0);
  out.push(
    gold <= 1e10
      ? { ok: true, text: "金幣在上限內（≤ 100 億）" }
      : { ok: false, text: `金幣 ${gold.toLocaleString(LOCALE)} 超過 100 億上限`, fix: () => { s.gold = 1e10; }, fixText: "設為 100 億" }
  );
  const l = s.light;
  if (l?.wings && l.shards < 10) out.push({ ok: false, text: `擁有翅膀但光之碎片只有 ${l.shards}`, fix: () => { l.shards = 10; }, fixText: "碎片設為 10" });
  else if (l && !l.wings && Object.keys(l.worn ?? {}).length) out.push({ ok: false, text: "穿戴翅膀但尚未取得", fix: () => { l.wings = true; l.shards = Math.max(l.shards ?? 0, 10); }, fixText: "補上翅膀" });
  else out.push({ ok: true, text: "光之碎片／翅膀正常" });

  // 優先用遊戲自己的檢查（物品引擎）；引擎無法使用時才用近似規則
  const risky = faultyItems ?? allItems(s).filter(riskyItem);
  const regen = risky.filter((it) => ["unique", "set", "runeword"].includes(it.rarity));
  const other = risky.filter((it) => !regen.includes(it));
  out.push(
    risky.length
      ? {
          ok: false,
          text: `${risky.length} 件物品會被判定為不合法：${risky.slice(0, 5).map(itemName).join("、")}${risky.length > 5 ? "…" : ""}`,
          note: faultyItems ? "遊戲檢查" : "近似檢查",
          fix: async () => {
            if (regen.length) {
              if (onMaxItems) await onMaxItems(regen);
              else for (const it of regen) { if (hasForge(it)) continue; delete it.roll; if (it.rarity !== "set") delete it.stats; }
            }
            for (const it of other) {
              if (hasForge(it)) continue;
              it.rarity = "unique";
              delete it.stats;
              delete it.roll;
            }
          },
          fixText: "重新產生為合法物品",
        }
      : { ok: true, text: "物品合法性檢查通過", note: faultyItems ? "遊戲檢查" : "近似檢查" }
  );

  // 套裝裝備被標成獨特（舊版修復／自動放裝備殘留）：遊戲會當成錯誤物品，直接移除
  const fakeUniques = fakeUniqueItems(s, assets);
  out.push(
    fakeUniques.length
      ? {
          ok: false,
          text: `${fakeUniques.length} 件「套裝」被標成獨特（名稱屬於套裝）：${fakeUniques.slice(0, 5).map((r) => itemName(r.it)).join("、")}${fakeUniques.length > 5 ? "…" : ""}`,
          note: "倉庫／背包／咒符欄",
          fix: () => { removeFakeUniques(s, assets); },
          fixText: "刪除這些錯誤物品",
        }
      : { ok: true, text: "沒有被標錯品質的套裝裝備" }
  );

  // 倉庫物品重疊、沒有座標、超出格子
  const bad = stashOverlaps(s, sizeOf);
  out.push(
    bad.length
      ? {
          ok: false,
          text: `倉庫 ${bad.reduce((n, b) => n + b.items.length, 0)} 件物品重疊、缺座標或超出格子`,
          note: bad.map((b) => b.label).join("、"),
          fix: () => { repackStash(s, sizeOf); },
          fixText: "重新排列倉庫",
        }
      : { ok: true, text: "倉庫物品位置正常" }
  );

  const badLv = [];
  for (const [c, h] of Object.entries(s.heroes ?? {})) {
    for (const k of ["kept", "run"]) {
      const lv = h?.[k]?.build?.level;
      if (lv !== undefined && !(Number.isInteger(lv) && lv >= 1 && lv <= 99)) badLv.push([c, k]);
    }
  }
  out.push(
    badLv.length
      ? {
          ok: false,
          text: `角色等級超出 1–99：${badLv.map(([c]) => CLASS_ZH[c] ?? c).join("、")}`,
          fix: () => { for (const [c, k] of badLv) s.heroes[c][k].build.level = 99; },
          fixText: "設為 99",
        }
      : { ok: true, text: "角色等級正常" }
  );

  const lb = s.leaderboard ?? {};
  out.push(lb.edited ? { ok: false, text: "存檔已被標記「外部修改」", fix: () => { delete s.leaderboard.edited; }, fixText: "清除標記" } : { ok: true, text: "沒有「外部修改」標記" });
  const marks = ["imported", "rechecked"].filter((k) => lb[k]);
  out.push(
    marks.length
      ? {
          ok: false,
          text: `存檔留有紀錄：${marks.map((k) => ({ imported: "曾從遊戲匯入", rechecked: "曾被重新檢查" })[k]).join("、")}`,
          fix: () => { for (const k of marks) delete s.leaderboard[k]; },
          fixText: "清除紀錄",
        }
      : { ok: true, text: "沒有匯入／檢查紀錄" }
  );

  const unranked = Object.entries(s.heroes ?? {}).filter(([, h]) => h?.unranked).map(([c]) => c);
  const lives = Object.entries(s.lives ?? {}).filter(([, v]) => v?.why).map(([c]) => c);
  if (unranked.length || lives.length) {
    out.push({
      ok: false,
      text: `硬核角色被標記不計排名：${[...new Set([...unranked, ...lives])].map((c) => CLASS_ZH[c] ?? c).join("、")}`,
      fix: () => {
        for (const c of unranked) delete s.heroes[c].unranked;
        for (const c of lives) delete s.lives[c].why;
      },
      fixText: "清除標記",
    });
  }

  out.push(
    traceKeys.length
      ? {
          ok: false,
          text: "瀏覽器存放區留有遊戲匯入前的舊存檔",
          fix: onClearTraces ?? (async () => { traceKeys.length = 0; }),
          fixText: "立即刪除",
        }
      : { ok: true, text: "瀏覽器存放區沒有匯入痕跡" }
  );

  // 遊戲自己的存檔總檢查（saveFaults）：逐條明細見 buildDetails
  out.push(
    gameSaveFaults == null
      ? { unknown: true, text: "遊戲存檔總檢查未驗證：引擎無法使用遊戲的檢查（saveFaults）" }
      : gameSaveFaults.length
      ? { ok: false, text: `遊戲存檔檢查判定 ${gameSaveFaults.length} 項問題（遊戲判定，詳見下方明細）`, note: "遊戲檢查" }
      : { ok: true, text: "遊戲存檔總檢查通過（saveFaults）", note: "遊戲檢查" }
  );
  return out;
}

// 整理問題明細列與總判定狀態（不依賴 DOM）
export function buildDetails(s, list, opts = {}) {
  const {
    gameSaveFaults = null,
    faultyItems = null,
    faultyReasons = null,
    ruleBad = null,
    itemLabel = (it) => it?.name || it?.base || "?",
    problemText = (p) => p?.code ?? "",
  } = opts;
  const rows = [];
  for (const x of list ?? []) {
    if (!x.ok && !x.unknown && !/物品|原版屬性規則|遊戲存檔檢查/.test(x.text)) {
      rows.push({ where: "存檔欄位", what: x.text, fix: x.fixText ?? "" });
    }
  }
  for (const f of gameSaveFaults ?? []) {
    rows.push({ where: "遊戲存檔檢查（saveFaults）", what: `遊戲判定：${f}`, fix: "遊戲原文，目前沒有自動修正；請依內容到對應位置處理" });
  }
  const gamble = new Set(Object.values(s?.gambleByClass ?? {}).flatMap((v) => v ?? []));
  const where = new Map(itemsWithWhere(s).map((w) => [w.item, w.where]));
  const notes = [];
  for (const x of ruleBad ?? []) {
    if (gamble.has(x.item)) continue;
    for (const p of x.problems ?? []) {
      notes.push({ where: where.get(x.item) ?? "（位置不明）", what: `「${itemLabel(x.item)}」：${problemText(p)}`, fix: "額外規則的提示，以遊戲本身的檢查為準，不必修正" });
    }
  }
  for (const it of faultyItems ?? []) {
    if (!(ruleBad ?? []).some((x) => x.item === it)) {
      const why = faultyReasons?.get?.(it);
      rows.push({
        where: where.get(it) ?? "（位置不明）",
        what: `「${itemLabel(it)}」：${why ? `遊戲判定：${why}` : "缺少遊戲需要的隨機種子（roll），遊戲會判定不合法"}`,
        fix: "重新產生為合法物品",
      });
    }
  }
  const lb = s?.leaderboard ?? {};
  const edited = rows.length > 0 || Boolean(lb.edited);
  const unknown = (list ?? []).some((x) => x.unknown);
  return { rows, notes, edited, unknown };
}

// 清除單一職業的恐懼階層：目前的 terror 狀態、連勝（cain.terror）、舊的 best，以及被換下的前任角色保存的恐懼紀錄
export function resetTerror(s, className) {
  if (!s || typeof s !== "object") return;
  const dropKey = (obj, key) => {
    if (!obj || !(key in obj)) return obj;
    const { [key]: _removed, ...rest } = obj;
    return rest;
  };
  const t = s.terror?.[className];
  if (t && typeof t === "object") {
    if (s.baalSlain?.[className] === "hell" && Number.isInteger(t.open) && t.open >= 1 && Array.isArray(t.offers) && t.offers.length === 3) {
      s.terror = { ...s.terror, [className]: { open: t.open, best: 0, cleared: 0, offers: t.offers, ...(t.waves !== undefined && { waves: t.waves }) } };
    } else {
      s.terror = dropKey(s.terror, className);
      if (!Object.keys(s.terror).length) delete s.terror;
    }
  }
  if (s.cain?.terror) {
    s.cain.terror = dropKey(s.cain.terror, className);
    if (!Object.keys(s.cain.terror).length) delete s.cain.terror;
  }
  const hero = s.heroes?.[className];
  if (hero && "best" in hero) delete hero.best;
  if (hero) {
    if (hero.run?.run?.terror !== undefined) delete hero.run;
    if (hero.kept?.run?.terror !== undefined) delete hero.kept;
    if (!Object.keys(hero).length) delete s.heroes[className];
  }
  for (const old of s.retired?.[className] ?? []) {
    if ("best" in old) delete old.best;
    if (old.reached && "terror" in old.reached) delete old.reached.terror;
  }
}

export function defaultLbId() {
  const b = new Uint8Array(16);
  if (globalThis.crypto?.getRandomValues) globalThis.crypto.getRandomValues(b);
  else for (let i = 0; i < 16; i++) b[i] = (Math.random() * 256) | 0;
  const bin = String.fromCharCode(...b);
  const b64 = typeof globalThis.btoa === "function" ? globalThis.btoa(bin) : Buffer.from(b).toString("base64");
  return b64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function applyNewLeaderboardId(s, idGen = defaultLbId) {
  if (!s || typeof s !== "object") return;
  s.leaderboard = { ...s.leaderboard, id: idGen() };
  const climbs = s.climbs ?? (s.climbs = {});
  const classes = new Set([...Object.keys(s.heroes ?? {}), ...Object.keys(climbs), ...Object.keys(s.terror ?? {}), ...Object.keys(s.retired ?? {})]);
  for (const className of classes) {
    const entry = climbs[className] ?? (climbs[className] = {});
    if (typeof entry !== "object") continue;
    for (const key of Object.keys(entry)) delete entry[key];
    entry.hero = idGen();
    resetTerror(s, className);
  }
}
