/* mpei.fish — интерактив и каталог */
(() => {
  const CFG = window.MPEI || {};
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const fmtSize = b => b >= 2 ** 30 ? (b / 2 ** 30).toFixed(1).replace('.', ',') + ' ГБ' : b >= 2 ** 20 ? Math.round(b / 2 ** 20) + ' МБ' : Math.max(1, Math.round(b / 1024)) + ' КБ';
  const fmtN = n => n.toLocaleString('ru-RU');
  const plural = (n, a, b, c) => { const m = n % 10, h = n % 100; return m === 1 && h !== 11 ? a : m >= 2 && m <= 4 && (h < 10 || h >= 20) ? b : c; };
  const diskLink = path => (CFG.diskUrl || '') + path.split('/').map(encodeURIComponent).join('/');

  const TYPES = {
    'КР': ['Контрольные', 'Контрольные и коллоквиумы прошлых лет'],
    'ТР': ['Типовые расчёты', 'ТР, РГР, ДЗ и расчётные задания'],
    'ЛР': ['Лабораторные', 'Отчёты, протоколы, ответы на допуск'],
    'ЭКЗ': ['Сессия', 'Билеты, экзамены и зачёты'],
    'КП': ['Курсовые', 'Курсовые проекты и записки'],
    'КОНС': ['Лекции', 'Конспекты, методички, шпоры'],
    'ЧЕРТ': ['Чертежи', 'DWG, КОМПАС, SolidWorks'],
    'ПРОЧЕЕ': ['Разное', 'Фото решений и всё остальное'],
  };

  let CAT = null, SEARCH = null;
  const byId = {};

  /* ============ CAD-курсор ============ */
  const cad = $('.cad');
  if (cad && matchMedia('(hover: hover) and (pointer: fine)').matches) {
    const h = $('.cad__h'), v = $('.cad__v'), box = $('.cad__box'), xy = $('.cad__xy');
    let x = innerWidth / 2, y = innerHeight / 2, bx = x, by = y;
    const pad = n => String(Math.max(0, Math.round(n))).padStart(4, '0');
    addEventListener('pointermove', e => {
      x = e.clientX; y = e.clientY;
      h.style.translate = `0 ${y}px`; v.style.translate = `${x}px 0`;
      xy.style.left = x + 'px'; xy.style.top = y + 'px';
      xy.textContent = `X ${pad(x)} · Y ${pad(y + scrollY)}`;
      cad.classList.toggle('is-link', !!e.target.closest('a, button, label, .switch__dial, .tick, input'));
      cad.classList.remove('is-hidden');
    });
    document.addEventListener('pointerleave', () => cad.classList.add('is-hidden'));
    (function follow() {
      bx += (x - bx) * .25; by += (y - by) * .25;
      box.style.translate = `${bx}px ${by}px`;
      requestAnimationFrame(follow);
    })();
  }

  /* ============ Осциллограф с рыбой ============ */
  const canvas = $('#scope');
  if (canvas) {
    const ctx = canvas.getContext('2d');
    const screen = canvas.parentElement;
    const modeEl = $('[data-mode]'), freqEl = $('[data-freq]'), ampEl = $('[data-amp]');
    let W = 0, H = 0, dpr = 1;
    const resize = () => {
      dpr = Math.min(devicePixelRatio || 1, 1.5);
      W = canvas.width = Math.round(screen.clientWidth * dpr);
      H = canvas.height = Math.round(screen.clientHeight * dpr);
      ctx.fillStyle = '#0c110d'; ctx.fillRect(0, 0, W, H);
    };
    resize(); addEventListener('resize', resize);

    let mx = .45, my = .5, tmx = mx, tmy = my;
    let k = 0, target = 0, manual = false, power = 0, visible = true, t = 0, last = performance.now();
    screen.addEventListener('pointermove', e => {
      const r = screen.getBoundingClientRect();
      tmx = (e.clientX - r.left) / r.width; tmy = (e.clientY - r.top) / r.height;
    });
    const toggle = () => { manual = true; target = target ? 0 : 1; };
    screen.addEventListener('click', toggle);
    $('[data-toggle-mode]').addEventListener('click', toggle);
    setInterval(() => { if (!manual && !reduced) target = target ? 0 : 1; }, 5200);
    new IntersectionObserver(([en]) => { visible = en.isIntersecting; }).observe(screen);

    const N = 420, pts = new Float32Array(N * 2);
    const ease = x => x < .5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2;

    function frame(now) {
      const dt = Math.min(.05, (now - last) / 1000); last = now;
      requestAnimationFrame(frame);
      if (!visible) return;
      t += dt;
      power = Math.min(1, power + dt * .9);
      mx += (tmx - mx) * .08; my += (tmy - my) * .08;
      k += (target - k) * Math.min(1, dt * 2.6);
      const e = ease(Math.max(0, Math.min(1, k)));

      const cycles = 1.5 + mx * 5;
      const amp = .35 + (1 - my) * .8;
      freqEl.textContent = (cycles * 25).toFixed(1);
      ampEl.textContent = (amp * 2.5).toFixed(1);
      modeEl.textContent = e > .5 ? 'XY' : 'YT';

      ctx.globalCompositeOperation = 'source-over';
      ctx.shadowBlur = 0;
      ctx.fillStyle = 'rgba(12,17,13,0.28)';
      ctx.fillRect(0, 0, W, H);

      const s = Math.min(W, H) * .44;
      const swim = Math.sin(t * 1.3) * W * .03;
      const tilt = (my - .5) * .5 * e;
      for (let i = 0; i < N; i++) {
        const u = i / (N - 1);
        const yx = u * W;
        const yy = H / 2 - Math.sin(u * cycles * Math.PI * 2 - t * 4) * amp * H * .3 + (Math.random() - .5) * .6 * dpr;
        const a = u * Math.PI * 2;
        const fx = Math.cos(a) - Math.sin(a) ** 2 / Math.SQRT2;
        let fy = Math.cos(a) * Math.sin(a);
        if (fx < -.5) fy += Math.sin(t * 7) * (-.5 - fx) * .45;
        const rx = fx * Math.cos(tilt) - fy * Math.sin(tilt);
        const ry = fx * Math.sin(tilt) + fy * Math.cos(tilt);
        const xx = W / 2 + (rx + .1) * s + swim;
        const xy = H / 2 + ry * s * 1.15;
        pts[i * 2] = yx + (xx - yx) * e;
        pts[i * 2 + 1] = yy + (xy - yy) * e;
      }

      ctx.globalCompositeOperation = 'lighter';
      ctx.lineJoin = 'round';
      ctx.strokeStyle = `rgba(166,255,110,${.55 * power})`;
      ctx.shadowColor = 'rgba(166,255,110,.9)';
      ctx.shadowBlur = 14 * dpr;
      ctx.lineWidth = 2.2 * dpr;
      ctx.beginPath();
      ctx.moveTo(pts[0], pts[1]);
      for (let i = 1; i < N; i++) ctx.lineTo(pts[i * 2], pts[i * 2 + 1]);
      ctx.stroke();

      const head = Math.floor((t * 160) % N);
      ctx.fillStyle = `rgba(230,255,210,${power})`;
      ctx.beginPath(); ctx.arc(pts[head * 2], pts[head * 2 + 1], 3 * dpr, 0, 7); ctx.fill();

      if (e > .7) {
        const cx = W / 2 + swim + .1 * s, dx = .55 * s, dy = -.1 * s * 1.15;
        const ra = Math.cos(tilt), rb = Math.sin(tilt);
        ctx.fillStyle = `rgba(166,255,110,${(e - .7) / .3})`;
        ctx.beginPath(); ctx.arc(cx + dx * ra - dy * rb, H / 2 + dx * rb + dy * ra, 4 * dpr, 0, 7); ctx.fill();
      }
    }
    requestAnimationFrame(frame);
  }

  /* ============ Семисегментные табло ============ */
  const SEGS = { a: [6, 0, 18, 4], b: [26, 5, 4, 19], c: [26, 28, 4, 19], d: [6, 48, 18, 4], e: [0, 28, 4, 19], f: [0, 5, 4, 19], g: [6, 24, 18, 4] };
  const MAP = ['abcdef', 'bc', 'abged', 'abgcd', 'fgbc', 'afgcd', 'afgedc', 'abc', 'abcdefg', 'abcdfg'];
  const digitSVG = () => `<svg viewBox="-2 0 34 52"><g transform="skewX(-6)">${Object.entries(SEGS).map(([n, [x, y, w, h]]) => `<rect class="s" data-s="${n}" x="${x}" y="${y}" width="${w}" height="${h}" rx="2"/>`).join('')}</g></svg>`;
  function sevenSeg(el, target) {
    const len = String(target).length;
    let html = '';
    for (let i = 0; i < len; i++) {
      if (i > 0 && (len - i) % 3 === 0) html += '<span class="gap"></span>';
      html += digitSVG();
    }
    el.innerHTML = html;
    el.setAttribute('role', 'img');
    el.setAttribute('aria-label', fmtN(target));
    const digits = $$('svg', el);
    const show = n => {
      const str = String(n).padStart(len, ' ');
      digits.forEach((d, i) => {
        const on = str[i] === ' ' ? '' : MAP[+str[i]];
        $$('.s', d).forEach(r => r.classList.toggle('on', on.includes(r.dataset.s)));
      });
    };
    show(reduced ? target : 0);
    if (reduced) return;
    new IntersectionObserver(([en], ob) => {
      if (!en.isIntersecting) return;
      ob.disconnect();
      const o = { v: 0 };
      gsap.to(o, { v: target, duration: 2.2, ease: 'expo.out', onUpdate: () => show(Math.round(o.v)) });
    }, { threshold: .5 }).observe(el);
  }

  /* ============ Галетный переключатель семестров ============ */
  const dial = $('.switch__dial');
  const list = $('.subjects__list');
  const SEMS = 11, ANG0 = -135, STEP = 270 / (SEMS - 1);
  let sem = 3, section = 'all';
  const angleOf = s => ANG0 + (s - 1) * STEP;

  function buildDial() {
    const NS = 'http://www.w3.org/2000/svg';
    const ticks = $('.switch__ticks'), grip = $('.switch__grip');
    const polar = (deg, r) => [160 + r * Math.sin(deg * Math.PI / 180), 160 - r * Math.cos(deg * Math.PI / 180)];
    for (let s = 1; s <= SEMS; s++) {
      const a = angleOf(s);
      const g = document.createElementNS(NS, 'g');
      g.setAttribute('class', 'tick'); g.dataset.sem = s;
      const [x1, y1] = polar(a, 98), [x2, y2] = polar(a, 108), [tx, ty] = polar(a, 126);
      g.innerHTML = `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}"/><text x="${tx}" y="${ty}">${s}</text>`;
      ticks.appendChild(g);
      if (s % 2 === 0) {
        const [cx, cy] = polar(a - STEP / 2, 153);
        const c = document.createElementNS(NS, 'text');
        c.setAttribute('class', 'course'); c.setAttribute('x', cx); c.setAttribute('y', cy);
        c.setAttribute('text-anchor', 'middle'); c.setAttribute('dominant-baseline', 'central');
        c.textContent = `${s / 2} К.`;
        ticks.appendChild(c);
      }
    }
    for (let i = 0; i < 28; i++) {
      const a = i * 360 / 28, [x1, y1] = polar(a, 58), [x2, y2] = polar(a, 74);
      grip.insertAdjacentHTML('beforeend', `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}"/>`);
    }
  }

  function setSem(s, instant) {
    s = Math.max(1, Math.min(SEMS, s));
    if (s === sem && !instant) return;
    sem = s;
    gsap.to('.switch__knob', { rotation: angleOf(s), svgOrigin: '160 160', duration: instant || reduced ? 0 : .55, ease: 'back.out(2.2)' });
    dial.setAttribute('aria-valuenow', s);
    dial.setAttribute('aria-valuetext', `${s} семестр, ${Math.ceil(s / 2)} курс`);
    $('[data-out-sem]').textContent = s;
    $('[data-out-course]').textContent = Math.ceil(s / 2);
    $$('.tick[data-sem]').forEach(t => t.classList.toggle('is-on', +t.dataset.sem === s));
    renderSubjects(!instant);
  }

  function initDial() {
    buildDial();
    gsap.set('.switch__knob', { rotation: angleOf(sem), svgOrigin: '160 160' });
    let dragging = false;
    const fromPointer = e => {
      const r = dial.getBoundingClientRect();
      const x = e.clientX - (r.left + r.width / 2), y = e.clientY - (r.top + r.height / 2);
      const a = Math.max(ANG0, Math.min(-ANG0, Math.atan2(x, -y) * 180 / Math.PI));
      setSem(Math.round((a - ANG0) / STEP) + 1);
    };
    dial.addEventListener('pointerdown', e => {
      const tick = e.target.closest('.tick[data-sem]');
      if (tick) { setSem(+tick.dataset.sem); return; }
      dragging = true; dial.setPointerCapture(e.pointerId); fromPointer(e);
    });
    dial.addEventListener('pointermove', e => dragging && fromPointer(e));
    dial.addEventListener('pointerup', () => { dragging = false; });
    dial.addEventListener('keydown', e => {
      if (['ArrowRight', 'ArrowUp'].includes(e.key)) { setSem(sem + 1); e.preventDefault(); }
      if (['ArrowLeft', 'ArrowDown'].includes(e.key)) { setSem(sem - 1); e.preventDefault(); }
    });
    $$('.chip[data-section]').forEach(c => c.addEventListener('click', () => {
      $$('.chip[data-section]').forEach(x => x.classList.toggle('is-on', x === c));
      section = c.dataset.section; renderSubjects(true);
    }));
    list.addEventListener('click', e => {
      const b = e.target.closest('[data-subject]');
      if (b) openSubject(b.dataset.subject);
    });
    setSem(3, true);
  }

  const typeTags = types => Object.entries(types).filter(([t]) => t !== 'ПРОЧЕЕ').slice(0, 4).map(([t, n]) => `<span title="${esc(TYPES[t]?.[0] || t)}: ${n}">${esc(t)} · ${n}</span>`).join('');

  function renderSubjects(animate) {
    if (!CAT) return;
    const items = CAT.subjects.filter(s => s.sem === sem && (section === 'all' || s.sections.includes(section)));
    list.innerHTML = items.length ? items.map(s => `
      <li><button class="subj" type="button" data-subject="${s.id}">
        <h3>${esc(s.title)}</h3><span class="subj__n">${fmtN(s.files)}</span>
        <span class="subj__inst">${esc(s.sections.join(' · '))} · ${fmtSize(s.size)}</span>
        <span class="subj__meta">${typeTags(s.types)}</span>
      </button></li>`).join('')
      : `<li class="subjects__empty">В ${sem}-м семестре в разделе «${esc(section)}» пока пусто. Пришли первым →</li>`;
    if (animate && !reduced) gsap.from(list.children, { y: 18, opacity: 0, duration: .5, stagger: .03, ease: 'expo.out' });
  }

  /* ============ Панель: файлы предмета и поиск ============ */
  const drawer = $('[data-drawer]');
  const dBody = $('[data-drawer-body]'), dFilter = $('[data-drawer-filter]'), dTypes = $('[data-drawer-types]');
  let dRows = [], dType = 'all', dLimit = 300, lastFocus = null;

  function openDrawer(kicker, title, rows, foot) {
    lastFocus = document.activeElement;
    $('[data-drawer-kicker]').textContent = kicker;
    $('[data-drawer-title]').textContent = title;
    $('[data-drawer-foot]').innerHTML = foot || '';
    dRows = rows; dType = 'all'; dLimit = 300; dFilter.value = '';
    const counts = {};
    rows.forEach(r => { counts[r.t] = (counts[r.t] || 0) + 1; });
    dTypes.innerHTML = [`<button class="chip is-on" type="button" data-t="all">Все · ${fmtN(rows.length)}</button>`]
      .concat(Object.entries(counts).sort((a, b) => b[1] - a[1]).map(([t, n]) => `<button class="chip" type="button" data-t="${esc(t)}">${esc(TYPES[t]?.[0] || t)} · ${fmtN(n)}</button>`)).join('');
    renderRows();
    drawer.hidden = false;
    document.body.classList.add('is-locked');
    requestAnimationFrame(() => drawer.classList.add('is-open'));
    setTimeout(() => dFilter.focus({ preventScroll: true }), 50);
  }
  function closeDrawer() {
    drawer.classList.remove('is-open');
    document.body.classList.remove('is-locked');
    setTimeout(() => { drawer.hidden = true; }, reduced ? 0 : 350);
    lastFocus?.focus?.({ preventScroll: true });
  }
  function renderRows() {
    const q = dFilter.value.trim().toLowerCase().split(/\s+/).filter(Boolean);
    const rows = dRows.filter(r => (dType === 'all' || r.t === dType) && q.every(w => r.hay.includes(w)));
    let html = '', group = null;
    rows.slice(0, dLimit).forEach(r => {
      if (r.g !== group) { group = r.g; html += `<p class="drawer__group">${esc(group || 'Без папки')}</p>`; }
      html += `<a class="file" href="${esc(diskLink(r.p))}" data-path="${esc(r.p)}" target="_blank" rel="noopener noreferrer" title="Скачать">
        <span class="file__t">${esc(r.t)}</span><span class="file__n">${esc(r.n)}</span><span class="file__s">${r.s ? fmtSize(r.s) : ''}</span></a>`;
    });
    if (!rows.length) html = '<p class="drawer__empty">Ничего не нашлось. Попробуй другое слово.</p>';
    if (rows.length > dLimit) html += `<button class="btn btn--ghost drawer__more" type="button" data-more>Показать ещё (${fmtN(rows.length - dLimit)})</button>`;
    dBody.innerHTML = html;
  }
  // Скачивание напрямую через публичный API Яндекс Диска: без входа и капчи.
  async function download(a) {
    const path = a.dataset.path;
    a.classList.add('is-loading');
    try {
      const api = 'https://cloud-api.yandex.net/v1/disk/public/resources/download?public_key='
        + encodeURIComponent(CFG.diskUrl) + '&path=' + encodeURIComponent(path);
      const r = await fetch(api, { referrerPolicy: 'no-referrer' });
      const j = await r.json();
      if (!j.href) throw new Error(j.error || 'no href');
      location.assign(j.href);
    } catch {
      window.open(a.href, '_blank', 'noopener');
    } finally {
      setTimeout(() => a.classList.remove('is-loading'), 1200);
    }
  }

  drawer.addEventListener('click', e => {
    const f = e.target.closest('a.file');
    if (f && !e.ctrlKey && !e.metaKey && !e.shiftKey && e.button === 0) { e.preventDefault(); download(f); return; }
    if (e.target.closest('[data-close]')) closeDrawer();
    const t = e.target.closest('[data-t]');
    if (t) { dType = t.dataset.t; $$('[data-t]', dTypes).forEach(x => x.classList.toggle('is-on', x === t)); dLimit = 300; renderRows(); }
    if (e.target.closest('[data-more]')) { dLimit += 300; renderRows(); }
  });
  dFilter.addEventListener('input', () => { dLimit = 300; renderRows(); });
  addEventListener('keydown', e => { if (e.key === 'Escape' && !drawer.hidden) closeDrawer(); });

  async function openSubject(id) {
    const s = byId[id];
    if (!s) return;
    const data = await fetch(`data/s/${id}.json`).then(r => r.json());
    const rows = data.map(([n, p, d, sec, size, t]) => ({ n, p, s: size, t, g: [sec, d].filter(Boolean).join(' / '), hay: (n + ' ' + d).toLowerCase() }));
    const kicker = s.sem ? `${s.sem} семестр · ${Math.ceil(s.sem / 2)} курс` : 'Подборка';
    const foot = `<span>${fmtN(s.files)} ${plural(s.files, 'файл', 'файла', 'файлов')} · ${fmtSize(s.size)}</span>
      <a class="btn btn--ghost" href="${esc(diskLink(s.folder))}" target="_blank" rel="noopener noreferrer">Папка на Яндекс Диске ↗</a>`;
    openDrawer(kicker, s.title, rows, foot);
  }

  async function loadSearch() {
    if (!SEARCH) SEARCH = await fetch('data/search.json').then(r => r.json()).then(a => a.map(([n, id, p, t]) => ({ n, id, p, t, hay: (n + ' ' + (byId[id]?.title || '')).toLowerCase() })));
    return SEARCH;
  }
  async function runSearch(query, type) {
    const words = query.toLowerCase().split(/\s+/).filter(w => w.length > 1);
    if (!words.length && !type) return;
    const all = await loadSearch();
    const hits = all.filter(r => (!type || r.t === type) && words.every(w => r.hay.includes(w)));
    // сначала совпадения по названию предмета
    const rows = hits.slice(0, 3000).map(r => {
      const s = byId[r.id];
      return { n: r.n, p: r.p, t: r.t, s: 0, g: s ? `${s.sem ? s.sem + ' сем. · ' : ''}${s.title}` : '', hay: r.hay };
    }).sort((a, b) => a.g.localeCompare(b.g, 'ru'));
    const title = type ? (TYPES[type]?.[0] || type) : `«${query}»`;
    openDrawer(type ? 'Тип работы' : 'Поиск по архиву', title, rows,
      `<span>${fmtN(hits.length)} ${plural(hits.length, 'совпадение', 'совпадения', 'совпадений')}${hits.length > 3000 ? ', показаны первые 3 000' : ''}</span>`);
  }

  const q = $('#q');
  $('[data-search-form]').addEventListener('submit', e => { e.preventDefault(); runSearch(q.value.trim()); });
  q.addEventListener('focus', () => { if (CAT) loadSearch(); }, { once: true });
  addEventListener('keydown', e => {
    if (e.key === '/' && document.activeElement.tagName !== 'INPUT') { e.preventDefault(); q.scrollIntoView({ block: 'center' }); q.focus({ preventScroll: true }); }
  });
  $('[data-focus-search]').addEventListener('click', () => { q.scrollIntoView({ block: 'center' }); q.focus({ preventScroll: true }); });
  $$('.search__hints button').forEach(b => b.addEventListener('click', () => { q.value = b.textContent; runSearch(b.textContent); }));

  /* ============ Секции из каталога ============ */
  function renderStats() {
    const t = CAT.totals;
    const vals = { files: t.files, subjects: t.subjects, gb: Math.round(t.size / 2 ** 30), semesters: t.semesters };
    $$('[data-stat]').forEach(el => sevenSeg(el, vals[el.dataset.stat]));
  }

  function renderCollections() {
    const cols = CAT.subjects.filter(s => s.kind === 'collection');
    if (!cols.length) return;
    const box = $('[data-collections]');
    $('.collections__row', box).innerHTML = cols.map(s => `<button class="btn btn--ghost" type="button" data-subject="${s.id}">${esc(s.title)} <small>${fmtN(s.files)}</small></button>`).join('');
    box.hidden = false;
    box.addEventListener('click', e => { const b = e.target.closest('[data-subject]'); if (b) openSubject(b.dataset.subject); });
  }

  function renderStamps() {
    const top = CAT.subjects.filter(s => s.kind === 'sem').sort((a, b) => b.files - a.files).slice(0, 6);
    $('.stamps').innerHTML = top.map(s => {
      const types = Object.entries(s.types);
      const max = Math.max(...types.map(t => t[1]));
      const bars = types.slice(0, 4).map(([t, n]) => `${esc(t.padEnd(6, ' '))} <i>${'█'.repeat(Math.max(1, Math.round(n / max * 14)))}</i> ${n}`).join('<br>');
      const main = types.find(([t]) => t !== 'ПРОЧЕЕ')?.[0] || types[0][0];
      return `<button class="card" type="button" data-subject="${s.id}">
        <div class="card__preview">${bars}<span class="card__type">${esc(main)}</span></div>
        <span class="rubber">В АРХИВЕ</span>
        <div class="gost">
          <div class="wide"><small>Наименование</small><b>${esc(s.title)}</b></div>
          <div><small>Семестр</small><b>${s.sem}</b></div>
          <div><small>Курс</small><b>${Math.ceil(s.sem / 2)}</b></div>
          <div><small>Файлов</small><b>${fmtN(s.files)}</b></div>
          <div><small>Разделы</small><b>${esc(s.sections.join(', '))}</b></div>
          <div><small>Объём</small><b>${fmtSize(s.size)}</b></div>
          <div><small>Источник</small><b>Я.Диск</b></div>
        </div>
      </button>`;
    }).join('');
    $('.stamps').addEventListener('click', e => { const b = e.target.closest('[data-subject]'); if (b) openSubject(b.dataset.subject); });
  }

  function renderTypes() {
    const grid = $('.types__grid');
    grid.innerHTML = Object.entries(CAT.totals.types).map(([t, n]) => `
      <button class="type" type="button" data-type="${esc(t)}"><span class="type__code">${esc(t)}</span>
        <h3>${esc(TYPES[t]?.[0] || t)}</h3><p>${esc(TYPES[t]?.[1] || '')}</p><span class="type__n">${fmtN(n)}</span></button>`).join('');
    grid.addEventListener('click', e => { const b = e.target.closest('[data-type]'); if (b) runSearch('', b.dataset.type); });
  }

  function renderTape() {
    const names = [...new Set(CAT.subjects.filter(s => s.kind === 'sem' && s.files > 50).map(s => s.title))];
    const half = names.map(n => `<span>${esc(n)}</span>`).join('');
    $('.tape__track').innerHTML = half + half;
  }

  /* ============ Прислать работу ============ */
  const up = $('[data-upload]');
  if (CFG.uploadUrl) { up.href = CFG.uploadUrl; $('[data-upload-note]').textContent = 'Откроется Яндекс Форма · до 50 МБ'; }
  else $('[data-upload-note]').textContent = 'Приём работ скоро откроется';
  const circuit = $('.circuit');
  const on = v => circuit.classList.toggle('is-on', v);
  circuit.addEventListener('pointerenter', () => on(true));
  circuit.addEventListener('pointerleave', () => on(false));
  up.addEventListener('focus', () => on(true));
  up.addEventListener('blur', () => on(false));

  /* ============ Загрузка каталога ============ */
  fetch('data/catalog.json').then(r => r.json()).then(cat => {
    CAT = cat;
    cat.subjects.forEach(s => { byId[s.id] = s; });
    renderStats(); renderCollections(); renderStamps(); renderTypes(); renderTape();
    initDial();
    reveal();
  }).catch(() => {
    list.innerHTML = '<li class="subjects__empty">Не удалось загрузить каталог. Обнови страницу.</li>';
  });

  /* ============ Интро: перо плоттера ============ */
  if (!reduced) {
    const tl = gsap.timeline({ delay: .2 });
    $$('.plot').forEach((line, i) => {
      const pen = document.createElement('i');
      pen.setAttribute('aria-hidden', 'true');
      Object.assign(pen.style, { position: 'absolute', top: '8%', bottom: '8%', width: '3px', left: '0', background: 'var(--signal)' });
      line.appendChild(pen);
      gsap.set(line, { clipPath: 'inset(-10% 100% -10% -2%)' });
      tl.to(line, { clipPath: 'inset(-10% 0% -10% -2%)', duration: .8, ease: 'power2.inOut' }, i * .28)
        .fromTo(pen, { left: '0%' }, { left: '100%', duration: .8, ease: 'power2.inOut' }, i * .28)
        .to(pen, { opacity: 0, duration: .3 }, i * .28 + .8);
    });
    tl.from('.hero .label, .hero__lead, .search, .search__hints', { y: 24, opacity: 0, duration: .9, stagger: .1, ease: 'expo.out' }, .5)
      .from('.scope', { y: 40, opacity: 0, duration: 1.1, ease: 'expo.out' }, .3);
  }

  /* появление при скролле */
  function reveal() {
    if (reduced) return;
    const targets = $$('.sec-head, .stats, .card, .type, .circuit, .upload__text, .switch, .subjects');
    targets.forEach(el => el.classList.add('rv'));
    const io = new IntersectionObserver(ens => ens.forEach(en => {
      if (!en.isIntersecting) return;
      const sibs = [...en.target.parentElement.children].filter(c => c.classList.contains('rv'));
      en.target.style.transitionDelay = `${Math.max(0, sibs.indexOf(en.target)) % 3 * .08}s`;
      en.target.classList.add('in'); io.unobserve(en.target);
    }), { threshold: .15 });
    targets.forEach(el => io.observe(el));
  }
})();
