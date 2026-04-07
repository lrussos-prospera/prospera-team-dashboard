const SHEET_URL =
  'https://docs.google.com/spreadsheets/d/1bUY_Us-Vjq4JSYsnxrVXfAX6qRGjxZRgXR31me3Nc0U/gviz/tq?tqx=out:csv&gid=1636341361';

let allRows = [];

document.getElementById('viewed-date').textContent = new Date().toLocaleDateString('en-US', {
  weekday: 'long',
  year: 'numeric',
  month: 'long',
  day: 'numeric',
});

async function fetchSheetData() {
  const badge = document.getElementById('csv-badge');
  const label = document.getElementById('csv-date-label');
  const btn = document.getElementById('refresh-btn');
  const stateBox = document.getElementById('state-box');

  badge.className = 'data-badge loading';
  label.textContent = 'Loading…';
  btn.classList.add('spinning');

  try {
    const res = await fetch(SHEET_URL);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const text = await res.text();
    const rows = parseCSV(text);
    if (!rows.length) throw new Error('No data found in sheet');

    loadData(rows);

    badge.className = 'data-badge';
    label.textContent =
      'Live · refreshed ' +
      new Date().toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
  } catch (err) {
    badge.className = 'data-badge error';
    label.textContent = 'Could not load data';

    stateBox.style.display = '';
    stateBox.innerHTML = `
        <div class="state-icon">⚠️</div>
        <p>Could not load data from Google Sheets.<br><small style="color:#94a3b8">${esc(err.message)}</small></p>
        <button class="retry-btn" onclick="fetchSheetData()">Try again</button>
      `;
  } finally {
    btn.classList.remove('spinning');
  }
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
      return row;
    })
    .filter((r) => Object.values(r).some((v) => v));
}

function normalizeStatus(raw) {
  const s = String(raw).toLowerCase().trim();
  if (s.includes('done')) return 'done';
  if (s.includes('doing') || s.includes('in progress') || s.includes('progress')) return 'doing';
  if (s.includes('block')) return 'blocked';
  return 'other';
}

function loadData(rows) {
  allRows = rows;
  populateFilters(rows);
  renderTable(rows);

  document.getElementById('state-box').style.display = 'none';
  document.getElementById('summary').style.display = '';
  document.getElementById('goals-section').style.display = '';
  document.getElementById('controls').style.display = '';
  document.getElementById('result-count').style.display = '';
  document.getElementById('table-wrap').style.display = '';
}

function populateTeamOptions(department = '', selectedTeam = '') {
  const teamSel = document.getElementById('filter-team');
  while (teamSel.options.length > 1) teamSel.remove(1);

  const teams = [
    ...new Set(
      allRows
        .filter((r) => !department || r['Department'] === department)
        .map((r) => r['Team'])
        .filter(Boolean)
    ),
  ].sort();

  teams.forEach((team) => {
    const opt = document.createElement('option');
    opt.value = team;
    opt.textContent = team;
    teamSel.appendChild(opt);
  });

  if (selectedTeam && teams.includes(selectedTeam)) teamSel.value = selectedTeam;
}

function populateFilters(rows) {
  const fill = (id, key) => {
    const sel = document.getElementById(id);
    while (sel.options.length > 1) sel.remove(1);
    const values = [...new Set(rows.map((r) => r[key]).filter(Boolean))].sort();
    values.forEach((v) => {
      const opt = document.createElement('option');
      opt.value = v;
      opt.textContent = v;
      sel.appendChild(opt);
    });
  };
  fill('filter-dept', 'Department');
  fill('filter-person', 'Responsible');
  fill('filter-goal', 'Goal');
  populateTeamOptions();

  const statusSel = document.getElementById('filter-status');
  while (statusSel.options.length > 1) statusSel.remove(1);
  [
    ['done', 'Done'],
    ['doing', 'In Progress'],
    ['blocked', 'Blocked'],
  ].forEach(([val, label]) => {
    const opt = document.createElement('option');
    opt.value = val;
    opt.textContent = label;
    statusSel.appendChild(opt);
  });
}

