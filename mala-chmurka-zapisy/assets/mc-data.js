/* ==========================================================================
   Mała Chmurka — warstwa dostępu do bazy Firestore.
   Cała logika zapisu/odczytu jest tutaj, żeby podstrony zostały czytelne.

   STRUKTURA BAZY
   ----------------------------------------------------------------------
   events/{id}              pojedyncze zajęcia w kalendarzu
     title, color, date "YYYY-MM-DD", start "09:30", end "11:30",
     capacity, booked, price, ageMin, ageMax, gender,
     shortDesc, description, organizerDesc, location, badge,
     images[], paymentMethods[], arriveMinutes, cancelHours, note, active

   registrations/{id}       zapis dziecka na zajęcia
     eventId, eventTitle, eventDate, eventStart, eventEnd,
     parentFirstName, parentLastName, email, phone, phoneKey,
     childFirstName, childLastName, childDob,
     qty, unitPrice, total, paymentMethod,
     paid, attended, countedInRanking, stayUntil "HH:MM",
     uid|null, status, createdAt

   guests/{phoneKey}        ranking odwiedzin
     phone, email, parentName, childName, visits, totalMinutes, lastVisit

   settings/presence        licznik na stronie głównej
     count, until "HH:MM", date "YYYY-MM-DD", capacity, manual, updatedAt

   settings/stats           licznik wszystkich odwiedzin
     visitsBase, visitsCount            (razem = base + count)

   admins/{uid}             kto ma dostęp do panelu
   ========================================================================== */

import { db, F, PATHS, SETTINGS } from './mc-firebase.js';
import { toMin, isoDate, normPhone } from './mc-common.js';

const col = name => F.collection(db, name);
const ref = (name, id) => F.doc(db, name, id);

export const todayISO = () => isoDate(new Date());
export const nowMin   = () => { const d = new Date(); return d.getHours()*60 + d.getMinutes(); };

/* ==========================================================================
   ZAJĘCIA
   ========================================================================== */

export const EMPTY_EVENT = {
  title: '', color: '#93C7CF', date: '', start: '09:30', end: '10:30',
  capacity: 10, booked: 0, price: 0,
  ageMin: 0, ageMax: 6, gender: 'Obie',
  shortDesc: '', description: '', organizerDesc: '',
  location: `${SETTINGS.address}, ${SETTINGS.city}`,
  badge: 'zajęcia', images: [], paymentMethods: [...SETTINGS.paymentMethods],
  arriveMinutes: 10, cancelHours: 24, note: '', active: true
};

/** Zajęcia w zakresie dat (włącznie), posortowane. */
export async function listEvents(fromISO, toISO) {
  const q = F.query(col(PATHS.events),
    F.where('date', '>=', fromISO),
    F.where('date', '<=', toISO),
    F.orderBy('date'));
  const snap = await F.getDocs(q);
  return snap.docs
    .map(d => ({ id: d.id, ...d.data() }))
    .sort((a, b) => a.date.localeCompare(b.date) || toMin(a.start) - toMin(b.start));
}

/** Nasłuch na żywo — kalendarz odświeża się sam, gdy admin coś zmieni. */
export function watchEvents(fromISO, toISO, cb) {
  const q = F.query(col(PATHS.events),
    F.where('date', '>=', fromISO),
    F.where('date', '<=', toISO),
    F.orderBy('date'));
  return F.onSnapshot(q, snap => {
    const list = snap.docs.map(d => ({ id: d.id, ...d.data() }))
      .sort((a, b) => a.date.localeCompare(b.date) || toMin(a.start) - toMin(b.start));
    cb(list);
  }, err => console.error('watchEvents', err));
}

export async function getEvent(id) {
  const s = await F.getDoc(ref(PATHS.events, id));
  return s.exists() ? { id: s.id, ...s.data() } : null;
}

