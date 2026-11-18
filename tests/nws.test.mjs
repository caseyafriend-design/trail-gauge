import assert from 'node:assert/strict';
import { test } from 'node:test';
import { normalizeNws, windowForecast, pointURL, fetchNws, nwsVersion } from '../dist/nws.js';
import { readForecast, writeForecast, forecastFor } from '../dist/conditions.js';
import { forecastView } from '../dist/forecast-view.js';

const now = Date.parse('2026-11-16T12:00:00Z');
const point = 'https://api.weather.gov/points/40.0000,-105.0000';
const url = 'https://api.weather.gov/gridpoints/BOU/20,30/forecast/hourly';
const fixture = () => ({ properties: {
  updateTime: '2026-11-16T11:30:00Z', generatedAt: '2026-11-16T11:45:00Z',
  validTimes: '2026-11-16T12:00:00Z/P1D', periods: [0, 1, 2].map(i => ({
    startTime: `2026-11-16T${String(5 + i).padStart(2, '0')}:00:00-07:00`,
    endTime: `2026-11-16T${String(6 + i).padStart(2, '0')}:00:00-07:00`,
    temperature: 10, temperatureUnit: 'C', probabilityOfPrecipitation: { unitCode: 'wmoUnit:percent', value: 20 },
    windSpeed: '5 to 10 mph', windDirection: 'W', shortForecast: 'Mostly Sunny'
  }))
} });
const snapshot = data => normalizeNws(data, { point, url, now });
const response = (data, headers = {}) => ({ ok: true, status: 200, headers: new Headers(headers), json: async () => data });

test('NWS coordinates use at most four decimals and reject unverified coordinates', () => {
  assert.equal(pointURL({ trailhead: [-105.123456, 40.123456] }), 'https://api.weather.gov/points/40.1235,-105.1235');
  assert.throws(() => pointURL({ trailhead: [NaN, 40] }), /coordinates/);
});

test('NWS normalizes explicit-offset hourly air temperature without inventing apparent temperature or gusts', () => {
  const s = snapshot(fixture());
  assert.equal(s.periods[0].start, now);
  assert.equal(s.periods[0].temperature, 50);
  assert.equal(s.periods[0].probability, 20);
  assert.equal(s.version, nwsVersion);
  const result = windowForecast(s, now + 60000, now + 7200000, now);
  assert.equal(result.status, 'ready');
  assert.equal(result.weather, null);
  assert.equal(result.forecast.periods.length, 2);
  assert.ok(!('apparentMin' in result.forecast));
  const partial = fixture();
  Object.assign(partial.properties.periods[0], { temperature: null, windSpeed: null, probabilityOfPrecipitation: { value: null } });
  const missing = snapshot(partial).periods[0];
  assert.equal(missing.temperature, null);
  assert.equal(missing.probability, null);
  assert.equal(missing.wind, null);
});

test('NWS missing issue/valid metadata, invalid time, overlaps and foreign URLs fail closed', () => {
  for (const key of ['updateTime', 'generatedAt', 'validTimes']) {
    const data = fixture(); delete data.properties[key];
    assert.throws(() => snapshot(data), /metadata/);
  }
  const bad = fixture(); bad.properties.periods[0].startTime = '2026-11-16T05:00:00';
  assert.throws(() => snapshot(bad), /time interval/);
  const overlap = fixture(); overlap.properties.periods[1].startTime = overlap.properties.periods[0].startTime;
  assert.throws(() => snapshot(overlap), /overlapping/);
  assert.throws(() => normalizeNws(fixture(), { point, url: 'https://example.com/forecast', now }), /metadata/);
});

test('NWS stale, old-provider, outside horizon, gaps and invalid planned times stay unknown', () => {
  const s = snapshot(fixture());
  for (const [data, start, end, clock, status] of [
    [s, now - 1, now + 1, now, 'invalid-time'],
    [null, now, now + 1, now, 'missing'],
    [{ ...s, version: 'open-meteo' }, now, now + 1, now, 'missing'],
    [s, now + 3600000, now + 7200000, now + 3600000, 'stale'],
    [s, now, now + 14400000, now, 'outside-horizon'],
    [{ ...s, periods: [s.periods[0], s.periods[2]] }, now, now + 10800000, now, 'outside-horizon']
  ]) assert.deepEqual(windowForecast(data, start, end, clock), { status, weather: null, forecast: null });
});

test('NWS offset intervals preserve repeated DST hours as distinct instants', () => {
  const data = fixture();
  data.properties.updateTime = data.properties.generatedAt = '2026-11-01T06:00:00Z';
  data.properties.validTimes = '2026-11-01T07:00:00Z/P1D';
  data.properties.periods = ['-06:00', '-07:00'].map((offset, i) => ({ startTime: `2026-11-01T01:00:00${offset}`, endTime: i ? '2026-11-01T02:00:00-07:00' : '2026-11-01T01:00:00-07:00' }));
  const s = normalizeNws(data, { point, url, now: Date.parse('2026-11-01T06:30:00Z') });
  assert.equal(s.periods[1].start - s.periods[0].start, 3600000);
});

