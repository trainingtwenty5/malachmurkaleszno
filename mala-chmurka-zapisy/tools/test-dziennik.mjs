/* ==========================================================================
   Mała Chmurka — testy dziennika zmian
   --------------------------------------------------------------------------
   Dziennik ma odpowiadać na pytanie „kto, co i kiedy zmienił”, i to takim
   językiem, jakim mówi obsługa — nie nazwami pól z bazy. Trzy rzeczy łatwo
   tu zepsuć i wszystkie trzy są poniżej sprawdzone:

     • opis wartości: `false` musi zostać „nie”, a nie zniknąć,
       a wyczyszczone pole musi być widoczne jako wyczyszczone,
     • kolejność: dziennik bez porządku od najnowszego jest bezużyteczny,
     • filtry: pusty filtr znaczy „wszystko”, a nie „nic”.

   URUCHOMIENIE:   node tools/test-dziennik.mjs   (z katalogu mala-chmurka-zapisy)
   Bez zależności, bez emulatora, bez przeglądarki.
   ========================================================================== */

import { opisWartosci, opisZmian, ETYKIETY_POL, nazwaAkcji, rodzinaAkcji,
         grupujPoDniach, godzinaWpisu, pasujeDoFiltra, plWpisy,
         etykietaGodzin, roznicaGodzin, jednorazoweZamkniecia, wyjatkiNaTydzien }
  from '../assets/mc-common.js';

let pass = 0, fail = 0;
const ok = (name, cond, dump = '') => {
  if (cond) { console.log('  OK   ' + name); pass++; }
  else { console.log('  FAIL ' + name + (dump ? '\n         ' + dump : '')); fail++; }
};
const eq = (name, got, want) =>
  ok(`${name} → ${JSON.stringify(want)}`, JSON.stringify(got) === JSON.stringify(want),
     `dostałem: ${JSON.stringify(got)}`);

/* ================================================== OPIS WARTOŚCI ======== */
console.log('\n=== JAK OPISUJEMY ZMIENIONĄ WARTOŚĆ ===');

eq('prawda', opisWartosci(true), 'tak');
/* Najważniejszy przypadek w tym pliku. Gdyby `false` wpadło w to samo sito,
   co pusty napis, „odznaczono opłacone" wyglądałoby w dzienniku identycznie
   jak „wyczyszczono pole" — a to dwie zupełnie inne rzeczy. */
eq('fałsz nie gubi się po drodze', opisWartosci(false), 'nie');
eq('zero to zero, nie brak', opisWartosci(0), '0');
eq('brak wartości', opisWartosci(null), '—');
eq('pole wyczyszczone widać wprost', opisWartosci(''), '(wyczyszczone)');
eq('same spacje to też wyczyszczenie', opisWartosci('   '), '(wyczyszczone)');
eq('zwykły napis', opisWartosci(' 16:30 '), '16:30');
eq('lista mówi ile, nie co', opisWartosci([1, 2, 3]), '3 poz.');
eq('pusta lista', opisWartosci([]), 'puste');
eq('obiektu nie rozwijamy', opisWartosci({ a: 1 }), '(zmienione)');
ok('długi tekst jest przycięty i oznaczony wielokropkiem', (() => {
  const w = opisWartosci('x'.repeat(200));
  return w.length === 58 && w.endsWith('…');
})(), opisWartosci('x'.repeat(200)));

/* ================================================== OPIS ZMIAN =========== */
console.log('\n=== LISTA „POLE: WARTOŚĆ" ===');

eq('nazwy pól tłumaczymy na ludzki',
   opisZmian({ paid: true, stayUntil: '16:30' }),
   ['opłacone: tak', 'godzina wyjścia: 16:30']);
eq('pole bez tłumaczenia zostaje pod swoją nazwą',
   opisZmian({ jakiesNoweMagicznePole: 7 }), ['jakiesNoweMagicznePole: 7']);
/* Znaczniki czasu dokłada każdy zapis — w dzienniku byłyby szumem
   przy absolutnie każdym wpisie. */
eq('znaczniki czasu nie trafiają do dziennika',
   opisZmian({ paid: true, updatedAt: 'cokolwiek', createdAt: 'x', decidedAt: 'y' }),
   ['opłacone: tak']);
