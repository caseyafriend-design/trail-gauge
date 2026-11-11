import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import { buildTrailQuery, loadTrailSegment, pageSize, searchOptions, searchParams, searchTrails, trailRecord,
  usgsLayer } from '../dist/us-trails.js';

const response = data => ({ ok: true, json: async () => data });
const stateData = JSON.parse(await readFile(new URL('../dist/us-states.json', import.meta.url)));
const alaska = stateData.states.find(item => item.code === 'AK');
const example = { name: 'Flattop Mountain', hikerpedestrian: 'Y', lengthmiles: 1.34,
  objectid: 150, permanentidentifier: '{11111111-2222-3333-4444-555555555555}', sourceoriginator: 'State agency' };

test('Census filter covers all 50 states, DC and Puerto Rico with closed rings', () => {
  assert.equal(stateData.states.length, 52);
  assert.equal(new Set(stateData.states.map(state => state.code)).size, 52);
  for (const code of ['AK', 'HI', 'ME', 'FL', 'DC', 'PR']) {
    assert.ok(stateData.states.some(state => state.code === code));
  }
  for (const state of stateData.states) {
    assert.ok(state.rings.length > 0);
    for (const ring of state.rings) {
      assert.ok(ring.length >= 4);
      assert.deepEqual(ring[0], ring.at(-1));
    }
  }
});

test('search URLs preserve punctuation, area, unnamed option and page', () => {
  const options = { query: "King's / Ridge & Falls?", stateCode: 'HI', includeUnnamed: true, page: 3 };
  assert.deepEqual(searchOptions(new URLSearchParams(searchParams(options))), options);
  assert.equal(searchOptions(new URLSearchParams('state=DROP&page=-8')).stateCode, '');
  assert.equal(searchOptions(new URLSearchParams('page=-8')).page, 0);
});

test('builds a bounded, ordered USGS query and quotes names literally', () => {
  const params = buildTrailQuery({ query: "King's_Ridge", page: 2 }, alaska);
  assert.match(params.get('where'), /KING''S RIDGE/);
  assert.match(params.get('where'), /hikerpedestrian = 'Y' OR hikerpedestrian IS NULL/);
  assert.equal(params.get('geometryType'), 'esriGeometryPolygon');
  assert.equal(params.get('spatialRel'), 'esriSpatialRelIntersects');
  assert.deepEqual(JSON.parse(params.get('geometry')).rings, alaska.rings);
  assert.equal(params.get('resultOffset'), String(2 * pageSize));
  assert.equal(params.get('resultRecordCount'), String(pageSize));
  assert.equal(params.get('returnGeometry'), 'false');
  const named = buildTrailQuery({ query: '', page: 0, includeUnnamed: false });
  const all = buildTrailQuery({ query: '', page: 0, includeUnnamed: true });
  assert.match(named.get('where'), /name IS NOT NULL/);
  assert.doesNotMatch(all.get('where'), /name IS NOT NULL/);
});

test('state results use a POST polygon and keep provider pagination', async () => {
  const options = { query: 'Flattop Mountain', stateCode: 'AK', page: 0 };
  const result = await searchTrails(options, alaska, undefined, async (url, request) => {
    assert.equal(url, usgsLayer + '/query');
    assert.equal(request.method, 'POST');
    assert.ok(request.body.has('geometry'));
    return response({ features: [{ attributes: example }], exceededTransferLimit: true });
  });
  assert.equal(result.hasMore, true);
  assert.equal(result.trails[0].id, example.permanentidentifier);
  assert.equal(result.trails[0].miles, 1.34);
  assert.equal(result.trails[0].hikingListed, true);
  assert.equal('geometry' in result.trails[0], false);
  await assert.rejects(searchTrails(options, undefined, undefined, async () => response({ features: [] })));
});

test('preserves unknown hiking status and unavailable fields without guessing', () => {
  const unknown = trailRecord({ objectid: 42, hikerpedestrian: null });
  assert.equal(unknown.name, 'Unnamed trail segment');
  assert.equal(unknown.miles, null);
  assert.equal(unknown.hikingListed, false);
  assert.equal(unknown.id, 'oid-42');
  assert.equal(trailRecord({ objectid: 42, hikerpedestrian: 'N' }), null);
  assert.equal(trailRecord({ name: 'No identifier' }), null);
});

test('direct links resolve to original multipart geometry without a synthetic trailhead', async () => {
  const geometry = { type: 'MultiLineString', coordinates: [
    [[-149, 61], [-148, 61]], [[-147, 61], [-146, 61]]
  ] };
  const record = await loadTrailSegment(example.permanentidentifier, undefined, async url => {
    const params = new URL(url).searchParams;
    assert.ok(params.get('where').endsWith(`permanentidentifier = '${example.permanentidentifier}'`));
    assert.equal(params.get('outSR'), '4326');
    assert.equal(params.get('returnM'), 'false');
    return response({ features: [{ properties: example, geometry }] });
  });
  assert.deepEqual(record.geometry, geometry);
  assert.equal('trailhead' in record, false);
  assert.equal('gain' in record, false);
  assert.equal(await loadTrailSegment("' OR 1=1", undefined, () => assert.fail('Invalid ID should not fetch')), null);
});

test('separates empty results and missing linework from provider failures', async () => {
  const options = { query: 'no matches', page: 0 };
  assert.deepEqual(await searchTrails(options, null, undefined, async () => response({ features: [] })),
    { trails: [], hasMore: false });
  const record = await loadTrailSegment(example.permanentidentifier, undefined,
    async () => response({ features: [{ properties: example, geometry: null }] }));
  assert.equal('geometry' in record, false);
  await assert.rejects(searchTrails(options, null, undefined, async () => response({ error: { code: 500 } })));
});
