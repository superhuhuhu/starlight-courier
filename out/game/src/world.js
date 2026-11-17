// The game's state and rules: which screen is showing, where the ship is, what it has
// collected, what it has scored, and what happens when it lands, crashes or drifts away.
// Rendering reads this; input writes to it; nothing in here touches the canvas or the DOM.
import {
  ATTEMPTS_PER_LEVEL,
  BOUNDS_MARGIN,
  CANVAS_H,
  CANVAS_W,
  DRAG_TO_SPEED,
  FUEL_BURN_PER_SEC,
  FUEL_MAX,
  LAND_SPEED_BASE,
  MAX_LAUNCH_SPEED,
  SCORE_DELIVERY,
  SCORE_FUEL_PER_UNIT,
  SCORE_SHARD,
  SCORE_TIME_PER_SEC,
  SHIP_RADIUS,
  STEP,
  THRUST_ACCEL,
} from './config.js';
import { findCollision, gravityAt, predictPath, speedOf, stepBody } from './physics.js';
import { LEVELS, LEVEL_COUNT } from './levels.js';

// Screens the game can show.
export const Screens = {
  TITLE: 'title',
  AIM: 'aim',
  FLY: 'fly',
  PAUSE: 'pause',
  LEVEL_COMPLETE: 'levelComplete',
  GAME_OVER: 'gameOver',
  VICTORY: 'victory',
};

const FLIGHT_LIMIT_SEC = 45;

export class World {
  constructor(sound) {
    this.sound = sound;
    this.time = 0;
    this.screen = Screens.TITLE;
    this.levelIndex = 0;
    this.totalScore = 0;
    this.bestScore = 0;
    try {
      this.bestScore = Number(window.localStorage.getItem('starlight-courier-best')) || 0;
    } catch {
      this.bestScore = 0;
    }
    this.particles = [];
    this.message = '';
    this.messageUntil = 0;
    this.lastBreakdown = null;
    this.crashReason = '';
    this.loadLevel(0);
    // First sight is the title screen; loadLevel leaves us in aim.
    this.screen = Screens.TITLE;
  }

  // Bodies that pull the ship: the planets, the target and the sun, if there is one.
  gravityBodies() {
    const level = LEVELS[this.levelIndex];
    const bodies = level.planets.map((p) => ({ ...p, kind: 'planet' }));
    bodies.push({ ...level.target, mass: 1100, kind: 'target' });
    if (level.sun) bodies.push({ ...level.sun, kind: 'sun' });
    return bodies;
  }

  // Where a comet is right now. Comets are hazards, not gravity sources.
  cometAt(comet, t) {
    return {
      x: comet.cx + comet.orbitR * Math.cos(comet.phase + comet.speed * t),
      y: comet.cy + comet.orbitR * 0.62 * Math.sin(comet.phase + comet.speed * t),
      radius: comet.radius,
    };
  }

  loadLevel(index) {
    const level = LEVELS[index];
    this.levelIndex = index;
    this.attemptsLeft = ATTEMPTS_PER_LEVEL;
    this.fuel = level.fuel;
    this.levelTime = 0;
    this.flightTime = 0;
    this.shardsGot = new Set();
    this.trailTimer = 0;
    this.aim = null;
    this.thrusting = false;
    this.ship = {
      x: level.ship.x,
      y: level.ship.y,
      vx: 0,
      vy: 0,
      angle: -Math.PI / 2,
      launched: false,
    };
    this.screen = Screens.AIM;
  }

  // Start over from level 1 with the score cleared.
  restartGame() {
    this.totalScore = 0;
    this.lastBreakdown = null;
    this.loadLevel(0);
  }

  // Retry the current level: attempts and fuel back, score from earlier levels kept.
  retryLevel() {
    this.loadLevel(this.levelIndex);
  }

  nextLevel() {
    if (this.levelIndex + 1 >= LEVEL_COUNT) {
      this.screen = Screens.VICTORY;
      this.saveBest();
      this.sound.win();
      return;
    }
    this.loadLevel(this.levelIndex + 1);
  }

  saveBest() {
    if (this.totalScore > this.bestScore) {
      this.bestScore = this.totalScore;
      try {
        window.localStorage.setItem('starlight-courier-best', String(this.bestScore));
      } catch {
        // Private mode or no storage: the best score simply does not persist.
      }
    }
  }

  showMessage(text, seconds = 2.2) {
    this.message = text;
    this.messageUntil = this.time + seconds;
  }

  // The launch velocity for a drag that ends at (x, y): pull back, fly forward.
  launchVelocity(x, y) {
    let vx = (this.ship.x - x) * DRAG_TO_SPEED;
    let vy = (this.ship.y - y) * DRAG_TO_SPEED;
    const speed = Math.hypot(vx, vy);
    if (speed > MAX_LAUNCH_SPEED) {
      vx = (vx / speed) * MAX_LAUNCH_SPEED;
      vy = (vy / speed) * MAX_LAUNCH_SPEED;
    }
    return { vx, vy };
  }

