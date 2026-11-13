// 輔助器「只改記憶體、不自行寫遊戲存檔鍵與簽章」靜態掃描與行為測試：node helper/tests/memory-only.cjs
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
];

for (const file of jsFiles) {
  const fullPath = path.join(helperDir, file);
  const content = fs.readFileSync(fullPath, "utf8");
  for (const { label, re } of FORBIDDEN_PATTERNS) {
    assert.equal(re.test(content), false, `helper/${file} 不得包含 ${label}`);
  }
}
console.log(`✔ 靜態掃描通過（${jsFiles.join("、")}）：無存檔鍵、無 sealText、無 __d2editBackend`);

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

const forgeLocal = require("../forge-local.js");
forgeLocal.set({ enabled: true, sure: true });

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
