/* ==========================================================================
   Mała Chmurka — testy godzin otwarcia z wizytówki Google
   --------------------------------------------------------------------------
   Godziny przestały być wpisane w kod: bierze je `assets/mc-godziny.js`
   z wizytówki Google i przepisuje do SETTINGS.openingHours, z których żyje
   formularz rezerwacji. To wygodne i dokładnie dlatego niebezpieczne —
   pomyłka w odczycie odpowiedzi nie wywala strony, tylko po cichu ogłasza
   klientom nieprawdziwe godziny.

   Pilnujemy więc trzech rzeczy:
     • że odpowiedź Google czytamy poprawnie (także dziwne przypadki:
       doba bez `close`, zakres przez północ, dzień z przerwą),
     • że KAŻDA porażka kończy się godzinami zapasowymi, a nie tygodniem
       „nieczynne" — to najgorszy możliwy błąd tej funkcji,
     • że strona pokazuje to samo, co dostała (karta, kafelek „N dni",
       dane strukturalne).

   URUCHOMIENIE:   node tools/test-godziny.mjs   (z katalogu mala-chmurka-zapisy)
   Bez zależności i bez sieci — `fetch` jest podstawiony.
   ========================================================================== */

import { SETTINGS, GOOGLE_PLACE } from '../assets/firebase-config.js';

let pass = 0, fail = 0;
const ok = (name, cond, dump = '') => {
  if (cond) { console.log('  OK   ' + name); pass++; }
  else { console.log('  FAIL ' + name + (dump ? '\n         ' + dump : '')); fail++; }
};
const eq = (name, got, want) =>
  ok(`${name} → ${JSON.stringify(want)}`, JSON.stringify(got) === JSON.stringify(want),
     `dostałem: ${JSON.stringify(got)}`);

/* ---------------------------------------------------------------- ATRAPY --- */
/* Moduł żyje w przeglądarce: rysuje po DOM-ie i pamięta odpowiedź
   w localStorage. W Node dajemy jedno i drugie na tyle, na ile go używa. */
let pamiec = {};
let pamiecPsuje = false;
globalThis.localStorage = {
  getItem(k) {
    if (pamiecPsuje) throw new Error('SecurityError: dostęp do pamięci zablokowany');
    return Object.prototype.hasOwnProperty.call(pamiec, k) ? pamiec[k] : null;
  },
  setItem(k, v) {
    if (pamiecPsuje) throw new Error('SecurityError: dostęp do pamięci zablokowany');
    pamiec[k] = String(v);
  }
};

const PUSTY_LD = () => JSON.stringify({
  '@graph': [{ '@type': ['EntertainmentBusiness', 'CafeOrCoffeeShop'],
               openingHoursSpecification: [] }]
});

let el = {};
globalThis.document = { getElementById: id => el[id] || null };

const ZAPAS = [
  { open: '10:00', close: '15:00' },   // niedziela
  { open: '15:00', close: '19:00' },   // poniedziałek
  { open: '10:00', close: '19:00' },   // wtorek
  { open: '10:00', close: '19:00' },   // środa
  { open: '10:00', close: '19:00' },   // czwartek
  { open: '10:00', close: '19:00' },   // piątek
  null                                 // sobota
];

let wywolanFetch = 0, ostatniAdres = '';

/**
 * Jedno przejście modułu od zera: czyste SETTINGS, czysty DOM, podstawiony
 * `fetch`. Znacznik w adresie wymusza świeżą kopię modułu — inaczej Node
 * podałby tę samą, raz policzoną instancję.
 */
