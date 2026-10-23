// Finto Supabase in memoria per la demo nel browser: risponde alle chiamate dell'app senza server.
(function () {
  var BASE = 'https://demo.supabase.co';
  var KEY = 'campo-demo-db-v10';
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
        { id: 'igp', label: 'IGP', description: 'Scegli la fase da allenare', duration_min: 60, price_cents: 2500, options: ['Pista', 'Obbedienza', 'Attacco'], sort: 1, active: true, group_seats: null },
        { id: 'base', label: 'Educazione base', description: 'Primi comandi e gestione', duration_min: 30, price_cents: 1500, options: ['Cucciolo (meno di 1,5 anni)', 'Adulto (più di 1,5 anni)'], sort: 2, active: true, group_seats: null },
        { id: 'gruppo', label: 'Socializzazione di gruppo', description: 'In campo con altri cani, guidati dal trainer', duration_min: 60, price_cents: 1200, options: [], sort: 3, active: true, group_seats: 6 }
      ],
      fields: [
        { id: 'f1', name: 'Campo A', address: 'Via dei Campi 12, Bologna', sort: 1, active: true },
        { id: 'f2', name: 'Campo B', address: 'Via dei Campi 12, Bologna', sort: 2, active: true }
      ],
      trainers: [
        { id: 't1', name: 'Luca', lessons: ['igp', 'gruppo'], sort: 1, active: true, photo_path: 'trainer-t1-demo.svg' },
        { id: 't2', name: 'Paola', lessons: [], sort: 2, active: true, photo_path: 'trainer-t2-demo.svg' }
      ],
      packages: [
        { id: 'p1', name: '10 lezioni IGP', lesson_type: 'igp', lessons: 10, price_cents: 22000, valid_days: 180, sort: 1, active: true },
        { id: 'p2', name: '5 lezioni base', lesson_type: 'base', lessons: 5, price_cents: 6500, valid_days: 90, sort: 2, active: true }
      ],
      client_packages: [],
      // Modelli di scheda preparati dal centro, che i trainer compilano sul cane.
      eval_forms: [
        { id: 'v1', name: 'Primo incontro', active: true, sort: 1, items: [
          { label: 'Come si presenta all\'arrivo', kind: 'choice', options: ['Tranquillo', 'Curioso', 'Agitato', 'Pauroso', 'Reattivo'] },
          { label: 'Approccio alle persone', kind: 'score' }, { label: 'Approccio agli altri cani', kind: 'score' },
          { label: 'Vaccinazioni in regola', kind: 'yesno' }, { label: 'Note sul primo incontro', kind: 'text' }] },
        { id: 'v2', name: 'Ipersensibilità al tatto', active: true, sort: 2, items: [
          { label: 'Testa e orecchie', kind: 'choice', options: ['Accetta', 'Tollera', 'Evita', 'Reagisce'] },
          { label: 'Zampe', kind: 'choice', options: ['Accetta', 'Tollera', 'Evita', 'Reagisce'] },
          { label: 'Coda e posteriore', kind: 'choice', options: ['Accetta', 'Tollera', 'Evita', 'Reagisce'] },
          { label: 'Pettorina e collare', kind: 'choice', options: ['Accetta', 'Tollera', 'Evita', 'Reagisce'] },
          { label: 'Si calma dopo il contatto', kind: 'yesno' }, { label: 'Note', kind: 'text' }] },
        { id: 'v3', name: 'Obiettivi del conduttore', active: true, sort: 3, items: [
          { label: 'Obiettivo principale', kind: 'choice', options: ['Educazione di base', 'Gestione in città', 'Sport (IGP, agility)', 'Problema di comportamento'] },
          { label: 'Cosa vorrebbe migliorare con il cane', kind: 'text' },
          { label: 'Tempo per allenarsi a casa', kind: 'choice', options: ['Meno di 1 ora a settimana', '1-3 ore a settimana', 'Più di 3 ore a settimana'] },
          { label: 'Motivazione del conduttore', kind: 'score' }] },
        { id: 'v4', name: 'Valutazione obbedienza', active: true, sort: 4, items: [
          { label: 'Richiamo', kind: 'score' }, { label: 'Condotta al guinzaglio', kind: 'score' }, { label: 'Concentrazione', kind: 'score' },
          { label: 'Pronto per la prova', kind: 'yesno' }, { label: 'Da fare a casa', kind: 'text' }] }
      ],
      profiles: [], dogs: [], availability: [], trainer_availability: [], trainer_accounts: [], dog_notes: [], bookings: [], classes: [], penalties: [], passwords: {},
      // Foto di esempio di trainer e clienti: sagome disegnate, si possono cambiare dall'app.
      files: { 'foto/trainer-t1-demo.svg': avatar('#cfe3d6', '#e8b994', '#3b2a20'), 'foto/trainer-t2-demo.svg': avatar('#f1dcc0', '#f0c7a4', '#8a4b2a') }
    };
    function avatar(bg, skin, hair) {
      return 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 120">' +
        '<rect width="120" height="120" fill="' + bg + '"/><path d="M16 120c4-30 22-42 44-42s40 12 44 42z" fill="' + hair + '" opacity=".8"/>' +
        '<circle cx="60" cy="52" r="25" fill="' + skin + '"/><path d="M34 50a26 26 0 0 1 52 0c-7-11-15-15-26-15s-19 4-26 15z" fill="' + hair + '"/></svg>');
    }
    // Sei sagome per i clienti, a giro; ognuno ha il suo file perché cambiando foto il vecchio si cancella.
    var looks = [['#d9e4f2', '#f0c7a4', '#5a3a22'], ['#f2e0d9', '#e8b994', '#1f1a17'], ['#e3efd9', '#c98f68', '#2b1d14'], ['#efe6cf', '#f3d2b3', '#b7742e'], ['#e6dcef', '#d9a37f', '#4a2f1e'], ['#dcefed', '#f0c7a4', '#8a8a8a']];
    function person(id, first, last, phone, email, role, cf) {
      var look = looks[db.profiles.length % looks.length], photo = role === 'client' ? 'cliente-' + id + '-demo.svg' : null;
      if (photo) db.files['foto/' + photo] = avatar(look[0], look[1], look[2]);
      db.profiles.push({ id: id, first_name: first, last_name: last, phone: phone, email: email, role: role, photo_path: photo,
        tax_code: cf || '', billing_street: cf ? 'Via Saragozza 15' : '', billing_zip: cf ? '40123' : '', billing_city: cf ? 'Bologna' : '', billing_province: cf ? 'BO' : '', doc_pref: id === 'c3' ? 'receipt' : 'invoice', social_consent: role === 'client' && id !== 'c2' && db.profiles.length % 3 !== 0, social_consent_at: null, rules_ver: 1, privacy_ver: 1, rules_accepted_at: nowIso(), privacy_accepted_at: nowIso(), created_at: addDays(t, -40).toISOString() });
      db.passwords[email] = 'demo1234';
      var me0 = db.profiles[db.profiles.length - 1];
      if (me0.social_consent) me0.social_consent_at = me0.created_at;
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
      var b = { id: uid(), user_id: user, dog_id: dogId, field_id: field || 'f1', trainer_id: trainer || null, lesson_type: type, lesson_option: option, day: dk(day), start_min: start, dur_min: lt.duration_min, price_cents: lt.price_cents, pay: 'onsite', paid: false, checked_in_at: null, note: '', status: 'active', cancelled_at: null, created_at: nowIso(), class_id: null };
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
        // Martedì, giovedì e sabato alle 11 il Campo B è della classe di gruppo.
        if (j % 2 && times[j] === 630 && [2, 4, 6].indexOf(addDays(t, h).getDay()) >= 0) continue;
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
    // Una lezione su due di obbedienza ha anche la scheda, con voti che crescono nel tempo.
    function valuta(b, i) {
      if (b.lesson_option !== 'Obbedienza' || i % 2) return null;
      var f = db.eval_forms[3];
      var v = Math.max(1, Math.min(5, 4 - Math.round((dk(t) > b.day ? (t - new Date(b.day)) / 864e5 : 0) / 30)));
      var vals = [v, Math.min(5, v + 1), v, v >= 4, i % 4 ? null : 'Richiamo con il fischietto, 5 minuti al giorno'];
      return { form_id: f.id, name: f.name, items: f.items.map(function (it, k) { return { label: it.label, kind: it.kind, value: vals[k] }; }) };
    }
    db.bookings.forEach(function (b, i) {
      if (!b.checked_in_at || !b.trainer_id || b.day >= dk(t) || i % 10 > 6) return;
      var tr = db.trainers.filter(function (x) { return x.id === b.trainer_id; })[0];
      var lt0 = db.lesson_types.filter(function (x) { return x.id === b.lesson_type; })[0];
      db.dog_notes.push({ id: uid(), dog_id: b.dog_id, booking_id: b.id, trainer_id: b.trainer_id, author_name: tr.name, day: b.day,
        lesson: lt0.label + (b.lesson_option ? ' · ' + b.lesson_option : ''), work: (lavori[b.lesson_type] || lavori[b.lesson_option])[i % (b.lesson_type === 'base' ? 5 : 3)], comment: commenti[i % commenti.length],
        evaluation: valuta(b, i), created_at: b.checked_in_at, updated_at: b.checked_in_at });
    });
    // Schede compilate da Luca sui cani che allena in IGP: primo incontro e obiettivi all'inizio, poi il tatto.
    var allievi = [];
    db.bookings.forEach(function (b) { if (b.lesson_type === 'igp' && b.trainer_id === 't1' && allievi.indexOf(b.dog_id) < 0) allievi.push(b.dog_id); });
    var schede = [
      [0, -75, 'Primo cane del cliente, buona collaborazione.', function (n) { return [['Curioso', 'Tranquillo', 'Agitato'][n % 3], 4 - n % 2, 3 + n % 2, true, 'Si ambienta in pochi minuti, tira al guinzaglio.']; }],
      [2, -74, '', function (n) { return [['Sport (IGP, agility)', 'Educazione di base', 'Gestione in città'][n % 3], 'Una condotta più attenta e un richiamo affidabile anche al parco.', ['1-3 ore a settimana', 'Più di 3 ore a settimana'][n % 2], 4 + n % 2]; }],
      [1, -30, 'Da ripetere tra un mese.', function (n) { return [n % 2 ? 'Tollera' : 'Accetta', ['Evita', 'Tollera', 'Reagisce'][n % 3], 'Tollera', 'Accetta', n % 3 !== 2, n % 3 === 2 ? 'Sulle zampe posteriori serve un lavoro lento con il cibo.' : null]; }]
    ];
    allievi.forEach(function (dogId, n) {
      schede.forEach(function (sc) {
        var f = db.eval_forms[sc[0]], at = addDays(t, sc[1] + n), vals = sc[3](n);
        db.dog_notes.push({ id: uid(), dog_id: dogId, booking_id: null, trainer_id: 't1', author_name: 'Luca', day: dk(at), lesson: '', work: '', comment: sc[2],
          evaluation: { form_id: f.id, name: f.name, items: f.items.map(function (it, k) { return { label: it.label, kind: it.kind, value: vals[k] === undefined ? null : vals[k] }; }) },
          created_at: at.toISOString(), updated_at: at.toISOString() });
      });
    });
    // Classi di gruppo martedì, giovedì e sabato alle 11 sul Campo B (il sabato con Luca): alcune piene, altre con posti liberi.
    var gruppo = [['c2', 'd3'], ['c3', 'd4'], ['x1', 'dx1'], ['x2', 'dx2'], ['x5', 'dx5'], ['x8', 'dx8'], ['c1', 'd2']];
    for (var g = -7; g < 28; g++) {
      var gd = addDays(t, g);
      if ([2, 4, 6].indexOf(gd.getDay()) < 0) continue;
      var cl = { id: uid(), lesson_type: 'gruppo', lesson_option: '', field_id: 'f2', trainer_id: gd.getDay() === 6 && g >= 0 ? 't1' : 't2', day: dk(gd), start_min: 660, dur_min: 60, seats: 6, status: 'active', created_at: nowIso() };
      db.classes.push(cl);
      var many = g % 3 === 0 ? 6 : 2 + ((g + 7) % 3);
      for (var q = 0; q < many; q++) {
        var w2 = gruppo[(q + g + 7) % 6];
        var at2 = new Date(gd.getTime() + 657 * 60000).toISOString();
        book(g, 660, w2[0], w2[1], 'gruppo', '', g < 0 ? { paid: true, checked_in_at: at2, class_id: cl.id } : { class_id: cl.id }, 'f2', cl.trainer_id);
      }
    }
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
  if (!db.classes) db.classes = [];
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
    dogs: { penalties: ['many', 'penalties', 'id', 'dog_id'], profiles: ['one', 'profiles', 'owner_id', 'id'] },
    classes: { fields: ['one', 'fields', 'field_id', 'id'], trainers: ['one', 'trainers', 'trainer_id', 'id'], lesson_types: ['one', 'lesson_types', 'lesson_type', 'id'] }
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
      if (table === 'penalties') return rows.filter(function (r) { return seen.indexOf(r.dog_id) >= 0; });
      if (['client_packages', 'invoices', 'invoice_settings'].indexOf(table) >= 0) return [];
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
      fields: { address: '', sort: 0, active: true }, eval_forms: { sort: 0, active: true }, packages: { lesson_type: null, valid_days: null, sort: 0, active: true }, trainers: { lessons: [], sort: 0, active: true } }[table] || {};
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
      if ((table === 'bookings' || table === 'classes') && body.trainer_id) {
        for (var i = 0; i < out.length; i++) {
          var why = trainerBusy(body.trainer_id, out[i], table === 'classes' ? out[i].id : out[i].class_id, table === 'bookings' ? out[i].id : null);
          if (why) return fail(why);
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
        // Come nel database vero: il trainer della classe vale per tutti i cani, e annullarla annulla le iscrizioni.
        if (table === 'classes') db.bookings.forEach(function (b) {
          if (b.class_id !== r.id || b.status !== 'active') return;
          if (r.status === 'cancelled') { b.status = 'cancelled'; b.cancelled_at = nowIso(); refund(b); } else b.trainer_id = r.trainer_id;
        });
        if (table === 'profiles' && who.role !== 'owner') r.role = old.role;
        if (table === 'profiles') r.social_consent_at = r.social_consent !== old.social_consent ? nowIso() : old.social_consent_at;
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
  // Come il messaggio del database con la data al posto di %, tradotto da errorText().
  var FIELD_TAKEN = 'Il campo è già occupato il {nome}';
  function overlaps(x, day, start, end) { return x.status === 'active' && x.day === day && x.start_min < end && start < x.start_min + x.dur_min; }
  // Il campo è occupato da una lezione o da una classe (tranne la classe indicata).
  function fieldBusy(field, day, start, end, skipClass) {
    return db.bookings.some(function (b) { return b.field_id === field && (!skipClass || b.class_id !== skipClass) && overlaps(b, day, start, end); }) ||
      db.classes.some(function (c) { return c.field_id === field && c.id !== skipClass && overlaps(c, day, start, end); });
  }
  // Perché il trainer non può fare quella lezione o classe, o null se può.
  function trainerBusy(trainerId, x, classId, bookingId) {
    var tr = db.trainers.filter(function (y) { return y.id === trainerId; })[0];
    if (!tr) return null;
    if (tr.lessons.length && tr.lessons.indexOf(x.lesson_type) < 0) return tr.name + ' non segue questo tipo di lezione';
    var end = x.start_min + x.dur_min;
    var clash = db.bookings.some(function (o) { return o.id !== bookingId && o.trainer_id === tr.id && (!classId || o.class_id !== classId) && overlaps(o, x.day, x.start_min, end); }) ||
      db.classes.some(function (c) { return c.id !== classId && c.trainer_id === tr.id && overlaps(c, x.day, x.start_min, end); });
    return clash ? tr.name + ' ha già una lezione in questo orario' : null;
  }
  function packageFor(user, type) {
    return db.client_packages.filter(function (cp) {
      return cp.user_id === user && cp.status === 'active' && cp.lessons_used < cp.lessons_total && (!cp.lesson_type || cp.lesson_type === type) && (!cp.expires_at || new Date(cp.expires_at) > new Date());
    }).sort(function (x, y) { return (x.expires_at || '9999').localeCompare(y.expires_at || '9999'); })[0];
  }

  // Come eval_filled() nel database vero: copia della scheda con i valori controllati, o il messaggio d'errore.
  function evalFilled(pe) {
    var ef = db.eval_forms.filter(function (x) { return x.id === pe.form_id; })[0];
    if (!ef) return 'Scheda di valutazione non trovata';
    var vs = pe.values || [], items = [];
    for (var k = 0; k < ef.items.length; k++) {
      var it = ef.items[k], v = vs[k] === undefined ? null : vs[k];
      if (it.kind === 'text' && typeof v === 'string') v = v.trim().slice(0, 2000) || null;
      if (v !== null && !((it.kind === 'score' && [1, 2, 3, 4, 5].indexOf(v) >= 0) || (it.kind === 'yesno' && typeof v === 'boolean') || (it.kind === 'text' && typeof v === 'string') || (it.kind === 'choice' && (it.options || []).indexOf(v) >= 0))) return 'Scheda di valutazione non valida';
      items.push({ label: it.label, kind: it.kind, value: v });
    }
    if (items.every(function (x) { return x.value === null; })) return 'Compila almeno una voce della scheda';
    return { form_id: ef.id, name: ef.name, items: items };
  }
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
      var note = db.dog_notes.filter(function (x) { return x.booking_id === nb.id; })[0];
      var ev = null, pe = a.p_eval;
      if (pe && pe.keep) ev = note ? note.evaluation || null : null;
      else if (pe) { ev = evalFilled(pe); if (typeof ev === 'string') return fail(ev); }
      if (!work && !comment && !ev) return fail('Scrivi cosa avete fatto o un commento');
      var ntr = db.trainers.filter(function (x) { return x.id === nb.trainer_id; })[0];
      var nlt = db.lesson_types.filter(function (x) { return x.id === nb.lesson_type; })[0];
      var author = who.role === 'owner' ? ((who.first_name + ' ' + who.last_name).trim() || 'Il campo') : (ntr ? ntr.name : '');
      if (note) { note.work = work; note.comment = comment; note.evaluation = ev; note.author_name = author; note.updated_at = nowIso(); }
      else {
        note = { id: uid(), dog_id: nb.dog_id, booking_id: nb.id, trainer_id: nb.trainer_id, author_name: author, day: nb.day,
          lesson: (nlt ? nlt.label : nb.lesson_type) + (nb.lesson_option ? ' · ' + nb.lesson_option : ''), work: work, comment: comment, evaluation: ev, created_at: nowIso(), updated_at: nowIso() };
        db.dog_notes.push(note);
      }
      save();
      return json(200, note);
    }
    if (name === 'add_dog_eval') {
      var edog = db.dogs.filter(function (d) { return d.id === a.p_dog; })[0];
      if (!edog) return fail('Cane non trovato');
      var etid = trainerOf(who);
      if (who.role !== 'owner' && !db.bookings.some(function (b) { return b.dog_id === edog.id && etid && b.trainer_id === etid; })) return fail('Non è un cane delle tue lezioni');
      if (!a.p_eval) return fail('Scegli una scheda di valutazione');
      var eev = evalFilled(a.p_eval);
      if (typeof eev === 'string') return fail(eev);
      var etr = db.trainers.filter(function (x) { return x.id === etid; })[0];
      var enote = { id: uid(), dog_id: edog.id, booking_id: null, trainer_id: etr ? etr.id : null,
        author_name: who.role === 'owner' ? ((who.first_name + ' ' + who.last_name).trim() || 'Il campo') : (etr ? etr.name : ''),
        day: dk(new Date()), lesson: '', work: '', comment: (a.p_comment || '').trim(), evaluation: eev, created_at: nowIso(), updated_at: nowIso() };
      db.dog_notes.push(enote);
      save();
      return json(200, enote);
    }
    if (name === 'set_my_photo') {
      var mine = db.trainers.filter(function (x) { return x.id === trainerOf(who); })[0];
      if (!mine) return fail('Solo un trainer collegato può cambiare la sua foto.');
      if (a.p_path && a.p_path.indexOf('trainer-' + mine.id + '-') !== 0) return fail('Foto non valida.');
      mine.photo_path = a.p_path || null;
      save();
      return json(200, null);
    }
    if (name === 'trainer_penalty') {
      var pb = db.bookings.filter(function (b) { return b.id === a.p_booking && b.status === 'active'; })[0];
      if (!pb) return fail('Lezione non trovata.');
      if (who.role !== 'owner') {
        if (!pb.trainer_id || pb.trainer_id !== trainerOf(who)) return fail('Non è una tua lezione.');
        if (pb.day > dk(new Date())) return fail('La penalità si dà il giorno della lezione o dopo.');
      }
      if (!(a.p_reason || '').trim()) return fail('Scegli il motivo della penalità.');
      var pen = { id: uid(), dog_id: pb.dog_id, booking_id: pb.id, reason: a.p_reason.trim(), created_at: nowIso() };
      db.penalties.push(pen);
      var lim = db.settings[0].penalty_limit;
      if (lim > 0 && db.penalties.filter(function (x) { return x.dog_id === pb.dog_id; }).length >= lim)
        db.dogs.forEach(function (d) { if (d.id === pb.dog_id) d.blocked = true; });
      save();
      return json(200, pen);
    }
    if (name === 'trainer_remove_penalty') {
      var rp = db.penalties.filter(function (x) { return x.id === a.p_id; })[0];
      var rb = rp && db.bookings.filter(function (b) { return b.id === rp.booking_id; })[0];
      if (!rp || (who.role !== 'owner' && (!rb || rb.trainer_id !== trainerOf(who)))) return fail('Non è una penalità di una tua lezione.');
      db.penalties = db.penalties.filter(function (x) { return x.id !== a.p_id; });
      save();
      return json(200, null);
    }
    if (name === 'busy_slots') {
      var inRange = function (x) { return x.status === 'active' && x.day >= a.from_day && x.day <= a.to_day; };
      return json(200, db.bookings.filter(function (b) { return inRange(b) && !b.class_id; })
        .map(function (b) { return { field_id: b.field_id, day: b.day, start_min: b.start_min, dur_min: b.dur_min, mine: b.user_id === who.id }; })
        .concat(db.classes.filter(inRange).map(function (c) {
          return { field_id: c.field_id, day: c.day, start_min: c.start_min, dur_min: c.dur_min, mine: db.bookings.some(function (b) { return b.class_id === c.id && b.status === 'active' && b.user_id === who.id; }) };
        })));
    }
    if (name === 'class_list') {
      return json(200, db.classes.filter(function (c) { return c.status === 'active' && c.day >= a.from_day && c.day <= a.to_day; })
        .sort(function (x, y) { return x.day.localeCompare(y.day) || x.start_min - y.start_min; })
        .map(function (c) {
          var in_ = db.bookings.filter(function (b) { return b.class_id === c.id && b.status === 'active'; });
          return { id: c.id, lesson_type: c.lesson_type, lesson_option: c.lesson_option, field_id: c.field_id, trainer_id: c.trainer_id, day: c.day, start_min: c.start_min, dur_min: c.dur_min, seats: c.seats,
            taken: in_.length, my_dogs: in_.filter(function (b) { return b.user_id === who.id; }).map(function (b) { return b.dog_id; }) };
        }));
    }
    if (name === 'create_classes') {
      if (who.role !== 'owner') return fail('Solo il proprietario');
      var glt = db.lesson_types.filter(function (x) { return x.id === a.p_type && x.active; })[0];
      if (!glt || glt.group_seats == null) return fail('Scegli una lezione di gruppo');
      if (glt.options.length && glt.options.indexOf(a.p_option) < 0) return fail('Specialità non valida');
      if (!db.fields.some(function (f) { return f.id === a.p_field && f.active; })) return fail('Campo non disponibile');
      if (a.p_start % 30 || a.p_start < 0 || a.p_start + glt.duration_min > 1440) return fail('Orario non valido');
      if (!(a.p_seats >= 2 && a.p_seats <= 50)) return fail('I posti vanno da 2 a 50');
      if (!(a.p_weeks >= 1 && a.p_weeks <= 26)) return fail('Le settimane vanno da 1 a 26');
      var made = [];
      for (var wk = 0; wk < a.p_weeks; wk++) {
        var nc = { id: uid(), lesson_type: glt.id, lesson_option: a.p_option || '', field_id: a.p_field, trainer_id: a.p_trainer || null, day: dk(addDays(slotDate(a.p_day, 0), 7 * wk)), start_min: a.p_start, dur_min: glt.duration_min, seats: a.p_seats, status: 'active', created_at: nowIso() };
        if (fieldBusy(nc.field_id, nc.day, nc.start_min, nc.start_min + nc.dur_min) || made.some(function (m) { return overlaps(m, nc.day, nc.start_min, nc.start_min + nc.dur_min); }))
          return fail(FIELD_TAKEN.replace('{nome}', nc.day.split('-').reverse().join('/')));
        var tw = nc.trainer_id && trainerBusy(nc.trainer_id, nc, nc.id, null);
        if (tw) return fail(tw);
        made.push(nc);
      }
      db.classes = db.classes.concat(made);
      save();
      return json(200, made.length);
    }
    if (name === 'join_class') {
      var forOther = !!a.p_user;
      if (forOther && who.role !== 'owner') return fail('Solo il proprietario può prenotare per un cliente');
      var usr = a.p_user || who.id;
      if (!forOther) {
        if (who.rules_ver !== s.rules_ver || who.privacy_ver !== s.privacy_ver) return fail('Devi prima accettare regolamento e privacy aggiornati');
        if (!who.tax_code || !who.billing_street || !who.billing_zip || !who.billing_city) return fail('Completa codice fiscale e indirizzo di fatturazione nel Profilo');
        if (a.p_pay === 'online' && !s.online_payments) return fail('Il pagamento online non è ancora attivo');
      }
      var jd = db.dogs.filter(function (d) { return d.id === a.p_dog && d.owner_id === usr && !d.archived; })[0];
      if (!jd) return fail('Cane non trovato');
      if (jd.blocked && !forOther) return fail('Le prenotazioni per questo cane sono sospese. Contatta il campo.');
      var jc = db.classes.filter(function (c) { return c.id === a.p_class && c.status === 'active'; })[0];
      if (!jc) return fail('Classe non trovata');
      if (!forOther && slotDate(jc.day, jc.start_min) <= new Date()) return fail('Orario già passato');
      var inside = db.bookings.filter(function (b) { return b.class_id === jc.id && b.status === 'active'; });
      if (inside.some(function (b) { return b.dog_id === jd.id; })) return fail('Questo cane è già iscritto alla classe');
      if (inside.length >= jc.seats) return fail('La classe è al completo');
      var jlt = db.lesson_types.filter(function (x) { return x.id === jc.lesson_type; })[0];
      var jb = { id: uid(), user_id: usr, dog_id: jd.id, field_id: jc.field_id, trainer_id: jc.trainer_id, lesson_type: jc.lesson_type, lesson_option: jc.lesson_option, day: jc.day, start_min: jc.start_min, dur_min: jc.dur_min, price_cents: jlt ? jlt.price_cents : 0, pay: forOther ? 'onsite' : (a.p_pay || 'onsite'), paid: false, checked_in_at: null, note: '', status: 'active', cancelled_at: null, created_at: nowIso(), class_id: jc.id };
      var jp = packageFor(usr, jc.lesson_type);
      if (jp) { jp.lessons_used++; jb.package_id = jp.id; jb.pay = 'package'; jb.paid = true; jb.price_cents = 0; }
      db.bookings.push(jb);
      save();
      return json(200, jb);
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
      if (lt.group_seats != null) return fail('Questa lezione si fa in gruppo: scegli una classe');
      if (lt.options.length && lt.options.indexOf(a.p_option) < 0) return fail('Scegli un\'opzione valida.');
      if (a.p_pay === 'online' && !s.online_payments) return fail('Il pagamento online non è attivo.');
      if (slotDate(a.p_day, a.p_start) <= new Date()) return fail('Questo orario è già passato.');
      var av = db.availability.filter(function (x) { return x.field_id === a.p_field && x.day === a.p_day; })[0];
      for (var m = a.p_start; m < a.p_start + lt.duration_min; m += 30) if (!av || av.slots.indexOf(m) < 0) return fail('Il campo è chiuso in questo orario.');
      var clash = fieldBusy(a.p_field, a.p_day, a.p_start, a.p_start + lt.duration_min);
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
      if (lt2.group_seats != null) return fail('Questa lezione si fa in gruppo: scegli una classe');
      if (lt2.options.length && lt2.options.indexOf(a.p_option) < 0) return fail('Specialità non valida');
      var end2 = a.p_start + lt2.duration_min;
      if (fieldBusy(a.p_field, a.p_day, a.p_start, end2)) return fail('Il campo è già occupato a quell\'ora');
      var tw2 = a.p_trainer && trainerBusy(a.p_trainer, { lesson_type: lt2.id, day: a.p_day, start_min: a.p_start, dur_min: lt2.duration_min }, null, null);
      if (tw2) return fail(tw2);
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
        tax_code: d.tax_code || '', billing_street: d.billing_street || '', billing_zip: d.billing_zip || '', billing_city: d.billing_city || '', billing_province: d.billing_province || '', social_consent: !!d.social_consent, social_consent_at: d.social_consent ? nowIso() : null, rules_ver: d.rules_ver, privacy_ver: d.privacy_ver, rules_accepted_at: nowIso(), privacy_accepted_at: nowIso(), created_at: nowIso() };
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
  var PUBLIC = BASE + '/storage/v1/object/public/';
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
    // I file si salvano come "bucket/nome": branding per il logo, foto per trainer e clienti.
    var up = /^object\/(branding|foto)\/(.+)$/.exec(path);
    if (up && (method === 'POST' || method === 'PUT')) {
      var name = up[1] + '/' + decodeURIComponent(up[2]);
      var blob = raw;
      if (typeof FormData !== 'undefined' && raw instanceof FormData) raw.forEach(function (v) { if (v instanceof Blob) blob = v; });
      if (!(blob instanceof Blob)) blob = new Blob([raw]);
      try { db.files[name] = await shrink(blob); } catch (e) { return json(400, { statusCode: '400', error: 'invalid', message: e.message }); }
      save();
      fixImages(document);
      return json(200, { Key: name, Id: name });
    }
    var del = /^object\/(branding|foto)$/.exec(path);
    if (del && method === 'DELETE') {
      ((body && body.prefixes) || []).forEach(function (n) { delete db.files[del[1] + '/' + n]; });
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
