// Everything the player sees, drawn on one canvas: the starfield, the planets, the ship,
// the particles, the HUD and every screen. It reads the World and never changes it, except
// for the button list it leaves behind for input.js to hit-test.
import { CANVAS_H, CANVAS_W, HUD_H, PALETTE } from './config.js';
import { LEVELS } from './levels.js';
import { makeRng, range } from './random.js';
import { Screens } from './world.js';

// The buttons drawn on the last frame: { x, y, w, h, label, action }.
let currentButtons = [];
export function getButtons() {
  return currentButtons;
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function drawButton(ctx, x, y, w, h, label, action, hover) {
  ctx.fillStyle = hover ? PALETTE.buttonHover : PALETTE.button;
  roundRect(ctx, x, y, w, h, 10);
  ctx.fill();
  ctx.strokeStyle = PALETTE.panelBorder;
  ctx.lineWidth = 1.5;
  ctx.stroke();
  ctx.fillStyle = PALETTE.hudText;
  ctx.font = '600 17px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(label, x + w / 2, y + h / 2 + 1);
  currentButtons.push({ x, y, w, h, label, action });
}

function drawPanel(ctx, x, y, w, h, title) {
  ctx.fillStyle = PALETTE.panel;
  roundRect(ctx, x, y, w, h, 16);
  ctx.fill();
  ctx.strokeStyle = PALETTE.panelBorder;
  ctx.lineWidth = 2;
  ctx.stroke();
  if (title) {
    ctx.fillStyle = PALETTE.amber;
    ctx.font = '700 30px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(title, x + w / 2, y + 52);
  }
}

// A starfield and nebula blobs, seeded per level so the sky never changes mid-level.
function starfield(levelIndex) {
  const rng = makeRng(1000 + levelIndex * 77);
  const stars = [];
  for (let i = 0; i < 150; i++) {
    stars.push({ x: rng() * CANVAS_W, y: rng() * CANVAS_H, r: range(rng, 0.5, 1.8), p: rng() * Math.PI * 2 });
  }
  const nebulae = [];
  for (let i = 0; i < 3; i++) {
    nebulae.push({
      x: rng() * CANVAS_W,
      y: rng() * CANVAS_H,
      r: range(rng, 180, 320),
      color: ['rgba(90, 70, 180, 0.10)', 'rgba(40, 120, 160, 0.10)', 'rgba(180, 90, 120, 0.08)'][i],
    });
  }
  return { stars, nebulae };
}
const starfields = new Map();
function getStarfield(levelIndex) {
  if (!starfields.has(levelIndex)) starfields.set(levelIndex, starfield(levelIndex));
  return starfields.get(levelIndex);
}

function drawBackground(ctx, world) {
  const grad = ctx.createLinearGradient(0, 0, 0, CANVAS_H);
  grad.addColorStop(0, PALETTE.skyTop);
  grad.addColorStop(1, PALETTE.skyBottom);
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);
  const { stars, nebulae } = getStarfield(world.levelIndex);
  for (const n of nebulae) {
    const g = ctx.createRadialGradient(n.x, n.y, 0, n.x, n.y, n.r);
    g.addColorStop(0, n.color);
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g;
    ctx.fillRect(n.x - n.r, n.y - n.r, n.r * 2, n.r * 2);
  }
  for (const s of stars) {
    const twinkle = 0.55 + 0.45 * Math.sin(world.time * 1.6 + s.p);
    ctx.globalAlpha = twinkle;
    ctx.fillStyle = PALETTE.star;
    ctx.beginPath();
    ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
}

function drawPlanet(ctx, p) {
  ctx.save();
  ctx.shadowColor = p.color;
  ctx.shadowBlur = 18;
  const g = ctx.createRadialGradient(p.x - p.radius * 0.35, p.y - p.radius * 0.35, p.radius * 0.1, p.x, p.y, p.radius);
  g.addColorStop(0, p.color);
  g.addColorStop(1, '#10142a');
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
  // Craters: darker patches on the lit side.
  ctx.fillStyle = 'rgba(0,0,0,0.18)';
  const craters = [
    [p.x - p.radius * 0.3, p.y - p.radius * 0.1, p.radius * 0.22],
    [p.x + p.radius * 0.25, p.y + p.radius * 0.3, p.radius * 0.16],
    [p.x + p.radius * 0.1, p.y - p.radius * 0.4, p.radius * 0.12],
  ];
  for (const [cx, cy, cr] of craters) {
    ctx.beginPath();
    ctx.arc(cx, cy, cr, 0, Math.PI * 2);
    ctx.fill();
  }
  if (p.ring) {
    ctx.strokeStyle = 'rgba(238, 242, 255, 0.5)';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.ellipse(p.x, p.y, p.radius * 1.55, p.radius * 0.42, -0.35, 0, Math.PI * 2);
    ctx.stroke();
  }
}

function drawSun(ctx, sun, time) {
  const pulse = 1 + 0.04 * Math.sin(time * 2);
  const r = sun.radius * pulse;
  const g = ctx.createRadialGradient(sun.x, sun.y, 0, sun.x, sun.y, r * 2.4);
  g.addColorStop(0, 'rgba(255, 214, 110, 0.55)');
  g.addColorStop(0.5, 'rgba(255, 150, 60, 0.18)');
  g.addColorStop(1, 'rgba(255, 150, 60, 0)');
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(sun.x, sun.y, r * 2.4, 0, Math.PI * 2);
  ctx.fill();
  const core = ctx.createRadialGradient(sun.x - r * 0.2, sun.y - r * 0.2, 0, sun.x, sun.y, r);
  core.addColorStop(0, '#fff7d6');
  core.addColorStop(0.6, '#ffd66e');
  core.addColorStop(1, '#ff9a3c');
  ctx.fillStyle = core;
  ctx.beginPath();
  ctx.arc(sun.x, sun.y, r, 0, Math.PI * 2);
  ctx.fill();
}

function drawTargetBeacon(ctx, target, time) {
  const pulse = 0.5 + 0.5 * Math.sin(time * 3);
  ctx.strokeStyle = `rgba(79, 227, 232, ${0.45 + 0.4 * pulse})`;
  ctx.lineWidth = 2;
  ctx.setLineDash([8, 8]);
  ctx.beginPath();
  ctx.arc(target.x, target.y, target.radius + 14 + pulse * 6, 0, Math.PI * 2);
  ctx.stroke();
  ctx.setLineDash([]);
  // A small beacon diamond above the pad.
  const by = target.y - target.radius - 26 + Math.sin(time * 2) * 3;
  ctx.fillStyle = PALETTE.cyan;
  ctx.beginPath();
  ctx.moveTo(target.x, by - 8);
  ctx.lineTo(target.x + 7, by);
  ctx.lineTo(target.x, by + 8);
  ctx.lineTo(target.x - 7, by);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = PALETTE.cyan;
  ctx.font = '700 13px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('DELIVER · ' + target.name.toUpperCase(), target.x, target.y + target.radius + 26);
}

function drawComet(ctx, world, comet) {
  const pos = world.cometAt(comet, world.time);
  const angle = Math.atan2(
    Math.cos(comet.phase + comet.speed * world.time) * -comet.speed * comet.orbitR,
    Math.sin(comet.phase + comet.speed * world.time) * -comet.speed * comet.orbitR * 0.62,
  );
  ctx.save();
  ctx.translate(pos.x, pos.y);
  ctx.rotate(angle);
  const tail = ctx.createLinearGradient(0, 0, -70, 0);
  tail.addColorStop(0, 'rgba(255, 190, 120, 0.7)');
  tail.addColorStop(1, 'rgba(255, 190, 120, 0)');
  ctx.fillStyle = tail;
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.lineTo(-70, -7);
  ctx.lineTo(-70, 7);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
  const g = ctx.createRadialGradient(pos.x, pos.y, 0, pos.x, pos.y, comet.radius + 6);
  g.addColorStop(0, '#ffe9c4');
  g.addColorStop(0.5, '#ff9a3c');
  g.addColorStop(1, 'rgba(255, 106, 94, 0)');
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(pos.x, pos.y, comet.radius + 6, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#fff3d6';
  ctx.beginPath();
  ctx.arc(pos.x, pos.y, comet.radius * 0.7, 0, Math.PI * 2);
  ctx.fill();
}

function drawShard(ctx, s, time) {
  const bob = Math.sin(time * 2 + s.x) * 3;
  const size = 9 + Math.sin(time * 3 + s.y) * 1.5;
  ctx.save();
  ctx.translate(s.x, s.y + bob);
  ctx.rotate(Math.PI / 4);
  ctx.shadowColor = PALETTE.amber;
  ctx.shadowBlur = 12;
  ctx.fillStyle = PALETTE.amber;
  ctx.fillRect(-size / 2, -size / 2, size, size);
  ctx.restore();
  ctx.fillStyle = '#fff3d6';
  ctx.beginPath();
  ctx.arc(s.x, s.y + bob, 2.5, 0, Math.PI * 2);
  ctx.fill();
}

function drawShip(ctx, world) {
  const ship = world.ship;
  ctx.save();
  ctx.translate(ship.x, ship.y);
  ctx.rotate(ship.angle);
  if (world.thrusting && world.screen === Screens.FLY) {
    const flick = 8 + Math.random() * 8;
    const flame = ctx.createLinearGradient(-10, 0, -10 - flick - 10, 0);
    flame.addColorStop(0, '#ffd23c');
    flame.addColorStop(1, 'rgba(255, 106, 94, 0)');
    ctx.fillStyle = flame;
    ctx.beginPath();
    ctx.moveTo(-9, 4);
    ctx.lineTo(-10 - flick - 10, 0);
    ctx.lineTo(-9, -4);
    ctx.closePath();
    ctx.fill();
  }
  ctx.shadowColor = PALETTE.amber;
  ctx.shadowBlur = 10;
  const hull = ctx.createLinearGradient(-12, 0, 16, 0);
  hull.addColorStop(0, '#c77f1a');
  hull.addColorStop(1, '#ffd98a');
  ctx.fillStyle = hull;
  ctx.beginPath();
  ctx.moveTo(16, 0);
  ctx.lineTo(-10, 8);
  ctx.lineTo(-5, 0);
  ctx.lineTo(-10, -8);
  ctx.closePath();
  ctx.fill();
  ctx.shadowBlur = 0;
  ctx.fillStyle = PALETTE.cyan;
  ctx.beginPath();
  ctx.arc(5, 0, 3.2, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function drawParticles(ctx, world) {
  for (const p of world.particles) {
    ctx.globalAlpha = Math.max(0, p.life / p.maxLife);
    ctx.fillStyle = p.color;
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
}

function drawTrajectory(ctx, points) {
  if (points.length < 2) return;
  for (let i = 0; i < points.length; i++) {
    const alpha = 0.85 * (1 - i / points.length);
    ctx.fillStyle = `rgba(79, 227, 232, ${alpha.toFixed(2)})`;
    ctx.beginPath();
    ctx.arc(points[i].x, points[i].y, i === 0 ? 4 : 3, 0, Math.PI * 2);
    ctx.fill();
  }
}

function drawAim(ctx, world) {
  if (!world.aim) return;
  const { vx, vy } = world.launchVelocity(world.aim.x, world.aim.y);
  const speed = Math.hypot(vx, vy);
  const power = Math.min(1, speed / 620);
  // Launch arrow from the ship.
  const angle = Math.atan2(vy, vx);
  const ax = world.ship.x + Math.cos(angle) * 34;
  const ay = world.ship.y + Math.sin(angle) * 34;
  ctx.strokeStyle = PALETTE.cyan;
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(world.ship.x, world.ship.y);
  ctx.lineTo(ax, ay);
  ctx.stroke();
  ctx.fillStyle = PALETTE.cyan;
  ctx.beginPath();
  ctx.moveTo(ax + Math.cos(angle) * 12, ay + Math.sin(angle) * 12);
  ctx.lineTo(ax + Math.cos(angle + 2.6) * 10, ay + Math.sin(angle + 2.6) * 10);
  ctx.lineTo(ax + Math.cos(angle - 2.6) * 10, ay + Math.sin(angle - 2.6) * 10);
  ctx.closePath();
  ctx.fill();
  // Power bar above the ship.
  const bw = 90;
  const bx = world.ship.x - bw / 2;
  const by = world.ship.y - 44;
  ctx.fillStyle = 'rgba(10, 16, 44, 0.8)';
  ctx.fillRect(bx - 2, by - 2, bw + 4, 12);
  ctx.fillStyle = power > 0.85 ? PALETTE.coral : PALETTE.amber;
  ctx.fillRect(bx, by, bw * power, 8);
  drawTrajectory(ctx, world.aimPreview());
}

function drawHud(ctx, world, hover, muted) {
  const hud = world.hud();
  ctx.fillStyle = 'rgba(6, 9, 26, 0.72)';
  ctx.fillRect(0, 0, CANVAS_W, HUD_H);
  ctx.strokeStyle = 'rgba(58, 74, 138, 0.6)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(0, HUD_H - 0.5);
  ctx.lineTo(CANVAS_W, HUD_H - 0.5);
  ctx.stroke();
  ctx.textBaseline = 'middle';
  ctx.textAlign = 'left';
  ctx.fillStyle = PALETTE.hudText;
  ctx.font = '700 17px system-ui, sans-serif';
  ctx.fillText(`LEVEL ${hud.level}/${hud.levelTotal} · ${hud.levelName}`, 18, HUD_H / 2);
  ctx.font = '600 15px system-ui, sans-serif';
  ctx.fillStyle = PALETTE.amber;
  ctx.fillText(`SCORE ${hud.score}`, 330, HUD_H / 2);
  ctx.fillStyle = PALETTE.hudDim;
  ctx.fillText(`BEST ${hud.bestScore}`, 470, HUD_H / 2);
  // Fuel gauge.
  const fx = 620;
  ctx.fillStyle = PALETTE.hudDim;
  ctx.font = '600 13px system-ui, sans-serif';
  ctx.fillText('FUEL', fx, HUD_H / 2);
  ctx.fillStyle = 'rgba(255,255,255,0.14)';
  roundRect(ctx, fx + 48, HUD_H / 2 - 7, 130, 14, 7);
  ctx.fill();
  const fuelRatio = hud.fuel / hud.fuelMax;
  ctx.fillStyle = fuelRatio < 0.25 ? PALETTE.coral : PALETTE.amber;
  if (fuelRatio > 0) {
    roundRect(ctx, fx + 48, HUD_H / 2 - 7, 130 * fuelRatio, 14, 7);
    ctx.fill();
  }
  // Attempts as little ships.
  ctx.fillStyle = PALETTE.hudDim;
  ctx.fillText('SHIPS', 830, HUD_H / 2);
  for (let i = 0; i < 3; i++) {
    const x = 890 + i * 26;
    ctx.fillStyle = i < hud.attempts ? PALETTE.amber : 'rgba(255,255,255,0.16)';
    ctx.beginPath();
    ctx.moveTo(x + 9, HUD_H / 2);
    ctx.lineTo(x - 6, HUD_H / 2 + 5);
    ctx.lineTo(x - 3, HUD_H / 2);
    ctx.lineTo(x - 6, HUD_H / 2 - 5);
    ctx.closePath();
    ctx.fill();
  }
  // Shards and clock.
  ctx.fillStyle = PALETTE.amber;
  ctx.fillText(`◆ ${hud.shardsGot}/${hud.shardsTotal}`, 985, HUD_H / 2);
  const timeColor = hud.screen === Screens.FLY && hud.flightTime > 35 ? PALETTE.coral : PALETTE.hudDim;
  ctx.fillStyle = timeColor;
  ctx.fillText(`${Math.floor(hud.time)}s`, 1085, HUD_H / 2);
  // Mute + pause buttons (top right).
  drawButton(ctx, 1150, 10, 52, 36, muted ? '🔇' : '🔊', 'mute', hover === 'mute');
  drawButton(ctx, 1210, 10, 52, 36, 'II', 'pause', hover === 'pause');
  // Landing speed readout while flying near the target.
  if (hud.screen === Screens.FLY) {
    const level = LEVELS[world.levelIndex];
    const dist = Math.hypot(world.ship.x - level.target.x, world.ship.y - level.target.y);
    if (dist < 300) {
      const ok = hud.speed <= hud.landSpeed;
      ctx.fillStyle = ok ? '#7be495' : PALETTE.coral;
      ctx.font = '700 15px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(
        `LANDING SPEED ${Math.round(hud.speed)} / ${hud.landSpeed}`,
        CANVAS_W / 2,
        HUD_H + 24,
      );
    }
  }
  // Hint line at the bottom.
  if (hud.screen === Screens.AIM || hud.screen === Screens.FLY) {
    ctx.fillStyle = 'rgba(238, 242, 255, 0.75)';
    ctx.font = '500 14px system-ui, sans-serif';
    ctx.textAlign = 'center';
    const hint =
      hud.screen === Screens.AIM
        ? hud.hint + '  ·  Hold the mouse to thrust while flying  ·  R restart  ·  P pause  ·  M mute'
        : 'Hold mouse / arrows to thrust toward the cursor  ·  R restart  ·  P pause';
    ctx.fillText(hint, CANVAS_W / 2, CANVAS_H - 16);
  }
  // Transient message banner.
  if (hud.message) {
    ctx.fillStyle = 'rgba(10, 16, 44, 0.85)';
    ctx.font = '600 16px system-ui, sans-serif';
    const w = ctx.measureText(hud.message).width + 36;
    roundRect(ctx, (CANVAS_W - w) / 2, HUD_H + 14, w, 36, 18);
    ctx.fill();
    ctx.fillStyle = PALETTE.amberSoft;
    ctx.textAlign = 'center';
    ctx.fillText(hud.message, CANVAS_W / 2, HUD_H + 33);
  }
}

function drawTitle(ctx, world, hover) {
  ctx.fillStyle = 'rgba(4, 5, 15, 0.45)';
  ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);
  ctx.textAlign = 'center';
  ctx.fillStyle = PALETTE.amber;
  ctx.font = '700 64px system-ui, sans-serif';
  ctx.fillText('STARLIGHT COURIER', CANVAS_W / 2, 218);
  ctx.fillStyle = PALETTE.hudText;
  ctx.font = '500 26px system-ui, sans-serif';
  ctx.fillText('星光快递 · 八个星系，一次次温柔着陆', CANVAS_W / 2, 262);
  ctx.fillStyle = PALETTE.hudDim;
  ctx.font = '500 16px system-ui, sans-serif';
  ctx.fillText('Drag to aim, release to launch. Ride gravity, mind your fuel,', CANVAS_W / 2, 316);
  ctx.fillText('and land gently on the beacon planet to deliver the parcel.', CANVAS_W / 2, 340);
  ctx.fillText('Collect ◆ shards for bonus points. 8 levels, 3 ships each.', CANVAS_W / 2, 364);
  drawButton(ctx, CANVAS_W / 2 - 110, 408, 220, 54, '▶  START DELIVERY', 'start', hover === 'start');
  ctx.fillStyle = PALETTE.hudDim;
  ctx.font = '500 14px system-ui, sans-serif';
  ctx.fillText('Mouse to aim and thrust · Arrow keys thrust too · R restart · P pause · M mute', CANVAS_W / 2, 500);
  if (world.bestScore > 0) {
    ctx.fillStyle = PALETTE.amber;
    ctx.fillText(`BEST SCORE ${world.bestScore}`, CANVAS_W / 2, 530);
  }
}

function drawPause(ctx, hover) {
  ctx.fillStyle = 'rgba(4, 5, 15, 0.6)';
  ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);
  drawPanel(ctx, CANVAS_W / 2 - 260, 190, 520, 300, 'PAUSED');
  drawButton(ctx, CANVAS_W / 2 - 100, 280, 200, 48, 'Resume', 'resume', hover === 'resume');
  drawButton(ctx, CANVAS_W / 2 - 100, 340, 200, 48, 'Restart level', 'retry', hover === 'retry');
  drawButton(ctx, CANVAS_W / 2 - 100, 400, 200, 48, 'Quit to title', 'title', hover === 'title');
}

function drawLevelComplete(ctx, world, hover) {
  const b = world.lastBreakdown;
  ctx.fillStyle = 'rgba(4, 5, 15, 0.45)';
  ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);
  drawPanel(ctx, CANVAS_W / 2 - 270, 150, 540, 380, 'PARCEL DELIVERED!');
  ctx.textAlign = 'left';
  ctx.font = '500 18px system-ui, sans-serif';
  const rows = [
    ['Delivery', `+${b.delivery}`],
    [`Time bonus (${Math.round(b.levelTime)}s)`, `+${b.timeBonus}`],
    ['Fuel left', `+${b.fuelBonus}`],
    [`Shards ${b.shards}/${b.shardsTotal}`, `+${b.shardBonus}`],
  ];
  let y = 248;
  for (const [label, value] of rows) {
    ctx.fillStyle = PALETTE.hudDim;
    ctx.fillText(label, CANVAS_W / 2 - 210, y);
    ctx.fillStyle = PALETTE.hudText;
    ctx.textAlign = 'right';
    ctx.fillText(value, CANVAS_W / 2 + 210, y);
    ctx.textAlign = 'left';
    y += 34;
  }
  ctx.strokeStyle = 'rgba(58, 74, 138, 0.8)';
  ctx.beginPath();
  ctx.moveTo(CANVAS_W / 2 - 210, y - 6);
  ctx.lineTo(CANVAS_W / 2 + 210, y - 6);
  ctx.stroke();
  ctx.fillStyle = PALETTE.amber;
  ctx.font = '700 22px system-ui, sans-serif';
  ctx.fillText('Level total', CANVAS_W / 2 - 210, y + 26);
  ctx.textAlign = 'right';
  ctx.fillText(`+${b.levelTotal}`, CANVAS_W / 2 + 210, y + 26);
  ctx.textAlign = 'left';
  ctx.fillStyle = PALETTE.hudText;
  ctx.font = '600 18px system-ui, sans-serif';
  ctx.fillText(`Total score ${world.totalScore}`, CANVAS_W / 2 - 210, y + 60);
  const last = world.levelIndex + 1 >= LEVELS.length;
  drawButton(
    ctx,
    CANVAS_W / 2 - 110,
    452,
    220,
    50,
    last ? 'See results ★' : 'Next level →',
    'next',
    hover === 'next',
  );
}

function drawGameOver(ctx, world, hover) {
  ctx.fillStyle = 'rgba(4, 5, 15, 0.55)';
  ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);
  drawPanel(ctx, CANVAS_W / 2 - 270, 170, 540, 340, 'SHIP LOST');
  ctx.textAlign = 'center';
  ctx.fillStyle = PALETTE.hudDim;
  ctx.font = '500 17px system-ui, sans-serif';
  ctx.fillText(world.crashReason || 'No ships left.', CANVAS_W / 2, 268);
  ctx.fillStyle = PALETTE.hudText;
  ctx.font = '600 20px system-ui, sans-serif';
  ctx.fillText(`Score ${world.totalScore}  ·  Best ${world.bestScore}`, CANVAS_W / 2, 306);
  drawButton(ctx, CANVAS_W / 2 - 220, 350, 200, 50, 'Retry level', 'retry', hover === 'retry');
  drawButton(ctx, CANVAS_W / 2 + 20, 350, 200, 50, 'Restart game', 'restart', hover === 'restart');
}

