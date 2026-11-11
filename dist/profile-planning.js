import { checkInput, numberInput, readNumber, readText, selectInput, textInput } from './forms.js';
import { effortLabels, terrainLabels } from './personalization.js';

const unknown = 'I don’t know';
const optional = options => ({ '': unknown, ...options });
const comfort = optional({ 1: 'Prefer to avoid', 2: 'Some experience', 3: 'Comfortable' });
const optionalEffort = optional(effortLabels);
export const conditionsOptions = optional({ cool: 'Cool', mild: 'Mild', hot: 'Hot' });

export function planningProfileFields(person) {
  const p = person.planning ?? {};
  const recent = p.recent ?? {};
  const food = p.food ?? {};
  const water = p.water ?? {};
  return `<div class="form-grid">
      ${numberInput('distance', 'Comfortable distance (mi)', p.distance ?? (person.advanced ? person.distance : null), .1, 100, .1)}
      ${numberInput('climb', 'Comfortable ascent (ft)', p.climb ?? (person.advanced ? person.climb : null), 0, 30000)}
    </div>
    <details class="form-details">
      <summary>Use a recent hike to estimate pace</summary>
      <p>Enter what you remember. Moving time excludes stops.</p>
      <div class="form-grid">
        ${textInput('recentTitle', 'Hike name', recent.title, 'text', 'maxlength="80"')}
        ${textInput('recentDate', 'Hike date', recent.date, 'date')}
        ${numberInput('recentDistance', 'Distance (mi)', recent.distance, .1, 200, .1)}
        ${numberInput('recentGain', 'Ascent (ft)', recent.gain, 0, 40000)}
        ${numberInput('recentElapsed', 'Elapsed time (min)', recent.minutes, 1, 10080)}
        ${numberInput('recentMoving', 'Moving time (min)', recent.moving, 1, 10080)}
        ${numberInput('recentPack', 'Pack load (lb)', recent.packWeight, 0, 150, .5)}
        ${selectInput('recentEffort', 'Perceived effort', recent.effort, optionalEffort)}
      </div>
    </details>
    <details class="form-details">
      <summary>Terrain preferences and firm limits</summary>
      <div class="form-grid">
        ${selectInput('frequency', 'Recent hiking frequency', p.frequency, optional({ weekly: 'Most weeks', monthly: 'Most months', rarely: 'Rarely' }))}
        ${numberInput('pace', 'Usual moving pace on level ground (mph)', p.pace ?? (person.advanced ? person.pace : null), .5, 5, .1)}
        ${selectInput('descent', 'Steep descents', p.descent ?? (person.advanced ? person.exposure : null), comfort)}
        ${selectInput('footing', 'Rough footing', p.footing ?? (person.advanced ? person.footing : null), comfort)}
        ${selectInput('exposure', 'Exposed terrain', p.exposure, comfort)}
        ${selectInput('crossing', 'Unbridged crossings', p.crossing, comfort)}
        ${selectInput('altitude', 'High altitude experience in the last month', p.altitude, optional({ recent: 'Yes', none: 'No' }))}
        ${selectInput('heat', 'Hiking in hot weather', p.heat, optional({ familiar: 'Familiar', unfamiliar: 'Little experience' }))}
        ${numberInput('maxMiles', 'Firm distance limit (mi)', p.maxMiles, .1, 200, .1)}
        ${numberInput('maxGain', 'Firm ascent limit (ft)', p.maxGain, 0, 40000)}
      </div>
      <fieldset class="member-picker"><legend>Terrain to avoid</legend>
        ${Object.entries(terrainLabels).map(([key, label]) => checkInput('avoid', label[0].toUpperCase() + label.slice(1), p.avoid?.includes(key), key)).join('')}
      </fieldset>
    </details>
    <details class="form-details">
      <summary>Food preferences and exclusions</summary>
      <div class="form-grid">
        ${textInput('diet', 'Dietary restrictions', food.diet, 'text', 'maxlength="150"')}
        ${textInput('allergens', 'Allergens to avoid', food.allergens, 'text', 'maxlength="150"')}
        ${textInput('snack', 'Snack you tolerate while hiking', food.snack, 'text', 'maxlength="80"')}
        ${textInput('serving', 'Serving on its label (e.g. 1 bar)', food.serving, 'text', 'maxlength="60"')}
        ${numberInput('carbs', 'Carbohydrate per serving on label (g)', food.carbs, 0, 300, .1)}
        ${numberInput('snackServings', 'Servings eaten on a similar hike', food.servings, 0, 100, .5)}
        ${numberInput('snackHours', 'Length of that hike (hours)', food.hours, .5, 100, .5)}
        ${textInput('meal', 'Trail or camp meal you tolerate', food.meal, 'text', 'maxlength="80"')}
        ${selectInput('cook', 'Can you cook on the trip?', food.cook, optional({ yes: 'Yes', no: 'No' }))}
      </div>
      ${checkInput('ingredients', 'I checked this snack’s ingredients and cross-contact label against my exclusions', food.ingredients)}
      ${checkInput('mealIngredients', 'I checked this meal’s ingredients and cross-contact label against my exclusions', food.mealIngredients)}
      ${checkInput('mealCook', 'This meal requires cooking', food.mealCook)}
    </details>
    <details class="form-details">
      <summary>Water use and carrying capacity</summary>
      <div class="form-grid">
        ${numberInput('waterUsed', 'Water used on a similar hike (L)', water.used, .1, 40, .1)}
        ${numberInput('waterHours', 'Length of that hike (hours)', water.hours, .25, 100, .25)}
        ${selectInput('waterConditions', 'Conditions on that hike', water.conditions, conditionsOptions)}
        ${selectInput('waterEffort', 'Effort on that hike', water.effort, optionalEffort)}
        ${selectInput('waterSun', 'Sun exposure on that hike', water.sun, optional({ exposed: 'Mostly exposed', shaded: 'Mostly shaded' }))}
        ${numberInput('carryCapacity', 'Water carrying capacity (L)', water.capacity, .1, 40, .1)}
        ${numberInput('sweatRate', 'Previously measured sweat rate (L/hr)', water.sweatRate, .1, 8, .1)}
        ${textInput('sweatConditions', 'Conditions of sweat measurement', water.sweatConditions, 'text', 'maxlength="150"')}
      </div>
    </details>`;
}

