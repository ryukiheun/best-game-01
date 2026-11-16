// Drawing only: the world's state and the current screen in, pixels out.
// The 1280x800 playfield is scaled to fit the window and centred, the margin
// filled with the backdrop colour. Neon shapes on a dark nebula: glow is faked
// with a translucent halo pass and 'lighter' blending, never shadowBlur, so a
// busy frame stays fast. Text that holds a number is rebuilt only when the
// number changes, so a frame allocates nothing.
import { FIELD, FONT, HULL, PALETTE } from './config.js';
import { createRandom } from './random.js';

export const SCREEN_TITLE = 'title';
export const SCREEN_PLAY = 'play';
export const SCREEN_PAUSED = 'paused';
export const SCREEN_OVER = 'over';
export const SCREEN_WIN = 'win';

const TAU = Math.PI * 2;

/** How many stars per layer, and how fast each layer drifts. */
const STAR_LAYERS = [
  { count: 90, size: 1.2, speed: 4, alpha: 0.5 },
  { count: 55, size: 1.8, speed: 9, alpha: 0.75 },
  { count: 28, size: 2.6, speed: 16, alpha: 1 },
];

function cachedLabel(prefix) {
  let value = -1;
  let text = '';
  return function label(next) {
    if (next !== value) {
      value = next;
      text = prefix + next;
    }
    return text;
  };
}

function polygon(context, x, y, radius, sides, rotation) {
  context.beginPath();
  for (let i = 0; i < sides; i += 1) {
    const a = rotation + (i / sides) * TAU;
    const px = x + Math.cos(a) * radius;
    const py = y + Math.sin(a) * radius;
    if (i === 0) context.moveTo(px, py);
    else context.lineTo(px, py);
  }
  context.closePath();
}

