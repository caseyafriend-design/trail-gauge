import { trailRecord, usgsMapService, usgsTrailLayer } from './us-trails.js';

// USGS publishes the trail layer with an effective minimum scale of 1:500,000.
export const minimumTrailZoom = 11;

export function trailImageUrl({ extent, size }) {
  return `${usgsMapService}/export?` + new URLSearchParams({
    bbox: extent.join(','), bboxSR: '3857', imageSR: '3857', size: size.join(','),
    layers: `show:${usgsTrailLayer}`, format: 'png32', transparent: 'true', f: 'image'
  });
}

export async function trailsAtPoint({ extent, size }, { x, y }, signal, fetcher = fetch) {
  const query = new URLSearchParams({
    geometry: `${x},${y}`, geometryType: 'esriGeometryPoint', sr: '3857',
    mapExtent: extent.join(','), imageDisplay: [...size, 96].join(','),
    layers: `all:${usgsTrailLayer}`, tolerance: '9', returnGeometry: 'false',
    returnFieldName: 'true', returnUnformattedValues: 'true', f: 'json'
  });
  const response = await fetcher(`${usgsMapService}/identify?${query}`, { signal });
  if (!response.ok) throw new Error('USGS trail lookup failed');
  const data = await response.json();
  if (data.error || !Array.isArray(data.results)) throw new Error('USGS trail lookup failed');
  const records = new Map();
  for (const result of data.results) {
    if (result.layerId !== usgsTrailLayer) continue;
    const trail = trailRecord(result.attributes ?? {}, null, true);
    if (trail) records.set(trail.id, trail);
  }
  return [...records.values()];
}

export function parseMapView(value) {
  if (!value || !/^-?\d+(?:\.\d+)?,-?\d+(?:\.\d+)?,\d{1,2}$/.test(value)) return null;
  const [lat, lon, zoom] = value.split(',').map(Number);
  return Math.abs(lat) <= 85.0511 && Math.abs(lon) <= 180 && zoom >= 3 && zoom <= 19 ? { lat, lon, zoom } : null;
}

export function stateViewBounds(state) {
  const points = state.rings.flat();
  // The Alaska overview uses the western side of the antimeridian.
  const visible = state.code === 'AK' ? points.filter(([lon]) => lon < 0) : points;
  if (!visible.length) return null;
  const latitudes = visible.map(([, lat]) => lat);
  const longitudes = visible.map(([lon]) => lon);
  return [[Math.min(...latitudes), Math.min(...longitudes)], [Math.max(...latitudes), Math.max(...longitudes)]];
}
