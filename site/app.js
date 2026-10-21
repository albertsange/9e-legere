/* 9e Léger uniform guide — single-page app on Supabase.
   Read mode by default; members see regulations, evidence and downloads; administrators edit everything. */
(function () {
  'use strict';

  var CFG = window.APP_CONFIG || {};
  var I = window.I18N;
  var LANGS = ['ca', 'en', 'it', 'fr', 'de'];
  var LANG_NAMES = { ca: 'Català', en: 'English', it: 'Italiano', fr: 'Français', de: 'Deutsch' };
  var LOCKED = { reg: 1, evid: 1, dl: 1 };
  var PUBLIC_BUCKET = 'public-media', PRIVATE_BUCKET = 'private-media';

  var sb = window.__SB || (window.supabase && CFG.SUPABASE_URL && CFG.SUPABASE_URL.indexOf('YOUR-') < 0
    ? window.supabase.createClient(CFG.SUPABASE_URL, CFG.SUPABASE_ANON_KEY) : null);

  var S = {
    lang: 'ca', session: null, profile: null,
    pages: [], byId: {}, priv: {}, site: {}, squads: [],
    num: {}, order: [], children: {}, tab: {},
    edit: false, draft: null, draftKey: null, prefilled: [], dirty: false,
    urls: {}, ready: false
  };

  var main = document.getElementById('main');

  /* ------------------------------------------------------------------ small helpers */
  function t(k) { var d = I[k]; return d ? (d[S.lang] || d.ca) : k; }
  function L(d) { if (d == null) return ''; if (typeof d !== 'object') return d; var v = d[S.lang]; return (v != null && v !== '' && !(Array.isArray(v) && !v.length && d.ca && d.ca.length)) ? v : (d.ca != null ? d.ca : ''); }
  function LA(d) { var v = L(d); return Array.isArray(v) ? v : []; }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function clean(html) {
    html = html == null ? '' : String(html);
    if (window.DOMPurify) return window.DOMPurify.sanitize(html, { ADD_TAGS: ['use'], FORBID_TAGS: ['script', 'iframe', 'object', 'embed', 'form', 'input'] });
    return esc(html);
  }
  function plain(html) { var d = document.createElement('div'); d.innerHTML = clean(html); return (d.textContent || '').replace(/\s+/g, ' ').trim(); }
  function clone(x) { return x == null ? x : JSON.parse(JSON.stringify(x)); }
  function isLangDict(o) {
    if (!o || typeof o !== 'object' || Array.isArray(o) || !('ca' in o)) return false;
    for (var k in o) if (LANGS.indexOf(k) < 0) return false;
    return true;
  }
  function getPath(obj, path) { var p = path.split('.'); for (var i = 0; i < p.length; i++) { if (obj == null) return undefined; obj = obj[p[i]]; } return obj; }
  function setPath(obj, path, val) {
    var p = path.split('.');
    for (var i = 0; i < p.length - 1; i++) {
      if (obj[p[i]] == null) obj[p[i]] = /^\d+$/.test(p[i + 1]) ? [] : {};
      obj = obj[p[i]];
    }
    obj[p[p.length - 1]] = val;
  }
  function isMember() { return !!(S.profile && S.profile.status === 'approved'); }
  function isAdmin() { return isMember() && S.profile.role === 'admin'; }
  function toast(msg, bad) {
    var el = document.getElementById('toast');
    el.textContent = msg; el.className = 'toast show' + (bad ? ' bad' : '');
    clearTimeout(toast.tm); toast.tm = setTimeout(function () { el.className = 'toast'; }, bad ? 7000 : 3500);
  }
  function fail(err) { console.error(err); toast(t('error') + ' ' + ((err && (err.message || err.error_description)) || err), true); }
  function q(res) { if (res && res.error) throw res.error; return res ? res.data : null; }
  function slug(s) {
    return String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
      .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60);
  }
  function chip(status) { return '<span class="chip ' + (status === 'pending' ? 'pending' : 'proposed') + '">' + t(status === 'pending' ? 'pending' : 'proposed') + '</span>'; }
  function imgSrc(v) { return v ? esc(v) : ''; }

  /* ------------------------------------------------------------------ automatic links between item pages */
  var TERMS = {
    ca: { shako: ['shakos', 'shako'], cordon: ['cordons', 'cordon', 'cordó'], plaque: ['plaque de shako', 'placa 1807', 'plaque'], plumet: ['plomalls', 'plomall', 'plumet'], cocarde: ['escarapel·la', 'cocarde'], pompon: ['pompoms', 'pompom', 'pompon'], col: ['cols', 'col'], veste: ['veste', 'gilet'], pantalon: ['pantaló', 'pantalon', 'calçons'], guetres: ['polaines', 'polaina', 'guêtres'], habit: ['habit-veste', 'habit'], boutons: ['botons', 'boutons'], epaulettes: ['epaulettes', 'epaulette', 'épaulettes'], giberne: ['giberna', 'giberne'], briquet: ['sabre-briquet', 'briquet'], dragonne: ['dragonne', 'dragona'], buffleterie: ['buffleteria', 'buffleterie', 'porte-giberne', 'baudrier'] },
    en: { shako: ['shakos', 'shako'], cordon: ['cordon', 'shako cords'], plaque: ['shako plate', '1807 plate', 'plaque'], plumet: ['plumes', 'plume', 'plumet'], cocarde: ['cockade', 'cocarde'], pompon: ['pompons', 'pompon'], col: ['stocks', 'stock'], veste: ['waistcoat', 'veste', 'gilet'], pantalon: ['trousers', 'pantalon'], guetres: ['gaiters', 'guêtres'], habit: ['habit-veste', 'coat', 'habit'], boutons: ['buttons', 'boutons'], epaulettes: ['epaulettes', 'epaulette', 'épaulettes'], giberne: ['cartridge box', 'giberne'], briquet: ['sabre-briquet', 'briquet'], dragonne: ['sword knot', 'dragonne'], buffleterie: ['buff equipment', 'buffleterie', 'porte-giberne', 'baudrier'] },
    it: { shako: ['shako'], cordon: ['cordoni', 'cordone', 'cordon'], plaque: ['placca 1807', 'placca dello shako', 'plaque'], plumet: ['pennacchi', 'pennacchio', 'plumet'], cocarde: ['coccarda', 'cocarde'], pompon: ['pompon'], col: ['colletti', 'colletto'], veste: ['panciotto', 'veste', 'gilet'], pantalon: ['pantaloni', 'pantalone', 'pantalon'], guetres: ['ghette', 'guêtres'], habit: ['habit-veste', 'abito', 'habit'], boutons: ['bottoni', 'boutons'], epaulettes: ['spalline', 'spallina', 'épaulettes'], giberne: ['giberna', 'giberne'], briquet: ['sabre-briquet', 'briquet'], dragonne: ['dragona', 'dragonne'], buffleterie: ['cuoiame', 'buffleterie', 'porte-giberne', 'baudrier'] },
    fr: { shako: ['shakos', 'shako'], cordon: ['cordons', 'cordon'], plaque: ['plaque de shako', 'plaque 1807', 'plaque losangée'], plumet: ['plumets', 'plumet'], cocarde: ['cocarde'], pompon: ['pompons', 'pompon', 'houppe'], col: ['cols', 'col'], veste: ['veste', 'gilet'], pantalon: ['pantalon'], guetres: ['guêtres', 'guêtre'], habit: ['habit-veste', 'habit'], boutons: ['boutons'], epaulettes: ['épaulettes', 'épaulette'], giberne: ['giberne'], briquet: ['sabre-briquet', 'briquet'], dragonne: ['dragonne'], buffleterie: ['buffleterie', 'porte-giberne', 'baudrier'] },
    de: { shako: ['Tschakos', 'Tschako'], cordon: ['Tschakoschnur', 'Schnüre', 'Schnur'], plaque: ['Tschakoschild', 'Rautenschild', 'Schild 1807'], plumet: ['Federbüsche', 'Federbusch'], cocarde: ['Kokarde'], pompon: ['Pompons', 'Pompon'], col: ['Halsbinden', 'Halsbinde'], veste: ['Weste'], pantalon: ['Hose'], guetres: ['Gamaschen', 'Gamasche'], habit: ['Habit-veste', 'Rock'], boutons: ['Knöpfe'], epaulettes: ['Epauletten', 'Epaulette'], giberne: ['Patronentasche'], briquet: ['Sabre-briquet', 'Briquet'], dragonne: ['Troddel'], buffleterie: ['Lederzeug', 'Porte-giberne', 'Baudrier'] }
  };
  var linkRx = {};
  function buildLinkRx() {
    linkRx = {};
    LANGS.forEach(function (k) {
      var pairs = [];
      var m = TERMS[k];
      S.pages.forEach(function (p) {
        var terms = m[p.id] ? m[p.id].slice() : [];
        if (!m[p.id] && p.name && p.name.length > 3) terms.push(p.name);
        terms.forEach(function (term) { pairs.push([term, p.id]); });
      });
      pairs.sort(function (a, b) { return b[0].length - a[0].length; });
      if (!pairs.length) return;
      var lut = {};
      pairs.forEach(function (x) { lut[x[0].toLowerCase()] = x[1]; });
      var src = pairs.map(function (x) { return x[0].replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }).join('|');
      linkRx[k] = { rx: new RegExp("(^|[^\\p{L}\\p{N}_·'-])(" + src + ")(?![\\p{L}\\p{N}_·-])", 'giu'), lut: lut };
    });
  }
  function autolink(html, self, done) {
    var R = linkRx[S.lang]; if (!R) return html;
    done = done || {};
    var depth = 0;
    return html.split(/(<[^>]+>)/).map(function (part) {
      if (part.charAt(0) === '<') {
        var m = part.match(/^<\/?\s*(\w+)/);
        if (m && /^(a|button|b)$/i.test(m[1]) && !/\/>$/.test(part)) depth += part.charAt(1) === '/' ? -1 : 1;
        return part;
      }
      if (depth > 0 || !part) return part;
      return part.replace(R.rx, function (all, pre, word) {
        var pid = R.lut[word.toLowerCase()];
        if (!pid || pid === self || done[pid]) return all;
        done[pid] = 1;
        return pre + '<a class="wl" href="#' + pid + '">' + word + '</a>';
      });
    }).join('');
  }
  function refs(html, pid) {
    return html.replace(/\[\[(\d+)\]\]/g, function (_, n) { return '<button type="button" class="ref" data-ref="' + pid + '-reg-r' + n + '">[' + n + ']</button>'; });
  }
  function rich(html, pid, done) { return refs(autolink(clean(html), pid, done), pid); }

  /* ------------------------------------------------------------------ editable fields */
  // In edit mode returns a contenteditable element bound to a path in S.draft; in read mode, the rendered value.
  function F(path, value, tag, cls, opt) {
    opt = opt || {};
    tag = tag || 'div';
    if (S.edit) {
      return '<' + tag + ' class="ed' + (cls ? ' ' + cls : '') + '" contenteditable="true" data-path="' + path + '"' +
        (opt.single ? ' data-single="1"' : '') + ' data-ph="' + esc(opt.ph || t('empty_hint')) + '">' + clean(value || '') + '</' + tag + '>';
    }
    var html = opt.raw ? clean(value) : rich(value || '', opt.pid, opt.done);
    return '<' + tag + (cls ? ' class="' + cls + '"' : '') + (opt.attr || '') + '>' + html + '</' + tag + '>';
  }
  function listBtns(listPath, i, n) {
    if (!S.edit) return '';
    return '<span class="row-tools">' +
      (i > 0 ? '<button type="button" class="mini" data-act="up" data-list="' + listPath + '" data-i="' + i + '" aria-label="up">↑</button>' : '') +
      (i < n - 1 ? '<button type="button" class="mini" data-act="down" data-list="' + listPath + '" data-i="' + i + '" aria-label="down">↓</button>' : '') +
      '<button type="button" class="mini del" data-act="del" data-list="' + listPath + '" data-i="' + i + '" aria-label="' + esc(t('remove')) + '">×</button></span>';
  }
  function addBtn(listPath, tpl, label) {
    if (!S.edit) return '';
    return '<button type="button" class="add-btn" data-act="add" data-list="' + listPath + '" data-tpl="' + tpl + '">+ ' + esc(t(label)) + '</button>';
  }
  var TPL = {
    str: function () { return ''; },
    pair: function () { return ['', '']; },
    reg: function () { return { year: '', name: '', parts: [{ label: '', fr: '', tr: { ca: '' } }] }; },
    regpart: function () { return { label: '', fr: '', tr: { ca: '' } }; }
  };

  /* ------------------------------------------------------------------ data */
  function computeTree() {
    S.byId = {}; S.pages.forEach(function (p) { S.byId[p.id] = p; });
    S.pages.sort(function (a, b) { return (a.sort - b.sort) || a.id.localeCompare(b.id); });
    S.children = { '': [] };
    S.pages.forEach(function (p) { S.children[p.id] = []; });
    S.pages.forEach(function (p) {
      var par = p.parent_id && S.byId[p.parent_id] && p.parent_id !== p.id ? p.parent_id : '';
      S.children[par].push(p.id);
    });
    S.num = {}; S.order = [];
    (function walk(par, prefix) {
      S.children[par].forEach(function (id, i) {
        var n = prefix ? prefix + '.' + (i + 1) : String(i + 1);
        if (S.num[id]) return;
        S.num[id] = n; S.order.push(id);
        walk(id, n);
      });
    })('', '');
    buildLinkRx();
  }
  function parentOf(id) { var p = S.byId[id]; return p && p.parent_id && S.byId[p.parent_id] ? p.parent_id : null; }

  function loadPublic() {
    if (!sb) return Promise.reject(new Error('Supabase is not configured (config.js).'));
    return Promise.all([
      sb.from('pages').select('*').order('sort'),
      sb.from('site').select('*'),
      sb.from('squads').select('*').order('name')
    ]).then(function (r) {
      S.pages = q(r[0]) || [];
      S.site = {}; (q(r[1]) || []).forEach(function (row) { S.site[row.key] = row.value; });
      S.squads = q(r[2]) || [];
      computeTree();
    });
  }
  function loadProfile() {
    if (!S.session) { S.profile = null; return Promise.resolve(); }
    return sb.from('profiles').select('*').eq('id', S.session.user.id).maybeSingle().then(function (r) { S.profile = q(r); });
  }
  function loadPrivate() {
    S.priv = {};
    if (!isMember()) return Promise.resolve();
    return sb.from('page_private').select('*').then(function (r) {
      (q(r) || []).forEach(function (row) { S.priv[row.page_id] = row.content || {}; });
    });
  }
  function signedUrls(paths) {
    var now = Date.now(), need = paths.filter(function (p) { return p && !(S.urls[p] && S.urls[p].exp > now); });
    if (!need.length) return Promise.resolve();
    return sb.storage.from(PRIVATE_BUCKET).createSignedUrls(need, 3600).then(function (r) {
      (q(r) || []).forEach(function (x) { if (x.signedUrl) S.urls[x.path] = { url: x.signedUrl, exp: now + 3300 * 1000 }; });
    });
  }
  function fillPrivateImages(root) {
    var imgs = Array.prototype.slice.call((root || main).querySelectorAll('img[data-priv]'));
    if (!imgs.length) return;
    signedUrls(imgs.map(function (i) { return i.getAttribute('data-priv'); })).then(function () {
      imgs.forEach(function (i) { var u = S.urls[i.getAttribute('data-priv')]; if (u) i.src = u.url; else i.classList.add('missing'); });
    }).catch(fail);
  }
  function upload(bucket, file, folder) {
    var ext = (file.name.match(/\.[a-z0-9]+$/i) || [''])[0].toLowerCase();
    var base = slug(file.name.replace(/\.[^.]+$/, '')) || 'file';
    var path = folder + '/' + Date.now().toString(36) + '-' + base + ext;
    return sb.storage.from(bucket).upload(path, file, { contentType: file.type || undefined, upsert: false }).then(function (r) {
      q(r);
      return bucket === PUBLIC_BUCKET ? sb.storage.from(bucket).getPublicUrl(path).data.publicUrl : path;
    });
  }
  function pickFile(accept, multiple) {
    return new Promise(function (res) {
      var inp = document.createElement('input');
      inp.type = 'file'; if (accept) inp.accept = accept; inp.multiple = !!multiple;
      inp.addEventListener('change', function () { res(Array.prototype.slice.call(inp.files || [])); });
      inp.click();
    });
  }

  /* ------------------------------------------------------------------ chrome: menu, account, language */
  function renderChrome() {
    document.documentElement.lang = S.lang;
    document.documentElement.dataset.lang = S.lang;
    var sel = document.getElementById('lang-select');
    sel.innerHTML = LANGS.map(function (k) { return '<option value="' + k + '"' + (k === S.lang ? ' selected' : '') + '>' + LANG_NAMES[k] + '</option>'; }).join('');
    document.getElementById('lang-label').textContent = t('lang');
    document.getElementById('q').placeholder = t('search');
    document.getElementById('menu-sr').textContent = t('menu');

    function nav(id) {
      var p = S.byId[id], kids = S.children[id] || [];
      return '<li' + (kids.length ? ' class="has-kids"' : '') + '><a href="#' + id + '" data-sec="' + id + '"><span class="n">' + S.num[id] + '</span><span lang="fr">' + esc(p.name || id) + '</span>' +
        '<span class="dot ' + (p.status === 'pending' ? 'pending' : 'proposed') + '" aria-hidden="true"></span></a>' +
        (kids.length ? '<ol class="sub">' + kids.map(nav).join('') + '</ol>' : '') + '</li>';
    }
    document.getElementById('menu-body').innerHTML =
      '<ol class="extra top-link"><li><a href="#" data-sec="home"><span class="n">⌂</span><span>' + esc(t('home')) + '</span></a></li></ol>' +
      '<p>' + esc(t('index')) + '</p><ol class="menu-items">' + S.children[''].map(nav).join('') + '</ol>' +
      '<p class="legend"><span><span class="dot proposed"></span>' + esc(t('proposed')) + '</span><span><span class="dot pending"></span>' + esc(t('pending')) + '</span></p>' +
      '<ol class="extra"><li><a href="#decisions" data-sec="decisions"><span class="n">·</span><span>' + esc(L((S.site.decisions || {}).title) || t('decisions')) + '</span></a></li>' +
      '<li><a href="#fonts" data-sec="fonts"><span class="n">·</span><span>' + esc(L((S.site.fonts || {}).title) || t('sources')) + '</span></a></li>' +
      (isAdmin() ? '<li><a href="#nova" data-sec="nova"><span class="n">+</span><span>' + esc(t('new_page')) + '</span></a></li>' : '') + '</ol>';

    var acct = document.getElementById('acct');
    if (!S.session) {
      acct.innerHTML = '<button type="button" class="btn-ghost" data-act="login">' + esc(t('login')) + '</button>';
    } else {
      var who = S.profile ? (S.profile.nom_guerre || S.profile.first_name || S.session.user.email) : S.session.user.email;
      acct.innerHTML = (isAdmin() ? '<button type="button" class="btn-ghost edit-toggle' + (S.edit ? ' on' : '') + '" data-act="toggle-edit" aria-pressed="' + S.edit + '">✎ ' + esc(t('edit')) + '</button>' : '') +
        '<details class="acct-menu"><summary class="btn-ghost"><span class="acct-ico" aria-hidden="true"></span>' + esc(who) + '</summary><div class="acct-pop">' +
        '<a href="#compte">' + esc(t('account')) + '</a>' +
        (isAdmin() ? '<a href="#gestio">' + esc(t('admin')) + '</a>' : '') +
        '<button type="button" data-act="logout">' + esc(t('logout')) + '</button></div></details>';
    }
    var bar = document.getElementById('editbar');
    bar.hidden = !S.edit || !S.draft;
    if (!bar.hidden) {
      bar.querySelector('.eb-title').textContent = t('editing');
      bar.querySelector('.eb-lang').textContent = t('editing_lang');
      bar.querySelector('[data-act="save"]').textContent = t('save');
      bar.querySelector('[data-act="discard"]').textContent = t('discard');
      Array.prototype.forEach.call(bar.querySelectorAll('[data-cmd]'), function (b) { b.title = t(b.getAttribute('data-tip')); b.setAttribute('aria-label', b.title); });
    }
    document.body.classList.toggle('editing', !!(S.edit && S.draft));
  }

  /* ------------------------------------------------------------------ routing */
  function routeId() { return decodeURIComponent((location.hash || '').replace(/^#/, '')) || 'home'; }
  var SPECIAL = { home: 1, decisions: 1, fonts: 1, registre: 1, compte: 1, gestio: 1, nova: 1, contrasenya: 1 };

  function draftKeyFor(id) { if (SPECIAL[id] && id !== 'home' && id !== 'decisions' && id !== 'fonts') return null; return S.byId[id] || id === 'home' || id === 'decisions' || id === 'fonts' ? id : null; }
  function makeDraft(id) {
    S.draftKey = id; S.dirty = false; S.prefilled = [];
    if (S.byId[id]) {
      var pg = clone(S.byId[id]);
      var pr = clone(S.priv[id] || {});
      pr.narr = pr.narr || { ca: '' }; pr.evid = pr.evid || { ca: '' }; pr.regs = pr.regs || []; pr.figs = pr.figs || []; pr.downloads = pr.downloads || [];
      var c = pg.content = pg.content || {};
      ['h2', 'lead', 'std', 'just'].forEach(function (k) { c[k] = c[k] || { ca: '' }; });
      ['desc', 'parts', 'info', 'gaps'].forEach(function (k) { c[k] = c[k] || { ca: [] }; });
      S.draft = { page: pg, priv: pr };
    } else {
      S.draft = { site: clone(S.site) };
      var s = S.draft.site;
      s.home = s.home || {}; ['eyebrow', 'h1', 'lead1', 'lead2', 'lead3', 'crit', 'platecap'].forEach(function (k) { s.home[k] = s.home[k] || { ca: '' }; });
      ['decisions', 'fonts'].forEach(function (k) { s[k] = s[k] || {}; s[k].title = s[k].title || { ca: '' }; s[k].html = s[k].html || { ca: '' }; });
    }
    prefillLang();
  }
  // copy the Catalan text into a language that has no text yet, so it can be translated in place
  function prefillLang() {
    if (!S.draft || S.lang === 'ca') return;
    (function walk(o, path) {
      if (!o || typeof o !== 'object') return;
      if (isLangDict(o)) {
        if (!(S.lang in o) || o[S.lang] === '' || (Array.isArray(o[S.lang]) && !o[S.lang].length && Array.isArray(o.ca) && o.ca.length)) {
          if (o.ca != null && o.ca !== '' && !(Array.isArray(o.ca) && !o.ca.length)) {
            o[S.lang] = clone(o.ca);
            S.prefilled.push(path + '.' + S.lang);
          }
        }
        return;
      }
      for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k) && k !== 'diagram') walk(o[k], path ? path + '.' + k : k);
    })(S.draft, '');
  }
  function pruneFallbacks() {
    S.prefilled.forEach(function (path) {
      var p = path.split('.'), lang = p.pop(), dict = getPath(S.draft, p.join('.'));
      if (dict && JSON.stringify(dict[lang]) === JSON.stringify(dict.ca)) delete dict[lang];
    });
    S.prefilled = [];
  }
  function syncDraft() {
    if (!S.draft) return;
    Array.prototype.forEach.call(main.querySelectorAll('[data-path]'), function (el) {
      var path = el.getAttribute('data-path'), v;
      if (el.isContentEditable) {
        v = clean(el.innerHTML).replace(/(<br\s*\/?>|\s|&nbsp;)+$/i, '');
        if (el.hasAttribute('data-single')) v = v.replace(/<br\s*\/?>/gi, ' ');
        if (!plain(v) && !/<img/i.test(v)) v = '';
      } else if (el.type === 'checkbox') v = el.checked;
      else if (el.type === 'number') v = parseInt(el.value, 10) || 0;
      else v = el.value;
      if (el.hasAttribute('data-csv')) v = String(v).split(',').map(function (x) { return x.trim(); }).filter(Boolean);
      setPath(S.draft, path, v);
    });
  }
  function leaveEditOk() {
    if (S.edit && S.dirty) return window.confirm(t('unsaved'));
    return true;
  }

  var lastRoute = null;
  function route() {
    var id = routeId();
    if (lastRoute && id !== lastRoute && S.edit && S.dirty && !window.confirm(t('unsaved'))) {
      history.replaceState(null, '', '#' + (lastRoute === 'home' ? '' : lastRoute));
      return;
    }
    if (lastRoute !== id) { S.draft = null; S.dirty = false; }
    var changed = lastRoute !== id;
    lastRoute = id;
    render();
    if (changed) {
      window.scrollTo(0, 0);
      var h = main.querySelector('h1,h2'); if (h) h.focus({ preventScroll: true });
    }
  }

  function render() {
    if (!S.ready) return;
    var id = routeId();
    if (S.edit && isAdmin()) {
      var key = draftKeyFor(id);
      if (key && (!S.draft || S.draftKey !== key)) makeDraft(key);
      if (!key) S.draft = null;
    } else { S.draft = null; }
    renderChrome();
    var html;
    if (id === 'home') html = homeView();
    else if (id === 'decisions' || id === 'fonts') html = blockView(id);
    else if (id === 'registre') html = registerView();
    else if (id === 'compte') html = accountView();
    else if (id === 'gestio') html = adminView();
    else if (id === 'nova') html = newPageView();
    else if (id === 'contrasenya') html = newPasswordView();
    else if (S.byId[id]) html = pageView(id);
    else html = '<section class="view"><h2 class="page-title" tabindex="-1">' + esc(t('not_found')) + '</h2><p><a href="#">' + esc(t('home')) + '</a></p></section>';
    main.innerHTML = html;
    Array.prototype.forEach.call(document.querySelectorAll('#menu-body a[data-sec]'), function (a) {
      var on = a.getAttribute('data-sec') === id;
      a.classList.toggle('active', on);
      if (on) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current');
    });
    fillPrivateImages();
    if (id === 'gestio' && isAdmin()) loadMembers();
    document.title = (S.byId[id] ? (S.byId[id].name + ' · ') : '') + 'Uniformitat del 9e Léger';
  }

  /* ------------------------------------------------------------------ views: home and text blocks */
  function homeView() {
    var site = S.edit && S.draft && S.draft.site ? S.draft.site : S.site;
    var h = site.home || {};
    var P = function (k) { return 'site.home.' + k + '.' + S.lang; };
    var V = function (k) { return S.edit ? (h[k] || {})[S.lang] : L(h[k]); };
    function row(id) {
      var p = S.byId[id], c = p.content || {}, kids = S.children[id] || [];
      return '<li class="hrow"><a class="hrow-main" href="#' + id + '">' + (p.card || p.image ? '<img src="' + imgSrc(p.card || p.image) + '" alt="" loading="lazy" width="96" height="72">' : '<span class="img-ph small" aria-hidden="true"></span>') +
        '<span class="hrow-t"><span class="hrow-title"><span class="num">' + S.num[id] + '</span>' + clean(L(c.h2) || p.name) + '</span>' +
        '<span class="hrow-fr" lang="fr">' + esc(p.ib || '') + '</span></span>' + chip(p.status) + '</a>' +
        (kids.length ? '<p class="hrow-kids">' + kids.map(tlink).join('') + '</p>' : '') + '</li>';
    }
    var plate = h.plate || 'img/lamina_9e_1809.png';
    return '<section class="view home" data-view="home">' +
      '<header class="top compact"><div>' +
      F(P('eyebrow'), V('eyebrow'), 'div', 'eyebrow', { raw: 1, single: 1 }) +
      F(P('h1'), V('h1'), 'h1', '', { raw: 1, single: 1, attr: ' tabindex="-1"' }) +
      F(P('lead1'), V('lead1'), 'p', 'lead', { raw: 1 }) +
      '<details class="intro-more"' + (S.edit ? ' open' : '') + '><summary>' + esc(t('intro_more')) + '</summary>' +
      F(P('lead2'), V('lead2'), 'p', '', { raw: 1 }) + F(P('lead3'), V('lead3'), 'p', '', { raw: 1 }) + F(P('crit'), V('crit'), 'p', 'criteri', { raw: 1 }) +
      '</details></div>' +
      '<figure class="plate small"><img src="' + imgSrc(plate) + '" alt="9e Léger soldier, 1809">' +
      F(P('platecap'), V('platecap'), 'figcaption', '', { raw: 1 }) +
      (S.edit ? '<button type="button" class="btn-small" data-act="img" data-target="site.home.plate">' + esc(t('change_img')) + '</button>' : '') + '</figure></header>' +
      (isAdmin() && !S.pages.length ? '<div class="locked empty-db"><div><strong>' + esc(t('empty_db_t')) + '</strong><p>' + esc(t('empty_db_p')) + '</p><p class="locked-actions"><a class="btn" href="#gestio">' + esc(t('admin')) + '</a></p></div></div>' : '') +
      '<div class="grid-head"><h2>' + esc(t('pieces')) + '</h2><p class="muted">' + esc(t('pieces_hint')) + '</p></div>' +
      '<ul class="hlist">' + S.children[''].map(row).join('') + '</ul>' +
      '<p class="home-more"><a class="tlink" href="#decisions">' + esc(L((S.site.decisions || {}).title) || t('decisions')) + '</a><a class="tlink" href="#fonts">' + esc(L((S.site.fonts || {}).title) || t('sources')) + '</a>' +
      (isAdmin() ? '<a class="tlink" href="#nova">+ ' + esc(t('new_page')) + '</a>' : '') + '</p></section>';
  }
  function blockView(key) {
    var site = S.edit && S.draft && S.draft.site ? S.draft.site : S.site;
    var b = site[key] || {};
    var title = S.edit ? (b.title || {})[S.lang] : (L(b.title) || t(key === 'fonts' ? 'sources' : 'decisions'));
    var body = S.edit ? (b.html || {})[S.lang] : L(b.html);
    return '<section class="view" data-view="' + key + '"><p class="crumb"><a href="#">' + esc(t('home')) + '</a> <span aria-hidden="true">/</span> ' + esc(plain(L(b.title)) || t(key === 'fonts' ? 'sources' : 'decisions')) + '</p>' +
      F('site.' + key + '.title.' + S.lang, title, 'h2', 'page-title', { raw: 1, single: 1, attr: ' tabindex="-1"' }) +
      '<div class="table-wrap block-' + key + '">' + F('site.' + key + '.html.' + S.lang, body, 'div', 'block-html', { raw: 1 }) + '</div>' +
      (S.edit && key === 'decisions' ? '<button type="button" class="add-btn" data-act="addrow">+ ' + esc(t('add_row')) + '</button>' : '') +
      '</section>';
  }
  function tlink(id) {
    var p = S.byId[id]; if (!p) return '';
    return '<a class="tlink" href="#' + id + '"><span class="tl-n">' + S.num[id] + '</span><span lang="fr">' + esc(p.name || id) + '</span></a>';
  }
  function relHtml(id) {
    var rows = [], par = parentOf(id);
    if (par) {
      rows.push(['part_of', [par]]);
      var sib = (S.children[par] || []).filter(function (x) { return x !== id; });
      if (sib.length) rows.push(['siblings', sib]);
    }
    if ((S.children[id] || []).length) rows.push(['subparts', S.children[id]]);
    var rel = (S.byId[id].related || []).filter(function (x) { return S.byId[x]; });
    if (rel.length) rows.push(['see_also', rel]);
    if (!rows.length) return '';
    return '<div class="rel">' + rows.map(function (r) { return '<p class="rel-row"><span class="rel-k">' + esc(t(r[0])) + '</span>' + r[1].map(tlink).join('') + '</p>'; }).join('') + '</div>';
  }

  /* ------------------------------------------------------------------ view: item page */
  function pageView(id) {
    var E = S.edit && S.draft && S.draft.page;
    var p = E ? S.draft.page : S.byId[id];
    var c = p.content || {};
    var pr = E ? S.draft.priv : S.priv[id];
    var member = isMember();
    var lg = S.lang;
    var cp = 'page.content.';
    var V = function (k) { return E ? (c[k] || {})[lg] : L(c[k]); };
    var VA = function (k) { return E ? ((c[k] || {})[lg] || []) : LA(c[k]); };
    var done = {};

    // infobox
    var info = VA('info');
    var infoRows = info.map(function (r, i) {
      return '<tr><th scope="row">' + F(cp + 'info.' + lg + '.' + i + '.0', r[0], 'span', '', { raw: 1, single: 1 }) + '</th><td>' +
        F(cp + 'info.' + lg + '.' + i + '.1', r[1], 'span', '', { raw: 1 }) + listBtns(cp + 'info.' + lg, i, info.length) + '</td></tr>';
    }).join('');
    var infobox = '<aside class="infobox" aria-label="' + esc(p.name) + '">' +
      (E ? '<p class="ib-title ed" contenteditable="true" data-single="1" data-path="page.ib" data-ph="' + esc(t('f_ib')) + '">' + clean(p.ib) + '</p>' : '<p class="ib-title" lang="fr">' + esc(p.ib) + '</p>') +
      '<figure>' + (p.image ? '<img src="' + imgSrc(p.image) + '" alt="" width="480" height="600">' : '<span class="img-ph" aria-hidden="true"></span>') +
      '<figcaption>' + esc(t('cap')) + '</figcaption>' +
      (E ? '<span class="img-tools"><button type="button" class="btn-small" data-act="img" data-target="page.image">' + esc(t('change_img')) + '</button>' +
        '<button type="button" class="btn-small" data-act="img" data-target="page.card">' + esc(t('change_card')) + '</button></span>' : '') + '</figure>' +
      '<table>' + infoRows + '</table>' + addBtn(cp + 'info.' + lg, 'pair', 'add_row') +
      '<p class="ib-std"><b>' + esc(t('ib_std')) + '</b> ' + chip(p.status) + '</p></aside>';

    // body
    var desc = VA('desc');
    var descHtml = desc.map(function (x, i) {
      return E ? '<div class="ed-row">' + F(cp + 'desc.' + lg + '.' + i, x, 'div', 'ed-p') + listBtns(cp + 'desc.' + lg, i, desc.length) + '</div>' : F('', x, 'p', '', { pid: id, done: done });
    }).join('') + addBtn(cp + 'desc.' + lg, 'str', 'add_par');

    // tabs
    var panels = [];
    var parts = VA('parts');
    var partsHtml = '<dl class="parts">' + parts.map(function (r, i) {
      return '<div><dt>' + F(cp + 'parts.' + lg + '.' + i + '.0', r[0], 'span', '', { raw: 1, single: 1 }) + '</dt><dd>' +
        F(cp + 'parts.' + lg + '.' + i + '.1', r[1], 'span', '', { pid: id }) + listBtns(cp + 'parts.' + lg, i, parts.length) + '</dd></div>';
    }).join('') + '</dl>' + addBtn(cp + 'parts.' + lg, 'pair', 'add_row');
    if (c.diagram && !E) partsHtml += '<figure class="diagram">' + clean(c.diagram) + '</figure>';
    if (E) partsHtml += '<details class="ed-svg"><summary>' + esc(t('diagram_src')) + '</summary><textarea data-path="page.content.diagram" rows="8">' + esc(c.diagram || '') + '</textarea></details>';
    panels.push(['parts', null, partsHtml]);

    var nregs = pr && pr.regs ? pr.regs.length : null;
    panels.push(['reg', nregs || null, pr ? regsHtml(id, pr, E) : '']);
    var figs = pr && pr.figs ? pr.figs : [];
    panels.push(['evid', figs.length || null, pr ? evidHtml(id, pr, E) : '']);

    var stdHtml = '<div class="std' + (p.status === 'pending' ? ' pending' : '') + '"><strong>' + esc(t('t_std')) + chip(p.status) + '</strong>' +
      F(cp + 'std.' + lg, V('std'), 'p', '', { pid: id }) + '</div>' +
      ((V('just') || E) ? '<section class="just"><h3>' + esc(t('just')) + '</h3>' + F(cp + 'just.' + lg, V('just'), 'p', '', { pid: id }) + '</section>' : '');
    panels.push(['std', null, stdHtml]);

    var gaps = VA('gaps');
    if (gaps.length || E) panels.push(['gaps', gaps.length || null, '<div class="gaps"><ul>' + gaps.map(function (g, i) {
      return '<li>' + F(cp + 'gaps.' + lg + '.' + i, g, 'span', '', { raw: 1 }) + listBtns(cp + 'gaps.' + lg, i, gaps.length) + '</li>';
    }).join('') + '</ul>' + addBtn(cp + 'gaps.' + lg, 'str', 'add_item') + '</div>']);

    panels.push(['dl', pr && pr.downloads && pr.downloads.length || null, pr ? dlHtml(id, pr, E) : '']);

    var sel = S.tab[id] && panels.some(function (x) { return x[0] === S.tab[id]; }) ? S.tab[id] : 'parts';
    var tl = panels.map(function (x) {
      var k = x[0], lock = LOCKED[k] && !member;
      return '<button type="button" role="tab" id="' + id + '-tab-' + k + '" aria-controls="' + id + '-panel-' + k + '" aria-selected="' + (k === sel) + '" tabindex="' + (k === sel ? 0 : -1) + '" data-tab="' + k + '"' +
        (k === 'std' ? ' class="tab-std"' : lock ? ' class="tab-locked"' : '') + '>' +
        (k === 'std' ? '<span class="star" aria-hidden="true">★</span>' : '') + (lock ? '<span class="lock-ico" aria-hidden="true"></span>' : '') +
        esc(t('t_' + k)) + (x[1] && !lock ? '<span class="count">' + x[1] + '</span>' : '') + '</button>';
    }).join('');
    var tp = panels.map(function (x) {
      var k = x[0], lock = LOCKED[k] && !member;
      return '<div role="tabpanel" class="panel" id="' + id + '-panel-' + k + '" aria-labelledby="' + id + '-tab-' + k + '"' + (k === sel ? '' : ' hidden') + '>' + (lock ? lockedHtml() : x[2]) + '</div>';
    }).join('');

    // pager
    var i = S.order.indexOf(id), prev = S.order[i - 1], next = S.order[i + 1];
    var pg = '<nav class="pager" aria-label="pager">' +
      (prev ? '<a class="pg prev" href="#' + prev + '"><span class="pg-k">← ' + esc(t('prev')) + '</span><span class="pg-t" lang="fr">' + S.num[prev] + '. ' + esc(S.byId[prev].name) + '</span></a>' : '<span></span>') +
      (next ? '<a class="pg next" href="#' + next + '"><span class="pg-k">' + esc(t('next')) + ' →</span><span class="pg-t" lang="fr">' + S.num[next] + '. ' + esc(S.byId[next].name) + '</span></a>'
        : '<a class="pg next" href="#decisions"><span class="pg-k">' + esc(t('next')) + ' →</span><span class="pg-t">' + esc(L((S.site.decisions || {}).title) || t('decisions')) + '</span></a>') + '</nav>';

    return (E ? settingsHtml(p) : '') +
      '<section class="view item wiki" data-view="' + id + '">' +
      '<p class="crumb"><a href="#">' + esc(t('home')) + '</a> <span aria-hidden="true">/</span> <span lang="fr">' + esc(p.name) + '</span></p>' +
      '<header class="wiki-head"><div class="piece-head"><span class="num">' + (S.num[id] || '') + '</span>' + F(cp + 'h2.' + lg, V('h2'), 'h2', '', { raw: 1, single: 1, attr: ' tabindex="-1"' }) + '</div>' +
      '<p class="wiki-sub">' + esc(t('sub').replace('{n}', S.num[id] || '')) + ' · ' + chip(p.status) + '</p>' + relHtml(id) + '</header>' +
      infobox +
      '<div class="wiki-body">' + F(cp + 'lead.' + lg, V('lead'), 'p', 'lead-p', { pid: id, done: done }) + descHtml +
      '<div class="tabs wiki-tabs" role="tablist">' + tl + '</div>' + tp + '</div>' + pg + '</section>';
  }

  function lockedHtml() {
    var msg = !S.session ? t('locked_p') : (S.profile && S.profile.status === 'blocked' ? t('locked_blocked') : t('locked_pending'));
    return '<div class="locked"><span class="lock-big" aria-hidden="true"></span><div><strong>' + esc(t('locked_t')) + '</strong><p>' + esc(msg) + '</p>' +
      (!S.session ? '<p class="locked-actions"><button type="button" class="btn" data-act="login">' + esc(t('login')) + '</button> <a href="#registre">' + esc(t('register')) + '</a></p>' : '') + '</div></div>';
  }

  function regsHtml(id, pr, E) {
    var lg = S.lang, pp = 'priv.';
    var narr = F(pp + 'narr.' + lg, E ? (pr.narr || {})[lg] : L(pr.narr), 'p', 'narr', { pid: id });
    var regs = pr.regs || [];
    var out = '<div class="regs" id="' + id + '-reg"><div class="regs-head"><span>' + esc(t('regs_head')) + '</span><span></span>' +
      (E ? '' : '<button type="button" class="regs-toggle" data-target="' + id + '-reg" aria-expanded="false"><span class="when-closed">' + esc(t('open_all')) + '</span><span class="when-open">' + esc(t('close_all')) + '</span></button>') + '</div>';
    regs.forEach(function (r, n) {
      var parts = r.parts || [];
      var base = pp + 'regs.' + n;
      var fr = parts.map(function (x, j) {
        if (E) return '<div class="ed-regpart">' + F(base + '.parts.' + j + '.label', x.label, 'span', 'ed-label', { raw: 1, single: 1, ph: t('label') }) +
          F(base + '.parts.' + j + '.fr', x.fr, 'p', '', { raw: 1, ph: 'Texte original' }) + '</div>';
        return '<p lang="fr">' + (x.label ? '<b>' + clean(x.label) + '.</b> ' : '') + clean(x.fr) + '</p>';
      }).join('');
      var tr = parts.map(function (x, j) {
        var trv = E ? ((x.tr || {})[lg]) : (lg === 'fr' ? '' : L(x.tr));
        if (E) return '<div class="ed-regpart">' + F(base + '.parts.' + j + '.tr.' + lg, trv, 'p', '', { raw: 1 }) + listBtns(base + '.parts', j, parts.length) + '</div>';
        return '<p>' + (x.label ? '<b>' + clean(x.label) + '.</b> ' : '') + clean(trv) + '</p>';
      }).join('');
      var head = E
        ? '<div class="ed-reghead"><span class="reg-n">[' + (n + 1) + ']</span>' + F(base + '.year', r.year, 'b', 'yr-y', { raw: 1, single: 1, ph: t('year') }) + ' — ' +
          F(base + '.name', r.name, 'span', '', { raw: 1, single: 1, ph: t('reg_name') }) + listBtns(pp + 'regs', n, regs.length) + '</div>'
        : '<summary><span class="reg-date"><span class="reg-n">[' + (n + 1) + ']</span> <b class="yr-y">' + esc(r.year) + '</b> — <span lang="fr">' + clean(r.name) + '</span></span>' +
          '<span class="yr-count">' + (parts.length > 1 ? parts.length : '') + '</span><span class="chev" aria-hidden="true"></span></summary>';
      var body = '<div class="reg-body"><div class="orig"><span class="lbl">' + esc(t('fr_text')) + '</span>' + fr + '</div>' +
        '<div class="tr"><span class="lbl">' + esc(t('tr_text')) + '</span>' + tr + '</div></div>' + (E ? addBtn(base + '.parts', 'regpart', 'add_text') : '');
      out += E ? '<div class="reg yr ed-reg" id="' + id + '-reg-r' + (n + 1) + '">' + head + body + '</div>'
        : '<details id="' + id + '-reg-r' + (n + 1) + '" class="reg yr">' + head + body + '</details>';
    });
    out += '</div>' + addBtn(pp + 'regs', 'reg', 'add_reg');
    var note = E ? ((pr.note || {})[lg]) : L(pr.note);
    if (note || E) out += F(pp + 'note.' + lg, note, 'p', 'regs-note', { raw: 1, ph: t('note') });
    return narr + out;
  }

  function evidHtml(id, pr, E) {
    var lg = S.lang;
    var out = F('priv.evid.' + lg, E ? (pr.evid || {})[lg] : L(pr.evid), 'p', '', { pid: id });
    var figs = pr.figs || [];
    if (!figs.length && !E && !L(pr.evid)) out = '<p class="muted">' + esc(t('no_evid')) + '</p>';
    if (figs.length || E) {
      out += '<div class="figs">' + figs.map(function (f, i) {
        var src = f.path ? '<img data-priv="' + esc(f.path) + '" alt="' + esc(f.alt || '') + '" loading="lazy">' : '<span class="img-ph" aria-hidden="true"></span>';
        return '<figure' + (pr.wide ? ' class="wide"' : '') + '>' + src +
          F('priv.figs.' + i + '.cap.' + lg, E ? (f.cap || {})[lg] : L(f.cap), 'figcaption', '', { raw: 1 }) +
          (E ? '<span class="fig-tools"><input type="text" data-path="priv.figs.' + i + '.alt" value="' + esc(f.alt || '') + '" placeholder="' + esc(t('alt')) + '" aria-label="' + esc(t('alt')) + '">' + listBtns('priv.figs', i, figs.length) + '</span>' : '') + '</figure>';
      }).join('') + '</div>';
    }
    if (E) out += '<button type="button" class="add-btn" data-act="add-fig">+ ' + esc(t('add_img')) + '</button>';
    return out;
  }

  function dlHtml(id, pr, E) {
    var lg = S.lang, dls = pr.downloads || [];
    if (!dls.length && !E) return '<p class="muted">' + esc(t('no_dl')) + '</p>';
    return '<div class="dl-grid">' + dls.map(function (d, i) {
      var ext = ((d.filename || '').match(/\.([a-z0-9]+)$/i) || ['', 'file'])[1].toUpperCase().slice(0, 4);
      return '<div class="dl-card live"><span class="dl-ico" aria-hidden="true">' + esc(ext) + '</span><div>' +
        F('priv.downloads.' + i + '.title.' + lg, E ? (d.title || {})[lg] : (L(d.title) || d.filename), 'strong', '', { raw: 1, single: 1 }) +
        F('priv.downloads.' + i + '.desc.' + lg, E ? (d.desc || {})[lg] : L(d.desc), 'p', '', { raw: 1 }) + '</div>' +
        (E ? listBtns('priv.downloads', i, dls.length)
          : '<button type="button" class="btn-small dl-go" data-act="download" data-path="' + esc(d.path) + '" data-name="' + esc(d.filename || 'file') + '">' + esc(t('download')) + '</button>') + '</div>';
    }).join('') + '</div>' + (E ? '<button type="button" class="add-btn" data-act="add-file">+ ' + esc(t('add_file')) + '</button>' : '');
  }

  function settingsHtml(p) {
    var opts = '<option value="">' + esc(t('f_top')) + '</option>' + S.order.filter(function (x) { return x !== p.id; }).map(function (x) {
      return '<option value="' + x + '"' + (p.parent_id === x ? ' selected' : '') + '>' + S.num[x] + ' ' + esc(S.byId[x].name) + '</option>';
    }).join('');
    return '<section class="settings" aria-label="' + esc(t('page_settings')) + '"><h3>' + esc(t('page_settings')) + '</h3><div class="set-grid">' +
      '<label>' + esc(t('f_id')) + '<input type="text" value="' + esc(p.id) + '" disabled></label>' +
      '<label>' + esc(t('f_name')) + '<input type="text" data-path="page.name" value="' + esc(p.name) + '"></label>' +
      '<label>' + esc(t('f_parent')) + '<select data-path="page.parent_id">' + opts + '</select></label>' +
      '<label>' + esc(t('f_sort')) + '<input type="number" data-path="page.sort" value="' + (p.sort || 0) + '"></label>' +
      '<label>' + esc(t('f_status')) + '<select data-path="page.status"><option value="proposed"' + (p.status === 'proposed' ? ' selected' : '') + '>' + esc(t('proposed')) + '</option>' +
      '<option value="pending"' + (p.status === 'pending' ? ' selected' : '') + '>' + esc(t('pending')) + '</option></select></label>' +
      '<label class="wide">' + esc(t('f_related')) + '<input type="text" data-csv="1" data-path="page.related" value="' + esc((p.related || []).join(', ')) + '"></label>' +
      '</div><button type="button" class="btn-danger" data-act="delete-page">' + esc(t('delete_page')) + '</button></section>';
  }

  /* ------------------------------------------------------------------ views: account, sign-up, admin, new page */
  function field(name, label, type, val, extra) {
    return '<label class="fld"><span>' + esc(label) + '</span><input name="' + name + '" type="' + (type || 'text') + '" value="' + esc(val || '') + '"' + (extra || '') + '></label>';
  }
  function squadField(val) {
    if (!S.squads.length) return field('esquadra', t('esquadra'), 'text', val, ' required maxlength="80"');
    return '<label class="fld"><span>' + esc(t('esquadra')) + '</span><select name="esquadra" required><option value="">' + esc(t('choose')) + '</option>' +
      S.squads.map(function (s) { return '<option' + (s.name === val ? ' selected' : '') + '>' + esc(s.name) + '</option>'; }).join('') +
      (val && !S.squads.some(function (s) { return s.name === val; }) ? '<option selected>' + esc(val) + '</option>' : '') + '</select></label>';
  }
  function registerView() {
    return '<section class="view narrow"><h2 class="page-title" tabindex="-1">' + esc(t('register_t')) + '</h2><p class="muted">' + esc(t('register_p')) + '</p>' +
      '<form class="form" id="f-register" novalidate>' +
      field('email', t('email'), 'email', '', ' required autocomplete="email"') +
      '<div class="two">' + field('password', t('password'), 'password', '', ' required minlength="8" autocomplete="new-password"') +
      field('password2', t('password2'), 'password', '', ' required minlength="8" autocomplete="new-password"') + '</div>' +
      '<div class="two">' + field('first_name', t('first_name'), 'text', '', ' required maxlength="80" autocomplete="given-name"') +
      field('last_name', t('last_name'), 'text', '', ' required maxlength="120" autocomplete="family-name"') + '</div>' +
      '<div class="two">' + field('nom_guerre', t('nom_guerre'), 'text', '', ' required maxlength="80"') + squadField('') + '</div>' +
      '<p class="form-msg" role="status"></p>' +
      '<p class="form-actions"><button class="btn" type="submit">' + esc(t('register')) + '</button> <button type="button" class="link" data-act="login">' + esc(t('have_account')) + '</button></p></form></section>';
  }
  function accountView() {
    if (!S.session) return '<section class="view narrow"><h2 class="page-title" tabindex="-1">' + esc(t('account')) + '</h2>' + lockedHtml() + '</section>';
    var p = S.profile || {};
    return '<section class="view narrow"><h2 class="page-title" tabindex="-1">' + esc(t('account')) + '</h2>' +
      '<dl class="kv"><div><dt>' + esc(t('email')) + '</dt><dd>' + esc(S.session.user.email) + '</dd></div>' +
      '<div><dt>' + esc(t('status')) + '</dt><dd>' + esc(t('st_' + (p.status || 'pending'))) + '</dd></div>' +
      '<div><dt>' + esc(t('role')) + '</dt><dd>' + esc(t(p.role === 'admin' ? 'r_admin' : 'r_member')) + '</dd></div></dl>' +
      '<form class="form" id="f-profile"><h3>' + esc(t('my_data')) + '</h3>' +
      '<div class="two">' + field('first_name', t('first_name'), 'text', p.first_name, ' required maxlength="80"') + field('last_name', t('last_name'), 'text', p.last_name, ' required maxlength="120"') + '</div>' +
      '<div class="two">' + field('nom_guerre', t('nom_guerre'), 'text', p.nom_guerre, ' required maxlength="80"') + squadField(p.esquadra) + '</div>' +
      '<p class="form-msg" role="status"></p><p class="form-actions"><button class="btn" type="submit">' + esc(t('save')) + '</button></p></form>' +
      '<form class="form" id="f-password"><h3>' + esc(t('set_pw_t')) + '</h3><div class="two">' +
      field('password', t('new_password'), 'password', '', ' required minlength="8" autocomplete="new-password"') + field('password2', t('password2'), 'password', '', ' required minlength="8" autocomplete="new-password"') + '</div>' +
      '<p class="form-msg" role="status"></p><p class="form-actions"><button class="btn" type="submit">' + esc(t('save')) + '</button></p></form>' +
      '<p><button type="button" class="btn-ghost" data-act="logout">' + esc(t('logout')) + '</button></p></section>';
  }
  function newPasswordView() {
    return '<section class="view narrow"><h2 class="page-title" tabindex="-1">' + esc(t('set_pw_t')) + '</h2>' +
      (S.session ? '<form class="form" id="f-password"><div class="two">' + field('password', t('new_password'), 'password', '', ' required minlength="8" autocomplete="new-password"') +
        field('password2', t('password2'), 'password', '', ' required minlength="8" autocomplete="new-password"') + '</div><p class="form-msg" role="status"></p>' +
        '<p class="form-actions"><button class="btn" type="submit">' + esc(t('save')) + '</button></p></form>' : lockedHtml()) + '</section>';
  }
  function adminView() {
    if (!isAdmin()) return '<section class="view narrow"><h2 class="page-title" tabindex="-1">' + esc(t('admin')) + '</h2>' + lockedHtml() + '</section>';
    return '<section class="view"><h2 class="page-title" tabindex="-1">' + esc(t('admin')) + '</h2>' +
      '<h3>' + esc(t('members')) + '</h3><div class="table-wrap" id="members"><p class="muted">' + esc(t('loading')) + '</p></div>' +
      '<h3>' + esc(t('squads')) + '</h3><ul class="squads">' + S.squads.map(function (s) {
        return '<li>' + esc(s.name) + ' <button type="button" class="mini del" data-act="del-squad" data-id="' + s.id + '" aria-label="' + esc(t('remove')) + '">×</button></li>';
      }).join('') + '</ul><form class="form inline" id="f-squad"><input name="name" maxlength="80" required aria-label="' + esc(t('esquadra')) + '"><button class="btn" type="submit">' + esc(t('add')) + '</button></form>' +
      '<h3>' + esc(t('import_t')) + '</h3><p class="muted">' + esc(t('import_p')) + '</p>' +
      '<form class="form" id="f-import"><label class="fld"><span>seed.json</span><input type="file" name="seed" accept=".json,application/json" required></label>' +
      '<label class="fld"><span>private-images</span><input type="file" name="imgs" accept="image/*" multiple></label>' +
      '<p class="form-msg" role="status"></p><p class="form-actions"><button class="btn" type="submit">' + esc(t('import_go')) + '</button>' +
      ' <button type="button" class="btn-ghost" data-act="backup">' + esc(t('backup')) + '</button></p></form></section>';
  }
  function loadMembers() {
    sb.from('profiles').select('*').order('created_at', { ascending: false }).then(function (r) {
      var rows = q(r) || [], box = document.getElementById('members');
      if (!box) return;
      if (!rows.length) { box.innerHTML = '<p class="muted">' + esc(t('no_members')) + '</p>'; return; }
      rows.sort(function (a, b) { return (a.status === 'pending' ? 0 : 1) - (b.status === 'pending' ? 0 : 1); });
      box.innerHTML = '<table class="members"><thead><tr><th>' + esc(t('first_name')) + ' / ' + esc(t('last_name')) + '</th><th>' + esc(t('nom_guerre')) + '</th><th>' + esc(t('esquadra')) +
        '</th><th>' + esc(t('email')) + '</th><th>' + esc(t('status')) + '</th><th>' + esc(t('role')) + '</th><th></th></tr></thead><tbody>' +
        rows.map(function (m) {
          var me = S.session && m.id === S.session.user.id;
          return '<tr data-id="' + m.id + '"><td>' + esc(m.first_name + ' ' + m.last_name) + '</td><td>' + esc(m.nom_guerre) + '</td><td>' + esc(m.esquadra) + '</td><td>' + esc(m.email) + '</td>' +
            '<td><select name="status"' + (me ? ' disabled' : '') + '>' + ['pending', 'approved', 'blocked'].map(function (s) { return '<option value="' + s + '"' + (m.status === s ? ' selected' : '') + '>' + esc(t('st_' + s)) + '</option>'; }).join('') + '</select></td>' +
            '<td><select name="role"' + (me ? ' disabled' : '') + '>' + ['member', 'admin'].map(function (s) { return '<option value="' + s + '"' + (m.role === s ? ' selected' : '') + '>' + esc(t(s === 'admin' ? 'r_admin' : 'r_member')) + '</option>'; }).join('') + '</select></td>' +
            '<td>' + (me ? '' : '<button type="button" class="btn-small" data-act="save-member">' + esc(t('save')) + '</button>') + '</td></tr>';
        }).join('') + '</tbody></table>';
    }).catch(fail);
  }
  function newPageView() {
    if (!isAdmin()) return '<section class="view narrow"><h2 class="page-title" tabindex="-1">' + esc(t('new_page')) + '</h2>' + lockedHtml() + '</section>';
    var opts = '<option value="">' + esc(t('f_top')) + '</option>' + S.order.map(function (x) { return '<option value="' + x + '">' + S.num[x] + ' ' + esc(S.byId[x].name) + '</option>'; }).join('');
    return '<section class="view narrow"><h2 class="page-title" tabindex="-1">' + esc(t('new_page')) + '</h2><form class="form" id="f-newpage">' +
      field('pname', t('f_name'), 'text', '', ' required maxlength="80"') +
      field('h2', t('f_title') + ' (' + LANG_NAMES[S.lang] + ')', 'text', '', ' maxlength="120"') +
      field('pid', t('f_id'), 'text', '', ' required pattern="[a-z0-9][a-z0-9\\-]{0,59}"') +
      '<div class="two"><label class="fld"><span>' + esc(t('f_parent')) + '</span><select name="parent">' + opts + '</select></label>' +
      field('sort', t('f_sort'), 'number', String((S.pages.reduce(function (m, p) { return Math.max(m, p.sort || 0); }, 0)) + 1)) + '</div>' +
      '<p class="form-msg" role="status"></p><p class="form-actions"><button class="btn" type="submit">' + esc(t('create')) + '</button></p></form></section>';
  }

  /* ------------------------------------------------------------------ login dialog */
  function openLogin() {
    var dlg = document.getElementById('login-dlg');
    dlg.innerHTML = '<form method="dialog" class="form" id="f-login"><h2>' + esc(t('login')) + '</h2>' +
      field('email', t('email'), 'email', '', ' required autocomplete="email"') +
      field('password', t('password'), 'password', '', ' required autocomplete="current-password"') +
      '<p class="form-msg" role="status"></p>' +
      '<p class="form-actions"><button class="btn" type="submit" value="go">' + esc(t('login')) + '</button> <button type="button" class="btn-ghost" data-act="close-dlg">' + esc(t('cancel')) + '</button></p>' +
      '<p class="dlg-links"><button type="button" class="link" data-act="forgot">' + esc(t('forgot')) + '</button><a href="#registre" data-act="close-dlg">' + esc(t('no_account')) + '</a></p></form>';
    if (dlg.showModal) dlg.showModal(); else dlg.setAttribute('open', '');
    var inp = dlg.querySelector('input'); if (inp) inp.focus();
  }
  function closeLogin() { var dlg = document.getElementById('login-dlg'); if (dlg.open) { if (dlg.close) dlg.close(); else dlg.removeAttribute('open'); } }
  function msg(form, text, bad) { var m = form.querySelector('.form-msg'); if (m) { m.textContent = text; m.classList.toggle('bad', !!bad); } }

  /* ------------------------------------------------------------------ actions */
  function save() {
    syncDraft();
    pruneFallbacks();
    var key = S.draftKey, job;
    if (S.draft.page) {
      var pg = S.draft.page;
      var row = { id: pg.id, parent_id: pg.parent_id || null, sort: pg.sort || 0, name: plain(pg.name) || pg.id, ib: plain(pg.ib), status: pg.status,
        image: pg.image || '', card: pg.card || '', related: pg.related || [], content: pg.content };
      if (!row.content.diagram) delete row.content.diagram;
      job = sb.from('pages').update(row).eq('id', pg.id).then(q).then(function () {
        return sb.from('page_private').upsert({ page_id: pg.id, content: S.draft.priv }).then(q);
      });
    } else {
      var rows = ['home', 'decisions', 'fonts'].map(function (k) { return { key: k, value: S.draft.site[k] }; });
      job = sb.from('site').upsert(rows).then(q);
    }
    var btn = document.querySelector('#editbar [data-act="save"]'); if (btn) btn.disabled = true;
    return job.then(function () { return loadPublic(); }).then(loadPrivate).then(function () {
      S.dirty = false; S.draft = null; S.edit = false; toast(t('saved')); render();
    }).catch(function (e) { prefillLang(); fail(e); }).then(function () { if (btn) btn.disabled = false; });
  }

  function listAction(act, listPath, i, tpl) {
    syncDraft();
    var arr = getPath(S.draft, listPath);
    if (!Array.isArray(arr)) { arr = []; setPath(S.draft, listPath, arr); }
    if (act === 'add') arr.push(TPL[tpl] ? TPL[tpl]() : '');
    else if (act === 'del') { if (!window.confirm(t('confirm_remove'))) return; arr.splice(i, 1); }
    else if (act === 'up' && i > 0) arr.splice(i - 1, 0, arr.splice(i, 1)[0]);
    else if (act === 'down' && i < arr.length - 1) arr.splice(i + 1, 0, arr.splice(i, 1)[0]);
    S.dirty = true;
    keepScroll(render);
  }
  function keepScroll(fn) { var y = window.scrollY; fn(); window.scrollTo(0, y); }

  var savedRange = null;
  function richCmd(cmd) {
    var el = document.activeElement;
    if (!el || !el.isContentEditable) return;
    if (cmd === 'link') {
      var url = window.prompt(t('link_url'), 'https://');
      if (url === null) return;
      if (!url || url === 'https://') document.execCommand('unlink');
      else if (/^(https?:|mailto:|#)/i.test(url)) document.execCommand('createLink', false, url);
    } else if (cmd === 'image') {
      var sel = window.getSelection(); savedRange = sel.rangeCount ? sel.getRangeAt(0).cloneRange() : null;
      var target = el;
      pickFile('image/*').then(function (files) {
        if (!files.length) return;
        toast(t('uploading'));
        return upload(PUBLIC_BUCKET, files[0], 'inline').then(function (url) {
          target.focus();
          if (savedRange) { var s = window.getSelection(); s.removeAllRanges(); s.addRange(savedRange); }
          document.execCommand('insertImage', false, url);
          S.dirty = true;
        });
      }).catch(fail);
      return;
    } else if (cmd === 'list') document.execCommand('insertUnorderedList');
    else if (cmd === 'clear') document.execCommand('removeFormat');
    else document.execCommand(cmd);
    S.dirty = true;
  }

  function importSeed(form) {
    var seedFile = form.seed.files[0], imgs = Array.prototype.slice.call(form.imgs.files || []);
    if (!seedFile) return;
    var btn = form.querySelector('button[type=submit]'); btn.disabled = true;
    msg(form, t('uploading'));
    seedFile.text().then(function (txt) {
      var seed = JSON.parse(txt);
      var byName = {}; imgs.forEach(function (f) { byName[f.name] = f; });
      var chain = Promise.resolve();
      var pages = (seed.pages || []).map(function (p) { var x = clone(p); return x; });
      // insert without parents first, then set parents (avoids order problems)
      chain = chain.then(function () {
        return sb.from('pages').upsert(pages.map(function (p) { var x = clone(p); x.parent_id = null; return x; })).then(q);
      }).then(function () {
        return Promise.all(pages.filter(function (p) { return p.parent_id; }).map(function (p) {
          return sb.from('pages').update({ parent_id: p.parent_id }).eq('id', p.id).then(q);
        }));
      });
      var uploaded = {};
      Object.keys(byName).forEach(function (name) {
        chain = chain.then(function () {
          msg(form, t('uploading') + ' ' + name);
          var path = 'evid/' + name;
          return sb.storage.from(PRIVATE_BUCKET).upload(path, byName[name], { upsert: true, contentType: byName[name].type || undefined })
            .then(function (r) { q(r); uploaded[name] = path; });
        });
      });
      chain = chain.then(function () {
        var rows = (seed.private || []).map(function (r) {
          var c = clone(r.content);
          (c.figs || []).forEach(function (f) { if (!f.path && f.file) f.path = 'evid/' + f.file; });
          return { page_id: r.page_id, content: c };
        });
        return sb.from('page_private').upsert(rows).then(q);
      }).then(function () {
        var rows = Object.keys(seed.site || {}).map(function (k) { return { key: k, value: seed.site[k] }; });
        return rows.length ? sb.from('site').upsert(rows).then(q) : null;
      });
      return chain;
    }).then(function () { return loadPublic(); }).then(loadPrivate).then(function () {
      msg(form, t('import_done')); renderChrome();
    }).catch(function (e) { msg(form, t('error') + ' ' + (e.message || e), true); console.error(e); })
      .then(function () { btn.disabled = false; });
  }
  function backup() {
    Promise.all([sb.from('pages').select('*'), sb.from('page_private').select('*'), sb.from('site').select('*'), sb.from('squads').select('name')]).then(function (r) {
      var data = { version: 1, exported_at: new Date().toISOString(), pages: q(r[0]), private: q(r[1]), site: {}, squads: q(r[3]) };
      (q(r[2]) || []).forEach(function (x) { data.site[x.key] = x.value; });
      var a = document.createElement('a');
      a.href = URL.createObjectURL(new Blob([JSON.stringify(data, null, 1)], { type: 'application/json' }));
      a.download = '9e-backup-' + new Date().toISOString().slice(0, 10) + '.json';
      document.body.appendChild(a); a.click(); a.remove();
    }).catch(fail);
  }

  /* ------------------------------------------------------------------ events */
  document.addEventListener('click', function (e) {
    var el = e.target.closest('[data-act]');
    if (el) {
      var act = el.getAttribute('data-act');
      if (act === 'login') { e.preventDefault(); openLogin(); return; }
      if (act === 'close-dlg') { closeLogin(); return; }
      if (act === 'logout') { e.preventDefault(); if (!leaveEditOk()) return; S.edit = false; sb.auth.signOut().catch(fail); return; }
      if (act === 'toggle-edit') {
        if (S.edit && !leaveEditOk()) return;
        S.edit = !S.edit; S.draft = null; S.dirty = false; render(); return;
      }
      if (act === 'save') { save(); return; }
      if (act === 'discard') { S.draft = null; S.dirty = false; S.edit = false; render(); return; }
      if (act === 'add' || act === 'del' || act === 'up' || act === 'down') {
        listAction(act, el.getAttribute('data-list'), parseInt(el.getAttribute('data-i') || '0', 10), el.getAttribute('data-tpl')); return;
      }
      if (act === 'img') {
        var target = el.getAttribute('data-target');
        pickFile('image/*').then(function (files) {
          if (!files.length) return;
          syncDraft(); toast(t('uploading'));
          return upload(PUBLIC_BUCKET, files[0], 'img').then(function (url) { setPath(S.draft, target, url); S.dirty = true; keepScroll(render); });
        }).catch(fail);
        return;
      }
      if (act === 'add-fig') {
        pickFile('image/*', true).then(function (files) {
          if (!files.length) return;
          syncDraft(); toast(t('uploading'));
          var pid = S.draft.page.id;
          return Promise.all(files.map(function (f) { return upload(PRIVATE_BUCKET, f, 'evid/' + pid); })).then(function (paths) {
            paths.forEach(function (p, i) { S.draft.priv.figs.push({ path: p, alt: files[i].name.replace(/\.[^.]+$/, ''), cap: { ca: '' } }); });
            S.dirty = true; keepScroll(render);
          });
        }).catch(fail);
        return;
      }
      if (act === 'add-file') {
        pickFile('', true).then(function (files) {
          if (!files.length) return;
          syncDraft(); toast(t('uploading'));
          var pid = S.draft.page.id;
          return Promise.all(files.map(function (f) { return upload(PRIVATE_BUCKET, f, 'files/' + pid); })).then(function (paths) {
            paths.forEach(function (p, i) {
              var title = {}; title[S.lang] = files[i].name.replace(/\.[^.]+$/, ''); if (!title.ca) title.ca = title[S.lang];
              S.draft.priv.downloads.push({ path: p, filename: files[i].name, size: files[i].size, title: title, desc: { ca: '' } });
            });
            S.dirty = true; keepScroll(render);
          });
        }).catch(fail);
        return;
      }
      if (act === 'download') {
        sb.storage.from(PRIVATE_BUCKET).createSignedUrl(el.getAttribute('data-path'), 120, { download: el.getAttribute('data-name') }).then(function (r) {
          var d = q(r); if (d && d.signedUrl) window.location.href = d.signedUrl;
        }).catch(fail);
        return;
      }
      if (act === 'delete-page') {
        if (!window.confirm(t('delete_page_q'))) return;
        var id = S.draft.page.id;
        sb.from('pages').delete().eq('id', id).then(q).then(function () {
          S.draft = null; S.dirty = false; S.edit = false;
          return loadPublic().then(loadPrivate);
        }).then(function () { location.hash = ''; render(); }).catch(fail);
        return;
      }
      if (act === 'addrow') {
        var tb = main.querySelector('.block-html table tbody');
        if (tb && tb.rows.length) { var tr = tb.rows[tb.rows.length - 1].cloneNode(true); Array.prototype.forEach.call(tr.cells, function (c) { c.innerHTML = '&nbsp;'; }); tb.appendChild(tr); S.dirty = true; }
        return;
      }
      if (act === 'save-member') {
        var row = el.closest('tr');
        sb.from('profiles').update({ status: row.querySelector('[name=status]').value, role: row.querySelector('[name=role]').value }).eq('id', row.getAttribute('data-id'))
          .then(q).then(function () { toast(t('saved')); }).catch(fail);
        return;
      }
      if (act === 'del-squad') {
        if (!window.confirm(t('confirm_remove'))) return;
        sb.from('squads').delete().eq('id', el.getAttribute('data-id')).then(q).then(function () { return loadPublic(); }).then(render).catch(fail);
        return;
      }
      if (act === 'backup') { backup(); return; }
      if (act === 'forgot') {
        var f = document.getElementById('f-login'), em = f.email.value.trim();
        if (!em) { msg(f, t('need_email'), true); return; }
        sb.auth.resetPasswordForEmail(em, { redirectTo: location.origin + location.pathname + '#contrasenya' }).then(function () { msg(f, t('forgot_sent')); }).catch(function (er) { msg(f, er.message, true); });
        return;
      }
    }
    // tabs
    var tab = e.target.closest('[role="tab"]');
    if (tab) { selectTab(tab, false); return; }
    // regulation refs
    var ref = e.target.closest('.ref');
    if (ref && !S.edit) {
      var d = document.getElementById(ref.getAttribute('data-ref'));
      var view = ref.closest('.view'), pid = view && view.getAttribute('data-view');
      var regTab = pid && document.getElementById(pid + '-tab-reg');
      if (!d) { if (regTab) selectTab(regTab, false); return; }
      var pan = d.closest('[role=tabpanel]');
      if (pan && pan.hidden) { var tb2 = document.querySelector('[aria-controls="' + pan.id + '"]'); if (tb2) selectTab(tb2, false); }
      d.open = true; d.classList.remove('flash'); void d.offsetWidth; d.classList.add('flash');
      window.scrollTo({ top: d.getBoundingClientRect().top + window.scrollY - 90, behavior: reduced() ? 'auto' : 'smooth' });
      return;
    }
    var tg = e.target.closest('.regs-toggle');
    if (tg) {
      var box = document.getElementById(tg.getAttribute('data-target'));
      var open = tg.getAttribute('aria-expanded') !== 'true';
      Array.prototype.forEach.call(box.querySelectorAll('details.reg'), function (x) { x.open = open; });
      tg.setAttribute('aria-expanded', open ? 'true' : 'false');
    }
  });
  function reduced() { return window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches; }
  function selectTab(t2, focus) {
    var list = t2.closest('[role=tablist]'); if (!list) return;
    Array.prototype.forEach.call(list.querySelectorAll('[role=tab]'), function (x) {
      var on = x === t2;
      x.setAttribute('aria-selected', on ? 'true' : 'false'); x.tabIndex = on ? 0 : -1;
      var p = document.getElementById(x.getAttribute('aria-controls')); if (p) p.hidden = !on;
    });
    var view = t2.closest('.view'); if (view) S.tab[view.getAttribute('data-view')] = t2.getAttribute('data-tab');
    if (focus) t2.focus();
  }
  document.addEventListener('keydown', function (e) {
    var tab = e.target.closest && e.target.closest('[role="tab"]');
    if (tab) {
      var tabs = Array.prototype.slice.call(tab.closest('[role=tablist]').querySelectorAll('[role=tab]')), i = tabs.indexOf(tab), j = null;
      if (e.key === 'ArrowRight') j = (i + 1) % tabs.length; else if (e.key === 'ArrowLeft') j = (i - 1 + tabs.length) % tabs.length;
      else if (e.key === 'Home') j = 0; else if (e.key === 'End') j = tabs.length - 1;
      if (j !== null) { e.preventDefault(); selectTab(tabs[j], true); }
    }
    if (e.target.isContentEditable && e.target.hasAttribute('data-single') && e.key === 'Enter') e.preventDefault();
    if (S.edit && (e.ctrlKey || e.metaKey) && e.key === 's' && S.draft) { e.preventDefault(); save(); }
  });
  main.addEventListener('input', function () { if (S.edit) S.dirty = true; });
  main.addEventListener('paste', function (e) {
    if (!e.target.closest || !e.target.closest('[contenteditable]')) return;
    e.preventDefault();
    var text = (e.clipboardData || window.clipboardData).getData('text/plain');
    document.execCommand('insertText', false, text);
  });
  document.getElementById('editbar').addEventListener('mousedown', function (e) {
    var b = e.target.closest('[data-cmd]'); if (!b) return;
    e.preventDefault(); richCmd(b.getAttribute('data-cmd'));
  });
  window.addEventListener('beforeunload', function (e) { if (S.edit && S.dirty) { e.preventDefault(); e.returnValue = ''; } });

  document.addEventListener('submit', function (e) {
    var f = e.target, fid = f.getAttribute('id');
    if (fid === 'f-login') {
      e.preventDefault();
      msg(f, '');
      sb.auth.signInWithPassword({ email: f.email.value.trim(), password: f.password.value }).then(function (r) {
        if (r.error) { msg(f, t('bad_login'), true); return; }
        closeLogin();
      }).catch(function () { msg(f, t('bad_login'), true); });
    } else if (fid === 'f-register') {
      e.preventDefault();
      var v = {}; ['email', 'password', 'password2', 'first_name', 'last_name', 'nom_guerre', 'esquadra'].forEach(function (k) { v[k] = (f[k].value || '').trim(); });
      v.password = f.password.value; v.password2 = f.password2.value;
      if (Object.keys(v).some(function (k) { return !v[k]; }) || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v.email)) { msg(f, t('required'), true); return; }
      if (v.password.length < 8) { msg(f, t('pw_short'), true); return; }
      if (v.password !== v.password2) { msg(f, t('pw_mismatch'), true); return; }
      f.querySelector('button[type=submit]').disabled = true;
      sb.auth.signUp({ email: v.email, password: v.password, options: { emailRedirectTo: location.origin + location.pathname,
        data: { first_name: v.first_name, last_name: v.last_name, nom_guerre: v.nom_guerre, esquadra: v.esquadra, lang: S.lang } } }).then(function (r) {
        if (r.error) throw r.error;
        f.reset(); msg(f, t('signup_ok'));
      }).catch(function (er) { msg(f, t('error') + ' ' + er.message, true); })
        .then(function () { f.querySelector('button[type=submit]').disabled = false; });
    } else if (fid === 'f-profile') {
      e.preventDefault();
      var upd = {}; ['first_name', 'last_name', 'nom_guerre', 'esquadra'].forEach(function (k) { upd[k] = (f[k].value || '').trim(); });
      if (Object.keys(upd).some(function (k) { return !upd[k]; })) { msg(f, t('required'), true); return; }
      sb.from('profiles').update(upd).eq('id', S.session.user.id).then(q).then(loadProfile).then(function () { renderChrome(); msg(f, t('saved')); })
        .catch(function (er) { msg(f, t('error') + ' ' + er.message, true); });
    } else if (fid === 'f-password') {
      e.preventDefault();
      if (f.password.value.length < 8) { msg(f, t('pw_short'), true); return; }
      if (f.password.value !== f.password2.value) { msg(f, t('pw_mismatch'), true); return; }
      sb.auth.updateUser({ password: f.password.value }).then(function (r) { if (r.error) throw r.error; f.reset(); msg(f, t('pw_changed')); })
        .catch(function (er) { msg(f, t('error') + ' ' + er.message, true); });
    } else if (fid === 'f-squad') {
      e.preventDefault();
      var name = f.name.value.trim(); if (!name) return;
      sb.from('squads').insert({ name: name }).then(q).then(function () { return loadPublic(); }).then(render).catch(fail);
    } else if (fid === 'f-import') {
      e.preventDefault(); importSeed(f);
    } else if (fid === 'f-newpage') {
      e.preventDefault();
      var id = f.pid.value.trim();
      if (!/^[a-z0-9][a-z0-9-]{0,59}$/.test(id)) { msg(f, t('id_bad'), true); return; }
      if (S.byId[id] || SPECIAL[id]) { msg(f, t('id_taken'), true); return; }
      var name2 = f.pname.value.trim(), h2 = {}; h2.ca = f.h2.value.trim() || name2; if (S.lang !== 'ca' && f.h2.value.trim()) h2[S.lang] = f.h2.value.trim();
      var row = { id: id, parent_id: f.parent.value || null, sort: parseInt(f.sort.value, 10) || 0, name: name2, ib: name2, status: 'pending', image: '', card: '', related: [],
        content: { h2: h2, lead: { ca: '' }, desc: { ca: [''] }, parts: { ca: [] }, info: { ca: [] }, std: { ca: '' }, just: { ca: '' }, gaps: { ca: [] } } };
      sb.from('pages').insert(row).then(q).then(function () {
        return sb.from('page_private').upsert({ page_id: id, content: { narr: { ca: '' }, regs: [], evid: { ca: '' }, figs: [], downloads: [] } }).then(q);
      }).then(function () { return loadPublic(); }).then(loadPrivate).then(function () {
        S.edit = true; S.draft = null; location.hash = id;
      }).catch(function (er) { msg(f, t('error') + ' ' + er.message, true); });
    }
  });
  document.addEventListener('input', function (e) {
    var f = e.target.form;
    if (!f || f.getAttribute('id') !== 'f-newpage') return;
    if (e.target.name === 'pname' && !f.pid.dataset.touched) f.pid.value = slug(e.target.value);
    if (e.target.name === 'pid') f.pid.dataset.touched = '1';
  });

  document.getElementById('lang-select').addEventListener('change', function (e) {
    syncDraft(); pruneFallbacks();
    S.lang = e.target.value;
    try { localStorage.setItem('9e-lang', S.lang); } catch (er) { /* ignore */ }
    prefillLang();
    searchIndex = null;
    keepScroll(render);
  });

  /* ------------------------------------------------------------------ side menu */
  (function () {
    var mbtn = document.getElementById('menu-btn'), mpanel = document.getElementById('menu-panel');
    var backdrop = document.getElementById('side-backdrop'), closeBtn = document.getElementById('side-close');
    var pinned = false, timer = null, canHover = window.matchMedia && matchMedia('(hover: hover)').matches;
    function setMenu(open, pin) {
      clearTimeout(timer); pinned = open && !!pin;
      mpanel.classList.toggle('open', open); mpanel.setAttribute('aria-hidden', open ? 'false' : 'true');
      if ('inert' in mpanel) mpanel.inert = !open;
      mbtn.setAttribute('aria-expanded', open ? 'true' : 'false'); backdrop.hidden = !pinned;
    }
    setMenu(false);
    function laterClose() { clearTimeout(timer); timer = setTimeout(function () { if (!pinned) setMenu(false); }, 280); }
    if (canHover) {
      mbtn.addEventListener('mouseenter', function () { if (!pinned) setMenu(true, false); });
      mbtn.addEventListener('mouseleave', laterClose);
      mpanel.addEventListener('mouseenter', function () { clearTimeout(timer); });
      mpanel.addEventListener('mouseleave', laterClose);
    }
    mbtn.addEventListener('click', function (e) { e.stopPropagation(); if (pinned) setMenu(false); else setMenu(true, true); });
    closeBtn.addEventListener('click', function () { setMenu(false); mbtn.focus(); });
    backdrop.addEventListener('click', function () { setMenu(false); });
    mpanel.addEventListener('click', function (e) { if (e.target.closest('a')) setMenu(false); });
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && mpanel.classList.contains('open')) { setMenu(false); mbtn.focus(); } });
  })();

  /* ------------------------------------------------------------------ search (current language, members also search private texts) */
  var searchIndex = null, sItems = [], sSel = -1;
  function norm(s) { return String(s).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase(); }
  function buildIndex() {
    var idx = [];
    function add(view, title, tab, html) { var tx = plain(html); if (tx.length > 1) idx.push({ view: view, title: title, tab: tab, text: tx, n: norm(tx) }); }
    var h = S.site.home || {};
    ['lead1', 'lead2', 'lead3', 'crit'].forEach(function (k) { add('home', t('home'), null, L(h[k])); });
    ['decisions', 'fonts'].forEach(function (k) { var b = S.site[k] || {}; add(k, plain(L(b.title)), null, L(b.html)); });
    S.order.forEach(function (id) {
      var p = S.byId[id], c = p.content || {}, title = S.num[id] + ' · ' + plain(L(c.h2) || p.name);
      add(id, title, null, L(c.lead)); LA(c.desc).forEach(function (x) { add(id, title, null, x); });
      LA(c.parts).forEach(function (r) { add(id, title, 'parts', r[0] + ': ' + r[1]); });
      LA(c.info).forEach(function (r) { add(id, title, null, r[0] + ': ' + r[1]); });
      add(id, title, 'std', L(c.std)); add(id, title, 'std', L(c.just));
      LA(c.gaps).forEach(function (x) { add(id, title, 'gaps', x); });
      var pr = S.priv[id];
      if (pr) {
        add(id, title, 'reg', L(pr.narr));
        (pr.regs || []).forEach(function (r) { (r.parts || []).forEach(function (x) { add(id, title, 'reg', r.year + ' ' + r.name + ' — ' + (S.lang === 'fr' ? x.fr : L(x.tr) || x.fr)); }); });
        add(id, title, 'evid', L(pr.evid));
        (pr.figs || []).forEach(function (f) { add(id, title, 'evid', L(f.cap)); });
        (pr.downloads || []).forEach(function (d) { add(id, title, 'dl', L(d.title) + ' ' + L(d.desc)); });
      }
    });
    return idx;
  }
  var qIn = document.getElementById('q'), sBox = document.getElementById('s-results');
  function sClose() { sBox.hidden = true; qIn.setAttribute('aria-expanded', 'false'); sSel = -1; }
  function sRun() {
    var qq = norm(qIn.value.trim());
    if (qq.length < 2 || !S.ready) { sClose(); return; }
    if (!searchIndex) searchIndex = buildIndex();
    var terms = qq.split(/\s+/).filter(Boolean);
    var hits = searchIndex.filter(function (e) { return terms.every(function (x) { return e.n.indexOf(x) > -1; }); }).slice(0, 40);
    sBox.innerHTML = ''; sItems = []; sSel = -1;
    if (!hits.length) sBox.innerHTML = '<div class="s-empty">' + esc(t('none')) + '</div>';
    var last = null;
    hits.forEach(function (e, i) {
      if (e.view !== last) { var g = document.createElement('div'); g.className = 's-group'; g.textContent = e.title; sBox.appendChild(g); last = e.view; }
      var a = document.createElement('a'); a.className = 's-item'; a.href = '#' + e.view; a.id = 's-opt-' + i;
      a.setAttribute('role', 'option'); a.setAttribute('aria-selected', 'false');
      var k = e.n.indexOf(terms[0]), st = Math.max(0, k - 50);
      var snip = (st > 0 ? '…' : '') + e.text.slice(st, st + 170) + (st + 170 < e.text.length ? '…' : '');
      var out = esc(snip);
      terms.forEach(function (term) {
        var ns = norm(out), res = '', pos = 0, j;
        while ((j = ns.indexOf(term, pos)) > -1) { res += out.slice(pos, j) + '<mark>' + out.slice(j, j + term.length) + '</mark>'; pos = j + term.length; }
        out = res + out.slice(pos);
      });
      a.innerHTML = '<span class="s-snip">' + out + '</span>';
      a.addEventListener('mousedown', function (ev) { ev.preventDefault(); sGo(e, terms[0]); });
      sBox.appendChild(a); sItems.push({ a: a, e: e, term: terms[0] });
    });
    sBox.hidden = false; qIn.setAttribute('aria-expanded', 'true');
  }
  function sGo(e, term) {
    sClose(); qIn.blur();
    if (e.tab) S.tab[e.view] = e.tab;
    if (routeId() !== e.view) location.hash = e.view; else render();
    setTimeout(function () {
      var scope = main;
      if (e.tab) { var pan = document.getElementById(e.view + '-panel-' + e.tab); if (pan) scope = pan; }
      var w = document.createTreeWalker(scope, NodeFilter.SHOW_TEXT), node, found = null;
      while ((node = w.nextNode())) { if (norm(node.nodeValue).indexOf(term) > -1) { found = node.parentElement; break; } }
      if (!found) return;
      var d = found.closest('details'); if (d) d.open = true;
      window.scrollTo({ top: found.getBoundingClientRect().top + window.scrollY - 110, behavior: reduced() ? 'auto' : 'smooth' });
      found.classList.remove('flash-hit'); void found.offsetWidth; found.classList.add('flash-hit');
    }, 80);
  }
  qIn.addEventListener('input', sRun);
  qIn.addEventListener('focus', function () { if (qIn.value.trim().length > 1) sRun(); });
  qIn.addEventListener('blur', function () { setTimeout(sClose, 120); });
  qIn.addEventListener('keydown', function (ev) {
    function mark(i) { sItems.forEach(function (it, j) { it.a.setAttribute('aria-selected', j === i ? 'true' : 'false'); }); sSel = i; if (sItems[i]) { sItems[i].a.scrollIntoView({ block: 'nearest' }); qIn.setAttribute('aria-activedescendant', sItems[i].a.id); } }
    if (ev.key === 'ArrowDown') { ev.preventDefault(); if (sItems.length) mark(Math.min(sItems.length - 1, sSel + 1)); }
    else if (ev.key === 'ArrowUp') { ev.preventDefault(); if (sItems.length) mark(Math.max(0, sSel - 1)); }
    else if (ev.key === 'Enter') { if (sItems.length) { ev.preventDefault(); var it = sItems[Math.max(0, sSel)]; sGo(it.e, it.term); } }
    else if (ev.key === 'Escape') sClose();
  });
  document.addEventListener('keydown', function (ev) {
    if (ev.key === '/' && document.activeElement !== qIn && !/INPUT|TEXTAREA|SELECT/.test(document.activeElement.tagName) && !document.activeElement.isContentEditable) { ev.preventDefault(); qIn.focus(); }
  });

  /* ------------------------------------------------------------------ start */
  try { var sl = localStorage.getItem('9e-lang'); if (LANGS.indexOf(sl) > -1) S.lang = sl; } catch (er) { /* ignore */ }
  window.addEventListener('hashchange', route);

  function afterAuth() {
    return loadProfile().then(loadPrivate).then(function () {
      searchIndex = null;
      if (!isAdmin()) { S.edit = false; S.draft = null; }
      render();
    }).catch(fail);
  }
  function start() {
    main.innerHTML = '<p class="muted loading">' + esc(t('loading')) + '</p>';
    if (!sb) { main.innerHTML = '<p class="muted">' + esc(t('load_err')) + ' (config.js)</p>'; return; }
    sb.auth.getSession().then(function (r) {
      S.session = r.data && r.data.session || null;
      return loadPublic();
    }).then(loadProfile).then(loadPrivate).then(function () {
      S.ready = true; route();
    }).catch(function (e) { console.error(e); main.innerHTML = '<p class="muted">' + esc(t('load_err')) + '</p>'; });

    sb.auth.onAuthStateChange(function (event, session) {
      // run outside the auth callback (supabase-js recommends not awaiting inside it)
      setTimeout(function () {
        var had = S.session && S.session.user.id, now = session && session.user.id;
        S.session = session || null;
        if (event === 'PASSWORD_RECOVERY') { location.hash = 'contrasenya'; }
        if (!S.ready) return;
        if (had !== now || event === 'USER_UPDATED') afterAuth();
      }, 0);
    });
  }
  window.__app = { S: S, render: render }; // for debugging and tests
  start();
})();
