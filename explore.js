import { escapeHtml, selectInput, textInput } from './forms.js';
import { nearbyTrails, searchParams } from './us-trails.js';

export const preferenceKey = (trail, source = 'verified') => source + ':' + trail.id;
const detailLink = (trail, source) => (source === 'usgs' ? '#us-trail/' : '#trail/') + encodeURIComponent(trail.id);
const distanceInMiles = ([lon, lat], position) => {
  const toRadians = value => value * Math.PI / 180;
  const p = toRadians(position.latitude);
  const q = toRadians(lat);
  const term = Math.sin((q - p) / 2) ** 2 + Math.cos(p) * Math.cos(q) * Math.sin(toRadians(lon - position.longitude) / 2) ** 2;
  return 3959 * 2 * Math.asin(Math.sqrt(Math.min(1, term)));
};

export function preferenceButtons(trail, state, source = 'verified') {
  const key = preferenceKey(trail, source);
  const saved = state.favorites.some(item => item.key === key);
  const skipped = state.skipped.some(item => item.key === key);
  const common = `data-source="${source}" data-route-id="${escapeHtml(trail.id)}" data-route-name="${escapeHtml(trail.name)}"`;
  return `<button class="compare-toggle" type="button" data-trail-preference="favorites" ${common} aria-pressed="${saved}" aria-label="${saved ? 'Remove favorite' : 'Save favorite'} · ${escapeHtml(trail.name)}">${saved ? '★ Saved' : '☆ Save'}</button>
    <button class="compare-toggle" type="button" data-trail-preference="skipped" ${common} aria-pressed="${skipped}" aria-label="${skipped ? 'Undo skip' : 'Would skip'} · ${escapeHtml(trail.name)}">${skipped ? 'Undo skip' : 'Would skip'}</button>`;
}

export function explorePage(state, trails, params) {
  const options = { '': 'All parks', ...Object.fromEntries(trails.map(trail => [trail.parkCode, trail.park])) };
  return `<div class="intro explore-heading"><div><h1>Explore trails</h1><p>Find a hike that fits your group.</p></div>
    <a class="button secondary" href="#map">Open trail map</a></div>
    ${state.people.length ? '' : `<section class="card explore-setup"><div><h2>Set up your hiking profile</h2>
      <p>A nickname, fitness, and experience are enough to get group estimates.</p></div>
      <a class="button" href="#profile/setup">Set up profile</a></section>`}
    <form id="explore-filters" class="card explore-filters">
      ${textInput('query', 'Trail or park', params.get('q'), 'search', 'placeholder="Search trails or parks" maxlength="100"')}
      ${selectInput('park', 'Park', params.get('park'), options)}
      ${selectInput('distance', 'Distance', params.get('distance'), { '': 'Any distance', short: 'Under 2 mi', medium: '2 to 5 mi', long: 'Over 5 mi' })}
      ${selectInput('fit', 'Group fit', params.get('fit'), { '': 'Any fit', fits: 'Fits my group', easy: 'Easy', moderate: 'Moderate', hard: 'Hard', limit: 'Has a limit or concern' })}
      <div class="explore-nearby"><button class="compare-toggle" type="button" data-nearby>Use my location</button>
        <button class="compare-toggle" type="button" data-clear-nearby hidden>Clear nearby</button>
        <a class="compare-toggle" data-national-search href="#us-trails">Browse U.S. trail segments</a></div>
      <p class="planning-note full-width" data-nearby-status role="status"></p>
    </form>
    <div class="explore-tabs" role="group" aria-label="Trail lists">
      ${[['all', 'Trails'], ['favorites', 'Favorites'], ['skipped', 'Would skip']].map(([id, label]) =>
        `<button class="compare-toggle" type="button" data-explore-tab="${id}" aria-pressed="${(params.get('list') || 'all') === id}">${label}</button>`).join('')}
    </div>
    <p class="compare-status" role="status"></p>
    <section id="explore-results" aria-label="Verified hiking routes"></section>
    <div id="explore-nearby-results"></div>`;
}

