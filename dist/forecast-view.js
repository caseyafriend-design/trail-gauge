import { escapeHtml as h } from './forms.js';
import { formatLocal } from './conditions.js';

export function forecastView(trail, result, official, error) {
  const messages = {
    'choose-time': 'Choose a hike date and start time to check the NWS hourly forecast.',
    'invalid-time': 'Choose a future, unambiguous local start time. Skipped or repeated daylight-saving times are unknown.',
    'outside-horizon': 'The full estimated outing is outside the available hourly forecast horizon.',
    missing: 'No current forecast has been loaded for this start time.',
    stale: 'The saved forecast has expired. Update it or check official park weather.',
    pending: 'Checking the NWS hourly forecast…',
    failed: 'The forecast is unavailable. Try again later or check official park weather.'
  };
  const f = result.forecast;
  const numbers = key => f.periods.map(p => p[key]).filter(Number.isFinite);
  const range = values => values.length ? `${Math.round(Math.min(...values))}–${Math.round(Math.max(...values))} °F` : 'Unknown';
  const ready = result.status === 'ready' && f;
  return `<p class="eyebrow">${result.mode === 'current' ? 'CURRENT-HOUR FORECAST' : 'PLANNED OUTING FORECAST'}</p>
    ${result.savedPlanStatus ? '<p class="planning-note">Your saved plan is unchanged, but its time is past or invalid here. Showing the current-hour baseline. Choose a new time or use Current weather / reset to now.</p>' : ''}
    <p role="status">${ready ? (result.mode === 'current' ? 'NWS hourly forecast for the current supported hour, not observed conditions or an outing plan.' : 'NWS hourly forecast for the estimated outing') : messages[result.status] ?? messages.missing}</p>
    ${ready ? `<dl class="forecast-metrics"><div><dt>Air temperature</dt><dd>${range(numbers('temperature'))}${numbers('temperature').length < f.periods.length ? ' (some hours unknown)' : ''}</dd></div>
      <div><dt>Precipitation chance</dt><dd>${numbers('probability').length ? Math.max(...numbers('probability')) + '% maximum' : 'Unknown'}${numbers('probability').length < f.periods.length ? ' (some hours unknown)' : ''}</dd></div></dl>
      <p>${h(formatLocal(f.start, trail.parkCode))} to ${h(formatLocal(f.end, trail.parkCode))} · park local time.</p>
      <details><summary>Hourly details and forecast times</summary><p>Updated ${h(formatLocal(f.issuedAt, trail.parkCode))}; generated ${h(formatLocal(f.generatedAt, trail.parkCode))}; fetched ${h(formatLocal(f.fetchedAt, trail.parkCode))}.</p>
      <p>Provider validity: ${h(f.validTimes)}.</p><ul class="forecast-hours">${f.periods.map(p => `<li>${h(formatLocal(p.start, trail.parkCode))}: ${p.temperature === null ? 'air temperature unknown' : Math.round(p.temperature) + ' °F air'}; ${h(p.summary ?? 'conditions unknown')}; wind ${h(p.wind ?? 'unknown')} ${h(p.direction ?? '')}; precipitation ${p.probability === null ? 'unknown' : p.probability + '%'}.</li>`).join('')}</ul></details>
      <p class="planning-note">NWS grid at trailhead ${h(f.point.split('/').at(-1))}; approximately 2.5 km, not conditions along the whole trail or at its upper elevation. <a href="${h(f.url)}" target="_blank" rel="noopener">Source forecast data ↗</a></p>` : ''}
    ${error && result.status === 'failed' ? `<p class="planning-note">${h(error)}</p>` : ''}
    <p class="planning-note">Air temperature is not feels-like temperature. Heat, gust and wet/snow difficulty factors remain unknown; time, difficulty and packing use terrain and group only. Unknown weather does not mean zero risk.</p>
    <p class="planning-note"><a href="${h(official)}" target="_blank" rel="noopener">Official park conditions and weather ↗</a> · <a href="https://www.weather.gov/disclaimer" target="_blank" rel="noopener">NWS disclaimer ↗</a></p>`;
}
