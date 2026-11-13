#!/usr/bin/env node
// 實機角色與防護驗證執行器（toolkit-roles-live）
// 以隔離 Electron 執行 tests/live-harness/toolkit-roles-live.cjs，
// 驗證防護載入、排行榜封鎖、輔助器不寫存檔、線上模式限制、防護頁、修改器寫入。
//   node verify/lib/live-roles.cjs [--timeout 300] [--out <path>]
const fs = require("node:fs");
const path = require("node:path");
const { spawn } = require("node:child_process");
const { P, readJson, writeJson } = require("./util.cjs");

let electronPathCache;
function getElectronPath() {
  if (electronPathCache) return electronPathCache;
  try {
    electronPathCache = require(path.join(P.editor, "node_modules", "electron"));
    return electronPathCache;
  } catch {
    const candidate = path.join(P.editor, "node_modules", "electron", "dist", process.platform === "win32" ? "electron.exe" : "electron");
    if (fs.existsSync(candidate)) {
      electronPathCache = candidate;
      return candidate;
    }
    throw new Error("找不到 Electron 執行檔：" + candidate);
  }
}

function runLiveRoles(options = {}) {
  return new Promise((resolve) => {
    const timeoutSec = Number(options.timeout || 300);
    const outFile = options.out || path.join(P.reports, "live-roles.json");
    const scriptPath = path.join(P.root, "tests", "live-harness", "toolkit-roles-live.cjs");

    if (!fs.existsSync(scriptPath)) {
      const err = `[缺檔] 實機腳本不存在：${scriptPath}`;
      console.error(err);
      return resolve({ ok: false, code: 1, seconds: 0, error: err, results: [], passed: 0, failed: 1 });
    }

    let electronCmd;
    try {
      electronCmd = getElectronPath();
    } catch (e) {
      console.error(e.message);
      return resolve({ ok: false, code: 1, seconds: 0, error: e.message, results: [], passed: 0, failed: 1 });
    }

    fs.mkdirSync(path.dirname(outFile), { recursive: true });
    try { fs.rmSync(outFile, { force: true }); } catch {}

    const env = { ...process.env, ELECTRON_ENABLE_LOGGING: "" };
    delete env.ELECTRON_RUN_AS_NODE;

    const started = Date.now();
    let stdout = "";
    let stderr = "";
    let timedOut = false;

    console.log(`啟動實機角色與防護測試（toolkit-roles-live，逾時上限 ${timeoutSec} 秒）...`);
    const child = spawn(electronCmd, [scriptPath, outFile], {
      cwd: P.editor,
      windowsHide: true,
      env,
      stdio: ["ignore", "pipe", "pipe"],
    });

    const timer = setTimeout(() => {
      timedOut = true;
      console.error(`\n[逾時] toolkit-roles-live 超過 ${timeoutSec} 秒，強制終止行程`);
      try { child.kill(); } catch {}
    }, timeoutSec * 1000);

    child.stdout.on("data", (d) => { stdout += d; });
    child.stderr.on("data", (d) => { stderr += d; });
    child.on("error", (err) => {
      stderr += "\n[啟動失敗] " + err.message;
    });

    child.on("close", (code) => {
      clearTimeout(timer);
      const elapsedSec = +((Date.now() - started) / 1000).toFixed(1);
      const outReport = readJson(outFile, null);

      console.log("\n--- toolkit-roles-live 測試結果 ---");
      const results = outReport?.results || [];
      for (const item of results) {
        if (item.ok) {
          console.log(`  ✓ [通過] ${item.name}`);
        } else {
          const detailStr = item.detail ? (typeof item.detail === "string" ? item.detail : JSON.stringify(item.detail)) : "";
          console.log(`  ✗ [失敗] ${item.name}${detailStr ? "：" + detailStr.slice(0, 300) : ""}`);
        }
      }

      const passed = typeof outReport?.passed === "number" ? outReport.passed : results.filter((r) => r.ok).length;
      const failed = typeof outReport?.failed === "number" ? outReport.failed : (results.length ? results.length - passed : 1);
      const ok = code === 0 && !timedOut && failed === 0 && results.length > 0 && results.every((r) => r.ok);

      const summary = `實機角色與防護測試：${ok ? "全部通過" : "未通過"}（通過 ${passed} 項，失敗 ${failed} 項，耗時 ${elapsedSec} 秒${timedOut ? "，逾時" : ""}）`;
      console.log(summary);

      resolve({
        ok,
        code: timedOut ? 124 : code,
        timedOut,
        seconds: elapsedSec,
        passed,
        failed,
        results,
        report: outReport,
        stdout,
        stderr,
        summary,
      });
    });
  });
}

if (require.main === module) {
  const argv = process.argv.slice(2);
  const opt = (n, d) => { const i = argv.indexOf("--" + n); return i >= 0 ? argv[i + 1] : d; };
  const timeout = opt("timeout", 300);
  const out = opt("out", path.join(P.reports, "live-roles.json"));

  runLiveRoles({ timeout, out }).then((res) => {
    process.exit(res.ok ? 0 : 1);
  }).catch((err) => {
    console.error("執行異常：", err);
    process.exit(2);
  });
}

module.exports = { runLiveRoles };
