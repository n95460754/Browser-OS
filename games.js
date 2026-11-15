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

  /* ================= Pinball ================= */
  game('pinball', 'Пинбол', '🪩', () => {
    const win = createWindow({ title: 'Пинбол', icon: '🪩', width: 380, height: 700, appId: 'pinball' });
    const W = 320, H = 560, SUB = 8, G = 0.2, MAXV = 17;
    const g = shell(win, W, H);
    const { ctx, held, canvas } = g;
    const walls = [];
    const seg = (x1, y1, x2, y2, kick = 0) => walls.push({ x1, y1, x2, y2, kick });
    seg(10, 415, 10, 150);
    for (let i = 0; i < 18; i++) {
      const a1 = Math.PI + Math.PI * i / 18, a2 = Math.PI + Math.PI * (i + 1) / 18;
      seg(160 + 150 * Math.cos(a1), 150 + 70 * Math.sin(a1), 160 + 150 * Math.cos(a2), 150 + 70 * Math.sin(a2));
    }
    seg(310, 150, 310, 545); seg(285, 545, 310, 545); seg(285, 545, 285, 215);
    seg(10, 415, 85, 480); seg(285, 415, 200, 480);
    seg(48, 352, 74, 430, 1); seg(48, 352, 40, 400); seg(237, 352, 211, 430, 1); seg(237, 352, 245, 400);
    const bumpers = [{ x: 100, y: 215, r: 20 }, { x: 200, y: 215, r: 20 }, { x: 150, y: 290, r: 20 }, { x: 70, y: 150, r: 10 }, { x: 230, y: 150, r: 10 }];
    const lights = [{ x: 115, y: 115 }, { x: 160, y: 110 }, { x: 205, y: 115 }];
    const mkFlipper = (x, y, dir) => ({ x, y, dir, len: 50, rest: 0.52, up: -0.48, a: 0.52, prev: null });
    const flippers = [mkFlipper(85, 480, 1), mkFlipper(200, 480, -1)];
    const tip = f => ({ x: f.x + f.dir * f.len * Math.cos(f.a), y: f.y + f.len * Math.sin(f.a) });
    let ball, score, balls, charge, over, flash = 0, topScore = store.get('nova-pinball-best', 0);
    const newBall = () => { ball = { x: 297.5, y: 530, vx: 0, vy: 0, r: 7 }; charge = 0; lights.forEach(l => { l.on = false; }); };
    const reset = () => { score = 0; balls = 3; over = false; newBall(); };
    const inLane = () => ball.x > 286 && ball.y > 480;

    const closest = (b, x1, y1, x2, y2) => {
      const dx = x2 - x1, dy = y2 - y1;
      const t = Math.max(0, Math.min(1, ((b.x - x1) * dx + (b.y - y1) * dy) / (dx * dx + dy * dy)));
      return { t, px: x1 + t * dx, py: y1 + t * dy };
    };
    const bounce = (b, px, py, R, e, ux = 0, uy = 0) => {
      let nx = b.x - px, ny = b.y - py; const d = Math.hypot(nx, ny);
      if (d >= R || d === 0) return false;
      nx /= d; ny /= d; b.x = px + nx * R; b.y = py + ny * R;
      const vn = (b.vx - ux) * nx + (b.vy - uy) * ny;
      if (vn < 0) { b.vx -= (1 + e) * vn * nx; b.vy -= (1 + e) * vn * ny; }
      return { nx, ny };
    };
    const left = () => held.has('ArrowLeft') || held.has('z') || held.has('Shift') || held.has('tl');
    const right = () => held.has('ArrowRight') || held.has('m') || held.has('/') || held.has('tr');
    const launchKey = () => held.has(' ') || held.has('ArrowDown') || held.has('launch');

    // Touch: left/right half of the table = flippers
    canvas.addEventListener('pointerdown', e => {
      canvas.setPointerCapture(e.pointerId);
      const r = canvas.getBoundingClientRect();
      const key = (e.clientX - r.left) / r.width < .5 ? 'tl' : 'tr';
      if (over) { reset(); return; }
      if (inLane() && key === 'tr') held.add('launch'); else held.add(key);
      const up = () => { held.delete(key); held.delete('launch'); canvas.removeEventListener('pointerup', up); canvas.removeEventListener('pointercancel', up); };
      canvas.addEventListener('pointerup', up); canvas.addEventListener('pointercancel', up);
    });
    g.hold('◀ Ляв', 'tl'); g.hold('🚀 Изстрел', 'launch'); g.hold('Десен ▶', 'tr');
    g.root.addEventListener('keydown', e => { if (over && (e.key === ' ' || e.key === 'Enter')) reset(); });

    let wasLaunching = false;
    loop(win, dt => {
      if (!over) {
        // Plunger: hold to charge, release to fire
        if (inLane() && Math.abs(ball.vy) < 1) {
          if (launchKey()) charge = Math.min(1, charge + 0.025 * dt);
          else if (wasLaunching && charge > 0) { ball.vy = -(9 + charge * 9); charge = 0; }
        }
        wasLaunching = launchKey();
        for (let s = 0; s < SUB; s++) {
          const st = dt / SUB;
          flippers.forEach((f, i) => {
            f.prev = tip(f);
            const target = (i === 0 ? left() : right()) ? f.up : f.rest;
            const speed = 0.38 * st;
            f.a += Math.max(-speed, Math.min(speed, target - f.a));
          });
          ball.vy += G * st;
          ball.x += ball.vx * st; ball.y += ball.vy * st;
          for (const w of walls) {
            const c = closest(ball, w.x1, w.y1, w.x2, w.y2);
            const n = bounce(ball, c.px, c.py, ball.r + 2, w.kick ? 0.2 : 0.45);
            if (n && w.kick) { ball.vx += n.nx * 5; ball.vy += n.ny * 5; score += 10; flash = 4; }
          }
          for (const b of bumpers) {
            const n = bounce(ball, b.x, b.y, b.r + ball.r, 0.6);
            if (n) { ball.vx += n.nx * 4.5; ball.vy += n.ny * 4.5; score += b.r > 15 ? 100 : 50; b.lit = 8; }
          }
          flippers.forEach(f => {
            const t = tip(f), c = closest(ball, f.x, f.y, t.x, t.y);
            const ux = (t.x - f.prev.x) / st * c.t, uy = (t.y - f.prev.y) / st * c.t;
            bounce(ball, c.px, c.py, ball.r + 6, 0.3, ux, uy);
          });
          const sp = Math.hypot(ball.vx, ball.vy);
          if (sp > MAXV) { ball.vx *= MAXV / sp; ball.vy *= MAXV / sp; }
        }
        lights.forEach(l => { if (!l.on && Math.hypot(ball.x - l.x, ball.y - l.y) < 12) { l.on = true; score += 250; } });
        if (lights.every(l => l.on)) { score += 2000; flash = 20; lights.forEach(l => { l.on = false; }); }
        if (ball.y > H + 20) {
          balls--;
          if (balls <= 0) { over = true; topScore = best('nova-pinball-best', score); } else newBall();
        }
      }
      // ---- draw ----
      ctx.fillStyle = '#0c0820'; ctx.fillRect(0, 0, W, H);
      const grad = ctx.createLinearGradient(0, 80, 0, H);
      grad.addColorStop(0, '#2a1250'); grad.addColorStop(1, '#0f2a4a');
      ctx.fillStyle = grad;
      ctx.beginPath(); ctx.moveTo(10, 480); ctx.lineTo(10, 150); ctx.ellipse(160, 150, 150, 70, Math.PI, Math.PI, Math.PI * 2); ctx.lineTo(310, 545); ctx.lineTo(10, 545); ctx.fill();
      if (flash > 0) { ctx.fillStyle = `rgba(255,255,255,${flash / 60})`; ctx.fillRect(0, 0, W, H); flash -= dt; }
      ctx.lineCap = 'round';
      walls.forEach(w => {
        ctx.strokeStyle = w.kick ? '#ff5fa2' : '#7fd3ff'; ctx.lineWidth = w.kick ? 5 : 4;
        ctx.beginPath(); ctx.moveTo(w.x1, w.y1); ctx.lineTo(w.x2, w.y2); ctx.stroke();
      });
      lights.forEach(l => { ctx.beginPath(); ctx.arc(l.x, l.y, 6, 0, Math.PI * 2); ctx.fillStyle = l.on ? '#ffe066' : '#3b2f5c'; ctx.fill(); });
      bumpers.forEach(b => {
        ctx.beginPath(); ctx.arc(b.x, b.y, b.r, 0, Math.PI * 2);
        ctx.fillStyle = b.lit > 0 ? '#fff3b0' : '#ff9f1c'; ctx.fill();
        ctx.lineWidth = 3; ctx.strokeStyle = '#ffe8a3'; ctx.stroke();
        if (b.lit > 0) b.lit -= dt;
      });
      flippers.forEach(f => {
        const t = tip(f);
        ctx.strokeStyle = '#f1f3ff'; ctx.lineWidth = 12;
        ctx.beginPath(); ctx.moveTo(f.x, f.y); ctx.lineTo(t.x, t.y); ctx.stroke();
      });
      // plunger
      ctx.fillStyle = '#555'; ctx.fillRect(289, 540 - 0, 18, 4);
      ctx.fillStyle = '#ff6b6b'; ctx.fillRect(292, 545 - charge * 0, 12, 12 + charge * 0);
      if (charge > 0) { ctx.fillStyle = '#ffd43b'; ctx.fillRect(288, 548, 20 * charge, 6); }
      const bg = ctx.createRadialGradient(ball.x - 2, ball.y - 2, 1, ball.x, ball.y, ball.r);
      bg.addColorStop(0, '#fff'); bg.addColorStop(1, '#8d99ae');
      ctx.beginPath(); ctx.arc(ball.x, ball.y, ball.r, 0, Math.PI * 2); ctx.fillStyle = bg; ctx.fill();
      ctx.fillStyle = '#fff'; ctx.font = '800 22px system-ui, sans-serif'; ctx.textAlign = 'center';
      ctx.fillText(String(score).padStart(6, '0'), W / 2, 34);
      ctx.font = '12px system-ui, sans-serif'; ctx.fillStyle = '#b8b2d8';
      ctx.fillText(`Топки: ${'●'.repeat(Math.max(0, balls))}   Рекорд: ${topScore}`, W / 2, 54);
      if (inLane() && !over && Math.abs(ball.vy) < 1) ctx.fillText('Задръж 🚀 / Space и пусни', W / 2, 380);
      if (over) {
        ctx.fillStyle = 'rgba(0,0,0,.65)'; ctx.fillRect(0, 0, W, H); ctx.fillStyle = '#fff';
        ctx.font = '800 30px system-ui'; ctx.fillText('КРАЙ НА ИГРАТА', W / 2, H / 2);
        ctx.font = '14px system-ui'; ctx.fillText('Докосни за нова игра', W / 2, H / 2 + 28);
      }
      ctx.textAlign = 'left';
    });
    g.hud.textContent = 'Флипери: ← / → (или Z / M) · Изстрел: Space';
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
