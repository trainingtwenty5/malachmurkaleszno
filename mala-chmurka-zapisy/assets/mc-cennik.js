/* ==========================================================================
   Mała Chmurka — cennik wstępu do bawialni i naliczanie ceny.

   Czyste funkcje, bez bazy i bez DOM-u — dzięki temu ten sam kod liczy cenę
   w formularzu rezerwacji, w panelu admina i w testach (tools/test-cennik.mjs).

   CENNIK
     Poniedziałek – Czwartek      1 h 25 zł | 2 h 40 zł | bez limitu 50 zł
     Piątek – Niedziela i święta  1 h 30 zł | 2 h 45 zł | bez limitu 55 zł

   ZNIŻKI
     dzieci do 6. miesiąca życia            za darmo
     dzieci od 6. miesiąca do 1. roku       50%
     rodzeństwo (2+ dzieci w rezerwacji)    −20%

   Zniżki liczą się po kolei: najpierw wiek, potem rodzeństwo. Dziecko do
   6 miesięcy wchodzi za darmo i żadna dalsza zniżka już go nie dotyczy.
   ========================================================================== */

/* ---------------------------------------------------------------- CENNIK -- */
export const DURATIONS = [
  { id: '1h',   label: '1 godzina',  minutes: 60 },
  { id: '2h',   label: '2 godziny',  minutes: 120 },
  { id: 'open', label: 'Bez limitu', minutes: null }
];

export const PRICES = {
  weekday: { '1h': 25, '2h': 40, 'open': 50 },   // poniedziałek – czwartek
  weekend: { '1h': 30, '2h': 45, 'open': 55 }    // piątek – niedziela i święta
};

export const SIBLING_DISCOUNT = 0.20;            // −20% przy 2+ dzieciach

export const AGE_TIERS = {
  free: { id: 'free', factor: 0,   label: 'do 6. miesiąca życia', short: 'gratis' },
  half: { id: 'half', factor: 0.5, label: 'od 6. miesiąca do 1. roku', short: '−50%' },
  full: { id: 'full', factor: 1,   label: 'powyżej 1. roku życia', short: 'pełna cena' }
};

/* ------------------------------------------------------------- ŚWIĘTA ----- */

/** Niedziela Wielkanocna dla danego roku (algorytm Meeusa/Jonesa/Butchera). */
export function easterSunday(year) {
  const a = year % 19, b = Math.floor(year / 100), c = year % 100;
  const d = Math.floor(b / 4), e = b % 4;
  const f = Math.floor((b + 8) / 25), g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4), k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(year, month - 1, day);
}

const pad = n => String(n).padStart(2, '0');
const iso = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const shift = (d, days) => { const x = new Date(d); x.setDate(x.getDate() + days); return x; };

/** Wszystkie dni ustawowo wolne w Polsce w danym roku, jako 'YYYY-MM-DD'. */
export function polishHolidays(year) {
  const easter = easterSunday(year);
  return new Set([
    `${year}-01-01`,  // Nowy Rok
    `${year}-01-06`,  // Trzech Króli
    iso(easter),                 // Wielkanoc
    iso(shift(easter, 1)),       // Poniedziałek Wielkanocny
    `${year}-05-01`,  // Święto Pracy
    `${year}-05-03`,  // Święto Konstytucji 3 Maja
    iso(shift(easter, 49)),      // Zielone Świątki
    iso(shift(easter, 60)),      // Boże Ciało
    `${year}-08-15`,  // Wniebowzięcie NMP / Wojska Polskiego
    `${year}-11-01`,  // Wszystkich Świętych
    `${year}-11-11`,  // Święto Niepodległości
    `${year}-12-25`,  // Boże Narodzenie
    `${year}-12-26`   // drugi dzień Bożego Narodzenia
  ]);
}

/** Czy 'YYYY-MM-DD' jest dniem ustawowo wolnym. */
export function isHoliday(dateISO) {
  const year = Number(String(dateISO).slice(0, 4));
  if (!year) return false;
  return polishHolidays(year).has(dateISO);
}

/**
 * Która taryfa obowiązuje danego dnia.
 * 'weekend' = piątek, sobota, niedziela ORAZ każde święto (także w środku tygodnia).
 */
