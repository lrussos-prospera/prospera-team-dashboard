const SHEET_URL =
  'https://docs.google.com/spreadsheets/d/1bUY_Us-Vjq4JSYsnxrVXfAX6qRGjxZRgXR31me3Nc0U/gviz/tq?tqx=out:csv&gid=1636341361';
const HISTORY_URL =
  'https://docs.google.com/spreadsheets/d/1bUY_Us-Vjq4JSYsnxrVXfAX6qRGjxZRgXR31me3Nc0U/gviz/tq?tqx=out:csv&gid=2128123437';
const PERIOD_DAYS = { '1w': 7, '1m': 30, '3m': 90 };

const DATE_STALE_THRESHOLD_DAYS = 7;

const appState = {
  rows: [],
  _initialRevealDone: false,
  lifecycle: {
    phase: 'idle', // idle | loading | loaded | error | no-data
    errorMessage: '',
    refreshedLabel: 'Loading…',
    sourceLabel: 'Live',
  },
  view: {
    filters: {
      dept: '',
      team: '',
      person: '',
      status: '',
      goal: '',
      search: '',
    },
    filterPanelOpen: false,
    expandedRowKey: null,
    sort: {
      column: '',
      direction: '',
    },
  },
  route: {
    view: 'overview', // 'overview' | 'goal' | 'department' | 'employee' | 'trends'
    param: '', // entity name
    filters: {}, // { status: 'blocked', search: 'tax' } from query string
  },
  history: {
    raw: [],
    byLevel: {},
    status: 'idle',
  },
};

window.appState = appState;

const elements = {
  viewedDate: document.getElementById('viewed-date'),
  csvBadge: document.getElementById('csv-badge'),
  csvDateLabel: document.getElementById('csv-date-label'),
  refreshBtn: document.getElementById('refresh-btn'),
  stateBox: document.getElementById('state-box'),

  summary: document.getElementById('summary'),
  goalsSection: document.getElementById('goals-section'),
  goalsGrid: document.getElementById('goals-grid'),
  blockedSection: document.getElementById('blocked-section'),
  recentActivity: document.getElementById('recent-activity'),
  recentActivityList: document.getElementById('recent-activity-list'),
  controls: document.getElementById('controls'),
  resultCount: document.getElementById('result-count'),
  scopedSummary: document.getElementById('scoped-summary'),
  tableWrap: document.getElementById('table-wrap'),
  tableBody: document.getElementById('table-body'),

  drilldownView: document.getElementById('drilldown-view'),
  drilldownBreadcrumbList: document.getElementById('drilldown-breadcrumb-list'),
  drilldownTitle: document.getElementById('drilldown-title'),
  drilldownSubtitle: document.getElementById('drilldown-subtitle'),
  drilldownHero: document.getElementById('drilldown-hero'),
  drilldownTrendPanel: document.getElementById('drilldown-trend-panel'),
  drilldownFilters: document.getElementById('drilldown-filters'),
  drilldownResultCount: document.getElementById('drilldown-result-count'),
  drilldownTableWrap: document.getElementById('drilldown-table-wrap'),
  drilldownTableBody: document.getElementById('drilldown-table-body'),

  filterDept: document.getElementById('filter-dept'),
  filterTeam: document.getElementById('filter-team'),
  filterPerson: document.getElementById('filter-person'),
  filterStatus: document.getElementById('filter-status'),
  filterGoal: document.getElementById('filter-goal'),
  search: document.getElementById('search'),
  filterToggle: document.getElementById('filter-toggle'),
  filterBadge: document.getElementById('filter-badge'),
  filterPanel: document.getElementById('filter-panel'),
  resetBtn: document.getElementById('reset-btn'),
};

function initializeViewedDate() {
  elements.viewedDate.textContent = new Date().toLocaleDateString('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
}

function escapeHtml(str) {
  return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function normalizeStatus(raw) {
  const s = String(raw).toLowerCase().trim();
  if (s.includes('done')) return 'done';
  if (s.includes('doing') || s.includes('in progress') || s.includes('progress')) return 'doing';
  if (s.includes('block')) return 'blocked';
  return 'other';
}

function parseRowDate(rawValue) {
  if (!rawValue) return null;
  const parsed = new Date(rawValue);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function daysSince(date) {
  if (!date) return Number.POSITIVE_INFINITY;
  const ms = Date.now() - date.getTime();
  return Math.floor(ms / (1000 * 60 * 60 * 24));
}

function parseCSVLine(line) {
  const fields = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      inQuotes = !inQuotes;
    } else if (ch === ',' && !inQuotes) {
      fields.push(current.trim());
      current = '';
    } else {
      current += ch;
    }
  }
  fields.push(current.trim());
  return fields;
}

function parseCSV(text) {
  const lines = text.trim().split(/\r?\n/);
  const headers = parseCSVLine(lines[0]).map((h) => h.replace(/^"|"$/g, ''));

  return lines
    .slice(1)
    .map((line) => {
      const fields = parseCSVLine(line);

      const row = {};
      headers.forEach((h, i) => {
        row[h] = (fields[i] || '').replace(/^"|"$/g, '');
      });
      row._status = normalizeStatus(row.Status);
      row._date = parseRowDate(row['Added/updated']);
      return row;
    })
    .filter((row) => headers.some((header) => Boolean(row[header])));
}

function parseHistoryCSV(text) {
  const rows = parseCSV(text);
  return rows
    .map((row) => ({
      timestamp: new Date(row['Timestamp']),
      level: (row['Level'] || '').toLowerCase(),
      entity: row['Entity'] || '—',
      total: parseInt(row['Total'], 10) || 0,
      done: parseInt(row['Done'], 10) || 0,
      doing: parseInt(row['Doing'], 10) || 0,
      blocked: parseInt(row['Blocked'], 10) || 0,
      pct: parseInt(row['Pct'], 10) || 0,
    }))
    .filter((row) => row.level && !isNaN(row.timestamp.getTime()));
}

function indexHistoryData(rows) {
  const byLevel = { overall: [], goal: {}, department: {}, employee: {} };
  rows.forEach((row) => {
    if (row.level === 'overall') {
      byLevel.overall.push(row);
    } else if (byLevel[row.level]) {
      if (!byLevel[row.level][row.entity]) byLevel[row.level][row.entity] = [];
      byLevel[row.level][row.entity].push(row);
    }
  });
  byLevel.overall.sort((a, b) => a.timestamp - b.timestamp);
  Object.values(byLevel.goal).forEach((arr) => arr.sort((a, b) => a.timestamp - b.timestamp));
  Object.values(byLevel.department).forEach((arr) => arr.sort((a, b) => a.timestamp - b.timestamp));
  Object.values(byLevel.employee).forEach((arr) => arr.sort((a, b) => a.timestamp - b.timestamp));
  return byLevel;
}

function getHistoryForEntity(level, entity) {
  if (level === 'overall') return appState.history.byLevel.overall || [];
  return (appState.history.byLevel[level] || {})[entity] || [];
}

function computeDelta(historyRows, periodKey) {
  if (historyRows.length < 2) return null;
  const now = Date.now();
  const cutoff = now - PERIOD_DAYS[periodKey] * 24 * 60 * 60 * 1000;
  const current = historyRows[historyRows.length - 1];
  let closest = null;
  let closestDist = Infinity;
  for (const row of historyRows) {
    const dist = Math.abs(row.timestamp.getTime() - cutoff);
    if (dist < closestDist) {
      closestDist = dist;
      closest = row;
    }
  }
  if (!closest || closest === current) return null;
  const pctDelta = current.pct - closest.pct;
  const blockedDelta = current.blocked - closest.blocked;
  const doneDelta = current.done - closest.done;
  return { pctDelta, blockedDelta, doneDelta, from: closest, to: current };
}

function aggregateDaily(historyRows) {
  const byDay = {};
  historyRows.forEach((row) => {
    const dayKey = row.timestamp.toISOString().slice(0, 10);
    byDay[dayKey] = row;
  });
  return Object.values(byDay).sort((a, b) => a.timestamp - b.timestamp);
}

let slugCounter = 0;
function slugify(name) {
  return (
    name
      .replace(/[^a-zA-Z0-9]/g, '-')
      .replace(/-+/g, '-')
      .toLowerCase() +
    '-' +
    slugCounter++
  );
}

function isTrendPanelOpen() {
  return sessionStorage.getItem('trendPanelOpen') === 'true';
}
function setTrendPanelOpen(open) {
  sessionStorage.setItem('trendPanelOpen', String(open));
}

function renderPeriodToggle(container, currentPeriod, onChange) {
  const periods = [
    { key: '1w', label: '1W' },
    { key: '1m', label: '1M' },
    { key: '3m', label: '3M' },
  ];
  container.innerHTML = `
    <div class="period-toggle" role="radiogroup" aria-label="Comparison period">
      ${periods
        .map(
          (p) => `
        <button type="button"
          class="period-toggle-btn${p.key === currentPeriod ? ' period-toggle-active' : ''}"
          data-period="${p.key}"
          role="radio"
          aria-checked="${p.key === currentPeriod}"
        >${p.label}</button>
      `
        )
        .join('')}
    </div>
  `;
  container.querySelectorAll('.period-toggle-btn').forEach((btn) => {
    btn.addEventListener('click', () => onChange(btn.dataset.period));
  });
  const buttons = container.querySelectorAll('.period-toggle-btn');
  buttons.forEach((btn, i) => {
    btn.addEventListener('keydown', (e) => {
      let target;
      if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
        target = buttons[(i + 1) % buttons.length];
      } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
        target = buttons[(i - 1 + buttons.length) % buttons.length];
      }
      if (target) {
        e.preventDefault();
        target.focus();
        onChange(target.dataset.period);
      }
    });
  });
}

function renderDeltaBadge(delta, metric = 'pctDelta') {
  if (!delta) return '';
  const value = delta[metric];
  const direction = value > 0 ? 'Up' : value < 0 ? 'Down' : 'No change';
  const display = metric === 'pctDelta' ? `${Math.abs(value)}%` : Math.abs(value);
  const ariaLabel = `${direction} ${display}`;
  if (value === 0)
    return `<span class="delta-badge delta-neutral" aria-label="${ariaLabel}">→ 0%</span>`;
  const arrow = value > 0 ? '↑' : '↓';
  const cls = value > 0 ? 'delta-up' : 'delta-down';
  return `<span class="delta-badge ${cls}" aria-label="${ariaLabel}">${arrow} ${display}</span>`;
}

function renderFrappeLineChart(containerId, historyRows, metric, yLabel) {
  if (typeof frappe === 'undefined') return;
  const container = document.getElementById(containerId);
  if (!container || !historyRows.length) return;
  container.innerHTML = '';
  const daily = aggregateDaily(historyRows);
  const labels = daily.map((r) =>
    r.timestamp.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
  );
  const values = daily.map((r) => r[metric]);
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  new frappe.Chart(container, {
    data: { labels, datasets: [{ values }] },
    type: 'line',
    height: 180,
    colors: ['#368496'],
    animate: reduceMotion ? 0 : 1,
    lineOptions: { regionFill: 1, hideDots: values.length > 20 },
    axisOptions: { xIsSeries: true },
    tooltipOptions: { formatTooltipY: (d) => `${d} ${yLabel}` },
  });
}

function clearSelectOptions(selectEl) {
  while (selectEl.options.length > 1) selectEl.remove(1);
}

function deriveViewRows() {
  const { rows } = appState;
  const { filters } = appState.view;

  return rows.filter((row) => {
    if (filters.dept && row['Department'] !== filters.dept) return false;
    if (filters.team && row['Team'] !== filters.team) return false;
    if (filters.person && row['Responsible'] !== filters.person) return false;
    if (filters.status && row._status !== filters.status) return false;
    if (filters.goal && (row['Goal'] || 'No Goal') !== filters.goal) return false;
    if (filters.search) {
      const searchableText = Object.values(row).join(' ').toLowerCase();
      if (!searchableText.includes(filters.search.toLowerCase())) return false;
    }
    return true;
  });
}

