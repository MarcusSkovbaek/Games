// Higher-level steps shared by the browser tests.
export async function photoOf(browser, emoji, colors) {
  const painter = await browser.newPage({ viewport: { width: 600, height: 800 } });
  await painter.setContent(
    `<body style="margin:0"><div style="width:600px;height:800px;background:linear-gradient(135deg,${colors});display:grid;place-items:center;font-size:260px">${emoji}</div></body>`,
  );
  const buf = await painter.screenshot({ type: 'jpeg', quality: 88 });
  await painter.close();
  return buf;
}

export async function createEvent(env, { name = 'Fredagsbar hos Mads', host = 'Mads', photo, disposable, breakers = true } = {}) {
  const ph = await env.phone(host);
  const p = ph.page;
  await p.goto(env.appUrl('#/ny'));
  await p.fill('input[placeholder^="Fx Fredagsbar"]', name);
  if (!breakers) await p.locator('.chip', { hasText: /^Fra$/ }).click();
  if (disposable) await p.locator('.switch-row', { hasText: 'Engangskamera' }).click();
  await p.getByRole('button', { name: 'Opret event' }).click();
  await p.waitForSelector('.event-preview', { timeout: 15000 });
  if (photo) await setPhoto(p, photo);
  await p.fill('input[name=name]', host);
  await p.getByRole('button', { name: /Gem og invitér/ }).click();
  await p.waitForSelector('.qr svg');
  const code = await p.evaluate(() => location.hash.split('/')[2]);
  await p.locator('.sheet__close').first().click();
  await p.waitForSelector('.drink-grid');
  return { ph, code };
}

export async function setPhoto(page, buffer) {
  await page.setInputFiles('input[type=file]', { name: 'me.jpg', mimeType: 'image/jpeg', buffer });
  await page.waitForSelector('.cropper img');
  await page.getByRole('button', { name: 'Brug billede' }).click();
  await page.waitForSelector('.photo-pick.has-photo');
}

export async function joinEvent(env, code, name, photo) {
  const ph = await env.phone(name);
  const p = ph.page;
  await p.goto(env.appUrl(`#/e/${code}`));
  await p.waitForSelector('.event-preview', { timeout: 15000 });
  if (photo) await setPhoto(p, photo);
  await p.fill('input[name=name]', name);
  await p.getByRole('button', { name: /Deltag i festen/ }).click();
  await p.waitForSelector('.drink-grid', { timeout: 10000 });
  return ph;
}

// A pub golf event: the host picks the type, names the first bars and joins a team.
export async function createPubGolf(env, { name = 'Pub golf på Vesterbro', host = 'Mads', bars = [], team, photo, disposable } = {}) {
  const ph = await env.phone(host);
  const p = ph.page;
  await p.goto(env.appUrl('#/ny'));
  await p.getByRole('radio', { name: /Pub golf/ }).click();
  await p.fill('input[placeholder^="Fx Pub golf"]', name);
  for (const [i, bar] of bars.entries()) await p.fill(`input[aria-label="Bar på hul ${i + 1}"]`, bar);
  if (disposable) await p.locator('.switch-row', { hasText: 'Engangskamera' }).click();
  await p.getByRole('button', { name: 'Opret pub golf' }).click();
  await p.waitForSelector('.event-preview', { timeout: 15000 });
  if (photo) await setPhoto(p, photo);
  await p.fill('input[name=name]', host);
  if (team) await p.locator('.team-chip', { hasText: team }).click();
  await p.getByRole('button', { name: /Gem og invitér/ }).click();
  await p.waitForSelector('.qr svg');
  const code = await p.evaluate(() => location.hash.split('/')[2]);
  await p.locator('.sheet__close').first().click();
  await p.waitForSelector('.pg-hero');
  return { ph, code };
}

export async function joinPubGolf(env, code, name, { team, photo, size } = {}) {
  const ph = await env.phone(name, size);
  const p = ph.page;
  await p.goto(env.appUrl(`#/e/${code}`));
  await p.waitForSelector('.event-preview', { timeout: 15000 });
  if (photo) await setPhoto(p, photo);
  await p.fill('input[name=name]', name);
  if (team) await p.locator('.team-chip', { hasText: team }).click();
  await p.getByRole('button', { name: /Deltag i pub golf/ }).click();
  await p.waitForSelector('.pg-hero', { timeout: 10000 });
  return ph;
}

