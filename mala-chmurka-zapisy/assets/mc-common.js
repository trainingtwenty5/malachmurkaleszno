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
  admin:         'panel-admina.html',
  /* „Zarządzanie zajęciami" to dziś karta 6 panelu — osobnej strony już nie ma.
     Adres zostaje pod jedną nazwą, żeby menu i skróty miały gdzie wskazywać. */
  adminEvents:   'panel-admina.html?tab=events',
  /* Wejście do panelu z menu prowadzi na kartę „2 · Rezerwacje wizyt": to po
     nie sięga się najczęściej i to one mają plakietkę obok nazwy. Sam adres
     `admin` zostaje bez parametru — używają go inne miejsca, którym chodzi
     o panel jako taki. */
  adminBookings: 'panel-admina.html?tab=book',
  /* `new=1` otwiera okno od razu po wejściu — kliknięcie „Nowe wejście" ma
     postawić przed obsługą formularz, a nie kartę, na której trzeba jeszcze
     poszukać przycisku. */
  adminEntry:    'panel-admina.html?tab=entry&new=1'
};

/* ==========================================================================
   MENU — JEDNA LISTA NA CAŁY SERWIS
   --------------------------------------------------------------------------
   Te same pozycje, w tej samej kolejności, co w <nav> na stronie głównej
   (index.html). Menu jest jedno: nie ma osobnej wersji dla podstron ani
   osobnej dla telefonu. Zmieniasz tutaj — zmień też w index.html.
   ========================================================================== */
const NAV = [
  ['O nas',         SETTINGS.homeUrl + '#o-nas'],
  ['Strefy zabawy', SETTINGS.homeUrl + '#strefy'],
  ['Kawiarnia',     SETTINGS.homeUrl + '#kawiarnia'],
  ['Urodzinki',     SETTINGS.homeUrl + '#urodzinki'],
  ['Cennik',        SETTINGS.homeUrl + '#cennik'],
  ['Galeria',       SETTINGS.homeUrl + '#galeria'],
  ['Oferty',        SETTINGS.homeUrl + '#materialy']
];

/* Pozycje dla obsługi — trzy, w tej samej kolejności co w index.html.
   Odsłania je updateNavAdmin() dopiero po sprawdzeniu uprawnień; to samo,
   co decyduje o wejściu do panelu. Tu chodzi tylko o to, co widać —
   wejścia pilnują reguły Firestore.

   Każdy ma własny kolor, bo trzy przyciski obok siebie rozróżnia się
   kolorem, nie czytaniem. Plakietkę przy „Panelu admina" wypełnia
   updateNavAdmin(): widać z każdej podstrony, że coś czeka, bez wchodzenia
   tam. */
const NAV_ADMIN = [
  { label: 'Nowe wejście',  href: URLS.adminEntry,             cls: 'nav-cta nav-cta-red' },
  { label: 'Panel admina',  href: URLS.adminBookings,          cls: 'nav-cta', badge: true },
  { label: 'Nowe zajęcia',  href: URLS.adminEvents + '&new=1', cls: 'nav-cta nav-cta-teal' }
];

/* ==========================================================================
   ZAPAMIĘTANY STAN MENU
   --------------------------------------------------------------------------
   Firebase odpowiada dopiero po pobraniu SDK z gstatic. Do tego czasu strona
   nie ma skąd wiedzieć, kto patrzy — więc pokazywała menu dla gościa i dopiero
   po sekundzie przestawiała je na wersję obsługi. Ten przeskok widać i trudno
   w tym czasie w cokolwiek trafić.

   Zapisujemy więc, czym skończyło się ostatnie sprawdzenie, i przy następnym
   wejściu malujemy menu od razu — bez czekania na sieć. Odpowiedź Firebase
   i tak przychodzi i to ona decyduje; to jest tylko trafna zgadywanka
   na pierwszą sekundę. Jeśli się nie zgadza (ktoś się wylogował gdzie indziej,
   komuś odebrano uprawnienia), menu poprawi się samo.

   To wyłącznie wygląd. Do panelu i do bazy wpuszczają reguły Firestore, więc
   podmieniony ręcznie wpis w przeglądarce nie daje niczego poza trzema
   przyciskami, które i tak kończą się ekranem „brak dostępu".

   Pierwsze wejście na danej przeglądarce nie ma czego pamiętać — wtedy jest
   tak, jak było. Strona główna ma jeszcze własną, malutką kopię tego odczytu
   w <script> tuż pod menu: musi zadziałać, zanim doładuje się ten moduł.
   ========================================================================== */
const STAN_KLUCZ = 'mc-menu-stan';        // 'guest' | 'signed' | 'admin'

function zapiszStan(stan) {
  try { localStorage.setItem(STAN_KLUCZ, stan); } catch { /* tryb prywatny */ }
}

/* Odczyt robimy raz, na starcie. Później zapisujemy do pamięci nowe stany,
   ale decyzja „czy malować obsługę od razu" ma się opierać na tym, co
   zastaliśmy przy wejściu na stronę. */
const STAN_NA_STARCIE = (() => {
  try { return localStorage.getItem(STAN_KLUCZ); } catch { return null; }
})();

/** Maluje menu według zapamiętanego stanu — synchronicznie, bez sieci. */
function stosujStanNaStarcie() {
  const zalogowany = STAN_NA_STARCIE === 'signed' || STAN_NA_STARCIE === 'admin';
  const admin = STAN_NA_STARCIE === 'admin';

  document.querySelectorAll('[data-nav-auth]').forEach(el => {
    const kind = el.dataset.navAuth;
    el.hidden = zalogowany ? kind !== 'signed' : kind !== 'guest';
  });
  document.querySelectorAll('[data-nav-admin]').forEach(el => { el.hidden = !admin; });
  document.querySelectorAll('[data-nav-klient]').forEach(el => {
    if (admin) el.hidden = true;
    else if (!el.hasAttribute('data-nav-auth')) el.hidden = false;
  });
  document.body.classList.toggle('has-admin-nav', admin);
  jestAdmin = admin;
}

/* ==========================================================================
   SKRÓT: Ctrl+X → NOWE WEJŚCIE
   --------------------------------------------------------------------------
   Z dowolnej strony serwisu, pod warunkiem że patrzy obsługa. Przy kolejce
   u drzwi liczy się to, czego NIE trzeba klikać: jeden chwyt zamiast szukania
   pozycji w menu i czekania na wczytanie panelu.

   Na stronie panelu okno otwieramy w miejscu — panel wystawia na to
   `window.mcNoweWejscie` — więc nic się nie przeładowuje. Wszędzie indziej
   przechodzimy pod adres, który sam otwiera formularz.

   Ctrl+X to normalnie „wytnij", dlatego JEDNO zastrzeżenie jest tu konieczne:
   kiedy kursor stoi w polu tekstowym, nie ruszamy skrótu. Inaczej obsługa
   poprawiająca imię w formularzu zamiast wyciąć zaznaczenie otwierałaby nowe
   okno — i traciła to, co już wpisała. Poza polami wycinanie i tak nic nie
   robi, więc tam skrót jest wolny.
   ========================================================================== */
let jestAdmin = false;   // ustawiają: stosujStanNaStarcie() i updateNavAdmin()

/** Czy kursor stoi w czymś, w czym „wytnij" ma sens. */
function wPoluTekstowym(el) {
  if (!el) return false;
  if (el.isContentEditable) return true;
  return /^(input|textarea|select)$/i.test(el.tagName);
}

function wireSkrotWejscie() {
  document.addEventListener('keydown', e => {
    if (!jestAdmin) return;
    if (!(e.ctrlKey || e.metaKey) || e.altKey || e.shiftKey) return;
    if (String(e.key).toLowerCase() !== 'x') return;
    if (wPoluTekstowym(e.target) || wPoluTekstowym(document.activeElement)) return;
    e.preventDefault();
    if (typeof window.mcNoweWejscie === 'function') window.mcNoweWejscie();
    else location.href = URLS.adminEntry;
  });
}

/* ==========================================================================
   FIREBASE DLA MENU — Z PONAWIANIEM
   --------------------------------------------------------------------------
   mc-firebase.js pobiera SDK z gstatic i po 15 s bez odpowiedzi przerywa.
   Na telefonie, przy słabym zasięgu i stronie pełnej zdjęć, ten limit potrafi
   minąć — a dotąd kończyło się to jedną, cichą nieudaną próbą: menu zostawało
   w wersji dla gościa i ktoś zalogowany od tygodnia widział „Zaloguj się".

   Powtórny `import()` tego samego adresu NIC by nie dał: moduł, który raz padł,
   oddaje przy kolejnym imporcie ten sam błąd, bez ponownego pobierania.
   Dlatego każda następna próba dostaje własny adres (`?proba=N`). To nowa
   instancja modułu, ale ten sam obiekt Firebase — mc-firebase.js pyta
   `getApps()`, zanim cokolwiek utworzy — więc nic się nie dubluje.
   ========================================================================== */
let fbModul = null;      // udana instancja — od tego momentu oddajemy ją wszystkim
let fbWToku = null;      // próba w locie, żeby dwa wywołania nie ciągnęły dwóch kopii
let fbProba = 0;

function firebase() {
  if (fbModul) return Promise.resolve(fbModul);
  if (fbWToku) return fbWToku;
  const adres = fbProba ? `./mc-firebase.js?proba=${fbProba}` : './mc-firebase.js';
  fbProba++;
  fbWToku = import(adres)
    .then(m => { fbModul = m; fbWToku = null; return m; })
    .catch(e => { fbWToku = null; throw e; });
  return fbWToku;
}

/* Odstępy kolejnych prób. Rosnące, bo jeśli nie udało się za trzecim razem,
   to zwykle nie chodzi o chwilowy brak zasięgu. */
const PONOWIENIA = [5000, 20000, 60000];

