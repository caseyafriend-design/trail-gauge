import { hikers, trails } from './model.js';

export const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, character =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]);

export const demoHistory = [
  { trailId: 'emerald-lake', date: '2026-09-19', predicted: 'Moderate', rating: 'Moderate', factor: 'Altitude', minutes: 165, note: 'We slowed down near the last lake and took a snack break.', group: 'Weekend crew', sample: true },
  { trailId: 'riverside-walk', date: '2026-08-23', predicted: 'Easy', rating: 'Easy', factor: 'Temperature extremes', minutes: 82, note: 'Starting early helped us beat the heat.', group: 'Easy outings', sample: true },
  { trailId: 'watchman', date: '2026-07-11', predicted: 'Moderate', rating: 'Hard', factor: 'Elevation gain', minutes: 155, note: 'The group needed more breaks on the climb than expected.', group: 'Weekend crew', sample: true }
];

export function defaultPeople(group = hikers) {
  return group.map((person, index) => ({ ...person, id: 'hiker-' + index,
    kind: index === 0 ? 'self' : index === 1 && group === hikers ? 'demo' : 'local' }));
}

const roleLabel = person => ({ self: 'You', demo: 'Demo app friend', local: 'Local guest' })[person.kind];

export function historyPage(history) {
  const entries = [...history].sort((a, b) => (b.date ?? '').localeCompare(a.date ?? ''));
  return `<div class="intro"><span class="eyebrow">Hike journal</span><h1>Hike history</h1>
    <p>Compare how a hike felt with what Trail Gauge estimated before you went.</p></div>
    <div class="stack">${entries.map(entry => {
      const trail = trails.find(item => item.id === entry.trailId);
      if (!trail) return '';
      const date = entry.date ? new Date(entry.date + 'T12:00:00').toLocaleDateString('en-US', {dateStyle: 'medium'}) : 'Date unavailable';
      return `<article class="card journal"><span class="eyebrow">${entry.sample ? 'Sample hike · ' : ''}${date}</span>
        <h2><a href="#trail/${trail.id}">${trail.name}</a></h2>
        <p>${entry.group ? escapeHtml(entry.group) + ' · ' : ''}${entry.minutes ? entry.minutes + ' min · ' : ''}Felt ${escapeHtml(entry.rating)}${entry.predicted ? ' · Estimated ' + escapeHtml(entry.predicted) : ''}</p>
        <p>Hardest factor: ${escapeHtml(entry.factor)}</p>${entry.note ? `<p>${escapeHtml(entry.note)}</p>` : ''}</article>`;
    }).join('')}</div>`;
}

const scale = (name, value, labels) => `<select name="${name}">${labels.map((label, i) =>
  `<option value="${i + 1}"${value === i + 1 ? ' selected' : ''}>${label}</option>`).join('')}</select>`;

export function profilePage(person) {
  const profile = person ?? { name: '', kind: 'local', fitness: 2, experience: 2 };
  return `<a class="back" href="#friends">← Profiles and friends</a>
    <div class="intro"><h1>${person ? 'Edit hiker profile' : 'Add a friend'}</h1>
    <p>Use the basic ratings, or add specifics to improve the estimates.</p></div>
    <form id="profile-form" class="card">
      <label>Name<input name="name" maxlength="32" required value="${escapeHtml(profile.name)}"></label>
      ${profile.kind === 'self' ? '' : `<label>Profile type<select name="kind"><option value="local">Local guest</option><option value="demo"${profile.kind === 'demo' ? ' selected' : ''}>Demo app friend</option></select></label>`}
      <label>Physical fitness${scale('fitness', profile.fitness, ['Low', 'Average', 'High'])}</label>
      <label>Hiking experience${scale('experience', profile.experience, ['Beginner', 'Intermediate', 'Experienced'])}</label>
      <details class="profile-advanced"${profile.advanced ? ' open' : ''}><summary>Advanced hiker details</summary>
        <label class="check-line"><input name="advanced" type="checkbox"${profile.advanced ? ' checked' : ''}>Use advanced details</label>
        <label>Comfortable distance (mi)<input name="distance" type="number" min="0.5" max="40" step="0.5" placeholder="Optional" value="${profile.distance ?? ''}"></label>
        <label>Comfortable elevation gain (ft)<input name="climb" type="number" min="0" max="10000" step="50" placeholder="Optional" value="${profile.climb ?? ''}"></label>
        <label>Typical pace on flat ground (mph)<input name="pace" type="number" min="0.5" max="5" step="0.1" placeholder="Optional" value="${profile.pace ?? ''}"></label>
        <label>Uneven footing comfort${scale('footing', profile.footing ?? 2, ['Prefer smooth paths', 'Okay with roots and rocks', 'Comfortable on rough terrain'])}</label>
        <label>Steep terrain comfort${scale('exposure', profile.exposure ?? 2, ['Prefer gentler slopes', 'Okay with steep sections', 'Comfortable on steep terrain'])}</label>
      </details>
      <button class="button">Save profile</button>
    </form>`;
}

