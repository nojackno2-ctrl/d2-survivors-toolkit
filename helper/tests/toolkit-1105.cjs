const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const root = path.resolve(__dirname, "..");
const autobot = fs.readFileSync(path.join(root, "autobot.js"), "utf8");
const forge = fs.readFileSync(path.join(root, "autoforge-ui.js"), "utf8");
function extract(source, pattern, label) {
  const match = source.match(pattern);
  assert.ok(match, "擷取失敗：" + label);
  return match[0];
}
const acceptsSource = extract(autobot, /function accepts\(drop\)\s*\{[\s\S]*?\n  \}/, "accepts 函式");
const eligibleSource = extract(forge, /const eligible\s*=\s*\(it\)\s*=>[^;]+;/, "eligible 定義");
function checkLoot(source, decision, expected) {
  const accepts = new Function("game", "questOn", "PANDEMONIUM_BASES", "WIRT_LEG", "cowWanted", source + "; return accepts;")(
    { loot: () => decision }, () => false, [], "Wirt's Leg", () => false
  );
  assert.equal(accepts({ kind: "item", item: { type: "weapon", rarity: "normal", mods: [] } }), expected, "撿寶判斷：" + decision);
}
for (const [decision, expected] of [["hidesell", true], ["sell", true], ["pick", true], ["hide", false], ["keep", false]]) {
  checkLoot(acceptsSource, decision, expected);
  console.log("通過：撿寶 " + decision + " → " + expected);
}
const AFmod = require("../autoforge.js");
const eligible = new Function("AF", eligibleSource + "; return eligible;")(() => AFmod);
for (const rarity of ["normal", "magic", "rare", "unique", "set", "runeword"]) {
  const expected = rarity !== "magic"; // 原版：只有魔法不可淬鍊
  assert.equal(eligible({ type: "armor", rarity, mods: [{ stat: "fireResist", value: 10 }] }), expected, "可淬鍊判斷：" + rarity);
  console.log("通過：可淬鍊 " + rarity + " → " + expected);
}
for (const rarity of ["unique", "set", "runeword", "rare"]) {
  assert.equal(eligible({ type: "armor", rarity, mods: [] }), false, "空屬性不可淬鍊：" + rarity);
}
for (const type of ["charm", "jewel", "essence", "quest"]) assert.equal(eligible({ type, rarity: "unique", mods: [{ stat: "fireResist", value: 10 }] }), false, "類型不可淬鍊：" + type);
console.log("通過：空屬性、咒符／珠寶／精華／任務物品不可淬鍊");
// 結構檢查：確認兩處售出條件先檢查 eligible，再檢查 hellforgeFailed。
for (const name of ["it", "item"]) {
  const condition = new RegExp("if\\s*\\(\\s*eligible\\(\\s*" + name + "\\s*\\)\\s*&&\\s*AF\\(\\)\\.hellforgeFailed\\(\\s*" + name + "\\.forge\\s*\\)[^\\n]*\\)\\s*\\{[^\\n]*sellItem\\(");
  assert.match(forge, condition, "找不到售出條件或順序錯誤：" + name);
  console.log("通過：售出條件結構 " + name);
}
const oldSource = acceptsSource.replace(/\s*\|\|\s*decision\s*===\s*"hidesell"/, "");
assert.notEqual(oldSource, acceptsSource, "舊版對照建立失敗：找不到 hidesell 條件");
assert.throws(() => checkLoot(oldSource, "hidesell", true), assert.AssertionError, "舊版 hidesell 應使相同斷言失敗");
console.log("通過：舊版對照的 hidesell 斷言如預期失敗");
