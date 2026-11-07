const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const data = new Map();
let calls = 0, fail = false, corrupt = false, listener;
const localStorage = {
  getItem: k => corrupt && k === 'd2edit:backup:softcore' ? '錯誤' : data.get(k) ?? null,
  setItem: (k, v) => { calls++; if (fail) throw Error('空間不足'); data.set(k, v); },
  removeItem: k => data.delete(k),
};
const parent = { postMessage: m => queueMicrotask(() => listener({ origin: 'https://d2survivors.lol', data: { d2edit: 'reply', id: m.id, result: m.fn === 'load' ? { save: { version: 6, gold: 42 }, seal: 'sealed' } : { ok: true } } })) };
const window = { parent, addEventListener: (_, cb) => { listener = cb; } };
vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../webapi.js'), 'utf8'), { window, localStorage, location: { search: '' }, URLSearchParams, Date, JSON, Map, Object, Number, String, Promise });
(async () => {
  const key = 'd2edit:backup:softcore', file = '寫入前備份_一般.json';
  data.set(key, JSON.stringify({ version: 6, gold: 12 })); data.set(key + ':time', '123'); data.set(key + ':seal', 'broken');
  let list = await window.api.listBackups();
  assert.equal(list[0].gold, 12); assert.equal(list[0].time, 123); assert.equal(list[0].seal, 'broken');
  assert.equal((await window.api.readBackup(file)).save.gold, 12);
  assert.equal((await window.api.save('softcore', {})).ok, true); assert.equal(calls, 1);
  list = await window.api.listBackups(); assert.equal(list[0].gold, 42); assert.equal(list[0].seal, 'sealed'); assert.ok(list[0].time > 123);
  assert.equal((await window.api.readBackup(file)).save.gold, 42);
  const prior = data.get(key); fail = true; assert.match((await window.api.save('softcore', {})).error, /取消寫入/); assert.equal(data.get(key), prior);
  fail = false; corrupt = true; assert.match((await window.api.save('softcore', {})).error, /讀回不一致/);
  console.log('備份新舊格式、單次寫入與讀回驗證通過');
})().catch(e => { console.error(e); process.exitCode = 1; });
