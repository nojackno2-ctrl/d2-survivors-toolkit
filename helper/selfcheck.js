// 工具包自檢：在 d2edit.js 的載入進度條跑的時候同時執行，檢查「工具包」與「當前遊戲」是否相符。
// 有問題只輸出（進度條下方列表、主控台、window.__d2editSelfCheck），不阻擋遊玩、不拋錯。
// 每筆問題 { level: "error" | "warn" | "info", area, msg }：
//   error＝某項功能一定壞；warn＝可能失效；info＝提示（例如遊戲還在選角畫面，尚無法檢查掛接）。
const TESTED_GAME_BUILD = "20261105.3"; // 每次確認新版遊戲相容後更新此值（verify 腳本會自動改）

// 輔助器依賴的遊戲物件成員（來自 helper/autobot.js 的用法）；缺少代表遊戲改版後輔助器對應功能可能失效。
const GAME_FUNCS = ["leaveRun", "continueRun", "startRun", "toMenu", "gainXp", "startTerror", "spendStatPoints", "inventoryOf", "equippedOf", "useQuest", "heroNumbers"];
const GAME_PROPS = ["state", "hud", "camp", "save", "build", "difficulty", "director", "trade", "gearActions", "world", "kit"];
const HUD_FUNCS = ["showTown", "closeLevelUp"];

