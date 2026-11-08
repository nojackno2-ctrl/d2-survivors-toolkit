// 自動淬鍊決策（純函式，不碰遊戲）：給定裝備目前的淬鍊紀錄與玩家目標，決定下一步要做什麼。
// 實際的淬鍊、清除、熔爐由遊戲自己的 Game.forgeTry 執行，這裡只負責判斷。
//
// 目標（每條屬性）：
//   "X"   ＝禁止淬鍊：命中一次即視為失敗，必須清除重來。
//   0     ＝不限：命中不算失敗，也不計入目標。
//   正整數 N ＝至少要淬到 N 次（超過也可以）。
//
// 行為：
//   1. 有 X 屬性被命中 → clean（清除後重來）。
//   2. 所有目標都達成 → 若熔爐尚未使用，執行 hellforge；已使用則結束（done）。
//   3. 總淬鍊數已達上限（TEMPER_CAP）仍未達成 → clean。
//   4. 其餘情況 → temper。
// 熔爐（hellforge）每件只能用一次（遊戲會寫入 hf:1）：失敗（全部清空）後不能再熔爐，故結束（failed）。

const TEMPER_CAP = 10; // 熔爐可用的淬鍊門檻（實測：總數 10 後才能熔爐）。

// 將玩家設定正規化為 { 屬性: { kind: "x" | "any" | "min", min } }。非法值拋錯，避免靜默錯誤。
function normalizeTargets(spec) {
  const out = {};
  for (const [key, raw] of Object.entries(spec || {})) {
    if (raw === "X") out[key] = { kind: "x", min: 0 };
    else if (raw === 0 || raw === "0" || raw === undefined || raw === null || raw === "") out[key] = { kind: "any", min: 0 };
    else {
      const n = Number(raw);
      if (!Number.isInteger(n) || n < 0) throw new Error(`屬性 ${key} 的目標不合法：${raw}`);
      out[key] = n === 0 ? { kind: "any", min: 0 } : { kind: "min", min: n };
    }
  }
  return out;
}

// 目前淬鍊紀錄 forge.t（{ 屬性鍵: 次數 }）的總數。
function totalTempers(counts) {
  return Object.values(counts || {}).reduce((s, n) => s + (Number(n) || 0), 0);
}

// 決定下一步。state: { counts, hellforgeUsed }，counts 即 forge.t。
// 回傳 { action: "temper" | "clean" | "hellforge" | "done" | "failed", reason }
function decideNext(targets, state) {
  const counts = state.counts || {};
  for (const [key, t] of Object.entries(targets)) {
    if (t.kind === "x" && (counts[key] || 0) > 0) return { action: "clean", reason: `命中禁止屬性 ${key}` };
  }
  const mins = Object.entries(targets).filter(([, t]) => t.kind === "min");
  if (mins.length === 0) return { action: "done", reason: "沒有設定要達成的目標" };
  const met = mins.every(([key, t]) => (counts[key] || 0) >= t.min);
  const total = totalTempers(counts);
  if (total >= TEMPER_CAP) {
    if (!met) return { action: "clean", reason: `已達淬鍊上限 ${TEMPER_CAP} 仍未達成` };
    if (state.hellforgeUsed) return { action: "done", reason: "熔爐已用過，目標達成" };
    return { action: "hellforge", reason: "目標達成且淬鍊數已達 10，執行熔爐" };
  }
  return { action: "temper", reason: met ? "目標已達成，補足到 10 次淬鍊後熔爐" : "尚未達成目標" };
}

// 熔爐結果（遊戲回傳的文字）→ 下一個狀態。
// "All tempers doubled" 倍增；"All tempers lost" 清空（之後不可再熔爐，結束為 failed）。
function afterHellforge(text) {
  if (/doubled/i.test(String(text))) return { status: "done", counts: null };
  if (/lost/i.test(String(text))) return { status: "failed", counts: {} };
  return { status: "unknown", counts: null };
}

// 地獄熔爐是否已失敗：遊戲寫入 hf:1 且淬鍊清空（"All tempers lost"）。熔爐倍增後仍有淬鍊，不算失敗。
function hellforgeFailed(forge) {
  return !!forge?.hf && totalTempers(forge.t) === 0;
}

const AUTOFORGE = { TEMPER_CAP, normalizeTargets, totalTempers, decideNext, afterHellforge, hellforgeFailed };
if (typeof module !== "undefined" && module.exports) module.exports = AUTOFORGE;
else if (typeof window !== "undefined") window.__d2autoforge = AUTOFORGE;
