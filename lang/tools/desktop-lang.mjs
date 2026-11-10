// 桌面版語言注入：把語言模組放進官方桌面版遊戲（D2 Survivors.exe）的 app.asar，開機就載入。
// 用法（需系統管理員權限，因為遊戲裝在 Program Files）：
//   node lang/tools/desktop-lang.mjs [--game "C:\Program Files\D2 Survivors"] [--d2r "C:\Program Files (x86)\Diablo II Resurrected"] [--out 另存路徑] [--restore]
// - 先備份原檔為 app.asar.d2lang-orig（已有就不覆蓋）；--restore 還原備份。
// - D2R 原版繁中字型（BlizzardGlobalTCUnicode.ttf）在本機從玩家自己的 D2R 取出，只放進本機的 app.asar，不散佈。
// - 遊戲更新後官方安裝程式會覆蓋 app.asar，重新執行本工具即可。
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(path.join(root, "..", "editor", "package.json"));
const asar = require("@electron/asar");

const arg = (name, def) => { const i = process.argv.indexOf(name); return i >= 0 ? process.argv[i + 1] : def; };
const gameDir = arg("--game", "C:\\Program Files\\D2 Survivors");
const d2rDir = arg("--d2r", "C:\\Program Files (x86)\\Diablo II Resurrected");
const target = path.join(gameDir, "resources", "app.asar"), backup = target + ".d2lang-orig";
const out = arg("--out", target);

if (process.argv.includes("--restore")) {
  if (!fs.existsSync(backup)) throw new Error("找不到備份 " + backup);
  fs.copyFileSync(backup, target);
  console.log("已還原原版 app.asar");
  process.exit(0);
}

// 以 fs 模擬瀏覽器的資料夾 handle，讓 d2rfont.js 在 Node 也能用
const dirHandle = (dir) => ({
  async *entries() {
    for (const d of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, d.name);
      yield [d.name, d.isDirectory() ? { kind: "directory", ...dirHandle(p) } : { kind: "file", ...(await dirHandle(dir).getFileHandle(d.name)) }];
    }
  },
  async getDirectoryHandle(name) { const p = path.join(dir, name); if (!fs.statSync(p).isDirectory()) throw new Error(p); return dirHandle(p); },
  async getFileHandle(name) {
    const p = path.join(dir, name);
    return { async getFile() { const fd = fs.openSync(p, "r"), size = fs.fstatSync(fd).size; return {
      size, async arrayBuffer() { const b = fs.readFileSync(p); return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength); },
      slice(start = 0, end = size) { return { async arrayBuffer() { const n = Math.max(0, end - start), b = Buffer.alloc(n); fs.readSync(fd, b, 0, n, start); return b.buffer.slice(b.byteOffset, b.byteOffset + n); } }; },
    }; } };
  },
});

// 判斷目前的 app.asar 是不是已經注入過：是的話從備份重新做，避免重複注入
const marker = "d2lang/boot.js";
const sep = path.sep;
const html = (file) => asar.extractFile(file, ["desktop", "dist", "web", "play", "index.html"].join(sep)).toString();
let source = target;
if (html(target).includes(marker)) {
  if (!fs.existsSync(backup)) throw new Error("app.asar 已注入過但找不到原版備份");
  source = backup;
} else if (!fs.existsSync(backup) && out === target) fs.copyFileSync(target, backup);

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "d2lang-asar-"));
try {
  asar.extractAll(source, tmp);
  const web = path.join(tmp, "desktop", "dist", "web"), dst = path.join(web, "d2lang");
  for (const f of ["lang.js", "d2rfont.js", "zh-TW.json"]) fs.copyFileSync(path.join(root, f), path.join(dst, f));

  let font = false;
  try {
    const { extractD2rFont } = await import(new URL("../d2rfont.js", import.meta.url));
    const bytes = await extractD2rFont(dirHandle(d2rDir));
    fs.writeFileSync(path.join(dst, "d2r-font.ttf"), Buffer.from(bytes instanceof ArrayBuffer ? new Uint8Array(bytes) : bytes));
    font = true;
  } catch (e) { console.warn("取不到 D2R 字型，改用系統字型：", e.message); }

  // 啟動腳本：等遊戲畫面出現（遊戲模組已載入）才載入語言模組，避免搶在遊戲之前執行遊戲模組
  fs.writeFileSync(path.join(dst, "boot.js"), `// 由 lang/tools/desktop-lang.mjs 產生
window.__d2zhUrl = new URL("zh-TW.json", import.meta.url).href;
const ready = () => !!document.querySelector("canvas");
(async () => {
  for (let i = 0; i < 600 && !ready(); i++) await new Promise((r) => setTimeout(r, 200));
  await import(new URL("lang.js", import.meta.url).href);
  ${font ? `try { const r = await fetch(new URL("d2r-font.ttf", import.meta.url)); if (r.ok) await window.__d2lang?.useFontBytes?.(await r.arrayBuffer()); } catch (e) { console.warn("[d2lang] D2R 字型載入失敗", e); }` : ""}
})();
`);
  // 桌面版把翻譯器類別併在 lang-*.js 裡且沒有匯出（網頁版是獨立的 translate-*.js）：
  // 補一行匯出，語言模組才能像網頁版一樣改用我們的字典
  const assets = path.join(web, "assets");
  const langFile = fs.readdirSync(assets).find((f) => /^lang-[\w-]+\.js$/.test(f));
  if (langFile && !fs.readdirSync(assets).some((f) => /^translate-[\w-]+\.js$/.test(f))) {
    const p = path.join(assets, langFile), src = fs.readFileSync(p, "utf8");
    const cls = /var ([\w$]+)=class\{exact=new Map/.exec(src)?.[1];
    if (cls && !src.includes("__d2Translator")) fs.writeFileSync(p, `${src}\nexport{${cls} as __d2Translator};\n`);
    else if (!cls) console.warn("找不到遊戲翻譯器類別，桌面版只能用簡易比對");
  }

  const page = path.join(web, "play", "index.html");
  const h = fs.readFileSync(page, "utf8");
  if (!/<script type="module"[^>]*src="\.\.\/assets\/game-/.test(h)) throw new Error("遊戲頁面格式不同，無法注入");
  fs.writeFileSync(page, h.replace(/<script type="module"[^>]*src="\.\.\/assets\/game-/, (m) => `<script type="module" src="../${marker}"></script>\n${m}`));

  const packed = path.join(tmp, "..", path.basename(tmp) + ".asar");
  await asar.createPackage(tmp, packed);
  fs.copyFileSync(packed, out);
  fs.rmSync(packed, { force: true });
  console.log(`已注入語言模組到 ${out}${font ? "（含 D2R 原版繁中字型）" : ""}`);
} finally {
  fs.rmSync(tmp, { recursive: true, force: true });
}
