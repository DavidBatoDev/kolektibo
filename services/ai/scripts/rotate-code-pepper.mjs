import { randomBytes } from 'node:crypto'
import { readFile, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const envPath = resolve(here, '../.env')
const before = await readFile(envPath, 'utf8')
const replacement = `CODE_PEPPER=${randomBytes(32).toString('hex')}`
const after = /^CODE_PEPPER=.*$/m.test(before)
  ? before.replace(/^CODE_PEPPER=.*$/m, replacement)
  : `${before.replace(/\s*$/, '\n')}${replacement}\n`

await writeFile(envPath, after, 'utf8')
console.log('Local verification-code pepper rotated.')
