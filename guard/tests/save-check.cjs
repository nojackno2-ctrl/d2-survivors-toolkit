// 存檔檢查與遊戲診斷純邏輯單元測試（Node，不依賴 DOM，動態 import guard/save-check.js）
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { pathToFileURL } = require("node:url");

(async () => {
  const modUrl = pathToFileURL(path.join(__dirname, "..", "save-check.js")).href;
  const {
    xpCap,
    flagChecks,
    attributeChecks,
    detect,
    buildDetails,
    parseDiag,
    gameSeesPage,
    DIAG_FACTS,
  } = await import(modUrl);

  // 0. 公式與官方快照一致：從 pack 模組原始碼取出 g=e=>Math.round(...) 與工具包 xpCap 比對 1～99 級
  const bundleAssets = path.join(__dirname, "..", "..", "game-bundles", "20261105.3", "assets");
  const packFile = fs.readdirSync(bundleAssets).find((f) => /^pack-.*\.js$/.test(f));
  assert.ok(packFile, "找不到官方快照的 pack 模組");
  const src = fs.readFileSync(path.join(bundleAssets, packFile), "utf8");
  const m = /,g=e=>(Math\.round\(\(5\+4\*\(e-1\)\*\*1\.35\)\*1\.1\*\*Math\.max\(0,e-25\)\*1\.1\*\*Math\.max\(0,e-90\+1\)\))/.exec(src);
  assert.ok(m, "官方經驗值公式不在預期位置，需重新核對");
  const official = new Function("e", "return " + m[1]);
  const mine = Array.from({ length: 99 }, (_, i) => xpCap(i + 1));
  for (let lv = 1; lv <= 99; lv++) {
    assert.equal(mine[lv - 1], official(lv), "經驗值公式不一致：等級 " + lv);
  }
  assert.equal(mine[98], 5865600, "99 級上限應為 5865600");
  assert.match(src, /u=\[`normal`,`nightmare`,`hell`\]/, "官方難度清單已變更");
  assert.match(src, /function _\(e\)\{return 5\*Math\.max\(0,e-1\)\+5\*u\.length\}var v=e=>_\(e\)\+20/, "官方點數旗標上限已變更");

  const hero = (level, xp, skills) => ({ sorceress: { kept: { run: { level, xp }, build: { level, skills } } } });

  // 1. 正常存檔：三項都通過
  const good = flagChecks({ heroes: hero(10, 5, [{ id: "fireBolt", level: 1 }]) }, "softcore");
  assert.ok(good.every((r) => r.ok), "正常存檔不應被判有問題：" + JSON.stringify(good));

  // 1b. 沒有角色資料：不可顯示「通過」，要標示未驗證
  const empty = flagChecks({ heroes: {} }, "softcore");
  assert.ok(
    empty.filter((r) => /未驗證/.test(r.text)).length === 2 && !empty.some((r) => /經驗值與等級相符|技能欄沒有重複/.test(r.text)),
    "沒有角色資料時應為未驗證：" + JSON.stringify(empty)
  );

  // 2. 經驗值超過上限：判有問題，修正後等於上限
  {
    const s = { heroes: hero(10, 99999999, []) };
    const list = flagChecks(s, "softcore");
    const x = list.find((r) => /經驗值/.test(r.text));
    assert.equal(x.ok, false, "超標經驗值應被判有問題");
    x.fix();
    const after = flagChecks(s, "softcore").find((r) => /經驗值/.test(r.text)).ok;
    assert.equal(after, true, "修正後應通過");
    assert.equal(s.heroes.sorceress.kept.run.xp, xpCap(10), "應設為該等級上限");
  }

  // 2b. 經驗值為負數：判有問題，修正後夾回 0
  {
    const s = { heroes: hero(5, -10, []) };
    const x = flagChecks(s, "softcore").find((r) => /經驗值/.test(r.text));
    assert.equal(x.ok, false, "負數經驗值應判有問題");
    x.fix();
    assert.equal(s.heroes.sorceress.kept.run.xp, 0, "負數經驗值修正後應為 0");
  }

  // 3. 99 級：經驗值等於上限（5865600）通過，超過才判有問題
  {
    const l99 = flagChecks({ heroes: hero(99, 5865600, []) }, "softcore");
    assert.ok(l99.find((r) => /經驗值/.test(r.text)).ok, "99 級經驗值等於上限應通過");
    const l99bad = flagChecks({ heroes: hero(99, 999999999, []) }, "softcore");
    assert.equal(l99bad.find((r) => /經驗值/.test(r.text)).ok, false, "99 級經驗值遠超上限應判有問題");
  }

  // 4. 技能重複：判有問題，修正後只剩一個
  {
    const s = { heroes: hero(10, 0, [{ id: "fireBolt", level: 1 }, { id: "fireBolt", level: 2 }, { id: "frostNova", level: 1 }]) };
    const x = flagChecks(s, "softcore").find((r) => /重複/.test(r.text));
    assert.equal(x.ok, false, "重複技能應判有問題");
    x.fix();
    assert.deepEqual(
      s.heroes.sorceress.kept.build.skills.map((k) => k.id),
      ["fireBolt", "frostNova"]
    );
    assert.equal(flagChecks(s, "softcore").find((r) => /技能欄/.test(r.text)).ok, true);
  }

  // 5. 存檔模式與儲存槽：一般槽帶 mode:'hc' 有問題；硬核槽缺 mode 有問題；相符時通過；修正後通過
  {
    const pick = (s, mode) => flagChecks(s, mode).find((r) => /存檔模式|硬核存檔|一般存檔/.test(r.text));
    const a = { mode: "hc" }, b = {}, c = { mode: "hc" }, d = {};
    const ra = pick(a, "softcore"), rb = pick(b, "hardcore"), rc = pick(c, "hardcore"), rd = pick(d, "softcore");
    assert.deepEqual([ra.ok, rb.ok, rc.ok, rd.ok], [false, false, true, true]);
    ra.fix();
    rb.fix();
    assert.equal(pick(a, "softcore").ok, true);
    assert.equal(pick(b, "hardcore").ok, true);
    assert.equal(a.mode, undefined);
    assert.equal(b.mode, "hc");
  }

  // 6. attributeChecks 與 detect／buildDetails 純邏輯檢查
  {
    const noHero = attributeChecks({});
    assert.equal(noHero[0].unknown, true);
    const s = { gold: 2e10, leaderboard: { edited: true } };
    const list = detect(s, { mode: "softcore", seal: "broken", gameSaveFaults: ["gold exceeds limit"] });
    const details = buildDetails(s, list, { gameSaveFaults: ["gold exceeds limit"] });
    assert.equal(details.edited, true);
    assert.ok(details.rows.some((r) => r.what.includes("超過 100 億上限")));
    assert.ok(details.rows.some((r) => r.what.includes("遊戲判定：gold exceeds limit")));
  }

  // 真實存檔的兩職業：恰西四項各 50，法師花 505 點，聖騎士花 490 點並選三張屬性卡。
  {
    const state = (history, attributes) => ({ run: { level: 99 }, build: { level: 99, history, attributes } });
    const sorc = state(Array(505).fill("point:energy"), { strength: 50, dexterity: 50, vitality: 50, energy: 555 });
    const pala = state([...Array(490).fill("point:strength"), "attribute:dexterity", "attribute:strength", "attribute:dexterity"], { strength: 545, dexterity: 60, vitality: 50, energy: 50 });
    const s = { heroes: { sorceress: { kept: sorc, run: structuredClone(sorc) }, paladin: { tomes: 3, kept: pala, run: structuredClone(pala) } } };
    assert.ok(attributeChecks(s).every((x) => x.ok && x.text.includes("505 / 525")));
    s.heroes.sorceress.kept.build.unspent = 20;
    assert.equal(attributeChecks(s)[0].ok, true, "等於遊戲上限應通過");
    s.heroes.sorceress.kept.build.unspent = 21;
    assert.equal(attributeChecks(s)[0].ok, false, "超過遊戲上限應標記");
    s.heroes.sorceress.kept.build.unspent = 10000;
    assert.equal(attributeChecks(s)[0].ok, false, "大量未分配點數應標記");
  }

  // 7. 診斷解析與欄位表
  {
    assert.ok(DIAG_FACTS.page && DIAG_FACTS["leaderboard queue"]);
    const parsed = parseDiag("build: 20261105.3\npage: replaced Storage.setItem\nleaderboard queue: 1 refused (gear)\n[ignored line]");
    assert.equal(parsed.build, "20261105.3");
    assert.equal(parsed.page, "replaced Storage.setItem");
    assert.equal(parsed["leaderboard queue"], "1 refused (gear)");
    const fakeWin = { __D2ZH: true, __D2ZH_VERSION: "1.0", Storage: { prototype: { setItem: function custom() {} } } };
    const seen = gameSeesPage(fakeWin);
    assert.equal(seen.zh, true);
    assert.ok(seen.replaced.includes("Storage.setItem"));
    assert.match(seen.text, /d2_zh\.js/);
  }

  console.log("存檔檢查純邏輯模組（guard/save-check.js）Node 測試通過");
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
