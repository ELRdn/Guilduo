// LPv3 hands-on demo: a bug report travels to the agent and back as real-looking
// Guilduo requests. Timing and DOM live here; lpv3/demo.ts owns the transitions.
import { automaticStates, initialState, transition, type DemoEvent, type DemoState } from "./demo";

type Line = { kind: "call" | "result" | "note" | "ok" | "wait" | "advance"; text?: string; tool?: string; effect?: "highlight" | "fix" | "safe" };

const en = document.documentElement.lang === "en";
const text = (ja: string, english: string): string => en ? english : ja;
function mount(experience: HTMLElement): void {
  const $ = <T extends HTMLElement = HTMLElement>(selector: string): T => {
    const node = experience.querySelector<T>(selector);
    if (!node) throw new Error("LPv3 demo element missing: " + selector);
    return node;
  };
  const panes = $(".xp");
  const log = $<HTMLOListElement>("[data-log]");
  const phone = $("[data-phone]");
  const live = $("[data-live]");
  const reduced = matchMedia("(prefers-reduced-motion: reduce)");
  const idleLog = log.innerHTML;

  let state: DemoState = initialState;
  let choice: "a" | "b" = "a";
  let pushed = false;
  let refixed = false;
  let settled = true;
  let highlight = false;
  let fixed = false;
  let safe = false;
  let replies: Record<string, string> = {};
  let queue: Line[] = [];
  let timer: number | undefined;
  let onScreen = true;

  const quest = '{ questId: "q_001" }';
  const said = (key: string): string => replies[key] ?? "";
  function script(): Line[] {
    switch (state) {
      case "investigating": return [
        { kind: "call", tool: "get_quest", text: quest },
        { kind: "result", text: text("←「iPhoneで『購入する』が押せない」", "← “Buy now doesn’t respond on iPhone”") },
        { kind: "call", tool: "transition_quest_handoff", text: '{ questId: "q_001", state: "working" }' },
        { kind: "note", text: text("iPhone SE（375×667）のSafariで再現しました", "Reproduced in Safari on iPhone SE (375×667)") },
        { kind: "note", effect: "highlight", text: text("原因：固定フッター（z-index: 50）が、購入ボタンの下半分を覆っている", "Cause: the fixed footer (z-index: 50) covers the lower half of the buy button") },
        { kind: "call", tool: "request_human_review", text: text('{ title: "直し方を選んでください", completionCriteria: "A〜Cから1つ選ぶ" }', '{ title: "Which fix should I use?", completionCriteria: "Pick one of A–C" }') },
        { kind: "advance" },
      ];
      case "choose": return [{ kind: "wait", text: text("あなたの判断を待っています", "Waiting for your decision") }];
      case "pushback": return [
        { kind: "call", tool: "list_human_requests", text: quest },
        { kind: "result", text: "← " + said("choose") },
        { kind: "note", text: text("C案だと、スマホから特商法表記へのリンクが消えてしまう", "Option C would drop the legal-notice link on mobile") },
        { kind: "call", tool: "request_human_review", text: text('{ title: "C案は、おすすめしません", completionCriteria: "AかBを選ぶ" }', '{ title: "I’d advise against C", completionCriteria: "Pick A or B" }') },
        { kind: "wait", text: text("あなたの判断を待っています", "Waiting for your decision") },
      ];
      case "fixing": return [
        { kind: "call", tool: "list_human_requests", text: quest },
        { kind: "result", text: "← " + said(pushed ? "pushback" : "choose") },
        { kind: "note", text: choice === "a"
          ? text("購入ボタンを画面下の固定バーに移し、フッターより前面へ", "Moving the buy button into a bar pinned above the footer")
          : text("ページ下に、フッターの高さ分（56px）の余白を追加", "Adding 56px of bottom space for the footer") },
        { kind: "note", effect: "fix", text: text("編集 src/styles/product.css", "Edited src/styles/product.css") },
        { kind: "ok", text: text("e2e checkout-mobile.spec　12件 通過", "e2e checkout-mobile.spec  12 passed") },
        { kind: "call", tool: "request_human_review", text: text('{ title: "実機で、押せるか確かめてください", checkTarget: "お手元のiPhone" }', '{ title: "Please try it on a real iPhone", checkTarget: "Your iPhone" }') },
        { kind: "advance" },
      ];
      case "device_check":
      case "recheck": return [{ kind: "wait", text: text("実機での確認を待っています", "Waiting for your device check") }];
      case "refixing": return [
        { kind: "call", tool: "list_human_requests", text: quest },
        { kind: "result", text: "← " + said("device") },
        { kind: "note", text: text("実機では、ホームバーとSafariのツールバーの分だけ画面下が狭かった", "On a real device, the home bar and Safari toolbar take room at the bottom") },
        { kind: "note", effect: "safe", text: text("編集 product.css：env(safe-area-inset-bottom) の余白を追加", "Edited product.css: add env(safe-area-inset-bottom) padding") },
        { kind: "ok", text: text("e2e checkout-mobile.spec　14件 通過（safe-areaの確認を2件追加）", "e2e checkout-mobile.spec  14 passed (2 safe-area checks added)") },
        { kind: "call", tool: "request_human_review", text: text('{ title: "もう一度、実機で確かめてください" }', '{ title: "Please check once more on your iPhone" }') },
        { kind: "advance" },
      ];
      case "completing": return [
        { kind: "call", tool: "list_human_requests", text: quest },
        { kind: "result", text: "← " + said("device") },
        { kind: "call", tool: "update_quest", text: '{ questId: "q_001", lifecycleState: "completed" }' },
        { kind: "ok", text: text("QUEST / 001 を完了にしました", "Marked QUEST / 001 as completed") },
        { kind: "advance" },
      ];
      default: return [];
    }
  }

  const liveText: Record<DemoState, string> = {
    intro: text("まずは、バグ報告をAIに任せてみよう。", "Start by handing the bug report to your agent."),
    investigating: text("Human → Agent：AIがMCPでQuestを受け取り、原因を調べています。", "Human → Agent: your agent picked up the quest through MCP and is investigating."),
    choose: text("Agent → Human：直し方の判断が、あなたに届きました。", "Agent → Human: a decision about the fix is waiting for you."),
    pushback: text("AIが、C案の問題点を指摘してきました。", "Your agent flagged a problem with option C."),
    fixing: text("Human → Agent：あなたの返信をもとに、AIが修正しています。", "Human → Agent: your agent is fixing it based on your reply."),
    device_check: text("Agent → Human：AIにはできない、実機での確認を頼まれました。", "Agent → Human: you’ve been asked for a device check the agent can’t do."),
    refixing: text("AIが原因を突き止めて、追加で修正しています。", "Your agent found the cause and is fixing it again."),
    recheck: text("修正版が届きました。もう一度、実機で確かめよう。", "A new fix is ready. Check it on your iPhone again."),
    completing: text("確認が取れたので、AIがQuestを完了にしています。", "With your check done, your agent is closing the quest."),
    complete: text("2者。1チーム。仕事は、どちらからでも。", "2 Sides. 1 Team. Work Goes Both Ways."),
  };

  function setView(view: "guilduo" | "agent"): void {
    if (panes.dataset.view === view) return;
    panes.dataset.view = view;
    experience.querySelectorAll<HTMLButtonElement>("button[data-view]").forEach(button => {
      button.setAttribute("aria-pressed", String(button.dataset.view === view));
    });
    // Tabs only show on narrow screens; keep them in sight after an automatic switch.
    const tabs = $(".mobile-views");
    if (tabs.offsetParent && tabs.getBoundingClientRect().top < 0) tabs.scrollIntoView({ block: "start", behavior: reduced.matches ? "auto" : "smooth" });
  }

  // Entrance played once per new item, so switching tabs never replays it.
  function reveal(node: HTMLElement): void {
    if (document.documentElement.dataset.motion !== "on") return;
    node.animate([{ opacity: .2, transform: "translateY(9px)" }, { opacity: 1, transform: "none" }], { duration: 380, easing: "cubic-bezier(.22,.68,0,1)" });
  }

  function append(line: Line): void {
    if (log.querySelector(".xp-idle")) log.replaceChildren();
    log.querySelector(".xp-wait")?.remove();
    const item = document.createElement("li");
    item.className = "xp-" + line.kind;
    if (line.tool) {
      const tool = document.createElement("b");
      tool.textContent = line.tool;
      item.append("› ", tool, "(" + line.text + ")");
    } else item.textContent = (line.kind === "ok" ? "✓ " : "") + (line.text ?? "");
    log.append(item);
    reveal(item);
    log.scrollTop = log.scrollHeight;
    if (line.effect === "highlight") highlight = true;
    if (line.effect === "fix") { fixed = true; highlight = false; }
    if (line.effect === "safe") safe = true;
    renderPhone();
  }

  const pace: Record<Line["kind"], number> = { call: 750, result: 500, note: 850, ok: 750, wait: 650, advance: 700 };
  function pump(): void {
    if (timer !== undefined || !queue.length || !onScreen || document.hidden) return;
    timer = window.setTimeout(() => {
      timer = undefined;
      const line = queue.shift()!;
      if (line.kind === "advance") { dispatch("advance"); return; }
      append(line);
      if (!queue.length) settle(); else pump();
    }, reduced.matches ? 60 : pace[queue[0].kind]);
  }
  function settle(): void {
    settled = true;
    render();
    if (automaticStates.includes(state) || state === "intro" || state === "complete") return;
    setView("guilduo");
    // Bring the request that just arrived into view if it landed off screen.
    const card = experience.querySelector<HTMLElement>("[data-reply-for]:not([hidden])")?.closest<HTMLElement>(".xp-card");
    const rect = card?.getBoundingClientRect();
    if (card && rect && (rect.top < 0 || rect.bottom > innerHeight)) card.scrollIntoView({ block: rect.height > innerHeight ? "start" : "nearest", behavior: reduced.matches ? "auto" : "smooth" });
  }

  function renderPhone(): void {
    phone.dataset.phone = fixed ? "fix-" + choice : "bug";
    phone.dataset.highlight = String(highlight);
    phone.dataset.safe = String(safe);
    const version = $("[data-phone-version]");
    const note = $("[data-phone-note]");
    if (state === "complete") {
      version.textContent = (safe ? "v3" : "v2") + text(" 公開中", " live");
      note.textContent = text("修正版が公開されました。", "The fix is live.");
    } else if (safe) {
      version.textContent = text("v3 修正版", "v3 fix");
      note.textContent = text("ホームバーの分の余白も確保しました。", "Space for the home bar is now reserved too.");
    } else if (fixed) {
      version.textContent = text("v2 修正版", "v2 fix");
      note.textContent = choice === "a"
        ? text("購入ボタンを画面下に固定しました。", "The buy button is pinned to the bottom.")
        : text("フッターの高さ分、余白を足しました。", "Space for the footer has been added.");
    } else {
      version.textContent = text("v1 公開中", "v1 live");
      note.textContent = highlight
        ? text("赤枠の重なりが、タップを受け止めていました。", "The overlap in red was catching the taps.")
        : text("購入ボタンの下半分が、フッターに隠れています。", "The footer hides the lower half of the buy button.");
    }
  }

  function render(): void {
    experience.dataset.state = state;
    experience.dataset.busy = String(!settled);
    live.textContent = liveText[state];
    const order: DemoState[] = ["intro", "investigating", "choose", "pushback", "fixing", "device_check", "refixing", "recheck", "completing", "complete"];
    const past = (from: DemoState): boolean => order.indexOf(state) >= order.indexOf(from);
    const at = (from: DemoState): boolean => order.indexOf(state) > order.indexOf(from) || (state === from && settled);
    const waiting = settled && ["choose", "pushback", "device_check", "recheck"].includes(state);

    $("[data-bug-status]").textContent = {
      intro: text("下書き", "Draft"), investigating: text("AIが作業中", "Agent working"), choose: text("判断待ち", "Awaiting decision"),
      pushback: text("判断待ち", "Awaiting decision"), fixing: text("AIが修正中", "Agent fixing"), device_check: text("確認待ち", "Awaiting check"),
      refixing: text("AIが修正中", "Agent fixing"), recheck: text("確認待ち", "Awaiting check"), completing: text("AIが完了処理中", "Agent closing"), complete: text("完了", "Done"),
    }[state];
    $('[data-action="start"]').hidden = state !== "intro";

    const choose = $('[data-card="choose"]');
    const pushback = $('[data-card="pushback"]');
    const device = $('[data-card="device"]');
    for (const [card, show] of [[choose, at("choose")], [pushback, pushed && at("pushback")], [device, at("device_check")]] as const) {
      const appearing = card.hidden && show;
      card.hidden = !show;
      if (appearing) reveal(card);
    }
    const rechecking = state === "recheck" || (refixed && ["completing", "complete"].includes(state));
    $("[data-device-key]").innerHTML = (rechecking ? "REVIEW / 004" : "REVIEW / 003") + ' <span class="muted">← 001</span>';
    $("[data-device-title]").textContent = rechecking
      ? text("もう一度、実機で確かめてください", "Please check once more on your iPhone")
      : text("実機で、押せるか確かめてください", "Please try it on a real iPhone");
    $("[data-device-body]").textContent = rechecking
      ? text("ホームバーの領域を考慮して直しました。テスト14件が通っています。もう一度、押してみてください。", "I’ve made room for the home bar, and 14 tests pass. Could you tap it once more?")
      : text("シミュレーターでは、テスト12件がすべて通りました。ただ、私は実機のiPhoneには触れられません。お手元のiPhoneで、購入ボタンを押してみてください。", "All 12 tests pass in the simulator, but I can’t touch a real iPhone. Could you tap the buy button on yours?");
    $('[data-action="broken"]').hidden = rechecking;

    for (const [key, open] of [["choose", state === "choose"], ["pushback", state === "pushback"], ["device", state === "device_check" || state === "recheck"]] as const) {
      $(`[data-reply-for="${key}"]`).hidden = !(open && settled);
      const reply = $(`[data-reply="${key}"]`);
      const answered = !open && Boolean(replies[key]);
      reply.hidden = !answered;
      reply.textContent = answered ? text("あなたの返信：", "Your reply: ") + replies[key] : "";
      // Answered requests fold down to title and reply, like a handled inbox item.
      $(`[data-card="${key}"]`).dataset.done = String(answered);
      $(`[data-${key}-status]`).textContent = open
        ? (key === "device" ? text("あなたの担当", "Assigned to you") : text("あなたの判断待ち", "Needs your decision"))
        : key === "device" && ["completing", "complete"].includes(state) ? text("確認完了", "Checked") : text("返信済み", "Replied");
    }
    experience.querySelectorAll<HTMLElement>("[data-option]").forEach(option => {
      option.dataset.picked = String(option.dataset.option === choice && past("fixing"));
      option.dataset.declined = String(option.dataset.option === "c" && pushed);
    });

    $("[data-empty]").hidden = !choose.hidden;
    $("[data-replay]").hidden = state !== "complete";
    $("[data-inbox-count]").textContent = waiting ? "1" : "";
    $("[data-agent-state]").textContent = state === "intro" ? text("待機中", "Idle")
      : state === "complete" ? text("完了", "Done")
      : waiting ? text("返信待ち", "Waiting on you") : text("作業中", "Working");
    const step = ["intro", "investigating"].includes(state) ? 0 : ["choose", "pushback", "fixing"].includes(state) ? 1
      : ["device_check", "refixing", "recheck"].includes(state) ? 2 : 3;
    experience.querySelectorAll<HTMLElement>(".stepper [data-step]").forEach(node => {
      if (Number(node.dataset.step) === step) node.setAttribute("aria-current", "step");
      else node.removeAttribute("aria-current");
    });
    renderPhone();
  }

  function dispatch(event: DemoEvent): void {
    const next = transition(state, event);
    if (next === state && event !== "restart") return;
    window.clearTimeout(timer);
    timer = undefined;
    if (event === "restart") {
      choice = "a"; pushed = false; refixed = false; highlight = false; fixed = false; safe = false; replies = {};
      log.innerHTML = idleLog;
      setView("guilduo");
    }
    if (event === "choose_a" || event === "choose_b") choice = event === "choose_a" ? "a" : "b";
    if (event === "choose_c") pushed = true;
    if (event === "broken") refixed = true;
    state = next;
    queue = script();
    settled = queue.length === 0;
    render();
    if (automaticStates.includes(state)) setView("agent");
    pump();
  }

  const replyText: Partial<Record<string, [string, string]>> = {
    choose_a: ["「Aでお願いします。」", "“Go with A.”"], choose_b: ["「Bでお願いします。」", "“Go with B.”"], choose_c: ["「Cでお願いします。」", "“Go with C.”"],
    works: ["「押せた。」", "“It works.”"], broken: ["「まだ押せない。」", "“Still stuck.”"],
  };
  experience.querySelectorAll<HTMLButtonElement>("[data-action]").forEach(button => {
    button.addEventListener("click", () => {
      const action = button.dataset.action as DemoEvent;
      const words = replyText[action];
      if (words) {
        const key = state === "pushback" ? "pushback" : state === "choose" ? "choose" : "device";
        replies[key] = key === "pushback" ? text(action === "choose_a" ? "「では、Aで。」" : "「では、Bで。」", action === "choose_a" ? "“A, then.”" : "“B, then.”") : text(...words);
      }
      dispatch(action);
      live.tabIndex = -1;
      live.focus({ preventScroll: true });
    });
  });
  experience.querySelectorAll<HTMLButtonElement>("button[data-view]").forEach(button => {
    button.addEventListener("click", () => setView(button.dataset.view === "agent" ? "agent" : "guilduo"));
  });
  // Hold the agent's log while the demo is off screen or the tab is hidden.
  function resume(): void {
    if (onScreen && !document.hidden) { pump(); return; }
    window.clearTimeout(timer);
    timer = undefined;
  }
  document.addEventListener("visibilitychange", resume);
  if ("IntersectionObserver" in window) {
    new IntersectionObserver(entries => {
      onScreen = entries[0]?.isIntersecting ?? true;
      resume();
    }, { threshold: 0 }).observe(experience);
  }
  document.documentElement.dataset.demoReady = "true";
  render();
}

const section = document.querySelector<HTMLElement>("#experience");
if (section?.querySelector(".xp")) mount(section);