// Opens the in-app camera from the top bar, takes a picture of the fake camera and shares it.
export async function takePhoto(ph, caption = '') {
  await ph.page.getByRole('button', { name: 'Tag et billede', exact: true }).click();
  await ph.page.waitForSelector('.camera__video.is-on', { timeout: 10000 });
  await ph.page.getByRole('button', { name: 'Tag billede', exact: true }).click();
  await sharePhotoFromReview(ph, caption);
  await ph.page.getByRole('button', { name: 'Luk kameraet' }).click();
  await ph.page.waitForSelector('.camera', { state: 'detached' });
}

// The disposable camera (open already, or opened from the top bar): n blind shots — nothing to
// look at, nothing to review.
export async function shootDisposable(ph, n = 1, { open = true } = {}) {
  if (open) await ph.page.getByRole('button', { name: 'Tag et billede', exact: true }).click();
  const ready = () => ph.page.waitForFunction(() => document.querySelector('.dispo__shutter')?.disabled === false, null, { timeout: 10000 });
  await ready();
  for (let i = 0; i < n; i++) {
    const before = await ph.page.evaluate(() => window.__skaal.derived().shotsUsed);
    await ph.page.locator('.dispo__shutter').click();
    await ph.page.waitForFunction((b) => window.__skaal.derived().shotsUsed > b, before, { timeout: 10000 });
    if (before < 22) await ready();
  }
  await ph.page.getByRole('button', { name: 'Luk kameraet' }).click();
  await ph.page.waitForSelector('.camera', { state: 'detached' });
}

// The same, with a picture from the camera roll (picked inside the camera).
export async function pickPhoto(ph, buffer, caption = '') {
  await ph.page.getByRole('button', { name: 'Tag et billede', exact: true }).click();
  await ph.page.waitForSelector('.camera__live, .camera__fallback', { timeout: 10000 });
  await ph.page.setInputFiles('.camera input[aria-label="Vælg fra kamerarullen"]', { name: 'photo.jpg', mimeType: 'image/jpeg', buffer });
  await sharePhotoFromReview(ph, caption);
  await ph.page.getByRole('button', { name: 'Luk kameraet' }).click();
  await ph.page.waitForSelector('.camera', { state: 'detached' });
}

// Enters pub golf's photo competition with a picture from the photo album: from the competition's
// card, looked over, sent in (a new one takes the place of an earlier entry).
export async function enterPhotoComp(ph, buffer, caption = '') {
  await tab(ph, 'Konkurrencer');
  const chooser = ph.page.waitForEvent('filechooser');
  await ph.page.locator('.pg-comp', { hasText: 'Fotokonkurrence' }).getByRole('button', { name: /^(Upload dit billede|Skift billede)$/ }).click();
  await (await chooser).setFiles({ name: 'album.jpg', mimeType: 'image/jpeg', buffer });
  await ph.page.waitForSelector('.entry-sheet__photo', { timeout: 10000 });
  if (caption) await ph.page.fill('.sheet.is-open input.input', caption);
  await ph.page.getByRole('button', { name: 'Send ind', exact: true }).click();
  await ph.page.waitForFunction(
    (cap) => {
      const d = window.__skaal.derived();
      return d.pg.entries.get('photo')?.some((e) => e.pid === d.me && e.cap === cap);
    },
    caption,
    { timeout: 10000 },
  );
  await ph.page.waitForSelector('.sheet.is-open', { state: 'detached', timeout: 5000 });
}

async function sharePhotoFromReview(ph, caption) {
  await ph.page.waitForSelector('.camera__review', { timeout: 10000 });
  if (caption) await ph.page.fill('.camera__form input', caption);
  const before = await ph.page.evaluate(() => window.__skaal.derived().photos.length);
  await ph.page.getByRole('button', { name: 'Del med alle' }).click();
  await ph.page.waitForFunction((n) => window.__skaal.derived().photos.length > n, before, { timeout: 10000 });
  await ph.page.waitForSelector('.camera__review', { state: 'detached' });
}

