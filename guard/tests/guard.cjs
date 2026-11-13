// 防護模組（guard/guard.js）與 d2edit.js 防護整合單元測試
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { pathToFileURL } = require("node:url");

// 建立簡易瀏覽器環境（window / Storage / localStorage / fetch / sendBeacon / XMLHttpRequest）
const store = new Map();
let throwOnNextSetItem = false;
class FakeStorage {
  getItem(k) { return store.has(k) ? store.get(k) : null; }
  setItem(k, v) {
    if (throwOnNextSetItem) {
      throwOnNextSetItem = false;
      throw new Error("QuotaExceededError");
    }
    store.set(String(k), String(v));
  }
  removeItem(k) { store.delete(String(k)); }
  clear() { store.clear(); }
}
const localStorage = new FakeStorage();
const sessionStorage = new FakeStorage();

const fetchCalls = [];
const baseFetch = async function (input, init) {
  const url = typeof Request !== "undefined" && input instanceof Request ? input.url : String(input);
  const method = init?.method ?? (typeof Request !== "undefined" && input instanceof Request ? input.method : "GET");
  fetchCalls.push({ url, method });
  return { ok: true, status: 200, url, method };
};

const beaconCalls = [];
const navigatorObj = {
  webdriver: false,
  userAgent: "NodeTest",
  sendBeacon(url, data) {
    beaconCalls.push({ url: String(url), data });
    return true;
  },
};

const xhrCalls = [];
class FakeXHR {
  open(method, url) {
    this.method = method;
    this.url = url;
    this.aborted = false;
  }
  send(body) {
    this.body = body;
    xhrCalls.push({ method: this.method, url: this.url, body });
  }
  abort() {
    this.aborted = true;
  }
}

global.Storage = FakeStorage;
global.localStorage = localStorage;
global.sessionStorage = sessionStorage;
Object.defineProperty(global, "navigator", { value: navigatorObj, configurable: true, writable: true });
global.XMLHttpRequest = FakeXHR;
global.location = { origin: "https://d2survivors.lol", pathname: "/play/", search: "?god=1&speed=2&hello=world", reload() {} };
global.window = global;
global.window.fetch = baseFetch;

// 預先塞入待上傳佇列，驗證載入 guard.js 時會立即清除
store.set("d2s:leaderboard-queue", JSON.stringify([{ id: "queued-1" }]));

