/**
 * game.js — My Little Computer Science Amateur (GigaPet Edition)
 *
 * Built on top of HW9 io-tomogatchi and comp484-project2 starter code.
 *
 * Architecture:
 *   pet_info        – comp484 required object: name, weight, happiness
 *   AudioSystem     – plays assets/audio/EJ_audio_<key>.mp3 per action
 *   PetState        – stat values (hunger, thirst, energy, mood) + tick/drain
 *   HUD             – syncs stat bars and clock to PetState + pet_info
 *   PetAnimator     – sprite cross-fades, speech bubble, effect overlays
 *   PetWalker       – autonomous roaming + directed walk-to-destination
 *   DragHandler     – pointer drag/drop interaction
 *   ActionSystem    – button → walk → execute; manages cooldowns
 *   AdSystem        – random video ad pop-up with jQuery dblclick() and load()
 *   PixelParticles  – ambient canvas animation (symbols + dots floating up)
 *   Game            – DOMContentLoaded init, main tick loop
 *
 * jQuery unique methods used (comp484 requirement):
 *   1. .dblclick()  — AdSystem.init() — skip button double-click handler
 *   2. .load()      — AdSystem.show() — forces video element to reload new src
 */

'use strict';

// ═══════════════════════════════════════════════════════════════
// comp484 REQUIREMENT: pet_info object with name, weight, happiness
// ═══════════════════════════════════════════════════════════════

// pet_info holds the three core stats required by the spec.
// weight starts at 50 (scale 0-100), happiness starts at 70 (scale 0-100).
var pet_info = {
  name:      "EJ",
  weight:    50,   // 0–100 scale; shown as a bar
  happiness: 70,   // 0–100 scale; shown as a bar
};

// ── Constants ──────────────────────────────────────────────────

const TICK_MS = 3000;

// How much each stat drains per tick
const DRAIN = { hunger: 1.5, thirst: 2.0, energy: 1.0, mood: 0.8 };

// Each action changes PetState stats AND pet_info weight/happiness.
// comp484 spec:
//   treat    → +happiness, +weight
//   exercise → -happiness, -weight  (mapped to workout)
//   play     → +happiness, -weight  (mapped to gaming)
const ACTION_BOOST = {
  eat:     { hunger: +30, mood:  +5,  happiness: +5,  weight: +10  },
  drink:   { thirst: +30, mood:  +5  },
  code:    { mood:   +10, energy: -12 },
  gaming:  { mood:   +25, energy: -8, happiness: +10, weight: -3  }, // play: +happy -weight
  workout: { energy: -20, mood:  +20, hunger: -10,    happiness: +5, weight: -15 }, // exercise
  sleep:   { energy: +40, mood:  +5  },
  scared:  { mood:  -30, energy: -5, happiness: -10  },
  // comp484 new action: TREAT → adds happiness AND weight
  treat:   { mood:   +15, hunger: +5, happiness: +20, weight: +8  },
};

// Sprite states → file paths in assets/sprites/
const SPRITES = {
  idle:    'assets/sprites/EJ_idle.png',
  walk:    'assets/sprites/EJ_walk.png',
  eat:     'assets/sprites/EJ_eat.png',
  drink:   'assets/sprites/EJ_drink.png',
  code:    'assets/sprites/EJ_code.png',
  gaming:  'assets/sprites/EJ_gaming.png',
  workout: 'assets/sprites/EJ_workout.png',
  sleep:   'assets/sprites/EJ_sleep.png',
  sleepy:  'assets/sprites/EJ_sleepy.png',
  scared:  'assets/sprites/EJ_scared.png',
  hungry:  'assets/sprites/EJ_hungry.png',
  thirsty: 'assets/sprites/EJ_thirsty.png',
  pickup:  'assets/sprites/EJ_pickup.png',
  fall:    'assets/sprites/EJ_fall.png',
  ground:  'assets/sprites/EJ_ground.png',
  treat:   'assets/sprites/EJ_eat.png', // reuse eat sprite for treat
};

