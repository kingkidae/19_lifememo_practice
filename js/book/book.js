/* 기록책 — 한 해의 기록을 집계해 페이지 수·가격을 계산하고, 주문을 로컬스토리지(orders)에 저장 */
(function () {
  'use strict';
  const { $, $$, esc, fmtNum, fmtDate, icon } = LM.util;
  const COL = 'orders';

  const CHAPTERS = [
    { id: 'agenda', ko: '일정', icon: 'calendar', cols: ['schedules'] },
    { id: 'todo', ko: '할 일', icon: 'checklist', cols: ['todos'] },
    { id: 'journal', ko: '일기', icon: 'journal', cols: ['diaries'] },
    { id: 'library', ko: '독서', icon: 'book', cols: ['books'] },
    { id: 'voyage', ko: '여행', icon: 'globe', cols: ['trips', 'visitedCities'] },
    { id: 'cuisine', ko: '요리', icon: 'pot', cols: ['recipes'] },
  ];
  const EDITIONS = {
    soft: { ko: '소프트커버', en: 'Daily', price: 29000, pages: 80, size: '148×210mm', foilFree: false },
    hard: { ko: '하드커버', en: 'Classic', price: 45000, pages: 120, size: '170×230mm', foilFree: false },
    linen: { ko: '린넨 하드커버 + 케이스', en: 'Heritage', price: 79000, pages: 200, size: '190×250mm', foilFree: true },
  };
  const COLORS = [
    { id: 'orange', ko: '오렌지', hex: '#f37021', tone: 'light' },
    { id: 'ink', ko: '잉크', hex: '#1c1714', tone: 'dark' },
    { id: 'brown', ko: '브라운', hex: '#5b3a29', tone: 'dark' },
    { id: 'sage', ko: '세이지', hex: '#8f9e80', tone: 'light' },
    { id: 'ivory', ko: '아이보리', hex: '#efe6d8', tone: 'light' },
  ];
  const FOILS = [
    { id: 'gold', ko: '금박', hex: '#c9a36a' },
    { id: 'silver', ko: '은박', hex: '#b9bec4' },
    { id: 'none', ko: '박 없음', hex: '' },
  ];
  const PAGE_PRICE = 150;
  const FOIL_PRICE = 5000;
  const SHIP = 3000;
  const FREE_SHIP = 50000;
  const MIN_PAGES = 24;
  const MAX_QTY = 10;

  const state = { year: new Date().getFullYear(), chapters: new Set(CHAPTERS.map((c) => c.id)), edition: 'hard', color: 'orange', foil: 'gold', qty: 1 };

  /* ---------- 기록 집계 ---------- */
  // 기록마다 '그 해'를 정하는 날짜: 일정·일기는 날짜, 책은 읽은 날, 할 일은 마감일, 나머지는 작성일
  const recordDate = (x) => x.date || x.readDate || x.due || (x.createdAt || '').slice(0, 10);

  function recordsOf(year) {
    const out = {};
    CHAPTERS.forEach((c) => {
      out[c.id] = c.cols.flatMap((col) => LM.store.list(col)).filter((x) => recordDate(x).startsWith(String(year)));
    });
    return out;
  }

  function availableYears() {
    const ys = new Set([new Date().getFullYear()]);
    CHAPTERS.forEach((c) => c.cols.forEach((col) => LM.store.list(col).forEach((x) => {
      const y = +recordDate(x).slice(0, 4);
      if (y) ys.add(y);
    })));
    return [...ys].sort((a, b) => b - a);
  }

  // 챕터별 지면 계산: 일정은 달마다 펼침 2쪽, 일기는 800자마다 1쪽, 책은 2권에 1쪽 …
  const PAGE_RULES = {
    agenda: (xs) => new Set(xs.map((x) => x.date.slice(0, 7))).size * 2,
    todo: (xs) => Math.ceil(xs.length / 25),
    journal: (xs) => xs.reduce((n, d) => n + 1 + Math.floor((d.content || '').length / 800), 0),
    library: (xs) => Math.ceil(xs.length / 2),
    voyage: (xs) => (xs.length ? 2 + Math.ceil(xs.length / 4) : 0),
    cuisine: (xs) => xs.length,
  };

  function estimate(recs) {
    let body = 0;
    let count = 0;
    let used = 0;
    CHAPTERS.forEach((c) => {
      if (!state.chapters.has(c.id) || !recs[c.id].length) return;
      body += PAGE_RULES[c.id](recs[c.id]) + 2; // 챕터 표지 2쪽
      count += recs[c.id].length;
      used++;
    });
    // 앞뒤 8쪽(속표지·목차·한 해 요약·맺음말), 인쇄 대수에 맞춰 4의 배수로
    const pages = count ? Math.max(MIN_PAGES, Math.ceil((body + 8) / 4) * 4) : 0;
    return { pages, count, used };
  }

  function price(pages) {
    const ed = EDITIONS[state.edition];
    const extra = Math.max(0, pages - ed.pages);
    const foil = state.foil !== 'none' && !ed.foilFree ? FOIL_PRICE : 0;
    const unit = ed.price + extra * PAGE_PRICE + foil;
    const subtotal = unit * state.qty;
    const ship = subtotal >= FREE_SHIP || !subtotal ? 0 : SHIP;
    return { ed, extra, foil, unit, subtotal, ship, total: subtotal + ship };
  }

  /* ---------- 렌더 ---------- */
  function renderControls() {
    const years = availableYears();
    if (!years.includes(state.year)) state.year = years[0];
    $('#bk-year').innerHTML = years.map((y) => `<option value="${y}" ${y === state.year ? 'selected' : ''}>${y}년</option>`).join('');

    $('#bk-editions').innerHTML = Object.entries(EDITIONS).map(([id, e]) => `
      <label class="ed-option">
        <input type="radio" name="edition" value="${id}" ${id === state.edition ? 'checked' : ''}>
        <span class="ed-option-body">
          <small>${e.en}</small><strong>${e.ko}</strong>
          <span class="muted">${e.size} · ${e.pages}쪽 포함</span>
          <span class="ed-option-price">${fmtNum(e.price)}원</span>
        </span>
      </label>`).join('');

    $('#bk-colors').innerHTML = COLORS.map((c) => `
      <label class="swatch" title="${c.ko}">
        <input type="radio" name="color" value="${c.id}" ${c.id === state.color ? 'checked' : ''}>
        <span style="background:${c.hex}"></span><span class="sr-only">${c.ko}</span>
      </label>`).join('');

    $('#bk-foil').innerHTML = FOILS.map((f) =>
      `<button type="button" data-foil="${f.id}" aria-pressed="${f.id === state.foil}">${f.ko}</button>`
    ).join('');
  }

  function renderChapters(recs) {
    // 다시 그려도 키보드 포커스가 제자리에 남도록
    const focused = document.activeElement?.name === 'chapter' ? document.activeElement.value : null;
    $('#bk-chapters').innerHTML = CHAPTERS.map((c) => {
      const n = recs[c.id].length;
      return `<label class="bk-chapter ${n ? '' : 'is-empty'}">
        <span class="check"><input type="checkbox" name="chapter" value="${c.id}" ${state.chapters.has(c.id) ? 'checked' : ''} ${n ? '' : 'disabled'}></span>
        ${icon(c.icon)}<span class="bk-chapter-name">${c.ko}</span><span class="bk-chapter-count display-num">${n}</span>
      </label>`;
    }).join('');
    if (focused) $(`input[name="chapter"][value="${focused}"]`)?.focus();
  }

  function renderCover(est) {
    const cover = $('#cover');
    const color = COLORS.find((c) => c.id === state.color);
    const foil = FOILS.find((f) => f.id === state.foil);
    const f = $('#book-form').elements;
    cover.dataset.edition = state.edition;
    cover.dataset.tone = color.tone;
    cover.style.setProperty('--cover', color.hex);
    cover.style.setProperty('--foil', foil.hex || (color.tone === 'dark' ? '#efe6d8' : '#1c1714'));
    $('#cover-title').textContent = f.title.value.trim() || '나의 인생메모';
    $('#cover-year').textContent = state.year;
    $('#cover-author').textContent = f.author.value.trim();
    $('#cover-caption').textContent = `${EDITIONS[state.edition].ko} · ${color.ko} · ${foil.ko}${est.pages ? ` · ${est.pages}쪽` : ''}`;
  }

  function renderReceipt(est) {
    const p = price(est.pages);
    const rows = [
      [`${p.ed.ko} 기본가`, `${fmtNum(p.ed.price)}원`],
      ['페이지', est.pages ? `${est.pages}쪽 <small>(${p.ed.pages}쪽 포함)</small>` : '—'],
      p.extra ? [`추가 ${p.extra}쪽 × ${PAGE_PRICE}원`, `${fmtNum(p.extra * PAGE_PRICE)}원`] : null,
      state.foil !== 'none' ? ['표지 박 가공', p.foil ? `${fmtNum(p.foil)}원` : '무료'] : null,
      state.qty > 1 ? ['수량', `× ${state.qty}권`] : null,
      ['배송비', p.ship ? `${fmtNum(p.ship)}원` : '무료'],
    ].filter(Boolean);
    $('#receipt').innerHTML = rows.map(([k, v]) => `<div><dt>${k}</dt><dd>${v}</dd></div>`).join('');
    $('#receipt-total').textContent = est.count ? `${fmtNum(p.total)}원` : '—';
    $('#order-open').disabled = !est.count;
    return p;
  }

  function renderHero(est) {
    $('[data-hero="records"]').textContent = fmtNum(est.count);
    $('[data-hero="year-label"]').textContent = `${state.year}년의 기록`;
    $('[data-hero="pages"]').textContent = est.pages;
    $('[data-hero="chapters"]').textContent = est.used;
  }

  function render() {
    const recs = recordsOf(state.year);
    renderChapters(recs);
    const est = estimate(recs);
    $('#bk-empty').hidden = CHAPTERS.some((c) => recs[c.id].length);
    renderCover(est);
    renderReceipt(est);
    renderHero(est);
    $('#bk-qty').textContent = state.qty;
  }

  /* ---------- 주문 (CRUD: Create · Read · Delete) ---------- */
  function renderOrders() {
    const orders = LM.store.list(COL).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    $('#orders').hidden = !orders.length;
    $('#order-list').innerHTML = orders.map((o) => {
      const color = COLORS.find((c) => c.id === o.color) || COLORS[0];
      return `<li class="order card">
        <span class="order-cover" style="background:${color.hex}" aria-hidden="true"><span>${esc(o.year)}</span></span>
        <div class="order-info">
          <p class="order-meta"><span class="tag tag--orange">제작 준비 중</span><span class="muted">${fmtDate(o.createdAt.slice(0, 10), { week: false })} 주문</span></p>
          <h3>${esc(o.title)}</h3>
          <p class="muted">${esc(o.year)}년 · ${esc(EDITIONS[o.edition]?.ko || '')} · ${esc(o.pages)}쪽 · ${esc(o.qty)}권 · ${esc(o.recipient.name)} 님께</p>
        </div>
        <strong class="order-total">${fmtNum(o.total)}원</strong>
        <button class="icon-btn icon-btn--danger" type="button" data-cancel="${o.id}" aria-label="${esc(o.title)} 주문 취소">${icon('trash')}</button>
      </li>`;
    }).join('');
  }

  function openOrder() {
    const est = estimate(recordsOf(state.year));
    if (!est.count) return;
    const p = price(est.pages);
    const f = $('#book-form').elements;
    $('#order-summary').innerHTML = `
      <p class="eyebrow">${state.year} · ${p.ed.en}</p>
      <h3>${esc(f.title.value.trim() || '나의 인생메모')}</h3>
      <p class="muted">${p.ed.ko} · ${est.pages}쪽 · ${fmtNum(est.count)}개의 기록 · ${state.qty}권</p>
      <p class="order-summary-total">${fmtNum(p.total)}원</p>`;
    LM.ui.openDialog($('#dlg-order'));
  }

  async function submitOrder(e) {
    e.preventDefault();
    const of = e.target.elements;
    const name = of.name.value.trim();
    const phone = of.phone.value.trim();
    const address = of.address.value.trim();
    if (!name) return LM.ui.toast('받는 분을 적어 주세요.');
    if (!/^[0-9+\-\s]{8,}$/.test(phone)) return LM.ui.toast('연락처를 숫자로 적어 주세요.');
    if (!address) return LM.ui.toast('주소를 적어 주세요.');

    const est = estimate(recordsOf(state.year));
    const p = price(est.pages);
    const f = $('#book-form').elements;
    const order = LM.store.create(COL, {
      year: state.year,
      chapters: [...state.chapters],
      records: est.count,
      pages: est.pages,
      edition: state.edition,
      color: state.color,
      foil: state.foil,
      title: f.title.value.trim() || '나의 인생메모',
      author: f.author.value.trim(),
      qty: state.qty,
      total: p.total,
      recipient: { name, phone, address, memo: of.memo.value.trim() },
    });
    if (!order) return;
    $('#dlg-order').close();
    e.target.reset();
    LM.ui.toast(`${state.year}년의 기록책 주문을 접수했어요.`);
    $('#orders').scrollIntoView({ behavior: 'smooth' });
  }

  document.addEventListener('DOMContentLoaded', () => {
    renderControls();
    render();
    renderOrders();

    const form = $('#book-form');
    form.addEventListener('change', (e) => {
      const t = e.target;
      if (t.name === 'year') state.year = +t.value;
      if (t.name === 'edition') state.edition = t.value;
      if (t.name === 'color') state.color = t.value;
      if (t.name === 'chapter') t.checked ? state.chapters.add(t.value) : state.chapters.delete(t.value);
      render();
    });
    form.addEventListener('input', (e) => { if (e.target.name === 'title' || e.target.name === 'author') render(); });
    form.addEventListener('submit', (e) => e.preventDefault());

    $('#bk-foil').addEventListener('click', (e) => {
      const b = e.target.closest('[data-foil]');
      if (!b) return;
      state.foil = b.dataset.foil;
      $$('[data-foil]').forEach((x) => x.setAttribute('aria-pressed', x === b));
      render();
    });

    $$('[data-qty]').forEach((b) => b.addEventListener('click', () => {
      state.qty = Math.min(MAX_QTY, Math.max(1, state.qty + +b.dataset.qty));
      render();
    }));

    $$('[data-pick-edition]').forEach((b) => b.addEventListener('click', () => {
      state.edition = b.dataset.pickEdition;
      $(`input[name="edition"][value="${state.edition}"]`).checked = true;
      render();
      $('#builder').scrollIntoView({ behavior: 'smooth' });
    }));

    $('#order-open').addEventListener('click', openOrder);
    $('#order-form').addEventListener('submit', submitOrder);
    $('#order-list').addEventListener('click', async (e) => {
      const b = e.target.closest('[data-cancel]');
      if (!b) return;
      const o = LM.store.get(COL, b.dataset.cancel);
      if (o && (await LM.ui.confirm(`'${o.title}' 주문을 취소할까요?`, { ok: '주문 취소' }))) {
        LM.store.remove(COL, o.id);
        LM.ui.toast('주문을 취소했어요.');
      }
    });

    // 노트(다른 탭)에서 기록이 바뀌면 다시 계산
    LM.store.onChange((key) => {
      if (key === COL) return renderOrders();
      if (key === '*') { renderControls(); renderOrders(); }
      render();
    });
  });
})();
