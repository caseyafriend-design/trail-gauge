export const gpsStorageKey = 'trail-gauge-recordings-v1';
export const recordingLimits = Object.freeze({ hours: 4, points: 7200, hikes: 20, accuracy: 100, gap: 30000 });

export function readRecordings(storage) {
  const raw = storage.getItem(gpsStorageKey);
  if (raw === null) return { version: 1, active: null, hikes: [] };
  const data = JSON.parse(raw);
  const valid = hike => hike && typeof hike.id === 'string' && Array.isArray(hike.points)
    && hike.points.length <= recordingLimits.points && hike.points.every(point => point
      && [point.lat, point.lon, point.accuracy, point.at].every(Number.isFinite)
      && Math.abs(point.lat) <= 90 && Math.abs(point.lon) <= 180 && point.accuracy >= 0
      && point.accuracy <= recordingLimits.accuracy && typeof point.breakBefore === 'boolean')
    && Array.isArray(hike.events) && hike.events.length <= 200
    && hike.events.every(event => event && Number.isFinite(event.at) && typeof event.text === 'string')
    && ['device', 'simulation'].includes(hike.source)
    && ['recording', 'paused', 'finished'].includes(hike.status) && Number.isFinite(hike.startedAt);
  if (data?.version !== 1 || !Array.isArray(data.hikes) || data.hikes.length > recordingLimits.hikes
    || !data.hikes.every(hike => valid(hike) && hike.status === 'finished' && Number.isFinite(hike.finishedAt))
    || (data.active !== null && (!valid(data.active) || data.active.status === 'finished'))) {
    throw Error('Recording storage has an unsupported format. Existing data was left untouched.');
  }
  return data;
}

export function writeRecordings(storage, data) {
  storage.setItem(gpsStorageKey, JSON.stringify(data));
}

export function distanceMeters(a, b) {
  const rad = value => value * Math.PI / 180;
  const dLat = rad(b.lat - a.lat), dLon = rad(b.lon - a.lon);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLon / 2) ** 2;
  return 6371000 * 2 * Math.asin(Math.sqrt(Math.min(1, h)));
}

export function recordedDistance(points) {
  return points.reduce((sum, point, index) => sum + (index && !point.breakBefore
    ? distanceMeters(points[index - 1], point) : 0), 0);
}