export function tariffFor(dateISO) {
  if (isHoliday(dateISO)) return 'weekend';
  const [y, m, d] = String(dateISO).split('-').map(Number);
  const day = new Date(y, (m || 1) - 1, d || 1).getDay();   // 0 = niedziela
  return (day === 5 || day === 6 || day === 0) ? 'weekend' : 'weekday';
}

/** Ludzka nazwa taryfy — do pokazania w formularzu. */
export function tariffLabel(dateISO) {
  if (isHoliday(dateISO)) return 'święto — taryfa weekendowa';
  return tariffFor(dateISO) === 'weekend' ? 'piątek – niedziela' : 'poniedziałek – czwartek';
}

/* ---------------------------------------------------------------- WIEK ---- */

/** Wiek dziecka w pełnych miesiącach w dniu wizyty (null, gdy brak daty). */
export function ageInMonths(dobISO, onDateISO) {
  if (!dobISO || !onDateISO) return null;
  const [by, bm, bd] = String(dobISO).split('-').map(Number);
  const [vy, vm, vd] = String(onDateISO).split('-').map(Number);
  if (!by || !vy) return null;
  let months = (vy - by) * 12 + (vm - bm);
  if (vd < bd) months -= 1;
  return months;
}

/** Próg cenowy dziecka: 'free' (<6 mies.), 'half' (6–11 mies.), 'full' (rok i więcej). */
export function ageTier(dobISO, onDateISO) {
  const m = ageInMonths(dobISO, onDateISO);
  if (m === null || m < 0) return 'full';   // brak daty → liczymy pełną cenę
  if (m < 6)  return 'free';
  if (m < 12) return 'half';
  return 'full';
}

/* --------------------------------------------------------------- WYCENA --- */

const round2 = n => Math.round((Number(n) + Number.EPSILON) * 100) / 100;

/**
 * Wycena całej rezerwacji.
 *
 * @param {object} o
 * @param {string} o.date      'YYYY-MM-DD' — dzień wizyty (decyduje o taryfie)
 * @param {string} o.duration  '1h' | '2h' | 'open'
 * @param {Array}  o.children  [{ name?, dob? }] — jedno wejście = jedno dziecko
 * @param {boolean} [o.siblingDiscount]  wymusza/wyłącza zniżkę rodzeństwa;
 *                  domyślnie włącza się sama, gdy dzieci jest 2 lub więcej
 * @returns {{ tariff, tariffLabel, holiday, base, siblingApplies, lines, total }}
 */
export function quote({ date, duration, children, siblingDiscount } = {}) {
  const tariff = tariffFor(date);
  const base = (PRICES[tariff] || PRICES.weekday)[duration] ?? 0;
  const kids = Array.isArray(children) && children.length ? children : [{}];

  /* zniżka rodzeństwa: domyślnie od dwojga dzieci wzwyż */
  const siblingApplies = siblingDiscount === undefined ? kids.length >= 2 : !!siblingDiscount;

  const lines = kids.map((child, i) => {
    const tier = ageTier(child.dob, date);
    const afterAge = round2(base * AGE_TIERS[tier].factor);
    /* dziecko za darmo zostaje za darmo — zniżki się nie kumulują na zerze */
    const sibling = siblingApplies && afterAge > 0;
    const price = round2(sibling ? afterAge * (1 - SIBLING_DISCOUNT) : afterAge);
    return {
      index: i,
      name: (child.name || '').trim(),
      dob: child.dob || '',
      tier,
      tierLabel: AGE_TIERS[tier].label,
      ageMonths: ageInMonths(child.dob, date),
      base,
      afterAge,
      siblingDiscount: sibling ? round2(afterAge - price) : 0,
      price
    };
  });

  return {
    tariff,
    tariffLabel: tariffLabel(date),
    holiday: isHoliday(date),
    base,
    siblingApplies,
    lines,
    total: round2(lines.reduce((sum, l) => sum + l.price, 0))
  };
}

/** Krótkie podsumowanie zniżek — do pokazania pod ceną. */
export function discountSummary(q) {
  const bits = [];
  const free = q.lines.filter(l => l.tier === 'free').length;
  const half = q.lines.filter(l => l.tier === 'half').length;
  if (free) bits.push(`${free} × wstęp gratis (do 6. miesiąca)`);
  if (half) bits.push(`${half} × 50% (do 1. roku)`);
  if (q.siblingApplies && q.lines.some(l => l.siblingDiscount > 0)) bits.push('rodzeństwo −20%');
  return bits;
}
