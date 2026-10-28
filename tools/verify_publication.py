"""Check published Markdown, prerendered chapters, metadata and offline parity."""
from pathlib import Path
from html.parser import HTMLParser
from urllib.parse import unquote, urlsplit
import json
import re
import xml.etree.ElementTree as ET

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'html'
ORIGIN = 'https://cs329z-course-review-20261029.wanghao162263.chatgpt.site'


class Page(HTMLParser):
    def __init__(self, html):
        super().__init__()
        self.ids = set()
        self.links = []
        self.resources = []
        self.meta = {}
        self.canonical = None
        self.article_depth = 0
        self.article_text = []
        self.feed(html)

    def handle_starttag(self, tag, attrs):
        a = dict(attrs)
        if 'id' in a:
            assert a['id'] not in self.ids, f'duplicate id: {a["id"]}'
            self.ids.add(a['id'])
        if tag == 'a':
            self.links.append(a.get('href', ''))
        if 'src' in a:
            self.resources.append(a['src'])
        if tag == 'link' and a.get('rel') == 'stylesheet':
            self.resources.append(a['href'])
        if tag == 'link' and a.get('rel') == 'canonical':
            self.canonical = a['href']
        if tag == 'meta':
            self.meta[a.get('name', a.get('property'))] = a.get('content')
        if tag == 'article':
            self.article_depth += 1

    def handle_endtag(self, tag):
        if tag == 'article':
            self.article_depth -= 1

    def handle_data(self, data):
        if self.article_depth:
            self.article_text.append(data)


data = json.loads((OUT / 'assets/course-data.js').read_text().removeprefix('window.COURSE_DATA = ').strip().removesuffix(';'))
docs = data['docs']
assert len(docs) == 27
assert len(list(ROOT.glob('[0-9][0-9]-*.md'))) == 19
assert len(list((ROOT / 'exercises').glob('*.md'))) == 4
pages = {}
titles = set()
canonicals = set()
for d in docs:
    name = 'index.html' if d['id'] == 'overview' else d['id'] + '.html'
    html = (OUT / name).read_text()
    page = Page(html)
    pages[name] = page
    assert page.article_text, f'empty server-rendered content: {name}'
    assert Page(d['html']).ids <= page.ids, f'missing headings: {name}'
    assert d['html'] in (OUT / 'offline.html').read_text() or d['id'] != 'overview'
    title = re.search(r'<title>(.*?)</title>', html)[1]
    assert title not in titles, f'duplicate title: {name}'
    titles.add(title)
    expected = ORIGIN + ('/' if name == 'index.html' else '/' + name.removesuffix('.html'))
    assert page.canonical == expected
    canonicals.add(expected)
    assert page.meta.get('description')
    assert page.meta.get('robots') == 'index,follow'
    assert page.meta.get('og:url') == expected
    assert page.meta.get('twitter:card') == 'summary'
    schema = json.loads(re.search(r'<script type="application/ld\+json">(.*?)</script>', html, re.S)[1])
    assert schema['url'] == expected
    assert not any(x.startswith('#/') for x in page.links), f'hash-only chapter link: {name}'

links = 0
for name, page in pages.items():
    for target in page.links + page.resources:
        url = urlsplit(target)
        if url.scheme or url.netloc:
            continue
        p = (OUT / unquote(url.path)).resolve() if url.path else OUT / name
        assert p.exists(), f'broken local link: {name} -> {target}'
        if url.fragment and p.name in pages:
            assert unquote(url.fragment) in pages[p.name].ids, f'broken anchor: {name} -> {target}'
        links += 1

for doc in docs:
    text = (ROOT / doc['file']).read_text()
    assert '/Users/' not in text
    for href in re.findall(r'\]\(([^\s)]+)\)', text):
        u = urlsplit(href)
        if not u.scheme and not u.netloc:
            assert (ROOT / doc['file']).parent.joinpath(unquote(u.path)).exists(), (doc['file'], href)

offline = (OUT / 'offline.html').read_text()
offline_data = json.loads(re.search(r'<script id="course-data" type="application/json">(.*?)</script>', offline, re.S)[1])
assert offline_data == data, 'offline and online content differ'
assert Page(offline).meta.get('robots') == 'noindex,follow'
sitemap = ET.parse(OUT / 'sitemap.xml')
locations = {e.text for e in sitemap.findall('.//{http://www.sitemaps.org/schemas/sitemap/0.9}loc')}
assert locations == canonicals
assert f'Sitemap: {ORIGIN}/sitemap.xml' in (OUT / 'robots.txt').read_text()
print(json.dumps({'status': 'PASS', 'chapters': 19, 'exercises': 4, 'static_pages': len(pages), 'local_links_and_assets': links, 'sitemap_urls': len(locations), 'offline_content_matches': True}, ensure_ascii=False))