let licznikPrzebiegow = 0;
async function przebieg({ odpowiedz, klucz = 'KLUCZ-TESTOWY', pamiecZostaje = false } = {}) {
  /* Domyślnie każdy przebieg zaczyna od pustej pamięci podręcznej. Bez tego
     drugi scenariusz dostawałby odpowiedź pierwszego i testowałby cache
     zamiast tego, co miał testować. */
  if (!pamiecZostaje) pamiec = {};
  el = {
    mcGodziny:    { innerHTML: '' },
    mcDniOtwarte: { textContent: '' },
    mcDaneFirmy:  { textContent: PUSTY_LD() }
  };
  SETTINGS.openingHours = ZAPAS.map(d => (d ? { ...d } : null));
  GOOGLE_PLACE.apiKey = klucz;
  wywolanFetch = 0;

  globalThis.fetch = async adres => {
    wywolanFetch++; ostatniAdres = adres;
    if (typeof odpowiedz === 'function') return odpowiedz();
    return { ok: true, json: async () => odpowiedz };
  };

  const mod = await import(`../assets/mc-godziny.js?p=${++licznikPrzebiegow}`);
  await mod.godzinyGotowe;
  return mod;
}

const okresy = (...pary) => ({
  regularOpeningHours: {
    periods: pary.map(([d, o, c]) => ({
      open:  { day: d, hour: +o.slice(0, 2), minute: +o.slice(3) },
      close: c === null ? undefined
           : { day: c[0], hour: +c[1].slice(0, 2), minute: +c[1].slice(3) }
    }))
  }
});

/* Dokładnie to, co pokazuje dziś wizytówka. Soboty nie ma w ogóle — Google
   nie wysyła „dnia zamkniętego", tylko pomija go w liście okresów. */
const TYDZIEN = okresy(
  [0, '10:00', [0, '15:00']], [1, '15:00', [1, '19:00']], [2, '10:00', [2, '19:00']],
  [3, '10:00', [3, '19:00']], [4, '10:00', [4, '19:00']], [5, '10:00', [5, '19:00']]);

/* ==================================================== ODCZYT ODPOWIEDZI === */
console.log('\n=== ODCZYT ODPOWIEDZI GOOGLE ===');
{
  await przebieg({ odpowiedz: TYDZIEN });

  eq('cały tydzień trafia do SETTINGS w kolejności JS (0 = niedziela)',
     SETTINGS.openingHours, [
       { open: '10:00', close: '15:00' }, { open: '15:00', close: '19:00' },
       { open: '10:00', close: '19:00' }, { open: '10:00', close: '19:00' },
       { open: '10:00', close: '19:00' }, { open: '10:00', close: '19:00' }, null]);
  ok('dzień pominięty przez Google to null, a nie godziny zerowe',
     SETTINGS.openingHours[6] === null);
  ok('pytamy tylko o godziny i tylko o naszą wizytówkę',
     /fields=regularOpeningHours/.test(ostatniAdres)
     && ostatniAdres.includes(GOOGLE_PLACE.placeId));
  ok('odpowiedź ląduje w pamięci podręcznej',
     typeof pamiec['mc-godziny-google'] === 'string');
}

console.log('\n=== DZIWNE, ALE PRAWDZIWE PRZYPADKI ===');
{
  await przebieg({ odpowiedz: okresy([2, '00:00', null]) });
  eq('doba bez godziny zamknięcia to 00:00–23:59',
     SETTINGS.openingHours[2], { open: '00:00', close: '23:59' });

  await przebieg({ odpowiedz: okresy([5, '18:00', [6, '02:00']]) });
  eq('zakres przez północ docinamy do końca dnia',
     SETTINGS.openingHours[5], { open: '18:00', close: '23:59' });
  ok('noc nie otwiera przypadkiem soboty', SETTINGS.openingHours[6] === null);

  await przebieg({ odpowiedz: okresy([2, '15:00', [2, '19:00']], [2, '10:00', [2, '13:00']]) });
  eq('dzień z przerwą: formularz dostaje kopertę od pierwszego otwarcia do ostatniego zamknięcia',
     SETTINGS.openingHours[2], { open: '10:00', close: '19:00' });
  ok('…a karta na stronie pokazuje oba przedziały',
     /Wtorek<\/span><span>10:00 – 13:00, 15:00 – 19:00</.test(el.mcGodziny.innerHTML),
     el.mcGodziny.innerHTML);
}

