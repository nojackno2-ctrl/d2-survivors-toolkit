// 唯讀解析 Electron 的 asar 封存檔（只讀不寫：改動官方 app.asar 會被遊戲標記 patched）。
// 格式：8 位元組（pickle：4, 標頭 pickle 大小）＋標頭 pickle（大小, JSON 長度, JSON）＋檔案內容。
use serde_json::Value;
use std::{fs::File, io::{Read, Seek, SeekFrom}, path::Path};

pub struct Asar {
    file: File,
    header: Value,
    data_start: u64,
}

fn u32_at(b: &[u8], at: usize) -> u64 {
    u32::from_le_bytes([b[at], b[at + 1], b[at + 2], b[at + 3]]) as u64
}

impl Asar {
    pub fn open(path: &Path) -> Result<Asar, String> {
        let mut file = File::open(path).map_err(|e| e.to_string())?;
        let mut head = [0u8; 16];
        file.read_exact(&mut head).map_err(|e| e.to_string())?;
        let (header_size, json_len) = (u32_at(&head, 4), u32_at(&head, 12));
        if u32_at(&head, 0) != 4 || 16 + json_len > 8 + header_size || header_size > 64 * 1024 * 1024 {
            return Err("asar 標頭格式不正確".into());
        }
        let mut json = vec![0u8; json_len as usize];
        file.read_exact(&mut json).map_err(|e| e.to_string())?;
        let header = serde_json::from_slice(&json).map_err(|e| e.to_string())?;
        Ok(Asar { file, header, data_start: 8 + header_size })
    }

    fn node(&self, parts: &[&str]) -> Option<&Value> {
        parts.iter().try_fold(&self.header, |n, p| n.get("files")?.get(*p))
    }

    // 資料夾底下的檔名（不含子資料夾內容）
    pub fn list(&self, dir: &[&str]) -> Vec<String> {
        self.node(dir).and_then(|n| n.get("files")).and_then(Value::as_object)
            .map(|m| m.keys().cloned().collect()).unwrap_or_default()
    }

    pub fn read(&mut self, path: &[&str]) -> Result<Vec<u8>, String> {
        let name = path.join("/");
        let node = self.node(path).ok_or_else(|| format!("asar 內找不到 {name}"))?;
        if node.get("unpacked").and_then(Value::as_bool) == Some(true) {
            return Err(format!("{name} 不在封存檔內"));
        }
        let size = node.get("size").and_then(Value::as_u64).ok_or_else(|| format!("{name} 不是檔案"))?;
        let offset: u64 = node.get("offset").and_then(Value::as_str).and_then(|s| s.parse().ok())
            .ok_or_else(|| format!("{name} 沒有位置資訊"))?;
        // 位置與大小都來自檔案標頭：先確認沒有溢位、沒有超出檔案，單檔上限 64 MiB
        let start = self.data_start.checked_add(offset).ok_or_else(|| format!("{name} 位置不正確"))?;
        let end = start.checked_add(size).ok_or_else(|| format!("{name} 位置不正確"))?;
        if size > 64 * 1024 * 1024 || end > self.file.metadata().map_err(|e| e.to_string())?.len() {
            return Err(format!("{name} 超出封存檔範圍"));
        }
        let mut buf = vec![0u8; size as usize];
        self.file.seek(SeekFrom::Start(start)).map_err(|e| e.to_string())?;
        self.file.read_exact(&mut buf).map_err(|e| e.to_string())?;
        Ok(buf)
    }

    pub fn read_text(&mut self, path: &[&str]) -> Result<String, String> {
        String::from_utf8(self.read(path)?).map_err(|e| e.to_string())
    }
}
