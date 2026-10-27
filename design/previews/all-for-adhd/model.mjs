export const TODAY = '2026-10-27';
export const NOW = '10:40';
export const navigation = [
  ['now', '今日', 'sun'], ['plan', 'カレンダー', 'calendar-days'],
  ['all', 'タスク', 'list-todo'], ['guild', 'ギルド', 'users'], ['settings', '設定'],
];
const task = (id, title, rest = {}) => ({
  id, title, icon: '', next: '', notes: '', criteria: '', due: '', date: TODAY, time: '', minutes: 0,
  owner: 'self', state: 'ready', done: false, archived: false, kind: 'todo', ...rest,
});
export function fixture(scenario = 'normal') {
  if (scenario === 'empty') return [];
  const tasks = [
    task('mail', '朝のメールを確認する', { icon: '📨', time: '09:00', minutes: 15, done: true }),
    task('week', '今週のゴールを書き出す', { icon: '📝', time: '09:30', minutes: 20, done: true }),
    task('focus', 'Guilduoのモバイル体験を整える', { icon: '📐', time: '10:30', minutes: 45,
      next: '今日の画面で、最初に使う操作を3つ並べる。',
      notes: '片手で使う場面と、PCでじっくり考える場面を分けて考える。',
      criteria: 'スマホで優先する3つの操作が決まり、画面案で確かめられる。',
      steps: [{ title: '最初に使う操作を3つ並べる', done: false }, { title: '画面に置いて見比べる', done: false }],
    }),
    task('review', '画面案を見比べる', { time: '13:00', minutes: 30, next: 'ライトとダークを同じ大きさで並べる。' }),
    task('walk', '外を歩いて、ひと息つく', { icon: '🌿', time: '15:00', minutes: 20 }),
    task('desk', '机を5分片づける', { kind: 'daily', icon: '☕', minutes: 5, done: true, lastCompleted: '2026-10-26' }),
    task('read', '読みたい記事をメモする', { minutes: 10 }),
    task('inbox', '来月やってみたいことを集める', { date: '', minutes: 15, icon: '💭' }),
    task('future', '公開ページの文章を見直す', { date: '2026-10-28', time: '11:00', minutes: 30 }),
    task('monday-plan', '今週の進め方を整理する', { date: '2026-10-26', time: '09:00', minutes: 60, done: true, icon: '📝' }),
    task('monday-build', '画面のたたき台をつくる', { date: '2026-10-26', time: '11:00', minutes: 90, done: true, icon: '📐' }),
    task('thursday', '来週の予定を相談する', { date: '2026-10-29', time: '14:00', minutes: 60, icon: '🗓️' }),
    task('friday', '週末に行きたい場所を探す', { date: '2026-10-30', minutes: 20, icon: '🌿' }),
    task('overdue', '素材フォルダを整理する', { date: '2026-10-23', minutes: 20 }),
    task('ai-review', '初回オンボーディングの案', { owner: 'Scarlet', state: 'review', date: '',
      next: '最初の3ステップが分かりやすいか、確認してください。', minutes: 30,
      notes: '1. やることを1つ書く\n2. 今日やるものを選ぶ\n3. 「始める」を押す',
      criteria: '初めて使う人が、説明を読まなくても最初の1件を始められる。' }),
    task('ai-blocked', 'カレンダー連携の仕様', { owner: 'Cyan', state: 'blocked', date: '', next: '取り込む予定の範囲について判断を待っています。' }),
    task('ai-working', 'スマホの操作フローを検証', { owner: 'Cyan', state: 'working', date: '', next: '小さい画面でも最後の操作まで届くかを確認しています。' }),
    task('ai-waiting', 'READMEの更新案をつくる', { owner: 'Scarlet', state: 'ready', date: '' }),
    task('ai-finished', '見出しの表記を揃える', { owner: 'Cyan', state: 'working', done: true, archived: true, date: '' }),
  ];
  if (scenario === 'long') {
    tasks.find(t => t.id === 'focus').title = '初めて使う人も迷わず今日の予定を組み直せるように、スマートフォンとデスクトップの操作を見比べて改善する';
    tasks.find(t => t.id === 'focus').next = '先週の利用メモを開き、移動中に片手で使った場面と、机で集中して使った場面から、困った操作をそれぞれ3つ書き出す。';
  }
  if (scenario === 'untimed') for (const t of tasks) if (t.owner === 'self') t.time = '';
  if (scenario === 'running') tasks.find(t => t.id === 'focus').state = 'working';
  if (scenario === 'review') tasks.find(t => t.id === 'ai-working').state = 'review';
  return tasks;
}
export const doneOn = (t, date = TODAY) => t.kind === 'daily' ? t.lastCompleted === date : t.done;
export const openOn = (t, date = TODAY) => !t.archived && !doneOn(t, date);
export const onDay = (t, date = TODAY) => t.kind === 'daily' ? (!t.date || t.date <= date) : t.date === date;
export const todayTasks = tasks => tasks.filter(t => !t.archived && t.owner === 'self' && onDay(t));
export const candidates = tasks => todayTasks(tasks).filter(t => openOn(t)).sort((a, b) =>
  Number(b.state === 'working') - Number(a.state === 'working') || (a.time || '99:99').localeCompare(b.time || '99:99'));
