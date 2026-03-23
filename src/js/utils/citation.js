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
