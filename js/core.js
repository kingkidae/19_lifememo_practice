/* ==========================================================================
   인생메모 — 공통 모듈
   - LM.store   : localStorage 기반 CRUD (두 페이지가 같은 저장소를 공유)
   - LM.api     : 날씨·위치 등 외부 API 래퍼 (모두 API 키가 필요 없는 공개 API)
   - LM.ui      : 토스트, 다이얼로그, 확인창 등 UI 헬퍼
   ========================================================================== */
(function () {
  'use strict';

  const LM = (window.LM = window.LM || {});
  const PREFIX = 'lifememo.';

  /* ---------------------------------------------------------------------
     Utilities
     --------------------------------------------------------------------- */
  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));
  const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
  const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ESC[c]);
  const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  const pad = (n) => String(n).padStart(2, '0');
  const toISODate = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const today = () => toISODate(new Date());
  const parseDate = (iso) => { const [y, m, d] = iso.split('-').map(Number); return new Date(y, m - 1, d); };
  const addDays = (iso, n) => { const d = parseDate(iso); d.setDate(d.getDate() + n); return toISODate(d); };
  const diffDays = (a, b) => Math.round((parseDate(a) - parseDate(b)) / 86400000);
  const WEEK = ['일', '월', '화', '수', '목', '금', '토'];
  const fmtDate = (iso, opts = {}) => {
    if (!iso) return '';
    const d = parseDate(iso);
    const base = `${opts.noYear ? '' : d.getFullYear() + '년 '}${d.getMonth() + 1}월 ${d.getDate()}일`;
    return opts.week === false ? base : `${base} (${WEEK[d.getDay()]})`;
  };
  const fmtNum = (n, digits = 0) => Number(n || 0).toLocaleString('ko-KR', { maximumFractionDigits: digits, minimumFractionDigits: 0 });
  const debounce = (fn, ms = 250) => { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; };
  const icon = (name, cls = '') => `<svg class="icon ${cls}" aria-hidden="true"><use href="#i-${name}"></use></svg>`;

  LM.util = { $, $$, esc, uid, pad, toISODate, today, parseDate, addDays, diffDays, fmtDate, fmtNum, debounce, icon, WEEK };

  /* ---------------------------------------------------------------------
     Store — localStorage CRUD
     모든 컬렉션은 "lifememo.<이름>" 키에 배열(JSON)로 저장됩니다.
     --------------------------------------------------------------------- */
  const listeners = new Set();
  const emit = (key) => listeners.forEach((fn) => fn(key));

  function read(key, fallback) {
    try {
      const raw = localStorage.getItem(PREFIX + key);
      return raw == null ? fallback : JSON.parse(raw);
    } catch (e) {
      return fallback;
    }
  }

  function write(key, value) {
    try {
      localStorage.setItem(PREFIX + key, JSON.stringify(value));
      emit(key);
      return true;
    } catch (e) {
      LM.ui.toast('저장할 수 없어요. 브라우저 저장 공간을 확인해 주세요.');
      return false;
    }
  }

  LM.store = {
    read,
    write,
    /** Read: 컬렉션 전체 */
    list: (col) => read(col, []),
    /** Read: 단건 */
    get: (col, id) => read(col, []).find((x) => x.id === id) || null,
    /** Create */
    create(col, data) {
      const now = new Date().toISOString();
      const item = { id: uid(), ...data, createdAt: now, updatedAt: now };
      const all = read(col, []);
      all.push(item);
      return write(col, all) ? item : null;
    },
    /** Update */
    update(col, id, patch) {
      const all = read(col, []);
      const i = all.findIndex((x) => x.id === id);
      if (i < 0) return null;
      all[i] = { ...all[i], ...patch, id, updatedAt: new Date().toISOString() };
      return write(col, all) ? all[i] : null;
    },
    /** Delete */
    remove(col, id) {
      const all = read(col, []);
      const next = all.filter((x) => x.id !== id);
      return write(col, next) && next.length !== all.length;
    },
    removeWhere(col, pred) {
      const all = read(col, []);
      const next = all.filter((x) => !pred(x));
      write(col, next);
      return all.length - next.length;
    },
    onChange(fn) { listeners.add(fn); return () => listeners.delete(fn); },
    /** 전체 백업 / 복원 */
    exportAll() {
      const out = {};
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (k && k.startsWith(PREFIX)) out[k.slice(PREFIX.length)] = read(k.slice(PREFIX.length));
      }
      return { app: 'lifememo', version: 1, exportedAt: new Date().toISOString(), data: out };
    },
    importAll(json) {
      if (!json || json.app !== 'lifememo' || typeof json.data !== 'object') throw new Error('invalid');
      Object.entries(json.data).forEach(([k, v]) => localStorage.setItem(PREFIX + k, JSON.stringify(v)));
      emit('*');
    },
  };

  // 다른 탭(예: 발견 페이지)에서 바뀐 내용도 반영
  window.addEventListener('storage', (e) => {
    if (e.key && e.key.startsWith(PREFIX)) emit(e.key.slice(PREFIX.length));
  });

  /* ---------------------------------------------------------------------
     여행: 다녀온 나라는 하나의 Set으로 관리 → 노트·지도 양쪽에서 공유
     --------------------------------------------------------------------- */
  LM.travel = {
    visited: () => new Set(read('visitedCountries', [])),
    isVisited: (code) => read('visitedCountries', []).includes(code),
    setVisited(code, on) {
      const s = new Set(read('visitedCountries', []));
      on ? s.add(code) : s.delete(code);
      write('visitedCountries', [...s]);
    },
    country: (code) => (window.LM_COUNTRIES || []).find((c) => c.code === code) || null,
    flag: (code, w = 40) => `https://flagcdn.com/w${w}/${String(code).toLowerCase()}.png`,
  };

  /* ---------------------------------------------------------------------
     Shared constants
     --------------------------------------------------------------------- */
  // 한국어 장르명 ↔ Open Library subject_key 검색식
  LM.GENRES = [
    { id: 'fiction', ko: '소설', q: 'subject_key:fiction' },
    { id: 'mystery', ko: '추리·스릴러', q: 'subject_key:(detective_and_mystery_stories OR thrillers)' },
    { id: 'science_fiction', ko: 'SF', q: 'subject_key:science_fiction' },
    { id: 'fantasy', ko: '판타지', q: 'subject_key:fantasy' },
    { id: 'romance', ko: '로맨스', q: 'subject_key:romance' },
    { id: 'poetry', ko: '시', q: 'subject_key:poetry' },
    { id: 'essays', ko: '에세이', q: 'subject_key:(essays OR american_essays)' },
    { id: 'history', ko: '역사', q: 'subject_key:world_history' },
    { id: 'philosophy', ko: '철학', q: 'subject_key:philosophy' },
    { id: 'psychology', ko: '심리', q: 'subject_key:psychology' },
    { id: 'science', ko: '과학', q: 'subject_key:(popular_science OR science)' },
    { id: 'business', ko: '경제·경영', q: 'subject_key:(business OR economics)' },
    { id: 'self_help', ko: '자기계발', q: 'subject_key:self-help_techniques' },
    { id: 'art', ko: '예술', q: 'subject_key:(art OR history_of_art)' },
    { id: 'travel', ko: '여행', q: 'subject_key:(description_and_travel OR travel)' },
    { id: 'cooking', ko: '요리', q: 'subject_key:(cookery OR cooking)' },
  ];
  LM.genre = (id) => LM.GENRES.find((g) => g.id === id) || { id: 'etc', ko: '기타', q: '' };

  // WMO 날씨 코드 → 한국어 / 아이콘
  const WMO = {
    0: ['맑음', 'sun'], 1: ['대체로 맑음', 'cloud-sun'], 2: ['구름 조금', 'cloud-sun'], 3: ['흐림', 'cloud'],
    45: ['안개', 'fog'], 48: ['짙은 안개', 'fog'],
    51: ['약한 이슬비', 'drizzle'], 53: ['이슬비', 'drizzle'], 55: ['강한 이슬비', 'drizzle'], 56: ['어는 이슬비', 'drizzle'], 57: ['어는 이슬비', 'drizzle'],
    61: ['약한 비', 'rain'], 63: ['비', 'rain'], 65: ['강한 비', 'rain'], 66: ['어는 비', 'rain'], 67: ['어는 비', 'rain'],
    71: ['약한 눈', 'snow'], 73: ['눈', 'snow'], 75: ['폭설', 'snow'], 77: ['싸락눈', 'snow'],
    80: ['소나기', 'rain'], 81: ['강한 소나기', 'rain'], 82: ['폭우', 'rain'], 85: ['눈 소나기', 'snow'], 86: ['강한 눈 소나기', 'snow'],
    95: ['뇌우', 'storm'], 96: ['우박 동반 뇌우', 'storm'], 99: ['강한 우박 뇌우', 'storm'],
  };
  LM.weatherInfo = (code, isDay = 1) => {
    const [label, ic] = WMO[code] || ['알 수 없음', 'cloud'];
    const night = !isDay && (ic === 'sun' || ic === 'cloud-sun');
    return { label, icon: night ? 'moon' : ic };
  };

  /* ---------------------------------------------------------------------
     API — fetch 래퍼 + 공개 API
     --------------------------------------------------------------------- */
  async function fetchJSON(url, { timeout = 12000, cacheMin = 0 } = {}) {
    const cacheKey = 'lm.cache:' + url;
    if (cacheMin) {
      try {
        const hit = JSON.parse(sessionStorage.getItem(cacheKey) || 'null');
        if (hit && Date.now() - hit.t < cacheMin * 60000) return hit.v;
      } catch (e) { /* ignore */ }
    }
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeout);
    try {
      const res = await fetch(url, { signal: ctrl.signal, headers: { Accept: 'application/json' } });
      if (!res.ok) throw new Error('HTTP ' + res.status);
      const data = await res.json();
      if (cacheMin) {
        try { sessionStorage.setItem(cacheKey, JSON.stringify({ t: Date.now(), v: data })); } catch (e) { /* quota */ }
      }
      return data;
    } finally {
      clearTimeout(timer);
    }
  }

  const round2 = (n) => Math.round(n * 100) / 100;

  LM.api = {
    fetchJSON,

    /** 브라우저 위치 (Geolocation API) */
    currentPosition() {
      return new Promise((resolve, reject) => {
        if (!('geolocation' in navigator)) return reject(new Error('unsupported'));
        navigator.geolocation.getCurrentPosition(
          (p) => resolve({ lat: round2(p.coords.latitude), lon: round2(p.coords.longitude) }),
          (err) => reject(err),
          { enableHighAccuracy: false, timeout: 10000, maximumAge: 600000 }
        );
      });
    },

    /** 좌표 → 지명 (BigDataCloud, 키 불필요) */
    async reverseGeocode(lat, lon) {
      const d = await fetchJSON(
        `https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=${lat}&longitude=${lon}&localityLanguage=ko`,
        { cacheMin: 1440 }
      );
      return {
        city: d.city || d.locality || d.principalSubdivision || '',
        locality: d.locality || '',
        region: d.principalSubdivision || '',
        country: d.countryName || '',
        countryCode: d.countryCode || '',
        lat, lon,
      };
    },

    /** 지명 검색 (Open-Meteo Geocoding → 결과가 없으면 OpenStreetMap Nominatim, 모두 키 불필요) */
    async searchPlace(q) {
      if (!q.trim()) return [];
      const d = await fetchJSON(
        `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(q.trim())}&count=8&language=ko&format=json`,
        { cacheMin: 1440 }
      );
      if (!d.results?.length) {
        const n = await fetchJSON(
          `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(q.trim())}&format=jsonv2&accept-language=ko&limit=6&addressdetails=1`,
          { cacheMin: 1440 }
        );
        return n.map((r) => ({
          name: r.name || r.display_name.split(',')[0],
          detail: [r.address?.state || r.address?.province, r.address?.country].filter(Boolean).join(', '),
          countryCode: (r.address?.country_code || '').toUpperCase(),
          lat: round2(+r.lat),
          lon: round2(+r.lon),
        }));
      }
      return d.results
        .sort((a, b) => (String(b.feature_code).startsWith('PPL') - String(a.feature_code).startsWith('PPL')) || ((b.population || 0) - (a.population || 0)))
        .map((r) => ({
          name: r.name,
          detail: [r.admin1, r.country].filter(Boolean).join(', '),
          countryCode: r.country_code || '',
          lat: round2(r.latitude),
          lon: round2(r.longitude),
        }));
    },

    /** 일별 예보 16일 (Open-Meteo) */
    dailyForecast(lat, lon) {
      return fetchJSON(
        `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}` +
          '&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max&forecast_days=16&timezone=auto',
        { cacheMin: 30 }
      );
    },

    /** 특정 날짜의 예보 한 건 — 범위 밖이면 null */
    async forecastOn(lat, lon, iso) {
      const d = await LM.api.dailyForecast(lat, lon);
      const i = (d.daily?.time || []).indexOf(iso);
      if (i < 0) return null;
      return {
        code: d.daily.weather_code[i],
        max: d.daily.temperature_2m_max[i],
        min: d.daily.temperature_2m_min[i],
        pop: d.daily.precipitation_probability_max[i],
      };
    },
  };

  /* ---------------------------------------------------------------------
     UI helpers
     --------------------------------------------------------------------- */
  LM.ui = {
    toast(msg, ms = 2600) {
      let wrap = $('.toast-wrap');
      if (!wrap) {
        wrap = document.createElement('div');
        wrap.className = 'toast-wrap';
        wrap.setAttribute('role', 'status');
        wrap.setAttribute('aria-live', 'polite');
        document.body.appendChild(wrap);
      }
      const el = document.createElement('div');
      el.className = 'toast';
      el.textContent = msg;
      wrap.appendChild(el);
      setTimeout(() => el.remove(), ms);
    },

    /** <dialog> 열기 + 배경 클릭/닫기 버튼 처리 */
    openDialog(dlg) {
      if (!dlg.dataset.bound) {
        dlg.dataset.bound = '1';
        dlg.addEventListener('click', (e) => {
          if (e.target === dlg || e.target.closest('[data-close]')) dlg.close();
        });
      }
      dlg.showModal();
    },

    confirm(message, { ok = '삭제', danger = true } = {}) {
      return new Promise((resolve) => {
        const dlg = document.createElement('dialog');
        dlg.className = 'modal';
        dlg.style.width = 'min(420px, calc(100vw - 24px))';
        dlg.innerHTML = `
          <div class="modal-body" style="padding-top:32px">
            <p class="serif" style="font-size:17px">${esc(message)}</p>
          </div>
          <div class="modal-foot"><span class="spacer"></span>
            <button type="button" class="btn btn--ghost btn--sm" value="no">취소</button>
            <button type="button" class="btn ${danger ? 'btn--danger' : 'btn--primary'} btn--sm" value="yes">${esc(ok)}</button>
          </div>`;
        document.body.appendChild(dlg);
        dlg.addEventListener('click', (e) => {
          const v = e.target.closest('button')?.value;
          if (v || e.target === dlg) { dlg.close(); resolve(v === 'yes'); }
        });
        dlg.addEventListener('close', () => dlg.remove());
        dlg.showModal();
        dlg.querySelector('[value="yes"]').focus();
      });
    },

    /**
     * 장소 입력 필드: 지명 검색 자동완성 + "현재 위치" 버튼
     * root 안의 [data-place-input], [data-place-suggest], [data-place-locate],
     * input[name=lat], input[name=lon] 를 사용합니다.
     */
    bindPlaceField(root, { onPick } = {}) {
      const input = $('[data-place-input]', root);
      const list = $('[data-place-suggest]', root);
      const locate = $('[data-place-locate]', root);
      const lat = $('input[name="lat"]', root);
      const lon = $('input[name="lon"]', root);
      const status = $('[data-place-status]', root);
      let items = [];

      const setStatus = (txt) => { if (status) status.textContent = txt; };
      const clearCoords = () => { lat.value = ''; lon.value = ''; };
      const close = () => { list.hidden = true; list.innerHTML = ''; input.setAttribute('aria-expanded', 'false'); };
      const pick = (p) => {
        input.value = p.name;
        lat.value = p.lat;
        lon.value = p.lon;
        setStatus(onPick ? '' : `좌표 ${p.lat}, ${p.lon} · 날씨 예보를 함께 볼 수 있어요`);
        close();
        onPick?.(p);
      };

      const search = debounce(async () => {
        const q = input.value.trim();
        if (q.length < 2) return close();
        try {
          items = await LM.api.searchPlace(q);
          if (!items.length) return close();
          list.innerHTML = items
            .map((p, i) => `<li role="option"><button type="button" data-i="${i}"><span>${esc(p.name)}</span><small>${esc(p.detail)}</small></button></li>`)
            .join('');
          list.hidden = false;
          input.setAttribute('aria-expanded', 'true');
        } catch (e) { close(); }
      }, 300);

      input.addEventListener('input', () => { clearCoords(); setStatus(''); search(); });
      input.addEventListener('keydown', (e) => { if (e.key === 'Escape') close(); });
      input.addEventListener('blur', () => setTimeout(close, 180));
      list.addEventListener('mousedown', (e) => e.preventDefault());
      list.addEventListener('click', (e) => {
        const b = e.target.closest('button[data-i]');
        if (b) pick(items[+b.dataset.i]);
      });

      locate?.addEventListener('click', async () => {
        locate.disabled = true;
        setStatus('현재 위치를 확인하는 중…');
        try {
          const { lat: la, lon: lo } = await LM.api.currentPosition();
          let name = `${la}, ${lo}`;
          try {
            const r = await LM.api.reverseGeocode(la, lo);
            name = [r.region, r.city !== r.region ? r.city : '', r.locality !== r.city ? r.locality : ''].filter(Boolean).join(' ') || name;
          } catch (e) { /* 지명 변환 실패 시 좌표 사용 */ }
          pick({ name, lat: la, lon: lo });
        } catch (e) {
          setStatus('위치 권한이 없거나 위치를 가져올 수 없어요. 직접 입력해 주세요.');
        } finally {
          locate.disabled = false;
        }
      });

      return {
        set(name = '', la = '', lo = '') {
          input.value = name; lat.value = la; lon.value = lo;
          setStatus(la ? `좌표 ${la}, ${lo}` : '');
        },
      };
    },
  };

  /* ---------------------------------------------------------------------
     Footer: 백업 내보내기 / 가져오기 (모든 페이지 공통)
     --------------------------------------------------------------------- */
  document.addEventListener('DOMContentLoaded', () => {
    const exp = $('[data-backup-export]');
    const imp = $('[data-backup-import]');
    exp?.addEventListener('click', () => {
      const blob = new Blob([JSON.stringify(LM.store.exportAll(), null, 2)], { type: 'application/json' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `lifememo-backup-${today()}.json`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 1000);
      LM.ui.toast('백업 파일을 내려받았어요.');
    });
    imp?.addEventListener('change', async () => {
      const file = imp.files[0];
      if (!file) return;
      try {
        LM.store.importAll(JSON.parse(await file.text()));
        LM.ui.toast('백업을 불러왔어요.');
      } catch (e) {
        LM.ui.toast('인생메모 백업 파일이 아니에요.');
      }
      imp.value = '';
    });
    const y = $('[data-year]');
    if (y) y.textContent = new Date().getFullYear();
  });

  /* ---------------------------------------------------------------------
     #해시로 들어온 경우: 위쪽 섹션이 API 응답으로 늦게 길어져도 목표 위치를 유지
     (예: 노트의 '지도에서 체크하기' → discover.html#voyage-map)
     탭 패널 해시(#agenda 등)는 노트 페이지의 main.js가 처리합니다.
     --------------------------------------------------------------------- */
  document.addEventListener('DOMContentLoaded', () => {
    const id = decodeURIComponent(location.hash.slice(1));
    const target = id && document.getElementById(id);
    if (!target || target.getAttribute('role') === 'tabpanel' || !('ResizeObserver' in window)) return;

    const align = () => target.scrollIntoView({ block: 'start', behavior: 'instant' });
    const ro = new ResizeObserver(align);
    const stop = () => {
      ro.disconnect();
      ['wheel', 'touchstart', 'keydown', 'mousedown'].forEach((t) => window.removeEventListener(t, stop));
    };
    // 사용자가 직접 스크롤하기 시작하면 더 이상 끌어당기지 않음
    ['wheel', 'touchstart', 'keydown', 'mousedown'].forEach((t) => window.addEventListener(t, stop, { passive: true }));
    ro.observe(document.body);
    setTimeout(stop, 6000);
  });
})();
