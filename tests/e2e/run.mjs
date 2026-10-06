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
  takePhoto,
  pickPhoto,
  shootDisposable,
} from './helpers.mjs';
import { startBroker } from '../support/broker.mjs';

const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const only = process.argv[2];

// Whether this phone keeps a file in its own storage (IndexedDB).
const idbHas = (ph, key) =>
  ph.page.evaluate(async (k) => {
    const db = await new Promise((resolve) => (indexedDB.open('skaal-files', 1).onsuccess = (e) => resolve(e.target.result)));
    return new Promise((resolve) => (db.transaction('files').objectStore('files').get(k).onsuccess = (e) => resolve(e.target.result !== undefined)));
  }, key);

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
    // The profile carries a tiny stand-in; the real photo is fetched for the avatar on its own,
    // and painted as a background (nothing to save).
    const mads = await derived(sara, (d) => d.ranking.find((p) => p.name === 'Mads'));
    assert.ok(mads.photo.length < 5000 && /^[0-9a-f]{12}$/.test(mads.pv), `small profile (${mads.photo.length} chars), photo named ${mads.pv}`);
    await tab(sara, 'Stilling');
    await sara.page.waitForFunction(() => [...document.querySelectorAll('.avatar__img')].filter((el) => el.style.backgroundImage.includes('blob:')).length >= 3, null, { timeout: 10000 });
    assert.equal(await sara.page.locator('.avatar img').count(), 0);
    await tab(sara, 'Drik');

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
    const qrVisible = await tv.page.locator('.tv__invite .qr').evaluate((el) => el.getBoundingClientRect().bottom <= innerHeight);
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

    // Photos: taken in the app (or picked from the camera roll), deleted by their owner, liked.
    await takePhoto(anna, 'Skål fra Heidis!');
    await pickPhoto(bo, await photoOf(env.browser, '⛳', '#84fab0,#8fd3f4'));
    const tiles = (ph, n) => ph.page.waitForFunction((k) => document.querySelectorAll('.photo-tile').length === k, n, { timeout: 10000 });
    for (const ph of [host, sara, anna, bo]) {
      await tab(ph, 'Fotos');
      await tiles(ph, 2);
    }
    await bo.page.locator('.photo-tile', { hasText: 'Bo' }).click();
    await bo.page.locator('.viewer__action', { hasText: 'Slet' }).click();
    await bo.page.locator('.viewer__confirm .btn--danger').click();
    for (const ph of [host, sara, anna, bo]) await tiles(ph, 1);
    await sara.page.locator('.photo-tile', { hasText: 'Anna' }).click();
    await sara.page.locator('.viewer__like').click();
    await sara.page.getByRole('button', { name: 'Luk', exact: true }).click();
    await anna.page.waitForSelector('.photo-tile__likes', { timeout: 5000 });
    assert.deepEqual(await axeViolations(sara.page, axeSource), [], 'the photo gallery is accessible');

    // The judge puts Anna's photo first in the photo competition: a podium pops up everywhere.
    await host.page.locator('.photo-tile', { hasText: 'Anna' }).click();
    await host.page.locator('.viewer__places').getByRole('button', { name: /🥇 1\.-plads/ }).click();
    for (const ph of [anna, bo, sara, tv]) await ph.page.waitForSelector('.pg-moment--podium', { timeout: 6000 });
    assert.equal(await host.page.locator('.pg-moment').count(), 0, 'no pop-up for the judge who set it');
    assert.match(await sara.page.locator('.pg-moment--podium .overlay__title').textContent(), /Fotokonkurrence/);
    assert.equal(await sara.page.locator('.pg-moment--podium .pg-stage__photo').count(), 1, 'the winning photo is on the podium');
    assert.deepEqual(await axeViolations(sara.page, axeSource), [], 'the podium pop-up is accessible');
    await shot(sara.page, 'e2e-pg-podium');
    await closeMoments(all);
    await tv.page.locator('.pg-moment').click();
    await host.page.getByRole('button', { name: 'Luk', exact: true }).click();
    await host.page.waitForSelector('.viewer', { state: 'detached' });
    await wait(600);
    assert.deepEqual(await standings(bo), [['Hold Blå', -2], ['Hold Rød', -1]], 'photo podium: 3 strokes off for Anna’s team');

    // The judge keeps the competitions secret: the players see one only when the judge starts it
    // — then it pops up on every phone and the big screen. (A decided one stays visible.)
    await tab(host, 'Konkurrencer');
    await host.page.locator('.switch-row', { hasText: 'Spillerne kan se konkurrencerne på forhånd' }).click();
    await tab(sara, 'Konkurrencer');
    await sara.page.waitForSelector('.pg-comp-secret', { timeout: 6000 });
    assert.deepEqual(await sara.page.locator('.pg-comp__title').allTextContents(), ['FotokonkurrenceFoto'], 'only the decided photo competition');
    assert.equal(await host.page.locator('.pg-comp.is-secret').count(), 3, 'the judge sees the secret ones');
    assert.deepEqual(await axeViolations(sara.page, axeSource), [], 'secret competitions: accessible');
    assert.deepEqual(await axeViolations(host.page, axeSource), [], 'the judge’s competitions: accessible');
    await shot(sara.page, 'e2e-pg-comps-secret');
    await shot(host.page, 'e2e-pg-comps-judge');
    await host.page.locator('.pg-comp', { hasText: 'Bedste holdsang' }).getByRole('button', { name: 'Start', exact: true }).click();
    await host.page.locator('.sheet.is-open .btn-row').getByRole('button', { name: 'Start', exact: true }).click();
    for (const ph of [anna, bo, sara, tv]) await ph.page.waitForSelector('.pg-moment', { timeout: 6000 });
    assert.equal(await sara.page.locator('.pg-moment__text').textContent(), 'Bedste holdsang');
    assert.equal(await host.page.locator('.pg-moment').count(), 0, 'no pop-up for the judge who started it');
    assert.deepEqual(await axeViolations(sara.page, axeSource), [], 'the competition pop-up is accessible');
    await shot(sara.page, 'e2e-pg-comp-start');
    await closeMoments([anna, bo, sara]);
    await tv.page.locator('.pg-moment').click();
    await sara.page.waitForSelector('.pg-comp:has-text("Bedste holdsang") .pg-comp__live', { timeout: 6000 });
    assert.equal(await sara.page.locator('.pg-comp').count(), 2);
    assert.equal(await derived(bo, (d) => d.pg.feed.filter((f) => f.kind === 'pgcomp').length), 1, 'the start is in the feed');

    // Best outfit: Blå first, Rød second (deciding it shows it too).
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
    assert.equal(await tv.page.locator('.tv-photo').count(), 1);
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

  async 'photos: in-app camera, feed, full size on demand, likes, hide and delete, no saving, TV, old events'(env) {
    const axeSource = readFileSync(new URL('../../node_modules/axe-core/axe.min.js', import.meta.url), 'utf8');
    const { ph: host, code } = await createEvent(env, { photo: await photoOf(env.browser, '😎', '#ff9a8b,#ff6a88') });
    assert.equal(code.length, 12, 'new events get 12-character codes');
    const anna = await joinEvent(env, code, 'Anna', await photoOf(env.browser, '🦊', '#a1c4fd,#c2e9fb'));
    const bo = await joinEvent(env, code, 'Bo');
    const all = [host, anna, bo];
    const tv = await env.phone('tv', { width: 1280, height: 720, scale: 1 });
    await tv.page.goto(env.appUrl(`#/tv/${code}`));
    await tv.page.waitForSelector('.tv__board');
    await tv.page.waitForSelector('.tv-photo-hint'); // until the first photo: a nudge to take one
    await shot(tv.page, 'e2e-tv-photo-hint');
    await logDrink(bo, 'Øl', 1);

    // Anna takes a photo with the camera in the app.
    await anna.page.getByRole('button', { name: 'Tag et billede', exact: true }).click();
    await anna.page.waitForSelector('.camera__video.is-on', { timeout: 10000 });
    assert.deepEqual(await axeViolations(anna.page, axeSource), [], 'the camera is accessible');
    await shot(anna.page, 'e2e-camera');
    // Zoom: pinch the viewfinder, or tap the button for 2× (and back to 1×). This fake camera can't
    // zoom itself, so the photo is the middle of the picture.
    const zoom = () => anna.page.locator('.camera__zoom').textContent();
    assert.equal((await zoom()).trim(), '1×');
    await anna.page.evaluate(() => {
      const el = document.querySelector('.camera__finder');
      const fire = (type, id, x) => el.dispatchEvent(new PointerEvent(type, { pointerId: id, isPrimary: id === 1, clientX: x, clientY: 300, bubbles: true }));
      fire('pointerdown', 1, 100);
      fire('pointerdown', 2, 150);
      fire('pointermove', 2, 175); // fingers 50 → 75 px apart: 1.5×
      fire('pointerup', 1, 100);
      fire('pointerup', 2, 175);
    });
    await anna.page.waitForFunction(() => document.querySelector('.camera__zoom').textContent.trim() === '1,5×');
    await anna.page.locator('.camera__zoom').click();
    await anna.page.waitForFunction(() => document.querySelector('.camera__zoom').textContent.trim() === '2×');
    assert.equal(await anna.page.locator('.camera__video').evaluate((v) => v.style.getPropertyValue('--zoom')), '2');
    const [vw, vh] = await anna.page.locator('.camera__video').evaluate((v) => [v.videoWidth, v.videoHeight]);
    await anna.page.getByRole('button', { name: 'Tag billede', exact: true }).click();
    await anna.page.waitForSelector('.camera__review');
    await anna.page.fill('.camera__form input', 'Skål fra baren! 🍻');
    assert.deepEqual(await axeViolations(anna.page, axeSource), [], 'the review is accessible');
    await anna.page.getByRole('button', { name: 'Del med alle' }).click();
    await anna.page.waitForSelector('.camera__last:not(.is-empty)', { timeout: 10000 });
    await anna.page.getByRole('button', { name: 'Luk kameraet' }).click();
    const first = await derived(anna, (d) => ({ key: d.photos[0].key, asset: d.photos[0].asset, full: d.photos[0].full, cap: d.photos[0].cap, w: d.photos[0].w, h: d.photos[0].h }));
    assert.deepEqual([first.full, first.cap], [true, 'Skål fra baren! 🍻']);
    assert.deepEqual([first.w, first.h], [Math.round(vw / 2), Math.round(vh / 2)], 'zoomed 2×: the middle of the picture');

    // Everyone gets a heads-up; Bo opens the photo from it and the full size is fetched.
    await bo.page.locator('.toast', { hasText: 'Anna delte et billede' }).getByRole('button', { name: 'Se' }).click();
    await bo.page.waitForSelector('.viewer');
    await bo.page.waitForFunction(() => getComputedStyle(document.querySelector('.viewer__photo')).backgroundImage.includes('blob:'), null, { timeout: 10000 });
    assert.equal(await bo.page.locator('.viewer__cap').textContent(), 'Skål fra baren! 🍻');
    assert.equal(await bo.page.locator('.viewer__action').count(), 0, 'Bo can neither delete nor hide Anna’s photo');
    // No way to save it: no <img> with the photo, no context menu, no dragging.
    assert.equal(await bo.page.locator('img[src^="blob:"]').count(), 0);
    const blocked = await bo.page.evaluate(() => {
      const el = document.querySelector('.viewer__photo');
      const menu = new MouseEvent('contextmenu', { bubbles: true, cancelable: true });
      const drag = new Event('dragstart', { bubbles: true, cancelable: true });
      return [!el.dispatchEvent(menu), !el.dispatchEvent(drag), getComputedStyle(el).webkitTouchCallout || getComputedStyle(el).getPropertyValue('-webkit-touch-callout')];
    });
    assert.deepEqual(blocked.slice(0, 2), [true, true], 'context menu and dragging are blocked');
    assert.deepEqual(await axeViolations(bo.page, axeSource), [], 'the viewer is accessible');
    await shot(bo.page, 'e2e-viewer');
    // Focus moves into the viewer and Tab stays there.
    assert.equal(await bo.page.evaluate(() => document.activeElement?.getAttribute('aria-label')), 'Luk');
    for (let i = 0; i < 6; i++) await bo.page.keyboard.press('Tab');
    assert.ok(await bo.page.evaluate(() => !!document.activeElement?.closest('.viewer')), 'Tab stays inside the viewer');
    // Double-tap (double-click) zooms in and back out; + and 0 do the same.
    const stage = await bo.page.locator('.viewer__stage').boundingBox();
    await bo.page.mouse.dblclick(stage.x + stage.width / 2, stage.y + stage.height / 2);
    await bo.page.waitForSelector('.viewer__stage.is-zoomed');
    assert.match(await bo.page.locator('.viewer__photo').getAttribute('style'), /scale\(2\.5\)/);
    await bo.page.mouse.dblclick(stage.x + stage.width / 2, stage.y + stage.height / 2);
    await bo.page.waitForSelector('.viewer__stage:not(.is-zoomed)');
    await bo.page.keyboard.press('+');
    await bo.page.waitForSelector('.viewer__stage.is-zoomed');
    await bo.page.keyboard.press('0');
    await bo.page.waitForSelector('.viewer__stage:not(.is-zoomed)');
    await bo.page.locator('.viewer__like').click();
    // Comments: Bo writes one (the arrow keys move the cursor, not the photo) …
    await bo.page.getByRole('button', { name: 'Skriv en kommentar' }).click();
    await bo.page.waitForSelector('.viewer__comments');
    await bo.page.waitForFunction(() => document.activeElement?.getAttribute('aria-label') === 'Skriv en kommentar'); // the cursor is in the text field
    // … and sips handed to him meanwhile wait until he is done with the photo (no pop-up behind
    // the viewer taking the cursor away).
    const boPid0 = await pidOf(bo);
    await anna.page.evaluate((to) => window.__skaal.session.get().room.append({ t: 'give', to: { [to]: 2 } }), boPid0);
    await bo.page.waitForFunction(() => window.__skaal.derived().inbox.length === 1, null, { timeout: 8000 });
    await wait(600);
    assert.equal(await bo.page.locator('.drink-pop').count(), 0, 'no sip pop-up while the viewer is open');
    await bo.page.keyboard.type('Haha, fedt billede!');
    await bo.page.keyboard.press('ArrowLeft');
    await bo.page.keyboard.press('Enter');
    await bo.page.waitForFunction(() => document.querySelector('.viewer__clist')?.textContent.includes('Haha, fedt billede!'));
    assert.match(await bo.page.locator('.vcomment').first().textContent(), /Anna\s*Skål fra baren! 🍻/, 'the caption comes first');
    assert.equal(await bo.page.locator('.viewer__cform input').inputValue(), '');
    assert.deepEqual(await axeViolations(bo.page, axeSource), [], 'the comments are accessible');
    await shot(bo.page, 'e2e-comments');
    // … Anna, who took the photo, hears about it and answers from the heads-up.
    await anna.page.locator('.toast', { hasText: 'Bo: “Haha, fedt billede!”' }).getByRole('button', { name: 'Svar' }).click();
    await anna.page.waitForSelector('.viewer__comments');
    await anna.page.waitForFunction(() => document.activeElement?.getAttribute('aria-label') === 'Skriv en kommentar');
    await anna.page.keyboard.type('Tak! 🍻');
    await anna.page.getByRole('button', { name: 'Send kommentar' }).click();
    await bo.page.waitForFunction(() => document.querySelector('.viewer__clist')?.textContent.includes('Tak! 🍻'));
    await tv.page.waitForFunction(() => document.querySelector('.tv-photo__text small')?.textContent.includes('Anna Tak! 🍻'), null, { timeout: 8000 });
    // Escape closes the comments first, then the photo.
    await anna.page.keyboard.press('Escape');
    await anna.page.waitForSelector('.viewer__comments', { state: 'detached' });
    assert.equal(await anna.page.locator('.viewer').count(), 1);
    assert.match(await anna.page.locator('.viewer__bar').textContent(), /2\s*kommentarer/);
    await anna.page.keyboard.press('Escape');
    await anna.page.waitForSelector('.viewer', { state: 'detached' });
    await bo.page.getByRole('button', { name: 'Luk', exact: true }).click();
    await bo.page.waitForSelector('.viewer', { state: 'detached' });
    await bo.page.waitForSelector('.drink-pop', { timeout: 6000 }); // now the sips pop up
    await bo.page.getByRole('button', { name: 'Skål — drukket ✓' }).click();
    await bo.page.waitForSelector('.drink-pop', { state: 'detached' });

    // The feed has the photo between the drinks, and sharpens it once it has been seen.
    await tab(host, 'Feed');
    await host.page.waitForSelector('.feed-photo');
    assert.match(await host.page.locator('.feed-item', { has: host.page.locator('.feed-photo') }).textContent(), /Anna delte et billede: “Skål fra baren! 🍻”/);
    assert.deepEqual(await derived(host, (d) => d.feed.filter((f) => f.kind === 'photo' || f.kind === 'drink').map((f) => f.kind)), ['photo', 'drink']);
    const photoItem = host.page.locator('.feed-item', { has: host.page.locator('.feed-photo') });
    assert.equal(await photoItem.count(), 1);
    await host.page.waitForFunction(() => getComputedStyle(document.querySelector('.feed-photo .photo-frame')).backgroundImage.includes('blob:'), null, { timeout: 10000 });
    assert.match(await photoItem.locator('.react').first().textContent(), /❤️ 1/, 'Bo’s like shows in the feed too');
    assert.match(await host.page.locator('.feed-comments').textContent(), /Bo\s*Haha, fedt billede!.*Anna\s*Tak! 🍻/s, 'the comments show under the photo');
    assert.deepEqual(await axeViolations(host.page, axeSource), [], 'the feed with photos is accessible');
    await shot(host.page, 'e2e-feed-photo');
    // The host can hide anyone's comment; Anna deletes her own.
    await host.page.getByRole('button', { name: 'Kommentarer: 2' }).click();
    await host.page.waitForSelector('.viewer__comments');
    assert.notEqual(await host.page.evaluate(() => document.activeElement?.getAttribute('aria-label')), 'Skriv en kommentar', 'reading does not pop up the keyboard');
    await host.page.getByRole('button', { name: 'Skjul kommentaren fra Bo' }).click();
    await bo.page.waitForFunction(() => window.__skaal.derived().comments.values().next().value?.length === 1, null, { timeout: 8000 });
    assert.equal(await host.page.getByRole('button', { name: 'Slet din kommentar' }).count(), 0);
    await host.page.keyboard.press('Escape');
    await host.page.keyboard.press('Escape');
    await host.page.waitForSelector('.viewer', { state: 'detached' });
    await tab(anna, 'Feed');
    await anna.page.getByRole('button', { name: 'Kommentarer: 1' }).click();
    await anna.page.getByRole('button', { name: 'Slet din kommentar' }).click();
    await host.page.waitForSelector('.feed-comments', { state: 'detached', timeout: 8000 });
    await anna.page.keyboard.press('Escape');
    await anna.page.keyboard.press('Escape');
    await anna.page.waitForSelector('.viewer', { state: 'detached' });

    // The big screen shows it too, full size — with room to spare for the feed.
    await tv.page.waitForFunction(() => getComputedStyle(document.querySelector('.tv-photo__img') || document.body).backgroundImage.includes('blob:'), null, { timeout: 10000 });
    const tvBoxes = await tv.page.evaluate(() => ['.tv-photo', '.tv__feed', '.tv__invite .qr'].map((sel) => document.querySelector(sel).getBoundingClientRect()).map((r) => [Math.round(r.height), r.bottom <= innerHeight]));
    assert.ok(tvBoxes.every(([h, inside]) => h > 60 && inside), `photo, feed and QR all on screen: ${JSON.stringify(tvBoxes)}`);

    // Bo picks one from his camera roll; Anna sees the like on hers in the photo grid.
    await pickPhoto(bo, await photoOf(env.browser, '🎤', '#a18cd1,#fbc2eb'), 'Karaoke');
    await tab(anna, 'Feed');
    await anna.page.locator('.segmented__opt', { hasText: 'Fotos' }).click();
    await anna.page.waitForFunction(() => document.querySelectorAll('.photo-tile').length === 2, null, { timeout: 10000 });
    assert.match(await anna.page.locator('.photo-tile', { hasText: 'Anna' }).textContent(), /❤️ 1/);
    assert.deepEqual(await axeViolations(anna.page, axeSource), [], 'the photo grid is accessible');
    // Swipe (or use the arrow keys) from one photo to the next.
    await anna.page.locator('.photo-tile').first().click();
    const position = () => anna.page.locator('.viewer__who small').textContent();
    assert.match(await position(), /1 af 2/);
    const box = await anna.page.locator('.viewer__stage').boundingBox();
    await anna.page.mouse.move(box.x + box.width * 0.8, box.y + box.height / 2);
    await anna.page.mouse.down();
    await anna.page.mouse.move(box.x + box.width * 0.2, box.y + box.height / 2, { steps: 6 });
    await anna.page.mouse.up();
    await anna.page.waitForFunction(() => document.querySelector('.viewer__who small')?.textContent.includes('2 af 2'));
    await anna.page.keyboard.press('ArrowLeft');
    await anna.page.waitForFunction(() => document.querySelector('.viewer__who small')?.textContent.includes('1 af 2'));
    await anna.page.keyboard.press('Escape');
    await anna.page.waitForSelector('.viewer', { state: 'detached' });

    // The host hides Bo's photo for everyone; Anna deletes her own — gone everywhere, also the
    // full size on the brokers and the copy on the phone that took it.
    const bosPhoto = await derived(bo, (d) => d.photos.find((ph) => ph.pid === d.me).asset);
    assert.equal(await idbHas(bo, `full:${bosPhoto}`), true, 'Bo’s phone keeps an encrypted copy of his photo');
    await tab(host, 'Feed');
    await host.page.locator('.segmented__opt', { hasText: 'Fotos' }).click();
    await host.page.locator('.photo-tile', { hasText: 'Bo' }).click();
    await host.page.locator('.viewer__action', { hasText: 'Skjul' }).click();
    await host.page.locator('.viewer__confirm .btn--danger').click();
    await anna.page.waitForFunction(() => document.querySelectorAll('.photo-tile').length === 1, null, { timeout: 8000 });
    const boPid = await pidOf(bo);
    await anna.page.waitForFunction(
      ([pid, a]) => Promise.all([window.__skaal.session.get().room.fetchThumb(pid, a), window.__skaal.session.get().room.fetchFull(a)]).then(([t, f]) => !t && !f),
      [boPid, bosPhoto],
      { timeout: 8000 },
    );
    await bo.page.waitForFunction(async (k) => {
      const db = await new Promise((resolve) => (indexedDB.open('skaal-files', 1).onsuccess = (e) => resolve(e.target.result)));
      return new Promise((resolve) => (db.transaction('files').objectStore('files').get(k).onsuccess = (e) => resolve(e.target.result === undefined)));
    }, `full:${bosPhoto}`, { timeout: 8000 });
    await anna.page.locator('.photo-tile').click();
    await anna.page.locator('.viewer__action', { hasText: 'Slet' }).click();
    await anna.page.locator('.viewer__confirm .btn--danger').click();
    await anna.page.waitForSelector('.viewer', { state: 'detached' });
    for (const ph of all) await ph.page.waitForFunction(() => window.__skaal.derived().photos.length === 0, null, { timeout: 8000 });
    const annaPid = await pidOf(anna);
    await bo.page.waitForFunction(
      ([pid, a]) => Promise.all([window.__skaal.session.get().room.fetchThumb(pid, a), window.__skaal.session.get().room.fetchFull(a)]).then(([t, f]) => !t && !f),
      [annaPid, first.asset],
      { timeout: 8000 },
    );

    // A late joiner sees photos (thumbnails at once, the full size on demand).
    await takePhoto(anna, 'Sidste runde');
    const late = await joinEvent(env, code, 'Late');
    await tab(late, 'Feed');
    await late.page.waitForFunction(() => getComputedStyle(document.querySelector('.feed-photo .photo-frame') || document.body).backgroundImage.includes('blob:'), null, { timeout: 10000 });

    // Without access to the camera, the phone's own camera or the camera roll still works.
    const denied = await env.phone('denied');
    await denied.context.addInitScript(() => {
      navigator.mediaDevices.getUserMedia = () => Promise.reject(new DOMException('no', 'NotAllowedError'));
    });
    await denied.page.goto(env.appUrl(`#/e/${code}`));
    await denied.page.waitForSelector('.event-preview', { timeout: 15000 });
    await denied.page.fill('input[name=name]', 'Dennis');
    await denied.page.getByRole('button', { name: /Deltag i festen/ }).click();
    await denied.page.waitForSelector('.drink-grid');
    await denied.page.getByRole('button', { name: 'Tag et billede', exact: true }).click();
    await denied.page.waitForSelector('.camera__fallback');
    assert.match(await denied.page.locator('.camera__fallback h2').textContent(), /ikke adgang til kameraet/);
    assert.deepEqual(await axeViolations(denied.page, axeSource), [], 'the camera fallback is accessible');
    await denied.page.getByRole('button', { name: 'Luk kameraet' }).click();
    await pickPhoto(denied, await photoOf(env.browser, '🎉', '#f6d365,#fda085'), 'Fra kamerarullen');
    await host.page.waitForFunction(() => window.__skaal.derived().photos.length === 2, null, { timeout: 8000 });

    // Without a connection a photo says it is waiting, and goes out by itself afterwards.
    const port = env.broker.port;
    env.broker.dropClients();
    await env.broker.close();
    await anna.page.waitForSelector('.sync-dot.is-offline, .sync-dot.is-connecting', { timeout: 10000 });
    await takePhoto(anna, 'Uden net');
    await tab(anna, 'Feed');
    await anna.page.locator('.segmented__opt', { hasText: 'Fotos' }).click();
    await anna.page.waitForSelector('.photo-tile .photo-pending');
    env.broker = await startBroker({ port });
    await anna.page.waitForSelector('.photo-pending', { state: 'detached', timeout: 30000 });
    await bo.page.waitForFunction(() => window.__skaal.derived().photos.some((ph) => ph.cap === 'Uden net'), null, { timeout: 30000 });
    const offline = await derived(bo, (d) => d.photos.find((ph) => ph.cap === 'Uden net').asset);
    await bo.page.waitForFunction((a) => window.__skaal.session.get().room.fetchFull(a).then((b) => !!b), offline, { timeout: 15000 });

    // When the host ends the event, the most liked photo is the photo of the night.
    await tab(bo, 'Feed');
    await bo.page.locator('.segmented__opt', { hasText: 'Fotos' }).click();
    await bo.page.locator('.photo-tile', { hasText: 'Dennis' }).click();
    await bo.page.locator('.viewer__like').click();
    await bo.page.keyboard.press('Escape');
    await tab(host, 'Mig');
    await host.page.getByRole('button', { name: /Afslut eventet/ }).click();
    await host.page.locator('.sheet.is-open .btn-row').getByRole('button', { name: 'Afslut event', exact: true }).click();
    await host.page.waitForSelector('.potn', { timeout: 8000 });
    await host.page.locator('.potn__actions').scrollIntoViewIfNeeded();
    await shot(host.page, 'e2e-photo-of-the-night');
    assert.match(await host.page.locator('.potn').textContent(), /Dennis.*❤️ 1/s);
    await host.page.locator('.potn').click();
    await host.page.waitForSelector('.viewer');
    assert.equal(await host.page.locator('.viewer__cap').textContent(), 'Fra kamerarullen');
    await host.page.keyboard.press('Escape');
    // The evening as a slideshow: every photo in the order they were taken, one after the other.
    const caption = () => host.page.locator('.viewer__cap').textContent();
    await host.page.getByRole('button', { name: 'Afspil aftenen' }).click();
    await host.page.waitForSelector('.viewer.is-show .viewer__progress');
    assert.equal(await caption(), 'Sidste runde', 'the slideshow starts with the first photo of the evening');
    assert.match(await host.page.locator('.viewer__who small').textContent(), /^kl\. \d\d:\d\d$/);
    assert.deepEqual(await axeViolations(host.page, axeSource), [], 'the slideshow is accessible');
    await shot(host.page, 'e2e-slideshow');
    // Holding a finger on the photo pauses it.
    const show = await host.page.locator('.viewer__stage').boundingBox();
    await host.page.mouse.move(show.x + show.width / 2, show.y + show.height / 2);
    await host.page.mouse.down();
    await host.page.waitForSelector('.viewer__progress i.is-paused');
    await host.page.mouse.up();
    await host.page.waitForSelector('.viewer__progress i:not(.is-paused)');
    await host.page.waitForFunction(() => document.querySelector('.viewer__cap')?.textContent === 'Fra kamerarullen', null, { timeout: 12000 });
    await host.page.keyboard.press('ArrowLeft'); // skip ahead to the newest
    await host.page.waitForFunction(() => document.querySelector('.viewer__cap')?.textContent === 'Uden net');
    await host.page.locator('.toast', { hasText: 'Det var alle billederne' }).waitFor({ timeout: 12000 });
    await host.page.waitForSelector('.viewer:not(.is-show)');
    assert.equal(await caption(), 'Uden net', 'the last photo stays on screen');
    await host.page.keyboard.press('Escape');
    await host.page.getByRole('button', { name: /Genåbn eventet/ }).click();
    await host.page.waitForSelector('.tabbar');

    // The host can turn photos off (and on again) …
    await tab(host, 'Mig');
    await host.page.locator('.switch-row', { hasText: 'Fotos i eventet' }).click();
    await bo.page.waitForFunction(() => !document.querySelector('[aria-label="Tag et billede"]'), null, { timeout: 8000 });
    await tab(bo, 'Feed');
    assert.match(await bo.page.locator('.photo-locked').textContent(), /Værten har slået fotos fra/);
    assert.equal(await derived(bo, (d) => d.photos.length), 3, 'the photos already taken stay');
    await host.page.locator('.switch-row', { hasText: 'Fotos i eventet' }).click();
    await bo.page.waitForSelector('[aria-label="Tag et billede"]', { timeout: 8000 });
    // … and delete every photo of the event, e.g. the morning after.
    await host.page.getByRole('button', { name: /Slet alle billeder/ }).click();
    await host.page.locator('.sheet.is-open .btn-row').getByRole('button', { name: 'Slet alle', exact: true }).click();
    for (const ph of [...all, late, denied]) await ph.page.waitForFunction(() => window.__skaal.derived().photos.length === 0, null, { timeout: 8000 });
    await bo.page.waitForFunction((a) => window.__skaal.session.get().room.fetchFull(a).then((b) => !b), offline, { timeout: 8000 });

    // Several photos from the camera roll at once: reviewed together, one taken out again, shared
    // one by one — the caption goes with the first.
    await bo.page.getByRole('button', { name: 'Tag et billede', exact: true }).click();
    await bo.page.waitForSelector('.camera__live, .camera__fallback', { timeout: 10000 });
    const roll = [];
    for (const [emoji, colors] of [['🍕', '#f6d365,#fda085'], ['🎸', '#84fab0,#8fd3f4'], ['🌙', '#a18cd1,#fbc2eb']]) roll.push(await photoOf(env.browser, emoji, colors));
    await bo.page.setInputFiles('.camera input[aria-label="Vælg fra kamerarullen"]', roll.map((buffer, i) => ({ name: `roll${i}.jpg`, mimeType: 'image/jpeg', buffer })));
    await bo.page.waitForSelector('.camera__batch', { timeout: 15000 });
    assert.equal(await bo.page.locator('.camera__batch-item').count(), 3);
    assert.deepEqual(await axeViolations(bo.page, axeSource), [], 'picking several photos is accessible');
    await shot(bo.page, 'e2e-camera-batch');
    await bo.page.getByRole('button', { name: 'Fjern billede 2' }).click();
    await bo.page.fill('.camera__form input', 'Natten over byen');
    await bo.page.getByRole('button', { name: 'Del 2 billeder' }).click();
    await bo.page.waitForSelector('.camera__batch', { state: 'detached', timeout: 15000 });
    await bo.page.getByRole('button', { name: 'Luk kameraet' }).click();
    await host.page.waitForFunction(() => window.__skaal.derived().photos.length === 2, null, { timeout: 10000 });
    assert.deepEqual(await derived(host, (d) => d.photos.map((ph) => ph.cap).reverse()), ['Natten over byen', ''], 'the caption is on the first');
    // In the feed they are one item, with a little grid.
    await tab(host, 'Feed');
    await host.page.locator('.segmented__opt', { hasText: 'Alt' }).click();
    await host.page.waitForSelector('.feed-set', { timeout: 8000 });
    assert.match(await host.page.locator('.feed-item', { has: host.page.locator('.feed-set') }).textContent(), /Bo delte 2 billeder: “Natten over byen”/);
    assert.equal(await host.page.locator('.feed-set .feed-photo').count(), 2);
    assert.deepEqual(await axeViolations(host.page, axeSource), [], 'a set of photos in the feed is accessible');
    await shot(host.page, 'e2e-feed-set');

    // Old events with 8-character codes are too weakly protected for photos: no camera there.
    const old = await env.phone('old');
    await old.page.goto(env.appUrl('#/e/K7F2QXRM'));
    await old.page.waitForFunction(() => window.__skaal.session.get().room, null, { timeout: 15000 });
    await old.page.evaluate(() => {
      const room = window.__skaal.session.get().room;
      room.setMeta({ name: 'Gammel fest', hostId: room.pid, createdAt: Date.now(), startedAt: Date.now(), ended: 0, removed: [], settings: {} });
    });
    await old.page.waitForSelector('.event-preview', { timeout: 15000 });
    await old.page.fill('input[name=name]', 'Olga');
    await old.page.getByRole('button', { name: /Gem og invitér/ }).click();
    await old.page.waitForSelector('.qr svg');
    await old.page.locator('.sheet__close').first().click();
    assert.equal(await old.page.getByRole('button', { name: 'Tag et billede', exact: true }).count(), 0);
    await tab(old, 'Feed');
    await old.page.waitForSelector('.photo-locked');
    // (Connection errors while the broker was down are expected.)
    const ignore = (ph) => ({ ...ph, errors: ph.errors.filter((e) => !e.includes('WebSocket connection')) });
    assertNoErrors([...all, tv, late, denied, old].map(ignore));
  },

  async 'disposable camera: blind shots, 23 each, developed for everyone a day later — party and pub golf'(env) {
    const axeSource = readFileSync(new URL('../../node_modules/axe-core/axe.min.js', import.meta.url), 'utf8');
    const DAY = 24 * 3600_000;
    const { ph: host, code } = await createEvent(env, { disposable: true, breakers: false });
    const anna = await joinEvent(env, code, 'Anna');
    const bo = await joinEvent(env, code, 'Bo');
    const all = [host, anna, bo];
    assert.equal(await derived(anna, (d) => d.settings.disposable), true, 'turned on when the event was made');
    const tv = await env.phone('tv', { width: 1280, height: 720, scale: 1 });
    await tv.page.goto(env.appUrl(`#/tv/${code}`));
    await tv.page.waitForSelector('.tv-photo-hint');
    assert.match(await tv.page.locator('.tv-photo-hint').textContent(), /engangskameraet/);

    // Anna opens the disposable camera: the camera runs, but its picture is covered up — and there
    // is no camera roll, zoom or last photo to look at.
    await tab(anna, 'Feed');
    assert.match(await anna.page.locator('.camera-card').textContent(), /Engangskamera.*23 billeder tilbage/);
    await anna.page.getByRole('button', { name: 'Tag et billede', exact: true }).click();
    await anna.page.waitForFunction(() => document.querySelector('.dispo__shutter')?.disabled === false, null, { timeout: 10000 });
    const view = await anna.page.evaluate(() => {
      const v = document.querySelector('.dispo .camera__video');
      const r = v.getBoundingClientRect();
      const spots = [0.2, 0.5, 0.8].flatMap((x) => [0.15, 0.5, 0.85].map((y) => document.elementFromPoint(r.left + r.width * x, r.top + r.height * y)));
      return { playing: v.videoWidth > 0 && !v.paused, covered: spots.every((el) => el && el !== v && !!el.closest('.dispo')) };
    });
    assert.deepEqual(view, { playing: true, covered: true }, 'the picture is there to take photos with, but nobody sees it');
    assert.equal(await anna.page.locator('.dispo input[type=file], .camera__zoom, .camera__last, .camera__finder').count(), 0);
    assert.equal(await anna.page.locator('.dispo__digits').textContent(), '23');
    assert.deepEqual(await axeViolations(anna.page, axeSource), [], 'the disposable camera is accessible');
    await shot(anna.page, 'e2e-disposable-camera');
    await anna.page.locator('.dispo__shutter').click();
    await anna.page.waitForFunction(() => document.querySelector('.dispo__digits')?.textContent === '22', null, { timeout: 10000 });
    assert.match(await anna.page.locator('.dispo__window').textContent(), /Klik!.*Fremkaldes i morgen kl\. \d\d:\d\d/);
    assert.equal(await anna.page.locator('.camera__review').count(), 0, 'no second look');
    assert.equal(await anna.page.locator('.dispo__film i.is-used').count(), 1);
    await shot(anna.page, 'e2e-disposable-click');
    await anna.page.getByRole('button', { name: 'Luk kameraet' }).click();

    // Nobody sees it yet — Anna neither — but everyone can see that a photo is developing.
    for (const ph of all) {
      await ph.page.waitForFunction(() => window.__skaal.derived().undeveloped.length === 1, null, { timeout: 8000 });
      assert.equal(await derived(ph, (d) => d.photos.length), 0);
    }
    await tab(bo, 'Feed');
    await bo.page.waitForSelector('.develop-card');
    assert.match(await bo.page.locator('.develop-card').textContent(), /Et billede til fremkaldelse.*klar i morgen kl\./);
    assert.equal(await bo.page.locator('.feed-photo').count(), 0);
    assert.match(await anna.page.locator('.develop-card').textContent(), /det er dit/);
    await tv.page.waitForFunction(() => /til fremkaldelse/.test(document.querySelector('.tv-photo-hint')?.textContent || ''), null, { timeout: 8000 });
    assert.deepEqual(await axeViolations(bo.page, axeSource), [], 'the feed with a photo developing is accessible');
    await shot(bo.page, 'e2e-disposable-developing');

    // 23 shots each: Bo uses up his film.
    await shootDisposable(bo, 23);
    await bo.page.getByRole('button', { name: 'Tag et billede', exact: true }).click();
    await bo.page.waitForSelector('.dispo__counter.is-empty', { timeout: 10000 });
    assert.equal(await bo.page.locator('.dispo__shutter').isDisabled(), true);
    assert.match(await bo.page.locator('.dispo__window').textContent(), /Filmen er brugt op/);
    await shot(bo.page, 'e2e-disposable-empty');
    await bo.page.getByRole('button', { name: 'Luk kameraet' }).click();
    assert.match(await bo.page.locator('.camera-card').textContent(), /Filmen er brugt op/);
    await host.page.waitForFunction(() => window.__skaal.derived().undeveloped.length === 24, null, { timeout: 15000 });

    // A day later they develop — for everyone at once, Anna's own included.
    await tab(bo, 'Drik');
    await fastForward([...all, tv], DAY + 5000);
    for (const ph of all) await ph.page.waitForFunction(() => window.__skaal.derived().photos.length === 24, null, { timeout: 8000 });
    await bo.page.waitForSelector('.toast:has-text("af dine billeder er fremkaldt")', { timeout: 8000 });
    assert.equal(await bo.page.locator('.tab', { hasText: 'Feed' }).locator('.tab__badge').textContent(), '3', 'his own photos are news to him too');
    await anna.page.waitForSelector('.toast:has-text("fra Bo er fremkaldt")', { timeout: 8000 });
    assert.equal(await anna.page.locator('.develop-card').count(), 0);
    assert.match(await anna.page.locator('.feed-item').first().textContent(), /Bo fik fremkaldt 11 billeder fra engangskameraet \(taget i går kl\. \d\d:\d\d\)/);
    await anna.page.locator('.feed-item', { hasText: 'Du fik fremkaldt et billede' }).locator('.feed-photo').click();
    await anna.page.waitForSelector('.viewer');
    assert.match(await anna.page.locator('.viewer__who small').textContent(), /🎞️ taget i går kl\./);
    await anna.page.waitForFunction(() => /blob:/.test(document.querySelector('.viewer__photo')?.style.backgroundImage || ''), null, { timeout: 10000 });
    await shot(anna.page, 'e2e-disposable-developed');
    // A minigame that starts while she looks at a photo can't be seen under it: a heads-up on top
    // takes her to it.
    await tab(host, 'Spil');
    await startGame(host, 'Happy Hour');
    const headsUp = anna.page.locator('.toast', { hasText: 'Happy Hour starter nu!' });
    await headsUp.waitFor({ timeout: 8000 });
    await headsUp.getByRole('button', { name: 'Spil med' }).click();
    await anna.page.waitForSelector('.viewer', { state: 'detached' });
    await anna.page.waitForSelector('.overlay[aria-label="Happy Hour"]');
    await fastForward([...all, tv], 60_000);
    for (const ph of all) await ph.page.waitForSelector('.overlay[aria-label="Happy Hour"]', { state: 'detached', timeout: 8000 });
    await tv.page.waitForSelector('.tv-photo', { timeout: 8000 });

    // The host turns the disposable camera off: photos are shared at once again.
    await tab(host, 'Mig');
    await host.page.locator('.switch-row', { hasText: 'Engangskamera' }).click();
    await anna.page.waitForFunction(() => !window.__skaal.derived().settings.disposable, null, { timeout: 8000 });
    await takePhoto(anna, 'Morgenkaffe');
    for (const ph of all) await ph.page.waitForFunction(() => window.__skaal.derived().photos.length === 25, null, { timeout: 8000 });

    // Pub golf: the players shoot the photo competition blind, and the judge decides it once the
    // photos have developed — after the round has ended.
    const { ph: ida, code: golf } = await createPubGolf(env, { host: 'Ida', team: 'Hold Blå', disposable: true });
    const kim = await joinPubGolf(env, golf, 'Kim', { team: 'Hold Rød' });
    assert.equal(await derived(kim, (d) => d.settings.disposable), true);
    await tab(ida, 'Konkurrencer');
    await ida.page.locator('.pg-comp', { hasText: 'Fotokonkurrence' }).getByRole('button', { name: 'Start', exact: true }).click();
    await ida.page.locator('.sheet.is-open .btn-row').getByRole('button', { name: 'Start', exact: true }).click();
    await kim.page.waitForSelector('.pg-moment', { timeout: 6000 });
    assert.match(await kim.page.locator('.pg-moment__sub').textContent(), /engangskameraet/);
    await kim.page.locator('.pg-moment').getByRole('button', { name: 'Tag et billede' }).click();
    await kim.page.waitForSelector('.dispo');
    // The judge starts the next competition while Kim is in the camera: a heads-up on top, and the
    // pop-up waits for him (longer than a pop-up usually stays).
    await ida.page.locator('.pg-comp', { hasText: 'Bedste outfit' }).getByRole('button', { name: 'Start', exact: true }).click();
    await ida.page.locator('.sheet.is-open .btn-row').getByRole('button', { name: 'Start', exact: true }).click();
    await kim.page.locator('.toast', { hasText: 'Bedste outfit starter!' }).waitFor({ timeout: 8000 });
    assert.equal(await kim.page.locator('.pg-moment').count(), 0, 'not hidden under the camera');
    await fastForward([ida, kim], 2 * 60_000);
    await shootDisposable(kim, 1, { open: false });
    await kim.page.waitForSelector('.pg-moment', { timeout: 6000 });
    assert.equal(await kim.page.locator('.pg-moment__text').textContent(), 'Bedste outfit');
    await kim.page.locator('.pg-moment .pg-moment__actions .btn').last().click();
    await kim.page.waitForSelector('.pg-moment', { state: 'detached' });
    await tab(kim, 'Fotos');
    await kim.page.waitForSelector('.develop-card');
    assert.equal(await kim.page.locator('.photo-tile').count(), 0);
    await tab(kim, 'Konkurrencer');
    assert.match(await kim.page.locator('.pg-comp', { hasText: 'Fotokonkurrence' }).textContent(), /fremkaldes 24 timer efter/);
    await tab(ida, 'Mig');
    await ida.page.getByRole('button', { name: /Afslut runden/ }).click();
    await ida.page.locator('.sheet.is-open .btn-row').getByRole('button', { name: 'Afslut', exact: true }).click();
    await kim.page.waitForFunction(() => window.__skaal.derived().ended > 0, null, { timeout: 6000 });
    await fastForward([ida, kim], DAY + 5000);
    await ida.page.waitForFunction(() => window.__skaal.derived().photos.length === 1, null, { timeout: 8000 });
    await tab(ida, 'Fotos');
    await ida.page.locator('.photo-tile').first().click();
    await ida.page.locator('.viewer__places').getByRole('button', { name: /🥇 1\.-plads/ }).click();
    await kim.page.waitForFunction(() => window.__skaal.derived().pg.results.get('photo')?.places[0]?.pid === window.__skaal.derived().me, null, { timeout: 8000 });
    assert.deepEqual(await derived(kim, (d) => d.pg.teams.map((tm) => [tm.name, tm.bon])), [['Hold Rød', 3], ['Hold Blå', 0]], 'the photo podium counts after the end');
    assertNoErrors([...all, tv, ida, kim]);
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
    // Creating a party or a pub golf round fits a small phone too.
    await se.page.goto(env.appUrl('#/ny'));
    await se.page.waitForSelector('.drink-toggle');
    const sideways = () => se.page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    assert.equal(await sideways(), 0, 'create a party: no horizontal scrolling at 320px');
    await se.page.getByRole('radio', { name: /Pub golf/ }).click();
    await se.page.waitForSelector('.pg-edit__item');
    assert.equal(await sideways(), 0, 'create pub golf: no horizontal scrolling at 320px');
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
