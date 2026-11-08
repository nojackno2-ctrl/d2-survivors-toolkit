// 自動淬鍊：一次只處理鐵砧上的一件裝備。
// 直接讀取遊戲的鐵砧（g.anvil）上的裝備，用 g.forgeTry 執行淬鍊／清除／熔爐；不寫入存檔、不複製、不生成。
// 屬性目標依「稀有度＋名稱＋底材」記住，同一件暗金／套裝／符文之語再次放上鐵砧時自動帶入。
// 只要進入遊戲（有職業）就顯示面板。仰賴 window.__d2autoforge（決策）與 window.__d2autobot.game（遊戲）。
const SLEEP = 350;
const ESSENCE_NAME = "Burning Essence of Terror";
const MEM_KEY = "d2autoforge.memory";
const KNOWN_RESULT = /Raised|temper failed|removed|doubled|lost/i;
const MAX_STEPS = 300; // 安全上限，避免任何未預期的狀況無限執行。
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
  // 只接受遊戲已知的鍛造結果；其他文字（例如「此裝備已鎖定」）代表遊戲拒絕，必須停止，否則會無限重試。
  if (!KNOWN_RESULT.test(text)) return { done: true, result: "遊戲拒絕或異常，已停止：" + text };
  if (d.action === "hellforge") {
    const h = AF().afterHellforge(text);
    return { done: true, result: h.status === "done" ? "熔爐倍增，達成" : h.status === "failed" ? "熔爐清空，失敗" : "熔爐結果：" + text };
  }
  return { done: false, result: `${d.action === "temper" ? "淬鍊" : "清除"}：${text || "（無回應）"}` };
}

const RETRY_WAIT_MS = 15000;
const MAX_RETRIES = 3;

async function loop() {
  const g = game();
  if (!g) return push("找不到遊戲");
  let retries = 0;
  while (state.running) {
    let r;
    try { r = await stepOnce(g, state.cls); } catch (e) { r = { done: true, result: "錯誤：" + String(e?.message || e) }; }
    if (r.retry) {
      retries++;
      if (retries >= MAX_RETRIES) { state.running = false; push(`伺服器連續 ${MAX_RETRIES} 次無回應，已停止，稍後可再開始`); break; }
      push(`${r.result}（第 ${retries} 次，${RETRY_WAIT_MS / 1000} 秒後重試）`);
      await sleep(RETRY_WAIT_MS);
      continue;
    }
    retries = 0;
    state.result = r.result;
    if (!r.done && state.steps >= MAX_STEPS) r = { done: true, result: "已達安全上限 " + MAX_STEPS + " 步，已停止" };
    if (r.done) { state.running = false; push("結束：" + r.result); break; }
    push(`第 ${state.steps} 步 ${r.result}`);
    await sleep(SLEEP);
  }
  render();
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
    </div>`;
  b.querySelector("#af-fold").onclick = () => { state.folded = true; render(); };
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
  b.querySelector("#af-stop").onclick = () => { state.running = false; push("已停止"); };
}

// 每秒檢查：鐵砧選單開啟才顯示；鐵砧上的裝備換了才重新載入（執行中不切換）。
let lastItemId = undefined;
function tick() {
  const g = game();
  // 只在恰西鐵砧選單開著時顯示（遊戲 forgeActions.showing 設定 g.forgeUp）；執行中也保留。
  const ready = !!g && !!g.kit?.id && (!!g.forgeUp || state.running);
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
  stop() { state.running = false; },
};
