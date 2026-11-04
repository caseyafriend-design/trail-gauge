import { weatherPresets, comfortDistance, comfortClimb, profileChallenges, estimate } from './model.js';

// Illustrative popularity, reviews, crowds and route characteristics for the demo.
export const profiles = {
  'angels-landing': { stars: 4.9, reviews: 2840, popularity: 'Very popular', weekday: 'High', weekend: 'Very high', route: 'Out and back', surface: 'Sandstone and exposed rock', check: 'Permit requirements, exposed sections, and shuttle access' },
  'queens-garden': { stars: 4.7, reviews: 1190, popularity: 'Popular', weekday: 'Moderate', weekend: 'High', route: 'Out and back', surface: 'Dirt and sandstone', check: 'Trailhead access and muddy conditions' },
  'riverside-walk': { stars: 4.6, reviews: 1550, popularity: 'Very popular', weekday: 'High', weekend: 'Very high', route: 'Out and back', surface: 'Paved riverside path', check: 'Shuttle schedule and riverside closures' },
  watchman: { stars: 4.6, reviews: 720, popularity: 'Popular', weekday: 'Moderate', weekend: 'High', route: 'Out and back', surface: 'Rocky desert path', check: 'Shade, water, and trailhead parking' },
  'bear-lake': { stars: 4.7, reviews: 2100, popularity: 'Very popular', weekday: 'High', weekend: 'Very high', route: 'Loop', surface: 'Packed path around the lake', check: 'Timed entry and trailhead access' },
  'emerald-lake': { stars: 4.8, reviews: 1780, popularity: 'Very popular', weekday: 'High', weekend: 'Very high', route: 'Out and back', surface: 'Rocky alpine path', check: 'Timed entry, parking, and snow or ice' },
  'flattop-mountain': { stars: 4.8, reviews: 610, popularity: 'Popular', weekday: 'Low', weekend: 'Moderate', route: 'Out and back', surface: 'Steep rock and exposed alpine terrain', check: 'High winds, lightning, and snow' },
  'hall-of-mosses': { stars: 4.7, reviews: 1340, popularity: 'Very popular', weekday: 'Moderate', weekend: 'Very high', route: 'Loop', surface: 'Forest dirt, roots, and steps', check: 'Access road and parking waits' },
  'rialto-beach': { stars: 4.8, reviews: 940, popularity: 'Popular', weekday: 'Moderate', weekend: 'High', route: 'Out and back', surface: 'Pebbles, sand, and driftwood', check: 'Tides, waves, and beach crossings' },
  'cape-alava': { stars: 4.6, reviews: 420, popularity: 'Less visited', weekday: 'Low', weekend: 'Moderate', route: 'Out and back', surface: 'Forest boardwalk and coast', check: 'Tides, slick boardwalk, and trailhead access' }
};

export const parkGuides = {
  'angels-landing': 'https://www.nps.gov/zion/planyourvisit/index.htm',
  'queens-garden': 'https://www.nps.gov/brca/planyourvisit/index.htm',
  'riverside-walk': 'https://www.nps.gov/zion/planyourvisit/index.htm',
  watchman: 'https://www.nps.gov/zion/planyourvisit/index.htm',
  rockies: 'https://www.nps.gov/romo/planyourvisit/index.htm',
  olympic: 'https://www.nps.gov/olym/planyourvisit/index.htm'
};

function duration(minutes) {
  const hours = Math.floor(minutes / 60);
  const remainder = minutes % 60;
  return [hours ? `${hours} hr` : '', remainder ? `${remainder} min` : ''].filter(Boolean).join(' ');
}

