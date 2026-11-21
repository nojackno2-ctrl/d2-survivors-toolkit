// 防護模組（guard/guard.js）單元測試（桌面版：封印、leaderboard.off 資料寫入原則與不包裝原生 API）
const assert = require("node:assert/strict");
const path = require("node:path");
const { pathToFileURL } = require("node:url");

const store = new Map();
class FakeStorage {
  getItem(k) { return store.has(k) ? store.get(k) : null; }
  setItem(k, v) { store.set(String(k), String(v)); }
  removeItem(k) { store.delete(String(k)); }
  clear() { store.clear(); }
}
const localStorage = new FakeStorage();
const baseFetch = async () => ({ ok: true, status: 200 });
const origSetItem = FakeStorage.prototype.setItem;

global.Storage = FakeStorage;
global.localStorage = localStorage;
Object.defineProperty(global, "navigator", { value: { webdriver: false, userAgent: "NodeTest" }, configurable: true, writable: true });
global.location = { origin: "app://game", pathname: "/", search: "?god=1&speed=2&hello=world", reload() {} };
global.window = global;
global.window.fetch = baseFetch;

(async () => {
  const guardPath = path.join(__dirname, "..", "guard.js");
  const guardUrl = pathToFileURL(guardPath).href;
  const guard = await import(guardUrl);

  // 1. 匯出與 window.__d2guard 結構檢查（不包裝原生 API）
  assert.ok(window.__d2guard, "應掛載 window.__d2guard");
  assert.equal(window.__d2guard.version, 1);
  for (const k of ["MODES", "mode", "sealText", "sealState", "lockLeaderboard", "status"]) {
    assert.ok(k in window.__d2guard, `window.__d2guard 缺少 ${k}`);
    assert.ok(k in guard, `ES exports 缺少 ${k}`);
  }
  assert.equal(window.fetch, baseFetch, "不得包裝 window.fetch");
  assert.equal(Storage.prototype.setItem, origSetItem, "不得包裝 Storage.prototype.setItem");

  // 2. leaderboard.off 純資料寫入（不使用 Object.defineProperty 鎖）
  const saveObj = { version: 11, leaderboard: { off: false, hasId: true } };
  guard.lockLeaderboard(saveObj);
  assert.equal(saveObj.leaderboard.off, true);
  const desc = Object.getOwnPropertyDescriptor(saveObj.leaderboard, "off");
  assert.equal(desc.writable, true, "應為一般可寫資料屬性，不使用 defineProperty 鎖");
  assert.equal(desc.configurable, true);

  // 3. sealText → sealState 為 sealed，竄改後為 broken
  const rawSc = { version: 11, gold: 12345, heroes: {} };
  assert.equal(await guard.sealState(rawSc), "none", "無 seal 欄位時應為 none");
  const sealedScText = await guard.sealText(rawSc);
  const sealedSc = JSON.parse(sealedScText);
  assert.equal(typeof sealedSc.seal, "string");
  assert.equal(await guard.sealState(sealedSc), "sealed", "sealText 簽章後應為 sealed");
  assert.equal(await guard.sealState({ ...sealedSc, gold: 99999 }), "broken", "竄改內容後應為 broken");
  assert.equal(await guard.sealState({ ...sealedSc, seal: "0".repeat(64) }), "broken", "竄改簽章後應為 broken");

  // 硬核模式封印金鑰不同
  const rawHc = { version: 11, mode: "hc", gold: 500 };
  const sealedHc = JSON.parse(await guard.sealText(rawHc));
  assert.equal(await guard.sealState(sealedHc), "sealed", "硬核存檔簽章後應為 sealed");
  assert.equal(await guard.sealState({ ...sealedHc, mode: undefined }), "broken", "跨模式金鑰不符應為 broken");

  // 4. status() 欄位與可 JSON 序列化檢查
  window.__d2autobot = { game: { save: saveObj } };
  const st = guard.status();
  assert.equal(st.version, 1);
  assert.equal(st.saveMode, "local");
  assert.equal(st.noUpload, true);
  assert.equal(st.leaderboardOff, true);
  assert.equal(st.queuePresent, false);
  assert.equal(st.d2zh, false);
  assert.equal(st.webdriver, false);
  assert.deepEqual(st.restrictedParams, ["god", "speed"]);
  assert.deepEqual(JSON.parse(JSON.stringify(st)), st, "status() 回傳值必須可完整 JSON 序列化");

  console.log("防護模組單元測試通過");
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