  // The aim preview points for the current drag, or an empty list.
  aimPreview() {
    if (!this.aim || this.screen !== Screens.AIM) return [];
    const { vx, vy } = this.launchVelocity(this.aim.x, this.aim.y);
    return predictPath(this.gravityBodies(), this.ship.x, this.ship.y, vx, vy, 3, 28, BOUNDS_MARGIN);
  }

  launch() {
    if (!this.aim) return;
    const { vx, vy } = this.launchVelocity(this.aim.x, this.aim.y);
    if (Math.hypot(vx, vy) < 30) return; // A tap is not a launch.
    this.ship.vx = vx;
    this.ship.vy = vy;
    this.ship.launched = true;
    this.screen = Screens.FLY;
    this.flightTime = 0;
    this.aim = null;
    this.sound.launch();
  }

  // One fixed physics step of flight: gravity, thrust, shards, collisions, bounds.
  stepFlight(dt) {
    const level = LEVELS[this.levelIndex];
    const bodies = this.gravityBodies();

    if (this.thrusting && this.fuel > 0 && this.thrustTarget) {
      const dx = this.thrustTarget.x - this.ship.x;
      const dy = this.thrustTarget.y - this.ship.y;
      const dist = Math.hypot(dx, dy);
      if (dist > 4) {
        this.ship.vx += (dx / dist) * THRUST_ACCEL * dt;
        this.ship.vy += (dy / dist) * THRUST_ACCEL * dt;
        this.fuel = Math.max(0, this.fuel - FUEL_BURN_PER_SEC * dt);
        this.emitFlame();
      }
    }

    const next = stepBody(bodies, this.ship, dt);
    this.ship.x = next.x;
    this.ship.y = next.y;
    this.ship.vx = next.vx;
    this.ship.vy = next.vy;
    this.ship.angle = Math.atan2(this.ship.vy, this.ship.vx);
    this.levelTime += dt;
    this.flightTime += dt;
    this.emitTrail(dt);

    // Bonus shards: fly close to one to collect it.
    for (let i = 0; i < level.shards.length; i++) {
      if (this.shardsGot.has(i)) continue;
      const s = level.shards[i];
      if (Math.hypot(this.ship.x - s.x, this.ship.y - s.y) < 26) {
        this.shardsGot.add(i);
        this.sound.pickup();
        this.burst(s.x, s.y, '#ffd98a', 10);
      }
    }

    // Collision with a planet, the target or the sun.
    const hit = findCollision(bodies, this.ship.x, this.ship.y);
    if (hit) {
      if (hit.kind === 'target') {
        if (speedOf(this.ship) <= this.landSpeed()) this.deliver();
        else this.crash('Too fast to land — the pad needs under ' + this.landSpeed() + ' px/s.');
      } else if (hit.kind === 'sun') {
        this.crash('Burned up in the sun.');
      } else {
        this.crash('Crashed into a planet.');
      }
      return;
    }

    // Collision with a comet.
    for (const comet of level.comets) {
      const c = this.cometAt(comet, this.time);
      if (Math.hypot(this.ship.x - c.x, this.ship.y - c.y) < c.radius + SHIP_RADIUS) {
        this.crash('Hit by a comet.');
        return;
      }
    }

    // Drifted out of the system, or flew far too long without landing.
    if (
      this.ship.x < -BOUNDS_MARGIN ||
      this.ship.x > CANVAS_W + BOUNDS_MARGIN ||
      this.ship.y < -BOUNDS_MARGIN ||
      this.ship.y > CANVAS_H + BOUNDS_MARGIN
    ) {
      this.loseAttempt('Lost in deep space.');
      return;
    }
    if (this.flightTime > FLIGHT_LIMIT_SEC) {
      this.loseAttempt('Out of time — the flight drifted too long.');
    }
  }

  landSpeed() {
    const level = LEVELS[this.levelIndex];
    return level.landSpeed ?? LAND_SPEED_BASE;
  }

  deliver() {
    const level = LEVELS[this.levelIndex];
    const timeBonus = Math.max(0, Math.round((level.parTime - this.levelTime) * SCORE_TIME_PER_SEC));
    const fuelBonus = Math.round(this.fuel * SCORE_FUEL_PER_UNIT);
    const shardBonus = this.shardsGot.size * SCORE_SHARD;
    const levelTotal = SCORE_DELIVERY + timeBonus + fuelBonus + shardBonus;
    this.lastBreakdown = {
      delivery: SCORE_DELIVERY,
      timeBonus,
      fuelBonus,
      shardBonus,
      shards: this.shardsGot.size,
      shardsTotal: level.shards.length,
      levelTotal,
      levelTime: this.levelTime,
    };
    this.totalScore += levelTotal;
    this.screen = Screens.LEVEL_COMPLETE;
    this.sound.land();
    this.sound.win();
    this.burst(this.ship.x, this.ship.y, '#4fe3e8', 26);
    this.confetti(this.ship.x, this.ship.y);
  }

