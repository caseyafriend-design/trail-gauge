import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';

export async function weatherChecks({ c, evaluate, wait, goto, shot, events, scratch }) {
  const trails = await evaluate("import('./catalog.js').then(m=>m.loadCatalog())");
  const choose = async trail => {
    const plan = await evaluate(`(()=>{const instant=Date.now()+3*3600000;const parts=Object.fromEntries(new Intl.DateTimeFormat('en-CA',{timeZone:${JSON.stringify(trail.timeZone)},year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(instant).map(p=>[p.type,p.value]));return {date:parts.year+'-'+parts.month+'-'+parts.day,start:parts.hour+':'+parts.minute};})()`);
    await evaluate(`document.querySelector('#weather-form [name=date]').value=${JSON.stringify(plan.date)};document.querySelector('#weather-form [name=start]').value=${JSON.stringify(plan.start)};document.querySelector('#weather-form').requestSubmit()`);
  };
  const parks = await evaluate("import('./catalog.js').then(m=>m.parks)");
  const live = [];
  for (const trail of trails) {
    trail.timeZone = parks[trail.parkCode].timeZone;
    await goto('#trail/' + trail.id, '#weather-form');
    await wait(`document.querySelector('#screen h1')?.textContent===${JSON.stringify(trail.name)}`);
    await choose(trail);
    await wait("!!document.querySelector('.forecast-metrics') || document.querySelector('#forecast-status').innerText.includes('Try again later')");
    const text = await evaluate("document.querySelector('#forecast-status').innerText");
    live.push({ id: trail.id, text });
    await writeFile(scratch + '/nws-app-live.json', JSON.stringify(live, null, 2));
    assert.match(text, /NWS hourly forecast for the estimated outing/, trail.id);
    assert.match(text, /not feels-like/);
    assert.ok(await evaluate("document.documentElement.scrollWidth<=innerWidth"), trail.id + ' forecast overflow');
  }
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
  console.log('PASS actual app seven-trail NWS forecasts, browser default UA wire evidence');

  // Real app with isolated response fixtures. This is not live-source evidence.
  const { identifier } = await c('Page.addScriptToEvaluateOnNewDocument', { source: `
    window.__nwsMode='normal';window.__nwsCalls=[];
    const nativeFetch=window.fetch.bind(window);
    window.fetch=async(input,options)=>{
      const url=String(input);if(!url.startsWith('https://api.weather.gov/'))return nativeFetch(input,options);
      window.__nwsCalls.push(url);
      if(window.__nwsMode==='outage')return new Response('{}',{status:503,headers:{'Retry-After':'120'}});
      if(url.includes('/points/'))return new Response(JSON.stringify({properties:{forecastHourly:'https://api.weather.gov/gridpoints/SLC/43,24/forecast/hourly'}}),{headers:{'Cache-Control':'max-age=600'}});
      const base=Math.floor(Date.now()/3600000)*3600000;
      const properties={updateTime:new Date(Date.now()-(window.__nwsMode==='stale'?13:0)*3600000).toISOString(),generatedAt:new Date().toISOString(),validTimes:new Date(base).toISOString()+'/P2D',periods:Array.from({length:window.__nwsMode==='horizon'?1:48},(_,i)=>({startTime:new Date(base+i*3600000).toISOString(),endTime:new Date(base+(i+1)*3600000).toISOString(),temperature:window.__nwsMode==='missing'?null:52,temperatureUnit:'F',probabilityOfPrecipitation:{unitCode:'wmoUnit:percent',value:null},windSpeed:null,windDirection:null,shortForecast:'Fixture sky'}))};
      return new Response(JSON.stringify({properties}),{headers:{'Cache-Control':'max-age=600'}});
    };` });
  await evaluate("localStorage.removeItem('trail-gauge-nws-hourly-v1-riverside-walk')");
  await c('Page.navigate', { url: await evaluate("location.origin+'/?weather-fixture=1#trail/riverside-walk'") });
  await wait("window.__nwsMode==='normal' && document.querySelector('#screen h1')?.textContent==='Riverside Walk' && !!document.querySelector('#weather-form')");
  const river = trails.find(t => t.id === 'riverside-walk');
  await choose(river);
  await wait("document.querySelector('#forecast-status').innerText.includes('52–52')");
  await c('Page.reload');
  await wait("!!document.querySelector('.forecast-metrics')");
  assert.equal(await evaluate('window.__nwsCalls.length'), 0, 'fresh versioned cache survives reload without a request');
  for (const [mode, text] of [['missing', 'Air temperature\nUnknown'], ['horizon', 'outside the available'], ['stale', 'expired']]) {
    await evaluate(`window.__nwsMode=${JSON.stringify(mode)}`);
    await choose(river);
    await wait(`document.querySelector('#forecast-status').innerText.includes(${JSON.stringify(text)})`);
    if (mode !== 'missing') assert.equal(await evaluate("!!document.querySelector('.forecast-metrics')"), false);
  }
  await evaluate("document.querySelector('#weather-form [name=date]').value='2027-11-07';document.querySelector('#weather-form [name=start]').value='01:30';document.querySelector('#weather-form').requestSubmit()");
  await wait("document.querySelector('#forecast-status').innerText.includes('unambiguous')");
  await evaluate("window.__nwsMode='outage'"); await choose(river);
  await wait("document.querySelector('#forecast-status').innerText.includes('HTTP 503')");
  const count = await evaluate('window.__nwsCalls.length');
  await choose(river);
  await wait("document.querySelector('#forecast-status').innerText.includes('requests paused')");
  assert.equal(await evaluate('window.__nwsCalls.length'), count, 'Retry-After prevents immediate retry');
  assert.equal(await evaluate("!!document.querySelector('.forecast-metrics')"), false);
  assert.match(await evaluate("document.querySelector('.dial-factors').innerText"), /Heat \/ feels-like\s+Unknown/);
  await shot('mobile-unavailable-forecast');
  assert.equal(events.filter(e => e.method === 'Runtime.exceptionThrown').length, 0, 'no uncaught weather exceptions');
  await c('Page.removeScriptToEvaluateOnNewDocument', { identifier });
  console.log('PASS weather UI fixture missing fields, full-window horizon, stale issue, DST, cache reload, outage and backoff');
}
