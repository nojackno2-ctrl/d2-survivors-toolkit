// 驗證 engine-page.js 的 buildDefs 與 editor.html 的 collectBuild / syncBuild 邏輯
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

(async () => {
  // ==========================================
  // 任務 (1)：驗證 engine.buildDefs
  // ==========================================
  const engineSource = fs.readFileSync(path.join(__dirname, '..', 'engine-page.js'), 'utf8');
  const { boot } = await import('data:text/javascript,' + encodeURIComponent(engineSource));

  // 1. 無 __classKits 回傳 null
  const engineNoKits = boot({ __setData() {}, __uniques: [], __sets: [], __runewords: [], __bases: [] }, '{}');
  assert.equal(engineNoKits.buildDefs(['sorceress']), null, '無 __classKits 應回傳 null');

  // 2. 測試夾具職業：包含預設 maxLevel、evolved、共通被動、同名不重複、未知職業略過
  const mockClassKits = {
    sorceress: {
      skills: {
        fireBolt: { name: 'Fire Bolt' }, // 沒提供 maxLevel (預設 8)，沒提供 evolved (預設 false)
        hydra: { name: 'Hydra', maxLevel: 10, evolved: true }, // evolved: true
      },
      passives: {
        warmth: { name: 'Warmth', maxLevel: 6 }, // 自身被動
        vitality: { name: 'Own Vitality', maxLevel: 7 }, // 與共通被動同名
      },
    },
    barbarian: {
      skills: {
        whirlwind: {}, // name 預設 id, maxLevel 預設 8
      },
      passives: {
        ironSkin: {}, // name 預設 id, maxLevel 預設 5
      },
    },
  };

  const engine = boot({
    __setData() {}, __uniques: [], __sets: [], __runewords: [], __bases: [],
    __classKits: mockClassKits,
  }, '{}');

  const defs = engine.buildDefs(['sorceress', 'barbarian', 'unknownClass']);

  // 未知職業應被略過
  assert.equal(defs.unknownClass, undefined, '未知職業應被略過');

  // sorceress 驗證
  const sorc = defs.sorceress;
  assert.ok(sorc, '應有 sorceress 定義');

  // skills 結構
  assert.deepEqual(sorc.skills, [
    { id: 'fireBolt', name: 'Fire Bolt', maxLevel: 8, evolved: false },
    { id: 'hydra', name: 'Hydra', maxLevel: 10, evolved: true },
  ]);

  // passives 結構：共通被動排在前面 (common: true)，排除同名 'vitality'，自身被動在後 (common: false)
  // COMMON: vitality, fcr, frw, replenish, telekinesis
  // sorceress 自身有 vitality，所以共通被動只有 fcr, frw, replenish, telekinesis
  assert.deepEqual(sorc.passives, [
    { id: 'fcr', name: 'Faster Cast Rate', maxLevel: 5, common: true },
    { id: 'frw', name: 'Faster Run/Walk', maxLevel: 5, common: true },
    { id: 'replenish', name: 'Replenish Life', maxLevel: 5, common: true },
    { id: 'telekinesis', name: 'Telekinesis', maxLevel: 5, common: true },
    { id: 'warmth', name: 'Warmth', maxLevel: 6, common: false },
    { id: 'vitality', name: 'Own Vitality', maxLevel: 7, common: false },
  ]);

  // barbarian 驗證：name 預設 id, maxLevel 預設值
  const barb = defs.barbarian;
  assert.deepEqual(barb.skills, [
    { id: 'whirlwind', name: 'whirlwind', maxLevel: 8, evolved: false },
  ]);
  assert.equal(barb.passives.length, 6); // 5 個共通 + 1 個自身
  assert.equal(barb.passives[0].id, 'vitality');
  assert.equal(barb.passives[5].id, 'ironSkin');
  assert.equal(barb.passives[5].name, 'ironSkin');
  assert.equal(barb.passives[5].maxLevel, 5);

  console.log('✓ (1) engine.buildDefs 結構與邏輯驗證通過');

  // ==========================================
  // 任務 (2)：從 editor.html 擷取 collectBuild 與相依函式並驗證
  // ==========================================
  const editorHtml = fs.readFileSync(path.join(__dirname, '..', 'editor.html'), 'utf8');

  // 擷取 buildSels 與 collectBuild 相關原始碼
  const buildSelsMatch = editorHtml.match(/const buildSels = [^;]+;/);
  const buildRecsMatch = editorHtml.match(/const buildOk = [\s\S]*?const buildRecs = [^\r\n]+/);
  assert.ok(buildRecsMatch, '應能從 editor.html 擷取 buildRecs');
  const collectBuildMatch = editorHtml.match(/function collectBuild\(\)\s*\{[\s\S]*?\n\}/);
  assert.ok(buildSelsMatch, '應能從 editor.html 擷取 buildSels');
  assert.ok(collectBuildMatch, '應能從 editor.html 擷取 collectBuild');

  const createModule = new Function(
    'document',
    'save',
    'BUILD_DEFS',
    `${buildRecsMatch[0]}\n${buildSelsMatch[0]}\n${collectBuildMatch[0]}\nreturn { buildSels, collectBuild };`
  );

  // 建立 DOM 模擬環境
  function createMockEnv(initialSave, buildDefsData) {
    const saveState = initialSave;
    const elements = [];

    const mockDoc = {
      querySelectorAll(selector) {
        if (selector === 'select[data-build]') {
          return elements.filter(el => el.dataset && el.dataset.build);
        }
        const buildMatch = selector.match(/select\[data-build="([^"]+)"\]\[data-kind="([^"]+)"\]/);
        if (buildMatch) {
          const [, bKey, bKind] = buildMatch;
          return elements.filter(el => el.dataset && el.dataset.build === bKey && el.dataset.kind === bKind);
        }
        return [];
      },
    };

    function addRow(key, kind, value, level) {
      const selectBuild = {
        value,
        dataset: { build: key, kind },
        options: [],
        closest(sel) {
          if (sel === 'tr') return rowObj;
          return null;
        },
      };
      const selectLv = {
        value: String(level),
      };
      const rowObj = {
        querySelector(sel) {
          if (sel === '[data-build-lv]') return selectLv;
          return null;
        },
      };
      elements.push(selectBuild);
      return { selectBuild, selectLv };
    }

    const mod = createModule(mockDoc, saveState, buildDefsData);

    return {
      save: saveState,
      addRow,
      collectBuild: mod.collectBuild,
    };
  }

  // --- 驗收測試 2.1：技能去重（下拉選單重複時只取第一個） ---
  {
    const initialSave = {
      heroes: {
        sorceress: {
          kept: {
            build: {
              skills: [{ id: 'fireBolt', level: 1, cooldown: 0 }],
              passives: { warmth: 1 },
              history: ['passive:warmth'],
              slots: 6,
            },
          },
        },
      },
    };
    const env = createMockEnv(initialSave, defs);
    // 模擬 2 個選了相同技能 fireBolt 的 select
    env.addRow('sorceress.kept', 'skill', 'fireBolt', 3);
    env.addRow('sorceress.kept', 'skill', 'fireBolt', 5); // 重複，應被忽略
    env.addRow('sorceress.kept', 'passive', 'warmth', 1);

    env.collectBuild();
    const b = env.save.heroes.sorceress.kept.build;
    assert.equal(b.skills.length, 1, '重複技能應去重');
    assert.equal(b.skills[0].id, 'fireBolt');
    assert.equal(b.skills[0].level, 3, '應保留第一個選擇的等級');
  }

  // --- 驗收測試 2.2：保留既有技能物件的其他欄位（如 cooldown, banked 等） ---
  {
    const initialSave = {
      heroes: {
        sorceress: {
          kept: {
            build: {
              skills: [
                { id: 'fireBolt', level: 2, cooldown: 15, customProp: 'keepMe', banked: 5 },
              ],
              passives: { warmth: 1 },
              history: ['passive:warmth'],
              slots: 6,
            },
          },
        },
      },
    };
    const env = createMockEnv(initialSave, defs);
    // 等級提升為 8，banked 原本為 5 (5 不大於 8，所以保留 5)
    env.addRow('sorceress.kept', 'skill', 'fireBolt', 8);
    // 新技能 hydra，原本沒有，應給 { id, level, cooldown: 0 }
    env.addRow('sorceress.kept', 'skill', 'hydra', 10);
    env.addRow('sorceress.kept', 'passive', 'warmth', 1);

    env.collectBuild();
    const b = env.save.heroes.sorceress.kept.build;
    assert.equal(b.skills[0].id, 'fireBolt');
    assert.equal(b.skills[0].level, 8);
    assert.equal(b.skills[0].cooldown, 15);
    assert.equal(b.skills[0].customProp, 'keepMe', '自訂屬性應被保留');
    assert.equal(b.skills[0].banked, 5);

    assert.deepEqual(b.skills[1], { id: 'hydra', level: 10, cooldown: 0 }, '新技能格式正確');
  }

  // --- 驗收測試 2.3：被動改變時 history 中 passive:<id> 次數等於等級且其他紀錄順序與數量不變 ---
  {
    const initialSave = {
      heroes: {
        sorceress: {
          kept: {
            build: {
              skills: [{ id: 'fireBolt', level: 1, cooldown: 0 }],
              passives: { warmth: 2, vitality: 1 },
              history: [
                'level:2',
                'passive:warmth',
                'point:str',
                'tree:1',
                'passive:vitality',
                'attribute:vit',
                'bank:skill',
                'passive:warmth',
              ],
              slots: 6,
            },
          },
        },
      },
    };
    const env = createMockEnv(initialSave, defs);
    env.addRow('sorceress.kept', 'skill', 'fireBolt', 1);
    // 將 warmth 改為 3，移除 vitality，新增 fcr 2
    env.addRow('sorceress.kept', 'passive', 'warmth', 3);
    env.addRow('sorceress.kept', 'passive', 'fcr', 2);

    env.collectBuild();
    const b = env.save.heroes.sorceress.kept.build;
    assert.deepEqual(b.passives, { warmth: 3, fcr: 2 });

    // 檢查非 passive 紀錄的順序與數量
    const nonPassiveHistory = b.history.filter(h => !h.startsWith('passive:'));
    assert.deepEqual(nonPassiveHistory, [
      'level:2',
      'point:str',
      'tree:1',
      'attribute:vit',
      'bank:skill',
    ], '其他紀錄（level、bank、tree、attribute、point）順序與數量必須完全不變');

    // 檢查 passive 紀錄
    const passiveWarmth = b.history.filter(h => h === 'passive:warmth');
    const passiveFcr = b.history.filter(h => h === 'passive:fcr');
    const passiveVitality = b.history.filter(h => h === 'passive:vitality');
    assert.equal(passiveWarmth.length, 3, 'warmth 次數等於等級 3');
    assert.equal(passiveFcr.length, 2, 'fcr 次數等於等級 2');
    assert.equal(passiveVitality.length, 0, 'vitality 已被移除');
  }

  // --- 驗收測試 2.4：slots 依數量升級為 8 或 10 且不降低既有值 ---
  {
    // 測試從 6 升級到 8 (技能數 7)
    const save1 = {
      heroes: {
        sorceress: {
          run: {
            build: {
              skills: [{ id: 's1', level: 1, cooldown: 0 }],
              passives: {},
              slots: 6,
            },
          },
        },
      },
    };
    const env1 = createMockEnv(save1, defs);
    for (let i = 1; i <= 7; i++) {
      env1.addRow('sorceress.run', 'skill', `s${i}`, 1);
    }
    env1.collectBuild();
    assert.equal(env1.save.heroes.sorceress.run.build.slots, 8, '7 個技能時 slots 應升級為 8');

    // 測試從 8 升級到 10 (技能數 9)
    const save2 = {
      heroes: {
        sorceress: {
          run: {
            build: {
              skills: [{ id: 's1', level: 1, cooldown: 0 }],
              passives: {},
              slots: 8,
            },
          },
        },
      },
    };
    const env2 = createMockEnv(save2, defs);
    for (let i = 1; i <= 9; i++) {
      env2.addRow('sorceress.run', 'skill', `s${i}`, 1);
    }
    env2.collectBuild();
    assert.equal(env2.save.heroes.sorceress.run.build.slots, 10, '9 個技能時 slots 應升級為 10');

    // 測試既有 slots 為 10，新數量為 4，不降低既有 slots
    const save3 = {
      heroes: {
        sorceress: {
          run: {
            build: {
              skills: [{ id: 's1', level: 1, cooldown: 0 }],
              passives: {},
              slots: 10,
            },
          },
        },
      },
    };
    const env3 = createMockEnv(save3, defs);
    env3.addRow('sorceress.run', 'skill', 's1', 1);
    // 改變 level 以觸發變更檢查
    env3.addRow('sorceress.run', 'passive', 'warmth', 1);
    env3.collectBuild();
    assert.equal(env3.save.heroes.sorceress.run.build.slots, 10, '不降低既有 slots 值');
  }

  // --- 驗收測試 2.5：沒有變更時 build 物件完全不變 (同參照 / 不重寫) ---
  {
    const initialBuild = {
      skills: [{ id: 'fireBolt', level: 1, cooldown: 0 }],
      passives: { warmth: 2 },
      history: ['level:2', 'passive:warmth', 'passive:warmth'],
      slots: 6,
    };
    const initialSave = {
      heroes: {
        sorceress: {
          kept: {
            build: initialBuild,
          },
        },
      },
    };
    const env = createMockEnv(initialSave, defs);
    env.addRow('sorceress.kept', 'skill', 'fireBolt', 1);
    env.addRow('sorceress.kept', 'passive', 'warmth', 2);

    env.collectBuild();
    const currentBuild = env.save.heroes.sorceress.kept.build;
    assert.equal(currentBuild, initialBuild, '沒有變更時 build 物件參照應維持不變');
    assert.equal(currentBuild.skills, initialBuild.skills, 'skills 陣列參照應不變');
    assert.equal(currentBuild.passives, initialBuild.passives, 'passives 物件參照應不變');
    assert.equal(currentBuild.history, initialBuild.history, 'history 陣列參照應不變');
  }

  console.log('✓ (2) editor.html collectBuild 邏輯與各項驗收條件驗證通過');

  // --- 進行中的冒險與保留的角色同時存在：畫面以 run 為準，兩筆一併改成相同配置，各自的 history 分別重寫 ---
  {
    const mk = (extraHist) => ({ build: { skills: [{ id: 'fireBolt', level: 1, cooldown: 0 }], passives: { warmth: 2 }, history: ['level', 'passive:warmth', ...extraHist, 'passive:warmth'], slots: 10 } });
    const initialSave = { heroes: { sorceress: { kept: mk(['bank']), run: mk(['level', 'tree:1']) } } };
    const env = createMockEnv(initialSave, defs);
    env.addRow('sorceress.run', 'skill', 'hydra', 8);
    env.addRow('sorceress.run', 'passive', 'vitality', 3);
    env.collectBuild();
    for (const k of ['run', 'kept']) {
      const b = env.save.heroes.sorceress[k].build;
      assert.deepEqual(b.skills, [{ id: 'hydra', level: 8, cooldown: 0 }], k + ' 的主動應同步');
      assert.deepEqual(b.passives, { vitality: 3 }, k + ' 的被動應同步');
      assert.equal(b.history.filter(h => h === 'passive:vitality').length, 3);
      assert.equal(b.history.filter(h => h.startsWith('passive:')).length, 3);
    }
    assert.deepEqual(env.save.heroes.sorceress.kept.build.history.slice(0, 2), ['level', 'bank']);
    assert.deepEqual(env.save.heroes.sorceress.run.build.history.slice(0, 3), ['level', 'level', 'tree:1']);
    console.log('✓ (3) 進行中的冒險與保留的角色一併修改驗證通過');
  }
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
