// Finto Supabase in memoria per la demo nel browser: risponde alle chiamate dell'app senza server.
(function () {
  var BASE = 'https://demo.supabase.co';
  var KEY = 'campo-demo-db-v5';
  try { history.replaceState(null, '', '/'); } catch (e) {}

  function pad(n) { return String(n).padStart(2, '0'); }
  function dk(d) { return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }
  function addDays(d, n) { var x = new Date(d); x.setDate(x.getDate() + n); return x; }
  function uid() { return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) { var r = Math.random() * 16 | 0; return (c === 'x' ? r : (r & 3 | 8)).toString(16); }); }
  var nowIso = function () { return new Date().toISOString(); };

  function seed() {
    var t = new Date(); t.setHours(0, 0, 0, 0);
    var db = {
      settings: [{
        id: 1, field_name: 'Centro Cinofilo Le Querce', field_address: 'Via dei Campi 12, Bologna', logo_path: null, license_code: '',
        open_min: 480, close_min: 1200, cancel_hours: 2, penalty_limit: 3, online_payments: false,
        rules: 'È richiesto il libretto vaccinale in regola.\nRaccogli sempre le deiezioni del cane.',
        privacy: "Informativa sul trattamento dei dati personali (testo di esempio da completare)\n\nTitolare del trattamento: [nome e cognome o ragione sociale], [indirizzo], [email di contatto].\n\nDati raccolti: nome, cognome, telefono, email, dati dei cani e prenotazioni.\n\nFinalità: gestire l'iscrizione, le prenotazioni del campo, i pagamenti e le comunicazioni di servizio.\n\nConservazione: i dati sono conservati per il tempo necessario a fornire il servizio e agli obblighi di legge.\n\nDiritti: puoi chiedere in ogni momento accesso, rettifica o cancellazione dei tuoi dati scrivendo a [email di contatto].",
        rules_ver: 1, privacy_ver: 1
      }],
      lesson_types: [
        { id: 'igp', label: 'IGP', description: 'Scegli la fase da allenare', duration_min: 60, price_cents: 2500, options: ['Pista', 'Obbedienza', 'Attacco'], sort: 1, active: true },
        { id: 'base', label: 'Educazione base', description: 'Primi comandi e gestione', duration_min: 30, price_cents: 1500, options: ['Cucciolo (meno di 1,5 anni)', 'Adulto (più di 1,5 anni)'], sort: 2, active: true }
      ],
      fields: [
        { id: 'f1', name: 'Campo A', address: 'Via dei Campi 12, Bologna', sort: 1, active: true },
        { id: 'f2', name: 'Campo B', address: 'Via dei Campi 12, Bologna', sort: 2, active: true }
      ],
      trainers: [
        { id: 't1', name: 'Luca', lessons: ['igp'], sort: 1, active: true },
        { id: 't2', name: 'Paola', lessons: [], sort: 2, active: true }
      ],
      packages: [
        { id: 'p1', name: '10 lezioni IGP', lesson_type: 'igp', lessons: 10, price_cents: 22000, valid_days: 180, sort: 1, active: true },
        { id: 'p2', name: '5 lezioni base', lesson_type: 'base', lessons: 5, price_cents: 6500, valid_days: 90, sort: 2, active: true }
      ],
      client_packages: [],
      profiles: [], dogs: [], availability: [], trainer_availability: [], trainer_accounts: [], dog_notes: [], bookings: [], penalties: [], passwords: {}
    };
    function person(id, first, last, phone, email, role, cf) {
      db.profiles.push({ id: id, first_name: first, last_name: last, phone: phone, email: email, role: role,
        tax_code: cf || '', billing_street: cf ? 'Via Saragozza 15' : '', billing_zip: cf ? '40123' : '', billing_city: cf ? 'Bologna' : '', billing_province: cf ? 'BO' : '', doc_pref: id === 'c3' ? 'receipt' : 'invoice', rules_ver: 1, privacy_ver: 1, rules_accepted_at: nowIso(), privacy_accepted_at: nowIso(), created_at: addDays(t, -40).toISOString() });
      db.passwords[email] = 'demo1234';
    }
    person('owner', 'Edo', 'Proprietario', '333 000 0000', 'proprietario@demo.it', 'owner');
    // Luca entra nell'app come trainer, collegato al trainer t1.
    person('tr1', 'Luca', 'Ferri', '347 900 1122', 'luca@demo.it', 'trainer');
    db.trainer_accounts.push({ trainer_id: 't1', email: 'luca@demo.it', user_id: 'tr1' });
    person('c1', 'Giulia', 'Rossi', '347 111 2233', 'cliente@demo.it', 'client', 'RSSGLI90C41A944Q');
    person('c2', 'Marco', 'Bianchi', '349 555 7788', 'marco@demo.it', 'client', 'BNCMRC85M12A944S');
    person('c3', 'Sara', 'Verdi', '338 222 4466', 'sara@demo.it', 'client', 'VRDSRA92E50A944C');
    function dog(id, owner, name, breed, birth) { db.dogs.push({ id: id, owner_id: owner, name: name, breed: breed, birth: birth, blocked: false, archived: false }); }
    dog('d1', 'c1', 'Argo', 'Pastore tedesco', '2022-04-10');
    dog('d2', 'c1', 'Luna', 'Malinois', '2025-06-02');
    dog('d3', 'c2', 'Kira', 'Pastore belga', '2021-09-15');
    dog('d4', 'c3', 'Rex', 'Rottweiler', '2023-01-20');
    // Altri iscritti, per vedere la lista clienti piena.
    var nomi = ['Alessandro', 'Chiara', 'Davide', 'Elena', 'Francesco', 'Giorgia', 'Luca', 'Martina', 'Nicola', 'Paola', 'Riccardo', 'Silvia', 'Tommaso', 'Valentina'];
    var cognomi = ['Bassi', 'Conti', 'De Luca', 'Esposito', 'Ferrari', 'Galli', 'Lombardi', 'Marchi', 'Neri', 'Orlandi', 'Pellegrini', 'Russo', 'Serra', 'Testa', 'Villa', 'Zanetti'];
    var cani = ['Fido', 'Birba', 'Thor', 'Maya', 'Zeus', 'Nala', 'Rocky', 'Lilli', 'Ares', 'Molly', 'Buck', 'Kim', 'Odino', 'Pepe', 'Sally'];
    var razze = ['Labrador', 'Border collie', 'Pastore tedesco', 'Meticcio', 'Malinois', 'Golden retriever', 'Jack Russell'];
    for (var k = 0; k < 42; k++) {
      var fn = nomi[(k * 5) % nomi.length], ln = cognomi[(k * 7 + 3) % cognomi.length], cid = 'x' + k;
      person(cid, fn, ln, '3' + String(40 + k % 9) + ' ' + String(100 + k * 17).slice(-3) + ' ' + String(1000 + k * 113).slice(-4), fn.toLowerCase() + '.' + ln.toLowerCase().replace(' ', '') + k + '@demo.it', 'client', k % 6 ? 'XXXXXX90A01A944' + 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.charAt(k % 26) : '');
      dog('dx' + k, cid, cani[k % cani.length], razze[k % razze.length], (2016 + k % 9) + '-0' + (1 + k % 9) + '-15');
      if (k % 9 === 4) dog('dy' + k, cid, cani[(k + 7) % cani.length], razze[(k + 3) % razze.length], '2024-03-10');
    }
    for (var i = -7; i < 28; i++) {
      var d = addDays(t, i);
      if (d.getDay() === 0) continue;
      var slots = [];
      for (var m = 540; m < 720; m += 30) slots.push(m);
      if (d.getDay() !== 6) for (var m2 = 900; m2 < 1140; m2 += 30) slots.push(m2);
      db.availability.push({ field_id: 'f1', day: dk(d), slots: slots });
      db.availability.push({ field_id: 'f2', day: dk(d), slots: slots.filter(function (x) { return x >= 600; }) });
    }
    function book(dayOffset, start, user, dogId, type, option, extra, field, trainer) {
      var day = addDays(t, dayOffset);
      if (day.getDay() === 0) return;
      var lt = db.lesson_types.filter(function (x) { return x.id === type; })[0];
      var b = { id: uid(), user_id: user, dog_id: dogId, field_id: field || 'f1', trainer_id: trainer || null, lesson_type: type, lesson_option: option, day: dk(day), start_min: start, dur_min: lt.duration_min, price_cents: lt.price_cents, pay: 'onsite', paid: false, checked_in_at: null, note: '', status: 'active', cancelled_at: null, created_at: nowIso() };
      Object.assign(b, extra || {});
      db.bookings.push(b);
      return b;
    }
    book(0, 540, 'c2', 'd3', 'igp', 'Pista', { checked_in_at: new Date(t.getTime() + 538 * 60000).toISOString(), paid: true }, 'f1', 't1');
    book(0, 600, 'c1', 'd1', 'igp', 'Obbedienza', null, 'f1', 't1');
    book(0, 600, 'c3', 'd4', 'base', 'Adulto (più di 1,5 anni)', null, 'f2', 't2');
    book(0, 960, 'c1', 'd2', 'base', 'Cucciolo (meno di 1,5 anni)');
    book(0, 1020, 'c2', 'd3', 'igp', 'Attacco');
    book(1, 570, 'c3', 'd4', 'igp', 'Pista', null, 'f1', 't1');
    book(1, 600, 'c2', 'd3', 'base', 'Adulto (più di 1,5 anni)', null, 'f2');
    book(1, 900, 'c1', 'd1', 'igp', 'Attacco');
    book(2, 600, 'c2', 'd3', 'igp', 'Obbedienza');
    book(2, 1080, 'c1', 'd2', 'base', 'Cucciolo (meno di 1,5 anni)');
    book(3, 540, 'c3', 'd4', 'base', 'Adulto (più di 1,5 anni)');
    book(3, 630, 'c2', 'd3', 'igp', 'Pista');
    db.client_packages.push({ id: 'cp1', user_id: 'c1', package_id: 'p2', name: '5 lezioni base', lesson_type: 'base', lessons_total: 5, lessons_used: 2, price_cents: 6500, status: 'active', requested_at: addDays(t, -20).toISOString(), activated_at: addDays(t, -20).toISOString(), expires_at: addDays(t, 70).toISOString() });
    db.client_packages.push({ id: 'cp2', user_id: 'c2', package_id: 'p1', name: '10 lezioni IGP', lesson_type: 'igp', lessons_total: 10, lessons_used: 0, price_cents: 22000, status: 'requested', requested_at: addDays(t, -1).toISOString(), activated_at: null, expires_at: null });
    // Due mesi di storico, per vedere qualcosa negli incassi e nelle statistiche.
    var seedN = 7;
    function rnd() { seedN = (seedN * 16807) % 2147483647; return seedN / 2147483647; }
    var who = [['c1', 'd1'], ['c1', 'd2'], ['c2', 'd3'], ['c3', 'd4']];
    var times = [540, 630, 900, 1020];
    for (var h = -75; h <= -2; h++) {
      var n = 1 + Math.floor(rnd() * 4);
      for (var j = 0; j < n; j++) {
        var w = who[Math.floor(rnd() * who.length)], igp = rnd() < 0.55;
        var opts = igp ? ['Pista', 'Obbedienza', 'Attacco'] : ['Cucciolo (meno di 1,5 anni)', 'Adulto (più di 1,5 anni)'];
        var x = rnd(), at = new Date(addDays(t, h).getTime() + (times[j] - 3) * 60000).toISOString();
        var ex = x < 0.08 ? { status: 'cancelled', cancelled_at: at } : x < 0.14 ? { paid: false } : { paid: true, checked_in_at: at };
        book(h, times[j], w[0], w[1], igp ? 'igp' : 'base', opts[Math.floor(rnd() * opts.length)], ex, j % 2 ? 'f2' : 'f1', igp ? 't1' : (rnd() < 0.5 ? 't2' : null));
      }
    }
    db.client_packages.push({ id: 'cp0', user_id: 'c3', package_id: 'p1', name: '10 lezioni IGP', lesson_type: 'igp', lessons_total: 10, lessons_used: 10, price_cents: 22000, status: 'active', requested_at: addDays(t, -66).toISOString(), activated_at: addDays(t, -65).toISOString(), expires_at: addDays(t, 115).toISOString() });
    // Diario: i trainer hanno scritto qualcosa dopo molte delle lezioni passate.
    var lavori = {
      Pista: ['Pista di 300 passi con due angoli, oggetti finali trovati', 'Pista invecchiata 30 minuti su prato', 'Pista su terreno misto, un oggetto mancato'],
      Obbedienza: ['Condotta e seduta in movimento, riporto su piano', 'Terra a distanza e richiamo con fermo', 'Riporto in salto, presa ancora incerta'],
      Attacco: ['Lavoro sulla manica: presa piena e lascia al comando', 'Ricerca nei nascondigli, abbaio fermo', 'Difesa del conduttore, buon controllo'],
      base: ['Richiamo con distrazioni e guinzaglio lungo', 'Seduto e terra con il cibo, poi senza', 'Passeggiata al guinzaglio senza tirare', 'Resta: 30 secondi a 5 metri', 'Socializzazione con altri due cani']
    };
    var commenti = ['Molto concentrato, bravo!', 'Si distrae dopo 20 minuti: meglio sessioni brevi.', 'Grande progresso rispetto alla volta scorsa.', 'A casa ripetete il richiamo 5 minuti al giorno.', 'Un po\' agitato all\'inizio, poi ottimo.', ''];
    db.bookings.forEach(function (b, i) {
      if (!b.checked_in_at || !b.trainer_id || b.day >= dk(t) || i % 10 > 6) return;
      var tr = db.trainers.filter(function (x) { return x.id === b.trainer_id; })[0];
      var lt0 = db.lesson_types.filter(function (x) { return x.id === b.lesson_type; })[0];
      db.dog_notes.push({ id: uid(), dog_id: b.dog_id, booking_id: b.id, trainer_id: b.trainer_id, author_name: tr.name, day: b.day,
        lesson: lt0.label + (b.lesson_option ? ' · ' + b.lesson_option : ''), work: (lavori[b.lesson_type] || lavori[b.lesson_option])[i % (b.lesson_type === 'base' ? 5 : 3)], comment: commenti[i % commenti.length],
        created_at: b.checked_in_at, updated_at: b.checked_in_at });
    });
    var late = book(-1, 600, 'c3', 'd4', 'igp', 'Obbedienza');
    if (late) db.penalties.push({ id: uid(), dog_id: 'd4', booking_id: late.id, reason: 'Ritardo', created_at: addDays(t, -1).toISOString() });
    addInvoices(db, t);
    return db;
  }

  // Esempi di fatture: nella demo il pagamento online è spento, quindi non ne nascono di nuove.
  function addInvoices(db, t) {
    db.invoice_settings = [{ id: 1, tax_regime: 'RF01', vat_rate: 22, auto_invoice: true, receipt_mode: 'manual', printer_url: '' }];
    function inv(user, name, num, desc, cents, daysAgo, status, error, kind) {
      var d = addDays(t, -daysAgo);
      return { id: uid(), kind: kind || 'invoice', receipt_number: null, year: d.getFullYear(), number: num, issued_on: dk(d), user_id: user, booking_id: null, buyer_name: name,
        description: desc, total_cents: cents, status: status, error: error || null, sent_at: status === 'sent' ? d.toISOString() : null, created_at: d.toISOString() };
    }
    db.invoices = [
      inv('c3', 'Sara Verdi', null, 'Lezione IGP · Obbedienza · ' + dk(addDays(t, 1)).split('-').reverse().join('/'), 2500, 0, 'pending', null, 'receipt'),
      inv('c2', 'Marco Bianchi', null, 'Lezione IGP · Attacco · ' + dk(addDays(t, 2)).split('-').reverse().join('/'), 2500, 0, 'error', 'Fatture in Cloud 401: token non valido o scaduto'),
      inv('c1', 'Giulia Rossi', 15, 'Lezione Educazione base · Adulto · ' + dk(addDays(t, -3)).split('-').reverse().join('/'), 1500, 4, 'sent'),
      inv('c1', 'Giulia Rossi', 14, 'Lezione Educazione base · Adulto · ' + dk(addDays(t, -10)).split('-').reverse().join('/'), 1500, 11, 'sent')
    ];
  }

  var db;
  try { db = JSON.parse(localStorage.getItem(KEY)); } catch (e) {}
  if (!db) db = seed();
  if (!db.trainer_availability) db.trainer_availability = [];
  if (db.invoices && !db.invoices.some(function (x) { return x.kind; })) delete db.invoices;
  if (!db.invoices) { var t0 = new Date(); t0.setHours(0, 0, 0, 0); addInvoices(db, t0); }
  function save() { try { localStorage.setItem(KEY, JSON.stringify(db)); } catch (e) {} }
  window.__demoReset = function () { try { localStorage.removeItem(KEY); } catch (e) {} };

  // ---- autenticazione ----
  function userObj(p) { return { id: p.id, aud: 'authenticated', role: 'authenticated', email: p.email, app_metadata: { provider: 'email' }, user_metadata: {}, created_at: p.created_at, email_confirmed_at: p.created_at }; }
  function sessionFor(p) { return { access_token: 'demo.' + p.id, token_type: 'bearer', expires_in: 31536000, expires_at: Math.floor(Date.now() / 1000) + 31536000, refresh_token: 'demo-refresh-' + p.id, user: userObj(p) }; }
  window.__demoSession = function (email) { var p = db.profiles.filter(function (x) { return x.email === email; })[0]; return p ? sessionFor(p) : null; };
  function currentId(headers) {
    var a = headers.get('authorization') || '';
    var m = /Bearer demo\.(.+)$/.exec(a);
    return m ? m[1] : null;
  }
  function me(headers) { var id = currentId(headers); return db.profiles.filter(function (p) { return p.id === id; })[0] || null; }

  // ---- relazioni per i select annidati ----
  var REL = {
    bookings: { fields: ['one', 'fields', 'field_id', 'id'], trainers: ['one', 'trainers', 'trainer_id', 'id'], profiles: ['one', 'profiles', 'user_id', 'id'], dogs: ['one', 'dogs', 'dog_id', 'id'], lesson_types: ['one', 'lesson_types', 'lesson_type', 'id'], penalties: ['many', 'penalties', 'id', 'booking_id'], dog_notes: ['one', 'dog_notes', 'id', 'booking_id'] },
    profiles: { dogs: ['many', 'dogs', 'id', 'owner_id'], client_packages: ['many', 'client_packages', 'id', 'user_id'] },
    dogs: { penalties: ['many', 'penalties', 'id', 'dog_id'], profiles: ['one', 'profiles', 'owner_id', 'id'] }
  };
  function splitTop(s) {
    var out = [], depth = 0, cur = '';
    for (var i = 0; i < s.length; i++) {
      var ch = s[i];
      if (ch === '(') depth++;
      if (ch === ')') depth--;
      if (ch === ',' && depth === 0) { out.push(cur); cur = ''; } else cur += ch;
    }
    if (cur) out.push(cur);
    return out.map(function (x) { return x.trim(); });
  }
  function shape(table, rows, select) {
    var embeds = splitTop(select || '*').filter(function (x) { return x.indexOf('(') > 0; });
    return rows.map(function (r) {
      var o = Object.assign({}, r);
      embeds.forEach(function (e) {
        var name = e.slice(0, e.indexOf('(')), inner = e.slice(e.indexOf('(') + 1, -1);
        var rel = (REL[table] || {})[name];
        if (!rel) return;
        var target = db[rel[1]].filter(function (x) { return x[rel[3]] === r[rel[2]]; });
        var shaped = shape(rel[1], target, inner);
        o[name] = rel[0] === 'one' ? (shaped[0] || null) : shaped;
      });
      return o;
    });
  }
  function parseVal(v) { if (v === 'true') return true; if (v === 'false') return false; if (v === 'null') return null; return v; }
  function cmp(a, b) { if (typeof a === 'number') b = Number(b); return a < b ? -1 : a > b ? 1 : 0; }
  function applyFilters(rows, params) {
    params.forEach(function (val, key) {
      if (['select', 'order', 'on_conflict', 'columns', 'limit', 'offset'].indexOf(key) >= 0) return;
      var dot = val.indexOf('.'), op = val.slice(0, dot), arg = val.slice(dot + 1);
      rows = rows.filter(function (r) {
        var x = r[key];
        if (op === 'eq') return String(x) === String(parseVal(arg)) || x === parseVal(arg);
        if (op === 'neq') return String(x) !== String(arg);
        if (op === 'gte') return cmp(x, arg) >= 0;
        if (op === 'lte') return cmp(x, arg) <= 0;
        if (op === 'gt') return cmp(x, arg) > 0;
        if (op === 'lt') return cmp(x, arg) < 0;
        if (op === 'is') return x === parseVal(arg);
        if (op === 'in') { var list = arg.replace(/^\(|\)$/g, '').split(',').map(function (s) { return s.replace(/^"|"$/g, ''); }); return list.indexOf(String(x)) >= 0; }
        return true;
      });
    });
    var order = params.get('order');
    if (order) {
      var keys = order.split(',').map(function (o) { var p = o.split('.'); return [p[0], p[1] === 'desc' ? -1 : 1]; });
      rows = rows.slice().sort(function (a, b) {
        for (var i = 0; i < keys.length; i++) { var c = cmp(a[keys[i][0]], b[keys[i][0]]) * keys[i][1]; if (c) return c; }
        return 0;
      });
    }
    return rows;
  }
  // Regole di accesso semplificate, come nel database vero.
  function trainerOf(who) {
    var acc = who && db.trainer_accounts.filter(function (x) { return x.user_id === who.id; })[0];
    return acc ? acc.trainer_id : null;
  }
  function visible(table, rows, who) {
    if (who && who.role === 'owner') return rows;
    if (who && who.role === 'trainer') {
      // Il trainer vede le sue lezioni e i clienti e i cani che ha avuto a lezione.
      var tid = trainerOf(who);
      var mine = db.bookings.filter(function (b) { return tid && b.trainer_id === tid; });
      var users = mine.map(function (b) { return b.user_id; }), seen = mine.map(function (b) { return b.dog_id; });
      if (table === 'bookings') return rows.filter(function (r) { return tid && r.trainer_id === tid; });
      if (table === 'profiles') return rows.filter(function (r) { return r.id === who.id || users.indexOf(r.id) >= 0; });
      if (table === 'dogs') return rows.filter(function (r) { return seen.indexOf(r.id) >= 0; });
      if (table === 'dog_notes') return rows.filter(function (r) { return seen.indexOf(r.dog_id) >= 0; });
      if (table === 'trainer_accounts') return rows.filter(function (r) { return r.user_id === who.id; });
      if (['penalties', 'client_packages', 'invoices', 'invoice_settings'].indexOf(table) >= 0) return [];
      return rows;
    }
    var id = who && who.id;
    var myDogs = db.dogs.filter(function (d) { return d.owner_id === id; }).map(function (d) { return d.id; });
    if (table === 'profiles') return rows.filter(function (r) { return r.id === id; });
    if (table === 'dogs') return rows.filter(function (r) { return r.owner_id === id; });
    if (table === 'bookings') return rows.filter(function (r) { return r.user_id === id; });
    if (table === 'penalties') return rows.filter(function (r) { return myDogs.indexOf(r.dog_id) >= 0; });
    if (table === 'client_packages' || table === 'invoices') return rows.filter(function (r) { return r.user_id === id; });
    if (table === 'dog_notes') return rows.filter(function (r) { return myDogs.indexOf(r.dog_id) >= 0; });
    if (table === 'invoice_settings' || table === 'trainer_accounts') return [];
    return rows;
  }
  var PK = { availability: ['field_id', 'day'], trainer_availability: ['trainer_id', 'day'] };
  function pk(table) { return PK[table] || ['id']; }
  function sameKey(table, a, b) { return pk(table).every(function (k) { return a[k] === b[k]; }); }

  function json(status, body, extra) {
    return new Response(body === undefined ? null : JSON.stringify(body), { status: status, headers: Object.assign({ 'content-type': 'application/json' }, extra || {}) });
  }
  function fail(msg, status) { return json(status || 400, { message: msg, code: 'P0001', details: null, hint: null }); }

  function afterInsert(table, row) {
    if (table === 'penalties') {
      var s = db.settings[0];
      var n = db.penalties.filter(function (p) { return p.dog_id === row.dog_id; }).length;
      if (s.penalty_limit > 0 && n >= s.penalty_limit) db.dogs.forEach(function (d) { if (d.id === row.dog_id) d.blocked = true; });
    }
  }
  function defaults(table, row, who) {
    var base = { dogs: { blocked: false, archived: false, breed: '', birth: null }, penalties: { created_at: nowIso() }, bookings: { created_at: nowIso() },
      fields: { address: '', sort: 0, active: true }, packages: { lesson_type: null, valid_days: null, sort: 0, active: true }, trainers: { lessons: [], sort: 0, active: true } }[table] || {};
    var r = Object.assign({}, base, row);
    if (pk(table)[0] === 'id' && r.id === undefined) r.id = uid();
    return r;
  }

  function rest(method, table, params, headers, body) {
    var who = me(headers);
    var rows = db[table];
    if (!rows) return fail('Tabella sconosciuta', 404);
    var single = (headers.get('accept') || '').indexOf('vnd.pgrst.object') >= 0;
    var prefer = headers.get('prefer') || '';
    var out;
    if (method === 'GET' || method === 'HEAD') {
      out = applyFilters(visible(table, rows, who), params);
    } else if (method === 'PATCH') {
      if (table !== 'profiles' && table !== 'dogs' && (!who || who.role !== 'owner')) return fail('Permesso negato', 403);
      out = applyFilters(visible(table, rows, who), params);
      if (table === 'bookings' && body.trainer_id) {
        var tr = db.trainers.filter(function (x) { return x.id === body.trainer_id; })[0];
        for (var i = 0; i < out.length; i++) {
          var bk = out[i];
          if (tr.lessons.length && tr.lessons.indexOf(bk.lesson_type) < 0) return fail(tr.name + ' non segue questo tipo di lezione');
          var clash = db.bookings.some(function (o) { return o.id !== bk.id && o.status === 'active' && o.trainer_id === tr.id && o.day === bk.day && o.start_min < bk.start_min + bk.dur_min && bk.start_min < o.start_min + o.dur_min; });
          if (clash) return fail(tr.name + ' ha già una lezione in questo orario');
        }
      }
      out.forEach(function (r) {
        var old = Object.assign({}, r);
        Object.assign(r, body);
        if (table === 'settings') {
          if (r.rules !== old.rules) r.rules_ver = old.rules_ver + 1;
          if (r.privacy !== old.privacy) r.privacy_ver = old.privacy_ver + 1;
        }
        if (table === 'dogs' && who.role !== 'owner') r.blocked = old.blocked;
        if (table === 'client_packages' && r.status === 'active' && old.status !== 'active') {
          var pk = db.packages.filter(function (x) { return x.id === r.package_id; })[0];
          r.activated_at = nowIso();
          r.expires_at = pk && pk.valid_days ? new Date(Date.now() + pk.valid_days * 86400000).toISOString() : null;
          // Come nel database vero: all'incasso del pacchetto parte fattura o scontrino.
          var buyer = db.profiles.filter(function (x) { return x.id === r.user_id; })[0];
          if (r.price_cents > 0 && buyer && !db.invoices.some(function (x) { return x.package_id === r.id; })) {
            db.invoices.unshift({ id: uid(), kind: buyer.doc_pref === 'receipt' ? 'receipt' : 'invoice', receipt_number: null, year: new Date().getFullYear(), number: null, issued_on: dk(new Date()), user_id: r.user_id, booking_id: null, package_id: r.id,
              buyer_name: (buyer.first_name + ' ' + buyer.last_name).trim(), description: 'Pacchetto ' + r.name + ' · ' + r.lessons_total + ' lezioni', total_cents: r.price_cents, status: 'pending', error: null, sent_at: null, created_at: nowIso() });
          }
        }
        if (table === 'bookings' && old.status === 'active' && r.status === 'cancelled') refund(r);
        if (table === 'profiles' && who.role !== 'owner') r.role = old.role;
      });
    } else if (method === 'POST') {
      var list = Array.isArray(body) ? body : [body];
      var ownHours = table === 'trainer_availability' && who && who.role === 'trainer' && list.every(function (x) { return x.trainer_id === trainerOf(who); });
      if (table !== 'dogs' && !ownHours && (!who || who.role !== 'owner')) return fail('Permesso negato', 403);
      out = list.map(function (b) {
        var r = defaults(table, b, who);
        var existing = prefer.indexOf('merge-duplicates') >= 0 && rows.filter(function (x) { return sameKey(table, x, r); })[0];
        if (existing) { Object.assign(existing, b); return existing; }
        rows.push(r);
        afterInsert(table, r);
        return r;
      });
    } else if (method === 'DELETE') {
      if (!who || who.role !== 'owner') return fail('Permesso negato', 403);
      out = applyFilters(rows, params);
      db[table] = rows.filter(function (r) { return out.indexOf(r) < 0; });
    }
    save();
    if (method !== 'GET' && prefer.indexOf('return=representation') < 0) return new Response(null, { status: 204 });
    var shaped = shape(table, out, params.get('select'));
    if (single) return shaped.length === 1 ? json(200, shaped[0]) : json(406, { code: 'PGRST116', message: 'JSON object requested, multiple (or no) rows returned' });
    return json(200, shaped);
  }

  function refund(b) {
    if (!b.package_id) return;
    db.client_packages.forEach(function (cp) { if (cp.id === b.package_id) cp.lessons_used = Math.max(cp.lessons_used - 1, 0); });
  }
  function slotDate(day, min) { var p = day.split('-').map(Number); return new Date(p[0], p[1] - 1, p[2], 0, min); }

  function rpc(name, headers, a) {
    if (name === 'client_count') return json(200, db.profiles.filter(function (p) { return p.role === 'client'; }).length);
    var who = me(headers);
    if (!who) return fail('Accesso richiesto', 401);
    var s = db.settings[0];
    if (name === 'link_trainer') {
      if (who.role !== 'owner') return fail('Solo il proprietario');
      var e = (a.p_email || '').trim().toLowerCase();
      var old = db.trainer_accounts.filter(function (x) { return x.trainer_id === a.p_trainer; })[0];
      if (old && old.user_id) db.profiles.forEach(function (p) { if (p.id === old.user_id && p.role === 'trainer') p.role = 'client'; });
      db.trainer_accounts = db.trainer_accounts.filter(function (x) { return x.trainer_id !== a.p_trainer; });
      if (e) {
        if (db.trainer_accounts.some(function (x) { return x.email === e; })) return fail('Questa email è già collegata a un altro trainer');
        var pr = db.profiles.filter(function (p) { return p.email === e; })[0];
        if (pr && pr.role === 'owner') return fail("Questa è l'email del proprietario");
        if (pr) pr.role = 'trainer';
        db.trainer_accounts.push({ trainer_id: a.p_trainer, email: e, user_id: pr ? pr.id : null });
      }
      save();
      return new Response(null, { status: 204 });
    }
    if (name === 'trainer_check_in') {
      var cb = db.bookings.filter(function (b) { return b.id === a.p_booking && b.status === 'active'; })[0];
      if (!cb) return fail('Lezione non trovata');
      if (who.role !== 'owner') {
        if (!cb.trainer_id || cb.trainer_id !== trainerOf(who)) return fail('Non è una tua lezione');
        if (cb.day !== dk(new Date())) return fail('Il cane si fa entrare il giorno della lezione');
      }
      var cd = db.dogs.filter(function (d) { return d.id === cb.dog_id; })[0];
      if (a.p_in !== false && cd && cd.blocked) return fail(cd.name + ' è sospeso: non può entrare in campo');
      cb.checked_in_at = a.p_in === false ? null : (cb.checked_in_at || nowIso());
      save();
      return json(200, cb);
    }
    if (name === 'save_dog_note') {
      var nb = db.bookings.filter(function (b) { return b.id === a.p_booking && b.status === 'active'; })[0];
      if (!nb) return fail('Lezione non trovata');
      if (who.role !== 'owner' && (!nb.trainer_id || nb.trainer_id !== trainerOf(who))) return fail('Non è una tua lezione');
      var work = (a.p_work || '').trim(), comment = (a.p_comment || '').trim();
      if (!work && !comment) return fail('Scrivi cosa avete fatto o un commento');
      var ntr = db.trainers.filter(function (x) { return x.id === nb.trainer_id; })[0];
      var nlt = db.lesson_types.filter(function (x) { return x.id === nb.lesson_type; })[0];
      var author = who.role === 'owner' ? ((who.first_name + ' ' + who.last_name).trim() || 'Il campo') : (ntr ? ntr.name : '');
      var note = db.dog_notes.filter(function (x) { return x.booking_id === nb.id; })[0];
      if (note) { note.work = work; note.comment = comment; note.author_name = author; note.updated_at = nowIso(); }
      else {
        note = { id: uid(), dog_id: nb.dog_id, booking_id: nb.id, trainer_id: nb.trainer_id, author_name: author, day: nb.day,
          lesson: (nlt ? nlt.label : nb.lesson_type) + (nb.lesson_option ? ' · ' + nb.lesson_option : ''), work: work, comment: comment, created_at: nowIso(), updated_at: nowIso() };
        db.dog_notes.push(note);
      }
      save();
      return json(200, note);
    }
    if (name === 'busy_slots') {
      return json(200, db.bookings.filter(function (b) { return b.status === 'active' && b.day >= a.from_day && b.day <= a.to_day; })
        .map(function (b) { return { field_id: b.field_id, day: b.day, start_min: b.start_min, dur_min: b.dur_min, mine: b.user_id === who.id }; }));
    }
    if (name === 'accept_terms') {
      who.rules_ver = s.rules_ver; who.privacy_ver = s.privacy_ver; who.rules_accepted_at = who.privacy_accepted_at = nowIso();
      save();
      return new Response(null, { status: 204 });
    }
    if (name === 'cancel_booking') {
      var bk = db.bookings.filter(function (b) { return b.id === a.p_id && b.user_id === who.id; })[0];
      if (!bk) return fail('Prenotazione non trovata');
      if (slotDate(bk.day, bk.start_min) - Date.now() < s.cancel_hours * 3600000) return fail('Troppo tardi per disdire online: chiama il campo.');
      bk.status = 'cancelled'; bk.cancelled_at = nowIso(); refund(bk);
      save();
      return new Response(null, { status: 204 });
    }
    if (name === 'delete_my_account') {
      if (who.role === 'owner') return fail('L\'account del proprietario non si può cancellare dall\'app');
      var mine = function (r) { return r.user_id === who.id; };
      db.bookings = db.bookings.filter(function (b) { return !mine(b); });
      var dogIds = db.dogs.filter(function (d) { return d.owner_id === who.id; }).map(function (d) { return d.id; });
      db.penalties = db.penalties.filter(function (x) { return dogIds.indexOf(x.dog_id) < 0; });
      db.client_packages = db.client_packages.filter(function (x) { return !mine(x); });
      db.dogs = db.dogs.filter(function (d) { return d.owner_id !== who.id; });
      db.profiles = db.profiles.filter(function (x) { return x.id !== who.id; });
      delete db.passwords[who.email];
      save();
      return new Response(null, { status: 204 });
    }
    if (name === 'mark_receipt_done') {
      if (who.role !== 'owner') return fail('Solo il proprietario');
      db.invoices.forEach(function (x) { if (x.id === a.p_id && x.kind === 'receipt' && x.status !== 'sent') { x.status = 'sent'; x.sent_at = nowIso(); x.receipt_number = (a.p_number || '').trim() || null; } });
      save();
      return new Response(null, { status: 204 });
    }
    if (name === 'retry_invoice') {
      if (who.role !== 'owner') return fail('Solo il proprietario');
      db.invoices.forEach(function (x) { if (x.id === a.p_id && x.status === 'error') { x.status = 'pending'; x.error = null; } });
      save();
      return new Response(null, { status: 204 });
    }
    if (name === 'request_package') {
      var pkg = db.packages.filter(function (x) { return x.id === a.p_package && x.active; })[0];
      if (!pkg) return fail('Pacchetto non disponibile');
      if (db.client_packages.some(function (x) { return x.user_id === who.id && x.package_id === pkg.id && x.status === 'requested'; })) return fail('Hai già richiesto questo pacchetto: il campo lo attiva quando paghi');
      var ncp = { id: uid(), user_id: who.id, package_id: pkg.id, name: pkg.name, lesson_type: pkg.lesson_type, lessons_total: pkg.lessons, lessons_used: 0, price_cents: pkg.price_cents, status: 'requested', requested_at: nowIso(), activated_at: null, expires_at: null };
      db.client_packages.push(ncp);
      save();
      return json(200, ncp);
    }
    if (name === 'book_slot') {
      if (who.rules_ver !== s.rules_ver || who.privacy_ver !== s.privacy_ver) return fail('Devi accettare il regolamento aggiornato.');
      if (!who.tax_code || !who.billing_street || !who.billing_zip || !who.billing_city) return fail('Completa codice fiscale e indirizzo di fatturazione nel Profilo');
      var fld = db.fields.filter(function (f) { return f.id === a.p_field && f.active; })[0];
      if (!fld) return fail('Campo non disponibile');
      var dog = db.dogs.filter(function (d) { return d.id === a.p_dog && d.owner_id === who.id; })[0];
      if (!dog) return fail('Cane non trovato.');
      if (dog.blocked) return fail('Le prenotazioni di questo cane sono sospese.');
      var lt = db.lesson_types.filter(function (t) { return t.id === a.p_type && t.active; })[0];
      if (!lt) return fail('Lezione non disponibile.');
      if (lt.options.length && lt.options.indexOf(a.p_option) < 0) return fail('Scegli un\'opzione valida.');
      if (a.p_pay === 'online' && !s.online_payments) return fail('Il pagamento online non è attivo.');
      if (slotDate(a.p_day, a.p_start) <= new Date()) return fail('Questo orario è già passato.');
      var av = db.availability.filter(function (x) { return x.field_id === a.p_field && x.day === a.p_day; })[0];
      for (var m = a.p_start; m < a.p_start + lt.duration_min; m += 30) if (!av || av.slots.indexOf(m) < 0) return fail('Il campo è chiuso in questo orario.');
      var clash = db.bookings.some(function (b) { return b.status === 'active' && b.field_id === a.p_field && b.day === a.p_day && a.p_start < b.start_min + b.dur_min && b.start_min < a.p_start + lt.duration_min; });
      if (clash) return fail('Orario appena preso da un altro cliente. Scegline un altro.');
      var nb = { id: uid(), user_id: who.id, dog_id: dog.id, field_id: fld.id, trainer_id: null, lesson_type: lt.id, lesson_option: a.p_option, day: a.p_day, start_min: a.p_start, dur_min: lt.duration_min, price_cents: lt.price_cents, pay: a.p_pay, paid: false, checked_in_at: null, note: '', status: 'active', cancelled_at: null, created_at: nowIso() };
      var cps = db.client_packages.filter(function (cp) {
        return cp.user_id === who.id && cp.status === 'active' && cp.lessons_used < cp.lessons_total && (!cp.lesson_type || cp.lesson_type === lt.id) && (!cp.expires_at || new Date(cp.expires_at) > new Date());
      }).sort(function (x, y) { return (x.expires_at || '9999').localeCompare(y.expires_at || '9999'); });
      if (cps[0]) { cps[0].lessons_used++; nb.package_id = cps[0].id; nb.pay = 'package'; nb.paid = true; nb.price_cents = 0; }
      db.bookings.push(nb);
      save();
      return json(200, nb);
    }
    if (name === 'owner_book') {
      if (who.role !== 'owner') return fail('Solo il proprietario può prenotare per un cliente');
      var fld2 = db.fields.filter(function (f) { return f.id === a.p_field && f.active; })[0];
      if (!fld2) return fail('Campo non disponibile');
      var dog2 = db.dogs.filter(function (d) { return d.id === a.p_dog && d.owner_id === a.p_user; })[0];
      if (!dog2) return fail('Cane non trovato per questo cliente');
      var lt2 = db.lesson_types.filter(function (t) { return t.id === a.p_type; })[0];
      if (!lt2) return fail('Tipo di lezione non valido');
      if (lt2.options.length && lt2.options.indexOf(a.p_option) < 0) return fail('Specialità non valida');
      var end2 = a.p_start + lt2.duration_min;
      if (db.bookings.some(function (b) { return b.status === 'active' && b.field_id === a.p_field && b.day === a.p_day && a.p_start < b.start_min + b.dur_min && b.start_min < end2; }))
        return fail('Il campo è già occupato a quell\'ora');
      if (a.p_trainer && db.bookings.some(function (b) { return b.status === 'active' && b.trainer_id === a.p_trainer && b.day === a.p_day && a.p_start < b.start_min + b.dur_min && b.start_min < end2; }))
        return fail('Il trainer ha già una lezione in questo orario');
      var nb2 = { id: uid(), user_id: a.p_user, dog_id: dog2.id, field_id: fld2.id, trainer_id: a.p_trainer || null, lesson_type: lt2.id, lesson_option: a.p_option || '', day: a.p_day, start_min: a.p_start, dur_min: lt2.duration_min, price_cents: lt2.price_cents, pay: 'onsite', paid: false, checked_in_at: null, note: '', status: 'active', cancelled_at: null, created_at: nowIso() };
      var cps2 = db.client_packages.filter(function (cp) {
        return cp.user_id === a.p_user && cp.status === 'active' && cp.lessons_used < cp.lessons_total && (!cp.lesson_type || cp.lesson_type === lt2.id) && (!cp.expires_at || new Date(cp.expires_at) > new Date());
      }).sort(function (x, y) { return (x.expires_at || '9999').localeCompare(y.expires_at || '9999'); });
      if (cps2[0]) { cps2[0].lessons_used++; nb2.package_id = cps2[0].id; nb2.pay = 'package'; nb2.paid = true; nb2.price_cents = 0; }
      db.bookings.push(nb2);
      save();
      return json(200, nb2);
    }
    return fail('Funzione sconosciuta', 404);
  }

  function auth(method, path, url, headers, body) {
    if (path === '/token') {
      var p = db.profiles.filter(function (x) { return x.email === (body.email || '').toLowerCase(); })[0];
      if (!p || db.passwords[p.email] !== body.password) return json(400, { error: 'invalid_grant', error_description: 'Invalid login credentials', msg: 'Invalid login credentials', code: 'invalid_credentials' });
      return json(200, sessionFor(p));
    }
    if (path === '/signup') {
      var email = (body.email || '').toLowerCase();
      if (db.passwords[email]) return json(422, { code: 'user_already_exists', msg: 'User already registered', message: 'User already registered' });
      if ((body.password || '').length < 8) return json(422, { code: 'weak_password', msg: 'Password should be at least 8 characters', message: 'Password should be at least 8 characters' });
      var d = body.data || {};
      var np = { id: uid(), first_name: d.first_name || '', last_name: d.last_name || '', phone: d.phone || '', email: email, role: 'client',
        tax_code: d.tax_code || '', billing_street: d.billing_street || '', billing_zip: d.billing_zip || '', billing_city: d.billing_city || '', billing_province: d.billing_province || '', rules_ver: d.rules_ver, privacy_ver: d.privacy_ver, rules_accepted_at: nowIso(), privacy_accepted_at: nowIso(), created_at: nowIso() };
      db.profiles.push(np);
      db.passwords[email] = body.password;
      // Come nel database vero: chi si iscrive con l'email di un trainer diventa trainer.
      db.trainer_accounts.forEach(function (x) { if (x.email === email && !x.user_id) { x.user_id = np.id; np.role = 'trainer'; } });
      (d.dogs || []).forEach(function (g) { db.dogs.push({ id: uid(), owner_id: np.id, name: g.name, breed: g.breed || '', birth: g.birth || null, blocked: false, archived: false }); });
      save();
      return json(200, sessionFor(np));
    }
    if (path === '/logout') return new Response(null, { status: 204 });
    if (path === '/recover') return json(200, {});
    if (path === '/verify') {
      var vp = db.profiles.filter(function (x) { return x.email === (body.email || '').toLowerCase(); })[0];
      if (!vp || body.token !== '123456') return json(403, { code: 'otp_expired', msg: 'Token has expired or is invalid', message: 'Token has expired or is invalid' });
      return json(200, sessionFor(vp));
    }
    if (path === '/user') {
      var u = me(headers);
      if (!u) return json(401, { msg: 'not logged in' });
      if (method === 'PUT' && body.password) { db.passwords[u.email] = body.password; save(); }
      return json(200, userObj(u));
    }
    return json(404, { msg: 'not found' });
  }

  var realFetch = window.fetch.bind(window);
  window.fetch = async function (input, init) {
    var url = typeof input === 'string' ? input : input.url;
    if (url.indexOf(BASE) !== 0) return realFetch(input, init);
    init = init || {};
    var u = new URL(url);
    var method = (init.method || (input.method) || 'GET').toUpperCase();
    var headers = new Headers(init.headers || (typeof input !== 'string' ? input.headers : undefined));
    var body = null;
    if (init.body && typeof init.body === 'string') { try { body = JSON.parse(init.body); } catch (e) { body = null; } }
    await new Promise(function (r) { setTimeout(r, 120); });
    var path = u.pathname;
    if (path.indexOf('/auth/v1') === 0) return auth(method, path.slice(8), u, headers, body || {});
    if (path.indexOf('/rest/v1/rpc/') === 0) return rpc(path.slice(13), headers, body || {});
    if (path.indexOf('/rest/v1/') === 0) return rest(method, path.slice(9), u.searchParams, headers, body);
    // Nella demo Fatture in Cloud non è collegato.
    if (path.indexOf('/functions/v1/') === 0) return json(500, { error: 'Manca il secret FIC_ACCESS_TOKEN' });
    if (path.indexOf('/storage/v1/') === 0) return storage(method, path.slice(12), init.body, body);
    return json(404, {});
  };

  // Logo: senza server il file resta nel browser, rimpicciolito, e le immagini che puntano
  // all'indirizzo pubblico finto vengono girate sulla copia salvata.
  var PUBLIC = BASE + '/storage/v1/object/public/branding/';
  function shrink(blob) {
    return new Promise(function (ok, ko) {
      var src = URL.createObjectURL(blob), img = new Image();
      img.onload = function () {
        var k = Math.min(1, 256 / Math.max(img.width, img.height));
        var c = document.createElement('canvas');
        c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
        c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
        URL.revokeObjectURL(src);
        ok(c.toDataURL('image/png'));
      };
      img.onerror = function () { URL.revokeObjectURL(src); ko(new Error('Immagine non leggibile')); };
      img.src = src;
    });
  }
  async function storage(method, path, raw, body) {
    db.files = db.files || {};
    if (path.indexOf('object/branding/') === 0 && (method === 'POST' || method === 'PUT')) {
      var name = decodeURIComponent(path.slice(16));
      var blob = raw;
      if (typeof FormData !== 'undefined' && raw instanceof FormData) raw.forEach(function (v) { if (v instanceof Blob) blob = v; });
      if (!(blob instanceof Blob)) blob = new Blob([raw]);
      try { db.files[name] = await shrink(blob); } catch (e) { return json(400, { statusCode: '400', error: 'invalid', message: e.message }); }
      save();
      fixImages(document);
      return json(200, { Key: 'branding/' + name, Id: name });
    }
    if (path === 'object/branding' && method === 'DELETE') {
      ((body && body.prefixes) || []).forEach(function (n) { delete db.files[n]; });
      save();
      return json(200, []);
    }
    return json(200, {});
  }
  function fixImg(el) {
    var s = el.getAttribute && el.getAttribute('src');
    if (s && s.indexOf(PUBLIC) === 0) {
      var f = db.files && db.files[decodeURIComponent(s.slice(PUBLIC.length).split('?')[0])];
      if (f) el.setAttribute('src', f);
    }
  }
  function fixImages(root) {
    if (root.tagName === 'IMG') fixImg(root);
    if (root.querySelectorAll) root.querySelectorAll('img').forEach(fixImg);
  }
  new MutationObserver(function (list) {
    list.forEach(function (m) {
      if (m.type === 'attributes') fixImg(m.target);
      else m.addedNodes.forEach(function (n) { if (n.nodeType === 1) fixImages(n); });
    });
  }).observe(document.documentElement, { subtree: true, childList: true, attributes: true, attributeFilter: ['src'] });
})();
