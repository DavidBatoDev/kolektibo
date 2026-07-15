import crypto from 'node:crypto'

// Intentionally prints shell-ready values once. Run locally and put them in the
// service environment / GitHub encrypted secrets; never commit the output.
console.log(`AGENT_KEY_ENCRYPTION_KEY=${crypto.randomBytes(32).toString('base64')}`)
console.log(`AGENT_WORKER_SECRET=${crypto.randomBytes(32).toString('base64url')}`)
