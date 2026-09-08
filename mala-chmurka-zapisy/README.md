# Mała Chmurka — system zapisów na zajęcia + panel admina

Kompletny system rezerwacji dla malachmurkaleszno.pl oparty na **Firebase (Firestore + Auth)**.
Nie potrzebujesz serwera ani backendu — wszystko to statyczne pliki + baza w chmurze Google.

**Stan na dziś: wszystko jest wpięte lokalnie.** Pliki leżą w podfolderze
`mala-chmurka-zapisy/`, a `index.html` ma już trzy wklejki (przyciski w hero, link
w menu i stopce, licznik przed `</body>`). Nic nie zostało wysłane na serwer —
patrz [„Uruchomienie lokalne”](#uruchomienie-lokalne) i [„Publikacja”](#publikacja).

---

## Co jest w paczce

| Plik | Do czego służy |
|---|---|
| `kalendarz-zajec.html` | Grafik tygodniowy dla klientów. Kliknięcie w kafelek → strona zajęć. |
| `strona-zajec.html` | Szczegóły zajęć (opis, zdjęcia, cena, wolne miejsca) + „Kup teraz”. |
| `zapisz-sie-na-zajecia.html` | Formularz zapisu. Wypełnia się sam danymi z klikniętego kafelka. |
| `zapisz-sie-na-zajęcia.html` | Przekierowanie z polskiej nazwy pliku na wersję bez ogonków. |
| **`rezerwacja-bawialni.html`** | **Rezerwacja samego wstępu — cena nalicza się na żywo.** |
| **`historia-zamowien.html`** | **Historia klienta: rezerwacje i zajęcia ze statusami.** |
| `dziekujemy-rezerwacja.html` | Podziękowanie po rezerwacji + 3 kroki „co dalej". |
| `logowanie.html` | Logowanie klienta (e-mail + hasło, Google, reset hasła). |
| `dziekujemy.html` | Podziękowanie: podsumowanie, numer konta, kontakt. |
| **`admin.html`** | **Ekran logowania administratora + zarządzanie zajęciami.** |
| `panel-admina.html` | Pełny panel z 7 zakładkami (kalendarz, zapisani, licznik, ranking, rezerwacje, czas zabawy, finanse). |
| `assets/firebase-config.js` | Konfiguracja Firebase **i lista administratorów**. |
| `assets/mc-firebase.js` | Inicjalizacja SDK + sprawdzanie uprawnień. |
| `assets/mc-licznik.js` | Licznik dzieci na stronie głównej (jedna linijka w index.html). |
| `assets/mc-common.css/.js` | Wspólny wygląd: navbar i stopka 1:1 jak na malachmurkaleszno.pl. |
| `assets/mc-data.js` | Cała logika bazy danych. |
| **`assets/mc-cennik.js`** | **Cennik bawialni: taryfy, święta, progi wiekowe, zniżki.** |
| **`assets/mc-dzieci.js`** | **Pamięć dzieci — podpowiedzi przy kolejnym zapisie.** |
| **`assets/mc-finanse.js`** | **Finanse: wspólny kształt transakcji, agregaty i wykresy SVG.** |
| **`firestore.rules`** | **Reguły bezpieczeństwa — jedyne prawdziwe zabezpieczenie panelu.** |
| `tools/set-admin-claim.mjs` | Jednorazowy skrypt nadający custom claim `admin: true`. |
| `tools/test-rules.mjs` | 82 testy reguł na emulatorze — dowód, że blokady działają. |
| `tools/test-ui.mjs` | 16 testów formularza zapisu (kroki, link w opisie) — sam Node. |
| `tools/test-cennik.mjs` | 47 testów naliczania ceny wstępu — sam Node. |
| `tools/test-zapisy.mjs` | 98 testów: terminy, godziny otwarcia, serie zajęć — sam Node. |
| `tools/test-licznik.mjs` | 33 testy licznika dzieci w bawialni — sam Node. |
| `tools/test-brama.mjs` | 10 testów bramy uprawnień (zawieszony token) — sam Node. |
| `tools/test-ranking.mjs` | 17 testów rankingu wizyt w bawialni — sam Node. |
| `tools/test-czas.mjs` | 58 testów zakładki „Czas zabawy” (odliczanie, opłata) — sam Node. |
| `tools/test-galeria.mjs` | 85 testów galerii zdjęć zajęć i podglądu — sam Node. |
| `tools/test-finanse.mjs` | 214 testów zakładki „Finanse” (przychód, wejścia, arkusz CSV) — sam Node. |
| **`diagnostyka.html`** | **Sprawdza, czy reguły w Firebase są aktualne — bez zgadywania.** |
| `assets/mc-boot.js` | Bezpiecznik startu panelu — zwykły skrypt, działa gdy moduły padną. |
| `snippety-do-index.txt` | Wklejki do `index.html` (już zastosowane). |

Każda podstrona ma w lewym górnym rogu przycisk **← Powrót do strony głównej**,
oryginalny navbar i oryginalną stopkę.

---

## Uruchomienie lokalne

Podstrony używają modułów ES i adresów typu `/img/logo-full.svg`, więc **nie
otwieraj ich podwójnym kliknięciem** (`file://` zablokuje moduły). Odpal prosty
serwer w katalogu strony (tam, gdzie leży `index.html`):

```bash
python -m http.server 5500
```

Potem w przeglądarce:

| Adres | Co zobaczysz |
|---|---|
| `http://localhost:5500/` | strona główna z licznikiem i nowymi przyciskami |
| `http://localhost:5500/mala-chmurka-zapisy/kalendarz-zajec.html` | grafik zajęć |
| `http://localhost:5500/mala-chmurka-zapisy/admin.html` | logowanie administratora |

Żeby logowanie działało z `localhost`, w Firebase Console →
**Authentication → Settings → Authorized domains** musi być wpis `localhost`
(Firebase dodaje go domyślnie).

---

## Krok 1 — projekt w Firebase

Projekt **`mala-chmurka-leszno`** już istnieje i jego konfiguracja jest wpisana
w `assets/firebase-config.js` (przepisana 1:1 z bloku, który masz w `index.html`).
Zostaje włączyć to, z czego korzysta system:

1. **Build → Firestore Database → Utwórz bazę** → tryb produkcyjny → lokalizacja
   `eur3` lub `europe-central2`.
2. **Build → Authentication → Sign-in method** → włącz **E-mail/hasło** oraz **Google**.
3. **Authentication → Settings → Authorized domains** → dopisz `malachmurkaleszno.pl`.

> Klucz `apiKey` w Firebase **nie jest hasłem** — jest publiczny z założenia
> i widać go w kodzie każdej strony webowej. Bezpieczeństwa pilnują
> Authentication + reguły z kroku 2. **W kodzie front-endu nie ma i nie może być
> żadnego hasła administratora ani klucza serwisowego.**

## Krok 2 — reguły bezpieczeństwa (najważniejszy krok)

Firestore → zakładka **Rules** → wklej całą zawartość `firestore.rules` → **Publish**.
Albo z terminala: `firebase deploy --only firestore:rules`.

Bez tego kroku baza stoi otworem — ukrycie panelu w HTML-u **niczego nie chroni**,
bo każdy może otworzyć konsolę przeglądarki i wysłać zapis ręcznie.
Szczegóły: [„Bezpieczeństwo”](#bezpieczeństwo--jak-to-działa) niżej.

## Krok 3 — konta administratorów

Dostęp mają dokładnie trzy adresy — są wpisane w `firestore.rules` (funkcja
`adminEmails()`) i w `assets/firebase-config.js` (stała `ADMIN_EMAILS`):

```
velorwr16@gmail.com
malachmurka.leszno@gmail.com
buchar123@gmail.com
```

Żeby wejść do panelu:

1. Otwórz `admin.html`.
2. Kliknij **„Zaloguj przez Google”** i wybierz konto Gmail z listy — **to
   najprostsza droga**, bo Google od razu potwierdza adres e-mail.
3. Panel pojawia się natychmiast.

Jeżeli wolisz e-mail + hasło: zakładka **„Pierwsze logowanie”** → ustaw hasło →
system wyśle link potwierdzający na tę skrzynkę → kliknij go → wróć i zaloguj się.
Potwierdzenie adresu jest wymagane celowo: bez niego ktokolwiek mógłby założyć
konto na nieużywany jeszcze adres z listy i wejść do panelu.

**Dodanie/usunięcie administratora** = zmiana listy w **dwóch** miejscach:
`assets/firebase-config.js` (żeby panel się pokazał) **i** `firestore.rules`
(żeby baza przepuściła zapis) — a potem ponowna publikacja reguł.

## Krok 4 — pierwsze zajęcia

W `admin.html` kliknij **„+ Nowe zajęcia”**: nazwa, kolor, liczba miejsc, cena,
wiek, opisy, zdjęcia, metody płatności. Pole **„Powiel na kolejne tygodnie”**
tworzy od razu np. 12 kolejnych terminów.

Pełny panel (`panel-admina.html`) daje do tego widok siatki tygodniowej,
zakładkę **Zapisani**, **Licznik w bawialni** i **Ranking wizyt**.

Wszystko, co tu wpiszesz, ląduje automatycznie na stronie zajęć i na liście
w formularzu zapisu.

---

## Bezpieczeństwo — jak to działa

### Zasada dla zajęć (kolekcja `events`) i ich zdjęć (`eventImages`)

| Operacja | Kto |
|---|---|
| READ | wszyscy (grafik i galeria mają być publiczne) |
| CREATE | tylko administrator |
| UPDATE | tylko administrator |
| DELETE | tylko administrator |

### Kto jest administratorem — dwie drogi

**Droga A (działa od razu, bez backendu): lista adresów w regułach.**
`firestore.rules` sprawdza `request.auth.token.email` względem listy
`adminEmails()` **oraz** wymaga `email_verified == true`. Adres e-mail nie jest
sekretem, więc trzymanie go w regułach jest bezpieczne — reguł nie da się
podmienić z przeglądarki, bo wykonują się na serwerach Google.

**Droga B (mocniejsza, zalecana docelowo): custom claim `admin: true`.**
Claim wystawia Firebase Admin SDK i wędruje w podpisanym tokenie — nie zależy
od adresu e-mail i nie da się go podrobić. Wymaga jednak uruchomienia kodu
z uprawnieniami serwerowymi, a ta strona backendu nie ma. Dlatego jest to
**jednorazowy skrypt uruchamiany z Twojego komputera**, nie część strony:

```bash
cd mala-chmurka-zapisy
npm install firebase-admin
node tools/set-admin-claim.mjs "C:\ścieżka\do\klucza-serwisowego.json"
```

Klucz serwisowy pobierasz z Firebase Console → Ustawienia projektu →
**Konta usługi → Wygeneruj nowy klucz prywatny**. **Ten plik to prawdziwy
sekret** — trzymaj go poza projektem, nie commituj (`.gitignore` już go blokuje)
i nigdy nie wgrywaj na stronę. Po nadaniu claimu wyloguj się i zaloguj ponownie,
żeby token się odświeżył.

Reguły akceptują **obie** drogi — claim ma pierwszeństwo, lista adresów jest
zabezpieczeniem na wypadek, gdyby claim nie został jeszcze nadany.

### „Missing or insufficient permissions" — co to znaczy

Ten komunikat prawie zawsze znaczy jedno: **w konsoli Firebase wisi starsza wersja reguł
niż w repozytorium**. Reguł nie publikuje wgranie plików na serwer — to osobny krok
w konsoli, który trzeba powtórzyć po każdej zmianie `firestore.rules`.

Typowy objaw: strona ładuje się poprawnie, grafik i liczniki działają (bo te reguły
były już opublikowane wcześniej), ale zapis formularza kończy się błędem — bo nowa
kolekcja, której dotyczy, nie ma jeszcze swojej sekcji w opublikowanych regułach
i wpada w domyślną blokadę.

**Otwórz `diagnostyka.html`** — strona odpytuje bazę kilkoma bezpiecznymi zapytaniami
i mówi wprost, czy problem leży w regułach, czy gdzie indziej. Po zalogowaniu kontem
administratora robi dodatkowo test zapisu rezerwacji: tworzy próbny wpis i od razu go
kasuje. To jedyny test, który rozstrzyga sprawę w stu procentach.

Naprawa zajmuje minutę: Firebase Console → Firestore Database → **Rules** → wklej całą
zawartość `firestore.rules` → **Publish**. Albo z terminala, w katalogu
`mala-chmurka-zapisy`:

```bash
npx firebase deploy --only firestore:rules
```

### Panel stoi na „Sprawdzam uprawnienia…"

Panel ładuje się jako moduł ES, a ten importuje `mc-firebase.js`, który na samej
górze pobiera Firebase SDK z `www.gstatic.com`. Jeżeli te żądania nie tyle padną,
co **utkną** — rozszerzenie blokujące skrypty Google (uBlock, Adblock, Ghostery,
„ochrona przed śledzeniem"), firmowy proxy, zdechłe DNS — moduł nigdy nie kończy
ewaluacji. Wtedy nie wykonuje się **ani jedna linijka** skryptu panelu, więc żaden
bezpiecznik umieszczony w środku nie zadziała. Strona stoi na komunikacie
startowym bez końca i bez jednego błędu w konsoli.

Dlatego `assets/mc-boot.js` jest **zwykłym skryptem, nie modułem** — wykonuje się
od razu i niezależnie od tego, czy moduły w ogóle się wczytają. Po 9 sekundach bez
sygnału życia zamienia spinner na konkretną diagnozę i rozróżnia dwa przypadki:

* **moduł w ogóle nie ruszył** — sprawdza jeszcze, czy `www.gstatic.com` jest
  osiągalny, i jeśli nie, wprost pisze, że blokuje go rozszerzenie albo filtr sieci,
  z podpowiedzią, żeby spróbować w oknie prywatnym lub na innej sieci;
* **moduł ruszył, ale brama nie zdążyła** — to już problem z samym potwierdzeniem
  uprawnień, nie z ładowaniem skryptów.

Do tego `mc-firebase.js` ma 15-sekundowy limit na pobranie SDK, żeby zablokowane
żądanie przerwało się głośnym błędem w konsoli, zamiast wisieć w nieskończoność.

### Skąd wiadomo, że reguły faktycznie działają

W `tools/test-rules.mjs` jest gotowy zestaw **82 testów** uruchamianych na
lokalnym emulatorze Firestore (nie dotyka prawdziwej bazy). Sprawdza m.in.:
odczyt zajęć przez anonima, odrzucenie CREATE/UPDATE/DELETE dla anonima i dla
zalogowanego klienta, przejście CREATE/UPDATE/DELETE dla obu adresów z listy,
odrzucenie admina z niepotwierdzonym adresem, próbę podszycia się adresem
`velorwr16@gmail.com.evil.pl`, custom claim, granice wyjątku na `booked`,
ochronę danych osobowych w `registrations` oraz realne ścieżki kodu z
`mc-data.js` (transakcja rezerwująca miejsce i `increment` licznika odwiedzin).

```bash
cd mala-chmurka-zapisy
npm install --no-save @firebase/rules-unit-testing firebase firebase-tools
npx firebase emulators:exec --only firestore --project demo-mc "node tools/test-rules.mjs"
```

Wymaga zainstalowanej Javy. Stan po ostatnim uruchomieniu: **58 zaliczonych, 0 niezaliczonych.**
Uruchom to ponownie za każdym razem, gdy zmienisz `firestore.rules`.

Formularze i cennik mają osobne, lekkie zestawy — bez emulatora i bez żadnych
zależności, sam Node:

```bash
node tools/test-ui.mjs      # 16 testów: kroki zapisu, link w opisie zajęć
node tools/test-cennik.mjs  # 47 testów: taryfy, święta, progi wiekowe, zniżki
node tools/test-zapisy.mjs  # 77 testów: terminy, godziny otwarcia, numer rezerwacji
node tools/test-licznik.mjs # 33 testy: licznik dzieci w bawialni
node tools/test-brama.mjs   # 10 testów: brama uprawnień, zawieszony token
node tools/test-ranking.mjs # 17 testów: ranking wizyt w bawialni
node tools/test-czas.mjs    # 58 testów: czas zabawy, odliczanie, stan opłaty
node tools/test-galeria.mjs # 85 testów: zdjęcia zajęć, kolejność, plan zapisu, podgląd
node tools/test-finanse.mjs # 214 testów: przychód, okresy, wejścia przy drzwiach, CSV
```

### Czego panel *nie* chroni

Ukrycie `#app` w HTML i sprawdzanie uprawnień w JavaScripcie to **wyłącznie
wygoda dla oka**. Gdyby ktoś podmienił ten kod w swojej przeglądarce, zobaczyłby
puste formularze — a każdy zapis i tak odbiłby się od reguł Firestore
komunikatem `permission-denied`. Jedynym realnym zabezpieczeniem są reguły.

### Jeden świadomy wyjątek od „UPDATE tylko admin”

Publiczny formularz zapisu musi umieć „zająć miejsce”, czyli podbić w zajęciach
pole `booked`. Reguła `onlySeatCounterChanged()` przepuszcza **wyłącznie** taką
zmianę: tylko to jedno pole, tylko w górę, maksymalnie o 10 naraz, nigdy powyżej
`capacity` i tylko w zajęciach oznaczonych jako widoczne. Nazwy, ceny, daty ani
opisu klient nie ruszy.

Jeżeli wolisz absolutnie zero zapisu dla klientów — w `firestore.rules` zmień
ciało funkcji `seatReservationEnabled()` na `return false;`. Wtedy zgłoszenia
nadal będą wpadać, ale liczbę wolnych miejsc trzeba prowadzić ręcznie w panelu.

### Reszta bazy

| Kolekcja | READ | WRITE |
|---|---|---|
| `events` | wszyscy | admin (+ wyjątek `booked` wyżej) |
| `eventImages` (zdjęcia zajęć) | wszyscy | admin; reguła pilnuje też rozmiaru zdjęcia |
| `registrations` | admin; zalogowany rodzic tylko swoje | CREATE: formularz (z walidacją pól); UPDATE/DELETE: admin |
| `bookings` (rezerwacje) | admin; zalogowany klient tylko swoje | CREATE: formularz, zawsze jako `pending`, nieopłacona i niepoliczona; UPDATE/DELETE: admin |
| `guests` (ranking) | admin | admin |
| `settings/presence` | wszyscy | admin |
| `settings/stats` | wszyscy | admin (+ formularz może podbić licznik odwiedzin o 1) |
| `admins` | admin / właściciel dokumentu | nikt (tylko konsola Firebase) |
| wszystko inne | — | — (domyślnie zamknięte) |

Kolekcja `admins` **nie decyduje już o uprawnieniach** — została jako notatnik,
kto i od kiedy ma dostęp.

---

## Panel administratora (`admin.html`)

* Wejście na stronę bez zalogowania → widać **tylko ekran logowania**, panel jest ukryty.
* Logowanie: **Google** (zalecane) albo e-mail + hasło, z resetem hasła i zakładaniem konta.
* Konto spoza listy → komunikat „Brak uprawnień” + przycisk **Wyloguj**; panel nadal ukryty.
* Konto z listy, ale niepotwierdzony e-mail → przycisk **„Wyślij link ponownie”**.
* Po zalogowaniu: nagłówek z adresem zalogowanej osoby, informacja skąd bierze się
  uprawnienie (lista czy custom claim) i przycisk **Wyloguj**.
* Zarządzanie zajęciami: lista z filtrem dat i wyszukiwarką, cztery kafelki
  podsumowania, **+ Nowe zajęcia**, **Edytuj**, **Duplikuj**, **Usuń**,
  „Powiel na kolejne tygodnie”.
* **Wyloguj** natychmiast zwija panel i wraca do ekranu logowania.

---

## Powtarzające się zajęcia

W oknie zajęć jest sekcja **Powtarzanie** z przełącznikiem „Powtarza się”. Po włączeniu:

* **Powtarzaj w** — zaznacz dni tygodnia (P W Ś C P S N). Nic nie zaznaczone znaczy
  „co tydzień w ten sam dzień, co pierwsze zajęcia”.
* **Kończy się** — albo **W dniu** (data ostatniego możliwego terminu), albo
  **Po wystąpieniu** (ile terminów łącznie z pierwszym).
* Pod spodem stoi podpowiedź: ile terminów powstanie i kiedy wypada ostatni. Liczy się
  na żywo, więc widać skutek zanim się cokolwiek zapisze.

Pierwszy termin to te zajęcia, które właśnie zapisujesz — kopie powstają dopiero po nim.
„8 wystąpień” znaczy oryginał plus siedem kopii. Każda kopia dostaje **własną, pustą listę
zapisów** i komplet zdjęć oryginału. Serię ogranicza twardy limit, żeby jedno kliknięcie
nie zrobiło setek terminów.

Same daty liczy czysta funkcja `seriesDates` z `mc-common.js` — bez przeglądarki, więc
da się ją sprawdzić testem (`node tools/test-zapisy.mjs`).

---

## Zdjęcia zajęć

W oknie edycji zajęć (w `admin.html` i w zakładce 1 panelu) jest galeria:

* **przeciągnij pliki** na jasne pole albo kliknij i wybierz je z dysku;
  działa też **Ctrl+V** — wklejenie zdjęcia prosto ze schowka,
* **kolejność** zmieniasz przeciągając kafelek albo strzałkami `←` `→`
  (na telefonie strzałki są jedyną drogą — przeciąganie tam nie działa),
* **pierwsze zdjęcie jest okładką** — to ono trafia na duży kadr strony zajęć,
* **Usuń** kasuje pojedyncze zdjęcie (z pytaniem, którego zdjęcia dotyczy),
* zmiany zapisują się razem z resztą formularza, po kliknięciu **Zapisz** —
  „Anuluj" naprawdę anuluje, a przy wychodzeniu bez zapisu galeria pojawia się
  na liście niezapisanych zmian.

### Co z tym robi klient

Na stronie zajęć zdjęcie można kliknąć — otwiera się na całym ekranie:
krzyżyk (albo Escape, albo kliknięcie obok zdjęcia) zamyka, strzałki na
ekranie i klawiszach `←` `→` przewijają galerię w kółko, a na telefonie
działa też przesunięcie palcem w bok. W rogu dużego kadru jest podpowiedź
„Zobacz N zdjęć", żeby nie trzeba było zgadywać, że da się kliknąć.
Po zamknięciu podglądu w dużym kadrze zostaje to zdjęcie, które klient
właśnie oglądał.

**Usunięcie zajęć kasuje ich zdjęcia**, a pytanie przed usunięciem mówi wprost,
ile ich zniknie. Duplikat zajęć i powielenie na kolejne tygodnie **kopiują całą
galerię** — kopia nie zostaje bez zdjęć.

### Gdzie leżą zdjęcia i dlaczego akurat tam

W Firestore, w kolekcji `eventImages` — jeden dokument to jedno zdjęcie
(pole `src` z zawartością pliku jako `data:` URL).

Naturalnym miejscem na pliki jest Firebase Storage, ale wymaga on planu Blaze
(karta płatnicza), a ta strona stoi na GitHub Pages i nie ma żadnego backendu.
Firestore w darmowym planie wystarcza pod jednym warunkiem: dokument nie może
przekroczyć **1 MiB**. Dlatego przeglądarka, **zanim** cokolwiek wyśle:

1. zmniejsza zdjęcie do 1400 px dłuższego boku,
2. przelicza je na JPEG, schodząc z jakością (0,82 → 0,45), aż zmieści się
   w budżecie ok. 320 kB,
3. gdy to nie wystarcza — zmniejsza je jeszcze raz i próbuje ponownie.

Zwykłe zdjęcie z telefonu (4–8 MB) schodzi w ten sposób do ok. 150–300 kB
i wygląda dobrze na całej szerokości strony zajęć. Limit to **12 zdjęć**
na jedne zajęcia. Te same granice powtarza `firestore.rules` — żeby nikt nie
obszedł ich konsolą przeglądarki.

Gdyby kiedyś doszedł płatny plan: wystarczy zmienić `readImageFile()`
w `assets/mc-galeria.js` tak, żeby wrzucała plik do Storage i zwracała
`{ kind: 'url', src: link }`. Kolejność, kasowanie i zapis zadziałają bez zmian.

### Stare adresy URL

Zajęcia sprzed galerii mają adresy w polu `events.images[]`. Nic nie ginie:
strona zajęć pokazuje je nadal, a przy pierwszym otwarciu i zapisie takich
zajęć w panelu adresy przenoszą się do `eventImages`. Adres można też dodać
ręcznie — przycisk **Wklej adres URL** pod galerią (nic się wtedy nie wgrywa,
zapisujemy sam adres).

> **Zanim galeria zadziała, opublikuj reguły z `firestore.rules`** (Firebase
> Console → Firestore Database → Rules → Publish). Bez tego wgranie zdjęcia
> kończy się komunikatem „Missing or insufficient permissions", a strona zajęć
> po cichu wraca do starych adresów z `images[]`.

---

## Zapisy na zajęcia — co warto wiedzieć

**Dane każdego dziecka osobno.** Licznik „liczba dzieci" dodaje i zabiera komplet pól
(imię, nazwisko, data urodzenia), więc przy zapisie dwójki wpisujesz dane obojga.
Dane trafiają do pola `children[]` w zapisie; pierwsze dziecko ląduje dodatkowo
w starych polach `childFirstName`/`childLastName`/`childDob`, żeby panel, ranking
i wcześniejsze zapisy działały bez zmian.

**Strona pamięta dzieci.** Kto raz zapisał Zosię, przy kolejnym zapisie zobaczy ją
podpowiedzianą — wystarczy kliknąć. Dla zalogowanych źródłem jest własna historia
(zapisy na zajęcia + rezerwacje bawialni), dla pozostałych pamięć przeglądarki.
Nie trzymamy tego w żadnej nowej kolekcji, więc nie przybywa miejsc, w których
mogłyby wyciec dane osobowe. Gdy odczyt historii się nie powiedzie (np. reguły nie
są jeszcze opublikowane), formularz działa dalej — po prostu bez podpowiedzi.

**Termin, który minął, nie przyjmuje zapisów.** Zamiast mylącego „brak miejsc"
pojawia się **„Termin zapisów upłynął"** — na liście terminów, na stronie zajęć,
w grafiku i na przycisku wysyłki. Zajęcia zamykają się po godzinie zakończenia,
a nie o północy.

**Licznik zapisanych zawsze mówi prawdę.** Po każdym zapisaniu zajęć w panelu
system przepisuje nowy termin do wszystkich powiązanych zapisów i przelicza pole
`booked` z faktycznej liczby zapisanych dzieci (`refreshEvent`). Dzięki temu
przeniesienie zajęć na inny dzień, zmiana nazwy czy godziny nie gubi nikogo
z listy, a kafelek pokazuje właściwą liczbę — niezależnie od tego, czy zajęcia są
nowe, zduplikowane, czy edytowane.

---

## Rezerwacja bawialni (bez zajęć)

Osobna ścieżka dla samego wstępu: przycisk **„Zarezerwuj miejsce"** w hero na stronie
głównej, w menu i w liczniku.

### Godziny otwarcia

| Dzień | Czynne |
|---|---|
| poniedziałek | 15:00 – 19:00 |
| wtorek – czwartek | 10:00 – 19:00 |
| piątek | 10:00 – 16:00 |
| sobota – niedziela | 10:00 – 19:00 |

Ustawia się je w `assets/firebase-config.js`, w polu `SETTINGS.openingHours`
(indeks jak w JavaScripcie: 0 = niedziela). Dzień zamknięty na głucho zapisuje się
jako `null`.

Formularz rezerwacji trzyma się tych godzin: pole godziny ma `min` i `max`
z danego dnia, więc nie da się wybrać 20:00, kiedy jest już zamknięte. Przy taryfie
widać, w jakich godzinach jest czynne. **Czas pobytu też się dostosowuje** — przy wejściu
o 15:00 w piątek kafelek „2 godziny” jest wyszarzony z dopiskiem „nie zmieści się przed
zamknięciem”, a „bez limitu” kończy się razem z zamknięciem tego konkretnego dnia
(w piątek o 16:00, nie o 20:00).

**Nie da się zarezerwować terminu, który minął.** Pole daty nie schodzi poniżej dzisiaj,
a pole godziny — poniżej bieżącej minuty, jeśli wybrany jest dzisiejszy dzień. Godzina
przyjścia podpowiada się jako najbliższy kwadrans. Gdy bawialnia jest już zamknięta,
formularz mówi to wprost, blokuje wysyłkę i daje przycisk **„Zarezerwuj na jutro"**,
który przestawia datę i godzinę otwarcia jednym kliknięciem. Formularz (`rezerwacja-bawialni.html`) wygląda i działa
jak zapis na zajęcia — ten sam krok logowania („zaloguj się" albo „rezerwuj bez konta"),
ten sam pasek kroków, ta sama stopka.

### Cennik nalicza się sam

| | 1 h | 2 h | bez limitu |
|---|---|---|---|
| **poniedziałek – czwartek** | 25 zł | 40 zł | 50 zł |
| **piątek – niedziela i święta** | 30 zł | 45 zł | 55 zł |

Zniżki: **do 6. miesiąca życia — za darmo**, **od 6. miesiąca do 1. roku — 50%**,
**rodzeństwo — −20%** (włącza się samo od dwojga dzieci). Zniżki liczą się po kolei:
najpierw wiek, potem rodzeństwo; dziecko wchodzące gratis zostaje gratis.

Taryfa weekendowa obowiązuje też w **święta w środku tygodnia** — wykaz dni wolnych
(razem z ruchomą Wielkanocą, Zielonymi Świątkami i Bożym Ciałem) liczy się w kodzie,
więc nie trzeba go co roku aktualizować.

Przykład z testów: poniedziałek, 2 h, dwoje dzieci — 3-latek i 8-miesięczne niemowlę.
40 zł + 20 zł, po zniżce rodzeństwa **48 zł**.

### Rozliczenie rezerwacji: opłata, godzina wyjścia, ranking

Każda karta rezerwacji w zakładce **5 · Rezerwacje** ma dwa dodatkowe pola:

* **Do godz.** — ustawiasz według tego, za ile faktycznie zapłacono. To ona decyduje,
  jak długo dzieci z tej rezerwacji są widoczne w liczniku na stronie głównej;
  po jej upływie licznik sam je wygasza. Domyślnie wypełnia się z czasu pobytu
  (1 h, 2 h albo do zamknięcia), ale możesz ją skrócić albo wydłużyć.
* **Opłacone** — dopisuje wizytę do **rankingu wizyt**, dokładnie tak samo jak
  „przyszedł + opłacone" przy zajęciach.

**Ranking nie rozróżnia, skąd wzięła się wizyta.** Dziecko, które przyszło na
zajęcia, i dziecko, które przyszło po prostu do bawialni, trafiają do tej samej
kartoteki (klucz: numer telefonu) i tak samo podbijają liczbę wizyt oraz łączny
czas pobytu. Czas liczy się jako `(godzina wyjścia − godzina wejścia) × liczba dzieci`.

Wizyta wchodzi do rankingu, gdy rezerwacja jest **zaakceptowana i opłacona**.
Zdjęcie któregokolwiek z tych oznaczeń cofa ją — pilnuje tego pole
`countedInRanking`, więc klikanie tam i z powrotem nie zdublowuje wpisu.
Zmiana godziny wyjścia przelicza czas pobytu w rankingu, a usunięcie rezerwacji
cofa wizytę.

### Rezerwacja działa dopiero po akceptacji

Każde zgłoszenie startuje jako `pending`. Reguły Firestore nie pozwalają klientowi
utworzyć rezerwacji z innym statusem ani zmienić statusu później — decyduje wyłącznie
administrator w zakładce **5 · Rezerwacje**. Liczba oczekujących zgłoszeń świeci się
czerwoną plakietką przy nazwie zakładki, widoczną z każdego innego miejsca panelu.

Zakładka to osobny kalendarz tygodniowy (7 kolumn, na telefonie jedna) z kartami
rezerwacji: godzina, czas pobytu, rodzic, dzieci, kwota, telefon i przyciski
**Akceptuj / Odrzuć / Usuń**.

**Uwagi od rodzica** — to, co klient wpisał w polu „Uwagi (nieobowiązkowe)": alergie,
wózek, „przyjdziemy z babcią" — pokazują się na karcie w wyróżnionej, bursztynowej
ramce. Wcześniej trafiały do bazy i nikt ich nie widział. Ta sama informacja jest teraz
widoczna w zakładce **2 · Zapisani** przy danych dziecka i obejmuje ją wyszukiwarka,
więc da się na przykład znaleźć wszystkie zgłoszenia ze słowem „alergia". Przy odrzuceniu możesz wpisać powód — klient zobaczy go
w swojej historii.

### Wyszukiwarka rezerwacji (zakładka 5)

Nad siatką tygodnia jest pole szukania: **numer rezerwacji, imię dziecka, rodzic,
telefon, e-mail, godzina, uwagi** i status. Numer rezerwacji rozpoznajemy tak samo
jak w zakładce 2 — z krzyżykiem albo bez, wielkimi literami albo małymi. Wpisanie
kilku słów zawęża wynik: `zosia 15:30` znajdzie tylko te rezerwacje, które pasują
do obu.

**Szukanie celowo wychodzi poza bieżący tydzień** i przegląda całą historię —
rodzic dzwoni z numerem rezerwacji i nie wie, w którym tygodniu ona leży. Widok
przełącza się wtedy z siatki siedmiu dni na płaską listę wyników od najnowszej,
z datą na każdej karcie, a nawigacja tygodniami znika (nie miałaby co robić).
Wyczyszczenie pola wraca do zwykłego widoku tygodnia. Wszystkie przyciski
— **Akceptuj**, **Odrzuć**, **Opłacone**, **Do godz.**, **Usuń** — działają
na znalezionej rezerwacji tak samo jak w widoku tygodnia.

Kafelki podsumowania nad wyszukiwarką (czekają na decyzję, zaakceptowane,
odrzucone, dzieci) zawsze dotyczą **tygodnia**, nie wyników szukania — to one
mówią obsłudze, ile jest do zrobienia teraz, i szukanie nie powinno tego mieszać.

Historię rezerwacji pobieramy raz, przy pierwszym szukaniu, i dzielimy ją
z zakładką 7 oraz z kwotami w rankingu. Każda zmiana (akceptacja, opłata, godzina
wyjścia, usunięcie, dziecko z ulicy) unieważnia ten zapas, więc następne wejście
w zakładkę widzi świeże dane.

### Zakładka 6 · Czas zabawy

Jedna lista wszystkich, którzy są dziś w bawialni — **z zajęć, z rezerwacji i wprowadzonych
ręcznie przy drzwiach** — z czasem lecącym w dół, odświeżanym co sekundę.

* Kafelki: dzieci teraz w bawialni, kończący w ciągu 15 minut, po czasie, najbliższe wyjście.
* Wiersz robi się **żółty** na kwadrans przed końcem i **czerwony** po czasie, pokazując wtedy,
  o ile jest po (np. `−12:30`).
* Po **15 minutach** od końca wiersz **zamarza**: przestaje odliczać, dostaje opis
  „po upływie czasu 15 min” i spada na dół tabeli. Zamrożony wiersz obsługuje się tak samo
  jak każdy inny — dziecko może przecież zostać dłużej.
* Lista dotyczy **dzisiejszego dnia**; jutro zaczyna się od nowa, bez sprzątania ręką.
* **Wyszukiwarka** po imieniu, telefonie, źródle i godzinach; **Pobierz CSV** zgrywa to,
  co aktualnie widać (razem z kolumną „Opłacone”).
* **Kolumna „Opłacone”** — odhaczasz wprost w wierszu, bez szukania tego samego pobytu
  w innej zakładce. Ranking i Finanse aktualizują się od razu. Przy zapisie na zajęcia
  checkbox jest wyłączony: taki zapis trafia tu dopiero jako „przyszedł + opłacone”,
  więc odznaczenie zabrałoby go z listy w tej samej sekundzie — opłatę zmienia się
  w zakładce **2 · Zapisani**.
* **Edycja pobytu** — kliknij w imię dziecka albo w przycisk **Edytuj**. Rezerwacje
  i wejścia otwierają się w tym samym okienku, w którym się je dodaje: te same pola,
  ta sama wycena, ta sama walidacja. Cena przelicza się od nowa, więc dopisanie dziecka
  albo zmiana czasu pobytu od razu daje właściwą kwotę. Pola, których to okienko nie
  obsługuje (rodzic, e-mail, uwagi klienta), zostają nietknięte.
  Zapisu na zajęcia nie da się tu sensownie edytować — ma własne pola, więc przycisk
  przenosi do zakładki **2 · Zapisani** z wpisanym numerem rezerwacji.
* Akcje w każdym wierszu: **+15 min**, **+ minuty**, **Zakończ**, **Usuń**. Każda pyta
  o potwierdzenie — przy ladzie łatwo o kliknięcie w biegu, a te operacje ruszają licznik
  na stronie i ranking.
* Godzinę wyjścia przesuwa się przyciskiem **+ minuty**: pyta o liczbę minut i działa
  w obie strony — liczba dodatnia przedłuża, ujemna skraca. Nie zejdzie poniżej godziny
  wejścia ani poza dobę. Osobnego pola do wpisywania godziny nie ma; jeden przycisk
  załatwia sprawę i trudniej o przypadkową zmianę.
* Wszystkie akcje przeliczają licznik na stronie głównej, a jeśli wizyta jest już
  w rankingu — także jej czas pobytu.
* **Usuń** znaczy co innego zależnie od źródła: wejście z ulicy i rezerwację kasuje na dobre,
  a przy zapisie na zajęcia tylko odznacza obecność, więc dziecko znika z bawialni,
  ale sam zapis zostaje.

**Nowe wejście.** Przycisk **„+ Nowe wejście”** otwiera formularz dla kogoś, kto przyszedł
bez zapisu:

* **Dzieci wierszami** — imię i (nieobowiązkowa) data urodzenia, osobno dla każdego dziecka.
  Przyszło rodzeństwo? Jeden rekord, dwa wiersze, cena naliczona każdemu osobno.
* **Cena liczy się sama, tym samym cennikiem co rezerwacja ze strony**: taryfa dnia
  (weekend i święta drożej), progi wiekowe (do 6. miesiąca gratis, do 1. roku połowa)
  i zniżka rodzeństwa −20% od dwojga dzieci. Wycena przelicza się przy każdej zmianie,
  z rozpisaniem na poszczególne dzieci — obsługa widzi, skąd wzięła się kwota.
* **Czas pobytu** to trzy kafelki z ceną — te same, co w formularzu klienta.
  Cena na kafelku zależy od taryfy dnia, więc w weekend od razu widać wyższe stawki.
  Wybór przestawia i cenę, i godzinę wyjścia; „bez limitu” ustawia godzinę zamknięcia
  właściwą dla danego dnia. Pobyt, który nie zmieści się przed zamknięciem, jest
  wyłączony z podpisem — a jeśli przestał się mieścić po zmianie godziny wejścia,
  zaznaczenie samo przeskakuje na pierwszy pasujący.
* Pod wyceną jest zwijany **cennik wstępu** — składany z tych samych tabel,
  z których liczy się cena, więc nie ma jak rozjechać się z rzeczywistością.
* **Forma płatności** z listy `SETTINGS.paymentMethods` — trafia do rekordu, na kafelek
  w zakładce 5 i do kolumny „Płatność / taryfa” w arkuszu CSV.
* **Zamknięcie z wpisanymi danymi pyta**, dokładnie tak samo jak przy zajęciach: wylicza,
  które pola są wypełnione, i daje trzy wyjścia — dodać, odrzucić albo wrócić do formularza.
  Kliknięcie obok okienka ani Escape nie kasują już wpisanych danych bez słowa.

Taki wpis zapisujemy jako rezerwację od razu zaakceptowaną, z oznaczeniem `source: 'walkin'` —
dzięki temu bez żadnego dodatkowego kodu wchodzi do licznika na stronie głównej, na listę
czasu zabawy, a po odhaczeniu opłaty także do rankingu. Reguły pozwalają założyć rezerwację
od razu zaakceptowaną **wyłącznie administratorowi**; klient przez formularz nadal tworzy
`pending`.

Wejścia z ulicy mają teraz **prawdziwą kwotę**, więc widać je w zakładce Finanse — wcześniej
zapisywały się z ceną zero i znikały z wykresu przychodu wg zajęć.

### Co widzi klient

`historia-zamowien.html` — dwie zakładki: **Bawialnia** i **Zajęcia**. Status zmienia
się na żywo, bez odświeżania strony:

| Status | Co widzi klient |
|---|---|
| `pending` | Oczekujesz na potwierdzenie |
| `accepted` | Status zaakceptowany, zapraszamy do bawialni |
| `rejected` | Bawialnia w tym dniu ma już komplet i niestety nie możemy zaakceptować zgłoszenia — zapraszamy w innym dogodnym terminie (+ powód od administratora) |

W zakładce **Zajęcia** widać wcześniejsze zapisy na zajęcia razem z ich stanem
(zapis przyjęty / opłacone / obecność potwierdzona / wizyta rozliczona).

**Odliczanie dla rodzica.** Przy każdej dzisiejszej wizycie — tak samo w bawialni,
jak i na zajęciach — pojawia się licznik: przed przyjściem „zaczyna się za 30:00”,
w trakcie „kończy się za 45:00”, a po wszystkim „czas się skończył”. Odświeża się co
sekundę, bez przeładowania strony i bez minusów straszących rodzica. Wizyty z innych
dni licznika nie dostają. Dla bawialni godzinę końca bierzemy z tej samej wartości,
którą obsługa ustawia w panelu, więc przedłużenie pobytu od razu widać u rodzica.

Historię widzą **wyłącznie osoby zalogowane** — pilnują tego reguły Firestore, a nie
kod strony. Kto zarezerwuje bez konta, dostanie na stronie podziękowania jasną notkę,
że status potwierdzimy telefonicznie.

---

## Jak działa licznik na stronie głównej

**Numer rezerwacji.** Każde zgłoszenie — zapis na zajęcia i rezerwacja wstępu — ma krótki
numer (osiem znaków, np. `LMGPYJ84`). Klient widzi go na potwierdzeniu i w historii zamówień,
obsługa w panelu przy każdej pozycji, a wyszukiwarka w zakładce **Zapisani** znajduje po nim
zgłoszenie — z krzyżykiem albo bez, wielkość liter bez znaczenia.

**Automatycznie:** licznik sumuje **dzieci** (a nie zgłoszenia) z dwóch źródeł:

1. **Zapisy na zajęcia** — te, przy których w zakładce **2 · Zapisani** odhaczysz
   „Przyszedł” i „Opłacone”. Godzina wyjścia bierze się z pola **„Do godz.”**
   w tej samej tabelce.
2. **Zaakceptowane rezerwacje wstępu** — od godziny przyjścia do końca opłaconego
   czasu pobytu (1 h, 2 h albo do zamknięcia). Rezerwacja czekająca na decyzję
   albo odrzucona nie liczy się wcale.

Jedno zgłoszenie na czworo dzieci to **czworo dzieci**, nie jedno. Kafelki
„Dzieci z zajęć” i „Dzieci z rezerwacji” w zakładce 3 pokazują rozbicie.
Po upływie ostatniej godziny wyjścia licznik sam wraca do zera.

**Maksimum (mianownik).** Osobna karta **„Maksimum miejsc”** w zakładce 3 —
ustawiasz, ile dzieci mieści się jednocześnie, i klikasz „Zapisz maksimum”.
Obowiązuje w obu trybach i nie resetuje się przy odświeżaniu licznika.

**Ręcznie:** zakładka **3 · Licznik w bawialni** — wpisujesz liczbę dzieci i godzinę.
Przycisk „Wróć do trybu automatycznego” oddaje sterowanie checkboxom.

**Licznik odwiedzin** („Odwiedziło nas już 266 dzieci”) rośnie o **liczbę zapisanych
dzieci**, a nie o liczbę zgłoszeń — jeden zapis na 2 miejsca podbija go o 2.
Górna granica jednego zgłoszenia to 10 dzieci (tak samo w `firestore.rules`).
Zaakceptowanie rezerwacji wstępu też go podbija — o tyle dzieci, ile jest
w rezerwacji, i tylko raz (pilnuje tego pole `countedInVisits`).

Przycisk **„Przelicz z bazy”** sumuje dzieci ze wszystkich zapisów na zajęcia
i z zaakceptowanych rezerwacji — **nie rekordy**. Zgłoszenie na czworo dzieci
liczy się jako cztery.

## Ranking wizyt (zakładka 4)

Każde potwierdzone „Przyszedł + Opłacone” dopisuje dziecku wizytę i czas pobytu:
*Zosia Kowalska, 726 431 978, 3 wizyty, 6 godz.* — dokładnie tak przy trzech
wizytach po 2 h, 3 h i 1 h. Odznaczenie checkboxa cofa wizytę. Jest eksport do CSV.
Dzieci rozpoznajemy po **numerze telefonu** — ten sam numer to ta sama kartoteka.

**Kolumna „Zapłacono”** pokazuje, ile ten rodzic u nas łącznie zostawił — zajęcia
i wstęp do bawialni razem, wyłącznie pozycje odhaczone jako opłacone. Kwot nie
trzymamy w kartotece: doliczamy je z historii zamówień tym samym rachunkiem, co
zakładka **7 · Finanse**, więc obie zakładki nie mogą pokazać różnych liczb.
Dzięki temu kwoty działają też dla wizyt sprzed wprowadzenia tej kolumny —
nie było czego wstecznie dopisywać do bazy.

Pod tabelą stoi suma dla **aktualnie wyświetlanej listy** — po wpisaniu czegoś
w wyszukiwarkę zobaczysz sumę dla znalezionych rodziców, a nie dla całego rankingu.
Kwoty przychodzą chwilę po samej liście (najpierw ranking, potem historia zamówień);
zanim doliczą się do końca, w kolumnie stoi kreska. Kreska zamiast `0,00 zł` znaczy
„jeszcze nie wiem”, a nie „nic nie zapłacił” — to dwie różne rzeczy.

Eksport CSV ma tę kolumnę razem z resztą.

---

## Finanse (zakładka 7)

Jedna kasa dla obu źródeł pieniędzy: **zapisów na zajęcia** i **rezerwacji wstępu
do bawialni** (razem z wejściami z ulicy). Obie kolekcje sprowadzamy w
`assets/mc-finanse.js` do wspólnego kształtu „transakcji" i dopiero na nim liczą
się wszystkie kafelki — dzięki temu nie ma dwóch równoległych sposobów liczenia
przychodu, które prędzej czy później by się rozjechały.

**Trzy zasady, które warto znać, zanim spojrzysz na liczby:**

* **Przychód to wyłącznie to, co odhaczono jako „opłacone".** Zamówienie bez
  opłaty nie jest sprzedażą — czeka w kafelku „Do zainkasowania" w karcie *Saldo
  okresu*. Odhaczasz je w zakładce **2 · Zapisani** albo **5 · Rezerwacje**.
* **Odrzucone rezerwacje nie liczą się wcale.** Nikt za nie nie zapłacił i nie
  zapłaci; widać je tylko w zakładce 5.
* **Kwotę przypisujemy do dnia zajęć albo wizyty**, a nie do dnia, w którym ktoś
  wypełnił formularz. Tak myśli obsługa („ile zarobiliśmy w sobotę"), a `eventDate`
  i `date` są w bazie zawsze, w przeciwieństwie do znacznika utworzenia.

**Co pokazuje zakładka**

| Kafelek | Co liczy |
|---|---|
| Sprzedaż | Suma opłaconych kwot w wybranym okresie. |
| Liczba rezerwacji | Wszystkie zamówienia, także te jeszcze nieopłacone. |
| Średnia wartość transakcji | Sprzedaż podzielona przez liczbę **opłaconych** pozycji. |
| Nowi klienci | Ilu rodziców trafiło do nas **pierwszy raz w życiu** w tym okresie. |
| Przychód w czasie | Sprzedaż dzień po dniu. |
| Przychód wg zajęć | Rozbicie na nazwy zajęć i wstęp — **cała historia**, nie tylko okres. |
| Przychód na rezerwację | Sprzedaż podzielona przez **wszystkie** zamówienia danego dnia. |
| Przychód wg dnia tygodnia | Od poniedziałku. Nad wykresem najlepszy dzień okresu. |
| Skumulowany przychód | Narastająco — na końcu krzywej stoi suma całego okresu. |
| Saldo okresu | Ile wpłynęło, ile zostało do zainkasowania, ile dzieci. |

### Wybór okresu

Przycisk z datą otwiera okienko: po lewej gotowe skróty, po prawej dwa miesiące
kalendarza z polami **od → do**.

* **Dzisiaj**, **Wczoraj** — jednym kliknięciem.
* **Ostatnie** — 7 / 14 / 30 / 90 / 365 dni, licząc z dzisiejszym włącznie.
* **Do dzisiaj** — ten tydzień, miesiąc, kwartał, rok, każdy do dziś.
* **Kwartały** — cztery kwartały bieżącego roku i cztery poprzedniego
  (przy styczniowym zamknięciu roku najczęściej patrzy się właśnie na te drugie).
* **Dowolny zakres z kalendarza** — pierwszy klik zaczyna, drugi domyka,
  trzeci zaczyna od nowa. Kolejność nie ma znaczenia: kliknięcie „od tyłu"
  prostuje się samo. Można też wpisać daty w pola u góry.

Dni z przyszłości są zablokowane — w finansach nie ma tam czego szukać,
a pusty wykres „do 2030 roku" wygląda jak awaria.

Nic nie przelicza się, dopóki nie klikniesz **Zastosuj**; **Anuluj** naprawdę
anuluje, bo okienko pracuje na własnej kopii wyboru.

### Do czego porównujemy

Drugi przycisk ustawia **jaśniejszą linię** na wykresach:

* **Poprzedni okres** (domyślnie) — ten sam co do długości okres tuż przed wybranym;
* **Ten sam okres rok temu** — przy sezonowym ruchu sensowniejszy, bo bawialnia
  w wakacje i bawialnia w listopadzie to dwa różne światy;
* **Bez porównania** — sam bieżący okres. Plakietki zmiany pokazują wtedy kreskę,
  bo „nie ma do czego porównać" to nie to samo co „bez zmian".

Kreskę zobaczysz też wtedy, gdy okres porównawczy był pusty — z zera nie da się
urosnąć o żaden sensowny procent.

### Arkusz CSV

**Pobierz CSV** zgrywa pozycje z wybranego okresu — ale nie samą kwotę.
W pliku jest **23 kolumny**, czyli komplet tego, co o zgłoszeniu wiemy:

| | |
|---|---|
| Kiedy | data, dzień tygodnia, godzina od i do |
| Co | źródło (zajęcia / bawialnia / wejście z ulicy), nazwa pozycji, status |
| Kto | numer rezerwacji, imiona dzieci, rodzic, telefon, e-mail |
| Za ile | cena za dziecko, kwota, opłacone |
| Reszta | przyszedł, w rankingu, metoda płatności albo taryfa, czas pobytu, uwagi rodzica, uwagi obsługi, kiedy zgłoszenie powstało |

Po to, żeby arkusz wystarczał do rozliczenia i do obdzwonienia nieopłaconych —
bez wracania do panelu po każdy telefon.

Zakres wierszy jest **ten sam, co na wykresach**: odrzucone rezerwacje pominięte,
więc suma kolumny „Kwota" po odfiltrowaniu opłaconych zgadza się z kafelkiem
„Sprzedaż". Kwoty mają przecinek dziesiętny, a plik zaczyna się znacznikiem BOM,
więc polski Excel otwiera go poprawnie dwuklikiem. Uwagi wieloliniowe
spłaszczamy do jednej linii, żeby nie rozjechały wiersza.

### Dymek pod kursorem

Najedź na dowolny wykres (także na iskierkę w kafelku), a zobaczysz **dokładne
liczby z konkretnego dnia**: datę, wartość bieżącego okresu i wartość okresu
porównawczego, każdą przy kropce w kolorze swojej linii. Pionowa prowadnica
i kropki na liniach pokazują, o który dzień chodzi. Na wykresie dnia tygodnia
dymek podaje nazwę dnia i kwotę.

Na telefonie i tablecie działa **dotknięciem**, nie przeciągnięciem: przesunięcie
palcem po wykresie przewija stronę (`touch-action: pan-y`), a dymek pokazuje się
dopiero po dotknięciu i znika przy przewijaniu. Bez tego zakładka Finanse — prawie
same wykresy — łapała gest przewijania i nie dało się zejść na dół strony.

---

## Panel na telefonie

* **Pasek zakładek** to jeden rząd przewijany w bok. Siedem zakładek zawijało się
  wcześniej w cztery rzędy i zjadało ćwierć ekranu, zanim pokazała się treść.
  Po przełączeniu wybrana zakładka sama wjeżdża na środek paska.
* **Menu strony** ma pięć sposobów zamknięcia: przycisk, link, dotknięcie obok,
  Escape i powiększenie okna do wersji desktopowej. Wcześniej działały dwa
  pierwsze — kto otworzył menu i dotknął obok, zostawał z zablokowanym
  przewijaniem i bez widocznego wyjścia.
* Pod otwartym menu jest **przyciemnienie**, a przycisk zamykania (krzyżyk)
  zostaje nad menu, więc widać, jak wrócić.
* Blokada przewijania obejmuje `html`, nie tylko `body` — elementem przewijanym
  jest `html`, więc wcześniej strona jechała pod otwartym menu.
* Menu mierzy wysokość w `dvh`, a nie `vh`: `100vh` liczy się razem z paskiem
  adresu przeglądarki, przez co dolne pozycje lądowały pod krawędzią ekranu.
  Gdy pozycji jest więcej niż mieści ekran, menu **przewija się w środku**,
  a `overscroll-behavior: contain` pilnuje, żeby gest nie przelewał się na
  stronę pod spodem (to od tego widok „odbijał" w górę).

**Blokadę przewijania robi JavaScript, nie CSS.** `overflow:hidden` na `<html>`
bywa na telefonach nieskuteczne, a przy okazji potrafi przesunąć elementy
`position:fixed` — menu otwarte w połowie strony lądowało wtedy poza ekranem,
przy zablokowanej stronie, więc nie dało się do niego dojechać. Zamiast tego
unieruchamiamy `<body>` (`position:fixed` z ujemnym `top`) i po zamknięciu
przywracamy dokładną pozycję przewinięcia.

**Nagłówek traci `backdrop-filter` na czas otwarcia menu.** Każdy filtr tworzy
blok zawierający dla potomków `position:fixed`, a menu jest dzieckiem nagłówka —
bez tego jego przypięcie zależałoby od tego, czy strona jest przewinięta.

**To samo menu jest na stronie głównej** (`css/style.css` + `js/main.js`) —
ma własną kopię kodu, więc każdą z tych poprawek trzeba wprowadzić w obu
miejscach.

**Nagłówek i pasek „Powrót do…" przyklejają się do góry razem**, jako jeden
blok `.mc-chrome` (tworzy go `mc-common.js`). Wcześniej każdy przyklejał się
osobno i pasek musiał znać wysokość nagłówka — a każda liczba wpisana na sztywno
(56 px na telefonie, 60 px na komputerze) rozjeżdżała się z rzeczywistymi 65 px
i przycisk był przycinany od góry. Teraz nie ma czego dopasowywać: oba leżą
jeden pod drugim w normalnym przepływie, więc **nie mają jak na siebie nachodzić**
niezależnie od wysokości nagłówka, kroju pisma i szerokości ekranu.

`position:sticky` na samym nagłówku i pasku zostaje w arkuszu jako zapas —
działa, gdyby przeglądarka miała jeszcze zapamiętany stary `mc-common.js`
(arkusz ma wersję w adresie, skrypt nie).

**Po zmianie arkuszy podbij `?v=`**: w `index.html` przy `style.css`, `main.js`
i `cookies.js`, a w podstronach zapisów przy `assets/mc-common.css`. Bez tego
wracający goście dostają starą wersję z cache — i wygląda to jak „poprawka
działa u jednych, u drugich nie". `mc-common.js` celowo nie ma wersji: importuje
go kilkanaście modułów i wystarczy pominąć jedno miejsce, żeby przeglądarka
wczytała moduł dwa razy pod dwoma adresami.
* Filtry w zakładce Finanse układają się w dwie kolumny zamiast czterech
  osobnych rzędów.

**Nowi klienci** liczą się z całej bazy, a nie z okresu: stały bywalec nie może
zrobić się „nowy" tylko dlatego, że zmieniliśmy filtr dat. Rodzica rozpoznajemy
po numerze telefonu, tak samo jak w rankingu wizyt.

**Wejścia z ulicy** mają w bazie kwotę zero (przy drzwiach nikt nie wpisuje ceny),
więc nie pojawiają się na wykresie przychodu wg zajęć — ale wchodzą do liczby
rezerwacji i do licznika. Jeśli chcesz je widzieć w pieniądzach, wpisz kwotę
przy rezerwacji.

W odróżnieniu od pozostałych zakładek ta **nie słucha bazy na żywo**: historię
ściągamy raz, przy pierwszym wejściu, i odświeżamy przyciskiem **Odśwież**.
Nasłuch na wszystkich zapisach i rezerwacjach naraz kosztowałby tyle odczytów,
że szkoda darmowego limitu Firebase. **Pobierz CSV** zgrywa pozycje z wybranego
okresu — data, źródło, nazwa, dzieci, kwota, opłacone.

Wykresy to ręcznie robione SVG, bez żadnej biblioteki z sieci — panel ma działać
także wtedy, gdy CDN nie odpowiada. Matematykę pilnuje `node tools/test-finanse.mjs`.

---

## Publikacja

Dziś wszystko działa lokalnie z podfolderu. Gdy zdecydujesz się to wypuścić:

1. Przenieś zawartość `mala-chmurka-zapisy/` do katalogu głównego strony
   (obok `index.html`), zachowując folder `assets/`.
2. W `assets/firebase-config.js` ustaw `appBase: "/"`.
3. W `index.html` skróć adresy z `/mala-chmurka-zapisy/...` na `/...`
   (4 miejsca — patrz `snippety-do-index.txt`).
4. Opublikuj `firestore.rules` w konsoli Firebase, jeśli jeszcze tego nie zrobiłeś.
5. `git add . && git commit && git push` — GitHub Pages podchwyci resztę.

Alternatywnie zostaw pliki w podfolderze — wtedy adresy działają tak, jak teraz,
i nie zmieniasz niczego poza wgraniem folderu na serwer.

---

## Struktura bazy (Firestore)

```
events/{id}          zajęcia w kalendarzu: title, color, date, start, end, capacity,
                     booked, price, ageMin, ageMax, badge, shortDesc, description,
                     organizerDesc, note, location, images[], paymentMethods[],
                     arriveMinutes, cancelHours, active

eventImages/{id}     jedno zdjęcie zajęć: eventId, kind ('data'|'url'), src,
                     name, width, height, bytes, order, createdAt

registrations/{id}   zapis: eventId + kopia danych zajęć, dane rodzica i dziecka,
                     qty, unitPrice, total, paymentMethod, paid, attended,
                     countedInRanking, stayUntil, uid, status, createdAt

guests/{telefon}     ranking: childName, parentName, phone, email, visits,
                     totalMinutes, lastVisit

settings/presence    licznik dzieci: count, until, date, capacity, manual
settings/stats       licznik odwiedzin: visitsBase (266), visitsCount

admins/{uid}         notatnik: kto ma dostęp (nie nadaje już uprawnień)
```

---

## Uwagi

* **Nazwa pliku z ogonkami.** Adres `/zapisz-sie-na-zajęcia.html` działa (jest plik
  przekierowujący), ale docelowo używaj `/zapisz-sie-na-zajecia.html`.
* **Płatności online** nie są podpięte — formularz przyjmuje „Płatność na miejscu”
  i „Przelew bankowy”, a strona podziękowania pokazuje numer konta
  (`XXX XXXX XXX XXXX` — podmień w `assets/firebase-config.js`).
* **RODO.** W bazie trzymasz dane osobowe dzieci — pamiętaj o klauzuli informacyjnej
  w regulaminie i o tym, żeby lista administratorów obejmowała tylko osoby,
  które muszą te dane widzieć.
* **Wersja SDK** Firebase jest w jednym miejscu: `assets/firebase-config.js`, stała `SDK`.
  Jest zrównana z wersją, której używa blok Firebase w `index.html` (12.18.0),
  więc na stronie głównej ładuje się tylko jedna kopia biblioteki.
