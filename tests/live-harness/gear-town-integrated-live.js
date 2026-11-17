// 營地裝備整合流程實機測試（死靈法師）：electron tests/live-harness/craft-live.cjs tests/live-harness/gear-town-integrated-live.js out.json
// 用修改器引擎做出一批裝備放進背包，回營地讓輔助器自己穿裝／收藏／存倉／賣裝／買裝，記錄每個動作與最後結果。隔離設定檔。
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
for (let i = 0; i < 120 && !window.__d2autobot?.game; i++) { document.body.dispatchEvent(new KeyboardEvent("keydown", { key: " ", code: "Space", bubbles: true })); await sleep(500); }
const A = window.__d2autobot, G = A.game;
if (G.state === "select") {
  if (!G.plainSelect().onPick) { G.chooseClass(); await sleep(1500); }
  const s = G.plainSelect(), i = s.cards.findIndex((c) => c.dataset?.class === "necromancer");
  s.select(i); await sleep(300); s.confirm(false);
}
for (let i = 0; i < 120 && !G.world?.player; i++) await sleep(500);
const cls = G.kit.id, out = { cls, actions: [] };
const gen = async (spec, n) => (await window.__d2editBackend.engine("generateMany", Array.from({ length: n }, () => ({ max: 1, free: true, ...spec })), 1)).map((r) => r.item).filter(Boolean);
const setMods = (it, mods) => { it.mods = mods.map(([stat, value]) => ({ stat, value })); delete it.stats; delete it.roll; return it; };
// 稀有項鍊 6 件（同欄位，驗證只留前 2 件備用）：含法師技能、死靈技能、純生命
const ams = await gen({ rarity: "rare", base: "Amulet" }, 6);
setMods(ams[0], [["classskills1", 3], ["life", 40]]);
setMods(ams[1], [["life", 50]]);
setMods(ams[2], [["life", 49]]);
setMods(ams[3], [["life", 48]]);
setMods(ams[4], [["life", 47]]);
setMods(ams[5], [["life", 1]]);
const helms = await gen({ rarity: "rare", base: "Cap" }, 3);
const uniq = [...await gen({ rarity: "unique", name: "Skin of the Vipermagi" }, 1).catch(() => []), ...await gen({ rarity: "set", name: "Civerb's Ward" }, 1).catch(() => [])];
const inv = G.inventoryOf(cls);
for (const it of [...ams, ...helms, ...uniq]) inv.push(it);
out.invBefore = inv.length;
const label = (it) => (it.name || it.base) + "[" + (it.mods || []).map((m) => m.stat + "=" + m.value).join(",") + "]";
const T = A.gearTools, fates = T.gearFates(G, cls, [...inv]);
out.fates = [...fates].map(([it, v]) => ({ item: label(it), fate: v.fate, gain: Math.round(v.gain * 10) / 10 }));
// 回營地讓輔助器整備
A.settings.progressEnabled = true; A.settings.quest.autoStart = false;
const seen = new Set(); const poll = setInterval(() => { const a = A.diagnostics?.()?.lastAction; if (a && !seen.has(a)) { seen.add(a); out.actions.push(a); } }, 100);
if (G.state === "playing" && typeof G.pause === "function") G.pause();
await sleep(300);
if (G.state === "paused" && typeof G.leaveRun === "function") await G.leaveRun();
for (let i = 0; i < 60 && !(G.state === "camp" && G.camp); i++) { if (G.state === "select" && G.enterCamp) await G.enterCamp(G.kit); await sleep(500); }
out.state = G.state;
let idle = 0, lastN = -1;
for (let i = 0; i < 400 && idle < 40; i++) { await sleep(500); idle = out.actions.length === lastN ? idle + 1 : 0; lastN = out.actions.length; }
out.finalState = G.state; out.shopDone = true;
clearInterval(poll);
out.worn = Object.fromEntries(Object.entries(G.equippedOf(cls)).map(([k, v]) => [k, label(v)]));
out.invAfter = G.inventoryOf(cls).map(label);
out.stashAfter = (G.save?.stashTabs?.[cls] || []).map((x) => label(x?.item ?? x));
out.uniquesAfter = G.save?.uniques instanceof Map ? [...G.save.uniques.keys()] : Object.keys(G.save?.uniques || {});
out.gold = G.save?.gold;
return out;
