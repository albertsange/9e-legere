/* In-memory stand-in for supabase-js, used only for local browser tests.
   It mimics the database rules of schema.sql: anyone reads pages/site/squads,
   approved members read page_private, only admins write. */
(function () {
  var seed = window.__SEED;
  var USERS = [
    { id: 'u-admin', email: 'admin@test.org', password: 'adminpass1', profile: { first_name: 'Ada', last_name: 'Admin', nom_guerre: 'La Tour', esquadra: 'A', role: 'admin', status: 'approved' } },
    { id: 'u-member', email: 'member@test.org', password: 'memberpass1', profile: { first_name: 'Mem', last_name: 'Ber', nom_guerre: 'Sans-Souci', esquadra: 'B', role: 'member', status: 'approved' } },
    { id: 'u-pending', email: 'pending@test.org', password: 'pendingpass1', profile: { first_name: 'Pen', last_name: 'Ding', nom_guerre: 'Va-de-bon-cœur', esquadra: 'C', role: 'member', status: 'pending' } }
  ];
  var db = {
    pages: seed.pages.map(function (p) { return JSON.parse(JSON.stringify(p)); }),
    page_private: seed.private.map(function (r) {
      var c = JSON.parse(JSON.stringify(r.content));
      (c.figs || []).forEach(function (f) { f.path = 'evid/' + f.file; });
      return { page_id: r.page_id, content: c };
    }),
    inspections: (seed.inspections || []).map(function (r) { return JSON.parse(JSON.stringify(r)); }),
    site: Object.keys(seed.site).map(function (k) { return { key: k, value: JSON.parse(JSON.stringify(seed.site[k])) }; }),
    squads: [{ id: 1, name: 'Esquadra A' }, { id: 2, name: 'Esquadra B' }],
    page_edits: [{ id: 1, page_id: 'shako', editor_name: 'La Tour', edited_at: '2026-10-21T15:00:00Z', fields: ['desc', 'std'] }, { id: 2, page_id: 'shako', editor_name: 'Bonaparte', edited_at: '2026-10-20T10:00:00Z', fields: ['info'] }],
    comments: [], notifications: [], inspection_findings: [], squad_rosters: [], squad_members: [], squad_events: [],
    profiles: USERS.map(function (u) { var p = JSON.parse(JSON.stringify(u.profile)); p.id = u.id; p.email = u.email; p.created_at = new Date().toISOString(); return p; })
  };
  var KEY = { inspections: 'id', page_edits: 'id', pages: 'id', page_private: 'page_id', site: 'key', squads: 'id', profiles: 'id', comments: 'id', notifications: 'id', squad_rosters: 'squad', squad_members: 'id', squad_events: 'id' };
  var storage = {}; // path -> url
  var session = null, listeners = [];
  var log = window.__MOCKLOG = [];

  function me() { return session && db.profiles.filter(function (p) { return p.id === session.user.id; })[0]; }
  function member() { var p = me(); return !!(p && p.status === 'approved'); }
  function admin() { var p = me(); return member() && p.role === 'admin'; }
  function canRead(t, row) {
    if (t === 'page_private' || t === 'comments') return member();
    if (t === 'notifications') return session && row.user_id === session.user.id;
    if (t === 'profiles') return session && (row.id === session.user.id || admin());
    return true;
  }
  function canWrite(t, row) {
    if (t === 'comments') return member();
    if (t === 'notifications') return session && row.user_id === session.user.id;
    if (t === 'profiles') return session && (row.id === session.user.id || admin());
    return admin();
  }
  function clone(x) { return JSON.parse(JSON.stringify(x)); }

  function Q(table) { this.t = table; this.op = 'select'; this.filters = []; this.ord = null; this.one = false; }
  Q.prototype.select = function () { if (this.op === 'select') this.op = 'select'; return this; };
  Q.prototype.order = function (c, o) { this.ord = [c, !(o && o.ascending === false)]; return this; };
  Q.prototype.eq = function (c, v) { this.filters.push([c, v]); return this; };
  Q.prototype.single = function () { this.one = true; return this; };
  Q.prototype.limit = function () { return this; };
  Q.prototype.in = function (c, v) { this.filters.push([c, v, 'in']); return this; };
  Q.prototype.is = function (c, v) { this.filters.push([c, v, 'is']); return this; };
  Q.prototype.maybeSingle = function () { this.one = true; return this; };
  Q.prototype.update = function (v) { this.op = 'update'; this.val = v; return this; };
  Q.prototype.upsert = function (v) { this.op = 'upsert'; this.val = v; return this; };
  Q.prototype.insert = function (v) { this.op = 'insert'; this.val = v; return this; };
  Q.prototype.delete = function () { this.op = 'delete'; return this; };
  Q.prototype.then = function (res, rej) { var self = this; return new Promise(function (r) { setTimeout(function () { r(self.run()); }, 5); }).then(res, rej); };
  Q.prototype.match = function (row) { return this.filters.every(function (f) { return f[2] === 'in' ? f[1].indexOf(row[f[0]]) > -1 : f[2] === 'is' ? row[f[0]] == f[1] : String(row[f[0]]) === String(f[1]); }); };
  Q.prototype.run = function () {
    var t = this.t, rows = db[t], self = this, k = KEY[t];
    log.push(this.op + ' ' + t);
    if (this.op === 'select') {
      var out = rows.filter(function (r) { return self.match(r) && canRead(t, r); }).map(clone);
      if (this.ord) { var c = this.ord[0], asc = this.ord[1]; out.sort(function (a, b) { return (a[c] > b[c] ? 1 : a[c] < b[c] ? -1 : 0) * (asc ? 1 : -1); }); }
      return { data: this.one ? (out[0] || null) : out, error: null };
    }
    if (this.op === 'update') {
      var n = 0;
      rows.forEach(function (r) {
        if (!self.match(r) || !canWrite(t, r)) return;
        var v = clone(self.val);
        if (t === 'profiles' && !admin()) { delete v.role; delete v.status; delete v.email; }
        Object.assign(r, v); n++;
      });
      return { data: null, error: null, count: n };
    }
    if (this.op === 'delete' && t === 'comments') {
      db.comments = rows.filter(function (r) { return !(self.match(r) && (admin() || r.author === session.user.id)) && !db.comments.some(function (x) { return x.id === r.parent_id && self.match(x); }); });
      return { data: null, error: null };
    }
    if (this.op === 'insert' && t === 'comments') {
      if (!member()) return { data: null, error: { message: 'rls' } };
      var c = clone(this.val), m = me(); c.id = rows.length + 1; c.author = m.id; c.author_name = m.nom_guerre; c.created_at = new Date().toISOString();
      if (c.parent_id) { var par = rows.filter(function (r) { return r.id === c.parent_id; })[0]; c.parent_id = par.parent_id || par.id; }
      rows.push(c);
      (c.mentions || []).forEach(function (u) { if (u !== c.author) db.notifications.push({ id: db.notifications.length + 1, user_id: u, comment_id: c.id, page_id: c.page_id, actor_name: c.author_name, kind: 'mention', read_at: null, created_at: c.created_at }); });
      return { data: clone(c), error: null };
    }
    if (this.op === 'delete') {
      if (!admin()) return { data: null, error: null };
      db[t] = rows.filter(function (r) { return !self.match(r); });
      if (t === 'pages') {
        db.page_private = db.page_private.filter(function (r) { return db.pages.some(function (p) { return p.id === r.page_id; }); });
        db.pages.forEach(function (p) { if (p.parent_id && !db.pages.some(function (x) { return x.id === p.parent_id; })) p.parent_id = null; });
      }
      return { data: null, error: null };
    }
    var vals = Array.isArray(this.val) ? this.val : [this.val];
    if (!vals.every(function (v) { return canWrite(t, v); })) return { data: null, error: { message: 'new row violates row-level security policy for table "' + t + '"' } };
    for (var i = 0; i < vals.length; i++) {
      var v = clone(vals[i]);
      if (t === 'squads' && v.id == null) v.id = Date.now() + i;
      if (/^squad_(members|events)$/.test(t) && v.id == null) { v.id = 'r' + Math.random().toString(36).slice(2, 10); v.created_at = new Date().toISOString(); v.extra = v.extra || {}; v.kit = v.kit || {}; if (t === 'squad_events') v.attendees = v.attendees || []; }
      var ex = rows.filter(function (r) { return r[k] === v[k]; })[0];
      if (ex && this.op === 'insert') return { data: null, error: { message: 'duplicate key value violates unique constraint' } };
      if (ex) Object.assign(ex, v); else rows.push(Object.assign({ sort: 0, related: [], content: {} }, t === 'pages' ? {} : {}, v));
      if (t === 'pages' && !ex && !db.page_private.some(function (r) { return r.page_id === v.id; })) db.page_private.push({ page_id: v.id, content: {} });
      if (/^squad_/.test(t) && vals.length === 1) return { data: clone(ex || rows[rows.length - 1]), error: null };
    }
    return { data: null, error: null };
  };

  function bucket(name) {
    return {
      upload: function (path, file) {
        log.push('upload ' + name + ' ' + path);
        if (!admin()) return Promise.resolve({ data: null, error: { message: 'new row violates row-level security policy' } });
        storage[name + '/' + path] = URL.createObjectURL(file);
        return Promise.resolve({ data: { path: path }, error: null });
      },
      getPublicUrl: function (path) { return { data: { publicUrl: storage[name + '/' + path] || ('https://example.supabase.co/storage/v1/object/public/' + name + '/' + path) } }; },
      createSignedUrls: function (paths) {
        log.push('sign ' + paths.length);
        if (!member()) return Promise.resolve({ data: paths.map(function (p) { return { path: p, signedUrl: null, error: 'not found' }; }), error: null });
        return Promise.resolve({ data: paths.map(function (p) {
          var u = storage[name + '/' + p] || (/^evid\//.test(p) ? '/img/' + p.slice(5) : null);
          return { path: p, signedUrl: u, error: u ? null : 'not found' };
        }), error: null });
      },
      remove: function (paths) { log.push('remove ' + paths.join(',')); window.__REMOVED = (window.__REMOVED || []).concat(paths); return Promise.resolve({ data: [], error: null }); },
      createSignedUrl: function (p) { return Promise.resolve({ data: member() ? { signedUrl: storage[name + '/' + p] || '#' } : null, error: member() ? null : { message: 'Object not found' } }); }
    };
  }
  function emit(ev) { listeners.forEach(function (f) { f(ev, session); }); }

  var client = {
    from: function (t) { return new Q(t); },
    rpc: function (name) {
      if (name === 'member_directory') return Promise.resolve({ data: member() ? db.profiles.filter(function (p) { return p.status === 'approved'; }).map(function (p) { return { id: p.id, nom_guerre: p.nom_guerre, first_name: p.first_name, last_name: p.last_name }; }) : null, error: null });
      if (name === 'storage_usage') return Promise.resolve({ data: admin() ? { bytes: 5242880, files: Object.keys(storage).length + 7 } : null, error: null });
      return Promise.resolve({ data: null, error: { message: 'unknown function' } });
    },
    storage: { from: bucket },
    functions: {
      invoke: function (name, opts) {
        log.push('invoke ' + name);
        if (name !== 'translate' || !admin()) return Promise.resolve({ data: null, error: { message: 'forbidden' } });
        var b = opts.body, out = {};
        window.__TRANSLATE_CALLS = (window.__TRANSLATE_CALLS || 0) + 1;
        b.targets.forEach(function (k) { out[k] = b.texts.map(function (x) { return x ? '[' + k + '] ' + x : ''; }); });
        return Promise.resolve({ data: { translations: out }, error: null });
      }
    },
    auth: {
      getSession: function () { return Promise.resolve({ data: { session: session }, error: null }); },
      onAuthStateChange: function (f) { listeners.push(f); return { data: { subscription: { unsubscribe: function () {} } } }; },
      signInWithPassword: function (c) {
        var u = USERS.filter(function (x) { return x.email === c.email && x.password === c.password; })[0];
        if (!u) return Promise.resolve({ data: {}, error: { message: 'Invalid login credentials' } });
        session = { user: { id: u.id, email: u.email } };
        setTimeout(function () { emit('SIGNED_IN'); }, 0);
        return Promise.resolve({ data: { session: session }, error: null });
      },
      signOut: function () { session = null; setTimeout(function () { emit('SIGNED_OUT'); }, 0); return Promise.resolve({ error: null }); },
      signUp: function (c) {
        window.__LAST_SIGNUP = c;
        var id = 'u-' + Date.now();
        USERS.push({ id: id, email: c.email, password: c.password });
        var d = c.options.data;
        db.profiles.push({ id: id, email: c.email, first_name: d.first_name, last_name: d.last_name, nom_guerre: d.nom_guerre, esquadra: d.esquadra, role: 'member', status: 'pending', created_at: new Date().toISOString() });
        return Promise.resolve({ data: { user: { id: id } }, error: null });
      },
      resetPasswordForEmail: function () { return Promise.resolve({ data: {}, error: null }); },
      updateUser: function () { return Promise.resolve({ data: {}, error: null }); }
    }
  };
  window.__DB = db;
  window.supabase = { createClient: function () { return client; } };
})();
