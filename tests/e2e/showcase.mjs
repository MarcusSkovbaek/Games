// Regenerates the README screenshots in docs/screenshots/ (npm run screenshots).
import { fileURLToPath } from 'node:url';
import { writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { chromium } from 'playwright';
import { setup } from './lib.mjs';
import { photoOf, createEvent, joinEvent, logDrink, fastForward, tab, dismissPopups, startGame, derived, rigSpin, createPubGolf, joinPubGolf, pickPhoto } from './helpers.mjs';

const OUT = fileURLToPath(new URL('../../docs/screenshots/', import.meta.url));
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const save = (page, name) => page.screenshot({ path: `${OUT}${name}.jpg`, type: 'jpeg', quality: 82 });

// What the fake camera films: a party scene instead of Chromium's green test pattern. Written as a
// one-frame .y4m video (YUV 4:2:0), which Chromium loops.
async function partyScene() {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 720, height: 1280 } });
  await page.setContent(
    `<body style="margin:0"><div style="position:relative;width:720px;height:1280px;overflow:hidden;background:radial-gradient(circle at 30% 18%,#ffd36b,#ff6a88 42%,#3b1f6e 78%)">
      <div style="position:absolute;left:90px;top:300px;font-size:300px">🥳</div>
      <div style="position:absolute;left:360px;top:640px;font-size:240px;transform:rotate(12deg)">🍻</div>
      <div style="position:absolute;left:40px;top:860px;font-size:150px;transform:rotate(-14deg)">🎉</div>
      <div style="position:absolute;left:470px;top:150px;font-size:120px">✨</div>
    </div></body>`,
  );
  const png = await page.screenshot({ type: 'png' });
  const yuv = await page.evaluate(async (b64) => {
    const img = await createImageBitmap(await (await fetch(`data:image/png;base64,${b64}`)).blob());
    const c = new OffscreenCanvas(img.width, img.height);
    const ctx = c.getContext('2d');
    ctx.drawImage(img, 0, 0);
    const { data, width: w, height: h } = ctx.getImageData(0, 0, img.width, img.height);
    const out = new Uint8Array(w * h * 1.5);
    for (let i = 0; i < w * h; i++) out[i] = 0.299 * data[i * 4] + 0.587 * data[i * 4 + 1] + 0.114 * data[i * 4 + 2];
    const cw = w / 2;
    for (let y = 0; y < h / 2; y++) {
      for (let x = 0; x < cw; x++) {
        let r = 0, g = 0, b = 0;
        for (const [dx, dy] of [[0, 0], [1, 0], [0, 1], [1, 1]]) {
          const p = ((y * 2 + dy) * w + x * 2 + dx) * 4;
          r += data[p] / 4;
          g += data[p + 1] / 4;
          b += data[p + 2] / 4;
        }
        out[w * h + y * cw + x] = -0.168736 * r - 0.331264 * g + 0.5 * b + 128;
        out[w * h * 1.25 + y * cw + x] = 0.5 * r - 0.418688 * g - 0.081312 * b + 128;
      }
    }
    let s = '';
    for (let i = 0; i < out.length; i += 0x8000) s += String.fromCharCode(...out.subarray(i, i + 0x8000));
    return btoa(s);
  }, png.toString('base64'));
  await browser.close();
  const file = join(tmpdir(), 'skaal-party.y4m');
  writeFileSync(file, Buffer.concat([Buffer.from('YUV4MPEG2 W720 H1280 F30:1 Ip A1:1 C420jpeg\nFRAME\n'), Buffer.from(yuv, 'base64')]));
  return file;
}

