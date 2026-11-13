// 偵測掃描工具單元與基準驗證測試。
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const ROOT = path.resolve(__dirname, "..", "..");
const SCAN_SCRIPT = path.join(ROOT, "verify", "lib", "detection-scan.cjs");
const BASELINE_FILE = path.join(ROOT, "verify", "detection-baseline.json");
const { scan, diff } = require(SCAN_SCRIPT);

const EXPECTED_40_PARAMS = [
  "t", "god", "speed", "difficulty", "first", "slots", "terror", "act",
  "affixes", "farm", "cow", "power", "mf", "mana", "manakit", "manacost",
  "manaregen", "manathrottle", "carry", "replay", "class", "smoke",
  "checkpoints", "probe", "inifuss", "merc", "mercpicks", "hireall",
  "mercranks", "mercgear", "counts", "thief", "modpoints", "autosell",
  "shard", "shards", "chase", "clone", "keys", "uber",
].sort();

const EXPECTED_7_NATIVE = [
  "Storage.setItem",
  "WeakMap.get",
  "addEventListener",
  "devicePixelRatio",
  "drawImage",
  "putImageData",
  "requestAnimationFrame",
];

function writeBundle(dir, files) {
  fs.mkdirSync(dir, { recursive: true });
  for (const [rel, content] of Object.entries(files)) {
    const full = path.join(dir, rel);
    fs.mkdirSync(path.dirname(full), { recursive: true });
    fs.writeFileSync(full, content, "utf8");
  }
}

function runCli(args) {
  return spawnSync(process.execPath, [SCAN_SCRIPT, ...args], {
    cwd: ROOT,
    encoding: "utf8",
    windowsHide: true,
  });
}

