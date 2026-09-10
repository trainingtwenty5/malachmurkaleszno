/* ==========================================================================
   Mała Chmurka — testy cennika bawialni
   --------------------------------------------------------------------------
   Sprawdzają, czy cena nalicza się dokładnie tak, jak stoi na stronie:
   taryfa dnia, święta, progi wiekowe i zniżka dla rodzeństwa.

   URUCHOMIENIE:   node tools/test-cennik.mjs    (z katalogu mala-chmurka-zapisy)
   Bez zależności — sam Node.
   ========================================================================== */

import { quote, tariffFor, isHoliday, ageTier, ageInMonths, easterSunday, PRICES,
         AGE_TIERS, isAgeTier, SIBLING_DISCOUNT }
  from '../assets/mc-cennik.js';

let pass = 0, fail = 0;
function ok(name, cond, dump = '') {
  if (cond) { console.log('  OK   ' + name); pass++; }
  else { console.log('  FAIL ' + name + (dump ? '\n         ' + dump : '')); fail++; }
}
const eq = (name, got, want) => ok(`${name} → ${want}`, got === want, `dostałem: ${JSON.stringify(got)}`);

/* ======================================================= TARYFA DNIA ===== */
console.log('\n=== TARYFA DNIA ===');
/* 2026: 7 IX to poniedziałek */
eq('poniedziałek 2026-09-07', tariffFor('2026-09-07'), 'weekday');
eq('czwartek 2026-09-10',     tariffFor('2026-09-10'), 'weekday');
eq('piątek 2026-09-11',       tariffFor('2026-09-11'), 'weekend');
eq('sobota 2026-09-12',       tariffFor('2026-09-12'), 'weekend');
eq('niedziela 2026-09-13',    tariffFor('2026-09-13'), 'weekend');

console.log('\n=== ŚWIĘTA (taryfa weekendowa nawet w środku tygodnia) ===');
ok('1 stycznia to święto', isHoliday('2026-01-01'));
ok('11 listopada to święto', isHoliday('2026-11-11'));
ok('Boże Narodzenie to święto', isHoliday('2026-12-25') && isHoliday('2026-12-26'));
ok('zwykły wtorek nie jest świętem', !isHoliday('2026-09-08'));
/* uwaga: bez toISOString() — ono przelicza na UTC i w Polsce cofa datę o dzień */
const localISO = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
eq('Wielkanoc 2026 wypada 5 kwietnia', localISO(easterSunday(2026)), '2026-04-05');
eq('Wielkanoc 2027 wypada 28 marca',   localISO(easterSunday(2027)), '2027-03-28');
eq('Wielkanoc 2025 wypadła 20 kwietnia', localISO(easterSunday(2025)), '2025-04-20');
ok('Niedziela Wielkanocna 2026 jest w wykazie świąt', isHoliday('2026-04-05'));
eq('Poniedziałek Wielkanocny 2026 (6 IV) ma taryfę', tariffFor('2026-04-06'), 'weekend');
eq('Boże Ciało 2026 (4 VI, czwartek) ma taryfę weekendową', tariffFor('2026-06-04'), 'weekend');
eq('3 maja 2026 (niedziela) ma taryfę weekendową', tariffFor('2026-05-03'), 'weekend');
eq('1 maja 2026 (piątek) ma taryfę weekendową', tariffFor('2026-05-01'), 'weekend');

/* ================================================== CENY PODSTAWOWE ===== */
console.log('\n=== CENY PODSTAWOWE (jedno dziecko, pełna cena) ===');
const one = (date, duration) => quote({ date, duration, children: [{ dob: '2022-01-01' }] }).total;
eq('pon-czw 1 h',        one('2026-09-07', '1h'),   25);
eq('pon-czw 2 h',        one('2026-09-07', '2h'),   40);
eq('pon-czw bez limitu', one('2026-09-07', 'open'), 50);
eq('pt-nd 1 h',          one('2026-09-11', '1h'),   30);
eq('pt-nd 2 h',          one('2026-09-11', '2h'),   45);
eq('pt-nd bez limitu',   one('2026-09-11', 'open'), 55);
ok('cennik w kodzie zgadza się ze stroną',
   PRICES.weekday['1h'] === 25 && PRICES.weekday['2h'] === 40 && PRICES.weekday.open === 50 &&
   PRICES.weekend['1h'] === 30 && PRICES.weekend['2h'] === 45 && PRICES.weekend.open === 55);