eq('pusty zapis to pusta lista', opisZmian({}), []);
eq('brak zapisu nie wywala funkcji', opisZmian(), []);
eq('odznaczenie widać tak samo dobrze jak zaznaczenie',
   opisZmian({ countedInRanking: false }), ['policzone w rankingu: nie']);
eq('własne etykiety mają pierwszeństwo',
   opisZmian({ paid: true }, { ...ETYKIETY_POL, paid: 'zapłacone gotówką' }),
   ['zapłacone gotówką: tak']);

/* ================================================== NAZWY AKCJI ========== */
console.log('\n=== NAZWY AKCJI I RODZINY ===');

eq('znana akcja', nazwaAkcji('booking.status'), 'Rozpatrzono rezerwację');
eq('nieznana akcja nie zostawia pustki', nazwaAkcji('cos.nowego'), 'cos.nowego');
eq('brak akcji', nazwaAkcji(), 'Zmiana');
eq('rodzina z kropki', rodzinaAkcji('event.delete'), 'event');
eq('akcja bez kropki jest sama sobie rodziną', rodzinaAkcji('cos'), 'cos');
eq('brak akcji ma rodzinę zastępczą', rodzinaAkcji(''), 'inne');

/* ================================================== OŚ CZASU ============= */
console.log('\n=== GRUPOWANIE W DNI I KOLEJNOŚĆ ===');

const d = (iso, h, m = 0) => {
  const [y, mo, dd] = iso.split('-').map(Number);
  return new Date(y, mo - 1, dd, h, m);
};
const wpis = (at, extra = {}) => ({ at, who: 'a@x.pl', action: 'booking.update',
                                    subject: 'Rezerwacja ABC', changes: [], ...extra });

const osZCzasem = grupujPoDniach([
  wpis(d('2026-09-15', 9)),
  wpis(d('2026-09-17', 8)),
  wpis(d('2026-09-15', 17)),
  wpis(d('2026-09-17', 20))
]);

eq('dni idą od najnowszego', osZCzasem.map(g => g.dzien), ['2026-09-17', '2026-09-15']);
eq('w dniu też od najnowszego',
   osZCzasem[0].wpisy.map(w => godzinaWpisu(w.at)), ['20:00', '08:00']);
eq('drugi dzień policzony osobno',
   osZCzasem[1].wpisy.map(w => godzinaWpisu(w.at)), ['17:00', '09:00']);

/* Wpis bez daty potrafi się zdarzyć: `serverTimestamp()` przez moment po
   zapisie jest pusty. Ma go nie być na osi, a nie wywrócić całej zakładki. */
eq('wpis bez daty jest pomijany, nie wybucha',
   grupujPoDniach([wpis(null), wpis(d('2026-09-17', 10)), wpis(new Date('nic'))])
     .map(g => g.dzien), ['2026-09-17']);
eq('pusta lista daje pustą oś', grupujPoDniach([]), []);
eq('brak listy też', grupujPoDniach(), []);

eq('godzina jest dwucyfrowa', godzinaWpisu(d('2026-09-17', 7, 5)), '07:05');
eq('godzina z niczego jest pusta', godzinaWpisu(null), '');

/* ================================================== FILTRY =============== */
console.log('\n=== FILTRY ===');

const anna  = wpis(d('2026-09-17', 10), { who: 'anna@x.pl', action: 'booking.status',
                                          subject: 'Rezerwacja LMGPYJ84', changes: ['status: accepted'] });
const marek = wpis(d('2026-09-17', 11), { who: 'marek@x.pl', action: 'event.delete',
                                          subject: 'Ruch to zdrowie, 2026-09-20' });
const klient = wpis(d('2026-09-17', 12), { who: 'klient', action: 'booking.client',
                                           subject: 'Rezerwacja QQ11' });

ok('bez filtrów przechodzi wszystko',
   [anna, marek, klient].every(w => pasujeDoFiltra(w, {})));
ok('pusty obiekt filtrów to też „wszystko"', pasujeDoFiltra(anna));
ok('filtr po osobie', pasujeDoFiltra(anna, { kto: 'anna@x.pl' })
   && !pasujeDoFiltra(marek, { kto: 'anna@x.pl' }));
