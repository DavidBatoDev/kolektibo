import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'

const root = resolve(import.meta.dirname, '../../..')
const envPath = resolve(root, 'services/ai/.env')

if (!existsSync(envPath)) throw new Error('services/ai/.env does not exist')

const source = readFileSync(envPath, 'utf8')
const values = new Map()
for (const line of source.split(/\r?\n/)) {
  const match = line.match(/^([^#=]+)=(.*)$/)
  if (match) values.set(match[1].trim(), match[2].trim().replace(/^['"]|['"]$/g, ''))
}

const stellar = values.get('STELLAR_BIN') || 'stellar'
const readSecret = (identity) => execFileSync(stellar, ['keys', 'secret', identity, '--quiet'], {
  cwd: root,
  encoding: 'utf8',
  windowsHide: true,
  stdio: ['ignore', 'pipe', 'ignore'],
}).trim()

const replacements = {
  USE_SDK_BACKEND: '1',
  DEPLOYER_SECRET: readSecret(values.get('DEPLOYER_IDENTITY') || 'kolektibo-deployer'),
  ISSUER_SECRET: readSecret(values.get('ISSUER_IDENTITY') || 'kolektibo-usdc-issuer'),
}

let next = source
for (const [key, value] of Object.entries(replacements)) {
  const row = `${key}=${value}`
  next = new RegExp(`^${key}=.*$`, 'm').test(next)
    ? next.replace(new RegExp(`^${key}=.*$`, 'm'), row)
    : `${next.trimEnd()}\n${row}\n`
}

writeFileSync(envPath, next)
console.log('SDK backend enabled in services/ai/.env; private keys were not printed.')
