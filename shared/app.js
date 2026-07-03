/* ExpenseFlow (Concept) - shared data layer + UI helpers.
   Pure static demo. All data is sample data stored in localStorage in this browser.
   No external libraries, no network calls.
   Modeled on the client's process documents: FSOs submit payment requests with
   documentation, an admin reviews with per-field verification, approved expenses
   flow to a bookkeeper for QuickBooks entry, and tracking is per project broken
   out by budget line item and funding source. */
(function () {
  'use strict';

  var STORE_KEY = 'expenseflow-concept-demo';
  var SCHEMA_VERSION = 3;

  var STATUS_META = {
    pending: { label: 'Pending approval', cls: 'pending' },
    approved: { label: 'Approved', cls: 'approved' },
    returned: { label: 'Returned for changes', cls: 'query' },
    rejected: { label: 'Rejected', cls: 'rejected' }
  };

  var QB_META = {
    queued: { label: 'In bookkeeper report', cls: 'pending' },
    synced: { label: 'Added to QuickBooks (simulated)', cls: 'approved' }
  };

  var ROLE_META = {
    fso: { label: 'FSO member', who: 'JR', title: 'Jordan Reyes, Riverbend Youth Collective (demo user)' },
    admin: { label: 'Admin', who: 'AM', title: 'Alex Morgan, Admin reviewer (demo user)' },
    bookkeeper: { label: 'Bookkeeper', who: 'SW', title: 'Sam Whitfield, Bookkeeper (demo user)' }
  };

  /* Verification fields the reviewer must check off before approval,
     straight from the client's review mock-up. */
  var VERIFY_FIELDS = [
    { key: 'payee', label: 'Who is being paid' },
    { key: 'date', label: 'Date of expense' },
    { key: 'cost', label: 'Cost and funding source' },
    { key: 'description', label: 'Description' },
    { key: 'coa', label: 'COA assignment' }
  ];

  var CURRENT_FSO = 'fso-riv';
  var CURRENT_USER = 'Jordan Reyes';

  var PALETTE = ['#0891b2', '#6366f1', '#059669', '#f59e0b', '#dc2626', '#0e7490', '#7c3aed', '#334155'];

  /* ---------- date helpers ---------- */

  function pad(n) { return (n < 10 ? '0' : '') + n; }

  function iso(d) {
    return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
  }

  function todayIso() { return iso(new Date()); }

  function parseIso(s) {
    var p = String(s || '').split('-');
    return new Date(+p[0], (+p[1] || 1) - 1, +p[2] || 1);
  }

  /* A date N months ago on the given day, clamped so nothing lands in the future.
     Keeps the seed data evergreen no matter when the demo is opened. */
  function dateMonthsAgo(monthsAgo, day) {
    var now = new Date();
    var first = new Date(now.getFullYear(), now.getMonth() - monthsAgo, 1);
    var lastDay = new Date(first.getFullYear(), first.getMonth() + 1, 0).getDate();
    var dd = Math.min(day, lastDay);
    if (monthsAgo === 0) dd = Math.min(dd, now.getDate());
    return new Date(first.getFullYear(), first.getMonth(), dd);
  }

  function addDaysClamped(isoStr, days) {
    var d = parseIso(isoStr);
    d.setDate(d.getDate() + days);
    var now = new Date();
    if (d > now) d = now;
    return iso(d);
  }

  function monthKey(isoStr) { return String(isoStr || '').slice(0, 7); }

  function monthLabel(key) {
    var p = String(key).split('-');
    var d = new Date(+p[0], (+p[1] || 1) - 1, 1);
    return d.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
  }

  function monthShort(key) {
    var p = String(key).split('-');
    var d = new Date(+p[0], (+p[1] || 1) - 1, 1);
    return d.toLocaleDateString('en-US', { month: 'short' });
  }

  function lastMonths(n) {
    var out = [];
    for (var i = n - 1; i >= 0; i--) out.push(monthKey(iso(dateMonthsAgo(i, 1))));
    return out;
  }

  function fmtDate(isoStr) {
    if (!isoStr) return '';
    return parseIso(isoStr).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  }

  function daysOld(isoStr) {
    return Math.floor((new Date() - parseIso(isoStr)) / 86400000);
  }

  /* ---------- formatting + safety ---------- */

  function fmtMoney(n) {
    return '$' + Number(n || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }

  function fmtMoney0(n) {
    return '$' + Math.round(Number(n || 0)).toLocaleString('en-US');
  }

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function round2(n) { return Math.round(Number(n || 0) * 100) / 100; }

  /* ---------- storage (with in-memory fallback) ---------- */

  var memoryRaw = null;

  function readRaw() {
    try { return window.localStorage.getItem(STORE_KEY); }
    catch (e) { return memoryRaw; }
  }
  function writeRaw(s) {
    try { window.localStorage.setItem(STORE_KEY, s); }
    catch (e) { memoryRaw = s; }
  }
  function removeRaw() {
    try { window.localStorage.removeItem(STORE_KEY); }
    catch (e) { memoryRaw = null; }
  }

  /* ---------- seed data ---------- */

  function seed() {
    var fsos = [
      { id: 'fso-riv', name: 'Riverbend Youth Collective', contact: 'Jordan Reyes' },
      { id: 'fso-pra', name: 'Prairie Arts Cooperative', contact: 'Dana Whitcomb' },
      { id: 'fso-har', name: 'Harbor Community Kitchen', contact: 'Luis Herrera' }
    ];

    var projects = [
      { id: 'prj-syp', fsoId: 'fso-riv', name: 'Summer Youth Program', active: true },
      { id: 'prj-ast', fsoId: 'fso-riv', name: 'After-School Tutoring', active: true },
      { id: 'prj-mur', fsoId: 'fso-pra', name: 'Community Mural Series', active: true },
      { id: 'prj-wms', fsoId: 'fso-har', name: 'Weekend Meal Service', active: true }
    ];

    var coa = [
      { id: '6010', label: 'Program Supplies' },
      { id: '6020', label: 'Contract Services' },
      { id: '6030', label: 'Travel & Transportation' },
      { id: '6040', label: 'Food & Catering' },
      { id: '6050', label: 'Equipment' },
      { id: '6060', label: 'Printing & Marketing' },
      { id: '6070', label: 'Facility Rental' }
    ];

    var fundingSources = [
      { id: 'fs-hartwell26', fsoId: 'fso-riv', projectId: 'prj-syp', name: 'Hartwell Family Foundation Grant', year: 2026, total: 25000,
        lineBudgets: { '6010': 6000, '6020': 8000, '6030': 3000, '6040': 5000, '6060': 3000 }, priorSpend: {} },
      { id: 'fs-city26', fsoId: 'fso-riv', projectId: 'prj-syp', name: 'City Youth Services Grant', year: 2026, total: 12000,
        lineBudgets: { '6020': 5000, '6050': 4000, '6070': 3000 }, priorSpend: {} },
      { id: 'fs-hartwell25', fsoId: 'fso-riv', projectId: 'prj-syp', name: 'Hartwell Family Foundation Grant', year: 2025, total: 20000,
        lineBudgets: { '6010': 5000, '6020': 9000, '6040': 6000 }, priorSpend: { '6010': 4800, '6020': 8600, '6040': 5200 } },
      { id: 'fs-tutor26', fsoId: 'fso-riv', projectId: 'prj-ast', name: 'Lakeside Education Fund', year: 2026, total: 9000,
        lineBudgets: { '6010': 3000, '6020': 5000, '6060': 1000 }, priorSpend: {} },
      { id: 'fs-arts26', fsoId: 'fso-pra', projectId: 'prj-mur', name: 'State Arts Council Grant', year: 2026, total: 18000,
        lineBudgets: { '6010': 5000, '6020': 7000, '6060': 2500, '6070': 3500 }, priorSpend: {} },
      { id: 'fs-food26', fsoId: 'fso-har', projectId: 'prj-wms', name: 'Regional Food Security Grant', year: 2026, total: 22000,
        lineBudgets: { '6010': 4000, '6030': 2000, '6040': 12000, '6050': 4000 }, priorSpend: {} }
    ];

    var payees = [
      { id: 'pay-maya', fsoId: 'fso-riv', name: 'Maya Okafor', kind: 'individual', isNew: false, financeDocsReceived: true, mouOnFile: true },
      { id: 'pay-cedar', fsoId: 'fso-riv', name: 'Cedar Print Shop', kind: 'organization', isNew: false, financeDocsReceived: true, mouOnFile: true },
      { id: 'pay-north', fsoId: 'fso-riv', name: 'Northside Supply Co', kind: 'organization', isNew: false, financeDocsReceived: true, mouOnFile: true },
      { id: 'pay-jr', fsoId: 'fso-riv', name: 'Jordan Reyes (reimbursement)', kind: 'individual', isNew: false, financeDocsReceived: true, mouOnFile: true },
      { id: 'pay-brights', fsoId: 'fso-riv', name: 'Brightside Sound & Stage', kind: 'organization', isNew: true, financeDocsReceived: false, mouOnFile: true },
      { id: 'pay-elena', fsoId: 'fso-pra', name: 'Elena Vasquez', kind: 'individual', isNew: false, financeDocsReceived: true, mouOnFile: true },
      { id: 'pay-bwall', fsoId: 'fso-pra', name: 'Brightwall Paint Supply', kind: 'organization', isNew: false, financeDocsReceived: true, mouOnFile: true },
      { id: 'pay-fresh', fsoId: 'fso-har', name: 'Fresh Fields Produce', kind: 'organization', isNew: false, financeDocsReceived: true, mouOnFile: true },
      { id: 'pay-luis', fsoId: 'fso-har', name: 'Luis Herrera (reimbursement)', kind: 'individual', isNew: false, financeDocsReceived: true, mouOnFile: true }
    ];

    var num = 4451;
    var expenses = [];

    /* mk(monthsAgo, day, fsoId, projectId, payeeId, amount, allocations, coaId, description,
          status, decideDays, doc, opts) */
    function mk(monthsAgo, day, fsoId, projectId, payeeId, amount, allocations, coaId, description, status, decideDays, doc, opts) {
      opts = opts || {};
      var created = iso(dateMonthsAgo(monthsAgo, day));
      var e = {
        id: 'exp-' + num,
        num: num,
        fsoId: fsoId,
        projectId: projectId,
        payeeId: payeeId,
        amount: amount,
        allocations: allocations,
        coaId: coaId || null,
        description: description,
        comments: opts.comments || '',
        status: status,
        date: opts.date || created,
        submittedAt: created,
        decidedAt: null,
        doc: doc,
        verify: {},
        fieldComments: opts.fieldComments || {},
        months: opts.months || null,
        history: [{ ts: created, actor: fsoName(fsoId), role: 'fso', action: 'Submitted', note: 'Payment request submitted with documentation.' }],
        qb: null,
        qbTs: null,
        rejectMessage: null
      };
      function fsoName(id) {
        var hit = '';
        fsos.forEach(function (f) { if (f.id === id) hit = f.name; });
        return hit;
      }
      if (decideDays != null && (status === 'approved' || status === 'rejected')) {
        e.decidedAt = addDaysClamped(created, decideDays);
        if (status === 'approved') {
          VERIFY_FIELDS.forEach(function (f) { e.verify[f.key] = true; });
          e.history.push({ ts: e.decidedAt, actor: 'Alex Morgan', role: 'admin', action: 'Approved', note: 'All fields verified. Email notification sent (simulated).' });
          e.qb = opts.qb || 'queued';
          if (e.qb === 'synced') {
            e.qbTs = addDaysClamped(e.decidedAt, 2);
            e.history.push({ ts: e.qbTs, actor: 'Sam Whitfield', role: 'bookkeeper', action: 'Added to QuickBooks (simulated)', note: 'Recorded from the bookkeeper report.' });
          } else {
            e.history.push({ ts: e.decidedAt, actor: 'System', role: 'admin', action: 'Sent to bookkeeper', note: 'Included in the report of expenses to be added to QuickBooks.' });
          }
        } else {
          e.rejectMessage = opts.rejectMessage || '';
          e.history.push({ ts: e.decidedAt, actor: 'Alex Morgan', role: 'admin', action: 'Rejected', note: (opts.rejectMessage || '') + ' Email notification sent (simulated).' });
        }
      }
      if (status === 'returned') {
        var rts = addDaysClamped(created, opts.returnDays == null ? 1 : opts.returnDays);
        e.history.push({ ts: rts, actor: 'Alex Morgan', role: 'admin', action: 'Returned to FSO', note: 'Sent back with field comments. Email notification sent (simulated).' });
      }
      num++;
      expenses.push(e);
      return e;
    }

    function doc(type, vendor, name, lines) {
      return { type: type, vendor: vendor, name: name, lines: lines || [] };
    }

    /* --- approved history (some already in QuickBooks) --- */
    mk(2, 5, 'fso-riv', 'prj-syp', 'pay-maya', 600.00, [{ fsId: 'fs-hartwell26', amount: 600.00 }], '6020',
      'Facilitator fees for three June workshops in the summer program.', 'approved', 3,
      doc('invoice', 'Maya Okafor', 'invoice-2041-okafor.pdf', [['Workshop facilitation, 3 sessions', 600.00]]), { qb: 'synced' });

    mk(2, 9, 'fso-riv', 'prj-syp', 'pay-north', 412.50, [{ fsId: 'fs-hartwell26', amount: 412.50 }], '6010',
      'Craft and program supplies for the first summer session block.', 'approved', 2,
      doc('receipt', 'Northside Supply Co', 'receipt-northside-supplies.pdf', [['Craft supplies', 268.00], ['Storage bins', 96.50], ['Name tags and lanyards', 48.00]]), { qb: 'synced' });

    mk(2, 14, 'fso-pra', 'prj-mur', 'pay-bwall', 823.40, [{ fsId: 'fs-arts26', amount: 823.40 }], '6010',
      'Exterior paint and sealer for mural wall two.', 'approved', 4,
      doc('receipt', 'Brightwall Paint Supply', 'receipt-brightwall-wall2.pdf', [['Exterior acrylic, 12 gal', 588.00], ['UV sealer, 4 gal', 235.40]]), { qb: 'synced' });

    mk(2, 18, 'fso-har', 'prj-wms', 'pay-fresh', 947.10, [{ fsId: 'fs-food26', amount: 947.10 }], '6040',
      'Produce for weekend meal service, four weekends.', 'approved', 2,
      doc('invoice', 'Fresh Fields Produce', 'invoice-8812-freshfields.pdf', [['Produce, weeks 1-2', 512.30], ['Produce, weeks 3-4', 434.80]]), { qb: 'synced' });

    mk(1, 4, 'fso-riv', 'prj-syp', 'pay-cedar', 286.00, [{ fsId: 'fs-hartwell26', amount: 286.00 }], '6060',
      'Flyers and banners for the enrollment drive.', 'approved', 3,
      doc('invoice', 'Cedar Print Shop', 'invoice-1177-cedarprint.pdf', [['Flyers, 500 count', 164.00], ['Vinyl banners, 2', 122.00]]));

    mk(1, 8, 'fso-riv', 'prj-syp', 'pay-jr', 148.20, [{ fsId: 'fs-hartwell26', amount: 148.20 }], '6030',
      'Van rental fuel for the river cleanup field trip.', 'approved', 2,
      doc('receipt', 'Riverside Fuel Stop', 'receipt-fuel-fieldtrip.pdf', [['Fuel', 148.20]]));

    mk(1, 12, 'fso-riv', 'prj-ast', 'pay-maya', 450.00, [{ fsId: 'fs-tutor26', amount: 450.00 }], '6020',
      'Tutoring sessions, three weeks of after-school support.', 'approved', 3,
      doc('invoice', 'Maya Okafor', 'invoice-2055-okafor.pdf', [['Tutoring, 18 hours', 450.00]]));

    mk(1, 15, 'fso-pra', 'prj-mur', 'pay-elena', 1500.00, [{ fsId: 'fs-arts26', amount: 1500.00 }], '6020',
      'Muralist stipend for wall two completion.', 'approved', 2,
      doc('invoice', 'Elena Vasquez', 'invoice-ev-031.pdf', [['Mural design and painting, wall 2', 1500.00]]));

    mk(1, 19, 'fso-har', 'prj-wms', 'pay-luis', 63.80, [{ fsId: 'fs-food26', amount: 63.80 }], '6030',
      'Mileage for pantry pickups, 100 miles at the standard rate.', 'approved', 3,
      doc('receipt', 'Mileage log', 'mileage-log-pantry.pdf', [['100 miles at standard rate', 63.80]]));

    mk(1, 22, 'fso-har', 'prj-wms', 'pay-fresh', 389.95, [{ fsId: 'fs-food26', amount: 389.95 }], '6050',
      'Chest freezer replacement for the kitchen storeroom.', 'approved', 2,
      doc('receipt', 'Fresh Fields Produce', 'receipt-freezer.pdf', [['Chest freezer, 9 cu ft', 389.95]]));

    /* --- rejected example --- */
    mk(1, 25, 'fso-pra', 'prj-mur', 'pay-bwall', 214.90, [{ fsId: 'fs-arts26', amount: 214.90 }], null,
      'Interior paint for the studio workspace.', 'rejected', 2,
      doc('receipt', 'Brightwall Paint Supply', 'receipt-studio-paint.pdf', [['Interior latex, 4 gal', 214.90]]),
      { rejectMessage: 'The State Arts Council Grant covers exterior mural work only. Please resubmit under a different funding source if one applies.' });

    /* --- returned to the FSO with field comments (shown in red on their side) --- */
    mk(0, 1, 'fso-riv', 'prj-syp', 'pay-cedar', 164.00, [{ fsId: 'fs-hartwell26', amount: 164.00 }], null,
      'T-shirt printing for volunteers.', 'returned', null,
      doc('invoice', 'Cedar Print Shop', 'invoice-1201-cedarprint.pdf', [['T-shirt printing, 24 shirts', 164.00]]),
      { returnDays: 1, fieldComments: {
        date: 'The invoice shows the end of last month but the entry says this month. Please confirm the correct date.',
        description: 'Please note which program the shirts were for.' } });

    /* --- pending queue (grouped by FSO in review, oldest first) --- */
    mk(4, 15, 'fso-riv', 'prj-syp', 'pay-jr', 92.40, [{ fsId: 'fs-hartwell26', amount: 92.40 }], null,
      'Parking and tolls for spring planning meetings.', 'pending', null,
      doc('receipt', 'City Parking Authority', 'receipt-parking-spring.pdf', [['Parking, 4 visits', 68.40], ['Tolls', 24.00]]));

    mk(0, 1, 'fso-riv', 'prj-syp', 'pay-north', 238.75, [{ fsId: 'fs-hartwell26', amount: 238.75 }], null,
      'Sports equipment for afternoon rec hours.', 'pending', null,
      doc('receipt', 'Northside Supply Co', 'receipt-rec-equipment.pdf', [['Soccer balls, 6', 118.75], ['Cones and pinnies', 120.00]]));

    mk(0, 2, 'fso-riv', 'prj-syp', 'pay-brights', 675.00, [{ fsId: 'fs-city26', amount: 675.00 }], null,
      'Sound system rental for the end-of-summer showcase.', 'pending', null,
      doc('invoice', 'Brightside Sound & Stage', 'invoice-bss-448.pdf', [['PA system rental, 1 day', 495.00], ['Setup and teardown', 180.00]]));

    mk(0, 2, 'fso-pra', 'prj-mur', 'pay-elena', 750.00, [{ fsId: 'fs-arts26', amount: 750.00 }], null,
      'Muralist stipend for wall three sketch approval milestone.', 'pending', null,
      doc('invoice', 'Elena Vasquez', 'invoice-ev-034.pdf', [['Concept sketches and revisions, wall 3', 750.00]]));

    mk(0, 1, 'fso-har', 'prj-wms', 'pay-fresh', 512.60, [{ fsId: 'fs-food26', amount: 512.60 }], null,
      'Produce and dry goods to prep next month of weekend meals.', 'pending', null,
      doc('invoice', 'Fresh Fields Produce', 'invoice-8871-freshfields.pdf', [['Produce', 342.10], ['Dry goods', 170.50]]));

    mk(0, 2, 'fso-har', 'prj-wms', 'pay-luis', 54.10, [{ fsId: 'fs-food26', amount: 54.10 }], null,
      'Cleaning supplies bought with cash, receipt lost.', 'pending', null,
      doc('affidavit', 'Lost/Missing Receipt Affidavit', 'lost-receipt-affidavit-herrera.pdf', [['Cleaning supplies (per affidavit)', 54.10]]));

    var income = [
      { id: 'inc-1', projectId: 'prj-syp', fsId: 'fs-hartwell26', amount: 12500, date: iso(dateMonthsAgo(2, 2)), note: 'Grant installment 1 of 2' },
      { id: 'inc-2', projectId: 'prj-wms', fsId: 'fs-food26', amount: 11000, date: iso(dateMonthsAgo(1, 6)), note: 'Grant installment 1 of 2' }
    ];

    return {
      version: SCHEMA_VERSION,
      role: 'fso',
      fsos: fsos,
      projects: projects,
      coa: coa,
      fundingSources: fundingSources,
      payees: payees,
      expenses: expenses,
      income: income,
      draft: null,
      nextNum: num
    };
  }

  /* ---------- store lifecycle ---------- */

  var state = null;

  function load() {
    var raw = readRaw();
    var st = null;
    if (raw) {
      try { st = JSON.parse(raw); } catch (e) { st = null; }
    }
    if (!st || st.version !== SCHEMA_VERSION || !Array.isArray(st.expenses)) {
      st = seed();
      writeRaw(JSON.stringify(st));
    }
    return st;
  }

  function getState() {
    if (!state) state = load();
    return state;
  }

  function save() {
    if (state) writeRaw(JSON.stringify(state));
  }

  function reset() {
    removeRaw();
    state = null;
    getState();
  }

  /* ---------- entity lookups ---------- */

  function byId(list, id) {
    var hit = null;
    (list || []).forEach(function (x) { if (x.id === id) hit = x; });
    return hit;
  }

  function fso(id) { return byId(getState().fsos, id); }
  function project(id) { return byId(getState().projects, id); }
  function fundingSource(id) { return byId(getState().fundingSources, id); }
  function payee(id) { return byId(getState().payees, id); }
  function coaItem(id) { return byId(getState().coa, id); }
  function findExpense(id) { return byId(getState().expenses, id); }

  function projectsFor(fsoId) {
    return getState().projects.filter(function (p) { return p.fsoId === fsoId; });
  }
  function fundingFor(fsoId) {
    return getState().fundingSources.filter(function (f) { return f.fsoId === fsoId; });
  }
  function fundingForProject(projectId) {
    return getState().fundingSources.filter(function (f) { return f.projectId === projectId; });
  }
  function payeesFor(fsoId) {
    return getState().payees.filter(function (p) { return p.fsoId === fsoId; });
  }
  function expensesFor(fsoId) {
    return getState().expenses.filter(function (e) { return e.fsoId === fsoId; });
  }

  /* ---------- money math (always computed live from the store) ---------- */

  function priorSpendTotal(fs) {
    var t = 0;
    Object.keys(fs.priorSpend || {}).forEach(function (k) { t += fs.priorSpend[k]; });
    return t;
  }

  /* Committed = approved + pending + returned allocations (rejected excluded). */
  function fsCommitted(fsId) {
    var t = 0;
    getState().expenses.forEach(function (e) {
      if (e.status === 'rejected') return;
      (e.allocations || []).forEach(function (a) { if (a.fsId === fsId) t += a.amount; });
    });
    return round2(t);
  }

  function fsApproved(fsId) {
    var t = 0;
    getState().expenses.forEach(function (e) {
      if (e.status !== 'approved') return;
      (e.allocations || []).forEach(function (a) { if (a.fsId === fsId) t += a.amount; });
    });
    return round2(t);
  }

  function fsAvailable(fsId) {
    var fs = fundingSource(fsId);
    if (!fs) return 0;
    return round2(fs.total - priorSpendTotal(fs) - fsCommitted(fsId));
  }

  /* Approved spend against one line item of one funding source (plus prior recorded spend). */
  function lineSpent(fsId, coaId) {
    var fs = fundingSource(fsId);
    var t = (fs && fs.priorSpend && fs.priorSpend[coaId]) || 0;
    getState().expenses.forEach(function (e) {
      if (e.status !== 'approved' || e.coaId !== coaId) return;
      (e.allocations || []).forEach(function (a) { if (a.fsId === fsId) t += a.amount; });
    });
    return round2(t);
  }

  /* ---------- history ---------- */

  function pushHist(e, actor, role, action, note) {
    e.history.push({ ts: todayIso(), actor: actor, role: role, action: action, note: note || '' });
  }

  /* ---------- payment request lifecycle ---------- */

  function takeNum() {
    var st = getState();
    if (!st.nextNum) st.nextNum = 4470;
    return st.nextNum++;
  }

  function addPayee(fsoId, name, kind) {
    var st = getState();
    var p = {
      id: 'pay-' + Date.now().toString(36) + Math.floor(Math.random() * 999),
      fsoId: fsoId,
      name: String(name).trim(),
      kind: kind === 'organization' ? 'organization' : 'individual',
      isNew: true,
      financeDocsReceived: false,
      mouOnFile: true
    };
    st.payees.push(p);
    save();
    return p;
  }

  /* entries: [{payeeId, projectId, date, amount, allocations, description, comments, months, doc}] */
  function submitRequest(entries) {
    var st = getState();
    var made = [];
    var me = fso(CURRENT_FSO);
    entries.forEach(function (en) {
      var n = takeNum();
      var e = {
        id: 'exp-' + n + '-' + Date.now().toString(36),
        num: n,
        fsoId: CURRENT_FSO,
        projectId: en.projectId,
        payeeId: en.payeeId,
        amount: round2(en.amount),
        allocations: en.allocations.map(function (a) { return { fsId: a.fsId, amount: round2(a.amount) }; }),
        coaId: null,
        description: String(en.description || '').trim(),
        comments: String(en.comments || '').trim(),
        status: 'pending',
        date: en.date,
        submittedAt: todayIso(),
        decidedAt: null,
        doc: en.doc,
        verify: {},
        fieldComments: {},
        months: en.months || null,
        history: [{ ts: todayIso(), actor: me ? me.name : 'FSO', role: 'fso', action: 'Submitted', note: 'Payment request submitted with documentation.' }],
        qb: null,
        qbTs: null,
        rejectMessage: null
      };
      st.expenses.push(e);
      made.push(e);
    });
    save();
    return made;
  }

  /* FSO fixes and resubmits a returned expense. */
  function resubmit(id, fields) {
    var e = findExpense(id);
    if (!e) return null;
    if (fields.date) e.date = fields.date;
    if (fields.amount != null) e.amount = round2(fields.amount);
    if (fields.allocations) e.allocations = fields.allocations.map(function (a) { return { fsId: a.fsId, amount: round2(a.amount) }; });
    if (fields.description != null) e.description = String(fields.description).trim();
    if (fields.comments != null) e.comments = String(fields.comments).trim();
    if (fields.payeeId) e.payeeId = fields.payeeId;
    e.status = 'pending';
    e.fieldComments = {};
    e.verify = {};
    pushHist(e, fso(e.fsoId).name, 'fso', 'Resubmitted', 'Updated after review comments and resubmitted.');
    save();
    return e;
  }

  /* ---------- review actions ---------- */

  function reviewEdit(id, field, value, comment) {
    var e = findExpense(id);
    if (!e) return null;
    if (field === 'date') e.date = value;
    if (field === 'description') e.description = value;
    if (field === 'coa') e.coaId = value || null;
    if (field === 'payee') e.payeeId = value;
    if (field === 'comments') e.comments = value;
    pushHist(e, 'Alex Morgan', 'admin', 'Edited ' + field, comment || 'Edited during review.');
    save();
    return e;
  }

  function approve(id) {
    var e = findExpense(id);
    if (!e) return null;
    e.status = 'approved';
    e.decidedAt = todayIso();
    var p = payee(e.payeeId);
    if (p && p.isNew) { p.isNew = false; p.financeDocsReceived = true; }
    e.qb = 'queued';
    pushHist(e, 'Alex Morgan', 'admin', 'Approved', 'All fields verified. Email notification sent (simulated).');
    pushHist(e, 'System', 'admin', 'Sent to bookkeeper', 'Included in the report of expenses to be added to QuickBooks.');
    save();
    return e;
  }

  function returnToFso(id, fieldComments) {
    var e = findExpense(id);
    if (!e) return null;
    e.status = 'returned';
    e.fieldComments = fieldComments || {};
    pushHist(e, 'Alex Morgan', 'admin', 'Returned to FSO', 'Sent back with field comments. Email notification sent (simulated).');
    save();
    return e;
  }

  function reject(id, message) {
    var e = findExpense(id);
    if (!e) return null;
    e.status = 'rejected';
    e.decidedAt = todayIso();
    e.rejectMessage = String(message || '').trim();
    pushHist(e, 'Alex Morgan', 'admin', 'Rejected', e.rejectMessage + ' Email notification sent (simulated).');
    save();
    return e;
  }

  /* ---------- bookkeeper ---------- */

  function markSynced(id) {
    var e = findExpense(id);
    if (!e || e.status !== 'approved') return null;
    e.qb = 'synced';
    e.qbTs = todayIso();
    pushHist(e, 'Sam Whitfield', 'bookkeeper', 'Added to QuickBooks (simulated)', 'Recorded from the bookkeeper report.');
    save();
    return e;
  }

  function addIncome(projectId, fsId, amount, date, note) {
    var st = getState();
    var inc = {
      id: 'inc-' + Date.now().toString(36),
      projectId: projectId,
      fsId: fsId,
      amount: round2(amount),
      date: date,
      note: String(note || '').trim()
    };
    st.income.push(inc);
    save();
    return inc;
  }

  /* ---------- shared chrome (top bar, role switch, reset link) ---------- */

  function applyRole(role) {
    document.body.setAttribute('data-role', role);
    var btns = document.querySelectorAll('.roleswitch button');
    for (var i = 0; i < btns.length; i++) {
      btns[i].classList.toggle('on', btns[i].getAttribute('data-role') === role);
    }
    var who = document.querySelector('.top .who');
    var meta = ROLE_META[role];
    if (who && meta) {
      who.textContent = meta.who;
      who.setAttribute('title', meta.title);
    }
  }

  function initChrome(page) {
    var st = getState();

    var links = document.querySelectorAll('.nav a');
    for (var i = 0; i < links.length; i++) {
      links[i].classList.toggle('on', links[i].getAttribute('data-page') === page);
    }

    if (!ROLE_META[st.role]) st.role = 'fso';
    applyRole(st.role);
    var btns = document.querySelectorAll('.roleswitch button');
    for (var j = 0; j < btns.length; j++) {
      (function (b) {
        b.addEventListener('click', function () {
          var r = b.getAttribute('data-role');
          if (!ROLE_META[r]) r = 'fso';
          st.role = r;
          save();
          applyRole(r);
          showToast('Viewing as ' + ROLE_META[r].label + '.');
          document.dispatchEvent(new CustomEvent('rolechange', { detail: { role: r } }));
        });
      })(btns[j]);
    }

    var r = document.getElementById('resetDemo');
    if (r) {
      r.addEventListener('click', function (ev) {
        ev.preventDefault();
        if (window.confirm('Reset the demo data back to its original sample state?')) {
          reset();
          window.location.reload();
        }
      });
    }
  }

  /* ---------- toast ---------- */

  var toastTimer = null;

  function showToast(msg) {
    var t = document.querySelector('.toast');
    if (!t) {
      t = document.createElement('div');
      t.className = 'toast';
      t.setAttribute('role', 'status');
      document.body.appendChild(t);
    }
    t.textContent = msg;
    window.requestAnimationFrame(function () {
      window.requestAnimationFrame(function () { t.classList.add('show'); });
    });
    if (toastTimer) clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { t.classList.remove('show'); }, 2600);
  }

  /* ---------- SVG + HTML charts (no libraries) ---------- */

  function niceCeil(v) {
    if (v <= 0) return 1;
    var p = Math.pow(10, Math.floor(Math.log(v) / Math.LN10));
    var f = v / p;
    var n = f <= 1 ? 1 : f <= 2 ? 2 : f <= 2.5 ? 2.5 : f <= 5 ? 5 : 10;
    return n * p;
  }

  function compactMoney(v) {
    if (v >= 1000) {
      var k = Math.round(v / 100) / 10;
      return '$' + (k % 1 === 0 ? k.toFixed(0) : k.toFixed(1)) + 'k';
    }
    return '$' + Math.round(v);
  }

  /* points: [{label, value}] vertical bars */
  function renderBarChart(el, points) {
    if (!el) return;
    if (!points || !points.length) {
      el.innerHTML = '<div class="empty">No data yet.</div>';
      return;
    }
    var w = 520, h = 236, padL = 48, padR = 14, padT = 26, padB = 30;
    var innerW = w - padL - padR, innerH = h - padT - padB;
    var max = 0;
    points.forEach(function (p) { if (p.value > max) max = p.value; });
    var top = niceCeil(max || 1);
    var bw = Math.min(64, (innerW / points.length) * 0.55);

    var s = '<svg viewBox="0 0 ' + w + ' ' + h + '" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Bar chart">';
    for (var i = 0; i <= 4; i++) {
      var gv = top * i / 4;
      var gy = padT + innerH - (innerH * i / 4);
      s += '<line class="chart-grid" x1="' + padL + '" y1="' + gy + '" x2="' + (w - padR) + '" y2="' + gy + '"/>';
      s += '<text class="chart-axis" x="' + (padL - 8) + '" y="' + (gy + 4) + '" text-anchor="end">' + compactMoney(gv) + '</text>';
    }
    points.forEach(function (p, idx) {
      var cx = padL + innerW * (idx + 0.5) / points.length;
      var bh = Math.max(0, innerH * p.value / top);
      var x = cx - bw / 2;
      var y = padT + innerH - bh;
      if (bh > 0.5) {
        s += '<rect class="chart-bar" x="' + x.toFixed(1) + '" y="' + y.toFixed(1) + '" width="' + bw.toFixed(1) + '" height="' + bh.toFixed(1) + '" rx="5"/>';
      }
      s += '<text class="chart-val" x="' + cx.toFixed(1) + '" y="' + (y - 7).toFixed(1) + '" text-anchor="middle">' + compactMoney(p.value) + '</text>';
      s += '<text class="chart-lbl" x="' + cx.toFixed(1) + '" y="' + (h - 8) + '" text-anchor="middle">' + esc(p.label) + '</text>';
    });
    s += '</svg>';
    el.innerHTML = s;
  }

  /* items: [{label, value, color?}], donut with HTML legend */
  function renderDonut(el, legendEl, items, centerSub) {
    if (!el) return;
    var total = 0;
    (items || []).forEach(function (it) { total += it.value; });
    if (!items || !items.length || total <= 0) {
      el.innerHTML = '<div class="empty">No data yet.</div>';
      if (legendEl) legendEl.innerHTML = '';
      return;
    }
    var r = 62, c = 2 * Math.PI * r, acc = 0;
    var s = '<svg viewBox="0 0 200 200" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Donut chart">';
    items.forEach(function (it, i) {
      var len = c * it.value / total;
      var col = it.color || PALETTE[i % PALETTE.length];
      s += '<circle cx="100" cy="100" r="' + r + '" fill="none" stroke="' + col +
        '" stroke-width="26" stroke-dasharray="' + len.toFixed(2) + ' ' + (c - len).toFixed(2) +
        '" stroke-dashoffset="' + (-acc).toFixed(2) + '" transform="rotate(-90 100 100)"/>';
      acc += len;
    });
    s += '<text class="chart-center" x="100" y="98" text-anchor="middle">' + fmtMoney0(total) + '</text>';
    s += '<text class="chart-center-sub" x="100" y="115" text-anchor="middle">' + esc(centerSub || '') + '</text>';
    s += '</svg>';
    el.innerHTML = s;

    if (legendEl) {
      var lg = '';
      items.forEach(function (it, i) {
        var pct = Math.round(100 * it.value / total);
        var col = it.color || PALETTE[i % PALETTE.length];
        lg += '<div class="li"><span class="sw" style="background:' + col + '"></span>' +
          '<span class="nm">' + esc(it.label) + '</span>' +
          '<span class="v">' + fmtMoney0(it.value) + '</span>' +
          '<span class="pc">' + pct + '%</span></div>';
      });
      legendEl.innerHTML = lg;
    }
  }

  /* Horizontal stacked bars in HTML.
     rows: [{label, sub, max, segments:[{value, color, title}], right}] */
  function renderHBars(el, rows) {
    if (!el) return;
    if (!rows || !rows.length) {
      el.innerHTML = '<div class="empty">No data yet.</div>';
      return;
    }
    var html = rows.map(function (r) {
      var segs = '';
      r.segments.forEach(function (sg) {
        if (sg.value <= 0) return;
        var pct = Math.max(0.5, 100 * sg.value / (r.max || 1));
        segs += '<span class="hseg" style="width:' + pct.toFixed(2) + '%;background:' + sg.color + ';" title="' + esc(sg.title || '') + '"></span>';
      });
      return '<div class="hrow">' +
        '<div class="hmeta"><span class="hlbl">' + esc(r.label) + '</span>' +
        (r.sub ? '<span class="hsub">' + esc(r.sub) + '</span>' : '') +
        (r.right ? '<span class="hval">' + esc(r.right) + '</span>' : '') + '</div>' +
        '<div class="htrack">' + segs + '</div>' +
        '</div>';
    }).join('');
    el.innerHTML = html;
  }

  /* ---------- simulated document preview ---------- */

  function renderDocPreview(el, e) {
    if (!el) return;
    var d = e.doc || { type: 'receipt', vendor: 'Document', name: 'document.pdf', lines: [] };
    var lines = (d.lines && d.lines.length) ? d.lines : [['Amount', e.amount]];
    var body = '';
    if (d.type === 'affidavit') {
      body = '<div class="dp-aff"><div class="dp-afftitle">Lost / Missing Receipt Affidavit</div>' +
        '<p>I certify that the expense below was incurred for program purposes and that the original receipt is lost or was never received.</p>' +
        '<div class="dp-line"><span>Payee</span><b>' + esc(payeeName(e.payeeId)) + '</b></div>' +
        '<div class="dp-line"><span>Date</span><b>' + fmtDate(e.date) + '</b></div>' +
        '<div class="dp-line"><span>Amount</span><b>' + fmtMoney(e.amount) + '</b></div>' +
        '<div class="dp-line"><span>Purpose</span><b>' + esc(lines[0][0]) + '</b></div>' +
        '<div class="dp-sig">Signed (simulated)</div></div>';
    } else {
      var rows = lines.map(function (ln) {
        return '<div class="dp-line"><span>' + esc(ln[0]) + '</span><b>' + fmtMoney(ln[1]) + '</b></div>';
      }).join('');
      body = '<div class="dp-vendor">' + esc(d.vendor) + '</div>' +
        '<div class="dp-kind">' + (d.type === 'invoice' ? 'INVOICE' : 'RECEIPT') + '</div>' +
        '<div class="dp-date">' + fmtDate(e.date) + '</div>' +
        '<div class="dp-rule"></div>' + rows +
        '<div class="dp-rule"></div>' +
        '<div class="dp-line dp-total"><span>Total</span><b>' + fmtMoney(e.amount) + '</b></div>';
    }
    el.innerHTML = '<div class="docprev"><div class="dp-paper">' + body + '</div>' +
      '<div class="dp-cap">Simulated document preview &middot; ' + esc(d.name) + '</div></div>';
  }

  function payeeName(id) {
    var p = payee(id);
    return p ? p.name : 'Unknown payee';
  }

  /* ---------- exports ---------- */

  function downloadBlob(content, mime, filename) {
    var blob = new Blob([content], { type: mime });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    setTimeout(function () {
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    }, 0);
  }

  function csvCell(v) {
    v = String(v == null ? '' : v);
    if (/[",\r\n]/.test(v)) v = '"' + v.replace(/"/g, '""') + '"';
    return v;
  }

  function exportCsv(rows, filename) {
    var csv = rows.map(function (r) { return r.map(csvCell).join(','); }).join('\r\n');
    downloadBlob(csv, 'text/csv;charset=utf-8', filename);
  }

  /* Excel export: SpreadsheetML 2003 (.xls). Generated in the browser, opens in Excel. */
  function exportExcel(sheetName, header, rows, filename) {
    function xesc(s) {
      return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    }
    function cell(v) {
      if (typeof v === 'number' && isFinite(v)) {
        return '<Cell><Data ss:Type="Number">' + v + '</Data></Cell>';
      }
      return '<Cell><Data ss:Type="String">' + xesc(v) + '</Data></Cell>';
    }
    var xml = '<?xml version="1.0"?>' +
      '<?mso-application progid="Excel.Sheet"?>' +
      '<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet" xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet">' +
      '<Styles><Style ss:ID="hdr"><Font ss:Bold="1"/></Style></Styles>' +
      '<Worksheet ss:Name="' + xesc(sheetName) + '"><Table>' +
      '<Row ss:StyleID="hdr">' + header.map(cell).join('') + '</Row>' +
      rows.map(function (r) { return '<Row>' + r.map(cell).join('') + '</Row>'; }).join('') +
      '</Table></Worksheet></Workbook>';
    downloadBlob(xml, 'application/vnd.ms-excel', filename);
  }

  /* ---------- public API ---------- */

  window.ExpenseApp = {
    STATUS_META: STATUS_META,
    QB_META: QB_META,
    ROLE_META: ROLE_META,
    VERIFY_FIELDS: VERIFY_FIELDS,
    CURRENT_FSO: CURRENT_FSO,
    CURRENT_USER: CURRENT_USER,
    PALETTE: PALETTE,
    getState: getState,
    save: save,
    reset: reset,
    fso: fso,
    project: project,
    fundingSource: fundingSource,
    payee: payee,
    payeeName: payeeName,
    coaItem: coaItem,
    findExpense: findExpense,
    projectsFor: projectsFor,
    fundingFor: fundingFor,
    fundingForProject: fundingForProject,
    payeesFor: payeesFor,
    expensesFor: expensesFor,
    priorSpendTotal: priorSpendTotal,
    fsCommitted: fsCommitted,
    fsApproved: fsApproved,
    fsAvailable: fsAvailable,
    lineSpent: lineSpent,
    addPayee: addPayee,
    submitRequest: submitRequest,
    resubmit: resubmit,
    reviewEdit: reviewEdit,
    approve: approve,
    returnToFso: returnToFso,
    reject: reject,
    markSynced: markSynced,
    addIncome: addIncome,
    pushHist: pushHist,
    initChrome: initChrome,
    showToast: showToast,
    renderBarChart: renderBarChart,
    renderDonut: renderDonut,
    renderHBars: renderHBars,
    renderDocPreview: renderDocPreview,
    exportCsv: exportCsv,
    exportExcel: exportExcel,
    fmtMoney: fmtMoney,
    fmtMoney0: fmtMoney0,
    fmtDate: fmtDate,
    todayIso: todayIso,
    monthKey: monthKey,
    monthLabel: monthLabel,
    monthShort: monthShort,
    lastMonths: lastMonths,
    daysOld: daysOld,
    round2: round2,
    esc: esc
  };
})();
