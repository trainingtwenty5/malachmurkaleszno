/* ==========================================================================
   Mała Chmurka — godziny otwarcia prosto z wizytówki Google.

   PO CO TO JEST
   ----------------------------------------------------------------------
   Godziny były dotąd przepisane ręcznie w trzech miejscach: w karcie
   „Godziny otwarcia” na stronie głównej, w danych dla wyszukiwarki
   (JSON-LD) i w SETTINGS.openingHours, z których korzysta formularz
   rezerwacji. Trzy kopie to trzy okazje, żeby jedna została stara.

   Teraz źródło jest jedno i leży poza kodem: wizytówka Google (Profil
   Firmy). Ten moduł pobiera z niej godziny, przepisuje je do SETTINGS
   i — jeśli jest na stronie co malować — odświeża kartę godzin, licznik
   „N dni w tygodniu” oraz JSON-LD. Poprawka w wizytówce wchodzi na stronę
   sama, najpóźniej po wygaśnięciu pamięci podręcznej (6 h).

   CO, GDY SIĘ NIE UDA
   ----------------------------------------------------------------------
   Nic złego. Bez klucza API (albo przy błędzie sieci) zostają godziny
   zapasowe z `SETTINGS.openingHours` i strona wygląda dokładnie tak, jak
   przed tą zmianą. Dlatego nigdzie nie ma tu `throw` w górę — najwyżej
   ostrzeżenie w konsoli.

   WPIĘCIE
   ----------------------------------------------------------------------
   Strona główna:  <script type="module" src="…/assets/mc-godziny.js"></script>
   Inne podstrony: import { godzinyGotowe } from './assets/mc-godziny.js';
                   godzinyGotowe.then(przerysujCoTrzeba);
   ========================================================================== */
import { SETTINGS, GOOGLE_PLACE } from './firebase-config.js';

/* Indeksy dni w Google Places są takie same jak w JavaScripcie:
   0 = niedziela … 6 = sobota. Jedna zgodność mniej do pilnowania. */
const NAZWY_PL = ['Niedziela', 'Poniedziałek', 'Wtorek', 'Środa',
                  'Czwartek', 'Piątek', 'Sobota'];
const NAZWY_EN = ['Sunday', 'Monday', 'Tuesday', 'Wednesday',
                  'Thursday', 'Friday', 'Saturday'];

const pad = n => String(n).padStart(2, '0');
const hhmm = t => `${pad(t.hour || 0)}:${pad(t.minute || 0)}`;

/* ==========================================================================
   POBRANIE I ODCZYTANIE ODPOWIEDZI
   ========================================================================== */

/**
 * Zamienia `regularOpeningHours.periods` z Places API na tablicę siedmiu dni.
 *
 * @returns {Array<{ranges: Array<{open:string, close:string}>}|null>}
 *          null pod indeksem dnia = tego dnia nieczynne.
 */
function zPeriods(periods = []) {
  const dni = [null, null, null, null, null, null, null];

  for (const p of periods) {
    if (!p || !p.open || typeof p.open.day !== 'number') continue;
    const d = p.open.day;

    /* Brak `close` znaczy u Google „czynne całą dobę”. Nasz model opisuje
       dzień od–do, więc doba to 00:00–23:59. Podobnie przy zakresie
       przechodzącym przez północ: docinamy go do końca dnia, bo ani
       formularz rezerwacji, ani karta godzin nie umieją opisać nocy. */
    const open  = hhmm(p.open);
    const close = !p.close                 ? '23:59'
                : p.close.day !== d        ? '23:59'
                : hhmm(p.close);

    (dni[d] || (dni[d] = { ranges: [] })).ranges.push({ open, close });
  }

  dni.forEach(d => d && d.ranges.sort((a, b) => a.open.localeCompare(b.open)));
  return dni;
}

/**
 * Godziny w kształcie, którego oczekuje `openingFor()` z mc-common.js:
 * jeden przedział na dzień. Dzień z przerwą (10–13 i 15–19) spłaszczamy do
 * koperty 10–19, bo cała reszta systemu zna tylko jedną parę godzin. Karta
 * na stronie pokazuje wtedy oba przedziały — tam prawda się mieści.
 */
const doSettings = dni => dni.map(d =>
  !d || !d.ranges.length ? null : {
    open:  d.ranges[0].open,
    close: d.ranges[d.ranges.length - 1].close
  });

/** Godziny zapasowe z konfiguracji, w tym samym kształcie co z Google. */
const zSettings = () => (SETTINGS.openingHours || []).map(h =>
  h && h.open && h.close ? { ranges: [{ open: h.open, close: h.close }] } : null);

/* ---- pamięć podręczna -------------------------------------------------- */
/* Trzymamy odpowiedź w przeglądarce, żeby nie pytać Google przy każdym
   otwarciu strony. Wszystko w try/catch: w trybie prywatnym localStorage
   potrafi rzucić wyjątkiem już przy odczycie, a brak pamięci ma znaczyć
   tylko „zapytaj jeszcze raz”, nie „przewróć stronę”. */
const KLUCZ = 'mc-godziny-google';

function zPamieci() {
  try {
    const s = JSON.parse(localStorage.getItem(KLUCZ) || 'null');
    if (!s || !Array.isArray(s.dni)) return null;
    const wiek = (Date.now() - (s.at || 0)) / 60000;
    return wiek >= 0 && wiek < (GOOGLE_PLACE.cacheMinutes || 360) ? s.dni : null;
  } catch { return null; }
}

function doPamieci(dni) {
  try { localStorage.setItem(KLUCZ, JSON.stringify({ at: Date.now(), dni })); }
  catch { /* trudno — po prostu zapytamy następnym razem */ }
}

