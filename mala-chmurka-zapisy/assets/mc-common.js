/* ==========================================================================
   Mała Chmurka — wspólne elementy podstron: nagłówek, pasek powrotu, stopka,
   powiadomienia i drobne helpery (daty, ceny, teksty).
   ========================================================================== */
import { SETTINGS } from './firebase-config.js';
export { SETTINGS };

/* ------------------------------------------------------------- ADRESY STRON */
export const URLS = {
  home:          SETTINGS.homeUrl,
  calendar:      'kalendarz-zajec.html',
  event:         'strona-zajec.html',
  signup:        'zapisz-sie-na-zajecia.html',
  booking:       'rezerwacja-bawialni.html',
  login:         'logowanie.html',
  thanks:        'dziekujemy.html',
  thanksBooking: 'dziekujemy-rezerwacja.html',
  history:       'historia-zamowien.html',
  admin:         'panel-admina.html'
};

const NAV = [
  ['O nas',          SETTINGS.homeUrl + '#o-nas'],
  ['Cennik',         SETTINGS.homeUrl + '#cennik'],
  ['Grafik zajęć',   URLS.calendar],
  ['Bawialnia',      URLS.booking],
  ['Moje zamówienia', URLS.history],
  ['Kontakt',        SETTINGS.homeUrl + '#kontakt']
];

const IG_PATH = 'M12 2.16c3.2 0 3.58.01 4.85.07 1.17.05 1.8.25 2.23.41.56.22.96.48 1.38.9.42.42.68.82.9 1.38.16.43.36 1.06.41 2.23.06 1.27.07 1.65.07 4.85s-.01 3.58-.07 4.85c-.05 1.17-.25 1.8-.41 2.23-.22.56-.48.96-.9 1.38-.42.42-.82.68-1.38.9-.43.16-1.06.36-2.23.41-1.27.06-1.65.07-4.85.07s-3.58-.01-4.85-.07c-1.17-.05-1.8-.25-2.23-.41a3.8 3.8 0 0 1-1.38-.9 3.8 3.8 0 0 1-.9-1.38c-.16-.43-.36-1.06-.41-2.23C2.17 15.58 2.16 15.2 2.16 12s.01-3.58.07-4.85c.05-1.17.25-1.8.41-2.23.22-.56.48-.96.9-1.38.42-.42.82-.68 1.38-.9.43-.16 1.06-.36 2.23-.41C8.42 2.17 8.8 2.16 12 2.16zM12 0C8.74 0 8.33.01 7.05.07 5.78.13 4.9.33 4.14.63c-.79.3-1.46.72-2.13 1.38C1.35 2.68.94 3.35.63 4.14.33 4.9.13 5.78.07 7.05.01 8.33 0 8.74 0 12s.01 3.67.07 4.95c.06 1.27.26 2.15.56 2.91.31.79.72 1.46 1.38 2.13.67.67 1.34 1.08 2.13 1.38.76.3 1.64.5 2.91.56C8.33 23.99 8.74 24 12 24s3.67-.01 4.95-.07c1.27-.06 2.15-.26 2.91-.56.79-.3 1.46-.71 2.13-1.38.67-.67 1.08-1.34 1.38-2.13.3-.76.5-1.64.56-2.91.06-1.28.07-1.69.07-4.95s-.01-3.67-.07-4.95c-.06-1.27-.26-2.15-.56-2.91-.3-.79-.71-1.46-1.38-2.13C21.32 1.35 20.65.94 19.86.63c-.76-.3-1.64-.5-2.91-.56C15.67.01 15.26 0 12 0zm0 5.84a6.16 6.16 0 1 0 0 12.32 6.16 6.16 0 0 0 0-12.32zM12 16a4 4 0 1 1 0-8 4 4 0 0 1 0 8zm7.85-10.41a1.44 1.44 0 1 1-2.88 0 1.44 1.44 0 0 1 2.88 0z';
const FB_PATH = 'M24 12.07C24 5.4 18.63 0 12 0S0 5.4 0 12.07c0 6.02 4.39 11.02 10.13 11.93v-8.44H7.08v-3.49h3.05V9.41c0-3.02 1.79-4.7 4.53-4.7 1.31 0 2.68.24 2.68.24v2.97h-1.51c-1.49 0-1.96.93-1.96 1.89v2.26h3.33l-.53 3.49h-2.8V24C19.61 23.09 24 18.09 24 12.07z';

