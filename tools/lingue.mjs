#!/usr/bin/env node
// Controlla le traduzioni dell'app.
//
//   node tools/lingue.mjs            quali frasi mancano in inglese, tedesco, francese e spagnolo
//   node tools/lingue.mjs --testi    testi italiani rimasti fuori da t() (da controllare a mano)
//   node tools/lingue.mjs --frasi    tutte le frasi da tradurre, in JSON
//
// Le frasi sono quelle scritte con t('...') o tKey('...') nell'app più i messaggi d'errore del
// database (raise exception nelle migrazioni), che arrivano all'app in italiano.
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const LANGS = ['en', 'de', 'fr', 'es'];
const args = process.argv.slice(2);

const walk = (dir) =>
  readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? walk(join(dir, e.name)) : /\.tsx?$/.test(e.name) ? [join(dir, e.name)] : [],
  );
const parse = (file) => ts.createSourceFile(file, readFileSync(file, 'utf8'), ts.ScriptTarget.Latest, true, file.endsWith('x') ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
const isText = (n) => n && (ts.isStringLiteral(n) || ts.isNoSubstitutionTemplateLiteral(n));
const isT = (n) => ts.isCallExpression(n) && ts.isIdentifier(n.expression) && (n.expression.text === 't' || n.expression.text === 'tKey');

const files = walk(join(ROOT, 'src')).filter((f) => !f.includes(`${join('src', 'locales')}`));
const keys = new Map(); // frase -> dove si usa
const loose = [];

for (const file of files) {
  const sf = parse(file);
  const where = (n) => `${relative(ROOT, file)}:${sf.getLineAndCharacterOfPosition(n.getStart()).line + 1}`;
  const visit = (n, inT) => {
    if (isT(n) && isText(n.arguments[0])) {
      if (!keys.has(n.arguments[0].text)) keys.set(n.arguments[0].text, where(n));
      inT = true;
    }
    if (!inT && ts.isJsxText(n) && /\p{L}{2}/u.test(n.text)) loose.push(`${where(n)}  ${n.text.trim()}`);
    if (!inT && isText(n) && /\p{Ll}{2,} \p{L}/u.test(n.text) && !ts.isImportDeclaration(n.parent)) {
      // Nomi di tabelle, colonne e simili non hanno spazi; restano frasi e testi visibili.
      const call = ts.isCallExpression(n.parent) && ts.isPropertyAccessExpression(n.parent.expression) ? n.parent.expression.name.text : '';
      if (!['select', 'from', 'rpc', 'eq', 'order', 'invoke', 'or'].includes(call)) loose.push(`${where(n)}  ${n.text}`);
    } else if (!inT && isText(n) && /\p{L}{2}/u.test(n.text)) {
      // Anche le parole singole, quando sono un'etichetta o un titolo.
      const p = n.parent;
      const name = ts.isJsxAttribute(p) || ts.isPropertyAssignment(p) ? p.name.getText() : '';
      if (['title', 'label', 'placeholder', 'help', 'empty', 'what'].includes(name) && !/^[\d-]+$/.test(n.text)) loose.push(`${where(n)}  ${n.text}`);
    }
    ts.forEachChild(n, (c) => visit(c, inT));
  };
  visit(sf, false);
}

// Messaggi del database: il "%" diventa {nome}, come lo traduce errorText().
for (const f of readdirSync(join(ROOT, 'supabase', 'migrations')).filter((f) => f.endsWith('.sql'))) {
  const sql = readFileSync(join(ROOT, 'supabase', 'migrations', f), 'utf8');
  for (const m of sql.matchAll(/raise exception '((?:[^']|'')*)'/g)) {
    const k = m[1].replace(/''/g, "'").replace('%', '{nome}');
    if (!keys.has(k)) keys.set(k, `supabase/migrations/${f}`);
  }
}

// La demo senza server simula il database con gli stessi messaggi, a volte scritti un po' diversi.
const demo = readFileSync(join(ROOT, 'desktop', 'demo', 'demo-backend.js'), 'utf8');
for (const m of demo.matchAll(/fail\('((?:[^'\\]|\\.)*)'/g)) {
  const k = m[1].replace(/\\'/g, "'");
  if (!keys.has(k)) keys.set(k, 'desktop/demo/demo-backend.js');
}

function dict(lang) {
  const sf = parse(join(ROOT, 'src', 'locales', `${lang}.ts`));
  const out = new Map();
  const visit = (n) => {
    if (ts.isPropertyAssignment(n) && (isText(n.name) || ts.isIdentifier(n.name)) && isText(n.initializer)) out.set(n.name.text, n.initializer.text);
    ts.forEachChild(n, visit);
  };
  visit(sf);
  return out;
}

if (args.includes('--frasi')) {
  console.log(JSON.stringify([...keys.keys()], null, 2));
} else if (args.includes('--testi')) {
  console.log(loose.length ? loose.join('\n') : 'Nessun testo fuori da t().');
} else {
  let missing = 0;
  for (const lang of LANGS) {
    const d = dict(lang);
    const miss = [...keys.keys()].filter((k) => !d.has(k));
    const unused = [...d.keys()].filter((k) => !keys.has(k));
    // Le parti variabili {nome} devono restare uguali nella traduzione.
    const vars = (s) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort().join(',');
    const badVars = [...d].filter(([k, v]) => keys.has(k) && vars(k) !== vars(v)).map(([k]) => k);
    console.log(`${lang}: ${keys.size - miss.length}/${keys.size} tradotte`);
    for (const k of miss) console.log(`  manca: ${JSON.stringify(k)}  (${keys.get(k)})`);
    for (const k of badVars) console.log(`  parti variabili diverse: ${JSON.stringify(k)}`);
    for (const k of unused) console.log(`  non più usata: ${JSON.stringify(k)}`);
    missing += miss.length + badVars.length;
  }
  process.exit(missing ? 1 : 0);
}
