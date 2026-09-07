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
         runTransaction, increment, serverTimestamp, query, where } from 'firebase/firestore';

const testEnv = await initializeTestEnvironment({
  projectId: 'mala-chmurka-test',
  firestore: { rules: readFileSync('firestore.rules', 'utf8'), host: '127.0.0.1', port: 8080 }
});

const ADMIN = 'velorwr16@gmail.com';
const ADMIN2 = 'malachmurka.leszno@gmail.com';
const ADMIN3 = 'buchar123@gmail.com';

const anon    = () => testEnv.unauthenticatedContext().firestore();
const user    = (uid, email, verified = true) =>
  testEnv.authenticatedContext(uid, { email, email_verified: verified }).firestore();
const claimed = (uid) =>
  testEnv.authenticatedContext(uid, { email: 'ktokolwiek@example.com', email_verified: false, admin: true }).firestore();

const EVENT = {
  title: 'Logosensoryka', color: '#93C7CF', date: '2026-09-10', start: '09:30', end: '10:30',
  capacity: 10, booked: 2, price: 45, active: true
};
const BOOKING = {
  date: '2026-09-10', start: '10:00', duration: '2h', durationLabel: '2 godziny',
  children: [{ name: 'Zosia', dob: '2022-01-01', tier: 'full', price: 40 }],
  qty: 1, tariff: 'weekday', base: 40, total: 40, siblingApplies: false,
  parentFirstName: 'Anna', parentLastName: 'Kowalska',
  email: 'anna@example.com', phone: '726431978', phoneKey: '726431978',
  note: '', status: 'pending', adminNote: '', uid: null
};
const IMAGE = {
  eventId: 'ev1', kind: 'data', src: 'data:image/jpeg;base64,AAAA',
  name: 'warsztaty.jpg', width: 1400, height: 1050, bytes: 3, order: 0
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
    await setDoc(doc(db, 'bookings/b-guest'), { ...BOOKING, uid: null });
    await setDoc(doc(db, 'bookings/b-mine'),  { ...BOOKING, uid: 'klient' });
    await setDoc(doc(db, 'bookings/b-other'), { ...BOOKING, uid: 'ktos-inny' });
    await setDoc(doc(db, 'eventImages/img1'), IMAGE);
    await setDoc(doc(db, 'eventImages/img2'), { ...IMAGE, order: 1, name: 'domki.jpg' });
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
await t('CREATE/UPDATE/DELETE: admin #3 (buchar123, potwierdzony) → TAK', async () => {
  const db = user('a3', ADMIN3, true);
  await assertSucceeds(setDoc(doc(db, 'events/nowe'), EVENT));
  await assertSucceeds(updateDoc(doc(db, 'events/ev1'), { price: 55 }));
  await assertSucceeds(deleteDoc(doc(db, 'events/ev1')));
});
/* Potwierdzenie adresu obowiązuje każdy adres z listy tak samo — nowy też.
   To ta reguła stoi między „ktoś zna adres z listy" a „ktoś ma do niego skrzynkę". */
await t('Admin #3 z NIEPOTWIERDZONYM adresem → NIE', async () =>
  assertFails(setDoc(doc(user('a3', ADMIN3, false), 'events/nowe'), EVENT)));
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

console.log('\n=== ZDJĘCIA ZAJĘĆ (eventImages) ===');

await t('READ galerii: anonim → TAK (strona zajęć musi ją pokazać)', async () => {
  await assertSucceeds(getDoc(doc(anon(), 'eventImages/img1')));
  await assertSucceeds(getDocs(query(collection(anon(), 'eventImages'),
    where('eventId', '==', 'ev1'))));
});

await t('CREATE zdjęcia: anonim → NIE', async () =>
  assertFails(setDoc(doc(anon(), 'eventImages/obce'), IMAGE)));
await t('UPDATE zdjęcia: anonim → NIE', async () =>
  assertFails(updateDoc(doc(anon(), 'eventImages/img1'), { order: 5 })));
await t('DELETE zdjęcia: anonim → NIE', async () =>
  assertFails(deleteDoc(doc(anon(), 'eventImages/img1'))));

await t('CREATE zdjęcia: zalogowany klient (spoza listy) → NIE', async () =>
  assertFails(setDoc(doc(user('klient', 'ktos@example.com'), 'eventImages/obce'), IMAGE)));
await t('DELETE zdjęcia: zalogowany klient → NIE', async () =>
  assertFails(deleteDoc(doc(user('klient', 'ktos@example.com'), 'eventImages/img1'))));
await t('Podszywanie się pod admina przy wgrywaniu → NIE', async () =>
  assertFails(setDoc(doc(user('x', 'velorwr16@gmail.com.evil.pl', true), 'eventImages/obce'), IMAGE)));
await t('Admin z NIEPOTWIERDZONYM adresem nie wgra zdjęcia → NIE', async () =>
  assertFails(setDoc(doc(user('a1', ADMIN, false), 'eventImages/obce'), IMAGE)));

await t('CREATE/UPDATE/DELETE zdjęcia: administrator → TAK', async () => {
  const db = user('a1', ADMIN, true);
  await assertSucceeds(setDoc(doc(db, 'eventImages/nowe'), IMAGE));
  await assertSucceeds(updateDoc(doc(db, 'eventImages/img1'), { order: 2 }));
  await assertSucceeds(deleteDoc(doc(db, 'eventImages/img2')));
});
await t('Custom claim admin:true też wgrywa zdjęcia → TAK', async () =>
  assertSucceeds(setDoc(doc(claimed('c1'), 'eventImages/nowe'), IMAGE)));

await t('Zdjęcie cięższe niż dokument Firestore → NIE', async () =>
  assertFails(setDoc(doc(user('a1', ADMIN, true), 'eventImages/grube'),
    { ...IMAGE, src: 'data:image/jpeg;base64,' + 'A'.repeat(950000) })));
await t('Puste źródło zdjęcia → NIE', async () =>
  assertFails(setDoc(doc(user('a1', ADMIN, true), 'eventImages/puste'), { ...IMAGE, src: '' })));
await t('Nieznany rodzaj zdjęcia → NIE', async () =>
  assertFails(setDoc(doc(user('a1', ADMIN, true), 'eventImages/dziwne'),
    { ...IMAGE, kind: 'script' })));
await t('Kolejność musi być liczbą → NIE', async () =>
  assertFails(setDoc(doc(user('a1', ADMIN, true), 'eventImages/zle'),
    { ...IMAGE, order: 'pierwsze' })));
await t('Zdjęcie bez przypisanych zajęć → NIE', async () =>
  assertFails(setDoc(doc(user('a1', ADMIN, true), 'eventImages/sierota'),
    { ...IMAGE, eventId: '' })));

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
await t('Zgloszenie z lista dzieci (children[]) -> TAK', async () =>
  assertSucceeds(addDoc(collection(anon(), 'registrations'), { ...REG, qty: 2,
    children: [{ firstName: 'Zosia', lastName: 'Kowalska', dob: '2022-01-01' },
               { firstName: 'Antek', lastName: 'Kowalski', dob: '2024-05-05' }] })));
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

console.log('\n=== REZERWACJE BAWIALNI (bookings) ===');

await t('Anonim tworzy rezerwacje jako oczekujaca -> TAK', async () =>
  assertSucceeds(addDoc(collection(anon(), 'bookings'), BOOKING)));
await t('Anonim tworzy rezerwacje od razu zaakceptowana -> NIE', async () =>
  assertFails(addDoc(collection(anon(), 'bookings'), { ...BOOKING, status: 'accepted' })));
await t('Klient NIE zmienia statusu swojej rezerwacji -> NIE', async () =>
  assertFails(updateDoc(doc(user('klient', 'k\example.com'), 'bookings/b-mine'), { status: 'accepted' })));
await t('Klient NIE podepnie rezerwacji pod cudze konto -> NIE', async () =>
  assertFails(addDoc(collection(user('klient', 'k\example.com'), 'bookings'), { ...BOOKING, uid: 'ktos-inny' })));
await t('Zalogowany podpina rezerwacje pod swoje konto -> TAK', async () =>
  assertSucceeds(addDoc(collection(user('klient', 'k\example.com'), 'bookings'), { ...BOOKING, uid: 'klient' })));
await t('Admin zaklada wejscie z ulicy (od razu zaakceptowane) -> TAK', async () =>
  assertSucceeds(addDoc(collection(user('a1', ADMIN, true), 'bookings'),
    { ...BOOKING, status: 'accepted', source: 'walkin', paid: true, stayUntil: '13:00' })));
await t('Klient NIE zalozy rezerwacji od razu zaakceptowanej -> NIE', async () =>
  assertFails(addDoc(collection(anon(), 'bookings'),
    { ...BOOKING, status: 'accepted', source: 'walkin' })));
await t('Klient NIE zglosi sie sam jako oplacony -> NIE', async () =>
  assertFails(addDoc(collection(anon(), 'bookings'), { ...BOOKING, paid: true })));
await t('Klient NIE wpisze sie sam do rankingu -> NIE', async () =>
  assertFails(addDoc(collection(anon(), 'bookings'), { ...BOOKING, countedInRanking: true })));
await t('Rezerwacja z paid:false i countedInRanking:false -> TAK', async () =>
  assertSucceeds(addDoc(collection(anon(), 'bookings'),
    { ...BOOKING, paid: false, countedInRanking: false, stayUntil: '' })));
await t('Admin oznacza oplate i godzine wyjscia -> TAK', async () => {
  const db = user('a1', ADMIN, true);
  await assertSucceeds(updateDoc(doc(db, 'bookings/b-mine'),
    { paid: true, stayUntil: '13:30', countedInRanking: true }));
});
await t('Klient NIE oznaczy swojej rezerwacji jako oplaconej -> NIE', async () =>
  assertFails(updateDoc(doc(user('klient', 'k@example.com'), 'bookings/b-mine'), { paid: true })));
await t('Rezerwacja na 11 dzieci -> NIE', async () =>
  assertFails(addDoc(collection(anon(), 'bookings'), { ...BOOKING, qty: 11 })));
await t('Rezerwacja z bzdurnym czasem pobytu -> NIE', async () =>
  assertFails(addDoc(collection(anon(), 'bookings'), { ...BOOKING, duration: '8h' })));
await t('Anonim NIE czyta cudzych rezerwacji -> NIE', async () =>
  assertFails(getDoc(doc(anon(), 'bookings/b-mine'))));
await t('Klient czyta SWOJA rezerwacje -> TAK', async () =>
  assertSucceeds(getDoc(doc(user('klient', 'k\example.com'), 'bookings/b-mine'))));
await t('Klient NIE czyta rezerwacji innej osoby -> NIE', async () =>
  assertFails(getDoc(doc(user('klient', 'k\example.com'), 'bookings/b-other'))));
await t('Admin czyta i akceptuje rezerwacje -> TAK', async () => {
  const db = user('a1', ADMIN, true);
  await assertSucceeds(getDoc(doc(db, 'bookings/b-mine')));
  await assertSucceeds(updateDoc(doc(db, 'bookings/b-mine'), { status: 'accepted', adminNote: '' }));
  await assertSucceeds(updateDoc(doc(db, 'bookings/b-guest'), { status: 'rejected', adminNote: 'komplet' }));
});

console.log('\n=== HISTORIA ZAMOWIEN (zapytania o swoje wpisy) ===');

await t('Historia: zapytanie o SWOJE rezerwacje -> TAK', async () => {
  const db = user('klient', 'k\example.com');
  await assertSucceeds(getDocs(query(collection(db, 'bookings'), where('uid', '==', 'klient'))));
});
await t('Historia: zapytanie o SWOJE zapisy na zajecia -> TAK', async () => {
  const db = user('klient', 'k\example.com');
  await assertSucceeds(getDocs(query(collection(db, 'registrations'), where('uid', '==', 'klient'))));
});
await t('Zapytanie o CUDZE rezerwacje -> NIE', async () => {
  const db = user('klient', 'k\example.com');
  await assertFails(getDocs(query(collection(db, 'bookings'), where('uid', '==', 'ktos-inny'))));
});
await t('Zapytanie o WSZYSTKIE rezerwacje (bez filtra) -> NIE', async () =>
  assertFails(getDocs(collection(user('klient', 'k\example.com'), 'bookings'))));
await t('Admin pobiera wszystkie rezerwacje -> TAK', async () =>
  assertSucceeds(getDocs(collection(user('a1', ADMIN, true), 'bookings'))));

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
