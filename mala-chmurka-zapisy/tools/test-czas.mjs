/* ==========================================================================
   Mała Chmurka — testy zakładki „Czas zabawy"
   --------------------------------------------------------------------------
   Sprawdzają wspólną listę pobytów (zajęcia + rezerwacje + wejścia z ulicy)
   oraz odliczanie czasu w dół.

   URUCHOMIENIE:   node tools/test-czas.mjs
   ========================================================================== */

import { playtimeRows, fmtCountdown, PLAYTIME_SOURCE, FREEZE_AFTER_MIN } from '../assets/mc-common.js';

let pass = 0, fail = 0;
const ok = (name, cond, dump = '') => {
  if (cond) { console.log('  OK   ' + name); pass++; }
  else { console.log('  FAIL ' + name + (dump ? '\n         ' + dump : '')); fail++; }
};
const eq = (name, got, want) =>
  ok(`${name} → ${JSON.stringify(want)}`, JSON.stringify(got) === JSON.stringify(want),
     `dostałem: ${JSON.stringify(got)}`);

const DZIS = '2026-09-10';
const at = (h, m = 0) => h * 60 + m;
const reg = o => ({ id: 'r1', eventDate: DZIS, attended: true, paid: true, qty: 1,
                    eventStart: '10:00', eventEnd: '12:00', eventTitle: 'Logosensoryka',
                    childFirstName: 'Zosia', childLastName: 'Kowalska', phone: '111222333', ...o });
const bkg = o => ({ id: 'b1', date: DZIS, status: 'accepted', qty: 1, start: '11:00',
                    duration: '2h', children: [{ name: 'Ania' }], phone: '444555666', ...o });

console.log('\n=== ODLICZANIE W DÓŁ ===');
eq('godzina, minuty i sekundy', fmtCountdown(83.5), '1:23:30');
eq('poniżej godziny bez części godzinowej', fmtCountdown(23.75), '23:45');
eq('równe zero', fmtCountdown(0), '00:00');
eq('po czasie z minusem', fmtCountdown(-5.2), '−05:12');
eq('sekundy zaokrąglają się', fmtCountdown(1 / 60), '00:01');

console.log('\n=== WSPÓLNA LISTA POBYTÓW ===');
{
  const rows = playtimeRows({ regs: [reg()], bookings: [bkg()], dateISO: DZIS, atMin: at(11, 30) });
  eq('są dwa pobyty', rows.length, 2);
  eq('sortowanie po godzinie wyjścia', rows.map(r => r.endMin), [at(12), at(13)]);
  eq('zapis z zajęć jest oznaczony', rows[0].sourceLabel, PLAYTIME_SOURCE.classes);
  eq('rezerwacja jest oznaczona', rows[1].sourceLabel, PLAYTIME_SOURCE.booking);
  eq('dziecku z zajęć zostało pół godziny', fmtCountdown(rows[0].remaining), '30:00');
  eq('dziecku z rezerwacji zostało półtorej', fmtCountdown(rows[1].remaining), '1:30:00');
  eq('imię z zapisu', rows[0].names, ['Zosia Kowalska']);
  eq('imię z rezerwacji', rows[1].names, ['Ania']);
}

console.log('\n=== STANY POBYTU ===');
eq('przed przyjściem — czeka',
   playtimeRows({ bookings: [bkg({ start: '16:00' })], dateISO: DZIS, atMin: at(11) })[0].state, 'waiting');
eq('w trakcie — gra',
   playtimeRows({ bookings: [bkg()], dateISO: DZIS, atMin: at(11, 30) })[0].state, 'playing');
eq('po czasie, ale przed zamrożeniem',
   playtimeRows({ bookings: [bkg()], dateISO: DZIS, atMin: at(13, 5) })[0].state, 'overtime');
eq('długo po czasie — zamrożone',
   playtimeRows({ bookings: [bkg()], dateISO: DZIS, atMin: at(14) })[0].state, 'frozen');
eq('w oknie kwadransa pokazuje, o ile jest po',
   fmtCountdown(playtimeRows({ bookings: [bkg()], dateISO: DZIS, atMin: at(13, 10) })[0].shown), '−10:00');

