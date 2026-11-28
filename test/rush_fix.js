// 段 3 规则 9 T370（台账 R-001 写着「测试要写」的那条）：五只宠物各带进第 7、16 关，每放一块，规则层报的修法是它自己的
// （啄 peck / 啃 gnaw / 补 silk / 烧 fire / 转 turn），修完手上每一块都有地方放、一放就消。用法：node test/rush_fix.js
const { PG, ok, t, done } = require('./rules_lib.js');
const PLV = require('../js/petlevels.js');
const WANT = { tongque: 'peck', baozhu: 'gnaw', modou: 'silk', huli: 'fire', lvgui: 'turn' };
t('T370', () => {
  for (const li of PLV.map((st, i) => (st.rush ? i : -1)).filter((i) => i >= 0)) {
    const kinds = {}, bad = []; let placed = 0;
    for (const pet of Object.keys(WANT)) for (let s = 0; s < 6; s++) {
      const g = PG.createPetGame({ stage: PLV[li], team: [{ id: pet, lv: 1 }], seed: 700 + s * 13 }), seen = [g.rushFixStart];
      for (let n = 0; n < 40 && !g.over; n++) {
        const i = [0, 1, 2].find((j) => g.hand[j] && g.rushGap[j]); if (i === undefined) { bad.push(pet + ' 没有空'); break; }
        const at = g.rushGap[i], ev = g.place(i, at.r, at.c); if (!ev) { bad.push(pet + ' 塞不进'); break; }
        placed++; if (ev.rushFix) seen.push(ev.rushFix);
        if (!g.over && g.rushStuck()) bad.push(pet + ' 第 ' + (n + 1) + ' 块以后有块没地方放');
      }
      seen.filter(Boolean).forEach((f) => { kinds[pet] = kinds[pet] || new Set(); kinds[pet].add(f.kind); if (f.pet !== pet) bad.push(pet + ' 报成了 ' + f.pet); });
      if (!g.won) bad.push(pet + ' 没塞完');
    }
    const wrong = Object.keys(WANT).filter((p) => !kinds[p] || !kinds[p].has(WANT[p]) || [...kinds[p]].some((k) => k !== WANT[p] && !(p !== 'baozhu' && k === 'peck')));
    ok(!wrong.length, 'T370 第 ' + (li + 1) + ' 关：五只的修法是各自的（' + Object.keys(WANT).map((p) => p + ' ' + [...(kinds[p] || [])].join('/')).join('，') + '）' + (wrong.length ? '——不对：' + wrong.join('、') : ''));
    ok(!bad.length, 'T370 第 ' + (li + 1) + ' 关：塞了 ' + placed + ' 块，每次修完手上每一块都有地方放、一放就消，局局塞完（' + (bad.slice(0, 4).join('、') || '没有问题') + '）');
  }
});
done();