function deriveSummary(rows) {
  const counts = rows.reduce(
    (acc, row) => {
      if (row._status in acc) acc[row._status]++;
      return acc;
    },
    { done: 0, doing: 0, blocked: 0 }
  );

  const total = rows.length;
  const pct = total ? Math.round((counts.done / total) * 100) : 0;

  return {
    ...counts,
    total,
    pct,
  };
}

function deriveGoalBuckets(rows) {
  const buckets = {};
  rows.forEach((row) => {
    const goal = row['Goal'] || 'No Goal';
    if (!buckets[goal]) {
      buckets[goal] = {
        total: 0,
        done: 0,
        blockedOwners: new Set(),
        latestDate: null,
      };
    }
    const bucket = buckets[goal];
    bucket.total++;
    if (row._status === 'done') bucket.done++;
    if (row._status === 'blocked' && row['Responsible'])
      bucket.blockedOwners.add(row['Responsible']);
    if (row._date && (!bucket.latestDate || row._date > bucket.latestDate))
      bucket.latestDate = row._date;
  });

  return Object.entries(buckets)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([goal, value]) => {
      const pct = value.total ? Math.round((value.done / value.total) * 100) : 0;
      const latestAgeDays = daysSince(value.latestDate);
      return {
        goal,
        total: value.total,
        done: value.done,
        pct,
        blockedOwners: [...value.blockedOwners].sort(),
        stale: latestAgeDays > DATE_STALE_THRESHOLD_DAYS,
        latestAgeDays,
      };
    });
}

function deriveBlockedRows(rows) {
  return rows.filter((row) => row._status === 'blocked');
}

function deriveRecencyLabel(rows, sourceLabel) {
  const goalBuckets = deriveGoalBuckets(rows);
  const validGoalAges = goalBuckets
    .map((bucket) => bucket.latestAgeDays)
    .filter((ageDays) => Number.isFinite(ageDays));

  if (!validGoalAges.length) {
    return `${sourceLabel} · update date unavailable`;
  }

  const hasStaleGoal = validGoalAges.some((ageDays) => ageDays > DATE_STALE_THRESHOLD_DAYS);

  if (hasStaleGoal) {
    const stalestAgeDays = Math.max(...validGoalAges);
    return `${sourceLabel} · stale (${stalestAgeDays}d old)`;
  }

  const freshestAgeDays = Math.min(...validGoalAges);
  return `${sourceLabel} · current (${freshestAgeDays}d old)`;
}

const STATUS_SORT_ORDER = { blocked: 0, doing: 1, other: 2, done: 3 };

function sortViewRows(rows) {
  const { column, direction } = appState.view.sort;
  if (!column || !direction) return rows;

  const sorted = [...rows];
  const mult = direction === 'asc' ? 1 : -1;

  sorted.sort((a, b) => {
    if (column === 'Status') {
      return mult * ((STATUS_SORT_ORDER[a._status] ?? 99) - (STATUS_SORT_ORDER[b._status] ?? 99));
    }

    if (column === 'Added/updated') {
      const aTime = a._date ? a._date.getTime() : -Infinity;
      const bTime = b._date ? b._date.getTime() : -Infinity;
      return mult * (aTime - bTime);
    }

    const aVal = (a[column] || '').toLowerCase();
    const bVal = (b[column] || '').toLowerCase();
    return mult * aVal.localeCompare(bVal);
  });

  return sorted;
}

function isNarrowedViewActive() {
  return Boolean(
    appState.view.filters.search ||
    appState.view.filters.dept ||
    appState.view.filters.team ||
    appState.view.filters.person ||
    appState.view.filters.status ||
    appState.view.filters.goal
  );
}

function renderNoDataState(message) {
  elements.stateBox.style.display = '';
  elements.stateBox.setAttribute('data-hook', 'no-data-state');
  elements.stateBox.innerHTML = `
    <div class="state-icon">📭</div>
    <p>${escapeHtml(message)}<br><small style="color:#64748b">No usable update rows were returned from the source.</small></p>
    <button class="retry-btn" data-hook="retry-btn">Try again</button>
  `;

  const retryBtn = elements.stateBox.querySelector('[data-hook="retry-btn"]');
  if (retryBtn) retryBtn.addEventListener('click', fetchSheetData);
}

function renderLoadingState(sourceLabel) {
  const loadingMessage =
    sourceLabel === 'Live'
      ? 'Fetching latest data from Google Sheets…'
      : `Fetching fixture data (${escapeHtml(sourceLabel)})…`;

  elements.stateBox.style.display = '';
  elements.stateBox.setAttribute('data-hook', 'loading-state');
  elements.stateBox.innerHTML = `
    <div class="state-icon">⏳</div>
    <p id="state-msg">${loadingMessage}</p>
  `;
}

function renderErrorState(sourceLabel, errorMessage) {
  const errorPrefix =
    sourceLabel === 'Live'
      ? 'Could not load data from Google Sheets.'
      : `Could not load fixture data (${escapeHtml(sourceLabel)}).`;

  elements.stateBox.style.display = '';
  elements.stateBox.setAttribute('data-hook', 'error-state');
  elements.stateBox.innerHTML = `
    <div class="state-icon">⚠️</div>
    <p>${errorPrefix}<br><small style="color:#94a3b8">${escapeHtml(errorMessage)}</small></p>
    <button class="retry-btn" data-hook="retry-btn">Try again</button>
  `;
  const retryBtn = elements.stateBox.querySelector('[data-hook="retry-btn"]');
  if (retryBtn) retryBtn.addEventListener('click', fetchSheetData);
}

function updateDataBadge(phase, sourceLabel) {
  const isLoading = phase === 'loading';
  const isError = phase === 'error';
  const isNoData = phase === 'no-data';

  elements.csvBadge.className = `data-badge${isLoading ? ' loading' : ''}${isError || isNoData ? ' error' : ''}`;
  elements.csvDateLabel.textContent = isLoading
    ? `Loading ${sourceLabel.toLowerCase()} data…`
    : isError
      ? `Could not load ${sourceLabel.toLowerCase()} data`
      : isNoData
        ? `No ${sourceLabel.toLowerCase()} source data`
        : appState.lifecycle.refreshedLabel;
}

function updateSpinner(isLoading) {
  if (isLoading) {
    elements.refreshBtn.classList.add('spinning');
  } else {
    elements.refreshBtn.classList.remove('spinning');
  }
}

function setLifecyclePhase(phase, errorMessage = '') {
  appState.lifecycle.phase = phase;
  appState.lifecycle.errorMessage = errorMessage;
  reportLifecycleToQaFixtureDebug(phase, {
    errorMessage,
    sourceLabel: appState.lifecycle.sourceLabel || 'Live',
  });

  const sourceLabel = appState.lifecycle.sourceLabel || 'Live';
  syncVisibility(phase === 'loaded');
  updateDataBadge(phase, sourceLabel);
  updateSpinner(phase === 'loading');

  if (phase === 'loading') {
    renderLoadingState(sourceLabel);
  } else if (phase === 'error') {
    renderErrorState(sourceLabel, errorMessage);
  } else if (phase === 'no-data') {
    renderNoDataState(errorMessage || 'No data found in sheet');
  } else {
    elements.stateBox.style.display = 'none';
    elements.stateBox.removeAttribute('data-hook');
  }
}

function syncVisibility(isLoaded) {
  const display = isLoaded ? '' : 'none';
  elements.summary.style.display = display;
  elements.goalsSection.style.display = display;
  elements.controls.style.display = display;
  elements.resultCount.style.display = display;
  elements.tableWrap.style.display = display;
  if (!isLoaded) {
    elements.blockedSection.style.display = 'none';
    elements.recentActivity.style.display = 'none';
    elements.scopedSummary.style.display = 'none';
    elements.drilldownView.style.display = 'none';
  }

  const isDrilldown = appState.route.view !== 'overview';
  elements.drilldownView.style.display = isDrilldown && isLoaded ? '' : 'none';

  if (isDrilldown) {
    elements.summary.style.display = 'none';
    elements.goalsSection.style.display = 'none';
    elements.controls.style.display = 'none';
    elements.resultCount.style.display = 'none';
    elements.tableWrap.style.display = 'none';
    elements.blockedSection.style.display = 'none';
    elements.recentActivity.style.display = 'none';
    elements.scopedSummary.style.display = 'none';
  }
}

function animateCounterTo(element, targetValue, duration) {
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    element.textContent = targetValue;
    return;
  }
  const startValue = parseInt(element.textContent, 10) || 0;
  if (startValue === targetValue) return;
  const startTime = performance.now();

  function step(now) {
    const elapsed = now - startTime;
    const progress = Math.min(elapsed / duration, 1);
    const eased = 1 - Math.pow(1 - progress, 4);
    const current = Math.round(startValue + (targetValue - startValue) * eased);
    element.textContent = current;
    if (progress < 1) requestAnimationFrame(step);
  }
  requestAnimationFrame(step);
}

function updateOverviewStatDelta(heroZone, statHook, deltaHtml) {
  const stat = heroZone.querySelector(`[data-hook="${statHook}"]`);
  if (!stat) return;
  stat.querySelectorAll('.delta-badge').forEach((badge) => badge.remove());
  if (!deltaHtml) return;
  const valueEl = stat.querySelector('.hero-stat-value');
  if (valueEl) valueEl.insertAdjacentHTML('afterend', deltaHtml);
}

function handleOverviewPeriodChange(newPeriod) {
  const newFilters = { ...appState.route.filters, period: newPeriod };
  if (newPeriod === '1w') delete newFilters.period;
  replaceRoute('overview', '', newFilters);
  renderApp();
}

function refreshOverviewHistoryChrome(heroZone) {
  const overviewPeriod = appState.route.filters.period || '1w';
  const overallHistory = getHistoryForEntity('overall');
  const overallDelta = computeDelta(overallHistory, overviewPeriod);
  const pctBadgeHtml =
    appState.history.status === 'loaded' ? renderDeltaBadge(overallDelta) : '';
  const doneBadgeHtml =
    appState.history.status === 'loaded' ? renderDeltaBadge(overallDelta, 'doneDelta') : '';
  const blockedBadgeHtml =
    appState.history.status === 'loaded' ? renderDeltaBadge(overallDelta, 'blockedDelta') : '';

  const heroPctBadge = heroZone.querySelector('.hero-pct + .delta-badge');
  if (heroPctBadge) heroPctBadge.remove();
  const pctEl = heroZone.querySelector('[data-hook="summary-percent"]');
  if (pctEl && pctBadgeHtml) {
    pctEl.insertAdjacentHTML('afterend', pctBadgeHtml);
  }

  updateOverviewStatDelta(heroZone, 'summary-done', doneBadgeHtml);
  updateOverviewStatDelta(heroZone, 'summary-blocked', blockedBadgeHtml);

  const toggleContainer = heroZone.querySelector('#hero-period-toggle');
  if (!toggleContainer) return;

  if (appState.history.status === 'loaded') {
    toggleContainer.style.removeProperty('display');
    renderPeriodToggle(toggleContainer, overviewPeriod, handleOverviewPeriodChange);
    return;
  }

  toggleContainer.style.display = 'none';
  toggleContainer.innerHTML = '';
}

