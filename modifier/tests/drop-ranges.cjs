// 掉落屬性範圍對照（每次遊戲更新都跑）：用遊戲自己的產生器（掉落用的同一組函式，物品等級 1～99、各職業）大量取樣，
// 逐列對照修改器 statRanges：單列不得超出範圍；同屬性多列的合計（遊戲提示框顯示的數字）不得超過 affixTotal；
// 底材固有加成（auto）不得超出 auto 範圍；無形符文之語用無形的範圍。
// 用法：node drop-ranges.cjs [每底材每品質次數=60] [每固定物品次數=40]；D2_BUILD 指定快照版本（預設最新）。
const fs = require("node:fs"), path = require("node:path"), os = require("node:os");
const { pathToFileURL } = require("node:url");
const ROOT = path.join(__dirname, "..", "..");
const BUILDS = fs.readdirSync(path.join(ROOT, "game-bundles")).filter((b) => fs.existsSync(path.join(ROOT, "game-bundles", b, "assets"))).sort();
const BUILD = process.env.D2_BUILD || BUILDS[BUILDS.length - 1];
const P = { patch: require("./load-patch.cjs")() };
const SIGS = JSON.parse(fs.readFileSync(path.join(ROOT, "modifier/signatures.json"), "utf8"));

function stubBrowser() {
  const h = { get: (t, k) => (k === Symbol.toPrimitive ? () => "" : k in t ? t[k] : (t[k] = new Proxy(function () {}, h))), apply: () => new Proxy(function () {}, h), construct: () => new Proxy({}, h) };
  const g = globalThis;
  g.window ??= g; g.self ??= g;
  g.matchMedia ??= () => ({ matches: false, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {} });
  g.document ??= new Proxy(function () {}, h);
  if (!g.navigator?.language) Object.defineProperty(g, "navigator", { value: { userAgent: "node", language: "zh-TW", languages: ["zh-TW"], platform: "Win32", maxTouchPoints: 0 }, configurable: true });
  g.localStorage ??= { getItem: () => null, setItem() {}, removeItem() {} };
  g.location ??= { href: "https://d2survivors.lol/play/", search: "", origin: "https://d2survivors.lol" };
  for (const n of ["HTMLElement", "HTMLCanvasElement", "Image", "Worker", "OffscreenCanvas", "WebGLRenderingContext", "WebGL2RenderingContext", "ImageBitmap"]) g[n] ??= class {};
  g.requestAnimationFrame ??= () => 0; g.devicePixelRatio ??= 1;
}

