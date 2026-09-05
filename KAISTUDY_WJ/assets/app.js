/* Plain JavaScript: works from file:// and from any static hosting subdirectory. */
(() => {
  'use strict';
  const $ = s => document.querySelector(s);
  const $$ = s => [...document.querySelectorAll(s)];
  const mobile = () => matchMedia('(max-width: 900px)').matches;
  const sidebarToggle = $('#toggle-sidebar');
  const shade = $('#sidebar-shade');
  const sidebar = $('#sidebar');
  function syncSidebar() {
    const open = mobile() ? document.body.classList.contains('sidebar-open') : !document.body.classList.contains('sidebar-collapsed');
    sidebarToggle.setAttribute('aria-expanded', String(open));
    sidebar.inert = !open;
    shade.hidden = !(mobile() && open);
  }
  function closeSidebar() {
    document.body.classList.remove('sidebar-open');
    syncSidebar();
    sidebarToggle.focus();
  }
  sidebarToggle.addEventListener('click', () => {
    document.body.classList.toggle(mobile() ? 'sidebar-open' : 'sidebar-collapsed');
    syncSidebar();
    if (mobile() && document.body.classList.contains('sidebar-open')) $('#course-search').focus();
  });
  $('#close-sidebar').addEventListener('click', closeSidebar);
  shade.addEventListener('click', closeSidebar);
  matchMedia('(max-width: 900px)').addEventListener('change', () => {
    document.body.classList.remove('sidebar-open');
    syncSidebar();
  });
  syncSidebar();
  $('#course-search').addEventListener('input', e => {
    const q = e.target.value.trim().toLocaleLowerCase();
    let visible = 0;
    $$('.course-link').forEach(a => {
      a.hidden = !a.textContent.toLocaleLowerCase().includes(q);
      if (!a.hidden) visible++;
    });
    $$('.nav-group').forEach(p => {
      let sibling = p.nextElementSibling, any = false;
      while (sibling && sibling.classList.contains('course-link')) {
        if (!sibling.hidden) any = true;
        sibling = sibling.nextElementSibling;
      }
      p.hidden = !any;
    });
    $('#no-courses').hidden = visible > 0;
  });

  const toc = $('#toc');
  const tocButton = $('#toggle-toc');
  const wideToc = () => matchMedia('(min-width: 1261px)').matches;
  function updateTocLabel() {
    tocButton.setAttribute('aria-expanded', String(wideToc() ? !$('.reading-layout').classList.contains('toc-hidden') : toc.classList.contains('open')));
  }
  tocButton.addEventListener('click', () => {
    if (wideToc()) $('.reading-layout').classList.toggle('toc-hidden');
    else toc.classList.toggle('open');
    updateTocLabel();
  });
  function closeToc() { toc.classList.remove('open'); updateTocLabel(); }
  $('#close-toc').addEventListener('click', () => { closeToc(); tocButton.focus(); });
  $$('#toc nav a').forEach(a => a.addEventListener('click', closeToc));
  matchMedia('(min-width: 1261px)').addEventListener('change', updateTocLabel);
  updateTocLabel();
  function syncThemeButton() {
    const dark = document.documentElement.dataset.theme === 'dark';
    $('#theme-toggle').setAttribute('aria-label', dark ? '밝은 화면으로 전환' : '어두운 화면으로 전환');
  }
  $('#theme-toggle').addEventListener('click', () => {
    const theme = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
    document.documentElement.dataset.theme = theme;
    try { localStorage.setItem('pharm-theme', theme); } catch (_) { /* Storage may be disabled. */ }
    syncThemeButton();
  });
  syncThemeButton();
  let printClosedDetails = [];
  window.addEventListener('beforeprint', () => {
    printClosedDetails = $$('details:not([open])');
    printClosedDetails.forEach(d => d.open = true);
  });
  window.addEventListener('afterprint', () => printClosedDetails.forEach(d => d.open = false));
  $('#print-page').addEventListener('click', () => window.print());
  $('#back-top').addEventListener('click', () => window.scrollTo({top: 0, behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth'}));
  let scrollPending = false;
  function updateReading() {
    const total = document.documentElement.scrollHeight - innerHeight;
    $('#reading-progress').style.width = (total > 0 ? Math.min(100, scrollY / total * 100) : 100) + '%';
    const headings = $$('#answer h2');
    let current = headings[0]?.id;
    for (const h of headings) { if (h.getBoundingClientRect().top <= 150) current = h.id; }
    $$('#toc nav a').forEach(a => a.classList.toggle('active', a.hash === '#' + current));
    scrollPending = false;
  }
  addEventListener('scroll', () => { if (!scrollPending) { scrollPending = true; requestAnimationFrame(updateReading); } }, {passive:true});
  addEventListener('resize', updateReading);
  updateReading();

  const dialog = $('#image-dialog');
  let imageTrigger;
  $$('.image-open').forEach(button => button.addEventListener('click', () => {
    const img = button.querySelector('img');
    imageTrigger = button;
    $('#zoomed-image').src = img.src;
    $('#zoomed-image').alt = img.alt;
    $('#image-original').href = img.src;
    dialog.showModal();
    $('#close-image').focus();
  }));
  $('#close-image').addEventListener('click', () => dialog.close());
  dialog.addEventListener('click', e => { if (e.target === dialog) { const r = dialog.getBoundingClientRect(); if (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom) dialog.close(); } });
  dialog.addEventListener('close', () => imageTrigger?.focus());

  const answer = $('#answer');
  let matches = [], selected = -1, lastQuery = '', findTimer;
  const count = $('#find-count');
  function clearMatches() {
    answer.querySelectorAll('mark[data-search]').forEach(mark => mark.replaceWith(document.createTextNode(mark.textContent)));
    answer.normalize();
    matches = []; selected = -1;
  }
  function selectMatch(index, scroll = true) {
    if (!matches.length) return;
    matches[selected]?.classList.remove('search-current');
    selected = (index + matches.length) % matches.length;
    const mark = matches[selected];
    mark.classList.add('search-current');
    let parent = mark.parentElement;
    while (parent) { if (parent.tagName === 'DETAILS') parent.open = true; parent = parent.parentElement; }
    count.value = `${selected + 1} / ${matches.length}`;
    if (scroll) mark.scrollIntoView({block:'center', behavior:'instant'});
  }
  function find(query, scroll = true) {
    clearMatches(); lastQuery = query;
    if (!query) { count.value = ''; syncFindButtons(); return; }
    const walker = document.createTreeWalker(answer, NodeFilter.SHOW_TEXT, {acceptNode(node) {
      if (!node.textContent.trim() || node.parentElement.closest('script,style,button')) return NodeFilter.FILTER_REJECT;
      return NodeFilter.FILTER_ACCEPT;
    }});
    const nodes = []; while (walker.nextNode()) nodes.push(walker.currentNode);
    const q = query.toLocaleLowerCase();
    for (const node of nodes) {
      const raw = node.textContent, lower = raw.toLocaleLowerCase();
      let start = 0, at = lower.indexOf(q), fragment;
      if (at < 0) continue;
      fragment = document.createDocumentFragment();
      while (at >= 0) {
        fragment.append(document.createTextNode(raw.slice(start, at)));
        const mark = document.createElement('mark'); mark.dataset.search = ''; mark.textContent = raw.slice(at, at + query.length);
        fragment.append(mark); matches.push(mark); start = at + query.length; at = lower.indexOf(q, start);
      }
      fragment.append(document.createTextNode(raw.slice(start))); node.replaceWith(fragment);
    }
    if (matches.length) selectMatch(0, scroll); else count.value = '결과 없음';
    syncFindButtons();
  }
  function syncFindButtons() { $('#find-prev').disabled = !matches.length; $('#find-form button[type="submit"]').disabled = !$('#find-input').value.trim(); }
  $('#find-input').addEventListener('input', e => { clearTimeout(findTimer); findTimer = setTimeout(() => find(e.target.value.trim()), 230); });
  $('#find-form').addEventListener('submit', e => {
    e.preventDefault(); clearTimeout(findTimer);
    const query = $('#find-input').value.trim();
    if (query !== lastQuery) find(query); else selectMatch(selected + 1);
  });
  $('#find-prev').addEventListener('click', () => selectMatch(selected - 1));
  $('#find-input').addEventListener('keydown', e => {
    if (e.key === 'Enter' && e.shiftKey) { e.preventDefault(); selectMatch(selected - 1); }
  });
  syncFindButtons();
  addEventListener('keydown', e => {
    if (e.key === 'Escape') {
      if (dialog.open) return;
      if (document.body.classList.contains('sidebar-open')) closeSidebar();
      else if (toc.classList.contains('open')) { closeToc(); tocButton.focus(); }
      else if (document.activeElement === $('#find-input')) { clearTimeout(findTimer); $('#find-input').value = ''; find(''); $('#find-input').blur(); }
    }
    if (e.key === 'Tab' && mobile() && document.body.classList.contains('sidebar-open')) {
      const items = [...sidebar.querySelectorAll('a,button,input')].filter(el => !el.hidden && el.getClientRects().length);
      const first = items[0], last = items[items.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    }
  });
})();
