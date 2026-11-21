// 裝備資料庫完整檢查（每次遊戲更新都跑）：
// 用最新遊戲快照的程式碼＋官方 itemstats.json 啟動修改器物品引擎，逐件產生全部暗金／套裝／符文之語，
// 確認「一鍵解鎖」與「製作裝備」產出的品質、名稱正確且遊戲讀檔會接受；並列出與前一版快照的物品增減。
// 環境變數：D2_BUILD 指定快照版本（預設最新）；D2_ITEMSTATS 指定 itemstats.json 路徑（預設快照內，沒有就從官方下載並快取）。
const fs = require("node:fs"), path = require("node:path"), os = require("node:os");
const { pathToFileURL } = require("node:url");
const ROOT = path.join(__dirname, "..", "..");
const BUNDLES = path.join(ROOT, "game-bundles");
const P = { patch: require("./load-patch.cjs")() };
const SIGS = JSON.parse(fs.readFileSync(path.join(ROOT, "modifier", "signatures.json"), "utf8"));
const fail = [];
const check = (ok, msg) => { if (!ok) fail.push(msg); };

const builds = fs.readdirSync(BUNDLES).filter((b) => fs.existsSync(path.join(BUNDLES, b, "assets"))).sort();
const build = process.env.D2_BUILD || builds[builds.length - 1];
const prev = builds[builds.indexOf(build) - 1];

// 遊戲模組載入時會碰到瀏覽器全域物件；只做物品資料運算，給最小替身即可
function stubBrowser() {
  const h = { get: (t, k) => (k === Symbol.toPrimitive ? () => "" : k in t ? t[k] : (t[k] = new Proxy(function () {}, h))), apply: () => new Proxy(function () {}, h), construct: () => new Proxy({}, h) };
  const g = globalThis;
  g.window ??= g; g.self ??= g;
  g.matchMedia ??= () => ({ matches: false, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {} });
  g.document ??= new Proxy(function () {}, h);
  if (!g.navigator?.language) Object.defineProperty(g, "navigator", { value: { userAgent: "node", language: "zh-TW", languages: ["zh-TW"], platform: "Win32", maxTouchPoints: 0 }, configurable: true });
  g.localStorage ??= { getItem: () => null, setItem() {}, removeItem() {} };
  g.location ??= { href: "app://game/play/index.html", search: "", origin: "app://game" };
  for (const n of ["HTMLElement", "HTMLCanvasElement", "Image", "Worker", "OffscreenCanvas", "WebGLRenderingContext", "WebGL2RenderingContext", "ImageBitmap"]) g[n] ??= class {};
  g.requestAnimationFrame ??= () => 0; g.devicePixelRatio ??= 1;
}

// 遊戲以 /play/ 頁面 d2-files 清單的雜湊（?h=）抓 itemstats.json；不帶雜湊會拿到 CDN 舊快取（曾缺地獄火炬）。
// 快取檔名含雜湊，資料更新就會重抓。
async function itemstats() {
  if (process.env.D2_ITEMSTATS) return fs.readFileSync(process.env.D2_ITEMSTATS, "utf8");
  // 桌面版：物品資料由遊戲從玩家自己的 D2 安裝解出，放在 %APPDATA%D2 Survivorsd2itemstats.json
  const local = path.join(process.env.APPDATA || "", "D2 Survivors", "d2", "itemstats.json");
  if (!fs.existsSync(local)) throw new Error("找不到本機 itemstats.json：" + local + "（請先啟動一次桌面版遊戲，或設定 D2_ITEMSTATS）");
  return fs.readFileSync(local, "utf8");
}

// 讀快照的物品名稱清單（不執行程式，只看 unique/set 定義），用來列出新舊版增減
function namesOf(b) {
  const dir = path.join(BUNDLES, b, "assets"), out = new Set();
  for (const f of fs.readdirSync(dir)) if (/^itemArt-.*\.js$/.test(f)) for (const m of fs.readFileSync(path.join(dir, f), "utf8").matchAll(/\$\(`([^`]+)`,`[^`]+`,\d+/g)) out.add(m[1]);
  return out;
}

