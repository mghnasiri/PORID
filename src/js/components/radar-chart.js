/**
 * Topic Velocity Radar Chart — D3.js force-directed bubble chart.
 *
 * Renders OR subdomain bubbles sized by publication count and
 * colored by growth velocity. Includes tooltips with sparklines.
 *
 * Security: All data comes from local static JSON (data/trends.json).
 */

/**
 * Lazily loads D3.js on first use. Returns the d3 global.
 * @returns {Promise<Object>} The d3 library object
 */
async function loadD3() {
  if (!window.d3) {
    await import('https://cdn.jsdelivr.net/npm/d3@7/+esm');
  }
  return window.d3;
}

/**
 * Renders the topic velocity radar chart into the given container.
 * @param {HTMLElement} container - DOM element to render into
 * @param {Object} trendsData - Parsed trends.json data
 */
export async function renderRadarChart(container, trendsData) {
  try {
    await loadD3();
  } catch (err) {
    console.warn('Failed to load D3.js — radar chart disabled.', err);
    return;
  }

  const subdomains = trendsData.subdomains || [];
  if (subdomains.length === 0) return;

  // Clear placeholder
  container.textContent = '';

  const isMobile = window.innerWidth < 768;

  // If mobile, render list view instead
  if (isMobile) {
    renderMobileList(container, subdomains);
    return;
  }

  // --- Chart dimensions ---
  const width = container.clientWidth || 800;
  const height = Math.min(500, Math.max(350, width * 0.5));

  // --- Scales ---
  const sizeScale = d3.scaleSqrt()
    .domain([0, d3.max(subdomains, d => d.current_quarter_count)])
    .range([14, Math.min(70, width / 12)]);

  const colorScale = d3.scaleLinear()
    .domain([-0.5, 0, 0.5])
    .range(['#8892B0', '#C5A059', '#4ADE80'])
    .clamp(true);

  // --- SVG ---
  const svg = d3.select(container)
    .append('svg')
    .attr('width', width)
    .attr('height', height)
    .attr('viewBox', `0 0 ${width} ${height}`)
    .attr('role', 'img')
    .attr('aria-label', 'Topic velocity radar showing OR subdomain activity');

  // --- Tooltip ---
  const tooltip = d3.select(container)
    .append('div')
    .attr('class', 'radar-tooltip')
    .style('opacity', 0)
    .style('pointer-events', 'none');

  // --- Force simulation ---
  const simulation = d3.forceSimulation(subdomains)
    .force('charge', d3.forceManyBody().strength(3))
    .force('center', d3.forceCenter(width / 2, height / 2))
    .force('collision', d3.forceCollide().radius(d => sizeScale(d.current_quarter_count) + 3))
    .on('tick', ticked);

  // --- Bubble groups ---
  const bubbles = svg.selectAll('.bubble')
    .data(subdomains)
    .enter()
    .append('g')
    .attr('class', 'bubble')
    .attr('role', 'button')
    .attr('tabindex', '0')
    .attr('aria-label', d => {
      const pct = Math.round(d.velocity * 100);
      const dir = d.velocity > 0 ? 'growing' : d.velocity < 0 ? 'declining' : 'stable';
      return `${d.display_name}: ${d.current_quarter_count} papers, ${dir} ${Math.abs(pct)} percent`;
    });

  // Circles
  bubbles.append('circle')
    .attr('r', d => sizeScale(d.current_quarter_count))
    .attr('fill', d => colorScale(d.velocity))
    .attr('fill-opacity', 0.75)
    .attr('stroke', d => colorScale(d.velocity))
    .attr('stroke-width', 1.5)
    .attr('stroke-opacity', 0.9);

  // Velocity indicator
  bubbles.append('text')
    .attr('class', 'bubble-indicator')
    .attr('text-anchor', 'middle')
    .attr('dy', d => -sizeScale(d.current_quarter_count) * 0.15)
    .attr('font-size', d => Math.max(8, sizeScale(d.current_quarter_count) * 0.25))
    .attr('fill', 'white')
    .attr('fill-opacity', 0.9)
    .text(d => d.velocity_label === 'accelerating' ? '\u25B2' : d.velocity_label === 'declining' ? '\u25BC' : '\u2013');

  // Labels (only for larger bubbles)
  bubbles.append('text')
    .attr('class', 'bubble-label')
    .attr('text-anchor', 'middle')
    .attr('dy', d => sizeScale(d.current_quarter_count) * 0.2)
    .attr('font-size', d => Math.max(7, Math.min(12, sizeScale(d.current_quarter_count) * 0.22)))
    .attr('fill', 'white')
    .attr('fill-opacity', 0.85)
    .text(d => {
      const r = sizeScale(d.current_quarter_count);
      if (r < 22) return '';
      const name = d.display_name;
      return name.length > 12 ? name.slice(0, 10) + '\u2026' : name;
    });

  // Count labels
  bubbles.append('text')
    .attr('class', 'bubble-count')
    .attr('text-anchor', 'middle')
    .attr('dy', d => sizeScale(d.current_quarter_count) * 0.5)
    .attr('font-size', d => Math.max(6, sizeScale(d.current_quarter_count) * 0.18))
    .attr('fill', 'white')
    .attr('fill-opacity', 0.5)
    .text(d => {
      const r = sizeScale(d.current_quarter_count);
      return r >= 22 ? d.current_quarter_count : '';
    });

  // --- Interactions ---
  bubbles
    .on('mouseenter', function(event, d) {
      d3.select(this).select('circle')
        .transition().duration(200)
        .attr('r', sizeScale(d.current_quarter_count) * 1.1)
        .attr('fill-opacity', 0.9);

      const pct = Math.round(d.velocity * 100);
      const sign = pct >= 0 ? '+' : '';
      const arrow = d.velocity_label === 'accelerating' ? '\u25B2' : d.velocity_label === 'declining' ? '\u25BC' : '\u2013';

      // Build sparkline SVG
      const sparkline = buildSparklineSVG(d.sparkline || []);

      tooltip
        .style('opacity', 1)
        .html(''); // Clear

      const tooltipEl = tooltip.node();
      tooltipEl.textContent = '';

      const nameEl = document.createElement('div');
      nameEl.className = 'radar-tooltip__name';
      nameEl.textContent = d.display_name;
      tooltipEl.appendChild(nameEl);

      const velEl = document.createElement('div');
      velEl.className = 'radar-tooltip__velocity';
      velEl.textContent = `${arrow} ${sign}${pct}% vs last quarter`;
      tooltipEl.appendChild(velEl);

      if (sparkline) {
        tooltipEl.appendChild(sparkline);
      }

      const countEl = document.createElement('div');
      countEl.className = 'radar-tooltip__count';
      countEl.textContent = `${d.current_quarter_count} papers this quarter \u00B7 ${d.total_count} total`;
      tooltipEl.appendChild(countEl);

      if (d.top_keywords && d.top_keywords.length > 0) {
        const kwEl = document.createElement('div');
        kwEl.className = 'radar-tooltip__keywords';
        kwEl.textContent = `Keywords: ${d.top_keywords.join(', ')}`;
        tooltipEl.appendChild(kwEl);
      }

      const hintEl = document.createElement('div');
      hintEl.className = 'radar-tooltip__hint';
      hintEl.textContent = 'Click to explore \u2192';
      tooltipEl.appendChild(hintEl);

      tooltip.style('opacity', 1);
    })
    .on('mousemove', function(event) {
      const rect = container.getBoundingClientRect();
      const x = event.clientX - rect.left;
      const y = event.clientY - rect.top;

      tooltip
        .style('left', `${x + 15}px`)
        .style('top', `${y - 10}px`);
    })
    .on('mouseleave', function(event, d) {
      d3.select(this).select('circle')
        .transition().duration(200)
        .attr('r', sizeScale(d.current_quarter_count))
        .attr('fill-opacity', 0.75);

      tooltip.style('opacity', 0);
    })
    .on('click', function(event, d) {
      // Navigate to papers filtered by this tag
      window.location.hash = `papers`;
      // Store tag for filtering (could also emit event)
    });

  // --- Legend ---
  const legend = svg.append('g')
    .attr('transform', `translate(${width - 200}, ${height - 30})`);

  const legendWidth = 160;
  const defs = svg.append('defs');
  const gradient = defs.append('linearGradient')
    .attr('id', 'velocity-gradient');
  gradient.append('stop').attr('offset', '0%').attr('stop-color', '#8892B0');
  gradient.append('stop').attr('offset', '50%').attr('stop-color', '#C5A059');
  gradient.append('stop').attr('offset', '100%').attr('stop-color', '#4ADE80');

  legend.append('rect')
    .attr('width', legendWidth)
    .attr('height', 8)
    .attr('rx', 4)
    .attr('fill', 'url(#velocity-gradient)')
    .attr('opacity', 0.8);

  legend.append('text')
    .attr('x', 0).attr('y', 20)
    .attr('font-size', 8)
    .attr('fill', '#8892B0')
    .text('Declining');

  legend.append('text')
    .attr('x', legendWidth).attr('y', 20)
    .attr('text-anchor', 'end')
    .attr('font-size', 8)
    .attr('fill', '#4ADE80')
    .text('Accelerating');

  function ticked() {
    bubbles.attr('transform', d => {
      const r = sizeScale(d.current_quarter_count);
      d.x = Math.max(r, Math.min(width - r, d.x));
      d.y = Math.max(r, Math.min(height - r, d.y));
      return `translate(${d.x}, ${d.y})`;
    });
  }
}

