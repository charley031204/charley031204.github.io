const assert = require('node:assert/strict');
const { chromium } = require('playwright');

const gameUrl = 'http://127.0.0.1:4173/';

async function captureCreatedAudio(page) {
  await page.addInitScript(() => {
    let exportedConstructor;
    Object.defineProperty(window, 'GameAudio', {
      configurable: true,
      get() { return exportedConstructor; },
      set(AudioConstructor) {
        function TrackedGameAudio() {
          const instance = new AudioConstructor();
          window.__testGameAudio = instance;
          return instance;
        }
        TrackedGameAudio.prototype = AudioConstructor.prototype;
        Object.setPrototypeOf(TrackedGameAudio, AudioConstructor);
        exportedConstructor = TrackedGameAudio;
      }
    });
    window.addEventListener('pagehide', event => {
      window.__testPagehidePersisted = event.persisted;
    });
  });
}

async function verifyBfcacheAudioLifecycle(browser) {
  const page = await browser.newPage();
  await captureCreatedAudio(page);
  await page.goto(gameUrl);
  await page.locator('#start-button').click();
  await page.waitForSelector('[data-status="playing"]', { timeout: 6000 });

  await page.goto(`${gameUrl}index.html?second-page`);
  await page.evaluate(() => history.back());
  await page.waitForFunction(expectedUrl => location.href === expectedUrl, gameUrl);

  assert.equal(
    await page.evaluate(() => window.__testPagehidePersisted),
    true,
    'the original game page must be restored from the back-forward cache'
  );
  await page.locator('#resume-button').click();
  await page.waitForSelector('[data-status="playing"]');
  await page.waitForFunction(() => window.__testGameAudio.context?.state === 'running');
  assert.deepEqual(
    await page.evaluate(() => ({
      disposed: window.__testGameAudio._disposed,
      contextState: window.__testGameAudio.context?.state
    })),
    { disposed: false, contextState: 'running' },
    'a cached game must resume with its original audio instance still usable'
  );
  await page.close();
}

async function verifySoundPanelKeyboardHandling(browser) {
  const page = await browser.newPage();
  await page.goto(gameUrl);
  await page.locator('#start-button').click();
  await page.waitForSelector('[data-status="playing"]', { timeout: 6000 });
  await page.locator('#sound-button').click();

  await page.waitForFunction(() => document.querySelector('.burrow[data-phase="up"]:not([data-kind="bomb"])'));
  const scoreAroundInputShortcut = await page.evaluate(() => {
    const target = document.querySelector('.burrow[data-phase="up"]:not([data-kind="bomb"])');
    const input = document.querySelector('#sfx-toggle');
    const before = document.querySelector('#score').textContent;
    input.focus();
    input.dispatchEvent(new KeyboardEvent('keydown', {
      key: String(Number(target.dataset.index) + 1),
      bubbles: true
    }));
    return { before, after: document.querySelector('#score').textContent };
  });
  assert.equal(
    scoreAroundInputShortcut.after,
    scoreAroundInputShortcut.before,
    'number shortcuts stay suppressed while a sound setting input is focused'
  );

  await page.keyboard.press('Escape');
  assert.equal(await page.locator('#sound-panel').isHidden(), true, 'Escape closes the sound panel from a checkbox');
  assert.equal(await page.locator('#sound-button').getAttribute('aria-expanded'), 'false');
  assert.equal(await page.evaluate(() => document.activeElement?.id), 'sound-button', 'closing restores focus to the sound button');

  await page.locator('#sound-button').click();
  await page.locator('#volume').focus();
  await page.keyboard.press('Escape');
  assert.equal(await page.locator('#sound-panel').isHidden(), true, 'Escape closes the sound panel from the volume slider');
  assert.equal(await page.evaluate(() => document.activeElement?.id), 'sound-button');
  await page.close();
}

(async () => {
  let browser;
  try {
    browser = await chromium.launch({
      channel: 'msedge',
      headless: true,
      ignoreDefaultArgs: ['--disable-back-forward-cache']
    });
    await verifyBfcacheAudioLifecycle(browser);
    await verifySoundPanelKeyboardHandling(browser);
    console.log('PASS: BFCache audio lifecycle and sound-panel keyboard handling.');
  } finally {
    if (browser) await browser.close();
  }
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
