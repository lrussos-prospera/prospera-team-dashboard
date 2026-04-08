const SHEET_URL =
  'https://docs.google.com/spreadsheets/d/1bUY_Us-Vjq4JSYsnxrVXfAX6qRGjxZRgXR31me3Nc0U/gviz/tq?tqx=out:csv&gid=1636341361';

const DATE_STALE_THRESHOLD_DAYS = 7;

const appState = {
  rows: [],
  lifecycle: {
    phase: 'idle', // idle | loading | loaded | error | no-data
    errorMessage: '',
    refreshedLabel: 'Loading…',
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

const els = {
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
  els.viewedDate.textContent = new Date().toLocaleDateString('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
}

function esc(str) {
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

function parseCSV(text) {
  const lines = text.trim().split(/\r?\n/);
  const headerFields = [];
  let hCurrent = '';
  let hInQuotes = false;

  for (let i = 0; i < lines[0].length; i++) {
    const ch = lines[0][i];
    if (ch === '"') {
      hInQuotes = !hInQuotes;
    } else if (ch === ',' && !hInQuotes) {
      headerFields.push(hCurrent.trim());
      hCurrent = '';
    } else {
      hCurrent += ch;
    }
  }
  headerFields.push(hCurrent.trim());

  const headers = headerFields.map((h) => h.replace(/^"|"$/g, ''));

  return lines
    .slice(1)
    .map((line) => {
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

      const row = {};
      headers.forEach((h, i) => {
        row[h] = (fields[i] || '').replace(/^"|"$/g, '');
      });
      row._status = normalizeStatus(row.Status);
      row._date = parseRowDate(row['Added/updated']);
      return row;
    })
    .filter((r) => headers.some((header) => Boolean(r[header])));
}

function deriveViewRows() {
  const { rows } = appState;
  const { scope, filters } = appState.view;

  return rows.filter((r) => {
    if (scope.type === 'goal' && (r['Goal'] || 'No Goal') !== scope.value) return false;
    if (scope.type === 'department' && (r['Department'] || 'Other') !== scope.value) return false;
    if (filters.dept && r['Department'] !== filters.dept) return false;
    if (filters.team && r['Team'] !== filters.team) return false;
    if (filters.person && r['Responsible'] !== filters.person) return false;
    if (filters.status && r._status !== filters.status) return false;
    if (filters.goal && (r['Goal'] || 'No Goal') !== filters.goal) return false;
    if (filters.search) {
      const blob = Object.values(r).join(' ').toLowerCase();
      if (!blob.includes(filters.search.toLowerCase())) return false;
    }
    return true;
  });
}

function deriveSummary(rows) {
  const counts = rows.reduce(
    (acc, r) => {
      if (r._status in acc) acc[r._status]++;
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
  rows.forEach((r) => {
    const goal = r['Goal'] || 'No Goal';
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
    if (r._status === 'done') bucket.done++;
    if (r._status === 'blocked' && r['Responsible']) bucket.blockedOwners.add(r['Responsible']);
    if (r._date && (!bucket.latestDate || r._date > bucket.latestDate)) bucket.latestDate = r._date;
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
      };
    });
}

function deriveBlockedRows(rows) {
  return rows.filter((r) => r._status === 'blocked');
}

function deriveRecencyLabel(rows) {
  const validDates = rows
    .map((r) => r._date)
    .filter(Boolean)
    .sort((a, b) => b - a);
  const latestDate = validDates[0] || null;
  const ageDays = daysSince(latestDate);

  if (!latestDate) {
    return 'Live · update date unavailable';
  }

  if (ageDays > DATE_STALE_THRESHOLD_DAYS) {
    return `Live · stale (${ageDays}d old)`;
  }

  return `Live · current (${ageDays}d old)`;
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
  els.stateBox.style.display = '';
  els.stateBox.setAttribute('data-hook', 'no-data-state');
  els.stateBox.innerHTML = `
    <div class="state-icon">📭</div>
    <p>${esc(message)}<br><small style="color:#64748b">No usable update rows were returned from the source.</small></p>
    <button class="retry-btn" data-hook="retry-btn">Try again</button>
  `;

  const retryBtn = els.stateBox.querySelector('[data-hook="retry-btn"]');
  if (retryBtn) retryBtn.addEventListener('click', fetchSheetData);
}

function setLifecyclePhase(phase, errorMessage = '') {
  appState.lifecycle.phase = phase;
  appState.lifecycle.errorMessage = errorMessage;

  const isLoading = phase === 'loading';
  const isError = phase === 'error';
  const isNoData = phase === 'no-data';

  els.csvBadge.className = `data-badge${isLoading ? ' loading' : ''}${isError || isNoData ? ' error' : ''}`;
  els.csvDateLabel.textContent =
    phase === 'loading'
      ? 'Loading…'
      : isError
        ? 'Could not load data'
        : isNoData
          ? 'No source data'
          : appState.lifecycle.refreshedLabel;

  if (isLoading) {
    els.refreshBtn.classList.add('spinning');
  } else {
    els.refreshBtn.classList.remove('spinning');
  }

  if (isLoading) {
    els.stateBox.style.display = '';
    els.stateBox.setAttribute('data-hook', 'loading-state');
    els.stateBox.innerHTML = `
      <div class="state-icon">⏳</div>
      <p id="state-msg">Fetching latest data from Google Sheets…</p>
    `;
  } else if (isError) {
    els.stateBox.style.display = '';
    els.stateBox.setAttribute('data-hook', 'error-state');
    els.stateBox.innerHTML = `
      <div class="state-icon">⚠️</div>
      <p>Could not load data from Google Sheets.<br><small style="color:#94a3b8">${esc(errorMessage)}</small></p>
      <button class="retry-btn" data-hook="retry-btn">Try again</button>
    `;
    const retryBtn = els.stateBox.querySelector('[data-hook="retry-btn"]');
    if (retryBtn) retryBtn.addEventListener('click', fetchSheetData);
  } else if (isNoData) {
    renderNoDataState(errorMessage || 'No data found in sheet');
  } else {
    els.stateBox.style.display = 'none';
    els.stateBox.removeAttribute('data-hook');
  }
}

function syncVisibility(isLoaded) {
  const display = isLoaded ? '' : 'none';
  els.summary.style.display = display;
  els.goalsSection.style.display = display;
  els.controls.style.display = display;
  els.resultCount.style.display = display;
  els.tableWrap.style.display = display;
  if (!isLoaded) {
    els.scopeIndicator.style.display = 'none';
    els.blockedSection.style.display = 'none';
  }
}

function renderSummary(rows) {
  const summary = deriveSummary(rows);
  const doneClass = summary.done > 0 ? 'status-done' : '';
  const blockedClass = summary.blocked > 0 ? 'status-blocked' : '';

  els.summary.innerHTML = `
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
    els.scopeIndicator.style.display = 'none';
    return;
  }

  els.scopeIndicator.style.display = '';
  els.scopeIndicatorText.textContent =
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
  appState.view.expandedRowKey = null;
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

  els.goalsGrid.innerHTML = '';

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
      ? `<div class="goal-signals" data-hook="goal-blocked-owners">Blocked: ${esc(activeGoalData.blockedOwners.join(', '))}</div>`
      : '';
    const staleText = activeGoalData.stale
      ? `<div class="goal-signals stale" data-hook="goal-stale">Stale (&gt; ${DATE_STALE_THRESHOLD_DAYS}d)</div>`
      : '';
    const emptyText = !isScopable
      ? '<div class="goal-signals goal-signals-empty" data-hook="goal-empty">No updates in current view</div>'
      : '';

    div.innerHTML = `
      <div class="goal-title">${esc(activeGoalData.goal)}</div>
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

    els.goalsGrid.appendChild(div);
  });
}

function renderBlocked(rows) {
  const blocked = deriveBlockedRows(rows);

  if (!blocked.length) {
    els.blockedSection.style.display = 'none';
    els.blockedSection.innerHTML = '';
    return;
  }

  els.blockedSection.style.display = '';
  els.blockedSection.innerHTML = `
    <h2 class="blocked-heading">Blocked Items</h2>
    <div class="blocked-list" data-hook="blocked-list">
      ${blocked
        .map(
          (r) => `
            <div class="blocked-item" data-hook="blocked-item" data-person="${esc(r['Responsible'] || '')}">
              <div class="blocked-item-header">
                <span class="blocked-item-person">${esc(r['Responsible'])}</span>
                <span class="blocked-item-topic">${esc(r['Topic'])}</span>
              </div>
              ${r['Details'] ? `<div class="blocked-item-details">${esc(r['Details'])}</div>` : ''}
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
  return `<span class="badge badge-other">${esc(raw)}</span>`;
}

function buildRowKey(row, index) {
  return `${(row['Department'] || 'other').toLowerCase()}-${(row['Responsible'] || 'unknown').toLowerCase()}-${index}`.replace(
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
      ? `<div class="empty-scope-note" data-hook="no-results-scope-note">Active scope: ${esc(activeScopeLabel)}</div>`
      : '';
    const emptyMessage = isNarrowedViewActive()
      ? 'No updates match your current scope, search, or filters.'
      : 'No updates are currently available.';

    els.tableBody.innerHTML = `
      <tr>
        <td colspan="5" class="empty" data-hook="no-results-state">
          <div>${emptyMessage}</div>
          ${scopeMessage}
          <button type="button" class="retry-btn" data-hook="empty-reset-btn">Reset narrowing</button>
        </td>
      </tr>
    `;
    els.resultCount.textContent = 'No matching updates';

    const resetFromEmpty = els.tableBody.querySelector('[data-hook="empty-reset-btn"]');
    if (resetFromEmpty) {
      resetFromEmpty.addEventListener('click', resetFilters);
    }
    return;
  }

  els.resultCount.textContent = `Showing ${rows.length} update${rows.length !== 1 ? 's' : ''}`;

  const grouped = rows.reduce((acc, row) => {
    const dept = row['Department'] || 'Other';
    if (!acc[dept]) acc[dept] = [];
    acc[dept].push(row);
    return acc;
  }, {});

  els.tableBody.innerHTML = '';

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
      groupHeader.innerHTML = `<td colspan="5">${esc(dept)} &mdash; ${deptRows.length} update${deptRows.length !== 1 ? 's' : ''}</td>`;

      const onScopeDepartment = () => setScope('department', dept);
      groupHeader.addEventListener('click', onScopeDepartment);
      groupHeader.addEventListener('keydown', (event) => {
        if (event.key !== 'Enter' && event.key !== ' ') return;
        event.preventDefault();
        onScopeDepartment();
      });

      els.tableBody.appendChild(groupHeader);

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
          <td class="td-person"><span class="expand-icon" aria-hidden="true" style="transform:${isExpanded ? 'rotate(90deg)' : 'none'}">›</span>${esc(row['Responsible'])}</td>
          <td class="td-topic">${esc(row['Topic'])}</td>
          <td>${badge(row.Status, row._status)}</td>
          <td class="td-goal">${esc(row['Goal'])}</td>
          <td class="td-date">${esc(row['Added/updated'])}</td>
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
                  ${row['Team'] ? `<div class="expand-item expand-team"><span class="expand-label">Team</span><div class="expand-field">${esc(row['Team'])}</div></div>` : ''}
                  ${row['Details'] ? `<div class="expand-item expand-details"><span class="expand-label">Details</span><div class="expand-field">${esc(row['Details'])}</div></div>` : ''}
                  ${row['Notes'] ? `<div class="expand-item expand-notes"><span class="expand-label">Notes</span><div class="expand-field">${esc(row['Notes'])}</div></div>` : ''}
                </div>
                <div class="expand-grid expand-mobile-only">
                  ${row['Goal'] ? `<div class="expand-item"><span class="expand-label">Goal</span><div class="expand-field">${esc(row['Goal'])}</div></div>` : ''}
                  ${row['Added/updated'] ? `<div class="expand-item"><span class="expand-label">Updated</span><div class="expand-field">${esc(row['Added/updated'])}</div></div>` : ''}
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

        els.tableBody.appendChild(summaryRow);
        els.tableBody.appendChild(detailRow);
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

  els.filterBadge.textContent = count > 0 ? String(count) : '';
  els.filterBadge.style.display = count > 0 ? '' : 'none';
}

function populateTeamOptions() {
  while (els.filterTeam.options.length > 1) els.filterTeam.remove(1);

  const teams = [
    ...new Set(
      appState.rows
        .filter(
          (r) => !appState.view.filters.dept || r['Department'] === appState.view.filters.dept
        )
        .map((r) => r['Team'])
        .filter(Boolean)
    ),
  ].sort();

  teams.forEach((team) => {
    const option = document.createElement('option');
    option.value = team;
    option.textContent = team;
    els.filterTeam.appendChild(option);
  });

  if (appState.view.filters.team && teams.includes(appState.view.filters.team)) {
    els.filterTeam.value = appState.view.filters.team;
  } else if (appState.view.filters.team && !teams.includes(appState.view.filters.team)) {
    appState.view.filters.team = '';
    els.filterTeam.value = '';
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
  const fill = (el, key) => {
    while (el.options.length > 1) el.remove(1);
    const values = [
      ...new Set(
        appState.rows.map((r) => r[key] || (key === 'Goal' ? 'No Goal' : '')).filter(Boolean)
      ),
    ].sort();
    values.forEach((value) => {
      const option = document.createElement('option');
      option.value = value;
      option.textContent = value;
      el.appendChild(option);
    });
  };

  fill(els.filterDept, 'Department');
  fill(els.filterPerson, 'Responsible');
  fill(els.filterGoal, 'Goal');

  while (els.filterStatus.options.length > 1) els.filterStatus.remove(1);
  [
    ['done', 'Done'],
    ['doing', 'In Progress'],
    ['blocked', 'Blocked'],
  ].forEach(([value, label]) => {
    const option = document.createElement('option');
    option.value = value;
    option.textContent = label;
    els.filterStatus.appendChild(option);
  });

  setSelectValueFromState(els.filterDept, appState.view.filters.dept, () => {
    appState.view.filters.dept = '';
    appState.view.filters.team = '';
  });
  populateTeamOptions();
  setSelectValueFromState(els.filterPerson, appState.view.filters.person, () => {
    appState.view.filters.person = '';
  });
  setSelectValueFromState(els.filterStatus, appState.view.filters.status, () => {
    appState.view.filters.status = '';
  });
  setSelectValueFromState(els.filterGoal, appState.view.filters.goal, () => {
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

  appState.lifecycle.refreshedLabel = deriveRecencyLabel(appState.rows);
  els.csvDateLabel.textContent = appState.lifecycle.refreshedLabel;
}

function clearScope() {
  appState.view.scope = {
    type: '',
    value: '',
  };
}

function closeFilterPanel() {
  appState.view.filterPanelOpen = false;
  els.filterPanel.style.display = 'none';
  els.filterToggle.setAttribute('aria-expanded', 'false');
}

function isTextEntryContext(element) {
  if (!element) return false;
  const tag = element.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || element.isContentEditable;
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
    appState.view.expandedRowKey = null;
    renderApp();
    return true;
  }

  if (appState.view.filterPanelOpen) {
    closeFilterPanel();
    return true;
  }

  return false;
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
  appState.view.expandedRowKey = null;

  els.filterDept.value = '';
  els.filterTeam.value = '';
  els.filterPerson.value = '';
  els.filterStatus.value = '';
  els.filterGoal.value = '';
  els.search.value = '';

  populateTeamOptions();
  renderApp();
}

function syncFilterStateFromControls() {
  appState.view.filters.dept = els.filterDept.value;
  appState.view.filters.team = els.filterTeam.value;
  appState.view.filters.person = els.filterPerson.value;
  appState.view.filters.status = els.filterStatus.value;
  appState.view.filters.goal = els.filterGoal.value;
  appState.view.filters.search = els.search.value;
}

async function fetchSheetData() {
  setLifecyclePhase('loading');

  try {
    const response = await fetch(SHEET_URL);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);

    const csv = await response.text();
    const rows = parseCSV(csv);
    if (!rows.length) {
      appState.rows = [];
      setLifecyclePhase('no-data', 'No data found in sheet');
      syncVisibility(false);
      return;
    }

    appState.rows = rows;
    populateFilterOptions();

    setLifecyclePhase('loaded');
    renderApp();
  } catch (error) {
    setLifecyclePhase('error', error instanceof Error ? error.message : 'Unknown error');
    syncVisibility(false);
  }
}

let searchDebounceTimer;

function bindEvents() {
  els.filterDept.addEventListener('change', () => {
    syncFilterStateFromControls();
    if (appState.view.scope.type === 'department') {
      if (appState.view.scope.value !== appState.view.filters.dept) {
        clearScope();
      }
    }
    populateTeamOptions();
    appState.view.expandedRowKey = null;
    renderApp();
  });

  [els.filterTeam, els.filterPerson, els.filterStatus, els.filterGoal].forEach((el) => {
    el.addEventListener('input', () => {
      syncFilterStateFromControls();
      appState.view.expandedRowKey = null;
      renderApp();
    });
  });

  els.search.addEventListener('input', () => {
    clearTimeout(searchDebounceTimer);
    searchDebounceTimer = setTimeout(() => {
      syncFilterStateFromControls();
      appState.view.expandedRowKey = null;
      renderApp();
    }, 200);
  });

  els.filterToggle.addEventListener('click', () => {
    if (appState.view.filterPanelOpen) {
      closeFilterPanel();
      return;
    }

    appState.view.filterPanelOpen = true;
    els.filterPanel.style.display = '';
    els.filterToggle.setAttribute('aria-expanded', 'true');
  });

  els.resetBtn.addEventListener('click', resetFilters);
  els.refreshBtn.addEventListener('click', fetchSheetData);
  els.scopeClearBtn.addEventListener('click', () => {
    clearScope();
    appState.view.expandedRowKey = null;
    renderApp();
  });

  window.addEventListener('keydown', (event) => {
    if (event.key === '/') {
      if (!isTextEntryContext(document.activeElement)) {
        event.preventDefault();
        els.search.focus();
      }
      return;
    }

    if (event.key !== 'Escape' || isTextEntryContext(document.activeElement)) return;

    if (unwindEscapeState()) {
      event.preventDefault();
    }
  });
}

initializeViewedDate();
bindEvents();
fetchSheetData();
