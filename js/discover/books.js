/* 발견 02 · 장르별 도서 추천 — Open Library Search API */
(function () {
  'use strict';
  const { $, esc, icon, fmtNum } = LM.util;
  const LIMIT = 12;
  const FIELDS = 'key,title,author_name,first_publish_year,cover_i,ratings_average,ratings_count';
  const COVER = ['#5b3a29', '#1c1714', '#f37021', '#7a5c3e', '#3f4a3a', '#8c2f1f', '#b8862f', '#2d3a4a'];

  const state = { genre: 'fiction', page: 1, ko: true, fellBack: false, items: [], total: 0, loading: false };
  const els = {};

  const coverURL = (id, size = 'M') => `https://covers.openlibrary.org/b/id/${id}-${size}.jpg`;
  const coverColor = (i) => COVER[i % COVER.length];
  const inLibrary = (key) => LM.store.list('books').some((b) => b.olKey === key);
  const stars = (avg) => {
    const n = Math.round(avg);
    return `<span class="stars" aria-label="평점 ${fmtNum(avg, 1)}">${[1, 2, 3, 4, 5].map((i) => icon('star', i <= n ? '' : 'off')).join('')}</span>`;
  };

  function coverHTML(b, i, size = 'M') {
    return `<div class="rec-cover" style="--g:${coverColor(i)}">
      ${b.cover_i
        ? `<img src="${coverURL(b.cover_i, size)}" alt="${esc(b.title)} 표지" loading="lazy" width="200" height="300">`
        : `<div class="fallback"><small>${esc(LM.genre(state.genre).ko)}</small><strong>${esc(b.title)}</strong><small>${esc(b.author_name?.[0] || '')}</small></div>`}
    </div>`;
  }

  function cardHTML(b, i) {
    const saved = inLibrary(b.key);
    return `<li class="rec-card">
      ${coverHTML(b, i)}
      <div class="rec-info">
        <h3>${esc(b.title)}</h3>
        <p class="author">${esc((b.author_name || ['작자 미상']).slice(0, 2).join(', '))}</p>
        <p class="meta">${b.first_publish_year ? `${b.first_publish_year}년` : ''}${b.ratings_average ? ` ${stars(b.ratings_average)} ${fmtNum(b.ratings_average, 1)}` : ''}</p>
      </div>
      <div class="rec-actions">
        <button class="btn btn--ghost btn--sm" type="button" data-detail="${i}">자세히</button>
        <button class="btn btn--sm ${saved ? '' : 'btn--primary'}" type="button" data-save="${i}" ${saved ? 'disabled' : ''}>${saved ? '서재에 있음' : '서재에 담기'}</button>
      </div>
    </li>`;
  }

  function skeletonHTML(n = 6) {
    return Array.from({ length: n }, () => `<li class="rec-card rec-skeleton" aria-hidden="true">
      <div class="rec-cover skeleton"></div><div class="skeleton" style="height:16px;width:80%"></div><div class="skeleton" style="height:12px;width:50%"></div></li>`).join('');
  }

  function renderChips() {
    els.chips.innerHTML = LM.GENRES.map((g) =>
      `<button type="button" class="chip" data-genre="${g.id}" aria-pressed="${g.id === state.genre}">${g.ko}</button>`).join('');
  }

  function renderInfo() {
    const g = LM.genre(state.genre).ko;
    els.info.textContent = state.loading
      ? `'${g}' 추천 도서를 찾는 중…`
      : state.items.length
        ? `${g} · ${fmtNum(state.total)}권 중 평점 높은 순 ${state.items.length}권${state.fellBack ? ' · 한국어판 도서가 적어 전체 도서로 보여드려요' : ''}`
        : '';
  }

  async function fetchPage(page, ko) {
    const g = LM.genre(state.genre);
    const url = `https://openlibrary.org/search.json?q=${encodeURIComponent(g.q)}${ko ? '&language=kor' : ''}` +
      `&sort=rating&limit=${LIMIT}&page=${page}&fields=${FIELDS}`;
    return LM.api.fetchJSON(url, { cacheMin: 60, timeout: 15000 });
  }

  async function load(reset = true) {
    if (state.loading) return;
    state.loading = true;
    if (reset) {
      state.page = 1;
      state.items = [];
      state.fellBack = false;
      els.grid.innerHTML = skeletonHTML();
    } else {
      els.grid.insertAdjacentHTML('beforeend', skeletonHTML(4));
    }
    els.more.hidden = true;
    renderInfo();
    try {
      const ko = state.ko && !state.fellBack;
      let d = await fetchPage(state.page, ko);
      // 한국어판 도서가 너무 적으면 전체 도서로 자동 전환
      if (reset && ko && d.numFound < 6) {
        state.fellBack = true;
        d = await fetchPage(state.page, false);
      }
      state.total = d.numFound;
      state.items.push(...d.docs);
      els.grid.innerHTML = state.items.length
        ? state.items.map(cardHTML).join('')
        : `<li class="empty" style="grid-column:1/-1"><strong>추천할 책을 찾지 못했어요</strong>다른 장르를 골라 보세요.</li>`;
      els.more.hidden = state.items.length >= state.total;
    } catch (e) {
      els.grid.innerHTML = `<li class="error-box" style="grid-column:1/-1"><p class="serif">도서 정보를 불러오지 못했어요.</p>
        <button class="btn btn--sm" type="button" data-retry>${icon('refresh')}다시 시도</button></li>`;
    } finally {
      state.loading = false;
      renderInfo();
    }
  }

  function save(b, btn) {
    if (inLibrary(b.key)) return LM.ui.toast('이미 서재에 있는 책이에요.');
    LM.store.create('books', {
      title: b.title,
      author: (b.author_name || []).slice(0, 2).join(', '),
      genre: state.genre,
      status: 'wish',
      rating: null,
      readDate: '',
      review: '',
      coverId: b.cover_i ? String(b.cover_i) : '',
      olKey: b.key,
    });
    if (btn) { btn.disabled = true; btn.classList.remove('btn--primary'); btn.textContent = '서재에 있음'; }
    LM.ui.toast(`'${b.title}'을(를) 읽고 싶은 책으로 담았어요.`);
  }

  /** 상세 — Works API로 줄거리와 주제 불러오기 */
  async function openDetail(i) {
    const b = state.items[i];
    els.dlg.dataset.i = i;
    $('#rec-title').textContent = b.title;
    $('#rec-link').href = `https://openlibrary.org${b.key}`;
    const saveBtn = $('#rec-save');
    saveBtn.disabled = inLibrary(b.key);
    saveBtn.lastChild.textContent = saveBtn.disabled ? '서재에 있음' : '서재에 담기';
    els.body.innerHTML = `<div class="rec-detail">${coverHTML(b, i, 'L')}
      <div><h3>${esc(b.title)}</h3><p class="author">${esc((b.author_name || ['작자 미상']).join(', '))}${b.first_publish_year ? ` · ${b.first_publish_year}년 첫 출간` : ''}</p>
      ${b.ratings_average ? `<p class="meta muted" style="margin-top:6px">${stars(b.ratings_average)} ${fmtNum(b.ratings_average, 1)} (${fmtNum(b.ratings_count)}명 평가)</p>` : ''}
      <div class="desc" data-desc><span class="spinner"></span> 책 소개를 불러오는 중…</div><div class="subjects" data-subjects></div></div></div>`;
    LM.ui.openDialog(els.dlg);
    try {
      const w = await LM.api.fetchJSON(`https://openlibrary.org${b.key}.json`, { cacheMin: 1440 });
      const desc = typeof w.description === 'string' ? w.description : w.description?.value;
      $('[data-desc]', els.body).textContent = desc
        ? desc.replace(/\[([^\]]+)\]\([^)]+\)/g, '$1').split(/\n-{3,}|\n\*{3,}/)[0].trim()
        : 'Open Library에 등록된 책 소개가 없어요.';
      $('[data-subjects]', els.body).innerHTML = (w.subjects || []).slice(0, 8).map((s) => `<span class="tag">${esc(s)}</span>`).join('');
    } catch (e) {
      $('[data-desc]', els.body).textContent = '책 소개를 불러오지 못했어요.';
    }
  }

  document.addEventListener('DOMContentLoaded', () => {
    Object.assign(els, {
      chips: $('#genre-chips'), grid: $('#rec-grid'), more: $('#rec-more'), info: $('#book-result-info'),
      dlg: $('#dlg-rec'), body: $('#rec-body'),
    });
    const fromURL = new URLSearchParams(location.search).get('genre');
    const saved = LM.store.read('pref.bookGenre', null);
    state.genre = [fromURL, saved].find((g) => LM.GENRES.some((x) => x.id === g)) || 'fiction';

    renderChips();
    els.chips.addEventListener('click', (e) => {
      const b = e.target.closest('[data-genre]');
      if (!b || b.dataset.genre === state.genre) return;
      state.genre = b.dataset.genre;
      LM.store.write('pref.bookGenre', state.genre);
      renderChips();
      load();
    });
    $('#book-ko').addEventListener('change', (e) => { state.ko = e.target.checked; load(); });
    els.more.addEventListener('click', () => { state.page++; load(false); });
    els.grid.addEventListener('click', (e) => {
      const d = e.target.closest('[data-detail]'); if (d) return openDetail(+d.dataset.detail);
      const s = e.target.closest('[data-save]'); if (s) return save(state.items[+s.dataset.save], s);
      if (e.target.closest('[data-retry]')) load();
    });
    $('#rec-save').addEventListener('click', (e) => {
      const i = +els.dlg.dataset.i;
      save(state.items[i], els.grid.querySelector(`[data-save="${i}"]`));
      e.currentTarget.disabled = true;
      e.currentTarget.lastChild.textContent = '서재에 있음';
    });

    // 화면에 가까워졌을 때 처음 불러오기 (첫 화면 속도 개선)
    const io = new IntersectionObserver((entries) => {
      if (entries.some((x) => x.isIntersecting)) { io.disconnect(); load(); }
    }, { rootMargin: '400px' });
    io.observe($('#books'));
    if (location.hash === '#books') { io.disconnect(); load(); }
  });
})();
