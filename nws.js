// NWS hourly data is air temperature, not apparent temperature or a safety score.
export const nwsVersion = 'nws-hourly-v1';
export const nwsMaxAge = 60 * 60 * 1000;
const retryAt = new Map();
const inFlight = new Map();
const finite = value => typeof value === 'number' && Number.isFinite(value);
const instant = value => typeof value === 'string' && /(?:Z|[+-]\d{2}:\d{2})$/.test(value) ? Date.parse(value) : NaN;
const apiURL = value => typeof value === 'string' && /^https:\/\/api\.weather\.gov\/gridpoints\/[A-Z]{3}\/\d+,\d+\/forecast\/hourly$/.test(value);

export function validSnapshot(value) {
  return value?.version === nwsVersion && apiURL(value.url) && /^https:\/\/api\.weather\.gov\/points\/-?\d+\.\d{4},-?\d+\.\d{4}$/.test(value.point ?? '') &&
    [value.fetchedAt, value.expiresAt, value.issuedAt, value.generatedAt, value.validFrom, value.validThrough].every(finite) &&
    value.validThrough > value.validFrom && value.expiresAt <= value.fetchedAt + nwsMaxAge &&
    Array.isArray(value.periods) && value.periods.length > 0 && value.periods.every((p, i) => p && finite(p.start) && finite(p.end) && p.end > p.start &&
      (!i || p.start >= value.periods[i - 1].end) && (p.temperature === null || finite(p.temperature)) &&
      (p.probability === null || finite(p.probability) && p.probability >= 0 && p.probability <= 100));
}

export function pointURL(trail) {
  const [lon, lat] = trail.trailhead ?? [];
  if (!finite(lat) || !finite(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180) throw Error('NWS: verified trailhead coordinates are missing. Check official park weather.');
  return `https://api.weather.gov/points/${lat.toFixed(4)},${lon.toFixed(4)}`;
}

// Shared by rendering, persistent cache reads, and network revalidation.
export function freshSnapshot(snapshot, now = Date.now()) {
  return validSnapshot(snapshot) && snapshot.fetchedAt <= now && now < snapshot.expiresAt &&
    now - snapshot.issuedAt < 12 * 60 * 60 * 1000 && snapshot.issuedAt <= now + 60000;
}

export const forecastRetryAt = trail => retryAt.get(pointURL(trail)) ?? 0;

export function normalizeNws(data, { url, point, now = Date.now(), expiresAt = now + nwsMaxAge } = {}) {
  const p = data?.properties;
  const issuedAt = instant(p?.updateTime);
  const generatedAt = instant(p?.generatedAt);
  const valid = String(p?.validTimes ?? '').split('/');
  const validFrom = instant(valid[0]);
  const duration = /^P(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?)?$/.exec(valid[1] ?? '');
  const validThrough = validFrom + (duration ? (Number(duration[1] ?? 0) * 86400 + Number(duration[2] ?? 0) * 3600 + Number(duration[3] ?? 0) * 60 + Number(duration[4] ?? 0)) * 1000 : NaN);
  if (!apiURL(url) || !/^https:\/\/api\.weather\.gov\/points\//.test(point ?? '') ||
      !Number.isFinite(issuedAt) || !Number.isFinite(generatedAt) || !Number.isFinite(validThrough) || validThrough <= validFrom ||
      issuedAt > now + 60000 || generatedAt > now + 60000 || !Array.isArray(p?.periods) || !p.periods.length) {
    throw Error('NWS: forecast metadata is incomplete. Check official park weather.');
  }
  const periods = p.periods.map(period => {
    const start = instant(period.startTime), end = instant(period.endTime);
    if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) throw Error('NWS: invalid hourly time interval. Check official park weather.');
    const temperature = finite(period.temperature) && ['F', 'C'].includes(period.temperatureUnit)
      ? (period.temperatureUnit === 'C' ? period.temperature * 9 / 5 + 32 : period.temperature) : null;
    const pop = period.probabilityOfPrecipitation;
    const probability = pop?.unitCode === 'wmoUnit:percent' && finite(pop.value) && pop.value >= 0 && pop.value <= 100 ? pop.value : null;
    return { start, end, temperature, probability,
      wind: typeof period.windSpeed === 'string' ? period.windSpeed : null,
      direction: typeof period.windDirection === 'string' ? period.windDirection : null,
      summary: typeof period.shortForecast === 'string' ? period.shortForecast : null };
  }).sort((a, b) => a.start - b.start);
  if (periods.some((p, i) => i && p.start < periods[i - 1].end)) throw Error('NWS: overlapping hourly intervals. Check official park weather.');
  return { version: nwsVersion, fetchedAt: now, issuedAt, generatedAt, validFrom, validThrough, validTimes: p.validTimes,
    expiresAt: Math.min(expiresAt, now + nwsMaxAge), point, url, periods };
}

