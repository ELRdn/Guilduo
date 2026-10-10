import assert from 'node:assert/strict';

export function requiredPhaseReads(parts) {
  const successful = parts.filter(part => part.type === 'tool' && part.state.status === 'completed');
  const context = successful.filter(part => part.tool === 'guilduo_get_current_agent_context' && part.state.input.actingAgentId === 'fixture-agent');
  const quest = successful.filter(part => part.tool === 'guilduo_get_quest' && part.state.input.actingAgentId === 'fixture-agent' && part.state.input.questId === 'fixture-quest' && JSON.parse(part.state.output).id === 'fixture-quest');
  assert.ok(context.length, 'Native history must record successful context read');
  assert.ok(quest.length, 'Native history must return the exact Quest ID');
  return { contextReads: context.length, questReads: quest.length, returnedQuestIdMatch: true };
}
