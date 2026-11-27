// 拍照留底（0.9.25 收拾第 1 步，Fable 代码体检）：机器人用固定发牌打前 20 关，每一手之后的盘面、手牌、目标都算进指纹。
// 收拾代码（不该改玩法）的每一步都要跑 check，指纹一模一样才算没改坏。改玩法的那一段结束后再 save 一份新的。
// 用法：node tools/baseline.js save | check
const fs = require('fs'), path = require('path'), crypto = require('crypto');
const PG = require('../js/petgame.js'), PLV = require('../js/petlevels.js'), core = require('../js/core.js');
const FILE = path.join(__dirname, '..', 'test', 'baseline', 'engine.json');
function runOne(li, seed, pet) {
  const team = pet ? [{ id: pet, lv: 3 }] : [];
  const g = PG.createPetGame({ stage: PLV[li], team, seed });
  const h = crypto.createHash('sha1');
  const snap = () => h.update(JSON.stringify([g.board, g.hand.map((p) => (p ? p.id + (p.mud !== undefined ? 'm' + p.mud : '') : '-')), core.goalLeft(g), g.over, g.won]));
  snap();
  let guard = 0;
  while (!g.over && guard++ < 300) {
    if (PG.useSkillIfGood(g)) { snap(); continue; }
    const m = PG.bestMove(g, 1);
    if (!m) { if (g.hand[3]) { const s = PG.skillBest && PG.skillBest(g); if (s && g.useSkill(s)) { snap(); continue; } } break; }
    g.place(m.i, m.r, m.c); snap();
  }
  return { hash: h.digest('hex').slice(0, 16), moves: g.moves, won: !!g.won };
}
const out = {};
for (let li = 0; li < PLV.length; li++) for (const seed of [11, 22, 33]) for (const pet of li === 0 ? [null] : li < 10 ? ['tongque'] : ['tongque', 'baozhu']) out[(li + 1) + '/' + seed + '/' + (pet || '-')] = runOne(li, seed, pet);
const mode = process.argv[2] || 'check';
if (mode === 'save') { fs.writeFileSync(FILE, JSON.stringify(out, null, 1)); console.log('留底存好：' + Object.keys(out).length + ' 局'); process.exit(0); }
const old = JSON.parse(fs.readFileSync(FILE, 'utf8'));
const diff = Object.keys(out).filter((k) => !old[k] || old[k].hash !== out[k].hash);
if (diff.length) { console.log('✗ 留底对不上 ' + diff.length + ' 局：' + diff.slice(0, 8).map((k) => k + '（' + (old[k] ? old[k].moves + '手→' + out[k].moves + '手' : '新') + '）').join('、')); process.exit(1); }
console.log('✓ 留底对得上：' + Object.keys(out).length + ' 局，每一手都一样');
