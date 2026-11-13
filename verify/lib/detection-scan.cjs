#!/usr/bin/env node
// 遊戲更新偵測與線上存檔掃描工具（純 Node.js、無第三方依賴）。
// 用途：每次遊戲更新時，自動比對「偵測機制」與「存檔方式」是否改變，特別是是否出現線上存檔跡象。
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");

const ROOT = path.resolve(__dirname, "..", "..");
const DEFAULT_BASELINE = path.join(ROOT, "verify", "detection-baseline.json");

const TEXT_EXT = /\.(?:js|html|json)$/i;

// 已知與原生檢查相關的 API 名稱（當 [native code] 附近無表驅動結構時的回退關鍵字清單）
const FALLBACK_NATIVE_KEYWORDS = [
  "WeakMap",
  "Storage",
  "drawImage",
  "putImageData",
  "addEventListener",
  "requestAnimationFrame",
  "devicePixelRatio",
];

// 已知受限網址參數種子（用來定位整個受限參數陣列）
const RESTRICTED_PARAM_SEEDS = new Set(["manathrottle", "mercpicks", "inifuss"]);

// 已知上傳紀錄與存檔標記旗標
const KNOWN_UPLOAD_FLAGS = [
  "imported",
  "edited",
  "debug",
  "patched",
  "unranked",
  "restored",
  "rechecked",
  "tainted",
  "offRecord",
];

// 排除線上存檔關鍵字雜訊的第三方／渲染／字典／純資料檔名模式
const NOISE_FILE_RE = /^(?:WebGLRenderer|WebGPURenderer|CanvasRenderer|CanvasPool|GraphicsContext|RenderTargetSystem|Filter|BitmapFont|GCManagedHash|defaultFilter|getTexelRangeRects|getTextureBatchBindGroup|browserAll|ko)-|^(?:changelog|index|itemstats[^/]*)\.json$/i;

function walkFiles(dir) {
  const results = [];
  if (!fs.existsSync(dir)) return results;
  function walk(current) {
    const entries = fs.readdirSync(current, { withFileTypes: true });
    for (const ent of entries) {
      const full = path.join(current, ent.name);
      if (ent.isDirectory()) {
        walk(full);
      } else if (ent.isFile() && TEXT_EXT.test(ent.name)) {
        const rel = path.relative(dir, full).replace(/\\/g, "/");
        results.push({ full, rel });
      }
    }
  }
  walk(dir);
  results.sort((a, b) => a.rel.localeCompare(b.rel));
  return results;
}

function normalizeApiPath(raw) {
  let s = raw.trim();
  // 若含完整網址（如 https://d2survivors.lol/api/report），只取 /api/... 部分
  const apiIdx = s.indexOf("/api/");
  if (apiIdx > 0) s = s.slice(apiIdx);
  else if (s.endsWith("/api")) {
    const idx = s.lastIndexOf("/api");
    if (idx > 0) s = s.slice(idx);
  }
  // 去掉樣板字串中條件式查詢參數片段（例如 ${t?`...`:``}）與 ? 後方的查詢字串
  s = s.replace(/\$\{[^}]*\?[^}]*$/g, "");
  const qIdx = s.indexOf("?");
  if (qIdx >= 0) s = s.slice(0, qIdx);
  // 去掉結尾因樣板字串巢狀反引號被截斷的不完整 ${...
  s = s.replace(/\$\{[^}]*$/, "");
  // 去掉尾端多餘斜線
  if (s.length > 1 && s.endsWith("/")) s = s.replace(/\/+$/, "");
  return s;
}

