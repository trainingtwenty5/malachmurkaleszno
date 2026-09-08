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
  clientKey, guestClientKey, paidByClient, paidFor,
  txFromRegistration, txFromBooking, toTransactions,
  dateSeries, rangeLength, lastDays, previousRange, inRange,
  revenueOf, revenueByDay, countByDay, revenuePerBookingByDay, cumulative,
  firstSeen, newClientsByDay, newClientsIn, revenueByWeekday, revenueByLabel,
  settlement, changePct, fmtPct, pctTone, summary, niceTicks, pickLabels,
  quarterOf, quarterRange, monthRange, presetRange, ALL_PRESETS, PRESET_GROUPS,
  normalizeRange, rangeLabel, shortDatePl, dayLabelPl, sameRangeYearAgo,
  comparisonRange, monthGrid, shiftMonth, hitIndex,
  CSV_HEADERS, csvRow, csvTable, childNames, stampToText
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

console.log('\n=== KWOTY W RANKINGU ===');
{
  /* Wiersz rankingu (kolekcja `guests`) musi trafić w ten sam klucz,
     co transakcje — inaczej kwota wylądowałaby przy kimś innym albo znikła. */
  eq('wiersz rankingu z telefonem',
     guestClientKey({ phoneKey: '505849404', phone: '505 849 404', email: 'a@b.pl' }), 'tel:505849404');
  eq('wiersz rankingu bez znormalizowanego klucza bierze telefon',
     guestClientKey({ phoneKey: '', phone: '+48 505-849-404' }), 'tel:505849404');
  /* Ranking wpisuje w `phoneKey` adres e-mail, gdy nie ma telefonu. */
  eq('klucz zrobiony z e-maila nie udaje telefonu',
     guestClientKey({ phoneKey: 'ala_example_pl', phone: '', email: 'ala@example.pl' }),
     'mail:ala@example.pl');
  eq('…nawet gdy w adresie są cyfry (tu było najłatwiej o pomyłkę)',
     guestClientKey({ phoneKey: 'ala123_example_pl', phone: '', email: 'ala123@example.pl' }),
     'mail:ala123@example.pl');
  eq('wiersz bez jakiegokolwiek kontaktu nie ma klucza', guestClientKey({}), '');
}
{
  const txs = toTransactions({
    regs: [
      reg({ total: 90,  paid: true,  phone: '505 849 404' }),
      reg({ id: 'r2', total: 45, paid: true,  phone: '505 849 404' }),
      reg({ id: 'r3', total: 500, paid: false, phone: '505 849 404' })
    ],
    bookings: [bkg({ total: 60, paid: true, phone: '505 849 404' })]
  });
  const map = paidByClient(txs);
  eq('sumuje zajęcia i bawialnię tego samego rodzica',
     paidFor(map, 'tel:505849404').total, 195);
  eq('liczy tylko opłacone pozycje', paidFor(map, 'tel:505849404').count, 3);
  eq('kwota trafia do wiersza rankingu przez wspólny klucz',
     paidFor(map, guestClientKey({ phoneKey: '505849404' })).total, 195);
  eq('klient bez ani jednej opłaty dostaje zero, nie undefined',
     paidFor(map, 'tel:111111111'), { total: 0, count: 0 });
  eq('brak danych finansowych też daje zero', paidFor(null, 'tel:505849404'), { total: 0, count: 0 });
  eq('wiersz bez klucza nie zbiera cudzych kwot', paidFor(map, ''), { total: 0, count: 0 });
}
eq('anonimowe wejście z ulicy nie tworzy klienta w zestawieniu kwot',
   paidByClient(toTransactions({ bookings: [bkg({ phone: '', email: '', total: 40, paid: true })] })).size, 0);

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

/* ================================================== GOTOWE ZAKRESY ==== */
console.log('\n=== SKRÓTY OKRESÓW ===');
/* 2026-09-07 to poniedziałek. */
eq('dzisiaj', presetRange('today', '2026-09-07'), { from: '2026-09-07', to: '2026-09-07' });
eq('wczoraj', presetRange('yesterday', '2026-09-07'), { from: '2026-09-06', to: '2026-09-06' });
eq('wczoraj przez przełom miesiąca',
   presetRange('yesterday', '2026-09-01'), { from: '2026-08-31', to: '2026-08-31' });