export function mountExplore(screen, state, trails, group, getFit, renderCard, signal) {
  const filters = screen.querySelector('#explore-filters');
  const results = screen.querySelector('#explore-results');
  const nearResults = screen.querySelector('#explore-nearby-results');
  const status = screen.querySelector('[data-nearby-status]');
  const locate = screen.querySelector('[data-nearby]');
  const clear = screen.querySelector('[data-clear-nearby]');
  let tab = screen.querySelector('[data-explore-tab][aria-pressed=true]')?.dataset.exploreTab ?? 'all';
  let position;
  let segments = [];
  let nearbyRequest;

  function draw() {
    const { query, park, distance, fit } = filters.elements;
    const text = query.value.trim().toLowerCase();
    screen.querySelector('[data-national-search]').href = '#us-trails' + searchParams({ query: query.value.trim() });
    for (const button of screen.querySelectorAll('[data-explore-tab]')) {
      button.setAttribute('aria-pressed', String(button.dataset.exploreTab === tab));
    }
    const chosen = tab === 'all' ? null : state[tab];
    const visible = trails.flatMap(trail => {
      const key = preferenceKey(trail);
      if (chosen ? !chosen.some(item => item.key === key) : state.skipped.some(item => item.key === key)) return [];
      const nearbyMiles = position ? distanceInMiles(trail.trailhead, position) : null;
      if (text && !`${trail.name} ${trail.park}`.toLowerCase().includes(text)) return [];
      if (park.value && trail.parkCode !== park.value) return [];
      if (distance.value && distance.value !== (trail.miles < 2 ? 'short' : trail.miles <= 5 ? 'medium' : 'long')) return [];
      if (fit.value) {
        if (!group.length) return [];
        const match = getFit(trail);
        if (fit.value === 'fits' ? match.issues.length : fit.value === 'limit' ? !match.issues.length
          : match.rating?.toLowerCase() !== fit.value) return [];
      }
      if (nearbyMiles != null && nearbyMiles > 40 && tab === 'all') return [];
      return [{ trail, nearbyMiles }];
    }).sort((a, b) => (a.nearbyMiles ?? 0) - (b.nearbyMiles ?? 0));
    const savedSegments = chosen?.filter(item => item.source === 'usgs' && (!text || item.name.toLowerCase().includes(text))) ?? [];
    const heading = tab === 'all' ? 'Verified hiking routes' : tab === 'favorites' ? 'Favorite trails' : 'Trails marked Would skip';
    results.innerHTML = `<h2>${heading}</h2>${visible.length || savedSegments.length ? `<div class="explore-grid">
      ${visible.map(item => renderCard(item.trail, item.nearbyMiles)).join('')}
      ${savedSegments.map(trail => `<article class="trail-card"><a class="trail-info" href="${detailLink(trail, 'usgs')}"><h3>${escapeHtml(trail.name)}</h3></a>
        <p>USGS trail segment</p><div class="trail-actions">${preferenceButtons(trail, state, 'usgs')}</div></article>`).join('')}</div>`
      : `<p class="card">${fit.value && !group.length ? 'Choose hikers to filter by group fit.'
        : tab !== 'all' && !chosen?.length ? 'This list is empty.' : 'No verified hikes match. Try changing the filters or browse U.S. trail segments.'}</p>`}`;
    const mapped = segments.filter(trail => !state.skipped.some(item => item.key === preferenceKey(trail, 'usgs')));
    nearResults.innerHTML = position && tab === 'all' && mapped.length ? `<h2>Nearby USGS segments</h2><p class="planning-note">Mapped segments within about 40 miles of the search area.</p>
      <div class="explore-grid">${mapped.map(trail => `<article class="trail-card"><a class="trail-info" href="${detailLink(trail, 'usgs')}"><h3>${escapeHtml(trail.name)}</h3></a>
        <p>${trail.miles == null ? 'Segment length unavailable' : trail.miles.toLocaleString('en-US', { maximumFractionDigits: 2 }) + ' mi mapped segment'}</p>
        <div class="trail-actions">${preferenceButtons(trail, state, 'usgs')}</div></article>`).join('')}</div>` : '';
  }

  screen.addEventListener('trail-preferences', draw, { signal });
  filters.addEventListener('submit', event => event.preventDefault());
  filters.addEventListener('input', draw);
  for (const button of screen.querySelectorAll('[data-explore-tab]')) {
    button.addEventListener('click', () => { tab = button.dataset.exploreTab; draw(); });
  }
  clear.addEventListener('click', () => {
    nearbyRequest?.abort();
    position = undefined;
    segments = [];
    clear.hidden = true;
    locate.disabled = false;
    status.textContent = '';
    draw();
  });
  locate.addEventListener('click', () => {
    if (!navigator.geolocation) {
      status.textContent = 'Nearby discovery is unavailable here. Choose a park above or browse by state.';
      return;
    }
    locate.disabled = true;
    status.textContent = 'Finding nearby trails…';
    navigator.geolocation.getCurrentPosition(async ({ coords }) => {
      if (signal.aborted) return;
      const controller = new AbortController();
      nearbyRequest = controller;
      position = { latitude: coords.latitude, longitude: coords.longitude };
      tab = 'all';
      clear.hidden = false;
      draw();
      try {
        const result = await nearbyTrails(position, AbortSignal.any([signal, controller.signal]));
        if (signal.aborted || controller.signal.aborted) return;
        segments = result;
        status.textContent = segments.length ? 'Showing trails in your approximate area.' : 'No USGS segments found nearby. You can still choose a park.';
        draw();
      } catch {
        if (!signal.aborted && !controller.signal.aborted) status.textContent = 'Nearby USGS results are unavailable. You can still choose a park.';
      } finally {
        if (!signal.aborted) locate.disabled = false;
      }
    }, error => {
      if (signal.aborted) return;
      locate.disabled = false;
      status.textContent = error.code === 1 ? 'Location permission was denied. Choose a park above or browse by state.'
        : 'Your location is unavailable. Choose a park above or browse by state.';
    }, { timeout: 12000, maximumAge: 120000 });
  });
  draw();
}