function testFakeBundles() {
  const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), "d2-det-scan-test-"));
  try {
    const baseDir = path.join(tmpRoot, "bundle-base");
    const sameDir = path.join(tmpRoot, "bundle-same");
    const changedDir = path.join(tmpRoot, "bundle-changed");
    const onlineDir = path.join(tmpRoot, "bundle-online");
    const tmpBaseline = path.join(tmpRoot, "baseline.json");

    const baseCode = `
      const lb = "/api/leaderboard";
      const rep = "/api/report?ver=1";
      const k1 = "d2-survivors/save/v1";
      const k2 = "d2s:leaderboard-queue";
      const seal = "d2s/save-seal/1:TestSealKey";
      const ne = [["WeakMap.get", e => e.WeakMap.prototype.get], ["Storage.setItem", e => e.Storage.prototype.setItem]];
      const isNat = fn => /\\[native code\\]/.test(Function.prototype.toString.call(fn));
      const restricted = ["t", "god", "manathrottle", "mercpicks", "inifuss"];
      const notes = [["imported", true], ["edited", false], ["debug", false]];
      // 單純無關的畫面同步函式，不應觸發線上存檔提示
      function frameSync() { return "sync_frame"; }
    `;

    // Pixi 渲染器雜訊檔案（即使含 sync save 也不應觸發）
    const noiseRenderer = `
      // WebGLRenderer internal sync save state
      function syncSaveContext() { return "cloud login"; }
    `;

    writeBundle(baseDir, {
      "assets/app.js": baseCode,
      "assets/WebGLRenderer-abc12345.js": noiseRenderer,
      "play.html": "<!doctype html><html><body></body></html>",
    });

    writeBundle(sameDir, {
      "assets/app.js": baseCode,
      "assets/WebGLRenderer-abc12345.js": noiseRenderer,
      "play.html": "<!doctype html><html><body></body></html>",
    });

    // 1. 變更偵測特徵（新增 /api/leaderboard/checks 與 storageKey），但非線上存檔
    writeBundle(changedDir, {
      "assets/app.js": baseCode + `\nconst chk = "/api/leaderboard/checks";\nconst ckKey = "d2s:leaderboard-checks";\n`,
      "assets/WebGLRenderer-abc12345.js": noiseRenderer,
      "play.html": "<!doctype html><html><body></body></html>",
    });

    // 2. 新增 /api/save/sync 與線上存檔同步呼叫
    writeBundle(onlineDir, {
      "assets/app.js": baseCode + `\nasync function syncCloudSave(save) { return fetch("/api/save/sync?slot=1", { method: "POST", body: save }); }\n`,
      "assets/WebGLRenderer-abc12345.js": noiseRenderer,
      "play.html": "<!doctype html><html><body></body></html>",
    });

    // 驗證 scan(baseDir)
    const sBase = scan(baseDir);
    assert.deepEqual(sBase.apiPaths, ["/api/leaderboard", "/api/report"]);
    assert.deepEqual(sBase.storageKeys, ["d2-survivors/save/v1", "d2s:leaderboard-queue"]);
    assert.deepEqual(sBase.sealKeys, ["d2s/save-seal/1:TestSealKey"]);
    assert.deepEqual(sBase.nativeChecks, ["Storage.setItem", "WeakMap.get"]);
    assert.deepEqual(sBase.restrictedParams, ["god", "inifuss", "manathrottle", "mercpicks", "t"]);
    assert.deepEqual(sBase.uploadFields, ["debug", "edited", "imported"]);
    assert.equal(sBase.onlineSaveHints.length, 0, "雜訊過濾後不應有假陽性 onlineSaveHints");
    assert.equal(sBase.files.length, 3);

    // 驗證無變化 → changed: false, onlineSaveSuspected: false
    const sSame = scan(sameDir);
    const dSame = diff(sBase, sSame);
    assert.equal(dSame.summary.changed, false);
    assert.equal(dSame.summary.onlineSaveSuspected, false);

    // 驗證新增端點 → changed: true, onlineSaveSuspected: false
    const sChanged = scan(changedDir);
    const dChanged = diff(sBase, sChanged);
    assert.equal(dChanged.summary.changed, true);
    assert.equal(dChanged.summary.onlineSaveSuspected, false);
    assert.deepEqual(dChanged.apiPaths.added, ["/api/leaderboard/checks"]);
    assert.deepEqual(dChanged.storageKeys.added, ["d2s:leaderboard-checks"]);

    // 驗證新增 /api/save/sync → changed: true, onlineSaveSuspected: true
    const sOnline = scan(onlineDir);
    const dOnline = diff(sBase, sOnline);
    assert.equal(dOnline.summary.changed, true);
    assert.equal(dOnline.summary.onlineSaveSuspected, true);
    assert.deepEqual(dOnline.apiPaths.added, ["/api/save/sync"]);
    assert.ok(dOnline.onlineSaveHints.added.length >= 1, "應擷取到 onlineSaveHints 上下文");
    assert.equal(dOnline.onlineSaveHints.added[0].file, "assets/app.js");

    // 驗證 CLI --update 與 --diff exit codes (0 / 2 / 3)
    const rUp = runCli(["--build", baseDir, "--baseline", tmpBaseline, "--update"]);
    assert.equal(rUp.status, 0, `--update 應回傳 0，實際：${rUp.status}`);
    assert.ok(fs.existsSync(tmpBaseline), "應建立暫存基準檔");

    const rDiffSame = runCli(["--build", sameDir, "--baseline", tmpBaseline, "--diff"]);
    assert.equal(rDiffSame.status, 0, "無差異時 exit code 應為 0");
    assert.ok(rDiffSame.stdout.includes("偵測特徵無變化"), "無差異應印出『偵測特徵無變化』");

    const rDiffChanged = runCli(["--build", changedDir, "--baseline", tmpBaseline, "--diff"]);
    assert.equal(rDiffChanged.status, 2, "一般偵測特徵差異時 exit code 應為 2");

    const rDiffOnline = runCli(["--build", onlineDir, "--baseline", tmpBaseline, "--diff"]);
    assert.equal(rDiffOnline.status, 3, "疑似線上存檔時 exit code 應為 3");
  } finally {
    fs.rmSync(tmpRoot, { recursive: true, force: true });
  }
}

