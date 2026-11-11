import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import { parseMapView, stateViewBounds, trailImageUrl, trailsAtPoint } from '../dist/us-map-data.js';

const frame = { extent: [-16665617, 8642727, -16657617, 8649727], size: [800, 700] };

test('map draws the complete USGS trail layer in the current viewport without search filters or pagination', () => {
  const url = new URL(trailImageUrl(frame));
  assert.equal(url.hostname, 'carto.nationalmap.gov');
  assert.ok(url.pathname.endsWith('/MapServer/export'));
  assert.equal(url.searchParams.get('layers'), 'show:37');
  assert.equal(url.searchParams.get('bboxSR'), '3857');
  assert.equal(url.searchParams.get('imageSR'), '3857');
  assert.equal(url.searchParams.get('bbox'), frame.extent.join(','));
  assert.equal(url.searchParams.get('size'), '800,700');
  assert.equal(url.searchParams.get('transparent'), 'true');
  for (const key of ['where', 'resultRecordCount', 'layerDefs']) assert.equal(url.searchParams.has(key), false);
});

test('map clicks identify land, water and snow segments without assigning hiking access', async () => {
  const marker = { x: -16661617, y: 8646227 };
  const signal = new AbortController().signal;
  const result = await trailsAtPoint(frame, marker, signal, async (url, options) => {
    assert.equal(options.signal, signal);
    const query = new URL(url).searchParams;
    assert.equal(query.get('mapExtent'), frame.extent.join(','));
    assert.equal(query.get('geometry'), '-16661617,8646227');
    assert.equal(query.get('imageDisplay'), '800,700,96');
    assert.equal(query.get('layers'), 'all:37');
    return { ok: true, json: async () => ({ results: [
      { layerId: 37, attributes: { name: 'Land route', objectid: 1, trailtype: 'Terra Trail', hikerpedestrian: 'Y' } },
      { layerId: 37, attributes: { name: 'Paddle route', objectid: 2, trailtype: 'Water Trail', hikerpedestrian: 'N' } },
      { layerId: 37, attributes: { name: 'Ski route', objectid: 3, trailtype: 'Snow Trail', hikerpedestrian: null } },
      { layerId: 37, attributes: { name: 'Land route', objectid: 1, trailtype: 'Terra Trail', hikerpedestrian: 'Y' } },
      { layerId: 38, attributes: { name: 'Other layer', objectid: 4 } }
    ] }) };
  });
  assert.deepEqual(result.map(trail => trail.trailType), ['Land trail', 'Water trail', 'Snow trail']);
  assert.equal(result[1].hikingProhibited, true);
  assert.equal(result[2].hikingListed, false);
  await assert.rejects(trailsAtPoint(frame, marker, signal, async () => ({ ok: false })));
});

test('map return links restore valid view coordinates and reject out-of-bounds values', () => {
  assert.deepEqual(parseMapView('61.08874,-149.67385,13'), { lat: 61.08874, lon: -149.67385, zoom: 13 });
  for (const value of ['0,0,22', '0,181,4', '86,0,4', '45,abc,13', '37,-113,13&extra=1']) {
    assert.equal(parseMapView(value), null);
  }
});

test('state jumps fit all major Hawaiian islands and avoid crossing the antimeridian in Alaska', async () => {
  const data = JSON.parse(await readFile(new URL('../dist/us-states.json', import.meta.url)));
  const bounds = code => stateViewBounds(data.states.find(state => state.code === code));
  const alaska = bounds('AK');
  const hawaii = bounds('HI');
  assert.ok(alaska[0][1] < -175 && alaska[1][1] < -125);
  assert.ok(hawaii[0][1] < -160 && hawaii[1][1] > -155);
});
