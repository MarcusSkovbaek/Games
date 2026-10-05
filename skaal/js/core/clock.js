// Single source of "now" for all game logic. Tests (and ?dev mode) can shift it to fast-forward
// to the next breaker without waiting in real time.
let offset = 0;

export const now = () => Date.now() + offset;

export function setClockOffset(ms) {
  offset = Number(ms) || 0;
}

export function getClockOffset() {
  return offset;
}
