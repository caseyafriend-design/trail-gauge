import { escapeHtml } from './forms.js';
import { preferenceButtons, preferenceKey } from './explore.js';
import { mountMap } from './map.js';
import { hasGeometry } from './catalog.js';
import { loadBoundaries, loadTrailSegment, searchParams, searchTrails, usgsCoverage, usgsLayer } from './us-trails.js';

const link = (url, label) => `<a href="${url}" target="_blank" rel="noopener">${label} ↗</a>`;
function segmentLength(value) {
  if (value == null) return 'Segment length unavailable';
  const distance = value < 0.1 ? `${Math.max(1, Math.round(value * 5280))} ft`
    : `${value.toLocaleString('en-US', { maximumSignificantDigits: 3 })} mi`;
  return `${distance} mapped segment`;
}
const hikingUse = trail => {
  if (trail.hikingListed) return 'Hiking listed by source';
  return trail.hikingProhibited ? 'Source marks hiking as disallowed' : 'Hiking use unverified';
};
const resultsLink = options => '#us-trails' + searchParams(options);

export function usSearchPage() {
  return `<a class="back" href="#explore">← Explore</a><div class="intro"><h1>Find trails across the U.S.</h1>
    <p>Search the USGS catalog by trail name or browse by state.</p></div>
    <form id="us-search" class="card us-search-fields">
      <label>Trail name<input type="search" name="q" maxlength="100" placeholder="e.g. Mount Monadnock"></label>
      <label>State or area<select name="state"><option value="">Nationwide</option></select></label>
      <label class="check-line"><input type="checkbox" name="unnamed">Include unnamed segments when browsing</label>
      <button class="button" type="submit">Search trails</button>
    </form>
    <p class="compare-status" role="status"></p><div id="us-search-results" class="us-results"></div>
    <p class="planning-note">Coverage varies by area and land manager. The source layer includes individual trail segments.
      ${link(usgsCoverage, 'About USGS trail coverage')}</p>`;
}

function searchResults({ trails, hasMore }, options, preferences) {
  const cards = trails.filter(trail => !preferences.skipped.some(item => item.key === preferenceKey(trail, 'usgs'))).map(trail => `<article class="trail-card"><a class="trail-info" href="#us-trail/${encodeURIComponent(trail.id)}${escapeHtml(searchParams(options))}">
      <div class="trail-top"><h3>${escapeHtml(trail.name)}</h3></div>
      <p>${segmentLength(trail.miles)} · ${hikingUse(trail)}</p>
      ${trail.source ? `<p>${escapeHtml(trail.source)}</p>` : ''}</a>
      <div class="trail-actions">${preferenceButtons(trail, preferences, 'usgs')}</div></article>`).join('');
  return `<section class="region" aria-labelledby="us-result-heading"><h2 id="us-result-heading">Mapped trail segments</h2>
    ${cards ? `<div class="stack">${cards}</div>` : '<p>No visible segments found. Try another search or check your Would skip list in Explore.</p>'}
    ${options.page || hasMore ? `<nav class="us-pagination" aria-label="Search results pages">
      ${options.page ? `<a class="compare-toggle" href="${escapeHtml(resultsLink({ ...options, page: options.page - 1 }))}">Previous</a>` : ''}
      <span>Page ${options.page + 1}</span>
      ${hasMore ? `<a class="compare-toggle" href="${escapeHtml(resultsLink({ ...options, page: options.page + 1 }))}">Next</a>` : ''}
    </nav>` : ''}</section>`;
}

function verifiedMatches(routes, options, preferences) {
  const query = options.query.toLowerCase();
  const matches = routes.filter(route => !preferences.skipped.some(item => item.key === preferenceKey(route)) && (!options.stateCode || route.stateCode === options.stateCode)
    && (!query || (route.name + ' ' + route.park).toLowerCase().includes(query)));
  if (!matches.length) return '';
  return `<section class="region" aria-labelledby="verified-heading"><h2 id="verified-heading">Verified hikes for group planning</h2>
    <div class="stack">${matches.map(route => `<article class="trail-card"><a class="trail-info" href="#trail/${encodeURIComponent(route.id)}">
      <div class="trail-top"><h3>${escapeHtml(route.name)}</h3></div>
      <p>${escapeHtml(route.park)} · ${route.miles} mi · ${route.gain.toLocaleString('en-US')} ft gain</p></a>
      <div class="trail-actions">${preferenceButtons(route, preferences)}</div></article>`).join('')}</div></section>`;
}

