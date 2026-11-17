// 從排行榜學習高手雇傭兵的類型、技能與裝備（各職業前 50 位不同玩家、每人取最高恐懼層紀錄）。
// 用法：node helper/tools/ladder-merc.js <輸出.json> <快取資料夾>
const fs = require("fs"), path = require("path");
const [out, cache] = process.argv.slice(2);
const CLASSES = ["amazon", "assassin", "barbarian", "druid", "necromancer", "paladin", "sorceress"], TOP = 50;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function get(url) {
  const file = path.join(cache, url.replace(/[^\w]+/g, "_") + ".json");
  if (fs.existsSync(file)) return JSON.parse(fs.readFileSync(file, "utf8"));
  for (let i = 0; i < 4; i++) {
    const res = await fetch(url, { headers: { "user-agent": "d2autobot-ladder-study" } });
    if (res.ok) { const json = await res.json(); fs.writeFileSync(file, JSON.stringify(json)); await sleep(250); return json; }
    await sleep(1000 * 2 ** i);
  }
  throw new Error("fetch failed " + url);
}
(async () => {
  fs.mkdirSync(cache, { recursive: true });
  const tiers = (await get("https://d2survivors.lol/api/leaderboard/tiers")).tiers.filter((t) => t.runs > 0).map((t) => t.tier).sort((a, b) => b - a);
  const picked = Object.fromEntries(CLASSES.map((c) => [c, new Map()]));
  for (const tier of tiers) {
    if (CLASSES.every((c) => picked[c].size >= TOP)) break;
    const board = await get(`https://d2survivors.lol/api/leaderboard/boards/tier-${tier}?limit=100`);
    for (const row of board.rows || []) { const m = picked[row.class]; if (m && m.size < TOP && row.player && !m.has(row.player)) m.set(row.player, row.id); }
  }
  const types = {}, picks = {}, gear = {}; let total = 0;
  for (const cls of CLASSES) for (const id of picked[cls].values()) {
    let run; try { run = await get(`https://d2survivors.lol/api/leaderboard/runs/${id}`); } catch { continue; }
    const m = run.merc; if (!m?.type) continue;
    total++; types[m.type] = (types[m.type] || 0) + 1;
    for (const p of m.picks || []) { picks[m.type] ??= {}; picks[m.type][p.id] = (picks[m.type][p.id] || 0) + 1; }
    for (const g of m.gear || []) if (g.item?.n && ["u", "s", "w"].includes(g.item.r)) { gear[m.type] ??= {}; gear[m.type][g.slot] ??= {}; gear[m.type][g.slot][g.item.n] = (gear[m.type][g.slot][g.item.n] || 0) + 1; }
  }
  const top = (o, k) => Object.entries(o).sort((a, b) => b[1] - a[1]).slice(0, k);
  const result = { generatedAt: new Date().toISOString().slice(0, 10), runs: total, types, picks: Object.fromEntries(Object.entries(picks).map(([t, o]) => [t, top(o, 4)])), gear: Object.fromEntries(Object.entries(gear).map(([t, s]) => [t, Object.fromEntries(Object.entries(s).map(([slot, o]) => [slot, top(o, 6).map(([n]) => n)]))])) };
  fs.writeFileSync(out, JSON.stringify(result, null, 1));
  console.log(JSON.stringify(result, null, 1));
})().catch((e) => { console.error(e); process.exit(1); });
