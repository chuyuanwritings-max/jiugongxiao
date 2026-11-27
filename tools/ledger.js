// 读《九宫消_需求台账_1.0.md》里的表格，数各状态、各段的条数，查非法状态和重复编号。
// 用法：node tools/ledger.js [台账路径]      有非法状态或重复编号时退出码 1。
const fs = require('fs');
const path = require('path');

const file = process.argv[2] || path.join(__dirname, '..', '..', '九宫消_需求台账_1.0.md');
const STATUS = ['待 Cc 定', '已定待做', '在做', '已做待验', 'Cc 已验'];
const OBSOLETE = /^作废（被 R-\d{3,} 取代）$/;

const lines = fs.readFileSync(file, 'utf8').split('\n').filter((l) => /^\|\s*R-/.test(l));
const rows = lines.map((l) => {
  const c = l.split('|').slice(1, -1).map((s) => s.trim());
  return { id: c[0], status: c[3], phase: c[4], cells: c.length };
});

const byStatus = {};
const byPhase = {};
const bad = [];
const seen = {};
const dup = [];
const ids = new Set(rows.map((r) => r.id));

for (const r of rows) {
  const key = OBSOLETE.test(r.status) ? '作废（被 R-xxx 取代）' : r.status;
  byStatus[key] = (byStatus[key] || 0) + 1;
  byPhase[r.phase] = (byPhase[r.phase] || 0) + 1;
  let ok = STATUS.includes(r.status) || OBSOLETE.test(r.status);
  if (OBSOLETE.test(r.status)) {
    const target = r.status.match(/R-\d+/)[0];
    if (!ids.has(target)) ok = false;
    if (target === r.id) ok = false;
  }
  if (!ok) bad.push(r);
  if (r.cells !== 8) bad.push(Object.assign({}, r, { status: r.status + '（列数不是 8）' }));
  if (seen[r.id]) dup.push(r.id);
  seen[r.id] = true;
}

console.log('台账：' + file);
console.log('总行数：' + rows.length);
console.log('\n各状态条数：');
for (const s of STATUS.concat(['作废（被 R-xxx 取代）'])) console.log('  ' + s + '：' + (byStatus[s] || 0));
console.log('\n各段条数（段 0–8，见《下一版更新计划》）：');
for (let p = 0; p <= 8; p++) console.log('  段 ' + p + '：' + (byPhase[p] || 0));
for (const p of Object.keys(byPhase)) if (!/^[0-8]$/.test(p)) console.log('  非法段「' + p + '」：' + byPhase[p]);

console.log('\n状态不合法的行：' + (bad.length ? '' : '无'));
for (const r of bad) console.log('  ' + r.id + ' 状态=「' + r.status + '」');
console.log('重复的编号：' + (dup.length ? dup.join('、') : '无'));

const badPhase = Object.keys(byPhase).filter((p) => !/^[0-8]$/.test(p));
process.exit(bad.length || dup.length || badPhase.length ? 1 : 0);
