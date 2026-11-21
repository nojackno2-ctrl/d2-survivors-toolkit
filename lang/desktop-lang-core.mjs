// 桌面版中文化核心模組：只替換 app.asar 內 ko-*.js 的「值」為繁體中文，不改任何函式。
// 提供 apply / restore / status 純函式，供 CLI（lang/tools/desktop-lang.mjs）與桌面端（editor/）呼叫。
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import vm from "node:vm";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const LANG_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)));
const require = createRequire(import.meta.url);
// @electron/asar：優先用呼叫端（editor 封裝後在 app.asar 內）以 useAsar() 提供；否則開發模式從 editor/node_modules 載入
let asarModule = null;
export function useAsar(mod) { asarModule = mod; }
const asar = new Proxy({}, { get(_, name) { asarModule ??= (() => { try { return require("@electron/asar"); } catch { return createRequire(path.join(LANG_DIR, "..", "editor", "package.json"))("@electron/asar"); } })(); return asarModule[name]; } });

export const DEFAULT_GAME_DIR = "C:\\Program Files\\D2 Survivors";
export const DEFAULT_D2R_DIR = "C:\\Program Files (x86)\\Diablo II Resurrected";

export function sha256File(filePath) {
  const hash = crypto.createHash("sha256");
  hash.update(fs.readFileSync(filePath));
  return hash.digest("hex");
}

export function resolvePaths(gameDir = DEFAULT_GAME_DIR) {
  const target = path.join(gameDir, "resources", "app.asar");
  return {
    gameDir,
    target,
    backup: `${target}.d2lang-orig`,
    meta: `${target}.d2lang.json`,
  };
}

function readMeta(metaPath) {
  if (!fs.existsSync(metaPath)) return null;
  try {
    return JSON.parse(fs.readFileSync(metaPath, "utf8"));
  } catch {
    return null;
  }
}

function writeMeta(metaPath, data) {
  fs.writeFileSync(metaPath, JSON.stringify(data, null, 2) + "\n", "utf8");
}

function removeBackups(backupPath, metaPath) {
  fs.rmSync(backupPath, { force: true });
  fs.rmSync(metaPath, { force: true });
}

// 以 fs 模擬瀏覽器的資料夾 handle，讓 d2rfont.js 在 Node 也能用
function dirHandle(dir) {
  return {
    async *entries() {
      for (const d of fs.readdirSync(dir, { withFileTypes: true })) {
        const p = path.join(dir, d.name);
        yield [
          d.name,
          d.isDirectory()
            ? { kind: "directory", ...dirHandle(p) }
            : { kind: "file", ...(await dirHandle(dir).getFileHandle(d.name)) },
        ];
      }
    },
    async getDirectoryHandle(name) {
      const p = path.join(dir, name);
      if (!fs.statSync(p).isDirectory()) throw new Error(p);
      return dirHandle(p);
    },
    async getFileHandle(name) {
      const p = path.join(dir, name);
      return {
        async getFile() {
          const fd = fs.openSync(p, "r");
          const size = fs.fstatSync(fd).size;
          return {
            size,
            async arrayBuffer() {
              const b = fs.readFileSync(p);
              return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength);
            },
            slice(start = 0, end = size) {
              return {
                async arrayBuffer() {
                  const n = Math.max(0, end - start);
                  const b = Buffer.alloc(n);
                  fs.readSync(fd, b, 0, n, start);
                  return b.buffer.slice(b.byteOffset, b.byteOffset + n);
                },
              };
            },
          };
        },
      };
    },
  };
}

function parseKoModule(src) {
  const namedExport = src.match(/export\s*\{\s*([\w$]+)\s+as\s+default\s*\}\s*;?\s*$/);
  if (namedExport) {
    const varName = namedExport[1];
    const obj = vm.runInNewContext(`${src.slice(0, namedExport.index)};${varName};`);
    return {
      obj,
      serialize(nextObj) {
        return `var ${varName}=${JSON.stringify(nextObj)};export{${varName} as default};`;
      },
    };
  }
  const defaultExport = src.match(/^\s*export\s+default\s+/);
  if (defaultExport) {
    const expr = src.slice(defaultExport[0].length).replace(/;\s*$/, "");
    const obj = vm.runInNewContext(`(${expr})`);
    return {
      obj,
      serialize(nextObj) {
        return `export default ${JSON.stringify(nextObj)};`;
      },
    };
  }
  throw new Error("無法識別 ko-*.js 的模組匯出格式");
}

