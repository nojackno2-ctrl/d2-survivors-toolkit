// 中文化提權小型 CLI：由 launcher-api.js 以管理員權限（ELECTRON_RUN_AS_NODE=1）啟動。
// 邏輯全在 lang/desktop-lang-core.mjs（apply / restore / status，防降版也在那裡）；這裡只負責
// 解析參數、呼叫、把結果寫成 JSON 檔（因為提權行程的標準輸出拿不回來）。
// 用法：lang-cli.cjs --core <desktop-lang-core.mjs> --result <out.json> (--apply|--restore|--status) [--game <dir>] [--lang-before <val>]
const fs = require("fs");
const { pathToFileURL } = require("url");

const arg = (name) => {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : undefined;
};

(async () => {
  const resultFile = arg("--result");
  const write = (obj) => { if (resultFile) fs.writeFileSync(resultFile, JSON.stringify(obj)); };
  try {
    const corePath = arg("--core");
    if (!corePath || !resultFile) throw new Error("缺少 --core 或 --result 參數。");
    const core = await import(pathToFileURL(corePath).href);
    core.useAsar?.(require("@electron/asar")); // 封裝後 lang/ 在 resources 內找不到 node_modules，由這裡提供
    const gameDir = arg("--game") || core.DEFAULT_GAME_DIR;
    if (process.argv.includes("--apply")) {
      const res = await core.apply({ gameDir, d2sLangBefore: arg("--lang-before") });
      write({ ok: true, action: "apply", ...res });
    } else if (process.argv.includes("--restore")) {
      write({ action: "restore", ...core.restore({ gameDir }) });
    } else if (process.argv.includes("--status")) {
      write({ ok: true, action: "status", ...core.status({ gameDir }) });
    } else {
      throw new Error("需要 --apply、--restore 或 --status。");
    }
  } catch (e) {
    write({ ok: false, error: e && e.message ? e.message : String(e) });
    process.exitCode = 1;
  }
})();
