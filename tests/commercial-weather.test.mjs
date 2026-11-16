import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFile } from 'node:fs/promises';
import { fetchForecast, readForecast, writeForecast, forecastRequest, forecastFor, fetchAlerts } from '../dist/conditions.js';
test('commercial milestone never reads old weather cache or makes forecast requests', async () => {
  const forbidden = new Proxy({}, { get() { assert.fail('No route or cache access allowed'); } });
  assert.equal(readForecast(forbidden, forbidden), null);
  writeForecast(forbidden, forbidden, forbidden);
  assert.deepEqual(forecastRequest(forbidden), { status: 'disabled', weather: null });
  assert.deepEqual(forecastFor(forbidden, forbidden), { status: 'disabled', weather: null });
  await assert.rejects(fetchForecast(forbidden, () => assert.fail('No provider call')), /commercially permitted/);
  const app = await readFile(new URL('../dist/app.js', import.meta.url), 'utf8');
  assert.match(app, /const weatherFor = \(\) => null/);
  const conditions = await readFile(new URL('../dist/conditions.js', import.meta.url), 'utf8');
  assert.doesNotMatch(conditions, /api\.open-meteo|forecast-api|localStorage/);
});
test('optional alerts failures are explicit and do not depend on forecasts', async () => {
  await assert.rejects(fetchAlerts('zion', async () => { throw new Error('offline'); }), /offline/);
  await assert.rejects(fetchAlerts('zion', async () => ({ ok: false })), /Park alerts request failed/);
});