const parseBuild = (b) => String(b || "").split(/[.\-]/).map((n) => parseInt(n, 10) || 0);
function isNewer(a, b) {
  const x = parseBuild(a), y = parseBuild(b);
  for (let i = 0; i < Math.max(x.length, y.length); i++) { if ((x[i] || 0) !== (y[i] || 0)) return (x[i] || 0) > (y[i] || 0); }
  return false;
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const withTimeout = (p, ms, what) => {
  let tid = 0;
  return Promise.race([p, new Promise((_, rej) => { tid = setTimeout(() => rej(new Error(what + "逾時")), ms); })]).finally(() => clearTimeout(tid));
};

// 檢查輔助器接到的遊戲物件；回傳問題清單。等待上限 waitMs（遊戲還在選角／載入時可能尚未接上）。
export async function checkGameHook(waitMs = 3500) {
  const issues = [];
  const t0 = Date.now();
  let game = window.__d2autobot?.game || null;
  while (!game && Date.now() - t0 < waitMs) {
    await sleep(50);
    game = window.__d2autobot?.game || null;
  }
  const lang = window.__d2lang?.debug?.();
  if (window.__d2lang && lang && !lang.gameHooked) issues.push({ level: "info", area: "語言", msg: "遊戲內翻譯尚未掛上（可能還在載入或選角畫面）" });
  if (!window.__d2autobot) { issues.push({ level: "warn", area: "輔助器", msg: "輔助器尚未載入" }); return issues; }
  if (!game) {
    const note = window.__d2autobot.diagnostics?.().hookNote || "";
    issues.push({ level: "info", area: "輔助器", msg: "尚未掛接遊戲物件（進入遊戲後才會接上）" + (note ? "：" + note : "") });
    return issues;
  }
  const missing = [
    ...GAME_FUNCS.filter((k) => typeof game[k] !== "function"),
    ...GAME_PROPS.filter((k) => !(k in game)),
    ...(game.hud ? HUD_FUNCS.filter((k) => typeof game.hud[k] !== "function").map((k) => "hud." + k) : []),
  ];
  if (game.director && typeof game.director === "object") {
    if (typeof game.director.cloneComes !== "function") missing.push("director.cloneComes");
  } else issues.push({ level: "info", area: "輔助器", msg: "尚未驗證 director.cloneComes（進入戰局後才可檢查）" });
  if (missing.length) issues.push({ level: "warn", area: "輔助器", msg: "遊戲物件缺少輔助器使用的成員：" + missing.join("、") + "（相關功能可能失效）" });
  return issues;
}

export async function runSelfCheck(ctx) {
  const issues = [];
  const add = (level, area, msg) => issues.push({ level, area, msg });
  const result = { at: new Date().toISOString(), tested: TESTED_GAME_BUILD, build: "", gameJs: "", issues, ok: true };
  const guard = async (area, fn) => { try { await fn(); } catch (e) { add("warn", area, "檢查本身失敗：" + String(e?.message ?? e)); } };

  // 各檢查項目無相依的部分改為並行執行（存檔檢查中只有 saveFaults 需要等物品引擎，存檔讀取與簽章驗證可先並行開始）
  let engine = null;
  await Promise.all([
    // 1. 遊戲版本與主程式檔
    guard("遊戲版本", async () => {
      result.gameJs = performance.getEntriesByType("resource").map((e) => e.name.match(/\/(Game-[\w-]+\.js)/)?.[1]).find(Boolean) || "";
      let list = null;
      try { list = await withTimeout(window.__d2changelogPromise || fetch("/changelog.json", { cache: "no-cache" }).then((r) => (r.ok ? r.json() : null)), 5000, "讀取官方版本"); } catch {}
      const build = list?.[0]?.build ? String(list[0].build) : "";
      result.build = build;
      if (!build) add("info", "遊戲版本", "無法取得官方版本資訊，略過版本比對");
      else if (isNewer(build, TESTED_GAME_BUILD)) add("warn", "遊戲版本", `遊戲已更新到 ${build}，工具包只驗證到 ${TESTED_GAME_BUILD}，部分功能可能失效，請等工具包更新`);
      else if (build !== TESTED_GAME_BUILD) add("info", "遊戲版本", `遊戲版本 ${build} 比工具包驗證版本 ${TESTED_GAME_BUILD} 舊（遊戲頁可能是快取）`);
      let prev = null;
      try { prev = JSON.parse(localStorage.getItem("d2edit:selfcheckGameJs") || "null"); } catch {}
      if (result.gameJs && prev?.gameJs && prev.gameJs !== result.gameJs && prev.build === build) add("warn", "遊戲版本", `遊戲程式檔已變更（${prev.gameJs} → ${result.gameJs}）但版本號沒變，請留意功能是否正常`);
      try { if (result.gameJs) localStorage.setItem("d2edit:selfcheckGameJs", JSON.stringify({ gameJs: result.gameJs, build })); } catch {}
    }),

    // 2. 工具包自己的資料：字典、遊戲資料
    guard("字典", async () => {
      const [dict, data] = await Promise.all([ctx.dict(), ctx.gamedata()]);
      const n = dict ? Object.keys(dict).length : 0;
      if (n < 5000) add("warn", "字典", `繁中字典筆數異常（${n}），遊戲內可能顯示英文`);
      if (!data || typeof data !== "object" || !Object.keys(data).length) add("warn", "遊戲資料", "修改器遊戲資料檔內容為空");
    }),

    // 3 & 4. 物品引擎與當前存檔（存檔讀取與引擎啟動並行，讀完後再用引擎的 saveFaults 檢查）
    (async () => {
      const savesP = Promise.all(["softcore", "hardcore"].map((m) => Promise.resolve().then(() => ctx.backend.load(m)).then((loaded) => [m, loaded], () => [m, null])));
      await guard("物品引擎", async () => {
        try { engine = await ctx.engine(); }
        catch (e) {
          const info = ctx.engineInfo || {};
          const miss = info.missing?.length ? "，找不到的特徵：" + info.missing.join("、") : "";
          add("error", "物品引擎", "無法啟動（" + String(e?.message ?? e) + "）" + miss + "；存檔修改器的製作、檢查功能會失效");
          return;
        }
        const cap = engine.capabilities?.(ctx.gameScript?.());
        if (!cap?.supported) add("error", "物品引擎", "引擎回報不支援目前遊戲版本");
        else if (!cap.weaponSets) add("warn", "物品引擎", "找不到雙武器組判定函式，武器組相關功能可能失效");
        const info = ctx.engineInfo || {};
        if (info.itemstats && info.itemstats !== 200) add("warn", "物品引擎", "物品資料讀取狀態 " + info.itemstats);
      });
      await guard("存檔", async () => {
        for (const [m, loaded] of await savesP) {
          if (!loaded) continue;
          if (loaded.seal === "broken") add("warn", "存檔", `${m === "hardcore" ? "硬核" : "一般"}模式存檔簽章不符，遊戲可能拒絕讀取`);
          if (engine) {
            const faults = engine.saveFaults?.(JSON.parse(JSON.stringify(loaded.save)));
            if (Array.isArray(faults) && faults.length) add("warn", "存檔", `${m === "hardcore" ? "硬核" : "一般"}模式存檔有 ${faults.length} 項遊戲判定問題（例：${String(faults[0]).slice(0, 60)}）；可到修改器「存檔檢查」處理`);
          }
        }
      });
    })(),

    // 5. 遊戲物件掛接（輔助器、語言）
    guard("掛接", async () => { await ctx.ready?.(); issues.push(...(await checkGameHook(ctx.hookWaitMs ?? 3500))); }),
  ]);

  result.ok = !issues.some((i) => i.level === "error" || i.level === "warn");
  return result;
}
