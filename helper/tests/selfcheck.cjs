// 自檢單元測試：模擬各種「工具包與遊戲不符」的情況，確認都會輸出對應問題、且不拋錯。
const TESTED = (require("node:fs").readFileSync(require("node:path").join(__dirname, "..", "selfcheck.js"), "utf8").match(/const TESTED_GAME_BUILD = "([^"]+)"/) || [])[1];
if (!TESTED) throw new Error("找不到 helper/selfcheck.js 的 TESTED_GAME_BUILD");
const assert = require("node:assert/strict"), path = require("node:path"), { pathToFileURL } = require("node:url");
const store = {};
global.localStorage = { getItem: (k) => store[k] ?? null, setItem: (k, v) => { store[k] = String(v); } };
global.performance = { getEntriesByType: () => [{ name: "https://d2survivors.lol/assets/Game-abc.js" }] };
global.window = {};
let changelog = [{ build: TESTED }];
global.fetch = async () => ({ ok: !!changelog, json: async () => changelog });
const goodGame = () => Object.fromEntries([...["leaveRun", "continueRun", "startRun", "toMenu", "gainXp", "startTerror", "spendStatPoints", "inventoryOf", "equippedOf", "useQuest", "heroNumbers"].map((k) => [k, () => {}]), ...["state", "camp", "save", "build", "difficulty", "director", "trade", "gearActions", "world", "kit"].map((k) => [k, {}]), ["director", { cloneComes() {} }], ["hud", { showTown() {}, closeLevelUp() {} }]]);
const goodCtx = () => ({
  dict: async () => ({ length: 0, ...Object.fromEntries(Array.from({ length: 6000 }, (_, i) => ["k" + i, "v"])) }),
  gamedata: async () => ({ a: 1 }),
  engine: async () => ({ capabilities: () => ({ supported: true, weaponSets: true }), saveFaults: () => [] }),
  engineInfo: { itemstats: 200 }, gameScript: () => "Game-abc.js", hookWaitMs: 300,
  backend: { load: async (m) => { if (m === "hardcore") throw new Error("none"); return { save: {}, seal: "sealed" }; } },
});
(async () => {
  const { runSelfCheck } = await import(pathToFileURL(path.join(__dirname, "..", "selfcheck.js")).href);
  const find = (r, area, level) => r.issues.find((i) => i.area === area && (!level || i.level === level));
  window.__d2autobot = { game: goodGame(), diagnostics: () => ({}) }; window.__d2lang = { debug: () => ({ gameHooked: true }) };
  let r = await runSelfCheck(goodCtx());
  assert.deepEqual(r.issues, [], "全部正常時不應有問題：" + JSON.stringify(r.issues)); assert.equal(r.ok, true);
  changelog = [{ build: "20261201.1" }];
  r = await runSelfCheck(goodCtx()); assert.ok(find(r, "遊戲版本", "warn"), "新版遊戲要警告"); assert.equal(r.ok, false);
  changelog = null; r = await runSelfCheck(goodCtx()); assert.ok(find(r, "遊戲版本", "info"), "抓不到版本只提示"); changelog = [{ build: TESTED }];
  let c = goodCtx(); c.engine = async () => { throw new Error("遊戲版本不相容：找不到 makeUnique"); }; c.engineInfo = { missing: ["makeUnique"] };
  r = await runSelfCheck(c); assert.ok(/makeUnique/.test(find(r, "物品引擎", "error").msg), "引擎失敗要列出缺少的特徵");
  c = goodCtx(); c.dict = async () => ({ a: 1 }); r = await runSelfCheck(c); assert.ok(find(r, "字典", "warn"));
  c = goodCtx(); c.backend.load = async () => ({ save: {}, seal: "broken" }); r = await runSelfCheck(c); assert.ok(find(r, "存檔", "warn"));
  c = goodCtx(); c.engine = async () => ({ capabilities: () => ({ supported: true, weaponSets: true }), saveFaults: () => ["bad item"] }); r = await runSelfCheck(c); assert.ok(/bad item/.test(find(r, "存檔").msg));
  { const game = goodGame(); window.__d2autobot.game = game;
    delete game.director.cloneComes; r = await runSelfCheck(goodCtx());
    assert.ok(r.issues.some(i => i.level === "warn" && i.msg.includes("director.cloneComes")));
    game.director = null; r = await runSelfCheck(goodCtx());
    assert.ok(r.issues.some(i => i.level === "info" && i.msg.includes("director.cloneComes"))); assert.equal(r.ok, true);
  }
  const g = goodGame(); delete g.gainXp; delete g.hud.closeLevelUp; window.__d2autobot.game = g;
  r = await runSelfCheck(goodCtx()); assert.ok(/gainXp/.test(find(r, "輔助器", "warn").msg) && /hud\.closeLevelUp/.test(find(r, "輔助器", "warn").msg), "缺少成員要列出");
  window.__d2autobot.game = null; r = await runSelfCheck(goodCtx()); assert.ok(find(r, "輔助器", "info") && r.ok, "尚未進遊戲只是提示，不算失敗");
  c = goodCtx(); c.backend.load = async () => { throw new Error("x"); }; c.dict = async () => { throw new Error("boom"); };
  r = await runSelfCheck(c); assert.ok(find(r, "字典", "warn"), "單項檢查拋錯不得中斷其他檢查");
  console.log("自檢單元測試通過");
})().catch((e) => { console.error(e); process.exit(1); });

