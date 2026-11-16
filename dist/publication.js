// Publication is deliberately limited to one reviewed itinerary in each covered park.
export const publishedRoutes = Object.freeze({
  zion: 'riverside-walk', romo: 'bear-lake', olym: 'hall-of-mosses',
  yose: 'lower-yosemite-fall', shen: 'limberlost', sagu: 'desert-discovery'
});

export function milesBetween([lon, lat], [otherLon, otherLat]) {
  const rad = value => value * Math.PI / 180;
  const term = Math.sin(rad(otherLat - lat) / 2) ** 2
    + Math.cos(rad(lat)) * Math.cos(rad(otherLat)) * Math.sin(rad(otherLon - lon) / 2) ** 2;
  return 3958.7613 * 2 * Math.asin(Math.sqrt(Math.min(1, term)));
}

const pointValid = point => Array.isArray(point) && point.length >= 2
  && Number.isFinite(point[0]) && Math.abs(point[0]) <= 180
  && Number.isFinite(point[1]) && Math.abs(point[1]) <= 90;
const official = value => {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && (url.hostname === 'nps.gov' || url.hostname.endsWith('.nps.gov'));
  } catch { return false; }
};
const dated = value => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)
  && Number.isFinite(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value;
export const parkZones = { zion: 'America/Denver', romo: 'America/Denver', olym: 'America/Los_Angeles',
  yose: 'America/Los_Angeles', shen: 'America/New_York', sagu: 'America/Phoenix' };

export function publicationIssues(trail) {
  const issues = [];
  if (!trail?.parkCode || publishedRoutes[trail.parkCode] !== trail?.id) issues.push('Not a selected park itinerary');
  for (const field of ['name', 'park', 'trailheadName', 'routeType', 'description', 'access',
    'turnaround', 'distanceConvention', 'gainNote', 'geometryReview', 'statsNote']) {
    if (typeof trail?.[field] !== 'string' || !trail[field].trim()) issues.push(`Missing ${field}`);
  }
  if (!Number.isFinite(trail?.miles) || trail.miles <= 0) issues.push('Missing positive hike distance');
  if (!Number.isFinite(trail?.gain) || trail.gain < 0) issues.push('Unknown ascent');
  for (const field of ['statsSource', 'ascentSource', 'geometrySource', 'geometryQuery']) {
    if (!official(trail?.[field])) issues.push(`Missing official ${field}`);
  }
  if (!official(trail?.timeZoneSource) && trail?.timeZoneSource !== 'https://time.gov/') issues.push('Missing official time zone map');
  if (trail?.timeZone !== parkZones[trail?.parkCode]) issues.push('Time zone does not match reviewed park location');
  if (!['Loop', 'Out and back'].includes(trail?.routeType)) issues.push('Unknown itinerary type');
  if (!dated(trail?.reviewDate)) issues.push('Missing valid review date');
  try {
    if (!trail?.timeZone) throw new Error('Missing zone');
    new Intl.DateTimeFormat('en', { timeZone: trail.timeZone }).format(0);
  } catch { issues.push('Unknown route time zone'); }
  if (!Array.isArray(trail?.sourceSegments) || !trail.sourceSegments.length
    || !trail.sourceSegments.every(segment => segment && Number.isInteger(segment.objectId) && segment.name)) {
    issues.push('Missing source geometry features');
  }
  const line = trail?.geometry?.coordinates;
  if (trail?.geometry?.type !== 'LineString' || !Array.isArray(line) || line.length < 3 || !line.every(pointValid)) {
    issues.push('Missing continuous itinerary geometry');
    return issues;
  }
  if (!pointValid(trail.trailhead) || milesBetween(trail.trailhead, line[0]) > .005) issues.push('Trailhead does not match route start');
  let length = 0;
  for (let index = 1; index < line.length; index++) {
    const step = milesBetween(line[index - 1], line[index]);
    // NPS snapshot vertices are closely spaced; do not bridge missing sections.
    if (step > .1) issues.push('Discontinuous geometry');
    length += step;
  }
  if (Math.abs(length - trail.miles) > .12) issues.push('Geometry does not match published distance');
  if (milesBetween(line[0], line.at(-1)) > .01) issues.push('Itinerary does not return to start access area');
  return [...new Set(issues)];
}
