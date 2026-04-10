var DATA_SHEET_GID = 1636341361;
var HISTORY_SHEET_NAME = 'History';
var DEBOUNCE_MINUTES = 10;
var SNAPSHOT_TRIGGER = 'takeSnapshot';

var HISTORY_HEADERS = [
  'Timestamp',
  'Level',
  'Entity',
  'Total',
  'Done',
  'Doing',
  'Blocked',
  'Pct',
];

var LEGACY_HISTORY_HEADERS = [
  'Timestamp',
  'Total',
  'Done',
  'Doing',
  'Blocked',
  'Completion %',
  'Goal',
  'Goal Total',
  'Goal Done',
  'Goal Blocked',
  'Goal %',
];

function normalizeStatus(raw) {
  var s = String(raw || '').toLowerCase().trim();
  if (s.indexOf('done') !== -1) return 'done';
  if (
    s.indexOf('doing') !== -1 ||
    s.indexOf('in progress') !== -1 ||
    s.indexOf('progress') !== -1
  ) {
    return 'doing';
  }
  if (s.indexOf('block') !== -1) return 'blocked';
  return 'other';
}

function normalizeHeader(raw) {
  return String(raw || '').trim();
}

function headersMatch(actual, expected) {
  if (!actual || actual.length < expected.length) return false;
  for (var i = 0; i < expected.length; i++) {
    if (normalizeHeader(actual[i]) !== expected[i]) return false;
  }
  return true;
}

function toInt(value) {
  var n = parseInt(value, 10);
  return isNaN(n) ? 0 : n;
}

function toIsoTimestamp(value) {
  if (Object.prototype.toString.call(value) === '[object Date]' && !isNaN(value.getTime())) {
    return value.toISOString();
  }

  var parsed = new Date(value);
  if (!isNaN(parsed.getTime())) return parsed.toISOString();

  return String(value || '');
}

function findSheetByGid(gid) {
  var sheets = SpreadsheetApp.getActiveSpreadsheet().getSheets();
  for (var i = 0; i < sheets.length; i++) {
    if (sheets[i].getSheetId() === gid) return sheets[i];
  }
  return null;
}

function findOrCreateHistorySheet() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(HISTORY_SHEET_NAME);
  if (sheet) return sheet;

  sheet = ss.insertSheet(HISTORY_SHEET_NAME);
  ensureHistoryHeaders(sheet);
  return sheet;
}

function ensureHistoryHeaders(sheet) {
  sheet.getRange(1, 1, 1, HISTORY_HEADERS.length).setValues([HISTORY_HEADERS]);
  sheet.getRange(1, 1, 1, HISTORY_HEADERS.length).setFontWeight('bold');
}

function getHistoryHeaderRow(sheet) {
  var width = Math.max(sheet.getLastColumn(), LEGACY_HISTORY_HEADERS.length, HISTORY_HEADERS.length, 1);
  return sheet.getRange(1, 1, 1, width).getValues()[0];
}

function historySheetUsesLegacySchema(sheet) {
  return headersMatch(getHistoryHeaderRow(sheet), LEGACY_HISTORY_HEADERS);
}

function historySheetUsesNewSchema(sheet) {
  return headersMatch(getHistoryHeaderRow(sheet), HISTORY_HEADERS);
}

function clearPendingTriggers() {
  ScriptApp.getProjectTriggers()
    .filter(function(t) {
      return t.getHandlerFunction() === SNAPSHOT_TRIGGER;
    })
    .forEach(function(t) {
      ScriptApp.deleteTrigger(t);
    });
}

function isEmptyRow(row) {
  for (var i = 0; i < row.length; i++) {
    if (String(row[i] || '').trim()) return false;
  }
  return true;
}

function blankSummary() {
  return {
    total: 0,
    done: 0,
    doing: 0,
    blocked: 0,
    pct: 0,
  };
}

function addStatus(summary, status) {
  summary.total++;
  if (status === 'done') summary.done++;
  if (status === 'doing') summary.doing++;
  if (status === 'blocked') summary.blocked++;
}

function finalizeSummary(summary) {
  summary.pct = summary.total ? Math.round((summary.done / summary.total) * 100) : 0;
  return summary;
}

function getBucket(map, key) {
  if (!map[key]) map[key] = blankSummary();
  return map[key];
}

function finalizeBucketMap(map) {
  var keys = Object.keys(map);
  for (var i = 0; i < keys.length; i++) {
    finalizeSummary(map[keys[i]]);
  }
}

function computeMetrics(data) {
  var headers = data[0];
  var statusCol = headers.indexOf('Status');
  var goalCol = headers.indexOf('Goal');
  var deptCol = headers.indexOf('Department');
  var responsibleCol = headers.indexOf('Responsible');

  if (statusCol === -1) {
    throw new Error('Could not find required "Status" column in the Updates sheet.');
  }

  var summary = blankSummary();
  var goals = {};
  var departments = {};
  var employees = {};

  for (var i = 1; i < data.length; i++) {
    var row = data[i];
    if (isEmptyRow(row)) continue;

    var status = normalizeStatus(row[statusCol]);
    var goal = goalCol === -1 ? 'No Goal' : String(row[goalCol] || '').trim() || 'No Goal';
    var dept = deptCol === -1 ? 'Other' : String(row[deptCol] || '').trim() || 'Other';
    var person =
      responsibleCol === -1 ? 'Unknown' : String(row[responsibleCol] || '').trim() || 'Unknown';

    addStatus(summary, status);
    addStatus(getBucket(goals, goal), status);
    addStatus(getBucket(departments, dept), status);
    addStatus(getBucket(employees, person), status);
  }

  finalizeSummary(summary);
  finalizeBucketMap(goals);
  finalizeBucketMap(departments);
  finalizeBucketMap(employees);

  return {
    summary: summary,
    goals: goals,
    departments: departments,
    employees: employees,
  };
}

