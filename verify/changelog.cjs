"use strict";

const categories = ["修改器", "輔助器", "自動淬鍊", "遊戲修改", "中文化", "效能", "工具包", "相容性"];
const escapeHtml = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

// 僅處理字串；相容性項目以官方版本去重，自訂項目以完整文字去重。
function mergeChangelog(html, { date, build, auto, items = [], format }) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !["site", "editor"].includes(format)) throw new Error("更新日誌參數無效");
  const grouped = new Map(categories.map((cat) => [cat, []]));
  grouped.get("相容性").push({ text: auto.replace(/^相容性：/, ""), automatic: true });
  for (const item of items) {
    const match = /^([^：]+)：/.exec(item);
    const cat = match && categories.includes(match[1]) ? match[1] : "工具包";
    grouped.get(cat).push({ text: cat === match?.[1] ? item.slice(match[0].length) : item, automatic: false });
  }
  const anchor = format === "site" ? html.indexOf('<div class="log">') : html.indexOf('<div class="page" id="changelog">');
  if (anchor < 0) throw new Error("找不到更新日誌區塊");
  const startPattern = format === "site" ? /<article\s+class="log-entry"\s+data-date="([\d-]+)"\s*>/g : /<h3>(\d{4}-\d{2}-\d{2})<\/h3>/g;
  const boundary = format === "editor" ? html.indexOf("</section>", anchor) : html.indexOf("</div>", anchor);
  if (boundary < 0) throw new Error("找不到更新日誌結尾");
  const matches = [...html.slice(anchor, boundary).matchAll(startPattern)].map((m) => ({ date: m[1], index: anchor + m.index }));
  if (format === "site" && !matches.length && html.slice(anchor, boundary).includes('<div class="log-entry">')) throw new Error("公告站更新日誌尚未轉為分類格式");
  const lineStart = (s, pos) => {
    const start = s.lastIndexOf("\n", pos - 1) + 1;
    return /^[ \t]*$/.test(s.slice(start, pos)) ? start : pos;
  };
  const found = matches.find((m) => m.date === date);
  const groupHtml = (cat, list) => format === "site"
    ? `          <section class="log-group" data-cat="${cat}">\n            <h4 class="log-cat">${cat}</h4>\n            <ul>\n${list.map((v) => `              <li>${escapeHtml(v.text)}</li>`).join("\n")}\n            </ul>\n          </section>\n`
    : `    <h4>${cat}</h4>\n    <ul>\n${list.map((v) => `      <li>${escapeHtml(v.text)}</li>`).join("\n")}\n    </ul>\n`;
  if (!found) {
    let pos = matches[0] && lineStart(html, matches[0].index);
    if (pos === undefined) {
      if (format === "site") pos = html.indexOf(">", anchor) + 1;
      else throw new Error("找不到更新日誌日期");
    }
    const groups = categories.filter((cat) => grouped.get(cat).length).map((cat) => groupHtml(cat, grouped.get(cat))).join("");
    const entry = format === "site" ? `        <article class="log-entry" data-date="${date}">\n          <h3 class="log-date">${date}</h3>\n${groups}        </article>\n` : `    <h3>${date}</h3>\n${groups}`;
    return { s: html.slice(0, pos) + entry + html.slice(pos), changed: true };
  }
  const end = format === "site" ? lineStart(html, html.indexOf("</article>", found.index)) : lineStart(html, matches.find((m) => m.index > found.index)?.index ?? boundary);
  if (end < 0) throw new Error("更新日誌格式不正確");
  let day = html.slice(found.index, end);
  const fresh = new Map();
  for (const cat of categories) {
    const values = grouped.get(cat).filter((v) => v.automatic ? !day.includes(`官方遊戲 ${escapeHtml(build)}`) : !day.includes(`<li>${escapeHtml(v.text)}</li>`));
    const unique = values.filter((v, i) => values.findIndex((x) => x.text === v.text) === i);
    if (unique.length) fresh.set(cat, unique);
  }
  if (!fresh.size) return { s: html, changed: false };
  for (const cat of categories) {
    const values = fresh.get(cat);
    if (!values) continue;
    const marker = format === "site" ? `<section class="log-group" data-cat="${cat}">` : `<h4>${cat}</h4>`;
    const pos = day.indexOf(marker);
    if (pos >= 0) {
      const close = day.indexOf("</ul>", pos);
      if (close < 0) throw new Error("更新日誌分類格式不正確");
      const indent = format === "site" ? "              " : "      ";
      const at = lineStart(day, close);
      const prefix = at === close ? "\n" : "";
      day = day.slice(0, at) + prefix + values.map((v) => `${indent}<li>${escapeHtml(v.text)}</li>\n`).join("") + day.slice(at);
    } else {
      const later = categories.slice(categories.indexOf(cat) + 1).map((c) => day.indexOf(format === "site" ? `<section class="log-group" data-cat="${c}">` : `<h4>${c}</h4>`)).filter((n) => n >= 0);
      const at = later.length ? lineStart(day, Math.min(...later)) : day.length;
      day = day.slice(0, at) + groupHtml(cat, values) + day.slice(at);
    }
  }
  return { s: html.slice(0, found.index) + day + html.slice(end), changed: true };
}

module.exports = { categories, mergeChangelog };
