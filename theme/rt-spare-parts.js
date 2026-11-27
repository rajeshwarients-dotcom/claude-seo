/* Rajeshwari Tools \u2014 INGCO spare parts & exploded views hub */
(function () {
  'use strict';
  var root = document.getElementById('rt-sp');
  if (!root) return;

  var D = root.dataset;
  var BASE = D.base;
  var $ = function (s, el) { return (el || root).querySelector(s); };
  var esc = function (s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  };
  var norm = function (s) { return String(s || '').toUpperCase().replace(/[\s\-_.\/]/g, ''); };
  var low = function (s) { return String(s || '').toLowerCase(); };
  var img = function (f, w) { return BASE + f + (w ? '?width=' + w : ''); };
  var money = function (p) {
    var n = parseFloat(p);
    return isNaN(n) ? '' : '\u20b9' + n.toLocaleString('en-IN', { maximumFractionDigits: 0 });
  };

  var els = {
    q: $('#rt-sp-q'), clear: $('.rt-sp__clear'), stats: $('[data-stats]'), cats: $('[data-cats]'),
    list: $('[data-list]'), grid: $('[data-grid]'), hits: $('[data-parthits]'), empty: $('[data-empty]'),
    model: $('[data-model]'), bar: $('[data-bar]'), barCount: $('[data-bar-count]'),
    barGo: $('[data-bar-go]'), barClear: $('[data-bar-clear]')
  };

  var idx = [], byModel = {}, parts = null, partsP = null;
  var state = { q: '', cat: '', model: '', hl: '' };
  var picked = {}; // key -> {m, sp, name}

  /* ---------- data ---------- */
  function loadParts() {
    if (!partsP) {
      partsP = fetch(D.parts).then(function (r) { return r.json(); }).then(function (j) {
        parts = j;
        return j;
      });
    }
    return partsP;
  }

  /* ---------- URL ---------- */
  function readUrl() {
    var u = new URLSearchParams(location.search);
    state.q = u.get('q') || '';
    state.cat = u.get('cat') || '';
    state.model = (u.get('model') || '').toUpperCase();
    state.hl = (u.get('part') || '').toUpperCase();
  }
  function writeUrl(push) {
    var u = new URLSearchParams();
    if (state.model) {
      u.set('model', state.model);
      if (state.hl) u.set('part', state.hl);
    } else {
      if (state.q) u.set('q', state.q);
      if (state.cat) u.set('cat', state.cat);
    }
    var s = u.toString();
    var url = location.pathname + (s ? '?' + s : '');
    if (push) history.pushState(null, '', url);
    else history.replaceState(null, '', url);
  }

  /* ---------- categories ---------- */
  function renderCats() {
    var counts = {};
    idx.forEach(function (m) { counts[m.c] = (counts[m.c] || 0) + 1; });
    var names = Object.keys(counts).sort(function (a, b) {
      if (a === 'Other Tools') return 1;
      if (b === 'Other Tools') return -1;
      return counts[b] - counts[a];
    });
    var h = '<button type="button" class="rt-sp__chip" data-cat="" aria-pressed="' + (!state.cat) + '">All <span>' + idx.length + '</span></button>';
    names.forEach(function (n) {
      h += '<button type="button" class="rt-sp__chip" data-cat="' + esc(n) + '" aria-pressed="' + (state.cat === n) + '">' + esc(n) + ' <span>' + counts[n] + '</span></button>';
    });
    els.cats.innerHTML = h;
  }
  els.cats.addEventListener('click', function (e) {
    var b = e.target.closest('[data-cat]');
    if (!b) return;
    state.cat = b.getAttribute('data-cat');
    els.cats.querySelectorAll('[data-cat]').forEach(function (x) {
      x.setAttribute('aria-pressed', String(x === b));
    });
    writeUrl(false);
    renderList();
  });

  /* ---------- list / search ---------- */
  function scoreModel(m, q, qn) {
    if (!q) return 1;
    var code = norm(m.m);
    if (code === qn) return 100;
    if (code.indexOf(qn) === 0) return 80;
    if (qn.length >= 3 && code.indexOf(qn) > -1) return 60;
    var ql = low(q);
    if (low(m.n).indexOf(ql) > -1) return 40;
    if (ql.length >= 3 && m.t && m.t.indexOf(ql) > -1) return 20;
    return 0;
  }

  function card(m) {
    var thumb = m.img && m.img[0]
      ? '<img src="' + img(m.img[0], 360) + '" alt="INGCO ' + esc(m.m) + ' exploded view" loading="lazy" width="180" height="140">'
      : '<span class="rt-sp__noimg">No drawing</span>';
    return '<a class="rt-sp__card" href="?model=' + encodeURIComponent(m.m) + '" data-open="' + esc(m.m) + '">' +
      '<span class="rt-sp__thumb">' + thumb + '</span>' +
      '<span class="rt-sp__cbody"><b class="rt-sp__code">' + esc(m.m) + '</b>' +
      '<span class="rt-sp__name">' + esc(m.n) + '</span>' +
      '<span class="rt-sp__meta">' + m.k + ' parts' + (m.s ? ' \u00b7 <em>' + m.s + ' available online</em>' : '') + '</span></span></a>';
  }

  function partHitsFor(q, qn) {
    if (!parts || q.length < 3) return [];
    var ql = low(q), out = [];
    var spMatch = /SP/.test(qn);
    for (var i = 0; i < idx.length && out.length < 40; i++) {
      var M = idx[i];
      if (state.cat && M.c !== state.cat) continue;
      var P = parts[M.m];
      if (!P) continue;
      for (var j = 0; j < P.parts.length && out.length < 40; j++) {
        var p = P.parts[j];
        var hit = (spMatch && norm(p[1]).indexOf(qn) > -1) ||
          (qn.length >= 4 && norm(p[2]).indexOf(qn) > -1) ||
          (!spMatch && low(p[3]).indexOf(ql) > -1);
        if (hit) out.push({ M: M, p: p });
      }
    }
    return out;
  }

  var listTimer;
  function renderList() {
    var q = state.q.trim(), qn = norm(q);
    var rows = idx
      .filter(function (m) { return !state.cat || m.c === state.cat; })
      .map(function (m) { return { m: m, s: scoreModel(m, q, qn) }; })
      .filter(function (r) { return r.s > 0; });
    if (q) rows.sort(function (a, b) { return b.s - a.s || a.m.m.localeCompare(b.m.m); });
    els.grid.innerHTML = rows.map(function (r) { return card(r.m); }).join('');

    var hits = partHitsFor(q, qn);
    if (hits.length) {
      els.hits.innerHTML = '<h2 class="rt-sp__h">Matching parts <span>' + hits.length + (hits.length === 40 ? '+' : '') + '</span></h2><ul>' +
        hits.map(function (h) {
          return '<li><a href="?model=' + encodeURIComponent(h.M.m) + '&part=' + encodeURIComponent(h.p[1]) + '" data-open="' + esc(h.M.m) + '" data-hl="' + esc(h.p[1]) + '">' +
            '<b>' + esc(h.p[3]) + '</b><code>' + esc(h.p[1]) + '</code><span>' + esc(h.M.m) + ' \u00b7 ' + esc(h.M.n) + '</span>' +
            (h.p[6] ? '<em>' + money(h.p[7]) + '</em>' : '') + '</a></li>';
        }).join('') + '</ul>' +
        (rows.length ? '<h2 class="rt-sp__h">Models <span>' + rows.length + '</span></h2>' : '');
      els.hits.hidden = false;
    } else {
      els.hits.hidden = true;
      els.hits.innerHTML = '';
    }
    els.empty.hidden = rows.length > 0 || hits.length > 0;
    els.clear.hidden = !q;
  }

  els.q.addEventListener('input', function () {
    state.q = els.q.value;
    if (state.q.trim().length >= 3) loadParts().then(function () { if (!state.model) renderList(); });
    clearTimeout(listTimer);
    listTimer = setTimeout(function () {
      if (state.model) closeModel(false);
      writeUrl(false);
      renderList();
    }, 120);
  });
  els.q.addEventListener('keydown', function (e) {
    if (e.key !== 'Enter') return;
    e.preventDefault();
    var qn = norm(els.q.value);
    var sp = qn.match(/^(.+?)SP(\w+)$/);
    var target = null, hl = '';
    if (sp && byModel[sp[1]]) { target = byModel[sp[1]]; hl = els.q.value.trim().toUpperCase().replace(/\s+/g, ''); }
    else if (byModel[qn]) target = byModel[qn];
    else {
      var first = els.grid.querySelector('[data-open]');
      if (first && els.grid.children.length === 1) target = byModel[norm(first.getAttribute('data-open'))];
    }
    if (target) openModel(target.m, hl, true);
    else els.q.blur();
  });
  els.clear.addEventListener('click', function () {
    els.q.value = ''; state.q = '';
    writeUrl(false); renderList(); els.q.focus();
  });

  root.addEventListener('click', function (e) {
    var a = e.target.closest('[data-open]');
    if (!a || e.metaKey || e.ctrlKey) return;
    e.preventDefault();
    openModel(a.getAttribute('data-open'), a.getAttribute('data-hl') || '', true);
  });

  /* ---------- model view ---------- */
  function openModel(code, hl, push) {
    var M = byModel[norm(code)];
    if (!M) return;
    state.model = M.m; state.hl = hl || '';
    writeUrl(push);
    els.list.hidden = true; els.cats.hidden = true;
    els.model.hidden = false;
    els.model.innerHTML = '<p class="rt-sp__loading">Loading ' + esc(M.m) + '&hellip;</p>';
    window.scrollTo({ top: root.getBoundingClientRect().top + window.pageYOffset - 80 });
    loadParts().then(function () { renderModel(M); }).catch(function () {
      els.model.innerHTML = '<p class="rt-sp__loading">Could not load parts. Please refresh the page.</p>';
    });
  }
  function closeModel(push) {
    state.model = ''; state.hl = '';
    if (push !== false) writeUrl(true);
    els.model.hidden = true; els.model.innerHTML = '';
    els.list.hidden = false; els.cats.hidden = false;
  }

  function renderModel(M) {
    var P = parts[M.m] || { parts: [], img: [] };
    var imgs = P.img || [];
    var wearN = P.parts.filter(function (p) { return p[5]; }).length;
    var figs = imgs.map(function (f, i) {
      var d = (P.dims && P.dims[i]) || [1200, 900];
      return '<figure class="rt-sp__fig"><button type="button" class="rt-sp__zoombtn" data-zoom="' + esc(f) + '" aria-label="Zoom drawing">' +
        '<img src="' + img(f, 1000) + '" srcset="' + img(f, 600) + ' 600w, ' + img(f, 1000) + ' 1000w, ' + img(f, 1600) + ' 1600w" sizes="(min-width: 990px) 55vw, 100vw" alt="INGCO ' + esc(M.m) + ' exploded view' + (imgs.length > 1 ? ' ' + (i + 1) : '') + '" width="' + d[0] + '" height="' + d[1] + '">' +
        '<span class="rt-sp__zoomhint">Tap to zoom</span></button>' +
        (imgs.length > 1 ? '<figcaption>Drawing ' + (i + 1) + ' of ' + imgs.length + '</figcaption>' : '') + '</figure>';
    }).join('') || '<p class="rt-sp__noimg">Drawing not available for this model.</p>';

    var rows = P.parts.map(function (p) {
      var key = M.m + '|' + p[1];
      var buy = p[6]
        ? '<a class="rt-sp__buy" href="/products/' + encodeURIComponent(p[6]) + '">' + (money(p[7]) || 'Buy') + '<small>Buy</small></a>'
        : '<button type="button" class="rt-sp__ask" data-ask="' + esc(key) + '">Ask price</button>';
      return '<tr data-row="' + esc(p[1]) + '" data-s="' + esc(low(p[3] + ' ' + p[1] + ' ' + p[2] + ' #' + p[0])) + '"' + (p[5] ? ' data-wear' : '') + '>' +
        '<td class="rt-sp__ck"><input type="checkbox" aria-label="Select ' + esc(p[3]) + '" data-pick="' + esc(key) + '" data-name="' + esc(p[3]) + '"' + (picked[key] ? ' checked' : '') + '></td>' +
        '<td class="rt-sp__no"><span>' + esc(p[0]) + '</span></td>' +
        '<td class="rt-sp__pn"><b>' + esc(p[3]) + '</b>' + (p[5] ? '<i class="rt-sp__wear">Wear part</i>' : '') +
        '<code>' + esc(p[1]) + '</code>' + (p[2] ? '<small>INGCO no. ' + esc(p[2]) + '</small>' : '') + '</td>' +
        '<td class="rt-sp__qty">' + (p[4] > 1 ? p[4] + ' pcs' : '1 pc') + '</td>' +
        '<td class="rt-sp__act">' + buy + '</td></tr>';
    }).join('');

    els.model.innerHTML =
      '<button type="button" class="rt-sp__back" data-back>\u2190 All models</button>' +
      '<div class="rt-sp__mhead"><div><p class="rt-sp__kicker">' + esc(M.c) + '</p><h2 class="rt-sp__mtitle">INGCO ' + esc(M.m) + '</h2>' +
      '<p class="rt-sp__mname">' + esc(M.n) + ' \u00b7 ' + P.parts.length + ' parts' + (wearN ? ' \u00b7 ' + wearN + ' wear parts' : '') + '</p></div>' +
      (M.p ? '<a class="button button--secondary rt-sp__tool" href="/products/' + encodeURIComponent(M.p) + '">View this tool</a>' : '') + '</div>' +
      '<div class="rt-sp__layout"><div class="rt-sp__draw">' + figs + '</div>' +
      '<div class="rt-sp__parts"><div class="rt-sp__ptools">' +
      '<input type="search" placeholder="Filter by number, name or code" data-pfilter aria-label="Filter parts">' +
      (wearN ? '<label class="rt-sp__wtoggle"><input type="checkbox" data-wonly> Wear parts only</label>' : '') + '</div>' +
      '<p class="rt-sp__tip">Match the number on the drawing with <b>No.</b> below. Tick the parts you need and send one WhatsApp enquiry.</p>' +
      '<div class="rt-sp__tablewrap"><table class="rt-sp__table"><thead><tr><th></th><th>No.</th><th>Part</th><th>Pack</th><th></th></tr></thead><tbody>' + rows + '</tbody></table></div></div></div>';

    document.title = 'INGCO ' + M.m + ' spare parts & exploded view | ' + document.title.split('|').pop().trim();
    if (state.hl) {
      var r = els.model.querySelector('[data-row="' + CSS.escape(state.hl) + '"]');
      if (r) {
        r.classList.add('is-hl');
        setTimeout(function () { r.scrollIntoView({ block: 'center', behavior: 'smooth' }); }, 150);
      }
    }
  }

  els.model.addEventListener('click', function (e) {
    if (e.target.closest('[data-back]')) { closeModel(true); renderList(); return; }
    var z = e.target.closest('[data-zoom]');
    if (z) { openZoom(z.getAttribute('data-zoom')); return; }
    var ask = e.target.closest('[data-ask]');
    if (ask) {
      var tr = ask.closest('tr'), ck = tr.querySelector('[data-pick]');
      window.open(waLink([{ key: ask.getAttribute('data-ask'), name: ck.getAttribute('data-name') }]), '_blank', 'noopener');
      return;
    }
    var no = e.target.closest('.rt-sp__no');
    if (no) { var c = no.parentNode.querySelector('[data-pick]'); c.click(); }
  });
  els.model.addEventListener('change', function (e) {
    var t = e.target;
    if (t.matches('[data-pick]')) {
      var k = t.getAttribute('data-pick');
      if (t.checked) picked[k] = { key: k, name: t.getAttribute('data-name') };
      else delete picked[k];
      t.closest('tr').classList.toggle('is-picked', t.checked);
      renderBar();
    } else if (t.matches('[data-wonly]')) filterParts();
  });
  els.model.addEventListener('input', function (e) { if (e.target.matches('[data-pfilter]')) filterParts(); });
  function filterParts() {
    var f = low(($('[data-pfilter]', els.model) || {}).value || '').trim();
    var w = ($('[data-wonly]', els.model) || {}).checked;
    els.model.querySelectorAll('tbody tr').forEach(function (tr) {
      var ok = !w || tr.hasAttribute('data-wear');
      if (ok && f) {
        ok = /^\d+$/.test(f)
          ? tr.querySelector('.rt-sp__no span').textContent.trim() === f
          : tr.getAttribute('data-s').indexOf(f) > -1;
      }
      tr.hidden = !ok;
    });
  }

  /* ---------- enquiry bar ---------- */
  function waLink(list) {
    var lines = list.map(function (x) {
      var b = x.key.split('|');
      return '\u2022 ' + b[1] + ' \u2013 ' + x.name + ' (' + b[0] + ')';
    });
    var text = 'Hi Rajeshwari Tools, please share price & availability for these INGCO spare parts:\n' +
      lines.join('\n') + '\nQty: 1 each\n' + location.origin + location.pathname;
    if (D.wa) return 'https://wa.me/' + D.wa + '?text=' + encodeURIComponent(text);
    return D.phone ? 'tel:' + D.phone : '/pages/contact';
  }
  function renderBar() {
    var list = Object.keys(picked).map(function (k) { return picked[k]; });
    els.bar.hidden = !list.length;
    document.body.classList.toggle('rt-sp-bar-on', !!list.length);
    if (!list.length) return;
    els.barCount.textContent = list.length + (list.length > 1 ? ' parts' : ' part') + ' selected';
    els.barGo.href = waLink(list);
  }
  els.barClear.addEventListener('click', function () {
    picked = {};
    els.model.querySelectorAll('[data-pick]:checked').forEach(function (c) { c.checked = false; c.closest('tr').classList.remove('is-picked'); });
    renderBar();
  });

  /* ---------- zoom viewer ---------- */
  var zv;
  function openZoom(file) {
    if (!zv) {
      zv = document.createElement('div');
      zv.className = 'rt-sp-zoom';
      zv.innerHTML = '<div class="rt-sp-zoom__stage"><img alt=""></div>' +
        '<div class="rt-sp-zoom__ctl"><button type="button" data-z="-" aria-label="Zoom out">\u2212</button><button type="button" data-z="fit">Fit</button><button type="button" data-z="+" aria-label="Zoom in">+</button><button type="button" data-z="x" aria-label="Close">\u2715</button></div>';
      document.body.appendChild(zv);
      var stage = zv.firstChild, im = stage.firstChild, sc = 1, fitW = 0, pts = {}, d0 = 0, s0 = 1, lastTap = 0;
      var apply = function (ns, cx, cy) {
        ns = Math.max(1, Math.min(6, ns));
        var r = stage.getBoundingClientRect();
        cx = cx == null ? r.width / 2 : cx - r.left; cy = cy == null ? r.height / 2 : cy - r.top;
        var fx = (stage.scrollLeft + cx) / (fitW * sc), fy = (stage.scrollTop + cy) / im.offsetHeight;
        sc = ns; im.style.width = fitW * sc + 'px';
        stage.scrollLeft = fx * fitW * sc - cx; stage.scrollTop = fy * im.offsetHeight - cy;
      };
      zv._fit = function () {
        var r = stage.getBoundingClientRect(), nw = im.naturalWidth || 1600, nh = im.naturalHeight || 1200;
        fitW = Math.min(r.width, r.height * nw / nh); sc = 1; im.style.width = fitW + 'px';
      };
      im.addEventListener('load', zv._fit);
      window.addEventListener('resize', function () { if (zv.classList.contains('is-open')) zv._fit(); });
      zv.addEventListener('click', function (e) {
        var b = e.target.closest('[data-z]');
        if (!b) return;
        var z = b.getAttribute('data-z');
        if (z === 'x') closeZoom();
        else if (z === 'fit') zv._fit();
        else apply(sc * (z === '+' ? 1.6 : 0.625));
      });
      stage.addEventListener('wheel', function (e) {
        if (!e.ctrlKey && Math.abs(e.deltaY) < 1) return;
        e.preventDefault(); apply(sc * (e.deltaY < 0 ? 1.15 : 0.87), e.clientX, e.clientY);
      }, { passive: false });
      stage.addEventListener('pointerdown', function (e) {
        pts[e.pointerId] = { x: e.clientX, y: e.clientY };
        var k = Object.keys(pts);
        if (k.length === 2) { var a = pts[k[0]], b = pts[k[1]]; d0 = Math.hypot(a.x - b.x, a.y - b.y); s0 = sc; }
        if (e.pointerType !== 'mouse' && k.length === 1) {
          var now = Date.now();
          if (now - lastTap < 300) apply(sc > 1.2 ? 1 : 2.5, e.clientX, e.clientY);
          lastTap = now;
        }
        stage.setPointerCapture(e.pointerId);
      });
      stage.addEventListener('pointermove', function (e) {
        var p = pts[e.pointerId];
        if (!p) return;
        var k = Object.keys(pts);
        if (k.length === 2) {
          pts[e.pointerId] = { x: e.clientX, y: e.clientY };
          var a = pts[k[0]], b = pts[k[1]];
          apply(s0 * Math.hypot(a.x - b.x, a.y - b.y) / (d0 || 1), (a.x + b.x) / 2, (a.y + b.y) / 2);
        } else {
          stage.scrollLeft -= e.clientX - p.x; stage.scrollTop -= e.clientY - p.y;
          pts[e.pointerId] = { x: e.clientX, y: e.clientY };
        }
      });
      var up = function (e) { delete pts[e.pointerId]; };
      stage.addEventListener('pointerup', up); stage.addEventListener('pointercancel', up);
      stage.addEventListener('dblclick', function (e) { apply(sc > 1.2 ? 1 : 2.5, e.clientX, e.clientY); });
      document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && zv.classList.contains('is-open')) closeZoom(); });
    }
    var im2 = zv.querySelector('img');
    im2.src = img(file, 2400);
    im2.alt = 'Zoomed exploded view';
    zv.classList.add('is-open');
    document.documentElement.style.overflow = 'hidden';
    if (im2.complete) zv._fit();
    history.pushState({ rtZoom: 1 }, '', location.href);
  }
  function closeZoom(fromPop) {
    if (!zv || !zv.classList.contains('is-open')) return;
    zv.classList.remove('is-open');
    document.documentElement.style.overflow = '';
    if (!fromPop && history.state && history.state.rtZoom) history.back();
  }

  window.addEventListener('popstate', function () {
    if (zv && zv.classList.contains('is-open')) { closeZoom(true); return; }
    readUrl();
    els.q.value = state.q;
    if (state.model && byModel[norm(state.model)]) openModel(state.model, state.hl, false);
    else { closeModel(false); renderCats(); renderList(); }
  });

  /* ---------- boot ---------- */
  readUrl();
  els.q.value = state.q;
  fetch(D.index).then(function (r) { return r.json(); }).then(function (j) {
    idx = j.sort(function (a, b) { return a.m.localeCompare(b.m); });
    idx.forEach(function (m) { byModel[norm(m.m)] = m; });
    var total = idx.reduce(function (s, m) { return s + m.k; }, 0);
    var sold = idx.reduce(function (s, m) { return s + (m.s || 0); }, 0);
    els.stats.innerHTML = '<b>' + idx.length + '</b> tool models \u00b7 <b>' + total.toLocaleString('en-IN') + '</b> parts' + (sold ? ' \u00b7 <b>' + sold + '</b> parts available online' : '');
    renderCats();
    if (state.model && byModel[norm(state.model)]) openModel(state.model, state.hl, false);
    else renderList();
    if (state.q.length >= 3) loadParts().then(function () { if (!state.model) renderList(); });
  }).catch(function () {
    els.stats.textContent = 'Could not load the parts catalogue. Please refresh, or WhatsApp us your tool model.';
  });
})();
