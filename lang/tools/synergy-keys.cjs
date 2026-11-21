// 依遊戲內 L0／IKe 邏輯窮舉所有技能的「協同說明」字串，補齊 zh-TW.json 缺的鍵（名稱用字典譯名）。
const fs = require("fs");
const T = __dirname; // 技能協同鍵產生器：讀 synergy-data.json（由 synergy-data.cjs 從遊戲取得），補 lang/zh-TW.json 缺的協同說明鍵。用法：node lang/tools/synergy-keys.cjs [--write]
const D = JSON.parse(fs.readFileSync(T + "/synergy-data.json", "utf8"));
const zf = require("path").join(__dirname, "..", "zh-TW.json");
const z = JSON.parse(fs.readFileSync(zf, "utf8"));
const F = D.skills, EG = D.passives, X1 = D.x1;
const FKE = ["sorceress", "necromancer", "druid", "assassin", "paladin"];
const Ef = 0.5;
const zG = (e) => Object.keys(F).find((t) => F[t].into === e);
const BG = (e, t) => { for (let n = F[e].into, r = 0; n && r < 8; n = F[n].into, r++) if (n === t) return true; return false; };
const F0 = (e) => (e in F ? F[e].name : X1[e].name);
const I0 = (names) => (names.length < 2 ? names.join("") : `${names.slice(0, -1).join(", ")} and ${names.at(-1)}`);
function IKe(e) {
  const t = F[e].synergies ?? [], n = [], r = FKE.includes(F[e].cls ?? "");
  const i = (tt, p, a = 1, o) => { if (tt === e || (BG(e, tt) && !r) || n.some((x) => x.from === tt)) return; n.push({ from: tt, perLevel: Math.max(1, Math.round(p * Ef * a)), ...(o && { part: o }) }); };
  const a = (tt) => (Object.hasOwn(EG, tt) ? 20 / EG[tt].maxLevel : tt in F && (r || (F[e].d2Synergies && !BG(e, tt))) ? 20 / F[tt].maxLevel : 1);
  for (const s of t) i(s.from, s.perLevel, a(s.from), s.part);
  for (let nn = zG(e), rr = 0; nn && rr < 8; nn = zG(nn), rr++) for (const s of F[nn].synergies ?? []) i(s.from, t[0]?.perLevel ?? s.perLevel, Object.hasOwn(EG, s.from) ? a(s.from) : 1, t[0]?.part);
  return n;
}
// 同 L0：回傳 [{key(英文，數字以 # 表示), zh}]
const zn = (n) => z[n] ?? n;
const I0zh = (names) => (names.length < 2 ? names.map(zn).join("") : `${names.slice(0, -1).map(zn).join("、")}及${zn(names.at(-1))}`);
function L0(e) {
  const t = IKe(e);
  if (t.length === 0) return [];
  const n0 = t[0].perLevel, same = t.filter((x) => x.perLevel === n0).map((x) => F0(x.from));
  const items = [];
  // A：逐項
  items.push({
    key: t.map((x, i) => `+#% ${i === 0 ? "damage per level " : ""}of ${F0(x.from)}`).join(", "),
    zh: t.map((x, i) => (i === 0 ? `${zn(F0(x.from))}每等級傷害 +{0}%` : `${zn(F0(x.from))}每等級 +{${i}}%`)).join("，"),
    isA: true, count: t.length, same: same.length,
  });
  items.push({ key: `+#% damage per level of ${I0(same)}`, zh: `${I0zh(same)}每等級增加 {0}% 傷害` });
  items.push({ key: `+#% per level of ${I0(same)}`, zh: `${I0zh(same)}每等級增加 {0}%` });
  for (let k = same.length - 1; k > 0; k--) items.push({ key: `+#% per level of ${same.slice(0, k).join(", ")} and # more`, zh: `${same.slice(0, k).map(zn).join("、")}及其他 {1} 項每等級增加 {0}%` });
  return items;
}
const keys = new Map();
for (const id of Object.keys(F)) for (const it of L0(id)) if (!keys.has(it.key)) keys.set(it.key, it.zh);
let have = 0, add = 0; const added = [];
for (const [k, v] of keys) { if (z[k] !== undefined) { have++; continue; } z[k] = v; add++; added.push(k); }
console.log("synergy keys total", keys.size, "already", have, "added", add);
console.log(added.slice(0, 6).join("\n"));
const missingNames = new Set();
for (const k of keys.keys()) for (const m of k.matchAll(/(?:of |, (?:\+#% of )?|and )([A-Z][A-Za-z' -]+?)(?=,| and |$)/g)) if (z[m[1]] === undefined) missingNames.add(m[1]);
console.log("names without dict entry:", [...missingNames].slice(0, 20));
const raw = fs.readFileSync(zf, "utf8"); const indent = /^\{\r?\n(\s+)"/.exec(raw)?.[1] ?? "  ";
if (process.argv[2] === "--write") { fs.writeFileSync(zf, JSON.stringify(z, null, indent.length) + "\n"); console.log("written"); }
