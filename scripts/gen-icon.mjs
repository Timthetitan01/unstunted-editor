// Generates icon.iconset/ PNGs from an SVG, then runs iconutil to produce icon.icns
import sharp from 'sharp'
import { execSync } from 'child_process'
import { mkdirSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const iconsetDir = join(root, 'build', 'icon.iconset')
mkdirSync(iconsetDir, { recursive: true })

// The icon SVG — dark navy rounded square, film-strip sprocket holes, bold play triangle
// Rendered at 1024×1024 base, then scaled down.
function makeSvg(size) {
  const r = Math.round(size * 0.22)   // corner radius ~22% of size
  const holeW = Math.round(size * 0.10)
  const holeH = Math.round(size * 0.07)
  const holeR = Math.round(size * 0.02)
  const holeY_top = Math.round(size * 0.095)
  const holeY_bot = Math.round(size * 0.835)
  const holeXs = [0.155, 0.325, 0.495, 0.665].map(f => Math.round(f * size))
  const triL = Math.round(size * 0.29)  // play triangle left edge x
  const triR = Math.round(size * 0.78)  // play triangle right point x
  const triT = Math.round(size * 0.24)  // top y
  const triB = Math.round(size * 0.76)  // bottom y
  const triMid = Math.round(size * 0.50)

  const holes = holeXs.map(x => `
    <rect x="${x}" y="${holeY_top}" width="${holeW}" height="${holeH}" rx="${holeR}" fill="rgba(255,255,255,0.13)"/>
    <rect x="${x}" y="${holeY_bot}" width="${holeW}" height="${holeH}" rx="${holeR}" fill="rgba(255,255,255,0.13)"/>
  `).join('')

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#17304f"/>
      <stop offset="100%" stop-color="#070d18"/>
    </linearGradient>
    <linearGradient id="tri" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#e8f4ff"/>
      <stop offset="100%" stop-color="#b8d8ff"/>
    </linearGradient>
  </defs>
  <rect width="${size}" height="${size}" rx="${r}" fill="url(#bg)"/>
  ${holes}
  <polygon points="${triL},${triT} ${triL},${triB} ${triR},${triMid}" fill="url(#tri)"/>
</svg>`
}

const sizes = [16, 32, 64, 128, 256, 512, 1024]
const iconsetMap = {
  16:   ['icon_16x16.png'],
  32:   ['icon_16x16@2x.png', 'icon_32x32.png'],
  64:   ['icon_32x32@2x.png'],
  128:  ['icon_128x128.png'],
  256:  ['icon_128x128@2x.png', 'icon_256x256.png'],
  512:  ['icon_256x256@2x.png', 'icon_512x512.png'],
  1024: ['icon_512x512@2x.png'],
}

for (const size of sizes) {
  const svg = Buffer.from(makeSvg(size))
  const names = iconsetMap[size]
  for (const name of names) {
    const out = join(iconsetDir, name)
    await sharp(svg, { density: 72 }).resize(size, size).png().toFile(out)
    console.log(`  ${name}`)
  }
}

execSync(`iconutil -c icns "${iconsetDir}" -o "${join(root, 'build', 'icon.icns')}"`)
console.log('✓ build/icon.icns created')
