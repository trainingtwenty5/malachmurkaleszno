/* ==========================================================================
   Mała Chmurka — okienko „Bawialnia nieczynna” na stronie głównej.

   WPIĘCIE: jedna linijka w index.html, tuż przed </body>:
       <script type="module" src="/mala-chmurka-zapisy/assets/mc-nieczynne.js"></script>

   SKĄD SIĘ BIERZE TREŚĆ
   ----------------------------------------------------------------------
   Z karty „3 · Wykluczenia” w panelu administratora. Samo wykluczenie dnia
   blokuje rezerwacje i nic nie ogłasza — dopiero zaznaczone „widoczna
   informacja na stronie głównej” (pole `showOnSite`) wypycha dzień tutaj.
   Dzięki temu remont po godzinach zostaje sprawą wewnętrzną, a zamknięta
   sobota trafia przed oczy odwiedzającego.

   Zaznaczonych dni może być wiele — wtedy jest jedno okienko z listą, a nie
   kilka okienek jedno po drugim.

   KIEDY SIĘ POKAZUJE
   ----------------------------------------------------------------------
   PRZY KAŻDYM WEJŚCIU NA STRONĘ, także temu, kto wcześniej kliknął
   „Rozumiem”. To świadoma decyzja, a nie przeoczenie: zamknięty dzień jest
   informacją, na której komuś przepada wizyta, a ludzie i tak klikają
   „Rozumiem” odruchowo, nie czytając. Zapomnienie zamknięcia kosztuje jedno
   kliknięcie; przegapiona informacja — przyjazd pod zamknięte drzwi.

   Jedyne, co pamiętamy, to fakt zamknięcia okienka W TEJ ODSŁONIE STRONY,
   i tylko dla dokładnie tej samej listy dat. Bez tego świeża porcja danych
   z bazy zasłaniałaby stronę tuż po tym, jak ktoś ją odsłonił. Odświeżenie
   strony zaczyna od nowa i okienko wraca.

   Nasłuch jest na żywo (onSnapshot) — zaznaczenie w panelu pojawia się
   w otwartej karcie przeglądarki bez odświeżania.

   CHMURKA PRZY PRAWEJ KRAWĘDZI
   ----------------------------------------------------------------------
   Zamknięte okienko nie znika bez śladu: zostaje po nim chmurka „Ważna
   informacja” przyklejona do prawej krawędzi. Kliknięcie otwiera okienko
   z powrotem, kolejne — zamyka. Ten sam przycisk w obie strony, bo tylko
   wtedy da się go używać bez zastanowienia.

   Chmurka leży NAD przyciemnieniem okienka (wyższy z-index), inaczej po
   otwarciu byłaby zasłonięta i przełącznik działałby tylko w jedną stronę.

   KARTA GODZIN OTWARCIA
   ----------------------------------------------------------------------
   Te same dni podajemy do mc-godziny.js, który nanosi je na kartę „Godziny
   otwarcia” jako wyjątki. Grafik zostaje z wizytówki Google — wykluczenie
   niczego w nim nie nadpisuje, tylko dokłada adnotację „21 września
   nieczynne”. Google zostaje najważniejsze; wyjątek mija razem z datą.
   ========================================================================== */
import { watchPublicExclusions } from './mc-data.js';
import { ustawWyjatki } from './mc-godziny.js';
import { longDate, esc, isoDate, addDays } from './mc-common.js';

/* ---------------------------------------------------------------- STYLE --- */
/* Kolory biorą się ze zmiennych strony głównej, ale każda ma wartość
   zapasową — moduł ma działać także wtedy, gdyby ktoś wpiął go na podstronę
   bez style.css. */