  crash(reason) {
    this.explode(this.ship.x, this.ship.y);
    this.sound.crash();
    this.sound.stopThrust();
    this.loseAttempt(reason);
  }

  loseAttempt(reason) {
    this.crashReason = reason;
    this.attemptsLeft -= 1;
    this.thrusting = false;
    this.sound.stopThrust();
    if (this.attemptsLeft > 0) {
      this.showMessage(reason + ' ' + this.attemptsLeft + (this.attemptsLeft === 1 ? ' attempt' : ' attempts') + ' left.', 2.6);
      this.ship.x = LEVELS[this.levelIndex].ship.x;
      this.ship.y = LEVELS[this.levelIndex].ship.y;
      this.ship.vx = 0;
      this.ship.vy = 0;
      this.ship.launched = false;
      this.fuel = LEVELS[this.levelIndex].fuel;
      this.flightTime = 0;
      this.screen = Screens.AIM;
    } else {
      this.screen = Screens.GAME_OVER;
      this.saveBest();
      this.sound.lose();
    }
  }

  // Advance the world by dt seconds. Called with fixed steps from the main loop.
  update(dt) {
    this.time += dt;
    this.updateParticles(dt);
    if (this.screen === Screens.FLY) this.stepFlight(dt);
  }

  // --- Particles -----------------------------------------------------------

  addParticle(p) {
    this.particles.push({ life: p.life, maxLife: p.life, ...p });
    if (this.particles.length > 400) this.particles.splice(0, this.particles.length - 400);
  }

  emitTrail(dt) {
    this.trailTimer -= dt;
    if (this.trailTimer > 0) return;
    this.trailTimer = 0.03;
    this.addParticle({
      x: this.ship.x,
      y: this.ship.y,
      vx: -this.ship.vx * 0.05,
      vy: -this.ship.vy * 0.05,
      size: 3,
      color: '#ffb43a',
      life: 0.5,
    });
  }

  emitFlame() {
    const back = this.ship.angle + Math.PI;
    this.addParticle({
      x: this.ship.x + Math.cos(back) * 12,
      y: this.ship.y + Math.sin(back) * 12,
      vx: Math.cos(back) * 60 + (Math.random() - 0.5) * 30,
      vy: Math.sin(back) * 60 + (Math.random() - 0.5) * 30,
      size: 4,
      color: Math.random() < 0.5 ? '#ff9a3c' : '#ffd23c',
      life: 0.35,
    });
  }

  burst(x, y, color, count) {
    for (let i = 0; i < count; i++) {
      const a = Math.random() * Math.PI * 2;
      const sp = 40 + Math.random() * 160;
      this.addParticle({
        x,
        y,
        vx: Math.cos(a) * sp,
        vy: Math.sin(a) * sp,
        size: 2 + Math.random() * 3,
        color,
        life: 0.5 + Math.random() * 0.5,
      });
    }
  }

  explode(x, y) {
    this.burst(x, y, '#ff6a5e', 30);
    this.burst(x, y, '#ffd98a', 18);
    this.burst(x, y, '#ffffff', 10);
  }

  confetti(x, y) {
    const colors = ['#ffb43a', '#4fe3e8', '#ff6a5e', '#ffd98a', '#8a6fd0'];
    for (let i = 0; i < 40; i++) {
      const a = -Math.PI / 2 + (Math.random() - 0.5) * 2.2;
      const sp = 80 + Math.random() * 220;
      this.addParticle({
        x,
        y,
        vx: Math.cos(a) * sp,
        vy: Math.sin(a) * sp - 60,
        size: 3 + Math.random() * 3,
        color: colors[i % colors.length],
        life: 0.9 + Math.random() * 0.7,
      });
    }
  }

  updateParticles(dt) {
    for (const p of this.particles) {
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vx *= 1 - 0.6 * dt;
      p.vy *= 1 - 0.6 * dt;
      p.life -= dt;
    }
    this.particles = this.particles.filter((p) => p.life > 0);
  }

  // What the HUD and the screens read. One object, no canvas knowledge.
  hud() {
    const level = LEVELS[this.levelIndex];
    return {
      screen: this.screen,
      level: this.levelIndex + 1,
      levelTotal: LEVEL_COUNT,
      levelName: level.name,
      levelSubtitle: level.subtitle,
      hint: level.hint,
      score: this.totalScore,
      bestScore: this.bestScore,
      fuel: this.fuel,
      fuelMax: level.fuel,
      attempts: this.attemptsLeft,
      shardsGot: this.shardsGot.size,
      shardsTotal: level.shards.length,
      time: this.levelTime,
      flightTime: this.flightTime,
      flightLimit: FLIGHT_LIMIT_SEC,
      speed: speedOf(this.ship),
      landSpeed: this.landSpeed(),
      message: this.time < this.messageUntil ? this.message : '',
    };
  }
}
