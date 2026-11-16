import { readFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { hasGeometry, loadCatalog } from '../dist/catalog.js';
import { estimate } from '../dist/model.js';
import { bestGroupFit, timeRange } from '../dist/planning.js';
import { activeAlerts, fetchAlerts, fetchForecast, forecastFor, forecastMaxAge,
  forecastRequest, readForecast, startTimestamp, writeForecast } from '../dist/conditions.js';
import { initialState, legacyStorageKey, loadState, migrateState, storageKey } from '../dist/state.js';

const catalog = JSON.parse(await readFile(new URL('../dist/routes.geojson', import.meta.url)));
const response = data => ({ ok: true, json: async () => data });
const trails = await loadCatalog(async () => response(catalog));
const getTrail = id => trails.find(trail => trail.id === id);
const memory = (entries = []) => {
  const values = new Map(entries);
  return { getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value),
    removeItem: key => values.delete(key) };
};

test('catalog identifies park, source, actual trailhead and complete route for seven verified hikes', () => {
  assert.deepEqual(trails.map(trail => trail.id), ['riverside-walk', 'bear-lake', 'flattop-mountain', 'hall-of-mosses',
    'lower-yosemite-fall', 'limberlost', 'desert-discovery']);
  for (const trail of trails) {
    assert.ok(hasGeometry(trail));
    assert.deepEqual(trail.trailhead, trail.geometry.coordinates[0]);
    if (trail.parkingGapMeters) {
      assert.ok(trail.parkingGapMeters <= 15);
      assert.match(trail.access, /neighboring access points/);
    } else {
      assert.deepEqual(trail.trailhead, trail.geometry.coordinates.at(-1));
    }
    assert.match(trail.stateCode, /^[A-Z]{2}$/);
    assert.ok(trail.statsSource.includes('nps.gov'));
    assert.ok(trail.geometryQuery.includes('mapservices.nps.gov'));
    assert.match(trail.importDate, /^\d{4}-\d{2}-\d{2}$/);
    assert.ok(Math.abs(trail.gisMiles - trail.miles) <= .12);
  }
  assert.equal(getTrail('riverside-walk').miles, 2);
  assert.equal(getTrail('riverside-walk').gain, 203);
  const flattop = getTrail('flattop-mountain');
  assert.equal(flattop.miles, 8.8);
  assert.equal(flattop.gain, 2849);
  assert.ok(flattop.upperPoint.elevationFt - flattop.trailheadElevation > 2500);
  assert.ok(flattop.geometry.coordinates.some(point => point.join(',') === flattop.upperPoint.coordinates.join(',')));
});

test('missing catalog or map geometry fails gracefully', async () => {
  assert.deepEqual(await loadCatalog(async () => ({ ok: false })), []);
  assert.deepEqual(await loadCatalog(async () => { throw new Error('offline'); }), []);
  const feature = { ...catalog.features[0], geometry: null };
  const [trail] = await loadCatalog(async () => response({ features: [feature] }));
  assert.equal(trail.miles, 2);
  assert.equal(hasGeometry(trail), false);
  assert.equal(hasGeometry({ geometry: { type: 'LineString', coordinates: [[0, 0], [NaN, 1]] } }), false);
});

const seeded = {
  people: [
    { id: 'hiker-0', name: 'Alex', kind: 'self', fitness: 3, experience: 3 },
    { id: 'hiker-1', name: 'Sam', kind: 'demo', fitness: 3, experience: 2 },
    { id: 'hiker-2', name: 'Jamie', kind: 'local', fitness: 1, experience: 1 },
    { id: 'demo-morgan', name: 'Morgan', kind: 'demo', fitness: 2, experience: 3 }
  ],
  groupName: 'Weekend crew', memberIds: ['hiker-0', 'hiker-1', 'hiker-2'],
  presets: [{ id: 'weekend', name: 'Weekend crew', memberIds: ['hiker-0', 'hiker-1', 'hiker-2'] }],
  history: [{ sample: true, trailId: 'riverside-walk' }], weather: { 'riverside-walk': 'Hot' }, compare: [], reviews: {}
};

test('fresh and untouched v1 state have no seeded personal content', () => {
  assert.deepEqual(loadState(memory()), initialState());
  const store = memory([[legacyStorageKey, JSON.stringify(seeded)]]);
  assert.deepEqual(loadState(store), initialState());
  assert.equal(store.getItem(legacyStorageKey), null);
  assert.equal(store.getItem(storageKey), JSON.stringify(initialState()));
});

