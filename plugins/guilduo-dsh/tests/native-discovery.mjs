// SPDX-License-Identifier: AGPL-3.0-only
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { realpath } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { pathToFileURL } from 'node:url';

const packageDir = await realpath(resolve(process.argv[2]));
const require = createRequire(join(packageDir, 'package.json'));
const load = (name) => import(pathToFileURL(require.resolve(name)).href);
let networkRequests = 0;
globalThis.fetch = async () => { networkRequests++; throw new Error('Network is forbidden during native discovery'); };
// Load only in-memory native registries; no profile/provider/model services.
const { Context } = await load('@deepseek-ai/cordis');
const { default: SystemPrompt } = await load('@deepseek-ai/dsh-system-prompt');
const { SkillRegistry } = await load('@deepseek-ai/dsh-skill');
const { ToolRuntime } = await load('@deepseek-ai/dsh-tools');
const plugin = await load('@guilduo/dsh-oauth-poc');
const ctx = new Context();
ctx.provide('agents', { roots() { return []; }, get() { throw new Error('Discovery must not resolve Agents'); } });
ctx.provide('sessions', { get() { throw new Error('Discovery must not read Sessions'); } });
ctx.provide('sessionController', { resolveAgent() { throw new Error('Discovery must not resume Sessions'); } });
ctx.provide('credentials', {
  async readRecord() { throw new Error('Discovery must not read credentials'); },
  async modifyRecord() { throw new Error('Discovery must not write credentials'); },
  async deleteRecord() { throw new Error('Discovery must not delete credentials'); },
});
const prompt = await ctx.plugin(SystemPrompt, { includeHarnessIdentity: false, includeRuntimeContext: false });
const tools = await ctx.plugin(ToolRuntime);
const skills = await ctx.plugin(SkillRegistry);
const mounted = await ctx.plugin(plugin);
const control = ctx.guilduoDshOAuth;
assert.ok(control);
assert.equal((await ctx.skills.list()).length, 1);
assert.equal(await ctx.skills.get('questforge-workflows'), undefined, 'Legacy Skill must not be registered alongside the renamed Skill');
const skill = await ctx.skills.get('guilduo-workflows');
assert.equal(skill.provider, 'guilduo-dsh-oauth-poc');
assert.equal(skill.source, 'bundled');
assert.ok(skill.resourceBase.path.includes('guilduo-workflows'));
assert.ok(skill.content.length > 100);
for (const name of ['guilduo_login', 'guilduo_logout', 'guilduo_callback', 'mcp__guilduo__get_agent_context']) assert.equal(ctx.tools.get(name), undefined);
await mounted.dispose();
assert.equal(await ctx.skills.get('guilduo-workflows'), undefined);
await assert.rejects(control.begin('unused-session', 'http://127.0.0.1:43123/callback', () => {}), /disposed/);
await skills.dispose(); await tools.dispose(); await prompt.dispose();
assert.equal(networkRequests, 0);
console.log(JSON.stringify({ skillDiscovery: 'PASS: installed package in native Cordis/SkillRegistry', pluginUnload: 'PASS', networkRequests, modelCalls: 0 }));