/**
 * Podpina menu pod stan logowania i nie odpuszcza po pierwszej porażce.
 * Ponawia też, gdy telefon złapie zasięg albo wróci z kieszeni — to dwa
 * momenty, w których nieudana próba ma realną szansę się udać.
 */
function watchAuth(cb) {
  let podpiete = false;

  const sprobuj = (nr = 0) => {
    if (podpiete) return;
    firebase()
      .then(({ auth, A }) => { podpiete = true; A.onAuthStateChanged(auth, cb); })
      .catch(err => {
        console.warn(`Menu: nie udało się wczytać Firebase (próba ${nr + 1}). ` +
                     'Menu zostaje w wersji dla gościa.', err);
        if (nr < PONOWIENIA.length) setTimeout(() => sprobuj(nr + 1), PONOWIENIA[nr]);
      });
  };

  sprobuj();
  addEventListener('online', () => sprobuj());
  document.addEventListener('visibilitychange', () => { if (!document.hidden) sprobuj(); });
}

const IG_PATH = 'M12 2.16c3.2 0 3.58.01 4.85.07 1.17.05 1.8.25 2.23.41.56.22.96.48 1.38.9.42.42.68.82.9 1.38.16.43.36 1.06.41 2.23.06 1.27.07 1.65.07 4.85s-.01 3.58-.07 4.85c-.05 1.17-.25 1.8-.41 2.23-.22.56-.48.96-.9 1.38-.42.42-.82.68-1.38.9-.43.16-1.06.36-2.23.41-1.27.06-1.65.07-4.85.07s-3.58-.01-4.85-.07c-1.17-.05-1.8-.25-2.23-.41a3.8 3.8 0 0 1-1.38-.9 3.8 3.8 0 0 1-.9-1.38c-.16-.43-.36-1.06-.41-2.23C2.17 15.58 2.16 15.2 2.16 12s.01-3.58.07-4.85c.05-1.17.25-1.8.41-2.23.22-.56.48-.96.9-1.38.42-.42.82-.68 1.38-.9.43-.16 1.06-.36 2.23-.41C8.42 2.17 8.8 2.16 12 2.16zM12 0C8.74 0 8.33.01 7.05.07 5.78.13 4.9.33 4.14.63c-.79.3-1.46.72-2.13 1.38C1.35 2.68.94 3.35.63 4.14.33 4.9.13 5.78.07 7.05.01 8.33 0 8.74 0 12s.01 3.67.07 4.95c.06 1.27.26 2.15.56 2.91.31.79.72 1.46 1.38 2.13.67.67 1.34 1.08 2.13 1.38.76.3 1.64.5 2.91.56C8.33 23.99 8.74 24 12 24s3.67-.01 4.95-.07c1.27-.06 2.15-.26 2.91-.56.79-.3 1.46-.71 2.13-1.38.67-.67 1.08-1.34 1.38-2.13.3-.76.5-1.64.56-2.91.06-1.28.07-1.69.07-4.95s-.01-3.67-.07-4.95c-.06-1.27-.26-2.15-.56-2.91-.3-.79-.71-1.46-1.38-2.13C21.32 1.35 20.65.94 19.86.63c-.76-.3-1.64-.5-2.91-.56C15.67.01 15.26 0 12 0zm0 5.84a6.16 6.16 0 1 0 0 12.32 6.16 6.16 0 0 0 0-12.32zM12 16a4 4 0 1 1 0-8 4 4 0 0 1 0 8zm7.85-10.41a1.44 1.44 0 1 1-2.88 0 1.44 1.44 0 0 1 2.88 0z';
const FB_PATH = 'M24 12.07C24 5.4 18.63 0 12 0S0 5.4 0 12.07c0 6.02 4.39 11.02 10.13 11.93v-8.44H7.08v-3.49h3.05V9.41c0-3.02 1.79-4.7 4.53-4.7 1.31 0 2.68.24 2.68.24v2.97h-1.51c-1.49 0-1.96.93-1.96 1.89v2.26h3.33l-.53 3.49h-2.8V24C19.61 23.09 24 18.09 24 12.07z';

/* ==========================================================================
   PRZYCISK „WSTECZ"
   Dotąd zawsze prowadził na stronę główną — także wtedy, gdy ktoś przyszedł
   z grafiku i chciał wrócić właśnie do grafiku. Teraz patrzymy, skąd użytkownik
   przyszedł, i cofamy o JEDEN krok, z nazwą tego miejsca na przycisku.
   ========================================================================== */

/** Ludzkie nazwy podstron — do podpisu na przycisku cofania. */
const PAGE_NAMES = [
  ['kalendarz-zajec',        'grafiku zajęć'],
  ['strona-zajec',           'opisu zajęć'],
  ['zapisz-sie-na-zajecia',  'zapisu na zajęcia'],
  ['rezerwacja-bawialni',    'rezerwacji'],
  ['historia-zamowien',      'historii zamówień'],
  ['dziekujemy-rezerwacja',  'potwierdzenia'],
  ['dziekujemy',             'potwierdzenia'],
  ['logowanie',              'logowania'],
  ['panel-admina',           'panelu admina'],
  ['admin',                  'panelu admina'],
  ['diagnostyka',            'diagnostyki']
];

/**
 * Dokąd i jak ma cofać przycisk.
 * @returns {{label, href, useHistory}}
 */
export function backTarget(opts = {}) {
  const home = { label: 'Powrót do strony głównej', href: opts.backTo || SETTINGS.homeUrl, useHistory: false };
  if (opts.backTo) return home;

  let ref = null;
  try { ref = document.referrer ? new URL(document.referrer) : null; } catch { ref = null; }

  /* obcy serwis albo wejście z zakładki — nie ma dokąd cofać */
  if (!ref || ref.origin !== location.origin) return home;
  /* odświeżenie tej samej strony też nie jest cofaniem */
  if (ref.pathname === location.pathname) return home;

  const file = ref.pathname.split('/').pop().replace(/\.html$/, '');
  if (!file || file === 'index') {
    return { label: 'Powrót do strony głównej', href: SETTINGS.homeUrl, useHistory: true };
  }
  const hit = PAGE_NAMES.find(([k]) => file === k);
  return {
    label: hit ? `Powrót do ${hit[1]}` : 'Wróć',
    href: ref.pathname + ref.search,
    useHistory: true
  };
}

/* ==========================================================================
   Wstawia nagłówek, pasek „Powrót do strony głównej" i stopkę.
   opts.crumb   – dopisek obok przycisku powrotu
   opts.backTo  – nadpisuje cel przycisku powrotu (domyślnie strona główna)
   ========================================================================== */
