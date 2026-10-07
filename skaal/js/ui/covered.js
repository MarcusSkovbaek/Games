// Pop-ups that come to every phone at once — a Tour moment, a fællesskål, the pub golf judge's news
// — can't be seen under the camera or a photo, which sit above everything else. There they wait,
// up to five minutes (longer than a pop-up normally stays), with a heads-up on top that takes the
// player to them.
import { useEffect, useRef, useStore } from './kit.js';
import { toast } from './ui-store.js';
import { eventUi } from './screens/event.js';

const HOLD_MS = 5 * 60_000;

// Closes the camera and the photo viewer (and its slideshow).
export const uncover = () => eventUi.set({ camera: false, photo: null, show: false, comments: false });

// True while the camera or a photo covers this phone's screen (never on the big screen).
export const useCovered = (tv = false) => useStore(eventUi, (s) => !tv && (!!s.camera || !!s.photo));

// `pick(held)` finds the item that would pop up now; `held(key, ts)` says whether an item that came
// while the screen was covered may still pop up. Returns the item to show — none while covered —
// and puts `notice(item)` on top for each item that has to wait. `kind` keeps one heads-up per kind.
export function useHeld({ tv = false, t, kind, pick, keyOf, notice }) {
  const covered = useCovered(tv);
  const held = useRef(new Set());
  const next = pick((key, ts) => held.current.has(key) && t - ts < HOLD_MS);
  const waiting = covered && next ? keyOf(next) : null;
  useEffect(() => {
    if (!waiting || held.current.has(waiting)) return;
    held.current.add(waiting);
    toast(notice(next), { key: kind, duration: 8000, action: { label: 'Se', onClick: uncover } });
  }, [waiting]);
  return covered ? null : next;
}