(async () => {
  const guardPath = path.join(__dirname, "..", "guard.js");
  const guardUrl = pathToFileURL(guardPath).href;
  const guard = await import(guardUrl);

  // 1. 匯出與 window.__d2guard 結構檢查
  assert.ok(window.__d2guard, "應掛載 window.__d2guard");
  assert.equal(window.__d2guard.version, 1);
  for (const k of ["MODES", "mode", "sealText", "sealState", "lockLeaderboard", "saveMode", "setSaveMode", "canWriteSave", "protectWrite", "clearWriteProtect", "status", "detectors"]) {
    assert.ok(k in window.__d2guard, `window.__d2guard 缺少 ${k}`);
    assert.ok(k in guard, `ES exports 缺少 ${k}`);
  }
  assert.equal(window.__d2noUpload, true, "載入後應設定 window.__d2noUpload = true");

  // 熱重載不重複掛接
  const fetchAfterFirstLoad = window.fetch;
  const setItemAfterFirstLoad = Storage.prototype.setItem;
  await import(guardUrl + "?reload=1");
  assert.equal(window.fetch, fetchAfterFirstLoad, "熱重載不得重複包裝 window.fetch");
  assert.equal(Storage.prototype.setItem, setItemAfterFirstLoad, "熱重載不得重複包裝 Storage.prototype.setItem");

  // 2. 佇列鍵於載入時被清除，之後寫入也被丟棄
  assert.equal(localStorage.getItem("d2s:leaderboard-queue"), null, "載入時應清除 d2s:leaderboard-queue");
  localStorage.setItem("d2s:leaderboard-queue", "[1,2,3]");
  assert.equal(localStorage.getItem("d2s:leaderboard-queue"), null, "寫入 d2s:leaderboard-queue 應被丟棄");
  localStorage.setItem("d2s:other", "ok");
  assert.equal(localStorage.getItem("d2s:other"), "ok", "其他鍵應正常寫入");

  // 3. 非 GET 排行榜請求被擋、/forge 放行、GET 放行
  const beforeBlocked = guard.status().blockedUploads;
  await assert.rejects(
    () => window.fetch("https://d2survivors.lol/api/leaderboard/runs", { method: "POST", body: "{}" }),
    /排行榜上傳已關閉/,
    "POST /api/leaderboard/runs 應被攔截"
  );
  await assert.rejects(
    () => window.fetch("/api/leaderboard/checks", { method: "post" }),
    /排行榜上傳已關閉/,
    "POST /api/leaderboard/checks 應被攔截"
  );
  if (typeof Request !== "undefined") {
    await assert.rejects(
      () => window.fetch(new Request("https://d2survivors.lol/api/leaderboard/hc/runs", { method: "POST" })),
      /排行榜上傳已關閉/,
      "Request 物件 POST /api/leaderboard/hc/runs 應被攔截"
    );
  }
  // /forge 放行
  const forgeRes = await window.fetch("https://d2survivors.lol/api/leaderboard/forge", { method: "POST", body: "{}" });
  assert.equal(forgeRes.ok, true, "POST /api/leaderboard/forge 應放行");
  const forgeQueryRes = await window.fetch("/api/leaderboard/forge?v=2", { method: "POST" });
  assert.equal(forgeQueryRes.ok, true, "POST /api/leaderboard/forge?v=2 應放行");
  // GET 放行
  const getRes = await window.fetch("https://d2survivors.lol/api/leaderboard/boards/softcore");
  assert.equal(getRes.ok, true, "GET /api/leaderboard/* 應放行");

  // sendBeacon 攔截與放行
  assert.equal(navigator.sendBeacon("/api/leaderboard/runs", "{}"), false, "sendBeacon 排行榜上傳應被攔截");
  assert.equal(navigator.sendBeacon("/api/leaderboard/forge", "{}"), true, "sendBeacon /forge 應放行");
  assert.equal(navigator.sendBeacon("/api/report", "{}"), true, "sendBeacon 非排行榜路徑應放行");

  // XHR 攔截與放行
  const xhrBlocked = new XMLHttpRequest();
  xhrBlocked.open("POST", "/api/leaderboard/deaths");
  xhrBlocked.send("{}");
  assert.equal(xhrBlocked.aborted, true, "XHR POST /api/leaderboard/deaths 應被 abort");
  assert.equal(xhrCalls.length, 0);

  const xhrForge = new XMLHttpRequest();
  xhrForge.open("POST", "/api/leaderboard/forge");
  xhrForge.send("{}");
  assert.equal(xhrForge.aborted, false, "XHR POST /api/leaderboard/forge 應放行");
  assert.equal(xhrCalls.length, 1);

  const xhrGet = new XMLHttpRequest();
  xhrGet.open("GET", "/api/leaderboard/stats");
  xhrGet.send();
  assert.equal(xhrGet.aborted, false, "XHR GET /api/leaderboard/stats 應放行");
  assert.equal(xhrCalls.length, 2);

  assert.ok(guard.status().blockedUploads > beforeBlocked, "blockedUploads 計數應增加");

  // 4. leaderboard.off 鎖定後無法改／刪
  const saveObj = { version: 11, leaderboard: { off: false, hasId: true } };
  guard.lockLeaderboard(saveObj);
  assert.equal(saveObj.leaderboard.off, true);
  const desc = Object.getOwnPropertyDescriptor(saveObj.leaderboard, "off");
  assert.equal(desc.writable, false);
  assert.equal(desc.configurable, false);
  assert.throws(() => { "use strict"; saveObj.leaderboard.off = false; }, TypeError, "不可修改 leaderboard.off");
  assert.throws(() => { "use strict"; delete saveObj.leaderboard.off; }, TypeError, "不可刪除 leaderboard.off");
  assert.equal(saveObj.leaderboard.off, true);

  // 5. sealText → sealState 為 sealed，竄改後為 broken
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

  // 6. saveMode 覆寫、偵測與預設、canWriteSave
  guard.setSaveMode(null);
  guard.detectors.length = 0;
  assert.equal(guard.saveMode(), "local", "預設應為 local");
  assert.equal(guard.status().saveModeSource, "default");
  assert.equal(guard.canWriteSave(), true);

  guard.setSaveMode("online");
  assert.equal(localStorage.getItem("d2toolkit.saveMode"), "online");
  assert.equal(guard.saveMode(), "online");
  assert.equal(guard.status().saveModeSource, "override");
  assert.equal(guard.canWriteSave(), false, "online 模式不可寫入存檔");
  // online 模式下排行榜上傳封鎖依然生效
  await assert.rejects(
    () => window.fetch("/api/leaderboard/runs", { method: "POST" }),
    /排行榜上傳已關閉/,
    "online 模式下排行榜上傳仍須封鎖"
  );

  guard.setSaveMode("local");
  assert.equal(guard.saveMode(), "local");
  assert.equal(guard.status().saveModeSource, "override");
  assert.equal(guard.canWriteSave(), true);

  guard.setSaveMode(null);
  assert.equal(localStorage.getItem("d2toolkit.saveMode"), null);
  assert.equal(guard.saveMode(), "local");
  assert.equal(guard.status().saveModeSource, "default");

  // detectors 測試
  guard.detectors.push(() => "online");
  assert.equal(guard.saveMode(), "online");
  assert.equal(guard.status().saveModeSource, "detected");
  assert.equal(guard.canWriteSave(), false);
  guard.detectors.length = 0;
  assert.equal(guard.saveMode(), "local");

  // 7. protectWrite 擋住不同內容寫入，寫入失敗還原與 clearWriteProtect
  const scKey = guard.MODES.softcore.key;
  guard.clearWriteProtect();
  localStorage.setItem(scKey, "modified-save-v1");
  guard.protectWrite(scKey, "modified-save-v1");
  // 遊戲嘗試以舊記憶體覆寫不同內容 → 被擋下
  localStorage.setItem(scKey, "stale-memory-save");
  assert.equal(localStorage.getItem(scKey), "modified-save-v1", "protectWrite 應擋住對同一存檔鍵的不同內容覆寫");
  // 寫入相同內容或寫入其他鍵不受影響
  localStorage.setItem(scKey, "modified-save-v1");
  assert.equal(localStorage.getItem(scKey), "modified-save-v1");
  localStorage.setItem(guard.MODES.hardcore.key, "hc-save-1");
  assert.equal(localStorage.getItem(guard.MODES.hardcore.key), "hc-save-1");

  // 模擬二次寫入失敗時還原上一次防護
  const prevGuard = guard.clearWriteProtect();
  assert.deepEqual(prevGuard, { key: scKey, text: "modified-save-v1" });
  guard.protectWrite(prevGuard.key, prevGuard.text);
  localStorage.setItem(scKey, "stale-memory-save-2");
  assert.equal(localStorage.getItem(scKey), "modified-save-v1", "還原防護後仍應擋住覆寫");

  // 清除防護後允許正常寫入新內容
  guard.clearWriteProtect();
  localStorage.setItem(scKey, "modified-save-v2");
  assert.equal(localStorage.getItem(scKey), "modified-save-v2", "clearWriteProtect 後應允許新寫入");

  // 8. status() 欄位與可 JSON 序列化檢查
  window.__d2autobot = { game: { save: saveObj } };
  const st = guard.status();
  assert.equal(st.version, 1);
  assert.equal(st.noUpload, true);
  assert.equal(st.leaderboardOff, true);
  assert.equal(st.queuePresent, false);
  assert.ok(Array.isArray(st.replacedNatives) && st.replacedNatives.includes("Storage.setItem"));
  assert.equal(st.d2zh, false);
  assert.equal(st.webdriver, false);
  assert.deepEqual(st.restrictedParams, ["god", "speed"]);
  assert.deepEqual(JSON.parse(JSON.stringify(st)), st, "status() 回傳值必須可完整 JSON 序列化");

  // 9. d2edit.js 的 backend 與選單整合檢查
  const d2editSrc = fs.readFileSync(path.join(__dirname, "..", "..", "d2edit.js"), "utf8");
  assert.match(d2editSrc, /import\(at\("guard\/guard\.js"\)\)/, "d2edit.js 應載入 guard/guard.js");
  assert.match(d2editSrc, /id:\s*"guard",\s*label:\s*"存檔檢查與防護",\s*order:\s*35/, "d2edit.js 應登錄存檔檢查與防護選單項目");
  assert.match(d2editSrc, /\["防護模組"/, "d2edit.js 載入步驟清單應含防護模組");
  assert.match(d2editSrc, /按暫停後左上角開啟工具包/, "d2edit.js 載入完成文字應改為開啟工具包");

  // 取 d2edit.js 的 backend 段落實測 save / guardStatus / saveMode / setSaveMode
  const backendSlice = d2editSrc.slice(
    d2editSrc.indexOf("const LAST_WRITE ="),
    d2editSrc.indexOf("/* ---------- 全螢幕介面 ---------- */")
  );
  const makeBackend = new Function(
    "MODES", "mode", "sealText", "sealState", "saveMode", "setSaveMode", "canWriteSave", "protectWrite", "clearWriteProtect", "guardBaseStatus",
    backendSlice + "\nreturn backend;"
  );
  const backend = makeBackend(
    guard.MODES, guard.mode, guard.sealText, guard.sealState, guard.saveMode, guard.setSaveMode,
    guard.canWriteSave, guard.protectWrite, guard.clearWriteProtect, guard.status
  );

  assert.equal(backend.sealText, guard.sealText, "backend.sealText 須保留供相容");
  store.delete(guard.MODES.softcore.key);
  store.delete(guard.MODES.hardcore.key);
  let gs = await backend.guardStatus();
  assert.deepEqual(gs.seals, { softcore: null, hardcore: null }, "無存檔時 guardStatus().seals 應為 null");

  // 單機模式寫入存檔與防覆寫保護
  const resSave = await backend.save("softcore", { version: 11, gold: 777 });
  assert.equal(resSave.ok, true);
  const savedText = localStorage.getItem(scKey);
  assert.equal(JSON.parse(savedText).leaderboard.off, true, "backend.save 寫入存檔須強制 leaderboard.off = true");
  gs = await backend.guardStatus();
  assert.equal(gs.seals.softcore, "sealed", "backend.save 寫入後 guardStatus().seals.softcore 應為 sealed");
  assert.equal(gs.seals.hardcore, null);

  // 寫入後遊戲嘗試覆寫舊內容應被擋下
  localStorage.setItem(scKey, "overwrite-by-game");
  assert.equal(localStorage.getItem(scKey), savedText, "backend.save 後應啟動 protectWrite 防覆寫");

  // 寫入失敗時應還原上一次的 protectWrite 防護
  throwOnNextSetItem = true;
  await assert.rejects(() => backend.save("softcore", { version: 11, gold: 888 }), /QuotaExceededError/);
  localStorage.setItem(scKey, "overwrite-after-failed-save");
  assert.equal(localStorage.getItem(scKey), savedText, "backend.save 失敗後應還原上一次防護");

  // 切換為線上存檔模式後，backend.save 應拒絕寫入並拋出指定訊息
  backend.setSaveMode("online");
  assert.equal(backend.saveMode(), "online");
  await assert.rejects(
    () => backend.save("softcore", { version: 11, gold: 999 }),
    /目前為線上存檔模式：修改器只修改單機存檔，不會寫入。/
  );
  backend.setSaveMode(null);
  assert.equal(backend.saveMode(), "local");
  guard.clearWriteProtect();

  console.log("防護模組單元測試通過");
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
