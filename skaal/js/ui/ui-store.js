// Global UI state: toasts, confirm dialogs and device preferences.
import { createStore } from './kit.js';
import * as storage from '../core/storage.js';
import { randomId } from '../core/ids.js';

export const prefs = createStore({ sound: true, haptics: true, ...storage.load('prefs', {}) });
prefs.subscribe((s) => storage.save('prefs', { sound: s.sound, haptics: s.haptics, cameraFacing: s.cameraFacing }));

export const ui = createStore({ toasts: [], dialog: null });

// `key`: a new toast with the same key replaces the previous one (e.g. only the latest drink
// can be undone from its toast, so stacking several "Fortryd" buttons would be confusing).
export function toast(text, { icon, tone = 'default', action, duration = 3200, key } = {}) {
  const id = randomId(6);
  ui.set((s) => ({
    toasts: [...s.toasts.filter((t) => !key || t.key !== key).slice(-2), { id, key, text, icon, tone, action }],
  }));
  setTimeout(() => dismissToast(id), duration);
  return id;
}

export function clearToasts() {
  ui.set({ toasts: [] });
}

export function dismissToast(id) {
  ui.set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) }));
}

export function confirmDialog({ title, text, confirm = 'OK', cancel = 'Annullér', danger = false }) {
  return new Promise((resolve) => {
    ui.set({ dialog: { title, text, confirm, cancel, danger, resolve } });
  });
}

export function answerDialog(value) {
  const d = ui.get().dialog;
  ui.set({ dialog: null });
  d?.resolve(value);
}
