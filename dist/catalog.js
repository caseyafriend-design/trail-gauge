import { trailNotes } from './trail-notes.js';

export const regions = [
  { id: 'utah', name: 'Utah', description: 'Verified routes in Zion National Park.' },
  { id: 'rockies', name: 'Colorado Rockies', description: 'Verified routes in Rocky Mountain National Park.' },
  { id: 'olympic', name: 'Olympic Peninsula', description: 'Verified routes in Olympic National Park.' },
  { id: 'california', name: 'California', description: 'Verified routes in Yosemite National Park.' },
  { id: 'virginia', name: 'Virginia', description: 'Verified routes in Shenandoah National Park.' },
  { id: 'arizona', name: 'Arizona', description: 'Verified routes in Saguaro National Park.' }
];

export const parks = {
  zion: { timeZone: 'America/Denver', timeLabel: 'Mountain Time', conditions: 'https://www.nps.gov/zion/planyourvisit/conditions.htm' },
  brca: { timeZone: 'America/Denver', timeLabel: 'Mountain Time', conditions: 'https://www.nps.gov/brca/planyourvisit/conditions.htm' },
  romo: { timeZone: 'America/Denver', timeLabel: 'Mountain Time', conditions: 'https://www.nps.gov/romo/planyourvisit/conditions.htm' },
  yose: { timeZone: 'America/Los_Angeles', timeLabel: 'Pacific Time', conditions: 'https://www.nps.gov/yose/planyourvisit/conditions.htm' },
  shen: { timeZone: 'America/New_York', timeLabel: 'Eastern Time', conditions: 'https://www.nps.gov/shen/planyourvisit/conditions.htm' },
  sagu: { timeZone: 'America/Phoenix', timeLabel: 'Arizona time (MST year-round)', conditions: 'https://www.nps.gov/sagu/planyourvisit/conditions.htm' },
  olym: { timeZone: 'America/Los_Angeles', timeLabel: 'Pacific Time', conditions: 'https://www.nps.gov/olym/planyourvisit/conditions.htm' }
};

export const legacyTrails = {
  'angels-landing': { name: 'Angels Landing', parkCode: 'zion' },
  'queens-garden': { name: 'Queens Garden', parkCode: 'brca' },
  'riverside-walk': { name: 'Riverside Walk', parkCode: 'zion' },
  watchman: { name: 'Watchman Trail', parkCode: 'zion' },
  'bear-lake': { name: 'Bear Lake Loop', parkCode: 'romo' },
  'emerald-lake': { name: 'Emerald Lake', parkCode: 'romo' },
  'flattop-mountain': { name: 'Flattop Mountain', parkCode: 'romo' },
  'hall-of-mosses': { name: 'Hall of Mosses', parkCode: 'olym' },
  'rialto-beach': { name: 'Rialto Beach to Hole-in-the-Wall', parkCode: 'olym' },
  'cape-alava': { name: 'Cape Alava', parkCode: 'olym' }
};

export function hasGeometry(trail) {
  const geometry = trail?.geometry;
  const validLine = line => Array.isArray(line) && line.length >= 2
    && line.every(point => Array.isArray(point) && point.length >= 2
      && Number.isFinite(point[0]) && Math.abs(point[0]) <= 180
      && Number.isFinite(point[1]) && Math.abs(point[1]) <= 90);
  if (geometry?.type === 'LineString') return validLine(geometry.coordinates);
  return geometry?.type === 'MultiLineString' && Array.isArray(geometry.coordinates)
    && geometry.coordinates.length > 0 && geometry.coordinates.every(validLine);
}

export async function loadCatalog(fetcher = fetch) {
  try {
    const response = await fetcher('./routes.geojson');
    if (!response.ok) return [];
    const data = await response.json();
    return data.features.map(({ properties, geometry }) => ({ ...properties, ...trailNotes[properties.id], geometry }))
      .filter(trail => parks[trail.parkCode] && regions.some(region => region.id === trail.region)
        && Number.isFinite(trail.miles) && Number.isFinite(trail.gain));
  } catch {
    return [];
  }
}