// 驗證「技能加成」只改 player.allSkills、不改技能等級，關閉後還原。
{
  const source = require("node:fs").readFileSync(path.join(__dirname, "..", "autobot.js"), "utf8");
  const fn = source.slice(source.indexOf("  function restoreAllSkills() {"), source.indexOf("  function restoreGoldRate() {"));
  const block = source.slice(source.indexOf("    // 4. 技能加成"), source.indexOf("    // 5. 怪物數量最大化"));
  const run = new Function("settings", "g", "ALL_SKILLS_BONUS", "let allSkillsOverride = null;" + fn + "return () => {" + block + "};");
  const player = { allSkills: 3 };
  const g = { world: { player }, build: { skills: [{ id: "a", level: 1 }] } };
  const settings = { cheat: { maxSkills: true } };
  const tick = run(settings, g, 20);
  tick(); tick();
  assert.equal(player.allSkills, 23);
  assert.equal(g.build.skills[0].level, 1);
  player.allSkills += 2; tick();          // 換裝：遊戲以差額增減
  assert.equal(player.allSkills, 25);
  settings.cheat.maxSkills = false; tick();
  assert.equal(player.allSkills, 5);
  settings.cheat.maxSkills = true; g.world.player = { allSkills: 1 }; tick(); // 新的一局
  assert.equal(g.world.player.allSkills, 21);
}

