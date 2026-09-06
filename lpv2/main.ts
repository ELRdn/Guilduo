import { createIcons, ArrowUpRight, ArrowDown, ArrowRight, ArrowLeft, RotateCcw, UserRound, Bot, Inbox, LoaderCircle, SquareArrowOutUpRight, Menu, CodeXml, MousePointer2, Check, Plus } from "lucide";
import "../runtime-config.js";
import contract from "../api/mcp-tools.json";
import { resolvePublicUrl } from "../lp/config";
import { initialState, transition, type DemoState, type DemoEvent } from "./demo";

const en = document.documentElement.lang === "en";
const text = (ja: string, english: string): string => en ? english : ja;
function element<T extends HTMLElement = HTMLElement>(selector: string): T {
  const node = document.querySelector<T>(selector);
  if (!node) throw new Error("LPv2 element missing: " + selector);
  return node;
}
createIcons({ icons: { ArrowUpRight, ArrowDown, ArrowRight, ArrowLeft, RotateCcw, UserRound, Bot, Inbox, LoaderCircle, SquareArrowOutUpRight, Menu, CodeXml, MousePointer2, Check, Plus }, attrs: { "stroke-width": 1.75, "aria-hidden": "true" } });

const experience = element("#experience");
const workspaces = element(".workspaces");
const live = element("[data-live]");
const preview = element("[data-preview]");
const menu = element<HTMLButtonElement>("[data-menu-toggle]");
const sampleNav = element("#sample-nav");
const review = element('[data-quest="review"]');
const reduced = matchMedia("(prefers-reduced-motion: reduce)");
let state: DemoState = initialState;
let revised = false;
let view: "guilduo" | "external" = "guilduo";
let timer: number | undefined;
let remaining = 0;
let startedAt = 0;
let onScreen = true;

const messages: Record<DemoState, { agent: string; live: string }> = {
  intro: {
    agent: text("依頼を受け取る準備ができています。", "Ready when you are. Hand over a task."),
    live: text("まずは、あなたからAIにタスクを渡してみよう。", "Start by giving your agent a task."),
  },
  delegated: {
    agent: text("MCPでタスクを取得。メニューを実装しています。", "Task received through MCP. Building the menu."),
    live: text("Human → Agent：外部AIがタスクを受け取りました。", "Human → Agent: your external AI received the task."),
  },
  first_result: {
    agent: text("メニューを実装しました。使い心地は、人にも確かめてもらいたい。", "The menu is ready. A human’s feedback would help."),
    live: text("外部の作業画面に、メニューができました。", "The menu is ready in the external workspace."),
  },
  human_task: {
    agent: text("「メニューの押しやすさを確認してほしい」を、あなたのタスクにしました。", "I’ve created a task for you: check how the menu feels."),
    live: text("今度は、あなたの番。外部のメニューを触って、テキストでFBを返そう。", "Your turn. Try the external menu, then send text feedback in Guilduo."),
  },
  paused: {
    agent: text("あなたの確認待ちです。準備ができたら再開してください。", "Waiting for your review. Resume when you’re ready."),
    live: text("確認を保留しました。同じタスクから再開できます。", "Review on hold. You can return to the same task."),
  },
  feedback: {
    agent: text("MCPでFBを取得。「ボタンを大きくして」を反映します。", "Feedback received through MCP. Making the button bigger."),
    live: text("Human → Agent：テキストのFBが、外部AIへ届きました。", "Human → Agent: your text feedback reached the external AI."),
  },
  revised: {
    agent: text("ボタンを大きくしました。もう一度、触ってみてください。", "The button is bigger. Give it another try."),
    live: text("外部のボタンが変わった！ 確認できたら、Guilduoで完了を返そう。", "The external button changed! Review it, then reply in Guilduo."),
  },
  no_change: {
    agent: text("「このままで問題ありません」を受け取りました。", "Received your feedback: looks good as it is."),
    live: text("変更不要・確認済み。外部のページはそのままです。", "Reviewed: no changes needed. The external page stays as it is."),
  },
  completing: {
    agent: text("確認ありがとうございます。元の実装タスクにも、完了を報告します。", "Thanks for reviewing. Reporting the original implementation task as complete."),
    live: text("人の確認が完了。続いて、AIから実装の完了報告が届きます。", "Your review is complete. The agent is reporting the implementation as complete."),
  },
  complete: {
    agent: text("一緒に、ひとつの仕事ができました。", "One piece of work. Finished together."),
    live: text("2者。1チーム。仕事は、どちらからでも。", "2 Sides. 1 Team. Work Goes Both Ways."),
  },
};