/* ==========================================================================
   Wstawia nagłówek, pasek „Powrót do strony głównej" i stopkę.
   opts.current – która pozycja menu jest aktywna (etykieta)
   opts.crumb   – dopisek obok przycisku powrotu
   opts.backTo  – nadpisuje cel przycisku powrotu (domyślnie strona główna)
   ========================================================================== */
export function mountChrome(opts = {}) {
  document.documentElement.style.setProperty('--logo-src', `url('${SETTINGS.logoUrl}')`);

  const header = document.createElement('header');
  header.className = 'site-header';
  header.innerHTML = `
    <div class="container header-inner">
      <a class="logo" href="${SETTINGS.homeUrl}" aria-label="${SETTINGS.brand} — strona główna">
        <span class="logo-mark" aria-hidden="true"></span>
        <span class="sr-only">${SETTINGS.brand}</span>
      </a>
      <button class="nav-toggle" id="mcNavToggle" aria-expanded="false" aria-controls="mcNav" aria-label="Menu">
        <span></span><span></span><span></span>
      </button>
      <nav class="nav" id="mcNav" aria-label="Menu główne">
        <ul>
          ${NAV.map(([label, href]) =>
            `<li><a href="${href}"${label === opts.current ? ' class="is-current"' : ''}>${label}</a></li>`).join('')}
          <li><a href="${URLS.booking}" class="nav-cta">Zarezerwuj miejsce</a></li>
        </ul>
      </nav>
    </div>`;

  const backbar = document.createElement('div');
  backbar.className = 'backbar';
  backbar.innerHTML = `
    <div class="container">
      <a class="back-btn" href="${opts.backTo || SETTINGS.homeUrl}">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"
             stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <path d="M19 12H5M11 18l-6-6 6-6"/>
        </svg>
        Powrót do strony głównej
      </a>
      ${opts.crumb ? `<span class="crumb">${esc(opts.crumb)}</span>` : ''}
    </div>`;

  const footer = document.createElement('footer');
  footer.className = 'site-footer';
  footer.innerHTML = `
    <div class="container footer-inner">
      <div class="footer-brand">
        <span class="logo-mark footer-logo" aria-hidden="true"></span>
        <p class="footer-tagline">Kameralna, naturalna bawialnia<br>i kawiarnia specialty w Lesznie.</p>
      </div>
      <nav class="footer-nav" aria-label="Menu w stopce">
        <h4>Strona</h4>
        <ul>
          <li><a href="${SETTINGS.homeUrl}#o-nas">O nas</a></li>
          <li><a href="${SETTINGS.homeUrl}#strefy">Strefy zabawy</a></li>
          <li><a href="${SETTINGS.homeUrl}#kawiarnia">Kawiarnia</a></li>
          <li><a href="${SETTINGS.homeUrl}#urodzinki">Urodzinki</a></li>
          <li><a href="${SETTINGS.homeUrl}#cennik">Cennik</a></li>
          <li><a href="${SETTINGS.homeUrl}#galeria">Galeria</a></li>
          <li><a href="${URLS.calendar}">Grafik zajęć</a></li>
          <li><a href="${URLS.booking}">Rezerwacja bawialni</a></li>
          <li><a href="${URLS.history}">Moje zamówienia</a></li>
        </ul>
      </nav>
      <div class="footer-contact">
        <h4>Kontakt</h4>
        <p>${SETTINGS.address}<br>${SETTINGS.city}</p>
        <p><a href="tel:${SETTINGS.phoneHref}">${SETTINGS.phone}</a></p>
        <p><a href="mailto:${SETTINGS.email}">${SETTINGS.email}</a></p>
        <p class="footer-social">
          <a class="social-link" href="${SETTINGS.instagram}" target="_blank" rel="noopener" aria-label="Instagram">
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="${IG_PATH}"></path></svg></a>
          <a class="social-link" href="${SETTINGS.facebook}" target="_blank" rel="noopener" aria-label="Facebook">
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="${FB_PATH}"></path></svg></a>
        </p>
      </div>
    </div>
    <div class="container footer-bottom">
      <p>© <span>${new Date().getFullYear()}</span> ${SETTINGS.brand}, Leszno. Wszelkie prawa zastrzeżone.</p>
    </div>`;

  document.body.prepend(backbar);
  document.body.prepend(header);
  document.body.append(footer);

  const btn = header.querySelector('#mcNavToggle');
  const nav = header.querySelector('#mcNav');
  btn.addEventListener('click', () => {
    const open = btn.getAttribute('aria-expanded') === 'true';
    btn.setAttribute('aria-expanded', String(!open));
    nav.classList.toggle('is-open', !open);
    document.body.classList.toggle('nav-open', !open);
  });
  nav.addEventListener('click', e => {
    if (e.target.tagName === 'A') {
      btn.setAttribute('aria-expanded', 'false');
      nav.classList.remove('is-open');
      document.body.classList.remove('nav-open');
    }
  });

  /* Gdyby pliku logo nie było pod podanym adresem — pokaż nazwę tekstem,
     żeby nagłówek nigdy nie wyglądał na pusty. */
  fetch(SETTINGS.logoUrl, { method: 'HEAD' }).then(r => { if (!r.ok) throw 0; }).catch(() => {
    document.querySelectorAll('.logo-mark').forEach(el => {
      el.style.mask = el.style.webkitMask = 'none';
      el.style.background = 'none';
      el.style.width = 'auto';
      el.style.aspectRatio = 'auto';
      el.style.font = '700 1.35rem/1 var(--font-head)';
      el.style.color = el.classList.contains('footer-logo') ? '#fff' : 'var(--brand-deep)';
      el.textContent = SETTINGS.brand;
    });
  });
}

