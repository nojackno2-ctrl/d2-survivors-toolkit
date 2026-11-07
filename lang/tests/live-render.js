// 由 tests/live-harness/craft-live.cjs 在官方遊戲頁執行，使用隔離設定檔。
const game = window.__d2autobot?.game;
if (!game?.hud?.d2 || !window.__d2lang?.debug().fontPatched) throw Error("遊戲字型尚未掛接");
const samples = [
  ["90% / max 90% / 95% in all", "90% / 上限 90% / 合計 95%"],
  ["0% / max 75%", "0% / 上限 75%"],
  ["24% of their time", "24%（原冷卻）"],
  ["+19, skills +20", "被動 +19 / 技能 +20"],
];
const translations = samples.map(([source, expected]) => {
  const actual = window.__d2lang.translate(source);
  if (actual !== expected) throw Error(`${source}：${actual}，預期 ${expected}`);
  return { source, actual };
});
const d2 = game.hud.d2;
const texts = ["抗性", "生命", "防禦", "上限", "藤擊技喚"];
const reference = new Map(texts.map(text => [text, d2.canvas(text, "font6", "gold").toDataURL()]));
const lines = Array.from({ length: 100 }, (_, i) => ({ heading: texts[i % texts.length] }));
const start = performance.now();
const page = d2.statPage({ title: "Defense", lines });
const durationMs = performance.now() - start;
const canvases = [...page.querySelectorAll(".stat-page-line canvas")];
const mismatches = canvases.flatMap(canvas => canvas.toDataURL() === reference.get(canvas.textContent) ? [] : [canvas.textContent]);
if (canvases.length !== lines.length || mismatches.length) throw Error(`畫布筆數 ${canvases.length}，不一致 ${mismatches.join("、")}`);
let checked = 0;
for (const font of ["font6", "font8", "font16"]) {
  for (const color of ["gold", "white", "blue"]) {
    for (const text of texts) {
      const expected = d2.canvas(text, font, color).toDataURL();
      const batch = Array.from({ length: 5 }, () => d2.canvas(text, font, color));
      if (batch.some(canvas => canvas.toDataURL() !== expected)) throw Error(`${font} ${color} ${text} 繪製不一致`);
      checked += batch.length;
    }
  }
}
const font = d2.ui.fonts.font6;
font.foreignFont();
const chineseSize = font.foreignSize;
await window.__d2lang.set("en");
font.foreignFont();
const englishSize = font.foreignSize;
if (englishSize !== font.__d2langBase || window.__d2lang.translate("Defense") !== "Defense") throw Error("切回英文後字型或翻譯未還原");
await window.__d2lang.set("zh-TW");
font.foreignFont();
if (font.foreignSize !== chineseSize) throw Error("切回中文後字級未還原");
return { translations, canvases: canvases.length, additionalCanvases: checked, durationMs: Math.round(durationMs), chineseSize, englishSize };
