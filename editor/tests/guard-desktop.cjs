// 桌面啟動器（editor/）接上「存檔檢查與防護」頁之 Node 單元測試
const assert = require("node:assert/strict");
const path = require("node:path");
const Module = require("node:module");

const core = require("../core");
const remote = require("../remote");

(async () => {
  // 1. 簽章計算（sealText / sealState / sealOf / computeSeals）
  const scSave = { version: 11, gold: 50000, heroes: {} };
  const hcSave = { version: 11, mode: "hc", gold: 80000, heroes: {} };

  assert.equal(core.sealState(scSave), "none", "無 seal 欄位的存檔應為 none");
  const scSealedText = core.sealText(scSave);
  const hcSealedText = core.sealText(hcSave);
  const scSealedObj = JSON.parse(scSealedText);
  const hcSealedObj = JSON.parse(hcSealedText);

  assert.equal(core.sealState(scSealedObj), "sealed", "一般存檔簽章後應為 sealed");
  assert.equal(core.sealState(hcSealedObj), "sealed", "硬核存檔簽章後應為 sealed");
  assert.equal(core.sealState({ ...scSealedObj, gold: 99999 }), "broken", "竄改內容後應為 broken");
  assert.equal(core.sealState({ ...hcSealedObj, mode: undefined }), "broken", "跨模式金鑰不符應為 broken");
  assert.equal(core.sealState(null), "broken", "非物件應安全回傳 broken");

  assert.equal(core.sealOf(null), null, "無檔（null）應為 null");
  assert.equal(core.sealOf(undefined), null, "無檔（undefined）應為 null");
  assert.equal(core.sealOf(scSealedText), "sealed", "已簽章 JSON 字串應為 sealed");
  assert.equal(core.sealOf(JSON.stringify(scSave)), "none", "未簽章 JSON 字串應為 none");
  assert.equal(core.sealOf("{broken json"), "broken", "損壞 JSON 字串應為 broken");

  assert.deepEqual(
    core.computeSeals({ softcore: null, hardcore: null }),
    { softcore: null, hardcore: null },
    "雙模式皆無存檔時 seals 應皆為 null"
  );
  assert.deepEqual(
    core.computeSeals({ softcore: scSealedText, hardcore: JSON.stringify(hcSave) }),
    { softcore: "sealed", hardcore: "none" },
    "應分別正確計算一般與硬核存檔封印狀態"
  );
  assert.deepEqual(
    core.computeSeals({ softcore: "{corrupt", hardcore: hcSealedObj }),
    { softcore: "broken", hardcore: "sealed" },
    "損壞存檔與已簽章物件混合時應正確計算"
  );

  // 2. buildGuardStatus 組裝檢查
  const gsEmpty = core.buildGuardStatus({ softcore: null, hardcore: null });
  assert.deepEqual(gsEmpty, {
    version: 1,
    saveMode: "local",
    saveModeSource: "default",
    noUpload: true,
    leaderboardOff: null,
    queuePresent: false,
    blockedUploads: 0,
    replacedNatives: [],
    d2zh: false,
    webdriver: false,
    restrictedParams: [],
    seals: { softcore: null, hardcore: null },
    desktop: true,
  });
  assert.deepEqual(JSON.parse(JSON.stringify(gsEmpty)), gsEmpty, "guardStatus 回傳值須可完整 JSON 序列化");

  const gsWithSaves = core.buildGuardStatus({ softcore: scSealedText, hardcore: hcSealedText });
  assert.deepEqual(gsWithSaves.seals, { softcore: "sealed", hardcore: "sealed" });
  assert.equal(gsWithSaves.desktop, true);
  assert.equal(gsWithSaves.saveMode, "local");
  assert.equal(gsWithSaves.noUpload, true);

  // 3. saveMode 與 setSaveMode
  assert.equal(core.saveMode(), "local", "桌面版 saveMode() 應回傳 local");
  assert.deepEqual(core.setSaveMode("online"), { error: "桌面版只處理本機存檔" });
  assert.deepEqual(core.setSaveMode("local"), { error: "桌面版只處理本機存檔" });
  assert.deepEqual(core.setSaveMode(null), { error: "桌面版只處理本機存檔" });

  // 4. remote.js 網址與信任檢查
  assert.ok(remote.GUARD_PAGE.endsWith("guard/guard.html"), "GUARD_PAGE 應指向 guard/guard.html");
  assert.ok(remote.PAGE.endsWith("modifier/editor.html"), "PAGE 應指向 modifier/editor.html");
  const editorUrl = remote.pageUrl("editor", { v: 12345 });
  const guardUrl = remote.pageUrl("guard", { v: 12345, mode: "hardcore" });
  assert.equal(editorUrl, remote.PAGE + "?v=12345");
  assert.equal(guardUrl, remote.GUARD_PAGE + "?v=12345&mode=hardcore");
  assert.equal(remote.trusted(editorUrl), true, "修改器網址應通過 trusted 檢查");
  assert.equal(remote.trusted(guardUrl), true, "防護頁網址應通過 trusted 檢查");
  assert.equal(remote.trusted("https://evil.example.com/guard/guard.html"), false, "外部網址不得通過 trusted 檢查");
  assert.equal(remote.trusted("https://nojackno2-ctrl.github.io/other-repo/guard/guard.html"), false, "同網域其他專案不得通過 trusted 檢查");

  // 5. preload.js 與 main.js 橋接、導覽與 IPC 來源檢查（以假 electron 模組模擬）
  const ipcHandlers = new Map();
  const invoked = [];
  let exposedApi = null;
  let menuTemplate = null;
  let createdWinOpts = null;
  const loadedUrls = [];

  const fakeElectron = {
    contextBridge: {
      exposeInMainWorld(name, obj) {
        if (name === "api") exposedApi = obj;
      },
    },
    ipcRenderer: {
      invoke(ch, ...args) {
        invoked.push({ ch, args });
        return Promise.resolve({ ch, args });
      },
    },
    ipcMain: {
      handle(ch, fn) {
        ipcHandlers.set(ch, fn);
      },
    },
    Menu: {
      buildFromTemplate(tpl) {
        menuTemplate = tpl;
        return tpl;
      },
      setApplicationMenu() {},
    },
    BrowserWindow: class {
      constructor(opts) {
        createdWinOpts = opts;
        this.webContents = {
          on() {},
          setWindowOpenHandler() {},
        };
      }
      loadURL(u) {
        loadedUrls.push(u);
        return Promise.resolve();
      }
    },
    app: {
      getLocale: () => "zh-TW",
      getPath: () => path.join(__dirname, ".."),
      whenReady: () => ({
        then(fn) {
          fn();
        },
      }),
      on() {},
      quit() {},
    },
    shell: {
      openPath: () => Promise.resolve(""),
      openExternal: () => Promise.resolve(),
    },
    dialog: {},
  };

  const origLoad = Module._load;
  Module._load = function (request, parent, isMain) {
    if (request === "electron") return fakeElectron;
    return origLoad.call(this, request, parent, isMain);
  };
  try {
    delete require.cache[require.resolve("../preload")];
    delete require.cache[require.resolve("../main")];
    require("../preload");
    require("../main");
  } finally {
    Module._load = origLoad;
  }

  // 驗證 preload 暴露的方法
  assert.ok(exposedApi, "preload 應暴露 window.api");
  for (const m of [
    "load", "save", "assets", "engine", "i18n", "openBackups", "traces", "diag",
    "listBackups", "readBackup", "deleteBackup", "snapshot", "exportSave", "importSave",
    "guardStatus", "saveMode", "setSaveMode", "close", "openGuard",
  ]) {
    assert.equal(typeof exposedApi[m], "function", `window.api 應提供 ${m}()`);
  }

  // 驗證 BrowserWindow 安全設定未改變
  assert.ok(createdWinOpts, "應建立 BrowserWindow");
  assert.equal(createdWinOpts.webPreferences.contextIsolation, true, "contextIsolation 須維持 true");
  assert.equal(createdWinOpts.webPreferences.nodeIntegration, false, "nodeIntegration 須維持 false");
  assert.equal(createdWinOpts.webPreferences.sandbox, true, "sandbox 須維持 true");

  // 驗證啟動時載入修改器頁，且應用程式選單可切換修改器與防護頁
  assert.equal(loadedUrls.length, 1);
  assert.ok(loadedUrls[0].startsWith(remote.PAGE + "?v="), "啟動時應載入修改器頁");
  assert.ok(Array.isArray(menuTemplate) && menuTemplate.length >= 2, "應設定應用程式切換選單");
  const guardMenu = menuTemplate.find((item) => /存檔檢查與防護|Guard/i.test(item.label));
  const editorMenu = menuTemplate.find((item) => /存檔修改器|Editor/i.test(item.label));
  assert.ok(guardMenu && editorMenu, "選單應包含「存檔修改器」與「存檔檢查與防護」");
  guardMenu.click();
  assert.ok(loadedUrls.at(-1).startsWith(remote.GUARD_PAGE + "?v="), "點選「存檔檢查與防護」選單應載入 GUARD_PAGE");
  editorMenu.click();
  assert.ok(loadedUrls.at(-1).startsWith(remote.PAGE + "?v="), "點選「存檔修改器」選單應載入 PAGE");

  // 驗證 IPC 來源限制（不受信任來源應被阻擋）
  const untrustedEvent = { senderFrame: { url: "https://evil.example/guard/guard.html" } };
  for (const ch of ["guardStatus", "saveMode", "setSaveMode", "close", "openGuard"]) {
    const res = await ipcHandlers.get(ch)(untrustedEvent);
    assert.deepEqual(res, { error: "不允許的呼叫來源。" }, `非信任來源呼叫 ${ch} 應被拒絕`);
  }

  // 驗證信任來源（GUARD_PAGE 與 PAGE）呼叫新增的 IPC 方法
  const guardEvent = { senderFrame: { url: remote.GUARD_PAGE + "?v=1" } };
  const editorEvent = { senderFrame: { url: remote.PAGE + "?v=1" } };

  assert.equal(await ipcHandlers.get("saveMode")(guardEvent), "local");
  assert.deepEqual(await ipcHandlers.get("setSaveMode")(guardEvent, "online"), { error: "桌面版只處理本機存檔" });

  const statusRes = await ipcHandlers.get("guardStatus")(guardEvent);
  assert.equal(statusRes.version, 1);
  assert.equal(statusRes.saveMode, "local");
  assert.equal(statusRes.saveModeSource, "default");
  assert.equal(statusRes.noUpload, true);
  assert.equal(statusRes.desktop, true);
  assert.ok(statusRes.seals && "softcore" in statusRes.seals && "hardcore" in statusRes.seals);

  const openGuardRes = await ipcHandlers.get("openGuard")(editorEvent, "hardcore");
  assert.deepEqual(openGuardRes, { ok: true });
  assert.ok(
    loadedUrls.at(-1).startsWith(remote.GUARD_PAGE + "?v=") && loadedUrls.at(-1).includes("mode=hardcore"),
    "openGuard('hardcore') 應載入帶 mode=hardcore 的 GUARD_PAGE"
  );

  const closeRes = await ipcHandlers.get("close")(guardEvent);
  assert.deepEqual(closeRes, { ok: true });
  assert.ok(loadedUrls.at(-1).startsWith(remote.PAGE + "?v="), "防護頁呼叫 close() 應回到修改器頁 PAGE");

  console.log("桌面啟動器防護頁整合測試（editor/tests/guard-desktop.cjs）全部通過");
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