function buildSnapshotRows(timestamp, metrics) {
  var rows = [];

  rows.push([
    timestamp,
    'overall',
    '—',
    metrics.summary.total,
    metrics.summary.done,
    metrics.summary.doing,
    metrics.summary.blocked,
    metrics.summary.pct,
  ]);

  Object.keys(metrics.goals)
    .sort()
    .forEach(function(name) {
      var s = metrics.goals[name];
      rows.push([timestamp, 'goal', name, s.total, s.done, s.doing, s.blocked, s.pct]);
    });

  Object.keys(metrics.departments)
    .sort()
    .forEach(function(name) {
      var s = metrics.departments[name];
      rows.push([timestamp, 'department', name, s.total, s.done, s.doing, s.blocked, s.pct]);
    });

  Object.keys(metrics.employees)
    .sort()
    .forEach(function(name) {
      var s = metrics.employees[name];
      rows.push([timestamp, 'employee', name, s.total, s.done, s.doing, s.blocked, s.pct]);
    });

  return rows;
}

function appendSnapshot(historySheet, timestamp, metrics) {
  ensureHistoryHeaders(historySheet);

  var rows = buildSnapshotRows(timestamp, metrics);
  if (!rows.length) return;

  historySheet
    .getRange(historySheet.getLastRow() + 1, 1, rows.length, HISTORY_HEADERS.length)
    .setValues(rows);
}

function takeSnapshot() {
  clearPendingTriggers();

  var dataSheet = findSheetByGid(DATA_SHEET_GID);
  if (!dataSheet) return;

  var historySheet = findOrCreateHistorySheet();

  if (historySheetUsesLegacySchema(historySheet)) {
    throw new Error(
      'History sheet is still on the legacy schema. Run migrateHistoryToNewSchema() once before taking new snapshots.'
    );
  }

  var data = dataSheet.getDataRange().getValues();
  if (data.length < 2) return;

  var metrics = computeMetrics(data);
  appendSnapshot(historySheet, new Date().toISOString(), metrics);
}

function migrateHistoryToNewSchema() {
  var historySheet = findOrCreateHistorySheet();
  var allData = historySheet.getDataRange().getValues();

  if (allData.length <= 1) {
    ensureHistoryHeaders(historySheet);
    Logger.log('History sheet was empty; headers updated to the new schema.');
    return;
  }

  if (historySheetUsesNewSchema(historySheet)) {
    ensureHistoryHeaders(historySheet);
    Logger.log('History sheet is already using the new schema.');
    return;
  }

  var headerRow = allData[0];
  if (!headersMatch(headerRow, LEGACY_HISTORY_HEADERS)) {
    throw new Error(
      'History sheet does not match the expected legacy schema. Aborting migration to avoid corrupting data.'
    );
  }

  var grouped = {};
  var orderedKeys = [];

  for (var i = 1; i < allData.length; i++) {
    var row = allData[i];
    if (isEmptyRow(row)) continue;

    var isoTimestamp = toIsoTimestamp(row[0]);
    if (!isoTimestamp) continue;

    if (!grouped[isoTimestamp]) {
      grouped[isoTimestamp] = {
        overall: null,
        goals: [],
      };
      orderedKeys.push(isoTimestamp);
    }

    if (!grouped[isoTimestamp].overall) {
      grouped[isoTimestamp].overall = [
        isoTimestamp,
        'overall',
        '—',
        toInt(row[1]),
        toInt(row[2]),
        toInt(row[3]),
        toInt(row[4]),
        toInt(row[5]),
      ];
    }

    var goalName = String(row[6] || '').trim();
    if (goalName) {
      var goalTotal = toInt(row[7]);
      var goalDone = toInt(row[8]);
      var goalBlocked = toInt(row[9]);
      var goalDoing = Math.max(0, goalTotal - goalDone - goalBlocked);
      var goalPct = toInt(row[10]);

      grouped[isoTimestamp].goals.push([
        isoTimestamp,
        'goal',
        goalName,
        goalTotal,
        goalDone,
        goalDoing,
        goalBlocked,
        goalPct,
      ]);
    }
  }

  var migratedRows = [];

  orderedKeys.forEach(function(key) {
    var group = grouped[key];
    if (group.overall) migratedRows.push(group.overall);

    group.goals.sort(function(a, b) {
      return String(a[2]).localeCompare(String(b[2]));
    });

    for (var j = 0; j < group.goals.length; j++) {
      migratedRows.push(group.goals[j]);
    }
  });

  historySheet.clearContents();
  ensureHistoryHeaders(historySheet);

  if (migratedRows.length) {
    historySheet
      .getRange(2, 1, migratedRows.length, HISTORY_HEADERS.length)
      .setValues(migratedRows);
  }

  Logger.log('Migration complete. Wrote ' + migratedRows.length + ' rows in the new schema.');
}

function onSheetEdit(e) {
  if (!e || !e.source) return;
  if (e.source.getActiveSheet().getSheetId() !== DATA_SHEET_GID) return;

  clearPendingTriggers();
  ScriptApp.newTrigger(SNAPSHOT_TRIGGER)
    .timeBased()
    .after(DEBOUNCE_MINUTES * 60 * 1000)
    .create();
}

function testSnapshot() {
  takeSnapshot();
}
