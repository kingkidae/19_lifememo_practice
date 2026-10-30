/* 나의 노트 — 탭 전환(해시 라우팅), 챕터 카운트, 히어로 요약 */
(function () {
  'use strict';
  const { $, $$, today } = LM.util;
  const PANELS = ['agenda', 'todo', 'journal', 'library', 'voyage', 'cuisine'];
  const COUNTS = ['schedules', 'todos', 'diaries', 'books', 'trips', 'recipes'];

  function activate(id, { focus = false, scroll = false, updateHash = true } = {}) {
    if (!PANELS.includes(id)) id = 'agenda';
    $$('[role="tab"]').forEach((t) => {
      const on = t.getAttribute('aria-controls') === id;
      t.setAttribute('aria-selected', on);
      t.tabIndex = on ? 0 : -1;
      if (on && focus) t.focus();
      // 모바일에서 선택된 탭이 보이도록 가로 스크롤만 이동
      if (on) t.parentElement.scrollTo({ left: t.offsetLeft - 16, behavior: 'smooth' });
    });
    PANELS.forEach((p) => ($('#' + p).hidden = p !== id));
    if (updateHash && location.hash !== '#' + id) history.replaceState(null, '', '#' + id);
    if (scroll) $('#notebook').scrollIntoView({ behavior: 'smooth' });
  }

  function renderSummary() {
    let total = 0;
    COUNTS.forEach((k) => {
      const n = LM.store.list(k).length;
      total += n;
      const el = $(`[data-count="${k}"]`);
      if (el) el.textContent = n;
    });
    $('[data-stat="total"]').textContent = total;
    $('[data-stat="today"]').textContent = LM.store.list('schedules').filter((e) => e.date === today()).length;
    $('[data-stat="todo"]').textContent = LM.store.list('todos').filter((t) => !t.done).length;
  }

  document.addEventListener('DOMContentLoaded', () => {
    const tablist = $('[role="tablist"]');
    tablist.addEventListener('click', (e) => {
      const t = e.target.closest('[role="tab"]');
      if (t) activate(t.getAttribute('aria-controls'));
    });
    // 키보드: ← → Home End
    tablist.addEventListener('keydown', (e) => {
      const tabs = $$('[role="tab"]', tablist);
      const i = tabs.indexOf(document.activeElement);
      if (i < 0) return;
      const next = { ArrowRight: i + 1, ArrowLeft: i - 1, Home: 0, End: tabs.length - 1 }[e.key];
      if (next == null) return;
      e.preventDefault();
      activate(tabs[(next + tabs.length) % tabs.length].getAttribute('aria-controls'), { focus: true });
    });

    $$('[data-tab]').forEach((a) => a.addEventListener('click', (e) => {
      e.preventDefault();
      activate(a.dataset.tab, { scroll: true });
    }));

    const fromHash = () => {
      const id = location.hash.slice(1);
      if (PANELS.includes(id)) activate(id, { scroll: true });
    };
    window.addEventListener('hashchange', fromHash);
    activate(location.hash.slice(1), { updateHash: false });
    if (PANELS.includes(location.hash.slice(1))) requestAnimationFrame(() => $('#notebook').scrollIntoView());

    LM.store.onChange(renderSummary);
    renderSummary();
  });
})();