/* ====================================================== PROGI WIEKU ===== */
console.log('\n=== PROGI WIEKOWE ===');
const visit = '2026-09-07';
eq('dziecko 3-miesięczne', ageTier('2026-06-07', visit), 'free');
eq('dokładnie 6 miesięcy', ageTier('2026-03-07', visit), 'half');
eq('dziecko 11-miesięczne', ageTier('2025-10-07', visit), 'half');
eq('dokładnie 12 miesięcy', ageTier('2025-09-07', visit), 'full');
eq('dziecko 3-letnie', ageTier('2023-09-07', visit), 'full');
eq('wiek liczy pełne miesiące (dzień przed urodzinami)', ageInMonths('2026-03-08', visit), 5);
eq('brak daty urodzenia → pełna cena', ageTier('', visit), 'full');

console.log('\n=== ZNIŻKI WIEKOWE W CENIE ===');
eq('niemowlę do 6 mies. wchodzi za darmo',
   quote({ date: visit, duration: '2h', children: [{ dob: '2026-06-07' }] }).total, 0);
eq('dziecko 8-miesięczne płaci połowę z 40 zł',
   quote({ date: visit, duration: '2h', children: [{ dob: '2026-01-07' }] }).total, 20);
eq('8-miesięczne w weekend płaci połowę z 45 zł',
   quote({ date: '2026-09-12', duration: '2h', children: [{ dob: '2026-01-07' }] }).total, 22.5);

/* ================================================ ZNIŻKA RODZEŃSTWA ===== */
console.log('\n=== RODZEŃSTWO −20% ===');
const twoKids = quote({ date: visit, duration: '2h',
  children: [{ dob: '2022-01-01' }, { dob: '2023-01-01' }] });
eq('dwoje starszych dzieci: 2 × 40 zł − 20%', twoKids.total, 64);
ok('zniżka rodzeństwa włącza się sama od dwojga dzieci', twoKids.siblingApplies === true);
ok('każde dziecko ma naliczone −8 zł',
   twoKids.lines.every(l => l.siblingDiscount === 8 && l.price === 32));

const oneKid = quote({ date: visit, duration: '2h', children: [{ dob: '2022-01-01' }] });
ok('przy jednym dziecku zniżki rodzeństwa nie ma',
   oneKid.siblingApplies === false && oneKid.total === 40);

eq('troje dzieci: 3 × 40 zł − 20%',
   quote({ date: visit, duration: '2h',
     children: [{ dob: '2022-01-01' }, { dob: '2023-01-01' }, { dob: '2024-01-01' }] }).total, 96);

console.log('\n=== ZNIŻKI ŁĄCZONE ===');
const mixed = quote({ date: visit, duration: '2h', children: [
  { dob: '2022-01-01' },   // 3 lata  → 40 zł, po rodzeństwie 32 zł
  { dob: '2026-01-07' },   // 8 mies. → 20 zł, po rodzeństwie 16 zł
  { dob: '2026-06-07' }    // 3 mies. → gratis
]});
eq('starsze + 8 mies. + niemowlę', mixed.total, 48);
ok('niemowlę zostaje za darmo, nie schodzi poniżej zera',
   mixed.lines[2].price === 0 && mixed.lines[2].siblingDiscount === 0);
ok('zniżka wiekowa liczy się przed rodzeństwem',
   mixed.lines[1].afterAge === 20 && mixed.lines[1].price === 16);

console.log('\n=== PRZYPADKI BRZEGOWE ===');
ok('brak listy dzieci = jedno dziecko w pełnej cenie',
   quote({ date: visit, duration: '1h' }).total === 25);
eq('nieznany czas pobytu daje 0 zł zamiast NaN',
   quote({ date: visit, duration: 'brak', children: [{}] }).total, 0);
ok('można wymusić zniżkę rodzeństwa przy jednym dziecku',
   quote({ date: visit, duration: '2h', children: [{ dob: '2022-01-01' }], siblingDiscount: true }).total === 32);
ok('można wyłączyć zniżkę rodzeństwa mimo dwojga dzieci',
   quote({ date: visit, duration: '2h',
     children: [{ dob: '2022-01-01' }, { dob: '2023-01-01' }], siblingDiscount: false }).total === 80);