export function focusTask(tasks, selected) {
  const list = candidates(tasks);
  return list.find(t => t.state === 'working') || list.find(t => t.id === selected) || list[0] || null;
}
export function agentSummary(tasks) {
  const active = tasks.filter(t => t.owner !== 'self' && openOn(t));
  return {
    rows: ['review', 'blocked', 'working'].flatMap(state => active.filter(t => t.state === state)).slice(0, 5),
    review: active.filter(t => t.state === 'review').length,
    blocked: active.filter(t => t.state === 'blocked').length,
    working: active.filter(t => t.state === 'working').length,
    waiting: active.filter(t => t.state === 'ready').length,
  };
}
export function duration(minutes) {
  if (!minutes) return '目安なし';
  return minutes < 60 ? `${minutes}分` : `${Math.floor(minutes / 60)}時間${minutes % 60 ? `${minutes % 60}分` : ''}`;
}
export function endTime(t) {
  const [h, m] = t.time.split(':').map(Number);
  const minutes = h * 60 + m + (t.minutes || 15);
  return `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;
}
export function addDays(date, n) {
  const d = new Date(`${date}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10);
}

// Calendar markers and rows share the same day membership, including daily resets.
export function calendarSummary(tasks, date) {
  const items = tasks.filter(t => !t.archived && t.owner === 'self' && onDay(t, date));
  const states = items.map(t => doneOn(t, date) ? 'done' : t.state === 'working' ? 'working' : 'ready');
  const completed = states.filter(s => s === 'done').length;
  const working = states.filter(s => s === 'working').length;
  return { items, states, completed, working,
    label: `${items.length}件、予定${items.length - completed - working}件、作業中${working}件、完了${completed}件` };
}

export function minutesBetween(start, end) {
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(start) || !/^([01]\d|2[0-3]):[0-5]\d$/.test(end)) return 0;
  const minutes = time => Number(time.slice(0, 2)) * 60 + Number(time.slice(3));
  return (minutes(end) - minutes(start) + 1440) % 1440 || 1440;
}

export const clockMinutes = time => Number(time.slice(0, 2)) * 60 + Number(time.slice(3));
export const scheduledEnd = task => clockMinutes(task.time) + (task.minutes || 15);

// Adapted from AFA weekGrid: two lanes, folding excess work into the day view.
export function weekPlacements(items) {
  const clusters = [];
  let laneEnds = [];
  for (const task of items.filter(t => t.time).slice().sort((a, b) => a.time.localeCompare(b.time))) {
    const start = clockMinutes(task.time);
    // Short blocks remain tappable; collision detection uses the same visible extent.
    const end = Math.min(1440, Math.max(start + 30, scheduledEnd(task)));
    let cluster = clusters.at(-1);
    if (!cluster || start >= cluster.end) {
      cluster = {start, end, items: [], lanes: 0}; clusters.push(cluster); laneEnds = [];
    }
    let lane = laneEnds.findIndex(value => value <= start);
    if (lane < 0) lane = laneEnds.length;
    laneEnds[lane] = end;
    cluster.end = Math.max(cluster.end, end);
    cluster.lanes = laneEnds.length;
    cluster.items.push({task, start, end, lane});
  }
  return clusters.flatMap(cluster => {
    const lanes = Math.min(2, cluster.lanes), folded = cluster.lanes > 2;
    const shown = folded ? cluster.items.filter(item => item.lane === 0) : cluster.items;
    return [...shown.map(item => ({...item, lanes})), ...(folded ? [{start: cluster.start, end: cluster.end,
      lane: 1, lanes, hidden: cluster.items.length - shown.length}] : [])];
  });
}

export function timelineSections(items, date = TODAY) {
  const timed = items.filter(t => t.time).slice().sort((a, b) => a.time.localeCompare(b.time));
  const past = date === TODAY ? timed.filter(t => scheduledEnd(t) <= clockMinutes(NOW) && (t.state !== 'working' || doneOn(t, date))) : [];
  return {past, timed: timed.filter(t => !past.includes(t)),
    anytime: items.filter(t => !t.time && !doneOn(t, date)),
    finishedAnytime: items.filter(t => !t.time && doneOn(t, date))};
}
