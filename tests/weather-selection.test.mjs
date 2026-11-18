import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFile } from 'node:fs/promises';
import { loadCatalog } from '../dist/catalog.js';
import { normalizeNws, pointURL } from '../dist/nws.js';
import { selectForecastTime } from '../dist/forecast-selection.js';

const catalog = JSON.parse(await readFile(new URL('../dist/routes.geojson', import.meta.url)));
const trails = await loadCatalog(async () => ({ ok: true, json: async () => catalog }));
const trail = trails.find(item => item.parkCode === 'romo');
const now = Date.parse('2026-11-16T12:30Z');
function fixture() {
  let clock = now;
  const feedback = { textContent: 'An earlier error' };
  const form = { dataset: {}, isConnected: true, elements: { date: { value: '2026-11-16' }, start: { value: '05:30' } }, querySelector: () => feedback };
  const snapshot = normalizeNws({ properties: {
    updateTime: new Date(now).toISOString(), generatedAt: new Date(now).toISOString(),
    validTimes: '2026-11-16T12:00Z/P2D', periods: Array.from({ length: 48 }, (_, i) => ({
      startTime: new Date(now - 1800000 + i * 3600000).toISOString(),
      endTime: new Date(now - 1800000 + (i + 1) * 3600000).toISOString(), temperature: 50, temperatureUnit: 'F'
    }))
  } }, { point: pointURL(trail), url: 'https://api.weather.gov/gridpoints/BOU/20,30/forecast/hourly', now });
  const args = { form, targets: [trail], group: () => [], contextFor: () => ({}),
    entryFor: () => ({ snapshot, status: 'ready' }), refresh: async () => {}, clock: () => clock };
  const submit = (values = {}) => selectForecastTime({ ...args, data: new Map([
    ['date', form.elements.date.value], ['start', form.elements.start.value], ...Object.entries(values)
  ]) });
  return { form, feedback, args, submit, advance: () => { clock++; } };
}
test('partial input is rejected; valid exact-now selection clears old feedback', async () => {
  const f = fixture();
  f.form.elements.start.value = '';
  assert.equal(await f.submit(), undefined);
  assert.match(f.feedback.textContent, /both/);
  f.form.elements.start.value = '05:30';
  assert.deepEqual(await f.submit(), { plan: { date: '2026-11-16', start: '05:30' } });
  assert.equal(f.feedback.textContent, '');
});
test('a start that passes during the request is rejected rather than silently saved', async () => {
  const f = fixture();
  f.args.refresh = async () => f.advance();
  assert.equal(await f.submit(), undefined);
  assert.match(f.feedback.textContent, /passed while checking/);
});
test('editing inputs during a request requires resubmission', async () => {
  const f = fixture();
  f.args.refresh = async () => { f.form.elements.start.value = '08:30'; };
  assert.equal(await f.submit(), undefined);
  assert.match(f.feedback.textContent, /time changed/);
});
test('reset supersedes an in-flight selection and clears fields without inventing a plan', async () => {
  const f = fixture();
  let release;
  f.args.refresh = () => new Promise(resolve => { release = resolve; });
  const pending = f.submit();
  assert.deepEqual(await f.submit({ action: 'now' }), { plan: null });
  release();
  assert.equal(await pending, undefined);
  assert.equal(f.form.elements.date.value, '');
  assert.equal(f.form.elements.start.value, '');
  assert.equal(f.feedback.textContent, '');
});
