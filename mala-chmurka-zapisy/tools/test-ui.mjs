/* ==========================================================================
   Mała Chmurka — testy formularza zapisu (bez przeglądarki i bez bazy)
   --------------------------------------------------------------------------
   Wycinają prawdziwe funkcje z pliku `zapisz-sie-na-zajecia.html` i sprawdzają,
   co dokładnie wypluwają:
     • pasek kroków — „1. Wybór zajęć” prowadzi do grafiku, „2. Twoje dane”
       do logowania (z powrotem tutaj), „3. Potwierdzenie” jeszcze nie klika;
     • ramkę z krótkim opisem — opis jest hiperłączem do strony TYCH zajęć.
   Sprawdzają też, czy opis wpisany w panelu nie może wstrzyknąć HTML-a.

   URUCHOMIENIE:   node tools/test-ui.mjs      (z katalogu mala-chmurka-zapisy)
   Nie wymaga niczego poza Node — żadnych zależności, żadnego emulatora.
   ========================================================================== */

import { readFileSync } from 'node:fs';

const PAGE = readFileSync(new URL('../zapisz-sie-na-zajecia.html', import.meta.url), 'utf8');
const SCRIPT = PAGE.split('<script type="module">')[1].split('</script>')[0];

/* ------------------------------------------------- atrapy zależności ----- */
const esc = s => String(s ?? '').replace(/[&<>"']/g, c =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const money = n => (Number(n) || 0).toFixed(2).replace('.', ',') + ' zł';
const URLS = { calendar: 'kalendarz-zajec.html', login: 'logowanie.html', event: 'strona-zajec.html' };

let pass = 0, fail = 0;
function ok(name, cond, dump = '') {
  if (cond) { console.log('  OK   ' + name); pass++; }
  else { console.log('  FAIL ' + name + (dump ? '\n         ' + dump : '')); fail++; }
}
function cut(from, to, label) {
  const a = SCRIPT.indexOf(from);
  const b = SCRIPT.indexOf(to, a);
  if (a < 0 || b < 0) { console.error(`Nie znalazłem w pliku: ${label}`); process.exit(1); }
  return SCRIPT.slice(a, b + to.length);
}

/* ====================================================== PASEK KROKÓW ===== */
console.log('\n=== PASEK KROKÓW ===');
{
  const src = cut('const backHere =', ".join(' ');", 'budowanie kroków');
  const location = {
    pathname: '/mala-chmurka-zapisy/zapisz-sie-na-zajecia.html',
    search: '?event=ev1&qty=2'
  };
  const box = { innerHTML: '' };
  const $ = () => box;
  new Function('esc', 'URLS', 'location', '$', src)(esc, URLS, location, $);
  const h = box.innerHTML;

  ok('krok 1 „Wybór zajęć” prowadzi do kalendarza',
    /<a class="step" href="kalendarz-zajec\.html"[^>]*>1\. Wybór zajęć<\/a>/.test(h), h);
  ok('krok 2 „Twoje dane” prowadzi do logowania',
    /<a class="step is-on" href="logowanie\.html\?next=[^"]+"[^>]*>2\. Twoje dane<\/a>/.test(h), h);
  ok('krok 2 wraca po zalogowaniu na tę samą stronę z parametrami',
    h.includes(encodeURIComponent('/mala-chmurka-zapisy/zapisz-sie-na-zajecia.html?event=ev1&qty=2')));
  ok('krok 2 jest oznaczony jako bieżący', h.includes('class="step is-on"'));
  ok('krok 3 „Potwierdzenie” nie jest jeszcze linkiem',
    /<span class="step is-todo"[^>]*>3\. Potwierdzenie<\/span>/.test(h) && !/3\. Potwierdzenie<\/a>/.test(h), h);
  ok('separatory „›” są ukryte przed czytnikami ekranu',
    (h.match(/<span aria-hidden="true">›<\/span>/g) || []).length === 2);
}

/* ============================================ RAMKA Z KRÓTKIM OPISEM ===== */
console.log('\n=== RAMKA Z KRÓTKIM OPISEM ===');
{
  const src = cut('function renderMeta(ev) {', '\n}', 'funkcja renderMeta');
  const box = { hidden: true, innerHTML: '' };
  const $ = () => box;
  const renderMeta = new Function('esc', 'money', 'URLS', '$', src + '; return renderMeta;')(esc, money, URLS, $);

  renderMeta({
    id: 'ev-abc123', title: 'Logosensoryka', ageMin: 1, ageMax: 3,
    start: '09:30', end: '10:30', price: 45,
    shortDesc: 'Zabawa dźwiękiem i fakturą dla najmłodszych.'
  });
  const h = box.innerHTML;

  ok('krótki opis jest hiperłączem',
    /<a class="meta-desc"[^>]*>Zabawa dźwiękiem i fakturą dla najmłodszych\.<\/a>/.test(h), h.slice(0, 300));
  ok('link celuje w stronę TYCH konkretnych zajęć',
    h.includes('href="strona-zajec.html?id=ev-abc123"'));
  ok('otwiera się w nowej karcie, więc wypełniony formularz nie przepada',
    h.includes('target="_blank"') && h.includes('rel="noopener"'));
  ok('jest też wyraźny odnośnik „Pełny opis, zdjęcia i szczegóły”',
    h.includes('Pełny opis, zdjęcia i szczegóły'));
  ok('ramka staje się widoczna', box.hidden === false);
  ok('wiek i cena nadal się pokazują', h.includes('45,00 zł') && h.includes('1–3 lat'));

  renderMeta({ id: 'ev-x', title: 'Warsztaty', ageMin: 0, ageMax: 6, start: '10:00', end: '11:00', price: 0 });
  ok('zajęcia bez opisu i tak dostają link',
    box.innerHTML.includes('Zobacz pełny opis tych zajęć') && box.innerHTML.includes('href="strona-zajec.html?id=ev-x"'));

  renderMeta({
    id: 'ev-y', title: '<img src=x onerror=alert(1)>', ageMin: 0, ageMax: 6,
    start: '10:00', end: '11:00', price: 0, shortDesc: '<script>alert(1)</script>'
  });
  ok('opis z panelu nie wstrzykuje HTML', !box.innerHTML.includes('<script>alert(1)</script>'));
  ok('tytuł w podpowiedzi nie wstrzykuje HTML', !box.innerHTML.includes('<img src=x'));

  renderMeta(null);
  ok('bez wybranych zajęć ramka jest ukryta i pusta',
    box.hidden === true && box.innerHTML === '');
}

console.log(`\n================  ${pass} zaliczonych, ${fail} niezaliczonych  ================\n`);
process.exit(fail ? 1 : 0);
