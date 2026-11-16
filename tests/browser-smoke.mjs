// Run explicitly with an already installed Chrome; no package/browser downloads.
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { readFile, writeFile, mkdir, mkdtemp, rm, watch } from 'node:fs/promises';
import { resolve, extname } from 'node:path';

const output = resolve('.verification');
await mkdir(output, { recursive: true });
const profile = await mkdtemp(resolve(output, 'chrome-'));
const root = resolve('dist');
const server = createServer(async (request, response) => {
  const path = resolve(root, '.' + new URL(request.url, 'http://localhost').pathname.replace(/\/$/, '/index.html'));
  if (!path.startsWith(root + '/')) { response.writeHead(403).end(); return; }
  try {
    const body = await readFile(path);
    response.setHeader('Content-Type', ({ '.js': 'text/javascript', '.html': 'text/html', '.css': 'text/css', '.geojson': 'application/json', '.svg': 'image/svg+xml' })[extname(path)] ?? 'application/octet-stream');
    response.end(body);
  } catch { response.writeHead(404).end(); }
});
server.listen(0, '127.0.0.1');
await once(server, 'listening');
const origin = `http://127.0.0.1:${server.address().port}`;
const chrome = spawn(process.env.CHROME ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', [
  '--headless=new', '--no-first-run', '--no-default-browser-check', '--disable-background-networking',
  '--remote-debugging-address=127.0.0.1', '--remote-debugging-port=0', `--user-data-dir=${profile}`, 'about:blank'
], { stdio: ['ignore', 'ignore', 'pipe'] });
let browserLog = '';
chrome.stderr.on('data', chunk => { browserLog += chunk; });
let socket;
try {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);
  const watcher = watch(profile, { signal: controller.signal });
  let port;
  try {
    for (;;) {
      try { port = Number((await readFile(resolve(profile, 'DevToolsActivePort'), 'utf8')).split('\n')[0]); break; }
      catch (error) { if (error.code !== 'ENOENT') throw error; }
      await watcher.next();
    }
  } finally { clearTimeout(timeout); await watcher.return(); }
  const pages = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
  socket = new WebSocket(pages.find(page => page.type === 'page').webSocketDebuggerUrl);
  await once(socket, 'open');
  const pending = new Map();
  const requests = [];
  const exceptions = [];
  let sequence = 0;
  socket.addEventListener('message', ({ data }) => {
    const message = JSON.parse(data);
    if (message.id) {
      const entry = pending.get(message.id);
      pending.delete(message.id);
      clearTimeout(entry.timer);
      message.error ? entry.reject(new Error(JSON.stringify(message.error))) : entry.resolve(message.result);
    }
    if (message.method === 'Network.requestWillBeSent') requests.push(message.params.request.url);
    if (message.method === 'Runtime.exceptionThrown') exceptions.push(message.params.exceptionDetails);
  });
  const call = (method, params = {}) => new Promise((resolve, reject) => {
    const id = ++sequence;
    const timer = setTimeout(() => { pending.delete(id); reject(new Error(`CDP timed out: ${method}`)); }, 20000);
    pending.set(id, { resolve, reject, timer });
    socket.send(JSON.stringify({ id, method, params }));
  });
  const evaluate = async expression => {
    const result = await call('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
    if (result.exceptionDetails) throw new Error(JSON.stringify(result.exceptionDetails));
    return result.result.value;
  };
  const wait = condition => evaluate(`new Promise((resolve,reject)=>{
    const ready=()=>{if(${condition}){observer.disconnect();clearTimeout(timer);resolve(true)}};
    const observer=new MutationObserver(ready);observer.observe(document,{subtree:true,childList:true,attributes:true});
    const timer=setTimeout(()=>{observer.disconnect();reject(new Error('Render condition timed out: '+${JSON.stringify(condition)}))},12000);ready();})`);
  const click = selector => evaluate(`document.querySelector(${JSON.stringify(selector)}).click()`);
  const text = () => evaluate('document.querySelector("#screen").innerText');
  const screenshot = async name => {
    const { cssContentSize } = await call('Page.getLayoutMetrics');
    const { data } = await call('Page.captureScreenshot', { captureBeyondViewport: true,
      clip: { x: 0, y: 0, width: cssContentSize.width, height: cssContentSize.height, scale: 1 } });
    await writeFile(resolve(output, name + '.png'), Buffer.from(data, 'base64'));
  };
  await call('Page.enable'); await call('Runtime.enable'); await call('Network.enable');
  await call('Emulation.setDeviceMetricsOverride', { width: 1280, height: 900, deviceScaleFactor: 1, mobile: false });
  await call('Page.navigate', { url: origin });
  await wait('document.querySelectorAll(".trail-card").length === 6');
  assert.equal(await evaluate('localStorage.length'), 0);
  console.log('PASS fresh disposable origin: six published hikes');
  await screenshot('explore');
  await click('a[href="#profile/setup"]');
  await wait('document.querySelector("#profile-form")');
  await evaluate('document.querySelector("input[name=name]").value="Browser fixture";document.querySelector("#profile-form").requestSubmit()');
  await wait('document.querySelectorAll(".trail-card").length === 6');
  await click('[data-compare="riverside-walk"]');
  await click('[data-compare="bear-lake"]');
  await click('a[href="#trail/riverside-walk"]');
  await wait('document.querySelector("#forecast-status")');
  await click('#forecast summary');
  assert.match(await text(), /Forecast unavailable/);
  await wait('document.querySelector(".leaflet-overlay-pane path")');
  await screenshot('hike');
  console.log('PASS hike facts, disabled forecast, actual Leaflet route rendered');
  await click('a[href="#packing/riverside-walk"]');
  await wait('document.querySelector("#water-edit-form")');
  assert.match(await text(), /Water plan/);
  await screenshot('packing');
  await evaluate('location.hash="#compare"');
  await wait('document.querySelector("#screen").dataset.page === "compare"');
  assert.match(await text(), /Bear Lake Loop/);
  assert.match(await text(), /forecasts are unavailable/);
  await screenshot('compare');
  console.log('PASS profile -> two-hike comparison -> packing with water estimates');
  await evaluate('location.hash="#map"');
  await wait('document.querySelectorAll(".leaflet-marker-icon").length === 6');
  await screenshot('map');
  // Authored test records only: exercise existing v2 storage without changing its schema.
  await evaluate(`(()=>{const key='trail-gauge-v2';const state=JSON.parse(localStorage.getItem(key));
    state.history.push({trailId:'flattop-mountain',note:'Archived browser fixture',date:'2026-11-01'});
    state.favorites.push({key:'verified:flattop-mountain',id:'flattop-mountain',name:'Flattop Mountain',source:'verified'});
    localStorage.setItem(key,JSON.stringify(state));location.hash='#history';location.reload()})()`);
  await wait('document.querySelector("#screen")?.innerText.includes("Archived browser fixture")');
  await click('a[href="#trail/flattop-mountain"]');
  await wait('document.querySelector("#screen")?.innerText.includes("unavailable")');
  assert.match(await text(), /Flattop Mountain/);
  await evaluate('location.hash="#explore?list=favorites"');
  await wait('document.querySelector("#screen")?.innerText.includes("Archived saved route")');
  console.log('PASS archived history/favorite survive reload and resolve to unavailable route');
  await call('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
  await screenshot('mobile-archive');
  assert.equal(await evaluate('document.documentElement.scrollWidth > innerWidth'), false);
  assert.equal(requests.some(url => /open-meteo|carto\.nationalmap\.gov|epqs\.nationalmap\.gov/.test(url)), false);
  assert.deepEqual(exceptions, []);
  await writeFile(resolve(output, 'requests.json'), JSON.stringify(requests, null, 2));
  console.log('PASS no Open-Meteo/nationwide primary requests; no uncaught runtime errors; mobile fits');
  console.log(`Evidence: ${output}; optional NPS alerts not asserted as reliable provider coverage.`);
} catch (error) {
  console.error(error, browserLog.slice(-1500));
  process.exitCode = 1;
} finally {
  socket?.close();
  chrome.kill('SIGTERM');
  await once(chrome, 'exit');
  await new Promise(resolve => server.close(resolve));
  await rm(profile, { recursive: true, force: true });
}
