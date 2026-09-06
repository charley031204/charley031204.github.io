# Final review fix report

## Fixed behavior

- `pagehide` now distinguishes BFCache entry from actual page termination. A persisted page suspends audio so the same `GameAudio` instance can resume after Back navigation; a non-persisted page still disposes audio resources.
- `Escape` closes the sound panel even when a checkbox or volume slider owns focus. The panel updates `aria-expanded` and restores focus to the sound button before the general input guard returns.
- Number shortcuts remain suppressed while a sound-setting input owns focus. Existing `P`/`Escape` pause behavior and modal keyboard handling remain covered by the browser regression suite.

## Regression evidence

The new `tests/lifecycle.cjs` test was run against the original implementation before either production change:

1. BFCache navigation restored the game page, but resume observed `{ disposed: true, contextState: undefined }` instead of a live audio context.
2. After the lifecycle branch was fixed, `Escape` from the focused SFX checkbox left the sound panel open.

The lifecycle test captures the real `GameAudio` instance by wrapping the page export before scripts initialize. This instrumentation exists only in the test. Edge runs with Playwright's `--disable-back-forward-cache` default argument omitted, and every browser is closed in `finally`.

## Verification

- `node tests/lifecycle.cjs`: pass — BFCache audio resumes; checkbox and range-slider Escape handling pass; number shortcuts stay suppressed in settings inputs.
- `npm test`: pass — 17/17 engine and audio unit tests.
- `node tests/browser.cjs`: pass — desktop and mobile flow, pause/resume/restart, sound controls, and zero browser exceptions.
- `node --check game.js`: pass.

Playwright resolved through `NODE_PATH=C:/Users/charl/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules` and used the installed Edge channel against `http://127.0.0.1:4173/`.
