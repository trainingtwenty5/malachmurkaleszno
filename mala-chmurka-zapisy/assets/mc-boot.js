/* ==========================================================================
   Mała Chmurka — bezpiecznik startu panelu.

   DLACZEGO TO NIE JEST MODUŁ
   --------------------------------------------------------------------------
   Panel ładuje się jako moduł ES, a ten importuje `mc-firebase.js`, który
   na samej górze robi:

       const [appMod, authMod, fsMod] = await Promise.all([ import(SDK...) ]);

   To pobranie SDK z www.gstatic.com. Jeżeli te żądania nie tyle padną, co
   UTKNĄ — rozszerzenie blokujące skrypty Google, firmowy proxy, zdechłe DNS —
   moduł nigdy nie kończy ewaluacji. Wtedy nie wykonuje się ŻADNA linijka
   skryptu panelu, łącznie z bezpiecznikami, które są w środku. Efekt: strona
   stoi na komunikacie startowym „Sprawdzam uprawnienia…" bez końca i bez
   jednego błędu w konsoli.

   Ten plik jest zwykłym skryptem (nie modułem), więc wykonuje się od razu
   i niezależnie od tego, czy moduły w ogóle się wczytają. Po kilku sekundach
   bez sygnału życia zamienia spinner na konkretną diagnozę.

   WPIĘCIE:  <script src="assets/mc-boot.js"></script>   przed modułem strony
   ========================================================================== */
(function () {
  'use strict';

  var boot = window.__mcBoot = {
    started: false,     // moduł panelu ruszył (czyli SDK się wczytało)
    settled: false,     // brama rozstrzygnięta — jest już co pokazać
    t0: Date.now()
  };

  var SDK_PROBE = 'https://www.gstatic.com/firebasejs/12.18.0/firebase-app.js';
  var WAIT_MS = 9000;

  function box(html) {
    /* panel-admina.html ma #gate, admin.html #gateBoot — bierzemy to, co jest */
    var el = document.getElementById('gate') || document.getElementById('gateBoot');
    if (!el) return;
    el.hidden = false;
    el.innerHTML = html;
  }

  /** Czy CDN z SDK jest w ogóle osiągalny z tej przeglądarki. */
  function probeCdn(done) {
    if (!window.fetch) return done(null);
    var ctl = window.AbortController ? new AbortController() : null;
    var timer = setTimeout(function () { if (ctl) ctl.abort(); done(false); }, 5000);
    fetch(SDK_PROBE, { mode: 'no-cors', cache: 'no-store', signal: ctl && ctl.signal })
      .then(function () { clearTimeout(timer); done(true); })
      .catch(function () { clearTimeout(timer); done(false); });
  }

  function actions() {
    return '<button class="btn btn-primary btn-block" onclick="location.reload()" ' +
           'style="margin-top:14px">Odśwież stronę</button>' +
           '<a class="btn btn-outline btn-block" href="diagnostyka.html" ' +
           'style="margin-top:8px">Otwórz diagnostykę bazy</a>';
  }

  function report() {
    if (boot.settled) return;

    /* 1) moduł wystartował, ale brama nie zdążyła — to problem z uprawnieniami
          albo z siecią po stronie Firebase, nie z ładowaniem skryptów */
    if (boot.started) {
      box('<div class="card"><h1 style="font-size:1.3rem">Sprawdzanie uprawnień trwa zbyt długo</h1>' +
          '<p>Skrypty panelu wczytały się poprawnie, ale nie udało się potwierdzić uprawnień. ' +
          'Najczęściej to chwilowy problem z połączeniem.</p>' + actions() + '</div>');
      return;
    }

    /* 2) moduł w ogóle nie ruszył — nie wczytał się Firebase SDK */
    probeCdn(function (reachable) {
      var why = reachable === false
        ? '<p class="hint"><strong>Nie udało się pobrać bibliotek Google</strong> ' +
          '(<code>www.gstatic.com</code>). Blokuje je zwykle rozszerzenie przeglądarki — ' +
          'uBlock, Adblock, Ghostery, „ochrona przed śledzeniem" — albo filtr sieci firmowej.</p>' +
          '<p class="hint">Sprawdź w oknie prywatnym z wyłączonymi rozszerzeniami albo na innej sieci ' +
          '(np. transmisja z telefonu). Jeśli tam działa — dodaj <code>malachmurkaleszno.pl</code> ' +
          'do wyjątków w rozszerzeniu.</p>'
        : '<p class="hint">Biblioteki Google są osiągalne, więc najpewniej to chwilowa przerwa ' +
          'w połączeniu albo stara wersja strony w pamięci przeglądarki. ' +
          'Odśwież z pominięciem pamięci: <kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>R</kbd>.</p>';

      box('<div class="card"><h1 style="font-size:1.3rem">Panel się nie wczytał</h1>' +
          '<p>Skrypty panelu nie zdążyły wystartować w ciągu ' + Math.round(WAIT_MS / 1000) +
          ' sekund.</p>' + why + actions() + '</div>');
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () { setTimeout(report, WAIT_MS); });
  } else {
    setTimeout(report, WAIT_MS);
  }
})();