/* ------------------------------------------------------------ POWIADOMIENIA */
let toastTimer;
export function toast(msg, ms = 2600) {
  let el = document.querySelector('.toast');
  if (!el) { el = document.createElement('div'); el.className = 'toast'; el.setAttribute('role','status'); document.body.append(el); }
  el.textContent = msg;
  requestAnimationFrame(() => el.classList.add('is-on'));
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('is-on'), ms);
}

/* ------------------------------------------------------------------ HELPERY */
export const $  = (s, r = document) => r.querySelector(s);
export const $$ = (s, r = document) => [...r.querySelectorAll(s)];

export function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, c =>
    ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));
}

export const DAY_NAMES   = ['poniedziałek','wtorek','środa','czwartek','piątek','sobota','niedziela'];
export const DAY_SHORT   = ['pon','wt','śr','czw','pt','sob','ndz'];
export const MONTHS_GEN  = ['stycznia','lutego','marca','kwietnia','maja','czerwca',
                            'lipca','sierpnia','września','października','listopada','grudnia'];

/** '2026-09-07' -> Date (lokalna północ) */
export const parseDate = iso => { const [y,m,d] = iso.split('-').map(Number); return new Date(y, m-1, d); };
/** Date -> '2026-09-07' */
export const isoDate = d => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
/** '09:30' -> 570 */
export const toMin = t => { const [h,m] = String(t||'0:0').split(':').map(Number); return (h||0)*60 + (m||0); };
/** 570 -> '09:30' */
export const fmtMin = m => `${String(Math.floor(m/60)).padStart(2,'0')}:${String(Math.round(m)%60).padStart(2,'0')}`;
/** poniedziałek tygodnia, w którym leży d */
export function weekStart(d) {
  const x = new Date(d); x.setHours(0,0,0,0);
  x.setDate(x.getDate() - ((x.getDay() + 6) % 7));
  return x;
}
export const addDays = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
/** '2026-09-07' -> 'poniedziałek, 7 września 2026' */
export function longDate(iso) {
  const d = parseDate(iso);
  return `${DAY_NAMES[(d.getDay()+6)%7]}, ${d.getDate()} ${MONTHS_GEN[d.getMonth()]} ${d.getFullYear()}`;
}
/** '2026-09-07' -> '07.09.2026' */
export function shortDate(iso) {
  const d = parseDate(iso);
  return `${String(d.getDate()).padStart(2,'0')}.${String(d.getMonth()+1).padStart(2,'0')}.${d.getFullYear()}`;
}
export const money = n => (Number(n)||0).toFixed(2).replace('.', ',') + ' zł';