function setView(next: "guilduo" | "external"): void {
  view = next;
  workspaces.dataset.view = view;
  document.querySelectorAll<HTMLButtonElement>("button[data-view]").forEach(button => {
    button.setAttribute("aria-pressed", String(button.dataset.view === view));
  });
}
function closeMenu(): void {
  menu.setAttribute("aria-expanded", "false");
  sampleNav.hidden = true;
}
menu.addEventListener("click", () => {
  const open = menu.getAttribute("aria-expanded") !== "true";
  menu.setAttribute("aria-expanded", String(open));
  sampleNav.hidden = !open;
});
sampleNav.addEventListener("keydown", event => {
  if (event.key === "Escape") { closeMenu(); menu.focus(); }
});
menu.addEventListener("keydown", event => {
  if (event.key === "Escape") closeMenu();
});
document.querySelectorAll<HTMLButtonElement>("[data-sample-page]").forEach(button => {
  button.addEventListener("click", () => {
    element("[data-sample-selected]").textContent = text("選択中：", "Selected: ") + button.textContent;
    closeMenu();
    menu.focus();
  });
});
document.querySelectorAll<HTMLButtonElement>("button[data-view]").forEach(button => {
  button.addEventListener("click", () => setView(button.dataset.view === "external" ? "external" : "guilduo"));
});

function render(): void {
  document.documentElement.dataset.demoReady = "true";
  experience.dataset.state = state;
  const message = messages[state];
  element("[data-agent-message]").textContent = message.agent;
  live.textContent = message.live;
  const built = !["intro", "delegated"].includes(state);
  const hasReview = !["intro", "delegated", "first_result"].includes(state);
  const humanDone = ["completing", "complete"].includes(state);
  preview.dataset.preview = built ? "ready" : "empty";
  menu.disabled = !built;
  menu.classList.toggle("is-large", revised);
  element("[data-revision]").textContent = revised ? "v2" : built ? "v1" : "v0";
  element("[data-preview-hint]").textContent = revised
    ? text("ボタンが大きくなりました。もう一度試そう。", "A bigger button. Give it another try.")
    : text("メニューができたら、押してみて。", "When the menu is ready, give it a try.");
  review.hidden = !hasReview;
  element("[data-return-to-task]").hidden = !["human_task", "paused", "revised"].includes(state);
  element("[data-empty]").hidden = hasReview;
  element("[data-inbox-count]").textContent = state === "human_task" ? "1" : "";
  element("[data-original-status]").textContent = state === "intro" ? text("下書き", "Draft")
    : state === "complete" ? text("完了", "Complete")
    : state === "delegated" || state === "feedback" ? text("AIが作業中", "Agent working")
    : text("確認待ち", "Awaiting review");
  element("[data-review-status]").textContent = humanDone ? text("確認完了", "Reviewed")
    : state === "paused" ? text("保留", "On hold")
    : state === "feedback" ? text("FB送信済み", "Feedback sent")
    : text("あなたの担当", "Assigned to you");
  element("[data-review-title]").textContent = text("メニューの押しやすさを確認してほしい", "Could you check how the menu feels?");
  element("[data-review-body]").textContent = text("外部の作業画面でメニューを触って、使い心地を教えてください。", "Try the menu in the external workspace, and tell me how it feels.");
  const receipt = element("[data-receipt]");
  receipt.hidden = !["feedback", "revised", "no_change", "completing", "complete"].includes(state);
  receipt.textContent = revised || state === "feedback"
    ? text("あなたのFB：「ボタンを大きくしてください」", "Your feedback: “Make the button bigger.”")
    : text("あなたのFB：「このままで問題ありません」", "Your feedback: “Looks good as it is.”");
  const visibleActions: Record<string, boolean> = {
    start: state === "intro", feedback: state === "human_task", approve: state === "human_task",
    hold: state === "human_task", resume: state === "paused", confirm: state === "revised", replay: state === "complete",
  };
  document.querySelectorAll<HTMLButtonElement>(".demo-actions [data-action]").forEach(button => {
    button.hidden = !visibleActions[button.dataset.action ?? ""];
  });
  const automatic = ["delegated", "first_result", "feedback", "no_change", "completing"].includes(state);
  element("[data-working]").hidden = !automatic;
  element("[data-working-text]").textContent = message.agent;
  const step = state === "complete" || state === "completing" ? 2 : hasReview ? 1 : 0;
  document.querySelectorAll("[data-step]").forEach(node => {
    if (Number((node as HTMLElement).dataset.step) === step) node.setAttribute("aria-current", "step");
    else node.removeAttribute("aria-current");
  });
}

