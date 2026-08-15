import "./runtime-config.js";
import "./i18n-browser.mjs";
import "./shared/battle-rules-browser.mjs";
import "./questforge-core.js";
import "./app.js";

import("./telemetry.mjs").then(({ initializeTelemetry }) => {
  initializeTelemetry({ surface: "root" });
  globalThis.dispatchEvent?.(new CustomEvent("questforge:telemetry-ready"));
}).catch(() => {});

import("./firebase-client.js").catch((error) => {
  console.warn("QuestForge Firebase module failed to load:", error);
  const status = document.querySelector("#syncStatus");
  const panel = document.querySelector("#syncPanel");
  if (status) status.textContent = globalThis.QuestForgeI18n?.t?.("sync.local") || "Local storage";
  if (panel) panel.dataset.syncState = "error";
});
