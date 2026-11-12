#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const readline = require('readline');

async function processFile(filePath, stats) {
  return new Promise((resolve, reject) => {
    const fileStream = fs.createReadStream(filePath, { encoding: 'utf8' });
    const rl = readline.createInterface({
      input: fileStream,
      crlfDelay: Infinity,
    });

    fileStream.on('error', reject);
    rl.on('error', reject);

    rl.on('line', (line) => {
      const trimmed = line.trim();
      if (!trimmed) return;

      let record;
      try {
        record = JSON.parse(trimmed);
      } catch (err) {
        // 容忍最後一行不完整或格式異常
        stats.malformedLines++;
        return;
      }

      const ctx = record.ctx || {};
      const item = record.item || {};

      stats.totalItems++;

      // 1) 職業件數
      const cls = ctx.cls || 'unknown';
      stats.classCounts[cls] = (stats.classCounts[cls] || 0) + 1;

      // 2) 每職業與整體的品質數量
      const rarity = item.rarity || 'unknown';
      stats.overallRarity[rarity] = (stats.overallRarity[rarity] || 0) + 1;

      if (!stats.classRarity[cls]) {
        stats.classRarity[cls] = {};
      }
      stats.classRarity[cls][rarity] = (stats.classRarity[cls][rarity] || 0) + 1;

      // 3) 難度×品質、來源×品質
      const diff = ctx.difficulty || 'unknown';
      if (!stats.diffRarity[diff]) {
        stats.diffRarity[diff] = {};
      }
      stats.diffRarity[diff][rarity] = (stats.diffRarity[diff][rarity] || 0) + 1;

      const source = ctx.source || 'unknown';
      if (!stats.sourceRarity[source]) {
        stats.sourceRarity[source] = {};
      }
      stats.sourceRarity[source][rarity] = (stats.sourceRarity[source][rarity] || 0) + 1;

      // 4) 咒符（type==='charm'）、珠寶（type==='jewel'）、箭袋、戒指、項鍊各自件數
      // 5) 各裝備部位 type 分布
      const type = item.type || 'unknown';
      stats.typeCounts[type] = (stats.typeCounts[type] || 0) + 1;

      // 6) 魔法詞綴數、稀有詞綴數分布（以 mods 中非 implicit/auto/staff 項計）
      if (rarity === 'magic' || rarity === 'rare') {
        let affixesCount = 0;
        if (Array.isArray(item.mods)) {
          for (const mod of item.mods) {
            if (!mod) continue;
            if (mod.implicit || mod.auto || mod.staff) continue;
            affixesCount++;
          }
        }
        if (rarity === 'magic') {
          stats.magicAffixDist[affixesCount] = (stats.magicAffixDist[affixesCount] || 0) + 1;
        } else {
          stats.rareAffixDist[affixesCount] = (stats.rareAffixDist[affixesCount] || 0) + 1;
        }
      }

      // 7) 去重檢查（base+rarity+name+JSON(mods)+defense 重複數）
      const dedupKey = [
        item.base || '',
        item.rarity || '',
        item.name || '',
        JSON.stringify(item.mods || []),
        item.defense !== undefined ? String(item.defense) : ''
      ].join('||');

      const seenCount = stats.seenDedupe.get(dedupKey) || 0;
      stats.seenDedupe.set(dedupKey, seenCount + 1);
    });

    rl.on('close', () => {
      resolve();
    });
  });
}

function formatPercent(count, total) {
  if (!total) return '0.00%';
  return `${((count / total) * 100).toFixed(2)}%`;
}

