import { escapeHtml } from './forms.js';
import { GPSRecorder } from './gps-recorder.js';
import { gpsStorageKey, recordedDistance } from './gps-store.js';

const date = value => new Date(value).toLocaleString();
const summary = hike => `${hike.points.length} accepted fixes · ${(recordedDistance(hike.points) / 1000).toFixed(2)} km recorded (approximate, gaps excluded)`;
const sourceLabel = hike => hike.source === 'simulation' ? 'SIMULATED TEST — not a real hike' : 'Device location — accuracy not independently verified';
const limitations = `<p class="planning-note">Foreground demo only: keep this page open and the screen unlocked. Locking, switching apps, hiding the tab, or reloading interrupts tracking. No background reliability, navigation, safety, or learned difficulty prediction is provided. Gaps are not filled.</p>`;

export function gpsPage(recorder, page, id) {
  const { active, hikes } = recorder.data;
  const status = `<p id="gps-status" role="status">${escapeHtml(recorder.message)}</p>`;
  if (page === 'my-hikes') {
    const hike = hikes.find(item => item.id === id);
    return `<section class="gps-page"><h1>My hikes</h1><p>Private recordings stored only in this browser, separate from Hike history. No account, upload, or sharing. Clearing site data or private browsing can erase these records. Not encrypted against someone with access to this device.</p>${status}${hike ? `
      <a href="#my-hikes">Back to My hikes</a><h2>${escapeHtml(date(hike.startedAt))}</h2>
      <p>${sourceLabel(hike)}</p><p>${escapeHtml(summary(hike))}</p>
      <p>Started ${escapeHtml(date(hike.startedAt))} · Finished ${escapeHtml(date(hike.finishedAt))}. Elapsed wall time ${Math.max(0, Math.round((hike.finishedAt - hike.startedAt) / 60000))} min (includes pauses; not moving time).</p>
      <h3>Quality and interruptions</h3><ul>${hike.events.map(event => `<li>${escapeHtml(date(event.at))}: ${escapeHtml(event.text)}</li>`).join('')}</ul>
      <details><summary>Recorded coordinates and accuracy (${hike.points.length})</summary><p>Sensitive location data. No map tiles or location requests are sent from this view.</p><ol>${hike.points.map(point => `<li>${escapeHtml(date(point.at))}: ${point.lat.toFixed(6)}, ${point.lon.toFixed(6)} · ±${Math.round(point.accuracy)} m${point.breakBefore ? ' · segment start / gap' : ''}</li>`).join('')}</ol></details>
      <button type="button" data-gps-delete="${escapeHtml(hike.id)}">Delete this recording…</button>` : `<p>${hikes.length ? `${hikes.length} / 20 completed recordings` : 'No completed recordings yet. Start in Track.'}</p><ul>${hikes.map(item => `<li><a href="#my-hikes/${encodeURIComponent(item.id)}">${escapeHtml(date(item.startedAt))}</a> — ${sourceLabel(item)} — ${escapeHtml(summary(item))}</li>`).join('')}</ul><a href="#track">Open Track</a>`}${limitations}</section>`;
  }
  return `<section class="gps-page"><h1>Track</h1><p>Record a private, bounded GPS outing while this page stays visible. This is a prototype, not a tested iPhone hiking recorder.</p>${limitations}
    <p>Location is saved only in this browser (not uploaded), separate from your profiles, reviews, and packing lists. Use one Trail Gauge tab. Maximum 4 hours from Start, 7,200 accepted points, and 20 completed recordings; nothing is automatically deleted. Only fixes with reported accuracy within 100 m are accepted. Distance excludes pauses and gaps over 30 seconds and may undercount or drift.</p>
    ${status}<div id="gps-current">${active ? `<h2>${active.status === 'recording' ? 'Recording' : 'Paused'}</h2><p>${sourceLabel(active)}</p><p>${escapeHtml(summary(active))}</p><p>Started ${escapeHtml(date(active.startedAt))}</p>
      <div class="gps-actions">${active.status === 'recording' ? '<button type="button" data-gps="pause">Pause</button>' : '<button type="button" data-gps="resume">Resume</button>'}<button type="button" data-gps="finish">Finish &amp; save privately</button></div>` : `<label class="check-line"><input id="gps-consent" type="checkbox"${recorder.blocked ? ' disabled' : ''}> I consent to recording precise location in this browser while this page is visible. No location permission is requested until I press Start.</label><button type="button" data-gps="start"${recorder.blocked ? ' disabled' : ''}>Start</button>`}</div><a href="#my-hikes">View My hikes</a></section>`;
}

export function createGPSPages(screen) {
  let currentPage, currentId;
  const update = () => {
    if (!['track', 'my-hikes'].includes(screen.dataset.page)) return;
    const focused = document.activeElement?.dataset.gps;
    screen.innerHTML = gpsPage(recorder, currentPage, currentId);
    if (focused) screen.querySelector(`[data-gps="${focused}"]`)?.focus({ preventScroll: true });
  };
  // Access storage lazily so a denied getter is handled by the recorder too.
  const storage = { getItem: key => window.localStorage.getItem(key), setItem: (key, value) => window.localStorage.setItem(key, value) };
  const recorder = new GPSRecorder({ storage, geolocation: navigator.geolocation, changed: update });
  screen.addEventListener('click', event => {
    const action = event.target.closest('[data-gps]')?.dataset.gps;
    if (action === 'start') recorder.start(Boolean(screen.querySelector('#gps-consent')?.checked));
    if (action === 'pause') recorder.pause();
    if (action === 'resume') {
      if (document.visibilityState === 'visible') recorder.resume();
    }
    if (action === 'finish' && recorder.finish()) location.hash = '#my-hikes';
    const id = event.target.closest('[data-gps-delete]')?.dataset.gpsDelete;
    if (id && confirm('Permanently delete this completed GPS recording from this browser? Other hikes and planning data are not deleted.')) {
      if (recorder.deleteHike(id)) location.hash = '#my-hikes';
    }
  });
  const hide = () => { if (recorder.data.active?.status === 'recording') recorder.pause('Tracking interrupted because the page was hidden or left. Resume explicitly; the interval is a gap.'); };
  document.addEventListener('visibilitychange', () => { if (document.visibilityState !== 'visible') hide(); });
  window.addEventListener('pagehide', hide);
  window.addEventListener('storage', event => {
    if (event.key === gpsStorageKey || event.key === null) {
      recorder.stopWatch();
      if (recorder.data.active) recorder.data.active.status = 'paused';
      recorder.blocked = true;
      recorder.message = 'Recording storage changed in another tab. Tracking stopped without overwriting it. Complete the recording there, then reload this tab.';
      update();
    }
  });
  setInterval(() => recorder.checkFreshness(), 5000);
  return (page, id) => { currentPage = page; currentId = id; update(); };
}
