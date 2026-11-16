import { escapeHtml } from './forms.js';

export function routeSummary(trail) {
  const facts = [
    ['Route scope', `${trail.routeType ?? 'Route type unverified'} · ${trail.miles} mi total itinerary`],
    ['Start', trail.trailheadName ?? 'Trailhead unverified'],
    ['Access', trail.access ?? 'Access details unverified. Check the land manager.'],
    ['Surface', trail.surface ?? 'Surface unverified'],
    ['Crossings', trail.crossings ?? 'Crossings unverified']
  ];
  return `<section aria-label="Route scope and access"><h2>Route at a glance</h2>
    <dl class="planning-facts">${facts.map(([label, value]) => `<div><dt>${label}</dt><dd>${escapeHtml(value)}</dd></div>`).join('')}</dl>
    <p class="planning-note">The itinerary is not a live access or accessibility assessment. Confirm current restrictions and conditions with the park.</p></section>`;
}