export function windowForecast(snapshot, start, end, now = Date.now()) {
  const unknown = status => ({ status, weather: null, forecast: null });
  if (!finite(start) || !finite(end) || end <= start || start < now) return unknown('invalid-time');
  if (!validSnapshot(snapshot)) return unknown('missing');
  if (!freshSnapshot(snapshot, now)) return unknown('stale');
  if (start < snapshot.validFrom || end > snapshot.validThrough) return unknown('outside-horizon');
  const periods = snapshot.periods.filter(p => p.start < end && p.end > start);
  if (!periods.length || periods[0].start > start || periods.at(-1).end < end ||
      periods.some((p, i) => i && p.start !== periods[i - 1].end)) return unknown('outside-horizon');
  // Keep model inputs unknown: NWS hourly does not supply apparent temperature/gusts.
  return { status: 'ready', weather: null, forecast: { ...snapshot, periods, start, end } };
}

function expiry(response, now) {
  const control = response.headers?.get('Cache-Control') ?? '';
  const age = Number(response.headers?.get('Age') ?? 0);
  if (/no-store|no-cache/i.test(control)) return now;
  const seconds = Number(/(?:^|,)\s*max-age=(\d+)/i.exec(control)?.[1]);
  return now + (Number.isFinite(seconds) ? Math.max(0, seconds - (Number.isFinite(age) ? age : 0)) * 1000 : nwsMaxAge);
}

export async function fetchNws(trail, fetcher = fetch, now = Date.now()) {
  const point = pointURL(trail);
  if (now < (retryAt.get(point) ?? 0)) throw Error('NWS: requests paused after an outage. Try again later or check official park weather.');
  if (inFlight.has(point)) return inFlight.get(point);
  const pending = (async () => {
    let retryDelay = 60000;
    try {
      const request = async url => {
        // Browsers supply their real default User-Agent. Do not pretend to override it.
        const response = await fetcher(url, { headers: { Accept: 'application/geo+json' }, signal: AbortSignal.timeout(10000) });
        if (!response.ok) {
          const retry = response.headers?.get('Retry-After');
          const seconds = Number(retry);
          retryDelay = Math.max(retryDelay, retry && Number.isFinite(seconds) ? seconds * 1000 : (Date.parse(retry) - now) || 0);
          throw Error(`NWS: HTTP ${response.status}. Try again later or check official park weather.`);
        }
        return { data: await response.json(), expiresAt: expiry(response, now) };
      };
      const location = await request(point);
      const url = location.data?.properties?.forecastHourly;
      if (!apiURL(url)) throw Error('NWS: hourly forecast link is missing. Check official park weather.');
      const hourly = await request(url);
      return normalizeNws(hourly.data, { point, url, now, expiresAt: Math.min(location.expiresAt, hourly.expiresAt) });
    } catch (error) {
      retryAt.set(point, now + retryDelay);
      throw Error(`Forecast unavailable. ${error.message}`, { cause: error });
    }
  })();
  inFlight.set(point, pending);
  try { return await pending; } finally { inFlight.delete(point); }
}
