import { comparableHikes } from './personalization.js';
import { duration } from './planning.js';

export const packingCategories = { food: 'Food', water: 'Water', gear: 'Gear' };
export const defaultTrip = { packWeight: null, breaks: 0, nights: 0, nightHours: 8, sun: '', refill: 'none',
  firstRefill: null, longestGap: null, refillNotes: '', reserve: .5 };

export function tripKey(trail, group) {
  return JSON.stringify([trail.id, ...group.map(hiker => hiker.id).sort()]);
}

const heatBand = apparent => !Number.isFinite(apparent) ? '' : apparent >= 85 ? 'hot' : apparent < 50 ? 'cool' : 'mild';
const roundL = value => Math.round(value * 10) / 10;
export const liters = value => Number(value.toFixed(1)).toLocaleString('en-US') + ' L';
export const litersRange = (low, high) => low === high ? liters(low) : `${low.toLocaleString('en-US')}–${liters(high)}`;

function waterFor(trail, hiker, time, weather, trip, edits, context) {
  const history = comparableHikes(trail, hiker, context.history, trip, context.now);
  const logged = history.map(item => item.record).find(record => record.waterUsed > 0);
  const personal = hiker.planning?.water ?? {};
  const conditions = heatBand(weather?.apparentMax);
  const sun = trip.sun || trail.sun || '';
  const effort = trail.miles >= 5 || trail.gain >= 1200 ? 'hard' : trail.miles > 2 || trail.gain > 300 ? 'moderate' : 'easy';
  const activeLow = time.movingLow + time.breaks;
  const activeHigh = time.movingHigh + time.breaks;
  const source = logged ? { used: logged.waterUsed, hours: (logged.minutes ?? logged.moving) / 60,
    conditions: logged.conditions, effort: logged.effort, sun: logged.sun } : personal;
  const hasPersonal = source.used > 0 && source.hours > 0;
  const mismatch = hasPersonal && (!source.conditions || !conditions || source.conditions !== conditions
    || !source.effort || source.effort !== effort || (sun && source.sun !== sun));
  const hot = conditions === 'hot' || (sun === 'exposed' && conditions !== 'cool');
  const hourly = hasPersonal ? source.used / source.hours : null;
  const lowerRate = hasPersonal ? hourly * (mismatch ? .65 : .8) : conditions === 'cool' ? .25 : hot ? .4 : .3;
  let upperRate = hasPersonal ? hourly * (mismatch ? 1.45 : 1.2) : hot ? .8 : .6;
  if (hasPersonal && hot && source.conditions !== 'hot') upperRate = Math.max(.8, upperRate);
  if (!hasPersonal && effort === 'hard') upperRate += .1;
  const suggestedLow = Math.max(.1, roundL(lowerRate * activeLow / 60));
  const suggestedHigh = Math.max(suggestedLow, roundL(upperRate * activeHigh / 60));
  const low = edits?.low ?? suggestedLow;
  const high = edits?.high ?? Math.max(low, suggestedHigh);
  const refillConfirmed = trip.refill === 'confirmed' && trip.firstRefill > 0 && trip.firstRefill < activeHigh
    && trip.longestGap >= trip.firstRefill && trip.longestGap < activeHigh;
  const reserve = trip.reserve ?? defaultTrip.reserve;
  const carryFor = (estimate, minutes) => roundL(estimate * Math.min(1, minutes / activeHigh) + reserve);
  const startingMinutes = refillConfirmed ? trip.firstRefill : activeHigh;
  const longestMinutes = refillConfirmed ? trip.longestGap : activeHigh;
  const startingLow = carryFor(low, startingMinutes);
  const startingHigh = carryFor(high, startingMinutes);
  const maxCarry = carryFor(high, longestMinutes);
  const capacity = personal.capacity;
  return { hiker, low, high, suggestedLow, suggestedHigh, startingLow, startingHigh, maxCarry, capacity, reserve,
    refillConfirmed, exceedsCapacity: capacity != null && maxCarry > capacity,
    source: hasPersonal ? (logged ? logged.title ?? 'a comparable completed hike' : 'your similar-hike water log') : null,
    mismatch, edited: edits?.low != null || edits?.high != null, sweatRate: personal.sweatRate, sweatConditions: personal.sweatConditions,
    hot, effort, sun, activeHigh };
}

function foodWindows(start, minutes, nights, nightHours) {
  const elapsedDays = nights + 1;
  const hour = start ? Number(start.split(':')[0]) + Number(start.split(':')[1]) / 60 : 9;
  const daily = minutes / 60 / elapsedDays;
  const windows = [{ label: 'During-hike snacks', reason: 'Pack small portions for snack breaks.' }];
  for (let day = 0; day < elapsedDays; day++) {
    const begins = day ? 7 : hour;
    const ends = begins + daily;
    if (begins <= 8 && ends >= 7 && !day) windows.push({ label: 'Breakfast on the trail', reason: 'Your hiking window overlaps breakfast.' });
    if (begins <= 13 && ends >= 12) windows.push({ label: `Lunch${nights ? ' · day ' + (day + 1) : ''}`, reason: 'This hiking window overlaps lunch.' });
    if (day === nights && begins <= 19 && ends >= 18) windows.push({ label: 'Dinner on the trail', reason: 'Your hiking window overlaps dinner.' });
    if (day < nights) {
      windows.push({ label: `Overnight dinner · night ${day + 1}`, reason: 'Pack this separately from trail snacks.' });
      windows.push({ label: `Overnight breakfast · day ${day + 2}`, reason: `For the morning after a planned ${nightHours}-hour stop.` });
    }
  }
  windows.push({ label: 'Reserve food', reason: 'Set aside extra food for delays.' });
  return windows;
}