function renderSummary(rows) {
  const counts = rows.reduce(
    (acc, r) => {
      const s = normalizeStatus(r.Status);
      if (s in acc) acc[s]++;
      return acc;
    },
    { done: 0, doing: 0, blocked: 0 }
  );
  const { done, doing, blocked } = counts;
  const total = rows.length;
  const pct = total ? Math.round((done / total) * 100) : 0;
  const blockedColor = blocked > 0 ? 'style="color:var(--brand-red)"' : '';

  document.getElementById('summary').innerHTML = `
    <div class="hero-zone">
      <div class="hero-pct">${pct}<span class="hero-pct-symbol">%</span></div>
      <div class="hero-label">Complete</div>
      <div class="hero-stats">
        <div class="hero-stat">
          <span class="hero-stat-value">${doing}</span>
          <span class="hero-stat-label">In Progress</span>
        </div>
        <div class="hero-stat-divider"></div>
        <div class="hero-stat">
          <span class="hero-stat-value" ${blockedColor}>${blocked}</span>
          <span class="hero-stat-label">Blocked</span>
        </div>
        <div class="hero-stat-divider"></div>
        <div class="hero-stat">
          <span class="hero-stat-value">${total}</span>
          <span class="hero-stat-label">Total Updates</span>
        </div>
      </div>
    </div>
  `;
}

function renderGoals(rows) {
  const goals = {};
  rows.forEach((r) => {
    const g = r['Goal'] || 'No Goal';
    if (!goals[g]) goals[g] = { total: 0, done: 0 };
    goals[g].total++;
    if (normalizeStatus(r.Status) === 'done') goals[g].done++;
  });

  const grid = document.getElementById('goals-grid');
  grid.innerHTML = '';
  Object.entries(goals)
    .sort()
    .forEach(([goal, data]) => {
      const pct = data.total ? Math.round((data.done / data.total) * 100) : 0;
      const div = document.createElement('div');
      div.className = 'goal-card';
      div.innerHTML = `
        <div class="goal-title">${esc(goal)}</div>
        <div class="goal-meta">
          <span>${data.done} of ${data.total} done</span>
          <span>${pct}%</span>
        </div>
        <div class="progress-bar-bg">
          <div class="progress-bar-fill" style="width:${pct}%"></div>
        </div>
      `;
      grid.appendChild(div);
    });
}

