/**
 * Relay Forge entry point for the `/next/relay-forge/` surface.
 *
 * The legacy `/` application and the existing `/next/` interaction lab are left
 * untouched: this document loads neither `styles.css` nor
 * `design/tokens.generated.css`, so the two token systems never collide
 * (see the note at the top of `tokens.css`).
 */

import "./tokens.css";
import "./foundation.css";
import "./shell.css";
import "./primitives.css";
import "./mobile.css";
import "./screens/screens.css";
import "./screens/quests.css";
import "./screens/network.css";
import "./screens/party.css";
import "./screens/battle.css";
import "./screens/connections.css";
import "./screens/settings.css";
import { requireElement } from "./primitives/dom.ts";
import { mountRelayForge } from "./shell.ts";
import { dismissOAuthFailure, observeAuthState, signIn, signOutUser, getIdToken } from "../auth.ts";
import { QuestForgeApiError, QuestForgeRepository } from "../repository.ts";
import { createProductionRuntime } from "./production.ts";

const root = requireElement<HTMLElement>(document, "#relay-forge-root");
const params = new URLSearchParams(window.location.search);
const fixtureMode = params.has("state") || params.has("fixture") || params.has("variant");
let demoRequested = fixtureMode;
let loadSequence = 0;

/**
 * Tears down whatever mounted UI currently owns `root` — the Shell's own
 * listeners/Blob URLs via `activeUnmount`, if a Shell is mounted — before
 * either `mount()` installs a new Shell or `bootstrap()` replaces `root`'s
 * children with a signed-out/loading/error screen. Every path that changes
 * what's on screen funnels through one of those two functions, and both
 * call this first, so no transition (sign-in retry, sign-out, the "デモを
 * 見る" fallback, an auth error) can leave a previous Shell's listeners or
 * Blob URLs behind. Idempotent: `activeUnmount` is nulled out immediately,
 * so a second call in a row (e.g. `bootstrap()` right after `mount()`
 * failed) is a no-op rather than a double-dispose.
 */
let activeUnmount: (() => void) | null = null;
function disposeActiveMount(): void {
  const unmount = activeUnmount;
  activeUnmount = null;
  unmount?.();
}

function mount(runtime?: Parameters<typeof mountRelayForge>[1]): void {
  disposeActiveMount();
  activeUnmount = mountRelayForge(root, runtime ?? null);
}

function bootstrap(
  title: string,
  message: string,
  actions: ReadonlyArray<{ label: string; run: () => void | Promise<void>; primary?: boolean }> = [],
  kind: "loading" | "actionable" | "error" = actions.length === 0 ? "loading" : "actionable",
): void {
  disposeActiveMount();
  const panel = document.createElement("main");
  panel.className = "rf-bootstrap";
  panel.dataset.state = kind;
  if (kind === "loading") {
    panel.setAttribute("role", "status");
    panel.setAttribute("aria-live", "polite");
    panel.setAttribute("aria-busy", "true");
  }
  const brand = document.createElement("p");
  brand.className = "rf-bootstrap-brand";
  brand.textContent = "Guilduo / Relay Forge";
  const heading = document.createElement("h1");
  heading.tabIndex = -1;
  heading.textContent = title;
  const copy = document.createElement("p");
  copy.textContent = message;
  const controls = document.createElement("div");
  controls.className = "rf-bootstrap-actions";
  for (const action of actions) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = action.primary ? "rf-bootstrap-primary" : "";
    button.textContent = action.label;
    button.addEventListener("click", () => void action.run());
    controls.append(button);
  }
  panel.append(brand, heading, copy, controls);
  root.replaceChildren(panel);
  // Loading is announced by its status region and must not steal focus or
  // inherit the global interactive focus ring. Actionable/error screens move
  // the virtual cursor to their heading, while their real controls retain the
  // ordinary focus-visible treatment.
  if (kind !== "loading") heading.focus({ preventScroll: true });
}

async function mountProduction(uid: string, email: string): Promise<void> {
  const sequence = ++loadSequence;
  bootstrap("Workspaceを読み込んでいます", "Quest、Actor、Relay、Connectionを安全に同期しています。");
  try {
    const repository = new QuestForgeRepository({ getToken: () => getIdToken() });
    const runtime = await createProductionRuntime(repository, uid, email);
    if (sequence !== loadSequence || demoRequested) return;
    // Injected here, not imported by the shell: Appwrite Auth stays a
    // swappable port rather than a hard dependency of the Relay Forge UI.
    // `checkAuth()` re-observes state after sign-out so the existing
    // signed-out bootstrap screen replaces this mount — the shell itself
    // never has to know how to tear itself down.
    mount({
      ...runtime,
      signOut: async () => {
        await signOutUser();
        checkAuth();
      },
    });
  } catch (error) {
    if (sequence !== loadSequence || demoRequested) return;
    const diagnostic = error instanceof QuestForgeApiError
      ? `API ${error.status} / ${error.code}`
      : "接続エラー";
    bootstrap(
      "Workspaceを読み込めませんでした",
      `${diagnostic}。接続状態と権限を確認してから再試行してください。データは変更されていません。`,
      [
        { label: "再試行", primary: true, run: () => mountProduction(uid, email) },
        {
          label: "デモを見る",
          run: () => {
            demoRequested = true;
            mount();
          },
        },
      ],
      "error",
    );
  }
}

function showDemo(): void {
  demoRequested = true;
  mount();
}

function beginSignIn(): void {
  bootstrap("サインインしています", "Googleの認証が完了するまでお待ちください。");
  void signIn().catch(() => {
    bootstrap("サインインを開始できませんでした", "Appwriteの設定と接続状態を確認して、もう一度試してください。", [
      { label: "再試行", primary: true, run: beginSignIn },
      { label: "デモを見る", run: showDemo },
    ], "error");
  });
}

function showSignedOut(): void {
  bootstrap(
    "Guilduoへサインイン",
    "実際のQuest、Agent、Handoffを表示するにはGoogleでサインインしてください。",
    [
      { label: "Googleでサインイン", primary: true, run: beginSignIn },
      { label: "デモを見る", run: showDemo },
    ],
  );
}

function checkAuth(): void {
  observeAuthState((state) => {
    if (demoRequested) return;
    if (state.status === "checking") {
      bootstrap("サインインを確認しています", "Guilduo workspaceへ安全に接続しています。");
      return;
    }
    if (state.status === "authenticated") {
      void mountProduction(state.user.uid, state.user.email);
      return;
    }
    if (state.status === "signed-out") {
      showSignedOut();
      return;
    }
    if (state.status === "oauth-failed") {
      dismissOAuthFailure();
      bootstrap("Googleサインインが完了しませんでした", "認証がキャンセルされたか、Googleとの接続に失敗しました。", [
        { label: "もう一度試す", primary: true, run: beginSignIn },
        { label: "デモを見る", run: showDemo },
      ], "error");
      return;
    }
    bootstrap("サインイン状態を確認できません", "Appwriteへの接続に失敗しました。ログアウト扱いにはせず、安全に再確認できます。", [
      { label: "再接続", primary: true, run: checkAuth },
      { label: "デモを見る", run: showDemo },
    ], "error");
  });
}

if (fixtureMode) mount();
else checkAuth();