eq('ostatnie 7 dni', presetRange('last7', '2026-09-07'), { from: '2026-09-01', to: '2026-09-07' });
eq('ostatnie 365 dni', rangeLength(...Object.values(presetRange('last365', '2026-09-07'))), 365);
eq('ten tydzień do dziś (poniedziałek → sam poniedziałek)',
   presetRange('wtd', '2026-09-07'), { from: '2026-09-07', to: '2026-09-07' });
eq('ten tydzień do dziś (niedziela → cały tydzień)',
   presetRange('wtd', '2026-09-13'), { from: '2026-09-07', to: '2026-09-13' });
eq('ten miesiąc do dziś', presetRange('mtd', '2026-09-07'), { from: '2026-09-01', to: '2026-09-07' });
eq('ten kwartał do dziś', presetRange('qtd', '2026-09-07'), { from: '2026-07-01', to: '2026-09-07' });
eq('ten rok do dziś', presetRange('ytd', '2026-09-07'), { from: '2026-01-01', to: '2026-09-07' });
eq('nieznany skrót nie udaje, że coś wie', presetRange('bzdura', '2026-09-07'), null);

console.log('\n=== KWARTAŁY ===');
eq('wrzesień to III kwartał', quarterOf('2026-09-07'), 3);
eq('styczeń to I kwartał', quarterOf('2026-01-01'), 1);
eq('grudzień to IV kwartał', quarterOf('2026-12-31'), 4);
eq('I kwartał', quarterRange(2026, 1), { from: '2026-01-01', to: '2026-03-31' });
eq('II kwartał', quarterRange(2026, 2), { from: '2026-04-01', to: '2026-06-30' });
eq('III kwartał', quarterRange(2026, 3), { from: '2026-07-01', to: '2026-09-30' });
eq('IV kwartał kończy się na sylwestrze, nie w styczniu',
   quarterRange(2026, 4), { from: '2026-10-01', to: '2026-12-31' });
eq('luty w roku przestępnym ma 29 dni', quarterRange(2024, 1).to, '2024-03-31');
eq('kwartał z poprzedniego roku', presetRange('q3prev', '2026-09-07'),
   { from: '2025-07-01', to: '2025-09-30' });
eq('miesiąc: luty przestępny', monthRange(2024, 2), { from: '2024-02-01', to: '2024-02-29' });
eq('miesiąc: luty zwykły', monthRange(2026, 2), { from: '2026-02-01', to: '2026-02-28' });
eq('miesiąc: grudzień przeskakuje rok', monthRange(2026, 12), { from: '2026-12-01', to: '2026-12-31' });

console.log('\n=== ZAKRES Z KALENDARZA ===');
eq('daty w złej kolejności prostują się same',
   normalizeRange('2026-09-30', '2026-09-01'), { from: '2026-09-01', to: '2026-09-30' });
eq('kliknięcie jednego dnia daje zakres jednodniowy',
   normalizeRange('2026-09-07', null), { from: '2026-09-07', to: '2026-09-07' });
eq('nic nie wybrane', normalizeRange(null, null), null);

console.log('\n=== NAZWA OKRESU NA PRZYCISKU ===');
eq('skrót pokazuje się po nazwie, nie jako surowe daty',
   rangeLabel(presetRange('last30', '2026-09-07'), '2026-09-07'), 'Ostatnie: 30 dni');
eq('dzisiaj', rangeLabel(presetRange('today', '2026-09-07'), '2026-09-07'), 'Dzisiaj');
eq('kwartał', rangeLabel(quarterRange(2026, 3), '2026-09-07'), 'Kwartały: iii kwartał');
eq('własny zakres pokazuje daty',
   rangeLabel({ from: '2026-09-02', to: '2026-09-05' }, '2026-09-07'), '2 wrz 2026 – 5 wrz 2026');
eq('jeden dzień nie powtarza daty dwa razy',
   rangeLabel({ from: '2026-09-02', to: '2026-09-02' }, '2026-09-07'), '2 wrz 2026');
