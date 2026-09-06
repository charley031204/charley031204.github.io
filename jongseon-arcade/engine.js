(function (root, factory) {
  var GameEngine = factory();
  if (typeof module === 'object' && module.exports) module.exports = GameEngine;
  if (root && root.window === root) root.GameEngine = GameEngine;
}(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  var HOLE_COUNT = 7;
  var HIT_DURATION_MS = 360;
  var RESPAWN_GRACE_MS = 150;
  var DIFFICULTIES = {
    easy: { visibleMs: 1700, spawnMs: 900, minSpawnMs: 520 },
    normal: { visibleMs: 1300, spawnMs: 700, minSpawnMs: 420 },
    hard: { visibleMs: 1000, spawnMs: 560, minSpawnMs: 340 }
  };

  function normalizeDifficulty(value) {
    return Object.prototype.hasOwnProperty.call(DIFFICULTIES, value) ? value : 'normal';
  }

  function blankHole(index) {
    return {
      id: index,
      kind: 'face',
      phase: 'empty',
      spawnedAt: null,
      expiresAt: null,
      hitUntil: null,
      variant: 0,
      blockedUntil: 0
    };
  }

  function GameEngine(options) {
    options = options || {};
    this.random = typeof options.random === 'function' ? options.random : Math.random;
    this.durationMs = Number.isFinite(options.durationMs) && options.durationMs > 0
      ? options.durationMs
      : 60000;
    this.difficulty = normalizeDifficulty(options.difficulty || 'normal');
    this._reset();
  }

  GameEngine.prototype._reset = function () {
    this.status = 'idle';
    this.score = 0;
    this.combo = 0;
    this.bestCombo = 0;
    this.lives = 3;
    this.remainingMs = this.durationMs;
    this.elapsedMs = 0;
    this.hits = 0;
    this.misses = 0;
    this.bombHits = 0;
    this.holes = Array.from({ length: HOLE_COUNT }, function (_, index) {
      return blankHole(index);
    });
    this.nextSpawnAt = Infinity;
    this.endEmitted = false;
  };

  GameEngine.prototype._randomUnit = function () {
    var value = Number(this.random());
    if (!Number.isFinite(value)) return 0;
    return Math.max(0, Math.min(0.999999999, value));
  };

  GameEngine.prototype._progress = function () {
    return Math.max(0, Math.min(1, this.elapsedMs / this.durationMs));
  };

  GameEngine.prototype._visibleMs = function () {
    var initial = DIFFICULTIES[this.difficulty].visibleMs;
    return Math.max(650, initial * (1 - 0.35 * this._progress()));
  };

  GameEngine.prototype._spawnInterval = function () {
    var settings = DIFFICULTIES[this.difficulty];
    var accelerated = settings.spawnMs * (1 - 0.55 * this._progress());
    var interval = Math.max(settings.minSpawnMs, accelerated);
    return interval * (0.85 + this._randomUnit() * 0.3);
  };

  GameEngine.prototype._scheduleSpawn = function () {
    this.nextSpawnAt = this.elapsedMs + this._spawnInterval();
  };

  GameEngine.prototype._spawn = function (forcedKind) {
    var liveCount = this.holes.filter(function (hole) { return hole.phase === 'up'; }).length;
    if (liveCount >= 3) return null;

    var now = this.elapsedMs;
    var eligible = this.holes.filter(function (hole) {
      return hole.phase === 'empty' && hole.blockedUntil <= now;
    });
    if (!eligible.length) return null;

    var hole = eligible[Math.floor(this._randomUnit() * eligible.length)];
    var kind = forcedKind;
    if (!kind) {
      var roll = this._randomUnit();
      kind = roll < 0.78 ? 'face' : roll < 0.90 ? 'golden' : 'bomb';
    }
    hole.kind = kind;
    hole.phase = 'up';
    hole.spawnedAt = now;
    hole.expiresAt = now + this._visibleMs();
    hole.hitUntil = null;
    hole.variant = this._randomUnit() < 0.5 ? 0 : 1;
    return { type: 'spawn', index: hole.id, kind: kind };
  };

  GameEngine.prototype.start = function (difficulty) {
    this.difficulty = normalizeDifficulty(difficulty === undefined ? this.difficulty : difficulty);
    this._reset();
    this.status = 'playing';
    var first = this._spawn('face');
    this._scheduleSpawn();
    return first ? [first] : [];
  };

  GameEngine.prototype._clearHitHoles = function () {
    var now = this.elapsedMs;
    this.holes.forEach(function (hole) {
      if (hole.phase === 'hit' && hole.hitUntil <= now) {
        hole.phase = 'empty';
        hole.spawnedAt = null;
        hole.expiresAt = null;
        hole.hitUntil = null;
      }
    });
  };

  GameEngine.prototype._expireTargets = function (events) {
    var now = this.elapsedMs;
    var self = this;
    this.holes.forEach(function (hole) {
      if (hole.phase !== 'up' || hole.expiresAt > now) return;
      var escapedKind = hole.kind;
      hole.phase = 'empty';
      hole.spawnedAt = null;
      hole.expiresAt = null;
      hole.hitUntil = null;
      if (escapedKind === 'face' || escapedKind === 'golden') {
        self.misses += 1;
        self.combo = 0;
      }
      events.push({ type: 'escape', index: hole.id, kind: escapedKind });
    });
  };

  GameEngine.prototype._nextStateTime = function (targetTime) {
    var next = Math.min(targetTime, this.nextSpawnAt, this.durationMs);
    this.holes.forEach(function (hole) {
      if (hole.phase === 'up') next = Math.min(next, hole.expiresAt);
      if (hole.phase === 'hit') next = Math.min(next, hole.hitUntil);
    });
    return next;
  };

  GameEngine.prototype._finish = function () {
    if (this.status !== 'over') this.status = 'over';
  };

  GameEngine.prototype.tick = function (deltaMs) {
    if (this.status !== 'playing' || !Number.isFinite(deltaMs) || deltaMs <= 0) return [];
    var events = [];
    var targetTime = Math.min(this.durationMs, this.elapsedMs + deltaMs);

    while (this.status === 'playing' && this.elapsedMs < targetTime) {
      var nextTime = this._nextStateTime(targetTime);
      this.elapsedMs = nextTime;
      this.remainingMs = Math.max(0, this.durationMs - this.elapsedMs);
      this._clearHitHoles();
      this._expireTargets(events);

      if (this.elapsedMs >= this.durationMs) {
        this._finish();
        if (!this.endEmitted) {
          events.push({ type: 'end' });
          this.endEmitted = true;
        }
        break;
      }

      if (this.nextSpawnAt <= this.elapsedMs) {
        var spawnEvent = this._spawn();
        if (spawnEvent) events.push(spawnEvent);
        this._scheduleSpawn();
      }
    }
    return events;
  };

  GameEngine.prototype.strike = function (index) {
    if (this.status !== 'playing' || !Number.isInteger(index) || index < 0 || index >= HOLE_COUNT) {
      return { type: 'ignored', index: Number.isInteger(index) ? index : undefined };
    }
    var hole = this.holes[index];
    if (hole.phase === 'hit') return { type: 'ignored', index: index, kind: hole.kind };
    if (hole.phase === 'empty') {
      this.misses += 1;
      this.combo = 0;
      return { type: 'miss', index: index, points: 0, combo: 0 };
    }

    hole.phase = 'hit';
    hole.hitUntil = this.elapsedMs + HIT_DURATION_MS;
    hole.expiresAt = null;
    hole.blockedUntil = hole.hitUntil + RESPAWN_GRACE_MS;

    if (hole.kind === 'bomb') {
      var previousScore = this.score;
      this.bombHits += 1;
      this.lives = Math.max(0, this.lives - 1);
      this.score = Math.max(0, this.score - 30);
      this.combo = 0;
      if (this.lives === 0) this._finish();
      return {
        type: 'bomb',
        index: index,
        kind: 'bomb',
        points: this.score - previousScore,
        combo: 0
      };
    }

    this.hits += 1;
    this.combo += 1;
    this.bestCombo = Math.max(this.bestCombo, this.combo);
    var base = hole.kind === 'golden' ? 30 : 10;
    var multiplier = Math.min(4, 1 + Math.floor((this.combo - 1) / 5));
    var points = base * multiplier;
    this.score += points;
    return {
      type: 'hit',
      index: index,
      kind: hole.kind,
      points: points,
      combo: this.combo
    };
  };

  GameEngine.prototype.pause = function () {
    if (this.status === 'playing') this.status = 'paused';
  };

  GameEngine.prototype.resume = function () {
    if (this.status === 'paused') this.status = 'playing';
  };

  GameEngine.prototype.snapshot = function () {
    return {
      status: this.status,
      difficulty: this.difficulty,
      score: this.score,
      combo: this.combo,
      bestCombo: this.bestCombo,
      lives: this.lives,
      remainingMs: this.remainingMs,
      elapsedMs: this.elapsedMs,
      hits: this.hits,
      misses: this.misses,
      bombHits: this.bombHits,
      holes: this.holes.map(function (hole) {
        return {
          id: hole.id,
          kind: hole.kind,
          phase: hole.phase,
          spawnedAt: hole.spawnedAt,
          expiresAt: hole.expiresAt,
          hitUntil: hole.hitUntil,
          variant: hole.variant
        };
      })
    };
  };

  return GameEngine;
}));
