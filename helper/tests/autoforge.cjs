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
if (fail) { console.error(fail + " 項失敗"); process.exit(1); }
console.log("✔ 全部通過");