ok('filtr po rodzinie łapie obie akcje rezerwacji',
   pasujeDoFiltra(anna, { rodzina: 'booking' })
   && pasujeDoFiltra(klient, { rodzina: 'booking' })
   && !pasujeDoFiltra(marek, { rodzina: 'booking' }));

/* Szukajka ma trafiać w to, co obsługa widzi na ekranie: numer, nazwę,
   osobę i treść zmiany — a nie w nazwę akcji z bazy. */
ok('szukanie po numerze rezerwacji', pasujeDoFiltra(anna, { szukaj: 'LMGPYJ84' }));
ok('wielkość liter nie ma znaczenia', pasujeDoFiltra(anna, { szukaj: 'lmgpyj84' }));
ok('spacje wokół nie przeszkadzają', pasujeDoFiltra(anna, { szukaj: '  LMGPYJ  ' }));
ok('szukanie po nazwie zajęć', pasujeDoFiltra(marek, { szukaj: 'ruch to zdrowie' }));
ok('szukanie po treści zmiany', pasujeDoFiltra(anna, { szukaj: 'accepted' }));
ok('szukanie po nazwie akcji po polsku', pasujeDoFiltra(marek, { szukaj: 'usunięto' }));
ok('obcy ciąg nie trafia', !pasujeDoFiltra(anna, { szukaj: 'zzz' }));
ok('filtry łączą się przez I, nie przez LUB',
   !pasujeDoFiltra(anna, { kto: 'anna@x.pl', rodzina: 'event' }));
ok('brak wpisu nie przechodzi', !pasujeDoFiltra(null, {}));

console.log('\n=== PODSUMOWANIE POD LISTĄ ===');

/* Polski liczebnik ma trzy formy, nie dwie. „1 wpisów" pod listą wygląda jak
   błąd programu i podkopuje zaufanie do wszystkiego, co jest wyżej. */
eq('jeden',               plWpisy(1),   '1 wpis');
eq('dwa',                 plWpisy(2),   '2 wpisy');
eq('cztery',              plWpisy(4),   '4 wpisy');
eq('pięć',                plWpisy(5),   '5 wpisów');
eq('dwanaście — wyjątek', plWpisy(12),  '12 wpisów');
eq('trzynaście',          plWpisy(13),  '13 wpisów');
eq('czternaście',         plWpisy(14),  '14 wpisów');
eq('dwadzieścia dwa',     plWpisy(22),  '22 wpisy');
eq('sto dwanaście',       plWpisy(112), '112 wpisów');
eq('sto dwadzieścia dwa', plWpisy(122), '122 wpisy');
eq('zero',                plWpisy(0),   '0 wpisów');
eq('brak liczby',         plWpisy(),    '0 wpisów');

console.log('\n=== GODZINY: JAK OPISUJEMY DZIEŃ ===');

const dzien = (...pary) => ({ ranges: pary.map(([o, c]) => ({ open: o, close: c })) });

eq('zwykły dzień',      etykietaGodzin(dzien(['10:00', '19:00'])), '10:00 – 19:00');
eq('dzień z przerwą',   etykietaGodzin(dzien(['10:00', '13:00'], ['15:00', '19:00'])),
   '10:00 – 13:00, 15:00 – 19:00');
eq('dzień zamknięty',   etykietaGodzin(null), 'nieczynne');
eq('dzień bez godzin też jest zamknięty', etykietaGodzin({ ranges: [] }), 'nieczynne');

console.log('\n=== GODZINY: CO SIĘ ZMIENIŁO W WIZYTÓWCE ===');

/* Indeks 0 to niedziela (jak w JavaScripcie), ale opis ma iść od poniedziałku,
   bo tak czyta tydzień człowiek. */
const TYDZIEN_STARY = [
  dzien(['10:00', '19:00']), dzien(['15:00', '19:00']), dzien(['10:00', '19:00']),
  dzien(['10:00', '19:00']), dzien(['10:00', '19:00']), dzien(['10:00', '16:00']),
  dzien(['10:00', '19:00'])
];
const TYDZIEN_NOWY = [
  dzien(['10:00', '15:00']), dzien(['15:00', '19:00']), dzien(['10:00', '19:00']),
  dzien(['10:00', '19:00']), dzien(['10:00', '19:00']), dzien(['10:00', '19:00']),
  null
];

