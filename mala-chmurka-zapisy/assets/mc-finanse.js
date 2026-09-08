/* ==========================================================================
   Mała Chmurka — zakładka „Finanse" w panelu admina.
   --------------------------------------------------------------------------
   Dwa zupełnie różne źródła pieniędzy — zapisy na zajęcia (`registrations`)
   i rezerwacje wstępu do bawialni (`bookings`, razem z wejściami z ulicy) —
   sprowadzamy tu do jednego, wspólnego kształtu „transakcji". Dopiero na nim
   liczą się wszystkie kafelki i wykresy. Dzięki temu nie ma dwóch równoległych
   sposobów liczenia przychodu, które prędzej czy później by się rozjechały.

   Cały plik jest czysty: bez Firebase, bez `document` przy ładowaniu modułu.
   Rysowanie wykresów siedzi na końcu i sięga po DOM dopiero wewnątrz funkcji,
   żeby samą matematykę dało się przetestować w Node
   (`node tools/test-finanse.mjs`).
   ========================================================================== */

import { isoDate, parseDate, addDays, normPhone, DAY_NAMES, fmtMin,
         bookingEndMin, orderRef } from './mc-common.js';

/* Kolory wykresów — z palety strony, nie z niczego nowego.
   `now` to okres wybrany w filtrze, `prev` to ten sam okres cofnięty wstecz. */
export const CHART = {
  now:  '#3E7C89',   /* --brand-deep */
  prev: '#A9C6DD',   /* --sky        */
  bar:  '#3E7C89',
  grid: '#EDE4D6'
};

/* ==========================================================================
   1. WSPÓLNY KSZTAŁT TRANSAKCJI
   ========================================================================== */

/**
 * Klucz klienta. Ta sama zasada, co w rankingu wizyt: najpierw telefon
 * (rodzic podaje go zawsze i wpisuje tak samo), potem e-mail. Bez tego
 * „nowi klienci" liczyliby od nowa każdą literówkę w adresie.
 */
export function clientKey(o) {
  const phone = normPhone(o.phone || o.phoneKey);
  if (phone) return 'tel:' + phone;
  const mail = String(o.email || '').trim().toLowerCase();
  if (mail) return 'mail:' + mail;
  return '';
}

/**
 * Klucz klienta dla wiersza z rankingu (kolekcja `guests`).
 *
 * Osobna funkcja, a nie samo `clientKey`, przez jeden szczegół: ranking trzyma
 * identyfikator w polu `phoneKey`, ale gdy klient nie podał telefonu, wpisuje
 * tam adres e-mail z zamienionymi znakami (`ala123@example.pl` →
 * `ala123_example_pl`). Przepuszczenie tego przez `normPhone` zostawiłoby
 * z adresu same cyfry i zrobiło z „ala123…" telefon o numerze 123 — kwota
 * nigdy nie trafiłaby do właściwego wiersza. Prawdziwy `phoneKey` to zawsze
 * same cyfry, więc po tym go poznajemy.
 */
export function guestClientKey(g) {
  const raw = String(g.phoneKey || '');
  const phone = /^\d+$/.test(raw) ? raw : normPhone(g.phone);
  if (phone) return 'tel:' + phone;
  const mail = String(g.email || '').trim().toLowerCase();
  if (mail) return 'mail:' + mail;
  return '';
}

/** Zapis na zajęcia → transakcja. */
export function txFromRegistration(r) {
  const qty = Math.max(1, Number(r.qty) || 1);
  return {
    id:     r.id || '',
    source: 'zajecia',
    label:  String(r.eventTitle || 'Zajęcia bez nazwy'),
    date:   r.eventDate || '',
    qty,
    /* `total` liczy się przy zapisie; starsze rekordy mają samą cenę
       jednostkową, więc mnożymy ją w locie zamiast pokazywać zero. */
    total:  Number(r.total) || (Number(r.unitPrice) || 0) * qty,
    paid:   !!r.paid,
    client: clientKey(r),
    /* Referencja do rekordu z bazy. Wykresom wystarczają pola wyżej, ale
       eksport do CSV ma dać obsłudze WSZYSTKO, co o zgłoszeniu wiemy —
       telefon, uwagi, godziny. Trzymamy wskaźnik, nie kopię. */
    raw:    r
  };
}

/**
 * Rezerwacja wstępu → transakcja. Wejścia z ulicy (`source: 'walkin'`)
 * dostają własną etykietę, bo w rozbiciu na źródła to zupełnie inna sprzedaż
 * niż zaplanowana rezerwacja.
 */
export function txFromBooking(b) {
  const walkin = b.source === 'walkin';
  return {
    id:     b.id || '',
    source: walkin ? 'wejscie' : 'bawialnia',
    label:  walkin ? 'Wejście z ulicy' : 'Wstęp do bawialni',
    date:   b.date || '',
    qty:    Math.max(1, Number(b.qty) || 1),
    total:  Number(b.total) || 0,
    paid:   !!b.paid,
    client: clientKey(b),
    raw:    b
  };
}

/**
 * Wszystko razem, posortowane po dacie.
 * Odrzucone rezerwacje wypadają — nikt za nie nie zapłacił i nie zapłaci,
 * więc w finansach nie mają czego szukać (widać je w zakładce 5).
 */
