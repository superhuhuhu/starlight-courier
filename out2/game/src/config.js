// Tuning and presentation constants for Starlight Courier. One place for every number a
// designer would want to change: the canvas size, the physics, the fuel economy, the scoring
// and the palette. Nothing here reads the network or the clock.
export const CANVAS_W = 1280;
export const CANVAS_H = 720;
export const HUD_H = 56;

// Gravity: acceleration from a body is GRAVITY * mass / (distance^2 + SOFTENING^2), in
// px/s^2. The softening keeps the pull bounded near a surface, so a landing approach stays
// controllable instead of spiking to thousands of px/s^2 in the last few pixels.
export const GRAVITY = 5000;
export const SOFTENING = 120;
// Fixed physics step (seconds). The loop accumulates real time into steps of this size.
export const STEP = 1 / 60;
// Fastest a launch may be, px/s. Drag distance maps linearly onto launch speed up to this.
export const MAX_LAUNCH_SPEED = 620;
// How many px/s of launch speed one px of drag buys.
export const DRAG_TO_SPEED = 2.2;
// Thrust acceleration while the player holds the thruster, px/s^2.
export const THRUST_ACCEL = 260;
// Fuel units burned per second of thrusting. Fuel starts at FUEL_MAX.
export const FUEL_BURN_PER_SEC = 26;
export const FUEL_MAX = 100;
// The ship's collision radius, px.
export const SHIP_RADIUS = 10;
// Landing on the target counts as delivered only below this impact speed, px/s.
export const LAND_SPEED_BASE = 95;
// The play area's margin: drifting this far past an edge is lost in deep space.
export const BOUNDS_MARGIN = 90;
// How many attempts each level gives the player.
export const ATTEMPTS_PER_LEVEL = 3;
// How far ahead the aim preview simulates, in seconds, and how many dots it draws.
export const PREVIEW_SECONDS = 3;
export const PREVIEW_DOTS = 28;

// Scoring.
export const SCORE_DELIVERY = 1000;
export const SCORE_SHARD = 150;
export const SCORE_TIME_PER_SEC = 10;
export const SCORE_FUEL_PER_UNIT = 5;

// Palette: deep-space navy, warm amber for the courier, cyan for guidance, coral for danger.
export const PALETTE = {
  skyTop: '#0b1030',
  skyBottom: '#04050f',
  star: '#dfe6ff',
  hudText: '#eef2ff',
  hudDim: '#9aa7d6',
  amber: '#ffb43a',
  amberSoft: '#ffd98a',
  cyan: '#4fe3e8',
  cyanDim: '#2a8f96',
  coral: '#ff6a5e',
  panel: 'rgba(10, 16, 44, 0.88)',
  panelBorder: '#3a4a8a',
  button: '#1c2a5e',
  buttonHover: '#2c3f8f',
};