/** Jedno zapytanie do Places API (New). Rzuca, gdy Google odmówi. */
async function zGoogle() {
  const { placeId, apiKey } = GOOGLE_PLACE;
  const url = `https://places.googleapis.com/v1/places/${encodeURIComponent(placeId)}`
            + `?fields=regularOpeningHours&languageCode=pl&regionCode=PL`
            + `&key=${encodeURIComponent(apiKey)}`;

  const odp = await fetch(url);
  const dane = await odp.json().catch(() => null);

  /* Google zwraca błędy jako zwykły JSON z polem `error` — bez tego
     sprawdzenia zapisalibyśmy w pamięci siedem pustych dni i strona
     ogłosiłaby, że bawialnia nie pracuje nigdy. */
  if (!odp.ok || !dane || dane.error) {
    throw new Error((dane && dane.error && dane.error.message) || `HTTP ${odp.status}`);
  }
  const periods = (dane.regularOpeningHours || {}).periods;
  if (!Array.isArray(periods) || !periods.length) {
    throw new Error('Wizytówka nie podaje godzin otwarcia.');
  }
  return zPeriods(periods);
}

/* ==========================================================================
   USTALENIE GODZIN — jedno wywołanie na wczytanie strony
   ========================================================================== */

/** Godziny, których strona faktycznie używa. Obowiązuje od pierwszej linijki:
    dopóki Google nie odpowie, są to godziny zapasowe. */
export let GODZINY = zSettings();

/** Przepisuje ustalone godziny do SETTINGS, żeby `openingFor()` i wszystko,
    co z niego korzysta (formularz rezerwacji), widziało to samo. */
function zastosuj(dni) {
  GODZINY = dni;
  SETTINGS.openingHours = doSettings(dni);
}

/**
 * Obietnica rozwiązywana, gdy godziny są już ustalone — z Google albo
 * z zapasu. Nigdy nie jest odrzucana: strona ma się wyświetlić zawsze.
 */
export const godzinyGotowe = (async () => {
  if (!GOOGLE_PLACE.apiKey || !GOOGLE_PLACE.placeId) return GODZINY;

  const zapamietane = zPamieci();
  if (zapamietane) { zastosuj(zapamietane); return GODZINY; }

  try {
    const dni = await zGoogle();
    doPamieci(dni);
    zastosuj(dni);
  } catch (err) {
    console.warn('Godziny z wizytówki Google: zostaję przy zapasowych.', err);
  }
  return GODZINY;
})();

/* ==========================================================================
   RYSOWANIE — tylko tam, gdzie jest co rysować
   --------------------------------------------------------------------------
   Poniższe działa na stronie głównej. Na podstronach tych elementów nie ma,
   więc każda funkcja po cichu odpuszcza i moduł zostaje samym dostawcą
   danych.
   ========================================================================== */

const opisDnia = d => !d || !d.ranges.length
  ? 'nieczynne'
  : d.ranges.map(r => `${r.open} – ${r.close}`).join(', ');

/** Karta „Godziny otwarcia” w sekcji kontaktowej. */
function rysujKarte(dni) {
  const ul = document.getElementById('mcGodziny');
  if (!ul) return;

  const dzis = new Date().getDay();
  /* Tydzień zaczynamy od poniedziałku, tak jak czyta go człowiek,
     a nie od niedzieli, tak jak numeruje go JavaScript. */
  const kolejnosc = [1, 2, 3, 4, 5, 6, 0];

  ul.innerHTML = kolejnosc.map(i => {
    const klasy = [];
    if (i === 0 || i === 6) klasy.push('is-weekend');
    if (i === dzis) klasy.push('is-today');
    if (!dni[i]) klasy.push('is-closed');
    return `<li${klasy.length ? ` class="${klasy.join(' ')}"` : ''}>`
         + `<span>${NAZWY_PL[i]}</span><span>${opisDnia(dni[i])}</span></li>`;
  }).join('');
}

/** Kafelek „N dni w tygodniu” w pasku faktów nad sekcją „O nas”. */
function rysujLiczbeDni(dni) {
  const el = document.getElementById('mcDniOtwarte');
  if (!el) return;
  const ile = dni.filter(Boolean).length;
  el.textContent = `${ile} ${ile === 1 ? 'dzień' : 'dni'}`;
}

/**
 * Dane dla wyszukiwarek (JSON-LD). Google i tak zna godziny z wizytówki,
 * ale ten sam blok czytają inne serwisy i agregatory — niech mówi to samo,
 * co karta obok.
 */
function rysujDaneFirmy(dni) {
  const el = document.getElementById('mcDaneFirmy');
  if (!el) return;
  try {
    const dane = JSON.parse(el.textContent);
    const firma = (dane['@graph'] || []).find(w =>
      w.openingHoursSpecification || /LocalBusiness|Playground|CafeOrCoffeeShop/.test(String(w['@type'])));
    if (!firma) return;

    firma.openingHoursSpecification = dni.flatMap((d, i) => !d ? [] : d.ranges.map(r => ({
      '@type': 'OpeningHoursSpecification',
      dayOfWeek: NAZWY_EN[i],
      opens: r.open,
      closes: r.close
    })));
    el.textContent = JSON.stringify(dane, null, 2);
  } catch (err) {
    console.warn('Nie udało się odświeżyć danych strukturalnych.', err);
  }
}

function rysuj(dni) {
  rysujKarte(dni);
  rysujLiczbeDni(dni);
  rysujDaneFirmy(dni);
}

/* Malujemy dwa razy: od razu godzinami zapasowymi (żeby karta nie mrugała
   pustką, gdyby Google odpowiadał wolno) i ponownie po ustaleniu godzin. */
rysuj(GODZINY);
godzinyGotowe.then(rysuj);
