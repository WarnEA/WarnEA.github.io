import './pong-engine.js';

const { COURT, PongGame } = globalThis.PetriPongEngine;
const { ResistanceTransfer } = globalThis.PetriPongEngine;
const assert = (condition, message) => { if (!condition) throw new Error(message); };
const snapshot = (game) => JSON.stringify(game);
const gameInPlay = () => { const game = new PongGame(() => .5); game.start(); return game; };

Deno.test('the initial court stays stationary until Start', () => {
  const game = new PongGame(() => .5);
  const before = snapshot(game);
  game.step(1, 1);
  assert(snapshot(game) === before, 'Ready state must not animate or consume movement.');
  game.start();
  game.step(.02);
  assert(game.ball.x !== COURT.width / 2 && game.state === 'playing', 'Start must serve the bacterium.');
});

Deno.test('top and bottom boundaries return the bacterium to the court', () => {
  for (const bottom of [false, true]) {
    const game = gameInPlay();
    Object.assign(game.ball, { x: 480, y: bottom ? 527 : 13, vx: 250, vy: bottom ? 700 : -700 });
    game.step(.04);
    assert(game.ball.y >= COURT.ballRadius && game.ball.y <= COURT.height - COURT.ballRadius, 'Ball must remain inside vertical boundaries.');
    assert(bottom ? game.ball.vy < 0 : game.ball.vy > 0, 'Wall impact must reverse vertical direction.');
  }
});

Deno.test('a full frame at maximum speed cannot tunnel through either dish', () => {
  for (const cpu of [false, true]) {
    const game = gameInPlay();
    Object.assign(game.ball, { x: cpu ? 820 : 140, y: 270, vx: cpu ? 790 : -790, vy: 0 });
    game.step(.05);
    assert(cpu ? game.ball.vx < 0 : game.ball.vx > 0, 'Dish must return the incoming ball.');
    assert(game.rally === 1, 'A single approach should register one return.');
    assert(game.player.score === 0 && game.cpu.score === 0, 'A returned ball must not score.');
    assert(Math.hypot(game.ball.vx, game.ball.vy) <= 790.00001, 'Rallies must keep their maximum playable speed.');
  }
});

Deno.test('an edge return aims the ball; a clean miss passes a circular dish', () => {
  const edge = gameInPlay();
  Object.assign(edge.ball, { x: 125, y: edge.player.y + 39, vx: -600, vy: 0 });
  edge.step(.05);
  assert(edge.ball.vx > 0 && edge.ball.vy > 250, 'The lower edge should aim the return down and across.');

  const miss = gameInPlay();
  Object.assign(miss.ball, { x: 125, y: miss.player.y + 60, vx: -790, vy: 0 });
  for (let frame = 0; frame < 6; frame += 1) miss.step(.05);
  assert(miss.rally === 0 && miss.cpu.score === 1, 'A ball outside the circular rim must pass and score.');
});

Deno.test('a score resets the ball and gives a short stationary serve interval', () => {
  const game = gameInPlay();
  Object.assign(game.ball, { x: COURT.width + 13, y: 40, vx: 390, vy: 0 });
  game.step(.01);
  assert(game.player.score === 1 && game.cpu.score === 0, 'A ball beyond the computer side must score for the player.');
  assert(game.ball.x === 480 && game.ball.y === 270 && game.ball.vx === 0, 'Scoring should reset a stationary ball in the centre.');
  game.step(.05);
  assert(game.ball.x === 480 && game.ball.vx === 0, 'The serve interval must prevent an immediate surprise serve.');
  for (let frame = 0; frame < 18; frame += 1) game.step(.05);
  assert(game.ball.vx < 0, 'The next serve should head towards the side that scored.');
});

Deno.test('the first side to five wins; finished play freezes until a restart', () => {
  for (const winner of ['player', 'cpu']) {
    const game = gameInPlay();
    for (let point = 0; point < 5; point += 1) {
      game.serveDelay = 0;
      Object.assign(game.ball, { x: winner === 'player' ? COURT.width + 13 : -13, y: 30, vx: winner === 'player' ? 390 : -390, vy: 0 });
      game.step(.01);
    }
    assert(game.state === 'finished' && game.winner === winner && game[winner].score === 5, 'The fifth point must end the match.');
    const before = snapshot(game);
    game.step(.05, 1);
    game.start();
    assert(snapshot(game) === before, 'A finished match must not resume by accident.');
    game.restart();
    assert(game.state === 'ready' && !game.winner && !game.player.score && !game.cpu.score && game.ball.vx === 0, 'Restart must clear the match and wait for Start.');
  }
});

Deno.test('pausing freezes score, positions and the serve clock; resuming retains the rally', () => {
  const game = gameInPlay();
  game.step(.03, -1);
  const velocity = game.ball.vx;
  const position = game.ball.x;
  game.pause();
  const before = snapshot(game);
  game.step(.05, 1);
  assert(snapshot(game) === before, 'Pause must freeze the entire match.');
  game.start();
  assert(game.ball.x === position && game.ball.vx === velocity, 'Resume must retain the ball rather than re-serve.');
  game.step(.02);
  assert(game.ball.x !== position, 'Resume must continue play.');

  game.score('player');
  game.pause();
  const serveBefore = snapshot(game);
  game.step(.05);
  assert(snapshot(game) === serveBefore, 'A paused serve interval must not expire.');
});

