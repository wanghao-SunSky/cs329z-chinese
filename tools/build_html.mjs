/**
 * Build the standalone publication-grade HTML course documentation from Markdown files.
 * Zero external runtime or npm dependencies required (uses built-in GFM + LaTeX math parser).
 * Run: node tools/build_html.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const out = path.join(root, 'html');
const lectures = fs
  .readdirSync(root)
  .filter((f) => /^\d\d-.*\.md$/.test(f))
  .sort();

const groups = [
  ['课程导览', ['README.md']],
  ['一 · 基础与核心组件', lectures.slice(0, 4)],
  ['二 · 架构、记忆与优化', lectures.slice(4, 9)],
  ['三 · 数据飞轮与评测工程', lectures.slice(9, 14)],
  ['四 · 安全防护与前沿应用', lectures.slice(14, 19)],
  [
    '工程实践与代码指南',
    [
      'exercises/HW1-从零搭建Agent-Harness.md',
      'exercises/HW2-评测Agent.md',
      'exercises/学期项目-设计构建与评测.md',
      'exercises/Paper-Video-论文讲解与复现.md',
      'code-guide.md',
    ],
  ],
];

groups.push(['阅读说明', ['course-guide.md', 'docs/editorial-notes.md']]);

const files = groups.flatMap((g) => g[1]);
const ids = Object.fromEntries(
  files.map((f, i) => [
    f,
    i === 0 ? 'overview' : /^\d\d-/.test(f) ? 'lecture' + f.slice(0, 2) : 'lab' + i,
  ])
);

const esc = (s) =>
  s
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');

const plain = (s) =>
  s
    .replace(/<[^>]*>/g, '')
    .replaceAll('&amp;', '&')
    .replaceAll('&lt;', '<')
    .replaceAll('&gt;', '>')
    .replaceAll('&quot;', '"')
    .replace(/\s+/g, ' ')
    .trim();

const slug = (s) =>
  s
    .toLowerCase()
    .replaceAll('`', '')
    .replace(/[^\p{L}\p{N}\p{M}\-_ ]/gu, '')
    .replaceAll(' ', '-');

/**
 * Lightweight, dependency-free LaTeX math to semantic HTML converter for offline textbook rendering.
 */
