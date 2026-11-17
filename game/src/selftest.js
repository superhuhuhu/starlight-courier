// A headless self-test (?selftest=1): drives the real World through its rules — launch,
// thrust, shard pickup, delivery, crash, loss and restart — and writes PASS/FAIL lines into
// the page. It uses no browser APIs beyond localStorage (guarded in World), so it runs the
// same in headless Chrome as in a player's browser.
import { findCollision, gravityAt, predictPath, stepBody } from './physics.js';
import { World, Screens } from './world.js';
import { SoundBank } from './audio.js';
import { LEVELS } from './levels.js';

function silentSound() {
  const sound = new SoundBank();
  sound.setMuted(true);
  return sound;
}

export function runSelfTest() {
  const results = [];
  const check = (name, ok, detail = '') => {
    results.push({ name, ok: !!ok, detail });
  };

  try {
    // 1. A fresh world loads level 1 in the aim screen with 3 attempts.
    const w = new World(silentSound());
    check('fresh world loads level 1 in aim', w.screen === Screens.AIM && w.levelIndex === 0, w.screen);
    check('attempts start at 3', w.attemptsLeft === 3, String(w.attemptsLeft));
    check('fuel starts at the level value', w.fuel === LEVELS[0].fuel, String(w.fuel));

    // 2. Gravity is finite and bends a path; the preview returns points.
    const bodies = w.gravityBodies();
    const g = gravityAt(bodies, 640, 200);
    check('gravity is finite', Number.isFinite(g.ax) && Number.isFinite(g.ay), `${g.ax},${g.ay}`);
    const path = predictPath(bodies, 150, 560, 300, -200, 3, 28, 90);
    check('aim preview returns points', path.length > 5, String(path.length));

    // 3. A drag launches the ship into flight.
    w.aim = { x: 60, y: 640 };
    w.launch();
    check('launch enters flight', w.screen === Screens.FLY && w.ship.launched, w.screen);
    check('launch speed is sane', Math.hypot(w.ship.vx, w.ship.vy) > 100, String(Math.hypot(w.ship.vx, w.ship.vy)));

    // 4. Thrust drains fuel.
    const fuelBefore = w.fuel;
    w.thrusting = true;
    w.thrustTarget = { x: w.ship.x + 100, y: w.ship.y };
    for (let i = 0; i < 60; i++) w.stepFlight(1 / 60);
    check('thrust burns fuel', w.fuel < fuelBefore, `${fuelBefore} -> ${w.fuel}`);
    w.thrusting = false;

    // 5. Flying onto a shard collects it.
    const w2 = new World(silentSound());
    const shard = LEVELS[0].shards[0];
    w2.ship.x = shard.x;
    w2.ship.y = shard.y;
    w2.ship.vx = 0;
    w2.ship.vy = 0;
    w2.screen = Screens.FLY;
    w2.stepFlight(1 / 60);
    check('shard collected on contact', w2.shardsGot.has(0), String(w2.shardsGot.size));

    // 6. A gentle touchdown on the target delivers the parcel.
    const w3 = new World(silentSound());
    const target = LEVELS[0].target;
    w3.ship.x = target.x;
    w3.ship.y = target.y - target.radius - 11;
    w3.ship.vx = 0;
    w3.ship.vy = 20;
    w3.screen = Screens.FLY;
    let delivered = false;
    for (let i = 0; i < 120 && w3.screen === Screens.FLY; i++) w3.stepFlight(1 / 60);
    delivered = w3.screen === Screens.LEVEL_COMPLETE;
    check('gentle landing delivers', delivered, w3.screen);
    check('delivery scores 1000+', w3.totalScore >= 1000, String(w3.totalScore));

    // 7. A fast impact on the target crashes and costs an attempt.
    const w4 = new World(silentSound());
    w4.ship.x = target.x;
    w4.ship.y = target.y - target.radius - 11;
    w4.ship.vx = 0;
    w4.ship.vy = 400;
    w4.screen = Screens.FLY;
    w4.stepFlight(1 / 60);
    check('fast impact crashes', w4.attemptsLeft === 2 && w4.screen === Screens.AIM, `${w4.attemptsLeft} ${w4.screen}`);

    // 8. Hitting a planet costs an attempt; three losses end the game.
    const w5 = new World(silentSound());
    const planet = LEVELS[0].planets[0];
    const hit = findCollision(w5.gravityBodies(), planet.x, planet.y);
    check('collision detection finds the planet', hit && hit.kind === 'planet', hit ? hit.kind : 'none');
    w5.ship.x = planet.x;
    w5.ship.y = planet.y;
    w5.screen = Screens.FLY;
    w5.stepFlight(1 / 60);
    check('planet crash costs an attempt', w5.attemptsLeft === 2, String(w5.attemptsLeft));
    w5.ship.x = planet.x;
    w5.ship.y = planet.y;
    w5.screen = Screens.FLY;
    w5.stepFlight(1 / 60);
    w5.ship.x = planet.x;
    w5.ship.y = planet.y;
    w5.screen = Screens.FLY;
    w5.stepFlight(1 / 60);
    check('three losses end the game', w5.screen === Screens.GAME_OVER, w5.screen);

    // 9. Drifting out of bounds loses an attempt.
    const w6 = new World(silentSound());
    w6.ship.x = -200;
    w6.ship.y = 360;
    w6.screen = Screens.FLY;
    w6.stepFlight(1 / 60);
    check('out of bounds loses an attempt', w6.attemptsLeft === 2, String(w6.attemptsLeft));

    // 10. Level flow: complete, next level, restart.
    const w7 = new World(silentSound());
    w7.loadLevel(0);
    w7.screen = Screens.LEVEL_COMPLETE;
    w7.lastBreakdown = { delivery: 1000, timeBonus: 0, fuelBonus: 0, shardBonus: 0, shards: 0, shardsTotal: 3, levelTotal: 1000, levelTime: 10 };
    w7.nextLevel();
    check('next level loads level 2', w7.levelIndex === 1 && w7.screen === Screens.AIM, `${w7.levelIndex} ${w7.screen}`);
    w7.restartGame();
    check('restart resets to level 1 with zero score', w7.levelIndex === 0 && w7.totalScore === 0, `${w7.levelIndex} ${w7.totalScore}`);

    // 11. The physics step moves the ship under gravity.
    const before = { x: 300, y: 300 };
    const after = stepBody(bodies, { x: before.x, y: before.y, vx: 0, vy: 0 });
    check('physics step moves the ship', after.x !== before.x || after.y !== before.y, `${after.x},${after.y}`);
  } catch (err) {
    results.push({ name: 'self-test ran without throwing', ok: false, detail: String(err) });
  }

  const passed = results.filter((r) => r.ok).length;
  const lines = results.map((r) => `${r.ok ? 'PASS' : 'FAIL'} ${r.name}${r.detail ? ' — ' + r.detail : ''}`);
  lines.unshift(`SELFTEST ${passed}/${results.length}`);
  const text = lines.join('\n');
  const pre = document.getElementById('selftest');
  if (pre) pre.textContent = text;
  document.title = `SELFTEST ${passed}/${results.length}`;
  return text;
}
