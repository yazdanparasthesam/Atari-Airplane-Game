(() => {
  'use strict';

  const W = 480;
  const H = 640;
  const HIGH_SCORE_KEY = 'sky-ace-high-score';

  const DIFFICULTY = {
    easy: { lives: 5, enemySpeed: 0.85, spawnRate: 1.35, playerSpeed: 5.5 },
    normal: { lives: 3, enemySpeed: 1, spawnRate: 1, playerSpeed: 5 },
    hard: { lives: 2, enemySpeed: 1.2, spawnRate: 0.75, playerSpeed: 4.5 },
  };

  const STATE = {
    MENU: 'menu',
    PLAYING: 'playing',
    PAUSED: 'paused',
    GAME_OVER: 'gameOver',
  };

  const ENEMY_TYPES = {
    scout: { w: 28, h: 24, hp: 1, speed: 2.2, score: 100, color: '#f43f5e', pattern: 'straight' },
    bomber: { w: 40, h: 32, hp: 3, speed: 1.4, score: 300, color: '#a855f7', pattern: 'zigzag' },
    kamikaze: { w: 24, h: 20, hp: 1, speed: 3.8, score: 200, color: '#fb923c', pattern: 'dive' },
    boss: { w: 80, h: 56, hp: 30, speed: 0.8, score: 2000, color: '#ef4444', pattern: 'boss' },
  };

  const POWERUP_TYPES = ['rapid', 'shield', 'life'];

  const canvas = document.getElementById('game-canvas');
  const ctx = canvas.getContext('2d');
  const scoreEl = document.getElementById('score');
  const highScoreEl = document.getElementById('high-score');
  const livesEl = document.getElementById('lives');
  const waveEl = document.getElementById('wave');
  const overlay = document.getElementById('overlay');
  const overlayTitle = document.getElementById('overlay-title');
  const overlayMessage = document.getElementById('overlay-message');
  const startBtn = document.getElementById('start-btn');
  const pauseBtn = document.getElementById('pause-btn');
  const restartBtn = document.getElementById('restart-btn');
  const difficultyButtons = document.getElementById('difficulty-buttons');
  const mobileControls = document.getElementById('mobile-controls');
  const fireBtn = document.getElementById('fire-btn');

  canvas.width = W;
  canvas.height = H;

  let audioCtx = null;

  function initAudio() {
    if (!audioCtx) {
      audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    }
    if (audioCtx.state === 'suspended') {
      audioCtx.resume();
    }
  }

  function playTone(freq, duration, type = 'square', volume = 0.08) {
    if (!audioCtx) return;
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.type = type;
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(volume, audioCtx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + duration);
    osc.connect(gain);
    gain.connect(audioCtx.destination);
    osc.start();
    osc.stop(audioCtx.currentTime + duration);
  }

  function playShoot() { playTone(880, 0.05, 'square', 0.04); }
  function playExplosion() { playTone(120, 0.2, 'sawtooth', 0.1); }
  function playPowerUp() { playTone(660, 0.08, 'triangle', 0.07); playTone(990, 0.12, 'triangle', 0.06); }
  function playHit() { playTone(200, 0.15, 'sawtooth', 0.09); }
  function playGameOver() { playTone(330, 0.3, 'sawtooth', 0.08); playTone(220, 0.5, 'sawtooth', 0.06); }

  let state = STATE.MENU;
  let difficulty = 'normal';
  let score = 0;
  let wave = 1;
  let lives = 3;
  let highScore = parseInt(localStorage.getItem(HIGH_SCORE_KEY) || '0', 10);
  let frameId = null;
  let lastTime = 0;

  let player = null;
  let bullets = [];
  let enemyBullets = [];
  let enemies = [];
  let powerups = [];
  let particles = [];
  let stars = [];
  let clouds = [];

  let keys = {};
  let mobileInput = { up: false, down: false, left: false, right: false, fire: false };
  let spawnTimer = 0;
  let fireCooldown = 0;
  let rapidFireTimer = 0;
  let shieldTimer = 0;
  let invincibleTimer = 0;
  let waveKills = 0;
  let waveTarget = 12;
  let bossActive = false;
  let scrollOffset = 0;

  highScoreEl.textContent = highScore;

  function getConfig() {
    return DIFFICULTY[difficulty];
  }

  function resetBackground() {
    stars = Array.from({ length: 80 }, () => ({
      x: Math.random() * W,
      y: Math.random() * H,
      speed: 0.5 + Math.random() * 2,
      size: Math.random() < 0.3 ? 2 : 1,
      brightness: 0.3 + Math.random() * 0.7,
    }));

    clouds = Array.from({ length: 6 }, () => ({
      x: Math.random() * W,
      y: Math.random() * H,
      speed: 0.8 + Math.random() * 1.2,
      w: 60 + Math.random() * 80,
      h: 20 + Math.random() * 20,
      opacity: 0.08 + Math.random() * 0.12,
    }));
  }

  function createPlayer() {
    return {
      x: W / 2,
      y: H - 80,
      w: 32,
      h: 36,
      speed: getConfig().playerSpeed,
    };
  }

  function resetGame() {
    const config = getConfig();
    score = 0;
    wave = 1;
    lives = config.lives;
    bullets = [];
    enemyBullets = [];
    enemies = [];
    powerups = [];
    particles = [];
    player = createPlayer();
    spawnTimer = 0;
    fireCooldown = 0;
    rapidFireTimer = 0;
    shieldTimer = 0;
    invincibleTimer = 0;
    waveKills = 0;
    waveTarget = 12;
    bossActive = false;
    scrollOffset = 0;
    resetBackground();
    updateHUD();
  }

  function updateHUD() {
    scoreEl.textContent = score;
    livesEl.textContent = lives;
    waveEl.textContent = wave;
    if (score > highScore) {
      highScore = score;
      localStorage.setItem(HIGH_SCORE_KEY, String(highScore));
    }
    highScoreEl.textContent = highScore;
  }

  function showOverlay(title, message, btnText) {
    overlayTitle.textContent = title;
    overlayMessage.textContent = message;
    startBtn.textContent = btnText;
    overlay.classList.remove('hidden');
  }

  function hideOverlay() {
    overlay.classList.add('hidden');
  }

  function setState(newState) {
    state = newState;
    pauseBtn.disabled = state !== STATE.PLAYING && state !== STATE.PAUSED;
    restartBtn.disabled = state === STATE.MENU;
  }

  function startGame() {
    initAudio();
    resetGame();
    setState(STATE.PLAYING);
    hideOverlay();
    pauseBtn.textContent = 'Pause';
    lastTime = performance.now();
    if (frameId) cancelAnimationFrame(frameId);
    frameId = requestAnimationFrame(gameLoop);
  }

  function togglePause() {
    if (state === STATE.PLAYING) {
      setState(STATE.PAUSED);
      pauseBtn.textContent = 'Resume';
      showOverlay('Paused', 'Take a breather, pilot', 'Resume');
    } else if (state === STATE.PAUSED) {
      setState(STATE.PLAYING);
      hideOverlay();
      pauseBtn.textContent = 'Pause';
      lastTime = performance.now();
      frameId = requestAnimationFrame(gameLoop);
    }
  }

  function gameOver() {
    setState(STATE.GAME_OVER);
    playGameOver();
    cancelAnimationFrame(frameId);
    showOverlay('Mission Failed', `Final score: ${score}  ·  Wave ${wave}`, 'Try Again');
  }

  function spawnEnemy(type, x, y) {
    const def = ENEMY_TYPES[type];
    enemies.push({
      type,
      x: x ?? Math.random() * (W - def.w - 20) + 10,
      y: y ?? -def.h,
      w: def.w,
      h: def.h,
      hp: def.hp + Math.floor(wave / 4),
      speed: def.speed * getConfig().enemySpeed * (1 + wave * 0.04),
      score: def.score,
      color: def.color,
      pattern: def.pattern,
      phase: Math.random() * Math.PI * 2,
      shootTimer: 60 + Math.random() * 60,
      originX: x ?? W / 2,
    });
  }

  function spawnWaveEnemies(dt) {
    if (bossActive) return;

    spawnTimer -= dt;
    if (spawnTimer > 0) return;

    const rate = getConfig().spawnRate * Math.max(0.45, 1 - wave * 0.04);
    spawnTimer = rate * (0.6 + Math.random() * 0.8);

    if (waveKills >= waveTarget) {
      if (wave % 5 === 0) {
        bossActive = true;
        spawnEnemy('boss', W / 2 - 40, -80);
      } else {
        wave += 1;
        waveKills = 0;
        waveTarget = 10 + wave * 2;
        updateHUD();
      }
      return;
    }

    const roll = Math.random();
    let type = 'scout';
    if (wave >= 3 && roll > 0.65) type = 'bomber';
    if (wave >= 2 && roll > 0.82) type = 'kamikaze';
    spawnEnemy(type);
  }

  function spawnPowerUp(x, y) {
    if (Math.random() > 0.18) return;
    const type = POWERUP_TYPES[Math.floor(Math.random() * POWERUP_TYPES.length)];
    powerups.push({ x, y, type, w: 20, h: 20, vy: 1.2, pulse: 0 });
  }

  function addExplosion(x, y, color, count = 16) {
    for (let i = 0; i < count; i++) {
      const angle = (Math.PI * 2 * i) / count + Math.random() * 0.4;
      const speed = 1.5 + Math.random() * 4;
      particles.push({
        x,
        y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        life: 20 + Math.random() * 25,
        maxLife: 45,
        color,
        size: 2 + Math.random() * 3,
      });
    }
  }

  function rectsOverlap(a, b) {
    return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
  }

  function circleRectOverlap(cx, cy, r, rect) {
    const closestX = Math.max(rect.x, Math.min(cx, rect.x + rect.w));
    const closestY = Math.max(rect.y, Math.min(cy, rect.y + rect.h));
    const dx = cx - closestX;
    const dy = cy - closestY;
    return dx * dx + dy * dy < r * r;
  }

  function shoot() {
    const rapid = rapidFireTimer > 0;
    const cooldown = rapid ? 6 : 14;
    if (fireCooldown > 0) return;
    fireCooldown = cooldown;
    playShoot();

    bullets.push({
      x: player.x + player.w / 2 - 2,
      y: player.y - 4,
      w: 4,
      h: 10,
      vy: -9,
    });

    if (rapid) {
      bullets.push({
        x: player.x + 4,
        y: player.y + 6,
        w: 3,
        h: 8,
        vy: -8,
        vx: -0.8,
      });
      bullets.push({
        x: player.x + player.w - 7,
        y: player.y + 6,
        w: 3,
        h: 8,
        vy: -8,
        vx: 0.8,
      });
    }
  }

  function enemyShoot(enemy) {
    const cx = enemy.x + enemy.w / 2;
    const cy = enemy.y + enemy.h;
    const dx = player.x + player.w / 2 - cx;
    const dy = player.y - cy;
    const len = Math.hypot(dx, dy) || 1;
    const speed = 3.5 + wave * 0.1;
    enemyBullets.push({
      x: cx - 3,
      y: cy,
      w: 6,
      h: 6,
      vx: (dx / len) * speed,
      vy: (dy / len) * speed,
    });
  }

  function damagePlayer() {
    if (invincibleTimer > 0 || shieldTimer > 0) {
      if (shieldTimer > 0) shieldTimer = 0;
      invincibleTimer = 60;
      playHit();
      return;
    }

    lives -= 1;
    invincibleTimer = 120;
    playHit();
    addExplosion(player.x + player.w / 2, player.y + player.h / 2, '#38bdf8', 20);
    updateHUD();

    if (lives <= 0) {
      gameOver();
    }
  }

  function killEnemy(enemy, index) {
    enemy.hp -= 1;
    if (enemy.hp > 0) return;

    score += enemy.score;
    waveKills += 1;
    addExplosion(enemy.x + enemy.w / 2, enemy.y + enemy.h / 2, enemy.color, 22);
    playExplosion();
    spawnPowerUp(enemy.x + enemy.w / 2, enemy.y + enemy.h / 2);
    enemies.splice(index, 1);

    if (enemy.type === 'boss') {
      bossActive = false;
      wave += 1;
      waveKills = 0;
      waveTarget = 10 + wave * 2;
      score += 500;
    }

    updateHUD();
  }

  function applyPowerUp(type) {
    playPowerUp();
    if (type === 'rapid') rapidFireTimer = 480;
    if (type === 'shield') shieldTimer = 600;
    if (type === 'life') {
      lives += 1;
      updateHUD();
    }
  }

  function updatePlayer(dt) {
    let dx = 0;
    let dy = 0;

    if (keys.ArrowLeft || keys.a || keys.A || mobileInput.left) dx -= 1;
    if (keys.ArrowRight || keys.d || keys.D || mobileInput.right) dx += 1;
    if (keys.ArrowUp || keys.w || keys.W || mobileInput.up) dy -= 1;
    if (keys.ArrowDown || keys.s || keys.S || mobileInput.down) dy += 1;

    if (dx !== 0 || dy !== 0) {
      const len = Math.hypot(dx, dy) || 1;
      player.x += (dx / len) * player.speed * dt * 60;
      player.y += (dy / len) * player.speed * dt * 60;
    }

    player.x = Math.max(8, Math.min(W - player.w - 8, player.x));
    player.y = Math.max(H * 0.45, Math.min(H - player.h - 12, player.y));

    if (keys[' '] || mobileInput.fire) shoot();
  }

  function updateEnemies(dt) {
    for (let i = enemies.length - 1; i >= 0; i--) {
      const e = enemies[i];

      if (e.pattern === 'zigzag') {
        e.y += e.speed * dt * 60;
        e.x += Math.sin(e.phase + e.y * 0.04) * 2.2 * dt * 60;
      } else if (e.pattern === 'dive') {
        const tx = player.x + player.w / 2;
        const ty = player.y;
        const dx = tx - (e.x + e.w / 2);
        const dy = ty - (e.y + e.h / 2);
        const len = Math.hypot(dx, dy) || 1;
        e.x += (dx / len) * e.speed * dt * 60;
        e.y += (dy / len) * e.speed * dt * 60;
      } else if (e.pattern === 'boss') {
        e.y += Math.sin(e.phase) * 0.5 * dt * 60;
        e.x += Math.sin(e.phase + performance.now() * 0.001) * 1.8 * dt * 60;
        e.y = Math.max(60, Math.min(180, e.y + e.speed * 0.3 * dt * 60));
        e.x = Math.max(10, Math.min(W - e.w - 10, e.x));
      } else {
        e.y += e.speed * dt * 60;
      }

      e.shootTimer -= dt * 60;
      if ((e.type === 'bomber' || e.type === 'boss') && e.shootTimer <= 0) {
        enemyShoot(e);
        e.shootTimer = e.type === 'boss' ? 35 : 90 + Math.random() * 60;
      }

      if (e.y > H + 40 || e.x < -60 || e.x > W + 60) {
        enemies.splice(i, 1);
        continue;
      }

      if (invincibleTimer <= 0 && rectsOverlap(player, e)) {
        damagePlayer();
      }
    }
  }

  function updateBullets(dt) {
    for (let i = bullets.length - 1; i >= 0; i--) {
      const b = bullets[i];
      b.y += b.vy * dt * 60;
      if (b.vx) b.x += b.vx * dt * 60;
      if (b.y < -20) {
        bullets.splice(i, 1);
        continue;
      }

      for (let j = enemies.length - 1; j >= 0; j--) {
        if (rectsOverlap(b, enemies[j])) {
          killEnemy(enemies[j], j);
          bullets.splice(i, 1);
          break;
        }
      }
    }

    for (let i = enemyBullets.length - 1; i >= 0; i--) {
      const b = enemyBullets[i];
      b.x += b.vx * dt * 60;
      b.y += b.vy * dt * 60;
      if (b.x < -20 || b.x > W + 20 || b.y < -20 || b.y > H + 20) {
        enemyBullets.splice(i, 1);
        continue;
      }

      if (invincibleTimer <= 0 && circleRectOverlap(b.x + b.w / 2, b.y + b.h / 2, 5, player)) {
        enemyBullets.splice(i, 1);
        damagePlayer();
      }
    }
  }

  function updatePowerUps(dt) {
    for (let i = powerups.length - 1; i >= 0; i--) {
      const p = powerups[i];
      p.y += p.vy * dt * 60;
      p.pulse += dt * 8;
      if (p.y > H + 20) {
        powerups.splice(i, 1);
        continue;
      }
      if (rectsOverlap(player, p)) {
        applyPowerUp(p.type);
        powerups.splice(i, 1);
      }
    }
  }

  function updateParticles(dt) {
    for (let i = particles.length - 1; i >= 0; i--) {
      const p = particles[i];
      p.x += p.vx * dt * 60;
      p.y += p.vy * dt * 60;
      p.vy += 0.05 * dt * 60;
      p.life -= dt * 60;
      if (p.life <= 0) particles.splice(i, 1);
    }
  }

  function updateBackground(dt) {
    scrollOffset += dt * 40;
    for (const s of stars) {
      s.y += s.speed * dt * 60;
      if (s.y > H) {
        s.y = -2;
        s.x = Math.random() * W;
      }
    }
    for (const c of clouds) {
      c.y += c.speed * dt * 60;
      if (c.y > H + 40) {
        c.y = -40;
        c.x = Math.random() * W;
      }
    }
  }

  function updateTimers(dt) {
    if (fireCooldown > 0) fireCooldown -= dt * 60;
    if (rapidFireTimer > 0) rapidFireTimer -= dt * 60;
    if (shieldTimer > 0) shieldTimer -= dt * 60;
    if (invincibleTimer > 0) invincibleTimer -= dt * 60;
  }

  function drawBackground() {
    const grad = ctx.createLinearGradient(0, 0, 0, H);
    grad.addColorStop(0, '#0c1a33');
    grad.addColorStop(0.5, '#0a1628');
    grad.addColorStop(1, '#06101f');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, W, H);

    for (const c of clouds) {
      ctx.fillStyle = `rgba(148, 163, 184, ${c.opacity})`;
      ctx.beginPath();
      ctx.ellipse(c.x, c.y, c.w / 2, c.h / 2, 0, 0, Math.PI * 2);
      ctx.fill();
    }

    for (const s of stars) {
      ctx.fillStyle = `rgba(255, 255, 255, ${s.brightness})`;
      ctx.fillRect(s.x, s.y, s.size, s.size);
    }

    ctx.fillStyle = 'rgba(56, 189, 248, 0.04)';
    for (let y = (scrollOffset % 40) - 40; y < H; y += 40) {
      ctx.fillRect(0, y, W, 1);
    }
  }

  function drawPlayer() {
    const blink = invincibleTimer > 0 && Math.floor(invincibleTimer / 6) % 2 === 0;
    if (blink) return;

    const { x, y, w, h } = player;

    if (shieldTimer > 0) {
      ctx.strokeStyle = 'rgba(56, 189, 248, 0.7)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.ellipse(x + w / 2, y + h / 2, w * 0.75, h * 0.8, 0, 0, Math.PI * 2);
      ctx.stroke();
    }

    ctx.fillStyle = '#38bdf8';
    ctx.beginPath();
    ctx.moveTo(x + w / 2, y);
    ctx.lineTo(x + w, y + h);
    ctx.lineTo(x + w / 2, y + h - 8);
    ctx.lineTo(x, y + h);
    ctx.closePath();
    ctx.fill();

    ctx.fillStyle = '#0ea5e9';
    ctx.fillRect(x + 4, y + h - 10, 8, 6);
    ctx.fillRect(x + w - 12, y + h - 10, 8, 6);

    if (rapidFireTimer > 0) {
      ctx.fillStyle = '#fbbf24';
      ctx.fillRect(x + w / 2 - 2, y + h - 4, 4, 8);
    }

    const engineFlicker = Math.random() > 0.5;
    ctx.fillStyle = engineFlicker ? '#fb923c' : '#f97316';
    ctx.fillRect(x + w / 2 - 4, y + h - 2, 8, 6);
  }

  function drawEnemy(e) {
    ctx.fillStyle = e.color;

    if (e.type === 'boss') {
      ctx.fillRect(e.x + 10, e.y, e.w - 20, e.h);
      ctx.fillRect(e.x, e.y + 14, e.w, e.h - 28);
      ctx.fillStyle = '#fca5a5';
      ctx.fillRect(e.x + e.w / 2 - 8, e.y + 20, 16, 10);
      const barW = e.w - 16;
      ctx.fillStyle = '#1e293b';
      ctx.fillRect(e.x + 8, e.y - 10, barW, 6);
      ctx.fillStyle = '#ef4444';
      ctx.fillRect(e.x + 8, e.y - 10, barW * (e.hp / (ENEMY_TYPES.boss.hp + Math.floor(wave / 4))), 6);
    } else if (e.type === 'bomber') {
      ctx.fillRect(e.x + 6, e.y, e.w - 12, e.h);
      ctx.fillRect(e.x, e.y + 10, e.w, e.h - 20);
    } else if (e.type === 'kamikaze') {
      ctx.beginPath();
      ctx.moveTo(e.x + e.w / 2, e.y + e.h);
      ctx.lineTo(e.x + e.w, e.y);
      ctx.lineTo(e.x, e.y);
      ctx.closePath();
      ctx.fill();
    } else {
      ctx.beginPath();
      ctx.moveTo(e.x + e.w / 2, e.y + e.h);
      ctx.lineTo(e.x + e.w, e.y);
      ctx.lineTo(e.x, e.y);
      ctx.closePath();
      ctx.fill();
    }
  }

  function drawBullets() {
    ctx.fillStyle = '#fef08a';
    for (const b of bullets) {
      ctx.fillRect(b.x, b.y, b.w, b.h);
    }

    ctx.fillStyle = '#f87171';
    for (const b of enemyBullets) {
      ctx.beginPath();
      ctx.arc(b.x + b.w / 2, b.y + b.h / 2, 4, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  function drawPowerUps() {
    for (const p of powerups) {
      const glow = 0.6 + Math.sin(p.pulse) * 0.4;
      let color = '#fbbf24';
      let label = 'R';
      if (p.type === 'shield') { color = '#38bdf8'; label = 'S'; }
      if (p.type === 'life') { color = '#4ade80'; label = '+'; }

      ctx.fillStyle = color;
      ctx.globalAlpha = glow;
      ctx.fillRect(p.x, p.y, p.w, p.h);
      ctx.globalAlpha = 1;
      ctx.fillStyle = '#0f172a';
      ctx.font = 'bold 10px monospace';
      ctx.textAlign = 'center';
      ctx.fillText(label, p.x + p.w / 2, p.y + 14);
    }
  }

  function drawParticles() {
    for (const p of particles) {
      ctx.globalAlpha = Math.max(0, p.life / p.maxLife);
      ctx.fillStyle = p.color;
      ctx.fillRect(p.x, p.y, p.size, p.size);
    }
    ctx.globalAlpha = 1;
  }

  function drawHUD() {
    if (rapidFireTimer > 0) {
      ctx.fillStyle = 'rgba(251, 191, 36, 0.85)';
      ctx.font = '8px "Press Start 2P", monospace';
      ctx.fillText('RAPID', 12, H - 14);
    }
    if (shieldTimer > 0) {
      ctx.fillStyle = 'rgba(56, 189, 248, 0.85)';
      ctx.font = '8px "Press Start 2P", monospace';
      ctx.fillText('SHIELD', 12, H - 30);
    }
  }

  function render() {
    drawBackground();
    drawPowerUps();
    for (const e of enemies) drawEnemy(e);
    drawBullets();
    drawPlayer();
    drawParticles();
    drawHUD();
  }

  function update(dt) {
    updateBackground(dt);
    updateTimers(dt);
    updatePlayer(dt);
    spawnWaveEnemies(dt);
    updateEnemies(dt);
    updateBullets(dt);
    updatePowerUps(dt);
    updateParticles(dt);
  }

  function gameLoop(timestamp) {
    if (state !== STATE.PLAYING) return;

    const dt = Math.min((timestamp - lastTime) / 1000, 0.05);
    lastTime = timestamp;

    update(dt);
    render();

    frameId = requestAnimationFrame(gameLoop);
  }

  startBtn.addEventListener('click', () => {
    if (state === STATE.PAUSED) {
      togglePause();
    } else {
      startGame();
    }
  });

  pauseBtn.addEventListener('click', togglePause);

  restartBtn.addEventListener('click', () => {
    cancelAnimationFrame(frameId);
    startGame();
  });

  difficultyButtons.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-difficulty]');
    if (!btn || state === STATE.PLAYING || state === STATE.PAUSED) return;
    difficulty = btn.dataset.difficulty;
    difficultyButtons.querySelectorAll('.btn-difficulty').forEach((b) => b.classList.remove('active'));
    btn.classList.add('active');
  });

  document.addEventListener('keydown', (e) => {
    keys[e.key] = true;

    if (e.key === 'p' || e.key === 'P') {
      if (state === STATE.PLAYING || state === STATE.PAUSED) {
        e.preventDefault();
        togglePause();
      }
    }

    if (e.key === ' ' && state === STATE.PLAYING) {
      e.preventDefault();
      shoot();
    }

    if (e.key === 'Enter' && (state === STATE.MENU || state === STATE.GAME_OVER)) {
      startGame();
    }
  });

  document.addEventListener('keyup', (e) => {
    keys[e.key] = false;
  });

  function bindMobileButton(selector, action, value) {
    const el = document.querySelector(selector);
    if (!el) return;
    const set = (v) => { mobileInput[action] = v; };
    el.addEventListener('touchstart', (e) => { e.preventDefault(); set(true); });
    el.addEventListener('touchend', (e) => { e.preventDefault(); set(false); });
    el.addEventListener('mousedown', () => set(true));
    el.addEventListener('mouseup', () => set(false));
    el.addEventListener('mouseleave', () => set(false));
  }

  bindMobileButton('.dpad-up', 'up');
  bindMobileButton('.dpad-down', 'down');
  bindMobileButton('.dpad-left', 'left');
  bindMobileButton('.dpad-right', 'right');

  if (fireBtn) {
    const setFire = (v) => { mobileInput.fire = v; };
    fireBtn.addEventListener('touchstart', (e) => { e.preventDefault(); setFire(true); });
    fireBtn.addEventListener('touchend', (e) => { e.preventDefault(); setFire(false); });
    fireBtn.addEventListener('mousedown', () => setFire(true));
    fireBtn.addEventListener('mouseup', () => setFire(false));
    fireBtn.addEventListener('mouseleave', () => setFire(false));
  }

  resetBackground();
  render();
})();
