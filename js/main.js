/* ==========================================================================
   Mała Chmurka — skrypty strony
   Czysty JavaScript, bez zależności zewnętrznych.
   ========================================================================== */
(function () {
  'use strict';

  var reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // Sygnał dla CSS, że JS działa — dopiero wtedy elementy .reveal
  // startują jako ukryte. Bez tego treść nigdy by się nie pokazała.
  document.documentElement.classList.add('js');

  /* ---------------------------------------------------------------
     1. Header — cień i tło po przewinięciu
     --------------------------------------------------------------- */
  var header = document.querySelector('.site-header');
  var toTop = document.getElementById('toTop');
  var toTopBar = document.getElementById('toTopBar');

  // Długość konturu chmurki bierzemy wprost z kształtu — dzięki temu
  // zmiana ścieżki w HTML nie wymaga poprawiania liczby tutaj.
  var RING = toTopBar ? toTopBar.getTotalLength() : 0;
  if (toTopBar) {
    toTopBar.style.strokeDasharray = RING;
    toTopBar.style.strokeDashoffset = RING;
  }

  function onScroll() {
    var y = window.scrollY;
    if (header) header.classList.toggle('is-scrolled', y > 60);
    if (toTop) toTop.classList.toggle('is-visible', y > 600);

    // linia postępu: 0 = początek strony, pełny obrys chmurki = koniec
    if (toTopBar) {
      var max = document.documentElement.scrollHeight - window.innerHeight;
      var progress = max > 0 ? Math.min(1, Math.max(0, y / max)) : 0;
      toTopBar.style.strokeDashoffset = (RING * (1 - progress)).toFixed(2);
    }

    highlightNav();
  }

  window.addEventListener('scroll', onScroll, { passive: true });

  if (toTop) {
    toTop.addEventListener('click', function () {
      window.scrollTo({ top: 0, behavior: reducedMotion ? 'auto' : 'smooth' });
    });
  }

  /* ---------------------------------------------------------------
     2. Menu mobilne
     --------------------------------------------------------------- */
  var navToggle = document.getElementById('navToggle');
  var navMenu = document.getElementById('navMenu');

  /* Przyciemnienie pod rozwiniętym menu. Wisi na <body>, a nie w nagłówku:
     nagłówek ma własny kontekst układania, więc przyciemnienie zamknęłoby się
     w wysokości samego paska zamiast przykryć ekran. */
  var navBackdrop = null;
  if (navToggle && navMenu) {
    navBackdrop = document.createElement('div');
    navBackdrop.className = 'nav-backdrop';
    navBackdrop.hidden = true;
    document.body.appendChild(navBackdrop);
    navBackdrop.addEventListener('click', function () { closeNav(); });
  }

  /* Jedno miejsce, które ustawia stan menu — wcześniej otwieranie i zamykanie
     robiły to osobno i potrafiły się rozjechać. Klasa ląduje i na <body>,
     i na <html>: elementem przewijanym jest <html>, więc blokada tylko na
     <body> nie powstrzymywała strony przed jazdą pod otwartym menu. */
  /* Blokada przewijania strony pod otwartym menu.
     NIE robimy tego przez `overflow:hidden` na <html>. Na telefonach (przede
     wszystkim iOS) taka blokada bywa nieskuteczna, a przy okazji potrafi
     przesunąć elementy `position:fixed` — menu otwarte w połowie strony
     lądowało wtedy poza ekranem, a strona była zablokowana, więc nie dało się
     do niego dojechać. Zamiast tego unieruchamiamy <body> i przesuwamy je
     o dotychczasowe przewinięcie: strona stoi, menu trzyma się okna,
     a po zamknięciu wracamy dokładnie tam, gdzie użytkownik był. */
  var scrollPrzedMenu = 0;
  function blokujPrzewijanie(wlacz) {
    var b = document.body;
    if (wlacz) {
      scrollPrzedMenu = window.pageYOffset || document.documentElement.scrollTop || 0;
      b.style.position = 'fixed';
      b.style.top = -scrollPrzedMenu + 'px';
      b.style.left = '0';
      b.style.right = '0';
      b.style.width = '100%';
    } else {
      b.style.position = '';
      b.style.top = '';
      b.style.left = '';
      b.style.right = '';
      b.style.width = '';
      /* `instant`, bo strona ma `scroll-behavior:smooth` — bez tego powrót
         na miejsce byłby animowanym przelotem przez pół serwisu. */
      window.scrollTo({ top: scrollPrzedMenu, left: 0, behavior: 'instant' });
    }
  }

  function setNav(open) {
    if (!navToggle || !navMenu) return;
    navToggle.setAttribute('aria-expanded', String(open));
    navMenu.classList.toggle('is-open', open);
    document.body.classList.toggle('nav-open', open);
    document.documentElement.classList.toggle('nav-open', open);
    if (navBackdrop) navBackdrop.hidden = !open;
    /* Menu otwiera się zawsze od góry listy — bez tego zostawała pozycja
       z poprzedniego otwarcia i wyglądało to jak ucięta lista. */
    if (open) navMenu.scrollTop = 0;
    blokujPrzewijanie(open);
  }

  function closeNav() { setNav(false); }

  if (navToggle && navMenu) {
    navToggle.addEventListener('click', function () {
      setNav(navToggle.getAttribute('aria-expanded') !== 'true');
    });

    // Zamknij po kliknięciu w link
    navMenu.addEventListener('click', function (e) {
      /* Także `button`: „Wyloguj" nie jest linkiem, a po kliknięciu menu ma się
         zamknąć dokładnie tak samo jak po wybraniu każdej innej pozycji. */
      if (e.target.closest('a, button')) closeNav();
    });

    // Zamknij klawiszem Escape
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') closeNav();
    });

    // Zamknij przy powrocie do widoku desktopowego
    window.addEventListener('resize', function () {
      if (window.innerWidth > 860) closeNav();
    });

    // Zamknij po dotknięciu poza menu
    document.addEventListener('click', function (e) {
      if (!navMenu.classList.contains('is-open')) return;
      if (navMenu.contains(e.target) || navToggle.contains(e.target)) return;
      closeNav();
    });
  }

  /* ---------------------------------------------------------------
     3. Podświetlanie aktywnej sekcji w menu
     --------------------------------------------------------------- */
  var navLinks = Array.prototype.slice.call(
    document.querySelectorAll('.nav a[href^="#"]')
  );
  var sections = navLinks
    .map(function (link) { return document.querySelector(link.getAttribute('href')); })
    .filter(Boolean);

  function highlightNav() {
    if (!sections || !sections.length) return;

    var pos = window.scrollY + 140;
    var currentId = null;

    sections.forEach(function (section) {
      if (section.offsetTop <= pos) currentId = section.id;
    });

    navLinks.forEach(function (link) {
      link.classList.toggle('is-current', link.getAttribute('href') === '#' + currentId);
    });
  }

  /* ---------------------------------------------------------------
     3b. Klikanie w nawigację — płynne przejście do sekcji
     Liczymy pozycję sami, bo nagłówek jest przyklejony i zmienia
     wysokość po przewinięciu. Adres w pasku też aktualizujemy.
     --------------------------------------------------------------- */
  document.addEventListener('click', function (e) {
    var link = e.target.closest('a[href^="#"]');
    if (!link) return;

    var hash = link.getAttribute('href');
    if (!hash || hash === '#') return;

    var target = document.querySelector(hash);
    if (!target) return;

    e.preventDefault();
    closeNav();

    // #top to nagłówek, a ten jest position:fixed — zawsze raportuje
    // pozycję 0 względem okna, więc wyliczanie z getBoundingClientRect
    // dałoby aktualne przewinięcie, czyli brak ruchu. Stąd wyjątek.
    var top;
    if (hash === '#top') {
      top = 0;
    } else {
      // odstęp = realna wysokość nagłówka w stanie przewiniętym + oddech
      var offset = (header ? header.offsetHeight : 0) + 14;
      top = target.getBoundingClientRect().top + window.scrollY - offset;
    }

    window.scrollTo({
      top: Math.max(0, top),
      behavior: reducedMotion ? 'auto' : 'smooth'
    });

    // zachowaj kotwicę w adresie, ale bez skoku strony
    if (history.pushState) history.pushState(null, '', hash);
  });

  /* ---------------------------------------------------------------
     4. Karuzela w hero
     --------------------------------------------------------------- */
  var slidesWrap = document.getElementById('heroSlides');
  var dotsWrap = document.getElementById('heroDots');

  if (slidesWrap && dotsWrap) {
    var slides = Array.prototype.slice.call(slidesWrap.querySelectorAll('.hero-slide'));
    var index = 0;
    var timer = null;
    var DELAY = 6000;

    // Kropki nawigacyjne
    slides.forEach(function (_, i) {
      var dot = document.createElement('button');
      dot.type = 'button';
      dot.setAttribute('role', 'tab');
      dot.setAttribute('aria-label', 'Zdjęcie ' + (i + 1));
      if (i === 0) dot.classList.add('is-active');
      dot.addEventListener('click', function () { goTo(i); restart(); });
      dotsWrap.appendChild(dot);
    });

    var dots = Array.prototype.slice.call(dotsWrap.children);

    function goTo(i) {
      index = (i + slides.length) % slides.length;
      slides.forEach(function (s, n) { s.classList.toggle('is-active', n === index); });
      dots.forEach(function (d, n) {
        d.classList.toggle('is-active', n === index);
        d.setAttribute('aria-selected', String(n === index));
      });
    }

    function next() { goTo(index + 1); }

    function start() {
      if (reducedMotion || slides.length < 2) return;
      timer = window.setInterval(next, DELAY);
    }
    function stop() { window.clearInterval(timer); }
    function restart() { stop(); start(); }

    // Zatrzymaj, gdy karta jest w tle
    document.addEventListener('visibilitychange', function () {
      document.hidden ? stop() : restart();
    });

    start();
  }

  /* ---------------------------------------------------------------
     5. Pojawianie się sekcji przy przewijaniu
     --------------------------------------------------------------- */
  var revealItems = document.querySelectorAll('.reveal');

  if (!('IntersectionObserver' in window) || reducedMotion) {
    revealItems.forEach(function (el) { el.classList.add('is-visible'); });
  } else {
    var observer = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry, i) {
        if (!entry.isIntersecting) return;
        var el = entry.target;
        window.setTimeout(function () { el.classList.add('is-visible'); }, i * 70);
        observer.unobserve(el);
      });
    }, { threshold: 0.12, rootMargin: '0px 0px -60px 0px' });

    revealItems.forEach(function (el) { observer.observe(el); });

    // Bezpiecznik: jeśli chwilę po załadowaniu strony obserwator nie odsłonił
    // ani jednego elementu, znaczy że nie działa — wtedy pokazujemy wszystko,
    // żeby treść nigdy nie została ukryta na stałe.
    window.addEventListener('load', function () {
      window.setTimeout(function () {
        if (document.querySelector('.reveal.is-visible')) return;
        revealItems.forEach(function (el) { el.classList.add('is-visible'); });
      }, 1000);
    });
  }

  /* ---------------------------------------------------------------
     6. Lightbox galerii
     --------------------------------------------------------------- */
  var gallery = document.getElementById('gallery');
  var lightbox = document.getElementById('lightbox');

  if (gallery && lightbox) {
    var lbImg = document.getElementById('lightboxImg');
    var items = Array.prototype.slice.call(gallery.querySelectorAll('.gallery-item'));
    var current = 0;
    var lastFocused = null;

    function show(i) {
      current = (i + items.length) % items.length;
      var btn = items[current];
      var thumb = btn.querySelector('img');
      lbImg.src = btn.getAttribute('data-full');
      lbImg.alt = thumb ? thumb.alt : '';
    }

    function openLightbox(i) {
      lastFocused = document.activeElement;
      show(i);
      lightbox.hidden = false;
      // wymuszony reflow — dzięki niemu przejście opacity ma od czego wystartować,
      // a klasa trafia na miejsce od razu (bez czekania na klatkę animacji)
      void lightbox.offsetWidth;
      lightbox.classList.add('is-open');
      document.body.style.overflow = 'hidden';
      document.getElementById('lightboxClose').focus();
    }

    function closeLightbox() {
      lightbox.classList.remove('is-open');
      document.body.style.overflow = '';
      window.setTimeout(function () {
        lightbox.hidden = true;
        lbImg.src = '';
      }, 280);
      if (lastFocused) lastFocused.focus();
    }

    items.forEach(function (btn, i) {
      btn.addEventListener('click', function () { openLightbox(i); });
    });

    document.getElementById('lightboxClose').addEventListener('click', closeLightbox);
    document.getElementById('lightboxPrev').addEventListener('click', function () { show(current - 1); });
    document.getElementById('lightboxNext').addEventListener('click', function () { show(current + 1); });

    // Kliknięcie w tło zamyka podgląd
    lightbox.addEventListener('click', function (e) {
      if (e.target === lightbox) closeLightbox();
    });

    document.addEventListener('keydown', function (e) {
      if (lightbox.hidden) return;
      if (e.key === 'Escape') closeLightbox();
      if (e.key === 'ArrowLeft') show(current - 1);
      if (e.key === 'ArrowRight') show(current + 1);
    });
  }

  /* ---------------------------------------------------------------
     7. Rok w stopce
     --------------------------------------------------------------- */
  var year = document.getElementById('year');
  if (year) year.textContent = new Date().getFullYear();

  /* ---------------------------------------------------------------
     8. Stan początkowy — dopiero gdy wszystko jest zainicjalizowane
     --------------------------------------------------------------- */
  onScroll();

})();
