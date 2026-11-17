// Starlight Courier's boot and loop: one canvas, one World, one renderer, one input
// handler, one sound bank. A fixed-step loop keeps the flight identical on any machine;
// ?shot= renders one frozen frame for the screenshots; ?selftest=1 runs the rule checks
// and writes them into the page instead of playing.
import { CANVAS_H, CANVAS_W, STEP } from './config.js';
import { SoundBank } from './audio.js';
import { Input } from './input.js';
import { drawGame } from './render.js';
import { applyShot } from './shots.js';
import { World, Screens } from './world.js';

const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
const sound = new SoundBank();
const world = new World(sound);

function handleAction(action) {
  if (action === 'start') {
    world.screen = Screens.AIM;
  } else if (action === 'next') {
    world.nextLevel();
  } else if (action === 'retry') {
    world.retryLevel();
  } else if (action === 'restart') {
    world.restartGame();
    world.screen = Screens.TITLE;
  } else if (action === 'resume') {
    world.screen = world.ship.launched ? Screens.FLY : Screens.AIM;
  } else if (action === 'title') {
    world.restartGame();
    world.screen = Screens.TITLE;
  } else if (action === 'pause') {
    if (world.screen === Screens.FLY || world.screen === Screens.AIM) {
      world.screen = Screens.PAUSE;
      sound.stopThrust();
    } else if (world.screen === Screens.PAUSE) {
      world.screen = world.ship.launched ? Screens.FLY : Screens.AIM;
    }
  } else if (action === 'mute') {
    sound.setMuted(!sound.muted);
  }
}

const input = new Input(canvas, world, sound, handleAction);
const params = new URLSearchParams(window.location.search);

// Screenshot mode: one deterministic frame, no clock, no loop.
const shot = params.get('shot');
if (shot && applyShot(world, shot)) {
  drawGame(ctx, world, null, sound.muted);
  window.__game = { world, sound, input };
} else if (params.has('selftest')) {
  import('./selftest.js').then(({ runSelfTest }) => {
    const text = runSelfTest();
    const pre = document.getElementById('selftest');
    if (pre) pre.style.display = 'block';
    window.__game = { world, sound, input, selftest: text };
  });
} else {
  let last = performance.now();
  let accumulator = 0;
  function frame(now) {
    const elapsed = Math.min(0.1, (now - last) / 1000);
    last = now;
    accumulator += elapsed;
    while (accumulator >= STEP) {
      world.update(STEP);
      accumulator -= STEP;
    }
    drawGame(ctx, world, input.hover, sound.muted);
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
  window.__game = { world, sound, input };
}