/* ================================================== PORAŻKI SĄ CICHE ====== */
/* Najważniejsza część pliku. Każdy z tych przypadków MUSI skończyć się
   godzinami zapasowymi — nigdy tygodniem „nieczynne". */
console.log('\n=== KAŻDA PORAŻKA KOŃCZY SIĘ GODZINAMI ZAPASOWYMI ===');
{
  await przebieg({ odpowiedz: TYDZIEN, klucz: '' });
  eq('bez klucza API zostają godziny z konfiguracji', SETTINGS.openingHours, ZAPAS);
  eq('…i nie pytamy Google w ogóle', wywolanFetch, 0);

  await przebieg({ odpowiedz: { error: { code: 403, message: 'API key not valid' } } });
  eq('błąd zwrócony jako JSON nie kasuje godzin', SETTINGS.openingHours, ZAPAS);
  ok('błędnej odpowiedzi nie zapamiętujemy', !pamiec['mc-godziny-google']);

  await przebieg({ odpowiedz: () => ({ ok: false, status: 429, json: async () => ({}) }) });
  eq('przekroczony limit zapytań nie kasuje godzin', SETTINGS.openingHours, ZAPAS);

  await przebieg({ odpowiedz: { regularOpeningHours: { periods: [] } } });
  eq('wizytówka bez godzin to brak danych, a nie „nieczynne przez cały tydzień"',
     SETTINGS.openingHours, ZAPAS);

  await przebieg({ odpowiedz: () => { throw new Error('Failed to fetch'); } });
  eq('zerwane połączenie nie kasuje godzin', SETTINGS.openingHours, ZAPAS);

  pamiecPsuje = true;
  await przebieg({ odpowiedz: TYDZIEN });
  eq('zablokowana pamięć przeglądarki nie przeszkadza w pobraniu',
     SETTINGS.openingHours[1], { open: '15:00', close: '19:00' });
  pamiecPsuje = false;
}

/* ======================================== PAMIĘĆ PODRĘCZNA ================ */
console.log('\n=== PAMIĘĆ PODRĘCZNA ===');
{
  await przebieg({ odpowiedz: TYDZIEN });
  eq('pierwsze wejście pyta Google', wywolanFetch, 1);

  await przebieg({ odpowiedz: TYDZIEN, pamiecZostaje: true });
  eq('drugie wejście w ciągu sześciu godzin już nie pyta', wywolanFetch, 0);
  eq('…a godziny są te same', SETTINGS.openingHours[0], { open: '10:00', close: '15:00' });

  const stare = JSON.parse(pamiec['mc-godziny-google']);
  stare.at = Date.now() - (GOOGLE_PLACE.cacheMinutes + 1) * 60000;
  pamiec['mc-godziny-google'] = JSON.stringify(stare);
  await przebieg({ odpowiedz: TYDZIEN, pamiecZostaje: true });
  eq('po wygaśnięciu pytamy ponownie', wywolanFetch, 1);

  pamiec['mc-godziny-google'] = 'to nie jest JSON';
  await przebieg({ odpowiedz: TYDZIEN, pamiecZostaje: true });
  eq('uszkodzony wpis w pamięci traktujemy jak brak wpisu', wywolanFetch, 1);
}

