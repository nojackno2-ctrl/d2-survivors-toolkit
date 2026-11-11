// 自動淬鍊：一次只處理鐵砧上的一件裝備。
// 直接讀取遊戲的鐵砧（g.anvil）上的裝備，用 g.forgeTry 執行淬鍊／清除／熔爐；不寫入存檔、不複製、不生成。
// 屬性目標依「稀有度＋名稱＋底材」記住，同一件獨特／套裝／符文之語再次放上鐵砧時自動帶入。
// 只要進入遊戲（有職業）就顯示面板。仰賴 window.__d2autoforge（決策）與 window.__d2autobot.game（遊戲）。
// 每步間隔：先用最短間隔衝速度；遇到伺服器限流（無回應）就自動放慢，之後連續成功再慢慢加快。
const SLEEP_MIN = 60;
const SLEEP_MAX = 600;
let stepGap = SLEEP_MIN;
const ESSENCE_NAME = "Burning Essence of Terror";
const MEM_KEY = "d2autoforge.memory";
const AUTOSELL_KEY = "d2autoforge.autosell";
const loadAutoSell = () => { try { return localStorage.getItem(AUTOSELL_KEY) === "1"; } catch (e) { return false; } };
// 同時淬鍊件數（1～10）：序列一次處理幾件。伺服器限流依 IP 計算，件數多只是更快用完額度。
// 「同款熔爐成功就略過其餘」開關（預設開）：關閉後序列中每一件同款都各自跑到熔爐。
const SKIPSAME_KEY = "d2autoforge.skipsame";
const loadSkipSame = () => { try { return localStorage.getItem(SKIPSAME_KEY) !== "0"; } catch (e) { return true; } };
const saveSkipSame = (v) => { try { localStorage.setItem(SKIPSAME_KEY, v ? "1" : "0"); } catch (e) { /* 無法寫入時只是不會記住 */ } };
const PARALLEL_KEY = "d2autoforge.parallel";
const PARALLEL_MAX = 10;
const clampParallel = (v) => Math.max(1, Math.min(PARALLEL_MAX, Math.floor(Number(v)) || 1));
const loadParallel = () => { try { return clampParallel(localStorage.getItem(PARALLEL_KEY)); } catch (e) { return 1; } };
const saveParallel = (v) => { try { localStorage.setItem(PARALLEL_KEY, String(v)); } catch (e) { /* 無法寫入時只是不會記住 */ } };
const saveAutoSell = (v) => { try { localStorage.setItem(AUTOSELL_KEY, v ? "1" : "0"); } catch (e) { /* 無法寫入時只是不會記住 */ } };
const KNOWN_RESULT = /Raised|temper failed|removed|doubled|lost/i;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const AF = () => window.__d2autoforge;
const game = () => window.__d2autobot?.game ?? null;
const wantedByItem = new Map();
function clearWant() { wantedByItem.clear(); window.__d2forgeLocal?.setWant(null); }

function essenceCount(g, cls) {
  const inv = g.save?.inventoryByClass?.[cls] || [];
  return inv.filter((i) => i?.type === "essence" && i.base === ESSENCE_NAME).reduce((s, i) => s + (i.count ?? 1), 0);
}

// 可淬鍊：獨特、套裝、符文之語，且有屬性。
const eligible = (it) => !!it && ["unique", "set", "runeword"].includes(it.rarity) && Array.isArray(it.mods) && it.mods.length > 0;

// 該角色的個人倉庫（與遊戲 stashTabs[角色] 相同）。
const stashOf = (g, cls) => g.save?.stashTabs?.[cls] || [];
// 鐵砧上的裝備：依 g.anvil 的 ID 在背包、個人倉庫與已裝備中尋找。
function anvilItem(g, cls) {
  const id = g.anvil;
  if (!id) return null;
  const pool = [...(g.inventoryOf?.(cls) || []), ...stashOf(g, cls), ...Object.values(g.save?.equippedByClass?.[cls] || {})];
  return pool.find((x) => x?.id === id) || null;
}

// 讀取裝備的淬鍊屬性列（遊戲自己的 forgeActions.view，需先把 anvil 指向該裝備）。
function lineList(g, cls, level, id) {
  g.anvil = id;
  const view = g.forgeActions?.(cls, level, () => {})?.view?.();
  return (view?.anvil?.lines || []).map((l) => ({ key: l.key, text: l.text || l.label || l.key })).filter((l) => l.key);
}

// ---- 記憶：同稀有度＋名稱＋底材共用目標設定 ----
const itemKey = (it) => [it.rarity, it.name, it.base].join("|");

// 名稱繁中化（序列、背包列表、狀態標題）：沿用共用字典 zh-TW.json。
// 字典尚未載入時顯示英文原名；字典載入後會自動重繪。
let zhDictAF = null, zhDictReq = false;
function ensureZhDict() {
  if (zhDictAF || zhDictReq || !window.__d2zhUrl) return;
  zhDictReq = true;
  const p = (window.__d2zhPromise ??= fetch(window.__d2zhUrl).then((r) => (r.ok ? r.json() : null)).catch(() => null));
  Promise.resolve(p).then((d) => { if (d && typeof d === "object") { zhDictAF = d; render(); } }, () => { /* 讀取失敗就維持英文 */ });
}
function zhItemName(it) {
  const name = String(it?.name || ""), base = String(it?.base || "");
  if (!zhDictAF) return `${name}（${base}）`;
  const zt = (s) => zhDictAF[s] || s;
  return `${zt(name)}（${zt(base)}）`;
}
function loadMemory() { try { return JSON.parse(localStorage.getItem(MEM_KEY) || "{}") || {}; } catch (e) { return {}; } }
function saveMemory(m) { try { localStorage.setItem(MEM_KEY, JSON.stringify(m)); } catch (e) { /* 無法寫入時仍可用，只是不會記住 */ } }
function rememberTargets(key, targets) { const m = loadMemory(); m[key] = { ...targets }; saveMemory(m); }

