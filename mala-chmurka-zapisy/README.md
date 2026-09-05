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
| `panel-admina.html` | Pełny panel z 4 zakładkami (kalendarz, zapisani, licznik, ranking). |
| `assets/firebase-config.js` | Konfiguracja Firebase **i lista administratorów**. |
| `assets/mc-firebase.js` | Inicjalizacja SDK + sprawdzanie uprawnień. |
| `assets/mc-licznik.js` | Licznik dzieci na stronie głównej (jedna linijka w index.html). |
| `assets/mc-common.css/.js` | Wspólny wygląd: navbar i stopka 1:1 jak na malachmurkaleszno.pl. |
| `assets/mc-data.js` | Cała logika bazy danych. |
| **`assets/mc-cennik.js`** | **Cennik bawialni: taryfy, święta, progi wiekowe, zniżki.** |
| **`assets/mc-dzieci.js`** | **Pamięć dzieci — podpowiedzi przy kolejnym zapisie.** |
| **`firestore.rules`** | **Reguły bezpieczeństwa — jedyne prawdziwe zabezpieczenie panelu.** |
| `tools/set-admin-claim.mjs` | Jednorazowy skrypt nadający custom claim `admin: true`. |
| `tools/test-rules.mjs` | 58 testów reguł na emulatorze — dowód, że blokady działają. |
| `tools/test-ui.mjs` | 16 testów formularza zapisu (kroki, link w opisie) — sam Node. |
| `tools/test-cennik.mjs` | 47 testów naliczania ceny wstępu — sam Node. |
| `tools/test-zapisy.mjs` | 29 testów: zamykanie terminów i pamięć dzieci — sam Node. |
| `tools/test-licznik.mjs` | 28 testów licznika dzieci w bawialni — sam Node. |
| `tools/test-brama.mjs` | 10 testów bramy uprawnień (zawieszony token) — sam Node. |
| `tools/test-ranking.mjs` | 17 testów rankingu wizyt w bawialni — sam Node. |
| **`diagnostyka.html`** | **Sprawdza, czy reguły w Firebase są aktualne — bez zgadywania.** |
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

Dostęp mają dokładnie dwa adresy — są wpisane w `firestore.rules` (funkcja
`adminEmails()`) i w `assets/firebase-config.js` (stała `ADMIN_EMAILS`):

```
velorwr16@gmail.com
malachmurka.leszno@gmail.com
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

### Zasada dla zajęć (kolekcja `events`)

| Operacja | Kto |
|---|---|
| READ | wszyscy (grafik ma być publiczny) |
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

### Skąd wiadomo, że reguły faktycznie działają

W `tools/test-rules.mjs` jest gotowy zestaw **58 testów** uruchamianych na
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
node tools/test-zapisy.mjs  # 29 testów: zamykanie terminów, pamięć dzieci
node tools/test-licznik.mjs # 28 testów: licznik dzieci w bawialni
node tools/test-brama.mjs   # 10 testów: brama uprawnień, zawieszony token
node tools/test-ranking.mjs # 17 testów: ranking wizyt w bawialni
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
głównej, w menu i w liczniku. Formularz (`rezerwacja-bawialni.html`) wygląda i działa
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
**Akceptuj / Odrzuć / Usuń**. Przy odrzuceniu możesz wpisać powód — klient zobaczy go
w swojej historii.

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

Historię widzą **wyłącznie osoby zalogowane** — pilnują tego reguły Firestore, a nie
kod strony. Kto zarezerwuje bez konta, dostanie na stronie podziękowania jasną notkę,
że status potwierdzimy telefonicznie.

---

## Jak działa licznik na stronie głównej

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