const css = `
.mc-zamk{position:fixed;inset:0;z-index:190;display:flex;align-items:center;
  justify-content:center;padding:18px;background:rgba(44,53,64,.55);
  -webkit-backdrop-filter:blur(3px);backdrop-filter:blur(3px)}
.mc-zamk[hidden]{display:none}
.mc-zamk-box{position:relative;width:min(520px,100%);max-height:calc(100vh - 36px);
  overflow:auto;background:var(--white,#fff);border-radius:var(--radius-lg,28px);
  box-shadow:var(--shadow-lg,0 22px 55px rgba(44,53,64,.14));
  padding:clamp(22px,4vw,34px);animation:mcZamkWjazd .3s var(--ease,cubic-bezier(.22,.61,.36,1)) both}
@keyframes mcZamkWjazd{from{opacity:0;transform:translateY(14px) scale(.97)}to{opacity:1;transform:none}}
.mc-zamk-x{position:absolute;top:12px;right:12px;width:38px;height:38px;border:0;
  border-radius:50%;background:var(--cream,#FBF7F1);color:var(--muted,#6B7885);
  font-size:1.35rem;line-height:1;cursor:pointer}
.mc-zamk-x:hover{background:var(--cream-deep,#F3EBE0);color:var(--ink,#2C3540)}
.mc-zamk-ikona{width:54px;height:54px;border-radius:50%;display:flex;align-items:center;
  justify-content:center;background:var(--brand-pale,#E4F1F4);color:var(--brand-deep,#3E7C89);
  margin-bottom:14px}
.mc-zamk h2{font-family:var(--font-head,'Quicksand',sans-serif);color:var(--navy-deep,#2A4159);
  font-size:clamp(1.3rem,3.4vw,1.65rem);line-height:1.25;margin:0 0 8px}
.mc-zamk-lead{margin:0 0 16px;color:var(--muted,#6B7885);line-height:1.6;font-size:.96rem}
.mc-zamk-dni{list-style:none;margin:0 0 18px;padding:0;display:grid;gap:8px}
.mc-zamk-dni li{border:1px solid var(--line,#E3D9CB);border-left:4px solid var(--brand,#93C7CF);
  border-radius:var(--radius,18px);background:var(--cream,#FBF7F1);padding:11px 14px}
.mc-zamk-data{display:block;font-family:var(--font-head,'Quicksand',sans-serif);font-weight:700;
  color:var(--navy-deep,#2A4159)}
.mc-zamk-kiedy{font-weight:700;font-size:.72rem;letter-spacing:.05em;text-transform:uppercase;
  color:var(--brand-deep,#3E7C89);margin-left:8px}
.mc-zamk-notka{display:block;margin-top:2px;font-size:.9rem;color:var(--muted,#6B7885);
  line-height:1.5;overflow-wrap:anywhere}
.mc-zamk-stopka{display:flex;flex-wrap:wrap;gap:10px;align-items:center}
.mc-zamk-ok{border:0;cursor:pointer;font:inherit;font-weight:700;padding:12px 24px;
  border-radius:999px;background:var(--brand-deep,#3E7C89);color:#fff}
.mc-zamk-ok:hover{background:var(--teal-dark,#33636D)}
.mc-zamk-link{color:var(--brand-deep,#3E7C89);font-weight:700;text-decoration:none}
.mc-zamk-link:hover{text-decoration:underline}

/* Chmurka przy prawej krawędzi — wraca po zamknięciu okienka i otwiera je
   z powrotem. Leży NAD przyciemnieniem (z-index wyżej niż .mc-zamk), bo ma
   działać jak przełącznik: to samo kliknięcie zamyka to, co otworzyło. */
.mc-chmurka{position:fixed;right:0;top:50%;transform:translateY(-50%);z-index:195;
  display:flex;align-items:center;gap:8px;border:0;cursor:pointer;font:inherit;
  font-weight:700;font-size:.9rem;color:var(--white,#fff);
  background:var(--brand-deep,#3E7C89);padding:12px 16px 12px 14px;
  border-radius:var(--radius,18px) 0 0 var(--radius,18px);
  box-shadow:0 6px 20px rgba(44,53,64,.22);
  animation:mcChmurkaWjazd .35s var(--ease,cubic-bezier(.22,.61,.36,1)) both}
.mc-chmurka[hidden]{display:none}
.mc-chmurka:hover{background:var(--teal-dark,#33636D)}
.mc-chmurka:focus-visible{outline:3px solid var(--wood,#C9A87C);outline-offset:2px}
.mc-chmurka svg{flex:none}
@keyframes mcChmurkaWjazd{from{opacity:0;transform:translate(14px,-50%)}
  to{opacity:1;transform:translate(0,-50%)}}
@media (max-width:760px){
  /* Na telefonie pełny napis zasłaniałby treść — zostaje sama chmurka
     z kropką, a tekst czyta czytnik ekranu. */
  .mc-chmurka{padding:11px 12px}
  .mc-chmurka-tekst{position:absolute;width:1px;height:1px;overflow:hidden;
    clip:rect(0 0 0 0);white-space:nowrap}
}
@media (prefers-reduced-motion:reduce){.mc-zamk-box,.mc-chmurka{animation:none}}
`;

