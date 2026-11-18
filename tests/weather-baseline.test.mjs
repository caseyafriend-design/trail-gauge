import assert from 'node:assert/strict';
import { test } from 'node:test';
import { forecastFor, forecastRequest, startTimestamp, readForecast } from '../dist/conditions.js';
import { normalizeNws, pointURL } from '../dist/nws.js';
import { forecastView } from '../dist/forecast-view.js';
import { timeRange } from '../dist/planning.js';
import { loadCatalog } from '../dist/catalog.js';
import { readFile } from 'node:fs/promises';
const catalog = JSON.parse(await readFile(new URL('../dist/routes.geojson', import.meta.url)));
const trails = await loadCatalog(async () => ({ ok: true, json: async () => catalog }));
const now = Date.parse('2026-11-16T12:30:00Z');
const hour = 3600000;
const group = [{ fitness: 3, experience: 3 }];
function snapshot(trail, clock = now) {
  const base = Math.floor(clock / hour) * hour;
  return normalizeNws({ properties: {
    updateTime: new Date(clock).toISOString(), generatedAt: new Date(clock).toISOString(),
    validTimes: new Date(base).toISOString() + '/P2D',
    periods: Array.from({ length: 24 }, (_, i) => ({ startTime: new Date(base + i * hour).toISOString(),
      endTime: new Date(base + (i + 1) * hour).toISOString(), temperature: 50, temperatureUnit: 'F' }))
  } }, { point: pointURL(trail), url: 'https://api.weather.gov/gridpoints/BOU/20,30/forecast/hourly', now: clock });
}
test('no plan automatically uses the containing current interval on all eight routes without an outing', () => {
  assert.equal(trails.length, 8);
  for (const trail of trails) {
    const request = forecastRequest(trail, null, now);
    assert.equal(request.status, 'eligible');
    assert.equal(request.mode, 'current');
    const result = forecastFor(trail, group, null, snapshot(trail), null, now);
    assert.equal(result.status, 'ready', trail.id);
    assert.equal(result.forecast.periods.length, 1);
    assert.equal(result.forecast.start, now);
    assert.equal(result.forecast.end, now + hour / 2);
    assert.equal(result.weather, null);
    assert.match(forecastView(trail, result, 'https://www.nps.gov/'), /CURRENT-HOUR FORECAST/);
  }
});
test('past saved plans stay unchanged but cannot suppress the baseline, including seconds boundary', () => {
  const trail = trails.find(t => t.parkCode === 'romo');
  for (const plan of [{ date: '2026-11-15', start: '05:30' }, { date: '2026-11-16', start: '05:29' }]) {
    const before = JSON.stringify(plan);
    const result = forecastFor(trail, group, plan, snapshot(trail), null, now);
    assert.equal(result.status, 'ready');
    assert.equal(result.mode, 'current');
    assert.equal(JSON.stringify(plan), before);
    assert.match(forecastView(trail, result, 'https://www.nps.gov/'), /saved.*unchanged/i);
  }
  const plan = { date: '2026-11-16', start: '05:30' };
  assert.equal(forecastRequest(trail, plan, now).mode, 'planned');
  assert.equal(forecastRequest(trail, plan, now + 1).mode, 'current');
});
test('strict explicit requests reject malformed, partial, past and DST but defer horizon to provider', () => {
  const trail = trails.find(t => t.parkCode === 'romo');
  for (const plan of [{ date: '2026-11-16' }, { date: '2026-02-30', start: '12:00' },
    { date: '2026-11-16', start: '25:00' }, { date: '2026-11-16', start: '05:29' },
    { date: '2027-03-14', start: '02:30' }, { date: '2027-11-07', start: '01:30' }]) {
    assert.equal(forecastRequest(trail, plan, now, true).status, 'invalid-time');
  }
  for (const date of ['2026-12-07', '2026-12-16']) {
    const plan = { date, start: '10:00' };
    assert.equal(forecastRequest(trail, plan, now, true).status, 'eligible');
    assert.equal(forecastFor(trail, group, plan, snapshot(trail), null, now).status, 'outside-horizon');
  }
  assert.equal(startTimestamp({ date: '2027-03-14', start: '02:30' }, 'America/Phoenix'), Date.parse('2027-03-14T09:30Z'));
  assert.equal(startTimestamp({ date: '2027-11-07', start: '01:30' }, 'America/Phoenix'), Date.parse('2027-11-07T08:30Z'));
});
test('old issued cache with future HTTP expiry is not eligible for reuse', () => {
  const trail = trails[0];
  const s = { ...snapshot(trail), issuedAt: now - 12 * hour };
  assert.equal(readForecast(trail, { getItem: () => JSON.stringify(s) }, now), null);
  assert.equal(forecastFor(trail, group, null, s, null, now).status, 'stale');
});
test('planned full outing fits exact provider end but not one millisecond beyond or a gap', () => {
  const trail = trails.find(t => t.id === 'bear-lake');
  const plan = { date: '2026-11-16', start: '06:00' };
  const start = Date.parse('2026-11-16T13:00Z');
  const end = start + timeRange(trail, group, null).high * 60000;
  const s = snapshot(trail);
  s.periods = [{ ...s.periods[0], start, end }];
  s.validThrough = end;
  assert.equal(forecastFor(trail, group, plan, s, null, now).status, 'ready');
  assert.equal(forecastFor(trail, group, plan, { ...s, validThrough: end - 1 }, null, now).status, 'outside-horizon');
  assert.equal(forecastFor(trail, group, plan, { ...s, periods: [{ ...s.periods[0], end: end - 1 }] }, null, now).status, 'outside-horizon');
  const split = start + (end - start) / 2;
  s.periods = [{ ...s.periods[0], end: split }, { ...s.periods[0], start: split + 1 }];
  assert.equal(forecastFor(trail, group, plan, s, null, now).status, 'outside-horizon');
});
