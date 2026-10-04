/**
 * Relay Forge entry point for the `/next/relay-forge/` surface.
 *
 * The legacy `/` application and the existing `/next/` interaction lab are left
 * untouched: this document loads neither `styles.css` nor
 * `design/tokens.generated.css`, so the two token systems never collide
 * (see the note at the top of `tokens.css`).
 */

import "../../runtime-config.js";
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
import "./screens/skills.css";
import { requireElement } from "./primitives/dom.ts";
import { mountRelayForge } from "./shell.ts";
import { dismissOAuthFailure, observeAuthState, signIn, signOutUser, getIdToken } from "../auth.ts";
import { QuestForgeApiError, QuestForgeRepository } from "../repository.ts";
import { createProductionRuntime } from "./production.ts";
import { reportGuiTiming } from "./gui-timing.ts";
import { prepareWorkspaceReads, type PreparedWorkspace } from "./bootstrap-preparation.ts";
import { relayText, type RelayCopyKey } from "./relay-copy.ts";
import { getLocale, LOCALE_METADATA, setLocale, SUPPORTED_LOCALES } from "../../i18n.ts";

const root = requireElement<HTMLElement>(document, "#relay-forge-root");
const params = new URLSearchParams(window.location.search);
const fixtureMode = params.has("state") || params.has("fixture") || params.has("variant");
let demoRequested = fixtureMode;
let loadSequence = 0;
let initialProductionLoad = true;

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
  title: RelayCopyKey,
  message: RelayCopyKey,
  actions: ReadonlyArray<{ label: RelayCopyKey; run: () => void | Promise<void>; primary?: boolean }> = [],
  kind: "loading" | "actionable" | "error" = actions.length === 0 ? "loading" : "actionable",
  diagnostic = "",
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
  heading.textContent = relayText(title);
  const copy = document.createElement("p");
  copy.textContent = `${diagnostic ? `${diagnostic}. ` : ""}${relayText(message)}`;
  const controls = document.createElement("div");
  controls.className = "rf-bootstrap-actions";
  for (const action of actions) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = action.primary ? "rf-bootstrap-primary" : "";
    button.textContent = relayText(action.label);
    button.addEventListener("click", () => void action.run());
    controls.append(button);
  }
  panel.append(brand, heading, copy, controls);
  const language = document.createElement("select");
  language.setAttribute("aria-label", relayText("language"));
  for (const locale of SUPPORTED_LOCALES) {
    const option = document.createElement("option");
    option.value = locale;
    option.textContent = LOCALE_METADATA[locale].label;
    language.append(option);
  }
  language.value = getLocale();
  language.addEventListener("change", () => {
    setLocale(language.value);
    bootstrap(title, message, actions, kind, diagnostic);
    root.querySelector<HTMLSelectElement>("select")?.focus();
  });
  panel.append(language);
  const policies = document.createElement("p");
  policies.className = "rf-bootstrap-policies";
  for (const [label, path] of [["Privacy", "privacy"], ["Terms", "terms"]]) {
    const link = document.createElement("a");
    link.href = `https://guilduo.com/${path}/`;
    link.textContent = label;
    policies.append(link, " ");
  }
  panel.append(policies);
  document.documentElement.lang = getLocale();
  root.replaceChildren(panel);
  // Loading is announced by its status region and must not steal focus or
  // inherit the global interactive focus ring. Actionable/error screens move
  // the virtual cursor to their heading, while their real controls retain the
  // ordinary focus-visible treatment.
  if (kind !== "loading") heading.focus({ preventScroll: true });
}

async function mountProduction(uid: string, email: string, prepared?: PreparedWorkspace): Promise<void> {
  const timingAction = initialProductionLoad ? "reload" : "connect";
  const loadStarted = initialProductionLoad ? 0 : performance.now();
  const sequence = ++loadSequence;
  bootstrap("workspaceLoading", "workspaceLoadingHint");
  try {
    const repository = prepared?.repository ?? new QuestForgeRepository({ getToken: (forceRefresh) => getIdToken(forceRefresh) });
    const runtime = await createProductionRuntime(repository, uid, email, prepared?.snapshot);
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
    initialProductionLoad = false;
    reportGuiTiming(timingAction, loadStarted, () => sequence === loadSequence && !demoRequested && root.isConnected);
  } catch (error) {
    if (sequence !== loadSequence || demoRequested) return;
    const diagnostic = error instanceof QuestForgeApiError
      ? `API ${error.status} / ${error.code}`
      : "";
    bootstrap(
      "workspaceFailed",
      "workspaceFailedHint",
      [
        { label: "retry", primary: true, run: () => mountProduction(uid, email) },
        {
          label: "demoButton",
          run: () => {
            demoRequested = true;
            mount();
          },
        },
      ],
      "error",
      diagnostic,
    );
  }
}

function showDemo(): void {
  demoRequested = true;
  mount();
}

function beginSignIn(): void {
  bootstrap("authSigning", "authSigningHint");
  void signIn().catch(() => {
    bootstrap("oauthFailed", "oauthFailedHint", [
      { label: "retry", primary: true, run: beginSignIn },
      { label: "demoButton", run: showDemo },
    ], "error");
  });
}

function showSignedOut(): void {
  initialProductionLoad = false;
  bootstrap(
    "signInTitle",
    "signInHint",
    [
      { label: "signIn", primary: true, run: beginSignIn },
      { label: "demoButton", run: showDemo },
    ],
  );
}

function checkAuth(): void {
  const preparation = prepareWorkspaceReads(force => getIdToken(force));
  observeAuthState((state) => {
    if (demoRequested) { preparation.finish(); return; }
    if (state.status === "checking") {
      bootstrap("authChecking", "authCheckingHint");
      return;
    }
    if (state.status === "authenticated") {
      void mountProduction(state.user.uid, state.user.email, preparation.finish(state.user.uid));
      return;
    }
    preparation.finish();
    if (state.status === "signed-out") {
      showSignedOut();
      return;
    }
    if (state.status === "oauth-failed") {
      dismissOAuthFailure();
      bootstrap("oauthFailed", "oauthFailedHint", [
        { label: "retry", primary: true, run: beginSignIn },
        { label: "demoButton", run: showDemo },
      ], "error");
      return;
    }
    bootstrap("authFailed", "authFailedHint", [
      { label: "retry", primary: true, run: checkAuth },
      { label: "demoButton", run: showDemo },
    ], "error");
  }, (token, subject) => {
    if (!demoRequested) preparation.onSessionToken(token, subject);
  });
}

if (fixtureMode) mount();
else checkAuth();
