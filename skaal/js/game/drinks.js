// Drink registry. Add a drink by appending an entry here (and, optionally, an illustration in
// js/ui/drinkArt.js — drinks without one fall back to their emoji). The host can switch drinks on
// and off and change their points per event, so `points` is only the default.

export const DRINKS = [
  { id: 'beer', name: 'Øl', phrase: 'en øl', plural: 'øl', emoji: '🍺', points: 1, alcoholic: true, color: '#F6B73C', defaultOn: true },
  { id: 'shot', name: 'Shot', phrase: 'et shot', plural: 'shots', emoji: '🥃', points: 1, alcoholic: true, color: '#FF5C7A', defaultOn: true },
  { id: 'drink', name: 'Drink', phrase: 'en drink', plural: 'drinks', emoji: '🍸', points: 2, alcoholic: true, color: '#B47CFF', defaultOn: true },
  { id: 'jager', name: 'Jägerbomb', phrase: 'en Jägerbomb', plural: 'Jägerbombs', emoji: '💣', points: 2, alcoholic: true, color: '#3DDC97', defaultOn: true },
  { id: 'wine', name: 'Vin', phrase: 'et glas vin', plural: 'glas vin', emoji: '🍷', points: 1, alcoholic: true, color: '#E5577E', defaultOn: false },
  { id: 'cider', name: 'Cider', phrase: 'en cider', plural: 'cider', emoji: '🍏', points: 1, alcoholic: true, color: '#9AD94F', defaultOn: false },
  { id: 'water', name: 'Vand', phrase: 'et glas vand', plural: 'glas vand', emoji: '💧', points: 0, alcoholic: false, color: '#5BC8F5', defaultOn: true },
];

const BY_ID = new Map(DRINKS.map((d) => [d.id, d]));

export function drinkById(id) {
  return BY_ID.get(id) || null;
}

// Points allowed in the host settings.
export const POINT_STEPS = [0, 0.5, 1, 1.5, 2, 2.5, 3, 4, 5];
