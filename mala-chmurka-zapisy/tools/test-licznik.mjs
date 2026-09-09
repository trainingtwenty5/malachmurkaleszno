/* ==========================================================================
   Mała Chmurka — testy licznika dzieci w bawialni
   --------------------------------------------------------------------------
   Licznik ma sumować DZIECI, a nie zgłoszenia, i brać pod uwagę dwa źródła:
   zapisy na zajęcia z potwierdzoną obecnością oraz zaakceptowane rezerwacje
   wstępu — te dopiero od godziny przyjścia.

   URUCHOMIENIE:   node tools/test-licznik.mjs
   ========================================================================== */

import { computeLivePresence, computePresence, bookingEndMin, countChildren,
         presenceTimeline, countAtMin, manualActive, presenceForSite }
  from '../assets/mc-common.js';

let pass = 0, fail = 0;
const ok = (name, cond, dump = '') => {
  if (cond) { console.log('  OK   ' + name); pass++; }
  else { console.log('  FAIL ' + name + (dump ? '\n         ' + dump : '')); fail++; }
};
const eq = (name, got, want) =>
  ok(`${name} → ${JSON.stringify(want)}`, JSON.stringify(got) === JSON.stringify(want),
     `dostałem: ${JSON.stringify(got)}`);

const DZIS = '2026-09-10';
const reg = o => ({ eventDate: DZIS, attended: true, paid: true, qty: 1, eventEnd: '18:00', ...o });
const bkg = o => ({ date: DZIS, status: 'accepted', qty: 1, start: '10:00', duration: '2h', ...o });
const at = (h, m = 0) => h * 60 + m;

/* ================================================ ZAPISY NA ZAJECIA ===== */
console.log('\n=== ZAPISY NA ZAJĘCIA ===');

eq('jedno zgłoszenie na czworo dzieci to czworo, nie jeden',
  computeLivePresence({ regs: [reg({ qty: 4 })], dateISO: DZIS, atMin: at(12) }).count, 4);
eq('bez potwierdzenia obecności nie liczymy',
  computeLivePresence({ regs: [reg({ attended: false, qty: 3 })], dateISO: DZIS, atMin: at(12) }).count, 0);
eq('bez płatności nie liczymy',
  computeLivePresence({ regs: [reg({ paid: false, qty: 3 })], dateISO: DZIS, atMin: at(12) }).count, 0);
eq('po godzinie wyjścia licznik wraca do zera',
  computeLivePresence({ regs: [reg({ qty: 3, eventEnd: '11:00' })], dateISO: DZIS, atMin: at(12) }).count, 0);
eq('ręcznie wydłużony pobyt (stayUntil) wygrywa z godziną zajęć',
  computeLivePresence({ regs: [reg({ qty: 2, eventEnd: '11:00', stayUntil: '15:00' })],
    dateISO: DZIS, atMin: at(12) }).count, 2);
eq('zapisy z innego dnia się nie liczą',
  computeLivePresence({ regs: [reg({ eventDate: '2026-09-11', qty: 5 })], dateISO: DZIS, atMin: at(12) }).count, 0);

/* ================================================ REZERWACJE WSTEPU ===== */
console.log('\n=== ZAAKCEPTOWANE REZERWACJE ===');

eq('zaakceptowana rezerwacja na troje dzieci dokłada troje',
  computeLivePresence({ bookings: [bkg({ qty: 3 })], dateISO: DZIS, atMin: at(11) }).count, 3);
eq('rezerwacja czekająca na decyzję nie liczy się',
  computeLivePresence({ bookings: [bkg({ status: 'pending', qty: 3 })], dateISO: DZIS, atMin: at(11) }).count, 0);
eq('rezerwacja odrzucona nie liczy się',
  computeLivePresence({ bookings: [bkg({ status: 'rejected', qty: 3 })], dateISO: DZIS, atMin: at(11) }).count, 0);
