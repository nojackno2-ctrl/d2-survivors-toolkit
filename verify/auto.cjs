#!/usr/bin/env node
// 全自動遊戲更新（使用者說「遊戲更新了」時由 AI 執行；不使用排程）：偵測官方新版 → 下載快照與自動適配 → 回歸測試 → 實機煙霧測試 → 相容發布。
// 目標是「快速相容新版」；官方新增內容不自動做，列在 verify/reports/new-content.md 由使用者決定。
//   node verify/auto.cjs              有新版才跑；通過即自動發布（網頁版，不打包 exe）
//   node verify/auto.cjs --force      版本沒變也重跑
//   node verify/auto.cjs --no-publish 只驗證不發布
//   node verify/auto.cjs --accept-detection 接受官方偵測掃描差異並允許自動發布
// 安全閘：任一步失敗就停（不發布，留故障單）；啟動時工作目錄已有未提交修改（他人進行中的工作）也不發布。
const fs = require("node:fs"), path = require("node:path"), { spawnSync } = require("node:child_process");
const { P, readJson, writeJson, state } = require("./lib/util.cjs");
const game = require("./lib/game.cjs");

const argv = process.argv.slice(2), has = (n) => argv.includes("--" + n);
const LOCK = path.join(P.reports, "auto.lock");
const LOG = path.join(P.reports, "auto-log.md");
const node = (script, args = [], timeout = 1800000) => {
  const r = spawnSync(process.execPath, [path.join(P.verify, script), ...args], { cwd: P.root, encoding: "utf8", timeout, windowsHide: true });
  return { ok: r.status === 0, out: ((r.stdout || "") + (r.stderr || "")).trim() };
};
const git = (...a) => {
  const r = spawnSync("git", a, { cwd: P.root, encoding: "utf8", windowsHide: true });
  if (r.error || r.status !== 0) throw new Error(`git ${a.join(" ")} 失敗：${r.error?.message || r.stderr || `退出碼 ${r.status}`}`);
  return (r.stdout || "").trim();
};
const stamp = () => new Date().toISOString().replace("T", " ").slice(0, 16);
const result = { at: new Date().toISOString(), steps: [] };
const step = (name, ok, detail) => { result.steps.push({ name, ok, detail: String(detail || "").slice(-3000) }); console.log(`${ok ? "✓" : "✗"} ${name}`); };

function notify(title, body) { // Windows 通知（失敗不影響流程）
  if (process.platform !== "win32") return;
  const ps = `[Windows.UI.Notifications.ToastNotificationManager,Windows.UI.Notifications,ContentType=WindowsRuntime]>$null;$x=[Windows.UI.Notifications.ToastNotificationManager]::GetTemplateContent(1);$t=$x.GetElementsByTagName('text');$t.Item(0).AppendChild($x.CreateTextNode(${JSON.stringify(title)}))>$null;$t.Item(1).AppendChild($x.CreateTextNode(${JSON.stringify(body)}))>$null;[Windows.UI.Notifications.ToastNotificationManager]::CreateToastNotifier('D2 Survivors Toolkit').Show([Windows.UI.Notifications.ToastNotification]::new($x))`;
  spawnSync("powershell", ["-NoProfile", "-Command", ps], { windowsHide: true, timeout: 20000 });
}

function newContentReport(build) {
  const impact = readJson(path.join(P.reports, "impact.json"), null);
  const lang = readJson(path.join(P.reports, "language.json"), null);
  const pending = (impact?.build === build ? impact.items : []).filter((i) => i.status !== "已完成");
  const untrGame = lang?.game?.untranslatedAdded || [], untrNews = lang?.news?.untranslatedAdded || [];
  const fmt = (x) => typeof x === "string" ? x : x?.text ?? x?.en ?? x?.key ?? JSON.stringify(x);
  const md = [`# 遊戲 ${build} 新內容（待你決定是否加入工具包）`, "", `產生時間：${stamp()}。工具包已自動完成相容驗證；以下為官方新增、尚未針對性處理的項目。`, "",
    `## 官方更新條目（${pending.length}）`, ...(pending.length ? pending.map((i) => `- [${i.kind || "—"}] ${i.text}（可能影響：${i.areas.join("、")}）`) : ["- 無"]), "",
    `## 新增未翻譯字串（遊戲 ${untrGame.length}、新聞 ${untrNews.length}）`, ...[...untrGame, ...untrNews].slice(0, 200).map((x) => `- ${fmt(x)}`), ""].join("\n");
  fs.writeFileSync(path.join(P.reports, "new-content.md"), md);
  return { pending: pending.length, untranslated: untrGame.length + untrNews.length };
}

