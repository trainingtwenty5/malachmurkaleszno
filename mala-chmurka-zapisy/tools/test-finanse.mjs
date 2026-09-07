/* ==========================================================================
   Mała Chmurka — testy zakładki „Finanse"
   --------------------------------------------------------------------------
   Panel finansowy ma jedną odpowiedzialność: powiedzieć prawdę o pieniądzach.
   Sprawdzamy więc rzeczy, w których najłatwiej o cichą pomyłkę:
     • że zapis na zajęcia i rezerwacja wstępu liczą się tak samo,
     • że przychodem jest wyłącznie to, co odhaczone jako „opłacone",
     • że odrzucona rezerwacja nie podbija sprzedaży,
     • że „nowy klient" liczy się raz w życiu, a nie raz na okres,
     • że okres porównawczy ma dokładnie tę samą długość.

   URUCHOMIENIE:   node tools/test-finanse.mjs
   ========================================================================== */

import {
  clientKey, txFromRegistration, txFromBooking, toTransactions,
  dateSeries, rangeLength, lastDays, previousRange, inRange,
  revenueOf, revenueByDay, countByDay, revenuePerBookingByDay, cumulative,
  firstSeen, newClientsByDay, newClientsIn, revenueByWeekday, revenueByLabel,
  settlement, changePct, fmtPct, pctTone, summary, niceTicks, pickLabels
} from '../assets/mc-finanse.js';

let pass = 0, fail = 0;
const ok = (name, cond, dump = '') => {
  if (cond) { console.log('  OK   ' + name); pass++; }
  else { console.log('  FAIL ' + name + (dump ? '\n         ' + dump : '')); fail++; }
};
const eq = (name, got, want) =>
  ok(`${name} → ${JSON.stringify(want)}`, JSON.stringify(got) === JSON.stringify(want),
     `dostałem: ${JSON.stringify(got)}`);

/* -------------------------------------------------------------- ATRAPY --- */
const reg = o => ({
  id: 'r1', eventTitle: 'Logosensoryka', eventDate: '2026-09-10',
  qty: 2, unitPrice: 45, total: 90, paid: true,
  phone: '505 849 404', email: 'daniel@example.com', ...o
});
const bkg = o => ({
  id: 'b1', date: '2026-09-10', start: '10:00', qty: 3, total: 60,
  status: 'accepted', paid: true,
  phone: '600 100 200', email: 'ola@example.com', ...o
});

/* ================================================ WSPÓLNA TRANSAKCJA ==== */
console.log('\n=== ZAPIS I REZERWACJA W JEDNYM KSZTAŁCIE ===');
{
  const t = txFromRegistration(reg());
  eq('zapis: źródło', t.source, 'zajecia');
  eq('zapis: etykieta to nazwa zajęć', t.label, 'Logosensoryka');
  eq('zapis: data z terminu zajęć', t.date, '2026-09-10');
  eq('zapis: kwota', t.total, 90);
  eq('zapis: liczba dzieci', t.qty, 2);
}
{
  /* Stare zapisy nie mają pola `total` — panel musi umieć je policzyć sam. */
  const t = txFromRegistration(reg({ total: undefined, unitPrice: 45, qty: 3 }));
  eq('stary zapis bez `total`: cena × dzieci', t.total, 135);
}
eq('zapis bez nazwy zajęć dostaje zastępczą etykietę',
   txFromRegistration(reg({ eventTitle: '' })).label, 'Zajęcia bez nazwy');
{
  const t = txFromBooking(bkg());
  eq('rezerwacja: źródło', t.source, 'bawialnia');
  eq('rezerwacja: etykieta', t.label, 'Wstęp do bawialni');
  eq('rezerwacja: kwota', t.total, 60);
}
{
  const t = txFromBooking(bkg({ source: 'walkin', total: 0 }));
  eq('wejście z ulicy ma własne źródło', t.source, 'wejscie');
  eq('wejście z ulicy ma własną etykietę', t.label, 'Wejście z ulicy');
}

