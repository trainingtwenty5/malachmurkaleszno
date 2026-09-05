/* ==========================================================================
   Mała Chmurka — testy reguł bezpieczeństwa Firestore
   --------------------------------------------------------------------------
   Sprawdzają na emulatorze, czy firestore.rules faktycznie robi to, co ma:
   zajęcia czyta każdy, ale tworzy/zmienia/usuwa je wyłącznie administrator.
   Nic nie dotykają prawdziwej bazy — wszystko dzieje się lokalnie.

   JAK URUCHOMIĆ (wymaga zainstalowanej Javy):

       cd mala-chmurka-zapisy
       npm install --no-save @firebase/rules-unit-testing firebase firebase-tools
       npx firebase emulators:exec --only firestore --project demo-mc "node tools/test-rules.mjs"

   Powinno wypisać listę OK i na końcu „0 niezaliczonych".
   Odpal to za każdym razem, gdy zmienisz firestore.rules.
   ========================================================================== */

import { readFileSync } from 'node:fs';
import { initializeTestEnvironment, assertSucceeds, assertFails }
  from '@firebase/rules-unit-testing';
import { doc, getDoc, setDoc, updateDoc, deleteDoc, collection, getDocs, addDoc,
         runTransaction, increment, serverTimestamp } from 'firebase/firestore';

const testEnv = await initializeTestEnvironment({
  projectId: 'mala-chmurka-test',
  firestore: { rules: readFileSync('firestore.rules', 'utf8'), host: '127.0.0.1', port: 8080 }
});

const ADMIN = 'velorwr16@gmail.com';
const ADMIN2 = 'malachmurka.leszno@gmail.com';

const anon    = () => testEnv.unauthenticatedContext().firestore();
const user    = (uid, email, verified = true) =>
  testEnv.authenticatedContext(uid, { email, email_verified: verified }).firestore();
const claimed = (uid) =>
  testEnv.authenticatedContext(uid, { email: 'ktokolwiek@example.com', email_verified: false, admin: true }).firestore();

const EVENT = {
  title: 'Logosensoryka', color: '#93C7CF', date: '2026-09-10', start: '09:30', end: '10:30',
  capacity: 10, booked: 2, price: 45, active: true
};
const REG = {
  eventId: 'ev1', eventTitle: 'Logosensoryka', eventDate: '2026-09-10',
  email: 'rodzic@example.com', phone: '726431978', childFirstName: 'Zosia',
  qty: 1, paid: false, attended: false, uid: null
};

async function seed() {
  await testEnv.withSecurityRulesDisabled(async ctx => {
    const db = ctx.firestore();
    await setDoc(doc(db, 'events/ev1'), EVENT);
    await setDoc(doc(db, 'events/ev-hidden'), { ...EVENT, active: false });
    await setDoc(doc(db, 'registrations/r1'), REG);
    await setDoc(doc(db, 'registrations/r-mine'), { ...REG, uid: 'klient' });
    await setDoc(doc(db, 'guests/726431978'), { visits: 3, totalMinutes: 360 });
    await setDoc(doc(db, 'settings/presence'), { count: 0, until: '', capacity: 6, manual: false });
    await setDoc(doc(db, 'settings/stats'), { visitsBase: 266, visitsCount: 4 });
    await setDoc(doc(db, 'admins/uid-admin'), { email: ADMIN });
    await setDoc(doc(db, 'sekrety/x'), { a: 1 });
  });
}

let pass = 0, fail = 0;
async function t(name, fn) {
  await testEnv.clearFirestore();
  await seed();
  try { await fn(); console.log('  OK   ' + name); pass++; }
  catch (e) { console.log('  FAIL ' + name + '\n         ' + String(e.message).split('\n')[0]); fail++; }
}

console.log('\n=== ZAJĘCIA (events) — wymagana zasada z zamówienia ===');

await t('READ zajęć: anonim → TAK', async () => {
  await assertSucceeds(getDoc(doc(anon(), 'events/ev1')));
  await assertSucceeds(getDocs(collection(anon(), 'events')));
});
await t('CREATE zajęć: anonim → NIE', async () =>
  assertFails(setDoc(doc(anon(), 'events/nowe'), EVENT)));
await t('UPDATE zajęć: anonim → NIE', async () =>
  assertFails(updateDoc(doc(anon(), 'events/ev1'), { title: 'Przejęte' })));
await t('DELETE zajęć: anonim → NIE', async () =>
  assertFails(deleteDoc(doc(anon(), 'events/ev1'))));

await t('CREATE zajęć: zalogowany klient (spoza listy) → NIE', async () =>
  assertFails(setDoc(doc(user('klient', 'ktos@example.com'), 'events/nowe'), EVENT)));
