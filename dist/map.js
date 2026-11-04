// Simplified demo traces. Each first coordinate is an approximate trailhead.
const bearLake = [40.31193, -105.64569];
export const routes = {
  'angels-landing': [[37.2590, -112.9508], [37.2607, -112.9531], [37.2635, -112.9536], [37.2691, -112.9508], [37.2720, -112.9494], [37.2693, -112.9470]],
  'queens-garden': [[37.6312, -112.1630], [37.6293, -112.1614], [37.6267, -112.1610], [37.6248, -112.1622]],
  'riverside-walk': [[37.2854, -112.9478], [37.2892, -112.9476], [37.2931, -112.9490], [37.2963, -112.9480]],
  watchman: [[37.2016, -112.9866], [37.2024, -112.9836], [37.1998, -112.9813], [37.1966, -112.9805], [37.1952, -112.9830]],
  'bear-lake': [bearLake, [40.3129, -105.6471], [40.3138, -105.6496], [40.3125, -105.6503], [40.3116, -105.6477], bearLake],
  'emerald-lake': [bearLake, [40.3085, -105.6506], [40.3082, -105.6574], [40.3095, -105.6664], [40.3090, -105.6750]],
  'flattop-mountain': [bearLake, [40.3151, -105.6483], [40.3196, -105.6552], [40.3191, -105.6686], [40.3147, -105.6795], [40.3105, -105.6908]],
  'hall-of-mosses': [[47.8608, -123.9348], [47.8619, -123.9346], [47.8631, -123.9355], [47.8623, -123.9370], [47.8611, -123.9365], [47.8608, -123.9348]],
  'rialto-beach': [[47.9211, -124.6382], [47.9278, -124.6398], [47.9350, -124.6418], [47.9414, -124.6450]],
  'cape-alava': [[48.1543, -124.6718], [48.1537, -124.6890], [48.1555, -124.7041], [48.1593, -124.7212], [48.1640, -124.7326]]
};

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
    script.onerror = () => reject(new Error('Map library unavailable'));
    document.head.append(script);
  });
  return library;
}

export function removeMap() {
  activeMap?.remove();
  activeMap = null;
}

export async function mountMap(element, trails, initialTrail) {
  try {
    const L = await loadLeaflet();
    if (!element.isConnected) return;
    element.textContent = '';
    const map = L.map(element, { scrollWheelZoom: false });
    activeMap = map;
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19, attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
    }).addTo(map);
    const areaBounds = trails.flatMap(trail => routes[trail.id]);
    const fitArea = () => map.fitBounds(areaBounds, { padding: [30, 30], maxZoom: 14 });
    fitArea();

    let selected = initialTrail?.id;
    let line;
    const pins = new Map();
    const show = id => {
      line?.remove();
      if (id) line = L.polyline(routes[id], { color: '#087054', weight: 5, opacity: 1, dashArray: '7 7', interactive: false }).addTo(map);
    };
    const select = trail => {
      const { id } = trail;
      selected = id;
      show(id);
      // Leave room for the whole route with the trailhead at the center.
      const routeZoom = map.getBoundsZoom(L.latLngBounds(routes[id]), false, [70, 90]);
      const zoom = Math.min(15, routeZoom - 1);
      map.setView(pinPoint(trail, zoom), zoom, { animate: false });
      pins.get(id).openPopup();
    };

    // Nearby/shared trailheads are offset in screen pixels so every pin stays reachable.
    const shared = new Map();
    for (const trail of trails) {
      const key = routes[trail.id][0].join(',');
      shared.set(key, [...(shared.get(key) ?? []), trail.id]);
    }
    const pinPoint = (trail, zoom = map.getZoom()) => {
      const head = routes[trail.id][0];
      const group = shared.get(head.join(','));
      if (group.length === 1) return head;
      const angle = group.indexOf(trail.id) * 2 * Math.PI / group.length;
      return map.unproject(map.project(head, zoom).add(L.point(22 * Math.cos(angle), 22 * Math.sin(angle))), zoom);
    };
    for (const trail of trails) {
      const pin = L.marker(pinPoint(trail), { title: trail.name, alt: trail.name }).addTo(map);
      pins.set(trail.id, pin);
      const popup = document.createElement('div');
      const name = document.createElement('strong');
      name.textContent = trail.name;
      const link = document.createElement('a');
      link.href = '#trail/' + trail.id;
      link.textContent = 'View hike';
      popup.append(name, document.createElement('br'), link);
      pin.bindPopup(popup, { autoPan: false });
      pin.on('mouseover', () => show(trail.id));
      pin.on('mouseout', () => show(selected));
      pin.on('click', () => select(trail));
      pin.getElement().addEventListener('focus', () => show(trail.id));
      pin.getElement().addEventListener('blur', () => show(selected));
    }
    map.on('zoomend', () => trails.forEach(trail => pins.get(trail.id).setLatLng(pinPoint(trail))));
    map.on('click', () => { selected = undefined; show(); });
    const reset = element.parentElement.querySelector('[data-fit-area]');
    reset.disabled = false;
    reset.addEventListener('click', () => {
      selected = undefined;
      show();
      map.closePopup();
      fitArea();
    });
    element.parentElement.querySelectorAll('[data-map-route]').forEach(button => {
      button.disabled = false;
      button.addEventListener('click', () => select(trails.find(trail => trail.id === button.dataset.mapRoute)));
    });
    if (initialTrail) select(initialTrail);
  } catch {
    if (element.isConnected) element.textContent = 'The map could not load. Use the trail links below to open the locations.';
  }
}
