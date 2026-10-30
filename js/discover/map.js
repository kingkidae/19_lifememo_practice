/* 발견 03 · 세계 여행 지도 — Leaflet + Natural Earth 국경 + 위키백과 요약 + 역지오코딩
   배율 5 미만: 나라를 눌러 방문 체크 / 배율 5 이상: 지도를 눌러 다녀온 도시 추가 */
(function () {
  'use strict';
  const { $, esc, icon, fmtNum, debounce } = LM.util;
  const CITY_ZOOM = 5;
  const STYLE = {
    base: { color: '#b9a88f', weight: 0.5, fillColor: '#1c1714', fillOpacity: 0.02 },
    visited: { color: '#c4510e', weight: 0.8, fillColor: '#f37021', fillOpacity: 0.62 },
  };

  let map, geoLayer, cityLayer;
  let visited = new Set();
  let selected = null;
  const layers = new Map();      // 국가코드 → Leaflet layer
  const els = {};

  const countries = () => window.LM_COUNTRIES || [];
  const fmtPop = (n) => (n >= 1e8 ? `${fmtNum(n / 1e8, 1)}억 명` : n >= 1e4 ? `${fmtNum(Math.round(n / 1e4))}만 명` : `${fmtNum(n)}명`);

  function styleFor(code) {
    const s = { ...(visited.has(code) ? STYLE.visited : STYLE.base) };
    if (code === selected) Object.assign(s, { color: '#1c1714', weight: 2 });
    return s;
  }
  const restyle = () => layers.forEach((layer, code) => layer.setStyle(styleFor(code)));

  /* ---------- Country ---------- */
  function toggleCountry(code) {
    const on = !visited.has(code);
    LM.travel.setVisited(code, on);
    const c = LM.travel.country(code);
    LM.ui.toast(on ? `${c?.ko || code}을(를) 다녀온 나라로 칠했어요.` : `${c?.ko || code} 방문 기록을 지웠어요.`);
  }

  async function selectCountry(code, { fly = false } = {}) {
    selected = code;
    restyle();
    const c = LM.travel.country(code);
    if (!c) return;
    if (fly && layers.get(code)) map.flyToBounds(layers.get(code).getBounds(), { maxZoom: 5, duration: 0.8 });
    renderCard();
    // 한국어 위키백과 요약 (REST API)
    const wiki = $('[data-wiki]', els.card);
    try {
      const w = await LM.api.fetchJSON(`https://ko.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(c.ko)}`, { cacheMin: 1440 });
      if (selected !== code || !wiki.isConnected) return;
      wiki.innerHTML = `<p class="cc-wiki">${esc(w.extract || '')}</p>
        ${w.content_urls ? `<a class="link-arrow cc-wiki-link" href="${esc(w.content_urls.desktop.page)}" target="_blank" rel="noopener">위키백과에서 더 보기 ${icon('external')}</a>` : ''}`;
    } catch (e) {
      if (wiki.isConnected) wiki.innerHTML = '<p class="cc-wiki muted">나라 소개를 불러오지 못했어요.</p>';
    }
  }

  function renderCard() {
    if (!selected) return;
    const c = LM.travel.country(selected);
    const isOn = visited.has(selected);
    const inBucket = LM.store.list('trips').some((t) => t.code === selected);
    const cityCount = LM.store.list('visitedCities').filter((x) => x.code === selected).length;
    const wikiBox = $('[data-wiki]', els.card);
    const keepWiki = els.card.dataset.code === selected && wikiBox ? wikiBox.innerHTML : '<p class="cc-wiki"><span class="spinner"></span> 나라 소개를 불러오는 중…</p>';
    els.card.dataset.code = selected;
    els.card.innerHTML = `
      <div class="cc-head">
        <img src="${LM.travel.flag(selected, 160)}" alt="${esc(c.ko)} 국기" width="56" height="40">
        <div><h3>${esc(c.ko)}</h3><p>${esc(c.en)}</p></div>
      </div>
      <dl class="cc-facts">
        <div><dt>대륙</dt><dd>${esc(c.continent)}</dd></div>
        <div><dt>인구(추정)</dt><dd>${c.pop ? fmtPop(c.pop) : '–'}</dd></div>
        <div><dt>방문</dt><dd>${isOn ? '다녀왔어요' : '아직이에요'}</dd></div>
        <div><dt>기록한 도시</dt><dd>${cityCount}곳</dd></div>
      </dl>
      <div data-wiki>${keepWiki}</div>
      <div class="cc-actions">
        <button class="btn btn--sm ${isOn ? 'is-on' : ''}" type="button" data-toggle aria-pressed="${isOn}">${icon('check')}${isOn ? '다녀왔어요' : '다녀왔어요로 표시'}</button>
        <button class="btn btn--ghost btn--sm" type="button" data-bucket ${inBucket ? 'disabled' : ''}>${inBucket ? '버킷리스트에 있음' : '버킷리스트에 담기'}</button>
      </div>`;
  }

  /* ---------- City ---------- */
  function cityPopup(c, existingId) {
    const el = document.createElement('div');
    el.innerHTML = `<h4>${esc(c.name)}</h4><p>${esc(c.country || '')}</p>
      <button class="btn ${existingId ? 'btn--danger' : 'btn--primary'} btn--sm" type="button">${existingId ? '기록에서 지우기' : '다녀온 도시로 추가'}</button>`;
    el.querySelector('button').addEventListener('click', () => {
      if (existingId) {
        LM.store.remove('visitedCities', existingId);
        LM.ui.toast(`${c.name} 기록을 지웠어요.`);
      } else {
        const dup = LM.store.list('visitedCities').find((x) => x.name === c.name && x.code === c.code);
        if (dup) LM.ui.toast(`${c.name}은(는) 이미 기록돼 있어요.`);
        else {
          LM.store.create('visitedCities', { name: c.name, code: c.code, country: c.country, lat: c.lat, lng: c.lng });
          if (c.code && !visited.has(c.code)) LM.travel.setVisited(c.code, true);
          LM.ui.toast(`${c.name}을(를) 다녀온 도시로 추가했어요.`);
        }
      }
      map.closePopup();
    });
    return el;
  }

  async function pickCityAt(latlng) {
    const popup = L.popup({ maxWidth: 260 }).setLatLng(latlng).setContent('<p><span class="spinner"></span> 이곳의 도시를 찾는 중…</p>').openOn(map);
    try {
      const r = await LM.api.reverseGeocode(latlng.lat.toFixed(3), latlng.lng.toFixed(3));
      const name = r.city || r.locality;
      if (!name) { popup.setContent('<p>이 위치에서는 도시를 찾지 못했어요.</p>'); return; }
      popup.setContent(cityPopup({ name, code: r.countryCode, country: [r.region, r.country].filter(Boolean).join(', '), lat: latlng.lat, lng: latlng.lng }));
    } catch (e) {
      popup.setContent('<p>도시 정보를 불러오지 못했어요.</p>');
    }
  }

  function renderCities() {
    cityLayer.clearLayers();
    LM.store.list('visitedCities').forEach((c) => {
      L.circleMarker([c.lat, c.lng], {
        radius: 6, color: '#fffdf9', weight: 2, fillColor: '#1c1714', fillOpacity: 1, bubblingMouseEvents: false,
      })
        .bindTooltip(esc(c.name), { direction: 'top', offset: [0, -6] })
        .on('click', (e) => L.popup({ maxWidth: 260 }).setLatLng(e.latlng).setContent(cityPopup(c, c.id)).openOn(map))
        .addTo(cityLayer);
    });
  }

  /* ---------- Side panel ---------- */
  function renderStats() {
    const total = countries().length;
    const cities = LM.store.list('visitedCities').length;
    els.stats.innerHTML = `
      <div><dt>다녀온 나라</dt><dd>${visited.size}<small>/ ${total}</small></dd></div>
      <div><dt>다녀온 도시</dt><dd>${cities}<small>곳</small></dd></div>`;

    const groups = {};
    countries().forEach((c) => {
      if (c.continent === '남극') return;
      const g = (groups[c.continent] = groups[c.continent] || { all: 0, on: 0 });
      g.all++;
      if (visited.has(c.code)) g.on++;
    });
    els.continents.innerHTML = '<h3>대륙별 여행</h3>' + Object.entries(groups)
      .sort((a, b) => b[1].on / b[1].all - a[1].on / a[1].all || b[1].all - a[1].all)
      .map(([name, g]) => `<div class="ct-row"><span>${esc(name)}</span><div class="bar"><span style="width:${(g.on / g.all) * 100}%"></span></div><span>${g.on}/${g.all}</span></div>`)
      .join('');
  }

  function updateMode() {
    const z = map.getZoom();
    els.mode.innerHTML = z >= CITY_ZOOM
      ? `<b>도시 체크</b> 다녀온 도시를 눌러 추가하세요 · 축소하면 나라 체크`
      : `<b>나라 체크</b> 나라를 누르면 칠해져요 · 배율 ${CITY_ZOOM} 이상 확대하면 도시 체크`;
  }

  /* ---------- Search: 나라(로컬) + 도시(Open-Meteo Geocoding) ---------- */
  function bindSearch() {
    const input = $('#city-q');
    const list = $('#city-suggest');
    let results = [];
    const close = () => { list.hidden = true; input.setAttribute('aria-expanded', 'false'); };

    const run = debounce(async () => {
      const q = input.value.trim();
      if (q.length < 1) return close();
      const ql = q.toLowerCase();
      const cs = countries().filter((c) => c.ko.includes(q) || c.en.toLowerCase().includes(ql)).slice(0, 3)
        .map((c) => ({ type: 'country', code: c.code, name: c.ko, detail: '나라' }));
      let ps = [];
      if (q.length >= 2) {
        try { ps = (await LM.api.searchPlace(q)).slice(0, 6).map((p) => ({ type: 'city', ...p })); } catch (e) { /* 도시 검색 실패 시 나라만 */ }
      }
      results = [...cs, ...ps];
      if (!results.length) return close();
      list.innerHTML = results.map((r, i) => `<li role="option"><button type="button" data-i="${i}">
        <span>${r.type === 'country' ? `<img src="${LM.travel.flag(r.code, 20)}" alt="" width="18" height="13" style="display:inline;margin-right:8px;vertical-align:-1px">` : ''}${esc(r.name)}</span><small>${esc(r.detail)}</small></button></li>`).join('');
      list.hidden = false;
      input.setAttribute('aria-expanded', 'true');
    }, 300);

    input.addEventListener('input', run);
    input.addEventListener('keydown', (e) => { if (e.key === 'Escape') close(); });
    input.addEventListener('blur', () => setTimeout(close, 180));
    list.addEventListener('mousedown', (e) => e.preventDefault());
    list.addEventListener('click', (e) => {
      const b = e.target.closest('[data-i]');
      if (!b) return;
      const r = results[+b.dataset.i];
      close();
      input.value = '';
      if (r.type === 'country') return selectCountry(r.code, { fly: true });
      map.flyTo([r.lat, r.lon], 9, { duration: 0.9 });
      map.once('moveend', () => {
        L.popup({ maxWidth: 260 }).setLatLng([r.lat, r.lon])
          .setContent(cityPopup({ name: r.name, code: r.countryCode, country: r.detail, lat: r.lat, lng: r.lon })).openOn(map);
      });
    });
  }

  /* ---------- Init ---------- */
  document.addEventListener('DOMContentLoaded', () => {
    Object.assign(els, { stats: $('#map-stats'), card: $('#country-card'), continents: $('#continents'), mode: $('#map-mode') });
    if (!window.L || !window.LM_WORLD) {
      $('#map').innerHTML = '<div class="error-box" style="margin:24px">지도를 불러오지 못했어요.</div>';
      return;
    }
    visited = LM.travel.visited();

    map = L.map('map', {
      preferCanvas: true, minZoom: 1, maxZoom: 12, zoomSnap: 0.5, worldCopyJump: false,
      maxBounds: [[-70, -200], [85, 200]], maxBoundsViscosity: 0.8, scrollWheelZoom: false,
    }).setView([28, 15], 2);
    // 페이지 스크롤과 충돌하지 않도록 지도를 클릭한 뒤부터 휠 확대
    map.once('focus click', () => map.scrollWheelZoom.enable());

    // 배경 지도: Esri Light Gray Canvas (키 불필요) — 바탕 + 지명 라벨 2겹
    const ESRI = 'https://server.arcgisonline.com/ArcGIS/rest/services/Canvas';
    L.tileLayer(`${ESRI}/World_Light_Gray_Base/MapServer/tile/{z}/{y}/{x}`, {
      maxNativeZoom: 16, noWrap: true,
      attribution: 'Tiles &copy; <a href="https://www.esri.com/">Esri</a> — Esri, HERE, Garmin, &copy; OpenStreetMap contributors · Natural Earth',
    }).addTo(map);
    // 라벨은 칠한 나라 위에 보이도록 별도 pane에 두고, 클릭은 아래로 통과
    map.createPane('labels').style.cssText = 'z-index:450;pointer-events:none';
    L.tileLayer(`${ESRI}/World_Light_Gray_Reference/MapServer/tile/{z}/{y}/{x}`, {
      maxNativeZoom: 16, noWrap: true, pane: 'labels', opacity: 0.85,
    }).addTo(map);

    geoLayer = L.geoJSON(window.LM_WORLD, {
      style: (f) => styleFor(f.properties.c),
      onEachFeature: (f, layer) => {
        const code = f.properties.c;
        layers.set(code, layer);
        layer.bindTooltip(f.properties.n, { sticky: true, direction: 'top' });
        layer.on({
          mouseover: () => layer.setStyle({ fillOpacity: visited.has(code) ? 0.78 : 0.12 }),
          mouseout: () => layer.setStyle(styleFor(code)),
          click: (e) => {
            if (map.getZoom() >= CITY_ZOOM) return; // 도시 모드: 지도 클릭으로 전달
            L.DomEvent.stop(e);
            toggleCountry(code);
            selectCountry(code);
          },
        });
      },
    }).addTo(map);

    cityLayer = L.layerGroup().addTo(map);
    map.on('click', (e) => { if (map.getZoom() >= CITY_ZOOM) pickCityAt(e.latlng); });
    map.on('zoomend', updateMode);

    els.card.addEventListener('click', (e) => {
      if (!selected) return;
      if (e.target.closest('[data-toggle]')) toggleCountry(selected);
      if (e.target.closest('[data-bucket]')) {
        const c = LM.travel.country(selected);
        LM.store.create('trips', { code: c.code, name: c.ko, priority: 2, period: '', memo: '' });
        LM.ui.toast(`${c.ko}을(를) 버킷리스트에 담았어요.`);
      }
    });

    LM.store.onChange((k) => {
      if (!['visitedCountries', 'visitedCities', 'trips', '*'].includes(k)) return;
      visited = LM.travel.visited();
      restyle();
      renderCities();
      renderStats();
      renderCard();
    });

    bindSearch();
    renderCities();
    renderStats();
    updateMode();
  });
})();
