// 桌面版中文化 CLI（薄封裝）：呼叫 lang/desktop-lang-core.mjs
// 用法（操作 Program Files 時需系統管理員權限）：
//   node lang/tools/desktop-lang.mjs --apply [--game <dir>] [--d2r <dir>] [--out <path>] [--lang-before <val>]
//   node lang/tools/desktop-lang.mjs --restore [--game <dir>]
//   node lang/tools/desktop-lang.mjs --status [--game <dir>]
import {
  DEFAULT_D2R_DIR,
  DEFAULT_GAME_DIR,
  apply,
  restore,
  status,
} from "../desktop-lang-core.mjs";

const arg = (name, def) => {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : def;
};

const gameDir = arg("--game", DEFAULT_GAME_DIR);
const d2rDir = arg("--d2r", DEFAULT_D2R_DIR);
const out = arg("--out", undefined);
const langBefore = arg("--lang-before", undefined);

function formatLangAction(action) {
  if (!action) return "";
  if ("set" in action) return `需要把 d2s:lang 還原成 ${action.set}`;
  if (action.delete) return "需要刪除 d2s:lang（還原為套用前未設定狀態）";
  return "";
}

if (process.argv.includes("--status")) {
  const res = status({ gameDir });
  console.log(`狀態：${res.label} (${res.status})`);
  if (res.currentHash) console.log(`目前 SHA-256：${res.currentHash}`);
  if (res.origHash) console.log(`原版 SHA-256：${res.origHash}`);
  if (res.patchedHash) console.log(`套用後 SHA-256：${res.patchedHash}`);
  process.exit(0);
}

if (process.argv.includes("--restore")) {
  const res = restore({ gameDir });
  if (!res.ok) {
    console.error(`還原失敗：${res.message}`);
    process.exit(1);
  }
  if (res.restored) {
    console.log(`已還原原版 app.asar（SHA-256 驗證通過：${res.origHash}）`);
  } else {
    console.log("偵測到官方已更新覆蓋 app.asar，已略過還原舊備份並清除備份記錄（防降版）。");
  }
  const msg = formatLangAction(res.d2sLangAction);
  if (msg) console.log(msg);
  process.exit(0);
}

// 預設或 --apply
const res = await apply({
  gameDir,
  d2rDir,
  out,
  d2sLangBefore: langBefore,
});
console.log(
  `已套用繁體中文化到 ${res.target}（替換 ${res.replacedCount}/${res.totalCount} 筆，追加 ${res.addedCount} 筆，檔案 ${res.koFile}）`
);
console.log(`外文判斷函式修補：${res.cjkPatch.file} 內 ${res.cjkPatch.fnName}()（追加 CJK 範圍，可由備份還原）`);
console.log(`原版 SHA-256：${res.origHash}`);
console.log(`套用後 SHA-256：${res.patchedHash}`);
console.log("需要把 d2s:lang 設為 ko");
if (res.fontWarning) {
  console.warn(`字型提示：${res.fontWarning}`);
}
