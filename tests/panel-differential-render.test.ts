const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.join(__dirname, "..");
const read = (file: string): string => fs.readFileSync(path.join(root, file), "utf8");

// Guards the AC-1 differential-render contract in interaction-lab/app.ts: renderAll({ full: true })
// must be used by every state-mutating call site so an inactive tab is never left stale, while
// setView()'s own scoped renderAll() is safe only because it runs after state.view is already
// updated to the destination tab. If a future change adds a second bare `renderAll()` call outside
// setView(), that call site risks leaving whichever tab isn't currently active stale.
test("only setView() uses a non-full renderAll(), and only after state.view is updated", () => {
  const app = read("interaction-lab/app.ts");

  const bareCalls = [...app.matchAll(/\brenderAll\(\s*\)/g)];
  assert.equal(bareCalls.length, 1, "expected exactly one bare renderAll() call site (inside setView()); found " + bareCalls.length + " — any new one risks stale inactive tabs");

  const setViewMatch = app.match(/function setView\([^)]*\): void \{([\s\S]*?)\n\}\n/);
  if (!setViewMatch) throw new Error("could not locate setView() body");
  const setViewBody = setViewMatch[1];

  assert.match(setViewBody, /\brenderAll\(\s*\)/, "the bare renderAll() call must live inside setView()");

  const viewAssignIndex = setViewBody.indexOf("state.view = view;");
  const renderAllIndex = setViewBody.indexOf("renderAll();");
  assert.ok(viewAssignIndex >= 0, "setView() must assign state.view = view");
  assert.ok(renderAllIndex >= 0, "setView() must call renderAll();");
  assert.ok(viewAssignIndex < renderAllIndex, "state.view must be updated to the destination tab before renderAll() runs, or the scoped render targets the wrong (stale) panel");

  assert.match(app, /PANEL_RENDERERS\[state\.view\]\.forEach\(\(render\) => render\(\)\)/, "renderAll()'s non-full branch must key off the live state.view, not a cached view");
});