/**
 * Builds a sparkline SVG element from monthly count data.
 */
function buildSparklineSVG(data) {
  if (!data || data.length === 0) return null;

  const w = 140;
  const h = 30;
  const max = Math.max(...data, 1);

  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('width', w);
  svg.setAttribute('height', h);
  svg.setAttribute('class', 'radar-tooltip__sparkline');

  const points = data.map((v, i) => {
    const x = (i / (data.length - 1)) * w;
    const y = h - (v / max) * (h - 4) - 2;
    return `${x},${y}`;
  }).join(' ');

  const polyline = document.createElementNS('http://www.w3.org/2000/svg', 'polyline');
  polyline.setAttribute('points', points);
  polyline.setAttribute('fill', 'none');
  polyline.setAttribute('stroke', '#C5A059');
  polyline.setAttribute('stroke-width', '1.5');
  polyline.setAttribute('stroke-linejoin', 'round');
  svg.appendChild(polyline);

  return svg;
}

/**
 * Renders a mobile-friendly list view instead of the bubble chart.
 */
function renderMobileList(container, subdomains) {
  const list = document.createElement('div');
  list.className = 'radar-mobile-list';

  const header = document.createElement('h3');
  header.className = 'radar-mobile-list__title';
  header.textContent = 'Top Moving Subdomains';
  list.appendChild(header);

  // Show top 10 sorted by absolute velocity
  const sorted = [...subdomains]
    .sort((a, b) => Math.abs(b.velocity) - Math.abs(a.velocity))
    .slice(0, 10);

  sorted.forEach(d => {
    const row = document.createElement('div');
    row.className = 'radar-mobile-item';

    const arrow = document.createElement('span');
    arrow.className = `radar-mobile-item__arrow radar-mobile-item__arrow--${d.velocity_label}`;
    arrow.textContent = d.velocity_label === 'accelerating' ? '\u25B2'
      : d.velocity_label === 'declining' ? '\u25BC' : '\u2013';
    row.appendChild(arrow);

    const info = document.createElement('div');
    info.className = 'radar-mobile-item__info';
    const name = document.createElement('span');
    name.className = 'radar-mobile-item__name';
    name.textContent = d.display_name;
    const stats = document.createElement('span');
    stats.className = 'radar-mobile-item__stats';
    const pct = Math.round(d.velocity * 100);
    stats.textContent = `${d.current_quarter_count} papers \u00B7 ${pct >= 0 ? '+' : ''}${pct}%`;
    info.appendChild(name);
    info.appendChild(stats);
    row.appendChild(info);

    list.appendChild(row);
  });

  container.appendChild(list);
}
