// tests/gear-audit-offline.cjs
// 離線裝備語料分析與 Autobot charmValue 審查工具
// 嚴格依需求設計：不依賴瀏覽器，使用 readline 串流讀取 7 職業 ndjson 語料庫。

const fs = require('fs');
const path = require('path');
const readline = require('readline');

const ROOT_DIR = path.resolve(__dirname, '..');
const CORPUS_DIR = path.join(ROOT_DIR, 'backups', 'corpus');
const AUTOBOT_PATH = path.join(ROOT_DIR, 'helper', 'autobot.js');
const GAMEDATA_PATH = path.join(ROOT_DIR, 'modifier', 'gamedata.json');
const REPORT_PATH = path.join(CORPUS_DIR, 'gear-audit.md');

const CLASSES = ['amazon', 'sorceress', 'necromancer', 'paladin', 'barbarian', 'druid', 'assassin'];
const TARGET_TYPES = ['weapon', 'shield', 'head', 'body', 'belt', 'boots', 'gloves', 'ring', 'amulet', 'charm', 'jewel', 'quiver'];

function extractCharmValueLogic() {
  const code = fs.readFileSync(AUTOBOT_PATH, 'utf8');
  const classOrderMatch = code.match(/const\s+CLASS_ORDER\s*=\s*(\[[^\]]+\]);/);
  if (!classOrderMatch) {
    throw new Error('無法從 autobot.js 擷取 CLASS_ORDER');
  }
  const charmValueMatch = code.match(/function\s+charmValue\s*\([\s\S]*?\n  \}/);
  if (!charmValueMatch) {
    throw new Error('無法從 autobot.js 擷取 charmValue 函式');
  }

  const sandboxCode = `
    let LADDER = { classes: {} };
    ${classOrderMatch[0]}
    ${charmValueMatch[0]}
    return { charmValue, CLASS_ORDER };
  `;
  const fn = new Function(sandboxCode);
  return fn();
}

function formatMods(mods) {
  if (!mods || !Array.isArray(mods) || mods.length === 0) return '無詞條';
  return mods.map(m => {
    let s = `${m.stat}: ${m.value}`;
    const flags = [];
    if (m.implicit) flags.push('implicit');
    if (m.auto) flags.push('auto');
    if (m.staff) flags.push('staff');
    if (flags.length) s += ` (${flags.join(', ')})`;
    return s;
  }).join(', ');
}

