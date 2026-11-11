import { checkInput, escapeHtml, numberInput, readNumber, readText, selectInput, textInput } from './forms.js';
import { ratings, factorNames } from './model.js';
import { effortLabels } from './personalization.js';
import { conditionsOptions } from './profile-planning.js';
import { liters, litersRange } from './packing.js';

const receptionOptions = { '': 'No observation', good: 'Usable', spotty: 'Intermittent', none: 'No signal' };

const textarea = (name, label, value) => `<label>${label}<textarea name="${name}" maxlength="500" rows="3">${escapeHtml(value)}</textarea></label>`;

export function reviewPage(trail, review, people, today, predicted, canLogNew) {
  const persons = { '': 'Choose a hiker', ...Object.fromEntries(people.map(person => [person.id, person.name])) };
  const self = people.find(person => person.kind === 'self') ?? people[0];
  const factors = Object.fromEntries([...new Set([...factorNames, 'Other', ...(review?.factor ? [review.factor] : [])])].map(name => [name, name]));
  return `<a class="back" href="#trail/${encodeURIComponent(trail.id)}">← ${escapeHtml(trail.name)}</a>
    <div class="intro"><h1>${review ? 'Edit hike review' : 'Log a completed hike'}</h1><p>${escapeHtml(trail.name)}</p></div>
    <section class="card review-summary"><h2>${review ? 'Your saved review' : 'Group estimate'}</h2>
      <p>Difficulty estimate ${escapeHtml(predicted ?? 'unavailable')}${review?.rating ? ' · Felt ' + escapeHtml(review.rating) : ''}</p>
      ${review ? '<a class="compare-toggle" href="#history">View history</a>' : ''}
      ${review && canLogNew ? `<a class="compare-toggle" href="#review/${encodeURIComponent(trail.id)}/new">Log another hike</a>` : ''}</section>
    <form class="card" id="review-form">
      <div class="form-grid">
        ${selectInput('hikerId', 'Hiker this review describes', review?.hikerId ?? self?.id, persons)}
        ${textInput('date', 'Hike date', review?.date ?? today, 'date', `required max="${today}"`)}
        ${numberInput('minutes', 'Actual elapsed time (min)', review?.minutes, 1, 10080)}
        ${numberInput('moving', 'Actual moving time (min)', review?.moving, 1, 10080)}
        ${numberInput('distance', 'Actual distance (mi)', review?.distance ?? trail.miles, .1, 250, .1)}
        ${numberInput('gain', 'Actual ascent (ft)', review?.gain ?? trail.gain, 0, 40000)}
        ${numberInput('packWeight', 'Pack load (lb)', review?.packWeight, 0, 150, .5)}
        ${selectInput('effort', 'Perceived effort', review?.effort, { '': 'I don’t know', ...effortLabels })}
        ${selectInput('rating', 'How hard did it feel?', review?.rating ?? 'Moderate', Object.fromEntries(ratings.map(rating => [rating, rating])))}
        ${selectInput('factor', 'What made it hardest?', review?.factor ?? 'Other', factors)}
      </div>
      ${textarea('note', 'Review notes', review?.note)}
      ${textarea('surface', 'Trail surface or crossing observations', review?.surface)}
      <details class="form-details"><summary>Weather, food, and water used</summary>
        <div class="form-grid">
          ${selectInput('conditions', 'Temperature conditions', review?.conditions, conditionsOptions)}
          ${selectInput('sun', 'Sun exposure', review?.sun, { '': 'I don’t know', exposed: 'Mostly exposed', shaded: 'Mostly shaded' })}
          ${textInput('weatherNote', 'Weather you experienced', review?.weatherNote, 'text', 'maxlength="200"')}
          ${textInput('foodEaten', 'Food eaten', review?.foodEaten, 'text', 'maxlength="200"')}
          ${textInput('snackName', 'Snack tracked by servings', review?.snackName, 'text', 'maxlength="100"')}
          ${numberInput('snackServings', 'Servings of that snack eaten', review?.snackServings, 0, 100, .5)}
          ${numberInput('waterUsed', 'Water used (L)', review?.waterUsed, 0, 100, .1)}
          ${numberInput('waterRefilled', 'Water refilled (L)', review?.waterRefilled, 0, 100, .1)}
        </div>
        ${checkInput('foodShort', 'Ran short of food', review?.foodShort)}
        ${checkInput('waterShort', 'Ran short of water', review?.waterShort)}
      </details>
      <details class="form-details"${review?.reception ? ' open' : ''}><summary>Cell service observation</summary>
        <div class="form-grid">
          ${selectInput('reception', 'Reception', review?.reception?.status, receptionOptions)}
          ${textInput('carrier', 'Carrier', review?.reception?.carrier, 'text', 'maxlength="60"')}
          ${textInput('receptionDate', 'Observation date (defaults to hike date)', review?.reception?.date, 'date', `max="${today}"`)}
        </div>
        ${textarea('receptionNote', 'Where you noticed it', review?.reception?.note)}
        <p class="planning-note">Reception reports are user observations and stay in this browser.</p>
      </details>
      ${checkInput('calibrate', 'Use this hike to inform future estimates when it is comparable', review?.calibrate !== false)}
      <p id="review-status" role="status"></p><button class="button" type="submit">Save review</button>
    </form>`;
}

