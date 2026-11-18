import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';
import { browserSession } from './browser-session.mjs';

// All coordinates and failures in this harness are explicitly simulated.
const adapter = mode => `{
  const gps = window.__gps = { now: Date.now(), calls: 0, cleared: [], failWrite: false };
  Date.now = () => gps.now;
  gps.advance = ms => gps.now += ms;
  const mock = { simulation: true,
    watchPosition(ok, error) { gps.ok = ok; gps.error = error; return ++gps.calls; },
    clearWatch(id) { gps.cleared.push(id); }
  };
  gps.fix = (lat=40, lon=-105, accuracy=10, age=0) => gps.ok({coords:{latitude:lat,longitude:lon,accuracy},timestamp:gps.now-age});
  Object.defineProperty(navigator, 'geolocation', {value: ${mode === 'unavailable' ? 'null' : 'mock'}, configurable: true});
  const originalSet = Storage.prototype.setItem;
  Storage.prototype.setItem = function(key,value) {
    if (gps.failWrite && key === 'trail-gauge-recordings-v1') throw new DOMException('Simulated quota exceeded','QuotaExceededError');
    return originalSet.call(this,key,value);
  };
  ${mode === 'blocked' ? "Object.defineProperty(window,'localStorage',{get(){throw new DOMException('Simulated blocked storage','SecurityError')}});" : ''}
}`;

