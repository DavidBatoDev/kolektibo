// Client wrappers for our custom auth-email endpoints on the backend (services/ai).
// Same convention as lib/ai.ts / lib/backend.ts: VITE_AI_URL, plain-text error bodies.
const AI_URL = import.meta.env.VITE_AI_URL || 'http://localhost:8787'

export type CodePurpose = 'verify_email' | 'reset_password'

async function post(path: string, body: unknown): Promise<void> {
  const res = await fetch(`${AI_URL}${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!res.ok) throw new Error((await res.text()) || `Request failed (${res.status})`)
}

/** Email a 6-digit code for verification or password reset. Always resolves for valid input
 *  (the backend is anti-enumeration), so UI copy should say "if an account exists…". */
export function sendCode(email: string, purpose: CodePurpose): Promise<void> {
  return post('/auth/send-code', { email, purpose })
}

export function verifyCode(email: string, code: string): Promise<void> {
  return post('/auth/verify-code', { email, code })
}

export function resetPassword(email: string, code: string, newPassword: string): Promise<void> {
  return post('/auth/reset-password', { email, code, newPassword })
}
