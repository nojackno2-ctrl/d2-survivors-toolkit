// 比較框排版純函式測試：從 lang.js 抽出 planTipLayout 直接執行（不需瀏覽器）
const assert = require("assert");
const fs = require("fs");
const path = require("path");

const src = fs.readFileSync(path.join(__dirname, "..", "lang.js"), "utf8");
const start = src.indexOf("function planTipLayout(");
assert.ok(start >= 0, "找不到 planTipLayout");
let depth = 0, end = -1;
for (let i = src.indexOf(") {", start) + 2; i < src.length; i++) {
  if (src[i] === "{") depth++;
  else if (src[i] === "}") { depth--; if (depth === 0) { end = i + 1; break; } }
}
const planTipLayout = new Function(`return (${src.slice(start, end)});`)();

const base = { vw: 390, top: 8, bottom: 700, base: 1, gap: 6, margin: 8 };

// 1. 單一框、夠大：維持原縮放、置中、top 相同
{
  const p = planTipLayout({ ...base, boxes: [{ w: 200, h: 400 }] });
  assert.strictEqual(p.scale, 1);
  assert.strictEqual(p.top, 8);
  assert.strictEqual(p.lefts[0], (390 - 200) / 2);
}

// 2. 兩框並列：水平不重疊、top 相同、總寬不超過畫面
{
  const boxes = [{ w: 180, h: 500 }, { w: 170, h: 300 }];
  const p = planTipLayout({ ...base, boxes });
  assert.ok(p.lefts[1] >= p.lefts[0] + boxes[0].w * p.scale, "兩框水平重疊");
  const right = p.lefts[1] + boxes[1].w * p.scale;
  assert.ok(p.lefts[0] >= 0 && right <= 390, "超出畫面左右");
}

// 3. 高度超過可用範圍：縮小，且縮放後不超過 bottom
{
  const boxes = [{ w: 200, h: 1500 }];
  const p = planTipLayout({ ...base, boxes });
  assert.ok(p.scale < 1, "應縮小");
  assert.ok(p.top + boxes[0].h * p.scale <= 700 + 1e-9, "超出按鈕上緣");
}

// 4. 寬度過寬：縮到能放進畫面，並列仍不重疊
{
  const boxes = [{ w: 300, h: 200 }, { w: 300, h: 200 }];
  const p = planTipLayout({ ...base, boxes });
  const total = 300 * p.scale * 2 + 6;
  assert.ok(total <= 390 - 16 + 1e-9, "總寬超出");
  assert.ok(p.lefts[1] >= p.lefts[0] + 300 * p.scale);
}

// 5. 空清單不拋錯
{
  const p = planTipLayout({ ...base, boxes: [] });
  assert.deepStrictEqual(p.lefts, []);
}

// 6. 縮放不因 base 改變而超出（base 0.8）
{
  const p = planTipLayout({ ...base, base: 0.8, boxes: [{ w: 200, h: 300 }] });
  assert.strictEqual(p.scale, 0.8);
}

console.log("test_tip_layout: 全部通過");
