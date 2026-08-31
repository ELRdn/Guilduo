import { existsSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";

const root = resolve(process.cwd());
const failures: string[] = [];

function read(path: string): string {
  return readFileSync(join(root, path), "utf8");
}

function requireText(path: string, text: string): void {
  if (!read(path).includes(text)) failures.push(`${path}: missing ${text}`);
}

function parseFrontmatterColors(document: string): Record<string, string> {
  const match = document.match(/^---\n([\s\S]*?)\n---/);
  if (!match) return {};
  const colors: Record<string, string> = {};
  const colorsBlock = match[1].match(/(?:^|\n)colors:\n([\s\S]*?)(?=\n(?:[A-Za-z][A-Za-z-]*:|$))/);
  if (!colorsBlock) return colors;
  for (const line of colorsBlock[1].split("\n")) {
    const color = line.match(/^\s{2}([\w-]+):\s*["']?([^"']+?)["']?\s*$/);
    if (color) colors[color[1]] = color[2];
  }
  return colors;
}

const tokens = JSON.parse(read("design/TOKENS.json")) as {
  defaultTheme?: string;
  defaultMode?: string;
  themes?: Record<string, Record<string, Record<string, string>>>;
};
const softOpsLight = tokens.themes?.["soft-ops"]?.light;
if (!softOpsLight) failures.push("design/TOKENS.json: missing soft-ops light tokens");
if (tokens.defaultTheme !== "soft-ops" || tokens.defaultMode !== "light") {
  failures.push("design/TOKENS.json: default must be soft-ops light");
}

for (const theme of ["arcane", "soft-ops", "retro"]) {
  for (const mode of ["light", "dark"]) {
    const values = tokens.themes?.[theme]?.[mode];
    if (!values) failures.push(`design/TOKENS.json: missing ${theme}/${mode}`);
    for (const key of ["surface", "canvas", "human", "agent", "rpg", "danger", "onSurface", "line"]) {
      if (!values?.[key]) failures.push(`design/TOKENS.json: missing ${theme}/${mode}/${key}`);
    }
  }
}

const rootDocument = read("DESIGN.md");
const rootColors = parseFrontmatterColors(rootDocument);
const expectedRootColors: Record<string, string | undefined> = {
  primary: softOpsLight?.human,
  tertiary: softOpsLight?.rpg,
  neutral: softOpsLight?.canvas,
  surface: softOpsLight?.surface,
  "on-surface": softOpsLight?.onSurface,
  line: softOpsLight?.line,
  success: softOpsLight?.human,
  warning: softOpsLight?.rpg,
  danger: softOpsLight?.danger,
  accent: softOpsLight?.agent,
};
for (const [key, expected] of Object.entries(expectedRootColors)) {
  if (expected && rootColors[key]?.toUpperCase() !== expected.toUpperCase()) {
    failures.push(`DESIGN.md: ${key} must match soft-ops light (${expected})`);
  }
}

const nextDocument = read("interaction-lab/DESIGN.md");
for (const inherited of ["typography:", "rounded:", "spacing:"]) {
  if (nextDocument.includes(`\n${inherited}`)) failures.push(`interaction-lab/DESIGN.md: duplicated inherited ${inherited}`);
}
for (const route of ["/interaction-lab/", "/next/"]) {
  if (!nextDocument.includes(route)) failures.push(`interaction-lab/DESIGN.md: missing route mapping ${route}`);
}

for (const rule of ["Human / Primary", "Agent / Integration", "RPG / MP / Reward", "Danger"]) {
  if (!rootDocument.includes(rule)) failures.push(`DESIGN.md: missing semantic rule ${rule}`);
}
requireText("DESIGN.md", "mp-gauge` | Battle資源 | Orange・Gold系");
requireText("DESIGN.md", "Lucide vanilla");

for (const component of [
  "quest-row", "quest-tree-node", "agent-badge", "human-badge", "astra-card", "party-member",
  "handoff-badge", "mp-gauge", "xp-bar", "reward-chip", "battle-command", "sync-indicator",
  "sidebar-item", "bottom-sheet", "dialog", "input", "select", "checkbox", "tooltip", "toast",
]) {
  requireText("design/COMPONENTS.md", `| \`${component}\``);
}
for (const screen of ["Today", "Quest Tree", "Battle", "Party", "Integrations", "Profile", "Settings"]) {
  requireText("design/SCREENS.md", `## ${screen}`);
}

for (const asset of [
  "assets/brand/guilduo-mark-master.svg",
  "assets/brand/guilduo-mark-gold.svg",
  "assets/brand/guilduo-mark-ink.svg",
  "assets/brand/guilduo-mark-ivory.svg",
  "assets/brand/og-guilduo.png",
  "assets/brand/github-social-preview.png",
  "assets/avatar-role-femme-sentinel.webp",
  "assets/avatar-role-sentinel.webp",
  "assets/boss-h3-transparent.webp",
  "assets/boss-e-transparent.webp",
  "assets/icons/favicon-32.png",
  "assets/icons/favicon-48.png",
  "assets/icons/apple-touch-icon-180.png",
  "assets/icons/icon-192.png",
  "assets/icons/icon-512.png",
  "assets/equipment/equipment-journal.webp",
]) {
  if (!existsSync(join(root, asset))) failures.push(`design/ASSET_MANIFEST.md: missing asset ${asset}`);
}

for (const reference of [
  "design/reference/today-desktop.png",
  "design/reference/today-mobile.png",
  "design/reference/quest-tree-desktop.png",
  "design/reference/battle-desktop.png",
  "design/reference/party-desktop.png",
  "design/reference/integrations-desktop.png",
  "design/reference/profile-desktop.png",
  "design/reference/settings-desktop.png",
]) {
  if (!existsSync(join(root, reference))) failures.push(`design/reference: missing ${reference}`);
}

for (const doc of ["DESIGN.md", "PROJECT_SPEC.md", "interaction-lab/DESIGN.md", "design/TOKENS.json", "design/COMPONENTS.md", "design/SCREENS.md", "design/ASSET_MANIFEST.md", "design/reference/README.md"]) {
  requireText("README.md", doc);
}

const docs = ["DESIGN.md", "PROJECT_SPEC.md", "interaction-lab/DESIGN.md", "design/COMPONENTS.md", "design/SCREENS.md", "design/ASSET_MANIFEST.md"]
  .map(read)
  .join("\n");
for (const pattern of [/AIza[0-9A-Za-z_-]{20,}/, /-----BEGIN (?:RSA |EC )?PRIVATE KEY-----/, /Bearer\s+[A-Za-z0-9._-]{20,}/]) {
  if (pattern.test(docs)) failures.push(`design docs: secret-like value matched ${pattern}`);
}

if (failures.length > 0) {
  console.error(failures.map((failure) => `- ${failure}`).join("\n"));
  process.exitCode = 1;
} else {
  console.log("design system check: ok");
}
