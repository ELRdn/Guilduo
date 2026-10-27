import { createElement, Sun, Moon, CalendarDays, ListTodo, Users, Settings, Plus, ChevronRight, ChevronLeft, ArrowRight, Play, Pause, Check, CircleCheck, X, Clock3, SlidersHorizontal, ArrowUpRight, MoreHorizontal, RotateCcw, MessageSquare, Sparkles, Link, Flag, RefreshCw, Search } from 'lucide';
import { parseCapture } from '../../../interaction-lab/all-for-adhd/capture.ts';
import { iconFor } from '../../../interaction-lab/all-for-adhd/emoji.ts';
import { TODAY, NOW, navigation, fixture, doneOn, openOn, onDay, todayTasks, candidates, focusTask, agentSummary, duration, endTime, addDays, calendarSummary, minutesBetween, clockMinutes, scheduledEnd, weekPlacements, timelineSections } from './model.mjs';
const symbols = {
  sun: Sun,
  moon: Moon,
  'calendar-days': CalendarDays,
  'list-todo': ListTodo,
  users: Users,
  settings: Settings,
  plus: Plus,
  'chevron-right': ChevronRight,
  'chevron-left': ChevronLeft,
  'arrow-right': ArrowRight,
  play: Play,
  pause: Pause,
  check: Check,
  'circle-check': CircleCheck,
  x: X,
  clock: Clock3,
  sliders: SlidersHorizontal,
  'arrow-up-right': ArrowUpRight,
  more: MoreHorizontal,
  undo: RotateCcw,
  message: MessageSquare,
  sparkles: Sparkles,
  link: Link,
  flag: Flag,
  refresh: RefreshCw,
  search: Search
};
const icon = name => createElement(symbols[name] || Settings, {
  'stroke-width': 1.7,
  'aria-hidden': 'true'
}).outerHTML;
const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;'
})[c]);
const emoji = t => t.icon ? `<span class="emoji" aria-hidden="true">${esc(t.icon)}</span>` : '';
const statusNames = {
  review: '確認待ち',
  blocked: '止まっています',
  working: '作業中',
  ready: '受け取り待ち'
};
const params = new URLSearchParams(location.search),
  scenarios = [['normal', '通常'], ['long', '長いタイトル'], ['untimed', '時刻なし'], ['review', '確認待ちが複数'], ['running', '作業中'], ['empty', '空の状態']];
let scenario = scenarios.some(([id]) => id === params.get('scenario')) ? params.get('scenario') : 'normal';
let tasks = fixture(scenario),
  view = navigation.some(([id]) => location.hash === `#${id}`) ? location.hash.slice(1) : 'now';
let theme = params.get('theme') === 'dark' ? 'dark' : 'light',
  focusId = null,
  calendarDate = TODAY,
  calendarMode = 'day',
  listMode = 'list',
  search = '';
let notes = '今日の画面で大切にしたいこと\n\n・次に何をするか、考え込まない\n・AIに任せた仕事も見失わない\n・スマホでは片手で終えられる';
let notesDraft = notes;
let cheer = true,
  game = true,
  failSave = false,
  activeDialog = null,
  toastTimer = 0,
  startedAt = scenario === 'running' ? Date.now() - 720000 : 0;
const app = document.querySelector('#app'),
  overlays = document.querySelector('#overlays');
