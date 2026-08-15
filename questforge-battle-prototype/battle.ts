// @ts-nocheck
const classData = {
  sentinel: {
    name: "Sentinel",
    sprite: "../questforge-prototype/assets/avatar-role-sentinel.png",
    skill: "Aegis Break",
    cost: 18,
    description: "中ダメージ + Guard",
  },
  archivist: {
    name: "Archivist",
    sprite: "../questforge-prototype/assets/avatar-role-archivist.png",
    skill: "Weakness Note",
    cost: 16,
    description: "弱点解析 + MP還元",
  },
  operator: {
    name: "Operator",
    sprite: "../questforge-prototype/assets/avatar-role-operator.png",
    skill: "Protocol Spike",
    cost: 20,
    description: "高ダメージ + Rage抑制",
  },
  alchemist: {
    name: "Alchemist",
    sprite: "../questforge-prototype/assets/avatar-role-alchemist.png",
    skill: "Bloom Tonic",
    cost: 18,
    description: "回復 + 毒ダメージ",
  },
  ranger: {
    name: "Ranger",
    sprite: "../questforge-prototype/assets/avatar-role-ranger.png",
    skill: "Twin Shot",
    cost: 18,
    description: "2連撃 + Focus倍率",
  },
  artificer: {
    name: "Artificer",
    sprite: "../questforge-prototype/assets/avatar-role-artificer.png",
    skill: "Gear Cannon",
    cost: 22,
    description: "大ダメージ + Shield",
  },
};

const initialState = {
  classId: "sentinel",
  turn: 1,
  hp: 56,
  maxHp: 60,
  mp: 12,
  maxMp: 80,
  focus: 0,
  guard: 0,
  shield: 0,
  tasksCompleted: 0,
  battleEnded: false,
  boss: {
    name: "Deadline Wraith",
    hp: 140,
    maxHp: 140,
    rage: 0,
    vulnerable: 0,
    poison: 0,
  },
  log: [
    {
      kind: "system",
      text: "タスクでMPを稼ぎ、コマンドで戦う原型です。",
    },
  ],
};

let state = clone(initialState);

const els = {
  playerName: document.querySelector("#playerName"),
  playerSprite: document.querySelector("#playerSprite"),
  playerHpText: document.querySelector("#playerHpText"),
  playerMpText: document.querySelector("#playerMpText"),
  playerHpBar: document.querySelector("#playerHpBar"),
  playerMpBar: document.querySelector("#playerMpBar"),
  playerStatusRow: document.querySelector("#playerStatusRow"),
  bossName: document.querySelector("#bossName"),
  bossSprite: document.querySelector("#bossSprite"),
  bossHpText: document.querySelector("#bossHpText"),
  bossHpBar: document.querySelector("#bossHpBar"),
  bossRageText: document.querySelector("#bossRageText"),
  bossStatusRow: document.querySelector("#bossStatusRow"),
  turnValue: document.querySelector("#turnValue"),
  taskCountText: document.querySelector("#taskCountText"),
  mainMessage: document.querySelector("#mainMessage"),
  battleLog: document.querySelector("#battleLog"),
  battleResultText: document.querySelector("#battleResultText"),
  contractPreview: document.querySelector("#contractPreview"),
  classGrid: document.querySelector("#classGrid"),
  classSkillText: document.querySelector("#classSkillText"),
  skillCommandName: document.querySelector("#skillCommandName"),
  skillCommandCost: document.querySelector("#skillCommandCost"),
  commandButtons: document.querySelectorAll("[data-command]"),
  taskButtons: document.querySelectorAll("[data-task-action]"),
  classButtons: document.querySelectorAll("[data-class]"),
  resetBattleButton: document.querySelector("#resetBattleButton"),
};

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function addLog(text, kind = "info") {
  state.log = [{ text, kind }, ...state.log].slice(0, 10);
}

function gainMp(amount, reason) {
  const before = state.mp;
  state.mp = clamp(state.mp + amount, 0, state.maxMp);
  addLog(`<strong>${reason}</strong> MP +${state.mp - before}`);
}

function takeDamage(amount, source) {
  let damage = amount;
  if (state.guard > 0) {
    damage = Math.ceil(damage / 2);
    state.guard -= 1;
  }
  if (state.shield > 0) {
    const blocked = Math.min(state.shield, damage);
    damage -= blocked;
    state.shield -= blocked;
  }
  state.hp = clamp(state.hp - damage, 0, state.maxHp);
  addLog(`${source} HP -${damage}`, "danger");
  flash(els.playerSprite, "sprite-hit");
  if (state.hp <= 0) {
    state.battleEnded = true;
    addLog("<strong>敗北</strong> HPが尽きました。タスクで立て直す設計にする余地あり。", "danger");
  }
}

