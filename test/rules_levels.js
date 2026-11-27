// 段 1 规则 10：升级表、名字、老存档（规则细设计第三节 T107–T110）。用法：node test/rules_levels.js
const fs = require('fs'), path = require('path');
const { PG, ok, t, done } = require('./rules_lib.js');
const BASE = ['tongque', 'baozhu', 'modou', 'shizi', 'lvgui'];
// 细设计第二节的表；绿龟那一行照 Cc 段 1 定（一颗水珠永远转 1 块，只涨表盘）
const DOC = {
  tongque: { n: [1, 1, 1, 2, 2, 2, 3, 3, 3, 3], ring: [8, 7, 6, 6, 6, 5, 5, 4, 3, 3] },
  baozhu: { n: [1, 1, 1, 2, 2, 2, 3, 3, 3, 3], ring: [8, 7, 6, 6, 6, 5, 5, 4, 3, 3] },
  modou: { n: [1, 1, 1, 2, 2, 2, 3, 3, 3, 3], ring: [9, 8, 7, 7, 7, 6, 6, 5, 4, 4] },
  shizi: { n: [1, 1, 1, 1, 1, 2, 2, 3, 3, 3], ring: [10, 9, 8, 7, 7, 7, 6, 6, 5, 5] },
  lvgui: { n: [1, 1, 1, 1, 1, 1, 1, 1, 1, 1], ring: [10, 9, 8, 7, 7, 6, 5, 4, 3, 3] },
};

t('T107', () => {
  const bad = [];
  for (const id of BASE) for (let lv = 1; lv < 10; lv++) {
    const dn = PG.skillN(id, lv + 1) !== PG.skillN(id, lv), dr = PG.ringOf(id, lv + 1) !== PG.ringOf(id, lv), gain = PG.petGain(id, lv);
    const evo = lv + 1 === PG.EVO_LV || lv + 1 === PG.ULT_LV;
    const ok1 = evo ? !dn && !dr && gain === (lv + 1 === 5 ? 'evo' : 'ult') : dn + dr === 1 && gain === (dn ? 'n' : 'ring');
    if (!ok1) bad.push(id + ' ' + lv + '→' + (lv + 1));
  }
  ok(!bad.length, 'T107 五只宠物逐级比：每一级恰好变一样，5、10 级数字不变（petGain 说得出变的是哪样；不对的：' + (bad.join('、') || '没有') + '）');
});
t('T108', () => {
  const bad = [];
  for (const id of BASE) for (let lv = 1; lv <= 10; lv++) { if (PG.skillN(id, lv) !== DOC[id].n[lv - 1] || PG.ringOf(id, lv) !== DOC[id].ring[lv - 1]) bad.push(id + lv); }
  // 长大版读同一张表
  for (const [evo, base] of Object.entries(PG.BASE_OF)) for (let lv = 5; lv <= 10; lv++) if (PG.ringOf(evo, lv) !== PG.ringOf(base, lv) || PG.skillN(evo, lv) !== PG.skillN(base, lv)) bad.push(evo + lv);
  ok(!bad.length, 'T108 五只宠物的表和细设计第二节逐格一样（龟照 Cc 段 1 定）；不对的：' + (bad.join('、') || '没有'));
});
t('T109', () => {
  const names = BASE.map((id) => [PG.PETS[id].name, PG.PETS[PG.PETS[id].evo] && PG.PETS[PG.PETS[id].evo].name]);
  const want = [['铜雀', '金凤凰'], ['爆竹鼠', '鼠王'], ['墨斗蚕', '蝴蝶'], ['小狮子', '麒麟'], ['绿龟', '大龟']];
  ok(JSON.stringify(names) === JSON.stringify(want), 'T109 五只宠物各有小时候、长大两个名字：' + names.map((x) => x.join(' → ')).join('，'));
  const js = fs.readdirSync(path.join(__dirname, '..', 'js')).filter((f) => f.endsWith('.js')).filter((f) => /金翅雀/.test(fs.readFileSync(path.join(__dirname, '..', 'js', f), 'utf8')));
  ok(!js.length, 'T109 js/ 里搜不到「金翅雀」（' + (js.join('、') || '没有') + '）');
});
t('T110', () => {
  // 0.9.24 样子的存档：铜雀 5 级（已经进化成 jinchique）、爆竹鼠 3 级，外加一只老的 qilin（那时 1 级就叫火麒麟）2 级
  const { boot } = require('./wx-env.js');
  const old = { ch1new: 1, petTutDone: true, tutorialDone: true, petStage: 12, pets: { jinchique: { lv: 5, exp: 3 }, baozhu: { lv: 3, exp: 1 }, qilin: { lv: 2, exp: 0 } }, petOrder: ['jinchique', 'baozhu', 'qilin'], activePet: 'qilin', dan: 7, cutSeen: { chapter0: true, chapter1: true, chapter2: true } };
  const E = boot({ seed: 3, store: { luoshu_save_v1: JSON.stringify(old) } }), { G, run } = E;
  run(10);
  const p = G.save.pets;
  ok(p.jinchique && p.jinchique.lv === 5 && p.baozhu && p.baozhu.lv === 3 && p.shizi && p.shizi.lv === 2 && !p.qilin && G.save.activePet === 'shizi', 'T110 老存档读进来：等级不变（金凤凰 5、爆竹鼠 3），老的 qilin 2 级改成小狮子 2 级');
  G.save.activePet = 'jinchique'; G.newPetLevel(12); run(20);
  const g = G.g, pt = g && g.team[0];
  ok(pt && pt.id === 'jinchique' && pt.lv === 5 && PG.energyMax(g, pt) === 6 && PG.skillN(pt.id, pt.lv) === 2 && !E.errs().length, 'T110 带金凤凰 5 级进关：本事照新表（表盘 6 格、啄 2 格），不报错' + (E.errs().length ? '：' + E.errs()[0] : ''));
});

done();
