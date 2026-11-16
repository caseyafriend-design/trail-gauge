import { checkInput, escapeHtml, numberInput, readNumber, readText, selectInput, textInput } from './forms.js';
import { duration } from './planning.js';
import { defaultTrip, liters, litersRange, packingCategories } from './packing.js';

export function tripInputs(trip) {
  return `<div class="form-grid">
      ${numberInput('packWeight', 'Expected pack load per hiker (lb)', trip.packWeight, 0, 150, .5)}
      ${numberInput('breaks', 'Total planned breaks (min)', trip.breaks, 0, 1440)}
      ${numberInput('nights', 'Overnight stops', trip.nights, 0, 5)}
      ${numberInput('nightHours', 'Hours per overnight stop', trip.nightHours, 1, 24)}
      ${selectInput('sun', 'Sun exposure', trip.sun, { '': 'Use route info if known', exposed: 'Mostly exposed', shaded: 'Mostly shaded' })}
    </div>`;
}

export function readTrip(data, current) {
  const n = key => readNumber(data, key);
  return { ...current, packWeight: n('packWeight'), breaks: n('breaks') ?? 0, nights: n('nights') ?? 0,
    nightHours: n('nightHours') ?? defaultTrip.nightHours, sun: readText(data, 'sun'),
    refill: readText(data, 'refill'), firstRefill: n('firstRefill'), longestGap: n('longestGap'),
    refillNotes: readText(data, 'refillNotes'), reserve: n('reserve') ?? defaultTrip.reserve };
}

function progressMarkup(entries) {
  const packed = entries.filter(entry => entry.packed).length;
  return `<span>${packed} of ${entries.length} packed</span><progress max="${Math.max(1, entries.length)}" value="${packed}" aria-label="Packing progress"></progress>`;
}

export function updatePackingProgress(element, entries) {
  element.innerHTML = progressMarkup(entries);
}

function waterPanel(suggestions, edits, trip, parkConditions) {
  const water = suggestions.water;
  if (!water.length) return '';
  const total = key => Math.round(water.reduce((sum, person) => sum + person[key], 0) * 10) / 10;
  const usesRefills = water.some(person => person.refillConfirmed);
  const refillWarning = trip.refill === 'unverified'
    ? 'A refill is unverified. This plan assumes you carry the entire amount.'
    : trip.refill === 'confirmed' && !usesRefills
      ? 'Enter a first refill and a longest gap that fit inside the hiking window. The plan currently assumes no refills.'
      : !usesRefills && water.some(person => person.hot || person.activeHigh >= 240)
        ? 'No confirmed refill for this long or hot hike. Check the carry estimate before leaving.'
        : '';
  return `<section class="card pack-section"><h2>Water plan</h2>
    <dl class="summary-stats">
      <div><dt>Group estimated use</dt><dd>${litersRange(total('low'), total('high'))}</dd></div>
      <div><dt>Group starting carry</dt><dd>${litersRange(total('startingLow'), total('startingHigh'))}</dd></div>
      <div><dt>Group reserve included</dt><dd>${liters(total('reserve'))}</dd></div>
    </dl>
    <p class="planning-note">${usesRefills ? `Starting carry covers ${duration(trip.firstRefill)} to the first confirmed refill. The longest leg is ${duration(trip.longestGap)}.`
      : 'Starting carry includes estimated use plus reserve. The plan assumes no refills.'}</p>
    ${refillWarning ? `<p class="plan-alert" role="status">${refillWarning}</p>` : ''}
    <form id="water-edit-form">
      ${water.map(person => {
        const { hiker, low, high, suggestedLow, suggestedHigh, startingLow, startingHigh, maxCarry, capacity } = person;
        const edit = edits[hiker.id];
        return `<fieldset class="member-picker water-person"><legend>${escapeHtml(hiker.name)}</legend>
          <p>${litersRange(low, high)} estimated use · ${litersRange(startingLow, startingHigh)} starting carry
            ${capacity != null ? ' · ' + liters(capacity) + ' capacity' : ''}</p>
          <p class="planning-note">${person.edited ? 'Edited range. ' : ''}
            ${person.source ? 'Based on ' + escapeHtml(person.source) + '.' : 'Generic packing estimate.'}
            ${person.mismatch ? 'Wider range for different or unknown conditions or effort.' : ''}</p>
          ${person.exceedsCapacity ? `<p class="plan-alert">Carry capacity shortfall. The longest leg could require ${liters(maxCarry)} including reserve.</p>` : ''}
          ${person.sweatRate ? `<p class="planning-note">Recorded sweat rate ${escapeHtml(person.sweatRate)} L/hr${person.sweatConditions
            ? ' · ' + escapeHtml(person.sweatConditions) : ''}. Shown for context.</p>` : ''}
          <div class="form-grid">
            ${numberInput('low-' + hiker.id, 'Low estimate (L)', edit?.low, 0, 100, .1)}
            ${numberInput('high-' + hiker.id, 'High estimate (L)', edit?.high, 0, 100, .1)}
          </div>
          <p class="planning-note">Suggested range ${litersRange(suggestedLow, suggestedHigh)}. Leave both fields blank to use it.</p></fieldset>`;
      }).join('')}
      <button class="compare-toggle" type="submit">Save water ranges</button><p id="water-edit-status" role="status"></p>
    </form>
    <p class="planning-note">Water amounts are editable packing estimates. Add any water needed at camp to your plan. Treat untreated water and check the land manager’s refill guidance.
      <a href="${parkConditions}" target="_blank" rel="noopener">Park conditions ↗</a> ·
      <a href="https://pmc.ncbi.nlm.nih.gov/articles/PMC5634236/" target="_blank" rel="noopener">Fluid replacement guidance ↗</a></p></section>`;
}

