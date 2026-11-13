// 啟動器的遠端資源：修改器頁面與引擎需要的檔案都從 GitHub Pages 抓，
// 抓到就存進快取；離線時改用快取。這樣工具包與遊戲相容性更新不必重新打包 exe。
// 測試時可用環境變數 D2_TOOLKIT_BASE 指向本機伺服器（需以 / 結尾）。
const { app } = require("electron");
const fs = require("fs");
const path = require("path");

const BASE = process.env.D2_TOOLKIT_BASE || "https://nojackno2-ctrl.github.io/d2-survivors-toolkit/";
if (!BASE.endsWith("/")) throw new Error("D2_TOOLKIT_BASE 結尾要有 /");
const ORIGIN = new URL(BASE).origin;
const PAGE = BASE + "modifier/editor.html";
const GUARD_PAGE = BASE + "guard/guard.html";
function pageUrl(target = "editor", opts = {}) {
  const base = target === "guard" || target === GUARD_PAGE ? GUARD_PAGE : PAGE;
  const v = opts && typeof opts === "object" && opts.v !== undefined ? opts.v : Date.now();
  const mode = typeof opts === "string" ? opts : opts?.mode;
  const params = new URLSearchParams({ v: String(v) });
  if (mode === "hardcore" || mode === "softcore") params.set("mode", mode);
  return `${base}?${params.toString()}`;
}
const cacheDir = () => path.join(app.getPath("userData"), "remote-cache");
const cacheFile = (rel) => path.join(cacheDir(), rel.replace(/[\\/]/g, "__"));

async function text(rel) {
  const file = cacheFile(rel);
  try {
    const res = await fetch(BASE + rel + "?v=" + Date.now(), { cache: "no-store" });
    if (!res.ok) throw new Error("HTTP " + res.status);
    const body = await res.text();
    fs.mkdirSync(cacheDir(), { recursive: true });
    fs.writeFileSync(file, body);
    return body;
  } catch (e) {
    if (fs.existsSync(file)) return fs.readFileSync(file, "utf8");
    throw new Error(`無法下載 ${rel}（${e.message}），請檢查網路後重新開啟工具包。`);
  }
}

// 只接受來自工具包網站的呼叫端（IPC 與導覽都要檢查）
// 只比對整個工具包的路徑前綴（BASE 結尾有 /），同一網域下其他 repo 的頁面不信任
const trusted = (url) => typeof url === "string" && url.startsWith(BASE);

module.exports = { BASE, PAGE, GUARD_PAGE, pageUrl, text, trusted };
