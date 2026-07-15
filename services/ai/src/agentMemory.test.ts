import assert from 'node:assert/strict'
import test from 'node:test'
import {
  MEMORY_CHARACTER_LIMIT,
  buildAgentInput,
  buildBoundedMemory,
  normalizeDisplayName,
  type AgentMemoryRecord,
} from './agentMemory.js'

const baseRecord: AgentMemoryRecord = {
  id: 'run-1',
  user_id: 'user-a',
  visibility: 'private',
  trigger: 'chat',
  status: 'completed',
  prompt: 'My name is David',
  response: 'Nice to meet you, David.',
  created_at: '2026-07-15T12:00:00.000Z',
}

function record(overrides: Partial<AgentMemoryRecord>): AgentMemoryRecord {
  return { ...baseRecord, ...overrides }
}

test('keeps only completed private chats for the signed-in user', () => {
  const turns = buildBoundedMemory([
    baseRecord,
    record({ id: 'other-user', user_id: 'user-b', prompt: 'Secret from B' }),
    record({ id: 'shared', visibility: 'pool', prompt: 'Shared pool run' }),
    record({ id: 'scheduled', trigger: 'schedule', prompt: 'Scheduled run' }),
    record({ id: 'failed', status: 'failed', prompt: 'Failed run' }),
    record({ id: 'current', prompt: 'Current run' }),
  ], 'user-a', 'current')

  assert.deepEqual(turns.map((turn) => turn.prompt), ['My name is David'])
})

test('returns the newest six turns in chronological order', () => {
  const records = Array.from({ length: 9 }, (_, index) => record({
    id: `run-${index}`,
    prompt: `Prompt ${index}`,
    response: `Response ${index}`,
    created_at: new Date(Date.UTC(2026, 6, 15, 12, index)).toISOString(),
  }))
  const turns = buildBoundedMemory(records, 'user-a', 'current')

  assert.equal(turns.length, 6)
  assert.deepEqual(turns.map((turn) => turn.prompt), ['Prompt 3', 'Prompt 4', 'Prompt 5', 'Prompt 6', 'Prompt 7', 'Prompt 8'])
})

test('bounds memory size and appends the current question last', () => {
  const records = Array.from({ length: 8 }, (_, index) => record({
    id: `large-${index}`,
    prompt: `${index}${'p'.repeat(2_000)}`,
    response: `${index}${'r'.repeat(4_000)}`,
    created_at: new Date(Date.UTC(2026, 6, 15, 12, index)).toISOString(),
  }))
  const turns = buildBoundedMemory(records, 'user-a', 'current')
  const size = turns.reduce((total, turn) => total + turn.prompt.length + turn.response.length, 0)
  const input = buildAgentInput({ displayName: 'David', locale: 'en', turns }, "What's my name?")

  assert.ok(size <= MEMORY_CHARACTER_LIMIT)
  assert.deepEqual(input.at(-1), { role: 'user', content: "What's my name?" })
  assert.equal(input.length, turns.length * 2 + 1)
})

test('normalizes usable profile names and ignores the default placeholder', () => {
  assert.equal(normalizeDisplayName('  David   Bato  '), 'David Bato')
  assert.equal(normalizeDisplayName('New member'), null)
  assert.equal(normalizeDisplayName('   '), null)
})