const env = await setup({ fakeVideo: await partyScene() });
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

  // Photos from the evening: Anna takes one with the camera, Bo and Sara share from their roll.
  await tab(anna, 'Drik');
  await anna.page.getByRole('button', { name: 'Tag et billede', exact: true }).click();
  await anna.page.waitForSelector('.camera__video.is-on', { timeout: 10000 });
  await wait(1200);
  await save(anna.page, '20-kamera');
  await anna.page.getByRole('button', { name: 'Tag billede', exact: true }).click();
  await anna.page.waitForSelector('.camera__review');
  await anna.page.fill('.camera__form input', 'Skål for værten! 🥂');
  await anna.page.getByRole('button', { name: 'Del med alle' }).click();
  await anna.page.waitForSelector('.camera__last:not(.is-empty)');
  await anna.page.getByRole('button', { name: 'Luk kameraet' }).click();
  await logDrink(bo, 'Shot', 1);
  await pickPhoto(bo, await photoOf(env.browser, '🎤', '#a18cd1,#fbc2eb'), 'Karaoke-tid 🎶');
  await logDrink(sara, 'Øl', 1);
  await pickPhoto(sara, await photoOf(env.browser, '🕺', '#84fab0,#8fd3f4'), 'Dansegulvet er åbent');
  await dismissPopups(all);
  for (const ph of [bo, sara]) {
    await ph.page.locator('.toast', { hasText: 'delte et billede' }).first().getByRole('button', { name: 'Se' }).click().catch(() => {});
    await ph.page.getByRole('button', { name: 'Luk', exact: true }).click().catch(() => {});
  }
  await tab(host, 'Feed');
  await host.page.waitForFunction(() => document.querySelectorAll('.feed-photo').length >= 3, null, { timeout: 10000 });
  await wait(5500); // let the photos sharpen and the toasts fade
  await save(host.page, '21-feed-fotos');
  await host.page.locator('.segmented__opt', { hasText: 'Fotos' }).click();
  await wait(600);
  await save(host.page, '22-fotos');
  await host.page.locator('.photo-tile', { hasText: 'Bo' }).click();
  await host.page.locator('.viewer__like').click();
  await host.page.waitForFunction(() => getComputedStyle(document.querySelector('.viewer__photo')).backgroundImage.includes('blob:'), null, { timeout: 10000 });
  await wait(600);
  await save(host.page, '23-billede');
  await host.page.getByRole('button', { name: 'Luk', exact: true }).click();
  await host.page.locator('.segmented__opt', { hasText: 'Alt' }).click();

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
  for (const ph of all) await ph.context.close();

  // Pub golf: two teams, the host judges. Holes 1 and 2 are played; the group is at hole 3.
  const golf = await createPubGolf(env, { bars: ["Heidi's Bier Bar", 'Mikkeller', 'Kihoskh'], team: 'Hold Blå', photo: await photoOf(env.browser, '😎', '#ff9a8b,#ff6a88') });
  const judge = golf.ph;
  const gAnna = await joinPubGolf(env, golf.code, 'Anna', { team: 'Hold Rød', photo: await photoOf(env.browser, '🦊', '#a1c4fd,#c2e9fb') });
  const gBo = await joinPubGolf(env, golf.code, 'Bo', { team: 'Hold Blå', photo: await photoOf(env.browser, '🐻', '#fbc2eb,#a6c1ee') });
  const gSara = await joinPubGolf(env, golf.code, 'Sara', { team: 'Hold Rød', photo: await photoOf(env.browser, '🐼', '#d4fc79,#96e6a1') });
  const golfers = [judge, gAnna, gBo, gSara];
  const play = (ph, strokes) =>
    ph.page.evaluate((list) => {
      const room = window.__skaal.session.get().room;
      const holes = window.__skaal.derived().pg.holes;
      room.appendMany(list.map((s, i) => ({ t: 'pg', p: room.pid, h: holes[i].id, s })));
    }, strokes);
  await play(gAnna, [3, 1]);
  await play(gBo, [2, 2]);
  await play(gSara, [4, 1]);
  await play(judge, [2, 1]);
  await judge.page.evaluate(() => {
    const room = window.__skaal.session.get().room;
    const d = window.__skaal.derived();
    const holes = d.pg.holes;
    room.appendMany([
      { t: 'pgpen', p: d.ranking.find((p) => p.name === 'Bo').pid, n: 1, why: 'Spildt', h: holes[1].id },
      { t: 'pgbon', team: 't1', n: 1, why: 'Stilpoint', h: holes[1].id },
      { t: 'hole', h: holes[2].id },
    ]);
  });
  await wait(1500);
  await gAnna.page.getByRole('button', { name: '2 slag', exact: true }).click();
  await gBo.page.getByRole('button', { name: '3 slag', exact: true }).click();
  await wait(5500); // let toasts fade
  await save(gAnna.page, '14-pubgolf-bane');
  await judge.page.evaluate(() => {
    const el = document.querySelector('.pg-judge');
    window.scrollTo(0, el.getBoundingClientRect().top + window.scrollY - 84);
  });
  await wait(500);
  await save(judge.page, '15-pubgolf-dommer');
  await tab(gSara, 'Stilling');
  await wait(800);
  await save(gSara.page, '16-pubgolf-stilling');

  // Photos, and the photo competition's podium on every phone.
  await pickPhoto(gAnna, await photoOf(env.browser, '🍻', '#f6d365,#fda085'), 'Skål fra Heidis!');
  await pickPhoto(gBo, await photoOf(env.browser, '⛳', '#84fab0,#8fd3f4'), 'Hold Blå på green');
  await pickPhoto(gSara, await photoOf(env.browser, '🎤', '#a18cd1,#fbc2eb'), 'Karaoke på Kihoskh');
  await tab(judge, 'Fotos');
  await judge.page.waitForFunction(() => document.querySelectorAll('.photo-tile').length === 3, null, { timeout: 10000 });
  for (const [i, name] of ['Anna', 'Sara', 'Bo'].entries()) {
    await judge.page.locator('.photo-tile', { hasText: name }).click();
    await judge.page.locator('.viewer__places').getByRole('button', { name: new RegExp(`${i + 1}\\.-plads`) }).click();
    await judge.page.getByRole('button', { name: 'Luk', exact: true }).click();
    await wait(400);
  }
  await gBo.page.waitForSelector('.pg-moment--podium .pg-stage__photo + .pg-stage__name', { timeout: 6000 });
  await gBo.page.waitForFunction(() => document.querySelectorAll('.pg-moment--podium .pg-stage__photo').length === 3, null, { timeout: 6000 });
  await wait(2600); // let the confetti settle
  await save(gBo.page, '17-pubgolf-podie');
  for (const ph of golfers) {
    for (let i = 0; i < 4; i++) {
      const btn = ph.page.locator('.pg-moment .pg-moment__actions .btn').last();
      if (!(await btn.count())) break;
      await btn.click();
      await wait(350);
    }
  }
  await tab(gSara, 'Fotos');
  await wait(800);
  await save(gSara.page, '18-pubgolf-fotos');

  const golfTv = await env.phone('tv', { width: 1280, height: 720, scale: 1.5 });
  await golfTv.page.goto(env.appUrl(`#/tv/${golf.code}`));
  await golfTv.page.waitForSelector('.pg-tv__hole');
  await wait(1200);
  for (let i = 0; i < 4 && (await golfTv.page.locator('.pg-moment').count()); i++) {
    await golfTv.page.locator('.pg-moment').last().click();
    await wait(500);
  }
  await wait(800);
  await save(golfTv.page, '19-pubgolf-storskaerm');
  console.log('screenshots written to docs/screenshots/');
} finally {
  await env.teardown();
}