/* ============================================= CO WIDAĆ NA STRONIE ======== */
console.log('\n=== CO WIDAĆ NA STRONIE ===');
{
  await przebieg({ odpowiedz: TYDZIEN });

  const html = el.mcGodziny.innerHTML;
  ok('tydzień zaczyna się od poniedziałku, nie od niedzieli',
     html.indexOf('Poniedziałek') < html.indexOf('Niedziela'));
  ok('dzień zamknięty pisze „nieczynne", a nie puste godziny',
     /Sobota<\/span><span>nieczynne</.test(html), html);
  ok('sobota i niedziela mają klasę weekendu',
     (html.match(/is-weekend/g) || []).length === 2);
  ok('dzisiejszy dzień jest wyróżniony',
     html.includes('is-today'), html);

  eq('kafelek liczy dni otwarte, a nie dni tygodnia', el.mcDniOtwarte.textContent, '6 dni');

  const ld = JSON.parse(el.mcDaneFirmy.textContent)['@graph'][0].openingHoursSpecification;
  eq('dane strukturalne opisują tylko dni otwarte', ld.length, 6);
  ok('…i nie wspominają o sobocie', !ld.some(w => w.dayOfWeek === 'Saturday'));
  eq('niedziela w danych strukturalnych', ld.find(w => w.dayOfWeek === 'Sunday'),
     { '@type': 'OpeningHoursSpecification', dayOfWeek: 'Sunday', opens: '10:00', closes: '15:00' });

  /* Strona bez tych elementów (np. formularz rezerwacji) ma po prostu wziąć
     dane i nic nie malować — bez wyjątku w konsoli. */
  el = {};
  await przebieg({ odpowiedz: TYDZIEN });
  ok('podstrona bez karty godzin nie wywala się na rysowaniu',
     SETTINGS.openingHours[6] === null);
}

console.log('\n=== GODZINY NA KONKRETNE DATY (currentOpeningHours) ===');
{
  /* Te same okresy co w tygodniu, ale z datami — Google dokłada je w polu
     `currentOpeningHours` na najbliższe siedem dni i uwzględnia w nich
     godziny specjalne. To jedyne źródło, z którego da się odczytać, że
     akurat w ten piątek jest zamknięte. */
  const zData = (r, m, d, h, mi) => ({ date: { year: r, month: m, day: d }, hour: h, minute: mi, day: 5 });
  const odpowiedz = {
    ...TYDZIEN,
    currentOpeningHours: { periods: [
      { open: zData(2026, 9, 18, 10, 0), close: zData(2026, 9, 18, 19, 0) },
      { open: zData(2026, 9, 20, 10, 0), close: zData(2026, 9, 20, 15, 0) }
    ] }
  };

  const mod = await przebieg({ odpowiedz });
  eq('daty rozkładają się na mapę dzień → godziny',
     mod.GODZINY_WG_DAT,
     { '2026-09-18': [{ open: '10:00', close: '19:00' }],
       '2026-09-20': [{ open: '10:00', close: '15:00' }] });
  ok('pytamy Google także o godziny na konkretne daty',
     /fields=regularOpeningHours,currentOpeningHours/.test(ostatniAdres), ostatniAdres);

  /* Wizytówka bez godzin specjalnych po prostu nie ma tego pola. To nie błąd:
     zostaje sam tygodniowy grafik, a odstępstw nie znamy. */
  const bez = await przebieg({ odpowiedz: TYDZIEN });
  eq('brak currentOpeningHours nie jest błędem', bez.GODZINY_WG_DAT, {});
  eq('…a zwykłe godziny i tak wchodzą', SETTINGS.openingHours[1], { open: '15:00', close: '19:00' });

  /* Zapis zapamiętany starszą wersją strony nie ma pola `wgDat`. Gdybyśmy go
     przyjęli, panel uznałby, że w najbliższym tygodniu nic nie jest zamknięte
     — i przegapił jednorazowe zamknięcie. Lepiej zapytać Google jeszcze raz. */
  pamiec['mc-godziny-google'] = JSON.stringify({ at: Date.now(), dni: ZAPAS.map(d => d ? { ranges: [d] } : null) });
  await przebieg({ odpowiedz, pamiecZostaje: true });
  eq('stary wpis w pamięci (bez dat) wymusza ponowne pytanie', wywolanFetch, 1);
}

/* Sprzątamy po sobie: zostawiamy konfigurację taką, jaka leży w repozytorium. */
GOOGLE_PLACE.apiKey = '';

console.log(`\n================  ${pass} zaliczonych, ${fail} niezaliczonych  ================\n`);
process.exit(fail ? 1 : 0);
