# Jongseon Arcade Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development. Track the checklist below.

**Goal:** Deliver an offline Korean whack-a-mole game using generated facial expressions and responsive sound.

**Architecture:** Classic scripts for file:// compatibility. Pure GameEngine owns state; GameAudio owns Web Audio; game.js connects them to the illustrated DOM board.

**Tech Stack:** HTML, CSS, vanilla JavaScript, Web Audio, Node test runner, Playwright.

**Spec:** docs/superpowers/specs/2026-09-06-jongseon-arcade-design.md

## Global Constraints
- No runtime dependencies, account, remote storage or public deployment.
- 7 holes, 60000 ms, 3 lives; Korean interface; source photos remain untouched.
- Independent ownership: worker owns engine.js/audio.js and unit tests; root owns UI/assets/browser tests/package.

### Task 1: State engine and sound
- [x] Write and run failing behavior tests for duplicate strikes, combo reset, bomb lives, paused time, game end and restart.
- [x] Implement GameEngine and GameAudio according to docs/worker-brief.md.
- [x] Run node --test tests/engine.test.cjs and syntax checks.
- [x] Independent review: spec compliance and correctness, fix findings.

### Task 2: Faces and playable UI
- [x] Generate normal and painful comic-hit sprites from supplied portraits; use runtime chroma compositing because the generator returned RGB, and save prompts in assets/prompts.md.
- [x] Write browser smoke test for start, scoring, pause, restart and mobile fit. Run before UI exists to confirm expected failure.
- [x] Build index.html/styles.css/game.js, offline assets and localhost preview server.
- [x] Run browser checks, visually inspect desktop and phone screenshots, inspect generated expressions in the game.

### Task 3: Delivery
- [x] Independent whole-game review, resolve important findings and verify affected tests.
- [x] Save README, ZIP, test results, and request the playable game tab in Codex (queued by the app).