function pauseTimer(): void {
  if (timer === undefined) return;
  window.clearTimeout(timer);
  timer = undefined;
  remaining = Math.max(0, remaining - (performance.now() - startedAt));
}
function resumeTimer(): void {
  if (timer !== undefined || remaining <= 0 || !onScreen || document.hidden) return;
  startedAt = performance.now();
  timer = window.setTimeout(() => {
    timer = undefined;
    remaining = 0;
    dispatch("advance");
  }, remaining);
}
function schedule(): void {
  pauseTimer();
  const delay: Partial<Record<DemoState, number>> = {
    delegated: 1000, first_result: 850, feedback: 1400, no_change: 700, completing: 900,
  };
  remaining = delay[state] ?? 0;
  if (reduced.matches && remaining) remaining = 200;
  resumeTimer();
}
function dispatch(event: DemoEvent): void {
  const next = transition(state, event);
  if (next === state && event !== "restart") return;
  pauseTimer();
  if (event === "restart") {
    revised = false;
    closeMenu();
    element("[data-sample-selected]").textContent = "";
    setView("guilduo");
  }
  if (next === "revised") revised = true;
  state = next;
  render();
  schedule();
}
document.querySelectorAll<HTMLButtonElement>("[data-action]").forEach(button => {
  button.addEventListener("click", () => {
    const action = button.dataset.action;
    const event: DemoEvent = action === "confirm" ? "approve" : action === "replay" ? "restart" : action as DemoEvent;
    dispatch(event);
    if (button.hidden || action === "restart") {
      live.tabIndex = -1;
      live.focus({ preventScroll: true });
    }
  });
});
element<HTMLButtonElement>("[data-return-to-task]").addEventListener("click", () => {
  setView("guilduo");
  const action = state === "revised" ? "confirm" : state === "paused" ? "resume" : "feedback";
  element<HTMLButtonElement>('[data-action="' + action + '"]').focus();
});
document.addEventListener("visibilitychange", () => {
  if (document.hidden) pauseTimer(); else resumeTimer();
});
if ("IntersectionObserver" in window) {
  new IntersectionObserver(entries => {
    onScreen = entries[0]?.isIntersecting ?? true;
    if (onScreen) resumeTimer(); else pauseTimer();
  }, { threshold: 0 }).observe(experience);
}
render();

const theme = element<HTMLSelectElement>("[data-theme-control]");
const systemDark = matchMedia("(prefers-color-scheme: dark)");
function applyTheme(choice: string): void {
  theme.value = ["dark", "light", "system"].includes(choice) ? choice : "dark";
  document.documentElement.dataset.theme = theme.value === "system" ? (systemDark.matches ? "dark" : "light") : theme.value;
}
try { applyTheme(localStorage.getItem("guilduo-lpv2-theme") ?? "dark"); } catch { applyTheme("dark"); }
theme.addEventListener("change", () => {
  applyTheme(theme.value);
  try { localStorage.setItem("guilduo-lpv2-theme", theme.value); } catch { /* Theme still applies for this view. */ }
});
systemDark.addEventListener("change", () => applyTheme(theme.value));

for (const [selector, value] of [
  ["[data-join-cta]", globalThis.QuestForgeConfig?.joinGuildUrl],
  ["[data-source-cta]", globalThis.QuestForgeConfig?.sourceUrl],
] as const) {
  document.querySelectorAll<HTMLAnchorElement>(selector).forEach(link => {
    const url = resolvePublicUrl(value, location.href, location.origin);
    if (url) { link.href = url; }
    else {
      link.removeAttribute("href");
      link.setAttribute("aria-disabled", "true");
      link.title = text("公開準備中", "Available soon");
      link.append(document.createTextNode(text("（準備中）", " (soon)")));
    }
  });
}
element("[data-tool-count]").textContent = String(Array.isArray(contract) ? contract.length : contract.tools.length);
