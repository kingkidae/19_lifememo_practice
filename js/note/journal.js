/* 03 · 일기장 — 날씨 · 장소 · 글씨체 · 글자 크기 */
(function () {
  'use strict';
  const { $, $$, esc, icon, today, parseDate, fmtDate, WEEK } = LM.util;
  const COL = 'diaries';
  const WEATHER = { sun: '맑음', 'cloud-sun': '구름 조금', cloud: '흐림', rain: '비', snow: '눈', wind: '바람' };
  const FONTS = {
    'noto-serif': '본명조', 'nanum-myeongjo': '나눔명조', 'gowun-batang': '고운바탕',
    'gowun-dodum': '고운돋움', 'pen-script': '나눔손글씨 펜', gaegu: '개구',
  };
  const els = {};
  let placeField;
  let query = '';

  /* ---------- List ---------- */
  function render() {
    const q = query.trim().toLowerCase();
    const list = LM.store.list(COL)
      .filter((d) => !q || [d.title, d.content, d.place].some((v) => (v || '').toLowerCase().includes(q)))
      .sort((a, b) => b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt));

    els.list.innerHTML = list.length
      ? list.map((d) => {
        const dt = parseDate(d.date);
        return `<article class="journal-card">
          <div class="jc-top">
            <div class="jc-date"><span class="display-num">${dt.getDate()}</span><span>${dt.getFullYear()}.${String(dt.getMonth() + 1).padStart(2, '0')} · ${WEEK[dt.getDay()]}</span></div>
            <span title="${WEATHER[d.weather] || ''}">${icon(d.weather || 'sun')}<span class="sr-only">${WEATHER[d.weather] || ''}</span></span>
          </div>
          <h3><button class="card-link" type="button" data-open="${d.id}">${esc(d.title || '제목 없는 하루')}</button></h3>
          <p class="jc-excerpt f-${esc(d.font || 'noto-serif')}">${esc(d.content)}</p>
          ${d.place ? `<p class="jc-place">${icon('pin')}${esc(d.place)}</p>` : ''}
        </article>`;
      }).join('')
      : `<div class="empty"><strong>${q ? '검색 결과가 없어요' : '첫 페이지를 기다리고 있어요'}</strong>${q ? '다른 단어로 찾아보세요.' : '오늘의 날씨와 기분을 적어 보세요.'}</div>`;
  }

  /* ---------- Read ---------- */
  function openView(id) {
    const d = LM.store.get(COL, id);
    if (!d) return;
    $('#jv-title').textContent = d.title || '제목 없는 하루';
    $('#jv-body').innerHTML = `
      <div class="journal-view-meta">
        <span>${icon('calendar')}${fmtDate(d.date)}</span>
        <span>${icon(d.weather || 'sun')}${WEATHER[d.weather] || '맑음'}</span>
        ${d.place ? `<span>${icon('pin')}${esc(d.place)}</span>` : ''}
        <span class="muted" style="margin-left:auto;font-size:12px">${FONTS[d.font] || ''} · ${d.size || 18}px</span>
      </div>
      <div class="journal-view-body f-${esc(d.font || 'noto-serif')}" style="font-size:${+d.size || 18}px">${esc(d.content)}</div>`;
    els.view.dataset.id = id;
    LM.ui.openDialog(els.view);
  }

  /* ---------- Form ---------- */
  function applyPaperStyle() {
    const f = els.form;
    const size = +f.elements.size.value;
    $('#journal-size-out').textContent = size;
    const paper = $('#journal-content');
    paper.className = `paper f-${f.elements.font.value}`;
    paper.style.fontSize = `${size}px`;
    paper.style.setProperty('--lh', `${Math.round(size * 1.9)}px`);
  }

  function openForm(d) {
    const f = els.form;
    f.reset();
    f.elements.id.value = d?.id || '';
    f.elements.date.value = d?.date || today();
    f.elements.title.value = d?.title || '';
    f.elements.content.value = d?.content || '';
    f.elements.font.value = d?.font || LM.store.read('pref.journalFont', 'noto-serif');
    f.elements.size.value = d?.size || LM.store.read('pref.journalSize', 18);
    const w = f.querySelector(`input[name="weather"][value="${d?.weather || 'sun'}"]`);
    if (w) w.checked = true;
    placeField.set(d?.place || '', d?.lat || '', d?.lon || '');
    applyPaperStyle();
    $('#journal-dlg-title').textContent = d ? '일기 수정' : '오늘의 일기';
    $('#journal-delete').hidden = !d;
    LM.ui.openDialog(els.dlg);
    f.elements.content.focus();
  }

  function onSubmit(e) {
    e.preventDefault();
    const f = els.form;
    const content = f.elements.content.value.trim();
    if (!f.elements.date.value) return LM.ui.toast('날짜를 선택해 주세요.');
    if (!content) { f.elements.content.focus(); return LM.ui.toast('내용을 적어 주세요.'); }
    const data = {
      date: f.elements.date.value,
      title: f.elements.title.value.trim(),
      content,
      weather: f.elements.weather.value,
      place: f.elements.place.value.trim(),
      lat: f.elements.lat.value ? +f.elements.lat.value : null,
      lon: f.elements.lon.value ? +f.elements.lon.value : null,
      font: f.elements.font.value,
      size: +f.elements.size.value,
    };
    // 마지막으로 고른 글씨체와 크기는 다음 일기의 기본값으로 기억
    LM.store.write('pref.journalFont', data.font);
    LM.store.write('pref.journalSize', data.size);
    const id = f.elements.id.value;
    if (id) LM.store.update(COL, id, data); else LM.store.create(COL, data);
    els.dlg.close();
    LM.ui.toast(id ? '일기를 고쳤어요.' : '오늘의 일기를 저장했어요.');
  }

  async function remove(id) {
    const d = LM.store.get(COL, id);
    if (!d || !(await LM.ui.confirm(`${fmtDate(d.date, { week: false })} 일기를 삭제할까요?`))) return;
    LM.store.remove(COL, id);
    [els.dlg, els.view].forEach((x) => x.open && x.close());
    LM.ui.toast('일기를 삭제했어요.');
  }

  /** 지금 날씨 불러오기 — 장소 좌표(없으면 현재 위치)로 Open-Meteo 현재 날씨 조회 */
  async function autoWeather(btn) {
    const f = els.form;
    btn.disabled = true;
    try {
      let lat = f.elements.lat.value;
      let lon = f.elements.lon.value;
      if (!lat) ({ lat, lon } = await LM.api.currentPosition());
      const d = await LM.api.fetchJSON(
        `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=weather_code,wind_speed_10m,is_day&timezone=auto`,
        { cacheMin: 10 }
      );
      let { icon: ic, label } = LM.weatherInfo(d.current.weather_code, 1);
      if (d.current.wind_speed_10m >= 30) ic = 'wind';
      const map = { sun: 'sun', 'cloud-sun': 'cloud-sun', cloud: 'cloud', fog: 'cloud', drizzle: 'rain', rain: 'rain', storm: 'rain', snow: 'snow', wind: 'wind' };
      f.querySelector(`input[name="weather"][value="${map[ic] || 'sun'}"]`).checked = true;
      LM.ui.toast(`지금 날씨는 '${label}'이에요.`);
    } catch (err) {
      LM.ui.toast('날씨를 불러오지 못했어요. 직접 선택해 주세요.');
    } finally {
      btn.disabled = false;
    }
  }

  document.addEventListener('DOMContentLoaded', () => {
    Object.assign(els, { list: $('#journal-list'), dlg: $('#dlg-journal'), form: $('#journal-form'), view: $('#dlg-journal-view') });
    placeField = LM.ui.bindPlaceField($('[data-place]', els.form));

    $('[data-action="new-journal"]').addEventListener('click', () => openForm(null));
    $('#journal-search').addEventListener('input', LM.util.debounce((e) => { query = e.target.value; render(); }, 150));
    els.list.addEventListener('click', (e) => { const b = e.target.closest('[data-open]'); if (b) openView(b.dataset.open); });

    els.form.addEventListener('submit', onSubmit);
    $$('#journal-font, #journal-size').forEach((x) => x.addEventListener('input', applyPaperStyle));
    $('#journal-delete').addEventListener('click', () => remove(els.form.elements.id.value));
    $('#journal-weather-auto').addEventListener('click', (e) => autoWeather(e.currentTarget));

    $('#jv-edit').addEventListener('click', () => { const d = LM.store.get(COL, els.view.dataset.id); els.view.close(); openForm(d); });
    $('#jv-delete').addEventListener('click', () => remove(els.view.dataset.id));

    LM.store.onChange((k) => { if (k === COL || k === '*') render(); });
    render();
  });
})();
