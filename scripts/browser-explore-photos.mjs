import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { browserSession } from './browser-session.mjs';

const git = (...args) => execFileSync('git', args, {encoding:'utf8'}).trim();
const commit = git('rev-parse', 'HEAD');
assert.equal(git('status', '--porcelain'), '', 'Evidence requires a clean committed checkout');
await browserSession(async ({c,evaluate,wait,goto,shot,events,scratch,origin,root}) => {
  const records = [];
  const enter = async selector => {
    await evaluate(`document.querySelector(${JSON.stringify(selector)}).focus()`);
    await c('Input.dispatchKeyEvent', {type:'keyDown',key:'Enter',code:'Enter',windowsVirtualKeyCode:13,text:'\r'});
    await c('Input.dispatchKeyEvent', {type:'keyUp',key:'Enter',code:'Enter',windowsVirtualKeyCode:13});
  };
  const count = () => evaluate("document.querySelectorAll('#explore-results [data-explore-photo]').length");
  const filter = async (name,value) => evaluate(`(()=>{const input=document.querySelector('#explore-filters [name=${name}]');input.value=${JSON.stringify(value)};input.dispatchEvent(new Event('input',{bubbles:true}));})()`);
  await c('Page.navigate', {url:origin+'/#explore'});
  await wait("!!document.querySelector('#explore-filters')");
  const trails = await evaluate("import('./catalog.js').then(m=>m.loadCatalog())");
  const photos = await evaluate("import('./photos.js').then(m=>m.photos)");
  assert.equal(trails.length,8);
  for (const mobile of [false,true]) {
    await c('Emulation.setDeviceMetricsOverride',{width:mobile?390:1280,height:mobile?844:900,deviceScaleFactor:1,mobile});
    await goto('#explore','#explore-filters');
    assert.equal(await count(),8);
    for (const trail of trails) {
      const photo = photos.find(p=>p.trailId===trail.id);
      const selector = `[data-explore-photo="${trail.id}"]`;
      await evaluate(`document.querySelector(${JSON.stringify(selector)}).scrollIntoView()`);
      const actual = await evaluate(`(async()=>{const figure=document.querySelector(${JSON.stringify(selector)});const image=figure.querySelector('img');await image.decode();return {asset:image.getAttribute('src'),alt:image.alt,width:image.naturalWidth,href:figure.querySelector('a').getAttribute('href'),links:[...figure.querySelectorAll('figcaption a')].map(a=>a.href),text:figure.textContent};})()`);
      assert.equal(actual.asset,photo.asset);
      assert.equal(actual.alt,photo.caption);
      assert.ok(actual.width>0 && actual.width<=960);
      assert.equal(actual.href,'#trail/'+trail.id);
      for (const link of [photo.source,photo.rightsEvidence,photo.licenseUrl].filter(Boolean)) assert.ok(actual.links.includes(link),link);
      for (const text of [photo.creator,photo.title,photo.license]) assert.ok(actual.text.includes(text),text);
      await enter(selector+' > a');
      await wait(`document.querySelector('#screen h1')?.textContent===${JSON.stringify(trail.name)}`);
      await goto('#explore','#explore-filters');
      records.push({viewport:mobile?'mobile':'desktop',id:trail.id,...actual});
    }
    await filter('park','grba');assert.equal(await count(),1);
    assert.ok(await evaluate("!!document.querySelector('[data-explore-photo=alpine-lakes-loop]')"));
    await filter('park','');await filter('query','Bear Lake');assert.equal(await count(),1);
    await filter('query','');await filter('distance','short');
    assert.equal(await count(),trails.filter(t=>t.miles<2).length);
    await filter('distance','');await filter('fit','fits');assert.equal(await count(),0);
    await filter('fit','');assert.equal(await count(),8);
    await enter('[data-trail-preference=favorites][data-route-id=riverside-walk]');
    await enter('[data-explore-tab=favorites]');assert.equal(await count(),1);
    await enter('[data-explore-tab=all]');
    await enter('[data-trail-preference=skipped][data-route-id=bear-lake]');assert.equal(await count(),7);
    await enter('[data-explore-tab=skipped]');assert.equal(await count(),1);
    await enter('[data-trail-preference=skipped][data-route-id=bear-lake]');assert.equal(await count(),0);
    await enter('[data-explore-tab=all]');
    await enter('[data-compare=riverside-walk]');
    assert.equal(await evaluate("document.querySelector('[data-compare=riverside-walk]').getAttribute('aria-pressed')"),'true');
    await enter('[data-compare=riverside-walk]');
    await enter('[data-trail-preference=favorites][data-route-id=riverside-walk]');
    await enter('[data-explore-photo=riverside-walk] summary');
    assert.equal(await evaluate("document.querySelector('[data-explore-photo=riverside-walk] details').open"),true);
    assert.ok(await evaluate('document.documentElement.scrollWidth<=innerWidth'));
    await evaluate('scrollTo(0,0)');
    await shot(mobile?'mobile-explore-photos':'desktop-explore-photos');
    await evaluate("document.querySelector('[data-explore-photo=riverside-walk] img').dispatchEvent(new Event('error'))");
    assert.equal(await evaluate("document.querySelector('[data-explore-photo=riverside-walk] [data-photo-error]').hidden"),false);
    assert.ok(await evaluate("document.querySelector('[data-explore-photo=riverside-walk] figcaption').textContent.includes('McGhiever')"));
    await c('Page.reload');await wait("!!document.querySelector('#explore-filters')");
  }
  const errors=events.filter(e=>e.method==='Runtime.exceptionThrown');
  assert.deepEqual(errors,[]);
  assert.equal(git('rev-parse','HEAD'),commit);
  assert.equal(git('status','--porcelain'),'');
  await writeFile(scratch+'/explore-photos.json',JSON.stringify({commit,root,origin,records,errors,checks:'eight associated decoded photos, rights, keyboard navigation/credits/actions, filter/list redraw, desktop/mobile overflow, image-error fallback'},null,2));
  console.log('PASS eight associated card images, rights, keyboard/filter/list actions, desktop/mobile and no runtime errors at '+commit);
}, 'explore-photos');