// Pet's speech lines per action (visual notification — no console.log/alert)
const ACTION_SPEECH = {
  eat:     ["om nom nom", "finally, real food", "Reese's Puffs Reese's Puffs!", "Im so chud coded"],
  drink:   ["cracking a cold one", "caffeine loading...", "I need this", "ooh it burns so good"],
  code:    ["it works??", "undefined :(", "just one more bug", "CTRL+Z CTRL+Z CTRL+Z"],
  gaming:  ["one more game...", "LETS GOOO", "womp womp", "ye have fun in the lobby"],
  workout: ["one more rep!!", "Let that dog out!", "You're such a loser"],
  sleep:   ["*dreams about crashing*", "the demons THE DEMONS!", "zzz zzz zzz"],
  scared:  ["NOT THE JOB APP", "ITS REAL IT CANT HURT ME", "Im just gonna be homeless"],
  treat:   ["OOH CANDY", "sugar rush loading...", "just one more piece", "TREAT TREAT TREAT 🍬"],
  hungry:  ["Momma gimme milk", "I hungy", "bro. FOOD."],
  thirsty: ["*chapped lips smacking*", "Where my Coke ZERO???"],
  sleepy:  ["can't... keep... eyes... open", "just one more minute of scrolling..."],
  idle:    ["...", "staring at the void", "Im not real", "IM SO BROKE", "I have no feelings"],
};

// Cooldown in ms per action
const COOLDOWNS = {
  eat:     4000,
  drink:   4000,
  code:    6000,
  gaming:  5000,
  workout: 8000,
  sleep:   10000,
  scared:  3000,
  treat:   5000,   // treat has a 5-second cooldown so you can't spam candy
};

// ── Audio System ───────────────────────────────────────────────
const AudioSystem = {
  FILES: {
    eat:     'EJ_audio eat',
    drink:   'EJ_audio drink',
    code:    'EJ_audio code',
    gaming:  'EJ_audio gaming',
    workout: 'EJ_audio workout',
    sleep:   'EJ_audio sleep',
    scared:  'EJ_audio JobApp',
    hungry:  'EJ_audio hungry',
    thirsty: 'EJ_audio thirsty',
    sleepy:  'EJ_audio sleepy',
    pickup:  'EJ_audio pickup',
    treat:   'EJ_audio eat',   // reuse eat audio for treat
  },

  play(key) {
    const stem = this.FILES[key];
    if (!stem) return;
    try {
      const audio = new Audio(`assets/audio/${stem}.mp3`);
      audio.volume = 0.6;
      audio.play().catch(() => {}); // silently ignore autoplay policy errors
    } catch (_) {}
  },

  // Play a sound from a specific path (used by AdSystem for catlaugh)
  playPath(path) {
    try {
      const audio = new Audio(path);
      audio.volume = 0.9;
      audio.play().catch(() => {});
    } catch (_) {}
  },
};

// ── Pet State ──────────────────────────────────────────────────
const PetState = {
  hunger: 80, thirst: 80, energy: 80, mood: 80,

  // Apply a deltas object; clamp all values 0–100
  apply(deltas) {
    for (const [k, v] of Object.entries(deltas)) {
      // Handle PetState stats
      if (k in this && k !== 'apply' && k !== 'tick' && k !== 'urgentNeed') {
        this[k] = Math.max(0, Math.min(100, this[k] + v));
      }
      // Handle pet_info stats (weight and happiness)
      if (k === 'weight' || k === 'happiness') {
        // comp484 requirement: fix key bugs — values can't go below zero
        pet_info[k] = Math.max(0, Math.min(100, pet_info[k] + v));
      }
    }
  },

  tick() {
    this.hunger = Math.max(0, this.hunger - DRAIN.hunger);
    this.thirst = Math.max(0, this.thirst - DRAIN.thirst);
    this.energy = Math.max(0, this.energy - DRAIN.energy);
    this.mood   = Math.max(0, this.mood   - DRAIN.mood);
  },

  urgentNeed() {
    if (this.hunger < 20) return 'hungry';
    if (this.thirst < 20) return 'thirsty';
    if (this.energy < 20) return 'sleepy';
    return null;
  },
};