function renderBlocked(rows) {
  const section = document.getElementById('blocked-section');
  const blocked = rows.filter((r) => normalizeStatus(r.Status) === 'blocked');

  if (blocked.length === 0) {
    section.style.display = 'none';
    return;
  }

  section.style.display = '';
  section.innerHTML = `
    <h2 class="blocked-heading">Blocked Items</h2>
    <div class="blocked-list">
      ${blocked
        .map(
          (r) => `
        <div class="blocked-item">
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

function badge(raw) {
  const norm = normalizeStatus(raw);
  if (norm === 'done') return `<span class="badge badge-done">Done</span>`;
  if (norm === 'doing') return `<span class="badge badge-doing">In Progress</span>`;
  if (norm === 'blocked') return `<span class="badge badge-blocked">Blocked</span>`;
  return `<span class="badge badge-other">${esc(raw)}</span>`;
}

function esc(str) {
  return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function renderTable(rows) {
  const tbody = document.getElementById('table-body');
  const count = document.getElementById('result-count');

  if (!rows.length) {
    tbody.innerHTML = `<tr><td colspan="5" class="empty">No updates match your filters.</td></tr>`;
    count.textContent = 'No results';
    return;
  }

  count.textContent = `Showing ${rows.length} update${rows.length !== 1 ? 's' : ''}`;

  const grouped = {};
  rows.forEach((r) => {
    const dept = r['Department'] || 'Other';
    if (!grouped[dept]) grouped[dept] = [];
    grouped[dept].push(r);
  });

	  tbody.innerHTML = '';

  const toggleRowDetails = (summaryRow) => {
    const next = summaryRow.nextElementSibling;
    if (!next || !next.classList.contains('expand-row')) return;

    const isOpen = next.style.display !== 'none';
    next.style.display = isOpen ? 'none' : 'table-row';
    summaryRow.setAttribute('aria-expanded', String(!isOpen));
    summaryRow.querySelector('.expand-icon').textContent = isOpen ? '›' : '‹';
  };

  Object.entries(grouped)
    .sort()
    .forEach(([dept, deptRows]) => {
      const gh = document.createElement('tr');
      gh.className = 'group-header';
      gh.innerHTML = `<td colspan="5">${esc(dept)} &mdash; ${deptRows.length} update${deptRows.length !== 1 ? 's' : ''}</td>`;
      tbody.appendChild(gh);

	      deptRows.forEach((r) => {
	        const tr = document.createElement('tr');
	        const rowId = `details-${dept.replace(/[^a-z0-9]+/gi, '-').toLowerCase()}-${tbody.children.length}`;
	        tr.tabIndex = 0;
	        tr.setAttribute('role', 'button');
	        tr.setAttribute('aria-expanded', 'false');
	        tr.setAttribute('aria-controls', rowId);
	        tr.setAttribute(
	          'aria-label',
	          `Toggle details for ${r['Responsible'] || 'team member'}: ${r['Topic'] || 'update'}`
	        );
	        tr.innerHTML = `
	          <td class="td-person"><span class="expand-icon" aria-hidden="true">›</span>${esc(r['Responsible'])}</td>
	          <td class="td-topic">${esc(r['Topic'])}</td>
	          <td>${badge(r['Status'])}</td>
	          <td class="td-goal">${esc(r['Goal'])}</td>
	          <td class="td-date">${esc(r['Added/updated'])}</td>
	        `;
        tbody.appendChild(tr);

	        const expandTr = document.createElement('tr');
	        expandTr.className = 'expand-row';
	        expandTr.id = rowId;
	        expandTr.style.display = 'none';
	        expandTr.innerHTML = `
	          <td colspan="5" class="expand-content">
	            <div class="expand-grid">
	              ${r['Team'] ? `<div class="expand-field"><span class="expand-label">Team</span> ${esc(r['Team'])}</div>` : ''}
              ${r['Details'] ? `<div class="expand-field"><span class="expand-label">Details</span> ${esc(r['Details'])}</div>` : ''}
              ${r['Notes'] ? `<div class="expand-field"><span class="expand-label">Notes</span> ${esc(r['Notes'])}</div>` : ''}
            </div>
          </td>
	        `;
	        tbody.appendChild(expandTr);

	        tr.addEventListener('click', () => toggleRowDetails(tr));
	        tr.addEventListener('keydown', (event) => {
	          if (event.key !== 'Enter' && event.key !== ' ') return;
	          event.preventDefault();
	          toggleRowDetails(tr);
	        });
	      });
	    });

  renderSummary(rows);
  renderGoals(rows);
  renderBlocked(rows);
}

function applyFilters() {
  const dept = document.getElementById('filter-dept').value;
  const team = document.getElementById('filter-team').value;
  const person = document.getElementById('filter-person').value;
  const status = document.getElementById('filter-status').value;
  const goal = document.getElementById('filter-goal').value;
  const search = document.getElementById('search').value.toLowerCase();

  const filtered = allRows.filter((r) => {
    if (dept && r['Department'] !== dept) return false;
    if (team && r['Team'] !== team) return false;
    if (person && r['Responsible'] !== person) return false;
    if (status && normalizeStatus(r['Status']) !== status) return false;
    if (goal && r['Goal'] !== goal) return false;
    if (search) {
      const blob = Object.values(r).join(' ').toLowerCase();
      if (!blob.includes(search)) return false;
    }
    return true;
  });

  renderTable(filtered);
  updateFilterBadge();
}

const FILTER_IDS = [
  'filter-dept',
  'filter-team',
  'filter-person',
  'filter-status',
  'filter-goal',
  'search',
];

function resetFilters() {
  FILTER_IDS.forEach((id) => (document.getElementById(id).value = ''));
  populateTeamOptions();
  renderTable(allRows);
  updateFilterBadge();
}

function updateFilterBadge() {
  const count = [
    'filter-dept',
    'filter-team',
    'filter-person',
    'filter-status',
    'filter-goal',
  ].filter((id) => document.getElementById(id).value !== '').length;
  const badge = document.getElementById('filter-badge');
  badge.textContent = count > 0 ? count : '';
  badge.style.display = count > 0 ? '' : 'none';
}

let debounceTimer;
FILTER_IDS.forEach((id) => {
  const el = document.getElementById(id);
  if (el.tagName === 'INPUT') {
    el.addEventListener('input', () => {
      clearTimeout(debounceTimer);
      debounceTimer = setTimeout(applyFilters, 200);
    });
  } else {
    el.addEventListener('input', applyFilters);
  }
});

document.getElementById('filter-toggle').addEventListener('click', () => {
  const panel = document.getElementById('filter-panel');
  const toggle = document.getElementById('filter-toggle');
  const isOpen = panel.style.display !== 'none';
  panel.style.display = isOpen ? 'none' : '';
  toggle.setAttribute('aria-expanded', String(!isOpen));
});

document.getElementById('reset-btn').addEventListener('click', resetFilters);

document.getElementById('refresh-btn').addEventListener('click', fetchSheetData);

document.getElementById('filter-dept').addEventListener('change', () => {
  const dept = document.getElementById('filter-dept').value;
  const currentTeam = document.getElementById('filter-team').value;
  populateTeamOptions(dept, currentTeam);
  applyFilters();
});

fetchSheetData();
