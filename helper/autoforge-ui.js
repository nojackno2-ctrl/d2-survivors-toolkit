// 自動淬鍊：浮動面板 + 多件輪流執行（最多 10 件）。
// 全部在遊戲記憶體中操作：g.anvil 指定裝備，g.forgeTry 執行淬鍊／清除／熔爐；不寫入存檔。
// 遊戲的鐵砧一次只能放一件，所以 10 件是依序輪流（每次只對一件做一步），不是真正同時。
// 只在精華達 99（作弊開啟）時顯示。仰賴 window.__d2autoforge（決策）與 window.__d2autobot.game（遊戲）。
const SLEEP = 350;
const MAX_SLOTS = 10;
const ESSENCE_NAME = "Burning Essence of Terror";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const AF = () => window.__d2autoforge;
const game = () => window.__d2autobot?.game ?? null;

function essenceCount(g, cls) {
  const inv = g.save?.inventoryByClass?.[cls] || [];
  return inv.filter((i) => i?.type === "essence" && i.base === ESSENCE_NAME).reduce((s, i) => s + (i.count ?? 1), 0);
}

// 可淬鍊的裝備：暗金、套裝、符文之語，且在記憶體的背包中。
function candidates(g, cls) {
  return (g.inventoryOf?.(cls) || []).filter((i) => i && ["unique", "set", "runeword"].includes(i.rarity) && Array.isArray(i.mods) && i.mods.length);
}

// 讀取裝備的淬鍊屬性列（遊戲自己的 forgeActions.view，需先把 anvil 指向該裝備）。
function lineList(g, cls, level, id) {
  g.anvil = id;
  const view = g.forgeActions?.(cls, level, () => {})?.view?.();
  return (view?.anvil?.lines || []).map((l) => ({ key: l.key, text: l.text || l.label || l.key })).filter((l) => l.key);
}

const state = { running: false, slots: [], log: [], cls: null, level: 1, msg: "待命" };
const push = (msg) => { state.msg = msg; state.log.push(msg); if (state.log.length > 60) state.log.shift(); render(); };

// 單件的一步。回傳 { done?: bool, msg?: string }；done 表示此件結束。
async function stepSlot(g, cls, slot) {
  const item = (g.inventoryOf?.(cls) || []).find((x) => x?.id === slot.id);
  if (!item) return { done: true, msg: `${slot.name}：找不到裝備（可能已被移出背包）` };
  if (essenceCount(g, cls) < 1) return { done: true, msg: `${slot.name}：恐怖燃燒精華不足` };
  const counts = item.forge?.t ?? {};
  const hellforgeUsed = !!item.forge?.hf;
  const d = AF().decideNext(AF().normalizeTargets(slot.targets), { counts, hellforgeUsed });
  if (d.action === "done") { slot.result = d.reason; return { done: true, msg: `${slot.name}：${d.reason}` }; }
  g.anvil = slot.id;
  const r = await g.forgeTry(cls, state.level, d.action, () => {});
  const text = r?.text || "";
  slot.steps++;
  if (d.action === "hellforge") {
    const h = AF().afterHellforge(text);
    slot.result = h.status === "done" ? "熔爐倍增，達成" : h.status === "failed" ? "熔爐清空，失敗" : "熔爐結果：" + text;
    return { done: true, msg: `${slot.name}：${slot.result}` };
  }
  slot.result = d.action === "temper" ? "淬鍊中" : "清除中";
  return { msg: `${slot.name}：${d.action === "temper" ? "淬鍊" : "清除"} ${text}` };
}

