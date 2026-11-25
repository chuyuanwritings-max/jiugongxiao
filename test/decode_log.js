// 解开试玩记录（0.9.12 起的全流程记录；也认 0.9.6–0.9.11 的老格式）。
// 用法：把测试员发来的那一大段字存成文件，然后
//   node test/decode_log.js 记录.txt [测试员名字]
// 输出：
//   test/real_logs/<名字>_<日期>.md   ← 给人看的：几次打开、玩了多久、歇了几次、每关打几次、在哪停下不玩
//   test/real_log.json                ← 合进去的每关一行，难度表「真人」那一列用（同一人同一关同一时间不重复）
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const NAMES = {
  o: '开游戏', h: '切到后台', s: '回到前台', i: '停手', m: '换页面', b: '点按钮', L: '开一关', E: '一关打完', q: '中途退出',
  p: '拿起', d: '放下', x: '没放成', k: '用技能块', r: '宠物救命', n: '被偷能量', w: '下一波', S: '记一下', X: '出错',
};
const MODES = { home: '主菜单', map: '章页', camp: '营地', play: '关里', over: '结算', settings: '设置', intro: '说明卡', cut: '过场', start: '进关卡片', ad: '广告', album: '画册', share: '分享' };

function decode(text) {
  text = String(text).trim();
  let obj;
  if (text.startsWith('JGX1:')) obj = JSON.parse(zlib.inflateRawSync(Buffer.from(text.slice(5), 'base64')).toString('utf8'));
  else obj = JSON.parse(text.slice(text.indexOf('{')));
  // 时间：每条记的是离上一条几个 0.1 秒；碰到「开游戏」就用它带的绝对时间校准
  const events = [];
  let t = null;
  (obj.ev || []).forEach((e) => {
    const [dt, code, ...data] = e;
    if (code === 'o') t = data[3] * 1000; else if (t !== null) t += dt * 100;
    events.push({ t, code, data });
  });
  return { meta: { game: obj.game, ver: obj.ver, fmt: obj.fmt || 0 }, log: obj.log || [], events };
}

