import assert from 'node:assert/strict';
import {readFile, readdir, writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {resolve} from 'node:path';
import {browserSession} from './browser-session.mjs';
import {catalogChecks} from './browser-catalog.mjs';

const canonical = process.env.TRAIL_GAUGE_CANONICAL;
const expected = process.env.TRAIL_GAUGE_EXPECTED_COMMIT;
assert.ok(canonical && /^[a-f0-9]{40}$/.test(expected ?? ''),
  'Set TRAIL_GAUGE_CANONICAL and full TRAIL_GAUGE_EXPECTED_COMMIT');
const checkout = fileURLToPath(new URL('../', import.meta.url));
const git = (root, ...args) => execFileSync('git', ['-C', root, ...args]);
const tip = root => git(root, 'rev-parse', 'HEAD').toString().trim();
const cleanCanonical = () => {
  assert.equal(tip(canonical), expected, 'canonical commit changed');
  assert.equal(git(canonical, 'status', '--porcelain').toString(), '', 'canonical must be clean');
};
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
const files = async root => (await readdir(root, {recursive:true, withFileTypes:true}))
  .filter(entry => entry.isFile())
  .map(entry => resolve(entry.parentPath, entry.name).slice(resolve(root).length + 1)).sort();
cleanCanonical();
assert.equal(git(checkout, 'status', '--porcelain').toString(), '', 'proof checkout must be clean');
const verificationTip = tip(checkout);
const paths = git(canonical, 'ls-tree', '-r', '--name-only', '-z', expected, '--', 'dist')
  .toString().split('\0').filter(Boolean).map(path => path.slice(5)).sort();
assert.deepEqual(await files(canonical + '/dist'), paths, 'canonical complete dist file set');
assert.deepEqual(await files(checkout + '/dist'), paths, 'verification complete dist file set');
const assets = [];
for (const path of paths) {
  const committed = git(canonical, 'show', `${expected}:dist/${path}`);
  assert.deepEqual(await readFile(canonical + '/dist/' + path), committed, 'canonical ' + path);
  assert.deepEqual(await readFile(checkout + '/dist/' + path), committed, 'verification ' + path);
  assets.push({path, sha256:sha256(committed)});
}
const data = JSON.parse(await readFile(canonical + '/dist/routes.geojson', 'utf8'));
const ids = data.features.map(feature => feature.id);
const parks = [...new Set(data.features.map(feature => feature.properties.parkCode))];
assert.equal(ids.length, 8);
assert.equal(new Set(ids).size, 8);
assert.equal(parks.length, 7);
const originals = JSON.parse(await readFile(new URL('../tests/fixtures/original-routes.sha256.json', import.meta.url)));
for (const [id, hash] of Object.entries(originals)) {
  assert.equal(sha256(JSON.stringify(data.features.find(feature => feature.id === id))), hash, id);
}
process.env.TRAIL_GAUGE_ROOT = resolve(canonical, 'dist');
await browserSession(async context => {
  const {origin, c, evaluate, wait, goto, shot, scratch} = context;
  for (const asset of assets) {
    const response = await fetch(origin + '/' + asset.path);
    assert.equal(response.status, 200, asset.path);
    assert.equal(sha256(Buffer.from(await response.arrayBuffer())), asset.sha256, asset.path);
  }
  await c('Page.navigate', {url:origin + '/#explore'});
  await wait("!!document.querySelector('#explore-filters')");
  const loaded = await evaluate("import('./catalog.js').then(m=>m.loadCatalog()).then(t=>({ids:t.map(x=>x.id),parks:[...new Set(t.map(x=>x.parkCode))]}))");
  assert.deepEqual(loaded, {ids, parks});
  await catalogChecks(context);
  for (const mobile of [false, true]) {
    await c('Emulation.setDeviceMetricsOverride', {width:mobile?390:1280,height:mobile?844:900,deviceScaleFactor:1,mobile});
    for (const feature of data.features) {
      await goto('#trail/' + feature.id, '#trail-save-actions');
      await wait(`document.querySelector('#screen h1')?.textContent===${JSON.stringify(feature.properties.name)}`);
      await wait("!!document.querySelector('#trail-map .leaflet-overlay-pane path')");
      assert.ok(await evaluate('document.documentElement.scrollWidth<=innerWidth'), feature.id);
      await shot((mobile?'mobile-':'desktop-') + feature.id);
    }
  }
  const errors = context.events.filter(event => event.method === 'Runtime.exceptionThrown');
  assert.deepEqual(errors, [], 'uncaught browser exceptions');
  cleanCanonical();
  assert.equal(tip(checkout), verificationTip, 'verification tip changed');
  await writeFile(scratch + '/delivery.json', JSON.stringify({verifiedAt:new Date().toISOString(),
    canonicalCommit:expected, verificationTip, canonicalClean:true, origin, assets, loaded,
    originalSevenUnchanged:true, viewports:['1280x900', '390x844'], errors}, null, 2));
  console.log(`PASS ${assets.length} canonical Git/local/HTTP assets; eight trails/seven parks; all route desktop/mobile previews`);
}, 'delivery');
