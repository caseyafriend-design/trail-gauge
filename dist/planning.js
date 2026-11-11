import { comfortDistance, comfortClimb, profileChallenges, estimate, weatherStress } from './model.js';
import { paceFor, terrainPaceCost, trailLimits } from './personalization.js';

export function duration(minutes) {
  const hours = Math.floor(minutes / 60);
  const remainder = minutes % 60;
  return [hours ? `${hours} hr` : '', remainder ? `${remainder} min` : ''].filter(Boolean).join(' ') || '0 min';
}

export function timeRange(trail, group, weather, context = {}) {
  const { trip = {} } = context;
  const paces = group.map(hiker => ({ hiker, ...paceFor(trail, hiker, context) }));
  const pace = paces.length ? Math.min(...paces.map(hiker => hiker.pace)) : 2.3;
  const [temperature, precipitation, wind] = weatherStress(weather);
  const uphill = trail.ascentGrade ?? trail.typicalGrade ?? 0;
  const downhill = trail.descentGrade ?? trail.typicalGrade ?? 0;
  const baseMinutes = trail.miles / pace * 60 + trail.gain / 100;
  const moving = baseMinutes * (1 + terrainPaceCost(trail, trip.packWeight) + temperature / 350 + precipitation / 450 + wind / 650);
  const uncertain = !paces.length || paces.some(hiker => hiker.outings.length === 0) || !trail.surface || !(uphill && downhill);
  const factor = uncertain ? 1.2 : 1.14;
  const movingLow = Math.max(5, Math.round(moving / 5) * 5);
  const movingHigh = Math.max(movingLow + 5, Math.ceil(moving * factor / 5) * 5);
  const breaks = trip.breaks ?? 0;
  const nights = trip.nights ?? 0;
  const stopMinutes = nights * (trip.nightHours ?? 8) * 60;
  return { low: movingLow + breaks + stopMinutes, high: movingHigh + breaks + stopMinutes,
    movingLow, movingHigh, breaks, stopMinutes, uncertain, paces };
}

export function estimatedTime(trail, group, weather, context) {
  const { low, high } = timeRange(trail, group, weather, context);
  return `${duration(low)}–${duration(high)}`;
}

export function groupFit(trail, group, budget, weather, context) {
  const { high } = timeRange(trail, group, weather, context);
  const result = estimate(trail, group, weather);
  const issues = [...(result?.limits ?? [])];
  if (high > budget) issues.push(`the upper estimate is ${duration(high - budget)} over budget`);
  for (const hiker of group) {
    if (trail.miles > comfortDistance(hiker)) issues.push(`${hiker.name ?? 'a hiker'} may exceed their ${comfortDistance(hiker)} mi comfort range`);
    if (trail.gain > comfortClimb(hiker)) issues.push(`${hiker.name ?? 'a hiker'} may exceed their ${comfortClimb(hiker).toLocaleString('en-US')} ft climb comfort range`);
  }
  if (result?.unknown.length) issues.push(`check ${result.unknown.join(', ')} before choosing this trail`);
  if (result?.rating === 'Hard') issues.push('the route rates Hard for this group');
  return { trail, high, score: result?.score, rating: result?.rating, issues, limits: result?.limits ?? [] };
}

export function bestGroupFit(trails, group, budget, weatherFor, contextFor = () => ({})) {
  if (!group.length || !trails.length) return null;
  const options = trails.map(trail => groupFit(trail, group, budget, weatherFor(trail), contextFor(trail)));
  const best = options.filter(option => !option.issues.length)
    .sort((a, b) => b.trail.miles - a.trail.miles || a.score - b.score)[0];
  return { best, closest: [...options].sort((a, b) => a.limits.length - b.limits.length
    || a.issues.length - b.issues.length || Math.max(0, a.high - budget) - Math.max(0, b.high - budget)
    || a.score - b.score)[0] };
}

export function groupDistance(group) {
  return Math.min(...group.map(comfortDistance));
}

export function groupTips(trail, group, weather) {
  if (!group.length) return ['Choose who’s hiking to see tips for your group.'];
  const { limits, unknown } = trailLimits(trail, group);
  const tips = limits.map(limit => limit + '.');
  if (unknown.length) tips.push(`Confirm ${unknown.join(', ')} with the land manager before choosing this trail.`);
  const distance = groupDistance(group);
  if (trail.miles > distance) tips.push(`This route exceeds the group’s ${distance} mi comfort range. Compare a shorter trail or plan an earlier turnaround.`);
  if (group.some(hiker => trail.gain > comfortClimb(hiker))) tips.push('The climb exceeds a hiker’s comfort range. Start at a steady pace and plan breaks before the steepest sections.');
  const challenges = group.flatMap(hiker => profileChallenges(trail, hiker));
  if (challenges.some(([name, score]) => name === 'footing' && score >= 65)) {
    tips.push('The park documents uneven footing here. Someone in your group prefers smoother paths.');
  }
  if (challenges.some(([name, score]) => name === 'steep terrain' && score >= 65)) tips.push('Someone in the group prefers gentler terrain. Agree on a turnaround point before reaching steep sections.');
  if (weather?.apparentMax > 85) {
    tips.push(group.some(hiker => hiker.planning?.heat === 'unfamiliar')
      ? 'The forecast feels hot and a hiker reports little heat experience. Consider a cooler start and more shade breaks.'
      : 'The forecast feels hot. Consider an earlier start and plan water and shade breaks.');
  }
  if (weather?.apparentMin < 32) tips.push('The forecast feels cold. Check current conditions and plan layers.');
  if (weather?.types.some(type => ['Rain', 'Snow', 'Freezing precipitation', 'Thunderstorms'].includes(type))) {
    tips.push('The forecast includes precipitation. Allow extra time and check official trail conditions.');
  }
  if (group.some(hiker => hiker.experience === 1)) tips.push('Let a newer hiker set the pace and check in at trail junctions.');
  return tips.length ? tips : ['Set a pace everyone can hold and agree on a turnaround time before leaving.'];
}
