import { mountActivities, activityHistory, recordingTrailId } from './activities.js';
import { explorePage, mountExplore, preferenceButtons, preferenceKey } from './explore.js';
import { defaultTrip, packingCategories, packingSuggestions, tripKey } from './packing.js';
import { packingPage, packingForecastPanels, readTrip, updatePackingProgress } from './packing-page.js';
import { readPlanningProfile } from './profile-planning.js';
import { altitudeNotes, terrainPaceCost } from './personalization.js';
import { reviewPage, reviewRecord } from './reviews.js';
import { readNumber, readText } from './forms.js';
import { mountUSMap } from './us-map.js';
import { parseMapView } from './us-map-data.js';
import { mountUSSearch, mountUSSegment, usSearchPage, usSegmentPage } from './us-trail-pages.js';
import { searchOptions } from './us-trails.js';
import { regions, parks, legacyTrails, hasGeometry, loadCatalog } from './catalog.js';
import { factorNames, factorWeights, estimate, weatherStress } from './model.js';
import { estimatedTime, groupDistance, groupTips, bestGroupFit, timeRange, groupFit, duration } from './planning.js';
import { mountMap, removeMap } from './map.js';
import { escapeHtml, historyPage, profilePage, friendsPage, groupPage } from './community.js';
import { loadState, storageKey } from './state.js';
import { alertsMaxAge, fetchAlerts, fetchForecast, forecastFor, forecastMaxAge, forecastRequest, forecastSource,
  formatLocal, readForecast, writeForecast } from './conditions.js';

const screen = document.querySelector('#screen');
const headerMenu = document.querySelector('.header-menu');
const state = loadState(localStorage);
const trails = await loadCatalog();
const currentGroup = () => state.people.filter(person => state.memberIds.includes(person.id));
const verifiedTrail = id => trails.find(trail => trail.id === id);
const trailFor = id => verifiedTrail(id) ?? (Object.hasOwn(legacyTrails, id) ? { ...legacyTrails[id], id } : null);
const selectedTrails = () => state.compare.map(verifiedTrail).filter(Boolean);
const routeWeather = new Map();
const parkAlerts = new Map();
const forecastRequests = new Map();
const alertRequests = new Map();
let freshnessTimer;
let nationalRequest;
let reminderTimer;
let pendingReminder;
const lastRendered = new WeakMap();

function save() {
  try {
    localStorage.setItem(storageKey, JSON.stringify(state));
  } catch {
    const status = document.querySelector('#storage-status');
    status.textContent = 'This browser could not save your changes. They are available while this page is open.';
  }
}

const trailStats = trail => `${trail.miles} mi · ${trail.gain.toLocaleString('en-US')} ft gain`;
const trailLink = trail => `#trail/${encodeURIComponent(trail.id)}`;
const regionFor = trail => regions.find(region => region.id === trail.region);
const localSnapshot = trail => {
  if (!routeWeather.has(trail.id)) routeWeather.set(trail.id, { snapshot: readForecast(trail, localStorage) });
  return routeWeather.get(trail.id);
};
const contextFor = trail => ({ trip: state.trips[tripKey(trail, currentGroup())] ?? defaultTrip, history: state.history });
const conditionsFor = trail => {
  const { snapshot, status } = localSnapshot(trail);
  return forecastFor(trail, currentGroup(), state.hikePlan, snapshot, status, Date.now(), contextFor(trail));
};
const weatherFor = trail => conditionsFor(trail).weather ?? null;
const resultFor = trail => estimate(trail, currentGroup(), weatherFor(trail));
const timeFor = trail => estimatedTime(trail, currentGroup(), weatherFor(trail), contextFor(trail));
const fitFor = trail => groupFit(trail, currentGroup(), state.fitBudget ?? 180, weatherFor(trail), contextFor(trail));
const packingFor = trail => {
  const group = currentGroup();
  const context = contextFor(trail);
  const trip = context.trip;
  const key = tripKey(trail, group);
  const plan = state.packing[key] ?? {};
  const weather = weatherFor(trail);
  const time = timeRange(trail, group, weather, context);
  const start = state.hikePlan?.start;
  return { key, plan, trip, time, start, suggestions: packingSuggestions(trail, group, time, weather, trip, start, plan.waterEdits, context) };
};
const level = value => value < 44 ? 'Easy' : value < 68 ? 'Moderate' : 'Hard';
const factorGroups = [
  { name: 'Trail', factors: [4, 0, 1] },
  { name: 'Weather', factors: [2, 6, 7] },
  { name: 'Group', factors: [3, 8, 9] }
];

function compareButton(trail) {
  const selected = state.compare.includes(trail.id);
  return `<button class="compare-toggle" type="button" data-compare="${escapeHtml(trail.id)}" aria-label="Compare ${escapeHtml(trail.name)}" aria-pressed="${selected}">${selected ? '✓ Added' : '+ Compare'}</button>`;
}

function factorBar(value) {
  if (value === null) return '<small class="factor-unavailable">Unavailable</small>';
  const band = level(value);
  const label = band === 'Easy' ? 'Low' : band === 'Hard' ? 'High' : 'Medium';
  return `<span class="bar" aria-hidden="true"><i class="${band.toLowerCase()}" style="width:${value}%"></i></span><small>${label}</small>`;
}

function factorBreakdown(result) {
  return `<div class="factor-groups" aria-label="Difficulty factors">${factorGroups.map(({ name, factors }) => {
    const known = factors.filter(index => result.factors[index] !== null);
    const weight = known.reduce((sum, index) => sum + factorWeights[index], 0);
    const average = weight ? known.reduce((sum, index) => sum + result.factors[index] * factorWeights[index], 0) / weight : null;
    return `<details data-factor-group="${name}">
      <summary><span>${name}</span>${factorBar(average)}</summary>
      <ul class="factors">${factors.map(index => `<li><span>${factorNames[index]}</span>${factorBar(result.factors[index])}</li>`).join('')}</ul>
    </details>`;
  }).join('')}</div>`;
}

const browseUS = '<a class="button secondary browse-us" href="#us-trails">Browse U.S. trails</a>';

function exploreCard(trail, nearbyMiles) {
  const result = resultFor(trail);
  return `<article class="trail-card">
    <a class="trail-info" href="${trailLink(trail)}"><p class="trail-park">${trail.park}</p><div class="trail-top"><h3>${trail.name}</h3>
      <span class="level ${result?.rating.toLowerCase() ?? ''}">${result?.limits.length ? 'Firm limit' : result?.rating ?? 'Choose hikers'}</span></div>
      <p>${trailStats(trail)} · ${timeFor(trail)}${nearbyMiles == null ? '' : ' · ' + Math.round(nearbyMiles) + ' mi away'}</p></a>
    <div class="trail-actions">${compareButton(trail)}${preferenceButtons(trail, state)}</div>
  </article>`;
}

