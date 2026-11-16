import { readFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { loadCatalog, legacyTrails } from '../dist/catalog.js';
import { publicationIssues, publishedRoutes } from '../dist/publication.js';
import { initialState, loadState, storageKey } from '../dist/state.js';
import { explorePage } from '../dist/explore.js';
const snapshot = JSON.parse(await readFile(new URL('../dist/routes.geojson', import.meta.url)));
const feature = snapshot.features[0];
const trail = () => ({ ...structuredClone(feature.properties), geometry: structuredClone(feature.geometry) });
const load = features => loadCatalog(async url => {
  assert.equal(url, './routes.geojson');
  return { ok: true, json: async () => ({ features }) };
}, () => {});
test('exactly one complete itinerary per selected park passes the publication gate', async () => {
  const trails = await load(snapshot.features);
  assert.equal(trails.length, 6);
  assert.deepEqual(Object.fromEntries(trails.map(item => [item.parkCode, item.id])), publishedRoutes);
  for (const item of trails) assert.deepEqual(publicationIssues(item), []);
  assert.equal((await load([feature, feature])).length, 1);
});
test('publication rejects unknown required facts, bad sources, dates and incomplete geometry', async () => {
  for (const field of ['description', 'access', 'turnaround', 'distanceConvention', 'gainNote', 'statsNote',
    'geometryReview', 'parkCode', 'gain', 'miles', 'timeZone', 'timeZoneSource', 'ascentSource',
    'statsSource', 'geometrySource', 'geometryQuery', 'reviewDate', 'sourceSegments']) {
    const item = trail(); delete item[field];
    assert.ok(publicationIssues(item).length, field);
  }
  for (const patch of [{ gain: null }, { gain: NaN }, { miles: 0 }, { timeZone: 'UTC' },
    { statsSource: 'https://example.com' }, { reviewDate: '2026-02-30' },
    { routeType: 'Segment' }, { sourceSegments: [null] }, { geometry: null },
    { geometry: { type: 'MultiLineString', coordinates: [feature.geometry.coordinates] } }]) {
    assert.ok(publicationIssues({ ...trail(), ...patch }).length, JSON.stringify(patch));
  }
  const gap = trail(); gap.geometry.coordinates[1] = [0, 0];
  assert.ok(publicationIssues(gap).includes('Discontinuous geometry'));
  const missing = { ...feature, properties: { ...feature.properties, gain: null } };
  assert.deepEqual(await load([missing]), []);
});
test('archive preserves saved IDs, history, comparisons and preferences without republishing', async () => {
  const state = { ...initialState(), favorites: [{ key: 'verified:flattop-mountain', id: 'flattop-mountain', name: 'Flattop Mountain', source: 'verified' }], skipped: [],
    compare: ['flattop-mountain', 'bear-lake'], history: [{ trailId: 'flattop-mountain', note: 'My outing' }] };
  const stored = JSON.stringify(state);
  const restored = loadState({ getItem: key => key === storageKey ? stored : null });
  assert.deepEqual(restored, state);
  assert.equal(legacyTrails['flattop-mountain'].name, 'Flattop Mountain');
  const page = explorePage(restored, await load(snapshot.features), new URLSearchParams());
  assert.ok(page);
  assert.equal((await load(snapshot.features)).some(item => item.id === 'flattop-mountain'), false);
});
test('primary discovery and map wiring cannot request nationwide trail layers', async () => {
  const app = await readFile(new URL('../dist/app.js', import.meta.url), 'utf8');
  const explore = await readFile(new URL('../dist/explore.js', import.meta.url), 'utf8');
  assert.doesNotMatch(app, /mountUSMap|mountUSSearch|usSearchPage/);
  assert.doesNotMatch(explore, /nearbyTrails|searchTrails|carto\.nationalmap/);
});