/** 135 -> '2 godz. 15 min' */
export function humanMinutes(min) {
  min = Math.max(0, Math.round(Number(min) || 0));
  const h = Math.floor(min / 60), m = min % 60;
  if (!h) return `${m} min`;
  if (!m) return `${h} godz.`;
  return `${h} godz. ${m} min`;
}

/** Ujednolicony numer telefonu — służy też za klucz w rankingu. */
export function normPhone(p) {
  const digits = String(p || '').replace(/\D/g, '');
  return digits.length > 9 ? digits.slice(-9) : digits;
}

export const params = () => new URLSearchParams(location.search);

/** Odmiana: 1 osoba / 2 osoby / 5 osób */
export function plOsoby(n) {
  n = Number(n) || 0;
  if (n === 1) return '1 osoba';
  const l2 = n % 100, l1 = n % 10;
  if (l1 >= 2 && l1 <= 4 && !(l2 >= 12 && l2 <= 14)) return `${n} osoby`;
  return `${n} osób`;
}
/** Odmiana: 1 wizyta / 2 wizyty / 5 wizyt */
export function plWizyty(n) {
  n = Number(n) || 0;
  if (n === 1) return '1 wizyta';
  const l2 = n % 100, l1 = n % 10;
  if (l1 >= 2 && l1 <= 4 && !(l2 >= 12 && l2 <= 14)) return `${n} wizyty`;
  return `${n} wizyt`;
}

/** Odmiana: 1 dziecko / 2 dzieci */
export function plDzieci(n) {
  n = Number(n) || 0;
  return n === 1 ? '1 dziecko' : `${n} dzieci`;
}

export const PALETTE = ['#93C7CF','#3E7C89','#C9A87C','#A9834F','#3D5A78','#A9C6DD',
                        '#E29578','#8FB996','#B08BBB','#E6A57E','#6B9AC4','#D98BA0'];

/* ==========================================================================
   ILE DZIECI JEST TERAZ W BAWIALNI
   --------------------------------------------------------------------------
   Liczymy z dwóch źródeł:
     • zapisy na zajęcia — te, przy których admin odhaczył „przyszedł"
       i „opłacone" (checkboxy w zakładce „Zapisani");
     • zaakceptowane rezerwacje samego wstępu — od godziny przyjścia do końca
       opłaconego czasu pobytu.
   W obu przypadkach liczy się LICZBA DZIECI (pole qty), a nie liczba rekordów:
   jedno zgłoszenie na czworo dzieci to czworo dzieci.

   Funkcje czyste (bez bazy i bez DOM-u), żeby dały się przetestować osobno.
   ========================================================================== */

/**
 * Do której minuty dnia trwa rezerwacja wstępu.
 * Ręcznie ustawiona godzina wyjścia (`stayUntil`) ma pierwszeństwo — dzięki
 * temu administrator odwzorowuje to, za ile faktycznie zapłacono, np. gdy
 * ktoś zarezerwował dwie godziny, a dopłacił do „bez limitu" albo wyszedł wcześniej.
 */
export function bookingEndMin(b, dayEnd = '20:00') {
  if (!b) return 0;
  if (b.stayUntil) return toMin(b.stayUntil);
  const start = toMin(b.start);
  if (b.duration === '1h') return start + 60;
  if (b.duration === '2h') return start + 120;
  return Math.max(start + 60, toMin(dayEnd));   // „bez limitu" — do zamknięcia
}