function renderSummary(rows) {
  const summary = deriveSummary(rows);
  const doneClass = summary.done > 0 ? 'status-done' : '';
  const blockedClass = summary.blocked > 0 ? 'status-blocked' : '';

  const existingHeroZone = elements.summary.querySelector('.hero-zone');

  if (existingHeroZone) {
    const pctEl = existingHeroZone.querySelector('[data-hook="summary-percent"]');
    const doneEl = existingHeroZone.querySelector('[data-hook="summary-done"] .hero-stat-value');
    const doingEl = existingHeroZone.querySelector('[data-hook="summary-doing"] .hero-stat-value');
    const blockedEl = existingHeroZone.querySelector(
      '[data-hook="summary-blocked"] .hero-stat-value'
    );
    const totalEl = existingHeroZone.querySelector('[data-hook="summary-total"] .hero-stat-value');

    // Animate the pct text node (before the % span)
    if (pctEl) {
      const pctTextNode = [...pctEl.childNodes].find((n) => n.nodeType === Node.TEXT_NODE);
      if (pctTextNode) {
        const startValue = parseInt(pctTextNode.textContent, 10) || 0;
        if (startValue !== summary.pct) {
          if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
            pctTextNode.textContent = summary.pct;
          } else {
            const startTime = performance.now();
            (function step(now) {
              const elapsed = now - startTime;
              const progress = Math.min(elapsed / 300, 1);
              const eased = 1 - Math.pow(1 - progress, 4);
              pctTextNode.textContent = Math.round(startValue + (summary.pct - startValue) * eased);
              if (progress < 1) requestAnimationFrame(step);
            })(performance.now());
          }
        }
      }
    }

    const progressFill = existingHeroZone.querySelector('[data-hook="summary-progress-fill"]');
    if (progressFill) progressFill.style.width = `${summary.pct}%`;

    if (doneEl) {
      doneEl.className = `hero-stat-value ${doneClass}`.trim();
      animateCounterTo(doneEl, summary.done, 300);
    }
    if (doingEl) animateCounterTo(doingEl, summary.doing, 300);
    if (blockedEl) {
      blockedEl.className = `hero-stat-value ${blockedClass}`.trim();
      animateCounterTo(blockedEl, summary.blocked, 300);
    }
    if (totalEl) animateCounterTo(totalEl, summary.total, 300);
    refreshOverviewHistoryChrome(existingHeroZone);

    return;
  }

  const overviewPeriod = appState.route.filters.period || '1w';
  const overallHistory = getHistoryForEntity('overall');
  const overallDelta = computeDelta(overallHistory, overviewPeriod);
  const deltaBadgeHtml = appState.history.status === 'loaded' ? renderDeltaBadge(overallDelta) : '';
  const doneDeltaHtml =
    appState.history.status === 'loaded' ? renderDeltaBadge(overallDelta, 'doneDelta') : '';
  const blockedDeltaHtml =
    appState.history.status === 'loaded' ? renderDeltaBadge(overallDelta, 'blockedDelta') : '';

  elements.summary.innerHTML = `
    <div class="hero-zone" data-hook="hero-zone">
      <div class="hero-pct" data-hook="summary-percent">${summary.pct}<span class="hero-pct-symbol">%</span></div>
      ${deltaBadgeHtml}
      <div class="hero-label">Complete</div>
      <div class="hero-progress" data-hook="summary-progress">
        <div class="hero-progress-track">
          <div class="hero-progress-fill" data-hook="summary-progress-fill" style="width:${summary.pct}%"></div>
        </div>
      </div>
      <div class="hero-period-toggle" id="hero-period-toggle"></div>
      <div class="hero-stats">
        <div class="hero-stat" data-hook="summary-done">
          <span class="hero-stat-value ${doneClass}">${summary.done}</span>
          ${doneDeltaHtml}
          <span class="hero-stat-label">Done</span>
        </div>
        <div class="hero-stat-divider"></div>
        <div class="hero-stat" data-hook="summary-doing">
          <span class="hero-stat-value">${summary.doing}</span>
          <span class="hero-stat-label">In Progress</span>
        </div>
        <div class="hero-stat-divider"></div>
        <div class="hero-stat" data-hook="summary-blocked">
          <span class="hero-stat-value ${blockedClass}">${summary.blocked}</span>
          ${blockedDeltaHtml}
          <span class="hero-stat-label">Blocked</span>
        </div>
        <div class="hero-stat-divider"></div>
        <div class="hero-stat" data-hook="summary-total">
          <span class="hero-stat-value">${summary.total}</span>
          <span class="hero-stat-label">Total Updates</span>
        </div>
      </div>
      <a href="#/trends" class="hero-trends-link" data-hook="trends-link">View trends →</a>
    </div>
  `;

  const heroZone = elements.summary.querySelector('.hero-zone');
  if (heroZone) refreshOverviewHistoryChrome(heroZone);
}

function renderGoals(rows) {
  const frameGoals = deriveGoalBuckets(appState.rows);
  const activeGoalMap = new Map(
    deriveGoalBuckets(rows).map((goalData) => [goalData.goal, goalData])
  );

  elements.goalsGrid.innerHTML = '';

  frameGoals.forEach((frameGoal) => {
    const activeGoalData = activeGoalMap.get(frameGoal.goal) || {
      goal: frameGoal.goal,
      total: 0,
      done: 0,
      pct: 0,
      blockedOwners: [],
      stale: false,
    };

    const div = document.createElement('button');
    const isScopable = activeGoalData.total > 0;
    const isInteractive = isScopable;
    const overviewPeriod = appState.route.filters.period || '1w';
    const goalHistory = getHistoryForEntity('goal', activeGoalData.goal);
    const goalDelta = computeDelta(goalHistory, overviewPeriod);
    const goalDeltaHtml = isScopable && goalDelta ? renderDeltaBadge(goalDelta) : '';
    div.type = 'button';
    div.className = `goal-card${isScopable && activeGoalData.pct < 25 ? ' status-low' : ''}${!isScopable ? ' goal-card-empty' : ''}`;
    div.setAttribute('data-hook', 'goal-card');
    div.setAttribute('data-goal', activeGoalData.goal);
    div.setAttribute('aria-disabled', String(!isInteractive));
    div.setAttribute('data-scopable', String(isScopable));

    const blockedOwnersText = activeGoalData.blockedOwners.length
      ? `<div class="goal-signals" data-hook="goal-blocked-owners">Blocked: ${escapeHtml(activeGoalData.blockedOwners.join(', '))}</div>`
      : '';
    const staleText = activeGoalData.stale
      ? `<div class="goal-signals stale" data-hook="goal-stale">Stale (&gt; ${DATE_STALE_THRESHOLD_DAYS}d)</div>`
      : '';
    const emptyText = !isScopable
      ? '<div class="goal-signals goal-signals-empty" data-hook="goal-empty">No updates in current view</div>'
      : '';

    div.innerHTML = `
      <div class="goal-title">${escapeHtml(activeGoalData.goal)}</div>
      <div class="goal-meta">
        <div class="goal-pct-large">${activeGoalData.pct}%${goalDeltaHtml}</div>
        <div class="goal-count">${activeGoalData.done} / ${activeGoalData.total} <span style="font-size:0.7em">DONE</span></div>
      </div>
      <div class="goal-progress"><div class="goal-progress-fill" style="width:${activeGoalData.pct}%"></div></div>
      ${emptyText}
      ${blockedOwnersText}
      ${staleText}
      ${isScopable ? '<div class="goal-card-arrow">View →</div>' : ''}
    `;

    if (isInteractive) {
      div.addEventListener('click', () => navigateTo('goal', activeGoalData.goal));
    }

    elements.goalsGrid.appendChild(div);
  });
}

function renderBlocked(rows) {
  const blocked = deriveBlockedRows(rows);

  if (!blocked.length) {
    elements.blockedSection.style.display = 'none';
    elements.blockedSection.innerHTML = '';
    return;
  }

  elements.blockedSection.style.display = '';
  elements.blockedSection.innerHTML = `
    <h2 class="blocked-heading">Blocked Items</h2>
    <div class="blocked-list" data-hook="blocked-list">
      ${blocked
        .map(
          (row) => `
            <div class="blocked-item" data-hook="blocked-item" data-person="${escapeHtml(row['Responsible'] || '')}">
              <div class="blocked-item-header">
                <a href="${escapeHtml(buildHash('employee', row['Responsible']))}" class="blocked-item-person-link" data-hook="blocked-person-link">${escapeHtml(row['Responsible'])}</a>
                <span class="blocked-item-topic">${escapeHtml(row['Topic'])}</span>
              </div>
              ${row['Details'] ? `<div class="blocked-item-details">${escapeHtml(row['Details'])}</div>` : ''}
            </div>
          `
        )
        .join('')}
    </div>
  `;
}

function renderRecentActivity(rows) {
  const dated = rows
    .filter((row) => row._date)
    .sort((a, b) => b._date - a._date)
    .slice(0, 5);

  if (!dated.length) {
    elements.recentActivity.style.display = 'none';
    return;
  }

  elements.recentActivity.style.display = '';
  elements.recentActivityList.innerHTML = dated
    .map((row) => {
      const dateStr = row['Added/updated'] || '';
      return `<div class="activity-item" data-hook="activity-item">
      <div class="activity-date">${escapeHtml(dateStr)}</div>
      <div class="activity-body">
        <div class="activity-header">
          <a href="${escapeHtml(buildHash('employee', row['Responsible']))}" class="activity-person" data-hook="activity-person-link">${escapeHtml(row['Responsible'])}</a>
          ${badge(row.Status, row._status)}
        </div>
        <div class="activity-topic">${escapeHtml(row['Topic'])}</div>
        <div class="activity-meta">${escapeHtml(row['Goal'] || '')}${row['Goal'] && row['Department'] ? ' · ' : ''}${escapeHtml(row['Department'] || '')}</div>
      </div>
    </div>`;
    })
    .join('');
}

function renderScopedSummary(viewRows) {
  const narrowed = isNarrowedViewActive();

  if (!narrowed) {
    elements.scopedSummary.style.display = 'none';
    return;
  }

  const summary = deriveSummary(viewRows);
  const doneClass = summary.done > 0 ? ' status-done' : '';
  const blockedClass = summary.blocked > 0 ? ' status-blocked' : '';

  elements.scopedSummary.style.display = '';
  elements.scopedSummary.innerHTML = `
    <span class="scoped-summary-label">Filtered view</span>
    <div class="scoped-summary-stats">
      <div class="scoped-summary-stat">
        <span class="scoped-summary-stat-value">${summary.pct}%</span>
        <span class="scoped-summary-stat-label">Complete</span>
      </div>
      <div class="scoped-summary-divider"></div>
      <div class="scoped-summary-stat">
        <span class="scoped-summary-stat-value${doneClass}">${summary.done}</span>
        <span class="scoped-summary-stat-label">Done</span>
      </div>
      <div class="scoped-summary-divider"></div>
      <div class="scoped-summary-stat">
        <span class="scoped-summary-stat-value">${summary.doing}</span>
        <span class="scoped-summary-stat-label">In Progress</span>
      </div>
      <div class="scoped-summary-divider"></div>
      <div class="scoped-summary-stat">
        <span class="scoped-summary-stat-value${blockedClass}">${summary.blocked}</span>
        <span class="scoped-summary-stat-label">Blocked</span>
      </div>
      <div class="scoped-summary-divider"></div>
      <div class="scoped-summary-stat">
        <span class="scoped-summary-stat-value">${summary.total}</span>
        <span class="scoped-summary-stat-label">Total</span>
      </div>
    </div>
  `;
}

function badge(raw, normalized) {
  if (normalized === 'done') return '<span class="badge badge-done">Done</span>';
  if (normalized === 'doing') return '<span class="badge badge-doing">In Progress</span>';
  if (normalized === 'blocked') return '<span class="badge badge-blocked">Blocked</span>';
  return `<span class="badge badge-other">${escapeHtml(raw)}</span>`;
}

function buildRowKey(row, fallbackIndex) {
  const persistentId = row.__rowId || fallbackIndex;
  return `${(row['Department'] || 'other').toLowerCase()}-${(row['Responsible'] || 'unknown').toLowerCase()}-${persistentId}`.replace(
    /[^a-z0-9-]+/g,
    '-'
  );
}