const state = {
  running: false, cls: null, level: 1, msg: "待命", log: [], folded: undefined,
  itemId: null, itemKey: null, itemObj: null, lines: [], targets: {}, steps: 0, result: "",
  // 序列：[{ id, name, status }]，依序放上鐵砧淬鍊。目標設定沿用記憶（同稀有度＋名稱＋底材）。
  queue: [], queueRunning: false,
  // 未升級統計（每件裝備的每次淬鍊重置）與警告文字。
  sinceUp: {}, warn: [],
  // 可淬鍊的來源：角色背包（"bag"）或該角色的個人倉庫（"stash"）。
  source: "bag",
  // 序列同時淬鍊的件數（1 為逐件）。
  parallel: loadParallel(),
  skipSame: loadSkipSame(),
  // 工具包手動開啟：不必在恰西鐵砧選單，從背包選裝備即可淬鍊。遊戲恢復執行（未暫停）且未在淬鍊時自動關閉。
  manual: false,
  // 地獄熔爐失敗：目前裝備的熔爐是否已失敗（遊戲寫入 hf 且淬鍊清空）；autoSell 為「失敗就自動售出」開關。
  hfFailed: false, hfSucceeded: false, autoSell: loadAutoSell(),
  // 伺服器無回應暫停的結束時間（毫秒時間戳）；0 代表沒有在暫停。
  pauseUntil: 0,
  // 暫停原因："limit"（429 限流）或 "retry"（無回應重試），供縮小圖示的提示文字使用。
  pauseKind: "",
  // 結束提示：{ kind: "ok"|"fail"|"done", text }。有提示時縮小圖示不會消失，直到使用者展開後收合或再次開始。
  notice: null,
};
// 淬鍊中每一步都會 push：只更新訊息、步數與結果文字，不重寫整個面板。
// 整塊重寫會在滑鼠按下與放開之間換掉按鈕，導致「掛機」等點擊失效。
function liveUpdate() {
  const b = box;
  if (!b?.isConnected || state.folded || !state.itemId) return false;
  const m = b.querySelector("#af-msg"), st = b.querySelector("#af-steps"), rs = b.querySelector("#af-result");
  if (!m || !st || !rs) return false;
  m.textContent = state.msg;
  st.textContent = state.steps + " 步";
  rs.textContent = state.result || "";
  return true;
}
function requestRender() {
  if (window.__d2afk) return; // 掛機中遮罩蓋住面板，喚醒時會完整重畫
  if (state.folded && box?.isConnected) { box.title = "自動淬鍊：" + state.msg; return; }
  if (state.running && liveUpdate()) return;
  render();
}
const push = (msg) => { state.msg = msg; state.log.push(msg); if (state.log.length > 60) state.log.shift(); requestRender(); };

// 讓面板對準鐵砧上的裝備：載入該裝備的屬性列，並帶入記住的目標。
function attach(g, cls, item) {
  state.cls = cls;
  state.itemId = item.id;
  state.itemKey = itemKey(item);
  state.itemObj = { name: item.name, base: item.base };
  state.lines = lineList(g, cls, state.level, item.id);
  const saved = loadMemory()[state.itemKey] || {};
  state.targets = {};
  for (const l of state.lines) state.targets[l.key] = saved[l.key] ?? 0;
  state.steps = 0;
  state.result = "";
  state.hfFailed = AF().hellforgeFailed(item.forge);
  state.hfSucceeded = AF().hellforgeSucceeded(item.forge);
}

// 把裝備賣給商人（遊戲 gearActions.sell）。
// 注意：遊戲的 sell 只會從「背包」（inventoryOf）以參照移除物品，且鐵砧開著時會被改成「放上鐵砧」。
// 因此：(1) 一律以 id 重新找到目前的物件（熔爐後存檔物件可能已換新，舊參照會對不上而賣不掉）；
// (2) 倉庫的裝備先用 fromStash 移回背包再賣；(3) 以 id 確認裝備確實已離開背包、倉庫與已裝備，才回報成功。
function sellItem(g, cls, item) {
  const id = item?.id;
  if (!id) return false;
  const prevUp = g.forgeUp, prevAnvil = g.anvil;
  const findNow = () => ownItem(g, cls, id);
  const inBag = () => (g.inventoryOf?.(cls) || []).some((x) => x?.id === id);
  const stillThere = () => !!findNow();
  try {
    g.forgeUp = false;
    g.anvil = null;
    const cur = findNow();
    if (cur && !inBag() && stashOf(g, cls).some((x) => x?.id === id)) {
      // 倉庫的裝備：先移回背包。fromStash 只在 gearActions 帶 stash 參數時存在。
      g.gearActions(cls, () => {}, true).fromStash(cur);
    }
    const now = findNow();
    if (now && inBag()) g.gearActions(cls, () => {}, true).sell(now);
  } catch (e) { /* 由下方檢查判斷是否成功 */ }
  finally { g.forgeUp = prevUp; }
  if (stillThere()) { g.anvil = prevAnvil; return false; }
  if (state.itemId && state.itemId !== id) return true; // 同時淬鍊：面板顯示的是別件，不動它
  state.hfFailed = false;
  state.itemId = null; state.itemKey = null; state.lines = []; state.targets = {}; state.itemObj = null;
  return true;
}

// 「未升級」警告：被選為目標（數值 > 0）的屬性，每次成功淬鍊後若沒有升級就累計；達 200 次跳出警告。
const UPGRADE_WARN_AT = 200;
function trackUpgrade(item, beforeT, ctx = state) {
  if (!item) return;
  const afterT = item.forge?.t ?? {};
  for (const [k, v] of Object.entries(ctx.targets || {})) {
    if (!(Number(v) > 0)) continue;
    if ((afterT[k] ?? 0) > (beforeT[k] ?? 0)) { ctx.sinceUp[k] = 0; continue; }
    ctx.sinceUp[k] = (ctx.sinceUp[k] || 0) + 1;
    if (ctx.sinceUp[k] === UPGRADE_WARN_AT) {
      const label = ctx.lines.find((l) => l.key === k)?.text || k;
      state.warn.push(`「${label}」成功淬煉 ${UPGRADE_WARN_AT} 次仍未升級，請確認目標是否可達`);
      push(`警告：${label} 已成功淬煉 ${UPGRADE_WARN_AT} 次仍未升級`);
    }
  }
}

