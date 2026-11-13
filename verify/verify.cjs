#!/usr/bin/env node
// D2 倖存者工具包自動驗證入口。
//   node verify/verify.cjs --update   偵測新版→下載快照→適配→驗證→（通過後）等你確認發布
//   node verify/verify.cjs --quick    只跑既有測試（不上網、不下載）
// 選項：--workers N（預設 8、上限 16）  --full（含實機長流程，預設不跑）
//       --force（版本沒變也重跑）  --dry（不改任何原始碼，只回報會改什麼）  --build X（用指定版本快照，不上網偵測）
const fs = require("node:fs"), path = require("node:path"), { spawnSync } = require("node:child_process");
const { P, writeJson, readJson, state, saveState } = require("./lib/util.cjs");
const suite = require("./suite.cjs");
const { runAll } = require("./lib/runner.cjs");
const game = require("./lib/game.cjs");
const adapt = require("./lib/adapt.cjs");
const comparison = require("./lib/compare.cjs");
const language = require("./lib/language-audit.cjs");
const impact = require("./lib/impact.cjs");
const repair = require("./lib/repair.cjs");
const { verificationFingerprint } = require("./lib/fingerprint.cjs");

const argv = process.argv.slice(2);
const flag = (n) => argv.includes("--" + n);
const opt = (n, d) => { const i = argv.indexOf("--" + n); return i >= 0 ? argv[i + 1] : d; };
const workers = Math.min(16, Math.max(1, Number(opt("workers", 8)) || 8));
const tiers = new Set(["static", "integration", ...(flag("full") ? ["full"] : [])]);
const log = (...a) => console.log(...a);
const report = { dry: flag("dry"), scope: "靜態檢查與隔離測試；未涵蓋真實遊戲操作", at: new Date().toISOString(), mode: flag("update") ? "update" : "quick", steps: [] };

async function runTests(selected) {
  const tests = selected ?? suite.filter((t) => !t.stale && tiers.has(t.tier));
  const t0 = Date.now(), results = await runAll(tests, workers);
  return { results, failed: results.filter((r) => !r.ok), seconds: Math.round((Date.now() - t0) / 1000), skipped: suite.filter((t) => t.stale).map((t) => t.id) };
}

// 失敗時產生給修復者用的故障單：只放失敗項目、輸出尾段與本次改動，不放整份日誌。
function ticket(stage, details) {
  const t = { at: new Date().toISOString(), build: report.build ?? null, stage, details };
  fs.mkdirSync(P.reports, { recursive: true });
  writeJson(path.join(P.reports, "ticket.json"), t);
  return t;
}
function finish(ok, summary) {
  report.ok = ok; report.summary = summary;
  fs.mkdirSync(P.reports, { recursive: true });
  writeJson(path.join(P.reports, "latest.json"), report);
  log(summary);
  process.exitCode = ok ? 0 : 1;
}

function runDetectionScan(build) {
  const scanScript = path.join(P.verify, "lib", "detection-scan.cjs");
  if (!fs.existsSync(scanScript)) {
    log("[提示] 偵測掃描工具尚未就緒（verify/lib/detection-scan.cjs 不存在），略過偵測掃描。");
    // 沒掃描不等於沒差異：標成「有差異、未確認」，auto.cjs 因此不會自動發布（人工確認後可加 --accept-detection）。
    const accepted = process.argv.includes("--accept-detection");
    const item = { status: "skipped", reason: "missing_script", changed: true, reviewRequired: !accepted, accepted, summary: "偵測掃描工具不存在，未掃描；需人工確認" };
    report.detection = item;
    report.steps.push({ detection: item });
    return { ok: true, skipped: true, detection: item };
  }

  const bundleDir = path.join(P.bundles, build);
  log(`執行偵測掃描：node verify/lib/detection-scan.cjs --build ${bundleDir} --diff`);
  const r = spawnSync(process.execPath, [scanScript, "--build", bundleDir, "--diff"], {
    cwd: P.root,
    encoding: "utf8",
    windowsHide: true,
    timeout: 120000,
  });
  const scanOut = ((r.stdout || "") + (r.stderr || "")).trim();

  if (r.status === 0) {
    log("偵測掃描通過：無差異。");
    const item = { ok: true, changed: false, summary: scanOut || "無差異" };
    report.detection = item;
    report.steps.push({ detection: item });
    return { ok: true, changed: false, detection: item };
  }

  if (r.status === 2) {
    log("偵測掃描：發現差異！\n" + (scanOut || "（無輸出摘要）"));
    const accepted = flag("accept-detection");
    const item = { ok: true, changed: true, reviewRequired: !accepted, accepted, summary: scanOut };
    report.detection = item;
    report.steps.push({ detection: item });
    if (!accepted) {
      log("⚠️ 偵測掃描發現差異，標記需人工確認（流程繼續，但不可自動發布；可加 --accept-detection 確認）。");
    } else {
      log("已指定 --accept-detection，接受偵測掃描差異。");
    }
    return { ok: true, changed: true, reviewRequired: !accepted, detection: item };
  }

  if (r.status === 3) {
    log("\n" + "=".repeat(60));
    log("🛑【重大警告】遊戲可能推出線上存檔，需使用者決定！");
    if (scanOut) log("偵測掃描輸出：\n" + scanOut);
    log("=".repeat(60) + "\n");
    ticket("detection-online-save", { summary: scanOut, build, code: 3 });
    const item = { ok: false, onlineSaveSuspected: true, summary: scanOut };
    report.detection = item;
    report.steps.push({ detection: item });
    finish(false, `【阻擋】遊戲可能推出線上存檔，需使用者決定！\n${scanOut}`);
    return { ok: false, onlineSaveSuspected: true, detection: item };
  }

  log(`偵測掃描執行異常（exit ${r.status}）：${scanOut}`);
  ticket("detection-error", { code: r.status, output: scanOut, build });
  const item = { ok: false, code: r.status, summary: scanOut };
  report.detection = item;
  report.steps.push({ detection: item });
  finish(false, `偵測掃描腳本失敗（exit ${r.status}）：${scanOut}`);
  return { ok: false, detection: item };
}