function toggleExpandedRow(rowKey) {
  const activeElement = document.activeElement;
  const shouldRestoreFocus = activeElement && activeElement.getAttribute('data-row-key') === rowKey;

  const isCurrentlyExpanded = appState.view.expandedRowKey === rowKey;
  const nextExpandedKey = isCurrentlyExpanded ? null : rowKey;

  // Collapse previously expanded row (if different from this one)
  if (appState.view.expandedRowKey && appState.view.expandedRowKey !== rowKey) {
    const prevDetailRow = document.getElementById(`details-${appState.view.expandedRowKey}`);
    const prevSummaryRow = document.querySelector(
      `[data-hook="table-row-summary"][data-row-key="${appState.view.expandedRowKey}"]`
    );
    if (prevDetailRow) prevDetailRow.classList.remove('expand-row-open');
    if (prevSummaryRow) prevSummaryRow.setAttribute('aria-expanded', 'false');
  }

  appState.view.expandedRowKey = nextExpandedKey;

  // Toggle current row in-place for smooth animation
  const detailRow = document.getElementById(`details-${rowKey}`);
  const summaryRow = document.querySelector(
    `[data-hook="table-row-summary"][data-row-key="${rowKey}"]`
  );
  if (detailRow) detailRow.classList.toggle('expand-row-open', !isCurrentlyExpanded);
  if (summaryRow) summaryRow.setAttribute('aria-expanded', String(!isCurrentlyExpanded));

  if (shouldRestoreFocus && summaryRow) summaryRow.focus();
}

function renderTable(rows) {
  if (!rows.length) {
    const emptyMessage = isNarrowedViewActive()
      ? 'No updates match your current search or filters.'
      : 'No updates are currently available.';

    elements.tableBody.innerHTML = `
      <tr>
        <td colspan="5" class="empty" data-hook="no-results-state">
          <div>${emptyMessage}</div>
          <button type="button" class="retry-btn" data-hook="empty-reset-btn">Reset filters</button>
        </td>
      </tr>
    `;
    elements.resultCount.textContent = 'No matching updates';

    const resetFromEmpty = elements.tableBody.querySelector('[data-hook="empty-reset-btn"]');
    if (resetFromEmpty) {
      resetFromEmpty.addEventListener('click', resetFilters);
    }
    return;
  }

  elements.resultCount.textContent = `Showing ${rows.length} update${rows.length !== 1 ? 's' : ''}`;

  const isSorted = Boolean(appState.view.sort.column);
  const sortedRows = sortViewRows(rows);

  elements.tableBody.innerHTML = '';

  function appendDataRow(row, fallbackIndex) {
    const rowKey = buildRowKey(row, fallbackIndex);
    const isExpanded = appState.view.expandedRowKey === rowKey;

    const summaryRow = document.createElement('tr');
    summaryRow.tabIndex = 0;
    summaryRow.setAttribute('role', 'button');
    summaryRow.setAttribute('aria-expanded', String(isExpanded));
    summaryRow.setAttribute('aria-controls', `details-${rowKey}`);
    summaryRow.setAttribute('data-hook', 'table-row-summary');
    summaryRow.setAttribute('data-row-key', rowKey);
    summaryRow.innerHTML = `
      <td class="td-person"><span class="expand-icon" aria-hidden="true">›</span><a href="${escapeHtml(buildHash('employee', row['Responsible']))}" class="td-person-link" data-hook="person-link">${escapeHtml(row['Responsible'])}</a></td>
      <td class="td-topic">${escapeHtml(row['Topic'])}</td>
      <td>${badge(row.Status, row._status)}</td>
      <td class="td-goal">${escapeHtml(row['Goal'])}</td>
      <td class="td-date">${escapeHtml(row['Added/updated'])}</td>
    `;

    const detailRow = document.createElement('tr');
    detailRow.className = `expand-row${isExpanded ? ' expand-row-open' : ''}`;
    detailRow.id = `details-${rowKey}`;
    detailRow.setAttribute('data-hook', 'table-row-detail');
    detailRow.setAttribute('data-row-key', rowKey);
    detailRow.innerHTML = `
      <td colspan="5">
        <div class="expand-wrapper">
          <div class="expand-inner">
            <div class="expand-content">
              <div class="expand-grid">
                ${row['Team'] ? `<div class="expand-item expand-team"><span class="expand-label">Team</span><div class="expand-field">${escapeHtml(row['Team'])}</div></div>` : ''}
                ${row['Details'] ? `<div class="expand-item expand-details"><span class="expand-label">Details</span><div class="expand-field">${escapeHtml(row['Details'])}</div></div>` : ''}
                ${row['Notes'] ? `<div class="expand-item expand-notes"><span class="expand-label">Notes</span><div class="expand-field">${escapeHtml(row['Notes'])}</div></div>` : ''}
              </div>
              <div class="expand-grid expand-mobile-only">
                ${row['Goal'] ? `<div class="expand-item"><span class="expand-label">Goal</span><div class="expand-field">${escapeHtml(row['Goal'])}</div></div>` : ''}
                ${row['Added/updated'] ? `<div class="expand-item"><span class="expand-label">Updated</span><div class="expand-field">${escapeHtml(row['Added/updated'])}</div></div>` : ''}
              </div>
            </div>
          </div>
        </div>
      </td>
    `;

    const onToggle = () => toggleExpandedRow(rowKey);
    summaryRow.addEventListener('click', (event) => {
      if (event.target.closest('.td-person-link')) {
        event.preventDefault();
        navigateTo('employee', row['Responsible']);
        return;
      }
      onToggle();
    });
    summaryRow.addEventListener('keydown', (event) => {
      if (event.key === 'ArrowDown') {
        event.preventDefault();
        focusAdjacentSummaryRow(summaryRow, 1);
        return;
      }

      if (event.key === 'ArrowUp') {
        event.preventDefault();
        focusAdjacentSummaryRow(summaryRow, -1);
        return;
      }

      if (event.key !== 'Enter' && event.key !== ' ') return;
      event.preventDefault();
      onToggle();
    });

    elements.tableBody.appendChild(summaryRow);
    elements.tableBody.appendChild(detailRow);
  }

  if (isSorted) {
    sortedRows.forEach((row, index) => appendDataRow(row, index));
  } else {
    const grouped = rows.reduce((acc, row) => {
      const dept = row['Department'] || 'Other';
      if (!acc[dept]) acc[dept] = [];
      acc[dept].push(row);
      return acc;
    }, {});

    Object.entries(grouped)
      .sort(([a], [b]) => a.localeCompare(b))
      .forEach(([dept, deptRows]) => {
        const groupHeader = document.createElement('tr');
        groupHeader.className = 'group-header';
        groupHeader.setAttribute('data-hook', 'table-group-header');
        groupHeader.setAttribute('data-department', dept);
        groupHeader.setAttribute('role', 'button');
        groupHeader.setAttribute('tabindex', '0');
        groupHeader.innerHTML = `<td colspan="5">${escapeHtml(dept)} &mdash; ${deptRows.length} update${deptRows.length !== 1 ? 's' : ''}</td>`;

        const onNavigateDepartment = () => navigateTo('department', dept);
        groupHeader.addEventListener('click', onNavigateDepartment);
        groupHeader.addEventListener('keydown', (event) => {
          if (event.key !== 'Enter' && event.key !== ' ') return;
          event.preventDefault();
          onNavigateDepartment();
        });

        elements.tableBody.appendChild(groupHeader);

        deptRows.forEach((row, index) => appendDataRow(row, `${dept}-${index}`));
      });
  }
}

function updateFilterBadge() {
  const count = [
    appState.view.filters.dept,
    appState.view.filters.team,
    appState.view.filters.person,
    appState.view.filters.status,
    appState.view.filters.goal,
  ].filter((value) => value !== '').length;

  elements.filterBadge.textContent = count > 0 ? String(count) : '';
  elements.filterBadge.style.display = count > 0 ? '' : 'none';
}

function populateTeamOptions() {
  clearSelectOptions(elements.filterTeam);

  const teams = [
    ...new Set(
      appState.rows
        .filter(
          (row) => !appState.view.filters.dept || row['Department'] === appState.view.filters.dept
        )
        .map((row) => row['Team'])
        .filter(Boolean)
    ),
  ].sort();

  teams.forEach((team) => {
    const option = document.createElement('option');
    option.value = team;
    option.textContent = team;
    elements.filterTeam.appendChild(option);
  });

  if (appState.view.filters.team && teams.includes(appState.view.filters.team)) {
    elements.filterTeam.value = appState.view.filters.team;
  } else if (appState.view.filters.team && !teams.includes(appState.view.filters.team)) {
    appState.view.filters.team = '';
    elements.filterTeam.value = '';
  }
}

function setSelectValueFromState(selectEl, value, onInvalid) {
  if (!value) {
    selectEl.value = '';
    return;
  }

  const hasOption = [...selectEl.options].some((option) => option.value === value);
  if (hasOption) {
    selectEl.value = value;
    return;
  }

  if (typeof onInvalid === 'function') onInvalid();
  selectEl.value = '';
}

function populateFilterOptions() {
  const populateSelectFromColumn = (el, key) => {
    clearSelectOptions(el);
    const values = [
      ...new Set(
        appState.rows.map((row) => row[key] || (key === 'Goal' ? 'No Goal' : '')).filter(Boolean)
      ),
    ].sort();
    values.forEach((value) => {
      const option = document.createElement('option');
      option.value = value;
      option.textContent = value;
      el.appendChild(option);
    });
  };

  populateSelectFromColumn(elements.filterDept, 'Department');
  populateSelectFromColumn(elements.filterPerson, 'Responsible');
  populateSelectFromColumn(elements.filterGoal, 'Goal');

  clearSelectOptions(elements.filterStatus);
  [
    ['done', 'Done'],
    ['doing', 'In Progress'],
    ['blocked', 'Blocked'],
  ].forEach(([value, label]) => {
    const option = document.createElement('option');
    option.value = value;
    option.textContent = label;
    elements.filterStatus.appendChild(option);
  });

  setSelectValueFromState(elements.filterDept, appState.view.filters.dept, () => {
    appState.view.filters.dept = '';
    appState.view.filters.team = '';
  });
  populateTeamOptions();
  setSelectValueFromState(elements.filterPerson, appState.view.filters.person, () => {
    appState.view.filters.person = '';
  });
  setSelectValueFromState(elements.filterStatus, appState.view.filters.status, () => {
    appState.view.filters.status = '';
  });
  setSelectValueFromState(elements.filterGoal, appState.view.filters.goal, () => {
    appState.view.filters.goal = '';
  });
}

function renderTableWithCrossfade(rows) {
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    renderTable(rows);
    return;
  }

  renderTable(rows);
  elements.tableBody.classList.add('table-fade-in');
  setTimeout(() => elements.tableBody.classList.remove('table-fade-in'), 200);
}