export function toTransactions({ regs = [], bookings = [] } = {}) {
  return [
    ...regs.map(txFromRegistration),
    ...bookings.filter(b => (b.status || 'pending') !== 'rejected').map(txFromBooking)
  ].filter(t => t.date).sort((a, b) => a.date.localeCompare(b.date));
}

/* ==========================================================================
   2. OKRESY
   ========================================================================== */

/** Lista dni od `fromISO` do `toISO` włącznie. */
export function dateSeries(fromISO, toISO) {
  const out = [];
  if (!fromISO || !toISO || fromISO > toISO) return out;
  for (let d = parseDate(fromISO), end = parseDate(toISO); d <= end; d = addDays(d, 1)) {
    out.push(isoDate(d));
  }
  return out;
}

/** Liczba dni w zakresie (włącznie z oboma końcami). */
export const rangeLength = (fromISO, toISO) => dateSeries(fromISO, toISO).length;

/**
 * Okres kończący się dziś. `days: 30` to „ostatnie 30 dni", czyli dziś
 * i 29 dni wstecz — tak, jak liczy to każdy panel sprzedażowy.
 */
export function lastDays(days, todayISO) {
  const to = todayISO;
  const from = isoDate(addDays(parseDate(to), -(Math.max(1, days) - 1)));
  return { from, to };
}

/** Ten sam co do długości okres tuż przed wybranym — do porównania „o ile lepiej". */
export function previousRange({ from, to }) {
  const len = rangeLength(from, to);
  const prevTo = isoDate(addDays(parseDate(from), -1));
  return { from: isoDate(addDays(parseDate(prevTo), -(len - 1))), to: prevTo };
}

/** Transakcje z zakresu dat. */
export const inRange = (txs, { from, to }) =>
  txs.filter(t => t.date >= from && t.date <= to);

/* --------------------------------------------------------------------------
   GOTOWE ZAKRESY
   Obsługa nie liczy dat w pamięci — myśli kategoriami „wczoraj", „ten
   miesiąc", „trzeci kwartał". Każdy z tych skrótów rozwijamy tu na zwykłą
   parę { from, to }, żeby reszta panelu znała tylko jeden kształt okresu.
   -------------------------------------------------------------------------- */

const dayOf   = iso => parseDate(iso);
const shift   = (iso, n) => isoDate(addDays(parseDate(iso), n));
/** Poniedziałek tygodnia, w którym leży data — tydzień zaczynamy po polsku. */
const mondayOf = iso => {
  const d = parseDate(iso);
  return isoDate(addDays(d, -((d.getDay() + 6) % 7)));
};
const firstOfMonth = iso => iso.slice(0, 8) + '01';
/** Kwartał (1–4), w którym leży data. */
export const quarterOf = iso => Math.floor((Number(iso.slice(5, 7)) - 1) / 3) + 1;

/** Pierwszy i ostatni dzień kwartału. */
export function quarterRange(year, q) {
  const m = (q - 1) * 3 + 1;
  const from = `${year}-${String(m).padStart(2, '0')}-01`;
  /* Ostatni dzień = dzień przed pierwszym dniem następnego kwartału.
     Prościej i pewniej niż tablica długości miesięcy z lutym w tle. */
  const nextY = q === 4 ? year + 1 : year;
  const nextM = q === 4 ? 1 : m + 3;
  return { from, to: shift(`${nextY}-${String(nextM).padStart(2, '0')}-01`, -1) };
}

/** Pierwszy i ostatni dzień miesiąca. */
export function monthRange(year, month) {
  const from = `${year}-${String(month).padStart(2, '0')}-01`;
  const nextY = month === 12 ? year + 1 : year;
  const nextM = month === 12 ? 1 : month + 1;
  return { from, to: shift(`${nextY}-${String(nextM).padStart(2, '0')}-01`, -1) };
}

/**
 * Rozwija nazwę skrótu na zakres dat.
 * Zwraca `null` przy nieznanej nazwie — wywołujący sam decyduje, co wtedy,
 * zamiast dostawać po cichu dzisiejszą datę.
 */
export function presetRange(id, todayISO) {
  const t = todayISO;
  const y = Number(t.slice(0, 4));
  switch (id) {
    case 'today':      return { from: t, to: t };
    case 'yesterday':  return { from: shift(t, -1), to: shift(t, -1) };
    case 'last7':      return lastDays(7, t);
    case 'last14':     return lastDays(14, t);
    case 'last30':     return lastDays(30, t);
    case 'last90':     return lastDays(90, t);
    case 'last365':    return lastDays(365, t);
    /* „Do dzisiaj" — od początku okresu do dziś włącznie. */
    case 'wtd':        return { from: mondayOf(t), to: t };
    case 'mtd':        return { from: firstOfMonth(t), to: t };
    case 'qtd':        return { from: quarterRange(y, quarterOf(t)).from, to: t };
    case 'ytd':        return { from: `${y}-01-01`, to: t };
    case 'q1': case 'q2': case 'q3': case 'q4':
      return quarterRange(y, Number(id[1]));
    /* Kwartały poprzedniego roku — przy styczniowym zamknięciu roku
       najczęściej patrzy się właśnie na nie. */
    case 'q1prev': case 'q2prev': case 'q3prev': case 'q4prev':
      return quarterRange(y - 1, Number(id[1]));
    default:           return null;
  }
}

