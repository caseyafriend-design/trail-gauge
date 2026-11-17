import assert from 'node:assert/strict';
import {test} from 'node:test';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {loadCatalog, parks, regions, hasGeometry, legacyTrails} from '../dist/catalog.js';
const read = async path => JSON.parse(await readFile(new URL(path, import.meta.url)));
const data = await read('../dist/routes.geojson');
const manifest = await read('../scripts/routes.json');
const originals = await read('./fixtures/original-routes.sha256.json');

test('expansion preserves every original feature, ID and saved legacy name', () => {
  for (const [id, hash] of Object.entries(originals)) {
    const feature = data.features.find(feature => feature.id === id);
    assert.ok(feature, id);
    assert.equal(createHash('sha256').update(JSON.stringify(feature)).digest('hex'), hash, id);
  }
  assert.equal(legacyTrails['queens-garden'].name, 'Queens Garden');
  assert.equal(legacyTrails['emerald-lake'].name, 'Emerald Lake');
});

test('every manifest route survives loading with finite sourced facts and registered park/region', async () => {
  const trails = await loadCatalog(async () => ({ok:true,json:async()=>data}));
  assert.deepEqual(trails.map(t=>t.id), manifest.map(t=>t.id));
  assert.equal(new Set(trails.map(t=>t.id)).size, trails.length);
  for (const trail of trails) {
    assert.ok(hasGeometry(trail), trail.id);
    assert.ok(trail.miles > 0 && Number.isFinite(trail.gain) && trail.gain >= 0, trail.id);
    assert.ok(regions.some(region=>region.id===trail.region));
    assert.match(parks[trail.parkCode].conditions, /^https:\/\/www.nps.gov\//);
    assert.doesNotThrow(()=>new Intl.DateTimeFormat('en',{timeZone:parks[trail.parkCode].timeZone}));
    assert.match(trail.statsSource, /^https:\/\/(www\.)?nps.gov\//);
    assert.ok(trail.sourceSegments.length);
  }
  assert.equal(parks.grba.timeZone, 'America/Los_Angeles');
});

test('Alpine Lakes reproduces full official linework with exact junctions and retraced approach', () => {
  const result = spawnSync('python3', ['-c', `import json,importlib.util
from pathlib import Path
s=importlib.util.spec_from_file_location('routes','scripts/import-routes.py');m=importlib.util.module_from_spec(s);s.loader.exec_module(m)
r=next(r for r in json.loads(Path('scripts/routes.json').read_text()) if r['id']=='alpine-lakes-loop')
source=json.loads(Path('tests/fixtures/grba-alpine-lakes.geojson').read_text())
f=m.assemble(r,source,'2026-11-17')
expected=next(f for f in json.loads(Path('dist/routes.geojson').read_text())['features'] if f['id']==r['id'])
assert f==expected
parts={f['properties']['OBJECTID']:f for f in source['features']}
lines=[]
for oid,name,*direction in r['segments']:
 line=parts[oid]['geometry']['coordinates']
 assert parts[oid]['geometry']['type']=='LineString'
 lines.append(list(reversed(line)) if direction==['reverse'] else line)
assert all(a[-1]==b[0] for a,b in zip(lines,lines[1:]))
assert lines[0][0]==lines[-1][-1]
assert lines[0]==list(reversed(lines[-1]))
assert f['properties']['gisMiles']==2.665
# Reject a real missing segment instead of drawing a connector.
broken=dict(r);broken['segments']=r['segments'][:1]+r['segments'][2:]
try:m.assemble(broken,source,'2026-11-17')
except ValueError as e:assert 'disconnected' in str(e)
else:raise AssertionError('accepted disconnected itinerary')
`], {cwd:new URL('../',import.meta.url), encoding:'utf8'});
  assert.equal(result.status, 0, result.stderr || result.error?.message);
});
