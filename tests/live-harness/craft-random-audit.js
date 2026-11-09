// 隨機品質製作稽核（搭配 craft-live.cjs 在官方遊戲頁內執行）：
// 1) 每個底材 × 魔法／稀有（含珠寶底材）各製作數件（隨機詞綴）
// 2) 目錄內每件暗金／套裝／符文之語 × 隨機／全部最高各製作一件
// 每件都用遊戲自己的 faults（G.__itemFault）與修改器 validateItems 檢查；另統計詞綴數分布。
// 用法：electron craft-live.cjs craft-random-audit.js out.json
const b = window.__d2editBackend, E = (...a) => b.engine(...a);
const K = 3; // 每個底材／品質製作件數
const bases = await E("bases");
const cat = (await E("catalog")).filter(x => !x.unavailable);
const R = { t0: Date.now(), noFaultFn: false, affixCount: {}, built: 0, failed: [], gameFail: [], ruleFail: [], gameTally: {}, ruleTally: {}, byKind: {}, samples: {} };

const fullItems = new Map();
const chunks = (arr, n) => { const out = []; for (let i = 0; i < arr.length; i += n) out.push(arr.slice(i, i + n)); return out; };
async function checkAll(label, list) {
  for (const part of chunks(list, 40)) {
    const items = part.map(x => x.item);
    const faults = await E("faults", items);
    if (faults == null) { R.noFaultFn = true; }
    const vals = await E("validateItems", items);
    part.forEach((x, i) => {
      const it = x.item;
      const k = label + ":" + it.rarity;
      R.byKind[k] = (R.byKind[k] ?? 0) + 1;
      if (faults && faults[i]) {
        const why = typeof faults[i] === "string" ? faults[i] : (faults[i].why ?? faults[i].fault);
        const tk = `${label}|${it.rarity}|${why}`;
        R.gameTally[tk] = (R.gameTally[tk] ?? 0) + 1;
        const rec = { label, name: it.name, base: it.base, rarity: it.rarity, why: faults[i] };
        R.gameFail.push(rec); fullItems.set(rec, it);
      }
      if (vals && vals[i] && vals[i].length) {
        const why = vals[i].map(x => x.why ?? x.code).join(";");
        const tk = `${label}|${it.rarity}|${why}`;
        R.ruleTally[tk] = (R.ruleTally[tk] ?? 0) + 1;
        const rec = { label, name: it.name, base: it.base, rarity: it.rarity, why: vals[i] };
        R.ruleFail.push(rec); fullItems.set(rec, it);
      }
      if (it.rarity === "magic" || it.rarity === "rare") {
        const n = (it.mods ?? []).filter(m => !m.implicit && !m.auto && !m.staff).length;
        const key = `${it.base}|${it.rarity}`;
        R.affixCount[it.rarity] ??= {};
        R.affixCount[it.rarity][n] = (R.affixCount[it.rarity][n] ?? 0) + 1;
        if (it.base === "Jewel") { R.samples["Jewel " + it.rarity] ??= []; if (R.samples["Jewel " + it.rarity].length < 3) R.samples["Jewel " + it.rarity].push(it); }
      }
    });
  }
}
async function generateAll(list) {
  const out = [];
  for (const part of chunks(list, 40)) {
    const r = await E("generateMany", part, false);
    if (!Array.isArray(r)) { R.failed.push({ error: r?.error ?? "no response" }); continue; }
    r.forEach((x, i) => {
      if (x?.item) { out.push({ item: x.item, src: part[i] }); R.built++; }
      else R.failed.push({ spec: part[i], result: x });
    });
  }
  return out;
}

// 1) 魔法／稀有：每個底材 K 件
const affixSpecs = [];
for (const bs of bases) for (const rarity of ["magic", "rare"]) for (let i = 0; i < K; i++) affixSpecs.push({ rarity, base: bs.name });
const affixItems = await generateAll(affixSpecs);
await checkAll("affix", affixItems);

// 2) 固定品質：隨機值（max=false）
const fixedSpecs = cat.map(x => ({ rarity: x.rarity, name: x.name, base: x.rarity === "runeword" ? undefined : x.base }));
const fixedItems = await generateAll(fixedSpecs);
await checkAll("fixedRandom", fixedItems);

// 3) 固定品質：全部最高（max=true）
const maxItems = [];
for (const part of chunks(fixedSpecs, 40)) {
  const r = await E("generateMany", part, true);
  if (!Array.isArray(r)) { R.failed.push({ error: "max batch" }); continue; }
  r.forEach((x, i) => { if (x?.item) { maxItems.push({ item: x.item }); R.built++; } else R.failed.push({ spec: part[i], result: x, max: true }); });
}
await checkAll("fixedMax", maxItems);

R.summary = { built: R.built, failedCount: R.failed.length, gameFailCount: R.gameFail.length, ruleFailCount: R.ruleFail.length, noFaultFn: R.noFaultFn, seconds: Math.round((Date.now() - R.t0) / 1000) };
const bases_hit = {};
for (const g of R.gameFail) bases_hit[g.base] = (bases_hit[g.base] ?? 0) + 1;
R.gameFailBases = bases_hit;
R.fullGameFail = R.gameFail.slice(0, 3).map(g => { const x = fullItems.get(g); return x; });
R.fullRuleFail = R.ruleFail.slice(0, 3).map(g => fullItems.get(g));
R.gameFail = R.gameFail.slice(0, 12);
R.ruleFail = R.ruleFail.slice(0, 12);
R.failed = R.failed.slice(0, 60);
R.samples = Object.fromEntries(Object.entries(R.samples).map(([k, v]) => [k, v.map(it => ({ name: it.name, base: it.base, rarity: it.rarity, mods: it.mods }))]));
return R;
