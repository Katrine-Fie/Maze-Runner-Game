(() => {
  const canvas = document.getElementById("game-canvas");
  const ctx = canvas.getContext("2d");
  // #region agent log
  fetch('http://127.0.0.1:7242/ingest/79997b2c-b89a-419b-8638-8fb91f3a63f7', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      id: 'log_init_canvas_ctx',
      runId: 'initial',
      hypothesisId: 'H3',
      location: 'game.js:1-4',
      message: 'Canvas and context initialization',
      data: { hasCanvas: !!canvas, hasCtx: !!ctx },
      timestamp: Date.now()
    })
  }).catch(() => {});
  // #endregion

  const scoreEl = document.getElementById("score");
  const levelEl = document.getElementById("level");
  const livesEl = document.getElementById("lives");
  const bombCountEl = document.getElementById("bomb-count");
  const shoesTimerEl = document.getElementById("shoes-timer");
  const chainsawTimerEl = document.getElementById("chainsaw-timer");
  const chainsawInventoryEl = document.getElementById("chainsaw-inventory");
  const messageEl = document.getElementById("message");

  const overlayStart = document.getElementById("overlay-start");
  const overlayGameOver = document.getElementById("overlay-gameover");
  const overlayLevel = document.getElementById("overlay-level");
  const startButton = document.getElementById("start-button");
  const restartButton = document.getElementById("restart-button");

  const TILE_SIZE = 40;
  const COLS = 20;
  const ROWS = 12;

  const PLAYER_BASE_SPEED = 150;
  const PLAYER_BOOST_MULTIPLIER = 1.8;
  const ZOMBIE_BASE_SPEED = 55;

  const SHOES_DURATION = 5;
  const BOMB_FUSE = 1.6;
  const BOMB_RADIUS = 1.8;

  const TOOLS = {
    SHOES: "shoes",
    BOMBS: "bombs",
    CHAINSAW: "chainsaw",
  };

  const CHAINSAW_DURATION = 10;

  const ZOMBIE_TYPES = {
    GREEN: "green",
    BLACK: "black",
  };

  const SCORE_VALUES = {
    GREEN: 10,
    BLACK: 25,
    LEVEL_COMPLETE: 50,
  };

  const MAX_LIVES = 3;

  const keys = {};

  const state = {
    mode: "start",
    level: 1,
    score: 0,
    lives: MAX_LIVES,
    checkpointLevel: 0,
    grid: [],
    startCell: { x: 1, y: 1 },
    exitCell: { x: COLS - 2, y: ROWS - 2 },
    player: {
      x: 0,
      y: 0,
      speed: PLAYER_BASE_SPEED,
      boostTimer: 0,
      chainsawTimer: 0,
    },
    zombies: [],
    tools: [],
    bombs: [],
    bombInventory: 0,
    chainsawInventory: 0,
    toolSpawnTimer: 0,
    messageTimer: 0,
    lastTime: performance.now(),
  };

  // --- Audio (Web Audio API, no external files) ---
  let audioCtx = null;
  let backgroundGain = null;
  let backgroundOsc1 = null;
  let backgroundOsc2 = null;
  let runningFastGain = null;
  let runningFastOsc = null;
  let chainsawGain = null;
  let chainsawOsc1 = null;
  let chainsawOsc2 = null;
  let chainsawInterval = null;
  let lastZombieCloseTime = 0;
  const ZOMBIE_CLOSE_DIST = 100;
  const ZOMBIE_CLOSE_COOLDOWN = 1.2;

  function getAudioContext() {
    if (audioCtx) return audioCtx;
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return null;
    audioCtx = new Ctx();
    return audioCtx;
  }

  function playTone(freq, duration, type, volume, rampDown = true) {
    const ctx = getAudioContext();
    if (!ctx) return null;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.type = type || "square";
    osc.frequency.setValueAtTime(freq, ctx.currentTime);
    gain.gain.setValueAtTime(volume || 0.05, ctx.currentTime);
    if (rampDown) gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + duration);
    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + duration);
    return { osc, gain };
  }

  function playBackgroundMusic() {
    const ctx = getAudioContext();
    if (!ctx || backgroundOsc1) return;
    backgroundGain = ctx.createGain();
    backgroundGain.gain.setValueAtTime(0.02, ctx.currentTime);
    backgroundGain.connect(ctx.destination);

    backgroundOsc1 = ctx.createOscillator();
    backgroundOsc2 = ctx.createOscillator();
    backgroundOsc1.type = "sine";
    backgroundOsc2.type = "sine";
    backgroundOsc1.frequency.setValueAtTime(110, ctx.currentTime);
    backgroundOsc2.frequency.setValueAtTime(165, ctx.currentTime);
    backgroundOsc1.connect(backgroundGain);
    backgroundOsc2.connect(backgroundGain);
    backgroundOsc1.start(ctx.currentTime);
    backgroundOsc2.start(ctx.currentTime);

    const loopLength = 2;
    function scheduleNext() {
      if (!backgroundOsc1 || !ctx) return;
      const t = ctx.currentTime;
      backgroundOsc1.frequency.setValueAtTime(110, t);
      backgroundOsc2.frequency.setValueAtTime(165, t);
      backgroundOsc1.frequency.linearRampToValueAtTime(130, t + loopLength * 0.5);
      backgroundOsc2.frequency.linearRampToValueAtTime(196, t + loopLength * 0.5);
      backgroundOsc1.frequency.linearRampToValueAtTime(98, t + loopLength);
      backgroundOsc2.frequency.linearRampToValueAtTime(147, t + loopLength);
    }
    scheduleNext();
    const interval = setInterval(() => {
      if (!backgroundOsc1) {
        clearInterval(interval);
        return;
      }
      scheduleNext();
    }, loopLength * 1000);
    state._bgMusicInterval = interval;
  }

  function stopBackgroundMusic() {
    if (state._bgMusicInterval) {
      clearInterval(state._bgMusicInterval);
      state._bgMusicInterval = null;
    }
    if (backgroundOsc1 && audioCtx) {
      try {
        const t = audioCtx.currentTime;
        backgroundOsc1.stop(t);
        backgroundOsc2.stop(t);
      } catch (_) {}
      backgroundOsc1 = null;
      backgroundOsc2 = null;
      backgroundGain = null;
    }
  }

  function playZombieClose() {
    const now = performance.now() / 1000;
    if (now - lastZombieCloseTime < ZOMBIE_CLOSE_COOLDOWN) return;
    lastZombieCloseTime = now;
    const ctx = getAudioContext();
    if (!ctx) return;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.type = "square";
    osc.frequency.setValueAtTime(600, ctx.currentTime);
    osc.frequency.linearRampToValueAtTime(900, ctx.currentTime + 0.2);
    gain.gain.setValueAtTime(0.02, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.3);
    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + 0.3);
  }

  function playZombieHit() {
    playTone(220, 0.12, "square", 0.06);
    setTimeout(() => {
      playTone(180, 0.15, "square", 0.05);
    }, 100);
  }

  function playGameOver() {
    stopBackgroundMusic();
    const ctx = getAudioContext();
    if (!ctx) return;
    const freqs = [660, 523, 392, 330, 262];
    freqs.forEach((f, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.type = "square";
      osc.frequency.setValueAtTime(f, ctx.currentTime);
      gain.gain.setValueAtTime(0.05, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.35);
      osc.start(ctx.currentTime + i * 0.15);
      osc.stop(ctx.currentTime + i * 0.15 + 0.35);
    });
  }

  function playBombPlant() {
    playTone(660, 0.08, "square", 0.05);
    setTimeout(() => playTone(880, 0.08, "square", 0.04), 70);
  }

  function playRunningFast() {
    const ctx = getAudioContext();
    if (!ctx || runningFastOsc) return;
    runningFastGain = ctx.createGain();
    // Much softer running sound
    runningFastGain.gain.setValueAtTime(0.01, ctx.currentTime);
    runningFastGain.connect(ctx.destination);
    runningFastOsc = ctx.createOscillator();
    // Softer timbre and lower pitch than before
    runningFastOsc.type = "sine";
    runningFastOsc.frequency.setValueAtTime(360, ctx.currentTime);
    runningFastOsc.connect(runningFastGain);
    runningFastOsc.start(ctx.currentTime);
    // #region agent log
    fetch('http://127.0.0.1:7242/ingest/79997b2c-b89a-419b-8638-8fb91f3a63f7', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        id: 'log_play_running_fast',
        runId: 'initial',
        hypothesisId: 'H_run_fast',
        location: 'game.js:230',
        message: 'playRunningFast called',
        data: { hasRunningFastOsc: !!runningFastOsc },
        timestamp: Date.now()
      })
    }).catch(() => {});
    // #endregion
  }

  function stopRunningFast() {
    // #region agent log
    fetch('http://127.0.0.1:7242/ingest/79997b2c-b89a-419b-8638-8fb91f3a63f7', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        id: 'log_stop_running_fast',
        runId: 'initial',
        hypothesisId: 'H_run_fast',
        location: 'game.js:243',
        message: 'stopRunningFast called',
        data: { hasRunningFastOsc: !!runningFastOsc, hasAudioCtx: !!audioCtx },
        timestamp: Date.now()
      })
    }).catch(() => {});
    // #endregion
    if (!runningFastOsc || !audioCtx) return;
    try {
      runningFastGain.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.15);
      runningFastOsc.stop(audioCtx.currentTime + 0.15);
    } catch (_) {}
    runningFastOsc = null;
    runningFastGain = null;
  }

  function playChainsawLoop() {
    const ctx = getAudioContext();
    if (!ctx || chainsawOsc1) return;
    chainsawGain = ctx.createGain();
    chainsawGain.gain.setValueAtTime(0.12, ctx.currentTime);
    chainsawGain.connect(ctx.destination);
    chainsawOsc1 = ctx.createOscillator();
    chainsawOsc2 = ctx.createOscillator();
    chainsawOsc1.type = "sawtooth";
    chainsawOsc2.type = "sawtooth";
    chainsawOsc1.frequency.setValueAtTime(80, ctx.currentTime);
    chainsawOsc2.frequency.setValueAtTime(120, ctx.currentTime);
    chainsawOsc1.connect(chainsawGain);
    chainsawOsc2.connect(chainsawGain);
    chainsawOsc1.start(ctx.currentTime);
    chainsawOsc2.start(ctx.currentTime);
    chainsawInterval = setInterval(() => {
      if (!chainsawOsc1 || !audioCtx) return;
      const t = audioCtx.currentTime;
      chainsawOsc1.frequency.setValueAtTime(75, t);
      chainsawOsc2.frequency.setValueAtTime(115, t);
      chainsawOsc1.frequency.linearRampToValueAtTime(85, t + 0.08);
      chainsawOsc2.frequency.linearRampToValueAtTime(125, t + 0.08);
    }, 160);
  }

  function stopChainsawSound() {
    if (chainsawInterval) {
      clearInterval(chainsawInterval);
      chainsawInterval = null;
    }
    if (chainsawOsc1 && audioCtx) {
      try {
        const t = audioCtx.currentTime;
        chainsawGain.gain.exponentialRampToValueAtTime(0.01, t + 0.1);
        chainsawOsc1.stop(t + 0.1);
        chainsawOsc2.stop(t + 0.1);
      } catch (_) {}
      chainsawOsc1 = null;
      chainsawOsc2 = null;
      chainsawGain = null;
    }
  }

  function playPowerDown() {
    const ctx = getAudioContext();
    if (!ctx) return;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.type = "sawtooth";
    osc.frequency.setValueAtTime(150, ctx.currentTime);
    osc.frequency.linearRampToValueAtTime(60, ctx.currentTime + 0.25);
    gain.gain.setValueAtTime(0.08, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.3);
    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + 0.3);
  }

  function playFinishLine() {
    const ctx = getAudioContext();
    if (!ctx) return;
    const freqs = [523, 659, 784, 1047];
    freqs.forEach((f, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.type = "square";
      osc.frequency.setValueAtTime(f, ctx.currentTime);
      gain.gain.setValueAtTime(0.05, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.2);
      osc.start(ctx.currentTime + i * 0.12);
      osc.stop(ctx.currentTime + i * 0.12 + 0.2);
    });
  }

  function cellToWorld(x, y) {
    return {
      x: x * TILE_SIZE + TILE_SIZE / 2,
      y: y * TILE_SIZE + TILE_SIZE / 2,
    };
  }

  function showMessage(text, seconds = 2) {
    if (!messageEl) return;
    messageEl.textContent = text;
    state.messageTimer = seconds;
  }

  function updateHud() {
    if (scoreEl) scoreEl.textContent = state.score.toString();
    if (levelEl) levelEl.textContent = state.level.toString();
    const checkpointEl = document.getElementById("checkpoint");
    if (checkpointEl) checkpointEl.textContent = (state.checkpointLevel ?? 0).toString();
    if (livesEl) {
      livesEl.textContent = "❤️".repeat(state.lives);
    }
    if (bombCountEl) bombCountEl.textContent = state.bombInventory.toString();
    if (shoesTimerEl) {
      if (state.player.boostTimer > 0) {
        shoesTimerEl.textContent = state.player.boostTimer.toFixed(1) + "s";
      } else {
        shoesTimerEl.textContent = "-";
      }
    }
    if (chainsawInventoryEl) {
      const n = state.chainsawInventory || 0;
      chainsawInventoryEl.textContent = "🪚 ×" + n;
    }
    if (chainsawTimerEl) {
      if (state.player.chainsawTimer > 0) {
        chainsawTimerEl.textContent = Math.ceil(state.player.chainsawTimer) + "s";
      } else {
        chainsawTimerEl.textContent = "-";
      }
    }
  }

  function createEmptyGrid() {
    const grid = [];
    for (let y = 0; y < ROWS; y++) {
      const row = [];
      for (let x = 0; x < COLS; x++) {
        row.push(1);
      }
      grid.push(row);
    }
    return grid;
  }

  function carvePath(grid, start, exit) {
    const visited = new Set();
    const cells = [];
    let cx = start.x;
    let cy = start.y;
    cells.push({ x: cx, y: cy });
    visited.add(`${cx},${cy}`);
    grid[cy][cx] = 0;

    let safety = COLS * ROWS * 4;

    while ((cx !== exit.x || cy !== exit.y) && safety-- > 0) {
      const dirs = [
        { x: 1, y: 0 },
        { x: -1, y: 0 },
        { x: 0, y: 1 },
        { x: 0, y: -1 },
      ];
      for (let i = dirs.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        const tmp = dirs[i];
        dirs[i] = dirs[j];
        dirs[j] = tmp;
      }

      let moved = false;
      for (const d of dirs) {
        const nx = cx + d.x;
        const ny = cy + d.y;
        if (nx < 1 || nx >= COLS - 1 || ny < 1 || ny >= ROWS - 1) {
          continue;
        }
        const key = `${nx},${ny}`;
        if (!visited.has(key)) {
          cx = nx;
          cy = ny;
          visited.add(key);
          cells.push({ x: cx, y: cy });
          grid[cy][cx] = 0;
          moved = true;
          break;
        }
      }

      if (!moved) {
        if (cells.length <= 1) break;
        const idx = Math.floor(Math.random() * cells.length);
        cx = cells[idx].x;
        cy = cells[idx].y;
      }
    }

    return cells;
  }

  function generateMaze(level) {
    const grid = createEmptyGrid();
    const start = { x: 1, y: 1 };
    const exit = { x: COLS - 2, y: ROWS - 2 };

    const pathCells = carvePath(grid, start, exit);
    const difficulty = getDifficulty(level);

    for (let y = 1; y < ROWS - 1; y++) {
      for (let x = 1; x < COLS - 1; x++) {
        const onPath = pathCells.some((c) => c.x === x && c.y === y);
        if (onPath) {
          grid[y][x] = 0;
        } else {
          let baseChance = 0.35;
          if (difficulty === "medium") baseChance = 0.5;
          else if (difficulty === "hard") baseChance = 0.6;
          else if (difficulty === "expert") baseChance = 0.7;
          const extra = 0;
          const wallChance = baseChance + extra;
          grid[y][x] = Math.random() < wallChance ? 1 : 0;
        }
      }
    }

    const nearExit = [
      { x: exit.x - 1, y: exit.y },
      { x: exit.x, y: exit.y - 1 },
    ];
    for (const c of nearExit) {
      if (c.x > 0 && c.x < COLS && c.y > 0 && c.y < ROWS) {
        grid[c.y][c.x] = 0;
      }
    }

    grid[start.y][start.x] = 0;
    grid[exit.y][exit.x] = 0;

    return { grid, start, exit };
  }

  function randomFloorCell(minDistanceFromStart = 0) {
    const attempts = 200;
    const sx = state.startCell.x;
    const sy = state.startCell.y;
    for (let i = 0; i < attempts; i++) {
      const x = 1 + Math.floor(Math.random() * (COLS - 2));
      const y = 1 + Math.floor(Math.random() * (ROWS - 2));
      if (state.grid[y][x] !== 0) continue;
      const dx = x - sx;
      const dy = y - sy;
      if (Math.hypot(dx, dy) < minDistanceFromStart) continue;
      return { x, y };
    }
    return { x: sx, y: sy };
  }

  function isWallAtPixel(x, y) {
    const cx = Math.floor(x / TILE_SIZE);
    const cy = Math.floor(y / TILE_SIZE);
    if (cx < 0 || cy < 0 || cx >= COLS || cy >= ROWS) return true;
    return state.grid[cy][cx] === 1;
  }

  function canMoveCircle(cx, cy, radius) {
    const minX = Math.floor((cx - radius) / TILE_SIZE);
    const maxX = Math.floor((cx + radius) / TILE_SIZE);
    const minY = Math.floor((cy - radius) / TILE_SIZE);
    const maxY = Math.floor((cy + radius) / TILE_SIZE);
    for (let y = minY; y <= maxY; y++) {
      for (let x = minX; x <= maxX; x++) {
        if (x < 0 || y < 0 || x >= COLS || y >= ROWS) continue;
        if (state.grid[y][x] === 1) {
          const rx = x * TILE_SIZE;
          const ry = y * TILE_SIZE;
          if (
            cx + radius > rx &&
            cx - radius < rx + TILE_SIZE &&
            cy + radius > ry &&
            cy - radius < ry + TILE_SIZE
          ) {
            return false;
          }
        }
      }
    }
    return true;
  }

  function getDifficulty(level) {
    if (level <= 5) return "easy";
    if (level <= 10) return "medium";
    if (level <= 15) return "hard";
    return "expert";
  }

  function resetLevel() {
    // #region agent log
    fetch('http://127.0.0.1:7242/ingest/79997b2c-b89a-419b-8638-8fb91f3a63f7', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        id: 'log_before_generate_maze',
        runId: 'initial',
        hypothesisId: 'H1',
        location: 'game.js:254',
        message: 'Calling generateMaze in resetLevel',
        data: { currentLevel: state.level },
        timestamp: Date.now()
      })
    }).catch(() => {});
    // #endregion
    const { grid, start, exit } = generateMaze(state.level);
    state.grid = grid;
    state.startCell = start;
    state.exitCell = exit;

    const startWorld = cellToWorld(start.x, start.y);
    state.player.x = startWorld.x;
    state.player.y = startWorld.y;
    state.player.speed = PLAYER_BASE_SPEED;
    state.player.boostTimer = 0;
    state.player.chainsawTimer = 0;
    stopChainsawSound();

    state.zombies = [];
    const difficulty = getDifficulty(state.level);
    let total;
    if (difficulty === "easy") {
      total = 2;
    } else if (difficulty === "medium") {
      total = 3 + Math.min(state.level - 5, 2);
    } else if (difficulty === "hard") {
      total = 5;
    } else {
      total = 6;
    }
    for (let i = 0; i < total; i++) {
      const cell = randomFloorCell(5);
      const world = cellToWorld(cell.x, cell.y);
      let type = ZOMBIE_TYPES.GREEN;
      if (difficulty === "hard" || difficulty === "expert") {
        type = Math.random() < 0.3 ? ZOMBIE_TYPES.BLACK : ZOMBIE_TYPES.GREEN;
      }
      let speedMultiplier = 1;
      if (difficulty === "medium") speedMultiplier = 1.2;
      else if (difficulty === "hard") speedMultiplier = 1.4;
      else if (difficulty === "expert") speedMultiplier = 1.7;
      const speed =
        ZOMBIE_BASE_SPEED * speedMultiplier * (type === ZOMBIE_TYPES.BLACK ? 1.1 : 1);
      state.zombies.push({
        x: world.x,
        y: world.y,
        speed,
        type,
      });
    }

    state.tools = [];
    state.bombs = [];
    state.toolSpawnTimer = 3;

    if (overlayLevel) {
      overlayLevel.classList.add("visible");
      setTimeout(() => {
        overlayLevel.classList.remove("visible");
      }, 1200);
    }

    showMessage("Find the exit and avoid the zombies!");
    updateHud();
  }

  function startGame() {
    if (state.mode === "running") return;
    state.mode = "running";
    state.level = state.level ?? 1;
    state.score = state.score || 0;
    state.lives = state.lives || MAX_LIVES;
    // #region agent log
    fetch('http://127.0.0.1:7242/ingest/79997b2c-b89a-419b-8638-8fb91f3a63f7', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        id: 'log_start_game',
        runId: 'initial',
        hypothesisId: 'H2',
        location: 'game.js:300-306',
        message: 'startGame called, state before resetLevel',
        data: { mode: state.mode, level: state.level, lives: state.lives },
        timestamp: Date.now()
      })
    }).catch(() => {});
    // #endregion
    resetLevel();
    if (overlayStart) overlayStart.classList.remove("visible");
    if (overlayGameOver) overlayGameOver.classList.remove("visible");
    state.lastTime = performance.now();
    const ctx = getAudioContext();
    if (ctx && ctx.state === "suspended") ctx.resume();
    playBackgroundMusic();
  }

  function gameOver() {
    state.mode = "gameover";
    if (overlayGameOver) overlayGameOver.classList.add("visible");
    showMessage("Game over. Press Restart to try again.");
    stopRunningFast();
    stopChainsawSound();
    playGameOver();
  }

  function restartGame() {
    const stored = Number(localStorage.getItem("zombieLabyrinthCheckpoint") || "0");
    const base = Number.isFinite(stored) ? stored : 0;
    state.checkpointLevel = base;
    state.level = base === 0 ? 1 : base;
    state.score = 0;
    state.lives = MAX_LIVES;
    startGame();
  }

  function updatePlayer(dt) {
    let vx = 0;
    let vy = 0;
    if (keys["ArrowUp"]) vy -= 1;
    if (keys["ArrowDown"]) vy += 1;
    if (keys["ArrowLeft"]) vx -= 1;
    if (keys["ArrowRight"]) vx += 1;

    if (vx !== 0 || vy !== 0) {
      const len = Math.hypot(vx, vy) || 1;
      vx /= len;
      vy /= len;
      const speed =
        PLAYER_BASE_SPEED *
        (state.player.boostTimer > 0 ? PLAYER_BOOST_MULTIPLIER : 1);
      const step = speed * dt;

      const radius = TILE_SIZE * 0.3;

      const nx = state.player.x + vx * step;
      if (canMoveCircle(nx, state.player.y, radius)) {
        state.player.x = nx;
      }
      const ny = state.player.y + vy * step;
      if (canMoveCircle(state.player.x, ny, radius)) {
        state.player.y = ny;
      }
    }

    const wasBoostActive = state.player.boostTimer > 0;
    if (state.player.boostTimer > 0) {
      state.player.boostTimer = Math.max(0, state.player.boostTimer - dt);
    }
    if (wasBoostActive && state.player.boostTimer <= 0) {
      // #region agent log
      fetch('http://127.0.0.1:7242/ingest/79997b2c-b89a-419b-8638-8fb91f3a63f7', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: 'log_stop_running_fast_from_updatePlayer',
          runId: 'initial',
          hypothesisId: 'H_run_fast',
          location: 'game.js:623',
          message: 'Stopping running fast sound because boost expired',
          data: { previousBoost: wasBoostActive, newBoost: state.player.boostTimer },
          timestamp: Date.now()
        })
      }).catch(() => {});
      // #endregion
      stopRunningFast();
    }

    const wasChainsawActive = state.player.chainsawTimer > 0;
    if (state.player.chainsawTimer > 0) {
      state.player.chainsawTimer = Math.max(0, state.player.chainsawTimer - dt);
    }
    if (wasChainsawActive && state.player.chainsawTimer <= 0) {
      stopChainsawSound();
      playPowerDown();
    }

    const exitWorld = cellToWorld(state.exitCell.x, state.exitCell.y);
    const distExit = Math.hypot(
      state.player.x - exitWorld.x,
      state.player.y - exitWorld.y
    );
    if (distExit < TILE_SIZE * 0.4) {
      // Stop any running-shoes and chainsaw sound immediately on level complete
      stopRunningFast();
      state.player.boostTimer = 0;
      stopChainsawSound();
      state.player.chainsawTimer = 0;
      playFinishLine();
      state.score += SCORE_VALUES.LEVEL_COMPLETE;
      state.level += 1;
      if (state.level % 5 === 0) {
        state.checkpointLevel = state.level;
        try {
          localStorage.setItem("zombieLabyrinthCheckpoint", String(state.level));
        } catch (_) {}
        showMessage("CHECKPOINT REACHED!");
      }
      showMessage("Level complete! New labyrinth...");
      resetLevel();
      updateHud();
    }
  }

  function updateZombies(dt) {
    const playerPos = { x: state.player.x, y: state.player.y };
    const radius = TILE_SIZE * 0.3;
    const chainsawActive = state.player.chainsawTimer > 0;
    const touchDist = TILE_SIZE * 0.45;

    const zombiesToRemove = [];
    for (const z of state.zombies) {
      const dx = playerPos.x - z.x;
      const dy = playerPos.y - z.y;
      const dist = Math.hypot(dx, dy);
      if (dist > 1) {
        const ux = dx / dist;
        const uy = dy / dist;
        const step = z.speed * dt;

        const nx = z.x + ux * step;
        if (canMoveCircle(nx, z.y, radius)) {
          z.x = nx;
        }
        const ny = z.y + uy * step;
        if (canMoveCircle(z.x, ny, radius)) {
          z.y = ny;
        }
      }

      const dPlayer = Math.hypot(z.x - playerPos.x, z.y - playerPos.y);
      if (dPlayer < touchDist) {
        if (chainsawActive) {
          state.score += (z.type === ZOMBIE_TYPES.BLACK ? SCORE_VALUES.BLACK : SCORE_VALUES.GREEN) * 2;
          zombiesToRemove.push(z);
          updateHud();
        } else {
          playZombieHit();
          state.lives -= 1;
          updateHud();
          if (state.lives <= 0) {
            gameOver();
          } else {
            showMessage("Ouch! You lost a life.");
            const startWorld = cellToWorld(
              state.startCell.x,
              state.startCell.y
            );
            state.player.x = startWorld.x;
            state.player.y = startWorld.y;
          }
          break;
        }
      }
    }
    state.zombies = state.zombies.filter((z) => !zombiesToRemove.includes(z));
    let minZombieDist = Infinity;
    for (const z of state.zombies) {
      const d = Math.hypot(z.x - playerPos.x, z.y - playerPos.y);
      if (d < minZombieDist) minZombieDist = d;
    }
    if (minZombieDist < ZOMBIE_CLOSE_DIST && minZombieDist >= TILE_SIZE * 0.45) {
      playZombieClose();
    }
  }

  function spawnTool() {
    const roll = Math.random();
    const type = roll < 0.34 ? TOOLS.SHOES : roll < 0.67 ? TOOLS.BOMBS : TOOLS.CHAINSAW;
    let cell = randomFloorCell(3);
    const maxAttempts = 50;
    for (let i = 0; i < maxAttempts && cell.x === state.exitCell.x && cell.y === state.exitCell.y; i++) {
      cell = randomFloorCell(3);
    }
    if (cell.x === state.exitCell.x && cell.y === state.exitCell.y) return;
    const world = cellToWorld(cell.x, cell.y);
    state.tools.push({
      x: world.x,
      y: world.y,
      type,
    });
  }

  function updateTools(dt) {
    state.toolSpawnTimer -= dt;
    if (state.toolSpawnTimer <= 0 && state.tools.length < 3) {
      spawnTool();
      const base = 8;
      const extra = Math.max(0, 6 - state.level);
      state.toolSpawnTimer = base + extra * 0.5;
    }

    const radius = TILE_SIZE * 0.35;
    state.tools = state.tools.filter((tool) => {
      const d = Math.hypot(tool.x - state.player.x, tool.y - state.player.y);
      if (d < radius) {
        if (tool.type === TOOLS.SHOES) {
          state.player.boostTimer = SHOES_DURATION;
          playRunningFast();
          showMessage("Speed shoes collected!");
        } else if (tool.type === TOOLS.BOMBS) {
          state.bombInventory += 1;
          showMessage("Bomb collected!");
        } else if (tool.type === TOOLS.CHAINSAW) {
          state.chainsawInventory = (state.chainsawInventory || 0) + 1;
          showMessage("Chainsaw added! Press C or tap 🪚 to use.");
        }
        updateHud();
        return false;
      }
      return true;
    });
  }

  function activateChainsaw() {
    if (state.mode !== "running" || (state.chainsawInventory || 0) <= 0 || state.player.chainsawTimer > 0) return;
    state.chainsawInventory -= 1;
    state.player.chainsawTimer = CHAINSAW_DURATION;
    playChainsawLoop();
    showMessage("Chainsaw activated!");
    updateHud();
  }

  function dropBomb() {
    if (state.bombInventory <= 0 || state.mode !== "running") return;
    state.bombInventory -= 1;
    playBombPlant();
    const cellX = Math.floor(state.player.x / TILE_SIZE);
    const cellY = Math.floor(state.player.y / TILE_SIZE);
    const world = cellToWorld(cellX, cellY);
    state.bombs.push({
      x: world.x,
      y: world.y,
      fuse: BOMB_FUSE,
      exploded: false,
      explosionTimer: 0,
    });
    updateHud();
  }

  function updateBombs(dt) {
    for (const bomb of state.bombs) {
      if (!bomb.exploded) {
        bomb.fuse -= dt;
        if (bomb.fuse <= 0) {
          bomb.exploded = true;
          bomb.explosionTimer = 0.35;
          const maxDist = BOMB_RADIUS * TILE_SIZE;
          const maxDistSq = maxDist * maxDist;

          const remainingZombies = [];
          for (const z of state.zombies) {
            const d2 = (z.x - bomb.x) * (z.x - bomb.x) + (z.y - bomb.y) * (z.y - bomb.y);
            if (d2 <= maxDistSq) {
              state.score +=
                z.type === ZOMBIE_TYPES.BLACK
                  ? SCORE_VALUES.BLACK
                  : SCORE_VALUES.GREEN;
            } else {
              remainingZombies.push(z);
            }
          }
          state.zombies = remainingZombies;

          const cx = Math.floor(bomb.x / TILE_SIZE);
          const cy = Math.floor(bomb.y / TILE_SIZE);
          for (let dy = -1; dy <= 1; dy++) {
            for (let dx = -1; dx <= 1; dx++) {
              const x = cx + dx;
              const y = cy + dy;
              if (
                x <= 0 ||
                y <= 0 ||
                x >= COLS - 1 ||
                y >= ROWS - 1
              ) {
                continue;
              }
              if (Math.random() < 0.6 && !(x === state.startCell.x && y === state.startCell.y)) {
                state.grid[y][x] = 0;
              }
            }
          }

          updateHud();
        }
      } else {
        bomb.explosionTimer -= dt;
      }
    }

    state.bombs = state.bombs.filter(
      (b) => !b.exploded || b.explosionTimer > 0
    );
  }

  function update(dt) {
    if (state.mode !== "running") return;

    updatePlayer(dt);
    updateZombies(dt);
    updateTools(dt);
    updateBombs(dt);

    if (state.messageTimer > 0) {
      state.messageTimer -= dt;
      if (state.messageTimer <= 0 && messageEl) {
        messageEl.textContent = "";
      }
    }
  }

  function drawGrid() {
    // #region agent log
    fetch('http://127.0.0.1:7242/ingest/79997b2c-b89a-419b-8638-8fb91f3a63f7', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        id: 'log_draw_grid_entry',
        runId: 'initial',
        hypothesisId: 'H1',
        location: 'game.js:542',
        message: 'Entering drawGrid',
        data: {
          gridLength: Array.isArray(state.grid) ? state.grid.length : -1,
          firstRowLength: Array.isArray(state.grid) && state.grid[0] ? state.grid[0].length : -1
        },
        timestamp: Date.now()
      })
    }).catch(() => {});
    // #endregion

    if (
      !Array.isArray(state.grid) ||
      state.grid.length !== ROWS ||
      !Array.isArray(state.grid[0]) ||
      state.grid[0].length !== COLS
    ) {
      ctx.fillStyle = "#020617";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      return;
    }
    for (let y = 0; y < ROWS; y++) {
      for (let x = 0; x < COLS; x++) {
        const rx = x * TILE_SIZE;
        const ry = y * TILE_SIZE;
        if (state.grid[y][x] === 1) {
          const grad = ctx.createLinearGradient(rx, ry, rx + TILE_SIZE, ry + TILE_SIZE);
          grad.addColorStop(0, "#1f2937");
          grad.addColorStop(1, "#111827");
          ctx.fillStyle = grad;
          ctx.fillRect(rx, ry, TILE_SIZE, TILE_SIZE);
        } else {
          ctx.fillStyle = "#e5f6ff";
          ctx.fillRect(rx, ry, TILE_SIZE, TILE_SIZE);
        }
      }
    }

    const exitWorld = cellToWorld(state.exitCell.x, state.exitCell.y);
    const r = TILE_SIZE * 0.35;
    const grad = ctx.createRadialGradient(
      exitWorld.x,
      exitWorld.y,
      0,
      exitWorld.x,
      exitWorld.y,
      r
    );
    grad.addColorStop(0, "rgba(56,189,248,0.9)");
    grad.addColorStop(1, "rgba(8,47,73,0.1)");
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(exitWorld.x, exitWorld.y, r, 0, Math.PI * 2);
    ctx.fill();
  }

  function drawPlayer() {
    const size = TILE_SIZE * 0.6;
    const x = state.player.x - size / 2;
    const y = state.player.y - size / 2;
    const chainsawOn = state.player.chainsawTimer > 0;
    const flash = chainsawOn && Math.floor(Date.now() / 200) % 2 === 0;

    const grad = ctx.createLinearGradient(x, y, x + size, y + size);
    if (chainsawOn && flash) {
      grad.addColorStop(0, "#dc2626");
      grad.addColorStop(1, "#991b1b");
    } else {
      grad.addColorStop(0, "#38bdf8");
      grad.addColorStop(1, "#0ea5e9");
    }

    ctx.fillStyle = grad;
    ctx.fillRect(x, y, size, size);

    ctx.strokeStyle = chainsawOn ? "#7f1d1d" : "#0f172a";
    ctx.lineWidth = 2;
    ctx.strokeRect(x + 1, y + 1, size - 2, size - 2);

    ctx.font = "20px system-ui, sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillStyle = "#e5e7eb";
    ctx.fillText("🧑", state.player.x, state.player.y);
    if (chainsawOn) {
      const exitWorld = cellToWorld(state.exitCell.x, state.exitCell.y);
      const distToExit = Math.hypot(state.player.x - exitWorld.x, state.player.y - exitWorld.y);
      const atExit = distToExit < TILE_SIZE * 0.5;
      // #region agent log
      if (atExit) {
        fetch('http://127.0.0.1:7242/ingest/79997b2c-b89a-419b-8638-8fb91f3a63f7',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'game.js:drawPlayer',message:'player_chainsaw_skipped_at_exit',data:{distToExit,playerX:state.player.x,playerY:state.player.y},timestamp:Date.now(),hypothesisId:'H2'})}).catch(()=>{});
      }
      // #endregion
      if (!atExit) {
        ctx.font = "18px system-ui, sans-serif";
        ctx.fillText("🪚", state.player.x + size * 0.5, state.player.y - size * 0.3);
      }
    }
  }

  function drawZombies() {
    for (const z of state.zombies) {
      const size = TILE_SIZE * 0.6;
      const x = z.x - size / 2;
      const y = z.y - size / 2;

      let startColor;
      let endColor;
      let faceColor;
      if (z.type === ZOMBIE_TYPES.BLACK) {
        startColor = "#111827";
        endColor = "#020617";
        faceColor = "#f9fafb";
      } else {
        startColor = "#22c55e";
        endColor = "#15803d";
        faceColor = "#dcfce7";
      }

      const grad = ctx.createLinearGradient(x, y, x + size, y + size);
      grad.addColorStop(0, startColor);
      grad.addColorStop(1, endColor);

      ctx.fillStyle = grad;
      ctx.fillRect(x, y, size, size);

      ctx.strokeStyle = "#020617";
      ctx.lineWidth = 2;
      ctx.strokeRect(x + 1, y + 1, size - 2, size - 2);

      ctx.font = "20px system-ui, sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillStyle = faceColor;
      ctx.fillText("🧟", z.x, z.y);
    }
  }

  function drawTools() {
    const exitWorld = cellToWorld(state.exitCell.x, state.exitCell.y);
    for (const t of state.tools) {
      const distToExit = Math.hypot(t.x - exitWorld.x, t.y - exitWorld.y);
      if (distToExit < TILE_SIZE * 0.5) continue;
      const size = TILE_SIZE * 0.5;
      const x = t.x - size / 2;
      const y = t.y - size / 2;

      const grad = ctx.createLinearGradient(x, y, x + size, y + size);
      if (t.type === TOOLS.SHOES) {
        grad.addColorStop(0, "#22c55e");
        grad.addColorStop(1, "#16a34a");
      } else if (t.type === TOOLS.CHAINSAW) {
        grad.addColorStop(0, "#9ca3af");
        grad.addColorStop(1, "#4b5563");
      } else {
        grad.addColorStop(0, "#fbbf24");
        grad.addColorStop(1, "#f97316");
      }

      ctx.fillStyle = grad;
      ctx.fillRect(x, y, size, size);

      ctx.strokeStyle = "#111827";
      ctx.lineWidth = 2;
      ctx.strokeRect(x + 1, y + 1, size - 2, size - 2);

      ctx.font = "18px system-ui, sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillStyle = "#111827";
      const icon = t.type === TOOLS.SHOES ? "👟" : t.type === TOOLS.CHAINSAW ? "🪚" : "💣";
      ctx.fillText(icon, t.x, t.y);
    }
  }

  function drawBombs() {
    for (const b of state.bombs) {
      if (!b.exploded) {
        const t = Math.max(0, b.fuse / BOMB_FUSE);
        const pulse = 1 + Math.sin((1 - t) * Math.PI * 4) * 0.15;
        const r = TILE_SIZE * 0.35 * pulse;

        const grad = ctx.createRadialGradient(b.x, b.y, 2, b.x, b.y, r);
        grad.addColorStop(0, "#facc15");
        grad.addColorStop(1, "#eab308");

        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.arc(b.x, b.y, r, 0, Math.PI * 2);
        ctx.fill();

        ctx.font = "18px system-ui, sans-serif";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillStyle = "#1f2937";
        ctx.fillText("💣", b.x, b.y);
      } else {
        const t = Math.max(0, b.explosionTimer / 0.35);
        const maxR = BOMB_RADIUS * TILE_SIZE;
        const r = maxR * (0.6 + 0.4 * t);

        const grad = ctx.createRadialGradient(b.x, b.y, 4, b.x, b.y, r);
        grad.addColorStop(0, "rgba(250,250,250,0.95)");
        grad.addColorStop(0.3, "rgba(253,224,71,0.9)");
        grad.addColorStop(0.6, "rgba(249,115,22,0.75)");
        grad.addColorStop(1, "rgba(0,0,0,0)");

        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.arc(b.x, b.y, r, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }

  function render() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    drawGrid();
    drawTools();
    drawBombs();
    drawZombies();
    drawPlayer();

    const difficulty = getDifficulty(state.level);
    if (difficulty === "expert") {
      const radiusInner = TILE_SIZE * 1.5;
      const radiusOuter = TILE_SIZE * 4;
      const gx = state.player.x;
      const gy = state.player.y;
      const grad = ctx.createRadialGradient(gx, gy, radiusInner, gx, gy, radiusOuter);
      grad.addColorStop(0, "rgba(0,0,0,0)");
      grad.addColorStop(1, "rgba(0,0,0,0.85)");
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, canvas.width, canvas.height);
    }
  }

  function loop() {
    const now = performance.now();
    const dt = Math.min((now - state.lastTime) / 1000, 0.05);
    state.lastTime = now;

    update(dt);
    render();

    requestAnimationFrame(loop);
  }

  window.addEventListener("keydown", (event) => {
    if (["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", " ", "c", "C"].includes(event.key)) {
      event.preventDefault();
    }
    if (event.key === " ") {
      dropBomb();
    } else if (event.key.toLowerCase() === "c") {
      activateChainsaw();
    } else if (event.key === "Enter") {
      if (state.mode === "start") {
        startGame();
      } else if (state.mode === "gameover") {
        restartGame();
      }
    } else {
      keys[event.key] = true;
    }
  });

  window.addEventListener("keyup", (event) => {
    keys[event.key] = false;
  });

  if (startButton) {
    startButton.addEventListener("click", () => {
      startGame();
    });
  }

  if (restartButton) {
    restartButton.addEventListener("click", () => {
      restartGame();
    });
  }

  const resetProgressBtn = document.getElementById("reset-progress-button");
  if (resetProgressBtn) {
    resetProgressBtn.addEventListener("click", () => {
      try {
        localStorage.removeItem("zombieLabyrinthCheckpoint");
      } catch (_) {}
      state.checkpointLevel = 0;
      state.level = 1;
      state.score = 0;
      state.lives = MAX_LIVES;
      updateHud();
      startGame();
    });
  }

  updateHud();
  loop();
})();

