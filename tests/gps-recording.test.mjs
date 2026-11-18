import assert from 'node:assert/strict';
import { test } from 'node:test';
import { GPSRecorder } from '../dist/gps-recorder.js';
import { gpsStorageKey, readRecordings, recordedDistance, recordingLimits } from '../dist/gps-store.js';
import { gpsPage } from '../dist/gps-page.js';

function fixture(entries = []) {
  const values = new Map(entries);
  let clock = 1000000, callback, failure, count = 0, blocked = false;
  const cleared = [];
  const storage = { getItem: key => values.get(key) ?? null, setItem: (key, value) => {
    if (blocked) throw Error('Simulated quota failure'); values.set(key, value);
  } };
  const geo = { simulation: true, watchPosition(ok, error, options) {
    assert.deepEqual(options, { enableHighAccuracy: true, maximumAge: 0, timeout: 15000 });
    callback = ok; failure = error; return ++count;
  }, clearWatch: id => cleared.push(id) };
  const args = { storage, geolocation: geo, now: () => clock, id: () => 'test-hike' };
  const recorder = new GPSRecorder(args);
  return { recorder, args, storage, values, cleared, get count() { return count; },
    advance: ms => { clock += ms; }, block: value => { blocked = value; },
    position: (lat = 40, lon = -105, accuracy = 10, timestamp = clock) => callback({ coords: { latitude: lat, longitude: lon, accuracy }, timestamp }),
    error: code => failure({ code }), staleCallback: () => callback };
}

test('consent, pause/resume/finish, late callback and private storage preserve every unrelated byte', () => {
  const entries = [['trail-gauge-v1', '{legacy bytes}'], ['trail-gauge-v2', '{custom bytes}'], ['unrelated', 'keep']];
  const f = fixture(entries), r = f.recorder;
  r.start(false); assert.equal(f.count, 0); assert.equal(f.values.has(gpsStorageKey), false);
  r.start(true); assert.equal(f.count, 1); assert.equal(r.data.active.source, 'simulation');
  f.position(); f.advance(10000); f.position(40.0001);
  assert.ok(recordedDistance(r.data.active.points) > 10);
  const stale = f.staleCallback(); r.pause(); assert.deepEqual(f.cleared, [1]);
  stale({ coords: { latitude: 41, longitude: -105, accuracy: 10 }, timestamp: 1010001 });
  assert.equal(r.data.active.points.length, 2);
  f.advance(10000); r.resume(); f.position(40.001);
  assert.equal(r.data.active.points.at(-1).breakBefore, true);
  assert.ok(recordedDistance(r.data.active.points) < 12);
  assert.equal(r.finish(), true); assert.equal(r.data.active, null);
  assert.equal(readRecordings(f.storage).hikes.length, 1);
  assert.match(gpsPage(r, 'my-hikes', 'test-hike'), /SIMULATED TEST — not a real hike/);
  for (const [key, bytes] of entries) assert.equal(f.values.get(key), bytes);
});

test('errors deny, unavailable and timeout pause durably with actionable status; unsupported geolocation does not watch', () => {
  for (const [code, message] of [[1, /permission denied/], [2, /unavailable/], [3, /timed out/], [99, /Location failed/]]) {
    const f = fixture(); f.recorder.start(true); f.error(code);
    assert.equal(f.recorder.data.active.status, 'paused'); assert.match(f.recorder.message, message);
    assert.equal(readRecordings(f.storage).active.status, 'paused'); assert.deepEqual(f.cleared, [1]);
  }
  const f = fixture(); const r = new GPSRecorder({ ...f.args, geolocation: null });
  r.start(true); assert.equal(r.data.active.status, 'paused'); assert.match(r.message, /Geolocation unavailable/);
  const throwing = new GPSRecorder({ ...f.args, geolocation: { watchPosition() { throw Error('simulated security error'); } } });
  throwing.resume(); assert.match(throwing.message, /could not start/);
});

test('quality rejects poor, stale, invalid, reordered and implausible fixes; gaps never bridge distance', () => {
  const f = fixture(), r = f.recorder; r.start(true); f.position();
  for (const [lat, lon, accuracy, timestamp] of [[40, -105, 101, 1000001], [91, -105, 10, 1000001],
    [40, NaN, 10, 1000001], [40, -105, -1, 1000001], [40, -105, 10, 999999], [40, -105, 10, 1006000]]) {
    f.position(lat, lon, accuracy, timestamp); assert.equal(r.data.active.points.length, 1);
  }
  f.advance(10000); f.position(40.0001); assert.equal(r.data.active.points.at(-1).breakBefore, true);
  f.advance(1000); f.position(41); assert.equal(r.data.active.points.length, 2); assert.match(r.message, /jump omitted/);
  f.advance(31000); r.checkFreshness(); assert.match(r.message, /GPS gap/);
  f.position(41); assert.equal(r.data.active.points.at(-1).breakBefore, true);
  assert.equal(recordedDistance(r.data.active.points), 0);
  f.advance(31000); f.position(41, -105, 10, 1041000); assert.match(r.message, /stale/);
});