function parseRoute(hash) {
  const raw = (hash || '').replace(/^#\/?/, '');
  if (!raw) return { view: 'overview', param: '', filters: {} };

  const [pathPart, queryPart] = raw.split('?');
  const segments = pathPart.split('/').map((s) => decodeURIComponent(s.replace(/\+/g, ' ')));
  const view = segments[0] || 'overview';
  const param = segments.slice(1).join('/');

  const validViews = ['overview', 'goal', 'department', 'employee', 'trends'];
  if (!validViews.includes(view)) return { view: 'overview', param: '', filters: {} };
  if (view !== 'overview' && view !== 'trends' && !param)
    return { view: 'overview', param: '', filters: {} };

  const filters = {};
  if (queryPart) {
    new URLSearchParams(queryPart).forEach((value, key) => {
      filters[key] = value;
    });
  }

  return { view, param, filters };
}

function buildHash(view, param, filters) {
  if (view === 'overview') {
    if (filters && Object.keys(filters).length) {
      return `#/?${new URLSearchParams(filters).toString()}`;
    }
    return '#/';
  }
  if (view === 'trends') {
    let hash = '#/trends';
    if (filters && Object.keys(filters).length) {
      hash += `?${new URLSearchParams(filters).toString()}`;
    }
    return hash;
  }
  let hash = `#/${encodeURIComponent(view)}/${encodeURIComponent(param).replace(/%20/g, '+')}`;
  if (filters && Object.keys(filters).length) {
    const qs = new URLSearchParams(filters).toString();
    hash += `?${qs}`;
  }
  return hash;
}

function navigateTo(view, param = '', filters = {}) {
  const hash = buildHash(view, param, filters);
  if (window.location.hash === hash) return;
  window.location.hash = hash;
}

function replaceRoute(view, param = '', filters = {}) {
  const hash = buildHash(view, param, filters);
  history.replaceState(null, '', hash);
  appState.route = parseRoute(hash);
}

function onRouteChange() {
  const newRoute = parseRoute(window.location.hash);
  appState.route = newRoute;
  collapseExpandedRow();
  renderApp();
}

function renderBreadcrumb(crumbs) {
  elements.drilldownBreadcrumbList.innerHTML = crumbs
    .map((crumb, i) => {
      const isLast = i === crumbs.length - 1;
      if (isLast) {
        return `<li><span aria-current="page">${escapeHtml(crumb.label)}</span></li>`;
      }
      return `<li><a href="${escapeHtml(crumb.hash)}">${escapeHtml(crumb.label)}</a></li>`;
    })
    .join('');
}

function renderDrilldownFilters(filterConfig) {
  const { filters } = appState.route;

  elements.drilldownFilters.innerHTML = filterConfig
    .map((config) => {
      if (config.key === 'search') {
        return `
          <div class="drilldown-filter-group" style="flex:1;min-width:160px">
            <label for="drilldown-search">Search</label>
            <input type="text" id="drilldown-search" placeholder="Search…" value="${escapeHtml(filters.search || '')}" />
          </div>
        `;
      }
      const selectedValue = filters[config.key] || '';
      const optionsHtml = (config.options || [])
        .map(
          (opt) =>
            `<option value="${escapeHtml(opt)}"${opt === selectedValue ? ' selected' : ''}>${escapeHtml(opt)}</option>`
        )
        .join('');
      return `
        <div class="drilldown-filter-group">
          <label for="drilldown-filter-${config.key}">${escapeHtml(config.label)}</label>
          <select id="drilldown-filter-${config.key}">
            <option value="">All</option>
            ${optionsHtml}
          </select>
        </div>
      `;
    })
    .join('');

  filterConfig.forEach((config) => {
    if (config.key === 'search') {
      const input = document.getElementById('drilldown-search');
      if (input) {
        let timer;
        input.addEventListener('input', () => {
          clearTimeout(timer);
          timer = setTimeout(() => {
            const newFilters = { ...appState.route.filters, search: input.value };
            if (!input.value) delete newFilters.search;
            navigateTo(appState.route.view, appState.route.param, newFilters);
          }, 200);
        });
      }
    } else {
      const select = document.getElementById(`drilldown-filter-${config.key}`);
      if (select) {
        select.addEventListener('change', () => {
          const newFilters = { ...appState.route.filters, [config.key]: select.value };
          if (!select.value) delete newFilters[config.key];
          navigateTo(appState.route.view, appState.route.param, newFilters);
        });
      }
    }
  });
}

function applyDrilldownFilters(rows, filters) {
  return rows.filter((row) => {
    if (filters.status && row._status !== filters.status) return false;
    if (filters.dept && row['Department'] !== filters.dept) return false;
    if (filters.team && row['Team'] !== filters.team) return false;
    if (filters.person && row['Responsible'] !== filters.person) return false;
    if (filters.search) {
      const text = Object.values(row).join(' ').toLowerCase();
      if (!text.includes(filters.search.toLowerCase())) return false;
    }
    return true;
  });
}

function renderDrilldownSummaryStats(summary) {
  const doneClass = summary.done > 0 ? ' status-done' : '';
  const blockedClass = summary.blocked > 0 ? ' status-blocked' : '';
  return `
    <div class="drilldown-stats">
      <div class="drilldown-stat">
        <span class="drilldown-stat-value">${summary.pct}%</span>
        <span class="drilldown-stat-label">Complete</span>
      </div>
      <div class="drilldown-stat-divider"></div>
      <div class="drilldown-stat">
        <span class="drilldown-stat-value${doneClass}">${summary.done}</span>
        <span class="drilldown-stat-label">Done</span>
      </div>
      <div class="drilldown-stat-divider"></div>
      <div class="drilldown-stat">
        <span class="drilldown-stat-value">${summary.doing}</span>
        <span class="drilldown-stat-label">In Progress</span>
      </div>
      <div class="drilldown-stat-divider"></div>
      <div class="drilldown-stat">
        <span class="drilldown-stat-value${blockedClass}">${summary.blocked}</span>
        <span class="drilldown-stat-label">Blocked</span>
      </div>
      <div class="drilldown-stat-divider"></div>
      <div class="drilldown-stat">
        <span class="drilldown-stat-value">${summary.total}</span>
        <span class="drilldown-stat-label">Total</span>
      </div>
    </div>
  `;
}

function renderDrilldownTable(rows) {
  elements.drilldownTableBody.innerHTML = '';

  if (!rows.length) {
    elements.drilldownTableBody.innerHTML = `
      <tr><td colspan="5" class="empty">No updates match the current filters.</td></tr>
    `;
    elements.drilldownResultCount.textContent = 'No matching updates';
    return;
  }

  elements.drilldownResultCount.textContent = `Showing ${rows.length} update${rows.length !== 1 ? 's' : ''}`;

  rows.forEach((row, index) => {
    const rowKey = buildRowKey(row, `dd-${index}`);
    const isExpanded = appState.view.expandedRowKey === rowKey;

    const summaryRow = document.createElement('tr');
    summaryRow.tabIndex = 0;
    summaryRow.setAttribute('role', 'button');
    summaryRow.setAttribute('aria-expanded', String(isExpanded));
    summaryRow.setAttribute('aria-controls', `details-${rowKey}`);
    summaryRow.setAttribute('data-hook', 'drilldown-row');
    summaryRow.setAttribute('data-row-key', rowKey);
    summaryRow.innerHTML = `
      <td class="td-person"><span class="expand-icon" aria-hidden="true">›</span>${escapeHtml(row['Responsible'])}</td>
      <td class="td-topic">${escapeHtml(row['Topic'])}</td>
      <td>${badge(row.Status, row._status)}</td>
      <td class="td-goal">${escapeHtml(row['Goal'])}</td>
      <td class="td-date">${escapeHtml(row['Added/updated'])}</td>
    `;

    const detailRow = document.createElement('tr');
    detailRow.className = `expand-row${isExpanded ? ' expand-row-open' : ''}`;
    detailRow.id = `details-${rowKey}`;
    detailRow.setAttribute('data-hook', 'drilldown-row-detail');
    detailRow.innerHTML = `
      <td colspan="5">
        <div class="expand-wrapper">
          <div class="expand-inner">
            <div class="expand-content">
              <div class="expand-grid">
                ${row['Team'] ? `<div class="expand-item"><span class="expand-label">Team</span><div class="expand-field">${escapeHtml(row['Team'])}</div></div>` : ''}
                ${row['Details'] ? `<div class="expand-item"><span class="expand-label">Details</span><div class="expand-field">${escapeHtml(row['Details'])}</div></div>` : ''}
                ${row['Notes'] ? `<div class="expand-item"><span class="expand-label">Notes</span><div class="expand-field">${escapeHtml(row['Notes'])}</div></div>` : ''}
              </div>
            </div>
          </div>
        </div>
      </td>
    `;

    const onToggle = () => toggleExpandedRow(rowKey);
    summaryRow.addEventListener('click', onToggle);
    summaryRow.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        onToggle();
      }
    });

    elements.drilldownTableBody.appendChild(summaryRow);
    elements.drilldownTableBody.appendChild(detailRow);
  });
}

function renderDrilldownTrendPanel(level, entity, filters) {
  const container = elements.drilldownTrendPanel;
  if (!container) return;

  if (appState.history.status !== 'loaded') {
    container.style.display = 'none';
    return;
  }

  const period = filters.period || '1w';
  const periodDays = PERIOD_DAYS[period];
  const cutoff = Date.now() - periodDays * 24 * 60 * 60 * 1000;
  const historyRows = getHistoryForEntity(level, entity).filter(
    (r) => r.timestamp.getTime() >= cutoff
  );

  container.style.display = '';
  const isOpen = isTrendPanelOpen();

  container.innerHTML = `
    <button type="button" class="trend-panel-toggle" aria-expanded="${isOpen}" data-hook="trend-panel-toggle">
      ${isOpen ? 'Hide' : 'Show'} Trends
      <span class="trend-panel-chevron">${isOpen ? '▾' : '▸'}</span>
    </button>
    <div class="trend-panel-content${isOpen ? ' trend-panel-open' : ''}">
      <div class="trend-panel-period" id="drilldown-trend-period"></div>
      <div class="trend-panel-charts" id="drilldown-trend-charts"></div>
    </div>
  `;

  container.querySelector('.trend-panel-toggle').addEventListener('click', () => {
    setTrendPanelOpen(!isOpen);
    renderDrilldownTrendPanel(level, entity, filters);
  });

  if (!isOpen) return;

  const periodEl = document.getElementById('drilldown-trend-period');
  renderPeriodToggle(periodEl, period, (newPeriod) => {
    const newFilters = { ...filters, period: newPeriod };
    if (newPeriod === '1w') delete newFilters.period;
    navigateTo(appState.route.view, appState.route.param, newFilters);
  });

  const chartsEl = document.getElementById('drilldown-trend-charts');
  if (historyRows.length < 2) {
    chartsEl.innerHTML =
      '<p class="trend-panel-empty">Not enough data for this period. Try a wider range.</p>';
    return;
  }

  if (level === 'goal') {
    chartsEl.innerHTML = `
      <div class="trend-panel-chart" id="trend-chart-pct" aria-label="Completion trend chart"></div>
      <div class="trend-panel-chart" id="trend-chart-blocked" aria-label="Blocked items trend chart"></div>
    `;
    renderFrappeLineChart('trend-chart-pct', historyRows, 'pct', '% Complete');
    renderFrappeLineChart('trend-chart-blocked', historyRows, 'blocked', 'Blocked');
  } else if (level === 'department') {
    chartsEl.innerHTML = `
      <div class="trend-panel-chart" id="trend-chart-pct" aria-label="Completion trend chart"></div>
      <div class="trend-panel-chart" id="trend-chart-workload" aria-label="Workload trend chart"></div>
    `;
    renderFrappeLineChart('trend-chart-pct', historyRows, 'pct', '% Complete');
    renderFrappeLineChart('trend-chart-workload', historyRows, 'total', 'Total Items');
  } else if (level === 'employee') {
    chartsEl.innerHTML = `
      <div class="trend-panel-chart" id="trend-chart-pct" aria-label="Completion trend chart"></div>
      <div class="trend-panel-chart" id="trend-chart-done" aria-label="Done items trend chart"></div>
      <div class="trend-panel-chart" id="trend-chart-blocked" aria-label="Blocked items trend chart"></div>
    `;
    renderFrappeLineChart('trend-chart-pct', historyRows, 'pct', '% Complete');
    renderFrappeLineChart('trend-chart-done', historyRows, 'done', 'Done');
    renderFrappeLineChart('trend-chart-blocked', historyRows, 'blocked', 'Blocked');
  }
}

