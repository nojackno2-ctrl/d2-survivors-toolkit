// 傭兵裝備靈氣 vs「所有技能」實機驗證（2026-11-11）。
// 用法：H_SEED=<解碼後存檔.json> electron tests/live-harness/craft-live.cjs tests/live-harness/merc-aura-allskills-live.js out.json
// 存檔需為法師、沙漠傭兵穿著帶 aura 的裝備（例：無限＝aura:conviction）。結果 live 欄位顯示各靈氣實際等級。
const sleep = ms => new Promise(r => setTimeout(r, ms));
const log = [], refs = [];
const origSet = WeakMap.prototype.set;
WeakMap.prototype.set = function (k, v) {
  try {
    if (Array.isArray(v) && v.length && v.every(o => o && typeof o === "object" && "centre" in o && "id" in o && "level" in o))
      v.forEach(o => { if (!refs.includes(o)) refs.push(o); }); log.push(v.map(o => ({ id: o.id, level: o.level, d2: o.d2Level, centreIsMerc: o.centre === window.__d2autobot?.game?.world?.merc?.player, centreIsHero: o.centre === window.__d2autobot?.game?.world?.player })));
  } catch (e) {}
  return origSet.call(this, k, v);
};
window.__auraLog = log;
for (let i = 0; i < 120 && !window.__d2autobot?.game; i++) { document.body.dispatchEvent(new KeyboardEvent("keydown", { key: " ", code: "Space", bubbles: true })); await sleep(500); }
const g = window.__d2autobot.game;
if (g.state === "select") {
  if (g.frontend?.open && !g.plainSelect().onPick) { g.frontend.actions.play(); await sleep(3000); }
  if (!g.plainSelect().onPick) { g.chooseClass(); await sleep(1500); }
  const s = g.plainSelect(); const i = s.cards.findIndex(c => c.dataset?.class === "sorceress");
  s.select(i); await sleep(300); s.confirm(false);
}
for (let i = 0; i < 60 && !g.world?.player; i++) await sleep(500);
await sleep(3000);

const cls = "sorceress";
const mg = () => g.mercGear(cls);
const snap = (label) => ({ label, live: refs.filter(o => o.centre === g.world.merc?.player).map(o => o.id + ':lv' + o.level + '/d2=' + o.d2Level),  mercAll: g.world.merc?.player?.allSkills, heroAll: g.world.player.allSkills, mercGear: JSON.stringify(g.world.merc?.player?.gearSkills), logs: log.splice(0).slice(-6) });
const out = { start: { weapon: mg().worn.weapon?.name, head: mg().worn.head?.name, body: mg().worn.body?.name, picks: g.mercOf(cls)?.record?.picks, mercStanding: g.world.merc?.standing, mercDead: g.world.merc?.dead } };
out.s0 = snap("before");
const head0 = mg().worn.head;
out.headMods = head0?.mods?.map(m => m.stat + "=" + m.value);
// 基準：重新套用一次（不改）
mg().change(() => {}); await sleep(1500); out.s1 = snap("noop");
// +2 所有技能 到傭兵頭盔
mg().change(() => { const h = mg().worn.head; h.mods = [...(h.mods || []).filter(m => m.stat !== "allSkills"), { stat: "allSkills", value: 2 }]; }); await sleep(1500);
out.s2 = snap("head+2");
// 再 +2（共 +4）
mg().change(() => { const h = mg().worn.head; h.mods = h.mods.map(m => m.stat === "allSkills" ? { ...m, value: 4 } : m); }); await sleep(1500);
out.s3 = snap("head+4");
return out;
