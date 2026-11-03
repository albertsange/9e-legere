// Auditoria de traduccions del 9e Simulator.
// Ús:  node tools/i18n-audit.mjs [--list]      (requereix: npm i acorn acorn-walk)
// Extreu tots els textos (literals, plantilles i HTML estàtic) de site/simulator/index.html, i per a cada idioma de
// site/simulator/i18n/<lang>.json comprova que els textos que semblen català tinguin traducció (mateixa lògica que i18nTr).
// Surt amb codi 1 si en falta algun. Per afegir un idioma nou: crea i18n/<lang>.json ({"text en català": "traducció"}).
import fs from 'fs'; import path from 'path'; import { createRequire } from 'module';
const rq = createRequire(process.env.NPM_TOOLS ? process.env.NPM_TOOLS : import.meta.url);
const acorn = rq('acorn'), walk = rq('acorn-walk');
const dir = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../site/simulator');
const html = fs.readFileSync(path.join(dir, 'index.html'), 'utf8');
const ws = s => s.replace(/\s+/g, ' ').trim();
const lits = new Map();
const add = (s, line) => { if (typeof s !== 'string') return; const c = ws(s); if (c.length < 3 || c.length > 6000 || !/[A-Za-zÀ-ÿ]{3}/.test(c)) return; if (!lits.has(c)) lits.set(c, line); };
const re = /<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g; let m;
while ((m = re.exec(html))) {
  const base = html.slice(0, m.index).split('\n').length;
  let ast; try { ast = acorn.parse(m[1], { ecmaVersion: 'latest', locations: true, sourceType: 'script' }); } catch (e) { console.error('no es pot analitzar un <script>:', e.message); continue; }
  walk.full(ast, n => { if (n.type === 'Literal' && typeof n.value === 'string') add(n.value, base + n.loc.start.line - 1); if (n.type === 'TemplateElement') add(n.value.cooked, base + n.loc.start.line - 1); });
}
const body = html.replace(/<script[\s\S]*?<\/script>/g, '').replace(/<style[\s\S]*?<\/style>/g, '');
for (const t of body.matchAll(/>([^<>]{3,})</g)) add(t[1], 'html');
for (const t of body.matchAll(/\b(?:title|aria-label|placeholder|alt)="([^"]{3,})"/g)) add(t[1], 'html-attr');
// dades de la campanya (JSON dins de l'script): noms, dates i descripcions
for (const k of ['CAMP_DATA', 'CAMP_DESC']) {
  const mm = new RegExp('const ' + k + ' = (.*)').exec(html); if (!mm) continue;
  const s = mm[1]; for (let e = s.length; e > 0; e--) if ('}]'.includes(s[e - 1])) { try { JSON.parse(s.slice(0, e)); JSON.stringify(JSON.parse(s.slice(0, e)), (_, v) => (typeof v === 'string' && add(v, k), v)); break; } catch (_) {} }
}
// Mateix detector que el del joc (i18nMissNote)
const CA = /(^|[\s'’(«])(el|la|els|les|un|una|de|del|dels|amb|per|que|què|és|són|ha|han|hem|has|cal|ja|més|molt|tot|tots|al|als|pel|seu|seva|teu|teva|ens|et|sense|fins|quan|com|sobre|entre|cap|hi|aquí|ara|després|abans|només|també|encara|però|perquè|mentre|cada|vol|pots|pot|fes|fer|vols|nivell|unitat|homes|línia|ordre)(?=[\s'’,.:;!?)»]|$)|[àèòçŀ]|l·l/i;
const FR = /(?<![\wÀ-ÿ])(le|du|des|sur|par|et|vous|rangs|demi-brigade|ligne|serrez|croisez|baïonnette|avançant|avant|files|à|droite|gauche|arrière|alignement|charge|légère|régiment|après|compiègne|català)(?![\wÀ-ÿ])/i;
const isCa = s => s.length >= 4 && CA.test(s) && !FR.test(s) && !EN.test(s) && !/^(data:|https?:|\/|\.|#|\[i18n\])/.test(s);
const EN = /\b(the|and|you|your|is|of|to|we|are|with|for|will|this|that)\b/i;
let bad = 0;
for (const f of fs.readdirSync(path.join(dir, 'i18n')).filter(f => /^[a-z]{2}\.json$/.test(f) && f !== 'ca.json')) {
  const map = new Map(Object.entries(JSON.parse(fs.readFileSync(path.join(dir, 'i18n', f), 'utf8'))));
  const frag = [...map.keys()].filter(k => k.length >= 8 && !/<[^>]+>/.test(k));
  const ok = c => { if (map.has(c)) return true; const nums = c.match(/\d+/g); if (nums && map.has(c.replace(/\d+/g, '#'))) return true; return c.length >= 8 && frag.some(k => c.includes(k)); };
  const miss = [...lits].filter(([c]) => isCa(c) && !ok(c));
  console.log(`${f}: ${miss.length} textos en català sense traduir (de ${lits.size} textos)`);
  if (miss.length) { bad++; if (process.argv.includes("--json")) fs.writeFileSync("/tmp/audit/miss3.json", JSON.stringify(miss.map(m => m[0]))); for (const [c, l] of miss.slice(0, process.argv.includes("--list") ? 1e9 : 25)) console.log(`  l.${l}  ${c.slice(0, 140)}`); }
}
process.exit(bad ? 1 : 0);
