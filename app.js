const SHEET_URL =
  'https://docs.google.com/spreadsheets/d/1bUY_Us-Vjq4JSYsnxrVXfAX6qRGjxZRgXR31me3Nc0U/gviz/tq?tqx=out:csv&gid=1636341361';

const DATE_STALE_THRESHOLD_DAYS = 7;

const appState = {
  rows: [],
  lifecycle: {
    phase: 'idle', // idle | loading | loaded | error | no-data
    errorMessage: '',
    refreshedLabel: 'Loading…',
    sourceLabel: 'Live',
  },
  view: {
    scope: {
      type: '', // '' | 'goal' | 'department'
      value: '',
    },
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
  },
};

const elements = {
  viewedDate: document.getElementById('viewed-date'),
  csvBadge: document.getElementById('csv-badge'),
  csvDateLabel: document.getElementById('csv-date-label'),
  refreshBtn: document.getElementById('refresh-btn'),
  stateBox: document.getElementById('state-box'),

  summary: document.getElementById('summary'),
  goalsSection: document.getElementById('goals-section'),
  goalsGrid: document.getElementById('goals-grid'),
  scopeIndicator: document.getElementById('scope-indicator'),
  scopeIndicatorText: document.getElementById('scope-indicator-text'),
  scopeClearBtn: document.getElementById('scope-clear-btn'),
  blockedSection: document.getElementById('blocked-section'),
  controls: document.getElementById('controls'),
  resultCount: document.getElementById('result-count'),
  tableWrap: document.getElementById('table-wrap'),
  tableBody: document.getElementById('table-body'),

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

function clearSelectOptions(selectEl) {
  while (selectEl.options.length > 1) selectEl.remove(1);
}

function deriveViewRows() {
  const { rows } = appState;
  const { scope, filters } = appState.view;

  return rows.filter((row) => {
    if (scope.type === 'goal' && (row['Goal'] || 'No Goal') !== scope.value) return false;
    if (scope.type === 'department' && (row['Department'] || 'Other') !== scope.value) return false;
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

function isNarrowedViewActive() {
  return Boolean(
    appState.view.scope.value ||
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
    elements.scopeIndicator.style.display = 'none';
    elements.blockedSection.style.display = 'none';
  }
}

function renderSummary(rows) {
  const summary = deriveSummary(rows);
  const doneClass = summary.done > 0 ? 'status-done' : '';
  const blockedClass = summary.blocked > 0 ? 'status-blocked' : '';

  elements.summary.innerHTML = `
    <div class="hero-zone" data-hook="hero-zone">
      <div class="hero-pct" data-hook="summary-percent">${summary.pct}<span class="hero-pct-symbol">%</span></div>
      <div class="hero-label">Complete</div>
      <div class="hero-stats">
        <div class="hero-stat" data-hook="summary-done">
          <span class="hero-stat-value ${doneClass}">${summary.done}</span>
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
          <span class="hero-stat-label">Blocked</span>
        </div>
        <div class="hero-stat-divider"></div>
        <div class="hero-stat" data-hook="summary-total">
          <span class="hero-stat-value">${summary.total}</span>
          <span class="hero-stat-label">Total Updates</span>
        </div>
      </div>
    </div>
  `;
}

function renderScopeIndicator() {
  const { scope } = appState.view;
  if (!scope.value) {
    elements.scopeIndicator.style.display = 'none';
    elements.scopeIndicator.setAttribute('aria-hidden', 'true');
    elements.scopeIndicatorText.textContent = '';
    return;
  }

  elements.scopeIndicator.style.display = '';
  elements.scopeIndicator.setAttribute('aria-hidden', 'false');
  elements.scopeIndicatorText.textContent =
    scope.type === 'department'
      ? `Scoped to department: ${scope.value}`
      : `Scoped to goal: ${scope.value}`;
}

function setScope(type, value) {
  const current = appState.view.scope;
  const nextValue = current.type === type && current.value === value ? '' : value;
  appState.view.scope = {
    type: nextValue ? type : '',
    value: nextValue,
  };
  collapseExpandedRow();
  renderApp();
}

function scopeToGoal(goal) {
  setScope('goal', goal);
}

function renderGoals(rows) {
  const frameGoals = deriveGoalBuckets(appState.rows);
  const activeGoalMap = new Map(
    deriveGoalBuckets(rows).map((goalData) => [goalData.goal, goalData])
  );
  const hasScope = Boolean(appState.view.scope.value);
  const goalScoped = appState.view.scope.type === 'goal';

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
    const isScoped = goalScoped && appState.view.scope.value === activeGoalData.goal;
    const isScopable = activeGoalData.total > 0;
    const isInteractive = isScopable;
    div.type = 'button';
    div.className = `goal-card ${isScopable && activeGoalData.pct < 25 ? 'status-low' : ''}${isScoped ? ' goal-card-active' : ''}${
      !isScopable ? ' goal-card-empty' : ''
    }${goalScoped && hasScope && !isScoped ? ' goal-card-dimmed' : ''}`;
    div.setAttribute('data-hook', 'goal-card');
    div.setAttribute('data-goal', activeGoalData.goal);
    div.setAttribute('aria-pressed', String(isScoped));
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
        <div class="goal-pct-large">${activeGoalData.pct}%</div>
        <div class="goal-count">${activeGoalData.done} / ${activeGoalData.total} <span style="font-size:0.7em">DONE</span></div>
      </div>
      ${emptyText}
      ${blockedOwnersText}
      ${staleText}
      <div class="progress-mini"><div class="progress-mini-fill" style="width:${activeGoalData.pct}%"></div></div>
    `;

    if (isInteractive) {
      div.addEventListener('click', () => scopeToGoal(activeGoalData.goal));
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
                <span class="blocked-item-person">${escapeHtml(row['Responsible'])}</span>
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

  appState.view.expandedRowKey = appState.view.expandedRowKey === rowKey ? null : rowKey;
  renderApp();

  if (shouldRestoreFocus) {
    const refreshedRow = document.querySelector(
      `[data-hook="table-row-summary"][data-row-key="${rowKey}"]`
    );
    if (refreshedRow) refreshedRow.focus();
  }
}

function renderTable(rows) {
  if (!rows.length) {
    const activeScopeLabel = appState.view.scope.value;
    const scopeMessage = activeScopeLabel
      ? `<div class="empty-scope-note" data-hook="no-results-scope-note">Active scope: ${escapeHtml(activeScopeLabel)}</div>`
      : '';
    const emptyMessage = isNarrowedViewActive()
      ? 'No updates match your current scope, search, or filters.'
      : 'No updates are currently available.';

    elements.tableBody.innerHTML = `
      <tr>
        <td colspan="5" class="empty" data-hook="no-results-state">
          <div>${emptyMessage}</div>
          ${scopeMessage}
          <button type="button" class="retry-btn" data-hook="empty-reset-btn">Reset narrowing</button>
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

  const grouped = rows.reduce((acc, row) => {
    const dept = row['Department'] || 'Other';
    if (!acc[dept]) acc[dept] = [];
    acc[dept].push(row);
    return acc;
  }, {});

  elements.tableBody.innerHTML = '';

  Object.entries(grouped)
    .sort(([a], [b]) => a.localeCompare(b))
    .forEach(([dept, deptRows]) => {
      const groupHeader = document.createElement('tr');
      const isDepartmentScoped =
        appState.view.scope.type === 'department' && appState.view.scope.value === dept;
      groupHeader.className = `group-header${isDepartmentScoped ? ' group-header-active' : ''}`;
      groupHeader.setAttribute('data-hook', 'table-group-header');
      groupHeader.setAttribute('data-department', dept);
      groupHeader.setAttribute('role', 'button');
      groupHeader.setAttribute('tabindex', '0');
      groupHeader.setAttribute('aria-pressed', String(isDepartmentScoped));
      groupHeader.innerHTML = `<td colspan="5">${escapeHtml(dept)} &mdash; ${deptRows.length} update${deptRows.length !== 1 ? 's' : ''}</td>`;

      const onScopeDepartment = () => setScope('department', dept);
      groupHeader.addEventListener('click', onScopeDepartment);
      groupHeader.addEventListener('keydown', (event) => {
        if (event.key !== 'Enter' && event.key !== ' ') return;
        event.preventDefault();
        onScopeDepartment();
      });

      elements.tableBody.appendChild(groupHeader);

      deptRows.forEach((row, index) => {
        const rowKey = buildRowKey(row, `${dept}-${index}`);
        const isExpanded = appState.view.expandedRowKey === rowKey;

        const summaryRow = document.createElement('tr');
        summaryRow.tabIndex = 0;
        summaryRow.setAttribute('role', 'button');
        summaryRow.setAttribute('aria-expanded', String(isExpanded));
        summaryRow.setAttribute('aria-controls', `details-${rowKey}`);
        summaryRow.setAttribute('data-hook', 'table-row-summary');
        summaryRow.setAttribute('data-row-key', rowKey);
        summaryRow.innerHTML = `
          <td class="td-person"><span class="expand-icon" aria-hidden="true" style="transform:${isExpanded ? 'rotate(90deg)' : 'none'}">›</span>${escapeHtml(row['Responsible'])}</td>
          <td class="td-topic">${escapeHtml(row['Topic'])}</td>
          <td>${badge(row.Status, row._status)}</td>
          <td class="td-goal">${escapeHtml(row['Goal'])}</td>
          <td class="td-date">${escapeHtml(row['Added/updated'])}</td>
        `;

        const detailRow = document.createElement('tr');
        detailRow.className = 'expand-row';
        detailRow.id = `details-${rowKey}`;
        detailRow.setAttribute('data-hook', 'table-row-detail');
        detailRow.setAttribute('data-row-key', rowKey);
        detailRow.style.display = isExpanded ? 'table-row' : 'none';
        detailRow.innerHTML = `
          <td colspan="5">
            <div class="expand-wrapper">
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
          </td>
        `;

        const onToggle = () => toggleExpandedRow(rowKey);
        summaryRow.addEventListener('click', onToggle);
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
      });
    });
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

function renderApp() {
  const isLoaded = appState.lifecycle.phase === 'loaded';
  syncVisibility(isLoaded);
  if (!isLoaded) return;

  renderScopeIndicator();

  const viewRows = deriveViewRows();
  renderSummary(viewRows);
  renderGoals(viewRows);
  renderBlocked(viewRows);
  renderTable(viewRows);
  updateFilterBadge();

  appState.lifecycle.refreshedLabel = deriveRecencyLabel(
    viewRows,
    appState.lifecycle.sourceLabel || 'Live'
  );
  elements.csvDateLabel.textContent = appState.lifecycle.refreshedLabel;
}

function clearScope() {
  appState.view.scope = {
    type: '',
    value: '',
  };
}

function closeFilterPanel() {
  appState.view.filterPanelOpen = false;
  elements.filterPanel.style.display = 'none';
  elements.filterToggle.setAttribute('aria-expanded', 'false');
}

function collapseExpandedRow() {
  appState.view.expandedRowKey = null;
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
  clearScope();
  collapseExpandedRow();

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

    setLifecyclePhase('loaded');
    renderApp();
  } catch (error) {
    setLifecyclePhase('error', error instanceof Error ? error.message : 'Unknown error');
  }
}

let searchDebounceTimer;

function bindEvents() {
  elements.filterDept.addEventListener('change', () => {
    syncFilterStateFromControls();
    if (appState.view.scope.type === 'department') {
      if (appState.view.scope.value !== appState.view.filters.dept) {
        clearScope();
      }
    }
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
    elements.filterPanel.style.display = '';
    elements.filterToggle.setAttribute('aria-expanded', 'true');
  });

  elements.resetBtn.addEventListener('click', resetFilters);
  elements.refreshBtn.addEventListener('click', fetchSheetData);
  elements.scopeClearBtn.addEventListener('click', () => {
    clearScope();
    collapseExpandedRow();
    renderApp();
  });

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
  if (appState.view.scope.value) {
    clearScope();
    renderApp();
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
fetchSheetData();
