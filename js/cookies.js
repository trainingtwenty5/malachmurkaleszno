/* ==========================================================================
   Mała Chmurka — zgody na ciasteczka (Google Consent Mode v2)

   Wariant „basic": skrypt Google Analytics wczytuje się dopiero wtedy,
   gdy ktoś zgodzi się na analitykę. Bez zgody do Google nie idzie żadne
   zapytanie — także takie bez ciasteczek. Domyślny stan zgód ustawia
   krótki skrypt w <head>, jeszcze przed tym plikiem.
   ========================================================================== */
(function () {
  'use strict';

  var GA_ID = 'G-75Y10VJ9KE';

  var KLUCZ = 'mch-zgody';
  var WERSJA = 1;          // podbicie = pytamy wszystkich od nowa
  var WAZNOSC_DNI = 365;

  var banner = document.getElementById('cookieBanner');
  var panel = document.getElementById('cookiePanel');
  if (!banner || !panel) return;

  var przelacznik = document.getElementById('zgodaAnalityka');
  var gaWczytany = false;
  var ostatnioAktywny = null;

  /* ---------------------------------------------------------------
     1. Zapis decyzji
     Trzymamy ją w pamięci lokalnej, a nie w ciasteczku — nie ma
     powodu, żeby przy każdym zapytaniu wędrowała na serwer.
     --------------------------------------------------------------- */
  function wczytajDecyzje() {
    try {
      var zapis = JSON.parse(localStorage.getItem(KLUCZ));
      if (!zapis || zapis.wersja !== WERSJA) return null;
      if (Date.now() - zapis.czas > WAZNOSC_DNI * 86400000) return null;
      return zapis;
    } catch (e) {
      return null;   // tryb prywatny albo zablokowana pamięć
    }
  }

  function zapiszDecyzje(analityka) {
    try {
      localStorage.setItem(KLUCZ, JSON.stringify({
        wersja: WERSJA,
        czas: Date.now(),
        analityka: analityka
      }));
    } catch (e) {
      /* Nie da się zapisać — zgoda zadziała do końca sesji, a przy
         następnym wejściu zapytamy ponownie. Lepsze to niż udawanie,
         że mamy zgodę, której nie potrafimy udowodnić. */
    }
  }

  /* ---------------------------------------------------------------
     2. Przekazanie zgody do Google
     --------------------------------------------------------------- */
  function zastosuj(analityka) {
    if (typeof gtag === 'function') {
      gtag('consent', 'update', {
        analytics_storage: analityka ? 'granted' : 'denied'
      });
    }

    if (analityka) wczytajAnalityke();
    else usunCiasteczkaGA();
  }

  function wczytajAnalityke() {
    if (gaWczytany) return;
    gaWczytany = true;

    var skrypt = document.createElement('script');
    skrypt.async = true;
    skrypt.src = 'https://www.googletagmanager.com/gtag/js?id=' + GA_ID;
    document.head.appendChild(skrypt);

    gtag('js', new Date());
    gtag('config', GA_ID);
  }

  // Po cofnięciu zgody sam sygnał „denied" nie kasuje tego, co już leży
  // w przeglądarce — robimy to ręcznie.
  function usunCiasteczkaGA() {
    var host = location.hostname;
    var domeny = [null, host, '.' + host];
    var czesci = host.split('.');
    if (czesci.length > 2) domeny.push('.' + czesci.slice(-2).join('.'));

    document.cookie.split(';').forEach(function (wpis) {
      var nazwa = wpis.split('=')[0].trim();
      if (nazwa.indexOf('_ga') !== 0) return;

      domeny.forEach(function (domena) {
        document.cookie = nazwa + '=; Max-Age=0; path=/' +
          (domena ? '; domain=' + domena : '');
      });
    });
  }

  /* ---------------------------------------------------------------
     3. Baner i okno ustawień
     --------------------------------------------------------------- */
  function pokazBanner() { banner.hidden = false; }
  function ukryjBanner() { banner.hidden = true; }

  function otworzPanel() {
    var decyzja = wczytajDecyzje();
    przelacznik.checked = decyzja ? !!decyzja.analityka : false;

    ostatnioAktywny = document.activeElement;
    ukryjBanner();
    panel.hidden = false;
    document.body.classList.add('cookie-open');
    document.getElementById('cookiePanelClose').focus();
    document.addEventListener('keydown', obslugaKlawiszy);
  }

  function zamknijPanel() {
    panel.hidden = true;
    document.body.classList.remove('cookie-open');
    document.removeEventListener('keydown', obslugaKlawiszy);

    // Zamknięcie okna nie jest zgodą — jeśli nikt jeszcze nie wybrał,
    // wracamy do banera i pytamy dalej.
    if (!wczytajDecyzje()) pokazBanner();
    if (ostatnioAktywny && document.contains(ostatnioAktywny)) ostatnioAktywny.focus();
  }

  // Escape zamyka, Tab krąży wewnątrz okna — poza nie da się wyjść
  // klawiaturą, dopóki okno jest otwarte.
  function obslugaKlawiszy(e) {
    if (e.key === 'Escape') { zamknijPanel(); return; }
    if (e.key !== 'Tab') return;

    var elementy = panel.querySelectorAll('button, input, [href]');
    if (!elementy.length) return;

    var pierwszy = elementy[0];
    var ostatni = elementy[elementy.length - 1];

    if (e.shiftKey && document.activeElement === pierwszy) {
      e.preventDefault();
      ostatni.focus();
    } else if (!e.shiftKey && document.activeElement === ostatni) {
      e.preventDefault();
      pierwszy.focus();
    }
  }

  /* ---------------------------------------------------------------
     4. Decyzja użytkownika
     --------------------------------------------------------------- */
  function zdecyduj(analityka) {
    zapiszDecyzje(analityka);
    zastosuj(analityka);
    ukryjBanner();
    if (!panel.hidden) {
      panel.hidden = true;
      document.body.classList.remove('cookie-open');
      document.removeEventListener('keydown', obslugaKlawiszy);
    }
  }

  document.getElementById('cookieAcceptAll').addEventListener('click', function () { zdecyduj(true); });
  document.getElementById('cookieRejectAll').addEventListener('click', function () { zdecyduj(false); });
  document.getElementById('cookieCustomize').addEventListener('click', otworzPanel);

  document.getElementById('cookieSave').addEventListener('click', function () { zdecyduj(przelacznik.checked); });
  document.getElementById('cookieAcceptAllPanel').addEventListener('click', function () { zdecyduj(true); });
  document.getElementById('cookieRejectAllPanel').addEventListener('click', function () { zdecyduj(false); });
  document.getElementById('cookiePanelClose').addEventListener('click', zamknijPanel);

  // Kliknięcie w ciemne tło też zamyka — i tak samo nie jest zgodą.
  panel.addEventListener('click', function (e) {
    if (e.target === panel) zamknijPanel();
  });

  var odnosnik = document.getElementById('cookieSettingsLink');
  if (odnosnik) odnosnik.addEventListener('click', otworzPanel);

  /* ---------------------------------------------------------------
     5. Stan początkowy
     --------------------------------------------------------------- */
  var decyzja = wczytajDecyzje();

  if (decyzja) zastosuj(decyzja.analityka);
  else pokazBanner();

})();