// 一步：依目前紀錄決定淬鍊／清除／熔爐，或結束。回傳 { done, result }。
// ctx 預設為面板狀態（鐵砧單件）；同時淬鍊時每件各有自己的 ctx（itemId／targets／lines／steps／sinceUp），
// 此時不看鐵砧，直接依 ID 找裝備。遊戲的 forgeTry 在送出請求前就同步記下鐵砧上的 ID，
// 所以「指上鐵砧＋呼叫 forgeTry」在同一段同步程式內完成，多件即可同時送出而不互相干擾。
async function stepOnce(g, cls, ctx = state) {
  const solo = ctx === state;
  const item = solo ? anvilItem(g, cls) : ownItem(g, cls, ctx.itemId);
  if (!item) return { done: true, result: solo ? "鐵砧上沒有裝備，已停止" : "找不到裝備，已停止" };
  if (item.id !== ctx.itemId) return { done: true, result: "鐵砧裝備已更換，已停止" };
  if (essenceCount(g, cls) < 1) return { done: true, result: "燃燒的恐懼精華不足，已停止" };
  const d = AF().decideNext(AF().normalizeTargets(ctx.targets), { counts: item.forge?.t ?? {}, hellforgeUsed: !!item.forge?.hf });
  if (d.action === "done") return { done: true, result: d.reason };
  if (d.action === "temper" && window.__d2forgeLocal?.enabled() && window.__d2autobot?.settings?.cheat?.forgeLocalSure) {
    const targets = AF().normalizeTargets(ctx.targets);
    const pending = Object.entries(targets).filter(([k, t]) => t.kind === "min" && (item.forge?.t?.[k] || 0) < t.min).map(([k]) => k);
    wantedByItem.set(item.id, pending.length ? pending : Object.entries(targets).filter(([, t]) => t.kind !== "x").map(([k]) => k));
    window.__d2forgeLocal.setWant((id) => wantedByItem.get(id) || null);
  }
  g.anvil = item.id;
  const beforeT = { ...(item.forge?.t ?? {}) };
  const r = await g.forgeTry(cls, state.level, d.action, () => {});
  const text = r?.text || "";
  ctx.steps++;
  // 成功淬煉（Raised）才計入「未升級」統計。
  if (d.action === "temper" && /^Raised/i.test(text)) trackUpgrade(ownItem(g, cls, item.id), beforeT, ctx);
  // 同時淬鍊時多件一起扣精華，可能在檢查之後才不足：遊戲回「You need … Essence」。
  if (/You need .*Essence/i.test(text)) return { done: true, result: "燃燒的恐懼精華不足，已停止" };
  // 連線失敗時遊戲不會扣精華但也沒有結果，必須停止，避免無限重試。
  // 伺服器暫時無回應（實測多為 429 速率限制）：精華已暫存、不會遺失，改為暫停 1 分鐘後重試（最多 3 次）。
  if (/No reply|No connection/i.test(text)) return { done: false, retry: true, result: "伺服器暫時無回應" };
  // 伺服器與本地紀錄不同步時，遊戲會先把裝備改成伺服器上的最新結果（不扣精華），重新判斷即可。
  if (/updated to its last Forge result/i.test(text)) return { done: false, result: "已同步伺服器上的淬鍊紀錄" };
  // 只接受遊戲已知的鍛造結果；其他文字（例如「此裝備已鎖定」）代表遊戲拒絕，必須停止，否則會無限重試。
  if (!KNOWN_RESULT.test(text)) return { done: true, result: "遊戲拒絕或異常，已停止：" + text };
  if (d.action === "hellforge") {
    const h = AF().afterHellforge(text);
    return { done: true, failed: h.status === "failed", hfOk: h.status === "done", item, result: h.status === "done" ? "熔爐倍增，達成" : h.status === "failed" ? "熔爐清空，失敗" : "熔爐結果：" + text };
  }
  return { done: false, result: `${d.action === "temper" ? "淬鍊" : "清除"}：${text || "（無回應）"}` };
}

// 伺服器無回應：每次等 1 分鐘再重試，最多重試 3 次；仍無回應就放棄這一件（序列換下一件）。
const RETRY_PAUSE_MS = 60 * 1000;
const MAX_RETRIES = 3;
// 伺服器限流（429）會附 Retry-After（實測 3600 秒）：記下來，等滿該時間才重試，不再每分鐘白敲。
let lastRetryAfterMs = 0;
function hookForgeFetch() {
  if (window.__d2afFetchHooked || typeof window.fetch !== "function") return;
  window.__d2afFetchHooked = true;
  const rf = window.fetch;
  window.fetch = async function (u, o) {
    const r = await rf.apply(this, arguments);
    try {
      if (r.status === 429 && String(u?.url || u).includes("/forge")) {
        const sec = Number(r.headers.get("retry-after"));
        lastRetryAfterMs = sec > 0 ? Math.min(sec, 7200) * 1000 : 0;
      }
    } catch (e) { /* 讀不到標頭就維持 1 分鐘重試 */ }
    return r;
  };
}
hookForgeFetch();
// 暫停採分段等待，按「停止」時可立即中斷，不必等滿 1 分鐘。
async function pauseBeforeRetry(ms = RETRY_PAUSE_MS, kind = "retry") {
  state.pauseUntil = Date.now() + ms; state.pauseKind = kind;
  render();
  try {
    for (let t = 0; t < ms && state.running; t += 1000) await sleep(Math.min(1000, ms - t));
  } finally {
    state.pauseUntil = 0;
  }
}

// 倒數文字，例如「剩餘 04:59」；沒有在暫停則為空字串。
function pauseCountdownText() {
  if (!state.pauseUntil) return "";
  const s = Math.max(0, Math.ceil((state.pauseUntil - Date.now()) / 1000));
  return `（剩餘 ${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}）`;
}

// 淬鍊中仍可操作遊戲：遊戲每次送出淬鍊請求都會設 forgeBusy，期間角色／倉庫／收藏箱的操作（含切換分頁）
// 會被遊戲的 whileForgeIdle 直接丟棄（實測淬鍊時 forgeBusy 約佔 75%～90%）。
// 這裡把「丟棄」改成「等到空檔再執行」（步驟之間有間隔，約幾毫秒內就會執行）。
// 只對之後新開的商店／倉庫選單生效；已開著的選單需關掉重開一次。
function patchForgeIdle(g) {
  if (!g || g.__d2idlePatched || typeof g.whileForgeIdle !== "function") return;
  g.__d2idlePatched = true;
  g.whileForgeIdle = function (actions) {
    const self = this;
    return Object.fromEntries(Object.entries(actions).map(([k, fn]) => [k, typeof fn !== "function" ? fn : (...a) => {
      if (!self.forgeBusy) return fn(...a);
      const t0 = Date.now();
      const iv = setInterval(() => {
        if (self.forgeBusy && Date.now() - t0 < 8000) return;
        clearInterval(iv);
        if (!self.forgeBusy) { try { fn(...a); } catch (e) { /* 動作本身出錯就算了，與原本一致 */ } }
      }, 5);
    }]));
  };
}

