/* Interactive Course Reader Runtime */
const { docs, groups } = window.COURSE_DATA || JSON.parse(document.getElementById('course-data').textContent);
const staticMode = document.body.dataset.static === 'true';
const byId = new Map(docs.map((d) => [d.id, d]));
const $ = (id) => document.getElementById(id);
const escapeHTML = (s) =>
  s.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');
const route = (id, anchor) => staticMode
  ? './' + (id === 'overview' ? 'index' : id) + '.html' + (anchor ? '#' + encodeURIComponent(anchor) : '')
  : '#/' + id + (anchor ? '/' + encodeURIComponent(anchor) : '');
const pageLinks = (html) => staticMode ? html.replaceAll('href="../html/index.html"', 'href="./index.html"').replaceAll('href="../html/"', 'href="https://github.com/wanghao-SunSky/cs329z-chinese/tree/main/html"').replaceAll('href="../exercises/"', 'href="./lab20.html"').replace(/href="#\/([^/"]+)(?:\/([^"]*))?"/g, (_, id, anchor) => `href="${route(id, anchor ? decodeURIComponent(anchor) : '')}"`) : html;

let activeId;
let observer;

// Render sidebar navigation
$('course-nav').innerHTML = groups
  .map(
    (g) =>
      `<div class="nav-group"><p class="nav-label">${escapeHTML(g.label)}</p>${g.ids
        .map((id) => {
          const d = byId.get(id);
          return `<a class="nav-item" data-doc="${id}" href="${route(id)}">${
            d.num ? `<span class="num">${d.num}</span>` : ''
          }<span>${escapeHTML(d.label)}</span></a>`;
        })
        .join('')}</div>`
  )
  .join('');

function closeMenu() {
  document.body.classList.remove('nav-open');
  $('menu').setAttribute('aria-expanded', 'false');
}

function bindCopyButtons() {
  $('article')
    .querySelectorAll('.copy-btn')
    .forEach((btn) => {
      btn.onclick = async () => {
        const code = btn.closest('.code-block')?.querySelector('code')?.textContent || '';
        try {
          await navigator.clipboard.writeText(code);
          const prev = btn.textContent;
          btn.textContent = '已复制 ✓';
          setTimeout(() => {
            btn.textContent = prev;
          }, 1600);
        } catch {}
      };
    });
}

function render() {
  if (location.hash === '#main') {
    $('main').focus();
    return;
  }
  const parts = location.hash.replace(/^#\/?/, '').split('/');
  if (staticMode && location.hash.startsWith('#/') && byId.has(parts[0])) {
    location.replace(route(parts[0], decodeURIComponent(parts.slice(1).join('/'))));
    return;
  }
  const d = byId.get(staticMode ? document.body.dataset.initialDoc : parts[0]) || docs[0];
  let anchor = '';
  try {
    anchor = decodeURIComponent(staticMode ? location.hash.slice(1) : parts.slice(1).join('/'));
  } catch {}

  const changed = activeId !== d.id;
  if (changed) {
    activeId = d.id;
    document.body.dataset.doc = d.id;
    $('article').innerHTML = pageLinks(d.html);
    bindCopyButtons();

    $('home-intro').hidden = d.id !== 'overview';
    $('breadcrumb').textContent = d.num ? `${d.unit}  /  第 ${d.num} 讲 · ${d.label}` : `${d.unit}  /  ${d.label}`;
    $('chapter-meta').innerHTML =
      d.id === 'overview'
        ? ''
        : `<span class="badge">${escapeHTML(d.badge)}</span><span class="unit-name">${escapeHTML(
            d.unit
          )}</span><span class="read-time">预计阅读 ${d.readingMinutes} 分钟</span>`;

    if (!staticMode) document.title = `${d.label} · CS329Z AI Agent 系统工程`;

    document.querySelectorAll('.nav-item').forEach((a) => {
      const current = a.dataset.doc === d.id;
      a.classList.toggle('active', current);
      if (current) {
        a.setAttribute('aria-current', 'page');
        a.scrollIntoView({ block: 'nearest' });
      } else {
        a.removeAttribute('aria-current');
      }
    });

    $('toc-links').innerHTML = d.headings
      .filter((h) => h.depth === 2 || h.depth === 3)
      .map(
        (h) =>
          `<a class="depth-${h.depth}" href="${route(d.id, h.id)}" data-anchor="${escapeHTML(h.id)}">${escapeHTML(
            h.label
          )}</a>`
      )
      .join('');

    $('source-link').href = staticMode ? 'https://github.com/wanghao-SunSky/cs329z-chinese/blob/main/' + d.file : '../' + d.file;

    const index = docs.indexOf(d);
    const prev = docs[index - 1];
    const next = docs[index + 1];
    $('chapter-footer').innerHTML =
      (prev
        ? `<a href="${route(prev.id)}"><small>← 上一节</small>${
            prev.num ? `第 ${prev.num} 讲 · ` : ''
          }${escapeHTML(prev.label)}</a>`
        : '<span></span>') +
      (next
        ? `<a href="${route(next.id)}"><small>下一节 →</small>${
            next.num ? `第 ${next.num} 讲 · ` : ''
          }${escapeHTML(next.label)}</a>`
        : '<span></span>');

    observer?.disconnect();
    observer = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) {
            document
              .querySelectorAll('#toc-links a')
              .forEach((a) => a.classList.toggle('current', a.dataset.anchor === e.target.id));
          }
        }
      },
      { rootMargin: '-80px 0px -65% 0px' }
    );
    $('article')
      .querySelectorAll('h2, h3')
      .forEach((h) => observer.observe(h));
  }

  closeMenu();
  requestAnimationFrame(() => {
    const target = anchor && document.getElementById(anchor);
    if (target) target.scrollIntoView();
    else window.scrollTo(0, 0);
    updateProgress();
  });
}