function summarize(d) {
  const ev = d.events, out = [];
  const fmtT = (ms) => (ms === null ? '?' : new Date(ms).toISOString().replace('T', ' ').slice(5, 16));
  const opens = ev.filter((e) => e.code === 'o');
  const away = ev.filter((e) => e.code === 's').map((e) => e.data[0]);
  const idles = ev.filter((e) => e.code === 'i').map((e) => e.data[0]);
  let first = ev.find((e) => e.t !== null), lastE = [...ev].reverse().find((e) => e.t !== null);
  // 实际在玩的时间：总跨度 - 后台时间 - 停手时间
  const span = first && lastE ? (lastE.t - first.t) / 1000 : 0;
  const active = Math.max(0, span - away.reduce((a, b) => a + b, 0) - idles.reduce((a, b) => a + b, 0));
  out.push('# 试玩记录：' + (d.meta.game || '') + ' ' + (d.meta.ver || ''));
  out.push('');
  out.push(`- 一共 ${ev.length} 条操作；打开游戏 ${opens.length} 次；从 ${first ? fmtT(first.t) : '?'} 到 ${lastE ? fmtT(lastE.t) : '?'}（UTC）`);
  out.push(`- 真在玩的时间约 ${Math.round(active / 60)} 分钟；切到后台 ${away.length} 次、共 ${Math.round(away.reduce((a, b) => a + b, 0) / 60)} 分钟；停手超过 10 秒 ${idles.length} 次（最长 ${idles.length ? Math.max(...idles) : 0} 秒）`);
  // 每关
  const lv = {};
  let cur = null;
  ev.forEach((e) => {
    if (e.code === 'L') { cur = String(e.data[0]); (lv[cur] = lv[cur] || { tries: 0, win: 0, lose: 0, quit: 0, moves: [], skills: 0, rescues: 0, deny: 0 }).tries++; }
    const L = cur && lv[cur];
    if (!L) return;
    if (e.code === 'E') { e.data[0] ? L.win++ : L.lose++; L.moves.push(e.data[1]); }
    if (e.code === 'q') L.quit++;
    if (e.code === 'k') L.skills++;
    if (e.code === 'r') L.rescues++;
    if (e.code === 'x') L.deny++;
  });
  out.push('');
  out.push('| 关 | 打了几次 | 赢 | 输 | 中途退出 | 赢的那次几手 | 技能块 | 救命 | 没放成 |');
  out.push('| --- | --- | --- | --- | --- | --- | --- | --- | --- |');
  Object.keys(lv).sort((a, b) => (+a || 999) - (+b || 999)).forEach((k) => {
    const L = lv[k];
    out.push(`| ${k} | ${L.tries} | ${L.win} | ${L.lose} | ${L.quit} | ${L.moves.join('、') || '—'} | ${L.skills} | ${L.rescues} | ${L.deny} |`);
  });
  // 最后停在哪（流失点）
  const tail = ev.slice(-8).map((e) => (NAMES[e.code] || e.code) + (e.code === 'm' ? '→' + (MODES[e.data[0]] || e.data[0]) : e.data.length ? '(' + e.data.join(',') + ')' : ''));
  out.push('');
  out.push('- 最后 8 条（玩家在哪停下）：' + tail.join(' · '));
  // 后台 / 停手发生在哪一页
  let page = '?';
  const breaks = {};
  ev.forEach((e) => { if (e.code === 'm') page = MODES[e.data[0]] || e.data[0]; if (e.code === 'h' || e.code === 'i') breaks[page] = (breaks[page] || 0) + 1; });
  out.push('- 歇下来（切后台或停手）时在哪一页：' + Object.entries(breaks).map(([k, v]) => k + ' ' + v + ' 次').join('、'));
  const errs = ev.filter((e) => e.code === 'X');
  if (errs.length) { out.push(''); out.push('## 出错（' + errs.length + ' 次）——Kira 修 bug 用'); errs.forEach((e) => out.push('- ' + fmtT(e.t) + ' · ' + e.data[0] + ' · 第 ' + e.data[4] + ' 关 · ' + (MODES[e.data[3]] || e.data[3]) + '：' + e.data[1] + (e.data[2] ? '\n  `' + e.data[2] + '`' : ''))); }
  // 「记一下」：测试员点左下角那支笔时的现场（盘面：. 空、0–6 方块颜色、~ 墨块、m 小墨怪、S 甲壳、J 跳跳、E 馋嘴、C 挑色、O 墨苔、K 炸弹、P 分身、B 头目、R 铁石、X 机关匣）
  const snaps = ev.filter((e) => e.code === 'S');
  if (snaps.length) {
    out.push(''); out.push('## 记一下（' + snaps.length + ' 个）');
    snaps.forEach((e, n) => {
      const s = e.data[0] || {};
      out.push(''); out.push(`### ${n + 1}. ${fmtT(e.t)} · ${MODES[s.mode] || s.mode}${s.lv ? ' · 第 ' + s.lv + ' 关 · 第 ' + s.moves + ' 手 · 第 ' + s.wave + ' 波' : ''}`);
      if (s.note) out.push('备注：「' + s.note + '」');
      if (s.board) { out.push('```'); s.board.forEach((r) => out.push(r.split('').join(' '))); out.push('```'); out.push('手上：' + s.hand.join(' ') + ' · 宠物格：' + s.skill + (s.next ? ' · 下一批：' + s.next.join(' ') : '') + ' · ' + (s.pets || []).join('；') + ' · 还差：' + JSON.stringify(s.left)); }
      if (s.save) out.push('存档：到第 ' + s.save.stage + ' 关、丹 ' + s.save.dan + '、' + s.save.pets + (s.save.loss ? '、这关连输 ' + s.save.loss + ' 次' : ''));
    });
  }
  return out.join('\n') + '\n';
}

module.exports = { decode, summarize, NAMES, MODES };

if (require.main === module) {
  const file = process.argv[2];
  if (!file) { console.log('用法：node test/decode_log.js 记录.txt [测试员名字]'); process.exit(1); }
  const who = process.argv[3] || path.basename(file).replace(/\.[^.]+$/, '');
  const d = decode(fs.readFileSync(file, 'utf8'));
  const md = summarize(d);
  const dir = path.join(__dirname, 'real_logs');
  fs.mkdirSync(dir, { recursive: true });
  const outMd = path.join(dir, who + '_' + new Date().toISOString().slice(0, 10) + '.md');
  fs.writeFileSync(outMd, md);
  fs.writeFileSync(path.join(dir, who + '_' + new Date().toISOString().slice(0, 10) + '.json'), JSON.stringify(d));
  // 合进 real_log.json
  const realFile = path.join(__dirname, 'real_log.json');
  const real = fs.existsSync(realFile) ? JSON.parse(fs.readFileSync(realFile, 'utf8')) : [];
  const arr = Array.isArray(real) ? real : real.log || [];
  const seen = new Set(arr.map((r) => [r.who, r.lv, r.t, r.moves].join('|')));
  let added = 0;
  d.log.forEach((r) => { const row = Object.assign({ who }, r); const key = [who, r.lv, r.t, r.moves].join('|'); if (!seen.has(key)) { arr.push(row); seen.add(key); added++; } });
  fs.writeFileSync(realFile, JSON.stringify(arr, null, 1));
  console.log(md);
  console.log('→ ' + outMd + '；real_log.json 新加 ' + added + ' 局（共 ' + arr.length + ' 局）');
}