function planningFacts(trail) {
  const group = currentGroup();
  const weather = weatherFor(trail);
  const context = contextFor(trail);
  const time = timeRange(trail, group, weather, context);
  const altitude = altitudeNotes(trail, group);
  const outings = time.paces.flatMap(hiker => hiker.outings.map(record =>
    `${hiker.hiker.name} · ${record.title ?? 'Completed hike'} · ${record.date}`));
  const facts = [
    ['Moving time', `${duration(time.movingLow)}–${duration(time.movingHigh)}`],
    ['Planned breaks', duration(time.breaks)], ['Overnight stops', duration(time.stopMinutes)],
    ['Comfortable group distance', group.length ? 'Up to ' + groupDistance(group) + ' mi (estimate)' : 'Choose hikers'],
    ['Estimated pack load per hiker', context.trip.packWeight == null ? 'Unknown' : context.trip.packWeight + ' lb']
  ];
  return `<dl class="planning-facts">${facts.map(([label, value]) => `<div><dt>${label}</dt><dd>${value}</dd></div>`).join('')}</dl>
    <p class="planning-note">${group.length ? 'Uses the group’s slower estimated moving pace.' : 'Uses a reference moving pace.'}
      ${time.uncertain ? 'Lower confidence due to sparse hike records or terrain data.' : 'Estimate based on reported pace and known terrain.'}</p>
    ${outings.length ? `<details class="form-details"><summary>Comparable hikes used for pace</summary><ul>${outings.map(text => `<li>${escapeHtml(text)}</li>`).join('')}</ul></details>` : ''}
    <div class="group-tips" id="group-tips" tabindex="-1"><h3>Tips for ${escapeHtml(state.groupName)}</h3><ul>${groupTips(trail, group, weather).map(tip => `<li>${escapeHtml(tip)}</li>`).join('')}</ul></div>
    <p class="planning-note"><strong>Altitude</strong> · ${altitude.text}${altitude.high ? ' <a href="https://www.cdc.gov/yellow-book/hcp/environmental-hazards-risks/high-altitude-travel-and-altitude-illness.html" target="_blank" rel="noopener">CDC guidance ↗</a>' : ''}</p>`;
}

function mapPanel(localTrails, detail = false) {
  return `<div id="trail-map" aria-label="Interactive trail map">Loading map…</div>
    <p class="planning-note" data-basemap-status role="status"></p>
    <div class="trail-meta"><p>Pins mark the mapped trailheads. Lines show NPS trail geometry.</p>
      ${detail ? '' : '<button type="button" class="compare-toggle" disabled data-fit-area>Fit area</button>'}</div>
    ${detail ? '' : `<ul class="map-trails">${localTrails.map(trail => {
      const [lon, lat] = trail.trailhead ?? [];
      return `<li><a href="${trailLink(trail)}">${trail.name}</a>${hasGeometry(trail) ?
        `<button type="button" class="compare-toggle" disabled data-map-route="${trail.id}" aria-label="Show route for ${trail.name}">Show route</button>` : '<span>Geometry unavailable</span>'}
        ${Number.isFinite(lat) && Number.isFinite(lon) ? `<a class="map-external" href="https://www.openstreetmap.org/?mlat=${lat}&amp;mlon=${lon}#map=15/${lat}/${lon}" target="_blank" rel="noopener" aria-label="Open ${trail.name} trailhead in OpenStreetMap">↗</a>` : ''}</li>`;
    }).join('')}</ul>`}
    <p class="planning-note"><a href="https://www.openstreetmap.org/fixthemap" target="_blank" rel="noopener">Report a basemap issue ↗</a></p>`;
}

function planningCard(trail) {
  return `<section class="card planning">
    <h2>Route map</h2>
    <section class="detail-map" aria-label="Verified route map">
      ${mapPanel([trail], true)}
      <p class="planning-note"><a href="${escapeHtml(trail.geometryQuery)}" target="_blank" rel="noopener">NPS route geometry ↗</a></p>
    </section>
    <details class="form-details" open><summary>Surface, crossings and access</summary>
      <dl class="planning-facts">
        <div><dt>Surface</dt><dd>${trail.surface ?? 'Unavailable'}</dd></div>
        <div><dt>Crossings</dt><dd>${trail.crossings ?? 'Unverified'}</dd></div>
        <div><dt>Trailhead</dt><dd>${trail.trailheadName}</dd></div>
        <div><dt>Typical grade</dt><dd>${trail.typicalGrade == null ? 'Unavailable' : trail.typicalGrade + '%'}</dd></div>
      </dl>
      <p class="planning-note">${trail.access} ${trail.gainNote}</p>
      <p class="planning-note"><a href="${trail.statsSource}" target="_blank" rel="noopener">NPS trail information ↗</a>
        ${trail.guideSource ? ` · <a href="${trail.guideSource}" target="_blank" rel="noopener">NPS route guide ↗</a>` : ''}
        ${trail.upperPoint ? ` · <a href="${trail.upperPoint.source}" target="_blank" rel="noopener">USGS elevation sample ↗</a>` : ''}</p>
    </details>
    ${trail.photo ? `<figure class="trail-photo">
      <img src="photos/${trail.id}.jpg" alt="${escapeHtml(trail.photo.alt)}" loading="lazy" data-trail-photo>
      <figcaption>Photo · <a href="${trail.photo.source}" target="_blank" rel="noopener">${trail.photo.credit} ↗</a> · Public domain</figcaption>
    </figure>` : '<p class="planning-note">A photo with verified reuse rights is unavailable.</p>'}
    <div class="park-conditions" id="park-alerts">${alertsPanel(trail.parkCode)}</div>
  </section>`;
}

function planFields(required = false) {
  const plan = state.hikePlan;
  return `<label>Hike date<input name="date" type="date" value="${escapeHtml(plan?.date)}"${required ? ' required' : ''}></label>
    <label>Start time<input name="start" type="time" value="${escapeHtml(plan?.start)}"${required ? ' required' : ''}></label>`;
}

