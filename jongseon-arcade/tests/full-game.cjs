const assert = require('node:assert/strict');
const { chromium } = require('playwright');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

(async () => {
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 1100 } });
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.clock.install();
  await page.goto('http://127.0.0.1:4173/');
  await page.locator('#start-button').click();
  await page.clock.runFor(2300);
  await page.waitForSelector('[data-status="playing"]');
  for (let i = 0; i < 50; i++) {
    const faces = await page.locator('.burrow[data-phase="up"]:not([data-kind="bomb"])').evaluateAll(els => els.map(el => Number(el.dataset.index) + 1));
    for (const index of faces) await page.keyboard.press(String(index));
    await page.clock.runFor(120);
  }
  assert.ok(Number(await page.locator('#score').textContent()) > 40, 'real UI can score continuously');
  await page.clock.runFor(61000);
  assert.equal(await page.locator('#game').getAttribute('data-status'), 'over');
  assert.equal(await page.locator('#result-overlay').isVisible(), true);
  assert.ok(Number(await page.locator('#result-score').textContent()) > 40);
  const recorded = Number(await page.locator('#result-score').textContent());
  assert.equal(Number(await page.locator('#best-score').textContent()), recorded);
  assert.equal(await page.locator('#time').textContent(), '0초');
  await page.keyboard.press('1');
  assert.equal(Number(await page.locator('#score').textContent()), recorded, 'end stops scoring');
  await page.screenshot({ path: 'artifacts/desktop-result.png', fullPage: true });
  await page.reload();
  assert.equal(Number(await page.locator('#best-score').textContent()), recorded, 'record persists');

  const offline = await browser.newPage();
  offline.on('pageerror', e => errors.push(e.message));
  await offline.goto(pathToFileURL(path.resolve('index.html')).href);
  await offline.locator('#start-button').click();
  await offline.waitForSelector('[data-status="playing"]', { timeout: 6000 });
  const first = offline.locator('.burrow[data-phase="up"][data-kind="face"]').first();
  await first.click();
  assert.ok(Number(await offline.locator('#score').textContent()) >= 10, 'file URL works');

  const audioPage = await browser.newPage();
  await audioPage.goto('http://127.0.0.1:4173/');
  const audioReport = await audioPage.evaluate(async () => {
    const results = {};
    for (const name of ['hit', 'miss', 'bomb', 'pop', 'countdown', 'end']) {
      const ctx = new OfflineAudioContext(1, 44100 * 2, 44100);
      const sound = new GameAudio();
      sound._context = ctx;
      sound._buildGraph();
      // Adapt only the live-context guard: schedule BEFORE offline rendering,
      // which otherwise completes in a background audio thread before scheduling.
      Object.defineProperty(ctx, 'state', { get: () => 'running', configurable: true });
      sound[name](1);
      delete ctx.state;
      const data = (await ctx.startRendering()).getChannelData(0);
      let peak = 0, energy = 0;
      for (const sample of data) { peak = Math.max(peak, Math.abs(sample)); energy += sample * sample; }
      results[name] = { peak, rms: Math.sqrt(energy / data.length) };
    }
    return results;
  });
  for (const [name, result] of Object.entries(audioReport)) {
    assert.ok(result.peak > 0.001, `${name} produces an audible waveform`);
    assert.ok(result.peak < 0.98, `${name} does not clip`);
  }
  fs.writeFileSync('artifacts/audio-report.json', JSON.stringify(audioReport, null, 2));
  assert.deepEqual(errors, []);
  await browser.close();
  console.log('PASS: complete 60-second round, results, post-end input, saved best, file:// offline play; six real OfflineAudioContext effects produce unclipped waveforms.');
  console.log(JSON.stringify(audioReport));
})().catch(e => { console.error(e); process.exit(1); });
