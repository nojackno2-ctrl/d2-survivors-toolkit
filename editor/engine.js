// 物品引擎：直接載入已安裝遊戲的程式碼，用遊戲自己的產生器做暗金／套裝／符文之語，
// 結果與遊戲掉落的物品完全相同（含可重現的 roll 種子），所以能通過遊戲的合法性檢查。
// 壓縮後的函式名稱每個版本可能不同，因此用程式碼特徵找出名稱。
const { app, BrowserWindow } = require("electron");
const fs = require("fs");
const path = require("path");

const GAME_ARCHIVE = path.join(process.env.ProgramFiles || "C:\\Program Files", "D2 Survivors", "resources", "app.asar");
const GAME_ASSETS = path.join(GAME_ARCHIVE, "desktop", "dist", "web", "assets");
const GAME_CHANGELOG = path.join(GAME_ARCHIVE, "desktop", "dist", "web", "changelog.json");
const ITEMSTATS = path.join(process.env.APPDATA, "D2 Survivors", "d2", "itemstats.json");

// 簽章、patch、引擎頁面都從本機隨附資源讀取（見 paths.js）
const paths = require("./paths");

let win = null, ready = null, preparedArchive = null;
function archiveStamp() {
  const stat = fs.statSync(GAME_ARCHIVE);
  return `${stat.size}:${stat.mtimeMs}`;
}
function installedBuild() {
  try { return JSON.parse(fs.readFileSync(GAME_CHANGELOG, "utf8"))?.[0]?.build ?? null; } catch { return null; }
}

async function prepare() {
  const sigText = paths.readAssetText("modifier/signatures.json");
  const patchText = paths.readAssetText("modifier/patch.mjs");
  const pageText = paths.readAssetText("modifier/engine-page.js");
  const SIGNATURES = JSON.parse(sigText);
  const stamp = archiveStamp();
  const dir = fs.mkdtempSync(path.join(app.getPath("temp"), "d2s-editor-engine-"));
  fs.mkdirSync(path.join(dir, "assets"), { recursive: true });
  if (!fs.existsSync(GAME_ASSETS)) throw new Error("找不到遊戲程式，請確認 D2 Survivors 安裝在預設位置。");
  // patch.mjs 是網頁版的 ES module（結尾多一行 export），桌面端要去掉再當 CommonJS 載入
  const patchFile = path.join(dir, "patch.js");
  fs.writeFileSync(patchFile, patchText.replace(/\r?\nexport const patch = self\.D2Patch\.patch;\s*$/, ""));
  const { patch } = require(patchFile);
  const files = {};
  for (const f of fs.readdirSync(GAME_ASSETS).filter((f) => f.endsWith(".js"))) files[f] = fs.readFileSync(path.join(GAME_ASSETS, f), "utf8");
  const { patched, missing, found } = patch(files, SIGNATURES);
  if (missing.length) throw new Error(`遊戲版本不相容：找不到 ${missing.join("、")}`);
  // 全部複製到同一個資料夾，區塊之間的相對 import 會指向加過 export 的同一份
  for (const [f, src] of Object.entries(files)) fs.writeFileSync(path.join(dir, "assets", f), patched[f] ?? src);
  fs.writeFileSync(path.join(dir, "engine-page.js"), pageText);
  const mods = Object.keys(patched);
  const gameScripts = Object.keys(files).filter((f) => /^Game-[\w-]+\.js$/.test(f));
  const build = installedBuild();
  if (archiveStamp() !== stamp) throw new Error("遊戲程式正在更新，請重新開啟工具包。");
  preparedArchive = stamp;
  const identity = { source: "desktop", build, gameScript: gameScripts.length === 1 ? gameScripts[0] : null, items: found.setData, save: found.rankDefs };
  fs.writeFileSync(path.join(dir, "engine.html"), `<!doctype html><meta charset="utf-8"><script type="module">
${mods.map((f, i) => `import * as G${i} from "./assets/${f}";`).join("\n")}
import { boot } from "./engine-page.js";
window.engine = boot(Object.assign({}, ${mods.map((_, i) => `G${i}`).join(", ")}), ${JSON.stringify(fs.readFileSync(ITEMSTATS, "utf8"))}, ${JSON.stringify(identity)});
</script>`);
  return path.join(dir, "engine.html");
}

function start() {
  if (ready) return ready;
  ready = (async () => {
    const page = await prepare();
    win = new BrowserWindow({ show: false, webPreferences: { webSecurity: false, contextIsolation: true } });
    await win.loadFile(page);
    for (let i = 0; i < 80; i++) {
      const ok = await win.webContents.executeJavaScript("!!window.engine");
      if (ok) return true;
      await new Promise((r) => setTimeout(r, 100));
    }
    throw new Error("物品引擎啟動逾時。");
  })();
  ready.catch(() => { ready = null; });
  return ready;
}

// 在引擎頁面裡呼叫 window.engine[fn](...args)
async function call(fn, ...args) {
  await start();
  let unchanged = false;
  try { unchanged = preparedArchive !== null && archiveStamp() === preparedArchive; } catch { /* 遊戲檔案消失時封鎖 */ }
  if (!unchanged) {
    if (fn === "capabilities") return { supported: false, weaponSets: false };
    throw new Error("遊戲程式已變更，已封鎖物品引擎；請重新開啟工具包。");
  }
  return win.webContents.executeJavaScript(`window.engine.${fn}(...${JSON.stringify(args)})`);
}

module.exports = { start, call, installedBuild };
