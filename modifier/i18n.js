// 介面語言：依系統語言自動切換（中文系統 → 繁體中文，其他 → English），可在「設定」手動指定。
// 原始碼的介面文字是繁體中文；英文模式下把畫面上出現的中文換成英文（含動態產生的訊息與對話框）。
(function () {
  const KEY = "d2se:lang";
  let pref = "auto";
  try { pref = localStorage.getItem(KEY) || "auto"; } catch {}
  let d2langCode = null;
  try { d2langCode = window.__d2lang?.get?.() || localStorage.getItem("d2lang"); } catch {}
  const sys = String((navigator.languages && navigator.languages[0]) || navigator.language || "en").toLowerCase();
  const LANG = d2langCode === "en" ? "en" : d2langCode === "zh-TW" ? "zh" : pref === "zh" || pref === "en" ? pref : sys.startsWith("zh") ? "zh" : "en";
  window.LANG = LANG;
  window.LANG_PREF = pref;
  window.setLangPref = (v) => {
    try {
      localStorage.setItem(KEY, v);
      if (v === "en") localStorage.setItem("d2lang", "en");
      else if (v === "zh") localStorage.setItem("d2lang", "zh-TW");
      else localStorage.removeItem("d2lang"); // 自動：清掉手動語言，否則 d2lang 優先會讓它停在先前的選擇
    } catch {}
    location.reload();
  };
  document.documentElement.lang = LANG === "zh" ? "zh-Hant" : "en";
  if (LANG === "zh") { window.tr = (s) => s; return; }

  // 中文片段 → 英文；由長到短替換，整句優先
  const EN = {
    "原版屬性規則不合規（含稀有職業技能詞綴）：": "Original stat rules failed (including rare class skill affixes): ",
    "屬性點未驗證：缺少角色資料": "Attribute points unverified: character data missing",
    "屬性點未驗證：沒有可檢查的角色": "Attribute points unverified: no character to check",
    "屬性點未驗證：": "Attribute points unverified: ",
    "屬性點合規：": "Attribute points compliant: ",
    "屬性點不合規：": "Attribute points exceed the earned limit: ",
    "稀有職業技能詞綴未驗證：物品規則檢查無法使用": "Rare class skill affixes unverified: item rule check unavailable",
    "所有物品符合原版屬性規則（含稀有職業技能詞綴）": "All items meet original stat rules, including rare class skill affixes",
    "未驗證": "Unverified",
    // 標題與頁籤
    "D2 倖存者 存檔修改器": "D2 Survivors Save Editor", "D2倖存者工具包": "D2 Survivors Toolkit", "D2倖存者工具包 診斷資訊": "D2 Survivors Toolkit diagnostics",
    "（已解除限制）": " (restrictions off)", "一般模式": "Softcore", "硬核模式": "Hardcore", "重新讀取": "Reload", "寫入存檔": "Write save",
    "關閉": "Close", "請先關閉遊戲": "Please close the game first", "物品": "Items", "製作裝備": "Craft", "裝備庫": "Item library",
    "帳號 / 強化": "Account / Upgrades", "反修改偵測": "Anti-tamper check", "存檔管理": "Saves", "原始存檔資料": "Raw save data", "設定": "Settings",
    // 版本驗證
    "遊戲已更新到 ": "The game has updated to ", "，輔助器只驗證到 ": ", helper tested only up to ", "，存檔修改器只驗證到 ": ", save editor tested only up to ",
    "遊戲已更新到": "The game has updated to ", "輔助器只驗證到": "helper tested only up to", "存檔修改器只驗證到": "save editor tested only up to",
    "請更新輔助器；部分功能可能失效": "please update the helper; some features may not work", "請更新修改器；部分功能可能失效": "please update the editor; some features may not work",
    "；遊戲程式已變更": "; game code has changed", "遊戲程式已變更": "Game code has changed", "關閉提示": "Dismiss notice",
    // 設定
    "解除修改限制": "Remove editing restrictions", "介面語言": "Interface language", "自動（依系統語言）": "Auto (system language)",
    "預設關閉。關閉時修改器會依原版規則把關，檢查已知規則，仍不保證排行榜接受存檔：": "Off by default. The editor checks known game rules, but leaderboard acceptance is not guaranteed:",
    "暗金、套裝、符文之語：屬性種類與數量必須與原版物品定義相同，每項數值不可超出原版範圍，底材必須正確。": "Unique, set and runeword items: the stats must match the original item definition exactly, every value must stay within its original range, and the base must be correct.",
    "魔法：最多 1 個前綴＋1 個後綴；稀有：2～6 個詞綴（稀有珠寶最多 4 個），前綴、後綴各最多 3 個，同類詞綴不可重複；每個詞綴必須是此底材可出現的原版詞綴，數值在原版範圍內。": "Magic: at most 1 prefix + 1 suffix. Rare: 2–6 affixes (rare jewels max 4), at most 3 prefixes and 3 suffixes, no two affixes from the same group. Every affix must be an original affix that can roll on that base, with values in its original range.",
    "普通品質不可有詞綴；底材固有屬性必須與原版相同。": "Normal items cannot have affixes; base (implicit) stats must match the original.",
    "金幣不可超過 100 億、額外強化不可超過 999、恰西強化不可超過上限、技能修改每職業最多 10 點。": "Gold cannot exceed 10 billion, extra upgrades cannot exceed 999, Charsi upgrades cannot exceed their cap, and skill modifiers are limited to 10 points per class.",
    "寫入存檔前會再檢查一次所有修改過或匯入的物品，不合規則就拒絕寫入。": "Before writing, every edited or imported item is checked again; the write is refused if anything breaks the rules.",
    "開啟後修改器只管「改得進去」，不再遵守上述規則與遊戲的防修改設計：": "When turned on, the editor only cares that the change goes in and no longer follows the rules above or the game's anti-tamper design:",
    "製作／解鎖／數值最高：直接取最高值，不再找遊戲可驗證的種子（比較快），可設定「數值倍率」超過正常上限，製作數量不限 40 件。": "Craft / unlock / max values: takes the maximum directly without searching for a verifiable seed (faster), allows a \"value multiplier\" beyond normal limits, and removes the 40-item craft limit.",
    "建立全新存檔：不再把金幣壓在 100 億以內，也不自動修正物品。": "New save: gold is no longer capped at 10 billion and items are not fixed automatically.",
    "不再顯示金幣上限警告。": "The gold cap warning is no longer shown.",
    "開啟後可以做出超出原版範圍或不合理的裝備，很可能被遊戲判定為外部修改（存檔仍可正常使用，但排行榜不計分），一切後果由使用者自行負責。「反修改偵測」頁仍可掃描與修正。": "When on, you can create gear outside the original ranges or with impossible stats. The game will likely flag the save as externally modified (it still works, but leaderboard scores won't count). You are solely responsible for the consequences. The Anti-tamper check page can still scan and fix.",
    "開啟「解除修改限制」？將不再檢查原版數值範圍與裝備屬性規則，做出來的東西很可能被遊戲判定為外部修改，後果由你自行負責。": "Remove editing restrictions? Original value ranges and gear rules will no longer be checked. What you create will likely be flagged as externally modified, and you are responsible for the consequences.",
    "已解除修改限制": "Editing restrictions removed", "已恢復修改限制": "Editing restrictions restored",
    "診斷資訊": "Diagnostics", "產生診斷資訊": "Generate diagnostics", "複製": "Copy",
    "遇到問題時按「產生診斷資訊」，再按「複製」貼給開發者。內容是修改器狀態、存檔的件數摘要與最近的操作紀錄，不含排行榜識別碼等識別碼。": "If something goes wrong, press \"Generate diagnostics\", then \"Copy\" and send it to the developer. It contains the editor state, a count summary of the save and recent actions — no leaderboard IDs or other identifiers.",
    "收集中…": "Collecting…", "已複製，可以貼上了": "Copied — ready to paste",
    // 裝備庫／製作
    "用遊戲自己的產生器製作，跟遊戲掉落的物品完全相同（含可驗證的種子），不會被判定外部修改。": "Made with the game's own generator — identical to real drops (including a verifiable seed), so it won't be flagged as modified.",
    "全部品質": "All qualities", "稀有（選底材）": "Rare (pick base)", "魔法（選底材）": "Magic (pick base)", "搜尋（中英文皆可）": "Search",
    "從左邊選一件物品。": "Pick an item on the left.", "訂製裝備": "Custom craft",
    "自選底材、品質與屬性。魔法名稱依詞綴組合，稀有名稱由遊戲隨機產生，固定品質依物品定義命名；詞綴或固定物品無法唯一判定時會提示。物品等級為 99，穿戴需求由遊戲依屬性計算。屬性範圍列出此底材可用的詞綴，並非所有詞綴都能同時出現。": "Choose the base, quality and stats. Magic names follow the affix combination, rare names are generated by the game, and fixed-quality items are named from their definition; you'll be told if no unique match exists. Item level is 99 and requirements are computed by the game. Ranges list the affixes available on this base — not all of them can appear together.",
    "未解除修改限制時，屬性必須符合原版規則（固定物品依原版定義，魔法／稀有依原版詞綴組合），否則無法製作。": "While restrictions are on, the stats must follow the original rules (fixed items per their definition, magic/rare per original affix combinations), otherwise the item cannot be made.",
    "未解除限制時不能製作暗金、套裝或符文之語": "Without removing restrictions, unique, set and runeword items cannot be crafted",
    "中文說明": "Description", "數值／詞綴範圍": "Value / affix range", "數值／遊戲範圍": "Value / game range", "數值與範圍": "Value & range",
    "＋ 新增屬性": "+ Add stat", "＋ 新增前綴": "+ Add prefix", "＋ 新增後綴": "+ Add suffix", "＋ 新增固有屬性": "+ Add implicit stat",
        "前綴": "Prefix", "後綴": "Suffix", "前綴 已用 ": "Prefix used: ", "後綴 已用 ": "Suffix used: ",
        "前綴數量已達上限": "Prefix limit reached", "後綴數量已達上限": "Suffix limit reached", "詞綴總數已達上限": "Total affix limit reached",
        "固有屬性（底材）": "Implicit stats (base)", "合計上限：": "Total affix limit: ", "已用 ": "Used ", " / 上限 ": " / Limit ",
        "（目前已用 ": " (Currently used ", "放到": "Put in", "製作": "Make", "（請選擇屬性）": "(choose a stat)",
    "詞綴跟遊戲掉落一樣隨機（合法）。做好可在「物品」頁修改屬性，或多做幾件挑喜歡的。": "Affixes are random, just like drops (legit). Edit stats on the Items page afterwards, or make several and keep the one you like.",
    "全部最高（合法）": "All max (legit)", "隨機（跟掉落一樣）": "Random (like a drop)", "數值倍率": "Value multiplier", "數量": "Quantity", "數值": "Values",
    "這個版本的遊戲找不到魔法／稀有物品的產生函式": "This game version has no magic/rare item generator",
    "製作中…": "Crafting…", "製作失敗": "Crafting failed", "無法依遊戲規則決定名稱。": "Cannot determine the name by game rules.",
    "無法依屬性設定物品資料。": "Cannot build the item from these stats.",
    "件，請用搜尋縮小範圍。": " more — use search to narrow down.", "還有 ": "",
    // 物品頁
    "點選左邊的物品進行編輯。": "Select an item on the left to edit.", "點選物品進行編輯。": "Select an item to edit.", "選擇一個位置。": "Choose a location.",
    "共用倉庫": "Shared stash", "共用": "Shared", "身上裝備": "Equipped", "個人倉庫": "Personal stash", "背包": "Inventory", "護身符欄": "Charm slots",
    "傭兵裝備": "Mercenary gear", "其他": "Other", "暗金收藏": "Unique collection", "賣出紀錄（可買回）": "Sold items (buyback)",
    "鑰匙與器官（首領掉落）": "Keys and organs (boss drops)", "恐懼之鑰": "Key of Terror", "憎恨之鑰": "Key of Hate", "毀滅之鑰": "Key of Destruction",
    "墨菲斯托之腦": "Mephisto's Brain", "迪亞布羅之角": "Diablo's Horn", "巴爾之眼": "Baal's Eye",
    "鑰匙各設為 1": "Set keys to 1", "器官各設為 1": "Set organs to 1", "鑰匙與器官": "Keys and organs",
    "已將三把鑰匙各設為 1（尚未寫入存檔）": "Set all three keys to 1 (not yet written to the save)",
    "已將三件器官各設為 1（尚未寫入存檔）": "Set all three organs to 1 (not yet written to the save)",
    "恐懼階中，女伯爵、召喚師與尼拉塞克會掉落三種鑰匙，階層越深機率越高。三把鑰匙各持有一把時，恐懼階會出現超級首領選項（女族長巢穴、遺忘沙漠或痛苦熔爐），開啟時消耗鑰匙。三種器官（墨菲斯托之腦、迪亞布羅之角、巴爾之眼）各持有一件時，恐懼階會出現超級崔斯特姆，開啟時消耗器官。按「寫入存檔」才會儲存。": "In Terror tiers, the Countess, the Summoner and Nihlathak drop the three keys, more often in deeper tiers. With one of each key, a Terror tier offers a Terror boss option (Matron's Den, Forgotten Sands or Furnace of Pain), which uses the keys. With one each of the three organs (Mephisto's Brain, Diablo's Horn, Baal's Eye), a Terror tier offers Uber Tristram, which uses the organs. Press \"Write save\" to save.",
    "（空）": "(empty)", "搜尋名稱…": "Search name…", " 件物品": " items",
    "輸出裝備設定": "Export equipment settings", "複製裝備設定": "Copy equipment settings", "複製下列內容貼給協助除錯的人；不包含存檔內容。": "Copy the text below to share for troubleshooting; it does not include save data.", "裝備分類": "Equipment category", "裝備類型": "Equipment type", "武器種類": "Weapon kind", "全部武器": "All weapons", "請選擇裝備類型": "Choose equipment type", "請選擇品質": "Choose quality", "請選擇武器種類": "Choose weapon kind", "請選擇底材": "Choose base", "底材": "Base", "品質": "Quality", "防禦": "Defense", "位置（橫, 直）": "Position (x, y)", "屬性": "Stats", "固有": "Implicit", "底材固有屬性": "Base implicit stat",
    "套用修改": "Apply", "數值最高（合法）": "Max values (legit)", "刪除物品": "Delete item", "複製到": "Copy to", "移動到": "Move to",
    "屬性可從下拉選單挑選。範圍以此物品的遊戲產生資料為準；無法判定時顯示「未提供」。修改套裝／魔法／稀有物品的屬性後，可能被遊戲判定為不合法，請到「反修改偵測」頁處理。按上方「寫入存檔」才會真正存檔。": "Pick stats from the dropdown. Ranges come from the game's own item data; \"n/a\" means unknown. After editing set/magic/rare stats the game may consider the item not legit — use the Anti-tamper check page. Nothing is saved until you press \"Write save\".",
    "已刪除（尚未寫入存檔）": "Deleted (not written yet)", "已複製（尚未寫入存檔）": "Copied (not written yet)", "已移動（尚未寫入存檔）": "Moved (not written yet)",
    "已套用（尚未寫入存檔）": "Applied (not written yet)", "（尚未寫入存檔）": " (not written yet)",
    "可用詞綴範圍：": "Affix ranges: ", "；可疊 ": "; stacks up to ", " 列，遊戲提示框顯示合計最高 ": " rows — the game tooltip shows the sum, max ", "；底材固有另加 ": "; base auto mod adds ", "底材固有加成範圍：": "Base auto mod range: ", "底材取樣範圍：": "Base range: ",
"範圍：未提供": "Range: n/a", "範圍：讀取中": "Range: loading", "範圍：": "Range: ",
    "這件物品不能穿戴在任何欄位。": "This item can't be equipped in any slot.", "欄已有物品，請先移走。": " slot is occupied — move that item first.", " 沒有足夠空間。": " has no room.", "沒有足夠空間。": " has no room.",
    // 暗金收藏
    "載入物品資料中…": "Loading item data…", "已收藏 ": "Collected ", "一鍵解鎖＋全部最高": "Unlock all + max all",
    "補齊收藏，並把收藏、角色身上、傭兵身上、倉庫、背包、護身符欄的暗金／套裝／符文之語全部調成最高": "Fill the collection and max out every unique/set/runeword in the collection, on characters, mercenaries, stashes, inventories and charm slots",
    "全部部位": "All slots", "全部": "All", "已收藏": "Collected", "未收藏・這個遊戲模式做不出來": "Not collected · unavailable in this mode", "・未收藏": " · not collected", "未收藏": "Not collected",
    "解鎖": "Unlock", "物品引擎無法啟動：": "Item engine failed to start: ", "物品引擎無法使用": "Item engine unavailable", "物品引擎沒有回應": "Item engine did not respond",
    "產生物品中… ": "Generating items… ", "調成最高數值中… ": "Maxing values… ", "調成最高數值": "Max values",
    "操作失敗：": "Operation failed: ", "無法加入：": "Could not add: ", "（遊戲不接受）": " (rejected by game)", "（做不出來）": " (cannot be made)",
    " 件目前遊戲版本不接受或做不出來，已略過（詳見診斷資訊）": " item(s) are rejected or cannot be made in this game version and were skipped (see diagnostics)",
    "將補齊 ": "This will add ", " 件未收藏的物品，並把 ": " missing item(s) and max out ", " 件已有的暗金／套裝／符文之語（含角色與傭兵身上）調成最高數值。繼續？": " owned unique/set/runeword item(s) (including on characters and mercenaries). Continue?",
    "完成：補齊 ": "Done: added ", " 件、調高 ": ", maxed ", " 件（含角色與傭兵身上）": " (including characters and mercenaries)",
    "，其中 ": "; ", " 件找不到全滿的合法數值，用最接近最高的": " could not reach a fully maxed legit roll and use the closest one",
    "；記得按「寫入存檔」": " — remember to press \"Write save\"", " 件已調成最高數值，全部為合法物品": " item(s) maxed, all legit",
    " 件套裝使用最接近最高的合法數值）": " set item(s) use the closest legit roll)",
    "已製作 ": "Made ", "已製作「": "Made \"", "做好 ": "After making ", " 件後：": " item(s): ",
    // 原版規則
    "不符合原版屬性規則，已拒絕：": "Refused — breaks the original stat rules: ",
    "（如需強制修改，請到「設定」開啟解除修改限制，後果自負）": " (to force it, enable \"Remove editing restrictions\" in Settings at your own risk)",
    "（如需強制修改，請到「設定」開啟解除修改限制）。": " (to force it, enable \"Remove editing restrictions\" in Settings).",
    "如需強制修改，請到「設定」開啟解除修改限制。": "To force it, enable \"Remove editing restrictions\" in Settings.",
    "無法檢查物品屬性：": "Cannot check item stats: ", "　…等 ": " … ", " 件": " item(s)",
    "物品格式不正確": "invalid item format", "找不到這個底材": "unknown base", "物品部位與底材不符": "item slot does not match the base", "屬性數值不是有效數字": "a stat value is not a valid number",
    "遊戲沒有這件固定物品": "no such fixed item in the game", "這件固定物品不能使用這個底材": "this fixed item cannot use this base", "不支援的品質": "unsupported quality",
    "此底材沒有普通品質": "this base has no normal quality", "護身符沒有稀有品質": "charms cannot be rare", "普通品質不能有詞綴屬性": "normal items cannot have affixes",
    "缺少原版屬性：": "missing original stat: ", "原版沒有此屬性：": "stat not on the original item: ", "底材沒有此固有屬性：": "base has no such implicit stat: ",
    "此底材的詞綴沒有此屬性：": "no affix on this base gives: ", "：數值 ": ": value ", " 超出原版範圍 ": " is outside the original range ", "防禦 ": "Defense ",
    "屬性組合不符原版魔法詞綴規則（最多 1 個前綴＋1 個後綴）": "stats don't form a valid original magic affix combination (max 1 prefix + 1 suffix)",
    "屬性組合不符原版稀有詞綴規則（2～6 個詞綴（珠寶最多 4 個），前綴、後綴各最多 3 個，同類詞綴不可重複）": "stats don't form a valid original rare affix combination (2–6 affixes, jewels max 4, max 3 prefixes and 3 suffixes, no duplicate groups)",
    "檢查失敗：": "check failed: ", "（固有）": " (implicit)", "（不符合原版規則）": " (breaks original rules)", "依原版規則已無法再加入屬性": "No more stats can be added under the original rules",
    "金幣超過原版上限 10,000,000,000，已拒絕寫入": "Gold exceeds the original cap of 10,000,000,000 — write refused",
    "金幣已限制在原版上限 10,000,000,000": "Gold limited to the original cap of 10,000,000,000",
    "所有物品符合原版屬性規則": "All items follow the original stat rules", " 件物品不符合原版屬性規則：": " item(s) break the original stat rules: ",
    "排行榜不應出現": "should not appear on the leaderboard", "重新產生暗金／套裝／符文之語": "Regenerate unique/set/runeword",
    // 帳號
    "基本": "Basics", "金幣": "Gold", "光之碎片": "Light shards", "可聘傭兵欄": "Mercenary slots",
    "金幣原版上限為 10,000,000,000；超過時遊戲會把存檔標記為「被外部修改」（排行榜不計分），未解除限制時無法超過。": "The original gold cap is 10,000,000,000. Above it the game marks the save as externally modified (no leaderboard score); it cannot be exceeded while restrictions are on.",
    "永久強化等級": "Permanent upgrades", "額外強化": "Extra upgrades", "全部設為": "Set all to", "角色": "Characters", "職業": "Class", "解鎖難度": "Unlocked difficulty", "金色光芒": "Golden glow",
    "技能改造點數": "Skill mod points", "已付費重置次數": "Paid resets", "恐怖等級（開放）": "Terror level (open)", "技能修改": "Skill modifiers",
    "照遊戲規則：每個職業最多 10 點，每點可以讓一個技能選一種修改；選項只列出該職業有的技能。": "Per the game rules: up to 10 points per class, each point lets one skill take one modifier; only that class's skills are listed.",
    "（上限 ": " (max ", "強化等級升滿才能加額外強化": "Max the upgrade level first to add extra upgrades",
    "讀不到遊戲的技能修改資料（或已解除修改限制），請用上方表格的點數欄或「原始存檔資料」頁修改。": "Skill modifier data unavailable (or restrictions removed); use the points column above or the Raw save data page.",
    "修改點數": "Modifier points", "技能": "Skill", "修改": "Modifier", "（被動）": " (passive)", "（不修改）": "(none)", "已用 ": "Used ", " 點": " pts", "見下方「技能修改」": "See \"Skill modifiers\" below",
    "未解鎖": "Locked", "普通": "Normal", "惡夢": "Nightmare", "地獄": "Hell", "魔法": "Magic", "稀有": "Rare", "套裝": "Set", "暗金": "Unique", "符文之語": "Runeword",
    "武器": "Weapon", "副手": "Off-hand", "頭盔": "Helm", "盔甲": "Armor", "手套": "Gloves", "腰帶": "Belt", "鞋子": "Boots", "項鍊": "Amulet", "戒指1": "Ring 1", "戒指2": "Ring 2",
    "盾牌／副手": "Shield / off-hand", "戒指": "Ring", "護身符": "Charm",
    "力量": "Strength", "敏捷": "Dexterity", "體力": "Vitality", "能量": "Energy", "金幣尋獲": "Gold find", "魔法尋獲": "Magic find", "傷害減免": "Damage reduced",
    "生命回復": "Replenish life", "重抽": "Rerolls", "跳過": "Skips", "放逐": "Banishes", "復活": "Resurrect", "跑速": "Run speed", "施法速度": "Cast rate",
    "賣價": "Sell price", "藥水": "Potions", "經驗": "Experience", "火焰穿透": "Fire pierce", "冰冷穿透": "Cold pierce", "閃電穿透": "Lightning pierce",
    "毒素穿透": "Poison pierce", "物理穿透": "Physical pierce", "傭兵生命": "Merc life", "傭兵抗性": "Merc resist", "傭兵防禦": "Merc defense",
    "亞馬遜": "Amazon", "魔法使": "Sorceress", "死靈法師": "Necromancer", "聖騎士": "Paladin", "野蠻人": "Barbarian", "德魯伊": "Druid", "刺客": "Assassin",
    // 反修改偵測
    "偵測結果": "Scan results",
    "依照遊戲本身的檢查規則（金幣上限、光之碎片、物品合法性、角色等級、簽章、標記與匯入痕跡）掃描目前的存檔內容。": "Scans the current save with the game's own checks (gold cap, light shards, item legitimacy, character level, signature, flags and import traces).",
    "重新掃描": "Rescan", "一鍵全部規避": "Fix all", "狀態": "Status", "項目": "Item", "存檔識別碼": "Save identifiers", "重新產生排行榜與角色識別碼": "Regenerate leaderboard and character IDs", "此操作會重設所有角色的爬塔紀錄與恐懼階層（含連勝與被換下角色保存的恐懼紀錄）。變更需寫入存檔後生效。": "This resets every character's climb record and terror tiers (including the streak and the terror record kept on swapped-out characters). Write the save to apply the changes.", "已重新產生排行榜與角色識別碼，並重設爬塔紀錄與恐懼階層（記得寫入存檔）": "Regenerated the leaderboard and character IDs, and reset climb records and terror tiers (remember to write the save)",
    "排行榜關閉時不會上傳任何資料。角色的爬塔紀錄帶有連鎖雜湊，修改器不會動它。": "Nothing is uploaded while the leaderboard is off. Character climb records carry a hash chain and are never touched.",
    "簽章正確": "Signature valid", "簽章損壞或不存在": "Signature broken or missing", "寫入時自動修復": "fixed automatically on write",
    "金幣在上限內（≤ 100 億）": "Gold within the cap (≤ 10 billion)", " 超過 100 億上限": " exceeds the 10 billion cap", "設為 100 億": "Set to 10 billion",
    "擁有翅膀但光之碎片只有 ": "Has wings but only ", "碎片設為 10": "Set shards to 10", "穿戴翅膀但尚未取得": "Wearing wings that were never obtained", "補上翅膀": "Grant wings",
    "光之碎片／翅膀正常": "Light shards / wings OK", " 件物品會被判定為不合法：": " item(s) will be judged not legit: ", "遊戲檢查": "game check", "近似檢查": "approximate check",
    "重新產生為合法物品": "Regenerate as legit", "物品合法性檢查通過": "Item legitimacy check passed", "角色等級超出 1–99：": "Character level outside 1–99: ", "設為 99": "Set to 99",
    "角色等級正常": "Character levels OK", "存檔已被標記「外部修改」": "Save is flagged as externally modified", "清除標記": "Clear flag", "沒有「外部修改」標記": "No external-modification flag",
    "存檔留有紀錄：": "Save has records: ", "曾從遊戲匯入": "imported via the game", "曾被重新檢查": "rechecked", "清除紀錄": "Clear records", "沒有匯入／檢查紀錄": "No import/recheck records",
    "硬核角色被標記不計排名：": "Hardcore characters marked unranked: ", "瀏覽器存放區留有遊戲匯入前的舊存檔": "Browser storage still holds the pre-import save",
    "立即刪除": "Delete now", "瀏覽器存放區沒有匯入痕跡": "No import traces in browser storage", "✔ 安全": "✔ Safe", "✖ 會被偵測": "✖ Detectable",
    "已規避（記得寫入存檔）": "Fixed (remember to write the save)", "已全部規避（記得寫入存檔）": "All fixed (remember to write the save)",
    "排行榜識別碼": "Leaderboard ID", "排行榜名稱": "Leaderboard name", "排行榜": "Leaderboard", "已關閉（不上傳）": "Off (no upload)", "已關閉（工具包單機模式，無法開啟）": "Off (toolkit single-player mode, cannot be enabled)", "（工具包單機模式，排行榜上傳一律關閉）": " (toolkit single-player mode: leaderboard upload is always off)", "開啟": "On",
    " 角色識別碼": " character ID", "存檔建立時間": "Save created", "已產生新的排行榜識別碼（記得寫入存檔）": "New leaderboard ID generated (remember to write the save)",
    // 存檔管理
    "目前存檔": "Current save", "快照名稱，例如：打巴爾前": "Snapshot name, e.g. before Baal", "建立快照": "Create snapshot", "匯出成檔案": "Export to file",
    "從檔案匯入": "Import from file", "開啟備份資料夾": "Open backup folder",
    "匯入、載入備份只會載入到修改器裡，按上方「寫入存檔」才會真正寫入。修改器是直接寫入，不經過遊戲的匯入功能，所以不會留下匯入紀錄。": "Importing or loading a backup only loads it into the editor; press \"Write save\" to actually write it. The editor writes directly, bypassing the game's import, so no import record is left.",
    "建立全新存檔": "Create fresh save",
    "以遊戲的空白存檔為基礎，只帶入下面勾選的內容。舊的排行榜識別碼、角色識別碼、建立時間、爬塔紀錄、匯入／修改標記與賣出紀錄都不會帶過去，由遊戲重新產生，等同一個乾淨的新存檔。所有物品會換上新的物品識別碼。": "Starts from the game's blank save and carries over only what is ticked below. Old leaderboard IDs, character IDs, creation time, climb records, import/modification flags and sold items are not carried over — the game regenerates them, giving a clean new save. All items get new item IDs.",
    "備份與快照": "Backups & snapshots", "時間": "Time", "名稱": "Name", "模式": "Mode", "簽章": "Signature",
    "金幣": "Gold", "永久／額外強化": "Permanent / extra upgrades", "難度解鎖、擊殺巴爾、最佳時間": "Difficulty unlocks, Baal kills, best times",
    "角色進度（等級、技能、重置次數）": "Character progress (level, skills, resets)", "恐怖等級": "Terror levels", "倉庫物品": "Stash items",
    "身上裝備、背包、護身符": "Equipped gear, inventory, charms", "傭兵": "Mercenaries", "光之碎片／翅膀": "Light shards / wings", "凱恩任務": "Cain quests",
    "教學提示與拾取設定（避免重看教學）": "Tutorial hints & loot filter (skip tutorials again)",
    "硬核": "Hardcore", "一般": "Softcore", "檔案損壞": "File corrupted", "正確": "Valid", "損壞": "Broken", "載入": "Load", "刪除": "Delete",
    "還沒有備份。每次寫入存檔前會自動備份，也可以手動建立快照。": "No backups yet. A backup is made automatically before every write, and you can create snapshots manually.",
    "這個備份是": "This backup is ", "模式，與目前選擇的模式不同，仍要載入嗎？": " mode, which differs from the selected mode. Load anyway?",
    "已載入備份「": "Loaded backup \"", "刪除備份「": "Delete backup \"", "刪除「": "Delete \"",
    "讀取中…": "Loading…", "繁體中文字典載入失敗，部分內容可能顯示英文。": "Translation dictionary failed to load.",
    "簽章已損壞（寫入時會修復）": "signature broken (fixed on write)", "無簽章": "no signature", "已讀取（來源：": "Loaded (source: ",
    "瀏覽器存放區": "browser storage", "備份存檔檔案": "backup save file",
    "確定寫入？原存檔會先自動備份。": "Write the save? The original is backed up first.", "寫入中…": "Writing…",
    "寫入完成並重新簽章。按「關閉」後遊戲會重新載入。": "Written and re-signed. Press \"Close\" and the game will reload.",
    "寫入完成並重新簽章，可以開啟遊戲了。": "Written and re-signed. You can start the game now.",
    "快照": "snapshot", "已建立快照": "Snapshot created", "已匯出：": "Exported: ", "已匯入檔案（尚未寫入存檔）": "File imported (not written yet)",
    "以勾選的內容建立全新存檔？（建立後按「寫入存檔」才會取代遊戲中的存檔，原存檔會先自動備份）": "Create a fresh save from the ticked items? (It replaces the game save only after you press \"Write save\"; the original is backed up first.)",
    "已建立全新存檔（尚未寫入存檔）": "Fresh save created (not written yet)", "已套用存檔資料（尚未寫入存檔）": "Save data applied (not written yet)",
    "存檔資料格式錯誤：": "Invalid save data: ", "套用此存檔資料": "Apply this save data", "可修改任何欄位；按「套用」後才會生效。": "You can edit any field; changes take effect after \"Apply\".",
    "寫入後按「關閉」，遊戲會重新載入並套用修改": "After writing, press \"Close\" — the game reloads and applies the changes",
    "JS 錯誤：": "JS error: ", "未處理的錯誤：": "Unhandled error: ",
    "遊戲裡的存檔與上次寫入的一致": "The game's save matches the last write", "不一致：上次寫入收藏 ": "Mismatch: last write had ", " 件，現在遊戲裡 ": " collected, game now has ", " 件（遊戲可能沒有採用修改）": " (the game may not have taken the change)",
    "完成": "Done",
    // 後端訊息
    "檔名不正確。": "Invalid file name.", "無法開啟 localStorage，請先完全關閉遊戲再試。": "Cannot open browser storage — fully close the game and try again.",
    "找不到一般模式的存檔。": "No softcore save found.", "找不到硬核模式的存檔。": "No hardcore save found.", "不支援的操作": "Unsupported operation", "存檔格式不正確。": "Invalid save format.",
    "下載資料夾": "Downloads folder", "不是 D2 倖存者的存檔。": "Not a D2 Survivors save.", "檔案讀取失敗：": "Failed to read file: ",
    "網頁版的備份是下載的檔案，請用「從檔案匯入」。": "Web backups are downloaded files — use \"Import from file\".",
    "寫入後讀回的內容不一致，存檔可能沒有寫進去。": "Read-back after writing did not match; the save may not have been written.",
    "字典讀取失敗": "Dictionary failed to load", "讀不到遊戲物品資料（請先進入過遊戲一次）。": "Cannot read game item data (start the game once first).",
    "遊戲版本不相容：找不到 ": "Incompatible game version — missing: ", "找不到遊戲程式，請確認 D2 Survivors 安裝在預設位置。": "Game files not found — make sure D2 Survivors is installed in the default location.",
    "物品引擎啟動逾時。": "Item engine timed out.", "不支援的物品品質。": "Unsupported item quality.", "找不到指定底材。": "Base not found.",
    "這組屬性不符合任何可辨識的固定物品，無法決定名稱。": "These stats match no recognizable fixed item; cannot determine a name.",
    "這組屬性對應多個遊戲詞綴名稱，無法唯一決定名稱。": "These stats match several affix names; cannot pick a unique name.",
    "這組屬性無法對應遊戲的魔法詞綴名稱。": "These stats don't map to any magic affix name.",
    "這組屬性符合多件固定物品，無法唯一決定名稱。": "These stats match several fixed items; cannot pick a unique name.",
    "遊戲不會產生此底材的普通品質物品。": "The game never makes normal-quality items on this base.", "遊戲無法為此底材產生稀有名稱。": "The game cannot generate a rare name for this base.",
    "遊戲詞綴資料不可用。": "Game affix data unavailable.", "匯入存檔": "Import save", "匯出存檔": "Export save", "存檔": "Save",
    // 屬性說明片段（字典缺字時）
    "技能等級": " skill levels", "等級 ": "Level ", "次充能": " charges", "（每級）": " (per level)", "（每次擊中）": " (per hit)",
    // 安裝頁
    "書籤": "bookmark",
    // 單字
    "需求 ": "Req ", "需求": "Req", "點": "pts", "件": " item(s)",
    // 輔助器 (autobot) 介面與控制項
    "遊戲輔助工具": "Game Assistant", "遊戲輔助設定": "Game Assistant Settings", "立即停止輔助": "Stop Assistant Now",
    "戰鬥輔助": "Combat Assist", "自動戰鬥": "Auto Battle", "輔助": "Assist", "停止輔助": "Stop Assist", "停止自動戰鬥": "Stop Auto Battle", "全部關閉": "Turn Off All", "全部關閉會關閉所有開關及全圖撿裝；已套用的部分遊戲修改可能持續至重新開始遊戲。": "Turn Off All disables every switch and global item pickup; some applied game modifications may remain until the game is restarted.",
    "一般與安全": "General & Safety", "戰鬥輔助總開關": "Combat Assist Master Switch",
    "生命與藥水": "Life & Potions", "自動喝生命藥水": "Auto Drink Life Potion", "生命門檻（％）": "Life Threshold (%)",
    "一擊必殺預判喝水": "Lethal Hit Prediction Potion", "預測提前秒數": "Lookahead Seconds", "生命藥水冷卻（毫秒）": "Potion Cooldown (ms)", "降級模式生命藥帶欄（1～4）": "Fallback Belt Slot (1–4)",
    "走位與閃避": "Movement & Dodging", "自動走位（預判包圍、保持距離、閃避）": "Auto Movement (Kite, Dodge & Avoid Surround)", "戰鬥方式": "Combat Style", "閃避敵方飛彈": "Dodge Enemy Projectiles",
    "自動（依技能攻擊距離）": "Auto (by skill reach)", "近戰（貼身攻擊）": "Melee (close range)", "遠程（保持距離）": "Ranged (keep distance)",
    "全圖吸金幣": "Global gold pickup", "撿寶": "Loot", "自動撿寶": "Auto loot", "全圖撿寶": "Global loot", "開啟（依遊戲過濾器）": "On (use game loot filter)",
    "裝備依遊戲內建撿寶過濾器決定保留、隱藏或自動販售；請在遊戲設定調整。無法掛接時，僅在 HUD 可讀的情況下按指定藥帶鍵，不從 Canvas 猜測敵人位置。": "Equipment follows the game loot filter for keeping, hiding, or selling; adjust it in game settings. When unhooked, uses readable HUD belt presses without guessing enemy positions from Canvas.",
    "全圖撿裝模式": "Global Loot Mode", "關閉全圖撿裝": "Global loot off", "全部撿取": "Pick up everything", "只撿更好的裝備": "Only pick upgrades", "撿寶過濾": "Loot Filter", "自動撿裝備": "Auto Loot Gear", "全圖吸經驗（地上經驗寶石自動飛來；非原版行為）": "Global Vacuum XP (auto-attract XP gems; unoriginal)", "全圖撿取（要撿的東西自動飛來、寶箱直接開啟；非原版行為）": "Global Vacuum Loot (attract items & auto open chests; unoriginal)", "物品搜尋距離": "Item Search Radius", "追蹤金幣": "Track Gold", "踢地上罐子木桶（可能掉藥水）": "Kick Jars & Barrels (may drop potions)", "普通／魔法／稀有只撿比身上好的（撿前先看屬性）": "Only pick upgrades for normal/magic/rare", "通關後等待撿裝": "Wait for loot after clearing",
    "撿取普通": "Loot Normal", "撿取魔法": "Loot Magic", "撿取稀有": "Loot Rare", "撿取套裝": "Loot Set", "撿取暗金": "Loot Unique", "撿取符文之語": "Loot Runeword",
    "自動戰鬥開關": "Auto Battle Switch", "自動模式": "Auto Mode",
    "任務模式（完成所有任務並練到 99 級，達成後自動改刷地獄）": "Quest Mode (finish all quests & level 99, then farm Hell)",
    "固定關卡模式（重複刷指定難度）": "Fixed Difficulty Mode (repeat specified difficulty)",
    "天梯模式": "Ladder Mode", "天梯方式": "Ladder Style",
    "推關（恐怖層數往上推）": "Climb Tiers (push Terror tier)", "固定層數（重刷指定層，須已通關）": "Fixed Tier (farm cleared Terror tier)",
    "固定關卡難度": "Fixed Difficulty", "固定層數": "Fixed Tier",
    "恐怖層數": "Terror Tiers", "通關等待（秒）": "Post-clear Wait (sec)", "陣亡後重試（有保留角色時）": "Retry on Death (with kept hero)",
    "關卡進程": "Quest Progress", "優先接近任務頭目": "Prioritize Quest Bosses", "在營地自動開局／續玩（全新存檔可用）": "Auto Start / Continue in Camp",
    "排行榜學習": "Leaderboard Learning", "依排行榜高手配法選升級卡": "Pick upgrade cards by top players", "依高手比例自動配屬性點": "Auto assign stat points by top ratio", "技能配置和排行榜差太多時向阿卡拉付費重置技能（普通通關後可用，重置後立刻重新選卡）": "Paid respec at Akara when build deviates (available after Normal)",
    "自動重抽（升級候選卡評分偏低時自動使用重抽）": "Auto reroll on low card scores",
    "自動穿上較佳裝備": "Auto Equip Better Gear", "替換門檻（約等於傷害提升％）": "Upgrade Threshold (~dmg gain %)",
    "營地整備（每次回營地自動變強）": "Camp Preparation (get stronger every town trip)", "回營地自動整備": "Auto Camp Maintenance", "暗金／套裝收進收藏庫": "Deposit Unique/Set to Collection", "較好的裝備存入倉庫": "Stash Better Gear", "賣掉用不到的裝備": "Sell Junk Gear", "用金幣向阿卡拉買生命藥水": "Buy Potions from Akara", "用金幣升級恰西永久能力": "Buy Charsi Permanent Upgrades", "向商人買較佳裝備": "Buy Better Gear from Vendors",
    "死亡保護": "Death Protection", "死亡保護（緊急離開本局）": "Death Protection (emergency save & exit)", "緊急生命門檻（％）": "Emergency Life Threshold (%)", "觸發後關閉兩頁總開關": "Disable both automation switches on trigger",
    "手動操作會暫讓控制權；背景分頁、設定面板、修改器及遊戲暫停時停止動作。總開關只能在此面板切換；戰鬥中可按「停止自動戰鬥」。": "Manual input temporarily yields control; pauses when backgrounded, in settings panel, save editor, or game paused. Master switches are controlled here; use Stop Auto Battle during combat.",
    "死亡保護預設關閉；觸發時一律關閉推層、重刷與任務推進，須自行重新開啟。沿用原版離場結算，可能損失本局進度；無營地模式時可能回到角色選單。致命傷害與包圍判定為啟發式，不保證生存。任務輔助追蹤已生成的物品、石陣、牢籠、敵人與通關門；特定配點、營地交付及隱藏條件仍需手動處理。": "Death protection defaults to off; triggers disable progression and must be manually re-enabled. Uses original exit settlement, risking loss of current run; may return to character select without camp. Damage and surrounding are heuristic, no survival guarantee. Quests track spawned items, stones, cages, bosses, and portals; specific builds, hand-ins, and secrets require manual action.",
    "品質過濾控制自動追蹤目標；路過物品仍可能由原版自動撿起。無法掛接時，僅在 HUD 可讀的情況下按指定藥帶鍵，不從 Canvas 猜測敵人位置。": "Quality filter controls active tracking; walking over items may still trigger original pickups. When unhooked, downgrades to readable HUD belt presses without guessing enemy positions from Canvas.",
    "遊戲修改": "Cheats", "修改總控制": "Cheat Master Control", "遊戲修改總開關（主控所有修改項目）": "Cheat Master Switch (controls all cheats)",
    "戰鬥修改": "Combat Cheats", "無敵（免疫所有傷害且鎖定滿血）": "Invincible (immune to all damage & lock full life)", "致命攻擊（致命一擊機率最高）": "Max Critical Strike (maximize crit chance)", "一擊必殺（所有屬性傷害提升一百倍）": "One-Hit Kill (100x all damage)", "技能最高等級99等（所有已學技能與被動等級鎖定99等）": "Max Skill Level 99 (lock all learned skills & passives at Lv 99)",
    "怪物與環境修改": "Monster & World Cheats", "怪物數量最大化（地圖怪物生成速度與數量拉滿）": "Maximize Monster Count (max out spawn rate & monster cap)", "一般怪物全部變成精英以上等級（全圖小怪升階為金/藍怪）": "All Monsters Elite+ (upgrade normal monsters to Champion/Elite)",
    "流程與掉落修改": "Progression & Drop Cheats", "選技能的重抽無限次數（升級選卡無限重抽、跳過與排除）": "Infinite Skill Rerolls (unlimited reroll, skip & banish on level-up)", "掉寶率最高（大幅提升暗金/套裝/稀有尋寶率）": "Max Drop Rate (massively boost Unique/Set/Rare Magic Find)", "金幣掉落率最高（偵測玩家金幣超過 90 億自動關閉）": "Max Gold Rate (auto-disables when gold reaches 9B)",
    "開啟": "ON", "啟用": "Enabled",
  };
  const PUNCT = { "（": " (", "）": ")", "「": "\"", "」": "\"", "，": ", ", "、": ", ", "：": ": ", "；": "; ", "。": ". ", "！": "!", "？": "?", "～": "–", "／": " / ", "＋": "+", "　": " ", "・": " · " };
  const PUNCT_RE = /[（）「」，、：；。！？～／＋　・]/g;
  const keys = Object.keys(EN).sort((a, b) => b.length - a.length);
  const CJK = /[　-〿㐀-鿿＀-￯]/;
  const cache = new Map();
  function tr(text) {
    if (typeof text !== "string" || !CJK.test(text)) return text;
    if (cache.has(text)) return cache.get(text);
    const lead = text.match(/^\s*/)[0], tail = text.match(/\s*$/)[0], core = text.trim();
    let t = EN[core];
    if (t === undefined) {
      t = core;
      for (const k of keys) if (t.includes(k)) t = t.split(k).join(EN[k]);
      t = t.replace(PUNCT_RE, (m) => PUNCT[m] ?? m);
      t = t.replace(/ {2,}/g, " ").replace(/\( /g, "(").replace(/ \)/g, ")").trim();
    }
    t = lead.replace(/　/g, " ") + t + tail.replace(/　/g, " ");
    if (cache.size < 20000) cache.set(text, t);
    return t;
  }
  window.tr = tr;
  const ATTRS = ["placeholder", "title", "label"];
  function walk(root) {
    if (root.nodeType === 3) { if (/^(SCRIPT|STYLE|TEXTAREA)$/.test(root.parentNode?.nodeName ?? "")) return; const v = tr(root.nodeValue); if (v !== root.nodeValue) root.nodeValue = v; return; }
    if (root.nodeType !== 1 || root.tagName === "SCRIPT" || root.tagName === "STYLE" || root.tagName === "TEXTAREA") return;
    for (const a of ATTRS) if (root.hasAttribute?.(a)) { const v = root.getAttribute(a), n = tr(v); if (n !== v) root.setAttribute(a, n); }
    for (const c of root.childNodes) walk(c);
  }
  const start = () => {
    document.title = tr(document.title);
    walk(document.body);
    new MutationObserver((list) => {
      for (const m of list) {
        if (m.type === "characterData") walk(m.target);
        else if (m.type === "attributes") walk(m.target);
        else for (const n of m.addedNodes) walk(n);
      }
    }).observe(document.body, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ATTRS });
  };
  // 等整頁解析完再開始，避免改到尚未執行的腳本
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start); else start();
  const alert0 = window.alert.bind(window), confirm0 = window.confirm.bind(window);
  window.alert = (m) => alert0(tr(String(m ?? "")));
  window.confirm = (m) => confirm0(tr(String(m ?? "")));
})();