(async () => {
  stubBrowser();
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "d2-itemdb-"));
  try {
    fs.cpSync(path.join(BUNDLES, build, "assets"), path.join(tmp, "assets"), { recursive: true });
    const dir = path.join(tmp, "assets");
    fs.writeFileSync(path.join(dir, "package.json"), '{"type":"module"}');
    const files = {};
    for (const f of fs.readdirSync(dir)) if (f.endsWith(".js")) files[f] = fs.readFileSync(path.join(dir, f), "utf8");
    const r = P.patch(files, SIGS);
    check(!r.missing.length, `特徵碼找不到：${r.missing.join("、")}`);
    for (const [f, src] of Object.entries(r.patched)) fs.writeFileSync(path.join(dir, f), src);
    const mods = [];
    for (const f of new Set(Object.values(r.found))) mods.push(await import(pathToFileURL(path.join(dir, f)).href));
    const G = Object.assign({}, ...mods);
    const { boot } = await import(pathToFileURL(path.join(ROOT, "modifier", "engine-page.js")).href);
    const statsText = await itemstats(), statsData = JSON.parse(statsText);
    const eng = boot(G, statsText, {});

    // 1. 目錄完整：與遊戲資料陣列一致、同品質內不重名
    const cat = eng.catalog();
    const by = (k) => cat.filter((x) => x.rarity === k);
    check(by("unique").length === G.__uniques.length, `暗金數量 ${by("unique").length} ≠ 遊戲 ${G.__uniques.length}`);
    check(by("set").length === G.__sets.length, `套裝數量 ${by("set").length} ≠ 遊戲 ${G.__sets.length}`);
    // 符文之語依底材類型各收一次：列數 = 遊戲對每個名稱的類型數（G.__runewordKinds，與遊戲收藏的「Bases」總數相同）
    const rwRows = G.__runewords.reduce((n, d) => n + G.__runewordKinds(d.name).length, 0);
    check(by("runeword").length === rwRows, `符文之語列數 ${by("runeword").length} ≠ 遊戲 ${rwRows}（${G.__runewords.length} 個名稱）`);
    const keys = cat.map((x) => x.rarity === "runeword" ? `runeword|${x.name}|${x.kind}` : x.rarity + "|" + x.name);
    check(new Set(keys).size === keys.length, "目錄有重複的品質＋名稱（符文之語含底材類型）");
    // 物品資料（itemstats）必須涵蓋每件暗金與套裝，否則做出來會沒有屬性
    const noData = cat.filter((x) => (x.rarity === "unique" && !statsData.uniques?.[x.name]) || (x.rarity === "set" && !statsData.setItems?.[x.name])).map((x) => x.name);
    check(!noData.length, `物品資料缺少 ${noData.length} 件的屬性：${noData.slice(0, 10).join("、")}`);

    // 2. 一鍵解鎖：逐件產生，品質與名稱必須等於要求的，遊戲讀檔整理不可丟棄，原版規則檢查不可有問題
    const todo = cat.filter((x) => !x.unavailable);
    const made = eng.generateMany(todo.map((x) => ({ rarity: x.rarity, name: x.name, base: x.rarity === "runeword" ? x.base : undefined })), true);
    const bad = [];
    made.forEach((o, i) => {
      const want = todo[i];
      if (!o?.item) bad.push(`${want.rarity} ${want.name}：${o?.rejected ? "遊戲讀檔會丟棄" : o?.error ?? "產生失敗"}`);
      else if (o.item.rarity !== want.rarity || o.item.name !== want.name) bad.push(`${want.rarity} ${want.name}：產生成 ${o.item.rarity} ${o.item.name}`);
    });
    // 以遊戲自己的物品檢查為準（修改器的額外規則已依使用者要求停用，不列入）
    check(typeof G.__itemFault === "function", "找不到遊戲的物品檢查函式（itemFault 特徵碼失效）");
    const ok = made.filter((o) => o?.item), v = eng.faults(ok.map((o) => o.item)) ?? [];
    ok.forEach((o, i) => { if (v[i]) bad.push(`${o.item.rarity} ${o.item.name}：遊戲判定不合法 ${JSON.stringify(v[i]).slice(0, 120)}`); });
    check(!bad.length, `一鍵解鎖有 ${bad.length} 件不正確：\n  ` + bad.slice(0, 20).join("\n  "));

    // 3. 製作裝備：每種部位挑一個底材做魔法與稀有品質
    const seen = new Set(), craft = [];
    for (const b of G.__bases) if (!seen.has(b.type)) { seen.add(b.type); craft.push(b.name); }
    for (const rarity of ["magic", "rare"]) {
      // 護身符原版沒有稀有品質，不做
      const list = rarity === "rare" ? craft.filter((n) => G.__bases.find((b) => b.name === n)?.type !== "charm") : craft;
      const out = eng.generateMany(list.map((base) => ({ rarity, base })), false);
      out.forEach((o, i) => check(!!o?.item && o.item.rarity === rarity, `製作 ${rarity} ${list[i]} 失敗：${o?.error ?? (o?.item ? "品質變成 " + o.item.rarity : o?.rejected ? "遊戲讀檔會丟棄" : "產生失敗")}`));
    }

    // 4. 與前一版快照比較物品名稱（僅列出，供分析新增裝備）
    let diff = "";
    if (prev) {
      const a = namesOf(prev), b = namesOf(build);
      const add = [...b].filter((n) => !a.has(n)), del = [...a].filter((n) => !b.has(n));
      diff = `；與 ${prev} 相比新增 ${add.length}${add.length ? "（" + add.join("、") + "）" : ""}、移除 ${del.length}${del.length ? "（" + del.join("、") + "）" : ""}`;
    }
    console.log(`遊戲 ${build}：目錄 ${cat.length} 件（暗金 ${by("unique").length}、套裝 ${by("set").length}、符文之語 ${by("runeword").length}），逐件產生 ${todo.length} 件${diff}`);
  } catch (e) { fail.push("執行失敗：" + (e.stack || e)); }
  finally { fs.rmSync(tmp, { recursive: true, force: true }); }
  if (fail.length) { console.error("✖ 裝備資料庫檢查失敗：\n" + fail.join("\n")); process.exit(1); }
  console.log("✔ 裝備資料庫檢查通過");
})();
