# Engine and audio worker requirements

You own engine.js, audio.js, tests/engine.test.cjs, tests/audio.test.cjs and docs/engine-audio-report.md only. Others work on UI concurrently; do not revert or modify their work. No subagents. No git commits: parent collects final reviewed delivery.

Use classic-script UMD globals plus CommonJS exports: window.GameEngine (constructor), window.GameAudio (constructor). CommonJS `module.exports = GameEngine` and corresponding GameAudio.

## GameEngine interface
`new GameEngine({random: Math.random, durationMs: 60000, difficulty: 'normal'})`.
`start(difficulty = this.difficulty)` resets and starts. `tick(deltaMs)` advances only playing state, returns events array. `strike(index)` returns one event. `pause()` and `resume()` toggle status. `snapshot()` returns independent public values, not mutable state references.

Snapshot fields: status idle/playing/paused/over, difficulty easy/normal/hard, score, combo, bestCombo, lives, remainingMs, elapsedMs, hits, misses, bombHits, holes. Holes always length 7: {id: index, kind: 'face'|'golden'|'bomb', phase: 'empty'|'up'|'hit', spawnedAt, expiresAt, hitUntil, variant: 0|1}. Times use elapsed gameplay ms. Expose easy/normal/hard only. Phase hit shows struck expression for 360 ms then becomes empty. Do not immediately respawn in a hit slot.

Events: {type:'spawn'|'escape'|'hit'|'bomb'|'miss'|'ignored'|'end', index?, kind?, points?, combo?}. start returns array (may include initial spawn). strike on inactive/hit slot ignored; on empty slot miss, increments misses and breaks combo. On up face/golden increments hits/combo and awards base 10/30 times min(4,1+floor((combo-1)/5)); phase hit. Bomb hit increments bombHits, takes one life and 30 points (floor zero), resets combo; phase hit. Escaped face/golden increments misses, breaks combo but no life lost. Escaped bomb harmless. Time zero or lives zero ends exactly once; strike returns bomb event even if it ends. UI detects snapshot status after every action.

Spawn kinds probabilities ~78% face/12% golden/10% bomb. Fair low initial density growing through time, easy visible ~1700ms, normal ~1300ms, hard ~1000ms, progressively faster but >=650ms. At most 3 simultaneous targets. Start with a face so no immediate bomb. Tests use seeded RNG and active snapshots, no public cheat API. Validate nonpositive/NaN dt safely. Reject invalid hole indices as ignored.

## GameAudio interface
`new GameAudio()` no immediate AudioContext. `unlock()` Promise<boolean> on user gesture. `setSfxEnabled(bool)`, `setMusicEnabled(bool)`, `setVolume(0..1)`, `hit(combo=1,golden=false)`, `miss()`, `bomb()`, `pop()`, `countdown(n)`, `startMusic()`, `stopMusic()`, `suspend()`, `resume()`, `end(score=0)`, `dispose()`.
SFX and music independently toggle. Start defaults SFX true, music true, volume 0.55. Pleasant short layered rubber mallet thud and pitched squeak with combo rising pitch, swoosh miss, bounded low bomb thump and noise, quiet pop, countdown and cheerful game-over phrase. No speech impersonation. Chiptune-inspired gentle loop; short envelope to avoid clicks, master limiter/compressor, bounded gain, stop scheduled sources on suspend/mute as appropriate, no duplicate loops on repeated resume/start. All functions safely no-op before unlock or if Web Audio unavailable. Expose `context` getter for browser verification; do not invent browser globals in Node.

Use TDD for meaningful state behaviors. Verify module syntax. Report API, tests run/output and remaining concerns in docs/engine-audio-report.md. Final message compact. Read relevant TDD skill if needed; user explicitly authorizes implementation without further approval.
