// 頁面腳本：對語料出現的每種屬性，單獨裝在一件戒指／項鍊／武器／頭盔上，量 heroNumbers 各欄位變化，找出評分看不到的屬性。
const doll = g.ownGear(cls).doll, e = g.save.equippedByClass[cls];
for (const k of Object.keys(e || {})) delete e[k];
const base = tools.gearNumbers(g, {});
const stats = new Map(); // stat -> {n, vals: [], types:Set}
for (const x of corpus) for (const m of x.item.mods || []) { if (m.implicit || m.auto || m.staff) continue; const r = stats.get(m.stat) ?? { n: 0, vals: [], types: {} }; r.n++; if (r.vals.length < 200) r.vals.push(m.value); r.types[x.item.type] = (r.types[x.item.type] || 0) + 1; stats.set(m.stat, r); }
const mk = (type, base_, mods) => ({ id: "probe" + Math.random(), base: base_, type, rarity: "rare", name: "探針", level: 99, mods });
const probeTypes = [["ring", "Ring", "ring1"], ["amulet", "Amulet", "amulet"], ["head", "Helm", "head"], ["weapon", null, "weapon"]];
const weapons = corpus.map((x) => x.item).filter((i) => i.type === "weapon" && doll.canWear(i));
const out = [];
for (const [stat, r] of stats) {
  const sorted = r.vals.slice().sort((a, b) => a - b), val = sorted[Math.floor(sorted.length * 0.75)];
  const mod = { stat, value: val };
  const hit = {};
  for (const [type, b, slot] of probeTypes) {
    const it = type === "weapon" ? JSON.parse(JSON.stringify(weapons[0])) : mk(type, b, [mod]);
    if (type === "weapon") it.mods = [...(it.mods || []).filter((m) => m.implicit), mod];
    let nums, baseW; try { nums = tools.gearNumbers(g, { [slot]: it }); const z = JSON.parse(JSON.stringify(it)); z.mods = (z.mods || []).filter((m) => m.implicit); baseW = tools.gearNumbers(g, { [slot]: z }); } catch (err) { continue; }
    for (const k of Object.keys(nums)) if (Math.abs((nums[k] || 0) - (baseW[k] || 0)) > 1e-9) hit[k] = true;
  }
  out.push({ stat, n: r.n, val, changes: Object.keys(hit), topType: Object.entries(r.types).sort((a, b) => b[1] - a[1])[0][0] });
}
const scored = new Set(["Damage", "Life", "Damage Reduced", "Fire Resistance", "Cold Resistance", "Lightning Resistance", "Poison Resistance", "Defense", "Faster Cast Rate", "Replenish Life", "Magic Find"]);
return { base, blind: out.filter((o) => !o.changes.some((c) => scored.has(c))).sort((a, b) => b.n - a.n), seen: out.filter((o) => o.changes.some((c) => scored.has(c))).length, total: out.length, onlyUnscored: out.filter((o) => o.changes.length && !o.changes.some((c) => scored.has(c))).sort((a, b) => b.n - a.n).map((o) => o.stat + "→" + o.changes.join("/") + "(" + o.n + ")") };
