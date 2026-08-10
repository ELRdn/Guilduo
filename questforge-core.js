(function attachQuestForgeCore(root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) {
    module.exports = api;
  }
  root.QuestForgeCore = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function createQuestForgeCore() {
  "use strict";

  const CURRENT_SCHEMA_VERSION = 5;
  const TASK_EVENT_LIMIT = 250;

  function difficultyScale(difficulty) {
    return {
      trivial: 0.5,
      easy: 1,
      medium: 1.5,
      hard: 2.5,
    }[difficulty] || 1;
  }

  function completionClaimKey(task, dateText) {
    if (task.kind === "daily") {
      return `${task.id}:daily:${dateText}`;
    }
    if (task.kind === "todo" && task.repeat && task.repeat !== "none") {
      return `${task.id}:todo:${task.dueDate || dateText}`;
    }
    return `${task.id}:todo:once`;
  }

  function claimCompletion(rewardClaims, task, dateText, claimedAt) {
    const key = completionClaimKey(task, dateText);
    const claims = rewardClaims && typeof rewardClaims === "object" ? rewardClaims : {};
    if (claims[key]) {
      return { granted: false, key, rewardClaims: { ...claims } };
    }
    return {
      granted: true,
      key,
      rewardClaims: { ...claims, [key]: claimedAt },
    };
  }

  function taskRewardDelta(task, weakKind = "") {
    const scale = difficultyScale(task.difficulty);
    const baseMp = {
      habit: 6,
      daily: 14,
      todo: 20,
    }[task.kind] || 0;
    const weakBonus = weakKind === task.kind ? 4 : 0;
    return {
      gems: Math.round(7 * scale),
      xp: Math.round(12 * scale),
      mp: baseMp ? Math.max(1, Math.round(baseMp * scale + weakBonus)) : 0,
    };
  }

  function appendTaskEvent(events, event, limit = TASK_EVENT_LIMIT) {
    const current = Array.isArray(events) ? events : [];
    return [event, ...current].slice(0, limit);
  }

  function isArchivedTask(task) {
    return Boolean(task && task.lifecycleState === "archived");
  }

  function isCompletedTask(task) {
    return Boolean(task && task.lifecycleState === "completed");
  }

  function isBattleTaskEligible(task) {
    if (!task || !["habit", "daily", "todo"].includes(task.kind)) return false;
    if (task.negativeOnly) return false;
    if (["completed", "archived"].includes(task.lifecycleState)) return false;
    return task.kind === "habit" || !task.done;
  }

  function battleCommandCost(command, skillCost = 0) {
    return {
      attack: 0,
      skill: skillCost,
      guard: 6,
      heal: 14,
      burst: 40,
    }[command] || 0;
  }

  function nextDueDateForTask(task, fromDateText) {
    const repeat = task.repeat || (task.kind === "daily" ? "daily" : "none");
    if (repeat === "none") {
      return task.dueDate || fromDateText;
    }
    let cursor = task.dueDate && task.dueDate >= fromDateText
      ? parseLocalDate(task.dueDate)
      : parseLocalDate(fromDateText);

    if (repeat === "daily") {
      return formatDateInput(cursor);
    }
    if (repeat === "weekdays") {
      while (cursor.getDay() === 0 || cursor.getDay() === 6) {
        cursor = addDays(cursor, 1);
      }
      return formatDateInput(cursor);
    }
    if (repeat === "weekly") {
      const base = task.dueDate ? parseLocalDate(task.dueDate) : cursor;
      const weekday = base.getDay();
      while (cursor.getDay() !== weekday || formatDateInput(cursor) < fromDateText) {
        cursor = addDays(cursor, 1);
      }
      return formatDateInput(cursor);
    }
    if (repeat === "monthly") {
      const base = task.dueDate ? parseLocalDate(task.dueDate) : cursor;
      const day = base.getDate();
      let candidate = new Date(cursor.getFullYear(), cursor.getMonth(), Math.min(day, daysInMonth(cursor)));
      while (formatDateInput(candidate) < fromDateText) {
        const nextMonth = new Date(candidate.getFullYear(), candidate.getMonth() + 1, 1);
        candidate = new Date(nextMonth.getFullYear(), nextMonth.getMonth(), Math.min(day, daysInMonth(nextMonth)));
      }
      return formatDateInput(candidate);
    }
    return task.dueDate || fromDateText;
  }

  function parseLocalDate(dateText) {
    return new Date(`${dateText}T00:00:00`);
  }

  function addDays(date, amount) {
    const next = new Date(date);
    next.setDate(next.getDate() + amount);
    return next;
  }

  function daysInMonth(date) {
    return new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate();
  }

  function formatDateInput(date) {
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
  }

  return {
    CURRENT_SCHEMA_VERSION,
    TASK_EVENT_LIMIT,
    appendTaskEvent,
    battleCommandCost,
    claimCompletion,
    completionClaimKey,
    difficultyScale,
    isBattleTaskEligible,
    isArchivedTask,
    isCompletedTask,
    nextDueDateForTask,
    taskRewardDelta,
  };
});