test('reload recovers only paused, consent never silently restarts and limits pause without deletion', () => {
  const f = fixture(); f.recorder.start(true); f.position();
  const r = new GPSRecorder(f.args); assert.equal(f.count, 1);
  assert.equal(r.data.active.status, 'paused'); assert.match(r.message, /Recovered/);
  f.advance(recordingLimits.hours * 3600000); r.resume(); assert.equal(f.count, 1); assert.match(r.message, /Demo limit/);
  assert.equal(r.finish(), true);
  const pointLimit = fixture(); pointLimit.recorder.start(true);
  pointLimit.position(); const point = pointLimit.recorder.data.active.points[0];
  pointLimit.recorder.data.active.points = Array.from({ length: recordingLimits.points }, () => ({ ...point }));
  pointLimit.recorder.checkFreshness(); assert.equal(pointLimit.recorder.data.active.status, 'paused');
  const full = fixture(); full.recorder.data.hikes = Array.from({ length: recordingLimits.hikes }, () => r.data.hikes[0]);
  full.recorder.start(true); assert.equal(full.count, 0); assert.equal(full.recorder.data.hikes.length, recordingLimits.hikes);
});

test('quota or blocked reads never overwrite existing data; finish remains retryable; deletion failure retains hike', () => {
  const f = fixture(); f.recorder.start(true); f.position(); const saved = f.values.get(gpsStorageKey);
  f.block(true); f.advance(10000); f.position(40.0001);
  assert.equal(f.recorder.data.active.status, 'paused'); assert.equal(f.values.get(gpsStorageKey), saved);
  assert.equal(f.recorder.finish(), false); assert.equal(f.recorder.data.hikes.length, 0);
  assert.match(f.recorder.message, /could not be saved/);
  f.block(false); assert.equal(f.recorder.finish(), true); assert.equal(f.recorder.data.hikes[0].points.length, 2);
  f.block(true); assert.equal(f.recorder.deleteHike('test-hike'), false); assert.equal(f.recorder.data.hikes.length, 1);
  f.block(false); assert.equal(f.recorder.deleteHike('test-hike'), true); assert.equal(f.recorder.data.hikes.length, 0);
  const denied = new GPSRecorder({ ...f.args, storage: { getItem() { throw Error('Simulated blocked storage'); } } });
  assert.equal(denied.blocked, true); denied.start(true); assert.equal(denied.data.active, null);
  const initialFail = fixture(); initialFail.block(true); initialFail.recorder.start(true);
  assert.equal(initialFail.count, 0); assert.equal(initialFail.recorder.data.active.status, 'paused');
});

test('corrupt or future formats and cross-tab writes are never silently overwritten', () => {
  for (const raw of ['invalid JSON', '{"version":2}', '{"version":1,"active":null,"hikes":[{}]}']) {
    const f = fixture([[gpsStorageKey, raw]]); assert.equal(f.recorder.blocked, true);
    f.recorder.start(true); assert.equal(f.values.get(gpsStorageKey), raw);
  }
  const f = fixture(); f.recorder.start(true); const external = '{"other":"tab"}'; f.values.set(gpsStorageKey, external);
  f.position(); assert.equal(f.recorder.data.active.status, 'paused'); assert.equal(f.values.get(gpsStorageKey), external);
  assert.equal(f.recorder.finish(), false); assert.equal(f.values.get(gpsStorageKey), external);
});

test('details escape persisted text and expose gaps, source and limits', () => {
  const f = fixture(); f.recorder.start(true); f.position(); f.recorder.event('<img src=x>'); f.recorder.finish();
  const detail = gpsPage(f.recorder, 'my-hikes', 'test-hike');
  assert.ok(detail.includes('&lt;img src=x&gt;')); assert.ok(!detail.includes('<img src=x>'));
  assert.match(detail, /segment start \/ gap/); assert.match(detail, /not moving time/);
  const track = gpsPage(f.recorder, 'track'); assert.match(track, /7,200/); assert.match(track, /No location permission/);
});