/** Wszystkie przyszłe terminy o tym samym tytule — „sprawdź inne terminy". */
export async function otherDatesOf(title, fromISO = todayISO()) {
  const q = F.query(col(PATHS.events), F.where('date', '>=', fromISO), F.orderBy('date'));
  const snap = await F.getDocs(q);
  return snap.docs.map(d => ({ id: d.id, ...d.data() }))
    .filter(e => e.title === title && e.active !== false)
    .sort((a, b) => a.date.localeCompare(b.date) || toMin(a.start) - toMin(b.start));
}

export async function saveEvent(id, data) {
  const payload = { ...data, updatedAt: F.serverTimestamp() };
  if (id) { await F.updateDoc(ref(PATHS.events, id), payload); return id; }
  payload.createdAt = F.serverTimestamp();
  const r = await F.addDoc(col(PATHS.events), payload);
  return r.id;
}

export const deleteEvent = id => F.deleteDoc(ref(PATHS.events, id));

/** Kopiuje zajęcia na inną datę (licznik zapisanych startuje od zera). */
export async function duplicateEvent(id, newDate) {
  const src = await getEvent(id);
  if (!src) throw new Error('Nie znaleziono zajęć do skopiowania.');
  const { id: _drop, createdAt, updatedAt, ...rest } = src;
  return saveEvent(null, { ...rest, date: newDate || src.date, booked: 0 });
}

/** Kopiuje zajęcia na kolejne tygodnie: [{date}] */
export async function repeatWeekly(id, weeks) {
  const src = await getEvent(id);
  if (!src) throw new Error('Nie znaleziono zajęć.');
  const made = [];
  const base = new Date(src.date + 'T00:00:00');
  for (let i = 1; i <= weeks; i++) {
    const d = new Date(base); d.setDate(d.getDate() + 7 * i);
    const { id: _drop, createdAt, updatedAt, ...rest } = src;
    made.push(await saveEvent(null, { ...rest, date: isoDate(d), booked: 0 }));
  }
  return made;
}

/* ==========================================================================
   ZAPISY
   ========================================================================== */

/** Zapis klienta + rezerwacja miejsc + licznik odwiedzin (transakcyjnie). */
export async function createRegistration(data) {
  const qty = Math.max(1, Number(data.qty) || 1);
  const evRef = ref(PATHS.events, data.eventId);

  await F.runTransaction(db, async tx => {
    const evSnap = await tx.get(evRef);
    if (!evSnap.exists()) throw new Error('Te zajęcia już nie istnieją.');
    const ev = evSnap.data();
    const booked = Number(ev.booked) || 0;
    const cap = Number(ev.capacity) || 0;
    if (cap && booked + qty > cap) throw new Error('Nie ma już tylu wolnych miejsc na te zajęcia.');
    tx.update(evRef, { booked: booked + qty });
  });

  /* Lista dzieci. Pierwsze dziecko trafia dodatkowo do pól childFirstName/…,
     żeby panel admina, ranking i starsze zapisy działały bez zmian. */
  const kids = (Array.isArray(data.children) && data.children.length
      ? data.children
      : [{ firstName: data.childFirstName, lastName: data.childLastName, dob: data.childDob }])
    .map(c => ({
      firstName: String(c.firstName || '').trim(),
      lastName:  String(c.lastName  || '').trim(),
      dob:       c.dob || ''
    }))
    .filter(c => c.firstName || c.dob)
    .slice(0, 10);
  const first = kids[0] || { firstName: '', lastName: '', dob: '' };

  const doc = {
    eventId:        data.eventId,
    eventTitle:     data.eventTitle || '',
    eventDate:      data.eventDate || '',
    eventStart:     data.eventStart || '',
    eventEnd:       data.eventEnd || '',
    parentFirstName:(data.parentFirstName || '').trim(),
    parentLastName: (data.parentLastName || '').trim(),
    email:          (data.email || '').trim().toLowerCase(),
    phone:          (data.phone || '').trim(),
    phoneKey:       normPhone(data.phone),
    childFirstName: first.firstName,
    childLastName:  first.lastName,
    childDob:       first.dob,
    children:       kids,
    qty, unitPrice: Number(data.unitPrice) || 0,
    total:          (Number(data.unitPrice) || 0) * qty,
    paymentMethod:  data.paymentMethod || 'Płatność na miejscu',
    note:           (data.note || '').trim(),
    paid: false, attended: false, countedInRanking: false,
    stayUntil:      data.eventEnd || '',
    uid:            data.uid || null,
    status:         'new',
    createdAt:      F.serverTimestamp()
  };

  const r = await F.addDoc(col(PATHS.registrations), doc);
  await bumpVisitCounter(qty).catch(() => {});
  return { id: r.id, ...doc };
}

