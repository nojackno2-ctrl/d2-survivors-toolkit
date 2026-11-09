// 自動淬鍊決策單元測試：node helper/tests/autoforge.cjs
const A = require("../autoforge.js");
let fail = 0; const ok = (c, m) => { if (!c) { fail++; console.error("✖ " + m); } else console.log("✔ " + m); };
const T = A.normalizeTargets({ s0: 5, s1: 3, s2: 2, s3: "X", s4: 0 });
const d = (counts, hellforgeUsed = false) => A.decideNext(T, { counts, hellforgeUsed }).action;

ok(T.s0.kind === "min" && T.s0.min === 5, "數字目標 → min");
ok(T.s3.kind === "x", "X → 禁止");
ok(T.s4.kind === "any", "0 → 不限");
let threw = false; try { A.normalizeTargets({ s0: -1 }); } catch { threw = true; } ok(threw, "負數目標拋錯");

ok(d({ s3: 1 }) === "clean", "命中 X → clean");
ok(d({ s3: 1, s0: 5, s1: 3, s2: 2 }) === "clean", "X 優先於達成判斷 → clean");
ok(d({ s4: 3 }) === "temper", "命中 0 不算失敗，總數不足 → temper");
ok(d({ s0: 4, s1: 3, s2: 2 }) === "temper", "總數 9 差一條 → temper");
ok(d({ s0: 5, s1: 3, s2: 2 }) === "hellforge", "總數 10 且達成 → hellforge");
ok(d({ s0: 5, s1: 3, s2: 2 }, true) === "done", "熔爐已用過且達成 → done");
ok(d({ s0: 6, s1: 3, s2: 2 }) === "hellforge", "超量命中仍達成 → hellforge");
ok(d({ s0: 5, s1: 3, s2: 1, s4: 1 }) === "clean", "總數 10 未達成 → clean");
ok(d({ s0: 5, s1: 3, s2: 1 }) === "temper", "總數 9 未達成 → temper");
ok(d({ s0: 5, s1: 3, s4: 2 }) === "clean", "總數 10 且 s2 不足 → clean");
ok(A.decideNext({ s0: { kind: "any", min: 0 } }, { counts: {} }).action === "done", "沒有任何需達成的目標 → done");

ok(A.afterHellforge("All tempers doubled").status === "done", "倍增 → done");
ok(A.afterHellforge("All tempers lost").status === "failed", "清空 → failed");
ok(A.afterHellforge("???").status === "unknown", "未知文字 → unknown");
ok(A.hellforgeFailed({ hf: 1 }) === true, "hf 且淬鍊清空 → 熔爐失敗");
ok(A.hellforgeFailed({ hf: 1, t: {} }) === true, "hf 且 t 為空物件 → 熔爐失敗");
ok(A.hellforgeFailed({ hf: 1, t: { s0: 20 } }) === false, "熔爐倍增後仍有淬鍊 → 非失敗");
ok(A.hellforgeFailed({ t: {} }) === false, "未熔爐（無 hf）→ 非失敗");
ok(A.hellforgeFailed(undefined) === false, "無 forge 紀錄 → 非失敗");

// 熔爐成功（倍增）的裝備不得再進入自動淬鍊
ok(A.hellforgeSucceeded({ hf: 1, t: { s0: 20 } }) === true, "hf 且仍有淬鍊 → 熔爐成功");
ok(A.hellforgeSucceeded({ hf: 1, t: {} }) === false, "hf 且清空 → 不是成功");
ok(A.hellforgeSucceeded({ t: { s0: 3 } }) === false, "未熔爐 → 不是成功");
ok(A.decideNext(T, { counts: { s0: 6, s1: 4, s2: 4 }, hellforgeUsed: true }).action === "done", "熔爐成功且未達成 → done，不 clean");
ok(A.decideNext(T, { counts: { s0: 10, s1: 6, s2: 4 }, hellforgeUsed: true }).action === "done", "熔爐成功且達成 → done");
ok(A.decideNext(T, { counts: { s3: 1 }, hellforgeUsed: true }).action === "done", "熔爐成功且命中 X → done，不 clean");
ok(A.decideNext(T, { counts: {}, hellforgeUsed: true }).action !== "done", "熔爐已用但清空（失敗）不被保護擋住");

// 模擬：邊界值
const sim0 = A.simulateOdds({ s0: { kind: "min", min: 2 } }, ["s0", "s1"], { runs: 2000, hellforgeRate: 0, seed: 7 });
ok(sim0.successRate === 0, "熔爐倍增率 0 → 成功率 0");
ok(sim0.hellforgeRate > 0.9, "熔爐倍增率 0 仍會跑到熔爐");
const sim1 = A.simulateOdds({ s0: { kind: "min", min: 1 } }, ["s0"], { runs: 2000, hellforgeRate: 1, seed: 7 });
ok(sim1.successRate > 0.99, "只需 s0≥1 且倍增率 1 → 幾乎必定成功");
const simA = A.simulateOdds({ s0: { kind: "min", min: 2 } }, ["s0", "s1"], { runs: 3000, seed: 3 });
const simB = A.simulateOdds({ s0: { kind: "min", min: 2 } }, ["s0", "s1"], { runs: 3000, seed: 3 });
ok(simA.successRate === simB.successRate && simA.essencesPerRun === simB.essencesPerRun, "同一種子結果一致（面板不會抖動）");
const simNone = A.simulateOdds({ s0: { kind: "any", min: 0 } }, ["s0"], { runs: 500, seed: 1 });
ok(simNone.successRate === 0, "沒有需達成的目標 → 不視為成功");

// 精確計算：手算值（4 條屬性、d 為 X、a、b 都 min 3）h≈0.0247、E≈349
const ex = A.exactOdds(A.normalizeTargets({ a: 3, b: 3, c: 0, d: "X" }), ["a", "b", "c", "d"]);
ok(Math.abs(ex.hitRate - 0.0247) < 0.0002, "精確 h 與手算一致（≈0.0247）");
ok(Math.abs(ex.essencesPerRun - 349) < 1, "精確 E 與手算一致（≈349）");
ok(Math.abs(ex.successRate - 5 / 18) < 1e-9, "精確成功率 = 熔爐倍增率 q");
// 與蒙地卡羅（大步數上限）在容差內一致
const mcBig = A.simulateOdds({ x: { kind: "min", min: 3 } }, ["x", "y"], { runs: 20000, seed: 5 });
const exSimple = A.exactOdds({ x: { kind: "min", min: 3 } }, ["x", "y"]);
ok(Math.abs(mcBig.essencesPerRun / exSimple.essencesPerRun - 1) < 0.05, "精確 E 與蒙地卡羅一致（相對誤差 < 5%）");
// 邊界：min 加總超過 10 → 不可能達成
const impossible = A.exactOdds(A.normalizeTargets({ a: 6, b: 6 }), ["a", "b"]);
ok(impossible.hitRate === 0 && impossible.successRate === 0 && impossible.essencesPerRun === null, "min 加總超過 10 → h=0、不可能達成");
// 邊界：目標屬性不在屬性列上
const missingKey = A.exactOdds(A.normalizeTargets({ z: 1 }), ["a", "b"]);
ok(missingKey.hitRate === 0, "目標屬性不在屬性列上 → h=0");
if (fail) { console.error(fail + " 項失敗"); process.exit(1); }
console.log("✔ 全部通過");