/** Menu skrótów: nagłówek grupy i pozycje. Kolejność jak w panelu. */
export const PRESET_GROUPS = [
  { id: 'today',     label: 'Dzisiaj' },
  { id: 'yesterday', label: 'Wczoraj' },
  { label: 'Ostatnie', items: [
    { id: 'last7',   label: '7 dni' },
    { id: 'last14',  label: '14 dni' },
    { id: 'last30',  label: '30 dni' },
    { id: 'last90',  label: '90 dni' },
    { id: 'last365', label: '365 dni' }
  ] },
  { label: 'Do dzisiaj', items: [
    { id: 'wtd', label: 'Ten tydzień' },
    { id: 'mtd', label: 'Ten miesiąc' },
    { id: 'qtd', label: 'Ten kwartał' },
    { id: 'ytd', label: 'Ten rok' }
  ] },
  { label: 'Kwartały', items: [
    { id: 'q1', label: 'I kwartał' },
    { id: 'q2', label: 'II kwartał' },
    { id: 'q3', label: 'III kwartał' },
    { id: 'q4', label: 'IV kwartał' },
    { id: 'q1prev', label: 'I kwartał — rok wcześniej' },
    { id: 'q2prev', label: 'II kwartał — rok wcześniej' },
    { id: 'q3prev', label: 'III kwartał — rok wcześniej' },
    { id: 'q4prev', label: 'IV kwartał — rok wcześniej' }
  ] }
];

/** Wszystkie skróty spłaszczone do jednej listy — do szukania nazwy zakresu. */
export const ALL_PRESETS = PRESET_GROUPS.flatMap(g => g.items || [g]);

/** Data od–do w dowolnej kolejności → poprawny zakres. */
export function normalizeRange(a, b) {
  if (!a && !b) return null;
  const from = a || b, to = b || a;
  return from <= to ? { from, to } : { from: to, to: from };
}

/**
 * Nazwa zakresu do wyświetlenia na przycisku.
 * Najpierw sprawdzamy, czy to któryś ze skrótów — „Ostatnie 30 dni" czyta się
 * lepiej niż „09.08.2026 – 07.09.2026" i od razu mówi, że okres jedzie z dniem.
 */
export function rangeLabel(range, todayISO) {
  if (!range) return '—';
  const hit = ALL_PRESETS.find(p => {
    const r = presetRange(p.id, todayISO);
    return r && r.from === range.from && r.to === range.to;
  });
  if (hit) {
    const group = PRESET_GROUPS.find(g => (g.items || []).includes(hit));
    return group && group.label ? `${group.label}: ${hit.label.toLowerCase()}` : hit.label;
  }
  if (range.from === range.to) return shortDatePl(range.from);
  return `${shortDatePl(range.from)} – ${shortDatePl(range.to)}`;
}

/** '2026-09-07' → '7 wrz 2026'. Krótko, bez zer wiodących. */
export function shortDatePl(iso) {
  if (!iso) return '—';
  const d = parseDate(iso);
  return `${d.getDate()} ${MONTHS_SHORT[d.getMonth()]} ${d.getFullYear()}`;
}

/** '2026-09-07' → '7 wrz'. Na osie i dymki, gdzie rok tylko zabiera miejsce. */
export function dayLabelPl(iso) {
  if (!iso) return '';
  const d = parseDate(iso);
  return `${d.getDate()} ${MONTHS_SHORT[d.getMonth()]}`;
}

export const MONTHS_SHORT = ['sty', 'lut', 'mar', 'kwi', 'maj', 'cze',
                             'lip', 'sie', 'wrz', 'paź', 'lis', 'gru'];

/* --------------------------------------------------------------------------
   OKRES PORÓWNAWCZY
   Jaśniejsza linia na wykresach. Domyślnie to okres tuż przed wybranym, ale
   przy sezonowym biznesie sensowniejsze bywa „ten sam czas rok temu" —
   bawialnia w wakacje i bawialnia w listopadzie to dwa różne światy.
   -------------------------------------------------------------------------- */
export const COMPARE_MODES = [
  { id: 'prev', label: 'Poprzedni okres' },
  { id: 'year', label: 'Ten sam okres rok temu' },
  { id: 'none', label: 'Bez porównania' }
];