eq('brak zakresu', rangeLabel(null, '2026-09-07'), '—');
eq('krótka data', shortDatePl('2026-09-07'), '7 wrz 2026');
eq('data na oś i do dymka — bez roku', dayLabelPl('2026-08-31'), '31 sie');
eq('każdy skrót ma nazwę', ALL_PRESETS.every(p => p.id && p.label), true);
eq('każdy skrót daje się rozwinąć',
   ALL_PRESETS.every(p => presetRange(p.id, '2026-09-07') !== null), true);

console.log('\n=== OKRES PORÓWNAWCZY ===');
eq('domyślnie poprzedni okres', comparisonRange({ from: '2026-09-01', to: '2026-09-30' }, 'prev'),
   { from: '2026-08-02', to: '2026-08-31' });
eq('ten sam okres rok temu', comparisonRange({ from: '2026-09-01', to: '2026-09-30' }, 'year'),
   { from: '2025-09-01', to: '2025-09-30' });
eq('bez porównania', comparisonRange({ from: '2026-09-01', to: '2026-09-30' }, 'none'), null);
eq('29 lutego cofnięte o rok nie ucieka na marzec',
   sameRangeYearAgo({ from: '2024-02-29', to: '2024-02-29' }),
   { from: '2023-02-28', to: '2023-02-28' });
eq('porównanie zachowuje długość okresu',
   rangeLength(...Object.values(comparisonRange(presetRange('last7', '2026-09-07'), 'prev'))), 7);

console.log('\n=== SIATKA KALENDARZA ===');
{
  const wrzesien = monthGrid(2026, 9);
  eq('wrzesień 2026 mieści się w pięciu tygodniach', wrzesien.length, 5);
  eq('każdy tydzień ma siedem dni', wrzesien.every(w => w.length === 7), true);
  eq('tydzień zaczyna się w poniedziałek', wrzesien[0][0].iso, '2026-08-31');
  eq('pierwszy dzień miesiąca nie jest oznaczony jako obcy',
     wrzesien.flat().find(c => c.iso === '2026-09-01').outside, false);
  eq('dzień z sąsiedniego miesiąca jest oznaczony',
     wrzesien[0][0].outside, true);
  eq('siatka pokrywa cały miesiąc',
     wrzesien.flat().filter(c => !c.outside).length, 30);
  /* Luty 2027 zaczyna się w poniedziałek i ma 28 dni — dokładnie cztery
     tygodnie. Szósty (ani piąty) wiersz nie ma prawa się pojawić. */
  eq('luty równy czterem tygodniom nie dostaje pustego wiersza', monthGrid(2027, 2).length, 4);
}
eq('miesiąc w przód', shiftMonth(2026, 12, 1), { year: 2027, month: 1 });
eq('miesiąc wstecz', shiftMonth(2026, 1, -1), { year: 2025, month: 12 });
eq('trzy miesiące w przód', shiftMonth(2026, 11, 3), { year: 2027, month: 2 });

console.log('\n=== TRAFIENIE KURSOREM W PUNKT WYKRESU ===');
{
  /* Wykres liniowy: 5 punktów rozłożonych co 50 px od x=50 do x=250. */
  const g = { padL: 50, iw: 200, count: 5 };
  eq('lewa krawędź to pierwszy punkt', hitIndex(50, g), 0);
  eq('prawa krawędź to ostatni punkt', hitIndex(250, g), 4);
  eq('środek', hitIndex(150, g), 2);
  eq('kursor bliżej trzeciego punktu', hitIndex(160, g), 2);
  eq('kursor przed wykresem nie wychodzi poza zakres', hitIndex(-100, g), 0);
  eq('kursor za wykresem też nie', hitIndex(9999, g), 4);
  eq('jeden punkt zawsze trafia w siebie', hitIndex(123, { padL: 50, iw: 200, count: 1 }), 0);
  eq('pusty wykres nie wysypuje się na dzieleniu', hitIndex(60, { padL: 50, iw: 200, count: 0 }), 0);
}
{
  /* Słupki: 7 słupków po ~28.6 px. Trafienie liczy się polem słupka,
     a nie odległością od jego środka. */
  const g = { padL: 50, iw: 200, count: 7, mode: 'bar' };
  eq('pierwszy słupek', hitIndex(55, g), 0);
  eq('ostatni słupek', hitIndex(245, g), 6);
  eq('kursor tuż za prawą krawędzią nie wypada poza listę', hitIndex(251, g), 6);
}

