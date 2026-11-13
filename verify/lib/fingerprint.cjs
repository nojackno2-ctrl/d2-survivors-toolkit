// 可重現的驗證來源指紋：只納入程式、測試與驗證規則，不納入報告或執行輸出。
const fs = require("node:fs"), path = require("node:path"), crypto = require("node:crypto");
const { P } = require("./util.cjs");

const CODE = /\.(?:cjs|mjs|js|json|html)$/i;
const GENERATED_DIRS = new Set([".git", "node_modules", "dist", "out", "profile", "backups", "reports"]);

function verificationFingerprint() {
  const files = [];
  const collect = (dir, skipRuns = false) => {
    if (!fs.existsSync(dir)) return;
    for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
      const file = path.join(dir, ent.name);
      if (ent.isDirectory()) {
        if (GENERATED_DIRS.has(ent.name) || (skipRuns && /^run-/i.test(ent.name))) continue;
        collect(file, skipRuns);
      } else if (ent.isFile() && CODE.test(ent.name)) files.push(file);
    }
  };

  // 網頁版、輔助器、語言、防護與測試的程式都在根目錄對應資料夾；不收 game-bundles（遊戲快照）。run-* 執行輸出不計入。
  for (const d of ["helper", "lang", "modifier", "guard", "editor", "tools", "tests"]) collect(path.join(P.root, d), true);
  if (fs.existsSync(path.join(P.root, "d2edit.js"))) files.push(path.join(P.root, "d2edit.js"));
  // 驗證根目錄只含規則與入口；reports、backups、lastgood 等生成資料不計入。
  for (const ent of fs.readdirSync(P.verify, { withFileTypes: true })) {
    const file = path.join(P.verify, ent.name);
    if (ent.isFile() && CODE.test(ent.name) && ent.name !== "state.json") files.push(file);
  }
  collect(path.join(P.verify, "lib"));

  const hash = crypto.createHash("sha256");
  for (const file of [...new Set(files)].sort()) {
    hash.update(path.relative(P.root, file));
    hash.update(fs.readFileSync(file));
  }
  return hash.digest("hex");
}

module.exports = { verificationFingerprint };