function compareVerdict(selected, group, budget) {
  const fit = bestGroupFit(selected, group, budget, weatherFor, contextFor);
  const note = selected.some(trail => !weatherFor(trail)) ? '<p class="fit-basis">Options with unavailable weather use terrain and group only.</p>' : '';
  if (fit?.best) {
    return `<h3>${fit.best.trail.name}</h3><p>${timeFor(fit.best.trail)}. It’s the longest option within your time, distance, and climb limits that rates Easy or Moderate for your group.</p>
      <a class="compare-toggle" href="${trailLink(fit.best.trail)}/tips">See tips for your group →</a>${note}`;
  }
  if (fit) {
    return `<h3>No hike fits the current plan</h3><p>Closest option: ${fit.closest.trail.name} · ${timeFor(fit.closest.trail)}. Reasons include ${escapeHtml(fit.closest.issues.join(' · '))}.</p>${note}`;
  }
  return `<p>${!selected.length ? 'Add hikes to see how they fit your group.' : 'Choose who’s hiking to get a recommendation.'}</p>`;
}

function comparisonTable(selected) {
  const renderRows = rows => rows.map(([label, value]) => `<tr><th scope="row">${label}</th>${selected.map(trail => `<td>${value(trail)}</td>`).join('')}</tr>`).join('');
  const rows = [
    ['Distance', trail => `${trail.miles} mi`],
    ['Elevation gain', trail => `${trail.gain.toLocaleString('en-US')} ft`],
    ['Estimated time', timeFor],
    ['Group difficulty', trail => {
      const fit = resultFor(trail);
      return fit ? `${fit.rating}${fit.limits.length ? ' · Firm limit' : ''}` : 'Choose hikers';
    }]
  ];
  const other = [
    ['Why it may not fit', trail => escapeHtml(fitFor(trail).issues.join(' · ')) || 'Within current limits'],
    ['Route type', trail => trail.routeType],
    ['Surface', trail => trail.surface ?? 'Unavailable'],
    ['Crossings', trail => trail.crossings ?? 'Unverified'],
    ['Altitude', trail => altitudeNotes(trail, currentGroup()).text],
    ['Weather', trail => `${weatherFor(trail) ? 'Forecast included' : 'Terrain and group only'}<br><a href="${trailLink(trail)}/forecast">View forecast</a>`],
    ['Trip settings', trail => `<a href="#packing/${trail.id}">Plan &amp; pack</a>`]
  ];
  const headers = controls => `<thead><tr><th scope="col">Metric</th>${selected.map(trail =>
    `<th scope="col"><a href="${trailLink(trail)}">${trail.name}</a>${controls ? compareButton(trail) : ''}</th>`).join('')}</tr></thead>`;
  return `<table>${headers(true)}<tbody>${renderRows(rows)}</tbody></table>
    <details class="compare-more"><summary>Terrain, conditions and group limits</summary><table>${headers(false)}<tbody>${renderRows(other)}</tbody></table></details>`;
}

function comparePage() {
  const selected = selectedTrails();
  const unavailable = state.compare.filter(id => !verifiedTrail(id));
  const budget = state.fitBudget ?? 180;
  const group = currentGroup();
  return `<a class="back" href="#explore">← Explore</a>
    <div class="intro"><span class="eyebrow">Trail planner</span><h1>Compare hikes</h1>
      <p>${selected.length < 2 ? 'Pick two or three trails from the catalog to compare them.' : 'Compare difficulty, time, and forecast conditions.'}</p></div>
    <section class="card fit-card"><span class="eyebrow">Group recommendation</span><h2>Best fit for your group</h2>
      <p>${escapeHtml(state.groupName)} · ${group.length} ${group.length === 1 ? 'hiker' : 'hikers'} · <a href="#group/compare">Edit group</a></p>
      <div class="fit-verdict" id="fit-verdict" aria-live="polite">${compareVerdict(selected, group, budget)}</div>
      <form id="fit-form" class="fields">
        <label class="full-width">Time budget (minutes)<input name="budget" type="number" min="5" max="10080" required value="${escapeHtml(budget)}"></label>
        ${planFields()}
        <p class="planning-note full-width">Start time is local to each trail. Set a date and time to include the forecast.</p>
        <button class="button" type="submit">Update recommendation</button>
        <p class="planning-note full-width" data-plan-status role="status"></p>
      </form>
    </section>
    ${selected.length ? `<div class="compare-scroll" id="comparison" tabindex="0" role="region" aria-label="Trail comparison table">${comparisonTable(selected)}</div>`
      : '<a class="button" href="#explore">Choose trails</a>'}
    ${unavailable.length ? `<section class="card unavailable-picks"><h2>Saved trails awaiting verification</h2>
      <ul class="map-trails">${unavailable.map(id => `<li><span>${escapeHtml(trailFor(id)?.name ?? id)}</span>
        <button type="button" class="compare-toggle" data-compare="${escapeHtml(id)}">Remove</button></li>`).join('')}</ul></section>` : ''}`;
}

function mapPage(region) {
  const regionPicker = `<label>Map view<select data-map-region>
    <option value="us"${region ? '' : ' selected'}>United States</option>
    ${regions.map(area => `<option value="${area.id}"${area.id === region?.id ? ' selected' : ''}>Verified hikes · ${area.name}</option>`).join('')}
    </select></label>`;
  if (region) {
    const localTrails = trails.filter(trail => trail.region === region.id);
    return `<div class="intro"><h1>${region.name} trail map</h1>
      <p>Hover over or tap a pin to see a verified hike.</p>${browseUS}</div>
      <div class="map-controls">${regionPicker}</div>
      <section class="map-panel" aria-label="${region.name} trails">${mapPanel(localTrails)}</section>`;
  }
  return `<div class="intro"><h1>U.S. trail map</h1>
    <p>Explore the USGS trail layer, including land, snow, and water routes.</p></div>
    <div class="map-controls">${regionPicker}
      <label>Jump to a state<select data-us-map-state disabled><option value="">Choose a state</option></select></label>
      <div class="map-actions"><a class="button secondary" href="#us-trails">Search trails</a>
        <button class="button secondary" type="button" data-us-map-reset disabled>U.S. overview</button></div></div>
    <section class="map-panel" aria-label="Nationwide trail map">
      <div id="trail-map" aria-label="Interactive U.S. trail map">Loading map…</div>
      <div class="us-map-legend"><span><i class="us-map-line-key" aria-hidden="true"></i>USGS trail lines</span><span>Blue pins mark verified hikes</span></div>
      <p class="planning-note" data-trail-layer-status role="status">Loading the nationwide map…</p>
      <button class="compare-toggle" type="button" data-trail-layer-retry hidden>Retry trail layer</button>
      <p class="planning-note" data-basemap-status role="status"></p>
      <p class="planning-note">Coverage varies by area. Check the trail type and local access before hiking.
        <a href="https://www.usgs.gov/national-digital-trails/qas-about-usgs-trail-data" target="_blank" rel="noopener">About USGS coverage ↗</a>
        · <a href="https://www.openstreetmap.org/fixthemap" target="_blank" rel="noopener">Report a basemap issue ↗</a></p>
    </section>`;
}