function updateProgress() {
  const total = document.documentElement.scrollHeight - innerHeight;
  $('progress-bar').style.width = (total > 0 ? Math.min(100, (scrollY / total) * 100) : 100) + '%';
}

window.addEventListener('hashchange', render);
window.addEventListener('scroll', updateProgress, { passive: true });

$('menu').onclick = () => {
  const open = document.body.classList.toggle('nav-open');
  $('menu').setAttribute('aria-expanded', String(open));
};
$('shade').onclick = closeMenu;

// Theme toggle (Light / Dark)
const savedTheme = localStorage.getItem('cs329z_theme');
if (savedTheme === 'dark') {
  document.body.dataset.theme = 'dark';
  $('theme-toggle').textContent = '浅色模式';
}
$('theme-toggle').onclick = () => {
  const isDark = document.body.dataset.theme !== 'dark';
  document.body.dataset.theme = isDark ? 'dark' : 'light';
  $('theme-toggle').textContent = isDark ? '浅色模式' : '深色模式';
  try {
    localStorage.setItem('cs329z_theme', isDark ? 'dark' : 'light');
  } catch {}
};

// Font size toggle
$('font-size').onclick = () => {
  const large = document.body.dataset.large !== 'true';
  document.body.dataset.large = String(large);
  document.documentElement.style.setProperty('--body-size', large ? '18.5px' : '16.5px');
  $('font-size').textContent = large ? '字号 A−' : '字号 A+';
};

$('print').onclick = () => window.print();

// Full-text Search Dialog
const dialog = $('search-dialog');
const input = $('search-input');

function openSearch() {
  if (!dialog.open) dialog.showModal();
  input.focus();
  input.select();
}

$('open-search').onclick = openSearch;
$('mobile-search').onclick = openSearch;

document.addEventListener('keydown', (e) => {
  if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
    e.preventDefault();
    openSearch();
  }
  if (e.key === 'Escape') closeMenu();
});

dialog.addEventListener('click', (e) => {
  if (e.target === dialog) {
    const r = dialog.getBoundingClientRect();
    if (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom) {
      dialog.close();
    }
  }
});

const searchIndex = docs.flatMap((d) => {
  const box = document.createElement('div');
  box.innerHTML = d.html;
  const sections = [];
  let section;
  for (const element of box.children) {
    if (/^H[1-6]$/.test(element.tagName)) {
      section = { doc: d, id: element.id, title: element.textContent, text: '' };
      sections.push(section);
    } else if (section) {
      section.text += ' ' + element.textContent;
    }
  }
  return sections;
});

input.addEventListener('input', () => {
  const q = input.value.trim().toLowerCase();
  if (!q) {
    $('search-results').innerHTML = '';
    $('search-hint').textContent = '支持跨全部 19 讲课程、4 项实践与代码架构导读实时检索';
    return;
  }
  const matches = searchIndex.filter((s) => (s.title + ' ' + s.text).toLowerCase().includes(q));
  matches.sort((a, b) => Number(b.title.toLowerCase().includes(q)) - Number(a.title.toLowerCase().includes(q)));
  $('search-hint').textContent = `找到 ${matches.length} 处匹配${matches.length > 50 ? '（展示前 50 处）' : ''}`;
  $('search-results').innerHTML =
    matches
      .slice(0, 50)
      .map((s) => {
        const pos = s.text.toLowerCase().indexOf(q);
        const start = Math.max(0, pos - 40);
        const text = s.text.slice(start, start + 150).replace(/\s+/g, ' ');
        const safe = escapeHTML(text);
        const escapedQ = escapeHTML(q).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const snippet = safe.replace(new RegExp(escapedQ, 'gi'), (m) => '<mark>' + m + '</mark>');
        return `<a class="search-result" href="${route(s.doc.id, s.id)}"><strong>${escapeHTML(
          s.title
        )}</strong><span>${escapeHTML(s.doc.label)} · ${start ? '…' : ''}${snippet}</span></a>`;
      })
      .join('') || '<p class="search-hint">未找到相关结果，请尝试英文缩写或核心术语（如 RAG、BM25、MCP、GRPO）。</p>';
});

$('search-results').addEventListener('click', (e) => {
  if (e.target.closest('a')) {
    dialog.close();
    if (e.target.closest('a').hash === location.hash) render();
  }
});

document.addEventListener('click', (e) => {
  const a = e.target.closest('a');
  if (a?.getAttribute('href') === location.hash && location.hash.startsWith('#/')) {
    e.preventDefault();
    render();
  }
});

render();
