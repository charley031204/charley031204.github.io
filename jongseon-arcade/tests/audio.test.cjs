const test = require('node:test');
const assert = require('node:assert/strict');

function loadAudio() {
  try {
    return require('../audio.js');
  } catch (error) {
    if (error && error.code === 'MODULE_NOT_FOUND') return null;
    throw error;
  }
}

test('exports a constructor and safely no-ops when Web Audio is unavailable', async () => {
  const GameAudio = loadAudio();
  assert.equal(typeof GameAudio, 'function');
  const audio = new GameAudio();

  assert.equal(audio.context, null);
  assert.equal(audio.sfxEnabled, true);
  assert.equal(audio.musicEnabled, true);
  assert.equal(audio.volume, 0.55);
  assert.equal(await audio.unlock(), false);
  assert.doesNotThrow(() => {
    audio.setSfxEnabled(false);
    audio.setMusicEnabled(false);
    audio.setVolume(2);
    audio.hit(4, true);
    audio.miss();
    audio.bomb();
    audio.pop();
    audio.countdown(1);
    audio.startMusic();
    audio.stopMusic();
    audio.suspend();
    audio.resume();
    audio.end(120);
    audio.dispose();
  });
});

class FakeParam {
  constructor(value = 0) { this.value = value; }
  setValueAtTime(value) { this.value = value; }
  linearRampToValueAtTime(value) { this.value = value; }
  exponentialRampToValueAtTime(value) { this.value = value; }
  setTargetAtTime(value) { this.value = value; }
  cancelScheduledValues() {}
}

class FakeNode {
  constructor(context) {
    this.context = context;
    this.gain = new FakeParam(1);
    this.frequency = new FakeParam(440);
    this.detune = new FakeParam(0);
    this.Q = new FakeParam(1);
    this.playbackRate = new FakeParam(1);
    this.onended = null;
  }
  connect() { return this; }
  disconnect() {}
  start() { this.context.started += 1; }
  stop(when) {
    if (Number.isFinite(when) && when > this.context.currentTime) {
      this.context.scheduledStops += 1;
      return;
    }
    this.context.stopped += 1;
    if (this.onended) this.onended();
  }
}

class FakeAudioContext {
  constructor() {
    this.currentTime = 0;
    this.sampleRate = 48000;
    this.state = 'suspended';
    this.destination = new FakeNode(this);
    this.started = 0;
    this.stopped = 0;
    this.scheduledStops = 0;
  }
  createGain() { return new FakeNode(this); }
  createDynamicsCompressor() {
    const node = new FakeNode(this);
    node.threshold = new FakeParam();
    node.knee = new FakeParam();
    node.ratio = new FakeParam();
    node.attack = new FakeParam();
    node.release = new FakeParam();
    return node;
  }
  createOscillator() { return new FakeNode(this); }
  createBiquadFilter() { return new FakeNode(this); }
  createBuffer() { return { getChannelData: () => new Float32Array(48000) }; }
  createBufferSource() { return new FakeNode(this); }
  async resume() { this.state = 'running'; }
  async suspend() { this.state = 'suspended'; }
  async close() { this.state = 'closed'; }
}

test('unlock is lazy, resumes the context, and volume is clamped', async () => {
  const previous = globalThis.AudioContext;
  globalThis.AudioContext = FakeAudioContext;
  try {
    const GameAudio = loadAudio();
    const audio = new GameAudio();
    assert.equal(audio.context, null);
    assert.equal(await audio.unlock(), true);
    assert.equal(audio.context.state, 'running');

    audio.setVolume(-3);
    assert.equal(audio.volume, 0);
    audio.setVolume(8);
    assert.equal(audio.volume, 1);
    assert.doesNotThrow(() => audio.hit(30, true));
    assert.ok(audio.context.started >= 2, 'a hit should use layered sound sources');
    audio.dispose();
  } finally {
    if (previous === undefined) delete globalThis.AudioContext;
    else globalThis.AudioContext = previous;
  }
});

test('music starts once, mute stops scheduled notes, and resume does not duplicate loops', async () => {
  const previous = globalThis.AudioContext;
  globalThis.AudioContext = FakeAudioContext;
  try {
    const GameAudio = loadAudio();
    const audio = new GameAudio();
    await audio.unlock();
    audio.startMusic();
    const afterFirstStart = audio.context.started;
    audio.startMusic();
    assert.equal(audio.context.started, afterFirstStart);

    audio.setMusicEnabled(false);
    const stoppedAfterMute = audio.context.stopped;
    assert.ok(stoppedAfterMute > 0);
    audio.setMusicEnabled(true);
    assert.ok(audio.context.started > afterFirstStart);
    const afterUnmute = audio.context.started;
    audio.resume();
    assert.equal(audio.context.started, afterUnmute);
    audio.dispose();
  } finally {
    if (previous === undefined) delete globalThis.AudioContext;
    else globalThis.AudioContext = previous;
  }
});

