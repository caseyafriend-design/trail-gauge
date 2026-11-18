import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';

// Isolated deterministic source/clock fixtures, not live-weather evidence.
export async function weatherFixtures({ c, evaluate, wait, shot, events, scratch }) {
  await c('Emulation.setTimezoneOverride', { timezoneId: 'Asia/Tokyo' });
  const { identifier } = await c('Page.addScriptToEvaluateOnNewDocument', { source: `
    window.__clock=Date.parse('2026-11-16T12:30:00Z');Date.now=()=>window.__clock;
    window.__nwsMode='normal';window.__nwsCalls=[];window.__timers=new Map();let timerId=100000;
    const nativeTimeout=window.setTimeout.bind(window),nativeClear=window.clearTimeout.bind(window);
    window.setTimeout=(fn,delay,...args)=>{if(delay>=60000){const id=++timerId;__timers.set(id,{at:Date.now()+delay,fn:()=>fn(...args)});return id;}return nativeTimeout(fn,delay,...args);};
    window.clearTimeout=id=>{__timers.delete(id);nativeClear(id);};
    window.__advance=delta=>{__clock+=delta;const due=[...__timers].filter(([,t])=>t.at<=__clock);due.forEach(([id,t])=>{__timers.delete(id);t.fn();});};
    const nativeFetch=window.fetch.bind(window);
    window.fetch=async(input,options)=>{
      const url=String(input);if(!url.startsWith('https://api.weather.gov/'))return nativeFetch(input,options);
      __nwsCalls.push({url,at:Date.now(),mode:__nwsMode});
      if(__nwsMode==='offline')throw new TypeError('Fixture offline');
      if(__nwsMode==='timeout')throw new DOMException('Fixture timed out','TimeoutError');
      if(__nwsMode==='429')return new Response('{}',{status:429,headers:{'Retry-After':'120'}});
      if(url.includes('/points/'))return new Response(JSON.stringify({properties:{forecastHourly:'https://api.weather.gov/gridpoints/SLC/43,24/forecast/hourly'}}),{headers:{'Cache-Control':'max-age=600'}});
      const base=Math.floor(Date.now()/3600000)*3600000;
      const properties={updateTime:new Date(Date.now()-(__nwsMode==='stale'?12:0)*3600000).toISOString(),generatedAt:new Date(Date.now()).toISOString(),validTimes:new Date(base).toISOString()+'/P3D',periods:Array.from({length:__nwsMode==='horizon'?1:48},(_,i)=>({startTime:new Date(base+i*3600000).toISOString(),endTime:new Date(base+(i+1)*3600000).toISOString(),temperature:__nwsMode==='missing'?null:52,temperatureUnit:'F',probabilityOfPrecipitation:{unitCode:'wmoUnit:percent',value:null},windSpeed:null,windDirection:null,shortForecast:'Fixture sky'}))};
      return new Response(JSON.stringify({properties}),{headers:{'Cache-Control':'max-age=600'}});
    };` });
  const key = 'trail-gauge-nws-hourly-v1-riverside-walk';
  await evaluate(`(()=>{const s=JSON.parse(localStorage.getItem('trail-gauge-v2'));s.hikePlan={date:'2026-11-15',start:'05:30'};localStorage.setItem('trail-gauge-v2',JSON.stringify(s));localStorage.removeItem(${JSON.stringify(key)});})()`);
  await c('Page.navigate', { url: await evaluate("location.origin+'/?weather-fixture=1#trail/riverside-walk'") });
  await wait("window.__nwsMode==='normal' && !!document.querySelector('#weather-form') && !!document.querySelector('.forecast-metrics')");
  const submit = (date, start) => evaluate(`document.querySelector('#weather-form [name=date]').value=${JSON.stringify(date)};document.querySelector('#weather-form [name=start]').value=${JSON.stringify(start)};document.querySelector('#weather-form').requestSubmit()`);
  const feedback = () => evaluate("document.querySelector('[data-plan-status]').innerText");
  const ready = () => wait("!!document.querySelector('.forecast-metrics') && !document.querySelector('[data-plan-status]').innerText.includes('Checking')");
  const reset = async () => {
    await evaluate("document.querySelector('#weather-form [value=now]').click()");
    await ready();
    assert.match(await evaluate("document.querySelector('#forecast-status').innerText"), /CURRENT-HOUR FORECAST/);
  };
  assert.match(await evaluate("document.querySelector('#forecast-status').innerText"), /saved plan is unchanged/);
  assert.deepEqual(await evaluate("JSON.parse(localStorage.getItem('trail-gauge-v2')).hikePlan"), { date: '2026-11-15', start: '05:30' });
  await c('Page.reload'); await ready();
  assert.equal(await evaluate('__nwsCalls.length'), 0, 'fresh cache reused on reload');
  await submit('2026-11-16', ''); assert.match(await feedback(), /Enter both/);
  // 08:30 is 15:30Z in Zion, despite the browser being in Tokyo.
  await submit('2026-11-16', '08:30'); await ready();
  assert.equal(await feedback(), '');
  assert.match(await evaluate("document.querySelector('#forecast-status').innerText"), /PLANNED OUTING FORECAST/);
  assert.match(await evaluate("document.querySelector('#forecast-status').innerText"), /MST/);
  const saved = await evaluate("localStorage.getItem('trail-gauge-v2')");
  for (const [date, start] of [['2026-11-16','05:29'], ['2027-03-14','02:30'], ['2027-11-07','01:30']]) {
    await submit(date, start); assert.match(await feedback(), /future, unambiguous/);
    assert.equal(await evaluate("localStorage.getItem('trail-gauge-v2')"), saved);
  }
  for (const date of ['2026-12-07', '2026-12-16']) {
    await submit(date, '08:30');
    await wait("document.querySelector('[data-plan-status]').innerText.includes('full estimated outing must fit')");
    assert.equal(await evaluate("localStorage.getItem('trail-gauge-v2')"), saved);
  }
  await reset();
  assert.equal(await evaluate("JSON.parse(localStorage.getItem('trail-gauge-v2')).hikePlan"), null);
  assert.equal(await evaluate("document.querySelector('#weather-form [name=date]').value"), '');
  const count = await evaluate('__nwsCalls.length');
  await evaluate('__advance(600001)');
  await wait(`__nwsCalls.length===${count + 2} && !!document.querySelector('.forecast-metrics')`);
  assert.equal(await evaluate('__nwsCalls.length'), count + 2, 'expiry makes one point/hourly chain');
  await evaluate("window.dispatchEvent(new Event('focus'));window.dispatchEvent(new Event('focus'))");
  assert.equal(await evaluate('__nwsCalls.length'), count + 2, 'fresh focus does not fetch');
  // Simulate suspended timer delivery in a background tab, then focus it twice.
  await evaluate('__clock+=600001;window.dispatchEvent(new Event("focus"));window.dispatchEvent(new Event("focus"))');
  await wait(`__nwsCalls.length===${count + 4} && !!document.querySelector('.forecast-metrics')`);
  assert.equal(await evaluate('__nwsCalls.length'), count + 4, 'expired focus deduplicates');
  for (const mode of ['missing', 'horizon', 'stale']) {
    await evaluate(`__nwsMode=${JSON.stringify(mode)}`); await submit('2026-11-16', '08:30');
    await wait("!document.querySelector('[data-plan-status]').innerText.includes('Checking')");
    if (mode === 'missing') {
      assert.equal(await feedback(), '');
      assert.match(await evaluate("document.querySelector('#forecast-status').innerText"), /Air temperature\nUnknown/);
    } else {
      assert.match(await feedback(), mode === 'horizon' ? /full estimated outing must fit/ : /current forecast could not verify/);
      assert.equal(await evaluate("!!document.querySelector('.forecast-metrics')"), false);
    }
  }
  for (const mode of ['offline', 'timeout', '429']) {
    await evaluate(`__nwsMode=${JSON.stringify(mode)};__clock+=120001`); await submit('2026-11-16', '08:30');
    await wait("document.querySelector('#forecast-status').innerText.includes('Try again later')");
    const calls = await evaluate('__nwsCalls.length');
    await submit('2026-11-16', '08:30'); await evaluate("window.dispatchEvent(new Event('focus'))");
    assert.equal(await evaluate('__nwsCalls.length'), calls, mode + ' backoff');
    assert.equal(await evaluate("!!document.querySelector('.forecast-metrics')"), false);
    await evaluate("__nwsMode='normal';__clock+=120001"); await submit('2026-11-16', '08:30'); await ready();
    assert.equal(await feedback(), '');
  }
  // Future HTTP expiry cannot make a 12-hour-old issue fresh.
  await evaluate(`(()=>{const s=JSON.parse(localStorage.getItem(${JSON.stringify(key)}));s.issuedAt=Date.parse('2026-11-16T00:30Z');s.fetchedAt=Date.parse('2026-11-16T12:30Z');s.expiresAt=s.fetchedAt+600000;localStorage.setItem(${JSON.stringify(key)},JSON.stringify(s));})()`);
  await c('Page.reload'); await ready();
  assert.equal(await evaluate('__nwsCalls.length'), 2, '12h issue cannot be reused');
  await evaluate(`(()=>{const s=JSON.parse(localStorage.getItem(${JSON.stringify(key)}));s.point='https://api.weather.gov/points/40.0000,-105.0000';localStorage.setItem(${JSON.stringify(key)},JSON.stringify(s));})()`);
  await c('Page.reload'); await ready();
  assert.equal(await evaluate('__nwsCalls.length'), 2, 'wrong-point cache cannot be reused');
  await evaluate("Storage.prototype.setItem=function(){throw Error('Fixture storage denied')};Storage.prototype.getItem=function(){throw Error('Fixture storage denied')}");
  await reset();
  assert.match(await evaluate("document.querySelector('#storage-status').innerText"), /could not save/);
  assert.match(await evaluate("document.querySelector('.dial-factors').innerText"), /Heat \/ feels-like\s+Unknown/);
  await shot('mobile-weather-fixtures');
  assert.equal(events.filter(e => e.method === 'Runtime.exceptionThrown').length, 0, 'no uncaught weather exceptions');
  await writeFile(scratch + '/weather-fixture-evidence.json', JSON.stringify({ calls: await evaluate('__nwsCalls'), checks: 'past persistence, partial/error clearing, DST, park zone vs Tokyo, provider horizon, expiry/focus/dedup, 12h issue, wrong point, offline/timeout/429/backoff/recovery, storage denied' }, null, 2));
  await c('Page.removeScriptToEvaluateOnNewDocument', { identifier });
  await c('Emulation.setTimezoneOverride', { timezoneId: '' });
  console.log('PASS deterministic Chrome weather boundaries, expiry/focus, offline/timeout/429 recovery and unknown model');
}
