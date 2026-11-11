export const storageKey = 'trail-gauge-v2';
export const legacyStorageKey = 'trail-gauge-v1';

export function initialState() {
  return { people: [], memberIds: [], groupName: 'My group', presets: [], history: [],
    reviews: {}, compare: [], hikePlan: null, favorites: [], skipped: [], trips: {}, packing: {} };
}

const firstGroup = ['hiker-0', 'hiker-1', 'hiker-2'];
const scenarioGroup = ['fit-demo-riley', 'fit-demo-jules', 'fit-demo-avery'];
// Migration fingerprints for the shipped v1 records. The names alone prove nothing.
const oldProfiles = {
  'hiker-0': { name: 'Alex', kind: 'self', fitness: 3, experience: 3 },
  'hiker-1': { name: 'Sam', kind: 'demo', fitness: 3, experience: 2 },
  'hiker-2': { name: 'Jamie', kind: 'local', fitness: 1, experience: 1 },
  'demo-morgan': { name: 'Morgan', kind: 'demo', fitness: 2, experience: 3 },
  'fit-demo-riley': { name: 'Riley (demo)', kind: 'demo', fitness: 3, experience: 3 },
  'fit-demo-jules': { name: 'Jules (demo)', kind: 'demo', fitness: 2, experience: 2 },
  'fit-demo-avery': { name: 'Avery (demo)', kind: 'demo', fitness: 1, experience: 1, advanced: true,
    pace: 1.9, distance: 4, climb: 650, footing: 2, exposure: 2 }
};

function isSeeded(person) {
  const expected = oldProfiles[person.id];
  return expected && Object.keys(person).length === Object.keys(expected).length + 1
    && Object.entries(expected).every(([key, value]) => person[key] === value);
}

const sameMembers = (left, right) => Array.isArray(left) && left.length === right.length
  && right.every(id => left.includes(id));
const reviewsOnly = entries => entries.filter(entry => entry && entry.sample !== true);

export function migrateState(previous) {
  if (!previous || typeof previous !== 'object') return initialState();
  const { people, group, weather, history, reviews, presets, memberIds, groupName, chats, compare, ...preferences } = previous;
  const legacyPeople = Array.isArray(group) ? group.map((person, index) => ({
    ...person, id: person.id ?? 'hiker-' + index, kind: person.kind ?? (index ? 'local' : 'self')
  })) : [];
  const originalPeople = people ?? legacyPeople;
  // An older saved group array carried no origin markers. Preserve it.
  const removed = new Set(people ? originalPeople.filter(isSeeded).map(person => person.id) : []);
  const retained = originalPeople.filter(person => !removed.has(person.id))
    .map(person => person.kind === 'demo' ? { ...person, kind: 'local' } : person);
  const withoutSeeds = (ids = []) => ids.filter(id => !removed.has(id));
  const oldMembers = memberIds ?? legacyPeople.map(person => person.id);
  const defaultGroup = groupName === 'Weekend crew' && sameMembers(oldMembers, firstGroup)
    && firstGroup.every(id => removed.has(id));
  const loadedScenario = groupName === 'Mixed-ability demo group' && sameMembers(oldMembers, scenarioGroup)
    && scenarioGroup.every(id => removed.has(id));
  const demoComparison = loadedScenario && sameMembers(compare, ['emerald-lake', 'queens-garden', 'angels-landing'])
    && compare.every(id => weather?.[id] === 'Mild');
  const realReviews = Object.fromEntries(Object.entries(reviews ?? {}).filter(([, review]) => review && review.sample !== true));
  const realHistory = reviewsOnly(history ?? Object.entries(realReviews).map(([trailId, review]) => ({ ...review, trailId })));
  const savedGroups = (presets ?? []).filter(preset => !(preset.id === 'weekend'
    && preset.name === 'Weekend crew' && sameMembers(preset.memberIds, firstGroup)
    && firstGroup.every(id => removed.has(id))));
  return { ...initialState(), ...preferences, people: retained, memberIds: withoutSeeds(oldMembers),
    groupName: defaultGroup || loadedScenario ? 'My group' : groupName ?? 'My group',
    presets: savedGroups.map(preset => ({ ...preset, memberIds: withoutSeeds(preset.memberIds) })),
    history: realHistory, reviews: realReviews, compare: demoComparison ? [] : compare ?? [],
    // The sample conversation was hard-coded. Preserve any persisted messages locally.
    ...(chats && Object.keys(chats).length ? { archivedChats: chats } : {}) };
}

export function loadState(storage) {
  try {
    const current = storage.getItem(storageKey);
    if (current) return { ...initialState(), ...JSON.parse(current) };
    const legacy = storage.getItem(legacyStorageKey);
    if (legacy) {
      const state = migrateState(JSON.parse(legacy));
      try {
        storage.setItem(storageKey, JSON.stringify(state));
        storage.removeItem(legacyStorageKey);
      } catch {
        // Keep the original if the browser cannot write the migration.
      }
      return state;
    }
  } catch {
    // A blocked or unreadable store should not prevent planning.
  }
  return initialState();
}
