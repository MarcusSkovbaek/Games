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

export async function createEvent(env, { name = 'Fredagsbar hos Mads', host = 'Mads', photo } = {}) {
  const ph = await env.phone(host);
  const p = ph.page;
  await p.goto(env.appUrl('#/ny'));
  await p.fill('input[placeholder^="Fx Fredagsbar"]', name);
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