function foodFor(trail, hiker, time, trip, start, weather, context) {
  const preferences = hiker.planning?.food ?? {};
  const exclusions = [preferences.diet, preferences.allergens].filter(Boolean);
  const snack = preferences.snack && (!exclusions.length || preferences.ingredients) ? preferences.snack : null;
  const meal = preferences.meal && (!exclusions.length || preferences.mealIngredients)
    && (!preferences.mealCook || preferences.cook === 'yes') ? preferences.meal : null;
  const activeMinutes = time.movingHigh + time.breaks;
  const history = comparableHikes(trail, hiker, context.history, trip, context.now).map(item => item.record);
  const logged = history.find(item => item.snackServings > 0 && snack && item.snackName?.toLowerCase() === snack.toLowerCase());
  const sampleHours = logged ? (logged.minutes ?? logged.moving) / 60 : preferences.hours;
  const sampleServings = logged?.snackServings ?? preferences.servings;
  const usual = sampleHours > 0 && sampleServings > 0;
  const effort = trail.miles >= 5 || trail.gain >= 1200 ? 'hard' : trail.miles > 2 || trail.gain > 300 ? 'moderate' : 'easy';
  const highEffort = effort === 'hard';
  const hot = heatBand(weather?.apparentMax) === 'hot';
  const portions = snack ? Math.max(1, usual ? Math.ceil(sampleServings * activeMinutes / 60 / sampleHours)
    : Math.ceil(activeMinutes / (highEffort ? 75 : 100))) : null;
  const carbs = portions != null && preferences.serving && preferences.carbs != null ? Math.round(portions * preferences.carbs) : null;
  const windows = foodWindows(start, activeMinutes, trip.nights ?? 0, trip.nightHours ?? 8);
  return { hiker, exclusions, snack, meal, portions, carbs, windows, serving: preferences.serving, hot, effort,
    cook: preferences.cook, basis: logged ? logged.title : usual ? 'your similar hike' : 'hike duration and effort' };
}

export function packingSuggestions(trail, group, time, weather, trip, start, edits = {}, context = {}) {
  const water = group.map(hiker => waterFor(trail, hiker, time, weather, trip, edits[hiker.id], context));
  const food = group.map(hiker => foodFor(trail, hiker, time, trip, start, weather, context));
  const add = (category, name, amount = '', reason = '') => ({ category, name, amount, reason });
  const entries = [
    add('gear', 'Route map and navigation', '', 'Carry a route reference for the group.'),
    add('gear', 'First aid and light', '', 'Allow for injuries or a late return.'),
    add('gear', 'Footwear suited to the route', '', trail.surface ?? 'Confirm the trail surface.'),
    ...((weather?.types ?? []).some(type => /rain|shower|drizzle|thunderstorm/i.test(type)) ?
      [add('gear', 'Rain layer', '', 'Precipitation appears in the forecast.')] : []),
    ...(weather?.apparentMin < 40 ? [add('gear', 'Warm layer', '', 'The forecast includes cold conditions.')] : []),
    ...(weather?.apparentMax >= 85 || trip.sun === 'exposed' ? [add('gear', 'Sun protection', '', 'The route plan includes heat or sun exposure.')] : []),
    ...(trip.nights ? [add('gear', 'Overnight shelter and light', '', `${trip.nights} planned overnight stops.`)] : []),
    ...water.map(person => add('water', `Starting water · ${person.hiker.name}`, litersRange(person.startingLow, person.startingHigh),
      `Includes ${liters(person.reserve)} reserve. ${person.refillConfirmed ? 'Plan uses confirmed refills.' : 'Plan assumes no refills.'}`)),
    ...food.flatMap(person => person.windows.map((window, index) => {
      const reserve = window.label === 'Reserve food';
      const item = reserve ? null : index === 0 ? person.snack : person.meal;
      const name = `${window.label} · ${person.hiker.name}${item ? ' · ' + item : ''}`;
      const amount = index === 0 && person.portions != null ? `${person.portions} servings${person.serving ? ' (' + person.serving + ' each)' : ''}` : '';
      const reason = item || reserve ? window.reason
        : window.reason + ' Choose an item with verified ingredients for this hiker.';
      return { ...add('food', name, amount, reason), ...(item ? { suggestedFood: true } : {}) };
    }))
  ];
  if (water.some(person => person.refillConfirmed)) entries.push(add('water', 'Refill and treatment supplies', '',
    'Confirm access and suitability. Treat untreated water using park guidance.'));
  return { water, food, entries, duration: duration(time.high) };
}
