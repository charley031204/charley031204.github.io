(function (root, factory) {
  var GameAudio = factory(root);
  if (typeof module === 'object' && module.exports) module.exports = GameAudio;
  if (root && root.window === root) root.GameAudio = GameAudio;
}(typeof globalThis !== 'undefined' ? globalThis : this, function (root) {
  'use strict';

  function clamp(value, minimum, maximum) {
    return Math.max(minimum, Math.min(maximum, value));
  }

  function setParam(param, value, time) {
    if (!param) return;
    if (typeof param.setValueAtTime === 'function') param.setValueAtTime(value, time);
    else param.value = value;
  }

  function GameAudio() {
    this._context = null;
    this._master = null;
    this._sfxBus = null;
    this._musicBus = null;
    this._sfxSources = new Set();
    this._musicSources = new Set();
    this._musicTimer = null;
    this._musicWanted = false;
    this._suspendPromise = null;
    this._disposed = false;
    this.sfxEnabled = true;
    this.musicEnabled = true;
    this.volume = 0.55;
  }

  Object.defineProperty(GameAudio.prototype, 'context', {
    get: function () { return this._context; }
  });

  GameAudio.prototype._audioConstructor = function () {
    return root && (root.AudioContext || root.webkitAudioContext);
  };

  GameAudio.prototype._buildGraph = function () {
    var context = this._context;
    this._master = context.createGain();
    this._sfxBus = context.createGain();
    this._musicBus = context.createGain();
    var limiter = context.createDynamicsCompressor();
    setParam(limiter.threshold, -10, context.currentTime);
    setParam(limiter.knee, 12, context.currentTime);
    setParam(limiter.ratio, 12, context.currentTime);
    setParam(limiter.attack, 0.003, context.currentTime);
    setParam(limiter.release, 0.22, context.currentTime);
    setParam(this._master.gain, this.volume, context.currentTime);
    setParam(this._sfxBus.gain, this.sfxEnabled ? 0.82 : 0, context.currentTime);
    setParam(this._musicBus.gain, this.musicEnabled ? 0.24 : 0, context.currentTime);
    this._sfxBus.connect(this._master);
    this._musicBus.connect(this._master);
    this._master.connect(limiter);
    limiter.connect(context.destination);
  };

  GameAudio.prototype.unlock = async function () {
    if (this._disposed) return false;
    if (!this._context) {
      var AudioContextCtor = this._audioConstructor();
      if (!AudioContextCtor) return false;
      var createdContext = null;
      try {
        createdContext = new AudioContextCtor();
        this._context = createdContext;
        this._buildGraph();
      } catch (_) {
        this._context = null;
        this._master = null;
        this._sfxBus = null;
        this._musicBus = null;
        if (createdContext && createdContext.state !== 'closed' && typeof createdContext.close === 'function') {
          try { await createdContext.close(); } catch (_) {}
        }
        return false;
      }
    }
    try {
      if (this._context.state !== 'running' && this._context.state !== 'closed' && typeof this._context.resume === 'function') {
        await this._context.resume();
      }
      return this._context.state === 'running';
    } catch (_) {
      return false;
    }
  };

  GameAudio.prototype.setVolume = function (value) {
    value = Number(value);
    if (!Number.isFinite(value)) return;
    this.volume = clamp(value, 0, 1);
    if (this._master && this._context) setParam(this._master.gain, this.volume, this._context.currentTime);
  };

  GameAudio.prototype.setSfxEnabled = function (enabled) {
    this.sfxEnabled = Boolean(enabled);
    if (this._sfxBus && this._context) {
      setParam(this._sfxBus.gain, this.sfxEnabled ? 0.82 : 0, this._context.currentTime);
    }
    if (!this.sfxEnabled) this._stopSources(this._sfxSources);
  };

  GameAudio.prototype.setMusicEnabled = function (enabled) {
    this.musicEnabled = Boolean(enabled);
    if (this._musicBus && this._context) {
      setParam(this._musicBus.gain, this.musicEnabled ? 0.24 : 0, this._context.currentTime);
    }
    if (!this.musicEnabled) this._haltMusic(false);
    else if (this._musicWanted) this._beginMusic();
  };

  GameAudio.prototype._track = function (source, collection) {
    collection.add(source);
    source.onended = function () { collection.delete(source); };
    return source;
  };

  GameAudio.prototype._stopSources = function (collection) {
    Array.from(collection).forEach(function (source) {
      try { source.stop(); } catch (_) {}
      try { source.disconnect(); } catch (_) {}
      collection.delete(source);
    });
  };

  GameAudio.prototype._tone = function (options) {
    if (!this._context || !options.bus) return;
    var context = this._context;
    var start = options.start === undefined ? context.currentTime : options.start;
    var duration = Math.max(0.025, options.duration || 0.1);
    var oscillator = context.createOscillator();
    var gain = context.createGain();
    oscillator.type = options.type || 'sine';
    setParam(oscillator.frequency, options.frequency || 440, start);
    if (options.endFrequency && oscillator.frequency.exponentialRampToValueAtTime) {
      oscillator.frequency.exponentialRampToValueAtTime(options.endFrequency, start + duration);
    }
    setParam(gain.gain, 0.0001, start);
    if (gain.gain.exponentialRampToValueAtTime) {
      gain.gain.exponentialRampToValueAtTime(Math.max(0.0001, options.gain || 0.1), start + 0.008);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
    }
    oscillator.connect(gain);
    gain.connect(options.bus);
    this._track(oscillator, options.collection || this._sfxSources);
    oscillator.start(start);
    oscillator.stop(start + duration + 0.02);
  };

  GameAudio.prototype._noise = function (duration, gainValue, filterType, frequency) {
    if (!this._context || !this._sfxBus) return;
    var context = this._context;
    var frameCount = Math.max(1, Math.floor(context.sampleRate * duration));
    var buffer = context.createBuffer(1, frameCount, context.sampleRate);
    var samples = buffer.getChannelData(0);
    for (var i = 0; i < samples.length; i += 1) samples[i] = Math.random() * 2 - 1;
    var source = context.createBufferSource();
    var filter = context.createBiquadFilter();
    var gain = context.createGain();
    source.buffer = buffer;
    filter.type = filterType;
    setParam(filter.frequency, frequency, context.currentTime);
    setParam(gain.gain, gainValue, context.currentTime);
    if (gain.gain.exponentialRampToValueAtTime) {
      gain.gain.exponentialRampToValueAtTime(0.0001, context.currentTime + duration);
    }
    source.connect(filter);
    filter.connect(gain);
    gain.connect(this._sfxBus);
    this._track(source, this._sfxSources);
    source.start();
    source.stop(context.currentTime + duration + 0.02);
  };

  GameAudio.prototype.hit = function (combo, golden) {
    if (!this._context || !this.sfxEnabled || this._context.state !== 'running') return;
    var lift = clamp(Math.max(1, Number(combo) || 1), 1, 20) - 1;
    var now = this._context.currentTime;
    this._tone({ bus: this._sfxBus, start: now, frequency: 145, endFrequency: 88, duration: 0.095, gain: 0.28, type: 'sine' });
    this._tone({ bus: this._sfxBus, start: now + 0.018, frequency: (golden ? 760 : 520) + lift * 15, endFrequency: (golden ? 1040 : 720) + lift * 18, duration: 0.115, gain: golden ? 0.16 : 0.12, type: 'triangle' });
    if (golden) this._tone({ bus: this._sfxBus, start: now + 0.055, frequency: 1240, endFrequency: 1540, duration: 0.1, gain: 0.07, type: 'sine' });
  };

  GameAudio.prototype.miss = function () {
    if (!this._context || !this.sfxEnabled || this._context.state !== 'running') return;
    this._noise(0.18, 0.08, 'bandpass', 1150);
    this._tone({ bus: this._sfxBus, frequency: 340, endFrequency: 185, duration: 0.17, gain: 0.07, type: 'triangle' });
  };

  GameAudio.prototype.bomb = function () {
    if (!this._context || !this.sfxEnabled || this._context.state !== 'running') return;
    this._tone({ bus: this._sfxBus, frequency: 92, endFrequency: 38, duration: 0.34, gain: 0.3, type: 'sine' });
    this._tone({ bus: this._sfxBus, frequency: 55, endFrequency: 32, duration: 0.27, gain: 0.16, type: 'triangle' });
    this._noise(0.21, 0.1, 'lowpass', 520);
  };

  GameAudio.prototype.pop = function () {
    if (!this._context || !this.sfxEnabled || this._context.state !== 'running') return;
    this._tone({ bus: this._sfxBus, frequency: 430, endFrequency: 610, duration: 0.065, gain: 0.055, type: 'sine' });
  };

  GameAudio.prototype.countdown = function (number) {
    if (!this._context || !this.sfxEnabled || this._context.state !== 'running') return;
    var finalBeat = Number(number) <= 1;
    this._tone({ bus: this._sfxBus, frequency: finalBeat ? 880 : 590, endFrequency: finalBeat ? 1120 : 650, duration: finalBeat ? 0.18 : 0.11, gain: 0.12, type: 'triangle' });
    if (finalBeat) this._tone({ bus: this._sfxBus, start: this._context.currentTime + 0.035, frequency: 1320, duration: 0.15, gain: 0.055, type: 'sine' });
  };

  GameAudio.prototype._scheduleMeasure = function (start) {
    var notes = [262, 330, 392, 523, 392, 330, 294, 392];
    var bass = [131, 131, 147, 147];
    for (var i = 0; i < notes.length; i += 1) {
      this._tone({
        bus: this._musicBus,
        collection: this._musicSources,
        start: start + i * 0.22,
        frequency: notes[i],
        duration: 0.145,
        gain: i % 4 === 0 ? 0.075 : 0.05,
        type: 'triangle'
      });
    }
    for (var j = 0; j < bass.length; j += 1) {
      this._tone({
        bus: this._musicBus,
        collection: this._musicSources,
        start: start + j * 0.44,
        frequency: bass[j],
        duration: 0.27,
        gain: 0.038,
        type: 'sine'
      });
    }
  };

  GameAudio.prototype._beginMusic = function () {
    if (!this._context || !this.musicEnabled || this._context.state !== 'running' || this._musicTimer !== null) return;
    var self = this;
    var measureMs = 1760;
    this._scheduleMeasure(this._context.currentTime + 0.04);
    this._musicTimer = setInterval(function () {
      if (self._context && self._context.state === 'running' && self.musicEnabled) {
        self._scheduleMeasure(self._context.currentTime + 0.04);
      }
    }, measureMs);
    if (this._musicTimer && typeof this._musicTimer.unref === 'function') this._musicTimer.unref();
  };

  GameAudio.prototype.startMusic = function () {
    this._musicWanted = true;
    this._beginMusic();
  };

  GameAudio.prototype._haltMusic = function (clearWanted) {
    if (this._musicTimer !== null) {
      clearInterval(this._musicTimer);
      this._musicTimer = null;
    }
    this._stopSources(this._musicSources);
    if (clearWanted) this._musicWanted = false;
  };

  GameAudio.prototype.stopMusic = function () {
    this._haltMusic(true);
  };

  GameAudio.prototype.suspend = function () {
    if (!this._context) return;
    this._haltMusic(false);
    this._stopSources(this._sfxSources);
    if (this._context.state === 'running' && typeof this._context.suspend === 'function') {
      var self = this;
      var pending;
      try {
        pending = Promise.resolve(this._context.suspend()).catch(function () {});
      } catch (_) {
        return;
      }
      this._suspendPromise = pending;
      return pending.finally(function () {
        if (self._suspendPromise === pending) self._suspendPromise = null;
      });
    }
  };

  GameAudio.prototype.resume = function () {
    var self = this;
    var continueResume = function () {
      var context = self._context;
      if (!context || context.state === 'closed') return;
      if (context.state === 'running') {
        if (self._musicWanted) self._beginMusic();
        return;
      }
      if (typeof context.resume === 'function') {
        return Promise.resolve(context.resume()).then(function () {
          if (self._context === context && self._musicWanted && context.state === 'running') self._beginMusic();
        }).catch(function () {});
      }
    };
    return this._suspendPromise ? this._suspendPromise.then(continueResume) : continueResume();
  };

  GameAudio.prototype.end = function (score) {
    this.stopMusic();
    if (!this._context || !this.sfxEnabled || this._context.state !== 'running') return;
    var now = this._context.currentTime;
    var flourish = Number(score) >= 100 ? [523, 659, 784, 1047] : [392, 494, 587, 784];
    for (var i = 0; i < flourish.length; i += 1) {
      this._tone({ bus: this._sfxBus, start: now + i * 0.115, frequency: flourish[i], duration: 0.2, gain: 0.1, type: 'triangle' });
    }
  };

  GameAudio.prototype.dispose = function () {
    this._haltMusic(true);
    this._stopSources(this._sfxSources);
    var context = this._context;
    this._context = null;
    this._master = null;
    this._sfxBus = null;
    this._musicBus = null;
    this._disposed = true;
    if (context && context.state !== 'closed' && typeof context.close === 'function') {
      try { return context.close().catch(function () {}); } catch (_) {}
    }
  };

  return GameAudio;
}));
