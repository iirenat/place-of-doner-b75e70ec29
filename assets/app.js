/* Place of Döner – Speisekarte. Rendert data/menu.json. Keine externen Anfragen. */
(function () {
  'use strict';
  var cfg = JSON.parse(document.getElementById('cfg').textContent);
  var root = document.getElementById('menu-root');
  var chipsEl = document.getElementById('chips');
  var q = document.getElementById('q');
  var vegBox = document.getElementById('vegonly');
  var dlg = document.getElementById('dlg');
  var byId = {};
  var codesMode = cfg.allergens && cfg.allergens.mode === 'codes';

  function h(tag, attrs) {
    var el = document.createElement(tag);
    if (attrs) for (var k in attrs) {
      if (attrs[k] === false || attrs[k] == null) continue;
      if (k === 'class') el.className = attrs[k]; else el.setAttribute(k, attrs[k]);
    }
    for (var i = 2; i < arguments.length; i++) {
      var c = arguments[i];
      if (c == null || c === false) continue;
      el.appendChild(typeof c === 'string' ? document.createTextNode(c) : c);
    }
    return el;
  }
  function norm(s) {
    return String(s).toLowerCase().replace(/ä/g, 'a').replace(/ö/g, 'o').replace(/ü/g, 'u').replace(/ß/g, 'ss');
  }
  function num(p) { var m = String(p).replace(/\./g, '').match(/(\d+)(?:,(\d+))?/); return m ? parseFloat(m[1] + '.' + (m[2] || '0')) : NaN; }

  /* ---------- Öffnungszeiten: "Jetzt geöffnet" ---------- */
  var DAYS = ['mo', 'di', 'mi', 'do', 'fr', 'sa', 'so'];
  function berlinNow() {
    var parts = new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Berlin', weekday: 'short', hour: '2-digit', minute: '2-digit', hour12: false }).formatToParts(new Date());
    var o = {}; parts.forEach(function (p) { o[p.type] = p.value; });
    var wd = { Mon: 0, Tue: 1, Wed: 2, Thu: 3, Fri: 4, Sat: 5, Sun: 6 }[o.weekday];
    return { day: wd, min: (parseInt(o.hour, 10) % 24) * 60 + parseInt(o.minute, 10) };
  }
  function toMin(t) { var a = t.split(':'); return parseInt(a[0], 10) * 60 + parseInt(a[1], 10); }
  function openState() {
    if (!cfg.hours) return null;
    var n = berlinNow(), res = { open: false, until: null };
    [0, -1].forEach(function (off) {
      var d = (n.day + off + 7) % 7, spans = cfg.hours[DAYS[d]] || [];
      spans.forEach(function (s) {
        var a = toMin(s[0]), b = toMin(s[1]); if (b <= a) b += 1440;
        var t = n.min + (off === -1 ? 1440 : 0);
        if (t >= a && t < b) { res.open = true; res.until = s[1]; }
      });
    });
    return res;
  }
  function paintOpen() {
    var st = openState(), el = document.getElementById('now');
    if (!el) return;
    if (!st) { el.hidden = true; return; }
    el.hidden = false;
    el.className = 'now ' + (st.open ? 'open' : 'closed');
    el.lastChild.textContent = st.open ? 'Jetzt geöffnet · bis ' + st.until + ' Uhr' : 'Jetzt geschlossen';
    var rows = document.querySelectorAll('tr[data-day]');
    var today = DAYS[berlinNow().day];
    [].forEach.call(rows, function (r) { r.classList.toggle('today', r.getAttribute('data-day') === today); });
  }

  /* ---------- Karte ---------- */
  function photo(d, cls, w, hgt) {
    var box = h('span', { class: 'ph ' + (cls || ''), 'aria-hidden': d.photo ? false : 'true' });
    if (d.photo) box.appendChild(h('img', { src: d.photo, alt: d.photoAlt || d.name, loading: 'lazy', decoding: 'async', width: w, height: hgt }));
    return box;
  }
  function lowest(d) {
    if (d.sizes && d.sizes.length) {
      var v = d.sizes.map(function (s) { return num(s.price); }).filter(isFinite);
      if (v.length) { var m = Math.min.apply(null, v); return d.sizes.filter(function (s) { return num(s.price) === m; })[0].price; }
    }
    return d.price;
  }
  function badges(d) {
    var a = [];
    if (d.recommended) a.push(h('span', { class: 'bd rec' }, 'Empfehlung'));
    if (d.vegetarian) a.push(h('span', { class: 'bd veg' }, 'Vegetarisch'));
    return a.length ? h.apply(null, ['span', { class: 'bds' }].concat(a)) : null;
  }
  function codes(d) {
    if (!codesMode || !d.allergens || !d.allergens.length) return null;
    return h.apply(null, ['span', { class: 'al', 'aria-label': 'Allergene: ' + d.allergens.join(', ') }].concat(d.allergens.map(function (c) { return h('b', null, c); })));
  }
  function card(d) {
    var hasSizes = d.sizes && d.sizes.length;
    var a = h('a', { class: 'dish', id: 'dish-' + d.id, href: '#' + d.id, 'data-veg': d.vegetarian ? '1' : '0',
      'data-s': norm([d.nr, d.name, d.description].join(' ')) },
      photo(d, '', 400, 400),
      h('span', { class: 'body' }, h('span', { class: 'nrs' }, 'Nr. ' + d.nr), h('h3', null, d.name), h('p', null, d.description), badges(d), codes(d)),
      h('span', { class: 'pr' }, (hasSizes ? 'ab ' : '') + lowest(d), hasSizes ? h('small', null, d.sizes.length + ' Größen') : null));
    return a;
  }
  function render(menu) {
    root.textContent = '';
    if (menu.demo) {
      document.getElementById('demo').hidden = false;
    }
    chipsEl.textContent = '';
    menu.categories.forEach(function (c) {
      chipsEl.appendChild(h('a', { href: '#cat-' + c.id }, c.name));
      var sec = h('section', { class: 'sec', id: 'cat-' + c.id, 'aria-labelledby': 'h-' + c.id }, h('h2', { id: 'h-' + c.id }, c.name));
      c.dishes.forEach(function (d) { d._cat = c; byId[d.id] = d; sec.appendChild(card(d)); });
      root.appendChild(sec);
    });
    root.appendChild(h('div', { class: 'empty', id: 'empty', role: 'status' }, 'Nichts gefunden'));
    window.__menu = menu;
    if (codesMode && cfg.allergens.legend) {
      var dl = h('dl');
      Object.keys(cfg.allergens.legend).forEach(function (k) { dl.appendChild(h('dt', null, k)); dl.appendChild(h('dd', null, cfg.allergens.legend[k])); });
      document.getElementById('legend').appendChild(h('div', { class: 'legend' }, h('h2', null, 'Allergene und Zusatzstoffe'), dl));
    }
    chipsEl.appendChild(h('a', { href: '#kontakt' }, 'Kontakt'));
    filter(); spy(); route(); pushed = false;
  }

  /* ---------- Suche / vegetarisch ---------- */
  function filter() {
    var words = norm(q.value).split(/\s+/).filter(Boolean), veg = vegBox.checked, n = 0;
    [].forEach.call(document.querySelectorAll('.dish'), function (el) {
      var s = el.getAttribute('data-s');
      var ok = words.every(function (w) { return s.indexOf(w) > -1; }) && (!veg || el.getAttribute('data-veg') === '1');
      el.classList.toggle('hide', !ok); if (ok) n++;
    });
    [].forEach.call(document.querySelectorAll('.sec'), function (s) { s.classList.toggle('hide', !s.querySelector('.dish:not(.hide)')); });
    var e = document.getElementById('empty'); if (e) e.classList.toggle('show', n === 0);
  }
  q.addEventListener('input', filter);
  vegBox.addEventListener('change', filter);

  /* ---------- aktive Kategorie ---------- */
  function spy() {
    var cur = null;
    [].forEach.call(document.querySelectorAll('.sec'), function (s) { if (s.getBoundingClientRect().top <= 170) cur = s.id; });
    [].forEach.call(chipsEl.querySelectorAll('a'), function (a) {
      var on = a.getAttribute('href') === '#' + cur;
      a.classList.toggle('on', on);
      if (on) a.setAttribute('aria-current', 'true'); else a.removeAttribute('aria-current');
      if (on && chipsEl.scrollWidth > chipsEl.clientWidth) chipsEl.scrollLeft = a.offsetLeft - chipsEl.clientWidth / 2 + a.clientWidth / 2;
    });
  }
  window.addEventListener('scroll', spy, { passive: true });

  /* ---------- Gericht-Dialog ---------- */
  function block(title, rows) {
    return h('div', { class: 'blk' }, h('h3', null, title), h.apply(null, ['ul', null].concat(rows)));
  }
  function row(l, r) { return h('li', null, h('span', null, l), h('span', null, r || '')); }
  function fill(d) {
    var body = document.getElementById('dlg-body');
    body.textContent = '';
    body.appendChild(h('div', { class: 'sh-cat' }, 'Nr. ' + d.nr + ' · ' + d._cat.name));
    var hasSz = d.sizes && d.sizes.length;
    body.appendChild(h('div', { class: 'sh-head' }, h('h2', { id: 'dlg-title' }, d.name), h('div', { class: 'sh-price' }, (hasSz ? 'ab ' : '') + lowest(d))));
    var b = badges(d); if (b) body.appendChild(b);
    body.appendChild(photo(d, 'sh-ph', 800, 600));
    var hasIng = d.ingredients && d.ingredients.length;
    if (!hasIng) body.appendChild(h('p', null, d.description));
    if (hasIng) body.appendChild(block('Zutaten', d.ingredients.map(function (x) { return row(x); })));
    if (d.sizes && d.sizes.length) body.appendChild(block('Größen', d.sizes.map(function (s) { return row(s.label, s.price); })));
    var ex = (d.extras || []).concat(d._cat.extras || []);
    if (ex.length) body.appendChild(block('Extras', ex.map(function (e) { return row(e.name, e.price ? '+ ' + e.price : ''); })));
    var sc = window.__menu.sauces || [];
    if (d.sauces && sc.length) body.appendChild(block('Soßen', sc.map(function (s) { return row(s.name, s.price ? '+ ' + s.price : ''); })));
    if (codesMode) {
      if (d.allergens && d.allergens.length) body.appendChild(block('Allergene', d.allergens.map(function (c) { return row(c + ' – ' + (cfg.allergens.legend[c] || '')); })));
    } else if (cfg.allergens && cfg.allergens.note) {
      body.appendChild(h('p', { class: 'hint' }, cfg.allergens.note));
    }
    body.scrollTop = 0;
  }
  var pushed = false;
  function route() {
    var id = location.hash.slice(1), d = byId[id];
    if (d) {
      fill(d);
      if (!dlg.open) { dlg.showModal(); document.body.classList.add('lock'); pushed = true; }
      dlg.setAttribute('aria-labelledby', 'dlg-title');
      document.getElementById('dlg-close').focus();
    } else if (dlg.open) { pushed = false; dlg.close(); }
  }
  window.addEventListener('hashchange', route);
  dlg.addEventListener('close', function () {
    document.body.classList.remove('lock');
    if (byId[location.hash.slice(1)]) {
      if (pushed && history.length > 1) { pushed = false; history.back(); }
      else history.replaceState(null, '', location.pathname + location.search + '#menu');
    }
    var el = document.getElementById('dish-' + (window.__last || ''));
    if (el) el.focus({ preventScroll: true });
  });
  dlg.addEventListener('click', function (e) { if (e.target === dlg || e.target.classList.contains('ov')) dlg.close(); });
  [].forEach.call(document.querySelectorAll('[data-close]'), function (b) { b.addEventListener('click', function () { dlg.close(); }); });
  root.addEventListener('click', function (e) { var a = e.target.closest && e.target.closest('.dish'); if (a) window.__last = a.id.slice(5); });

  /* ---------- Start ---------- */
  paintOpen(); setInterval(paintOpen, 60000);
  fetch('data/menu.json', { cache: 'no-cache' }).then(function (r) { if (!r.ok) throw new Error(r.status); return r.json(); }).then(render).catch(function () {
    root.textContent = '';
    root.appendChild(h('div', { class: 'err', role: 'alert' }, 'Die Speisekarte konnte gerade nicht geladen werden. Bitte rufen Sie uns an: ', h('a', { href: 'tel:' + cfg.phone.tel }, cfg.phone.display)));
  });
})();
