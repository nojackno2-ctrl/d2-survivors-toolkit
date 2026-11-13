// 存檔讀寫核心（對應 Electron 版 editor/core.js）
// 存檔有兩份：localStorage（遊戲主要讀取）與 save/save.json（備份）。兩份都會改寫並重新簽章。
use hmac::{Hmac, Mac};
use rusty_leveldb::{Options, DB};
use serde_json::{json, Map, Value};
use sha2::Sha256;
use std::{fs, path::{Path, PathBuf}, sync::{Mutex, MutexGuard}, time::{SystemTime, UNIX_EPOCH}};

type R<T> = Result<T, String>;
const SEAL_SC: &str = "d2s/save-seal/1:Rakanishu-Bishibosh-Coldcrow-Griswold-Pindleskin";
const SEAL_HC: &str = "d2s/save-seal/hc/1:Blood-Raven-Treehead-Woodfist-Coldworm-Andariel";

// 所有 localStorage 讀寫排隊執行：LevelDB 會鎖檔，同時開啟後到的會失敗
static DB_LOCK: Mutex<()> = Mutex::new(());

// 鎖被 panic 的執行緒汙染時仍可繼續使用，避免單一執行緒出錯讓整個程式失效
pub fn lock<T>(m: &Mutex<T>) -> MutexGuard<'_, T> { m.lock().unwrap_or_else(|e| e.into_inner()) }

pub fn hardcore(mode: &str) -> bool { mode == "hardcore" }
fn mode_name(hc: bool) -> &'static str { if hc { "hardcore" } else { "softcore" } }
fn save_key(hc: bool) -> &'static str { if hc { "d2-survivors/hc/v1" } else { "d2-survivors/save/v1" } }
// 遊戲內建匯入時，會把舊存檔留在這些 key
fn trace_keys(hc: bool) -> [&'static str; 1] {
    if hc { ["d2-survivors/hc/before-import"] } else { ["d2-survivors/save/before-import"] }
}

// 測試可用 D2_USER_DIR 指向存檔副本，不碰真實存檔
pub fn user_dir() -> PathBuf {
    std::env::var_os("D2_USER_DIR").map(PathBuf::from).unwrap_or_else(|| {
        PathBuf::from(std::env::var_os("APPDATA").unwrap_or_default()).join("D2 Survivors")
    })
}
fn ldb_dir() -> PathBuf { user_dir().join("Local Storage").join("leveldb") }
fn save_file() -> PathBuf { user_dir().join("save").join("save.json") }
pub fn d2_dir() -> PathBuf { user_dir().join("d2") }
// 備份放在啟動器旁邊，不放進遊戲資料夾
pub fn backup_dir() -> PathBuf {
    std::env::var_os("D2_BACKUP_DIR").map(PathBuf::from).unwrap_or_else(|| {
        std::env::current_exe().ok().and_then(|p| p.parent().map(Path::to_path_buf)).unwrap_or_default().join("backups")
    })
}

/* ---------- 簽章 ---------- */
fn hmac_hex(hc: bool, body: &str) -> String {
    let mut mac = Hmac::<Sha256>::new_from_slice(if hc { SEAL_HC } else { SEAL_SC }.as_bytes()).unwrap();
    mac.update(body.as_bytes());
    hex::encode(mac.finalize().into_bytes())
}
fn is_hc(save: &Map<String, Value>) -> bool { save.get("mode").and_then(Value::as_str) == Some("hc") }

// 與遊戲相同：HMAC-SHA256(金鑰, JSON.stringify(去掉 seal 的存檔))，seal 接在最後。
// body 是頁面端 JSON.stringify 出來的字串（見 shim.js），這裡不重新序列化。
pub fn seal_text(body: &str) -> R<String> {
    let v: Value = serde_json::from_str(body).map_err(|_| "存檔格式不正確。".to_string())?;
    let save = v.as_object().filter(|o| o.get("version").is_some_and(Value::is_number) && !o.contains_key("seal"))
        .ok_or("存檔格式不正確。")?;
    let seal = hmac_hex(is_hc(save), body);
    Ok(if body == "{}" { format!("{{\"seal\":\"{seal}\"}}") } else { format!("{},\"seal\":\"{seal}\"}}", &body[..body.len() - 1]) })
}