export function mountChrome(opts = {}) {
  document.documentElement.style.setProperty('--logo-src', `url('${SETTINGS.logoUrl}')`);

  /* Po zalogowaniu wracamy tam, skąd ktoś kliknął — bez tego każde logowanie
     kończyło się na ekranie logowania i wyglądało, jakby nic się nie stało.
     `next` musi być ścieżką na naszej stronie; sprawdza to logowanie.html.
     Na samym ekranie logowania parametru nie dokładamy: wskazywałby sam
     na siebie. */
  const loginUrl = (extra = '') => {
    const next = /logowanie\.html$/.test(location.pathname)
      ? '' : `next=${encodeURIComponent(location.pathname + location.search)}`;
    const q = [extra, next].filter(Boolean).join('&');
    return URLS.login + (q ? `?${q}` : '');
  };

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
          <!-- Atrybut data-nav-klient znaczy: „to jest menu dla odwiedzającego".
               Obsłudze chowa je updateNavAdmin() — przy ladzie liczy się jedno
               kliknięcie w to, po co się tu sięga. -->
          ${NAV.map(([label, href]) => `<li data-nav-klient><a href="${href}">${label}</a></li>`).join('')}

          <!-- POZYCJE KONTA — dwa sloty, każdy w dwóch wersjach; przełącza je
               updateNavAuth() po atrybucie data-nav-auth. Dokładnie ta sama
               czwórka co w index.html:

                 slot 1:  Zaloguj się      ->  Historia zamówień
                 slot 2:  Zarejestruj się  ->  Wyloguj się

               „Wyloguj się" stoi niżej — po pozycjach obsługi — żeby adminowi
               wylogowanie wypadło na samym dole menu. Klient tego nie zauważy:
               przyciski obsługi są wtedy schowane. -->
          <li data-nav-auth="guest"><a href="${loginUrl()}">Zaloguj się</a></li>
          <li data-nav-auth="signed" data-nav-klient hidden><a href="${URLS.history}">Historia zamówień</a></li>
          <li data-nav-auth="guest"><a href="${loginUrl('tab=register')}">Zarejestruj się</a></li>

          ${NAV_ADMIN.map(({ label, href, cls, badge }) =>
            `<li data-nav-admin hidden><a href="${href}"${
              cls ? ` class="${cls}"` : ''}>${label}${
              badge ? '<span class="tab-badge" data-nav-todo hidden></span>' : ''}</a></li>`).join('')}

          <li data-nav-auth="signed" hidden><button type="button" class="nav-btn" data-nav-logout>Wyloguj się</button></li>

          <li data-nav-klient><a href="${SETTINGS.homeUrl}#kontakt" class="nav-cta">Kontakt</a></li>
        </ul>
      </nav>
    </div>`;

  const back = backTarget(opts);
  const backbar = document.createElement('div');
  backbar.className = 'backbar';
  backbar.innerHTML = `
    <div class="container">
      <a class="back-btn" href="${back.href}">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"
             stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <path d="M19 12H5M11 18l-6-6 6-6"/>
        </svg>
        ${esc(back.label)}
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
          <li><a href="${URLS.booking}">Zarezerwuj miejsce</a></li>
          <li><a href="${URLS.history}">Historia zamówień</a></li>
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

  /* Cofamy przez historię, żeby wrócić dokładnie tam, gdzie użytkownik był
     (z pozycją przewijania i wybranym widokiem). Link w href zostaje jako
     zapas — dla nowej karty i dla wyszukiwarek. */
  if (back.useHistory) {
    backbar.querySelector('.back-btn').addEventListener('click', e => {
      if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
      if (history.length > 1) { e.preventDefault(); history.back(); }
    });
  }

  /* Nagłówek i pasek powrotu w jednym przyklejanym bloku — patrz `.mc-chrome`
     w mc-common.css. Dzięki temu pasek nie może wjechać pod nagłówek. */
  const chrome = document.createElement('div');
  chrome.className = 'mc-chrome';
  chrome.append(header, backbar);
  document.body.prepend(chrome);
  document.body.append(footer);

  /* Zanim ktokolwiek zdąży spojrzeć: menu dostaje wersję z ostatniego wejścia.
     Firebase i tak potwierdzi albo poprawi ją za chwilę. */
  stosujStanNaStarcie();

  /* ---------------------------------------------------------------- MENU
     Menu na telefonie ma jeden stan i pięć sposobów zamknięcia: przycisk,
     link, dotknięcie obok, Escape i powiększenie okna do wersji desktopowej.
     Wcześniej działały tylko dwa pierwsze — kto otworzył menu i dotknął obok,
     zostawał z zablokowanym przewijaniem i bez widocznego wyjścia. */
  const btn = header.querySelector('#mcNavToggle');
  const nav = header.querySelector('#mcNav');

  /* Przyciemnienie pod menu — element tylko dla oka, klik obsługujemy niżej.
     Wisi na <body>, a nie w nagłówku: nagłówek ma `backdrop-filter`, a ten
     tworzy blok zawierający dla `position:fixed` i zamknąłby przyciemnienie
     w wysokości samego paska. */
  const backdrop = document.createElement('div');
  backdrop.className = 'nav-backdrop';
  backdrop.hidden = true;
  document.body.appendChild(backdrop);

  /* Blokada przewijania strony pod otwartym menu.
     NIE robimy tego przez `overflow:hidden` na <html>. Na telefonach (przede
     wszystkim iOS) taka blokada bywa nieskuteczna, a przy okazji potrafi
     przesunac elementy `position:fixed` — menu otwarte w polowie strony
     ladowalo wtedy poza ekranem, a strona byla zablokowana, wiec nie dalo sie
     do niego dojechac. Zamiast tego unieruchamiamy <body> i przesuwamy je
     o dotychczasowe przewiniecie: strona stoi, menu trzyma sie okna,
     a po zamknieciu wracamy dokladnie tam, gdzie uzytkownik byl. */
  let scrollPrzedMenu = 0;
  const blokujPrzewijanie = wlacz => {
    const b = document.body;
    if (wlacz) {
      scrollPrzedMenu = window.pageYOffset || document.documentElement.scrollTop || 0;
      Object.assign(b.style, { position: 'fixed', top: `${-scrollPrzedMenu}px`,
                               left: '0', right: '0', width: '100%' });
    } else {
      Object.assign(b.style, { position: '', top: '', left: '', right: '', width: '' });
      window.scrollTo({ top: scrollPrzedMenu, left: 0, behavior: 'instant' });
    }
  };

  const setNav = open => {
    btn.setAttribute('aria-expanded', String(open));
    nav.classList.toggle('is-open', open);
    document.body.classList.toggle('nav-open', open);
    document.documentElement.classList.toggle('nav-open', open);
    backdrop.hidden = !open;
    /* Menu otwiera sie zawsze od gory listy — bez tego zostawalaby pozycja
       z poprzedniego otwarcia i wygladaloby to jak ucieta lista. */
    if (open) nav.scrollTop = 0;
    blokujPrzewijanie(open);
  };
  const navOpen = () => btn.getAttribute('aria-expanded') === 'true';

  btn.addEventListener('click', e => { e.stopPropagation(); setNav(!navOpen()); });
  /* Takze `button`: „Wyloguj się" nie jest linkiem, a po kliknięciu menu ma się
     zamknąć dokładnie tak samo jak po wybraniu każdej innej pozycji. */
  nav.addEventListener('click', e => { if (e.target.closest('a, button')) setNav(false); });
  backdrop.addEventListener('click', () => setNav(false));
  /* Dotknięcie czegokolwiek poza menu zamyka je — tak zachowuje się każde
     menu, którego ludzie używają na co dzień. */
  document.addEventListener('click', e => {
    if (navOpen() && !nav.contains(e.target) && e.target !== btn) setNav(false);
  });
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && navOpen()) setNav(false); });
  /* Obrót telefonu albo powiększenie okna: menu mobilne znika z układu,
     ale klasa blokująca przewijanie zostałaby na `html` i `body`. */
  addEventListener('resize', () => { if (navOpen() && innerWidth > 860) setNav(false); });

  /* Menu wie, czy ktoś jest zalogowany. Firebase dociągamy dynamicznie i bez
     blokowania — do czasu odpowiedzi widać wersję dla gościa, bo taka jest
     w HTML. Gdyby pierwsza próba nie wyszła, watchAuth() ponawia. */
  wireNavLogout();
  wireSkrotWejscie();
  watchAuth(updateNavAuth);

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

/**
 * Podmienia pozycje konta w menu: gość widzi „Zaloguj się" i „Zarejestruj się",
 * zalogowany — „Historia zamówień" i „Wyloguj się".
 *
 * Jeden mechanizm na cały serwis: i statyczne menu w index.html, i to
 * budowane przez mountChrome() mają te same pozycje z atrybutem
 * `data-nav-auth`, więc wystarczy chować i odsłaniać.
 */
export function updateNavAuth(user) {
  document.querySelectorAll('[data-nav-auth]').forEach(el => {
    const kind = el.dataset.navAuth;          // 'guest' albo 'signed'
    el.hidden = user ? kind !== 'signed' : kind !== 'guest';
  });

  /* Adres pod „Historią zamówień" — żeby było widać, na czyim koncie się jest. */
  const konto = document.querySelector('[data-nav-auth="signed"] a');
  if (konto && user) konto.title = user.email || '';

  /* Wylogowanie zapamiętujemy natychmiast — menu obsługi nie ma prawa mignąć
     następnej osobie przy tym komputerze. Wersję dla zalogowanego zapisuje
     dopiero updateNavAdmin(), kiedy wiadomo już, czy to obsługa, czy klient;
     zapis „signed" tutaj tylko zdążyłby nadpisać „admin" i zepsuć następne
     wejście. */
  if (!user) zapiszStan('guest');

  updateNavAdmin(user);
}

/**
 * Pozycje dla obsługi („Panel admina", „Nowe wejście").
 *
 * Sprawdzenie uprawnień idzie po sieci, więc do czasu odpowiedzi pozycje
 * zostają schowane — lepiej pokazać je ułamek sekundy za późno, niż mignąć
 * nimi komuś, kto nie ma tam czego szukać. To i tak tylko widok: gdyby ktoś
 * odsłonił je sobie w konsoli, panel i baza i tak go nie wpuszczą.
 */
function updateNavAdmin(user) {
  const items  = document.querySelectorAll('[data-nav-admin]');
  const klient = document.querySelectorAll('[data-nav-klient]');
  if (!items.length) return;

  const pokaz = ok => {
    items.forEach(el => { el.hidden = !ok; });

    /* Obsługa dostaje samo swoje: trzy przyciski i „Wyloguj się". Cennik,
       galeria czy historia zamówień to menu dla odwiedzającego — przy ladzie
       tylko wydłużają listę, przez którą trzeba przejechać wzrokiem.
       Pozycje ze slotem konta (data-nav-auth) mają już ustawiony stan przez
       updateNavAuth(), więc poza trybem admina ich nie ruszamy — inaczej
       „Zaloguj się" wracałoby zalogowanemu użytkownikowi. */
    klient.forEach(el => {
      if (ok) el.hidden = true;
      else if (!el.hasAttribute('data-nav-auth')) el.hidden = false;
    });

    /* Przy dłuższym menu przyciski obsługi nie mieszczą się w jednym rzędzie —
       tej klasy czepia się reguła zawijania. */
    document.body.classList.toggle('has-admin-nav', ok);
    jestAdmin = ok;
  };
  /* Gdy z poprzedniego wejścia wiemy, że to obsługa — zostawiamy menu zapalone
     na czas sprawdzania. Po to je zapamiętaliśmy. Każdy inny przypadek zaczyna
     się od wersji bez przycisków, żeby nie mignęły komuś, kto nie ma tam
     czego szukać. */
  if (!(user && STAN_NA_STARCIE === 'admin')) pokaz(false);
  if (!user) return;

  firebase()
    .then(({ adminStatus }) => adminStatus(user))
    .then(s => {
      const ok = !!(s && s.ok);
      pokaz(ok);
      zapiszStan(ok ? 'admin' : 'signed');
      if (ok) startNavTodo();
    })
    .catch(() => pokaz(false));
}

/* Nasłuch na liczbę spraw czekających w panelu. Podpinamy go raz na życie
   strony: `updateNavAuth` bywa wołane przy każdej zmianie stanu logowania,
   a drugi nasłuch znaczyłby drugi rachunek za odczyty z bazy. */
let navTodoOff = null;

function startNavTodo() {
  if (navTodoOff) return;
  if (!document.querySelector('[data-nav-todo]')) return;
  navTodoOff = true;                                   // blokada na czas ładowania
  import('./mc-data.js')
    .then(({ watchTodo }) => {
      navTodoOff = watchTodo(c => {
        document.querySelectorAll('[data-nav-todo]').forEach(el => {
          el.textContent = c.total > 99 ? '99+' : String(c.total);
          el.hidden = c.total === 0;
        });
      });
    })
    .catch(err => {
      navTodoOff = null;                               // spróbujemy jeszcze raz
      console.warn('Nie udało się policzyć spraw czekających w panelu.', err);
    });
}