// ── HUD ────────────────────────────────────────────────────────
const HUD = {
  bars: {
    hunger:    document.getElementById('hungerBar'),
    thirst:    document.getElementById('thirstBar'),
    energy:    document.getElementById('energyBar'),
    mood:      document.getElementById('moodBar'),
    weight:    document.getElementById('weightBar'),
    happiness: document.getElementById('happinessBar'),
  },
  blocks: {
    hunger:    document.getElementById('statHunger'),
    thirst:    document.getElementById('statThirst'),
    energy:    document.getElementById('statEnergy'),
    mood:      document.getElementById('statMood'),
    weight:    document.getElementById('statWeight'),
    happiness: document.getElementById('statHappiness'),
  },
  clockEl:   document.getElementById('gameClock'),
  nameEl:    document.getElementById('petNameBadge'),
  startTime: Date.now(),

  update() {
    // Sync PetState bars
    ['hunger','thirst','energy','mood'].forEach(s => {
      const val = PetState[s];
      if (this.bars[s])   this.bars[s].style.width = val + '%';
      if (this.blocks[s]) this.blocks[s].classList.toggle('critical', val < 25);
    });

    // Sync pet_info bars (comp484 requirement)
    if (this.bars.weight)    this.bars.weight.style.width    = pet_info.weight + '%';
    if (this.bars.happiness) this.bars.happiness.style.width = pet_info.happiness + '%';
    if (this.nameEl)         this.nameEl.textContent = pet_info.name;

    // Critical alert if happiness is very low
    if (this.blocks.happiness)
      this.blocks.happiness.classList.toggle('critical', pet_info.happiness < 20);
  },

  tickClock() {
    const e = Math.floor((Date.now() - this.startTime) / 1000);
    const m = Math.floor(e / 60).toString().padStart(2,'0');
    const s = (e % 60).toString().padStart(2,'0');
    if (this.clockEl) this.clockEl.textContent = `${m}:${s}`;
  },
};

// ── Pet Animator ───────────────────────────────────────────────
const PetAnimator = {
  spriteEl:     document.getElementById('petSprite'),
  speechEl:     document.getElementById('gameSpeech'),
  speechTextEl: document.getElementById('gameSpeechText'),
  zzzEl:        document.getElementById('zzzEffect'),
  sweatEl:      document.getElementById('sweatEffect'),
  heartsEl:     document.getElementById('heartsEffect'),
  toastEl:      document.getElementById('toast'),
  currentState: 'idle',
  speechTimer:  null,
  stateTimer:   null,

  setSprite(state) {
    const src = SPRITES[state] || SPRITES.idle;
    if (!this.spriteEl) return;
    this.currentState = state;
    this.spriteEl.style.opacity = '0';
    setTimeout(() => {
      this.spriteEl.src = src;
      this.spriteEl.style.transition = 'opacity 0.25s';
      this.spriteEl.style.opacity    = '1';
    }, 150);
  },

  // Show the speech bubble — comp484 visual notification requirement
  speak(text, duration = 3000) {
    if (!this.speechEl || !this.speechTextEl) return;
    clearTimeout(this.speechTimer);
    this.speechTextEl.textContent = text;
    this._positionSpeechBubble();
    this.speechEl.classList.add('visible');
    this.speechTimer = setTimeout(() => this.speechEl.classList.remove('visible'), duration);
  },

  _positionSpeechBubble() {
    const pet    = document.getElementById('petContainer');
    const world  = document.getElementById('gameWorld');
    const bubble = this.speechEl;
    if (!pet || !world || !bubble) return;
    const pr = pet.getBoundingClientRect();
    const wr = world.getBoundingClientRect();
    bubble.style.left = Math.max(8, Math.min(pr.left - wr.left + pr.width / 2 - 20, wr.width - 200)) + 'px';
    bubble.style.top  = Math.max(8, pr.top - wr.top - 70) + 'px';
  },

  showToast(msg) {
    if (!this.toastEl) return;
    this.toastEl.textContent = msg;
    this.toastEl.classList.add('show');
    setTimeout(() => this.toastEl.classList.remove('show'), 2200);
  },

  playAction(state, duration = 2500) {
    clearTimeout(this.stateTimer);
    this.setSprite(state);
    PetWalker.pause();
    this.stateTimer = setTimeout(() => {
      PetWalker.resume();
      this.autoSprite();
    }, duration);
  },

  autoSprite() {
    if (DragHandler.isDragging) return;
    const need = PetState.urgentNeed();
    if (need === 'hungry')  { this.setSprite('hungry');  return; }
    if (need === 'thirsty') { this.setSprite('thirsty'); return; }
    if (need === 'sleepy')  { this.setSprite('sleepy');  return; }
    this.setSprite(PetWalker.isWalking ? 'walk' : 'idle');
  },

  randomSpeech(category) {
    const lines = ACTION_SPEECH[category] || ACTION_SPEECH.idle;
    return lines[Math.floor(Math.random() * lines.length)];
  },

  showZzz(visible) {
    if (!this.zzzEl) return;
    this._positionEffect(this.zzzEl, -60);
    this.zzzEl.classList.toggle('visible', visible);
  },

  showSweat(visible) {
    if (!this.sweatEl) return;
    this._positionEffect(this.sweatEl, -40);
    this.sweatEl.classList.toggle('visible', visible);
    if (!visible) return;
    setTimeout(() => this.sweatEl.classList.remove('visible'), 2000);
  },

  showHearts() {
    if (!this.heartsEl) return;
    this._positionEffect(this.heartsEl, -50);
    this.heartsEl.classList.remove('visible');
    void this.heartsEl.offsetWidth;
    this.heartsEl.classList.add('visible');
    setTimeout(() => this.heartsEl.classList.remove('visible'), 1600);
  },

  _positionEffect(el, yOffset) {
    const pet   = document.getElementById('petContainer');
    const world = document.getElementById('gameWorld');
    if (!pet || !world || !el) return;
    const pr = pet.getBoundingClientRect();
    const wr = world.getBoundingClientRect();
    el.style.left = (pr.left - wr.left + pr.width / 2 + 10) + 'px';
    el.style.top  = (pr.top  - wr.top  + yOffset) + 'px';
  },
};

