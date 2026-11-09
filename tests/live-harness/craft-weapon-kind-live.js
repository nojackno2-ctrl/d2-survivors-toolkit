// 製作裝備逐步選單實機驗證（H_IN=editor：腳本在修改器 iframe 內執行）。
// 用法：H_IN=editor H_SEED=存檔.json electron tests/live-harness/craft-live.cjs tests/live-harness/craft-weapon-kind-live.js out.json
// 順序：裝備類型 → 品質 → 武器種類（僅武器）→ 底材；每一步選完才顯示下一步，且只列出有底材的選項。
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const d = document, w = window; w.confirm = () => true; w.alert = () => {};
for (let i = 0; i < 40 && !d.querySelector('nav button'); i++) await sleep(500);
const $ = (s) => d.querySelector(s);
const vis = (s) => !$(s).hidden;
const opts = (s) => [...$(s).options].map((o) => o.textContent);
const pick = async (s, v) => { $(s).value = v; $(s).dispatchEvent(new w.Event('change', { bubbles: true })); await sleep(700); };
await sleep(2000);
d.querySelector('nav button[data-page="craft"]').click();
await sleep(2500);
const out = {};
out.initial = { rar: vis('#xRar'), kind: vis('#xKind'), base: vis('#xBase') };
await pick('#xCategory', 'weapon');
out.afterCat = { rarOpts: opts('#xRar'), kind: vis('#xKind'), base: vis('#xBase') };
await pick('#xRar', 'rare');
out.afterRar = { kindOpts: opts('#xKind'), base: vis('#xBase') };
for (const k of [...$('#xKind').options].map((o) => o.value).filter((v) => v && v !== 'all')) {
  await pick('#xKind', k);
  out[`bases_${k}`] = opts('#xBase');
}
await pick('#xCategory', 'head');
out.headAfterCat = { rarOpts: opts('#xRar'), kind: vis('#xKind'), base: vis('#xBase') };
return out;