/**
 * Podpina wylogowanie pod każdy element z atrybutem `data-nav-logout`.
 *
 * Firebase dociągamy dopiero przy kliknięciu, a nie z góry: pozycja „Wyloguj"
 * i tak pokazuje się wyłącznie komuś, kto jest zalogowany — czyli SDK już się
 * wtedy wczytało. Nie ma po co ciągnąć go przy każdym wejściu na stronę główną.
 */
export function wireNavLogout() {
  $$('[data-nav-logout]').forEach(el => {
    if (el.dataset.navLogoutOn) return;      // drugie wywołanie nie dokłada nasłuchu
    el.dataset.navLogoutOn = '1';
    el.addEventListener('click', async e => {
      e.preventDefault();
      try {
        const { auth, A } = await firebase();
        await A.signOut(auth);
        toast('Wylogowano.');
      } catch {
        /* Menu samo wróci do stanu „zalogowany", bo nic się nie zmieniło —
           trzeba tylko powiedzieć, że kliknięcie nie zadziałało. */
        toast('Nie udało się wylogować. Sprawdź połączenie i spróbuj ponownie.');
      }
    });
  });
}

/**
 * Podpina menu do stanu logowania na stronach BEZ mountChrome (np. index.html).
 * Wywołanie: import('./assets/mc-common.js').then(m => m.watchNavAuth());
 */
export function watchNavAuth() {
  /* Nie `updateNavAuth(null)`: to zgasiłoby menu obsługi, które chwilę wcześniej
     zapalił <script> pod nawigacją w index.html. Zaczynamy od tego samego,
     co tamten skrypt, a prawdziwy stan przyjdzie z watchAuth(). */
  stosujStanNaStarcie();
  wireNavLogout();
  wireSkrotWejscie();
  watchAuth(updateNavAuth);
}

/* ==========================================================================
   OKIENKO Z PYTANIEM
   Zastępuje systemowe confirm(): własny wygląd, sensowne podpisy przycisków
   i — co najważniejsze — jasny podział na „zapisz", „odrzuć" i „wróć".
   Zwraca 'save' | 'discard' | 'stay'.
   ========================================================================== */
export function askSaveOrDiscard({
  title = 'Masz niezapisane zmiany',
  text = 'Co zrobić z wprowadzonymi zmianami?',
  changes = [],
  saveLabel = 'Zapisz zmiany',
  discardLabel = 'Anuluj i zamknij',
  stayLabel = 'Wróć do edycji'
} = {}) {
  return new Promise(resolve => {
    const box = document.createElement('div');
    box.className = 'ask-back';
    box.innerHTML = `
      <div class="ask" role="dialog" aria-modal="true" aria-labelledby="askTitle">
        <h2 id="askTitle">${esc(title)}</h2>
        <p>${esc(text)}</p>
        ${changes.length ? `<div class="ask-changes">
            <strong>Zmienione pola</strong>
            <ul>${changes.slice(0, 8).map(c => `<li>${esc(c)}</li>`).join('')}
              ${changes.length > 8 ? `<li>i jeszcze ${changes.length - 8}…</li>` : ''}</ul>
          </div>` : ''}
        <div class="ask-acts">
          <button class="btn btn-primary btn-block" data-a="save">${esc(saveLabel)}</button>
          <button class="btn btn-danger btn-block" data-a="discard">${esc(discardLabel)}</button>
          <button class="btn btn-soft btn-block" data-a="stay">${esc(stayLabel)}</button>
        </div>
      </div>`;
    document.body.appendChild(box);
    requestAnimationFrame(() => box.classList.add('is-on'));

    const done = answer => {
      box.classList.remove('is-on');
      setTimeout(() => box.remove(), 160);
      document.removeEventListener('keydown', onKey);
      resolve(answer);
    };
    const onKey = e => { if (e.key === 'Escape') done('stay'); };

    box.querySelectorAll('[data-a]').forEach(b => b.onclick = () => done(b.dataset.a));
    /* kliknięcie w tło = wróć do edycji: nic nie tracimy przez przypadek */
    box.addEventListener('click', e => { if (e.target === box) done('stay'); });
    document.addEventListener('keydown', onKey);
    box.querySelector('[data-a="save"]').focus();
  });
}

/**
 * Okienko z jednym polem daty — zamiast systemowego prompt(), w którym trzeba
 * było wklepać „RRRR-MM-DD" z palca.
 * @returns {Promise<string|null>} data w formacie ISO albo null (anulowano)
 */
/**
 * Okienko do rozpisania serii terminów: dni tygodnia i koniec serii.
 * Ten sam zestaw pytań, co sekcja „Powtarzanie" w oknie zajęć, tylko wywołany
 * osobno — z listy zajęć, dla czegoś, co już istnieje.
 *
 * @param {string} o.startISO  data pierwszego (istniejącego) terminu
 * @returns {Promise<string[]|null>} daty kolejnych terminów albo `null`
 */
export function askSeries({
  title = 'Powiel zajęcia',
  text = '',
  startISO = '',
  confirmLabel = 'Powiel',
  cancelLabel = 'Anuluj'
} = {}) {
  return new Promise(resolve => {
    const dni = new Set();
    const box = document.createElement('div');
    box.className = 'ask-back';
    box.innerHTML = `
      <div class="ask ask-wide" role="dialog" aria-modal="true" aria-labelledby="askSeriesTitle">
        <h2 id="askSeriesTitle">${esc(title)}</h2>
        ${text ? `<p>${esc(text)}</p>` : ''}
        <span class="lbl">Powtarzaj w</span>
        <div class="rep-days" id="asDays" role="group" aria-label="Dni tygodnia">
          ${DAY_SHORT.map((d, i) => `<button type="button" data-day="${i}" aria-pressed="false"
              title="${esc(DAY_NAMES[i])}">${esc(d[0].toUpperCase())}</button>`).join('')}
        </div>
        <p class="hint" style="margin:6px 0 12px">Nic nie zaznaczone = co tydzień w ten sam
          dzień, co pierwszy termin.</p>

        <span class="lbl">Kończy się</span>
        <div class="rep-end">
          <label class="check"><input type="radio" name="asEnd" id="asEndDate" value="date" checked><span>W dniu</span></label>
          <input class="control" id="asUntil" type="date" aria-label="Ostatni dzień serii">
        </div>
        <div class="rep-end">
          <label class="check"><input type="radio" name="asEnd" id="asEndCount" value="count"><span>Po wystąpieniu</span></label>
          <input class="control" id="asCount" type="number" min="2" max="120" value="8" aria-label="Ile wystąpień">
        </div>

        <p class="hint" id="asInfo" style="margin:10px 0 0"></p>
        <div class="ask-acts">
          <button class="btn btn-primary btn-block" data-a="ok">${esc(confirmLabel)}</button>
          <button class="btn btn-soft btn-block" data-a="no">${esc(cancelLabel)}</button>
        </div>
      </div>`;
    document.body.appendChild(box);
    requestAnimationFrame(() => box.classList.add('is-on'));

    const q = sel => box.querySelector(sel);
    q('#asUntil').value = startISO ? isoDate(addDays(parseDate(startISO), 7 * 8)) : '';

    const daty = () => seriesDates({
      startISO,
      weekdays: [...dni],
      endMode: q('#asEndCount').checked ? 'count' : 'date',
      endDate: q('#asUntil').value,
      count: Number(q('#asCount').value) || 2
    });

    const odswiez = () => {
      box.querySelectorAll('#asDays button').forEach(b =>
        b.setAttribute('aria-pressed', String(dni.has(Number(b.dataset.day)))));
      const naDate = !q('#asEndCount').checked;
      q('#asUntil').disabled = !naDate;
      q('#asCount').disabled = naDate;
      const d = daty();
      q('#asInfo').textContent = d.length
        ? `Powstanie ${d.length} kolejnych terminów, ostatni ${shortDate(d[d.length - 1])}.`
        : 'Przy tych ustawieniach nie powstanie żaden dodatkowy termin.';
      q('[data-a="ok"]').disabled = !d.length;
    };

    box.querySelectorAll('#asDays button').forEach(b => b.onclick = () => {
      const i = Number(b.dataset.day);
      if (dni.has(i)) dni.delete(i); else dni.add(i);
      odswiez();
    });
    ['#asEndDate', '#asEndCount', '#asUntil', '#asCount'].forEach(sel =>
      q(sel).addEventListener('change', odswiez));
    q('#asCount').addEventListener('input', odswiez);
    odswiez();

    const done = answer => {
      box.classList.remove('is-on');
      setTimeout(() => box.remove(), 160);
      document.removeEventListener('keydown', onKey);
      resolve(answer);
    };
    const onKey = e => { if (e.key === 'Escape') done(null); };

    q('[data-a="ok"]').onclick = () => { const d = daty(); done(d.length ? d : null); };
    q('[data-a="no"]').onclick = () => done(null);
    box.addEventListener('click', e => { if (e.target === box) done(null); });
    document.addEventListener('keydown', onKey);
  });
}

