// 測試用靜態伺服器：把 repo 根目錄當成工具包網站，供 D2_TOOLKIT_BASE 使用。
// 用法：node static-server.cjs <埠號> [切換秒數]
// 回應 ETag／Last-Modified；第一次有人讀 modifier/editor.html 後 <切換秒數> 秒，
// 只改 modifier/patch.mjs 的 ETag（檔案本身不動），用來驗證熱重載偵測的是「合併標記」而不只是頁面本身。
const http = require("http"), fs = require("fs"), path = require("path");
const root = path.resolve(__dirname, "../.."), port = Number(process.argv[2] || 8123), flipAfter = process.argv[3] ? Number(process.argv[3]) * 1000 : 0;
const types = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".mjs": "text/javascript; charset=utf-8", ".json": "application/json; charset=utf-8", ".css": "text/css", ".png": "image/png", ".svg": "image/svg+xml", ".webp": "image/webp" };
let flipped = false, timer = null;
http.createServer((req, res) => {
  const url = new URL(req.url, "http://x");
  const rel = decodeURIComponent(url.pathname).replace(/^\/+/, "");
  const file = path.resolve(root, rel);
  if (!file.startsWith(root) || !fs.existsSync(file) || !fs.statSync(file).isFile()) { res.writeHead(404); return res.end(); }
  if (rel === "modifier/editor.html" && flipAfter && !timer) timer = setTimeout(() => { flipped = true; console.log("[server] patch.mjs ETag flipped"); }, flipAfter);
  const st = fs.statSync(file);
  const salt = flipped && rel === "modifier/patch.mjs" ? "-v2" : "";
  res.writeHead(200, { "Content-Type": types[path.extname(file)] || "application/octet-stream", "ETag": `"${st.mtimeMs}-${st.size}${salt}"`, "Last-Modified": st.mtime.toUTCString(), "Cache-Control": "no-store" });
  res.end(req.method === "HEAD" ? undefined : fs.readFileSync(file));
}).listen(port, "127.0.0.1", () => console.log("[server] listening", port));