function dealDamage(amount, source) {
  let damage = amount;
  if (state.boss.vulnerable > 0) {
    damage = Math.round(damage * 1.35);
    state.boss.vulnerable -= 1;
  }
  state.boss.hp = clamp(state.boss.hp - damage, 0, state.boss.maxHp);
  addLog(`<strong>${source}</strong> ${damage} damage`);
  flash(els.bossSprite, "sprite-hit");
  if (state.boss.hp <= 0) {
    state.battleEnded = true;
    state.boss.hp = 0;
    addLog("<strong>勝利</strong> タスクで稼いだMPを使ってボスを撃破。", "success");
  }
}

function completeTask(action) {
  if (state.battleEnded) return;
  const table = {
    daily: () => {
      state.tasksCompleted += 1;
      state.focus += 1;
      gainMp(14, "今日の約束");
    },
    todo: () => {
      state.tasksCompleted += 1;
      gainMp(20, "一回クエスト");
    },
    habit: () => {
      state.tasksCompleted += 1;
      gainMp(6, "習慣ログ");
    },
    toggl: () => {
      state.tasksCompleted += 1;
      state.focus += 2;
      gainMp(18, "Toggl 25分");
    },
    missed: () => {
      state.boss.rage += 1;
      takeDamage(8 + state.boss.rage, "期限切れ");
    },
  };
  table[action]?.();
  render();
}

function useCommand(command) {
  if (state.battleEnded) return;
  const currentClass = classData[state.classId];
  const costs = {
    attack: 0,
    skill: currentClass.cost,
    guard: 6,
    heal: 14,
    burst: 40,
  };
  const cost = costs[command] ?? 0;
  if (state.mp < cost) {
    addLog("MPが足りません。タスクでMPを稼ぐ必要があります。", "danger");
    render();
    return;
  }
  state.mp -= cost;
  flash(els.playerSprite, "sprite-cast");

  if (command === "attack") {
    dealDamage(9 + Math.min(6, state.focus), "Attack");
  }
  if (command === "skill") {
    useClassSkill(currentClass);
  }
  if (command === "guard") {
    state.guard += 1;
    addLog("<strong>Guard</strong> 次の被ダメージを半減。");
  }
  if (command === "heal") {
    const healed = Math.min(22, state.maxHp - state.hp);
    state.hp += healed;
    addLog(`<strong>Heal</strong> HP +${healed}`);
  }
  if (command === "burst") {
    const focusBonus = Math.min(20, state.focus * 4);
    dealDamage(46 + focusBonus, "Burst");
    state.focus = Math.max(0, state.focus - 2);
  }

  if (!state.battleEnded) {
    enemyTurn();
  }
  render();
}

function useClassSkill(currentClass) {
  if (state.classId === "sentinel") {
    dealDamage(22, currentClass.skill);
    state.guard += 1;
  }
  if (state.classId === "archivist") {
    state.boss.vulnerable += 2;
    dealDamage(12, currentClass.skill);
    state.mp = clamp(state.mp + 8, 0, state.maxMp);
    addLog("弱点解析: 次の攻撃が強化。MP +8");
  }
  if (state.classId === "operator") {
    dealDamage(28, currentClass.skill);
    state.boss.rage = Math.max(0, state.boss.rage - 1);
  }
  if (state.classId === "alchemist") {
    const healed = Math.min(14, state.maxHp - state.hp);
    state.hp += healed;
    state.boss.poison += 3;
    dealDamage(12, currentClass.skill);
    addLog(`調合効果: HP +${healed} / 毒3`);
  }
  if (state.classId === "ranger") {
    dealDamage(13 + state.focus, `${currentClass.skill} 1`);
    dealDamage(13 + state.focus, `${currentClass.skill} 2`);
  }
  if (state.classId === "artificer") {
    dealDamage(32, currentClass.skill);
    state.shield += 8;
  }
}

function enemyTurn() {
  if (state.boss.poison > 0) {
    dealDamage(state.boss.poison, "毒");
    state.boss.poison -= 1;
    if (state.battleEnded) return;
  }
  state.turn += 1;
  const baseDamage = 9 + state.boss.rage * 2;
  if (state.turn % 3 === 0) {
    state.boss.rage += 1;
    takeDamage(baseDamage + 4, "締切レイスの強攻撃");
  } else {
    takeDamage(baseDamage, "締切レイスの攻撃");
  }
  if (state.boss.rage >= 3 && state.mp > 0) {
    const drain = Math.min(6, state.mp);
    state.mp -= drain;
    addLog(`Rage効果: MP -${drain}`, "danger");
  }
}