test('migrates altered seed profiles, user guests, groups, archived text, real reviews and comparison preferences', () => {
  const v1 = structuredClone(seeded);
  v1.people[0].name = 'A real organizer';
  v1.people.push({ id: 'guest-1', name: 'Jamie', kind: 'local', fitness: 1, experience: 1 });
  v1.people.push({ id: 'user-sam', name: 'Sam', kind: 'demo', fitness: 3, experience: 2 });
  v1.presets.push({ id: 'weekends-with-guest', name: 'Weekend outing', memberIds: ['hiker-0', 'guest-1', 'hiker-2'] });
  v1.groupName = 'Weekend outing';
  v1.memberIds = ['hiker-0', 'guest-1', 'hiker-2'];
  v1.fitBudget = 95;
  v1.compare = ['riverside-walk', 'emerald-lake'];
  v1.chats = { 'weekends-with-guest': [{ sender: 'Guest', text: 'Saved local text' }] };
  v1.reviews = { 'riverside-walk': { trailId: 'riverside-walk', note: 'Personal review' } };
  const unavailableReview = { trailId: 'emerald-lake', note: 'An older hike' };
  v1.history.push(v1.reviews['riverside-walk'], unavailableReview);
  const store = memory([[legacyStorageKey, JSON.stringify(v1)]]);
  const actual = loadState(store);
  assert.deepEqual(actual.people.map(person => [person.id, person.kind]), [['hiker-0', 'self'], ['guest-1', 'local'], ['user-sam', 'local']]);
  assert.deepEqual(actual.memberIds, ['hiker-0', 'guest-1']);
  assert.deepEqual(actual.presets.find(group => group.id === 'weekends-with-guest').memberIds, ['hiker-0', 'guest-1']);
  assert.equal(actual.groupName, 'Weekend outing');
  assert.deepEqual(actual.compare, v1.compare);
  assert.equal(actual.fitBudget, 95);
  assert.deepEqual(actual.history, [v1.reviews['riverside-walk'], unavailableReview]);
  assert.deepEqual(actual.reviews, v1.reviews);
  assert.deepEqual(actual.archivedChats, v1.chats);
  assert.equal('weather' in actual, false);
  assert.deepEqual(loadState(store), actual);
});

test('retains older unmarked group-array profiles and leaves the original if migration cannot write', () => {
  const group = [{ name: 'Alex', fitness: 3, experience: 3 }, { name: 'A local guest', fitness: 2, experience: 1 }];
  const migrated = migrateState({ group, reviews: { 'bear-lake': { note: 'Kept' } } });
  assert.deepEqual(migrated.people.map(person => person.name), ['Alex', 'A local guest']);
  assert.deepEqual(migrated.memberIds, ['hiker-0', 'hiker-1']);
  assert.deepEqual(migrated.history, [{ trailId: 'bear-lake', note: 'Kept' }]);
  const store = memory([[legacyStorageKey, JSON.stringify(seeded)]]);
  store.setItem = () => { throw new Error('Quota'); };
  assert.deepEqual(loadState(store), initialState());
  assert.ok(store.getItem(legacyStorageKey));
});

test('slower saved guest changes the time and best group fit', () => {
  const organizer = { fitness: 3, experience: 3 };
  const guest = { fitness: 1, experience: 1 };
  const options = [getTrail('riverside-walk'), getTrail('bear-lake')];
  assert.equal(bestGroupFit(options, [organizer], 60, () => null).best.trail.id, 'riverside-walk');
  assert.equal(bestGroupFit(options, [organizer, guest], 60, () => null).best.trail.id, 'bear-lake');
  assert.equal(bestGroupFit(options, [organizer, guest], 5, () => null).best, undefined);
});

const now = Date.parse('2026-11-11T15:00:00Z');
const plan = { date: '2026-11-12', start: '08:30' };
const flattop = getTrail('flattop-mountain');
const group = [{ fitness: 3, experience: 3 }];
const fixtureStart = Date.parse('2026-11-12T14:00:00Z') / 1000;
function hourlyFixture(temperature, apparent, probability, code, gust, length = 24) {
  const series = value => Array(length).fill(value);
  return { time: Array.from({ length }, (_, i) => fixtureStart + i * 3600), temperature_2m: series(temperature),
    apparent_temperature: series(apparent), precipitation_probability: series(probability),
    weather_code: series(code), wind_gusts_10m: series(gust) };
}
const snapshot = { fetchedAt: now, samples: [
  { name: 'Trailhead', hourly: hourlyFixture(44, 42, 0, 1, 10) },
  { name: 'Upper Flattop', hourly: hourlyFixture(25, 16, 85, 71, 40) }
] };

