// 使用遊戲正在顯示的物品尺寸整理當前倉庫頁；任何資料不完整時不變更存檔。
const previous = window.__d2stashSort;
previous?.destroy?.();

const button = document.createElement("button");
button.id = "d2-stash-sort";
button.type = "button";
button.textContent = "整理";
button.title = "整理目前倉庫頁面";
button.style.cssText = "position:absolute;right:6px;top:6px;z-index:30;pointer-events:auto;padding:2px 6px;font:12px 'Microsoft JhengHei',sans-serif;color:#e8d69b;background:#221a10;border:1px solid #9c7b36;border-radius:3px;cursor:pointer";

function current() {
  const game = window.__d2autobot?.game;
  const tabs = document.getElementById("stash-tabs"), panel = document.getElementById("stash-panel"), grid = document.getElementById("stash");
  const active = tabs?.querySelector("[data-stash-tab].open")?.dataset.stashTab;
  const cls = game?.trade?.cls || game?.kit?.id;
  if (!game || !cls || !panel || !grid || !tabs || !active || active === "uniques") return null;
  if (game.openStashTab?.(cls) !== active) return null;
  const list = game.save?.stashTabs?.[active === "personal" ? cls : active];
  if (list != null && !Array.isArray(list)) return null;
  return { game, cls, tabs, panel, grid, active, list: list || [] };
}

function plan(ctx) {
  const { game, cls, grid, active, list } = ctx;
  const placements = game.stashView(cls)?.tabs?.[active];
  const tiles = [...grid.querySelectorAll("[data-item]")];
  const columns = getComputedStyle(grid).gridTemplateColumns.trim().split(/\s+/).length;
  const rows = getComputedStyle(grid).gridTemplateRows.trim().split(/\s+/).length;
  if (!Array.isArray(placements) || placements.length !== list.length || tiles.length !== list.length || columns < 1 || rows < 1 || columns > 30 || rows > 30) throw new Error("無法確認倉庫格子，未進行整理");
  const byId = new Map(tiles.map(tile => [tile.dataset.item, tile]));
  if (byId.size !== tiles.length || new Set(list.map(item => item?.id)).size !== list.length) throw new Error("物品識別資料不完整，未進行整理");
  const items = placements.map(({ item, x, y }) => {
    const tile = byId.get(item?.id);
    if (!tile || !list.includes(item)) throw new Error("倉庫畫面與存檔不一致，未進行整理");
    const parts = tile.style.gridArea.match(/^\s*\d+\s*\/\s*\d+\s*\/\s*span\s+(\d+)\s*\/\s*span\s+(\d+)\s*$/i);
    if (!parts) throw new Error("無法確認物品尺寸，未進行整理");
    const h = Number(parts[1]), w = Number(parts[2]);
    if (w < 1 || h < 1 || w > columns || h > rows) throw new Error("物品尺寸異常，未進行整理");
    return { item, w, h, x, y };
  });
  items.sort((a, b) => b.w * b.h - a.w * a.h || b.h - a.h || b.w - a.w || String(a.item.type || "").localeCompare(String(b.item.type || "")) || String(a.item.base || "").localeCompare(String(b.item.base || "")) || String(a.item.name || "").localeCompare(String(b.item.name || "")) || String(a.item.id).localeCompare(String(b.item.id)));
  const cells = Array.from({ length: rows }, () => Array(columns).fill(false)), result = [];
  for (const entry of items) {
    let spot = null;
    for (let y = 0; y <= rows - entry.h && !spot; y++) for (let x = 0; x <= columns - entry.w && !spot; x++) {
      let fits = true;
      for (let dy = 0; dy < entry.h && fits; dy++) for (let dx = 0; dx < entry.w; dx++) if (cells[y + dy][x + dx]) { fits = false; break; }
      if (fits) spot = { x, y };
    }
    if (!spot) return compactExisting(items, columns, rows);
    for (let dy = 0; dy < entry.h; dy++) for (let dx = 0; dx < entry.w; dx++) cells[spot.y + dy][spot.x + dx] = true;
    result.push({ item: entry.item, at: spot });
  }
  return result;
}

