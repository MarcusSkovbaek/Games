// End-to-end tests: several isolated "phones" (browser contexts) play a real event against a
// local MQTT broker. Run with `npm run test:e2e`. Screenshots land in tests/e2e/screenshots/.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { setup, shot, assertNoErrors } from './lib.mjs';
import {
  photoOf,
  createEvent,
  joinEvent,
  logDrink,
  fastForward,
  derived,
  tab,
  dismissPopups,
  startGame,
  pidOf,
  toneWav,
  axeViolations,
} from './helpers.mjs';
import { startBroker } from '../support/broker.mjs';

const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const only = process.argv[2];

async function party(env) {
  const { ph: host, code } = await createEvent(env, { photo: await photoOf(env.browser, '😎', '#ff9a8b,#ff6a88') });
  const anna = await joinEvent(env, code, 'Anna', await photoOf(env.browser, '🦊', '#a1c4fd,#c2e9fb'));
  const bo = await joinEvent(env, code, 'Bo');
  const sara = await joinEvent(env, code, 'Sara', await photoOf(env.browser, '🐼', '#d4fc79,#96e6a1'));
  return { host, anna, bo, sara, code, all: [host, anna, bo, sara] };
}

const scenarios = {
  async 'party: create with photo, join, drinks sync, lead wheel, scoreboard'(env) {
    const { host, anna, bo, sara, all } = await party(env);
    assert.equal(await derived(sara, (d) => d.players.size), 4, 'everyone sees four players');
    assert.ok(await derived(sara, (d) => !!d.players.get(d.ranking.find((p) => p.name === 'Mads').pid).photo), 'photos sync');

    await logDrink(anna, 'Øl', 2);
    await logDrink(bo, 'Shot', 1);
    await logDrink(host, 'Jägerbomb', 1);
    await wait(800);
    assert.deepEqual(await derived(sara, (d) => d.ranking.map((p) => [p.name, p.points])), [
      ['Anna', 2],
      ['Mads', 2],
      ['Bo', 1],
      ['Sara', 0],
    ]);
    // Taking the lead opens the king wheel on the host's phone.
    await logDrink(host, 'Øl', 1);
    await host.page.waitForSelector('.wheel-wrap', { timeout: 5000 });
    await host.page.getByRole('button', { name: /SPIN HJULET/ }).click();
    await host.page.waitForSelector('.outcome', { timeout: 10000 });
    if (await host.page.locator('.distribute').count()) await host.page.getByRole('button', { name: /Fordel tilfældigt/ }).click();
    else if (await host.page.locator('.overlay .mg-pick').count()) await host.page.locator('.overlay .mg-pick').first().click();
    else if (await host.page.locator('.rule-suggestion').count()) await host.page.locator('.rule-suggestion').first().click();
    await host.page.locator('.overlay .btn--lg').last().click();
    await host.page.waitForSelector('.overlay', { state: 'detached', timeout: 5000 });
    await wait(800);
    assert.equal(await derived(anna, (d) => d.feed.filter((f) => f.kind === 'spin').length), 1, 'spin shows in everyone’s feed');
    await dismissPopups(all);
    await tab(sara, 'Stilling');
    await sara.page.waitForSelector('.podium');
    await sara.page.waitForSelector('.chart');
    await shot(sara.page, 'e2e-board');
    assertNoErrors(all);
  },

  async 'minigames: every game runs and resolves identically on all phones'(env) {
    const { host, anna, bo, sara, all } = await party(env);
    const byPid = {};
    for (const ph of all) byPid[await pidOf(ph)] = ph;
    await fastForward(all, 60_000);
    await tab(host, 'Spil');
    const finish = async (ms) => {
      await fastForward(all, ms);
      await wait(1600);
    };
    // The latest game that has started (the list also holds the next scheduled breaker).
    const results = async () =>
      Promise.all(all.map((ph) => derived(ph, (d) => JSON.stringify(d.games.filter((g) => g.start <= d.t).at(-1)?.result?.penalties || null))));
    const sameEverywhere = async (label) => {
      const r = await results();
      assert.ok(r.every((x) => x === r[0]) && r[0] !== 'null', `${label}: result must be resolved and identical (${r.join(' | ')})`);
      return JSON.parse(r[0]);
    };
    const next = async () => {
      await fastForward(all, 14_000);
      await wait(1300);
      await dismissPopups(all);
    };

    // Quiz: two right, two wrong.
    await startGame(host, 'Quiz');
    await fastForward(all, 3_000);
    await anna.page.waitForSelector('.mg-option');
    const correct = await derived(anna, (d) => d.activeGame.p.order.indexOf(0));
    for (const [ph, k] of [[anna, correct], [sara, correct], [bo, (correct + 1) % 4], [host, (correct + 2) % 4]]) {
      await ph.page.waitForSelector('.mg-option');
      await ph.page.locator('.mg-option').nth(k).click();
    }
    await finish(21_000);
    const quiz = await sameEverywhere('quiz');
    assert.deepEqual(quiz.map((p) => byPid[p.pid].name).sort(), ['Bo', 'Mads']);
    await shot(bo.page, 'e2e-quiz-result');
    await next();

    // Most likely: Anna gets three votes.
    await startGame(host, 'Mest tilbøjelig');
    await fastForward(all, 3_000);
    for (const [ph, target] of [[host, 'Anna'], [anna, 'Bo'], [bo, 'Anna'], [sara, 'Anna']]) {
      await ph.page.waitForSelector('.mg-pick');
      await ph.page.locator('.mg-pick', { hasText: target }).click();
    }
    await finish(36_000);
    assert.deepEqual((await sameEverywhere('mostLikely')).map((p) => [byPid[p.pid].name, p.n]), [['Anna', 3]]);
    await next();

    // Reaction: the host false-starts.
    await startGame(host, 'Hurtigste finger');
    await fastForward(all, 3_000);
    for (const ph of [anna, bo, sara]) {
      await ph.page.waitForSelector('.mg-reaction');
      await ph.page.locator('.mg-reaction').dispatchEvent('pointerdown');
    }
    await host.page.waitForSelector('.mg-reaction');
    await host.page.locator('.mg-reaction').dispatchEvent('pointerdown');
    await host.page.locator('.mg-reaction').dispatchEvent('pointerdown');
    for (const ph of [sara, anna, bo]) {
      await ph.page.waitForSelector('.mg-reaction.is-go', { timeout: 8000 });
      await ph.page.locator('.mg-reaction').dispatchEvent('pointerdown');
    }
    await finish(31_000);
    const reaction = await sameEverywhere('reaction');
    assert.ok(reaction.some((p) => byPid[p.pid].name === 'Mads'), 'false start drinks');
    assert.equal(reaction.length, 2, 'false starter + slowest drink');
    await next();

    // Duel: rock beats scissors.
    await startGame(host, 'Duel');
    await fastForward(all, 3_000);
    await wait(1200);
    const duel = await derived(host, (d) => d.activeGame.p);
    await byPid[duel.a].page.locator('.mg-rps__btn', { hasText: 'Sten' }).click();
    await byPid[duel.b].page.locator('.mg-rps__btn', { hasText: 'Saks' }).click();
    await finish(21_000);
    assert.deepEqual(await sameEverywhere('duel'), [{ pid: duel.b, n: 3, unit: 'sip' }]);
    await next();

    // Victim: whoever the reel lands on drinks.
    await startGame(host, 'Hvem drikker');
    await fastForward(all, 3_000);
    const victim = await derived(host, (d) => d.activeGame.p.pid);
    await finish(9_000);
    assert.equal((await sameEverywhere('victim'))[0].pid, victim);
    await next();

    // Never have I ever.
    await startGame(host, 'Jeg har aldrig');
    await fastForward(all, 3_000);
    await anna.page.getByRole('button', { name: /Det har jeg/ }).click();
    await bo.page.getByRole('button', { name: /Aldrig/ }).click();
    await finish(26_000);
    assert.deepEqual((await sameEverywhere('neverHave')).map((p) => byPid[p.pid].name), ['Anna']);
    await next();

    // Truth or dare: the chosen player completes the dare → nobody drinks.
    await startGame(host, 'Sandhed eller konsekvens');
    await fastForward(all, 3_000);
    await wait(1200);
    const td = await derived(host, (d) => d.activeGame.p.pid);
    await byPid[td].page.getByRole('button', { name: /Klaret/ }).click();
    await finish(46_000);
    const tdResult = await Promise.all(all.map((ph) => derived(ph, (d) => d.games.filter((g) => g.start <= d.t).at(-1).result.penalties.length)));
    assert.deepEqual(tdResult, [0, 0, 0, 0]);
    await next();

    // Categories: Sara is voted out.
    await startGame(host, 'Kategorier');
    await fastForward(all, 3_000);
    for (const ph of [host, anna, bo]) {
      await ph.page.waitForSelector('.mg-pick');
      await ph.page.locator('.mg-pick', { hasText: 'Sara' }).click();
    }
    await finish(76_000);
    assert.deepEqual((await sameEverywhere('categories')).map((p) => byPid[p.pid].name), ['Sara']);
    await next();

    // Cheers: everyone drinks one sip; tapping "Skål" counts as done.
    await startGame(host, 'Skål-runde');
    await fastForward(all, 3_000);
    await anna.page.getByRole('button', { name: /SKÅL/ }).click();
    await finish(16_000);
    const cheers = await sameEverywhere('cheers');
    assert.equal(cheers.length, 4);
    const annaPid = Object.keys(byPid).find((k) => byPid[k] === anna);
    assert.equal(cheers.find((p) => p.pid === annaPid).done, true, 'tapping Skål counts as done');
    await next();

    // Happy hour doubles beer for ten minutes.
    await startGame(host, 'Happy Hour');
    await fastForward(all, 3_000);
    const hh = await derived(host, (d) => d.activeGame.p.k);
    await finish(7_000);
    await dismissPopups(all);
    await tab(sara, 'Drik');
    const before = await derived(sara, (d) => d.mePlayer.points);
    const label = { beer: 'Øl', shot: 'Shot', drink: 'Drink', jager: 'Jägerbomb' }[hh];
    await logDrink(sara, label, 1);
    await dismissPopups([sara]);
    const after = await derived(sara, (d) => d.mePlayer.points);
    const base = { beer: 1, shot: 1, drink: 2, jager: 2 }[hh];
    assert.equal(after - before, base * 2, 'happy hour doubles points');
    await next();

    // New rule shows as an active rule.
    await startGame(host, 'Ny regel');
    await fastForward(all, 4_000);
    await wait(1200);
    assert.equal(await derived(bo, (d) => d.rules.length), 1);
    await next();

    // Game penalties end up in the inbox and can be acknowledged.
    const inbox = await derived(bo, (d) => d.inbox.length);
    assert.ok(inbox > 0, 'Bo has pending penalties');
    await tab(bo, 'Drik');
    await bo.page.locator('.inbox-card').first().getByRole('button', { name: /Skål ✓|Givet ✓/ }).click();
    await wait(400);
    assert.equal(await derived(bo, (d) => d.inbox.length), inbox - 1);
    assertNoErrors(all);
  },

  async 'features: undo, history, profile edit, pause, host settings, auto breaker, reload, TV, end'(env) {
    const { ph: host, code } = await createEvent(env);
    const anna = await joinEvent(env, code, 'Anna');
    const bo = await joinEvent(env, code, 'Bo');
    const all = [host, anna, bo];
    await logDrink(anna, 'Øl', 3);
    await logDrink(bo, 'Shot', 2);
    await dismissPopups(all);

    await logDrink(bo, 'Jägerbomb', 1);
    assert.equal(await bo.page.getByRole('button', { name: 'Fortryd' }).count(), 1, 'only the latest drink offers undo');
    await bo.page.getByRole('button', { name: 'Fortryd' }).click();
    await wait(900);
    assert.equal(await derived(host, (d) => d.ranking.find((p) => p.name === 'Bo').counts.jager || 0), 0, 'undo syncs');

    await tab(anna, 'Mig');
    await anna.page.locator('.history-item').first().getByRole('button').click();
    await anna.page.getByRole('button', { name: 'Slet', exact: true }).click();
    await wait(500);
    assert.equal(await derived(anna, (d) => d.mePlayer.counts.beer), 2);

    await anna.page.getByRole('button', { name: 'Redigér profil' }).click();
    await anna.page.fill('.sheet.is-open input[name=name]', 'Anna B');
    await anna.page.locator('.sheet.is-open').getByRole('button', { name: 'Gem' }).click();
    await wait(1000);
    assert.ok(await derived(host, (d) => d.ranking.some((p) => p.name === 'Anna B')), 'rename syncs');

    await anna.page.locator('.switch-row', { hasText: 'Pause' }).click();
    await wait(300);
    assert.equal(await derived(anna, (d) => d.mePlayer.paused), true);
    await anna.page.locator('.switch-row', { hasText: 'Pause' }).click();
    await wait(300);

    await tab(host, 'Mig');
    await host.page.getByRole('button', { name: /Event-indstillinger/ }).click();
    await host.page.locator('.sheet.is-open .chip', { hasText: 'Hver 10. min' }).click();
    const beer = host.page.locator('.sheet.is-open .drink-toggle', { hasText: 'Øl' });
    await beer.getByRole('button', { name: 'Mere' }).click();
    await beer.getByRole('button', { name: 'Mere' }).click();
    await host.page.locator('.sheet.is-open').getByRole('button', { name: /Gem ændringer/ }).click();
    await wait(1000);
    assert.equal(await derived(anna, (d) => d.mePlayer.points), 4, 'beer now worth 2 points');

    const nextIn = await derived(anna, (d) => d.nextAuto.start - d.t);
    assert.ok(nextIn > 9 * 60_000 && nextIn <= 10 * 60_000, 'new interval restarts the countdown');
    await fastForward(all, nextIn + 500);
    await wait(1500);
    const games = await Promise.all(all.map((ph) => derived(ph, (d) => d.activeGame && `${d.activeGame.gid}:${d.activeGame.g}`)));
    assert.ok(games[0] && games.every((g) => g === games[0]), `same automatic breaker everywhere (${games})`);
    await fastForward(all, 120_000);
    await wait(1200);
    await dismissPopups(all);

    await bo.page.reload();
    await bo.page.waitForSelector('.drink-grid');
    assert.equal(await derived(bo, (d) => d.mePlayer.counts.shot), 2, 'state survives a reload');

    const tv = await env.phone('tv', { width: 1280, height: 760, scale: 1 });
    await tv.page.goto(env.appUrl(`#/tv/${code}`));
    await tv.page.waitForSelector('.tv__board .board-row');
    await shot(tv.page, 'e2e-tv');
    const qrVisible = await tv.page.locator('.tv__join').evaluate((el) => el.getBoundingClientRect().bottom <= innerHeight);
    assert.ok(qrVisible, 'TV join QR fits on screen');

    await host.page.getByRole('button', { name: /Afslut eventet/ }).click();
    await host.page.getByRole('button', { name: 'Afslut event', exact: true }).click();
    await anna.page.waitForSelector('.final-hero', { timeout: 8000 });
    await shot(anna.page, 'e2e-final');
    assert.ok(await anna.page.locator('.award').count(), 'awards are shown');
    assertNoErrors(all.concat(tv));
  },

  async 'tour de france: yellow jersey, one face on every phone at 21 drinks, shared pictures, the song'(env) {
    const { host, anna, bo, sara, code, all } = await party(env);
    const song = toneWav(30);
    const serveSong = (ph) => ph.context.route('**/audio/baghjul.mp3', (r) => r.fulfill({ status: 200, contentType: 'audio/mpeg', body: song }));
    for (const ph of all) await serveSong(ph);
    const tv = await env.phone('tv', { width: 1280, height: 720, scale: 1 });
    await serveSong(tv);
    await tv.page.goto(env.appUrl(`#/tv/${code}`));
    await tv.page.waitForSelector('.tv__board');

    // The host switches the mode on, sets the song link and uploads a picture of Bobby.
    await tab(host, 'Mig');
    await host.page.getByText('Event-indstillinger').click();
    await host.page.locator('.switch-row', { hasText: 'Tour de France-tilstand' }).click();
    await host.page.fill('input[placeholder^="Link til mp3"]', 'audio/baghjul.mp3');
    const bobbyPic = await photoOf(env.browser, '🚴', '#60a5fa,#1e3a8a');
    await host.page.locator('.tour-row', { hasText: 'Bobby' }).locator('input[type=file]').setInputFiles({ name: 'bobby.jpg', mimeType: 'image/jpeg', buffer: bobbyPic });
    await host.page.getByRole('button', { name: 'Brug billede' }).click();
    await host.page.getByRole('button', { name: 'Gem ændringer' }).click();
    await tab(host, 'Drik');
    await sara.page.waitForFunction(() => window.__skaal.derived()?.tour.faces.bobby?.startsWith('data:image/jpeg'), null, { timeout: 8000 });
    assert.equal(await derived(sara, (d) => d.tour.faces.henning), null, 'the other faces keep their drawings');
    await tv.page.getByRole('button', { name: 'Slå lyd til' }).click();
    await tv.page.waitForSelector('text=Slå lyd til', { state: 'detached', timeout: 3000 });

    // The leader wears the yellow jersey on every phone.
    await logDrink(anna, 'Øl', 2);
    await wait(800);
    const annaPid = await pidOf(anna);
    for (const ph of [host, bo, sara]) assert.equal(await derived(ph, (d) => d.tour.leader), annaPid, `${ph.name} sees Anna in yellow`);
    await sara.page.waitForSelector('.tour-card .avatar--jersey');
    await tab(sara, 'Stilling');
    assert.equal(await sara.page.locator('.board-row .avatar--jersey').count(), 1, 'one yellow jersey on the board');
    await tab(sara, 'Drik');
    const axeSource = readFileSync(new URL('../../node_modules/axe-core/axe.min.js', import.meta.url), 'utf8');
    assert.deepEqual(await axeViolations(sara.page, axeSource), [], 'drinks tab with the Tour card is accessible');

    // Bo rides to 20 drinks; the 21st, logged in the app, brings out a face on every screen.
    await bo.page.evaluate(() => window.__skaal.session.get().room.appendMany(Array.from({ length: 20 }, () => ({ t: 'd', k: 'beer' }))));
    await wait(600);
    await logDrink(bo, 'Øl', 1);
    const screens = [bo, host, anna, sara, tv];
    for (const ph of screens) await ph.page.waitForSelector('.tour.is-revealed', { timeout: 10000 });
    const faces = await Promise.all([bo, host, anna, sara].map((ph) => derived(ph, (d) => d.tour.moments.map((m) => `${m.face}:${m.n}`).join())));
    assert.equal(new Set(faces).size, 1, 'the same face on every phone');
    const face = faces[0].split(':')[0];
    assert.ok(['henning', 'bobby', 'pimm'].includes(face));
    const names = await Promise.all(screens.map((ph) => ph.page.locator('.tour__name').textContent()));
    assert.equal(new Set(names).size, 1, 'every screen names the same face');
    if (face === 'bobby') assert.equal(await sara.page.locator('.tour__disc img.face-photo').count(), 1, 'the uploaded picture is used');
    const expected = { henning: 4, bobby: 2, pimm: 1 }[face];
    assert.equal(await derived(host, (d) => d.obligations.filter((ob) => ob.why?.tour).length), expected, `${face}: who has to drink`);
    assert.deepEqual(await axeViolations(bo.page, axeSource), [], 'the Tour overlay is accessible');
    await shot(bo.page, 'e2e-tour-rider');
    await shot(tv.page, 'e2e-tour-tv');

    // The rider's phone and the big screen play the song; the other phones a short fanfare.
    assert.equal(await bo.page.evaluate(() => window.__skaal.song.get().source), 'url');
    assert.equal(await tv.page.evaluate(() => window.__skaal.song.get().source), 'url');
    assert.equal(await sara.page.evaluate(() => window.__skaal.song.get().last?.source), 'fanfare');

    // Those hit drink straight from the overlay.
    for (const ph of [bo, host, anna, sara]) {
      await ph.page.locator('.tour__actions .btn').first().click();
      await ph.page.waitForSelector('.tour', { state: 'detached', timeout: 3000 });
    }
    await wait(1200);
    assert.equal(await derived(host, (d) => d.obligations.filter((ob) => ob.why?.tour && !ob.acked).length), 0, 'all sips drunk');
    assert.equal(await sara.page.locator('.inbox-modal').count(), 0, 'no second popup for the same sips');

    // One moment per rider; the song can be stopped from the top bar.
    await logDrink(bo, 'Shot', 1);
    assert.equal(await derived(sara, (d) => d.tour.moments.length), 1);
    await bo.page.getByRole('button', { name: 'Stop Tour-sangen' }).click();
    assert.equal(await bo.page.evaluate(() => window.__skaal.song.get().playing), false);
    assertNoErrors(all.concat(tv));
  },

  async 'resilience: offline logging, broker restart healing, continue on new phone, leave'(env) {
    const { ph: host, code } = await createEvent(env);
    const anna = await joinEvent(env, code, 'Anna');
    await logDrink(anna, 'Øl', 2);
    const port = env.broker.port;
    env.broker.dropClients();
    await env.broker.close();
    await anna.page.waitForSelector('.sync-dot.is-offline, .sync-dot.is-connecting', { timeout: 10000 });
    await logDrink(anna, 'Drink', 1);
    assert.equal(await derived(anna, (d) => d.mePlayer.alcoholic), 3, 'logging works offline');
    env.broker = await startBroker({ port });
    for (const ph of [host, anna]) {
      await ph.page.waitForFunction(() => window.__skaal.session.get().sync?.online > 0, null, { timeout: 30000 });
    }
    await wait(4500);
    assert.equal(await derived(host, (d) => d.ranking.find((p) => p.name === 'Anna').alcoholic), 3, 'offline drink arrives');
    const late = await joinEvent(env, code, 'Late');
    assert.equal(await derived(late, (d) => d.ranking.find((p) => p.name === 'Anna').alcoholic), 3, 'data healed after broker lost it');

    const annaPid = await pidOf(anna);
    const second = await env.phone('anna-2');
    await second.page.goto(env.appUrl(`#/e/${code}`));
    await second.page.getByRole('button', { name: /Fortsæt som dig selv/ }).click();
    await second.page.locator('.sheet.is-open .list-item', { hasText: 'Anna' }).click();
    await second.page.waitForSelector('.drink-grid', { timeout: 15000 });
    assert.equal(await pidOf(second), annaPid);
    await logDrink(second, 'Øl', 1);
    await wait(1500);
    assert.equal(await derived(anna, (d) => d.mePlayer.alcoholic), 4, 'both phones share one player');

    await tab(late, 'Mig');
    await late.page.getByRole('button', { name: /Forlad eventet/ }).click();
    await late.page.getByRole('button', { name: 'Forlad', exact: true }).click();
    await late.page.waitForSelector('.landing__logo');
    await wait(1200);
    assert.ok(await derived(host, (d) => d.ranking.find((p) => p.name === 'Late').left), 'leaving syncs');
    const ignore = (ph) => ({ ...ph, errors: ph.errors.filter((e) => !e.includes('WebSocket connection')) });
    assertNoErrors([host, anna, late, second].map(ignore));
  },

  async 'layout & accessibility: 320px phone, axe scan of every tab'(env) {
    const { ph: host, code } = await createEvent(env);
    const se = await env.phone('se', { width: 320, height: 568, scale: 2 });
    await se.page.goto(env.appUrl(`#/e/${code}`));
    await se.page.fill('input[name=name]', 'Lille Lars Christian Kristensen');
    await se.page.getByRole('button', { name: /Deltag i festen/ }).click();
    await se.page.waitForSelector('.drink-grid');
    await logDrink(se, 'Øl', 1);
    await wait(1100); // let the "+1" animation finish
    const axeSource = readFileSync(new URL('../../node_modules/axe-core/axe.min.js', import.meta.url), 'utf8');
    for (const name of ['Drik', 'Stilling', 'Spil', 'Feed', 'Mig']) {
      await tab(se, name);
      await wait(300);
      const overflow = await se.page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      assert.equal(overflow, 0, `${name}: no horizontal scrolling at 320px`);
      await se.page.addScriptTag({ content: axeSource });
      const violations = await se.page.evaluate(async () =>
        (await window.axe.run(document, { resultTypes: ['violations'] })).violations
          .filter((v) => v.impact === 'serious' || v.impact === 'critical')
          .map((v) => `${v.id} (${v.nodes[0]?.target?.join(' ')})`),
      );
      assert.deepEqual(violations, [], `${name}: accessibility`);
    }
    await shot(se.page, 'e2e-320');
    assertNoErrors([host, se]);
  },
};

let failed = 0;
for (const [name, fn] of Object.entries(scenarios)) {
  if (only && !name.includes(only)) continue;
  const env = await setup();
  const started = Date.now();
  try {
    await fn(env);
    console.log(`✓ ${name} (${((Date.now() - started) / 1000).toFixed(1)} s)`);
  } catch (err) {
    failed++;
    console.log(`✗ ${name}\n  ${err.stack?.split('\n').slice(0, 3).join('\n  ')}`);
    for (const ph of env.phones) await shot(ph.page, `fail-${ph.name}`).catch(() => {});
  } finally {
    await env.teardown().catch(() => {});
  }
}
console.log(failed ? `\n${failed} scenario(s) failed` : '\nAll scenarios passed');
process.exit(failed ? 1 : 0);
