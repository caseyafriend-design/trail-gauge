import { escapeHtml } from './forms.js';

export function difficultyDial(result, trail, groupName) {
  const score = result?.score;
  const angle = (180 - (score ?? 0) * 1.8) * Math.PI / 180;
  const factors = [['Steepness', 1], ['Heat / feels-like', 2], ['Terrain / route fit', 9], ['Group fitness demand', 3]];
  return `<section class="difficulty-card" aria-label="Difficulty for your group">
    <div class="dial-reading"><svg class="gauge" viewBox="0 0 240 123" aria-hidden="true">
      <path d="M24 108a96 96 0 0 1 192 0" pathLength="100" fill="none" stroke="#ef7871" stroke-width="15"/>
      <path d="M24 108a96 96 0 0 1 192 0" pathLength="100" fill="none" stroke="#f5b648" stroke-width="15" stroke-dasharray="68 100"/>
      <path d="M24 108a96 96 0 0 1 192 0" pathLength="100" fill="none" stroke="#91bc5a" stroke-width="15" stroke-dasharray="44 100"/>
      ${score == null ? '' : `<line x1="120" y1="108" x2="${120 + 74 * Math.cos(angle)}" y2="${108 - 74 * Math.sin(angle)}" stroke="#bfc4c1" stroke-width="4" stroke-linecap="round"/><circle cx="120" cy="108" r="7" fill="#bfc4c1"/>`}
      </svg><h2>${result ? `${result.rating} for ${escapeHtml(groupName)}` : 'Choose hikers for group difficulty'}</h2>
      <p class="planning-note">Official trail rating: ${escapeHtml(trail.officialRating ?? 'not verified in this catalog')}.</p>
      <p class="planning-note">Terrain and group estimate, not a safety assessment. Weather effects remain unknown.</p></div>
    <div><ul class="dial-factors">${factors.map(([label, index]) => {
      const value = result?.factors[index];
      const band = value == null ? 'Unknown' : value < 44 ? 'Low' : value < 68 ? 'Medium' : 'High';
      return `<li><span>${label}</span>${value == null ? '<small>Unknown</small>' : `<span class="bar" aria-hidden="true"><i class="${band.toLowerCase()}" style="width:${value}%"></i></span><small>${band}</small>`}</li>`;
    }).join('')}</ul><a class="button secondary" href="#group/${escapeHtml(trail.id)}">Edit group</a></div>
  </section>`;
}