async function load(run) {
  stubBrowser();
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "d2-dropsim-"));
  try {
    const dir = path.join(tmp, "assets");
    fs.cpSync(path.join(ROOT, "game-bundles", BUILD, "assets"), dir, { recursive: true });
    fs.writeFileSync(path.join(dir, "package.json"), '{"type":"module"}');
    const files = {};
    for (const f of fs.readdirSync(dir)) if (f.endsWith(".js")) files[f] = fs.readFileSync(path.join(dir, f), "utf8");
    const r = P.patch(files, SIGS);
    if (r.missing.length) throw new Error("特徵碼找不到：" + r.missing.join("、"));
    for (const [f, src] of Object.entries(r.patched)) fs.writeFileSync(path.join(dir, f), src);
    const mods = [];
    for (const f of new Set(Object.values(r.found))) mods.push(await import(pathToFileURL(path.join(dir, f)).href));
    const G = Object.assign({}, ...mods);
    const { boot } = await import(pathToFileURL(path.join(ROOT, "modifier/engine-page.js")).href);
    const statsFile = fs.readdirSync(path.join(ROOT, "game-bundles", BUILD)).find((f) => /^itemstats-.*\.json$/.test(f));
    const eng = boot(G, fs.readFileSync(path.join(ROOT, "game-bundles", BUILD, statsFile), "utf8"), {});

    return await run({ G, eng, fs, path, ROOT, BUILD });
  } finally { fs.rmSync(tmp, { recursive: true, force: true }); }
}
const KA = Number(process.argv[2] || 60), KF = Number(process.argv[3] || 40);
load(async ({ G, eng, fs }) => {
  const CLS = ["amazon", "sorceress", "necromancer", "paladin", "barbarian", "druid", "assassin", undefined];
  const rnd = (n) => Math.floor(Math.random() * n);
  const ilvlOf = () => (rnd(4) === 0 ? 99 : 1 + rnd(99));
  const maps = { over: new Map(), under: new Map(), none: new Map(), stack: new Map(), cap: new Map(), capOver: new Map() };
  const hit = (map, key, value, shown, ex) => {
    const x = map.get(key) ?? { n: 0, lo: Infinity, hi: -Infinity, shown: new Set(), ex: null };
    x.n++; x.lo = Math.min(x.lo, value); if (value > x.hi) { x.hi = value; x.ex = ex; } x.shown.add(shown); map.set(key, x);
  };
  const count = { magic: 0, rare: 0, unique: 0, set: 0, runeword: 0 };
  const check = (it, ilvl, ctx = "") => {
    count[it.rarity] = (count[it.rarity] ?? 0) + 1;
    const fixed = ["unique", "set", "runeword"].includes(it.rarity);
    const db = eng.statRanges({ rarity: it.rarity, name: it.name, base: it.base, ethereal: it.ethereal });
    const seen = {}, sums = {};
    for (const m of it.mods ?? []) {
      if (typeof m.value !== "number") continue;
      const imp = !!m.implicit;
      // 觸發／充能技能的等級寫在屬性名稱裡，會隨物品等級變化：比對時去掉等級
      const key = `${imp ? 1 : 0}:${m.stat}`, idx = seen[key] ?? 0; seen[key] = idx + 1;
      const tag = m.staff ? "法杖技能" : m.auto ? "底材固有(auto)" : imp ? "底材(implicit)" : "屬性";
      let range = null;
      if (m.staff) range = [[1, 3]];
      else if (m.auto) { const x = db?.auto?.[m.stat]; if (x) range = [x]; }
      else if (fixed) { const f = db?.fixed?.[key]?.[idx]; if (f) range = [f]; }
      else if (imp) { const x = db?.implicit?.[m.stat]; if (x) range = [[x[0], x[1]]]; }
      else { range = db?.affix?.[m.stat] ?? null; (sums[m.stat] ??= []).push(m.value); }
      const who = fixed ? `${it.rarity}｜${it.name}${ctx}｜${tag}｜${m.stat}` : `${it.rarity}｜${tag}｜${m.stat}｜${it.base}`;
      const ex = `${it.base} ilvl${ilvl}`;
      if (!range) { hit(maps.none, fixed ? who : `${it.rarity}｜${tag}｜${m.stat}`, m.value, "無", ex); continue; }
      const hi = Math.max(...range.map((x) => x[1])), lo = Math.min(...range.map((x) => x[0]));
      if (m.value > hi) hit(maps.over, who, m.value, `${lo}～${hi}`, ex);
      else if (m.value < lo) hit(maps.under, who, m.value, `${lo}～${hi}`, ex);
    }
    if (!fixed) for (const [stat, list] of Object.entries(sums)) if (list.length > 1) {
      const hi = Math.max(...(db?.affix?.[stat] ?? [[0, 0]]).map((x) => x[1])), total = list.reduce((a, b) => a + b, 0);
      if (total > hi) hit(maps.stack, `${it.rarity}｜${stat}｜${it.base}`, total, `${hi}`, `${list.join("+")} ilvl${ilvl}`);
      const t = db?.affixTotal?.[stat]; hit(maps.cap, `${it.rarity}｜${stat}`, t ? total / t.total : 9, t ? `${t.rows}列/${t.total}` : '無', `${it.base} ${list.join('+')}`);
      if (!t || total > t.total || list.length > t.rows) hit(maps.capOver, `${it.rarity}｜${stat}｜${it.base}`, total, t ? `${t.rows}列/${t.total}` : '無', `${list.join('+')} ilvl${ilvl}`);
    }
  };
  const t0 = Date.now();
  // A. 魔法／稀有：每個底材
  let skipped = 0;
  for (const base of G.__bases) {
    for (const rarity of ["magic", "rare"]) {
      for (let i = 0; i < KA; i++) {
        const ilvl = ilvlOf();
        let it; try { it = G.__makeAffix(base, rarity, 1, ilvl, CLS[rnd(8)]); } catch (e) { skipped++; break; }
        if (!it || it.rarity !== rarity) { if (i === 0) { skipped++; break; } continue; }
        check(it, ilvl);
      }
    }
  }
  // B. 暗金／套裝
  for (const [rarity, list, make] of [["unique", G.__uniques, G.__makeUnique], ["set", G.__sets, G.__makeSet]]) for (const def of list) {
    for (let i = 0; i < KF; i++) { const ilvl = ilvlOf(); let it; try { it = make(def, 1, ilvl); } catch (e) { break; } if (it) check(it, ilvl); }
  }
  // C. 符文之語：每個可用底材類別各取一個代表底材，含無形
  const cat = eng.catalog().filter((x) => x.rarity === "runeword" && !x.unavailable);
  const baseBy = new Map(G.__bases.map((b) => [b.name, b]));
  for (const row of cat) {
    const def = G.__runewords.find((d) => d.name === row.name), base = baseBy.get(row.base);
    for (const eth of [false, true]) for (let i = 0; i < Math.ceil(KF / 3); i++) {
      const ilvl = ilvlOf(); let it; try { it = G.__makeRuneword(def, base, eth, 1, ilvl); } catch (e) { break; }
      if (it) check(it, ilvl, eth ? "（無形）" : "");
    }
  }
  const show = (map) => [...map.entries()].slice(0, 8).map(([k, x]) => `${k} 實值 ${x.lo}～${x.hi} 修改器 ${[...x.shown].join(" / ")}（${x.ex}）`).join("\n  ");
  const fail = [];
  if (maps.over.size) fail.push(`遊戲產生的數值高於修改器範圍 ${maps.over.size} 種：
  ` + show(maps.over));
  if (maps.under.size) fail.push(`遊戲產生的數值低於修改器範圍 ${maps.under.size} 種：
  ` + show(maps.under));
  if (maps.capOver.size) fail.push(`同屬性合計超過修改器的疊加上限 ${maps.capOver.size} 種：
  ` + show(maps.capOver));
  if (!maps.stack.size) fail.push("沒有取樣到同屬性疊加的物品（取樣或比對失效）");
  if (fail.length) { console.error(fail.join("\n"));process.exitCode = 1; return; }
  console.log(`遊戲 ${BUILD}：取樣 ${Object.values(count).reduce((a, b) => a + b, 0)} 件（${((Date.now() - t0) / 1000).toFixed(1)} 秒），掉落屬性皆在修改器範圍內；同屬性疊加 ${maps.stack.size} 種組合皆未超過合計上限`);
}).catch((e) => { console.error(e); process.exitCode = 1; });