// 驗證「致命一擊／一擊必殺／掉寶」子開關：開→改值、關→還原、遊戲自行改過的值不覆蓋、新的一局不沿用舊紀錄、全部還原。
{
  const source = require("node:fs").readFileSync(path.join(__dirname, "..", "autobot.js"), "utf8").replace(/\r\n/g, "\n");
  const helpers = source.slice(source.indexOf("  // 子開關還原紀錄"), source.indexOf("  // 遊戲修改：無敵、致命攻擊"));
  const block = source.slice(source.indexOf("\n    const p = g.world?.player;\n    if (!p) {") + 1, source.indexOf("    // 4. 技能加成"));
  const build = () => new Function("settings", "g", "let goldOverride = null;" + "const ALL_SKILLS_BONUS = 20;" + helpers + "return { tick: () => {" + block + "}, restoreAllCheats };");
  const mk = () => ({ criticalStrike: 5, deadlyStrike: 1, passiveLevels: { criticalStrike: 3 }, might: 3, weaponDamage: 4, mastery: { physical: 2, fire: 1 }, damageMult: 1, fireDamageMult: 1, magicFind: 10, uniqueBoost: 1, rareBoost: 1, setBoost: 1 });
  const mkSettings = () => ({ cheat: { maxCrit: true, oneHitKill: true, maxDropRate: true } });
  // A. 開→改值；單獨關閉各子開關→只還原該開關的欄位；遊戲中途改過的值不被覆蓋
  {
    const settings = mkSettings();
    const player = mk();
    const { tick } = build()(settings, { world: { player } });
    tick(); tick();
    assert.equal(player.criticalStrike, 100); assert.equal(player.deadlyStrike, 100); assert.equal(player.passiveLevels.criticalStrike, 99);
    assert.equal(player.might, 100); assert.equal(player.weaponDamage, 100); assert.equal(player.mastery.physical, 100); assert.equal(player.mastery.fire, 100); assert.equal(player.damageMult, 100);
    assert.equal(player.magicFind, 999999); assert.equal(player.uniqueBoost, 9999); assert.equal(player.rareBoost, 9999); assert.equal(player.setBoost, 9999);
    settings.cheat.maxCrit = false; tick();
    assert.equal(player.criticalStrike, 5); assert.equal(player.deadlyStrike, 1); assert.equal(player.passiveLevels.criticalStrike, 3);
    assert.equal(player.might, 100, "關致命不應還原一擊必殺的欄位");
    player.might = 42; player.magicFind = 77;   // 遊戲中途自行改值
    settings.cheat.oneHitKill = false; tick();
    assert.equal(player.might, 42, "遊戲自行改過的值不得被蓋回");
    assert.equal(player.weaponDamage, 4); assert.equal(player.mastery.fire, 1); assert.equal(player.damageMult, 1);
    settings.cheat.maxDropRate = false; tick();
    assert.equal(player.magicFind, 77, "遊戲自行改過的值不得被蓋回");
    assert.equal(player.uniqueBoost, 1); assert.equal(player.setBoost, 1);
  }
  // B. 全部還原（對應「全部關閉」與 destroy）
  {
    const settings = mkSettings();
    const player = mk();
    const { tick, restoreAllCheats } = build()(settings, { world: { player } });
    tick(); restoreAllCheats();
    assert.deepEqual(player, mk());
  }
  // C. 新的一局（玩家物件換了）丟掉舊紀錄；原值以新物件目前的值為準
  {
    const settings = mkSettings();
    const first = mk(), second = mk();
    const g = { world: { player: first } };
    const { tick } = build()(settings, g);
    tick();
    g.world.player = second; tick();
    settings.cheat.maxCrit = false; tick();
    assert.equal(second.criticalStrike, 5); assert.equal(second.passiveLevels.criticalStrike, 3);
    assert.equal(second.might, 100);
    assert.deepEqual(first, mk());
    g.world.player = null; settings.cheat.oneHitKill = false; tick();
    assert.equal(second.might, 3);
  }
  // D. 原本是繼承來的屬性：還原時刪除自己寫入的自有屬性，回到繼承值
  {
    const settings = { cheat: { maxDropRate: true } };
    const inherited = Object.create({ magicFind: 7 });
    const { tick } = build()(settings, { world: { player: inherited } });
    tick();
    assert.equal(inherited.magicFind, 999999); assert.ok(Object.hasOwn(inherited, "magicFind"));
    settings.cheat.maxDropRate = false; tick();
    assert.equal(inherited.magicFind, 7); assert.equal(Object.hasOwn(inherited, "magicFind"), false);
  }
  console.log("致命一擊／一擊必殺／掉寶還原測試通過");
}

