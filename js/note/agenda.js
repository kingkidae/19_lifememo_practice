/* 01 · 일정 관리 — 월간 달력 + 일정 CRUD + 장소별 날씨 예보 */
(function () {
  'use strict';
  const { $, esc, icon, today, toISODate, parseDate, diffDays, fmtDate } = LM.util;
  const COL = 'schedules';
  const CAT = { personal: '개인', work: '업무', meet: '약속', anniv: '기념일', travel: '여행' };

  let viewMonth = (() => { const d = new Date(); return new Date(d.getFullYear(), d.getMonth(), 1); })();
  let selected = today();
  let placeField;

  const els = {};
  const sortEvents = (a, b) => (a.date + (a.start || '99')).localeCompare(b.date + (b.start || '99'));

  /* ---------- Calendar ---------- */
  function renderCalendar() {
    const events = LM.store.list(COL);
    const byDate = events.reduce((m, e) => ((m[e.date] = m[e.date] || []).push(e), m), {});
    const y = viewMonth.getFullYear();
    const m = viewMonth.getMonth();
    els.title.textContent = `${y}. ${String(m + 1).padStart(2, '0')}`;

    const firstDow = new Date(y, m, 1).getDay();
    const cells = Math.ceil((firstDow + new Date(y, m + 1, 0).getDate()) / 7) * 7;
    const start = new Date(y, m, 1 - firstDow);
    const t = today();
    let html = '';
    for (let i = 0; i < cells; i++) {
      const d = new Date(start); d.setDate(start.getDate() + i);
      const iso = toISODate(d);
      const list = byDate[iso] || [];
      const cls = ['cal-day', d.getMonth() !== m && 'is-other', d.getDay() === 0 && 'is-sun', iso === t && 'is-today', iso === selected && 'is-selected']
        .filter(Boolean).join(' ');
      const label = `${fmtDate(iso)}${list.length ? `, 일정 ${list.length}개` : ''}`;
      html += `<button type="button" class="${cls}" data-date="${iso}" aria-label="${label}" ${iso === selected ? 'aria-current="date"' : ''}>
        <span class="d">${d.getDate()}</span>
        <span class="dots">${list.slice(0, 3).map((e) => `<i class="cat-${esc(e.category)}"></i>`).join('')}</span>
      </button>`;
    }
    els.days.innerHTML = html;
  }

  /* ---------- Lists ---------- */
  function eventHTML(e, compact = false) {
    const time = e.start ? `${esc(e.start)}${e.end ? `<small>~ ${esc(e.end)}</small>` : ''}` : '<small>종일</small>';
    if (compact) {
      return `<li class="event cat-${esc(e.category)}" data-goto="${e.date}" tabindex="0">
        <div class="event-time">${fmtDate(e.date, { noYear: true, week: false })}<small>${e.start ? esc(e.start) : '종일'}</small></div>
        <div><h4>${esc(e.title)}</h4>${e.place ? `<p class="event-place">${icon('pin')}${esc(e.place)}</p>` : ''}</div>
      </li>`;
    }
    return `<li class="event cat-${esc(e.category)}">
      <div class="event-time">${time}</div>
      <div class="event-body">
        <div class="event-top"><span class="tag">${CAT[e.category] || '개인'}</span><h4>${esc(e.title)}</h4></div>
        ${e.place ? `<p class="event-place">${icon('pin')}${esc(e.place)}</p>` : ''}
        ${e.memo ? `<p class="event-memo">${esc(e.memo)}</p>` : ''}
        <div data-weather="${e.id}"></div>
      </div>
      <div class="item-actions">
        <button class="icon-btn" type="button" data-edit="${e.id}" aria-label="${esc(e.title)} 수정">${icon('edit')}</button>
        <button class="icon-btn icon-btn--danger" type="button" data-del="${e.id}" aria-label="${esc(e.title)} 삭제">${icon('trash')}</button>
      </div>
    </li>`;
  }

  function renderLists() {
    const all = LM.store.list(COL).sort(sortEvents);
    const day = all.filter((e) => e.date === selected);
    els.dayTitle.textContent = fmtDate(selected);
    els.dayList.innerHTML = day.length
      ? day.map((e) => eventHTML(e)).join('')
      : `<li class="empty"><strong>비어 있는 하루</strong>새 일정을 추가해 하루를 채워 보세요.</li>`;
    day.forEach(loadWeather);

    const t = today();
    const upcoming = all.filter((e) => e.date >= t && e.date !== selected).slice(0, 5);
    els.upcoming.innerHTML = upcoming.length
      ? upcoming.map((e) => eventHTML(e, true)).join('')
      : '<li class="muted" style="font-size:13.5px">다가오는 일정이 없어요.</li>';
  }

  /** 일정 장소의 날씨 예보 — Open-Meteo (오늘~16일 후) */
  async function loadWeather(e) {
    const box = document.querySelector(`[data-weather="${e.id}"]`);
    if (!box) return;
    if (!e.lat || !e.lon) return;
    const gap = diffDays(e.date, today());
    if (gap < 0) return;
    if (gap > 15) {
      box.innerHTML = `<p class="hint" style="margin-top:8px">날씨 예보는 일정 16일 전부터 볼 수 있어요.</p>`;
      return;
    }
    box.innerHTML = `<span class="event-weather"><span class="spinner"></span> 예보 확인 중</span>`;
    try {
      const f = await LM.api.forecastOn(e.lat, e.lon, e.date);
      if (!f) { box.innerHTML = ''; return; }
      const w = LM.weatherInfo(f.code);
      box.innerHTML = `<span class="event-weather">${icon(w.icon)}<strong>${w.label}</strong>
        ${Math.round(f.min)}° / ${Math.round(f.max)}°${f.pop != null ? ` · 강수 ${f.pop}%` : ''}</span>`;
    } catch (err) {
      box.innerHTML = `<p class="hint" style="margin-top:8px">날씨를 불러오지 못했어요.</p>`;
    }
  }

  function render() { renderCalendar(); renderLists(); }

  function select(iso, moveMonth = true) {
    selected = iso;
    if (moveMonth) { const d = parseDate(iso); viewMonth = new Date(d.getFullYear(), d.getMonth(), 1); }
    render();
  }

  /* ---------- Form (Create / Update) ---------- */
  function openForm(item) {
    const f = els.form;
    f.reset();
    f.elements.id.value = item?.id || '';
    f.elements.title.value = item?.title || '';
    f.elements.date.value = item?.date || selected;
    f.elements.start.value = item?.start || '';
    f.elements.end.value = item?.end || '';
    f.elements.category.value = item?.category || 'personal';
    f.elements.memo.value = item?.memo || '';
    placeField.set(item?.place || '', item?.lat || '', item?.lon || '');
    $('#event-dlg-title').textContent = item ? '일정 수정' : '새 일정';
    $('#event-delete').hidden = !item;
    LM.ui.openDialog(els.dlg);
    f.elements.title.focus();
  }

  function onSubmit(ev) {
    ev.preventDefault();
    const f = els.form;
    const title = f.elements.title.value.trim();
    const date = f.elements.date.value;
    if (!title) { f.elements.title.focus(); return LM.ui.toast('제목을 입력해 주세요.'); }
    if (!date) { f.elements.date.focus(); return LM.ui.toast('날짜를 선택해 주세요.'); }
    if (f.elements.start.value && f.elements.end.value && f.elements.end.value < f.elements.start.value) {
      return LM.ui.toast('종료 시간이 시작 시간보다 빨라요.');
    }
    const data = {
      title, date,
      start: f.elements.start.value,
      end: f.elements.end.value,
      category: f.elements.category.value,
      place: f.elements.place.value.trim(),
      lat: f.elements.lat.value ? +f.elements.lat.value : null,
      lon: f.elements.lon.value ? +f.elements.lon.value : null,
      memo: f.elements.memo.value.trim(),
    };
    const id = f.elements.id.value;
    if (id) LM.store.update(COL, id, data); else LM.store.create(COL, data);
    els.dlg.close();
    LM.ui.toast(id ? '일정을 수정했어요.' : '일정을 추가했어요.');
    select(date);
  }

  async function remove(id) {
    const e = LM.store.get(COL, id);
    if (!e) return;
    if (!(await LM.ui.confirm(`'${e.title}' 일정을 삭제할까요?`))) return;
    LM.store.remove(COL, id);
    els.dlg.open && els.dlg.close();
    LM.ui.toast('일정을 삭제했어요.');
  }

  /* ---------- Init ---------- */
  document.addEventListener('DOMContentLoaded', () => {
    Object.assign(els, {
      title: $('#cal-title'), days: $('#cal-days'), dayTitle: $('#agenda-day-title'),
      dayList: $('#agenda-day-list'), upcoming: $('#agenda-upcoming'),
      dlg: $('#dlg-event'), form: $('#event-form'),
    });
    placeField = LM.ui.bindPlaceField($('[data-place]', els.form));

    $('#cal-prev').addEventListener('click', () => { viewMonth.setMonth(viewMonth.getMonth() - 1); renderCalendar(); });
    $('#cal-next').addEventListener('click', () => { viewMonth.setMonth(viewMonth.getMonth() + 1); renderCalendar(); });
    $('#cal-today').addEventListener('click', () => select(today()));
    els.days.addEventListener('click', (e) => { const b = e.target.closest('[data-date]'); if (b) select(b.dataset.date); });
    els.days.addEventListener('dblclick', (e) => { const b = e.target.closest('[data-date]'); if (b) openForm(null); });

    document.querySelector('[data-action="new-event"]').addEventListener('click', () => openForm(null));
    els.form.addEventListener('submit', onSubmit);
    $('#event-delete').addEventListener('click', () => remove(els.form.elements.id.value));

    els.dayList.addEventListener('click', (e) => {
      const ed = e.target.closest('[data-edit]'); if (ed) return openForm(LM.store.get(COL, ed.dataset.edit));
      const del = e.target.closest('[data-del]'); if (del) remove(del.dataset.del);
    });
    const goto = (e) => { const li = e.target.closest('[data-goto]'); if (li) select(li.dataset.goto); };
    els.upcoming.addEventListener('click', goto);
    els.upcoming.addEventListener('keydown', (e) => { if (e.key === 'Enter') goto(e); });

    LM.store.onChange((k) => { if (k === COL || k === '*') render(); });
    render();
  });

  LM.note = LM.note || {};
  LM.note.agenda = { countToday: () => LM.store.list(COL).filter((e) => e.date === today()).length };
})();
