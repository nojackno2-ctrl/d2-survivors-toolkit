// 輔助器「只讀記憶體＋送輸入、預設不包裝官方函式、不讀寫存檔鍵」靜態掃描與行為測試：node helper/tests/memory-only.cjs
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const helperDir = path.resolve(__dirname, "..");
const jsFiles = fs.readdirSync(helperDir).filter((f) => f.endsWith(".js")).sort();
assert.ok(jsFiles.length >= 6, "應掃描 helper/*.js 所有模組");

const FORBIDDEN_PATTERNS = [
  { label: "遊戲一般存檔鍵 d2-survivors/save/v1", re: /d2-survivors\/save\/v1/ },
  { label: "遊戲硬核存檔鍵 d2-survivors/hc/v1", re: /d2-survivors\/hc\/v1/ },
  { label: "簽章函式 sealText", re: /\bsealText\b/ },
  { label: "修改器後端全域變數 __d2editBackend", re: /\b__d2editBackend\b/ },
  // 去掛接（2026-11-21 桌面版）：不再包住 Game.prototype、不連官方網址、不依賴舊網頁載入器。
  { label: "包裝 Game 原型（wrap(proto …)）", re: /\bwrap\(proto\b/ },
  { label: "改寫 Game.prototype.tick／steer", re: /prototype\.(?:tick|steer)\s*=[^=]/ },
  { label: "對 d2survivors 的 fetch", re: /fetch\([^)]*d2survivors/ },
  { label: "__d2hostFetch", re: /\b__d2hostFetch\b/ },
  { label: "__d2zhUrl／__d2zhPromise 字典相依", re: /\b__d2zh(?:Url|Promise)\b/ },
  { label: "舊網頁載入器 d2edit.js", re: /d2edit\.js/ },
  { label: "舊網頁載入器介面 __d2editIsOpen", re: /\b__d2editIsOpen\b/ },
  { label: "walkTarget 寫入（移動只走鍵盤）", re: /\.walkTarget\s*=[^=]/ },
];

for (const file of jsFiles) {
  const fullPath = path.join(helperDir, file);
  const content = fs.readFileSync(fullPath, "utf8");
  for (const { label, re } of FORBIDDEN_PATTERNS) {
    assert.equal(re.test(content), false, `helper/${file} 不得包含 ${label}`);
  }
}
console.log(`✔ 靜態掃描通過（${jsFiles.join("、")}）：無存檔鍵、無 sealText、無 __d2editBackend、無 Game 原型包裝、無官方網址 fetch、無舊載入器相依`);
assert.ok(jsFiles.includes("input.js") && jsFiles.includes("hooks.js"), "helper/ 應含 input.js 與 hooks.js");

// 行為測試：forge-local.js 只改記憶體、不對任何 d2-survivors/ 鍵呼叫 setItem，且線上存檔模式下停用並放行
const store = new Map();
const setCalls = [];
global.localStorage = {
  getItem: (k) => store.get(k) ?? null,
  setItem: (k, v) => {
    setCalls.push([k, v]);
    if (String(k).startsWith("d2-survivors/")) {
      throw new Error("禁止對遊戲存檔鍵呼叫 setItem：" + k);
    }
    store.set(k, String(v));
  },
};

let guardMode = "local";
global.__d2guard = { saveMode: () => guardMode };
global.__d2autobot = {
  saveMode: () => (global.__d2guard?.saveMode?.() === "online" ? "online" : "local"),
  onlineSave: () => global.__d2autobot.saveMode() === "online",
  settings: { cheat: { enabled: true, forgeLocal: true, forgeLocalSure: true } },
  game: null,
};

global.__d2forgeLocalReady = true; // 本地淬鍊在桌面版預設不可用；測試以此旗標驗證其邏輯
const forgeLocal = require("../forge-local.js");
forgeLocal.set({ enabled: true, sure: true });

// ── hooks.js：install／uninstall 參照往返（原型方法、實例自有屬性、Array.prototype.sort/push、p.life 描述子）
{
  const hooks = require("../hooks.js");
  const same = (a, b, msg) => assert.equal(a, b, msg);
  // 原型方法（原本不是自有屬性）：包裝後參照改變，還原後回到原函式
  class Game { tick() { return "t"; } }
  const protoTick = Game.prototype.tick;
  const hp = hooks.wrapMethod(Game.prototype, "tick", (orig) => function (...a) { return "w" + orig.apply(this, a); });
  assert.notEqual(Game.prototype.tick, protoTick); assert.equal(new Game().tick(), "wt");
  assert.equal(hp.restore(), true); same(Game.prototype.tick, protoTick, "原型方法還原為原參照");
  // 實例上包裝「繼承來的方法」：還原後不留自有屬性
  const inst = new Game(); const hi = hooks.wrapMethod(inst, "tick", () => function () { return "i"; });
  assert.equal(Object.hasOwn(inst, "tick"), true); hi.restore(); assert.equal(Object.hasOwn(inst, "tick"), false, "原本非自有屬性：還原後 delete"); same(inst.tick, protoTick);
  // 實例自有屬性：還原為原參照且仍是自有
  const own = { showTown() { return 1; } }; const ownOrig = own.showTown; const ho = hooks.wrapMethod(own, "showTown", () => function () { return 2; });
  assert.equal(own.showTown(), 2); ho.restore(); same(own.showTown, ownOrig); assert.equal(Object.hasOwn(own, "showTown"), true);
  // 別人之後又包了一層：不覆蓋
  const hx = hooks.wrapMethod(own, "showTown", () => function () { return 3; }); const other = () => 9; own.showTown = other;
  assert.equal(hx.restore(), false); same(own.showTown, other, "目前值不是自己的包裝時不還原");
  // Array.prototype.sort／push（第 3 組例外，同步暫改）
  const sortOrig = Array.prototype.sort, pushOrig = Array.prototype.push;
  const hs = hooks.wrapMethod(Array.prototype, "sort", (o) => function (c) { return Reflect.apply(o, this, [c]); });
  const hu = hooks.wrapMethod(Array.prototype, "push", (o) => function (...i) { return Reflect.apply(o, this, i); });
  assert.notEqual(Array.prototype.sort, sortOrig); hu.restore(); hs.restore();
  same(Array.prototype.sort, sortOrig, "Array.prototype.sort 還原"); same(Array.prototype.push, pushOrig, "Array.prototype.push 還原");
  assert.deepEqual([3, 1, 2].sort(), [1, 2, 3]);
  // p.life 存取器：攔截下降、還原為原描述子（含最新值）
  const p = { life: 50 }; const d0 = Object.getOwnPropertyDescriptor(p, "life"); const gl = hooks.guardMinimum(p, "life");
  p.life = 10; assert.equal(p.life, 50, "下降被攔截"); p.life = 80; assert.equal(p.life, 80);
  assert.equal(gl.restore(), true); assert.deepEqual(Object.getOwnPropertyDescriptor(p, "life"), { ...d0, value: 80 }, "描述子還原");
  // 登錄表：預設空、冪等、uninstallAll
  const reg = hooks.createRegistry(); let installs = 0, uninstalls = 0; const t = { a: 1 };
  reg.define("demo", { install: () => { installs++; t.a = 2; return true; }, uninstall: () => { uninstalls++; t.a = 1; return true; } });
  assert.deepEqual(reg.installed(), [], "預設全部未安裝");
  reg.install("demo"); reg.install("demo"); assert.equal(installs, 1, "install 冪等"); assert.deepEqual(reg.installed(), ["demo"]); assert.equal(reg.has("demo"), true);
  reg.uninstall("demo"); reg.uninstall("demo"); assert.equal(uninstalls, 1); assert.equal(t.a, 1); assert.deepEqual(reg.installed(), []);
  reg.install("demo"); assert.equal(reg.uninstallAll(), true); assert.deepEqual(reg.installed(), []);
  assert.throws(() => reg.install("nope"), /未知的掛接/);
  console.log("✔ hooks.js install／uninstall 參照往返測試通過");
}

(async () => {
  // 1. 單機模式：處理鍛造寫入帳本，之後物品與帳本不一致時 restore() 只改記憶體，不寫任何 d2-survivors/ 鍵
  guardMode = "local";
  assert.equal(forgeLocal.enabled(), true, "單機模式下 enabled() 為 true");
  const r1 = forgeLocal.handle({ act: "upgrade", item: { i: "eq1", f: {} } });
  assert.equal(r1?.status, 200);
  assert.equal(r1.body.forge.up, 1);

  const item = { id: "eq1", base: "ring", rarity: "unique", forge: {} };
  const moved = [];
  global.__d2autobot.game = {
    save: { mode: "sc", inventoryByClass: { sorceress: [item] } },
    kit: { id: "sorceress" },
    moved: (it) => moved.push(it),
  };

  setCalls.length = 0;
  const changed = await forgeLocal.restore();
  assert.equal(changed, true, "帳本與物品不一致時 restore() 應回傳 true");
  assert.deepEqual(item.forge, { up: 1 }, "restore() 應直接更新記憶體中 g.save 物品的 forge");
  assert.equal(moved.includes(item), true, "有 g.moved 時應呼叫遊戲方法通知落盤");
  assert.equal(
    setCalls.some(([k]) => String(k).startsWith("d2-survivors/")),
    false,
    "restore() 絕不對任何 d2-survivors/ 鍵呼叫 setItem"
  );

  // 2. 線上模式：__d2guard.saveMode() 回 "online" 時 enabled() 為 false、handle() 對鍛造動作回 null 放行給真伺服器、restore() 不改記憶體
  guardMode = "online";
  assert.equal(forgeLocal.enabled(), false, "線上模式下 enabled() 應為 false");
  for (const act of ["temper", "clean", "hellforge", "upgrade", "look", "claim"]) {
    assert.equal(
      forgeLocal.handle({ act, item: { i: "eq1", f: { up: 1 } } }),
      null,
      `線上模式下 handle(${act}) 應回傳 null 放行給真伺服器`
    );
  }
  item.forge = {};
  assert.equal(await forgeLocal.restore(), false, "線上模式下 restore() 不動作並回傳 false");
  assert.deepEqual(item.forge, {}, "線上模式下 restore() 不改動記憶體物品");

  // 3. fetchHook 在線上模式下放行給 origFetch
  let fetched = 0;
  const res = await forgeLocal.fetchHook(
    "https://d2survivors.lol/api/leaderboard/forge",
    { method: "POST", body: JSON.stringify({ act: "temper", item: { i: "eq1", f: {} } }) },
    async () => {
      fetched++;
      return new Response(JSON.stringify({ ok: true, outcome: "missed", forge: {} }), { status: 200 });
    }
  );
  assert.equal(fetched, 1, "線上模式下 fetchHook 應放行給真伺服器");
  assert.equal(res.status, 200);

  console.log("✔ 輔助器只改記憶體與線上模式保護測試全部通過");
})().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
