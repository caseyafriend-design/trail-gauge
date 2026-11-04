import { regions, trails, ratings, factorNames, factorWeights, estimate, weatherPresets } from './model.js';
import { profiles, parkGuides, estimatedTime, groupDistance, groupTips, bestGroupFit } from './planning.js';
import { routes, mountMap, removeMap } from './map.js';

import { defaultPeople, demoHistory, escapeHtml, historyPage, profilePage, friendsPage, groupPage, chatPage } from './community.js';

const screen = document.querySelector('#screen');
const headerMenu = document.querySelector('.header-menu');
const storageKey = 'trail-gauge-v1';
function initialState() {
  const people = [...defaultPeople(), { id: 'demo-morgan', name: 'Morgan', kind: 'demo', fitness: 2, experience: 3 }];
  const memberIds = people.slice(0, 3).map(person => person.id);
  return { people, memberIds, groupName: 'Weekend crew',
    presets: [{ id: 'weekend', name: 'Weekend crew', memberIds }],
    chats: {},
    history: structuredClone(demoHistory), weather: {}, reviews: {}, compare: [] };
}

function load() {
  const defaults = initialState();
  try {
    const previous = JSON.parse(localStorage.getItem(storageKey));
    if (!previous) return defaults;
    if (!previous.people && Array.isArray(previous.group)) {
      const migrated = defaultPeople(previous.group);
      defaults.people = [...migrated, ...defaults.people.filter(person => person.kind === 'demo')];
      defaults.memberIds = migrated.map(person => person.id);
      defaults.presets[0].memberIds = defaults.memberIds;
    }
    if (!previous.history) {
      defaults.history.push(...Object.entries(previous.reviews ?? {}).map(([trailId, review]) => ({ ...review, trailId })));
    }
    const { group: legacyGroup, ...saved } = previous;
    return { ...defaults, ...saved };
  } catch {
    return defaults;
  }
}

let state = load();
const currentGroup = () => state.people.filter(person => state.memberIds.includes(person.id));

function save() {
  localStorage.setItem(storageKey, JSON.stringify(state));
}

const trailStats = trail => `${trail.miles} mi · ${trail.gain.toLocaleString('en-US')} ft gain`;
const trailLink = trail => `#trail/${trail.id}`;
const regionFor = trail => regions.find(region => region.id === trail.region);
const weatherFor = trail => state.weather[trail.id] ?? regionFor(trail).defaultWeather;
const resultFor = trail => estimate(trail, currentGroup(), weatherFor(trail));
const timeFor = trail => estimatedTime(trail, currentGroup(), weatherFor(trail));
const demoTrailIds = ['emerald-lake', 'queens-garden', 'angels-landing'];
const starsFor = trail => `${profiles[trail.id].stars.toFixed(1)} / 5 (${profiles[trail.id].reviews.toLocaleString('en-US')})`;
const level = value => value < 44 ? 'Easy' : value < 68 ? 'Moderate' : 'Hard';
const factorGroups = [
  { name: 'Trail', factors: [5, 0, 1, 6, 3] },
  { name: 'Weather', factors: [2, 8, 7] },
  { name: 'Group', factors: [4, 9, 10] }
];

function compareButton(trail) {
  const selected = state.compare.includes(trail.id);
  return `<button class="compare-toggle" type="button" data-compare="${trail.id}" aria-label="Compare ${trail.name}" aria-pressed="${selected}">${selected ? '✓ Added' : '+ Compare'}</button>`;
}

function factorBar(value) {
  const band = level(value);
  const label = band === 'Easy' ? 'Low' : band === 'Hard' ? 'High' : 'Medium';
  return `<span class="bar" aria-hidden="true"><i class="${band.toLowerCase()}" style="width:${value}%"></i></span><small>${label}</small>`;
}

function factorBreakdown(result) {
  return `<div class="factor-groups" aria-label="Difficulty factors">${factorGroups.map(({ name, factors }) => {
    const weight = factors.reduce((sum, index) => sum + factorWeights[index], 0);
    const average = factors.reduce((sum, index) => sum + result.factors[index] * factorWeights[index], 0) / weight;
    return `<details data-factor-group="${name}">
      <summary><span>${name}</span>${factorBar(average)}</summary>
      <ul class="factors">${factors.map(index => `<li><span>${factorNames[index]}</span>${factorBar(result.factors[index])}</li>`).join('')}</ul>
    </details>`;
  }).join('')}</div>`;
}

