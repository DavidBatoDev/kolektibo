import { readFile, writeFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { randomBytes } from 'node:crypto'
import webpush from 'web-push'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const target = resolve(root, 'supabase/.env.push.local')
const legacy = resolve(root, 'services/ai/.env')
const webEnv = resolve(root, 'apps/web/.env.local')

function parseEnv(content) {
  return Object.fromEntries(
    content
      .replaceAll('\r\n', '\n')
      .split('\n')
      .filter((line) => line && !line.startsWith('#') && line.includes('='))
      .map((line) => {
        const separator = line.indexOf('=')
        return [line.slice(0, separator), line.slice(separator + 1)]
      }),
  )
}

async function removeKeys(path, keys) {
  if (!existsSync(path)) return
  const content = await readFile(path, 'utf8')
  const next = content
    .replaceAll('\r\n', '\n')
    .split('\n')
    .filter((line) => !keys.some((key) => line.startsWith(`${key}=`)))
    .join('\n')
  await writeFile(path, next.endsWith('\n') ? next : `${next}\n`, 'utf8')
}

if (existsSync(target)) {
  const existing = await readFile(target, 'utf8')
  if (!parseEnv(existing).PUSH_WEBHOOK_SECRET) {
    const suffix = existing.endsWith('\n') ? '' : '\n'
    await writeFile(target, `${existing}${suffix}PUSH_WEBHOOK_SECRET=${randomBytes(32).toString('base64url')}\n`, 'utf8')
  }
  await Promise.all([
    removeKeys(legacy, ['VAPID_PUBLIC_KEY', 'VAPID_PRIVATE_KEY', 'VAPID_SUBJECT']),
    removeKeys(webEnv, ['VITE_VAPID_PUBLIC_KEY']),
  ])
  console.log('Supabase push secrets already exist locally; no keys were changed.')
  console.log('Legacy AI and web-host VAPID entries were removed.')
  console.log('Run: supabase secrets set --env-file supabase/.env.push.local')
  process.exit(0)
}

let previous = {}
if (existsSync(legacy)) previous = parseEnv(await readFile(legacy, 'utf8'))
const generated = webpush.generateVAPIDKeys()
const publicKey = previous.VAPID_PUBLIC_KEY || generated.publicKey
const privateKey = previous.VAPID_PRIVATE_KEY || generated.privateKey
const subject = previous.VAPID_SUBJECT || 'mailto:admin@kolektibo.app'
const webhookSecret = randomBytes(32).toString('base64url')

await writeFile(
  target,
  `VAPID_PUBLIC_KEY=${publicKey}\nVAPID_PRIVATE_KEY=${privateKey}\nVAPID_SUBJECT=${subject}\nPUSH_WEBHOOK_SECRET=${webhookSecret}\n`,
  { encoding: 'utf8', mode: 0o600 },
)

await Promise.all([
  removeKeys(legacy, ['VAPID_PUBLIC_KEY', 'VAPID_PRIVATE_KEY', 'VAPID_SUBJECT']),
  removeKeys(webEnv, ['VITE_VAPID_PUBLIC_KEY']),
])

console.log('Supabase push secrets are ready in the ignored supabase/.env.push.local file.')
console.log('No secret value was printed. Next run:')
console.log('  supabase secrets set --env-file supabase/.env.push.local')
console.log('  supabase functions deploy push --use-api')