export function friendsPage(people, currentIds) {
  return `<div class="intro"><span class="eyebrow">Hiker directory</span><h1>Profiles and friends</h1>
    <p>Save people here and choose who’s coming under My Group. Local profiles work for friends without the app.</p></div>
    <div class="stack">${people.map(person => `<article class="card trail-meta">
      <div><h2>${escapeHtml(person.name)}</h2><p>${roleLabel(person)} · ${person.advanced ? 'Advanced' : 'Basic'}${currentIds.includes(person.id) ? ' · In current group' : ''}</p></div>
      <a class="compare-toggle" href="#profile/${person.id}">Edit<span class="sr-only"> ${escapeHtml(person.name)}</span></a></article>`).join('')}
      <a class="button" href="#profile">Add a friend</a><a class="button secondary" href="#group">Manage current group</a></div>`;
}

export function groupPage(trail, state, group, fromCompare = false) {
  return `<a class="back" href="${fromCompare ? '#compare' : trail ? '#trail/' + trail.id : '#hikes'}">← ${fromCompare ? 'Compare' : trail?.name ?? 'All hikes'}</a>
    <div class="intro"><span class="eyebrow">Hiking party</span><h1>My Group</h1><p>${group.length} selected · ${escapeHtml(state.groupName)}</p></div>
    <form id="group-form" class="card">
      <label>Group name<input name="name" maxlength="40" required value="${escapeHtml(state.groupName)}"></label>
      <fieldset class="member-picker"><legend>Who’s hiking?</legend>
        ${state.people.map(person => `<label class="check-line"><input type="checkbox" name="member" value="${person.id}"${state.memberIds.includes(person.id) ? ' checked' : ''}><span>${escapeHtml(person.name)} <small class="member-role">${roleLabel(person)}</small></span></label>`).join('')}
      </fieldset>
      <button class="button" name="action" value="apply">Use this group</button>
      <button class="button secondary" name="action" value="preset">Save as group preset</button>
      <a class="button secondary" href="#friends">Profiles and friends</a>
      <p id="group-status" role="status"></p>
    </form>
    <section class="card planning"><h2>Saved groups</h2>
      ${state.presets.length ? `<ul class="map-trails">${state.presets.map(preset => `<li><strong>${escapeHtml(preset.name)}</strong>
        <button type="button" class="compare-toggle" data-use-group="${preset.id}">Use group</button>
        <a class="compare-toggle" href="#chat/${preset.id}">View thread</a></li>`).join('')}</ul>` : '<p>Save a preset to reuse a group.</p>'}
    </section>`;
}

const sampleThread = [
  { sender: 'Sam', text: 'How about an early start on Saturday?' },
  { sender: 'Alex', role: 'self', text: 'Eight works. Emerald Lake looks like a better fit for our three-hour window.' },
  { sender: 'Sam', text: 'Sounds good. Let’s meet at the trailhead and keep a shorter hike as a backup.' }
];

export function chatPage(preset, messages, people) {
  const sample = preset.id === 'weekend';
  const thread = sample ? sampleThread : messages;
  return `<a class="back" href="#group">← My Group</a><div class="intro"><span class="eyebrow">Archived conversation</span>
    <h1>${escapeHtml(preset.name)}</h1><p>${sample ? 'Sample thread · September 18, 2026 · ' : ''}Read only</p></div>
    <details class="card chat-roster"><summary>Group members · ${people.length}</summary>
      <ul>${people.map(person => `<li>${escapeHtml(person.name)} <small class="member-role">${roleLabel(person)}${person.kind === 'local' ? ' · Planning only' : ''}</small></li>`).join('')}</ul></details>
    <div class="stack chat-thread" aria-label="Archived messages">${thread.map(message => `<article class="card journal chat-bubble${message.role === 'self' ? ' own-message' : ''}"><h2>${escapeHtml(message.sender)}</h2><p>${escapeHtml(message.text)}</p></article>`).join('') || '<p>No archived messages for this group.</p>'}</div>`;
}