function hikesPage() {
  return `<div class="intro"><span class="eyebrow">Trail catalog</span>
    <h1>Find your group’s hike</h1><p>See how each trail might feel for your group. Add up to three hikes to compare.</p></div>
    <p class="compare-status" role="status"></p>
    ${regions.map(region => `<section class="region" aria-labelledby="region-${region.id}">
      <h2 id="region-${region.id}">${region.name}</h2><p>${region.description}</p>
      <div class="stack">${trails.filter(trail => trail.region === region.id).map(trail => {
      const result = resultFor(trail);
      return `<article class="trail-card">
        <a class="trail-info" href="${trailLink(trail)}"><div class="trail-top"><h3>${trail.name}</h3>
        <span class="level ${result?.rating.toLowerCase() ?? ''}">${result ? result.rating + ' for your group' : 'Group needed'}</span></div>
        <p>${trailStats(trail)} · ${timeFor(trail)}</p></a>
        <div class="trail-meta"><span>★ ${profiles[trail.id].stars.toFixed(1)} · ${profiles[trail.id].popularity}</span>${compareButton(trail)}</div>
      </article>`;
    }).join('')}</div></section>`).join('')}`;
}

function planningCard(trail) {
  const profile = profiles[trail.id];
  const facts = [
    ['Estimated time', timeFor(trail)],
    ['Group’s comfortable distance', currentGroup().length ? 'Up to ' + groupDistance(currentGroup()) + ' mi (estimate)' : 'Add hikers'],
    ['Route type', profile.route],
    ['Trail surface', profile.surface],
    ['Sample community rating', starsFor(trail)],
    ['Sample popularity', profile.popularity],
    ['Typical weekday crowds', profile.weekday],
    ['Typical weekend crowds', profile.weekend]
  ];
  return `<section class="card planning"><div class="trail-meta"><h2>Plan your hike</h2>${compareButton(trail)}</div>
    <p class="compare-status" role="status"></p>
    <dl class="planning-facts">${facts.map(([label, value]) => `<div><dt>${label}</dt><dd>${value}</dd></div>`).join('')}</dl>
    <p class="planning-note">Time reflects ${currentGroup().length ? 'your group’s pace and comfort limits' : 'an average pace'} and the selected weather, with a buffer for breaks.</p>
    <div class="group-tips" id="group-tips" tabindex="-1"><h2>Tips for ${escapeHtml(state.groupName)}</h2><ul>${groupTips(trail, currentGroup(), weatherFor(trail)).map(tip => `<li>${tip}</li>`).join('')}</ul></div>
    <p class="planning-note"><strong>Check before you go.</strong> ${profile.check}. <a href="${parkGuides[trail.id] ?? parkGuides[trail.region]}" target="_blank" rel="noopener">Official park guide ↗</a></p>
  </section>`;
}

