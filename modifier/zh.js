// 中文化：把物品名稱、底材、屬性、技能翻成繁體中文
// DICT 來自啟動器的 zh-TW 字典（英文 → 中文，{0} {1} 為數值位置），GAME 是從遊戲程式碼擷取的屬性樣板與技能樹
let DICT = {}, GAME = { stats: {}, classes: {} };
const ZH_CLASS = { amazon: "亞馬遜", sorceress: "魔法使", necromancer: "死靈法師", paladin: "聖騎士", barbarian: "野蠻人", druid: "德魯伊", assassin: "刺客" };
const CLASS_ORDER = ["amazon", "sorceress", "necromancer", "paladin", "barbarian", "druid", "assassin"];
const PROC_WHEN = { hit: "on striking", attack: "on attack", struck: "when struck", kill: "when you Kill an Enemy", death: "when you Die", levelup: "when you Level-Up" };

let LOWER = {};
function zhInit(data) {
  DICT = data.dict; GAME = data.game; LOWER = {};
  for (const [k, v] of Object.entries(DICT)) LOWER[k.toLowerCase()] ??= v;
}
const look = (s) => (s ? DICT[s] ?? LOWER[s.toLowerCase()] : undefined);
const T = (s) => look(s) || s;
const has = (s) => !!look(s);
const num = (v) => (typeof v === "number" && !Number.isInteger(v) ? Number(v.toFixed(2)) : v);
// camelCase 技能 id → 英文技能名（與遊戲 WX() 相同）
const skillEn = (id) => id.replace(/^./, (c) => c.toUpperCase()).replace(/([A-Z])/g, " $1").trim();
// 本作新增、字典沒有的技能
const EXTRA_SKILLS = { plaguePoppy: "瘟疫罌粟", eruption: "噴發" };
const skillZh = (id) => EXTRA_SKILLS[id] ?? T(skillEn(id));

// 用英文樣板（# 為數值）找中文樣板並代入數值
function tpl(en, vals) {
  vals = vals.map(num);
  for (const k of [en, en.replace(/#/g, "*")]) { const z = look(k); if (z !== undefined) return z.replace(/\{(\d)\}/g, (_, i) => vals[i] ?? ""); }
  // 每級成長：翻前半句再加「（每級）」
  const per = / (per Level|per Character Level|\(Based on Character Level\))$/.exec(en);
  if (per) return tpl(en.slice(0, per.index), vals) + "（每級）";
  // 找不到整句：翻譯文字部分，數值保留原本寫法，例如「+# to Strength」→「力量 +10」
  let i = 0;
  const nums = (en.match(/[+\-]?#%?/g) ?? []).map((n) => n.replace("#", vals[i++] ?? ""));
  const words = en.replace(/[+\-]?#%?/g, "").replace(/:/g, "").replace(/\s+/g, " ").trim();
  const zh = [words, words.replace(/^to /, ""), "to " + words, words.replace(/^by /, ""), words.replace(/ Per Hit$/i, "")].find(has);
  if (zh) return `${T(zh)}${/ Per Hit$/i.test(words) && zh !== words ? "（每次擊中）" : ""} ${nums.join(" ")}`.trim();
  i = 0;
  return en.replace(/#/g, () => vals[i++] ?? "");
}

// 單一屬性 → 中文說明（對應遊戲 UX()）
function modZh(m) {
  const s = m.stat ?? "", v = m.value;
  let r = /^skilltab(\d+)$/.exec(s);
  if (r) {
    const n = Number(r[1]), cls = CLASS_ORDER[Math.floor(n / 3)], c = GAME.classes[cls];
    if (c) return `+${v} ${T(c.trees[n % 3])} ${T(c.only)}`;
  }
  r = /^classskills(\d)$/.exec(s);
  if (r) { const cls = CLASS_ORDER[Number(r[1])]; if (cls) return `+${v} ${ZH_CLASS[cls]}技能等級`; }
  if (s.startsWith("skill:")) return `+${v} ${skillZh(s.slice(6))}`;
  if (s.startsWith("oskill:")) return `+${v} ${skillZh(s.slice(7))}`;
  const [kind, a, b, c] = s.split(":");
  if (kind === "proc") return tpl(`#% Chance to cast level # # ${PROC_WHEN[a] ?? ""}`.trim(), [v, c, skillZh(b)]);
  if (kind === "charge") return `等級 ${b} ${skillZh(a)}（${v} 次充能）`;
  if (kind === "aura") return tpl("Level # # Aura When Equipped", [v, skillZh(a)]);
  const en = (m.implicit && GAME.stats["base:" + s]) || GAME.stats[s];
  if (en) return tpl(en, [v]);
  return `${s} ${v}`;
}

// 物品名稱：先整句查；魔法物品拆成 字首 + 底材 + 字尾 再組成中文（字尾 + 字首 + 底材）
const cleanName = (s) => (typeof s === "string" ? s.replace(/([\u4e00-\u9fa5\u3400-\u4dbf])\s+([\u4e00-\u9fa5\u3400-\u4dbf])/g, "$1$2") : s);
function nameZh(it) {
  const itemName = look("item:" + it.name);
  if (itemName && (["runeword", "unique", "set"].includes(it.rarity) || it.name === it.base)) return cleanName(itemName);
  if (has(it.name)) return cleanName(T(it.name));
  const base = it.base ?? "", i = base ? it.name.indexOf(base) : -1;
  if (i >= 0) {
    const pre = it.name.slice(0, i).trim(), suf = it.name.slice(i + base.length).trim();
    return cleanName((suf ? T(suf) : "") + (pre ? T(pre) : "") + baseZh(it));
  }
  // 稀有物品：兩個字分別翻
  const words = it.name.split(" ");
  if (words.length === 2 && words.every(has)) return cleanName(words.map(T).join(""));
  return cleanName(it.name);
}
function baseZh(it) {
  if (it.type === "quest") return cleanName(nameZhQuest(it));
  return cleanName(look("item:" + it.base) ?? T(it.base));
}
const nameZhQuest = (it) => cleanName(T(it.name));
const rarityZh = { normal: "普通", magic: "魔法", rare: "稀有", set: "套裝", unique: "暗金", runeword: "符文之語" };
