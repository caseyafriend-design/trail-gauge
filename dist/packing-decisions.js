export const suggestionKey = item => item.category + ':' + item.name.trim().toLowerCase();

export function pendingSuggestions(plan, suggestions) {
  const saved = new Set((plan.entries ?? []).map(suggestionKey));
  return suggestions.filter(item => !saved.has(suggestionKey(item)) && !plan.suggestionDecisions?.[suggestionKey(item)]);
}

export function decideSuggestion(plan, suggestions, key, decision, makeId) {
  const item = pendingSuggestions(plan, suggestions).find(item => suggestionKey(item) === key);
  if (!item || !['add', 'dismiss'].includes(decision)) return plan;
  return { ...plan,
    suggestionDecisions: { ...plan.suggestionDecisions, [key]: decision },
    entries: decision === 'add' ? [...(plan.entries ?? []), { ...item, id: makeId(), packed: false }] : (plan.entries ?? [])
  };
}