function comparePage() {
  const selected = state.compare.map(id => trails.find(trail => trail.id === id)).filter(Boolean);
  const budget = state.fitBudget ?? 180;
  const group = currentGroup();
  const fit = bestGroupFit(selected, group, budget, weatherFor);
  const sharedWeather = selected.length && selected.every(trail => weatherFor(trail) === weatherFor(selected[0])) ? weatherFor(selected[0]) : '';
  const verdict = fit?.best
    ? `<h3>${fit.best.trail.name}</h3><p>${timeFor(fit.best.trail)}. It’s the longest option within your time, distance, and climb limits that rates Easy or Moderate for your group.</p>
       <a class="compare-toggle" href="${trailLink(fit.best.trail)}/tips">See tips for your group →</a>`
    : fit
      ? `<h3>No hike fits the current plan</h3><p>Closest option: ${fit.closest.trail.name} · ${timeFor(fit.closest.trail)}. It ${fit.closest.issues.join(', and ')}.</p>`
      : `<p>${!selected.length ? 'Add hikes to see how they fit your group.' : 'Choose who’s hiking to get a recommendation.'}</p>`;
  const rows = [
    ['For your group', trail => resultFor(trail)?.rating ?? 'Add hikers'],
    ['Sample trail difficulty', trail => trail.rating],
    ['Estimated time', timeFor],
    ['Distance', trail => `${trail.miles} mi`],
    ['Distance fit', trail => currentGroup().length ? (trail.miles <= groupDistance(currentGroup()) ? 'Within group range' : 'Above group range') : 'Add hikers'],
    ['Elevation gain', trail => `${trail.gain.toLocaleString('en-US')} ft`],
    ['High point', trail => trail.altitude ? `${trail.altitude.toLocaleString('en-US')} ft` : '—'],
    ['Route type', trail => profiles[trail.id].route],
    ['Trail surface', trail => profiles[trail.id].surface],
    ['Sample community rating', starsFor],
    ['Sample popularity', trail => profiles[trail.id].popularity],
    ['Weekday crowds', trail => profiles[trail.id].weekday],
    ['Weekend crowds', trail => profiles[trail.id].weekend],
    ['Sample weather', trail => weatherPresets[weatherFor(trail)].label],
    ['Check before you go', trail => profiles[trail.id].check]
  ];
  return `<a class="back" href="#hikes">← All hikes</a>
    <div class="intro"><span class="eyebrow">Trail planner</span><h1>Compare hikes</h1>
      <p>${selected.length < 2 ? 'Pick two or three trails from the catalog to compare them.' : 'Compare difficulty, time, crowds, and trail conditions. Scroll sideways to see more.'}</p></div>
    <section class="card fit-card"><span class="eyebrow">Group recommendation</span><h2>Best fit for your group</h2>
      <p>${escapeHtml(state.groupName)} · ${group.length} hikers · <a href="#group/compare">Edit group</a></p>
      <form id="fit-form" class="fields">
        <label>Time budget (minutes)<input name="budget" type="number" min="5" max="1440" required value="${budget}"></label>
        <label>Sample weather<select name="weather"><option value="">Keep trail settings</option>${Object.entries(weatherPresets).map(([id, preset]) =>
          `<option value="${id}"${sharedWeather === id ? ' selected' : ''}>${preset.label}</option>`).join('')}</select></label>
        <button class="button" type="submit">Update recommendation</button>
      </form>
      <div class="fit-verdict">${verdict}</div>
      <details class="fit-demo"><summary>Try the demo scenario</summary><p>Load a sample group, three trails, mild weather, and a 3-hour budget. Then try heavy rain.</p>
        <button type="button" class="compare-toggle" data-fit-demo>Load demo scenario</button></details>
    </section>
    ${selected.length ? `<div class="compare-scroll" tabindex="0" role="region" aria-label="Trail comparison table">
      <table><thead><tr><th scope="col">Metric</th>${selected.map(trail => `<th scope="col"><a href="${trailLink(trail)}">${trail.name}</a>${compareButton(trail)}</th>`).join('')}</tr></thead>
      <tbody>${rows.map(([label, value]) => `<tr><th scope="row">${label}</th>${selected.map(trail => `<td>${value(trail)}</td>`).join('')}</tr>`).join('')}</tbody></table>
    </div>` : '<a class="button" href="#hikes">Choose trails</a>'}`;
}

