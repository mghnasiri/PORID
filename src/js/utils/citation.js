/**
 * BibTeX citation generation and clipboard utilities.
 */

/**
 * Generate BibTeX entry from a publication item.
 * @param {Object} item - Publication with title, authors, date, doi, source, url
 * @returns {string} BibTeX formatted string
 */
export function generateBibTeX(item) {
  const year = item.date ? item.date.slice(0, 4) : 'unknown';

  // Build citation key: firstAuthorLastName + year + firstTitleWord
  let authorKey = 'unknown';
  if (item.authors && item.authors.length > 0) {
    const first = item.authors[0].trim();
    // Try to get last name (handle "Last, First" and "First Last")
    const parts = first.includes(',') ? first.split(',') : first.split(/\s+/);
    authorKey = parts[parts.length - 1].replace(/[^a-zA-Z]/g, '').toLowerCase() || 'unknown';
    if (first.includes(',')) {
      authorKey = parts[0].replace(/[^a-zA-Z]/g, '').toLowerCase() || 'unknown';
    }
  }

  let titleWord = 'untitled';
  if (item.title) {
    const words = item.title.split(/\s+/).filter((w) => w.length > 3);
    titleWord = (words[0] || 'item').replace(/[^a-zA-Z]/g, '').toLowerCase();
  }

  const key = `${authorKey}${year}${titleWord}`;

  const authors = item.authors ? item.authors.join(' and ') : '';
  const fields = [];

  if (item.title) fields.push(`  title={${item.title}}`);
  if (authors) fields.push(`  author={${authors}}`);
  fields.push(`  year={${year}}`);
  if (item.doi) fields.push(`  doi={${item.doi}}`);
  if (item.source) fields.push(`  journal={${item.source}}`);
  if (item.url) fields.push(`  url={${item.url}}`);

  return `@article{${key},\n${fields.join(',\n')}\n}`;
}

/**
 * Copy text to clipboard with fallback.
 * @param {string} text
 * @returns {Promise<boolean>} Whether the copy succeeded
 */
export function copyToClipboard(text) {
  if (navigator.clipboard && navigator.clipboard.writeText) {
    return navigator.clipboard.writeText(text).then(() => true).catch(() => fallbackCopy(text));
  }
  return Promise.resolve(fallbackCopy(text));
}

/**
 * Generate CSV content from a list of items.
 * @param {Object[]} items - Array of data items
 * @returns {string} CSV formatted string
 */
