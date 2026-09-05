#!/usr/bin/env node
/**
 * Rebuilds website/assets/memes/manifest.json from whatever image files are in
 * that folder. Captions you have already written are preserved and matched by
 * filename, so this is safe to re-run any time.
 *
 *   npm run memes
 *
 * Newest file first (by modified time), which is the order the gallery shows by
 * default. Specimen ids are assigned from that order: newest gets the highest
 * number, so existing ids stay put as you add more.
 */
import { readdirSync, statSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join, extname, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const DIR = join(ROOT, 'website', 'assets', 'memes');
const MANIFEST = join(DIR, 'manifest.json');
const EXT = new Set(['.jpg', '.jpeg', '.png', '.gif', '.webp', '.avif']);

if (!existsSync(DIR)) {
  console.error(`No such folder: ${DIR}`);
  process.exit(1);
}

// keep captions from the current manifest, keyed by filename
const existing = new Map();
if (existsSync(MANIFEST)) {
  try {
    const prev = JSON.parse(readFileSync(MANIFEST, 'utf8'));
    for (const m of prev.memes || []) existing.set(m.file, m.caption || '');
  } catch (err) {
    console.warn(`Could not parse existing manifest, captions will be blank: ${err.message}`);
  }
}

const files = readdirSync(DIR)
  .filter((f) => EXT.has(extname(f).toLowerCase()))
  .map((f) => ({ file: f, mtime: statSync(join(DIR, f)).mtimeMs }))
  .sort((a, b) => b.mtime - a.mtime); // newest first

const total = files.length;
const memes = files.map((f, i) => ({
  file: f.file,
  id: `MBC-${String(total - i).padStart(3, '0')}`,
  caption: existing.get(f.file) || '',
}));

writeFileSync(MANIFEST, JSON.stringify({ memes }, null, 2) + '\n');

const missing = memes.filter((m) => !m.caption).length;
console.log(`Wrote ${total} specimen${total === 1 ? '' : 's'} to assets/memes/manifest.json`);
if (missing) {
  console.log(`${missing} still ${missing === 1 ? 'has' : 'have'} no caption — add them in the manifest, they survive re-runs.`);
}
if (total) {
  console.log(`Newest: ${memes[0].id} (${memes[0].file})`);
}
