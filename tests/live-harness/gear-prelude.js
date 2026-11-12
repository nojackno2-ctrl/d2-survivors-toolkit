// 評估前置：80 級、挑出該職業單技能傷害最高者設 20 級（讓 heroNumbers.Damage 有意義）。
{
  const kitIds = Object.keys(g.kit.skills || {});
  g.build.level = 80; g.world.player.level = 80;
  let best = null;
  for (const id of kitIds) {
    g.build.skills.splice(0); g.build.skills.push({ id, level: 20 });
    let d = 0; try { d = tools.gearNumbers(g, {}).Damage || 0; } catch {}
    if (!best || d > best.d) best = { id, d };
  }
  g.build.skills.splice(0); if (best) g.build.skills.push({ id: best.id, level: 20 });
  window.__mainSkill = best;
}