console.log('\n=== KLUCZ KLIENTA ===');
eq('telefon ma pierwszeństwo', clientKey({ phone: '505 849 404', email: 'a@b.pl' }), 'tel:505849404');
eq('ten sam telefon zapisany inaczej to ten sam klient',
   clientKey({ phone: '+48 505-849-404' }), 'tel:505849404');
eq('bez telefonu bierzemy e-mail', clientKey({ email: 'Ala@Example.PL' }), 'mail:ala@example.pl');
eq('bez telefonu i e-maila nie ma klienta', clientKey({}), '');

console.log('\n=== ODRZUCONE REZERWACJE NIE SĄ SPRZEDAŻĄ ===');
{
  const txs = toTransactions({
    regs: [reg()],
    bookings: [bkg(), bkg({ id: 'b2', status: 'rejected', total: 999, paid: true })]
  });
  eq('odrzucona rezerwacja wypada z listy', txs.length, 2);
  eq('i nie podbija przychodu', revenueOf(txs), 150);
}
eq('rezerwacja oczekująca zostaje (może się jeszcze opłacić)',
   toTransactions({ bookings: [bkg({ status: 'pending', paid: false })] }).length, 1);
eq('wpis bez daty wypada — nie ma go gdzie postawić na osi czasu',
   toTransactions({ regs: [reg({ eventDate: '' })] }).length, 0);
eq('transakcje wychodzą posortowane po dacie',
   toTransactions({ regs: [reg({ eventDate: '2026-09-20' }), reg({ eventDate: '2026-09-01' })] })
     .map(t => t.date),
   ['2026-09-01', '2026-09-20']);

/* ============================================================ OKRESY ==== */
console.log('\n=== OKRESY I PORÓWNANIE ===');
eq('„ostatnie 30 dni" to dziś i 29 dni wstecz', lastDays(30, '2026-09-30'),
   { from: '2026-09-01', to: '2026-09-30' });
eq('„ostatnie 7 dni"', lastDays(7, '2026-09-07'), { from: '2026-09-01', to: '2026-09-07' });
eq('zakres jednodniowy', lastDays(1, '2026-09-07'), { from: '2026-09-07', to: '2026-09-07' });
eq('długość zakresu liczy oba końce', rangeLength('2026-09-01', '2026-09-30'), 30);
eq('okres porównawczy kończy się dzień przed wybranym',
   previousRange({ from: '2026-09-01', to: '2026-09-30' }),
   { from: '2026-08-02', to: '2026-08-31' });
eq('okres porównawczy ma tę samą długość',
   rangeLength(...Object.values(previousRange({ from: '2026-09-01', to: '2026-09-30' }))), 30);
eq('zakres przez przełom roku', rangeLength('2025-12-30', '2026-01-02'), 4);
eq('odwrócony zakres daje pustą listę dni', dateSeries('2026-09-10', '2026-09-01'), []);
eq('filtr po zakresie bierze oba końce włącznie',
   inRange(toTransactions({ regs: [
     reg({ eventDate: '2026-08-31' }), reg({ eventDate: '2026-09-01' }),
     reg({ eventDate: '2026-09-30' }), reg({ eventDate: '2026-10-01' })
   ] }), { from: '2026-09-01', to: '2026-09-30' }).length, 2);

/* ========================================================= PRZYCHÓD ==== */
console.log('\n=== PRZYCHÓD LICZY SIĘ TYLKO Z OPŁACONYCH ===');
{
  const txs = toTransactions({
    regs:     [reg({ total: 100, paid: true }), reg({ id: 'r2', total: 500, paid: false })],
    bookings: [bkg({ total: 40, paid: true })]
  });
  eq('nieopłacony zapis nie wchodzi do sprzedaży', revenueOf(txs), 140);
  const s = settlement(txs);
  eq('rozliczenie: wpłynęło', s.paid, 140);
  eq('rozliczenie: do zainkasowania', s.unpaid, 500);
  eq('rozliczenie: ile pozycji czeka na opłatę', s.unpaidCount, 1);
}