export async function logDrink(ph, label, times = 1) {
  for (let i = 0; i < times; i++) {
    await ph.page.locator('.drink-tile', { hasText: label }).first().click();
    await ph.page.waitForTimeout(500);
  }
}

export async function fastForward(phones, ms) {
  await Promise.all(phones.map((ph) => ph.page.evaluate((d) => window.__skaal.setClockOffset(window.__skaal.getClockOffset() + d), ms)));
}

export async function derived(ph, fn) {
  return ph.page.evaluate(`(${fn})(window.__skaal.derived())`);
}

export async function tab(ph, label) {
  await ph.page.locator('.tabbar').getByRole('button', { name: label }).click();
  await ph.page.waitForTimeout(250);
}

// Close any "you must drink" popups (and a fællesskål) so the next click lands on the page.
export async function dismissPopups(phones) {
  for (const ph of phones) {
    const toastClose = ph.page.locator('.gtoast').getByRole('button', { name: 'Luk' }).first();
    if (await toastClose.count()) {
      await toastClose.click();
      await ph.page.waitForTimeout(350);
    }
    for (let i = 0; i < 6; i++) {
      const later = ph.page.locator('.drink-pop').getByRole('button', { name: 'Senere' });
      if (!(await later.count())) break;
      await later.click();
      await ph.page.waitForTimeout(350);
    }
  }
}

export async function startGame(ph, name) {
  await ph.page.locator('.game-card', { hasText: name }).click();
  await ph.page.getByRole('button', { name: 'Start for alle' }).click();
}

export async function pidOf(ph) {
  return ph.page.evaluate(() => window.__skaal.session.get().room.pid);
}

// A short tone as a WAV file, served as "the Tour song" in tests.
export function toneWav(seconds = 30, rate = 8000) {
  const n = rate * seconds;
  const b = Buffer.alloc(44 + n);
  b.write('RIFF', 0);
  b.writeUInt32LE(36 + n, 4);
  b.write('WAVEfmt ', 8);
  b.writeUInt32LE(16, 16);
  b.writeUInt16LE(1, 20);
  b.writeUInt16LE(1, 22);
  b.writeUInt32LE(rate, 24);
  b.writeUInt32LE(rate, 28);
  b.writeUInt16LE(1, 32);
  b.writeUInt16LE(8, 34);
  b.write('data', 36);
  b.writeUInt32LE(n, 40);
  for (let i = 0; i < n; i++) b[44 + i] = 128 + Math.round(30 * Math.sin((i / rate) * 2 * Math.PI * 440));
  return b;
}

export async function axeViolations(page, axeSource) {
  // Colours are judged as they look once things have come in: let short entrance animations (a
  // pop-up fading in) finish first — not the endless ones, nor a slideshow's progress bar.
  await page.evaluate(() =>
    Promise.race([
      Promise.all(
        document
          .getAnimations()
          .filter((a) => a.playState === 'running' && a.effect?.getComputedTiming().endTime <= 1500)
          .map((a) => a.finished.catch(() => {})),
      ),
      new Promise((resolve) => setTimeout(resolve, 2000)),
    ]),
  );
  await page.addScriptTag({ content: axeSource });
  return page.evaluate(async () =>
    (await window.axe.run(document, { resultTypes: ['violations'] })).violations
      .filter((v) => v.impact === 'serious' || v.impact === 'critical')
      .map((v) => `${v.id} (${v.nodes[0]?.target?.join(' ')})`),
  );
}

// Give a player a wheel offer whose outcome is already decided (as if they had just spun it), and
// open it — so tests can reach a specific outcome without relying on luck.
export async function rigSpin(ph, wheel, outcome) {
  await ph.page.evaluate(
    ([w, oc]) => {
      const room = window.__skaal.session.get().room;
      const offer = room.append({ t: 'o', w, why: 'lead' });
      localStorage.setItem(`skaal:spin:${offer.id}`, JSON.stringify({ oc }));
      window.__skaal.ui.set({ spin: offer.id });
    },
    [wheel, outcome],
  );
  await ph.page.waitForSelector('.outcome');
}