function mapPage(region) {
  const localTrails = trails.filter(trail => trail.region === region.id);
  return `<div class="intro"><span class="eyebrow">Trail map</span><h1>Explore by area</h1>
    <p>Hover over or tap a pin to see its route.</p></div>
    <label class="map-filter">Geographic area<select data-map-region>
    ${regions.map(area => `<option value="${area.id}"${area.id === region.id ? ' selected' : ''}>${area.name}</option>`).join('')}
    </select></label>
    <section class="map-panel" aria-label="${region.name} trails">
      <div id="trail-map" aria-label="Interactive map of ${region.name}">Loading map…</div>
      <div class="trail-meta"><p>Pins mark approximate trailheads. Dashed lines show illustrative routes.</p>
        <button type="button" class="compare-toggle" disabled data-fit-area>Fit area</button></div>
      <ul class="map-trails">${localTrails.map(trail => {
        const [lat, lon] = routes[trail.id][0];
        return `<li><a href="${trailLink(trail)}">${trail.name}</a><button type="button" class="compare-toggle" disabled data-map-route="${trail.id}" aria-label="Show route for ${trail.name}">Show route</button>
          <a class="map-external" href="https://www.openstreetmap.org/?mlat=${lat}&amp;mlon=${lon}#map=15/${lat}/${lon}" target="_blank" rel="noopener" aria-label="Open ${trail.name} trailhead in OpenStreetMap">↗</a></li>`;
      }).join('')}</ul>
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

function trailPage(trail) {
  const result = resultFor(trail);
  const weather = weatherFor(trail);
  const region = regionFor(trail);
  const conditions = weatherPresets[weather];
  return `<a class="back" href="#hikes">← All hikes</a>
    <article class="card detail"><span class="eyebrow">${region.name} · Group difficulty</span>
    <h1>${trail.name}</h1><p>${trailStats(trail)}${trail.altitude ? ` · ${trail.altitude.toLocaleString('en-US')} ft high point` : ''}</p>
    ${gauge(result?.score)}
    <div class="rating-pair" aria-live="polite">
      <div><strong>${trail.rating}</strong><span>Sample trail rating</span></div>
      <div><strong class="${result?.rating.toLowerCase() ?? ''}">${result?.rating ?? 'Add hikers'}</strong><span>For your group</span></div>
    </div>
    <div class="weather">
      <label>Sample weather<select data-weather>
        ${Object.entries(weatherPresets).map(([key, preset]) => `<option value="${key}"${key === weather ? ' selected' : ''}>${preset.label}</option>`).join('')}
      </select></label>
      <p>${conditions.temperature}°F · ${conditions.precipitation === 'None' ? 'Dry' : conditions.precipitation}</p>
    </div>
    ${result ? `${factorBreakdown(result)}<p class="reason">Biggest contributors: ${result.drivers.join(' and ')}.</p>`
      : '<p class="reason">Add a hiker to see your group’s estimate.</p>'}
    ${trail.note ? `<p class="reason trail-note">${trail.note}</p>` : ''}
    <a class="button" href="#group/${trail.id}">Edit group · ${currentGroup().length} ${currentGroup().length === 1 ? 'hiker' : 'hikers'}</a>
    <a class="button secondary" href="#review/${trail.id}">Review this hike</a>
    <a class="button secondary" href="#map/${trail.id}">View on map</a>
    </article>${planningCard(trail)}`;
}

function reviewPage(trail) {
  const review = state.reviews[trail.id];
  const predicted = review?.predicted ?? (review ? null : resultFor(trail)?.rating);
  return `<a class="back" href="${trailLink(trail)}">← ${trail.name}</a>
    <div class="intro"><span class="eyebrow">After the trail</span><h1>Review hike</h1><p>${trail.name}</p></div>
    <div class="card result"><h2>${review ? 'Saved review' : 'Group estimate'}</h2>
    <p>Estimated: ${predicted ?? 'Unavailable'}${review ? ` · Felt: ${review.rating}` : ''}</p>
    ${review ? `<p>Hardest factor: ${review.factor}</p>` : ''}</div>
    <form class="card" id="review-form">
      <label>Actual hiking time (minutes)<input name="minutes" type="number" min="1" max="1440" value="${review?.minutes ?? ''}"></label>
      <label>Review notes<textarea name="note" maxlength="500" rows="3">${escapeHtml(review?.note)}</textarea></label>
      <label>How hard did it feel?<select name="rating">${ratings.map(rating => `<option${rating === review?.rating ? ' selected' : ''}>${rating}</option>`).join('')}</select></label>
      <label>What made it hardest?<select name="factor">${[...factorNames, 'Other'].map(factor => `<option${factor === (review?.factor === 'Heat' ? 'Temperature extremes' : review?.factor) ? ' selected' : ''}>${factor}</option>`).join('')}</select></label>
      <button class="button" type="submit">Save review</button><p id="review-status" role="status"></p>
    </form>`;
}

function render(focus = false) {
  removeMap();
  const [page, trailId] = location.hash.slice(1).split('/');
  const trail = trails.find(item => item.id === trailId);
  document.querySelector('#group-link').toggleAttribute('aria-current', ['group', 'friends', 'profile', 'chat'].includes(page));
  document.querySelector('#history-link').toggleAttribute('aria-current', page === 'history');
  document.querySelector('#compare-link').toggleAttribute('aria-current', page === 'compare');
  document.querySelector('#map-link').toggleAttribute('aria-current', page === 'map');
  document.querySelector('#hikes-link').toggleAttribute('aria-current', !['group', 'friends', 'profile', 'chat', 'history', 'compare', 'map'].includes(page));
  document.querySelector('#compare-count').textContent = state.compare.length ? `(${state.compare.length})` : '';
  const current = document.querySelector('[aria-current]');
  current.setAttribute('aria-current', 'page');

  if (page === 'group') {
    screen.innerHTML = groupPage(trail, state, currentGroup(), trailId === 'compare');
  } else if (page === 'friends') {
    screen.innerHTML = friendsPage(state.people, state.memberIds);
  } else if (page === 'profile') {
    screen.innerHTML = profilePage(state.people.find(person => person.id === trailId));
  } else if (page === 'history') {
    screen.innerHTML = historyPage(state.history);
  } else if (page === 'chat') {
    const preset = state.presets.find(group => group.id === trailId);
    screen.innerHTML = preset ? chatPage(preset, state.chats[preset.id] ?? [], state.people.filter(person => preset.memberIds.includes(person.id))) : groupPage(null, state, currentGroup());
  } else if (page === 'map') {
    const region = (trail && regionFor(trail)) || regions.find(area => area.id === trailId) || regions[0];
    screen.innerHTML = mapPage(region);
    mountMap(screen.querySelector('#trail-map'), trails.filter(item => item.region === region.id), trail);
  } else if (page === 'compare') {
    screen.innerHTML = comparePage();
  } else if (page === 'trail' && trail) {
    screen.innerHTML = trailPage(trail);
  } else if (page === 'review' && trail) {
    screen.innerHTML = reviewPage(trail);
  } else {
    screen.innerHTML = hikesPage();
  }
  if (focus) screen.focus({ preventScroll: true });
  if (page === 'trail' && location.hash.endsWith('/tips')) {
    const tips = screen.querySelector('#group-tips');
    tips?.scrollIntoView({ block: 'start' });
    tips?.focus({ preventScroll: true });
  }
  return trail;
}

document.addEventListener('click', event => {
  const button = event.target.closest('button');
  if (!button) return;
  if (button.dataset.compare) {
    const id = button.dataset.compare;
    const selected = state.compare.includes(id);
    const status = screen.querySelector('.compare-status');
    if (!selected && state.compare.length >= 3) {
      if (status) status.textContent = 'You can compare up to three hikes. Remove one to add another.';
      return;
    }
    state.compare = selected ? state.compare.filter(item => item !== id) : [...state.compare, id];
    save();
    if (location.hash === '#compare') render(true);
    else {
      button.setAttribute('aria-pressed', String(!selected));
      button.textContent = selected ? '+ Compare' : '✓ Added';
      document.querySelector('#compare-count').textContent = state.compare.length ? `(${state.compare.length})` : '';
      if (status) status.textContent = selected ? 'Trail removed from comparison.' : 'Trail added. Open Compare to see your picks.';
    }
  } else if (button.hasAttribute('data-fit-demo')) {
    const demo = [
      { id: 'fit-demo-riley', name: 'Riley (demo)', kind: 'demo', fitness: 3, experience: 3 },
      { id: 'fit-demo-jules', name: 'Jules (demo)', kind: 'demo', fitness: 2, experience: 2 },
      { id: 'fit-demo-avery', name: 'Avery (demo)', kind: 'demo', fitness: 1, experience: 1, advanced: true, pace: 1.9, distance: 4, climb: 650, footing: 2, exposure: 2 }
    ];
    state.people = [...state.people.filter(person => !demo.some(hiker => hiker.id === person.id)), ...demo];
    state.memberIds = demo.map(person => person.id);
    state.groupName = 'Mixed-ability demo group';
    state.compare = [...demoTrailIds];
    state.fitBudget = 180;
    for (const id of demoTrailIds) state.weather[id] = 'Mild';
    save();
    render(true);
  } else if (button.dataset.useGroup) {
    const preset = state.presets.find(group => group.id === button.dataset.useGroup);
    state.groupName = preset.name;
    state.memberIds = [...preset.memberIds];
    save();
    const trail = trails.find(item => item.id === location.hash.split('/')[1]);
    if (location.hash === '#group/compare') location.hash = '#compare';
    else if (trail) location.hash = trailLink(trail);
    else {
      render(true);
      document.querySelector('#group-status').textContent = 'Group applied.';
    }
  } else if (button.hasAttribute('data-reset') && confirm('Reset Trail Gauge and remove your local changes?')) {
    state = initialState();
    save();
    if (location.hash === '#hikes') render(true);
    else location.hash = '#hikes';
  }
});

screen.addEventListener('change', event => {
  if (event.target.matches('select[data-map-region]')) {
    location.hash = '#map/' + event.target.value;
    return;
  }
  if (!event.target.matches('select[data-weather]')) return;
  const trailId = location.hash.split('/')[1];
  const expandedGroups = [...screen.querySelectorAll('details[open]')].map(group => group.dataset.factorGroup);
  state.weather[trailId] = event.target.value;
  save();
  render();
  screen.querySelectorAll('details').forEach(group => {
    group.open = expandedGroups.includes(group.dataset.factorGroup);
  });
  screen.querySelector('[data-weather]').focus();
});

screen.addEventListener('submit', event => {
  event.preventDefault();
  const trail = trails.find(item => item.id === location.hash.split('/')[1]);
  const form = event.target;
  const data = new FormData(form, event.submitter ?? undefined);
  if (form.id === 'fit-form') {
    state.fitBudget = Number(data.get('budget'));
    const weather = data.get('weather');
    if (weather) for (const id of state.compare) state.weather[id] = weather;
    save();
    render();
    screen.querySelector('#fit-form button').focus({ preventScroll: true });
  } else if (form.id === 'group-form') {
    const name = data.get('name').trim();
    if (!name) {
      document.querySelector('#group-status').textContent = 'Enter a group name.';
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
      document.querySelector('#group-status').textContent = 'Group preset saved.';
    } else {
      save();
      location.hash = location.hash === '#group/compare' ? '#compare' : trail ? trailLink(trail) : '#hikes';
    }
  } else if (form.id === 'profile-form') {
    const id = location.hash.split('/')[1];
    const existing = state.people.find(person => person.id === id);
    const name = data.get('name').trim();
    if (!name) {
      form.elements.name.value = '';
      form.elements.name.reportValidity();
      return;
    }
    const optional = key => data.get(key) === '' ? null : Number(data.get(key));
    const profile = { id: existing?.id ?? crypto.randomUUID(), name,
      kind: existing?.kind === 'self' ? 'self' : data.get('kind'), fitness: Number(data.get('fitness')),
      experience: Number(data.get('experience')), advanced: data.has('advanced'),
      distance: optional('distance'), climb: optional('climb'), pace: optional('pace'),
      footing: Number(data.get('footing')), exposure: Number(data.get('exposure')) };
    state.people = existing ? state.people.map(person => person.id === id ? profile : person) : [...state.people, profile];
    save();
    location.hash = '#friends';
  } else if (form.id === 'review-form' && trail) {
    const now = new Date();
    const date = [now.getFullYear(), now.getMonth() + 1, now.getDate()].map(value => String(value).padStart(2, '0')).join('-');
    const entry = { trailId: trail.id, date, group: state.groupName, rating: data.get('rating'), factor: data.get('factor'),
      predicted: resultFor(trail)?.rating ?? null, minutes: Number(data.get('minutes')) || null, note: data.get('note').trim() };
    state.reviews[trail.id] = entry;
    state.history = [entry, ...state.history];
    save();
    render();
    document.querySelector('#review-status').textContent = 'Review saved.';
    document.querySelector('#review-form button').focus();
  }
});

headerMenu.addEventListener('click', event => {
  if (!event.target.closest('a')) return;
  headerMenu.open = false;
  if (location.hash === '#group') screen.focus({ preventScroll: true });
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
render();
