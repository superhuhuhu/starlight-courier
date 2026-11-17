// The flight model: gravity from every body, one fixed physics step, circle collisions and
// the same simulation reused to draw the aim preview. Pure functions over plain data, so the
// game, the preview and the self-test all share one truth about how the ship flies.
import { GRAVITY, SHIP_RADIUS, SOFTENING, STEP } from './config.js';

// Every gravity body in a level: { x, y, radius, mass, kind } where kind is 'planet',
// 'target' or 'sun'. Comets are handled by world.js (they move) and passed in as bodies too.
export function gravityAt(bodies, x, y) {
  let ax = 0;
  let ay = 0;
  for (const b of bodies) {
    const dx = b.x - x;
    const dy = b.y - y;
    const dist = Math.hypot(dx, dy);
    if (dist < 1) continue;
    // Softened inverse-square: strong enough to bend a flight, bounded near the surface.
    const pull = (GRAVITY * b.mass) / (dx * dx + dy * dy + SOFTENING * SOFTENING);
    ax += (dx / dist) * pull;
    ay += (dy / dist) * pull;
  }
  return { ax, ay };
}

// Advance one body (the ship) one fixed step. Returns the new position and velocity.
export function stepBody(bodies, body, dt = STEP) {
  const { ax, ay } = gravityAt(bodies, body.x, body.y);
  const vx = body.vx + ax * dt;
  const vy = body.vy + ay * dt;
  return { x: body.x + vx * dt, y: body.y + vy * dt, vx, vy };
}

// The first body the ship would touch along its path, or null. kind is the body's kind,
// speed is the impact speed in px/s.
export function findCollision(bodies, x, y) {
  for (const b of bodies) {
    const dx = x - b.x;
    const dy = y - b.y;
    const r = b.radius + SHIP_RADIUS;
    if (dx * dx + dy * dy < r * r) return b;
  }
  return null;
}

// Simulate the launch from (x, y) with velocity (vx, vy) and return the path as an array of
// {x, y} points, one every few steps, stopping early at a collision or when the ship leaves
// the area. The aim preview draws these dots; the real flight uses the same stepBody.
export function predictPath(bodies, x, y, vx, vy, seconds, dots, bounds) {
  const points = [];
  let px = x;
  let py = y;
  let pvx = vx;
  let pvy = vy;
  const steps = Math.floor(seconds / STEP);
  const every = Math.max(1, Math.floor(steps / dots));
  for (let i = 0; i < steps; i++) {
    const next = stepBody(bodies, { x: px, y: py, vx: pvx, vy: pvy });
    px = next.x;
    py = next.y;
    pvx = next.vx;
    pvy = next.vy;
    if (findCollision(bodies, px, py)) break;
    if (px < -bounds || px > bounds + 1280 || py < -bounds || py > bounds + 720) break;
    if (i % every === 0) points.push({ x: px, y: py });
  }
  return points;
}

// Speed of a body in px/s.
export function speedOf(body) {
  return Math.hypot(body.vx, body.vy);
}