// ── Pet Walker ─────────────────────────────────────────────────
const PetWalker = {
  petEl:        document.getElementById('petContainer'),
  worldEl:      document.getElementById('gameWorld'),
  isWalking:    false,
  isPaused:     false,
  targetX:      null,
  currentX:     null,
  walkSpeed:    1.8,
  walkInterval: null,
  walkTimer:    null,
  onArrival:    null,

  init() {
    if (!this.petEl || !this.worldEl) return;
    const b = this._bounds();
    this.currentX = b.min + (b.max - b.min) / 2;
    this._setX(this.currentX);
    this._scheduleNextWalk();
  },

  _bounds() { return { min: 80, max: this.worldEl.clientWidth - 120 }; },

  _setX(x) {
    this.petEl.style.left      = x + 'px';
    this.petEl.style.transform = 'none';
    this.currentX = x;
  },

  _scheduleNextWalk() {
    if (this.isPaused) return;
    this.walkTimer = setTimeout(() => this._startWalk(), 3000 + Math.random() * 5000);
  },

  _startWalk(targetOverride = null) {
    if (this.isPaused || DragHandler.isDragging) {
      if (!targetOverride) this._scheduleNextWalk();
      return;
    }
    const b = this._bounds();
    this.targetX = targetOverride !== null
      ? targetOverride
      : b.min + Math.random() * (b.max - b.min);
    this.isWalking = true;
    this.petEl.classList.toggle('facing-left', this.targetX < this.currentX);
    this.petEl.classList.add('walking');
    PetAnimator.setSprite('walk');
    this._stepLoop();
  },

  _stepLoop() {
    if (this.isPaused || DragHandler.isDragging) { this._stopWalk(false); return; }
    const diff = this.targetX - this.currentX;
    if (Math.abs(diff) < this.walkSpeed + 1) {
      this._setX(this.targetX);
      this._stopWalk(true);
      return;
    }
    this._setX(this.currentX + (diff > 0 ? 1 : -1) * this.walkSpeed);
    this.walkInterval = requestAnimationFrame(() => this._stepLoop());
  },

  _stopWalk(arrived = false) {
    cancelAnimationFrame(this.walkInterval);
    this.isWalking = false;
    this.petEl.classList.remove('walking');
    if (arrived && this.onArrival) {
      const cb = this.onArrival;
      this.onArrival = null;
      cb();
    } else if (!this.isPaused) {
      PetAnimator.autoSprite();
      this._scheduleNextWalk();
    }
  },

  walkTo(targetX, onArrival) {
    clearTimeout(this.walkTimer);
    cancelAnimationFrame(this.walkInterval);
    this.isPaused  = false;
    this.onArrival = onArrival;
    this._startWalk(targetX);
  },

  pause() {
    this.isPaused  = true;
    clearTimeout(this.walkTimer);
    cancelAnimationFrame(this.walkInterval);
    this.isWalking  = false;
    this.onArrival  = null;
    this.petEl.classList.remove('walking');
  },

  resume() {
    this.isPaused  = false;
    this.onArrival = null;
    this._scheduleNextWalk();
  },
};

