// 失敗自動修復：把故障單交給本地模型（Ollama，零雲端額度），套用它的修改後由腳本重驗。
// 保護：只准改工具包原始碼白名單；修改前備份；重驗沒讓失敗項目變好、或讓原本通過的項目退步就還原；最多 N 輪。
const fs = require("node:fs"), path = require("node:path"), { spawn } = require("node:child_process");
const { P } = require("./util.cjs");
const adapt = require("./adapt.cjs");

const MODEL = process.env.VERIFY_MODEL || "laguna-xs-2.1:latest";
const HOST = "http://127.0.0.1:11434";
// 絕不碰測試檔、遊戲快照、存檔、驗證腳本本身（避免「改測試讓它通過」）。
const EDITABLE = new Set(["autobot.js", "d2edit.js", "patch.js", "engine-page.js", "engine.js", "webapi.js", "core.js", "lang.js", "main.js", "signatures.json"]);
// 檔名 → 根目錄的唯一來源位置（editor/ 只剩啟動器檔案）。修補時一律改這裡的檔案。
const WHERE = { "autobot.js": ["helper", "autobot.js"], "d2edit.js": ["d2edit.js"], "patch.js": ["modifier", "patch.mjs"], "engine-page.js": ["modifier", "engine-page.js"], "engine.js": ["editor", "engine.js"], "webapi.js": ["modifier", "webapi.js"], "core.js": ["editor", "core.js"], "lang.js": ["lang", "lang.js"], "main.js": ["editor", "main.js"], "signatures.json": ["modifier", "signatures.json"] };
const where = (name) => path.join(P.root, ...WHERE[name]);

async function ensureServer() {
  const up = () => fetch(HOST + "/api/tags", { signal: AbortSignal.timeout(2000) }).then((r) => r.ok, () => false);
  if (await up()) return true;
  spawn("ollama", ["serve"], { detached: true, stdio: "ignore", windowsHide: true }).unref();
  for (let i = 0; i < 20; i++) { await new Promise((r) => setTimeout(r, 1000)); if (await up()) return true; }
  return false;
}

// 從失敗輸出抓 檔名:行號，附上那附近的程式碼，讓模型看到該看的地方（不給整份檔案）。
function context(failures) {
  const seen = new Set(), parts = [];
  for (const f of failures) for (const m of f.tail.matchAll(/([\w.-]+\.(?:js|cjs|mjs)):(\d+)/g)) {
    const key = m[1] + ":" + m[2]; if (seen.has(key) || !EDITABLE.has(m[1])) continue; seen.add(key);
    const lines = fs.readFileSync(where(m[1]), "utf8").split("\n"), at = Number(m[2]);
    parts.push(`### ${m[1]} 第 ${Math.max(1, at - 25)}–${at + 25} 行\n` + lines.slice(Math.max(0, at - 26), at + 25).join("\n"));
  }
  return [...parts.slice(0, 4), ...changedSinceGood()].join("\n\n");
}

// 與「上次全部通過」的版本比對：回歸類失敗最需要的線索就是「改了什麼」。小改動用頭尾夾擠找出差異區段。
const GOOD = path.join(P.root, "backups", "code", "lastgood");
function changedSinceGood() {
  const out = [];
  if (!fs.existsSync(GOOD)) return out;
  for (const name of EDITABLE) {
    const g = path.join(GOOD, name), c = where(name);
    if (!fs.existsSync(g) || !fs.existsSync(c)) continue;
    const a = fs.readFileSync(g, "utf8").split("\n"), b = fs.readFileSync(c, "utf8").split("\n");
    let s = 0; while (s < a.length && s < b.length && a[s] === b[s]) s++;
    if (s === a.length && s === b.length) continue;
    let ea = a.length, eb = b.length; while (ea > s && eb > s && a[ea - 1] === b[eb - 1]) { ea--; eb--; }
    out.push(`### ${name} 與上次通過版本的差異（約第 ${s + 1} 行）\n-- 上次通過：\n${a.slice(s, ea).slice(0, 30).join("\n")}\n-- 現在：\n${b.slice(s, eb).slice(0, 30).join("\n")}`);
  }
  return out;
}
function saveGood() {
  fs.mkdirSync(GOOD, { recursive: true });
  for (const name of EDITABLE) if (fs.existsSync(where(name))) fs.copyFileSync(where(name), path.join(GOOD, name));
}