// 官方 saveTransfer-*.js 內「是否為外文字元」的判斷函式（原本只認韓文），中文會因此被畫成「?」。
// 以函式本體結構定位（函式名與變數名可能隨版本改變），修補＝在條件末尾追加 CJK 範圍。
const FOREIGN_CHECK_RE =
  /function ([\w$]+)\(([\w$]+)\)\{let ([\w$]+)=\2\.charCodeAt\(0\);return \3>=44032&&\3<=55203\|\|\3>=12592&&\3<=12687\|\|\3>=4352&&\3<=4607\}/g;
const CJK_RANGES = [
  [12288, 12351],
  [19968, 40959],
  [65280, 65519],
];

export function patchForeignCharCheck(assetsDir) {
  const files = fs.readdirSync(assetsDir).filter((f) => /^saveTransfer-[\w-]+\.js$/.test(f));
  if (!files.length) throw new Error("asar 內找不到 saveTransfer-*.js，無法修補外文判斷函式");
  const hits = [];
  for (const f of files) {
    const src = fs.readFileSync(path.join(assetsDir, f), "utf8");
    for (const m of src.matchAll(FOREIGN_CHECK_RE)) hits.push({ file: f, src, m });
  }
  if (hits.length !== 1) {
    throw new Error(
      `外文判斷函式特徵比對應剛好 1 處，實際 ${hits.length} 處（${files.join(", ")}）；官方可能已更新，未套用任何修補`
    );
  }
  const { file, src, m } = hits[0];
  const t = m[3];
  const extra = CJK_RANGES.map(([a, b]) => `||${t}>=${a}&&${t}<=${b}`).join("");
  const patchedFn = m[0].slice(0, -1) + extra + "}";
  const next = src.slice(0, m.index) + patchedFn + src.slice(m.index + m[0].length);
  fs.writeFileSync(path.join(assetsDir, file), next, "utf8");
  return { file, fnName: m[1], ranges: CJK_RANGES };
}

export function status({ gameDir = DEFAULT_GAME_DIR } = {}) {
  const paths = resolvePaths(gameDir);
  if (!fs.existsSync(paths.target)) {
    return { status: "missing", label: "找不到遊戲檔案", target: paths.target };
  }
  const currentHash = sha256File(paths.target);
  const meta = readMeta(paths.meta);
  if (!meta) {
    return { status: "original", label: "原版", currentHash, target: paths.target };
  }
  if (currentHash === meta.patchedHash) {
    return {
      status: "patched",
      label: "中文版",
      currentHash,
      origHash: meta.origHash,
      patchedHash: meta.patchedHash,
      d2sLangBefore: meta.d2sLangBefore ?? null,
      target: paths.target,
    };
  }
  if (currentHash === meta.origHash) {
    return {
      status: "original",
      label: "原版",
      currentHash,
      origHash: meta.origHash,
      target: paths.target,
    };
  }
  return {
    status: "updated",
    label: "遊戲已更新",
    currentHash,
    origHash: meta.origHash,
    patchedHash: meta.patchedHash,
    d2sLangBefore: meta.d2sLangBefore ?? null,
    target: paths.target,
  };
}

