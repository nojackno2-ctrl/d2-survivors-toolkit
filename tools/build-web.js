// 產生網頁版的輸出檔：安裝頁（site/install.html）、根目錄轉址（index.html）、version.json、.nojekyll。
// 網頁版的所有程式與資料都在根目錄（唯一來源），這個腳本不複製任何檔案，也不改寫來源。
// 版號來源：editor/package.json；modifier/editor.html 的 TOOLKIT_VERSION 必須與它一致。
// 用法：node tools/build-web.js https://你的網址/路徑/ [更新說明]
const fs = require("fs");
const path = require("path");

const root = path.join(__dirname, "..");
const host = process.argv[2];
if (!host || !/^https?:\/\/.+\/$/.test(host)) {
  console.error("用法：node tools/build-web.js https://你的網址/路徑/   （結尾要有 /）");
  process.exit(1);
}
// 先確認來源齊全，避免寫到一半才發現缺檔
const SOURCES = ["d2edit.js", "modifier/editor.html", "site/install.template.html", "editor/package.json", "helper/autobot.js", "helper/forge-local.js", "helper/autoforge.js", "helper/autoforge-ui.js", "helper/selfcheck.js", "lang/zh-TW.json", "modifier/signatures.json"];
for (const f of SOURCES) {
  if (!fs.existsSync(path.join(root, f)) || !fs.statSync(path.join(root, f)).isFile()) throw new Error("缺少建置來源：" + f);
}
const read = (f) => fs.readFileSync(path.join(root, f), "utf8");
const write = (f, text) => fs.writeFileSync(path.join(root, f), text);

const pkg = JSON.parse(read("editor/package.json"));
const inPage = read("modifier/editor.html").match(/const TOOLKIT_VERSION = "([^"]+)"/)?.[1];
if (inPage !== pkg.version) throw new Error(`modifier/editor.html 的 TOOLKIT_VERSION（${inPage}）與 editor/package.json（${pkg.version}）不一致`);

// 安裝頁：把書籤程式碼填進範本
const bookmarklet = `javascript:import('${host}d2edit.js?v='+Date.now())`;
write("site/install.html", read("site/install.template.html")
  .replaceAll("{{BOOKMARKLET}}", bookmarklet)
  .replaceAll("{{BOOKMARKLET_HTML}}", bookmarklet.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;")));

// GitHub Pages 根網址轉到 site/ 的安裝頁
write("index.html", ["<!doctype html>", '<meta charset="utf-8">', "<title>D2倖存者工具包</title>", '<meta http-equiv="refresh" content="0; url=site/install.html">', '<a href="site/install.html">前往安裝頁 / Go to the install page</a>', ""].join("\n"));

// 修改器開著時會定期讀 version.json，發現新版就提醒玩家
const note = process.argv[3] || "";
write("version.json", JSON.stringify({ version: pkg.version, note, date: new Date().toISOString().slice(0, 10) }) + "\n");
write(".nojekyll", "");
console.log("已產生網頁版輸出（根目錄與 site/）");
console.log("書籤：", bookmarklet);