pub fn seal_state(text: &str) -> &'static str {
    let Ok(Value::Object(mut save)) = serde_json::from_str::<Value>(text) else { return "broken" };
    let Some(seal) = save.get("seal").cloned() else { return "none" };
    let Some(seal) = seal.as_str() else { return "broken" };
    let hc = is_hc(&save);
    // 遊戲寫出的文字 seal 一定在最後：直接取原文的前段驗證，不受重新序列化的數字格式影響
    let t = text.trim();
    let tail = format!("\"seal\":\"{seal}\"}}");
    if let Some(head) = t.strip_suffix(&tail) {
        let body = match head.strip_suffix(',') { Some(h) => format!("{h}}}"), None => "{}".to_string() };
        if hmac_hex(hc, &body) == seal { return "sealed" }
    }
    // 排版過的檔案（例如手動編輯的匯出檔）：重新序列化後再比一次
    save.shift_remove("seal");
    if serde_json::to_string(&save).is_ok_and(|body| hmac_hex(hc, &body) == seal) { "sealed" } else { "broken" }
}

/* ---------- Chromium localStorage ---------- */
fn ls_key(k: &str) -> Vec<u8> { [b"_app://game\x00\x01".as_slice(), k.as_bytes()].concat() }
// 值：0x01 + latin1，或 0x00 + UTF-16LE
fn decode_ls(v: &[u8]) -> String {
    match v.split_first() {
        Some((1, rest)) => rest.iter().map(|&b| b as char).collect(),
        Some((_, rest)) => String::from_utf16_lossy(&rest.chunks_exact(2).map(|c| u16::from_le_bytes([c[0], c[1]])).collect::<Vec<_>>()),
        None => String::new(),
    }
}
fn encode_ls(s: &str) -> Vec<u8> {
    if s.chars().all(|c| (c as u32) <= 0xff) {
        std::iter::once(1u8).chain(s.chars().map(|c| c as u8)).collect()
    } else {
        std::iter::once(0u8).chain(s.encode_utf16().flat_map(u16::to_le_bytes)).collect()
    }
}
fn open_db() -> R<DB> {
    let mut opt = Options::default();
    opt.create_if_missing = false;
    DB::open(ldb_dir(), opt).map_err(|e| format!("無法開啟 localStorage，請先完全關閉遊戲再試。({e})"))
}
fn db_get(db: &mut DB, key: &str) -> Option<String> { db.get(&ls_key(key)).map(|v| decode_ls(&v)) }

/* ---------- 讀寫 ---------- */
pub fn load(mode: &str) -> R<Value> {
    let hc = hardcore(mode);
    let _guard = lock(&DB_LOCK);
    let mut db = open_db()?;
    let mut text = db_get(&mut db, save_key(hc));
    let _ = db.close();
    drop(db);
    let mut source = "localStorage";
    if text.is_none() && !hc {
        if let Ok(t) = fs::read_to_string(save_file()) { text = Some(t); source = "save.json"; }
    }
    let text = text.ok_or_else(|| format!("找不到{}模式的存檔。", if hc { "硬核" } else { "一般" }))?;
    Ok(json!({ "seal": seal_state(&text), "source": source, "saveText": text }))
}

fn iso_stamp() -> String {
    let ms = SystemTime::now().duration_since(UNIX_EPOCH).map(|d| d.as_millis()).unwrap_or(0) as i64;
    let (days, rem) = (ms.div_euclid(86_400_000), ms.rem_euclid(86_400_000));
    // 民用曆換算（Howard Hinnant 的 civil_from_days）
    let z = days + 719_468;
    let (era, doe) = (z.div_euclid(146_097), z.rem_euclid(146_097));
    let yoe = (doe - doe / 1460 + doe / 36_524 - doe / 146_096) / 365;
    let doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
    let mp = (5 * doy + 2) / 153;
    let (d, m) = (doy - (153 * mp + 2) / 5 + 1, if mp < 10 { mp + 3 } else { mp - 9 });
    let y = yoe + era * 400 + i64::from(m <= 2);
    format!("{y:04}-{m:02}-{d:02}T{:02}-{:02}-{:02}-{:03}Z", rem / 3_600_000, rem / 60_000 % 60, rem / 1000 % 60, rem % 1000)
}