console.log('\n=== SZEREGI DZIENNE ===');
{
  const days = dateSeries('2026-09-01', '2026-09-05');
  eq('pięć dni', days.length, 5);
  const txs = toTransactions({
    regs: [
      reg({ eventDate: '2026-09-01', total: 100, paid: true }),
      reg({ id: 'r2', eventDate: '2026-09-01', total: 50,  paid: true }),
      reg({ id: 'r3', eventDate: '2026-09-04', total: 80,  paid: false })
    ]
  });
  eq('przychód dzień po dniu', revenueByDay(txs, days), [150, 0, 0, 0, 0]);
  eq('liczba zamówień liczy też nieopłacone', countByDay(txs, days), [2, 0, 0, 1, 0]);
  eq('przychód na zamówienie: dzień bez zamówień to zero, nie dzielenie przez zero',
     revenuePerBookingByDay(txs, days), [75, 0, 0, 0, 0]);
  eq('narastająco', cumulative(revenueByDay(txs, days)), [150, 150, 150, 150, 150]);
  eq('transakcja spoza zakresu nie wchodzi do szeregu',
     revenueByDay(toTransactions({ regs: [reg({ eventDate: '2026-08-30', total: 999 })] }), days),
     [0, 0, 0, 0, 0]);
}
eq('narastająco z pustego szeregu', cumulative([]), []);

console.log('\n=== DZIEŃ TYGODNIA ===');
{
  /* 2026-09-07 to poniedziałek, 2026-09-12 to sobota. */
  const txs = toTransactions({ regs: [
    reg({ eventDate: '2026-09-07', total: 100, paid: true }),
    reg({ id: 'r2', eventDate: '2026-09-12', total: 300, paid: true }),
    reg({ id: 'r3', eventDate: '2026-09-12', total: 200, paid: false })
  ] });
  eq('tydzień zaczyna się w poniedziałek, sobota sumuje tylko opłacone',
     revenueByWeekday(txs), [100, 0, 0, 0, 0, 300, 0]);
}

console.log('\n=== PRZYCHÓD WG ZAJĘĆ ===');
{
  const rows = revenueByLabel(toTransactions({
    regs: [
      reg({ eventTitle: 'Logosensoryka', total: 90, paid: true, qty: 2 }),
      reg({ id: 'r2', eventTitle: 'Logosensoryka', total: 45, paid: true, qty: 1 }),
      reg({ id: 'r3', eventTitle: 'Rytmika', total: 300, paid: true, qty: 4 }),
      reg({ id: 'r4', eventTitle: 'Rytmika', total: 999, paid: false })
    ],
    bookings: [bkg({ total: 60, paid: true, qty: 3 })]
  }));
  eq('najwyższy przychód na górze', rows.map(r => r.label),
     ['Rytmika', 'Logosensoryka', 'Wstęp do bawialni']);
  eq('sumuje kwoty w obrębie nazwy', rows.find(r => r.label === 'Logosensoryka').total, 135);
  eq('liczy też dzieci', rows.find(r => r.label === 'Logosensoryka').kids, 3);
  eq('nieopłacone nie wchodzi', rows.find(r => r.label === 'Rytmika').total, 300);
}
eq('wejście z ulicy (kwota zero) nie zaśmieca wykresu o przychodzie',
   revenueByLabel(toTransactions({ bookings: [bkg({ source: 'walkin', total: 0, paid: true })] })), []);

console.log('\n=== NOWI KLIENCI ===');
{
  const all = toTransactions({ regs: [
    reg({ eventDate: '2026-08-15', phone: '505 849 404' }),           // pierwszy raz w sierpniu
    reg({ id: 'r2', eventDate: '2026-09-10', phone: '505 849 404' }), // ten sam rodzic wraca
    reg({ id: 'r3', eventDate: '2026-09-10', phone: '600 100 200' })  // pierwszy raz we wrześniu
  ] });
  const seen = firstSeen(all);
  eq('data pierwszej wizyty stałego klienta', seen.get('tel:505849404'), '2026-08-15');
  eq('wracający klient nie liczy się drugi raz',
     newClientsIn(all, { from: '2026-09-01', to: '2026-09-30' }), 1);
  eq('w sierpniu był nowy', newClientsIn(all, { from: '2026-08-01', to: '2026-08-31' }), 1);
  eq('nowi klienci dzień po dniu',
     newClientsByDay(all, dateSeries('2026-09-09', '2026-09-11')), [0, 1, 0]);
}
eq('anonimowy wpis (bez telefonu i e-maila) nie jest klientem',
   newClientsIn(toTransactions({ bookings: [bkg({ phone: '', email: '', source: 'walkin' })] }),
                { from: '2026-09-01', to: '2026-09-30' }), 0);