eq('przed godziną przyjścia jeszcze nikogo nie ma',
  computeLivePresence({ bookings: [bkg({ start: '16:00', qty: 2 })], dateISO: DZIS, atMin: at(11) }).count, 0);
eq('dokładnie o godzinie przyjścia już się liczy',
  computeLivePresence({ bookings: [bkg({ start: '11:00', qty: 2 })], dateISO: DZIS, atMin: at(11) }).count, 2);
eq('godzinny pobyt kończy się po godzinie',
  computeLivePresence({ bookings: [bkg({ start: '10:00', duration: '1h', qty: 2 })],
    dateISO: DZIS, atMin: at(11) }).count, 0);
eq('dwugodzinny pobyt trwa jeszcze o 11:30',
  computeLivePresence({ bookings: [bkg({ start: '10:00', duration: '2h', qty: 2 })],
    dateISO: DZIS, atMin: at(11, 30) }).count, 2);
eq('„bez limitu" trwa do zamknięcia',
  computeLivePresence({ bookings: [bkg({ start: '10:00', duration: 'open', qty: 1 })],
    dateISO: DZIS, atMin: at(19), dayEnd: '20:00' }).count, 1);
eq('„bez limitu" też się kończy po zamknięciu',
  computeLivePresence({ bookings: [bkg({ start: '10:00', duration: 'open', qty: 1 })],
    dateISO: DZIS, atMin: at(20), dayEnd: '20:00' }).count, 0);
eq('rezerwacja z innego dnia się nie liczy',
  computeLivePresence({ bookings: [bkg({ date: '2026-09-11', qty: 4 })], dateISO: DZIS, atMin: at(11) }).count, 0);

console.log('\n=== GODZINA KOŃCA REZERWACJI ===');
eq('1 h od 10:00', bookingEndMin({ start: '10:00', duration: '1h' }), at(11));
eq('2 h od 10:30', bookingEndMin({ start: '10:30', duration: '2h' }), at(12, 30));
eq('bez limitu od 10:00 przy zamknięciu 20:00', bookingEndMin({ start: '10:00', duration: 'open' }, '20:00'), at(20));
eq('bez limitu tuż przed zamknięciem daje minimum godzinę',
  bookingEndMin({ start: '19:30', duration: 'open' }, '20:00'), at(20, 30));

/* ====================================================== OBA ŹRÓDŁA ====== */
console.log('\n=== GODZINA WYJŚCIA USTAWIONA RĘCZNIE ===');
eq('ręczna godzina wyjścia wygrywa z czasem pobytu',
  bookingEndMin({ start: '10:00', duration: '2h', stayUntil: '13:30' }), at(13, 30));
eq('skrócony pobyt gaśnie wcześniej',
  computeLivePresence({ bookings: [bkg({ qty: 2, start: '10:00', duration: '2h', stayUntil: '11:00' })],
    dateISO: DZIS, atMin: at(11, 30) }).count, 0);
eq('przedłużony pobyt liczy się dłużej',
  computeLivePresence({ bookings: [bkg({ qty: 2, start: '10:00', duration: '1h', stayUntil: '14:00' })],
    dateISO: DZIS, atMin: at(13) }).count, 2);
eq('godzina wyjścia podnosi też porę wygaszenia licznika',
  computeLivePresence({ bookings: [bkg({ qty: 1, start: '10:00', duration: '1h', stayUntil: '15:00' })],
    dateISO: DZIS, atMin: at(11) }).untilMin, at(15));
ok('nieopłacona, ale zaakceptowana rezerwacja dalej liczy się w liczniku',
  computeLivePresence({ bookings: [bkg({ qty: 3, paid: false })], dateISO: DZIS, atMin: at(11) }).count === 3);

console.log('\n=== OBA ŹRÓDŁA RAZEM ===');