export function timeRange(trail, group, weather) {
  const pace = group.length ? Math.min(...group.map(hiker =>
    (hiker.advanced ? hiker.pace : null) ?? (1.5 + .4 * hiker.fitness))) : 2.3;
  const conditions = weatherPresets[weather];
  const temperature = Math.max(0, conditions.temperature - 80, 35 - conditions.temperature);
  const altitude = Math.max(0, (trail.altitude ?? 6000) - 6000);
  const baseMinutes = trail.miles / pace * 60 + trail.gain / 100;
  const longestEffort = group.length ? Math.max(trail.miles / groupDistance(group),
    ...group.map(hiker => trail.gain / Math.max(200, comfortClimb(hiker)))) : 1;
  const extraBreaks = Math.min(.35, Math.max(0, longestEffort - 1) * .12);
  const moving = baseMinutes * (1 + trail.terrain / 500 + conditions.footing / 450 + altitude / 35000 + temperature / 150 + extraBreaks);
  const low = Math.max(5, Math.round(moving / 5) * 5);
  const high = Math.max(low + 5, Math.ceil(moving * 1.2 / 5) * 5);
  return { low, high };
}

export function estimatedTime(trail, group, weather) {
  const { low, high } = timeRange(trail, group, weather);
  return `${duration(low)}–${duration(high)}`;
}

export function bestGroupFit(trails, group, budget, weatherFor) {
  if (!group.length || !trails.length) return null;
  const distance = groupDistance(group);
  const climb = Math.min(...group.map(comfortClimb));
  const options = trails.map(trail => {
    const weather = weatherFor(trail);
    const { high } = timeRange(trail, group, weather);
    const { rating, score } = estimate(trail, group, weather);
    const issues = [];
    if (high > budget) issues.push(`could run ${duration(high - budget)} over budget`);
    if (trail.miles > distance) issues.push(`exceeds the group’s ${distance} mi comfort range`);
    if (trail.gain > climb) issues.push(`exceeds the group’s ${climb.toLocaleString('en-US')} ft climb comfort range`);
    if (rating === 'Hard') issues.push('rates Hard for this group');
    return { trail, high, score, issues };
  });
  const best = options.filter(option => !option.issues.length)
    .sort((a, b) => b.trail.miles - a.trail.miles || a.score - b.score)[0];
  return { best, closest: [...options].sort((a, b) => a.issues.length - b.issues.length
    || Math.max(0, a.high - budget) - Math.max(0, b.high - budget) || a.score - b.score)[0] };
}

export function groupDistance(group) {
  return Math.min(...group.map(comfortDistance));
}

export function groupTips(trail, group, weather) {
  if (!group.length) return ['Choose who’s hiking to see tips for your group.'];
  const tips = [];
  const distance = groupDistance(group);
  if (trail.miles > distance) tips.push(`This route exceeds the group’s ${distance} mi comfort range. Compare a shorter trail or plan an earlier turnaround.`);
  if (group.some(hiker => trail.gain > comfortClimb(hiker))) tips.push('The climb exceeds a hiker’s comfort range. Start at a steady pace and plan breaks before the steepest sections.');
  const challenges = group.flatMap(hiker => profileChallenges(trail, hiker, weather));
  if (challenges.some(([name, score]) => name === 'footing' && score >= 65)) tips.push('Uneven footing may be a concern for someone in the group. Consider a smoother trail or switch plans if the surface is slick.');
  if (challenges.some(([name, score]) => name === 'steep terrain' && score >= 65)) tips.push('Someone in the group prefers gentler terrain. Agree on a turnaround point before reaching steep sections.');
  if (weather === 'Hot') tips.push('Consider an earlier start and plan water and shade breaks.');
  if (weather === 'Cold' || weather === 'Icy') tips.push('Check current conditions and plan layers. Consider a lower trail if snow or ice exceeds the group’s experience.');
  if (weather === 'Wet') tips.push('Allow extra time on wet surfaces and check the route for crossings or slick boardwalks.');
  if (group.some(hiker => hiker.experience === 1)) tips.push('Let a newer hiker set the pace and check in at trail junctions.');
  return tips.length ? tips : ['Set a pace everyone can hold and agree on a turnaround time before leaving.'];
}