function extractApiPaths(text, hasLeaderboardBase) {
  const paths = new Set();
  // 1. 直接出現的 /api/... 字串（含雙引號、單引號、反引號樣板字串）
  const directRe = /["'`]((?:https?:\/\/[^"'`\s/]+)?\/api(?:\/[A-Za-z0-9_$\/{}.:-]*)?(?:\?[^"'`\r\n]*)?)["'`]/g;
  for (const m of text.matchAll(directRe)) {
    const norm = normalizeApiPath(m[1]);
    if (norm.startsWith("/api")) paths.add(norm);
  }

  // 2. 若專案含有 /api/leaderboard，擷取排行榜 API 輔助函式所使用的相對子端點
  if (hasLeaderboardBase) {
    const subRe = /["'`](\/(?:runs|checks|forge|deaths|tiers|stats|boards|players|hc\/[a-z]+)(?:\/(?:\$\{[^}`"']+\}|[A-Za-z0-9_.-]+))?(?:\?[^"'`\s]*)?)["'`]/g;
    for (const m of text.matchAll(subRe)) {
      const sub = normalizeApiPath(m[1]);
      if (sub && sub.startsWith("/")) {
        paths.add(`/api/leaderboard${sub}`);
      }
    }
  }
  return paths;
}

function extractStorageAndSealKeys(text) {
  const storageKeys = new Set();
  const sealKeys = new Set();

  // 擷取 d2-survivors/... 與 d2s[:/-]... 字串
  const re = /["'`]((?:d2-survivors\/|d2s[:/-])[^"'`\r\n]+)["'`]/g;
  for (const m of text.matchAll(re)) {
    let raw = m[1].trim();
    // 判斷是否為簽章／雜湊前綴（sealKeys）
    if (
      raw.startsWith("d2s/save-seal/") ||
      raw.startsWith("d2s/late-checks/") ||
      raw.startsWith("d2s-life/") ||
      raw.startsWith("d2s-climb/") ||
      raw.startsWith("d2s-leaderboard:") ||
      raw.startsWith("d2s-leaderboard-hero:") ||
      raw.startsWith("d2s/seal") ||
      raw.startsWith("d2s-seal")
    ) {
      // 若含樣板插值（如 d2s-life/1|${e}|...），取 ${ 之前的固定前綴，避免巢狀反引號截斷雜訊
      const interpIdx = raw.indexOf("${");
      if (interpIdx > 0) {
        raw = raw.slice(0, interpIdx);
      }
      sealKeys.add(raw);
    } else if (raw.startsWith("d2-survivors/") || raw.startsWith("d2s:")) {
      storageKeys.add(raw);
    }
  }
  return { storageKeys, sealKeys };
}

function extractNativeChecks(text) {
  const checks = new Set();
  // 尋找 [native code] 或正則 \[native code\] 的出現位置
  const nativeRe = /\\?\[\s*native\s+code\s*\\?\]/g;
  let foundNative = false;
  for (const m of text.matchAll(nativeRe)) {
    foundNative = true;
    const idx = m.index;
    const windowStart = Math.max(0, idx - 800);
    const windowEnd = Math.min(text.length, idx + 800);
    const snippet = text.slice(windowStart, windowEnd);

    // 優先擷取表驅動結構：[[`WeakMap.get`, e => ...], [`Storage.setItem`, ...]]
    const tupleRe = /\[\s*["'`]([A-Za-z0-9_.]+)["'`]\s*,\s*(?:[A-Za-z0-9_$]+|\([^)]*\))\s*=>/g;
    let matchedTuple = false;
    for (const tm of snippet.matchAll(tupleRe)) {
      checks.add(tm[1]);
      matchedTuple = true;
    }

    // 若非表驅動結構，則在附近視窗內檢查已知原生 API 關鍵字
    if (!matchedTuple) {
      for (const api of [
        "WeakMap.get",
        "Storage.setItem",
        ...FALLBACK_NATIVE_KEYWORDS,
      ]) {
        const escaped = api.replace(/\./g, "\\.");
        if (new RegExp(`\\b${escaped}\\b`).test(snippet)) {
          checks.add(api);
        }
      }
    }
  }
  return { foundNative, checks };
}