export async function mountUSSearch(screen, options, routes, signal, preferences) {
  const form = screen.querySelector('#us-search');
  const results = screen.querySelector('#us-search-results');
  form.elements.q.value = options.query;
  form.elements.unnamed.checked = options.includeUnnamed;
  const stateSelect = form.elements.state;
  const readyToPlan = () => verifiedMatches(routes, options, preferences);
  let state;
  let found;
  screen.addEventListener('trail-preferences', () => {
    results.innerHTML = readyToPlan() + (found ? searchResults(found, options, preferences) : '');
  }, { signal });

  async function runSearch() {
    if (!options.query && !options.stateCode) {
      results.innerHTML = readyToPlan();
      return;
    }
    results.innerHTML = readyToPlan() + '<p class="us-search-status" role="status">Searching USGS trail data…</p>';
    try {
      found = await searchTrails(options, state, signal);
      if (results.isConnected) results.innerHTML = readyToPlan() + searchResults(found, options, preferences);
    } catch {
      if (results.isConnected) {
        results.innerHTML = readyToPlan() + '<p class="us-search-status" role="status">USGS trail results are unavailable. Try searching again.</p>';
      }
    }
  }

  form.addEventListener('submit', event => {
    event.preventDefault();
    const next = {
      query: form.elements.q.value.trim(),
      stateCode: stateSelect.value, includeUnnamed: form.elements.unnamed.checked, page: 0
    };
    const hash = resultsLink(next);
    if (location.hash === hash) runSearch();
    else location.hash = hash;
  });

  stateSelect.disabled = true;
  results.innerHTML = readyToPlan();
  try {
    const states = await loadBoundaries();
    if (!form.isConnected) return;
    state = states.find(item => item.code === options.stateCode);
    for (const item of states) stateSelect.add(new Option(item.name, item.code));
    stateSelect.value = state?.code ?? '';
    stateSelect.disabled = false;
  } catch {
    if (!form.isConnected) return;
    stateSelect.options[0].text = 'Nationwide · state filter unavailable';
  }
  await runSearch();
}

export function usSegmentPage(options, mapView) {
  const back = mapView ? `#map?view=${mapView.lat},${mapView.lon},${mapView.zoom}` : resultsLink(options);
  const label = mapView ? 'U.S. trail map' : 'U.S. trail search';
  return `<a class="back" href="${escapeHtml(back)}">← ${label}</a>
    <div id="us-segment"><p role="status">Loading USGS trail segment…</p></div>`;
}

export async function mountUSSegment(screen, id, signal, preferences) {
  const container = screen.querySelector('#us-segment');
  try {
    const trail = await loadTrailSegment(id, signal);
    if (!container.isConnected) return;
    if (!trail) {
      container.innerHTML = '<div class="intro"><h1>Trail segment unavailable</h1><p>The current USGS catalog does not have this record.</p></div>';
      return;
    }
    const mapped = hasGeometry(trail);
    container.innerHTML = `<div class="intro"><span class="eyebrow">USGS trail segment</span><h1>${escapeHtml(trail.name)}</h1>
      <p>${segmentLength(trail.miles)} · ${hikingUse(trail)}</p>
      <div class="trail-actions">${preferenceButtons(trail, preferences, 'usgs')}</div><p class="compare-status" role="status"></p></div>
      <div class="us-segment-layout"><section class="map-panel" aria-label="USGS trail segment map">
        <div id="trail-map" aria-label="Interactive trail map">${mapped ? 'Loading map…' : 'Mapped geometry is unavailable.'}</div>
        <p class="planning-note" data-basemap-status role="status"></p>
        <p class="planning-note">${link('https://www.openstreetmap.org/fixthemap', 'Report a basemap issue')}</p>
      </section>
      <section class="card" aria-labelledby="segment-info"><h2 id="segment-info">Trail information</h2>
        <dl class="planning-facts">
          <div><dt>Trail type</dt><dd>${trail.trailType ?? 'Unavailable'}</dd></div>
          <div><dt>Mapped length</dt><dd>${segmentLength(trail.miles)}</dd></div>
          <div><dt>Surface</dt><dd>${escapeHtml(trail.surface || 'Unavailable')}</dd></div>
          <div><dt>Data provider</dt><dd>${escapeHtml(trail.source || 'USGS National Digital Trails')}</dd></div>
        </dl>
        ${trail.dataset ? `<p class="planning-note">${escapeHtml(trail.dataset)}</p>` : ''}
        <p class="planning-note">The mapped line may be part of a longer trail. The full itinerary, trailhead access, elevation gain, and group estimate are unavailable.</p>
        <p class="planning-note">Check current access and closures with the land manager.</p>
        <p class="planning-note">${link(usgsLayer, 'USGS trail data')}</p>
      </section></div>`;
    if (mapped) mountMap(container.querySelector('#trail-map'), [trail], trail, true);
  } catch {
    if (container.isConnected) container.innerHTML = '<div class="intro"><h1>Trail segment unavailable</h1><p>The USGS source could not be reached. Go back and try again.</p></div>';
  }
}
