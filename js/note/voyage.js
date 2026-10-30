/* 05 · 여행 버킷리스트 — 나라 · 메모 · 우선순위 · 다녀온 여부
   다녀온 나라(visitedCountries)와 도시(visitedCities)는 발견 페이지의 세계 지도와 공유합니다. */
(function () {
  'use strict';
  const { $, $$, esc, icon } = LM.util;
  const COL = 'trips';
  const PRIO = { 1: '1순위', 2: '2순위', 3: '3순위' };
  let filter = 'all';
  const els = {};

  const countryByName = (name) => {
    const q = name.trim().toLowerCase();
    return (window.LM_COUNTRIES || []).find((c) => c.ko.toLowerCase() === q || c.en.toLowerCase() === q) || null;
  };

  function renderStats(trips, visited, cities) {
    const total = (window.LM_COUNTRIES || []).length || 1;
    const doneTrips = trips.filter((t) => visited.has(t.code)).length;
    els.stats.innerHTML = `
      <div><dt>다녀온 나라</dt><dd>${visited.size}<small>/ ${total}</small></dd></div>
      <div><dt>다녀온 도시</dt><dd>${cities.length}<small>곳</small></dd></div>
      <div><dt>버킷리스트</dt><dd>${trips.length}<small>곳</small></dd></div>
      <div><dt>달성률</dt><dd>${trips.length ? Math.round((doneTrips / trips.length) * 100) : 0}<small>%</small></dd></div>`;
  }

  function render() {
    const trips = LM.store.list(COL);
    const visited = LM.travel.visited();
    const cities = LM.store.list('visitedCities');
    renderStats(trips, visited, cities);

    const list = trips
      .map((t) => ({ ...t, visited: visited.has(t.code) }))
      .filter((t) => filter === 'all' || (filter === 'done' ? t.visited : !t.visited))
      .sort((a, b) => (a.visited - b.visited) || (a.priority - b.priority) || (a.period || '9').localeCompare(b.period || '9'));

    els.list.innerHTML = list.length
      ? list.map((t) => {
        const c = LM.travel.country(t.code);
        const period = t.period ? `${t.period.slice(0, 4)}년 ${+t.period.slice(5)}월 계획` : '';
        return `<li class="trip-item ${t.visited ? 'is-visited' : ''}" data-id="${t.id}">
          <img class="trip-flag" src="${LM.travel.flag(t.code, 80)}" alt="${esc(c?.ko || t.name)} 국기" width="44" height="32" loading="lazy">
          <div class="trip-main">
            <h3>${esc(c?.ko || t.name)} <small>${esc(c?.continent || '')}</small></h3>
            ${t.memo ? `<p class="trip-memo">${esc(t.memo)}</p>` : ''}
            <div class="trip-meta"><span class="prio prio-${t.priority}">${PRIO[t.priority]}</span>${period ? `<span>${period}</span>` : ''}</div>
          </div>
          <label class="switch"><input type="checkbox" data-visit ${t.visited ? 'checked' : ''}>다녀왔어요</label>
          <div class="item-actions">
            <button class="icon-btn" type="button" data-edit aria-label="수정">${icon('edit')}</button>
            <button class="icon-btn icon-btn--danger" type="button" data-del aria-label="삭제">${icon('trash')}</button>
          </div>
        </li>`;
      }).join('')
      : `<li class="empty"><strong>${filter === 'done' ? '아직 다녀온 곳이 없어요' : '어디로 떠나고 싶나요?'}</strong>가고 싶은 나라를 버킷리스트에 담아 보세요.</li>`;

    els.cities.innerHTML = cities.length
      ? cities.sort((a, b) => a.name.localeCompare(b.name, 'ko')).map((c) => `
        <li class="city-chip">${c.code ? `<img src="${LM.travel.flag(c.code, 20)}" alt="" width="18" height="13" loading="lazy">` : ''}${esc(c.name)}
          <button class="icon-btn" type="button" data-city="${c.id}" aria-label="${esc(c.name)} 삭제">${icon('close')}</button></li>`).join('')
      : `<li class="muted" style="font-size:13.5px">발견 페이지의 지도를 확대해 다녀온 도시를 눌러 보세요.</li>`;
  }

  /* ---------- Form ---------- */
  function openForm(t) {
    const f = els.form;
    f.reset();
    f.elements.id.value = t?.id || '';
    f.elements.country.value = t ? LM.travel.country(t.code)?.ko || t.name : '';
    f.elements.priority.value = t?.priority || 2;
    f.elements.period.value = t?.period || '';
    f.elements.memo.value = t?.memo || '';
    f.elements.visited.checked = t ? LM.travel.isVisited(t.code) : false;
    $('#trip-dlg-title').textContent = t ? '버킷리스트 수정' : '버킷리스트 추가';
    $('#trip-delete').hidden = !t;
    LM.ui.openDialog(els.dlg);
    f.elements.country.focus();
  }

  function onSubmit(e) {
    e.preventDefault();
    const f = els.form;
    const c = countryByName(f.elements.country.value);
    if (!c) { f.elements.country.focus(); return LM.ui.toast('목록에 있는 나라 이름을 골라 주세요.'); }
    const id = f.elements.id.value;
    const dup = LM.store.list(COL).find((t) => t.code === c.code && t.id !== id);
    if (dup) return LM.ui.toast(`${c.ko}은(는) 이미 버킷리스트에 있어요.`);
    const data = { code: c.code, name: c.ko, priority: +f.elements.priority.value, period: f.elements.period.value, memo: f.elements.memo.value.trim() };
    if (id) LM.store.update(COL, id, data); else LM.store.create(COL, data);
    LM.travel.setVisited(c.code, f.elements.visited.checked);
    els.dlg.close();
    LM.ui.toast(id ? '버킷리스트를 수정했어요.' : `${c.ko}을(를) 버킷리스트에 담았어요.`);
  }

  async function remove(id) {
    const t = LM.store.get(COL, id);
    if (!t || !(await LM.ui.confirm(`'${t.name}'을(를) 버킷리스트에서 뺄까요?`))) return;
    LM.store.remove(COL, id);
    els.dlg.open && els.dlg.close();
    LM.ui.toast('버킷리스트에서 뺐어요. 지도의 방문 기록은 그대로예요.');
  }

  document.addEventListener('DOMContentLoaded', () => {
    Object.assign(els, { stats: $('#voyage-stats'), list: $('#trip-list'), cities: $('#city-list'), dlg: $('#dlg-trip'), form: $('#trip-form') });
    $('#country-options').innerHTML = (window.LM_COUNTRIES || []).map((c) => `<option value="${esc(c.ko)}">${esc(c.en)}</option>`).join('');

    $('[data-action="new-trip"]').addEventListener('click', () => openForm(null));
    $('#trip-filter').addEventListener('click', (e) => {
      const b = e.target.closest('[data-filter]');
      if (!b) return;
      filter = b.dataset.filter;
      $$('#trip-filter button').forEach((x) => x.setAttribute('aria-pressed', x === b));
      render();
    });
    els.list.addEventListener('change', (e) => {
      if (!e.target.matches('[data-visit]')) return;
      const t = LM.store.get(COL, e.target.closest('[data-id]').dataset.id);
      LM.travel.setVisited(t.code, e.target.checked);
      if (e.target.checked) LM.ui.toast(`${t.name}, 다녀오셨군요!`);
    });
    els.list.addEventListener('click', (e) => {
      const li = e.target.closest('[data-id]');
      if (!li) return;
      if (e.target.closest('[data-edit]')) openForm(LM.store.get(COL, li.dataset.id));
      if (e.target.closest('[data-del]')) remove(li.dataset.id);
    });
    els.cities.addEventListener('click', (e) => {
      const b = e.target.closest('[data-city]');
      if (b) LM.store.remove('visitedCities', b.dataset.city);
    });
    els.form.addEventListener('submit', onSubmit);
    $('#trip-delete').addEventListener('click', () => remove(els.form.elements.id.value));

    LM.store.onChange((k) => { if ([COL, 'visitedCountries', 'visitedCities', '*'].includes(k)) render(); });
    render();
  });
})();
