/* NovaOS games: Solitaire, Minesweeper, Blocks, Bricks, Pinball, Dungeon 3D.
   All original code and art (drawn with code, no image files). */
(() => {
  'use strict';
  const { register, createWindow, store, h } = window.NovaOS;
  const game = (id, name, icon, open) => register(id, name, icon, open, 'game');

  /* ================= Shared helpers ================= */
  // Runs step(dt) every animation frame (dt = 1 at 60 fps) until the window closes.
  function loop(win, step) {
    let alive = true, last = performance.now();
    const frame = t => {
      if (!alive) return;
      const dt = Math.min(3, (t - last) / 16.667); last = t;
      if (!win.minimized) step(dt);
      requestAnimationFrame(frame);
    };
    requestAnimationFrame(frame);
    win.onClose.push(() => { alive = false; });
  }

  // A focusable game root with a canvas stage, optional HUD and touch pad.
  function shell(win, w, hgt, { pixel = false } = {}) {
    const canvas = h('canvas', { width: w, height: hgt, class: pixel ? 'pixel' : '' });
    const hud = h('div', { class: 'hud' });
    const pad = h('div', { class: 'pad' });
    const root = h('div', { class: 'game', tabindex: '0' }, hud, h('div', { class: 'stage' }, canvas), pad);
    const held = new Set();
    root.addEventListener('keydown', e => {
      const k = e.key.length === 1 ? e.key.toLowerCase() : e.key;
      if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', ' '].includes(k)) e.preventDefault();
      held.add(k);
    });
    root.addEventListener('keyup', e => held.delete(e.key.length === 1 ? e.key.toLowerCase() : e.key));
    root.addEventListener('blur', () => held.clear());
    root.addEventListener('pointerdown', () => root.focus());
    win.body.append(root);
    setTimeout(() => root.focus(), 60);
    // A pad button that "holds" a virtual key while pressed.
    const hold = (label, key, onPress) => {
      const b = h('button', {}, label);
      const up = () => { held.delete(key); b.classList.remove('down'); };
      b.addEventListener('pointerdown', e => { e.preventDefault(); b.setPointerCapture(e.pointerId); held.add(key); b.classList.add('down'); onPress && onPress(); root.focus(); });
      b.addEventListener('pointerup', up); b.addEventListener('pointercancel', up);
      pad.append(b); return b;
    };
    const tap = (label, fn) => { const b = h('button', { onpointerdown: e => { e.preventDefault(); fn(); root.focus(); } }, label); pad.append(b); return b; };
    return { root, canvas, ctx: canvas.getContext('2d'), hud, pad, held, hold, tap };
  }
  const best = (key, score) => { const b = store.get(key, 0); if (score > b) { store.set(key, score); return score; } return b; };
  const shuffle = a => { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };

  /* ================= Solitaire (Klondike) ================= */
  game('solitaire', 'Пасианс', '🃏', () => {
    const win = createWindow({ title: 'Пасианс', icon: '🃏', width: 760, height: 560, appId: 'solitaire' });
    const SUITS = ['♠', '♥', '♦', '♣'], RANKS = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];
    const isRed = s => s === 1 || s === 2;
    let stock, waste, found, tab, sel, moves, start, won, timer;
    const board = h('div', { class: 'sol-board' });
    const info = h('span', { class: 'info' });

    const deal = () => {
      const deck = shuffle([...Array(52)].map((_, i) => ({ s: i % 4, r: Math.floor(i / 4), up: false })));
      tab = [...Array(7)].map((_, i) => { const p = deck.splice(0, i + 1); p[p.length - 1].up = true; return p; });
      stock = deck; waste = []; found = [[], [], [], []]; sel = null; moves = 0; won = false; start = Date.now();
      render();
    };
    const pileOf = loc => loc.t === 'tab' ? tab[loc.i] : loc.t === 'found' ? found[loc.i] : loc.t === 'waste' ? waste : stock;
    const cardsOf = loc => loc.t === 'tab' ? tab[loc.i].slice(loc.k) : [pileOf(loc).at(-1)];
    const canPlace = (cards, t, i) => {
      const c = cards[0];
      if (t === 'found') {
        const top = found[i].at(-1);
        return cards.length === 1 && (top ? top.s === c.s && top.r === c.r - 1 : c.r === 0);
      }
      const top = tab[i].at(-1);
      return top ? top.up && isRed(top.s) !== isRed(c.s) && top.r === c.r + 1 : c.r === 12;
    };
    const move = (from, t, i) => {
      const cards = cardsOf(from);
      if (!cards[0] || !canPlace(cards, t, i)) return false;
      const src = pileOf(from);
      src.splice(src.length - cards.length, cards.length);
      (t === 'found' ? found : tab)[i].push(...cards);
      if (from.t === 'tab' && src.length) src.at(-1).up = true;
      moves++;
      if (found.every(f => f.length === 13)) won = true;
      return true;
    };
    const toFoundation = loc => {
      for (let i = 0; i < 4; i++) if (move(loc, 'found', i)) return true;
      return false;
    };
    const autoFinish = () => {
      let again = true;
      while (again) {
        again = false;
        if (waste.length && toFoundation({ t: 'waste' })) again = true;
        tab.forEach((p, i) => { if (p.length && toFoundation({ t: 'tab', i, k: p.length - 1 })) again = true; });
      }
      sel = null; render();
    };
    const same = (a, b) => a && b && a.t === b.t && a.i === b.i && a.k === b.k;

    const onTap = loc => {
      if (won) return;
      if (loc.t === 'stock') {
        if (stock.length) { const c = stock.pop(); c.up = true; waste.push(c); }
        else { stock = waste.reverse().map(c => ({ ...c, up: false })); waste = []; }
        sel = null; moves++; return render();
      }
      const isCard = loc.k !== undefined || (loc.t === 'waste' && waste.length) || (loc.t === 'found' && found[loc.i].length);
      if (sel) {
        if (same(sel, loc)) { toFoundation(sel); sel = null; return render(); } // tap twice = send home
        if ((loc.t === 'tab' || loc.t === 'found') && move(sel, loc.t, loc.i)) { sel = null; return render(); }
      }
      sel = null;
      if (isCard) {
        if (loc.t === 'tab' && !tab[loc.i][loc.k].up) return render();
        if (loc.t === 'waste') loc = { t: 'waste' };
        if (loc.t === 'found') loc = { t: 'found', i: loc.i };
        sel = loc;
      }
      render();
    };

    const cardEl = (c, x, y, w, hh, loc) => {
      const el = h('div', { class: 'card' + (c.up ? (isRed(c.s) ? ' red' : '') : ' back') + (same(sel, loc) || (sel && sel.t === 'tab' && loc.t === 'tab' && loc.i === sel.i && loc.k > sel.k) ? ' sel' : ''),
        style: `left:${x}px;top:${y}px;width:${w}px;height:${hh}px` });
      if (c.up) {
        el.append(h('div', { class: 'cr', style: `font-size:${Math.max(10, w * .2)}px` }, RANKS[c.r], h('br'), SUITS[c.s]),
          h('div', { class: 'cc', style: `font-size:${w * .5}px` }, SUITS[c.s]));
      }
      el.onclick = e => { e.stopPropagation(); onTap(loc); };
      return el;
    };
    const slotEl = (x, y, w, hh, label, loc) => {
      const el = h('div', { class: 'slot', style: `left:${x}px;top:${y}px;width:${w}px;height:${hh}px` }, label);
      el.onclick = () => onTap(loc);
      return el;
    };

    const render = () => {
      const W = board.clientWidth, H = board.clientHeight;
      if (!W) return;
      const gap = Math.max(4, W * .015), cw = Math.min(96, (W - gap * 8) / 7), ch = cw * 1.4;
      const col = i => gap + i * (cw + gap);
      board.innerHTML = '';
      board.append(slotEl(col(0), gap, cw, ch, stock.length ? '' : '⟳', { t: 'stock' }));
      if (stock.length) board.append(cardEl(stock.at(-1), col(0), gap, cw, ch, { t: 'stock' }));
      board.append(slotEl(col(1), gap, cw, ch, '', { t: 'waste' }));
      waste.slice(-3).forEach((c, j, arr) => board.append(cardEl(c, col(1) + j * cw * .18, gap, cw, ch, j === arr.length - 1 ? { t: 'waste' } : { t: 'none' })));
      found.forEach((f, i) => {
        board.append(slotEl(col(3 + i), gap, cw, ch, SUITS[i], { t: 'found', i }));
        if (f.length) board.append(cardEl(f.at(-1), col(3 + i), gap, cw, ch, { t: 'found', i }));
      });
      const top = gap * 2 + ch;
      tab.forEach((p, i) => {
        board.append(slotEl(col(i), top, cw, ch, 'K', { t: 'tab', i }));
        const downs = p.filter(c => !c.up).length, ups = p.length - downs;
        let dDown = ch * .12, dUp = ch * .28;
        const need = downs * dDown + Math.max(0, ups - 1) * dUp + ch;
        if (need > H - top - gap) { const f = (H - top - gap - ch) / (need - ch); dDown *= f; dUp *= f; }
        let y = top;
        p.forEach((c, k) => { board.append(cardEl(c, col(i), y, cw, ch, { t: 'tab', i, k })); y += c.up ? dUp : dDown; });
      });
      if (won) board.append(h('div', { class: 'win-msg' }, '🏆 Победа!', h('button', { class: 'btn', onclick: deal }, 'Нова игра')));
    };
    const tick = () => {
      const s = Math.floor((Date.now() - start) / 1000);
      info.textContent = `Ходове: ${moves}  ·  Време: ${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
    };
    win.body.append(h('div', { class: 'sol' },
      h('div', { class: 'toolbar' },
        h('button', { onclick: deal }, '🔄 Нова игра'),
        h('button', { onclick: autoFinish }, '⬆ Към базите'),
        info),
      board,
      h('div', { class: 'status', style: 'color:#d8f3dc;border-color:rgba(0,0,0,.25)' }, 'Докосни карта, после мястото, където отива. Докосни я втори път, за да отиде в базата.')));
    new ResizeObserver(() => render()).observe(board);
    timer = setInterval(() => { if (!won) tick(); }, 1000);
    win.onClose.push(() => clearInterval(timer));
    deal(); tick();
  });

  /* ================= Minesweeper ================= */
  game('mines', 'Сапьор', '💣', () => {
    const win = createWindow({ title: 'Сапьор', icon: '💣', width: 420, height: 520, appId: 'mines' });
    const LEVELS = { 'Лесно': [9, 9, 10], 'Средно': [16, 16, 40], 'Трудно': [16, 30, 99] };
    let level = 'Лесно', R, C, M, cells, started, over, flagMode = false, t0, timer;
    const counter = h('div', { class: 'lcd' }), clock = h('div', { class: 'lcd' });
    const face = h('button', { class: 'face', onclick: () => reset() }, '🙂');
    const grid = h('div', { class: 'grid' });
    const flagBtn = h('button', { onclick: () => { flagMode = !flagMode; flagBtn.classList.toggle('on', flagMode); } }, '🚩 Знаменце');
    const lvlBtns = Object.keys(LEVELS).map(name => h('button', { onclick: () => { level = name; reset(); } }, name));
    const root = h('div', { class: 'mines' },
      h('div', { class: 'bar' }, counter, face, clock), grid,
      h('div', { class: 'opts' }, ...lvlBtns, flagBtn));

    const nb = i => {
      const r = Math.floor(i / C), c = i % C, out = [];
      for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) {
        const rr = r + dr, cc = c + dc;
        if ((dr || dc) && rr >= 0 && rr < R && cc >= 0 && cc < C) out.push(rr * C + cc);
      }
      return out;
    };
    const fit = () => {
      const avail = root.clientWidth - 26;
      grid.style.setProperty('--c', Math.max(16, Math.min(30, Math.floor(avail / C))) + 'px');
    };
    const reset = () => {
      [R, C, M] = LEVELS[level];
      cells = [...Array(R * C)].map(() => ({ m: false, o: false, f: false, n: 0 }));
      started = false; over = false; clearInterval(timer); clock.textContent = '000';
      face.textContent = '🙂';
      lvlBtns.forEach(b => b.classList.toggle('on', b.textContent === level));
      grid.style.gridTemplateColumns = `repeat(${C}, var(--c, 24px))`;
      grid.innerHTML = '';
      cells.forEach((cell, i) => {
        const b = h('button', { class: 'c' });
        let press;
        b.addEventListener('pointerdown', e => {
          if (e.pointerType === 'touch') press = setTimeout(() => { press = 'long'; flag(i); }, 420);
        });
        b.addEventListener('pointerup', () => { if (press !== 'long') clearTimeout(press); });
        b.addEventListener('click', () => { if (press === 'long') { press = null; return; } flagMode ? flag(i) : open(i); });
        b.addEventListener('contextmenu', e => { e.preventDefault(); flag(i); });
        cell.el = b; grid.append(b);
      });
      fit(); paint();
    };
    const plant = safe => {
      const banned = new Set([safe, ...nb(safe)]);
      const spots = shuffle(cells.map((_, i) => i).filter(i => !banned.has(i))).slice(0, M);
      spots.forEach(i => { cells[i].m = true; });
      cells.forEach((c, i) => { c.n = nb(i).filter(j => cells[j].m).length; });
      started = true; t0 = Date.now();
      timer = setInterval(() => { clock.textContent = String(Math.min(999, Math.floor((Date.now() - t0) / 1000))).padStart(3, '0'); }, 250);
    };
    const flag = i => { if (over || cells[i].o) return; cells[i].f = !cells[i].f; paint(); };
    const open = i => {
      if (over || cells[i].f || cells[i].o) return;
      if (!started) plant(i);
      if (cells[i].m) {
        over = true; clearInterval(timer); face.textContent = '😵';
        cells.forEach(c => { if (c.m) c.o = true; }); cells[i].boom = true;
        return paint();
      }
      const stack = [i];
      while (stack.length) {
        const j = stack.pop(); const c = cells[j];
        if (c.o || c.f) continue;
        c.o = true;
        if (c.n === 0) stack.push(...nb(j));
      }
      if (cells.every(c => c.o || c.m)) {
        over = true; clearInterval(timer); face.textContent = '😎';
        cells.forEach(c => { if (c.m) c.f = true; });
      }
      paint();
    };
    const paint = () => {
      counter.textContent = String(M - cells.filter(c => c.f).length).padStart(3, '0');
      cells.forEach(c => {
        c.el.className = 'c' + (c.o ? ' o' : '') + (c.boom ? ' boom' : '') + (c.o && !c.m && c.n ? ' n' + c.n : '');
        c.el.textContent = c.o ? (c.m ? '💣' : c.n || '') : c.f ? '🚩' : '';
      });
    };
    win.body.append(root);
    new ResizeObserver(fit).observe(root);
    win.onClose.push(() => clearInterval(timer));
    reset();
  });

  /* ================= Blocks (falling-block puzzle) ================= */
  game('blocks', 'Блокчета', '🧱', () => {
    const win = createWindow({ title: 'Блокчета', icon: '🧱', width: 420, height: 640, appId: 'blocks' });
    const COLS = 10, ROWS = 20, S = 24, PANEL = 120;
    const g = shell(win, COLS * S + PANEL, ROWS * S);
    const { ctx, held } = g;
    const SHAPES = [
      [[1, 1, 1, 1]], [[1, 1], [1, 1]], [[0, 1, 0], [1, 1, 1]], [[1, 0, 0], [1, 1, 1]],
      [[0, 0, 1], [1, 1, 1]], [[0, 1, 1], [1, 1, 0]], [[1, 1, 0], [0, 1, 1]],
    ];
    const COLORS = ['#38d9f5', '#ffd43b', '#b26df5', '#4c7cf5', '#ff9f43', '#51cf66', '#ff6b6b'];
    let board, cur, next, score, lines, lvl, fall, over, top = store.get('nova-blocks-best', 0);
    const newPiece = () => { const t = Math.floor(Math.random() * 7); return { t, m: SHAPES[t].map(r => [...r]), x: 0, y: 0 }; };
    const spawn = () => {
      cur = next || newPiece(); next = newPiece();
      cur.x = Math.floor((COLS - cur.m[0].length) / 2); cur.y = 0;
      if (hits(cur.m, cur.x, cur.y)) { over = true; top = best('nova-blocks-best', score); }
    };
    const reset = () => { board = [...Array(ROWS)].map(() => Array(COLS).fill(-1)); next = null; score = 0; lines = 0; lvl = 1; fall = 0; over = false; spawn(); };
    const hits = (m, x, y) => m.some((row, r) => row.some((v, c) => v && (x + c < 0 || x + c >= COLS || y + r >= ROWS || (y + r >= 0 && board[y + r][x + c] >= 0))));
    const rotate = () => {
      const m = cur.m[0].map((_, c) => cur.m.map(row => row[c]).reverse());
      for (const k of [0, -1, 1, -2, 2]) if (!hits(m, cur.x + k, cur.y)) { cur.m = m; cur.x += k; return; }
    };
    const lock = () => {
      cur.m.forEach((row, r) => row.forEach((v, c) => { if (v && cur.y + r >= 0) board[cur.y + r][cur.x + c] = cur.t; }));
      let cleared = 0;
      for (let r = ROWS - 1; r >= 0; r--) if (board[r].every(v => v >= 0)) { board.splice(r, 1); board.unshift(Array(COLS).fill(-1)); cleared++; r++; }
      if (cleared) { lines += cleared; score += [0, 100, 300, 500, 800][cleared] * lvl; lvl = 1 + Math.floor(lines / 10); }
      spawn();
    };
    const drop = () => { if (!hits(cur.m, cur.x, cur.y + 1)) cur.y++; else lock(); fall = 0; };
    const act = k => {
      if (over) { if (k === ' ' || k === 'Enter') reset(); return; }
      if (k === 'ArrowLeft' && !hits(cur.m, cur.x - 1, cur.y)) cur.x--;
      if (k === 'ArrowRight' && !hits(cur.m, cur.x + 1, cur.y)) cur.x++;
      if (k === 'ArrowUp' || k === 'x') rotate();
      if (k === 'ArrowDown') { drop(); score += 1; }
      if (k === ' ') { while (!hits(cur.m, cur.x, cur.y + 1)) { cur.y++; score += 2; } lock(); }
    };
    g.root.addEventListener('keydown', e => act(e.key.length === 1 ? e.key.toLowerCase() : e.key));
    held.clear();
    g.tap('◀', () => act('ArrowLeft')); g.tap('⟳', () => act('ArrowUp')); g.tap('▼', () => act('ArrowDown'));
    g.tap('▶', () => act('ArrowRight')); g.tap('⤓', () => act(over ? 'Enter' : ' '));
    const cell = (x, y, color, size = S) => {
      ctx.fillStyle = color; ctx.fillRect(x, y, size - 1, size - 1);
      ctx.fillStyle = 'rgba(255,255,255,.25)'; ctx.fillRect(x, y, size - 1, 3);
    };
    loop(win, dt => {
      if (!over) { fall += dt * 16.667; if (fall > Math.max(70, 800 - (lvl - 1) * 70)) drop(); }
      ctx.fillStyle = '#10131c'; ctx.fillRect(0, 0, g.canvas.width, g.canvas.height);
      ctx.strokeStyle = '#1b2030';
      for (let x = 0; x <= COLS; x++) { ctx.beginPath(); ctx.moveTo(x * S, 0); ctx.lineTo(x * S, ROWS * S); ctx.stroke(); }
      board.forEach((row, r) => row.forEach((v, c) => { if (v >= 0) cell(c * S, r * S, COLORS[v]); }));
      if (!over) {
        let gy = cur.y; while (!hits(cur.m, cur.x, gy + 1)) gy++;
        cur.m.forEach((row, r) => row.forEach((v, c) => { if (v) { ctx.fillStyle = 'rgba(255,255,255,.12)'; ctx.fillRect((cur.x + c) * S, (gy + r) * S, S - 1, S - 1); } }));
        cur.m.forEach((row, r) => row.forEach((v, c) => { if (v) cell((cur.x + c) * S, (cur.y + r) * S, COLORS[cur.t]); }));
      }
      const px = COLS * S + 12;
      ctx.fillStyle = '#c9d1e8'; ctx.font = '600 13px system-ui, sans-serif';
      ctx.fillText('СЛЕДВАЩО', px, 24);
      next.m.forEach((row, r) => row.forEach((v, c) => { if (v) cell(px + c * 18, 36 + r * 18, COLORS[next.t], 18); }));
      [['ТОЧКИ', score], ['РЕДОВЕ', lines], ['НИВО', lvl], ['РЕКОРД', top]].forEach(([k, v], i) => {
        ctx.fillStyle = '#7d87a6'; ctx.fillText(k, px, 120 + i * 52);
        ctx.fillStyle = '#fff'; ctx.font = '700 20px system-ui, sans-serif'; ctx.fillText(v, px, 144 + i * 52);
        ctx.font = '600 13px system-ui, sans-serif';
      });
      if (over) {
        ctx.fillStyle = 'rgba(0,0,0,.65)'; ctx.fillRect(0, 0, COLS * S, ROWS * S);
        ctx.fillStyle = '#fff'; ctx.textAlign = 'center'; ctx.font = '800 26px system-ui, sans-serif';
        ctx.fillText('КРАЙ', COLS * S / 2, ROWS * S / 2 - 10);
        ctx.font = '14px system-ui, sans-serif'; ctx.fillText('Space или ⤓ за нова игра', COLS * S / 2, ROWS * S / 2 + 18);
        ctx.textAlign = 'left';
      }
      g.hud.textContent = '← → местене · ↑ завъртане · ↓ надолу · Space пускане';
    });
    reset();
  });

  /* ================= Bricks (breakout) ================= */
  game('bricks', 'Тухли', '🏓', () => {
    const win = createWindow({ title: 'Тухли', icon: '🏓', width: 560, height: 520, appId: 'bricks' });
    const W = 480, H = 380;
    const g = shell(win, W, H);
    const { ctx, held, canvas } = g;
    const ROW_COLORS = ['#ff6b6b', '#ff9f43', '#ffd43b', '#51cf66', '#38d9f5', '#845ef7'];
    let paddle, ball, bricks, lives, score, level, stuck, msg;
    const build = () => {
      bricks = [];
      const cols = 10, bw = (W - 20) / cols;
      for (let r = 0; r < 6; r++) for (let c = 0; c < cols; c++) {
        if (level > 1 && (r + c + level) % 5 === 0) continue; // gaps on later levels
        bricks.push({ x: 10 + c * bw, y: 40 + r * 18, w: bw - 3, h: 14, color: ROW_COLORS[r], hp: level > 2 && r === 0 ? 2 : 1 });
      }
    };
    const serve = () => { stuck = true; ball = { x: paddle.x, y: H - 30, vx: 0, vy: 0, r: 6 }; };
    const reset = () => { paddle = { x: W / 2, w: 80 }; lives = 3; score = 0; level = 1; msg = ''; build(); serve(); };
    const launch = () => {
      if (msg) { reset(); return; }
      if (stuck) { stuck = false; const sp = 4.6 + level * .4; ball.vx = sp * .5; ball.vy = -sp; }
    };
    // The canvas is letterboxed (object-fit: contain), so map through the drawn area only.
    const toX = e => { const r = canvas.getBoundingClientRect(), k = Math.min(r.width / W, r.height / H); return (e.clientX - r.left - (r.width - W * k) / 2) / k; };
    canvas.addEventListener('pointermove', e => { paddle.x = toX(e); });
    canvas.addEventListener('pointerdown', e => { canvas.setPointerCapture(e.pointerId); paddle.x = toX(e); launch(); });
    g.root.addEventListener('keydown', e => { if (e.key === ' ') launch(); });
    g.hold('◀', 'ArrowLeft'); g.tap('🚀', launch); g.hold('▶', 'ArrowRight');
    loop(win, dt => {
      if (held.has('ArrowLeft')) paddle.x -= 7 * dt;
      if (held.has('ArrowRight')) paddle.x += 7 * dt;
      paddle.x = Math.max(paddle.w / 2, Math.min(W - paddle.w / 2, paddle.x));
      if (stuck) { ball.x = paddle.x; ball.y = H - 30; }
      else if (!msg) {
        const steps = 3;
        for (let s = 0; s < steps; s++) {
          ball.x += ball.vx * dt / steps; ball.y += ball.vy * dt / steps;
          if (ball.x < ball.r || ball.x > W - ball.r) { ball.vx *= -1; ball.x = Math.max(ball.r, Math.min(W - ball.r, ball.x)); }
          if (ball.y < ball.r) { ball.vy = Math.abs(ball.vy); }
          if (ball.vy > 0 && ball.y > H - 24 - ball.r && ball.y < H - 14 && Math.abs(ball.x - paddle.x) < paddle.w / 2 + ball.r) {
            const hit = (ball.x - paddle.x) / (paddle.w / 2), sp = Math.hypot(ball.vx, ball.vy);
            ball.vx = sp * Math.sin(hit * 1.05); ball.vy = -sp * Math.cos(hit * 1.05);
          }
          for (const b of bricks) {
            if (b.hp <= 0) continue;
            const nx = Math.max(b.x, Math.min(ball.x, b.x + b.w)), ny = Math.max(b.y, Math.min(ball.y, b.y + b.h));
            if ((ball.x - nx) ** 2 + (ball.y - ny) ** 2 > ball.r ** 2) continue;
            const ox = Math.min(ball.x + ball.r - b.x, b.x + b.w - (ball.x - ball.r));
            const oy = Math.min(ball.y + ball.r - b.y, b.y + b.h - (ball.y - ball.r));
            if (ox < oy) ball.vx *= -1; else ball.vy *= -1;
            b.hp--; score += 10 * level;
            break;
          }
        }
        if (ball.y > H + 20) { lives--; if (lives <= 0) { msg = 'КРАЙ'; best('nova-bricks-best', score); } else serve(); }
        if (bricks.every(b => b.hp <= 0)) { level++; build(); serve(); }
      }
      ctx.fillStyle = '#0d1020'; ctx.fillRect(0, 0, W, H);
      bricks.forEach(b => {
        if (b.hp <= 0) return;
        ctx.fillStyle = b.color; ctx.globalAlpha = b.hp > 1 ? 1 : .88; ctx.fillRect(b.x, b.y, b.w, b.h);
        ctx.globalAlpha = 1; ctx.fillStyle = 'rgba(255,255,255,.3)'; ctx.fillRect(b.x, b.y, b.w, 3);
      });
      ctx.fillStyle = '#e8ecff'; ctx.fillRect(paddle.x - paddle.w / 2, H - 22, paddle.w, 8);
      ctx.beginPath(); ctx.arc(ball.x, ball.y, ball.r, 0, Math.PI * 2); ctx.fillStyle = '#fff'; ctx.fill();
      if (stuck && !msg) { ctx.fillStyle = '#aab'; ctx.textAlign = 'center'; ctx.font = '14px system-ui'; ctx.fillText('Докосни или Space за старт', W / 2, H / 2 + 60); ctx.textAlign = 'left'; }
      if (msg) {
        ctx.fillStyle = 'rgba(0,0,0,.6)'; ctx.fillRect(0, 0, W, H); ctx.fillStyle = '#fff'; ctx.textAlign = 'center';
        ctx.font = '800 30px system-ui'; ctx.fillText(msg, W / 2, H / 2);
        ctx.font = '14px system-ui'; ctx.fillText('Докосни за нова игра', W / 2, H / 2 + 28); ctx.textAlign = 'left';
      }
      g.hud.textContent = `Точки: ${score}   ·   Животи: ${'❤'.repeat(Math.max(0, lives))}   ·   Ниво: ${level}   ·   Рекорд: ${store.get('nova-bricks-best', 0)}`;
    });
    reset();
  });

  /* ================= Volcano Pinball (tilted 3D table + side panel) ================= */
  game('pinball', 'Пинбол Вулкан', '🌋', () => {
    const win = createWindow({ title: 'Пинбол Вулкан', icon: '🌋', width: 720, height: 720, appId: 'pinball' });
    const W = 320, H = 560, SUB = 8, G = 0.2, MAXV = 17, RES = 2;
    const g = shell(win, W * RES, H * RES);
    const { ctx, held, canvas } = g;
    ctx.scale(RES, RES);

    // ---- layout: tilted table on the left, cabinet panel on the right ----
    const stage = canvas.parentElement;
    stage.classList.add('pb-stage');
    const el = (cls, txt = '') => h('div', { class: cls }, txt);
    const ballBox = el('pb-ball', '1'), scoreBox = el('pb-score', '0'), multBox = el('pb-mult', '×1');
    const lines = [el('pb-line'), el('pb-line'), el('pb-line')];
    const missionBox = el('pb-mission'), rankBox = el('pb-rank'), bestBox = el('pb-best');
    const panel = h('div', { class: 'pb-panel' },
      h('div', { class: 'pb-logo' }, h('span', {}, 'ПИНБОЛ'), h('b', {}, 'ВУЛКАН')),
      h('div', { class: 'pb-row' }, h('div', { class: 'pb-lbl' }, 'ТОПКА'), ballBox, multBox),
      scoreBox,
      h('div', { class: 'pb-msgs' }, ...lines),
      h('div', { class: 'pb-lbl' }, 'МИСИЯ'), missionBox,
      h('div', { class: 'pb-lbl' }, 'РАНГ'), rankBox, bestBox);
    const wrap = h('div', { class: 'pb-wrap' });
    stage.replaceWith(wrap);
    wrap.append(stage, panel);

    // ---- table geometry (table units, 320 × 560) ----
    const walls = [];
    const seg = (x1, y1, x2, y2, kind = '') => walls.push({ x1, y1, x2, y2, kind });
    seg(10, 415, 10, 150);
    for (let i = 0; i < 18; i++) {
      const a1 = Math.PI + Math.PI * i / 18, a2 = Math.PI + Math.PI * (i + 1) / 18;
      seg(160 + 150 * Math.cos(a1), 150 + 70 * Math.sin(a1), 160 + 150 * Math.cos(a2), 150 + 70 * Math.sin(a2));
    }
    seg(310, 150, 310, 545); seg(285, 545, 310, 545); seg(285, 545, 285, 215);
    seg(10, 415, 85, 480); seg(285, 415, 200, 480);
    seg(48, 352, 74, 430, 'sling'); seg(48, 352, 40, 400); seg(237, 352, 211, 430, 'sling'); seg(237, 352, 245, 400);
    seg(36, 250, 36, 330); seg(250, 250, 250, 320); // inner orbit guides
    const bumpers = [{ x: 100, y: 222, r: 19 }, { x: 200, y: 222, r: 19 }, { x: 150, y: 282, r: 19 }, { x: 70, y: 150, r: 9 }, { x: 230, y: 150, r: 9 }];
    const lights = [{ x: 115, y: 115 }, { x: 160, y: 108 }, { x: 205, y: 115 }];
    const drops = [130, 160, 190].map(x => ({ x, y: 176, up: true }));
    const pool = { x: 142.5, y: 372, r: 22 };
    const mkFlipper = (x, y, dir) => ({ x, y, dir, len: 50, rest: 0.52, up: -0.48, a: 0.52, prev: null });
    const flippers = [mkFlipper(85, 480, 1), mkFlipper(200, 480, -1)];
    const tip = f => ({ x: f.x + f.dir * f.len * Math.cos(f.a), y: f.y + f.len * Math.sin(f.a) });

    // ---- game state ----
    const MISSIONS = [
      { text: 'Удари бъмперите 8 пъти', key: 'bumper', need: 8, reward: 5000 },
      { text: 'Събори 3-те мишени', key: 'drop', need: 3, reward: 7500 },
      { text: 'Запали 3-те светлини горе', key: 'light', need: 3, reward: 6000 },
      { text: 'Удари прашките 6 пъти', key: 'sling', need: 6, reward: 4000 },
      { text: 'Мини през лавовия кратер 3 пъти', key: 'pool', need: 3, reward: 8000 },
    ];
    const RANKS = ['Новак', 'Изследовател', 'Скален катерач', 'Вулканолог', 'Повелител на лавата', 'Легенда'];
    let ball, score, ballNo, mult, rank, mission, progress, charge, over, paused, saveUntil, inPool, flash = 0, time = 0;
    let topScore = store.get('nova-pinball-best', 0);
    const say = (text) => { lines.shift().remove(); const l = el('pb-line new', text); lines.push(l); panel.querySelector('.pb-msgs').append(l); };
    const add = pts => { score += pts * mult; };
    const nextMission = () => { mission = (mission + 1) % MISSIONS.length; progress = 0; };
    const hit = key => {
      const m = MISSIONS[mission];
      if (m.key !== key) return;
      progress++;
      if (progress >= m.need) {
        add(m.reward); flash = 24;
        rank = Math.min(RANKS.length - 1, rank + 1);
        say(`✔ Мисията е изпълнена! +${m.reward * mult}`); say(`Нов ранг: ${RANKS[rank]}`);
        nextMission();
      }
    };
    const newBall = () => { ball = { x: 297.5, y: 530, vx: 0, vy: 0, r: 7 }; charge = 0; saveUntil = 0; inPool = false; };
    const reset = () => {
      score = 0; ballNo = 1; mult = 1; rank = 0; mission = 0; progress = 0; over = false; paused = false;
      lights.forEach(l => { l.on = false; }); drops.forEach(d => { d.up = true; });
      newBall(); say('Добре дошъл във Вулкана!'); say('Задръж 🚀 / Space и пусни');
    };
    const inLane = () => ball.x > 286 && ball.y > 480;

    // ---- physics helpers ----
    const closest = (b, x1, y1, x2, y2) => {
      const dx = x2 - x1, dy = y2 - y1;
      const t = Math.max(0, Math.min(1, ((b.x - x1) * dx + (b.y - y1) * dy) / (dx * dx + dy * dy)));
      return { t, px: x1 + t * dx, py: y1 + t * dy };
    };
    const bounce = (b, px, py, R, e, ux = 0, uy = 0) => {
      let nx = b.x - px, ny = b.y - py; const d = Math.hypot(nx, ny);
      if (d >= R || d === 0) return null;
      nx /= d; ny /= d; b.x = px + nx * R; b.y = py + ny * R;
      const vn = (b.vx - ux) * nx + (b.vy - uy) * ny;
      if (vn < 0) { b.vx -= (1 + e) * vn * nx; b.vy -= (1 + e) * vn * ny; }
      return { nx, ny };
    };

    // ---- input ----
    const left = () => held.has('ArrowLeft') || held.has('z') || held.has('Shift') || held.has('tl');
    const right = () => held.has('ArrowRight') || held.has('m') || held.has('/') || held.has('tr');
    const launchKey = () => held.has(' ') || held.has('ArrowDown') || held.has('launch');
    const togglePause = () => { if (over) return; paused = !paused; say(paused ? '⏸ Пауза — P за продължение' : '▶ Продължаваме!'); };
    canvas.addEventListener('pointerdown', e => {
      canvas.setPointerCapture(e.pointerId);
      if (over) { reset(); return; }
      const r = canvas.getBoundingClientRect();
      const key = (e.clientX - r.left) / r.width < .5 ? 'tl' : 'tr';
      const k2 = inLane() && key === 'tr' ? 'launch' : key;
      held.add(k2);
      const up = () => { held.delete(k2); canvas.removeEventListener('pointerup', up); canvas.removeEventListener('pointercancel', up); };
      canvas.addEventListener('pointerup', up); canvas.addEventListener('pointercancel', up);
    });
    g.hold('◀ Ляв', 'tl'); g.hold('🚀', 'launch'); g.tap('⏸', togglePause); g.hold('Десен ▶', 'tr');
    g.root.addEventListener('keydown', e => {
      if (e.key === 'p' || e.key === 'P' || e.key === 'F3') { e.preventDefault(); togglePause(); }
      if (over && (e.key === ' ' || e.key === 'Enter')) reset();
    });

    // ---- simulation ----
    let wasLaunching = false;
    const step = dt => {
      time += dt;
      if (inLane() && Math.abs(ball.vy) < 1) {
        if (launchKey()) charge = Math.min(1, charge + 0.025 * dt);
        else if (wasLaunching && charge > 0) { ball.vy = -(9 + charge * 9); charge = 0; saveUntil = time + 480; say('🔥 Топката е в игра!'); }
      }
      wasLaunching = launchKey();
      for (let s = 0; s < SUB; s++) {
        const st = dt / SUB;
        flippers.forEach((f, i) => {
          f.prev = tip(f);
          const target = (i === 0 ? left() : right()) ? f.up : f.rest, sp = 0.38 * st;
          f.a += Math.max(-sp, Math.min(sp, target - f.a));
        });
        ball.vy += G * st; ball.x += ball.vx * st; ball.y += ball.vy * st;
        for (const w of walls) {
          const c = closest(ball, w.x1, w.y1, w.x2, w.y2);
          const n = bounce(ball, c.px, c.py, ball.r + 2, w.kind === 'sling' ? 0.2 : 0.45);
          if (n && w.kind === 'sling') { ball.vx += n.nx * 5; ball.vy += n.ny * 5; add(10); w.lit = 6; hit('sling'); }
        }
        for (const b of bumpers) {
          const n = bounce(ball, b.x, b.y, b.r + ball.r, 0.6);
          if (n) { ball.vx += n.nx * 4.5; ball.vy += n.ny * 4.5; add(b.r > 15 ? 100 : 50); b.lit = 8; if (b.r > 15) hit('bumper'); }
        }
        for (const d of drops) {
          if (!d.up) continue;
          const c = closest(ball, d.x - 9, d.y, d.x + 9, d.y);
          if (bounce(ball, c.px, c.py, ball.r + 3, 0.4)) {
            d.up = false; add(500); hit('drop');
            if (drops.every(x => !x.up)) { add(3000); say('💥 Всички мишени! +' + 3000 * mult); setTimeout(() => drops.forEach(x => { x.up = true; }), 1500); }
          }
        }
        flippers.forEach(f => {
          const t = tip(f), c = closest(ball, f.x, f.y, t.x, t.y);
          bounce(ball, c.px, c.py, ball.r + 6, 0.3, (t.x - f.prev.x) / st * c.t, (t.y - f.prev.y) / st * c.t);
        });
        const sp = Math.hypot(ball.vx, ball.vy);
        if (sp > MAXV) { ball.vx *= MAXV / sp; ball.vy *= MAXV / sp; }
      }
      lights.forEach(l => { if (!l.on && Math.hypot(ball.x - l.x, ball.y - l.y) < 12) { l.on = true; add(250); hit('light'); } });
      if (lights.every(l => l.on)) {
        mult = Math.min(5, mult + 1); flash = 20; say(`⭐ Множител ×${mult}!`);
        lights.forEach(l => { l.on = false; });
      }
      const nowIn = Math.hypot(ball.x - pool.x, ball.y - pool.y) < pool.r;
      if (nowIn && !inPool) { add(750); hit('pool'); pool.glow = 20; }
      inPool = nowIn;
      if (ball.y > H + 20) {
        if (time < saveUntil) { say('🛟 Спасена топка!'); newBall(); return; }
        if (ballNo >= 3) {
          over = true; topScore = best('nova-pinball-best', score);
          say('КРАЙ НА ИГРАТА'); say('Докосни за нова игра');
        } else { ballNo++; mult = 1; say(`Топка ${ballNo}`); newBall(); }
      }
    };

    // ---- drawing (top-down, the CSS 3D tilt does the perspective) ----
    const shadowLine = (x1, y1, x2, y2, w) => {
      ctx.strokeStyle = 'rgba(0,0,0,.45)'; ctx.lineWidth = w;
      ctx.beginPath(); ctx.moveTo(x1 + 3, y1 + 4); ctx.lineTo(x2 + 3, y2 + 4); ctx.stroke();
    };
    const draw = () => {
      ctx.fillStyle = '#120806'; ctx.fillRect(0, 0, W, H);
      // playfield: basalt with lava cracks
      ctx.save();
      ctx.beginPath(); ctx.moveTo(10, 545); ctx.lineTo(10, 150); ctx.ellipse(160, 150, 150, 70, Math.PI, Math.PI, Math.PI * 2); ctx.lineTo(310, 545); ctx.closePath();
      const fg = ctx.createLinearGradient(0, 80, 0, H);
      fg.addColorStop(0, '#2b1712'); fg.addColorStop(.6, '#1d1311'); fg.addColorStop(1, '#2e0f08');
      ctx.fillStyle = fg; ctx.fill(); ctx.clip();
      ctx.strokeStyle = 'rgba(255,90,20,.18)'; ctx.lineWidth = 2;
      for (const [x, y, a] of [[40, 200, .6], [250, 260, 2.2], [120, 330, 1.2], [200, 420, 2.8], [70, 470, .3]]) {
        ctx.beginPath(); ctx.moveTo(x, y);
        for (let i = 1; i < 6; i++) ctx.lineTo(x + Math.cos(a + i * .7) * i * 14, y + Math.sin(a + i * .5) * i * 12);
        ctx.stroke();
      }
      // lava crater (rollover)
      const pulse = .5 + .5 * Math.sin(time * .08);
      const lg = ctx.createRadialGradient(pool.x, pool.y, 2, pool.x, pool.y, pool.r + 10);
      lg.addColorStop(0, `rgba(255,${200 + 55 * pulse},120,1)`); lg.addColorStop(.45, '#ff6a00'); lg.addColorStop(1, 'rgba(120,20,0,0)');
      ctx.fillStyle = lg; ctx.beginPath(); ctx.arc(pool.x, pool.y, pool.r + 10, 0, Math.PI * 2); ctx.fill();
      if (pool.glow > 0) { ctx.strokeStyle = '#ffe066'; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(pool.x, pool.y, pool.r + 4, 0, Math.PI * 2); ctx.stroke(); pool.glow--; }
      // arrows pointing to the current mission target
      ctx.fillStyle = `rgba(255,170,40,${.35 + .4 * pulse})`;
      for (const [x, y] of [[60, 300], [230, 300]]) { ctx.beginPath(); ctx.moveTo(x, y - 10); ctx.lineTo(x + 7, y + 4); ctx.lineTo(x - 7, y + 4); ctx.fill(); }
      ctx.restore();
      if (flash > 0) { ctx.fillStyle = `rgba(255,140,40,${flash / 50})`; ctx.fillRect(0, 0, W, H); flash--; }
      ctx.lineCap = 'round';
      // walls with fake height (shadow + highlight)
      walls.forEach(w => shadowLine(w.x1, w.y1, w.x2, w.y2, 5));
      walls.forEach(w => {
        const sl = w.kind === 'sling';
        ctx.strokeStyle = sl ? (w.lit > 0 ? '#fff3b0' : '#ff4d2e') : '#b5b9c4'; ctx.lineWidth = sl ? 5 : 4;
        ctx.beginPath(); ctx.moveTo(w.x1, w.y1); ctx.lineTo(w.x2, w.y2); ctx.stroke();
        if (!sl) { ctx.strokeStyle = 'rgba(255,255,255,.35)'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(w.x1 - 1, w.y1 - 1); ctx.lineTo(w.x2 - 1, w.y2 - 1); ctx.stroke(); }
        if (w.lit > 0) w.lit--;
      });
      // lights
      lights.forEach(l => {
        ctx.beginPath(); ctx.arc(l.x, l.y, 7, 0, Math.PI * 2);
        ctx.fillStyle = l.on ? '#ffd23f' : '#4a2a1c'; ctx.fill();
        if (l.on) { ctx.fillStyle = 'rgba(255,210,63,.25)'; ctx.beginPath(); ctx.arc(l.x, l.y, 13, 0, Math.PI * 2); ctx.fill(); }
      });
      // drop targets (raised blocks)
      drops.forEach(d => {
        if (d.up) {
          ctx.fillStyle = '#5a1a0c'; ctx.fillRect(d.x - 9, d.y - 2, 18, 9);
          ctx.fillStyle = '#ff7a1a'; ctx.fillRect(d.x - 9, d.y - 6, 18, 6);
        } else { ctx.fillStyle = '#2a120a'; ctx.fillRect(d.x - 9, d.y - 2, 18, 4); }
      });
      // bumpers as small volcano cones (cylinders seen from above)
      bumpers.forEach(b => {
        ctx.fillStyle = 'rgba(0,0,0,.5)'; ctx.beginPath(); ctx.ellipse(b.x + 4, b.y + 6, b.r, b.r * .9, 0, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#3b1f17'; ctx.beginPath(); ctx.arc(b.x, b.y + 3, b.r, 0, Math.PI * 2); ctx.fill();
        const bg = ctx.createRadialGradient(b.x - b.r * .3, b.y - b.r * .3, 1, b.x, b.y, b.r);
        bg.addColorStop(0, b.lit > 0 ? '#fff6c8' : '#ffb24a'); bg.addColorStop(1, b.lit > 0 ? '#ff8a00' : '#b8380c');
        ctx.fillStyle = bg; ctx.beginPath(); ctx.arc(b.x, b.y, b.r, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#2a0d05'; ctx.beginPath(); ctx.arc(b.x, b.y, b.r * .32, 0, Math.PI * 2); ctx.fill();
        if (b.lit > 0) b.lit--;
      });
      // flippers
      flippers.forEach(f => {
        const t = tip(f);
        shadowLine(f.x, f.y, t.x, t.y, 12);
        ctx.strokeStyle = '#e9edf5'; ctx.lineWidth = 12; ctx.beginPath(); ctx.moveTo(f.x, f.y); ctx.lineTo(t.x, t.y); ctx.stroke();
        ctx.strokeStyle = '#ff5a1f'; ctx.lineWidth = 4; ctx.beginPath(); ctx.moveTo(f.x, f.y); ctx.lineTo(t.x, t.y); ctx.stroke();
      });
      // plunger
      ctx.fillStyle = '#7a7f8c'; ctx.fillRect(291, 538 + charge * 8, 14, 18);
      if (charge > 0) { ctx.fillStyle = '#ffd23f'; ctx.fillRect(288, 556 - charge * 40, 3, charge * 40); }
      // ball with shadow
      ctx.fillStyle = 'rgba(0,0,0,.5)'; ctx.beginPath(); ctx.ellipse(ball.x + 4, ball.y + 5, ball.r, ball.r * .8, 0, 0, Math.PI * 2); ctx.fill();
      const bg = ctx.createRadialGradient(ball.x - 2.5, ball.y - 2.5, 1, ball.x, ball.y, ball.r);
      bg.addColorStop(0, '#fff'); bg.addColorStop(.5, '#c9ced8'); bg.addColorStop(1, '#5d6370');
      ctx.fillStyle = bg; ctx.beginPath(); ctx.arc(ball.x, ball.y, ball.r, 0, Math.PI * 2); ctx.fill();
      if (paused || over) {
        ctx.fillStyle = 'rgba(0,0,0,.55)'; ctx.fillRect(0, 0, W, H);
        ctx.fillStyle = '#ffb24a'; ctx.font = '800 26px system-ui, sans-serif'; ctx.textAlign = 'center';
        ctx.fillText(over ? 'КРАЙ НА ИГРАТА' : 'ПАУЗА', W / 2, H / 2); ctx.textAlign = 'left';
      }
    };
    const panelUpdate = () => {
      ballBox.textContent = ballNo; multBox.textContent = '×' + mult;
      scoreBox.textContent = score.toLocaleString('bg-BG');
      const m = MISSIONS[mission];
      missionBox.textContent = `${m.text} (${progress}/${m.need})`;
      rankBox.textContent = RANKS[rank]; bestBox.textContent = 'Рекорд: ' + Math.max(topScore, score).toLocaleString('bg-BG');
    };
    loop(win, dt => { if (!paused && !over) step(dt); draw(); panelUpdate(); });
    g.hud.textContent = 'Флипери: ← / → (Z / M) · Изстрел: задръж Space · Пауза: P';
    reset();
  });

  /* ================= Dungeon 3D (raycaster shooter) ================= */
  game('dungeon', 'Подземие 3D', '👾', () => {
    const win = createWindow({ title: 'Подземие 3D', icon: '👾', width: 680, height: 560, appId: 'dungeon' });
    const W = 320, H = 200, T = 32;
    const g = shell(win, W, H, { pixel: true });
    const { ctx, held, canvas } = g;
    const img = ctx.createImageData(W, H), buf = new Uint32Array(img.data.buffer);
    const rgb = (r, g2, b, a = 255) => ((a << 24) | (b << 16) | (g2 << 8) | r) >>> 0;
    const tex = fn => { const t = new Uint32Array(T * T); for (let y = 0; y < T; y++) for (let x = 0; x < T; x++) t[y * T + x] = fn(x, y); return t; };
    const noise = n => (Math.random() - .5) * n;
    const WALL = {
      1: tex((x, y) => { // brick
        const row = y >> 3, mort = y % 8 === 0 || (x + (row % 2) * 8) % 16 === 0;
        const v = noise(30); return mort ? rgb(70 + v, 66 + v, 60 + v) : rgb(150 + v, 60 + v / 2, 45 + v / 2);
      }),
      2: tex((x, y) => { // stone
        const edge = x % 16 === 0 || y % 16 === 0; const v = noise(40);
        return edge ? rgb(50, 50, 55) : rgb(120 + v, 120 + v, 128 + v);
      }),
      3: tex((x, y) => { // tech panel
        const edge = x === 0 || y === 0 || x === 31 || y === 31, light = (x > 12 && x < 19 && y > 12 && y < 19);
        return light ? rgb(120, 255, 240) : edge ? rgb(20, 40, 70) : rgb(40 + (y % 4 ? 0 : 20), 80, 140);
      }),
      4: tex((x, y) => { // exit door
        const arrow = Math.abs(x - 16) < (y < 16 ? y - 4 : 4) && y > 6 && y < 28;
        return arrow ? rgb(255, 255, 255) : rgb(30, 170 + noise(20), 80);
      }),
    };
    const sprite = fn => tex((x, y) => fn(x - 15.5, y - 15.5) || 0);
    const SPR = {
      monster: sprite((dx, dy) => {
        const d = Math.hypot(dx, dy * 1.1);
        if (d > 14) return 0;
        if (Math.hypot(dx - 5, dy + 3) < 3.2) return Math.hypot(dx - 5.5, dy + 3) < 1.5 ? rgb(0, 0, 0) : rgb(255, 255, 255);
        if (Math.hypot(dx + 5, dy + 3) < 3.2) return Math.hypot(dx + 4.5, dy + 3) < 1.5 ? rgb(0, 0, 0) : rgb(255, 255, 255);
        if (dy > 4 && dy < 8 && Math.abs(dx) < 7) return (Math.floor(dx + 16) % 3 === 0) ? rgb(255, 255, 255) : rgb(60, 0, 20);
        const s = 1 - d / 22; return rgb(150 * s + 60, 40 * s, 170 * s + 40);
      }),
      dead: sprite((dx, dy) => (dy > 9 && Math.abs(dx) < 14 - (dy - 9) * 1.4 ? rgb(90, 20, 80) : 0)),
      ammo: sprite((dx, dy) => (Math.abs(dx) < 9 && dy > 2 && dy < 15 ? (Math.abs(dy - 8) < 2 ? rgb(60, 50, 20) : rgb(220, 180, 40)) : 0)),
      health: sprite((dx, dy) => {
        if (!(Math.abs(dx) < 10 && dy > 0 && dy < 16)) return 0;
        return (Math.abs(dx) < 2.5 && dy > 3 && dy < 13) || (Math.abs(dy - 8) < 2.5 && Math.abs(dx) < 7) ? rgb(220, 30, 40) : rgb(245, 245, 245);
      }),
    };
    const bg = new Uint32Array(W * H);
    for (let y = 0; y < H; y++) {
      const t = y < H / 2 ? y / (H / 2) : (y - H / 2) / (H / 2);
      const c = y < H / 2 ? rgb(46 - t * 30, 44 - t * 30, 56 - t * 36) : rgb(24 + t * 70, 20 + t * 50, 16 + t * 34);
      bg.fill(c, y * W, (y + 1) * W);
    }
    const LEVELS = [
      ['################', '#P..#.....m....#', '#...#.###.##...#', '#.a.....#...h..#', '#...B.#.m.#....#',
        '##.###.####.##.#', '#......#....#..#', '#.m....#.a..#m.#', '#......B....#..#', '#BBB.####.###..#',
        '#..B......#....#', '#h.B.TTT..#.m..#', '#....T.m..#....#', '#.m..T....T.a..#', '#....T....T...E#', '################'],
      ['################', '#P.....T......a#', '#.TTTT.T.TTTT..#', '#.T..m.T.T..m..#', '#.T.h..T.T.TTT.#',
        '#.T....m.....T.#', '#.TTT.TTTTTT.T.#', '#.....T....T.T.#', '###.#.T.mm.T...#', '#...#.T....T.###',
        '#.m.#.TTT.TT...#', '#...#.....a..m.#', '#.###.###.####.#', '#..m....#.h..#.#', '#a......#..m.#E#', '################'],
    ];
    const CODE = { '#': 1, B: 2, T: 3, E: 4 };
    let map, px, py, dirX, dirY, plX, plY, hp, ammo, ents, lvl = 0, cool, muzzle, hurt, state, msg, kills, bob = 0;
    const load = n => {
      lvl = n; map = []; ents = [];
      LEVELS[n].forEach((row, y) => {
        map.push([...row].map((ch, x) => {
          if (ch === 'P') { px = x + .5; py = y + .5; }
          if (ch === 'm') ents.push({ type: 'monster', x: x + .5, y: y + .5, hp: 3, cd: 0, hurt: 0, awake: false });
          if (ch === 'a') ents.push({ type: 'ammo', x: x + .5, y: y + .5 });
          if (ch === 'h') ents.push({ type: 'health', x: x + .5, y: y + .5 });
          return CODE[ch] || 0;
        }));
      });
      dirX = 1; dirY = 0; plX = 0; plY = 0.66; cool = 0; muzzle = 0; hurt = 0; state = 'play';
    };
    const restart = () => { hp = 100; ammo = 12; kills = 0; load(0); };
    const solid = (x, y) => (map[Math.floor(y)] || [])[Math.floor(x)] !== 0;
    const cellAt = (x, y) => (map[Math.floor(y)] || [])[Math.floor(x)];
    const sees = (e) => {
      const dx = px - e.x, dy = py - e.y, d = Math.hypot(dx, dy);
      for (let t = 0.2; t < d; t += 0.2) if (solid(e.x + dx * t / d, e.y + dy * t / d)) return false;
      return true;
    };
    const tryMove = (nx, ny) => {
      const r = 0.22;
      for (const [cx, cy] of [[nx + Math.sign(nx - px) * r, py], [px, ny + Math.sign(ny - py) * r]]) if (cellAt(cx, cy) === 4) { win4(); return; }
      if (!solid(nx + Math.sign(nx - px) * r, py)) px = nx;
      if (!solid(px, ny + Math.sign(ny - py) * r)) py = ny;
    };
    const win4 = () => {
      if (lvl + 1 < LEVELS.length) { msg = `Ниво ${lvl + 1} завършено! Следва ниво ${lvl + 2}…`; state = 'next'; }
      else { msg = `🏆 Избяга от подземието! Победени чудовища: ${kills}`; state = 'won'; }
    };
    const camera = (x, y) => {
      const sx = x - px, sy = y - py, inv = 1 / (plX * dirY - dirX * plY);
      return { tx: inv * (dirY * sx - dirX * sy), ty: inv * (-plY * sx + plX * sy) };
    };
    const zbuf = new Float32Array(W);
    const shoot = () => {
      if (state !== 'play' || cool > 0) return;
      if (ammo <= 0) { msg = 'Няма патрони! Търси жълти кутии.'; return; }
      ammo--; cool = 16; muzzle = 5;
      let target = null, bestD = 1e9;
      for (const e of ents) {
        if (e.type !== 'monster' || e.hp <= 0) continue;
        const { tx, ty } = camera(e.x, e.y);
        if (ty <= 0.1) continue;
        const sx = (W / 2) * (1 + tx / ty), half = (H / ty) * .35;
        if (Math.abs(sx - W / 2) < half && ty < zbuf[W >> 1] + .3 && ty < bestD) { bestD = ty; target = e; }
      }
      if (target) { target.hp--; target.hurt = 6; target.awake = true; if (target.hp <= 0) { target.type = 'dead'; kills++; } }
    };
    g.root.addEventListener('keydown', e => {
      if (e.key === ' ' || e.key === 'Control' || e.key === 'f') shoot();
      if ((e.key === ' ' || e.key === 'Enter') && state !== 'play') advance();
    });
    const advance = () => { if (state === 'next') { load(lvl + 1); msg = ''; } else if (state === 'dead' || state === 'won') { restart(); msg = ''; } };
    // Drag on the view to turn
    let dragX = null;
    canvas.addEventListener('pointerdown', e => { canvas.setPointerCapture(e.pointerId); dragX = e.clientX; if (state !== 'play') advance(); });
    canvas.addEventListener('pointermove', e => { if (dragX === null) return; turn((e.clientX - dragX) * 0.008); dragX = e.clientX; });
    canvas.addEventListener('pointerup', () => { dragX = null; });
    const turn = a => {
      const c = Math.cos(a), s = Math.sin(a);
      [dirX, dirY] = [dirX * c - dirY * s, dirX * s + dirY * c];
      [plX, plY] = [plX * c - plY * s, plX * s + plY * c];
    };
    g.hold('⟲', 'ArrowLeft'); g.hold('▲', 'ArrowUp'); g.hold('▼', 'ArrowDown'); g.hold('⟳', 'ArrowRight');
    g.tap('🔫', shoot);

    const render = () => {
      buf.set(bg);
      for (let x = 0; x < W; x++) {
        const cam = 2 * x / W - 1, rx = dirX + plX * cam, ry = dirY + plY * cam;
        let mx = Math.floor(px), my = Math.floor(py);
        const ddx = Math.abs(1 / rx), ddy = Math.abs(1 / ry);
        const stepX = rx < 0 ? -1 : 1, stepY = ry < 0 ? -1 : 1;
        let sdx = (rx < 0 ? px - mx : mx + 1 - px) * ddx, sdy = (ry < 0 ? py - my : my + 1 - py) * ddy, side = 0, cell = 0;
        for (let i = 0; i < 64 && !cell; i++) {
          if (sdx < sdy) { sdx += ddx; mx += stepX; side = 0; } else { sdy += ddy; my += stepY; side = 1; }
          cell = (map[my] || [])[mx] ?? 1;
        }
        const dist = side === 0 ? sdx - ddx : sdy - ddy;
        zbuf[x] = dist;
        const lineH = H / dist, start = Math.max(0, Math.floor(H / 2 - lineH / 2)), end = Math.min(H, Math.ceil(H / 2 + lineH / 2));
        let wx = side === 0 ? py + dist * ry : px + dist * rx; wx -= Math.floor(wx);
        let tx = Math.floor(wx * T); if ((side === 0 && rx > 0) || (side === 1 && ry < 0)) tx = T - 1 - tx;
        const t = WALL[cell] || WALL[1], f = Math.max(0.12, 1 - dist / 13) * (side ? 0.72 : 1);
        for (let y = start; y < end; y++) {
          const ty = Math.floor((y - H / 2 + lineH / 2) * T / lineH) & (T - 1);
          const c = t[ty * T + tx];
          buf[y * W + x] = rgb((c & 255) * f, ((c >> 8) & 255) * f, ((c >> 16) & 255) * f);
        }
      }
      // sprites, far to near
      const vis = ents.map(e => ({ e, ...camera(e.x, e.y) })).filter(o => o.ty > 0.15).sort((a, b) => b.ty - a.ty);
      for (const { e, tx, ty } of vis) {
        const t = SPR[e.type], full = H / ty, size = e.type === 'monster' || e.type === 'dead' ? full * .8 : full * .45;
        const sx = (W / 2) * (1 + tx / ty), bottom = H / 2 + full / 2, top = bottom - size, left = sx - size / 2;
        const f = Math.max(0.15, 1 - ty / 13);
        for (let x = Math.max(0, Math.floor(left)); x < Math.min(W, left + size); x++) {
          if (ty >= zbuf[x]) continue;
          const u = Math.floor((x - left) * T / size);
          for (let y = Math.max(0, Math.floor(top)); y < Math.min(H, bottom); y++) {
            const c = t[Math.floor((y - top) * T / size) * T + u];
            if (!(c >>> 24)) continue;
            buf[y * W + x] = e.hurt > 0 ? rgb(255, 255, 255) : rgb((c & 255) * f, ((c >> 8) & 255) * f, ((c >> 16) & 255) * f);
          }
        }
      }
      ctx.putImageData(img, 0, 0);
      // weapon
      const wob = Math.sin(bob) * 3, gx = W / 2, gy = H - 8 + Math.abs(wob);
      if (muzzle > 0) { ctx.fillStyle = '#ffe066'; ctx.beginPath(); ctx.arc(gx, gy - 46, 9 + muzzle, 0, Math.PI * 2); ctx.fill(); }
      ctx.fillStyle = '#3a3f4b'; ctx.fillRect(gx - 7 + wob, gy - 44, 14, 40);
      ctx.fillStyle = '#5c6372'; ctx.fillRect(gx - 4 + wob, gy - 46, 8, 8);
      ctx.fillStyle = '#c8a27a'; ctx.fillRect(gx - 14 + wob, gy - 10, 28, 12);
      ctx.fillStyle = 'rgba(255,255,255,.7)'; ctx.fillRect(W / 2 - 1, H / 2 - 4, 2, 8); ctx.fillRect(W / 2 - 4, H / 2 - 1, 8, 2);
      if (hurt > 0) { ctx.fillStyle = `rgba(255,0,0,${hurt / 30})`; ctx.fillRect(0, 0, W, H); }
      // HUD
      ctx.fillStyle = 'rgba(0,0,0,.55)'; ctx.fillRect(0, 0, W, 14);
      ctx.font = 'bold 10px monospace'; ctx.fillStyle = '#fff';
      const left2 = ents.filter(e => e.type === 'monster').length;
      ctx.fillText(`❤ ${hp}   ▮ ${ammo}   👾 ${left2}   НИВО ${lvl + 1}`, 4, 10);
      if (msg) {
        ctx.fillStyle = 'rgba(0,0,0,.6)'; ctx.fillRect(0, H / 2 - 22, W, 44);
        ctx.fillStyle = '#fff'; ctx.textAlign = 'center'; ctx.font = 'bold 11px system-ui, sans-serif';
        ctx.fillText(msg, W / 2, H / 2 - 2);
        if (state !== 'play') { ctx.font = '10px system-ui'; ctx.fillText('Space / докосни за продължение', W / 2, H / 2 + 14); }
        ctx.textAlign = 'left';
      }
    };

    loop(win, dt => {
      if (state === 'play') {
        const k = held, mv = 0.065 * dt, rt = 0.055 * dt;
        if (k.has('ArrowLeft') || k.has('a')) turn(-rt);
        if (k.has('ArrowRight') || k.has('d')) turn(rt);
        let fx = 0, fy = 0;
        if (k.has('ArrowUp') || k.has('w')) { fx += dirX; fy += dirY; }
        if (k.has('ArrowDown') || k.has('s')) { fx -= dirX; fy -= dirY; }
        if (k.has('q')) { fx += dirY; fy -= dirX; }
        if (k.has('e')) { fx -= dirY; fy += dirX; }
        if (fx || fy) { tryMove(px + fx * mv, py + fy * mv); bob += 0.25 * dt; }
        cool = Math.max(0, cool - dt); muzzle = Math.max(0, muzzle - dt); hurt = Math.max(0, hurt - dt);
        for (const e of ents) {
          if (e.hurt > 0) e.hurt -= dt;
          const d = Math.hypot(px - e.x, py - e.y);
          if (e.type === 'ammo' && d < 0.5) { ammo += 8; e.type = 'gone'; msg = '+8 патрона'; }
          if (e.type === 'health' && d < 0.5) { hp = Math.min(100, hp + 30); e.type = 'gone'; msg = '+30 живот'; }
          if (e.type !== 'monster') continue;
          if (!e.awake && d < 9 && sees(e)) e.awake = true;
          if (!e.awake) continue;
          if (d > 0.9) {
            const sp = 0.028 * dt, nx = e.x + (px - e.x) / d * sp, ny = e.y + (py - e.y) / d * sp;
            if (!solid(nx, e.y)) e.x = nx;
            if (!solid(e.x, ny)) e.y = ny;
          }
          e.cd = Math.max(0, e.cd - dt);
          if (d < 1.1 && e.cd === 0) { hp -= 8 + Math.floor(Math.random() * 7); hurt = 14; e.cd = 55; }
        }
        ents = ents.filter(e => e.type !== 'gone');
        if (hp <= 0) { hp = 0; state = 'dead'; msg = '💀 Чудовищата те хванаха!'; }
        if (msg && state === 'play' && !msg.startsWith('Ниво')) { clearTimeout(render.t); render.t = setTimeout(() => { if (state === 'play') msg = ''; }, 1500); }
      }
      render();
    });
    g.hud.textContent = 'W/↑ напред · S/↓ назад · A/D завъртане · Q/E встрани · Space стрелба · Намери зелената врата';
    restart();
    msg = 'Намери зелената врата със стрелката!';
  });
})();
