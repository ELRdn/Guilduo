import { readdir, readFile, stat } from "node:fs/promises";
import { extname, join, relative } from "node:path";

const sourceRoots = [
  "app.ts",
  "main.ts",
  "firebase-client.ts",
  "questforge-core.ts",
  "i18n.ts",
  "i18n-browser.ts",
  "telemetry.ts",
  "types",
  "locales",
  "shared",
  "server",
  "worker/src",
  "cli",
  "mcp-local",
  "tools",
  "tests",
  "interaction-lab",
  "questforge-battle-prototype/battle.ts",
] as const;

const sourceExtensions = new Set([".ts", ".mts", ".js", ".mjs"]);
const typeScriptExtensions = new Set([".ts", ".mts"]);
const noCheckDirective = ["@", "ts-nocheck"].join("");
const ignoredDirectories = new Set([
  ".agents",
  ".claude",
  ".git",
  ".qa-artifacts",
  ".wrangler",
  "backups",
  "Build",
  "Builds",
  "Library",
  "Logs",
  "Obj",
  "Temp",
  "UserSettings",
  "dist",
  "node_modules",
  "screenshots",
  "webgl-build",
]);
const allowedJavaScript = new Set([
  "firebase-config.js",
  "firebase-config.example.js",
  "runtime-config.js",
  "runtime-config.example.js",
]);

interface Violation {
  file: string;
  line: number;
  message: string;
}

async function collectFiles(path: string): Promise<string[]> {
  const info = await stat(path).catch(() => null);
  if (!info) return [];
  if (info.isFile()) return sourceExtensions.has(extname(path)) ? [path] : [];
  if (!info.isDirectory()) return [];
  const entries = await readdir(path, { withFileTypes: true });
  const nested = await Promise.all(entries
    .filter((entry) => !ignoredDirectories.has(entry.name))
    .map((entry) => collectFiles(join(path, entry.name))));
  return nested.flat();
}

function maskCommentsAndStrings(source: string): string {
  const characters = [...source];
  let state: "code" | "single" | "double" | "template" | "line" | "block" = "code";
  for (let index = 0; index < characters.length; index += 1) {
    const current = characters[index];
    const next = characters[index + 1];
    if (state === "code") {
      if (current === "/" && next === "/") {
        characters[index] = " ";
        characters[index + 1] = " ";
        index += 1;
        state = "line";
      } else if (current === "/" && next === "*") {
        characters[index] = " ";
        characters[index + 1] = " ";
        index += 1;
        state = "block";
      } else if (current === "'") {
        characters[index] = " ";
        state = "single";
      } else if (current === '"') {
        characters[index] = " ";
        state = "double";
      } else if (current === "`") {
        characters[index] = " ";
        state = "template";
      }
      continue;
    }
    if (state === "line") {
      if (current === "\n" || current === "\r") state = "code";
      else characters[index] = " ";
      continue;
    }
    if (state === "block") {
      if (current === "*" && next === "/") {
        characters[index] = " ";
        characters[index + 1] = " ";
        index += 1;
        state = "code";
      } else if (current !== "\n" && current !== "\r") {
        characters[index] = " ";
      }
      continue;
    }
    if (current === "\\") {
      characters[index] = " ";
      if (index + 1 < characters.length && characters[index + 1] !== "\n" && characters[index + 1] !== "\r") {
        characters[index + 1] = " ";
        index += 1;
      }
    } else if ((state === "single" && current === "'") || (state === "double" && current === '"') || (state === "template" && current === "`")) {
      characters[index] = " ";
      state = "code";
    } else if (current !== "\n" && current !== "\r") {
      characters[index] = " ";
    }
  }
  return characters.join("");
}

function findTypeScriptViolations(file: string, source: string): Violation[] {
  const masked = maskCommentsAndStrings(source);
  const violations: Violation[] = [];
  const explicitAny = /(?:\bas\s+any\b|:\s*any\b|[=<|&,]\s*any\b|\b(?:Array|Promise|ReadonlyArray|Map|Set|Record)\s*<[^>\n]*\bany\b[^>\n]*>|\bany\s*\[\s*\])/g;
  for (const match of masked.matchAll(explicitAny)) {
    const position = match.index ?? 0;
    violations.push({ file, line: source.slice(0, position).split("\n").length, message: "explicit any is not allowed" });
  }
  return violations;
}

const files = (await Promise.all(sourceRoots.map((root) => collectFiles(root)))).flat().sort();
const violations: Violation[] = [];

for (const file of files) {
  const source = await readFile(file, "utf8");
  const displayFile = relative(process.cwd(), file).replaceAll("\\", "/");
  if (typeScriptExtensions.has(extname(file)) && new RegExp(`^\\s*(?:\\/\\/|\\/\\*)\\s*${noCheckDirective}\\b`, "m").test(source)) {
    violations.push({ file: displayFile, line: 1, message: `${noCheckDirective} is not allowed in operational TypeScript` });
  }
  if (typeScriptExtensions.has(extname(file))) {
    violations.push(...findTypeScriptViolations(displayFile, source));
  }
  if ((extname(file) === ".js" || extname(file) === ".mjs") && !allowedJavaScript.has(displayFile)) {
    violations.push({ file: displayFile, line: 1, message: "handwritten JavaScript is not allowed; migrate the file to TypeScript" });
  }
}

if (violations.length > 0) {
  console.error("TypeScript migration policy failed:");
  for (const violation of violations) console.error(`- ${violation.file}:${violation.line} ${violation.message}`);
  process.exitCode = 1;
} else {
  console.log(`TypeScript migration policy passed (${files.length} source files scanned).`);
}
