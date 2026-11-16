// Fetch only the rights-reviewed, bounded Wikimedia renditions in the manifest.
import { readFile, writeFile } from 'node:fs/promises';
import { photos } from '../dist/photos.js';

for (const photo of photos) {
  const file = new URL(`../dist/photos/${photo.trailId}-${photo.id}.jpg`, import.meta.url);
  try {
    const existing = await readFile(file);
    if (existing.length > 2 && existing[0] === 255 && existing[1] === 216) { console.log(`Retained JPEG ${photo.id}`); continue; }
  } catch (error) { if (error.code !== 'ENOENT') throw error; }
  await new Promise(resolve => setTimeout(resolve, 5000));
  const response = await fetch(photo.src, { headers: { 'User-Agent': 'TrailGauge/1.0 photo asset retrieval' }, signal: AbortSignal.timeout(20000) });
  if (!response.ok) throw Error(`${photo.trailId} photo ${photo.id}: HTTP ${response.status} (Retry-After: ${response.headers.get('Retry-After')}) at ${photo.src}: ${(await response.text()).slice(0, 500)}`);
  const bytes = new Uint8Array(await response.arrayBuffer());
  if (!response.headers.get('Content-Type')?.startsWith('image/jpeg') || bytes.length > 5000000 || bytes[0] !== 255 || bytes[1] !== 216) {
    throw Error(`${photo.trailId} photo ${photo.id}: expected a JPEG under 5MB, got ${bytes.length} bytes (${response.headers.get('Content-Type')})`);
  }
  await writeFile(file, bytes);
  console.log(JSON.stringify({ id: photo.id, url: photo.src, bytes: bytes.length, type: response.headers.get('Content-Type') }));
}
