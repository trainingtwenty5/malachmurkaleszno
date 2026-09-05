/* ==========================================================================
   Mała Chmurka — wspólna inicjalizacja Firebase.
   Ładuje SDK dynamicznie, żeby numer wersji był tylko w firebase-config.js.
   Użycie w podstronie:
       import { db, auth, F, A } from './assets/mc-firebase.js';
       const snap = await F.getDocs(F.collection(db, 'events'));
   ========================================================================== */
import { FIREBASE_CONFIG, SDK, SETTINGS, ADMIN_EMAILS, REQUIRE_VERIFIED_EMAIL, appUrl }
  from './firebase-config.js';

const [appMod, authMod, fsMod] = await Promise.all([
  import(`${SDK}/firebase-app.js`),
  import(`${SDK}/firebase-auth.js`),
  import(`${SDK}/firebase-firestore.js`)
]);

/* Strona główna inicjalizuje Firebase własnym skryptem (blok w index.html).
   Jeżeli aplikacja już istnieje — używamy jej, zamiast tworzyć drugą. */
export const app  = appMod.getApps().length
  ? appMod.getApp()
  : appMod.initializeApp(FIREBASE_CONFIG);
export const auth = authMod.getAuth(app);
export const db   = fsMod.getFirestore(app);

/** Wszystkie funkcje Firestore (getDocs, doc, setDoc, query, where, ...) */
export const F = fsMod;
/** Wszystkie funkcje Auth (signInWithEmailAndPassword, onAuthStateChanged, ...) */
export const A = authMod;

export { SETTINGS, ADMIN_EMAILS, appUrl };

/* ---------- Ścieżki w bazie (jedno miejsce prawdy) ---------- */
export const PATHS = {
  events:        'events',          // pojedyncze zajęcia w kalendarzu
  registrations: 'registrations',   // zapisy klientów na zajęcia
  bookings:      'bookings',        // rezerwacje samego wstępu do bawialni
  guests:        'guests',          // ranking: 1 dokument = 1 dziecko
  settings:      'settings',        // settings/presence, settings/stats
  admins:        'admins'           // opcjonalna kartoteka administratorów
};

/* ==========================================================================
   UPRAWNIENIA ADMINISTRATORA
   --------------------------------------------------------------------------
   Poniższe funkcje decydują tylko o TYM, CO WIDAĆ NA EKRANIE. Nie są żadnym
   zabezpieczeniem — każdy może otworzyć konsolę przeglądarki i podmienić
   wynik. Prawdziwą blokadę stawia Firestore (plik `firestore.rules`), gdzie
   obowiązuje dokładnie ta sama zasada:

     1) użytkownik ma w tokenie custom claim  admin: true          → admin
        (rozwiązanie preferowane; jak je nadać — patrz tools/set-admin-claim.mjs)
     2) ALBO jego e-mail jest na liście ADMIN_EMAILS i jest potwierdzony
        (rozwiązanie działające bez żadnego backendu)

   Wszystko poza tym → zwykły użytkownik, panel się nie pokaże, a nawet
   gdyby się pokazał — baza odrzuci każdy zapis.
   ========================================================================== */

const norm = e => String(e || '').trim().toLowerCase();

/** Czy adres jest na liście administratorów (bez sprawdzania weryfikacji). */
export const isAdminEmail = email => ADMIN_EMAILS.map(norm).includes(norm(email));

/**
 * Szczegółowy stan uprawnień — dzięki temu ekran logowania potrafi napisać
 * konkretnie, czego brakuje, zamiast suchego „brak dostępu".
 * Zwraca: { ok, reason, email, uid, viaClaim, needsVerification }
 *   reason: 'ok' | 'anon' | 'not-listed' | 'unverified'
 */
export async function adminStatus(user, { forceRefresh = false } = {}) {
  if (!user) return { ok: false, reason: 'anon', email: '', uid: '', viaClaim: false, needsVerification: false };

  const email = norm(user.email);
  const base  = { ok: false, reason: 'not-listed', email, uid: user.uid, viaClaim: false, needsVerification: false };

  /* 1) custom claim admin:true — nadany z Admin SDK, ważniejszy niż lista */
  try {
    const token = await user.getIdTokenResult(forceRefresh);
    if (token && token.claims && token.claims.admin === true) {
      return { ...base, ok: true, reason: 'ok', viaClaim: true };
    }
  } catch (e) {
    console.warn('adminStatus (token):', e.message);
  }

  /* 2) lista adresów z firebase-config.js (ta sama co w firestore.rules) */
  if (!isAdminEmail(email)) return base;
  if (REQUIRE_VERIFIED_EMAIL && !user.emailVerified) {
    return { ...base, reason: 'unverified', needsVerification: true };
  }
  return { ...base, ok: true, reason: 'ok' };
}

/** Skrót: czy zalogowany użytkownik jest administratorem. */
export async function isAdmin(user, opts) {
  return (await adminStatus(user, opts)).ok;
}

/** Czeka na rozstrzygnięcie stanu logowania i zwraca usera (lub null). */
export function currentUser() {
  return new Promise(resolve => {
    const off = A.onAuthStateChanged(auth, u => { off(); resolve(u); });
  });
}

/** Polskie komunikaty błędów Firebase — używane na wszystkich podstronach. */
export function authError(err) {
  const c = (err && err.code) || '';
  if (c.includes('invalid-credential') || c.includes('wrong-password') || c.includes('user-not-found'))
    return 'Nieprawidłowy e-mail lub hasło.';
  if (c.includes('email-already-in-use'))  return 'Konto z tym adresem już istnieje — zaloguj się.';
  if (c.includes('invalid-email'))         return 'To nie wygląda na poprawny adres e-mail.';
  if (c.includes('weak-password'))         return 'Hasło musi mieć co najmniej 6 znaków.';
  if (c.includes('too-many-requests'))     return 'Zbyt wiele prób. Spróbuj ponownie za chwilę.';
  if (c.includes('popup-closed'))          return 'Okno logowania Google zostało zamknięte.';
  if (c.includes('popup-blocked'))         return 'Przeglądarka zablokowała okno Google — zezwól na wyskakujące okienka.';
  if (c.includes('operation-not-allowed')) return 'Ta metoda logowania nie jest włączona w Firebase (Authentication → Sign-in method).';
  if (c.includes('unauthorized-domain'))   return 'Ta domena nie jest dopuszczona w Firebase (Authentication → Settings → Authorized domains).';
  if (c.includes('permission-denied'))     return 'Baza odrzuciła operację — to konto nie ma uprawnień administratora.';
  if (c.includes('network'))               return 'Brak połączenia z siecią.';
  return (err && err.message) || 'Coś poszło nie tak. Spróbuj ponownie.';
}