test('suspend clears scheduled effects so stale sounds cannot play after resume', async () => {
  const previous = globalThis.AudioContext;
  globalThis.AudioContext = FakeAudioContext;
  try {
    const GameAudio = loadAudio();
    const audio = new GameAudio();
    await audio.unlock();
    audio.hit(1, false);
    const beforeSuspend = audio.context.stopped;

    await audio.suspend();
    assert.ok(audio.context.stopped > beforeSuspend);
    assert.equal(audio.context.state, 'suspended');
    audio.dispose();
  } finally {
    if (previous === undefined) delete globalThis.AudioContext;
    else globalThis.AudioContext = previous;
  }
});

test('unlock resumes an interrupted context before reporting success', async () => {
  const previous = globalThis.AudioContext;
  class InterruptedAudioContext extends FakeAudioContext {
    constructor() {
      super();
      this.state = 'interrupted';
      this.resumeCalls = 0;
    }
    async resume() {
      this.resumeCalls += 1;
      this.state = 'running';
    }
  }
  globalThis.AudioContext = InterruptedAudioContext;
  try {
    const GameAudio = loadAudio();
    const audio = new GameAudio();

    assert.equal(await audio.unlock(), true);
    assert.equal(audio.context.resumeCalls, 1);
    assert.equal(audio.context.state, 'running');
    audio.dispose();
  } finally {
    if (previous === undefined) delete globalThis.AudioContext;
    else globalThis.AudioContext = previous;
  }
});

test('unlock reports false when resume resolves without reaching running', async () => {
  const previous = globalThis.AudioContext;
  class StillSuspendedAudioContext extends FakeAudioContext {
    constructor() {
      super();
      this.resumeCalls = 0;
    }
    async resume() { this.resumeCalls += 1; }
  }
  globalThis.AudioContext = StillSuspendedAudioContext;
  try {
    const GameAudio = loadAudio();
    const audio = new GameAudio();

    assert.equal(await audio.unlock(), false);
    assert.equal(audio.context.resumeCalls, 1);
    assert.equal(audio.context.state, 'suspended');
    audio.dispose();
  } finally {
    if (previous === undefined) delete globalThis.AudioContext;
    else globalThis.AudioContext = previous;
  }
});

test('resume rejection preserves one context so unlock can retry without an orphan', async () => {
  const previous = globalThis.AudioContext;
  const instances = [];
  class RetryableAudioContext extends FakeAudioContext {
    constructor() {
      super();
      this.resumeCalls = 0;
      instances.push(this);
    }
    async resume() {
      this.resumeCalls += 1;
      if (this.resumeCalls === 1) throw new Error('gesture was not accepted');
      this.state = 'running';
    }
  }
  globalThis.AudioContext = RetryableAudioContext;
  try {
    const GameAudio = loadAudio();
    const audio = new GameAudio();

    assert.equal(await audio.unlock(), false);
    const firstContext = audio.context;
    assert.ok(firstContext);
    assert.equal(instances.length, 1);

    assert.equal(await audio.unlock(), true);
    assert.equal(audio.context, firstContext);
    assert.equal(instances.length, 1);
    assert.equal(firstContext.resumeCalls, 2);
    audio.dispose();
  } finally {
    if (previous === undefined) delete globalThis.AudioContext;
    else globalThis.AudioContext = previous;
  }
});

test('resume waits for a pending suspend before rebuilding the music loop', async () => {
  const previous = globalThis.AudioContext;
  class DelayedSuspendAudioContext extends FakeAudioContext {
    constructor() {
      super();
      this.finishSuspend = null;
      this.resumeCalls = 0;
    }
    async resume() {
      this.resumeCalls += 1;
      this.state = 'running';
    }
    suspend() {
      return new Promise((resolve) => {
        this.finishSuspend = () => {
          this.state = 'suspended';
          resolve();
        };
      });
    }
  }
  globalThis.AudioContext = DelayedSuspendAudioContext;
  try {
    const GameAudio = loadAudio();
    const audio = new GameAudio();
    await audio.unlock();
    audio.startMusic();
    const startsBeforeSuspend = audio.context.started;

    const suspendPromise = audio.suspend();
    const resumePromise = audio.resume();
    assert.equal(audio.context.started, startsBeforeSuspend);

    audio.context.finishSuspend();
    await Promise.all([suspendPromise, resumePromise]);
    assert.equal(audio.context.state, 'running');
    assert.equal(audio.context.resumeCalls, 2);
    assert.ok(audio.context.started > startsBeforeSuspend);
    audio.dispose();
  } finally {
    if (previous === undefined) delete globalThis.AudioContext;
    else globalThis.AudioContext = previous;
  }
});
