import "./runtime-config.js";
import "./i18n-browser.ts";
import "./shared/battle-rules-browser.ts";
import "./questforge-core.ts";
import "./app.ts";
import { installQuestForgeIconObserver } from "./ui/icon-system.ts";

installQuestForgeIconObserver();

import("./telemetry.ts").then(({ initializeTelemetry }) => {
  initializeTelemetry({ surface: "root" });
  globalThis.dispatchEvent?.(new CustomEvent("questforge:telemetry-ready"));
}).catch(() => {});

import("./firebase-client.ts").catch((error) => {
  console.warn("QuestForge Firebase module failed to load:", error);
  const status = document.querySelector<HTMLElement>("#syncStatus");
  const panel = document.querySelector<HTMLElement>("#syncPanel");
  if (status) status.textContent = globalThis.QuestForgeI18n?.t?.("sync.local") || "Local storage";
  if (panel) panel.dataset.syncState = "error";
});
