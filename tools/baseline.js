// 拍照留底（0.9.25 收拾第 1 步，Fable 代码体检）：机器人用固定发牌打前 20 关，每一手之后的盘面、手牌、目标都算进指纹。
// 收拾代码（不该改玩法）的每一步都要跑 check，指纹一模一样才算没改坏。改玩法的那一段结束后再 save 一份新的。
// 段 1 第 12 步（规则细设计附录 D 丁）：五只宠物都带，等级照 A3 的给法（打到这一关大概几级；第 11 关起丹对半分）
// 冲锋关（第 7、16 关）的段 0 指纹另由 test/rules_obstacle.js 的 T16 守着
// 用法：node tools/baseline.js save | check
const fs = require('fs'), path = require('path'), crypto = require('crypto');
const PG = require('../js/petgame.js'), PLV = require('../js/petlevels.js'), core = require('../js/core.js');
const FILE = path.join(__dirname, '..', 'test', 'baseline', 'engine.json');
const PETS5 = ['tongque', 'baozhu', 'modou', 'huli', 'lvgui'];
// 段 2 第 1 步（丹细设计附录 A）：等级表写死。原来照旧丹价 4/6/6/8… 和关卡表里的 st.dan 现算，段 2 换丹价、删 st.dan 以后机器人带的等级会变、指纹全变。
// 这就是换之前算出来的值（打印核对过）；段 3 重拍留底时再换成 economy.lvAt
// 段 3 换关卡表时照约好的换成 economy.lvAt（专心养一只的普通人打到这一关大概几级）
const LV_AT = require('../js/economy.js').lvAt(PLV, 'focus');
function runOne(li, seed, pet) {
  const lv = LV_AT[li], id = pet && lv >= PG.EVO_LV ? PG.PETS[pet].evo : pet;
  const team = pet ? [{ id, lv }] : [];
  const g = PG.createPetGame({ stage: PLV[li], team, seed });
  g.openingAct(); // 段 3 规则 4：开局先演一次（和 simulate 一样；没写 firstAct 的关什么都不做）
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
for (let li = 0; li < PLV.length; li++) for (const seed of [11, 22, 33]) for (const pet of li === 0 ? [null] : PETS5) out[(li + 1) + '/' + seed + '/' + (pet || '-')] = runOne(li, seed, pet);
const mode = process.argv[2] || 'check';
if (mode === 'save') { fs.writeFileSync(FILE, JSON.stringify(out, null, 1)); console.log('留底存好：' + Object.keys(out).length + ' 局'); process.exit(0); }
const old = JSON.parse(fs.readFileSync(FILE, 'utf8'));
const diff = Object.keys(out).filter((k) => !old[k] || old[k].hash !== out[k].hash);
if (diff.length) { console.log('✗ 留底对不上 ' + diff.length + ' 局：' + diff.slice(0, 8).map((k) => k + '（' + (old[k] ? old[k].moves + '手→' + out[k].moves + '手' : '新') + '）').join('、')); process.exit(1); }
console.log('✓ 留底对得上：' + Object.keys(out).length + ' 局，每一手都一样');