// 單件迴圈：回傳 { result, fatal }；fatal 代表整個序列都該停（精華不足、手動停止）。
async function loop() {
  const g = game();
  if (!g) { push("找不到遊戲"); return { result: "找不到遊戲", fatal: true }; }
  let retries = 0, out = { result: "已停止", fatal: true };
  state.sinceUp = {}; state.warn = [];
  while (state.running) {
    let r;
    try { r = await stepOnce(g, state.cls); } catch (e) { r = { done: true, result: "錯誤：" + String(e?.message || e) }; }
    if (r.retry && lastRetryAfterMs > 0) {
      // 伺服器明講要等多久：等滿再繼續同一件，不算重試次數。
      const ms = lastRetryAfterMs + 5000; lastRetryAfterMs = 0;
      push(`伺服器限流（429），依 Retry-After 等待 ${Math.round(ms / 60000)} 分鐘後繼續`);
      await pauseBeforeRetry(ms, "limit");
      continue;
    }
    if (r.retry) {
      retries++;
      stepGap = Math.min(SLEEP_MAX, stepGap * 2);
      if (retries > MAX_RETRIES) {
        state.running = false;
        state.result = `伺服器無回應，已重試 ${MAX_RETRIES} 次，放棄此件`;
        out = { result: state.result, fatal: false }; push("結束：" + state.result); break;
      }
      push(`${r.result}（1 分鐘後重試，第 ${retries}/${MAX_RETRIES} 次）`);
      await pauseBeforeRetry();
      continue;
    }
    retries = 0;
    state.result = r.result;
    if (r.done) {
      state.running = false;
      if (r.failed && state.autoSell && r.item) {
        const ok = sellItem(g, state.cls, r.item);
        r.result = ok ? "熔爐失敗，已自動售出" : "熔爐失敗，自動售出未成功（遊戲拒絕或商人不收）";
      }
      state.result = r.result;
      out = { result: r.result, fatal: /精華不足/.test(r.result), hfOk: r.hfOk }; push("結束：" + r.result); break;
    }
    push(`第 ${state.steps} 步 ${r.result}`);
    if (state.steps % 10 === 0) stepGap = Math.max(SLEEP_MIN, Math.round(stepGap * 0.8));
    await sleep(stepGap);
  }
  if (!state.queueRunning && out.result !== "已停止") state.notice = { kind: out.hfOk ? "ok" : /失敗|放棄|錯誤|拒絕|不足/.test(out.result) ? "fail" : "done", text: out.result };
  if (!state.queueRunning) clearWant();
  render();
  return out;
}

// 當前職業背包裡可淬鍊的裝備。
// 熔爐已成功（倍增）的裝備不得進入自動淬鍊清單。
// 目前來源清單：背包或個人倉庫（依面板的「來源」選擇）。
const sourceList = (g, cls) => (state.source === "stash" ? stashOf(g, cls) : (g.inventoryOf?.(cls) || []));
// 只要用過地獄熔爐（成功倍增或失敗清空，遊戲都會寫入 forge.hf）就排除：每件只能熔爐一次，之後不能再淬鍊。
const usedHellforge = (x) => !!x?.forge?.hf;
const bagItems = (g, cls) => sourceList(g, cls).filter((x) => eligible(x) && !usedHellforge(x));
// 不論來源，依 ID 找序列中的裝備（背包、倉庫、已裝備皆可）。
const ownItem = (g, cls, id) => [...(g.inventoryOf?.(cls) || []), ...stashOf(g, cls), ...Object.values(g.save?.equippedByClass?.[cls] || {})].find((x) => x?.id === id) || null;
const hasTarget = (key) => Object.values(loadMemory()[key] || {}).some((v) => v === "X" || Number(v) > 0);

// 序列結束：統計成功／失敗件數，寫入訊息與縮小圖示的提示（手動停止不提示）。
function finishQueue(stopped) {
  clearWant();
  state.queueRunning = false; state.running = false; state.pauseUntil = 0;
  const ok = state.queue.filter((q) => /倍增/.test(q.status || "")).length;
  const bad = state.queue.filter((q) => /清空|熔爐失敗|放棄|錯誤|拒絕/.test(q.status || "")).length;
  const lack = state.queue.some((q) => /精華不足/.test(q.status || ""));
  const text = `序列${stopped ? "已停止" : "結束"}：成功 ${ok} 件、失敗 ${bad} 件${lack ? "（精華不足）" : ""}`;
  if (!stopped) state.notice = { kind: ok > 0 ? "ok" : bad > 0 || lack ? "fail" : "done", text };
  push(text);
  render();
}
// 同時淬鍊：只更新序列該列的狀態文字，不重畫整個面板。
function setQueueStatus(q, text) {
  q.status = text;
  if (!box?.isConnected || state.folded) return;
  const el = [...box.querySelectorAll("[data-qs]")].find((x) => x.dataset.qs === q.id);
  if (el) el.textContent = text;
}
// 伺服器限流的共同等待：任何一件收到 429 就設定 state.pauseUntil，所有件都等到時間到。
async function waitGate() {
  while (state.queueRunning && Date.now() < state.pauseUntil) await sleep(1000);
  if (state.pauseUntil && Date.now() >= state.pauseUntil) state.pauseUntil = 0;
}
// 同時淬鍊中的單件迴圈（不使用面板狀態）。回傳 { result, hfOk, fatal }。
async function runItem(g, cls, q, item, hfDone, shared) {
  const key = itemKey(item);
  const lines = lineList(g, cls, state.level, item.id);
  const saved = loadMemory()[key] || {};
  const ctx = { itemId: item.id, targets: {}, lines, steps: 0, sinceUp: {} };
  for (const l of lines) ctx.targets[l.key] = saved[l.key] ?? 0;
  let retries = 0;
  while (state.queueRunning && !shared.fatal) {
    await waitGate();
    if (!state.queueRunning || shared.fatal) break;
    if (state.skipSame && hfDone.has(key)) return { result: "同款已熔爐成功，略過" };
    let r;
    try { r = await stepOnce(g, cls, ctx); } catch (e) { r = { done: true, result: "錯誤：" + String(e?.message || e) }; }
    state.steps++;
    if (r.retry) {
      if (lastRetryAfterMs > 0) {
        const ms = lastRetryAfterMs + 5000; lastRetryAfterMs = 0;
        const fresh = !(state.pauseUntil > Date.now());
        state.pauseUntil = Math.max(state.pauseUntil, Date.now() + ms); state.pauseKind = "limit";
        if (fresh) { push(`伺服器限流（429），依 Retry-After 等待 ${Math.round(ms / 60000)} 分鐘後繼續`); render(); }
      }
      if (state.pauseUntil > Date.now()) { setQueueStatus(q, `等待限流解除（${ctx.steps} 步）`); continue; }
      retries++;
      stepGap = Math.min(SLEEP_MAX, stepGap * 2);
      if (retries > MAX_RETRIES) return { result: `伺服器無回應，已重試 ${MAX_RETRIES} 次，放棄此件` };
      setQueueStatus(q, `無回應，1 分鐘後重試（${retries}/${MAX_RETRIES}）`);
      for (let t = 0; t < RETRY_PAUSE_MS && state.queueRunning && !shared.fatal; t += 1000) await sleep(1000);
      continue;
    }
    retries = 0;
    if (r.done) {
      if (r.failed && state.autoSell && r.item) {
        const ok = sellItem(g, cls, r.item);
        r.result = ok ? "熔爐失敗，已自動售出" : "熔爐失敗，自動售出未成功（遊戲拒絕或商人不收）";
      }
      return { result: r.result, hfOk: r.hfOk, fatal: /精華不足/.test(r.result) };
    }
    setQueueStatus(q, `淬鍊中（${ctx.steps} 步）`);
    if (ctx.steps % 10 === 0) stepGap = Math.max(SLEEP_MIN, Math.round(stepGap * 0.8));
    await sleep(stepGap);
  }
  return { result: "已停止" };
}
// 序列（同時 n 件）：n 個工作者各自從序列取下一件，跑完再取，直到序列取完。
async function runQueueParallel(g, cls, n) {
  state.queueRunning = true; state.running = true; state.pauseUntil = 0; state.warn = []; state.steps = 0;
  for (const q of state.queue) q.status = q.status === "完成" ? q.status : "等待";
  const hfDone = new Set();
  for (const q of state.queue) {
    const o = ownItem(g, cls, q.id);
    if (o && AF().hellforgeSucceeded(o.forge)) state.skipSame && hfDone.add(itemKey(o));
  }
  const shared = { fatal: false };
  const list = state.queue.slice();
  let next = 0;
  push(`序列：同時淬鍊 ${n} 件`);
  render();
  const worker = async () => {
    while (state.queueRunning && !shared.fatal) {
      const q = list[next++];
      if (!q) return;
      if (q.status === "完成") continue;
      const raw = ownItem(g, cls, q.id);
      if (raw && hfDone.has(itemKey(raw)) && !usedHellforge(raw)) { setQueueStatus(q, "同款已熔爐成功，略過"); continue; }
      if (raw && usedHellforge(raw)) { setQueueStatus(q, "已用過地獄熔爐，略過"); continue; }
      const item = raw && eligible(raw) ? raw : null;
      if (!item) { setQueueStatus(q, "不在背包或倉庫，略過"); continue; }
      if (!hasTarget(itemKey(item))) { setQueueStatus(q, "未設定目標，略過"); continue; }
      setQueueStatus(q, "淬鍊中");
      const r = await runItem(g, cls, q, item, hfDone, shared);
      setQueueStatus(q, r.result);
      if (r.hfOk) state.skipSame && hfDone.add(itemKey(item));
      if (r.fatal) shared.fatal = true;
    }
  };
  await Promise.all(Array.from({ length: n }, worker));
  const stopped = !state.queueRunning;
  finishQueue(stopped);
}