const mix = computeLivePresence({
  regs: [reg({ qty: 2, eventEnd: '13:00' })],
  bookings: [bkg({ qty: 3, start: '10:00', duration: '2h' }), bkg({ qty: 1, status: 'pending' })],
  dateISO: DZIS, atMin: at(11)
});
eq('dwoje z zajęć + troje z rezerwacji', mix.count, 5);
eq('rozbicie pokazuje, skąd się wzięli', [mix.fromClasses, mix.fromBookings], [2, 3]);
eq('licznik pokazuje najpóźniejszą godzinę wyjścia', mix.untilMin, at(13));

console.log('\n=== ZGODNOŚĆ WSTECZ I POMOCNIKI ===');
eq('stare computePresence dalej działa (same zajęcia)',
  computePresence([reg({ qty: 4 })], DZIS, at(12)).count, 4);
eq('countChildren sumuje qty, nie rekordy',
  countChildren([{ qty: 4 }, { qty: 2 }, { qty: 1 }]), 7);
eq('brak qty liczy się jako jedno dziecko', countChildren([{}, {}]), 2);
eq('pusta lista to zero', countChildren([]), 0);
eq('brak danych nie wywala licznika',
  computeLivePresence({ dateISO: DZIS, atMin: at(12) }).count, 0);

/* ======================================== ROZKŁAD GODZINOWY DNIA ======== */
/* Rozkład trafia do publicznie czytanego dokumentu settings/presence, a strona
   główna liczy z niego obłożenie sama — także przy zamkniętym panelu. */
console.log('\n=== ROZKŁAD GODZINOWY (presenceTimeline) ===');

eq('rezerwacja daje odcinek od przyjścia do wyjścia',
  presenceTimeline({ bookings: [bkg({ start: '10:00', duration: '2h', qty: 3 })], dateISO: DZIS }),
  [{ from: at(10), to: at(12), qty: 3, kind: 'booking' }]);
eq('zapis na zajęcia liczy się od początku dnia — odhaczono „przyszedł", więc dziecko już jest',
  presenceTimeline({ regs: [reg({ qty: 2, eventEnd: '13:00' })], dateISO: DZIS }),
  [{ from: 0, to: at(13), qty: 2, kind: 'class' }]);
eq('rezerwacja czekająca na decyzję nie trafia do rozkładu',
  presenceTimeline({ bookings: [bkg({ status: 'pending' })], dateISO: DZIS }), []);
eq('cudzy dzień nie trafia do rozkładu',
  presenceTimeline({ bookings: [bkg({ date: '2026-09-11' })], dateISO: DZIS }), []);
eq('odcinki wychodzą posortowane po godzinie przyjścia',
  presenceTimeline({ bookings: [
      bkg({ start: '16:00', duration: '1h' }), bkg({ start: '10:00', duration: '1h' })
    ], dateISO: DZIS }).map(x => x.from), [at(10), at(16)]);
eq('pusty przedział (wyjście nie później niż wejście) wypada z rozkładu',
  presenceTimeline({ bookings: [bkg({ start: '10:00', stayUntil: '10:00' })], dateISO: DZIS }), []);

/* To jest warunek, na którym stoi cała zmiana: strona nie może pokazać innej
   liczby niż panel. Sprawdzamy każdą minutę doby, nie kilka wybranych. */
console.log('\n=== STRONA LICZY TO SAMO, CO PANEL (co do minuty) ===');

const dzien = {
  regs: [reg({ qty: 2, eventEnd: '13:00' }), reg({ qty: 1, eventEnd: '11:30' }),
         reg({ qty: 4, attended: false })],
  bookings: [bkg({ qty: 3, start: '10:00', duration: '2h' }),
             bkg({ qty: 1, start: '15:00', duration: 'open' }),
             bkg({ qty: 2, start: '16:30', duration: '1h' }),
             bkg({ qty: 5, status: 'pending', start: '11:00' })],
  dateISO: DZIS, dayEnd: '19:00'
};
const rozklad = presenceTimeline(dzien);

