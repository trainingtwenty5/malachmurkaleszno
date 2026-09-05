/* ==========================================================================
   Mała Chmurka — testy rankingu wizyt w bawialni
   --------------------------------------------------------------------------
   Ranking ma liczyć odwiedziny tak samo, bez znaczenia czy dziecko przyszło
   na zajęcia, czy po prostu do bawialni. Tu sprawdzamy przełożenie rezerwacji
   na „wizytę" w kształcie, który rozumie ranking, oraz czas pobytu, jaki
   z tego wychodzi.

   URUCHOMIENIE:   node tools/test-ranking.mjs
   ========================================================================== */

import { readFileSync } from 'node:fs';
import { toMin, normPhone, bookingEndMin } from '../assets/mc-common.js';
import { SETTINGS } from '../assets/firebase-config.js';

/* mc-data.js ładuje Firebase z sieci — wycinamy samą funkcję i dajemy atrapy */
const src = readFileSync(new URL('../assets/mc-data.js', import.meta.url), 'utf8');
const from = src.indexOf('export function visitFromBooking(');
const to   = src.indexOf('\n}', from) + 2;
if (from < 0) { console.error('Nie znalazłem visitFromBooking w mc-data.js'); process.exit(1); }
const visitFromBooking = new Function('bookingEndMin', 'normPhone', 'SETTINGS',
  src.slice(from, to).replace('export function', 'function') + '; return visitFromBooking;'
)(bookingEndMin, normPhone, SETTINGS);

/* dokładnie ten wzór stosuje applyVisitToRanking */
const rankMinutes = v =>
  Math.max(0, toMin(v.stayUntil || v.eventEnd) - toMin(v.eventStart)) * (Number(v.qty) || 1);

let pass = 0, fail = 0;
const ok = (name, cond, dump = '') => {
  if (cond) { console.log('  OK   ' + name); pass++; }
  else { console.log('  FAIL ' + name + (dump ? '\n         ' + dump : '')); fail++; }
};
const eq = (name, got, want) =>
  ok(`${name} → ${JSON.stringify(want)}`, JSON.stringify(got) === JSON.stringify(want),
     `dostałem: ${JSON.stringify(got)}`);

const bkg = o => ({
  date: '2026-09-12', start: '10:00', duration: '2h', qty: 3,
  children: [{ name: 'Ania' }, { name: 'Ela' }, { name: 'Piotr' }],
  parentFirstName: 'Daniel', parentLastName: 'Buchar',
  phone: '505 849 404', email: 'daniel@example.com',
  status: 'accepted', paid: true, ...o
});

console.log('\n=== REZERWACJA JAKO WIZYTA ===');
{
  const v = visitFromBooking(bkg());
  eq('data wizyty', v.eventDate, '2026-09-12');
  eq('godzina wejścia', v.eventStart, '10:00');
  eq('godzina wyjścia z dwugodzinnego pobytu', v.eventEnd, '12:00');
  eq('liczba dzieci', v.qty, 3);
  eq('imiona dzieci trafiają do jednego pola rankingu', v.childFirstName, 'Ania, Ela, Piotr');
  eq('rodzic', `${v.parentFirstName} ${v.parentLastName}`, 'Daniel Buchar');
  eq('telefon normalizuje się do klucza kartoteki', v.phoneKey, '505849404');
  eq('e-mail przechodzi', v.email, 'daniel@example.com');
}

console.log('\n=== CZAS POBYTU W RANKINGU ===');
eq('2 h × troje dzieci = 360 minut', rankMinutes(visitFromBooking(bkg())), 360);
eq('1 h × jedno dziecko = 60 minut',
   rankMinutes(visitFromBooking(bkg({ duration: '1h', qty: 1, children: [{ name: 'Ania' }] }))), 60);
eq('ręczna godzina wyjścia decyduje o czasie',
   rankMinutes(visitFromBooking(bkg({ duration: '2h', stayUntil: '11:00', qty: 2 }))), 120);
eq('przedłużony pobyt liczy się w rankingu dłużej',
   rankMinutes(visitFromBooking(bkg({ duration: '1h', stayUntil: '14:00', qty: 1,
     children: [{ name: 'Ania' }] }))), 240);
eq('„bez limitu" liczy się do zamknięcia',
   rankMinutes(visitFromBooking(bkg({ duration: 'open', start: '18:00', qty: 1,
     children: [{ name: 'Ania' }] }), '20:00')), 120);

console.log('\n=== PRZYPADKI BRZEGOWE ===');
{
  const v = visitFromBooking(bkg({ children: [], qty: 1 }));
  eq('brak listy dzieci nie wywala mapowania', v.childFirstName, '');
  eq('bez telefonu klucz jest pusty', visitFromBooking(bkg({ phone: '' })).phoneKey, '');
  eq('wyjście przed wejściem nie daje ujemnych minut',
     rankMinutes(visitFromBooking(bkg({ stayUntil: '09:00', qty: 1 }))), 0);
  eq('puste imiona nie zostawiają przecinków',
     visitFromBooking(bkg({ children: [{ name: 'Ania' }, { name: '' }, { name: 'Ela' }] })).childFirstName,
     'Ania, Ela');
}

console.log(`\n================  ${pass} zaliczonych, ${fail} niezaliczonych  ================\n`);
process.exit(fail ? 1 : 0);