function foodPanel(suggestions, start) {
  if (!suggestions.food.length) return '';
  const complete = suggestions.food.every(person => person.carbs != null);
  const totalCarbs = suggestions.food.reduce((sum, person) => sum + (person.carbs ?? 0), 0);
  return `<section class="card pack-section"><h2>Food plan</h2>
    <p class="planning-note">Snack portions are based on hiking time, effort, and any similar hike you logged. Meal windows use ${start ? 'your selected local start time' : 'a 9 AM planning start'}.
      ${complete ? `The suggested snacks contain about ${totalCarbs} g carbohydrate across the group, based on the labels entered.` : ''}</p>
    <ul class="pack-food-summary">${suggestions.food.map(person => `<li><strong>${escapeHtml(person.hiker.name)}</strong>
      ${person.snack ? ` · ${person.portions} servings of ${escapeHtml(person.snack)}${person.serving ? ' (' + escapeHtml(person.serving) + ' each)' : ''}${person.carbs != null ? ' · about ' + person.carbs + ' g carbohydrate' : ''}`
        : ' · Choose a tolerated snack with verified ingredients.'}
      ${person.exclusions.length ? `<p class="planning-note">Check ${escapeHtml(person.exclusions.join(', '))}.</p>` : ''}
      ${person.hot ? '<p class="planning-note">The forecast is hot. Choose a snack you can store in those conditions.</p>' : ''}
      ${person.cook === 'no' && person.windows.length > 2 ? '<p class="planning-note">Choose meals that need no cooking.</p>' : ''}
      ${person.snack ? `<p class="planning-note">Portions based on ${escapeHtml(person.basis)}.</p>` : ''}</li>`).join('')}</ul>
    <details class="form-details"><summary>Optional sports fueling reference</summary>
      <p>The joint sports nutrition position statement describes 30–60 g of carbohydrate per hour for about 1–2.5 hours of endurance exercise.
        It is a performance reference for sustained effort. Use the foods and portions you tolerate.
        <a href="https://www.andeal.org/files/files/Collaborations/Position_Athletic-Performance_2016March.pdf" target="_blank" rel="noopener">Position statement ↗</a></p>
    </details></section>`;
}

export function packingForecastPanels(suggestions, plan, trip, start, parkConditions) {
  return waterPanel(suggestions, plan.waterEdits ?? {}, trip, parkConditions) + foodPanel(suggestions, start);
}

