// Logical court coordinates are independent of screen size and pixel density.
(() => {
  'use strict';
  const COURT = Object.freeze({ width: 960, height: 540, dishRadius: 44, ballRadius: 14, winningScore: 3 });
  const clamp = (value, low, high) => Math.max(low, Math.min(high, value));

  class PongGame {
    constructor(random = Math.random) {
      this.random = random;
      this.restart();
    }

    restart() {
      this.state = 'ready';
      this.player = { x: 68, y: COURT.height / 2, vy: 0, score: 0 };
      this.cpu = { x: COURT.width - 68, y: COURT.height / 2, vy: 0, score: 0 };
      this.ball = { x: COURT.width / 2, y: COURT.height / 2, vx: 0, vy: 0, angle: 0, spin: 0 };
      this.cpuTarget = COURT.height / 2;
      this.cpuReaction = 0;
      this.events = [];
      this.serveDelay = 0;
      this.serveDirection = this.random() < .5 ? -1 : 1;
      this.rally = 0;
      this.pointerFrom = null;
      this.winner = null;
    }

    start() {
      if (this.state !== 'ready' && this.state !== 'paused') return;
      if (this.state === 'ready') this.serve();
      this.state = 'playing';
    }

    pause() {
      if (this.state === 'playing') this.state = 'paused';
    }

    // Pointer moves land between steps; remember the start so a hit still feels the swing.
    dragPlayerTo(y) {
      if (this.pointerFrom == null) this.pointerFrom = this.player.y;
      this.setPlayerY(y);
    }

    setPlayerY(y) {
      if (Number.isFinite(y) && this.state !== 'finished') {
        this.player.y = clamp(y, COURT.dishRadius, COURT.height - COURT.dishRadius);
      }
    }

    serve() {
      this.ball.x = COURT.width / 2;
      this.ball.y = COURT.height / 2;
      const angle = (this.random() - .5) * .8;
      this.ball.vx = this.serveDirection * 390 * Math.cos(angle);
      this.ball.vy = 390 * Math.sin(angle);
      this.ball.spin = this.serveDirection * 3;
      this.rally = 0;
      if (this.ball.vx > 0) this.aimCpu();
    }

    // Where the plasmid will cross the lab bacterium's line, folding in wall bounces.
    predictY() {
      const ball = this.ball, low = COURT.ballRadius, span = COURT.height - 2 * low;
      const travel = (this.cpu.x - COURT.dishRadius - ball.x) / ball.vx;
      const y = ball.y + ball.vy * Math.max(0, travel) - low;
      const folded = ((y % (2 * span)) + 2 * span) % (2 * span);
      return low + (folded > span ? 2 * span - folded : folded);
    }

    // The lab bacterium reads each return a moment late and misjudges fast or steep ones,
    // so a sharp edge hit is the way to beat it. It sharpens up when it falls behind.
    aimCpu() {
      const speed = Math.hypot(this.ball.vx, this.ball.vy);
      const steep = Math.abs(this.ball.vy) / speed;
      const behind = this.player.score - this.cpu.score;
      const error = (speed - 330) * .16 + steep * 70 - behind * 12;
      this.cpuTarget = this.predictY() + (this.random() - .5) * 2 * Math.max(10, error);
      this.cpuReaction = .1 + this.random() * .12;
    }

    score(side) {
      this[side].score += 1;
      this.ball.x = COURT.width / 2;
      this.ball.vx = 0;
      this.ball.vy = 0;
      this.ball.spin = 0;
      this.events.push({ type: 'score', side, y: this.ball.y, x: side === 'player' ? COURT.width : 0 });
      this.ball.y = COURT.height / 2;
      if (this[side].score === COURT.winningScore) {
        this.winner = side;
        this.state = 'finished';
        this.serveDelay = 0;
        return;
      }
      this.serveDirection = side === 'player' ? -1 : 1;
      this.serveDelay = .85;
    }

    hitDish(dish, direction) {
      const ball = this.ball;
      if (Math.sign(ball.vx) === direction) return;
      const dx = ball.x - dish.x;
      const dy = ball.y - dish.y;
      const contactRadius = COURT.dishRadius + COURT.ballRadius;
      if (dx * dx + dy * dy > contactRadius * contactRadius) return;

      // An edge hit gives the player a useful, predictable way to aim a return.
      // Moving into the hit adds a little slice, and the plasmid spins with it.
      const offset = clamp(dy / contactRadius, -.95, .95);
      const angle = clamp(offset * 1.12 + dish.vy / 2400, -1.12, 1.12);
      const speed = Math.min(790, Math.hypot(ball.vx, ball.vy) + 28);
      ball.x = dish.x + direction * (Math.sqrt(Math.max(0, contactRadius * contactRadius - dy * dy)) + .1);
      ball.vx = direction * speed * Math.cos(angle);
      ball.vy = speed * Math.sin(angle);
      ball.spin = direction * (3 + speed / 90) + offset * 6;
      this.rally += 1;
      this.events.push({ type: 'hit', side: direction === 1 ? 'player' : 'cpu', x: ball.x - direction * COURT.ballRadius, y: ball.y, rally: this.rally, speed });
      if (direction === 1) this.aimCpu();
      else this.cpuTarget = COURT.height / 2 + (this.random() - .5) * 80;
    }

    step(seconds, movement = 0) {
      if (this.state !== 'playing' || !Number.isFinite(seconds) || seconds <= 0) return;
      // Discard stale time after a background tab or a long frame. Small substeps
      // keep the bacterium from passing through a dish at its maximum speed.
      let remaining = Math.min(seconds, .05);
      // How fast the player's cell is moving this frame, from a drag or the keys.
      const swing = this.pointerFrom != null ? (this.player.y - this.pointerFrom) / remaining : clamp(movement, -1, 1) * 610;
      this.player.vy = this.player.vy * .5 + clamp(swing, -1400, 1400) * .5;
      this.pointerFrom = null;
      while (remaining > 0 && this.state === 'playing') {
        const dt = Math.min(remaining, 1 / 240);
        remaining -= dt;
        const cpuY = this.cpu.y;
        if (movement) this.setPlayerY(this.player.y + clamp(movement, -1, 1) * 610 * dt);
        if (this.cpuReaction > 0) this.cpuReaction -= dt;
        else {
          const pace = this.ball.vx > 0 ? 340 : 160;
          this.cpu.y = clamp(this.cpu.y + clamp(this.cpuTarget - this.cpu.y, -pace * dt, pace * dt), COURT.dishRadius, COURT.height - COURT.dishRadius);
        }
        this.cpu.vy = (this.cpu.y - cpuY) / dt;

        if (this.serveDelay > 0) {
          this.serveDelay = Math.max(0, this.serveDelay - dt);
          if (this.serveDelay === 0) this.serve();
          continue;
        }

        const ball = this.ball;
        ball.x += ball.vx * dt;
        ball.y += ball.vy * dt;
        ball.angle += ball.spin * dt;
        if (ball.y < COURT.ballRadius) {
          ball.y = COURT.ballRadius + (COURT.ballRadius - ball.y);
          ball.vy = Math.abs(ball.vy);
        } else if (ball.y > COURT.height - COURT.ballRadius) {
          ball.y = COURT.height - COURT.ballRadius - (ball.y - (COURT.height - COURT.ballRadius));
          ball.vy = -Math.abs(ball.vy);
        }
        this.hitDish(this.player, 1);
        this.hitDish(this.cpu, -1);
        if (ball.x < -COURT.ballRadius) this.score('cpu');
        else if (ball.x > COURT.width + COURT.ballRadius) this.score('player');
      }
    }
  }

  // This finite sequence owns its clock so closing a dialog cannot silently
  // complete the celebration, and reduced motion can go straight to its result.
  class ResistanceTransfer {
    constructor() { this.reset(); }

    reset() {
      this.elapsed = 0;
      this.duration = 3.4;
      this.winner = null;
      this.recipient = null;
      this.paused = false;
      this.phase = 'idle';
    }

    get active() { return this.phase !== 'idle' && this.phase !== 'complete'; }
    get approachProgress() {
      const progress = clamp(this.elapsed / .8, 0, 1);
      return progress * progress * (3 - 2 * progress);
    }
    get extension() { return clamp((this.elapsed - .8) / .7, 0, 1); }
    get geneProgress() { return clamp((this.elapsed - 1.5) / 1.2, 0, 1); }
    get transformed() { return this.phase !== 'idle' && this.elapsed >= 2.7; }

    begin(winner, reducedMotion = false) {
      this.reset();
      this.winner = winner;
      this.recipient = winner === 'player' ? 'cpu' : 'player';
      this.phase = 'approaching';
      if (reducedMotion) this.complete();
    }

    complete() {
      if (this.phase === 'idle') return;
      this.elapsed = this.duration;
      this.phase = 'complete';
      this.paused = false;
    }

    pause() { if (this.active) this.paused = true; }
    resume() { this.paused = false; }

    step(seconds) {
      if (!this.active || this.paused || !Number.isFinite(seconds) || seconds <= 0) return;
      this.elapsed = Math.min(this.duration, this.elapsed + Math.min(seconds, .05));
      if (this.elapsed >= this.duration) this.complete();
      else if (this.elapsed >= 2.7) this.phase = 'transformed';
      else if (this.elapsed >= 1.5) this.phase = 'sending';
      else if (this.elapsed >= .8) this.phase = 'growing';
    }
  }

  globalThis.PetriPongEngine = Object.freeze({ COURT, PongGame, ResistanceTransfer });
})();
