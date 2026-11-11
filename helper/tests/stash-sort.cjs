// 驗證整理規劃、密集頁備援與失敗時的存檔保護。
const fs = require("node:fs"), path = require("node:path"), vm = require("node:vm"), assert = require("node:assert/strict");
const handlers = {}, button = { style: {}, addEventListener(type, fn) { handlers[type] = fn; }, remove() {} };
const elements = {}, alerts = [];
const context = {
  window: { alert: text => alerts.push(text) }, document: { createElement: () => button, getElementById: id => elements[id] },
  setInterval: () => 1, clearInterval() {}, console: { warn() {} }, getComputedStyle: () => ({ gridTemplateColumns: "1px 1px 1px 1px", gridTemplateRows: "1px 1px 1px 1px" }),
};
vm.createContext(context);
vm.runInContext(fs.readFileSync(path.join(__dirname, "../stash-sort.js"), "utf8") + "\nglobalThis.sortTest = { plan, compactExisting, sync };", context);
const { plan, compactExisting, sync } = context.sortTest;
const a = { id: "a", type: "weapon", at: { x: 2, y: 2 } }, b = { id: "b", type: "ring", at: { x: 0, y: 3 } };
const list = [a, b], placement = [{ item: a, x: 2, y: 2 }, { item: b, x: 0, y: 3 }];
const tiles = [{ dataset: { item: "a" }, style: { gridArea: "3 / 3 / span 2 / span 2" } }, { dataset: { item: "b" }, style: { gridArea: "4 / 1 / span 1 / span 1" } }];
const grid = { querySelectorAll: () => tiles }, tabs = { querySelector: () => ({ dataset: { stashTab: "personal" } }), querySelectorAll: () => [{ dataset: { stashTab: "shared1" }, click() {} }] };
const panel = { append(node) { node.parentElement = this; } };
Object.assign(elements, { "stash": grid, "stash-tabs": tabs, "stash-panel": panel });
const game = { kit: { id: "sorceress" }, save: { stashTabs: { sorceress: list } }, openStashTab: () => "personal", stashView: () => ({ tabs: { personal: placement } }), moved() { throw Error("寫入失敗"); } };
context.window.__d2autobot = { game };
const ctx = { game, cls: "sorceress", grid, active: "personal", list };
const result = plan(ctx);
assert.deepEqual(JSON.parse(JSON.stringify(result.map(x => x.at))), [{ x: 0, y: 0 }, { x: 2, y: 0 }]);
assert.deepEqual(a.at, { x: 2, y: 2 });
const compact = compactExisting([{ item: a, x: 2, y: 2, w: 2, h: 2 }, { item: b, x: 0, y: 3, w: 1, h: 1 }], 4, 4);
assert.deepEqual(JSON.parse(JSON.stringify(compact.map(x => x.at))), [{ x: 0, y: 0 }, { x: 2, y: 0 }]);
assert.throws(() => compactExisting([{ item: a, x: 3, y: 3, w: 2, h: 2 }], 4, 4), /位置異常/);
assert.throws(() => plan({ ...ctx, list: [...list, { id: "missing" }] }), /未進行整理/);
sync(); handlers.click({ preventDefault() {}, stopPropagation() {} });
assert.deepEqual(a.at, { x: 2, y: 2 }); assert.deepEqual(b.at, { x: 0, y: 3 });
assert.match(alerts[0], /已還原/);
console.log("倉庫整理測試通過：尺寸排位、密集頁備援、資料不一致與寫入失敗保護。");
