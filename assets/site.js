/* A dependency-free, deliberately hidden lab break. */
(() => {
  'use strict';

  const start = () => {
    const dialog = document.getElementById('culture-dialog');
    const trigger = document.getElementById('culture-trigger');
    const canvas = document.getElementById('pong-canvas');
    const toggle = document.getElementById('pong-toggle');
    const reset = document.getElementById('pong-reset');
    const close = document.getElementById('culture-close');
    const description = document.getElementById('culture-description');
    const status = document.getElementById('culture-status');
    const youScore = document.getElementById('pong-you-score');
    const cpuScore = document.getElementById('pong-cpu-score');
    if (!dialog || !trigger || !canvas || !toggle || !reset || !close || !status || !youScore || !cpuScore ||
      typeof dialog.showModal !== 'function' || !window.PetriPongEngine) return;
    const context = canvas.getContext('2d', { alpha: false });
    if (!context) return;
    const { COURT, PongGame, ResistanceTransfer } = window.PetriPongEngine;
    const game = new PongGame();
    const transfer = new ResistanceTransfer();
    const motion = window.matchMedia('(prefers-reduced-motion: reduce)');
    const mobile = window.matchMedia('(max-width: 600px), (pointer: coarse)');
    const goal = COURT.winningScore === 3 ? 'three' : String(COURT.winningScore);
    if (description) description.textContent = `Two bacteria. One plasmid. First to ${goal}.`;
    const keys = new Set();
    let palette;
    let frameId = 0;
    let lastFrame = null;
    let nextFrame = null;
    let lastStatus = '';
    let previousFocus;
    let typed = '';
    let lastKeyAt = 0;
    let backdropPointer = false;
    let activePointer = null;
    let pointerY = null;
    let courtBounds;
    let graphics;
    // Effects run on game time, so pausing freezes them mid-flight.
    let clock = 0;
    let effects = [];
    let trail = [];
    const squash = { player: -1, cpu: -1 };
    const storage = { get: (key) => { try { return localStorage.getItem(key); } catch { return null; } },
      set: (key, value) => { try { localStorage.setItem(key, value); } catch { /* private mode */ } } };
    let best = Number(storage.get('plasmid-pong-best')) || 0;
    let newBest = false;
    const instructions = document.getElementById('pong-instructions');
    if (instructions && window.matchMedia('(pointer: coarse)').matches) {
      instructions.textContent = 'Drag on the court to move your bacterium. Hit with its edge, or while moving, to angle the plasmid. Win to pass on a resistance gene.';
    }

    const footer = document.querySelector('.nav-footer-right') || document.querySelector('.nav-footer-left');
    if (footer) footer.appendChild(trigger);

    const updatePalette = () => {
      const style = getComputedStyle(canvas);
      const color = (name, fallback) => style.getPropertyValue(name).trim() || fallback;
      const dark = document.body.classList.contains('quarto-dark');
      palette = {
        paper: color('--paper', '#f8f7f3'), surface: color('--surface', '#fff'),
        ink: color('--ink', '#25332e'), muted: color('--muted', '#6b746f'),
        sage: color('--sage', '#527665'), accent: color('--accent', '#aa664b'), rule: color('--rule', '#dce0d9'),
        playerCell: dark ? '#35523e' : '#dce8d8', cpuCell: dark ? '#594936' : '#eee1c9',
        cpuStroke: dark ? '#dec29b' : '#917547', zombie: dark ? '#537432' : '#bfd786',
        zombieStroke: dark ? '#d1e494' : '#587832', gene: color('--gene', dark ? '#e08a6c' : '#a24f37'),
      };
    };

    // The plasmid is a tiny pAW26: the site's four features, with Research as the resistance gene.
    const FEATURES = [[140, 860], [1080, 2060, true], [2280, 3120], [3340, 3860]];
    const paintPlasmid = (context, x, y, radius = COURT.ballRadius) => {
      const turn = (bp) => bp / 4000 * Math.PI * 2 - Math.PI / 2;
      context.save();
      context.translate(x, y);
      context.fillStyle = palette.paper;
      context.beginPath(); context.arc(0, 0, radius + 1, 0, Math.PI * 2); context.fill();
      context.strokeStyle = palette.sage;
      context.lineWidth = 1.25;
      context.beginPath(); context.arc(0, 0, radius - 2, 0, Math.PI * 2); context.stroke();
      context.lineCap = 'round';
      for (const [from, to, gene] of FEATURES) {
        context.strokeStyle = gene ? palette.gene : palette.sage;
        context.lineWidth = gene ? radius * .42 : radius * .3;
        context.beginPath(); context.arc(0, 0, radius - 2, turn(from), turn(to)); context.stroke();
      }
      context.fillStyle = palette.ink;
      context.fillRect(-1, -radius - 1, 2, 5);
      context.restore();
    };

    const cellPath = (context, width, height) => {
      const radius = width / 2;
      context.beginPath();
      context.arc(0, -height / 2 + radius, radius, Math.PI, Math.PI * 2);
      context.lineTo(radius, height / 2 - radius);
      context.arc(0, height / 2 - radius, radius, 0, Math.PI);
      context.closePath();
    };

    const paintBacterium = (context, side, zombie) => {
      const player = side === 'player';
      const color = zombie ? palette.zombieStroke : player ? palette.sage : palette.cpuStroke;
      context.save();
      context.strokeStyle = color;
      context.lineWidth = 2;
      context.lineCap = 'round';
      // Short pili fill the original collision envelope; the body is a capsule.
      context.beginPath();
      for (const y of [-17, 0, 17]) {
        context.moveTo(-31, y); context.lineTo(-43, y - 4);
        context.moveTo(31, y); context.lineTo(43, y + 4);
      }
      context.moveTo(-6, 42); context.bezierCurveTo(-19, 47, 9, 49, -6, 55);
      context.moveTo(6, -42); context.bezierCurveTo(17, -47, -10, -50, 7, -55);
      context.stroke();
      cellPath(context, 66, 88);
      context.fillStyle = zombie ? palette.zombie : player ? palette.playerCell : palette.cpuCell;
      context.fill();
      context.stroke();
      cellPath(context, 55, 77);
      context.globalAlpha = .25;
      context.lineWidth = 1;
      context.stroke();
      context.globalAlpha = 1;
      context.strokeStyle = palette.ink;
      context.fillStyle = palette.ink;
      context.lineWidth = 2;
      if (zombie) {
        // A crossed eye, drooping lid and crooked toothy grin: a friendly zombie.
        context.beginPath();
        context.moveTo(-14, -10); context.lineTo(-6, -2);
        context.moveTo(-6, -10); context.lineTo(-14, -2);
        context.moveTo(5, -10); context.lineTo(14, -6);
        context.moveTo(-13, 11); context.lineTo(-6, 8); context.lineTo(0, 13); context.lineTo(6, 9); context.lineTo(13, 12);
        context.stroke();
        context.beginPath(); context.arc(9, -3, 2.4, 0, Math.PI * 2); context.fill();
        context.fillStyle = palette.paper;
        context.fillRect(-5, 10, 4, 4);
      } else {
        [-10, 10].forEach((x) => { context.beginPath(); context.arc(x, -7, 2.7, 0, Math.PI * 2); context.fill(); });
        context.beginPath(); context.moveTo(-10, 6); context.quadraticCurveTo(0, 17, 10, 6); context.stroke();
      }
      context.strokeStyle = color;
      context.lineWidth = 1.5;
      context.globalAlpha = .55;
      context.beginPath(); context.moveTo(-10, 26); context.bezierCurveTo(12, 19, -13, 32, 10, 29); context.stroke();
      context.restore();
    };

    // Vector artwork stays crisp, but its paths only need painting on resize/theme changes.
    const buildGraphics = () => {
      const scale = canvas.width / COURT.width;
      const sprite = (width, height, paint) => {
        const layer = document.createElement('canvas');
        layer.width = Math.ceil(width * scale);
        layer.height = Math.ceil(height * scale);
        const brush = layer.getContext('2d');
        brush.setTransform(layer.width / width, 0, 0, layer.height / height, layer.width / 2, layer.height / 2);
        paint(brush);
        return { image: layer, width, height };
      };
      const court = document.createElement('canvas');
      court.width = canvas.width;
      court.height = canvas.height;
      const brush = court.getContext('2d', { alpha: false });
      brush.setTransform(court.width / COURT.width, 0, 0, court.height / COURT.height, 0, 0);
      brush.fillStyle = palette.paper;
      brush.fillRect(0, 0, COURT.width, COURT.height);
      brush.strokeStyle = palette.rule;
      brush.lineWidth = 1.5;
      brush.setLineDash([5, 11]);
      brush.beginPath(); brush.moveTo(COURT.width / 2, 30 + 16 * textScale()); brush.lineTo(COURT.width / 2, COURT.height - 24); brush.stroke();
      graphics = {
        court,
        player: sprite(96, 120, (brush) => paintBacterium(brush, 'player', false)),
        cpu: sprite(96, 120, (brush) => paintBacterium(brush, 'cpu', false)),
        playerZombie: sprite(96, 120, (brush) => paintBacterium(brush, 'player', true)),
        cpuZombie: sprite(96, 120, (brush) => paintBacterium(brush, 'cpu', true)),
        plasmid: sprite(36, 36, (brush) => paintPlasmid(brush, 0, 0)),
        genePlasmid: sprite(20, 20, (brush) => paintPlasmid(brush, 0, 0, 7)),
      };
    };

    const drawSprite = (sprite, x, y, angle = 0, sx = 1, sy = 1) => {
      if (!angle && sx === 1 && sy === 1) {
        context.drawImage(sprite.image, x - sprite.width / 2, y - sprite.height / 2, sprite.width, sprite.height);
        return;
      }
      context.save();
      context.translate(x, y);
      context.rotate(angle);
      context.scale(sx, sy);
      context.drawImage(sprite.image, -sprite.width / 2, -sprite.height / 2, sprite.width, sprite.height);
      context.restore();
    };

    const cellPosition = (side) => {
      const cell = game[side];
      const progress = transfer.approachProgress;
      const targetX = COURT.width / 2 + (side === 'player' ? -78 : 78);
      return { x: cell.x + (targetX - cell.x) * progress, y: cell.y + (COURT.height / 2 - cell.y) * progress };
    };

    const drawBacterium = (side) => {
      const cell = cellPosition(side);
      const zombie = transfer.transformed && transfer.recipient === side;
      // A struck cell gives a little, then springs back.
      const give = squash[side] < 0 ? 0 : Math.max(0, 1 - (clock - squash[side]) / .22);
      drawSprite(graphics[zombie ? `${side}Zombie` : side], cell.x, cell.y, 0, 1 - give * .16, 1 + give * .07);
      if (transfer.phase !== 'idle' && (side === transfer.winner || zombie)) drawSprite(graphics.genePlasmid, cell.x, cell.y + 26);
    };

    const transferPath = () => {
      const donor = cellPosition(transfer.winner);
      const recipient = cellPosition(transfer.recipient);
      const direction = recipient.x > donor.x ? 1 : -1;
      return { x1: donor.x + direction * 33, y1: donor.y, x2: recipient.x - direction * 33, y2: recipient.y };
    };

    const drawPilus = () => {
      if (!transfer.extension) return;
      const { x1, y1, x2, y2 } = transferPath();
      const endX = x1 + (x2 - x1) * transfer.extension;
      const endY = y1 + (y2 - y1) * transfer.extension;
      context.lineCap = 'round';
      context.strokeStyle = palette.rule;
      context.lineWidth = 8;
      context.beginPath(); context.moveTo(x1, y1); context.lineTo(endX, endY); context.stroke();
      context.strokeStyle = palette.sage;
      context.lineWidth = 1.5;
      context.beginPath(); context.moveTo(x1, y1); context.lineTo(endX, endY); context.stroke();
    };

    const drawGene = () => {
      if (transfer.phase !== 'sending') return;
      const { x1, y1, x2, y2 } = transferPath();
      context.save();
      context.translate(x1 + (x2 - x1) * transfer.geneProgress, y1 + (y2 - y1) * transfer.geneProgress);
      context.rotate(Math.atan2(y2 - y1, x2 - x1));
      context.fillStyle = palette.gene;
      context.strokeStyle = palette.paper;
      context.lineWidth = 1.5;
      context.beginPath();
      context.moveTo(-7, -5); context.lineTo(7, -5); context.arc(7, 0, 5, -Math.PI / 2, Math.PI / 2);
      context.lineTo(-7, 5); context.arc(-7, 0, 5, Math.PI / 2, Math.PI * 1.5);
      context.fill(); context.stroke();
      context.beginPath();
      [-4, 0, 4].forEach((x) => { context.moveTo(x, -2); context.lineTo(x, 2); });
      context.stroke();
      context.restore();
    };

    const drawTrail = () => {
      if (motion.matches) return;
      context.fillStyle = palette.gene;
      trail.forEach((point, index) => {
        const weight = (index + 1) / (trail.length + 1);
        context.globalAlpha = weight * .22;
        context.beginPath(); context.arc(point.x, point.y, COURT.ballRadius * (.35 + weight * .5), 0, Math.PI * 2); context.fill();
      });
      context.globalAlpha = 1;
    };

    const drawEffects = () => {
      effects = effects.filter((effect) => clock - effect.at < effect.life);
      for (const effect of effects) {
        const age = (clock - effect.at) / effect.life, fade = 1 - age;
        if (effect.type === 'hit') {
          context.strokeStyle = effect.side === 'player' ? palette.sage : palette.cpuStroke;
          context.lineWidth = 2 * fade + .5;
          context.globalAlpha = fade;
          context.beginPath(); context.arc(effect.x, effect.y, 8 + age * 30, 0, Math.PI * 2); context.stroke();
        } else {
          // A lost plasmid spills its copies back onto the court.
          context.fillStyle = palette.gene;
          for (const bit of effect.bits) {
            const travel = 1 - (1 - age) * (1 - age);
            context.globalAlpha = fade;
            context.beginPath();
            context.arc(effect.x + bit.dx * travel, effect.y + bit.dy * travel, bit.size * (1 - age * .5), 0, Math.PI * 2);
            context.fill();
          }
        }
      }
      context.globalAlpha = 1;
    };

    // Court text keeps a readable size when the court shrinks on a phone.
    const textScale = () => Math.max(1, 11 / 15 * COURT.width / (courtBounds?.width || COURT.width));

    const drawRally = () => {
      if (game.state !== 'playing' && game.state !== 'paused') return;
      const record = best >= 3 ? best : 0;
      const text = game.rally > 1 ? `Rally ${game.rally}${newBest ? ' · New best' : record ? ` · Best ${record}` : ''}` : record ? `Best rally ${record}` : '';
      if (!text) return;
      const size = textScale();
      context.fillStyle = newBest && game.rally > 1 ? palette.gene : palette.muted;
      context.font = `500 ${15 * size}px system-ui, sans-serif`;
      context.textAlign = 'center';
      context.fillText(text, COURT.width / 2, 18 + 16 * size);
    };

    // Turn the engine's hits and points into effects, and keep score of the best rally.
    const react = () => {
      for (const event of game.events) {
        if (event.type === 'hit') {
          if (event.rally > best) { best = event.rally; newBest = best > 2; storage.set('plasmid-pong-best', String(best)); }
          if (motion.matches) continue;
          squash[event.side] = clock;
          effects.push({ type: 'hit', side: event.side, x: event.x, y: event.y, at: clock, life: .35 });
        } else {
          trail = [];
          newBest = false;
          if (motion.matches) continue;
          const inward = event.x === 0 ? 1 : -1;
          const bits = Array.from({ length: 12 }, () => {
            const angle = (Math.random() - .5) * 2.4, reach = 40 + Math.random() * 70;
            return { dx: inward * Math.cos(angle) * reach, dy: Math.sin(angle) * reach, size: 2 + Math.random() * 3 };
          });
          effects.push({ type: 'score', x: event.x, y: event.y, bits, at: clock, life: .7 });
        }
      }
      game.events.length = 0;
      if (game.serveDelay > 0 || game.state !== 'playing') trail = [];
      else if (!motion.matches) { trail.push({ x: game.ball.x, y: game.ball.y }); if (trail.length > 7) trail.shift(); }
    };

    const draw = () => {
      if (!graphics) return;
      context.setTransform(1, 0, 0, 1, 0, 0);
      context.drawImage(graphics.court, 0, 0);
      context.setTransform(canvas.width / COURT.width, 0, 0, canvas.height / COURT.height, 0, 0);
      drawPilus();
      drawBacterium('player');
      drawBacterium('cpu');
      drawEffects();
      if (game.state !== 'finished') {
        drawTrail();
        if (game.serveDelay > 0) {
          // Replication before the next serve: a fork runs once round the waiting plasmid.
          context.strokeStyle = palette.gene;
          context.lineWidth = 2;
          context.lineCap = 'round';
          context.beginPath();
          context.arc(game.ball.x, game.ball.y, COURT.ballRadius + 7, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * (1 - game.serveDelay / .85));
          context.stroke();
        }
        drawSprite(graphics.plasmid, game.ball.x, game.ball.y, motion.matches ? 0 : game.ball.angle);
      }
      drawGene();
      drawRally();

      let label = '';
      if (game.state === 'ready') label = 'Press Start to serve';
      else if (game.state === 'paused') label = 'Paused';
      else if (game.state === 'finished') {
        if (transfer.paused) label = 'Transfer paused';
        else if (transfer.phase === 'approaching') label = 'Coming together…';
        else if (transfer.phase === 'growing') label = 'Growing a pilus…';
        else if (transfer.phase === 'sending') label = 'Resistance gene in transit';
        else label = 'Resistance acquired. Zombie mode.';
      }
      if (label) {
        const size = Math.min(textScale(), 2.2);
        context.fillStyle = palette.paper;
        context.globalAlpha = .94;
        context.fillRect(COURT.width / 2 - 180 * size, COURT.height / 2 + 80, 360 * size, 48 * size);
        context.globalAlpha = 1;
        context.fillStyle = palette.muted;
        context.font = `500 ${18 * size}px system-ui, sans-serif`;
        context.textAlign = 'center';
        context.fillText(label, COURT.width / 2, COURT.height / 2 + 80 + 30 * size);
      }
    };

    const sync = () => {
      const signature = `${game.state}:${game.player.score}:${game.cpu.score}:${transfer.phase}:${transfer.paused}`;
      if (signature === lastStatus) return;
      lastStatus = signature;
      dialog.dataset.pongState = game.state;
      dialog.dataset.transfer = transfer.paused ? 'paused' : transfer.phase;
      dialog.dataset.winner = transfer.winner || '';
      dialog.dataset.recipient = transfer.recipient || '';
      canvas.dataset.recipientState = transfer.transformed ? 'resistant-zombie' : 'normal';
      youScore.textContent = String(game.player.score);
      cpuScore.textContent = String(game.cpu.score);
      toggle.textContent = game.state === 'finished' && transfer.active ? (transfer.paused ? 'Resume' : 'Pause') :
        { ready: 'Start game', playing: 'Pause', paused: 'Resume', finished: 'Play again' }[game.state];
      if (game.state === 'ready') status.textContent = 'Ready when you are.';
      else if (game.state === 'paused') status.textContent = 'Paused. Resume whenever you’re ready.';
      else if (game.state === 'finished') {
        const winner = game.winner === 'player' ? 'You win!' : 'The lab bacterium wins.';
        const recipient = transfer.recipient === 'player' ? 'Your bacterium' : 'The lab bacterium';
        const result = transfer.paused ? 'Gene transfer paused. Resume whenever you’re ready.' :
          transfer.phase === 'approaching' ? 'The bacteria come together to share a resistance gene.' :
          transfer.phase === 'growing' ? 'The winner grows a pilus to share a resistance gene.' :
          transfer.phase === 'sending' ? 'The resistance gene travels through the pilus…' :
          `${recipient} gains resistance and becomes a resistant zombie.`;
        status.textContent = `${winner} ${game.player.score} to ${game.cpu.score}. ${result}`;
      }
      else if (game.player.score || game.cpu.score) status.textContent = `You ${game.player.score}, lab bacterium ${game.cpu.score}. First to ${goal}.`;
      else status.textContent = `Keep the plasmid in play. First to ${goal}.`;
    };

    const stopLoop = () => {
      if (frameId) cancelAnimationFrame(frameId);
      frameId = 0;
      lastFrame = null;
      nextFrame = null;
      keys.clear();
      if (activePointer !== null && canvas.hasPointerCapture(activePointer)) canvas.releasePointerCapture(activePointer);
      activePointer = null;
      pointerY = null;
    };

    const pause = () => {
      game.pause();
      transfer.pause();
      stopLoop();
      sync();
      if (dialog.open) draw();
    };

    const clearEffects = () => { effects = []; trail = []; newBest = false; squash.player = squash.cpu = -1; };

    const shouldAnimate = () => game.state === 'playing' || (game.state === 'finished' && transfer.active && !transfer.paused);

    const frame = (time) => {
      frameId = 0;
      if (!dialog.open || document.hidden || !shouldAnimate()) { pause(); return; }
      // High-refresh phones do not need to paint this small game 120 times a second.
      if (nextFrame !== null && time < nextFrame - 1) {
        frameId = requestAnimationFrame(frame);
        return;
      }
      const dt = lastFrame === null ? 0 : (time - lastFrame) / 1000;
      lastFrame = time;
      nextFrame = Math.max((nextFrame ?? time) + 1000 / 60, time);
      if (pointerY !== null) { game.dragPlayerTo(pointerY); pointerY = null; }
      const up = keys.has('w') || keys.has('arrowup');
      const down = keys.has('s') || keys.has('arrowdown');
      if (game.state === 'playing') {
        game.step(dt, Number(down) - Number(up));
        react();
      }
      clock += Math.min(dt, .05);
      if (game.state === 'finished') {
        if (transfer.phase === 'idle') {
          transfer.begin(game.winner, motion.matches);
          keys.clear();
        }
        transfer.step(dt);
      }
      sync();
      draw();
      if (shouldAnimate()) frameId = requestAnimationFrame(frame);
      else stopLoop();
    };

    const toggleGame = () => {
      if (game.state === 'playing') { pause(); return; }
      if (game.state === 'finished' && transfer.active) {
        if (!transfer.paused) { pause(); return; }
        transfer.resume();
      } else {
        if (game.state === 'finished') { game.restart(); transfer.reset(); clearEffects(); }
        game.start();
      }
      sync();
      draw();
      lastFrame = null;
      nextFrame = null;
      if (!frameId) frameId = requestAnimationFrame(frame);
      canvas.focus({ preventScroll: true });
    };

    const resize = () => {
      if (!dialog.open) return;
      const bounds = canvas.getBoundingClientRect();
      courtBounds = bounds;
      if (!bounds.width || !bounds.height) return;
      const ratio = Math.min(window.devicePixelRatio || 1, mobile.matches ? 1.5 : 2);
      const width = Math.round(bounds.width * ratio);
      const height = Math.round(bounds.height * ratio);
      if (canvas.width !== width || canvas.height !== height) { canvas.width = width; canvas.height = height; }
      updatePalette();
      buildGraphics();
      draw();
    };

    const openGame = () => {
      if (dialog.open) return;
      previousFocus = document.activeElement;
      typed = '';
      dialog.showModal();
      sync();
      resize();
      toggle.focus({ preventScroll: true });
    };

    trigger.addEventListener('click', openGame);
    close.addEventListener('click', () => dialog.close());
    toggle.addEventListener('click', toggleGame);
    reset.addEventListener('click', () => {
      stopLoop();
      game.restart();
      transfer.reset();
      clearEffects();
      sync();
      draw();
      toggle.focus({ preventScroll: true });
    });
    dialog.addEventListener('cancel', pause);
    dialog.addEventListener('close', () => {
      pause();
      typed = '';
      backdropPointer = false;
      if (previousFocus instanceof HTMLElement && previousFocus.isConnected) previousFocus.focus({ preventScroll: true });
    });

    const outsideDialog = (event) => {
      const bounds = dialog.getBoundingClientRect();
      return event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom;
    };
    dialog.addEventListener('pointerdown', (event) => {
      backdropPointer = event.target === dialog && outsideDialog(event);
    });
    dialog.addEventListener('click', (event) => {
      if (backdropPointer && event.target === dialog && outsideDialog(event)) dialog.close();
      backdropPointer = false;
    });

    const editing = (event) => event.composedPath().some((element) => element instanceof HTMLElement &&
      (element.isContentEditable || element.matches('input, textarea, select, [role="textbox"]')));
    dialog.addEventListener('keydown', (event) => {
      if (editing(event) || event.isComposing || event.ctrlKey || event.metaKey || event.altKey) return;
      const key = event.key.toLowerCase();
      if (['w', 's', 'arrowup', 'arrowdown'].includes(key) && game.state === 'playing') {
        event.preventDefault();
        keys.add(key);
      } else if (key === ' ' && !(event.target instanceof HTMLElement && event.target.closest('button, a'))) {
        event.preventDefault();
        if (!event.repeat) toggleGame();
      }
    });
    document.addEventListener('keyup', (event) => keys.delete(event.key.toLowerCase()));

    const movePointer = (event) => {
      if (game.state === 'finished' || !courtBounds?.height) return;
      const y = (event.clientY - courtBounds.top) / courtBounds.height * COURT.height;
      if (game.state === 'playing') pointerY = y;
      else { game.setPlayerY(y); draw(); }
    };
    canvas.addEventListener('pointerdown', (event) => {
      if (game.state === 'finished' || (event.pointerType === 'mouse' && event.button !== 0) || activePointer !== null) return;
      event.preventDefault();
      activePointer = event.pointerId;
      courtBounds = canvas.getBoundingClientRect();
      canvas.setPointerCapture(activePointer);
      canvas.focus({ preventScroll: true });
      movePointer(event);
    });
    canvas.addEventListener('pointermove', (event) => {
      if (event.pointerId === activePointer) movePointer(event);
    });
    const releasePointer = (event) => {
      if (event.pointerId !== activePointer) return;
      if (canvas.hasPointerCapture(activePointer)) canvas.releasePointerCapture(activePointer);
      activePointer = null;
    };
    canvas.addEventListener('pointerup', releasePointer);
    canvas.addEventListener('pointercancel', releasePointer);
    canvas.addEventListener('lostpointercapture', () => { activePointer = null; });

    document.addEventListener('keydown', (event) => {
      if (dialog.open || editing(event) || event.isComposing || event.ctrlKey || event.metaKey || event.altKey || event.key.length !== 1) {
        typed = '';
        return;
      }
      const now = performance.now();
      if (now - lastKeyAt > 1800) typed = '';
      lastKeyAt = now;
      typed = (typed + event.key.toLowerCase()).slice(-7);
      if (typed === 'plasmid') openGame();
    });

    document.addEventListener('visibilitychange', () => { if (document.hidden) pause(); });
    window.addEventListener('blur', () => { if (dialog.open) pause(); });
    const updateMotion = () => {
      if (!motion.matches || !transfer.active) return;
      transfer.complete();
      if (game.state === 'finished') stopLoop();
      sync();
      if (dialog.open) draw();
    };
    if (motion.addEventListener) motion.addEventListener('change', updateMotion);
    else motion.addListener(updateMotion);
    window.addEventListener('resize', resize);
    dialog.addEventListener('scroll', () => { courtBounds = canvas.getBoundingClientRect(); }, { passive: true });
    if ('ResizeObserver' in window) new ResizeObserver(resize).observe(canvas);
    const themeObserver = new MutationObserver(() => { if (dialog.open) { updatePalette(); buildGraphics(); draw(); } });
    themeObserver.observe(document.documentElement, { attributes: true, attributeFilter: ['class', 'data-bs-theme'] });
    themeObserver.observe(document.body, { attributes: true, attributeFilter: ['class'] });
    sync();
  };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true });
  else start();
})();