// ── Drag Handler ───────────────────────────────────────────────
const DragHandler = {
  petEl:      document.getElementById('petContainer'),
  worldEl:    document.getElementById('gameWorld'),
  isDragging: false,
  offsetX:    0,
  offsetY:    0,
  dropBounce: null,

  init() {
    if (!this.petEl) return;
    this.petEl.addEventListener('pointerdown', e => this._onDown(e));
    window.addEventListener('pointermove',    e => this._onMove(e));
    window.addEventListener('pointerup',      e => this._onUp(e));
  },

  _onDown(e) {
    e.preventDefault();
    if (this.dropBounce) return;
    this.isDragging = true;
    PetWalker.pause();
    const r = this.petEl.getBoundingClientRect();
    this.offsetX = e.clientX - r.left  - r.width  / 2;
    this.offsetY = e.clientY - r.top   - r.height / 2;
    this.petEl.classList.add('dragging', 'held');
    PetAnimator.setSprite('pickup');
    AudioSystem.play('pickup');
    PetAnimator.speak("hey! put me down!!");
  },

  _onMove(e) {
    if (!this.isDragging) return;
    const wr = this.worldEl.getBoundingClientRect();
    const pr = this.petEl.getBoundingClientRect();
    let l = (e.clientX - wr.left) - this.offsetX - pr.width  / 2;
    let t = (e.clientY - wr.top)  - this.offsetY - pr.height / 2;
    l = Math.max(0, Math.min(l, wr.width  - pr.width));
    t = Math.max(0, Math.min(t, wr.height - pr.height));
    this.petEl.style.left   = l + 'px';
    this.petEl.style.top    = t + 'px';
    this.petEl.style.bottom = 'auto';
    this.petEl.style.transform = 'none';
    PetWalker.currentX = l;
  },

  _onUp() {
    if (!this.isDragging) return;
    this.isDragging = false;
    this.petEl.classList.remove('dragging', 'held');
    PetAnimator.setSprite('fall');
    PetAnimator.speak("oof", 1800);
    this.dropBounce = setTimeout(() => {
      const l = parseFloat(this.petEl.style.left) || 0;
      this.petEl.style.top    = '';
      this.petEl.style.bottom = '6px';
      this.petEl.style.left   = l + 'px';
      PetWalker.currentX = l;
      PetAnimator.setSprite('ground');
      setTimeout(() => {
        this.dropBounce = null;
        PetAnimator.autoSprite();
        PetWalker.resume();
      }, 800);
    }, 300);
  },
};

// ── Action System ──────────────────────────────────────────────
const ActionSystem = {
  cooldowns: {},

  trigger(action) {
    if (this.cooldowns[action]) return;
    const worldWidth = document.getElementById('gameWorld')?.clientWidth || 800;

    if (action === 'eat' || action === 'treat') {
      PetAnimator.showToast(action === 'treat' ? 'Grabbin food...' : 'Eating...');
      PetWalker.walkTo(Math.round(worldWidth * 0.08), () => this._execute(action));
    } else if (action === 'code' || action === 'gaming') {
      PetAnimator.showToast('WALKING TO PC...');
      PetWalker.walkTo(Math.round(worldWidth * 0.72), () => this._execute(action));
    } else {
      this._execute(action);
    }
  },

  _execute(action) {
    const boost = ACTION_BOOST[action];
    if (boost) PetState.apply(boost); // also updates pet_info via PetState.apply()

    AudioSystem.play(action);

    const line = PetAnimator.randomSpeech(action);
    const durations = {
      eat:3000, drink:3000, code:5000, gaming:5000,
      workout:4000, sleep:5000, scared:3000, treat:3000,
    };
    const dur = durations[action] || 2500;

    PetAnimator.playAction(action, dur);
    // Visual notification — speech bubble (comp484 requirement, no console.log/alert)
    PetAnimator.speak(line, dur - 300);

    if (action === 'sleep')                       PetAnimator.showZzz(true);
    if (action === 'scared')                      PetAnimator.showSweat(true);
    if (action === 'eat' || action === 'drink')   PetAnimator.showHearts();
    if (action === 'treat')                       PetAnimator.showHearts();

    const toasts = {
      eat:     'NOM NOM NOM',
      drink:   'HYDRATED +30',
      code:    'CODING...',
      gaming:  'GAMING SESSION 🎮  MOOD++',
      workout: 'GAINS UNLOCKED 💪',
      sleep:   'RESTING...',
      scared:  'JOB APPLICATION TERROR  MOOD--',
      treat:   'SUGAR RUSH 🍬 +HAPPY +WEIGHT',
    };
    PetAnimator.showToast(toasts[action] || 'OK');

    // Flash the button that triggered this action
    const btnMap = {
      eat:'btnFeed', drink:'btnDrink', code:'btnCode', gaming:'btnGame',
      workout:'btnWorkout', sleep:'btnSleep', scared:'btnScare', treat:'btnTreat',
    };
    const btnEl = document.getElementById(btnMap[action]);
    if (btnEl) {
      btnEl.classList.add('active-glow');
      setTimeout(() => btnEl.classList.remove('active-glow'), 600);
    }

    const cd = COOLDOWNS[action] || 3000;
    this._startCooldown(action, cd, btnEl);
    HUD.update();
  },

  _startCooldown(action, ms, btnEl) {
    if (btnEl) btnEl.classList.add('cooldown');
    this.cooldowns[action] = setTimeout(() => {
      delete this.cooldowns[action];
      if (btnEl) btnEl.classList.remove('cooldown');
    }, ms);
  },
};

