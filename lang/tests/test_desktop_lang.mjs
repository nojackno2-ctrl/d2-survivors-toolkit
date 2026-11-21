import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { apply, restore, sha256File, status } from "../desktop-lang-core.mjs";

const TESTS_DIR = path.dirname(fileURLToPath(import.meta.url));
const LANG_DIR = path.resolve(TESTS_DIR, "..");
const require = createRequire(path.join(LANG_DIR, "..", "editor", "package.json"));
const asar = require("@electron/asar");

console.log("=== 開始執行桌面版中文化測試 ===");

// Test 1: 字典涵蓋率與基本結構
{
  console.log("Test 1: zh-TW.json 字典基本檢查");
  const zh = JSON.parse(fs.readFileSync(path.join(LANG_DIR, "zh-TW.json"), "utf8"));
  const keys = Object.keys(zh);
  assert.ok(keys.length >= 14000, `字典筆數應 >= 14000，實際 ${keys.length}`);
  assert.equal(zh["Play"], "進行遊戲");
  console.log(`  -> 通過（共 ${keys.length} 筆）`);
}

const LANG_JS = "var D=[[T,`kodia.woff2`],[E,`irisl.woff2`]];x=new FontFace(n,u,{unicodeRange:`U+1100-11FF, U+3130-318F, U+AC00-D7A3`});class Z{translateMagic(e,t){return[a(i),a(r),this.translateAs(`item`,t)].filter(Boolean).join(` `)}}";
const FOREIGN_FN =
  "function M_(e){let t=e.charCodeAt(0);return t>=44032&&t<=55203||t>=12592&&t<=12687||t>=4352&&t<=4607}";

// 建立小型假 asar 的輔助函式
async function createFakeGame(
  koContent = 'var e={"Play":"플레이","Options":"설정","UntranslatedKey":"미번역"};export{e as default};',
  saveTransferContent = `var a=1;${FOREIGN_FN}var R=null;`
) {
  const gameDir = fs.mkdtempSync(path.join(os.tmpdir(), "d2lang-test-game-"));
  const resDir = path.join(gameDir, "resources");
  const srcDir = path.join(gameDir, "_src");
  const assetsDir = path.join(srcDir, "desktop", "dist", "web", "assets");
  fs.mkdirSync(resDir, { recursive: true });
  fs.mkdirSync(assetsDir, { recursive: true });
  fs.writeFileSync(path.join(assetsDir, "ko-TEST1234.js"), koContent, "utf8");
  if (saveTransferContent !== null) {
    fs.writeFileSync(path.join(assetsDir, "saveTransfer-TEST1234.js"), saveTransferContent, "utf8");
  }
  if (saveTransferContent !== null) fs.writeFileSync(path.join(assetsDir, "lang-TEST1234.js"), LANG_JS, "utf8");
  const asarPath = path.join(resDir, "app.asar");
  await asar.createPackage(srcDir, asarPath);
  fs.rmSync(srcDir, { recursive: true, force: true });
  return { gameDir, asarPath };
}

const readAsar = (asarPath, name) => {
  asar.uncacheAll(); // @electron/asar 以路徑快取檔頭，asar 被覆寫後需清除
  return asar.extractFile(asarPath, path.join("desktop", "dist", "web", "assets", name)).toString("utf8");
};

