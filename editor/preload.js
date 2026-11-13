const { contextBridge, ipcRenderer } = require("electron");

const call = (ch) => (...args) => ipcRenderer.invoke(ch, ...args);
contextBridge.exposeInMainWorld("api", {
  // 啟動器協定版本：IPC 不相容時頁面可提示使用者下載新版 exe
  launcher: { protocol: 1 },
  load: call("load"),
  save: call("save"),
  assets: call("assets"),
  engine: call("engine"),
  i18n: call("i18n"),
  openBackups: call("openBackups"),
  traces: call("traces"),
  diag: call("diag"),
  listBackups: call("listBackups"),
  readBackup: call("readBackup"),
  deleteBackup: call("deleteBackup"),
  snapshot: call("snapshot"),
  exportSave: call("exportSave"),
  importSave: call("importSave"),
  guardStatus: call("guardStatus"),
  saveMode: call("saveMode"),
  setSaveMode: call("setSaveMode"),
  close: call("close"),
  openGuard: call("openGuard"),
});

// 桌面版沒有遊戲內的工具包選單；在修改器的「存檔檢查」分頁補上前往防護頁的按鈕（視窗上方選單列亦可隨時切換）
if (typeof window !== "undefined" && typeof window.addEventListener === "function") {
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
    btn.onclick = () => ipcRenderer.invoke("openGuard", document.querySelector("#mode")?.value);
    bar.appendChild(btn);
    sec.appendChild(bar);
  });
}
