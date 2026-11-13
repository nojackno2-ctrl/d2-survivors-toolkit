// 並行執行測試登記表；每個測試獨立子行程，失敗自動重試（偶發逾時）。結果只回傳精簡物件。
const fs = require("node:fs");
const { spawn } = require("node:child_process");
const path = require("node:path");
const { P } = require("./util.cjs");

let electronPath;
const electron = () => (electronPath ??= require(path.join(P.editor, "node_modules", "electron")));

function runOne(t, attempt = 1) {
  return new Promise((resolve) => {
    const started = Date.now();
    const testPath = path.join(P.root, t.file);
    if (!fs.existsSync(testPath)) {
      return resolve({
        id: t.id,
        ok: false,
        missing: true,
        code: 1,
        attempt: 1,
        seconds: 0,
        tail: `[缺檔] 測試檔不存在：${t.file}`,
      });
    }
    const cmd = t.kind === "electron" ? electron() : process.execPath;
    const args = [testPath]; // 測試檔以根目錄相對路徑登記（見 suite.cjs）
    let out = "";
    const child = spawn(cmd, args, { cwd: P.editor, windowsHide: true, env: { ...process.env, ELECTRON_ENABLE_LOGGING: "" } });
    const timer = setTimeout(() => { out += "\n[逾時，強制結束]"; child.kill(); }, (t.timeout || 120) * 1000);
    child.stdout.on("data", (d) => (out += d)); child.stderr.on("data", (d) => (out += d));
    child.on("error", (err) => { out += "\n[啟動失敗] " + err.message; });
    child.on("close", (code) => {
      clearTimeout(timer);
      const ok = code === 0;
      // 失敗先重試一次，排除電腦負載造成的偶發逾時；兩次都失敗才算真失敗。
      if (!ok && attempt < 2) {
        const previous = { code, seconds: +((Date.now() - started) / 1000).toFixed(1), tail: out.trim().split(/\r?\n/).slice(-12).join("\n") };
        return resolve(runOne(t, attempt + 1).then((next) => ({ ...next, previousAttempts: [previous, ...(next.previousAttempts || [])] })));
      }
      resolve({ id: t.id, ok, code, attempt, seconds: +((Date.now() - started) / 1000).toFixed(1), tail: out.trim().split(/\r?\n/).slice(-12).join("\n") });
    });
  });
}

async function runAll(tests, workers = 8) {
  const queue = tests.slice(), results = [];
  const worker = async () => { for (let t; (t = queue.shift()); ) results.push(await runOne(t)); };
  await Promise.all(Array.from({ length: Math.min(workers, tests.length) }, worker));
  return results.sort((a, b) => tests.findIndex((t) => t.id === a.id) - tests.findIndex((t) => t.id === b.id));
}
module.exports = { runAll };
