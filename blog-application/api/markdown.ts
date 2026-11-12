import { marked } from 'marked';
import sanitizeHtml from 'sanitize-html';

const OPTIONS: sanitizeHtml.IOptions = {
  allowedTags: [
    'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'p', 'a', 'em', 'strong', 'code', 'pre',
    'ul', 'ol', 'li', 'blockquote', 'hr', 'img', 'br',
    'table', 'thead', 'tbody', 'tr', 'th', 'td',
  ],
  allowedAttributes: { a: ['href', 'rel'], img: ['src', 'alt'] },
  allowedSchemes: [],
  allowedSchemesByTag: { a: ['http', 'https', 'mailto'], img: ['http', 'https'] },
  allowProtocolRelative: false,
  disallowedTagsMode: 'discard',
  nonTextTags: ['script', 'style', 'iframe', 'textarea', 'noscript'],
  transformTags: {
    a: (tagName, attribs) => {
      const out: Record<string, string> = { ...attribs, rel: 'noopener nofollow' };
      // Absolute http(s)/mailto only; relative, protocol-relative etc. lose the href (text kept).
      if (out['href'] !== undefined && !/^(?:https?:\/\/|mailto:)/i.test(out['href'].trim())) delete out['href'];
      return { tagName, attribs: out };
    },
    img: (tagName, attribs) => {
      const out: Record<string, string> = { ...attribs };
      if (out['src'] !== undefined && !/^https?:\/\//i.test(out['src'].trim())) delete out['src'];
      return { tagName, attribs: out };
    },
  },
  // An img without a valid src is dropped entirely.
  exclusiveFilter: (frame) => frame.tag === 'img' && !frame.attribs['src'],
};

export function renderMarkdown(md: string): string {
  const raw = marked.parse(md, { async: false }) as string;
  return sanitizeHtml(raw, OPTIONS);
}

export function slugify(title: string): string {
  let s = title
    .toLowerCase()
    .normalize('NFKD')
    .replace(/\p{M}/gu, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60)
    .replace(/-+$/, '');
  return s === '' ? 'post' : s;
}

export function excerpt(markdown: string): string {
  const text = sanitizeHtml(renderMarkdown(markdown), {
    allowedTags: [],
    allowedAttributes: {},
    // sanitize-html entity-encodes text (&amp; &lt; &quot; ...); decode below.
  });
  return decodeEntities(text).replace(/\s+/g, ' ').trim().slice(0, 200);
}

function decodeEntities(s: string): string {
  // Single pass; &amp; handled in the same regex so "&amp;lt;" -> "&lt;" (not "<").
  return s.replace(/&(#x[0-9a-f]+|#\d+|amp|lt|gt|quot|apos|nbsp);/gi, (m, e: string) => {
    const k = e.toLowerCase();
    if (k === 'amp') return '&';
    if (k === 'lt') return '<';
    if (k === 'gt') return '>';
    if (k === 'quot') return '"';
    if (k === 'apos') return "'";
    if (k === 'nbsp') return ' ';
    const cp = k.startsWith('#x') ? parseInt(k.slice(2), 16) : parseInt(k.slice(1), 10);
    return Number.isFinite(cp) && cp <= 0x10ffff ? String.fromCodePoint(cp) : m;
  });
}