const dateTitle = d => new Intl.DateTimeFormat('ja', {
  month: 'long',
  day: 'numeric',
  timeZone: 'UTC'
}).format(new Date(`${d}T12:00:00Z`));
const weekday = d => new Intl.DateTimeFormat('ja', {
  weekday: 'short',
  timeZone: 'UTC'
}).format(new Date(`${d}T12:00:00Z`));
const find = id => tasks.find(t => t.id === id);
const button = (label, action, cls = '', attrs = '') => `<button type="button" class="btn ${cls}" data-action="${action}" ${attrs}>${label}</button>`;
const ib = (name, label, action, attrs = '') => `<button type="button" class="icon-btn" aria-label="${esc(label)}" data-action="${action}" ${attrs}>${icon(name)}</button>`;
const tb = (label, action, attrs = '') => `<button type="button" class="text-btn" data-action="${action}" ${attrs}>${label}</button>`;
const pill = t => `<span class="pill ${t.state}"><span class="status-dot"></span>${statusNames[t.state]}</span>`;
const title = t => `<button class="row-title" type="button" data-action="detail" data-id="${esc(t.id)}">${emoji(t)}<span>${esc(t.title)}</span></button>`;
const check = (t, d = TODAY) => t.owner === 'self' ? `<button class="check ${doneOn(t, d) ? 'checked' : ''}" type="button" data-action="complete" data-id="${t.id}" ${t.kind === 'daily' && d !== TODAY ? 'disabled title="繰り返しの完了・取消は今日の画面から操作できます"' : ''} aria-label="${esc(t.title)}${doneOn(t, d) ? 'の完了を取り消す' : 'を完了'}">${doneOn(t, d) ? icon('circle-check') : ''}</button>` : ib('arrow-up-right', `${t.title}の詳細`, 'detail', `data-id="${t.id}"`);
function toast(message, undo) {
  clearTimeout(toastTimer);
  const el = document.querySelector('#toast');
  el.innerHTML = `<div class="toast-message"><span>${esc(message)}</span>${undo ? '<button type="button">元に戻す</button>' : ''}</div>`;
  if (undo) el.querySelector('button').onclick = () => {
    undo();
    el.replaceChildren();
    clearTimeout(toastTimer);
    render();
  };
  toastTimer = setTimeout(() => el.replaceChildren(), 5000);
}
function mutate(t, patch, message) {
  const before = structuredClone(t);
  Object.assign(t, patch);
  render();
  toast(message, () => Object.assign(t, before));
}
function go(next) {
  if (!closeDialog()) return;
  view = next;
  search = '';
  history.replaceState(null, '', `${location.pathname}${location.search}#${view}`);
  render();
  window.scrollTo(0, 0);
  document.querySelector('h1')?.focus({
    preventScroll: true
  });
}
function setTheme(next) {
  theme = next;
  const url = new URL(location.href);
  url.searchParams.set('theme', theme);
  history.replaceState(null, '', url);
  render();
}
function scenarioControl() {
  return `<label>サンプルの状態<select data-scenario aria-label="サンプルの状態">${scenarios.map(([id, label]) => `<option value="${id}" ${id === scenario ? 'selected' : ''}>${label}</option>`).join('')}</select></label>`;
}
function shell() {
  const ai = agentSummary(tasks),
    running = tasks.find(t => t.owner === 'self' && t.state === 'working' && openOn(t));
  return `<aside class="rail"><a href="#now" class="brand" data-nav="now" aria-label="Guilduo 今日"><img class="brand-light" src="/assets/brand/guilduo-mark-ink.svg" alt="" width="19" height="26"><img class="brand-dark" src="/assets/brand/guilduo-mark-gold.svg" alt="" width="19" height="26"><span>Guilduo</span></a><nav class="nav" aria-label="メインナビゲーション">${navigation.map(([id, label, symbol]) => `<a class="nav-link" href="#${id}" data-nav="${id}" ${view === id ? 'aria-current="page"' : ''}>${icon(symbol)}<span>${label}</span>${id === 'guild' && ai.review ? `<span class="nav-count" aria-label="確認待ち${ai.review}件">${ai.review}</span>` : ''}</a>`).join('')}</nav><div class="rail-bottom"><details class="preview-tools"><summary>${icon('sliders')}表示確認</summary>${scenarioControl()}<p>架空のデータを使ったモックです。変更は再読み込みで戻ります。</p></details><div class="profile"><span class="avatar">EL</span><div><strong>ひろなお</strong><small>個人ワークスペース</small></div></div></div></aside><header class="topbar"><div class="breadcrumb"><span class="workspace">マイワークスペース</span>${icon('chevron-right').replace('<svg ', '<svg class="crumb-chevron" ')}<span>${navigation.find(([id]) => id === view)[1]}</span></div><div class="top-actions"><span class="preview-label">LOCAL PREVIEW</span>${ib('sliders', '表示確認を開く', 'preview')}${ib(theme === 'light' ? 'moon' : 'sun', theme === 'light' ? 'ダークに切り替える' : 'ライトに切り替える', 'theme')}${button(`${icon('plus')}<span>タスクを追加</span>`, 'capture', 'top-add')}</div></header><main id="main" tabindex="-1"><div class="page-wrap">${{
    now: todayView,
    plan: calendarView,
    all: tasksView,
    guild: guildView,
    settings: settingsView
  }[view]()}</div></main><button class="mobile-add" type="button" aria-label="タスクを追加" data-action="capture">${icon('plus')}</button>${running && view !== 'now' ? `<aside class="dock" aria-label="作業中のタスク"><span class="timer" data-timer>12:00</span><div class="dock-copy"><button data-action="detail" data-id="${running.id}">${esc(running.title)}</button><small>作業中</small></div>${ib('pause', '一時停止', 'pause', `data-id="${running.id}"`)}${ib('check', '作業中のタスクを完了', 'complete', `data-id="${running.id}"`)}</aside>` : ''}`;
}
const heading = (name, desc = '') => `<div class="page-heading"><div><h1 tabindex="-1">${name}</h1>${desc ? `<p>${desc}</p>` : ''}</div></div>`;
const empty = (name, desc, action = true) => `<div class="empty">${icon('sun')}<h2>${name}</h2><p>${desc}</p>${action ? button(`${icon('plus')}タスクを追加`, 'capture', 'primary') : ''}</div>`;
function todayView() {
  const day = todayTasks(tasks),
    done = day.filter(t => doneOn(t)).length,
    remaining = day.filter(t => !doneOn(t)).reduce((n, t) => n + t.minutes, 0),
    ai = agentSummary(tasks),
    focus = focusTask(tasks, focusId);
  const next = day.filter(t => openOn(t) && t.time && t.time > NOW && t.id !== focus?.id).sort((a, b) => a.time.localeCompare(b.time))[0];
  return `<div class="page-heading"><div><h1 tabindex="-1" class="date-title">${dateTitle(TODAY)}<small>${weekday(TODAY)}曜日</small></h1><div class="completion-summary"><strong>${done}<span class="muted"> / ${day.length}</span></strong><span>完了</span><span class="progress" aria-hidden="true"><i style="width:${day.length ? done / day.length * 100 : 0}%"></i></span><span>残り ${remaining ? duration(remaining) : '0分'}</span></div></div></div><div class="today-grid"><section class="today-main" aria-label="今日の仕事">${ai.review || ai.blocked ? `<button class="mobile-attention" data-action="guild">${icon('message')}<span>AIから確認 ${ai.review}件${ai.blocked ? ` · 停止 ${ai.blocked}件` : ''}</span>${icon('chevron-right')}</button>` : ''}<div class="today-focus">${focus ? focusCard(focus) : empty('今日の1件を、ここから。', '頭にあることを書き出すか、タスクから今日やるものを選びましょう。')}${!focus && tasks.length ? tb(`タスクから選ぶ ${icon('arrow-right')}`, 'all') : ''}${next ? `<button class="next-preview" data-action="detail" data-id="${next.id}"><span class="eyebrow">次の予定</span><strong>${next.time}</strong><span class="next-title">${esc(next.title)}</span>${icon('arrow-right')}</button>` : '<p class="next-preview muted"><span class="eyebrow">このあと</span>時刻の決まった予定はありません</p>'}</div><section class="today-flow" aria-label="今日のタイムライン"><div class="section-heading"><h2>今日のタイムライン</h2>${tb(`カレンダー ${icon('arrow-up-right')}`, 'plan')}</div>${timeline(day)}<details class="history"><summary>${icon('clock')}時間の記録</summary><p>このモックでは経過時間を表示します。本体の時間記録は変更しません。</p></details></section></section>${agentRail()}</div>`;
}
function focusCard(t) {
  const running = t.state === 'working';
  return `<article class="focus-card"><div class="focus-top"><span class="focus-label">${icon(running ? 'play' : 'flag')}${running ? 'いま取り組んでいます' : '今の1件'}</span>${ib('more', 'タスクの詳細を開く', 'detail', `data-id="${t.id}"`)}</div><button class="focus-heading" data-action="detail" data-id="${t.id}">${emoji(t)}<span class="title-text">${esc(t.title)}</span></button><p class="focus-next"><span>次の一歩</span>${esc(t.next || 'まずは、できるところから。')}</p><div class="focus-actions">${button(`${icon(running ? 'check' : 'play')}${running ? '完了する' : '始める'}`, running ? 'complete' : 'start', 'primary', `data-id="${t.id}"`)}<span class="focus-time">${icon('clock')}${running ? '<span class="timer" data-timer>12:00</span>' : duration(t.minutes)}</span><button class="text-btn choose" data-action="${running ? 'pause' : 'choose'}" data-id="${t.id}">${running ? '一時停止' : `別のタスク ${icon('chevron-right')}`}</button></div></article>`;
}
function taskTone(t, date = TODAY) {
  return doneOn(t, date) ? 'finished' : t.state === 'working' ? 'active' : t.kind === 'daily' ? 'routine' : 'planned';
}
function flowTask(t, date, timed = false) {
  const focus = focusTask(tasks, focusId)?.id === t.id;
  const meta = [duration(t.minutes), t.steps?.length ? `ステップ ${t.steps.filter(s => s.done).length}/${t.steps.length}` : '',
    doneOn(t, date) ? '完了' : t.state === 'working' ? '作業中' : ''].filter(Boolean).join(' · ');
  return `<${timed ? 'li' : 'div'} class="${timed ? 'flow-row' : 'flow-anytime'} ${taskTone(t, date)} ${focus ? 'is-focus' : ''}">
    ${timed ? `<div class="time"><span>${t.time}</span>${t.minutes ? `<small>${endTime(t)}</small>` : ''}</div><span class="flow-stop ${t.icon ? 'has-icon' : ''}" aria-hidden="true">${t.icon ? esc(t.icon) : ''}</span>` : ''}
    <div class="flow-card">${!timed && t.icon ? `<span class="flow-emoji" aria-hidden="true">${esc(t.icon)}</span>` : ''}<div class="flow-copy"><button class="row-title" data-action="detail" data-id="${t.id}" aria-label="${esc(t.title)}">${esc(t.title)}</button><p class="flow-meta">${esc(meta)}</p></div>${check(t, date)}</div>
    </${timed ? 'li' : 'div'}>`;
}
function timeline(day, date = TODAY) {
  const {past, timed, anytime, finishedAnytime} = timelineSections(day, date);
  const now = () => `<li class="flow-now"><time>${NOW}</time><span>いま</span></li>`;
  let nowShown = date !== TODAY;
  const rows = timed.map((t, i) => {
    let result = '';
    if (!nowShown && clockMinutes(t.time) > clockMinutes(NOW)) { result += now(); nowShown = true; }
    result += flowTask(t, date, true);
    const next = timed[i + 1];
    if (!nowShown && (!next || clockMinutes(next.time) > clockMinutes(NOW))) { result += now(); nowShown = true; }
    const busyUntil = Math.max(...timed.slice(0, i + 1).map(scheduledEnd));
    const gapStart = date === TODAY ? Math.max(busyUntil, clockMinutes(NOW)) : busyUntil;
    const gap = next ? clockMinutes(next.time) - gapStart : 0;
    if (gap >= 15) {
      const at = `${String(Math.floor(gapStart / 60)).padStart(2, '0')}:${String(gapStart % 60).padStart(2, '0')}`;
      result += `<li class="flow-gap"><span>${duration(gap)}の余白</span>${tb(`予定を入れる ${icon('plus')}`, 'gap', `data-date="${date}" data-time="${at}" data-minutes="${gap}"`)}</li>`;
    }
    return result;
  }).join('');
  return `<div class="day-flow">${anytime.length ? `<section class="flow-anytime-group"><h3>時刻未定 <span>${anytime.length}</span></h3>${anytime.map(t => flowTask(t, date)).join('')}</section>` : ''}
    ${past.length ? `<details class="flow-past" data-fold="past-${date}"><summary>それより前 <span>${past.length}</span></summary><ul class="flow-track">${past.map(t => flowTask(t, date, true)).join('')}</ul></details>` : ''}
    ${timed.length || date === TODAY && day.length ? `<ul class="flow-track">${rows}${!nowShown ? now() : ''}</ul>` : ''}
    ${finishedAnytime.length ? `<details class="completed"><summary>終えたこと ${finishedAnytime.length}件</summary>${finishedAnytime.map(t => taskRow(t, false, date)).join('')}</details>` : ''}
    ${!day.length ? '<p class="flow-empty">まだ予定はありません。空いている時間も、大切に。</p>' : ''}</div>`;
}
function taskRow(t, schedule = false, date = TODAY) {
  return `<div class="task-row ${doneOn(t, date) ? 'done' : ''}">${schedule ? '' : check(t, date)}<div class="row-copy">${title(t)}${t.owner !== 'self' ? `<div class="row-sub">${esc(t.owner)} · ${statusNames[t.state]}</div>` : ''}</div><span class="meta">${t.minutes ? duration(t.minutes) : ''}</span>${schedule ? ib('plus', `${t.title}を選択日に入れる`, 'schedule', `data-id="${t.id}"`) : ''}</div>`;
}
function agentRail() {
  const ai = agentSummary(tasks);
  return `<aside class="ai-rail" aria-label="AIの状況"><div class="ai-header">${icon('users')}<h2>ギルド</h2></div><p>あなたとAIで、少しずつ。</p><div class="ai-items">${ai.rows.map(t => `<article class="ai-item"><div class="status ${t.state}"><span class="status-dot"></span>${statusNames[t.state]}</div><button class="ai-title" data-action="${t.state === 'review' ? 'review' : 'detail'}" data-id="${t.id}">${esc(t.title)}</button>${t.state === 'blocked' ? `<p class="reason">${esc(t.next)}</p>` : ''}<div class="owner"><span class="avatar agent">${t.owner[0]}</span>${t.owner}</div>${t.state === 'review' ? button(`内容を確認 ${icon('arrow-right')}`, 'review', 'review-action', `data-id="${t.id}"`) : ''}</article>`).join('') || '<p class="muted" style="font-size:13px;padding:20px 0">いま、対応が必要な仕事はありません。</p>'}</div><div class="ai-footer">${ai.waiting ? `<small>ほか ${ai.waiting}件は受け取り待ち</small>` : ''}${tb(`ギルドを開く ${icon('arrow-right')}`, 'guild')}</div></aside>`;
}
function dayDots(date) {
  const { states } = calendarSummary(tasks, date);
  return `<span class="day-dots" aria-hidden="true">${states.slice(0, 3).map(state => `<i class="day-dot ${state}"></i>`).join('')}${states.length > 3 ? `<span class="dots-more">+${states.length - 3}</span>` : ''}</span>`;
}
function weekView(days) {
  const plans = days.map(date => calendarSummary(tasks, date).items);
  const timed = plans.flat().filter(t => t.time);
  const placements = plans.map(weekPlacements);
  const first = Math.min(8, ...timed.map(t => Math.floor(clockMinutes(t.time) / 60)));
  const last = Math.min(24, Math.max(20, ...placements.flat().map(p => Math.ceil(p.end / 60))));
  const height = (last - first) * 96;
  const top = minute => (minute - first * 60) * 1.6;
  const rows = plans.flat();
  const done = plans.reduce((total, items, i) => total + items.filter(t => doneOn(t, days[i])).length, 0);
  const totalMinutes = rows.reduce((total, t) => total + t.minutes, 0);
  const card = (t, date, style = '', compact = false) => `<button type="button" class="week-block ${taskTone(t, date)} ${compact ? 'compact' : ''}" data-action="detail" data-id="${t.id}" style="${style}" aria-label="${esc(t.title)}、${t.time || '時刻未定'}、${duration(t.minutes)}${doneOn(t, date) ? '、完了' : ''}"><span class="week-block-title">${t.icon ? `<span aria-hidden="true">${esc(t.icon)}</span> ` : ''}${esc(t.title)}</span><small>${t.time ? `${t.time}${t.minutes ? `–${endTime(t)}` : ''}` : duration(t.minutes)}</small>${doneOn(t, date) ? `<span class="week-done" aria-hidden="true">${icon('check')}</span>` : ''}</button>`;
  return `<section class="week-review" aria-label="この週の見通し"><h3>この週の見通し</h3><div><p><span>予定</span><strong>${rows.length}<small>件</small></strong></p><p><span>予定した時間</span><strong>${totalMinutes ? duration(totalMinutes) : '0分'}</strong></p><p><span>終えたこと</span><strong>${done}<small>件</small></strong></p></div></section>
    <p class="week-hint">左右に並ぶのは、重なっている予定。短い予定は押しやすい高さで表示します。</p>
    <div class="week-scroll" data-week="${days[0]}" tabindex="0" role="region" aria-label="週の予定。横にスクロールできます"><div class="week-calendar" style="--week-height:${height}px">
    <span></span>${days.map((date, i) => `<button class="week-date ${date === TODAY ? 'is-today' : ''}" data-action="calendar-date" data-value="${date}" aria-label="${dateTitle(date)}、${calendarSummary(tasks, date).label}"><small>${weekday(date)}</small><b>${Number(date.slice(-2))}</b>${dayDots(date)}<small>${plans[i].length ? duration(plans[i].reduce((n, t) => n + t.minutes, 0)) : '予定なし'}</small></button>`).join('')}
    <span class="week-axis-label">時刻<br>未定</span>${plans.map((items, i) => `<div class="week-anytime ${days[i] === TODAY ? 'is-today' : ''}">${items.filter(t => !t.time).map(t => card(t, days[i])).join('')}</div>`).join('')}
    <div class="week-hours" aria-hidden="true">${Array.from({length: last - first}, (_, i) => `<time style="top:${i * 96}px">${String(first + i).padStart(2, '0')}:00</time>`).join('')}${days.includes(TODAY) && clockMinutes(NOW) >= first * 60 && clockMinutes(NOW) <= last * 60 ? `<time class="week-axis-now" style="top:${top(clockMinutes(NOW))}px">${NOW}</time>` : ''}</div>
    ${days.map((date, i) => `<div class="week-lane ${date === TODAY ? 'is-today' : ''}">${placements[i].map(p => {
      // shortcut: overnight blocks stop at midnight; split carry-over during production integration.
      const style = `top:${Math.min(top(p.start), height - 44)}px;height:${Math.max(44, (p.end - p.start) * 1.6 - 4)}px;left:calc(${p.lane / p.lanes * 100}% + 3px);width:calc(${100 / p.lanes}% - 6px)`;
      return p.hidden ? `<button class="week-more" style="${style}" data-action="calendar-date" data-value="${date}" aria-label="${dateTitle(date)}、重なるほか${p.hidden}件を日表示で見る">＋${p.hidden}件</button>` : card(p.task, date, style, (p.end - p.start) < 45);
    }).join('')}${date === TODAY && clockMinutes(NOW) >= first * 60 && clockMinutes(NOW) <= last * 60 ? `<div class="week-now" style="top:${top(clockMinutes(NOW))}px"><span>いま ${NOW}</span></div>` : ''}</div>`).join('')}
    </div></div>`;
}
function calendarView() {
  const date = new Date(`${calendarDate}T12:00:00Z`),
    offset = (date.getUTCDay() + 6) % 7;
  const week = Array.from({
    length: 7
  }, (_, i) => addDays(calendarDate, i - offset));
  const dayTasks = d => calendarSummary(tasks, d).items;
  const modes = `<div class="segment" aria-label="カレンダー表示">${[['day', '日'], ['week', '週'], ['month', '月']].map(([id, label]) => `<button data-action="calendar-mode" data-value="${id}" aria-pressed="${id === calendarMode}">${label}</button>`).join('')}</div>`;
  let content = '';
  if (calendarMode === 'day') content = `<div class="week-strip">${week.map(d => `<button class="day-button" data-action="calendar-date" data-value="${d}" aria-pressed="${d === calendarDate}" aria-label="${dateTitle(d)} ${weekday(d)}曜日、${calendarSummary(tasks, d).label}"><small>${weekday(d)}</small><b>${Number(d.slice(-2))}</b>${dayDots(d)}</button>`).join('')}</div>${timeline(dayTasks(calendarDate), calendarDate)}`;
  if (calendarMode === 'week') content = weekView(week);
  if (calendarMode === 'month') {
    const first = `${calendarDate.slice(0, 7)}-01`,
      shift = (new Date(`${first}T12:00:00Z`).getUTCDay() + 6) % 7;
    content = `<div class="week-strip">${['月', '火', '水', '木', '金', '土', '日'].map(d => `<small style="text-align:center">${d}</small>`).join('')}</div><div class="month-grid">${Array.from({
      length: 42
    }, (_, i) => addDays(first, i - shift)).map(d => `<button class="month-cell ${d === TODAY ? 'today' : ''} ${d.slice(0, 7) !== calendarDate.slice(0, 7) ? 'outside' : ''}" data-action="calendar-date" data-value="${d}" aria-label="${dateTitle(d)}、${calendarSummary(tasks, d).label}"><span>${Number(d.slice(-2))}</span>${dayDots(d)}${dayTasks(d).slice(0, 3).map(t => `<span class="month-task">${esc(t.title)}</span>`).join('')}</button>`).join('')}</div>`;
  }
  const inbox = tasks.filter(t => t.owner === 'self' && openOn(t) && !t.date);
  const overdue = tasks.filter(t => t.owner === 'self' && t.kind !== 'daily' && openOn(t) && t.date && t.date < TODAY);
  return `${heading('カレンダー', '予定を見渡して、無理のない一日に。')}<div class="calendar-layout ${calendarMode === 'week' ? 'week-layout' : ''}"><section><div class="calendar-head"><h2>${calendarMode === 'day' ? dateTitle(calendarDate) : `${date.getUTCFullYear()}年${date.getUTCMonth() + 1}月`}</h2><div class="inline">${modes}${ib('chevron-left', '前へ', 'previous')}${ib('chevron-right', '次へ', 'next')}${tb('今日', 'calendar-today')}</div></div>${content}<p class="dots-legend"><span><i class="day-dot ready"></i>予定</span><span><i class="day-dot working"></i>作業中</span><span><i class="day-dot done"></i>完了</span><span>点1つで1件 · ＋は残りの件数</span></p></section><aside class="inbox-panel"><h2>受け箱 <span class="group-count">${inbox.length}</span></h2><p>まだ日付のないタスク。＋で選んだ日に入れられます。</p><div class="inbox-rows">${inbox.map(t => taskRow(t, true)).join('') || '<p class="muted">受け箱は空です</p>'}</div>${overdue.length ? `<details class="review-dates" data-fold="review-dates"><summary>日付を見直す <span>${overdue.length}</span></summary><p>予定日を過ぎたタスク。＋で選んだ日に移せます。</p>${overdue.map(t => taskRow(t, true)).join('')}</details>` : ''}</aside></div>`;
}
function tasksView() {
  const list = tasks.filter(t => !t.archived && `${t.title} ${t.notes}`.toLowerCase().includes(search.toLowerCase()));
  const head = `${heading('タスク', '頭の中のことを、ひとつずつ。')}<div class="toolbar"><label class="search-box">${icon('search')}<input type="search" id="task-search" placeholder="タスクを探す" aria-label="タスクを探す" value="${esc(search)}"></label><div class="segment" aria-label="タスク表示">${[['list', '一覧'], ['board', 'ボード'], ['gantt', 'ガント'], ['notes', 'メモ']].map(([id, label]) => `<button data-action="list-mode" data-value="${id}" aria-pressed="${id === listMode}">${label}</button>`).join('')}</div></div>`;
  if (listMode === 'notes') return `${head}<form class="notes-editor" id="notes-form"><label class="field"><span>今日のメモ</span><textarea name="notes">${esc(notesDraft)}</textarea></label><div>${button('メモを保存', 'save-note', 'primary')}</div></form>`;
  if (listMode === 'board') return `${head}<div class="board">${[['ready', 'これから'], ['working', '作業中'], ['done', '完了']].map(([state, label]) => `<section class="board-column"><h2>${label}</h2>${list.filter(t => state === 'done' ? doneOn(t) : openOn(t) && (state === 'ready' ? t.state !== 'working' : t.state === 'working')).map(t => `<button class="board-card" data-action="detail" data-id="${t.id}">${emoji(t)} ${esc(t.title)}<small>${t.owner === 'self' ? '自分' : esc(t.owner)} · ${duration(t.minutes)}</small></button>`).join('')}</section>`).join('')}</div>`;
  if (listMode === 'gantt') return `${head}<div class="gantt" tabindex="0" role="region" aria-label="7日間のガント。横にスクロールできます"><div class="gantt-row"><span>タスク</span>${Array.from({
    length: 7
  }, (_, i) => `<span>${Number(addDays(TODAY, i).slice(-2))}日</span>`).join('')}</div>${list.filter(t => t.date >= TODAY && t.date <= addDays(TODAY, 6)).map(t => `<div class="gantt-row"><button data-action="detail" data-id="${t.id}">${esc(t.title)}</button><span class="gantt-bar" style="grid-column:${2 + Math.round((new Date(t.date) - new Date(TODAY)) / 86400000)}" aria-label="${dateTitle(t.date)}"></span></div>`).join('')}</div>`;
  const groups = [['今日', list.filter(t => t.owner === 'self' && onDay(t) && openOn(t)), true], ['受け箱', list.filter(t => t.owner === 'self' && !t.date && openOn(t)), true], ['これから', list.filter(t => t.owner === 'self' && t.kind !== 'daily' && t.date > TODAY && openOn(t)), true], ['日付を見直す', list.filter(t => t.owner === 'self' && t.kind !== 'daily' && t.date && t.date < TODAY && openOn(t)), false], ['Agentが担当', list.filter(t => t.owner !== 'self' && openOn(t)), false], ['完了', list.filter(t => doneOn(t)), false]];
  return `${head}<div id="task-results">${groups.filter(([, rows]) => rows.length).map(([label, rows, opened]) => `<details class="task-group" data-group="${label}" ${opened || search ? 'open' : ''}><summary>${label}<span class="group-count">${rows.length}</span></summary>${rows.map(t => taskRow(t)).join('')}</details>`).join('') || empty('タスクはありません', search ? '別の言葉で探してみましょう。' : '思いついたことから、書き出してみましょう。', !search)}</div>`;
}
function guildView() {
  const ai = agentSummary(tasks);
  return `${heading('ギルド', '自分に必要な判断と、仲間の仕事。')}<div class="guild-grid"><section><h2>あなたの確認待ち <span class="group-count">${ai.review}</span></h2>${tasks.filter(t => t.owner !== 'self' && openOn(t) && t.state === 'review').map(t => `<article class="decision-card"><span class="inline meta"><span class="avatar agent">${t.owner[0]}</span>${t.owner}から</span><h3>${esc(t.title)}</h3><p>${esc(t.next)}</p>${button(`内容を確認する ${icon('arrow-right')}`, 'review', 'primary', `data-id="${t.id}"`)}</article>`).join('') || '<p class="muted" style="padding:20px 0">確認待ちはありません。</p>'}<div class="section-heading"><h2>人とAgent</h2></div>${['self', 'Scarlet', 'Cyan'].map(owner => {
    const assigned = tasks.filter(t => t.owner === owner && openOn(t));
    return `<div class="member-row"><span class="avatar ${owner === 'self' ? '' : 'agent'}">${owner === 'self' ? 'EL' : owner[0]}</span><div class="member-copy"><strong>${owner === 'self' ? 'ひろなお（あなた）' : owner}</strong><p>${assigned.length}件を担当 · 作業中 ${assigned.filter(t => t.state === 'working').length}件</p></div>${tb(`仕事を見る ${icon('chevron-right')}`, 'member', `data-owner="${owner}"`)}</div>`;
  }).join('')}<div class="utility-links">${button(`${icon('sparkles')}バトル`, 'info', '', 'data-value="battle"')}${button(`${icon('list-todo')}スキル`, 'info', '', 'data-value="skills"')}${button(`${icon('link')}つながり`, 'info', '', 'data-value="network"')}</div></section><aside class="ai-rail"><h2>最近の活動</h2><ul class="activity-list"><li>Scarletがオンボーディング案の確認を依頼しました。<small>10:32</small></li><li>Cyanがスマホの操作フローの検証を始めました。<small>10:15</small></li><li>週間ゴールを書き出しました。<small>09:50</small></li></ul><p class="meta">サンプルの活動記録</p></aside></div>`;
}
function settingsView() {
  const setting = (name, description, control) => `<div class="setting-row"><div><h3>${name}</h3><p>${description}</p></div>${control}</div>`;
  const links = rows => rows.map(([id, name, desc]) => `<button class="setting-row setting-link" data-action="info" data-value="${id}"><span><h3>${name}</h3><p>${desc}</p></span>${icon('chevron-right')}</button>`).join('');
  return `${heading('設定', '自分に合う使い心地に。')}<div class="settings-content"><section class="settings-section"><h2>表示</h2>${setting('テーマ', 'ライトとダーク、どちらも同じ使い心地。', `<div class="segment">${['light', 'dark'].map(t => `<button data-action="set-theme" data-value="${t}" aria-pressed="${theme === t}">${icon(t === 'light' ? 'sun' : 'moon')} ${t === 'light' ? 'ライト' : 'ダーク'}</button>`).join('')}</div>`)}${setting('完了のお祝い', '完了時に、小さな達成のメッセージを表示します。', `<input class="toggle" type="checkbox" aria-label="完了のお祝い" data-toggle="cheer" ${cheer ? 'checked' : ''}>`)}${setting('レベル・XP', '達成時のメッセージに表示します。', `<input class="toggle" type="checkbox" aria-label="レベル・XP" data-toggle="game" ${game ? 'checked' : ''}>`)}${setting('言語', 'この見本は日本語で表示しています。', '<span class="meta">日本語</span>')}</section><section class="settings-section"><h2>通知と連携</h2>${links([['notifications', '通知', 'リマインド・朝のまとめ・Agentからの知らせ'], ['connections', '外部サービス', 'カレンダーや時間の記録をつなぐ'], ['mcp', 'MCP接続', 'Claude・CodexなどのAIクライアント']])}</section><section class="settings-section"><h2>アカウントとデータ</h2>${links([['time', '時間の記録', '記録元・タイムゾーン・書き出し'], ['profile', 'プロフィール', '名前・アイコン・自己紹介'], ['billing', '利用プラン', 'プランの確認と管理']])}</section></div>`;
}
function render() {
  const scroll = window.scrollY;
  const folds = [...app.querySelectorAll('details[data-fold][open]')].map(node => node.dataset.fold);
  const oldWeek = app.querySelector('.week-scroll');
  const weekScroll = oldWeek ? {week: oldWeek.dataset.week, left: oldWeek.scrollLeft} : null;
  const focused = document.activeElement;
  const restore = app.contains(focused);
  const keys = ['data-action', 'data-id', 'data-value', 'data-nav', 'id', 'aria-label'].filter(key => focused?.hasAttribute(key));
  const identity = keys.map(key => [key, focused.getAttribute(key)]);
  document.documentElement.dataset.theme = theme;
  document.title = `${navigation.find(([id]) => id === view)[1]} — Guilduo UI preview`;
  app.innerHTML = shell();
  for (const fold of app.querySelectorAll('details[data-fold]')) fold.open = folds.includes(fold.dataset.fold);
  const newWeek = app.querySelector('.week-scroll');
  if (newWeek && weekScroll?.week === newWeek.dataset.week) newWeek.scrollLeft = weekScroll.left;
  if (restore) {
    const target = identity.length ? [...app.querySelectorAll('button,a,input,textarea,select,summary')].find(el => el.getClientRects().length && identity.every(([key, value]) => el.getAttribute(key) === value)) : null;
    (target || app.querySelector('h1'))?.focus({preventScroll:true});
  }
  paintTimer();
  window.scrollTo(0, scroll);
}
function closeDialog(force = false) {
  if (!activeDialog) return true;
  if (!force && activeDialog.dirty) {
    if (document.querySelector('#discard-confirm')) return false;
    const confirm = document.createElement('dialog');
    confirm.id = 'discard-confirm';
    confirm.setAttribute('aria-labelledby', 'discard-title');
    confirm.innerHTML = `<div class="modal-frame"><div class="modal-head"><h2 id="discard-title">変更を破棄しますか？</h2></div><div class="modal-body"><p>保存していない変更があります。</p></div><div class="modal-footer"><button type="button" class="btn" data-keep>編集を続ける</button><button type="button" class="btn primary" data-discard>変更を破棄する</button></div></div>`;
    const origin = document.activeElement;
    const dismiss = () => {
      confirm.close();
      confirm.remove();
      if (origin?.isConnected) origin.focus();
    };
    confirm.querySelector('[data-keep]').onclick = dismiss;
    confirm.querySelector('[data-discard]').onclick = () => {
      dismiss();
      closeDialog(true);
    };
    confirm.addEventListener('cancel', event => {
      event.preventDefault();
      dismiss();
    });
    overlays.append(confirm);
    confirm.showModal();
    confirm.querySelector('[data-keep]').focus();
    return false;
  }
  const previous = activeDialog;
  activeDialog = null;
  previous.node.close();
  previous.node.remove();
  if (previous.origin?.isConnected) previous.origin.focus({
    preventScroll: true
  });else document.querySelector('h1')?.focus({
    preventScroll: true
  });
  return true;
}
function openDialog(kind, name, body, footer = '', onSubmit, initial = 'input,textarea,button') {
  if (!closeDialog()) return null;
  const origin = document.activeElement,
    node = document.createElement('dialog');
  node.className = `${kind}-dialog`;
  node.setAttribute('aria-labelledby', 'dialog-title');
  node.innerHTML = `<div class="modal-frame"><header class="modal-head"><h2 id="dialog-title">${name}</h2>${ib('x', '閉じる', 'close-dialog')}</header><form class="modal-body" id="dialog-form">${body}<div class="form-error" role="alert" hidden></div></form>${footer ? `<footer class="modal-footer">${footer}</footer>` : ''}</div>`;
  overlays.append(node);
  activeDialog = {
    node,
    origin,
    dirty: false
  };
  node.addEventListener('cancel', e => {
    e.preventDefault();
    closeDialog();
  });
  node.addEventListener('input', () => {
    if (activeDialog) activeDialog.dirty = true;
  });
  node.addEventListener('change', () => {
    if (activeDialog) activeDialog.dirty = true;
  });
  node.querySelector('form').addEventListener('submit', event => {
    event.preventDefault();
    if (!node.querySelector('form').reportValidity()) return;
    if (failSave) {
      failSave = false;
      const error = node.querySelector('.form-error');
      error.hidden = false;
      error.textContent = '保存できませんでした。入力は残っています。もう一度試してください。';
      return;
    }
    onSubmit?.(new FormData(node.querySelector('form')));
  });
  node.showModal();
  node.querySelector(initial)?.focus();
  return node;
}
function detail(id) {
  const t = find(id);
  if (!t) return;
  if (t.owner !== 'self' && t.state === 'review') {
    reviewDialog(t);
    return;
  }
  const input = (label, name, value, type = 'text', extra = '') => `<label class="field"><span>${label}</span><input name="${name}" type="${type}" value="${esc(value)}" ${extra}></label>`;
  const chip = (key, label) => `<button type="button" class="detail-chip" data-pane="${key}" aria-expanded="false" aria-controls="edit-${key}">${label}</button>`;
  const quick = (field, value, label) => `<button type="button" class="detail-chip" data-set="${field}" data-value="${value}">${label}</button>`;
  const pane = (key, content) => `<div class="detail-pane" id="edit-${key}" hidden>${content}<button type="button" class="text-btn" data-finish="${key}">決定 ${icon('check')}</button></div>`;
  const body = `<div class="detail-heading"><button type="button" class="detail-emoji" data-pane="emoji" aria-label="絵文字を変更" aria-expanded="false" aria-controls="edit-emoji">${t.icon ? esc(t.icon) : icon('plus')}</button><label class="field"><span class="sr-only">タスク</span><textarea class="title-field" name="title" required maxlength="200" rows="1">${esc(t.title)}</textarea></label></div>
    ${pane('emoji', input('絵文字', 'emoji', t.icon, 'text', 'maxlength="16"') + `<div class="detail-chips">${['📐', '📝', '🌿', '☕', '💭', ''].map(v => quick('emoji', v, v || 'なし')).join('')}</div>`)}
    <label class="field detail-next"><span>次の一歩</span><textarea name="next" rows="1" maxlength="180" placeholder="最初の1分でできること">${esc(t.next)}</textarea></label>
    <div class="detail-chips" aria-label="日付と時間">${chip('date', '日付')}${chip('time', '時刻')}${chip('minutes', '目安')}${chip('due', '締め切り')}</div>
    ${pane('date', input('予定日', 'date', t.date, 'date') + `<div class="detail-chips">${quick('date', TODAY, '今日')}${quick('date', addDays(TODAY, 1), '明日')}${quick('date', '', '日付なし')}</div>`)}
    ${pane('time', `<div class="field-pair">${input('開始時刻', 'time', t.time, 'time')}${input('終了時刻', 'end', '', 'time')}</div><p class="step-hint">終了時刻から目安を計算します。開始より前なら翌日です。</p>` + quick('time', '', '時刻なし'))}
    ${pane('minutes', `<div class="detail-chips" aria-label="目安の時間">${[5, 15, 30, 45, 60, 90, 120].map(n => quick('minutes', n, duration(n))).join('')}</div>` + input('目安（分）', 'minutes', t.minutes || '', 'number', 'min="0" max="1440"') + quick('minutes', '', '目安なし'))}
    ${pane('due', input('締め切り', 'due', t.due || '', 'date') + quick('due', '', '締め切りなし'))}
    <div class="detail-chips optional-chips"><button type="button" class="detail-chip" data-reveal="criteria" ${t.criteria ? 'hidden' : ''}>＋完了の条件</button><button type="button" class="detail-chip" data-reveal="notes" ${t.notes ? 'hidden' : ''}>＋メモ</button></div>
    <label class="field detail-optional" data-optional="criteria" ${t.criteria ? '' : 'hidden'}><span>完了の条件</span><textarea name="criteria" rows="2" maxlength="300" placeholder="どこまでできたら完了？">${esc(t.criteria)}</textarea></label>
    <label class="field detail-optional" data-optional="notes" ${t.notes ? '' : 'hidden'}><span>メモ</span><textarea name="notes" rows="2" maxlength="1000" placeholder="覚えておきたいこと">${esc(t.notes)}</textarea></label>
    <section class="detail-section"><h3>担当</h3><input type="hidden" name="owner" value="${esc(t.owner)}"><ol class="relay-flow" aria-label="仕事を進める流れ"></ol><button type="button" class="detail-chip" data-owner-picker aria-expanded="false" aria-controls="owner-palette">＋ Agentを足す</button><div id="owner-palette" class="detail-chips agent-palette" hidden>${['Cyan', 'Scarlet'].map(owner => `<button type="button" class="detail-chip" data-owner="${owner}">${owner}</button>`).join('')}<button type="button" class="text-btn" data-owner="self">自分で進める</button></div><p class="relay-explanation"></p></section>
    <section class="detail-section"><div class="row-between"><h3>小さなステップ</h3><span class="step-count meta" aria-live="polite"></span></div><p class="step-hint">大きいときは、始めやすい大きさに。</p><div class="step-list"></div><div class="step-add"><input name="new-step" aria-label="ステップを追加" maxlength="180" placeholder="ステップを追加"><button type="button" class="btn" data-add-step>追加</button></div></section>`;
  const draftSteps = structuredClone(t.steps || []);
  const node = openDialog('detail', 'タスクの詳細', body, `${button('キャンセル', 'close-dialog', 'quiet')}<button type="submit" form="dialog-form" class="btn primary">変更を保存</button>`, data => {
    const name = data.get('title').trim();
    if (!name) return;
    const before = structuredClone(t);
    Object.assign(t, {
      title: name, next: data.get('next').trim(), date: data.get('date'), time: data.get('time'),
      due: data.get('due'), minutes: Number(data.get('minutes')) || 0, icon: data.get('emoji').trim(),
      criteria: data.get('criteria').trim(), notes: data.get('notes').trim(), owner: data.get('owner'),
      steps: structuredClone(draftSteps)
    });
    if (t.owner !== before.owner) t.state = 'ready';
    if (data.get('new-step').trim()) t.steps.push({ title: data.get('new-step').trim(), done: false });
    closeDialog(true);
    render();
    toast('変更を保存しました', () => Object.assign(t, before));
  }, '[aria-label="閉じる"]');
  if (!node) return;
  const form = node.querySelector('form');
  const field = name => form.elements.namedItem(name);
  let opened = null;
  const shortDay = value => value === TODAY ? '今日' : value === addDays(TODAY, 1) ? '明日' : `${dateTitle(value)}(${weekday(value)})`;
  function paintChips() {
    const start = field('time').value, minutes = Number(field('minutes').value);
    const end = start && minutes > 0 ? endTime({time: start, minutes}).split(':').map((v, i) => i === 0 ? String(Number(v) % 24).padStart(2, '0') : v).join(':') : '';
    field('end').disabled = !start;
    if (document.activeElement !== field('end')) field('end').value = end;
    const labels = { date: field('date').value ? shortDay(field('date').value) : '＋日付',
      time: start ? `${start}${end ? `–${end}` : ''}` : '＋時刻', minutes: Number(field('minutes').value) ? duration(Number(field('minutes').value)) : '＋目安',
      due: field('due').value ? `締め切り ${shortDay(field('due').value)}` : '＋締め切り' };
    for (const [key, label] of Object.entries(labels)) {
      const button = node.querySelector(`[data-pane="${key}"]`);
      button.textContent = label;
      button.classList.toggle('is-set', !!field(key).value);
    }
    for (const button of node.querySelectorAll('[data-pane]')) {
      const open = opened === button.dataset.pane;
      button.setAttribute('aria-expanded', String(open));
      node.querySelector(`#edit-${button.dataset.pane}`).hidden = !open;
    }
    const emojiButton = node.querySelector('.detail-emoji');
    emojiButton.innerHTML = field('emoji').value ? esc(field('emoji').value) : icon('plus');
    emojiButton.setAttribute('aria-label', field('emoji').value ? '絵文字を変更' : '絵文字を追加');
    for (const button of node.querySelectorAll('[data-set="minutes"]')) button.setAttribute('aria-pressed', String(Number(button.dataset.value) === Number(field('minutes').value)));
  }
  function paintOwner() {
    const owner = field('owner').value, agent = owner !== 'self';
    const person = (name, text, isAgent = false) => `<li><span class="avatar ${isAgent ? 'agent' : ''}" aria-hidden="true">${name[0]}</span><div><strong>${esc(name)}</strong><small>${text}</small></div></li>`;
    node.querySelector('.relay-flow').innerHTML = person('ひろなお', agent ? 'お願いする' : 'あなたが進める') + (agent ? person(owner, 'Agentが進める', true) + person('ひろなお', '最後に確認する') : '');
    node.querySelector('[data-owner-picker]').textContent = agent ? '担当を変える' : '＋ Agentを足す';
    node.querySelector('.relay-explanation').textContent = agent ? `保存すると、${owner}に渡す流れになります。終わったらあなたが確認します。` : 'Agentに任せると、終わったところであなたが確認します。';
    for (const button of node.querySelectorAll('[data-owner]')) button.setAttribute('aria-pressed', String(button.dataset.owner === owner));
  }
  function paintSteps() {
    node.querySelector('.step-list').innerHTML = draftSteps.map((step, i) => `<div class="step-edit"><label class="step-check"><input type="checkbox" data-step="${i}" ${step.done ? 'checked' : ''}><span>${esc(step.title)}</span></label><button type="button" class="icon-btn" data-remove-step="${i}" aria-label="${esc(step.title)}を削除">${icon('x')}</button></div>`).join('');
    node.querySelector('.step-count').textContent = draftSteps.length ? `${draftSteps.filter(s => s.done).length} / ${draftSteps.length}` : '';
  }
  function fitText() {
    for (const textarea of node.querySelectorAll('.title-field, .detail-next textarea')) {
      textarea.style.height = 'auto'; textarea.style.height = `${textarea.scrollHeight + 2}px`;
    }
  }
  function addStep() {
    const text = field('new-step').value.trim();
    if (!text) return;
    draftSteps.push({title: text, done: false}); field('new-step').value = '';
    activeDialog.dirty = true; paintSteps(); field('new-step').focus();
  }
  node.addEventListener('click', event => {
    const button = event.target.closest('button');
    if (!button) return;
    if (button.hasAttribute('data-pane')) {
      opened = opened === button.dataset.pane ? null : button.dataset.pane;
      paintChips(); if (opened) field(opened).focus();
    } else if (button.hasAttribute('data-finish')) {
      if (!field(button.dataset.finish).reportValidity()) return;
      opened = null; paintChips(); node.querySelector(`[data-pane="${button.dataset.finish}"]`).focus();
    } else if (button.hasAttribute('data-set')) {
      field(button.dataset.set).value = button.dataset.value;
      field(button.dataset.set).dispatchEvent(new Event('input', {bubbles: true}));
    } else if (button.hasAttribute('data-reveal')) {
      node.querySelector(`[data-optional="${button.dataset.reveal}"]`).hidden = false;
      button.hidden = true; field(button.dataset.reveal).focus();
    } else if (button.hasAttribute('data-owner-picker')) {
      const palette = node.querySelector('#owner-palette'); palette.hidden = !palette.hidden;
      button.setAttribute('aria-expanded', String(!palette.hidden));
    } else if (button.hasAttribute('data-owner')) {
      field('owner').value = button.dataset.owner; activeDialog.dirty = true; paintOwner();
      node.querySelector('#owner-palette').hidden = true;
      node.querySelector('[data-owner-picker]').setAttribute('aria-expanded', 'false');
      node.querySelector('[data-owner-picker]').focus();
    } else if (button.hasAttribute('data-add-step')) addStep();
    else if (button.hasAttribute('data-remove-step')) {
      draftSteps.splice(Number(button.dataset.removeStep), 1); activeDialog.dirty = true; paintSteps(); field('new-step').focus();
    }
  });
  node.addEventListener('change', event => {
    if (event.target.hasAttribute('data-step')) {
      draftSteps[Number(event.target.dataset.step)].done = event.target.checked;
      node.querySelector('.step-count').textContent = `${draftSteps.filter(s => s.done).length} / ${draftSteps.length}`;
    }
  });
  node.addEventListener('input', event => {
    if (event.target === field('end')) field('minutes').value = String(minutesBetween(field('time').value, field('end').value));
    paintChips(); fitText();
  });
  field('new-step').addEventListener('keydown', event => {
    if (event.key === 'Enter' && !event.isComposing) { event.preventDefault(); addStep(); }
  });
  // Reveal invalid collapsed fields so browser validation can focus the control.
  form.addEventListener('invalid', event => {
    const pane = event.target.closest('.detail-pane');
    if (pane) { opened = pane.id.slice(5); paintChips(); }
  }, true);
  window.addEventListener('resize', fitText);
  node.addEventListener('close', () => window.removeEventListener('resize', fitText), {once: true});
  paintChips(); paintOwner(); paintSteps(); fitText();
}

