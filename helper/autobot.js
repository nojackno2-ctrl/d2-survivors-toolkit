// D2 倖存者遊戲輔助工具。只控制原版輸入與流程，不改角色數值或任務旗標。
// 靜態對照（2026-10-31）：Game-C88Jt16A.js、itemArt-BPHOVK4V.js、saveTransfer-BTsCILil.js。
(() => {
  "use strict";

  function keepFunctionName(original, replacement) {
    if (typeof original === "function" && typeof replacement === "function" && replacement.name !== original.name) {
      try { Object.defineProperty(replacement, "name", { configurable: true, value: original.name }); } catch {}
    }
    return replacement;
  }
  // 熱重載時保留同頁既有 Game 參照，讓遊戲迴圈被殘留選卡遮罩卡住時仍可恢復。
  const priorGame = window.__d2autobot?.game || null;
  window.__d2autobot?.destroy();
  const KEY = "d2autobot:settings";
  const BUILD_KEY = "d2autobot:gameBuild";
  const TESTED_GAME_BUILD = "20261105.3"; // 每次確認新版遊戲相容後更新此值
  const defaults = {
    version: 10, enabled: false, progressEnabled: false,
    potion: { autoHp: true, hpThreshold: 50, lethalProtection: true, lethalLookaheadSec: 0.3, hpCooldownMs: 1200, fallbackHpSlot: 1 },
    movement: { enabled: true, combatStyle: "auto", ignoreDamagePercent: 3, chaseFirst: true, attackRange: 320, kiteDistance: 220, dodgeProjectiles: true, projectileSafetyRadius: 45, smoothingFactor: 0.6 },
    loot: { enabled: true, vacuum: true, vacuumXp: true, vacuumGold: false, searchRadius: 450, pickupGold: true, minRuneTier: 1, qualityThreshold: { normal: true, magic: true, rare: true, set: true, unique: true, runeword: true }, backtrackForLoot: true, kickJars: true, onlyUpgrades: false },
    terror: { mode: "off", targetFarmTier: 1, autoReviveOrRestart: false, postClearWaitSec: 3 },
    quest: { autoProgress: false, prioritizeBoss: true, autoStart: true, farmDifficulty: "off", fixedDifficulty: "hell" },
    gear: { autoEquip: true, minGainPercent: 2 },
    // 陣亡回營地後的整備：收藏、倉庫、賣裝、買藥、恰西升級，讓每一局都比上一局強。
    town: { enabled: true, collect: true, stash: true, sellJunk: true, buyPotions: true, charsiUpgrades: true, buyGear: true },
    build: { ladder: true, autoStats: true, redraft: true, autoReroll: true },
    // 實測 39～46 級角色陣亡會從 1 級重來；預設開啟：快被打死時原版「儲存並離開」，回營地後自動繼續上次進度。
    deathProtection: { enabled: true, emergencyHpPercent: 15, disableAutomation: false },
    // 遊戲修改：預設全部關閉，頂部設總開關
    cheat: {
      enabled: false,
      invincible: false,
      maxCrit: false,
      oneHitKill: false,
      maxSkills: false,
      maxMonsterDensity: false,
      monsterDensity10x: false,
      allElites: false,
      forgeMax: false,
      larzukMax: false,
      pauseStageTime: false,
      summonAllBosses: false,
      infiniteRerolls: false,
      maxDropRate: false,
      maxGoldRate: false,
      maxXp: false,
      summonCloneOnTerror: false
    },
  };
  // 由 d2survivors.lol 排行榜 API 產生（helper/tools/ladder-learn.js）：各職業前 50 位不同玩家，每人只取最高恐懼層紀錄（依使用者要求），不足 20 位以地獄榜補：技能／被動 [id, 名稱, 權重]、常用變體、配點比例、各欄常用暗金套裝。
  const LADDER = {"source":"d2survivors.lol/api/leaderboard（各職業前 50 位不同玩家，每人取最高恐懼層紀錄；不足 20 位以地獄榜補）","generatedAt":"2026-11-01","classes":{"amazon":{"runs":50,"players":50,"tiers":[118,103,94,87,84],"skills":[["fireArrow","Fire Arrow",1.68],["explodingArrow","Exploding Arrow",1.64],["guidedArrow","Guided Arrow",1.44],["magicArrow","Magic Arrow",1.4],["seekerArrow","Widowmaker",1.13],["strafe","Strafe",1.1],["immolationArrow","Immolation Arrow",1.03],["coldArrow","Cold Arrow",1],["freezingArrow","Freezing Arrow",0.99],["iceArrow","Ice Arrow",0.99],["lightningFury","Lightning Fury",0.9],["multipleShot","Multiple Shot",0.8],["valkyrie","Valkyrie",0.48],["lightningBolt","Lightning Bolt",0.16],["plagueJavelin","Plague Javelin",0.11],["impale","Impale",0.08],["lightningStrike","Lightning Strike",0.05],["jab","Jab",0.04],["fend","Fend",0.02],["chargedStrike","Charged Strike",0.02]],"mods":{"seekerArrow":"blackArrow","plagueJavelin":"lingering","strafe":"bullseye","guidedArrow":"bounty","lightningFury":"chain","freezingArrow":"frostField","iceArrow":"deepFreeze","immolationArrow":"pyre","explodingArrow":"focused","fireArrow":"frostfire","magicArrow":"ricochet","coldArrow":"split","valkyrie":"huntress","multipleShot":"narrow","impale":"slayer","fend":"spearwind","jab":"heavy","lightningStrike":"frostEdge","chargedStrike":"frostCharge","lightningBolt":"frostJavelin"},"passives":[["criticalStrike","Critical Strike",2],["penetrate","Penetrate",2],["pierce","Pierce",2],["innerSight","Inner Sight",2],["dodge","Dodge",1.96],["avoid","Avoid",1.96],["dopplezon","Decoy",1.88],["slowMissiles","Slow Missiles",1.84],["evade","Evade",1.76],["fcr","Faster Cast Rate",1.68],["frw","Faster Run/Walk",0.44],["vitality","Vitality",0.32],["telekinesis","Telekinesis",0.1],["replenish","Replenish Life",0.04]],"attributes":{"strength":0.02,"dexterity":0.78,"vitality":0.13,"energy":0.07},"gear":{"belt":["Arachnid Mesh","Thundergod's Vigor","M'avina's Tenet"],"boots":["Gore Rider","Marrowwalk","Goblin Toe"],"amulet":["Mara's Kaleidoscope","Atma's Scarab","Highlord's Wrath"],"ring1":["Wisp Projector","Bul-Kathos' Wedding Band","The Stone of Jordan"],"ring2":["Wisp Projector","Bul-Kathos' Wedding Band","Carrion Wind"],"weapon":["Blood Raven's Charge","Gimmershred","Kuko Shakaku"],"head":["Harlequin Crest","Andariel's Visage","Kira's Guardian"],"body":["Skin of the Vipermagi","Arkaine's Valor","M'avina's Embrace"],"gloves":["Soul Drainer","Dracul's Grasp","Laying of Hands"],"shield":["The Ward","Spirit Ward"]}},"assassin":{"runs":50,"players":50,"tiers":[100,84,82,72,66],"skills":[["cloakOfShadows","Cloak of Shadows",1.52],["cobraStrike","Cobra Strike",1.48],["dragonFlight","Dragon Flight",1.1],["bladesOfIce","Blades of Ice",1.1],["royalStrike","Phoenix Strike",1.1],["tigerStrike","Tiger Strike",1.04],["clawsOfThunder","Claws of Thunder",0.88],["deathSentry","Death Sentry",0.77],["dragonTail","Dragon Tail",0.65],["mindBlast","Mind Blast",0.61],["fistsOfFire","Fists of Fire",0.6],["bladeShield","Blade Shield",0.59],["shadowMaster","Shadow Master",0.59],["infernoSentry","Wake of Inferno",0.27],["dragonClaw","Dragon Claw",0.25],["shockField","Shock Web",0.24],["bladeFury","Blade Fury",0.23],["lightningSentry","Lightning Sentry",0.18],["wakeOfFireSentry","Wake of Fire",0.09],["chargedBoltSentry","Charged Bolt Sentry",0.08],["dragonTalon","Dragon Talon",0.08],["psychicHammer","Psychic Hammer",0.04]],"mods":{"cobraStrike":"spit","dragonFlight":"hunter","cloakOfShadows":"shroud","mindBlast":"focus","bladesOfIce":"shards","deathSentry":"chainBlast","dragonTail":"wideTail","clawsOfThunder":"chain","royalStrike":"tempest","bladeShield":"burst","tigerStrike":"shockwave","shadowMaster":"stalker","fistsOfFire":"flare","dragonClaw":"cleave","infernoSentry":"fan","lightningSentry":"fork","bladeFury":"bullseye","wakeOfFireSentry":"ring","shockField":"wideNet","chargedBoltSentry":"lance","dragonTalon":"sweep"},"passives":[["vitality","Vitality",2],["fcr","Faster Cast Rate",2],["frw","Faster Run/Walk",2],["clawMastery","Claw Mastery",2],["weaponBlock","Weapon Block",2],["quickness","Burst of Speed",2],["fade","Fade",2],["venom","Venom",2],["replenish","Replenish Life",1.96],["telekinesis","Telekinesis",1.6]],"attributes":{"strength":0.22,"dexterity":0.27,"vitality":0.31,"energy":0.2},"gear":{"weapon":["Firelizard's Talons","Bartuc's Cut-Throat","Mang Song's Lesson"],"head":["Harlequin Crest","Andariel's Visage","Griffon's Eye"],"belt":["Arachnid Mesh","Verdungo's Hearty Cord","String of Ears"],"boots":["Gore Rider","Shadow Dancer","Goblin Toe"],"amulet":["Mara's Kaleidoscope","Atma's Scarab","Highlord's Wrath"],"ring1":["Bul-Kathos' Wedding Band","Wisp Projector","Raven Frost"],"ring2":["Wisp Projector","Bul-Kathos' Wedding Band","The Stone of Jordan"],"gloves":["Dracul's Grasp","Laying of Hands","Magefist"],"body":["Arkaine's Valor","Skin of the Vipermagi","Naj's Light Plate"],"shield":["Bartuc's Cut-Throat","Jade Talon","Firelizard's Talons"]}},"barbarian":{"runs":50,"players":50,"tiers":[260,235,233,228,223],"skills":[["battleCry","Battle Cry",2],["doubleThrow","Double Throw",2],["grimWard","Grim Ward",2],["doubleSwing","Double Swing",2],["taunt","Taunt",1.72],["whirlingAxes","Lacerator",1.13],["frenzy","Frenzy",1.13],["berserk","Berserk",1.13],["battleCommand","Battle Command",1.13],["concentrate","Concentrate",1.03],["whirlwind","Whirlwind",0.36],["stun","Stun",0.08]],"mods":{"whirlwind":"blazingPath","whirlingAxes":"stormAxes","frenzy":"flameEdge","berserk":"gore","battleCry":"contagion","doubleThrow":"venom","battleCommand":"warBanner","grimWard":"lure","doubleSwing":"stormEdge","taunt":"rabble","concentrate":"stormBlow","stun":"concussion"},"passives":[["vitality","Vitality",2],["axeMastery","Axe Mastery",2],["throwingMastery","Throwing Mastery",2],["ironSkin","Iron Skin",2],["naturalResistance","Natural Resistance",2],["increasedSpeed","Increased Speed",2],["findItem","Find Item",2],["fcr","Faster Cast Rate",1.96],["increasedStamina","Increased Stamina",1.96],["swordMastery","Sword Mastery",1.16],["maceMastery","Mace Mastery",0.52],["telekinesis","Telekinesis",0.19],["poleArmMastery","Pole Arm Mastery",0.04],["replenish","Replenish Life",0.04],["frw","Faster Run/Walk",0.04],["spearMastery","Spear Mastery",0.04]],"attributes":{"strength":0.23,"dexterity":0.01,"vitality":0.76,"energy":0},"gear":{"gloves":["Dracul's Grasp","Steelrend","Laying of Hands"],"belt":["Arachnid Mesh","Verdungo's Hearty Cord"],"boots":["Gore Rider","Goblin Toe","War Traveler"],"amulet":["Atma's Scarab","Mara's Kaleidoscope","Highlord's Wrath"],"ring1":["Wisp Projector","Bul-Kathos' Wedding Band","The Stone of Jordan"],"ring2":["Bul-Kathos' Wedding Band","Wisp Projector","The Stone of Jordan"],"head":["Wolfhowl","Arreat's Face"],"weapon":["Azurewrath"]}},"druid":{"runs":50,"players":50,"tiers":[174,129,100,97,70],"skills":[["twister","Twister",1.36],["arcticBlast","Arctic Blast",1.28],["spiritOfBarbs","Spirit of Barbs",0.99],["hurricane","Hurricane",0.99],["fury","Fury",0.92],["tornado","Tornado",0.92],["shockWave","Shock Wave",0.86],["moltenBoulder","Molten Boulder",0.86],["armageddon","Armageddon",0.81],["volcano","Volcano",0.81],["vines","Solar Creeper",0.77],["firestorm","Firestorm",0.72],["summonGrizzly","Summon Grizzly",0.63],["eruption","Fissure",0.56],["raven","Raven",0.12],["cycleOfLife","Carrion Vine",0.09],["oakSage","Oak Sage",0.08],["summonFenris","Summon Dire Wolf",0.07],["heartOfWolverine","Heart of Wolverine",0.07],["plaguePoppy","Poison Creeper",0.04]],"mods":{"shockWave":"earthquake","fury":"stormFangs","armageddon":"wrath","vines":"sunburst","hurricane":"galeForce","volcano":"caldera","tornado":"maelstrom","moltenBoulder":"magmaCore","twister":"vortex","summonGrizzly":"wildPack","spiritOfBarbs":"thornNova","firestorm":"firewall","arcticBlast":"iceLance","cycleOfLife":"nourish","eruption":"wideFissure","raven":"nightwing","oakSage":"sap","heartOfWolverine":"loneWolf","summonFenris":"frenzied"},"passives":[["shapeShifting","Lycanthropy",1.92],["cycloneArmor","Cyclone Armor",1.92],["replenish","Replenish Life",1.88],["spiritKeeper","Spirit Keeper",1.88],["fcr","Faster Cast Rate",1.84],["frw","Faster Run/Walk",1.84],["feralRage","Feral Rage",1.72],["fireClaws","Fire Claws",1.68],["vitality","Vitality",1.52],["ravenlore","Ravenlore",1.4],["hunger","Hunger",1.32],["rabies","Rabies",0.56],["telekinesis","Telekinesis",0.42]],"attributes":{"strength":0.44,"dexterity":0.03,"vitality":0.34,"energy":0.18},"gear":{"weapon":["Azurewrath","Islestrike","Earth Shifter"],"shield":["Tiamat's Rebuke","Stormshield","The Ward"],"head":["Jalal's Mane","Harlequin Crest","Cerebus' Bite"],"gloves":["Dracul's Grasp","Soul Drainer","Magefist"],"belt":["Arachnid Mesh","Goldwrap","Verdungo's Hearty Cord"],"boots":["Gore Rider","War Traveler","Goblin Toe"],"amulet":["Mara's Kaleidoscope","Atma's Scarab","Highlord's Wrath"],"ring1":["Bul-Kathos' Wedding Band","Raven Frost","The Stone of Jordan"],"ring2":["Bul-Kathos' Wedding Band","Raven Frost","The Stone of Jordan"],"body":["Skin of the Vipermagi","Skullder's Ire","Arkaine's Valor"]}},"necromancer":{"runs":50,"players":50,"tiers":[144,129,120,103,102],"skills":[["corpseExplosion","Corpse Explosion",2],["teeth","Teeth",1.44],["raiseSkeletalMage","Raise Skeletal Mage",1.44],["bonePrison","Bone Prison",1.2],["boneSpirit","Bone Spirit",1.1],["lifeTap","Life Tap",1.08],["revive","Revive",1.06],["boneSpear","Bone Spear",0.97],["decrepify","Decrepify",0.77],["ironMaiden","Iron Maiden",0.68],["attract","Attract",0.65],["poisonNova","Poison Nova",0.61],["fireGolem","Fire Golem",0.45],["amplifyDamage","Amplify Damage",0.44],["bloodGolem","Blood Golem",0.41],["weaken","Weaken",0.28],["poisonExplosion","Poison Explosion",0.27],["poisonDagger","Poison Dagger",0.16],["terror","Terror",0.08],["confuse","Confuse",0.02]],"mods":{"boneSpirit":"reaper","boneSpear":"impaler","teeth":"clench","attract":"sacrifice","amplifyDamage":"contagion","revive":"legion","bloodGolem":"bloodbond","raiseSkeletalMage":"legion","bonePrison":"crushing","corpseExplosion":"chain","fireGolem":"forge","ironMaiden":"spite","lifeTap":"feast","poisonNova":"plagueWave","decrepify":"contagion","poisonExplosion":"miasma","poisonDagger":"venomPuff","terror":"cower","weaken":"contagion","confuse":"contagion"},"passives":[["fcr","Faster Cast Rate",2],["boneArmor","Bone Armor",2],["boneWall","Bone Wall",2],["lowerResist","Lower Resist",2],["skeletonMastery","Skeleton Mastery",1.96],["vitality","Vitality",1.88],["golemMastery","Golem Mastery",1.72],["replenish","Replenish Life",1.56],["frw","Faster Run/Walk",1.56],["telekinesis","Telekinesis",1.47],["summonResist","Summon Resist",1.32]],"attributes":{"strength":0,"dexterity":0,"vitality":0.15,"energy":0.84},"gear":{"shield":["Trang-Oul's Wing","Homunculus","Boneflame"],"head":["Harlequin Crest","Trang-Oul's Guise","Kira's Guardian"],"body":["Trang-Oul's Scales","Skullder's Ire","Tal Rasha's Guardianship"],"gloves":["Trang-Oul's Claws","Magefist","Chance Guards"],"belt":["Arachnid Mesh","Trang-Oul's Girth"],"boots":["Marrowwalk","War Traveler","Silkweave"],"amulet":["Mara's Kaleidoscope"],"ring1":["The Stone of Jordan","Wisp Projector","Bul-Kathos' Wedding Band"],"ring2":["Wisp Projector","Bul-Kathos' Wedding Band","The Stone of Jordan"],"weapon":["Boneshade","Death's Web","Gravenspine"]}},"paladin":{"runs":49,"players":50,"tiers":[166,127,123,122,119],"skills":[["holyShield","Holy Shield",2],["smite","Smite",2],["zeal","Zeal",1.99],["sacrifice","Sacrifice",1.96],["charge","Charge",1.88],["vengeance","Vengeance",1.22],["holyCharge","Herald of Zakarum",1.13],["fanaticZeal","Passion",1.13],["almaNegra","Alma Negra",1.13],["rusthandle","Rusthandle",0.83],["blessedHammer","Blessed Hammer",0.57],["hammerOfZakarum","Zakarum's Hand",0.39],["conversion","Conversion",0.08],["fistOfTheHeavens","Fist of the Heavens",0.05],["bloodrise","Bloodrise",0.02]],"mods":{"holyCharge":"lance","fanaticZeal":"fervor","almaNegra":"wideWave","rusthandle":"cascade","zeal":"holyEdge","smite":"pin","charge":"lance","vengeance":"attuned","holyShield":"retribution","sacrifice":"bloodletting","hammerOfZakarum":"swarm","conversion":"legion","fistOfTheHeavens":"storm","blessedHammer":"return"},"passives":[["might","Might",2],["concentration","Concentration",2],["fanaticism","Fanaticism",2],["conviction","Conviction",2],["vigor","Vigor",2],["holyShock","Holy Shock",1.96],["resistFire","Resist Fire",1.88],["resistLightning","Resist Lightning",1.84],["resistCold","Resist Cold",1.51],["holyFire","Holy Fire",1.35],["holyFreeze","Holy Freeze",0.73],["salvation","Salvation",0.53],["blessedAim","Blessed Aim",0.16],["redemption","Redemption",0.04]],"attributes":{"strength":0.07,"dexterity":0.08,"vitality":0.85,"energy":0},"gear":{"weapon":["Heaven's Light","The Redeemer","Azurewrath"],"shield":["Herald of Zakarum","Alma Negra","Steelclash"],"head":["Andariel's Visage","Harlequin Crest","Guillaume's Face"],"gloves":["Dracul's Grasp","Soul Drainer","Steelrend"],"belt":["Arachnid Mesh","String of Ears"],"boots":["Marrowwalk","Gore Rider","War Traveler"],"ring1":["Bul-Kathos' Wedding Band","Wisp Projector","The Stone of Jordan"],"ring2":["Wisp Projector","Bul-Kathos' Wedding Band","Carrion Wind"],"amulet":["Highlord's Wrath","Mara's Kaleidoscope","Seraph's Hymn"],"body":["Arkaine's Valor","Guardian Angel","Skullder's Ire"]}},"sorceress":{"runs":50,"players":50,"tiers":[119,109,97,87,76],"skills":[["staticField","Static Field",1.92],["lightning","Lightning",1.88],["hydra","Hydra",1.32],["chainLightning","Chain Lightning",1.1],["meteor","Meteor",1.1],["blizzard","Blizzard",0.92],["thunderStorm","Thunder Storm",0.92],["frostNova","Frost Nova",0.88],["fireBall","Fire Ball",0.88],["teleport","Teleport",0.68],["frozenOrb","Frozen Orb",0.61],["fireBolt","Fire Bolt",0.56],["chargedBolt","Charged Bolt",0.48],["chillingArmor","Chilling Armor",0.41],["fireWall","Fire Wall",0.36],["glacialSpike","Glacial Spike",0.25],["nova","Nova",0.24],["frozenArmor","Frozen Armor",0.2],["blaze","Blaze",0.08],["inferno","Inferno",0.08],["iceBlast","Ice Blast",0.04]],"mods":{"frozenOrb":"shatter","frozenArmor":"brittle","staticField":"wider","chainLightning":"stormChain","blizzard":"hailstorm","frostNova":"deepFreeze","lightning":"thunderbolt","meteor":"shower","fireBall":"cluster","fireBolt":"split","fireWall":"crossfire","hydra":"triHydra","thunderStorm":"wrath","glacialSpike":"avalanche","teleport":"frostStep","chillingArmor":"lastStand","nova":"coldSnap","chargedBolt":"split","iceBlast":"ricochet","blaze":"frostTrail"},"passives":[["energyShield","Energy Shield",2],["fireMastery","Fire Mastery",2],["coldMastery","Cold Mastery",2],["lightningMastery","Lightning Mastery",2],["warmth","Warmth",2],["enchant","Enchant",2],["fcr","Faster Cast Rate",1.96],["replenish","Replenish Life",1.88],["frw","Faster Run/Walk",1.64],["vitality","Vitality",1.48],["telekinesis","Telekinesis",0.83]],"attributes":{"strength":0,"dexterity":0,"vitality":0.01,"energy":0.99},"gear":{"weapon":["Eschuta's Temper","The Oculus","Mang Song's Lesson"],"gloves":["Magefist","Trang-Oul's Claws","Frostburn"],"belt":["Arachnid Mesh","Trang-Oul's Girth","Nightsmoke"],"boots":["Marrowwalk","War Traveler","Silkweave"],"amulet":["Mara's Kaleidoscope","Highlord's Wrath","Seraph's Hymn"],"ring1":["The Stone of Jordan","Wisp Projector","Bul-Kathos' Wedding Band"],"ring2":["The Stone of Jordan","Wisp Projector","Bul-Kathos' Wedding Band"],"head":["Harlequin Crest","Griffon's Eye","Andariel's Visage"],"body":["Skin of the Vipermagi","Arkaine's Valor","Ormus' Robes"],"shield":["Lidless Wall","Spirit Ward","The Ward"]}}}};
  // 僅接受已知欄位與型別，不接收原型屬性或任意指令。
  function merge(base, value) {
    return Object.fromEntries(Object.entries(base).map(([k, v]) => [k, v && typeof v === "object" ? merge(v, value?.[k]) : typeof value?.[k] === typeof v ? value[k] : v]));
  }
  let settings = merge(defaults, {}), storageNote = "";
  // 兩個分頁各有總開關：戰鬥輔助（enabled）、自動戰鬥（progressEnabled）。
  const questOn = () => settings.progressEnabled && settings.quest.autoProgress;
  // Pandemonium 材料的物品代碼：三把鑰匙（pk1 烏伯鑰匙、pk2、pk3）與三個器官（mbr、dhn、bey）。
  const PANDEMONIUM_BASES = ["pk1", "pk2", "pk3", "mbr", "dhn", "bey"];
  const terrorMode = () => settings.progressEnabled ? settings.terror.mode : "off";
  // 各分頁只受自己的總開關控制；自動戰鬥不會隱含開啟戰鬥輔助。
  const assistOn = () => settings.enabled;
  try {
    const stored = JSON.parse(localStorage.getItem(KEY) || "{}");
    settings = merge(defaults, stored);
    // 版本 3 起預設撿取所有品質；舊設定只補開普通與魔法，不覆蓋其他選擇。
    if ((stored.version || 0) < 3) { settings.loot.qualityThreshold.normal = true; settings.loot.qualityThreshold.magic = true; }
    // 版本 5：死亡保護改為預設開啟、離場後自動繼續（舊版預設關閉，並非使用者選的）。
    if ((stored.version || 0) < 5) { settings.deathProtection.enabled = true; settings.deathProtection.disableAutomation = false; settings.version = 5; }
    // 版本 6：實測重置技能後原版立即清空技能，被收回的等級要到下一難度才還回，角色整個難度沒技能而卡死；自動重置改為預設關閉。
    if ((stored.version || 0) < 6) { settings.build.redraft = false; settings.version = 6; }
    // 版本 7（依使用者要求）：全圖撿裝備就是全部撿回來，沒用的賣掉換金幣，有用的穿上或存倉庫；不再只撿比身上好的。
    if ((stored.version || 0) < 7) { settings.loot.onlyUpgrades = false; settings.loot.vacuum = true; settings.version = 7; }
    // 版本 8（依使用者說明）：原版重置技能後立刻進入選卡，舊版是因選卡被暫停條件擋住才停在沒技能；選卡已改為一定會選，重新開啟自動重置。
    if ((stored.version || 0) < 8) { settings.build.redraft = true; settings.version = 8; }
    // 版本 9：新增遊戲修改分頁與總開關（無敵、致命攻擊、一擊必殺、技能等級最高、怪物數量最大化、一般怪物變精英、無限重抽、最高掉寶與金幣）
    if ((stored.version || 0) < 9) {
      settings.cheat = {
        enabled: false,
        invincible: false,
        maxCrit: false,
        oneHitKill: false,
        maxSkills: false,
        maxMonsterDensity: false,
        monsterDensity10x: false,
        allElites: false,
        infiniteRerolls: false,
        maxDropRate: false,
        maxGoldRate: false,
        maxXp: false,
        ...stored.cheat
      };
      settings.version = 9;
    }
    if (stored.cheat?.monsterDensity10x && !stored.cheat?.maxMonsterDensity) {
      settings.cheat.maxMonsterDensity = true;
    }
    settings.cheat.monsterDensity10x = !!settings.cheat.maxMonsterDensity;
    // 版本 10：自動配技能支援自動重抽（autoReroll），升級出現不合適卡片時自動使用重抽。
    if ((stored.version || 0) < 10) {
      if (settings.build.autoReroll === undefined) settings.build.autoReroll = true;
      settings.version = 10;
    }
  }
  catch { storageNote = "設定無法讀取，使用預設值"; }
  // 舊版存的設定沒有之後新增的作弊欄位時，補上預設值（否則設定介面會讀到 undefined）。
  settings.cheat = { ...defaults.cheat, ...settings.cheat };
  // 走位只開放開關、戰鬥方式、閃避飛彈；距離與係數一律用內建值（依職業自動調整）。
  for (const k of ["chaseFirst", "kiteDistance", "ignoreDamagePercent", "attackRange", "projectileSafetyRadius", "smoothingFactor"]) settings.movement[k] = defaults.movement[k];
  const bounds = {
    "deathProtection.emergencyHpPercent": [1, 90],
    "potion.hpThreshold": [10, 90], "potion.lethalLookaheadSec": [0.1, 1],
    "potion.hpCooldownMs": [500, 5000], "potion.fallbackHpSlot": [1, 4],
    "movement.kiteDistance": [40, 500], "movement.ignoreDamagePercent": [0, 50], "movement.attackRange": [100, 800], "movement.projectileSafetyRadius": [20, 100], "movement.smoothingFactor": [0.1, 1],
    "loot.searchRadius": [50, 1200], "loot.minRuneTier": [1, 33], "terror.targetFarmTier": [1, 9999], "terror.postClearWaitSec": [1, 15], "gear.minGainPercent": [0, 50],
  };
  // 推層與重刷共用既有 mode，兩個開關互斥，舊設定無須人工轉換。
  // 自動戰鬥的「自動模式」：推關（普通→惡夢→地獄往上打）、推層（恐怖層數往上推）、固定關卡（重複刷指定難度）、固定層數（重刷指定層）。
  // 只是既有設定的組合（quest.autoProgress、terror.mode、quest.farmDifficulty），戰鬥邏輯與舊設定不必改。
  const autoMode = () => settings.terror.mode === "progress" ? "terror" : settings.terror.mode === "farm" ? "fixedTier" : settings.quest.farmDifficulty !== "off" ? "fixedDifficulty" : "quest";
  // 依使用者要求：自動模式分「任務模式」（完成所有任務並練到 99 級）與「天梯模式」（推關＝恐怖層往上推、固定關卡＝重複刷指定難度、固定層數＝重刷指定層）。
  const DIFF_ZH = { normal: "普通", nightmare: "惡夢", hell: "地獄" };
  const modeLabel = () => ({ quest: "任務模式", terror: "天梯・推關", fixedDifficulty: "固定關卡 " + (DIFF_ZH[settings.quest.fixedDifficulty] || ""), fixedTier: "天梯・固定層數 " + settings.terror.targetFarmTier + " 層" })[autoMode()];
  // 依使用者要求：固定關卡模式是獨立的自動模式（不在天梯模式裡）；天梯模式只有推關與固定層數。
  const autoKind = () => ["quest", "fixedDifficulty"].includes(autoMode()) ? autoMode() : "ladder";
  const get = (path) => path === "autoKind" ? autoKind() : path === "ladderMode" ? (["terror", "fixedTier"].includes(autoMode()) ? autoMode() : "terror") : path === "autoMode" ? autoMode() : path === "terror.progressEnabled" ? settings.terror.mode === "progress" : path === "terror.farmEnabled" ? settings.terror.mode === "farm" : path.split(".").reduce((o, k) => o[k], settings);
  function put(path, value) {
    if (path === "autoKind") { if (value !== autoKind()) put("autoMode", value === "ladder" ? "terror" : value); return; }
    if (path === "ladderMode") { put("autoMode", value); return; }
    if (path === "autoMode") {
      settings.terror.mode = value === "terror" ? "progress" : value === "fixedTier" ? "farm" : "off";
      settings.quest.autoProgress = value === "quest" || value === "fixedDifficulty";
      settings.quest.farmDifficulty = value === "fixedDifficulty" ? settings.quest.fixedDifficulty : "off";
      return;
    }
    if (path === "quest.fixedDifficulty" && settings.quest.farmDifficulty !== "off") settings.quest.farmDifficulty = value;
    if (["terror.progressEnabled", "terror.farmEnabled"].includes(path)) {
      const mode = path === "terror.progressEnabled" ? "progress" : "farm";
      if (value) settings.terror.mode = mode;
      else if (settings.terror.mode === mode) settings.terror.mode = "off";
      return;
    }
    const keys = path.split("."), last = keys.pop(); keys.reduce((o, k) => o[k], settings)[last] = value;
    if (path === "cheat.maxMonsterDensity") settings.cheat.monsterDensity10x = !!value;
    if (path === "cheat.monsterDensity10x") settings.cheat.maxMonsterDensity = !!value;
  }
  function normalize() {
    for (const [path, [min, max]] of Object.entries(bounds)) {
      const n = get(path), fallback = path.split(".").reduce((o, k) => o[k], defaults);
      put(path, Math.min(max, Math.max(min, Number.isFinite(n) ? n : fallback)));
    }
    for (const path of ["loot.minRuneTier", "terror.targetFarmTier", "potion.fallbackHpSlot"]) put(path, Math.round(get(path)));
    if (!["off", "progress", "farm"].includes(settings.terror.mode)) settings.terror.mode = "off";
    if (!["off", "normal", "nightmare", "hell"].includes(settings.quest.farmDifficulty)) settings.quest.farmDifficulty = "off";
    if (!["normal", "nightmare", "hell"].includes(settings.quest.fixedDifficulty)) settings.quest.fixedDifficulty = settings.quest.farmDifficulty !== "off" ? settings.quest.farmDifficulty : "hell";
    if (!["auto", "melee", "ranged"].includes(settings.movement.combatStyle)) settings.movement.combatStyle = "auto";
    settings.version = defaults.version;
  }
  normalize();
  // 依使用者要求：遊戲重新整理或重新開啟後點書籤，兩個總開關預設關閉；同一頁面內重新點書籤則沿用原本狀態。
  // 狀態記在頁面記憶體（window.__d2autobotSwitches），重新整理就消失；其他設定照舊讀取儲存。
  // 遊戲修改總開關（cheat.enabled）同樣：重新整理後預設關閉，同頁重新點書籤沿用。
  { const live = window.__d2autobotSwitches; settings.enabled = !!live?.enabled; settings.progressEnabled = !!live?.progressEnabled; settings.cheat.enabled = !!live?.cheat; }
  const abort = new AbortController(), restores = [], blockedLoot = new WeakMap();
  let alive = true, game = priorGame, lastStep = -Infinity, lastHp = -Infinity;
  let manualUntil = 0, lootTarget = null, lootSince = 0, ownWalk = null, ownReach = null;
  let smooth = { x: 0, y: 0 }, stuck = null, stuckCount = 0, clearAt = 0, clearWorld = null, transition = false;
  let errors = 0, lastAction = "待命", hookNote = "正在定位遊戲模組", hookUrl = "", actionAt = 0, cardActionAt = -Infinity, gameplayCompatible = false;
  let retreat = null, protectedWorld = null;
  const finite = Number.isFinite, point = (p) => p && finite(p.x) && finite(p.y);
  const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y), live = (e) => point(e) && !e.dead;
  const unit = (x, y) => { const n = Math.hypot(x, y); return n > 0.001 ? { x: x / n, y: y / n } : { x: 0, y: 0 }; };
  function visible(el) { if (!el || el.classList.contains("hidden")) return false; const css = getComputedStyle(el); return css.display !== "none" && css.visibility !== "hidden"; }
  // 新版暫停選單可能繪於 Canvas；已取得實例時以 Game.state 為準。
  const paused = () => game ? game.state === "paused" : visible(document.getElementById("paused")) || document.body.classList.contains("frontend-over-run");
  const toolsMenuOpen = () => paused() || document.body.classList.contains("frontend-open");
  function release() {
    if (game?.walkTarget === ownWalk) game.walkTarget = null;
    if (ownReach && game?.world?.reaching === ownReach) game.world.reaching = null;
    ownWalk = ownReach = lootTarget = stuck = null; stuckCount = 0;
    smooth = { x: 0, y: 0 };
  }
  // 只儲存使用者在面板上選的設定；停止輔助、死亡保護、錯誤停機等自動關閉只在本次有效，下次開啟仍是上次選的設定。
  let chosen = null;
  function save(fromUser = false) {
    normalize();
    window.__d2autobotSwitches = { enabled: settings.enabled, progressEnabled: settings.progressEnabled, cheat: settings.cheat.enabled };
    if (fromUser || !chosen) chosen = JSON.parse(JSON.stringify(settings));
    try { localStorage.setItem(KEY, JSON.stringify(chosen)); storageNote = ""; }
    catch { storageNote = "設定無法儲存，本次仍有效"; }
    refreshControls();
  }
  // 自動停機（如離場失敗）不改寫使用者儲存的設定；使用者按「停止輔助」才存成關閉（依使用者回報：舊版按停止後下次載入又是開的）。
  function stop(reason = "輔助已停止", byUser = false) { settings.enabled = false; settings.progressEnabled = false; setPickupRadius(pickupOwner, false); release(); lastAction = reason; save(byUser); }
  function manual(e) {
    if (!e.isTrusted || host.contains(e.target) || e.target === launcher || e.target === stopButton) return;
    manualUntil = performance.now() + 1200;
    release();
  }
  // 物品名稱繁中化（狀態列用）：沿用修改器的字典與 zh.js 規則——整句查字典；魔法物品拆成字尾＋字首＋底材；稀有兩個字分開翻。
  let zhDict = null;
  const isEn = () => (window.__d2lang ? window.__d2lang.get() === "en" : window.LANG === "en");
  const trAuto = (s) => (isEn() && typeof window.tr === "function" ? window.tr(s) : s);
  if (!isEn() && (window.__d2zhPromise || window.__d2zhUrl)) (window.__d2zhPromise ??= fetch(window.__d2zhUrl).then((r) => r.ok ? r.json() : null).catch(() => null)).then((d) => { zhDict = d; });
  const zt = (en) => (isEn() ? en : zhDict?.[en] || en);
  function itemZh(item) {
    if (!item) return "";
    const name = String(item.name || ""), base = String(item.base || "");
    if (isEn()) return name || base;
    if (!zhDict) return name || base;
    if (!name) return zt(base);
    if (zhDict[name]) return zhDict[name];
    const i = base ? name.indexOf(base) : -1;
    if (i >= 0) { const pre = name.slice(0, i).trim(), suf = name.slice(i + base.length).trim(); return (suf ? zt(suf) : "") + (pre ? zt(pre) : "") + zt(base); }
    const words = name.split(" ");
    if (words.length === 2 && words.every((w) => zhDict[w])) return words.map(zt).join("");
    return name;
  }
  function keyPulse(code, key) {
    const target = document.activeElement || document.body, init = { key, code, bubbles: true, cancelable: true, composed: true };
    target.dispatchEvent(new KeyboardEvent("keydown", init));
    target.dispatchEvent(new KeyboardEvent("keyup", init));
  }
  function hudPool(id) {
    const el = document.getElementById(id);
    if (!el) return null;
    const text = [el.textContent, el.getAttribute("aria-label"), el.title].filter(Boolean).join(" ").replace(/,/g, "");
    const m = text.match(/(\d+(?:\.\d+)?)\s*\/\s*(\d+(?:\.\d+)?)/);
    return m && +m[2] > 0 ? { now: +m[1], max: +m[2] } : null;
  }
  function readState(g) {
    const w = g?.world, p = w?.player;
    if (point(p) && finite(p.life) && finite(p.maxLife) && p.maxLife > 0) return {
      w, p, hp: { now: p.life, max: p.maxLife }, mp: finite(w.mana?.mana) && w.mana.max > 0 ? { now: w.mana.mana, max: w.mana.max } : null,
      enemies: Array.isArray(w.enemies) ? w.enemies.filter((e) => live(e) && e.rank !== "breakable") : [], jars: Array.isArray(w.enemies) ? w.enemies.filter((e) => live(e) && e.rank === "breakable") : [], shots: Array.isArray(w.hostiles) ? w.hostiles.filter(live) : [], pickups: Array.isArray(w.pickups) ? w.pickups.filter(live) : [],
    };
    return { hp: hudPool("life-text"), mp: hudPool("mana-text"), enemies: [], jars: [], shots: [], pickups: [] };
  }
  // 已確認敵方飛彈在 hostiles；projectiles 主要是玩家技能，不計入威脅。
  // 傷害採保守估計，未重現全部抗性、格擋、護盾與附加傷害。
  // 繞圈閃避的方向（1／−1），撞牆或卡住時由走位翻轉。
  let strafeSide = 1;
  const sharedCooldownShots = new Set(["coldunique", "frostnova", "mephfrostnova", "diabfire", "baal nova", "baal cold maker", "baal inferno", "chainlightning", "death mauler", "viper_firecloud"]);
  function threats(s) {
    let damage = 0, dodgeX = 0, dodgeY = 0;
    if (!s.p) return { damage, dodgeX, dodgeY };
    const p = s.p, horizon = settings.potion.lethalLookaheadSec, taken = Math.max(1, finite(p.damageTaken) ? p.damageTaken : 1);
    // 原版 itemArt 的特定飛彈共用命中冷卻，最短為 3／25 秒；以最短冷卻保守估算，避免同一波冰環全部重複計傷。
    const cooldownDamage = [];
    for (const shot of s.shots) {
      const vx = shot.vx || 0, vy = shot.vy || 0, v2 = vx * vx + vy * vy, dx = p.x - shot.x, dy = p.y - shot.y;
      const time = v2 > 0 ? Math.max(0, Math.min(1, (dx * vx + dy * vy) / v2)) : 0;
      if (finite(shot.life) && time > shot.life) continue;
      const x = shot.x + vx * time, y = shot.y + vy * time, radius = (shot.radius || 0) + (p.radius || 12), near = Math.hypot(p.x - x, p.y - y);
      const hitRadius = radius + 10, dot = dx * vx + dy * vy;
      const discriminant = dot * dot - v2 * (dx * dx + dy * dy - hitRadius * hitRadius);
      const enter = v2 > 0 && dot >= 0 && discriminant >= 0 ? Math.max(0, (dot - Math.sqrt(discriminant)) / v2) : Math.hypot(dx, dy) <= hitRadius ? 0 : Infinity;
      if (enter <= horizon && (!finite(shot.life) || enter <= shot.life)) {
        const hit = (Math.max(0, shot.damage || 0) + Math.max(0, shot.effect?.damage || 0)) * taken * Math.max(1, p.missileTaken || 1);
        if (sharedCooldownShots.has(shot.name)) cooldownDamage.push(hit); else damage += hit;
      }
      // 不痛不癢的攻擊（單發低於目前生命的門檻％）不閃，專心輸出；仍計入致命預估。
      const hurt = (Math.max(0, shot.damage || 0) + Math.max(0, shot.effect?.damage || 0)) * taken * Math.max(1, p.missileTaken || 1);
      if (hurt < p.life * settings.movement.ignoreDamagePercent / 100) continue;
      // 依使用者要求：不要硬接傷害。單發 ≥ 目前生命 25％ 的重擊，安全距離與閃避力道加倍；方向是離開彈道的橫向（不一定往後退）。
      const heavy = hurt >= p.life * 0.25;
      if (near > radius + settings.movement.projectileSafetyRadius * (heavy ? 2 : 1) || dx * vx + dy * vy < 0) continue;
      let away = unit(p.x - x, p.y - y);
      if (!away.x && !away.y) away = unit(-vy, vx);
      const force = 4 / Math.max(0.15, time + 0.15) * (heavy ? 2 : 1);
      dodgeX += away.x * force; dodgeY += away.y * force;
    }
    cooldownDamage.sort((a, b) => b - a);
    damage += cooldownDamage.slice(0, Math.floor(horizon / (3 / 25)) + 1).reduce((a, b) => a + b, 0);
    // 貼身近戰傷害：依原版怪物近戰距離（見 meleeGap）＋20 預留下一步；不會近戰的怪不算。
    for (const e of s.enemies) { const gap = meleeGap(e); if (gap !== -Infinity && dist(e, p) <= (e.radius || 12) + (p.radius || 12) + gap + 20) damage += Math.max(0, e.damage || 0) * taken; }
    // 依使用者要求：精英／王的近戰不要硬吃。一擊 ≥ 目前生命 15％ 的精英／王靠近到近戰範圍＋40 時，
    // 以橫向繞圈為主（左右移動閃避，維持原本繞行方向）並略往外，近戰職業也邊繞邊打。
    for (const e of s.enemies) {
      if (!["actBoss", "boss", "champion"].includes(e.rank) && typeof e.name !== "string") continue;
      const gap = meleeGap(e), d = dist(e, p);
      if (gap === -Infinity || Math.max(0, e.damage || 0) * taken < p.life * 0.15 || d > (e.radius || 12) + (p.radius || 12) + gap + 40) continue;
      const out = unit(p.x - e.x, p.y - e.y), side = { x: -out.y * strafeSide, y: out.x * strafeSide };
      dodgeX += side.x * 5 + out.x * 2; dodgeY += side.y * 5 + out.y * 2;
    }
    return { damage, dodgeX, dodgeY };
  }
  function drink(s, now, lethal = false) {
    const columns = s.w?.belt?.columns;
    if (s.w?.terror?.affixes?.includes("nobelt")) { lastAction = "本層禁止使用藥帶"; return false; }
    if (Array.isArray(columns) && typeof game?.drinkFrom === "function") {
      // 遊戲沒有魔力藥水；腰帶全放生命藥水（原版欄位內容為 potion）。
      const kinds = lethal ? ["rejuvenation", "healing", "potion"] : ["healing", "potion", "rejuvenation"];
      let slot = -1;
      for (const kind of kinds) { slot = columns.findIndex((c) => c?.[0] === kind); if (slot >= 0) break; }
      if (slot < 0) { lastAction = "藥帶沒有生命藥水"; return false; }
      const count = columns[slot].length, kind = columns[slot][0];
      game.drinkFrom(slot);
      if (columns[slot].length >= count) return false;
    } else {
      const slot = settings.potion.fallbackHpSlot;
      keyPulse("Digit" + slot, String(slot));
    }
    lastHp = now;
    lastAction = lethal ? "預估致命傷害，已喝水" : "已喝生命藥水";
    return true;
  }
  function potions(s, danger, now) {
    let healingFailed = false;
    const p = settings.potion, lethal = p.lethalProtection && danger.damage >= s.hp?.now && danger.damage > 0;
    // 實測（地獄陣亡紀錄）：野蠻人 51％ 血面對暗黑破壞神，藥帶還有 6 瓶卻沒喝（門檻 50％），被一擊 2045 打死；
    // 600 內有幕末魔王或頭目時門檻提高到 80％，先補滿再吃王的大招。
    const bossNear = (s.enemies || []).some((e) => ["actBoss", "boss"].includes(e.rank) && dist(e, s.p) < 600);
    const threshold = bossNear ? Math.max(p.hpThreshold, 80) : p.hpThreshold;
    if (s.hp?.now > 0 && s.hp.now < s.hp.max && now - lastHp >= p.hpCooldownMs && (p.autoHp && s.hp.now / s.hp.max * 100 <= threshold || lethal)) {
      if (drink(s, now, lethal)) return false;
      healingFailed = true;
    }
    return healingFailed;
  }
  function healingAvailable(s, now) {
    if (s.hp?.now >= s.hp?.max || now - lastHp < settings.potion.hpCooldownMs || s.w?.terror?.affixes?.includes("nobelt")) return false;
    const columns = s.w?.belt?.columns;
    return typeof game?.drinkFrom === "function" && Array.isArray(columns) && columns.some((c) => ["potion", "healing", "rejuvenation"].includes(c?.[0]));
  }
  let hellClears = 0;
  // 只在同一份遊戲存檔物件上記住親眼觀察到的地獄通關；熱重載保留，重開遊戲後需再次確認。
  const hellClearedSaves = window.__d2autobotHellClearedSaves ??= new WeakMap();
  const cleanupReady = (g) => autoMode() === "quest" && (g?.world?.player?.level ?? 0) >= 99 && !!g?.save && !!hellClearedSaves.get(g.save)?.has(g.kit?.id);
  function deathReason(s, danger, now, healingFailed = false) {
    if (!assistOn() || !settings.deathProtection.enabled || !s.p || !s.hp || s.hp.now <= 0 || s.w === protectedWorld) return "";
    // 無敵實際生效時（遊戲修改總開關開啟且無敵開啟）傷害會被攔截，不需要因預估傷害離場。
    if (settings.cheat?.enabled && settings.cheat.invincible) return "";
    if (danger.damage > 0 && danger.damage >= s.hp.now && (healingFailed || !healingAvailable(s, now))) return "預估致命傷害且無可用回血藥水";
    if (s.hp.now / s.hp.max * 100 <= settings.deathProtection.emergencyHpPercent && now - lastHp < settings.potion.hpCooldownMs) return "生命低於緊急門檻且回血藥水冷卻中";
    // 依使用者要求：死亡保護只看「預判接下來的傷害會不會致死」，不再以被包圍判定
    //（實測 35 存檔的觸發幾乎都是包圍判定，造成同一處反覆離場→繼續→離場而卡關）。
    return "";
  }
  function retreatFailed(message) {
    const g = retreat?.g;
    retreat = null; stop("死亡保護離場未確認：" + message);
    try { if (g?.state === "playing") g.pause?.(); } catch { /* 保留停機狀態與錯誤訊息。 */ }
  }
  function checkRetreat(now) {
    if (!retreat) return;
    const g = retreat.g;
    if (["camp", "town", "select"].includes(g.state)) {
      lastAction = g.state === "select" ? "死亡保護：已離開本局至角色選單（此模式未進入村莊）" : "死亡保護：已離開戰鬥回到村莊";
      retreat = null;
    } else if (g.state === "loading" && now < (retreat.hardDeadline ??= now + 22000)) {
      // 實測全新存檔首次載入營地常超過 8 秒；載入中不算逾時（總上限約 30 秒）。
      retreat.deadline = Math.max(retreat.deadline, now + 1000);
    } else if (now >= retreat.deadline) retreatFailed("原版未在時限內回到安全畫面，已停止自動化");
  }
  async function returnToSafety(g, s, reason, now) {
    if (retreat || !alive) return;
    protectedWorld = s.w;
    retreat = { g, deadline: now + 8000 };
    release();
    // 死亡保護離場也算一次失敗：最高難度累積 2 次就照既有邏輯回低一級刷一局。
    if (g.difficulty) failStreak[g.difficulty] = (failStreak[g.difficulty] || 0) + 1;
    // 只有設定「離場後關閉總開關」才停止推進；否則回營地後由營地流程自動繼續上次進度。
    if (settings.deathProtection.disableAutomation) { settings.terror.mode = "off"; settings.quest.autoProgress = false; settings.enabled = false; settings.progressEnabled = false; }
    lastAction = "死亡保護：" + reason + "，正在離開本局"; save();
    try {
      // 原版已確認的暫停選單出口：leaveRun -> toMenu -> enterCamp（營地模式）。
      if (g.state === "playing" && typeof g.pause === "function") g.pause();
      if (g.state === "paused" && typeof g.leaveRun === "function") {
        await g.leaveRun();
      } else {
        // 相容舊版 DOM 選單；Canvas 選單無內部函式時無法可靠代按。
        if (g.state === "playing") keyPulse("Escape", "Escape");
        let clicked = false;
        for (let attempt = 0; attempt < 2 && alive && retreat; attempt++) {
          const menus = document.querySelectorAll("#paused,#pause-menu,[data-pause-menu]");
          const button = [...menus].filter(visible).flatMap((menu) => [...menu.querySelectorAll("button")]).find((el) => visible(el) && /^(?:SAVE AND EXIT(?: GAME)?|EXIT ANYWAY|LEAVE(?: RUN)?|RETURN TO TOWN|放棄(?:本局)?|離開(?:本局|戰鬥)?|回到村莊|儲存並離開)$/i.test(el.textContent.trim()));
          if (!button) break;
          button.click(); clicked = true;
          await new Promise((resolve) => setTimeout(resolve, 0));
          if (["camp", "town", "select", "loading"].includes(g.state)) break;
        }
        if (!clicked) throw new Error("找不到原版 leaveRun 或可辨識的暫停離開按鈕");
      }
      if (alive) checkRetreat(performance.now());
    } catch (err) { if (alive && retreat) retreatFailed(String(err.message || err)); }
  }

  // 實測（官方 wiki）：此遊戲沒有單獨符文物品，符文之語掉落即已完成，以 rarity=runeword 撿取並由自動穿裝評估。
  function accepts(drop) {
    const item = drop.item;
    // 原版寶箱是 kind=chest 的掉落物（碰到即收進待開寶箱），一律撿。
    if (drop.kind === "chest") return true;
    // 實測：地上藥水是 kind=potion 且沒有 item，舊版只接受金幣，藥水全被略過（角色 49/294 血、腳邊 4 瓶藥水沒撿）。
    // 遊戲 20261101.1：地上藥水種類有 potion／rejuvenation／mana（法師的魔力藥水補能量護盾，滿了才入腰帶）；腰帶有空或可直接使用就撿。
    if (["potion", "rejuvenation", "mana"].includes(drop.kind)) { if (drop.kind === "mana" && game?.kit?.id !== "sorceress") return false; const cols = game?.world?.belt?.columns; return !Array.isArray(cols) || cols.some((c) => (c?.length || 0) < 4) || drop.kind === "mana"; }
    if (!item) return false;
    // 烏伯鑰匙與器官（Pandemonium 材料，遊戲 itemArt 的 Iv 名單）即使關閉任務自動推進也要撿，否則 Terror 首領掉落會被略過。
    if (item.type === "quest") return questOn() || PANDEMONIUM_BASES.includes(item.base);
    // 交由遊戲原版判斷保留、隱藏與自動販售，避免輔助器再套用另一套品質規則。遊戲 20261105.3 新增 hidesell。
    let decision = drop.loot;
    try { if (typeof game?.loot === "function") decision = game.loot(item); } catch { return false; }
    return decision === "pick" || decision === "sell" || decision === "hidesell";
  }

  // 撿拾距離（原版 player.pickupRadius，基礎 70）：開啟「全圖撿寶」時放大到全圖，原版自己把掉落物吸過來；撿哪些仍由遊戲過濾器決定。
  const FULL_MAP_PICKUP = 1e6;
  let naturalPickupRadius = null, pickupOwner = null;
  function setPickupRadius(p, on) {
    if (!p || !finite(p.pickupRadius)) return;
    // 原版重算過（換裝、升級）後的值不是我們設的全圖值，就當成新的原始值記住。
    if (p.pickupRadius !== FULL_MAP_PICKUP) naturalPickupRadius = p.pickupRadius;
    if (on) { p.pickupRadius = FULL_MAP_PICKUP; pickupOwner = p; }
    else if (pickupOwner === p) { if (p.pickupRadius === FULL_MAP_PICKUP && naturalPickupRadius != null) p.pickupRadius = naturalPickupRadius; pickupOwner = null; }
  }
  // 會去撿的掉落物（不含罐子）；通關後沒有就直接離開。
  const wantedLoot = (s, now, lootOn = assistOn() && settings.loot.enabled) => s.pickups.filter((e) => !e.flippy && !e.discarded && (blockedLoot.get(e) || 0) < now && (lootOn || e.item?.type === "quest") && dist(e, s.p) <= settings.loot.searchRadius && accepts(e));
  // 全圖撿取（非原版行為，可關閉）：要撿的掉落物設原版 magnet 自己飛來；寶箱原版不吸，直接移到角色身上讓原版開啟。
  function vacuum(s, now) {
    setPickupRadius(s.p, assistOn() && settings.loot.enabled && settings.loot.vacuum);
    // 依使用者要求：全圖吸經驗（非原版行為，可關閉）——地上的經驗寶石（kind=xp）也設原版 magnet 自己飛來，不受撿裝開關影響。
    if (assistOn() && settings.loot.vacuumXp && s.p) for (const e of s.pickups) if (e.kind === "xp" && !e.dead) e.magnet = true;
    if (assistOn() && settings.loot.vacuumGold && s.p) for (const e of s.pickups) if (e.kind === "gold" && !e.dead && !e.flippy && !e.discarded) e.magnet = true;
    if (!assistOn() || !settings.loot.enabled || !settings.loot.vacuum || !s.p) return;
    for (const e of s.pickups) {
      // 任務物品（烏伯鑰匙、Horadric Codex 等）與裝備一起吸過來，不受任務推進開關限制；其餘仍依 accepts（遊戲 loot 過濾）。
      if (e.dead || e.flippy || e.discarded || e.kind === "xp" || !(e.item?.type === "quest" || accepts(e))) continue;
      if (e.kind === "chest") { e.x = s.p.x; e.y = s.p.y; e.sprite?.position?.set?.(e.x, e.y); }
      // 裝備：原版吸附迴圈會跳過有 item 的掉落物（magnet 對裝備無效），所以直接移到角色身上，由原版 Lle（距離內）＋carry（背包空位）收取；剛丟下的（dropped）不動。
      else if (e.item) { if (!e.dropped) { e.x = s.p.x; e.y = s.p.y; e.sprite?.position?.set?.(e.x, e.y); } }
      else e.magnet = true;
    }
  }
  function lootGoal(s, now) {
    const lootOn = assistOn() && settings.loot.enabled;
    if (!lootOn && !questOn()) return null;
    if (lootTarget && !lootTarget.dead && now - lootSince > 3500) { blockedLoot.set(lootTarget, now + 15000); lootTarget = null; }
    // 實測（陣亡紀錄）：惡夢亞馬遜滿血撿東西時讓頭目 Corpsefire 從 101 貼到 1，一擊 900 血陣亡（威脅只估 1.7）。
    // 遠程職業在頭目／精英 180 內不撿東西（交給走位拉開），也不撿頭目／精英 180 內的掉落物。
    const elites = isMelee() ? [] : s.enemies.filter((e) => ["actBoss", "boss", "champion"].includes(e.rank));
    if (elites.some((e) => dist(e, s.p) < 180)) { lootTarget = null; return null; }
    const candidates = wantedLoot(s, now, lootOn).filter((c) => !elites.some((e) => dist(e, c) < 180));
    const lowHp = s.hp.now / s.hp.max < 0.7;
    const weight = (e) => e.kind === "potion" ? (lowHp ? 2500 : 600) : e.item?.type === "quest" ? 2000 : e.kind === "chest" ? 1500 : ["unique", "set", "runeword"].includes(e.item?.rarity) ? 1000 : e.item ? 500 : 50;
    candidates.sort((a, b) => weight(b) - weight(a) || dist(a, s.p) - dist(b, s.p));
    // 原版碰到罐子、木桶會自動踢破（可能掉藥水），走過去即可；不呼叫內部擊破函式。
    // 實測：最終王倒下（出現通關門／clearing）後不再踢罐；附近有敵人時也不為罐子冒險；藥帶滿了也不踢。
    const beltRoom = !Array.isArray(s.w.belt?.columns) || s.w.belt.columns.some((c) => (c?.length || 0) < 4);
    // 實測：前期買不起藥水、藥帶全空又不會自動回血，生命偏低時罐子是唯一藥水來源：
    // 藥帶空且生命 < 70％ 時罐子排第一、搜尋距離放寬到 800、只要敵人不貼近就去踢（不必等最終王倒下）。
    const beltEmpty = Array.isArray(s.w.belt?.columns) && s.w.belt.columns.every((c) => !(c?.length));
    const needPotion = beltEmpty && s.hp.now / s.hp.max < 0.7;
    // 依使用者要求踢罐子優先度不要太高：缺藥時排在藥水／寶箱／裝備之後，不缺藥時附近 1.5 倍距離內有怪就不踢。
    // 實測（陣亡紀錄）：惡夢聖騎士 49％ 血、藥帶全空，為踢罐子走進 115 外的毒魔群，一擊 404 陣亡；缺藥時也至少保持 220。
    const calm = !s.enemies.some((e) => e.rank !== "breakable" && dist(e, s.p) < Math.max(220, settings.movement.kiteDistance * (needPotion ? 1 : 1.5)));
    if (lootOn && settings.loot.kickJars && beltRoom && calm && (needPotion || (!game?.clearing && !point(game?.clearing?.portal)))) {
      const jars = s.jars.filter((e) => (blockedLoot.get(e) || 0) < now && dist(e, s.p) <= settings.loot.searchRadius).sort((a, b) => dist(a, s.p) - dist(b, s.p)).slice(0, 1);
      candidates.push(...jars);
    }
    const target = candidates[0];
    if (!target) { lootTarget = null; return null; }
    if (target.rank === "breakable") { if (lootTarget !== target) { lootTarget = target; lootSince = now; } return { x: target.x, y: target.y, kind: "kick", target }; }
    if (lootTarget !== target) { lootTarget = target; lootSince = now; }
    return { x: target.x, y: target.y, kind: "loot", target };
  }
  // 近戰／遠程：依排行榜該職業高手的力量配點比例判斷（≥25％ 為近戰：野蠻人、聖騎士、刺客、德魯伊）。
  // 技能攻擊距離（原版 itemArt-BPHOVK4V.js 靜態分析，2026-11-01）：命中條件為中心距 ≤ 角色半徑＋reach＋怪物半徑，以下為邊緣間距。
  // 未列出的攻擊技能多以 450 為索敵距離（法術、弓、標槍）；0 表示增益／被動，不影響走位。
  const REACH = {
    jab: 58, powerStrike: 58, chargedStrike: 58, lightningStrike: 58, impale: 58, fend: 84,
    tigerStrike: 46, cobraStrike: 46, bladesOfIce: 46, fistsOfFire: 46, clawsOfThunder: 46, dragonClaw: 46, dragonTail: 46, dragonTalon: 90, royalStrike: 128,
    doubleSwing: 48, bash: 54, stun: 54, frenzy: 66, concentrate: 58, berserk: 58, whirlwind: 200, leapAttack: 340, battleCry: 100, warCry: 100, howl: 100,
    shout: 0, battleOrders: 0, battleCommand: 0, taunt: 0, grimWard: 0, leap: 0,
    zeal: 46, smite: 54, sacrifice: 54, vengeance: 54, charge: 90, holyShield: 0, conversion: 220,
  };
  // 角色實際能打到的最遠距離：取已學攻擊技能的最大值；全部都短（< 150）就是近戰配置。
  function myReach() {
    const list = (game?.build?.skills || []).map((x) => REACH[x.id] ?? 450).filter((r) => r > 0);
    return list.length ? Math.max(...list) : 450;
  }
  const isMelee = () => settings.movement.combatStyle === "melee" || (settings.movement.combatStyle === "auto" && myReach() < 150);
  // 實測近戰前期沒藥水，血量見底仍貼身打精英而陣亡：生命低於一半時改用遠程拉距離，回血後再貼身。
  const meleeHurt = () => { const p = game?.world?.player; return !!p && p.maxLife > 0 && p.life / p.maxLife < 0.5; };
  const fighter = () => isMelee() && !meleeHurt();
  // 近戰站在攻擊距離約六成處（不必貼身），遠程照常保持距離。
  const style = () => fighter() ? { kite: Math.max(20, Math.min(myReach(), 150) * 0.6), range: Math.min(myReach(), 150) + 30 } : { kite: settings.movement.kiteDistance, range: settings.movement.attackRange };
  // 依實測：技能自動施放、自動選最近目標，玩家只能移動；任務頭目也用近戰站位，貼近到它成為最近目標才打得到。
  function battleGoal(e, p, kind = "戰鬥") {
    const u = unit(p.x - e.x, p.y - e.y), distance = fighter() || kind === "任務頭目" ? (e.radius || 12) + (p.radius || 12) + Math.min(myReach(), 150) * 0.6 : settings.movement.kiteDistance;
    return { x: e.x + (u.x || 1) * distance, y: e.y + u.y * distance, kind };
  }
  function questGoal(s) {
    const g = game, search = g.search, cage = search?.gibbetSpot;
    const seekOptional = autoMode() !== "quest" || cleanupReady(g);
    // 由原版碰觸機制完成石陣、牢籠與對話；不呼叫 complete() 或更改任務紀錄。
    if (seekOptional && point(cage)) return { ...cage, kind: "任務牢籠" };
    // 依使用者要求：掉落的任務物品（伊尼弗斯卷軸等）要撿；列為任務目標，優先於精英與通關傳送門，不受一般撿取的安全條件限制。
    const questDrop = s.pickups.filter((e) => !e.dead && e.item?.type === "quest" && accepts(e) && point(e)).sort((a, b) => dist(a, s.p) - dist(b, s.p))[0];
    if (seekOptional && questDrop) return { x: questDrop.x, y: questDrop.y, kind: "loot", target: questDrop, quest: true };
    const stones = search?.stones?.logic;
    if (seekOptional && Array.isArray(stones?.spots) && !stones.done) {
      const i = Array.isArray(stones.lit) ? stones.lit.findIndex((x) => !x) : -1;
      if (i >= 0 && point(stones.spots[i])) return { ...stones.spots[i], kind: "任務石陣" };
    }
    if (seekOptional && point(search?.portalSpot)) return { x: search.portalSpot.x, y: search.portalSpot.y, kind: "任務傳送門" };
    // 依實測（尋找凱恩從未完成）：拉卡尼休被原版標為任務頭目（questHeld）卻一滴血沒掉，輔助器一直追其他精英。
    // 原版在 search.watch.watched 追蹤樹頭木拳（掉伊尼弗斯卷軸）與拉卡尼休（有鑰匙時倒下處出現石塊陣），須由玩家擊殺；活著且被標記者優先攻擊。
    const held = [...(search?.watch?.watched?.values?.() || [])].filter((b) => b && !b.dead && b.life > 0 && b.questHeld && point(b));
    if (seekOptional && held.length) { const b = held.reduce((a, x) => dist(x, s.p) < dist(a, s.p) ? x : a); return battleGoal(b, s.p, "任務頭目"); }
    const tyrael = g.clearing?.tyrael;
    if (point(tyrael) && !tyrael.spoke) return { x: tyrael.x, y: tyrael.y, kind: "任務對話" };
    if (settings.quest.prioritizeBoss) {
      // 實測追任何有名字的怪會衝進怪堆被包圍；只追幕末魔王，其他精英由攻擊範圍拉回處理。
      const e = s.enemies.find((e) => e.rank === "actBoss");
      if (e) return battleGoal(e, s.p, "任務敵人");
    }
    return null;
  }
  // 實測：多敵貼近時排斥力互相抵銷，角色原地被圍死；改沿牆面滑動取樣 16 方向，選路徑上離敵最遠者。
  const DIRS_16 = Array.from({ length: 16 }, (_, i) => { const a = i * Math.PI / 8; return { x: Math.cos(a), y: Math.sin(a) }; });
  const DIRS_24 = Array.from({ length: 24 }, (_, i) => { const a = i * Math.PI / 12; return { x: Math.cos(a), y: Math.sin(a) }; });
  const PLAN_STEPS = [70, 150];
  function escapeDirection(s, list = null) {
    const p = s.p, near = list || s.enemies.filter((e) => dist(e, p) < settings.movement.kiteDistance * 1.5);
    let best = null;
    for (let i = 0; i < 16; i++) {
      const dir = DIRS_16[i], dx = dir.x * 15, dy = dir.y * 15;
      let x = p.x, y = p.y, worst = Infinity, moved = 0;
      for (let j = 0; j < 8; j++) {
        const next = typeof s.w.walls?.slide === "function" ? s.w.walls.slide(x, y, dx, dy) : { x: x + dx, y: y + dy };
        if (!point(next)) break;
        moved += Math.hypot(next.x - x, next.y - y); x = next.x; y = next.y;
        for (const e of near) worst = Math.min(worst, dist({ x, y }, e) - (e.radius || 12));
      }
      const score = (worst === Infinity ? 999 : worst) + moved * 0.25;
      if (!best || score > best.score) best = { score, worst, x: dir.x, y: dir.y };
    }
    return best;
  }
  // 實測（陣亡紀錄）：一般怪的 name 是怪物設定物件，舊判斷 !!e.name 讓所有小怪都算精英（威脅 ×3、追「精英」其實追小怪）。
  const isElite = (e) => ["actBoss", "boss", "champion"].includes(e.rank) || typeof e.name === "string";
  const power = (e) => Math.max(1, e.damage || 1) * Math.max(1, e.maxLife || e.life || 1) * (isElite(e) ? 3 : 1);
  function nearestElite(s) { return s.enemies.filter((e) => isElite(e) && dist(e, s.p) < 900).reduce((a, e) => !a || dist(e, s.p) < dist(a, s.p) ? e : a, null); }
  // 全圖走位規劃（依使用者要求：一直保持移動，並分析地圖上所有怪物，而不只是閃開貼近的怪）：
  // 威脅場＝所有存活怪物在 0.6 秒後的預測位置，依「單次傷害佔目前生命比例」加權（精英×2）；
  // 24 方向×2 距離以原版牆面滑動取樣候選點，評分＝−威脅場−飛彈命中−擁擠＋攻擊站位＋目標吸引＋移動慣性。
  // 原版怪物近戰距離（itemArt ig()）：中心距 ≤ 怪物半徑＋角色半徑＋6，觸手類再＋28；type.melee 沒招式的怪不會近戰。
  const meleeGap = (e) => e?.type && Array.isArray(e.type.melee) && !e.type.melee.length ? -Infinity : 6 + (e?.type?.behaviour === "tentacle" ? 28 : 0);
  let planHeading = { x: 1, y: 0 };
  function planMove(s, goal, st, now, pursue = false) {
    const p = s.p, taken = Math.max(1, finite(p.damageTaken) ? p.damageTaken : 1), hpNow = Math.max(1, s.hp.now);
    const foes = s.enemies.map((e) => {
      const d = dist(e, p), u = unit(p.x - e.x, p.y - e.y), sp = Math.min(d, Math.max(40, e.speed || e.moveSpeed || 90) * 0.6);
      const w = Math.min(6, Math.max(0.15, Math.max(0, e.damage || 0) * taken / hpNow * 8)) * (isElite(e) ? 2 : 1);
      return { x: e.x + u.x * sp, y: e.y + u.y * sp, r: e.radius || 12, w, e };
    });
    // 打不痛的飛彈（單次低於目前生命的忽略門檻）不納入，沿用原本不閃的規則。
    const shots = (s.shots || []).filter((sh) => Math.max(0, sh.damage || 0) * taken >= hpNow * settings.movement.ignoreDamagePercent / 100);
    const near = foes.filter((f) => dist(f, p) < 900);
    if (!near.length && !shots.length) return null;
    // 安全距離＝不會被近戰打到：原版怪物近戰命中為中心距 ≤ 角色半徑＋怪物半徑＋45。
    // 遠程站在近戰範圍外再多 15（不超出自己攻擊距離）；近戰技能只有 46～58，站在自己攻擊距離邊緣。
    const pr = p.radius || 12, ranged = !fighter(), reach = Math.min(myReach(), 450);
    // 怪物會移動：近戰範圍外再預留 0.4 秒的移動距離（20～80），避免怪一往前就打到而反覆觸發死亡保護。
    const lead = (e) => Math.min(80, Math.max(20, (e?.speed || e?.moveSpeed || 90) * 0.4));
    // 預先計算近戰危險區與是否為精英，避免在每個候選點重複呼叫 meleeGap 與 isElite
    for (const f of near) {
      const gap = meleeGap(f.e);
      f.zone = gap === -Infinity ? 0 : f.r + pr + gap + (ranged ? lead(f.e) : 0);
      f.zoneSq = f.zone > 0 ? f.zone * f.zone : 0;
      f.penalty = isElite(f.e) ? 6 : 2.5;
    }
    // 依使用者要求以怪物自己的近戰距離為安全距離（不會近戰的怪以 6 計），再加移動緩衝；近戰角色站在自己攻擊距離邊緣。
    const wantFor = (e) => ranged ? Math.min(Math.max(reach - 10, 40), (e?.radius || 12) + pr + Math.max(6, meleeGap(e)) + 10 + lead(e)) : (e?.radius || 12) + pr + Math.max(10, Math.min(reach, 150) - 4);
    // 依使用者要求攻擊性強一點：威脅場作用範圍縮小、權重減半，不再一直跑路。
    const scale = ranged ? 70 : 60;
    // 依使用者要求優先攻擊精英與王：900 內有幕末王＞頭目＞精英就鎖定，保持在安全的攻擊距離；王活著時少分心去撿東西。
    const rankOrder = { actBoss: 3, boss: 2, champion: 1 };
    const boss = s.enemies.filter((e) => isElite(e) && dist(e, p) < 900).reduce((a, e) => !a || (rankOrder[e.rank] || 0) > (rankOrder[a.rank] || 0) || ((rankOrder[e.rank] || 0) === (rankOrder[a.rank] || 0) && dist(e, p) < dist(a, p)) ? e : a, null);
    const focus = boss || near.reduce((a, f) => !a || dist(f, p) < dist(a, p) ? f : a, null)?.e;
    const looting = goal && (goal.kind === "loot" || goal.kind === "kick");
    // 實測（女巫面對精英越跑越遠）：鎖定的王／精英不計入往外推的威脅場，只由近戰範圍＋移動緩衝的禁區處理；
    // 其他怪照常計入。
    const threat = (pt) => { let a = 0; for (const f of near) { if (boss && f.e === boss) continue; const d = Math.max(0, dist(pt, f) - f.r); a += f.w / (1 + (d / scale) ** 2); } return a; };
    const shotPre = shots.map((sh) => {
      const rr = (sh.radius || 5) + pr + settings.movement.projectileSafetyRadius;
      return { x: sh.x, y: sh.y, vx: sh.vx || 0, vy: sh.vy || 0, rrSq: rr * rr, w: Math.max(0.5, Math.max(0, sh.damage || 0) * taken / hpNow * 10) };
    });
    const shotHit = (pt) => {
      let a = 0;
      for (const sh of shotPre) {
        for (let t = 0; t <= 0.6; t += 0.1) {
          const dx = sh.x + sh.vx * t - pt.x, dy = sh.y + sh.vy * t - pt.y;
          if (dx * dx + dy * dy < sh.rrSq) { a += sh.w; break; }
        }
      }
      return a;
    };
    const danger = threat(p);
    const focusWant = focus ? wantFor(focus) : 0;
    const goalDistP = goal ? dist(goal, p) : 0;
    const goalWeight = boss && looting ? 0.3 : pursue ? 5 : danger < 0.6 ? 2.5 : 0.8;
    let best = null;
    for (let i = 0; i < 24; i++) {
      const dir = DIRS_24[i];
      for (const step of PLAN_STEPS) {
        let x = p.x, y = p.y;
        for (let j = 0; j < 5; j++) {
          const next = typeof s.w.walls?.slide === "function" ? s.w.walls.slide(x, y, dir.x * step / 5, dir.y * step / 5) : { x: x + dir.x * step / 5, y: y + dir.y * step / 5 };
          if (!point(next)) break; x = next.x; y = next.y;
        }
        const moved = Math.hypot(x - p.x, y - p.y);
        if (moved < step * 0.4) continue;
        const pt = { x, y };
        let crowd = 0, threatScore = 0, meleePenalty = 0;
        for (const f of near) {
          const dfx = pt.x - f.x, dfy = pt.y - f.y, dfSq = dfx * dfx + dfy * dfy;
          if (dfSq < 12100) crowd++;
          if (!boss || f.e !== boss) {
            const df = Math.sqrt(dfSq);
            const d = Math.max(0, df - f.r);
            threatScore += f.w / (1 + (d / scale) ** 2);
          }
          if (f.zoneSq > 0) {
            if (dfSq < f.zoneSq) {
              meleePenalty += f.penalty;
            } else {
              const dex = pt.x - f.e.x, dey = pt.y - f.e.y;
              if (dex * dex + dey * dey < f.zoneSq) meleePenalty += f.penalty;
            }
          }
        }
        let score = -threatScore * 2 - shotHit(pt) * 6 - crowd * 0.4 - meleePenalty;
        if (focus) {
          const d = dist(pt, focus);
          score -= Math.abs(d - focusWant) / focusWant * (boss ? 3 : 2.5);
          // 超出自己攻擊距離九成就重扣，避免跑出打得到的範圍。
          if (d > reach * 0.9) score -= (d - reach * 0.9) / 40 * 3;
        }
        if (goalDistP > 5) score += (goalDistP - dist(pt, goal)) / step * goalWeight;
        score += (dir.x * planHeading.x + dir.y * planHeading.y) * 0.5;
        if (!best || score > best.score) best = { score, dir, pt };
      }
    }
    if (!best) return null;
    planHeading = best.dir;
    return { dir: best.dir, target: best.pt, danger };
  }
  // 原版角色傷害（heroNumbers 的 Damage），每 3 秒更新一次，用來判斷小怪能否秒殺。
  let heroDmg = 0, heroDmgAt = -Infinity;
  function heroDamage(g, now) {
    if (now - heroDmgAt < 3000) return heroDmg;
    heroDmgAt = now;
    try { const p = g.world.player, worn = g.equippedOf(p.cls); heroDmg = (g.heroNumbers(g.makePlayer(p.sprite, p.cls, worn), g.build, worn, false)?.stats || []).find((x) => x.label === "Damage")?.num || 0; } catch { heroDmg = 0; }
    return finite(heroDmg) ? heroDmg : 0;
  }
  function navigate(s, danger, now) {
    vacuum(s, now);
    const st = style(), g = game, m = { ...settings.movement, kiteDistance: st.kite, attackRange: st.range, enabled: assistOn() && settings.movement.enabled }, progressing = questOn() || terrorMode() !== "off", portal = g.clearing?.portal;
    if (point(portal) && clearWorld !== s.w) { clearWorld = s.w; clearAt = now; }
    let closeEnemy = false, x = 0, y = 0;
    const taken = Math.max(1, finite(s.p.damageTaken) ? s.p.damageTaken : 1);
    // 依使用者要求：閃不閃小怪看牠們合起來能不能造成威脅，不是兩三隻小怪靠近就閃。
    // 走位距離內一般怪的單次傷害加總 < 目前生命 25％，且沒有任何一隻單次 ≥ 10％，就完全不閃（照打、照撿）。
    // 依使用者要求：一兩下就能打死的小怪（生命 ≤ 原版角色傷害的一半）也不算威脅。
    const myDmg = heroDamage(g, now), killable = (e) => myDmg > 0 && (e.life ?? e.maxLife ?? Infinity) <= myDmg * 0.5;
    const hitOf = (e) => killable(e) ? 0 : Math.max(0, e.damage || 0) * taken;
    const nearMinions = s.enemies.filter((e) => !isElite(e) && dist(s.p, e) < m.kiteDistance + (e.radius || 0));
    const minionsHarmless = nearMinions.reduce((a, e) => a + hitOf(e), 0) < s.hp.now * 0.25 && !nearMinions.some((e) => hitOf(e) >= s.hp.now * 0.1);
    if (m.enabled) for (const e of s.enemies) {
      const d = dist(s.p, e), range = m.kiteDistance + (e.radius || 0);
      if (d >= range) continue;
      // 打不痛的一般怪不必拉開距離（王與精英仍依攻擊範圍處理）。
      if (!isElite(e) && (minionsHarmless || hitOf(e) < s.hp.now * m.ignoreDamagePercent / 100)) continue;
      closeEnemy = true;
      const u = unit(s.p.x - e.x, s.p.y - e.y), force = Math.min(8, (range - d) / Math.max(15, d));
      x += (u.x || (d < 1 ? 1 : 0)) * force; y += u.y * force;
    }
    let through = false;
    if (m.enabled && closeEnemy && s.enemies.filter((e) => dist(e, s.p) < m.kiteDistance).length >= 3) {
      const out = escapeDirection(s);
      // 實測很容易被包圍：每個方向都被堵時允許穿過怪群（原版會把貼身的怪推開），以遠離最強的怪為準。
      if (out && out.worst >= 20) { x = out.x * 8; y = out.y * 8; }
      else {
        const strong = s.enemies.filter((e) => dist(e, s.p) < m.kiteDistance * 1.5).reduce((a, e) => !a || power(e) > power(a) ? e : a, null);
        if (strong) { const away = unit(s.p.x - strong.x, s.p.y - strong.y); x = (away.x || 1) * 8; y = away.y * 8; through = true; }
      }
    }
    // 預判包圍：看地圖上較遠的怪（約 2.5 倍走位距離），預測 0.8 秒後位置；
    // 怪從多個方向圍過來（最大空隙小於 240°）就提前往空隙走，不等貼身被卡死才逃。
    let pre = null;
    if (m.enabled && !through) {
      const R = Math.max(450, settings.movement.kiteDistance * 2.5), taken2 = taken;
      const far = s.enemies.filter((e) => dist(e, s.p) < R && !isElite(e)), farHarmless = far.reduce((a, e) => a + hitOf(e), 0) < s.hp.now * 0.25 && !far.some((e) => hitOf(e) >= s.hp.now * 0.1);
      const threats = s.enemies.filter((e) => dist(e, s.p) < R && (isElite(e) || !farHarmless && Math.max(0, e.damage || 0) * taken2 >= s.hp.now * m.ignoreDamagePercent / 100));
      if (threats.length >= (fighter() ? 5 : 3)) {
        const ahead = threats.map((e) => { const d = dist(e, s.p), u = unit(s.p.x - e.x, s.p.y - e.y), sp = Math.min(d, Math.max(40, e.speed || e.moveSpeed || 90) * 0.8); return { x: e.x + u.x * sp, y: e.y + u.y * sp, radius: e.radius }; });
        const angles = ahead.map((e) => Math.atan2(e.y - s.p.y, e.x - s.p.x)).sort((a, b) => a - b);
        let gap = 0;
        for (let i = 0; i < angles.length; i++) gap = Math.max(gap, (i + 1 < angles.length ? angles[i + 1] : angles[0] + 2 * Math.PI) - angles[i]);
        if (gap < Math.PI * 4 / 3) {
          const out = escapeDirection(s, ahead);
          if (out) { const w = 3 + 5 * (1 - gap / (Math.PI * 4 / 3)); pre = { x: out.x * w, y: out.y * w }; x += pre.x; y += pre.y; closeEnemy = true; lastAction = "預判怪物包圍，提前往空隙走位"; }
        }
      }
    }
    // 王與精英怪要留在攻擊範圍內：閃避時若離太遠就往回拉，不會越躲越遠。
    const elite = m.enabled ? nearestElite(s) : null;
    if (elite && dist(elite, s.p) > m.attackRange) { const back = unit(elite.x - s.p.x, elite.y - s.p.y); x += back.x * 6; y += back.y * 6; }
    const dodging = m.enabled && m.dodgeProjectiles && Math.hypot(danger.dodgeX, danger.dodgeY) > 0;
    if (dodging) { x += danger.dodgeX; y += danger.dodgeY; }
    // 王／精英掉的寶箱與暗金以上裝備還在附近時，最多等 20 秒撿完再走通關門。
    const treasure = s.pickups.some((e) => (e.kind === "chest" || ["unique", "set", "runeword"].includes(e.item?.rarity)) && (blockedLoot.get(e) || 0) < now && dist(e, s.p) <= settings.loot.searchRadius);
    // 通關後沒有要撿的東西就立刻走通關門，不等待。
    const portalDue = progressing && point(portal) && (!settings.loot.backtrackForLoot || !wantedLoot(s, now).length || now - clearAt >= (treasure ? 20000 : settings.terror.postClearWaitSec * 1000));
    // 追目標優先：推進中且生命尚可時以目標前進，路上只閃飛彈，不因被怪包夾而越閃越遠。
    // 追目標只用於王／精英／任務／物品／通關門；一般小怪仍保持距離（實測一般怪也衝會被包圍而早死）。
    const ratio = s.hp.now / s.hp.max, chase = m.enabled && settings.movement.chaseFirst && ratio > (isMelee() ? 0.35 : 0.25);
    const free = chase || (!dodging && !closeEnemy);
    // 實測原版：盜賊是 thiefChase.e（帶金幣逃向傳送門的精英，被打會掉金幣，20 秒後逃走），出現就最優先追擊。
    const thief = live(g.thiefChase?.e) ? g.thiefChase.e : null;
    let goal = thief && m.enabled && ratio > 0.25 ? { ...battleGoal(thief, s.p, "盜賊"), ...(fighter() ? {} : (() => { const u = unit(s.p.x - thief.x, s.p.y - thief.y), d = Math.min(m.kiteDistance, m.attackRange * 0.6); return { x: thief.x + (u.x || 1) * d, y: thief.y + u.y * d }; })()) } : null;
    // 依使用者要求：精英怪與王才會掉裝備與寶箱，生命過半時先追 900 內的精英／王，打倒後再撿掉落物。
    // 依使用者要求：配合劇情推進，任務目標（石陣、牢籠、任務頭目、任務物品）最優先；其次精英／王，最後撿物。
    // 依實測：石塊陣開門後一般通關傳送門也出現，原本 portalDue 會略過任務目標，角色離開該局、石陣進度重置；石陣／任務傳送門／牢籠仍優先；依使用者要求，任務頭目沒打倒就繼續打，不走出口。
    if (!goal && questOn()) { const q = questGoal(s); if (q && (!portalDue || q.quest || /石陣|任務傳送門|牢籠|任務頭目/.test(q.kind))) goal = q; }
    const hunt = !goal && m.enabled && progressing && !portalDue && ratio > 0.35 ? nearestElite(s) : null;
    if (hunt) goal = battleGoal(hunt, s.p, "精英");
    if (!goal) goal = free && danger.damage < s.hp.now && !portalDue ? lootGoal(s, now) : null;
    if (!goal && portalDue) goal = { x: portal.x, y: portal.y, kind: "通關傳送門" };
    if (!goal && progressing && !portal) {
      const enemy = nearestElite(s) || s.enemies.reduce((best, e) => !best || dist(e, s.p) < dist(best, s.p) ? e : best, null);
      if (enemy) goal = battleGoal(enemy, s.p, isElite(enemy) ? "精英" : "戰鬥");
      // 此遊戲不需探圖，敵人會自己湧來；沒有敵人時原地等待，不越跑越遠。
    }
    // 近戰要貼身才打得到，一般怪也直接追；遠程對一般怪保持距離。
    const chaseKind = goal && (fighter() ? goal.kind !== "巡航" : !["戰鬥", "巡航"].includes(goal.kind)) && (goal.kind !== "kick" || !closeEnemy);
    // 實測前期常朝被大群怪包著的精英衝而陣亡：目標周圍 250 內有 8 隻以上怪時不衝，改保持距離慢慢清（王與任務目標除外）。
    const crowded = goal && ["精英", "戰鬥"].includes(goal.kind) && s.enemies.filter((e) => dist(e, goal) < 250 && !killable(e)).length >= 12;
    const pursue = chase && chaseKind && !crowded && dist(goal, s.p) > 5;
    if (pursue) {
      const u = unit(goal.x - s.p.x, goal.y - s.p.y), d = dodging ? unit(danger.dodgeX, danger.dodgeY) : { x: 0, y: 0 };
      // 追目標時也要避開預判的包圍。
      x = u.x * 2 + d.x * 1.5 + (pre ? pre.x * 0.6 : 0); y = u.y * 2 + d.y * 1.5 + (pre ? pre.y * 0.6 : 0);
    } else if (goal && !crowded && !dodging && !closeEnemy && dist(goal, s.p) > 5) { const u = unit(goal.x - s.p.x, goal.y - s.p.y); x += u.x; y += u.y; }
    // 有怪或飛彈時改用全圖規劃器；沒有任何威脅時走目標，連目標都沒有就慢速繞圈，保持移動。
    // 追盜賊／王／任務等目標時加重目標吸引，仍會避開威脅與飛彈。
    // 依使用者回報（截圖）：自動閃避讓角色在任務傳送門旁一直被推開進不去；任務傳送門／牢籠／石陣近在 300 內且生命 > 30％ 時不閃避，直線走進去並站住（傳送門要站 1.5 秒）。
    const commit = goal && /任務傳送門|任務牢籠|任務石陣/.test(goal.kind) && ratio > 0.3 && dist(goal, s.p) < 300;
    if (commit && dist(goal, s.p) <= 5) { lastAction = "站在" + goal.kind + "上"; release(); return; }
    if (commit) { const g2 = unit(goal.x - s.p.x, goal.y - s.p.y); x = g2.x; y = g2.y; }
    const plan = m.enabled && !through && !commit ? planMove(s, goal, st, now, pursue) : null;
    let u = plan ? plan.dir : unit(x, y);
    if (!u.x && !u.y) {
      if (!m.enabled) { release(); return; }
      const a = Math.atan2(planHeading.y, planHeading.x) + 0.35; u = { x: Math.cos(a), y: Math.sin(a) }; planHeading = u;
    }
    const mix = dodging || plan ? 1 : m.smoothingFactor;
    u = unit(smooth.x * (1 - mix) + u.x * mix, smooth.y * (1 - mix) + u.y * mix); smooth = u;
    // 使用原版 walkTarget -> walls.route/slide，不直接改座標或穿牆。
    const direct = goal && !plan && !dodging && !pre && !crowded && (pursue || !closeEnemy);
    const target = plan ? { ...plan.target } : direct ? { x: goal.x, y: goal.y } : { x: s.p.x + u.x * 100, y: s.p.y + u.y * 100 };
    if (typeof s.w.walls?.nearestOpen === "function") Object.assign(target, s.w.walls.nearestOpen(target.x, target.y));
    if (!point(target)) { release(); return; }
    if (ownReach && s.w.reaching === ownReach) s.w.reaching = null;
    ownReach = goal?.kind === "loot" && direct ? goal.target : null;
    if (ownReach) s.w.reaching = ownReach;
    ownWalk = target; g.walkTarget = target;
    const label = goal?.kind === "loot" ? "拾取物品" : goal?.kind === "kick" ? "踢罐子" : goal?.kind || "安全位置";
    lastAction = plan ? "全圖走位（威脅 " + plan.danger.toFixed(1) + "）" + (goal ? "：" + label : "") : through ? "被包圍無路可閃，穿過怪群遠離最強敵人" : pursue ? "朝目標前進：" + label + (dodging ? "（閃避飛彈）" : "") : dodging ? "閃避敵方飛彈" : closeEnemy ? "保持敵人距離" : "前往" + label;
    // 以遊戲內時間判斷卡住（畫面凍結不算）；為了完全自主運作，卡住只換方向繞路，不停機。
    const clock = finite(s.w.time) ? s.w.time * 1000 : now;
    if (!stuck || clock < stuck.at) stuck = { x: s.p.x, y: s.p.y, at: clock };
    if (clock - stuck.at >= 2500) {
      stuckCount = dist(stuck, s.p) < 20 ? stuckCount + 1 : 0;
      if (stuckCount) {
        if (lootTarget) blockedLoot.set(lootTarget, now + 15000);
        lootTarget = null;
        const turn = stuckCount >= 3 ? Math.random() * Math.PI * 2 : Math.PI / 2;
        const v = { x: u.x * Math.cos(turn) - u.y * Math.sin(turn), y: u.x * Math.sin(turn) + u.y * Math.cos(turn) };
        ownWalk = { x: s.p.x + v.x * (stuckCount >= 3 ? 240 : 120), y: s.p.y + v.y * (stuckCount >= 3 ? 240 : 120) }; g.walkTarget = ownWalk;
        lastAction = "卡住，換方向繞路"; strafeSide = -strafeSide;
      }
      stuck = { x: s.p.x, y: s.p.y, at: clock };
    }
  }
  // 遊戲的關卡切換 Promise 若永不完成，轉場鎖會永遠不解除；加上期限，逾時交給 stop() 停機並釋放鎖。
  // 不等待的非同步動作（離場、返回選單、推進關卡等）：拒絕時記錄原因，不讓 rejection 無聲消失或留下卡住的狀態。
  const fire = (p, label) => { Promise.resolve(p).catch((err) => { lastAction = label + "失敗：" + String(err?.message || err); }); };
  const deadline = (p, ms = 120000) => Promise.race([p, new Promise((_, reject) => setTimeout(() => reject(new Error("等待遊戲回應逾時")), ms))]);
  async function advance(g) {
    if (transition || retreat || !alive || terrorMode() === "off") return;
    const t = settings.terror, record = g.save?.terror?.[g.kit?.id];
    if (!record || !g.kit || typeof g.startTerror !== "function") return;
    transition = true;
    try {
      if (t.mode === "farm") {
        if (t.targetFarmTier > (record.cleared ?? 0) || typeof g.startReplay !== "function") { stop("固定層數尚未通關，無法重刷"); return; }
        g.tierDone = null;
        lastAction = "重刷恐怖 " + t.targetFarmTier + " 層";
        await deadline(g.startReplay(g.kit, t.targetFarmTier));
      } else {
        if (!Array.isArray(record.offers) || !record.offers.length) return;
        // 超級首領與最終戰選項（offer.uber／offer.finale）會消耗鑰匙或器官（遊戲 itemArt 的 Kl(…, uber)），自動流程優先避開；只剩它時才退回原行為。
        const usable = (e) => !e.affixes?.includes("nobelt");
        const plain = record.offers.findIndex((e) => usable(e) && !e.uber && !e.finale);
        const offer = plain >= 0 ? plain : record.offers.findIndex(usable);
        g.tierDone = null;
        lastAction = "推進恐怖 " + record.open + " 層";
        await deadline(g.startTerror(g.kit, Math.max(0, offer)));
      }
    } catch (err) { stop("切換關卡失敗：" + String(err.message || err)); }
    finally { transition = false; }
  }
  // 全新存檔沒有恐怖層紀錄：在營地沿用原版傳送點流程（續玩存檔或開新局）。
  let campSince = 0;
  const failStreak = {};
  // 中途「儲存並離開」會回主選單／選角畫面：有存著的進度就用原版 continueRun 繼續。
  function menuResume(g, now) {
    if (g.state !== "select" || !questOn() || !settings.quest.autoStart || !g.kit || g.swapping || transition || now - actionAt < 3000 || typeof g.continueRun !== "function") return false;
    let saved = null;
    try { saved = g.frontend?.actions?.saved?.(g.kit.id); } catch { saved = null; }
    if (!saved) return false;
    actionAt = now; lastAction = "中途離開，自動繼續上次進度";
    fire(g.continueRun(g.kit, "hero"), "續玩");
    return true;
  }
  // 依使用者要求：某難度完整打完五章（擊敗巴爾）等級都沒升，就記住「此職業在此等級以上刷這難度沒用」，之後不再回去刷。
  // 存在 localStorage，重新整理仍有效；等級、裝備陣亡也保留，刷不到經驗的難度只是浪費時間。
  const NOXP_KEY = "d2autobot:noXp";
  // 依使用者要求：75 級以上不再回普通刷（經驗與掉寶都太低）；正在普通的 75 級以上角色若惡夢已開，離開本局回營地改開最高難度。
  const NORMAL_MAX_LV = 75;
  // 依使用者要求（掉落分析：角色高怪 10 級以上經驗只剩約 5％，惡夢怪最高約 75 級）：85 級以上也不回惡夢刷。
  const NIGHTMARE_MAX_LV = 85;
  const lowLevelUseless = (diff, lv) => diff === "normal" && lv >= NORMAL_MAX_LV || diff === "nightmare" && lv >= NIGHTMARE_MAX_LV;
  let leftNormalAt = -Infinity, lastRunDiff = null;
  function leaveLowNormal(g, now) {
    // 原版「繼續」選項沒有難度欄位（只有 kind: continue）；自己記住正在打的難度，回營地判斷要不要續玩。
    if (g.state === "playing" && g.difficulty && !g.world?.terror) lastRunDiff = g.difficulty;
    if (!questOn() || cleanupReady(g) || settings.quest.farmDifficulty !== "off" || g.state !== "playing" || !["normal", "nightmare"].includes(g.difficulty) || g.world?.terror || now - leftNormalAt < 15000) return false;
    const lv = g.world?.player?.level ?? 0, opened = g.save?.unlocked?.[g.kit?.id], order = ["normal", "nightmare", "hell"];
    // 保留角色（save.heroes[職業].kept）比目前這局高 20 級以上、難度也不低時，這局是重新整理或誤開的新局：離開本局回營地接回保留角色。
    const kept = g.save?.heroes?.[g.kit?.id]?.kept, keptLv = kept?.run?.level ?? kept?.build?.level ?? 0, behindKept = keptLv - lv >= 20 && order.indexOf(kept?.difficulty) >= order.indexOf(g.difficulty);
    if (!(lowLevelUseless(g.difficulty, lv) && opened && order.indexOf(opened) > order.indexOf(g.difficulty)) && !behindKept || typeof g.pause !== "function" || typeof g.leaveRun !== "function") return false;
    leftNormalAt = now; runStart = null; lastAction = behindKept ? "這局遠低於保留角色（" + keptLv + " 級）：離開本局，回營地接回保留角色" : (g.difficulty === "normal" ? "75 級以上不刷普通" : "85 級以上不刷惡夢") + "：離開本局，回營地開最高難度";
    g.pause(); if (g.state === "paused") fire(g.leaveRun(), "離場");
    return true;
  }
  let runStart = null, noXp = {};
  try { noXp = JSON.parse(localStorage.getItem(NOXP_KEY) || "{}") || {}; } catch { noXp = {}; }
  const noXpAt = (cls, diff, lv) => finite(noXp[cls]?.[diff]) && lv >= noXp[cls][diff];
  function noteRunEnd(g, now) {
    const lv = g.world?.player?.level ?? g.save?.heroes?.[g.kit?.id]?.level;
    if (runStart?.complete && finite(lv) && lv <= runStart.lv && g.kit?.id) {
      (noXp[g.kit.id] ||= {})[runStart.diff] = Math.min(noXp[g.kit.id][runStart.diff] ?? Infinity, runStart.lv);
      try { localStorage.setItem(NOXP_KEY, JSON.stringify(noXp)); } catch { /* 本次仍生效。 */ }
    }
    runStart = null;
  }
  function campStart(g, now) {
    if (g.state !== "camp") { campSince = 0; return false; }
    if (runStart) noteRunEnd(g, now);
    if (!campSince) campSince = now;
    // 實測：回營地的非同步載入偶爾停在 state=camp 但營地未生成；逾 15 秒仍可直接走原版開局。
    if (!questOn() || !settings.quest.autoStart || (!g.camp && now - campSince < 15000) || !g.kit || g.swapping || transition || now - actionAt < 2000) return false;
    if (terrorMode() !== "off" && g.save?.terror?.[g.kit.id]?.offers?.length) return false;
    let view = null;
    try { view = g.waypointView?.(g.kit); } catch { view = null; }
    actionAt = now;
    // 實測（2026-11-01）：回傳傳送點介面模型 tabs[].rows[].start = { kind: continue|new|terror|replay|training, ... }，open 表示可選。
    const starts = (view?.tabs || []).flatMap((t) => t?.rows || []).filter((r) => r?.open !== false && r?.start).map((r) => r.start);
    const order = ["normal", "nightmare", "hell"];
    const resume = starts.find((s) => s.kind === "continue" && (s.whose ?? "hero") === "hero");
    const opened = starts.filter((s) => s.kind === "new" && order.includes(s.difficulty)).sort((a, b) => order.indexOf(b.difficulty) - order.indexOf(a.difficulty));
    // 最高難度連續陣亡 2 次就回低一級難度刷一局（賺金幣與裝備），之後再挑戰。
    // 實測（35 存檔）：惡夢死亡保護離場 2 次就回普通重打 5 幕，79 級角色在普通拿不到好經驗與裝備（等級、裝備陣亡也保留）；門檻改 3 次。
    const farm = opened.length > 1 && (failStreak[opened[0].difficulty] || 0) >= 3 && !noXpAt(g.kit.id, opened[1].difficulty, g.world?.player?.level ?? 0) && !lowLevelUseless(opened[1].difficulty, g.world?.player?.level ?? 0);
    // 固定重複刷：使用者指定的難度已開放就一直開那個難度。
    const fixed = opened.find((s) => s.difficulty === settings.quest.farmDifficulty);
    // 地獄通關且 99 級後才依序回各難度補任務，不受低難度經驗門檻限制。
    const cq = g.save?.cain?.quests?.[g.kit.id] || {};
    const questBack = cleanupReady(g) ? [...opened].reverse().find((s) => [1, 2, 3, 4, 5, 6].some((n) => cq[QUEST_DIFF[s.difficulty] + n] == null)) : null;
    const fresh = fixed || questBack || (farm ? opened[1] : opened[0]);
    if (farm) failStreak[opened[0].difficulty] = 0;
    // 上次進度是較低難度的局（回刷中離場）時不再續玩，直接開最高難度。
    // 原版保留角色的難度在 save.heroes[職業].kept.difficulty；優先用它，沒有才用自己記住的上一局難度。
    const resumeDiff = resume ? resume.difficulty ?? g.save?.heroes?.[g.kit.id]?.kept?.difficulty ?? lastRunDiff : null;
    const lowerResume = resume && opened[0] && resumeDiff && order.indexOf(resumeDiff) < order.indexOf(opened[0].difficulty) && settings.quest.farmDifficulty === "off" && resumeDiff !== questBack?.difficulty;
    const higherResume = questBack && resume && resumeDiff && resumeDiff !== questBack.difficulty;
    if (resume && !farm && !lowerResume && !higherResume && (settings.quest.farmDifficulty === "off" || resume.difficulty === settings.quest.farmDifficulty) && typeof g.continueRun === "function") { lastAction = "從營地繼續上次進度"; runStart = { diff: resumeDiff, lv: g.world?.player?.level, at: now }; fire(g.continueRun(g.kit, "hero"), "續玩"); return true; }
    if (!fresh || typeof g.startRun !== "function") return false;
    lastAction = (fixed ? "重複刷難度：" : questBack ? "補完未完成任務，回此難度重打：" : farm ? "最高難度打不上去，回低難度刷：" : "從營地開新局：") + fresh.difficulty; runStart = { diff: fresh.difficulty, lv: g.world?.player?.level, at: now }; void g.startRun(g.kit, fresh.difficulty);
    return true;
  }
  // 以原版角色數值（傷害、生命、減傷、抗性）比較背包裝備，再走原版穿戴流程。
  let gearAt = 0;
  function gearNumbers(g, worn) {
    const p = g.world.player, numbers = g.heroNumbers(g.makePlayer(p.sprite, p.cls, worn), g.build, worn, false);
    return Object.fromEntries((numbers?.stats || []).map((s) => [s.label, finite(s.num) ? s.num : 0]));
  }
  // 遊戲 20261101.1：防禦改為降低怪物命中率（原版 heroNumbers 新增 Defense），不再減傷；改用 Defense 小權重，移除與之重疊的 Enhanced Defense 加分。
  function gearScore(g, worn, n = gearNumbers(g, worn)) {
    // 實測（2026-11-01）：減傷、施法速度為小數（0.5＝50％），抗性可為負（地獄 −40）；舊公式幾乎不算防禦而變成玻璃大砲。
    // 以「少承受 1％ 傷害 ≈ 多打 1％ 傷害」計分：生命權重高於傷害，減傷與四系抗性依實際減少承受量，負抗性扣分。
    const taken = (r) => -Math.log(1 - Math.min(75, r) / 100) * 100;
    // 實測（死亡保護反覆觸發的存檔）：惡夢 58 級野蠻人火／冰抗 −32／−16，元素傷害放大而一直撐不住；
    // 抗性權重由 0.5 提高到 1，負抗性每點再扣 1.5 分，換裝優先把負抗補回正數。
    const res = ["Fire Resistance", "Cold Resistance", "Lightning Resistance", "Poison Resistance"].reduce((a, k) => { const r = n[k] || 0; return a + taken(r) + Math.min(0, r) * 1.5; }, 0);
    const reduced = Math.min(0.5, Math.max(0, n["Damage Reduced"] || 0));
    // 實測（35 存檔裝備異動紀錄）：雙手武器與盾牌互擠，被擠掉的欄位不扣分，之後撿不到單手武器就一直空著（聖騎士、死靈常空武器欄）。
    // 盾牌以外每空一欄扣 15 分（約少 15％ 傷害），只有提升夠大才犧牲欄位，空欄也會優先補上。
    const emptyPenalty = ["weapon", "head", "body", "gloves", "belt", "boots", "amulet", "ring1", "ring2"].filter((k) => !worn[k]).length * 15;
    return -emptyPenalty + Math.log1p(Math.max(0, n.Damage || 0)) * 100 + Math.log1p(Math.max(0, n.Life || 0)) * 130 - Math.log(1 - reduced) * 150 + res + Math.log1p(Math.max(0, n.Defense || 0) / 1000) * 20 + Math.min(1, n["Faster Cast Rate"] || 0) * 20 + (n["Replenish Life"] || 0) * 0.5 + (n["Magic Find"] || 0) * 0.02;
  }
  // 回傳候選中提升最多且達門檻者；候選可來自背包、倉庫、收藏庫或商店，只比較不寫入。
  function bestGear(g, items) {
    const p = g.world.player, worn = g.equippedOf(p.cls), baseNumbers = gearNumbers(g, worn), base = gearScore(g, worn, baseNumbers), doll = g.ownGear(p.cls).doll;
    const resKeys = ["Fire Resistance", "Cold Resistance", "Lightning Resistance", "Poison Resistance"], averageRes = resKeys.reduce((a, k) => a + (baseNumbers[k] || 0), 0) / 4;
    const survival = (n) => Math.log1p(Math.max(0, n.Life || 0)) * 130 - Math.log(1 - Math.min(0.5, Math.max(0, n["Damage Reduced"] || 0))) * 150 + resKeys.reduce((a, k) => { const r = n[k] || 0; return a - Math.log(1 - Math.min(75, r) / 100) * 100 + Math.min(0, r) * 1.5; }, 0);
    const baseSurvival = survival(baseNumbers), baseDamage = Math.max(0, baseNumbers.Damage || 0);
    let best = null;
    for (const item of items) {
      if (!item?.base || item.type === "quest" || item.type === "rune" || item.type === "gem" || Object.values(worn).includes(item)) continue;
      if (!doll.canWear?.(item)) continue;
      // 原版兩格戒指都已穿時預設覆蓋 ring1；分別評估兩格並明確傳入選中的欄位。
      const slots = item.type === "ring" ? ["ring1", "ring2"].filter((slot) => typeof doll.fits !== "function" || doll.fits(item, slot)) : [doll.slotFor?.(item, worn)];
      for (const to of slots) {
        if (!to) continue;
        const preview = g.previewGear(p, g.build, false, item, to);
        if (!preview || preview.refused) continue;
        // 模擬原版 equip 在指定欄位會擠掉的裝備。
        const trial = { ...worn };
        const displaced = doll.displaced?.(item, worn, to) || [];
        for (const s of displaced) delete trial[s];
        trial[to] = item;
        // 有武器時不可為了副手或其他裝備把武器擠掉；空武器欄則優先補武器，即使須取下副手。
        if (worn.weapon && !trial.weapon) continue;
        // 分數以對數計：1 分約等於傷害 +1％。實測原版數值不含防禦，空欄位只要不變差就穿（至少得到防禦）。
        const numbers = gearNumbers(g, trial), damage = Math.max(0, numbers.Damage || 0);
        // 依使用者要求：每個欄位都要有裝備。原本是空欄位、也不擠掉任何已穿裝備時一律穿上（不看分數與降傷護欄），且優先於一般換裝。
        const fillsEmpty = !worn[to] && (to === "weapon" || displaced.every((s) => !worn[s]));
        if (fillsEmpty) { const gain = 1e6 + gearScore(g, trial, numbers) - base; if (!best || gain > best.gain) best = { item, gain, slot: to }; continue; }
        // 依使用者要求：武器被擠空不得降傷；降傷超過一成僅在半血以下或平均負抗且生存分數至少提升 20 分時放行。
        if (!trial.weapon && damage < baseDamage) continue;
        if (damage < baseDamage * 0.9 && !((p.maxLife > 0 && p.life / p.maxLife < 0.5 || averageRes < 0) && survival(numbers) - baseSurvival >= 20)) continue;
        // 依使用者要求：優先穿排行榜高手常用的暗金／套裝（LADDER gear 該欄前三名），只要通過上面的降傷護欄且總分不降超過 5 分；沒有推薦裝備才依分數挑。
        const ladderGear = LADDER.classes[p.cls]?.gear?.[to] || [], recommended = ladderGear.includes(item.name) && !ladderGear.includes(worn[to]?.name);
        const gain = gearScore(g, trial, numbers) - base + (recommended ? 10 : 0), empty = !worn[to] && displaced.every((s) => !worn[s]);
        if ((empty ? gain >= 0 : gain >= settings.gear.minGainPercent) && (!best || gain > best.gain)) best = { item, gain, slot: to };
      }
    }
    return best;
  }
  let charmTried = new WeakSet();
  // 護符評分（依屬性）：本職業技能／全技能高分，別職業技能 0 分；生命、抗性、跑速、魔法尋寶等；四項屬性依排行榜配點比例加權。
  // 技能詞綴對應職業（遊戲 itemArt 的 T6 順序）：classskillsN → T6[N]、skilltabN → T6[floor(N/3)]。
  const CLASS_ORDER = ["amazon", "sorceress", "necromancer", "paladin", "barbarian", "druid", "assassin"];
  function charmValue(item, cls) {
    const share = LADDER.classes[cls]?.attributes || {}, caster = ["sorceress", "necromancer"].includes(cls);
    let v = 0;
    for (const { stat, value } of item?.mods || []) {
      const n = Number(value) || 0, m = /^(classskills|skilltab)(\d+)$/.exec(stat);
      if (m) { const owner = CLASS_ORDER[m[1] === "classskills" ? +m[2] : Math.floor(+m[2] / 3)]; v += owner === cls ? n * 30 : 0; continue; }
      if (stat === "allSkills") v += n * 40;
      else if (stat === "life") v += n * 1;
      else if (stat === "mana") v += n * (caster ? 0.4 : 0.15);
      else if (/^(fire|cold|lightning|poison)Resist$/.test(stat)) v += n * 1;
      else if (stat === "allResist" || stat === "allResistances") v += n * 4;
      else if (["strength", "dexterity", "vitality", "energy"].includes(stat)) v += n * (0.5 + (share[stat] || 0) * 4);
      else if (stat === "frw") v += n * 0.6;
      else if (stat === "fhr" || stat === "fcr") v += n * 0.5;
      else if (stat === "magicFind") v += n * 0.3;
      else if (stat === "goldFind") v += n * 0.02;
      else if (/MinDamage$|MaxDamage$/.test(stat)) v += n * (/poison/.test(stat) ? 0.03 : 0.3);
      else if (stat === "attackRatingPoints") v += n * (caster ? 0 : 0.03);
      else if (stat === "defense") v += n * 0.02;
      else if (stat === "replenishLife") v += n * 1;
    }
    return v;
  }
  const isCharm = (item) => !!item?.base && /charm/i.test(String(item.type || "") + " " + String(item.base));
  function autoEquip(g, now) {
    // 自動穿裝只受自動戰鬥總開關控制；戰鬥輔助分頁不會啟用換裝。
    if (!settings.progressEnabled || !settings.gear.autoEquip || now - gearAt < 3000 || !g.world?.player || g.save?.cursor) return;
    if (!["playing", "camp"].includes(g.state) || typeof g.gearActions !== "function" || typeof g.heroNumbers !== "function" || typeof g.makePlayer !== "function") return;
    gearAt = now;
    const p = g.world.player;
    // 依使用者要求：護符看屬性，不是有空位就放（實測亞馬遜放了加野蠻人技能的護符）。
    // 原版 equip 遇到護符改呼叫 moveCharm：背包→護符格；對護符格裡的護符再呼叫則移回背包。
    // 沒用的護符（分數 ≤ 0，例如只有別職業技能）移出；背包有更好的就放入；護符格滿時比最差的高 20％ 以上才換。
    const worn = g.save?.charmsByClass?.[p.cls] || [], acts = g.gearActions(p.cls, () => {}, false);
    const useless = worn.find((x) => charmValue(x, p.cls) <= 0);
    if (useless) { acts.equip(useless); if (!(g.save.charmsByClass[p.cls] || []).includes(useless)) { lastAction = "移出沒用的護符：" + itemZh(useless); return; } }
    const cand = g.inventoryOf(p.cls).filter((x) => isCharm(x) && !charmTried.has(x) && charmValue(x, p.cls) > 0).sort((a, b) => charmValue(b, p.cls) - charmValue(a, p.cls))[0];
    if (cand) {
      acts.equip(cand);
      if (!g.inventoryOf(p.cls).includes(cand)) { lastAction = "已放入護符：" + itemZh(cand); return; }
      const worst = [...(g.save.charmsByClass[p.cls] || [])].sort((a, b) => charmValue(a, p.cls) - charmValue(b, p.cls))[0];
      if (worst && charmValue(cand, p.cls) > charmValue(worst, p.cls) * 1.2) { acts.equip(worst); if (!(g.save.charmsByClass[p.cls] || []).includes(worst)) { lastAction = "換掉較差的護符：" + itemZh(worst); return; } }
      charmTried.add(cand);
    }
    const best = bestGear(g, [...g.inventoryOf(p.cls)]);
    if (!best) {
      // 背包滿時先確認沒有可穿的裝備，再賣掉物品騰空間，避免把空欄可用裝備先賣掉。
      if (g.state === "playing" && finite(g.lastInventoryFull) && performance.now() - g.lastInventoryFull < 5000) {
        const rank = { normal: 0, magic: 1, rare: 2, set: 3, unique: 4 }, junk = g.inventoryOf(p.cls).filter((x) => x?.base && !keepType(x) && !isCharm(x) && x.rarity in rank).sort((a, b) => rank[a.rarity] - rank[b.rarity])[0];
        if (junk) { g.gearActions(p.cls, () => {}, false).sell(junk); g.lastInventoryFull = -Infinity; lastAction = "背包已滿，賣掉 " + (junk.name || junk.base); return; }
      }
      // 沒用的裝備（普通／魔法／稀有且不比身上好）撿到就賣，不等背包滿；暗金、套裝、符文之語、護符留給收藏與倉庫。
      if (settings.town.sellJunk) {
        const junk = g.inventoryOf(p.cls).find((x) => x?.base && (!keepType(x) && !isCharm(x) && ["normal", "magic", "rare"].includes(x.rarity) || isCharm(x) && x.rarity !== "unique" && charmValue(x, p.cls) <= 0));
        if (junk) { g.gearActions(p.cls, () => {}, false).sell(junk); if (!g.inventoryOf(p.cls).includes(junk)) lastAction = "賣掉用不到的裝備 " + (junk.name || junk.base); }
      }
      return;
    }
    g.gearActions(p.cls, () => {}, false).equip(best.item, best.slot);
    if (Object.values(g.equippedOf(p.cls)).includes(best.item)) lastAction = "已自動穿上較佳裝備：" + itemZh(best.item);
  }
  // 營地整備：沿用原版 openCampTrade 與商店介面回呼（hud.showTown 的參數），一次只做一個動作。
  // 實測（2026-11-01）：store＝恰西升級與裝備、akara＝藥水（1000 金，下一局放入藥帶）、stash＝倉庫／收藏庫（toStash、collectAll、可直接 equip）。
  let shop = null, trade = null, smithAt = -Infinity;
  const RANKS = ["Vitality", "Damage Reduced", "Replenish Life", "Potion Healing", "Faster Cast Rate", "Energy", "Faster Run/Walk", "Strength", "Dexterity", "Fire Pierce", "Cold Pierce", "Lightning Pierce", "Poison Pierce", "Physical Pierce", "Experience", "Magic Find", "Gold Find", "Sell Price", "Reroll", "Banish", "Skip"];
  const keepType = (item) => ["quest", "rune", "gem", "jewel"].includes(item.type) || /charm|jewel|rune|gem|key|essence|token/i.test(String(item.type || "") + " " + String(item.base || ""));
  function hookTown(g) {
    const hud = g.hud;
    if (!hud || typeof hud.showTown !== "function") return false;
    if (hud.__d2autobotTown === api) return true;
    const own = Object.prototype.hasOwnProperty.call(hud, "showTown"), original = hud.showTown;
    const wrapper = keepFunctionName(original, function (...args) { if (alive) trade = { gold: args[0], wares: args[1] || [], acts: args[2] || {}, gear: args[3] || null }; return Reflect.apply(original, this, args); });
    hud.showTown = wrapper;
    hud.__d2autobotTown = api;
    // 只有在目前仍是自己的包裝時才還原；若其他工具之後又包了一層，保留它（還原會把別人的包裝一起刪掉）。包裝本身只記錄狀態並原樣轉交，殘留無副作用。
    restores.push(() => { if (hud.showTown !== wrapper) return; if (own) hud.showTown = original; else delete hud.showTown; delete hud.__d2autobotTown; });
    return true;
  }
  // 實測：倉庫（only=stash）以角色畫面顯示，leave 後畫面仍留著，需再用原版 closeCharacter 關閉。
  function leaveTrade(g) {
    // 離開動作若拋錯（遊戲的商店關閉回呼），不可讓狀態卡住：記錄原因，仍然清掉交易與商店開啟狀態。
    try { if (g.state === "town") trade?.acts?.leave?.(); }
    catch (err) { lastAction = "離開商店失敗：" + String(err.message || err); }
    try {
      const sheet = document.getElementById("character");
      if (shop?.open && sheet && !sheet.classList.contains("hidden")) g.hud?.closeCharacter?.();
    } catch (err) { lastAction = "關閉角色頁失敗：" + String(err.message || err); }
    trade = null; if (shop) shop.open = null;
  }
  function openTrade(g, kind) {
    // 跑圖中碰到恰西（幕末清場後出現）已開著他的商店：只能用這一間，不切換。
    // 原版 openSmith 的商店同時提供倉庫操作（toStash、collectAll、equip 可從倉庫取），stash 步驟也在同一畫面完成。
    if (shop.smith) { if (!trade && typeof g.showTown === "function") g.showTown(); return ["store", "stash"].includes(kind) && g.state === "town" && !!trade; }
    if (shop.open === kind && g.state === "town" && trade) return true;
    leaveTrade(g);
    if (g.state !== "camp") { lastAction = "非營地，無法開啟" + (kind === "stash" ? "倉庫" : "商店") + "，略過此步驟"; return false; }
    g.openCampTrade(kind); shop.open = kind;
    // 開啟失敗（沒有建立交易）要明確記錄，不可靜默當成已完成。
    const ok = !!trade && g.state === "town";
    if (!ok) lastAction = "無法開啟" + (kind === "stash" ? "倉庫" : "商店") + "，略過此步驟";
    return ok;
  }
  function stashItems(view) {
    // 原版 uniques 為 Map，而非一般物件；直接 Object.values 會漏掉整個收藏庫。
    const values = (x) => x instanceof Map ? [...x.values()] : Object.values(x || {});
    const tabs = values(view?.tabs).flat(), kept = values(view?.uniques).flat();
    return [...tabs, ...kept].map((x) => x?.item ?? x).filter((x) => x?.base);
  }
  const shopSteps = {
    stash(g, cls) {
      if (!openTrade(g, "stash")) return true;
      const a = trade.gear?.actions, view = trade.gear?.view?.stash;
      if (!a) return true;
      if (settings.gear.autoEquip) {
        const charm = stashItems(view).find((x) => isCharm(x) && !shop.tried.has(x));
        if (charm) { shop.tried.add(charm); a.equip(charm); lastAction = "整備：從倉庫放入護符 " + itemZh(charm); return false; }
        // 倉庫與收藏庫的裝備一起評估；原版 equip 在倉庫情境可直接從倉庫或收藏庫取出穿上。
        const best = bestGear(g, [...g.inventoryOf(cls), ...stashItems(view)].filter((x) => !shop.tried.has(x)));
        if (best) { shop.tried.add(best.item); a.equip(best.item, best.slot); lastAction = "整備：換上較佳裝備 " + itemZh(best.item); return false; }
      }
      if (settings.town.collect && (view ? view.collect > 0 : shop.smith) && !shop.collected && typeof a.collectAll === "function") { shop.collected = true; a.collectAll(); lastAction = "整備：把暗金／套裝收進收藏庫"; return false; }
      if (settings.town.stash && typeof a.toStash === "function") {
        const item = g.inventoryOf(cls).find((x) => x?.base && !shop.tried.has(x) && !keepType(x) && ["unique", "set", "runeword", "rare"].includes(x.rarity));
        if (item) { shop.tried.add(item); a.toStash(item); lastAction = "整備：存入倉庫 " + itemZh(item); return false; }
      }
      return true;
    },
    sell(g, cls) {
      if (!settings.town.sellJunk || !openTrade(g, "store")) return true;
      const a = trade.gear?.actions, item = g.inventoryOf(cls).find((x) => x?.base && !shop.tried.has(x) && !keepType(x) && ["normal", "magic", "rare"].includes(x.rarity));
      if (!a?.sell || !item) return true;
      shop.tried.add(item); a.sell(item); lastAction = "整備：賣出 " + itemZh(item);
      return false;
    },
    potions(g) {
      if (!settings.town.buyPotions || !openTrade(g, "akara")) return true;
      // 藥水名稱可能被在地化，改以描述「Heals … Life」或第一個藥水欄判斷；買不起或腰帶滿時原版 canBuy 為 false。
      // 遊戲 20261101.1 起阿卡拉也賣魔力藥水（法師），另有解毒、解凍：只買生命類（healing／potion／rejuvenation），找不到就不買，不再退而買任一藥水。
      const LIFE = ["healing", "potion", "rejuvenation"], kindOf = (w) => typeof w?.potion === "string" ? w.potion : w?.kind ?? w?.item?.kind ?? null;
      const wares = trade.wares || [], heal = (w) => w?.potion && (kindOf(w) ? LIFE.includes(kindOf(w)) : /Heal|Life|生命|治療/i.test(String(w.describe || "") + (w.name || "")) && !/Mana|魔力|法力|Antidote|Thaw|解毒|解凍/i.test(String(w.describe || "") + (w.name || "")));
      const i = wares.findIndex((w) => heal(w) && w.canBuy);
      // 開啟就買到腰帶滿或金幣不足為止（原版 canBuy 會反映）。
      const w = wares[i];
      if (!w) return true;
      trade.acts.buy(i); lastAction = "整備：向阿卡拉買生命藥水";
      return false;
    },
    upgrades(g) {
      if (!openTrade(g, "store")) return true;
      const wares = trade.wares;
      if (settings.town.buyGear && settings.gear.autoEquip) {
        const offers = wares.filter((w) => w?.item && w.canBuy && !shop.tried.has(w.item));
        const best = offers.length ? bestGear(g, offers.map((w) => w.item)) : null;
        if (best) { shop.tried.add(best.item); trade.acts.buy(wares.findIndex((w) => w.item === best.item)); lastAction = "整備：向恰西買較佳裝備 " + itemZh(best.item); return false; }
      }
      if (!settings.town.charsiUpgrades) return true;
      // 依優先順序加權並計入已買等級，讓金幣平均投入生命、減傷、回血等永久成長。
      // 實測：只買得起便宜雜項時會把錢花光（物理穿透、Skip），核心升級沒滿就存錢；穿透只買職業會用到的元素。
      const PIERCE = { sorceress: ["Lightning", "Cold", "Fire"], necromancer: ["Poison", "Physical"], amazon: ["Physical", "Cold", "Fire", "Lightning"], paladin: ["Physical", "Lightning"], druid: ["Physical", "Cold", "Fire"], barbarian: ["Physical"], assassin: ["Physical", "Lightning", "Cold", "Fire"] }[g.kit?.id] || ["Physical"];
      const useful = (w) => !/ Pierce$/.test(w.name) || PIERCE.includes(w.name.replace(/ Pierce$/, ""));
      const core = wares.filter((w) => w && !w.item && RANKS.indexOf(w.name) >= 0 && RANKS.indexOf(w.name) < 7 && !(finite(w.maxRank) && w.rank >= w.maxRank && !w.endless));
      const saving = core.some((w) => !w.canBuy);
      let pick = -1, score = Infinity;
      wares.forEach((w, i) => {
        if (!w || !useful(w) || (saving && !core.includes(w))) return;
        if (!w || w.item || w.imbue || !w.canBuy || /^(?:Resurrect|Mercenary)/.test(w.name || "")) return;
        // 依排行榜配點：該職業幾乎不加的屬性（如法師的力量、敏捷）不買。
        const attr = ladderOf(g)?.attributes?.[String(w.name).toLowerCase()];
        if (attr !== undefined && attr < 0.1 && w.name !== "Vitality") return;
        const order = RANKS.indexOf(w.name), value = (order < 0 ? RANKS.length + 5 : order) + (w.rank || 0) * 3;
        if (value < score) { pick = i; score = value; }
      });
      if (pick < 0 || shop.buys++ > 60) return true;
      trade.acts.buy(pick); lastAction = "整備：恰西升級 " + zt(wares[pick].name);
      return false;
    },
  };
  let townSince = 0;
  function campShop(g, now) {
    // 營地整備屬於自動戰鬥分頁，只受自動戰鬥總開關控制。
    if (!settings.progressEnabled || !settings.town.enabled) { if (shop && !shop.done) { leaveTrade(g); shop = null; } return false; }
    if (g.state === "playing") { shop = null; townSince = 0; return false; }
    // 依原版對話流程：阿卡拉對話先呼叫 akaraSearch，嘗試翻譯卷軸。
    if (g.state === "camp" && !g.trade && !g.swapping && !g.save?.cursor && g.kit && typeof g.akaraSearch === "function") {
      const cls = g.kit.id, scroll = [...(g.inventoryOf?.(cls) || []), ...(g.save?.stashTabs?.[cls] || [])].find((x) => x?.base === "bks" && now - (questTried.get(x) ?? -Infinity) > 300000);
      if (scroll) { questTried.set(scroll, now); g.akaraSearch(); lastAction = "嘗試向阿卡拉交付伊尼弗斯卷軸"; return true; }
    }
    // 實測：死亡保護離場後原版停在營地的城鎮商店畫面（state=town），整備已完成就沒人離開而卡住；
    // 營地裡停在商店 3 秒以上且不在整備中，就用原版離開回到營地，讓自動開局／繼續接手。
    if (g.state === "town" && g.camp && (!shop || shop.done)) {
      if (!townSince) townSince = now;
      if (now - townSince > 3000) {
        townSince = 0; lastAction = "離開營地商店，準備繼續";
        // 實測：商店介面已關（g.trade 為空、#town 隱藏）但 state 仍是 town；比照重置技能流程直接回到 camp。
        const panel = document.getElementById("town");
        if (!g.trade && (!panel || panel.classList.contains("hidden"))) { g.state = "camp"; return true; }
        if (!trade) hookTown(g) && g.showTown?.(); trade?.acts?.leave?.(); trade = null; return true;
      }
    } else townSince = 0;
    if (shop?.done) return false;
    // 實測：清場後碰到恰西會停在商店畫面不動；順便賣裝與升級，再離開回到戰鬥。
    if (!shop && g.state === "town" && g.trade?.smith && !g.camp && hookTown(g)) {
      // 剛逛過就直接離開，避免反覆碰到恰西。
      if (now - smithAt < 60000) { if (!trade) g.showTown?.(); trade?.acts?.leave?.(); trade = null; return true; }
      smithAt = now;
      shop = { steps: ["stash", "sell", "upgrades", "stash"], i: 0, at: 0, tried: new Set(), buys: 0, actions: 0, open: "store", collected: false, smith: true };
    }
    if (!shop) {
      if (g.state !== "camp" || !g.camp || g.swapping || typeof g.openCampTrade !== "function" || !g.kit || !g.world?.player || !hookTown(g)) return false;
      charmTried = new WeakSet();
      shop = { steps: ["stash", "sell", "potions", "upgrades", "stash"], i: 0, at: 0, tried: new Set(), buys: 0, actions: 0, open: null, collected: false };
    }
    if (now - shop.at < 250) return true;
    shop.at = now;
    try {
      while (shop.i < shop.steps.length) {
        if (++shop.actions > 200) throw new Error("整備動作過多");
        const name = shop.steps[shop.i];
        if (!shopSteps[name](g, g.kit.id)) return true;
        shop.i++;
        if (name === "upgrades" || name === "potions") shop.tried.clear();
      }
    } catch (err) { lastAction = "整備中斷：" + String(err.message || err); }
    leaveTrade(g); shop.done = true; actionAt = now;
    return true;
  }
  // 排行榜學習：升級選卡依高手技能／被動權重，屬性點依高手配點比例；技能偏離時到阿卡拉重置（re-draft）。
  let levelCards = null, levelHandlers = null, levelOfferKind = null, levelRerollCount = 0, campMenu = null, statsAt = 0, redraft = null, redraftVisits = 0;
  function hookBuild(g) {
    const hud = g.hud;
    if (!hud || hud.__d2autobotBuild === api) return;
    const wrapOwn = (object, name, factory) => {
      if (typeof object?.[name] !== "function") return;
      const own = Object.prototype.hasOwnProperty.call(object, name), original = object[name];
      const wrapper = factory(original);
      object[name] = wrapper;
      // 同上：只還原仍是自己包裝的值，避免覆蓋其他工具後來安裝的包裝。
      restores.push(() => { if (object[name] !== wrapper) return; if (own) object[name] = original; else delete object[name]; });
    };
    // 實測原版 hud.showLevelUp(cards, build, handlers)：cards 為 {title, subtitle, text, rarity}；showCampMenu(npc, items) 為 {label, disabled, run}。
    wrapOwn(g, "offerLevelUp", (original) => function (...args) { if (alive) levelOfferKind = this.slotPicks?.[0] ?? null; return Reflect.apply(original, this, args); });
    wrapOwn(hud, "showLevelUp", (original) => function (...args) { if (alive) { levelCards = Array.isArray(args[0]) ? args[0] : null; levelHandlers = args[2] && typeof args[2] === "object" ? args[2] : null; } return Reflect.apply(original, this, args); });
    wrapOwn(g, "showCampMenu", (original) => function (...args) { if (alive) campMenu = { npc: args[0], items: Array.isArray(args[1]) ? args[1] : [] }; return Reflect.apply(original, this, args); });
    hud.__d2autobotBuild = api;
    restores.push(() => { delete hud.__d2autobotBuild; });
  }
  const ladderOf = (g) => settings.build.ladder ? LADDER.classes[g?.kit?.id || g?.world?.player?.cls] : null;
  for (const c of Object.values(LADDER.classes)) {
    c._skillMap = new Map(c.skills.map((x) => [x[1].toLowerCase(), x]));
    c._passiveMap = new Map(c.passives.map((x) => [x[1].toLowerCase(), x]));
  }
  // 原版技能表（itemArt 模組匯出：技能含 maxLevel／evolution{passive,into}／synergies[{from}]；被動含 maxLevel）。
  const ALL_SKILLS_BONUS = 20;
  let allSkillsOverride = null;
  let SKILLS = null, PASSIVES = null, SKILL_BY_NAME = null, PASSIVE_BY_NAME = null, nativeLevelChoices = null, nativeWeapon = null, nativeKeyBindings = null;
  async function loadSkillTables(gameUrl, prefetchedSource = "") {
    // 相依模組檔名含每版不同的雜湊，從遊戲入口的 import 動態解析，不寫死檔名（2026-11-04 起）。
    let gameSource = prefetchedSource;
    if (!gameSource) {
      try { gameSource = await (await fetch(gameUrl, { signal: abort.signal })).text(); } catch { /* 讀不到就走各自的降級 */ }
    }
    const itemArtName = /["']\.\/(itemArt-[\w-]+\.js)["']/.exec(gameSource)?.[1];
    const saveTransferName = /["']\.\/(saveTransfer-[\w-]+\.js)["']/.exec(gameSource)?.[1];
    const itemArtP = itemArtName ? import(new URL(itemArtName, gameUrl).href).catch(() => null) : Promise.resolve(null);
    const saveTransferP = saveTransferName ? import(new URL(saveTransferName, gameUrl).href).catch(() => null) : Promise.resolve(null);
    try {
      const m = await itemArtP;
      if (m) {
        // 鍵位讀取函式的匯出名每版都會變（20261103.2 為 V_ 陣列 as Di，20261104.1 為 j_ as Sa），改依特徵辨認：
        // 零參數、以 JSON.parse(localStorage.getItem(…)) 讀取 d2s:keys。
        for (const v of Object.values(m)) {
          if (typeof v === "function" && !nativeKeyBindings && v.length === 0 && /JSON\.parse\(localStorage\.getItem\(/.test(Function.prototype.toString.call(v))) { nativeKeyBindings = v; continue; }
          if (!v || typeof v !== "object" || Array.isArray(v)) continue;
          if (!SKILLS && v.doubleSwing?.name && v.magicArrow?.name) { SKILLS = v; SKILL_BY_NAME = new Map(Object.entries(v).map(([k, d]) => [String(d?.name || "").toLowerCase(), k])); }
          if (!PASSIVES && v.innerSight?.name && v.criticalStrike?.name) { PASSIVES = v; PASSIVE_BY_NAME = new Map(Object.entries(v).map(([k, d]) => [String(d?.name || "").toLowerCase(), k])); }
        }
      }
    } catch { /* 讀不到就只用排行榜權重 */ }
    try {
      const module = await saveTransferP;
      if (module) {
        const matches = Object.values(module).filter((fn) => {
          if (typeof fn !== "function" || fn.length !== 4) return false;
          const source = Function.prototype.toString.call(fn);
          return /\.difficulty/.test(source) && /\.type\s*!==/.test(source) && /[`'"]attribute[`'"]/.test(source);
        });
        if (matches.length === 1) nativeLevelChoices = matches[0];
      }
      // 從同一版 Game 的選卡呼叫與 import 解析武器函式，壓縮匯出名稱每版可能不同。
      const source = gameSource;
      const offer = /offerLevelUp\(\)\{[\s\S]{0,300}?=\(\)=>[\w$]+\([^,]+,[^,]+,[^,]+,([\w$]+)\(this\.world\.player\)\)/.exec(source);
      if (offer) for (const match of source.matchAll(/import\{([^}]+)\}from["']\.\/(itemArt-[\w-]+\.js)["']/g)) {
        const binding = match[1].split(",").map((x) => x.trim()).find((x) => x.endsWith(" as " + offer[1]));
        if (binding) { const mod = match[2] === itemArtName ? await itemArtP : await import(new URL(match[2], gameUrl).href); const fn = mod?.[binding.split(/\s+as\s+/)[0]]; if (typeof fn === "function") nativeWeapon = fn; break; }
      }
    } catch { /* 無法確認原版候選產生器時直接選卡 */ }
  }
  const idByName = (table, name) => table === SKILLS && SKILL_BY_NAME ? SKILL_BY_NAME.get(name) : table === PASSIVES && PASSIVE_BY_NAME ? PASSIVE_BY_NAME.get(name) : table && Object.keys(table).find((k) => String(table[k]?.name || "").toLowerCase() === name);
  function ownedSkillUpgrade(g, title) {
    const name = String(title || "").trim().toLowerCase(), cls = g?.kit?.id || g?.world?.player?.cls;
    const id = idByName(SKILLS, name) || LADDER.classes[cls]?._skillMap?.get(name)?.[0];
    const skill = id && (g?.build?.skills || []).find((x) => x.id === id);
    return !!skill && (skill.level || 1) < (SKILLS?.[id]?.maxLevel || 99);
  }
  function ladderWeight(g, name) {
    const l = ladderOf(g);
    if (!l) return { skill: 0, passive: 0 };
    const s = l._skillMap ? l._skillMap.get(name) : l.skills.find(([, n]) => n.toLowerCase() === name);
    const p = l._passiveMap ? l._passiveMap.get(name) : l.passives.find(([, n]) => n.toLowerCase() === name);
    // 依使用者要求：排行榜沒出現的技能／被動（反編譯整理出 26 項，例如 Bash、Battle Orders、Werebear）也要能選，給保守預設權重 0.5（上榜約 0.1～2）。
    const sk = s ? null : idByName(SKILLS, name), pk = p ? null : idByName(PASSIVES, name);
    return { skill: s ? s[2] : sk ? 0.5 : 0, passive: p ? p[2] : pk ? 0.5 : 0, skillId: s?.[0] ?? sk ?? undefined, passiveId: p?.[0] ?? pk ?? undefined };
  }
  // 選卡（卡片隨機出現）：排行榜是 99 級配置，前期等級不夠，不能只照它選。
  // 1. 進化就緒的卡最優先；2. 已學技能升級（主力優先）；3. 進化被動與協同技能；4. 新技能與其他被動。
  function ladderScore(g, title) {
    const name = String(title || "").trim().toLowerCase();
    if (!name) return 0;
    const lw = ladderWeight(g, name), owned = g.build?.skills || [], passives = g.build?.passives || {};
    const skillId = idByName(SKILLS, name) || lw.skillId, passiveId = !skillId ? (idByName(PASSIVES, name) || lw.passiveId) : null;
    const attack = owned.filter((x) => (REACH[x.id] ?? 1) > 0);
    const main = attack.reduce((a, x) => !a || (x.level || 1) > (a.level || 1) || ((x.level || 1) === (a.level || 1) && ladderWeight(g, String(SKILLS?.[x.id]?.name || "").toLowerCase()).skill > ladderWeight(g, String(SKILLS?.[a.id]?.name || "").toLowerCase()).skill) ? x : a, null);
    const mainDef = main && SKILLS?.[main.id];
    if (skillId) {
      const mine = owned.find((x) => x.id === skillId), def = SKILLS?.[skillId];
      if (mine) {
        const max = def?.maxLevel || 99;
        if ((mine.level || 1) >= max) return -5;
        return (mine === main ? 160 : 140) + lw.skill * 3 - (mine.level || 1) * 0.5;
      }
      if (REACH[skillId] === 0) return 6 + lw.skill * 2;
      const synergy = mainDef?.synergies?.some((x) => x.from === skillId) ? 25 : 0;
      return (attack.length < 2 ? 45 : attack.length < 4 ? 12 : 2) + synergy + lw.skill * 4;
    }
    if (passiveId) {
      const lvl = passives[passiveId] || 0, max = PASSIVES?.[passiveId]?.maxLevel || 99;
      if (lvl >= max) return -5;
      const evolveMain = mainDef?.evolution?.passive === passiveId ? 55 : 0;
      const evolveAny = owned.some((x) => SKILLS?.[x.id]?.evolution?.passive === passiveId) ? 30 : 0;
      return 10 + Math.max(evolveMain, evolveAny) + lw.passive * 4;
    }
    return 0;
  }
  function pickCard(g, buttons) {
    let best = 0, score = -Infinity, upgrade = false, evolution = false;
    buttons.forEach((button, i) => {
      const card = levelCards?.[i], evolve = button.classList.contains("evolves") || !!button.querySelector(".evolves.ready");
      // 實測卡名是 .lines 的第一個元素：單一 canvas（如 Faster Cast Rate），或 .d2-parts 內多個 canvas 以「-」接副標題（如 Ice|Bolt|-|New skill）。
      const head = button.querySelector(".lines")?.firstElementChild, parts = head ? [...(head.tagName === "CANVAS" ? [head] : head.querySelectorAll("canvas"))].map((c) => c.textContent.trim()) : [], cut = parts.indexOf("-");
      const title = card?.title ?? (parts.length ? parts.slice(0, cut < 0 ? parts.length : cut).join(" ") : button.querySelector("strong")?.textContent);
      // 依使用者要求：技能進化後，基礎技能可再次學習（卡片寫「再次習得」／again，與進化技能並存）→ 額外加 20 分。
      const again = /再次習得|再次學習| again /i.test(button.textContent || "") || [...button.querySelectorAll("canvas")].some((c) => /again|再次/i.test(c.textContent || ""));
      let base = 0; try { base = g ? ladderScore(g, title) : 0; } catch { base = 0; }
      const value = (evolve ? 1000 : 0) + (again ? 20 : 0) + base - i * 0.01;
      if (value > score) { best = i; score = value; upgrade = !!g && ownedSkillUpgrade(g, title); evolution = evolve; }
    });
    return { best, score, upgrade, evolution };
  }
  function availableLevelChoices(g) {
    if (!nativeLevelChoices || !nativeWeapon || !g?.build?.kit || !g.world?.player || !Array.isArray(g.build.skills) || !g.build.passives || !g.build.banished?.has || levelHandlers?.redraft || (!g.build.skills.length || levelOfferKind === "first")) return null;
    // 原版產生器在抽樣前排序可用候選，短暫擷取排序輸入；同步執行並立即還原，不修改角色或消耗重抽。
    const originalSort = Array.prototype.sort, originalPush = Array.prototype.push, pools = [], replacements = [];
    try {
      // 20261102.1 的原版先產生所有合法替換技能，再隨機挑一個加入候選池。
      Array.prototype.push = keepFunctionName(originalPush, function (...items) {
        for (const item of items) if (item?.type === "respec" && typeof item.id === "string" && typeof item.replaces === "string" && Number.isFinite(item.level) && Number.isFinite(item.banked)) Reflect.apply(originalPush, replacements, [item]);
        return Reflect.apply(originalPush, this, items);
      });
      Array.prototype.sort = keepFunctionName(originalSort, function (compare) {
        if (this.length && this.every((x) => x && typeof x === "object" && typeof x.type === "string")) pools.push(this.slice());
        return Reflect.apply(originalSort, this, [compare]);
      });
      const weapon = nativeWeapon ? nativeWeapon(g.world.player) : undefined;
      nativeLevelChoices(g.build, g.world, levelOfferKind ?? undefined, weapon);
      if (!pools.length) return null;
      const candidates = pools.flat();
      // 只有一般升級且原版實際將替換卡放入抽樣池時，才補上其餘可替換選項。
      if (levelOfferKind == null && candidates.some((x) => x.type === "respec")) Reflect.apply(originalPush, candidates, replacements);
      return candidates;
    } catch { return null; }
    finally { Array.prototype.sort = originalSort; Array.prototype.push = originalPush; }
  }
  function shouldReroll(g, choice) {
    // 畫面已有可升級的已學技能或可進化卡時，立即選擇，不為尋找別的卡浪費重抽。
    if (choice.upgrade || choice.evolution) return false;
    if (!canReroll(g)) return false;
    const pool = availableLevelChoices(g);
    if (!pool || !SKILLS || !PASSIVES) return false;
    const currentTitles = new Set((levelCards || []).map((card) => String(card?.title || "").trim().toLowerCase()));
    return pool.some((candidate) => {
      const def = candidate.type === "skill" || candidate.type === "respec" ? SKILLS[candidate.id] : candidate.type === "passive" || candidate.type === "mastery" ? PASSIVES[candidate.id] : null;
      if (!def?.name || currentTitles.has(def.name.toLowerCase())) return false;
      return ladderScore(g, def.name) >= choice.score + 10;
    });
  }
  function canReroll(g) {
    if (!settings.progressEnabled || !settings.build.autoReroll || levelRerollCount >= 2) return false;
    const rerollBtn = document.getElementById("reroll") || document.querySelector("#level-up button#reroll, #level-up .reroll, button[data-action='reroll']");
    if (rerollBtn && rerollBtn.disabled) return false;
    if (g?.build && typeof g.build.rerolls === "number" && g.build.rerolls <= 0) return false;
    return true;
  }
  // 原版允許重新綁定選卡與重抽；沒有回呼時只使用可確認的鍵位。
  function pulseCardAction(action, defaultCode) {
    let code = defaultCode;
    try {
      if (nativeKeyBindings) {
        const binding = nativeKeyBindings()?.[action];
        if (!Array.isArray(binding)) return false;
        code = binding.find((x) => typeof x === "string" && x.length > 0 && x.length < 40);
      } else {
        const raw = localStorage.getItem("d2s:keys");
        if (raw !== null) {
          const value = JSON.parse(raw), keys = value && typeof value === "object" && !Array.isArray(value) ? value : {};
          const defaults = { pick1: ["Digit1", "Numpad1"], pick2: ["Digit2", "Numpad2"], pick3: ["Digit3", "Numpad3"], reroll: ["KeyR"], skip: ["KeyX"], banish: ["KeyB"] };
          const explicit = Object.keys(defaults).filter((name) => Array.isArray(keys[name]));
          const valid = (x) => typeof x === "string" && x.length > 0 && x.length < 40 && !["Escape", "MetaLeft", "MetaRight", "OSLeft", "OSRight", "ContextMenu", "Fn", "FnLock"].includes(x);
          const binding = explicit.includes(action) ? keys[action].slice(0, 2) : (defaults[action] || []).filter((x) => !explicit.some((name) => name !== action && keys[name].slice(0, 2).includes(x)));
          code = binding.find(valid);
        }
      }
    } catch { return false; }
    if (!code) return false;
    const key = /^Key[A-Z]$/.test(code) ? code.slice(3).toLowerCase() : /^Digit[0-9]$/.test(code) ? code.slice(5) : /^Numpad[0-9]$/.test(code) ? code.slice(6) : code;
    keyPulse(code, key); return true;
  }
  function triggerCardPick(index) {
    if (typeof levelHandlers?.pick === "function" && typeof game?.hud?.closeLevelUp === "function") {
      // 原版選卡包裝器先關閉畫面，再執行 pick；重配技能時 pick 可能立即開啟下一張。
      try { game.hud.closeLevelUp(); levelHandlers.pick(index); return "picked"; } catch { return null; }
    }
    return pulseCardAction("pick" + (index + 1), "Digit" + (index + 1)) ? "sent" : null;
  }
  function triggerReroll(now) {
    let sent = false;
    if (typeof levelHandlers?.reroll === "function") {
      try { levelHandlers.reroll(); sent = true; } catch {}
    } else sent = pulseCardAction("reroll", "KeyR");
    if (sent) levelRerollCount++;
    lastAction = sent ? "自動配技能：嘗試使用重抽換一批技能卡" : "無法確認重抽鍵位，請手動選卡";
    cardActionAt = now;
  }
    // 屬性點依高手比例分配；原版 spendStatPoints(屬性, 點數)。
  // 依使用者要求：撿到赫拉迪克法典（hcx，+1 技能變體點數，上限 10）就讀，並把點數花在技能變體上。
  // 實測原版：game.useQuest(職業, 物品, 完成回呼) 會轉給 readCodex；變體介面為 hud.d2.mods { points() → {total, used, free}, options(技能), active(技能), set(技能, 變體) }。
  // 選法：已學技能中尚未套用變體者，優先排行榜高手常用變體（LADDER.mods），其次技能等級高者的第一個變體。
  let codexAt = 0; const questTried = new WeakMap();
  function useCodex(g, now) {
    if (!settings.progressEnabled || now - codexAt < 3000 || !["playing", "camp"].includes(g.state) || g.trade || g.swapping || g.save?.cursor || !g.kit) return;
    codexAt = now;
    const mods = g.hud?.d2?.mods, cls = g.kit.id;
    if (!mods || typeof mods.points !== "function" || typeof mods.set !== "function") return;
    const pts = mods.points() || {};
    const book = (g.inventoryOf?.(cls) || []).find((x) => x?.base === "hcx");
    if (book && (pts.total ?? 0) < 10 && typeof g.useQuest === "function") { g.useQuest(cls, book, () => {}); lastAction = "讀取赫拉迪克法典（+1 技能變體點數）"; return; }
    // 依使用者要求：任務獎品要會使用。原版 useQuest 依種類分流：可直接使用的（+1 全技能卷軸等）當場生效；
    // 依使用者要求：交付物品走原版任務流程；其他獎品在角色畫面使用，失敗五分鐘內不重試。
    const quest = (g.inventoryOf?.(cls) || []).find((x) => x?.type === "quest" && !["hcx", "bks", "bkd"].includes(x.base) && now - (questTried.get(x) ?? -Infinity) > 300000);
    if (quest && typeof g.useQuest === "function" && typeof g.openCharacter === "function" && g.world?.player?.cls === cls) {
      const hud = g.hud, previous = g.state, original = hud?.chooseTree, own = Object.prototype.hasOwnProperty.call(hud || {}, "chooseTree");
      if (!hud || typeof hud.closeCharacter !== "function" || typeof original !== "function") return;
      questTried.set(quest, now);
      try {
        // 依原版選樹流程：技能樹編號為 1～3，依排行榜權重選尚未取得的樹。
        hud.chooseTree = keepFunctionName(original, function (kit, taken, pick) {
          hud.d2?.useTreeKit?.(kit); const slots = hud.d2?.treeSlots, weights = [0, 0, 0, 0];
          for (const [id, , weight] of LADDER.classes[cls]?.skills || []) { const page = slots?.get?.(id)?.page; if (page >= 1 && page <= 3) weights[page] += weight; }
          const choices = [1, 2, 3].filter((i) => !taken?.includes(i)); choices.sort((a, b) => weights[b] - weights[a]); if (choices.length) pick(choices[0]);
        });
        g.openCharacter(previous, cls);
        if (g.readsHere?.(cls, "tree") || g.readsHere?.(cls, "attribute")) {
          g.useQuest(cls, quest, () => {});
          if (g.tomeRead?.item === quest && typeof g.readTome === "function") { const attr = Object.entries(LADDER.classes[cls]?.attributes || {}).sort((a, b) => b[1] - a[1])[0]?.[0]; if (attr) g.readTome(attr); }
        }
        if (!(g.inventoryOf(cls) || []).includes(quest)) lastAction = "使用任務獎品：" + (quest.name || quest.base);
      } finally { if (own) hud.chooseTree = original; else delete hud.chooseTree; if (g.state === "character") { hud.closeCharacter(); if (g.state === "character") g.state = previous; } }
      return;
    }
    if (!((pts.free ?? 0) > 0)) return;
    const ladder = LADDER.classes[cls]?.mods || {};
    const skills = [...(g.build?.skills || [])].sort((a, b) => (b.level || 0) - (a.level || 0));
    let pick = null;
    for (const sk of skills) {
      if (mods.active(sk.id)) continue;
      const opts = mods.options(sk.id) || [];
      if (!opts.length) continue;
      const want = opts.find((o) => o.id === ladder[sk.id]);
      if (want) { pick = [sk.id, want]; break; }
      if (!pick) pick = [sk.id, opts[0]];
    }
    if (!pick) return;
    mods.set(pick[0], pick[1].id);
    if (mods.active(pick[0])) lastAction = "技能變體：" + pick[0] + " → " + (pick[1].name || pick[1].id);
  }
  // 依使用者要求：累積各屬性應得小數，逐點補足最大欠額，避免少量配點全落在最高比例。
  function nextStatCarry(ratio, carry) {
    const entries = Object.entries(ratio).filter(([, value]) => finite(value) && value > 0), total = entries.reduce((sum, [, value]) => sum + value, 0);
    if (!total) return null;
    const next = Object.fromEntries(entries.map(([key, value]) => [key, (finite(carry?.[key]) ? carry[key] : 0) + value / total]));
    const attr = entries.reduce((best, [key]) => next[key] > next[best] ? key : best, entries[0][0]);
    next[attr] -= 1; return { attr, carry: next };
  }
  const STAT_CARRY_KEY = "d2autobot:statCarry";
  let statCarry = {};
  try { const saved = JSON.parse(localStorage.getItem(STAT_CARRY_KEY) || "{}"); if (saved && typeof saved === "object" && !Array.isArray(saved)) statCarry = saved; } catch { /* 本次從零累積。 */ }
  function autoStats(g, now) {
    if (!settings.progressEnabled || !settings.build.autoStats || now - statsAt < 1000 || typeof g.spendStatPoints !== "function") return;
    statsAt = now;
    const unspent = g.build?.unspent | 0, ratio = ladderOf(g)?.attributes, cls = g.kit?.id;
    if (unspent <= 0 || !ratio || !cls) return;
    let spent = 0;
    for (let i = 0; i < unspent; i++) {
      const next = nextStatCarry(ratio, statCarry[cls]); if (!next) break;
      const before = g.build?.unspent; g.spendStatPoints(next.attr, 1);
      if (!(g.build?.unspent < before)) break;
      statCarry[cls] = next.carry; spent++;
    }
    if (spent) { try { localStorage.setItem(STAT_CARRY_KEY, JSON.stringify(statCarry)); } catch { /* 本次仍生效。 */ } lastAction = "依排行榜比例分配屬性點 " + spent + " 點"; }
  }
  // 目前技能投資與高手前 8 名技能重疊不到一半時，在營地向阿卡拉重置技能，再依排行榜重新選卡。
  // 重置技能判斷（原版：保留等級與裝備、重新分配所有升級，卡片仍隨機）：
  // 舊版以「是否符合排行榜 99 級配法」判斷，與依當下等級集中升級的選卡互相衝突、浪費金幣；
  // 改為看配點是否太分散：攻擊技能合計 ≥ 8 級而主力技能占比 < 40％ 就重置，重新集中升級。
  function alignment(g) {
    const skills = (Array.isArray(g.build?.skills) ? g.build.skills : []).filter((x) => (REACH[x.id] ?? 1) > 0);
    const total = skills.reduce((a, x) => a + (x.level || 1), 0);
    if (total < 8) return 1;
    return Math.max(...skills.map((x) => x.level || 1)) / total;
  }
  function campRedraft(g, now) {
    if (g.state !== "camp") { if (g.state === "playing") redraft = null; return false; }
    if (!settings.progressEnabled || !settings.build.redraft || !g.camp || g.swapping || typeof g.openAkara !== "function") return false;
    if (redraft?.done) return false;
    if (!redraft) {
      redraftVisits++;
      if (redraftVisits % 3 !== 1 || alignment(g) >= 0.4) { redraft = { done: true }; return false; }
      hookBuild(g); redraft = { phase: "open", at: 0 }; campMenu = null;
    }
    if (now - redraft.at < 300) return true;
    redraft.at = now;
    const enabled = (re) => campMenu?.items.find((item) => !item.disabled && re.test(String(item.label || "")) && typeof item.run === "function");
    if (redraft.phase === "open") { g.openAkara(); redraft.phase = "choose"; return true; }
    const item = redraft.phase === "choose" ? enabled(/re-?draft your skills/i) : enabled(/re-?draft|reset|yes|confirm/i);
    // 實測：重置在首次擊殺巴爾後才開放；關閉選單後原版停在 town，需比照原版自行回到 camp。
    if (!item) { g.hud?.hideNpcMenu?.(); if (g.state === "town" && g.camp) g.state = "camp"; if (redraft.phase === "choose") lastAction = "重置技能：目前無法重置（金幣不足或未開放）"; redraft = { done: true }; return false; }
    campMenu = null; item.run();
    if (redraft.phase === "choose") { redraft.phase = "confirm"; lastAction = "重置技能：配點太分散，向阿卡拉重置後集中升級主力技能"; return true; }
    redraft = { done: true }; lastAction = "重置技能完成，重新集中升級";
    return true;
  }
  // 依使用者要求：任務模式要檢測當前任務狀態，並回營地交任務（研究見 docs/game-analysis，quests-research）。
  // 原版存檔 save.cain.quests[職業][任務ID]：'o'＝完成待領、'g'＝已領、'u' 等＝已使用；N1／M1／H1（尋找凱恩）戒指向阿卡拉領（akaraSearch），
  // 其餘 21 項向凱恩領（cainHandOver）。伊尼弗斯卷軸 bks 也由 akaraSearch 翻譯成鑰匙 bkd。
  const QUEST_DIFF = { normal: "N", nightmare: "M", hell: "H" }, QUEST_ZH = { normal: "普通", nightmare: "惡夢", hell: "地獄" };
  const hasItem = (g, base) => { const cls = g.kit?.id; return [...(g.save?.inventoryByClass?.[cls] || []), ...(g.save?.stashTabs?.[cls] || [])].some((x) => x?.base === base); };
  function questSnapshot(g) {
    const cls = g?.kit?.id, q = g?.save?.cain?.quests?.[cls] || {}, diff = g?.difficulty || g?.world?.difficulty, p = QUEST_DIFF[diff];
    const ids = p ? [1, 2, 3, 4, 5, 6].map((n) => p + n) : [];
    const done = ids.filter((id) => q[id] != null).length, pending = Object.entries(q).filter(([, v]) => v === "o").map(([k]) => k);
    const search = g?.search, stones = search?.stones?.logic;
    const cain = !p ? "" : q[p + "1"] != null ? (q[p + "1"] === "o" ? "已救出，待向阿卡拉領戒指" : "已完成") : g?.world?.tristram ? "崔斯特姆：前往凱恩牢籠" : point(search?.portalSpot) ? "石塊陣已開門：進入傳送門" : stones && !stones.done ? "觸碰石塊陣（" + (stones.lit || []).filter(Boolean).length + "／5）" : hasItem(g, "bkd") ? "有鑰匙：擊敗拉卡尼休後觸碰石塊陣" : hasItem(g, "bks") ? "有卷軸：回營地請阿卡拉翻譯" : "擊敗樹頭木拳取得伊尼弗斯卷軸";
    return { cls, diff, done, total: ids.length, pending, cain, q };
  }
  const questLine = (g) => { const qs = questSnapshot(g); return qs.total ? "任務（" + QUEST_ZH[qs.diff] + "）：完成 " + qs.done + "／" + qs.total + (qs.pending.length ? "，待領 " + qs.pending.join("、") : "") + "；尋找凱恩：" + qs.cain : ""; };
  // 依使用者要求：任務模式達成（普通、惡夢、地獄各 6 項共 18 項都有紀錄，且角色 99 級）就自動改成固定關卡模式刷地獄。
  function questModeDone(g) {
    if (!cleanupReady(g)) return false;
    const q = g?.save?.cain?.quests?.[g?.kit?.id] || {};
    if (!Object.values(QUEST_DIFF).every((p) => [1, 2, 3, 4, 5, 6].every((n) => q[p + n] != null && q[p + n] !== "o"))) return false;
    settings.quest.fixedDifficulty = "hell"; put("autoMode", "fixedDifficulty"); save(true); refreshControls();
    lastAction = "任務模式達成（地獄通關、99 級、各難度任務全部完成並交付）：自動改為固定關卡模式刷地獄";
    return true;
  }
  let turnInAt = 0;
  function reportQuests(g, now) {
    if (g.state !== "camp" || !g.camp || g.swapping || g.trade || !settings.progressEnabled || now - turnInAt < 3000) return false;
    const qs = questSnapshot(g), ring = ["N1", "M1", "H1"].some((id) => qs.q[id] === "o"), scroll = hasItem(g, "bks"), other = qs.pending.some((id) => !/^[NMH]1$/.test(id));
    if (!ring && !scroll && !other) return false;
    turnInAt = now;
    const before = JSON.stringify(qs.q);
    try {
      if ((ring || scroll) && typeof g.akaraSearch === "function") g.akaraSearch();
      else if (other && typeof g.cainHandOver === "function") { const r = g.cainHandOver(); for (const e of r?.given || []) if (e?.quest) g.questsHanded?.add?.(e.quest); }
    } catch { return false; }
    const after = questSnapshot(g), changed = JSON.stringify(after.q) !== before || (scroll && !hasItem(g, "bks"));
    lastAction = changed ? "回營地交任務：" + ((ring || scroll) ? "阿卡拉（" + (scroll ? "翻譯卷軸" : "領戒指") + "）" : "凱恩") : "交任務未成功（背包可能已滿），稍後重試";
    return changed;
  }
  // 第一幕撿到伊尼弗斯卷軸、還沒有鑰匙且本難度尚未救出凱恩：離開本局回營地請阿卡拉翻譯，再以「繼續」回到第一幕開頭（拉卡尼休重生，倒下時石塊陣出現）。
  let scrollLeftAt = -Infinity;
  function leaveForScroll(g, now) {
    if (!questOn() || autoMode() === "quest" && !cleanupReady(g) || g.state !== "playing" || g.world?.terror || now - scrollLeftAt < 60000 || typeof g.pause !== "function" || typeof g.leaveRun !== "function") return false;
    const p = QUEST_DIFF[g.difficulty], q = g.save?.cain?.quests?.[g.kit?.id] || {};
    if (!p || q[p + "1"] != null || (g.world?.act ?? 0) !== 0 || !hasItem(g, "bks") || hasItem(g, "bkd")) return false;
    scrollLeftAt = now; lastAction = "撿到伊尼弗斯卷軸：回營地請阿卡拉翻譯";
    g.pause(); if (g.state === "paused") fire(g.leaveRun(), "離場");
    return true;
  }
  function progression(g, now) {
    if (reportQuests(g, now)) return true;
    if (g.state === "camp" && questModeDone(g)) return true;
    if (campRedraft(g, now)) return true;
    if (menuResume(g, now) || campShop(g, now) || campStart(g, now)) return true;
    if (terrorMode() === "off") return false;
    const record = g.save?.terror?.[g.kit?.id];
    if (["camp", "select"].includes(g.state) && !g.swapping && record && g.save?.heroes?.[g.kit?.id]?.kept && record.playing === undefined && !record.replay) {
      fire(advance(g), "推進關卡"); return true;
    }
    if (!g.world?.terror || g.state !== "dead") return false;
    const won = !!g.tierDone;
    if (!won && !settings.terror.autoReviveOrRestart) { stop("角色陣亡，輔助已停止"); return true; }
    if (!won && (!g.runOver || g.deathTime === null || g.deathTime < 3)) return true;
    if (!won && !g.save?.heroes?.[g.kit?.id]?.kept) { stop("沒有可重試的角色"); return true; }
    if (clearWorld !== g.world) { clearWorld = g.world; clearAt = now; }
    if (now - clearAt >= settings.terror.postClearWaitSec * 1000) fire(advance(g), "推進關卡");
    return true;
  }
  function blocked() { return (!settings.enabled && !settings.progressEnabled) || document.hidden || !panel.hidden || window.__d2editIsOpen?.() || performance.now() < manualUntil || paused(); }
  let goldOverride = null;
  function restoreAllSkills() {
    const o = allSkillsOverride;
    if (!o) return;
    if (typeof o.player.allSkills === "number") o.player.allSkills -= o.added;
    allSkillsOverride = null;
  }
  function restoreGoldRate() {
    if (!goldOverride) return;
    const { player, value, own } = goldOverride;
    if (player.goldGain === 999999) { if (own) player.goldGain = value; else delete player.goldGain; }
    goldOverride = null;
  }
  // 子開關還原紀錄（致命一擊 maxCrit、一擊必殺 oneHitKill、掉寶 maxDropRate）：每個子開關記下自己改過的欄位，
  // 第一次寫入前記下原值（含是否為自有屬性），每次寫入記下寫入值。還原時只還原「目前值仍等於自己寫入值」的欄位，
  // 遊戲後來自行改過的值不蓋掉。玩家或導演物件更換前先還原舊紀錄。
  const cheatRecs = new Map();
  const CLAMP_PROPS = new Set(["owed", "waveDue"]);
  function cheatField(key, owner, obj, prop, value) {
    let rec = cheatRecs.get(key);
    if (rec && rec.owner !== owner) { restoreCheat(key); rec = null; }
    if (!rec) { rec = { owner, fields: [] }; cheatRecs.set(key, rec); }
    let f = rec.fields.find((x) => x.obj === obj && x.prop === prop);
    if (!f) { f = { obj, prop, own: Object.hasOwn(obj, prop), base: obj[prop], written: undefined }; rec.fields.push(f); }
    else if (obj[prop] !== f.written) { f.own = Object.hasOwn(obj, prop); f.base = obj[prop]; }
    obj[prop] = value;
    f.written = value;
  }
  function restoreCheat(key) {
    const rec = cheatRecs.get(key);
    if (!rec) return;
    for (const f of rec.fields) {
      // 怪物生成待補數（owed／waveDue）會被遊戲逐步消耗而不再等於寫入值；關閉時若仍高於原值就降回原值，否則會繼續補出大量怪物（實機：450 消耗到 435 後殘留）。
      if (CLAMP_PROPS.has(f.prop) && typeof f.obj[f.prop] === "number" && typeof f.base === "number" && f.obj[f.prop] > f.base) { f.obj[f.prop] = f.base; continue; }
      if (f.obj[f.prop] !== f.written) continue;
      if (f.own) f.obj[f.prop] = f.base; else delete f.obj[f.prop];
    }
    cheatRecs.delete(key);
  }
  function restoreAllCheats() {
    for (const key of [...cheatRecs.keys()]) restoreCheat(key);
    restoreXpWrap();
    restoreInvincible();
  }
  // 無敵：攔截玩家生命值的所有下降（不論傷害來源、不論是否經過遊戲的傷害函式）。
  // 做法是把 player.life 換成存取器：寫入較低的值一律忽略，只接受回血與提高。不改網址、不改遊戲旗標，遊戲不會因此標記本局。
  const lifeGuards = new WeakMap();
  function lifeGuard(p, on) {
    if (!p || typeof p !== "object") return false;
    const guard = lifeGuards.get(p);
    if (on) {
      if (guard) return true;
      try {
        if (typeof p.life !== "number") return false;
        const descriptor = Object.getOwnPropertyDescriptor(p, "life");
        const state = { value: p.life, descriptor };
        Object.defineProperty(p, "life", {
          configurable: true, enumerable: descriptor?.enumerable ?? true,
          get() { return state.value; },
          set(v) { if (typeof v === "number" && v < state.value) return; state.value = v; },
        });
        lifeGuards.set(p, state);
        return true;
      } catch { return false; }
    } else if (guard) {
      try {
        if (guard.descriptor) {
          const descriptor = { ...guard.descriptor };
          if ("value" in descriptor) descriptor.value = guard.value;
          Object.defineProperty(p, "life", descriptor);
        } else delete p.life;
        lifeGuards.delete(p);
      } catch { return false; }
    }
    return true;
  }
  let invinciblePlayer = null;
  function restoreInvincible() {
    if (invinciblePlayer && !lifeGuard(invinciblePlayer, false)) return;
    restoreCheat("invincibleDamageTaken");
    invinciblePlayer = null;
  }
  // 經驗值加成：包住遊戲的 gainXp，把獲得的經驗乘上固定倍率。只有自己包過的（xpWrap 記錄的 wrapped 仍是目前值）才會放回原函式；
  // 若其他程式之後又包裝過，目前值已不是自己的包裝，就不覆蓋它。
  let xpWrap = null;
  function restoreXpWrap() {
    if (!xpWrap) return;
    const { owner, orig, wrapped } = xpWrap;
    if (owner.gainXp === wrapped) owner.gainXp = orig;
    xpWrap = null;
  }
  function applyXpWrap(g) {
    const on = settings.cheat?.enabled && settings.cheat.maxXp;
    if (xpWrap && (xpWrap.owner !== g || g.gainXp !== xpWrap.wrapped)) xpWrap = null; // 新的一局或已被其他程式改寫：舊紀錄作廢，不覆蓋
    if (!on) { restoreXpWrap(); return; }
    if (xpWrap || typeof g.gainXp !== "function") return;
    const orig = g.gainXp;
    const wrapped = function (amount, ...rest) {
      const boost = settings.cheat?.enabled && settings.cheat.maxXp && Number.isFinite(amount) && amount > 0;
      return orig.call(this, boost ? amount * 1000 : amount, ...rest);
    };
    g.gainXp = wrapped;
    xpWrap = { owner: g, orig, wrapped };
  }
  // 遊戲修改：無敵、致命攻擊、一擊必殺、技能99等、怪物數量最大化、全精英、無限重抽、極限掉寶金幣
  // 召喚暗黑破壞神分身（作弊）：不必出售喬丹之石，直接在目前恐懼階呼叫遊戲原本的分身登場函式。
  // 不寫入存檔的 soj 紀錄（遊戲的 cloneCame 只在 soj 存在時才記錄），擊殺後的毀滅之符掉落沿用遊戲原流程。
  function summonClone() {
    const g = game, w = g?.world;
    if (!settings.cheat?.enabled) return "請先開啟「遊戲修改總開關」";
    if (!g || g.state !== "playing" || !w?.player) return "需在進行中的本局才能召喚分身";
    if (!w.terror) return "需在恐懼階中才能召喚分身（請先開啟恐懼階）";
    if (w.clone?.met) return "本局已召喚過分身";
    if (w.boss && !w.boss.dead) return "場上已有首領，待首領死亡後再召喚";
    if (typeof g.director?.cloneComes !== "function") return "找不到遊戲的分身函式，遊戲版本可能不相容";
    w.clone = w.clone || {};
    try { g.director.cloneComes(w); } catch (err) { return "召喚失敗：" + (err?.message || err); }
    return "已召喚暗黑破壞神分身";
  }
  // 進入恐懼階時自動召喚：每個恐懼階的世界（world）只嘗試一次；等關卡與怪物建立一小段時間後才召喚。
  // world.time 是絕對時鐘（不是本局經過秒數），所以記下第一次看到這個關卡時的時間，再用差值判斷。
  const cloneAutoSince = new WeakMap();
  function autoSummonClone(g) {
    const w = g?.world;
    if (!w?.terror || g.state !== "playing" || !settings.cheat?.enabled || !settings.cheat.summonCloneOnTerror) return;
    if (!cloneAutoSince.has(w)) cloneAutoSince.set(w, w.time);
    const since = cloneAutoSince.get(w);
    if (since === "done" || !(w.time - since >= 1.5)) return;
    const result = summonClone();
    lastAction = result;
    // 場上仍有首領時先不算用掉機會，等首領死亡後下一次檢查再召喚；其他結果（成功、已召喚過、不相容）則結束本局的自動召喚。
    if (result === "場上已有首領，待首領死亡後再召喚") return;
    cloneAutoSince.set(w, "done");
  }
  // 關卡內持續召喚頭目：依序輪流召喚會掉落鑰匙、器官或精華的頭目；場上頭目死亡後間隔約 3 秒再召喚下一隻。
  // 名單：鑰匙（女伯爵、召喚師、尼拉塞克）、器官（墨菲斯托、迪亞布羅、巴爾）、精華（各恐懼階首領，即第一幕至第五幕首領）。
  // 第三欄為器官代碼：Uber 首領（Lilith、Duriel、Izual）死亡會掉落器官，依遊戲資料 Wt 的 organ 對應。
  const SUMMON_ALL_BOSSES = [
    ["corruptrogue3", "The Countess"], ["summoner", "The Summoner"], ["nihlathakboss", "Nihlathak"],
    ["andariel", "Andariel", null, true], ["duriel", "Duriel", null, true], ["mephisto", "Mephisto", null, true], ["clone", "分身"], ["baalcrab", "Baal", null, true],
    ["uberandariel", "Lilith", "dhn"], ["uberduriel", "Duriel", "bey"], ["uberizual", "Izual", "mbr"],
    ["ubermephisto", "Mephisto", "mbr"], ["uberdiablo", "Diablo", "dhn"], ["uberbaal", "Baal", "bey"],
  ];
  // 遊戲的 Uber 首領以 actBoss 階級生成，死亡時掉器官；但 actBoss 死亡會觸發 actCleared（結束關卡）。
  // 這裡記下已召喚且死亡的 Uber 首領，攔截其對應的一次 actCleared，讓關卡繼續輪序；器官仍會正常掉落。
  // 依關卡世界（world）分開記錄，避免上一局殘留的已死亡 Uber 首領攔截下一局的 actCleared。
  const uberPendingBy = new WeakMap();
  // 診斷用計數（唯讀，供實機測試檢查攔截是否生效）。
  const uberGuardStats = { tracked: 0, actClearedSeen: 0, suppressed: 0, lastPending: null };
  window.__d2uberGuard = uberGuardStats;
  const pendingOf = (w) => { let list = uberPendingBy.get(w); if (!list) { list = []; uberPendingBy.set(w, list); } return list; };
  const guardedEvents = new WeakSet();
  function guardActCleared(w) {
    const events = w?.events;
    if (!Array.isArray(events) || guardedEvents.has(events)) return;
    guardedEvents.add(events);
    const pending = pendingOf(w);
    const push = events.push;
    events.push = function (...items) {
      const kept = items.filter((item) => {
        if (item?.type !== "actCleared") return true;
        uberGuardStats.actClearedSeen++;
        uberGuardStats.lastPending = pending.map((m) => ({ name: m.name, rank: m.rank, dead: !!m.dead }));
        // 召喚輪序開啟時，關卡不因任何 actCleared 結束（清場會開啟傳送門並進入下一層）；由玩家關閉「持續召喚頭目」後才恢復原版流程。
        if (settings.cheat?.summonAllBosses && settings.cheat?.enabled) { for (let k = pending.length - 1; k >= 0; k--) if (pending[k].dead) pending.splice(k, 1); uberGuardStats.suppressed++; return false; }
        const i = pending.findIndex((m) => m.dead);
        if (i < 0) return true;
        pending.splice(i, 1);
        uberGuardStats.suppressed++;
        return false;
      });
      return push.apply(this, kept);
    };
  }
  const bossLoopSince = new WeakMap();
  function summonAllBosses(g) {
    const w = g?.world;
    if (!settings.cheat?.summonAllBosses || g.state !== "playing" || !w?.player) return;
    guardActCleared(w);
    if (w.boss && !w.boss.dead && w.boss.life > 0) return;
    if (typeof g.director?.boss !== "function") { lastAction = "找不到遊戲的頭目召喚函式，遊戲版本可能不相容"; return; }
    const st = bossLoopSince.get(w) ?? { i: 0, next: 0 };
    bossLoopSince.set(w, st);
    if (w.time < st.next) return;
    const [monster, name, organ, actBossEntry] = SUMMON_ALL_BOSSES[st.i % SUMMON_ALL_BOSSES.length];
    st.i++;
    st.next = w.time + 3;
    // 分身（喬丹之石）：遊戲的 cloneComes 每局只能召喚一次，分身為當前幕的首領（第四幕為迪亞布羅）；已召喚過就略過。
    if (monster === "clone") {
      if (w.clone?.met) return;
      if (typeof g.director?.cloneComes !== "function") { lastAction = "找不到遊戲的分身函式，遊戲版本可能不相容"; return; }
      w.clone = w.clone || {};
      try { g.director.cloneComes(w); lastAction = "持續召喚頭目：分身"; } catch (err) { lastAction = "召喚分身失敗：" + (err?.message || err); }
      return;
    }
    // 遊戲的正式超級頭目會在生成時帶入鑰匙（key）；直接呼叫 director.boss 不會帶入，因此這裡補上對應的鑰匙代碼，否則不會掉落鑰匙。
    const SUMMON_KEYS = { corruptrogue3: "pk1", summoner: "pk2", nihlathakboss: "pk3" };
    try {
      const boss = g.director.boss(w, monster, name, []);
      if (SUMMON_KEYS[monster]) boss.key = SUMMON_KEYS[monster];
      // 恐懼階中，幕首領以 actBoss 生成才會掉精華（遊戲 actBoss 死亡分支）；Uber 首領另掉器官。一般階段維持 boss，避免多餘掉落。
      if (organ || (actBossEntry && w.terror)) { boss.rank = "actBoss"; if (organ) boss.organ = organ; pendingOf(w).push(boss); uberGuardStats.tracked++; }
      lastAction = "持續召喚頭目：" + name;
    } catch (err) { lastAction = "召喚頭目失敗：" + (err?.message || err); }
  }
  function applyCheats(g) {
    if (!g || !settings.cheat?.enabled) { restoreGoldRate(); restoreAllSkills(); restoreAllCheats(); return; }
    // 補充背包中的精華（恐怖燃燒精華、拉蘇克精華）；關閉後保留已寫入的物品。
    // 遊戲的精華格式：type 為 "essence"、base 為名稱，數量存在 count（單疊上限 99）。
    const essenceCheats = [["forgeMax", "Burning Essence of Terror"], ["larzukMax", "Larzuk's Essence"]];
    for (const [key, name] of essenceCheats) {
      if (!settings.cheat[key]) continue;
      const cls = g.kit?.id, inv = cls && g.save?.inventoryByClass?.[cls];
      if (!Array.isArray(inv)) continue;
      const stacks = inv.filter((item) => item?.type === "essence" && item.base === name);
      if (stacks.length) {
        stacks[0].count = 99;
        for (const extra of stacks.slice(1)) inv.splice(inv.indexOf(extra), 1);
      } else {
        inv.push({ id: Math.random().toString(36).slice(2, 10) + Date.now().toString(36), base: name, type: "essence", rarity: "normal", name, level: 1, mods: [], count: 99 });
      }
    }
    // 關卡時間暫停：遊戲以 time - actStart 計算本關經過時間；每幀把 actStart 對齊 time，經過時間永遠是 0，玩家可一直刷怪。
    // 關閉後不需還原，時間從當下重新計算。
    if (settings.cheat.pauseStageTime && g.world && Number.isFinite(g.world.time) && Number.isFinite(g.world.actStart)) g.world.actStart = g.world.time;
    summonAllBosses(g);
    const currentGold = (Number.isFinite(g.save?.gold) ? g.save.gold : 0) + (Number.isFinite(g.world?.gold) ? g.world.gold : 0);
    if (settings.cheat.maxGoldRate && currentGold >= 9000000000) {
      settings.cheat.maxGoldRate = false;
      save(true);
      refreshControls();
      lastAction = "玩家金幣達到 90 億，已自動關閉金幣掉落修改保護存檔";
    }
    if (!settings.cheat.maxGoldRate || goldOverride && goldOverride.player !== g.world?.player) restoreGoldRate();

    // 1. 無敵：攔截所有生命值下降（見 lifeGuard）；關閉時還原為一般數值。
    const p0 = g.world?.player;
    if (invinciblePlayer && (invinciblePlayer !== p0 || !settings.cheat.invincible)) restoreInvincible();
    if (settings.cheat.invincible) {
      const p = p0;
      if (p) {
        if ((!invinciblePlayer || invinciblePlayer === p) && lifeGuard(p, true)) {
          invinciblePlayer = p;
          if (p.maxLife > 0 && p.life < p.maxLife) p.life = p.maxLife;
          cheatField("invincibleDamageTaken", p, p, "damageTaken", 0);
        }
      }
      if (g.world?.shield && g.world.shield.max > 0) g.world.shield.mana = g.world.shield.max;
      if (g.world?.mana && g.world.mana.max > 0) g.world.mana.mana = g.world.mana.max;
    }

    const p = g.world?.player;
    if (!p) {
      for (const key of ["maxCrit", "oneHitKill", "maxDropRate"]) if (!settings.cheat[key]) restoreCheat(key);
    }
    if (p) {
      // 2. 致命攻擊（機率最高）
      if (settings.cheat.maxCrit) {
        cheatField("maxCrit", p, p, "criticalStrike", 100);
        cheatField("maxCrit", p, p, "deadlyStrike", 100);
        const pl = (p.passiveLevels ??= {});
        cheatField("maxCrit", p, pl, "criticalStrike", Math.max(pl.criticalStrike || 0, 99));
      } else restoreCheat("maxCrit");

      // 3. 一擊必殺（所有屬性傷害一百倍）
      if (settings.cheat.oneHitKill) {
        cheatField("oneHitKill", p, p, "might", Math.max(p.might || 1, 100));
        cheatField("oneHitKill", p, p, "weaponDamage", Math.max(p.weaponDamage || 1, 100));
        if (p.mastery && typeof p.mastery === "object") {
          for (const k of ["physical", "fire", "cold", "lightning", "poison", "magic"]) {
            cheatField("oneHitKill", p, p.mastery, k, Math.max(p.mastery[k] || 1, 100));
          }
        }
        for (const k of ["damageMult", "physicalDamageMult", "fireDamageMult", "lightningDamageMult", "coldDamageMult", "poisonDamageMult", "magicDamageMult", "elementalDamageMult"]) {
          cheatField("oneHitKill", p, p, k, 100);
        }
      } else restoreCheat("oneHitKill");

      // 掉寶與金幣倍率
      if (settings.cheat.maxGoldRate) {
        if (!goldOverride || p.goldGain !== 999999) goldOverride = { player: p, value: p.goldGain, own: Object.hasOwn(p, "goldGain") };
        p.goldGain = 999999;
      }
      if (settings.cheat.maxDropRate) {
        cheatField("maxDropRate", p, p, "magicFind", 999999);
        cheatField("maxDropRate", p, p, "uniqueBoost", 9999);
        cheatField("maxDropRate", p, p, "rareBoost", 9999);
        cheatField("maxDropRate", p, p, "setBoost", 9999);
      } else restoreCheat("maxDropRate");
    }

    // 4. 技能加成：不改技能等級，只提高角色「+所有技能」屬性（裝備加總值 player.allSkills），關閉時還原
    {
      const p = g.world?.player;
      if (settings.cheat.maxSkills && p && typeof p.allSkills === "number") {
        // 遊戲以差額增減 allSkills（換裝先減舊再加新），所以只加一次 +20，關閉時減回。
        if (allSkillsOverride && allSkillsOverride.player !== p) allSkillsOverride = null; // 新的一局：舊物件已作廢
        if (!allSkillsOverride) { p.allSkills += ALL_SKILLS_BONUS; allSkillsOverride = { player: p, added: ALL_SKILLS_BONUS }; }
      } else restoreAllSkills();
    }

    // 5. 怪物數量最大化
    // 導演的生成計數器（batchTimer／owed／waveDue）會被遊戲每幀自行消耗，還原時只在仍等於本模組寫入值時才還原；world 的密度欄位則完整還原。
    if (settings.cheat.maxMonsterDensity || settings.cheat.monsterDensity10x) {
      if (g.director && typeof g.director === "object") {
        const dir = g.director;
        cheatField("maxMonsterDensityDirector", dir, dir, "batchTimer", 0);
        cheatField("maxMonsterDensityDirector", dir, dir, "owed", Math.max(dir.owed || 0, 450));
        if (dir.waves && !dir.waves.done) {
          cheatField("maxMonsterDensityDirector", dir, dir, "waveDue", Math.max(dir.waveDue || 0, 450));
        }
      }
      if (g.world) {
        cheatField("maxMonsterDensity", g.world, g.world, "monsterDensity", 999);
        cheatField("maxMonsterDensity", g.world, g.world, "spawnRate", 999);
      }
      if (!g.director && Array.isArray(g.world?.enemies) && g.world.enemies.length > 0 && g.world.enemies.length < 450) {
        if (!g.world._cheatClonedCount) g.world._cheatClonedCount = 0;
        if (g.world.enemies.length - g.world._cheatClonedCount < 100) {
          const baseEnemies = g.world.enemies.filter(e => e && !e._cheatClone && !e.sprite && e.rank !== "breakable" && (e.life || 0) > 0);
          const copiesToAdd = [];
          for (const orig of baseEnemies) {
            for (let c = 0; c < 9 && g.world.enemies.length + copiesToAdd.length < 450; c++) {
              const clone = Object.assign(Object.create(Object.getPrototypeOf(orig)), orig);
              clone._cheatClone = true;
              clone.x = (orig.x || 0) + (Math.random() - 0.5) * 80;
              clone.y = (orig.y || 0) + (Math.random() - 0.5) * 80;
              copiesToAdd.push(clone);
            }
          }
          if (copiesToAdd.length > 0) {
            g.world._cheatClonedCount = (g.world._cheatClonedCount || 0) + copiesToAdd.length;
            g.world.enemies.push(...copiesToAdd);
          }
        }
      }
    } else {
      restoreCheat("maxMonsterDensity");
      restoreCheat("maxMonsterDensityDirector");
    }

    // 6. 一般怪物全部變成精英以上等級：直接改寫現有怪物的等級與倍率，沒有全域設定可還原；關閉後已生成的怪維持精英等級（不還原），只是之後不再套用。
    if (settings.cheat.allElites) {
      if (Array.isArray(g.world?.enemies)) {
        for (const e of g.world.enemies) {
          if (e && e.rank === "normal") {
            e.rank = "champion";
            e.elite = true;
            if (!Array.isArray(e.mods)) e.mods = [];
            if (e.maxLife) e.maxLife *= 2.5;
            if (e.life) e.life *= 2.5;
            if (e.speed) e.speed *= 1.2;
          }
        }
      }
    }

    // 經驗值加成最大：包住遊戲的 gainXp（開啟時才包裝，關閉時放回原函式）
    applyXpWrap(g);

    // 7. 選技能重抽無限次數 (Infinite Rerolls)
    if (settings.cheat.enabled && settings.cheat.infiniteRerolls) {
      // 存檔載入時戰局的重抽／跳過／排除次數上限為 99，超過會被判定無法讀取（A saved run could not be read）；不可寫 9999。
      if (g.build) {
        g.build.rerolls = 99;
        g.build.skips = 99;
        g.build.banishes = 99;
      }
      if (g.save?.ranks) {
        g.save.ranks.rerolls = Math.max(g.save.ranks.rerolls || 0, 999);
      }
      if (g.state === "levelUp") {
        const rerollBtn = document.getElementById("reroll") || document.querySelector("#level-up .reroll, button[data-action='reroll']");
        if (rerollBtn && rerollBtn.disabled) {
          rerollBtn.disabled = false;
        }
      }
    }
  }
  // 原版選卡畫面可能讓遊戲迴圈完全停住，恢復邏輯也須從獨立計時器執行。
  function recoverOrphanLevelUp(g) {
    if (settings.progressEnabled && panel.hidden && visible(document.getElementById("level-up")) && ["playing", "camp", "town"].includes(g?.state) && !document.body.classList.contains("frontend-open") && !window.__d2editIsOpen?.() && typeof g.hud?.closeLevelUp === "function") {
      g.hud.closeLevelUp(); lastAction = "關閉已完成選卡的殘留畫面";
    }
  }
  // 原版 Pixi ticker 在圖形異常後可能仍顯示 started，但 requestAnimationFrame 不再回呼；只重排原有計時器，不推進或改寫遊戲狀態。
  let tickerRetryAt = -Infinity;
  function recoverStalledTicker(g, now) {
    const ticker = g?.app?.ticker, gl = g?.app?.renderer?.gl;
    if (!gameplayCompatible || !settings.progressEnabled || !panel.hidden || document.hidden || g?.state !== "playing" || visible(document.getElementById("level-up")) || document.body.classList.contains("frontend-open") || window.__d2editIsOpen?.() || !ticker?.started || typeof ticker.stop !== "function" || typeof ticker.start !== "function" || !finite(ticker.lastTime) || now - ticker.lastTime < 15000 || now - tickerRetryAt < 60000 || typeof gl?.isContextLost !== "function" || gl.isContextLost()) return;
    tickerRetryAt = now; ticker.stop(); ticker.start(); lastAction = "恢復停滯的畫面計時器";
  }
  function step(g, now) {
    applyCheats(g);
    autoSummonClone(g);
    checkRetreat(now);
    recoverOrphanLevelUp(g);
    const levelUpVisible = visible(document.getElementById("level-up"));
    if (!levelUpVisible) { levelRerollCount = 0; cardActionAt = -Infinity; levelCards = levelHandlers = levelOfferKind = null; }
    // 依使用者要求：自動戰鬥開著時每次升級一定要選卡（不受手動讓位影響；設定面板開著時除外）；只開戰鬥輔助時選卡交給玩家。
    if (settings.progressEnabled && panel.hidden && levelUpVisible && g?.state === "levelUp" && !document.body.classList.contains("frontend-open") && now - cardActionAt >= 100) {
      const cards = [...document.querySelectorAll("#choices button")].filter(visible);
      if (cards.length) {
        const choice = pickCard(g, cards);
        if (shouldReroll(g, choice)) {
          triggerReroll(now);
          release();
          return;
        }
        const i = choice.best;
        const picked = triggerCardPick(i);
        lastAction = picked === "picked" ? "已選擇升級卡 " + (i + 1) : picked === "sent" ? "已送出升級卡按鍵 " + (i + 1) : "無法確認選卡鍵位，請手動選卡";
        cardActionAt = now;
        release();
        return;
      }
    }
    if (retreat || blocked()) { release(); return; }
    if (g) { hookBuild(g); autoEquip(g, now); useCodex(g, now); leaveLowNormal(g, now); leaveForScroll(g, now); if (g.state === "playing") autoStats(g, now); }
    if (g && progression(g, now)) { release(); return; }
    if (g && g.state !== "playing") {
      release();
      // 重複刷模式：打完巴爾不往下一難度，結束本局回營地再開同難度。
      // 地獄通關後沒有更高難度，一律當作重複刷地獄：結束本局回營地再開地獄。
      // 依使用者要求：任何難度打完巴爾都先回營地整備（賣裝、補藥水、恰西升級），再由 campStart 開最高難度。
      // 只限一般難度推進；恐懼層數（world.terror）維持原本流程，之後另外測試。
      if (questOn() && g.state === "dead" && g.afterBaal && !g.world?.terror && typeof g.endAfterBaal === "function" && now - actionAt > 1500) {
        if (g.difficulty === "hell") { hellClears++; if (g.save && g.kit?.id) { let classes = hellClearedSaves.get(g.save); if (!classes) hellClearedSaves.set(g.save, classes = new Set()); classes.add(g.kit.id); } }
        if (runStart) { runStart.complete = true; noteRunEnd(g, now); }
        g.endAfterBaal(); actionAt = now; lastAction = g.difficulty === "hell" ? "地獄通關（第 " + hellClears + " 次），回營地重複刷地獄" : "擊敗巴爾（" + g.difficulty + "），回營地整備"; return;
      }
      if (questOn() && g.state === "dead" && g.afterBaal?.next && typeof g.afterBaal.continue === "function" && now - actionAt > 1500) {
        // 原版打倒巴爾後直接接下一難度（不回營地）：當下判定本難度，再為下一難度記錄開局等級。
        if (runStart) { runStart.complete = true; noteRunEnd(g, now); }
        const nextDiff = { normal: "nightmare", nightmare: "hell" }[g.difficulty];
        if (nextDiff) runStart = { diff: nextDiff, lv: g.world?.player?.level, at: now };
        g.afterBaal.continue(); actionAt = now; return;
      }
      // 一般難度陣亡或結束：沿用原版結算畫面的「回主選單」（營地模式下回營地），再由 campStart 續玩。
      if (questOn() && settings.quest.autoStart && g.state === "dead" && g.runOver && !g.world?.terror && !g.afterBaal?.next && typeof g.toMenu === "function" && (g.deathTime ?? 3) >= 3 && now - actionAt > 1500) {
        const died = !(g.world?.player?.life > 0) && !g.won;
        if (runStart && g.won) { runStart.complete = true; noteRunEnd(g, now); }
        failStreak[g.difficulty] = died ? (failStreak[g.difficulty] || 0) + 1 : 0;
        actionAt = now; lastAction = died ? "陣亡，返回營地整備" : "本局通關，返回營地"; fire(g.toMenu(), "返回選單"); return;
      }
      return;
    }
    if (!g && (document.body.classList.contains("no-run") || document.body.classList.contains("frontend-open") || ["level-up", "game-over", "town", "character", "waypoint"].some((id) => visible(document.getElementById(id))))) return;
    const state = readState(g);
    if (!state.hp || state.hp.now <= 0) { release(); return; }
    let danger = threats(state);
    let reason = g && deathReason(state, danger, now);
    if (reason) { fire(returnToSafety(g, state, reason, now), "安全離場"); return; }
    const prevHp = state.hp.now;
    const healingFailed = assistOn() ? potions(state, danger, now) : false;
    // 只有喝水成功（血量變動）或喝水失敗時才需重新讀取生命與威脅，省下一般幀重複過濾實體與計算。
    const drank = (g?.world?.player ? g.world.player.life : state.hp.now) !== prevHp;
    const after = drank || healingFailed ? readState(g) : state;
    if (drank) danger = threats(after);
    if (drank || healingFailed) {
      reason = g && deathReason(after, danger, now, healingFailed);
      if (reason) { fire(returnToSafety(g, after, reason, now), "安全離場"); return; }
    }
    if (g && state.p) { if (g.hud?.skillsOpen || g.hud?.questLogOpen) release(); else navigate(after, danger, now); }
  }
  function guarded(g, now) {
    if (!alive || !gameplayCompatible || !g || now - lastStep < 50) return;
    lastStep = now;
    try { step(g, now); errors = 0; }
    catch (err) { release(); if (++errors >= 3) stop("連續執行錯誤，已停機：" + String(err.message || err)); }
  }
  function wrap(object, name, factory) {
    const original = object[name], wrapped = factory(original); object[name] = wrapped;
    restores.push(() => { if (object[name] === wrapped) object[name] = original; });
  }
  async function connect() {
    const base = new URL("/assets/", location.origin);
    const urls = [...performance.getEntriesByType("resource").map((e) => e.name), ...document.querySelectorAll("script[src],link[rel=modulepreload]")].map((e) => typeof e === "string" ? e : e.src || e.href);
    const queue = urls.filter((u) => u?.startsWith(base.href) && /\/(?:Game|game)-[\w-]+\.js(?:\?.*)?$/.test(u)).sort((a, b) => Number(/\/Game-/.test(b)) - Number(/\/Game-/.test(a))), seen = new Set();
    // 正規式定位壓縮後的類別，不依賴固定雜湊檔名或壓縮變數名。
    const signatures = [/export\s*\{[^}]*\b[\w$]+\s+as\s+Game\b[^}]*\}/, /tick\(\w+\)\{if\(!this\.world\)return;/, /drinkFrom\(\w+\)\{let\s+\w+=this\.world\?\.belt/, /player:\w+,enemies:\[\],projectiles:\[\]/];
    while (queue.length && seen.size < 12 && alive) {
      const url = queue.shift(); if (seen.has(url)) continue; seen.add(url);
      const response = await fetch(url, { signal: abort.signal }); if (!response.ok) continue;
      const source = await response.text();
      if (!signatures.every((re) => re.test(source))) { for (const m of source.matchAll(/["'`]\.\/(Game-[\w-]+\.js)["'`]/g)) queue.push(new URL(m[1], url).href); continue; }
      // 精確沿用頁面模組 URL，讓瀏覽器回傳原模組實例；不加查詢字串、不執行修改版副本。
      const module = await import(url); if (!alive) return;
      fire(loadSkillTables(url, source), "技能表");
      const proto = module.Game?.prototype;
      if (typeof proto?.tick !== "function" || typeof proto.drinkFrom !== "function" || typeof proto.steer !== "function") continue;
      // 遊戲的波次邏輯會在 tick 中以擊殺數改寫 actStart（world.actStart = time - ps(…)），所以時間暫停也要在原版 tick 結束後再對齊一次，否則在恐懼階會失效。
      wrap(proto, "tick", (original) => function (...args) { if (alive) { game = this; guarded(this, performance.now()); } const out = Reflect.apply(original, this, args); if (alive && settings.cheat?.enabled && settings.cheat.pauseStageTime && this.world && Number.isFinite(this.world.time) && Number.isFinite(this.world.actStart)) this.world.actStart = this.world.time; return out; });
      // 原版 steer 會為拾取目標重建 walkTarget，記住該參照才能在停止時完全放手。
      wrap(proto, "steer", (original) => function (...args) { const result = Reflect.apply(original, this, args); if (alive && this === game && ownReach && this.world?.reaching === ownReach) ownWalk = this.walkTarget; return result; });
      gameplayCompatible = true; hookUrl = url; hookNote = "已掛接原版 Game，等待下一幀"; fire(checkGameVersion(url), "版本檢查"); return;
    }
    hookNote = "找不到可掛接的遊戲程式，請重新開啟遊戲";
    fire(checkGameVersion(""), "版本檢查");
  }
  let versionNotice = "", versionDismissed = false, checkedGameBuild = false;
  function parseBuild(s) { return String(s || "").trim().split(".").map((n) => Number(n) || 0); }
  function isBuildNewer(latest, tested) {
    const p1 = parseBuild(latest), p2 = parseBuild(tested);
    for (let i = 0; i < Math.max(p1.length, p2.length); i++) {
      const v1 = p1[i] || 0, v2 = p2[i] || 0;
      if (v1 !== v2) return v1 > v2;
    }
    return false;
  }
  function findGameScript(fallbackUrl) {
    try {
      if (fallbackUrl) { const m = String(fallbackUrl).match(/\/(Game-[\w-]+\.js)(?:\?.*)?$/i); if (m) return m[1]; }
      for (const e of performance?.getEntriesByType?.("resource") || []) {
        const m = String(e.name || "").match(/\/(Game-[\w-]+\.js)(?:\?.*)?$/i); if (m) return m[1];
      }
      for (const s of document.querySelectorAll("script[src],link[rel=modulepreload]")) {
        const m = String(s.src || s.href || "").match(/\/(Game-[\w-]+\.js)(?:\?.*)?$/i); if (m) return m[1];
      }
    } catch {}
    return "";
  }
  async function checkGameVersion(currentUrl) {
    if (checkedGameBuild) return;
    checkedGameBuild = true;
    try {
      const gameJs = findGameScript(currentUrl);
      let prev = null;
      try { prev = JSON.parse(localStorage.getItem(BUILD_KEY) || "null"); } catch {}
      const prevJs = prev?.gameJs || "";
      const gameChanged = !!(gameJs && prevJs && gameJs !== prevJs);
      let latestBuild = "", latestDate = "";
      const ctrl = new AbortController(), tid = setTimeout(() => ctrl.abort(), 5000);
      try {
        let list = window.__d2changelogPromise ? await window.__d2changelogPromise : null;
        if (!list) {
          const res = await fetch("/changelog.json", { signal: ctrl.signal, cache: "no-cache" }).catch(() => fetch("https://d2survivors.lol/changelog.json", { signal: ctrl.signal, cache: "no-cache" }));
          if (res && res.ok) list = await res.json();
        }
        const first = Array.isArray(list) ? list[0] : null;
        if (first?.build) { latestBuild = String(first.build); latestDate = String(first.date || ""); }
      } catch {} finally { clearTimeout(tid); }
      const compareBuild = latestBuild || prev?.build || "";
      const compareDate = latestDate || prev?.date || "";
      const isNewer = compareBuild ? isBuildNewer(compareBuild, TESTED_GAME_BUILD) : false;
      if (isNewer) {
        versionNotice = `遊戲已更新到 ${compareBuild}${compareDate ? `（${compareDate}）` : ""}，輔助器只驗證到 ${TESTED_GAME_BUILD}，請更新輔助器；部分功能可能失效${gameChanged ? "；遊戲程式已變更" : ""}`;
      } else if (gameChanged) {
        versionNotice = `遊戲程式已變更，輔助器只驗證到 ${TESTED_GAME_BUILD}，請更新輔助器；部分功能可能失效`;
      }
      try {
        const record = {
          build: latestBuild || prev?.build || "",
          date: latestDate || prev?.date || "",
          gameJs: gameJs || prevJs || "",
          tested: TESTED_GAME_BUILD,
          updatedAt: new Date().toISOString()
        };
        localStorage.setItem(BUILD_KEY, JSON.stringify(record));
      } catch {}
      refreshVersionNotice();
    } catch {}
  }
  const launcher = document.createElement("button"), stopButton = document.createElement("button"), host = document.createElement("div");
  launcher.type = stopButton.type = "button"; launcher.id = "d2autobot-launcher"; launcher.textContent = "輔助";
  launcher.style.cssText = "position:fixed;top:max(12px,env(safe-area-inset-top));left:max(12px,env(safe-area-inset-left));z-index:2147483645;display:none;padding:8px 14px;min-height:44px;border:1px solid #d4a84a;border-radius:6px;background:rgba(20,17,13,.95);color:#d4a84a;font:bold 15px system-ui;cursor:pointer;touch-action:manipulation";
  stopButton.textContent = "停止自動戰鬥";
  // 狀態列顯示輔助器目前在做什麼。
  const statusLine = document.createElement("div");
  statusLine.id = "d2autobot-status";
  // 位置：畫面底部、技能列上方；避開頂部選單與中央的儲物箱／物品欄面板。
  statusLine.style.cssText = "position:fixed;bottom:calc(max(8px,env(safe-area-inset-bottom)) + 16dvh + 52px);left:50%;transform:translateX(-50%);z-index:2147483645;max-width:min(80vw,300px);background:rgba(0,0,0,.75);color:#f0d9a0;border-radius:4px;padding:3px 10px;font:13px sans-serif;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;pointer-events:none;display:none";
  // 位置：畫面底部、技能列上方；只在戰鬥中顯示，開啟角色／物品欄、商店等遊戲視窗時隱藏（見計時器）。
  stopButton.style.cssText = "position:fixed;bottom:calc(max(8px,env(safe-area-inset-bottom)) + 16dvh);left:50%;transform:translateX(-50%);z-index:2147483645;min-height:44px;background:#531b15;color:#fff;border:1px solid #d4a84a;border-radius:6px;padding:6px 14px;display:none;touch-action:manipulation";
  host.id = "d2autobot-panel"; host.style.cssText = "position:fixed;inset:0;z-index:2147483647;pointer-events:none";
  const root = host.attachShadow({ mode: "open" });
  root.innerHTML = `<style>
    :host{font:15px/1.5 'Microsoft JhengHei',system-ui,sans-serif;color:#f2e5c6;-webkit-text-size-adjust:100%}*{box-sizing:border-box}[hidden]{display:none!important}
    .backdrop{position:fixed;inset:0;background:#000a;display:grid;place-items:center;pointer-events:auto;padding:12px;overscroll-behavior:contain}
    .box{width:min(760px,100%);max-height:88vh;max-height:88dvh;overflow:auto;-webkit-overflow-scrolling:touch;overscroll-behavior:contain;background:#18140f;border:1px solid #d4a84a;border-radius:10px;padding:20px;color:#f2e5c6}
    h2{margin:0;color:#d4a84a;font-size:18px}h3{color:#d4a84a;margin:18px 0 6px;font-size:15px}p{margin:8px 0}.head{display:flex;justify-content:space-between;align-items:center;gap:12px;position:sticky;top:0;z-index:2;background:#18140f;padding-bottom:8px;border-bottom:1px solid #fff1}
    label{display:flex;align-items:center;justify-content:space-between;gap:10px;min-height:44px;border-bottom:1px solid #fff1;padding:6px 0}
    label>span{flex:1;min-width:0;overflow-wrap:anywhere}
    button,input,select{font:inherit;min-height:44px;touch-action:manipulation}button,select,input[type=number]{background:#2a231a;color:#fff0cb;border:1px solid #9c7e41;border-radius:5px;padding:5px 10px;max-width:100%}
    select{max-width:58%}
    .toggle{min-width:104px;flex-shrink:0;font-weight:bold;display:inline-flex;align-items:center;justify-content:center;gap:8px}.toggle::before{content:"";width:14px;height:14px;border-radius:50%;background:#b0a49c;flex-shrink:0}.toggle[aria-checked=true]{background:#245436;border-color:#7bd89a;color:#effff3}.toggle[aria-checked=true]::before{background:#8affaf}.toggle[aria-checked=false]{background:#452b29;border-color:#b99188;color:#ffe9e4}.toggle:focus-visible{outline:3px solid #f8d87d;outline-offset:3px}input[type=number]{width:104px;flex-shrink:0}button{cursor:pointer}.tabs{display:flex;gap:8px;margin:12px 0 0;border-bottom:1px solid #9c7e41}.tabs button{flex:1;border-radius:5px 5px 0 0;border-bottom:0}.tabs button[aria-selected=true]{background:#d4a84a;color:#18140f;font-weight:bold}.note{font-size:13px;color:#cabd9d}.status{white-space:pre-line;padding:10px;background:#0005;border-radius:5px;font-size:13px;overflow-wrap:anywhere}.version-warn[hidden]{display:none!important}.version-warn{display:flex;align-items:center;justify-content:space-between;gap:10px;background:#451a14;border:1px solid #d45d48;color:#ffded7;border-radius:6px;padding:8px 12px;margin:10px 0 4px;font-size:13px;font-weight:bold}.version-warn button{min-height:28px;padding:2px 8px;background:transparent;border:none;color:#ffded7;font-size:18px;cursor:pointer;line-height:1}.version-warn button:hover{color:#fff}
    @media(max-width:600px){.backdrop{padding:0}.box{width:100%;max-height:100vh;max-height:100dvh;height:100vh;height:100dvh;border-radius:0;border:0;padding:12px;padding-top:max(12px,env(safe-area-inset-top));padding-bottom:max(16px,env(safe-area-inset-bottom));padding-left:max(12px,env(safe-area-inset-left));padding-right:max(12px,env(safe-area-inset-right))}input,select{font-size:16px}label{flex-wrap:wrap}select{max-width:100%;width:100%}}
    @media(max-height:500px){.backdrop{padding:0}.box{width:100%;max-height:100vh;max-height:100dvh;height:100vh;height:100dvh;border-radius:0;border:0;padding:10px max(14px,env(safe-area-inset-right)) max(10px,env(safe-area-inset-bottom)) max(14px,env(safe-area-inset-left))}h3{margin:12px 0 4px}label{min-height:38px;padding:4px 0}}
  </style><div class="backdrop" hidden><section class="box" role="dialog" aria-modal="true" aria-label="遊戲輔助設定"><div class="head"><h2>遊戲輔助工具</h2><button type="button" id="close">關閉</button></div><div id="version-warn" class="version-warn" hidden><span class="version-msg"></span><button type="button" class="version-dismiss" aria-label="關閉提示">×</button></div><p class="status" role="status"></p><div class="tabs" role="tablist"><button type="button" role="tab" data-tab="assist" aria-selected="true">戰鬥輔助</button><button type="button" role="tab" data-tab="progress" aria-selected="false">自動戰鬥</button><button type="button" role="tab" data-tab="cheat" aria-selected="false">遊戲修改</button></div><div id="fields"><div data-pane="assist" role="tabpanel"></div><div data-pane="progress" role="tabpanel" hidden></div><div data-pane="cheat" role="tabpanel" hidden></div></div><p class="note">手動操作會暫讓控制權；背景分頁、設定面板、修改器及遊戲暫停時停止動作。總開關只能在此面板切換；戰鬥中可按「停止自動戰鬥」。</p><p class="note">死亡保護預設關閉；觸發時一律關閉推層、重刷與任務推進，須自行重新開啟。沿用原版離場結算，可能損失本局進度；無營地模式時可能回到角色選單。致命傷害與包圍判定為啟發式，不保證生存。任務輔助追蹤已生成的物品、石陣、牢籠、敵人與通關門；特定配點、營地交付及隱藏條件仍需手動處理。</p><p class="note">裝備依遊戲內建撿寶過濾器決定保留、隱藏或自動販售；請在遊戲設定調整。無法掛接時，僅在 HUD 可讀的情況下按指定藥帶鍵，不從 Canvas 猜測敵人位置。</p><button type="button" id="stop">立即停止輔助</button> <button type="button" id="stop-all">全部關閉</button><p class="note">全部關閉會關閉所有開關及全圖撿裝；已套用的部分遊戲修改可能持續至重新開始遊戲。</p></section></div>`;
  const panel = root.querySelector(".backdrop"), status = root.querySelector(".status"), controls = new Map();
  const versionWarn = root.querySelector("#version-warn"), versionMsg = root.querySelector(".version-msg"), versionDismiss = root.querySelector(".version-dismiss");
  function refreshVersionNotice() {
    if (!versionWarn) return;
    if (versionNotice && !versionDismissed) { versionMsg.textContent = versionNotice; versionWarn.hidden = false; }
    else versionWarn.hidden = true;
  }
  versionDismiss.onclick = () => { versionDismissed = true; versionWarn.hidden = true; };
  const panes = Object.fromEntries([...root.querySelectorAll("[data-pane]")].map((el) => [el.dataset.pane, el]));
  let fields = panes.assist;
  function tab(name) { fields = panes[name]; }
  function showTab(name) { for (const [k, el] of Object.entries(panes)) el.hidden = k !== name; for (const b of root.querySelectorAll("[data-tab]")) b.setAttribute("aria-selected", String(b.dataset.tab === name)); }
  for (const b of root.querySelectorAll("[data-tab]")) b.onclick = () => showTab(b.dataset.tab);
  function field(path, label, choices) {
    const row = document.createElement("label"), text = document.createElement("span"); text.textContent = trAuto(label);
    const toggle = !choices && typeof get(path) === "boolean";
    const input = document.createElement(toggle ? "button" : choices ? "select" : "input");
    input.dataset.setting = path; input.id = "setting-" + path.replaceAll(".", "-"); text.id = input.id + "-label";
    input.setAttribute("aria-labelledby", text.id); row.htmlFor = input.id;
    if (toggle) {
      input.type = "button"; input.className = "toggle"; input.setAttribute("role", "switch");
      input.addEventListener("click", () => { put(path, !get(path)); release(); save(true); });
    } else {
      if (choices) for (const [value, label] of choices) { const option = document.createElement("option"); option.value = value; option.textContent = trAuto(label); input.append(option); }
      else { input.type = "number"; const [min, max] = bounds[path]; input.min = min; input.max = max; input.step = path.endsWith("Sec") || path.endsWith("Factor") ? "0.1" : "1"; }
      input.addEventListener("change", () => { put(path, input.type === "number" ? Number(input.value) : input.value); release(); save(true); refreshControls(); });
    }
    row.append(text, input); fields.append(row); controls.set(path, input);
  }
  function group(label) { const h = document.createElement("h3"); h.textContent = trAuto(label); fields.append(h); groupEls[label] = h; }
  const groupEls = {};
  group("一般與安全"); field("enabled", "戰鬥輔助總開關");;
  group("生命與藥水");
  for (const [path, label] of [["autoHp", "自動喝生命藥水"], ["hpThreshold", "生命門檻（％）"], ["lethalProtection", "一擊必殺預判喝水"], ["lethalLookaheadSec", "預測提前秒數"], ["hpCooldownMs", "生命藥水冷卻（毫秒）"], ["fallbackHpSlot", "降級模式生命藥帶欄（1～4）"]]) field("potion." + path, label);
  group("走位與閃避");
  for (const [path, label] of [["enabled", "自動走位（預判包圍、保持距離、閃避）"], ["combatStyle", "戰鬥方式"], ["dodgeProjectiles", "閃避敵方飛彈"]]) field("movement." + path, label, path === "combatStyle" ? [["auto", "自動（依技能攻擊距離）"], ["melee", "近戰（貼身攻擊）"], ["ranged", "遠程（保持距離）"]] : undefined);
  group("撿寶"); field("loot.enabled", "自動撿寶"); field("loot.vacuumXp", "全圖吸經驗（地上經驗寶石自動飛來；非原版行為）"); field("loot.vacuumGold", "全圖吸金幣"); field("loot.vacuum", "全圖撿寶（撿取距離改為全圖，要撿哪些依遊戲過濾器）"); field("loot.kickJars", "踢地上罐子木桶（可能掉藥水）");
  field("loot.backtrackForLoot", "通關後等待撿裝");
  tab("progress"); field("progressEnabled", "自動戰鬥開關"); field("autoKind", "自動模式", [["quest", "任務模式（完成所有任務並練到 99 級，達成後自動改刷地獄）"], ["fixedDifficulty", "固定關卡模式（重複刷指定難度）"], ["ladder", "天梯模式"]]);
  field("ladderMode", "天梯方式", [["terror", "推關（恐怖層數往上推）"], ["fixedTier", "固定層數（重刷指定層，須已通關）"]]);
  field("quest.fixedDifficulty", "固定關卡難度", [["normal", "普通"], ["nightmare", "惡夢"], ["hell", "地獄"]]); field("terror.targetFarmTier", "固定層數");
  group("恐怖層數"); field("terror.postClearWaitSec", "通關等待（秒）"); field("terror.autoReviveOrRestart", "陣亡後重試（有保留角色時）");
  group("關卡進程"); field("quest.prioritizeBoss", "優先接近任務頭目"); field("quest.autoStart", "在營地自動開局／續玩（全新存檔可用）");
  group("排行榜學習"); field("build.ladder", "依排行榜高手配法選升級卡"); field("build.autoStats", "依高手比例自動配屬性點"); field("build.redraft", "技能配置和排行榜差太多時向阿卡拉付費重置技能（普通通關後可用，重置後立刻重新選卡）"); field("build.autoReroll", "自動重抽（升級候選卡評分偏低時自動使用重抽）");
  group("裝備"); field("gear.autoEquip", "自動穿上較佳裝備"); field("gear.minGainPercent", "替換門檻（約等於傷害提升％）");
  group("營地整備（每次回營地自動變強）"); field("town.enabled", "回營地自動整備"); field("town.collect", "暗金／套裝收進收藏庫"); field("town.stash", "較好的裝備存入倉庫"); field("town.sellJunk", "賣掉用不到的裝備"); field("town.buyPotions", "用金幣向阿卡拉買生命藥水"); field("town.charsiUpgrades", "用金幣升級恰西永久能力"); field("town.buyGear", "向商人買較佳裝備");
  tab("assist"); group("死亡保護"); field("deathProtection.enabled", "死亡保護（緊急離開本局）"); field("deathProtection.emergencyHpPercent", "緊急生命門檻（％）"); field("deathProtection.disableAutomation", "觸發後關閉兩頁總開關");
  tab("cheat");
  group("修改總控制");
  field("cheat.enabled", "遊戲修改總開關（主控所有修改項目）");
  group("戰鬥修改");
  field("cheat.invincible", "無敵（免疫所有傷害且鎖定滿血）");
  field("cheat.maxCrit", "致命攻擊（致命一擊機率最高）");
  field("cheat.oneHitKill", "一擊必殺（所有屬性傷害提升一百倍）");
  field("cheat.maxSkills", "所有技能 +20（提高裝備「+所有技能」屬性，不改技能等級）");
  group("怪物與環境修改");
  field("cheat.maxMonsterDensity", "怪物數量最大化（地圖怪物生成速度與數量拉滿）");
  field("cheat.allElites", "一般怪物全部變成精英以上等級（全圖小怪升階為金/藍怪）");
  group("流程與掉落修改");
  field("cheat.forgeMax", "恐怖燃燒精華數量 99（鍛造機率無法修改）");
  field("cheat.larzukMax", "拉蘇克精華數量 99（加入背包，可用來增加物品鑲孔）");
  field("cheat.pauseStageTime", "關卡時間暫停（本關計時不前進，可一直戰鬥刷怪）");
  field("cheat.summonAllBosses", "關卡內持續召喚頭目（輪流召喚鑰匙頭目、各幕首領與 Uber 首領 Lilith、Duriel、Izual；Uber 首領掉器官，恐懼階中鑰匙可掉落）");
  field("cheat.infiniteRerolls", "選技能的重抽無限次數（升級選卡無限重抽、跳過與排除）");
  field("cheat.maxDropRate", "掉寶率最高（大幅提升暗金/套裝/稀有尋寶率）");
  field("cheat.maxXp", "經驗值加成最大（擊殺與任務獲得的經驗值乘以 1000 倍，升級極快）");
  field("cheat.maxGoldRate", "金幣掉落率最高（偵測玩家金幣超過 90 億自動關閉）");
  group("首領召喚");
  field("cheat.summonCloneOnTerror", "進入恐懼階時自動召喚暗黑破壞神分身（無須出售喬丹之石）");
  // 依使用者要求：目前模式用不到的設定隱藏（欄位所在的 label 列與分組標題）。
  function applyModeVisibility() {
    const mode = autoMode(), kind = autoKind(), terror = mode === "terror" || mode === "fixedTier", quest = mode === "quest" || mode === "fixedDifficulty";
    const show = { ladderMode: kind === "ladder", "quest.fixedDifficulty": mode === "fixedDifficulty", "terror.targetFarmTier": mode === "fixedTier", "terror.postClearWaitSec": terror, "terror.autoReviveOrRestart": terror, "quest.prioritizeBoss": quest, "quest.autoStart": quest };
    for (const [path, on] of Object.entries(show)) { const row = controls.get(path)?.closest("label"); if (row) row.hidden = !on; }
    if (groupEls["恐怖層數"]) groupEls["恐怖層數"].hidden = !terror;
    if (groupEls["關卡進程"]) groupEls["關卡進程"].hidden = !quest;
  }
  function refreshControls() {
    applyModeVisibility();
    for (const [path, input] of controls) {
      if (input.getAttribute("role") === "switch") {
        input.setAttribute("aria-checked", String(get(path)));
        input.textContent = get(path) ? trAuto("開啟") : trAuto("關閉");
      } else {
        input.value = String(get(path));
      }
    }
  }
  function closePanel() { panel.hidden = true; if (launcher.style.display !== "none") launcher.focus(); }
  launcher.onclick = () => { if (!toolsMenuOpen()) return; release(); panel.hidden = false; versionDismissed = false; refreshVersionNotice(); refreshControls(); root.getElementById("close").focus(); };
  root.getElementById("close").onclick = closePanel; root.getElementById("stop").onclick = () => stop("已手動停止輔助", true);
  root.getElementById("stop-all").onclick = () => {
    const disable = (obj) => { for (const key of Object.keys(obj)) { if (typeof obj[key] === "boolean") obj[key] = false; else if (obj[key] && typeof obj[key] === "object") disable(obj[key]); } };
    disable(settings); settings.terror.mode = "off"; settings.quest.farmDifficulty = "off";
    restoreGoldRate(); restoreAllSkills(); restoreAllCheats(); stop("已全部關閉", true);
  };
  stopButton.onclick = () => { settings.progressEnabled = false; release(); lastAction = "已停止自動戰鬥"; save(true); };
  for (const el of [host, launcher, stopButton]) for (const name of ["pointerdown", "pointerup", "mousedown", "mouseup", "touchstart", "touchend", "keydown", "keyup", "click", "wheel"]) el.addEventListener(name, (e) => e.stopPropagation(), { signal: abort.signal });
  root.addEventListener("keydown", (e) => {
    if (e.code === "Escape") { e.preventDefault(); closePanel(); }
    if (e.key === "Tab") { const list = [...panel.querySelectorAll("button,input,select")], first = list[0], last = list.at(-1); if (e.shiftKey && root.activeElement === first) { e.preventDefault(); last.focus(); } else if (!e.shiftKey && root.activeElement === last) { e.preventDefault(); first.focus(); } }
  });
  document.body.append(launcher, stopButton, statusLine, host); save();
  window.addEventListener("keydown", (e) => {
    manual(e);
  }, { capture: true, signal: abort.signal });
  window.addEventListener("pointerdown", manual, { capture: true, signal: abort.signal }); window.addEventListener("blur", release, { signal: abort.signal }); document.addEventListener("visibilitychange", release, { signal: abort.signal });
  const setText = (el, text) => { if (el.textContent !== text) el.textContent = text; };
  const setDisplay = (el, show) => { const v = show ? "block" : "none"; if (el.style.display !== v) el.style.display = v; };
  const timer = setInterval(() => {
    if (!alive) return;
    checkRetreat(performance.now());
    if (gameplayCompatible) { recoverOrphanLevelUp(game); recoverStalledTicker(game, performance.now()); }
    const editorOpen = !!window.__d2editIsOpen?.(), menuOpen = toolsMenuOpen();
    // 每 200 毫秒執行：只在內容不同時才寫入 DOM，避免無謂觸發語言模組的 MutationObserver 與重排。
    setText(launcher, trAuto("輔助"));
    setText(stopButton, trAuto("停止自動戰鬥"));
    setDisplay(launcher, menuOpen && !editorOpen && panel.hidden);
    // 只在戰鬥中顯示：角色／物品欄（character）、商店與倉庫（town、camp）、技能樹與任務日誌開啟時隱藏，避免蓋住視窗按鈕。
    const gameWindowOpen = !game || !["playing", "levelUp"].includes(game.state) || !!(game.hud?.skillsOpen || game.hud?.questLogOpen);
    setDisplay(stopButton, settings.progressEnabled && !menuOpen && !editorOpen && panel.hidden && !gameWindowOpen);
    setDisplay(statusLine, (settings.enabled || settings.progressEnabled) && !menuOpen && !editorOpen && panel.hidden);
    // 依使用者要求：狀態列顯示目前自動戰鬥模式。
    setText(statusLine, trAuto((settings.progressEnabled ? "【" + modeLabel() + "】" : "") + lastAction));
    if (!menuOpen || editorOpen) panel.hidden = true;
    if (!game) guarded(null, performance.now());
    if (panel.hidden) return;
    const s = readState(game);
    setText(status, trAuto(["戰鬥輔助：" + (settings.enabled ? "啟用" : "關閉") + "／自動戰鬥：" + (settings.progressEnabled ? "啟用（" + modeLabel() + "）" : "關閉"), game ? questLine(game) : "", game ? "掛鉤：原版 Game／" + game.state : hookNote, s.hp ? `生命：${Math.ceil(s.hp.now)}／${Math.ceil(s.hp.max)}` : "生命：無法讀取", s.mp ? `魔力：${Math.ceil(s.mp.now)}／${Math.ceil(s.mp.max)}` : "魔力：未啟用或無法讀取", game?.kit?.id ? "職業：" + ({ amazon: "亞馬遜", assassin: "刺客", barbarian: "野蠻人", druid: "德魯伊", necromancer: "死靈法師", paladin: "聖騎士", sorceress: "法師" }[game.kit.id] || game.kit.id) + "（" + (isMelee() ? "近戰" : "遠程") + "）" : "", game?.world?.terror ? "恐怖層數：" + game.world.terror.tier : "", "最近動作：" + lastAction, storageNote].filter(Boolean).join("\n")));
  }, 200);
  const api = {
    destroy() { if (!alive) return; alive = false; restoreGoldRate(); restoreAllSkills(); restoreAllCheats(); setPickupRadius(pickupOwner, false); release(); abort.abort(); clearInterval(timer); for (const restore of restores.reverse()) restore(); launcher.remove(); stopButton.remove(); statusLine.remove(); host.remove(); if (window.__d2autobot === api) delete window.__d2autobot; }, stop,
    diagnostics: () => ({ hellClears, hookUrl, hookNote, connected: !!game, state: game?.state ?? null, lastAction, storageNote, quests: (() => { try { const q = questSnapshot(game); return { line: questLine(game), done: q.done, total: q.total, pending: q.pending, cain: q.cain }; } catch { return null; } })(), gameBuild: (() => { try { return JSON.parse(localStorage.getItem(BUILD_KEY) || "null"); } catch { return null; } })() }),
    get game() { return game; },
  };
  window.__d2autobot = api;
  connect().catch((err) => { if (alive) hookNote = "無法掛接遊戲程式：" + String(err.message || err); fire(checkGameVersion(""), "版本檢查"); });
})();