export function packingPage(trail, group, trip, plan, suggestions, time, start, parkConditions) {
  const entries = plan.entries ?? [];
  return `<a class="back" href="#trail/${encodeURIComponent(trail.id)}">← ${escapeHtml(trail.name)}</a>
    <div class="intro"><h1>Pack for your hike</h1><p>${escapeHtml(trail.name)} · ${group.length} ${group.length === 1 ? 'hiker' : 'hikers'}</p>
      <p class="planning-note"><a href="#trail/${encodeURIComponent(trail.id)}/forecast">Set or review the hike forecast</a></p></div>
    ${!group.length ? `<p class="card">Choose who’s hiking to create a packing plan. <a class="button secondary" href="#group/${encodeURIComponent(trail.id)}/packing">Choose hikers</a></p>` : `
    <section class="card pack-section"><h2>Trip and refill plan</h2>
      <p class="planning-note">Estimated moving time ${duration(time.movingLow)}–${duration(time.movingHigh)}.
        ${time.breaks ? `Add ${duration(time.breaks)} in breaks.` : ''}
        ${time.stopMinutes ? `Add ${duration(time.stopMinutes)} for overnight stops.` : ''}</p>
      <form id="trip-form">
        ${tripInputs(trip)}
        <details class="form-details"><summary>Refills and reserve water</summary>
          <div class="form-grid">
            ${selectInput('refill', 'Usable refills', trip.refill, { none: 'None planned', unverified: 'Possible, unverified', confirmed: 'Confirmed for this trip' })}
            ${numberInput('firstRefill', 'Time to first usable refill (min)', trip.firstRefill, 1, 1440)}
            ${numberInput('longestGap', 'Longest leg between usable water, including start and finish (min)', trip.longestGap, 1, 1440)}
            ${numberInput('reserve', 'Reserve per person (L)', trip.reserve, 0, 20, .1)}
          </div>
          ${textInput('refillNotes', 'Refill locations and treatment plan', trip.refillNotes, 'text', 'maxlength="250"')}
        </details>
        <button class="compare-toggle" type="submit">Save trip settings</button>
      </form>
    </section>
    <div id="packing-forecast-panels">${packingForecastPanels(suggestions, plan, trip, start, parkConditions)}</div>
    <section class="card pack-section"><h2>Group checklist</h2>
      <div id="pack-progress" class="pack-progress" role="status">${progressMarkup(entries)}</div>
      <p class="planning-note">Add suggested items to the checklist, then edit quantities and check items off.</p>
      <form id="packing-items">
        ${Object.entries(packingCategories).map(([category, title]) => {
          const items = entries.filter(entry => entry.category === category);
          return items.length ? `<fieldset class="member-picker packing-category"><legend>${title}</legend>
            ${items.map(item => `<div class="packing-item">
              <label class="check-line"><input type="checkbox" name="packed" value="${escapeHtml(item.id)}" aria-label="Packed ${escapeHtml(item.name)}"${item.packed ? ' checked' : ''}></label>
              ${textInput('name-' + item.id, 'Item', item.name, 'text', 'maxlength="120" required')}
              ${textInput('amount-' + item.id, 'Amount', item.amount, 'text', 'maxlength="80"')}
              <button class="compare-toggle" type="submit" name="remove" value="${escapeHtml(item.id)}" formnovalidate aria-label="Remove ${escapeHtml(item.name)}">Remove</button>
              ${item.suggestedFood && !suggestions.entries.some(suggestion => suggestion.suggestedFood && suggestion.name === item.name)
                ? '<small>Previous food suggestion. Recheck ingredients before packing.</small>'
                : item.reason ? `<small>${escapeHtml(item.reason)}</small>` : ''}</div>`).join('')}
          </fieldset>` : '';
        }).join('')}
        <div class="pack-actions">
          ${entries.length ? '<button type="submit" class="compare-toggle">Save checklist edits</button>' : ''}
          <button type="submit" class="compare-toggle" name="action" value="suggest">Add suggestions</button>
        </div>
      </form>
      <form id="add-packing-item" class="form-grid">
        ${selectInput('category', 'Category', 'gear', packingCategories)}
        ${textInput('name', 'New item', '', 'text', 'maxlength="120" required')}
        ${textInput('amount', 'Amount', '', 'text', 'maxlength="80"')}
        <button class="compare-toggle" type="submit">Add item</button>
      </form>
    </section>
    <section class="card pack-section"><h2>Optional reminders</h2>
      <p class="planning-note">A reminder appears in this tab while it is open.</p>
      <form id="reminder-form" class="form-grid">
        ${numberInput('interval', 'Remind this group every (min)', plan.reminder?.interval, 1, 240)}
        <div class="pack-actions"><button class="compare-toggle" type="submit">Start reminder</button>
          ${plan.reminder ? '<button class="compare-toggle" type="submit" name="action" value="stop">Stop reminder</button>' : ''}</div>
      </form>
    </section>`}`;
}
