# 엔진·오디오 구현 보고서

## 구현 범위

- `engine.js`: classic-script 전역 `window.GameEngine`과 CommonJS export를 함께 제공한다.
- `audio.js`: classic-script 전역 `window.GameAudio`과 CommonJS export를 함께 제공한다.
- `tests/engine.test.cjs`: 점수, 콤보, 타격 유지 시간, miss/escape/bomb, pause, 종료, snapshot 격리를 검증한다.
- `tests/audio.test.cjs`: Web Audio 미지원 환경, lazy unlock, 음량 제한, 다층 효과음, 음악 중복 방지, mute/suspend 정리를 검증한다.

## GameEngine API 및 동작

`new GameEngine({ random, durationMs, difficulty })`로 생성하고 `start()`, `tick(deltaMs)`, `strike(index)`, `pause()`, `resume()`, `snapshot()`을 사용한다.

- 시작 시 7개 홀을 초기화하고 반드시 일반 얼굴 하나부터 등장시킨다.
- 난이도는 `easy`, `normal`, `hard`만 노출하며 잘못된 값은 `normal`로 정규화한다.
- 얼굴/황금 얼굴/폭탄 확률은 78%/12%/10%다. 동시 노출 대상은 최대 3개다.
- 기본 노출 시간은 1700/1300/1000ms이고 진행도에 따라 짧아지되 650ms 아래로 내려가지 않는다.
- 일반 얼굴과 황금 얼굴은 기본 10/30점이며 5콤보 단위로 최대 4배까지 오른다.
- 폭탄은 생명 1개와 최대 30점을 차감하고, 빈 홀 타격과 놓친 얼굴은 콤보를 끊는다. 놓친 폭탄은 불이익이 없다.
- 맞은 홀은 360ms 동안 `hit` 상태를 유지한다. 이후에도 짧은 재등장 유예를 두어 같은 홀에서 즉시 다시 나타나지 않는다.
- 제한 시간 종료는 `end` 이벤트를 한 번만 반환한다. 폭탄으로 생명이 0이 되면 `strike()`는 계약대로 `bomb` 이벤트 하나를 반환하며, 종료 여부는 바로 뒤 `snapshot().status === 'over'`로 확인한다.
- `snapshot()`은 홀 배열과 객체를 복사해 내부 상태 변경을 막는다.

## GameAudio API 및 동작

`new GameAudio()`는 AudioContext를 만들지 않는다. 사용자 제스처에서 `await unlock()`을 호출한 뒤 `hit()`, `miss()`, `bomb()`, `pop()`, `countdown()`, `startMusic()`, `stopMusic()`, `suspend()`, `resume()`, `end()`, `dispose()`를 사용한다.

- 초기값은 SFX 켜짐, 음악 켜짐, 전체 음량 0.55다.
- SFX와 음악은 독립 gain bus를 사용하고 master compressor/limiter를 거친다.
- 타격음은 낮은 rubber-mallet 성분과 콤보에 따라 높아지는 짧은 squeak를 겹친다. 황금 타격은 밝은 상단 음을 하나 더 쌓는다.
- miss는 band-pass noise와 하강 tone, 폭탄은 제한된 저역 tone 두 층과 low-pass noise를 사용한다.
- 음악은 낮은 gain의 triangle lead와 sine bass로 구성한 8-step loop다. 반복 `startMusic()`/`resume()`은 timer를 중복 생성하지 않는다.
- mute와 suspend는 예약 source를 정리해 나중에 효과음이나 음악이 뒤늦게 재생되지 않게 한다.
- Web Audio가 없거나 unlock 전이면 모든 재생 메서드는 안전하게 아무 동작도 하지 않는다.

## 검증 결과

실행한 명령과 결과:

```text
node --test tests/engine.test.cjs tests/audio.test.cjs
13 tests, 13 pass, 0 fail

node --check engine.js
exit 0

node --check audio.js
exit 0

classic-script VM load
UMD globals OK

100개 seeded 60초 게임 invariant simulation
100 seeded games OK
```

엔진의 핵심 동작과 suspend source 정리는 테스트를 먼저 실패시킨 뒤 구현해 통과시켰다.

## 남은 확인 사항

자동 테스트의 AudioContext는 scheduling 계약을 재현한 fake다. 실제 스피커에서의 음색, 기기별 음량 균형, 모바일 브라우저의 사용자 제스처 unlock은 최종 브라우저 수동 확인이 필요하다.

## 오디오 리뷰 수정 (2026-09-06)

- `unlock()`은 `suspended`뿐 아니라 Safari의 `interrupted` 등 `running`/`closed`가 아닌 상태에서도 `resume()`을 시도한다.
- `resume()` Promise가 정상 완료되어도 실제 상태가 `running`이 아니면 `unlock()`은 `false`를 반환한다.
- `resume()`이 거절되면 사용 가능한 기존 AudioContext를 보존한다. 다음 `unlock()`은 같은 컨텍스트에서 재시도하므로 새 orphan context를 만들지 않는다.
- `suspend()`가 아직 완료되지 않은 상태에서 `resume()`이 호출되면 suspend Promise를 먼저 기다린다. 완료 후 상태를 다시 확인하고 재개한 뒤 음악 loop를 한 번만 구성한다.

회귀 테스트는 네 분기를 각각 재현했다. 수정 직전에는 interrupted resume 미호출, still-suspended 오판, context handle 유실, pending suspend 중 12개 음악 source 중복 생성으로 실패했다. 수정 후 결과:

```text
node --test tests/audio.test.cjs
8 tests, 8 pass, 0 fail
```