eq('różnica wymienia tylko to, co się ruszyło, od poniedziałku',
   roznicaGodzin(TYDZIEN_STARY, TYDZIEN_NOWY),
   ['piątek: 10:00 – 16:00 → 10:00 – 19:00',
    'sobota: 10:00 – 19:00 → nieczynne',
    'niedziela: 10:00 – 19:00 → 10:00 – 15:00']);
eq('ten sam tydzień to brak różnicy', roznicaGodzin(TYDZIEN_NOWY, TYDZIEN_NOWY), []);
/* Brak poprzedniego tygodnia znaczy „nie ma z czym porównać" — nie udajemy
   wtedy, że wszystko się zmieniło. */
eq('brak poprzednich godzin nie jest zmianą', roznicaGodzin(null, TYDZIEN_NOWY), []);
eq('brak nowych godzin też nie', roznicaGodzin(TYDZIEN_STARY, undefined), []);
eq('otwarcie zamkniętego dnia też jest zmianą',
   roznicaGodzin([null, null, null, null, null, null, null],
                 [null, dzien(['15:00', '19:00']), null, null, null, null, null]),
   ['poniedziałek: nieczynne → 15:00 – 19:00']);

console.log('\n=== GODZINY: DZIEŃ ZAMKNIĘTY WBREW GRAFIKOWI ===');

/* Wrzesień 2026: 17 = czwartek, 18 = piątek, 19 = SOBOTA, 20 = niedziela.
   W grafiku sobota jest nieczynna na stałe. */
const GRAFIK = [
  dzien(['10:00', '15:00']),  // niedziela
  dzien(['15:00', '19:00']),  // poniedziałek
  dzien(['10:00', '19:00']),  // wtorek
  dzien(['10:00', '19:00']),  // środa
  dzien(['10:00', '19:00']),  // czwartek
  dzien(['10:00', '19:00']),  // piątek
  null                        // sobota
];
const otwarte = (...daty) => Object.fromEntries(daty.map(d => [d, [{ open: '10:00', close: '19:00' }]]));

/* NAJWAŻNIEJSZY TEST W TYM PLIKU. Sobota jest nieczynna co tydzień — ma jej
   TU NIE BYĆ. Gdyby się pojawiła, automat co tydzień dokładałby wykluczenie
   i okienko na stronie głównej ogłaszałoby w kółko to samo. */
eq('stała sobota nie jest odstępstwem',
   jednorazoweZamkniecia({ regularne: GRAFIK, odISO: '2026-09-17',
     wgDat: otwarte('2026-09-17', '2026-09-18', '2026-09-20', '2026-09-21',
                    '2026-09-22', '2026-09-23') }),
   []);

/* A piątek 18.09 normalnie jest otwarty — jego brak w wizytówce to
   jednorazowe zamknięcie i dokładnie o tym klient ma wiedzieć. */
eq('zamknięty piątek to odstępstwo',
   jednorazoweZamkniecia({ regularne: GRAFIK, odISO: '2026-09-17',
     wgDat: otwarte('2026-09-17', '2026-09-20', '2026-09-21',
                    '2026-09-22', '2026-09-23') }),
   ['2026-09-18']);

eq('kilka odstępstw wychodzi po kolei',
   jednorazoweZamkniecia({ regularne: GRAFIK, odISO: '2026-09-17',
     wgDat: otwarte('2026-09-17', '2026-09-22', '2026-09-23') }),
   ['2026-09-18', '2026-09-20', '2026-09-21']);

eq('dzień z pustą listą okresów liczy się jako zamknięty',
   jednorazoweZamkniecia({ regularne: GRAFIK, odISO: '2026-09-17',
     wgDat: { ...otwarte('2026-09-18', '2026-09-20', '2026-09-21', '2026-09-22', '2026-09-23'),
              '2026-09-17': [] } }),
   ['2026-09-17']);