// 序列：一件一件放上鐵砧，跑到該件結束再換下一件（同時淬鍊件數 > 1 時改走 runQueueParallel）。
async function runQueue() {
  const g = game();
  if (!g || state.running) return;
  const cls = g.kit?.id;
  if (state.parallel > 1) return runQueueParallel(g, cls, clampParallel(state.parallel));
  state.queueRunning = true;
  for (const q of state.queue) q.status = q.status === "完成" ? q.status : "等待";
  // 同款裝備（稀有度＋名稱＋底材）只要有一件地獄熔爐成功，其餘同款就跳過。
  const hfDone = new Set();
  for (const q of state.queue) {
    const o = ownItem(g, cls, q.id);
    if (o && AF().hellforgeSucceeded(o.forge)) state.skipSame && hfDone.add(itemKey(o));
  }
  for (const q of state.queue) {
    if (!state.queueRunning) break;
    if (q.status === "完成") continue;
    const raw = ownItem(g, cls, q.id);
    if (raw && hfDone.has(itemKey(raw)) && !usedHellforge(raw)) { q.status = "同款已熔爐成功，略過"; render(); continue; }
    if (raw && usedHellforge(raw)) { q.status = "已用過地獄熔爐，略過"; render(); continue; }
    const item = raw && eligible(raw) ? raw : null;
    if (!item) { q.status = "不在背包或倉庫，略過"; render(); continue; }
    if (!hasTarget(itemKey(item))) { q.status = "未設定目標，略過"; render(); continue; }
    g.anvil = item.id;
    attach(g, cls, item);
    lastItemId = item.id;
    q.status = "淬鍊中";
    state.running = true; push(`序列：開始 ${zhItemName(q)}`);
    const r = await loop();
    q.status = r.result;
    if (r.hfOk) state.skipSame && hfDone.add(itemKey(item));
    if (r.fatal) break;
    await sleep(stepGap);
  }
  finishQueue(!state.queueRunning);
}

// ---- 浮動面板（固定右上，不放在恰西商店裡） ----
let box = null;
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

function ensureBox() {
  if (box?.isConnected) return box;
  box = document.createElement("div");
  box.id = "d2autoforge-panel";
  // 窄螢幕（手機）：避開遊戲左上角的輔助／語言／修改器按鈕，寬度跟著螢幕，預設收合。
  const narrow = window.innerWidth < 600;
  box.style.cssText = narrow
    ? "position:fixed;top:8vh;right:8px;z-index:2147483000;width:calc(100vw - 16px);max-height:80vh;overflow:auto;padding:12px 14px;border:1px solid #d4a84a;border-radius:8px;background:rgba(20,17,13,.94);color:#e8dcc4;font:15px/1.6 sans-serif;"
    : "position:fixed;top:12px;right:12px;z-index:2147483000;width:480px;max-height:88vh;overflow:auto;padding:14px 16px;border:1px solid #d4a84a;border-radius:8px;background:rgba(20,17,13,.94);color:#e8dcc4;font:15px/1.6 sans-serif;";
  if (state.folded === undefined) state.folded = true;
  box.dataset.full = box.style.cssText;
  box.addEventListener("pointerdown", (e) => e.stopPropagation());
  box.addEventListener("keydown", (e) => e.stopPropagation());
  document.body.append(box);
  return box;
}

// 依目前目標與屬性列做精確計算（毫秒級，無亂數；不再使用蒙地卡羅）。
function oddsHtml() {
  let targets;
  try { targets = AF().normalizeTargets(state.targets); } catch (e) { return `<div style="color:#e88">${esc(e.message || String(e))}</div>`; }
  if (!Object.values(targets).some((t) => t.kind === "min")) {
    return '<div style="opacity:.8;font-size:13px">目前沒有要達成的屬性（都是 0 或 X），自動淬鍊不會執行熔爐。</div>';
  }
  const keys = state.lines.map((l) => l.key);
  const r = AF().exactOdds(targets, keys);
  const pct = (x) => `${(x * 100).toFixed(1)}%`;
  const { attempts: ta, successes: ts } = AF().TEMPER_SAMPLE;
  const { attempts: ha, doubled: hd } = AF().HELLFORGE_SAMPLE;
  const body = r.hitRate > 0
    ? `<div>・每回合走到熔爐的機率：<b>${pct(r.hitRate)}</b>（約需清除 ${Math.round(r.cyclesPerHellforge).toLocaleString()} 次才會走到熔爐）</div>
    <div>・熔爐倍增率約 ${pct(r.successRate)}：自動淬鍊的成功率即為此值（達標後必定會走到熔爐）</div>
    <div>・走到熔爐平均耗精華 ${r.essencesPerRun.toLocaleString(undefined, { maximumFractionDigits: 0 })}；期望每成功一件約 ${r.essencesPerSuccess.toLocaleString(undefined, { maximumFractionDigits: 0 })}（熔爐失敗即換新裝重來）</div>`
    : `<div style="color:#f08070">此設定在 ${AF().TEMPER_CAP} 次淬鍊內不可能同時達標（需達成的屬性加總超過 ${AF().TEMPER_CAP}，或屬性不在屬性列上），自動淬鍊無法成功。</div>`;
  return `<div style="background:#2a241b;border-radius:6px;padding:6px 8px;margin:4px 0;font-size:13px">
    <div>依目前設定精確計算：</div>
    ${body}
    <div style="opacity:.75;margin-top:2px">依實測：單次淬鍊成功率約 ${pct(ts / ta)}（${ta} 次淬鍊）、熔爐倍增率約 ${pct(hd / ha)}（${ha} 次熔爐）。屬性分布以平均估計，實際依裝備而異。不含官方升級（基底升級）機率，自動淬鍊不會執行升級。</div>
  </div>`;
}

