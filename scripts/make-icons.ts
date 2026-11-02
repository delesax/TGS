/**
 * Writes the PLACEHOLDER app icons in public/icons (navy square, gold ring and
 * centre point). Replace them with real artwork before launch.
 *
 *   npx tsx scripts/make-icons.ts
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { deflateSync } from "node:zlib";

const NAVY = [0x1e, 0x3a, 0x5f];
const GOLD = [0xe8, 0xb9, 0x4a];

function crc32(buf: Buffer): number {
  let c = ~0;
  for (const byte of buf) {
    c ^= byte;
    for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1));
  }
  return ~c >>> 0;
}

function chunk(type: string, data: Buffer): Buffer {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}

/** `safe` is the fraction of the icon kept clear of the edge (maskable icons need a wide margin). */
function icon(size: number, safe: number): Buffer {
  const raw = Buffer.alloc(size * (size * 3 + 1));
  const c = size / 2;
  const outer = (size / 2) * safe * 0.78;
  const inner = outer * 0.8;
  const dot = outer * 0.22;
  for (let y = 0; y < size; y++) {
    raw[y * (size * 3 + 1)] = 0;
    for (let x = 0; x < size; x++) {
      const d = Math.hypot(x + 0.5 - c, y + 0.5 - c);
      const colour = (d <= outer && d >= inner) || d <= dot ? GOLD : NAVY;
      raw.set(colour, y * (size * 3 + 1) + 1 + x * 3);
    }
  }
  const header = Buffer.alloc(13);
  header.writeUInt32BE(size, 0);
  header.writeUInt32BE(size, 4);
  header[8] = 8; // bit depth
  header[9] = 2; // RGB
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk("IHDR", header), chunk("IDAT", deflateSync(raw)), chunk("IEND", Buffer.alloc(0))]);
}

mkdirSync("public/icons", { recursive: true });
writeFileSync("public/icons/icon-192.png", icon(192, 1));
writeFileSync("public/icons/icon-512.png", icon(512, 1));
writeFileSync("public/icons/maskable-512.png", icon(512, 0.8));
writeFileSync("public/icons/apple-touch-icon.png", icon(180, 0.9));
console.log("Wrote placeholder icons to public/icons (replace before launch).");