// ═══════════════════════════════════════════════════════════════
// AD SYSTEM — Video advertisement pop-up modal
//
// Features:
//   - Pops up every 60–90 seconds (random)
//   - Picks a random video: videos/advertisement_1.mp4 through _5.mp4
//   - Yellow progress bar tracks video duration
//   - Skip button is FAKE — dblclick() on it plays catlaugh instead
//   - Modal closes automatically when video ends
//
// jQuery Methods Used:
//   1. .dblclick()  — binds a double-click event handler to the skip button
//   2. .load()      — forces the <video> element to reload after src change
// ═══════════════════════════════════════════════════════════════
const AdSystem = {
  modalEl: null,
  videoEl: null,
  sourceEl: null,
  timerBarEl: null,
  footerEl: null,
  devBtnEl: null,
  timerRAF: null,
  scheduleTimer: null,
  isShowing: false,
  adIntervalMs: 60000,
  currentVideoNumber: 1,
  pendingAutoplayClick: false,

  init() {
    this.modalEl = document.getElementById('adModal');
    this.videoEl = document.getElementById('adVideo');
    this.sourceEl = document.getElementById('adVideoSource');
    this.timerBarEl = document.getElementById('adTimerBar');
    this.footerEl = document.getElementById('adFooterText');
    this.devBtnEl = document.getElementById('devAdBtn');

    if (!this.modalEl || !this.videoEl || !this.timerBarEl) return;

    this.videoEl.controls = false;
    this.videoEl.disableRemotePlayback = true;
    this.videoEl.defaultMuted = false;
    this.videoEl.muted = false;
    this.videoEl.volume = 1;
    this.videoEl.loop = false;
    this.videoEl.playsInline = true;
    this.videoEl.setAttribute('playsinline', '');
    this.videoEl.setAttribute('webkit-playsinline', '');
    this.videoEl.setAttribute('preload', 'auto');
    this.videoEl.removeAttribute('muted');

    this.videoEl.addEventListener('ended', () => this.hide());
    this.videoEl.addEventListener('loadedmetadata', () => this._updateTimerBar());
    this.videoEl.addEventListener('timeupdate', () => this._updateTimerBar());
    this.videoEl.addEventListener('error', () => {
      if (this.footerEl) {
        this.footerEl.textContent = `Ad video failed to load: videos/advertisement_${this.currentVideoNumber}.mp4`;
      }
    });

    $('#adSkipBtn').dblclick((event) => {
      event.preventDefault();
      this._fakeSkip($(event.currentTarget), 'haha nice try 😹 — get ragebaited');
    });

    $('#adSkipBtn').on('click', (event) => {
      event.preventDefault();
      this._fakeSkip($(event.currentTarget), 'lol nope 😹 — sit there and take it');
    });

    if (this.devBtnEl) {
      this.devBtnEl.addEventListener('click', () => {
        AudioSystem.unlocked = true;
        this.show(true);
      });
    }

    const retryPlaybackAfterInteraction = () => {
      if (!this.pendingAutoplayClick || !this.isShowing) return;
      this.pendingAutoplayClick = false;
      AudioSystem.unlocked = true;
      this._playVideo(true);
    };
    document.addEventListener('pointerdown', retryPlaybackAfterInteraction, true);
    document.addEventListener('keydown', retryPlaybackAfterInteraction, true);

    this._scheduleNext();
  },

  show(fromDevButton = false) {
    if (!this.modalEl || !this.videoEl || !this.timerBarEl) return;

    clearTimeout(this.scheduleTimer);
    cancelAnimationFrame(this.timerRAF);

    this.isShowing = true;
    this.currentVideoNumber = Math.floor(Math.random() * 5) + 1;
    const videoSrc = `videos/advertisement_${this.currentVideoNumber}.mp4`;

    this.timerBarEl.style.width = '0%';
    if (this.footerEl) {
      this.footerEl.textContent = fromDevButton || AudioSystem.unlocked
        ? 'Advertisement — cannot skip'
        : 'Advertisement — get ragebaited';
    }

    this.modalEl.setAttribute('aria-hidden', 'false');
    $(this.modalEl).addClass('ad-visible');

    this.videoEl.pause();
    this.videoEl.currentTime = 0;
    if (this.sourceEl) {
      this.sourceEl.src = videoSrc;
      this.sourceEl.type = 'video/mp4';
    } else {
      this.videoEl.src = videoSrc;
    }
    this.videoEl.defaultMuted = false;
    this.videoEl.muted = false;
    this.videoEl.volume = 1;
    this.videoEl.load(); //loads new video into advertisement system

    this._startTimerBar();
    this._playVideo(fromDevButton);
  },

  _playVideo(forceWithSound = false) {
    if (!this.videoEl) return;

    const canUseSound = forceWithSound || AudioSystem.unlocked;
    this.videoEl.defaultMuted = false;
    this.videoEl.volume = 1;
    this.videoEl.muted = !canUseSound;

    const playPromise = this.videoEl.play();
    if (playPromise && typeof playPromise.catch === 'function') {
      playPromise.then(() => {
        if (canUseSound) this.videoEl.muted = false;
      }).catch(() => {
        if (canUseSound) {
          this.pendingAutoplayClick = true;
          if (this.footerEl) {
            this.footerEl.textContent = 'Browser blocked autoplay with sound. Click anywhere once to continue with audio.';
          }
          return;
        }

        this.videoEl.muted = true;
        this.videoEl.play().catch(() => {
          if (this.footerEl) {
            this.footerEl.textContent = 'Ad is visible, but playback was blocked by the browser.';
          }
        });

        if (this.footerEl) {
          this.footerEl.textContent = 'Advertisement is playing muted until the first page interaction unlocks audio.';
        }
      });
    }
  },

  hide() {
    if (!this.modalEl || !this.videoEl) return;
    this.isShowing = false;
    this.pendingAutoplayClick = false;
    cancelAnimationFrame(this.timerRAF);

    try {
      this.videoEl.pause();
      this.videoEl.currentTime = 0;
    } catch (_) {}

    if (this.sourceEl) {
      this.sourceEl.removeAttribute('src');
    }
    this.videoEl.removeAttribute('src');
    this.videoEl.load();
    this.timerBarEl.style.width = '0%';
    this.modalEl.setAttribute('aria-hidden', 'true');
    $(this.modalEl).removeClass('ad-visible');

    this._scheduleNext();
  },

  _fakeSkip($button, message) {
    AudioSystem.playPath('sound/catlaugh.mp3');
    $button.addClass('skip-shake');
    setTimeout(() => $button.removeClass('skip-shake'), 500);
    if (this.footerEl) this.footerEl.textContent = message;
  },

  _updateTimerBar() {
    if (!this.videoEl || !this.timerBarEl) return;
    const duration = this.videoEl.duration;
    if (!duration || !isFinite(duration) || duration <= 0) return;
    const pct = Math.max(0, Math.min((this.videoEl.currentTime / duration) * 100, 100));
    this.timerBarEl.style.width = pct + '%';
  },

  _startTimerBar() {
    const animate = () => {
      if (!this.isShowing) return;
      this._updateTimerBar();
      this.timerRAF = requestAnimationFrame(animate);
    };
    this.timerRAF = requestAnimationFrame(animate);
  },

  _scheduleNext() {
    clearTimeout(this.scheduleTimer);
    this.scheduleTimer = setTimeout(() => this.show(false), this.adIntervalMs);
  },
};

