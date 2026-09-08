/* ==========================================================================
   Mała Chmurka — czy strony importują wszystko, czego używają
   --------------------------------------------------------------------------
   Ten test powstał po konkretnej wpadce: „Odrzuć" w zakładce 5 przestało
   otwierać okienko z powodem odmowy. Kod wołał `askText(...)`, ale nikt nie
   dopisał tej funkcji do listy importów.

   Taki błąd jest wyjątkowo podstępny:
     • strona wczytuje się normalnie, nic nie sygnalizuje problemu,
     • `node --check` przechodzi — składnia jest poprawna,
     • dopiero KLIKNIĘCIE przycisku rzuca ReferenceError w konsoli,
       a dla obsługi wygląda to tak, jakby przycisk nic nie robił.

   Sprawdzamy więc statycznie: każda funkcja z naszych modułów, którą strona
   wywołuje, musi być na jej liście importów.

   URUCHOMIENIE:   node tools/test-importy.mjs
   Nie wymaga niczego poza Node — żadnych zależności, żadnej przeglądarki.
   ========================================================================== */

import { readFileSync, readdirSync } from 'node:fs';

const ROOT = new URL('../', import.meta.url);
const czytaj = sciezka => readFileSync(new URL(sciezka, ROOT), 'utf8').replace(/\r\n/g, '\n');

let pass = 0, fail = 0;
const ok = (name, cond, dump = '') => {
  if (cond) { console.log('  OK   ' + name); pass++; }
  else { console.log('  FAIL ' + name + (dump ? '\n         ' + dump : '')); fail++; }
};

/* ------------------------------------------------ co eksportują moduły ---- */
const moduly = readdirSync(new URL('assets/', ROOT)).filter(f => f.endsWith('.js'));

/** Nazwy wyeksportowane z pliku — deklaracje oraz listy `export { … }`. */
function eksportyZ(kod) {
  const out = new Set(
    [...kod.matchAll(/export\s+(?:async\s+)?(?:function|const|let|var)\s+([A-Za-z_$][\w$]*)/g)]
      .map(m => m[1]));
  for (const m of kod.matchAll(/export\s*\{([^}]*)\}/g)) {
    m[1].split(',').forEach(x => {
      const n = x.trim().split(/\s+as\s+/).pop().trim();
      if (n && n !== 'default') out.add(n);
    });
  }
  return out;
}

const wszystkieEksporty = new Set();
moduly.forEach(f => eksportyZ(czytaj('assets/' + f)).forEach(n => wszystkieEksporty.add(n)));

/* ------------------------------------------------------ sprawdzenie stron - */
const strony = readdirSync(new URL('.', ROOT)).filter(f => f.endsWith('.html'));

console.log('\n=== KAŻDA WOŁANA FUNKCJA MA SWÓJ IMPORT ===');

for (const plik of strony) {
  const html = czytaj(plik);
  const start = html.indexOf('<script type="module">');
  if (start < 0) continue;                       // strona bez modułu — nie ma czego sprawdzać
  const skrypt = html.slice(start, html.lastIndexOf('</script>'));

  /* Wszystkie nazwy sprowadzone z naszych modułów. Liczy się każdy z nich,
     bo część funkcji jest re-eksportowana (np. `computePresence` przez
     mc-data.js) i strona bierze je stamtąd, a nie wprost z mc-common. */
  const zaimportowane = new Set();
  for (const m of skrypt.matchAll(/import\s*\{([\s\S]*?)\}\s*from\s*'\.\/assets\/[^']+'/g)) {
    m[1].replace(/\/\*[\s\S]*?\*\//g, '')
        .split(',').map(x => x.trim().split(/\s+as\s+/).pop().trim())
        .filter(Boolean).forEach(n => zaimportowane.add(n));
  }

  /* Własna funkcja o tej samej nazwie co eksport to nie błąd — strona
     nie potrzebuje wtedy niczego z modułu. */
  const lokalne = new Set(
    [...skrypt.matchAll(/(?:^|\n)\s*(?:const|let|var|async function|function)\s+([A-Za-z_$][\w$]*)/g)]
      .map(m => m[1]));

  const brak = [...wszystkieEksporty].filter(nazwa =>
    !zaimportowane.has(nazwa) && !lokalne.has(nazwa) &&
    /* wywołanie, a nie fragment innej nazwy ani tekst w cudzysłowie */
    new RegExp('(?<![\\w$.\'"])' + nazwa + '\\s*\\(').test(skrypt));

  ok(plik, brak.length === 0, brak.length ? `woła bez importu: ${brak.join(', ')}` : '');
}

console.log(`\n================  ${pass} zaliczonych, ${fail} niezaliczonych  ================\n`);
process.exit(fail ? 1 : 0);