console.log('\n=== ZMIANA WZGLĘDEM POPRZEDNIEGO OKRESU ===');
eq('wzrost o połowę', changePct(150, 100), 50);
eq('spadek o jedną piątą', changePct(80, 100), -20);
eq('bez zmian', changePct(100, 100), 0);
eq('z zera na zero to nie jest wzrost', changePct(0, 0), 0);
eq('z zera na cokolwiek — nie ma do czego porównać', changePct(120, 0), null);
eq('plakietka wzrostu', fmtPct(changePct(150, 100)), '+50%');
eq('plakietka spadku używa minusa typograficznego', fmtPct(changePct(80, 100)), '−20%');
eq('plakietka bez porównania', fmtPct(null), '—');
eq('ton plakietki: wzrost', pctTone(12), 'is-up');
eq('ton plakietki: spadek', pctTone(-3), 'is-down');
eq('ton plakietki: bez zmian', pctTone(0), 'is-flat');
eq('ton plakietki: brak porównania', pctTone(null), 'is-flat');

console.log('\n=== KOMPLET LICZB DLA OKRESU ===');
{
  const all = toTransactions({
    regs: [
      reg({ eventDate: '2026-09-10', total: 100, paid: true,  qty: 2, phone: '111 111 111' }),
      reg({ id: 'r2', eventDate: '2026-09-12', total: 200, paid: false, qty: 1, phone: '222 222 222' })
    ],
    bookings: [bkg({ date: '2026-09-11', total: 50, paid: true, qty: 3, phone: '333 333 333' })]
  });
  const s = summary(all, { from: '2026-09-01', to: '2026-09-30' });
  eq('przychód: tylko opłacone', s.revenue, 150);
  eq('zamówienia: wszystkie, także nieopłacone', s.orders, 3);
  eq('średnia wartość transakcji liczy się z opłaconych', s.avgOrder, 75);
  eq('przychód na zamówienie dzieli przez wszystkie zamówienia', s.perOrder, 50);
  eq('dzieci', s.kids, 6);
  eq('nowi klienci', s.newClients, 3);
  eq('pusty okres nie wysypuje się na dzieleniu przez zero',
     summary(all, { from: '2026-01-01', to: '2026-01-31' }).avgOrder, 0);
}

/* ============================================================= OSIE ==== */
console.log('\n=== PODZIAŁKA OSI Y ===');
eq('pusty wykres ma podziałkę 0–1', niceTicks(0), [0, 1]);
eq('137,50 zł zaokrągla się do czytelnych pięćdziesiątek', niceTicks(137.5), [0, 50, 100, 150]);
eq('maksimum zawsze mieści się pod górną kreską', niceTicks(137.5).at(-1) >= 137.5, true);
eq('trzy zamówienia', niceTicks(3), [0, 1, 2, 3]);
eq('podziałka zaczyna się od zera', niceTicks(9876)[0], 0);
ok('duże kwoty też mieszczą się pod górną kreską', niceTicks(9876).at(-1) >= 9876,
   `dostałem: ${niceTicks(9876).at(-1)}`);

console.log('\n=== PODPISY POD OSIĄ X ===');
eq('krótki szereg podpisuje każdy dzień',
   pickLabels(dateSeries('2026-09-01', '2026-09-03')).map(l => l.i), [0, 1, 2]);
eq('długi szereg dostaje cztery podpisy, od pierwszego do ostatniego dnia',
   pickLabels(dateSeries('2026-09-01', '2026-09-30')).map(l => l.i), [0, 10, 19, 29]);
eq('pusty szereg nie ma podpisów', pickLabels([]), []);

console.log(`\n================  ${pass} zaliczonych, ${fail} niezaliczonych  ================\n`);
process.exit(fail ? 1 : 0);
