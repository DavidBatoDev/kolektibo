const AI_URL = import.meta.env.VITE_AI_URL || 'http://localhost:8787'

export type Policy = {
  currency: string
  dues: { amount: number; period: 'monthly' | 'weekly' | 'once' } | null
  categories: { name: string; monthlyLimit: number | null }[]
  approval: { threshold: number; of: number }
  summary: string
}

/** Turn plain-language group rules into a structured, on-chain-ready policy. */
export async function parseRules(text: string): Promise<Policy> {
  const res = await fetch(`${AI_URL}/rules`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ text }),
  })
  if (!res.ok) throw new Error((await res.text()) || `AI service error ${res.status}`)
  const data = await res.json()
  return data.policy as Policy
}

/** Ask a plain-language question; answer is grounded in the on-chain state we pass in. */
export async function askAI(question: string, state: unknown): Promise<string> {
  const res = await fetch(`${AI_URL}/ask`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ question, state }),
  })
  if (!res.ok) throw new Error((await res.text()) || `AI service error ${res.status}`)
  const data = await res.json()
  return data.answer as string
}
