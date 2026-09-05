/* ==========================================================================
   Mała Chmurka — jednorazowe nadanie uprawnienia administratora
   (Firebase Custom Claim  admin: true)
   --------------------------------------------------------------------------
   PO CO TO JEST
   Strona nie ma backendu, więc custom claimów nie da się nadać „z poziomu
   przeglądarki" — token podpisuje Google i tylko Admin SDK może do niego coś
   dopisać. Ten skrypt uruchamiasz RAZ, ze swojego komputera. Nie jest częścią
   strony i nigdzie się go nie wgrywa.

   Bez tego skryptu system działa normalnie — uprawnienia bierze wtedy
   z listy adresów w `firestore.rules` (patrz README, „Krok 6"). Custom claim
   jest po prostu rozwiązaniem mocniejszym: nie zależy od adresu e-mail.

   --------------------------------------------------------------------------
   JAK URUCHOMIĆ (5 minut, jednorazowo)

   1. Firebase Console → zębatka → Ustawienia projektu → zakładka
      „Konta usługi" (Service accounts) → „Wygeneruj nowy klucz prywatny".
      Pobierze się plik .json.

   2. UWAGA — TEN PLIK TO PRAWDZIWY SEKRET. Daje pełny dostęp do bazy.
      • NIE wrzucaj go na stronę ani do katalogu z HTML-ami,
      • NIE commituj do gita,
      • trzymaj go poza projektem, np. C:\Users\Ty\klucze\mala-chmurka.json

   3. W terminalu, w katalogu `mala-chmurka-zapisy`:

        npm install firebase-admin
        node tools/set-admin-claim.mjs "C:\Users\Ty\klucze\mala-chmurka.json"

      Skrypt nada `admin: true` wszystkim adresom z listy ADMIN_EMAILS
      (plik assets/firebase-config.js). Konta muszą już istnieć — czyli
      najpierw zaloguj się nimi raz na `admin.html`.

      Możesz też podać adresy ręcznie:

        node tools/set-admin-claim.mjs klucz.json ktos@example.com
        node tools/set-admin-claim.mjs klucz.json --remove ktos@example.com

   4. Po nadaniu claimu wyloguj się i zaloguj ponownie w panelu
      (token odświeża się przy logowaniu).

   5. Skasuj pobrany plik klucza, jeśli nie będzie już potrzebny.
   ========================================================================== */

import { readFileSync } from 'node:fs';

const args = process.argv.slice(2);
const remove = args.includes('--remove');
const rest = args.filter(a => a !== '--remove');
const keyPath = rest[0];
let emails = rest.slice(1);

if (!keyPath) {
  console.error('Użycie: node tools/set-admin-claim.mjs <klucz-serwisowy.json> [email ...] [--remove]');
  process.exit(1);
}

/* lista adresów bierze się z tego samego pliku, co reszta systemu */
if (!emails.length) {
  const cfg = await import(new URL('../assets/firebase-config.js', import.meta.url).href);
  emails = cfg.ADMIN_EMAILS;
}

let admin;
try {
  admin = await import('firebase-admin');
} catch {
  console.error('Brakuje biblioteki. Uruchom najpierw:  npm install firebase-admin');
  process.exit(1);
}

const credential = JSON.parse(readFileSync(keyPath, 'utf8'));
const app = admin.default.initializeApp({ credential: admin.default.credential.cert(credential) });
const auth = admin.default.auth(app);

for (const email of emails) {
  try {
    const user = await auth.getUserByEmail(email);
    const claims = { ...(user.customClaims || {}) };
    if (remove) delete claims.admin; else claims.admin = true;
    await auth.setCustomUserClaims(user.uid, claims);
    console.log(`${remove ? '− odebrano' : '✓ nadano'} admin:  ${email}  (uid ${user.uid})`);
  } catch (e) {
    if (e.code === 'auth/user-not-found') {
      console.error(`! Konto ${email} jeszcze nie istnieje — zaloguj się nim raz na admin.html i powtórz.`);
    } else {
      console.error(`! ${email}: ${e.message}`);
    }
  }
}

console.log('\nGotowe. Wyloguj się i zaloguj ponownie w panelu, żeby token się odświeżył.');
process.exit(0);
