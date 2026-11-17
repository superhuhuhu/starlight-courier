// Screenshot presets: ?shot=start|play|win|over puts the game into a fixed, readable state
// so the screenshots are real renders of the game's own code, not staged images. The clock
// is frozen in shot mode, so repeated captures are identical.
import { Screens } from './world.js';

// Run the flight forward this many fixed steps to grow a trail behind the ship.
function preflight(world, steps) {
  for (let i = 0; i < steps; i++) world.stepFlight(1 / 60);
}

// In shot mode the clock is frozen, so particles would sit on their spawn point and hide
// behind the ship. Scatter them by hand so the burst reads as a burst.
function scatterParticles(world, seconds) {
  for (const p of world.particles) {
    p.x += p.vx * seconds;
    p.y += p.vy * seconds;
  }
}

export function applyShot(world, shot) {
  if (shot === 'start') {
    world.loadLevel(0);
    world.screen = Screens.TITLE;
    world.time = 8.4;
    return true;
  }
  if (shot === 'play') {
    world.loadLevel(2);
    world.screen = Screens.FLY;
    world.time = 8.4;
    world.totalScore = 1450;
    world.fuel = 62;
    world.levelTime = 23;
    world.flightTime = 8;
    world.shardsGot = new Set([0, 2]);
    // A launch that bends around the sun: from the pad, up and across.
    world.ship.x = 140;
    world.ship.y = 620;
    world.ship.vx = 330;
    world.ship.vy = -250;
    world.ship.launched = true;
    preflight(world, 42);
    world.time = 8.4;
    return true;
  }
  if (shot === 'win') {
    world.loadLevel(2);
    world.screen = Screens.LEVEL_COMPLETE;
    world.time = 8.4;
    world.totalScore = 3140;
    world.fuel = 42;
    world.levelTime = 22;
    world.shardsGot = new Set([0, 2]);
    world.ship.x = 1140;
    world.ship.y = 620;
    world.lastBreakdown = {
      delivery: 1000,
      timeBonus: 180,
      fuelBonus: 210,
      shardBonus: 300,
      shards: 2,
      shardsTotal: 4,
      levelTotal: 1690,
      levelTime: 22,
    };
    world.confetti(world.ship.x, world.ship.y - 40);
    scatterParticles(world, 0.45);
    return true;
  }
  if (shot === 'over') {
    world.loadLevel(3);
    world.screen = Screens.GAME_OVER;
    world.time = 8.4;
    world.totalScore = 1450;
    world.attemptsLeft = 0;
    world.crashReason = 'Crashed into a planet.';
    world.ship.x = 240;
    world.ship.y = 480;
    world.explode(world.ship.x, world.ship.y);
    scatterParticles(world, 0.4);
    return true;
  }
  return false;
}
