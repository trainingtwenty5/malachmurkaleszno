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

import { isoDate, parseDate, addDays, normPhone } from './mc-common.js';

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
    client: clientKey(r)
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
    client: clientKey(b)
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

  host.innerHTML = '';
  host.appendChild(svg);
}