const style = document.createElement('style');
style.textContent = css;
document.head.appendChild(style);

/* ------------------------------------------------------------- POMOCNE --- */
const dzisISO  = () => isoDate(new Date());
const jutroISO = () => isoDate(addDays(new Date(), 1));

/** Czytelna etykieta przy dacie — „dziś” działa mocniej niż sama data. */
function kiedy(iso) {
  if (iso === dzisISO())  return 'dziś';
  if (iso === jutroISO()) return 'jutro';
  return '';
}

/* Lista dat, dla której ktoś już zamknął okienko w tej odsłonie strony.
   Celowo zwykła zmienna, a nie localStorage: pamięć ma zniknąć razem
   z przeładowaniem strony, żeby przy następnym wejściu okienko wróciło. */
let zamknieteDla = null;

/* ----------------------------------------------------------------- DOM --- */
const okno = document.createElement('div');
okno.className = 'mc-zamk';
okno.hidden = true;
okno.setAttribute('role', 'dialog');
okno.setAttribute('aria-modal', 'true');
okno.setAttribute('aria-labelledby', 'mcZamkTytul');

let wracaDoFokusu = null;

function zamknij(zapamietaj = true) {
  if (okno.hidden) return;
  if (zapamietaj) zamknieteDla = okno.dataset.klucz || '';
  okno.hidden = true;
  odswiezChmurke();
  /* Fokus wraca tam, skąd przyszedł — a gdy okienko otworzyło się samo,
     na chmurkę, bo to ona zostaje na ekranie jako jedyny ślad. */
  const cel = (wracaDoFokusu && wracaDoFokusu.focus && wracaDoFokusu !== document.body)
    ? wracaDoFokusu : (chmurka.hidden ? null : chmurka);
  if (cel && cel.focus) cel.focus();
  wracaDoFokusu = null;
}

/* ---- chmurka „Ważna informacja" ---------------------------------------- */
const chmurka = document.createElement('button');
chmurka.type = 'button';
chmurka.className = 'mc-chmurka';
chmurka.hidden = true;
chmurka.setAttribute('aria-expanded', 'false');
chmurka.innerHTML = `
  <svg width="26" height="26" viewBox="0 0 32 32" fill="currentColor" aria-hidden="true">
    <path d="M24.5 25h-14a6.5 6.5 0 0 1-.9-12.94A8 8 0 0 1 24.2 13.2 6 6 0 0 1 24.5 25z"/>
    <circle cx="16" cy="18" r="1.4" fill="#fff"/>
    <rect x="15" y="10.6" width="2" height="5.4" rx="1" fill="#fff"/>
  </svg>
  <span class="mc-chmurka-tekst">Ważna informacja</span>`;

/** Jedno kliknięcie w chmurkę: otwiera zamknięte okienko, zamyka otwarte. */
chmurka.addEventListener('click', () => {
  if (okno.hidden) otworz(); else zamknij();
});

function odswiezChmurke() {
  /* Chmurka ma sens tylko wtedy, gdy jest co pokazać. Zostaje widoczna także
     przy otwartym okienku — to ona je zamyka. */
  chmurka.hidden = !okno.dataset.klucz;
  chmurka.setAttribute('aria-expanded', String(!okno.hidden));
  chmurka.title = okno.hidden
    ? 'Zobacz, kiedy bawialnia jest nieczynna'
    : 'Zamknij informację';
}

function otworz() {
  wracaDoFokusu = document.activeElement;
  okno.hidden = false;
  odswiezChmurke();
  const ok = okno.querySelector('.mc-zamk-ok');
  if (ok) ok.focus();
}

