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
    childFirstName: (data.childFirstName || '').trim(),
    childLastName:  (data.childLastName || '').trim(),
    childDob:       data.childDob || '',
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
  await bumpVisitCounter().catch(() => {});
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

/** Zapisuje wyliczony stan do bazy (wywoływane z panelu admina). */
export async function pushPresence({ count, untilMin, manual = false }) {
  await F.setDoc(presenceRef(), {
    count: Number(count) || 0,
    until: untilMin ? `${String(Math.floor(untilMin/60)).padStart(2,'0')}:${String(untilMin%60).padStart(2,'0')}` : '',
    date: todayISO(),
    capacity: SETTINGS.capacity,
    manual: !!manual,
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

/** +1 do licznika „odwiedziło nas już…". */
export async function bumpVisitCounter() {
  await F.setDoc(statsRef(), {
    visitsCount: F.increment(1),
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

export async function setVisitsBase(base, count) {
  await F.setDoc(statsRef(), {
    visitsBase: Number(base) || 0,
    ...(count === undefined ? {} : { visitsCount: Number(count) || 0 }),
    updatedAt: F.serverTimestamp()
  }, { merge: true });
}
