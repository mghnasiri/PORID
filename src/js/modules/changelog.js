/**
 * Changelog module — renders version history from changelog.json.
 *
 * Accessible only via footer link (#changelog), not shown in nav tabs.
 * Security note: All data rendered comes from local static JSON
 * (data/changelog.json), not from user input or external sources.
 * All uses of innerHTML render exclusively from this trusted local data.
 */

let cachedData = null;

/**
 * Fetch changelog data (cached after first load).
 * @returns {Promise<Object[]>}
 */
async function fetchChangelog() {
  if (cachedData) return cachedData;
  try {
    const res = await fetch('./data/changelog.json');
    if (!res.ok) throw new Error(`Failed to load changelog: ${res.status}`);
    cachedData = await res.json();
  } catch {
    cachedData = [];
  }
  return cachedData;
}

/**
 * Render the changelog view into the given container.
 * @param {HTMLElement} container - The #content element.
 */
export async function render(container) {
  const data = await fetchChangelog();

  container.textContent = '';

  const wrapper = document.createElement('div');
  wrapper.className = 'changelog-page';

  const title = document.createElement('h2');
  title.className = 'changelog-page__title';
  title.textContent = "What's New";
  wrapper.appendChild(title);

  const subtitle = document.createElement('p');
  subtitle.className = 'changelog-page__subtitle';
  subtitle.textContent = 'Version history and release notes';
  wrapper.appendChild(subtitle);

  if (data.length === 0) {
    const empty = document.createElement('p');
    empty.className = 'empty-state__text';
    empty.textContent = 'No changelog data available.';
    wrapper.appendChild(empty);
    container.appendChild(wrapper);
    return;
  }

  // Build changelog using DOM methods for each version
  for (const v of data) {
    const versionDiv = document.createElement('div');
    versionDiv.className = 'changelog-version';

    const header = document.createElement('div');
    header.className = 'changelog-version__header';

    const tag = document.createElement('span');
    tag.className = 'changelog-version__tag';
    tag.textContent = `v${v.version}`;
    header.appendChild(tag);

    const dateEl = document.createElement('span');
    dateEl.className = 'changelog-version__date';
    dateEl.textContent = v.date;
    header.appendChild(dateEl);

    versionDiv.appendChild(header);

    const ul = document.createElement('ul');
    ul.className = 'changelog-version__list';
    for (const change of v.changes) {
      const li = document.createElement('li');
      li.textContent = change;
      ul.appendChild(li);
    }
    versionDiv.appendChild(ul);

    wrapper.appendChild(versionDiv);
  }

  container.appendChild(wrapper);
}