Deno.test('pointer and held-key movement keep the entire Petri dish inside the court', () => {
  const game = gameInPlay();
  game.setPlayerY(-10000);
  assert(game.player.y === COURT.dishRadius, 'Dragging above the court must clamp the dish rim.');
  game.setPlayerY(10000);
  assert(game.player.y === COURT.height - COURT.dishRadius, 'Dragging below the court must clamp the dish rim.');
  for (let frame = 0; frame < 40; frame += 1) game.step(.05, -1);
  assert(game.player.y === COURT.dishRadius, 'Held movement must stop at the upper rim.');
  assert(game.cpu.y >= COURT.dishRadius && game.cpu.y <= COURT.height - COURT.dishRadius, 'The computer dish must also remain within the court.');
  const before = game.player.y;
  game.setPlayerY(NaN);
  assert(game.player.y === before, 'Invalid pointer coordinates must not poison the game.');
});

Deno.test('large frame gaps are bounded; invalid elapsed time does not alter the match', () => {
  const game = gameInPlay();
  Object.assign(game.ball, { x: 400, y: 270, vx: 790, vy: 0 });
  game.step(100);
  assert(game.ball.x > 400 && game.ball.x <= 439.50001, 'A large frame gap must consume at most 50 ms.');
  const before = snapshot(game);
  for (const elapsed of [0, -1, Infinity, NaN]) game.step(elapsed, 1);
  assert(snapshot(game) === before, 'Invalid frame deltas must be ignored.');
});

Deno.test('either winner sends the resistance gene to the opposite bacterium', () => {
  for (const winner of ['player', 'cpu']) {
    const transfer = new ResistanceTransfer();
    transfer.begin(winner);
    assert(transfer.winner === winner && transfer.recipient === (winner === 'player' ? 'cpu' : 'player'), 'The losing bacterium must receive the gene.');
    assert(transfer.phase === 'growing' && transfer.active && transfer.extension === 0 && !transfer.transformed, 'A win should start with a new, unextended pilus.');
  }
});

Deno.test('the pilus finishes extending before the gene travels and the recipient transforms', () => {
  const transfer = new ResistanceTransfer();
  transfer.begin('player');
  for (let frame = 0; frame < 10; frame += 1) transfer.step(.05);
  assert(transfer.phase === 'growing' && transfer.extension < 1 && transfer.geneProgress === 0 && !transfer.transformed, 'The gene must wait for the connection.');
  for (let frame = 0; frame < 10; frame += 1) transfer.step(.05);
  assert(transfer.phase === 'sending' && transfer.extension === 1 && transfer.geneProgress > 0 && transfer.geneProgress < 1 && !transfer.transformed, 'A connected pilus should carry the gene before transformation.');
  for (let frame = 0; frame < 22; frame += 1) transfer.step(.05);
  assert(transfer.phase === 'transformed' && transfer.geneProgress === 1 && transfer.transformed, 'The recipient should transform only once the gene arrives.');
  for (let frame = 0; frame < 18; frame += 1) transfer.step(.05);
  assert(transfer.phase === 'complete' && !transfer.active && transfer.elapsed === transfer.duration, 'The sequence must terminate after 2.6 seconds.');
  const before = JSON.stringify(transfer);
  transfer.step(1);
  assert(JSON.stringify(transfer) === before, 'A completed sequence must stay still.');
});

Deno.test('an interrupted transfer stays frozen and resumes from its current gene position', () => {
  const transfer = new ResistanceTransfer();
  transfer.begin('cpu');
  for (let frame = 0; frame < 20; frame += 1) transfer.step(.05);
  const elapsed = transfer.elapsed;
  const progress = transfer.geneProgress;
  transfer.pause();
  const before = JSON.stringify(transfer);
  for (let frame = 0; frame < 100; frame += 1) transfer.step(.05);
  assert(JSON.stringify(transfer) === before, 'Closing or hiding the game must freeze the sequence.');
  transfer.resume();
  assert(transfer.elapsed === elapsed && transfer.geneProgress === progress, 'Resume must retain the transfer position.');
  transfer.step(.05);
  assert(transfer.elapsed > elapsed && transfer.geneProgress > progress, 'Resume must continue towards the recipient.');
});

Deno.test('reduced motion immediately shows the recipient resistant and leaves no active animation', () => {
  for (const winner of ['player', 'cpu']) {
    const transfer = new ResistanceTransfer();
    transfer.begin(winner, true);
    assert(transfer.phase === 'complete' && transfer.transformed && transfer.extension === 1 && transfer.geneProgress === 1 && !transfer.active && !transfer.paused, 'Reduced motion should show the full outcome without an animation.');
    transfer.pause();
    assert(!transfer.paused, 'Closing a completed sequence must not produce a false Resume state.');
  }
});

Deno.test('restart clears the recipient, zombie state and pending paused transfer', () => {
  const transfer = new ResistanceTransfer();
  transfer.begin('player');
  for (let frame = 0; frame < 42; frame += 1) transfer.step(.05);
  transfer.pause();
  transfer.reset();
  assert(transfer.phase === 'idle' && transfer.winner === null && transfer.recipient === null && !transfer.transformed && !transfer.paused && !transfer.active && transfer.elapsed === 0, 'Restart must clear the entire outcome.');
  const before = JSON.stringify(transfer);
  transfer.step(.05);
  assert(JSON.stringify(transfer) === before, 'An idle transfer must not animate.');
});

Deno.test('transfer frame gaps are bounded and switching to reduced motion completes a paused sequence', () => {
  const transfer = new ResistanceTransfer();
  transfer.begin('player');
  transfer.step(100);
  assert(transfer.elapsed === .05 && transfer.phase === 'growing', 'A background frame gap must not skip the entire sequence.');
  const before = JSON.stringify(transfer);
  for (const elapsed of [0, -1, Infinity, NaN]) transfer.step(elapsed);
  assert(JSON.stringify(transfer) === before, 'Invalid animation times must be ignored.');
  transfer.pause();
  transfer.complete();
  assert(transfer.phase === 'complete' && !transfer.paused && !transfer.active && transfer.transformed, 'Changing the motion preference must finish even a paused transfer.');
});