function gauge(score) {
  const angle = score === undefined ? 180 : 180 - score * 1.8;
  const radians = angle * Math.PI / 180;
  const x = 120 + 74 * Math.cos(radians);
  const y = 108 - 74 * Math.sin(radians);
  return `<svg class="gauge" viewBox="0 0 240 123" aria-hidden="true">
    <path d="M24 108a96 96 0 0 1 192 0" pathLength="100" fill="none" stroke="#ef7871" stroke-width="15"/>
    <path d="M24 108a96 96 0 0 1 192 0" pathLength="100" fill="none" stroke="#f5b648" stroke-width="15" stroke-dasharray="68 100"/>
    <path d="M24 108a96 96 0 0 1 192 0" pathLength="100" fill="none" stroke="#91bc5a" stroke-width="15" stroke-dasharray="44 100"/>
    ${score === undefined ? '' : `<line x1="120" y1="108" x2="${x}" y2="${y}" stroke="#e1e5d9" stroke-width="4" stroke-linecap="round"/><circle cx="120" cy="108" r="7" fill="#e1e5d9"/>`}
    </svg>`;
}

function difficultyPanel(trail) {
  const weather = weatherFor(trail);
  const result = resultFor(trail);
  const fit = fitFor(trail);
  return `<dl class="summary-stats">
      <div><dt>Distance</dt><dd>${trail.miles} mi</dd></div>
      <div><dt>Elevation gain</dt><dd>${trail.gain.toLocaleString('en-US')} ft</dd></div>
      <div><dt>Estimated time</dt><dd>${timeFor(trail)}</dd></div>
      <div><dt>Group difficulty</dt><dd class="${result?.rating.toLowerCase() ?? ''}">${result?.rating ?? 'Choose hikers'}</dd></div>
    </dl>
    ${result ? `<p class="fit-message ${fit.issues.length ? 'plan-alert' : ''}">${fit.issues.length
      ? `<strong>${result.limits.length ? 'Firm limit' : 'Check the fit'}</strong> · ${escapeHtml(fit.issues.join(' · '))}`
      : 'Fits your current group and time budget.'}</p>
      <details class="form-details"><summary>What affects group difficulty?</summary>
        ${gauge(result.score)}
        <p class="reason">${weather ? 'Includes the forecast.' : 'Terrain and group only.'}
          ${result.drivers.length ? ' Biggest contributors are ' + result.drivers.join(' and ') + '.' : ''}</p>
        ${factorBreakdown(result)}</details>`
      : '<p class="planning-note">Choose who’s hiking to see the group recommendation.</p>'}`;
}

const forecastMessages = {
  unplanned: 'Weather unavailable. Choose a date and start time.',
  pending: 'Fetching hourly forecast…',
  outside: 'Weather unavailable for the full hike window. It is outside the forecast coverage.',
  failed: 'Weather unavailable. Open-Meteo could not be reached or returned incomplete data.',
  coverage: 'Weather unavailable. The provider has incomplete coverage for this route or time.',
  invalid: 'Weather unavailable. Choose a valid local time outside the daylight saving clock change.',
  stale: 'Weather unavailable for estimates. The cached forecast is stale.'
};

const rangeText = (min, max, unit) => min === max ? `${Math.round(min)}${unit}`
  : `${Math.round(min)}–${Math.round(max)}${unit}`;

function forecastPanel(trail) {
  const view = conditionsFor(trail);
  const local = timestamp => formatLocal(timestamp, trail.parkCode);
  const weatherImpact = weatherStress(view.weather);
  const contributing = ['feels-like temperature', 'precipitation', 'wind gusts'].filter((_, index) => weatherImpact[index] > 0);
  const baseline = timeRange(trail, currentGroup(), null, contextFor(trail)).high;
  const added = view.weather ? timeRange(trail, currentGroup(), view.weather, contextFor(trail)).high - baseline : 0;
  return `<p role="status">${forecastMessages[view.status] ?? `Planned window · ${local(view.start)} to ${local(view.end)}`}</p>
    ${view.status === 'stale' ? `<p>Cached window · ${local(view.start)} to ${local(view.end)}</p>` : ''}
    <p>Source <a href="${forecastSource}" target="_blank" rel="noopener">Open-Meteo ↗</a>
      ${view.fetchedAt ? ` · Last fetched ${local(view.fetchedAt)}${view.stale || view.status === 'stale' ? ' · Stale cache' : ''}` : ''}</p>
    ${view.samples?.map(sample => `<details class="forecast-sample">
      <summary><strong>${sample.name}${sample.elevationFt ? ' · ' + sample.elevationFt.toLocaleString('en-US') + ' ft' : ''}</strong>
      <span>${rangeText(sample.tempMin, sample.tempMax, '°F')} · Feels ${rangeText(sample.apparentMin, sample.apparentMax, '°F')}</span>
      <span>Precipitation up to ${sample.probabilityMax}% · ${sample.types.join(', ')} · Gusts up to ${Math.round(sample.gustMax)} mph</span></summary>
      <div class="forecast-scroll" tabindex="0" role="region" aria-label="${sample.name} hourly forecast"><table>
        <thead><tr><th scope="col">Local hour</th><th scope="col">Temp</th><th scope="col">Feels</th><th scope="col">Precip.</th><th scope="col">Gusts</th></tr></thead>
        <tbody>${sample.hours.map(row => `<tr><th scope="row">${local(row.time)}</th><td>${Math.round(row.temperature)}°F</td><td>${Math.round(row.apparent)}°F</td>
          <td>${row.probability === null ? '—' : row.probability + '%'} · ${row.type}</td><td>${Math.round(row.gust)} mph</td></tr>`).join('')}</tbody></table></div>
      </details>`).join('') ?? ''}
    <p>${view.weather ? (contributing.length
      ? `The estimate allows for ${contributing.join(', ')}. The upper time estimate adds ${added} min after rounding.`
      : 'The sampled weather adds no extra time or difficulty.')
      : 'Any estimate uses terrain and group only.'}</p>
    <p>For closures, crossing conditions, and ice on the trail, check the official park conditions below.</p>`;
}

