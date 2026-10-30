/* 발견 01 · 오늘의 날씨 — Open-Meteo 예보 + 대기질 API, 일정별 날씨 */
(function () {
  'use strict';
  const { $, esc, icon, today, diffDays, parseDate, WEEK } = LM.util;
  const DEFAULT = { name: '서울', lat: 37.57, lon: 126.98 };
  let current = null;
  let root;

  // 환경부 미세먼지 예보 등급
  const grade = (v, [a, b, c]) =>
    v == null ? ['–', 'g-normal'] : v <= a ? ['좋음', 'g-good'] : v <= b ? ['보통', 'g-normal'] : v <= c ? ['나쁨', 'g-bad'] : ['매우 나쁨', 'g-worst'];
  const deg = (v) => `${Math.round(v)}°`;
  const hhmm = (iso) => iso.slice(11, 16);

  function skeleton() {
    root.setAttribute('aria-busy', 'true');
    root.innerHTML = `
      <article class="w-now card"><div class="skeleton" style="min-height:360px"></div></article>
      <div class="w-side"><div class="w-hourly card"><div class="skeleton" style="height:140px"></div></div>
      <div class="w-week card"><div class="skeleton" style="height:260px"></div></div></div>`;
  }

  async function load(place) {
    current = place;
    skeleton();
    const q = `latitude=${place.lat}&longitude=${place.lon}&timezone=auto`;
    const [w, air] = await Promise.allSettled([
      LM.api.fetchJSON(
        `https://api.open-meteo.com/v1/forecast?${q}&wind_speed_unit=ms&forecast_days=7` +
          '&current=temperature_2m,apparent_temperature,relative_humidity_2m,is_day,weather_code,wind_speed_10m' +
          '&hourly=temperature_2m,weather_code,precipitation_probability,is_day' +
          '&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max,sunrise,sunset,uv_index_max',
        { cacheMin: 10 }
      ),
      LM.api.fetchJSON(`https://air-quality-api.open-meteo.com/v1/air-quality?${q}&current=pm10,pm2_5`, { cacheMin: 30 }),
    ]);
    root.setAttribute('aria-busy', 'false');
    if (w.status !== 'fulfilled') {
      root.innerHTML = `<div class="error-box" style="grid-column:1/-1"><p class="serif">날씨 정보를 불러오지 못했어요.</p>
        <button class="btn btn--sm" type="button" data-retry>${icon('refresh')}다시 시도</button></div>`;
      return;
    }
    render(w.value, air.status === 'fulfilled' ? air.value : null, place);
    LM.store.write('pref.weatherPlace', place);
    renderSchedules();
  }

  function render(d, air, place) {
    const c = d.current;
    const day = d.daily;
    const info = LM.weatherInfo(c.weather_code, c.is_day);
    const [pm10, pm10c] = grade(air?.current?.pm10, [30, 80, 150]);
    const [pm25, pm25c] = grade(air?.current?.pm2_5, [15, 35, 75]);

    // 시간별: 현재 시각부터 24시간
    const nowKey = c.time.slice(0, 13);
    const start = Math.max(0, d.hourly.time.findIndex((t) => t.startsWith(nowKey)));
    const hours = d.hourly.time.slice(start, start + 24).map((t, k) => {
      const i = start + k;
      const wi = LM.weatherInfo(d.hourly.weather_code[i], d.hourly.is_day[i]);
      return `<li class="${k === 0 ? 'is-now' : ''}">
        <span>${k === 0 ? '지금' : `${+t.slice(11, 13)}시`}</span>${icon(wi.icon)}<span class="sr-only">${wi.label}</span>
        <b>${deg(d.hourly.temperature_2m[i])}</b><small>${d.hourly.precipitation_probability[i] ?? 0}%</small></li>`;
    }).join('');

    // 주간: 최저~최고 막대
    const lo = Math.min(...day.temperature_2m_min);
    const hi = Math.max(...day.temperature_2m_max);
    const span = Math.max(1, hi - lo);
    const week = day.time.map((t, i) => {
      const wi = LM.weatherInfo(day.weather_code[i]);
      const dt = parseDate(t);
      const name = i === 0 ? '오늘' : i === 1 ? '내일' : `${WEEK[dt.getDay()]}요일`;
      const left = ((day.temperature_2m_min[i] - lo) / span) * 100;
      const width = ((day.temperature_2m_max[i] - day.temperature_2m_min[i]) / span) * 100;
      return `<li>
        <span class="day">${name}<small>${dt.getMonth() + 1}/${dt.getDate()}</small></span>
        <span title="${wi.label}">${icon(wi.icon)}<span class="sr-only">${wi.label}</span></span>
        <span class="pop">${day.precipitation_probability_max[i] ?? 0}%</span>
        <span class="lo">${deg(day.temperature_2m_min[i])}</span>
        <span class="range" aria-hidden="true"><i style="left:${left}%;width:${Math.max(4, width)}%"></i></span>
        <span class="hi">${deg(day.temperature_2m_max[i])}</span>
      </li>`;
    }).join('');

    root.innerHTML = `
      <article class="w-now card">
        <p class="wn-place">${icon('pin')}${esc(place.name)}<small>${hhmm(c.time)} 기준</small></p>
        <div class="wn-main">
          ${icon(info.icon, 'wn-icon')}
          <div>
            <p class="wn-temp">${Math.round(c.temperature_2m)}<sup>°C</sup></p>
            <p class="wn-label">${info.label} · 체감 ${deg(c.apparent_temperature)}</p>
            <p class="wn-range">최고 ${deg(day.temperature_2m_max[0])} · 최저 ${deg(day.temperature_2m_min[0])}</p>
          </div>
        </div>
        <dl class="wn-grid">
          <div><dt>${icon('drop')}습도</dt><dd>${c.relative_humidity_2m}<small>%</small></dd></div>
          <div><dt>${icon('wind')}바람</dt><dd>${c.wind_speed_10m.toFixed(1)}<small>m/s</small></dd></div>
          <div><dt>${icon('rain')}강수 확률</dt><dd>${day.precipitation_probability_max[0] ?? 0}<small>%</small></dd></div>
          <div><dt>${icon('sun')}자외선</dt><dd>${Math.round(day.uv_index_max[0] ?? 0)}<small>UV</small></dd></div>
          <div><dt>${icon('sunrise')}일출</dt><dd>${hhmm(day.sunrise[0])}</dd></div>
          <div><dt>${icon('sunset')}일몰</dt><dd>${hhmm(day.sunset[0])}</dd></div>
        </dl>
        <div class="air">
          <div class="air-item ${pm10c}"><span>미세먼지 PM10</span><strong>${pm10}</strong><small>${air ? Math.round(air.current.pm10) + '㎍/㎥' : ''}</small></div>
          <div class="air-item ${pm25c}"><span>초미세먼지 PM2.5</span><strong>${pm25}</strong><small>${air ? Math.round(air.current.pm2_5) + '㎍/㎥' : ''}</small></div>
        </div>
      </article>
      <div class="w-side">
        <section class="w-hourly card" aria-label="시간별 예보"><h3 class="w-sub">시간별 예보 · 24시간</h3><ol class="hourly">${hours}</ol></section>
        <section class="w-week card" aria-label="주간 예보"><h3 class="w-sub">주간 예보 · 7일</h3><ol class="week">${week}</ol></section>
      </div>`;
  }

  /** 노트에 적어 둔 다가오는 일정(16일 이내)의 날씨 */
  async function renderSchedules() {
    const box = $('#w-schedule');
    const t = today();
    const events = LM.store.list('schedules')
      .filter((e) => e.date >= t && diffDays(e.date, t) <= 15)
      .sort((a, b) => (a.date + (a.start || '')).localeCompare(b.date + (b.start || '')))
      .slice(0, 6);
    if (!events.length) {
      box.innerHTML = `<li class="empty" style="grid-column:1/-1"><strong>16일 안에 예정된 일정이 없어요</strong><a class="link-arrow" href="./#agenda">노트에서 일정 추가하기</a></li>`;
      return;
    }
    box.innerHTML = events.map((e) => {
      const d = parseDate(e.date);
      return `<li class="ws-item">
        <div class="ws-date"><b>${d.getDate()}</b><small>${d.getMonth() + 1}월 · ${WEEK[d.getDay()]}</small></div>
        <div><h4>${esc(e.title)}</h4><p>${icon('pin')}${esc(e.place || `${current.name} (현재 지역 기준)`)}${e.start ? ` · ${esc(e.start)}` : ''}</p>
        <span class="ws-w" data-ws="${e.id}"><span class="spinner"></span></span></div>
      </li>`;
    }).join('');
    events.forEach(async (e) => {
      const el = box.querySelector(`[data-ws="${e.id}"]`);
      try {
        const lat = e.lat ?? current.lat;
        const lon = e.lon ?? current.lon;
        const f = await LM.api.forecastOn(lat, lon, e.date);
        if (!f) throw new Error('no data');
        const wi = LM.weatherInfo(f.code);
        el.innerHTML = `${icon(wi.icon)}${wi.label} · ${deg(f.min)} / ${deg(f.max)} · 강수 ${f.pop ?? 0}%`;
      } catch (err) {
        el.textContent = '예보 없음';
      }
    });
  }

  document.addEventListener('DOMContentLoaded', async () => {
    root = $('#weather-root');
    LM.ui.bindPlaceField($('#weather [data-place]'), { onPick: (p) => load({ name: p.name, lat: p.lat, lon: p.lon }) });
    root.addEventListener('click', (e) => { if (e.target.closest('[data-retry]')) load(current); });
    LM.store.onChange((k) => { if (k === 'schedules' && current) renderSchedules(); });

    const saved = LM.store.read('pref.weatherPlace', null);
    load(saved || DEFAULT);

    // 위치 권한이 이미 허용돼 있다면 처음 방문 시 현재 위치로 자동 전환
    if (!saved && navigator.permissions?.query) {
      try {
        const st = await navigator.permissions.query({ name: 'geolocation' });
        if (st.state === 'granted') {
          const pos = await LM.api.currentPosition();
          const r = await LM.api.reverseGeocode(pos.lat, pos.lon).catch(() => null);
          load({ name: r ? r.city || r.region : '현재 위치', ...pos });
        }
      } catch (e) { /* 기본 위치 유지 */ }
    }
  });
})();