await t('UPDATE zajęć: zalogowany klient → NIE', async () =>
  assertFails(updateDoc(doc(user('klient', 'ktos@example.com'), 'events/ev1'), { price: 0 })));
await t('DELETE zajęć: zalogowany klient → NIE', async () =>
  assertFails(deleteDoc(doc(user('klient', 'ktos@example.com'), 'events/ev1'))));

await t('CREATE/UPDATE/DELETE: admin #1 (velorwr16, potwierdzony) → TAK', async () => {
  const db = user('a1', ADMIN, true);
  await assertSucceeds(setDoc(doc(db, 'events/nowe'), EVENT));
  await assertSucceeds(updateDoc(doc(db, 'events/ev1'), { title: 'Zmieniona nazwa' }));
  await assertSucceeds(deleteDoc(doc(db, 'events/ev1')));
});
await t('CREATE/UPDATE/DELETE: admin #2 (malachmurka.leszno, potwierdzony) → TAK', async () => {
  const db = user('a2', ADMIN2, true);
  await assertSucceeds(setDoc(doc(db, 'events/nowe'), EVENT));
  await assertSucceeds(updateDoc(doc(db, 'events/ev1'), { price: 60 }));
  await assertSucceeds(deleteDoc(doc(db, 'events/ev1')));
});
await t('Wielkość liter w adresie nie ma znaczenia (VELORWR16@Gmail.com) → TAK', async () =>
  assertSucceeds(setDoc(doc(user('a1', 'VELORWR16@Gmail.com', true), 'events/nowe'), EVENT)));

await t('Admin z NIEPOTWIERDZONYM adresem → NIE', async () =>
  assertFails(setDoc(doc(user('a1', ADMIN, false), 'events/nowe'), EVENT)));
await t('Podszywanie się: obcy adres podobny do admina → NIE', async () =>
  assertFails(setDoc(doc(user('x', 'velorwr16@gmail.com.evil.pl', true), 'events/nowe'), EVENT)));
await t('Custom claim admin:true (dowolny adres, niepotwierdzony) → TAK', async () => {
  const db = claimed('c1');
  await assertSucceeds(setDoc(doc(db, 'events/nowe'), EVENT));
  await assertSucceeds(deleteDoc(doc(db, 'events/ev1')));
});

console.log('\n=== WYJĄTEK: rezerwacja miejsca przez formularz ===');

await t('Anonim podbija samo `booked` o 1 → TAK', async () =>
  assertSucceeds(updateDoc(doc(anon(), 'events/ev1'), { booked: 3 })));
await t('Anonim podbija `booked` ponad `capacity` → NIE', async () =>
  assertFails(updateDoc(doc(anon(), 'events/ev1'), { booked: 11 })));
await t('Anonim ZMNIEJSZA `booked` → NIE', async () =>
  assertFails(updateDoc(doc(anon(), 'events/ev1'), { booked: 0 })));
await t('Anonim podbija `booked` i przy okazji zmienia cenę → NIE', async () =>
  assertFails(updateDoc(doc(anon(), 'events/ev1'), { booked: 3, price: 0 })));
await t('Anonim rezerwuje w zajęciach ukrytych (active:false) → NIE', async () =>
  assertFails(updateDoc(doc(anon(), 'events/ev-hidden'), { booked: 3 })));
await t('Anonim podbija `booked` o 20 naraz → NIE', async () =>
  assertFails(updateDoc(doc(anon(), 'events/ev1'), { booked: 22 })));

console.log('\n=== REALNY KOD FORMULARZA (mc-data.js) ===');

await t('createRegistration: transakcja rezerwujaca miejsce -> TAK', async () => {
  const db = anon();
  await assertSucceeds(runTransaction(db, async tx => {
    const snap = await tx.get(doc(db, 'events/ev1'));
    tx.update(doc(db, 'events/ev1'), { booked: (snap.data().booked || 0) + 2 });
  }));
});
await t('createRegistration: transakcja ponad limit miejsc -> NIE', async () => {
  const db = anon();
  await assertFails(runTransaction(db, async tx => {
    await tx.get(doc(db, 'events/ev1'));
    tx.update(doc(db, 'events/ev1'), { booked: 99 });
  }));
});
await t('bumpVisitCounter: setDoc(merge)+increment(1)+serverTimestamp -> TAK', async () =>
  assertSucceeds(setDoc(doc(anon(), 'settings/stats'),
    { visitsCount: increment(1), updatedAt: serverTimestamp() }, { merge: true })));