// 密集頁面可能無法依尺寸順序重新排入；以遊戲原有配置逐件往左上收攏，保證不丟失物品。
function compactExisting(items, columns, rows) {
  const cells = Array.from({ length: rows }, () => Array(columns).fill(null));
  const fill = (entry, value) => {
    for (let y = entry.y; y < entry.y + entry.h; y++) for (let x = entry.x; x < entry.x + entry.w; x++) cells[y][x] = value;
  };
  for (const entry of items) {
    if (!Number.isInteger(entry.x) || !Number.isInteger(entry.y) || entry.x < 0 || entry.y < 0 || entry.x + entry.w > columns || entry.y + entry.h > rows) throw new Error("目前物品位置異常，未進行整理");
    for (let y = entry.y; y < entry.y + entry.h; y++) for (let x = entry.x; x < entry.x + entry.w; x++) if (cells[y][x]) throw new Error("目前物品重疊，未進行整理");
    fill(entry, entry);
  }
  items.sort((a, b) => a.y - b.y || a.x - b.x);
  for (const entry of items) {
    fill(entry, null);
    let spot = null;
    for (let y = 0; y <= rows - entry.h && !spot; y++) for (let x = 0; x <= columns - entry.w && !spot; x++) {
      let fits = true;
      for (let dy = 0; dy < entry.h && fits; dy++) for (let dx = 0; dx < entry.w; dx++) if (cells[y + dy][x + dx]) { fits = false; break; }
      if (fits) spot = { x, y };
    }
    if (!spot) throw new Error("無法確認物品位置，未進行整理");
    entry.x = spot.x; entry.y = spot.y; fill(entry, entry);
  }
  return items.map(entry => ({ item: entry.item, at: { x: entry.x, y: entry.y } }));
}

function sync() {
  const ctx = current();
  if (!ctx) { button.hidden = true; button.style.display = "none"; return; }
  if (button.parentElement !== ctx.panel) ctx.panel.append(button);
  button.hidden = false; button.style.display = "block";
  button.disabled = !!ctx.game.save?.cursor || !!ctx.game.forgeBusy || !ctx.list.length;
  button.title = ctx.game.save?.cursor ? "請先放下手上的物品" : "整理目前倉庫頁面";
}

button.addEventListener("click", event => {
  event.preventDefault(); event.stopPropagation();
  const ctx = current();
  if (!ctx || ctx.game.save?.cursor || ctx.game.forgeBusy || !ctx.list.length) return;
  try {
    const next = plan(ctx);
    const other = [...ctx.tabs.querySelectorAll("[data-stash-tab]")].find(el => el.dataset.stashTab !== ctx.active);
    if (!other || typeof ctx.game.moved !== "function") throw new Error("無法更新倉庫畫面，未進行整理");
    const original = next.map(({ item }) => ({ item, hadAt: Object.hasOwn(item, "at"), at: item.at }));
    try {
      for (const { item, at } of next) item.at = at;
      ctx.game.moved(next[0].item);
    } catch (error) {
      for (const entry of original) { if (entry.hadAt) entry.item.at = entry.at; else delete entry.item.at; }
      try { ctx.game.moved(next[0].item); } catch (_) { /* 已還原記憶體，儲存失敗由外層提示 */ }
      throw new Error("儲存失敗，已還原整理前的位置");
    }
    other.click();
    ctx.tabs.querySelector(`[data-stash-tab="${ctx.active}"]`)?.click();
    sync();
  } catch (error) {
    console.warn("倉庫整理：", error);
    window.alert(error.message || "無法整理倉庫");
  }
});
for (const type of ["pointerdown", "mousedown", "touchstart"]) button.addEventListener(type, event => event.stopPropagation());
const timer = setInterval(sync, 400);
window.__d2stashSort = { destroy() { clearInterval(timer); button.remove(); if (window.__d2stashSort === this) delete window.__d2stashSort; }, sync };
sync();
