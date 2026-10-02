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
    const status = document.getElementById('culture-status');
    const youScore = document.getElementById('pong-you-score');
    const cpuScore = document.getElementById('pong-cpu-score');
    if (!dialog || !trigger || !canvas || !toggle || !reset || !close || !status || !youScore || !cpuScore ||
      typeof dialog.showModal !== 'function' || !window.PetriPongEngine) return;
    const context = canvas.getContext('2d');
    if (!context) return;
    const { COURT, PongGame, ResistanceTransfer } = window.PetriPongEngine;
    const game = new PongGame();
    const transfer = new ResistanceTransfer();
    const motion = window.matchMedia('(prefers-reduced-motion: reduce)');
    const keys = new Set();
    let palette;
    let frameId = 0;
    let lastFrame = null;
    let lastStatus = '';
    let previousFocus;
    let typed = '';
    let lastKeyAt = 0;
    let backdropPointer = false;
    let activePointer = null;

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
        zombieStroke: dark ? '#d1e494' : '#587832', gene: dark ? '#efc976' : '#b98223',
      };
    };

    const drawPlasmid = (x, y, radius = COURT.ballRadius, angle = -.6) => {
      context.save();
      context.translate(x, y);
      context.rotate(angle);
      context.fillStyle = palette.paper;
      context.beginPath(); context.arc(0, 0, radius, 0, Math.PI * 2); context.fill();
      context.lineWidth = 2.5;
      context.lineCap = 'round';
      context.strokeStyle = palette.sage;
      for (let segment = 0; segment < 8; segment += 1) {
        context.beginPath();
        context.arc(0, 0, radius, segment * Math.PI / 4 + .04, (segment + 1) * Math.PI / 4 - .09);
        context.stroke();
      }
      context.strokeStyle = palette.gene;
      context.lineWidth = 4.5;
      context.beginPath(); context.arc(0, 0, radius, -.28, .67); context.stroke();
      context.restore();
    };

    const cellPath = (width, height) => {
      const radius = width / 2;
      context.beginPath();
      context.arc(0, -height / 2 + radius, radius, Math.PI, Math.PI * 2);
      context.lineTo(radius, height / 2 - radius);
      context.arc(0, height / 2 - radius, radius, 0, Math.PI);
      context.closePath();
    };

    const drawBacterium = (cell, side) => {
      const zombie = transfer.transformed && transfer.recipient === side;
      const player = side === 'player';
      const color = zombie ? palette.zombieStroke : player ? palette.sage : palette.cpuStroke;
      context.save();
      context.translate(cell.x, cell.y);
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
      cellPath(66, 88);
      context.fillStyle = zombie ? palette.zombie : player ? palette.playerCell : palette.cpuCell;
      context.fill();
      context.stroke();
      cellPath(55, 77);
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
      if (transfer.phase !== 'idle' && (side === transfer.winner || zombie)) drawPlasmid(cell.x, cell.y + 26, 6);
    };

    const transferPath = () => {
      const donor = game[transfer.winner];
      const recipient = game[transfer.recipient];
      const direction = recipient.x > donor.x ? 1 : -1;
      return { x1: donor.x + direction * 33, y1: donor.y, x2: recipient.x - direction * 33, y2: recipient.y };
    };

    const drawPilus = () => {
      if (transfer.phase === 'idle') return;
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

    const draw = () => {
      if (!palette) updatePalette();
      context.setTransform(canvas.width / COURT.width, 0, 0, canvas.height / COURT.height, 0, 0);
      context.fillStyle = palette.paper;
      context.fillRect(0, 0, COURT.width, COURT.height);
      context.strokeStyle = palette.rule;
      context.lineWidth = 1.5;
      context.setLineDash([5, 11]);
      context.beginPath(); context.moveTo(COURT.width / 2, 24); context.lineTo(COURT.width / 2, COURT.height - 24); context.stroke();
      context.setLineDash([]);
      drawPilus();
      drawBacterium(game.player, 'player');
      drawBacterium(game.cpu, 'cpu');
      if (game.state !== 'finished') drawPlasmid(game.ball.x, game.ball.y);
      drawGene();

      let label = '';
      if (game.state === 'ready') label = 'Press Start to serve';
      else if (game.state === 'paused') label = 'Paused';
      else if (game.state === 'finished') {
        if (transfer.paused) label = 'Transfer paused';
        else if (transfer.phase === 'growing') label = 'Growing a pilus…';
        else if (transfer.phase === 'sending') label = 'Resistance gene in transit';
        else label = 'Resistance acquired. Zombie mode.';
      }
      if (label) {
        context.fillStyle = palette.paper;
        context.globalAlpha = .94;
        context.fillRect(COURT.width / 2 - 180, COURT.height / 2 + 34, 360, 48);
        context.globalAlpha = 1;
        context.fillStyle = palette.muted;
        context.font = '500 18px system-ui, sans-serif';
        context.textAlign = 'center';
        context.fillText(label, COURT.width / 2, COURT.height / 2 + 64);
      }
      canvas.dataset.playerY = String(Math.round(game.player.y));
      canvas.dataset.ballX = String(Math.round(game.ball.x));
      canvas.dataset.ballY = String(Math.round(game.ball.y));
      canvas.dataset.rally = String(game.rally);
      canvas.dataset.transferProgress = (transfer.elapsed / transfer.duration).toFixed(3);
      canvas.dataset.recipientState = transfer.transformed ? 'resistant-zombie' : 'normal';
    };

    const sync = () => {
      const signature = `${game.state}:${game.player.score}:${game.cpu.score}:${transfer.phase}:${transfer.paused}`;
      if (signature === lastStatus) return;
      lastStatus = signature;
      dialog.dataset.pongState = game.state;
      dialog.dataset.transfer = transfer.paused ? 'paused' : transfer.phase;
      dialog.dataset.winner = transfer.winner || '';
      dialog.dataset.recipient = transfer.recipient || '';
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
          transfer.phase === 'growing' ? 'The winner grows a pilus to share a resistance gene.' :
          transfer.phase === 'sending' ? 'The resistance gene travels through the pilus…' :
          `${recipient} gains resistance and becomes a resistant zombie.`;
        status.textContent = `${winner} ${game.player.score}–${game.cpu.score}. ${result}`;
      }
      else if (game.player.score || game.cpu.score) status.textContent = `You ${game.player.score}, lab bacterium ${game.cpu.score}. First to five.`;
      else status.textContent = 'Keep the plasmid in play. First to five.';
    };

    const stopLoop = () => {
      if (frameId) cancelAnimationFrame(frameId);
      frameId = 0;
      lastFrame = null;
      keys.clear();
      if (activePointer !== null && canvas.hasPointerCapture(activePointer)) canvas.releasePointerCapture(activePointer);
      activePointer = null;
    };

    const pause = () => {
      game.pause();
      transfer.pause();
      stopLoop();
      sync();
      if (dialog.open) draw();
    };

    const shouldAnimate = () => game.state === 'playing' || (game.state === 'finished' && transfer.active && !transfer.paused);

    const frame = (time) => {
      frameId = 0;
      if (!dialog.open || document.hidden || !shouldAnimate()) { pause(); return; }
      const dt = lastFrame === null ? 0 : (time - lastFrame) / 1000;
      lastFrame = time;
      const up = keys.has('w') || keys.has('arrowup');
      const down = keys.has('s') || keys.has('arrowdown');
      if (game.state === 'playing') game.step(dt, Number(down) - Number(up));
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
        if (game.state === 'finished') { game.restart(); transfer.reset(); }
        game.start();
      }
      sync();
      draw();
      lastFrame = null;
      if (!frameId) frameId = requestAnimationFrame(frame);
      canvas.focus({ preventScroll: true });
    };

    const resize = () => {
      if (!dialog.open) return;
      const bounds = canvas.getBoundingClientRect();
      if (!bounds.width || !bounds.height) return;
      const ratio = Math.min(window.devicePixelRatio || 1, 3);
      const width = Math.round(bounds.width * ratio);
      const height = Math.round(bounds.height * ratio);
      if (canvas.width !== width || canvas.height !== height) { canvas.width = width; canvas.height = height; }
      updatePalette();
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
      const bounds = canvas.getBoundingClientRect();
      game.setPlayerY((event.clientY - bounds.top) / bounds.height * COURT.height);
      if (game.state !== 'playing') draw();
    };
    canvas.addEventListener('pointerdown', (event) => {
      if (game.state === 'finished' || (event.pointerType === 'mouse' && event.button !== 0) || activePointer !== null) return;
      event.preventDefault();
      activePointer = event.pointerId;
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
    if ('ResizeObserver' in window) new ResizeObserver(resize).observe(canvas);
    const themeObserver = new MutationObserver(() => { if (dialog.open) { updatePalette(); draw(); } });
    themeObserver.observe(document.documentElement, { attributes: true, attributeFilter: ['class', 'data-bs-theme'] });
    themeObserver.observe(document.body, { attributes: true, attributeFilter: ['class'] });
    sync();
  };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true });
  else start();
})();
