// 以《暗黑破壞神 II：獄火重生》官方繁中為準，核對並更新 lang/zh-TW.json 的名稱類詞條。
// 先執行 node lang/tools/d2r-strings.mjs 取得官方字串（backups/d2r-strings，Git 忽略）。
// 用法：node lang/tools/d2r-align.mjs          只列出與官方不同的詞條
//       node lang/tools/d2r-align.mjs --write  寫回 zh-TW.json
// 規則：
//   1. 有種類前綴的鍵（item:／affix:／monster:／unique:）直接對官方同類字串。
//   2. 兩個字的稀有名稱（稀有字首＋稀有字尾）＝官方字首譯名＋字尾譯名（官方 RareFormat「%0%1」）。
//   3. 一般鍵：技能、暗金、套裝、底材、地名、頭目等名稱對官方；同一英文在官方有多種譯名而現值是其中之一時不動。
//   4. 一般鍵另有他用（遊戲自己的介面用語）時不動，改補 item:／monster: 鍵讓物品與怪物名仍顯示官方譯名。
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const src = path.join(here, "..", "..", "backups", "d2r-strings");
const dictFile = path.join(here, "..", "zh-TW.json");
const write = process.argv.includes("--write");
if (!fs.existsSync(path.join(src, "d2r-zhTW.json"))) { console.error("找不到官方字串，請先執行 node lang/tools/d2r-strings.mjs"); process.exit(1); }

// 中國版和諧用語覆蓋檔、語音字幕、戰網與手把介面不屬於遊戲內名稱
const SKIP_FILES = new Set(["chinese-overlay.json", "vo.json", "bnet.json", "commands.json", "keybinds.json", "ui-controller.json", "presence-states.json"]);
const strings = JSON.parse(fs.readFileSync(path.join(src, "d2r-zhTW.json"), "utf8")).strings.filter((r) => !SKIP_FILES.has(r.file));
const strip = (s) => s.replace(/ÿc./g, "").trim();
const byKey = new Map(), byKeyLower = new Map();
for (const r of strings) { if (!byKey.has(r.key)) byKey.set(r.key, r); const l = r.key.toLowerCase(); if (!byKeyLower.has(l)) byKeyLower.set(l, r); }
const lookup = (k) => byKey.get(k) || byKeyLower.get(String(k).toLowerCase());
function table(name) {
  const lines = fs.readFileSync(path.join(src, "excel", name + ".txt"), "utf8").split(/\r?\n/).filter(Boolean);
  const head = lines.shift().split("\t");
  return lines.map((l) => { const c = l.split("\t"), o = {}; head.forEach((h, i) => (o[h] = c[i] ?? "")); return o; });
}
const cats = {};
function col(cat, tbl, column) {
  const map = (cats[cat] ??= new Map());
  for (const row of table(tbl)) {
    const r = row[column] && lookup(row[column]);
    if (!r) continue;
    const en = strip(r.en).replace(/\s+/g, " "), zh = strip(r.zh);
    if (!en || !zh || !/[A-Za-z]/.test(en)) continue;
    const l = en.toLowerCase();
    if (!map.has(l)) map.set(l, new Set());
    map.get(l).add(zh);
  }
}
col("base", "weapons", "namestr"); col("base", "armor", "namestr"); col("base", "misc", "namestr");
col("unique", "uniqueitems", "index"); col("set", "setitems", "index"); col("set", "sets", "name");
col("runeword", "runes", "Name");
// 只取這款遊戲實際有的符文之語（最新遊戲包的 itemstats），其餘單字（Night、Dread…）在遊戲裡是別的意思
const bundles = path.join(here, "..", "..", "game-bundles");
const latest = fs.existsSync(bundles) ? fs.readdirSync(bundles).sort().at(-1) : null;
const statsFile = latest && fs.readdirSync(path.join(bundles, latest)).find((f) => /^itemstats-.*\.json$/.test(f));
if (statsFile) {
  const have = new Set(Object.keys(JSON.parse(fs.readFileSync(path.join(bundles, latest, statsFile), "utf8")).runewords ?? {}).map((n) => n.toLowerCase()));
  for (const k of [...cats.runeword.keys()]) if (!have.has(k)) cats.runeword.delete(k);
}
col("mprefix", "magicprefix", "Name"); col("msuffix", "magicsuffix", "Name");
col("rprefix", "rareprefix", "name"); col("rsuffix", "raresuffix", "name");
col("monster", "monstats", "NameStr"); col("super", "superuniques", "Name");
col("uprefix", "uniqueprefix", "Name"); col("usuffix", "uniquesuffix", "Name"); col("uappel", "uniqueappellation", "Name");
col("skill", "skilldesc", "str name"); col("level", "levels", "LevelName"); col("npc", "npc", "npc");
const general = new Map();
for (const r of strings) {
  const l = strip(r.en).replace(/\s+/g, " ").toLowerCase();
  if (!l) continue;
  if (!general.has(l)) general.set(l, new Set());
  general.get(l).add(strip(r.zh));
}