function alertsPanel(parkCode) {
  const park = parks[parkCode];
  const entry = parkAlerts.get(parkCode);
  const fresh = entry?.snapshot && Date.now() - entry.snapshot.fetchedAt < alertsMaxAge && entry.status !== 'failed';
  return `<h2>Official park conditions</h2>
    <p class="planning-note"><a href="${park.conditions}" target="_blank" rel="noopener">Current conditions and all alerts from NPS ↗</a></p>
    <p class="planning-note">${fresh ? `Park-wide alerts · Checked ${formatLocal(entry.snapshot.fetchedAt, parkCode)}`
      : entry?.status === 'pending' || !entry ? 'Checking park-wide alerts…' : 'Live park alerts are unavailable. Check the park conditions page.'}</p>
    ${fresh ? (entry.snapshot.alerts.length ? `<ul class="alert-list">${entry.snapshot.alerts.map(alert => {
      let url;
      try {
        const candidate = new URL(alert.url, park.conditions);
        if (alert.url && candidate.protocol === 'https:') url = candidate.href;
      } catch { /* The official conditions link is always available. */ }
      return `<li><strong>${escapeHtml(alert.category)} · ${escapeHtml(alert.title)}</strong>
        <p>${escapeHtml(alert.description)}</p>${url ? `<a href="${escapeHtml(url)}" target="_blank" rel="noopener">Alert details ↗</a>` : ''}</li>`;
    }).join('')}</ul>` : '<p class="planning-note">The NPS feed returned no active park-wide alerts.</p>') : ''}`;
}

function trailPage(trail) {
  const review = Object.hasOwn(state.reviews, trail.id);
  const size = currentGroup().length;
  return `<a class="back" href="#explore">← Explore</a>
    <article class="card detail"><p class="trail-park">${trail.park} · ${trail.routeType}</p>
    <h1>${trail.name}</h1>
    <div id="detail-estimate">${difficultyPanel(trail)}</div>
    <div class="trail-actions detail-actions">${compareButton(trail)}${preferenceButtons(trail, state)}</div>
    <p class="compare-status" role="status"></p>
    <div class="detail-links"><a class="button" href="#packing/${trail.id}">Plan &amp; pack</a><a class="button secondary" href="#record/${trail.id}">Record this hike</a>
      <a class="button secondary" href="#group/${trail.id}">Edit group · ${size} ${size === 1 ? 'hiker' : 'hikers'}</a></div>
    <details class="form-details"><summary>Moving time, breaks and altitude</summary><div id="trail-planning">${planningFacts(trail)}</div></details>
    <details class="form-details" id="forecast" tabindex="-1"><summary>Hike forecast</summary>
      <p class="planning-note">Set your start in ${parks[trail.parkCode].timeLabel}.</p>
      <form id="weather-form" class="fields">
        ${planFields(true)}
        <button class="button full-width" type="submit">Get forecast</button>
      </form>
      <div id="forecast-status">${forecastPanel(trail)}</div>
    </details>
    <div class="trail-actions">
      <a class="compare-toggle" href="#review/${trail.id}">${review ? 'View your review' : 'Log a completed hike'}</a>
      <a class="compare-toggle" href="#map/${trail.id}">View on region map</a>
    </div>
    </article>${planningCard(trail)}`;
}

function unavailableTrailPage(trail) {
  return `<a class="back" href="#explore">← Explore</a><div class="intro"><h1>${trail.name}</h1>
    <p>Verified route data is unavailable for this hike.</p></div>
    <section class="card">
      <p class="planning-note"><a href="${parks[trail.parkCode].conditions}" target="_blank" rel="noopener">Official park conditions ↗</a></p>
      ${Object.hasOwn(state.reviews, trail.id) ? `<a class="button secondary" href="#review/${trail.id}">View your review</a>` : ''}
    </section>`;
}

function reviewFor(trail, anchor) {
  if (anchor === 'new') return null;
  if (anchor) return state.history.find(item => item.trailId === trail.id && item.id === anchor) ?? null;
  return Object.hasOwn(state.reviews, trail.id) ? state.reviews[trail.id] : null;
}

function dateAt(trail) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: parks[trail.parkCode].timeZone,
    year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
}

function screenRoute() {
  const [path, query] = location.hash.slice(1).split('?');
  const [page, id, anchor] = path.split('/');
  const params = new URLSearchParams(query);
  let decoded;
  try { decoded = id && decodeURIComponent(id); } catch { /* Invalid route. */ }
  return { page: !page || page === 'hikes' ? 'explore' : page, id: decoded, anchor, params, trail: trailFor(decoded) };
}

function syncLive() {
  clearTimeout(freshnessTimer);
  const { page, trail } = screenRoute();
  const watched = page === 'compare' ? selectedTrails() : ['trail', 'packing'].includes(page) && verifiedTrail(trail?.id) ? [trail] : [];
  const update = (selector, html) => {
    const element = screen.querySelector(selector);
    if (!element || lastRendered.get(element) === html) return;
    lastRendered.set(element, html);
    const details = [...element.querySelectorAll('details')].map(item => item.open);
    const scrollLeft = element.scrollLeft;
    element.innerHTML = html;
    element.scrollLeft = scrollLeft;
    element.querySelectorAll('details').forEach((item, index) => { item.open = details[index] ?? false; });
  };
  if (page === 'trail' && watched.length) {
    update('#detail-estimate', difficultyPanel(trail));
    update('#forecast-status', forecastPanel(trail));
    update('#trail-planning', planningFacts(trail));
    update('#park-alerts', alertsPanel(trail.parkCode));
  } else if (page === 'packing' && watched.length && !screen.querySelector('#water-edit-form[data-dirty]')) {
    const { suggestions, plan, trip, start } = packingFor(trail);
    update('#packing-forecast-panels', packingForecastPanels(suggestions, plan, trip, start, parks[trail.parkCode].conditions));
  } else if (page === 'compare') {
    update('#fit-verdict', compareVerdict(watched, currentGroup(), state.fitBudget ?? 180));
    update('#comparison', comparisonTable(watched));
  }
  const expiration = watched.flatMap(item => {
    const snapshot = localSnapshot(item).snapshot;
    const request = forecastRequest(item, state.hikePlan);
    return [snapshot?.fetchedAt + forecastMaxAge, request.start + 60000];
  });
  if (page === 'trail' && watched.length) expiration.push(parkAlerts.get(trail.parkCode)?.snapshot?.fetchedAt + alertsMaxAge);
  const now = Date.now();
  const next = Math.min(...expiration.filter(time => time > now));
  if (Number.isFinite(next)) freshnessTimer = setTimeout(syncLive, next - now);
}

