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
  // 熔爐已成功（倍增）的裝備不得再淬鍊或清除，否則會把倍增結果洗掉。
  if (state.hellforgeUsed && totalTempers(counts) > 0) return { action: "done", reason: "熔爐已成功，不進入自動淬鍊" };
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

// 熔爐成功（倍增）：遊戲寫入 hf 且仍有淬鍊。這類裝備不得再進入自動淬鍊。
function hellforgeSucceeded(forge) {
  return !!forge?.hf && totalTempers(forge.t) > 0;
}

// 實測樣本（AI_HANDOFF.md，僅供機率估計）：
//   淬鍊 228 次、成功 100 次；熔爐 18 次、倍增 5 次（第一批 10 次倍增 2、第二批 8 次倍增 3）。
// 不同裝備的屬性分布不同，故只用於「單次成功率」與「熔爐倍增率」的總體估計。
const TEMPER_SAMPLE = { attempts: 228, successes: 100 };
const HELLFORGE_SAMPLE = { attempts: 18, doubled: 5 };

// 可重現的亂數（mulberry32），讓同一組設定每次算出的數字一致。
function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// 蒙地卡羅模擬：依真實決策函式 decideNext 跑整個流程，估算當前目標下的結果。
// 模型假設：淬鍊成功率 p；成功時從遊戲給的屬性列中均勻選一條；熔爐倍增率 q；每次淬鍊與熔爐各耗 1 顆精華；清除不耗精華。
// 回傳 { successRate, hellforgeRate, essencesPerRun, essencesPerSuccess, runs }。
//   successRate：熔爐倍增且目標達成的比例（自動淬鍊的成功）。
//   hellforgeRate：流程中實際執行到熔爐的比例。
function simulateOdds(targets, lineKeys, opts = {}) {
  const runs = opts.runs ?? 20000;
  const p = opts.temperRate ?? TEMPER_SAMPLE.successes / TEMPER_SAMPLE.attempts;
  const q = opts.hellforgeRate ?? HELLFORGE_SAMPLE.doubled / HELLFORGE_SAMPLE.attempts;
  const maxSteps = 2000;
  const rng = mulberry32(opts.seed ?? 1);
  const keys = (lineKeys || []).filter(Boolean);
  let success = 0, reachedHf = 0, essTotal = 0, essSuccess = 0, nSuccess = 0;
  for (let run = 0; run < runs; run++) {
    let counts = {}, hf = false, ess = 0, outcome = null;
    for (let step = 0; step < maxSteps && outcome === null; step++) {
      const d = decideNext(targets, { counts, hellforgeUsed: hf });
      if (d.action === "done") { outcome = "done"; break; }
      if (d.action === "clean") { counts = {}; continue; }
      if (d.action === "hellforge") {
        ess += 1; reachedHf++; hf = true;
        if (rng() < q) { // 倍增：淬鍊數翻倍，達成判定由下一輪 decideNext 決定
          const doubled = {};
          for (const [k, v] of Object.entries(counts)) doubled[k] = v * 2;
          counts = doubled;
          outcome = "success";
        } else { counts = {}; outcome = "lost"; }
        break;
      }
      // temper
      ess += 1;
      if (keys.length && rng() < p) {
        const k = keys[Math.floor(rng() * keys.length)];
        counts[k] = (counts[k] || 0) + 1;
      }
    }
    if (outcome === "success") { success++; essSuccess += ess; nSuccess++; }
    essTotal += ess;
  }
  return {
    successRate: success / runs,
    hellforgeRate: reachedHf / runs,
    essencesPerRun: essTotal / runs,
    essencesPerSuccess: nSuccess ? essSuccess / nSuccess : null,
    runs,
  };
}

// 精確計算（取代面板上的蒙地卡羅，毫秒級完成，無亂數、無步數上限）。
// 一「回合」＝從空紀錄開始，直到「第 TEMPER_CAP 次命中」或「命中 X 屬性（清除）」為止。
// 只有命中才改變紀錄，未命中只花精華；命中均勻落在屬性列的 K 條上。
//   h ＝ 一回合走到熔爐的機率：前 10 次命中全都不是 X，且各 min 都達標。
//        用多項式係數計算：h = (Σ 多項式係數) × 10! / K^10。
//   H ＝ 一回合期望命中數 = Σ_{i=0..9} (1−r)^i，r = X 條數 ÷ K。
//   E ＝ 走到熔爐的期望精華 = H/(p·h) + 1（Wald 恆等式；+1 為熔爐本身）。
//   成功率 ＝ 熔爐倍增率 q（h>0 時必然會走到熔爐）。
//   每成功一件期望精華 ＝ E/q（熔爐失敗即換新裝重來）。
// 不可能達成（h=0）時 E 與 E/q 為 null。
function exactOdds(targets, lineKeys, opts = {}) {
  const p = opts.temperRate ?? TEMPER_SAMPLE.successes / TEMPER_SAMPLE.attempts;
  const q = opts.hellforgeRate ?? HELLFORGE_SAMPLE.doubled / HELLFORGE_SAMPLE.attempts;
  const N = TEMPER_CAP;
  const keys = [...new Set((lineKeys || []).filter(Boolean))];
  const K = keys.length;
  if (K === 0) return { hitRate: 0, successRate: 0, cyclesPerHellforge: null, essencesPerRun: null, essencesPerSuccess: null, runs: 0 };
  // 需達成的屬性若不在屬性列上，永遠無法達成。
  const missing = Object.entries(targets).some(([k, t]) => t.kind === "min" && !keys.includes(k));
  const fact = [1];
  for (let i = 1; i <= N; i++) fact[i] = fact[i - 1] * i;
  // 多項式乘法（僅保留次數 ≤ N）。每條屬性的因子為 Σ_{c 合法} t^c / c!。
  let poly = new Array(N + 1).fill(0);
  poly[0] = 1;
  let xCount = 0;
  for (const k of keys) {
    const t = targets[k];
    const g = new Array(N + 1).fill(0);
    if (t?.kind === "x") { xCount++; g[0] = 1; } // X：命中即清除，只允許 0 次
    else {
      const minC = t?.kind === "min" ? t.min : 0;
      for (let c = minC; c <= N; c++) g[c] = 1 / fact[c];
    }
    const next = new Array(N + 1).fill(0);
    for (let a = 0; a <= N; a++) {
      if (!poly[a]) continue;
      for (let b = 0; a + b <= N; b++) if (g[b]) next[a + b] += poly[a] * g[b];
    }
    poly = next;
  }
  const h = missing ? 0 : Math.min(1, poly[N] * fact[N] / Math.pow(K, N));
  const r = xCount / K;
  let H = 0;
  for (let i = 0; i < N; i++) H += Math.pow(1 - r, i);
  const successRate = h > 0 ? q : 0;
  if (h <= 0) return { hitRate: 0, successRate: 0, cyclesPerHellforge: null, essencesPerRun: null, essencesPerSuccess: null, runs: 0 };
  const E = H / (p * h) + 1;
  return {
    hitRate: h,
    successRate,
    cyclesPerHellforge: 1 / h,
    essencesPerRun: E,
    essencesPerSuccess: q > 0 ? E / q : null,
    runs: 0,
  };
}

const AUTOFORGE = { TEMPER_CAP, normalizeTargets, totalTempers, decideNext, afterHellforge, hellforgeFailed, hellforgeSucceeded, simulateOdds, exactOdds, TEMPER_SAMPLE, HELLFORGE_SAMPLE };
if (typeof module !== "undefined" && module.exports) module.exports = AUTOFORGE;
else if (typeof window !== "undefined") window.__d2autoforge = AUTOFORGE;