function renderGoalDrilldown(goalName, filters) {
  const allGoalRows = appState.rows.filter((row) => (row['Goal'] || 'No Goal') === goalName);

  if (!allGoalRows.length) {
    navigateTo('overview');
    return;
  }

  const filteredRows = applyDrilldownFilters(allGoalRows, filters);
  const summary = deriveSummary(filteredRows);
  const allSummary = deriveSummary(allGoalRows);

  // Breadcrumb
  renderBreadcrumb([{ label: 'Overview', hash: '#/' }, { label: goalName }]);

  // Header
  elements.drilldownTitle.textContent = goalName;
  elements.drilldownSubtitle.textContent = `${allGoalRows.length} total updates`;

  // Hero zone
  const departments = {};
  allGoalRows.forEach((row) => {
    const dept = row['Department'] || 'Other';
    if (!departments[dept]) departments[dept] = 0;
    departments[dept]++;
  });

  const blockedRows = allGoalRows.filter((row) => row._status === 'blocked');

  const deptChips = Object.entries(departments)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(
      ([dept, count]) =>
        `<a href="${escapeHtml(buildHash('department', dept))}" class="drilldown-chip">${escapeHtml(dept)} <span class="drilldown-chip-count">${count}</span></a>`
    )
    .join('');

  const blockedCallout = blockedRows.length
    ? `<div class="drilldown-blocked-callout" data-hook="drilldown-blocked">
        <div class="drilldown-blocked-heading">Blocked Items</div>
        ${blockedRows
          .map(
            (row) =>
              `<div class="drilldown-blocked-item">
            <a href="${escapeHtml(buildHash('employee', row['Responsible']))}" class="drilldown-person-link">${escapeHtml(row['Responsible'])}</a>
            <span class="drilldown-blocked-topic">${escapeHtml(row['Topic'])}</span>
          </div>`
          )
          .join('')}
      </div>`
    : '';

  const drilldownPeriod = filters.period || '1w';
  const goalHistoryForDelta = getHistoryForEntity('goal', goalName);
  const goalDelta = computeDelta(goalHistoryForDelta, drilldownPeriod);
  const deltaBadgeHtml = appState.history.status === 'loaded' ? renderDeltaBadge(goalDelta) : '';

  elements.drilldownHero.innerHTML = `
    <div class="drilldown-hero-card">
      <div class="drilldown-progress-section">
        <div class="drilldown-progress-pct">${allSummary.pct}<span class="drilldown-progress-symbol">%</span>${deltaBadgeHtml}</div>
        <div class="drilldown-progress-bar">
          <div class="drilldown-progress-fill" style="width:${allSummary.pct}%"></div>
        </div>
      </div>
      ${renderDrilldownSummaryStats(allSummary)}
      <div class="drilldown-section" data-hook="drilldown-departments">
        <div class="drilldown-section-label">Contributing Departments</div>
        <div class="drilldown-chips">${deptChips}</div>
      </div>
      ${blockedCallout}
    </div>
  `;

  renderDrilldownTrendPanel('goal', goalName, filters);

  // Filters
  const uniqueDepts = [...new Set(allGoalRows.map((r) => r['Department']).filter(Boolean))].sort();
  const uniquePersons = [
    ...new Set(allGoalRows.map((r) => r['Responsible']).filter(Boolean)),
  ].sort();

  renderDrilldownFilters([
    { key: 'status', label: 'Status', options: ['done', 'doing', 'blocked'] },
    { key: 'dept', label: 'Department', options: uniqueDepts },
    { key: 'person', label: 'Person', options: uniquePersons },
    { key: 'search' },
  ]);

  // Table
  renderDrilldownTable(filteredRows);
}

function renderTrendsDrilldown(filters) {
  const period = filters.period || '1w';
  const periodDays = PERIOD_DAYS[period];

  renderBreadcrumb([{ label: 'Overview', hash: '#/' }, { label: 'Trends' }]);

  if (elements.drilldownTrendPanel) {
    elements.drilldownTrendPanel.style.display = 'none';
  }

  elements.drilldownTitle.textContent = 'Performance Trends';
  const uniqueTimestamps = new Set(appState.history.raw.map((r) => r.timestamp.getTime())).size;
  elements.drilldownSubtitle.textContent =
    appState.history.status === 'loaded'
      ? `${uniqueTimestamps} snapshot${uniqueTimestamps !== 1 ? 's' : ''} collected`
      : appState.history.status === 'error'
        ? 'History data unavailable'
        : 'Loading history data…';

  if (appState.history.status !== 'loaded' || uniqueTimestamps < 2) {
    const msg =
      appState.history.status === 'error'
        ? '<p>Could not load history data. The dashboard is still fully functional without trends.</p>'
        : '<p>Not enough history data yet. Snapshots are collected automatically as the sheet is edited.</p><p>Check back after a few days of activity.</p>';
    elements.drilldownHero.innerHTML = `<div class="trends-empty-state">${msg}</div>`;
    elements.drilldownFilters.innerHTML = '';
    elements.drilldownTableWrap.style.display = 'none';
    elements.drilldownResultCount.textContent = '';
    return;
  }

  const periodContainer = document.createElement('div');
  periodContainer.className = 'trends-period-toggle';
  renderPeriodToggle(periodContainer, period, (newPeriod) => {
    const newFilters = { ...filters, period: newPeriod };
    if (newPeriod === '1w') delete newFilters.period;
    navigateTo('trends', '', newFilters);
  });

  const cutoff = Date.now() - periodDays * 24 * 60 * 60 * 1000;
  const overallHistory = getHistoryForEntity('overall').filter(
    (r) => r.timestamp.getTime() >= cutoff
  );

  elements.drilldownHero.innerHTML = `
    <div class="trends-hero">
      <div class="trends-period-row" id="trends-period-row"></div>
      <div class="trends-hero-charts">
        <div class="trends-chart-card">
          <h3 class="trends-chart-title">Overall Completion</h3>
          <div id="trends-chart-overall" class="trends-chart" aria-label="Overall completion trend chart"></div>
        </div>
        <div class="trends-chart-card">
          <h3 class="trends-chart-title">Blocked Items</h3>
          <div id="trends-chart-blocked" class="trends-chart" aria-label="Blocked items trend chart"></div>
        </div>
      </div>
      <div class="trends-small-multiples">
        <h3 class="trends-section-title">Goals</h3>
        <div class="trends-grid" id="trends-goals-grid"></div>
      </div>
      <div class="trends-small-multiples">
        <h3 class="trends-section-title">Departments</h3>
        <div class="trends-grid" id="trends-depts-grid"></div>
      </div>
    </div>
  `;

  document.getElementById('trends-period-row').appendChild(periodContainer);

  if (overallHistory.length >= 2) {
    renderFrappeLineChart('trends-chart-overall', overallHistory, 'pct', '% Complete');
    renderFrappeLineChart('trends-chart-blocked', overallHistory, 'blocked', 'Blocked');
  }

  const goalsGrid = document.getElementById('trends-goals-grid');
  const liveGoals = new Set(appState.rows.map((r) => r['Goal'] || 'No Goal'));
  const goalEntities = Object.keys(appState.history.byLevel.goal || {})
    .filter((name) => liveGoals.has(name))
    .sort();
  goalEntities.forEach((goalName) => {
    const chartId = slugify('trends-goal-' + goalName);
    const goalHistory = getHistoryForEntity('goal', goalName).filter(
      (r) => r.timestamp.getTime() >= cutoff
    );
    const card = document.createElement('div');
    card.className = 'trends-small-card';
    card.style.cursor = 'pointer';
    card.innerHTML = `<div class="trends-small-title">${escapeHtml(goalName)}</div><div class="trends-small-chart" id="${chartId}"></div>`;
    card.addEventListener('click', () => navigateTo('goal', goalName));
    goalsGrid.appendChild(card);
    if (goalHistory.length >= 2) {
      renderFrappeLineChart(chartId, goalHistory, 'pct', '%');
    }
  });

  const deptsGrid = document.getElementById('trends-depts-grid');
  const liveDepts = new Set(appState.rows.map((r) => r['Department']).filter(Boolean));
  const deptEntities = Object.keys(appState.history.byLevel.department || {})
    .filter((name) => liveDepts.has(name))
    .sort();
  deptEntities.forEach((deptName) => {
    const chartId = slugify('trends-dept-' + deptName);
    const deptHistory = getHistoryForEntity('department', deptName).filter(
      (r) => r.timestamp.getTime() >= cutoff
    );
    const card = document.createElement('div');
    card.className = 'trends-small-card';
    card.style.cursor = 'pointer';
    card.innerHTML = `<div class="trends-small-title">${escapeHtml(deptName)}</div><div class="trends-small-chart" id="${chartId}"></div>`;
    card.addEventListener('click', () => navigateTo('department', deptName));
    deptsGrid.appendChild(card);
    if (deptHistory.length >= 2) {
      renderFrappeLineChart(chartId, deptHistory, 'pct', '%');
    }
  });

  elements.drilldownFilters.innerHTML = '';
  elements.drilldownTableWrap.style.display = 'none';
  elements.drilldownResultCount.textContent = '';
}

function renderDrilldownView() {
  const { view, param, filters } = appState.route;
  if (view === 'goal') return renderGoalDrilldown(param, filters);
  if (view === 'department') return renderDepartmentDrilldown(param, filters);
  if (view === 'employee') return renderEmployeeDrilldown(param, filters);
  if (view === 'trends') return renderTrendsDrilldown(filters);
  navigateTo('overview');
}

function renderDepartmentDrilldown(deptName, filters) {
  const allDeptRows = appState.rows.filter((row) => (row['Department'] || 'Other') === deptName);

  if (!allDeptRows.length) {
    navigateTo('overview');
    return;
  }

  const filteredRows = applyDrilldownFilters(allDeptRows, filters);
  const summary = deriveSummary(allDeptRows);

  // Breadcrumb
  renderBreadcrumb([{ label: 'Overview', hash: '#/' }, { label: deptName }]);

  // Header
  const teams = [...new Set(allDeptRows.map((r) => r['Team']).filter(Boolean))];
  const people = [...new Set(allDeptRows.map((r) => r['Responsible']).filter(Boolean))];
  elements.drilldownTitle.textContent = deptName;
  elements.drilldownSubtitle.textContent = `${teams.length} team${teams.length !== 1 ? 's' : ''} · ${people.length} people · ${allDeptRows.length} updates`;

  // Hero — per-team breakdown
  const teamStats = {};
  allDeptRows.forEach((row) => {
    const team = row['Team'] || 'Unassigned';
    if (!teamStats[team]) teamStats[team] = { total: 0, done: 0, blocked: 0 };
    teamStats[team].total++;
    if (row._status === 'done') teamStats[team].done++;
    if (row._status === 'blocked') teamStats[team].blocked++;
  });

  const teamGrid =
    teams.length > 1
      ? `<div class="drilldown-section">
        <div class="drilldown-section-label">Teams</div>
        <div class="drilldown-team-grid" data-hook="drilldown-teams">
          ${Object.entries(teamStats)
            .sort(([a], [b]) => a.localeCompare(b))
            .map(([team, stats]) => {
              const pct = stats.total ? Math.round((stats.done / stats.total) * 100) : 0;
              const blockedBadge =
                stats.blocked > 0
                  ? `<span class="drilldown-team-blocked">${stats.blocked} blocked</span>`
                  : '';
              return `<div class="drilldown-team-card">
              <div class="drilldown-team-name">${escapeHtml(team)}</div>
              <div class="drilldown-team-meta">${stats.total} items · ${pct}% done ${blockedBadge}</div>
            </div>`;
            })
            .join('')}
        </div>
      </div>`
      : '';

  // Per-person list
  const personStats = {};
  allDeptRows.forEach((row) => {
    const person = row['Responsible'] || 'Unknown';
    if (!personStats[person]) personStats[person] = { total: 0, done: 0, doing: 0, blocked: 0 };
    personStats[person].total++;
    if (row._status === 'done') personStats[person].done++;
    if (row._status === 'doing') personStats[person].doing++;
    if (row._status === 'blocked') personStats[person].blocked++;
  });

  const personList = `<div class="drilldown-section" data-hook="drilldown-people">
    <div class="drilldown-section-label">People</div>
    <div class="drilldown-person-list">
      ${Object.entries(personStats)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([person, stats]) => {
          const pct = stats.total ? Math.round((stats.done / stats.total) * 100) : 0;
          return `<div class="drilldown-person-row">
          <a href="${escapeHtml(buildHash('employee', person))}" class="drilldown-person-link">${escapeHtml(person)}</a>
          <span class="drilldown-person-meta">${stats.total} items · ${pct}% done${stats.blocked ? ` · ${stats.blocked} blocked` : ''}</span>
        </div>`;
        })
        .join('')}
    </div>
  </div>`;

  const drilldownPeriod = filters.period || '1w';
  const deptHistoryForDelta = getHistoryForEntity('department', deptName);
  const deptDelta = computeDelta(deptHistoryForDelta, drilldownPeriod);
  const deltaBadgeHtml = appState.history.status === 'loaded' ? renderDeltaBadge(deptDelta) : '';

  elements.drilldownHero.innerHTML = `
    <div class="drilldown-hero-card">
      ${deltaBadgeHtml ? `<div class="drilldown-delta">${deltaBadgeHtml}</div>` : ''}
      ${renderDrilldownSummaryStats(summary)}
      ${teamGrid}
      ${personList}
    </div>
  `;

  renderDrilldownTrendPanel('department', deptName, filters);

  // Filters
  const uniqueTeams = [...new Set(allDeptRows.map((r) => r['Team']).filter(Boolean))].sort();
  const uniquePersons = [
    ...new Set(allDeptRows.map((r) => r['Responsible']).filter(Boolean)),
  ].sort();

  renderDrilldownFilters([
    { key: 'status', label: 'Status', options: ['done', 'doing', 'blocked'] },
    { key: 'team', label: 'Team', options: uniqueTeams },
    { key: 'person', label: 'Person', options: uniquePersons },
    { key: 'search' },
  ]);

  // Table
  renderDrilldownTable(filteredRows);
}