export function generateCSV(items) {
  const headers = ['title', 'authors', 'source', 'date', 'tags', 'url', 'doi'];
  const rows = items.map((item) =>
    headers.map((h) => {
      let val = item[h];
      if (Array.isArray(val)) val = val.join('; ');
      val = String(val || '').replace(/"/g, '""');
      return `"${val}"`;
    }).join(',')
  );
  return [headers.join(','), ...rows].join('\n');
}

/**
 * Generate RIS entry from a publication item.
 * @param {Object} item - Publication with title, authors, date, doi, source, url
 * @returns {string} RIS formatted string
 */
export function generateRIS(item) {
  const year = item.date ? item.date.slice(0, 4) : '';
  const lines = ['TY  - JOUR'];
  if (item.title) lines.push(`TI  - ${item.title}`);
  if (item.authors && item.authors.length > 0) {
    item.authors.forEach(a => lines.push(`AU  - ${a}`));
  }
  if (year) lines.push(`PY  - ${year}`);
  if (item.doi) lines.push(`DO  - ${item.doi}`);
  if (item.source) lines.push(`JO  - ${item.source}`);
  if (item.url) lines.push(`UR  - ${item.url}`);
  lines.push('ER  - ');
  return lines.join('\n');
}

/**
 * Remove duplicate items that share the same DOI.
 * Items without a DOI are always kept.
 * @param {Object[]} items
 * @returns {Object[]} Deduplicated array
 */
export function deduplicateByDOI(items) {
  const seen = new Set();
  return items.filter(item => {
    if (!item.doi) return true;
    const key = item.doi.toLowerCase().trim();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/**
 * Trigger a file download via Blob URL.
 * @param {string} content - File content
 * @param {string} filename - Download filename
 * @param {string} mimeType - MIME type
 */
export function downloadFile(content, filename, mimeType) {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/**
 * R4-01: Generate OPML XML string listing tracked data sources as outline entries.
 * @param {Object[]} sources - Array of { title, xmlUrl?, htmlUrl?, type? }
 * @returns {string} OPML XML string
 */
export function generateOPML(sources) {
  const dateStr = new Date().toUTCString();
  const outlines = sources.map((s) => {
    const attrs = [`text="${escXml(s.title)}"`];
    if (s.xmlUrl) attrs.push(`xmlUrl="${escXml(s.xmlUrl)}"`);
    if (s.htmlUrl) attrs.push(`htmlUrl="${escXml(s.htmlUrl)}"`);
    if (s.type) attrs.push(`type="${escXml(s.type)}"`);
    return `      <outline ${attrs.join(' ')}/>`;
  }).join('\n');
  return `<?xml version="1.0" encoding="UTF-8"?>
<opml version="2.0">
  <head>
    <title>PORID Data Sources</title>
    <dateCreated>${dateStr}</dateCreated>
  </head>
  <body>
    <outline text="PORID Tracked Sources">
${outlines}
    </outline>
  </body>
</opml>`;
}

/**
 * R4-02: Generate Zotero-compatible RDF/XML from items.
 * @param {Object[]} items - Publication items
 * @returns {string} RDF/XML string
 */
export function generateZoteroRDF(items) {
  const entries = items.map((item) => {
    const year = item.date ? item.date.slice(0, 4) : '';
    const creators = (item.authors || []).map(a =>
      `      <dc:creator>${escXml(a)}</dc:creator>`
    ).join('\n');
    const doi = item.doi ? `      <dc:identifier>DOI: ${escXml(item.doi)}</dc:identifier>` : '';
    return `    <z:item z:itemType="journalArticle">
      <dc:title>${escXml(item.title || '')}</dc:title>
${creators}
      <dc:date>${escXml(year)}</dc:date>
${doi}
    </z:item>`;
  }).join('\n');
  return `<?xml version="1.0" encoding="UTF-8"?>
<rdf:RDF
  xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#"
  xmlns:dc="http://purl.org/dc/elements/1.1/"
  xmlns:z="http://www.zotero.org/namespaces/export#">
${entries}
</rdf:RDF>`;
}

/**
 * R4-03: Generate Netscape Bookmark File HTML from items.
 * @param {Object[]} items - Items with title, url, date
 * @returns {string} Bookmark HTML string
 */
export function generateBookmarkHTML(items) {
  const entries = items.map((item) => {
    const ts = item.date ? Math.floor(new Date(item.date + 'T00:00:00').getTime() / 1000) : '';
    const url = item.url || '';
    const title = item.title || item.name || 'Untitled';
    return `        <DT><A HREF="${url}" ADD_DATE="${ts}">${escXml(title)}</A>`;
  }).join('\n');
  return `<!DOCTYPE NETSCAPE-Bookmark-file-1>
<META HTTP-EQUIV="Content-Type" CONTENT="text/html; charset=UTF-8">
<TITLE>PORID Bookmarks</TITLE>
<H1>PORID Bookmarks</H1>
<DL><p>
    <DT><H3>PORID Reading List</H3>
    <DL><p>
${entries}
    </DL><p>
</DL><p>`;
}

/** Escape XML special characters. */
function escXml(str) {
  return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function fallbackCopy(text) {
  const textarea = document.createElement('textarea');
  textarea.value = text;
  textarea.style.position = 'fixed';
  textarea.style.opacity = '0';
  document.body.appendChild(textarea);
  textarea.select();
  let success = false;
  try {
    success = document.execCommand('copy');
  } catch {
    success = false;
  }
  document.body.removeChild(textarea);
  return success;
}