// ── Pixel Particles ────────────────────────────────────────────
const PixelParticles = {
  canvas: null, ctx: null,
  particles: [], dots: [], animId: null,
  SYMBOLS: ['{}','01','//','()','!=','&&','++','[]','??','/*'],

  init() {
    this.canvas = document.getElementById('pixelCanvas');
    if (!this.canvas) return;
    const resize = () => {
      this.canvas.width  = this.canvas.offsetWidth;
      this.canvas.height = this.canvas.offsetHeight;
    };
    resize();
    window.addEventListener('resize', resize);
    this.ctx = this.canvas.getContext('2d');
    for (let i = 0; i < 18; i++) this.particles.push(this._makeParticle(true));
    for (let i = 0; i < 30; i++) this.dots.push(this._makeDot(true));
    this._frame();
  },

  _makeParticle(initial = false) {
    const c = this.canvas, roll = Math.random();
    return {
      x: Math.random() * c.width,
      y: initial ? Math.random() * c.height : c.height + 10,
      speed: 0.15 + Math.random() * 0.35, drift: (Math.random() - 0.5) * 0.25,
      symbol: this.SYMBOLS[Math.floor(Math.random() * this.SYMBOLS.length)],
      alpha: 0.06 + Math.random() * 0.12, size: 8 + Math.floor(Math.random() * 6),
      color: roll < 0.5 ? '#00e5ff' : roll < 0.85 ? '#39ff14' : '#ff2d78',
      flicker: Math.random() > 0.6, fSpeed: 0.025 + Math.random() * 0.05,
      fPhase: Math.random() * Math.PI * 2,
    };
  },

  _makeDot(initial = false) {
    const c = this.canvas;
    return {
      x: Math.random() * c.width,
      y: initial ? Math.random() * c.height : c.height + 4,
      size: 1 + Math.floor(Math.random() * 3),
      speed: 0.3 + Math.random() * 0.6,
      alpha: 0.04 + Math.random() * 0.1,
      color: Math.random() < 0.6 ? '#00e5ff' : '#39ff14',
    };
  },

  _frame() {
    const { ctx, canvas: c } = this;
    ctx.clearRect(0, 0, c.width, c.height);
    const t = Date.now() * 0.001;

    this.dots.forEach(d => {
      d.y -= d.speed;
      if (d.y < -4) Object.assign(d, this._makeDot());
      ctx.save();
      ctx.globalAlpha = d.alpha;
      ctx.fillStyle   = d.color;
      ctx.fillRect(Math.round(d.x), Math.round(d.y), d.size, d.size);
      ctx.restore();
    });

    this.particles.forEach(p => {
      p.y -= p.speed; p.x += p.drift;
      if (p.y < -20) Object.assign(p, this._makeParticle());
      const alpha = p.flicker
        ? p.alpha * (0.5 + 0.5 * Math.sin(t * p.fSpeed * 60 + p.fPhase))
        : p.alpha;
      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.fillStyle   = p.color;
      ctx.font        = `${p.size}px "Press Start 2P", monospace`;
      ctx.imageSmoothingEnabled = false;
      ctx.fillText(p.symbol, p.x, p.y);
      ctx.restore();
    });

    this.animId = requestAnimationFrame(() => this._frame());
  },
};

