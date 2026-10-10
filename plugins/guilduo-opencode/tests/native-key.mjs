// SPDX-License-Identifier: AGPL-3.0-only
import { createReadStream } from 'node:fs';

// Select one native entry without parsing or retaining other providers' values.
export async function selectedGoKey(path) {
  let depth = 0, quoted = false, escaped = false, keyExpected = false;
  let key = '', collectingKey = false, selected = false, value = '';
  for await (const chunk of createReadStream(path, { encoding: 'utf8' })) {
    for (const char of chunk) {
      if (value) value += char;
      if (quoted) {
        if (collectingKey) key += char;
        if (escaped) { escaped = false; continue; }
        if (char === '\\') { escaped = true; continue; }
        if (char !== '"') continue;
        quoted = false;
        if (collectingKey) { selected = JSON.parse(key) === 'opencode-go'; collectingKey = false; key = ''; keyExpected = false; }
        continue;
      }
      if (char === '"') {
        quoted = true;
        collectingKey = depth === 1 && keyExpected;
        if (collectingKey) key = char;
      } else if (char === '{' || char === '[') {
        if (depth === 1 && selected && !value) {
          if (char !== '{') throw new Error('Selected OpenCode Go entry must be native API authentication');
          value = char;
        }
        depth++;
        if (depth === 1) keyExpected = true;
      } else if (char === '}' || char === ']') {
        depth--;
        if (value && depth === 1) {
          const entry = JSON.parse(value);
          if (entry.type !== 'api' || typeof entry.key !== 'string' || !entry.key) throw new Error('Selected OpenCode Go API credential is missing');
          return entry.key;
        }
      } else if (char === ',' && depth === 1) { keyExpected = true; selected = false; }
    }
  }
  throw new Error('Selected native OpenCode Go API credential was not found');
}