export async function apply({
  gameDir = DEFAULT_GAME_DIR,
  d2rDir = DEFAULT_D2R_DIR,
  out,
  dictPath = path.join(LANG_DIR, "zh-TW.json"),
  d2sLangBefore,
} = {}) {
  const paths = resolvePaths(gameDir);
  if (!fs.existsSync(paths.target)) {
    throw new Error(`找不到 app.asar：${paths.target}`);
  }
  const outPath = out || paths.target;
  const isInPlace = path.resolve(outPath) === path.resolve(paths.target);

  const currentHash = sha256File(paths.target);
  const prevMeta = readMeta(paths.meta);
  const alreadyPatched = Boolean(prevMeta && currentHash === prevMeta.patchedHash);

  let sourceAsar = paths.target;
  let origHash = currentHash;
  let recordedLangBefore = d2sLangBefore ?? null;

  if (alreadyPatched) {
    if (!fs.existsSync(paths.backup)) {
      throw new Error("目前已是中文版，但找不到原版備份 app.asar.d2lang-orig");
    }
    sourceAsar = paths.backup;
    origHash = prevMeta.origHash ?? sha256File(paths.backup);
    if (d2sLangBefore === undefined) {
      recordedLangBefore = prevMeta.d2sLangBefore ?? null;
    }
  }
  // 備份延後到「ko 包替換與修補全部成功」後才建立，失敗時不改動 asar 也不留備份

  const dict = JSON.parse(fs.readFileSync(dictPath, "utf8"));
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "d2lang-asar-"));
  try {
    asar.extractAll(sourceAsar, tmp);
    const assetsDir = path.join(tmp, "desktop", "dist", "web", "assets");
    if (!fs.existsSync(assetsDir)) {
      throw new Error(`asar 內找不到資料夾：${assetsDir}`);
    }
    const koFile = fs.readdirSync(assetsDir).find((f) => /^ko-[\w-]+\.js$/.test(f));
    if (!koFile) {
      throw new Error("asar 內找不到 ko-*.js 語言包");
    }

    const koPath = path.join(assetsDir, koFile);
    const { obj: koObj, serialize } = parseKoModule(fs.readFileSync(koPath, "utf8"));
    let replacedCount = 0;
    const totalCount = Object.keys(koObj).length;
    const nextObj = {};
    for (const [k, v] of Object.entries(koObj)) {
      if (Object.prototype.hasOwnProperty.call(dict, k) && dict[k]) {
        nextObj[k] = dict[k];
        replacedCount++;
      } else {
        nextObj[k] = v;
      }
    }
    // 追加 ko 包沒有、但字典有的鍵（遊戲翻譯器以 exact 查表）
    let addedCount = 0;
    for (const [k, v] of Object.entries(dict)) {
      if (!Object.prototype.hasOwnProperty.call(koObj, k) && typeof v === "string" && v) {
        nextObj[k] = v;
        addedCount++;
      }
    }
    fs.writeFileSync(koPath, serialize(nextObj), "utf8");

    // 外文判斷函式修補：不改變其他程式碼；找不到或多處則整個 apply 失敗（尚未動到 asar）
    const cjkPatch = patchForeignCharCheck(assetsDir);

    let font = false;
    let fontWarning = null;
    if (d2rDir && fs.existsSync(d2rDir)) {
      try {
        const { extractD2rFont } = await import(new URL("./d2rfont.js", import.meta.url));
        await extractD2rFont(dirHandle(d2rDir));
        font = true;
      } catch (e) {
        fontWarning = e.message;
      }
    } else {
      fontWarning = "未找到 D2R 安裝目錄，略過字型讀取";
    }

    const packed = path.join(tmp, "..", `${path.basename(tmp)}.asar`);
    try {
      await asar.createPackage(tmp, packed);
      if (isInPlace && !alreadyPatched) {
        // 以「目前的 asar」為新原版建立備份（覆蓋舊備份，避免遊戲更新後留著舊版）
        fs.copyFileSync(paths.target, paths.backup);
      }
      fs.copyFileSync(packed, outPath);
    } finally {
      fs.rmSync(packed, { force: true });
    }

    const patchedHash = sha256File(outPath);
    if (isInPlace) {
      writeMeta(paths.meta, {
        origHash,
        patchedHash,
        d2sLangBefore: recordedLangBefore,
        koFile,
        replacedCount,
        totalCount,
        addedCount,
        cjkPatch,
        appliedAt: new Date().toISOString(),
      });
    }

    return {
      ok: true,
      status: "patched",
      target: outPath,
      koFile,
      origHash,
      patchedHash,
      replacedCount,
      totalCount,
      addedCount,
      cjkPatch,
      font,
      fontWarning,
      d2sLangAction: { set: "ko" },
    };
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}

export function restore({ gameDir = DEFAULT_GAME_DIR } = {}) {
  const paths = resolvePaths(gameDir);
  if (!fs.existsSync(paths.target)) {
    throw new Error(`找不到 app.asar：${paths.target}`);
  }
  const meta = readMeta(paths.meta);
  if (!meta || !fs.existsSync(paths.backup)) {
    return {
      ok: false,
      restored: false,
      reason: "no-backup",
      message: "找不到中文化備份或記錄檔",
    };
  }

  const d2sLangAction =
    meta.d2sLangBefore != null ? { set: meta.d2sLangBefore } : { delete: true };

  const currentHash = sha256File(paths.target);
  if (currentHash !== meta.patchedHash) {
    // 防降版：官方已更新覆蓋，不放回舊備份，只丟棄備份記錄
    removeBackups(paths.backup, paths.meta);
    return {
      ok: true,
      restored: false,
      status: "updated",
      reason: "game-updated",
      currentHash,
      expectedPatchedHash: meta.patchedHash,
      d2sLangAction,
    };
  }

  fs.copyFileSync(paths.backup, paths.target);
  const restoredHash = sha256File(paths.target);
  if (meta.origHash && restoredHash !== meta.origHash) {
    throw new Error(`還原後雜湊驗證失敗：預期 ${meta.origHash}，實際 ${restoredHash}`);
  }
  removeBackups(paths.backup, paths.meta);

  return {
    ok: true,
    restored: true,
    status: "original",
    origHash: restoredHash,
    d2sLangAction,
  };
}
