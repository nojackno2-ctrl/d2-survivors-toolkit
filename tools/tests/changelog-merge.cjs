"use strict";
const assert = require("node:assert/strict");
const { mergeChangelog } = require("../../verify/changelog.cjs");

for (const format of ["site", "editor"]) {
  const old = format === "site"
    ? '<div class="log"><article class="log-entry" data-date="2026-11-10"><h3 class="log-date">2026-11-10</h3></article></div>'
    : '<div class="page" id="changelog"><section><h2>更新日誌</h2><h3>2026-11-10</h3></section></div>';
  const options = { format, date: "2026-11-11", build: "123", auto: "相容性：相容官方遊戲 123。", items: ["中文化：譯文", "自訂文字"] };
  const first = mergeChangelog(old, options);
  assert.equal(first.changed, true);
  assert.ok(first.s.indexOf("2026-11-11") < first.s.indexOf("2026-11-10"));
  assert.ok(first.s.includes("<li>譯文</li>"));
  assert.ok(first.s.includes("<li>自訂文字</li>"));
  assert.equal(mergeChangelog(first.s, options).changed, false);
  const second = mergeChangelog(first.s, { ...options, items: ["中文化：新譯文", "修改器：新功能"] });
  assert.ok(second.s.includes("<li>新譯文</li>"));
  assert.ok(second.s.indexOf("修改器") < second.s.indexOf("中文化"));
  assert.equal((second.s.match(/官方遊戲 123/g) || []).length, 1);
  assert.equal(mergeChangelog(second.s, { ...options, items: ["中文化：新譯文", "修改器：新功能"] }).changed, false);
}
for (const format of ["site", "editor"]) {
  const old = format === "editor"
    ? '<div class="page" id="changelog">\n  <section>\n    <h3>2026-10-31</h3>\n    <h4>中文化</h4>\n    <ul>\n      <li>原項目</li>\n    </ul>\n  </section>\n</div>\n'
    : '<div class="log">\n        <article class="log-entry" data-date="2026-10-31">\n          <h3 class="log-date">2026-10-31</h3>\n          <section class="log-group" data-cat="中文化">\n            <h4 class="log-cat">中文化</h4>\n            <ul>\n              <li>原項目</li>\n            </ul>\n          </section>\n        </article>\n      </div>\n';
  const options = { format, date: "2026-10-31", build: "A&B", auto: "相容性：針對官方遊戲 A&B。", items: ["中文化：A&B <測試>", "修改器：新項目"] };
  const result = mergeChangelog(old, options);
  assert.ok(result.s.includes(format === "editor" ? '      <li>原項目</li>\n      <li>A&amp;B &lt;測試&gt;</li>\n    </ul>' : '              <li>原項目</li>\n              <li>A&amp;B &lt;測試&gt;</li>\n            </ul>'));
  assert.ok(!/^.*[ \t]+$/m.test(result.s));
  assert.equal(mergeChangelog(result.s, options).changed, false);
  assert.ok(result.s.includes(format === "editor" ? '    </ul>\n  </section>\n</div>' : '          </section>\n        </article>\n      </div>'));
}
assert.throws(() => mergeChangelog('<div class="log"><div class="log-entry"><div class="log-date">2026-11-11</div></div></div>', { format: "site", date: "2026-11-11", build: "123", auto: "相容性：官方遊戲 123" }), /尚未轉為分類格式/);
console.log("更新日誌合併測試通過：兩種標記、新日期、既有與新分類、排序及重跑去重。");
