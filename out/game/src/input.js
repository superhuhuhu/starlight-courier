// Mouse and keyboard for Starlight Courier. Pointer drag aims the slingshot, holding the
// pointer (or arrow keys / WASD) fires the thruster, and clicks hit the buttons render.js
// leaves behind each frame. Keys: Enter/Space start, R restart, P pause, M mute.
import { getButtons } from './render.js';
import { Screens } from './world.js';

export class Input {
  constructor(canvas, world, sound, onAction) {
    this.canvas = canvas;
    this.world = world;
    this.sound = sound;
    this.onAction = onAction;
    this.mouse = { x: 0, y: 0, down: false };
    this.keys = new Set();
    this.hover = null;

    canvas.addEventListener('pointerdown', (e) => this.onPointerDown(e));
    canvas.addEventListener('pointermove', (e) => this.onPointerMove(e));
    canvas.addEventListener('pointerup', (e) => this.onPointerUp(e));
    canvas.addEventListener('pointerleave', () => this.onPointerLeave());
    window.addEventListener('keydown', (e) => this.onKeyDown(e));
    window.addEventListener('keyup', (e) => this.onKeyUp(e));
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  canvasPos(e) {
    const rect = this.canvas.getBoundingClientRect();
    return {
      x: ((e.clientX - rect.left) / rect.width) * this.canvas.width,
      y: ((e.clientY - rect.top) / rect.height) * this.canvas.height,
    };
  }

  buttonAt(x, y) {
    for (const b of getButtons()) {
      if (x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h) return b;
    }
    return null;
  }

  doAction(action) {
    this.sound.unlock();
    this.sound.click();
    this.onAction(action);
  }

  onPointerDown(e) {
    this.sound.unlock();
    const pos = this.canvasPos(e);
    this.mouse.x = pos.x;
    this.mouse.y = pos.y;
    this.mouse.down = true;
    const button = this.buttonAt(pos.x, pos.y);
    if (button) {
      this.doAction(button.action);
      return;
    }
    const world = this.world;
    if (world.screen === Screens.TITLE) {
      world.screen = Screens.AIM;
      return;
    }
    if (world.screen === Screens.AIM) {
      world.aim = pos;
    } else if (world.screen === Screens.FLY) {
      world.thrusting = true;
      world.thrustTarget = pos;
      this.sound.startThrust();
    }
  }

  onPointerMove(e) {
    const pos = this.canvasPos(e);
    this.mouse.x = pos.x;
    this.mouse.y = pos.y;
    const button = this.buttonAt(pos.x, pos.y);
    this.hover = button ? button.action : null;
    const world = this.world;
    if (this.mouse.down && world.screen === Screens.AIM && world.aim) {
      world.aim = pos;
    } else if (this.mouse.down && world.screen === Screens.FLY) {
      world.thrustTarget = pos;
    }
    this.updateKeyboardThrust();
  }

  onPointerUp(e) {
    const pos = this.canvasPos(e);
    this.mouse.down = false;
    const world = this.world;
    if (world.screen === Screens.AIM && world.aim) {
      world.aim = pos;
      world.launch();
    }
    if (world.thrusting) {
      world.thrusting = false;
      this.sound.stopThrust();
    }
    this.updateKeyboardThrust();
  }

  onPointerLeave() {
    this.mouse.down = false;
    const world = this.world;
    if (world.screen === Screens.AIM && world.aim) {
      world.launch();
      world.aim = null;
    }
    if (world.thrusting) {
      world.thrusting = false;
      this.sound.stopThrust();
    }
  }

  onKeyDown(e) {
    if (e.repeat) return;
    this.sound.unlock();
    const key = e.key.toLowerCase();
    this.keys.add(key);
    const world = this.world;
    if (key === 'm') {
      this.sound.setMuted(!this.sound.muted);
      return;
    }
    if (key === 'p' || key === 'escape') {
      if (world.screen === Screens.FLY || world.screen === Screens.AIM) {
        world.screen = Screens.PAUSE;
        this.sound.stopThrust();
      } else if (world.screen === Screens.PAUSE) {
        world.screen = world.ship.launched ? Screens.FLY : Screens.AIM;
      }
      return;
    }
    if (key === 'r') {
      if (world.screen !== Screens.TITLE) {
        world.retryLevel();
        this.sound.click();
      }
      return;
    }
    if (key === 'enter' || key === ' ') {
      e.preventDefault();
      if (world.screen === Screens.TITLE) world.screen = Screens.AIM;
      else if (world.screen === Screens.LEVEL_COMPLETE) world.nextLevel();
      else if (world.screen === Screens.GAME_OVER) world.retryLevel();
      else if (world.screen === Screens.VICTORY) world.restartGame();
      return;
    }
    this.updateKeyboardThrust();
  }

  onKeyUp(e) {
    this.keys.delete(e.key.toLowerCase());
    this.updateKeyboardThrust();
  }

  // Arrow keys / WASD thrust in a direction while flying. Keyboard thrust beats the
  // pointer when both are held; releasing all keys hands control back to the pointer.
  updateKeyboardThrust() {
    const world = this.world;
    if (world.screen !== Screens.FLY) return;
    const dir = { x: 0, y: 0 };
    if (this.keys.has('arrowleft') || this.keys.has('a')) dir.x -= 1;
    if (this.keys.has('arrowright') || this.keys.has('d')) dir.x += 1;
    if (this.keys.has('arrowup') || this.keys.has('w')) dir.y -= 1;
    if (this.keys.has('arrowdown') || this.keys.has('s')) dir.y += 1;
    if (dir.x !== 0 || dir.y !== 0) {
      const len = Math.hypot(dir.x, dir.y);
      world.thrusting = true;
      world.thrustTarget = {
        x: world.ship.x + (dir.x / len) * 100,
        y: world.ship.y + (dir.y / len) * 100,
      };
      this.sound.startThrust();
    } else if (!this.mouse.down) {
      world.thrusting = false;
      this.sound.stopThrust();
    } else {
      world.thrusting = true;
      world.thrustTarget = { x: this.mouse.x, y: this.mouse.y };
      this.sound.startThrust();
    }
  }
}
