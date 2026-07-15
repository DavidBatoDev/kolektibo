import { writeFileSync } from 'node:fs'
import sharp from 'sharp'
import toIco from 'to-ico'

const iconPath = 'apps/web/public/icon.svg'
const outPath = 'apps/web/public/favicon.ico'
const sizes = [16, 32, 48]

const images = await Promise.all(
  sizes.map((size) => sharp(iconPath).resize(size, size).png().toBuffer()),
)

writeFileSync(outPath, await toIco(images))
console.log(`Wrote ${outPath} (${sizes.join(', ')}px)`)
