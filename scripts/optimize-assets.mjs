/**
 * optimize-assets.mjs — convert the design illustrations/backgrounds from heavy
 * PNGs to WebP, resize to sane display widths, and give the un-named exports
 * semantic filenames. Run after dropping new art into public/assets|backgrounds:
 *
 *   pnpm assets:optimize
 *
 * It converts every *.png in the two folders to *.webp (quality 80) and deletes
 * the source PNG. Idempotent: re-running only touches PNGs that are still there.
 */
import { readdir, stat, unlink } from 'node:fs/promises'
import { join, dirname, basename, extname } from 'node:path'
import { fileURLToPath } from 'node:url'
import sharp from 'sharp'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')

// dir → max width for that class of art
const TARGETS = [
  { dir: 'apps/web/public/assets', maxWidth: 1024 },      // spot illustrations / 3D objects
  { dir: 'apps/web/public/backgrounds', maxWidth: 1440 }, // full-bleed screen backgrounds
]

// The un-named exports get identified + renamed. (Viewed: 3=3D "K", 4=four coins
// around a green centre, 5=a single coin.)
const RENAME = { '3': 'logo-3d', '4': 'coins-pool', '5': 'coin' }

const kb = (n) => `${(n / 1024).toFixed(0)} KB`

let beforeTotal = 0
let afterTotal = 0

for (const { dir, maxWidth } of TARGETS) {
  const abs = join(root, dir)
  let files
  try {
    files = (await readdir(abs)).filter((f) => extname(f).toLowerCase() === '.png')
  } catch {
    console.log(`(skip) ${dir} — not found`)
    continue
  }
  if (!files.length) {
    console.log(`(skip) ${dir} — no PNGs`)
    continue
  }
  console.log(`\n${dir}  (max ${maxWidth}px wide)`)
  for (const file of files) {
    const src = join(abs, file)
    const stem = basename(file, '.png')
    const outStem = RENAME[stem] ?? stem
    const out = join(abs, `${outStem}.webp`)

    const before = (await stat(src)).size
    await sharp(src)
      .resize({ width: maxWidth, withoutEnlargement: true })
      .webp({ quality: 80 })
      .toFile(out)
    const after = (await stat(out)).size
    await unlink(src)

    beforeTotal += before
    afterTotal += after
    const rename = outStem !== stem ? `  (renamed from ${stem})` : ''
    console.log(`  ${file.padEnd(18)} ${kb(before).padStart(9)} → ${outStem}.webp ${kb(after).padStart(9)}${rename}`)
  }
}

console.log(
  `\nTotal: ${kb(beforeTotal)} → ${kb(afterTotal)}  (${
    beforeTotal ? (100 - (afterTotal / beforeTotal) * 100).toFixed(1) : 0
  }% smaller)`,
)