test('date and time use the park zone and reject ambiguous and missing DST times', () => {
  assert.equal(startTimestamp(plan, 'America/Denver'), Date.parse('2026-11-12T15:30:00Z'));
  assert.equal(startTimestamp(plan, 'America/Los_Angeles'), Date.parse('2026-11-12T16:30:00Z'));
  assert.equal(startTimestamp({ date: '2026-11-01', start: '01:30' }, 'America/Denver'), null);
  assert.equal(startTimestamp({ date: '2026-03-08', start: '02:30' }, 'America/Denver'), null);
});

test('uses both location samples, expands the forecast window and explains higher time and score', () => {
  const live = forecastFor(flattop, group, plan, snapshot, null, now);
  assert.equal(live.status, 'ready');
  assert.equal(live.samples.length, 2);
  assert.equal(live.samples[0].tempMax, 44);
  assert.equal(live.samples[1].tempMax, 25);
  assert.equal(live.samples[1].hours[0].probability, null);
  assert.equal(live.weather.probabilityMax, 85);
  assert.equal(live.weather.gustMax, 40);
  assert.ok(live.weather.types.includes('Snow'));
  const [before, after] = [timeRange(flattop, group, null), timeRange(flattop, group, live.weather)];
  assert.ok(after.high > before.high);
  assert.equal(live.end - live.start, after.high * 60000);
  assert.ok(estimate(flattop, group, live.weather).score > estimate(flattop, group, null).score);
});

test('failure, stale cache, partial forecast and out-of-window coverage never enter the estimate', async () => {
  await assert.rejects(fetchForecast(flattop, async () => ({ ok: false })));
  await assert.rejects(fetchForecast(flattop, async () => response([{ hourly: {} }])));
  assert.equal(forecastFor(flattop, group, plan, null, 'failed', now).status, 'failed');
  const stale = forecastFor(flattop, group, plan, snapshot, null, now + forecastMaxAge);
  assert.equal(stale.status, 'stale');
  assert.equal(stale.weather, null);
  assert.equal(stale.samples.length, 2);
  assert.equal(forecastFor(flattop, group, plan, snapshot, 'failed', now).status, 'stale');
  assert.equal(forecastRequest(flattop, { ...plan, date: '2026-11-28' }, now).status, 'outside');
  assert.equal(forecastRequest(flattop, { ...plan, date: '2026-11-10' }, now).status, 'outside');
  const missing = structuredClone(snapshot);
  missing.samples[1].hourly.weather_code.fill(null);
  assert.equal(forecastFor(flattop, group, plan, missing, null, now).status, 'coverage');
  const tooShort = structuredClone(snapshot);
  tooShort.samples[1].hourly = hourlyFixture(25, 16, 85, 71, 40, 5);
  assert.equal(forecastFor(flattop, group, plan, tooShort, null, now).status, 'outside');
});

test('provider request includes both public points and cache round trips without personal fields', async () => {
  const cached = await fetchForecast(flattop, async raw => {
    const url = new URL(raw);
    assert.equal(url.origin, 'https://api.open-meteo.com');
    assert.equal(url.searchParams.get('latitude'), '40.3119986,40.3089462');
    assert.equal(url.searchParams.get('elevation'), '2888,3754');
    assert.equal(url.searchParams.get('timeformat'), 'unixtime');
    assert.deepEqual([...url.searchParams.keys()].sort(),
      ['latitude', 'longitude', 'elevation', 'hourly', 'temperature_unit', 'wind_speed_unit', 'timeformat', 'timezone', 'forecast_days'].sort());
    return response(snapshot.samples.map(({ hourly }) => ({ hourly })));
  });
  const store = memory();
  writeForecast(flattop, store, cached);
  assert.deepEqual(readForecast(flattop, store), cached);
  assert.equal(readForecast(getTrail('bear-lake'), store), null);
});

test('official park alert filter keeps active notices and rejects malformed provider responses', async () => {
  const alert = { title: 'Park road closure', description: 'Check the official park page.',
    category: 'Park Closure', is_active: 1, start_date: '', end_date: '' };
  assert.deepEqual(activeAlerts([{ ...alert, end_date: '2026-11-10' },
    { ...alert, start_date: '2026-11-13' }, { ...alert, is_active: 0 }, alert], 'romo', now), [alert]);
  const result = await fetchAlerts('romo', async url => {
    assert.equal(url, 'https://www.nps.gov/romo/park-alerts-romo.json');
    return response([alert]);
  });
  assert.equal(result.alerts[0].title, alert.title);
  await assert.rejects(fetchAlerts('romo', async () => response({ error: true })));
});
