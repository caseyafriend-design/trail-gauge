import { forecastFor, forecastRequest } from './conditions.js';

// Validate before saving. An async check must never overwrite a newer selection.
export async function selectForecastTime({ form, data, targets, group, contextFor, entryFor, refresh, clock = Date.now }) {
  const reset = data.get('action') === 'now';
  const date = reset ? '' : data.get('date');
  const start = reset ? '' : data.get('start');
  const feedback = form.querySelector('[data-plan-status]');
  const submission = Number(form.dataset.submission ?? 0) + 1;
  form.dataset.submission = submission;
  const fail = message => { feedback.textContent = message; };
  if (Boolean(date) !== Boolean(start)) {
    fail('Enter both a hike date and a start time.');
    return;
  }
  const plan = date && start ? { date, start } : null;
  const validTime = item => forecastRequest(item, plan, clock(), true).status === 'eligible';
  if (plan && targets.some(item => !validTime(item))) {
    fail('Choose a future, unambiguous park-local date and time. Past, malformed, skipped or repeated daylight-saving times cannot be used.');
    return;
  }
  feedback.textContent = '';
  if (plan) {
    feedback.textContent = 'Checking the full outing against the available forecast…';
    await Promise.all(targets.map(item => refresh(item, true)));
    if (!form.isConnected || Number(form.dataset.submission) !== submission) return;
    if (form.elements.date.value !== date || form.elements.start.value !== start) {
      fail('The time changed while checking. Submit the new time to verify it.');
      return;
    }
    const invalid = targets.map(item => {
      if (!validTime(item)) return 'invalid-time';
      const entry = entryFor(item);
      return forecastFor(item, group(), plan, entry.snapshot, entry.status, clock(), contextFor(item)).status;
    }).find(status => status !== 'ready');
    if (invalid) {
      fail(invalid === 'outside-horizon' ? 'Choose an earlier start: the full estimated outing must fit the continuous hourly forecast returned by NWS.'
        : invalid === 'invalid-time' ? 'That start time has passed while checking. Choose a later park-local time.'
          : 'A current forecast could not verify that outing. Try again later or check official park weather. Your saved plan is unchanged.');
      return;
    }
  }
  feedback.textContent = '';
  if (reset) { form.elements.date.value = ''; form.elements.start.value = ''; }
  return { plan };
}