function capture() {
  const node = openDialog('capture', 'タスクを追加', `<label class="field"><span>何をしますか？</span><textarea class="capture-big" name="capture" rows="3" required maxlength="250" placeholder="例：明日 15:00 30分 画面案を見比べる"></textarea></label><div class="capture-preview" id="capture-preview" aria-live="polite">日付や時間も、まとめて書けます。</div><label class="confirm-check"><input type="checkbox" name="today">今日やる</label><p class="capture-hint">日付がなければ受け箱に入ります。<br>Enterで追加、Shift＋Enterで改行。</p>`, `${button('キャンセル', 'close-dialog', 'quiet')}<button class="btn primary" form="dialog-form" type="submit">追加する</button>`, data => {
    const p = parseCapture(data.get('capture').trim(), TODAY, 'ja');
    if (!p.title) return;
    const t = {
      id: `new-${crypto.randomUUID()}`,
      title: p.title,
      icon: iconFor(p.title),
      date: p.date || (data.has('today') ? TODAY : ''),
      time: p.time,
      minutes: p.minutes,
      next: '',
      notes: '',
      criteria: '',
      owner: 'self',
      state: 'ready',
      done: false,
      archived: false,
      kind: 'todo'
    };
    tasks.push(t);
    closeDialog(true);
    render();
    toast(t.date === TODAY ? '今日のタスクに追加しました' : 'タスクを追加しました', () => {
      tasks = tasks.filter(item => item.id !== t.id);
    });
  }, '[name=capture]');
  if (!node) return;
  const input = node.querySelector('[name=capture]');
  input.addEventListener('input', () => {
    const p = parseCapture(input.value, TODAY, 'ja');
    node.querySelector('#capture-preview').textContent = input.value.trim() ? [p.date ? dateTitle(p.date) : '受け箱', p.time, p.minutes ? duration(p.minutes) : '', p.tags.length ? p.tags.map(t => `#${t}`).join(' ') : ''].filter(Boolean).join(' · ') : '日付や時間も、まとめて書けます。';
  });
  input.addEventListener('keydown', e => {
    if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) {
      e.preventDefault();
      node.querySelector('form').requestSubmit();
    }
  });
}
function choose() {
  openDialog('picker', '今やるタスクを選ぶ', candidates(tasks).map(t => `<button class="picker-row" type="button" data-action="pick" data-id="${t.id}">${emoji(t)}<div><p>${esc(t.title)}</p><small>${t.time || '時刻未定'} · ${duration(t.minutes)}</small></div>${icon('chevron-right')}</button>`).join('') || '<p class="muted">今日の候補はありません。タスクから今日やるものを選びましょう。</p>');
}
function reviewDialog(t) {
  const node = openDialog('review', `${esc(t.owner)}からの確認`, `${pill(t)}<h3 style="font-size:21px;margin:16px 0 10px">${esc(t.title)}</h3><p style="font-size:14px;color:var(--text)">${esc(t.next)}</p><div class="report">${esc(t.notes || 'この仕事の内容を確認してください。')}</div>${t.criteria ? `<p class="meta">確認すること：${esc(t.criteria)}</p>` : ''}<label class="confirm-check"><input type="checkbox" name="confirmed" required>中身を確認しました</label><label class="field"><span>コメント（任意）</span><textarea name="comment" rows="2"></textarea></label>`, `${button('あとで', 'close-dialog', 'quiet')}<button type="submit" form="dialog-form" class="btn primary" disabled>OKを返す</button>`, () => {
    closeDialog(true);
    mutate(t, {
      done: true
    }, '確認を返しました');
  });
  node?.querySelector('[name=confirmed]').addEventListener('change', e => {
    node.querySelector('[type=submit]').disabled = !e.target.checked;
  });
}
function preview() {
  openDialog('preview', '表示確認', `${scenarioControl()}<label class="confirm-check"><input type="checkbox" data-toggle="failSave" ${failSave ? 'checked' : ''}>次の保存を失敗させる</label><p>固定の架空データで、2026年10月27日 10:40の画面を再現しています。API・通知・実データには接続しません。</p><p style="margin-top:12px">変更はメモリ内だけです。再読み込み、または「サンプルを戻す」で元に戻ります。</p>`, button(`${icon('refresh')}サンプルを戻す`, 'reset'));
}
function info(kind) {
  const content = {
    battle: ['バトル', '完了したタスクの達成を、次の冒険へ。', 'このモックでは入口と配置を確認できます。戦闘データの変更は行いません。'],
    skills: ['スキル', 'Agentが使える道具', 'タスクの確認、予定の提案、進捗の報告。既存のスキル画面は本体実装でここへ接続します。'],
    network: ['つながり', '仕事と担当の関係', '自分 → Cyan（実装）→ Scarlet（確認）。既存の関係図は本体実装でここへ接続します。'],
    notifications: ['通知', '必要なタイミングだけ知らせる', '予定の前・朝のまとめ・Agentからの確認。通知の許可や送信は、このモックでは行いません。'],
    connections: ['外部サービス', 'いつもの道具とつなぐ', 'Google Calendar・Toggl。接続設定は本体にあり、このモックから変更されません。'],
    mcp: ['MCP接続', 'AIと同じ仕事を共有する', 'Claude・Codexなどの接続状況を、本体実装でここへまとめます。'],
    time: ['時間の記録', 'かかった時間を振り返る', '記録元・タイムゾーン・エクスポートは、本体の既存機能を引き継ぎます。'],
    profile: ['プロフィール', 'ひろなお', '名前・アイコン・自己紹介は本体の設定を引き継ぎます。'],
    billing: ['利用プラン', 'プランの確認と管理', '支払い・契約の変更は、このモックでは行いません。']
  }[kind];
  openDialog('info', content[0], `<h3>${content[1]}</h3><p class="muted" style="font-size:14px;margin-top:16px">${content[2]}</p>`);
}
function paintTimer() {
  if (!startedAt) return;
  const seconds = Math.floor((Date.now() - startedAt) / 1000);
  document.querySelectorAll('[data-timer]').forEach(el => el.textContent = `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`);
}
setInterval(paintTimer, 1000);
document.addEventListener('click', event => {
  const nav = event.target.closest('[data-nav]');
  if (nav) {
    event.preventDefault();
    go(nav.dataset.nav);
    return;
  }
  const control = event.target.closest('[data-action]');
  if (!control || control.disabled) return;
  const {
      action,
      id,
      value
    } = control.dataset,
    t = find(id);
  switch (action) {
    case 'capture':
      capture();
      break;
    case 'detail':
      detail(id);
      break;
    case 'theme':
      setTheme(theme === 'light' ? 'dark' : 'light');
      break;
    case 'set-theme':
      setTheme(value);
      break;
    case 'preview':
      preview();
      break;
    case 'close-dialog':
      closeDialog();
      break;
    case 'choose':
      choose();
      break;
    case 'pick':
      focusId = id;
      closeDialog(true);
      render();
      break;
    case 'start':
      for (const item of tasks) if (item.owner === 'self' && item.state === 'working') item.state = 'ready';
      t.state = 'working';
      focusId = id;
      startedAt = Date.now();
      render();
      toast('始めました。まずは次の一歩から。');
      break;
    case 'pause':
      mutate(t, {
        state: 'ready'
      }, '一時停止しました');
      break;
    case 'complete':
      {
        const completed = doneOn(t);
        mutate(t, t.kind === 'daily' ? {
          lastCompleted: completed ? '' : TODAY,
          state: 'ready'
        } : {
          done: !completed,
          state: 'ready'
        }, completed ? '未完了に戻しました' : cheer ? game ? 'おつかれさま！ ひとつ前へ。 ＋10 XP' : 'おつかれさま！ ひとつ前へ。' : '完了しました');
        break;
      }
    case 'now':
    case 'plan':
    case 'all':
    case 'guild':
    case 'settings':
      go(action);
      break;
    case 'calendar-mode':
      calendarMode = value;
      render();
      break;
    case 'calendar-date':
      calendarDate = value;
      calendarMode = 'day';
      render();
      window.scrollTo(0, 0);
      break;
    case 'calendar-today':
      calendarDate = TODAY;
      render();
      break;
    case 'previous':
    case 'next':
      {
        const step = (action === 'next' ? 1 : -1) * (calendarMode === 'week' ? 7 : 1);
        if (calendarMode === 'month') {
          const d = new Date(`${calendarDate}T12:00:00Z`);
          d.setUTCDate(1);
          d.setUTCMonth(d.getUTCMonth() + step);
          calendarDate = d.toISOString().slice(0, 10);
        } else calendarDate = addDays(calendarDate, step);
        render();
        break;
      }
    case 'schedule':
      mutate(t, {
        date: calendarDate
      }, `${dateTitle(calendarDate)}に入れました`);
      break;
    case 'list-mode':
      listMode = value;
      render();
      break;
    case 'save-note':
      notes = notesDraft = document.querySelector('[name=notes]').value;
      toast('メモを保存しました');
      break;
    case 'review':
      reviewDialog(t);
      break;
    case 'member':
      openDialog('picker', `${control.dataset.owner === 'self' ? 'ひろなお' : control.dataset.owner}の仕事`, tasks.filter(t => t.owner === control.dataset.owner && openOn(t)).map(t => `<button type="button" class="picker-row" data-action="detail" data-id="${t.id}"><div><p>${esc(t.title)}</p><small>${statusNames[t.state]}</small></div>${icon('chevron-right')}</button>`).join(''));
      break;
    case 'info':
      info(value);
      break;
    case 'gap':
      {
        const fitting = tasks.filter(t => t.owner === 'self' && !t.date && openOn(t) && t.minutes > 0 && t.minutes <= Number(control.dataset.minutes));
        openDialog('picker', 'この余白をどう使う？', `${fitting.map(t => `<button type="button" class="picker-row" data-action="fill-gap" data-id="${t.id}" data-date="${control.dataset.date}" data-time="${control.dataset.time}"><div><p>${esc(t.title)}</p><small>${duration(t.minutes)}</small></div>${icon('plus')}</button>`).join('')}<button type="button" class="picker-row" data-action="rest">${icon('sun')}<div><p>ひと息つく</p><small>何も入れず、この時間を残します。</small></div></button>`);
        break;
      }
    case 'fill-gap':
      closeDialog(true);
      mutate(t, {
        date: control.dataset.date,
        time: control.dataset.time
      }, '予定に入れました');
      break;
    case 'rest':
      closeDialog(true);
      toast('この時間は、そのまま空けておきます');
      break;
    case 'reset':
      if (closeDialog()) {
        tasks = fixture(scenario);
        focusId = null;
        startedAt = scenario === 'running' ? Date.now() - 720000 : 0;
        render();
        toast('サンプルを元に戻しました');
      }
      break;
  }
});
document.addEventListener('input', event => {
  if (event.target.matches('#notes-form [name=notes]')) notesDraft = event.target.value;
  if (event.target.id === 'task-search' && !event.isComposing) {
    search = event.target.value;
    render();
    document.querySelector('#task-search').focus();
  }
});
document.addEventListener('compositionend', event => {
  if (event.target.id === 'task-search') {
    search = event.target.value;
    render();
    document.querySelector('#task-search').focus();
  }
});
document.addEventListener('change', event => {
  const el = event.target;
  if (el.matches('[data-scenario]')) {
    if (!scenarios.some(([id]) => id === el.value)) return;
    scenario = el.value;
    tasks = fixture(scenario);
    focusId = null;
    startedAt = scenario === 'running' ? Date.now() - 720000 : 0;
    closeDialog(true);
    const url = new URL(location.href);
    url.searchParams.set('scenario', scenario);
    history.replaceState(null, '', url);
    render();
  }
  if (el.dataset.toggle === 'cheer') cheer = el.checked;
  if (el.dataset.toggle === 'game') game = el.checked;
  if (el.dataset.toggle === 'failSave') {
    failSave = el.checked;
    if (activeDialog) activeDialog.dirty = false;
  }
});
document.addEventListener('keydown', event => {
  if (event.isComposing || activeDialog || event.target.matches('input,textarea,select,[contenteditable]')) return;
  const key = event.key.toLowerCase();
  if (((key === 'n' || key === '/') && !event.metaKey && !event.ctrlKey || (event.metaKey || event.ctrlKey) && key === 'k') && !event.altKey) {
    event.preventDefault();
    capture();
    return;
  }
  if (event.ctrlKey || event.metaKey || event.altKey) return;
  if (key === 's' && view === 'now') {
    document.querySelector('.focus-actions [data-action=start]')?.click();
    return;
  }
  if (key === 'j' || key === 'k') {
    const rows = [...document.querySelectorAll('.row-title')].filter(el => el.getClientRects().length);
    const index = rows.indexOf(document.activeElement),
      next = rows[index < 0 ? 0 : Math.min(rows.length - 1, Math.max(0, index + (key === 'j' ? 1 : -1)))];
    if (next) {
      event.preventDefault();
      next.focus();
      next.scrollIntoView({
        block: 'nearest'
      });
    }
    return;
  }
  if (key === 'x') {
    const t = find(document.activeElement?.dataset.id);
    if (t && t.owner === 'self' && openOn(t)) {
      event.preventDefault();
      document.querySelector(`[data-action=complete][data-id="${CSS.escape(t.id)}"]`)?.click();
    }
  }
});
window.addEventListener('hashchange', () => {
  const next = location.hash.slice(1);
  if (navigation.some(([id]) => id === next)) {
    if (closeDialog()) {
      view = next;
      render();
    } else history.replaceState(null, '', `#${view}`);
  }
});
render();
