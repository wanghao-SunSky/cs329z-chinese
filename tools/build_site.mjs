/** Build the offline reader plus crawlable, pre-rendered chapter pages. */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const out = path.join(root, 'html');
const origin = 'https://cs329z-course-review-20261029.wanghao162263.chatgpt.site';
const github = 'https://github.com/wanghao-SunSky/cs329z-chinese';
const esc = (s) => s.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');
const plain = (s) => s.replace(/<[^>]+>/g, '').replace(/&[a-z#\d]+;/gi, ' ').replace(/\s+/g, ' ').trim();
const filename = (id) => (id === 'overview' ? 'index' : id) + '.html';
const route = (id, anchor = '') => './' + filename(id) + (anchor ? '#' + anchor : '');
const links = (s) => s.replaceAll('href="../html/index.html"', 'href="./index.html"').replaceAll('href="../html/"', 'href="https://github.com/wanghao-SunSky/cs329z-chinese/tree/main/html"').replaceAll('href="../exercises/"', 'href="./lab20.html"').replace(/href="#\/([^/"\s]+)(?:\/([^"\s]*))?"/g, (_, id, anchor) => `href="${route(id, anchor)}"`);

execFileSync(process.execPath, [path.join(root, 'tools/build_html.mjs')], { stdio: 'inherit' });
const template = fs.readFileSync(path.join(out, 'index.html'), 'utf8');
const match = template.match(/<script id="course-data" type="application\/json">(.*?)<\/script>/s);
const data = JSON.parse(match[1]);
const { docs, groups } = data;
const byId = new Map(docs.map(d => [d.id, d]));
fs.mkdirSync(path.join(out, 'assets'), { recursive: true });
fs.writeFileSync(path.join(out, 'assets/course-data.js'), 'window.COURSE_DATA = ' + match[1] + ';\n');
for (const f of ['reader.css', 'reader.js']) fs.copyFileSync(path.join(root, 'tools', f), path.join(out, 'assets', f));
fs.writeFileSync(path.join(out, 'offline.html'), template.replace('</head>', `<meta name="robots" content="noindex,follow"><link rel="canonical" href="${origin}/"></head>`));

for (const [i, d] of docs.entries()) {
  const url = origin + (d.id === 'overview' ? '/' : '/' + filename(d.id));
  const title = d.id === 'overview' ? 'Stanford CS329Z 中文教程 | Engineering AI Agents' : `${d.label} | CS329Z 中文教程`;
  const description = d.id === 'overview'
    ? '面向 Python 开发者的 AI Agent 中文自学教程：19 讲、4 项实践与代码导读，涵盖大语言模型、RAG、工具调用、记忆、多 Agent 协作、评测和安全。支持在线阅读与离线下载。'
    : plain(d.html.match(/<p>(.*?)<\/p>/s)?.[1] || d.text).slice(0, 145);
  const schema = {
    '@context': 'https://schema.org', '@type': 'TechArticle',
    headline: title, description, inLanguage: 'zh-CN', url,
    mainEntityOfPage: url, isAccessibleForFree: true,
    isBasedOn: 'https://cs329z.stanford.edu/',
    about: ['AI Agent', '大语言模型', d.label],
  };
  const metadata = `<meta name="description" content="${esc(description)}">
  <meta name="robots" content="index,follow">
  <link rel="canonical" href="${url}">
  <meta property="og:type" content="article">
  <meta property="og:locale" content="zh_CN">
  <meta property="og:site_name" content="CS329Z 中文教程">
  <meta property="og:title" content="${esc(title)}">
  <meta property="og:description" content="${esc(description)}">
  <meta property="og:url" content="${url}">
  <meta name="twitter:card" content="summary">
  <meta name="twitter:title" content="${esc(title)}">
  <meta name="twitter:description" content="${esc(description)}">
  <script type="application/ld+json">${JSON.stringify(schema).replaceAll('<', '\\u003c')}</script>`;
  const nav = groups.map(g => `<div class="nav-group"><p class="nav-label">${esc(g.label)}</p>${g.ids.map(id => {
    const item = byId.get(id);
    return `<a class="nav-item${id === d.id ? ' active' : ''}" data-doc="${id}" href="${route(id)}"${id === d.id ? ' aria-current="page"' : ''}>${item.num ? `<span class="num">${item.num}</span>` : ''}<span>${esc(item.label)}</span></a>`;
  }).join('')}</div>`).join('');
  const toc = d.headings.filter(h => h.depth === 2 || h.depth === 3).map(h => `<a class="depth-${h.depth}" href="${route(d.id, encodeURIComponent(h.id))}" data-anchor="${esc(h.id)}">${esc(h.label)}</a>`).join('');
  const prevNext = [docs[i - 1], docs[i + 1]].map((item, j) => item ? `<a href="${route(item.id)}"><small>${j ? '下一节 →' : '← 上一节'}</small>${esc(item.label)}</a>` : '<span></span>').join('');
  let page = template
    .replace(/<title>.*?<\/title>/s, `<title>${esc(title)}</title>\n${metadata}`)
    .replace(/<style>.*?<\/style>/s, '<link rel="stylesheet" href="./assets/reader.css">')
    .replace('<body>', `<body data-static="true" data-initial-doc="${d.id}" data-doc="${d.id}">`)
    .replace('<nav id="course-nav" aria-label="课程章节导航"></nav>', `<nav id="course-nav" aria-label="课程章节导航">${nav}</nav>`)
    .replace('<nav id="toc-links"></nav>', `<nav id="toc-links">${toc}</nav>`)
    .replace(/<article id="article">.*?<\/article>/s, `<article id="article">${d.html}</article>`)
    .replace('<nav id="chapter-footer" aria-label="章节翻页"></nav>', `<nav id="chapter-footer" aria-label="章节翻页">${prevNext}</nav>`)
    .replace('href="../README.md"', `href="${github}/blob/main/${encodeURI(d.file)}"`)
    .replace('<div id="breadcrumb" class="breadcrumb">课程总览</div>', `<div id="breadcrumb" class="breadcrumb">${esc(d.label)}</div>`)
    .replace(/<script id="course-data" type="application\/json">.*?<\/script>/s, '<script src="./assets/course-data.js"></script>')
    .replace(/<script>\/\* Interactive Course Reader Runtime \*\/.*?<\/script>/s, '<script src="./assets/reader.js"></script>')
    .replace('<noscript><p>请启用 JavaScript 以使用交互式章节导航与全文检索。</p></noscript>', '<noscript><p>正文和目录可直接阅读。启用 JavaScript 后可使用全文搜索和阅读设置。</p></noscript>');
  if (d.id !== 'overview') page = page.replace('class="home-intro" id="home-intro"', 'class="home-intro" id="home-intro" hidden');
  page = links(page);
  fs.writeFileSync(path.join(out, filename(d.id)), page);
}

const urls = docs.map(d => origin + (d.id === 'overview' ? '/' : '/' + filename(d.id)));
fs.writeFileSync(path.join(out, 'sitemap.xml'), '<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' + urls.map(url => `  <url><loc>${url}</loc></url>`).join('\n') + '\n</urlset>\n');
fs.writeFileSync(path.join(out, 'robots.txt'), `User-agent: *\nAllow: /\n\nSitemap: ${origin}/sitemap.xml\n`);
console.log(JSON.stringify({ staticPages: docs.length, offline: 'html/offline.html', sitemap: urls.length }));