async function refreshForecast(trail, force = false) {
  if (forecastRequest(trail, state.hikePlan).status !== 'eligible' || forecastRequests.has(trail.id)) return;
  const entry = localSnapshot(trail);
  if (!force && entry.status !== 'failed' && entry.snapshot && Date.now() - entry.snapshot.fetchedAt < forecastMaxAge) return;
  entry.status = 'pending';
  const pending = fetchForecast(trail);
  forecastRequests.set(trail.id, pending);
  syncLive();
  try {
    entry.snapshot = await pending;
    writeForecast(trail, localStorage, entry.snapshot);
    entry.status = 'ready';
  } catch {
    entry.status = 'failed';
  } finally {
    forecastRequests.delete(trail.id);
    syncLive();
  }
}

async function refreshAlerts(parkCode) {
  if (alertRequests.has(parkCode)) return;
  const entry = parkAlerts.get(parkCode) ?? {};
  if (entry.snapshot && Date.now() - entry.snapshot.fetchedAt < alertsMaxAge) return;
  entry.status = 'pending';
  parkAlerts.set(parkCode, entry);
  const pending = fetchAlerts(parkCode);
  alertRequests.set(parkCode, pending);
  try {
    entry.snapshot = await pending;
    entry.status = 'ready';
  } catch {
    entry.status = 'failed';
  } finally {
    alertRequests.delete(parkCode);
    syncLive();
  }
}

function render(focus = false) {
  removeMap();
  nationalRequest?.abort();
  const { page, id, anchor, params, trail } = screenRoute();
  const verified = verifiedTrail(id);
  const setup = page === 'profile' && id === 'setup';
  screen.dataset.page = setup ? 'profile' : page;
  const profilePages = ['group', 'friends', 'profile'];
  const nav = profilePages.includes(page) ? 'group' : ['map', 'compare', 'history'].includes(page) ? page : 'explore';
  for (const link of document.querySelectorAll('.primary-nav a, #group-link, #history-link')) {
    if (link.id === nav + '-link') link.setAttribute('aria-current', 'page');
    else link.removeAttribute('aria-current');
  }
  document.querySelector('#active-group-name').textContent = state.groupName;
  document.querySelector('#group-link').setAttribute('aria-label', `My Group · ${state.groupName} · ${currentGroup().length} hikers`);
  document.querySelector('#compare-count').textContent = state.compare.length ? `(${state.compare.length})` : '';

  if (['record', 'activity', 'social', 'post'].includes(page)) {
    mountActivities(screen, page, id, verified ?? verifiedTrail(recordingTrailId(id)));
  } else if (setup) {
    screen.innerHTML = profilePage(null, true);
  } else if (page === 'us-trails') {
    screen.innerHTML = usSearchPage();
    nationalRequest = new AbortController();
    mountUSSearch(screen, searchOptions(params), trails, nationalRequest.signal, state);
  } else if (page === 'us-trail') {
    screen.innerHTML = usSegmentPage(searchOptions(params), parseMapView(params.get('map')));
    nationalRequest = new AbortController();
    mountUSSegment(screen, id, nationalRequest.signal, state);
  } else if (page === 'group') {
    screen.innerHTML = groupPage(verified, state, currentGroup(), id === 'compare', anchor === 'packing');
  } else if (page === 'friends') {
    screen.innerHTML = friendsPage(state.people, state.memberIds);
  } else if (page === 'profile') {
    screen.innerHTML = profilePage(state.people.find(person => person.id === id));
  } else if (page === 'history') {
    screen.innerHTML = historyPage(state.history, trailFor) + activityHistory();
  } else if (page === 'map') {
    const region = (verified && regionFor(verified)) || regions.find(area => area.id === id);
    screen.innerHTML = mapPage(region);
    if (region) mountMap(screen.querySelector('#trail-map'), trails.filter(item => item.region === region.id), verified);
    else mountUSMap(screen, trails, parseMapView(params.get('view')));
  } else if (page === 'compare') {
    screen.innerHTML = comparePage();
    selectedTrails().forEach(item => refreshForecast(item));
  } else if (page === 'trail' && trail) {
    screen.innerHTML = verified ? trailPage(trail) : unavailableTrailPage(trail);
    if (verified) {
      mountMap(screen.querySelector('#trail-map'), [trail], trail, true);
      refreshForecast(trail);
      refreshAlerts(trail.parkCode);
    }
  } else if (page === 'packing' && verified) {
    const { trip, plan, suggestions, time, start } = packingFor(verified);
    screen.innerHTML = packingPage(verified, currentGroup(), trip, plan, suggestions, time, start, parks[verified.parkCode].conditions);
    refreshForecast(verified);
  } else if (page === 'review' && trail && (verified || Object.hasOwn(state.reviews, trail.id))) {
    const review = reviewFor(trail, anchor);
    const predicted = review ? review.predicted : verified ? resultFor(verified)?.rating : null;
    screen.innerHTML = reviewPage(trail, review, state.people, dateAt(trail), predicted, Boolean(verified));
  } else {
    screen.innerHTML = explorePage(state, trails, params);
    nationalRequest = new AbortController();
    mountExplore(screen, state, trails, currentGroup(), fitFor, exploreCard, nationalRequest.signal);
  }
  syncLive();
  if (focus) screen.focus({ preventScroll: true });
  if (page === 'trail' && anchor) {
    const section = screen.querySelector(anchor === 'tips' ? '#group-tips' : '#forecast');
    const details = section?.closest('details');
    if (details) details.open = true;
    section?.scrollIntoView({ block: 'start' });
    section?.focus({ preventScroll: true });
  }
  scheduleReminder();
}

function showReminder() {
  const banner = document.querySelector('#reminder-banner');
  banner.hidden = !pendingReminder;
  banner.querySelector('span').textContent = pendingReminder ? `Packing and break check for ${pendingReminder.name}.` : '';
}

function scheduleReminder() {
  clearTimeout(reminderTimer);
  if (pendingReminder) return;
  const reminders = Object.entries(state.packing)
    .filter(([, plan]) => plan.reminder)
    .sort((a, b) => a[1].reminder.next - b[1].reminder.next);
  if (!reminders.length) return;
  const [key, plan] = reminders[0];
  reminderTimer = setTimeout(() => {
    const trail = verifiedTrail(plan.trailId);
    if (!trail) return;
    pendingReminder = { key, name: trail.name };
    plan.reminder.next = Date.now() + plan.reminder.interval * 60000;
    save();
    showReminder();
  }, Math.max(0, plan.reminder.next - Date.now()));
}

document.querySelector('#reminder-banner button').addEventListener('click', () => {
  pendingReminder = null;
  showReminder();
  scheduleReminder();
});

