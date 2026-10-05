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
  rigSpin,
  createPubGolf,
  joinPubGolf,
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
    if (await host.page.locator('.handout').count()) await host.page.getByRole('button', { name: /Tilfældigt/ }).click();
    else if (await host.page.locator('.overlay .mg-pick').count()) await host.page.locator('.overlay .mg-pick').first().click();
    else if (await host.page.locator('.rule-suggestion').count()) await host.page.locator('.rule-suggestion').first().click();
    await host.page.locator('.overlay .btn--lg').last().click();
    // The wheel closes; a fællesskål ("Alle 1") would pop up next on every phone.
    await host.page.waitForSelector('.overlay:not(.gtoast)', { state: 'detached', timeout: 5000 });
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
      await wait(150); // a human reaction: taps within 60 ms of green count as a false start
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

  async 'wheel rewards: tap who drinks and they get a pop-up; a fællesskål pops up on every phone'(env) {
    const { host, anna, bo, sara, code, all } = await party(env);
    const tv = await env.phone('tv', { width: 1280, height: 720, scale: 1 });
    await tv.page.goto(env.appUrl(`#/tv/${code}`));
    await tv.page.waitForSelector('.tv__board');
    const axeSource = readFileSync(new URL('../../node_modules/axe-core/axe.min.js', import.meta.url), 'utf8');

    // Mads won "Giv 4": tapping Anna, Bo and Anna again gives Anna 3 and Bo 1.
    await rigSpin(host, 'king', 'give4');
    const pick = (name) => host.page.locator('.handout__cell', { hasText: name }).locator('.mg-pick');
    await pick('Anna').click();
    assert.equal(await host.page.locator('.handout__sum').textContent(), 'Anna 4', 'one pick takes all the sips');
    await pick('Bo').click();
    assert.equal(await host.page.locator('.handout__sum').textContent(), 'Anna 2 · Bo 2', 'shared evenly');
    await pick('Anna').click();
    assert.equal(await host.page.locator('.handout__sum').textContent(), 'Anna 3 · Bo 1');
    assert.deepEqual(await axeViolations(host.page, axeSource), [], 'hand-out screen is accessible');
    await host.page.getByRole('button', { name: /Send 4 slurke afsted/ }).click();

    // The pop-up lands on Anna's and Bo's phones — and nowhere else.
    await anna.page.waitForSelector('.drink-pop', { timeout: 6000 });
    await bo.page.waitForSelector('.drink-pop', { timeout: 6000 });
    assert.match(await anna.page.locator('.drink-pop').innerText(), /Mads giver dig\s+3\s+slurke\s+Kongehjulet/);
    assert.match(await bo.page.locator('.drink-pop').innerText(), /Mads giver dig\s+1\s+slurk\b/);
    await shot(anna.page, 'e2e-drink-popup');
    assert.deepEqual(await axeViolations(anna.page, axeSource), [], 'drink pop-up is accessible');
    await wait(400);
    assert.equal(await sara.page.locator('.drink-pop').count() + (await host.page.locator('.drink-pop').count()), 0);
    await anna.page.getByRole('button', { name: 'Skål — drukket ✓' }).click();
    await bo.page.getByRole('button', { name: 'Senere' }).click();
    await wait(900);
    assert.deepEqual(
      await derived(host, (d) => d.obligations.filter((ob) => ob.from === d.me).map((ob) => [d.players.get(ob.target).name, ob.n, ob.acked]).sort()),
      [
        ['Anna', 3, true],
        ['Bo', 1, false],
      ],
    );
    assert.equal(await bo.page.locator('.inbox-card').count(), 1, '"Senere" keeps it on the drinks tab');
    assert.equal(await bo.page.locator('.drink-pop').count(), 0, '… without popping up again');

    // Sara raises a fællesskål: it pops up on every phone (hers too) and on the big screen.
    await rigSpin(sara, 'king', 'all1');
    await sara.page.getByRole('button', { name: /Fedt/ }).click();
    for (const ph of [sara, host, anna, bo, tv]) await ph.page.waitForSelector('.gtoast', { timeout: 6000 });
    assert.match(await host.page.locator('.gtoast .overlay__title').textContent(), /Sara udbringer en skål/);
    assert.match(await sara.page.locator('.gtoast .overlay__title').textContent(), /Du udbringer en skål/);
    await host.page.getByRole('button', { name: 'Skål — drukket ✓' }).click(); // enabled once the 3-2-1 is over
    await anna.page.getByRole('button', { name: 'Skål — drukket ✓' }).click();
    await sara.page.waitForFunction(() => document.querySelector('.gtoast__progress')?.textContent.startsWith('2 af 3'), null, { timeout: 6000 });
    await tv.page.waitForFunction(() => document.querySelector('.gtoast__progress')?.textContent.startsWith('2 af 3'), null, { timeout: 6000 });
    await shot(sara.page, 'e2e-faellesskaal');
    await shot(tv.page, 'e2e-faellesskaal-tv');
    assert.deepEqual(await axeViolations(bo.page, axeSource), [], 'fællesskål is accessible');
    await bo.page.locator('.gtoast').getByRole('button', { name: 'Luk' }).click();
    await wait(600);
    assert.equal(await bo.page.locator('.drink-pop').count(), 0, 'closing the toast does not pop the sip up again');
    assert.equal(await bo.page.locator('.inbox-card').count(), 2, 'the sip waits on the drinks tab');
    await sara.page.getByRole('button', { name: /Skål! 🥂/ }).click();
    await sara.page.waitForSelector('.gtoast', { state: 'detached' });
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
    assert.equal(await sara.page.locator('.drink-pop').count(), 0, 'no second popup for the same sips');

    // One moment per rider; the song can be stopped from the top bar.
    await logDrink(bo, 'Shot', 1);
    assert.equal(await derived(sara, (d) => d.tour.moments.length), 1);
    await bo.page.getByRole('button', { name: 'Stop Tour-sangen' }).click();
    assert.equal(await bo.page.evaluate(() => window.__skaal.song.get().playing), false);
    assertNoErrors(all.concat(tv));
  },

  async 'pub golf: teams, judge and self scoring, penalties, bonuses, photos, podiums, challenges, TV, new judge'(env) {
    const axeSource = readFileSync(new URL('../../node_modules/axe-core/axe.min.js', import.meta.url), 'utf8');
    const bars = ["Heidi's Bier Bar", 'Mikkeller'];
    const { ph: host, code } = await createPubGolf(env, { bars, team: 'Hold Blå', photo: await photoOf(env.browser, '😎', '#ff9a8b,#ff6a88') });
    const anna = await joinPubGolf(env, code, 'Anna', { team: 'Hold Rød', photo: await photoOf(env.browser, '🦊', '#a1c4fd,#c2e9fb') });
    const bo = await joinPubGolf(env, code, 'Bo', { team: 'Hold Blå' });
    const sara = await joinPubGolf(env, code, 'Sara', { team: 'Hold Rød', photo: await photoOf(env.browser, '🐼', '#d4fc79,#96e6a1') });
    const all = [host, anna, bo, sara];
    const tv = await env.phone('tv', { width: 1280, height: 720, scale: 1 });
    await tv.page.goto(env.appUrl(`#/tv/${code}`));
    await tv.page.waitForSelector('.pg-tv__hole');
    const standings = (ph) => derived(ph, (d) => d.pg.teams.map((tm) => [tm.name, tm.score]));
    const closeMoments = async (phones) => {
      for (const ph of phones) {
        for (let i = 0; i < 4; i++) {
          const btn = ph.page.locator('.pg-moment .pg-moment__actions .btn').last();
          if (!(await btn.count())) break;
          await btn.click();
          await wait(350);
        }
      }
    };

    // Two teams of two; the host is the judge and plays for Hold Blå.
    assert.deepEqual(
      await derived(sara, (d) => d.pg.teams.map((tm) => [tm.name, tm.members.map((pid) => d.players.get(pid).name).sort().join('+')]).sort()),
      [['Hold Blå', 'Bo+Mads'], ['Hold Rød', 'Anna+Sara']],
    );
    assert.equal(await derived(bo, (d) => d.players.get(d.pg.judge).name), 'Mads');
    assert.equal(await host.page.locator('.pg-judge').count(), 1, 'the judge has the scoring panel');
    assert.equal(await anna.page.locator('.pg-judge').count(), 0, 'players do not');
    assert.equal(await anna.page.locator('.pg-hero__bar').textContent(), bars[0]);

    // Hole 1 (par 3): players note their own sips; the judge notes others and has the last word.
    await anna.page.getByRole('button', { name: '3 slag', exact: true }).click();
    await bo.page.getByRole('button', { name: '2 slag', exact: true }).click();
    const judgeScore = async (judge, who, n) => {
      await judge.page.getByRole('button', { name: new RegExp(`^(Notér slag for ${who}|${who}: \\d+ slag\\. Ret)$`) }).click();
      await judge.page.locator('.sheet.is-open .pg-numpad .pg-stroke', { hasText: new RegExp(`^${n}$`) }).click();
      await judge.page.waitForSelector('.sheet.is-open', { state: 'detached' });
    };
    await judgeScore(host, 'Sara', 4);
    await judgeScore(host, 'Mads', 1);
    await host.page.waitForSelector('[aria-label="Anna: 3 slag. Ret"]', { timeout: 5000 });
    await judgeScore(host, 'Anna', 5);
    await wait(900);
    const hole1 = (ph) =>
      derived(ph, (d) => Object.fromEntries([...d.pg.players.values()].map((x) => [d.players.get(x.pid).name, [x.holes[d.pg.holes[0].id]?.s, !!x.holes[d.pg.holes[0].id]?.official]])));
    for (const ph of all) assert.deepEqual(await hole1(ph), { Mads: [1, true], Anna: [5, true], Bo: [2, false], Sara: [4, true] }, `${ph.name}: hole 1`);
    await anna.page.waitForSelector('.pg-mine__locked', { timeout: 5000 });
    assert.match(await anna.page.locator('.pg-mine__locked').textContent(), /5 slag.*Sat af dommeren/s, "Anna can't change the judge's score");
    assert.equal(await derived(sara, (d) => d.pg.individuals.find((x) => d.players.get(x.pid).name === 'Mads').aces), 1, 'hole in one');

    // A penalty for Bo, style points for Hold Rød.
    await host.page.getByRole('button', { name: 'Straf eller bonus til Bo' }).click();
    await host.page.locator('.sheet.is-open .pg-preset', { hasText: 'Spildt' }).click();
    await host.page.waitForSelector('.sheet.is-open', { state: 'detached' });
    await host.page.getByRole('button', { name: 'Straf eller bonus til Hold Rød' }).click();
    await host.page.locator('.sheet.is-open .segmented__opt', { hasText: 'Bonus' }).click();
    await host.page.locator('.sheet.is-open .pg-preset', { hasText: 'Stilpoint' }).click();
    await host.page.waitForSelector('.sheet.is-open', { state: 'detached' });
    await wait(900);
    // Rød: Anna +2, Sara +1, style −1 → +2. Blå: Mads −2, Bo −1 + 1 penalty → −2.
    for (const ph of all) assert.deepEqual(await standings(ph), [['Hold Blå', -2], ['Hold Rød', 2]], `${ph.name}: standings after hole 1`);
    assert.deepEqual(await axeViolations(host.page, axeSource), [], 'the judge panel is accessible');
    assert.deepEqual(await axeViolations(anna.page, axeSource), [], 'the course tab is accessible');
    await shot(host.page, 'e2e-pg-judge');

    // The judge moves everyone on to hole 2.
    await host.page.getByRole('button', { name: /Videre til hul 2/ }).click();
    await host.page.getByRole('button', { name: 'Hul 2', exact: true }).click();
    for (const ph of [anna, bo, sara]) await ph.page.waitForFunction(() => window.__skaal.derived().pg.current.n === 2, null, { timeout: 6000 });
    await anna.page.waitForFunction((bar) => document.querySelector('.pg-hero__bar')?.textContent === bar, bars[1], { timeout: 3000 });
    await tv.page.waitForFunction(() => document.querySelector('.pg-tv__n')?.textContent === 'Hul2/9', null, { timeout: 6000 });

    // Photos: shared with everyone, deleted by their owner, liked.
    const sharePhoto = async (ph, emoji, colors, caption) => {
      await tab(ph, 'Fotos');
      await ph.page.setInputFiles('.pg-upload input[type=file]', { name: 'photo.jpg', mimeType: 'image/jpeg', buffer: await photoOf(env.browser, emoji, colors) });
      await ph.page.waitForSelector('.pg-share__img');
      if (caption) await ph.page.fill('input[placeholder^="Skriv en tekst"]', caption);
      await ph.page.getByRole('button', { name: 'Del med alle' }).click();
      await ph.page.waitForSelector('.sheet.is-open', { state: 'detached' });
    };
    await sharePhoto(anna, '🍻', '#f6d365,#fda085', 'Skål fra Heidis!');
    await sharePhoto(bo, '⛳', '#84fab0,#8fd3f4');
    const tiles = (ph, n) => ph.page.waitForFunction((k) => document.querySelectorAll('.pg-tile > img').length === k, n, { timeout: 10000 });
    for (const ph of [host, sara]) {
      await tab(ph, 'Fotos');
      await tiles(ph, 2);
    }
    await bo.page.locator('.pg-tile', { hasText: 'Bo' }).click();
    await bo.page.locator('.pg-viewer__bar').getByRole('button', { name: 'Slet' }).click();
    await bo.page.locator('.sheet.is-open .btn-row').getByRole('button', { name: 'Slet', exact: true }).click();
    for (const ph of [host, sara, anna, bo]) await tiles(ph, 1);
    await sara.page.locator('.pg-tile', { hasText: 'Anna' }).click();
    await sara.page.locator('.pg-like').click();
    await sara.page.locator('.sheet.is-open .sheet__close').click();
    await anna.page.waitForSelector('.pg-tile__likes', { timeout: 5000 });
    assert.deepEqual(await axeViolations(sara.page, axeSource), [], 'the photo gallery is accessible');

    // The judge puts Anna's photo first in the photo competition: a podium pops up everywhere.
    await host.page.locator('.pg-tile', { hasText: 'Anna' }).click();
    await host.page.getByRole('button', { name: /🥇 1\.-plads/ }).click();
    for (const ph of [anna, bo, sara, tv]) await ph.page.waitForSelector('.pg-moment--podium', { timeout: 6000 });
    assert.equal(await host.page.locator('.pg-moment').count(), 0, 'no pop-up for the judge who set it');
    assert.match(await sara.page.locator('.pg-moment--podium .overlay__title').textContent(), /Fotokonkurrence/);
    assert.equal(await sara.page.locator('.pg-moment--podium .pg-stage__photo').count(), 1, 'the winning photo is on the podium');
    assert.deepEqual(await axeViolations(sara.page, axeSource), [], 'the podium pop-up is accessible');
    await shot(sara.page, 'e2e-pg-podium');
    await closeMoments(all);
    await tv.page.locator('.pg-moment').click();
    await host.page.locator('.sheet.is-open .sheet__close').click();
    await wait(600);
    assert.deepEqual(await standings(bo), [['Hold Blå', -2], ['Hold Rød', -1]], 'photo podium: 3 strokes off for Anna’s team');

    // Best outfit: Blå first, Rød second.
    await tab(host, 'Konkurrencer');
    await host.page.locator('.pg-comp', { hasText: 'Bedste outfit' }).getByRole('button', { name: 'Sæt podiet' }).click();
    const rows = host.page.locator('.sheet.is-open .pg-podium-row');
    await rows.nth(0).locator('.team-chip', { hasText: 'Hold Blå' }).click();
    await rows.nth(1).locator('.team-chip', { hasText: 'Hold Rød' }).click();
    await host.page.getByRole('button', { name: 'Gem podiet' }).click();
    for (const ph of [anna, bo, sara, tv]) await ph.page.waitForSelector('.pg-moment--podium', { timeout: 6000 });
    assert.match(await bo.page.locator('.pg-moment--podium .overlay__title').textContent(), /Bedste outfit/);
    await closeMoments(all);
    await tv.page.locator('.pg-moment').click();
    await tab(sara, 'Konkurrencer');
    assert.equal(await sara.page.locator('.pg-comp', { hasText: 'Bedste outfit' }).locator('.pg-place').count(), 2, 'everyone sees the podium');
    assert.deepEqual(await axeViolations(sara.page, axeSource), [], 'the competitions tab is accessible');
    assert.deepEqual(await standings(anna), [['Hold Blå', -5], ['Hold Rød', -3]]);

    // A challenge pops up on every phone; the judge crowns Hold Rød (3 strokes off), who take the lead.
    await tab(host, 'Bane');
    await host.page.locator('.pg-judge').getByRole('button', { name: 'Udfordring' }).click();
    await host.page.getByRole('button', { name: 'Send til alle' }).click();
    for (const ph of [...all, tv]) await ph.page.waitForSelector('.pg-moment:not(.pg-moment--podium)', { timeout: 6000 });
    const challenge = await derived(sara, (d) => d.pg.challenges[0].text);
    assert.equal(await bo.page.locator('.pg-moment__text').textContent(), challenge);
    assert.deepEqual(await axeViolations(bo.page, axeSource), [], 'the challenge pop-up is accessible');
    await shot(bo.page, 'e2e-pg-challenge');
    await closeMoments([anna, bo, sara]);
    const crown = host.page.locator('.crown-pick');
    await crown.getByRole('button', { name: 'Mere' }).click();
    await crown.getByRole('button', { name: 'Mere' }).click();
    await crown.locator('.team-chip', { hasText: 'Hold Rød' }).click();
    await host.page.waitForSelector('.pg-moment', { state: 'detached' });
    await tv.page.locator('.pg-moment').click();
    await wait(900);
    for (const ph of all) assert.deepEqual(await standings(ph), [['Hold Rød', -6], ['Hold Blå', -5]], `${ph.name}: standings after the challenge`);
    assert.equal(await derived(bo, (d) => d.pg.challenges[0].winners.map((w) => d.pg.teamById.get(w.team).name).join()), 'Hold Rød');

    // The big screen: the hole, the teams, the photo and the winners.
    await tv.page.waitForSelector('.pg-moment', { state: 'detached' });
    assert.match(await tv.page.locator('.pg-trow--tv').first().textContent(), /Hold Rød/);
    assert.equal(await tv.page.locator('.pg-tv__photo > img').count(), 1);
    assert.equal(await tv.page.locator('.pg-tv__comp').count(), 2, 'competition winners on the big screen');
    assert.deepEqual(await axeViolations(tv.page, axeSource), [], 'the big screen is accessible');
    await shot(tv.page, 'e2e-pg-tv');

    // Standings: teams, players and the score card.
    await tab(sara, 'Stilling');
    for (const view of ['Hold', 'Spillere', 'Scorekort']) {
      await sara.page.locator('.segmented__opt', { hasText: view }).click();
      await wait(250);
      assert.deepEqual(await axeViolations(sara.page, axeSource), [], `standings (${view}) are accessible`);
    }

    // The host hands the whistle to Anna: she gets the panel, the host loses it.
    await tab(host, 'Mig');
    await host.page.getByRole('button', { name: /Dommer: Mads/ }).click();
    await host.page.locator('.sheet.is-open .list-item', { hasText: 'Anna' }).click();
    await tab(anna, 'Bane');
    await anna.page.waitForSelector('.pg-judge', { timeout: 6000 });
    await tab(host, 'Bane');
    assert.equal(await host.page.locator('.pg-judge').count(), 0, 'only one judge');
    await judgeScore(anna, 'Bo', 3);
    await tab(bo, 'Bane');
    await bo.page.waitForSelector('.pg-mine__locked', { timeout: 6000 });
    await wait(600);
    assert.deepEqual(await standings(sara), [['Hold Rød', -6], ['Hold Blå', -3]], 'Bo: two over par on hole 2');
    assert.deepEqual(await axeViolations(anna.page, axeSource), [], 'the new judge’s panel is accessible');

    // A small phone joins late: every tab fits 320px and passes axe.
    const se = await joinPubGolf(env, code, 'Lille Lars Christian Kristensen', { size: { width: 320, height: 568, scale: 2 } });
    await wait(800);
    await closeMoments([se]);
    for (const name of ['Bane', 'Stilling', 'Konkurrencer', 'Fotos', 'Mig']) {
      await tab(se, name);
      await wait(300);
      const overflow = await se.page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      assert.equal(overflow, 0, `${name}: no horizontal scrolling at 320px`);
      assert.deepEqual(await axeViolations(se.page, axeSource), [], `${name} at 320px: accessibility`);
    }
    await tab(se, 'Bane');
    await shot(se.page, 'e2e-pg-320');

    // The host ends the round: the result is the same on every phone.
    await tab(host, 'Mig');
    await host.page.getByRole('button', { name: /Afslut runden/ }).click();
    await host.page.locator('.sheet.is-open .btn-row').getByRole('button', { name: 'Afslut', exact: true }).click();
    await tab(sara, 'Bane');
    await sara.page.waitForSelector('.pg-final', { timeout: 6000 });
    assert.match(await sara.page.locator('.pg-final__title').textContent(), /Hold Rød vinder/);
    await shot(sara.page, 'e2e-pg-final');
    assertNoErrors(all.concat(tv, se));
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
    console.log(`✗ ${name}\n  ${err.stack?.split('\n').slice(0, 12).join('\n  ')}`);
    for (const ph of env.phones) await shot(ph.page, `fail-${ph.name}`).catch(() => {});
  } finally {
    await env.teardown().catch(() => {});
  }
}
console.log(failed ? `\n${failed} scenario(s) failed` : '\nAll scenarios passed');
process.exit(failed ? 1 : 0);