const KIND = { item: ["unique", "set", "runeword", "base"], affix: ["mprefix", "msuffix", "rprefix", "rsuffix"], monster: ["monster", "super"], unique: ["uprefix", "usuffix", "uappel"] };
const NAMED = ["skill", "unique", "set", "runeword", "base", "super", "monster", "level", "npc", "mprefix", "msuffix"];
const ITEMISH = ["unique", "set", "runeword", "base"], MONSTERISH = ["super", "monster"];
// 一般鍵在這款遊戲另有用途（介面用語、遊戲自創內容），不套用官方同名字串
const KEEP = new Set(["Temper", "Rings", "RINGS", "Share", "New skill", "Stat Points", "Report", "Bug", "Spikes", "Bar", "Circle", "BATTERY SAVER", "Block", "Horror", "Undead", "Expansion", "Hide", "Bone Lance", "Orb",
  // 技能變體名稱（Night、Ward、Slayer）、怪物詞綴（Fanatic）、稀有名稱用字（Skull、Crusher）
  "Rune Slayer", "Shadow Touch", "Night", "Ward", "Slayer", "Fanatic", "Skull", "Crusher",
  // 遊戲把 Lightning 同時當元素名稱（火焰／冰寒／閃電／毒素）與技能名稱；官方技能名是「閃電箭」，元素標籤不能跟著變
  "Lightning"]);
const PARTS = ["rprefix", "rsuffix", "uprefix", "usuffix", "uappel"];
const cand = (list, en) => { const out = new Set(); for (const c of list) for (const z of cats[c].get(en.toLowerCase()) ?? []) out.add(z); return [...out]; };
const first = (list, en) => { for (const c of list) { const s = cats[c].get(en.toLowerCase()); if (s) return [...s][0]; } return null; };

const dict = JSON.parse(fs.readFileSync(dictFile, "utf8"));
const changes = [], added = [], unsure = [];
const set = (key, want, why) => { if (dict[key] === want) return; (key in dict ? changes : added).push({ key, from: dict[key], to: want, why }); dict[key] = want; };
const hasKind = (en) => Object.keys(KIND).some((k) => `${k}:${en}` in dict);

for (const [key, val] of Object.entries({ ...dict })) {
  if (/[#*]/.test(key)) continue;
  const m = /^([a-z]+):(.*)$/.exec(key);
  if (m && KIND[m[1]]) {
    const zs = cand(KIND[m[1]], m[2]);
    if (!zs.length || zs.includes(val)) continue;
    if (zs.length === 1 || m[1] === "item") set(key, m[1] === "item" ? first(KIND.item, m[2]) : zs[0], m[1]);
    else unsure.push({ key, val, zs });
    continue;
  }
  if (m && /^(title|modifier)$/.test(m[1])) continue;
  const en = key.replace(/\s+/g, " ").trim(), words = en.split(" ");
  const named = cand(NAMED, en), itemish = cand(ITEMISH, en), monsterish = cand(MONSTERISH, en), parts = cand(PARTS, en);
  const rp = words.length === 2 ? first(["rprefix"], words[0]) : null, rs = words.length === 2 ? first(["rsuffix"], words[1]) : null;
  const rare = rp && rs ? rp + rs : null;
  const others = [...new Set([...parts, ...(general.get(en.toLowerCase()) ?? [])])];
  if (!KEEP.has(key)) {
    // 遊戲在中文模式下只查一般鍵：真正的物品、技能、怪物名稱優先；稀有名稱與怪物稱號的單字另有 affix:／unique: 鍵
    if (named.length) { if (!named.includes(val)) set(key, first(NAMED, en), "name"); }
    else if (rare) set(key, rare, "rare");
    else if (others.length === 1 && !parts.length && val !== others[0]) set(key, others[0], "only");
    else if (others.length > 1 && !parts.length && !others.includes(val)) unsure.push({ key, val, zs: others });
  }
  const now = dict[key];
  if (/^rings$/i.test(en)) continue;
  if (itemish.length && !itemish.includes(now)) set(`item:${en}`, first(ITEMISH, en), "item-key");
  if (monsterish.length && !monsterish.includes(now)) set(`monster:${en}`, first(MONSTERISH, en), "monster-key");
}
// 稀有字首／字尾單字：一般鍵另有他義時補 affix: 鍵（未列舉的稀有名稱由 lang.js 逐字組合時使用）
for (const c of ["rprefix", "rsuffix"]) for (const r of table(c === "rprefix" ? "rareprefix" : "raresuffix")) {
  const s = r.name && lookup(r.name); if (!s) continue;
  const en = strip(s.en), zh = strip(s.zh), magic = cand(["mprefix", "msuffix"], en);
  if (magic.length && !magic.includes(zh)) { unsure.push({ key: `affix:${en}`, val: dict[`affix:${en}`], zs: [zh, ...magic] }); continue; }
  if (dict[en] !== zh || `affix:${en}` in dict) set(`affix:${en}`, zh, "rare-word");
}

const show = (title, list, fmt) => { console.log(`\n=== ${title}（${list.length}）`); for (const e of list) console.log(fmt(e)); };
const rareChanges = changes.filter((c) => c.why === "rare");
show("更新", changes.filter((c) => c.why !== "rare"), (e) => `[${e.why}] ${e.key}：${e.from} → ${e.to}`);
show("稀有名稱更新（僅列前 40）", rareChanges.slice(0, 40), (e) => `${e.key}：${e.from} → ${e.to}`);
console.log(`…稀有名稱共 ${rareChanges.length} 條`);
show("新增種類鍵", added, (e) => `${e.key} = ${e.to}`);
show("需人工判斷（未更動）", unsure, (e) => `${e.key}：${e.val} ⇄ 官方 ${e.zs.join("｜")}`);
if (write) { fs.writeFileSync(dictFile, JSON.stringify(dict, null, 1) + "\n"); console.log(`\n已寫回 ${dictFile}`); }
else console.log("\n（未寫入；加 --write 才會寫回字典）");
