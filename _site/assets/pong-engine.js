// Logical court coordinates are independent of screen size and pixel density.
(() => {
  'use strict';
  const COURT = Object.freeze({ width: 960, height: 540, dishRadius: 44, ballRadius: 12, winningScore: 3 });
  const clamp = (value, low, high) => Math.max(low, Math.min(high, value));

  class PongGame {
    constructor(random = Math.random) {
      this.random = random;
      this.restart();
    }

    restart() {
      this.state = 'ready';
      this.player = { x: 68, y: COURT.height / 2, score: 0 };
      this.cpu = { x: COURT.width - 68, y: COURT.height / 2, score: 0 };
      this.ball = { x: COURT.width / 2, y: COURT.height / 2, vx: 0, vy: 0 };
      this.serveDelay = 0;
      this.serveDirection = this.random() < .5 ? -1 : 1;
      this.rally = 0;
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
      this.rally = 0;
    }

    score(side) {
      this[side].score += 1;
      this.ball.x = COURT.width / 2;
      this.ball.y = COURT.height / 2;
      this.ball.vx = 0;
      this.ball.vy = 0;
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
      const offset = clamp(dy / contactRadius, -.95, .95);
      const angle = offset * 1.12;
      const speed = Math.min(790, Math.hypot(ball.vx, ball.vy) + 28);
      ball.x = dish.x + direction * (Math.sqrt(Math.max(0, contactRadius * contactRadius - dy * dy)) + .1);
      ball.vx = direction * speed * Math.cos(angle);
      ball.vy = speed * Math.sin(angle);
      this.rally += 1;
    }

    step(seconds, movement = 0) {
      if (this.state !== 'playing' || !Number.isFinite(seconds) || seconds <= 0) return;
      // Discard stale time after a background tab or a long frame. Small substeps
      // keep the bacterium from passing through a dish at its maximum speed.
      let remaining = Math.min(seconds, .05);
      while (remaining > 0 && this.state === 'playing') {
        const dt = Math.min(remaining, 1 / 240);
        remaining -= dt;
        this.setPlayerY(this.player.y + clamp(movement, -1, 1) * 610 * dt);
        const target = this.ball.vx > 0 ? this.ball.y : COURT.height / 2;
        this.cpu.y = clamp(this.cpu.y + clamp(target - this.cpu.y, -305 * dt, 305 * dt), COURT.dishRadius, COURT.height - COURT.dishRadius);

        if (this.serveDelay > 0) {
          this.serveDelay = Math.max(0, this.serveDelay - dt);
          if (this.serveDelay === 0) this.serve();
          continue;
        }

        const ball = this.ball;
        ball.x += ball.vx * dt;
        ball.y += ball.vy * dt;
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