console.log('\n=== ZAMRAŻANIE PO 15 MINUTACH ===');
{
  const godzinny = o => bkg({ start: '10:00', duration: '1h', ...o });   // koniec 11:00
  const st = min => playtimeRows({ bookings: [godzinny()], dateISO: DZIS, atMin: min })[0];

  eq('limit zamrożenia', FREEZE_AFTER_MIN, 15);
  eq('minutę po czasie — jeszcze tyka', st(at(11, 1)).state, 'overtime');
  eq('i pokazuje, o ile jest po', fmtCountdown(st(at(11, 1)).shown), '−01:00');
  eq('czternaście minut po — nadal tyka', st(at(11, 14)).state, 'overtime');
  eq('dokładnie piętnaście minut po — zamrożone', st(at(11, 15)).state, 'frozen');
  ok('zamrożony wiersz jest oznaczony flagą', st(at(11, 15)).frozen === true);
  eq('zamrożonemu licznik staje na piętnastu minutach',
     fmtCountdown(st(at(11, 15)).shown), '−15:00');
  eq('po dwóch godzinach nadal stoi na piętnastu',
     fmtCountdown(st(at(13)).shown), '−15:00');
  ok('prawdziwy czas po terminie jest dalej dostępny, tylko nie pokazywany',
     Math.round(st(at(13)).overtime) === 120);
  ok('przed zamrożeniem wiersz nie jest oznaczony', st(at(11, 14)).frozen === false);
}

console.log('\n=== ZAMROŻONE SPADAJĄ NA DÓŁ ===');
{
  const rows = playtimeRows({
    bookings: [
      bkg({ id: 'zamrozony', start: '08:00', duration: '1h' }),        // koniec 09:00
      bkg({ id: 'gra',       start: '11:00', duration: '2h' }),        // koniec 13:00
      bkg({ id: 'konczy',    start: '10:00', duration: '2h' })         // koniec 12:00
    ],
    dateISO: DZIS, atMin: at(11, 30)
  });
  eq('kolejność: najpierw aktywni po godzinie wyjścia, zamrożony na końcu',
     rows.map(r => r.id), ['konczy', 'gra', 'zamrozony']);
  ok('tylko ostatni jest zamrożony',
     rows[2].frozen === true && rows[0].frozen === false && rows[1].frozen === false);
}

console.log('\n=== SKĄD SIĘ WZIĘLI ===');
{
  const rows = playtimeRows({
    bookings: [bkg({ id: 'w1', source: 'walkin', start: '10:00', stayUntil: '11:00',
                     children: [{ name: 'Julka' }] })],
    dateISO: DZIS, atMin: at(10, 30)
  });
  eq('wejście z ulicy ma własną etykietę', rows[0].sourceLabel, PLAYTIME_SOURCE.walkin);
  eq('ręczna godzina wyjścia rządzi', rows[0].endMin, at(11));
  eq('zostało pół godziny', fmtCountdown(rows[0].remaining), '30:00');
}

console.log('\n=== CO NIE WCHODZI NA LISTĘ ===');
eq('zapis bez potwierdzonej obecności',
   playtimeRows({ regs: [reg({ attended: false })], dateISO: DZIS, atMin: at(11) }).length, 0);
eq('zapis nieopłacony',
   playtimeRows({ regs: [reg({ paid: false })], dateISO: DZIS, atMin: at(11) }).length, 0);
eq('rezerwacja czekająca na decyzję',
   playtimeRows({ bookings: [bkg({ status: 'pending' })], dateISO: DZIS, atMin: at(11) }).length, 0);
eq('rezerwacja odrzucona',
   playtimeRows({ bookings: [bkg({ status: 'rejected' })], dateISO: DZIS, atMin: at(11) }).length, 0);
eq('wpisy z innego dnia',
   playtimeRows({ regs: [reg({ eventDate: '2026-09-11' })], bookings: [bkg({ date: '2026-09-11' })],
     dateISO: DZIS, atMin: at(11) }).length, 0);
eq('pusto nie wywala listy', playtimeRows({ dateISO: DZIS, atMin: at(11) }).length, 0);

console.log('\n=== LICZBA DZIECI, A NIE WIERSZY ===');
{
  const rows = playtimeRows({
    regs: [reg({ qty: 3 })], bookings: [bkg({ qty: 2 })], dateISO: DZIS, atMin: at(11, 30)
  });
  eq('w bawialni jest pięcioro dzieci w dwóch wierszach',
     rows.reduce((n, r) => n + r.qty, 0), 5);
  eq('wiersze', rows.length, 2);
}

console.log(`\n================  ${pass} zaliczonych, ${fail} niezaliczonych  ================\n`);
process.exit(fail ? 1 : 0);