// ── Zone Click Handlers ────────────────────────────────────────
function initZoneHandlers() {
  document.getElementById('fridgeZone')?.addEventListener('click', () => {
    if (!ActionSystem.cooldowns['eat']) petAction('eat');
  });
  document.getElementById('pcZone')?.addEventListener('click', () => {
    if (!ActionSystem.cooldowns['gaming'])    petAction('gaming');
    else if (!ActionSystem.cooldowns['code']) petAction('code');
  });
}

// ── Ambient Speech ─────────────────────────────────────────────
const AMBIENT_LINES = [
  "...why no one want me!?", "industry standard", "make it dynamic",
  "chatgpt make me rich money app!", "huh", "Im so stupid",
  "I should buy some car parts", "I miss my gf",
];

function scheduleAmbientSpeech() {
  setTimeout(() => {
    if (!DragHandler.isDragging && PetAnimator.currentState === 'idle') {
      PetAnimator.speak(AMBIENT_LINES[Math.floor(Math.random() * AMBIENT_LINES.length)], 3000);
    }
    scheduleAmbientSpeech();
  }, 12000 + Math.random() * 12000);
}

// ── Main Tick ──────────────────────────────────────────────────
function gameTick() {
  PetState.tick();
  HUD.update();
  if (!DragHandler.isDragging && PetAnimator.currentState === 'idle') PetAnimator.autoSprite();
  if (PetAnimator.currentState !== 'sleep') PetAnimator.showZzz(false);
  const need = PetState.urgentNeed();
  if (need && !PetAnimator.speechEl?.classList.contains('visible')) {
    AudioSystem.play(need);
    PetAnimator.speak(PetAnimator.randomSpeech(need) || 'help...', 3500);
  }
}

// ── Global onclick targets (used by game.html inline attributes) ──
function petAction(action) { ActionSystem.trigger(action); }
function dismissOverlay() {
  document.getElementById('statusOverlay').style.display = 'none';
  PetAnimator.showZzz(false);
  PetAnimator.autoSprite();
  PetWalker.resume();
}

// ── Init ───────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  HUD.update();
  PetWalker.init();
  DragHandler.init();
  PixelParticles.init();
  initZoneHandlers();
  AdSystem.init();   // start the ad system — first ad fires after 60–90s
  setInterval(gameTick,                  TICK_MS);
  setInterval(() => HUD.tickClock(),     1000);
  scheduleAmbientSpeech();
  setTimeout(() => PetAnimator.speak("another day of debugging...", 3500), 1500);
});
