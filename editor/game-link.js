const http = require("http");
const fs = require("fs");
const path = require("path");
const { spawn } = require("child_process");
const WebSocket = require("ws");

const DEFAULT_EXE_PATH = path.join(
  process.env.ProgramFiles || "C:\\Program Files",
  "D2 Survivors",
  "D2 Survivors.exe"
);

const DEFAULT_USER_DATA = () =>
  process.env.D2S_USER_DATA ? path.resolve(process.env.D2S_USER_DATA) : path.join(process.env.APPDATA || "", "D2 Survivors"); // D2S_USER_DATA 是官方遊戲自己的環境變數，同樣決定 DevToolsActivePort 位置

const HELPER_FILES = ["input.js", "hooks.js", "autobot.js", "stash-sort.js", "forge-local.js", "autoforge.js", "autoforge-ui.js"]; // 倉庫整理、本地淬鍊、自動淬鍊（舊 d2edit.js 的模組清單）

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * 解析 DevToolsActivePort 檔案內容，回傳 { port, wsPath }。
 * 第一行為除錯埠號，第二行為 WebSocket 路徑（選填）。
 */
function parseDevToolsActivePort(text) {
  if (typeof text !== "string") return null;
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  if (!lines.length) return null;
  const port = Number(lines[0]);
  if (!Number.isInteger(port) || port < 1 || port > 65535) return null;
  return { port, wsPath: lines[1] || "" };
}

const KEY_CODE_MAP = {
  ArrowRight: { key: "ArrowRight", vk: 39 },
  ArrowLeft: { key: "ArrowLeft", vk: 37 },
  ArrowUp: { key: "ArrowUp", vk: 38 },
  ArrowDown: { key: "ArrowDown", vk: 40 },
  Space: { key: " ", vk: 32 },
  Escape: { key: "Escape", vk: 27 },
  Enter: { key: "Enter", vk: 13 },
  Tab: { key: "Tab", vk: 9 },
};

function resolveKeyInfo(code) {
  if (KEY_CODE_MAP[code]) return KEY_CODE_MAP[code];
  if (/^Digit([0-9])$/.test(code)) {
    const d = RegExp.$1;
    return { key: d, vk: 48 + Number(d) };
  }
  if (/^Key([A-Z])$/.test(code)) {
    const ch = RegExp.$1;
    return { key: ch.toLowerCase(), vk: ch.charCodeAt(0) };
  }
  return { key: code, vk: 0 };
}

class GameLink {
  constructor() {
    this.child = null;
    this.ws = null;
    this.port = 0;
    this.userDataDir = "";
    this.nextId = 0;
    this.pending = new Map();
    this.exitCallbacks = new Set();
    this._gameArrayId = null;
    this._gameScriptUrl = null;
    this._helper = null; // 輔助器啟動狀態：{ root, build, switches, injected, runs, lastError }
    this._helperBusy = null;
    this._helperRerun = false;
  }

  get running() {
    return Boolean(this.child && this.child.exitCode === null && !this.child.killed);
  }

  get attached() {
    return Boolean(this.ws && this.ws.readyState === WebSocket.OPEN);
  }

  onExit(cb) {
    if (typeof cb === "function") this.exitCallbacks.add(cb);
    return () => this.exitCallbacks.delete(cb);
  }

  _notifyExit(info) {
    this._gameArrayId = null;
    this._gameScriptUrl = null;
    this._helper = null;
    this._helperBusy = null;
    this._helperRerun = false;
    for (const cb of this.exitCallbacks) {
      try { cb(info); } catch { /* 忽略回呼錯誤 */ }
    }
  }

