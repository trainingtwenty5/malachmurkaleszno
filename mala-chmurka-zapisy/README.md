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
| `logowanie.html` | Logowanie klienta (e-mail + hasło, Google, reset hasła). |
| `dziekujemy.html` | Podziękowanie: podsumowanie, numer konta, kontakt. |
| **`admin.html`** | **Ekran logowania administratora + zarządzanie zajęciami.** |
| `panel-admina.html` | Pełny panel z 4 zakładkami (kalendarz, zapisani, licznik, ranking). |
| `assets/firebase-config.js` | Konfiguracja Firebase **i lista administratorów**. |
| `assets/mc-firebase.js` | Inicjalizacja SDK + sprawdzanie uprawnień. |
| `assets/mc-licznik.js` | Licznik dzieci na stronie głównej (jedna linijka w index.html). |
| `assets/mc-common.css/.js` | Wspólny wygląd: navbar i stopka 1:1 jak na malachmurkaleszno.pl. |
| `assets/mc-data.js` | Cała logika bazy danych. |
| **`firestore.rules`** | **Reguły bezpieczeństwa — jedyne prawdziwe zabezpieczenie panelu.** |
| `tools/set-admin-claim.mjs` | Jednorazowy skrypt nadający custom claim `admin: true`. |
| `tools/test-rules.mjs` | 41 testów reguł na emulatorze — dowód, że blokady działają. |
| `tools/test-ui.mjs` | 16 testów formularza zapisu (kroki, link w opisie) — sam Node. |
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

### Skąd wiadomo, że reguły faktycznie działają

W `tools/test-rules.mjs` jest gotowy zestaw **41 testów** uruchamianych na
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

Wymaga zainstalowanej Javy. Stan po ostatnim uruchomieniu: **41 zaliczonych, 0 niezaliczonych.**
Uruchom to ponownie za każdym razem, gdy zmienisz `firestore.rules`.

Sam formularz zapisu ma osobny, lekki zestaw (16 testów, bez emulatora i bez
żadnych zależności — tylko Node):

```bash
node tools/test-ui.mjs
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

## Jak działa licznik na stronie głównej

**Automatycznie:** w `panel-admina.html`, zakładka **2 · Zapisani** zaznaczasz przy
dziecku „Przyszedł” i „Opłacone”. Od tego momentu na stronie głównej widać np.
`2 os. / 6` i `w bawialni do 18:00`. Godzina bierze się z pola **„Do godz.”**
w tej samej tabelce. Po jej upływie licznik sam wraca do zera.

**Ręcznie:** zakładka **3 · Licznik w bawialni** — wpisujesz liczbę dzieci i godzinę.
Przycisk „Wróć do trybu automatycznego” oddaje sterowanie checkboxom.

**Licznik odwiedzin** („Odwiedziło nas już 266 dzieci”) rośnie o **liczbę zapisanych
dzieci**, a nie o liczbę zgłoszeń — jeden zapis na 2 miejsca podbija go o 2.
Górna granica jednego zgłoszenia to 10 dzieci (tak samo w `firestore.rules`).

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