ok('kwoty są zaokrąglone do groszy',
   Number.isFinite(quote({ date: '2026-09-12', duration: '2h', children: [{ dob: '2026-01-07' }] }).total));

/* ============================== PROG PODANY WPROST ======================= */
/* Karta „0 · Nowe wejście" w panelu nie pyta o datę urodzenia — obsługa
   wybiera próg dwoma przyciskami. Cena musi wyjść identycznie jak wtedy,
   gdy ten sam próg policzy się z daty. */
console.log('\n=== PRÓG WIEKOWY PODANY WPROST (przyciski w panelu) ===');

const dzien = '2026-09-08';                    // wtorek → taryfa weekday
const bezLimitu = PRICES.weekday.open;         // 50 zł
const zaProg = tier => quote({ date: dzien, duration: 'open', children: [{ name: 'A', tier }] }).total;

eq('pełna cena',            zaProg('full'), bezLimitu);
eq('do 1. roku = połowa',   zaProg('half'), bezLimitu / 2);
eq('do 6. miesiąca gratis', zaProg('free'), 0);
eq('brak progu i brak daty = pełna cena',
   quote({ date: dzien, duration: 'open', children: [{ name: 'A' }] }).total, bezLimitu);

ok('próg z przycisku liczy się tak samo jak z daty urodzenia (niemowlę)',
   zaProg('free') === quote({ date: dzien, duration: 'open',
     children: [{ dob: '2026-07-01' }] }).total);
ok('próg z przycisku liczy się tak samo jak z daty urodzenia (9 miesięcy)',
   zaProg('half') === quote({ date: dzien, duration: 'open',
     children: [{ dob: '2026-01-01' }] }).total);

eq('próg podany wprost ma pierwszeństwo przed datą urodzenia',
   quote({ date: dzien, duration: 'open',
     children: [{ dob: '2020-01-01', tier: 'free' }] }).total, 0);

/* Najważniejszy z tych testów: `AGE_TIERS[id]` jest prawdziwe także dla nazw
   dziedziczonych po Object, więc „próg" o nazwie 'toString' przechodził dalej
   i wyliczał cenę jako NaN. */
eq('literówka w progu → pełna cena, nie zniżka', zaProg('gratis'), bezLimitu);
eq('pusty próg → pełna cena', zaProg(''), bezLimitu);
eq('nazwa z prototypu Object nie udaje progu', zaProg('toString'), bezLimitu);
eq('constructor też nie', zaProg('constructor'), bezLimitu);
ok('isAgeTier przepuszcza tylko prawdziwe progi',
   isAgeTier('free') && isAgeTier('half') && isAgeTier('full') &&
   !isAgeTier('toString') && !isAgeTier('constructor') && !isAgeTier('') && !isAgeTier(undefined));

/* Zniżka rodzeństwa działa na progach z przycisków tak samo jak na datach. */
const dwoje = quote({ date: dzien, duration: 'open',
  children: [{ name: 'A', tier: 'full' }, { name: 'B', tier: 'full' }] });
eq('dwoje pełnopłatnych: −20% na każdym', dwoje.total,
   2 * bezLimitu * (1 - SIBLING_DISCOUNT));

const zNiemowlakiem = quote({ date: dzien, duration: 'open',
  children: [{ name: 'A', tier: 'full' }, { name: 'B', tier: 'free' }] });
eq('niemowlę zostaje gratis', zNiemowlakiem.lines[1].price, 0);
eq('starsze dziecko dostaje zniżkę rodzeństwa', zNiemowlakiem.lines[0].price,
   bezLimitu * (1 - SIBLING_DISCOUNT));

eq('próg wraca w wycenie (trafia do bazy)',
   quote({ date: dzien, duration: 'open', children: [{ tier: 'half' }] }).lines[0].tier, 'half');
ok('etykiety progów to te same napisy, co na przyciskach w panelu',
   AGE_TIERS.free.label === 'do 6. miesiąca życia' &&
   AGE_TIERS.half.label === 'od 6. miesiąca do 1. roku');

console.log(`\n================  ${pass} zaliczonych, ${fail} niezaliczonych  ================\n`);
process.exit(fail ? 1 : 0);
