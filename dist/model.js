export const hikers = [
  { name: 'Alex', fitness: 3, experience: 3 },
  { name: 'Sam', fitness: 3, experience: 2 },
  { name: 'Jamie', fitness: 1, experience: 1 }
];

export const regions = [
  { id: 'utah', name: 'Utah', description: 'Desert canyons and exposed sandstone.', defaultWeather: 'Hot' },
  { id: 'rockies', name: 'Colorado Rockies', description: 'High elevations, alpine lakes, and rocky climbs.', defaultWeather: 'Mild' },
  { id: 'olympic', name: 'Olympic Peninsula', description: 'Temperate rainforest, wet roots, and a rugged coast.', defaultWeather: 'Wet' }
];

export const weatherPresets = {
  Mild: { label: 'Mild and dry', temperature: 65, precipitation: 'None', precipitationImpact: 0, footing: 0 },
  Hot: { label: 'Extreme heat', temperature: 97, precipitation: 'None', precipitationImpact: 0, footing: 0 },
  Cold: { label: 'Extreme cold', temperature: 12, precipitation: 'None', precipitationImpact: 0, footing: 0 },
  Wet: { label: 'Heavy rain', temperature: 49, precipitation: 'Heavy rain', precipitationImpact: 85, footing: 75 },
  Icy: { label: 'Snow and ice', temperature: 26, precipitation: 'Snow', precipitationImpact: 65, footing: 95 }
};

const utahTrails = [
  { id: 'angels-landing', name: 'Angels Landing', miles: 5.4, gain: 1600, rating: 'Moderate', slope: 75, terrain: 62 },
  { id: 'queens-garden', name: 'Queens Garden', miles: 1.8, gain: 450, rating: 'Moderate', slope: 42, terrain: 35 },
  { id: 'riverside-walk', name: 'Riverside Walk', miles: 2.2, gain: 80, rating: 'Easy', slope: 12, terrain: 12 },
  { id: 'watchman', name: 'Watchman Trail', miles: 3.3, gain: 640, rating: 'Moderate', slope: 53, terrain: 46 }
];

export const trails = [
  ...utahTrails.map(trail => ({ ...trail, region: 'utah' })),
  { id: 'bear-lake', region: 'rockies', name: 'Bear Lake Loop', miles: 0.5, gain: 20, altitude: 9500, rating: 'Easy', slope: 8, terrain: 12 },
  { id: 'emerald-lake', region: 'rockies', name: 'Emerald Lake', miles: 3.6, gain: 605, altitude: 10100, rating: 'Moderate', slope: 48, terrain: 52 },
  { id: 'flattop-mountain', region: 'rockies', name: 'Flattop Mountain', miles: 8.8, gain: 2849, altitude: 12300, rating: 'Hard', slope: 88, terrain: 80 },
  { id: 'hall-of-mosses', region: 'olympic', name: 'Hall of Mosses', miles: 0.8, gain: 100, altitude: 650, rating: 'Easy', slope: 15, terrain: 20 },
  { id: 'rialto-beach', region: 'olympic', name: 'Rialto Beach to Hole-in-the-Wall', miles: 3, gain: 0, altitude: 30, rating: 'Easy', slope: 5, terrain: 68, note: 'Tides affect access on this route. Check the park’s tide guidance before hiking.' },
  { id: 'cape-alava', region: 'olympic', name: 'Cape Alava', miles: 6.2, gain: 350, altitude: 200, rating: 'Moderate', slope: 22, terrain: 62 }
];

export const ratings = ['Easy', 'Moderate', 'Hard'];
export const factorNames = ['Elevation gain', 'Steepness', 'Temperature extremes', 'Terrain', 'Physical fitness',
  'Distance', 'Altitude', 'Slippery footing', 'Precipitation', 'Hiking experience', 'Route fit'];
export const factorWeights = [.13, .13, .12, .10, .10, .09, .07, .04, .02, .10, .10];

export function comfortDistance(hiker) {
  return (hiker.advanced ? hiker.distance : null) ?? (2 + hiker.fitness + hiker.experience);
}

export function comfortClimb(hiker) {
  return (hiker.advanced ? hiker.climb : null) ?? (200 + 200 * hiker.fitness + 150 * hiker.experience);
}

export function profileChallenges(trail, hiker, weather) {
  if (!hiker.advanced) return [];
  const footing = Math.max(trail.terrain, weatherPresets[weather].footing);
  return [
    ['distance', trail.miles / comfortDistance(hiker) * 55],
    ['climb', trail.gain / Math.max(100, comfortClimb(hiker)) * 55],
    ['footing', footing * [1.3, .85, .55][(hiker.footing ?? 2) - 1]],
    ['steep terrain', trail.slope * [1.3, .85, .55][(hiker.exposure ?? 2) - 1]]
  ];
}

export function estimate(trail, group, weather) {
  if (!group.length) return null;
  // Keep the same overall readiness score while showing its two inputs separately.
  const readiness = hiker => hiker.fitness + hiker.experience;
  const minimum = Math.min(...group.map(readiness));
  const leastReady = group.filter(hiker => readiness(hiker) === minimum);
  const averageStrain = (members, key) => members.reduce((sum, hiker) => sum + (3 - hiker[key]) * 50, 0) / members.length;
  const groupStrain = key => .8 * averageStrain(leastReady, key) + .2 * averageStrain(group, key);
  const fitnessStrain = groupStrain('fitness');
  const experienceStrain = groupStrain('experience');
  const basicFit = (fitnessStrain + experienceStrain) / 2;
  const fitScores = group.map(hiker => {
    const challenges = profileChallenges(trail, hiker, weather);
    return challenges.length ? Math.min(100, Math.max(...challenges.map(([, value]) => value))) : basicFit;
  });
  const altitude = Math.min(100, Math.max(0, ((trail.altitude ?? 6000) - 6000) / 60));
  const conditions = weatherPresets[weather];
  const temperatureStress = Math.min(100, Math.max(0, (conditions.temperature - 69) * 3.35, (45 - conditions.temperature) * 3));
  const factors = [Math.min(trail.gain / 20, 100), trail.slope, temperatureStress, trail.terrain, fitnessStrain,
    Math.min(trail.miles * 10, 100), altitude, conditions.footing, conditions.precipitationImpact, experienceStrain, Math.max(...fitScores)];
  const contributions = factors.map((value, index) => value * factorWeights[index]);
  const score = contributions.reduce((sum, value) => sum + value, 0);
  const rating = score < 44 ? 'Easy' : score < 68 ? 'Moderate' : 'Hard';
  const drivers = contributions.map((value, index) => ({ value, name: factorNames[index] }))
    .sort((a, b) => b.value - a.value).slice(0, 2).map(factor => factor.name.toLowerCase());
  return { factors, score, rating, drivers };
}