export function askDate({
  title = 'Wybierz datę',
  text = '',
  value = '',
  min = '',
  confirmLabel = 'Potwierdź',
  cancelLabel = 'Anuluj'
} = {}) {
  return new Promise(resolve => {
    const box = document.createElement('div');
    box.className = 'ask-back';
    box.innerHTML = `
      <div class="ask" role="dialog" aria-modal="true" aria-labelledby="askDateTitle">
        <h2 id="askDateTitle">${esc(title)}</h2>
        ${text ? `<p>${esc(text)}</p>` : ''}
        <div class="field">
          <label for="askDateInput">Data</label>
          <input class="control" id="askDateInput" type="date"
                 value="${esc(value)}" ${min ? `min="${esc(min)}"` : ''}>
        </div>
        <div class="ask-acts">
          <button class="btn btn-primary btn-block" data-a="ok">${esc(confirmLabel)}</button>
          <button class="btn btn-soft btn-block" data-a="no">${esc(cancelLabel)}</button>
        </div>
      </div>`;
    document.body.appendChild(box);
    requestAnimationFrame(() => box.classList.add('is-on'));

    const input = box.querySelector('#askDateInput');
    const done = answer => {
      box.classList.remove('is-on');
      setTimeout(() => box.remove(), 160);
      document.removeEventListener('keydown', onKey);
      resolve(answer);
    };
    const accept = () => done(input.value || null);
    const onKey = e => {
      if (e.key === 'Escape') done(null);
      if (e.key === 'Enter' && document.activeElement === input) { e.preventDefault(); accept(); }
    };

    box.querySelector('[data-a="ok"]').onclick = accept;
    box.querySelector('[data-a="no"]').onclick = () => done(null);
    box.addEventListener('click', e => { if (e.target === box) done(null); });
    document.addEventListener('keydown', onKey);
    input.focus();
  });
}

/**
 * Zwykłe „na pewno?" — jedno pytanie, dwie odpowiedzi. Zastępuje systemowe
 * confirm(), które na telefonie wygląda jak ostrzeżenie o wirusie i nie
 * potrafi pokazać, czego dokładnie dotyczy.
 * @returns {Promise<boolean>} true = potwierdzono
 */
export function askConfirm({
  title = 'Na pewno?',
  text = '',
  details = [],
  confirmLabel = 'Tak',
  cancelLabel = 'Anuluj',
  danger = true
} = {}) {
  return new Promise(resolve => {
    const box = document.createElement('div');
    box.className = 'ask-back';
    box.innerHTML = `
      <div class="ask" role="dialog" aria-modal="true" aria-labelledby="askConfirmTitle">
        <h2 id="askConfirmTitle">${esc(title)}</h2>
        ${text ? `<p>${esc(text)}</p>` : ''}
        ${details.length ? `<div class="ask-changes">
            <strong>Czego to dotyczy</strong>
            <ul>${details.slice(0, 8).map(d => `<li>${esc(d)}</li>`).join('')}
              ${details.length > 8 ? `<li>i jeszcze ${details.length - 8}…</li>` : ''}</ul>
          </div>` : ''}
        <div class="ask-acts">
          <button class="btn ${danger ? 'btn-danger' : 'btn-primary'} btn-block" data-a="yes">${esc(confirmLabel)}</button>
          <button class="btn btn-soft btn-block" data-a="no">${esc(cancelLabel)}</button>
        </div>
      </div>`;
    document.body.appendChild(box);
    requestAnimationFrame(() => box.classList.add('is-on'));

    const done = answer => {
      box.classList.remove('is-on');
      setTimeout(() => box.remove(), 160);
      document.removeEventListener('keydown', onKey);
      resolve(answer);
    };
    const onKey = e => { if (e.key === 'Escape') done(false); };

    box.querySelector('[data-a="yes"]').onclick = () => done(true);
    box.querySelector('[data-a="no"]').onclick  = () => done(false);
    /* kliknięcie w tło = rezygnacja; nic się nie dzieje przez przypadek */
    box.addEventListener('click', e => { if (e.target === box) done(false); });
    document.addEventListener('keydown', onKey);
    box.querySelector('[data-a="no"]').focus();
  });
}

/**
 * Okienko z jednym polem tekstowym — zamiast systemowego prompt().
 * @returns {Promise<string|null>} wpisany tekst albo null (anulowano)
 */
export function askText({
  title = 'Wpisz wartość',
  text = '',
  label = 'Wartość',
  value = '',
  placeholder = '',
  hint = '',
  confirmLabel = 'Dodaj',
  cancelLabel = 'Anuluj',
  /* Domyślnie puste pole znaczy „rezygnuję" — tak działa np. pytanie o adres
     zdjęcia w galerii, gdzie pusty adres nie ma sensu. Bywa jednak odwrotnie:
     przy powodzie odmowy rezerwacji pusty tekst to poprawna odpowiedź
     („odrzucam bez uzasadnienia"). Wtedy `allowEmpty: true`. */
  allowEmpty = false
} = {}) {
  return new Promise(resolve => {
    const box = document.createElement('div');
    box.className = 'ask-back';
    box.innerHTML = `
      <div class="ask" role="dialog" aria-modal="true" aria-labelledby="askTextTitle">
        <h2 id="askTextTitle">${esc(title)}</h2>
        ${text ? `<p>${esc(text)}</p>` : ''}
        <div class="field">
          <label for="askTextInput">${esc(label)}</label>
          <input class="control" id="askTextInput" type="text"
                 value="${esc(value)}" placeholder="${esc(placeholder)}">
          ${hint ? `<span class="hint">${esc(hint)}</span>` : ''}
        </div>
        <div class="ask-acts">
          <button class="btn btn-primary btn-block" data-a="ok">${esc(confirmLabel)}</button>
          <button class="btn btn-soft btn-block" data-a="no">${esc(cancelLabel)}</button>
        </div>
      </div>`;
    document.body.appendChild(box);
    requestAnimationFrame(() => box.classList.add('is-on'));

    const input = box.querySelector('#askTextInput');
    const done = answer => {
      box.classList.remove('is-on');
      setTimeout(() => box.remove(), 160);
      document.removeEventListener('keydown', onKey);
      resolve(answer);
    };
    const accept = () => {
      const v = input.value.trim();
      done(allowEmpty ? v : (v || null));
    };
    const onKey = e => {
      if (e.key === 'Escape') done(null);
      if (e.key === 'Enter' && document.activeElement === input) { e.preventDefault(); accept(); }
    };

    box.querySelector('[data-a="ok"]').onclick = accept;
    box.querySelector('[data-a="no"]').onclick = () => done(null);
    box.addEventListener('click', e => { if (e.target === box) done(null); });
    document.addEventListener('keydown', onKey);
    input.focus();
    input.select();
  });
}

/* ==========================================================================
   POWIĘKSZANIE ZDJĘĆ
   Kliknięcie w zdjęcie na stronie zajęć otwiera je na całym ekranie:
   krzyżyk zamyka, strzałki przewijają galerię, Escape wychodzi.
   ========================================================================== */

/**
 * Następny indeks w galerii — z zawijaniem, żeby strzałka za ostatnim
 * zdjęciem wracała na początek zamiast blokować się na końcu.
 * @param {number} i    obecny indeks
 * @param {number} len  ile jest zdjęć
 * @param {number} dir  +1 w prawo, −1 w lewo
 */
export function stepIndex(i, len, dir = 1) {
  const n = Math.max(1, Math.floor(Number(len) || 0));
  const cur = Math.floor(Number(i) || 0);
  const krok = Math.floor(Number(dir) || 0);
  return (((cur + krok) % n) + n) % n;
}

const LB_ICON_ZOOM = 'M10 2a8 8 0 1 0 4.9 14.32l4.39 4.39 1.41-1.41-4.39-4.39A8 8 0 0 0 10 2zm0 2a6 6 0 1 1 0 12 6 6 0 0 1 0-12z';

/**
 * Pokazuje zdjęcie na całym ekranie.
 *
 * @param {object} o
 * @param {string[]} o.images  adresy zdjęć w kolejności galerii
 * @param {number} [o.index]   od którego zacząć
 * @param {string} [o.alt]     opis zdjęcia (dla czytników ekranu)
 * @returns {Promise<number>}  indeks zdjęcia oglądanego w chwili zamknięcia —
 *                             dzięki temu strona może pokazać to samo zdjęcie
 *                             w dużym kadrze po wyjściu z podglądu
 */
export function openLightbox({ images = [], index = 0, alt = '' } = {}) {
  const lista = (images || []).filter(Boolean);
  if (!lista.length) return Promise.resolve(0);

  let i = stepIndex(index, lista.length, 0);
  const wiele = lista.length > 1;

  return new Promise(resolve => {
    const box = document.createElement('div');
    box.className = 'lbox';
    box.setAttribute('role', 'dialog');
    box.setAttribute('aria-modal', 'true');
    box.setAttribute('aria-label', 'Powiększone zdjęcie');
    box.innerHTML = `
      <button class="lbox-close" type="button" aria-label="Zamknij podgląd" title="Zamknij (Esc)">
        <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true">
          <path fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"
                d="M6 6l12 12M18 6L6 18"/></svg>
      </button>
      ${wiele ? `
      <button class="lbox-nav lbox-prev" type="button" aria-label="Poprzednie zdjęcie" title="Poprzednie (←)">
        <svg viewBox="0 0 24 24" width="26" height="26" aria-hidden="true">
          <path fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"
                stroke-linejoin="round" d="M15 5l-7 7 7 7"/></svg>
      </button>
      <button class="lbox-nav lbox-next" type="button" aria-label="Następne zdjęcie" title="Następne (→)">
        <svg viewBox="0 0 24 24" width="26" height="26" aria-hidden="true">
          <path fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"
                stroke-linejoin="round" d="M9 5l7 7-7 7"/></svg>
      </button>` : ''}
      <div class="lbox-stage"><img class="lbox-img" alt="${esc(alt)}"></div>
      ${wiele ? `<div class="lbox-count" aria-live="polite"></div>` : ''}`;

    document.body.appendChild(box);

    const img   = box.querySelector('.lbox-img');
    const count = box.querySelector('.lbox-count');

    const pokaz = () => {
      img.src = lista[i];
      if (count) count.textContent = `${i + 1} z ${lista.length}`;
    };
    const krok = dir => { i = stepIndex(i, lista.length, dir); pokaz(); };

    pokaz();
    requestAnimationFrame(() => box.classList.add('is-on'));

    /* Strona pod spodem nie ma się przewijać, gdy podgląd jest na wierzchu. */
    const scrollWas = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const wrocDo = document.activeElement;

    const done = () => {
      box.classList.remove('is-on');
      setTimeout(() => box.remove(), 160);
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = scrollWas;
      if (wrocDo && wrocDo.focus) wrocDo.focus();
      resolve(i);
    };

    const onKey = e => {
      if (e.key === 'Escape') { e.preventDefault(); done(); }
      if (!wiele) return;
      if (e.key === 'ArrowLeft')  { e.preventDefault(); krok(-1); }
      if (e.key === 'ArrowRight') { e.preventDefault(); krok(1); }
    };

    box.querySelector('.lbox-close').onclick = done;
    if (wiele) {
      box.querySelector('.lbox-prev').onclick = () => krok(-1);
      box.querySelector('.lbox-next').onclick = () => krok(1);
    }
    /* kliknięcie obok zdjęcia zamyka; w samo zdjęcie — nie */
    box.addEventListener('click', e => {
      if (e.target === box || e.target.classList.contains('lbox-stage')) done();
    });
    document.addEventListener('keydown', onKey);

    /* Przesunięcie palcem — na telefonie wygodniejsze niż trafianie w strzałki. */
    let startX = null, startY = null;
    box.addEventListener('touchstart', e => {
      const t = e.changedTouches[0];
      startX = t.clientX; startY = t.clientY;
    }, { passive: true });
    box.addEventListener('touchend', e => {
      if (startX === null) return;
      const t = e.changedTouches[0];
      const dx = t.clientX - startX, dy = t.clientY - startY;
      startX = null;
      /* tylko wyraźny ruch w bok, żeby przewijanie w pionie niczego nie zmieniało */
      if (wiele && Math.abs(dx) > 45 && Math.abs(dx) > Math.abs(dy)) krok(dx < 0 ? 1 : -1);
    }, { passive: true });

    box.querySelector('.lbox-close').focus();
  });
}