let rozjazd = null, sprawdzone = 0;
for (let m = 0; m < 24 * 60 && !rozjazd; m++) {
  const panel = computeLivePresence({ ...dzien, atMin: m });
  const strona = countAtMin(rozklad, m);
  sprawdzone++;
  if (panel.count !== strona.count || panel.untilMin !== strona.untilMin) {
    rozjazd = `minuta ${m}: panel ${panel.count}/do ${panel.untilMin}, strona ${strona.count}/do ${strona.untilMin}`;
  }
}
ok(`wszystkie 1440 minut doby daje ten sam wynik (sprawdzono ${sprawdzone})`, !rozjazd, rozjazd || '');

/* Licznik ma rosnąć i gasnąć sam — to jest to, czego brakowało. */
eq('o 9:00 jeszcze nikogo z rezerwacji, ale dzieci z zajęć już są',
  countAtMin(rozklad, at(9)).count, 3);
eq('o 10:30 dochodzi trójka z rezerwacji', countAtMin(rozklad, at(10, 30)).count, 6);
eq('o 12:00 rezerwacja się skończyła, zostają zajęcia', countAtMin(rozklad, at(12)).count, 2);
eq('o 14:00 nie ma już nikogo', countAtMin(rozklad, at(14)).count, 0);
eq('o 15:00 wchodzi pobyt bez limitu', countAtMin(rozklad, at(15)).count, 1);
eq('o 17:00 bez limitu plus godzinny pobyt', countAtMin(rozklad, at(17)).count, 3);
eq('o 19:00 bawialnia zamknięta', countAtMin(rozklad, at(19)).count, 0);
eq('pusty rozkład to zero, a nie błąd', countAtMin([], at(12)), { count: 0, untilMin: 0 });
eq('brak rozkładu to też zero', countAtMin(undefined, at(12)), { count: 0, untilMin: 0 });

/* Dokument settings/presence czyta każdy — nie może być w nim danych dziecka. */
console.log('\n=== ROZKŁAD NIE WYNOSI DANYCH OSOBOWYCH ===');

const zDanymi = presenceTimeline({
  regs: [reg({ qty: 1, childFirstName: 'Zosia', childLastName: 'Kowalska',
               email: 'anna@example.com', phone: '726431978', id: 'reg-123' })],
  bookings: [bkg({ qty: 1, parentFirstName: 'Anna', phone: '726431978',
                   email: 'anna@example.com', id: 'bkg-456', note: 'alergia na orzechy' })],
  dateISO: DZIS
});
const wyslane = JSON.stringify(zDanymi.map(({ from, to, qty }) => ({ from, to, qty })));
ok('w publikowanym rozkładzie nie ma imion, telefonów, e-maili, notatek ani id',
  !/Zosia|Kowalska|Anna|726431978|example\.com|reg-123|bkg-456|orzech/i.test(wyslane), wyslane);
eq('zostają same liczby', JSON.parse(wyslane)[0] && Object.keys(JSON.parse(wyslane)[0]).sort(),
  ['from', 'qty', 'to']);

/* ================================ RĘCZNE NADPISANIE WYGASA Z DNIEM ====== */
/* Sedno zgłoszenia: „Wyzeruj licznik" wieczorem ustawiało manual:true bez końca,
   więc nazajutrz licznik stał na zeru, dopóki ktoś nie przestawił przełącznika. */
console.log('\n=== TRYB RĘCZNY OBOWIĄZUJE TYLKO W SWOIM DNIU ===');

ok('ręczne ustawienie zrobione dzisiaj obowiązuje',
  manualActive({ manual: true, date: DZIS }, DZIS) === true);
ok('ręczne ustawienie z wczoraj JUŻ NIE obowiązuje — rano wraca tryb automatyczny',
  manualActive({ manual: true, date: '2026-09-09' }, DZIS) === false);
ok('wieczorne „Wyzeruj licznik" nie blokuje kolejnego dnia',
  manualActive({ manual: true, count: 0, until: '', date: '2026-09-09' }, DZIS) === false);
ok('tryb automatyczny to tryb automatyczny',
  manualActive({ manual: false, date: DZIS }, DZIS) === false);