  async launch(opts = {}) {
    if (this.running) {
      throw new Error("遊戲已在執行中。");
    }
    const exePath = opts.exePath || DEFAULT_EXE_PATH;
    if (!fs.existsSync(exePath)) {
      throw new Error(`找不到遊戲執行檔：${exePath}`);
    }
    const userDataDir = opts.userDataDir || DEFAULT_USER_DATA();
    this.userDataDir = userDataDir;

    const activePortFile = path.join(userDataDir, "DevToolsActivePort");
    try { fs.unlinkSync(activePortFile); } catch { /* 檔案不存在時忽略 */ }

    const env = { ...process.env };
    if (opts.userDataDir) {
      env.D2S_USER_DATA = opts.userDataDir;
    }
    delete env.ELECTRON_RUN_AS_NODE;

    let earlyExit = null;
    const child = spawn(
      exePath,
      ["--remote-debugging-port=0", "--remote-allow-origins=http://127.0.0.1"],
      { env, stdio: "ignore" }
    );
    this.child = child;

    child.once("exit", (code, signal) => {
      earlyExit = { code, signal };
      if (this.ws) {
        try { this.ws.close(); } catch {}
        this.ws = null;
      }
      this._notifyExit({ code, signal });
    });

    // 等待 DevToolsActivePort 產生；若行程在產生前就退出，代表被單一實例鎖擋下
    let parsed = null;
    for (let i = 0; i < 60 && !parsed; i++) {
      if (earlyExit) {
        throw new Error(
          "遊戲已在執行中，但未開啟除錯埠（單一實例鎖定）。請先關閉現有的 D2 Survivors 視窗，再由工具包重新啟動。"
        );
      }
      await sleep(500);
      try {
        const raw = fs.readFileSync(activePortFile, "utf8");
        parsed = parseDevToolsActivePort(raw);
      } catch { /* 尚未寫入 */ }
    }

    if (!parsed) {
      try { child.kill(); } catch {}
      throw new Error("等待遊戲開啟除錯埠逾時（未產生 DevToolsActivePort）。");
    }

    this.port = parsed.port;
    await this.attach(this.port);
    return { pid: child.pid, port: this.port };
  }

  async attach(port = this.port) {
    if (!port) throw new Error("未指定除錯埠號。");
    let page = null;
    for (let i = 0; i < 40; i++) {
      try {
        const res = await fetch(`http://127.0.0.1:${port}/json`);
        const targets = await res.json();
        page = targets.find((t) => t.type === "page" && String(t.url).startsWith("app://"))
          || targets.find((t) => t.type === "page");
        if (page && page.webSocketDebuggerUrl) break;
      } catch { /* 等待除錯目標就緒 */ }
      await sleep(500);
    }
    if (!page || !page.webSocketDebuggerUrl) {
      throw new Error("找不到可連線的遊戲頁面除錯目標。");
    }

    if (this.ws) {
      try { this.ws.close(); } catch {}
    }

    const ws = new WebSocket(page.webSocketDebuggerUrl);
    await new Promise((resolve, reject) => {
      ws.once("open", resolve);
      ws.once("error", reject);
    });

    this.ws = ws;
    this.port = port;
    ws.on("message", (data) => {
      let msg;
      try { msg = JSON.parse(String(data)); } catch { return; }
      if (msg.method === "Runtime.bindingCalled" && msg.params?.name === "__d2input") {
        this._onInput(msg.params.payload);
        return;
      }
      if (msg.method === "Page.frameNavigated") {
        this._onPageEvent(msg);
        return;
      }
      if (msg.id && this.pending.has(msg.id)) {
        const { resolve, reject } = this.pending.get(msg.id);
        this.pending.delete(msg.id);
        if (msg.error) reject(new Error(msg.error.message || "CDP 錯誤"));
        else resolve(msg.result);
      }
    });
    ws.on("close", () => {
      for (const { reject } of this.pending.values()) {
        reject(new Error("CDP 連線已關閉。"));
      }
      this.pending.clear();
      this._gameArrayId = null;
      this.ws = null;
    });
    return true;
  }

