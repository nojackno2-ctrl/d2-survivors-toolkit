// 從本機安裝的《暗黑破壞神 II：獄火重生》讀出官方字串表（只讀 CASC，不修改任何檔案）。
// 用法：node lang/tools/d2r-strings.mjs [D2R 安裝資料夾] [輸出資料夾]
// 輸出：<輸出資料夾>/strings/*.json（官方原檔）、excel/*.txt、d2r-zhTW.json（[{ id, key, en, zh, file }]）
// 預設輸出到 backups/d2r-strings（Git 忽略，不把官方資料放進倉庫）。
import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = process.argv[2] || "C:\\Program Files (x86)\\Diablo II Resurrected";
const outDir = process.argv[3] || path.join(here, "..", "..", "backups", "d2r-strings");
const hex = (b) => Buffer.from(b).toString("hex");

const rows = fs.readFileSync(path.join(root, ".build.info"), "utf8").trim().split(/\r?\n/).map((x) => x.split("|"));
const headers = rows.shift().map((x) => x.split("!")[0].trim());
const row = rows.find((x) => x[headers.indexOf("Active")] === "1");
const buildKey = row?.[headers.indexOf("Build Key")];
if (!/^[a-f\d]{32}$/i.test(buildKey || "")) throw Error("找不到啟用中的 D2R 版本");
const version = row[headers.indexOf("Version")];
const config = fs.readFileSync(path.join(root, "Data", "config", buildKey.slice(0, 2), buildKey.slice(2, 4), buildKey), "utf8");
const getConfig = (name) => new RegExp(`^${name}\\s*=\\s*(.+)$`, "m").exec(config)?.[1].trim();
const rootKey = getConfig("root"), encodingKey = getConfig("encoding")?.split(/\s+/)[1];
if (!rootKey || !encodingKey) throw Error("D2R 設定缺少索引");

const dataDir = path.join(root, "Data", "data");
const index = new Map();
// 同一個分桶有多個版本的 .idx：檔名排序後，新版覆蓋舊版
for (const name of fs.readdirSync(dataDir).filter((n) => n.endsWith(".idx")).sort()) {
  const b = fs.readFileSync(path.join(dataDir, name)), end = 40 + b.readUInt32LE(32);
  for (let i = 40; i + 18 <= end && i + 18 <= b.length; i += 18) {
    let n = 0n; for (let j = 9; j < 14; j++) n = (n << 8n) | BigInt(b[i + j]);
    index.set(hex(b.subarray(i, i + 9)), [Number(n >> 30n), Number(n & 0x3fffffffn), b.readUInt32LE(i + 14)]);
  }
}
const decodeChunk = (b) => {
  if (b[0] === 78) return b.subarray(1);
  if (b[0] !== 90) throw Error("不支援的 BLTE 壓縮格式");
  return zlib.inflateSync(b.subarray(1));
};
const fds = new Map();
function read(key) {
  const loc = index.get(key.slice(0, 18));
  if (!loc) throw Error("找不到 CASC 資料 " + key);
  const file = path.join(dataDir, "data." + String(loc[0]).padStart(3, "0"));
  if (!fds.has(file)) fds.set(file, fs.openSync(file, "r"));
  const b = Buffer.alloc(loc[2] - 30);
  fs.readSync(fds.get(file), b, 0, b.length, loc[1] + 30);
  if (b.toString("latin1", 0, 4) !== "BLTE") throw Error("無效的 BLTE 資料");
  const header = b.readUInt32BE(4);
  if (!header) return decodeChunk(b.subarray(8));
  const count = b.readUIntBE(9, 3), chunks = [];
  let pos = header;
  for (let i = 0; i < count; i++) { const size = b.readUInt32BE(12 + i * 24); chunks.push(decodeChunk(b.subarray(pos, pos + size))); pos += size; }
  return Buffer.concat(chunks);
}

const enc = read(encodingKey), pages = enc.readUInt32BE(9), spec = enc.readUInt32BE(18);
const mapping = new Map();
let pos = 22 + spec + pages * 32;
for (let p = 0; p < pages; p++) {
  const end = pos + 4096;
  while (pos < end && enc[pos]) { const count = enc[pos]; mapping.set(hex(enc.subarray(pos + 6, pos + 22)), hex(enc.subarray(pos + 22, pos + 38))); pos += 22 + count * 16; }
  pos = end;
}
const rootEncoding = mapping.get(rootKey);
if (!rootEncoding) throw Error("找不到 CASC 根目錄");
const manifest = read(rootEncoding).toString("utf8").split(/\r?\n/).map((x) => x.split("|"));

const wanted = [[/^data:data\/local\/lng\/strings\/([\w-]+\.json)$/i, "strings"], [/^data:data\/global\/excel\/([\w-]+\.txt)$/i, "excel"]];
const all = [];
let files = 0;
for (const entry of manifest) {
  for (const [re, sub] of wanted) {
    const m = re.exec(entry[0] || "");
    if (!m) continue;
    const ekey = mapping.get(entry[1]);
    if (!ekey) continue;
    let data;
    try { data = read(ekey); } catch (e) { console.warn("略過 " + entry[0] + "：" + e.message); continue; }
    const name = m[1].toLowerCase();
    fs.mkdirSync(path.join(outDir, sub), { recursive: true });
    fs.writeFileSync(path.join(outDir, sub, name), data);
    files++;
    if (sub !== "strings") continue;
    let list;
    try { list = JSON.parse(data.toString("utf8").replace(/^\uFEFF/, "")); } catch { continue; }
    for (const r of list) if (r && typeof r.enUS === "string" && typeof r.zhTW === "string") all.push({ id: r.id, key: r.Key, en: r.enUS, zh: r.zhTW, file: name });
  }
}
for (const fd of fds.values()) fs.closeSync(fd);
fs.writeFileSync(path.join(outDir, "d2r-zhTW.json"), JSON.stringify({ version, strings: all }));
console.log(`D2R ${version}：${files} 個檔案、${all.length} 條字串 → ${outDir}`);
