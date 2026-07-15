export const MEMORY_QUERY_LIMIT = 8
export const MEMORY_TURN_LIMIT = 6
export const MEMORY_CHARACTER_LIMIT = 8_000

const MEMORY_PROMPT_LIMIT = 1_000
const MEMORY_RESPONSE_LIMIT = 2_000

export type AgentMemoryRecord = {
  id: string
  user_id: string | null
  visibility: string
  trigger: string
  status: string
  prompt: string | null
  response: string | null
  created_at: string
}

export type AgentMemoryTurn = {
  prompt: string
  response: string
  createdAt: string
}

export type AgentMemoryContext = {
  displayName: string | null
  locale: 'en' | 'tl'
  turns: AgentMemoryTurn[]
}

export type AgentInputMessage = {
  role: 'user' | 'assistant'
  content: string
}

function truncate(value: string, limit: number): string {
  if (value.length <= limit) return value
  return `${value.slice(0, Math.max(0, limit - 3)).trimEnd()}...`
}

export function normalizeDisplayName(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const normalized = value.replace(/\s+/g, ' ').trim().slice(0, 80)
  if (!normalized || normalized.toLowerCase() === 'new member') return null
  return normalized
}

export function buildBoundedMemory(
  records: AgentMemoryRecord[],
  userId: string,
  currentRunId: string,
): AgentMemoryTurn[] {
  const candidates = records
    .filter((record) => record.user_id === userId
      && record.id !== currentRunId
      && record.visibility === 'private'
      && record.trigger === 'chat'
      && record.status === 'completed'
      && !!record.prompt?.trim()
      && !!record.response?.trim())
    .sort((left, right) => new Date(right.created_at).getTime() - new Date(left.created_at).getTime())
    .slice(0, MEMORY_QUERY_LIMIT)

  const selected: AgentMemoryTurn[] = []
  let usedCharacters = 0
  for (const record of candidates) {
    if (selected.length >= MEMORY_TURN_LIMIT) break
    const prompt = truncate(record.prompt!.trim(), MEMORY_PROMPT_LIMIT)
    const response = truncate(record.response!.trim(), MEMORY_RESPONSE_LIMIT)
    const size = prompt.length + response.length
    if (usedCharacters + size > MEMORY_CHARACTER_LIMIT) continue
    selected.push({ prompt, response, createdAt: record.created_at })
    usedCharacters += size
  }

  return selected.reverse()
}

export function buildAgentInput(memory: AgentMemoryContext, question: string): AgentInputMessage[] {
  return [
    ...memory.turns.flatMap((turn): AgentInputMessage[] => [
      { role: 'user', content: turn.prompt },
      { role: 'assistant', content: turn.response },
    ]),
    { role: 'user', content: question },
  ]
}

export function profileContextData(memory: AgentMemoryContext): string {
  return JSON.stringify({ display_name: memory.displayName, locale: memory.locale })
}
