/* 9e Léger uniform guide — single-page app on Supabase.
   Read mode by default; members see regulations, evidence and downloads; administrators edit everything. */
(function () {
  'use strict';

  var CFG = window.APP_CONFIG || {};
  var I = window.I18N;
  var LANGS = ['ca', 'en', 'it', 'fr', 'de'];
  var FLAGS = {
    ca: '<svg class="flag" viewBox="0 0 18 12" aria-hidden="true"><rect width="18" height="12" fill="#fcdd09"/><path d="M0 1.33h18v1.34H0zM0 4h18v1.33H0zM0 6.67h18V8H0zM0 9.33h18v1.34H0z" fill="#da121a"/></svg>',
    en: '<svg class="flag" viewBox="0 0 60 30" aria-hidden="true"><clipPath id="fl-uk"><path d="M0 0v30h60V0z"/></clipPath><g clip-path="url(#fl-uk)"><path d="M0 0v30h60V0z" fill="#012169"/><path d="M0 0l60 30m0-30L0 30" stroke="#fff" stroke-width="6"/><path d="M0 0l60 30m0-30L0 30" stroke="#c8102e" stroke-width="2.4"/><path d="M30 0v30M0 15h60" stroke="#fff" stroke-width="10"/><path d="M30 0v30M0 15h60" stroke="#c8102e" stroke-width="6"/></g></svg>',
    it: '<svg class="flag" viewBox="0 0 3 2" aria-hidden="true"><rect width="1" height="2" fill="#009246"/><rect x="1" width="1" height="2" fill="#fff"/><rect x="2" width="1" height="2" fill="#ce2b37"/></svg>',
    fr: '<svg class="flag" viewBox="0 0 3 2" aria-hidden="true"><rect width="1" height="2" fill="#002395"/><rect x="1" width="1" height="2" fill="#fff"/><rect x="2" width="1" height="2" fill="#ed2939"/></svg>',
    de: '<svg class="flag" viewBox="0 0 5 3" aria-hidden="true"><rect width="5" height="1" fill="#000"/><rect y="1" width="5" height="1" fill="#dd0000"/><rect y="2" width="5" height="1" fill="#ffce00"/></svg>'
  };
  var LANG_NAMES = { ca: 'Català', en: 'English', it: 'Italiano', fr: 'Français', de: 'Deutsch' };
  var LOCKED = { reg: 1, evid: 1, model9: 1, dl: 1 };
  var PUBLIC_BUCKET = 'public-media', PRIVATE_BUCKET = 'private-media';

  var sb = window.__SB || (window.supabase && CFG.SUPABASE_URL && CFG.SUPABASE_URL.indexOf('YOUR-') < 0
    ? window.supabase.createClient(CFG.SUPABASE_URL, CFG.SUPABASE_ANON_KEY) : null);

  var S = {
    lang: 'en', session: null, profile: null,
    pages: [], byId: {}, priv: {}, site: {}, squads: [],
    num: {}, order: [], children: {}, tab: {},
    edit: false, draft: null, draftKey: null, prefilled: [], dirty: false,
    urls: {}, ready: false
  };

  var main = document.getElementById('main');

  /* ------------------------------------------------------------------ small helpers */
  function t(k) { var d = I[k]; return d ? (d[S.lang] || d.en || d.ca) : k; }
  function has(v) { return v != null && v !== '' && !(Array.isArray(v) && !v.length); }
  function L(d) { if (d == null) return ''; if (typeof d !== 'object') return d; if (has(d[S.lang])) return d[S.lang]; if (has(d.en)) return d.en; if (has(d.ca)) return d.ca; for (var k in d) if (has(d[k])) return d[k]; return ''; }
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
    if (!o || typeof o !== 'object' || Array.isArray(o)) return false;
    var n = 0;
    for (var k in o) { if (LANGS.indexOf(k) < 0) return false; n++; }
    return n > 0;
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
  /* progress banner (top right): one row per running job; stays until the job ends */
  var BUSY = [];
  function busy(label, total) {
    var job = { label: label, total: total || 0, done: 0, state: 'run' };
    job.set = function (l) { job.label = l; drawBusy(); return job; };
    job.tick = function () { job.done++; drawBusy(); return job; };
    job.end = function (ok) {
      if (job.state !== 'run') return;
      job.state = ok === false ? 'bad' : 'ok'; drawBusy();
      setTimeout(function () { var i = BUSY.indexOf(job); if (i > -1) BUSY.splice(i, 1); drawBusy(); }, ok === false ? 5000 : 1800);
    };
    BUSY.push(job); drawBusy();
    return job;
  }
  function track(label, p) {
    var b = busy(label);
    return Promise.resolve(p).then(function (v) { b.end(true); return v; }, function (e) { b.end(false); throw e; });
  }
  function isBusy() { return BUSY.some(function (j) { return j.state === 'run'; }); }
  function drawBusy() {
    var el = document.getElementById('busy'); if (!el) return;
    el.hidden = !BUSY.length;
    el.innerHTML = BUSY.map(function (j) {
      var pct = j.total ? Math.round(100 * j.done / j.total) : 0;
      var ico = j.state === 'run' ? '<span class="busy-spin" aria-hidden="true"></span>' : '<span class="busy-ico" aria-hidden="true">' + (j.state === 'ok' ? '✓' : '✕') + '</span>';
      var lbl = j.state === 'run' ? j.label : j.label + ' · ' + t(j.state === 'ok' ? 'busy_done' : 'busy_failed');
      return '<div class="busy-row ' + j.state + '">' + ico + '<span class="busy-lbl">' + esc(lbl) + '</span>' +
        (j.total ? '<span class="busy-n">' + j.done + ' / ' + j.total + '</span>' : '') +
        '<span class="busy-bar' + (j.total || j.state !== 'run' ? '' : ' ind') + '"><i style="width:' + (j.state === 'ok' ? 100 : (j.total ? pct : 35)) + '%"></i></span></div>';
    }).join('');
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
    ca: { shako: ['shakos', 'shako'], cordon: ['cordons', 'cordon', 'cordó'], plaque: ['plaque de shako', 'placa 1807', 'plaque', 'plaques', 'placa'], plumet: ['plomalls', 'plomall', 'plumet'], cocarde: ['escarapel·la', 'cocarde'], pompon: ['pompoms', 'pompom', 'pompon'], col: ['cols', 'col'], veste: ['veste', 'gilet'], pantalon: ['pantaló', 'pantalon', 'calçons'], guetres: ['polaines', 'polaina', 'guêtres'], habit: ['habit-veste', 'habit'], boutons: ['botons', 'boutons'], epaulettes: ['epaulettes', 'epaulette', 'épaulettes'], giberne: ['giberna', 'giberne'], briquet: ['sabre-briquet', 'briquet'], dragonne: ['dragonne', 'dragona'], buffleterie: ['buffleteria', 'buffleterie', 'porte-giberne', 'baudrier'], 'havresac': ["motxilles", "motxilla", "havresac"], 'sac-distribution': ["sac de distribució", "sac à distribution"], 'bonnet-police': ["bonnet de police"], 'capote': ["capots", "capot", "capote"], 'fiole': ["flascó d'oli", "fiole"], 'chemise': ["camises", "camisa"], 'souliers': ["sabates", "sabata", "souliers"], 'bas': ["mitges", "bas de laine", "bas de fil"], 'mouchoirs': ["mocadors", "mocador"], 'bonnet-nuit': ["bonnet de nuit", "gorro de dormir"], 'culotte-toile': ["calçons de tela"], 'sac-poudre': ["sac de pólvores", "sac à poudre"], 'peignes': ["pintes", "pinta"], 'brosses': ["raspalls", "raspall"], 'pinceau': ["pinzell"], 'trousse': ["trousse", "necesser"], 'ruban-queue': ["cinta de la cua", "ruban de queue"], 'tire-bouton': ["tire-bouton"], 'alene': ["alena", "alêne"], 'tire-bourre': ["tire-bourre"], 'livret': ["llibreta de comptes", "livret"], 'monte-ressort': ["monte-ressort"], 'tourne-vis': ["tornavís", "tourne-vis"], 'epinglette': ["épinglette", "agulla de neteja"] },
    en: { shako: ['shakos', 'shako'], cordon: ['cordon', 'shako cords'], plaque: ['shako plate', '1807 plate', 'plaque'], plumet: ['plumes', 'plume', 'plumet'], cocarde: ['cockade', 'cocarde'], pompon: ['pompons', 'pompon'], col: ['stocks', 'stock'], veste: ['waistcoat', 'veste', 'gilet'], pantalon: ['trousers', 'pantalon'], guetres: ['gaiters', 'guêtres'], habit: ['habit-veste', 'coat', 'habit'], boutons: ['buttons', 'boutons'], epaulettes: ['epaulettes', 'epaulette', 'épaulettes'], giberne: ['cartridge box', 'giberne'], briquet: ['sabre-briquet', 'briquet'], dragonne: ['sword knot', 'dragonne'], buffleterie: ['buff equipment', 'buffleterie', 'porte-giberne', 'baudrier'], 'havresac': ["knapsacks", "knapsack", "havresac"], 'sac-distribution': ["distribution bag"], 'bonnet-police': ["forage cap", "bonnet de police"], 'capote': ["greatcoats", "greatcoat"], 'fiole': ["oil flask"], 'chemise': ["shirts", "shirt"], 'souliers': ["shoes"], 'bas': ["stockings"], 'mouchoirs': ["handkerchiefs", "handkerchief"], 'bonnet-nuit': ["nightcap"], 'culotte-toile': ["linen breeches"], 'sac-poudre': ["powder bag"], 'peignes': ["combs", "comb"], 'brosses': ["brushes"], 'pinceau': ["pinceau"], 'trousse': ["housewife", "trousse"], 'ruban-queue': ["queue ribbon"], 'tire-bouton': ["button hook"], 'alene': ["awl"], 'tire-bourre': ["tire-bourre"], 'livret': ["account book"], 'monte-ressort': ["mainspring vice", "monte-ressort"], 'tourne-vis': ["turnscrew"], 'epinglette': ["vent pick"] },
    it: { shako: ['shako'], cordon: ['cordoni', 'cordone', 'cordon'], plaque: ['placca 1807', 'placca dello shako', 'plaque', 'placca'], plumet: ['pennacchi', 'pennacchio', 'plumet'], cocarde: ['coccarda', 'cocarde'], pompon: ['pompon'], col: ['colletti', 'colletto'], veste: ['panciotto', 'veste', 'gilet'], pantalon: ['pantaloni', 'pantalone', 'pantalon'], guetres: ['ghette', 'guêtres'], habit: ['habit-veste', 'abito', 'habit'], boutons: ['bottoni', 'boutons'], epaulettes: ['spalline', 'spallina', 'épaulettes'], giberne: ['giberna', 'giberne'], briquet: ['sabre-briquet', 'briquet'], dragonne: ['dragona', 'dragonne'], buffleterie: ['cuoiame', 'buffleterie', 'porte-giberne', 'baudrier'], 'havresac': ["zaini", "zaino"], 'sac-distribution': ["sacco da distribuzione"], 'bonnet-police': ["bonnet de police"], 'capote': ["cappotti", "cappotto"], 'fiole': ["fiaschetta d'olio"], 'chemise': ["camicie", "camicia"], 'souliers': ["scarpe"], 'bas': ["calze"], 'mouchoirs': ["fazzoletti", "fazzoletto"], 'bonnet-nuit': ["berretto da notte"], 'culotte-toile': ["calzoni di tela"], 'sac-poudre': ["sacchetto della cipria"], 'peignes': ["pettini", "pettine"], 'brosses': ["spazzole", "spazzola"], 'pinceau': ["pennello"], 'trousse': ["trousse"], 'ruban-queue': ["nastro del codino"], 'tire-bouton': ["tire-bouton"], 'alene': ["lesina"], 'tire-bourre': ["tire-bourre"], 'livret': ["libretto dei conti"], 'monte-ressort': ["monte-ressort"], 'tourne-vis': ["cacciavite"], 'epinglette': ["épinglette"] },
    fr: { shako: ['shakos', 'shako'], cordon: ['cordons', 'cordon'], plaque: ['plaque de shako', 'plaque 1807', 'plaque losangée', 'plaque'], plumet: ['plumets', 'plumet'], cocarde: ['cocarde'], pompon: ['pompons', 'pompon', 'houppe'], col: ['cols', 'col'], veste: ['veste', 'gilet'], pantalon: ['pantalon'], guetres: ['guêtres', 'guêtre'], habit: ['habit-veste', 'habit'], boutons: ['boutons'], epaulettes: ['épaulettes', 'épaulette'], giberne: ['giberne'], briquet: ['sabre-briquet', 'briquet'], dragonne: ['dragonne'], buffleterie: ['buffleterie', 'porte-giberne', 'baudrier'], 'havresac': ["havresac", "havre-sac", "sac de peau"], 'sac-distribution': ["sacs à distribution", "sac à distribution"], 'bonnet-police': ["bonnets de police", "bonnet de police"], 'capote': ["capotes", "capote"], 'fiole': ["fiole à l'huile"], 'chemise': ["chemises", "chemise"], 'souliers': ["souliers"], 'bas': ["bas de laine", "bas de fil"], 'mouchoirs': ["mouchoirs"], 'bonnet-nuit': ["bonnet de nuit"], 'culotte-toile': ["culottes de toile", "culotte de toile"], 'sac-poudre': ["sac à poudre"], 'peignes': ["peignes", "peigne à retaper", "peigne à décrasser"], 'brosses': ["brosses"], 'pinceau': ["pinceau"], 'trousse': ["trousse"], 'ruban-queue': ["ruban de queue"], 'tire-bouton': ["tire-bouton"], 'alene': ["alêne"], 'tire-bourre': ["tire-bourre"], 'livret': ["livret de compte"], 'monte-ressort': ["monte-ressorts", "monte-ressort"], 'tourne-vis': ["tourne-vis"], 'epinglette': ["épinglettes", "épinglette"] },
    de: { shako: ['Tschakos', 'Tschako'], cordon: ['Tschakoschnur', 'Schnüre', 'Schnur'], plaque: ['Tschakoschild', 'Rautenschild', 'Schild 1807', 'Schild'], plumet: ['Federbüsche', 'Federbusch'], cocarde: ['Kokarde'], pompon: ['Pompons', 'Pompon'], col: ['Halsbinden', 'Halsbinde'], veste: ['Weste'], pantalon: ['Hose'], guetres: ['Gamaschen', 'Gamasche'], habit: ['Habit-veste', 'Rock'], boutons: ['Knöpfe'], epaulettes: ['Epauletten', 'Epaulette'], giberne: ['Patronentasche'], briquet: ['Sabre-briquet', 'Briquet'], dragonne: ['Troddel'], buffleterie: ['Lederzeug', 'Porte-giberne', 'Baudrier'], 'havresac': ["Tornister"], 'sac-distribution': ["Verpflegungssack"], 'bonnet-police': ["Lagermütze"], 'capote': ["Kapotte", "Mantel"], 'fiole': ["Ölfläschchen"], 'chemise': ["Hemden", "Hemd"], 'souliers': ["Schuhe"], 'bas': ["Strümpfe"], 'mouchoirs': ["Taschentücher"], 'bonnet-nuit': ["Nachtmütze"], 'culotte-toile': ["Leinenhose"], 'sac-poudre': ["Puderbeutel"], 'peignes': ["Kämme", "Kamm"], 'brosses': ["Bürsten"], 'pinceau': ["Pinsel"], 'trousse': ["Nähzeug"], 'ruban-queue': ["Zopfband"], 'tire-bouton': ["Knopfzieher"], 'alene': ["Ahle"], 'tire-bourre': ["Kugelzieher"], 'livret': ["Rechnungsbuch"], 'monte-ressort': ["Federspanner"], 'tourne-vis': ["Schraubenzieher"], 'epinglette': ["Räumnadel"] }
  };
  var linkRx = {};
  function buildLinkRx() {
    linkRx = {};
    LANGS.forEach(function (k) {
      var pairs = [];
      var m = TERMS[k];
      S.pages.forEach(function (p) {
        if (p.content && p.content.kind === 'section') return;
        var terms = m[p.id] ? m[p.id].slice() : [];
        if (!m[p.id] && p.name && p.name.length > 3) terms.push(p.name);
        terms.forEach(function (term) { pairs.push([term, p.id]); });
      });
      pairs.sort(function (a, b) { return b[0].length - a[0].length; });
      if (!pairs.length) return;
      var lut = {};
      pairs.forEach(function (x) { lut[x[0].toLowerCase()] = x[1]; });
      var src = pairs.map(function (x) { return x[0].replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }).join('|');
      linkRx[k] = { rx: new RegExp("(^|[^\\p{L}\\p{N}_·-])(" + src + ")(?![\\p{L}\\p{N}_·-])", 'giu'), lut: lut };
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
  var BIN = '<svg viewBox="0 0 24 24" width="15" height="15" aria-hidden="true"><path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13M10 11v6M14 11v6" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>';
  var PEN = '<svg viewBox="0 0 24 24" width="17" height="17" aria-hidden="true"><path d="M4 20l1-5L16 4l4 4L9 19l-5 1zM14 6l4 4" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/></svg>';
  // right-hand tool of an editable list row: delete
  function listBtns(listPath, i) {
    if (!S.edit) return '';
    return '<span class="row-tools"><button type="button" class="mini del" data-act="del" data-list="' + listPath + '" data-i="' + i + '" aria-label="' + esc(t('remove')) + '" title="' + esc(t('remove')) + '">' + BIN + '</button></span>';
  }
  // left-hand tool of an editable list row: drag to reorder
  function dragH(listPath, i) {
    if (!S.edit) return '';
    return '<span class="drag-h" draggable="true" data-dnd="' + listPath + '" data-i="' + i + '" title="' + esc(t('drag')) + '" aria-hidden="true">⠿</span>';
  }
  function rowAttr(listPath, i) { return S.edit ? ' data-row="' + listPath + '" data-ri="' + i + '"' : ''; }
  // pencil next to page titles: enters or leaves edit mode
  function penBtn() {
    if (!isAdmin()) return '';
    return '<button type="button" class="pen' + (S.edit ? ' on' : '') + '" data-act="toggle-edit" aria-pressed="' + S.edit + '" aria-label="' + esc(t('edit')) + '" title="' + esc(t('edit')) + '">' + PEN + '</button>';
  }
  function addBtn(listPath, tpl, label) {
    if (!S.edit) return '';
    return '<button type="button" class="add-btn" data-act="add" data-list="' + listPath + '" data-tpl="' + tpl + '">+ ' + esc(t(label)) + '</button>';
  }
  var TPL = {
    str: function () { return ''; },
    pair: function () { return ['', '']; },
    reg: function () { return { _new: true, year: '', name: '', parts: [{ label: '', fr: '', tr: { ca: '' } }] }; },
    regpart: function () { return { label: '', fr: '', tr: { ca: '' } }; },
    group: function () { return { title: { ca: '' }, desc: { ca: '' }, figs: [] }; },
    version: function () { var v = { year: '', title: {}, text: {}, specs: {}, image: '', nine: false }; v.title[S.lang] = ''; v.text[S.lang] = ''; v.specs[S.lang] = []; return v; }
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
    S.allOrder = S.order;
    S.order = S.allOrder.filter(function (id) { return !isSection(id); });
    buildLinkRx();
  }
  function isSection(id) { var p = S.byId[id]; return !!(p && p.content && p.content.kind === 'section'); }
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
    S.priv = {}; S.insp = [];
    if (!isMember()) return Promise.resolve();
    return Promise.all([sb.from('page_private').select('*'), sb.from('inspections').select('*').order('sort')]).then(function (r) {
      (q(r[0]) || []).forEach(function (row) { S.priv[row.page_id] = row.content || {}; });
      S.insp = (r[1] && !r[1].error && r[1].data) || [];
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
  function upload(bucket, file, folder, maxEdge) {
    var base = baseName(file, folder);
    var ext = (file.name.match(/\.[a-z0-9]+$/i) || [''])[0].toLowerCase();
    return (maxEdge ? shrink(file, maxEdge, IMG.q) : Promise.resolve(null)).then(function (r) {
      return r ? putBlob(bucket, r.blob, base + '.jpg', 'image/jpeg') : putBlob(bucket, file, base + ext, file.type);
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
  function isDark() {
    var th = document.documentElement.dataset.theme;
    if (th === 'dark' || th === 'light') return th === 'dark';
    return !!(window.matchMedia && matchMedia('(prefers-color-scheme: dark)').matches);
  }
  function renderChrome() {
    document.documentElement.lang = S.lang;
    document.documentElement.dataset.lang = S.lang;
    document.getElementById('lang-pick').innerHTML =
      '<button type="button" class="lang-btn" data-act="lang-open" aria-haspopup="true" aria-expanded="false" aria-label="' + esc(t('lang') + ': ' + LANG_NAMES[S.lang]) + '">' + FLAGS[S.lang] + '<span>' + S.lang.toUpperCase() + '</span></button>' +
      '<div class="lang-pop" id="lang-pop" hidden>' + LANGS.filter(function (k) { return k !== S.lang; }).map(function (k) {
        return '<button type="button" data-act="lang-set" data-lang="' + k + '" lang="' + k + '">' + FLAGS[k] + '<span>' + LANG_NAMES[k] + '</span></button>';
      }).join('') + '</div>';
    document.getElementById('q').placeholder = t('search');
    document.getElementById('menu-sr').textContent = t('menu');

    function nav(id) {
      var p = S.byId[id], kids = S.children[id] || [];
      if (isSection(id)) return '<li class="has-kids"><a href="#' + id + '" data-sec="' + id + '"><span>' + esc(plain(L((p.content || {}).h2)) || p.name || id) + '</span></a>' +
        (kids.length ? '<ol class="sub">' + kids.map(nav).join('') + '</ol>' : '') + '</li>';
      // an item and its sub-pages are separate entries, the sub-pages right after their parent
      return '<li><a href="#' + id + '" data-sec="' + id + '"><span lang="fr">' + esc(p.name || id) + '</span></a></li>' + kids.map(nav).join('');
    }
    document.getElementById('menu-body').innerHTML =
      '<ol class="extra top-link"><li><a href="#" data-sec="home"><span class="n">⌂</span><span>' + esc(t('home')) + '</span></a></li></ol>' +
      '<p>' + esc(t('index')) + '</p><ol class="menu-items">' + S.children[''].map(nav).join('') + '</ol>' +
      '<ol class="extra"><li><a href="#regulacions" data-sec="regulacions"><span class="n">§</span><span>' + esc(L((S.site.regs || {}).title) || t('regs_page')) + '</span></a></li>' +
      '<li><a href="#decisions" data-sec="decisions"><span class="n">·</span><span>' + esc(L((S.site.decisions || {}).title) || t('decisions')) + '</span></a></li>' +
      '<li><a href="#fonts" data-sec="fonts"><span class="n">·</span><span>' + esc(L((S.site.fonts || {}).title) || t('sources')) + '</span></a></li>' +
      (isAdmin() ? '<li><a href="#nova" data-sec="nova"><span class="n">+</span><span>' + esc(t('new_page')) + '</span></a></li>' : '') + '</ol>';

    var acct = document.getElementById('acct'), dark = isDark();
    if (!S.session) {
      acct.innerHTML = '<button type="button" class="btn-ghost theme-ico" data-act="theme" role="switch" aria-checked="' + dark + '" aria-label="' + esc(t('dark_mode')) + '" title="' + esc(t('dark_mode')) + '">' + (dark ? '☀' : '☾') + '</button>' +
        '<button type="button" class="btn-ghost" data-act="login">' + esc(t('login')) + '</button>';
    } else {
      var who = S.profile ? (S.profile.nom_guerre || S.profile.first_name || S.session.user.email) : S.session.user.email;
      acct.innerHTML = '<span id="bell-wrap" class="bell-wrap"></span><details class="acct-menu"><summary class="btn-ghost"><span class="acct-ico" aria-hidden="true"></span>' + esc(who) + '</summary><div class="acct-pop">' +
        '<a href="#compte">' + esc(t('account')) + '</a>' +
        (isAdmin() ? '<a href="#gestio">' + esc(t('admin')) + '</a>' : '') +
        '<button type="button" class="theme-tog" data-act="theme" role="switch" aria-checked="' + dark + '"><span>' + esc(t('dark_mode')) + '</span><span class="sw" aria-hidden="true"></span></button>' +
        '<button type="button" data-act="logout">' + esc(t('logout')) + '</button></div></details>';
      drawBell();
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
  function routeId() { return (decodeURIComponent((location.hash || '').replace(/^#/, '')) || 'home').split('~')[0]; }
  function routeAnchor() { var h = decodeURIComponent((location.hash || '').replace(/^#/, '')); return h.indexOf('~') > -1 ? h.slice(h.indexOf('~') + 1) : ''; }
  var SPECIAL = { home: 1, decisions: 1, fonts: 1, regulacions: 1, registre: 1, compte: 1, gestio: 1, nova: 1, contrasenya: 1 };

  function draftKeyFor(id) { var blk = { home: 1, decisions: 1, fonts: 1, regulacions: 1 }; if (SPECIAL[id] && !blk[id]) return null; return S.byId[id] || blk[id] ? id : null; }
  function makeDraft(id) {
    S.draftKey = id; S.dirty = false; S.prefilled = [];
    if (S.byId[id]) {
      var pg = clone(S.byId[id]);
      var pr = clone(S.priv[id] || {});
      pr.narr = pr.narr || { ca: '' }; pr.evid = pr.evid || { ca: '' }; pr.regs = pr.regs || []; pr.groups = groupsOf(pr); delete pr.figs; delete pr.wide; pr.downloads = pr.downloads || [];
      var c = pg.content = pg.content || {};
      ['h2', 'lead'].forEach(function (k) { c[k] = c[k] || { ca: '' }; });
      ['std', 'just'].forEach(function (k) { pr[k] = pr[k] || { ca: '' }; });
      ['desc', 'parts', 'info', 'gaps'].forEach(function (k) { c[k] = c[k] || { ca: [] }; });
      S.draft = { page: pg, priv: pr };
    } else {
      S.draft = { site: clone(S.site) };
      var s = S.draft.site;
      s.home = s.home || {}; ['eyebrow', 'h1', 'lead1', 'lead2', 'lead3', 'crit', 'platecap'].forEach(function (k) { s.home[k] = s.home[k] || { ca: '' }; });
      ['decisions', 'fonts'].forEach(function (k) { s[k] = s[k] || {}; s[k].title = s[k].title || { ca: '' }; s[k].html = s[k].html || { ca: '' }; });
      s.regs = s.regs || {}; ['title', 'intro_r', 'intro_i'].forEach(function (k) { s.regs[k] = s.regs[k] || { ca: '' }; });
    }
    prefillLang();
  }
  // a language with no text yet is pre-filled from English (or Catalan) so it can be edited in place
  function prefillLang() {
    if (!S.draft) return;
    (function walk(o, path) {
      if (!o || typeof o !== 'object') return;
      if (isLangDict(o)) {
        if (!has(o[S.lang])) {
          var src = has(o.en) ? 'en' : has(o.ca) ? 'ca' : null;
          if (src && src !== S.lang) { o[S.lang] = clone(o[src]); S.prefilled.push(path + '.' + S.lang); }
        }
        return;
      }
      for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k) && k !== 'diagram') walk(o[k], path ? path + '.' + k : k);
    })(S.draft, '');
  }
  function pruneFallbacks() {
    S.prefilled.forEach(function (path) {
      var p = path.split('.'), lang = p.pop(), dict = getPath(S.draft, p.join('.'));
      if (!dict) return;
      var v = JSON.stringify(dict[lang]);
      if (v === JSON.stringify(dict.en) && lang !== 'en' || v === JSON.stringify(dict.ca) && lang !== 'ca') delete dict[lang];
    });
    S.prefilled = [];
  }
  function syncDraft() {
    if (!S.draft) return;
    Array.prototype.forEach.call(main.querySelectorAll('[data-path]'), function (el) {
      var path = el.getAttribute('data-path'), v;
      if (el.isContentEditable && el.hasAttribute('data-paras')) {
        // one box for the whole description, stored as a list of paragraphs
        var box = el.cloneNode(true);
        Array.prototype.forEach.call(box.querySelectorAll('figure[data-fig]'), function (f) { var m = document.createElement('p'); m.textContent = '[[fig:' + f.getAttribute('data-fig') + ']]'; f.parentNode.replaceChild(m, f); });
        v = clean(box.innerHTML).replace(/<\/(p|div)>/gi, '\u0001').replace(/<(p|div)(\s[^>]*)?>/gi, '').replace(/(<br\s*\/?>\s*){2,}/gi, '\u0001')
          .split('\u0001').map(function (x) { return x.replace(/^(\s|&nbsp;|<br\s*\/?>)+|(\s|&nbsp;|<br\s*\/?>)+$/gi, ''); }).filter(function (x) { return plain(x); });
      } else if (el.isContentEditable) {
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
    if (isBusy()) return window.confirm(t('busy_leave'));
    if (S.edit && S.dirty) return window.confirm(t('unsaved'));
    return true;
  }

  var lastRoute = null;
  function route() {
    var id = routeId(), anc = routeAnchor();
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
    var target = anc && document.getElementById(anc);
    if (target) { if (target.tagName === 'DETAILS') target.open = true; window.scrollTo(0, target.getBoundingClientRect().top + window.scrollY - 90); }
  }

  // labelled diagrams kept as SVG files (content.dg) are fetched once and inlined so their language labels follow the page
  var DG = {};
  function loadDiagrams() {
    Array.prototype.forEach.call(main.querySelectorAll('figure[data-dg]'), function (fig) {
      var src = fig.getAttribute('data-dg');
      var put = function (t) { if (fig.isConnected) fig.innerHTML = clean(t); };
      if (DG[src]) { put(DG[src]); return; }
      fetch(src + '?v=' + (window.ASSET_V || '')).then(function (r) { return r.ok ? r.text() : ''; }).then(function (t) { if (t) { DG[src] = t; put(t); } }).catch(function () {});
    });
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
    else if (id === 'regulacions') html = regsAllView();
    else if (id === 'registre') html = registerView();
    else if (id === 'compte') html = accountView();
    else if (id === 'gestio') html = adminView();
    else if (id === 'nova') html = newPageView();
    else if (id === 'contrasenya') html = newPasswordView();
    else if (S.byId[id]) html = isSection(id) ? sectionView(id) : pageView(id);
    else html = '<section class="view"><h2 class="page-title" tabindex="-1">' + esc(t('not_found')) + '</h2><p><a href="#">' + esc(t('home')) + '</a></p></section>';
    main.innerHTML = html;
    loadDiagrams();
    Array.prototype.forEach.call(document.querySelectorAll('#menu-body a[data-sec]'), function (a) {
      var on = a.getAttribute('data-sec') === id;
      a.classList.toggle('active', on);
      if (on) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current');
    });
    fillPrivateImages();
    fillEditMeta();
    cmMount(id);
    if (id === 'gestio' && isAdmin()) loadMembers();
    document.title = (S.byId[id] ? (S.byId[id].name + ' · ') : '') + '9e Légère';
  }

  /* ------------------------------------------------------------------ views: home and text blocks */
  function homeView() {
    var site = S.edit && S.draft && S.draft.site ? S.draft.site : S.site;
    var h = site.home || {};
    var P = function (k) { return 'site.home.' + k + '.' + S.lang; };
    var V = function (k) { return S.edit ? (h[k] || {})[S.lang] : L(h[k]); };
    var row = homeRow;
    function secCard(id) {
      var p = S.byId[id], c = p.content || {}, kids = (S.children[id] || []), items = sectionItems(id);
      return '<li class="hsec-card"><a class="hsec-main" href="#' + id + '"><span class="hsec-title">' + clean(L(c.h2) || p.name) + '</span>' +
        '<span class="hsec-lead">' + esc(plain(L(c.lead))) + '</span><span class="hsec-n">' + esc(t('n_items').replace('{n}', items.length)) + '</span></a>' +
        (kids.length ? '<p class="hsec-kids">' + kids.map(tlink).join('') + '</p>' : '') + '</li>';
    }
    var tops = S.children[''], secs = tops.filter(isSection), loose = tops.filter(function (x) { return !isSection(x); });
    var plate = h.plate || 'img/lamina_9e_1809.png';
    function ab(n, extra) {
      return '<article class="about-card"><span class="about-n" aria-hidden="true">' + ('0' + n) + '</span>' +
        F(P('ab' + n + '_t'), V('ab' + n + '_t'), 'h3', '', { raw: 1, single: 1 }) + F(P('ab' + n + '_p'), V('ab' + n + '_p'), 'p', '', { raw: 1 }) + (extra || '') + '</article>';
    }
    var lock = '<span class="lock" aria-hidden="true">🔒</span>';
    var tabsStrip = '<p class="about-tabs">' + ['sum', 'parts', 'reg', 'evid', 'model9', 'dl'].map(function (k) {
      return '<span class="about-tab' + (LOCKED[k] ? ' priv' : '') + '">' + esc(t('t_' + k)) + (LOCKED[k] ? lock : '') + '</span>';
    }).join('') + '</p>';
    var decLink = '<p class="about-link"><a class="tlink" href="#decisions">' + esc(L((S.site.decisions || {}).title) || t('decisions')) + '</a></p>';
    var srcLink = '<p class="about-link"><a class="tlink" href="#fonts">' + esc(L((S.site.fonts || {}).title) || t('sources')) + '</a> <a class="tlink" href="#regulacions">' + esc(L((S.site.regs || {}).title) || t('regs_page')) + '</a></p>';
    var chips = '<p class="about-tabs">' + chip('proposed') + chip('pending') + '<span class="chip gaps">' + esc(t('t_gaps')) + '</span></p>';
    return '<section class="view home" data-view="home">' +
      '<header class="home-hero">' +
      F(P('eyebrow'), V('eyebrow'), 'div', 'eyebrow', { raw: 1, single: 1 }) +
      '<div class="piece-head">' + F(P('h1'), V('h1'), 'h1', '', { raw: 1, single: 1, attr: ' tabindex="-1"' }) + penBtn() + '</div>' +
      F(P('lead1'), V('lead1'), 'p', 'lead', { raw: 1 }) + '</header>' +
      (isAdmin() && !S.pages.length ? '<div class="locked empty-db"><div><strong>' + esc(t('empty_db_t')) + '</strong><p>' + esc(t('empty_db_p')) + '</p><p class="locked-actions"><a class="btn" href="#gestio">' + esc(t('admin')) + '</a></p></div></div>' :
      (secs.length ? '<div class="grid-head first"><h2>' + esc(t('sections_h')) + '</h2><p class="muted">' + esc(t('sections_hint')) + '</p></div>' +
        '<ul class="hsec">' + secs.map(secCard).join('') + '</ul>' : '') +
      (loose.length ? '<div class="grid-head"><h2>' + esc(t('pieces')) + '</h2><p class="muted">' + esc(t('pieces_hint')) + '</p></div>' +
        '<ul class="hlist">' + loose.map(row).join('') + '</ul>' : '')) +
      '<section class="about" aria-labelledby="about-h">' +
      F(P('about_h'), V('about_h'), 'h2', 'about-h', { raw: 1, single: 1, attr: ' id="about-h"' }) +
      '<div class="about-grid"><div class="about-list">' +
      ab(1, tabsStrip) + ab(2, srcLink) + ab(3) + ab(4, chips + decLink) + ab(5) + '</div>' +
      '<figure class="about-plate"><img src="' + imgSrc(plate) + '" alt="9e Léger soldier, 1809" loading="lazy">' +
      F(P('platecap'), V('platecap'), 'figcaption', '', { raw: 1 }) +
      (S.edit ? '<button type="button" class="btn-small" data-act="img" data-target="site.home.plate">' + esc(t('change_img')) + '</button>' : '') + '</figure>' +
      '</div></section>' +
      (isAdmin() ? '<p class="home-more"><a class="tlink" href="#nova">+ ' + esc(t('new_page')) + '</a></p>' : '') + '</section>';
  }
  function flatItems(ids) { var out = []; ids.forEach(function (x) { out.push(x); out = out.concat(flatItems(S.children[x] || [])); }); return out; }
  /* ------------------------------------------------------------------ edit history: last editor under the title, full list in a dialog */
  S.edits = {};
  function editMeta(id) { return '<div class="edit-meta" id="edit-meta" data-pid="' + esc(id) + '" hidden></div>'; }
  function fmtDate(iso, withTime) {
    try { return new Intl.DateTimeFormat(S.lang, withTime ? { dateStyle: 'medium', timeStyle: 'short' } : { dateStyle: 'medium' }).format(new Date(iso)); } catch (e) { return String(iso).slice(0, 10); }
  }
  function loadEdits(pid) {
    if (S.edits[pid]) return Promise.resolve(S.edits[pid]);
    try {
      var qb = sb.from('page_edits').select('editor_name,edited_at,fields').eq('page_id', pid).order('edited_at', { ascending: false });
      return (qb.limit ? qb.limit(200) : qb).then(function (r) { S.edits[pid] = q(r) || []; return S.edits[pid]; });
    } catch (e) { return Promise.resolve([]); }
    return sb.from('page_edits').select('editor_name,edited_at,fields').eq('page_id', pid).order('edited_at', { ascending: false }).limit(200)
      .then(function (r) { S.edits[pid] = q(r) || []; return S.edits[pid]; });
  }
  function fillEditMeta() {
    var box = document.getElementById('edit-meta'); if (!box || !sb) return;
    var pid = box.getAttribute('data-pid');
    loadEdits(pid).then(function (rows) {
      if (!rows.length || !document.body.contains(box)) return;
      var last = rows[0], names = [];
      rows.forEach(function (r) { if (names.indexOf(r.editor_name) < 0) names.push(r.editor_name); });
      box.innerHTML = '<span>' + esc(t('edited_by').replace('{who}', last.editor_name).replace('{date}', fmtDate(last.edited_at))) +
        (names.length > 1 ? ' · ' + esc(t('n_editors').replace('{n}', names.length)) : '') + '</span>' +
        '<button type="button" class="link" data-act="edit-history" data-pid="' + esc(pid) + '">' + esc(t('edit_history')) + '</button>';
      box.hidden = false;
    }).catch(function (e) { console.warn(e); });
  }
  function fieldLabel(f) { var k = 'fld_' + f; return I[k] ? t(k) : f; }
  function showEditHistory(pid) {
    var rows = S.edits[pid] || [];
    var dlg = document.getElementById('hist-dlg');
    if (!dlg) { dlg = document.createElement('dialog'); dlg.id = 'hist-dlg'; dlg.className = 'dlg hist-dlg'; document.body.appendChild(dlg);
      dlg.addEventListener('click', function (e) { if (e.target === dlg || e.target.closest('[data-hist-close]')) dlg.close(); }); }
    var names = {}; rows.forEach(function (r) { names[r.editor_name] = (names[r.editor_name] || 0) + 1; });
    dlg.innerHTML = '<div class="hist-head"><h2>' + esc(t('edit_history')) + '</h2><button type="button" class="lb-close" data-hist-close="1" aria-label="' + esc(t('close')) + '">×</button></div>' +
      '<p class="hist-who">' + Object.keys(names).map(function (n) { return '<span class="hist-chip">' + esc(n) + ' <b>' + names[n] + '</b></span>'; }).join('') + '</p>' +
      '<ol class="hist-list">' + rows.map(function (r) {
        return '<li><time datetime="' + esc(r.edited_at) + '">' + esc(fmtDate(r.edited_at, true)) + '</time><strong>' + esc(r.editor_name) + '</strong>' +
          '<span class="hist-fields">' + (r.fields || []).map(function (f) { return esc(fieldLabel(f)); }).join(', ') + '</span></li>';
      }).join('') + '</ol>';
    dlg.showModal();
  }
  function homeRow(id) {
    var p = S.byId[id], c = p.content || {}, kids = [];
    return '<li class="hrow"><a class="hrow-main" href="#' + id + '">' + (p.card || p.image ? '<img src="' + imgSrc(p.card || p.image) + '" alt="" loading="lazy" width="96" height="72">' : '<span class="img-ph small" aria-hidden="true"></span>') +
      '<span class="hrow-t"><span class="hrow-title">' + clean(L(c.h2) || p.name) + '</span>' +
      '<span class="hrow-fr" lang="fr">' + esc(p.ib || '') + '</span></span></a>' +
      (kids.length ? '<p class="hrow-kids">' + kids.map(tlink).join('') + '</p>' : '') + '</li>';
  }
  // all item pages under a section, sub-sections included
  function sectionItems(id) {
    var out = [];
    (S.children[id] || []).forEach(function (x) { if (isSection(x)) out = out.concat(sectionItems(x)); else { out.push(x); out = out.concat(S.children[x] || []); } });
    return out;
  }
  function crumbHtml(id) {
    var chain = [], par = parentOf(id);
    while (par) { chain.unshift(par); par = parentOf(par); }
    return '<p class="crumb"><a href="#">' + esc(t('home')) + '</a>' + chain.map(function (x) {
      return ' <span aria-hidden="true">/</span> <a href="#' + x + '">' + esc(plain(L((S.byId[x].content || {}).h2)) || S.byId[x].name) + '</a>';
    }).join('') + ' <span aria-hidden="true">/</span> <span>' + esc(isSection(id) ? (plain(L((S.byId[id].content || {}).h2)) || S.byId[id].name) : S.byId[id].name) + '</span></p>';
  }
  function sectionView(id) {
    var E = S.edit && S.draft && S.draft.page;
    var p = E ? S.draft.page : S.byId[id], c = p.content || {}, lg = S.lang, cp = 'page.content.';
    var V = function (k) { return E ? (c[k] || {})[lg] : L(c[k]); };
    var kids = S.children[id] || [], items = kids.filter(function (x) { return !isSection(x); }), subs = kids.filter(isSection);
    return (E ? settingsHtml(p) : '') + '<section class="view section-view" data-view="' + id + '">' + crumbHtml(id) +
      '<div class="piece-head">' + F(cp + 'h2.' + lg, V('h2'), 'h2', 'page-title', { raw: 1, single: 1, attr: ' tabindex="-1"' }) + penBtn() + '</div>' + editMeta(id) +
      F(cp + 'lead.' + lg, V('lead'), 'p', 'lead', { raw: 1 }) +
      (items.length ? '<ul class="hlist">' + flatItems(items).map(homeRow).join('') + '</ul>' : '') +
      subs.map(function (sid) {
        var sc = S.byId[sid].content || {};
        return '<div class="grid-head sub-sec"><h3><a href="#' + sid + '">' + clean(L(sc.h2) || S.byId[sid].name) + '</a></h3>' +
          (L(sc.lead) ? '<p class="muted">' + esc(plain(L(sc.lead))) + '</p>' : '') + '</div>' +
          '<ul class="hlist">' + flatItems((S.children[sid] || []).filter(function (x) { return !isSection(x); })).map(homeRow).join('') + '</ul>';
      }).join('') + '</section>';
  }
  function blockView(key) {
    var site = S.edit && S.draft && S.draft.site ? S.draft.site : S.site;
    var b = site[key] || {};
    var title = S.edit ? (b.title || {})[S.lang] : (L(b.title) || t(key === 'fonts' ? 'sources' : 'decisions'));
    var body = S.edit ? (b.html || {})[S.lang] : L(b.html);
    return '<section class="view" data-view="' + key + '"><p class="crumb"><a href="#">' + esc(t('home')) + '</a> <span aria-hidden="true">/</span> ' + esc(plain(L(b.title)) || t(key === 'fonts' ? 'sources' : 'decisions')) + '</p>' +
      '<div class="piece-head">' + F('site.' + key + '.title.' + S.lang, title, 'h2', 'page-title', { raw: 1, single: 1, attr: ' tabindex="-1"' }) + penBtn() + '</div>' +
      '<div class="table-wrap block-' + key + '">' + F('site.' + key + '.html.' + S.lang, body, 'div', 'block-html', { raw: 1 }) + '</div>' +
      (S.edit && key === 'decisions' ? '<button type="button" class="add-btn" data-act="addrow">+ ' + esc(t('add_row')) + '</button>' : '') +
      '</section>';
  }

  /* ------------------------------------------------------------------ view: all regulations and the inspections */
  function regsAllView() {
    var site = S.edit && S.draft && S.draft.site ? S.draft.site : S.site;
    var b = site.regs || {}, lg = S.lang;
    var V = function (k) { return S.edit ? (b[k] || {})[lg] : L(b[k]); };
    var title = V('title') || (S.edit ? '' : t('regs_page'));
    var out = '<section class="view regs-all" data-view="regulacions"><p class="crumb"><a href="#">' + esc(t('home')) + '</a> <span aria-hidden="true">/</span> ' + esc(plain(L(b.title)) || t('regs_page')) + '</p>' +
      '<div class="piece-head">' + F('site.regs.title.' + lg, title, 'h2', 'page-title', { raw: 1, single: 1, attr: ' tabindex="-1"' }) + penBtn() + '</div>';
    var member = isMember();
    // 1. regulations: every text quoted on the item pages, merged by year and regulation
    out += '<section class="ra-part" aria-labelledby="ra-r"><h3 id="ra-r">' + esc(t('regs_h')) + '</h3>' + F('site.regs.intro_r.' + lg, V('intro_r'), 'p', 'ra-intro', { raw: 1 });
    if (!member) out += lockedHtml();
    else {
      var groups = {}, keys = [];
      S.allOrder.forEach(function (pid) {
        ((S.priv[pid] || {}).regs || []).forEach(function (r) {
          if (r.insp) return;
          var key = (r.year || '') + '|' + plain(r.name || '');
          if (!groups[key]) { groups[key] = { year: r.year || '', name: r.name || '', parts: [], byText: {} }; keys.push(key); }
          var g = groups[key];
          (r.parts || []).forEach(function (x) {
            var tk = plain(x.label || '') + '|' + plain(x.fr || '');
            if (!plain(x.fr || '') && !L(x.tr)) return;
            if (!g.byText[tk]) { g.byText[tk] = { label: x.label, fr: x.fr, tr: x.tr, pages: [] }; g.parts.push(g.byText[tk]); }
            if (g.byText[tk].pages.indexOf(pid) < 0) g.byText[tk].pages.push(pid);
          });
        });
      });
      keys.sort(function (a, b) { var ga = groups[a], gb = groups[b]; return (ga.year > gb.year) - (ga.year < gb.year) || (plain(ga.name) > plain(gb.name)) - (plain(ga.name) < plain(gb.name)); });
      out += '<div class="regs" id="ra-regs"><div class="regs-head"><span>' + esc(t('n_regs').replace('{n}', keys.length)) + '</span><span></span>' +
        '<button type="button" class="regs-toggle" data-target="ra-regs" aria-expanded="false"><span class="when-closed">' + esc(t('open_all')) + '</span><span class="when-open">' + esc(t('close_all')) + '</span></button></div>';
      keys.forEach(function (key, i) {
        var g = groups[key];
        var pgs = [];
        g.parts.forEach(function (x) { x.pages.forEach(function (p) { if (pgs.indexOf(p) < 0) pgs.push(p); }); });
        var body = g.parts.map(function (x) {
          var lb = x.label ? '<b>' + clean(x.label) + '.</b> ' : '';
          return '<div class="reg-body"><div class="orig"><p lang="fr">' + lb + clean(x.fr) + '</p></div><div class="tr"><p>' + lb + clean(lg === 'fr' ? '' : L(x.tr)) + '</p></div></div>' +
            '<p class="reg-pages">' + esc(t('regs_in')) + ' ' + x.pages.map(tlink).join(' ') + '</p>';
        }).join('');
        out += '<details class="reg yr" id="ra-' + i + '"><summary><span class="reg-date"><b class="yr-y">' + esc(g.year) + '</b> — <span lang="fr">' + clean(g.name) + '</span></span>' +
          '<span class="yr-count">' + pgs.length + '</span><span class="chev" aria-hidden="true"></span></summary>' + body + '</details>';
      });
      out += '</div>';
    }
    out += '</section>';
    // 2. inspections: readable transcriptions
    out += '<section class="ra-part" aria-labelledby="ra-i"><h3 id="ra-i">' + esc(t('insp_h')) + '</h3>' + F('site.regs.intro_i.' + lg, V('intro_i'), 'p', 'ra-intro', { raw: 1 });
    if (!member) out += lockedHtml();
    else if (!(S.insp || []).length) out += '<p class="muted">' + esc(t('insp_none')) + '</p>';
    else out += S.insp.map(function (row) { return inspHtml(row.id, row.content || {}); }).join('');
    out += '</section></section>';
    return out;
  }
  function inspHtml(id, c) {
    var lg = S.lang;
    var sheets = (c.sheets || []).map(function (sh) {
      var head = L(sh.head) || [], ncol = head.length || 7;
      var rows = (sh.rows || []).map(function (r) {
        if (r[0] === '§') return '<tr class="insp-grp"><th colspan="' + ncol + '" scope="rowgroup">' + esc(L((c.groups || {})[r[1]]) || r[1]) + '</th></tr>';
        return '<tr><th scope="row" lang="fr">' + esc(r[0]) + '</th>' + r.slice(1).map(function (v) { return '<td>' + (v ? esc(v) : '<span class="muted" aria-label="—">″</span>') + '</td>'; }).join('') + '</tr>';
      }).join('');
      return '<section class="insp-sheet"><h5 lang="fr">' + esc(sh.title) + '</h5><p class="insp-unit" lang="fr">' + esc(sh.unit || '') + '</p>' +
        '<div class="cmp-wrap"><table class="cmp insp-table"><thead><tr>' + head.map(function (h) { return '<th scope="col">' + esc(h) + '</th>'; }).join('') + '</tr></thead><tbody>' + rows + '</tbody></table></div>' +
        (sh.obs ? '<div class="reg-body insp-obs"><div class="orig"><span class="lbl">' + esc(t('insp_obs')) + '</span><p lang="fr">' + esc(sh.obs) + '</p></div><div class="tr"><span class="lbl">' + esc(t('tr_text')) + '</span><p>' + esc(lg === 'fr' ? '' : L(c.obs_tr)) + '</p></div></div>' : '') +
        (sh.sig ? '<p class="insp-sig" lang="fr">' + esc(sh.sig) + '</p>' : '') + '</section>';
    }).join('');
    var notes = LA(c.notes);
    return '<article class="insp" id="insp-' + esc(id) + '"><h4><span class="yr-y">' + esc(c.year || '') + '</span> — <span lang="fr">' + esc(c.title || '') + '</span></h4>' +
      '<p class="insp-meta" lang="fr">' + esc([c.date, c.place].filter(Boolean).join(', ')) + '</p>' +
      (L(c.summary) ? '<p>' + esc(L(c.summary)) + '</p>' : '') +
      (notes.length ? '<div class="insp-notes"><h5>' + esc(t('insp_notes')) + '</h5><ul>' + notes.map(function (n) { return '<li>' + esc(n) + '</li>'; }).join('') + '</ul></div>' : '') +
      '<h5 class="insp-tr-h">' + esc(t('insp_tr')) + '</h5>' + sheets +
      ((c.pages || []).length ? '<p class="reg-pages">' + esc(t('regs_in')) + ' ' + c.pages.map(tlink).join(' ') + '</p>' : '') + '</article>';
  }
  function tlink(id) {
    var p = S.byId[id]; if (!p) return '';
    return '<a class="tlink" href="#' + id + '"><span lang="fr">' + esc(p.name || id) + '</span></a>';
  }
  function relHtml(id) {
    var rows = [], par = parentOf(id);
    if (par && isSection(par)) par = null;
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

  /* ------------------------------------------------------------------ images inside the description and model versions */
  var FIGRE = /^\[\[fig:([a-z0-9]+)\]\]$/;
  function figHtml(c, fid, E) {
    var f = (c.figs || {})[fid]; if (!f || !f.src) return '';
    if (E) {
      return '<figure class="fig-r fig-ed" contenteditable="false" data-fig="' + esc(fid) + '"><button type="button" class="fig-x" data-act="fig-del" data-fig="' + esc(fid) + '" aria-label="' + esc(t('remove_img')) + '" title="' + esc(t('remove_img')) + '">✕</button>' +
        '<img src="' + imgSrc(f.src) + '" alt=""><figcaption class="ed" contenteditable="true" data-single="1" data-path="page.content.figs.' + fid + '.cap.' + S.lang + '" data-ph="' + esc(t('fig_cap_ph')) + '">' + clean((f.cap || {})[S.lang] || '') + '</figcaption></figure>';
    }
    var cap = L(f.cap);
    return '<figure class="fig-r"><a href="' + imgSrc(f.src) + '" target="_blank" rel="noopener"><img src="' + imgSrc(f.src) + '" alt="' + esc(plain(cap)) + '" loading="lazy"></a>' + (cap ? '<figcaption>' + clean(cap) + '</figcaption>' : '') + '</figure>';
  }
  // after translation, every language gets the image markers at the same paragraph positions as the edited one
  function syncFigs(c, lang) {
    var d = c && c.desc; if (!d || !Array.isArray(d[lang])) return;
    var pos = [], used = {};
    d[lang].forEach(function (x, i) { var m = String(x).trim().match(FIGRE); if (m) { pos.push([i, '[[fig:' + m[1] + ']]']); used[m[1]] = 1; } });
    LANGS.forEach(function (k) {
      if (k === lang || !Array.isArray(d[k])) return;
      var a = d[k].filter(function (x) { return String(x).indexOf('[[fig:') < 0; });
      pos.forEach(function (q2) { a.splice(Math.min(q2[0], a.length), 0, q2[1]); });
      d[k] = a;
    });
    if (c.figs) Object.keys(c.figs).forEach(function (id) { if (!used[id]) delete c.figs[id]; });
  }
  function stChip(st) { return '<span class="st-chip st-' + st + '">' + esc(t('sst_' + st)) + '</span>'; }
  function versionsHtml(id, c, E) {
    var vs = c.versions || [], lg = S.lang, cp = 'page.content.versions';
    if (!vs.length && !E) return '';
    var VS = function (v) { return E ? ((v.specs || {})[lg] || []) : LA(v.specs); };
    var html = '<h3 class="sum-h">' + esc(t('evol_h')) + '</h3>';
    if (vs.length) html += '<ol class="vtl">' + vs.map(function (v, i) {
      return '<li' + (v.nine ? ' class="nine"' : '') + '><a href="#' + id + '-ver-' + i + '" data-act="ver-open" data-i="' + i + '"><span class="vtl-dot" aria-hidden="true"></span><span class="vtl-y">' + esc(v.year || '—') + '</span>' +
        (v.nine ? '<span class="nine-b">9e</span>' : '') + '</a></li>';
    }).join('') + '</ol>';
    html += vs.map(function (v, i) {
      var sp = VS(v), sPath = cp + '.' + i + '.specs.' + lg;
      var specs = (sp.length || E) ? '<table class="ver-specs">' + sp.map(function (r, j) {
        return '<tr' + rowAttr(sPath, j) + '><th scope="row">' + dragH(sPath, j) + F(sPath + '.' + j + '.0', r[0], 'span', '', { raw: 1, single: 1 }) + '</th><td>' + F(sPath + '.' + j + '.1', r[1], 'span', '', { raw: 1 }) + listBtns(sPath, j) + '</td></tr>';
      }).join('') + '</table>' + addBtn(sPath, 'pair', 'add_row') : '';
      var img = v.image ? '<figure class="fig-r"><img src="' + imgSrc(v.image) + '" alt="" loading="lazy"></figure>' : '';
      var body = E
        ? '<div class="ver-ed"><label>' + esc(t('year')) + ' ' + F(cp + '.' + i + '.year', v.year, 'span', 'ver-year', { raw: 1, single: 1 }) + '</label>' +
          F(cp + '.' + i + '.title.' + lg, (v.title || {})[lg], 'p', 'ver-title', { raw: 1, single: 1, ph: t('ver_title_ph') }) +
          '<label class="ver-nine"><input type="checkbox" data-path="' + cp + '.' + i + '.nine"' + (v.nine ? ' checked' : '') + '> ' + esc(t('nine_label')) + '</label>' +
          '<p><button type="button" class="btn-small" data-act="img" data-target="' + cp + '.' + i + '.image">' + esc(t('change_img')) + '</button>' + listBtns(cp, i) + '</p></div>' +
          img + F(cp + '.' + i + '.text.' + lg, (v.text || {})[lg], 'div', 'ver-text', { pid: id }) + specs
        : img + F('', L(v.text), 'div', 'ver-text', { pid: id }) + specs;
      return '<details class="ver' + (v.nine ? ' nine' : '') + '" id="' + id + '-ver-' + i + '"' + (E || v.nine ? ' open' : '') + '><summary><span class="ver-y">' + esc(v.year || '—') + '</span><span class="ver-t">' + esc(plain(L(v.title))) + '</span>' +
        (v.nine ? '<span class="nine-b">9e</span>' : '') + '</summary><div class="ver-body">' + body + '</div></details>';
    }).join('');
    if (E) html += addBtn(cp, 'version', 'add_version');
    // comparison of the measurements of every model that has them
    var withSpecs = vs.filter(function (v) { return LA(v.specs).length; });
    if (!E && withSpecs.length > 1) {
      var labels = [];
      withSpecs.forEach(function (v) { LA(v.specs).forEach(function (r) { if (labels.indexOf(plain(r[0])) < 0) labels.push(plain(r[0])); }); });
      html += '<h4 class="cmp-h">' + esc(t('compare_h')) + '</h4><div class="cmp-wrap"><table class="cmp"><thead><tr><th></th>' + withSpecs.map(function (v) { return '<th' + (v.nine ? ' class="nine"' : '') + '>' + esc(v.year) + (v.nine ? ' <span class="nine-b">9e</span>' : '') + '</th>'; }).join('') + '</tr></thead><tbody>' +
        labels.map(function (lb) {
          return '<tr><th scope="row">' + esc(lb) + '</th>' + withSpecs.map(function (v) {
            var r = LA(v.specs).filter(function (x) { return plain(x[0]) === lb; })[0];
            return '<td' + (v.nine ? ' class="nine"' : '') + '>' + (r ? clean(r[1]) : '—') + '</td>';
          }).join('') + '</tr>';
        }).join('') + '</tbody></table></div>';
    }
    return '<section class="evol">' + html + '</section>';
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
      return '<tr' + rowAttr(cp + 'info.' + lg, i) + '><th scope="row">' + dragH(cp + 'info.' + lg, i) + F(cp + 'info.' + lg + '.' + i + '.0', r[0], 'span', '', { raw: 1, single: 1 }) + '</th><td>' +
        F(cp + 'info.' + lg + '.' + i + '.1', r[1], 'span', '', { raw: 1 }) + listBtns(cp + 'info.' + lg, i) + '</td></tr>';
    }).join('');
    var infobox = '<aside class="infobox" aria-label="' + esc(p.name) + '">' +
      (E ? '<p class="ib-title ed" contenteditable="true" data-single="1" data-path="page.ib" data-ph="' + esc(t('f_ib')) + '">' + clean(p.ib) + '</p>' : '<p class="ib-title" lang="fr">' + esc(p.ib) + '</p>') +
      '<figure>' + (p.image ? '<img src="' + imgSrc(p.image) + '" alt="" width="480" height="600">' : '<span class="img-ph" aria-hidden="true"></span>') +
      '<figcaption>' + esc(t('cap')) + '</figcaption>' +
      (E ? '<span class="img-tools"><button type="button" class="btn-small" data-act="img" data-target="page.image" data-also="page.card">' + esc(t('change_img')) + '</button></span>' : '') + '</figure>' +
      '<table>' + infoRows + '</table>' + addBtn(cp + 'info.' + lg, 'pair', 'add_row') + '</aside>';

    // body
    var desc = VA('desc');
    var descHtml = E
      ? '<div class="ed ed-desc" contenteditable="true" data-path="' + cp + 'desc.' + lg + '" data-paras="1" data-ph="' + esc(t('empty_hint')) + '">' +
        desc.map(function (x) { var m = String(x).trim().match(FIGRE); return m ? figHtml(c, m[1], true) : '<p>' + clean(x) + '</p>'; }).join('') + '</div>'
      : desc.map(function (x) { var m = String(x).trim().match(FIGRE); return m ? figHtml(c, m[1], false) : F('', x, 'p', '', { pid: id, done: done }); }).join('');
    var V2 = true;

    // tabs
    var panels = [];
    var parts = VA('parts');
    // infographic: numbered points on the item image, one per part shown in it
    var hot = c.hot || [];
    var hasHot = hot.some(function (h) { return h; });
    var hasDg = !!(c.diagram || c.dg);
    var dgHtml = c.diagram ? '<figure class="diagram">' + clean(c.diagram) + '</figure>' : (c.dg ? '<figure class="diagram" data-dg="' + esc(c.dg) + '"></figure>' : '');
    var infog = (!hasDg && p.image && (hasHot || E)) ? '<figure class="infog' + (E && S.hotPick != null ? ' picking' : '') + '"><div class="infog-img"><img src="' + imgSrc(p.image) + '" alt="" data-act="' + (E ? 'hot-set' : '') + '">' +
      hot.map(function (h, i) { return h && parts[i] ? '<span class="hot" style="left:' + h[0] + '%;top:' + h[1] + '%">' + (i + 1) + '</span>' : ''; }).join('') + '</div>' +
      (E ? '<figcaption class="muted">' + esc(S.hotPick != null ? t('hot_click') : t('hot_hint')) + '</figcaption>' : '') + '</figure>' : '';
    var partsHtml = (E ? '' : dgHtml) + '<div class="parts-wrap' + (infog ? ' with-infog' : '') + '">' + infog + '<dl class="parts">' + parts.map(function (r, i) {
      var num = infog && (hot[i] || E) ? '<span class="hot-n' + (hot[i] ? '' : ' off') + '">' + (i + 1) + '</span>' : '';
      var pick = E && p.image && !hasDg ? '<button type="button" class="mini hot-btn' + (S.hotPick === i ? ' on' : '') + '" data-act="hot-pick" data-i="' + i + '" title="' + esc(t('hot_pick')) + '" aria-label="' + esc(t('hot_pick')) + '">📍</button>' +
        (hot[i] ? '<button type="button" class="mini" data-act="hot-del" data-i="' + i + '" title="' + esc(t('hot_del')) + '" aria-label="' + esc(t('hot_del')) + '">✕</button>' : '') : '';
      return '<div' + rowAttr(cp + 'parts.' + lg, i) + '><dt>' + dragH(cp + 'parts.' + lg, i) + num + F(cp + 'parts.' + lg + '.' + i + '.0', r[0], 'span', '', { raw: 1, single: 1 }) + '</dt><dd>' +
        F(cp + 'parts.' + lg + '.' + i + '.1', r[1], 'span', '', { pid: id }) + pick + listBtns(cp + 'parts.' + lg, i) + '</dd></div>';
    }).join('') + '</dl></div>' + addBtn(cp + 'parts.' + lg, 'pair', 'add_row');
    if (E) partsHtml += '<details class="ed-svg"><summary>' + esc(t('diagram_src')) + '</summary><textarea data-path="page.content.diagram" rows="8">' + esc(c.diagram || '') + '</textarea></details>';
    panels.push(['parts', null, partsHtml]);

    var nregs = pr && pr.regs ? pr.regs.length : null;
    panels.push(['reg', nregs || null, pr ? regsHtml(id, pr, E) : '']);
    var nphotos = pr ? groupsOf(pr).reduce(function (n, g) { return n + (g.figs || []).length; }, 0) : 0;
    panels.push(['evid', nphotos || null, pr ? evidHtml(id, pr, E) : '']);

    var stdHero = (V('std') || E) ? '<section class="std-hero" aria-label="' + esc(t('t_std')) + '"><h3 class="std-title"><span class="star" aria-hidden="true">★</span>' + esc(t('t_std')) + '</h3>' +
      F(cp + 'std.' + lg, V('std'), 'p', 'std-text', { pid: id }) +
      ((V('just') || E) ? '<details class="std-just"' + (E ? ' open' : '') + '><summary>' + esc(t('just')) + '</summary>' + F(cp + 'just.' + lg, V('just'), 'p', '', { pid: id }) + '</details>' : '') +
      '</section>' : '';

    panels.push(['dl', pr && pr.downloads && pr.downloads.length || null, pr ? dlHtml(id, pr, E) : '']);
    // the summary tab (lead, description and 9e standard) is the one open by default
    if (V2) {
      // the 9e standard is its own members-only tab, just before Downloads
      var pv = pr || {}, PV = function (k) { return E ? (pv[k] || {})[lg] : L(pv[k]); };
      var st = pv.std_status || (p.status === 'pending' ? 'pending' : 'proposed');
      var m9 = '<div class="model9">' +
        '<p class="m9-state"><strong>' + esc(t('std_state')) + ':</strong> ' +
        (E ? '<select data-path="priv.std_status" aria-label="' + esc(t('std_state')) + '">' + ['decided', 'proposed', 'pending'].map(function (k) { return '<option value="' + k + '"' + (k === st ? ' selected' : '') + '>' + esc(t('sst_' + k)) + '</option>'; }).join('') + '</select>' : esc(t('sst_' + st))) + '</p>' +
        F('priv.std.' + lg, PV('std'), 'p', '', { pid: id }) +
        ((PV('just') || E) ? '<h3 class="sum-h">' + esc(t('just')) + '</h3>' + F('priv.just.' + lg, PV('just'), 'p', '', { pid: id }) : '') +
        (st === 'pending' && !E ? '<p><a class="tlink" href="#decisions">' + esc(L((S.site.decisions || {}).title) || t('decisions')) + '</a></p>' : '') + '</div>';
      var dlIdx = panels.map(function (x) { return x[0]; }).indexOf('dl');
      panels.splice(dlIdx < 0 ? panels.length : dlIdx, 0, ['model9', null, m9]);
      var addImg = E ? '<div class="fig-add"><button type="button" class="btn fig-add-btn" data-act="fig-add">📷 ' + esc(t('add_img_here')) + '</button><span class="muted">' + esc(t('add_img_hint')) + '</span></div>' : '';
      panels.unshift(['sum', null, F(cp + 'lead.' + lg, V('lead'), 'p', 'lead-p', { pid: id, done: done }) +
        '<h3 class="sum-h">' + esc(t('desc_h')) + '</h3>' + addImg + '<div class="desc-flow">' + descHtml + '</div>' + versionsHtml(id, c, E)]);
    } else panels.unshift(['sum', null, F(cp + 'lead.' + lg, V('lead'), 'p', 'lead-p', { pid: id, done: done }) + descHtml + stdHero]);

    var sel = S.tab[id] && panels.some(function (x) { return x[0] === S.tab[id]; }) ? S.tab[id] : 'sum';
    var tl = panels.map(function (x) {
      var k = x[0], lock = LOCKED[k] && !member;
      return '<button type="button" role="tab" id="' + id + '-tab-' + k + '" aria-controls="' + id + '-panel-' + k + '" aria-selected="' + (k === sel) + '" tabindex="' + (k === sel ? 0 : -1) + '" data-tab="' + k + '"' +
        (lock ? ' class="tab-locked"' : '') + '>' + (lock ? '<span class="lock-ico" aria-hidden="true"></span>' : '') +
        esc(t('t_' + k)) + (x[1] && !lock ? '<span class="count">' + x[1] + '</span>' : '') + '</button>';
    }).join('');
    var tp = panels.map(function (x) {
      var k = x[0], lock = LOCKED[k] && !member;
      return '<div role="tabpanel" class="panel" id="' + id + '-panel-' + k + '" aria-labelledby="' + id + '-tab-' + k + '"' + (k === sel ? '' : ' hidden') + '>' + (lock ? lockedHtml() : x[2]) + '</div>';
    }).join('');

    return (E ? settingsHtml(p) : '') +
      '<section class="view item wiki" data-view="' + id + '">' +
      crumbHtml(id) +
      '<header class="wiki-head"><div class="piece-head">' + F(cp + 'h2.' + lg, V('h2'), 'h2', '', { raw: 1, single: 1, attr: ' tabindex="-1"' }) + penBtn() + '</div>' + editMeta(id) + relHtml(id) + '</header>' +
      infobox +
      '<div class="wiki-body">' +
      '<div class="tabs wiki-tabs" role="tablist">' + tl + '</div>' + tp + '</div></section>';
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
    var EE = E, inspOut = '';
    regs.forEach(function (r, n) {
      var E = EE && !!r._new;
      var parts = r.parts || [];
      var base = pp + 'regs.' + n;
      var fr = parts.map(function (x, j) {
        if (E) return '<div class="ed-regpart">' + F(base + '.parts.' + j + '.label', x.label, 'span', 'ed-label', { raw: 1, single: 1, ph: t('label') }) +
          F(base + '.parts.' + j + '.fr', x.fr, 'p', '', { raw: 1, ph: 'Texte original' }) + '</div>';
        return '<p lang="fr">' + (x.label ? '<b>' + clean(x.label) + '.</b> ' : '') + clean(x.fr) + '</p>';
      }).join('');
      var tr = parts.map(function (x, j) {
        var trv = E ? ((x.tr || {})[lg]) : (lg === 'fr' ? '' : L(x.tr));
        if (E) return '<div class="ed-regpart">' + F(base + '.parts.' + j + '.tr.' + lg, trv, 'p', '', { raw: 1 }) + listBtns(base + '.parts', j) + '</div>';
        return '<p>' + (x.label ? '<b>' + clean(x.label) + '.</b> ' : '') + clean(trv) + '</p>';
      }).join('');
      var head = E
        ? '<div class="ed-reghead"><span class="reg-n">[' + (n + 1) + ']</span>' + F(base + '.year', r.year, 'b', 'yr-y', { raw: 1, single: 1, ph: t('year') }) + ' — ' +
          F(base + '.name', r.name, 'span', '', { raw: 1, single: 1, ph: t('reg_name') }) + listBtns(pp + 'regs', n) + '</div>'
        : '<summary><span class="reg-date"><span class="reg-n">[' + (n + 1) + ']</span> <b class="yr-y">' + esc(r.year) + '</b> — <span lang="fr">' + clean(r.name) + '</span></span>' +
          '<span class="yr-count">' + (parts.length > 1 ? parts.length : '') + '</span>' + (EE ? listBtns(pp + 'regs', n) : '') + '<span class="chev" aria-hidden="true"></span></summary>';
      var body = '<div class="reg-body"><div class="orig"><span class="lbl">' + esc(t('fr_text')) + '</span>' + fr + '</div>' +
        '<div class="tr"><span class="lbl">' + esc(t('tr_text')) + '</span>' + tr + '</div></div>' + (E ? addBtn(base + '.parts', 'regpart', 'add_text') : '');
      var link = r.insp && !EE ? '<p class="insp-link"><a class="tlink" href="#regulacions~insp-' + esc(r.insp) + '">' + esc(t('insp_open')) + '</a></p>' : '';
      var html1 = E ? '<div class="reg yr ed-reg" id="' + id + '-reg-r' + (n + 1) + '">' + head + body + '</div>'
        : '<details id="' + id + '-reg-r' + (n + 1) + '" class="reg yr' + (r.insp ? ' insp-reg' : '') + '">' + head + body + link + '</details>';
      if (r.insp && !EE) inspOut += html1; else out += html1;
    });
    if (inspOut) out += '<div class="regs-sub">' + esc(t('insp_h')) + '</div>' + inspOut;
    out += '</div>' + (EE ? addBtn(pp + 'regs', 'reg', 'add_reg') : '');
    var note = E ? ((pr.note || {})[lg]) : L(pr.note);
    if (note || E) out += F(pp + 'note.' + lg, note, 'p', 'regs-note', { raw: 1, ph: t('note') });
    return narr + out;
  }

  // evidence photos are organised in groups; older content kept a flat "figs" list
  function groupsOf(pr) {
    if (pr && Array.isArray(pr.groups)) return pr.groups;
    if (pr && pr.figs && pr.figs.length) return [{ title: { ca: '' }, desc: { ca: '' }, figs: pr.figs }];
    return [];
  }
  function evidHtml(id, pr, E) {
    var lg = S.lang, groups = groupsOf(pr);
    var out = '';
    if (!groups.length && !E) return '<p class="muted">' + esc(t('no_evid')) + '</p>';
    groups.forEach(function (g, gi) {
      var base = 'priv.groups.' + gi, figs = g.figs || [];
      var title = E ? (g.title || {})[lg] : L(g.title), desc = E ? (g.desc || {})[lg] : L(g.desc);
      out += '<section class="gal-group' + (E ? ' ed-group' : '') + '">' +
        (E ? '<div class="gal-head"' + rowAttr('priv.groups', gi) + '>' + dragH('priv.groups', gi) + F(base + '.title.' + lg, title, 'h3', 'gal-title', { raw: 1, single: 1, ph: t('group_title') }) + listBtns('priv.groups', gi) + '</div>'
          : (title ? '<h3 class="gal-title">' + clean(title) + '</h3>' : '')) +
        ((desc || E) ? F(base + '.desc.' + lg, desc, 'p', 'gal-desc', { raw: 1, ph: t('group_desc') }) : '') +
        '<div class="gallery">' + figs.map(function (f, i) {
          var thumb = f.thumb || f.path;
          var cap = E ? (f.cap || {})[lg] : L(f.cap);
          var img = thumb ? '<img data-priv="' + esc(thumb) + '" alt="' + esc(f.alt || plain(cap) || '') + '" loading="lazy">' : '<span class="img-ph" aria-hidden="true"></span>';
          if (!E) return '<figure class="gal-item"><button type="button" class="gal-open" data-act="lightbox" data-pid="' + id + '" data-g="' + gi + '" data-i="' + i + '" aria-label="' + esc(plain(cap) || f.alt || t('open_photo')) + '">' + img + '</button>' +
            (cap ? '<figcaption>' + clean(cap) + '</figcaption>' : '') + '</figure>';
          var moveOpts = groups.length > 1 ? '<select class="gal-move" data-g="' + gi + '" data-i="' + i + '" aria-label="' + esc(t('move_to')) + '"><option value="">' + esc(t('move_to')) + '…</option>' +
            groups.map(function (o, oi) { return oi === gi ? '' : '<option value="' + oi + '">' + esc(plain(L(o.title)) || (t('group') + ' ' + (oi + 1))) + '</option>'; }).join('') + '</select>' : '';
          return '<figure class="gal-item"' + rowAttr(base + '.figs', i) + '>' + dragH(base + '.figs', i) + img + F(base + '.figs.' + i + '.cap.' + lg, cap, 'figcaption', '', { raw: 1, ph: t('caption') }) +
            '<span class="fig-tools"><input type="text" data-path="' + base + '.figs.' + i + '.alt" value="' + esc(f.alt || '') + '" placeholder="' + esc(t('alt')) + '" aria-label="' + esc(t('alt')) + '">' +
            moveOpts + listBtns(base + '.figs', i) + '</span></figure>';
        }).join('') + '</div>' +
        (E ? '<button type="button" class="add-btn" data-act="add-photos" data-g="' + gi + '">+ ' + esc(t('add_photos')) + '</button>' : '') + '</section>';
    });
    if (E) out += addBtn('priv.groups', 'group', 'add_group');
    return out;
  }

  /* ------------------------------------------------------------------ photo viewer */
  var LB = null;
  function lightbox(pid, gi, i) {
    var g = groupsOf(S.priv[pid] || {})[gi]; if (!g) return;
    var figs = (g.figs || []).filter(function (f) { return f.path; });
    if (!figs.length) return;
    if (!LB) {
      LB = document.createElement('dialog'); LB.className = 'lightbox';
      LB.innerHTML = '<button type="button" class="lb-close" data-lb="close">×</button><button type="button" class="lb-nav lb-prev" data-lb="prev">‹</button>' +
        '<figure><img alt=""><figcaption></figcaption></figure><button type="button" class="lb-nav lb-next" data-lb="next">›</button><p class="lb-count"></p>';
      document.body.appendChild(LB);
      LB.addEventListener('click', function (e) {
        var b = e.target.closest('[data-lb]');
        if (b) { var a = b.getAttribute('data-lb'); if (a === 'close') LB.close(); else LB.go(a === 'next' ? 1 : -1); }
        else if (e.target === LB) LB.close();
      });
      LB.addEventListener('keydown', function (e) { if (e.key === 'ArrowRight') LB.go(1); else if (e.key === 'ArrowLeft') LB.go(-1); });
    }
    var cur = Math.max(0, figs.indexOf((g.figs || [])[i]));
    function show() {
      var f = figs[cur], img = LB.querySelector('img');
      img.removeAttribute('src'); img.alt = f.alt || plain(L(f.cap)) || '';
      LB.querySelector('figcaption').innerHTML = clean(L(f.cap));
      LB.querySelector('.lb-count').textContent = (cur + 1) + ' / ' + figs.length;
      LB.querySelector('.lb-close').setAttribute('aria-label', t('close'));
      LB.querySelector('.lb-prev').setAttribute('aria-label', t('prev'));
      LB.querySelector('.lb-next').setAttribute('aria-label', t('next'));
      Array.prototype.forEach.call(LB.querySelectorAll('.lb-nav'), function (b) { b.hidden = figs.length < 2; });
      signedUrls([f.path]).then(function () { if (figs[cur] === f && S.urls[f.path]) img.src = S.urls[f.path].url; }).catch(fail);
    }
    LB.go = function (d) { cur = (cur + d + figs.length) % figs.length; show(); };
    show();
    if (!LB.open) LB.showModal();
  }

  /* ------------------------------------------------------------------ images are shrunk in the browser before upload (saves storage and traffic) */
  // every photo is reduced in the browser before upload: longest side and JPEG quality
  var IMG = { evid: 1600, thumb: 480, page: 1400, q: 0.8, qThumb: 0.75 };
  function shrink(file, maxEdge, quality) {
    if (!/^image\/(jpeg|png|webp|bmp|heic|heif|avif|gif|tiff)$/i.test(file.type || '') || !window.createImageBitmap) return Promise.resolve(null);
    return createImageBitmap(file, { imageOrientation: 'from-image' }).then(function (bmp) {
      var k = Math.min(1, maxEdge / Math.max(bmp.width, bmp.height));
      var w = Math.round(bmp.width * k), h = Math.round(bmp.height * k);
      var cv = document.createElement('canvas'); cv.width = w; cv.height = h;
      var cx = cv.getContext('2d'); cx.fillStyle = '#fff'; cx.fillRect(0, 0, w, h); cx.drawImage(bmp, 0, 0, w, h);
      if (bmp.close) bmp.close();
      return new Promise(function (res) { cv.toBlob(function (b) { res(b ? { blob: b, w: w, h: h } : null); }, 'image/jpeg', quality); });
    }).catch(function () { return null; });
  }
  function putBlob(bucket, blob, path, type) {
    return sb.storage.from(bucket).upload(path, blob, { contentType: type || blob.type || undefined, upsert: false }).then(function (r) {
      q(r);
      return bucket === PUBLIC_BUCKET ? sb.storage.from(bucket).getPublicUrl(path).data.publicUrl : path;
    });
  }
  function baseName(file, folder) {
    return folder + '/' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5) + '-' + (slug(file.name.replace(/\.[^.]+$/, '')) || 'file');
  }
  // one photo for the evidence gallery: a large version (1600 px) and a thumbnail (480 px)
  function uploadPhoto(file, folder) {
    var base = baseName(file, folder);
    return Promise.all([shrink(file, IMG.evid, IMG.q), shrink(file, IMG.thumb, IMG.qThumb)]).then(function (r) {
      var big = r[0], small = r[1];
      if (!big || !small) {
        var ext = (file.name.match(/\.[a-z0-9]+$/i) || [''])[0].toLowerCase();
        return putBlob(PRIVATE_BUCKET, file, base + ext, file.type).then(function (p) { return { path: p }; });
      }
      return putBlob(PRIVATE_BUCKET, big.blob, base + '.jpg', 'image/jpeg').then(function (p) {
        return putBlob(PRIVATE_BUCKET, small.blob, base + '.thumb.jpg', 'image/jpeg').then(function (tp) { return { path: p, thumb: tp, w: big.w, h: big.h }; });
      });
    });
  }
  // files no longer referenced by any page are removed from storage when saving
  function privPaths(pr) {
    var out = [];
    if (!pr) return out;
    groupsOf(pr).forEach(function (g) { (g.figs || []).forEach(function (f) { if (f.path) out.push(f.path); if (f.thumb) out.push(f.thumb); }); });
    (pr.downloads || []).forEach(function (d) { if (d.path) out.push(d.path); });
    return out;
  }
  function orphansAfterSave(pid, newPriv) {
    var keep = {};
    privPaths(newPriv).forEach(function (p) { keep[p] = 1; });
    Object.keys(S.priv).forEach(function (k) { if (k !== pid) privPaths(S.priv[k]).forEach(function (p) { keep[p] = 1; }); });
    return privPaths(S.priv[pid]).filter(function (p) { return !keep[p]; });
  }

  function dlHtml(id, pr, E) {
    var lg = S.lang, dls = pr.downloads || [];
    if (!dls.length && !E) return '<p class="muted">' + esc(t('no_dl')) + '</p>';
    return '<div class="dl-grid">' + dls.map(function (d, i) {
      var ext = ((d.filename || '').match(/\.([a-z0-9]+)$/i) || ['', 'file'])[1].toUpperCase().slice(0, 4);
      return '<div class="dl-card live"' + rowAttr('priv.downloads', i) + '>' + dragH('priv.downloads', i) + '<span class="dl-ico" aria-hidden="true">' + esc(ext) + '</span><div>' +
        F('priv.downloads.' + i + '.title.' + lg, E ? (d.title || {})[lg] : (L(d.title) || d.filename), 'strong', '', { raw: 1, single: 1 }) +
        F('priv.downloads.' + i + '.desc.' + lg, E ? (d.desc || {})[lg] : L(d.desc), 'p', '', { raw: 1 }) + '</div>' +
        (E ? listBtns('priv.downloads', i)
          : '<button type="button" class="btn-small dl-go" data-act="download" data-path="' + esc(d.path) + '" data-name="' + esc(d.filename || 'file') + '">' + esc(t('download')) + '</button>') + '</div>';
    }).join('') + '</div>' + (E ? '<button type="button" class="add-btn" data-act="add-file">+ ' + esc(t('add_file')) + '</button>' : '');
  }

  function settingsHtml(p) {
    var opts = '<option value="">' + esc(t('f_top')) + '</option>' + S.allOrder.filter(function (x) { return x !== p.id; }).map(function (x) {
      return '<option value="' + x + '"' + (p.parent_id === x ? ' selected' : '') + '>' + esc(S.byId[x].name) + '</option>';
    }).join('');
    return '<section class="settings" aria-label="' + esc(t('page_settings')) + '"><h3>' + esc(t('page_settings')) + '</h3><div class="set-grid">' +
      '<label>' + esc(t('f_id')) + '<input type="text" value="' + esc(p.id) + '" disabled></label>' +
      '<label>' + esc(t('f_name')) + '<input type="text" data-path="page.name" value="' + esc(p.name) + '"></label>' +
      '<label>' + esc(t('f_parent')) + '<select data-path="page.parent_id">' + opts + '</select></label>' +
      '<label>' + esc(t('f_sort')) + '<input type="number" data-path="page.sort" value="' + (p.sort || 0) + '"></label>' +
      '<label class="wide">' + esc(t('f_keywords')) + '<input type="text" data-csv="1" data-path="page.content.keywords" value="' + esc(((p.content || {}).keywords || []).join(', ')) + '"></label>' +
      '<label class="wide">' + esc(t('f_related')) + '<input type="text" data-csv="1" data-path="page.related" value="' + esc((p.related || []).join(', ')) + '"></label>' +
      '</div>' + subcatHtml(p) + '<button type="button" class="btn-danger" data-act="delete-page">' + esc(t('delete_page')) + '</button></section>';
  }
  // sub-categories of the page being edited: detach one, attach an existing page or create a new one
  function subcatHtml(p) {
    var kids = S.children[p.id] || [];
    var banned = {}; banned[p.id] = 1;
    (function up(x) { var par = S.byId[x] && S.byId[x].parent_id; if (par && !banned[par]) { banned[par] = 1; up(par); } })(p.id);
    var cand = S.allOrder.filter(function (x) { return !banned[x] && kids.indexOf(x) < 0; });
    return '<div class="subcats"><h4>' + esc(t('subcats')) + '</h4>' +
      (kids.length ? '<ul class="subcat-list">' + kids.map(function (x) {
        return '<li><a href="#' + x + '">' + esc(S.byId[x].name) + '</a><button type="button" class="mini del" data-act="sub-detach" data-id="' + x + '" aria-label="' + esc(t('remove')) + '" title="' + esc(t('remove')) + '">' + BIN + '</button></li>';
      }).join('') + '</ul>' : '<p class="muted">' + esc(t('no_subcats')) + '</p>') +
      '<div class="subcat-add"><select id="subcat-pick" aria-label="' + esc(t('add_subcat')) + '"><option value="">' + esc(t('add_subcat')) + '…</option>' +
      cand.map(function (x) { return '<option value="' + x + '">' + esc(S.byId[x].name) + '</option>'; }).join('') + '</select>' +
      '<button type="button" class="btn-small" data-act="sub-attach" data-id="' + p.id + '">' + esc(t('add')) + '</button>' +
      '<button type="button" class="btn-small" data-act="sub-new" data-id="' + p.id + '">+ ' + esc(t('new_subcat')) + '</button></div></div>';
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
      '<h3>' + esc(t('storage_t')) + '</h3><p id="storage-usage" class="muted">' + esc(t('loading')) + '</p>' +
      '<h3>' + esc(t('import_t')) + '</h3><p class="muted">' + esc(t('import_p')) + '</p>' +
      '<form class="form" id="f-import"><label class="fld"><span>seed.json</span><input type="file" name="seed" accept=".json,application/json" required></label>' +
      '<label class="fld"><span>private-images</span><input type="file" name="imgs" accept="image/*" multiple></label>' +
      '<p class="form-msg" role="status"></p><p class="form-actions"><button class="btn" type="submit">' + esc(t('import_go')) + '</button>' +
      ' <button type="button" class="btn-ghost" data-act="backup">' + esc(t('backup')) + '</button></p></form></section>';
  }
  function loadUsage() {
    sb.rpc('storage_usage').then(function (r) {
      var d = q(r), el = document.getElementById('storage-usage'); if (!el || !d) return;
      var mb = function (b) { return (b / 1048576).toFixed(b < 10485760 ? 1 : 0).replace('.', ','); };
      el.innerHTML = esc(t('storage_p').replace('{used}', mb(d.bytes) + ' MB').replace('{files}', d.files)) +
        '<span class="meter"><span style="width:' + Math.min(100, d.bytes / 10737418.24).toFixed(1) + '%"></span></span>';
    }).catch(function () {});
  }
  function loadMembers() {
    loadUsage();
    sb.from('profiles').select('*').order('created_at', { ascending: false }).then(function (r) {
      var rows = q(r) || [], box = document.getElementById('members');
      if (!box) return;
      if (!rows.length) { box.innerHTML = '<p class="muted">' + esc(t('no_members')) + '</p>'; return; }
      rows.sort(function (a, b) { return (a.status === 'pending' ? 0 : 1) - (b.status === 'pending' ? 0 : 1); });
      box.innerHTML = '<table class="members"><thead><tr><th>' + esc(t('first_name')) + ' / ' + esc(t('last_name')) + '</th><th>' + esc(t('nom_guerre')) + '</th><th>' + esc(t('esquadra')) +
        '</th><th>' + esc(t('email')) + '</th><th>' + esc(t('status')) + '</th><th>' + esc(t('role')) + '</th><th></th></tr></thead><tbody>' +
        rows.map(function (m) {
          var me = S.session && m.id === S.session.user.id;
          var sq = S.squads.map(function (x) { return x.name; });
          if (m.esquadra && sq.indexOf(m.esquadra) < 0) sq.push(m.esquadra);
          var squadSel = '<select name="esquadra" aria-label="' + esc(t('esquadra')) + '">' + sq.map(function (n) { return '<option' + (n === m.esquadra ? ' selected' : '') + '>' + esc(n) + '</option>'; }).join('') + '</select>';
          return '<tr data-id="' + m.id + '"' + (me ? ' data-me="1"' : '') + '><td>' + esc(m.first_name + ' ' + m.last_name) + (me ? ' <span class="muted">(' + esc(t('you')) + ')</span>' : '') + '</td><td>' + esc(m.nom_guerre) + '</td><td>' + squadSel + '</td><td>' + esc(m.email) + '</td>' +
            (me ? '<td>' + esc(t('st_' + m.status)) + '</td><td>' + esc(t(m.role === 'admin' ? 'r_admin' : 'r_member')) + '</td>'
              : '<td><select name="status" aria-label="' + esc(t('status')) + '">' + ['pending', 'approved', 'blocked'].map(function (s) { return '<option value="' + s + '"' + (m.status === s ? ' selected' : '') + '>' + esc(t('st_' + s)) + '</option>'; }).join('') + '</select></td>' +
                '<td><select name="role" aria-label="' + esc(t('role')) + '">' + ['member', 'admin'].map(function (s) { return '<option value="' + s + '"' + (m.role === s ? ' selected' : '') + '>' + esc(t(s === 'admin' ? 'r_admin' : 'r_member')) + '</option>'; }).join('') + '</select></td>') +
            '<td><button type="button" class="btn-small" data-act="save-member">' + esc(t('save')) + '</button></td></tr>';
        }).join('') + '</tbody></table>';
    }).catch(fail);
  }
  function newPageView() {
    if (!isAdmin()) return '<section class="view narrow"><h2 class="page-title" tabindex="-1">' + esc(t('new_page')) + '</h2>' + lockedHtml() + '</section>';
    var opts = '<option value="">' + esc(t('f_top')) + '</option>' + S.allOrder.map(function (x) { return '<option value="' + x + '"' + (S.newParent === x ? ' selected' : '') + '>' + esc(S.byId[x].name) + '</option>'; }).join('');
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
    if (isBusy()) { toast(t('busy_wait'), true); return; }
    syncDraft();
    pruneFallbacks();
    var btn = document.querySelector('#editbar [data-act="save"]'); if (btn) btn.disabled = true;
    var orig = S.draft.page ? { page: S.byId[S.draft.page.id], priv: S.priv[S.draft.page.id] } : { site: S.site };
    var warn = null, job = busy(t('saving'));
    return translateDraft(orig, job).catch(function (e) { console.warn(e); warn = t('translate_fail'); }).then(function () { if (S.draft.page) syncFigs(S.draft.page.content, S.lang); job.set(t('saving')); return store(btn, warn, job); });
  }
  function store(btn, warn, bj) {
    var job;
    if (S.draft.page) {
      var pg = S.draft.page;
      var row = { id: pg.id, parent_id: pg.parent_id || null, sort: pg.sort || 0, name: plain(pg.name) || pg.id, ib: plain(pg.ib), status: pg.status,
        image: pg.image || '', card: pg.card || '', related: pg.related || [], content: pg.content };
      if (!row.content.diagram) delete row.content.diagram;
      var orphans = orphansAfterSave(pg.id, S.draft.priv);
      job = sb.from('pages').update(row).eq('id', pg.id).then(q).then(function () {
        (S.draft.priv.regs || []).forEach(function (r) { delete r._new; });
        return sb.from('page_private').upsert({ page_id: pg.id, content: S.draft.priv }).then(q);
      }).then(function () {
        if (orphans.length) return sb.storage.from(PRIVATE_BUCKET).remove(orphans).catch(function (e) { console.warn(e); });
      });
    } else {
      var rows = ['home', 'decisions', 'fonts', 'regs'].map(function (k) { return { key: k, value: S.draft.site[k] }; });
      job = sb.from('site').upsert(rows).then(q);
    }
    return job.then(function () { return loadPublic(); }).then(loadPrivate).then(function () {
      S.dirty = false; S.draft = null; S.edit = false; searchIndex = null; S.edits = {}; if (bj) bj.end(true); if (warn) toast(warn, true); render();
    }).catch(function (e) { if (bj) bj.end(false); prefillLang(); fail(e); }).then(function () { if (btn) btn.disabled = false; });
  }

  /* ------------------------------------------------------------------ automatic translation of edited texts into the other languages */
  // Finds every text whose value in the edited language changed, sends them in one batch to the "translate"
  // function (Supabase Edge Function) and writes the results into the other languages of the draft.
  function changedDicts(draft, orig, lang) {
    var out = [];
    (function walk(o, path) {
      if (!o || typeof o !== 'object') return;
      if (isLangDict(o)) {
        var v = o[lang];
        if (v == null || v === '' || (Array.isArray(v) && !v.length)) return;
        var before = getPath(orig, path);
        if (!before || JSON.stringify(before[lang]) !== JSON.stringify(v)) out.push(path);
        return;
      }
      for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k) && k !== 'diagram') walk(o[k], path ? path + '.' + k : k);
    })(draft, '');
    return out;
  }
  function translateDraft(orig, job) {
    var lang = S.lang, paths = changedDicts(S.draft, orig, lang);
    if (!paths.length || !sb.functions) return Promise.resolve(0);
    var texts = [], slots = []; // slot: { path, shape } where shape is 'str' | 'list' | 'pairs'
    paths.forEach(function (path) {
      var v = getPath(S.draft, path)[lang], start = texts.length, shape;
      if (typeof v === 'string') { texts.push(v); shape = 'str'; }
      else if (Array.isArray(v) && v.every(function (x) { return typeof x === 'string'; })) { v.forEach(function (x) { texts.push(x); }); shape = 'list'; }
      else if (Array.isArray(v)) { v.forEach(function (x) { texts.push(String(x[0] || '')); texts.push(String(x[1] || '')); }); shape = 'pairs'; }
      else return;
      slots.push({ path: path, shape: shape, start: start, len: texts.length - start, skipFr: /\.tr$/.test(path) });
    });
    if (!texts.length) return Promise.resolve(0);
    var targets = LANGS.filter(function (k) { return k !== lang; });
    if (job) job.set(t('translating')); else toast(t('translating'));
    return sb.functions.invoke('translate', { body: { source: lang, targets: targets, texts: texts } }).then(function (r) {
      if (r.error) throw r.error;
      var tr = (r.data && r.data.translations) || {};
      slots.forEach(function (s) {
        var dict = getPath(S.draft, s.path);
        targets.forEach(function (k) {
          var arr = tr[k]; if (!arr || arr.length !== texts.length) return;
          if (s.skipFr && k === 'fr') return; // the French original is shown instead of a translation
          var part = arr.slice(s.start, s.start + s.len);
          if (s.shape === 'str') dict[k] = part[0];
          else if (s.shape === 'list') dict[k] = part;
          else { var pairs = []; for (var i = 0; i < part.length; i += 2) pairs.push([part[i], part[i + 1]]); dict[k] = pairs; }
        });
      });
      return texts.length;
    });
  }

  function listAction(act, listPath, i, tpl) {
    syncDraft();
    var arr = getPath(S.draft, listPath);
    if (!Array.isArray(arr)) { arr = []; setPath(S.draft, listPath, arr); }
    if (act === 'add') arr.push(TPL[tpl] ? TPL[tpl]() : '');
    else if (act === 'del') { if (!window.confirm(t('confirm_remove'))) return; arr.splice(i, 1); }
    else if (act === 'up' && i > 0) arr.splice(i - 1, 0, arr.splice(i, 1)[0]);
    else if (act === 'down' && i < arr.length - 1) arr.splice(i + 1, 0, arr.splice(i, 1)[0]);
    else if (act === 'move' && tpl !== i && tpl >= 0 && tpl < arr.length) arr.splice(tpl, 0, arr.splice(i, 1)[0]);
    // the infographic points follow their part when parts are removed or reordered
    if (/^page\.content\.parts\./.test(listPath) && S.draft.page && Array.isArray(S.draft.page.content.hot)) {
      var hh = S.draft.page.content.hot;
      while (hh.length < arr.length + 1) hh.push(null);
      if (act === 'del') hh.splice(i, 1);
      else if (act === 'up' && i > 0) hh.splice(i - 1, 0, hh.splice(i, 1)[0]);
      else if (act === 'down') hh.splice(i + 1, 0, hh.splice(i, 1)[0]);
      else if (act === 'move' && tpl !== i) hh.splice(tpl, 0, hh.splice(i, 1)[0]);
    }
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
        return track(t('up_image'), upload(PUBLIC_BUCKET, files[0], 'inline', IMG.page)).then(function (url) {
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
    var ij = busy(t('importing'), imgs.length);
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
            .then(function (r) { q(r); uploaded[name] = path; ij.tick(); });
        });
      });
      chain = chain.then(function () {
        var rows = (seed.private || []).map(function (r) {
          var c = clone(r.content);
          (c.figs || []).forEach(function (f) { if (!f.path && f.file) f.path = 'evid/' + f.file; });
          if (c.figs) { c.groups = c.figs.length ? [{ title: { ca: '' }, desc: { ca: '' }, figs: c.figs }] : []; delete c.figs; delete c.wide; }
          return { page_id: r.page_id, content: c };
        });
        return sb.from('page_private').upsert(rows).then(q);
      }).then(function () {
        var rows = Object.keys(seed.site || {}).map(function (k) { return { key: k, value: seed.site[k] }; });
        return rows.length ? sb.from('site').upsert(rows).then(q) : null;
      });
      return chain;
    }).then(function () { return loadPublic(); }).then(loadPrivate).then(function () {
      ij.end(true); msg(form, t('import_done')); renderChrome();
    }).catch(function (e) { ij.end(false); msg(form, t('error') + ' ' + (e.message || e), true); console.error(e); })
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
      if (act === 'theme') {
        e.preventDefault();
        var nt = isDark() ? 'light' : 'dark', open = !!el.closest('.acct-menu[open]');
        document.documentElement.dataset.theme = nt;
        try { localStorage.setItem('9e-theme', nt); } catch (er) {}
        if (window.setFavicon) window.setFavicon();
        renderChrome();
        if (open) { var m = document.querySelector('.acct-menu'); if (m) m.open = true; }
        return;
      }
      if (act === 'logout') { e.preventDefault(); if (!leaveEditOk()) return; S.edit = false; sb.auth.signOut().catch(fail); return; }
      if (act === 'toggle-edit') {
        if (S.edit && !leaveEditOk()) return;
        S.edit = !S.edit; S.draft = null; S.dirty = false; render(); return;
      }
      if (act === 'save') { save(); return; }
      if (act === 'discard') { if (isBusy() && !window.confirm(t('busy_leave'))) return; S.draft = null; S.dirty = false; S.edit = false; render(); return; }
      if (act === 'add' || act === 'del' || act === 'up' || act === 'down') {
        listAction(act, el.getAttribute('data-list'), parseInt(el.getAttribute('data-i') || '0', 10), el.getAttribute('data-tpl')); return;
      }
      if (act === 'img') {
        var target = el.getAttribute('data-target'), also = el.getAttribute('data-also');
        pickFile('image/*').then(function (files) {
          if (!files.length) return;
          syncDraft();
          return track(t('up_image'), upload(PUBLIC_BUCKET, files[0], 'img', IMG.page)).then(function (url) { setPath(S.draft, target, url); if (also) setPath(S.draft, also, url); S.dirty = true; keepScroll(render); });
        }).catch(fail);
        return;
      }
      if (act === 'add-photos') {
        var gi = parseInt(el.getAttribute('data-g'), 10);
        pickFile('image/*', true).then(function (files) {
          if (!files.length) return;
          syncDraft();
          var pid = S.draft.page.id, done = 0, chain = Promise.resolve(), bj = busy(t('up_photos'), files.length);
          files.forEach(function (f) {
            chain = chain.then(function () {
              return uploadPhoto(f, 'evid/' + pid).then(function (r) {
                done++; bj.tick();
                S.draft.priv.groups[gi].figs.push({ path: r.path, thumb: r.thumb, w: r.w, h: r.h, alt: f.name.replace(/\.[^.]+$/, ''), cap: { ca: '' } });
                S.dirty = true;
              });
            });
          });
          return chain.then(function () { bj.end(true); toast(t('saved_photos').replace('{n}', done)); keepScroll(render); }, function (e) { bj.end(false); throw e; });
        }).catch(function (e) { fail(e); keepScroll(render); });
        return;
      }
      if (act === 'hot-pick') { syncDraft(); var hi = parseInt(el.getAttribute('data-i'), 10); S.hotPick = S.hotPick === hi ? null : hi; keepScroll(render); return; }
      if (act === 'hot-del') { syncDraft(); var hc = S.draft.page.content; (hc.hot = hc.hot || [])[parseInt(el.getAttribute('data-i'), 10)] = null; S.dirty = true; keepScroll(render); return; }
      if (act === 'hot-set') {
        if (S.hotPick == null) return;
        var rc = el.getBoundingClientRect(), hx = Math.round(1000 * (e.clientX - rc.left) / rc.width) / 10, hy = Math.round(1000 * (e.clientY - rc.top) / rc.height) / 10;
        syncDraft(); var hc2 = S.draft.page.content; hc2.hot = hc2.hot || [];
        while (hc2.hot.length < S.hotPick) hc2.hot.push(null);
        hc2.hot[S.hotPick] = [hx, hy]; S.hotPick = null; S.dirty = true; keepScroll(render); return;
      }
      if (act === 'ver-open') {
        e.preventDefault();
        var vd = document.getElementById(routeId() + '-ver-' + el.getAttribute('data-i'));
        if (vd) { vd.open = true; vd.scrollIntoView({ behavior: 'smooth', block: 'start' }); }
        return;
      }
      if (act === 'fig-del') {
        e.preventDefault();
        if (!window.confirm(t('remove_img') + '?')) return;
        syncDraft();
        var fid = el.getAttribute('data-fig'), dpath = 'page.content.desc.' + S.lang, darr = getPath(S.draft, dpath) || [];
        setPath(S.draft, dpath, darr.filter(function (x) { return String(x).trim() !== '[[fig:' + fid + ']]'; }));
        S.dirty = true; keepScroll(render); return;
      }
      if (act === 'fig-add') {
        var at = S.figAt;
        pickFile('image/*').then(function (files) {
          if (!files.length) return;
          return track(t('up_image'), upload(PUBLIC_BUCKET, files[0], 'img', IMG.page)).then(function (url) {
            syncDraft();
            var pc = S.draft.page.content, dpath = 'page.content.desc.' + S.lang, arr = getPath(S.draft, dpath);
            if (!Array.isArray(arr)) { arr = []; setPath(S.draft, dpath, arr); }
            var fid = Date.now().toString(36).slice(-5) + Math.random().toString(36).slice(2, 5);
            pc.figs = pc.figs || {}; pc.figs[fid] = { src: url, cap: {} }; pc.figs[fid].cap[S.lang] = '';
            arr.splice(at == null ? arr.length : Math.min(at, arr.length), 0, '[[fig:' + fid + ']]');
            S.figAt = null; S.dirty = true; keepScroll(render);
          });
        }).catch(fail);
        return;
      }
      if (act === 'lightbox') { lightbox(el.getAttribute('data-pid'), parseInt(el.getAttribute('data-g'), 10), parseInt(el.getAttribute('data-i'), 10)); return; }
      if (act === 'add-file') {
        pickFile('', true).then(function (files) {
          if (!files.length) return;
          syncDraft();
          var pid = S.draft.page.id, bj = busy(t('up_files'), files.length);
          return Promise.all(files.map(function (f) { return upload(PRIVATE_BUCKET, f, 'files/' + pid).then(function (p) { bj.tick(); return p; }); }))
            .then(function (v) { bj.end(true); return v; }, function (e) { bj.end(false); throw e; }).then(function (paths) {
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
      if (act === 'sub-detach' || act === 'sub-attach') {
        var kid = act === 'sub-detach' ? el.getAttribute('data-id') : (document.getElementById('subcat-pick') || {}).value;
        if (!kid) return;
        var me = S.draft && S.draft.page ? S.draft.page.id : null;
        var newPar = act === 'sub-detach' ? (S.byId[me].parent_id || null) : el.getAttribute('data-id');
        track(t('saving'), sb.from('pages').update({ parent_id: newPar }).eq('id', kid).then(q).then(function () { return loadPublic(); })).then(function () { keepScroll(render); }).catch(fail);
        return;
      }
      if (act === 'edit-history') { showEditHistory(el.getAttribute('data-pid')); return; }
      if (act === 'sub-new') { if (!leaveEditOk()) return; S.newParent = el.getAttribute('data-id'); S.edit = false; S.draft = null; S.dirty = false; location.hash = 'nova'; return; }
      if (act === 'lang-open') { var lp = document.getElementById('lang-pop'); lp.hidden = !lp.hidden; el.setAttribute('aria-expanded', String(!lp.hidden)); return; }
      if (act === 'lang-set') { document.getElementById('lang-pop').hidden = true; setLang(el.getAttribute('data-lang')); return; }
      if (act === 'delete-page') {
        if (!window.confirm(t('delete_page_q'))) return;
        var id = S.draft.page.id;
        track(t('deleting'), sb.from('pages').delete().eq('id', id).then(q).then(function () {
          S.draft = null; S.dirty = false; S.edit = false;
          return loadPublic().then(loadPrivate);
        })).then(function () { location.hash = ''; render(); }).catch(fail);
        return;
      }
      if (act === 'addrow') {
        var tb = main.querySelector('.block-html table tbody');
        if (tb && tb.rows.length) { var tr = tb.rows[tb.rows.length - 1].cloneNode(true); Array.prototype.forEach.call(tr.cells, function (c) { c.innerHTML = '&nbsp;'; }); tb.appendChild(tr); S.dirty = true; }
        return;
      }
      if (act === 'save-member') {
        var row = el.closest('tr');
        var upd = { esquadra: row.querySelector('[name=esquadra]').value };
        if (!row.hasAttribute('data-me')) { upd.status = row.querySelector('[name=status]').value; upd.role = row.querySelector('[name=role]').value; }
        track(t('saving'), sb.from('profiles').update(upd).eq('id', row.getAttribute('data-id')).then(q)).then(function () { if (row.hasAttribute('data-me')) loadProfile().then(renderChrome); }).catch(fail);
        return;
      }
      if (act === 'del-squad') {
        if (!window.confirm(t('confirm_remove'))) return;
        track(t('deleting'), sb.from('squads').delete().eq('id', el.getAttribute('data-id')).then(q).then(function () { return loadPublic(); })).then(render).catch(fail);
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
  main.addEventListener('change', function (e) {
    var sel = e.target.closest && e.target.closest('.gal-move');
    if (!sel || sel.value === '' || !S.draft) return;
    syncDraft();
    var gs = S.draft.priv.groups, from = parseInt(sel.getAttribute('data-g'), 10), i = parseInt(sel.getAttribute('data-i'), 10), to = parseInt(sel.value, 10);
    gs[to].figs.push(gs[from].figs.splice(i, 1)[0]);
    S.dirty = true; keepScroll(render);
  });
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
  document.addEventListener('selectionchange', function () {
    var sel = window.getSelection(); if (!sel || !sel.rangeCount) return;
    var n = sel.anchorNode; if (!n) return;
    var elx = n.nodeType === 1 ? n : n.parentNode; if (!elx || !elx.closest) return;
    var box = elx.closest('.ed-desc'); if (!box) return;
    if (elx.closest('figure')) return;
    var child = elx; while (child && child.parentNode !== box) child = child.parentNode;
    if (!child) return;
    var idx = 0;
    for (var k = 0; k < box.children.length && box.children[k] !== child; k++) { var ch = box.children[k]; if (ch.tagName === 'FIGURE' || plain(ch.innerHTML)) idx++; }
    S.figAt = idx;
  });
  window.addEventListener('beforeunload', function (e) { if (isBusy() || (S.edit && S.dirty)) { e.preventDefault(); e.returnValue = ''; } });

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
      track(t('saving'), sb.from('profiles').update(upd).eq('id', S.session.user.id).then(q).then(loadProfile)).then(function () { renderChrome(); msg(f, t('saved')); })
        .catch(function (er) { msg(f, t('error') + ' ' + er.message, true); });
    } else if (fid === 'f-password') {
      e.preventDefault();
      if (f.password.value.length < 8) { msg(f, t('pw_short'), true); return; }
      if (f.password.value !== f.password2.value) { msg(f, t('pw_mismatch'), true); return; }
      track(t('saving'), sb.auth.updateUser({ password: f.password.value })).then(function (r) { if (r.error) throw r.error; f.reset(); msg(f, t('pw_changed')); })
        .catch(function (er) { msg(f, t('error') + ' ' + er.message, true); });
    } else if (fid === 'f-squad') {
      e.preventDefault();
      var name = f.name.value.trim(); if (!name) return;
      track(t('saving'), sb.from('squads').insert({ name: name }).then(q).then(function () { return loadPublic(); })).then(render).catch(fail);
    } else if (fid === 'f-import') {
      e.preventDefault(); importSeed(f);
    } else if (fid === 'f-newpage') {
      e.preventDefault();
      var id = f.pid.value.trim();
      if (!/^[a-z0-9][a-z0-9-]{0,59}$/.test(id)) { msg(f, t('id_bad'), true); return; }
      if (S.byId[id] || SPECIAL[id]) { msg(f, t('id_taken'), true); return; }
      var name2 = f.pname.value.trim(), h2 = {}; h2[S.lang] = f.h2.value.trim() || name2;
      var row = { id: id, parent_id: f.parent.value || null, sort: parseInt(f.sort.value, 10) || 0, name: name2, ib: name2, status: 'pending', image: '', card: '', related: [],
        content: { h2: h2, lead: {}, desc: {}, parts: {}, info: {}, std: {}, just: {}, gaps: {} } };
      row.content.desc[S.lang] = [''];
      var srcLang = S.lang, targets = LANGS.filter(function (k) { return k !== srcLang; });
      var nj = busy(t('translating'));
      sb.functions.invoke('translate', { body: { source: srcLang, targets: targets, texts: [h2[srcLang]] } }).then(function (r) {
        nj.set(t('creating_page'));
        var tr = r && r.data && r.data.translations;
        if (tr) targets.forEach(function (k) { if (tr[k] && tr[k][0]) h2[k] = tr[k][0]; });
      }).catch(function () {}).then(function () {
        return sb.from('pages').insert(row).then(q);
      }).then(function () {
        return sb.from('page_private').upsert({ page_id: id, content: { narr: {}, regs: [], evid: {}, groups: [], downloads: [] } }).then(q);
      }).then(function () { return loadPublic(); }).then(loadPrivate).then(function () {
        nj.end(true); S.edit = true; S.draft = null; location.hash = id;
      }).catch(function (er) { nj.end(false); msg(f, t('error') + ' ' + er.message, true); });
    }
  });
  document.addEventListener('input', function (e) {
    var f = e.target.form;
    if (!f || f.getAttribute('id') !== 'f-newpage') return;
    if (e.target.name === 'pname' && !f.pid.dataset.touched) f.pid.value = slug(e.target.value);
    if (e.target.name === 'pid') f.pid.dataset.touched = '1';
  });

  document.addEventListener('click', function (e) {
    var lp = document.getElementById('lang-pop');
    if (lp && !lp.hidden && !e.target.closest('#lang-pick')) lp.hidden = true;
  });
  // drag and drop of editable list rows
  var dnd = null;
  document.addEventListener('dragstart', function (e) {
    var h = e.target.closest && e.target.closest('.drag-h'); if (!h) return;
    dnd = { list: h.getAttribute('data-dnd'), i: parseInt(h.getAttribute('data-i'), 10) };
    e.dataTransfer.effectAllowed = 'move'; try { e.dataTransfer.setData('text/plain', 'row'); } catch (er) { /* ignore */ }
    var row = h.closest('[data-row]'); if (row) row.classList.add('dragging');
  });
  document.addEventListener('dragover', function (e) {
    if (!dnd) return;
    var row = e.target.closest && e.target.closest('[data-row]');
    if (row && row.getAttribute('data-row') === dnd.list) { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; }
  });
  document.addEventListener('drop', function (e) {
    if (!dnd) return;
    var row = e.target.closest && e.target.closest('[data-row]');
    if (row && row.getAttribute('data-row') === dnd.list) { e.preventDefault(); listAction('move', dnd.list, dnd.i, parseInt(row.getAttribute('data-ri'), 10)); }
    dnd = null;
  });
  document.addEventListener('dragend', function () { dnd = null; Array.prototype.forEach.call(document.querySelectorAll('.dragging'), function (r) { r.classList.remove('dragging'); }); });

  function setLang(lang) {
    if (LANGS.indexOf(lang) < 0 || lang === S.lang) return;
    syncDraft(); pruneFallbacks();
    S.lang = lang;
    try { localStorage.setItem('9e-lang', S.lang); } catch (er) { /* ignore */ }
    prefillLang();
    searchIndex = null;
    keepScroll(render);
  }

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

  /* ------------------------------------------------------------------ search: item pages only, any language, with suggestions */
  // extra words people may type for each item (several languages, including Spanish); admins can add more per page ("keywords")
  var SYN = {
    shako: ['shako', 'shakos', 'chako', 'chaco', 'chacó', 'xacó', 'tschako', 'czako', 'hat', 'headdress', 'headgear', 'barret', 'sombrero', 'cappello', 'chapeau', 'couvre-chef', 'kopfbedeckung', 'hut'],
    cordon: ['cordon', 'cordons', 'cord', 'cords', 'shako cords', 'cordó', 'cordón', 'cordone', 'cordoni', 'schnur', 'schnüre', 'raquettes', 'tresse'],
    plaque: ['plaque', 'plate', 'shako plate', 'badge', 'placa', 'escut', 'escudo', 'piastra', 'placca', 'schild', 'tschakoschild', 'emblem'],
    plumet: ['plumet', 'plume', 'plumes', 'feather', 'plomall', 'ploma', 'penacho', 'pluma', 'pennacchio', 'federbusch', 'feder'],
    cocarde: ['cocarde', 'cockade', 'escarapel·la', 'escarapela', 'escarapella', 'coccarda', 'kokarde', 'roundel'],
    pompon: ['pompon', 'pompom', 'pompoms', 'tuft', 'borla', 'nappina', 'houppe', 'puschel'],
    col: ['col', 'stock', 'neck stock', 'cravat', 'coll', 'corbata', 'cuello', 'colletto', 'cravatta', 'halsbinde', 'cravate'],
    veste: ['veste', 'waistcoat', 'vest', 'gilet', 'armilla', 'chaleco', 'panciotto', 'weste', 'jupa'],
    pantalon: ['pantalon', 'trousers', 'pants', 'breeches', 'pantaló', 'pantalons', 'pantalón', 'pantalones', 'pantaloni', 'calzoni', 'hose', 'culotte', 'calçons'],
    guetres: ['guêtres', 'guetres', 'gaiters', 'spatterdashes', 'leggings', 'polaines', 'polaina', 'polainas', 'ghette', 'gamaschen', 'gamasche'],
    habit: ['habit', 'habit-veste', 'coat', 'jacket', 'tunic', 'uniform coat', 'casaca', 'jaqueta', 'chaqueta', 'giacca', 'abito', 'rock', 'uniformrock', 'veste courte'],
    boutons: ['boutons', 'bouton', 'buttons', 'button', 'botons', 'botó', 'botones', 'botón', 'bottoni', 'bottone', 'knöpfe', 'knopf'],
    epaulettes: ['épaulettes', 'epaulettes', 'epaulets', 'shoulder', 'charreteres', 'xarreteres', 'charreteras', 'hombreras', 'spalline', 'epauletten'],
    giberne: ['giberne', 'cartridge box', 'cartridge pouch', 'pouch', 'cartutxera', 'cartuchera', 'canana', 'giberna', 'patronentasche'],
    briquet: ['briquet', 'sabre-briquet', 'sabre', 'sword', 'short sword', 'sabre curt', 'espasa', 'espada', 'sable', 'sciabola', 'säbel', 'saebel'],
    dragonne: ['dragonne', 'sword knot', 'dragona', 'troddel', 'portepee', 'fiocco'],
    buffleterie: ['buffleterie', 'belts', 'belting', 'crossbelt', 'crossbelts', 'leather equipment', 'buff equipment', 'corretjam', 'corretges', 'correaje', 'correas', 'bandolera', 'cuoiame', 'lederzeug', 'baudrier', 'porte-giberne']
  };
  var searchIndex = null, sItems = [], sSel = -1;
  function norm(s) { return String(s).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[·'’]/g, '').trim(); }
  var ARTICLES = /^(el|la|els|les|l|the|il|lo|gli|le|i|der|die|das|den|un|une|una|a|an)\s+/;
  function buildIndex() {
    return S.order.map(function (id) {
      var p = S.byId[id], c = p.content || {}, terms = {};
      function add(x) { x = norm(plain(x || '')); if (x.length > 1) { terms[x] = 1; terms[x.replace(ARTICLES, '')] = 1; } }
      add(p.name); add(p.ib); add(id.replace(/-/g, ' '));
      LANGS.forEach(function (k) { if (c.h2 && c.h2[k]) add(c.h2[k]); if (TERMS[k][id]) TERMS[k][id].forEach(add); });
      (SYN[id] || []).forEach(add);
      (c.keywords || []).forEach(add);
      return { id: id, terms: Object.keys(terms) };
    });
  }
  function lev(a, b) {
    if (a === b) return 0;
    var m = a.length, n = b.length, prev = [], cur, i, j;
    for (j = 0; j <= n; j++) prev[j] = j;
    for (i = 1; i <= m; i++) {
      cur = [i];
      for (j = 1; j <= n; j++) cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
      prev = cur;
    }
    return prev[n];
  }
  // 100 exact · 90 starts with · 80 a word starts with · 70 contains · up to 60 similar spelling
  function scoreTerm(qv, term) {
    if (term === qv) return 100;
    if (term.indexOf(qv) === 0) return 90;
    var words = term.split(/[\s-]+/);
    if (words.some(function (w) { return w.indexOf(qv) === 0; })) return 80;
    if (qv.length > 2 && term.indexOf(qv) > -1) return 70;
    var best = 0;
    words.concat([term]).forEach(function (w) {
      var cut = w.slice(0, qv.length + 1);
      var sim = Math.max(1 - lev(qv, w) / Math.max(qv.length, w.length, 1), 1 - lev(qv, cut) / Math.max(qv.length, cut.length, 1));
      if (sim > best) best = sim;
    });
    return Math.round(best * 60);
  }
  function searchPieces(qv) {
    if (!searchIndex) searchIndex = buildIndex();
    return searchIndex.map(function (e) {
      var best = 0, via = '';
      e.terms.forEach(function (term) { var s = scoreTerm(qv, term); if (s > best) { best = s; via = term; } });
      return { id: e.id, score: best, via: via };
    }).sort(function (a, b) { return b.score - a.score || S.order.indexOf(a.id) - S.order.indexOf(b.id); });
  }
  var qIn = document.getElementById('q'), sBox = document.getElementById('s-results');
  function sClose() { sBox.hidden = true; qIn.setAttribute('aria-expanded', 'false'); sSel = -1; }
  function sRun() {
    var qv = norm(qIn.value);
    if (qv.length < 2 || !S.ready) { sClose(); return; }
    var all = searchPieces(qv);
    var hits = all.filter(function (r) { return r.score >= 65; }).slice(0, 8);
    var suggest = !hits.length;
    if (suggest) hits = all.filter(function (r) { return r.score >= 25; }).slice(0, 6);
    sBox.innerHTML = ''; sItems = []; sSel = -1;
    var head = document.createElement('div'); head.className = 's-group';
    head.textContent = suggest ? (hits.length ? t('did_you_mean') : t('none')) : t('pieces_found');
    sBox.appendChild(head);
    hits.forEach(function (r, i) {
      var p = S.byId[r.id], c = p.content || {};
      var title = plain(L(c.h2)) || p.name;
      var a = document.createElement('a'); a.className = 's-item s-piece'; a.href = '#' + r.id; a.id = 's-opt-' + i;
      a.setAttribute('role', 'option'); a.setAttribute('aria-selected', 'false');
      var par = parentOf(r.id);
      var via = r.via && norm(title).indexOf(r.via) < 0 && norm(p.name).indexOf(r.via) < 0 ? '<span class="s-via">“' + esc(r.via) + '” →</span> ' : '';
      a.innerHTML = '<span class="s-snip">' + via + '<strong>' + esc(title) + '</strong>' + (p.name && norm(p.name) !== norm(title) ? ' <span class="s-fr" lang="fr">' + esc(p.name) + '</span>' : '') +
        (par ? '<span class="s-par">' + esc(plain(L(S.byId[par].content.h2)) || S.byId[par].name) + '</span>' : '') + '</span>';
      a.addEventListener('mousedown', function (ev) { ev.preventDefault(); sGo(r.id); });
      sBox.appendChild(a); sItems.push({ a: a, id: r.id });
    });
    if (!hits.length) {
      // nothing similar: offer the full list of items
      S.order.forEach(function (id, i) {
        var a = document.createElement('a'); a.className = 's-item s-piece'; a.href = '#' + id; a.id = 's-opt-' + i;
        a.setAttribute('role', 'option'); a.setAttribute('aria-selected', 'false');
        a.innerHTML = '<span class="s-snip"><strong>' + esc(plain(L(S.byId[id].content.h2)) || S.byId[id].name) + '</strong></span>';
        a.addEventListener('mousedown', function (ev) { ev.preventDefault(); sGo(id); });
        sBox.appendChild(a); sItems.push({ a: a, id: id });
      });
      head.textContent = t('none') + ' · ' + t('all_pieces');
    }
    sBox.hidden = false; qIn.setAttribute('aria-expanded', 'true');
  }
  function sGo(id) {
    sClose(); qIn.value = ''; qIn.blur();
    if (routeId() !== id) location.hash = id;
  }
  qIn.addEventListener('input', sRun);
  qIn.addEventListener('focus', function () { if (qIn.value.trim().length > 1) sRun(); });
  qIn.addEventListener('blur', function () { setTimeout(sClose, 120); });
  qIn.addEventListener('keydown', function (ev) {
    function mark(i) { sItems.forEach(function (it, j) { it.a.setAttribute('aria-selected', j === i ? 'true' : 'false'); }); sSel = i; if (sItems[i]) { sItems[i].a.scrollIntoView({ block: 'nearest' }); qIn.setAttribute('aria-activedescendant', sItems[i].a.id); } }
    if (ev.key === 'ArrowDown') { ev.preventDefault(); if (sItems.length) mark(Math.min(sItems.length - 1, sSel + 1)); }
    else if (ev.key === 'ArrowUp') { ev.preventDefault(); if (sItems.length) mark(Math.max(0, sSel - 1)); }
    else if (ev.key === 'Enter') { if (sItems.length) { ev.preventDefault(); sGo(sItems[Math.max(0, sSel)].id); } }
    else if (ev.key === 'Escape') sClose();
  });
  document.addEventListener('keydown', function (ev) {
    if (ev.key === '/' && document.activeElement !== qIn && !/INPUT|TEXTAREA|SELECT/.test(document.activeElement.tagName) && !document.activeElement.isContentEditable) { ev.preventDefault(); qIn.focus(); }
  });

  /* ------------------------------------------------------------------ start */
  // language: the visitor's saved choice, else the browser's preferred language if supported, else English
  (function () {
    try { var sl = localStorage.getItem('9e-lang'); if (LANGS.indexOf(sl) > -1) { S.lang = sl; return; } } catch (er) { /* ignore */ }
    var prefs = (navigator.languages && navigator.languages.length) ? navigator.languages : [navigator.language || ''];
    for (var i = 0; i < prefs.length; i++) { var c = String(prefs[i] || '').toLowerCase().split('-')[0]; if (LANGS.indexOf(c) > -1) { S.lang = c; return; } }
  })();
  window.addEventListener('hashchange', route);

  /* ------------------------------------------------------------------ comments, mentions and notifications */
  S.dir = null; S.notifs = []; S.cmts = {}; S.cmtFocus = null;
  function dirName(m) { return m.nom_guerre || ((m.first_name || '') + ' ' + (m.last_name || '')).trim() || '?'; }
  function loadDir() {
    if (S.dir || !isMember()) return Promise.resolve(S.dir || []);
    return sb.rpc('member_directory').then(function (r) { S.dir = q(r) || []; return S.dir; });
  }
  // names a member can be mentioned by: nom de guerre, full name, first name (longest first)
  function mentionKeys() {
    var out = [];
    (S.dir || []).forEach(function (m) {
      [m.nom_guerre, ((m.first_name || '') + ' ' + (m.last_name || '')).trim(), m.first_name].forEach(function (k) {
        if (k && k.trim()) out.push({ k: k.trim(), id: m.id });
      });
    });
    return out.sort(function (a, b) { return b.k.length - a.k.length; });
  }
  function rxq(s) { return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }
  function findMentions(text) {
    var ids = [];
    mentionKeys().forEach(function (x) {
      if (new RegExp('@' + rxq(x.k) + '(?![\\p{L}\\p{N}_])', 'iu').test(text) && ids.indexOf(x.id) < 0) ids.push(x.id);
    });
    return ids;
  }
  function cmBody(c) {
    var h = esc(c.body);
    var keys = mentionKeys().filter(function (x) { return (c.mentions || []).indexOf(x.id) > -1; });
    if (keys.length) {
      var rx = new RegExp('@(' + keys.map(function (x) { return rxq(esc(x.k)); }).join('|') + ')(?![\\p{L}\\p{N}_])', 'giu');
      h = h.replace(rx, function (m) { return '<span class="cm-at">' + m + '</span>'; });
    }
    h = h.replace(/(https?:\/\/[^\s<]+)/g, '<a href="$1" target="_blank" rel="noopener">$1</a>');
    return h.replace(/\n/g, '<br>');
  }
  function cmForm(parent) {
    return '<form class="cm-form" data-parent="' + (parent || '') + '"><div class="cm-ta"><textarea rows="' + (parent ? 2 : 3) + '" required maxlength="5000" placeholder="' + esc(t(parent ? 'cm_reply_ph' : 'cm_ph')) + '"></textarea></div>' +
      '<div class="cm-actions">' + (parent ? '<button type="button" class="btn-ghost" data-act="cm-cancel">' + esc(t('cm_cancel')) + '</button>' : '') +
      '<button type="submit" class="btn">' + esc(t('cm_post')) + '</button></div></form>';
  }
  function cmOne(c, kids) {
    var me = S.session && c.author === S.session.user.id;
    return '<article class="cm' + (c.parent_id ? ' cm-r' : '') + '" id="c-' + c.id + '">' +
      '<header><b>' + esc(c.author_name || '?') + '</b> <time datetime="' + esc(c.created_at) + '">' + esc(fmtDate(c.created_at, true)) + '</time></header>' +
      '<div class="cm-body">' + cmBody(c) + '</div>' +
      '<footer>' + (c.parent_id ? '' : '<button type="button" class="link" data-act="cm-reply" data-id="' + c.id + '">' + esc(t('cm_reply')) + '</button>') +
      (me || isAdmin() ? '<button type="button" class="link" data-act="cm-del" data-id="' + c.id + '">' + esc(t('cm_delete')) + '</button>' : '') + '</footer>' +
      (kids ? '<div class="cm-replies">' + kids.map(function (k) { return cmOne(k); }).join('') + '<div class="cm-slot" data-slot="' + c.id + '"></div></div>' : '') +
      '</article>';
  }
  function drawCmts(pid) {
    var box = document.getElementById('cmts');
    if (!box || box.getAttribute('data-pid') !== pid) return;
    var all = S.cmts[pid] || [], top = all.filter(function (c) { return !c.parent_id; });
    box.innerHTML = '<h3>' + esc(t('cm_title')) + (all.length ? ' <span class="count">' + all.length + '</span>' : '') + '</h3>' +
      (top.length ? top.map(function (c) { return cmOne(c, all.filter(function (k) { return k.parent_id === c.id; })); }).join('') : '<p class="muted">' + esc(t('cm_none')) + '</p>') +
      cmForm('');
    if (S.cmtFocus) {
      var el = document.getElementById('c-' + S.cmtFocus); S.cmtFocus = null;
      if (el) { el.classList.add('cm-hit'); el.scrollIntoView({ block: 'center', behavior: reduced() ? 'auto' : 'smooth' }); }
    }
  }
  function cmMount(id) {
    if (!S.byId[id] || S.edit) return;
    var sec = document.createElement('section');
    sec.className = 'cmts'; sec.id = 'cmts'; sec.setAttribute('data-pid', id);
    var host = main.querySelector('.wiki-body') || main.querySelector('.view') || main;
    host.appendChild(sec);
    if (!isMember()) { sec.innerHTML = '<h3>' + esc(t('cm_title')) + '</h3><p class="muted">' + esc(t('cm_locked')) + '</p>'; return; }
    if (S.cmts[id]) drawCmts(id);
    Promise.all([loadDir(), sb.from('comments').select('*').eq('page_id', id).order('created_at').then(q)]).then(function (r) {
      S.cmts[id] = r[1] || []; drawCmts(id);
    }).catch(fail);
  }
  function cmPost(form) {
    var ta = form.querySelector('textarea'), body = ta.value.trim(), pid = document.getElementById('cmts').getAttribute('data-pid');
    if (!body) return;
    var row = { page_id: pid, body: body, mentions: findMentions(body) };
    if (form.getAttribute('data-parent')) row.parent_id = +form.getAttribute('data-parent');
    form.querySelector('[type=submit]').disabled = true;
    track(t('saving'), sb.from('comments').insert(row).select().single().then(q)).then(function (c) {
      (S.cmts[pid] = S.cmts[pid] || []).push(c); S.cmtFocus = c.id; drawCmts(pid);
    }).catch(function (e) { form.querySelector('[type=submit]').disabled = false; fail(e); });
  }
  /* @-autocomplete */
  var MP = { el: null, ta: null, at: -1, items: [], sel: 0 };
  function mpClose() { if (MP.el) MP.el.hidden = true; MP.ta = null; }
  function mpUpdate(ta) {
    var v = ta.value, pos = ta.selectionStart, before = v.slice(0, pos);
    var m = /(^|[^\p{L}\p{N}_])@([\p{L}\p{N}_' .-]{0,24})$/u.exec(before);
    if (!m || !S.dir) return mpClose();
    var qv = norm(m[2]);
    if (/\s\s|\s$/.test(m[2]) && !S.dir.some(function (d) { return norm(dirName(d)).indexOf(qv) === 0; })) return mpClose();
    MP.items = S.dir.filter(function (d) {
      return !qv || [d.nom_guerre, d.first_name, d.last_name, ((d.first_name || '') + ' ' + (d.last_name || ''))].some(function (k) { return k && norm(k).indexOf(qv) === 0; });
    }).slice(0, 8);
    if (!MP.items.length) return mpClose();
    MP.ta = ta; MP.at = pos - m[2].length - 1; MP.sel = 0;
    if (!MP.el) { MP.el = document.createElement('div'); MP.el.className = 'mention-pop'; MP.el.setAttribute('role', 'listbox'); }
    ta.parentNode.appendChild(MP.el);
    mpDraw();
  }
  function mpDraw() {
    MP.el.hidden = false;
    MP.el.innerHTML = MP.items.map(function (d, i) {
      var full = ((d.first_name || '') + ' ' + (d.last_name || '')).trim();
      return '<button type="button" role="option" data-mi="' + i + '" aria-selected="' + (i === MP.sel) + '"><b>' + esc(dirName(d)) + '</b>' +
        (d.nom_guerre && full ? '<span>' + esc(full) + '</span>' : '') + '</button>';
    }).join('');
  }
  function mpPick(i) {
    var d = MP.items[i], ta = MP.ta; if (!d || !ta) return;
    var ins = '@' + dirName(d) + ' ';
    ta.value = ta.value.slice(0, MP.at) + ins + ta.value.slice(ta.selectionStart);
    var p = MP.at + ins.length; ta.focus(); ta.setSelectionRange(p, p); mpClose();
  }
  document.addEventListener('input', function (e) { if (e.target.matches && e.target.matches('.cm-form textarea')) mpUpdate(e.target); });
  document.addEventListener('keydown', function (e) {
    if (!MP.ta || e.target !== MP.ta || MP.el.hidden) return;
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); MP.sel = (MP.sel + (e.key === 'ArrowDown' ? 1 : -1) + MP.items.length) % MP.items.length; mpDraw(); }
    else if (e.key === 'Enter' || e.key === 'Tab') { e.preventDefault(); mpPick(MP.sel); }
    else if (e.key === 'Escape') { e.preventDefault(); mpClose(); }
  }, true);
  document.addEventListener('mousedown', function (e) {
    var b = e.target.closest && e.target.closest('.mention-pop [data-mi]');
    if (b) { e.preventDefault(); mpPick(+b.getAttribute('data-mi')); }
    else if (MP.ta && !(e.target.closest && e.target.closest('.mention-pop'))) mpClose();
  });
  document.addEventListener('submit', function (e) { if (e.target.matches('.cm-form')) { e.preventDefault(); cmPost(e.target); } });
  /* notifications */
  function loadNotifs() {
    if (!S.session || !isMember()) { S.notifs = []; drawBell(); return Promise.resolve(); }
    return sb.from('notifications').select('*').order('created_at', { ascending: false }).limit(30).then(function (r) { S.notifs = q(r) || []; drawBell(); }).catch(function (e) { console.error(e); });
  }
  function drawBell() {
    var w = document.getElementById('bell-wrap'); if (!w) return;
    if (!S.session || !isMember()) { w.innerHTML = ''; return; }
    var n = S.notifs.filter(function (x) { return !x.read_at; }).length, open = !!S.bellOpen;
    w.innerHTML = '<button type="button" class="btn-ghost bell" data-act="bell" aria-expanded="' + open + '" aria-label="' + esc(t('notif_title') + (n ? ' (' + n + ')' : '')) + '" title="' + esc(t('notif_title')) + '">' +
      '<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path fill="currentColor" d="M12 22a2.5 2.5 0 0 0 2.45-2h-4.9A2.5 2.5 0 0 0 12 22Zm7-6V11a7 7 0 0 0-5.5-6.84V3.5a1.5 1.5 0 0 0-3 0v.66A7 7 0 0 0 5 11v5l-2 2v1h18v-1l-2-2Z"/></svg>' +
      (n ? '<span class="badge">' + (n > 9 ? '9+' : n) + '</span>' : '') + '</button>' +
      (open ? '<div class="bell-pop"><div class="bell-h"><b>' + esc(t('notif_title')) + '</b>' + (n ? '<button type="button" class="link" data-act="notif-all">' + esc(t('notif_all_read')) + '</button>' : '') + '</div>' +
        (S.notifs.length ? S.notifs.map(function (x) {
          var pg = S.byId[x.page_id];
          return '<button type="button" class="notif' + (x.read_at ? '' : ' unread') + '" data-act="notif-go" data-id="' + x.id + '"><span><b>' + esc(x.actor_name || '?') + '</b> ' + esc(t(x.kind === 'reply' ? 'cm_replied' : 'cm_mentioned')) + ' <b lang="fr">' + esc(pg ? pg.name : x.page_id) + '</b></span><time>' + esc(fmtDate(x.created_at, true)) + '</time></button>';
        }).join('') : '<p class="muted">' + esc(t('notif_none')) + '</p>') + '</div>' : '');
  }
  function markRead(ids) {
    var now = new Date().toISOString();
    S.notifs.forEach(function (x) { if (ids.indexOf(x.id) > -1 && !x.read_at) x.read_at = now; });
    drawBell();
    return sb.from('notifications').update({ read_at: now }).in('id', ids).is('read_at', null).then(q).catch(function (e) { console.error(e); });
  }
  document.addEventListener('click', function (e) {
    var el = e.target.closest('[data-act]'), act = el && el.getAttribute('data-act');
    if (S.bellOpen && !e.target.closest('#bell-wrap')) { S.bellOpen = false; drawBell(); }
    if (!act) return;
    if (act === 'bell') { S.bellOpen = !S.bellOpen; drawBell(); if (S.bellOpen) loadNotifs(); }
    else if (act === 'notif-all') { markRead(S.notifs.map(function (x) { return x.id; })); }
    else if (act === 'notif-go') {
      var x = S.notifs.filter(function (n) { return n.id === +el.getAttribute('data-id'); })[0]; if (!x) return;
      S.bellOpen = false; markRead([x.id]); S.cmtFocus = x.comment_id; delete S.cmts[x.page_id];
      if (routeId() === x.page_id) render(); else location.hash = x.page_id;
    } else if (act === 'cm-reply') {
      var slot = document.querySelector('[data-slot="' + el.getAttribute('data-id') + '"]');
      if (!slot) { var art = document.getElementById('c-' + el.getAttribute('data-id')); art.insertAdjacentHTML('beforeend', '<div class="cm-replies"><div class="cm-slot" data-slot="' + el.getAttribute('data-id') + '"></div></div>'); slot = art.querySelector('.cm-slot'); }
      if (!slot.firstChild) slot.innerHTML = cmForm(el.getAttribute('data-id'));
      slot.querySelector('textarea').focus();
    } else if (act === 'cm-cancel') { el.closest('.cm-slot').innerHTML = ''; }
    else if (act === 'cm-del') {
      if (!window.confirm(t('cm_del_q'))) return;
      var cid = +el.getAttribute('data-id'), pid = document.getElementById('cmts').getAttribute('data-pid');
      track(t('deleting'), sb.from('comments').delete().eq('id', cid).then(q)).then(function () {
        S.cmts[pid] = (S.cmts[pid] || []).filter(function (c) { return c.id !== cid && c.parent_id !== cid; }); drawCmts(pid);
      }).catch(fail);
    }
  });
  setInterval(function () { if (document.visibilityState === 'visible') loadNotifs(); }, 60000);
  document.addEventListener('visibilitychange', function () { if (document.visibilityState === 'visible') loadNotifs(); });

  function afterAuth() {
    return loadProfile().then(loadPrivate).then(function () {
      searchIndex = null;
      if (!isAdmin()) { S.edit = false; S.draft = null; }
      S.dir = null; S.cmts = {};
      render(); loadNotifs();
    }).catch(fail);
  }
  function start() {
    main.innerHTML = '<p class="muted loading">' + esc(t('loading')) + '</p>';
    if (!sb) { main.innerHTML = '<p class="muted">' + esc(t('load_err')) + ' (config.js)</p>'; return; }
    sb.auth.getSession().then(function (r) {
      S.session = r.data && r.data.session || null;
      return loadPublic();
    }).then(loadProfile).then(loadPrivate).then(function () {
      S.ready = true; route(); loadNotifs();
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
