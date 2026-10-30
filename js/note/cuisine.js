/* 06 · 요리 노트 — 레시피 CRUD + 재료 용량별 칼로리·영양소 자동 계산 */
(function () {
  'use strict';
  const { $, $$, esc, icon, fmtNum, debounce } = LM.util;
  const COL = 'recipes';
  const CATS = ['한식', '양식', '중식', '일식', '디저트', '음료', '기타'];
  const CUSTOM_UNITS = ['g', '개', '큰술', '작은술', '컵', '약간'];
  const NUTRI = [
    ['kcal', '열량', 'kcal'], ['carb', '탄수화물', 'g'], ['protein', '단백질', 'g'], ['fat', '지방', 'g'], ['sodium', '나트륨', 'mg'],
  ];

  const DB = new Map((window.LM_INGREDIENTS || []).map((x) => [x.name, x]));
  const DAILY = window.LM_DAILY || { kcal: 2000, carb: 324, protein: 55, fat: 54, sodium: 2000 };

  const els = {};
  const state = { q: '', cat: '' };
  let draft = { ings: [], steps: [] };
  let picked = null;          // 자동완성에서 고른 DB 재료
  let suggestions = [];
  let mode = 'serving';       // 영양 합계: 'total' | 'serving'

  /* ---------- Nutrition ---------- */
  const gramsOf = (item, amount, unit) => (item && item.units[unit] != null ? amount * item.units[unit] : null);

  function nutritionOf(ing) {
    const item = ing.key ? DB.get(ing.key) : null;
    const g = gramsOf(item, +ing.amount || 0, ing.unit);
    if (g == null) return null;
    const r = g / 100;
    return { grams: g, kcal: item.kcal * r, carb: item.carb * r, protein: item.protein * r, fat: item.fat * r, sodium: item.sodium * r };
  }

  function totalOf(ings) {
    const t = { kcal: 0, carb: 0, protein: 0, fat: 0, sodium: 0, unknown: 0 };
    ings.forEach((ing) => {
      const n = nutritionOf(ing);
      if (!n) { t.unknown++; return; }
      NUTRI.forEach(([k]) => (t[k] += n[k]));
    });
    return t;
  }

  const fmtAmt = (ing) => (ing.unit === '약간' ? '약간' : `${fmtNum(ing.amount, 1)}${ing.unit === 'g' ? 'g' : ' ' + ing.unit}`);
  const val = (k, v) => fmtNum(v, k === 'kcal' || k === 'sodium' ? 0 : 1);

  function totalHTML(tot, servings, { toggle = true } = {}) {
    const div = mode === 'serving' ? Math.max(1, servings) : 1;
    const rows = NUTRI.map(([k, label, unit]) => {
      const v = tot[k] / div;
      const pct = (v / DAILY[k]) * 100;
      return `<div class="nt-row"><span>${label}</span><div class="bar"><span style="width:${Math.min(100, pct)}%"></span></div>
        <b>${val(k, v)}<small>${unit}</small></b><span class="pct">${Math.round(pct)}%</span></div>`;
    }).join('');
    return `<div class="nt-head">
        <h4>${mode === 'serving' ? `1인분 영양 정보 <small style="opacity:.6">(${servings}인분 기준)</small>` : '레시피 전체 영양 정보'}</h4>
        ${toggle ? `<div class="segmented" role="group" aria-label="영양 정보 기준">
          <button type="button" data-mode="serving" aria-pressed="${mode === 'serving'}">1인분</button>
          <button type="button" data-mode="total" aria-pressed="${mode === 'total'}">전체</button></div>` : ''}
      </div>
      <div class="nt-rows">${rows}</div>
      <p class="nt-note">% 는 1일 영양성분 기준치(식약처) 대비 비율입니다.${tot.unknown ? ` 직접 입력한 재료 ${tot.unknown}개는 계산에서 제외했어요.` : ''} 식약처·USDA 자료 기반 근사치예요.</p>`;
  }

  /* ---------- List ---------- */
  function render() {
    const q = state.q.trim().toLowerCase();
    const list = LM.store.list(COL)
      .filter((r) => !state.cat || r.category === state.cat)
      .filter((r) => !q || r.name.toLowerCase().includes(q) || r.ingredients.some((i) => i.name.toLowerCase().includes(q)))
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));

    els.list.innerHTML = list.length
      ? list.map((r) => {
        const tot = totalOf(r.ingredients);
        const kcal = tot.kcal / Math.max(1, r.servings);
        return `<li class="recipe-card">
          <div class="rc-top"><span class="tag">${esc(r.category)}</span>${kcal ? `<span class="rc-kcal">${icon('flame')}${fmtNum(kcal)}<small>kcal / 1인분</small></span>` : ''}</div>
          <h3><button class="card-link" type="button" data-open="${r.id}">${esc(r.name)}</button></h3>
          <p class="rc-ings">${esc(r.ingredients.map((i) => i.name).join(', ') || '재료 없음')}</p>
          <div class="rc-meta"><span>${icon('clock')}${r.time || 0}분</span><span>${icon('users')}${r.servings}인분</span><span>${r.steps.length}단계</span></div>
        </li>`;
      }).join('')
      : `<li class="empty"><strong>${q || state.cat ? '찾는 레시피가 없어요' : '나만의 첫 레시피를 적어 보세요'}</strong>재료를 고르면 칼로리와 영양소가 자동으로 계산돼요.</li>`;
  }

  function renderCats() {
    els.cats.innerHTML = ['', ...CATS].map((c) =>
      `<button type="button" class="chip" data-cat="${c}" aria-pressed="${state.cat === c}">${c || '전체'}</button>`).join('');
  }

  /* ---------- View ---------- */
  function openView(id) {
    const r = LM.store.get(COL, id);
    if (!r) return;
    const tot = totalOf(r.ingredients);
    $('#rv-title').textContent = r.name;
    $('#rv-body').innerHTML = `
      <div class="rv-meta">
        <span class="tag">${esc(r.category)}</span>
        <span>${icon('clock')}${r.time || 0}분</span>
        <span>${icon('users')}${r.servings}인분</span>
        <span>${icon('flame')}1인분 ${fmtNum(tot.kcal / Math.max(1, r.servings))} kcal</span>
      </div>
      <div class="recipe-view">
        <div>
          <h3>재료</h3>
          <ul class="rv-ings">${r.ingredients.map((i) => {
            const n = nutritionOf(i);
            return `<li><span>${esc(i.name)} · ${esc(fmtAmt(i))}</span><span>${n ? fmtNum(n.kcal) + ' kcal' : '–'}</span></li>`;
          }).join('') || '<li class="muted">재료가 없어요</li>'}</ul>
          <div class="nutri-total" data-view-total>${totalHTML(tot, r.servings)}</div>
        </div>
        <div>
          <h3>조리 순서</h3>
          <ol class="rv-steps">${r.steps.map((s, i) => `<li><span>${String(i + 1).padStart(2, '0')}</span><p>${esc(s)}</p></li>`).join('') || '<li class="muted">조리 순서가 없어요</li>'}</ol>
          ${r.memo ? `<p class="rv-memo">${esc(r.memo)}</p>` : ''}
        </div>
      </div>`;
    els.view.dataset.id = id;
    LM.ui.openDialog(els.view);
  }

  /* ---------- Editor: ingredients ---------- */
  function setUnits(units, preferred) {
    els.unit.innerHTML = units.map((u) => `<option value="${u}">${u}</option>`).join('');
    els.unit.value = preferred && units.includes(preferred) ? preferred : units[0];
  }

  function pick(item) {
    picked = item;
    els.q.value = item.name;
    closeSuggest();
    const units = Object.keys(item.units);
    // 개·장·쪽처럼 셀 수 있는 단위가 있으면 1단위로 시작, 아니면 100g
    const countable = units.find((u) => !['g', '큰술', '작은술', '컵'].includes(u));
    const isSeasoning = ['양념', '기름'].includes(item.cat);
    const unit = countable || (isSeasoning ? '큰술' : 'g');
    setUnits(units, unit);
    els.amount.value = unit === 'g' ? 100 : 1;
    renderPreview();
    els.amount.focus();
    els.amount.select();
  }

  function renderPreview() {
    if (!picked) {
      const q = els.q.value.trim();
      els.preview.innerHTML = q
        ? `<div class="np-head"><strong>${esc(q)}</strong><span>영양 정보가 없는 재료예요. 그대로 추가하면 계산에서 제외돼요.</span></div>`
        : '';
      return;
    }
    const amount = +els.amount.value || 0;
    const n = nutritionOf({ key: picked.name, amount, unit: els.unit.value });
    els.preview.innerHTML = `
      <div class="np-head"><strong>${esc(picked.name)} ${esc(fmtAmt({ amount, unit: els.unit.value }))}</strong>
        <span>${esc(picked.cat)} · ${fmtNum(n.grams, 1)}g 기준 · 100g당 ${picked.kcal}kcal</span></div>
      <dl class="np-grid">${NUTRI.map(([k, label, unit]) => `<div><dt>${label}</dt><dd>${val(k, n[k])}<small>${unit}</small></dd></div>`).join('')}</dl>`;
  }

  function renderSuggest() {
    const q = els.q.value.trim();
    if (!q) return closeSuggest();
    suggestions = [...DB.values()].filter((x) => x.name.includes(q)).sort((a, b) => a.name.indexOf(q) - b.name.indexOf(q)).slice(0, 8);
    const exact = suggestions.some((x) => x.name === q);
    els.suggest.innerHTML =
      suggestions.map((x, i) => `<li role="option"><button type="button" data-i="${i}"><span>${esc(x.name)} <small>${esc(x.cat)}</small></span><span class="ing-kcal">${x.kcal}<small> kcal/100g</small></span></button></li>`).join('') +
      (exact ? '' : `<li role="option"><button type="button" data-custom><span>'${esc(q)}' 직접 입력</span><small>영양 정보 없음</small></button></li>`);
    els.suggest.hidden = false;
    els.q.setAttribute('aria-expanded', 'true');
  }
  function closeSuggest() { els.suggest.hidden = true; els.q.setAttribute('aria-expanded', 'false'); }

  function addIngredient() {
    const name = els.q.value.trim();
    if (!name) { els.q.focus(); return LM.ui.toast('재료를 검색해서 골라 주세요.'); }
    if (!picked && DB.has(name)) picked = DB.get(name);
    const unit = els.unit.value;
    const amount = unit === '약간' ? 0 : +els.amount.value;
    if (unit !== '약간' && !(amount > 0)) { els.amount.focus(); return LM.ui.toast('용량을 입력해 주세요.'); }
    draft.ings.push({ name: picked ? picked.name : name, key: picked ? picked.name : null, amount, unit });
    picked = null;
    els.q.value = '';
    els.amount.value = 100;
    setUnits(CUSTOM_UNITS, 'g');
    renderPreview();
    renderDraft();
    els.q.focus();
  }

  function renderDraft() {
    els.rows.innerHTML = draft.ings.map((ing, i) => {
      const n = nutritionOf(ing);
      const cells = NUTRI.map(([k, , unit]) => `<td>${n ? `${val(k, n[k])}${unit === 'kcal' ? '' : unit}` : '<span class="na">–</span>'}</td>`).join('');
      return `<tr>
        <td>${esc(ing.name)}</td>
        <td><span class="amt">${ing.unit === '약간' ? '약간' : `<input class="input" type="number" min="0" step="any" value="${ing.amount}" data-amt="${i}" aria-label="${esc(ing.name)} 용량">${esc(ing.unit)}`}</span></td>
        ${cells}
        <td><button class="icon-btn icon-btn--danger" type="button" data-rm="${i}" aria-label="${esc(ing.name)} 빼기">${icon('close')}</button></td>
      </tr>`;
    }).join('');
    renderTotal();
  }

  function renderTotal() {
    const servings = +els.form.elements.servings.value || 1;
    els.total.innerHTML = draft.ings.length
      ? totalHTML(totalOf(draft.ings), servings)
      : '<p class="nt-note" style="margin:0">재료를 추가하면 레시피 전체와 1인분 영양 정보가 여기에 계산돼요.</p>';
  }

  /* ---------- Editor: steps ---------- */
  function renderSteps() {
    els.steps.innerHTML = draft.steps.map((s, i) => `
      <li class="step">
        <span class="step-num">${String(i + 1).padStart(2, '0')}</span>
        <textarea class="textarea" rows="2" data-step="${i}" aria-label="${i + 1}단계" placeholder="${i === 0 ? '예) 멸치와 다시마로 육수를 내요.' : ''}">${esc(s)}</textarea>
        <div class="step-actions">
          <button class="icon-btn" type="button" data-up="${i}" aria-label="위로" ${i === 0 ? 'disabled' : ''}>${icon('chev-up')}</button>
          <button class="icon-btn" type="button" data-down="${i}" aria-label="아래로" ${i === draft.steps.length - 1 ? 'disabled' : ''}>${icon('chev-down')}</button>
          <button class="icon-btn icon-btn--danger" type="button" data-rmstep="${i}" aria-label="단계 삭제">${icon('trash')}</button>
        </div>
      </li>`).join('');
  }

  /* ---------- Editor: open / save ---------- */
  function openForm(r) {
    const f = els.form;
    f.reset();
    f.elements.id.value = r?.id || '';
    f.elements.name.value = r?.name || '';
    f.elements.category.value = r?.category || '한식';
    f.elements.servings.value = r?.servings || 2;
    f.elements.time.value = r?.time ?? 30;
    f.elements.memo.value = r?.memo || '';
    draft = { ings: (r?.ingredients || []).map((x) => ({ ...x })), steps: r?.steps?.length ? [...r.steps] : [''] };
    picked = null;
    els.q.value = '';
    setUnits(CUSTOM_UNITS, 'g');
    els.amount.value = 100;
    renderPreview();
    renderDraft();
    renderSteps();
    $('#recipe-dlg-title').textContent = r ? '레시피 수정' : '새 레시피';
    $('#recipe-delete').hidden = !r;
    LM.ui.openDialog(els.dlg);
    f.elements.name.focus();
  }

  function onSubmit(e) {
    e.preventDefault();
    const f = els.form;
    const name = f.elements.name.value.trim();
    if (!name) { f.elements.name.focus(); return LM.ui.toast('요리 이름을 입력해 주세요.'); }
    const data = {
      name,
      category: f.elements.category.value,
      servings: Math.max(1, +f.elements.servings.value || 1),
      time: Math.max(0, +f.elements.time.value || 0),
      ingredients: draft.ings,
      steps: draft.steps.map((s) => s.trim()).filter(Boolean),
      memo: f.elements.memo.value.trim(),
    };
    const id = f.elements.id.value;
    if (id) LM.store.update(COL, id, data); else LM.store.create(COL, data);
    els.dlg.close();
    LM.ui.toast(id ? '레시피를 수정했어요.' : '요리 노트에 레시피를 담았어요.');
  }

  async function remove(id) {
    const r = LM.store.get(COL, id);
    if (!r || !(await LM.ui.confirm(`'${r.name}' 레시피를 삭제할까요?`))) return;
    LM.store.remove(COL, id);
    [els.dlg, els.view].forEach((x) => x.open && x.close());
    LM.ui.toast('레시피를 삭제했어요.');
  }

  /* ---------- Init ---------- */
  document.addEventListener('DOMContentLoaded', () => {
    Object.assign(els, {
      list: $('#recipe-list'), cats: $('#recipe-cat'), dlg: $('#dlg-recipe'), form: $('#recipe-form'), view: $('#dlg-recipe-view'),
      q: $('#ing-q'), suggest: $('#ing-suggest'), amount: $('#ing-amount'), unit: $('#ing-unit'), preview: $('#ing-preview'),
      rows: $('#ing-rows'), total: $('#nutri-total'), steps: $('#step-list'),
    });
    $('#recipe-form-cat').innerHTML = CATS.map((c) => `<option>${c}</option>`).join('');
    renderCats();

    // list
    $('[data-action="new-recipe"]').addEventListener('click', () => openForm(null));
    $('#recipe-search').addEventListener('input', debounce((e) => { state.q = e.target.value; render(); }, 150));
    els.cats.addEventListener('click', (e) => {
      const b = e.target.closest('[data-cat]');
      if (!b) return;
      state.cat = b.dataset.cat;
      renderCats();
      render();
    });
    els.list.addEventListener('click', (e) => { const b = e.target.closest('[data-open]'); if (b) openView(b.dataset.open); });

    // ingredient picker
    els.q.addEventListener('input', () => { picked = null; setUnits(CUSTOM_UNITS, els.unit.value); renderSuggest(); renderPreview(); });
    els.q.addEventListener('focus', renderSuggest);
    els.q.addEventListener('blur', () => setTimeout(closeSuggest, 150));
    els.q.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') closeSuggest();
      if (e.key === 'Enter') {
        e.preventDefault();
        if (!els.suggest.hidden && suggestions[0] && !picked) pick(suggestions[0]); else addIngredient();
      }
    });
    els.suggest.addEventListener('mousedown', (e) => e.preventDefault());
    els.suggest.addEventListener('click', (e) => {
      const b = e.target.closest('button');
      if (!b) return;
      if (b.dataset.i != null) pick(suggestions[+b.dataset.i]);
      else { closeSuggest(); els.amount.focus(); }
    });
    els.amount.addEventListener('input', renderPreview);
    els.amount.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); addIngredient(); } });
    els.unit.addEventListener('change', renderPreview);
    $('#ing-add').addEventListener('click', addIngredient);

    els.rows.addEventListener('input', (e) => {
      if (!e.target.matches('[data-amt]')) return;
      draft.ings[+e.target.dataset.amt].amount = +e.target.value || 0;
      const tr = e.target.closest('tr');
      const n = nutritionOf(draft.ings[+e.target.dataset.amt]);
      if (n) NUTRI.forEach(([k, , unit], j) => (tr.children[j + 2].textContent = `${val(k, n[k])}${unit === 'kcal' ? '' : unit}`));
      renderTotal();
    });
    els.rows.addEventListener('click', (e) => {
      const b = e.target.closest('[data-rm]');
      if (b) { draft.ings.splice(+b.dataset.rm, 1); renderDraft(); }
    });
    els.form.elements.servings.addEventListener('input', renderTotal);

    // nutrition mode toggle (editor & view)
    [els.total, els.view].forEach((root) => root.addEventListener('click', (e) => {
      const b = e.target.closest('[data-mode]');
      if (!b) return;
      mode = b.dataset.mode;
      if (root === els.total) renderTotal();
      else {
        const r = LM.store.get(COL, els.view.dataset.id);
        $('[data-view-total]', els.view).innerHTML = totalHTML(totalOf(r.ingredients), r.servings);
      }
    }));

    // steps
    els.steps.addEventListener('input', (e) => { if (e.target.matches('[data-step]')) draft.steps[+e.target.dataset.step] = e.target.value; });
    els.steps.addEventListener('click', (e) => {
      const b = e.target.closest('button');
      if (!b) return;
      const s = draft.steps;
      if (b.dataset.up) { const i = +b.dataset.up; [s[i - 1], s[i]] = [s[i], s[i - 1]]; }
      if (b.dataset.down) { const i = +b.dataset.down; [s[i + 1], s[i]] = [s[i], s[i + 1]]; }
      if (b.dataset.rmstep) { s.splice(+b.dataset.rmstep, 1); if (!s.length) s.push(''); }
      renderSteps();
    });
    $('#step-add').addEventListener('click', () => {
      draft.steps.push('');
      renderSteps();
      $$('[data-step]', els.steps).pop().focus();
    });

    els.form.addEventListener('submit', onSubmit);
    $('#recipe-delete').addEventListener('click', () => remove(els.form.elements.id.value));
    $('#rv-edit').addEventListener('click', () => { const r = LM.store.get(COL, els.view.dataset.id); els.view.close(); openForm(r); });
    $('#rv-delete').addEventListener('click', () => remove(els.view.dataset.id));

    LM.store.onChange((k) => { if (k === COL || k === '*') render(); });
    render();
  });
})();
