// 營地裝備邊界情況實機測試：金幣多寡對買裝的影響。electron craft-live.cjs 本檔 out.json
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
for (let i = 0; i < 120 && !window.__d2autobot?.game; i++) { document.body.dispatchEvent(new KeyboardEvent("keydown", { key: " ", code: "Space", bubbles: true })); await sleep(500); }
const A = window.__d2autobot, G = A.game;
if (G.state === "select") { if (!G.plainSelect().onPick) { G.chooseClass(); await sleep(1500); } const s = G.plainSelect(); s.select(s.cards.findIndex((c) => c.dataset?.class === "necromancer")); await sleep(300); s.confirm(false); }
for (let i = 0; i < 120 && !G.world?.player; i++) await sleep(500);
const cls = G.kit.id, out = { rounds: [] };
const gen = async (spec, n) => (await window.__d2editBackend.engine("generateMany", Array.from({ length: n }, () => ({ max: 1, free: true, ...spec })), 1)).map((r) => r.item).filter(Boolean);
const setMods = (it, mods) => { it.mods = mods.map(([stat, value]) => ({ stat, value })); delete it.stats; delete it.roll; return it; };
const label = (it) => (it.name || it.base) + "[" + (it.mods || []).slice(0, 3).map((m) => m.stat + "=" + m.value).join(",") + "]";
A.settings.progressEnabled = true; A.settings.quest.autoStart = false;
let last = "", cur = [];
const poll = setInterval(() => { const a = A.diagnostics?.()?.lastAction; if (a && a !== last) { last = a; cur.push(a); } }, 100);
async function toCamp() {
  const dbg = (t) => (out.dbg ??= []).push(t + ":" + G.state);
  dbg("begin");
  if (G.state === "camp") { G.startRun && await G.startRun(G.kit, "normal"); for (let i = 0; i < 60 && G.state !== "playing"; i++) await sleep(500); dbg("afterStart"); await sleep(3000); }
  if (G.state === "playing" && G.pause) G.pause(); await sleep(300);
  if (G.state === "paused" && G.leaveRun) await G.leaveRun();
  for (let i = 0; i < 60 && !(G.state === "camp" && G.camp); i++) await sleep(500);
  dbg("end");
}
async function settle() { let idle = 0, n = -1; for (let i = 0; i < 400 && idle < 12; i++) { if (!cur.length && i < 70) { await sleep(500); continue; } await sleep(500); idle = cur.length === n ? idle + 1 : 0; n = cur.length; } }
const uniqNames = () => { const u = G.save?.uniques; const vals = u instanceof Map ? [...u.values()] : Object.values(u || {}); return vals.flat(Infinity).filter((x) => x && typeof x === "object").map((x) => label(x.item ?? x)); };
const snapshot = (name) => ({ round: name, actions: cur.slice(), inv: G.inventoryOf(cls).map(label), collection: uniqNames(), stash: (G.save?.stashTabs?.[cls] || []).map((x) => label(x?.item ?? x)), gold: G.save?.gold });
const nokoz = async (life) => { const [it] = await gen({ rarity: "unique", name: "Nokozan Relic" }, 1); return setMods(it, [["life", life]]); };
// 先給一條夠好的項鍊穿著，讓 Nokozan 項鍊不被穿上
const [good] = await gen({ rarity: "rare", base: "Amulet" }, 1); setMods(good, [["life", 300]]); G.inventoryOf(cls).push(good);
G.save.gold = 50;
// 第 3 回合：金幣很多，帶一批稀有裝備讓商店有東西可買
G.save.gold = 5000000; cur = []; await toCamp(); await settle(); out.rounds.push(snapshot("3 金幣充足"));

for (const [n, gold] of [[4, 3000], [5, 1200], [6, 600]]) { G.save.gold = gold; cur = []; await toCamp(); await settle(); out.rounds.push(snapshot(n + " 金幣 " + gold)); }
clearInterval(poll);
out.worn = Object.fromEntries(Object.entries(G.equippedOf(cls)).map(([k, v]) => [k, label(v)]));
return out;