export function reviewRecord(data) {
  const n = key => readNumber(data, key);
  const t = key => readText(data, key);
  const date = t('date');
  const reception = t('reception');
  return { date, hikerId: t('hikerId'), minutes: n('minutes'), moving: n('moving'), distance: n('distance'),
    gain: n('gain'), packWeight: n('packWeight'), rating: t('rating'), factor: t('factor'), effort: t('effort'),
    note: t('note'), surface: t('surface'), conditions: t('conditions'), sun: t('sun'), weatherNote: t('weatherNote'),
    foodEaten: t('foodEaten'), snackName: t('snackName'), snackServings: n('snackServings'),
    waterUsed: n('waterUsed'), waterRefilled: n('waterRefilled'), foodShort: data.has('foodShort'),
    waterShort: data.has('waterShort'), calibrate: data.has('calibrate'),
    reception: reception ? { status: reception, carrier: t('carrier'), date: t('receptionDate') || date, note: t('receptionNote') } : null };
}

export function reviewObservations(entry) {
  const p = entry.planned;
  const compareSnack = p?.snack && entry.snackServings != null && entry.snackName?.toLowerCase() === p.snack.toLowerCase();
  return `${entry.surface ? `<p>Surface or crossing observation · ${escapeHtml(entry.surface)}</p>` : ''}
    ${entry.reception ? `<p><strong>Cell service · user observation</strong> · ${escapeHtml(receptionOptions[entry.reception.status])}
      · ${escapeHtml(entry.reception.carrier)} · ${escapeHtml(entry.reception.date)}${entry.reception.note ? ' · ' + escapeHtml(entry.reception.note) : ''}</p>` : ''}
    ${entry.waterUsed != null ? `<p>Water used ${liters(entry.waterUsed)}${entry.waterRefilled != null ? ' · Refilled ' + liters(entry.waterRefilled) : ''}
      ${p?.waterLow != null ? ' · Packing estimate ' + litersRange(p.waterLow, p.waterHigh) : ''}
      · ${entry.waterShort ? 'Ran short' : 'Did not report a shortfall'}</p>` : ''}
    ${entry.foodEaten || entry.snackServings != null ? `<p>Food eaten · ${escapeHtml(entry.foodEaten)}
      ${entry.snackServings != null ? ` · ${entry.snackServings} servings${entry.snackName ? ' of ' + escapeHtml(entry.snackName) : ''}` : ''}
      ${compareSnack ? ' · Packing estimate ' + p.portions + ' servings' : ''}
      · ${entry.foodShort ? 'Ran short' : 'Did not report a shortfall'}</p>` : ''}
    ${entry.weatherNote ? `<p>Weather observation · ${escapeHtml(entry.weatherNote)}</p>` : ''}`;
}