ok('brak dokumentu nie jest trybem ręcznym', manualActive(null, DZIS) === false);
ok('dokument bez daty nie zamraża licznika na zawsze',
  manualActive({ manual: true }, DZIS) === false);

/* ============================== CO WIDZI KLIENT NA STRONIE GŁÓWNEJ ====== */
/* presenceForSite to dokładnie ta funkcja, którą woła mc-licznik.js — tu jest
   cała decyzja o tym, jaka liczba pokaże się na stronie. */
console.log('\n=== STRONA GŁÓWNA (presenceForSite) ===');

const dokAuto = { date: DZIS, manual: false, count: 3, until: '12:00', capacity: 15,
  timeline: [{ from: at(10), to: at(12), qty: 3 }, { from: at(15), to: at(17), qty: 2 }] };

eq('o 11:00 widać trójkę i godzinę wyjścia',
  presenceForSite(dokAuto, at(11), DZIS), { count: 3, until: '12:00' });
eq('o 13:00 licznik gaśnie SAM, choć w dokumencie dalej stoi count 3',
  presenceForSite(dokAuto, at(13), DZIS), { count: 0, until: '' });
eq('o 15:30 licznik zapala się SAM na popołudniową rezerwację',
  presenceForSite(dokAuto, at(15, 30), DZIS), { count: 2, until: '17:00' });
eq('o 9:00, przed pierwszym przyjściem, jest luźno',
  presenceForSite(dokAuto, at(9), DZIS), { count: 0, until: '' });

/* To jest sedno zgłoszenia: rano dokument jest z wczoraj i strona ma pokazać
   zero, a nie wczorajszą liczbę — a panel ma sam wrócić do trybu automatycznego. */
console.log('\n=== NOWY DZIEŃ ===');

const wczoraj = { date: '2026-09-09', manual: true, count: 6, until: '18:00', capacity: 15 };
eq('wczorajszy dokument nie pokazuje wczorajszej liczby',
  presenceForSite(wczoraj, at(11), DZIS), { count: 0, until: '' });
ok('…i nie trzyma już panelu w trybie ręcznym', manualActive(wczoraj, DZIS) === false);

console.log('\n=== RĘCZNE NADPISANIE Z DZISIAJ ===');

const reczny = { date: DZIS, manual: true, count: 8, until: '14:00', capacity: 15, timeline: [] };
eq('liczba wpisana ręcznie wygrywa z rozkładem',
  presenceForSite(reczny, at(11), DZIS), { count: 8, until: '14:00' });
eq('po godzinie wpisanej ręcznie licznik wraca do zera',
  presenceForSite(reczny, at(14), DZIS), { count: 0, until: '' });
eq('ręczne wyzerowanie pokazuje zero',
  presenceForSite({ date: DZIS, manual: true, count: 0, until: '' }, at(11), DZIS),
  { count: 0, until: '' });

console.log('\n=== DOKUMENT SPRZED TEJ ZMIANY (bez rozkładu) ===');

const stary = { date: DZIS, manual: false, count: 4, until: '16:00', capacity: 15 };
eq('bez rozkładu zachowujemy się jak dawniej — pokazujemy zapamiętaną liczbę',
  presenceForSite(stary, at(11), DZIS), { count: 4, until: '16:00' });
eq('…i jak dawniej gaśniemy po zapamiętanej godzinie',
  presenceForSite(stary, at(16), DZIS), { count: 0, until: '' });
eq('pusty rozkład w trybie automatycznym znaczy „nikogo nie ma", a nie „brak danych"',
  presenceForSite({ date: DZIS, manual: false, count: 4, until: '16:00', timeline: [] }, at(11), DZIS),
  { count: 0, until: '' });
eq('brak dokumentu to zero, a nie błąd', presenceForSite(null, at(11), DZIS), { count: 0, until: '' });

console.log(`\n================  ${pass} zaliczonych, ${fail} niezaliczonych  ================\n`);
process.exit(fail ? 1 : 0);