async function quick() {
  const r = await runTests();
  report.steps.push({ tests: r.results.map(({ tail, ...x }) => x) });
  if (!r.failed.length) { if (!flag("dry")) repair.saveGood(); return finish(true, `通過 ${r.results.length}／${r.results.length}（${r.seconds} 秒，並行 ${workers}）｜略過過時測試：${r.skipped.join("、")}`); }
  ticket("tests", r.failed.map((f) => ({ id: f.id, tail: f.tail })));
  finish(false, `失敗 ${r.failed.length}／${r.results.length}：${r.failed.map((f) => f.id).join("、")}（詳見 verify/reports/ticket.json）\n` + r.failed.map((f) => `\n✗ ${f.id}\n${f.tail}`).join("\n"));
}

async function update() {
  let build;
  if (opt("build")) build = opt("build");
  else {
    const latest = await game.latestBuild(); build = latest.build;

  }
  report.build = build;
  log(`遊戲版本 ${build}：${game.hasSnapshot(build) ? "沿用本機快照" : "下載完整遊戲包…"}`);
  if (!game.hasSnapshot(build)) {
    const idx = await game.download(build);
    if (!idx.complete) { ticket("download", idx.failed); return finish(false, `遊戲包下載不完整（${idx.failed.length} 個失敗），無法驗證。`); }
    log(`快照完成：${idx.fileCount} 個檔案`);
  }
  const det = runDetectionScan(build);
  if (!det.ok) return;
  const previous = state().lastVerified;
  const impactFile = path.join(P.reports, "impact.json");
  const savedImpact = readJson(impactFile, null);
  // Keep a human-reviewed prior-build comparison on same-build rechecks.
  // Otherwise a recheck would replace its completed items with an empty diff.
  const reviewedBaseline = previous?.build === build && savedImpact?.build === build
    && savedImpact.baseline && savedImpact.baseline !== build
    && savedImpact.items?.length ? savedImpact.baseline : null;
  const baseline = reviewedBaseline || (previous?.build === build ? previous?.comparison?.baseline : previous?.build);
  const review = impact.analyze(baseline, build, savedImpact);
  if (!review.ok) { ticket("impact", review); return finish(false, `更新內容分析失敗：${review.reason}。`); }
  writeJson(impactFile, review);
  report.steps.push({ impact: { baseline: review.baseline, baselineComplete: review.baselineComplete, total: review.items.length, pending: review.pending } });
  log(`官方更新內容：${review.items.length} 項，其中 ${review.pending} 項待分析；詳見 verify/reports/impact.json。`);
  const lang = await language.audit(baseline, build);
  report.steps.push({ language: lang });
  writeJson(path.join(P.reports, "language.json"), lang);
  if (!lang.ok) { ticket("language", lang); return finish(false, `翻譯檢查失敗：${lang.reason}。`); }
  const missing = lang.game.untranslatedAdded.length + lang.news.untranslatedAdded.length;
  log(`翻譯檢查：新增遊戲字串 ${lang.game.added}、字典值變更 ${lang.game.changed}、新聞 ${lang.news.added}，新增未翻譯 ${missing} 項；目前未翻譯：遊戲 ${lang.game.untranslatedAll.length}、新聞 ${lang.news.untranslatedAll.length} 項${lang.baselineComplete ? "" : "（缺少完整前版資料，檢查全部文字）"}；詳見 verify/reports/language.json。`);
  const diff = comparison.compare(baseline || previous?.build, build);
  const available = suite.filter((t) => !t.stale && tiers.has(t.tier));
  const forceAll = flag("force") || flag("full") || previous?.fingerprint !== verificationFingerprint();
  const selected = comparison.select(diff, available, forceAll);
  const skippedUnchanged = available.filter((t) => !selected.includes(t)).map((t) => t.id);
  report.steps.push({ comparison: diff, selected: selected.map((t) => t.id), skippedUnchanged, forceAll });
  log(`快照比對：${diff.baseline || "無前版"} → ${build}，變動 ${diff.changed.length} 個模組；${diff.complete ? diff.groups.join("、") || "無變動" : diff.reason}。`);
  log(`執行：${selected.map((t) => t.id).join("、") || "無"}；略過：${skippedUnchanged.join("、") || "無"}。`);
  const detDesc = !report.detection || report.detection.status === "skipped"
    ? "工具未就緒（略過）"
    : report.detection.changed
      ? (report.detection.accepted ? "發現差異（已人工確認 --accept-detection）" : "發現差異（⚠️ 需人工確認）")
      : "無差異";
  const liveDesc = "待實機階段執行（live-smoke 與 live-roles）";

  if (!selected.length) return finish(true, `遊戲 ${build} 比對完成，未發現需執行的測試；更新內容待分析 ${review.pending} 項、新增未翻譯 ${missing} 項；偵測掃描：${detDesc}；實機驗證：${liveDesc}。本次沒有更新相容版本。`);
  const a = adapt.analyze(build);
  report.steps.push({ analyze: a });
  if (!a.ok) { ticket("analyze", a.issues); return finish(false, `掛鉤點檢查失敗：\n- ${a.issues.join("\n- ")}\n（故障單：verify/reports/ticket.json）`); }
  const backupDir = path.join(P.root, "backups", "code", new Date().toISOString().replace(/[:.]/g, "-"));
  let changed = [];
  if (flag("dry")) log("（--dry）不修改原始碼。將替換檔名為：", a.roles.itemArt, a.roles.saveTransfer);
  else changed = adapt.applyNames(a.roles, backupDir);
  if (changed.length) log("已更新寫死的模組檔名：", changed.join("、"));
  let r = await runTests(selected);
  report.steps.push({ tests: r.results.map(({ tail, ...x }) => x) });
  if (r.failed.length) {
    const restored = flag("dry") ? [] : adapt.restore(backupDir);
    ticket("tests", { failed: r.failed.map((f) => ({ id: f.id, tail: f.tail })), autoChanges: changed, restored });
    return finish(false, `驗證失敗 ${r.failed.length}／${r.results.length}：${r.failed.map((f) => f.id).join("、")}。已還原自動改動（${restored.length} 檔）。故障單：verify/reports/ticket.json\n` + r.failed.map((f) => `\n✗ ${f.id}\n${f.tail}`).join("\n"));
  }
  if (!flag("dry")) { changed.push(...adapt.bumpTestedBuild(build, backupDir)); saveState({ lastVerified: { build, at: new Date().toISOString(), changed, fingerprint: verificationFingerprint(), comparison: diff, tested: selected.map((t) => t.id) } }); }
  if (!flag("dry")) repair.saveGood();
  finish(true, `遊戲 ${build} 選定測試通過 ${r.results.length}／${r.results.length}（${r.seconds} 秒）。自動更新：${[...new Set(changed)].join("、") || "無"}。\n更新內容待分析 ${review.pending} 項；新增未翻譯 ${missing} 項。詳見 verify/reports/impact.json 與 language.json。\n偵測掃描：${detDesc}。\n實機驗證：${liveDesc}。\n範圍：靜態檢查與隔離測試，未涵蓋真實遊戲操作。\n→ 完成更新內容、翻譯與真實遊戲載入驗證後自動發布。`);
}

// 根目錄是唯一來源（editor/ 已無副本，不需同步）。
(flag("update") ? update() : quick()).catch((e) => { console.error("驗證腳本本身錯誤：", e); process.exitCode = 2; });