function renderEmployeeDrilldown(personName, filters) {
  const allPersonRows = appState.rows.filter((row) => row['Responsible'] === personName);

  if (!allPersonRows.length) {
    navigateTo('overview');
    return;
  }

  const filteredRows = applyDrilldownFilters(allPersonRows, filters);
  const summary = deriveSummary(allPersonRows);

  // Derive department (most common)
  const deptCounts = {};
  allPersonRows.forEach((row) => {
    const dept = row['Department'] || 'Other';
    deptCounts[dept] = (deptCounts[dept] || 0) + 1;
  });
  const primaryDept = Object.entries(deptCounts).sort((a, b) => b[1] - a[1])[0][0];
  const team = allPersonRows[0]['Team'] || '';

  // Breadcrumb: Overview > Department > Person
  renderBreadcrumb([
    { label: 'Overview', hash: '#/' },
    { label: primaryDept, hash: buildHash('department', primaryDept) },
    { label: personName },
  ]);

  // Header
  elements.drilldownTitle.textContent = personName;
  elements.drilldownSubtitle.textContent = `${primaryDept}${team ? ' · ' + team : ''}`;

  // Goal distribution
  const goalCounts = {};
  allPersonRows.forEach((row) => {
    const goal = row['Goal'] || 'No Goal';
    goalCounts[goal] = (goalCounts[goal] || 0) + 1;
  });

  const goalChips = Object.entries(goalCounts)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(
      ([goal, count]) =>
        `<a href="${escapeHtml(buildHash('goal', goal))}" class="drilldown-chip">${escapeHtml(goal)} <span class="drilldown-chip-count">${count}</span></a>`
    )
    .join('');

  // Staleness
  const dates = allPersonRows.map((r) => r._date).filter(Boolean);
  const mostRecent = dates.length ? new Date(Math.max(...dates.map((d) => d.getTime()))) : null;
  const daysAgo = daysSince(mostRecent);
  const stalenessText = Number.isFinite(daysAgo)
    ? `Last updated ${daysAgo} day${daysAgo !== 1 ? 's' : ''} ago`
    : 'Update date unavailable';

  const drilldownPeriod = filters.period || '1w';
  const empHistoryForDelta = getHistoryForEntity('employee', personName);
  const empDelta = computeDelta(empHistoryForDelta, drilldownPeriod);
  const deltaBadgeHtml = appState.history.status === 'loaded' ? renderDeltaBadge(empDelta) : '';

  elements.drilldownHero.innerHTML = `
    <div class="drilldown-hero-card">
      ${deltaBadgeHtml ? `<div class="drilldown-delta">${deltaBadgeHtml}</div>` : ''}
      ${renderDrilldownSummaryStats(summary)}
      <div class="drilldown-section" data-hook="drilldown-goals">
        <div class="drilldown-section-label">Goals</div>
        <div class="drilldown-chips">${goalChips}</div>
      </div>
      <div class="drilldown-staleness" data-hook="drilldown-staleness">${stalenessText}</div>
    </div>
  `;

  renderDrilldownTrendPanel('employee', personName, filters);

  // Filters (minimal for employee)
  renderDrilldownFilters([
    { key: 'status', label: 'Status', options: ['done', 'doing', 'blocked'] },
    { key: 'search' },
  ]);

  // Table — replace Responsible column with Department column
  elements.drilldownTableBody.innerHTML = '';

  if (!filteredRows.length) {
    elements.drilldownTableBody.innerHTML =
      '<tr><td colspan="5" class="empty">No updates match the current filters.</td></tr>';
    elements.drilldownResultCount.textContent = 'No matching updates';
    return;
  }

  elements.drilldownResultCount.textContent = `Showing ${filteredRows.length} update${filteredRows.length !== 1 ? 's' : ''}`;

  filteredRows.forEach((row, index) => {
    const rowKey = `emp-${index}`;
    const isExpanded = appState.view.expandedRowKey === rowKey;

    const summaryRow = document.createElement('tr');
    summaryRow.tabIndex = 0;
    summaryRow.setAttribute('role', 'button');
    summaryRow.setAttribute('aria-expanded', String(isExpanded));
    summaryRow.setAttribute('data-hook', 'drilldown-row');
    summaryRow.setAttribute('data-row-key', rowKey);
    summaryRow.innerHTML = `
      <td class="td-person"><span class="expand-icon" aria-hidden="true">›</span>${escapeHtml(row['Department'] || '')}</td>
      <td class="td-topic">${escapeHtml(row['Topic'])}</td>
      <td>${badge(row.Status, row._status)}</td>
      <td class="td-goal">${escapeHtml(row['Goal'])}</td>
      <td class="td-date">${escapeHtml(row['Added/updated'])}</td>
    `;

    const detailRow = document.createElement('tr');
    detailRow.className = `expand-row${isExpanded ? ' expand-row-open' : ''}`;
    detailRow.id = `details-${rowKey}`;
    detailRow.innerHTML = `
      <td colspan="5">
        <div class="expand-wrapper">
          <div class="expand-inner">
            <div class="expand-content">
              <div class="expand-grid">
                ${row['Team'] ? `<div class="expand-item"><span class="expand-label">Team</span><div class="expand-field">${escapeHtml(row['Team'])}</div></div>` : ''}
                ${row['Details'] ? `<div class="expand-item"><span class="expand-label">Details</span><div class="expand-field">${escapeHtml(row['Details'])}</div></div>` : ''}
              </div>
            </div>
          </div>
        </div>
      </td>
    `;

    const onToggle = () => {
      const isCurrentlyExpanded = appState.view.expandedRowKey === rowKey;
      appState.view.expandedRowKey = isCurrentlyExpanded ? null : rowKey;
      detailRow.classList.toggle('expand-row-open', !isCurrentlyExpanded);
      summaryRow.setAttribute('aria-expanded', String(!isCurrentlyExpanded));
    };
    summaryRow.addEventListener('click', onToggle);
    summaryRow.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        onToggle();
      }
    });

    elements.drilldownTableBody.appendChild(summaryRow);
    elements.drilldownTableBody.appendChild(detailRow);
  });
}

function renderApp() {
  const isLoaded = appState.lifecycle.phase === 'loaded';
  syncVisibility(isLoaded);
  if (!isLoaded) return;

  if (appState.route.view !== 'overview') {
    renderDrilldownView();
    return;
  }

  const viewRows = deriveViewRows();
  renderSummary(viewRows);
  renderGoals(viewRows);
  renderBlocked(viewRows);
  renderRecentActivity(viewRows);
  renderScopedSummary(viewRows);

  if (appState._tableRenderedOnce) {
    renderTableWithCrossfade(viewRows);
  } else {
    renderTable(viewRows);
    appState._tableRenderedOnce = true;
  }

  updateFilterBadge();
  updateSortIndicators();

  appState.lifecycle.refreshedLabel = deriveRecencyLabel(
    viewRows,
    appState.lifecycle.sourceLabel || 'Live'
  );
  elements.csvDateLabel.textContent = appState.lifecycle.refreshedLabel;
}

const REVEAL_TARGETS = [
  { key: 'summary', delay: 0 },
  { key: 'goalsSection', delay: 200 },
  { key: 'blockedSection', delay: 350 },
  { key: 'recentActivity', delay: 450 },
  { key: 'controls', delay: 550 },
  { key: 'tableWrap', delay: 550 },
  { key: 'resultCount', delay: 550 },
];

function prepareRevealChoreography() {
  if (appState._initialRevealDone) return;
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  REVEAL_TARGETS.forEach(({ key }) => {
    const el = elements[key];
    if (el) el.classList.add('anim-reveal');
  });
}

function runInitialRevealChoreography() {
  if (appState._initialRevealDone) return;
  appState._initialRevealDone = true;
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

  REVEAL_TARGETS.forEach(({ key, delay }) => {
    const el = elements[key];
    if (!el || el.style.display === 'none') return;
    setTimeout(() => el.classList.add('anim-revealed'), delay);
  });
}

function closeFilterPanel() {
  appState.view.filterPanelOpen = false;
  elements.filterPanel.classList.remove('filter-panel-open');
  elements.filterToggle.setAttribute('aria-expanded', 'false');
}

function collapseExpandedRow() {
  appState.view.expandedRowKey = null;
}

function cycleSort(column) {
  const { sort } = appState.view;
  if (sort.column === column) {
    if (sort.direction === 'asc') {
      sort.direction = 'desc';
    } else {
      sort.column = '';
      sort.direction = '';
    }
  } else {
    sort.column = column;
    sort.direction = 'asc';
  }
  collapseExpandedRow();
  renderApp();
}

function updateSortIndicators() {
  const headers = document.querySelectorAll('thead th[data-sort-key]');
  headers.forEach((th) => {
    const key = th.getAttribute('data-sort-key');
    if (key === appState.view.sort.column) {
      th.setAttribute(
        'aria-sort',
        appState.view.sort.direction === 'asc' ? 'ascending' : 'descending'
      );
    } else {
      th.setAttribute('aria-sort', 'none');
    }
  });
}

function resetFilters() {
  appState.view.filters = {
    dept: '',
    team: '',
    person: '',
    status: '',
    goal: '',
    search: '',
  };
  collapseExpandedRow();
  appState.view.sort = { column: '', direction: '' };

  elements.filterDept.value = '';
  elements.filterTeam.value = '';
  elements.filterPerson.value = '';
  elements.filterStatus.value = '';
  elements.filterGoal.value = '';
  elements.search.value = '';

  populateTeamOptions();
  renderApp();
}