await browserSession(async ({ c, evaluate, wait, goto, shot, events, scratch, origin }) => {
  await c('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
  let injected;
  const install = async mode => {
    if (injected) await c('Page.removeScriptToEvaluateOnNewDocument', { identifier: injected });
    injected = (await c('Page.addScriptToEvaluateOnNewDocument', { source: adapter(mode) })).identifier;
  };
  await install('mock');
  await c('Page.navigate', { url: origin + '/#track' });
  await wait("!!document.querySelector('#gps-consent')");
  const v1 = JSON.stringify({ people: [{ id: 'old-person', name: 'Legacy hiker', kind: 'self' }],
    history: [{ trailId: 'old-trail', note: 'Private older hike' }], custom: { untouched: 'legacy custom bytes' } }, null, 2);
  const v2 = JSON.stringify({ people: [], memberIds: [], groupName: 'Private group',
    history: [{ trailId: 'bear-lake', note: 'Private review' }], reviews: {}, favorites: ['bear-lake'],
    packing: { custom: { entries: [{ id: 'bottle', packed: true, name: 'Custom bottle' }] } },
    customState: { value: 'Preserve exact bytes' } }, null, 2);
  await evaluate(`localStorage.setItem('trail-gauge-v1',${JSON.stringify(v1)});localStorage.setItem('trail-gauge-v2',${JSON.stringify(v2)})`);
  const reload = async selector => { await c('Page.reload'); await wait(`!!document.querySelector(${JSON.stringify(selector)})`); };
  await reload('#gps-consent');
  const status = () => evaluate("document.querySelector('#gps-status').innerText");
  const click = action => evaluate(`document.querySelector('[data-gps="${action}"]').click()`);
  const consentStart = async () => { await evaluate("document.querySelector('#gps-consent').checked=true"); await click('start'); };
  const data = () => evaluate("JSON.parse(localStorage.getItem('trail-gauge-recordings-v1'))");
  const legacyUnchanged = async () => {
    assert.equal(await evaluate("localStorage.getItem('trail-gauge-v1')"), v1);
    assert.equal(await evaluate("localStorage.getItem('trail-gauge-v2')"), v2);
  };
  const fresh = async mode => {
    await evaluate("localStorage.removeItem('trail-gauge-recordings-v1');location.hash='#track'");
    await install(mode); await reload('#gps-consent');
  };

  await click('start'); assert.match(await status(), /consent box/);
  assert.equal(await evaluate('__gps.calls'), 0);
  assert.equal(await evaluate("localStorage.getItem('trail-gauge-recordings-v1')"), null);
  await consentStart(); assert.equal(await evaluate('__gps.calls'), 1);
  await evaluate('__gps.fix();__gps.advance(10000);__gps.fix(40.0001)');
  assert.equal((await data()).active.points.length, 2);
  assert.match(await evaluate("document.querySelector('#gps-current').innerText"), /SIMULATED TEST/);
  await shot('simulated-mobile-track');
  assert.ok(await evaluate('document.documentElement.scrollWidth<=innerWidth'), 'mobile Track fits');

  await evaluate('__gps.advance(1000);__gps.fix(40.0002,-105,300)');
  assert.match(await status(), /Low-quality/); assert.equal((await data()).active.points.length, 2);
  await evaluate('__gps.advance(31000);__gps.fix(40.0003)');
  assert.equal((await data()).active.points.at(-1).breakBefore, true);
  assert.ok((await data()).active.events.some(event => event.text.includes('GPS gap')));
  await click('pause'); assert.equal((await data()).active.status, 'paused');
  assert.ok((await evaluate('__gps.cleared')).length > 0);
  await click('resume'); await evaluate('__gps.advance(10000);__gps.fix(40.0004)');
  assert.equal((await data()).active.points.at(-1).breakBefore, true);
  // Synthetic visibility and pagehide events test app lifecycle handlers; not real phone lock behavior.
  await evaluate("Object.defineProperty(document,'visibilityState',{value:'hidden',configurable:true});document.dispatchEvent(new Event('visibilitychange'))");
  assert.equal((await data()).active.status, 'paused'); assert.match(await status(), /hidden/);
  await evaluate("Object.defineProperty(document,'visibilityState',{value:'visible',configurable:true})");
  await click('resume'); await evaluate("window.dispatchEvent(new Event('pagehide'))");
  assert.equal((await data()).active.status, 'paused');
  await click('resume'); await reload('[data-gps="resume"]');
  assert.equal(await evaluate('__gps.calls'), 0); assert.equal((await data()).active.status, 'paused');
  assert.match(await status(), /Recovered paused/);
  await click('resume'); await click('finish'); await wait("document.querySelector('#screen').dataset.page==='my-hikes'");
  let saved = await data(); assert.equal(saved.active, null); assert.equal(saved.hikes.length, 1);
  const id = saved.hikes[0].id;
  await goto('#my-hikes/' + id, '[data-gps-delete]');
  assert.match(await evaluate("document.querySelector('#screen').innerText"), /SIMULATED TEST — not a real hike/);
  await evaluate("document.querySelector('.gps-page details').open=true");
  assert.match(await evaluate("document.querySelector('#screen').innerText"), /segment start \/ gap/);
  await shot('simulated-mobile-completed'); await legacyUnchanged();
  await reload('[data-gps-delete]'); assert.equal((await data()).hikes.length, 1);
  const deleteRequest = () => evaluate("document.querySelector('[data-gps-delete]').click()");
  const cancelDelete = deleteRequest();
  // CDP dialog commands resolve the pending evaluated click.
  await c('Page.handleJavaScriptDialog', { accept: false }); await cancelDelete;
  assert.equal((await data()).hikes.length, 1);
  const acceptDelete = deleteRequest(); await c('Page.handleJavaScriptDialog', { accept: true }); await acceptDelete;
  await wait("document.querySelector('#screen').dataset.page==='my-hikes' && !document.querySelector('[data-gps-delete]')");
  assert.equal((await data()).hikes.length, 0); await legacyUnchanged();

  for (const [code, text] of [[1, /permission denied/], [2, /Location unavailable/], [3, /timed out/]]) {
    await fresh('mock'); await consentStart(); await evaluate(`__gps.error({code:${code}})`);
    assert.match(await status(), text); assert.equal((await data()).active.status, 'paused');
    await legacyUnchanged();
  }
  await fresh('unavailable'); await consentStart(); assert.match(await status(), /Geolocation unavailable/);
  await fresh('mock'); await consentStart(); await evaluate('__gps.fix()');
  const beforeQuota = await evaluate("localStorage.getItem('trail-gauge-recordings-v1')");
  await evaluate('__gps.failWrite=true;__gps.advance(10000);__gps.fix(40.0001)');
  assert.match(await status(), /could not be saved/);
  assert.equal(await evaluate("localStorage.getItem('trail-gauge-recordings-v1')"), beforeQuota);
  await click('finish'); assert.match(await status(), /could not be saved/);
  await evaluate('__gps.failWrite=false'); await click('finish');
  await wait("document.querySelector('#screen').dataset.page==='my-hikes'");
  saved = await data(); assert.equal(saved.hikes[0].points.length, 2); await legacyUnchanged();
  await fresh('mock'); await evaluate('__gps.failWrite=true'); await consentStart();
  assert.equal(await evaluate('__gps.calls'), 0); assert.match(await status(), /could not be saved/);

  await fresh('blocked'); assert.match(await status(), /storage unavailable or unreadable/);
  assert.equal(await evaluate("document.querySelector('[data-gps=start]').disabled"), true);
  assert.equal(await evaluate('__gps.calls'), 0);
  await install('mock'); await reload('#gps-consent'); await legacyUnchanged();
  await evaluate("localStorage.setItem('trail-gauge-recordings-v1','{corrupt recording bytes')");
  await reload('#gps-consent'); assert.match(await status(), /unreadable/);
  assert.equal(await evaluate("localStorage.getItem('trail-gauge-recordings-v1')"), '{corrupt recording bytes');

  // v1-only migration retains original bytes and custom/history, instead of deleting the old key.
  await evaluate("localStorage.removeItem('trail-gauge-v2');localStorage.removeItem('trail-gauge-recordings-v1')");
  await reload('#gps-consent');
  assert.equal(await evaluate("localStorage.getItem('trail-gauge-v1')"), v1);
  const migrated = await evaluate("JSON.parse(localStorage.getItem('trail-gauge-v2'))");
  assert.equal(migrated.history[0].note, 'Private older hike');
  assert.equal(migrated.custom.untouched, 'legacy custom bytes');
  await consentStart(); await click('finish');
  assert.equal(await evaluate("localStorage.getItem('trail-gauge-v1')"), v1);

  // No location-bearing external network request is made during these recording-only flows.
  const requests = events.filter(event => event.method === 'Network.requestWillBeSent').map(event => event.params.request.url);
  assert.deepEqual(requests.filter(url => !url.startsWith(origin) && !url.startsWith('data:')), []);
  const unexpected = events.filter(event => event.method === 'Runtime.exceptionThrown');
  assert.deepEqual(unexpected, []);
  await writeFile(scratch + '/gps-browser-evidence.json', JSON.stringify({
    source: 'SIMULATED browser adapter only; not real GPS, Safari, iPhone, phone lock, or secure phone-route confirmation',
    checks: ['explicit consent', 'start/pause/resume/finish', 'accuracy/jumps/gaps', 'synthetic hidden/pagehide',
      'reload paused recovery', 'private completion/details/delete confirmation', 'denied/unavailable/timeout',
      'quota retry', 'blocked read', 'corrupt storage untouched', 'legacy v1/v2 exact bytes', 'v1-only retained migration', 'no uploads'],
    requests, legacyPreserved: true, completed: true
  }, null, 2));
  console.log('PASS: simulated GPS browser flows; legacy bytes preserved; no external requests. No real-device claim.');
}, 'gps-browser');