async function main() {
  fs.mkdirSync(P.reports, { recursive: true });
  if (fs.existsSync(LOCK) && Date.now() - fs.statSync(LOCK).mtimeMs < 3 * 3600e3) { console.log("另一個自動更新正在執行，略過。"); return; }
  fs.writeFileSync(LOCK, String(process.pid));
  try {
    const latest = await game.latestBuild();
    result.build = latest.build;
    const verified = state().lastVerified?.build;
    const published = readJson(path.join(P.reports, "auto.json"), null);
    const alreadyDone = verified === latest.build && published?.build === latest.build && published?.ok;
    if (alreadyDone && !has("force")) { console.log(`官方 ${latest.build} 已相容，無需更新。`); return; }
    const dirty = git("status", "--porcelain", "--untracked-files=no").split(/\r?\n/).filter(Boolean);
    result.dirtyAtStart = dirty;

    const v = node("verify.cjs", [
      "--update",
      ...(has("force") || verified === latest.build ? ["--force"] : []),
      ...(has("accept-detection") ? ["--accept-detection"] : []),
    ]);
    const latestReport = readJson(path.join(P.reports, "latest.json"), null);
    if (latestReport?.detection) result.detection = latestReport.detection;
    if (result.detection?.onlineSaveSuspected) {
      step("官方偵測掃描（detection-scan）", false, "疑似線上存檔：遊戲可能推出線上存檔，需使用者決定！");
      throw new Error("【阻擋】遊戲可能推出線上存檔，需使用者決定！已立即停止更新流程。");
    }
    const det = result.detection;
    const detDesc = !det || det.status === "skipped"
      ? (det?.summary || "工具未就緒，已略過")
      : det.changed
        ? (det.accepted || has("accept-detection") ? `發現差異（已人工確認）：\n${det.summary}` : `發現差異（需人工確認，不自動發布）：\n${det.summary}`)
        : "無差異";
    step("官方偵測掃描（detection-scan）", !det?.onlineSaveSuspected, detDesc);

    step("下載快照、自動適配與回歸測試（verify --update）", v.ok, v.out);
    if (!v.ok) throw new Error("回歸測試失敗，見 verify/reports/ticket.json");
    if (state().lastVerified?.build !== latest.build) throw new Error("驗證未記錄新版（可能未選到測試），請人工檢查 verify/reports/latest.json");

    const s = node("live-smoke.cjs", ["--build", latest.build], 600000);
    step("官方網址實機煙霧測試（live-smoke）", s.ok, s.out);
    if (!s.ok) throw new Error("實機煙霧測試失敗，見 verify/reports/live.json");

    const roles = node(path.join("lib", "live-roles.cjs"), ["--timeout", "300"], 360000);
    step("實機角色與防護驗證（toolkit-roles-live）", roles.ok, roles.out);
    if (!roles.ok) throw new Error("實機角色與防護驗證失敗，見 verify/reports/live-roles.json");

    result.newContent = newContentReport(latest.build);
    step("整理新內容清單（reports/new-content.md）", true, JSON.stringify(result.newContent));

    if (has("no-publish")) { result.ok = true; result.published = false; return; }
    if (result.detection?.changed && !result.detection?.accepted && !has("accept-detection")) {
      result.ok = true; result.published = false;
      result.note = "偵測掃描發現差異，需人工確認後方可發布（可指定 --accept-detection 旗標略過阻擋）";
      console.log(result.note);
      return;
    }
    const branch = git("rev-parse", "--abbrev-ref", "HEAD");
    if (branch !== "main") { result.ok = true; result.published = false; result.note = `目前在分支 ${branch}，只在 main 自動發布`; console.log(result.note); return; }
    if (dirty.length) { result.ok = true; result.published = false; result.note = "啟動時工作目錄有未提交修改，為保護進行中的工作未自動發布：" + dirty.join("、"); console.log(result.note); return; }
    const pub = node("publish.cjs", ["--confirm", "--auto", "--no-desktop"]);
    step("自動發布（網頁版）", pub.ok, pub.out);
    if (!pub.ok) throw new Error("發布失敗");
    result.ok = true; result.published = true;
  } catch (e) {
    result.ok = false; result.error = e.message;
  } finally {
    if (result.build && (result.steps.length || result.error)) {
      writeJson(path.join(P.reports, "auto.json"), result);
      const n = result.newContent;
      const line = `- ${stamp()} 遊戲 ${result.build}：${result.ok ? (result.published ? "已自動相容並發布" : "相容驗證通過，未發布" + (result.note ? "（" + result.note + "）" : "")) : "失敗：" + result.error}${n ? `；新內容 ${n.pending} 條、新增未翻譯 ${n.untranslated} 項` : ""}`;
      fs.appendFileSync(LOG, (fs.existsSync(LOG) ? "" : "# 自動更新紀錄\n\n") + line + "\n");
      console.log(line);
      notify(result.ok ? "D2 工具包：已相容新版" : "D2 工具包：自動更新失敗", line.slice(2, 200));
    }
    fs.rmSync(LOCK, { force: true });
    process.exitCode = result.ok === false ? 1 : 0;
  }
}
main();
