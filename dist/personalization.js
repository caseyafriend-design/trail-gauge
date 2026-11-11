const day = 86400000;
export const terrainLabels = {
  descent: 'steep descents', footing: 'rough footing', exposure: 'exposure', crossing: 'unbridged crossings'
};
export const effortLabels = { easy: 'Easy', moderate: 'Moderate', hard: 'Hard' };

export function trailTerrain(trail) {
  const grade = trail.descentGrade ?? trail.maxGrade;
  return {
    descent: grade == null ? null : grade >= 15,
    footing: trail.unevenFooting ?? null,
    exposure: trail.exposed ?? null,
    crossing: trail.unbridgedCrossing ?? null
  };
}

export function trailLimits(trail, group) {
  const limits = [];
  const unknown = new Set();
  const terrain = trailTerrain(trail);
  for (const hiker of group) {
    const profile = hiker.planning ?? {};
    if (profile.maxMiles != null && trail.miles > profile.maxMiles) {
      limits.push(`${hiker.name} set a ${profile.maxMiles} mi distance limit`);
    }
    if (profile.maxGain != null && trail.gain > profile.maxGain) {
      limits.push(`${hiker.name} set a ${profile.maxGain.toLocaleString('en-US')} ft ascent limit`);
    }
    for (const key of profile.avoid ?? []) {
      if (!Object.hasOwn(terrain, key)) continue;
      if (terrain[key] === true) limits.push(`${hiker.name} avoids ${terrainLabels[key]}`);
      if (terrain[key] == null) unknown.add(terrainLabels[key]);
    }
  }
  return { limits, unknown: [...unknown] };
}

export function terrainPaceCost(trail, packWeight) {
  const uphill = trail.ascentGrade ?? trail.typicalGrade ?? 0;
  const downhill = trail.descentGrade ?? trail.typicalGrade ?? 0;
  const surface = trail.unevenFooting ? .08 : /gravel|greenstone|dirt|rocky|earth/i.test(trail.surface ?? '') ? .03 : 0;
  const grade = Math.min(.3, Math.max(0, uphill - 6) * .006 + Math.max(0, downhill - 6) * .006);
  const pack = Math.min(.28, Math.max(0, (packWeight ?? 8) - 8) * .007);
  return surface + grade + pack;
}

export function comparableHikes(trail, hiker, history = [], trip = {}, now = Date.now()) {
  const recent = hiker.planning?.recent;
  const records = history.filter(entry => entry.hikerId === hiker.id && entry.calibrate !== false);
  const candidates = recent ? [...records, { ...recent, title: recent.title || 'Recent hike from profile', profileHike: true }] : records;
  return candidates.flatMap(record => {
    const age = (now - Date.parse(record.date + 'T00:00:00Z')) / day;
    if (!(age >= -1 && age <= 365) || !(record.moving > 0) || !(record.distance > 0) || !(record.gain >= 0)
      || (record.minutes != null && record.moving > record.minutes)) return [];
    const ratio = record.distance / trail.miles;
    const gradeGap = Math.abs(record.gain / record.distance - trail.gain / trail.miles);
    const packGap = record.packWeight != null && trip.packWeight != null ? Math.abs(record.packWeight - trip.packWeight) : null;
    if (ratio < .55 || ratio > 1.8 || gradeGap > 240 || (packGap != null && packGap > 18)) return [];
    const adjusted = record.moving / (1 + (record.terrainCost ?? 0)) - record.gain / 100;
    const pace = record.distance * 60 / adjusted;
    if (adjusted <= 0 || pace < .45 || pace > 5) return [];
    return [{ record, pace, distance: Math.abs(Math.log(ratio)) + gradeGap / 240 + age / 730 + (packGap ?? 5) / 40 }];
  }).sort((a, b) => a.distance - b.distance).slice(0, 3);
}

export function paceFor(trail, hiker, context = {}) {
  const { trip = {}, history, now } = context;
  const outings = comparableHikes(trail, hiker, history, trip, now);
  if (outings.length) {
    const pace = Math.min(...outings.map(({ pace }) => pace));
    return { pace, outings: outings.map(({ record }) => record), method: 'completed hikes' };
  }
  const pace = hiker.planning?.pace ?? (hiker.advanced ? hiker.pace : null);
  if (pace) return { pace, outings: [], method: 'usual pace' };
  const frequency = { weekly: .12, monthly: .04, rarely: -.1 }[hiker.planning?.frequency] ?? 0;
  return { pace: 1.5 + .4 * (hiker.fitness ?? 2) + frequency, outings: [], method: 'baseline' };
}

export function altitudeNotes(trail, group) {
  const elevation = trail.upperPoint?.elevationFt ?? trail.trailheadElevation;
  if (elevation == null) return { text: 'Route altitude is unavailable.', high: false };
  const text = `${elevation.toLocaleString('en-US')} ft at the ${trail.upperPoint ? 'upper route sample' : 'trailhead'}.`;
  if (elevation < 8000) return { text, high: false };
  const missing = group.filter(hiker => hiker.planning?.altitude !== 'recent').length;
  return { high: true, text: text + (missing ? ` ${missing} ${missing === 1 ? 'hiker has' : 'hikers have'} no recent altitude experience on record.` : '')
    + ' Review acclimatization and altitude illness guidance before the hike.' };
}
