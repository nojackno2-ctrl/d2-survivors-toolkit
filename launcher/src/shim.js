// 啟動器注入每個頁面的腳本：把 Rust 後端包成與 Electron 版相同的 window.api，
// 工具包頁面（修改器、防護頁）不需要知道後端換了。__BASE__ 由 Rust 代入。
(() => {
  if (window.top !== window || !window.ipc) return;
  const send = (o) => window.ipc.postMessage(JSON.stringify(o));
  // 離線頁（不是工具包網址）只給「重試」
  if (!location.href.startsWith("__BASE__")) { window.__d2retry = () => send({ cmd: "retry" }); return; }

  // 每個文件一組隨機代號：重載後的新文件不會收到舊文件的回覆（id 會重複）
  const doc = crypto.randomUUID ? crypto.randomUUID() : String(Math.random()).slice(2) + Date.now();
  let seq = 0;
  const pending = new Map();
  window.__d2r = (d, id, res) => { if (d !== doc) return; const done = pending.get(id); pending.delete(id); if (done) done(res); };
  const call = (cmd, ...args) => new Promise((done) => { const id = ++seq; pending.set(id, done); send({ doc, id, cmd, args }); });
  const fn = (cmd) => (...args) => call(cmd, ...args);

  // 存檔簽章的對象是 JSON.stringify(去掉 seal 的存檔)。這個字串在頁面端產生，
  // 與遊戲用同一個 JSON.stringify，數字與跳脫格式才會完全一致；Rust 只負責算 HMAC 與寫檔。
  const bad = { error: "存檔格式不正確。" };
  const valid = (save) => typeof save === "object" && !!save && typeof save.version === "number";
  const body = (save) => JSON.stringify({ ...save, seal: undefined });
  // 讀取方向：Rust 傳回原始文字，在這裡解析成物件
  const parsed = (r) => {
    if (!r || typeof r.saveText !== "string") return r;
    const { saveText, ...rest } = r;
    try { return { ...rest, save: JSON.parse(saveText) }; } catch (e) { return { error: e.message }; }
  };

  window.api = {
    // 啟動器協定版本：IPC 不相容時頁面可提示使用者下載新版 exe
    launcher: { protocol: 1, rust: true },
    load: async (m) => parsed(await call("load", m)),
    save: async (m, save) => (valid(save) ? call("save", m, body(save)) : bad),
    assets: fn("assets"),
    engine: fn("engine"),
    i18n: fn("i18n"),
    openBackups: fn("openBackups"),
    traces: fn("traces"),
    diag: fn("diag"),
    listBackups: fn("listBackups"),
    readBackup: async (f) => parsed(await call("readBackup", f)),
    deleteBackup: fn("deleteBackup"),
    snapshot: async (save, label) => (valid(save) ? call("snapshot", body(save), label) : bad),
    exportSave: async (save) => (valid(save) ? call("exportSave", body(save)) : bad),
    importSave: async () => { const r = parsed(await call("importSave")); return r && r.save !== undefined && !valid(r.save) ? bad : r; },
    guardStatus: fn("guardStatus"),
    saveMode: fn("saveMode"),
    setSaveMode: fn("setSaveMode"),
    close: fn("close"),
    openGuard: fn("openGuard"),
    // 熱重載：重新從 GitHub 載入目前頁面（物品引擎也會重新準備）
    reload: fn("reload"),
  };

  // F5／Ctrl+R：隨時熱重載
  window.addEventListener("keydown", (e) => {
    if (e.key === "F5" || ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "r")) { e.preventDefault(); call("reload"); }
  }, true);

  // GitHub 上的工具包有新版時由 Rust 呼叫：顯示提示列，不自動重載以免丟掉還沒寫入的修改
  window.__d2update = () => {
    if (document.getElementById("d2UpdateBar")) return;
    const bar = document.createElement("div");
    bar.id = "d2UpdateBar";
    bar.style.cssText = "position:fixed;left:0;right:0;top:0;z-index:2147483647;display:flex;gap:12px;align-items:center;justify-content:center;padding:8px 12px;background:#2a2114;color:#e8dcc0;border-bottom:1px solid #e8c46a;font:14px sans-serif";
    const text = document.createElement("span");
    text.textContent = "工具包已更新（GitHub）。重新載入後生效；尚未寫入存檔的修改會消失。";
    const now = document.createElement("button");
    now.type = "button";
    now.textContent = "立即重新載入";
    now.style.cssText = "padding:4px 12px;background:#e8c46a;color:#14110d;border:0;border-radius:4px;cursor:pointer";
    now.onclick = () => call("reload");
    const later = document.createElement("button");
    later.type = "button";
    later.textContent = "稍後";
    later.style.cssText = "padding:4px 12px;background:transparent;color:#e8dcc0;border:1px solid #9d8f73;border-radius:4px;cursor:pointer";
    later.onclick = () => bar.remove();
    bar.append(text, now, later);
    document.documentElement.appendChild(bar);
  };

  // 桌面版沒有遊戲內的工具包選單；在修改器的「存檔檢查」分頁補上前往防護頁的按鈕（視窗上方選單列亦可隨時切換）
  window.addEventListener("DOMContentLoaded", () => {
    const sec = document.querySelector("#guard section");
    if (!sec || document.getElementById("openGuardBtn")) return;
    const bar = document.createElement("div");
    bar.className = "bar";
    const btn = document.createElement("button");
    btn.type = "button";
    btn.id = "openGuardBtn";
    btn.className = "primary";
    btn.textContent = "開啟「存檔檢查與防護」";
    btn.onclick = () => call("openGuard", document.querySelector("#mode")?.value);
    bar.appendChild(btn);
    sec.appendChild(bar);
  });
})();
