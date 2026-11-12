import { escapeHtml } from './forms.js';
import { planningProfileFields } from './profile-planning.js';
import { reviewObservations } from './reviews.js';

export { escapeHtml };

const roleLabel = person => person.kind === 'self' ? 'You' : 'Local guest';

export function historyPage(history, trailFor) {
  const entries = [...history].sort((a, b) => (b.date ?? '').localeCompare(a.date ?? ''));
  return `<div class="intro"><span class="eyebrow">Hike journal</span><h1>Hike history</h1>
    <p>Compare how a hike felt with what Trail Gauge estimated before you went.</p></div>
    <div class="stack">${entries.length ? entries.map(entry => {
      const trail = trailFor(entry.trailId);
      const name = escapeHtml(trail?.name ?? entry.trailName ?? entry.trailId ?? 'Unknown hike');
      const date = entry.date ? new Date(entry.date + 'T12:00:00').toLocaleDateString('en-US', {dateStyle: 'medium'}) : 'Date unavailable';
      return `<article class="card journal"><span class="eyebrow">Your review · ${escapeHtml(date)}</span>
        <h2>${trail ? `<a href="#trail/${encodeURIComponent(entry.trailId)}">${name}</a>` : name}</h2>
        <p>${entry.group ? escapeHtml(entry.group) + ' · ' : ''}${entry.minutes ? escapeHtml(entry.minutes) + ' min elapsed · ' : ''}${entry.moving ? escapeHtml(entry.moving) + ' min moving · ' : ''}Felt ${escapeHtml(entry.rating)}${entry.predicted ? ' · Estimated ' + escapeHtml(entry.predicted) : ''}</p>
        <p>Hardest factor · ${escapeHtml(entry.factor)}</p>${entry.note ? `<p>${escapeHtml(entry.note)}</p>` : ''}
        ${reviewObservations(entry)}
        ${entry.id ? `<div class="trail-actions">${trail ? `<a class="compare-toggle" href="#review/${encodeURIComponent(entry.trailId)}/${encodeURIComponent(entry.id)}">Edit review</a>` : ''}
          ${entry.hikerId && entry.moving ? `<button type="button" class="compare-toggle" data-calibration="${escapeHtml(entry.id)}">${entry.calibrate === false ? 'Use for estimates' : 'Exclude from estimates'}</button>` : ''}</div>` : ''}</article>`;
    }).join('') : '<p>Your saved hike reviews will appear here.</p>'}</div>`;
}

const scale = (name, value, labels) => `<select name="${name}">${labels.map((label, i) =>
  `<option value="${i + 1}"${value === i + 1 ? ' selected' : ''}>${label}</option>`).join('')}</select>`;

export function profilePage(person, setup = false) {
  const profile = person ?? { name: '', fitness: 2, experience: 2 };
  return `${setup ? '' : '<a class="back" href="#friends">← Profiles and local guests</a>'}
    <div class="intro"><h1>${setup ? 'Set up your hiking profile' : person ? 'Edit hiker profile' : 'Add a local guest'}</h1>
    <p>A nickname, rough fitness, and experience are enough to start.</p></div>
    <form id="profile-form" class="card"${setup ? ' data-setup' : ''}>
      <label>Nickname<input name="name" maxlength="32" required value="${escapeHtml(profile.name)}"></label>
      <label>Physical fitness${scale('fitness', profile.fitness, ['Low', 'Average', 'High'])}</label>
      <label>Hiking experience${scale('experience', profile.experience, ['Beginner', 'Intermediate', 'Experienced'])}</label>
      <section class="profile-private"><h2>Private planning details</h2>
        <p class="planning-note">Optional. These details stay in this browser and help tailor your group’s plan.</p>
        ${planningProfileFields(profile)}
      </section>
      <p role="status" id="profile-status"></p>
      <button class="button">Save profile</button>
    </form>`;
}

export function friendsPage(people, currentIds) {
  return `<div class="intro"><span class="eyebrow">Hiker directory</span><h1>Profiles and local guests</h1>
    <p>Choose who’s coming under My Group. Guest profiles stay in this browser and need no account.</p></div>
    <div class="stack">${people.map(person => `<article class="card trail-meta">
      <div><h2>${escapeHtml(person.name)}</h2><p>${roleLabel(person)} · ${person.advanced ? 'Advanced' : 'Basic'}${currentIds.includes(person.id) ? ' · In current group' : ''}</p></div>
      <a class="compare-toggle" href="#profile/${encodeURIComponent(person.id)}">Edit<span class="sr-only"> ${escapeHtml(person.name)}</span></a></article>`).join('')}
      <a class="button" href="#profile">Add a local guest</a><a class="button secondary" href="#group">Manage current group</a></div>`;
}

export function groupPage(trail, state, group, fromCompare = false, fromPacking = false) {
  return `<a class="back" href="${fromCompare ? '#compare' : trail ? (fromPacking ? '#packing/' : '#trail/') + trail.id : '#explore'}">← ${fromCompare ? 'Compare' : trail?.name ?? 'Explore'}</a>
    <div class="intro"><span class="eyebrow">Hiking party</span><h1>My Group</h1><p>${group.length} selected · ${escapeHtml(state.groupName)}</p></div>
    <form id="group-form" class="card">
      <label>Group name<input name="name" maxlength="40" required value="${escapeHtml(state.groupName)}"></label>
      <fieldset class="member-picker"><legend>Group size and hikers</legend>
        ${state.people.length ? '' : '<p><a href="#profile/setup">Set up your profile</a> to choose who’s hiking.</p>'}
        ${state.people.map(person => `<label class="check-line"><input type="checkbox" name="member" value="${escapeHtml(person.id)}"${state.memberIds.includes(person.id) ? ' checked' : ''}><span>${escapeHtml(person.name)} <small class="member-role">${roleLabel(person)}</small></span></label>`).join('')}
      </fieldset>
      <button class="button" name="action" value="apply">Use this group</button>
      <button class="button secondary" name="action" value="preset">Save as group preset</button>
      <a class="button secondary" href="#friends">Profiles and local guests</a>
      <p id="group-status" role="status"></p>
    </form>
    <section class="card planning"><h2>Saved groups</h2>
      ${state.presets.length ? `<ul class="map-trails">${state.presets.map(preset => `<li><strong>${escapeHtml(preset.name)}</strong>
        <button type="button" class="compare-toggle" data-use-group="${escapeHtml(preset.id)}">Use group</button>
        </li>`).join('')}</ul>` : '<p>Save a preset to reuse a group.</p>'}
    </section>`;
}
