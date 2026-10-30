/* 04 · 독서 기록장 — 별점 · 한줄평 · 읽은 날짜 · 장르 */
(function () {
  'use strict';
  const { $, $$, esc, icon, today, fmtDate, fmtNum } = LM.util;
  const COL = 'books';
  // 표지 이미지가 없을 때 쓰는 장르별 표지 색
  const COVER = ['#5b3a29', '#1c1714', '#f37021', '#7a5c3e', '#3f4a3a', '#8c2f1f', '#b8862f', '#2d3a4a'];
  const coverColor = (genre) => COVER[Math.max(0, LM.GENRES.findIndex((g) => g.id === genre)) % COVER.length];
  const state = { status: 'all', genre: '', sort: 'recent' };
  const els = {};

  const stars = (n) =>
    `<span class="stars" aria-label="별점 ${n}점">${[1, 2, 3, 4, 5].map((i) => icon('star', i <= n ? '' : 'off')).join('')}</span>`;

  function renderStats(all) {
    const read = all.filter((b) => b.status === 'read');
    const year = String(new Date().getFullYear());
    const rated = read.filter((b) => b.rating);
    const avg = rated.length ? rated.reduce((s, b) => s + +b.rating, 0) / rated.length : 0;
    els.stats.innerHTML = `
      <div><dt>읽은 책</dt><dd>${read.length}<small>권</small></dd></div>
      <div><dt>올해 읽은 책</dt><dd>${read.filter((b) => (b.readDate || '').startsWith(year)).length}<small>권</small></dd></div>
      <div><dt>평균 별점</dt><dd>${avg ? fmtNum(avg, 1) : '–'}<small>/ 5</small></dd></div>
      <div><dt>읽고 싶은 책</dt><dd>${all.length - read.length}<small>권</small></dd></div>`;
  }

  function render() {
    const all = LM.store.list(COL);
    renderStats(all);
    const sorters = {
      recent: (a, b) => (b.readDate || b.createdAt).localeCompare(a.readDate || a.createdAt),
      rating: (a, b) => (b.rating || 0) - (a.rating || 0),
      title: (a, b) => a.title.localeCompare(b.title, 'ko'),
    };
    const list = all
      .filter((b) => state.status === 'all' || b.status === state.status)
      .filter((b) => !state.genre || b.genre === state.genre)
      .sort(sorters[state.sort]);

    els.list.innerHTML = list.length
      ? list.map((b) => {
        const cover = b.coverId
          ? `<img src="https://covers.openlibrary.org/b/id/${encodeURIComponent(b.coverId)}-M.jpg" alt="${esc(b.title)} 표지" loading="lazy" width="96" height="144">`
          : `<span>${esc(b.title)}</span>`;
        return `<li class="book-card">
          <div class="book-cover" style="--g:${coverColor(b.genre)}">${cover}</div>
          <div class="book-info">
            <div class="tags"><span class="tag">${esc(LM.genre(b.genre).ko)}</span>${b.status === 'wish' ? '<span class="tag tag--orange">읽고 싶은 책</span>' : ''}</div>
            <h3>${esc(b.title)}</h3>
            ${b.author ? `<p class="author">${esc(b.author)}</p>` : ''}
            ${b.status === 'read' && b.rating ? stars(+b.rating) : ''}
            ${b.review ? `<blockquote>${esc(b.review)}</blockquote>` : ''}
            ${b.status === 'read' && b.readDate ? `<p class="read-date">${fmtDate(b.readDate, { week: false })}에 읽음</p>` : ''}
            ${b.status === 'wish' ? `<p class="read-date"><button class="link-arrow" type="button" data-finish="${b.id}" style="background:none;border-width:0 0 1px">다 읽었어요 ${icon('check')}</button></p>` : ''}
          </div>
          <div class="item-actions">
            <button class="icon-btn" type="button" data-edit="${b.id}" aria-label="${esc(b.title)} 수정">${icon('edit')}</button>
            <button class="icon-btn icon-btn--danger" type="button" data-del="${b.id}" aria-label="${esc(b.title)} 삭제">${icon('trash')}</button>
          </div>
        </li>`;
      }).join('')
      : `<li class="empty"><strong>책장이 비어 있어요</strong>읽은 책을 기록하거나, <a class="link-arrow" href="discover.html#books">추천 도서</a>에서 담아 보세요.</li>`;

    // 선택한 장르로 추천 페이지 바로가기
    els.recLink.href = `discover.html${state.genre ? `?genre=${state.genre}` : ''}#books`;
  }

  /* ---------- Form ---------- */
  function syncStatus() {
    const isRead = els.form.elements.status.value === 'read';
    $$('[data-read-only]', els.form).forEach((x) => (x.hidden = !isRead));
  }

  function openForm(b, asRead = false) {
    const f = els.form;
    f.reset();
    ['id', 'title', 'author', 'review', 'coverId', 'olKey'].forEach((k) => (f.elements[k].value = b?.[k] || ''));
    f.elements.genre.value = b?.genre || state.genre || 'fiction';
    f.querySelector(`input[name="status"][value="${asRead ? 'read' : b?.status || 'read'}"]`).checked = true;
    f.querySelector(`input[name="rating"][value="${b?.rating || 4}"]`).checked = true;
    f.elements.readDate.value = b?.readDate || today();
    syncStatus();
    $('#book-dlg-title').textContent = b ? '독서 기록 수정' : '책 기록하기';
    $('#book-delete').hidden = !b;
    LM.ui.openDialog(els.dlg);
    f.elements.title.focus();
  }

  function onSubmit(e) {
    e.preventDefault();
    const f = els.form;
    const title = f.elements.title.value.trim();
    if (!title) { f.elements.title.focus(); return LM.ui.toast('책 제목을 입력해 주세요.'); }
    const status = f.elements.status.value;
    const data = {
      title,
      author: f.elements.author.value.trim(),
      genre: f.elements.genre.value,
      status,
      rating: status === 'read' ? +f.elements.rating.value : null,
      readDate: status === 'read' ? f.elements.readDate.value : '',
      review: f.elements.review.value.trim(),
      coverId: f.elements.coverId.value,
      olKey: f.elements.olKey.value,
    };
    const id = f.elements.id.value;
    if (id) LM.store.update(COL, id, data); else LM.store.create(COL, data);
    els.dlg.close();
    LM.ui.toast(id ? '독서 기록을 수정했어요.' : '책장에 꽂았어요.');
  }

  async function remove(id) {
    const b = LM.store.get(COL, id);
    if (!b || !(await LM.ui.confirm(`'${b.title}' 기록을 삭제할까요?`))) return;
    LM.store.remove(COL, id);
    els.dlg.open && els.dlg.close();
    LM.ui.toast('독서 기록을 삭제했어요.');
  }

  document.addEventListener('DOMContentLoaded', () => {
    Object.assign(els, {
      stats: $('#library-stats'), list: $('#book-list'), dlg: $('#dlg-book'), form: $('#book-form'), recLink: $('#book-recommend-link'),
    });
    const opts = LM.GENRES.map((g) => `<option value="${g.id}">${g.ko}</option>`).join('');
    $('#book-genre').insertAdjacentHTML('beforeend', opts);
    $('#book-form-genre').innerHTML = opts + '<option value="etc">기타</option>';

    $('[data-action="new-book"]').addEventListener('click', () => openForm(null));
    $('#book-status').addEventListener('click', (e) => {
      const b = e.target.closest('[data-status]');
      if (!b) return;
      state.status = b.dataset.status;
      $$('#book-status button').forEach((x) => x.setAttribute('aria-pressed', x === b));
      render();
    });
    $('#book-genre').addEventListener('change', (e) => { state.genre = e.target.value; render(); });
    $('#book-sort').addEventListener('change', (e) => { state.sort = e.target.value; render(); });

    els.list.addEventListener('click', (e) => {
      const ed = e.target.closest('[data-edit]'); if (ed) return openForm(LM.store.get(COL, ed.dataset.edit));
      const del = e.target.closest('[data-del]'); if (del) return remove(del.dataset.del);
      const fin = e.target.closest('[data-finish]'); if (fin) openForm(LM.store.get(COL, fin.dataset.finish), true);
    });
    els.form.addEventListener('submit', onSubmit);
    els.form.addEventListener('change', (e) => { if (e.target.name === 'status') syncStatus(); });
    $('#book-delete').addEventListener('click', () => remove(els.form.elements.id.value));

    LM.store.onChange((k) => { if (k === COL || k === '*') render(); });
    render();
  });
})();
