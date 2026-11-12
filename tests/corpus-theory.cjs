#!/usr/bin/env node
// 品質擲值的理論模型；語料比較仍受底材及產生後處理影響。
const fs = require('fs');
const path = require('path');
const readline = require('readline');

const qualities = ['unique', 'runeword', 'set', 'rare', 'magic', 'normal'];
const ratios = {
  normal: { unique: [400, 1, 6400], set: [160, 2, 5600], rare: [100, 2, 3200], magic: [34, 3, 192] },
  class: { unique: [240, 3, 6400], set: [120, 3, 5600], rare: [80, 3, 3200], magic: [17, 6, 192] },
};
const sources = {
  horde: { unique: 1, rare: 3, minimum: 'magic' },
  champion: { unique: 1024 / 224, rare: 1024 / 224, minimum: 'magic' },
  superUnique: { unique: 8, rare: 1024 / 224, minimum: 'magic' },
  actBoss: { unique: 1024 / 41, rare: 1, minimum: 'rare' },
};

function probabilities({ qlvl, ilvl, mf, boost, rareBoost = 1, classSpecific, difficulty, minimum = 'normal', runeword = true }) {
  const table = ratios[classSpecific ? 'class' : 'normal'];
  const effectiveMf = (k) => k === undefined ? Math.max(0, mf) : Math.floor(Math.max(0, mf) * k / (Math.max(0, mf) + k));
  const denominator = (ratio, k, b) => {
    const [value, divisor, min] = ratio;
    const a = (value - Math.trunc((ilvl - qlvl) / divisor)) * 128;
    const base = Math.max(min, Math.floor(a * 100 / (100 + effectiveMf(k))));
    return base - Math.floor(base * Math.round(1024 - 1024 / b) / 1024);
  };
  const u = boost * (difficulty === 'hell' ? 1.5 : 1);
  const ds = {
    unique: u > 0 ? denominator(table.unique, 250, u) : Infinity,
    runeword: u > 0 && runeword ? denominator(table.unique, 250, u * 0.25) : Infinity,
    set: u > 0 ? denominator(table.set, 500, u * 0.2) : Infinity,
    rare: denominator(table.rare, 600, rareBoost),
    magic: denominator(table.magic, undefined, 1),
  };
  const result = Object.fromEntries(qualities.map((q) => [q, 0]));
  let remaining = 1;
  for (const q of qualities.slice(0, -1)) {
    const d = ds[q];
    // D 非正數時，random 在 [0, 1) 的整個範圍皆符合。
    const chance = d === Infinity ? 0 : d <= 128 ? 1 : 128 / d;
    result[q] = remaining * chance;
    remaining *= 1 - chance;
  }
  result.normal = remaining;
  const minIndex = qualities.indexOf(minimum);
  for (let i = minIndex + 1; i < qualities.length; i++) {
    result[minimum] += result[qualities[i]];
    result[qualities[i]] = 0;
  }
  return { result, ds };
}

async function main() {
  const options = { qlvl: 50, ilvl: 85, mf: 100, boost: 1, classSpecific: false, difficulty: 'normal', corpus: null };
  const args = process.argv.slice(2);
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--help') {
      console.log('用法：node tests/corpus-theory.cjs [--qlvl 50] [--ilvl 85] [--mf 100] [--boost 1] [--class-specific] [--difficulty normal|nightmare|hell] [--corpus [檔案或目錄]]');
      return;
    }
    if (arg === '--class-specific') { options.classSpecific = true; continue; }
    if (arg === '--corpus') { options.corpus = args[i + 1] && !args[i + 1].startsWith('--') ? args[++i] : 'backups/corpus'; continue; }
    const key = arg.slice(2);
    if (!arg.startsWith('--') || !['qlvl', 'ilvl', 'mf', 'boost', 'difficulty'].includes(key) || !args[i + 1] || args[i + 1].startsWith('--')) throw new Error(`無效參數：${arg}`);
    options[key] = key === 'difficulty' ? args[++i] : Number(args[++i]);
  }
  if (['qlvl', 'ilvl', 'mf', 'boost'].some((k) => !Number.isFinite(options[k])) || options.qlvl < 0 || options.ilvl < 0 || options.boost < 0 || !['normal', 'nightmare', 'hell'].includes(options.difficulty)) throw new Error('數值或難度無效');
  const model = probabilities(options);
  console.log(`理論品質機率：qlvl=${options.qlvl} ilvl=${options.ilvl} MF=${options.mf} boost=${options.boost} 職業底材=${options.classSpecific} 難度=${options.difficulty}`);
  for (const q of qualities) console.log(`${q.padEnd(8)} ${(model.result[q] * 100).toFixed(4)}%`);
  console.log('假設符文之語已啟用；此為品質擲值，不包含候選不足時的回退。');
  if (!options.corpus) return;
  const target = path.resolve(options.corpus);
  const files = fs.statSync(target).isDirectory() ? fs.readdirSync(target).filter((f) => f.endsWith('.ndjson')).sort().map((f) => path.join(target, f)) : [target];
  if (!files.length) throw new Error('找不到 NDJSON 語料');
  const expected = Object.fromEntries(qualities.map((q) => [q, 0]));
  const actual = Object.fromEntries(qualities.map((q) => [q, 0]));
  let count = 0, skipped = 0;
  for (const file of files) {
    let lineNo = 0;
    for await (const line of readline.createInterface({ input: fs.createReadStream(file), crlfDelay: Infinity })) {
      lineNo++;
      if (!line.trim()) continue;
      let row;
      try { row = JSON.parse(line); } catch { throw new Error(`${file}:${lineNo} JSON 格式錯誤`); }
      const ctx = row.ctx || {}, source = sources[ctx.source], rarity = row.item?.rarity;
      if (!source || !qualities.includes(rarity) || !['normal', 'nightmare', 'hell'].includes(ctx.difficulty) || !Number.isFinite(ctx.ilvl) || !Number.isFinite(ctx.mf)) { skipped++; continue; }
      const p = probabilities({ ...options, ilvl: ctx.ilvl, mf: ctx.mf, difficulty: ctx.difficulty, boost: source.unique, rareBoost: source.rare, minimum: source.minimum }).result;
      for (const q of qualities) expected[q] += p[q];
      actual[rarity]++;
      count++;
    }
  }
  console.log(`\n語料比較：${count} 件，略過 ${skipped} 件，${files.length} 個檔案`);
  console.log('品質          期望       實際');
  for (const q of qualities) console.log(`${q.padEnd(8)} ${expected[q].toFixed(2).padStart(10)} ${String(actual[q]).padStart(10)}`);
  console.log('限制：無法由 item.base 取得每件底材的 qlvl 或職業屬性，均使用指定代表值；已按來源套用最低品質與加成。');
  console.log('實際品質可能因候選不足回退、特殊底材、符文之語開關、資料覆寫或語料去重而偏離。');
}

main().catch((error) => { console.error(`錯誤：${error.message}`); process.exitCode = 1; });
