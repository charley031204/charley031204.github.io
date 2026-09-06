(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const engine = new GameEngine();
  const audio = new GameAudio();
  const board = $('game');
  const modeNames = { easy: '살살', normal: '보통', hard: '매운맛' };
  const storageKey = 'jongseon-arcade-v1';
  let saved;
  try { saved = JSON.parse(localStorage.getItem(storageKey)) || {}; } catch { saved = {}; }
  if (!saved || typeof saved !== 'object' || Array.isArray(saved)) saved = {};
  const bests = {};
  for (const mode of Object.keys(modeNames)) bests[mode] = Number.isFinite(saved.bests?.[mode]) ? Math.max(0, Math.floor(saved.bests[mode])) : 0;
  const settings = { sfx: saved.sfx !== false, music: saved.music !== false, volume: Number.isFinite(saved.volume) ? Math.max(0, Math.min(100, saved.volume)) : 55 };
  let difficulty = 'normal';
  let counting = false;
  let countdownTimer;
  let messageTimer;
  let lastFrame = 0;
  let lastSecond = 60;
  let ended = false;
  let viewStatus = 'idle';
  let focusBeforeModal;

  const holes = Array.from({ length: 7 }, (_, i) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'burrow';
    button.dataset.index = i;
    button.dataset.phase = 'empty';
    button.dataset.kind = 'face';
    button.setAttribute('aria-label', `${i + 1}번 구멍`);
    button.innerHTML = '<span class="hole-shadow"></span><span class="hole-back"></span><span class="chamber"><span class="creature"><span class="mole-body"></span><span class="face"></span><span class="gold-crown">★</span><span class="paws"></span><span class="bomb"><i></i><b></b></span></span></span><span class="hole-front"></span><span class="hole-number">' + (i + 1) + '</span>';
    button.addEventListener('pointerdown', event => {
      if (event.button !== 0) return;
      event.preventDefault();
      strike(i, event.clientX, event.clientY);
    });
    button.addEventListener('click', event => {
      if (event.detail === 0) strike(i);
    });
    $('holes').append(button);
    return button;
  });

  function persist() {
    try { localStorage.setItem(storageKey, JSON.stringify({ bests, ...settings })); } catch { /* Private browsing may disable storage. */ }
  }

  function applyAudioSettings() {
    $('sfx-toggle').checked = settings.sfx;
    $('music-toggle').checked = settings.music;
    $('volume').value = settings.volume;
    $('volume-value').value = `${settings.volume}%`;
    audio.setSfxEnabled(settings.sfx);
    audio.setMusicEnabled(settings.music);
    audio.setVolume(settings.volume / 100);
  }

  function setOverlay(id) {
    for (const key of ['start-overlay', 'pause-overlay', 'result-overlay', 'count-overlay']) $(key).hidden = key !== id;
    const modal = id === 'pause-overlay' || id === 'result-overlay';
    $('holes').inert = id !== null;
    $('pause-button').disabled = id !== null;
    if (modal) {
      focusBeforeModal = document.activeElement;
      $(id === 'pause-overlay' ? 'resume-button' : 'again-button').focus({ preventScroll: true });
    }
  }

  function updateBest() {
    $('best-score').textContent = bests[difficulty];
    $('best-mode').textContent = modeNames[difficulty];
    $('mode-label').textContent = `${modeNames[difficulty]} 난이도`;
  }

  function ready() {
    clearTimeout(countdownTimer);
    counting = false;
    viewStatus = 'idle';
    board.dataset.status = 'idle';
    audio.stopMusic();
    $('score').textContent = '0';
    $('combo').hidden = true;
    $('time').innerHTML = '60<small>초</small>';
    $('timer-caption').textContent = '한 판은 60초';
    document.querySelector('.timer-block').classList.remove('urgent');
    [...$('lives').children].forEach(heart => heart.classList.remove('lost'));
    $('lives').setAttribute('aria-label', '남은 기회 3개');
    holes.forEach((hole, i) => {
      hole.dataset.phase = 'empty';
      hole.dataset.kind = i === 6 ? 'golden' : 'face';
      hole.classList.toggle('demo', i === 0 || i === 6);
      hole.setAttribute('aria-label', `${i + 1}번 구멍`);
    });
    $('effects').replaceChildren();
    setOverlay('start-overlay');
    updateBest();
  }

  function showMessage(text, ms = 1300) {
    clearTimeout(messageTimer);
    $('board-message').textContent = text;
    $('board-message').classList.add('visible');
    messageTimer = setTimeout(() => $('board-message').classList.remove('visible'), ms);
  }

  async function begin() {
    if (counting) return;
    counting = true;
    ended = false;
    viewStatus = 'countdown';
    board.dataset.status = 'countdown';
    $('sound-panel').hidden = true;
    $('sound-button').setAttribute('aria-expanded', 'false');
    $('effects').replaceChildren();
    holes.forEach(hole => { hole.classList.remove('demo'); hole.dataset.phase = 'empty'; });
    $('score').textContent = '0';
    $('combo').hidden = true;
    $('time').innerHTML = '60<small>초</small>';
    document.querySelector('.timer-block').classList.remove('urgent');
    [...$('lives').children].forEach(heart => heart.classList.remove('lost'));
    setOverlay('count-overlay');
    audio.unlock().catch(() => false);
    audio.resume();
    let count = 3;
    const step = () => {
      if (!counting) return;
      if (count > 0) {
        $('count-label').textContent = count;
        $('count-label').style.animation = 'none';
        void $('count-label').offsetWidth;
        $('count-label').style.animation = '';
        audio.countdown(count);
        $('announcer').textContent = `${count}`;
        count -= 1;
        countdownTimer = setTimeout(step, 760);
      } else {
        counting = false;
        engine.start(difficulty);
        lastFrame = performance.now();
        lastSecond = 60;
        viewStatus = 'playing';
        setOverlay(null);
        render();
        audio.countdown(0);
        audio.startMusic();
        $('pause-button').focus({ preventScroll: true });
        $('announcer').textContent = '시작! 숫자키 1부터 7 또는 얼굴을 눌러 잡으세요.';
        showMessage('종선이를 잡아라!', 950);
      }
    };
    step();
  }

  function render() {
    const state = engine.snapshot();
    board.dataset.status = state.status;
    $('score').textContent = state.score;
    const seconds = Math.ceil(state.remainingMs / 1000);
    $('time').innerHTML = `${seconds}<small>초</small>`;
    $('timer-caption').textContent = seconds <= 10 ? '마지막 스퍼트!' : '남은 시간';
    document.querySelector('.timer-block').classList.toggle('urgent', seconds <= 10 && state.status === 'playing');
    if (seconds !== lastSecond && seconds <= 10 && seconds > 0 && state.status === 'playing') audio.countdown(seconds);
    lastSecond = seconds;
    $('combo').hidden = state.combo < 2;
    $('combo').textContent = `${state.combo} COMBO${state.combo > 5 ? ' ×' + Math.min(4, 1 + Math.floor((state.combo - 1) / 5)) : ''}`;
    [...$('lives').children].forEach((heart, i) => heart.classList.toggle('lost', i >= state.lives));
    $('lives').setAttribute('aria-label', `남은 기회 ${state.lives}개`);
    state.holes.forEach((hole, i) => {
      holes[i].dataset.phase = hole.phase;
      holes[i].dataset.kind = hole.kind;
      holes[i].setAttribute('aria-label', `${i + 1}번 ${hole.phase === 'up' ? (hole.kind === 'bomb' ? '폭탄, 피하세요' : hole.kind === 'golden' ? '황금 종선이' : '종선이') : '구멍'}`);
    });
    if (state.status === 'over' && !ended) finish(state);
  }

  function strike(index, clientX, clientY) {
    if (viewStatus !== 'playing' || engine.snapshot().status !== 'playing') return;
    const result = engine.strike(index);
    if (result.type === 'ignored') return;
    const rect = board.getBoundingClientRect();
    const holeRect = holes[index].getBoundingClientRect();
    const x = Number.isFinite(clientX) ? clientX - rect.left : holeRect.left - rect.left + holeRect.width / 2;
    const y = Number.isFinite(clientY) ? clientY - rect.top : holeRect.top - rect.top + holeRect.height * .42;
    effect('img', 'impact-mallet', '', x, y, 330).src = 'assets/hammer.svg';
    if (result.type === 'hit') {
      const state = engine.snapshot();
      const golden = result.kind === 'golden' || state.holes[index].kind === 'golden';
      audio.hit(state.combo, golden);
      effect('span', 'float-score', `+${result.points}`, x, y - 12);
      for (let i = 0; i < 5; i++) {
        const star = effect('span', 'hit-star', i % 2 ? '✦' : '★', x, y - 20, 650);
        const angle = (i / 5) * Math.PI * 2;
        star.style.setProperty('--dx', `${Math.cos(angle) * 54}px`);
        star.style.setProperty('--dy', `${Math.sin(angle) * 45 - 10}px`);
      }
      if (state.combo % 5 === 0) showMessage(`${state.combo}연타! 손이 안 보이는데요?`);
      if (navigator.vibrate && window.matchMedia('(pointer: coarse)').matches) navigator.vibrate(18);
    } else if (result.type === 'bomb') {
      audio.bomb();
      effect('span', 'float-score bad', '앗! −30', x, y - 10);
      board.classList.remove('shake');
      void board.offsetWidth;
      board.classList.add('shake');
      showMessage('폭탄은 피해요! ♥ −1');
      setTimeout(() => board.classList.remove('shake'), 350);
      if (navigator.vibrate && window.matchMedia('(pointer: coarse)').matches) navigator.vibrate([30, 30, 40]);
    } else {
      audio.miss();
      effect('span', 'float-score miss', '헛스윙!', x, y);
    }
    render();
  }

  function effect(tag, className, text, x, y, lifetime = 850) {
    const el = document.createElement(tag);
    el.className = className;
    if (text) el.textContent = text;
    el.style.left = `${x}px`;
    el.style.top = `${y}px`;
    $('effects').append(el);
    setTimeout(() => el.remove(), lifetime);
    return el;
  }

  function pause() {
    if (viewStatus !== 'playing') return;
    engine.pause();
    viewStatus = 'paused';
    audio.suspend();
    render();
    setOverlay('pause-overlay');
    $('announcer').textContent = '일시정지';
  }

  function resume() {
    if (viewStatus !== 'paused') return;
    audio.unlock().catch(() => false);
    audio.resume();
    engine.resume();
    lastFrame = performance.now();
    viewStatus = 'playing';
    setOverlay(null);
    render();
    if (focusBeforeModal instanceof HTMLElement && !focusBeforeModal.closest('[hidden]')) focusBeforeModal.focus({ preventScroll: true });
    else $('pause-button').focus({ preventScroll: true });
    $('announcer').textContent = '다시 시작';
  }

  function finish(state) {
    ended = true;
    viewStatus = 'over';
    audio.stopMusic();
    audio.end(state.score);
    const record = state.score > bests[difficulty];
    if (record) { bests[difficulty] = state.score; persist(); }
    updateBest();
    $('result-kicker').textContent = record ? '★ 새로운 최고 기록!' : state.lives === 0 ? '폭탄에 당했어요!' : '60초, 한 판 끝!';
    $('result-title').textContent = state.score >= 600 ? '종선이 잡기 장인이네요!' : state.score >= 200 ? '손맛 좀 보셨나요?' : '몸풀기는 여기까지!';
    $('result-score').textContent = state.score;
    $('result-combo').textContent = state.bestCombo;
    const total = state.hits + state.misses + state.bombHits;
    $('result-accuracy').textContent = `${total ? Math.round(state.hits / total * 100) : 0}%`;
    $('result-hits').textContent = state.hits;
    $('result-comment').textContent = record ? '오늘의 나, 어제의 나를 이겼다!' : '종선이가 다음 판을 기다리고 있어요.';
    setOverlay('result-overlay');
    $('announcer').textContent = `게임 끝. ${state.score}점, 최대 ${state.bestCombo}콤보.${record ? ' 새로운 최고 기록입니다.' : ''}`;
  }

  function frame(now) {
    if (viewStatus === 'playing') {
      const events = engine.tick(Math.max(0, now - lastFrame));
      for (const event of events) if (event.type === 'spawn') audio.pop();
      render();
    }
    lastFrame = now;
    requestAnimationFrame(frame);
  }

  $('start-button').addEventListener('click', begin);
  $('again-button').addEventListener('click', begin);
  $('restart-button').addEventListener('click', begin);
  $('menu-button').addEventListener('click', () => { ready(); $('start-button').focus({ preventScroll: true }); });
  $('pause-button').addEventListener('click', pause);
  $('resume-button').addEventListener('click', resume);
  document.querySelectorAll('input[name=difficulty]').forEach(input => input.addEventListener('change', () => {
    difficulty = input.value;
    updateBest();
  }));
  $('sound-button').addEventListener('click', () => {
    $('sound-panel').hidden = !$('sound-panel').hidden;
    $('sound-button').setAttribute('aria-expanded', String(!$('sound-panel').hidden));
  });
  document.addEventListener('pointerdown', event => {
    if (!$('sound-panel').hidden && !event.target.closest('#sound-panel, #sound-button')) {
      $('sound-panel').hidden = true;
      $('sound-button').setAttribute('aria-expanded', 'false');
    }
  });
  $('sfx-toggle').addEventListener('change', event => { settings.sfx = event.target.checked; applyAudioSettings(); persist(); });
  $('music-toggle').addEventListener('change', event => { settings.music = event.target.checked; applyAudioSettings(); persist(); });
  $('volume').addEventListener('input', event => { settings.volume = Number(event.target.value); applyAudioSettings(); persist(); });

  document.addEventListener('keydown', event => {
    const modal = !$('pause-overlay').hidden ? $('pause-overlay') : !$('result-overlay').hidden ? $('result-overlay') : null;
    if (event.key === 'Tab' && modal) {
      const buttons = [...modal.querySelectorAll('button')];
      const first = buttons[0];
      const last = buttons[buttons.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
      return;
    }
    if (event.repeat || event.ctrlKey || event.altKey || event.metaKey) return;
    if (event.key === 'Escape' && !$('sound-panel').hidden) {
      event.preventDefault();
      $('sound-panel').hidden = true;
      $('sound-button').setAttribute('aria-expanded', 'false');
      $('sound-button').focus();
      return;
    }
    if (event.target.closest('input,select,textarea')) return;
    if (/^[1-7]$/.test(event.key) && viewStatus === 'playing') {
      event.preventDefault();
      strike(Number(event.key) - 1);
    } else if (event.key.toLowerCase() === 'p' || event.key === 'Escape') {
      if (!$('sound-panel').hidden) {
        $('sound-panel').hidden = true;
        $('sound-button').setAttribute('aria-expanded', 'false');
        $('sound-button').focus();
      } else if (viewStatus === 'playing') { event.preventDefault(); pause(); }
      else if (viewStatus === 'paused') { event.preventDefault(); resume(); }
    }
  });

  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) return;
    if (counting) { clearTimeout(countdownTimer); ready(); }
    else pause();
    audio.suspend();
  });
  window.addEventListener('pagehide', event => {
    if (event.persisted) audio.suspend();
    else audio.dispose();
  });
  applyAudioSettings();
  ready();
  requestAnimationFrame(frame);
})();