screen.addEventListener('error', event => {
  if (!event.target.matches?.('[data-trail-photo]')) return;
  const replacement = document.createElement('p');
  replacement.className = 'planning-note';
  replacement.textContent = 'Trail photo unavailable.';
  event.target.closest('figure')?.replaceWith(replacement);
}, true);

screen.addEventListener('click', event => {
  const button = event.target.closest('button');
  if (!button) return;
  const { page, id, anchor, trail } = screenRoute();
  if (button.dataset.trailPreference) {
    const list = button.dataset.trailPreference;
    const source = button.dataset.source;
    if (!['favorites', 'skipped'].includes(list) || !['verified', 'usgs'].includes(source)) return;
    const route = { id: button.dataset.routeId, name: button.dataset.routeName };
    const key = preferenceKey(route, source);
    const found = state[list].some(item => item.key === key);
    state[list] = found ? state[list].filter(item => item.key !== key) : [...state[list], { ...route, key, source }];
    save();
    if (['trail', 'us-trail'].includes(page)) {
      const controls = button.closest('.trail-actions');
      if (page === 'trail') controls.innerHTML = compareButton(trail) + preferenceButtons(trail, state);
      else controls.innerHTML = preferenceButtons(route, state, source);
      controls.querySelector(`[data-trail-preference="${list}"]`)?.focus();
    } else {
      screen.dispatchEvent(new Event('trail-preferences'));
    }
    const status = screen.querySelector('.compare-status');
    if (status) status.textContent = list === 'favorites' ? (found ? 'Removed from favorites.' : 'Saved to favorites.')
      : found ? 'Trail restored to Explore.' : 'Trail hidden. Undo from Would skip.';
  } else if (button.dataset.calibration) {
    const item = state.history.find(entry => entry.id === button.dataset.calibration);
    if (!item) return;
    item.calibrate = item.calibrate === false;
    if (state.reviews[item.trailId]?.id === item.id) state.reviews[item.trailId].calibrate = item.calibrate;
    save();
    button.textContent = item.calibrate ? 'Exclude from estimates' : 'Use for estimates';
  } else if (button.dataset.compare) {
    const routeId = button.dataset.compare;
    const selected = state.compare.includes(routeId);
    const status = screen.querySelector('.compare-status');
    if (!selected && state.compare.length >= 3) {
      if (status) status.textContent = 'You can compare up to three hikes. Remove one to add another.';
      return;
    }
    state.compare = selected ? state.compare.filter(item => item !== routeId) : [...state.compare, routeId];
    save();
    if (page === 'compare') render(true);
    else {
      button.setAttribute('aria-pressed', String(!selected));
      button.textContent = selected ? '+ Compare' : '✓ Added';
      document.querySelector('#compare-count').textContent = state.compare.length ? `(${state.compare.length})` : '';
      if (status) status.textContent = selected ? 'Trail removed from comparison.' : 'Trail added. Open Compare to see your picks.';
    }
  } else if (button.dataset.useGroup) {
    const preset = state.presets.find(group => group.id === button.dataset.useGroup);
    if (!preset) return;
    state.groupName = preset.name;
    state.memberIds = [...preset.memberIds];
    save();
    if (id === 'compare') location.hash = '#compare';
    else if (trail) location.hash = anchor === 'packing' ? '#packing/' + trail.id : trailLink(trail);
    else {
      render(true);
      screen.querySelector('#group-status').textContent = 'Group applied.';
    }
  }
});

screen.addEventListener('input', event => {
  event.target.closest('#water-edit-form')?.setAttribute('data-dirty', '');
  const form = event.target.closest('#profile-form');
  if (!form) return;
  const changed = event.target.name;
  if (['allergens', 'diet', 'snack'].includes(changed)) form.elements.ingredients.checked = false;
  if (['allergens', 'diet', 'meal'].includes(changed)) form.elements.mealIngredients.checked = false;
});

screen.addEventListener('change', event => {
  if (event.target.matches('select[data-map-region]')) location.hash = '#map/' + event.target.value;
  if (event.target.matches('#packing-items input[name=packed]')) {
    const { trail } = screenRoute();
    const { plan } = packingFor(trail);
    const item = plan.entries.find(entry => entry.id === event.target.value);
    if (item) item.packed = event.target.checked;
    save();
    updatePackingProgress(screen.querySelector('#pack-progress'), plan.entries);
  }
});

