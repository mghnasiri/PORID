/**
 * Date utility functions for PORID.
 * All functions accept ISO date strings (YYYY-MM-DD) or full ISO timestamps.
 */

/**
 * Returns a human-readable relative time string.
 * e.g. "2 days ago", "in 5 days", "just now"
 * @param {string} dateStr - ISO date string
 * @returns {string}
 */
export function relativeTime(dateStr) {
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now - date;
  const diffSec = Math.floor(Math.abs(diffMs) / 1000);
  const diffMin = Math.floor(diffSec / 60);
  const diffHr = Math.floor(diffMin / 60);
  const diffDay = Math.floor(diffHr / 24);
  const diffWeek = Math.floor(diffDay / 7);
  const diffMonth = Math.floor(diffDay / 30);

  const past = diffMs > 0;

  if (diffSec < 60) return 'just now';

  const label = (n, unit) => {
    const s = n === 1 ? '' : 's';
    return past ? `${n} ${unit}${s} ago` : `in ${n} ${unit}${s}`;
  };

  if (diffMin < 60) return label(diffMin, 'minute');
  if (diffHr < 24) return label(diffHr, 'hour');
  if (diffDay < 7) return label(diffDay, 'day');
  if (diffWeek < 5) return label(diffWeek, 'week');
  if (diffMonth < 12) return label(diffMonth, 'month');

  const diffYear = Math.floor(diffDay / 365);
  return label(diffYear || 1, 'year');
}

/**
 * Formats a date string into a readable format.
 * e.g. "Mar 20, 2025"
 * @param {string} dateStr - ISO date string
 * @returns {string}
 */
export function formatDate(dateStr) {
  const date = new Date(dateStr);
  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

/**
 * Returns the number of days until a future date.
 * Negative values mean the date has passed.
 * @param {string} dateStr - ISO date string
 * @returns {number}
 */
export function daysUntil(dateStr) {
  const target = new Date(dateStr);
  const now = new Date();

  // Normalize to midnight to avoid timezone off-by-one
  target.setHours(0, 0, 0, 0);
  now.setHours(0, 0, 0, 0);

  const diffMs = target - now;
  return Math.ceil(diffMs / (1000 * 60 * 60 * 24));
}
