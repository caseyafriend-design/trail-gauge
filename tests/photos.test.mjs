import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFile } from 'node:fs/promises';
import { photos, photosFor } from '../dist/photos.js';
import { photoGallery } from '../dist/photo-gallery.js';
import { explorePhoto } from '../dist/explore-photo.js';

const catalog = JSON.parse(await readFile(new URL('../dist/routes.geojson', import.meta.url), 'utf8')).features;

test('every current hike has individually credited, commercially reusable photo provenance', () => {
  for (const { id } of catalog) {
    assert.equal(photosFor(id).length, id === 'alpine-lakes-loop' ? 1 : 2);
    for (const p of photosFor(id)) {
      assert.match(p.source, /^https:\/\/commons.wikimedia.org\/wiki\/File:/);
      assert.match(p.src, /^https:\/\/upload.wikimedia.org\//);
      assert.ok(p.creator && p.caption && p.basis && p.date && p.title && p.changes);
      assert.equal(p.reviewed, id === 'alpine-lakes-loop' ? '2026-11-19' : '2026-11-16');
      assert.ok(p.width <= 960);
      if (p.license.startsWith('CC')) assert.match(p.licenseUrl, /^https:\/\/creativecommons.org\/licenses\/by(?:-sa)?\/[234]\.0\/$/);
      else { assert.equal(p.licenseUrl, null); assert.match(p.rightsEvidence, /#Licensing$/); }
    }
  }
  assert.equal(catalog.length, 8);
  assert.equal(photos.length, 15);
  assert.match(photosFor('limberlost')[1].caption, /Historical/);
  assert.equal(photosFor('limberlost')[1].width, 534);
});

test('Explore photos are associated, credited and linked, with no substitution for unverified segments', () => {
  for (const { id, properties } of catalog) {
    const photo = photosFor(id)[0];
    const html = explorePhoto({ id, name: properties.name });
    for (const value of [photo.asset, photo.source, photo.rightsEvidence, '#trail/' + id, 'data-photo-error', 'Card display cropped to 16:9', 'not current trail conditions']) assert.ok(html.includes(value), value);
    if (photo.licenseUrl) assert.ok(html.includes(photo.licenseUrl));
    assert.equal((html.match(/<img /g) ?? []).length, 1);
  }
  assert.match(explorePhoto({ id: 'riverside-walk', name: '<Route>' }), /View &lt;Route&gt;/);
  assert.equal(explorePhoto({ id: 'usgs-unknown', name: 'Unverified' }), '');
});

test('gallery wraps, escapes and retains per-image credit beside an image-error fallback', () => {
  const trail = { id: 'riverside-walk', name: '<Route>' };
  const first = photoGallery(trail), second = photoGallery(trail, 1);
  assert.match(first, /Photo 1 of 2/);
  assert.match(second, /Ken Lund/);
  assert.equal(photoGallery(trail, -1), second);
  assert.equal(photoGallery(trail, 2), first);
  for (const text of ['&lt;Route&gt;', 'data-photo-error', 'Image credit &amp; rights', 'CC BY-SA 3.0', 'No endorsement implied', 'not current trail conditions', 'data-photo-step="-1"']) assert.ok(first.includes(text), text);
  assert.match(photoGallery({ id: 'unknown' }), /No photo with verified reuse rights/);
});


test('every gallery asset exists as a bounded local JPEG; no retired photo paths are rendered', async () => {
  for (const photo of photos) {
    const bytes = await readFile(new URL('../dist/' + photo.asset, import.meta.url));
    assert.ok(bytes.length > 1000 && bytes.length < 5000000, photo.asset);
    assert.deepEqual([...bytes.subarray(0, 2)], [255, 216], photo.asset);
    assert.ok(photoGallery({ id: photo.trailId }, photosFor(photo.trailId).indexOf(photo)).includes(photo.asset));
  }
  const app = await readFile(new URL('../dist/app.js', import.meta.url), 'utf8');
  assert.ok(app.includes('photoGallery(trail)'));
  assert.ok(!app.includes('trail.photo'));
});
