# Mała Chmurka — strona internetowa

Strona wizytówka kameralnej bawialni i kawiarni **Mała Chmurka** w Lesznie.

Zwykły HTML + CSS + JavaScript. Bez frameworków, bez procesu budowania,
bez zależności instalowanych z npm.

## Uruchomienie

Wystarczy otworzyć `index.html` w przeglądarce. Do pracy lokalnej wygodniej
jest jednak wystartować prosty serwer, żeby ścieżki zachowywały się tak jak
na docelowym hostingu:

```bash
python -m http.server 5173
```

Następnie: `http://localhost:5173`

## Struktura

```
index.html          — cała treść strony (jedna podstrona, sekcje kotwiczone)
css/style.css       — style, zmienne kolorów, responsywność
js/main.js          — menu mobilne, karuzela, galeria, animacje
img/                — zdjęcia przeskalowane pod www (łącznie ok. 2,3 MB)
img/logo-full.svg   — znak z księgi, przycięty, sterowany kolorem z CSS
img/sygnet.svg      — sama chmurka
img/favicon.svg     — ikona karty przeglądarki
RGB_PNG…/ RGB_SVG…/ — oryginalna księga znaku od grafika
*.jpg, *.jpeg       — oryginały zdjęć w pełnej rozdzielczości (poza stroną)
```

## Kolory marki

| Zmienna CSS     | Wartość   | Zastosowanie                                  |
|-----------------|-----------|-----------------------------------------------|
| `--brand`       | `#93C7CF` | oficjalny kolor z księgi znaku, akcenty i tła |
| `--brand-deep`  | `#3E7C89` | przyciemniony — przyciski i logo po przewinięciu (kontrast AA z bielą) |
| `--brand-pale`  | `#E4F1F4` | delikatne wypełnienia                         |
| `--navy`        | `#3D5A78` | nagłówki, kolor zdjęty z wnętrza lokalu       |
| `--wood`        | `#C9A87C` | ciepły akcent, przyciski akcji                |

Logo wstawione jest jako maska CSS (`mask-image`), dzięki czemu jeden plik SVG
obsługuje wszystkie warianty kolorystyczne — barwę ustawia `background-color`.

## Sekcje

Hero z karuzelą → szybkie fakty → O nas → Oferta (3 karty) → Strefy zabawy →
Kawiarnia → Urodzinki i wynajem → Cennik → Galeria → Kontakt → Stopka

## Cennik

Stawki wpisane w sekcji `#cennik` pochodzą z grafiki cennikowej z Instagrama:

| Wejście    | Pon–Czw | Pt–Nd i święta |
|------------|---------|----------------|
| 1 h        | 25 zł   | 30 zł          |
| 2 h        | 40 zł   | 45 zł          |
| bez limitu | 50 zł   | 55 zł          |

Zniżki liczone według wieku dziecka: do 6. miesiąca życia — za darmo ·
od 6. miesiąca do 1. roku życia — 50% · rodzeństwo — −20%.
Opiekun wchodzi bezpłatnie.

## Do uzupełnienia przed publikacją

**Godziny otwarcia** (`index.html`, sekcja `#kontakt`) — przepisane
z grafiki na ferie, trzeba je zweryfikować i podmienić na stałe godziny.

## Dane kontaktowe użyte na stronie

- ul. Armii Krajowej 15, 1. piętro, 64-100 Leszno
- tel. 726 431 978
- malachmurka.leszno@gmail.com
- [Instagram](https://www.instagram.com/malachmurka.leszno/) ·
  [Facebook](https://www.facebook.com/profile.php?id=61573206205142)

## Uwagi techniczne

- Kroje pisma (Quicksand, Nunito) ładowane są z Google Fonts.
- Zdjęcia w `img/` mają `loading="lazy"`.
- Strona działa też przy wyłączonym JavaScripcie — treść pozostaje widoczna.
- Uwzględnione jest ustawienie `prefers-reduced-motion`.
