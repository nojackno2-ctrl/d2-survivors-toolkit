const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { ClassicLevel } = require("classic-level");

const { GameLink } = require("../game-link");
const core = require("../core");
const { createLauncherApi, sanitizeSwitches, sanitizeGameDir } = require("../launcher-api");
const paths = require("../paths");

const tmp = (p) => fs.mkdtempSync(path.join(os.tmpdir(), p));

function fakeRoot() {
  const root = tmp("d2root-");
  fs.mkdirSync(path.join(root, "helper"));
  for (const f of ["input.js", "hooks.js", "autobot.js"]) fs.writeFileSync(path.join(root, "helper", f), `/*${f}*/`);
  return root;
}

// 假的 GameLink：記錄所有 CDP 呼叫順序，不開真視窗
function fakeLink({ exposeAfter = 0 } = {}) {
  const gl = new GameLink();
  const calls = [];
  let exposeTries = 0;
  Object.defineProperty(gl, "attached", { get: () => true });
  gl.send = async (method, params) => { calls.push(["send", method, params]); return {}; };
  gl.enableInputBinding = async () => { calls.push(["enableInputBinding"]); };
  gl.exposeGame = async () => { calls.push(["exposeGame"]); return ++exposeTries > exposeAfter; };
  gl.injectScript = async (src) => { calls.push(["inject", src]); return true; };
  gl.evaluate = async (src) => { calls.push(["evaluate", src]); return 1; };
  return { gl, calls };
}

test("startHelper：依序 enableInputBinding → exposeGame → 設旗標 → 注入三個檔案", async () => {
  const { gl, calls } = fakeLink({ exposeAfter: 2 });
  const root = fakeRoot();
  const r = await gl.startHelper({ root, build: "2026.1105.3", switches: { enabled: true }, pollMs: 1 });
  assert.equal(r.injected, true);
  const names = calls.filter((c) => c[0] !== "send").map((c) => c[0]);
  assert.deepEqual(names, ["enableInputBinding", "exposeGame", "exposeGame", "exposeGame", "inject", "inject", "inject", "inject"]);
  const injects = calls.filter((c) => c[0] === "inject").map((c) => c[1]);
  assert.match(injects[0], /window\.__d2gameBuild="2026\.1105\.3";window\.__d2autobotSwitches=\{"enabled":true\};/);
  assert.deepEqual(injects.slice(1), ["/*input.js*/", "/*hooks.js*/", "/*autobot.js*/"]);
  assert.equal(gl.status().helperInjected, true);
});

test("startHelper：等待逾時會拋錯並清掉狀態", async () => {
  const { gl } = fakeLink({ exposeAfter: 1e9 });
  await assert.rejects(gl.startHelper({ root: fakeRoot(), build: "x", waitMs: 30, pollMs: 5 }), /逾時/);
  assert.equal(gl.status().helper, false);
});

test("startHelper：頁面重新載入（Page.frameNavigated）後自動重做；子框架與停止後不重做", async () => {
  const { gl, calls } = fakeLink();
  await gl.startHelper({ root: fakeRoot(), build: "b", switches: {}, pollMs: 1 });
  const count = () => calls.filter((c) => c[0] === "inject").length;
  assert.equal(count(), 4);
  gl._onPageEvent({ method: "Page.frameNavigated", params: { frame: { parentId: "x" } } });
  await new Promise((r) => setTimeout(r, 30));
  assert.equal(count(), 4, "子框架不應觸發");
  gl._onPageEvent({ method: "Page.frameNavigated", params: { frame: {} } });
  await gl._helperBusy;
  assert.equal(count(), 8);
  assert.equal(gl.status().helperInjected, true);
  await gl.stopHelper();
  gl._onPageEvent({ method: "Page.frameNavigated", params: { frame: {} } });
  await new Promise((r) => setTimeout(r, 30));
  assert.equal(count(), 8);
});

