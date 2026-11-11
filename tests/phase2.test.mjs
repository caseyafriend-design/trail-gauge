import assert from 'node:assert/strict';
import { test } from 'node:test';
import { bestGroupFit, timeRange } from '../dist/planning.js';
import { altitudeNotes, comparableHikes } from '../dist/personalization.js';
import { defaultTrip, packingSuggestions, tripKey } from '../dist/packing.js';
import { readPlanningProfile } from '../dist/profile-planning.js';
import { reviewRecord } from '../dist/reviews.js';
import { nearbyTrails } from '../dist/us-trails.js';

const hiker = { id: 'you', name: 'Test hiker', fitness: 2, experience: 2 };
const trail = { id: 'trail', miles: 3, gain: 500, surface: 'Gravel', typicalGrade: 7, unevenFooting: true };
const now = Date.parse('2026-11-11T17:00:00Z');
const log = { hikerId: 'you', id: 'completed', title: 'Comparable test hike', date: '2026-11-05',
  distance: 3.2, gain: 530, moving: 140, minutes: 195, calibrate: true, packWeight: 12 };
const weather = { apparentMin: 72, apparentMax: 92, gustMax: 12, probabilityMax: 0, types: [] };

test('quick setup and old guests can estimate without optional planning details', () => {
  const fields = readPlanningProfile(new FormData());
  assert.equal(fields.recent, null);
  assert.equal(fields.distance, null);
  assert.equal(fields.food.carbs, null);
  assert.equal(fields.water.capacity, null);
  const baseline = timeRange(trail, [hiker], null);
  assert.equal(baseline.uncertain, true);
  assert.equal(baseline.movingHigh, baseline.high);
  assert.ok(timeRange(trail, [hiker, { ...hiker, id: 'guest', fitness: 1 }], null).high > baseline.high);
});

test('firm terrain limits disqualify a route while altitude stays separate', () => {
  const guest = { ...hiker, id: 'guest', name: 'Guest', planning: { avoid: ['footing'], maxMiles: 2 } };
  const higher = { ...trail, trailheadElevation: 9600 };
  const group = [hiker, guest];
  const other = { ...trail, id: 'other', miles: 1.2, gain: 80, unevenFooting: false };
  const { best } = bestGroupFit([higher, other], group, 400, () => null);
  assert.equal(best.trail.id, 'other');
  assert.equal(bestGroupFit([higher], group, 400, () => null).best, undefined);
  assert.equal(timeRange(trail, group, null).high, timeRange(higher, group, null).high);
  assert.match(altitudeNotes(higher, group).text, /no recent altitude experience/);
});

test('recent comparable moving time changes the next estimate and can be excluded', () => {
  const trip = { ...defaultTrip, packWeight: 12, breaks: 20, nights: 1, nightHours: 8 };
  const context = { now, trip, history: [log] };
  const baseline = timeRange(trail, [hiker], null, { ...context, history: [] });
  const learned = timeRange(trail, [hiker], null, context);
  assert.ok(learned.movingHigh > baseline.movingHigh);
  assert.equal(learned.high - learned.movingHigh, 500);
  assert.equal(learned.paces[0].outings[0].id, log.id);
  assert.equal(timeRange(trail, [hiker], null, { ...context, history: [{ ...log, calibrate: false }] }).high, baseline.high);
  assert.deepEqual(comparableHikes(trail, hiker, [{ ...log, moving: null }], trip, now), []);
});

test('hot weather without verified refills widens water use and flags a carry shortfall', () => {
  const person = { ...hiker, planning: { water: { used: 1.2, hours: 4, conditions: 'cool', effort: 'easy', capacity: 1 } } };
  const long = { ...trail, miles: 8, gain: 2000 };
  const trip = { ...defaultTrip, refill: 'unverified' };
  const time = timeRange(long, [person], weather, { trip });
  const [water] = packingSuggestions(long, [person], time, weather, trip, '09:00').water;
  assert.equal(water.mismatch, true);
  assert.equal(water.refillConfirmed, false);
  assert.equal(water.startingHigh, Math.round((water.high + water.reserve) * 10) / 10);
  assert.equal(water.exceedsCapacity, true);
  const confirmed = { ...trip, refill: 'confirmed', firstRefill: 60, longestGap: 120 };
  const [refill] = packingSuggestions(long, [person], time, weather, confirmed, '09:00').water;
  assert.equal(refill.refillConfirmed, true);
  assert.equal(refill.high, water.high);
  assert.ok(refill.startingHigh < water.startingHigh);
});

test('food exclusions omit unverified foods and verified label data gives servings and carbs', () => {
  const food = { allergens: 'Peanuts', snack: 'Example snack', serving: '1 bar', carbs: 20, meal: 'Example meal', mealCook: true, cook: 'no' };
  const person = { ...hiker, planning: { food } };
  const trip = { ...defaultTrip, nights: 1 };
  const time = timeRange(trail, [person], null, { trip });
  const blocked = packingSuggestions(trail, [person], time, null, trip, '09:00');
  assert.ok(blocked.entries.every(item => !item.name.includes('Example snack') && !item.name.includes('Example meal')));
  const checked = { ...person, planning: { food: { ...food, ingredients: true, mealIngredients: true } } };
  const plan = packingSuggestions(trail, [checked], time, null, trip, '09:00');
  assert.ok(plan.entries.some(item => item.name.includes('Example snack')));
  assert.ok(plan.entries.some(item => item.name.includes('Overnight dinner')));
  assert.ok(plan.entries.some(item => item.name.includes('Reserve food')));
  assert.ok(plan.entries.every(item => !item.name.includes('Example meal')));
  assert.equal(plan.food[0].carbs, plan.food[0].portions * 20);
  assert.equal(tripKey(trail, [checked, { ...hiker, id: 'other' }]), tripKey(trail, [{ ...hiker, id: 'other' }, checked]));
});

test('review stores elapsed and moving times and labels a dated carrier observation', () => {
  const data = new FormData();
  for (const [key, value] of Object.entries({ date: '2026-11-08', minutes: '160', moving: '120', reception: 'spotty',
    carrier: 'Test carrier', receptionNote: 'At the trailhead', waterRefilled: '0', surface: 'Muddy', calibrate: 'yes' })) {
    data.set(key, value);
  }
  const review = reviewRecord(data);
  assert.deepEqual(review.reception, { status: 'spotty', carrier: 'Test carrier', date: '2026-11-08', note: 'At the trailhead' });
  assert.equal(review.minutes, 160);
  assert.equal(review.moving, 120);
  assert.equal(review.waterRefilled, 0);
  assert.equal(review.calibrate, true);
});

test('nearby search sends rounded coordinates with no private profile fields', async () => {
  await nearbyTrails({ latitude: 37.28521, longitude: -112.94769, name: 'Private name', diet: 'Private restriction' },
    undefined, async (url, request) => {
      assert.equal(new URL(url).hostname, 'carto.nationalmap.gov');
      assert.equal(request.body.get('geometry'), '-112.95,37.29');
      assert.doesNotMatch(request.body.toString(), /Private|diet|name%3DPrivate/);
      return { ok: true, json: async () => ({ features: [] }) };
    });
});
