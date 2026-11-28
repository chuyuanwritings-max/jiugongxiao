// 过关以后走哪几步（段 3 规则 2，Cc 11-27 定的顺序，全量设计 145 / 台账 R-059）。不碰画面，main.js 照它排过场。
// 「先把这关的结算动画全都做完，干干净净……然后最后进入下一关之前，再跳出来」
// o: { boss: 这关是不是头目, chapterEnd: 是不是这一章最后一关, gift: 这一局新送的宠物编号或 null, first: 是不是第一次过, owned: 送完以后一共几只 }
// 步子：'result' 结算页（只讲这一关）→ 'chapterClear' 打倒头目的过章过场（第一次过）→ 'petEntrance' 新宠物出场 → 'switchTeach' 教换宠物（只有一只的时候没有）→ 'nextCard' 下一关
function flowAfterWin(o) {
  const steps = ['result'];
  if (o.first && o.boss && o.chapterEnd) steps.push('chapterClear');
  if (o.gift) { steps.push('petEntrance'); if (o.owned >= 2) steps.push('switchTeach'); }
  steps.push('nextCard');
  return steps;
}
module.exports = { flowAfterWin };