// 備份依類型放子資料夾：softcore／hardcore（寫入前的自動備份）、snapshots（手動快照）；舊版平放的檔案仍可列出
fn backup(name: &str, text: &str, sub: &str) -> R<()> {
    let dir = backup_dir().join(sub);
    fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    fs::write(dir.join(format!("{}_{name}", iso_stamp())), text).map_err(|e| e.to_string())
}

pub fn store(mode: &str, body: &str) -> R<Value> {
    let hc = hardcore(mode);
    let text = seal_text(body)?;
    let _guard = lock(&DB_LOCK);
    let mut db = open_db()?;
    let written = (|| -> R<()> {
        let key = save_key(hc);
        if let Some(old) = db_get(&mut db, key) {
            backup(&format!("{}_localStorage.json", mode_name(hc)), &old, mode_name(hc))
                .map_err(|e| format!("無法備份原存檔，已取消寫入：{e}"))?;
        }
        db.put(&ls_key(key), &encode_ls(&text)).map_err(|e| e.to_string())?;
        db.flush().map_err(|e| e.to_string())?;
        if db_get(&mut db, key).as_deref() != Some(text.as_str()) {
            return Err("寫入後讀回的內容不一致，存檔可能沒有寫進去。".into());
        }
        Ok(())
    })();
    let closed = db.close().map_err(|e| e.to_string());
    drop(db);
    written?;
    closed?;
    // save.json 只存放目前模式的存檔（遊戲 main 行程寫入的是最後一次的存檔）
    if let Ok(old) = fs::read_to_string(save_file()) {
        let old_hc = serde_json::from_str::<Value>(&old).ok().and_then(|v| v.as_object().map(is_hc)).unwrap_or(false);
        if old_hc == hc {
            backup("save.json", &old, mode_name(hc)).map_err(|e| format!("無法備份 save.json，已取消寫入：{e}"))?;
            fs::write(save_file(), &text).map_err(|e| e.to_string())?;
        }
    }
    Ok(json!({ "ok": true, "bytes": text.encode_utf16().count() }))
}

// 物品圖示與尺寸（遊戲解出來的 d2/items.json，一格 = 28px）。dir 是啟動器提供的本機圖檔網址。
pub fn assets(dir_url: &str) -> Value {
    let items: Value = fs::read_to_string(d2_dir().join("items.json")).ok()
        .and_then(|t| serde_json::from_str(&t).ok()).unwrap_or(Value::Null);
    let slim = |name: &str| -> Value {
        let mut out = Map::new();
        if let Some(group) = items.get(name).and_then(Value::as_object) {
            for (k, v) in group {
                let inv = v.get("inv").and_then(Value::as_array).map(|a| {
                    a.iter().map(|i| json!([i.get("file"), i.get("width"), i.get("height")])).collect::<Vec<_>>()
                }).unwrap_or_default();
                out.insert(k.clone(), Value::Array(inv));
            }
        }
        Value::Object(out)
    };
    json!({ "dir": dir_url, "bases": slim("bases"), "uniques": slim("uniques"), "sets": slim("sets"),
            "quest": slim("quest"), "runes": slim("runes"), "gems": slim("gems") })
}

// 找出 / 刪除遊戲留下的匯入痕跡
pub fn traces(mode: &str, remove: bool) -> R<Value> {
    let _guard = lock(&DB_LOCK);
    let mut db = open_db()?;
    let mut found = Vec::new();
    for k in trace_keys(hardcore(mode)) {
        if db.get(&ls_key(k)).is_some() {
            found.push(k);
            if remove { let _ = db.delete(&ls_key(k)); }
        }
    }
    let _ = db.close();
    Ok(json!(found))
}