function testRealBaseline() {
  assert.ok(fs.existsSync(BASELINE_FILE), "verify/detection-baseline.json 必須存在");
  const baseline = JSON.parse(fs.readFileSync(BASELINE_FILE, "utf8"));

  assert.equal(baseline.build, "20261105.3", "基準檔版本應為 20261105.3");
  assert.ok(typeof baseline.generatedAt === "string" && baseline.generatedAt.length > 0);

  // 必備 API 端點
  assert.ok(baseline.apiPaths.includes("/api/leaderboard"), "應包含 /api/leaderboard");
  assert.ok(baseline.apiPaths.includes("/api/report"), "應包含 /api/report");
  assert.ok(baseline.apiPaths.includes("/api/leaderboard/checks"), "應包含 /api/leaderboard/checks");
  assert.ok(baseline.apiPaths.includes("/api/leaderboard/forge"), "應包含 /api/leaderboard/forge");

  // 必備 localStorage 鍵
  assert.ok(baseline.storageKeys.includes("d2-survivors/save/v1"), "應包含 d2-survivors/save/v1");
  assert.ok(baseline.storageKeys.includes("d2-survivors/hc/v1"), "應包含 d2-survivors/hc/v1");
  assert.ok(baseline.storageKeys.includes("d2s:leaderboard-queue"), "應包含 d2s:leaderboard-queue");
  assert.ok(baseline.storageKeys.includes("d2s:leaderboard-checks"), "應包含 d2s:leaderboard-checks");

  // 必備兩把封印金鑰與抽查／帳本雜湊前綴
  assert.ok(
    baseline.sealKeys.includes("d2s/save-seal/1:Rakanishu-Bishibosh-Coldcrow-Griswold-Pindleskin"),
    "應包含一般模式存檔封印金鑰"
  );
  assert.ok(
    baseline.sealKeys.includes("d2s/save-seal/hc/1:Blood-Raven-Treehead-Woodfist-Coldworm-Andariel"),
    "應包含專家模式存檔封印金鑰"
  );
  assert.ok(
    baseline.sealKeys.includes("d2s/late-checks/1:Bloodwitch-Fangskin-Witchmaker-Stormtree-Hephasto"),
    "應包含隨機抽查雜湊金鑰"
  );
  assert.ok(baseline.sealKeys.includes("d2s-life/1|"), "應包含專家生命帳本雜湊前綴");

  // 必備 7 個原生 API 檢查
  assert.deepEqual(baseline.nativeChecks, EXPECTED_7_NATIVE, "應包含 7 個 MOD 診斷檢查的原生 API");

  // 必備 40 個受限網址參數
  assert.equal(baseline.restrictedParams.length, 40, "受限網址參數應為 40 個");
  assert.deepEqual(baseline.restrictedParams, EXPECTED_40_PARAMS, "40 個受限網址參數應與官方清單完全一致");

  // 必備上傳紀錄旗標
  for (const flag of ["imported", "edited", "debug", "unranked", "restored"]) {
    assert.ok(baseline.uploadFields.includes(flag), `uploadFields 應包含 ${flag}`);
  }

  // 目前版本無線上存檔跡象
  assert.deepEqual(baseline.onlineSaveHints, []);

  // 對真實快照 20261105.3 執行 CLI --diff 應回傳 0
  const rReal = runCli(["--build", path.join(ROOT, "game-bundles", "20261105.3"), "--diff"]);
  assert.equal(rReal.status, 0);
  assert.ok(rReal.stdout.includes("偵測特徵無變化"));
}

testFakeBundles();
testRealBaseline();
console.log("PASS verify/tests/detection-scan.cjs");
