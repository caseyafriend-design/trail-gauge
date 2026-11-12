import { trailLimits, trailTerrain } from './personalization.js';

export const ratings = ['Easy', 'Moderate', 'Hard'];
export const factorNames = ['Elevation gain', 'Steepness', 'Feels-like temperature', 'Fitness demand for this group',
  'Distance', 'Altitude', 'Wet or snowy weather', 'Wind gusts', 'Experience gap', 'Route fit'];
export const factorWeights = [.17, .10, .12, .15, .13, .10, .07, .05, .10, .15];

export function comfortDistance(hiker) {
  return hiker.planning?.distance ?? (hiker.advanced ? hiker.distance : null) ?? (2 + hiker.fitness + hiker.experience);
}

export function comfortClimb(hiker) {
  return hiker.planning?.climb ?? (hiker.advanced ? hiker.climb : null) ?? (200 + 200 * hiker.fitness + 150 * hiker.experience);
}

export function profileChallenges(trail, hiker) {
  const profile = hiker.planning ?? {};
  if (!hiker.advanced && !['distance', 'climb', 'descent', 'footing', 'exposure', 'crossing'].some(key => profile[key] != null)) return [];
  const terrain = trailTerrain(trail);
  const grade = Math.max(trail.ascentGrade ?? trail.typicalGrade ?? 0, trail.descentGrade ?? trail.typicalGrade ?? 0);
  return [
    ['distance', trail.miles / comfortDistance(hiker) * 55],
    ['climb', trail.gain / Math.max(100, comfortClimb(hiker)) * 55],
    ...(terrain.footing ? [['footing', [65, 35, 15][(profile.footing ?? hiker.footing ?? 2) - 1]]] : []),
    ...(grade ? [['steep terrain', grade * 5 * [1.3, .85, .55][(profile.descent ?? hiker.exposure ?? 2) - 1]]] : []),
    ...(terrain.exposure && profile.exposure ? [['exposure', [80, 45, 20][profile.exposure - 1]]] : []),
    ...(terrain.crossing && profile.crossing ? [['crossings', [80, 45, 20][profile.crossing - 1]]] : [])
  ];
}

export function weatherStress(weather) {
  if (!weather) return [0, 0, 0];
  const { apparentMin, apparentMax, gustMax, types, probabilityMax } = weather;
  const temperature = Math.min(100, Math.max(0, (apparentMax - 75) * 3.35, (40 - apparentMin) * 2));
  const wet = types.some(type => ['Snow', 'Freezing precipitation', 'Thunderstorms'].includes(type))
    ? 75 : types.some(type => ['Rain', 'Showers', 'Drizzle'].includes(type)) ? 45 : 0;
  const precipitation = Math.max(wet, probabilityMax * .4);
  const wind = Math.min(100, Math.max(0, (gustMax - 18) * 3));
  return [temperature, precipitation, wind];
}

export function estimate(trail, group, weather) {
  if (!group.length) return null;
  const readiness = hiker => hiker.fitness + hiker.experience;
  const minimum = Math.min(...group.map(readiness));
  const leastReady = group.filter(hiker => readiness(hiker) === minimum);
  const averageStrain = (members, key) => members.reduce((sum, hiker) => sum + (3 - hiker[key]) * 50, 0) / members.length;
  const groupStrain = key => .8 * averageStrain(leastReady, key) + .2 * averageStrain(group, key);
  const fitnessStrain = groupStrain('fitness');
  const experienceStrain = groupStrain('experience');
  const basicFit = (fitnessStrain + experienceStrain) / 2;
  const fitScores = group.map(hiker => {
    const challenges = profileChallenges(trail, hiker);
    return challenges.length ? Math.min(100, Math.max(...challenges.map(([, value]) => value))) : basicFit;
  });
  const [temperature, precipitation, wind] = weatherStress(weather);
  const steepness = Math.max(trail.ascentGrade ?? trail.typicalGrade ?? 0, trail.descentGrade ?? trail.typicalGrade ?? 0);
  const factors = [Math.min(trail.gain / 20, 100), steepness === 0 ? null : Math.min(100, steepness * 5),
    weather ? temperature : null, fitnessStrain, Math.min(trail.miles * 10, 100), null,
    weather ? precipitation : null, weather ? wind : null, experienceStrain, Math.max(...fitScores)];
  const weatherIndexes = [2, 6, 7];
  const baselineWeight = factorWeights.reduce((total, weight, i) =>
    total + (factors[i] === null || weatherIndexes.includes(i) ? 0 : weight), 0);
  const contributions = factors.map((value, i) => value === null ? 0
    : value * factorWeights[i] / (weatherIndexes.includes(i) ? 1 : baselineWeight));
  const score = Math.min(100, contributions.reduce((sum, value) => sum + value, 0));
  const rating = score < 44 ? 'Easy' : score < 68 ? 'Moderate' : 'Hard';
  const drivers = contributions.map((value, i) => ({ value, name: factorNames[i] }))
    .filter(factor => factor.value > 0).sort((a, b) => b.value - a.value)
    .slice(0, 2).map(factor => factor.name.toLowerCase());
  return { factors, score, rating, drivers, ...trailLimits(trail, group) };
}
