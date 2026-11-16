import { parks } from './catalog.js';
import { timeRange } from './planning.js';

export const forecastSource = 'https://open-meteo.com/';
export const forecastMaxAge = 60 * 60 * 1000;
export const alertsMaxAge = 15 * 60 * 1000;
const hour = 60 * 60 * 1000;
const day = 24 * hour;
const fields = ['temperature_2m', 'apparent_temperature', 'precipitation_probability', 'weather_code', 'wind_gusts_10m'];
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

const pointsFor = trail => [
  { name: 'Trailhead', coordinates: trail.trailhead, elevationFt: trail.trailheadElevation },
  ...(trail.upperPoint ? [trail.upperPoint] : [])
];

function forecastKey(trail) {
  return 'trail-gauge-forecast-v1:' + pointsFor(trail)
    .map(point => [...(point.coordinates ?? []), point.elevationFt ?? 'auto'].join(',')).join('/');
}

function validHourly(hourly) {
  return Array.isArray(hourly?.time) && hourly.time.length > 0
    && fields.every(field => Array.isArray(hourly[field]) && hourly[field].length === hourly.time.length);
}

export function readForecast(trail, storage) {
  try {
    const snapshot = JSON.parse(storage.getItem(forecastKey(trail)));
    if (!Number.isFinite(snapshot?.fetchedAt) || snapshot.fetchedAt > Date.now()
      || snapshot.samples?.length !== pointsFor(trail).length || !snapshot.samples.every(sample => validHourly(sample?.hourly))) return null;
    return snapshot;
  } catch {
    return null;
  }
}

export function writeForecast(trail, storage, snapshot) {
  try {
    storage.setItem(forecastKey(trail), JSON.stringify(snapshot));
  } catch {
    // The active page can still use the live response.
  }
}

export function forecastRequest(trail, plan, now = Date.now()) {
  if (!plan) return { status: 'unplanned' };
  if (!Array.isArray(trail.trailhead) || trail.trailhead.length !== 2 || !trail.trailhead.every(Number.isFinite)) return { status: 'coverage' };
  const start = startTimestamp(plan, parks[trail.parkCode].timeZone);
  if (start === null) return { status: 'invalid' };
  // The request covers seven UTC calendar days. The returned hours determine exact coverage.
  if (start < Math.floor(now / 60000) * 60000 || start >= Math.floor(now / day) * day + 7 * day) {
    return { status: 'outside' };
  }
  return { status: 'eligible', start };
}

export async function fetchForecast(trail, fetcher = fetch) {
  const points = pointsFor(trail);
  const params = new URLSearchParams({
    latitude: points.map(point => point.coordinates[1]).join(','),
    longitude: points.map(point => point.coordinates[0]).join(','),
    hourly: fields.join(','),
    temperature_unit: 'fahrenheit', wind_speed_unit: 'mph',
    timeformat: 'unixtime', timezone: 'UTC', forecast_days: '7'
  });
  if (points.every(point => Number.isFinite(point.elevationFt))) {
    params.set('elevation', points.map(point => Math.round(point.elevationFt * .3048)).join(','));
  }
  const response = await fetcher('https://api.open-meteo.com/v1/forecast?' + params, { signal: AbortSignal.timeout(10000) });
  if (!response.ok) throw new Error('Forecast request failed');
  const data = await response.json();
  const locations = Array.isArray(data) ? data : [data];
  if (locations.length !== points.length || locations.some(location => !validHourly(location?.hourly))) {
    throw new Error('Incomplete forecast response');
  }
  return { fetchedAt: Date.now(), samples: locations.map(({ hourly }, i) => ({
    name: points[i].name, elevationFt: points[i].elevationFt, hourly
  })) };
}

export function precipitationType(code) {
  if ([56, 57, 66, 67].includes(code)) return 'Freezing precipitation';
  if ([71, 73, 75, 77, 85, 86].includes(code)) return 'Snow';
  if ([51, 53, 55].includes(code)) return 'Drizzle';
  if ([61, 63, 65].includes(code)) return 'Rain';
  if ([80, 81, 82].includes(code)) return 'Showers';
  if ([95, 96, 99].includes(code)) return 'Thunderstorms';
  return [0, 1, 2, 3, 45, 48].includes(code) ? 'None indicated' : null;
}

function summarize(sample, start, end) {
  const { hourly } = sample;
  const firstHour = Math.floor(start / hour) * hour;
  const lastHour = Math.ceil(end / hour) * hour;
  const hours = [];
  for (let time = firstHour; time <= lastHour; time += hour) {
    const index = hourly.time.indexOf(time / 1000);
    if (index === -1) return { status: 'outside' };
    // Open-Meteo reports precipitation probability over the preceding hour.
    const probability = time === firstHour ? null : hourly.precipitation_probability[index];
    const values = fields.filter(field => field !== 'precipitation_probability').map(field => hourly[field][index]);
    const type = precipitationType(hourly.weather_code[index]);
    if (!values.every(Number.isFinite) || !type || (time > firstHour && !Number.isFinite(probability))) {
      return { status: 'coverage' };
    }
    hours.push({ time, temperature: values[0], apparent: values[1], probability, type, gust: values[3] });
  }
  return {
    status: 'ready', name: sample.name, elevationFt: sample.elevationFt, hours,
    tempMin: Math.min(...hours.map(row => row.temperature)), tempMax: Math.max(...hours.map(row => row.temperature)),
    apparentMin: Math.min(...hours.map(row => row.apparent)), apparentMax: Math.max(...hours.map(row => row.apparent)),
    probabilityMax: Math.max(...hours.map(row => row.probability ?? 0)),
    gustMax: Math.max(...hours.map(row => row.gust)), types: [...new Set(hours.map(row => row.type))]
  };
}

export function forecastFor(trail, group, plan, snapshot, requestStatus, now = Date.now(), context) {
  const request = forecastRequest(trail, plan, now);
  if (request.status !== 'eligible') return request;
  if (!snapshot) return { status: requestStatus ?? 'pending' };
  const stale = now - snapshot.fetchedAt >= forecastMaxAge || requestStatus === 'failed';
  let duration = timeRange(trail, group, null, context).high;
  let samples;
  let weather;
  let end;
  // Cover the longer weather-adjusted estimate as well as the baseline window.
  // Additional hours can add stress, so the window only grows.
  while (true) {
    end = request.start + duration * 60000;
    samples = snapshot.samples.map(sample => summarize(sample, request.start, end));
    const unavailable = samples.find(sample => sample.status !== 'ready');
    if (unavailable) return { status: unavailable.status, fetchedAt: snapshot.fetchedAt, stale };
    weather = {
      apparentMin: Math.min(...samples.map(sample => sample.apparentMin)),
      apparentMax: Math.max(...samples.map(sample => sample.apparentMax)),
      probabilityMax: Math.max(...samples.map(sample => sample.probabilityMax)),
      gustMax: Math.max(...samples.map(sample => sample.gustMax)),
      types: [...new Set(samples.flatMap(sample => sample.types))]
    };
    const adjusted = timeRange(trail, group, weather, context).high;
    if (stale || adjusted <= duration) break;
    duration = adjusted;
  }
  return { status: stale ? 'stale' : 'ready', start: request.start, end, samples, fetchedAt: snapshot.fetchedAt,
    weather: stale ? null : weather };
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