function renderLatexToHtml(tex) {
  let s = esc(tex.trim());

  s = s.replace(/\\\{/g, '&#123;').replace(/\\\}/g, '&#125;');
  s = s.replace(/\\(?:left|right|big|Big|bigg|Bigg)\b/g, '');
  s = s.replace(/\\,/g, '&thinsp;').replace(/\\;/g, '&ensp;').replace(/\\quad/g, '&emsp;');

  for (let pass = 0; pass < 4; pass++) {
    s = s.replace(/\\text\{([^{}]*)\}/g, '<span class="m-text">$1</span>');
    s = s.replace(/\\(?:mathbf|boldsymbol)\{([^{}]*)\}/g, '<strong>$1</strong>');
    s = s.replace(/\\mathcal\{([^{}]*)\}/g, '<span class="m-cal">$1</span>');
    s = s.replace(/\\mathbb\{1\}/g, '&#120793;');
    s = s.replace(/\\mathbb\{E\}/g, '&#120124;');
    s = s.replace(/\\mathbb\{D\}/g, '&#120123;');
    s = s.replace(/\\mathbb\{R\}/g, '&#8477;');
    s = s.replace(/\\hat\{([^{}]*)\}/g, '$1&#770;');
    s = s.replace(/\\sqrt\{([^{}]*)\}/g, '&radic;<span class="m-sqrt">$1</span>');
  }

  for (let pass = 0; pass < 4; pass++) {
    s = s.replace(
      /\\binom\{([^{}]*)\}\{([^{}]*)\}/g,
      '<span class="m-binom">(<span class="m-frac"><span class="m-num">$1</span><span class="m-den">$2</span></span>)</span>'
    );
    s = s.replace(
      /\\frac\{([^{}]*)\}\{([^{}]*)\}/g,
      '<span class="m-frac"><span class="m-num">$1</span><span class="m-den">$2</span></span>'
    );
  }

  const symbols = {
    '\\alpha': '&alpha;',
    '\\beta': '&beta;',
    '\\gamma': '&gamma;',
    '\\delta': '&delta;',
    '\\epsilon': '&epsilon;',
    '\\varepsilon': '&varepsilon;',
    '\\eta': '&eta;',
    '\\theta': '&theta;',
    '\\kappa': '&kappa;',
    '\\lambda': '&lambda;',
    '\\mu': '&mu;',
    '\\pi': '&pi;',
    '\\rho': '&rho;',
    '\\sigma': '&sigma;',
    '\\tau': '&tau;',
    '\\phi': '&phi;',
    '\\psi': '&psi;',
    '\\omega': '&omega;',
    '\\Delta': '&Delta;',
    '\\Sigma': '&Sigma;',
    '\\sum': '<span class="m-op">&sum;</span>',
    '\\prod': '<span class="m-op">&prod;</span>',
    '\\top': '&#8868;',
    '\\infty': '&infin;',
    '\\approx': '&approx;',
    '\\propto': '&prop;',
    '\\neq': '&ne;',
    '\\le': '&le;',
    '\\leq': '&le;',
    '\\ge': '&ge;',
    '\\geq': '&ge;',
    '\\to': '&rarr;',
    '\\rightarrow': '&rarr;',
    '\\leftarrow': '&larr;',
    '\\leftrightarrow': '&harr;',
    '\\in': '&isin;',
    '\\notin': '&notin;',
    '\\cap': '&cap;',
    '\\cup': '&cup;',
    '\\emptyset': '&empty;',
    '\\cdot': '&middot;',
    '\\times': '&times;',
    '\\parallel': '&#8741;',
    '\\dots': '&hellip;',
    '\\ldots': '&hellip;',
    '\\cdots': '&ctdot;',
    '\\ln': '<span class="m-fn">ln</span>',
    '\\log': '<span class="m-fn">log</span>',
    '\\exp': '<span class="m-fn">exp</span>',
    '\\max': '<span class="m-fn">max</span>',
    '\\min': '<span class="m-fn">min</span>',
    '\\%': '%',
    '\\_': '_',
  };

  for (const [k, v] of Object.entries(symbols)) {
    s = s.replaceAll(k, v);
  }

  for (let pass = 0; pass < 3; pass++) {
    s = s.replace(/_\{([^{}]*)\}/g, '<sub>$1</sub>');
    s = s.replace(/\^\{([^{}]*)\}/g, '<sup>$1</sup>');
    s = s.replace(/_([a-zA-Z0-9+\-])/g, '<sub>$1</sub>');
    s = s.replace(/\^([a-zA-Z0-9+\-])/g, '<sup>$1</sup>');
  }

  return s;
}

/**
 * Self-contained GFM + LaTeX Markdown parser tailored for CS329Z course documents.
 */