/** Ten sam zakres cofnięty o rok — dzień w dzień, bez kombinowania z 29 lutego. */
export function sameRangeYearAgo({ from, to }) {
  const back = iso => {
    const d = parseDate(iso);
    /* 29 lutego cofnięte o rok trafiłoby na 1 marca — ucinamy do 28. */
    const day = (d.getMonth() === 1 && d.getDate() === 29) ? 28 : d.getDate();
    return `${d.getFullYear() - 1}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  };
  return { from: back(from), to: back(to) };
}

/** Zakres do porównania albo `null`, gdy porównania nie chcemy. */
export function comparisonRange(range, mode) {
  if (!range || mode === 'none') return null;
  return mode === 'year' ? sameRangeYearAgo(range) : previousRange(range);
}

/* --------------------------------------------------------------------------
   SIATKA KALENDARZA
   -------------------------------------------------------------------------- */

/**
 * Miesiąc rozpisany na tygodnie od poniedziałku. Puste pola na początku
 * i końcu dostają dni sąsiednich miesięcy z flagą `outside`, żeby siatka
 * była zawsze pełnym prostokątem i nie skakała między miesiącami.
 */
export function monthGrid(year, month) {
  const first = `${year}-${String(month).padStart(2, '0')}-01`;
  const start = mondayOf(first);
  const cells = [];
  for (let i = 0; i < 42; i++) {
    const iso = shift(start, i);
    cells.push({ iso, day: Number(iso.slice(8, 10)), outside: iso.slice(0, 7) !== first.slice(0, 7) });
  }
  /* Szósty tydzień bywa pusty (luty zaczynający się w poniedziałek) —
     wtedy go nie rysujemy, żeby kalendarz nie miał wiszącego pasa. */
  const weeks = [];
  for (let w = 0; w < 6; w++) {
    const row = cells.slice(w * 7, w * 7 + 7);
    if (row.some(c => !c.outside)) weeks.push(row);
  }
  return weeks;
}

/** Miesiąc przesunięty o n — do strzałek w kalendarzu. */
export function shiftMonth(year, month, n) {
  const total = year * 12 + (month - 1) + n;
  return { year: Math.floor(total / 12), month: (total % 12) + 1 };
}

/* ==========================================================================
   3. AGREGATY
   --------------------------------------------------------------------------
   Przychód liczymy WYŁĄCZNIE z pozycji odhaczonych jako „opłacone".
   Zamówienie, za które nikt jeszcze nie zapłacił, to nie przychód — pilnuje
   tego kafelek „Do zainkasowania", a nie wykres sprzedaży.
   ========================================================================== */

export const isPaid = t => !!t.paid;
export const revenueOf = txs => txs.filter(isPaid).reduce((s, t) => s + t.total, 0);

/** Ile transakcji dziennie / ile złotówek dziennie — w takt listy dni. */
export function dailySeries(txs, days, pick) {
  const bucket = new Map(days.map(d => [d, 0]));
  txs.forEach(t => { if (bucket.has(t.date)) bucket.set(t.date, bucket.get(t.date) + pick(t)); });
  return days.map(d => bucket.get(d));
}

export const revenueByDay = (txs, days) => dailySeries(txs.filter(isPaid), days, t => t.total);
export const countByDay   = (txs, days) => dailySeries(txs, days, () => 1);

/** Przychód na rezerwację, dzień po dniu. Dzień bez zamówień zostaje zerem. */
export function revenuePerBookingByDay(txs, days) {
  const rev = revenueByDay(txs, days), cnt = countByDay(txs, days);
  return rev.map((v, i) => (cnt[i] ? v / cnt[i] : 0));
}

/** Narastająco — każdy punkt to suma wszystkiego do tego dnia włącznie. */
export function cumulative(values) {
  let sum = 0;
  return values.map(v => (sum += v));
}

/**
 * Data pierwszego w historii zamówienia każdego klienta.
 * Liczymy ją z CAŁEJ bazy, nie z wybranego okresu — inaczej stały bywalec
 * pokazywałby się jako „nowy" za każdym razem, gdy zmienimy filtr dat.
 */
export function firstSeen(allTxs) {
  const map = new Map();
  allTxs.forEach(t => {
    if (!t.client) return;
    const had = map.get(t.client);
    if (!had || t.date < had) map.set(t.client, t.date);
  });
  return map;
}

/** Nowi klienci dzień po dniu: ten, kto właśnie tego dnia trafił do nas pierwszy raz. */
export function newClientsByDay(allTxs, days) {
  const seen = firstSeen(allTxs);
  const bucket = new Map(days.map(d => [d, 0]));
  seen.forEach(date => { if (bucket.has(date)) bucket.set(date, bucket.get(date) + 1); });
  return days.map(d => bucket.get(d));
}

/** Ilu klientów przyszło do nas pierwszy raz w tym okresie. */
export function newClientsIn(allTxs, { from, to }) {
  let n = 0;
  firstSeen(allTxs).forEach(date => { if (date >= from && date <= to) n++; });
  return n;
}

/** Przychód wg dnia tygodnia — od poniedziałku, bo tak czyta się grafik. */
export function revenueByWeekday(txs) {
  const out = [0, 0, 0, 0, 0, 0, 0];
  txs.filter(isPaid).forEach(t => {
    out[(parseDate(t.date).getDay() + 6) % 7] += t.total;
  });
  return out;
}

/**
 * Przychód w rozbiciu na zajęcia i wstęp — od największego.
 * Pozycje bez ani złotówki wypadają: wejścia z ulicy mają w bazie kwotę zero
 * (przy drzwiach nikt nie wpisuje ceny), a wiersz „0,00 zł" na wykresie
 * o przychodzie tylko myli — obecność tych dzieci widać w liczniku i rankingu.
 */
export function revenueByLabel(txs) {
  const map = new Map();
  txs.filter(isPaid).forEach(t => {
    const row = map.get(t.label) || { label: t.label, source: t.source, total: 0, count: 0, kids: 0 };
    row.total += t.total; row.count += 1; row.kids += t.qty;
    map.set(t.label, row);
  });
  return [...map.values()].filter(r => r.total > 0).sort((a, b) => b.total - a.total);
}

/**
 * Ile każdy klient u nas zostawił. Klucz taki sam, jak w `clientKey`,
 * więc wiersz rankingu dopasujemy przez `guestClientKey`.
 * Liczą się tylko pozycje opłacone — tak samo jak wszędzie indziej w finansach.
 */
export function paidByClient(txs) {
  const map = new Map();
  txs.filter(isPaid).forEach(t => {
    if (!t.client) return;
    const row = map.get(t.client) || { total: 0, count: 0 };
    row.total += t.total; row.count += 1;
    map.set(t.client, row);
  });
  return map;
}

/** Odczyt z mapy powyżej — klient bez ani jednej opłaty dostaje czyste zero. */
export const paidFor = (map, key) =>
  (map && key && map.get(key)) || { total: 0, count: 0 };

/** Rozliczenie okresu: co wpłynęło, a co jeszcze wisi. */
export function settlement(txs) {
  const paid   = txs.filter(isPaid);
  const unpaid = txs.filter(t => !t.paid);
  return {
    paid:        paid.reduce((s, t) => s + t.total, 0),
    paidCount:   paid.length,
    unpaid:      unpaid.reduce((s, t) => s + t.total, 0),
    unpaidCount: unpaid.length
  };
}

/**
 * Zmiana względem poprzedniego okresu, w procentach.
 * `null` znaczy „nie ma do czego porównać" — z zera nie da się urosnąć
 * o żaden sensowny procent i lepiej pokazać kreskę niż „+∞%".
 */
export function changePct(now, before) {
  if (!before) return now ? null : 0;
  return ((now - before) / before) * 100;
}

/** '+12%' / '−8%' / '0%' — gotowy napis na plakietkę. */
export function fmtPct(pct) {
  if (pct === null || !isFinite(pct)) return '—';
  const v = Math.round(pct);
  return (v > 0 ? '+' : v < 0 ? '−' : '') + Math.abs(v) + '%';
}

/** Klasa plakietki: wzrost na zielono, spadek na czerwono, zero neutralnie. */
export const pctTone = pct =>
  pct === null ? 'is-flat' : pct > 0 ? 'is-up' : pct < 0 ? 'is-down' : 'is-flat';

/**
 * Komplet liczb dla jednego okresu — wszystko, co pokazują kafelki.
 * @param {Array}  all  wszystkie transakcje (potrzebne do „nowych klientów")
 * @param {object} r    zakres { from, to }
 */
export function summary(all, r) {
  const txs  = inRange(all, r);
  const paid = txs.filter(isPaid);
  const revenue = paid.reduce((s, t) => s + t.total, 0);
  return {
    range:      r,
    days:       dateSeries(r.from, r.to),
    txs,
    revenue,
    orders:     txs.length,
    avgOrder:   paid.length ? revenue / paid.length : 0,
    kids:       txs.reduce((s, t) => s + t.qty, 0),
    newClients: newClientsIn(all, r),
    perOrder:   txs.length ? revenue / txs.length : 0
  };
}

/* ==========================================================================
   EKSPORT DO CSV
   --------------------------------------------------------------------------
   Panel pokazuje sumy, a arkusz służy do rozliczeń: obsługa dzwoni do rodzica,
   sprawdza, kto nie zapłacił, wystawia rachunek. Dlatego do pliku idzie
   wszystko, co o zgłoszeniu wiemy — nie tylko kwota, ale i telefon, godziny,
   uwagi i to, czy wizyta weszła do rankingu.

   Zakres wierszy jest ten sam, co na wykresach (odrzucone rezerwacje
   pominięte), żeby suma z arkusza zgadzała się z kafelkiem „Sprzedaż".
   ========================================================================== */

export const CSV_HEADERS = [
  'Data', 'Dzień tygodnia', 'Od', 'Do', 'Źródło', 'Nr rezerwacji', 'Pozycja',
  'Status', 'Liczba dzieci', 'Dzieci', 'Rodzic', 'Telefon', 'E-mail',
  'Cena za dziecko', 'Kwota', 'Opłacone', 'Przyszedł', 'W rankingu',
  'Płatność / taryfa', 'Czas pobytu', 'Uwagi rodzica', 'Uwagi obsługi',
  'Zgłoszenie utworzono'
];

const SOURCE_LABEL = { zajecia: 'zajęcia', bawialnia: 'bawialnia', wejscie: 'wejście z ulicy' };
const STATUS_LABEL = {
  pending: 'oczekuje', accepted: 'zaakceptowana', rejected: 'odrzucona',
  new: 'nowy', confirmed: 'potwierdzony'
};

/** Liczba w formacie, który polski Excel przyjmuje jako liczbę, nie tekst. */
const csvNum = n => (Number(n) || 0).toFixed(2).replace('.', ',');
const yesNo  = v => (v ? 'tak' : 'nie');

/**
 * Znacznik czasu z Firestore → '2026-09-07 14:30'.
 * Rekordy bywają w trzech postaciach: Timestamp z `toDate()`, zwykła data
 * i nic (starsze zgłoszenia). Każdą trzeba znieść bez wyjątku.
 */
export function stampToText(v) {
  if (!v) return '';
  const d = typeof v.toDate === 'function' ? v.toDate()
          : v instanceof Date ? v
          : (typeof v === 'string' || typeof v === 'number') ? new Date(v) : null;
  if (!d || isNaN(d.getTime())) return '';
  const p = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

/** Imiona dzieci ze zgłoszenia — obie postacie, nowa i archiwalna. */
export function childNames(r) {
  if (Array.isArray(r.children) && r.children.length) {
    return r.children
      .map(c => (c.name || `${c.firstName || ''} ${c.lastName || ''}`).trim())
      .filter(Boolean).join(', ');
  }
  return `${r.childFirstName || ''} ${r.childLastName || ''}`.trim();
}

/** Godzina wyjścia — ręcznie ustawiona ma pierwszeństwo nad wyliczoną. */
function endTime(t) {
  const r = t.raw || {};
  if (r.stayUntil) return r.stayUntil;
  if (t.source === 'zajecia') return r.eventEnd || '';
  return r.start ? fmtMin(bookingEndMin(r)) : '';
}

/** Jeden wiersz arkusza. Kolejność musi zgadzać się z `CSV_HEADERS`. */
export function csvRow(t) {
  const r = t.raw || {};
  const zajecia = t.source === 'zajecia';
  const unit = zajecia
    ? (Number(r.unitPrice) || (t.qty ? t.total / t.qty : 0))
    : (t.qty ? t.total / t.qty : 0);
  return [
    t.date,
    t.date ? DAY_NAMES[(parseDate(t.date).getDay() + 6) % 7] : '',
    (zajecia ? r.eventStart : r.start) || '',
    endTime(t),
    SOURCE_LABEL[t.source] || t.source,
    orderRef(t.id),
    t.label,
    STATUS_LABEL[r.status] || r.status || '',
    t.qty,
    childNames(r),
    `${r.parentFirstName || ''} ${r.parentLastName || ''}`.trim(),
    r.phone || '',
    r.email || '',
    csvNum(unit),
    csvNum(t.total),
    yesNo(t.paid),
    /* „Przyszedł" istnieje tylko przy zajęciach — przy wstępie do bawialni
       samo bycie zaakceptowanym znaczy, że dziecko przyszło. */
    zajecia ? yesNo(r.attended) : '—',
    yesNo(r.countedInRanking),
    zajecia ? (r.paymentMethod || '') : (r.tariff === 'weekend' ? 'weekend' : 'dzień powszedni'),
    zajecia ? '' : (r.durationLabel || r.duration || ''),
    (r.note || '').replace(/\s*\n\s*/g, ' '),
    (r.adminNote || '').replace(/\s*\n\s*/g, ' '),
    stampToText(r.createdAt)
  ];
}

/** Nagłówek + wiersze dla wybranego okresu, gotowe do sklejenia w plik. */
export function csvTable(txs, range) {
  return [CSV_HEADERS, ...inRange(txs, range)
    .slice()
    .sort((a, b) => a.date.localeCompare(b.date)
                 || String((a.raw || {}).start || (a.raw || {}).eventStart || '')
                    .localeCompare(String((b.raw || {}).start || (b.raw || {}).eventStart || '')))
    .map(csvRow)];
}

/* ==========================================================================
   4. RYSOWANIE
   --------------------------------------------------------------------------
   Wykresy są ręcznie robionym SVG, bez żadnej biblioteki z sieci — panel ma
   działać także wtedy, gdy CDN nie odpowiada, a cała paczka to pliki statyczne.
   ========================================================================== */

const NS = 'http://www.w3.org/2000/svg';
const el = (name, attrs = {}) => {
  const e = document.createElementNS(NS, name);
  for (const k in attrs) e.setAttribute(k, attrs[k]);
  return e;
};

/**
 * „Ładne" wartości na osi Y. Surowe maksimum (np. 137,50 zł) dawałoby
 * podziałkę nie do czytania, więc zaokrąglamy w górę do 1/2/5 × 10ⁿ
 * i dzielimy na równe kroki.
 */
export function niceTicks(max, steps = 3) {
  if (!(max > 0)) return [0, 1];
  const raw = max / steps;
  const mag = Math.pow(10, Math.floor(Math.log10(raw)));
  const norm = raw / mag;
  const step = (norm <= 1 ? 1 : norm <= 2 ? 2 : norm <= 5 ? 5 : 10) * mag;
  const out = [];
  for (let v = 0; v <= step * steps + 1e-9; v += step) out.push(Math.round(v * 100) / 100);
  return out;
}

/**
 * Kilka podpisów pod osią X, rozłożonych równo — wszystkich dat by się
 * nie zmieściło. Zwraca indeksy w tablicy dni, nie same daty, bo wykres
 * musi wiedzieć, w którym miejscu je postawić.
 */
export function pickLabels(days, count = 4) {
  if (!days.length) return [];
  if (days.length <= count) return days.map((iso, i) => ({ i, iso }));
  return Array.from({ length: count }, (_, k) => {
    const i = Math.round((k / (count - 1)) * (days.length - 1));
    return { i, iso: days[i] };
  });
}

/**
 * Jeden wykres.
 * @param {HTMLElement} host  pojemnik — czyścimy go i wstawiamy świeże SVG
 * @param {object} cfg
 *   type        'line' | 'bar'
 *   h           wysokość w pikselach
 *   axes        false przy iskierkach (sparkline) — bez osi i podpisów
 *   series      [{ color, points:[], fill }] — kolejność ma znaczenie,
 *               ostatnia seria rysuje się na wierzchu
 *   values      [] przy słupkach
 *   xLabels     [{ i, text }] podpisy pod osią
 *   pointCount  ile punktów ma seria (do rozstawienia podpisów)
 *   yFmt        formatowanie liczb na osi Y
 */
export function drawChart(host, cfg) {
  if (!host) return;
  const W = Math.max(120, host.clientWidth || 320);
  const H = cfg.h || 150;
  const axes = cfg.axes !== false;
  const padL = axes ? (cfg.padL || 52) : 0, padR = axes ? 6 : 0;
  const padT = 8, padB = axes ? 26 : 4;
  const iw = Math.max(10, W - padL - padR), ih = Math.max(10, H - padT - padB);

  const data = cfg.type === 'bar' ? (cfg.values || [])
                                  : (cfg.series || []).flatMap(s => s.points || []);
  const ticks = niceTicks(Math.max(0, ...data, 0), cfg.steps || 3);
  const yMax = ticks[ticks.length - 1] || 1;
  const y = v => padT + ih - (v / yMax) * ih;
  const fmt = cfg.yFmt || (v => String(v));

  const svg = el('svg', { class: 'fin-chart', width: W, height: H, viewBox: `0 0 ${W} ${H}`,
                          role: 'img', 'aria-label': cfg.alt || '' });

  if (axes) {
    ticks.forEach(t => {
      svg.appendChild(el('line', { class: 'fin-gridline', x1: padL, x2: padL + iw, y1: y(t), y2: y(t) }));
      const lbl = el('text', { class: 'fin-tick', x: padL - 9, y: y(t) + 4, 'text-anchor': 'end' });
      lbl.textContent = fmt(t);
      svg.appendChild(lbl);
    });

    const n = cfg.type === 'bar' ? Math.max(1, (cfg.values || []).length)
                                 : Math.max(1, cfg.pointCount || 1);
    (cfg.xLabels || []).forEach(({ i, text }, k, arr) => {
      const x = cfg.type === 'bar'
        ? padL + (iw / n) * (i + .5)
        : padL + (n <= 1 ? iw / 2 : (i / (n - 1)) * iw);
      const t = el('text', { class: 'fin-tick', x, y: H - 7,
        'text-anchor': arr.length === 1 ? 'middle'
                     : k === 0 ? 'start' : k === arr.length - 1 ? 'end' : 'middle' });
      t.textContent = text;
      svg.appendChild(t);
    });
  }

  if (cfg.type === 'bar') {
    const vals = cfg.values || [], n = vals.length || 1;
    const slot = iw / n, bw = Math.min(42, slot * .58);
    vals.forEach((v, i) => {
      const bh = padT + ih - y(v);
      if (bh <= 0) return;
      svg.appendChild(el('rect', { x: padL + slot * i + (slot - bw) / 2, y: y(v),
        width: bw, height: Math.max(2, bh), rx: 5, fill: cfg.color || CHART.bar }));
    });
  } else {
    (cfg.series || []).forEach(s => {
      const pts = s.points || [], n = pts.length;
      if (!n) return;
      const px = i => padL + (n === 1 ? iw / 2 : (i / (n - 1)) * iw);
      const d = pts.map((v, i) => `${i ? 'L' : 'M'}${px(i).toFixed(2)},${y(v).toFixed(2)}`).join(' ');
      /* Delikatne wypełnienie pod linią bieżącego okresu — samą linię łatwo
         przeoczyć, a wypełnienie od razu pokazuje, gdzie były pieniądze. */
      if (s.fill) {
        svg.appendChild(el('path', {
          d: `${d} L${px(n - 1).toFixed(2)},${(padT + ih).toFixed(2)} L${px(0).toFixed(2)},${(padT + ih).toFixed(2)} Z`,
          fill: s.color, 'fill-opacity': .12, stroke: 'none'
        }));
      }
      svg.appendChild(el('path', { d, fill: 'none', stroke: s.color,
        'stroke-width': s.width || 2.2, 'stroke-linecap': 'round', 'stroke-linejoin': 'round' }));
    });
  }

  if (cfg.hover) attachHover(svg, cfg, { padL, padT, iw, ih, y });

  host.innerHTML = '';
  host.appendChild(svg);
}

/* ==========================================================================
   5. DYMEK POD KURSOREM
   --------------------------------------------------------------------------
   Sam wykres mówi „mniej więcej tyle" — a obsługa chce wiedzieć dokładnie,
   ile było w konkretny wtorek. Dymek pokazuje datę i wartość każdej serii
   naraz, żeby porównanie okresów dało się przeczytać bez mrużenia oczu.
   ========================================================================== */

/**
 * Który punkt danych jest pod kursorem.
 * Osobno i czysto, bo to jedyne miejsce, gdzie łatwo o błąd na krawędziach:
 * pierwszy i ostatni punkt muszą łapać kursor również poza swoją połówką
 * odstępu, inaczej skraje wykresu byłyby nieklikalne.
 */
export function hitIndex(px, { padL, iw, count, mode = 'line' }) {
  const n = Math.max(1, count);
  if (n === 1) return 0;
  const rel = px - padL;
  const i = mode === 'bar'
    ? Math.floor(rel / (iw / n))
    : Math.round((rel / iw) * (n - 1));
  return Math.min(n - 1, Math.max(0, i));
}

/** Jeden dymek na całą stronę — tworzony przy pierwszym najechaniu. */
let tipEl = null;
function tip() {
  if (!tipEl) {
    tipEl = document.createElement('div');
    tipEl.className = 'fin-tip';
    tipEl.hidden = true;
    document.body.appendChild(tipEl);

    /* Palec nie wywołuje `pointerleave`, więc dymek postawiony dotknięciem
       zostałby na ekranie na zawsze. Chowamy go przy przewijaniu i przy
       dotknięciu czegokolwiek poza wykresem. */
    addEventListener('scroll', hideTip, { passive: true });
    document.addEventListener('pointerdown', ev => {
      if (!ev.target.closest || !ev.target.closest('.fin-chart')) hideTip();
    }, true);
  }
  return tipEl;
}
export function hideTip() { if (tipEl) tipEl.hidden = true; }

/** Ustawia dymek obok kursora, odbijając go od prawej i górnej krawędzi okna. */
function placeTip(box, x, y) {
  box.hidden = false;
  const r = box.getBoundingClientRect();
  const pad = 14;
  let left = x + pad;
  if (left + r.width > innerWidth - 8) left = x - r.width - pad;
  if (left < 8) left = 8;
  let top = y - r.height - pad;
  if (top < 8) top = y + pad;
  box.style.left = `${Math.round(left)}px`;
  box.style.top  = `${Math.round(top)}px`;
}

/**
 * Przezroczysta warstwa nad wykresem łapie kursor, a pionowa prowadnica
 * i kropki na seriach pokazują, o który punkt chodzi.
 * @param {object} cfg.hover
 *   labels  podpisy punktów (daty albo dni tygodnia) — tytuł dymka
 *   rows    [{ color, label, values:[] }] wiersze dymka
 *   fmt     jak sformatować liczbę
 */
function attachHover(svg, cfg, geom) {
  const { padL, padT, iw, ih, y } = geom;
  const h = cfg.hover;
  const bar = cfg.type === 'bar';
  const count = bar ? (cfg.values || []).length : (cfg.pointCount || 0);
  if (!count) return;

  const px = i => bar ? padL + (iw / count) * (i + .5)
                      : padL + (count === 1 ? iw / 2 : (i / (count - 1)) * iw);

  /* Warstwa rysowana nad danymi — prowadnica i kropki muszą być na wierzchu. */
  const layer = el('g', { class: 'fin-hover', opacity: 0 });
  const guide = el('line', { class: 'fin-guide', y1: padT, y2: padT + ih });
  layer.appendChild(guide);
  const dots = h.rows.map(r => {
    const c = el('circle', { r: 4.5, fill: '#fff', stroke: r.color, 'stroke-width': 2.5 });
    layer.appendChild(c);
    return c;
  });
  svg.appendChild(layer);

  /* `touch-action:pan-y` jest tu najważniejsze: przesunięcie palcem w pionie
     zawsze przewija stronę, a nie „rysuje" po wykresie. Bez tego na telefonie
     zakładka Finanse — prawie same wykresy — łapała gest przewijania. */
  const catcher = el('rect', { x: padL, y: padT, width: iw, height: ih,
                               fill: 'transparent',
                               style: 'cursor:crosshair;touch-action:pan-y' });
  svg.appendChild(catcher);

  let last = -1;
  const move = ev => {
    /* Mysz reaguje na samo najechanie. Palec — dopiero na dotknięcie:
       przy przewijaniu `pointermove` sypie się dziesiątkami zdarzeń i dymek
       biegałby za palcem zamiast pozwolić przewinąć stronę. */
    if (ev.pointerType !== 'mouse' && ev.type === 'pointermove') return;
    const box = svg.getBoundingClientRect();
    /* SVG bywa przeskalowany względem swojego viewBoxa (wąskie okno),
       więc przeliczamy piksele ekranu na współrzędne rysunku. */
    const scale = box.width ? (svg.viewBox.baseVal.width || box.width) / box.width : 1;
    const i = hitIndex((ev.clientX - box.left) * scale, { padL, iw, count, mode: cfg.type });

    if (i !== last) {
      last = i;
      layer.setAttribute('opacity', 1);
      guide.setAttribute('x1', px(i));
      guide.setAttribute('x2', px(i));
      h.rows.forEach((r, k) => {
        const v = r.values[i];
        const show = v !== undefined && v !== null;
        dots[k].setAttribute('opacity', show ? 1 : 0);
        if (show) { dots[k].setAttribute('cx', px(i)); dots[k].setAttribute('cy', y(v)); }
      });
      tip().innerHTML =
        `<div class="fin-tip-head">${escTip(h.labels[i] ?? '')}</div>` +
        h.rows.map(r => `<div class="fin-tip-row">
             <i style="background:${escTip(r.color)}"></i>
             <span>${escTip(r.label)}</span>
             <b>${escTip((h.fmt || String)(r.values[i] ?? 0))}</b>
           </div>`).join('');
    }
    placeTip(tip(), ev.clientX, ev.clientY);
  };

  const leave = () => { last = -1; layer.setAttribute('opacity', 0); hideTip(); };

  /* pointer* zamiast mouse* — ten sam kod obsługuje mysz i dotyk na tablecie
     przy ladzie, a tam panel jest używany najczęściej. */
  catcher.addEventListener('pointermove', move);
  catcher.addEventListener('pointerdown', move);
  catcher.addEventListener('pointerleave', leave);
  catcher.addEventListener('pointercancel', leave);
}

/* Dymek składamy z tekstu, który sami wyliczyliśmy, ale nazwy zajęć biorą
   się z bazy — a tam wpisuje je człowiek. Lepiej uciec znaki niż zakładać. */
const escTip = s => String(s ?? '').replace(/[&<>"']/g, c =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
