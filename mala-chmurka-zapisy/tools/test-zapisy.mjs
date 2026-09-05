/* ==========================================================================
   Mała Chmurka — testy zamykania zapisów i pamięci dzieci
   --------------------------------------------------------------------------
   Dwie rzeczy, które łatwo zepsuć przy kolejnych zmianach:
     • zajęcia, których termin minął, nie mogą przyjmować zapisów — i mają
       mówić „Termin zapisów upłynął", a nie „brak miejsc";
     • dziecko raz wpisane ma się podpowiadać przy kolejnym zapisie.

   URUCHOMIENIE:   node tools/test-zapisy.mjs   (z katalogu mala-chmurka-zapisy)
   Bez zależności i bez emulatora — sam Node.
   ========================================================================== */

import { signupClosed, seatState, SIGNUP_CLOSED_TEXT, slotInPast, nextQuarter, fmtMin }
  from '../assets/mc-common.js';
import { mergeChildren, childKey, childLabel, normChild, knownChildren }
  from '../assets/mc-dzieci.js';

/* mc-dzieci.js sięga do localStorage — w Node go nie ma, więc dajemy atrapę */
globalThis.localStorage = {
  _v: {},
  getItem(k) { return Object.prototype.hasOwnProperty.call(this._v, k) ? this._v[k] : null; },
  setItem(k, v) { this._v[k] = String(v); },
  removeItem(k) { delete this._v[k]; }
};

let pass = 0, fail = 0;
function ok(name, cond, dump = '') {
  if (cond) { console.log('  OK   ' + name); pass++; }
  else { console.log('  FAIL ' + name + (dump ? '\n         ' + dump : '')); fail++; }
}
const eq = (name, got, want) =>
  ok(`${name} → ${JSON.stringify(want)}`, got === want, `dostałem: ${JSON.stringify(got)}`);

/* ================================================ TERMIN ZAPISÓW ======== */
console.log('\n=== TERMIN ZAPISÓW UPŁYNĄŁ ===');

const DZIS = '2026-09-10', TERAZ = 12 * 60;      // 10 września, godzina 12:00

ok('zajęcia z wczoraj są zamknięte',
  signupClosed({ date: '2026-09-09', end: '11:00' }, DZIS, TERAZ));
ok('zajęcia za dwa dni są otwarte',
  !signupClosed({ date: '2026-09-12', end: '11:00' }, DZIS, TERAZ));
ok('dzisiejsze zajęcia, które już się skończyły, są zamknięte',
  signupClosed({ date: DZIS, end: '11:00' }, DZIS, TERAZ));
ok('dzisiejsze zajęcia jeszcze przed końcem są otwarte',
  !signupClosed({ date: DZIS, end: '13:00' }, DZIS, TERAZ));
ok('zajęcia kończące się dokładnie teraz są już zamknięte',
  signupClosed({ date: DZIS, end: '12:00' }, DZIS, TERAZ));
ok('brak godziny zakończenia nie zamyka dzisiejszych zajęć',
  !signupClosed({ date: DZIS }, DZIS, TERAZ));
ok('brak daty niczego nie zamyka', !signupClosed({}, DZIS, TERAZ));

console.log('\n=== PRZETERMINOWANA GODZINA REZERWACJI ===');
{
  const TERAZ_21 = 21 * 60;   // 21:00

  ok('dziś na 10:00, gdy jest 21:00 — przeterminowane',
     slotInPast(DZIS, '10:00', DZIS, TERAZ_21));
  ok('dziś na 22:00, gdy jest 21:00 — jeszcze można',
     !slotInPast(DZIS, '22:00', DZIS, TERAZ_21));
  ok('dokładnie bieżąca minuta nie jest przeterminowana',
     !slotInPast(DZIS, '21:00', DZIS, TERAZ_21));
  ok('minutę wcześniej już tak',
     slotInPast(DZIS, '20:59', DZIS, TERAZ_21));
  ok('jutro o 10:00 jest w porządku',
     !slotInPast('2026-09-11', '10:00', DZIS, TERAZ_21));
  ok('wczoraj o 22:00 jest przeterminowane',
     slotInPast('2026-09-09', '22:00', DZIS, TERAZ_21));
  ok('sam dzień bez godziny nie jest przeterminowany',
     !slotInPast(DZIS, '', DZIS, TERAZ_21));
  ok('brak danych niczego nie blokuje', !slotInPast('', '10:00', DZIS, TERAZ_21));
}

console.log('\n=== PODPOWIADANA GODZINA PRZYJŚCIA ===');
eq('o 14:07 podpowiadamy', fmtMin(nextQuarter(14 * 60 + 7)), '14:15');
eq('o 14:00 zostaje 14:00', fmtMin(nextQuarter(14 * 60)), '14:00');
eq('o 14:01 przeskakuje na kwadrans', fmtMin(nextQuarter(14 * 60 + 1)), '14:15');
eq('nie wychodzimy poza godzinę zamknięcia',
   fmtMin(nextQuarter(21 * 60 + 40, '20:00')), '20:00');
