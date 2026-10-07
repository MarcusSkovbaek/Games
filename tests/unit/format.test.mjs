import test from 'node:test';
import assert from 'node:assert/strict';
import { fmtWhen, genitive, fmtAgo } from '../../skaal/js/ui/format.js';

// Local times (fmtWhen speaks of days as the phone sees them).
const at = (y, m, d, h, min = 0) => new Date(y, m - 1, d, h, min).getTime();

test('fmtWhen: a moment seen from now, by the day', () => {
  const now = at(2026, 10, 10, 22, 14);
  assert.equal(fmtWhen(at(2026, 10, 10, 23, 5), now), 'i dag kl. 23:05');
  assert.equal(fmtWhen(at(2026, 10, 11, 22, 14), now), 'i morgen kl. 22:14', '24 hours later');
  assert.equal(fmtWhen(at(2026, 10, 11, 0, 30), now), 'i morgen kl. 00:30', 'just after midnight is tomorrow');
  assert.equal(fmtWhen(at(2026, 10, 9, 21, 0), now), 'i går kl. 21:00');
  assert.equal(fmtWhen(at(2026, 10, 13, 9, 5), now), 'tirsdag kl. 09:05', 'within the week: the weekday');
  assert.equal(fmtWhen(at(2026, 10, 24, 18, 0), now), '24/10 kl. 18:00', 'further away: the date');
  // Across the end of summer time (25 October 2026 in Denmark the night has 25 hours).
  assert.equal(fmtWhen(at(2026, 10, 25, 22, 0), at(2026, 10, 24, 22, 0)), 'i morgen kl. 22:00');
});

test('genitive: Annas, Jonas’', () => {
  assert.equal(genitive('Anna'), 'Annas');
  assert.equal(genitive('Bo'), 'Bos');
  assert.equal(genitive('Jonas'), "Jonas'");
  assert.equal(genitive('Max'), "Max'");
  assert.equal(genitive('Fritz'), "Fritz'");
});

test('fmtAgo: just now, minutes, hours, the clock', () => {
  const now = at(2026, 10, 10, 22, 0);
  assert.equal(fmtAgo(now - 20_000, now), 'lige nu');
  assert.equal(fmtAgo(now - 5 * 60_000, now), '5 min siden');
  assert.equal(fmtAgo(now - 2 * 3600_000 - 10 * 60_000, now), '2 t 10 min siden');
  assert.equal(fmtAgo(now - 8 * 3600_000, now), 'kl. 14:00');
});