function drawVictory(ctx, world, hover) {
  ctx.fillStyle = 'rgba(4, 5, 15, 0.45)';
  ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);
  drawPanel(ctx, CANVAS_W / 2 - 280, 160, 560, 360, 'ROUTE COMPLETE!');
  ctx.textAlign = 'center';
  ctx.fillStyle = PALETTE.hudText;
  ctx.font = '500 19px system-ui, sans-serif';
  ctx.fillText('All 8 parcels delivered. The starlight route is yours.', CANVAS_W / 2, 268);
  ctx.fillStyle = PALETTE.amber;
  ctx.font = '700 34px system-ui, sans-serif';
  ctx.fillText(`FINAL SCORE ${world.totalScore}`, CANVAS_W / 2, 326);
  ctx.fillStyle = PALETTE.hudDim;
  ctx.font = '500 16px system-ui, sans-serif';
  ctx.fillText(`Best ${world.bestScore}`, CANVAS_W / 2, 362);
  drawButton(ctx, CANVAS_W / 2 - 110, 410, 220, 52, '↻  Play again', 'restart', hover === 'restart');
}

// Draw one frame. hover is the action of the button under the mouse, or null.
export function drawGame(ctx, world, hover, muted) {
  currentButtons = [];
  const level = LEVELS[world.levelIndex];
  drawBackground(ctx, world);
  if (level.sun) drawSun(ctx, level.sun, world.time);
  for (const p of level.planets) drawPlanet(ctx, p);
  drawPlanet(ctx, { ...level.target, ring: false });
  drawTargetBeacon(ctx, level.target, world.time);
  for (const comet of level.comets) drawComet(ctx, world, comet);
  for (let i = 0; i < level.shards.length; i++) {
    if (!world.shardsGot.has(i)) drawShard(ctx, level.shards[i], world.time);
  }
  drawParticles(ctx, world);
  if (world.screen === Screens.AIM) drawAim(ctx, world);
  drawShip(ctx, world);
  drawHud(ctx, world, hover, muted);
  if (world.screen === Screens.TITLE) drawTitle(ctx, world, hover);
  else if (world.screen === Screens.PAUSE) drawPause(ctx, hover);
  else if (world.screen === Screens.LEVEL_COMPLETE) drawLevelComplete(ctx, world, hover);
  else if (world.screen === Screens.GAME_OVER) drawGameOver(ctx, world, hover);
  else if (world.screen === Screens.VICTORY) drawVictory(ctx, world, hover);
}
