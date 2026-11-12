import { hasGeometry } from './catalog.js';

export const usgsMapService = 'https://carto.nationalmap.gov/arcgis/rest/services/transportation/MapServer';
export const usgsTrailLayer = 37;
export const usgsLayer = `${usgsMapService}/${usgsTrailLayer}`;
export const usgsCoverage = 'https://www.usgs.gov/national-digital-trails/qas-about-usgs-trail-data';
export const pageSize = 24;
const baseFilter = "trailtype = 'Terra Trail' AND (hikerpedestrian = 'Y' OR hikerpedestrian IS NULL)";
const fields = 'objectid,permanentidentifier,name,maplabel,namealternate,sourceoriginator,sourcedatadecscription,lengthmiles,trailsurface,hikerpedestrian,trailtype';
const allowedId = /^(?:[\w-]{1,40}|\{[\w-]{1,38}\})$/;
let boundariesPromise;

export function loadBoundaries(fetcher = fetch) {
  return boundariesPromise ??= fetcher('./us-states.json').then(async response => {
    if (!response.ok) throw new Error('State boundaries unavailable');
    const data = await response.json();
    return data.states;
  }).catch(error => {
    boundariesPromise = null;
    throw error;
  });
}

export function searchOptions(params) {
  return {
    query: (params.get('q') ?? '').trim().slice(0, 100),
    stateCode: /^[A-Z]{2}$/.test(params.get('state') ?? '') ? params.get('state') : '',
    includeUnnamed: params.get('unnamed') === '1',
    page: Math.max(0, Math.min(100000, Number.parseInt(params.get('page'), 10) || 0))
  };
}

export function searchParams({ query, stateCode, includeUnnamed, page }) {
  const params = new URLSearchParams();
  if (query) params.set('q', query);
  if (stateCode) params.set('state', stateCode);
  if (includeUnnamed) params.set('unnamed', '1');
  if (page) params.set('page', page);
  return params.size ? '?' + params : '';
}

const nameField = "((name IS NOT NULL AND name <> '') OR (maplabel IS NOT NULL AND maplabel <> '') OR (namealternate IS NOT NULL AND namealternate <> ''))";

export function buildTrailQuery(options, state) {
  let where = baseFilter;
  if (options.query) {
    const escaped = options.query.toUpperCase().replaceAll("'", "''").replace(/[\[\]%_]/g, ' ').trim();
    if (!escaped) throw new Error('Enter a trail name');
    where += ` AND (UPPER(name) LIKE '%${escaped}%' OR UPPER(maplabel) LIKE '%${escaped}%' OR UPPER(namealternate) LIKE '%${escaped}%')`;
  } else if (!options.includeUnnamed) {
    where += ' AND ' + nameField;
  }
  const params = new URLSearchParams({
    where, f: 'json', outFields: fields, returnGeometry: 'false',
    orderByFields: 'name ASC,objectid ASC',
    resultOffset: String(options.page * pageSize), resultRecordCount: String(pageSize)
  });
  if (state) {
    params.set('geometry', JSON.stringify({ rings: state.rings }));
    params.set('geometryType', 'esriGeometryPolygon');
    params.set('spatialRel', 'esriSpatialRelIntersects');
    params.set('inSR', '4326');
  }
  return params;
}

async function queryLayer(params, fetcher, signal) {
  const timeout = AbortSignal.timeout(30000);
  const combined = signal ? AbortSignal.any([signal, timeout]) : timeout;
  // State polygons can exceed browser and server URL length limits.
  const request = params.has('geometry') ? { method: 'POST', body: params } : {};
  const url = usgsLayer + '/query' + (request.method ? '' : '?' + params);
  const response = await fetcher(url, { ...request, signal: combined });
  if (!response.ok) throw new Error('USGS request failed');
  const data = await response.json();
  if (data.error || !Array.isArray(data.features)) throw new Error('USGS trail data unavailable');
  return data;
}

const clean = value => typeof value === 'string' ? value.trim() : '';
export function trailRecord(attributes, geometry, includeAllUses = false) {
  const permanent = clean(attributes.permanentidentifier);
  const objectId = Number.isSafeInteger(attributes.objectid) && attributes.objectid > 0 ? attributes.objectid : null;
  const id = allowedId.test(permanent) ? permanent : objectId && 'oid-' + objectId;
  if (!id || (!includeAllUses && !['Y', null, undefined].includes(attributes.hikerpedestrian))) return null;
  const record = {
    id, name: clean(attributes.name) || clean(attributes.maplabel) || clean(attributes.namealternate) || 'Unnamed trail segment',
    miles: Number.isFinite(attributes.lengthmiles) && attributes.lengthmiles > 0 ? attributes.lengthmiles : null,
    surface: clean(attributes.trailsurface),
    source: clean(attributes.sourceoriginator), dataset: clean(attributes.sourcedatadecscription),
    hikingListed: attributes.hikerpedestrian === 'Y', hikingProhibited: attributes.hikerpedestrian === 'N',
    trailType: ({ 'Terra Trail': 'Land trail', 'Snow Trail': 'Snow trail', 'Water Trail': 'Water trail' })[attributes.trailtype],
    geometrySource: usgsLayer, sourceAttribution: 'USGS National Digital Trails'
  };
  if (hasGeometry({ geometry })) record.geometry = geometry;
  return record;
}

export async function searchTrails(options, state, signal, fetcher = fetch) {
  if (options.stateCode && state?.code !== options.stateCode) throw new Error('Choose a supported state or territory');
  const data = await queryLayer(buildTrailQuery(options, state), fetcher, signal);
  const trails = data.features.map(feature => trailRecord(feature.attributes ?? {})).filter(Boolean);
  return { trails, hasMore: data.exceededTransferLimit === true };
}

export async function loadTrailSegment(id, signal, fetcher = fetch) {
  if (!allowedId.test(id ?? '')) return null;
  const objectId = /^oid-(\d+)$/.exec(id)?.[1];
  const identity = objectId ? `objectid = ${objectId}` : `permanentidentifier = '${id}'`;
  const params = new URLSearchParams({
    where: identity,
    f: 'geojson', outFields: fields, returnGeometry: 'true', outSR: '4326', returnM: 'false',
    returnZ: 'false', resultRecordCount: '1'
  });
  const data = await queryLayer(params, fetcher, signal);
  const [feature] = data.features;
  return feature ? trailRecord(feature.properties ?? {}, feature.geometry, true) : null;
}

export async function nearbyTrails({ longitude, latitude }, signal, fetcher = fetch) {
  const params = new URLSearchParams({
    where: baseFilter + ' AND ' + nameField, f: 'json', outFields: fields, returnGeometry: 'false',
    geometry: [longitude.toFixed(2), latitude.toFixed(2)].join(','), geometryType: 'esriGeometryPoint',
    inSR: '4326', spatialRel: 'esriSpatialRelIntersects', distance: '40', units: 'esriSRUnit_StatuteMile',
    orderByFields: 'name ASC,objectid ASC', resultRecordCount: '12'
  });
  const data = await queryLayer(params, fetcher, signal);
  return data.features.map(feature => trailRecord(feature.attributes ?? {})).filter(Boolean);
}