async function ask(prompt) {
  const r = await fetch(HOST + "/api/chat", {
    method: "POST", headers: { "content-type": "application/json" }, signal: AbortSignal.timeout(300000),
    body: JSON.stringify({ model: MODEL, stream: false, format: "json", options: { temperature: 0.1 },
      messages: [{ role: "system", content: "你是嚴謹的 JavaScript 維護者。只輸出 JSON：{\"edits\":[{\"file\":\"檔名\",\"find\":\"原文（必須在檔案中唯一出現且逐字相同）\",\"replace\":\"新文字\"}],\"reason\":\"一句話\"}。不確定就回 {\"edits\":[]}。" }, { role: "user", content: prompt }] }),
  });
  const j = await r.json();
  return JSON.parse(j.message.content);
}

function applyEdits(edits, backupDir) {
  const done = [];
  for (const e of edits || []) {
    if (!EDITABLE.has(e.file)) throw new Error("不允許修改：" + e.file);
    const f = where(e.file), s = fs.readFileSync(f, "utf8");
    const n = s.split(e.find).length - 1;
    if (!e.find || n !== 1) throw new Error(`${e.file} 的 find 文字出現 ${n} 次（必須剛好 1 次）`);
    adapt.backup(f, backupDir);
    fs.writeFileSync(f, s.replace(e.find, () => e.replace));
    done.push({ file: e.file, find: e.find.slice(0, 200), replace: String(e.replace).slice(0, 200) });
  }
  return done;
}

// rerun(): 重跑全部測試並回傳 {results, failed}。回傳 {fixed, rounds:[{reason, edits, remainingFailed}]}。
async function repair({ failed, rerun, backupDir, maxRounds = 3, log = console.log }) {
  if (!(await ensureServer())) return { fixed: false, skipped: "本地 Ollama 無法啟動", rounds: [] };
  const rounds = [];
  let current = failed;
  for (let round = 1; round <= maxRounds && current.length; round++) {
    const prompt = `工具包自動測試失敗，請修正原始碼（不要改測試）。\n\n失敗項目與輸出：\n${current.map((f) => `- ${f.id}\n${f.tail}`).join("\n\n")}\n\n相關程式碼：\n${context(current) || "（無法從輸出判斷位置）"}\n${rounds.length ? "\n先前嘗試無效：" + JSON.stringify(rounds.map((r) => r.reason)) : ""}`;
    let edits = [], reason = "";
    try {
      const out = await ask(prompt); reason = out.reason || "";
      edits = applyEdits(out.edits, backupDir);
    } catch (e) { rounds.push({ round, error: String(e.message || e), edits: [] }); log(`  修復第 ${round} 輪失敗：${e.message || e}`); continue; }
    if (!edits.length) { rounds.push({ round, reason: "模型沒有提出修改", edits: [] }); break; }
    const r = await rerun();
    const before = new Set(current.map((f) => f.id)), after = r.failed.map((f) => f.id);
    const regress = after.filter((id) => !before.has(id));
    rounds.push({ round, reason, edits, remainingFailed: after });
    log(`  修復第 ${round} 輪：改 ${edits.length} 處，剩餘失敗 ${after.length}${regress.length ? "，退步：" + regress.join("、") : ""}`);
    if (regress.length) { adapt.restore(backupDir); return { fixed: false, rounds, reverted: "修復造成其他項目退步，已全部還原" }; }
    current = r.failed;
    if (!current.length) return { fixed: true, rounds };
  }
  return { fixed: current.length === 0, rounds };
}
module.exports = { repair, saveGood, EDITABLE };
