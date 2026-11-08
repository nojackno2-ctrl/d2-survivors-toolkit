// 自動淬鍊：一次只處理鐵砧上的一件裝備。
// 直接讀取遊戲的鐵砧（g.anvil）上的裝備，用 g.forgeTry 執行淬鍊／清除／熔爐；不寫入存檔、不複製、不生成。
// 屬性目標依「稀有度＋名稱＋底材」記住，同一件暗金／套裝／符文之語再次放上鐵砧時自動帶入。
// 只要進入遊戲（有職業）就顯示面板。仰賴 window.__d2autoforge（決策）與 window.__d2autobot.game（遊戲）。
// 每步間隔：先用最短間隔衝速度；遇到伺服器限流（無回應）就自動放慢，之後連續成功再慢慢加快。
const SLEEP_MIN = 60;
const SLEEP_MAX = 600;
let stepGap = SLEEP_MIN;
const ESSENCE_NAME = "Burning Essence of Terror";
const MEM_KEY = "d2autoforge.memory";
const KNOWN_RESULT = /Raised|temper failed|removed|doubled|lost/i;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const AF = () => window.__d2autoforge;
const game = () => window.__d2autobot?.game ?? null;

function essenceCount(g, cls) {
  const inv = g.save?.inventoryByClass?.[cls] || [];
  return inv.filter((i) => i?.type === "essence" && i.base === ESSENCE_NAME).reduce((s, i) => s + (i.count ?? 1), 0);
}

// 可淬鍊：暗金、套裝、符文之語，且有屬性。
const eligible = (it) => !!it && ["unique", "set", "runeword"].includes(it.rarity) && Array.isArray(it.mods) && it.mods.length > 0;

