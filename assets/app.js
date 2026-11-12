/* Place of Döner – Speisekarte. Rendert data/menu.json (+ data/i18n.json für EN/TR/UA). Keine externen Anfragen. */
(function () {
  'use strict';
  var cfg = JSON.parse(document.getElementById('cfg').textContent);
  var root = document.getElementById('menu-root');
  var chipsEl = document.getElementById('chips');
  var q = document.getElementById('q');
  var vegBox = document.getElementById('vegonly');
  var dlg = document.getElementById('dlg');
  var byId = {}, MENU = null, I18N = { ui: {}, categories: {}, dishes: {}, allergens: {} };
  var codesMode = cfg.allergens && cfg.allergens.mode === 'codes';
  var LANGS = ['de', 'en', 'tr', 'uk'];
  var lang = 'de';
  try { var st = localStorage.getItem('lang'); if (LANGS.indexOf(st) > -1) lang = st; } catch (e) {}
  try { var ql = new URLSearchParams(location.search).get('lang'); if (LANGS.indexOf(ql) > -1) lang = ql; } catch (e) {}

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
    return String(s).toLowerCase().replace(/ä/g, 'a').replace(/ö/g, 'o').replace(/ü/g, 'u').replace(/ß/g, 'ss').replace(/ı/g, 'i').replace(/ş/g, 's').replace(/ğ/g, 'g').replace(/ç/g, 'c');
  }
  function num(p) { var m = String(p).replace(/\./g, '').match(/(\d+)(?:,(\d+))?/); return m ? parseFloat(m[1] + '.' + (m[2] || '0')) : NaN; }

  /* ---------- Übersetzung ---------- */
  function t(key, vars) {
    var e = I18N.ui[key], s = (e && (e[lang] || e.de)) || key;
    if (vars) for (var k in vars) s = s.replace('{' + k + '}', vars[k]);
    return s;
  }
  function dt(d, field) {
    var x = lang !== 'de' && I18N.dishes[d.id] && I18N.dishes[d.id][lang];
    return (x && x[field]) || d[field];
  }
  function applyStatic() {
    document.documentElement.setAttribute('lang', lang);
    [].forEach.call(document.querySelectorAll('[data-i]'), function (el) {
      if (!el.hasAttribute('data-de')) el.setAttribute('data-de', el.textContent);
      var e = I18N.ui[el.getAttribute('data-i')];
      el.textContent = (lang !== 'de' && e && e[lang]) || el.getAttribute('data-de');
    });
    [].forEach.call(document.querySelectorAll('[data-i-ph]'), function (el) { el.placeholder = t(el.getAttribute('data-i-ph')); });
    [].forEach.call(document.querySelectorAll('[data-i-aria]'), function (el) { el.setAttribute('aria-label', t(el.getAttribute('data-i-aria'))); });
    [].forEach.call(document.querySelectorAll('.lb'), function (b) { b.setAttribute('aria-pressed', b.getAttribute('data-lang') === lang ? 'true' : 'false'); });
  }
  function setLang(l) {
    lang = l; try { localStorage.setItem('lang', l); } catch (e) {}
    applyStatic(); paintOpen();
    if (MENU) { var keep = q.value; renderMenu(); q.value = keep; filter(); spy(); }
    var id = location.hash.slice(1); if (dlg.open && byId[id]) fill(byId[id]);
  }
  [].forEach.call(document.querySelectorAll('.lb'), function (b) { b.addEventListener('click', function () { setLang(b.getAttribute('data-lang')); }); });

  /* ---------- Öffnungszeiten: "Jetzt geöffnet" ---------- */
  var DAYS = ['mo', 'di', 'mi', 'do', 'fr', 'sa', 'so'];
  function berlinNow() {
    var parts = new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Berlin', weekday: 'short', hour: '2-digit', minute: '2-digit', hour12: false }).formatToParts(new Date());
    var o = {}; parts.forEach(function (p) { o[p.type] = p.value; });
    var wd = { Mon: 0, Tue: 1, Wed: 2, Thu: 3, Fri: 4, Sat: 5, Sun: 6 }[o.weekday];
    return { day: wd, min: (parseInt(o.hour, 10) % 24) * 60 + parseInt(o.minute, 10) };
  }
  function toMin(x) { var a = x.split(':'); return parseInt(a[0], 10) * 60 + parseInt(a[1], 10); }
  function openState() {
    if (!cfg.hours) return null;
    var n = berlinNow(), res = { open: false, until: null };
    [0, -1].forEach(function (off) {
      var d = (n.day + off + 7) % 7, spans = cfg.hours[DAYS[d]] || [];
      spans.forEach(function (s) {
        var a = toMin(s[0]), b = toMin(s[1]); if (b <= a) b += 1440;
        var m = n.min + (off === -1 ? 1440 : 0);
        if (m >= a && m < b) { res.open = true; res.until = s[1]; }
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
    el.lastChild.textContent = st.open ? t('open', { t: st.until }) : t('closed');
    var today = DAYS[berlinNow().day];
    [].forEach.call(document.querySelectorAll('tr[data-day]'), function (r) { r.classList.toggle('today', r.getAttribute('data-day') === today); });
  }

  /* ---------- Karte ---------- */
  function photo(d, cls, w, hgt) {
    var box = h('span', { class: 'ph ' + (cls || ''), 'aria-hidden': d.photo ? false : 'true' });
    if (d.photo) box.appendChild(h('img', { src: d.photo, alt: d.photoAlt || dt(d, 'name'), loading: 'lazy', decoding: 'async', width: w, height: hgt }));
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
    if (d.recommended) a.push(h('span', { class: 'bd rec' }, t('rec')));
    if (d.vegetarian) a.push(h('span', { class: 'bd veg' }, t('veg')));
    return a.length ? h.apply(null, ['span', { class: 'bds' }].concat(a)) : null;
  }
  function codes(d) {
    if (!codesMode || !d.allergens || !d.allergens.length) return null;
    return h.apply(null, ['span', { class: 'al', 'aria-label': t('allergens') + ': ' + d.allergens.join(', ') }].concat(d.allergens.map(function (c) { return h('b', null, c); })));
  }
  function allText(d) {
    var parts = [d.nr, d.name, d.description];
    LANGS.forEach(function (l) { var x = I18N.dishes[d.id] && I18N.dishes[d.id][l]; if (x) parts.push(x.name, x.description); });
    return norm(parts.join(' '));
  }
  function catName(c) { var x = lang !== 'de' && I18N.categories[c.id] && I18N.categories[c.id][lang]; return x || c.name; }
  function card(d) {
    var hasSizes = d.sizes && d.sizes.length;
    return h('a', { class: 'dish', id: 'dish-' + d.id, href: '#' + d.id, 'data-veg': d.vegetarian ? '1' : '0', 'data-s': allText(d) },
      photo(d, '', 400, 400),
      h('span', { class: 'body' }, h('span', { class: 'nrs' }, t('nr') + ' ' + d.nr), h('h3', null, dt(d, 'name')), h('p', null, dt(d, 'description')), badges(d), codes(d)),
      h('span', { class: 'pr' }, (hasSizes ? t('from') + ' ' : '') + lowest(d), hasSizes ? h('small', null, t('nsizes', { n: d.sizes.length })) : null));
  }
  function renderMenu() {
    root.textContent = ''; chipsEl.textContent = '';
    document.getElementById('demo').hidden = !MENU.demo;
    MENU.categories.forEach(function (c) {
      chipsEl.appendChild(h('a', { href: '#cat-' + c.id }, catName(c)));
      var sec = h('section', { class: 'sec', id: 'cat-' + c.id, 'aria-labelledby': 'h-' + c.id }, h('h2', { id: 'h-' + c.id }, catName(c)));
      c.dishes.forEach(function (d) { d._cat = c; byId[d.id] = d; sec.appendChild(card(d)); });
      root.appendChild(sec);
    });
    chipsEl.appendChild(h('a', { href: '#kontakt' }, t('contact')));
    root.appendChild(h('div', { class: 'empty', id: 'empty', role: 'status' }, t('none')));
    var lg = document.getElementById('legend'); lg.textContent = '';
    if (codesMode && cfg.allergens.legend) {
      var dl = h('dl');
      Object.keys(cfg.allergens.legend).forEach(function (k) {
        var tr = lang !== 'de' && I18N.allergens[k] && I18N.allergens[k][lang];
        dl.appendChild(h('dt', null, k)); dl.appendChild(h('dd', null, tr || cfg.allergens.legend[k]));
      });
      lg.appendChild(h('div', { class: 'legend' }, h('h2', null, t('allergens')), dl));
    }
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
  function block(title, rows) { return h('div', { class: 'blk' }, h('h3', null, title), h.apply(null, ['ul', null].concat(rows))); }
  function row(l, r) { return h('li', null, h('span', null, l), h('span', null, r || '')); }
  function fill(d) {
    var body = document.getElementById('dlg-body');
    body.textContent = '';
    body.appendChild(h('div', { class: 'sh-cat' }, t('nr') + ' ' + d.nr + ' · ' + catName(d._cat)));
    var hasSz = d.sizes && d.sizes.length;
    body.appendChild(h('div', { class: 'sh-head' }, h('h2', { id: 'dlg-title' }, dt(d, 'name')), h('div', { class: 'sh-price' }, (hasSz ? t('from') + ' ' : '') + lowest(d))));
    var b = badges(d); if (b) body.appendChild(b);
    body.appendChild(photo(d, 'sh-ph', 800, 600));
    var ing = dt(d, 'ingredients');
    if (!(ing && ing.length)) body.appendChild(h('p', null, dt(d, 'description')));
    else body.appendChild(block(t('ing'), ing.map(function (x) { return row(x); })));
    if (hasSz) body.appendChild(block(t('sizes'), d.sizes.map(function (s) { return row(s.label, s.price); })));
    var ex = (d.extras || []).concat(d._cat.extras || []);
    if (ex.length) body.appendChild(block(t('extras'), ex.map(function (e) { return row(e.name, e.price ? '+ ' + e.price : ''); })));
    var sc = MENU.sauces || [];
    if (d.sauces && sc.length) body.appendChild(block(t('sauces'), sc.map(function (s) { return row(s.name, s.price ? '+ ' + s.price : ''); })));
    if (codesMode) {
      if (d.allergens && d.allergens.length) body.appendChild(block(t('allergens'), d.allergens.map(function (c) {
        var tr = lang !== 'de' && I18N.allergens[c] && I18N.allergens[c][lang];
        return row(c + ' – ' + (tr || cfg.allergens.legend[c] || ''));
      })));
    } else if (cfg.allergens && cfg.allergens.note) {
      body.appendChild(h('p', { class: 'hint' }, t('allergennote')));
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
  function getJSON(u) { return fetch(u, { cache: 'no-cache' }).then(function (r) { if (!r.ok) throw new Error(r.status); return r.json(); }); }
  var trp = getJSON('data/i18n.json').then(function (j) { I18N = j; }).catch(function () {});
  var mn = getJSON('data/menu.json');
  paintOpen(); setInterval(paintOpen, 60000);
  Promise.all([trp, mn]).then(function (r) {
    MENU = r[1]; window.__menu = MENU;
    applyStatic(); paintOpen(); renderMenu(); filter(); spy(); route(); pushed = false;
  }).catch(function () {
    root.textContent = '';
    root.appendChild(h('div', { class: 'err', role: 'alert' }, t('err') + ' ', h('a', { href: 'tel:' + cfg.phone.tel }, cfg.phone.display)));
  });
})();
