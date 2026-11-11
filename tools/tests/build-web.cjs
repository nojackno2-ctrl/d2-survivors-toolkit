// 建置腳本回歸測試：只在暫存目錄建立來源副本，不會改寫專案根目錄的輸出。
const fs = require("node:fs"), path = require("node:path"), os = require("node:os");
const assert = require("node:assert/strict"), { spawnSync } = require("node:child_process");

const repo = path.resolve(__dirname, "..", "..");
const SOURCES = ["tools/build-web.js", "d2edit.js", "modifier/editor.html", "site/install.template.html", "editor/package.json", "helper/autobot.js", "helper/forge-local.js", "helper/autoforge.js", "helper/autoforge-ui.js", "helper/selfcheck.js", "lang/zh-TW.json", "modifier/signatures.json"];

const temp = fs.mkdtempSync(path.join(os.tmpdir(), "d2toolkit-build-"));
for (const f of SOURCES) {
  fs.mkdirSync(path.dirname(path.join(temp, f)), { recursive: true });
  fs.copyFileSync(path.join(repo, f), path.join(temp, f));
}
fs.writeFileSync(path.join(temp, "AI_HANDOFF.md"), "協作紀錄"); // 不可被建置覆蓋
const build = (...args) => spawnSync(process.execPath, [path.join(temp, "tools", "build-web.js"), ...args], { encoding: "utf8" });

// 1) 正常建置：安裝頁填入書籤、根目錄轉址、version.json、.nojekyll
let r = build("https://example.test/tool/", "測試說明");
assert.equal(r.status, 0, r.stderr);
assert.match(fs.readFileSync(path.join(temp, "site", "install.html"), "utf8"), /https:\/\/example\.test\/tool\/d2edit\.js/);
assert.match(fs.readFileSync(path.join(temp, "index.html"), "utf8"), /site\/install\.html/);
const meta = JSON.parse(fs.readFileSync(path.join(temp, "version.json"), "utf8"));
assert.equal(meta.version, JSON.parse(fs.readFileSync(path.join(repo, "editor", "package.json"), "utf8")).version);
assert.equal(meta.note, "測試說明");
assert.ok(fs.existsSync(path.join(temp, ".nojekyll")));
assert.equal(fs.readFileSync(path.join(temp, "AI_HANDOFF.md"), "utf8"), "協作紀錄");

// 2) 來源缺檔：必須失敗，且不寫出任何輸出
const indexBefore = fs.readFileSync(path.join(temp, "index.html"), "utf8");
fs.unlinkSync(path.join(temp, "helper", "autobot.js"));
r = build("https://example.test/tool/");
assert.notEqual(r.status, 0);
assert.equal(fs.readFileSync(path.join(temp, "index.html"), "utf8"), indexBefore);
fs.copyFileSync(path.join(repo, "helper", "autobot.js"), path.join(temp, "helper", "autobot.js"));

// 3) 版號不一致：必須失敗
const pkgPath = path.join(temp, "editor", "package.json");
const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf8"));
fs.writeFileSync(pkgPath, JSON.stringify({ ...pkg, version: "9.9.9" }));
r = build("https://example.test/tool/");
assert.notEqual(r.status, 0);
assert.match(r.stderr, /TOOLKIT_VERSION/);

// 4) 參數格式錯誤：必須失敗
r = build("not-a-url");
assert.notEqual(r.status, 0);

fs.rmSync(temp, { recursive: true, force: true });
console.log("建置腳本回歸測試通過：產生輸出、來源缺檔保護、版號檢查、參數檢查。");