// Test 2: apply -> status -> 重複 apply -> restore -> status 雜湊往返
{
  console.log("Test 2: apply -> status -> 重複 apply -> restore -> status 雜湊往返");
  const { gameDir, asarPath } = await createFakeGame();
  try {
    const origHash = sha256File(asarPath);
    assert.equal(status({ gameDir }).status, "original");

    const res1 = await apply({ gameDir, d2rDir: "", d2sLangBefore: "en" });
    assert.equal(res1.ok, true);
    assert.equal(res1.origHash, origHash);
    assert.equal(res1.replacedCount, 2);
    assert.equal(res1.totalCount, 3);
    assert.ok(res1.addedCount > 400, `應追加 ko 包沒有的鍵，實際 ${res1.addedCount}`);
    assert.deepEqual(res1.d2sLangAction, { set: "ko" });

    const st1 = status({ gameDir });
    assert.equal(st1.status, "patched");
    assert.equal(st1.label, "中文版");
    assert.equal(st1.d2sLangBefore, "en");

    // 確認已替換為繁體中文
    const koAfter = asar.extractFile(asarPath, path.join("desktop", "dist", "web", "assets", "ko-TEST1234.js")).toString("utf8");
    assert.ok(koAfter.includes("進行遊戲"), "應包含繁中翻譯");
    assert.ok(koAfter.includes("미번역"), "字典沒有的鍵應保留原值");

    // 已是中文版時重複 apply，應從備份重做且保留 origHash 與 d2sLangBefore
    const res2 = await apply({ gameDir, d2rDir: "" });
    assert.equal(res2.origHash, origHash);
    assert.equal(status({ gameDir }).d2sLangBefore, "en");

    // restore 還原回原版
    const rst = restore({ gameDir });
    assert.equal(rst.ok, true);
    assert.equal(rst.restored, true);
    assert.equal(rst.origHash, origHash);
    assert.deepEqual(rst.d2sLangAction, { set: "en" });
    assert.equal(sha256File(asarPath), origHash);
    assert.equal(status({ gameDir }).status, "original");
    assert.equal(fs.existsSync(`${asarPath}.d2lang-orig`), false);
    assert.equal(fs.existsSync(`${asarPath}.d2lang.json`), false);
    console.log("  -> 通過");
  } finally {
    fs.rmSync(gameDir, { recursive: true, force: true });
  }
}

// Test 3: 防降版情境（官方更新覆蓋 app.asar 後 restore 不放回舊備份）
{
  console.log("Test 3: 防降版情境（官方更新覆蓋後 restore 不放回舊備份）");
  const { gameDir, asarPath } = await createFakeGame();
  try {
    await apply({ gameDir, d2rDir: "" });
    assert.equal(status({ gameDir }).status, "patched");

    // 模擬官方更新覆蓋 app.asar
    fs.writeFileSync(asarPath, "official-updated-asar-binary", "utf8");
    const updatedHash = sha256File(asarPath);

    const st = status({ gameDir });
    assert.equal(st.status, "updated");
    assert.equal(st.label, "遊戲已更新");

    const rst = restore({ gameDir });
    assert.equal(rst.ok, true);
    assert.equal(rst.restored, false);
    assert.equal(rst.status, "updated");
    assert.equal(rst.reason, "game-updated");
    assert.deepEqual(rst.d2sLangAction, { delete: true });

    // 確認沒有放回舊備份，且備份記錄已清除
    assert.equal(sha256File(asarPath), updatedHash);
    assert.equal(fs.existsSync(`${asarPath}.d2lang-orig`), false);
    assert.equal(fs.existsSync(`${asarPath}.d2lang.json`), false);
    console.log("  -> 通過");
  } finally {
    fs.rmSync(gameDir, { recursive: true, force: true });
  }
}

// Test 4: 外文判斷函式修補、追加鍵、無剩餘韓文
{
  console.log("Test 4: 修補存在、追加鍵、ko 包無剩餘韓文值");
  const { gameDir, asarPath } = await createFakeGame(
    'var e={"Play":"플레이","Key of Terror: #":"공포의 열쇠: {0}"};export{e as default};'
  );
  try {
    const res = await apply({ gameDir, d2rDir: "" });
    assert.equal(res.replacedCount, res.totalCount, "全部替換");
    assert.equal(res.cjkPatch.file, "saveTransfer-TEST1234.js");
    assert.equal(res.magicJoinPatch.file, "lang-TEST1234.js");
    assert.ok(readAsar(asarPath, "lang-TEST1234.js").includes(".filter(Boolean).join(``)"), "魔法名稱應改為無空白串接");
    const st = readAsar(asarPath, "saveTransfer-TEST1234.js");
    assert.ok(st.includes(FOREIGN_FN.slice(0, -1) + "||t>=12288&&t<=12351||t>=19968&&t<=40959||t>=65280&&t<=65519}"));
    // 除修補處外，其餘程式碼不變
    assert.equal(
      st.replace("||t>=12288&&t<=12351||t>=19968&&t<=40959||t>=65280&&t<=65519", ""),
      `var a=1;${FOREIGN_FN}var R=null;`
    );
    const ko = readAsar(asarPath, "ko-TEST1234.js");
    assert.ok(!/[\uAC00-\uD7A3]/.test(ko), "ko 包不應剩餘韓文");
    assert.ok(ko.includes("恐懼之鑰：{0}"));
    assert.ok(ko.includes('"affix:Blanched":"白化"'), "應含 ko 包原本沒有的 affix: 鍵");
    // 函式名不同時仍可用結構定位
    restore({ gameDir });
    console.log("  -> 通過");
  } finally {
    fs.rmSync(gameDir, { recursive: true, force: true });
  }
}

