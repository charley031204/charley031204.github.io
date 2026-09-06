const test = require('node:test');
const assert = require('node:assert/strict');

function loadEngine() {
  try {
    return require('../engine.js');
  } catch (error) {
    if (error && error.code === 'MODULE_NOT_FOUND') return null;
    throw error;
  }
}

function seededRandom(seed = 1) {
  let value = seed >>> 0;
  return () => {
    value = (1664525 * value + 1013904223) >>> 0;
    return value / 0x100000000;
  };
}

function activeHole(snapshot, kinds = ['face', 'golden', 'bomb']) {
  return snapshot.holes.find((hole) => hole.phase === 'up' && kinds.includes(hole.kind));
}

test('exports the requested constructor and starts with one safe face', () => {
  const GameEngine = loadEngine();
  assert.equal(typeof GameEngine, 'function');

  const game = new GameEngine({ random: () => 0.25 });
  const events = game.start('hard');
  const state = game.snapshot();

  assert.deepEqual(events.map(({ type, kind }) => ({ type, kind })), [
    { type: 'spawn', kind: 'face' },
  ]);
  assert.equal(state.status, 'playing');
  assert.equal(state.difficulty, 'hard');
  assert.equal(state.holes.length, 7);
  assert.equal(state.holes.filter((hole) => hole.phase === 'up').length, 1);
  assert.equal(activeHole(state).kind, 'face');
});

test('snapshot is independent and exposes only normalized public state', () => {
  const GameEngine = loadEngine();
  const game = new GameEngine({ difficulty: 'impossible', random: () => 0 });
  game.start('impossible');
  const first = game.snapshot();
  first.holes[0].phase = 'empty';
  first.holes.push({});

  const second = game.snapshot();
  assert.equal(second.difficulty, 'normal');
  assert.equal(second.holes.length, 7);
  assert.equal(second.holes[0].phase, 'up');
  assert.deepEqual(Object.keys(second).sort(), [
    'bestCombo', 'bombHits', 'combo', 'difficulty', 'elapsedMs', 'hits',
    'holes', 'lives', 'misses', 'remainingMs', 'score', 'status',
  ]);
});

test('face hits build combo multipliers and hold the hit expression for 360ms', () => {
  const GameEngine = loadEngine();
  const game = new GameEngine({ difficulty: 'hard', durationMs: 20000, random: () => 0 });
  game.start();

  const firstIndex = activeHole(game.snapshot(), ['face']).id;
  assert.deepEqual(game.strike(firstIndex), {
    type: 'hit', index: firstIndex, kind: 'face', points: 10, combo: 1,
  });
  assert.equal(game.snapshot().holes[firstIndex].phase, 'hit');
  game.tick(359);
  assert.equal(game.snapshot().holes[firstIndex].phase, 'hit');
  game.tick(1);
  assert.equal(game.snapshot().holes[firstIndex].phase, 'empty');

  while (game.snapshot().combo < 6) {
    game.tick(100);
    const faces = game.snapshot().holes.filter((hole) => hole.phase === 'up' && hole.kind === 'face');
    for (const face of faces) game.strike(face.id);
  }

  const state = game.snapshot();
  assert.equal(state.combo, 6);
  assert.equal(state.bestCombo, 6);
  assert.equal(state.hits, 6);
  assert.equal(state.score, 70);
});

test('empty strikes miss, hit slots ignore repeats, and malformed indices are ignored', () => {
  const GameEngine = loadEngine();
  const game = new GameEngine({ random: () => 0 });
  game.start();
  const target = activeHole(game.snapshot());
  game.strike(target.id);

  assert.equal(game.strike(target.id).type, 'ignored');
  const emptyIndex = game.snapshot().holes.find((hole) => hole.phase === 'empty').id;
  assert.deepEqual(game.strike(emptyIndex), {
    type: 'miss', index: emptyIndex, points: 0, combo: 0,
  });
  assert.equal(game.snapshot().misses, 1);
  assert.equal(game.strike(-1).type, 'ignored');
  assert.equal(game.strike(7).type, 'ignored');
  assert.equal(game.strike(1.5).type, 'ignored');
});