// 鐵砧上的裝備：依 g.anvil 的 ID 在背包與已裝備中尋找。
function anvilItem(g, cls) {
  const id = g.anvil;
  if (!id) return null;
  const pool = [...(g.inventoryOf?.(cls) || []), ...Object.values(g.save?.equippedByClass?.[cls] || {})];
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
function loadMemory() { try { return JSON.parse(localStorage.getItem(MEM_KEY) || "{}") || {}; } catch (e) { return {}; } }
function saveMemory(m) { try { localStorage.setItem(MEM_KEY, JSON.stringify(m)); } catch (e) { /* 無法寫入時仍可用，只是不會記住 */ } }
function rememberTargets(key, targets) { const m = loadMemory(); m[key] = { ...targets }; saveMemory(m); }

const state = {
  running: false, cls: null, level: 1, msg: "待命", log: [], folded: undefined,
  itemId: null, itemKey: null, itemName: "", lines: [], targets: {}, steps: 0, result: "",
  // 序列：[{ id, name, status }]，依序放上鐵砧淬鍊。目標設定沿用記憶（同稀有度＋名稱＋底材）。
  queue: [], queueRunning: false,
};
const push = (msg) => { state.msg = msg; state.log.push(msg); if (state.log.length > 60) state.log.shift(); render(); };

// 讓面板對準鐵砧上的裝備：載入該裝備的屬性列，並帶入記住的目標。
function attach(g, cls, item) {
  state.cls = cls;
  state.itemId = item.id;
  state.itemKey = itemKey(item);
  state.itemName = `${item.name}（${item.base}）`;
  state.lines = lineList(g, cls, state.level, item.id);
  const saved = loadMemory()[state.itemKey] || {};
  state.targets = {};
  for (const l of state.lines) state.targets[l.key] = saved[l.key] ?? 0;
  state.steps = 0;
  state.result = "";
}

// 一步：依目前紀錄決定淬鍊／清除／熔爐，或結束。回傳 { done, result }。
async function stepOnce(g, cls) {
  const item = anvilItem(g, cls);
  if (!item) return { done: true, result: "鐵砧上沒有裝備，已停止" };
  if (item.id !== state.itemId) return { done: true, result: "鐵砧裝備已更換，已停止" };
  if (essenceCount(g, cls) < 1) return { done: true, result: "恐怖燃燒精華不足，已停止" };
  const d = AF().decideNext(AF().normalizeTargets(state.targets), { counts: item.forge?.t ?? {}, hellforgeUsed: !!item.forge?.hf });
  if (d.action === "done") return { done: true, result: d.reason };
  g.anvil = item.id;
  const r = await g.forgeTry(cls, state.level, d.action, () => {});
  const text = r?.text || "";
  state.steps++;
  // 連線失敗時遊戲不會扣精華但也沒有結果，必須停止，避免無限重試。
  // 伺服器暫時無回應（實測多為 429 速率限制）：精華已暫存、不會遺失，改為等待後重試。
  if (/No reply|No connection/i.test(text)) return { done: false, retry: true, result: "伺服器暫時無回應，等待後重試" };
  // 伺服器與本地紀錄不同步時，遊戲會先把裝備改成伺服器上的最新結果（不扣精華），重新判斷即可。
  if (/updated to its last Forge result/i.test(text)) return { done: false, result: "已同步伺服器上的淬鍊紀錄" };
  // 只接受遊戲已知的鍛造結果；其他文字（例如「此裝備已鎖定」）代表遊戲拒絕，必須停止，否則會無限重試。
  if (!KNOWN_RESULT.test(text)) return { done: true, result: "遊戲拒絕或異常，已停止：" + text };
  if (d.action === "hellforge") {
    const h = AF().afterHellforge(text);
    return { done: true, result: h.status === "done" ? "熔爐倍增，達成" : h.status === "failed" ? "熔爐清空，失敗" : "熔爐結果：" + text };
  }
  return { done: false, result: `${d.action === "temper" ? "淬鍊" : "清除"}：${text || "（無回應）"}` };
}

// 限流重試等待：3、6、12、24 秒遞增，比固定 15 秒更快恢復。
const RETRY_WAIT_MS = [3000, 6000, 12000, 24000];
const MAX_RETRIES = RETRY_WAIT_MS.length;

// 單件迴圈：回傳 { result, fatal }；fatal 代表整個序列都該停（精華不足、伺服器持續無回應、手動停止）。
async function loop() {
  const g = game();
  if (!g) { push("找不到遊戲"); return { result: "找不到遊戲", fatal: true }; }
  let retries = 0, out = { result: "已停止", fatal: true };
  while (state.running) {
    let r;
    try { r = await stepOnce(g, state.cls); } catch (e) { r = { done: true, result: "錯誤：" + String(e?.message || e) }; }
    if (r.retry) {
      retries++;
      if (retries >= MAX_RETRIES) { state.running = false; out = { result: "伺服器持續無回應", fatal: true }; push(`伺服器連續 ${MAX_RETRIES} 次無回應，已停止，稍後可再開始`); break; }
      stepGap = Math.min(SLEEP_MAX, stepGap * 2);
      const wait = RETRY_WAIT_MS[retries - 1];
      push(`${r.result}（第 ${retries} 次，${wait / 1000} 秒後重試）`);
      await sleep(wait);
      continue;
    }
    retries = 0;
    state.result = r.result;
    if (r.done) { state.running = false; out = { result: r.result, fatal: /精華不足/.test(r.result) }; push("結束：" + r.result); break; }
    push(`第 ${state.steps} 步 ${r.result}`);
    if (state.steps % 10 === 0) stepGap = Math.max(SLEEP_MIN, Math.round(stepGap * 0.8));
    await sleep(stepGap);
  }
  render();
  return out;
}

// 當前職業背包裡可淬鍊的裝備。
const bagItems = (g, cls) => (g.inventoryOf?.(cls) || []).filter(eligible);
const hasTarget = (key) => Object.values(loadMemory()[key] || {}).some((v) => v === "X" || Number(v) > 0);

// 序列：一件一件放上鐵砧，跑到該件結束再換下一件。
async function runQueue() {
  const g = game();
  if (!g || state.running) return;
  const cls = g.kit?.id;
  state.queueRunning = true;
  for (const q of state.queue) q.status = q.status === "完成" ? q.status : "等待";
  for (const q of state.queue) {
    if (!state.queueRunning) break;
    if (q.status === "完成") continue;
    const item = bagItems(g, cls).find((x) => x.id === q.id);
    if (!item) { q.status = "不在背包，略過"; render(); continue; }
    if (!hasTarget(itemKey(item))) { q.status = "未設定目標，略過"; render(); continue; }
    g.anvil = item.id;
    attach(g, cls, item);
    lastItemId = item.id;
    q.status = "淬鍊中";
    state.running = true; push(`序列：開始 ${q.name}`);
    const r = await loop();
    q.status = r.result;
    if (r.fatal) break;
    await sleep(stepGap);
  }
  state.queueRunning = false; state.running = false;
  push("序列結束");
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

function render() {
  const g = game();
  if (!g) return;
  const b = ensureBox();
  const head = `<div style="display:flex;gap:6px;align-items:center;margin-bottom:6px"><b style="flex:1;color:#d4a84a">自動淬鍊（鐵砧單件）</b><button id="af-fold" type="button">${state.folded ? "展開" : "收合"}</button></div>`;
  // 收合：只顯示一個小圖示（執行中會亮綠點），點了才展開成完整面板。
  if (state.folded) {
    const narrow = window.innerWidth < 600;
    b.style.cssText = `position:fixed;${narrow ? "top:44vh" : "top:12px"};right:8px;z-index:2147483000;width:40px;height:40px;padding:0;border:1px solid #d4a84a;border-radius:50%;background:rgba(20,17,13,.94);color:#d4a84a;font:20px/40px sans-serif;text-align:center;cursor:pointer;`;
    b.title = "自動淬鍊：" + state.msg;
    b.innerHTML = `⚒${state.running ? '<span style="position:absolute;top:2px;right:2px;width:8px;height:8px;border-radius:50%;background:#5c5"></span>' : ""}`;
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
  const itemLine = state.itemId
    ? `<div><b>${esc(state.itemName)}</b> <span style="opacity:.85">${state.steps} 步</span></div><div style="opacity:.85">${esc(state.result || "")}</div>`
    : `<div style="opacity:.8">請把暗金、套裝或符文之語放到恰西的鐵砧上。</div>`;
  b.innerHTML = `
    ${head}
    ${itemLine}
    <div style="border-top:1px solid #4a3d25;margin-top:6px;padding-top:6px">${lineSel || ""}</div>
    ${state.itemId ? '<div style="opacity:.7;margin-top:4px">設定會自動記住（同稀有度、名稱與底材共用）。</div>' : ""}
    <div style="display:flex;gap:6px;margin-top:8px">
      <button id="af-start" type="button"${state.running || !state.itemId ? " disabled" : ""}>開始</button>
      <button id="af-stop" type="button"${state.running ? "" : " disabled"}>停止</button>
      <span style="flex:1;align-self:center;opacity:.9">${esc(state.msg)}</span>
    </div>
    ${queueHtml(g)}`;
  // 必須阻止冒泡：否則同一次點擊會傳到外框，觸發收合後才掛上的「點圖示展開」而立刻又展開。
  b.querySelector("#af-fold").onclick = (e) => { e.stopPropagation(); state.folded = true; render(); };
  b.querySelectorAll("select[data-key]").forEach((sel) => sel.onchange = () => {
    const v = sel.value;
    state.targets[sel.dataset.key] = v === "X" ? "X" : Number(v);
    rememberTargets(state.itemKey, state.targets);
  });
  b.querySelector("#af-start").onclick = () => {
    if (state.running || !state.itemId) return;
    try { AF().normalizeTargets(state.targets); } catch (e) { return push(e.message || String(e)); }
    state.running = true; push("開始");
    loop();
  };
  b.querySelector("#af-stop").onclick = () => { state.running = false; state.queueRunning = false; push("已停止"); };
  b.querySelectorAll("[data-add]").forEach((x) => x.onclick = () => {
    const it = bagItems(g, g.kit?.id).find((i) => i.id === x.dataset.add);
    if (it && !state.queue.some((q) => q.id === it.id)) state.queue.push({ id: it.id, name: `${it.name}（${it.base}）`, status: "等待" });
    render();
  });
  b.querySelectorAll("[data-del]").forEach((x) => x.onclick = () => { if (state.queueRunning) return; state.queue = state.queue.filter((q) => q.id !== x.dataset.del); render(); });
  // 點序列中的名稱：放上鐵砧，方便設定該件的目標。
  b.querySelectorAll("[data-pick]").forEach((x) => x.onclick = () => { if (!state.running) { g.anvil = x.dataset.pick; render(); } });
  const qs = b.querySelector("#af-qstart");
  if (qs) qs.onclick = () => runQueue();
  const qc = b.querySelector("#af-qclear");
  if (qc) qc.onclick = () => { if (!state.queueRunning) { state.queue = []; render(); } };
}

function queueHtml(g) {
  const cls = g.kit?.id;
  const inQ = new Set(state.queue.map((q) => q.id));
  const bag = bagItems(g, cls).filter((i) => !inQ.has(i.id));
  const btn = "background:#2a241b;color:#e8dcc4;border:1px solid #6a5530;border-radius:4px;padding:0 6px;";
  const qRows = state.queue.map((q, i) => {
    const it = bagItems(g, cls).find((x) => x.id === q.id);
    const warn = it && !hasTarget(itemKey(it)) ? ' <span style="color:#e88">（未設目標）</span>' : "";
    return `<div style="display:flex;gap:6px;align-items:center;margin:2px 0"><span style="opacity:.7">${i + 1}.</span><a data-pick="${esc(q.id)}" style="flex:1;cursor:pointer;text-decoration:underline">${esc(q.name)}</a>${warn}<span style="opacity:.85;font-size:13px">${esc(q.status || "")}</span><button type="button" data-del="${esc(q.id)}" style="${btn}"${state.queueRunning ? " disabled" : ""}>移除</button></div>`;
  }).join("");
  const bagRows = bag.map((it) => `<div style="display:flex;gap:6px;align-items:center;margin:2px 0"><span style="flex:1">${esc(it.name)}（${esc(it.base)}）</span><button type="button" data-add="${esc(it.id)}" style="${btn}">加入</button></div>`).join("");
  return `
    <div style="border-top:1px solid #4a3d25;margin-top:8px;padding-top:6px">
      <b style="color:#d4a84a">序列（${state.queue.length}）</b>
      <div style="opacity:.7;font-size:13px">點名稱可放上鐵砧設定目標；未設目標的會略過。</div>
      ${qRows || '<div style="opacity:.7">尚未加入</div>'}
      <div style="display:flex;gap:6px;margin-top:6px">
        <button id="af-qstart" type="button"${state.running || !state.queue.length ? " disabled" : ""}>開始序列</button>
        <button id="af-qclear" type="button"${state.queueRunning || !state.queue.length ? " disabled" : ""}>清空</button>
      </div>
    </div>
    <div style="border-top:1px solid #4a3d25;margin-top:8px;padding-top:6px">
      <b style="color:#d4a84a">背包可淬鍊（${bag.length}）</b>
      ${bagRows || '<div style="opacity:.7">背包沒有暗金、套裝或符文之語</div>'}
    </div>`;
}

// 每秒檢查：鐵砧選單開啟才顯示；鐵砧上的裝備換了才重新載入（執行中不切換）。
let lastItemId = undefined;
function tick() {
  const g = game();
  // 只在恰西鐵砧選單開著時顯示（遊戲 forgeActions.showing 設定 g.forgeUp）；執行中也保留。
  const ready = !!g && !!g.kit?.id && (!!g.forgeUp || state.running || state.queueRunning);
  if (!ready) { box?.remove(); box = null; return; }
  const item = anvilItem(g, g.kit.id);
  const id = item?.id ?? null;
  if (!state.running && id !== lastItemId) {
    lastItemId = id;
    if (item && eligible(item)) attach(g, g.kit.id, item);
    else { state.itemId = null; state.itemKey = null; state.lines = []; state.targets = {}; state.itemName = ""; }
    render();
  } else if (!box?.isConnected) {
    state.cls = g.kit.id;
    render();
  }
}
setInterval(tick, 300);

// 測試掛鉤（實機腳本）：把指定裝備放上鐵砧並啟動。slots: [{ id, targets }]，只取第一件。
window.__d2autoforgeUI = {
  state,
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
  stop() { state.running = false; state.queueRunning = false; },
  // 序列測試：ids 依序加入，targetsById 寫入記憶後執行。
  async queueRun(ids, targetsById, cls) {
    const g = game();
    state.queue = [];
    for (const id of ids) {
      const it = bagItems(g, cls).find((x) => x.id === id);
      if (!it) continue;
      if (targetsById?.[id]) rememberTargets(itemKey(it), targetsById[id]);
      state.queue.push({ id, name: `${it.name}（${it.base}）`, status: "等待" });
    }
    state.log = [];
    await runQueue();
  },
};
