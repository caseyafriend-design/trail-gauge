import { parks } from './catalog.js';
import { timeRange } from './planning.js';
import { fetchNws, nwsMaxAge, nwsVersion, pointURL, validSnapshot, windowForecast } from './nws.js';

export const forecastSource = 'https://www.weather.gov/';
export const forecastMaxAge = nwsMaxAge;
export const alertsMaxAge = 15 * 60 * 1000;
const hour = 60 * 60 * 1000;
const day = 24 * hour;
const localFormats = new Map();

function localWallTime(timestamp, timeZone) {
  if (!localFormats.has(timeZone)) {
    localFormats.set(timeZone, new Intl.DateTimeFormat('en-CA', {
      timeZone, year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', hourCycle: 'h23'
    }));
  }
  const p = Object.fromEntries(localFormats.get(timeZone).formatToParts(timestamp).map(({ type, value }) => [type, value]));
  return `${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}`;
}

export function startTimestamp(plan, timeZone) {
  const wallTime = `${plan.date}T${plan.start}`;
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(wallTime)) return null;
  const asUtc = Date.parse(wallTime + 'Z');
  if (!Number.isFinite(asUtc)) return null;
  const offsets = new Set([-day, 0, day].map(delta => Date.parse(localWallTime(asUtc + delta, timeZone) + 'Z') - (asUtc + delta)));
  const matches = [...offsets].map(offset => asUtc - offset).filter(time => localWallTime(time, timeZone) === wallTime);
  // Repeated and skipped DST times both require an unambiguous new selection.
  return matches.length === 1 ? matches[0] : null;
}

export function formatLocal(timestamp, parkCode) {
  return new Intl.DateTimeFormat('en-US', {
    timeZone: parks[parkCode].timeZone, month: 'short', day: 'numeric',
    hour: 'numeric', minute: '2-digit', timeZoneName: 'short'
  }).format(timestamp);
}

const cacheKey = trail => `trail-gauge-${nwsVersion}-${trail.id}`;
export function readForecast(trail, storage, now = Date.now()) {
  try {
    const value = JSON.parse(storage.getItem(cacheKey(trail)));
    if (!validSnapshot(value) || value.point !== pointURL(trail) || value.expiresAt <= now || value.fetchedAt > now) return null;
    return value;
  } catch (error) { console.warn('NWS cache unavailable; a fresh forecast is required.', error.message); return null; }
}
export function writeForecast(trail, storage, snapshot, now = Date.now()) {
  if (!validSnapshot(snapshot) || snapshot.point !== pointURL(trail) || snapshot.expiresAt <= now) return;
  try { storage.setItem(cacheKey(trail), JSON.stringify(snapshot)); }
  catch (error) { console.warn('NWS forecast could not be saved; it remains available in this tab.', error.message); }
}
export function forecastRequest(trail, plan, now = Date.now()) {
  if (!plan?.date || !plan?.start) return { status: 'choose-time', weather: null };
  const start = startTimestamp(plan, parks[trail.parkCode].timeZone);
  if (start === null || start < now) return { status: 'invalid-time', weather: null };
  if (start > now + 7 * day) return { status: 'outside-horizon', weather: null };
  return { status: 'eligible', start, weather: null };
}
export function forecastFor(trail, group, plan, snapshot, status, now = Date.now(), context = {}) {
  const request = forecastRequest(trail, plan, now);
  if (request.status !== 'eligible') return request;
  if (status === 'failed' || status === 'pending') return { status, weather: null };
  if (snapshot && snapshot.point !== pointURL(trail)) return { status: 'missing', weather: null };
  const end = request.start + timeRange(trail, group, null, context).high * 60000;
  return windowForecast(snapshot, request.start, end, now);
}
export const fetchForecast = fetchNws;

export const alertFeed = parkCode => `https://www.nps.gov/${parkCode}/park-alerts-${parkCode}.json`;

export function activeAlerts(data, parkCode, now = Date.now()) {
  const today = localWallTime(now, parks[parkCode].timeZone).slice(0, 10);
  const dayKey = value => {
    if (!value || String(value).includes('1900')) return null;
    const isoDate = /^\d{4}-\d{2}-\d{2}/.exec(value)?.[0];
    const time = Date.parse(value);
    return isoDate ?? (Number.isFinite(time) ? new Date(time).toISOString().slice(0, 10) : null);
  };
  const priority = { 'Park Closure': 0, Danger: 1, Caution: 2, Information: 3 };
  return data.filter(alert => alert && alert.is_active === 1 && typeof alert.title === 'string'
    && (!dayKey(alert.start_date) || dayKey(alert.start_date) <= today)
    && (!dayKey(alert.end_date) || dayKey(alert.end_date) >= today))
    .sort((a, b) => (priority[a.category] ?? 4) - (priority[b.category] ?? 4));
}

export async function fetchAlerts(parkCode, fetcher = fetch) {
  const response = await fetcher(alertFeed(parkCode), { signal: AbortSignal.timeout(10000) });
  if (!response.ok) throw new Error('Park alerts request failed');
  const data = await response.json();
  if (!Array.isArray(data) || data.some(item => !item || typeof item.title !== 'string' || typeof item.is_active !== 'number')) {
    throw new Error('Unexpected park alert feed');
  }
  return { fetchedAt: Date.now(), alerts: activeAlerts(data, parkCode) };
}