await t('Proba oszukania licznika: increment(50) -> NIE', async () =>
  assertFails(setDoc(doc(anon(), 'settings/stats'),
    { visitsCount: increment(50), updatedAt: serverTimestamp() }, { merge: true })));

console.log('\n=== ZAPISY (registrations) — dane osobowe ===');

await t('Anonim tworzy poprawne zgłoszenie → TAK', async () =>
  assertSucceeds(addDoc(collection(anon(), 'registrations'), REG)));
await t('Anonim tworzy zgłoszenie od razu opłacone → NIE', async () =>
  assertFails(addDoc(collection(anon(), 'registrations'), { ...REG, paid: true })));
await t('Anonim NIE czyta cudzych zgłoszeń → NIE', async () =>
  assertFails(getDoc(doc(anon(), 'registrations/r1'))));
await t('Zalogowany klient NIE czyta cudzych zgłoszeń → NIE', async () =>
  assertFails(getDoc(doc(user('obcy', 'obcy@example.com'), 'registrations/r1'))));
await t('Zalogowany klient czyta SWOJE zgłoszenie → TAK', async () =>
  assertSucceeds(getDoc(doc(user('klient', 'ktos@example.com'), 'registrations/r-mine'))));
await t('Admin czyta i edytuje zgłoszenia → TAK', async () => {
  const db = user('a1', ADMIN, true);
  await assertSucceeds(getDoc(doc(db, 'registrations/r1')));
  await assertSucceeds(updateDoc(doc(db, 'registrations/r1'), { paid: true }));
});
await t('Klient NIE zmienia cudzego zgłoszenia → NIE', async () =>
  assertFails(updateDoc(doc(user('klient', 'ktos@example.com'), 'registrations/r1'), { paid: true })));

console.log('\n=== RANKING, LICZNIKI, RESZTA ===');

await t('Ranking `guests`: anonim → NIE, admin → TAK', async () => {
  await assertFails(getDoc(doc(anon(), 'guests/726431978')));
  await assertSucceeds(getDoc(doc(user('a1', ADMIN, true), 'guests/726431978')));
});
await t('settings/presence: czyta każdy, pisze tylko admin', async () => {
  await assertSucceeds(getDoc(doc(anon(), 'settings/presence')));
  await assertFails(updateDoc(doc(anon(), 'settings/presence'), { count: 99 }));
  await assertSucceeds(updateDoc(doc(user('a1', ADMIN, true), 'settings/presence'), { count: 3 }));
});
await t('settings/stats: anonim podbija licznik o 1 → TAK', async () =>
  assertSucceeds(updateDoc(doc(anon(), 'settings/stats'), { visitsCount: 5 })));
await t('settings/stats: zapis na 2 miejsca podbija licznik o 2 -> TAK', async () =>
  assertSucceeds(setDoc(doc(anon(), 'settings/stats'),
    { visitsCount: increment(2), updatedAt: serverTimestamp() }, { merge: true })));
await t('settings/stats: zapis na 10 miejsc podbija licznik o 10 -> TAK', async () =>
  assertSucceeds(setDoc(doc(anon(), 'settings/stats'),
    { visitsCount: increment(10), updatedAt: serverTimestamp() }, { merge: true })));
await t('settings/stats: podbicie o 11 (ponad limit qty) -> NIE', async () =>
  assertFails(setDoc(doc(anon(), 'settings/stats'),
    { visitsCount: increment(11), updatedAt: serverTimestamp() }, { merge: true })));
await t('settings/stats: anonim podbija licznik o 100 → NIE', async () =>
  assertFails(updateDoc(doc(anon(), 'settings/stats'), { visitsCount: 104 })));
await t('settings/stats: anonim zmienia bazę licznika → NIE', async () =>
  assertFails(updateDoc(doc(anon(), 'settings/stats'), { visitsBase: 99999 })));
await t('Kolekcja `admins`: nikt się sam nie dopisze → NIE', async () =>
  assertFails(setDoc(doc(user('x', 'x@example.com'), 'admins/x'), { email: 'x@example.com' })));
await t('Kolekcja `admins`: admin nie doda sobie kolegi (tylko konsola) → NIE', async () =>
  assertFails(setDoc(doc(user('a1', ADMIN, true), 'admins/nowy'), { email: 'nowy@example.com' })));
await t('Nieznana kolekcja jest zamknięta dla wszystkich → NIE', async () => {
  await assertFails(getDoc(doc(anon(), 'sekrety/x')));
  await assertFails(getDoc(doc(user('a1', ADMIN, true), 'sekrety/x')));
});

console.log(`\n================  ${pass} zaliczonych, ${fail} niezaliczonych  ================\n`);
await testEnv.cleanup();
process.exit(fail ? 1 : 0);
