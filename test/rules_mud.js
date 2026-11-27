// 段 1 规则 5：泥巴怪（粘墨怪、头目泥沼怪）不预告吐哪块，吐上去的泥落盘是普通块（规则细设计第三节 T60–T68）。用法：node test/rules_mud.js
const fs = require('fs'), path = require('path');
const { PG, CELL, P, ok, t, done, mk, K, giveSkill } = require('./rules_lib.js');
const anyGlare = (ev) => !!(ev && (ev.mudGlare || ev.glare));
// 手上三块都是放得下的小块，盘上一只粘墨怪
const hand3 = () => ['1', '2h', '2v'];

t('T60', () => {
  const g = mk({ 4: '....N....' }, { hand: hand3() });
  const m = g.mon[K(4, 4)], cds = []; let glare = false;
  for (let n = 0; n < 3; n++) { const i = [0, 1, 2].find((j) => g.hand[j]); const ev = g.place(i, 0, n * 3); glare = glare || anyGlare(ev); cds.push(g.mon.find((x) => x && x.t === 'sticky').cd); }
  ok(!glare && cds.join(',') === '3,2,1', 'T60 连放 3 块：没有「瞪」的事件，倒数依次是 ' + cds.join('、') + '（要 3、2、1）');
  ok(typeof PG.createPetGame === 'function' && m.t === 'sticky', 'T60（前提）是粘墨怪');
});
t('T61', () => {
  const g = mk({ 4: '....N....' }, { hand: ['1', '1', '1'] });
  g.mon[K(4, 4)].cd = 1; // 这一手就该吐
  g.hand[0] = P['1']; g.hand[1] = P['2h']; g.hand[2] = P['2v'];
  const ev = g.place(0, 0, 0);
  const sp = ev && ev.mudSpit && ev.mudSpit[0];
  const m = g.mon.find((x) => x && x.t === 'sticky');
  ok(!!sp && g.hand[sp.slot] && g.hand[sp.slot].mud !== undefined, 'T61 第 4 块放下：手上某一块多一格泥，事件里写明是第 ' + (sp ? sp.slot : '?') + ' 块');
  ok(m && m.cd === 4, 'T61 倒数回到 4（现在 ' + (m && m.cd) + '）');
});
t('T62', () => {
  const hit = new Set();
  for (let seed = 1; seed <= 50; seed++) {
    const g = mk({ 4: '....N....' }, { hand: ['1', '2h', '2v'], seed });
    g.mon[K(4, 4)].cd = 1;
    g.hand = [P['3h'], P['2h'], P['2v'], null, P['1']].slice(0, 4); g.hand[3] = null;
    const extra = P['1'];
    // 先放一块别的：把第 0 格换成要放的单格，另外两块留在手上
    g.hand[0] = extra; g.hand[1] = P['2h']; g.hand[2] = P['3v'];
    const ev = g.place(0, 0, 0);
    if (ev && ev.mudSpit) hit.add(ev.mudSpit[0].slot);
  }
  ok(hit.has(1) && hit.has(2), 'T62 同一局面换 50 个种子：剩下的两块都被吐到过（吐到的：' + [...hit].join('、') + '）');
  // 三块都在手上时（刚发完牌那一手）三块都能被挑到
  const hit3 = new Set();
  for (let seed = 1; seed <= 50; seed++) {
    const g = mk({ 4: '....N....' }, { hand: ['1'], seed });
    g.mon[K(4, 4)].cd = 1;
    const ev = g.place(0, 0, 0); // 放完最后一块：先发新三块，再吐
    if (ev && ev.mudSpit) hit3.add(ev.mudSpit[0].slot);
  }
  ok(hit3.size === 3, 'T62 新发的三块：三块都被挑到过（' + [...hit3].sort().join('、') + '），说明不是固定的');
});
t('T63', () => {
  const g = mk({ 4: '....N....' }, { hand: ['1', '2h', '2v'] });
  g.mon[K(4, 4)].cd = 1;
  g.hand = g.hand.map((p) => (p ? Object.assign({}, p, { mud: 0, mudded: true }) : p));
  g.hand[0] = P['1'];
  g.hand[1] = Object.assign({}, P['2h'], { mud: 1, mudded: true }); g.hand[2] = Object.assign({}, P['2v'], { mud: 1, mudded: true });
  // 第 0 块放掉，剩下两块都沾过泥
  const ev = g.place(0, 0, 0);
  const m = g.mon.find((x) => x && x.t === 'sticky');
  ok(ev && !ev.mudSpit && (ev.mudSkip || []).length === 1 && m.cd === 4, 'T63 手上的块都沾过泥：不吐（ev.mudSkip），倒数回到 4');
});
t('T64', () => {
  const g = mk({ 4: '....N....' }, { hand: ['1'] });
  g.mon[K(4, 4)].cd = 1;
  const ev = g.place(0, 0, 0);
  const sp = ev && ev.mudSpit && ev.mudSpit[0];
  ok(!!sp && g.hand.slice(0, 3).filter(Boolean).length === 3 && g.hand[sp.slot].mud !== undefined, 'T64 轮到吐的那一手正好放完最后一块：先发新三块，泥落在新块之一上');
});
t('T65', () => {
  const g = mk({ 4: '#######..' }, { hand: [Object.assign({}, P['2h'], { id: '2h+', mud: 1, mudded: true })] });
  const ev = g.place(0, 4, 7);
  ok(ev && ev.units.includes(4), 'T65 带泥的块放下把那一排补满：整排照常消');
  const g2 = mk({}, { hand: [Object.assign({}, P['2h'], { id: '2h+', mud: 1, mudded: true })] });
  g2.place(0, 0, 0);
  ok(g2.board[K(0, 1)] === CELL.BLOCK && g2.color[K(0, 1)] === -3 && g2.color[K(0, 0)] !== -3, 'T65 泥那一格落盘：普通块，带泥的记号（颜色 -3）');
});
t('T66', () => {
  const g = mk({ 4: '...@#....' }, { team: [{ id: 'tongque', lv: 4 }], hand: ['1'] });
  giveSkill(g, { n: 2 });
  const ev = g.useSkill({ r: 4, c: 4 });
  ok(ev && g.board[K(4, 3)] === CELL.EMPTY && g.board[K(4, 4)] === CELL.EMPTY, 'T66 铜雀啄 2 格、落在泥巴格旁边的普通块上：泥巴格算普通块，一起被啄');
});
t('T67', () => {
  const g = mk({ 3: '...KK....', 4: '...KK....' }, { hand: ['1', '1', '1'], stage: { bossMud: true, bigHp: 10 } });
  const at = []; let glare = false;
  for (let n = 1; n <= 6; n++) {
    if (!g.hand.slice(0, 3).some(Boolean)) break;
    const i = [0, 1, 2].find((j) => g.hand[j]); const p = g.hand[i];
    const spot = [...Array(81).keys()].find((k) => Math.floor(k / 9) >= 6 && g.board[k] === 0 && (k % 9) + p.w <= 9 && Math.floor(k / 9) + p.h <= 9 && p.cells.every(([a, b]) => g.board[k + a * 9 + b] === 0));
    const ev = g.place(i, Math.floor(spot / 9), spot % 9);
    glare = glare || anyGlare(ev);
    if (ev && ev.mudSpit) at.push(n);
  }
  ok(!glare && at.join(',') === '3,6', 'T67 泥沼怪每 3 手吐一次、没有瞪（吐在第 ' + at.join('、') + ' 手）');
});
t('T68', () => {
  const bad = ['petgame.js', 'core.js'].filter((f) => /glare/i.test(fs.readFileSync(path.join(__dirname, '..', 'js', f), 'utf8')));
  ok(!bad.length, 'T68 规则文件里搜不到 glare（' + (bad.join('、') || '没有') + '）');
});
t('啃掉泥', () => {
  // 规则 5 边界：爆竹鼠啃掉泥 → 那块变回原样，并带上小爆竹
  const g = mk({}, { team: [{ id: 'baozhu', lv: 1 }], hand: [Object.assign({}, P['2h'], { id: '2h+', mud: 1, mudded: true })] });
  giveSkill(g);
  const ev = g.useSkill({ hand: 0, cell: 1 });
  ok(ev && g.hand[0] && g.hand[0].cells.length === 1 && g.hand[0].mud === undefined && g.hand[0].gnawed, '爆竹鼠啃掉泥那格：泥没了、带爆竹、算一口');
});

done();