eq('patrzymy tylko w podane okno, nie dalej',
   jednorazoweZamkniecia({ regularne: GRAFIK, odISO: '2026-09-17', dni: 2,
     wgDat: otwarte('2026-09-17') }),
   ['2026-09-18']);

/* Puste dane to „nic nie wiem", a nie „wszystko zamknięte". Gdyby było
   odwrotnie, nieudane pobranie z Google zamknęłoby cały tydzień. */
eq('brak danych z wizytówki nie zamyka niczego',
   jednorazoweZamkniecia({ regularne: GRAFIK, odISO: '2026-09-17', wgDat: null }), []);
eq('brak grafiku też nie', jednorazoweZamkniecia({ regularne: null, odISO: '2026-09-17', wgDat: {} }), []);
eq('brak daty startowej też nie', jednorazoweZamkniecia({ regularne: GRAFIK, wgDat: {} }), []);
eq('brak wszystkiego nie wywala funkcji', jednorazoweZamkniecia(), []);
eq('zero dni do sprawdzenia',
   jednorazoweZamkniecia({ regularne: GRAFIK, odISO: '2026-09-17', dni: 0, wgDat: {} }), []);

console.log('\n=== WYKLUCZENIA NANIESIONE NA KARTĘ GODZIN ===');

/* Karta godzin pokazuje TYDZIEŃ, a wykluczenia dotyczą KONKRETNYCH DAT.
   Ta funkcja łączy jedno z drugim: dla każdego dnia tygodnia znajduje
   najbliższą nadchodzącą datę, która jest wykluczona.
   Wrzesień 2026: 17 = czwartek (4), 18 = piątek (5), 19 = sobota (6),
   20 = niedziela (0), 21 = poniedziałek (1). */
eq('niedziela 20.09 ląduje pod indeksem 0',
   wyjatkiNaTydzien(['2026-09-20'], '2026-09-17'), { 0: '2026-09-20' });
eq('kilka dni trafia pod swoje indeksy',
   wyjatkiNaTydzien(['2026-09-18', '2026-09-21'], '2026-09-17'),
   { 5: '2026-09-18', 1: '2026-09-21' });

/* Przy dwóch tych samych dniach tygodnia wygrywa BLIŻSZA data — karta ma
   ostrzegać przed najbliższą wizytą, a nie przed tą za trzy tygodnie. */
eq('z dwóch niedziel wygrywa bliższa',
   wyjatkiNaTydzien(['2026-09-27', '2026-09-20'], '2026-09-17'), { 0: '2026-09-20' });

eq('dzisiejszy dzień też się liczy',
   wyjatkiNaTydzien(['2026-09-17'], '2026-09-17'), { 4: '2026-09-17' });
eq('wczorajsze wykluczenie nikogo już nie obchodzi',
   wyjatkiNaTydzien(['2026-09-16'], '2026-09-17'), {});
/* Wykluczenie za pół roku nie ma prawa straszyć w karcie godzin dzisiaj. */
eq('data spoza okna dwóch tygodni nie wchodzi',
   wyjatkiNaTydzien(['2026-12-24'], '2026-09-17'), {});
eq('granica okna wchodzi, dzień po niej już nie',
   [wyjatkiNaTydzien(['2026-10-01'], '2026-09-17'),
    wyjatkiNaTydzien(['2026-10-02'], '2026-09-17')],
   [{ 4: '2026-10-01' }, {}]);
eq('własne okno działa',
   wyjatkiNaTydzien(['2026-09-20'], '2026-09-17', 2), {});

eq('pusta lista to brak wyjątków', wyjatkiNaTydzien([], '2026-09-17'), {});
eq('brak listy nie wywala funkcji', wyjatkiNaTydzien(undefined, '2026-09-17'), {});
eq('brak dzisiejszej daty też nie', wyjatkiNaTydzien(['2026-09-20']), {});
eq('śmieci na liście są pomijane',
   wyjatkiNaTydzien([null, '', 'nie-data', '2026-09-20'], '2026-09-17'), { 0: '2026-09-20' });

console.log(`\n================  ${pass} zaliczonych, ${fail} niezaliczonych  ================\n`);
process.exit(fail ? 1 : 0);