/* ====================================================== EKSPORT CSV ==== */
console.log('\n=== ARKUSZ: KOMPLET DANYCH O ZGŁOSZENIU ===');
{
  const t = txFromRegistration(reg({
    id: 'abc12345xyz', eventStart: '10:00', eventEnd: '11:00', stayUntil: '',
    attended: true, countedInRanking: true, paymentMethod: 'Przelew bankowy',
    note: 'alergia\n  na orzechy', status: 'confirmed',
    children: [{ firstName: 'Zosia', lastName: 'K' }, { firstName: 'Antek', lastName: 'K' }]
  }));
  const row = csvRow(t);
  const at = name => row[CSV_HEADERS.indexOf(name)];

  eq('nagłówek i wiersz mają tyle samo kolumn', row.length, CSV_HEADERS.length);
  ok('arkusz niesie znacznie więcej niż samą kwotę (23 kolumny)', CSV_HEADERS.length >= 23,
     `kolumn: ${CSV_HEADERS.length}`);
  eq('data', at('Data'), '2026-09-10');
  eq('dzień tygodnia liczy się z daty', at('Dzień tygodnia'), 'czwartek');
  eq('godzina od', at('Od'), '10:00');
  eq('godzina do', at('Do'), '11:00');
  eq('źródło', at('Źródło'), 'zajęcia');
  eq('numer rezerwacji — ten sam, co klient dostał', at('Nr rezerwacji'), 'ABC12345');
  eq('nazwa zajęć', at('Pozycja'), 'Logosensoryka');
  eq('status po polsku', at('Status'), 'potwierdzony');
  eq('liczba dzieci', at('Liczba dzieci'), 2);
  eq('imiona dzieci w jednej komórce', at('Dzieci'), 'Zosia K, Antek K');
  eq('rodzic', at('Rodzic'), '');
  eq('telefon — po to obsługa otwiera ten plik', at('Telefon'), '505 849 404');
  eq('e-mail', at('E-mail'), 'daniel@example.com');
  eq('cena za dziecko z przecinkiem, żeby Excel widział liczbę', at('Cena za dziecko'), '45,00');
  eq('kwota', at('Kwota'), '90,00');
  eq('opłacone', at('Opłacone'), 'tak');
  eq('przyszedł', at('Przyszedł'), 'tak');
  eq('w rankingu', at('W rankingu'), 'tak');
  eq('metoda płatności', at('Płatność / taryfa'), 'Przelew bankowy');
  /* Uwagi rodzica bywają wieloliniowe — w CSV łamana linia rozwaliłaby wiersz. */
  eq('uwagi rodzica spłaszczone do jednej linii', at('Uwagi rodzica'), 'alergia na orzechy');
}
{
  const t = txFromBooking(bkg({
    id: 'zzz99999abc', start: '10:00', stayUntil: '13:30', durationLabel: '2 godziny',
    tariff: 'weekend', status: 'accepted', countedInRanking: false,
    adminNote: 'przyjdą z babcią', children: [{ name: 'Ala' }, { name: 'Ola' }, { name: 'Iga' }]
  }));
  const row = csvRow(t);
  const at = name => row[CSV_HEADERS.indexOf(name)];
  eq('rezerwacja: źródło', at('Źródło'), 'bawialnia');
  eq('rezerwacja: godzina wyjścia bierze ręcznie ustawioną', at('Do'), '13:30');
  eq('rezerwacja: dzieci z pola `name`', at('Dzieci'), 'Ala, Ola, Iga');
  eq('rezerwacja: cena za dziecko liczona z kwoty', at('Cena za dziecko'), '20,00');
  eq('rezerwacja bez wybranej metody: zostaje taryfa', at('Płatność / taryfa'), 'weekend');
  eq('rezerwacja: czas pobytu', at('Czas pobytu'), '2 godziny');
  eq('rezerwacja: uwagi obsługi', at('Uwagi obsługi'), 'przyjdą z babcią');
  /* Przy wstępie do bawialni „przyszedł" nie ma sensu — akceptacja to załatwia. */
  eq('rezerwacja: „przyszedł" nie dotyczy wstępu', at('Przyszedł'), '—');
}
{
  /* Rezerwacja bez `stayUntil` — godzinę wyjścia trzeba wyliczyć z czasu pobytu. */
  const row = csvRow(txFromBooking(bkg({ start: '10:00', duration: '2h', stayUntil: '' })));
  eq('brak godziny wyjścia liczy się z czasu pobytu',
     row[CSV_HEADERS.indexOf('Do')], '12:00');
}
eq('wybrana forma płatności wygrywa z taryfą — po to ją zapisujemy',
   csvRow(txFromBooking(bkg({ paymentMethod: 'Przelew bankowy', tariff: 'weekend' })))[CSV_HEADERS.indexOf('Płatność / taryfa')],
   'Przelew bankowy');