test("stopHelper：呼叫頁內 destroy、移除 binding、清狀態", async () => {
  const { gl, calls } = fakeLink();
  await gl.startHelper({ root: fakeRoot(), build: "b", pollMs: 1 });
  const r = await gl.stopHelper();
  assert.equal(r.stopped, true);
  assert.ok(calls.some((c) => c[0] === "evaluate" && /__d2autobot\?\.destroy\?\.\(\)/.test(c[1])));
  assert.ok(calls.some((c) => c[0] === "send" && c[1] === "Runtime.removeBinding" && c[2].name === "__d2input"));
  assert.equal(gl.status().helper, false);
});

test("setLocalStorageKey／getLocalStorageKey：暫存 LevelDB 讀寫、刪除、遊戲開著（鎖定）拒絕", async () => {
  const dir = tmp("d2ldb-");
  const ldb = path.join(dir, "leveldb");
  const seed = new ClassicLevel(ldb, { keyEncoding: "buffer", valueEncoding: "buffer", createIfMissing: true });
  await seed.open();
  await seed.close();

  assert.equal(await core.getLocalStorageKeyAt(ldb, "d2s:lang"), null);
  await core.setLocalStorageKeyAt(ldb, "d2s:lang", "ko");
  assert.equal(await core.getLocalStorageKeyAt(ldb, "d2s:lang"), "ko");
  await core.setLocalStorageKeyAt(ldb, "d2s:lang", "en");
  assert.equal(await core.getLocalStorageKeyAt(ldb, "d2s:lang"), "en");
  const del = await core.setLocalStorageKeyAt(ldb, "d2s:lang", null);
  assert.equal(del.deleted, true);
  assert.equal(await core.getLocalStorageKeyAt(ldb, "d2s:lang"), null);
  await core.setLocalStorageKeyAt(ldb, "k", "中文"); // 非 latin1 走 UTF-16 編碼
  assert.equal(await core.getLocalStorageKeyAt(ldb, "k"), "中文");

  await assert.rejects(core.setLocalStorageKeyAt(ldb, "", "x"), /鍵名/);
  await assert.rejects(core.setLocalStorageKeyAt(ldb, "k", 5), /字串或 null/);

  // 模擬遊戲開著：另一個行程持有資料庫鎖
  const lock = new ClassicLevel(ldb, { keyEncoding: "buffer", valueEncoding: "buffer" });
  await lock.open();
  await assert.rejects(core.setLocalStorageKeyAt(ldb, "d2s:lang", "ko"), /遊戲可能正在執行/);
  await lock.close();
  fs.rmSync(dir, { recursive: true, force: true });
});

function apiWith(over = {}) {
  const calls = [];
  const gameLink = {
    running: false,
    status: () => ({ running: false }),
    launch: async (o) => { calls.push(["launch", o]); return { pid: 1, port: 2, stubPort: 3 }; },
    startHelper: async (o) => { calls.push(["startHelper", o]); return { injected: true, build: o.build }; },
    stopHelper: async () => { calls.push(["stopHelper"]); return { stopped: true }; },
    ...over.gameLink,
  };
  const store = { lang: "en", ...over.store };
  const coreFake = {
    getLocalStorageKey: async () => store.lang,
    setLocalStorageKey: async (k, v) => { calls.push(["setLs", k, v]); store.lang = v; return { ok: true }; },
  };
  const userDataDir = tmp("d2ud-");
  const api = createLauncherApi({
    gameLink, core: coreFake, engine: { installedBuild: () => "2026.1105.3" }, paths, userDataDir,
    importCore: async () => ({ status: () => ({ status: over.langStatus || "original" }) }),
    runElevated: over.runElevated || (async (o) => { calls.push(["elevated", o.args]); return { ok: true, replacedCount: 1, totalCount: 2 }; }),
  });
  return { api, calls, store, userDataDir };
}