/** Ikona lupy — podpowiedź, że zdjęcie da się powiększyć. */
export const zoomIcon = (size = 18) =>
  `<svg viewBox="0 0 24 24" width="${size}" height="${size}" aria-hidden="true">
     <path fill="currentColor" d="${LB_ICON_ZOOM}"/></svg>`;

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
/* Mianownik — do samodzielnej nazwy miesiąca (nagłówek 'wrzesień 2026'). */
export const MONTHS = ['styczeń','luty','marzec','kwiecień','maj','czerwiec',
                       'lipiec','sierpień','wrzesień','październik','listopad','grudzień'];
/* Dopełniacz — do daty z dniem ('7 września'). */
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

/* ==========================================================================
   POWTARZAJĄCE SIĘ ZAJĘCIA
   --------------------------------------------------------------------------
   Zamiast wpisywać „powiel na 8 tygodni" i liczyć w pamięci, obsługa zaznacza
   dni tygodnia i mówi, kiedy seria ma się skończyć. Tu zamieniamy to na zwykłą
   listę dat — funkcja jest czysta, więc daje się sprawdzić bez przeglądarki.
   ========================================================================== */

/**
 * Daty KOLEJNYCH wystąpień serii. Pierwsze wystąpienie to sam oryginał
 * (`startISO`) i celowo nie trafia do wyniku — ono już istnieje.
 *
 * @param {object} o
 * @param {string} o.startISO  data pierwszych zajęć
 * @param {number[]} [o.weekdays]  dni tygodnia, 0 = poniedziałek … 6 = niedziela.
 *        Pusta lista znaczy „co tydzień w ten sam dzień, co oryginał".
 * @param {'date'|'count'} [o.endMode]  czym kończy się seria
 * @param {string} [o.endDate]  ostatni możliwy dzień (przy endMode 'date')
 * @param {number} [o.count]  ile wystąpień ŁĄCZNIE z oryginałem (przy 'count')
 * @param {number} [o.max]  twardy limit — zabezpieczenie przed serią bez końca
 * @returns {string[]} daty w kolejności rosnącej
 */
export function seriesDates({ startISO, weekdays = [], endMode = 'count',
                              endDate = '', count = 1, max = 120 } = {}) {
  if (!startISO) return [];
  /* Bez zaznaczonych dni powtarzamy w ten sam dzień tygodnia, co oryginał —
     tak działa domyślne „co tydzień" i nie trzeba niczego klikać. */
  const wanted = weekdays.length
    ? [...new Set(weekdays.map(Number))].filter(n => n >= 0 && n <= 6)
    : [(parseDate(startISO).getDay() + 6) % 7];
  if (!wanted.length) return [];

  const byCount = endMode === 'count';
  const ile = Math.max(1, Math.min(max, Math.floor(Number(count) || 1)));
  if (byCount && ile <= 1) return [];
  if (!byCount && (!endDate || endDate <= startISO)) return [];

  const out = [];
  let d = parseDate(startISO);
  /* Oryginał liczy się jako pierwsze wystąpienie. */
  let wystapien = 1;
  /* Zapas na dwa lata dziennych kroków — seria dłuższa i tak wpada w `max`. */
  for (let krok = 0; krok < 366 * 2; krok++) {
    d = addDays(d, 1);
    const iso = isoDate(d);
    if (!byCount && iso > endDate) break;
    if (!wanted.includes((d.getDay() + 6) % 7)) continue;
    out.push(iso);
    wystapien++;
    if (out.length >= max) break;
    if (byCount && wystapien >= ile) break;
  }
  return out;
}

export const params = () => new URLSearchParams(location.search);

/**
 * Dokąd przewinąć pasek przewijany w bok, żeby wskazany element wylądował
 * na środku. Liczymy sami, zamiast wołać `scrollIntoView` — ta ostatnia
 * przy `behavior:'smooth'` bywa przerywana przez każdą inną zmianę układu
 * i potrafiła zostawić pasek tam, gdzie był.
 *
 * @param {number} itemLeft   pozycja elementu wewnątrz paska (offsetLeft)
 * @param {number} itemWidth  szerokość elementu
 * @param {number} viewWidth  widoczna szerokość paska (clientWidth)
 * @param {number} scrollMax  scrollWidth - clientWidth
 * @returns {number} docelowy scrollLeft, przycięty do zakresu paska
 */
export function centerScrollLeft(itemLeft, itemWidth, viewWidth, scrollMax) {
  const target = itemLeft - (viewWidth - itemWidth) / 2;
  return Math.round(Math.min(Math.max(0, target), Math.max(0, scrollMax)));
}

/**
 * Numer rezerwacji pokazywany klientowi i wyszukiwany przez obsługę.
 * To pierwsze osiem znaków identyfikatora z bazy, wielkimi literami —
 * krótkie na tyle, żeby dało się je przeczytać przez telefon, i unikalne
 * na tyle, żeby jednoznacznie trafić w zgłoszenie.
 * Ten sam wzór był już na stronie podziękowania — teraz jest w jednym miejscu.
 */
export const orderRef = id => String(id || '').slice(0, 8).toUpperCase();

