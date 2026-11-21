// 遊戲控制台後端：純函式工廠，不依賴 electron（main.js 負責註冊 IPC；測試可注入假物件）。
const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawn } = require("child_process");

const LANG_KEY = "d2s:lang";
const DEFAULT_SWITCHES = { enabled: true, progressEnabled: true, cheat: false };

// 來自頁面的輔助器開關：只收簡單的鍵與值，不接受路徑或程式碼
function sanitizeSwitches(raw) {
  if (raw == null) return {};
  if (typeof raw !== "object" || Array.isArray(raw)) throw new Error("輔助器開關格式不正確。");
  const out = {};
  const keys = Object.keys(raw);
  if (keys.length > 64) throw new Error("輔助器開關過多。");
  for (const k of keys) {
    if (!/^[A-Za-z_]\w{0,63}$/.test(k)) throw new Error(`輔助器開關名稱不正確：${k}`);
    const v = raw[k];
    if (typeof v === "boolean" || (typeof v === "number" && Number.isFinite(v))) out[k] = v;
    else if (typeof v === "string" && v.length <= 64) out[k] = v;
    else throw new Error(`輔助器開關「${k}」的值不正確。`);
  }
  return out;
}

function sanitizeGameDir(dir) {
  if (dir == null) return undefined;
  if (typeof dir !== "string" || !path.isAbsolute(dir) || /[\r\n\0"]/.test(dir)) throw new Error("遊戲資料夾路徑不正確。");
  return dir;
}

// 以 PowerShell Start-Process -Verb RunAs -Wait 提權執行（cmd /c 內先設 ELECTRON_RUN_AS_NODE=1）。
// 結果由 CLI 寫成 JSON 檔回傳；使用者拒絕 UAC 時 PowerShell 以 exit 3 結束。
function runElevatedDefault({ execPath, script, args, resultFile }) {
  const q = (s) => `"${String(s).replace(/"/g, "")}"`;
  const inner = `chcp 65001>nul&& set ELECTRON_RUN_AS_NODE=1&& ${[execPath, script, ...args].map(q).join(" ")}`;
  const cmdArgs = `/d /s /c "${inner}"`;
  const ps = `$ErrorActionPreference='Stop'; try { Start-Process -FilePath $env:ComSpec -ArgumentList '${cmdArgs.replace(/'/g, "''")}' -Verb RunAs -Wait -WindowStyle Hidden } catch { exit 3 }`;
  const encoded = Buffer.from(ps, "utf16le").toString("base64");
  return new Promise((resolve, reject) => {
    const child = spawn("powershell.exe", ["-NoProfile", "-NonInteractive", "-EncodedCommand", encoded], { windowsHide: true, stdio: "ignore" });
    child.once("error", reject);
    child.once("exit", (code) => {
      if (code === 3) return reject(new Error("已取消管理員授權（UAC），中文化設定未變更。"));
      let result = null;
      try { result = JSON.parse(fs.readFileSync(resultFile, "utf8")); } catch {}
      if (!result) return reject(new Error("提權程序沒有回傳結果（可能被拒絕或程序異常結束）。"));
      resolve(result);
    });
  });
}

function createLauncherApi({ gameLink, core, engine, paths, runElevated = runElevatedDefault, userDataDir, execPath = process.execPath, importCore } = {}) {
  const resolveRootAsset = (rel) => paths.resolveAsset(rel);
  const corePath = () => resolveRootAsset("lang/desktop-lang-core.mjs");
  const loadCore = importCore || (() => import(require("url").pathToFileURL(corePath()).href));
  const stateFile = () => path.join(userDataDir, "d2lang-state.json");
  const readState = () => { try { return JSON.parse(fs.readFileSync(stateFile(), "utf8")); } catch { return null; } };
  const writeState = (s) => { fs.mkdirSync(path.dirname(stateFile()), { recursive: true }); fs.writeFileSync(stateFile(), JSON.stringify(s)); };
  const clearState = () => { try { fs.unlinkSync(stateFile()); } catch {} };

  function requireGameClosed() {
    if (gameLink.running) throw new Error("遊戲正在執行，請先關閉遊戲再進行中文化操作。");
  }

  async function elevated(mode, extra = {}) {
    const resultFile = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "d2lang-")), "result.json");
    const args = [mode, "--core", corePath(), "--result", resultFile];
    if (extra.game) args.push("--game", extra.game);
    if (extra.langBefore != null) args.push("--lang-before", extra.langBefore);
    try {
      return await runElevated({ execPath, script: path.join(__dirname, "lang-cli.cjs"), args, resultFile });
    } finally {
      try { fs.rmSync(path.dirname(resultFile), { recursive: true, force: true }); } catch {}
    }
  }

  const api = {
    sanitizeSwitches,

    async startHelper(opts = {}) {
      if (opts == null || typeof opts !== "object" || Array.isArray(opts)) throw new Error("參數格式不正確。");
      const switches = { ...DEFAULT_SWITCHES, ...sanitizeSwitches(opts.switches) };
      // root、build 一律由主程序決定，不接受頁面指定（避免注入任意檔案）
      return gameLink.startHelper({ root: paths.resolveRoot(), build: engine.installedBuild(), switches });
    },

    async stopHelper() {
      return gameLink.stopHelper();
    },

    // 啟動遊戲；withHelper 時再啟動輔助器。exePath／userDataDir 不接受頁面指定。
    async launchGame(opts = {}) {
      if (opts == null || typeof opts !== "object" || Array.isArray(opts)) throw new Error("參數格式不正確。");
      const info = await gameLink.launch({});
      if (!opts.withHelper) return { ...info, helper: false };
      try {
        const h = await api.startHelper({ switches: opts.switches });
        return { ...info, helper: true, ...h };
      } catch (e) {
        return { ...info, helper: false, helperError: e.message };
      }
    },

    async helperSettings() { return gameLink.helperSettings(); },
    async helperSet(settingPath, value) {
      if (typeof settingPath !== "string" || !/^[A-Za-z][A-Za-z0-9.]*$/.test(settingPath)) throw new Error("設定路徑不正確。");
      if (!(typeof value === "boolean" || (typeof value === "number" && Number.isFinite(value)) || (typeof value === "string" && value.length <= 40))) throw new Error("設定值格式不正確。");
      return { ok: await gameLink.helperSet(settingPath, value) };
    },
    async helperLive() { return gameLink.helperLive(); },

    gameStatus() {
      return { ...gameLink.status(), build: engine.installedBuild() };
    },

    async langStatus(opts = {}) {
      const gameDir = sanitizeGameDir(opts?.game);
      const { status } = await loadCore();
      return { ...status(gameDir ? { gameDir } : {}), running: gameLink.running, state: readState() };
    },

    async langApply(opts = {}) {
      requireGameClosed();
      const gameDir = sanitizeGameDir(opts?.game);
      const { status } = await loadCore();
      // 先讀目前語言（同時確認遊戲沒有鎖住資料庫）
      const current = await core.getLocalStorageKey(LANG_KEY);
      const st = status(gameDir ? { gameDir } : {});
      const prior = readState();
      // 已是中文版再套用：沿用最初記下的「套用前值」，不要把 ko 當成原值
      const before = st.status === "patched" && prior ? prior.before : current;
      const res = await elevated("--apply", { game: gameDir, langBefore: before });
      if (!res.ok) throw new Error(res.error || "套用失敗。");
      writeState({ before, at: new Date().toISOString() });
      let warning = "";
      try { await core.setLocalStorageKey(LANG_KEY, "ko"); }
      catch (e) { warning = `asar 已套用，但寫入語言設定失敗：${e.message}。請關閉遊戲後，在遊戲內把語言切到 ko。`; }
      return { ok: true, before, replacedCount: res.replacedCount, totalCount: res.totalCount, patchedHash: res.patchedHash, fontWarning: res.fontWarning, warning };
    },

    async langRestore(opts = {}) {
      requireGameClosed();
      const gameDir = sanitizeGameDir(opts?.game);
      await core.getLocalStorageKey(LANG_KEY); // 確認遊戲已關閉
      const res = await elevated("--restore", { game: gameDir });
      if (!res.ok) throw new Error(res.message || res.error || "還原失敗。");
      let warning = "";
      const act = res.d2sLangAction;
      try {
        if (act && "set" in act) await core.setLocalStorageKey(LANG_KEY, act.set);
        else if (act && act.delete) await core.setLocalStorageKey(LANG_KEY, null);
      } catch (e) { warning = `asar 已處理，但還原語言設定失敗：${e.message}。`; }
      clearState();
      return { ok: true, restored: Boolean(res.restored), gameUpdated: res.reason === "game-updated", warning };
    },
  };
  return api;
}

module.exports = { createLauncherApi, sanitizeSwitches, sanitizeGameDir, runElevatedDefault, LANG_KEY, DEFAULT_SWITCHES };
