// 段 3 规则 9 T371（台账 R-002 写着「测试要写」的那条）：冲锋关计时。36 秒 3 槽、36.1 秒 2 槽、48.1 秒 1 槽、60 秒整还算赢、超过算输（模拟微信开机）。用法：node test/rush_timer.js
const { ok, t, done } = require('./rules_lib.js');
const EC = require('../js/economy.js'), PLV = require('../js/petlevels.js');
const { boot } = require('./wx-env.js');
t('T371', () => {
  const st = PLV[6], win = (sec) => EC.slotsOf(st, { won: true, moves: 24, sec, revives: 0, lent: false });
  ok(st.rush && st.rush.t3 === 36 && st.rush.t2 === 48 && st.rush.lose === 60 && PLV[15].rush.t3 === 40 && PLV[15].rush.t2 === 54 && PLV[15].rush.lose === 68, 'T371 秒数线没动：第 7 关 36 / 48 / 60，第 16 关 40 / 54 / 68');
  ok([36, 36.1, 48, 48.1, 60].map(win).join() === '3,2,2,1,1', 'T371 36 秒 3 槽、36.1 秒 2 槽、48 秒 2 槽、48.1 秒 1 槽、60 秒整赢了 1 槽');
  const save = JSON.stringify({ ch1new: 1, econ: 2, petTutDone: true, tutorialDone: true, petStage: 8, pets: { tongque: { lv: 2, exp: 0 } }, petOrder: ['tongque'], activePet: 'tongque', petSeen: { tongque: true }, introSeen: { rush: 1, pet: 1, catch: 1, crawl: 1 }, cutSeen: { chapter0: true } });
  const at = (ms) => { const E = boot({ seed: 3, store: { luoshu_save_v1: save } }), { G, run } = E; G.newPetLevel(6); run(3); G.skipCuts(); G.mode = 'play'; run(3); G.g.rushT0 = Date.now() - ms + 16; run(1); /* 下一帧时钟走 16 毫秒：那一帧正好是 ms */ const r = { over: G.g.over, reason: G.g.reason }; E.restore(); return r; };
  const a = at(60000), b = at(60200);
  ok(!a.over, 'T371 香烧到 60 秒整：还在打（还算没超）');
  ok(b.over && b.reason === 'time', 'T371 超过 60 秒：输（' + b.reason + '）');
});
done();