/** Czy szukana fraza pasuje do numeru rezerwacji (bez względu na wielkość liter). */
export function matchesRef(id, query) {
  const q = String(query || '').trim().toUpperCase().replace(/^#/, '');
  return !!q && orderRef(id).includes(q);
}

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
/** Odmiana: 1 zdjęcie / 2 zdjęcia / 5 zdjęć */
export function plZdjecia(n) {
  n = Number(n) || 0;
  if (n === 1) return '1 zdjęcie';
  const l2 = n % 100, l1 = n % 10;
  if (l1 >= 2 && l1 <= 4 && !(l2 >= 12 && l2 <= 14)) return `${n} zdjęcia`;
  return `${n} zdjęć`;
}
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
export function bookingEndMin(b, dayEnd) {
  if (!b) return 0;
  if (b.stayUntil) return toMin(b.stayUntil);
  const start = toMin(b.start);
  if (b.duration === '1h') return start + 60;
  if (b.duration === '2h') return start + 120;
  /* „bez limitu" — do zamknięcia. Bez podanego `dayEnd` bierzemy godzinę
     zamknięcia właściwą dla dnia tej rezerwacji (piątek kończy wcześniej). */
  const close = dayEnd !== undefined ? toMin(dayEnd) : closingMinFor(b.date);
  return Math.max(start + 60, close);
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
export function computeLivePresence({ regs, bookings, dateISO, atMin, dayEnd } = {}) {
  const spans = presenceTimeline({ regs, bookings, dateISO, dayEnd });
  const teraz = spans.filter(s => atMin >= s.from && atMin < s.to);
  const suma = kind => teraz.reduce((a, s) => a + (s.kind === kind ? s.qty : 0), 0);
  const fromClasses = suma('class'), fromBookings = suma('booking');
  return {
    count: fromClasses + fromBookings,
    untilMin: teraz.reduce((m, s) => Math.max(m, s.to), 0),
    fromClasses, fromBookings
  };
}

/**
 * Rozkład godzinowy dnia: kto od której do której minuty jest w bawialni.
 * To ta sama selekcja danych, z której liczy się `computeLivePresence` — tyle
 * że bez wybierania jednej chwili. Dzięki temu licznik na stronie głównej
 * przelicza się sam z upływem czasu, zamiast czekać, aż ktoś kliknie coś
 * w panelu.
 *
 * W wyniku NIE MA żadnych danych osobowych: ani imion, ani telefonów, ani
 * numerów rekordów — wyłącznie „od minuty, do minuty, ile dzieci". Tyle
 * trafia do publicznie czytanego dokumentu `settings/presence`.
 *
 * Zapisy na zajęcia zaczynają się od minuty 0, a nie od godziny zajęć:
 * liczą się dopiero po odhaczeniu „przyszedł" + „opłacone", więc w chwili
 * zaznaczenia dziecko już fizycznie jest w środku.
 *
 * @returns {Array<{from:number,to:number,qty:number,kind:'class'|'booking'}>}
 */
export function presenceTimeline({ regs, bookings, dateISO, dayEnd } = {}) {
  const spans = [];

  (regs || []).forEach(r => {
    if (r.eventDate !== dateISO) return;
    if (!r.attended || !r.paid) return;              // admin potwierdził obecność
    spans.push({ from: 0, to: toMin(r.stayUntil || r.eventEnd),
                 qty: Number(r.qty) || 1, kind: 'class' });
  });

  (bookings || []).forEach(b => {
    if (b.date !== dateISO) return;
    if (b.status !== 'accepted') return;             // czeka na decyzję albo odrzucona
    /* rezerwacja liczy się dopiero od godziny przyjścia — inaczej wieczorna
       wizyta podbijałaby licznik od rana */
    spans.push({ from: toMin(b.start), to: bookingEndMin(b, dayEnd),
                 qty: Number(b.qty) || 1, kind: 'booking' });
  });

  return spans.filter(s => s.to > s.from).sort((a, b) => a.from - b.from || a.to - b.to);
}

/**
 * Ile dzieci jest w bawialni o danej minucie, licząc z rozkładu godzinowego.
 * Strona główna woła to co pół minuty, więc licznik gaśnie i zapala się sam.
 */
export function countAtMin(timeline, atMin) {
  let count = 0, untilMin = 0;
  (timeline || []).forEach(s => {
    const from = Number(s.from) || 0, to = Number(s.to) || 0;
    if (atMin < from || to <= atMin) return;
    count += Number(s.qty) || 1;
    if (to > untilMin) untilMin = to;
  });
  return { count, untilMin };
}

/**
 * Czy ręczne nadpisanie licznika obowiązuje jeszcze dzisiaj.
 *
 * Ręczne ustawienie (a także „Wyzeruj licznik") dotyczy JEDNEGO dnia. Bez tego
 * wieczorne wyzerowanie licznika zostawiało tryb ręczny na stałe i nazajutrz
 * licznik stał na zeru, dopóki ktoś nie przestawił przełącznika z powrotem.
 * Data w dokumencie pochodzi z zapisu, więc wraz ze zmianą dnia nadpisanie
 * wygasa samo i wraca tryb automatyczny.
 */
export function manualActive(presence, todayISO) {
  return !!(presence && presence.manual && presence.date === todayISO);
}

/**
 * Co pokazać na stronie głównej w danej chwili — cała decyzja w jednym miejscu,
 * bez DOM-u i bez bazy, żeby dała się przetestować.
 *
 * Kolejność jest ważna:
 *  1. dokument nie z dzisiaj  → zero (wczorajszy stan nikogo nie interesuje);
 *  2. ręczne nadpisanie z dziś → liczba wpisana przez administratora, do jego
 *     godziny; po niej zero;
 *  3. jest rozkład godzinowy   → liczymy z niego na bieżącą minutę, dzięki czemu
 *     licznik zmienia się sam, także przy zamkniętym panelu;
 *  4. dokument sprzed tej zmiany (bez rozkładu) → jak dawniej: zapamiętana
 *     liczba do zapamiętanej godziny.
 *
 * @returns {{count:number, until:string}}  until w formacie "HH:MM" albo ''
 */
export function presenceForSite(presence, atMin, todayISOStr) {
  if (!presence || presence.date !== todayISOStr) return { count: 0, until: '' };

  if (manualActive(presence, todayISOStr) || !Array.isArray(presence.timeline)) {
    const until = presence.until || '';
    const wygasl = !!until && atMin >= toMin(until);
    const count = wygasl ? 0 : (Number(presence.count) || 0);
    return { count, until: count ? until : '' };
  }

  const r = countAtMin(presence.timeline, atMin);
  return { count: r.count, until: r.untilMin ? fmtMin(r.untilMin) : '' };
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
 * Czy wybrany termin (dzień + godzina) już minął.
 * Używane w formularzu rezerwacji: o 21:00 nie ma sensu rezerwować dzisiaj
 * na 10:00. Dzień wcześniejszy niż dzisiejszy jest przeterminowany zawsze,
 * dzień późniejszy — nigdy.
 *
 * @param {string} dateISO   'YYYY-MM-DD'
 * @param {string} hhmm      'HH:MM' (puste = sprawdzamy sam dzień)
 * @param {string} todayISO  dzisiejszy dzień
 * @param {number} nowMinutes bieżąca minuta dnia
 */
export function slotInPast(dateISO, hhmm, todayISO, nowMinutes) {
  if (!dateISO || !todayISO) return false;
  if (dateISO < todayISO) return true;
  if (dateISO > todayISO) return false;
  if (!hhmm) return false;
  return toMin(hhmm) < nowMinutes;
}

/* ==========================================================================
   GODZINY OTWARCIA
   Bawialnia ma inne godziny w każdy dzień tygodnia (poniedziałek zaczyna
   o 15:00, piątek kończy o 16:00). Poza nimi nie da się nic zarezerwować.
   ========================================================================== */

/**
 * Godziny otwarcia dla konkretnego dnia.
 * @returns {{open, close, openMin, closeMin, label}|null} null = zamknięte
 */
export function openingFor(dateISO) {
  if (!dateISO) return null;
  const [y, m, d] = String(dateISO).split('-').map(Number);
  if (!y) return null;
  const h = (SETTINGS.openingHours || [])[new Date(y, (m || 1) - 1, d || 1).getDay()];
  if (!h || !h.open || !h.close) return null;
  return {
    open: h.open, close: h.close,
    openMin: toMin(h.open), closeMin: toMin(h.close),
    label: `${h.open} – ${h.close}`
  };
}

/** Godzina zamknięcia w minutach — z zapasem, gdyby dzień nie był opisany. */
export function closingMinFor(dateISO, fallback = SETTINGS.dayEnd) {
  const o = openingFor(dateISO);
  return o ? o.closeMin : toMin(fallback);
}

/**
 * Czy podana godzina mieści się w godzinach otwarcia tego dnia.
 * Wejście dokładnie o godzinie zamknięcia nie ma sensu, więc `close` jest
 * granicą wyłączną.
 */
export function withinOpening(dateISO, hhmm) {
  const o = openingFor(dateISO);
  if (!o || !hhmm) return false;
  const t = toMin(hhmm);
  return t >= o.openMin && t < o.closeMin;
}

/** Najbliższy sensowny kwadrans od podanej minuty — podpowiedź godziny. */
export function nextQuarter(nowMinutes, dayEnd = '20:00') {
  const q = Math.ceil((Number(nowMinutes) || 0) / 15) * 15;
  return Math.min(q, toMin(dayEnd), 23 * 60 + 45);
}

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

/* ==========================================================================
   CZAS ZABAWY — ile dziecko ma jeszcze czasu w bawialni
   --------------------------------------------------------------------------
   Zbiera w jedną listę wszystkich, którzy są dziś w bawialni, bez względu na
   to, skąd się wzięli: z zajęć, z rezerwacji wstępu albo wprowadzeni ręcznie
   przy drzwiach. Dla każdego liczy, ile czasu zostało.

   Funkcje czyste, żeby dały się przetestować bez przeglądarki.
   ========================================================================== */

export const PLAYTIME_SOURCE = {
  classes:  'zajęcia',
  booking:  'rezerwacja',
  walkin:   'z ulicy'
};

/* Ile minut po końcu pobytu wiersz jeszcze „tyka". Potem zamarza: przestaje
   odliczać i ląduje na dole tabeli, żeby nie mieszał się z tymi, którzy
   naprawdę są jeszcze w bawialni. */
export const FREEZE_AFTER_MIN = 15;

/** Nazwy dzieci z zapisu na zajęcia — nowy kształt i stary. */
function namesFromRegistration(r) {
  if (Array.isArray(r.children) && r.children.length) {
    return r.children.map(c => `${c.firstName || ''} ${c.lastName || ''}`.trim()).filter(Boolean);
  }
  const one = `${r.childFirstName || ''} ${r.childLastName || ''}`.trim();
  return one ? [one] : [];
}

/**
 * Jedna wspólna lista pobytów na dany dzień.
 *
 * @param {object} o
 * @param {Array}  o.regs      zapisy na zajęcia
 * @param {Array}  o.bookings  rezerwacje wstępu (także te wprowadzone ręcznie)
 * @param {string} o.dateISO   dzień
 * @param {number} o.atMin     minuta dnia (może być ułamkowa — do sekundnika)
 * @param {string} [o.dayEnd]  godzina zamknięcia dla pobytu „bez limitu"
 * @returns {Array} wiersze: { id, source, sourceLabel, names, qty, startMin, endMin,
 *                             remaining, state: 'waiting'|'playing'|'over', phone }
 */
export function playtimeRows({ regs, bookings, dateISO, atMin, dayEnd } = {}) {
  const rows = [];

  (regs || []).forEach(r => {
    if (r.eventDate !== dateISO) return;
    if (!r.attended || !r.paid) return;          // liczą się tylko potwierdzone obecności
    rows.push({
      id: r.id, source: 'classes',
      names: namesFromRegistration(r),
      qty: Number(r.qty) || 1,
      startMin: toMin(r.eventStart),
      endMin: toMin(r.stayUntil || r.eventEnd),
      phone: r.phone || '',
      title: r.eventTitle || '',
      /* Stan opłaty pokazujemy wprost w tabeli, żeby obsługa nie musiała
         szukać tego samego pobytu w dwóch innych zakładkach. */
      paid: !!r.paid
    });
  });

  (bookings || []).forEach(b => {
    if (b.date !== dateISO) return;
    if (b.status !== 'accepted') return;         // czeka na decyzję albo odrzucona
    rows.push({
      id: b.id, source: b.source === 'walkin' ? 'walkin' : 'booking',
      names: (b.children || []).map(c => String(c.name || '').trim()).filter(Boolean),
      qty: Number(b.qty) || 1,
      startMin: toMin(b.start),
      endMin: bookingEndMin(b, dayEnd),
      phone: b.phone || '',
      title: b.durationLabel || '',
      paid: !!b.paid
    });
  });

  return rows.map(row => {
    const remaining = row.endMin - atMin;      // ujemne = po czasie
    const overtime  = -remaining;

    let state;
    if (atMin < row.startMin)                 state = 'waiting';
    else if (remaining > 0)                   state = 'playing';
    else if (overtime < FREEZE_AFTER_MIN)     state = 'overtime';
    else                                      state = 'frozen';

    /* Zamrożonym nie odliczamy dalej — zatrzymujemy licznik na 15 minutach,
       żeby wiersz nie puchł do „po czasie 4:12:33" przez pół dnia. */
    const shown = state === 'frozen' ? -FREEZE_AFTER_MIN : remaining;

    return {
      ...row,
      remaining, overtime, shown,
      frozen: state === 'frozen',
      state,
      sourceLabel: PLAYTIME_SOURCE[row.source]
    };
  }).sort((a, b) =>
    /* zamrożone spadają na dół, reszta po godzinie wyjścia */
    (a.frozen - b.frozen) || (a.endMin - b.endMin) || (a.startMin - b.startMin));
}

/**
 * Odliczanie dla jednej wizyty — używane w panelu klienta („Historia zamówień"),
 * żeby rodzic widział, za ile kończy się czas dziecka w bawialni.
 *
 * Świadomie nie korzysta z playtimeRows(): tam liczą się tylko wizyty
 * potwierdzone przez obsługę, a rodzicowi chcemy pokazać także „zaczyna się za…"
 * przed przyjściem.
 *
 * @param {object} o
 * @param {string} o.dateISO   dzień wizyty
 * @param {number} o.startMin  godzina wejścia w minutach
 * @param {number} o.endMin    godzina wyjścia w minutach
 * @param {string} o.todayISO  dzisiejszy dzień
 * @param {number} o.atMin     bieżąca minuta dnia (może być ułamkowa)
 * @returns {{phase, remaining, label}} phase: 'past'|'future'|'before'|'during'|'after'
 */
export function countdownFor({ dateISO, startMin, endMin, todayISO, atMin } = {}) {
  if (!dateISO || !todayISO) return { phase: 'future', remaining: 0, label: '' };

  if (dateISO < todayISO) return { phase: 'past',   remaining: 0, label: '' };
  if (dateISO > todayISO) return { phase: 'future', remaining: 0, label: '' };

  if (atMin < startMin) {
    const remaining = startMin - atMin;
    return { phase: 'before', remaining, label: `zaczyna się za ${fmtCountdown(remaining)}` };
  }
  if (atMin < endMin) {
    const remaining = endMin - atMin;
    return { phase: 'during', remaining, label: `kończy się za ${fmtCountdown(remaining)}` };
  }
  return { phase: 'after', remaining: 0, label: 'czas się skończył' };
}

/**
 * Odliczanie w formie „1:23:45" / „23:45", a po czasie „−05:12".
 * Przyjmuje minuty (mogą być ułamkowe).
 */
export function fmtCountdown(minutes) {
  const total = Math.round(Math.abs(Number(minutes) || 0) * 60);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const pad = n => String(n).padStart(2, '0');
  const body = h ? `${h}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`;
  return (Number(minutes) < 0 ? '−' : '') + body;
}


/* ==========================================================================
   GALERIA ZDJĘĆ ZAJĘĆ
   --------------------------------------------------------------------------
   Zdjęcia trzymamy w Firestore (kolekcja `eventImages`), a nie w Firebase
   Storage — Storage wymaga płatnego planu, a ten projekt nie ma backendu.
   Konsekwencja: jeden dokument to jedno zdjęcie, a limit dokumentu w
   Firestore wynosi 1 MiB. Dlatego przeglądarka PRZED wysłaniem zmniejsza
   każde zdjęcie i przelicza je na JPEG, aż zmieści się w budżecie niżej.

   Poniższe funkcje są czyste (bez DOM i bez sieci), żeby dało się je
   przetestować zwykłym `node` — patrz tools/test-galeria.mjs.
   ========================================================================== */

export const IMG = {
  /** Ile zdjęć na jedne zajęcia. Strona zajęć i tak pokazuje osiem miniatur. */
  maxCount: 12,
  /** Największy plik, jaki w ogóle bierzemy do obróbki (przed zmniejszeniem). */
  maxSourceBytes: 25 * 1024 * 1024,
  /** Dłuższy bok po zmniejszeniu — w zupełności wystarcza na galerię. */
  maxSide: 1400,
  /** Do tylu bajtów celujemy po kompresji. */
  targetBytes: 320 * 1024,
  /** Twardy limit zapisanego tekstu — dokument Firestore ma 1 MiB na wszystko. */
  maxStoredChars: 900000,
  /** Formaty, które przeglądarki potrafią odczytać z pliku. */
  types: ['image/jpeg', 'image/pjpeg', 'image/png', 'image/webp', 'image/gif', 'image/avif', 'image/bmp']
};

/** '412 kB' / '2,1 MB' — rozmiar po ludzku. */
export function humanBytes(n) {
  const b = Number(n) || 0;
  if (b < 1024) return `${b} B`;
  if (b < 1024 * 1024) return `${Math.round(b / 1024)} kB`;
  return `${(b / (1024 * 1024)).toFixed(1).replace('.', ',')} MB`;
}

/**
 * Czy ten plik nadaje się na zdjęcie zajęć.
 * @param {File|object} file        plik z okna wyboru albo z upuszczenia
 * @param {number} [current]        ile zdjęć już jest w galerii
 * @returns {string|null} komunikat po polsku albo null, gdy wszystko gra
 */
export function imageFileError(file, current = 0) {
  if (!file) return 'Nie udało się odczytać pliku.';
  const type = String(file.type || '').toLowerCase();
  const name = file.name || 'plik';

  if (!type.startsWith('image/'))
    return `„${name}" to nie jest zdjęcie — wybierz plik JPG, PNG lub WEBP.`;
  if (!IMG.types.includes(type))
    return `Format „${type.replace('image/', '')}" (${name}) nie otwiera się w przeglądarce. `
         + 'Zapisz zdjęcie jako JPG albo PNG.';
  if ((Number(file.size) || 0) > IMG.maxSourceBytes)
    return `„${name}" waży ${humanBytes(file.size)} — za dużo. Maksimum to ${humanBytes(IMG.maxSourceBytes)}.`;
  if (current >= IMG.maxCount)
    return `Do jednych zajęć można dodać najwyżej ${IMG.maxCount} zdjęć. Usuń któreś, żeby zrobić miejsce.`;
  return null;
}

/** Wymiary po wpisaniu w kwadrat maxSide, z zachowaniem proporcji. */
export function fitSize(w, h, maxSide = IMG.maxSide) {
  const W = Math.max(1, Math.round(Number(w) || 0));
  const H = Math.max(1, Math.round(Number(h) || 0));
  const long = Math.max(W, H);
  if (long <= maxSide) return { w: W, h: H };
  const k = maxSide / long;
  return { w: Math.max(1, Math.round(W * k)), h: Math.max(1, Math.round(H * k)) };
}

/** Ile bajtów naprawdę waży obrazek zapisany jako data URL (base64). */
export function dataUrlBytes(src) {
  const s = String(src || '');
  const i = s.indexOf(',');
  if (!s.startsWith('data:') || i < 0) return 0;
  const body = s.slice(i + 1);
  const pad = (body.endsWith('==') ? 2 : body.endsWith('=') ? 1 : 0);
  return Math.max(0, Math.floor(body.length * 3 / 4) - pad);
}

/** Przenosi element listy na inne miejsce. Zwraca NOWĄ tablicę. */
export function moveItem(list, from, to) {
  const out = [...(list || [])];
  if (from < 0 || from >= out.length) return out;
  const target = Math.min(Math.max(to, 0), out.length - 1);
  const [item] = out.splice(from, 1);
  out.splice(target, 0, item);
  return out;
}

/**
 * Co trzeba zrobić w bazie, żeby zapisana galeria wyglądała jak ta na ekranie.
 *
 * @param {Array} before  zdjęcia wczytane z bazy, w zapisanej kolejności
 * @param {Array} after   zdjęcia widoczne teraz w panelu (mogą być nowe)
 * @returns {{create:Array, remove:string[], reorder:Array<{id:string,order:number}>}}
 */
export function galleryPlan(before, after) {
  const was  = (before || []).map(x => (typeof x === 'string' ? x : x.id));
  const list = after || [];

  const create  = [];
  const reorder = [];
  const kept    = [];

  list.forEach((item, i) => {
    if (item.isNew) { create.push({ ...item, order: i }); return; }
    kept.push(item.id);
    if (was.indexOf(item.id) !== i) reorder.push({ id: item.id, order: i });
  });

  const remove = was.filter(id => !kept.includes(id));
  return { create, remove, reorder };
}

/**
 * Odcisk galerii — zmienia się przy dodaniu, usunięciu i przestawieniu zdjęcia.
 * Dzięki temu okno edycji wie, że jest co zapisywać, tak samo jak przy
 * zwykłych polach formularza.
 */
export function gallerySignature(items) {
  return (items || []).map(i => (typeof i === 'string' ? i : i.id)).join('|');
}

/**
 * Adresy zdjęć do pokazania klientowi: najpierw wgrane w panelu, a gdy zajęcia
 * jeszcze ich nie mają — stare adresy URL wpisywane ręcznie (zgodność wstecz).
 */
export function gallerySources(stored, legacy) {
  const wgrane = (stored || [])
    .slice()
    .sort((a, b) => (Number(a.order) || 0) - (Number(b.order) || 0))
    .map(i => i.src)
    .filter(Boolean);
  if (wgrane.length) return wgrane;
  return (legacy || []).filter(Boolean);
}