function setClass(classId) {
  if (!classData[classId]) return;
  state.classId = classId;
  addLog(`${classData[classId].name} に変更。スキル: ${classData[classId].skill}`);
  render();
}

function resetBattle() {
  state = clone(initialState);
  render();
}

function flash(element, className) {
  element.classList.remove(className);
  void element.offsetWidth;
  element.classList.add(className);
  window.setTimeout(() => element.classList.remove(className), 380);
}

function render() {
  const currentClass = classData[state.classId];
  els.playerName.textContent = `Astra / ${currentClass.name}`;
  els.playerSprite.src = currentClass.sprite;
  els.classSkillText.textContent = currentClass.skill;
  els.skillCommandName.textContent = currentClass.skill;
  els.skillCommandCost.textContent = `${currentClass.cost} MP / ${currentClass.description}`;
  els.turnValue.textContent = state.turn;
  els.taskCountText.textContent = `${state.tasksCompleted} completed`;
  els.bossName.textContent = state.boss.name;
  els.bossRageText.textContent = state.boss.rage;

  els.playerHpText.textContent = `${state.hp}/${state.maxHp}`;
  els.playerMpText.textContent = `${state.mp}/${state.maxMp}`;
  els.bossHpText.textContent = `${state.boss.hp}/${state.boss.maxHp}`;
  els.playerHpBar.style.width = `${(state.hp / state.maxHp) * 100}%`;
  els.playerMpBar.style.width = `${(state.mp / state.maxMp) * 100}%`;
  els.bossHpBar.style.width = `${(state.boss.hp / state.boss.maxHp) * 100}%`;

  renderStatus(els.playerStatusRow, [
    state.focus ? `Focus ${state.focus}` : "",
    state.guard ? `Guard ${state.guard}` : "",
    state.shield ? `Shield ${state.shield}` : "",
  ]);
  renderStatus(els.bossStatusRow, [
    state.boss.vulnerable ? `Weak ${state.boss.vulnerable}` : "",
    state.boss.poison ? `Poison ${state.boss.poison}` : "",
  ]);

  els.classButtons.forEach((button) => {
    button.classList.toggle("active", button.dataset.class === state.classId);
  });
  els.commandButtons.forEach((button) => {
    const command = button.dataset.command;
    const cost = command === "skill"
      ? currentClass.cost
      : { attack: 0, guard: 6, heal: 14, burst: 40 }[command] || 0;
    button.disabled = state.battleEnded || state.mp < cost;
  });
  els.taskButtons.forEach((button) => {
    button.disabled = state.battleEnded;
  });

  els.battleResultText.textContent = state.battleEnded
    ? state.boss.hp <= 0 ? "勝利" : "敗北"
    : "進行中";
  els.mainMessage.innerHTML = state.log[0]?.text || "コマンドを選んでください。";
  els.battleLog.innerHTML = "";
  state.log.slice(1).forEach((entry) => {
    const item = document.createElement("div");
    item.className = entry.kind;
    item.innerHTML = entry.text;
    els.battleLog.appendChild(item);
  });

  els.contractPreview.textContent = JSON.stringify(createContractPreview(), null, 2);
}

function renderStatus(target, values) {
  target.innerHTML = "";
  values.filter(Boolean).forEach((value) => {
    const item = document.createElement("span");
    item.className = "status-pill";
    item.textContent = value;
    target.appendChild(item);
  });
}

function createContractPreview() {
  return {
    resourceModel: {
      hp: state.hp,
      mp: state.mp,
      focus: state.focus,
      classId: state.classId,
    },
    questEvent: {
      type: "task.completed",
      payload: {
        mpDelta: 14,
        focusDelta: 1,
      },
    },
    battleEvent: {
      type: "battle.commandUsed",
      payload: {
        command: "skill",
        mpCost: classData[state.classId].cost,
        classId: state.classId,
      },
    },
  };
}

els.taskButtons.forEach((button) => {
  button.addEventListener("click", () => completeTask(button.dataset.taskAction));
});

els.commandButtons.forEach((button) => {
  button.addEventListener("click", () => useCommand(button.dataset.command));
});

els.classButtons.forEach((button) => {
  button.addEventListener("click", () => setClass(button.dataset.class));
});

els.resetBattleButton.addEventListener("click", resetBattle);

render();