function extractRestrictedParams(text) {
  const params = new Set();

  // 形式 1：esbuild 壓縮之 "t.god.speed...".split(".") 形式
  const splitRe = /(["'`])([a-z0-9_-]+(?:\.[a-z0-9_-]+){3,})\1\.split\(\s*(["'`])\.\3\s*\)/g;
  for (const m of text.matchAll(splitRe)) {
    const items = m[2].split(".");
    if (items.some((x) => RESTRICTED_PARAM_SEEDS.has(x))) {
      for (const item of items) params.add(item);
    }
  }

  // 形式 2：標準陣列字面量 ["t", "god", "manathrottle", ...]
  const arrayRe = /\[((?:\s*["'`][a-z0-9_-]+["'`]\s*,?){2,}\s*)\]/g;
  for (const m of text.matchAll(arrayRe)) {
    const body = m[1];
    const items = [];
    for (const sm of body.matchAll(/["'`]([a-z0-9_-]+)["'`]/g)) {
      items.push(sm[1]);
    }
    if (items.some((x) => RESTRICTED_PARAM_SEEDS.has(x))) {
      for (const item of items) params.add(item);
    }
  }

  return params;
}

function extractUploadFields(text, fileName) {
  const fields = new Set();
  if (NOISE_FILE_RE.test(path.basename(fileName))) return fields;

  // 1. 檢查已知上傳與存檔旗標是否以字串或物件屬性出現
  for (const flag of KNOWN_UPLOAD_FLAGS) {
    const re = new RegExp(`(?:["'\`.]${flag}\\b|\\b${flag}\\s*:)`);
    if (re.test(text)) {
      fields.add(flag);
    }
  }

  // 2. 動態擷取 notes:[["imported", ...], ["edited", ...], ...] 結構中的旗標名稱
  const notesRe = /notes\s*:\s*\[(\s*\[[^\]]+\](?:\s*,\s*\[[^\]]+\])*)\]/g;
  for (const m of text.matchAll(notesRe)) {
    for (const pair of m[1].matchAll(/\[\s*["'`]([A-Za-z0-9_-]+)["'`]/g)) {
      fields.add(pair[1]);
    }
  }

  return fields;
}

function extractOnlineSaveHints(text, relFile) {
  const hints = [];
  const baseName = path.basename(relFile);
  if (NOISE_FILE_RE.test(baseName)) return hints;

  const pattern =
    /(\/api\/(?:save|account|auth|sync|login|signin|cloud|user|profile)[A-Za-z0-9_$\/{}.:-]*|\b(?:cloudSave|saveSync|syncSave|cloud_save|save_sync|onlineSave|online_save|remoteSave|remote_save)\b|\b(?:login|signin|sign_in|cloud|sync|account|auth|oauth)\b)/gi;

  const seenInFile = new Set();
  for (const m of text.matchAll(pattern)) {
    const kw = m[0];
    const idx = m.index;
    const start = Math.max(0, idx - 80);
    const end = Math.min(text.length, idx + kw.length + 80);
    const rawContext = text.slice(start, end).replace(/\s+/g, " ").trim();

    // 取同一行內的前後 80 字元，用來檢查是否同時出現 save 相關字
    const lineStart = Math.max(start, text.lastIndexOf("\n", idx) + 1);
    const nextNl = text.indexOf("\n", idx + kw.length);
    const lineEnd = nextNl < 0 ? end : Math.min(end, nextNl);
    const sameLineWindow = text.slice(lineStart, lineEnd);

    const isHighConfidence =
      /^\/api\//i.test(kw) ||
      /^(?:cloudSave|saveSync|syncSave|cloud_save|save_sync|onlineSave|online_save|remoteSave|remote_save)$/i.test(kw);

    // 一般關鍵字（login/signin/cloud/sync/account/auth）必須在同一行上下文同時出現 save 相關字，並排除 "no account" 等否定敘述
    const hasSaveInLine =
      /\bsave(?:s|d|r|Mode|Data|State|Sync|Cloud|Transfer)?\b|d2-survivors\/save/i.test(sameLineWindow) &&
      !/\bno\s+account\b/i.test(sameLineWindow);

    if (isHighConfidence || hasSaveInLine) {
      const dedupKey = `${relFile}:${kw.toLowerCase()}:${rawContext}`;
      if (!seenInFile.has(dedupKey)) {
        seenInFile.add(dedupKey);
        hints.push({
          file: relFile,
          match: kw,
          context: rawContext,
        });
      }
    }
  }

  return hints;
}

/**
 * 掃描指定資料夾內所有 .js／.html／.json 文字檔（遞迴），回傳可排序、可 JSON 序列化的特徵集合。
 * @param {string} dir
 */
function scan(dir) {
  const resolvedDir = path.resolve(dir);
  if (!fs.existsSync(resolvedDir)) {
    throw new Error(`找不到掃描目錄：${dir}`);
  }

  const fileEntries = walkFiles(resolvedDir);
  const fileContents = [];
  const filesMeta = [];

  for (const { full, rel } of fileEntries) {
    const buf = fs.readFileSync(full);
    const hash12 = crypto.createHash("sha256").update(buf).digest("hex").slice(0, 12);
    filesMeta.push({
      file: rel,
      size: buf.length,
      sha256: hash12,
    });
    fileContents.push({ rel, text: buf.toString("utf8") });
  }

  // 先檢查整個 bundle 是否含有 /api/leaderboard 基底路徑
  const hasLeaderboardBase = fileContents.some(({ text }) => /["'`]\/api\/leaderboard["'`]/.test(text));

  const apiPaths = new Set();
  const storageKeys = new Set();
  const sealKeys = new Set();
  const nativeChecks = new Set();
  const restrictedParams = new Set();
  const uploadFields = new Set();
  const onlineSaveHints = [];

  for (const { rel, text } of fileContents) {
    for (const p of extractApiPaths(text, hasLeaderboardBase)) apiPaths.add(p);

    const { storageKeys: sk, sealKeys: slk } = extractStorageAndSealKeys(text);
    for (const k of sk) storageKeys.add(k);
    for (const k of slk) sealKeys.add(k);

    const { checks: nc } = extractNativeChecks(text);
    for (const c of nc) nativeChecks.add(c);

    for (const rp of extractRestrictedParams(text)) restrictedParams.add(rp);
    for (const uf of extractUploadFields(text, rel)) uploadFields.add(uf);
    for (const hint of extractOnlineSaveHints(text, rel)) onlineSaveHints.push(hint);
  }

  // 若整個 bundle 皆未抓到 [native code] 附近的 API，回退以關鍵字清單是否出現表示
  if (nativeChecks.size === 0) {
    for (const { rel, text } of fileContents) {
      if (NOISE_FILE_RE.test(path.basename(rel))) continue;
      for (const kw of FALLBACK_NATIVE_KEYWORDS) {
        if (new RegExp(`\\b${kw}\\b`).test(text)) {
          nativeChecks.add(kw);
        }
      }
    }
  }

  onlineSaveHints.sort(
    (a, b) =>
      a.file.localeCompare(b.file) ||
      a.match.localeCompare(b.match) ||
      a.context.localeCompare(b.context)
  );

  const sortedUploadFields = [...uploadFields].sort();

  return {
    apiPaths: [...apiPaths].sort(),
    storageKeys: [...storageKeys].sort(),
    sealKeys: [...sealKeys].sort(),
    nativeChecks: [...nativeChecks].sort(),
    restrictedParams: [...restrictedParams].sort(),
    uploadFields: sortedUploadFields,
    notes: sortedUploadFields,
    onlineSaveHints,
    files: filesMeta,
  };
}

function diffStringList(baseList = [], nextList = []) {
  const bSet = new Set(baseList);
  const nSet = new Set(nextList);
  const added = [...nSet].filter((x) => !bSet.has(x)).sort();
  const removed = [...bSet].filter((x) => !nSet.has(x)).sort();
  return { added, removed };
}

function diffObjectList(baseList = [], nextList = [], keyFn) {
  const bMap = new Map(baseList.map((item) => [keyFn(item), item]));
  const nMap = new Map(nextList.map((item) => [keyFn(item), item]));
  const added = [];
  const removed = [];
  for (const [k, item] of nMap) {
    if (!bMap.has(k)) added.push(item);
  }
  for (const [k, item] of bMap) {
    if (!nMap.has(k)) removed.push(item);
  }
  return { added, removed };
}

function isNonLeaderboardOrReportApi(apiPath) {
  if (apiPath === "/api/leaderboard" || apiPath.startsWith("/api/leaderboard/")) {
    // 即使掛在 /api/leaderboard 下，若子路徑出現 save/sync/account/auth/cloud 仍視為可疑
    return /\/(?:save|sync|account|auth|login|signin|cloud)\b/i.test(apiPath);
  }
  if (apiPath === "/api/report" || apiPath.startsWith("/api/report/")) {
    return false;
  }
  return apiPath.startsWith("/api");
}

/**
 * 比對基準與新版掃描結果。
 * @param {object} base
 * @param {object} next
 */
function diff(base, next) {
  const apiPaths = diffStringList(base.apiPaths, next.apiPaths);
  const storageKeys = diffStringList(base.storageKeys, next.storageKeys);
  const sealKeys = diffStringList(base.sealKeys, next.sealKeys);
  const nativeChecks = diffStringList(base.nativeChecks, next.nativeChecks);
  const restrictedParams = diffStringList(base.restrictedParams, next.restrictedParams);
  const uploadFields = diffStringList(
    base.uploadFields || base.notes || [],
    next.uploadFields || next.notes || []
  );
  const onlineSaveHints = diffObjectList(
    base.onlineSaveHints || [],
    next.onlineSaveHints || [],
    (h) => `${h.file}|${h.match}|${h.context}`
  );
  const files = diffObjectList(
    base.files || [],
    next.files || [],
    (f) => `${f.file}|${f.size}|${f.sha256}`
  );

  const featureCategories = [
    apiPaths,
    storageKeys,
    sealKeys,
    nativeChecks,
    restrictedParams,
    uploadFields,
    onlineSaveHints,
  ];

  const changed = featureCategories.some((c) => c.added.length > 0 || c.removed.length > 0);
  const filesChanged = files.added.length > 0 || files.removed.length > 0;

  const newSuspiciousApi = apiPaths.added.some(isNonLeaderboardOrReportApi);
  const newSuspiciousStorageKey = storageKeys.added.some((k) =>
    /(?:account|auth|token|sync|cloud|login|signin|online)/i.test(k)
  );
  const onlineSaveSuspected =
    onlineSaveHints.added.length > 0 || newSuspiciousApi || newSuspiciousStorageKey;

  return {
    apiPaths,
    storageKeys,
    sealKeys,
    nativeChecks,
    restrictedParams,
    uploadFields,
    notes: uploadFields,
    onlineSaveHints,
    files,
    summary: {
      changed,
      onlineSaveSuspected,
      filesChanged,
    },
  };
}

function resolveBuildDir(buildArg) {
  if (!buildArg) return null;
  const direct = path.resolve(buildArg);
  if (fs.existsSync(direct)) return direct;
  const inBundles = path.join(ROOT, "game-bundles", buildArg);
  if (fs.existsSync(inBundles)) return inBundles;
  return direct;
}

function formatDiffChinese(result, baseBuild, nextBuild) {
  const lines = [];
  const header = baseBuild || nextBuild ? `（基準：${baseBuild || "未知"} → 目標：${nextBuild || "未知"}）` : "";
  if (!result.summary.changed) {
    lines.push(`偵測特徵無變化${header}`);
    return lines.join("\n");
  }

  if (result.summary.onlineSaveSuspected) {
    lines.push(`⚠️【疑似線上存檔】偵測到線上存檔／帳號相關新特徵！${header}`);
  } else {
    lines.push(`偵測特徵有變化${header}：`);
  }

  const sections = [
    ["apiPaths", "API 端點 (apiPaths)"],
    ["storageKeys", "儲存鍵 (storageKeys)"],
    ["sealKeys", "封印與雜湊金鑰 (sealKeys)"],
    ["nativeChecks", "原生 API 檢查 (nativeChecks)"],
    ["restrictedParams", "受限網址參數 (restrictedParams)"],
    ["uploadFields", "上傳與狀態旗標 (uploadFields)"],
  ];

  for (const [key, label] of sections) {
    const { added, removed } = result[key];
    if (!added.length && !removed.length) continue;
    lines.push(`- ${label}：`);
    if (added.length) lines.push(`  + 新增 (${added.length})：${added.join(", ")}`);
    if (removed.length) lines.push(`  - 移除 (${removed.length})：${removed.join(", ")}`);
  }

  if (result.onlineSaveHints.added.length || result.onlineSaveHints.removed.length) {
    lines.push(`- 線上存檔線索 (onlineSaveHints)：`);
    for (const h of result.onlineSaveHints.added) {
      lines.push(`  + 新增 [${h.file}] 命中 "${h.match}"：${h.context}`);
    }
    for (const h of result.onlineSaveHints.removed) {
      lines.push(`  - 移除 [${h.file}] 命中 "${h.match}"：${h.context}`);
    }
  }

  return lines.join("\n");
}

function formatScanSummaryChinese(scanResult, buildName) {
  return [
    `偵測掃描摘要（版本：${buildName || "未知"}）：`,
    `- apiPaths：${scanResult.apiPaths.length} 項`,
    `- storageKeys：${scanResult.storageKeys.length} 項`,
    `- sealKeys：${scanResult.sealKeys.length} 項`,
    `- nativeChecks：${scanResult.nativeChecks.length} 項`,
    `- restrictedParams：${scanResult.restrictedParams.length} 項`,
    `- uploadFields：${scanResult.uploadFields.length} 項`,
    `- onlineSaveHints：${scanResult.onlineSaveHints.length} 項`,
    `- files：${scanResult.files.length} 個檔案`,
  ].join("\n");
}

function runCli(argv = process.argv.slice(2)) {
  const hasFlag = (name) => argv.includes(`--${name}`);
  const getOpt = (name, def = null) => {
    const idx = argv.indexOf(`--${name}`);
    return idx >= 0 && idx + 1 < argv.length ? argv[idx + 1] : def;
  };

  const buildArg = getOpt("build");
  const baselinePath = path.resolve(getOpt("baseline", DEFAULT_BASELINE));
  const isDiff = hasFlag("diff");
  const isUpdate = hasFlag("update");
  const isJson = hasFlag("json");

  if (!buildArg) {
    console.error("用法：node verify/lib/detection-scan.cjs --build <dir> [--baseline <file>] [--diff] [--update] [--json]");
    process.exit(1);
  }

  const buildDir = resolveBuildDir(buildArg);
  if (!fs.existsSync(buildDir)) {
    console.error(`錯誤：找不到指定的 --build 目錄：${buildArg}`);
    process.exit(1);
  }

  const buildName = path.basename(buildDir);
  const current = scan(buildDir);

  if (isUpdate) {
    const payload = {
      build: buildName,
      generatedAt: new Date().toISOString(),
      ...current,
    };
    fs.mkdirSync(path.dirname(baselinePath), { recursive: true });
    fs.writeFileSync(baselinePath, JSON.stringify(payload, null, 2) + "\n", "utf8");
    if (isJson) {
      console.log(JSON.stringify(payload, null, 2));
    } else {
      console.log(`已更新偵測基準檔：${baselinePath}（build: ${buildName}）`);
      console.log(formatScanSummaryChinese(current, buildName));
    }
    if (!isDiff) return;
  }

  if (isDiff) {
    if (!fs.existsSync(baselinePath)) {
      console.error(`錯誤：找不到基準檔 ${baselinePath}，請先以 --update 建立基準。`);
      process.exit(1);
    }
    const base = JSON.parse(fs.readFileSync(baselinePath, "utf8"));
    const result = diff(base, current);
    if (isJson) {
      console.log(JSON.stringify(result, null, 2));
    } else {
      console.log(formatDiffChinese(result, base.build, buildName));
    }
    if (result.summary.onlineSaveSuspected) {
      process.exit(3);
    }
    if (result.summary.changed) {
      process.exit(2);
    }
    process.exit(0);
  }

  if (!isUpdate) {
    if (isJson) {
      console.log(JSON.stringify({ build: buildName, ...current }, null, 2));
    } else {
      console.log(formatScanSummaryChinese(current, buildName));
    }
  }
}

if (require.main === module) {
  runCli();
}

module.exports = {
  scan,
  diff,
};