export async function listRegistrations({ fromISO, toISO, eventId } = {}) {
  let q = col(PATHS.registrations);
  if (eventId) {
    q = F.query(q, F.where('eventId', '==', eventId));
  } else if (fromISO && toISO) {
    q = F.query(q, F.where('eventDate', '>=', fromISO), F.where('eventDate', '<=', toISO), F.orderBy('eventDate', 'desc'));
  } else {
    q = F.query(q, F.orderBy('eventDate', 'desc'), F.limit(500));
  }
  const snap = await F.getDocs(q);
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

export function watchRegistrations({ fromISO, toISO } = {}, cb) {
  let q = col(PATHS.registrations);
  q = (fromISO && toISO)
    ? F.query(q, F.where('eventDate', '>=', fromISO), F.where('eventDate', '<=', toISO), F.orderBy('eventDate', 'desc'))
    : F.query(q, F.orderBy('eventDate', 'desc'), F.limit(500));
  return F.onSnapshot(q, s => cb(s.docs.map(d => ({ id: d.id, ...d.data() }))),
    err => console.error('watchRegistrations', err));
}

/**
 * Przelicza pole `booked` w zajęciach na podstawie faktycznych zapisów.
 *
 * Po co: `booked` to skrót trzymany przy zajęciach, żeby klient bez konta
 * widział liczbę wolnych miejsc (zapisów odczytać nie może). Skrót potrafi
 * się rozjechać — po edycji terminu, po usunięciu zapisu, po zduplikowaniu.
 * Ta funkcja przywraca prawdę: liczy zapisy o tym `eventId` i zapisuje sumę.
 * Wywołuje ją panel admina, bo tylko administrator czyta zapisy.
 *
 * @returns {number} liczba zapisanych dzieci
 */
export async function recountEventBooked(eventId) {
  if (!eventId) return 0;
  const snap = await F.getDocs(F.query(col(PATHS.registrations), F.where('eventId', '==', eventId)));
  const total = snap.docs.reduce((sum, d) => sum + (Number(d.data().qty) || 1), 0);
  await F.updateDoc(ref(PATHS.events, eventId), { booked: total, updatedAt: F.serverTimestamp() });
  return total;
}

/**
 * Przepisuje aktualne dane zajęć do wszystkich powiązanych zapisów.
 *
 * Po co: zapis trzyma kopię terminu (eventDate/eventStart/eventEnd/eventTitle),
 * żeby panel i historia klienta działały bez dociągania zajęć. Gdy admin
 * przeniesie zajęcia na inny dzień albo zmieni nazwę, kopie zostają stare —
 * zapisani „znikają" z nowego terminu, a licznik obecności liczy złą godzinę.
 * Ta funkcja przywraca spójność. Wywoływana z panelu po zapisaniu zajęć.
 *
 * @returns {number} liczba zaktualizowanych zapisów
 */
export async function syncRegistrationsToEvent(eventId, ev) {
  if (!eventId || !ev) return 0;
  const snap = await F.getDocs(F.query(col(PATHS.registrations), F.where('eventId', '==', eventId)));
  let touched = 0;

  for (const d of snap.docs) {
    const r = d.data();
    const patch = {};
    if (r.eventTitle !== ev.title) patch.eventTitle = ev.title || '';
    if (r.eventDate  !== ev.date)  patch.eventDate  = ev.date || '';
    if (r.eventStart !== ev.start) patch.eventStart = ev.start || '';
    if (r.eventEnd   !== ev.end)   patch.eventEnd   = ev.end || '';
    /* godzina wyjścia: przesuwamy tylko wtedy, gdy nie była ustawiona ręcznie */
    if (patch.eventEnd && (!r.stayUntil || r.stayUntil === r.eventEnd)) patch.stayUntil = ev.end || '';
    if (!Object.keys(patch).length) continue;
    patch.updatedAt = F.serverTimestamp();
    await F.updateDoc(ref(PATHS.registrations, d.id), patch);
    touched++;
  }
  return touched;
}

/**
 * Jedno wywołanie po zapisaniu zajęć: przepisuje termin do zapisów
 * i ustawia licznik zajętych miejsc na faktyczną liczbę zapisanych dzieci.
 * Dzięki temu kafelek pokazuje prawdę niezależnie od tego, czy zajęcia są
 * nowe, zduplikowane, czy przeniesione na inny dzień.
 */
export async function refreshEvent(eventId, ev) {
  const moved = await syncRegistrationsToEvent(eventId, ev);
  const booked = await recountEventBooked(eventId);
  return { moved, booked };
}

/** Ile dzieci jest zapisanych na te zajęcia — liczone z listy zapisów. */
export function countBooked(regs, eventId) {
  return (regs || [])
    .filter(r => r.eventId === eventId)
    .reduce((sum, r) => sum + (Number(r.qty) || 1), 0);
}

export const updateRegistration = (id, patch) =>
  F.updateDoc(ref(PATHS.registrations, id), { ...patch, updatedAt: F.serverTimestamp() });

export const deleteRegistration = id => F.deleteDoc(ref(PATHS.registrations, id));

/* ==========================================================================
   RANKING ODWIEDZIN (kolekcja guests)
   ========================================================================== */

/** Dopisuje / odejmuje wizytę w rankingu. delta = +1 lub -1. */
export async function applyVisitToRanking(reg, delta) {
  const key = reg.phoneKey || normPhone(reg.phone) || (reg.email || '').replace(/[^a-z0-9]/gi, '_');
  if (!key) return;
  const minutes = Math.max(0, toMin(reg.stayUntil || reg.eventEnd) - toMin(reg.eventStart)) * (Number(reg.qty) || 1);
  const gRef = ref(PATHS.guests, key);

  await F.runTransaction(db, async tx => {
    const snap = await tx.get(gRef);
    const prev = snap.exists() ? snap.data() : { visits: 0, totalMinutes: 0 };
    const next = {
      phone:        reg.phone || prev.phone || '',
      phoneKey:     key,
      email:        reg.email || prev.email || '',
      parentName:   `${reg.parentFirstName || ''} ${reg.parentLastName || ''}`.trim() || prev.parentName || '',
      childName:    `${reg.childFirstName || ''} ${reg.childLastName || ''}`.trim() || prev.childName || '',
      visits:       Math.max(0, (Number(prev.visits) || 0) + delta),
      totalMinutes: Math.max(0, (Number(prev.totalMinutes) || 0) + delta * minutes),
      lastVisit:    delta > 0 ? (reg.eventDate || todayISO()) : (prev.lastVisit || ''),
      updatedAt:    F.serverTimestamp()
    };
    tx.set(gRef, next, { merge: true });
  });
}

export async function listGuests() {
  const snap = await F.getDocs(F.query(col(PATHS.guests), F.orderBy('visits', 'desc')));
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

/* ==========================================================================
   LICZNIKI (settings/presence i settings/stats)
   ========================================================================== */

export const presenceRef = () => ref(PATHS.settings, 'presence');
export const statsRef    = () => ref(PATHS.settings, 'stats');

export function watchPresence(cb) {
  return F.onSnapshot(presenceRef(), s => cb(s.exists() ? s.data() : null),
    err => console.error('watchPresence', err));
}
export function watchStats(cb) {
  return F.onSnapshot(statsRef(), s => cb(s.exists() ? s.data() : null),
    err => console.error('watchStats', err));
}

export { computePresence } from './mc-common.js';

/** Zapisuje wyliczony stan do bazy (wywoływane z panelu admina).
    `capacity` podaje się tylko wtedy, gdy ma się zmienić — bez tego zostaje
    to, co administrator ustawił w zakładce „Licznik w bawialni". Wcześniej
    każde odświeżenie licznika cofało maksimum do wartości domyślnej. */
export async function pushPresence({ count, untilMin, manual = false, capacity }) {
  const doc = {
    count: Number(count) || 0,
    until: untilMin ? `${String(Math.floor(untilMin/60)).padStart(2,'0')}:${String(untilMin%60).padStart(2,'0')}` : '',
    date: todayISO(),
    manual: !!manual,
    updatedAt: F.serverTimestamp()
  };
  if (capacity !== undefined && capacity !== null) doc.capacity = Number(capacity) || SETTINGS.capacity;
  await F.setDoc(presenceRef(), doc, { merge: true });
}

/** Samo maksimum (mianownik licznika) — bez ruszania liczby dzieci i trybu. */
export async function setPresenceCapacity(capacity) {
  await F.setDoc(presenceRef(), {
    capacity: Math.max(1, Number(capacity) || SETTINGS.capacity),
    updatedAt: F.serverTimestamp()
  }, { merge: true });
}

/** Ręczne nadpisanie licznika z panelu (zakładka 3). */
export async function setPresenceManual(count, untilHHMM, capacity) {
  await F.setDoc(presenceRef(), {
    count: Number(count) || 0,
    until: untilHHMM || '',
    date: todayISO(),
    capacity: Number(capacity) || SETTINGS.capacity,
    manual: true,
    updatedAt: F.serverTimestamp()
  }, { merge: true });
}

export const clearPresenceManual = () => F.setDoc(presenceRef(), { manual: false }, { merge: true });

/** Podbija licznik „odwiedziło nas już…" o liczbę zapisanych DZIECI.
    Jedno zgłoszenie na 2 miejsca to dwoje dzieci, więc licznik rośnie o 2.
    Górna granica 10 jest ta sama, co w firestore.rules — powyżej baza odrzuci zapis. */
export async function bumpVisitCounter(qty = 1) {
  const by = Math.min(10, Math.max(1, Number(qty) || 1));
  await F.setDoc(statsRef(), {
    visitsCount: F.increment(by),
    updatedAt: F.serverTimestamp()
  }, { merge: true });
}

export async function ensureSettings() {
  const s = await F.getDoc(statsRef());
  if (!s.exists()) {
    await F.setDoc(statsRef(), { visitsBase: SETTINGS.visitsBase, visitsCount: 0, updatedAt: F.serverTimestamp() });
  }
  const p = await F.getDoc(presenceRef());
  if (!p.exists()) {
    await F.setDoc(presenceRef(), { count: 0, until: '', date: todayISO(),
      capacity: SETTINGS.capacity, manual: false, updatedAt: F.serverTimestamp() });
  }
}

/** Zmienia licznik odwiedzin o dowolną wartość — także w dół (tylko admin). */
export async function addVisitCount(delta) {
  const by = Math.round(Number(delta) || 0);
  if (!by) return;
  await F.setDoc(statsRef(), {
    visitsCount: F.increment(by),
    updatedAt: F.serverTimestamp()
  }, { merge: true });
}

/**
 * Przelicza licznik odwiedzin z bazy: sumuje LICZBĘ DZIECI, a nie rekordów.
 * Zgłoszenie na czworo dzieci liczy się jako czworo. Bierze pod uwagę zapisy
 * na zajęcia oraz zaakceptowane rezerwacje wstępu.
 * @returns {{ total, fromRegistrations, fromBookings }}
 */
export async function recountVisitsFromDb() {
  const [regsSnap, bookSnap] = await Promise.all([
    F.getDocs(col(PATHS.registrations)),
    F.getDocs(F.query(col(PATHS.bookings), F.where('status', '==', 'accepted')))
  ]);
  const sum = docs => docs.reduce((n, d) => n + (Number(d.data().qty) || 1), 0);
  const fromRegistrations = sum(regsSnap.docs);
  const fromBookings = sum(bookSnap.docs);
  return { total: fromRegistrations + fromBookings, fromRegistrations, fromBookings };
}

export async function setVisitsBase(base, count) {
  await F.setDoc(statsRef(), {
    visitsBase: Number(base) || 0,
    ...(count === undefined ? {} : { visitsCount: Number(count) || 0 }),
    updatedAt: F.serverTimestamp()
  }, { merge: true });
}

/* ==========================================================================
   REZERWACJE BAWIALNI  (kolekcja `bookings`)
   --------------------------------------------------------------------------
   To NIE są zapisy na zajęcia — to zwykłe wejście do bawialni na godzinę,
   dwie albo bez limitu. Każda rezerwacja startuje jako `pending` i dopiero
   administrator ją akceptuje albo odrzuca (zakładka „Rezerwacje" w panelu).
   Klient widzi status w „Historii zamówień".

   bookings/{id}
     date "YYYY-MM-DD", start "HH:MM", duration "1h"|"2h"|"open", durationLabel,
     children[{ name, dob, tier, price }], qty,
     tariff "weekday"|"weekend", base, total, siblingApplies,
     parentFirstName, parentLastName, email, phone, phoneKey, note,
     status "pending"|"accepted"|"rejected", adminNote,
     uid|null, createdAt, decidedAt
   ========================================================================== */

export const BOOKING_STATUS = {
  pending:  'pending',
  accepted: 'accepted',
  rejected: 'rejected'
};

/** Teksty pokazywane klientowi w historii zamówień. */
export const BOOKING_STATUS_TEXT = {
  pending:  'Oczekujesz na potwierdzenie',
  accepted: 'Status zaakceptowany, zapraszamy do bawialni',
  rejected: 'Bawialnia w tym dniu ma już komplet i niestety nie możemy zaakceptować zgłoszenia — zapraszamy w innym dogodnym terminie'
};

/** Krótka etykieta na plakietkę (panel admina, listy). */
export const BOOKING_STATUS_SHORT = {
  pending:  'oczekuje',
  accepted: 'zaakceptowana',
  rejected: 'odrzucona'
};

/** Tworzy rezerwację. Zawsze `pending` — statusu nie da się ustawić z formularza. */
export async function createBooking(data) {
  const kids = (data.children || []).map(c => ({
    name:  String(c.name || '').trim(),
    dob:   c.dob || '',
    tier:  c.tier || 'full',
    price: Number(c.price) || 0
  }));
  const qty = Math.max(1, Math.min(10, kids.length || Number(data.qty) || 1));

  const doc = {
    date:            data.date || '',
    start:           data.start || '',
    duration:        data.duration || '1h',
    durationLabel:   data.durationLabel || '',
    children:        kids,
    qty,
    tariff:          data.tariff || 'weekday',
    base:            Number(data.base) || 0,
    total:           Number(data.total) || 0,
    siblingApplies:  !!data.siblingApplies,
    parentFirstName: (data.parentFirstName || '').trim(),
    parentLastName:  (data.parentLastName || '').trim(),
    email:           (data.email || '').trim().toLowerCase(),
    phone:           (data.phone || '').trim(),
    phoneKey:        normPhone(data.phone),
    note:            (data.note || '').trim(),
    status:          BOOKING_STATUS.pending,
    adminNote:       '',
    uid:             data.uid || null,
    createdAt:       F.serverTimestamp()
  };

  const r = await F.addDoc(col(PATHS.bookings), doc);
  return { id: r.id, ...doc };
}

/** Rezerwacje w zakresie dat — dla panelu admina. */
export async function listBookings({ fromISO, toISO } = {}) {
  let q = col(PATHS.bookings);
  q = (fromISO && toISO)
    ? F.query(q, F.where('date', '>=', fromISO), F.where('date', '<=', toISO), F.orderBy('date'))
    : F.query(q, F.orderBy('date', 'desc'), F.limit(500));
  const snap = await F.getDocs(q);
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

/** Nasłuch na żywo — panel admina odświeża się, gdy ktoś zarezerwuje miejsce. */
export function watchBookings({ fromISO, toISO } = {}, cb) {
  let q = col(PATHS.bookings);
  q = (fromISO && toISO)
    ? F.query(q, F.where('date', '>=', fromISO), F.where('date', '<=', toISO), F.orderBy('date'))
    : F.query(q, F.orderBy('date', 'desc'), F.limit(500));
  return F.onSnapshot(q,
    s => cb(s.docs.map(d => ({ id: d.id, ...d.data() }))
             .sort((a, b) => (a.date || '').localeCompare(b.date || '') || toMin(a.start) - toMin(b.start))),
    err => console.error('watchBookings', err));
}

/** Akceptacja / odrzucenie rezerwacji — wyłącznie administrator. */
export const setBookingStatus = (id, status, adminNote = '') =>
  F.updateDoc(ref(PATHS.bookings, id), {
    status,
    adminNote: String(adminNote || ''),
    decidedAt: F.serverTimestamp(),
    updatedAt: F.serverTimestamp()
  });

export const deleteBooking = id => F.deleteDoc(ref(PATHS.bookings, id));

/** Odhacza, że rezerwacja została już policzona w liczniku odwiedzin. */
export const markBookingCounted = (id, counted) =>
  F.updateDoc(ref(PATHS.bookings, id), { countedInVisits: !!counted, updatedAt: F.serverTimestamp() });

/* ==========================================================================
   HISTORIA ZAMÓWIEŃ KLIENTA
   Zalogowany użytkownik widzi wyłącznie swoje wpisy — pilnują tego reguły
   Firestore, nie ten kod.
   ========================================================================== */

/** Moje rezerwacje bawialni, od najnowszej. */
export async function myBookings(uid) {
  if (!uid) return [];
  const snap = await F.getDocs(F.query(col(PATHS.bookings), F.where('uid', '==', uid)));
  return snap.docs.map(d => ({ id: d.id, ...d.data() }))
    .sort((a, b) => (b.date || '').localeCompare(a.date || ''));
}

/** Nasłuch na moje rezerwacje — status zmienia się bez odświeżania strony. */
export function watchMyBookings(uid, cb, onError) {
  if (!uid) { cb([]); return () => {}; }
  return F.onSnapshot(F.query(col(PATHS.bookings), F.where('uid', '==', uid)),
    s => cb(s.docs.map(d => ({ id: d.id, ...d.data() }))
             .sort((a, b) => (b.date || '').localeCompare(a.date || ''))),
    err => { console.error('watchMyBookings', err); if (onError) onError(err); });
}

/** Moje zapisy na zajęcia, od najnowszego. */
export async function myRegistrations(uid) {
  if (!uid) return [];
  const snap = await F.getDocs(F.query(col(PATHS.registrations), F.where('uid', '==', uid)));
  return snap.docs.map(d => ({ id: d.id, ...d.data() }))
    .sort((a, b) => (b.eventDate || '').localeCompare(a.eventDate || ''));
}

export function watchMyRegistrations(uid, cb, onError) {
  if (!uid) { cb([]); return () => {}; }
  return F.onSnapshot(F.query(col(PATHS.registrations), F.where('uid', '==', uid)),
    s => cb(s.docs.map(d => ({ id: d.id, ...d.data() }))
             .sort((a, b) => (b.eventDate || '').localeCompare(a.eventDate || ''))),
    err => { console.error('watchMyRegistrations', err); if (onError) onError(err); });
}

/** Status zapisu na zajęcia, opisany po ludzku — na potrzeby historii. */
export function registrationStatusText(reg) {
  if (reg.attended && reg.paid) return { kind: 'ok',   text: 'Wizyta odbyta i rozliczona' };
  if (reg.paid)                  return { kind: 'ok',   text: 'Opłacone — do zobaczenia na zajęciach' };
  if (reg.attended)              return { kind: 'warn', text: 'Obecność potwierdzona, płatność na miejscu' };
  return { kind: 'info', text: 'Zapis przyjęty — płatność przed zajęciami lub na miejscu' };
}