eq('wejście z ulicy ma własną etykietę w arkuszu',
   csvRow(txFromBooking(bkg({ source: 'walkin' })))[CSV_HEADERS.indexOf('Pozycja')],
   'Wejście z ulicy');

console.log('\n=== IMIONA DZIECI: NOWY I STARY KSZTAŁT ZAPISU ===');
eq('nowy kształt (children[])',
   childNames({ children: [{ firstName: 'Zosia', lastName: 'Kowalska' }] }), 'Zosia Kowalska');
eq('rezerwacja (children[].name)', childNames({ children: [{ name: 'Ala' }] }), 'Ala');
eq('archiwalny zapis bez tablicy',
   childNames({ childFirstName: 'Antek', childLastName: 'Nowak' }), 'Antek Nowak');
eq('puste imiona nie zostawiają przecinków',
   childNames({ children: [{ name: 'Ala' }, { name: '' }, { name: 'Iga' }] }), 'Ala, Iga');
eq('brak danych o dzieciach', childNames({}), '');

console.log('\n=== ZNACZNIK CZASU Z BAZY ===');
eq('Timestamp z Firestore (ma toDate)',
   stampToText({ toDate: () => new Date(2026, 8, 7, 14, 30) }), '2026-09-07 14:30');
eq('zwykła data', stampToText(new Date(2026, 0, 2, 9, 5)), '2026-01-02 09:05');
eq('starsze zgłoszenie bez znacznika', stampToText(null), '');
eq('śmieć zamiast daty nie wysypuje eksportu', stampToText('nie-data'), '');

console.log('\n=== ARKUSZ JAKO CAŁOŚĆ ===');
{
  const txs = toTransactions({
    regs: [
      reg({ id: 'r1', eventDate: '2026-09-10', eventStart: '14:00' }),
      reg({ id: 'r2', eventDate: '2026-09-10', eventStart: '09:00' }),
      reg({ id: 'r3', eventDate: '2026-08-01' })
    ],
    bookings: [
      bkg({ id: 'b1', date: '2026-09-11' }),
      bkg({ id: 'b2', date: '2026-09-12', status: 'rejected' })
    ]
  });
  const table = csvTable(txs, { from: '2026-09-01', to: '2026-09-30' });
  eq('pierwszy wiersz to nagłówek', table[0], CSV_HEADERS);
  eq('sierpniowy zapis wypada poza okresem', table.length - 1, 3);
  eq('odrzucona rezerwacja nie trafia do arkusza — tak jak nie trafia na wykres',
     table.slice(1).some(r => r[CSV_HEADERS.indexOf('Nr rezerwacji')] === 'B2'), false);
  eq('wiersze idą po dacie, a w obrębie dnia po godzinie',
     table.slice(1).map(r => `${r[0]} ${r[2]}`),
     ['2026-09-10 09:00', '2026-09-10 14:00', '2026-09-11 10:00']);
  eq('każdy wiersz ma komplet kolumn',
     table.every(r => r.length === CSV_HEADERS.length), true);
}
eq('pusty okres daje sam nagłówek',
   csvTable(toTransactions({ regs: [reg()] }), { from: '2020-01-01', to: '2020-01-31' }).length, 1);

console.log(`\n================  ${pass} zaliczonych, ${fail} niezaliczonych  ================\n`);
process.exit(fail ? 1 : 0);
