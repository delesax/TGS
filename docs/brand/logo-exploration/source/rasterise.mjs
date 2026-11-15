// Renders the favicon PNGs from the SVG masters in favicon-src/ using sharp.
// Usage: node rasterise.mjs /path/to/node_modules/sharp
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const here = dirname(fileURLToPath(import.meta.url));
const sharp = createRequire(import.meta.url)(process.argv[2]);
const out = join(here, "..", "..", "favicon");
mkdirSync(out, { recursive: true });
const jobs = [
  ["favicon-32.svg", "favicon-32.png", 32],
  ["apple-touch-icon-180.svg", "apple-touch-icon-180.png", 180],
  ["icon-192.svg", "icon-192.png", 192],
  ["icon-512.svg", "icon-512.png", 512],
];
for (const [src, dst, size] of jobs) {
  const svg = readFileSync(join(here, "favicon-src", src));
  await sharp(svg, { density: 384 }).resize(size, size).png({ compressionLevel: 9 }).toFile(join(out, dst));
  console.log(dst, size);
}