export function createRenderer(canvas) {
  const context = canvas.getContext('2d');
  const view = { scale: 1, x: 0, y: 0 };
  const scoreLabel = cachedLabel('SCORE ');
  const waveLabel = cachedLabel('WAVE ');
  const finalLabel = cachedLabel('SCORE ');
  const bestLabel = cachedLabel('BEST ');
  const reachedLabel = cachedLabel('REACHED WAVE ');

  // The nebula backdrop, painted once to an offscreen canvas.
  const backdrop = document.createElement('canvas');
  backdrop.width = FIELD.width;
  backdrop.height = FIELD.height;
  const bctx = backdrop.getContext('2d');
  bctx.fillStyle = PALETTE.backdrop;
  bctx.fillRect(0, 0, FIELD.width, FIELD.height);
  const nebulaRandom = createRandom(1337);
  const blobs = [
    { x: 220, y: 180, r: 320, color: PALETTE.nebulaA },
    { x: 1050, y: 620, r: 360, color: PALETTE.nebulaB },
    { x: 980, y: 130, r: 260, color: PALETTE.nebulaC },
    { x: 180, y: 660, r: 240, color: PALETTE.nebulaB },
  ];
  for (const blob of blobs) {
    const gradient = bctx.createRadialGradient(blob.x, blob.y, 0, blob.x, blob.y, blob.r);
    gradient.addColorStop(0, blob.color);
    gradient.addColorStop(1, 'rgba(0,0,0,0)');
    bctx.fillStyle = gradient;
    bctx.fillRect(blob.x - blob.r, blob.y - blob.r, blob.r * 2, blob.r * 2);
  }
  // Stars, three drifting layers.
  const starRandom = createRandom(20261);
  const stars = STAR_LAYERS.map((layer) => {
    const list = [];
    for (let i = 0; i < layer.count; i += 1) {
      list.push({ x: starRandom() * FIELD.width, y: starRandom() * FIELD.height, phase: starRandom() * TAU });
    }
    return { ...layer, list };
  });

  const fonts = new Map();
  function font(size, weight) {
    const key = `${weight || ''}${size}`;
    if (!fonts.has(key)) fonts.set(key, `${weight ? `${weight} ` : ''}${size}px ${FONT}`);
    return fonts.get(key);
  }

  function text(value, x, y, size, color, align, weight) {
    context.font = font(size, weight);
    context.fillStyle = color;
    context.textAlign = align;
    context.textBaseline = 'alphabetic';
    context.fillText(value, x, y);
  }

  function resize() {
    const ratio = window.devicePixelRatio || 1;
    const width = Math.round(window.innerWidth * ratio);
    const height = Math.round(window.innerHeight * ratio);
    canvas.width = width;
    canvas.height = height;
    view.scale = Math.min(width / FIELD.width, height / FIELD.height);
    view.x = (width - FIELD.width * view.scale) / 2;
    view.y = (height - FIELD.height * view.scale) / 2;
  }

  function drawBackground(elapsed) {
    context.drawImage(backdrop, 0, 0);
    for (const layer of stars) {
      context.globalAlpha = layer.alpha;
      context.fillStyle = '#cfe4ff';
      for (const star of layer.list) {
        const x = (((star.x - elapsed * layer.speed) % FIELD.width) + FIELD.width) % FIELD.width;
        const twinkle = 0.7 + 0.3 * Math.sin(elapsed * 2 + star.phase);
        context.globalAlpha = layer.alpha * twinkle;
        context.fillRect(x, star.y, layer.size, layer.size);
      }
    }
    context.globalAlpha = 1;
  }

  function drawShip(state) {
    const ship = state.ship;
    if (state.over && !state.won) return; // The ship is gone on the game-over screen.
    // Blink while invulnerable after a hit.
    if (ship.invulnerable > 0 && Math.floor(ship.invulnerable * 12) % 2 === 0) return;
    const x = ship.x;
    const y = ship.y;
    const a = ship.angle;
    context.save();
    context.translate(x, y);
    context.rotate(a);
    // Engine flame.
    const flame = 14 + Math.random() * 8;
    context.globalCompositeOperation = 'lighter';
    context.fillStyle = 'rgba(53, 200, 232, 0.55)';
    context.beginPath();
    context.moveTo(-12, 5);
    context.lineTo(-12 - flame, 0);
    context.lineTo(-12, -5);
    context.closePath();
    context.fill();
    context.globalCompositeOperation = 'source-over';
    // Hull: a sleek dart.
    context.fillStyle = PALETTE.ship;
    context.beginPath();
    context.moveTo(20, 0);
    context.lineTo(-12, 11);
    context.lineTo(-6, 0);
    context.lineTo(-12, -11);
    context.closePath();
    context.fill();
    context.fillStyle = PALETTE.shipCore;
    context.beginPath();
    context.moveTo(12, 0);
    context.lineTo(-6, 6);
    context.lineTo(-3, 0);
    context.lineTo(-6, -6);
    context.closePath();
    context.fill();
    context.restore();
    // Aegis shield ring.
    if (ship.aegis) {
      context.strokeStyle = 'rgba(142, 247, 255, 0.8)';
      context.lineWidth = 2;
      context.beginPath();
      context.arc(x, y, 26, 0, TAU);
      context.stroke();
    }
  }

  function drawEnemies(state) {
    for (const enemy of state.enemies) {
      const color = enemy.kind === 'drifter' ? '#ff4d6d'
        : enemy.kind === 'darter' ? '#ffb020'
        : enemy.kind === 'spitter' ? '#c86bff'
        : enemy.kind === 'splitter' ? '#ff5c39' : '#ff2e63';
      const r = enemy.radius;
      // Halo pass, then the solid shape.
      context.globalAlpha = 0.25;
      context.fillStyle = color;
      polygon(context, enemy.x, enemy.y, r + 6, enemy.kind === 'dreadnought' ? 8 : enemy.kind === 'spitter' ? 6 : enemy.kind === 'splitter' ? 4 : 3, enemy.angle);
      context.fill();
      context.globalAlpha = 1;
      context.fillStyle = 'rgba(8, 10, 24, 0.9)';
      polygon(context, enemy.x, enemy.y, r, enemy.kind === 'dreadnought' ? 8 : enemy.kind === 'spitter' ? 6 : enemy.kind === 'splitter' ? 4 : 3, enemy.angle);
      context.fill();
      context.strokeStyle = color;
      context.lineWidth = enemy.kind === 'dreadnought' ? 3.5 : 2.5;
      context.stroke();
      // Eye.
      context.fillStyle = color;
      context.beginPath();
      context.arc(enemy.x, enemy.y, Math.max(2.5, r * 0.18), 0, TAU);
      context.fill();
      // Dreadnought health bar.
      if (enemy.kind === 'dreadnought') {
        const w = 90;
        const h = 7;
        context.fillStyle = 'rgba(255,255,255,0.15)';
        context.fillRect(enemy.x - w / 2, enemy.y - r - 20, w, h);
        context.fillStyle = '#ff2e63';
        context.fillRect(enemy.x - w / 2, enemy.y - r - 20, w * (enemy.hp / enemy.maxHp), h);
      }
    }
  }

  function drawBullets(state) {
    context.globalCompositeOperation = 'lighter';
    for (const bullet of state.bullets) {
      context.fillStyle = 'rgba(174, 252, 255, 0.35)';
      context.beginPath();
      context.arc(bullet.x, bullet.y, bullet.radius + 5, 0, TAU);
      context.fill();
      context.fillStyle = PALETTE.bullet;
      context.beginPath();
      context.arc(bullet.x, bullet.y, bullet.radius, 0, TAU);
      context.fill();
    }
    for (const orb of state.orbs) {
      context.fillStyle = 'rgba(255, 77, 109, 0.35)';
      context.beginPath();
      context.arc(orb.x, orb.y, orb.radius + 6, 0, TAU);
      context.fill();
      context.fillStyle = '#ff4d6d';
      context.beginPath();
      context.arc(orb.x, orb.y, orb.radius, 0, TAU);
      context.fill();
    }
    context.globalCompositeOperation = 'source-over';
  }

  function drawShards(state, elapsed) {
    for (const shard of state.shards) {
      const pulse = 1 + 0.25 * Math.sin(elapsed * 6 + shard.x);
      context.save();
      context.translate(shard.x, shard.y);
      context.rotate(Math.PI / 4);
      context.fillStyle = 'rgba(255, 217, 77, 0.35)';
      context.fillRect(-shard.radius * pulse - 3, -shard.radius * pulse - 3, (shard.radius * pulse + 3) * 2, (shard.radius * pulse + 3) * 2);
      context.fillStyle = PALETTE.shard;
      context.fillRect(-shard.radius * pulse, -shard.radius * pulse, shard.radius * pulse * 2, shard.radius * pulse * 2);
      context.restore();
    }
    for (const pickup of state.pickups) {
      const pulse = 1 + 0.2 * Math.sin(pickup.pulse);
      context.strokeStyle = '#8ef7ff';
      context.lineWidth = 2;
      context.beginPath();
      context.arc(pickup.x, pickup.y, pickup.radius * pulse + 4, 0, TAU);
      context.stroke();
      context.fillStyle = pickup.kind === 'aegis' ? '#8ef7ff' : '#ffb020';
      context.font = font(20, 'bold');
      context.textAlign = 'center';
      context.textBaseline = 'middle';
      context.fillText(pickup.kind === 'aegis' ? '◈' : '⚡', pickup.x, pickup.y + 1);
    }
  }

  function drawParticles(state) {
    context.globalCompositeOperation = 'lighter';
    for (const p of state.particles) {
      context.globalAlpha = Math.max(0, p.life / p.maxLife);
      context.fillStyle = p.color;
      context.beginPath();
      context.arc(p.x, p.y, p.size, 0, TAU);
      context.fill();
    }
    context.globalAlpha = 1;
    context.globalCompositeOperation = 'source-over';
  }

  function drawTexts(state) {
    context.textAlign = 'center';
    for (const t of state.texts) {
      context.globalAlpha = Math.max(0, t.life);
      text(t.text, t.x, t.y, 20, t.color, 'center', 'bold');
    }
    context.globalAlpha = 1;
  }

  function drawHeart(x, y, size, filled) {
    context.fillStyle = filled ? '#ff4d6d' : 'rgba(255,255,255,0.14)';
    context.beginPath();
    context.moveTo(x, y + size * 0.35);
    context.bezierCurveTo(x - size * 0.6, y - size * 0.25, x - size * 0.25, y - size * 0.6, x, y - size * 0.2);
    context.bezierCurveTo(x + size * 0.25, y - size * 0.6, x + size * 0.6, y - size * 0.25, x, y + size * 0.35);
    context.closePath();
    context.fill();
  }

  function drawHud(state) {
    const ship = state.ship;
    text(scoreLabel(state.score), 24, 44, 30, PALETTE.text, 'left', 'bold');
    if (state.mult > 1) {
      text(`x${state.mult} COMBO ${state.combo}`, 24, 72, 18, '#ffd94d', 'left', 'bold');
    }
    text(waveLabel(state.wave), FIELD.width / 2, 44, 30, PALETTE.text, 'center', 'bold');
    const left = state.spawnQueue.length + state.enemies.length;
    if (state.waveState === 'fighting' && left > 0) {
      text(`${left} HOSTILES LEFT`, FIELD.width / 2, 72, 16, PALETTE.muted, 'center');
    }
    for (let i = 0; i < HULL; i += 1) {
      drawHeart(FIELD.width - 32 - i * 30, 34, 22, i < ship.hull);
    }
    if (ship.aegis) text('AEGIS', FIELD.width - 24, 72, 16, '#8ef7ff', 'right', 'bold');
    if (ship.overdrive > 0) text(`OVERDRIVE ${Math.ceil(ship.overdrive)}s`, FIELD.width - 24, 96, 16, '#ffb020', 'right', 'bold');
    // Nova charge, bottom centre.
    const barW = 220;
    const barH = 10;
    const barX = (FIELD.width - barW) / 2;
    const barY = FIELD.height - 34;
    context.fillStyle = PALETTE.barBack;
    context.fillRect(barX, barY, barW, barH);
    context.fillStyle = ship.nova >= 100 ? '#8ef7ff' : '#35c8e8';
    context.fillRect(barX, barY, barW * (ship.nova / 100), barH);
    text(ship.nova >= 100 ? 'NOVA READY — PRESS E' : 'NOVA', FIELD.width / 2, barY - 8, 15, ship.nova >= 100 ? '#8ef7ff' : PALETTE.muted, 'center', 'bold');
    text('WASD MOVE · MOUSE AIM · CLICK SHOOT · E NOVA · P PAUSE · M MUTE', 24, FIELD.height - 20, 13, PALETTE.dim, 'left');
  }

  function drawBanner(state) {
    if (state.waveState === 'intro') {
      context.globalAlpha = Math.min(1, state.waveTimer);
      text(`WAVE ${state.wave}`, FIELD.width / 2, FIELD.height / 2 - 60, 64, PALETTE.text, 'center', 'bold');
      context.globalAlpha = 1;
    } else if (state.waveState === 'clear') {
      context.globalAlpha = Math.min(1, state.waveTimer);
      text('WAVE CLEAR', FIELD.width / 2, FIELD.height / 2 - 60, 56, '#ffd94d', 'center', 'bold');
      context.globalAlpha = 1;
    }
  }

  function drawPanel(title, lines, prompt, accent) {
    const width = 640;
    const lineH = 32;
    const height = 190 + lines.length * lineH;
    const x = (FIELD.width - width) / 2;
    const y = (FIELD.height - height) / 2;
    context.fillStyle = PALETTE.panel;
    context.fillRect(x, y, width, height);
    context.strokeStyle = PALETTE.panelEdge;
    context.lineWidth = 2;
    context.strokeRect(x, y, width, height);
    text(title, FIELD.width / 2, y + 78, 52, accent || PALETTE.text, 'center', 'bold');
    for (let i = 0; i < lines.length; i += 1) {
      text(lines[i], FIELD.width / 2, y + 132 + i * lineH, 20, PALETTE.muted, 'center');
    }
    text(prompt, FIELD.width / 2, y + height - 36, 22, '#ffd94d', 'center', 'bold');
  }

  function drawTitle(state, best) {
    drawPanel('VOIDLIGHT', [
      'The star is dying. You are its last light.',
      'Blast the void swarm, gather their light, survive 10 waves',
      'and reignite the dawn. Reach wave 10 to win.',
      '',
      'WASD / ARROWS — fly    MOUSE — aim    CLICK / SPACE — fire',
      'E / RIGHT-CLICK — Nova blast when charged',
      'P — pause    M — mute',
      '',
      bestLabel(best),
    ], 'CLICK OR PRESS SPACE TO START', '#7df9ff');
  }

  function drawOver(state, best) {
    drawPanel('THE LIGHT FADES', [
      finalLabel(state.score),
      bestLabel(best),
      reachedLabel(state.wave),
      '',
      'The swarm keeps the dark. Fly again and take it back.',
    ], 'PRESS SPACE OR CLICK TO TRY AGAIN', '#ff4d6d');
  }

  function drawWin(state, best) {
    drawPanel('DAWN BREAKS', [
      'Wave 10 cleared — the star reignites.',
      finalLabel(state.score),
      bestLabel(best),
      '',
      'You carried the last light home.',
    ], 'PRESS SPACE OR CLICK TO PLAY AGAIN', '#ffd94d');
  }

  function drawPaused() {
    drawPanel('PAUSED', ['The swarm waits for no one. Almost.'], 'PRESS P TO RESUME', PALETTE.text);
  }

  /** Paint one frame: the field, then the HUD or a panel for the screen the game is on. */
  function draw(state, screen, best) {
    context.setTransform(1, 0, 0, 1, 0, 0);
    context.fillStyle = PALETTE.backdrop;
    context.fillRect(0, 0, canvas.width, canvas.height);
    const shakeX = state.shake > 0 ? (Math.random() - 0.5) * state.shake : 0;
    const shakeY = state.shake > 0 ? (Math.random() - 0.5) * state.shake : 0;
    context.setTransform(view.scale, 0, 0, view.scale, view.x + shakeX * view.scale, view.y + shakeY * view.scale);
    drawBackground(state.elapsed);
    drawShards(state, state.elapsed);
    drawEnemies(state);
    drawBullets(state);
    drawShip(state);
    drawParticles(state);
    drawTexts(state);
    if (screen === SCREEN_TITLE) {
      drawTitle(state, best);
      return;
    }
    drawHud(state);
    drawBanner(state);
    if (screen === SCREEN_PAUSED) drawPaused();
    else if (screen === SCREEN_OVER) drawOver(state, best);
    else if (screen === SCREEN_WIN) drawWin(state, best);
  }

  resize();
  window.addEventListener('resize', resize);
  return {
    draw,
    /** Canvas pixels (as input reports them) back to field coordinates. */
    toField(px, py) {
      return { x: (px - view.x) / view.scale, y: (py - view.y) / view.scale };
    },
  };
}
