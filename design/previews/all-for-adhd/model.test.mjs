import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fixture, doneOn, todayTasks, candidates, focusTask, agentSummary, calendarSummary, minutesBetween, weekPlacements, timelineSections } from './model.mjs';
test('daily returns in summary, list and next candidates', () => {
  const tasks = fixture(); const daily = tasks.find(t => t.id === 'desk');
  assert.equal(doneOn(daily), false);
  assert.ok(todayTasks(tasks).includes(daily)); assert.ok(candidates(tasks).includes(daily));
  daily.lastCompleted = '2026-10-27';
  assert.equal(doneOn(daily), true); assert.ok(!candidates(tasks).includes(daily));
});
test('focus excludes future, overdue and agent work; running wins', () => {
  const tasks = fixture();
  assert.deepEqual(candidates(tasks).map(t => t.id), ['focus', 'review', 'walk', 'desk', 'read']);
  assert.equal(focusTask(tasks, 'future').id, 'focus');
  tasks.find(t => t.id === 'walk').state = 'working';
  assert.equal(focusTask(tasks, 'desk').id, 'walk'); assert.equal(focusTask([], null), null);
});
test('agent summary excludes completed and archived work', () => {
  const result = agentSummary(fixture());
  assert.deepEqual([result.review, result.blocked, result.working, result.waiting], [1, 1, 1, 1]);
  assert.deepEqual(result.rows.map(t => t.state), ['review', 'blocked', 'working']);
  assert.equal(agentSummary([]).rows.length, 0);
});

test('calendar dots match the day rows and daily resets', () => {
  const tasks = fixture('running');
  let day = calendarSummary(tasks, '2026-10-27');
  assert.equal(day.items.length, 7);
  assert.deepEqual(day.states, ['done', 'done', 'working', 'ready', 'ready', 'ready', 'ready']);
  assert.equal(day.label, '7件、予定4件、作業中1件、完了2件');
  const daily = tasks.find(t => t.id === 'desk');
  daily.lastCompleted = '2026-10-27';
  assert.equal(calendarSummary(tasks, '2026-10-27').completed, 3);
  assert.deepEqual(calendarSummary(tasks, '2026-10-28').states, ['ready', 'ready']);
  tasks.find(t => t.id === 'focus').archived = true;
  assert.equal(calendarSummary(tasks, '2026-10-27').items.length, 6);
  assert.deepEqual(calendarSummary([], '2026-10-27').states, []);
});

test('end time produces an estimate, including overnight work', () => {
  assert.equal(minutesBetween('10:30', '11:15'), 45);
  assert.equal(minutesBetween('23:30', '00:15'), 45);
  assert.equal(minutesBetween('10:00', '10:00'), 1440);
  assert.equal(minutesBetween('', '11:00'), 0);
  assert.equal(minutesBetween('24:00', '11:00'), 0);
});

test('week blocks split overlapping work and fold excess without losing tasks', () => {
  const a = {id: 'a', time: '10:00', minutes: 60};
  const b = {id: 'b', time: '10:15', minutes: 30};
  const c = {id: 'c', time: '10:20', minutes: 20};
  assert.deepEqual(weekPlacements([b, a]).map(p => [p.task.id, p.lane, p.lanes]), [['a', 0, 2], ['b', 1, 2]]);
  const folded = weekPlacements([a, b, c]);
  assert.equal(folded.length, 2); assert.equal(folded[1].hidden, 2);
  assert.equal(folded[0].task.id, 'a');
  const short = weekPlacements([{...a, minutes: 5}, {...b, minutes: 5}]);
  assert.equal(short[1].lane, 1); // Their tappable faces must not overlap.
  assert.equal(weekPlacements([{...a}, {id: 'd', time: '11:00', minutes: 60}])[1].lanes, 1);
  assert.equal(weekPlacements([{id: 'late', time: '23:50', minutes: 90}])[0].end, 1440);
  assert.deepEqual(weekPlacements([{id: 'untimed', time: '', minutes: 30}]), []);
});
test('timeline separates past/anytime and keeps an overrun working task visible', () => {
  const tasks = todayTasks(fixture());
  const groups = timelineSections(tasks);
  assert.deepEqual(groups.past.map(t => t.id), ['mail', 'week']);
  assert.deepEqual(groups.timed.map(t => t.id), ['focus', 'review', 'walk']);
  assert.deepEqual(groups.anytime.map(t => t.id), ['desk', 'read']);
  tasks.find(t => t.id === 'focus').time = '08:00';
  tasks.find(t => t.id === 'focus').state = 'working';
  assert.ok(timelineSections(tasks).timed.some(t => t.id === 'focus'));
  assert.deepEqual(timelineSections(tasks, '2026-10-28').past, []);
});