function generateMarkdown(stats) {
  const lines = [];
  lines.push('# 語料庫統計報告 (Corpus Statistics)');
  lines.push('');
  lines.push(`- **統計時間**：${new Date().toISOString()}`);
  lines.push(`- **總裝備件數**：${stats.totalItems.toLocaleString()}`);
  if (stats.malformedLines > 0) {
    lines.push(`- **略過/不完整行數**：${stats.malformedLines.toLocaleString()}`);
  }
  lines.push('');

  // 1. 各職業件數
  lines.push('## 1. 各職業件數');
  lines.push('');
  lines.push('| 職業 (Class) | 件數 (Count) | 佔比 (Percentage) |');
  lines.push('| :--- | :--- | :--- |');
  const classes = Object.keys(stats.classCounts).sort((a, b) => stats.classCounts[b] - stats.classCounts[a]);
  for (const cls of classes) {
    const cnt = stats.classCounts[cls];
    lines.push(`| ${cls} | ${cnt.toLocaleString()} | ${formatPercent(cnt, stats.totalItems)} |`);
  }
  lines.push('');

  // 2. 品質數量與百分比（整體與各職業）
  lines.push('## 2. 品質分佈（整體與各職業）');
  lines.push('');
  const standardRarities = ['magic', 'rare', 'unique', 'set', 'runeword'];
  const allRarities = Array.from(new Set([...standardRarities, ...Object.keys(stats.overallRarity)]));

  lines.push('### 整體品質分佈');
  lines.push('');
  lines.push('| 品質 (Rarity) | 件數 (Count) | 佔比 (Percentage) |');
  lines.push('| :--- | :--- | :--- |');
  for (const r of allRarities) {
    const cnt = stats.overallRarity[r] || 0;
    lines.push(`| ${r} | ${cnt.toLocaleString()} | ${formatPercent(cnt, stats.totalItems)} |`);
  }
  lines.push('');

  lines.push('### 每職業品質分佈');
  lines.push('');
  const tableHeader = ['職業 (Class)', ...allRarities, '總計 (Total)'];
  lines.push(`| ${tableHeader.join(' | ')} |`);
  lines.push(`| ${tableHeader.map(() => ':---').join(' | ')} |`);

  for (const cls of classes) {
    const clsTotal = stats.classCounts[cls] || 0;
    const rMap = stats.classRarity[cls] || {};
    const cells = [cls];
    for (const r of allRarities) {
      const cnt = rMap[r] || 0;
      cells.push(`${cnt.toLocaleString()} (${formatPercent(cnt, clsTotal)})`);
    }
    cells.push(clsTotal.toLocaleString());
    lines.push(`| ${cells.join(' | ')} |`);
  }
  lines.push('');

  // 3. 難度×品質、來源×品質
  lines.push('## 3. 交叉分佈');
  lines.push('');
  lines.push('### 3.1 難度 × 品質 (Difficulty × Rarity)');
  lines.push('');
  const diffs = ['normal', 'nightmare', 'hell', ...Object.keys(stats.diffRarity).filter(d => !['normal', 'nightmare', 'hell'].includes(d))];
  const diffHeader = ['難度 (Difficulty)', ...allRarities, '小計 (Subtotal)'];
  lines.push(`| ${diffHeader.join(' | ')} |`);
  lines.push(`| ${diffHeader.map(() => ':---').join(' | ')} |`);
  for (const diff of diffs) {
    if (!stats.diffRarity[diff]) continue;
    const rMap = stats.diffRarity[diff];
    const subtotal = Object.values(rMap).reduce((a, b) => a + b, 0);
    const cells = [diff];
    for (const r of allRarities) {
      const cnt = rMap[r] || 0;
      cells.push(`${cnt.toLocaleString()} (${formatPercent(cnt, subtotal)})`);
    }
    cells.push(subtotal.toLocaleString());
    lines.push(`| ${cells.join(' | ')} |`);
  }
  lines.push('');

  lines.push('### 3.2 來源 × 品質 (Source × Rarity)');
  lines.push('');
  const sources = Object.keys(stats.sourceRarity).sort();
  const sourceHeader = ['來源 (Source)', ...allRarities, '小計 (Subtotal)'];
  lines.push(`| ${sourceHeader.join(' | ')} |`);
  lines.push(`| ${sourceHeader.map(() => ':---').join(' | ')} |`);
  for (const src of sources) {
    const rMap = stats.sourceRarity[src];
    const subtotal = Object.values(rMap).reduce((a, b) => a + b, 0);
    const cells = [src];
    for (const r of allRarities) {
      const cnt = rMap[r] || 0;
      cells.push(`${cnt.toLocaleString()} (${formatPercent(cnt, subtotal)})`);
    }
    cells.push(subtotal.toLocaleString());
    lines.push(`| ${cells.join(' | ')} |`);
  }
  lines.push('');

  // 4. 特殊品類統計 (charm, jewel, quiver, ring, amulet)
  lines.push('## 4. 特殊品類統計');
  lines.push('');
  lines.push('| 品類 (Category) | 匹配 Type | 件數 (Count) | 佔總體佔比 (Percentage) |');
  lines.push('| :--- | :--- | :--- | :--- |');
  const specialCats = [
    { name: '咒符 (Charm)', type: 'charm' },
    { name: '珠寶 (Jewel)', type: 'jewel' },
    { name: '箭袋 (Quiver)', type: 'quiver' },
    { name: '戒指 (Ring)', type: 'ring' },
    { name: '項鍊 (Amulet)', type: 'amulet' },
  ];
  for (const cat of specialCats) {
    const cnt = stats.typeCounts[cat.type] || 0;
    lines.push(`| ${cat.name} | \`${cat.type}\` | ${cnt.toLocaleString()} | ${formatPercent(cnt, stats.totalItems)} |`);
  }
  lines.push('');

  // 5. 各裝備部位 type 分布
  lines.push('## 5. 各裝備部位 (Type) 分布');
  lines.push('');
  lines.push('| 部位 (Type) | 件數 (Count) | 佔比 (Percentage) |');
  lines.push('| :--- | :--- | :--- |');
  const sortedTypes = Object.keys(stats.typeCounts).sort((a, b) => stats.typeCounts[b] - stats.typeCounts[a]);
  for (const t of sortedTypes) {
    const cnt = stats.typeCounts[t];
    lines.push(`| ${t} | ${cnt.toLocaleString()} | ${formatPercent(cnt, stats.totalItems)} |`);
  }
  lines.push('');

  // 6. 詞綴數分布
  lines.push('## 6. 魔法與稀有詞綴數分佈（非 implicit/auto/staff 詞綴）');
  lines.push('');
  lines.push('### 魔法裝備 (Magic) 詞綴數分佈');
  lines.push('');
  lines.push('| 詞綴數量 (Affix Count) | 件數 (Count) | 佔魔法裝備比例 |');
  lines.push('| :--- | :--- | :--- |');
  const totalMagic = stats.overallRarity['magic'] || 0;
  const magicAffixKeys = Object.keys(stats.magicAffixDist).map(Number).sort((a, b) => a - b);
  for (const k of magicAffixKeys) {
    const cnt = stats.magicAffixDist[k];
    lines.push(`| ${k} | ${cnt.toLocaleString()} | ${formatPercent(cnt, totalMagic)} |`);
  }
  lines.push('');

  lines.push('### 稀有裝備 (Rare) 詞綴數分佈');
  lines.push('');
  lines.push('| 詞綴數量 (Affix Count) | 件數 (Count) | 佔稀有裝備比例 |');
  lines.push('| :--- | :--- | :--- |');
  const totalRare = stats.overallRarity['rare'] || 0;
  const rareAffixKeys = Object.keys(stats.rareAffixDist).map(Number).sort((a, b) => a - b);
  for (const k of rareAffixKeys) {
    const cnt = stats.rareAffixDist[k];
    lines.push(`| ${k} | ${cnt.toLocaleString()} | ${formatPercent(cnt, totalRare)} |`);
  }
  lines.push('');

  // 7. 去重檢查
  lines.push('## 7. 去重檢查 (Deduplication Check)');
  lines.push('');
  const uniqueItemKeys = stats.seenDedupe.size;
  let duplicatedEntries = 0;
  let duplicateGroups = 0;
  for (const count of stats.seenDedupe.values()) {
    if (count > 1) {
      duplicateGroups++;
      duplicatedEntries += (count - 1);
    }
  }
  lines.push(`- **去重鍵定義**：\`base + rarity + name + JSON(mods) + defense\``);
  lines.push(`- **唯一裝備組合數**：${uniqueItemKeys.toLocaleString()}`);
  lines.push(`- **重複組合群數**：${duplicateGroups.toLocaleString()}`);
  lines.push(`- **多餘重複件數**：${duplicatedEntries.toLocaleString()} (${formatPercent(duplicatedEntries, stats.totalItems)})`);
  lines.push('');

  // 8. 職業品質充足度檢查與警告
  lines.push('## 8. 職業品質充足度檢查 (>= 50 件)');
  lines.push('');
  const requiredRarities = ['magic', 'rare', 'unique', 'set'];
  const warnings = [];

  lines.push('| 職業 (Class) | Magic (>=50) | Rare (>=50) | Unique (>=50) | Set (>=50) | 狀態 |');
  lines.push('| :--- | :--- | :--- | :--- | :--- | :--- |');

  for (const cls of classes) {
    const rMap = stats.classRarity[cls] || {};
    let clsOk = true;
    const checks = [];
    for (const reqR of requiredRarities) {
      const cnt = rMap[reqR] || 0;
      checks.push(`${cnt}`);
      if (cnt < 50) {
        clsOk = false;
        warnings.push(`- **警告**：職業 \`${cls}\` 的品質 \`${reqR}\` 僅有 ${cnt} 件，不足 50 件！`);
      }
    }
    const statusText = clsOk ? '✅ 充足' : '⚠️ 不足';
    lines.push(`| ${cls} | ${checks[0]} | ${checks[1]} | ${checks[2]} | ${checks[3]} | ${statusText} |`);
  }
  lines.push('');

  if (warnings.length > 0) {
    lines.push('### ⚠️ 充足度警告清單');
    lines.push('');
    lines.push(...warnings);
    lines.push('');
  } else {
    lines.push('✅ **所有職業之 magic/rare/unique/set 品質均達到至少 50 件標準。**');
    lines.push('');
  }

  return lines.join('\n');
}