test('golden targets award 30 base points through the same combo path', () => {
  const GameEngine = loadEngine();
  const values = [0, 0, 0, 0, 0.8, 0, 0];
  const game = new GameEngine({
    difficulty: 'hard',
    random: () => values.length ? values.shift() : 0,
  });
  game.start();
  game.strike(activeHole(game.snapshot()).id);
  game.tick(500);
  const golden = activeHole(game.snapshot(), ['golden']);

  assert.ok(golden);
  assert.deepEqual(game.strike(golden.id), {
    type: 'hit', index: golden.id, kind: 'golden', points: 30, combo: 2,
  });
  assert.equal(game.snapshot().score, 40);
});

test('bombs cost one life and at most 30 points, then end the game at zero lives', () => {
  const GameEngine = loadEngine();
  const game = new GameEngine({ durationMs: 30000, difficulty: 'hard', random: seededRandom(7) });
  game.start();

  let bomb;
  for (let i = 0; i < 120 && !bomb; i += 1) {
    const state = game.snapshot();
    for (const hole of state.holes.filter((item) => item.phase === 'up')) {
      if (hole.kind === 'bomb') {
        bomb = hole;
        break;
      }
      game.strike(hole.id);
    }
    if (!bomb) game.tick(250);
  }
  assert.ok(bomb, 'seeded play should produce a bomb');

  const before = game.snapshot();
  const event = game.strike(bomb.id);
  const after = game.snapshot();
  assert.equal(event.type, 'bomb');
  assert.equal(event.kind, 'bomb');
  assert.equal(after.bombHits, before.bombHits + 1);
  assert.equal(after.lives, before.lives - 1);
  assert.equal(after.score, Math.max(0, before.score - 30));
  assert.equal(after.combo, 0);

  while (game.snapshot().status === 'playing') {
    game.tick(250);
    const nextBomb = activeHole(game.snapshot(), ['bomb']);
    if (nextBomb) game.strike(nextBomb.id);
  }
  assert.equal(game.snapshot().lives, 0);
  assert.equal(game.snapshot().status, 'over');
});

test('escaped targets apply the correct penalties and never exceed three live targets', () => {
  const GameEngine = loadEngine();
  const game = new GameEngine({ durationMs: 8000, difficulty: 'easy', random: seededRandom(19) });
  game.start();
  let sawEscape = false;
  let maxTargets = 0;

  for (let i = 0; i < 30 && game.snapshot().status === 'playing'; i += 1) {
    const events = game.tick(250);
    sawEscape ||= events.some((event) => event.type === 'escape');
    maxTargets = Math.max(maxTargets, game.snapshot().holes.filter((hole) => hole.phase === 'up').length);
  }

  assert.equal(sawEscape, true);
  assert.ok(game.snapshot().misses > 0);
  assert.ok(maxTargets <= 3);
  assert.equal(game.snapshot().lives, 3);
});

test('pause freezes gameplay and invalid delta values are safe no-ops', () => {
  const GameEngine = loadEngine();
  const game = new GameEngine({ random: () => 0 });
  game.start();
  game.pause();
  const paused = game.snapshot();

  assert.deepEqual(game.tick(5000), []);
  assert.equal(game.snapshot().elapsedMs, paused.elapsedMs);
  game.resume();
  assert.deepEqual(game.tick(0), []);
  assert.deepEqual(game.tick(-1), []);
  assert.deepEqual(game.tick(Number.NaN), []);
  assert.equal(game.snapshot().elapsedMs, paused.elapsedMs);
  game.tick(100);
  assert.equal(game.snapshot().elapsedMs, paused.elapsedMs + 100);
});

test('timer expiry emits one end event and clamps time exactly at zero', () => {
  const GameEngine = loadEngine();
  const game = new GameEngine({ durationMs: 1000, random: () => 0.4 });
  game.start();

  const events = game.tick(1500);
  assert.equal(events.filter((event) => event.type === 'end').length, 1);
  assert.equal(game.snapshot().status, 'over');
  assert.equal(game.snapshot().remainingMs, 0);
  assert.equal(game.snapshot().elapsedMs, 1000);
  assert.deepEqual(game.tick(1000), []);
  assert.equal(game.strike(0).type, 'ignored');
});
