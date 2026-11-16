import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFile } from 'node:fs/promises';
import { routeSummary } from '../dist/route-summary.js';
import { runInNewContext } from 'node:vm';

test('route overview distinguishes total itinerary, start, access and unknowns', () => {
  const html = routeSummary({ routeType: 'Out-and-back', miles: 2, trailheadName: 'River start', access: 'Seasonal shuttle', surface: 'Paved', crossings: 'None documented' });
  for (const text of ['2 mi total itinerary', 'Out-and-back', 'River start', 'Seasonal shuttle', 'Paved', 'None documented', 'not a live access or accessibility assessment']) assert.ok(html.includes(text), text);
  const unknown = routeSummary({ miles: 1 });
  for (const text of ['Route type unverified', 'Trailhead unverified', 'Access details unverified', 'Surface unverified', 'Crossings unverified']) assert.ok(unknown.includes(text));
  assert.ok(!routeSummary({ miles: 1, access: '<script>bad</script>' }).includes('<script>'));
});

test('packing shortcuts prevent route changes and open, scroll and focus their target', async () => {
  const source = await readFile(new URL('../dist/app.js', import.meta.url), 'utf8');
  const clickHandler = source.slice(source.indexOf("screen.addEventListener('click', event => {"), source.indexOf("screen.addEventListener('input', event => {"));
  for (const [id, tagName] of [['packing-checklist', 'SECTION'], ['packing-settings', 'DETAILS']]) {
    let handler;
    const calls = [];
    const section = { tagName, open: false, scrollIntoView: options => calls.push(['scroll', options.block]), focus: options => calls.push(['focus', options.preventScroll]) };
    runInNewContext(clickHandler, {
      screen: { addEventListener: (type, callback) => { handler = callback; } },
      document: { getElementById: target => { assert.equal(target, id); return section; } }
    });
    handler({ target: { closest: selector => selector === '[data-pack-jump]' ? { dataset: { packJump: id } } : null }, preventDefault: () => calls.push(['preventDefault']) });
    assert.deepEqual(calls, [['preventDefault'], ['scroll', 'start'], ['focus', true]]);
    assert.equal(section.open, tagName === 'DETAILS');
  }
});

test('route overview precedes map and secondary actions stay available in closed disclosure', async () => {
  const source = await readFile(new URL('../dist/app.js', import.meta.url), 'utf8');
  assert.ok(source.indexOf('${routeSummary(trail)}') < source.indexOf('<h2>Route map</h2>'));
  assert.match(source, /<details class="form-details" id="trail-save-actions"><summary>Save, skip or compare this hike<\/summary>\s*<div class="trail-actions detail-actions">\$\{compareButton\(trail\)\}\$\{preferenceButtons\(trail, state\)\}<\/div><\/details>/);
  for (const href of ['#packing/${trail.id}', '#group/${trail.id}', '#review/${trail.id}', '#map/${trail.id}']) assert.ok(source.includes(href));
  for (const caveat of ['not a safety assessment', 'Easy, short or paved does not mean accessible for everyone', 'Park-wide alerts do not certify this route is safe or open']) assert.ok(source.includes(caveat));
});
