// 頁面腳本（配 fresh-eval-live.cjs）：從語料抽背包，反覆呼叫 bestGear＋equip 直到穩定，記錄穿戴結果與異常。
const p = g.world.player, msgs = [], acts = g.gearActions(cls, (...m) => msgs.push(m.map((x) => typeof x === "string" ? x : JSON.stringify(x)).join(" ")), false);
const N = Number(window.__N || 40), TRIALS = Number(window.__TRIALS || 10);
const lvlTry = { before: tools.gearNumbers(g, {}).Life };
for (const k of ["level"]) { try { p[k] = 80; } catch {} }
lvlTry.after = tools.gearNumbers(g, {}).Life; lvlTry.level = p.level;
const inv = () => g.inventoryOf(cls);
const wornSlots = () => Object.entries(g.equippedOf(cls) || {}).filter(([, v]) => v);
function clearAll() { const e = g.save.equippedByClass?.[cls]; if (e) for (const k of Object.keys(e)) delete e[k]; inv().splice(0); }
const rnd = (n) => Math.floor(Math.random() * n);
const bands = ["normal", "nightmare", "hell"], results = [];
const pool = (b) => corpus.filter((x) => x.ctx.difficulty === b && x.item.rarity !== "runeword");
const t0 = Date.now();
for (const b of bands) {
  const P = pool(b);
  for (let t = 0; t < TRIALS; t++) {
    clearAll();
    const picked = Array.from({ length: N }, () => JSON.parse(JSON.stringify(P[rnd(P.length)].item)));
    for (const it of picked) it.id = Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2);
    inv().push(...picked);
    const hist = [], seen = new Map(); let steps = 0, osc = 0;
    for (; steps < 40; steps++) {
      const worn = g.equippedOf(cls), items = [...inv()];
      const best = tools.bestGear(g, items);
      if (!best) break;
      const before = worn[best.slot]?.id;
      acts.equip(best.item, best.slot);
      const after = g.equippedOf(cls)[best.slot]?.id;
      if (after !== best.item.id) { hist.push({ fail: best.item.name || best.item.base, slot: best.slot, type: best.item.type, msg: msgs.splice(0).join(" / "), cursor: !!g.save.cursor, ilvl: best.item.level, mods: best.item.mods?.length }); break; }
      const k = best.slot + ":" + best.item.id; if (seen.has(k)) osc++; seen.set(k, 1);
      hist.push({ slot: best.slot, name: best.item.name || best.item.base, rarity: best.item.rarity, gain: Math.round(best.gain * 10) / 10 });
    }
    const w = g.equippedOf(cls), score = tools.gearScore(g, w), nums = tools.gearNumbers(g, w);
    const empty = ["weapon", "head", "body", "gloves", "belt", "boots", "amulet", "ring1", "ring2", "shield"].filter((s) => !w[s]);
    results.push({ b, steps, osc, score: Math.round(score), empty, life: nums.Life, dmg: nums.Damage, wornN: wornSlots().length, hist: hist.slice(0, 14) });
  }
}
return { lvlTry, ms: Date.now() - t0, results };