export function readPlanningProfile(data) {
  const num = key => readNumber(data, key);
  const txt = key => readText(data, key);
  const recent = { title: txt('recentTitle'), date: txt('recentDate'), distance: num('recentDistance'),
    gain: num('recentGain'), minutes: num('recentElapsed'), moving: num('recentMoving'),
    packWeight: num('recentPack'), effort: txt('recentEffort') };
  return {
    distance: num('distance'), climb: num('climb'), pace: num('pace'), frequency: txt('frequency'),
    descent: num('descent'), footing: num('footing'), exposure: num('exposure'), crossing: num('crossing'),
    altitude: txt('altitude'), heat: txt('heat'), maxMiles: num('maxMiles'), maxGain: num('maxGain'),
    avoid: data.getAll('avoid').filter(key => Object.hasOwn(terrainLabels, key)),
    recent: Object.values(recent).some(value => value != null && value !== '') ? recent : null,
    food: { diet: txt('diet'), allergens: txt('allergens'), snack: txt('snack'), serving: txt('serving'),
      carbs: num('carbs'), servings: num('snackServings'), hours: num('snackHours'), cook: txt('cook'),
      ingredients: data.has('ingredients'), meal: txt('meal'), mealIngredients: data.has('mealIngredients'), mealCook: data.has('mealCook') },
    water: { used: num('waterUsed'), hours: num('waterHours'), conditions: txt('waterConditions'),
      effort: txt('waterEffort'), sun: txt('waterSun'), capacity: num('carryCapacity'),
      sweatRate: num('sweatRate'), sweatConditions: txt('sweatConditions') }
  };
}