  send(method, params = {}) {
    if (!this.attached) return Promise.reject(new Error("尚未連線至遊戲 CDP。"));
    const id = ++this.nextId;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.ws.send(JSON.stringify({ id, method, params }));
    });
  }

  async evaluate(expression, awaitPromise = true) {
    const res = await this.send("Runtime.evaluate", {
      expression,
      awaitPromise,
      returnByValue: true,
    });
    if (res?.exceptionDetails) {
      throw new Error(res.exceptionDetails.text || "頁面執行例外");
    }
    return res?.result?.value;
  }

  /**
   * 動態找出遊戲主模組 URL（不寫死檔名雜湊），並以唯讀方式透過
   * import() + Runtime.queryObjects(Game.prototype) 取得 Game 實例陣列。
   */
  async _findGameScriptUrl() {
    if (this._gameScriptUrl) return this._gameScriptUrl;

    // 1. 先從 performance 資源與 DOM script/modulepreload 尋找 Game-*.js
    const direct = await this.evaluate(`(() => {
      const perf = performance.getEntriesByType("resource").map(e => e.name);
      const dom = [...document.querySelectorAll('script[src], link[rel="modulepreload"][href]')]
        .map(el => el.src || el.href);
      const all = [...new Set([...perf, ...dom])];
      return all.find(u => /\\/Game-[\\w-]+\\.js(\\?|$)/.test(u)) || null;
    })()`);
    if (direct) {
      this._gameScriptUrl = direct;
      return direct;
    }

    // 2. 備援：列舉頁面載入的 assets/*.js，fetch 內容比對 export{... as Game}
    const matched = await this.evaluate(`(async () => {
      const perf = performance.getEntriesByType("resource").map(e => e.name);
      const dom = [...document.querySelectorAll('script[src], link[rel="modulepreload"][href]')]
        .map(el => el.src || el.href);
      const candidates = [...new Set([...perf, ...dom])]
        .filter(u => /\\/assets\\/[^/]+\\.js(\\?|$)/.test(u));
      for (const u of candidates) {
        try {
          const txt = await (await fetch(u)).text();
          if (/export\\s*\\{[^}]*\\bas\\s+Game\\b/.test(txt) || /export\\s+class\\s+Game\\b/.test(txt)) {
            return u;
          }
        } catch {}
      }
      return null;
    })()`);

    if (!matched) {
      throw new Error("無法在遊戲頁面中找到 Game 模組腳本。");
    }
    this._gameScriptUrl = matched;
    return matched;
  }

  async gameHandle() {
    if (this._gameArrayId) return this._gameArrayId;
    const scriptUrl = await this._findGameScriptUrl();
    const proto = await this.send("Runtime.evaluate", {
      expression: `import(${JSON.stringify(scriptUrl)}).then(m => m.Game.prototype)`,
      awaitPromise: true,
    });
    const protoId = proto?.result?.objectId;
    if (!protoId) {
      throw new Error("無法取得 Game.prototype。");
    }
    const q = await this.send("Runtime.queryObjects", { prototypeObjectId: protoId });
    const arrayId = q?.objects?.objectId;
    if (!arrayId) {
      throw new Error("Runtime.queryObjects 未回傳 Game 實例陣列。");
    }
    this._gameArrayId = arrayId;
    return arrayId;
  }

  /**
   * 唯讀快照：傳入函式原始碼字串（例如 "(g) => ({ state: g.state })"）
   */
  async readSnapshot(fnSource) {
    const arrayId = await this.gameHandle();
    const res = await this.send("Runtime.callFunctionOn", {
      objectId: arrayId,
      returnByValue: true,
      functionDeclaration: `function(fnStr) {
        const g = this[0];
        if (!g) return null;
        const fn = eval("(" + fnStr + ")");
        return fn(g);
      }`,
      arguments: [{ value: String(fnSource) }],
    });
    if (res?.exceptionDetails) {
      throw new Error(res.exceptionDetails.text || "讀取遊戲快照失敗");
    }
    return res?.result?.value ?? null;
  }

  /**
   * 對遊戲資料欄位寫值（不包裝或替換任何函式）。
   * 支援傳入函式字串 `(g, data) => { ... }` 或 `{ "cheat.maxCrit": true }` 物件。
   */
  async writeFields(fnSourceOrObj, data) {
    const arrayId = await this.gameHandle();
    const isFn = typeof fnSourceOrObj === "string";
    const res = await this.send("Runtime.callFunctionOn", {
      objectId: arrayId,
      returnByValue: true,
      functionDeclaration: `function(isFn, payload, extra) {
        const g = this[0];
        if (!g) return false;
        if (isFn) {
          const fn = eval("(" + payload + ")");
          return fn(g, extra);
        }
        for (const [k, v] of Object.entries(payload)) {
          const parts = k.split(".");
          let cur = g;
          for (let i = 0; i < parts.length - 1; i++) {
            if (cur == null) break;
            cur = cur[parts[i]];
          }
          if (cur != null) cur[parts[parts.length - 1]] = v;
        }
        return true;
      }`,
      arguments: [
        { value: isFn },
        { value: fnSourceOrObj },
        { value: data === undefined ? null : data },
      ],
    });
    if (res?.exceptionDetails) {
      throw new Error(res.exceptionDetails.text || "寫入遊戲欄位失敗");
    }
    return res?.result?.value;
  }

  async key(code, action = "press", holdMs = 60) {
    const { key, vk } = resolveKeyInfo(code);
    if (action === "down" || action === "press") {
      await this.send("Input.dispatchKeyEvent", {
        type: "rawKeyDown",
        code,
        key,
        windowsVirtualKeyCode: vk,
      });
    }
    if (action === "press") {
      await sleep(holdMs);
    }
    if (action === "up" || action === "press") {
      await this.send("Input.dispatchKeyEvent", {
        type: "keyUp",
        code,
        key,
        windowsVirtualKeyCode: vk,
      });
    }
  }

  async click(x, y) {
    const cx = Math.round(x);
    const cy = Math.round(y);
    for (const type of ["mouseMoved", "mousePressed", "mouseReleased"]) {
      await this.send("Input.dispatchMouseEvent", {
        type,
        x: cx,
        y: cy,
        button: "left",
        clickCount: 1,
        buttons: type === "mousePressed" ? 1 : 0,
      });
    }
  }

  /** 頁內輔助器的受信任輸入通道：頁面呼叫 window.__d2input(JSON)，由這裡送出 CDP 輸入事件。 */
  async enableInputBinding() {
    await this.send("Runtime.enable");
    await this.send("Runtime.addBinding", { name: "__d2input" });
  }

  _onInput(payload) {
    let cmd;
    try { cmd = JSON.parse(payload); } catch { return; }
    const run = cmd?.t === "key" ? this.key(String(cmd.code), cmd.action || "press", Number(cmd.hold) || 60)
      : cmd?.t === "click" ? this.click(Number(cmd.x), Number(cmd.y)) : null;
    if (run) run.catch(() => {});
  }

  /** 唯讀取得 Game 實例並設到頁面全域 window.__d2autobotGame（不包裝任何函式）。 */
  async exposeGame() {
    const arrayId = await this.gameHandle();
    const res = await this.send("Runtime.callFunctionOn", {
      objectId: arrayId,
      returnByValue: true,
      functionDeclaration: "function(){ if(!this[0]) return false; window.__d2autobotGame = this[0]; return true; }",
    });
    return res?.result?.value === true;
  }

  /** 把本機腳本（例如 helper/input.js、helper/autobot.js）送進遊戲頁面執行一次。 */
  async injectScript(source) {
    const res = await this.send("Runtime.evaluate", { expression: String(source), awaitPromise: true, returnByValue: true });
    if (res?.exceptionDetails) throw new Error(res.exceptionDetails.exception?.description || res.exceptionDetails.text || "注入腳本失敗");
    return res?.result?.value;
  }

  /** Page.frameNavigated：頁面（主框架）重新載入時，若輔助器已啟動就自動重做一次注入。 */
  _onPageEvent(msg) {
    if (!this._helper) return;
    if (msg.params?.frame?.parentId) return; // 只看主框架
    this._gameArrayId = null; // 舊頁面的物件控制代碼已失效
    this._helper.injected = false;
    if (this._helperBusy) { this._helperRerun = true; return; }
    this._scheduleHelper();
  }

  _scheduleHelper() {
    const h = this._helper;
    if (!h) return null;
    this._helperBusy = this._runHelper(h).catch((e) => { h.lastError = e.message; }).finally(() => {
      this._helperBusy = null;
      if (this._helperRerun && this._helper === h) {
        this._helperRerun = false;
        this._scheduleHelper();
      }
    });
    return this._helperBusy;
  }

  async _runHelper(h) {
    const alive = () => this._helper === h;
    await this.enableInputBinding();
    // 等待遊戲物件出現（最多 h.waitMs，預設 60 秒）
    const deadline = Date.now() + h.waitMs;
    let ok = false;
    for (;;) {
      if (!alive()) return false;
      ok = await this.exposeGame().catch(() => false);
      if (ok || Date.now() >= deadline) break;
      this._gameArrayId = null;
      await sleep(h.pollMs);
    }
    if (!ok) throw new Error("等待遊戲物件逾時（60 秒內未取得 Game 實例）。");
    if (!alive()) return false;
    await this.injectScript(
      `window.__d2gameBuild=${JSON.stringify(h.build)};window.__d2autobotSwitches=${JSON.stringify(h.switches)};`
    );
    for (const f of HELPER_FILES) {
      if (!alive()) return false;
      await this.injectScript(fs.readFileSync(path.join(h.root, "helper", f), "utf8"));
    }
    // 設定面板改由獨立應用提供：隱藏遊戲內的「輔助」按鈕與面板
    await this.injectScript("window.__d2autobot&&window.__d2autobot.setExternalUi&&window.__d2autobot.setExternalUi(true)");
    h.injected = true;
    h.runs += 1;
    h.lastError = "";
    return true;
  }

  /**
   * 啟動頁內輔助器：enableInputBinding → 等待並 exposeGame → 設 __d2gameBuild/__d2autobotSwitches →
   * 依序注入 helper/input.js、hooks.js、autobot.js；之後頁面重新載入會自動重做。
   */
  async startHelper(opts = {}) {
    if (!this.attached) throw new Error("尚未連線至遊戲，請先由工具包啟動遊戲。");
    if (this._helper) await this.stopHelper();
    let build = opts.build;
    if (build == null) {
      try { build = require("./engine").installedBuild(); } catch { build = null; }
    }
    const h = {
      root: opts.root || require("./paths").resolveRoot(),
      build: build == null ? "" : String(build),
      switches: opts.switches && typeof opts.switches === "object" ? opts.switches : {},
      waitMs: opts.waitMs ?? 60000,
      pollMs: opts.pollMs ?? 1000,
      injected: false,
      runs: 0,
      lastError: "",
    };
    this._helper = h;
    await this.send("Page.enable");
    await this._scheduleHelper(); // 錯誤會記在 h.lastError，不會拋出
    if (!h.injected && h.lastError && this._helper === h) {
      this._helper = null;
      throw new Error(h.lastError);
    }
    return { injected: h.injected, build: h.build };
  }

  /** 停止輔助器：呼叫頁內 destroy 並清掉 binding 與狀態。 */
  async stopHelper() {
    const h = this._helper;
    this._helper = null;
    this._helperRerun = false;
    if (this._helperBusy) { try { await this._helperBusy; } catch {} }
    if (!this.attached) return { stopped: Boolean(h) };
    try { await this.evaluate("window.__d2autobot?.destroy?.(); 1"); } catch { /* 頁面已不在 */ }
    try { await this.send("Runtime.removeBinding", { name: "__d2input" }); } catch { /* 已移除 */ }
    return { stopped: Boolean(h) };
  }

  /** 輔助器設定（與遊戲內面板同一份）。helper 未注入時回 null。 */
  async helperSettings() {
    const r = await this.evaluate("window.__d2autobot&&window.__d2autobot.getSettings?JSON.stringify(window.__d2autobot.getSettings()):null");
    return r ? JSON.parse(r) : null;
  }
  async helperSet(settingPath, value) {
    return this.evaluate(`window.__d2autobot&&window.__d2autobot.setSetting?window.__d2autobot.setSetting(${JSON.stringify(settingPath)},${JSON.stringify(value)}):false`);
  }
  /** 狀態浮窗用的即時摘要。 */
  async helperLive() {
    const r = await this.evaluate(`(()=>{const a=window.__d2autobot,g=a&&a.game,w=g&&g.world,p=w&&w.player,d=a&&a.diagnostics?a.diagnostics():null;if(!a)return null;return JSON.stringify({state:g&&g.state,level:p&&p.level,hp:p?Math.round(p.life)+"/"+Math.round(p.maxLife):null,action:d&&d.lastAction,enabled:a.settings&&a.settings.enabled,auto:a.settings&&a.settings.progressEnabled,hooks:d&&d.hooks})})()`);
    return r ? JSON.parse(r) : null;
  }

  status() {
    return {
      running: this.running,
      attached: this.attached,
      port: this.port,
      helper: Boolean(this._helper),
      helperInjected: Boolean(this._helper && this._helper.injected),
      helperError: this._helper ? this._helper.lastError : "",
    };
  }

  async close() {
    if (this.ws) {
      try { this.ws.close(); } catch {}
      this.ws = null;
    }
    if (this.running) {
      try { this.child.kill(); } catch {}
    }
  }
}

module.exports = {
  DEFAULT_EXE_PATH,
  parseDevToolsActivePort,
  GameLink,
};
