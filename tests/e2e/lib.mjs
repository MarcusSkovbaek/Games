// Shared helpers for the browser tests: a local web server + MQTT broker and "phones"
// (isolated browser contexts with a phone-sized viewport).
import { chromium } from 'playwright';
import { fileURLToPath } from 'node:url';
import { mkdirSync } from 'node:fs';
import { startStatic } from '../support/static.mjs';
import { startBroker } from '../support/broker.mjs';

export const ROOT = fileURLToPath(new URL('../../', import.meta.url));
export const SHOTS = fileURLToPath(new URL('./screenshots/', import.meta.url));
mkdirSync(SHOTS, { recursive: true });

export async function setup({ headless = true } = {}) {
  const web = await startStatic({ root: ROOT });
  const broker = await startBroker();
  const browser = await chromium.launch({ headless });
  const phones = [];
  const appUrl = (hash = '') => `${web.url}/skaal/?broker=${encodeURIComponent(broker.url)}${hash}`;

  async function phone(name, { width = 390, height = 844, scale = 2 } = {}) {
    const context = await browser.newContext({
      viewport: { width, height },
      deviceScaleFactor: scale,
      isMobile: true,
      hasTouch: true,
      locale: 'da-DK',
      timezoneId: 'Europe/Copenhagen',
    });
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', (err) => errors.push(`pageerror: ${err.message}`));
    page.on('console', (msg) => {
      if (msg.type() === 'error') errors.push(`console: ${msg.text()}`);
    });
    const p = { name, context, page, errors };
    phones.push(p);
    return p;
  }

  async function teardown() {
    await browser.close();
    await broker.close();
    await web.close();
  }

  return { web, broker, browser, phone, appUrl, teardown, phones };
}

export async function shot(page, name) {
  await page.screenshot({ path: `${SHOTS}${name}.png` });
}

export function assertNoErrors(phones) {
  const all = phones.flatMap((p) => p.errors.map((e) => `[${p.name}] ${e}`));
  if (all.length) throw new Error(`Browser errors:\n${all.join('\n')}`);
}
