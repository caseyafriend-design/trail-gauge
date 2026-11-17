import assert from 'node:assert/strict';
export async function catalogChecks({c,evaluate,wait,goto,shot}) {
  const trails = await evaluate("import('./catalog.js').then(m=>m.loadCatalog())");
  assert.ok(trails.some(t=>t.id==='alpine-lakes-loop'));
  for (const mobile of [false,true]) {
    await c('Emulation.setDeviceMetricsOverride',{width:mobile?390:1280,height:mobile?844:900,deviceScaleFactor:1,mobile});
    await goto('#explore','#explore-filters');
    await evaluate("(()=>{const park=document.querySelector('#explore-filters [name=park]');park.value='grba';park.dispatchEvent(new Event('input',{bubbles:true}));})()");
    await wait("document.querySelector('#explore-results a[href=\"#trail/alpine-lakes-loop\"]')");
    assert.equal(await evaluate("document.querySelectorAll('#explore-results .trail-card').length"),1);
    await shot(mobile?'mobile-grba-filter':'desktop-grba-filter');
    await goto('#trail/alpine-lakes-loop','#trail-save-actions');
    await wait("document.querySelector('#screen h1')?.textContent==='Alpine Lakes Loop'");
    await wait("document.querySelector('#trail-map .leaflet-overlay-pane path')");
    const text=await evaluate("document.querySelector('#screen').innerText");
    assert.match(text,/2.7 mi total itinerary/);
    assert.match(text,/440/);
    assert.match(text,/Seasonal Scenic Drive closure/);
    assert.ok(await evaluate("[...document.querySelectorAll('a')].some(a=>a.href==='https://www.nps.gov/grba/planyourvisit/conditions.htm')"));
    assert.ok(await evaluate("document.documentElement.scrollWidth<=innerWidth"));
    await shot(mobile?'mobile-alpine-lakes':'desktop-alpine-lakes');
  }
  console.log('PASS new GRBA catalog/filter/detail desktop and mobile; original checks retained');
}
