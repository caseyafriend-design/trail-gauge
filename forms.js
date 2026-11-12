export const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, character =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]);

export const textInput = (name, label, value, type = 'text', attributes = '') =>
  `<label>${label}<input name="${name}" type="${type}" value="${escapeHtml(value)}" ${attributes}></label>`;

export const numberInput = (name, label, value, min, max, step = 1) =>
  textInput(name, label, value, 'number', `min="${min}" max="${max}" step="${step}" inputmode="decimal" placeholder="I don’t know"`);

export const selectInput = (name, label, value, options) =>
  `<label>${label}<select name="${name}">${Object.entries(options).sort(([a], [b]) => Number(b === '') - Number(a === '')).map(([key, text]) =>
    `<option value="${escapeHtml(key)}"${String(value ?? '') === key ? ' selected' : ''}>${escapeHtml(text)}</option>`
  ).join('')}</select></label>`;

export const checkInput = (name, label, checked, value = 'yes') =>
  `<label class="check-line"><input name="${name}" type="checkbox" value="${escapeHtml(value)}"${checked ? ' checked' : ''}>${label}</label>`;

export const readNumber = (data, key) => {
  const value = data.get(key);
  return value == null || String(value).trim() === '' || !Number.isFinite(Number(value)) ? null : Number(value);
};
export const readText = (data, key) => String(data.get(key) ?? '').trim();
