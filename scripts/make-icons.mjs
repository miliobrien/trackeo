// Draws the app icon as PNG without any image library: an ink square with a
// white clock ring and a single green hand, the one colour the app reserves
// for a running timer. Run with `node scripts/make-icons.mjs`.
import { writeFileSync } from 'node:fs'
import { deflateSync } from 'node:zlib'

const INK = [0x14, 0x18, 0x1f]
const PAPER = [0xfb, 0xfc, 0xfd]
const LIVE = [0x0b, 0x7a, 0x5b]

function crc32(buf) {
  let c
  const table = []
  for (let n = 0; n < 256; n++) {
    c = n
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    table[n] = c >>> 0
  }
  let crc = 0xffffffff
  for (const byte of buf) crc = table[(crc ^ byte) & 0xff] ^ (crc >>> 8)
  return (crc ^ 0xffffffff) >>> 0
}

function chunk(type, data) {
  const len = Buffer.alloc(4)
  len.writeUInt32BE(data.length)
  const body = Buffer.concat([Buffer.from(type), data])
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(body))
  return Buffer.concat([len, body, crc])
}

// Colour of one point in a unit square, centre at (0.5, 0.5).
function shade(x, y) {
  const dx = x - 0.5
  const dy = y - 0.5
  const r = Math.hypot(dx, dy)
  // Green hand pointing up and slightly right, from the centre.
  const hx = 0.16
  const hy = -0.24
  const t = Math.max(0, Math.min(1, (dx * hx + dy * hy) / (hx * hx + hy * hy)))
  const distHand = Math.hypot(dx - t * hx, dy - t * hy)
  if (distHand < 0.035) return LIVE
  if (r < 0.045) return LIVE
  if (r > 0.26 && r < 0.315) return PAPER
  return INK
}

function icon(size) {
  const SS = 4
  const raw = Buffer.alloc((size * 3 + 1) * size)
  for (let py = 0; py < size; py++) {
    raw[py * (size * 3 + 1)] = 0
    for (let px = 0; px < size; px++) {
      const sum = [0, 0, 0]
      for (let sy = 0; sy < SS; sy++) {
        for (let sx = 0; sx < SS; sx++) {
          const c = shade((px + (sx + 0.5) / SS) / size, (py + (sy + 0.5) / SS) / size)
          sum[0] += c[0]
          sum[1] += c[1]
          sum[2] += c[2]
        }
      }
      const o = py * (size * 3 + 1) + 1 + px * 3
      for (let i = 0; i < 3; i++) raw[o + i] = Math.round(sum[i] / (SS * SS))
    }
  }
  const header = Buffer.alloc(13)
  header.writeUInt32BE(size, 0)
  header.writeUInt32BE(size, 4)
  header[8] = 8
  header[9] = 2
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', header),
    chunk('IDAT', deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ])
}

for (const size of [192, 512]) {
  writeFileSync(new URL(`../public/icon-${size}.png`, import.meta.url), icon(size))
}
console.log('icons written')