okno.addEventListener('click', e => { if (e.target === okno) zamknij(); });
document.addEventListener('keydown', e => { if (e.key === 'Escape') zamknij(); });

function rysuj(dni) {
  const wiele = dni.length > 1;
  okno.innerHTML = `
    <div class="mc-zamk-box">
      <button class="mc-zamk-x" type="button" data-zamk aria-label="Zamknij">×</button>

      <div class="mc-zamk-ikona" aria-hidden="true">
        <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor"
             stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <circle cx="12" cy="12" r="9"></circle>
          <line x1="12" y1="7.5" x2="12" y2="13"></line>
          <line x1="12" y1="16.5" x2="12" y2="16.5"></line>
        </svg>
      </div>

      <h2 id="mcZamkTytul">${wiele ? 'W tych dniach bawialnia jest nieczynna'
                                    : 'Tego dnia bawialnia jest nieczynna'}</h2>
      <p class="mc-zamk-lead">
        ${wiele ? 'Nie zapraszamy wtedy gości i nie przyjmujemy rezerwacji.'
                : 'Nie zapraszamy wtedy gości i nie przyjmujemy rezerwacji na ten dzień.'}
        W pozostałe dni czekamy jak zwykle.
      </p>

      <ul class="mc-zamk-dni">
        ${dni.map(d => {
          const tag = kiedy(d.date);
          return `<li>
            <span class="mc-zamk-data">${esc(longDate(d.date))}${
              tag ? `<span class="mc-zamk-kiedy">${esc(tag)}</span>` : ''}</span>
            ${d.publicNote ? `<span class="mc-zamk-notka">${esc(d.publicNote)}</span>` : ''}
          </li>`;
        }).join('')}
      </ul>

      <div class="mc-zamk-stopka">
        <button class="mc-zamk-ok" type="button" data-zamk>Rozumiem</button>
        <a class="mc-zamk-link" href="#kontakt" data-zamk>Zobacz godziny otwarcia</a>
      </div>
    </div>`;

  okno.querySelectorAll('[data-zamk]').forEach(b => b.addEventListener('click', () => zamknij()));
}

/* Zgoda na ciasteczka ma pierwszeństwo — dwa panele naraz to jeden panel
   za dużo. Jeśli pasek zgody właśnie stoi na ekranie, czekamy, aż zniknie. */
function poZgodzieNaCiasteczka(dalej) {
  const pasek = document.getElementById('cookieBanner');
  if (!pasek || pasek.hidden) return dalej();

  const obserwator = new MutationObserver(() => {
    if (pasek.hidden) { obserwator.disconnect(); dalej(); }
  });
  obserwator.observe(pasek, { attributes: true, attributeFilter: ['hidden'] });
}

function pokaz(dni) {
  const klucz = `${dzisISO()}|${dni.map(d => d.date).join(',')}`;
  okno.dataset.klucz = klucz;
  /* Zamknął przed chwilą dokładnie to ogłoszenie — nie wracamy mu pod palce.
     Zmieniona lista ma inny klucz, więc nowy dzień przebija się od razu. */
  if (klucz === zamknieteDla) return;

  rysuj(dni);
  odswiezChmurke();
  poZgodzieNaCiasteczka(otworz);
}

/* ------------------------------------------------------------- NASŁUCH --- */
document.body.appendChild(okno);
document.body.appendChild(chmurka);

watchPublicExclusions(dni => {
  /* Kolejność i limit: lista jest już posortowana rosnąco po dacie, a dwanaście
     pozycji to i tak więcej, niż ktokolwiek przeczyta w okienku. */
  const widoczne = dni.slice(0, 12);

  /* Karta godzin dostaje te same dni, także pustą listę — cofnięte
     wykluczenie ma z niej zniknąć równie szybko, jak się pojawiło. */
  ustawWyjatki(widoczne);

  if (!widoczne.length) {                            // wykluczenie cofnięte
    okno.dataset.klucz = '';
    zamknij(false);
    odswiezChmurke();
    return;
  }
  pokaz(widoczne);
}, err => console.warn('Nie udało się pobrać dni nieczynnych.', err));
