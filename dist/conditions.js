import { parks } from './catalog.js';

export const forecastSource = 'https://open-meteo.com/';
export const forecastMaxAge = 60 * 60 * 1000;
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

// No forecast provider with verified no-cost commercial terms is configured.
// Keep the old API inert so old caches cannot enter comparison or packing estimates.
export function readForecast() { return null; }
export function writeForecast() {}
export function forecastRequest() { return { status: 'disabled', weather: null }; }
export function forecastFor() { return { status: 'disabled', weather: null }; }
export async function fetchForecast() {
  throw new Error('Forecast unavailable: no commercially permitted provider is configured. Check official park weather.');
}

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