// 縮小圖示旁的提示：限流／無回應等待（含倒數）優先，其次是結束提示（成功、失敗）。
function foldLabel() {
  if (state.pauseUntil > Date.now()) return { color: "#f0a040", text: (state.pauseKind === "limit" ? "被伺服器限流，等待中" : "伺服器無回應，等待重試") + pauseCountdownText() };
  if (state.notice) return { color: state.notice.kind === "ok" ? "#6d6" : state.notice.kind === "fail" ? "#f08070" : "#d4a84a", text: state.notice.text };
  return { color: "", text: "" };
}
function render() {
  ensureZhDict();
  const g = game();
  if (!g || window.__d2afk) return;
  const b = ensureBox();
  // 收合：只顯示一個小圖示（執行中會亮綠點），點了才展開成完整面板。
  if (state.folded) {
    const narrow = window.innerWidth < 600;
    b.style.cssText = `position:fixed;${narrow ? "top:44vh" : "top:12px"};right:8px;z-index:2147483000;width:40px;height:40px;padding:0;border:1px solid #d4a84a;border-radius:50%;background:rgba(20,17,13,.94);color:#d4a84a;font:20px/40px sans-serif;text-align:center;cursor:pointer;overflow:visible;`;
    b.title = "自動淬鍊：" + state.msg;
    const fl = foldLabel();
    const dot = fl.color || (state.running ? "#5c5" : "");
    b.innerHTML = `⚒${dot ? `<span style="position:absolute;top:0;right:0;width:11px;height:11px;border-radius:50%;background:${dot}"></span>` : ""}${fl.text ? `<span id="af-foldlabel" style="position:absolute;right:48px;top:4px;white-space:nowrap;padding:0 10px;border:1px solid ${fl.color};border-radius:6px;background:rgba(20,17,13,.94);color:${fl.color};font:14px/30px sans-serif">${esc(fl.text)}</span>` : ""}`;
    b.onclick = () => { state.folded = false; render(); };
    return;
  }
  b.onclick = null;
  b.title = "";
  if (b.dataset.full) b.style.cssText = b.dataset.full;
  const lineSel = state.lines.map((l) => {
    const v = state.targets[l.key] ?? 0;
    const opts = ["X", 0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((o) => `<option value="${o}"${String(o) === String(v) ? " selected" : ""}>${o === "X" ? "X 禁止" : o === 0 ? "0 不限" : o}</option>`).join("");
    return `<div style="display:flex;gap:6px;align-items:center;margin:2px 0"><span style="flex:1">${esc(l.text)}</span><select data-key="${esc(l.key)}" style="background:#2a241b;color:#e8dcc4">${opts}</select></div>`;
  }).join("");
  const oddsLine = state.itemId ? oddsHtml() : "";
  const hfNotice = state.hfFailed ? '<div style="color:#f08070;font-weight:bold">⚠ 地獄熔爐已失敗（裝備已清空）</div>'
    : state.hfSucceeded ? '<div style="color:#d4a84a;font-weight:bold">✔ 地獄熔爐已成功（倍增），不進入自動淬鍊</div>' : "";
  const autoSellBox = `<label style="display:flex;gap:6px;align-items:center;margin-top:4px;cursor:pointer"><input id="af-autosell" type="checkbox"${state.autoSell ? " checked" : ""}> 地獄熔爐失敗就自動售出</label>`;
  const itemLine = state.itemId
    ? `<div><b>${esc(state.itemObj ? zhItemName(state.itemObj) : "")}</b> <span id="af-steps" style="opacity:.85">${state.steps} 步</span></div>${hfNotice}<div style="opacity:.85"><span id="af-result">${esc(state.result || "")}</span> <b id="af-cd" style="color:#d4a84a">${pauseCountdownText()}</b></div>`
    : `<div style="opacity:.8">${g.forgeUp ? "請把獨特、套裝或符文之語放到恰西的鐵砧上。" : "請在下方「背包可淬鍊」點「選取」，挑一件獨特、套裝或符文之語。"}</div>`;
  // 控制列放在面板最上方：標題與「開始／停止／收合」同一排（按鈕加大），淬鍊狀態獨立一排。
  // 「開始」有序列就依序淬鍊，沒有序列就淬鍊鐵砧上這件。
  const bigBtn = "font-size:17px;padding:6px 16px;min-height:38px;";
  const canStart = !state.running && !state.queueRunning && (state.queue.length > 0 || (!!state.itemId && !state.hfSucceeded));
  const head = `<div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin-bottom:6px">
      <b style="flex:1;color:#d4a84a">自動淬鍊</b>
      <button id="af-start" type="button" style="${bigBtn}"${canStart ? "" : " disabled"} title="序列有裝備就依序淬鍊，否則淬鍊鐵砧上的這件">開始</button>
      <button id="af-stop" type="button" style="${bigBtn}"${state.running || state.queueRunning ? "" : " disabled"}>停止</button>
      <button id="af-fold" type="button" style="${bigBtn}">收合</button>
    </div>`;
  const controlRow = `<div id="af-msg" style="margin-bottom:6px;padding:4px 8px;border-radius:4px;background:#2a241b;opacity:.95">${esc(state.msg)}</div>`;
  b.innerHTML = `
    ${head}
    ${controlRow}
    ${itemLine}
    ${state.warn?.length ? `<div style="margin-top:4px;padding:4px 6px;border:1px solid #c44;border-radius:4px;background:#3a1212;color:#f88">${state.warn.map((w) => esc(w)).join("<br>")}</div>` : ""}
    <div style="border-top:1px solid #4a3d25;margin-top:6px;padding-top:6px">${oddsLine}${lineSel || ""}</div>
    ${autoSellBox}
    <label style="display:flex;gap:6px;align-items:center;margin-top:4px;cursor:pointer" title="序列中同稀有度、名稱、底材的裝備，只要一件地獄熔爐成功，其餘就不再淬鍊。關閉後每一件都各自跑到熔爐"><input id="af-skipsame" type="checkbox"${state.skipSame ? " checked" : ""}> 同款熔爐成功就略過其餘同款</label>
    ${state.itemId ? '<div style="opacity:.7;margin-top:4px">設定會自動記住（同稀有度、名稱與底材共用）。</div>' : ""}
    ${queueHtml(g)}`;
  // 必須阻止冒泡：否則同一次點擊會傳到外框，觸發收合後才掛上的「點圖示展開」而立刻又展開。
  // 手動開啟的面板收合即關閉（之後由工具包再開）；鐵砧選單開著時仍只是收成圖示。
  b.querySelector("#af-fold").onclick = (e) => { e.stopPropagation(); state.folded = true; state.notice = null; if (state.manual && !g.forgeUp) state.manual = false; render(); };
  b.querySelectorAll("select[data-key]").forEach((sel) => sel.onchange = () => {
    const v = sel.value;
    state.targets[sel.dataset.key] = v === "X" ? "X" : Number(v);
    rememberTargets(state.itemKey, state.targets);
    render();
  });
  b.querySelector("#af-autosell").onchange = (e) => {
    state.autoSell = !!e.target.checked; saveAutoSell(state.autoSell);
    // 開關打開時，若鐵砧上已是熔爐失敗的裝備，立刻售出（不必等下一次開啟鐵砧）。
    if (state.autoSell && !state.running && g.kit?.id) {
      const it = anvilItem(g, g.kit.id);
      // 魔法裝備的淬鍊會被遊戲還原，不能因此自動售出。
      if (eligible(it) && AF().hellforgeFailed(it.forge)) { const ok = sellItem(g, g.kit.id, it); push(ok ? "地獄熔爐已失敗，已自動售出" : "地獄熔爐已失敗，自動售出未成功（遊戲拒絕或商人不收）"); }
    }
    render();
  };
  b.querySelector("#af-start").onclick = () => {
    if (state.running || state.queueRunning) return;
    state.notice = null;
    // 序列有裝備：依序淬鍊（同一顆按鈕，不再另有「開始序列」）。
    if (state.queue.length) return runQueue();
    if (!state.itemId) return;
    try { AF().normalizeTargets(state.targets); } catch (e) { return push(e.message || String(e)); }
    state.running = true; push("開始");
    loop();
  };
  b.querySelector("#af-stop").onclick = () => { state.running = false; state.queueRunning = false; clearWant(); push("已停止"); };
  // 選取：把背包裡的裝備放上「鐵砧」（遊戲內部狀態），tick 會自動載入它的屬性與記住的目標。
  b.querySelectorAll("[data-select]").forEach((x) => x.onclick = () => { if (!state.running) { g.anvil = x.dataset.select; lastItemId = undefined; render(); } });
  b.querySelectorAll("[data-add]").forEach((x) => x.onclick = () => {
    const it = bagItems(g, g.kit?.id).find((i) => i.id === x.dataset.add);
    if (it && !state.queue.some((q) => q.id === it.id)) state.queue.push({ id: it.id, name: it.name, base: it.base, status: "等待" });
    render();
  });
  // 一鍵加入同名：同稀有度、名稱、底材的裝備（背包或倉庫，依來源）全部加入序列。
  b.querySelectorAll("[data-addsame]").forEach((x) => x.onclick = () => {
    const key = x.dataset.addsame;
    for (const it of bagItems(g, g.kit?.id)) if (itemKey(it) === key && !state.queue.some((q) => q.id === it.id)) state.queue.push({ id: it.id, name: it.name, base: it.base, status: "等待" });
    render();
  });
  b.querySelectorAll("[data-source]").forEach((x) => x.onclick = () => { if (!state.running && !state.queueRunning) { state.source = x.dataset.source; render(); } });
  b.querySelectorAll("[data-del]").forEach((x) => x.onclick = () => { if (state.queueRunning) return; state.queue = state.queue.filter((q) => q.id !== x.dataset.del); render(); });
  // 點序列中的名稱：放上鐵砧，方便設定該件的目標。
  b.querySelectorAll("[data-pick]").forEach((x) => x.onclick = () => { if (!state.running) { g.anvil = x.dataset.pick; render(); } });
  b.querySelector("#af-skipsame").onchange = (e) => { state.skipSame = !!e.target.checked; saveSkipSame(state.skipSame); };
  const par = b.querySelector("#af-parallel");
  if (par) par.onchange = () => { if (state.queueRunning) return; state.parallel = clampParallel(par.value); saveParallel(state.parallel); render(); };
  const qc = b.querySelector("#af-qclear");
  if (qc) qc.onclick = () => { if (!state.queueRunning) { state.queue = []; render(); } };
}

function queueHtml(g) {
  const cls = g.kit?.id;
  const inQ = new Set(state.queue.map((q) => q.id));
  const bag = bagItems(g, cls).filter((i) => !inQ.has(i.id));
  const btn = "background:#2a241b;color:#e8dcc4;border:1px solid #6a5530;border-radius:4px;padding:0 6px;";
  const qRows = state.queue.map((q, i) => {
    const it = ownItem(g, cls, q.id);
    const warn = it && !hasTarget(itemKey(it)) ? ' <span style="color:#e88">（未設目標）</span>' : "";
    return `<div style="display:flex;gap:6px;align-items:center;margin:2px 0"><span style="opacity:.7">${i + 1}.</span><a data-pick="${esc(q.id)}" style="flex:1;cursor:pointer;text-decoration:underline">${esc(zhItemName(q))}</a>${warn}<span data-qs="${esc(q.id)}" style="opacity:.85;font-size:13px">${esc(q.status || "")}</span><button type="button" data-del="${esc(q.id)}" style="${btn}"${state.queueRunning ? " disabled" : ""}>移除</button></div>`;
  }).join("");
  // 同名（同稀有度、名稱、底材）且尚未在序列中的件數，供「加入同名」按鈕顯示。
  const sameCount = (it) => bag.filter((x) => itemKey(x) === itemKey(it)).length;
  const bagRows = bag.map((it) => `<div style="display:flex;gap:6px;align-items:center;margin:2px 0"><span style="flex:1">${esc(zhItemName(it))}</span><button type="button" data-select="${esc(it.id)}" style="${btn}"${state.running ? " disabled" : ""}>選取</button><button type="button" data-add="${esc(it.id)}" style="${btn}">加入</button><button type="button" data-addsame="${esc(itemKey(it))}" style="${btn}" title="把同名、同底材的裝備全部加入序列">加入同名（${sameCount(it)}）</button></div>`).join("");
  const srcBtn = (key, label) => `<button type="button" data-source="${key}" style="${btn}${state.source === key ? "border-color:#d4a84a;color:#d4a84a;" : ""}"${state.running || state.queueRunning ? " disabled" : ""}>${label}</button>`;
  const sourceRow = `<div style="display:flex;gap:6px;align-items:center;margin:4px 0"><span style="opacity:.8">來源：</span>${srcBtn("bag", "角色背包")}${srcBtn("stash", "個人倉庫")}</div>`;
  return `
    <div style="border-top:1px solid #4a3d25;margin-top:8px;padding-top:6px">
      <b style="color:#d4a84a">序列（${state.queue.length}）</b>
      <div style="opacity:.7;font-size:13px">點名稱可放上鐵砧設定目標；未設目標的會略過。</div>
      ${qRows || '<div style="opacity:.7">尚未加入</div>'}
      <div style="display:flex;gap:6px;margin-top:6px">
        <button id="af-qclear" type="button"${state.queueRunning || !state.queue.length ? " disabled" : ""}>清空</button>
        <label style="display:flex;gap:4px;align-items:center;margin-left:auto" title="序列一次同時淬鍊幾件。伺服器限流依 IP 計算（約每 1200 次擋 1 小時），件數多只是更快用完額度">同時淬鍊 <select id="af-parallel" style="background:#2a241b;color:#e8dcc4"${state.queueRunning ? " disabled" : ""}>${Array.from({ length: PARALLEL_MAX }, (_, i) => `<option value="${i + 1}"${state.parallel === i + 1 ? " selected" : ""}>${i + 1}</option>`).join("")}</select> 件</label>
      </div>
    </div>
    <div style="border-top:1px solid #4a3d25;margin-top:8px;padding-top:6px">
      <b style="color:#d4a84a">${state.source === "stash" ? "個人倉庫" : "背包"}可淬鍊（${bag.length}）</b>
      ${sourceRow}
      ${bagRows || `<div style="opacity:.7">${state.source === "stash" ? "個人倉庫" : "背包"}沒有獨特、套裝或符文之語</div>`}
    </div>`;
}

// 每秒檢查：鐵砧選單開啟才顯示；鐵砧上的裝備換了才重新載入（執行中不切換）。
let lastItemId = undefined;
// 遊戲暫停中（與輔助器、語言相同的判定）。
const pausedNow = () => document.body.classList.contains("frontend-over-run") || document.body.classList.contains("frontend-open")
  || (() => { const p = document.getElementById("paused"); return !!p && !p.classList.contains("hidden") && getComputedStyle(p).display !== "none"; })();
function tick() {
  const g = game();
  patchForgeIdle(g);
  // 手動開啟：遊戲恢復執行、且沒有在淬鍊時，自動關閉，避免面板擋住遊戲畫面。
  if (state.manual && !state.running && !state.queueRunning && !pausedNow()) state.manual = false;
  // 顯示條件：恰西鐵砧選單開著（g.forgeUp），或由工具包手動開啟；執行中也保留。
  const ready = !!g && !!g.kit?.id && (!!g.forgeUp || state.manual || state.running || state.queueRunning || !!state.notice);
  if (!ready) { box?.remove(); box = null; return; }
  const item = anvilItem(g, g.kit.id);
  const id = item?.id ?? null;
  if (!state.running && id !== lastItemId) {
    lastItemId = id;
    if (item && usedHellforge(item)) {
      // 用過地獄熔爐（成功或失敗）的裝備不載入面板；開啟自動售出時，熔爐失敗的照樣售出。
      state.itemId = null; state.itemKey = null; state.lines = []; state.targets = {}; state.itemObj = null; state.hfFailed = false; state.hfSucceeded = false;
      if (eligible(item) && AF().hellforgeFailed(item.forge) && state.autoSell) { const ok = sellItem(g, g.kit.id, item); push(ok ? "地獄熔爐已失敗，已自動售出" : "地獄熔爐已失敗，自動售出未成功"); }
    } else if (item && eligible(item)) {
      attach(g, g.kit.id, item);
    } else { state.itemId = null; state.itemKey = null; state.lines = []; state.targets = {}; state.itemObj = null; state.hfFailed = false; state.hfSucceeded = false; }
    render();
  } else if (!box?.isConnected) {
    state.cls = g.kit.id;
    render();
  }
}
setInterval(tick, 300);
// 暫停倒數：每秒只更新倒數文字，不重畫整個面板（避免打斷下拉選單操作）。
setInterval(() => { const el = document.getElementById("af-cd"); if (el) el.textContent = pauseCountdownText();
  // 縮小圖示的提示：倒數每秒更新；等待開始或結束時（提示出現／消失）重畫圖示。
  if (state.folded && box?.isConnected) {
    const fl = foldLabel(), lab = document.getElementById("af-foldlabel");
    if (lab && fl.text) lab.textContent = fl.text; else if (!!lab !== !!fl.text) render();
  }
}, 1000);

// 測試掛鉤（實機腳本）：把指定裝備放上鐵砧並啟動。slots: [{ id, targets }]，只取第一件。
window.__d2autoforgeUI = {
  state,
  // 工具包呼叫：不必在恰西鐵砧，直接開啟面板（需已進入遊戲）。回傳是否成功開啟。
  open() {
    const g = game();
    if (!g?.kit?.id) return false;
    state.manual = true; state.folded = false; lastItemId = undefined;
    tick();
    return true;
  },
  // 掛機結束（喚醒）後由工具包呼叫，重畫面板。
  redraw() { render(); },
  lines(id) { const g = game(); return g ? lineList(g, state.cls || g.kit?.id, state.level, id) : []; },
  start(slots, cls) {
    const g = game();
    const s = slots[0];
    if (!g || !s) return;
    g.anvil = s.id;
    const item = anvilItem(g, cls);
    if (!item) { push("找不到裝備"); return; }
    attach(g, cls, item);
    for (const [k, v] of Object.entries(s.targets || {})) state.targets[k] = v;
    rememberTargets(state.itemKey, state.targets);
    lastItemId = item.id;
    state.running = true; state.log = []; push("開始（測試）"); loop();
  },
  stop() { state.running = false; state.queueRunning = false; clearWant(); },
  // 序列測試：ids 依序加入，targetsById 寫入記憶後執行。
  async queueRun(ids, targetsById, cls) {
    const g = game();
    state.queue = [];
    for (const id of ids) {
      const it = bagItems(g, cls).find((x) => x.id === id);
      if (!it) continue;
      if (targetsById?.[id]) rememberTargets(itemKey(it), targetsById[id]);
      state.queue.push({ id, name: it.name, base: it.base, status: "等待" });
    }
    state.log = [];
    await runQueue();
  },
};
