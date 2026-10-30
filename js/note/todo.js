/* 02 · 할 일 목록 — 추가 / 완료 토글 / 인라인 수정 / 삭제 */
(function () {
  'use strict';
  const { $, esc, icon, today, fmtDate, diffDays } = LM.util;
  const COL = 'todos';
  const PRIO = { 1: '높음', 2: '보통', 3: '낮음' };
  let filter = 'all';
  const els = {};

  const sorter = (a, b) =>
    (a.done - b.done) ||
    ((a.priority || 2) - (b.priority || 2)) ||
    ((a.due || '9999').localeCompare(b.due || '9999')) ||
    a.createdAt.localeCompare(b.createdAt);

  function dueLabel(due, done) {
    if (!due) return '';
    const gap = diffDays(due, today());
    let cls = 'due';
    let txt = `${fmtDate(due, { noYear: true, week: false })}까지`;
    if (!done && gap < 0) { cls += ' is-overdue'; txt += ` · ${-gap}일 지남`; }
    else if (!done && gap === 0) { cls += ' is-today'; txt = '오늘 마감'; }
    else if (!done && gap <= 3) txt += ` · D-${gap}`;
    return `<span class="${cls}">${txt}</span>`;
  }

  function render() {
    const all = LM.store.list(COL);
    const done = all.filter((t) => t.done).length;
    const list = all.filter((t) => filter === 'all' || (filter === 'done' ? t.done : !t.done)).sort(sorter);

    els.bar.style.width = all.length ? `${(done / all.length) * 100}%` : '0';
    els.count.textContent = all.length ? `${all.length}개 중 ${done}개 완료` : '할 일이 없어요';
    els.clear.disabled = !done;

    els.list.innerHTML = list.length
      ? list.map((t) => `
        <li class="todo-item ${t.done ? 'is-done' : ''}" data-id="${t.id}">
          <label class="check"><input type="checkbox" data-toggle ${t.done ? 'checked' : ''}><span class="sr-only">${esc(t.text)} 완료</span></label>
          <div class="todo-main">
            <p class="todo-text" data-text title="두 번 눌러 수정">${esc(t.text)}</p>
            <div class="todo-meta"><span class="prio prio-${t.priority}">${PRIO[t.priority] || '보통'}</span>${dueLabel(t.due, t.done)}</div>
          </div>
          <div class="item-actions">
            <button class="icon-btn" type="button" data-edit aria-label="수정">${icon('edit')}</button>
            <button class="icon-btn icon-btn--danger" type="button" data-del aria-label="삭제">${icon('trash')}</button>
          </div>
        </li>`).join('')
      : `<li class="empty"><strong>${filter === 'done' ? '아직 완료한 일이 없어요' : '할 일이 비어 있어요'}</strong>위 입력창에 오늘의 할 일을 적어 보세요.</li>`;
  }

  /** 인라인 수정: 텍스트·우선순위·마감일 */
  function startEdit(li) {
    const t = LM.store.get(COL, li.dataset.id);
    if (!t || li.querySelector('.todo-edit')) return;
    const main = li.querySelector('.todo-main');
    main.innerHTML = `
      <form class="todo-edit input-row">
        <input class="input" name="text" value="${esc(t.text)}" maxlength="120" required aria-label="할 일 내용">
        <select class="select" name="priority" aria-label="우선순위" style="width:84px">
          ${[1, 2, 3].map((p) => `<option value="${p}" ${t.priority == p ? 'selected' : ''}>${PRIO[p]}</option>`).join('')}
        </select>
        <input class="input" type="date" name="due" value="${t.due || ''}" aria-label="마감일" style="max-width:150px">
        <button class="btn btn--primary btn--sm" type="submit">저장</button>
      </form>`;
    const form = main.querySelector('form');
    const input = form.elements.text;
    input.focus();
    input.setSelectionRange(input.value.length, input.value.length);
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      const text = input.value.trim();
      if (!text) return input.focus();
      LM.store.update(COL, t.id, { text, priority: +form.elements.priority.value, due: form.elements.due.value });
    });
    form.addEventListener('keydown', (e) => { if (e.key === 'Escape') render(); });
  }

  document.addEventListener('DOMContentLoaded', () => {
    Object.assign(els, {
      form: $('#todo-form'), list: $('#todo-list'), bar: $('#todo-bar'), count: $('#todo-count'), clear: $('#todo-clear'),
    });

    // Create
    els.form.addEventListener('submit', (e) => {
      e.preventDefault();
      const text = els.form.elements.text.value.trim();
      if (!text) return;
      LM.store.create(COL, { text, done: false, priority: +els.form.elements.priority.value, due: els.form.elements.due.value });
      els.form.reset();
      els.form.elements.text.focus();
    });

    // Update / Delete
    els.list.addEventListener('change', (e) => {
      if (!e.target.matches('[data-toggle]')) return;
      const id = e.target.closest('[data-id]').dataset.id;
      LM.store.update(COL, id, { done: e.target.checked });
    });
    els.list.addEventListener('click', (e) => {
      const li = e.target.closest('[data-id]');
      if (!li) return;
      if (e.target.closest('[data-edit]')) startEdit(li);
      if (e.target.closest('[data-del]')) {
        LM.store.remove(COL, li.dataset.id);
        LM.ui.toast('할 일을 삭제했어요.');
      }
    });
    els.list.addEventListener('dblclick', (e) => {
      if (e.target.closest('[data-text]')) startEdit(e.target.closest('[data-id]'));
    });

    $('#todo-filter').addEventListener('click', (e) => {
      const b = e.target.closest('[data-filter]');
      if (!b) return;
      filter = b.dataset.filter;
      $('#todo-filter').querySelectorAll('button').forEach((x) => x.setAttribute('aria-pressed', x === b));
      render();
    });

    els.clear.addEventListener('click', async () => {
      if (!(await LM.ui.confirm('완료한 항목을 모두 지울까요?', { ok: '지우기' }))) return;
      const n = LM.store.removeWhere(COL, (t) => t.done);
      LM.ui.toast(`${n}개 항목을 지웠어요.`);
    });

    LM.store.onChange((k) => { if (k === COL || k === '*') render(); });
    render();
  });
})();
