// 自動配裝別職業技能詞綴實機測試（死靈法師）：electron tests/live-harness/craft-live.cjs tests/live-harness/gear-foreign-skill-live.js out.json
// 以修改器引擎（與「製作裝備」同一個產生器）做出護身符，改詞綴後交給輔助器 bestGear 挑選；全新隔離設定檔，不碰真實存檔。
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const g = window.__d2autobot?.game, b = window.__d2editBackend, tools = window.__d2autobot?.gearTools;
for (let i = 0; i < 120 && (!window.__d2autobot?.game); i++) { document.body.dispatchEvent(new KeyboardEvent("keydown", { key: " ", code: "Space", bubbles: true })); await sleep(500); }
const G = window.__d2autobot.game;
if (G.state === "select") {
  if (!G.plainSelect().onPick) { G.chooseClass(); await sleep(1500); }
  const s = G.plainSelect(), i = s.cards.findIndex((c) => c.dataset?.class === "necromancer");
  if (i < 0) return { error: "找不到死靈法師卡片" };
  s.select(i); await sleep(300); s.confirm(false);
}
for (let i = 0; i < 120 && !G.world?.player; i++) await sleep(500);
const out = { cls: G.kit?.id, worn: Object.keys(G.equippedOf(G.kit.id) || {}) };
// 製作：稀有項鍊 × 4，再改成指定詞綴
const made = await window.__d2editBackend.engine("generateMany", Array.from({ length: 4 }, () => ({ rarity: "rare", base: "Amulet", max: 1, free: true })), 1);
const items = made.map((r) => r.item).filter(Boolean);
out.madeCount = items.length;
if (items.length < 4) return { ...out, error: "製作失敗", made };
const mk = (it, mods) => { it.mods = mods.map(([stat, value]) => ({ stat, value })); delete it.stats; delete it.roll; return it; };
const sorc = mk(items[0], [["classskills1", 3], ["life", 30]]);      // 法師技能 +3、生命 30
const clean = mk(items[1], [["life", 30]]);                           // 只有生命 30
const necro = mk(items[2], [["classskills2", 2], ["life", 30]]);      // 死靈技能 +2、生命 30
const sorcTab = mk(items[3], [["skilltab6", 3], ["life", 30]]);       // 技能樹 6＝floor(6/3)=2＝死靈（本職業）
const cls = G.kit.id, T = tools;
out.foreign = {};
const sc = (n, it) => ({ name: n, score: T.gearScore(G, { amulet: it }) });
out.scores = [sc("法師+3", sorc), sc("乾淨", clean), sc("死靈+2", necro), sc("技能樹6(死靈)", sorcTab)];
const pick = (list) => { const r = T.bestGear(G, list); return r ? { slot: r.slot, gain: r.gain, mods: r.item.mods.map((m) => m.stat + "=" + m.value).join(",") } : null; };
out.pickSorcVsClean = pick([sorc, clean]);
out.pickSorcVsNecro = pick([sorc, necro]);
out.pickSorcOnly = pick([sorc]);
out.pickAll = pick([sorc, clean, necro]);
return out;
