import { readFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { hasGeometry, loadCatalog } from '../dist/catalog.js';
import { estimate } from '../dist/model.js';
import { bestGroupFit, timeRange } from '../dist/planning.js';
import { activeAlerts, fetchAlerts, fetchForecast, forecastFor,
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

test('catalog identifies park, source, actual trailhead and complete route for all verified hikes while retaining the original seven', () => {
  assert.ok(['riverside-walk', 'bear-lake', 'flattop-mountain', 'hall-of-mosses',
    'lower-yosemite-fall', 'limberlost', 'desert-discovery'].every(id => trails.some(trail => trail.id === id)));
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
  assert.equal(store.getItem(legacyStorageKey), JSON.stringify(seeded));
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
const snapshot = { fetchedAt: now, samples: [{ name: 'Old Open-Meteo cache' }] };

test('date and time use the park zone and reject ambiguous and missing DST times', () => {
  assert.equal(startTimestamp(plan, 'America/Denver'), Date.parse('2026-11-12T15:30:00Z'));
  assert.equal(startTimestamp(plan, 'America/Los_Angeles'), Date.parse('2026-11-12T16:30:00Z'));
  assert.equal(startTimestamp({ date: '2026-11-01', start: '01:30' }, 'America/Denver'), null);
  assert.equal(startTimestamp({ date: '2026-03-08', start: '02:30' }, 'America/Denver'), null);
});

test('NWS integration ignores old-provider snapshots and never treats missing weather as zero risk', () => {
  for (const cached of [snapshot, null]) {
    const result = forecastFor(flattop, group, plan, cached, null, now);
    assert.equal(result.status, 'missing');
    assert.equal(result.weather, null);
    assert.deepEqual(timeRange(flattop, group, result.weather), timeRange(flattop, group, null));
    assert.deepEqual(estimate(flattop, group, result.weather), estimate(flattop, group, null));
    for (const index of [2, 6, 7]) assert.equal(estimate(flattop, group, result.weather).factors[index], null);
  }
  assert.equal(forecastRequest(flattop, plan, now).status, 'eligible');
  assert.equal(forecastRequest(flattop, { ...plan, date: '2026-11-28' }, now).status, 'eligible'); // actual provider horizon decides
  assert.equal(forecastRequest(flattop, { ...plan, date: '2026-11-10' }, now, true).status, 'invalid-time');
  assert.equal(forecastRequest(flattop, null, now).mode, 'current');
  assert.equal(forecastFor(flattop, group, plan, null, 'failed', now).status, 'failed');
});

test('NWS provider fails closed when hourly URL is absent', async () => {
  let calls = 0;
  await assert.rejects(fetchForecast(flattop, async () => { calls++; return response({}); }), /hourly forecast link is missing/);
  assert.equal(calls, 1);
});

test('versioned NWS forecast cache does not read or rewrite legacy weather', () => {
  const store = {
    getItem(key) { assert.match(key, /^trail-gauge-nws-hourly-v1-/); return JSON.stringify(snapshot); },
    setItem() { assert.fail('must not write old-provider weather'); },
    removeItem() { assert.fail('must not delete legacy data'); }
  };
  assert.equal(readForecast(flattop, store), null);
  writeForecast(flattop, store, snapshot);
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
