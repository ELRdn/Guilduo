import { strict as assert } from "node:assert";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

const root = join(__dirname, "..");
const localeFiles = [
  "README.md",
  "README.jp.md",
  "README.es.md",
  "README.pt-BR.md",
  "README.fr.md",
  "README.de.md",
  "README.ko.md",
  "README.zh-Hans.md",
  "README.ru.md",
] as const;
const navigationLine = "[English](README.md) · [日本語](README.jp.md) · [Español](README.es.md) · [Português (Brasil)](README.pt-BR.md) · [Français](README.fr.md) · [Deutsch](README.de.md) · [한국어](README.ko.md) · [简体中文](README.zh-Hans.md) · [Русский](README.ru.md)";
const read = (relativePath: string): string => readFileSync(join(root, relativePath), "utf8");
const escapeRegExp = (value: string): string => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

test("all README locale files exist and expose the complete language navigation", () => {
  for (const relativePath of localeFiles) {
    assert.equal(existsSync(join(root, relativePath)), true, relativePath);
    const content = read(relativePath);
    assert.equal(content.split(/\r?\n/, 1)[0], navigationLine, relativePath);
    for (const target of localeFiles) {
      assert.match(content, new RegExp(`\\]\\(${escapeRegExp(target)}\\)`), `${relativePath} -> ${target}`);
    }
  }
});

test("the English README is translated and the Japanese source remains available", () => {
  const english = read("README.md");
  const japanese = read("README.jp.md");
  assert.match(english, /### New users start here/);
  assert.match(english, /https:\/\/guilduo\.com\//);
  assert.match(english, /https:\/\/app\.guilduo\.com\//);
  assert.match(english, /https:\/\/mcp\.guilduo\.com\/mcp/);
  assert.match(japanese, /### 新規ユーザーはここから/);
  assert.match(japanese, /Guilduo（ギルデュオ）は/);
  assert.match(japanese, /## 公開βの範囲/);
});