test('NWS follows returned hourly URL, honors cache age and deduplicates concurrent callers', async () => {
  const calls = [];
  const trail = { trailhead: [-105, 40] };
  const fetcher = async (target, options) => {
    calls.push(target);
    assert.equal(options.headers['User-Agent'], undefined); // actual browser supplies its own UA
    return response(target === point ? { properties: { forecastHourly: url } } : fixture(), { 'Cache-Control': 'public, max-age=600', Age: '120' });
  };
  const [a, b] = await Promise.all([fetchNws(trail, fetcher, now), fetchNws(trail, fetcher, now)]);
  assert.deepEqual(calls, [point, url]);
  assert.equal(a, b);
  assert.equal(a.expiresAt, now + 480000);
});

test('NWS outage Retry-After prevents immediate retries and returns actionable errors', async () => {
  const trail = { trailhead: [-104, 40] };
  let calls = 0;
  const fetcher = async () => { calls++; return { ok: false, status: 503, headers: new Headers({ 'Retry-After': '120' }) }; };
  await assert.rejects(fetchNws(trail, fetcher, now), /HTTP 503/);
  await assert.rejects(fetchNws(trail, fetcher, now + 119000), /paused/);
  assert.equal(calls, 1);
});

test('cache version, location, expiry, malformed data and no-store fail closed', async () => {
  const trail = { id: 'fixture', trailhead: [-105, 40] };
  const values = new Map();
  const store = { getItem: k => values.get(k) ?? null, setItem: (k, v) => values.set(k, v) };
  writeForecast(trail, store, snapshot(fixture()), now);
  assert.equal(values.size, 1);
  assert.deepEqual(readForecast(trail, store, now), snapshot(fixture()));
  assert.equal(readForecast(trail, store, now + 3600000), null);
  assert.equal(readForecast({ ...trail, trailhead: [-106, 40] }, store, now), null);
  for (const value of [{ version: 'old' }, { ...snapshot(fixture()), periods: [null] }, { ...snapshot(fixture()), url: 'javascript:alert(1)' }]) {
    store.setItem([...values.keys()][0], JSON.stringify(value));
    assert.equal(readForecast(trail, store, now), null);
  }
  const fresh = await fetchNws({ trailhead: [-103, 40] }, async target => response(target.includes('/points/') ? { properties: { forecastHourly: url } } : fixture(), { 'Cache-Control': 'no-store' }), now);
  assert.equal(fresh.expiresAt, now);
  assert.equal(windowForecast(fresh, now, now + 60000, now).status, 'stale');
});

test('forecast view is digestible, escaped, locally timed, and does not convert air forecast into model weather', () => {
  const trail = { id: 'fixture', parkCode: 'romo', trailhead: [-105, 40], miles: 1, gain: 50, surface: 'paved' };
  const data = fixture(); data.properties.periods[0].shortForecast = '<script>';
  const s = snapshot(data);
  const result = forecastFor(trail, [], { date: '2026-11-16', start: '05:01' }, s, null, now);
  assert.equal(result.status, 'ready');
  assert.equal(result.weather, null);
  const html = forecastView(trail, result, 'https://www.nps.gov/romo/');
  for (const text of ['50–50 °F', '20% maximum', 'MST', 'Updated', 'generated', 'fetched', '2.5 km', 'not feels-like', '&lt;script&gt;']) assert.ok(html.includes(text), text);
  assert.ok(!html.includes('<script>'));
  for (const status of ['outside-horizon', 'invalid-time', 'stale', 'failed', 'missing']) {
    const unknown = forecastView(trail, { status, weather: null }, 'https://www.nps.gov/romo/');
    assert.ok(!unknown.includes('forecast-metrics'));
    assert.match(unknown, /Official park conditions/);
  }
});

test('offline, timeout and 429 each back off without calls then recover', async () => {
  for (const [index, failure] of [
    async () => { throw new TypeError('Network offline'); },
    async () => { throw new DOMException('The operation timed out', 'TimeoutError'); },
    async () => ({ ok: false, status: 429, headers: new Headers({ 'Retry-After': '90' }) })
  ].entries()) {
    const trail = { trailhead: [-100 - index, 40] };
    let calls = 0;
    await assert.rejects(fetchNws(trail, async () => { calls++; return failure(); }, now), /Forecast unavailable/);
    await assert.rejects(fetchNws(trail, async () => { calls++; }, now + 59999), /paused/);
    assert.equal(calls, 1);
    const recovered = await fetchNws(trail, async target => {
      calls++;
      return response(target.includes('/points/') ? { properties: { forecastHourly: url } } : fixture());
    }, now + 90001);
    assert.equal(calls, 3);
    assert.equal(recovered.point, pointURL(trail));
  }
});

test('storage denied retains in-memory forecast without claiming it was saved', () => {
  const trail = { id: 'fixture', trailhead: [-105, 40] };
  const storage = { getItem() { throw Error('denied'); }, setItem() { throw Error('denied'); } };
  assert.equal(readForecast(trail, storage, now), null);
  const s = snapshot(fixture());
  assert.doesNotThrow(() => writeForecast(trail, storage, s, now));
  assert.equal(windowForecast(s, now, now + 1, now).status, 'ready');
});
