/* NovaOS — a tiny operating system that runs in the browser.
   Everything lives in this file: storage, virtual file system,
   window manager, taskbar, start menu and the built-in apps. */
(() => {
  'use strict';

  const $ = (sel, root = document) => root.querySelector(sel);
  const h = (tag, props = {}, ...kids) => {
    const el = document.createElement(tag);
    for (const [k, v] of Object.entries(props)) {
      if (k === 'class') el.className = v;
      else if (k === 'style') el.style.cssText = v;
      else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
      else if (k === 'html') el.innerHTML = v;
      else el.setAttribute(k, v);
    }
    for (const kid of kids.flat()) if (kid != null) el.append(kid);
    return el;
  };
  const isMobile = () => window.innerWidth < 700;

  /* ================= Storage ================= */
  const store = {
    get(key, fallback) {
      try { const v = localStorage.getItem(key); return v ? JSON.parse(v) : fallback; }
      catch { return fallback; }
    },
    set(key, value) {
      try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* storage unavailable */ }
    },
  };

  /* ================= Virtual file system ================= */
  const defaultFS = () => ({
    type: 'dir', children: {
      home: { type: 'dir', children: {
        user: { type: 'dir', children: {
          Documents: { type: 'dir', children: {
            'readme.txt': { type: 'file', content:
              'Добре дошъл в NovaOS!\n\n' +
              '• Двоен клик върху икона отваря приложение.\n' +
              '• Влачи прозорците за заглавната лента.\n' +
              '• Отвори Терминал и напиши "help".\n' +
              '• Всичко се пази в браузъра ти (localStorage).\n' },
            'todo.txt': { type: 'file', content: '[ ] Да бия рекорда в Змия\n[ ] Да реша задачите по математика\n[ ] Да направя собствено приложение\n' },
          }},
          Pictures: { type: 'dir', children: {} },
          Desktop: { type: 'dir', children: {} },
        }},
      }},
      bin: { type: 'dir', children: {} },
    },
  });

  let fsRoot = store.get('nova-fs', null) || defaultFS();
  const saveFS = () => store.set('nova-fs', fsRoot);
  const HOME = '/home/user';

  const fs = {
    resolve(cwd, p = '') {
      if (p === '~' || p.startsWith('~/')) p = HOME + p.slice(1);
      const parts = (p.startsWith('/') ? p : cwd + '/' + p).split('/');
      const out = [];
      for (const part of parts) {
        if (!part || part === '.') continue;
        if (part === '..') out.pop(); else out.push(part);
      }
      return '/' + out.join('/');
    },
    get(path) {
      let node = fsRoot;
      for (const part of path.split('/').filter(Boolean)) {
        if (node.type !== 'dir' || !node.children[part]) return null;
        node = node.children[part];
      }
      return node;
    },
    split(path) {
      const i = path.lastIndexOf('/');
      return [path.slice(0, i) || '/', path.slice(i + 1)];
    },
    write(path, content) {
      const [dir, name] = fs.split(path);
      const parent = fs.get(dir);
      if (!parent || parent.type !== 'dir') throw new Error('няма такава папка: ' + dir);
      const existing = parent.children[name];
      if (existing && existing.type === 'dir') throw new Error(name + ' е папка');
      parent.children[name] = { type: 'file', content };
      saveFS();
    },
    mkdir(path) {
      const [dir, name] = fs.split(path);
      const parent = fs.get(dir);
      if (!parent || parent.type !== 'dir') throw new Error('няма такава папка: ' + dir);
      if (parent.children[name]) throw new Error(name + ' вече съществува');
      parent.children[name] = { type: 'dir', children: {} };
      saveFS();
    },
    remove(path) {
      if (path === '/') throw new Error('няма да изтрия корена 😅');
      const [dir, name] = fs.split(path);
      const parent = fs.get(dir);
      if (!parent || !parent.children[name]) throw new Error('няма такъв файл: ' + path);
      delete parent.children[name];
      saveFS();
    },
    rename(path, newName) {
      const [dir, name] = fs.split(path);
      const parent = fs.get(dir);
      if (!newName || newName.includes('/')) throw new Error('невалидно име');
      if (parent.children[newName]) throw new Error(newName + ' вече съществува');
      parent.children[newName] = parent.children[name];
      delete parent.children[name];
      saveFS();
    },
  };

  /* ================= Settings ================= */
  const WALLPAPERS = [
    'linear-gradient(135deg, #1a1033 0%, #2d1b69 40%, #0f3460 100%)',
    'linear-gradient(135deg, #0f2027, #203a43, #2c5364)',
    'linear-gradient(135deg, #ff512f, #dd2476)',
    'linear-gradient(135deg, #11998e, #38ef7d)',
    'linear-gradient(135deg, #232526, #414345)',
    'radial-gradient(circle at 30% 30%, #ffb347, #ff5e62 45%, #2b1055)',
  ];
  const ACCENTS = ['#6c5ce7', '#0984e3', '#00b894', '#e17055', '#e84393', '#fdcb6e'];
  const settings = Object.assign({ wallpaper: 0, accent: 0, theme: 'dark', user: 'user' }, store.get('nova-settings', {}));
  const applySettings = () => {
    const root = document.documentElement;
    root.style.setProperty('--wallpaper', WALLPAPERS[settings.wallpaper] || WALLPAPERS[0]);
    root.style.setProperty('--accent', ACCENTS[settings.accent] || ACCENTS[0]);
    root.dataset.osTheme = settings.theme;
    $('#start-user').textContent = settings.user;
    store.set('nova-settings', settings);
  };

  /* ================= Window manager ================= */
  const windows = new Map();
  let zTop = 10, winSeq = 0, cascade = 0;

  function createWindow({ title, icon = '🪟', width = 560, height = 400, appId }) {
    const id = ++winSeq;
    const area = $('#desktop').getBoundingClientRect();
    width = Math.min(width, area.width - 20);
    height = Math.min(height, area.height - 20);
    const x = Math.max(10, Math.min(60 + cascade * 28, area.width - width - 10));
    const y = Math.max(10, Math.min(30 + cascade * 28, area.height - height - 10));
    cascade = (cascade + 1) % 8;

    const titleEl = h('div', { class: 'win-title' }, `${icon} ${title}`);
    const body = h('div', { class: 'win-body' });
    const btnMin = h('button', { title: 'Минимизирай' }, '—');
    const btnMax = h('button', { title: 'Увеличи' }, '▢');
    const btnClose = h('button', { class: 'close', title: 'Затвори' }, '✕');
    const head = h('div', { class: 'win-head' }, titleEl, h('div', { class: 'win-btns' }, btnMin, btnMax, btnClose));
    const grip = h('div', { class: 'win-resize' });
    const el = h('div', { class: 'window', style: `left:${x}px;top:${y}px;width:${width}px;height:${height}px` }, head, body, grip);

    const taskBtn = h('button', { class: 'task-btn', title }, icon, h('span', {}, title));
    const win = {
      id, el, body, appId, title, minimized: false, onClose: [],
      setTitle(t) { win.title = t; titleEl.textContent = `${icon} ${t}`; taskBtn.lastChild.textContent = t; taskBtn.title = t; },
      focus() {
        win.minimized = false; el.classList.remove('hidden');
        el.style.zIndex = ++zTop;
        windows.forEach(w => { w.el.classList.toggle('focused', w === win); w.taskBtn.classList.toggle('active', w === win); });
      },
      minimize() {
        win.minimized = true; el.classList.add('hidden');
        el.classList.remove('focused'); taskBtn.classList.remove('active');
      },
      toggleMax() { el.classList.toggle('maximized'); },
      close() {
        win.onClose.forEach(fn => fn());
        el.remove(); taskBtn.remove(); windows.delete(id);
      },
      taskBtn,
    };

    btnMin.onclick = e => { e.stopPropagation(); win.minimize(); };
    btnMax.onclick = e => { e.stopPropagation(); win.toggleMax(); };
    btnClose.onclick = e => { e.stopPropagation(); win.close(); };
    head.ondblclick = () => win.toggleMax();
    el.addEventListener('pointerdown', () => win.focus());
    taskBtn.onclick = () => {
      if (win.minimized) win.focus();
      else if (el.classList.contains('focused')) win.minimize();
      else win.focus();
    };

    // Dragging (works for mouse and touch through pointer events)
    head.addEventListener('pointerdown', e => {
      if (e.target.closest('.win-btns') || el.classList.contains('maximized')) return;
      const sx = e.clientX - el.offsetLeft, sy = e.clientY - el.offsetTop;
      head.setPointerCapture(e.pointerId);
      const move = ev => {
        const a = $('#desktop').getBoundingClientRect();
        el.style.left = Math.min(Math.max(ev.clientX - sx, -el.offsetWidth + 80), a.width - 80) + 'px';
        el.style.top = Math.min(Math.max(ev.clientY - sy, 0), a.height - 36) + 'px';
      };
      const up = () => { head.removeEventListener('pointermove', move); head.removeEventListener('pointerup', up); };
      head.addEventListener('pointermove', move);
      head.addEventListener('pointerup', up);
    });

    // Resizing
    grip.addEventListener('pointerdown', e => {
      e.stopPropagation();
      const sx = e.clientX, sy = e.clientY, sw = el.offsetWidth, sh = el.offsetHeight;
      grip.setPointerCapture(e.pointerId);
      const move = ev => {
        el.style.width = Math.max(260, sw + ev.clientX - sx) + 'px';
        el.style.height = Math.max(160, sh + ev.clientY - sy) + 'px';
      };
      const up = () => { grip.removeEventListener('pointermove', move); grip.removeEventListener('pointerup', up); };
      grip.addEventListener('pointermove', move);
      grip.addEventListener('pointerup', up);
    });

    $('#windows').append(el);
    $('#task-list').append(taskBtn);
    windows.set(id, win);
    if (isMobile()) el.classList.add('maximized');
    win.focus();
    return win;
  }

  /* ================= Dialog helpers ================= */
  // In-page dialogs (browser prompt/alert/confirm are blocked in some embeds)
  function dialog(msg, { input = false, def = '', ok = 'OK', cancel = true } = {}) {
    return new Promise(resolve => {
      const field = input ? h('input', { type: 'text', value: def }) : null;
      const close = v => { veil.remove(); resolve(v); };
      const okBtn = h('button', { class: 'btn primary', onclick: () => close(input ? field.value.trim() || null : true) }, ok);
      const veil = h('div', { class: 'veil' }, h('div', { class: 'dlg' },
        h('div', { class: 'dlg-msg' }, msg), field,
        h('div', { class: 'dlg-btns' }, cancel ? h('button', { class: 'btn', onclick: () => close(input ? null : false) }, 'Отказ') : null, okBtn)));
      veil.addEventListener('keydown', e => { if (e.key === 'Enter') okBtn.click(); if (e.key === 'Escape') close(input ? null : false); });
      document.body.append(veil);
      setTimeout(() => (field || okBtn).focus(), 30);
    });
  }
  const ask = (msg, def = '') => dialog(msg, { input: true, def });
  const confirmBox = msg => dialog(msg, { ok: 'Да' });
  const alert = msg => dialog(msg, { cancel: false });
  function contextMenu(x, y, items) {
    document.querySelectorAll('.ctx').forEach(m => m.remove());
    const menu = h('div', { class: 'ctx' }, items.map(([label, fn]) =>
      h('button', { onclick: () => { menu.remove(); fn(); } }, label)));
    document.body.append(menu);
    const r = menu.getBoundingClientRect();
    menu.style.left = Math.min(x, innerWidth - r.width - 4) + 'px';
    menu.style.top = Math.min(y, innerHeight - r.height - 4) + 'px';
    setTimeout(() => document.addEventListener('pointerdown', function off(e) {
      if (!menu.contains(e.target)) { menu.remove(); document.removeEventListener('pointerdown', off); }
    }), 0);
  }

  /* ================= Apps ================= */
  const apps = {};
  const register = (id, name, icon, open) => { apps[id] = { id, name, icon, open }; };
  const openFile = path => {
    const node = fs.get(path);
    if (!node) return;
    if (node.type === 'dir') return apps.explorer.open(path);
    if (/\.png$/i.test(path)) return apps.viewer.open(path);
    return apps.notepad.open(path);
  };

  /* ---------- Notepad ---------- */
  register('notepad', 'Бележник', '📝', (path = null) => {
    const win = createWindow({ title: 'Бележник', icon: '📝', width: 560, height: 420, appId: 'notepad' });
    const ta = h('textarea', { spellcheck: 'false' });
    const status = h('div', { class: 'status' });
    let current = path, dirty = false;
    const refresh = () => {
      const name = current ? fs.split(current)[1] : 'Без име';
      win.setTitle((dirty ? '● ' : '') + name + ' — Бележник');
      const lines = ta.value.split('\n').length;
      status.textContent = `${current || 'не е запазен'}  ·  ${lines} реда  ·  ${ta.value.length} символа`;
    };
    const save = async (asNew = false) => {
      if (!current || asNew) {
        const name = await ask('Запиши като (път):', current || HOME + '/Documents/note.txt');
        if (!name) return;
        current = fs.resolve(HOME, name);
      }
      try { fs.write(current, ta.value); dirty = false; refresh(); refreshExplorers(); }
      catch (e) { alert(e.message); }
    };
    if (current) { const n = fs.get(current); ta.value = n && n.type === 'file' ? n.content : ''; }
    ta.addEventListener('input', () => { dirty = true; refresh(); });
    ta.addEventListener('keydown', e => {
      if ((e.ctrlKey || e.metaKey) && e.key === 's') { e.preventDefault(); save(); }
      if (e.key === 'Tab') { e.preventDefault(); ta.setRangeText('  ', ta.selectionStart, ta.selectionEnd, 'end'); }
    });
    win.body.append(h('div', { class: 'fill notepad' },
      h('div', { class: 'toolbar' },
        h('button', { onclick: () => { current = null; ta.value = ''; dirty = false; refresh(); } }, '📄 Нов'),
        h('button', { onclick: () => save() }, '💾 Запиши'),
        h('button', { onclick: () => save(true) }, 'Запиши като…'),
        h('button', { onclick: () => apps.explorer.open(HOME + '/Documents') }, '📂 Отвори')),
      ta, status));
    refresh();
    setTimeout(() => ta.focus(), 50);
  });

  /* ---------- File explorer ---------- */
  const explorerRefreshers = new Set();
  const refreshExplorers = () => explorerRefreshers.forEach(fn => fn());

  register('explorer', 'Файлове', '📁', (start = HOME) => {
    const win = createWindow({ title: 'Файлове', icon: '📁', width: 600, height: 420, appId: 'explorer' });
    let cwd = start;
    const pathInput = h('input', { type: 'text' });
    const grid = h('div', { class: 'grid' });
    const go = p => { const n = fs.get(p); if (n && n.type === 'dir') { cwd = p; render(); } };
    const render = () => {
      pathInput.value = cwd;
      win.setTitle(cwd);
      grid.innerHTML = '';
      const node = fs.get(cwd);
      if (!node) { cwd = HOME; return render(); }
      const entries = Object.entries(node.children).sort(([a, x], [b, y]) =>
        (x.type === y.type ? a.localeCompare(b) : x.type === 'dir' ? -1 : 1));
      if (!entries.length) grid.append(h('div', { style: 'color:var(--muted);padding:12px' }, 'Празна папка'));
      for (const [name, n] of entries) {
        const full = fs.resolve(cwd, name);
        const icon = n.type === 'dir' ? '📁' : /\.png$/i.test(name) ? '🖼️' : '📄';
        const item = h('div', { class: 'fitem', title: name }, h('span', { class: 'ico' }, icon), name);
        item.ondblclick = () => openFile(full);
        let lastTap = 0;
        item.addEventListener('pointerup', e => {
          if (e.pointerType !== 'touch') return;
          const now = Date.now(); if (now - lastTap < 350) openFile(full); lastTap = now;
        });
        item.oncontextmenu = e => {
          e.preventDefault(); e.stopPropagation();
          contextMenu(e.clientX, e.clientY, [
            ['Отвори', () => openFile(full)],
            ['Преименувай', async () => { const nn = await ask('Ново име:', name); if (nn) try { fs.rename(full, nn); refreshExplorers(); } catch (er) { alert(er.message); } }],
            ['Изтрий', async () => { if (await confirmBox('Да изтрия ли ' + name + '?')) { fs.remove(full); refreshExplorers(); } }],
          ]);
        };
        grid.append(item);
      }
    };
    grid.oncontextmenu = e => {
      e.preventDefault();
      contextMenu(e.clientX, e.clientY, [
        ['📄 Нов файл', newFile], ['📁 Нова папка', newDir],
      ]);
    };
    const newFile = async () => { const n = await ask('Име на файла:', 'нов.txt'); if (n) try { fs.write(fs.resolve(cwd, n), ''); refreshExplorers(); } catch (e) { alert(e.message); } };
    const newDir = async () => { const n = await ask('Име на папката:', 'Нова папка'); if (n) try { fs.mkdir(fs.resolve(cwd, n)); refreshExplorers(); } catch (e) { alert(e.message); } };
    pathInput.addEventListener('keydown', e => { if (e.key === 'Enter') go(fs.resolve(cwd, pathInput.value)); });
    win.body.append(h('div', { class: 'fill explorer' },
      h('div', { class: 'toolbar' },
        h('button', { onclick: () => go(fs.resolve(cwd, '..')) }, '⬆'),
        h('button', { onclick: () => go(HOME) }, '🏠'),
        pathInput,
        h('button', { onclick: newFile }, '+📄'),
        h('button', { onclick: newDir }, '+📁')),
      grid));
    explorerRefreshers.add(render);
    win.onClose.push(() => explorerRefreshers.delete(render));
    render();
  });

  /* ---------- Terminal ---------- */
  register('terminal', 'Терминал', '💻', () => {
    const win = createWindow({ title: 'Терминал', icon: '💻', width: 620, height: 380, appId: 'terminal' });
    let cwd = HOME;
    const history = []; let hIdx = 0;
    const out = h('div');
    const promptEl = h('span', { class: 'prompt' });
    const input = h('input', { autocomplete: 'off', autocapitalize: 'off', spellcheck: 'false' });
    const term = h('div', { class: 'term' }, out, h('div', { class: 'inrow' }, promptEl, input));
    term.onclick = () => { if (!getSelection().toString()) input.focus(); };
    const short = p => p.startsWith(HOME) ? '~' + p.slice(HOME.length) : p;
    const setPrompt = () => { promptEl.textContent = `${settings.user}@nova:${short(cwd)}$`; };
    const print = (text, cls = '') => out.append(h('div', { class: 'line ' + cls }, text));

    const cmds = {
      help: () => print(
        'Команди:\n' +
        '  ls [път]        покажи файловете\n' +
        '  cd <път>        смени папка\n' +
        '  pwd             текуща папка\n' +
        '  cat <файл>      покажи файл\n' +
        '  echo <текст> [> файл]   отпечатай/запиши\n' +
        '  touch <файл>    създай празен файл\n' +
        '  mkdir <папка>   нова папка\n' +
        '  rm <път>        изтрий\n' +
        '  open <файл|app> отвори в приложение\n' +
        '  calc <израз>    сметни, напр. calc 2^10\n' +
        '  date, whoami, neofetch, apps, clear'),
      ls: (a) => {
        const p = fs.resolve(cwd, a[0] || '.'); const n = fs.get(p);
        if (!n) return print('ls: няма такъв път', 'err');
        if (n.type === 'file') return print(a[0]);
        const names = Object.entries(n.children).map(([k, v]) => v.type === 'dir' ? k + '/' : k);
        print(names.join('  ') || '(празно)');
      },
      cd: (a) => {
        const p = fs.resolve(cwd, a[0] || '~'); const n = fs.get(p);
        if (!n || n.type !== 'dir') return print('cd: няма такава папка', 'err');
        cwd = p;
      },
      pwd: () => print(cwd),
      cat: (a) => {
        if (!a[0]) return print('cat: кой файл?', 'err');
        const n = fs.get(fs.resolve(cwd, a[0]));
        if (!n || n.type !== 'file') return print('cat: няма такъв файл', 'err');
        print(n.content);
      },
      echo: (a, raw) => {
        const m = raw.match(/^echo\s+(.*?)\s*(>>?)\s*(\S+)\s*$/);
        if (!m) return print(raw.replace(/^echo\s?/, ''));
        const path = fs.resolve(cwd, m[3]);
        const old = fs.get(path);
        const text = m[1].replace(/^["']|["']$/g, '');
        fs.write(path, (m[2] === '>>' && old && old.type === 'file' ? old.content : '') + text + '\n');
        refreshExplorers();
      },
      touch: (a) => { const p = fs.resolve(cwd, a[0] || ''); if (!fs.get(p)) fs.write(p, ''); refreshExplorers(); },
      mkdir: (a) => { fs.mkdir(fs.resolve(cwd, a[0] || '')); refreshExplorers(); },
      rm: (a) => { fs.remove(fs.resolve(cwd, a[0] || '')); refreshExplorers(); },
      open: (a) => {
        if (!a[0]) return print('open: какво да отворя?', 'err');
        if (apps[a[0]]) return apps[a[0]].open();
        const p = fs.resolve(cwd, a[0]);
        if (!fs.get(p)) return print('open: няма такъв файл или приложение', 'err');
        openFile(p);
      },
      apps: () => print(Object.values(apps).map(x => `${x.icon} ${x.id.padEnd(10)} ${x.name}`).join('\n')),
      calc: (a) => print(String(evaluate(a.join(' ')))),
      date: () => print(new Date().toLocaleString('bg-BG')),
      whoami: () => print(settings.user),
      clear: () => { out.innerHTML = ''; },
      neofetch: () => print(
        '   ◆◆◆      ' + settings.user + '@nova\n' +
        '  ◆◆◆◆◆     ---------\n' +
        ' ◆◆◆◆◆◆◆    OS: NovaOS 1.0 (браузър)\n' +
        '  ◆◆◆◆◆     Kernel: JavaScript\n' +
        '   ◆◆◆      Shell: novash\n' +
        '            Прозорци: ' + windows.size + '\n' +
        '            Екран: ' + innerWidth + 'x' + innerHeight + '\n' +
        '            Браузър: ' + (navigator.userAgent.match(/(Firefox|Edg|Chrome|Safari)\/[\d.]+/) || ['?'])[0]),
    };

    const run = raw => {
      print(`${promptEl.textContent} ${raw}`, 'prompt');
      const trimmed = raw.trim();
      if (!trimmed) return;
      history.push(trimmed); hIdx = history.length;
      const [cmd, ...args] = trimmed.split(/\s+/);
      if (!cmds[cmd]) return print(`${cmd}: непозната команда. Напиши "help".`, 'err');
      try { cmds[cmd](args, trimmed); } catch (e) { print(`${cmd}: ${e.message}`, 'err'); }
    };
    input.addEventListener('keydown', e => {
      if (e.key === 'Enter') { run(input.value); input.value = ''; setPrompt(); term.scrollTop = term.scrollHeight; }
      else if (e.key === 'ArrowUp') { if (hIdx > 0) input.value = history[--hIdx]; e.preventDefault(); }
      else if (e.key === 'ArrowDown') { hIdx = Math.min(history.length, hIdx + 1); input.value = history[hIdx] || ''; e.preventDefault(); }
      else if (e.key === 'Tab') {
        e.preventDefault();
        const parts = input.value.split(' '); const last = parts.pop();
        const [dir, partial] = last.includes('/') ? [last.slice(0, last.lastIndexOf('/') + 1), last.slice(last.lastIndexOf('/') + 1)] : ['', last];
        const n = fs.get(fs.resolve(cwd, dir || '.'));
        const pool = parts.length ? (n && n.type === 'dir' ? Object.keys(n.children) : []) : Object.keys(cmds);
        const hits = pool.filter(k => k.startsWith(partial));
        if (hits.length === 1) input.value = [...parts, dir + hits[0]].join(' ');
        else if (hits.length > 1) print(hits.join('  '));
      }
    });
    print('NovaOS терминал. Напиши "help" за команди.');
    setPrompt();
    win.body.append(term);
    setTimeout(() => input.focus(), 50);
  });

  /* ---------- Calculator (safe parser, no eval) ---------- */
  function evaluate(src) {
    const s = src.replace(/×/g, '*').replace(/÷/g, '/').replace(/\s+/g, '');
    let i = 0;
    const peek = () => s[i];
    const expr = () => { let v = term(); while (peek() === '+' || peek() === '-') { const o = s[i++]; const r = term(); v = o === '+' ? v + r : v - r; } return v; };
    const term = () => {
      let v = power();
      while (peek() === '*' || peek() === '/' || peek() === '%') {
        const o = s[i++]; const r = power();
        if (o === '/' && r === 0) throw new Error('деление на 0');
        v = o === '*' ? v * r : o === '/' ? v / r : v % r;
      }
      return v;
    };
    const power = () => { const b = unary(); if (peek() === '^') { i++; return Math.pow(b, power()); } return b; };
    const unary = () => { if (peek() === '-') { i++; return -unary(); } if (peek() === '+') { i++; return unary(); } return atom(); };
    const atom = () => {
      if (peek() === '(') { i++; const v = expr(); if (s[i++] !== ')') throw new Error('липсва )'); return v; }
      if (s.startsWith('√', i)) { i++; return Math.sqrt(unary()); }
      if (s.startsWith('pi', i)) { i += 2; return Math.PI; }
      const m = s.slice(i).match(/^\d*\.?\d+(e[+-]?\d+)?/i);
      if (!m) throw new Error('грешен израз');
      i += m[0].length; return parseFloat(m[0]);
    };
    const v = expr();
    if (i < s.length) throw new Error('грешен израз');
    return Math.round(v * 1e12) / 1e12;
  }

  register('calc', 'Калкулатор', '🧮', () => {
    const win = createWindow({ title: 'Калкулатор', icon: '🧮', width: 300, height: 430, appId: 'calc' });
    let expr = '';
    const exprEl = h('div', { class: 'expr' }), resEl = h('div', { class: 'res' }, '0');
    const show = () => {
      exprEl.textContent = expr;
      try { resEl.textContent = expr ? evaluate(expr) : '0'; resEl.style.opacity = 1; }
      catch { resEl.style.opacity = .4; }
    };
    const press = k => {
      if (k === 'C') expr = '';
      else if (k === '⌫') expr = expr.slice(0, -1);
      else if (k === '=') { try { expr = String(evaluate(expr)); } catch (e) { exprEl.textContent = e.message; return; } }
      else expr += k;
      show();
    };
    const keys = ['C', '(', ')', '÷', '7', '8', '9', '×', '4', '5', '6', '-', '1', '2', '3', '+', '√', '0', '.', '^', '⌫', '%', 'pi', '='];
    const pad = h('div', { class: 'keys' }, keys.map(k =>
      h('button', { class: k === '=' ? 'eq' : '÷×-+^%√'.includes(k) ? 'op' : '', onclick: () => press(k) }, k)));
    const root = h('div', { class: 'calc', tabindex: '0' }, h('div', { class: 'display' }, exprEl, resEl), pad);
    root.addEventListener('keydown', e => {
      if (/^[\d.+\-*/()%^]$/.test(e.key)) press(e.key === '*' ? '×' : e.key === '/' ? '÷' : e.key);
      else if (e.key === 'Enter' || e.key === '=') press('=');
      else if (e.key === 'Backspace') press('⌫');
      else if (e.key === 'Escape') press('C');
    });
    win.body.append(root);
    setTimeout(() => root.focus(), 50);
  });

  /* ---------- Paint ---------- */
  register('paint', 'Рисуване', '🎨', () => {
    const win = createWindow({ title: 'Рисуване', icon: '🎨', width: 640, height: 460, appId: 'paint' });
    const canvas = h('canvas');
    const ctx = canvas.getContext('2d');
    const color = h('input', { type: 'color', value: '#6c5ce7' });
    const size = h('input', { type: 'range', min: '1', max: '40', value: '6' });
    let tool = 'pen';
    const toolBtns = {};
    const setTool = t => { tool = t; Object.entries(toolBtns).forEach(([k, b]) => b.style.borderColor = k === t ? 'var(--accent)' : ''); };
    const fitCanvas = () => {
      const r = canvas.getBoundingClientRect();
      if (!r.width || !r.height) return;
      const copy = document.createElement('canvas'); copy.width = canvas.width; copy.height = canvas.height;
      copy.getContext('2d').drawImage(canvas, 0, 0);
      canvas.width = r.width; canvas.height = r.height;
      ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(copy, 0, 0);
    };
    new ResizeObserver(fitCanvas).observe(canvas);
    let drawing = false, last = null;
    const pos = e => { const r = canvas.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; };
    canvas.addEventListener('pointerdown', e => {
      canvas.setPointerCapture(e.pointerId);
      const [x, y] = pos(e);
      if (tool === 'fill') { ctx.fillStyle = color.value; ctx.fillRect(0, 0, canvas.width, canvas.height); return; }
      drawing = true; last = [x, y];
      ctx.beginPath(); ctx.arc(x, y, size.value / 2, 0, Math.PI * 2);
      ctx.fillStyle = tool === 'eraser' ? '#fff' : color.value; ctx.fill();
    });
    canvas.addEventListener('pointermove', e => {
      if (!drawing) return;
      const [x, y] = pos(e);
      ctx.strokeStyle = tool === 'eraser' ? '#fff' : color.value;
      ctx.lineWidth = size.value; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
      ctx.beginPath(); ctx.moveTo(...last); ctx.lineTo(x, y); ctx.stroke();
      last = [x, y];
    });
    canvas.addEventListener('pointerup', () => { drawing = false; });
    const save = async () => {
      const name = await ask('Запиши като:', HOME + '/Pictures/рисунка.png');
      if (!name) return;
      try { fs.write(fs.resolve(HOME, name.endsWith('.png') ? name : name + '.png'), canvas.toDataURL('image/png')); refreshExplorers(); }
      catch (e) { alert('Неуспешен запис: ' + e.message); }
    };
    toolBtns.pen = h('button', { onclick: () => setTool('pen') }, '✏️');
    toolBtns.eraser = h('button', { onclick: () => setTool('eraser') }, '🧽');
    toolBtns.fill = h('button', { onclick: () => setTool('fill') }, '🪣');
    win.body.append(h('div', { class: 'fill paint' },
      h('div', { class: 'toolbar' }, toolBtns.pen, toolBtns.eraser, toolBtns.fill, color, size,
        h('button', { onclick: () => { ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, canvas.width, canvas.height); } }, '🗑'),
        h('button', { onclick: save }, '💾')),
      canvas));
    setTool('pen');
  });

  /* ---------- Image viewer ---------- */
  register('viewer', 'Снимки', '🖼️', (path) => {
    const win = createWindow({ title: 'Снимки', icon: '🖼️', width: 520, height: 420, appId: 'viewer' });
    if (!path) { win.body.append(h('div', { class: 'about' }, 'Отвори .png файл от Файлове или запиши рисунка от Рисуване.')); return; }
    win.setTitle(fs.split(path)[1]);
    const n = fs.get(path);
    win.body.append(h('div', { style: 'display:flex;align-items:center;justify-content:center;height:100%;background:#111' },
      h('img', { src: n.content, style: 'max-width:100%;max-height:100%' })));
  });

  /* ---------- Snake ---------- */
  register('snake', 'Змия', '🐍', () => {
    const win = createWindow({ title: 'Змия', icon: '🐍', width: 420, height: 520, appId: 'snake' });
    const N = 20, CELL = 18;
    const canvas = h('canvas', { width: N * CELL, height: N * CELL, tabindex: '0' });
    const ctx = canvas.getContext('2d');
    const info = h('div');
    let best = store.get('nova-snake-best', 0);
    let snake, dir, nextDir, food, score, alive, timer;
    const placeFood = () => {
      do { food = [Math.floor(Math.random() * N), Math.floor(Math.random() * N)]; }
      while (snake.some(([x, y]) => x === food[0] && y === food[1]));
    };
    const reset = () => {
      snake = [[10, 10], [9, 10], [8, 10]]; dir = [1, 0]; nextDir = [1, 0]; score = 0; alive = true;
      placeFood(); clearInterval(timer); timer = setInterval(step, 120); draw();
    };
    const step = () => {
      if (!alive || win.minimized) return;
      dir = nextDir;
      const head = [(snake[0][0] + dir[0] + N) % N, (snake[0][1] + dir[1] + N) % N];
      if (snake.some(([x, y]) => x === head[0] && y === head[1])) {
        alive = false;
        if (score > best) { best = score; store.set('nova-snake-best', best); }
        draw(); return;
      }
      snake.unshift(head);
      if (head[0] === food[0] && head[1] === food[1]) { score++; placeFood(); } else snake.pop();
      draw();
    };
    const draw = () => {
      ctx.fillStyle = '#111821'; ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.fillStyle = '#ff6b6b'; ctx.beginPath();
      ctx.arc(food[0] * CELL + CELL / 2, food[1] * CELL + CELL / 2, CELL / 2.4, 0, Math.PI * 2); ctx.fill();
      snake.forEach(([x, y], i) => {
        ctx.fillStyle = i === 0 ? '#7bed9f' : `hsl(${140 - i * 2}, 70%, 50%)`;
        ctx.fillRect(x * CELL + 1, y * CELL + 1, CELL - 2, CELL - 2);
      });
      if (!alive) {
        ctx.fillStyle = 'rgba(0,0,0,.6)'; ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.fillStyle = '#fff'; ctx.font = 'bold 26px sans-serif'; ctx.textAlign = 'center';
        ctx.fillText('КРАЙ НА ИГРАТА', canvas.width / 2, canvas.height / 2 - 10);
        ctx.font = '15px sans-serif'; ctx.fillText('Натисни Space или ⟳', canvas.width / 2, canvas.height / 2 + 20);
      }
      info.textContent = `Точки: ${score}   ·   Рекорд: ${best}`;
    };
    const turn = (dx, dy) => { if (dx !== -dir[0] || dy !== -dir[1]) nextDir = [dx, dy]; };
    const KEYS = { ArrowUp: [0, -1], ArrowDown: [0, 1], ArrowLeft: [-1, 0], ArrowRight: [1, 0], w: [0, -1], s: [0, 1], a: [-1, 0], d: [1, 0] };
    canvas.addEventListener('keydown', e => {
      if (KEYS[e.key]) { e.preventDefault(); turn(...KEYS[e.key]); }
      if (e.key === ' ') { e.preventDefault(); if (!alive) reset(); }
    });
    let touchStart = null;
    canvas.addEventListener('pointerdown', e => { touchStart = [e.clientX, e.clientY]; canvas.focus(); });
    canvas.addEventListener('pointerup', e => {
      if (!touchStart) return;
      const dx = e.clientX - touchStart[0], dy = e.clientY - touchStart[1];
      if (Math.max(Math.abs(dx), Math.abs(dy)) > 20) Math.abs(dx) > Math.abs(dy) ? turn(Math.sign(dx), 0) : turn(0, Math.sign(dy));
      touchStart = null;
    });
    const b = (label, fn) => h('button', { onclick: () => { fn(); canvas.focus(); } }, label);
    win.body.append(h('div', { class: 'snake' }, info, canvas,
      h('div', { class: 'pad' },
        h('span'), b('▲', () => turn(0, -1)), h('span'),
        b('◀', () => turn(-1, 0)), b('⟳', reset), b('▶', () => turn(1, 0)),
        h('span'), b('▼', () => turn(0, 1)), h('span'))));
    win.onClose.push(() => clearInterval(timer));
    reset();
    setTimeout(() => canvas.focus(), 50);
  });

  /* ---------- Browser (link launcher) ---------- */
  register('browser', 'Браузър', '🌐', () => {
    const win = createWindow({ title: 'Браузър', icon: '🌐', width: 520, height: 420, appId: 'browser' });
    const addr = h('input', { type: 'text', placeholder: 'Адрес или търсене…' });
    const link = h('a', { target: '_blank', rel: 'noopener', class: 'btn primary' }, 'Отвори ➜');
    const toUrl = u => /^https?:\/\//i.test(u) ? u : u.includes('.') && !u.includes(' ') ? 'https://' + u : 'https://duckduckgo.com/?q=' + encodeURIComponent(u);
    const sync = () => { link.href = addr.value.trim() ? toUrl(addr.value.trim()) : 'https://duckduckgo.com/'; };
    addr.addEventListener('input', sync);
    addr.addEventListener('keydown', e => { if (e.key === 'Enter') link.click(); });
    sync();
    const SITES = [['📚', 'Wikipedia', 'https://bg.wikipedia.org/'], ['🧮', 'WolframAlpha', 'https://www.wolframalpha.com/'],
      ['💻', 'GitHub', 'https://github.com/'], ['🎮', 'SteamDB', 'https://steamdb.info/'],
      ['🧠', 'Khan Academy', 'https://www.khanacademy.org/'], ['🐍', 'Scratch', 'https://scratch.mit.edu/']];
    win.body.append(h('div', { class: 'fill browser' },
      h('div', { class: 'toolbar' }, addr, link),
      h('div', { class: 'note' }, 'Сайтовете се отварят в нов раздел — повечето (Google, YouTube) не позволяват да бъдат вграждани в прозорец.'),
      h('div', { class: 'grid' }, SITES.map(([i, n, u]) =>
        h('a', { class: 'fitem', href: u, target: '_blank', rel: 'noopener' }, h('span', { class: 'ico' }, i), n)))));
  });

  /* ---------- Settings ---------- */
  register('settings', 'Настройки', '⚙️', () => {
    const win = createWindow({ title: 'Настройки', icon: '⚙️', width: 460, height: 440, appId: 'settings' });
    const root = h('div', { class: 'settings' });
    const render = () => {
      root.innerHTML = '';
      root.append(
        h('div', {}, h('h3', {}, 'Тапет'), h('div', { class: 'swatches' }, WALLPAPERS.map((w, i) =>
          h('div', { class: 'swatch' + (settings.wallpaper === i ? ' on' : ''), style: `background:${w}`, onclick: () => { settings.wallpaper = i; applySettings(); render(); } })))),
        h('div', {}, h('h3', {}, 'Цвят'), h('div', { class: 'swatches' }, ACCENTS.map((c, i) =>
          h('div', { class: 'dot' + (settings.accent === i ? ' on' : ''), style: `background:${c}`, onclick: () => { settings.accent = i; applySettings(); render(); } })))),
        h('div', {}, h('h3', {}, 'Тема'),
          h('button', { class: 'btn', onclick: () => { settings.theme = settings.theme === 'dark' ? 'light' : 'dark'; applySettings(); render(); } },
            settings.theme === 'dark' ? '🌙 Тъмна (смени)' : '☀️ Светла (смени)')),
        h('div', {}, h('h3', {}, 'Потребителско име'),
          h('button', { class: 'btn', onclick: async () => { const n = await ask('Име:', settings.user); if (n && /^[\w.-]{1,16}$/.test(n)) { settings.user = n; applySettings(); render(); } } }, '👤 ' + settings.user)));
    };
    render();
    win.body.append(root);
  });

  /* ---------- About ---------- */
  register('about', 'За NovaOS', 'ℹ️', () => {
    const win = createWindow({ title: 'За NovaOS', icon: 'ℹ️', width: 360, height: 300, appId: 'about' });
    win.body.append(h('div', { class: 'about' },
      h('div', { class: 'big' }, '◆'),
      h('b', {}, 'NovaOS 1.0'), h('br'),
      'Операционна система в браузъра.', h('br'),
      'HTML + CSS + JavaScript, без библиотеки.', h('br'), h('br'),
      h('span', { style: 'color:var(--muted)' }, 'Файловете ти се пазят в localStorage на този браузър.')));
  });

  /* ================= Desktop, taskbar, start menu ================= */
  const DESKTOP_APPS = ['explorer', 'terminal', 'notepad', 'calc', 'paint', 'snake', 'browser', 'settings'];

  function buildDesktop() {
    const wrap = $('#icons');
    for (const id of DESKTOP_APPS) {
      const app = apps[id];
      const icon = h('div', { class: 'desk-icon' }, h('span', { class: 'ico' }, app.icon), app.name);
      icon.onclick = e => {
        document.querySelectorAll('.desk-icon').forEach(i => i.classList.remove('sel'));
        icon.classList.add('sel');
        if (e.pointerType === 'touch' || isMobile()) app.open();
      };
      icon.ondblclick = () => { if (!isMobile()) app.open(); };
      wrap.append(icon);
    }
    $('#desktop').addEventListener('contextmenu', e => {
      if (e.target.closest('.window')) return;
      e.preventDefault();
      contextMenu(e.clientX, e.clientY, [
        ['💻 Терминал', () => apps.terminal.open()],
        ['📝 Нова бележка', () => apps.notepad.open()],
        ['⚙️ Смени тапета', () => apps.settings.open()],
        ['ℹ️ За NovaOS', () => apps.about.open()],
      ]);
    });
  }

  function buildStartMenu() {
    const menu = $('#start-menu'), list = $('#start-apps'), search = $('#start-search');
    const render = (q = '') => {
      list.innerHTML = '';
      Object.values(apps)
        .filter(a => (a.name + a.id).toLowerCase().includes(q.toLowerCase()))
        .forEach(a => list.append(h('button', { class: 'start-app', onclick: () => { a.open(); toggle(false); } },
          h('span', { class: 'ico' }, a.icon), a.name)));
    };
    const toggle = force => {
      const show = force ?? menu.classList.contains('hidden');
      menu.classList.toggle('hidden', !show);
      if (show) { search.value = ''; render(); if (!isMobile()) search.focus(); }
    };
    search.addEventListener('input', () => render(search.value));
    search.addEventListener('keydown', e => { if (e.key === 'Enter') list.querySelector('.start-app')?.click(); });
    $('#start-btn').onclick = e => { e.stopPropagation(); toggle(); };
    document.addEventListener('pointerdown', e => {
      if (!menu.contains(e.target) && e.target !== $('#start-btn')) toggle(false);
    });
    document.addEventListener('keydown', e => { if (e.key === 'Meta' || (e.altKey && e.key === 's')) toggle(); if (e.key === 'Escape') toggle(false); });
    $('#btn-reboot').onclick = () => location.reload();
    $('#btn-reset').onclick = async () => {
      if (!await confirmBox('Това изтрива всички файлове и настройки. Сигурен ли си?')) return;
      try { ['nova-fs', 'nova-settings', 'nova-snake-best'].forEach(k => localStorage.removeItem(k)); } catch { /* ignore */ }
      location.reload();
    };
  }

  const tick = () => {
    const d = new Date();
    $('#clock').textContent = d.toLocaleTimeString('bg-BG', { hour: '2-digit', minute: '2-digit' }) + '  ' +
      d.toLocaleDateString('bg-BG', { day: '2-digit', month: '2-digit' });
  };

  /* ================= Boot ================= */
  applySettings();
  buildDesktop();
  buildStartMenu();
  tick(); setInterval(tick, 10000);
  const bootText = $('.boot-text');
  ['Монтиране на файловата система...', 'Стартиране на прозорците...', 'Готово!'].forEach((t, i) =>
    setTimeout(() => { bootText.textContent = t; }, 400 * (i + 1)));
  setTimeout(() => {
    const boot = $('#boot'); boot.style.opacity = 0;
    setTimeout(() => boot.remove(), 500);
    if (!store.get('nova-welcomed', false)) {
      store.set('nova-welcomed', true);
      openFile(HOME + '/Documents/readme.txt');
    }
  }, 1600);

  window.NovaOS = { apps, fs, createWindow }; // handy for tinkering from DevTools
})();
