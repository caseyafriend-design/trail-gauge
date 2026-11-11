import { addMapAttribution, mountBasemap } from './map.js';
import { loadBoundaries, usgsLayer } from './us-trails.js';
import { stateViewBounds, minimumTrailZoom, trailImageUrl, trailsAtPoint } from './us-map-data.js';

const overview = [[24, -125], [50, -66]];
const globalBounds = [[-85.0511, -180], [85.0511, 180]];

function mapFrame(map) {
  const bounds = map.getBounds();
  const { x: west, y: south } = map.options.crs.project(bounds.getSouthWest());
  const { x: east, y: north } = map.options.crs.project(bounds.getNorthEast());
  const { x: width, y: height } = map.getSize();
  const scale = Math.min(1, 2048 / Math.max(width, height));
  return { bounds, extent: [west, south, east, north],
    size: [Math.max(1, Math.round(width * scale)), Math.max(1, Math.round(height * scale))] };
}

async function loadTrailImage(frame, signal) {
  const response = await fetch(trailImageUrl(frame), { signal });
  if (!response.ok || !response.headers.get('content-type')?.startsWith('image/png')) {
    throw new Error('USGS trail image unavailable');
  }
  const url = URL.createObjectURL(await response.blob());
  try {
    const image = new Image();
    image.src = url;
    await image.decode();
    return image;
  } finally {
    URL.revokeObjectURL(url);
  }
}

function trailPopup(trails, map) {
  if (!trails.length) return 'No USGS trail was found at this point.';
  const center = map.getCenter();
  const view = [center.lat.toFixed(5), center.lng.toFixed(5), map.getZoom()].join(',');
  const content = document.createElement('div');
  const heading = document.createElement('strong');
  heading.textContent = trails.length === 1 ? 'Mapped trail segment' : 'Mapped trail segments';
  const list = document.createElement('ul');
  list.className = 'us-map-popup-list';
  for (const trail of trails.slice(0, 8)) {
    const item = document.createElement('li');
    const link = document.createElement('a');
    link.href = `#us-trail/${encodeURIComponent(trail.id)}?map=${view}`;
    link.textContent = trail.name;
    item.append(link);
    if (trail.trailType) item.append(' · ' + trail.trailType);
    list.append(item);
  }
  content.append(heading, list);
  return content;
}

function addVerifiedMarkers(L, map, trails) {
  const byPark = new Map();
  for (const trail of trails) {
    if (trail.trailhead) byPark.set(trail.parkCode, [...(byPark.get(trail.parkCode) ?? []), trail]);
  }
  for (const routes of byPark.values()) {
    const { park, trailhead: [lon, lat] } = routes[0];
    const marker = L.marker([lat, lon], { title: park, alt: `Verified hikes in ${park}` }).addTo(map);
    const content = document.createElement('div');
    const heading = document.createElement('strong');
    heading.textContent = park;
    const list = document.createElement('ul');
    list.className = 'us-map-popup-list';
    for (const route of routes) {
      const item = document.createElement('li');
      const link = document.createElement('a');
      link.href = '#trail/' + encodeURIComponent(route.id);
      link.textContent = route.name;
      item.append(link);
      list.append(item);
    }
    content.append(heading, list);
    marker.bindPopup(content, { autoPan: false });
    marker.on('click', () => {
      if (map.getZoom() < minimumTrailZoom) map.setView(marker.getLatLng(), 13, { animate: false });
    });
  }
}

async function bindStateJump(select, map, resetView) {
  try {
    const states = await loadBoundaries();
    if (!select.isConnected) return;
    for (const state of states) select.add(new Option(state.name, state.code));
    select.disabled = false;
    select.addEventListener('change', () => {
      const state = states.find(item => item.code === select.value);
      const bounds = state && stateViewBounds(state);
      map.closePopup();
      if (bounds) map.fitBounds(bounds, { padding: [22, 22], maxZoom: 13, animate: false });
      else resetView();
    });
  } catch {
    select.options[0].text = 'State jump unavailable';
  }
}

