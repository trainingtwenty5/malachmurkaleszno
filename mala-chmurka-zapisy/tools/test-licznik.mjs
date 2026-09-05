/* ==========================================================================
   Mała Chmurka — testy licznika dzieci w bawialni
   --------------------------------------------------------------------------
   Licznik ma sumować DZIECI, a nie zgłoszenia, i brać pod uwagę dwa źródła:
   zapisy na zajęcia z potwierdzoną obecnością oraz zaakceptowane rezerwacje
   wstępu — te dopiero od godziny przyjścia.

   URUCHOMIENIE:   node tools/test-licznik.mjs
   ========================================================================== */

import { computeLivePresence, computePresence, bookingEndMin, countChildren }
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

console.log(`\n================  ${pass} zaliczonych, ${fail} niezaliczonych  ================\n`);
process.exit(fail ? 1 : 0);
