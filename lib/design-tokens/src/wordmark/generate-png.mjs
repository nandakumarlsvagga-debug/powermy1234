// Build-time script to rasterize the POWERLVL wordmark SVG into PNG variants.
//
// Generates three pixel densities suitable for nav (1x), reveal/result
// surfaces (2x), and Share Cards (3x). Run from this directory:
//
//   node generate-png.mjs
//
// The PNGs are checked into source so consumers do not need a Sharp
// install at build time.

import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createRequire } from 'node:module'

const here = dirname(fileURLToPath(import.meta.url))
// Resolve sharp from the workspace; it's already a dependency of @workspace/images.
const require = createRequire(join(here, '../../../images/'))
const sharp = require('sharp')

// Source SVG renders as `currentColor`; the wordmark is white on production
// surfaces so we substitute white before rasterizing.
const svgRaw = readFileSync(join(here, 'wordmark.svg'), 'utf8')
const svgWhite = svgRaw.replace('fill="currentColor"', 'fill="#FAFAFA"')

// Target widths chosen to render crisply at the three primary use sites:
//   1x → nav rail            (180 px wide on desktop, ~120 px on mobile)
//   2x → reveal/result hero  (~360 px wide)
//   3x → share-card wordmark (1080-wide story / square crops)
const targets = [
  { suffix: '@1x', width: 240 },
  { suffix: '@2x', width: 480 },
  { suffix: '@3x', width: 720 },
]

for (const target of targets) {
  const out = join(here, `wordmark${target.suffix}.png`)
  await sharp(Buffer.from(svgWhite))
    .resize({ width: target.width })
    .png({ compressionLevel: 9 })
    .toFile(out)
  console.log(`wrote ${out}`)
}