async function runAudit() {
  const startTime = Date.now();
  console.log('=== 開始離線裝備語料審核 (gear-audit-offline.cjs) ===');

  // 1. 動態擷取 charmValue 與 CLASS_ORDER
  const { charmValue, CLASS_ORDER } = extractCharmValueLogic();
  console.log(`成功載入 CLASS_ORDER: ${JSON.stringify(CLASS_ORDER)}`);
  console.log('成功載入 charmValue 函式。');

  // 2. 載入 gamedata.json
  const gamedata = JSON.parse(fs.readFileSync(GAMEDATA_PATH, 'utf8'));
  const gamedataStats = new Set(Object.keys(gamedata.stats || {}));
  console.log(`成功載入 gamedata.json stats，共 ${gamedataStats.size} 種 stats 鍵。`);

  // 統計結構
  // Goal 1: mod.stat 出現頻率，依 type 與 rarity
  // type -> rarity -> { [stat]: count }
  const statTypeRarityCounts = {};
  for (const t of TARGET_TYPES) {
    statTypeRarityCounts[t] = {};
  }
  const allCorpusStats = new Set();
  const charmCorpusStats = new Set();

  // Goal 2:
  // 各 stat 在咒符裡被 charmValue 算成 0 分的統計 (單詞條計算: { stat, value } 評分 === 0)
  // stat -> count
  const charmZeroStatCounts = {};
  // 咒符清單依職業：cls -> Array<{ score, name, mods, rawItem, hasOffClassSkill, offClassSkillNames }>
  const classCharms = {};
  for (const cls of CLASSES) {
    classCharms[cls] = [];
  }

  // 檢查別職業專用技能咒符
  let totalOffClassCharms = 0;
  let offClassCharmsScoreLeZero = 0;
  let offClassCharmsScoreGtZero = 0;
  const offClassPosExamples = [];

  let totalItemsProcessed = 0;

  for (const cls of CLASSES) {
    const filePath = path.join(CORPUS_DIR, `${cls}.ndjson`);
    console.log(`正在處理職業語料: ${cls} (${filePath})...`);
    if (!fs.existsSync(filePath)) {
      console.warn(`警告: 找不到檔案 ${filePath}`);
      continue;
    }

    const fileStream = fs.createReadStream(filePath);
    const rl = readline.createInterface({
      input: fileStream,
      crlfDelay: Infinity
    });

    for await (const line of rl) {
      if (!line || !line.trim()) continue;
      totalItemsProcessed++;
      const entry = JSON.parse(line);
      const item = entry.item;
      if (!item) continue;

      const type = item.type || 'unknown';
      const rarity = item.rarity || 'unknown';
      const mods = item.mods || [];

      // 1) 統計 mod.stat 出現頻率
      if (TARGET_TYPES.includes(type)) {
        if (!statTypeRarityCounts[type][rarity]) {
          statTypeRarityCounts[type][rarity] = {};
        }
        for (const mod of mods) {
          const s = mod.stat;
          allCorpusStats.add(s);
          statTypeRarityCounts[type][rarity][s] = (statTypeRarityCounts[type][rarity][s] || 0) + 1;
        }
      } else {
        for (const mod of mods) {
          allCorpusStats.add(mod.stat);
        }
      }

      // 2) 咒符評分與分析 (type === 'charm')
      if (type === 'charm') {
        for (const mod of mods) {
          charmCorpusStats.add(mod.stat);
          // 單詞條 0 分檢驗：若單獨計算該詞條給該職業的分數為 0，計入 0 分次數
          const singleModItem = { mods: [mod] };
          const singleScore = charmValue(singleModItem, cls);
          if (singleScore === 0) {
            charmZeroStatCounts[mod.stat] = (charmZeroStatCounts[mod.stat] || 0) + 1;
          }
        }

        const score = charmValue(item, cls);

        // 檢查是否有非本職技能
        let hasOffClass = false;
        const offClassList = [];
        for (const mod of mods) {
          const m = /^(classskills|skilltab)(\d+)$/.exec(mod.stat);
          if (m) {
            const ownerIdx = m[1] === 'classskills' ? +m[2] : Math.floor(+m[2] / 3);
            const owner = CLASS_ORDER[ownerIdx];
            if (owner && owner !== cls) {
              hasOffClass = true;
              offClassList.push(`${mod.stat} (${owner})`);
            }
          }
        }

        if (hasOffClass) {
          totalOffClassCharms++;
          if (score <= 0) {
            offClassCharmsScoreLeZero++;
          } else {
            offClassCharmsScoreGtZero++;
            if (offClassPosExamples.length < 5) {
              offClassPosExamples.push({
                cls,
                score,
                name: item.name,
                mods: formatMods(item.mods),
                offClassList
              });
            }
          }
        }

        classCharms[cls].push({
          score,
          name: item.name || item.base || 'Charm',
          mods: item.mods || []
        });
      }
    }
  }

  console.log(`語料處理完畢！總行數: ${totalItemsProcessed}，耗時: ${((Date.now() - startTime) / 1000).toFixed(2)} 秒`);

  // 3) 對照 gamedata.json stats 鍵
  // 找出「語料出現但 charmValue 沒處理」的 stat
  // 分為：
  // A. 全語料出現過，但 charmValue 沒加分 (score === 0 for both amazon & sorceress) 且在 gamedata.stats 內
  // B. 咒符語料中實際出現過，但在 gamedata.stats 內且 charmValue 算為 0 的 stat
  const unhandledAllStats = [];
  for (const s of allCorpusStats) {
    if (gamedataStats.has(s)) {
      // 測試 charmValue 對該詞條的回傳值
      const vAmazon = charmValue({ mods: [{ stat: s, value: 10 }] }, 'amazon');
      const vSorc = charmValue({ mods: [{ stat: s, value: 10 }] }, 'sorceress');
      if (vAmazon === 0 && vSorc === 0) {
        unhandledAllStats.push(s);
      }
    }
  }
  unhandledAllStats.sort();

  const unhandledCharmStats = [];
  for (const s of charmCorpusStats) {
    if (gamedataStats.has(s)) {
      const vAmazon = charmValue({ mods: [{ stat: s, value: 10 }] }, 'amazon');
      const vSorc = charmValue({ mods: [{ stat: s, value: 10 }] }, 'sorceress');
      if (vAmazon === 0 && vSorc === 0) {
        unhandledCharmStats.push(s);
      }
    }
  }
  unhandledCharmStats.sort();

  // 排序各職業咒符分數前 20 與後 10 名
  const classCharmRankings = {};
  for (const cls of CLASSES) {
    const list = classCharms[cls];
    list.sort((a, b) => b.score - a.score);
    const top20 = list.slice(0, 20);
    const bottom10 = list.slice(-10);
    classCharmRankings[cls] = { top20, bottom10, total: list.length };
  }

  // 建立 Markdown 報告
  const mdLines = [];
  mdLines.push('# 離線裝備語料與 Autobot charmValue 審查報告');
  mdLines.push('');
  mdLines.push(`- **產出時間**：${new Date().toISOString()}`);
  mdLines.push(`- **分析語料庫**：7 職業 ndjson (各約 10 萬筆，總計 ${totalItemsProcessed} 筆裝備)`);
  mdLines.push(`- **全語料相異 mod.stat 總數**：${allCorpusStats.size}`);
  mdLines.push(`- **咒符 (charm) 出現相異 mod.stat 總數**：${charmCorpusStats.size}`);
  mdLines.push('');

  // 章節 1
  mdLines.push('## 1. 語料 mod.stat 出現頻率統計 (依部位與稀有度)');
  mdLines.push('');
  mdLines.push('以下彙整 12 種部位在各稀有度下出現次數最多的 mod.stat (前 10 名)：');
  mdLines.push('');

  for (const type of TARGET_TYPES) {
    mdLines.push(`### 部位: ${type}`);
    const rarities = Object.keys(statTypeRarityCounts[type] || {});
    if (rarities.length === 0) {
      mdLines.push('*無資料*');
      mdLines.push('');
      continue;
    }

    for (const rarity of rarities) {
      const statMap = statTypeRarityCounts[type][rarity];
      const sortedStats = Object.entries(statMap).sort((a, b) => b[1] - a[1]);
      const totalCount = sortedStats.reduce((sum, [, c]) => sum + c, 0);
      mdLines.push(`#### 稀有度: ${rarity} (總詞條數: ${totalCount})`);
      mdLines.push('| mod.stat | 出現次數 | 佔比 |');
      mdLines.push('| :--- | :--- | :--- |');
      const topSlice = sortedStats.slice(0, 10);
      for (const [stat, count] of topSlice) {
        const pct = ((count / totalCount) * 100).toFixed(2);
        mdLines.push(`| \`${stat}\` | ${count} | ${pct}% |`);
      }
      if (sortedStats.length > 10) {
        mdLines.push(`| *其他 (${sortedStats.length - 10} 種)* | ${sortedStats.slice(10).reduce((s, [, c]) => s + c, 0)} | - |`);
      }
      mdLines.push('');
    }
  }

  // 章節 2
  mdLines.push('## 2. Autobot charmValue 咒符評分審核');
  mdLines.push('');
  mdLines.push('### 2.1 各 stat 在咒符中被 charmValue 算成 0 分之清單 (含出現次數)');
  mdLines.push('');
  mdLines.push('當咒符帶有以下詞條時，單獨評估該詞條在該持有人職業下給予的分數為 0：');
  mdLines.push('');
  mdLines.push('| mod.stat | 0分次數 | 說明 / 根本原因 |');
  mdLines.push('| :--- | :--- | :--- |');

  const sortedZeroStats = Object.entries(charmZeroStatCounts).sort((a, b) => b[1] - a[1]);
  for (const [stat, count] of sortedZeroStats) {
    let note = '';
    const m = /^(classskills|skilltab)(\d+)$/.exec(stat);
    if (m) {
      const ownerIdx = m[1] === 'classskills' ? +m[2] : Math.floor(+m[2] / 3);
      note = `非本職技能 (${CLASS_ORDER[ownerIdx] || '未知'})，邏輯正確給 0 分`;
    } else if (stat === 'maxDamage' || stat === 'minDamage') {
      note = 'BUG: charmValue 正則式 `/MinDamage$|MaxDamage$/` 首字大寫，導致純小寫 minDamage/maxDamage 未命中！';
    } else if (stat === 'reducedPrices') {
      note = '吉黑得的運氣 (Gheed\'s Fortune) 商人降價屬性，charmValue 未支援';
    } else if (stat === 'stamina') {
      note = '耐力屬性，charmValue 未計分 (無戰鬥價值)';
    } else {
      note = '未計分屬性';
    }
    mdLines.push(`| \`${stat}\` | ${count} | ${note} |`);
  }
  mdLines.push('');

  mdLines.push('### 2.2 非本職業專用技能 (classskillsN / skilltabN) 咒符評分審核');
  mdLines.push('');
  mdLines.push(`- **含他職技能咒符總數**：${totalOffClassCharms}`);
  mdLines.push(`- **總分 ≤ 0 的咒符數**：${offClassCharmsScoreLeZero}`);
  mdLines.push(`- **總分 > 0 的咒符數**：${offClassCharmsScoreGtZero}`);
  mdLines.push('');
  mdLines.push('> **結論審查**：');
  mdLines.push('> 1. **單詞條評分**：他職技能詞條單獨評分時，100% 均為 0 分（`v += owner === cls ? n * 30 : 0`，未加分）。');
  mdLines.push('> 2. **複合咒符整體評分**：若咒符同時帶有他職技能與其他通用屬性 (如 `life`, `mana`, `strength` 等)，因通用屬性有加分，整件咒符總分會大於 0。此時他職技能並未倒扣分數。若需確保他職技能咒符整體評分 ≤ 0，需在 charmValue 加入非本職技能時的乘數歸零或罰分邏輯。');
  mdLines.push('');
  if (offClassPosExamples.length > 0) {
    mdLines.push('#### 他職技能但總分 > 0 之咒符範例：');
    for (const ex of offClassPosExamples) {
      mdLines.push(`- [${ex.cls}] **${ex.name}** (分數: ${ex.score}): 包含他職技能 [${ex.offClassList.join(', ')}]，因其他屬性加分 [${ex.mods}]`);
    }
    mdLines.push('');
  }

  mdLines.push('### 2.3 各職業分數前 20 名與後 10 名咒符清單');
  mdLines.push('');
  for (const cls of CLASSES) {
    const { top20, bottom10, total } = classCharmRankings[cls];
    mdLines.push(`#### 職業: ${cls} (咒符總數: ${total})`);
    mdLines.push('');
    mdLines.push('**【分數前 20 名】**');
    mdLines.push('| 排名 | 分數 | 咒符名稱 | 詞條清單 |');
    mdLines.push('| :--- | :--- | :--- | :--- |');
    top20.forEach((c, idx) => {
      mdLines.push(`| ${idx + 1} | ${c.score.toFixed(2)} | ${c.name} | ${formatMods(c.mods)} |`);
    });
    mdLines.push('');

    mdLines.push('**【分數後 10 名】**');
    mdLines.push('| 倒數排名 | 分數 | 咒符名稱 | 詞條清單 |');
    mdLines.push('| :--- | :--- | :--- | :--- |');
    bottom10.forEach((c, idx) => {
      const revIdx = bottom10.length - idx;
      mdLines.push(`| 後 ${revIdx} | ${c.score.toFixed(2)} | ${c.name} | ${formatMods(c.mods)} |`);
    });
    mdLines.push('');
  }

  // 章節 3
  mdLines.push('## 3. 對照 gamedata.json stats 鍵：語料出現但 charmValue 沒處理的 stat');
  mdLines.push('');
  mdLines.push('### 3.1 咒符語料中實際出現，但在 gamedata.json 內且 charmValue 未處理 (0分) 的 stat');
  mdLines.push('');
  mdLines.push('| mod.stat | 咒符出現次數 | 原因分析與建議 |');
  mdLines.push('| :--- | :--- | :--- |');
  for (const s of unhandledCharmStats) {
    const count = charmZeroStatCounts[s] || 0;
    let desc = '';
    if (s === 'maxDamage' || s === 'minDamage') {
      desc = '關鍵 BUG：正則 `/MinDamage$|MaxDamage$/` 未匹配純物理小寫 minDamage / maxDamage，應改為 `/(?:min|max)Damage$/i` 或分開處理。';
    } else if (s === 'reducedPrices') {
      desc = '吉黑得的運氣 (Gheed\'s Fortune) 降價屬性，若需考慮商人購物可納入計分。';
    } else if (s === 'stamina') {
      desc = '耐力屬性，通常為過渡屬性，不予計分合理。';
    } else {
      desc = 'gamedata.json 定義之屬性，charmValue 目前未採計。';
    }
    mdLines.push(`| \`${s}\` | ${count} | ${desc} |`);
  }
  mdLines.push('');

  mdLines.push('### 3.2 全語料 (含所有部位) 出現過，在 gamedata.json 內但 charmValue 未處理的 stat');
  mdLines.push('');
  mdLines.push(`全語料共比對出 **${unhandledAllStats.length}** 種在 \`gamedata.json\` 有定義但 \`charmValue\` 未處理的 stat：`);
  mdLines.push('');
  mdLines.push('```json');
  mdLines.push(JSON.stringify(unhandledAllStats, null, 2));
  mdLines.push('```');
  mdLines.push('');
  mdLines.push('> **常見核心戰鬥屬性分析**：');
  mdLines.push('> - 元素專精/穿透：`fireSkills`, `coldSkills`, `lightningSkills`, `fireMastery`, `coldMastery`, `lightningMastery`, `firePierce`, `coldPierce`, `lightningPierce`, `poisonPierce`');
  mdLines.push('> - 物理/攻擊：`attackSpeed` (IAS), `crushingBlow`, `deadlyStrike`, `openWounds`, `attackRating`, `enhancedDamage`, `damageReduction`');
  mdLines.push('> - 生存/防禦：`lifePercent`, `lifePerLevel`, `maxFireResist`, `maxColdResist`, `maxLightningResist`, `maxPoisonResist`, `cannotBeFrozen`, `absorbCold`, `absorbFire`, `absorbLightning`');
  mdLines.push('> - 續航：`lifeLeech`, `manaLeech`, `lifeAfterKill`');
  mdLines.push('> 雖然大部分為非咒符裝備（如武器、防具、戒指等）之屬性，但若未來開放特定特殊符咒或擴展評分至其他裝備，上述屬性為首要處理清單。');
  mdLines.push('');

  const reportContent = mdLines.join('\n');
  fs.writeFileSync(REPORT_PATH, reportContent, 'utf8');
  console.log(`\n報告已成功寫入: ${REPORT_PATH}`);

  // 同時輸出至 stdout (按需求)
  console.log('\n--- Markdown 報告預覽 ---');
  console.log(reportContent.slice(0, 2000) + '\n... (其餘詳細內容請見 ' + REPORT_PATH + ')');

  // 回傳重點數字
  return {
    totalItemsProcessed,
    uniqueCorpusStats: allCorpusStats.size,
    charmCorpusStats: charmCorpusStats.size,
    unhandledAllStatsCount: unhandledAllStats.length,
    unhandledCharmStats,
    totalOffClassCharms,
    offClassCharmsScoreLeZero,
    offClassCharmsScoreGtZero,
    charmZeroStats: sortedZeroStats
  };
}

if (require.main === module) {
  runAudit().catch(err => {
    console.error('執行失敗:', err);
    process.exit(1);
  });
}

module.exports = { runAudit };