// Test 5: 定位失敗（找不到／多處）時 apply 失敗，asar 未改動且不留備份
{
  console.log("Test 5: 外文判斷函式定位失敗時 apply 失敗且 asar 未改動");
  const cases = [
    ["找不到函式", `var a=1;`],
    ["沒有 saveTransfer 檔", null],
    ["多處符合", `${FOREIGN_FN}${FOREIGN_FN.replace("M_", "N_")}`],
  ];
  for (const [label, content] of cases) {
    const { gameDir, asarPath } = await createFakeGame(undefined, content);
    try {
      const before = sha256File(asarPath);
      await assert.rejects(apply({ gameDir, d2rDir: "" }), /外文判斷函式|saveTransfer/, label);
      assert.equal(sha256File(asarPath), before, `${label}：asar 不應被改動`);
      assert.equal(fs.existsSync(`${asarPath}.d2lang-orig`), false, `${label}：不應留下備份`);
      assert.equal(fs.existsSync(`${asarPath}.d2lang.json`), false, `${label}：不應留下記錄`);
      assert.equal(status({ gameDir }).status, "original");
    } finally {
      fs.rmSync(gameDir, { recursive: true, force: true });
    }
  }
  // 函式名與變數名不同仍可定位
  const { gameDir, asarPath } = await createFakeGame(
    undefined,
    "function Zq$(a){let b=a.charCodeAt(0);return b>=44032&&b<=55203||b>=12592&&b<=12687||b>=4352&&b<=4607}"
  );
  try {
    const res = await apply({ gameDir, d2rDir: "" });
    assert.equal(res.cjkPatch.fnName, "Zq$");
    assert.ok(readAsar(asarPath, "saveTransfer-TEST1234.js").includes("||b>=19968&&b<=40959"));
  } finally {
    fs.rmSync(gameDir, { recursive: true, force: true });
  }
  console.log("  -> 通過");
}

// Test 6（有安裝官方遊戲時）：對真實 app.asar 輸出到暫存檔，不動 Program Files
{
  const realAsar = path.join("C:\\Program Files\\D2 Survivors", "resources", "app.asar");
  if (fs.existsSync(realAsar)) {
    console.log("Test 6: 真實 app.asar 輸出到暫存檔（唯讀來源）");
    const out = path.join(os.tmpdir(), `d2lang-real-${process.pid}.asar`);
    const before = sha256File(realAsar);
    try {
      const res = await apply({ d2rDir: "", out });
      assert.equal(res.replacedCount, res.totalCount, `應全部替換，實際 ${res.replacedCount}/${res.totalCount}`);
      assert.equal(sha256File(realAsar), before, "來源 asar 不應被改動");
      const ko = readAsar(out, res.koFile);
      assert.ok(!/[\uAC00-\uD7A3]/.test(ko), "ko 包不應剩餘韓文");
      console.log(`  -> 通過（替換 ${res.replacedCount}/${res.totalCount}，追加 ${res.addedCount}，修補 ${res.cjkPatch.file} ${res.cjkPatch.fnName}()）`);
    } finally {
      fs.rmSync(out, { force: true });
    }
  } else {
    console.log("Test 6: 略過（未安裝官方遊戲）");
  }
}

console.log("=== 所有桌面版中文化測試均成功通過！ ===");
