import assert from 'node:assert/strict';
import { test } from 'node:test';
import { pendingSuggestions, decideSuggestion, suggestionKey } from '../dist/packing-decisions.js';

const map = { category: 'gear', name: 'Map', amount: '1', reason: 'Navigation' };
const light = { category: 'gear', name: 'Light', amount: '1' };

test('suggestions are explicit, exclude saved items and preserve custom packed state', () => {
  const saved = { id: 'custom', category: 'gear', name: 'My bottle', amount: '2', packed: true };
  const plan = { entries: [saved], waterEdits: { me: { low: 2 } }, reminder: { interval: 20, next: 123 } };
  assert.deepEqual(pendingSuggestions(plan, [map, light]), [map, light]);
  assert.deepEqual(plan.entries, [saved]);
  const added = decideSuggestion(plan, [map, light], suggestionKey(map), 'add', () => 'new');
  assert.equal(added.entries[0], saved);
  assert.deepEqual(added.entries[1], { ...map, id: 'new', packed: false });
  assert.equal(added.reminder, plan.reminder);
  assert.equal(added.waterEdits, plan.waterEdits);
  const dismissed = decideSuggestion(added, [map, light], suggestionKey(light), 'dismiss', () => assert.fail('dismiss must not add'));
  assert.equal(dismissed.entries, added.entries);
  const reloaded = JSON.parse(JSON.stringify(dismissed));
  assert.deepEqual(pendingSuggestions(reloaded, [map, light]), []);
  reloaded.entries[1].name = 'My edited map';
  assert.deepEqual(pendingSuggestions(reloaded, [map, light]), [], 'editing accepted item must not reoffer it');
  assert.equal(decideSuggestion(dismissed, [map, light], suggestionKey(map), 'add', () => assert.fail('duplicate')), dismissed);
  assert.deepEqual(plan.entries, [saved], 'original never mutated');
});

test('legacy saved suggestions are matched without overwriting amounts or packing', () => {
  const plan = { entries: [{ ...map, name: ' MAP ', amount: 'custom', packed: true }] };
  assert.deepEqual(pendingSuggestions(plan, [map, light]), [light]);
  assert.equal(decideSuggestion(plan, [map], 'unknown', 'add', () => assert.fail()), plan);
  assert.equal(decideSuggestion(plan, [light], suggestionKey(light), 'invalid', () => assert.fail()), plan);
  assert.deepEqual(pendingSuggestions({}, []), []);
});