export async function mountUSMap(screen, routes, initialView) {
  const element = screen.querySelector('#trail-map');
  const status = screen.querySelector('[data-trail-layer-status]');
  const retry = screen.querySelector('[data-trail-layer-retry]');
  try {
    const mounted = await mountBasemap(element, {
      minZoom: 3, maxZoom: 19, maxBounds: globalBounds, maxBoundsViscosity: 1, scrollWheelZoom: true
    });
    if (!mounted || !element.isConnected) return;
    const { L, map } = mounted;
    addMapAttribution(map, usgsLayer, 'USGS National Digital Trails');
    const pane = map.createPane('nationalTrails');
    pane.style.zIndex = '410';
    pane.style.pointerEvents = 'none';
    const statePicker = screen.querySelector('[data-us-map-state]');
    const reset = screen.querySelector('[data-us-map-reset]');
    const resetView = () => {
      map.closePopup();
      statePicker.value = '';
      map.fitBounds(overview, { padding: [18, 18], maxZoom: 5, animate: false });
    };
    reset.disabled = false;
    reset.addEventListener('click', resetView);
    if (initialView) map.setView([initialView.lat, initialView.lon], initialView.zoom, { animate: false });
    else resetView();
    addVerifiedMarkers(L, map, routes);
    bindStateJump(statePicker, map, resetView);

    let overlay;
    let request;
    let lookup;
    let timer;
    let currentFrame;

    async function refresh() {
      retry.hidden = true;
      if (map.getZoom() < minimumTrailZoom) {
        overlay?.remove();
        overlay = null;
        status.textContent = 'Zoom in to see trail lines, or select a verified hike pin.';
        return;
      }
      const frame = mapFrame(map);
      const controller = new AbortController();
      request = controller;
      status.textContent = 'Loading USGS trail lines…';
      try {
        const signal = AbortSignal.any([controller.signal, AbortSignal.timeout(20000)]);
        const image = await loadTrailImage(frame, signal);
        if (signal.aborted || !element.isConnected) return;
        overlay?.remove();
        overlay = L.imageOverlay(image, frame.bounds, { pane: 'nationalTrails', className: 'us-trail-lines', alt: '' }).addTo(map);
        currentFrame = frame;
        status.textContent = 'USGS trail layer loaded. Select a trail line for details.';
      } catch {
        if (!controller.signal.aborted && element.isConnected) {
          overlay?.remove();
          overlay = null;
          status.textContent = 'USGS trail lines are unavailable for this view.';
          retry.hidden = false;
        }
      }
    }

    function cancelPending() {
      clearTimeout(timer);
      request?.abort();
      lookup?.abort();
      currentFrame = null;
    }

    function updateView() {
      cancelPending();
      timer = setTimeout(refresh, 180);
    }

    map.on('movestart', cancelPending);
    map.on('moveend resize', updateView);
    map.once('unload', cancelPending);
    retry.addEventListener('click', updateView);
    map.on('click', async ({ latlng }) => {
      if (!currentFrame) return;
      lookup?.abort();
      const controller = new AbortController();
      lookup = controller;
      const popup = L.popup({ autoPan: false }).setLatLng(latlng).setContent('Finding trail details…').openOn(map);
      try {
        const signal = AbortSignal.any([controller.signal, AbortSignal.timeout(12000)]);
        const trails = await trailsAtPoint(currentFrame, map.options.crs.project(latlng), signal);
        if (!signal.aborted && map.hasLayer(popup)) {
          popup.options.autoPan = true;
          popup.setContent(trailPopup(trails, map));
        }
      } catch {
        if (!controller.signal.aborted && map.hasLayer(popup)) popup.setContent('USGS trail details are unavailable.');
      }
    });
    refresh();
  } catch {
    if (element.isConnected) {
      element.textContent = 'The interactive map could not load.';
      status.textContent = 'You can still browse trails by name or state.';
    }
  }
}
