import { test } from 'node:test';
import assert from 'node:assert/strict';
import { excerpt, renderMarkdown, slugify } from './markdown';

test('slugify', () => {
  assert.equal(slugify(''), 'post');
  assert.equal(slugify('!!!'), 'post');
  assert.equal(slugify('Café Ünïcode'), 'cafe-unicode');
  assert.equal(slugify('Hello, World!'), 'hello-world');
  const long = slugify('a'.repeat(100));
  assert.equal(long, 'a'.repeat(60));
  assert.equal(long.length, 60);
  // 59 chars then a hyphen at index 59 -> sliced to 60 ends with '-', trimmed again
  const t = slugify('a'.repeat(59) + ' ' + 'b'.repeat(20));
  assert.equal(t, 'a'.repeat(59));
  assert.ok(!slugify('word '.repeat(30)).endsWith('-'));
  assert.ok(slugify('word '.repeat(30)).length <= 60);
});

test('sanitization strips dangerous content', () => {
  const cases: [string, RegExp][] = [
    ['<script>alert(1)</script>hi', /script|alert/i],
    ['<img src="x" onerror="alert(1)">', /onerror|alert/i],
    ['<img src=x OnError=alert(1)>', /onerror|alert/i],
    ['[x](javascript:alert(1))', /javascript/i],
    ['<a href="JaVaScRiPt:alert(1)">x</a>', /javascript|alert/i],
    ['<a href="&#106;avascript:alert(1)">x</a>', /javascript|alert/i],
    ['![x](data:text/html;base64,PHNjcmlwdD4=)', /data:/i],
    ['<a href="data:text/html,<script>1</script>">x</a>', /data:|script/i],
    ['<iframe src="http://evil.com">inner</iframe>', /iframe|evil|inner/i],
    ['<style>body{display:none}</style>t', /style|display/i],
    ['<p style="x" onclick="a()">t</p>', /style=|onclick/i],
    ['<svg onload=alert(1)><script>1</script></svg>', /svg|onload|alert/i],
    ['<a href="//evil.com">x</a>', /evil/i],
    ['<div><script>alert(1)</script></div>', /script|alert/i],
  ];
  for (const [input, bad] of cases) {
    const out = renderMarkdown(input);
    assert.doesNotMatch(out, bad, `${input} -> ${out}`);
    assert.doesNotMatch(out, /\son\w+=/i);
  }
});

test('safe markdown still renders', () => {
  assert.match(renderMarkdown('# T\n\n## S'), /<h1>T<\/h1>[\s\S]*<h2>S<\/h2>/);
  assert.match(renderMarkdown('- a\n- b'), /<ul>\s*<li>a<\/li>\s*<li>b<\/li>\s*<\/ul>/);
  assert.match(renderMarkdown('1. a'), /<ol>/);
  assert.match(renderMarkdown('`x`'), /<code>x<\/code>/);
  assert.match(renderMarkdown('```\nx\n```'), /<pre><code>x\n<\/code><\/pre>/);
  assert.match(renderMarkdown('| a | b |\n|---|---|\n| 1 | 2 |'), /<table>[\s\S]*<thead>[\s\S]*<th>a<\/th>[\s\S]*<tbody>[\s\S]*<td>2<\/td>/);
  assert.match(renderMarkdown('> q'), /<blockquote>/);
  assert.match(renderMarkdown('**b** *i*'), /<strong>b<\/strong> <em>i<\/em>/);
  const link = renderMarkdown('[x](https://example.com/a?b=1)');
  assert.match(link, /<a href="https:\/\/example\.com\/a\?b=1" rel="noopener nofollow">x<\/a>/);
  assert.match(renderMarkdown('[m](mailto:a@b.co)'), /href="mailto:a@b\.co"/);
  assert.match(renderMarkdown('![alt](https://e.com/i.png)'), /<img src="https:\/\/e\.com\/i\.png" alt="alt"/);
  // rel is forced even if author supplies their own
  assert.match(renderMarkdown('<a href="http://a.com" rel="opener">x</a>'), /rel="noopener nofollow"/);
});

test('excerpt', () => {
  assert.equal(excerpt('x'.repeat(500)).length, 200);
  const e = excerpt('# Title\n\nSome **bold** [link](http://a.com) text\n\n<script>alert(1)</script>');
  assert.equal(e, 'Title Some bold link text');
  assert.doesNotMatch(e, /</);
  assert.doesNotMatch(excerpt('Tom & Jerry <b>x</b> "q" &amp; co'), /&amp;|<|&lt;/);
  assert.equal(excerpt('Tom & Jerry'), 'Tom & Jerry');
  assert.equal(excerpt('a  \n\n\n  b\t\tc'), 'a b c');
  assert.equal(excerpt(''), '');
  assert.equal(excerpt('&amp;lt;'), '&lt;'); // single decode pass
});

test('relative / non-http(s) img src and a href are dropped', () => {
  for (const src of ['x', '/x.png', './x.png', '//evil.com/x.png', 'ftp://h/x', ' javascript:1', 'mailto:a@b.co']) {
    const out = renderMarkdown(`<img src="${src}" alt="a">`);
    assert.doesNotMatch(out, /<img/, `${src} -> ${out}`);
  }
  assert.equal(renderMarkdown('<img src=x>'), '');
  assert.match(renderMarkdown('![a](/rel.png)'), /^<p><\/p>\s*$/);
  assert.match(renderMarkdown('<img src="http://e.com/a.png" alt="a">'), /<img src="http:\/\/e\.com\/a\.png"/);
  for (const href of ['x', '/x', './x', '../x', '#frag', '//evil.com', 'ftp://h/x', 'tel:123']) {
    const out = renderMarkdown(`<a href="${href}">txt</a>`);
    assert.doesNotMatch(out, /href/, `${href} -> ${out}`);
    assert.match(out, /txt/);
    assert.match(out, /rel="noopener nofollow"/);
  }
  assert.match(renderMarkdown('[t](/relative)'), /<a rel="noopener nofollow">t<\/a>/);
  assert.match(renderMarkdown('[t](HTTPS://e.com)'), /href="HTTPS:\/\/e\.com"/);
});