// 驗證「怪物數量／全精英／經驗值加成／無敵」開→關還原：直接載入 autobot.js 內 applyCheats 整段原始碼執行。
{
  const source = require("node:fs").readFileSync(path.join(__dirname, "..", "autobot.js"), "utf8");
  const region = source.slice(source.indexOf("  function restoreAllSkills() {"), source.indexOf("  // 原版選卡畫面可能讓遊戲迴圈完全停住"));
  const harnessFor = (settings) => new Function("settings", "document", "save", "refreshControls", "ALL_SKILLS_BONUS", "let goldOverride = null, allSkillsOverride = null, lastAction = \"\";" + region + "return { applyCheats, restoreAllCheats, get invinciblePlayer() { return invinciblePlayer; } };")(settings, { querySelector: () => null }, () => {}, () => {}, 20);
  const mkSettings = (cheat) => ({ cheat: { enabled: true, ...cheat } });
  // E. 怪物數量：開→改 world 密度與導演計數；關→還原；導演計數若已被遊戲消耗（不再等於本模組寫入值）則保留遊戲的值
  {
    const settings = mkSettings({ maxMonsterDensity: true });
    const world = { monsterDensity: 4, spawnRate: 2, enemies: [] };
    const director = { owed: 0, batchTimer: 5, waveDue: 0, waves: { done: false } };
    const h = harnessFor(settings); const g = { world, director, save: {} };
    h.applyCheats(g);
    assert.equal(world.monsterDensity, 999); assert.equal(world.spawnRate, 999); assert.equal(director.owed, 450); assert.equal(director.waveDue, 450);
    settings.cheat.maxMonsterDensity = false; h.applyCheats(g);
    assert.equal(world.monsterDensity, 4); assert.equal(world.spawnRate, 2);
    assert.equal(director.owed, 0); assert.equal(director.batchTimer, 5); assert.equal(director.waveDue, 0);
    settings.cheat.maxMonsterDensity = true; h.applyCheats(g);
    director.owed = 435; director.waveDue = 435;   // 遊戲消耗了一部分，仍高於原值 0
    settings.cheat.maxMonsterDensity = false; h.applyCheats(g);
    assert.equal(director.owed, 0, "關閉後待補數須降回原值，避免繼續補出大量怪物");
    assert.equal(director.waveDue, 0);
    assert.equal(world.monsterDensity, 4);
  }
  // F. 全精英：已生成的怪不還原（註解已說明），關閉後新的一般怪不再被改
  {
    const settings = mkSettings({ allElites: true });
    const normal = { rank: "normal", life: 10, maxLife: 10, speed: 2 };
    const world = { enemies: [normal] };
    const h = harnessFor(settings); const g = { world, director: null };
    h.applyCheats(g);
    assert.equal(normal.rank, "champion"); assert.equal(normal.elite, true); assert.equal(normal.life, 25);
    settings.cheat.allElites = false;
    const late = { rank: "normal", life: 1 }; world.enemies.push(late); h.applyCheats(g);
    assert.equal(normal.rank, "champion", "已生成的怪維持精英等級");
    assert.equal(late.rank, "normal", "關閉後不再套用");
  }
  // G. 經驗值加成：開→包裝；關→放回原函式；其他程式的包裝不覆蓋；總開關關／destroy 也要放回
  {
    const settings = mkSettings({ maxXp: true });
    const got = [];
    const orig = function (amount) { got.push(amount); return amount; };
    const g = { gainXp: orig, save: {} };
    const h = harnessFor(settings);
    h.applyCheats(g);
    assert.notEqual(g.gainXp, orig);
    assert.equal(g.gainXp(2), 2000); assert.deepEqual(got, [2000]);
    settings.cheat.maxXp = false; h.applyCheats(g);
    assert.equal(g.gainXp, orig, "子開關關閉時放回原函式");
    settings.cheat.maxXp = true; h.applyCheats(g);
    const ours = g.gainXp;
    const other = function (a, ...r) { return ours.call(this, a, ...r); };
    g.gainXp = other;   // 其他程式之後又包裝過
    settings.cheat.maxXp = false; h.applyCheats(g);
    assert.equal(g.gainXp, other, "目前值已不是自己的包裝時不得覆蓋");
    const g2 = { gainXp: orig }; const h2 = harnessFor(mkSettings({ maxXp: true }));
    h2.applyCheats(g2); assert.notEqual(g2.gainXp, orig);
    h2.restoreAllCheats(); assert.equal(g2.gainXp, orig, "全部關閉／destroy 要放回原函式");
    const g3 = { gainXp: orig }; const s3 = mkSettings({ maxXp: true }); const h3 = harnessFor(s3);
    h3.applyCheats(g3); s3.cheat.enabled = false; h3.applyCheats(g3);
    assert.equal(g3.gainXp, orig, "總開關關閉要放回原函式");
  }
  // H. 無敵：子開關關、總開關關、全部還原、換新的一局，都要把生命值還原為一般數值（可寫入）
  {
    const isPlain = (p) => { const d = Object.getOwnPropertyDescriptor(p, "life"); return "value" in d && d.writable === true; };
    const mk = () => ({ life: 100, maxLife: 100, damageTaken: 0 });
    const settings = mkSettings({ invincible: true });
    const h = harnessFor(settings);
    const p1 = mk(); const g = { world: { player: p1 } };
    h.applyCheats(g);
    p1.life = 10; assert.equal(p1.life, 100, "扣血應被攔截");
    assert.equal(h.invinciblePlayer, p1);
    settings.cheat.invincible = false; h.applyCheats(g);
    assert.ok(isPlain(p1), "子開關關閉要還原"); assert.equal(h.invinciblePlayer, null);
    p1.life = 10; assert.equal(p1.life, 10);
    settings.cheat.invincible = true; h.applyCheats(g); assert.ok(!isPlain(p1));
    settings.cheat.enabled = false; h.applyCheats(g); assert.ok(isPlain(p1), "總開關關閉要還原");
    settings.cheat.enabled = true; h.applyCheats(g); assert.ok(!isPlain(p1));
    h.restoreAllCheats(); assert.ok(isPlain(p1), "全部關閉／destroy 要還原");
    settings.cheat.invincible = true; h.applyCheats(g); assert.ok(!isPlain(p1));
    const p2 = mk(); g.world.player = p2; h.applyCheats(g);
    assert.ok(isPlain(p1), "換新的一局時舊玩家要還原"); assert.ok(!isPlain(p2));
  }
  {
    const settings = mkSettings({ invincible: true }); const h = harnessFor(settings);
    const p = { maxLife: 100, damageTaken: 2 }; Object.defineProperty(p, "life", { value: 50, writable: true, enumerable: false, configurable: true });
    const g = { world: { player: p } }; h.applyCheats(g); settings.cheat.invincible = false; h.applyCheats(g);
    assert.deepEqual(Object.getOwnPropertyDescriptor(p, "life"), { value: 100, writable: true, enumerable: false, configurable: true }); assert.equal(p.damageTaken, 2);
    const locked = { maxLife: 100, damageTaken: 3 }; Object.defineProperty(locked, "life", { value: 50, configurable: false });
    g.world.player = locked; settings.cheat.invincible = true; assert.doesNotThrow(() => h.applyCheats(g)); assert.equal(locked.damageTaken, 3);
    const getter = function () { return 42; }; const accessor = { maxLife: 0, damageTaken: 1 };
    Object.defineProperty(accessor, "life", { get: getter, configurable: true }); g.world.player = accessor; h.applyCheats(g); settings.cheat.invincible = false; h.applyCheats(g);
    assert.equal(Object.getOwnPropertyDescriptor(accessor, "life").get, getter);
  }
  {
    const settings = mkSettings({ maxMonsterDensity: true }); const h = harnessFor(settings);
    const first = { owed: 0, batchTimer: 5 }, second = { owed: 1, batchTimer: 6 }; const g = { world: {}, director: first };
    h.applyCheats(g); g.director = second; h.applyCheats(g); assert.equal(first.owed, 0); assert.equal(first.batchTimer, 5);
  }
  console.log("怪物數量／全精英／經驗值加成／無敵還原測試通過");
}
