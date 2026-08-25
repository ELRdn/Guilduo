const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.join(__dirname, "..");

function countOccurrences(source: string, needle: string): number {
  return source.split(needle).length - 1;
}

test("interaction-lab host wrappers no longer duplicate the Island's own data-vf-id", () => {
  const html = fs.readFileSync(path.join(root, "interaction-lab/index.html"), "utf8");

  assert.match(html, /<div id="partyFormationIsland" class="qf-island-host"><\/div>/);
  assert.match(html, /<div id="questDependencyGraphIsland" class="qf-island-host"><\/div>/);
  assert.match(html, /<div id="integrationControlPlaneIsland" class="qf-island-host"><\/div>/);
  assert.doesNotMatch(html, /id="partyList"[^>]*data-vf-id/);
  assert.doesNotMatch(html, /class="tree-layout"[^>]*data-vf-id/);
});

test("React Golden Islands are the sole carrier of their Signature Region id", () => {
  const party = fs.readFileSync(path.join(root, "ui/islands/PartyFormation.tsx"), "utf8");
  const tree = fs.readFileSync(path.join(root, "ui/islands/QuestDependencyGraph.tsx"), "utf8");
  const integrations = fs.readFileSync(path.join(root, "ui/islands/IntegrationControlPlane.tsx"), "utf8");

  assert.match(party, /data-vf-id="FormationBoard"/);
  assert.match(tree, /data-vf-id="DependencyGraph"/);
  assert.match(integrations, /data-vf-id="IntegrationNetwork"/);
});

test("Signature Region ids referenced by manifest.json exist exactly once per known duplication site", () => {
  const html = fs.readFileSync(path.join(root, "interaction-lab/index.html"), "utf8");

  // These ids legitimately appear more than once in the file because they belong to
  // mutually-exclusive panels/modes (production vs. is-reference-fixture, mobile vs. desktop).
  // What must never regress is the FormationBoard/DependencyGraph/IntegrationNetwork count,
  // since those are simultaneously visible siblings, not mode-exclusive alternates.
  assert.equal(countOccurrences(html, 'data-vf-id="FormationBoard"'), 0);
  assert.equal(countOccurrences(html, 'data-vf-id="DependencyGraph"'), 0);
  assert.equal(countOccurrences(html, 'data-vf-id="IntegrationNetwork"'), 0);
});