function parseMarkdownDocument(rawMd, currentFile) {
  const headings = [];
  const usedIds = new Set();

  function resolveLink(href) {
    let url = href.trim();
    if (!/^[a-z][a-z\d+.-]*:/i.test(url)) {
      const [p, fragment] = url.split('#');
      const target = path.posix.normalize(
        path.posix.join(path.posix.dirname(currentFile), decodeURIComponent(p || path.posix.basename(currentFile)))
      );
      if (ids[target]) {
        url = '#/' + ids[target] + (fragment ? '/' + encodeURIComponent(decodeURIComponent(fragment)) : '');
      } else {
        url = path.posix.join('..', path.posix.dirname(currentFile), p) + (fragment ? '#' + fragment : '');
      }
    }
    return url;
  }

  function parseInline(text) {
    const slots = [];
    const saveSlot = (html) => {
      const i = slots.push(html) - 1;
      return `\u0000SLOT_${i}\u0000`;
    };

    // 1. Inline code `...`
    let s = text.replace(/`([^`\n]+)`/g, (_, code) => saveSlot(`<code>${esc(code)}</code>`));

    // 2. Inline math $...$
    s = s.replace(/\$([^\n$]+?)\$/g, (full, tex) => {
      if (/^\d/.test(tex.trim()) && !/[\\_^=<>+\-]/.test(tex)) return full;
      return saveSlot(`<span class="math-inline">${renderLatexToHtml(tex)}</span>`);
    });

    // 3. Explicit <br> tags used inside table cells
    s = s.replace(/<br\s*\/?>/gi, () => saveSlot('<br>'));

    // 4. Escape HTML entities in remaining text
    s = esc(s);

    // 5. Markdown links [text](url)
    s = s.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (_, label, rawHref) => {
      const rawUrl = rawHref.replaceAll('&amp;', '&');
      const resolved = resolveLink(rawUrl);
      const external = /^https?:/i.test(resolved);
      // Parse inline formatting inside link label
      const formattedLabel = label
        .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
        .replace(/\*([^*]+)\*/g, '<em>$1</em>');
      return saveSlot(
        `<a href="${esc(resolved)}"${external ? ' target="_blank" rel="noopener noreferrer"' : ''}>${formattedLabel}</a>`
      );
    });

    // 6. Bold **...** and Italic *...*
    s = s.replace(/\*\*([\s\S]+?)\*\*/g, '<strong>$1</strong>');
    s = s.replace(/\*([^\s*][^*]*?)\*/g, '<em>$1</em>');

    // Restore slots iteratively
    for (let pass = 0; pass < 3; pass++) {
      s = s.replace(/\u0000SLOT_(\d+)\u0000/g, (_, i) => slots[Number(i)]);
    }
    return s;
  }

  const lines = rawMd.replace(/\r\n/g, '\n').split('\n');
  const outHtml = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    // Blank line
    if (!line.trim()) {
      i++;
      continue;
    }

    // Fenced code block ```lang
    const fenceMatch = line.match(/^(\s*)```([^`]*)$/);
    if (fenceMatch) {
      const lang = (fenceMatch[2].trim() || 'text').toUpperCase();
      const codeLines = [];
      i++;
      while (i < lines.length && !/^\s*```\s*$/.test(lines[i])) {
        codeLines.push(lines[i]);
        i++;
      }
      if (i < lines.length) i++; // skip closing ```
      outHtml.push(
        `<div class="code-block"><div class="code-header"><span class="code-lang">${esc(
          lang
        )}</span><button type="button" class="copy-btn" aria-label="复制代码">复制代码</button></div><pre><code>${esc(
          codeLines.join('\n')
        )}</code></pre></div>`
      );
      continue;
    }

    // Display math block $$...$$
    if (line.trim().startsWith('$$')) {
      let tex = line.trim().slice(2);
      if (tex.endsWith('$$') && tex.length > 2) {
        tex = tex.slice(0, -2);
        i++;
      } else {
        const mathLines = [tex];
        i++;
        while (i < lines.length && !lines[i].trim().endsWith('$$')) {
          mathLines.push(lines[i]);
          i++;
        }
        if (i < lines.length) {
          mathLines.push(lines[i].trim().slice(0, -2));
          i++;
        }
        tex = mathLines.join('\n');
      }
      outHtml.push(`<div class="math-block">${renderLatexToHtml(tex)}</div>`);
      continue;
    }

    // Horizontal rule ---
    if (/^---+\s*$/.test(line.trim())) {
      outHtml.push('<hr>');
      i++;
      continue;
    }

    // Heading # ...
    const headingMatch = line.match(/^(#{1,6})\s+(.+)$/);
    if (headingMatch) {
      const depth = headingMatch[1].length;
      const rawTitle = headingMatch[2].trim();
      const renderedTitle = parseInline(rawTitle);
      const idText = rawTitle.replace(/\$([^$]+)\$/g, '$1');
      const base = slug(idText);
      let id = base;
      let n = 0;
      while (usedIds.has(id)) id = `${base}-${++n}`;
      usedIds.add(id);
      headings.push({ id, depth, label: plain(renderedTitle) });
      outHtml.push(`<h${depth} id="${esc(id)}">${renderedTitle}</h${depth}>`);
      i++;
      continue;
    }

    // GFM Table
    if (
      line.trim().startsWith('|') &&
      i + 1 < lines.length &&
      /^\s*\|[\s\-:|]+\|\s*$/.test(lines[i + 1])
    ) {
      const parseRow = (rowLine) =>
        rowLine
          .trim()
          .replace(/^\|/, '')
          .replace(/\|$/, '')
          .split('|')
          .map((c) => c.trim());

      const headers = parseRow(line);
      const aligns = parseRow(lines[i + 1]).map((a) => {
        if (a.startsWith(':') && a.endsWith(':')) return ' style="text-align:center"';
        if (a.endsWith(':')) return ' style="text-align:right"';
        return '';
      });
      i += 2;
      const bodyRows = [];
      while (i < lines.length && lines[i].trim().startsWith('|')) {
        bodyRows.push(parseRow(lines[i]));
        i++;
      }
      const thead = `<thead><tr>${headers
        .map((h, idx) => `<th${aligns[idx] || ''}>${parseInline(h)}</th>`)
        .join('')}</tr></thead>`;
      const tbody = `<tbody>${bodyRows
        .map(
          (r) =>
            `<tr>${headers
              .map((_, idx) => `<td${aligns[idx] || ''}>${parseInline(r[idx] || '')}</td>`)
              .join('')}</tr>`
        )
        .join('')}</tbody>`;
      outHtml.push(`<div class="table-scroll" tabindex="0"><table>${thead}${tbody}</table></div>`);
      continue;
    }

    // Blockquote > ...
    if (line.trim().startsWith('>')) {
      const quoteLines = [];
      while (i < lines.length && lines[i].trim().startsWith('>')) {
        quoteLines.push(lines[i].replace(/^\s*>\s?/, ''));
        i++;
      }
      const paragraphs = quoteLines
        .join('\n')
        .split(/\n{2,}/)
        .map((p) => `<p>${parseInline(p.trim())}</p>`)
        .join('');
      outHtml.push(`<blockquote>${paragraphs}</blockquote>`);
      continue;
    }

    // Lists (unordered - / * / • or ordered 1.)
    const listMatch = line.match(/^(\s*)(?:([-*•])|(\d+)\.)\s+(.+)$/);
    if (listMatch) {
      const isOrdered = Boolean(listMatch[3]);
      const tag = isOrdered ? 'ol' : 'ul';
      const items = [];

      while (i < lines.length) {
        const m = lines[i].match(/^(\s*)(?:([-*•])|(\d+)\.)\s+(.+)$/);
        if (!m) break;
        const itemLines = [m[4]];
        i++;
        // Collect indented continuation lines, sub-lists, or code blocks inside the list item
        while (i < lines.length) {
          const nextLine = lines[i];
          if (!nextLine.trim()) {
            if (i + 1 < lines.length && /^\s{2,}\S/.test(lines[i + 1])) {
              itemLines.push('');
              i++;
              continue;
            }
            break;
          }
          if (/^\s{2,}/.test(nextLine)) {
            itemLines.push(nextLine.replace(/^\s{2,4}/, ''));
            i++;
          } else {
            break;
          }
        }

        // Render item body: check if it has sub-lists or display math
        const rawItem = itemLines.join('\n');
        if (/\n\s*(?:[-*•]|\d+\.)\s+|\n\s*\$\$|\n\s*```/.test(rawItem)) {
          const firstBreak = rawItem.indexOf('\n');
          const lead = parseInline(rawItem.slice(0, firstBreak).trim());
          const restHtml = parseMarkdownDocument(rawItem.slice(firstBreak + 1), currentFile).html;
          items.push(`<li>${lead}${restHtml}</li>`);
        } else {
          items.push(`<li>${parseInline(rawItem.replace(/\n+/g, ' ').trim())}</li>`);
        }
      }

      outHtml.push(`<${tag}>${items.join('')}</${tag}>`);
      continue;
    }

    // Standard Paragraph
    const paraLines = [];
    while (
      i < lines.length &&
      lines[i].trim() &&
      !/^(#{1,6}\s|```|\$\$|---+\s*$|>\s?|\s*(?:[-*•]|\d+\.)\s+|\s*\|)/.test(lines[i])
    ) {
      paraLines.push(lines[i].trim());
      i++;
    }
    if (paraLines.length) {
      outHtml.push(`<p>${parseInline(paraLines.join(' '))}</p>`);
    } else {
      i++;
    }
  }

  return { html: outHtml.join('\n'), headings };
}

function getCategoryMeta(file, num) {
  if (file === 'README.md') return { unit: '课程总览', badge: 'COURSE OVERVIEW' };
  if (num) {
    const n = Number(num);
    if (n <= 4) return { unit: '一 · 基础与核心组件', badge: `LECTURE ${num}` };
    if (n <= 9) return { unit: '二 · 架构、记忆与优化', badge: `LECTURE ${num}` };
    if (n <= 14) return { unit: '三 · 数据飞轮与评测工程', badge: `LECTURE ${num}` };
    return { unit: '四 · 安全防护与前沿应用', badge: `LECTURE ${num}` };
  }
  if (file.startsWith('exercises/')) return { unit: '工程实践指南', badge: 'ENGINEERING LAB' };
  return { unit: '配套代码架构', badge: 'CODE ARCHITECTURE' };
}

const docs = files.map((file) => {
  const rawMd = fs.readFileSync(path.join(root, file), 'utf8');
  const { html, headings } = parseMarkdownDocument(rawMd, file);

  const title = headings[0]?.label || file;
  const num = /^\d\d/.exec(file)?.[0] || null;
  let label = num
    ? title.replace(/^第\s*\d+\s*讲[｜|:： ]*/, '')
    : file === 'README.md'
    ? '课程总览与学习路径'
    : title.replace(/^[A-Za-z0-9\u4e00-\u9fa5 ]+[｜|:：]\s*/, '');
  if (file.includes('HW1')) label = 'HW1：从零搭建 Agent Harness';
  if (file.includes('HW2')) label = 'HW2：构建 Agent 评测体系';
  if (file.includes('学期项目')) label = '学期项目：设计、构建与评测';
  if (file.includes('Paper-Video')) label = '论文精读与复现扩展';
  if (file === 'code-guide.md') label = '配套代码架构导读';
  if (file === 'course-guide.md') label = '课程目录与学习路径';
  if (file === 'docs/editorial-notes.md') label = '编写说明与待修订问题';

  const { unit, badge } = getCategoryMeta(file, num);
  const plainText = plain(html);
  const charCount = plainText.replace(/\s+/g, '').length;
  const readingMinutes = Math.max(5, Math.round(charCount / 450));

  return {
    id: ids[file],
    file,
    title,
    label,
    num,
    unit,
    badge,
    readingMinutes,
    html,
    headings,
    text: plainText,
  };
});

const css = fs.readFileSync(path.join(root, 'tools/reader.css'), 'utf8');
const js = fs.readFileSync(path.join(root, 'tools/reader.js'), 'utf8');
const data = JSON.stringify({
  docs,
  groups: groups.map(([label, groupFiles]) => ({
    label,
    ids: groupFiles.map((f) => ids[f]),
  })),
}).replaceAll('<', '\\u003c');

const html = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>CS329Z · AI Agent 系统工程（Engineering AI Agents）</title>
  <style>${css}</style>
</head>
<body>
  <a class="skip" href="#main">跳到正文</a>

  <aside class="sidebar" id="sidebar">
    <div class="sidebar-header">
      <a class="brand" href="#/overview">
        <span class="brand-code">CS329Z<span class="brand-dot">.</span></span>
        <span class="brand-sub">ENGINEERING AI AGENTS</span>
      </a>
      <p class="edition">AI Agent 系统工程教程 <span>中文学习资料</span></p>
      <button type="button" class="search-trigger" id="open-search">
        <span class="search-trigger-text">搜索课程、概念与算法…</span>
        <kbd>⌘K</kbd>
      </button>
    </div>
    <nav id="course-nav" aria-label="课程章节导航"></nav>
    <div class="sidebar-foot">
      <span>CS329Z · Engineering AI Agents</span>
      <span>System · Data · Evals</span>
    </div>
  </aside>

  <div class="shade" id="shade"></div>

  <div class="workspace">
    <header class="topbar">
      <div class="topbar-left">
        <button type="button" id="menu" class="mobile-only" aria-label="打开课程目录" aria-expanded="false" aria-controls="sidebar">目录</button>
        <div id="breadcrumb" class="breadcrumb">课程总览</div>
      </div>
      <div class="reading-tools">
        <button type="button" id="mobile-search" class="mobile-only" aria-label="打开搜索">搜索</button>
        <button type="button" id="theme-toggle" aria-label="切换深浅色主题">深色模式</button>
        <button type="button" id="font-size" aria-label="切换阅读字号">字号 A+</button>
        <button type="button" id="print" aria-label="打印或导出 PDF">打印 / PDF</button>
      </div>
    </header>

    <div class="reading-progress" aria-hidden="true">
      <div id="progress-bar"></div>
    </div>

    <div class="reading-layout">
      <main id="main" tabindex="-1">
        <div class="chapter-meta" id="chapter-meta"></div>

        <section class="home-intro" id="home-intro">
          <p class="eyebrow">CS329Z 中文教程 · ENGINEERING AI AGENTS</p>
          <h1>从理解语言模型，<br>到构建可靠的 <em>AI Agent</em> 系统。</h1>
          <p class="hero-lead">面向 Python 开发者的中文自学教程，包含 19 讲、4 项实践和配套代码导读。从 RAG、工具调用开始，逐步学习记忆、协作、评测与安全。</p>
          <div class="hero-bottom">
            <div class="hero-stats">
              <span><strong>19</strong> 讲核心课程</span>
              <span><strong>4</strong> 项工程实践</span>
              <span><strong>2</strong> 套配套源码解析</span>
            </div>
            <div class="hero-actions">
              <a class="start-link" href="#/lecture01">开始第 01 讲 <span>→</span></a>
              <a class="secondary-link" href="#/lab20">进入 HW1 实战</a>
            </div>
          </div>
        </section>

        <article id="article">${docs[0].html}</article>
        <nav id="chapter-footer" aria-label="章节翻页"></nav>
      </main>

      <aside class="toc" aria-label="本节大纲">
        <div class="toc-card">
          <div class="toc-label">本讲目录</div>
          <nav id="toc-links"></nav>
          <a class="source-link" id="source-link" href="../README.md">查看 Markdown 源文件 ↗</a>
        </div>
      </aside>
    </div>

    <footer class="page-footer">
      <span>CS329Z · AI Agent 系统工程（Engineering AI Agents）</span>
      <a href="https://github.com/wanghao-SunSky/cs329z-chinese">GitHub · Markdown 与 HTML</a>
    </footer>
  </div>

  <dialog id="search-dialog">
    <form method="dialog" class="search-head">
      <label for="search-input">搜索</label>
      <input id="search-input" type="search" placeholder="输入概念、算法、论文或练习关键词（如 ReAct, BM25, GRPO, MCP）…" autocomplete="off">
      <button type="submit" aria-label="关闭搜索">ESC</button>
    </form>
    <p class="search-hint" id="search-hint">支持跨全部 19 讲课程、4 项实践与代码架构导读实时检索</p>
    <div id="search-results" aria-live="polite"></div>
  </dialog>

  <noscript><p>请启用 JavaScript 以使用交互式章节导航与全文检索。</p></noscript>
  <script id="course-data" type="application/json">${data}</script>
  <script>${js}</script>
</body>
</html>`;

fs.mkdirSync(out, { recursive: true });
fs.writeFileSync(path.join(out, 'index.html'), html);
console.log(
  JSON.stringify({
    documents: docs.length,
    lectures: lectures.length,
    headings: docs.reduce((n, d) => n + d.headings.length, 0),
    bytes: Buffer.byteLength(html),
  })
);