function syncFilterStateFromControls() {
  appState.view.filters.dept = elements.filterDept.value;
  appState.view.filters.team = elements.filterTeam.value;
  appState.view.filters.person = elements.filterPerson.value;
  appState.view.filters.status = elements.filterStatus.value;
  appState.view.filters.goal = elements.filterGoal.value;
  appState.view.filters.search = elements.search.value;
}

function flushPendingSearchDebounce() {
  clearTimeout(searchDebounceTimer);
  syncFilterStateFromControls();
}

const MANUAL_QA_FIXTURE_PARAM = 'qaFixture';
const MANUAL_QA_FIXTURE_ALLOWLIST = new Set([
  'all-blocked',
  'canonical-blocked-mixed',
  'empty-goals',
  'escape-unwind-derived-ui',
  'mixed-recency',
  'stale-data',
]);
const MANUAL_QA_HISTORY_FIXTURE = 'history-mixed';
const QA_FIXTURE_DEBUG_MAX_EVENTS = 120;

const qaFixtureDebugState = {
  enabled: false,
  fixtureName: '',
  events: [],
  resourceErrorHookInstalled: false,
};

function pushQaFixtureDebugEvent(type, details = {}) {
  if (!qaFixtureDebugState.enabled) return;

  qaFixtureDebugState.events.push({
    type,
    details,
    timestamp: new Date().toISOString(),
  });

  if (qaFixtureDebugState.events.length > QA_FIXTURE_DEBUG_MAX_EVENTS) {
    qaFixtureDebugState.events.splice(
      0,
      qaFixtureDebugState.events.length - QA_FIXTURE_DEBUG_MAX_EVENTS
    );
  }

  console.info(`[qaFixture-debug] ${type}`, details);
}

function installQaFixtureResourceErrorHook() {
  if (qaFixtureDebugState.resourceErrorHookInstalled) return;

  window.addEventListener(
    'error',
    (event) => {
      if (!qaFixtureDebugState.enabled) return;
      if (!event.target || event.target === window) return;

      const target = event.target;
      const resourceUrl = target.currentSrc || target.src || target.href || '';
      pushQaFixtureDebugEvent('resource-load-error', {
        tagName: target.tagName || 'UNKNOWN',
        resourceUrl,
      });
    },
    true
  );

  qaFixtureDebugState.resourceErrorHookInstalled = true;
}

function configureQaFixtureDebug(fixtureName) {
  const enabled = Boolean(fixtureName);
  qaFixtureDebugState.enabled = enabled;
  qaFixtureDebugState.fixtureName = fixtureName || '';
  qaFixtureDebugState.events = [];

  if (enabled) {
    installQaFixtureResourceErrorHook();
  }

  window.__qaFixtureDebug = {
    enabled,
    fixtureName: qaFixtureDebugState.fixtureName,
    events: qaFixtureDebugState.events,
  };

  if (enabled) {
    pushQaFixtureDebugEvent('fixture-debug-enabled', {
      fixtureName: qaFixtureDebugState.fixtureName,
      location: window.location.href,
    });
  }
}

function isLocalHostForManualFixture(hostname) {
  return hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '[::1]';
}

function buildFixtureCsvUrl(fixtureName) {
  return `tests/fixtures/${encodeURIComponent(fixtureName)}.csv`;
}

function reportLifecycleToQaFixtureDebug(phase, extra = {}) {
  pushQaFixtureDebugEvent(`lifecycle-${phase}`, extra);
}

function reportNetworkProbeToQaFixtureDebug() {
  if (!qaFixtureDebugState.enabled) return;

  const resourceEntries =
    typeof performance.getEntriesByType === 'function'
      ? performance
          .getEntriesByType('resource')
          .filter(
            (entry) =>
              entry &&
              typeof entry.name === 'string' &&
              (entry.name.includes('/tests/fixtures/') ||
                entry.name.includes('docs.google.com/spreadsheets') ||
                entry.name.includes(window.location.origin))
          )
          .map((entry) => ({
            name: entry.name,
            initiatorType: entry.initiatorType || '',
            transferSize: entry.transferSize ?? null,
          }))
      : [];

  pushQaFixtureDebugEvent('network-probe', {
    capturedResourceCount: resourceEntries.length,
    resources: resourceEntries,
  });
}

function readManualQaFixtureSelection() {
  const currentHost = window.location.hostname;
  if (!isLocalHostForManualFixture(currentHost)) return '';

  const params = new URLSearchParams(window.location.search);
  const fixture = params.get(MANUAL_QA_FIXTURE_PARAM);
  if (!fixture || !MANUAL_QA_FIXTURE_ALLOWLIST.has(fixture)) return '';
  return fixture;
}

function fixtureSourceLabel(fixtureName) {
  return `Fixture:${fixtureName}`;
}

async function fetchFixtureCsv(fixtureName) {
  const fixtureUrl = buildFixtureCsvUrl(fixtureName);
  pushQaFixtureDebugEvent('fixture-fetch-start', {
    fixtureName,
    fixtureUrl,
  });

  const response = await fetch(fixtureUrl, {
    cache: 'no-store',
  });

  pushQaFixtureDebugEvent('fixture-fetch-response', {
    fixtureName,
    fixtureUrl,
    status: response.status,
    ok: response.ok,
  });

  if (!response.ok) throw new Error(`Fixture HTTP ${response.status}`);

  const text = await response.text();
  pushQaFixtureDebugEvent('fixture-fetch-success', {
    fixtureName,
    fixtureUrl,
    byteLength: text.length,
  });
  reportNetworkProbeToQaFixtureDebug();
  return text;
}

async function fetchHistoryData() {
  appState.history.status = 'loading';
  appState.history.raw = [];
  appState.history.byLevel = {};
  try {
    const fixtureName = readManualQaFixtureSelection();
    const url = fixtureName ? buildFixtureCsvUrl(MANUAL_QA_HISTORY_FIXTURE) : HISTORY_URL;
    const response = await fetch(url);
    if (!response.ok) {
      appState.history.raw = [];
      appState.history.byLevel = {};
      appState.history.status = 'error';
      if (appState.lifecycle.phase === 'loaded') renderApp();
      return;
    }
    const text = await response.text();
    const rows = parseHistoryCSV(text);
    appState.history.raw = rows;
    appState.history.byLevel = indexHistoryData(rows);
    appState.history.status = 'loaded';
    if (appState.lifecycle.phase === 'loaded') renderApp();
  } catch {
    appState.history.raw = [];
    appState.history.byLevel = {};
    appState.history.status = 'error';
    if (appState.lifecycle.phase === 'loaded') renderApp();
  }
}

async function fetchSheetData() {
  flushPendingSearchDebounce();

  const fixtureName = readManualQaFixtureSelection();
  configureQaFixtureDebug(fixtureName);

  appState.lifecycle.sourceLabel = fixtureName ? fixtureSourceLabel(fixtureName) : 'Live';
  if (fixtureName) {
    pushQaFixtureDebugEvent('fixture-selection', {
      fixtureName,
      sourceLabel: appState.lifecycle.sourceLabel,
      fixtureUrl: buildFixtureCsvUrl(fixtureName),
    });
  }

  setLifecyclePhase('loading');
  fetchHistoryData();

  try {
    const csv = fixtureName
      ? await fetchFixtureCsv(fixtureName)
      : await (async () => {
          const response = await fetch(SHEET_URL);
          if (!response.ok) throw new Error(`HTTP ${response.status}`);
          return response.text();
        })();

    const rows = parseCSV(csv).map((row, index) => ({
      ...row,
      __rowId: index,
    }));
    if (!rows.length) {
      appState.rows = [];
      setLifecyclePhase('no-data', 'No data found in sheet');
      return;
    }

    appState.rows = rows;
    populateFilterOptions();

    prepareRevealChoreography();
    setLifecyclePhase('loaded');
    renderApp();
    runInitialRevealChoreography();

    elements.csvBadge.classList.add('flash-success');
    setTimeout(() => elements.csvBadge.classList.remove('flash-success'), 600);
  } catch (error) {
    setLifecyclePhase('error', error instanceof Error ? error.message : 'Unknown error');
  }
}

let searchDebounceTimer;

function bindEvents() {
  document.querySelectorAll('thead th[data-sort-key]').forEach((th) => {
    const key = th.getAttribute('data-sort-key');
    th.addEventListener('click', () => cycleSort(key));
    th.addEventListener('keydown', (event) => {
      if (event.key !== 'Enter' && event.key !== ' ') return;
      event.preventDefault();
      cycleSort(key);
    });
  });

  elements.filterDept.addEventListener('change', () => {
    syncFilterStateFromControls();
    populateTeamOptions();
    collapseExpandedRow();
    renderApp();
  });

  [elements.filterTeam, elements.filterPerson, elements.filterStatus, elements.filterGoal].forEach(
    (el) => {
      el.addEventListener('input', () => {
        syncFilterStateFromControls();
        collapseExpandedRow();
        renderApp();
      });
    }
  );

  elements.search.addEventListener('input', () => {
    clearTimeout(searchDebounceTimer);
    searchDebounceTimer = setTimeout(() => {
      syncFilterStateFromControls();
      collapseExpandedRow();
      renderApp();
    }, 200);
  });

  elements.filterToggle.addEventListener('click', () => {
    if (appState.view.filterPanelOpen) {
      closeFilterPanel();
      return;
    }

    appState.view.filterPanelOpen = true;
    elements.filterPanel.classList.add('filter-panel-open');
    elements.filterToggle.setAttribute('aria-expanded', 'true');
  });

  elements.resetBtn.addEventListener('click', resetFilters);
  elements.refreshBtn.addEventListener('click', fetchSheetData);

  window.addEventListener('keydown', (event) => {
    if (event.key === '/') {
      if (!isTextEntryContext(document.activeElement)) {
        event.preventDefault();
        elements.search.focus();
      }
      return;
    }

    if (event.key === 'Escape') {
      if (!shouldHandleEscapeForDashboardUnwind(document.activeElement)) {
        return;
      }

      if (unwindEscapeState()) {
        event.preventDefault();
      }
      return;
    }

    resetEscapeBypassSelect();
  });

  [
    elements.filterDept,
    elements.filterTeam,
    elements.filterPerson,
    elements.filterStatus,
    elements.filterGoal,
  ].forEach((el) => {
    el.addEventListener('pointerdown', () => {
      resetEscapeBypassSelect();
    });
  });

  window.addEventListener('hashchange', onRouteChange);
}

function isTextEntryContext(element) {
  if (!element) return false;
  const tag = element.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || element.isContentEditable;
}

let escapeBypassSelect = null;

function resetEscapeBypassSelect() {
  escapeBypassSelect = null;
}

function shouldHandleEscapeForDashboardUnwind(element) {
  if (!element) {
    resetEscapeBypassSelect();
    return true;
  }

  const tag = element.tagName;
  if (tag === 'SELECT') {
    if (escapeBypassSelect !== element) {
      escapeBypassSelect = element;
      return false;
    }
    return true;
  }

  resetEscapeBypassSelect();
  return tag !== 'TEXTAREA' && !element.isContentEditable;
}

function focusAdjacentSummaryRow(currentRow, direction) {
  if (!currentRow) return;

  const summaryRows = [...document.querySelectorAll('[data-hook="table-row-summary"]')];
  const currentIndex = summaryRows.indexOf(currentRow);
  if (currentIndex < 0) return;

  const nextIndex = currentIndex + direction;
  if (nextIndex < 0 || nextIndex >= summaryRows.length) return;

  summaryRows[nextIndex].focus();
}

function unwindEscapeState() {
  if (appState.route.view !== 'overview') {
    navigateTo('overview');
    return true;
  }

  if (appState.view.expandedRowKey) {
    collapseExpandedRow();
    renderApp();
    return true;
  }

  if (appState.view.filterPanelOpen) {
    closeFilterPanel();
    return true;
  }

  return false;
}

initializeViewedDate();
bindEvents();
appState.route = parseRoute(window.location.hash);
fetchSheetData();
