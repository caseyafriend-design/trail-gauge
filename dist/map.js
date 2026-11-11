import { hasGeometry } from './catalog.js';

const base = 'https://unpkg.com/leaflet@1.9.4/dist/';
let library;
let activeMap;

function loadLeaflet() {
  if (library) return library;
  library = new Promise((resolve, reject) => {
    const css = document.createElement('link');
    css.rel = 'stylesheet';
    css.href = base + 'leaflet.css';
    css.integrity = 'sha256-p4NxAoJBhIIN+hmNHrzRCf9tD/miZyoHS5obTRR9BMY=';
    css.crossOrigin = 'anonymous';
    document.head.append(css);
    const script = document.createElement('script');
    script.src = base + 'leaflet.js';
    script.integrity = 'sha256-20nQCchB9co0qIjJZRGuk2/Z9VM+kNiyxNV1lvTlZBo=';
    script.crossOrigin = 'anonymous';
    script.onload = () => resolve(window.L);
    script.onerror = () => {
      css.remove();
      script.remove();
      reject(new Error('Map library unavailable'));
    };
    document.head.append(script);
  }).catch(error => {
    library = null;
    throw error;
  });
  return library;
}

export function removeMap() {
  activeMap?.remove();
  activeMap = null;
}

export async function mountBasemap(element, options = {}) {
  const L = await loadLeaflet();
  if (!element.isConnected) return null;
  element.textContent = '';
  const map = L.map(element, { scrollWheelZoom: false, ...options });
  activeMap = map;
  const tiles = L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
    noWrap: Boolean(options.maxBounds),
    referrerPolicy: 'strict-origin-when-cross-origin',
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
  });
  const status = element.parentElement.querySelector('[data-basemap-status]');
  tiles.on('tileerror', () => {
    status.textContent = 'Some basemap tiles are unavailable.';
  });
  tiles.on('loading', () => {
    status.textContent = '';
  });
  tiles.addTo(map);
  return { L, map };
}

export function addMapAttribution(map, url, label) {
  const source = document.createElement('a');
  source.href = url;
  source.textContent = label;
  map.attributionControl.addAttribution(source.outerHTML);
}

export async function mountMap(element, trails, initialTrail, detail = false) {
  const routes = trails.filter(hasGeometry);
  if (!routes.length) {
    element.textContent = 'Verified route geometry is unavailable.';
    return;
  }
  try {
    const mounted = await mountBasemap(element);
    if (!mounted) return;
    const { L, map } = mounted;
    addMapAttribution(map, routes[0].geometrySource, routes[0].sourceAttribution ?? 'NPS trail GIS');
    const routeBounds = trail => L.geoJSON(trail.geometry).getBounds();
    const areaBounds = L.latLngBounds([]);
    routes.forEach(trail => areaBounds.extend(routeBounds(trail)));
    const fitArea = () => map.fitBounds(areaBounds, { padding: [26, 26], maxZoom: detail ? 16 : 14 });
    fitArea();

    let selected = routes.find(trail => trail.id === initialTrail?.id);
    let line;
    const pins = new Map();
    const show = trail => {
      line?.remove();
      if (trail) line = L.geoJSON(trail.geometry, {
        style: { color: '#087054', weight: 5, opacity: 1, interactive: false }
      }).addTo(map);
    };
    const select = trail => {
      selected = trail;
      show(trail);
      map.fitBounds(routeBounds(trail), { padding: [35, 35], maxZoom: 16, animate: false });
      if (!detail) pins.get(trail.id).openPopup();
    };
    for (const trail of routes) {
      if (detail && !trail.trailhead) continue;
      const [lon, lat] = trail.trailhead ?? trail.geometry.coordinates[0];
      const pin = L.marker([lat, lon], { title: trail.trailheadName, alt: trail.name + ' trailhead' }).addTo(map);
      pins.set(trail.id, pin);
      const popup = document.createElement('div');
      const name = document.createElement('strong');
      name.textContent = trail.trailheadName;
      popup.append(name);
      if (!detail) {
        const link = document.createElement('a');
        link.href = '#trail/' + trail.id;
        link.textContent = 'View hike';
        popup.append(document.createElement('br'), link);
        pin.on('mouseover', () => show(trail));
        pin.on('mouseout', () => show(selected));
        pin.on('click', () => select(trail));
        pin.getElement().addEventListener('focus', () => show(trail));
        pin.getElement().addEventListener('blur', () => show(selected));
      }
      pin.bindPopup(popup, { autoPan: false });
    }
    if (!detail) {
      map.on('click', () => { selected = undefined; show(); });
      const reset = element.parentElement.querySelector('[data-fit-area]');
      if (reset) {
        reset.disabled = false;
        reset.addEventListener('click', () => {
          selected = undefined;
          show();
          map.closePopup();
          fitArea();
        });
      }
      element.parentElement.querySelectorAll('[data-map-route]').forEach(button => {
        const trail = routes.find(item => item.id === button.dataset.mapRoute);
        if (trail) {
          button.disabled = false;
          button.addEventListener('click', () => select(trail));
        }
      });
    }
    if (selected) select(selected);
  } catch {
    if (element.isConnected) element.textContent = 'The interactive map could not load. See the official trail links for route information.';
  }
}
