// Regenerates the README screenshots in docs/screenshots/ (npm run screenshots).
import { fileURLToPath } from 'node:url';
import { setup } from './lib.mjs';
import { photoOf, createEvent, joinEvent, logDrink, fastForward, tab, dismissPopups, startGame, derived, rigSpin } from './helpers.mjs';

const OUT = fileURLToPath(new URL('../../docs/screenshots/', import.meta.url));
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const save = (page, name) => page.screenshot({ path: `${OUT}${name}.jpg`, type: 'jpeg', quality: 82 });

const env = await setup();
try {
  const host0 = await env.phone('Mads');
  await host0.page.goto(env.appUrl('#/'));
  await host0.page.waitForSelector('.landing__logo');
  await wait(900);
  await save(host0.page, '1-start');
  await host0.context.close();

  const { ph: host, code } = await createEvent(env, { photo: await photoOf(env.browser, '😎', '#ff9a8b,#ff6a88') });
  const anna = await joinEvent(env, code, 'Anna', await photoOf(env.browser, '🦊', '#a1c4fd,#c2e9fb'));
  const bo = await joinEvent(env, code, 'Bo', await photoOf(env.browser, '🐻', '#fbc2eb,#a6c1ee'));
  const sara = await joinEvent(env, code, 'Sara', await photoOf(env.browser, '🐼', '#d4fc79,#96e6a1'));
  const all = [host, anna, bo, sara];
  await logDrink(anna, 'Øl', 3);
  await logDrink(bo, 'Shot', 2);
  await logDrink(sara, 'Drink', 1);
  await logDrink(host, 'Jägerbomb', 1);
  await dismissPopups(all);
  await logDrink(host, 'Øl', 2); // 2 + 1 + 1 points → overtakes Anna and opens the king wheel
  await host.page.waitForSelector('.wheel-wrap');
  await host.page.getByRole('button', { name: /SPIN HJULET/ }).click();
  await wait(1800);
  await save(host.page, '3-lykkehjul');
  await host.page.waitForSelector('.outcome', { timeout: 10000 });
  if (await host.page.locator('.handout').count()) await host.page.getByRole('button', { name: /Tilfældigt/ }).click();
  else if (await host.page.locator('.overlay .mg-pick').count()) await host.page.locator('.overlay .mg-pick').first().click();
  else if (await host.page.locator('.rule-suggestion').count()) await host.page.locator('.rule-suggestion').first().click();
  await host.page.locator('.overlay .btn--lg').last().click();
  await wait(800);
  await dismissPopups(all);
  await wait(400);
  await dismissPopups(all);
  await anna.page.evaluate(() => window.scrollTo(0, 0));
  await wait(6500); // let toasts fade
  await save(anna.page, '2-drik');
  await tab(sara, 'Stilling');
  await wait(1200);
  await save(sara.page, '4-stilling');

  await fastForward(all, 60_000);
  await tab(host, 'Spil');
  await startGame(host, 'Quiz');
  await fastForward(all, 3_000);
  await bo.page.waitForSelector('.mg-option');
  const correct = await derived(bo, (d) => d.activeGame.p.order.indexOf(0));
  await anna.page.locator('.mg-option').nth(correct).click();
  await wait(700);
  await save(bo.page, '5-quiz');
  await bo.page.locator('.mg-option').nth((correct + 1) % 4).click();
  await sara.page.locator('.mg-option').nth(correct).click();
  await host.page.locator('.mg-option').nth(correct).click();
  await fastForward(all, 21_000);
  await wait(1800);
  await save(bo.page, '6-resultat');
  await fastForward(all, 14_000);
  await wait(1200);
  await dismissPopups(all);
  await tab(anna, 'Feed');
  await wait(800);
  await save(anna.page, '7-feed');

  const tv = await env.phone('tv', { width: 1280, height: 720, scale: 1.5 });
  await tv.page.goto(env.appUrl(`#/tv/${code}`));
  await tv.page.waitForSelector('.tv__board .board-row');
  await wait(1200);
  await save(tv.page, '8-storskaerm');
  await tv.context.close();

  // Handing out sips by tapping, the pop-up it causes, and a fællesskål.
  for (const ph of all) await tab(ph, 'Drik');
  await dismissPopups(all);
  await rigSpin(host, 'king', 'give4');
  const pick = (name) => host.page.locator('.handout__cell', { hasText: name }).locator('.mg-pick');
  await pick('Anna').click();
  await pick('Bo').click();
  await wait(600);
  await save(host.page, '11-del-ud');
  await host.page.getByRole('button', { name: /Send 4 slurke afsted/ }).click();
  await anna.page.waitForSelector('.drink-pop');
  await wait(1000);
  await save(anna.page, '12-pop-up');
  for (const ph of [anna, bo]) await ph.page.getByRole('button', { name: 'Skål — drukket ✓' }).click();
  await wait(600);
  await rigSpin(sara, 'lucky', 'all1');
  await sara.page.getByRole('button', { name: /Fedt/ }).click();
  await anna.page.waitForSelector('.gtoast');
  for (const ph of [host, bo]) await ph.page.getByRole('button', { name: 'Skål — drukket ✓' }).click();
  await wait(2500); // let the confetti settle
  await save(anna.page, '13-faellesskaal');
  await anna.page.getByRole('button', { name: 'Skål — drukket ✓' }).click();
  await sara.page.getByRole('button', { name: /Skål! 🥂/ }).click();
  await dismissPopups(all);

  // Tour de France: the host switches the mode on; Sara rides to 20 drinks and logs the 21st.
  await tab(host, 'Mig');
  await host.page.getByText('Event-indstillinger').click();
  await host.page.locator('.switch-row', { hasText: 'Tour de France-tilstand' }).click();
  await host.page.getByRole('button', { name: 'Gem ændringer' }).click();
  await tab(host, 'Drik');
  await sara.page.evaluate(() => window.__skaal.session.get().room.appendMany(Array.from({ length: 19 }, () => ({ t: 'd', k: 'beer' }))));
  await tab(sara, 'Drik');
  await wait(1500);
  await save(sara.page, '9-tour-troeje');
  await sara.page.locator('.drink-tile', { hasText: 'Øl' }).first().click();
  await sara.page.waitForSelector('.tour.is-revealed', { timeout: 10000 });
  await wait(2600); // let the confetti settle
  await save(sara.page, '10-tour-ansigt');
  console.log('screenshots written to docs/screenshots/');
} finally {
  await env.teardown();
}