async function loop() {
  const g = game();
  if (!g) return push("找不到遊戲");
  while (state.running) {
    const active = state.slots.filter((s) => !s.done);
    if (!active.length) { state.running = false; push("全部完成"); break; }
    for (const slot of active) {
      if (!state.running) break;
      let r;
      try { r = await stepSlot(g, state.cls, slot); } catch (e) { r = { done: true, msg: `${slot.name}：錯誤 ${String(e?.message || e)}` }; }
      if (r.msg) push(r.msg);
      if (r.done) slot.done = true;
      render();
      await sleep(SLEEP);
    }
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
  box.style.cssText = "position:fixed;top:12px;right:12px;z-index:2147483000;width:340px;max-height:84vh;overflow:auto;padding:10px 12px;border:1px solid #d4a84a;border-radius:8px;background:rgba(20,17,13,.94);color:#e8dcc4;font:12px/1.5 sans-serif;";
  box.addEventListener("pointerdown", (e) => e.stopPropagation());
  box.addEventListener("keydown", (e) => e.stopPropagation());
  document.body.append(box);
  return box;
}

function render() {
  const g = game();
  if (!g) return;
  const b = ensureBox();
  const cls = state.cls || g.kit?.id;
  const cands = candidates(g, cls);
  const rows = state.slots.map((s, idx) => {
    const lineSel = (s.lines || []).map((l) => {
      const v = s.targets[l.key] ?? 0;
      const opts = ["X", 0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((o) => `<option value="${o}"${String(o) === String(v) ? " selected" : ""}>${o === "X" ? "X 禁止" : o === 0 ? "0 不限" : o}</option>`).join("");
      return `<div style="display:flex;gap:6px;align-items:center;margin:2px 0"><span style="flex:1">${esc(l.text)}</span><select data-slot="${idx}" data-key="${esc(l.key)}" style="background:#2a241b;color:#e8dcc4">${opts}</select></div>`;
    }).join("");
    return `<div style="border-top:1px solid #4a3d25;padding:6px 0">
      <div style="display:flex;gap:6px;align-items:center"><b style="flex:1">${idx + 1}. ${esc(s.name)}</b><span style="opacity:.85">${s.done ? "完成" : s.steps + " 步"}</span><button data-rm="${idx}" type="button"${state.running ? " disabled" : ""}>移除</button></div>
      <div style="opacity:.85">${esc(s.result || "")}</div>
      ${lineSel || '<div style="opacity:.7">無屬性資料</div>'}
    </div>`;
  }).join("");
  const opts = cands.map((i) => `<option value="${esc(i.id)}">${esc(i.name)}（${esc(i.base)}）</option>`).join("");
  b.innerHTML = `
    <div style="font-weight:bold;color:#d4a84a;margin-bottom:6px">自動淬鍊（記憶體操作・最多 ${MAX_SLOTS} 件）</div>
    <div style="display:flex;gap:6px;margin-bottom:6px">
      <select id="af-pick" style="flex:1;background:#2a241b;color:#e8dcc4"><option value="">— 選擇裝備 —</option>${opts}</select>
      <button id="af-add" type="button"${state.slots.length >= MAX_SLOTS ? " disabled" : ""}>加入</button>
    </div>
    ${rows || '<div style="opacity:.7">尚未加入裝備</div>'}
    <div style="display:flex;gap:6px;margin-top:8px">
      <button id="af-start" type="button"${state.running || !state.slots.length ? " disabled" : ""}>開始</button>
      <button id="af-stop" type="button"${state.running ? "" : " disabled"}>停止</button>
      <span style="flex:1;align-self:center;opacity:.9">${esc(state.msg)}</span>
    </div>`;
  b.querySelector("#af-add").onclick = () => {
    const id = b.querySelector("#af-pick").value;
    if (!id) return push("請先選擇裝備");
    if (state.slots.some((s) => s.id === id)) return push("這件已在清單中");
    const item = cands.find((i) => i.id === id);
    const lines = lineList(g, cls, state.level, id);
    const targets = {}; for (const l of lines) targets[l.key] = 0;
    state.slots.push({ id, name: item?.name || id, lines, targets, steps: 0, done: false, result: "" });
    push(`已加入 ${item?.name || id}`);
  };
  b.querySelectorAll("select[data-slot]").forEach((sel) => sel.onchange = () => {
    const s = state.slots[Number(sel.dataset.slot)]; const v = sel.value;
    s.targets[sel.dataset.key] = v === "X" ? "X" : Number(v);
  });
  b.querySelectorAll("button[data-rm]").forEach((btn) => btn.onclick = () => { state.slots.splice(Number(btn.dataset.rm), 1); render(); });
  b.querySelector("#af-start").onclick = () => {
    if (state.running || !state.slots.length) return;
    for (const s of state.slots) { try { AF().normalizeTargets(s.targets); } catch (e) { return push(s.name + "：" + (e.message || e)); } }
    state.cls = cls; state.running = true; push("開始");
    loop();
  };
  b.querySelector("#af-stop").onclick = () => { state.running = false; push("已停止"); };
}

// 顯示條件：精華 99（作弊開啟）且已進入遊戲。
function tick() {
  const g = game();
  const ready = !!g && !!g.kit?.id && essenceCount(g, g.kit.id) >= 99;
  if (!ready) { box?.remove(); box = null; return; }
  if (!box?.isConnected) { state.cls = g.kit.id; render(); }
}
setInterval(tick, 1000);

// 測試掛鉤（實機腳本）：以多件清單直接啟動，不經面板。slots: [{ id, name, targets }]
window.__d2autoforgeUI = {
  state,
  lines(id) { const g = game(); return g ? lineList(g, state.cls || g.kit?.id, state.level, id) : []; },
  start(slots, cls) {
    state.cls = cls;
    state.slots = slots.map((s) => ({ id: s.id, name: s.name || s.id, lines: [], targets: s.targets, steps: 0, done: false, result: "" }));
    state.running = true; state.log = []; push("開始（測試）"); loop();
  },
  stop() { state.running = false; },
};
