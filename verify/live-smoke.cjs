#!/usr/bin/env node
// 自動實機煙霧測試：在隔離 Electron 設定檔開官方 https://d2survivors.lol/play/，
// 從本機臨時伺服器載入待發布工具包（等同玩家點書籤），確認遊戲、輔助器、語言掛接都成功，
// 結果寫入 verify/reports/live.json（綁定版本與來源指紋，publish.cjs 據此放行）。
//   node verify/live-smoke.cjs [--build X] [--class amazon] [--timeout 240]
// 存檔：環境變數 D2_SEED 指定 JSON 存檔；未指定時用 backups/saves/test-fixture/save.json（副本，不改原檔）。
const fs = require("node:fs"), path = require("node:path"), http = require("node:http"), os = require("node:os");
const { spawn } = require("node:child_process");
const { P, writeJson, state } = require("./lib/util.cjs");
const { verificationFingerprint } = require("./lib/fingerprint.cjs");

const argv = process.argv.slice(2);
const opt = (n, d) => { const i = argv.indexOf("--" + n); return i >= 0 ? argv[i + 1] : d; };
const build = opt("build", state().lastVerified?.build);
const cls = opt("class", "amazon");
const timeoutSec = Number(opt("timeout", 240));
const URL = "https://d2survivors.lol/play/";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const MIME = { ".js": "text/javascript", ".mjs": "text/javascript", ".json": "application/json", ".html": "text/html", ".css": "text/css", ".png": "image/png", ".woff2": "font/woff2" };

function serve() {
  return new Promise((resolve) => {
    const srv = http.createServer((req, res) => {
      const rel = decodeURIComponent(req.url.split("?")[0]).replace(/^\/+/, "");
      const file = path.resolve(P.root, rel || "index.html");
      res.setHeader("Access-Control-Allow-Origin", "*");
      res.setHeader("Cache-Control", "no-store");
      if (!file.startsWith(P.root) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.statusCode = 404; return res.end(); }
      res.setHeader("Content-Type", MIME[path.extname(file)] || "application/octet-stream");
      fs.createReadStream(file).pipe(res);
    });
    srv.listen(0, "127.0.0.1", () => resolve(srv));
  });
}

async function main() {
  if (!build) throw new Error("沒有已驗證的版本，請先執行 verify.cjs --update");
  const electron = path.join(P.editor, "node_modules", "electron", "dist", process.platform === "win32" ? "electron.exe" : "electron");
  if (!fs.existsSync(electron)) throw new Error("找不到 Electron：" + electron);
  const out = fs.mkdtempSync(path.join(os.tmpdir(), "d2-smoke-"));
  const seedSrc = process.env.D2_SEED || path.join(P.root, "backups", "saves", "test-fixture", "save.json");
  const env = { ...process.env, H_OUT: out, H_CLASS: cls, H_BOT: path.join(P.root, "helper", "autobot.js") };
  delete env.ELECTRON_RUN_AS_NODE; // 設為空字串也會讓 Electron 以 Node 模式執行
  if (fs.existsSync(seedSrc)) { const copy = path.join(out, "seed.json"); fs.copyFileSync(seedSrc, copy); env.H_SEED = copy; }
  const srv = await serve();
  env.H_BASE = `http://127.0.0.1:${srv.address().port}/`;
  const child = spawn(electron, [path.join(P.root, "tests", "live-harness")], { env, stdio: "ignore", windowsHide: true });
  const result = { ok: false, build, url: URL, at: null, fingerprint: verificationFingerprint(), evidence: { method: "verify/live-smoke.cjs：Electron 隔離設定檔開官方網址，從本機臨時伺服器載入待發布工具包", class: cls, seed: env.H_SEED ? "存檔副本" : "新存檔", out } };
  const read = (f) => { try { return JSON.parse(fs.readFileSync(path.join(out, f), "utf8")); } catch { return null; } };
  const ask = async (code) => { // 透過 harness 的 cmd.js 執行唯讀查詢，結果寫在 log.txt 的 cmd 行
    const marker = "Q" + Date.now();
    fs.writeFileSync(path.join(out, "cmd.js"), `(()=>{try{return {${JSON.stringify(marker)}:(${code})}}catch(e){return {${JSON.stringify(marker)}:{error:String(e)}}}})()`);
    for (let i = 0; i < 6; i++) {
      await sleep(5000);
      const line = (fs.readFileSync(path.join(out, "log.txt"), "utf8").split("\n").find((l) => l.includes(marker)) || "");
      if (line) { try { return JSON.parse(line.slice(line.indexOf("{")))[marker]; } catch { return null; } }
    }
    return null;
  };
  try {
    const t0 = Date.now(); let st = null;
    while (Date.now() - t0 < timeoutSec * 1000) {
      await sleep(5000);
      st = read("status.json");
      if (st?.diag?.connected && st.state && st.state !== "select") break;
    }
    result.evidence.status = st;
    const checks = await ask(`{lang: window.__d2lang?.debug?.() ?? null, autobot: !!window.__d2autobot, game: !!window.__d2autobot?.game, editor: !!window.__d2editLauncher, guard: !!window.__d2guard, gamedata: !!window.__d2gamedataPromise}`);
    result.evidence.checks = checks;
    const selfCheck = await ask(`window.__d2editSelfCheck ?? null`);
    result.evidence.selfCheck = selfCheck;
    const log = fs.existsSync(path.join(out, "log.txt")) ? fs.readFileSync(path.join(out, "log.txt"), "utf8") : "";
    result.evidence.errors = log.split("\n").filter((l) => /console (UNH|ERR)|GONE|FAIL/.test(l)).slice(0, 20);
    const gameBuild = st?.diag?.gameBuild?.build ?? null;
    result.evidence.gameBuild = gameBuild;
    const problems = [];
    if (!st?.diag?.connected) problems.push("輔助器未接上遊戲物件");
    if (!st?.state || st.state === "select") problems.push("未進入遊戲（狀態：" + (st?.state ?? "無") + "）");
    if (!checks?.lang?.gameHooked) problems.push("語言包未掛上遊戲翻譯（gameHooked=false）");
    if (!checks?.editor) problems.push("修改器入口未載入（__d2editLauncher 不存在）");
    if (!checks?.guard) problems.push("防護模組未載入（__d2guard 不存在）");
    if (gameBuild && typeof gameBuild === "string" && gameBuild !== build) problems.push(`遊戲版本 ${gameBuild} 與驗證版本 ${build} 不同`);
    if (!selfCheck) problems.push("工具包自檢沒有產生結果（__d2editSelfCheck 不存在）");
    for (const i of selfCheck?.issues || []) if (i.level === "error") problems.push(`自檢錯誤［${i.area}］${i.msg}`);
    result.problems = problems;
    result.ok = problems.length === 0;
  } finally {
    result.at = new Date().toISOString();
    try { child.kill(); } catch {}
    srv.close();
  }
  writeJson(path.join(P.reports, "live.json"), result);
  console.log(result.ok ? `實機煙霧測試通過（${build}，${cls}）` : `實機煙霧測試失敗：${result.problems.join("；")}`);
  process.exitCode = result.ok ? 0 : 1;
}
main().catch((e) => { console.error("實機煙霧測試錯誤：", e.message); process.exitCode = 2; });
