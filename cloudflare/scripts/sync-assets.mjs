import { copyFile, mkdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const projectDir = join(dirname(fileURLToPath(import.meta.url)), '..');
const siteDir = join(projectDir, '..');
const publicDir = join(projectDir, 'public');
const assets = ['index.html', 'styles.css', 'script.js'];

await mkdir(publicDir, { recursive: true });
await Promise.all(assets.map((asset) => copyFile(join(siteDir, asset), join(publicDir, asset))));
console.log(`Prepared ${assets.length} site assets for Cloudflare.`);