/**
 * Stan bawialni w danej chwili.
 * @param {object} o
 * @param {Array}  o.regs      zapisy na zajęcia
 * @param {Array}  o.bookings  rezerwacje wstępu
 * @param {string} o.dateISO   dzień
 * @param {number} o.atMin     minuta dnia
 * @param {string} [o.dayEnd]  godzina zamknięcia dla „bez limitu"
 * @returns {{count, untilMin, fromClasses, fromBookings}}
 */
export function computeLivePresence({ regs, bookings, dateISO, atMin, dayEnd = '20:00' } = {}) {
  let fromClasses = 0, fromBookings = 0, untilMin = 0;

  (regs || []).forEach(r => {
    if (r.eventDate !== dateISO) return;
    if (!r.attended || !r.paid) return;              // admin potwierdził obecność
    const end = toMin(r.stayUntil || r.eventEnd);
    if (end <= atMin) return;
    fromClasses += Number(r.qty) || 1;
    if (end > untilMin) untilMin = end;
  });

  (bookings || []).forEach(b => {
    if (b.date !== dateISO) return;
    if (b.status !== 'accepted') return;             // czeka na decyzję albo odrzucona
    const start = toMin(b.start);
    const end = bookingEndMin(b, dayEnd);
    /* rezerwacja liczy się dopiero od godziny przyjścia — inaczej wieczorna
       wizyta podbijałaby licznik od rana */
    if (atMin < start || end <= atMin) return;
    fromBookings += Number(b.qty) || 1;
    if (end > untilMin) untilMin = end;
  });

  return { count: fromClasses + fromBookings, untilMin, fromClasses, fromBookings };
}

/** Zgodność wstecz: sam licznik z zapisów na zajęcia. */
export function computePresence(regs, dateISO, atMin) {
  const { count, untilMin } = computeLivePresence({ regs, bookings: [], dateISO, atMin });
  return { count, untilMin };
}

/** Suma dzieci w zgłoszeniach — liczy pole qty, a nie rekordy. */
export const countChildren = list =>
  (list || []).reduce((sum, r) => sum + (Number(r.qty) || 1), 0);

/* ==========================================================================
   CZY ZAPISY NA ZAJĘCIA SĄ JESZCZE OTWARTE
   --------------------------------------------------------------------------
   Zajęcia, które już się odbyły, nie mogą przyjmować zapisów — i nie chodzi
   o „brak miejsc", tylko o upływ terminu. Funkcja czysta, żeby dała się
   przetestować bez przeglądarki.
   ========================================================================== */

export const SIGNUP_CLOSED_TEXT = 'Termin zapisów upłynął';

/**
 * @param {object} ev  zajęcia: { date "YYYY-MM-DD", end "HH:MM" }
 * @param {string} [todayISO]  dzień „dziś" (do testów)
 * @param {number} [nowMinutes]  minuta dnia (do testów)
 * @returns {boolean} true, gdy termin minął
 */
export function signupClosed(ev, todayISO, nowMinutes) {
  if (!ev || !ev.date) return false;
  const now = new Date();
  const today = todayISO || isoDate(now);
  const minutes = nowMinutes === undefined ? now.getHours() * 60 + now.getMinutes() : nowMinutes;

  if (ev.date < today) return true;                 // dzień już minął
  if (ev.date > today) return false;                // dopiero będzie
  /* dziś — decyduje godzina zakończenia; bez godziny traktujemy jako otwarte */
  return ev.end ? toMin(ev.end) <= minutes : false;
}

/** Stan miejsca na zajęciach: 'closed' | 'full' | 'open' + gotowy opis. */
export function seatState(ev, todayISO, nowMinutes) {
  if (signupClosed(ev, todayISO, nowMinutes)) {
    return { state: 'closed', free: 0, text: SIGNUP_CLOSED_TEXT, short: SIGNUP_CLOSED_TEXT };
  }
  const free = Math.max(0, (Number(ev.capacity) || 0) - (Number(ev.booked) || 0));
  if (free === 0) return { state: 'full', free: 0, text: 'Brak wolnych miejsc', short: 'brak miejsc' };
  return { state: 'open', free, text: `${free} z ${ev.capacity || 0} wolnych`, short: `${free} wolnych` };
}
