import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';
import { weatherFixtures } from './browser-weather-fixtures.mjs';

export async function weatherChecks({ c, evaluate, wait, goto, shot, events, scratch }) {
  const trails = await evaluate("import('./catalog.js').then(m=>m.loadCatalog())");
  const parks = await evaluate("import('./catalog.js').then(m=>m.parks)");
  await evaluate(`(()=>{const s=JSON.parse(localStorage.getItem('trail-gauge-v2'));s.hikePlan=null;localStorage.setItem('trail-gauge-v2',JSON.stringify(s));Object.keys(localStorage).filter(k=>k.startsWith('trail-gauge-nws-')).forEach(k=>localStorage.removeItem(k));})()`);
  await c('Page.reload'); await wait("!!document.querySelector('#screen h1')");
  const live = [];
  for (const trail of trails) {
    trail.timeZone = parks[trail.parkCode].timeZone;
    await goto('#trail/' + trail.id, '#weather-form');
    await wait(`document.querySelector('#screen h1')?.textContent===${JSON.stringify(trail.name)}`);

    await wait("!!document.querySelector('.forecast-metrics') || document.querySelector('#forecast-status').innerText.includes('Try again later')");
    const text = await evaluate("document.querySelector('#forecast-status').innerText");
    const snapshot = await evaluate(`JSON.parse(localStorage.getItem(${JSON.stringify('trail-gauge-nws-hourly-v1-' + trail.id)}))`);
    live.push({ id: trail.id, text, snapshot });
    assert.equal(snapshot.point, `https://api.weather.gov/points/${trail.trailhead[1].toFixed(4)},${trail.trailhead[0].toFixed(4)}`);
    assert.ok(snapshot.periods.some(p=>p.start<=snapshot.fetchedAt && snapshot.fetchedAt<p.end));
    assert.equal(await evaluate("JSON.parse(localStorage.getItem('trail-gauge-v2')).hikePlan"),null);
    assert.match(await evaluate("document.querySelector('.dial-factors').innerText"), /Heat \/ feels-like\s+Unknown/);
    await writeFile(scratch + '/nws-app-live.json', JSON.stringify(live, null, 2));
    assert.match(text, /CURRENT-HOUR FORECAST/, trail.id);
    assert.match(text, /not feels-like/);
    assert.ok(await evaluate("document.documentElement.scrollWidth<=innerWidth"), trail.id + ' forecast overflow');
  }
  assert.equal(live.length,8);
  await shot('mobile-live-forecast');
  await c('Emulation.setDeviceMetricsOverride',{width:1280,height:900,deviceScaleFactor:1,mobile:false});
  assert.ok(await evaluate("document.documentElement.scrollWidth<=innerWidth"),'desktop forecast overflow');
  await shot('desktop-live-forecast');
  await c('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true});
  const requests = events.filter(e => e.method === 'Network.requestWillBeSent' && e.params.request.url.includes('api.weather.gov'));
  const ids = new Set(requests.map(e => e.params.requestId));
  const extra = events.filter(e => e.method === 'Network.requestWillBeSentExtraInfo' && ids.has(e.params.requestId));
  await writeFile(scratch + '/nws-app-wire.json', JSON.stringify({ requests, extra }, null, 2));
  assert.ok(extra.some(e => /Chrome/.test(e.params.headers['User-Agent'] ?? e.params.headers['user-agent'] ?? '')), 'actual browser UA wire evidence');
  console.log('PASS actual app all8 automatic current-hour NWS forecasts and coordinate chains, browser default UA wire evidence');

  await weatherFixtures({ c, evaluate, wait, shot, events, scratch });
}