eq('tuż przed zamknięciem podpowiadamy zamknięcie',
   fmtMin(nextQuarter(19 * 60 + 50, '20:00')), '20:00');

console.log('\n=== STAN MIEJSC ===');
const past = seatState({ date: '2026-09-01', end: '11:00', capacity: 10, booked: 0 }, DZIS, TERAZ);
eq('miniony termin ma stan', past.state, 'closed');
eq('miniony termin mówi wprost, o co chodzi', past.text, SIGNUP_CLOSED_TEXT);
ok('miniony termin nie udaje braku miejsc', past.text !== 'Brak wolnych miejsc');

const full = seatState({ date: '2026-09-12', end: '11:00', capacity: 10, booked: 10 }, DZIS, TERAZ);
eq('komplet ma stan', full.state, 'full');
eq('komplet nie ma wolnych miejsc', full.free, 0);

const open = seatState({ date: '2026-09-12', end: '11:00', capacity: 10, booked: 4 }, DZIS, TERAZ);
eq('otwarte zajęcia mają stan', open.state, 'open');
eq('zostało 6 miejsc', open.free, 6);

ok('miniony termin z wolnymi miejscami dalej jest zamknięty',
  seatState({ date: '2026-09-01', end: '11:00', capacity: 10, booked: 0 }, DZIS, TERAZ).state === 'closed');

/* ================================================= PAMIĘĆ DZIECI ======== */
console.log('\n=== PAMIĘĆ DZIECI ===');

eq('klucz dziecka ignoruje wielkość liter i zbędne spacje',
  childKey({ firstName: '  Zosia ', lastName: 'Kowalska', dob: '2022-01-01' }),
  childKey({ firstName: 'zosia', lastName: ' KOWALSKA ', dob: '2022-01-01' }));

eq('etykieta łączy imię i nazwisko',
  childLabel(normChild({ firstName: 'Zosia', lastName: 'Kowalska' })), 'Zosia Kowalska');
eq('etykieta radzi sobie bez nazwiska',
  childLabel(normChild({ firstName: 'Zosia' })), 'Zosia');

const merged = mergeChildren(
  [{ firstName: 'Zosia', lastName: 'Kowalska', dob: '2022-01-01' }],
  [{ firstName: 'zosia', lastName: 'kowalska', dob: '' }],
  [{ firstName: 'Antek', lastName: 'Kowalski', dob: '2024-05-05' }]
);
eq('to samo dziecko z dwóch źródeł to jeden wpis', merged.length, 2);
eq('brakująca data uzupełnia się z drugiego źródła', merged[0].dob, '2022-01-01');
ok('drugie dziecko zostaje osobno', merged.some(c => c.firstName === 'Antek'));
ok('wpisy bez imienia wypadają',
  mergeChildren([{ firstName: '', dob: '2020-01-01' }, { firstName: 'Ola' }]).length === 1);

console.log('\n=== SKĄD BIORĄ SIĘ PODPOWIEDZI ===');

const io = {
  myRegistrations: async () => ([
    { childFirstName: 'Zosia', childLastName: 'Kowalska', childDob: '2022-01-01' },
    { children: [{ firstName: 'Antek', lastName: 'Kowalski', dob: '2024-05-05' }] }
  ]),
  myBookings: async () => ([
    { children: [{ name: 'Zosia Kowalska', dob: '2022-01-01' },
                 { name: 'Hania Kowalska', dob: '2025-02-02' }] }
  ])
};

const known = await knownChildren('uid-1', io);
eq('z historii wychodzi troje różnych dzieci', known.length, 3);
ok('stary kształt zapisu (childFirstName) jest rozumiany',
  known.some(c => c.firstName === 'Zosia' && c.dob === '2022-01-01'));
ok('nowy kształt zapisu (children[]) jest rozumiany',
  known.some(c => c.firstName === 'Antek'));
ok('dzieci z rezerwacji bawialni też się liczą',
  known.some(c => c.firstName === 'Hania' && c.lastName === 'Kowalska'));
ok('Zosia z dwóch źródeł nie dubluje się',
  known.filter(c => c.firstName === 'Zosia').length === 1);

console.log('\n=== ODPORNOŚĆ NA BŁĘDY ===');
const broken = {
  myRegistrations: async () => { throw new Error('Missing or insufficient permissions.'); },
  myBookings:      async () => { throw new Error('Missing or insufficient permissions.'); }
};
const afterFail = await knownChildren('uid-1', broken);
ok('brak uprawnień nie wywala podpowiedzi — zostaje pamięć przeglądarki',
  Array.isArray(afterFail) && afterFail.length >= 1);
ok('bez zalogowania też coś zwraca (pamięć lokalna)',
  Array.isArray(await knownChildren(null, io)));

console.log(`\n================  ${pass} zaliczonych, ${fail} niezaliczonych  ================\n`);
process.exit(fail ? 1 : 0);
