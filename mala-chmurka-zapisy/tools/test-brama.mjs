/* ==========================================================================
   Mała Chmurka — testy bramy uprawnień
   --------------------------------------------------------------------------
   Odtwarzają awarię, przez którą panel stał w nieskończoność na komunikacie
   „Sprawdzam uprawnienia…": odświeżenie tokenu chodzi po sieci i potrafi
   utknąć bez żadnego błędu, więc try/catch tego nie łapie.

   Test podmienia getIdTokenResult na wersję, która nigdy się nie rozstrzyga,
   i sprawdza, czy adminStatus mimo to oddaje odpowiedź.

   URUCHOMIENIE:   node tools/test-brama.mjs
   ========================================================================== */

/* mc-firebase.js ładuje SDK z sieci — do testu wystarczy sama logika uprawnień,
   więc wycinamy funkcje z pliku i uruchamiamy je z atrapami. */
import { readFileSync } from 'node:fs';
import { ADMIN_EMAILS, REQUIRE_VERIFIED_EMAIL } from '../assets/firebase-config.js';

const src = readFileSync(new URL('../assets/mc-firebase.js', import.meta.url), 'utf8');
const from = src.indexOf('function withTimeout(');
const to   = src.indexOf('\n}', src.indexOf('return { ...base, ok: true, reason: \'ok\' };')) + 2;
if (from < 0 || to < 2) { console.error('Nie znalazłem adminStatus w mc-firebase.js'); process.exit(1); }

const norm = e => String(e || '').trim().toLowerCase();
const isAdminEmail = email => ADMIN_EMAILS.map(norm).includes(norm(email));
const adminStatus = new Function(
  'norm', 'isAdminEmail', 'ADMIN_EMAILS', 'REQUIRE_VERIFIED_EMAIL',
  src.slice(from, to).replace('export async function', 'async function') + '; return adminStatus;'
)(norm, isAdminEmail, ADMIN_EMAILS, REQUIRE_VERIFIED_EMAIL);

let pass = 0, fail = 0;
const ok = (name, cond, dump = '') => {
  if (cond) { console.log('  OK   ' + name); pass++; }
  else { console.log('  FAIL ' + name + (dump ? '\n         ' + dump : '')); fail++; }
};

const ADMIN = ADMIN_EMAILS[0];
const user = (o = {}) => ({
  uid: 'u1', email: ADMIN, emailVerified: true,
  getIdTokenResult: async () => ({ claims: {} }),
  ...o
});
const never = () => new Promise(() => {});          // nigdy się nie rozstrzyga

console.log('\n=== ZAWIESZONE ODŚWIEŻANIE TOKENU (przyczyna awarii) ===');
{
  const t0 = Date.now();
  const st = await adminStatus(user({ getIdTokenResult: never }), { forceRefresh: true, timeoutMs: 300 });
  const ms = Date.now() - t0;
  ok('odpowiedź przychodzi mimo zawieszonego tokenu', st && typeof st.ok === 'boolean');
  ok('admin z listy i tak wchodzi (lista nie potrzebuje sieci)', st.ok === true, JSON.stringify(st));
  ok('nie czeka dłużej niż limit + zapas', ms < 2500, `czekało ${ms} ms`);
}

console.log('\n=== TOKEN RZUCA BŁĘDEM ===');
{
  const st = await adminStatus(
    user({ getIdTokenResult: async () => { throw new Error('network error'); } }),
    { forceRefresh: true, timeoutMs: 300 });
  ok('błąd sieci nie blokuje wejścia adminowi z listy', st.ok === true, JSON.stringify(st));
}

console.log('\n=== ZWYKŁE ŚCIEŻKI DALEJ DZIAŁAJĄ ===');
{
  const st = await adminStatus(user(), { timeoutMs: 300 });
  ok('admin z listy z potwierdzonym adresem → wpuszczony', st.ok === true);

  const st2 = await adminStatus(user({ emailVerified: false }), { timeoutMs: 300 });
  ok('admin z listy bez potwierdzenia adresu → nie wpuszczony',
     REQUIRE_VERIFIED_EMAIL ? (st2.ok === false && st2.reason === 'unverified') : st2.ok === true,
     JSON.stringify(st2));

  const st3 = await adminStatus(user({ email: 'ktos@example.com' }), { timeoutMs: 300 });
  ok('adres spoza listy → nie wpuszczony', st3.ok === false && st3.reason === 'not-listed');

  const st4 = await adminStatus(
    user({ email: 'ktokolwiek@example.com', emailVerified: false,
           getIdTokenResult: async () => ({ claims: { admin: true } }) }), { timeoutMs: 300 });
  ok('custom claim admin:true wpuszcza niezależnie od adresu', st4.ok === true && st4.viaClaim === true);

  const st5 = await adminStatus(null);
  ok('brak zalogowania → reason "anon"', st5.ok === false && st5.reason === 'anon');
}

console.log('\n=== TOKEN WOLNY, ALE NIE MARTWY ===');
{
  const slow = { claims: { admin: true } };
  const st = await adminStatus(
    user({ email: 'ktokolwiek@example.com',
           getIdTokenResult: () => new Promise(r => setTimeout(() => r(slow), 50)) }),
    { forceRefresh: true, timeoutMs: 500 });
  ok('token, który zdąży w limicie, jest normalnie użyty', st.ok === true && st.viaClaim === true);
}

console.log(`\n================  ${pass} zaliczonych, ${fail} niezaliczonych  ================\n`);
process.exit(fail ? 1 : 0);