async function main() {
  const corpusDir = path.resolve(__dirname, '..', 'backups', 'corpus');
  const outputMdPath = path.join(corpusDir, 'stats.md');

  if (!fs.existsSync(corpusDir)) {
    console.error(`錯誤：目錄不存在 ${corpusDir}`);
    process.exit(1);
  }

  const files = fs.readdirSync(corpusDir)
    .filter(f => f.endsWith('.ndjson'))
    .map(f => path.join(corpusDir, f));

  if (files.length === 0) {
    console.error(`警告：在 ${corpusDir} 中找不到任何 .ndjson 檔案。`);
    process.exit(0);
  }

  const stats = {
    totalItems: 0,
    malformedLines: 0,
    classCounts: {},
    overallRarity: {},
    classRarity: {},
    diffRarity: {},
    sourceRarity: {},
    typeCounts: {},
    magicAffixDist: {},
    rareAffixDist: {},
    seenDedupe: new Map(),
  };

  for (const file of files) {
    await processFile(file, stats);
  }

  const mdReport = generateMarkdown(stats);

  // 寫入 stdout
  process.stdout.write(mdReport + '\n');

  // 寫入 backups/corpus/stats.md
  fs.writeFileSync(outputMdPath, mdReport, 'utf8');
}

main().catch(err => {
  console.error('執行失敗：', err);
  process.exit(1);
});