test("IPC 參數檢查：switches／game 路徑", async () => {
  assert.deepEqual(sanitizeSwitches(undefined), {});
  assert.deepEqual(sanitizeSwitches({ a: true, b: 3, c: "x" }), { a: true, b: 3, c: "x" });
  assert.throws(() => sanitizeSwitches([1]), /格式/);
  assert.throws(() => sanitizeSwitches({ "a-b": 1 }), /名稱/);
  assert.throws(() => sanitizeSwitches({ a: { x: 1 } }), /值/);
  assert.throws(() => sanitizeGameDir("relative"), /路徑/);
  assert.equal(sanitizeGameDir(undefined), undefined);

  const { api, calls } = apiWith();
  await assert.rejects(api.startHelper([]), /格式/);
  await assert.rejects(api.launchGame("x"), /格式/);
  const r = await api.startHelper({ switches: { cheat: true }, root: "C:\\evil", build: "9" });
  assert.equal(r.build, "2026.1105.3"); // 頁面指定的 root／build 被忽略
  const call = calls.find((c) => c[0] === "startHelper")[1];
  assert.equal(call.root, paths.resolveRoot());
  assert.deepEqual(call.switches, { enabled: true, progressEnabled: true, cheat: true });
});

test("launchGame：只用主程序決定的參數；withHelper 才啟動輔助器", async () => {
  const { api, calls } = apiWith();
  const r = await api.launchGame({ withHelper: false, exePath: "C:\\evil.exe" });
  assert.deepEqual(calls.find((c) => c[0] === "launch")[1], {});
  assert.equal(r.helper, false);
  const r2 = await api.launchGame({ withHelper: true });
  assert.equal(r2.helper, true);
});

test("langApply／langRestore：遊戲執行中拒絕；套用寫 ko 並記錄原值；還原依 d2sLangAction", async () => {
  const run = apiWith({ gameLink: { running: true } });
  await assert.rejects(run.api.langApply(), /請先關閉遊戲/);
  await assert.rejects(run.api.langRestore(), /請先關閉遊戲/);

  const t = apiWith({ store: { lang: "en" } });
  const a = await t.api.langApply();
  assert.equal(a.before, "en");
  assert.deepEqual(t.calls.find((c) => c[0] === "elevated")[1].slice(0, 1), ["--apply"]);
  assert.ok(t.calls.find((c) => c[0] === "elevated")[1].includes("--lang-before"));
  assert.equal(t.store.lang, "ko");
  assert.equal(JSON.parse(fs.readFileSync(path.join(t.userDataDir, "d2lang-state.json"), "utf8")).before, "en");

  const del = apiWith({ store: { lang: "ko" }, runElevated: async () => ({ ok: true, restored: true, d2sLangAction: { delete: true } }) });
  const r = await del.api.langRestore();
  assert.equal(r.restored, true);
  assert.equal(del.store.lang, null);

  const set = apiWith({ store: { lang: "ko" }, runElevated: async () => ({ ok: true, restored: false, reason: "game-updated", d2sLangAction: { set: "en" } }) });
  const r2 = await set.api.langRestore();
  assert.equal(r2.gameUpdated, true);
  assert.equal(set.store.lang, "en");
});

test("langApply：UAC 被拒或提權失敗會把明確錯誤傳回，且不寫語言設定", async () => {
  const t = apiWith({ runElevated: async () => { throw new Error("已取消管理員授權（UAC），中文化設定未變更。"); } });
  await assert.rejects(t.api.langApply(), /UAC/);
  assert.equal(t.store.lang, "en");
  const f = apiWith({ runElevated: async () => ({ ok: false, error: "磁碟已滿" }) });
  await assert.rejects(f.api.langApply(), /磁碟已滿/);
});

test("paths.pageUrl('launcher') 指向 editor/launcher.html", () => {
  assert.equal(paths.pageUrl("launcher"), require("node:url").pathToFileURL(path.join(__dirname, "..", "launcher.html")).toString());
  assert.ok(fs.existsSync(path.join(__dirname, "..", "launcher.html")));
});
