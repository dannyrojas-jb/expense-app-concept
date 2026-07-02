/* ExpenseFlow (Concept) - shared data layer + UI helpers.
   Pure static demo. All data is sample data stored in localStorage in this browser.
   No external libraries, no network calls. */
(function () {
  'use strict';

  var STORE_KEY = 'expenseflow-concept-demo';
  var SCHEMA_VERSION = 2;

  var CATEGORIES = ['Travel', 'Meals', 'Supplies', 'Software', 'Mileage'];
  var CURRENT_USER = 'Jordan Reyes';
  var COMPANY = 'Acme Field Services';

  var STATUS_META = {
    pending: { label: 'Pending', cls: 'pending' },
    approved: { label: 'Approved', cls: 'approved' },
    rejected: { label: 'Rejected', cls: 'rejected' },
    info: { label: 'Info requested', cls: 'query' }
  };

  var PALETTE = ['#0891b2', '#6366f1', '#059669', '#f59e0b', '#dc2626', '#0e7490'];

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

  /* Last n month keys, oldest first, ending with the current month. */
  function lastMonths(n) {
    var out = [];
    for (var i = n - 1; i >= 0; i--) out.push(monthKey(iso(dateMonthsAgo(i, 1))));
    return out;
  }

  function fmtDate(isoStr) {
    if (!isoStr) return '';
    return parseIso(isoStr).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
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
    var num = 4451;
    var expenses = [];

    /* mk(monthsAgo, day, employee, amount, category, merchant, description,
          status, decideDaysAfter (null = not decided), receiptFilename) */
    function mk(monthsAgo, day, employee, amount, category, merchant, description, status, decideDays, receipt) {
      var created = dateMonthsAgo(monthsAgo, day);
      var e = {
        id: 'exp-' + num,
        num: num,
        employee: employee,
        amount: amount,
        category: category,
        merchant: merchant,
        description: description,
        status: status,
        date: iso(created),
        createdAt: iso(created),
        decidedAt: null,
        receipt: receipt || null,
        comments: []
      };
      if (decideDays != null) e.decidedAt = addDaysClamped(e.createdAt, decideDays);
      num++;
      expenses.push(e);
      return e;
    }

    /* Two months ago */
    mk(2, 4, 'Maya Okafor', 412.50, 'Travel', 'Cedar Ridge Inn', 'Two nights lodging for the county site survey', 'approved', 2, 'lodging-cedar-ridge.pdf');
    mk(2, 7, 'Sam Patel', 58.20, 'Meals', 'Harbor Grill', 'Working lunch, project kickoff with the survey crew', 'approved', 1, 'meals-kickoff.jpg');
    mk(2, 11, 'Jordan Reyes', 129.99, 'Software', 'FieldPlan Tools', 'Monthly seat, field planning software', 'approved', 3, 'fieldplan-apr.pdf');
    mk(2, 15, 'Lena Chen', 84.10, 'Supplies', 'Hartley Supply Co', 'Marking paint, stakes, and flags for the north lot', 'approved', 2, null);
    mk(2, 19, 'Marcus Hall', 96.30, 'Mileage', 'Personal vehicle', 'Site visits, 148 miles at standard rate', 'approved', 4, null);
    var rej = mk(2, 23, 'Maya Okafor', 340.00, 'Travel', 'Regional Air', 'Round trip flight for the vendor audit visit', 'rejected', 3, 'flight-audit.pdf');
    rej.comments.push({
      author: 'Finance Admin', role: 'admin',
      text: 'This was booked outside the approved travel window. Please rebook through the travel portal and resubmit.',
      ts: rej.decidedAt
    });

    /* One month ago */
    mk(1, 3, 'Jordan Reyes', 210.75, 'Travel', 'City Cab Co', 'Airport transfers for the regional conference', 'approved', 2, 'cab-receipts.pdf');
    mk(1, 6, 'Sam Patel', 47.80, 'Meals', "Miller's Diner", 'Team dinner after the late survey night', 'approved', 1, null);
    mk(1, 10, 'Lena Chen', 152.40, 'Supplies', 'Grainger', 'Replacement safety vests for the field team', 'approved', 2, 'vests-invoice.pdf');
    mk(1, 12, 'Marcus Hall', 129.99, 'Software', 'FieldPlan Tools', 'Monthly seat, field planning software', 'approved', 1, 'fieldplan-may.pdf');
    mk(1, 17, 'Maya Okafor', 61.40, 'Mileage', 'Personal vehicle', 'Client site loop, 96 miles at standard rate', 'approved', 3, null);
    var q1 = mk(1, 21, 'Jordan Reyes', 385.00, 'Travel', 'Grand Central Hotel', 'One night, regional operations summit', 'info', null, 'hotel-cardslip.jpg');
    q1.comments.push({
      author: 'Finance Admin', role: 'admin',
      text: 'Can you attach the itemized folio? The card slip alone will not clear the quarterly audit.',
      ts: addDaysClamped(q1.createdAt, 1)
    });
    q1.comments.push({
      author: 'Jordan Reyes', role: 'employee',
      text: 'Sure, the hotel is emailing it over. I will attach it this week.',
      ts: addDaysClamped(q1.createdAt, 2)
    });

    /* This month */
    mk(0, 1, 'Maya Okafor', 96.75, 'Meals', 'Harbor Grill', 'Lunch with the county inspector, permit walkthrough', 'pending', null, 'meals-inspector.jpg');
    mk(0, 1, 'Sam Patel', 289.99, 'Supplies', 'Northern Tool', 'Cordless drill replacement for truck 2', 'pending', null, 'drill-receipt.pdf');
    mk(0, 2, 'Lena Chen', 129.99, 'Software', 'FieldPlan Tools', 'Monthly seat, field planning software', 'approved', 1, 'fieldplan-current.pdf');
    mk(0, 2, 'Marcus Hall', 173.20, 'Travel', 'City Cab Co', 'Client visits, downtown loop', 'pending', null, null);
    mk(0, 2, 'Jordan Reyes', 44.60, 'Mileage', 'Personal vehicle', 'Depot run, 70 miles at standard rate', 'pending', null, null);
    var q2 = mk(0, 2, 'Maya Okafor', 512.00, 'Travel', 'Regional Air', 'Flight for the quarterly field audit', 'info', null, 'flight-q-audit.pdf');
    q2.comments.push({
      author: 'Finance Admin', role: 'admin',
      text: 'Is this economy fare? The amount is above the usual range for this route.',
      ts: addDaysClamped(q2.createdAt, 0)
    });

    return { version: SCHEMA_VERSION, role: 'employee', expenses: expenses };
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

  /* ---------- data operations ---------- */

  function nextNum() {
    var max = 4450;
    getState().expenses.forEach(function (e) { if (e.num > max) max = e.num; });
    return max + 1;
  }

  function addExpense(data) {
    var st = getState();
    var n = nextNum();
    var e = {
      id: 'exp-' + n + '-' + Date.now().toString(36),
      num: n,
      employee: CURRENT_USER,
      amount: Math.round(Number(data.amount) * 100) / 100,
      category: data.category,
      merchant: String(data.merchant || '').trim(),
      description: String(data.description || '').trim(),
      status: 'pending',
      date: data.date,
      createdAt: todayIso(),
      decidedAt: null,
      receipt: data.receipt || null,
      comments: []
    };
    st.expenses.push(e);
    save();
    return e;
  }

  function findExpense(id) {
    var hit = null;
    getState().expenses.forEach(function (e) { if (e.id === id) hit = e; });
    return hit;
  }

  /* action: 'approved' | 'rejected' | 'info'. Comment is stored on the thread. */
  function actOn(id, action, comment) {
    var e = findExpense(id);
    if (!e || !STATUS_META[action]) return null;
    if (comment) {
      e.comments.push({ author: 'Finance Admin', role: 'admin', text: String(comment).trim(), ts: todayIso() });
    }
    e.status = action;
    e.decidedAt = (action === 'approved' || action === 'rejected') ? todayIso() : null;
    save();
    return e;
  }

  /* ---------- shared chrome (top bar, role switch, reset link) ---------- */

  function applyRole(role) {
    document.body.setAttribute('data-role', role);
    var btns = document.querySelectorAll('.roleswitch button');
    for (var i = 0; i < btns.length; i++) {
      btns[i].classList.toggle('on', btns[i].getAttribute('data-role') === role);
    }
  }

  function initChrome(page) {
    var st = getState();

    var links = document.querySelectorAll('.nav a');
    for (var i = 0; i < links.length; i++) {
      links[i].classList.toggle('on', links[i].getAttribute('data-page') === page);
    }

    applyRole(st.role === 'admin' ? 'admin' : 'employee');
    var btns = document.querySelectorAll('.roleswitch button');
    for (var j = 0; j < btns.length; j++) {
      (function (b) {
        b.addEventListener('click', function () {
          st.role = b.getAttribute('data-role') === 'admin' ? 'admin' : 'employee';
          save();
          applyRole(st.role);
          showToast(st.role === 'admin' ? 'Viewing as Finance Admin.' : 'Viewing as Employee.');
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
    /* force a frame so the transition runs on first use */
    window.requestAnimationFrame(function () {
      window.requestAnimationFrame(function () { t.classList.add('show'); });
    });
    if (toastTimer) clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { t.classList.remove('show'); }, 2600);
  }

  /* ---------- SVG charts (no libraries) ---------- */

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

  /* points: [{label, value}] */
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

  /* items: [{label, value}], drawn as a donut plus an HTML legend. */
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
      s += '<circle cx="100" cy="100" r="' + r + '" fill="none" stroke="' + PALETTE[i % PALETTE.length] +
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
        lg += '<div class="li"><span class="sw" style="background:' + PALETTE[i % PALETTE.length] + '"></span>' +
          '<span class="nm">' + esc(it.label) + '</span>' +
          '<span class="v">' + fmtMoney0(it.value) + '</span>' +
          '<span class="pc">' + pct + '%</span></div>';
      });
      legendEl.innerHTML = lg;
    }
  }

  /* ---------- CSV export ---------- */

  function csvCell(v) {
    v = String(v == null ? '' : v);
    if (/[",\r\n]/.test(v)) v = '"' + v.replace(/"/g, '""') + '"';
    return v;
  }

  function exportCsv(rows, filename) {
    var csv = rows.map(function (r) { return r.map(csvCell).join(','); }).join('\r\n');
    var blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
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

  /* ---------- public API ---------- */

  window.ExpenseApp = {
    CATEGORIES: CATEGORIES,
    CURRENT_USER: CURRENT_USER,
    COMPANY: COMPANY,
    STATUS_META: STATUS_META,
    PALETTE: PALETTE,
    getState: getState,
    save: save,
    reset: reset,
    addExpense: addExpense,
    findExpense: findExpense,
    actOn: actOn,
    initChrome: initChrome,
    showToast: showToast,
    renderBarChart: renderBarChart,
    renderDonut: renderDonut,
    exportCsv: exportCsv,
    fmtMoney: fmtMoney,
    fmtMoney0: fmtMoney0,
    fmtDate: fmtDate,
    todayIso: todayIso,
    monthKey: monthKey,
    monthLabel: monthLabel,
    monthShort: monthShort,
    lastMonths: lastMonths,
    esc: esc
  };
})();
