/* ==========================================================================
   Mała Chmurka — konfiguracja Firebase
   --------------------------------------------------------------------------
   Poniższy obiekt FIREBASE_CONFIG jest przepisany 1:1 z Twojego index.html
   (projekt „mala-chmurka-leszno"). To NIE jest sekret — klucz `apiKey` w
   Firebase jest z założenia publiczny i widać go w każdej stronie webowej.
   O bezpieczeństwo dbają Authentication + reguły z pliku `firestore.rules`.

   Gdybyś kiedyś zakładał projekt od nowa:
   1. https://console.firebase.google.com  →  „Dodaj projekt"
   2. „Build → Firestore Database" → Utwórz bazę (tryb produkcyjny,
      lokalizacja: eur3 lub europe-central2)
   3. „Build → Authentication" → Sign-in method → włącz „E-mail/hasło"
      ORAZ „Google" (Google jest wygodniejszy — patrz ADMIN_EMAILS niżej)
   4. Ikonka zębatki → Ustawienia projektu → „Twoje aplikacje" → ikona </>
      → zarejestruj aplikację webową → skopiuj obiekt firebaseConfig TUTAJ.
   ========================================================================== */

export const FIREBASE_CONFIG = {
  apiKey:            "AIzaSyA0BTvvpqOOXResnbgwsNCcYet_8hCK3l8",
  authDomain:        "mala-chmurka-leszno.firebaseapp.com",
  projectId:         "mala-chmurka-leszno",
  storageBucket:     "mala-chmurka-leszno.firebasestorage.app",
  messagingSenderId: "348022877433",
  appId:             "1:348022877433:web:d975259d2d6dd246850628",
  measurementId:     "G-C5KJS0D4KB"
};

/* Wersja Firebase JS SDK ładowana z CDN Google. Trzymana w jednym miejscu —
   gdyby kiedyś trzeba było podbić wersję, zmieniasz tylko tę linijkę. */
export const SDK = "https://www.gstatic.com/firebasejs/12.18.0";

/* ==========================================================================
   KTO JEST ADMINISTRATOREM
   --------------------------------------------------------------------------
   Ta lista służy WYŁĄCZNIE do tego, żeby przeglądarka wiedziała, czy pokazać
   panel. Prawdziwą blokadę stawia Firestore — dokładnie ta sama lista jest
   w pliku `firestore.rules` (funkcja `adminEmails()`) i to ona decyduje,
   czy zapis do bazy w ogóle dojdzie do skutku.

   >>> ZMIENIASZ TU? ZMIEŃ TAKŻE W firestore.rules I OPUBLIKUJ REGUŁY. <<<

   Adres e-mail nie jest sekretem — hasła ani kluczy nie ma w tym pliku
   i nigdy nie może tu być.
   ========================================================================== */
export const ADMIN_EMAILS = [
  'velorwr16@gmail.com',
  'malachmurka.leszno@gmail.com'
];

/* Czy adres z listy musi być potwierdzony (kliknięty link z maila)?
   TAK = zalecane. Bez tego ktoś, kto pierwszy założy konto na Twój adres
   e-mail, dostałby uprawnienia. Logowanie przez Google potwierdza adres
   automatycznie, więc najprościej wchodzić do panelu przyciskiem Google.
   Ta sama zasada jest zaszyta w firestore.rules — zmiana tutaj samej
   niczego nie odblokuje. */
export const REQUIRE_VERIFIED_EMAIL = true;

/* -------------------------------------------------------------------------
   Ustawienia lokalu — te wartości można zmienić bez ruszania reszty kodu.
   ------------------------------------------------------------------------- */
export const SETTINGS = {
  brand:        "Mała Chmurka",
  homeUrl:      "/",                       // dokąd wraca przycisk „Powrót"
  logoUrl:      "/img/logo-full.svg",      // znak z oryginalnej strony (maska SVG)

  /* Katalog, w którym leżą pliki systemu zapisów — licząc od katalogu strony.
     TERAZ (lokalnie): pliki siedzą w podfolderze /mala-chmurka-zapisy/.
     PO PRZENIESIENIU do katalogu głównego strony wpisz tu po prostu "/". */
  appBase:      "/mala-chmurka-zapisy/",

  capacity:     6,                          // ile dzieci mieści się jednocześnie
  visitsBase:   266,                        // licznik odwiedzin startuje od tej liczby

  phone:        "726 431 978",
  phoneHref:    "+48726431978",
  email:        "malachmurka.leszno@gmail.com",
  address:      "ul. Armii Krajowej 15 (1. piętro)",
  city:         "64-100 Leszno",

  bankAccount:  "XXX XXXX XXX XXXX",       // <- podmień na prawdziwy numer konta
  bankName:     "Mała Chmurka, ul. Armii Krajowej 15, 64-100 Leszno",

  instagram:    "https://www.instagram.com/malachmurka.leszno/",
  facebook:     "https://www.facebook.com/profile.php?id=61573206205142",

  /* domyślne godziny siatki kalendarza */
  dayStart:     "08:00",
  dayEnd:       "20:00",

  /* domyślne metody płatności podpowiadane przy tworzeniu zajęć */
  paymentMethods: ["Płatność na miejscu", "Przelew bankowy"]
};

/** Adres podstrony systemu zapisów — działa i lokalnie, i po przeniesieniu
    plików do katalogu głównego (wtedy appBase = "/"). */
export const appUrl = (file = '') =>
  (SETTINGS.appBase.endsWith('/') ? SETTINGS.appBase : SETTINGS.appBase + '/') + file;