/* ---------- 存檔管理 ---------- */
fn summarize(text: &str) -> Map<String, Value> {
    let mut out = Map::new();
    match serde_json::from_str::<Value>(text) {
        Ok(Value::Object(s)) => {
            out.insert("gold".into(), s.get("gold").cloned().unwrap_or(Value::Null));
            out.insert("mode".into(), json!(mode_name(is_hc(&s))));
            out.insert("classes".into(), json!(s.get("unlocked").and_then(Value::as_object).map(|u| u.keys().cloned().collect::<Vec<_>>()).unwrap_or_default()));
            out.insert("seal".into(), json!(seal_state(text)));
        }
        _ => { out.insert("broken".into(), json!(true)); }
    }
    out
}

pub fn list_backups() -> Value {
    let root = backup_dir();
    let mut names = Vec::new();
    for e in fs::read_dir(&root).into_iter().flatten().flatten() {
        let name = e.file_name().to_string_lossy().into_owned();
        if e.path().is_dir() {
            for f in fs::read_dir(e.path()).into_iter().flatten().flatten() {
                names.push(format!("{name}/{}", f.file_name().to_string_lossy()));
            }
        } else {
            names.push(name);
        }
    }
    let mut list: Vec<(f64, Value)> = names.into_iter().filter(|f| f.ends_with(".json")).filter_map(|f| {
        let path = root.join(&f);
        let meta = fs::metadata(&path).ok()?;
        let time = meta.modified().ok()?.duration_since(UNIX_EPOCH).ok()?.as_secs_f64() * 1000.0;
        let mut row = summarize(&fs::read_to_string(&path).unwrap_or_default());
        row.insert("file".into(), json!(f));
        row.insert("size".into(), json!(meta.len()));
        row.insert("time".into(), json!(time));
        Some((time, Value::Object(row)))
    }).collect();
    list.sort_by(|a, b| b.0.total_cmp(&a.0));
    Value::Array(list.into_iter().map(|(_, v)| v).collect())
}

// 檔名只允許「檔名.json」或「一層子資料夾/檔名.json」
fn safe_name(f: &str) -> R<PathBuf> {
    let (sub, name) = match f.split_once('/') { Some((s, n)) => (Some(s), n), None => (None, f) };
    let sub_ok = sub.is_none_or(|s| !s.is_empty() && s.chars().all(|c| c.is_alphanumeric() || c == '_' || c == '-'));
    if !sub_ok || name.is_empty() || name.contains(['/', '\\']) || f.contains("..") || !f.ends_with(".json") {
        return Err("檔名不正確。".into());
    }
    Ok(backup_dir().join(f))
}
pub fn read_backup(f: &str) -> R<Value> {
    Ok(json!({ "saveText": fs::read_to_string(safe_name(f)?).map_err(|e| e.to_string())? }))
}
pub fn delete_backup(f: &str) -> R<Value> {
    fs::remove_file(safe_name(f)?).map_err(|e| e.to_string())?;
    Ok(json!({ "ok": true }))
}
pub fn snapshot(body: &str, label: &str) -> R<Value> {
    let label = if label.is_empty() { "快照" } else { label };
    let clean: String = label.chars().map(|c| if "\\/:*?\"<>|".contains(c) { '_' } else { c }).take(60).collect();
    backup(&format!("{clean}.json"), &seal_text(body)?, "snapshots")?;
    Ok(json!({ "ok": true }))
}
pub fn write_file(path: &Path, body: &str) -> R<()> {
    fs::write(path, seal_text(body)?).map_err(|e| e.to_string())
}

// 診斷資訊：各個檔案找不找得到（不含存檔內容）
pub fn diag() -> Value {
    json!({
        "platform": "win32", "launcher": "rust", "appdata": user_dir().exists(), "localStorage": ldb_dir().exists(),
        "saveFile": save_file().exists(), "itemData": d2_dir().join("itemstats.json").exists(),
        "backups": backup_dir().to_string_lossy(),
    })
}

