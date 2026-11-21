const fs = require("fs");
const path = require("path");
const { pathToFileURL } = require("url");

function getElectronApp() {
  try {
    const electron = require("electron");
    return electron && electron.app ? electron.app : null;
  } catch {
    return null;
  }
}

/**
 * 解析工具包資源根目錄：
 * - 開發模式：editor/ 的上一層目錄（倉庫根目錄）
 * - 封裝模式（electron-builder extraResources）：process.resourcesPath
 */
function resolveRoot(opts = {}) {
  const isPackaged = opts.isPackaged !== undefined
    ? Boolean(opts.isPackaged)
    : Boolean(getElectronApp()?.isPackaged);
  if (isPackaged) {
    return opts.resourcesPath ?? process.resourcesPath;
  }
  return opts.baseDir ?? path.join(__dirname, "..");
}

function resolveAsset(rel, opts = {}) {
  const cleanRel = String(rel || "").replace(/^[/\\]+/, "");
  return path.join(resolveRoot(opts), cleanRel);
}

function readAssetText(rel, opts = {}) {
  const filePath = resolveAsset(rel, opts);
  return fs.readFileSync(filePath, "utf8");
}

function pageUrl(target = "editor", opts = {}) {
  // 遊戲控制台頁面隨應用本體（editor/launcher.html），不在 resources 內
  if (target === "launcher") return pathToFileURL(path.join(__dirname, "launcher.html")).toString();
  const rel = target === "guard" || String(target).endsWith("guard.html")
    ? path.join("guard", "guard.html")
    : path.join("modifier", "editor.html");
  const fileUrl = pathToFileURL(resolveAsset(rel, opts));
  const mode = typeof opts === "string" ? opts : opts?.mode;
  if (mode === "hardcore" || mode === "softcore") {
    fileUrl.searchParams.set("mode", mode);
  }
  return fileUrl.toString();
}

module.exports = {
  resolveRoot,
  resolveAsset,
  readAssetText,
  pageUrl,
};
