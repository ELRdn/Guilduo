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
import { requireElement } from "./primitives/dom.ts";
import { mountRelayForge } from "./shell.ts";
import { observeAuth, signIn, getIdToken } from "../auth.ts";
import { QuestForgeRepository } from "../repository.ts";
import { createProductionRuntime } from "./production.ts";

const root = requireElement<HTMLElement>(document, "#relay-forge-root");
const params = new URLSearchParams(window.location.search);
const fixtureMode = params.has("state") || params.has("fixture") || params.has("variant");
let demoRequested = fixtureMode;
let loadSequence = 0;

function bootstrap(
  title: string,
  message: string,
  actions: ReadonlyArray<{ label: string; run: () => void | Promise<void>; primary?: boolean }> = [],
): void {
  const panel = document.createElement("main");
  panel.className = "rf-bootstrap";
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
  heading.focus();
}

async function mountProduction(uid: string): Promise<void> {
  const sequence = ++loadSequence;
  bootstrap("Workspaceを読み込んでいます", "Quest、Actor、Relay、Connectionを安全に同期しています。");
  try {
    const repository = new QuestForgeRepository({ getToken: () => getIdToken() });
    const runtime = await createProductionRuntime(repository, uid);
    if (sequence !== loadSequence || demoRequested) return;
    mountRelayForge(root, runtime);
  } catch {
    if (sequence !== loadSequence || demoRequested) return;
    bootstrap(
      "Workspaceを読み込めませんでした",
      "接続状態と権限を確認してから再試行してください。データは変更されていません。",
      [
        { label: "再試行", primary: true, run: () => mountProduction(uid) },
        {
          label: "デモを見る",
          run: () => {
            demoRequested = true;
            mountRelayForge(root);
          },
        },
      ],
    );
  }
}

if (fixtureMode) {
  mountRelayForge(root);
} else {
  bootstrap("サインインを確認しています", "Guilduo workspaceへ安全に接続しています。");
  observeAuth((user) => {
    if (demoRequested) return;
    if (user !== null) {
      void mountProduction(user.uid);
      return;
    }
    bootstrap(
      "Guilduoへサインイン",
      "実際のQuest、Agent、Handoffを表示するにはGoogleでサインインしてください。",
      [
        {
          label: "Googleでサインイン",
          primary: true,
          run: async () => {
            bootstrap("サインインしています", "Googleの認証が完了するまでお待ちください。");
            try {
              await signIn();
            } catch {
              bootstrap("サインインできませんでした", "認証画面を閉じたか、接続に失敗しました。もう一度試せます。", [
                { label: "再試行", primary: true, run: async () => { await signIn(); } },
                {
                  label: "デモを見る",
                  run: () => {
                    demoRequested = true;
                    mountRelayForge(root);
                  },
                },
              ]);
            }
          },
        },
        {
          label: "デモを見る",
          run: () => {
            demoRequested = true;
            mountRelayForge(root);
          },
        },
      ],
    );
  });
}