// 讀取本機一般／硬核存檔並組裝桌面版防護狀態（無檔為 null，無法開啟資料庫時不拋錯）
pub fn guard_status() -> Value {
    let _guard = lock(&DB_LOCK);
    let (mut sc, mut hc) = (None, None);
    if let Ok(mut db) = open_db() {
        sc = db_get(&mut db, save_key(false));
        hc = db_get(&mut db, save_key(true));
        let _ = db.close();
    }
    if sc.is_none() { sc = fs::read_to_string(save_file()).ok(); }
    let state = |t: Option<String>| t.map(|t| json!(seal_state(&t))).unwrap_or(Value::Null);
    json!({
        "version": 1, "saveMode": "local", "saveModeSource": "default", "noUpload": true, "leaderboardOff": null,
        "queuePresent": false, "blockedUploads": 0, "replacedNatives": [], "d2zh": false, "webdriver": false,
        "restrictedParams": [], "seals": { "softcore": state(sc), "hardcore": state(hc) }, "desktop": true,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn seal_round_trip() {
        let body = r#"{"version":3,"gold":12,"name":"測試","x":0.1}"#;
        let text = seal_text(body).unwrap();
        assert!(text.starts_with(&body[..body.len() - 1]) && text.ends_with("\"}"));
        assert_eq!(seal_state(&text), "sealed");
        assert_eq!(seal_state(&text.replace("12", "13")), "broken");
        assert_eq!(seal_state(body), "none");
        assert_eq!(seal_state("[]"), "broken");
        // 排版過的檔案仍可驗證
        let pretty = serde_json::to_string_pretty(&serde_json::from_str::<Value>(&text).unwrap()).unwrap();
        assert_eq!(seal_state(&pretty), "sealed");
        // 硬核用另一把金鑰
        let hc = seal_text(r#"{"version":3,"mode":"hc"}"#).unwrap();
        assert_eq!(seal_state(&hc), "sealed");
        assert_ne!(hc.rsplit_once(":\"").unwrap().1, seal_text(r#"{"version":3,"mode":"sc"}"#).unwrap().rsplit_once(":\"").unwrap().1);
        assert!(seal_text(r#"{"gold":1}"#).is_err());
    }

    #[test]
    fn local_storage_encoding() {
        assert_eq!(encode_ls("abc"), vec![1, b'a', b'b', b'c']);
        assert_eq!(decode_ls(&encode_ls("aé")), "aé");
        assert_eq!(encode_ls("中")[0], 0);
        assert_eq!(decode_ls(&encode_ls("存檔 save")), "存檔 save");
    }

    #[test]
    fn backup_names() {
        assert!(safe_name("softcore/a.json").is_ok() && safe_name("a.json").is_ok());
        for bad in ["../a.json", "a/b/c.json", "a.txt", "/a.json", "a\\b.json", "x/..json/../a.json"] {
            assert!(safe_name(bad).is_err(), "{bad}");
        }
    }

    // 對存檔「副本」做的相容性實測（需設 D2_USER_DIR、D2_BACKUP_DIR；平常跳過）：
    // 讀出一般存檔，原樣重新簽章寫回；之後用 launcher/tests/ldb-dump.cjs 以真正的 LevelDB 比對。
    #[test]
    #[ignore]
    fn live_round_trip() {
        assert!(std::env::var_os("D2_USER_DIR").is_some() && std::env::var_os("D2_BACKUP_DIR").is_some(), "只能對副本執行");
        let before = load("softcore").unwrap();
        let text = before["saveText"].as_str().unwrap().to_string();
        assert_eq!(before["seal"], "sealed");
        let body = text.rsplit_once(",\"seal\":").map(|(h, _)| format!("{h}}}")).unwrap();
        // D2_MUTATE=1：改寫成不同內容（多一個欄位），驗證 LevelDB 看得到「新值」
        let mutate = std::env::var_os("D2_MUTATE").is_some();
        let body = if mutate { format!("{},\"__xtest\":1}}", &body[..body.len() - 1]) } else { body };
        let expect = seal_text(&body).unwrap();
        store("softcore", &body).unwrap();
        let after = load("softcore").unwrap();
        assert_eq!(after["saveText"].as_str().unwrap(), expect);
        assert!(mutate || expect == text, "原樣寫回後內容應完全相同");
        assert_eq!(after["seal"], "sealed");
        println!("round trip ok, bytes={}", text.len());
    }
}