screen.addEventListener('submit', event => {
  if (event.defaultPrevented) return;
  event.preventDefault();
  const { id, anchor, trail } = screenRoute();
  const form = event.target;
  const data = new FormData(form, event.submitter ?? undefined);
  if (form.id === 'fit-form' || form.id === 'weather-form') {
    const date = data.get('date');
    const start = data.get('start');
    if (Boolean(date) !== Boolean(start)) {
      form.querySelector('[data-plan-status]').textContent = 'Enter both a hike date and a start time.';
      return;
    }
    state.hikePlan = date && start ? { date, start } : null;
    if (form.id === 'fit-form') {
      state.fitBudget = Number(data.get('budget'));
      form.querySelector('[data-plan-status]').textContent = '';
      selectedTrails().forEach(item => refreshForecast(item));
    } else if (trail) {
      refreshForecast(trail, true);
      refreshAlerts(trail.parkCode);
    }
    save();
    syncLive();
  } else if (form.id === 'group-form') {
    const name = data.get('name').trim();
    if (!name) {
      screen.querySelector('#group-status').textContent = 'Enter a group name.';
      return;
    }
    state.groupName = name;
    state.memberIds = data.getAll('member');
    if (data.get('action') === 'preset') {
      const existing = state.presets.find(group => group.name.toLowerCase() === name.toLowerCase());
      const preset = { id: existing?.id ?? crypto.randomUUID(), name, memberIds: [...state.memberIds] };
      state.presets = [...state.presets.filter(group => group.id !== preset.id), preset];
      save();
      render(true);
      screen.querySelector('#group-status').textContent = 'Group preset saved.';
    } else {
      save();
      location.hash = id === 'compare' ? '#compare' : trail ? (anchor === 'packing' ? '#packing/' + trail.id : trailLink(trail)) : '#explore';
    }
  } else if (form.id === 'profile-form') {
    const existing = state.people.find(person => person.id === id);
    const setup = form.hasAttribute('data-setup');
    const name = data.get('name').trim();
    if (!name) {
      form.elements.name.value = '';
      form.elements.name.reportValidity();
      return;
    }
    const planning = readPlanningProfile(data);
    if (planning.recent?.moving && planning.recent.minutes && planning.recent.moving > planning.recent.minutes) {
      screen.querySelector('#profile-status').textContent = 'Moving time cannot exceed elapsed time.';
      return;
    }
    const profile = { ...existing, id: existing?.id ?? crypto.randomUUID(), name,
      kind: setup || existing?.kind === 'self' ? 'self' : 'local',
      fitness: Number(data.get('fitness')), experience: Number(data.get('experience')), planning,
      advanced: Boolean(existing?.advanced || planning.pace || planning.recent || planning.maxMiles != null
        || planning.maxGain != null || planning.avoid.length) };
    state.people = existing ? state.people.map(person => person.id === id ? profile : person) : [...state.people, profile];
    if (setup) state.memberIds = [...state.memberIds, profile.id];
    save();
    const next = setup ? '#explore' : '#friends';
    if (location.hash === next) render(true);
    else location.hash = next;
  } else if (form.id === 'review-form' && trail) {
    const previous = reviewFor(trail, anchor);
    const record = reviewRecord(data);
    const status = screen.querySelector('#review-status');
    if (record.moving && record.minutes && record.moving > record.minutes) {
      status.textContent = 'Moving time cannot exceed elapsed time.';
      return;
    }
    if (record.reception && !record.reception.carrier) {
      status.textContent = 'Enter a carrier for the reception observation.';
      return;
    }
    const verified = verifiedTrail(trail.id);
    const plan = verified ? state.packing[tripKey(verified, currentGroup())] : null;
    const planned = previous?.hikerId === record.hikerId && previous?.planned
      ? previous.planned : (plan?.estimateDate <= record.date ? plan.estimates?.find(item => item.hikerId === record.hikerId) : null) ?? null;
    const entry = { ...previous, ...record, id: previous?.id ?? crypto.randomUUID(),
      trailId: trail.id, title: trail.name, group: state.groupName, planned,
      terrainCost: verified ? terrainPaceCost(verified, record.packWeight) : null,
      predicted: previous ? previous.predicted : verified ? resultFor(verified)?.rating ?? null : null };
    if (!anchor || anchor === 'new' || state.reviews[trail.id]?.id === entry.id) state.reviews[trail.id] = entry;
    const oldIndex = state.history.findIndex(item => previous?.id ? item.id === previous.id
      : previous && item.trailId === trail.id && item.date === previous.date && item.note === previous.note);
    if (oldIndex < 0) state.history.unshift(entry);
    else state.history.splice(oldIndex, 1, entry);
    save();
    if (anchor === 'new') {
      history.replaceState(null, '', `#review/${trail.id}/${entry.id}`);
    }
    render();
    screen.querySelector('#review-status').textContent = 'Review saved in this browser.';
  } else if (trail && verifiedTrail(trail.id) && ['trip-form', 'water-edit-form', 'packing-items', 'add-packing-item', 'reminder-form'].includes(form.id)) {
    savePackingForm(trail, form, data);
  }
});

function savePackingForm(trail, form, data) {
  const { key, plan, trip, suggestions } = packingFor(trail);
  if (form.id === 'trip-form') {
    state.trips[key] = readTrip(data, trip);
  } else if (form.id === 'water-edit-form') {
    const edits = {};
    for (const person of suggestions.water) {
      const id = person.hiker.id;
      const low = readNumber(data, 'low-' + id);
      const high = readNumber(data, 'high-' + id);
      if ((low ?? person.suggestedLow) > (high ?? Math.max(low ?? 0, person.suggestedHigh))) {
        screen.querySelector('#water-edit-status').textContent = 'A high estimate must be at least as large as the low estimate.';
        return;
      }
      if (low != null || high != null) edits[id] = { low, high };
    }
    plan.waterEdits = edits;
  } else if (form.id === 'packing-items') {
    const remove = readText(data, 'remove');
    const packed = new Set(data.getAll('packed'));
    const items = (plan.entries ?? []).filter(item => item.id !== remove).map(item => ({ ...item,
      name: readText(data, 'name-' + item.id) || item.name,
      amount: readText(data, 'amount-' + item.id), packed: packed.has(item.id) }));
    if (data.get('action') === 'suggest') {
      const names = new Set(items.map(item => item.category + ':' + item.name.toLowerCase()));
      for (const item of suggestions.entries) {
        if (!names.has(item.category + ':' + item.name.toLowerCase())) {
          items.push({ ...item, id: crypto.randomUUID(), packed: false });
        }
      }
    }
    plan.entries = items;
  } else if (form.id === 'add-packing-item') {
    const category = readText(data, 'category');
    const name = readText(data, 'name');
    if (!name || !Object.hasOwn(packingCategories, category)) return;
    plan.entries = [...(plan.entries ?? []), { id: crypto.randomUUID(), category, name, amount: readText(data, 'amount'), packed: false }];
  } else if (form.id === 'reminder-form') {
    if (data.get('action') === 'stop') {
      delete plan.reminder;
      if (pendingReminder?.key === key) {
        pendingReminder = null;
        showReminder();
      }
    } else {
      const interval = readNumber(data, 'interval');
      if (!(interval >= 1 && interval <= 240)) {
        form.elements.interval.required = true;
        form.elements.interval.reportValidity();
        return;
      }
      plan.reminder = { interval, next: Date.now() + interval * 60000 };
    }
  }
  plan.trailId = trail.id;
  state.packing[key] = plan;
  if (form.id === 'trip-form' || form.id === 'water-edit-form' || data.get('action') === 'suggest') {
    const refreshed = packingFor(trail).suggestions;
    plan.estimateDate = dateAt(trail);
    plan.estimates = refreshed.water.map((water, index) => ({
      hikerId: water.hiker.id, waterLow: water.low, waterHigh: water.high,
      snack: refreshed.food[index].snack, portions: refreshed.food[index].portions
    }));
  }
  save();
  const old = document.getElementById(form.id);
  const open = [...old.querySelectorAll('details')].map(details => details.open);
  const scroll = window.scrollY;
  render();
  document.getElementById(form.id)?.querySelectorAll('details').forEach((details, index) => { details.open = open[index]; });
  window.scrollTo(0, scroll);
}

headerMenu.addEventListener('click', event => {
  if (event.target.closest('a')) headerMenu.open = false;
});
document.addEventListener('click', event => {
  if (headerMenu.open && !headerMenu.contains(event.target)) headerMenu.open = false;
});
document.addEventListener('keydown', event => {
  if (event.key !== 'Escape' || !headerMenu.open) return;
  headerMenu.open = false;
  headerMenu.querySelector('summary').focus();
});
window.addEventListener('hashchange', () => {
  headerMenu.open = false;
  render(true);
});
window.addEventListener('focus', syncLive);
render();
