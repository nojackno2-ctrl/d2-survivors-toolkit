// 遊戲更新後找出語言包缺漏：下載遊戲目前的韓文字典（= 遊戲全部可翻譯字串）與原生翻譯器，
// 用繁中共用 zh-TW.json 逐條翻一次，列出翻不到的英文。
// 用法：node lang/tools/lang-missing.mjs [語言代碼，預設 zh-TW] [輸出檔，預設印出]
// 缺漏補進 zh-TW.json（英文原文 → 譯文，數字位置寫 #，譯文以 {0} {1} 代回）。
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { pathToFileURL, fileURLToPath } from "node:url";

const SITE = "https://d2survivors.lol";
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const code = process.argv[2] || "zh-TW", out = process.argv[3];

const get = async (u) => { const r = await fetch(u); if (!r.ok) throw new Error(`${u} ${r.status}`); return r.text(); };
const html = await get(`${SITE}/play/`);
const entry = /\/assets\/game-[\w-]+\.js/.exec(html)?.[0];
if (!entry) throw new Error("找不到遊戲入口程式");
// 從入口往下找 lang-*.js，再由它找到 ko-*.js 與 translate-*.js
const find = async (src, re) => { const m = re.exec(src); if (!m) throw new Error(`找不到 ${re}`); return m[0]; };
const game = await get(SITE + entry);
const langName = await find(game, /lang-[\w-]+\.js/);
const lang = await get(`${SITE}/assets/${langName}`);
const koName = await find(lang, /ko-[\w-]+\.js/), trName = await find(lang, /translate-[\w-]+\.js/);

const dir = fs.mkdtempSync(path.join(os.tmpdir(), "d2lang-"));
fs.writeFileSync(path.join(dir, "tr.mjs"), await get(`${SITE}/assets/${trName}`));
fs.writeFileSync(path.join(dir, "ko.mjs"), await get(`${SITE}/assets/${koName}`));
const T = Object.values(await import(pathToFileURL(path.join(dir, "tr.mjs")))).find((v) => typeof v === "function" && v.prototype?.translate);
const ko = (await import(pathToFileURL(path.join(dir, "ko.mjs")))).default;
fs.rmSync(dir, { recursive: true, force: true });

const read = (f) => (fs.existsSync(f) ? JSON.parse(fs.readFileSync(f, "utf8")) : {});
const dict = read(path.join(root, "zh-TW.json"));
const tr = new T([dict]);
// 帶前綴（item:、title: 等）與樣板鍵由其他鍵組合使用，只檢查畫面上會直接出現的整句
const keys = Object.keys(ko).filter((k) => !/[#*]/.test(k) && !/^[a-z]+:/.test(k));
const miss = keys.filter((k) => tr.translate(k) === k);
console.error(`遊戲字串 ${keys.length} 條，${code} 翻不到 ${miss.length} 條（${koName}）`);
const text = JSON.stringify(Object.fromEntries(miss.map((k) => [k, ""])), null, 1);
if (out) fs.writeFileSync(out, text); else console.log(text);
