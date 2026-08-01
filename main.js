import "./questforge-core.js";
import "./app.js";

import("./firebase-client.js").catch((error) => {
  console.warn("QuestForge Firebase module failed to load:", error);
  const status = document.querySelector("#syncStatus");
  const panel = document.querySelector("#syncPanel");
  if (status) status.textContent = "ローカル保存";
  if (panel) panel.dataset.syncState = "error";
});
