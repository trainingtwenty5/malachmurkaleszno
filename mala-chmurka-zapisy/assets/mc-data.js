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
     (images[] to stare adresy URL wpisywane ręcznie — nowe zdjęcia mieszkają
      w osobnej kolekcji eventImages, patrz niżej)

   eventImages/{id}         jedno zdjęcie zajęć
     eventId, kind 'data'|'url', src, name, width, height, bytes, order,
     createdAt
     Zdjęcie wgrane z dysku siedzi w polu `src` jako data URL — Firebase
     Storage wymaga płatnego planu, a ten projekt nie ma backendu. Limit
     dokumentu (1 MiB) pilnuje przeglądarka: zmniejsza zdjęcie przed wysłaniem.

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
     timeline [{from,to,qty}]  rozkład godzinowy dnia w minutach — strona
       główna przelicza z niego licznik co pół minuty, więc liczba dzieci
       zmienia się sama z upływem czasu, bez otwartego panelu. Bez imion,
       telefonów i numerów rekordów: sam kształt obłożenia.

   settings/stats           licznik wszystkich odwiedzin
     visitsBase, visitsCount            (razem = base + count)

   admins/{uid}             kto ma dostęp do panelu

   auditLog/{id}            dziennik zmian: jeden dokument = jedna zmiana
     at, who (e-mail), uid, action ('booking.update'), subject (czytelny opis),
     targetId, changes[] ("opłacone: tak")
     Kolekcja TYLKO DO DOPISYWANIA — reguły odmawiają UPDATE i DELETE
     wszystkim, także administratorowi.
   ========================================================================== */

import { db, F, PATHS, SETTINGS, auth, isAdminEmail } from './mc-firebase.js';
import { toMin, isoDate, normPhone, bookingEndMin, orderRef, opisZmian } from './mc-common.js';
/* Wejscie przy drzwiach wycenia sie tym samym cennikiem, co rezerwacja
   ze strony — inaczej to samo wejscie mialoby dwie ceny. */
import { quote, DURATIONS, isAgeTier } from './mc-cennik.js';

const col = name => F.collection(db, name);
const ref = (name, id) => F.doc(db, name, id);

export const todayISO = () => isoDate(new Date());
export const nowMin   = () => { const d = new Date(); return d.getHours()*60 + d.getMinutes(); };

/* ==========================================================================
   DZIENNIK ZMIAN (kolekcja auditLog)
   --------------------------------------------------------------------------
   Kto, co i kiedy zmienił w panelu. Do panelu ma dostęp kilka osób, a baza
   pokazuje wyłącznie stan na teraz — po fakcie nie da się z niej odczytać,
   czy rezerwacja została odrzucona wczoraj czy przed chwilą i przez kogo.
   Dziennik odpowiada na to pytanie.

   TRZY DECYZJE, KTÓRE WARTO ZNAĆ:

   1. WPISUJEMY TU Z WARSTWY BAZY, a nie z panelu. Gdyby wpisy powstawały
      przy przyciskach, każdy nowy przycisk byłby okazją, żeby o dzienniku
      zapomnieć — a dziennik z dziurami jest gorszy niż żaden, bo wygląda
      na kompletny. Tutaj każda droga do zapisu przechodzi przez tę samą
      funkcję.

   2. ZAPIS JEST „OBOK”, nie „przed”. Nie czekamy na niego (brak `await`)
      i nigdy nie pozwalamy mu wywrócić właściwej operacji: gdyby dziennik
      odmówił zapisu, obsługa i tak ma zaakceptować rezerwację. Stąd
      `.catch` z samym ostrzeżeniem w konsoli.

   3. PISZE WYŁĄCZNIE OBSŁUGA. Klient rezerwujący wizytę przechodzi przez
      `createBooking` tak samo jak administrator przy drzwiach — ale wpis do
      dziennika powstaje tylko wtedy, gdy zalogowany jest ktoś z listy
      administratorów. Inaczej każdy zapis z formularza kończyłby się
      odmową z reguł i czerwienią w konsoli u klienta. Prawdziwą blokadą
      są i tak reguły; ten warunek oszczędza niepotrzebnej próby.

   Dziennika NIE DA SIĘ POPRAWIĆ ANI SKASOWAĆ — `firestore.rules` odmawia
   UPDATE i DELETE wszystkim, łącznie z administratorem. Dziennik, który da
   się wyczyścić, nie jest dziennikiem.
   ========================================================================== */

/** Kto teraz klika w panelu — albo `null`, gdy to nie obsługa. */
function ktoWPanelu() {
  const u = auth.currentUser;
  if (!u || !isAdminEmail(u.email)) return null;
  return { email: String(u.email || ''), uid: String(u.uid || '') };
}

/**
 * Dokłada jeden wpis do dziennika. Nie zwraca obietnicy do czekania —
 * wywołanie ma być tanie i niewidoczne dla reszty kodu.
 *
 * @param {object} o
 * @param {string} o.action    'booking.update', 'event.delete', …
 * @param {string} [o.subject] czego dotyczy, po ludzku („Rezerwacja LMGPYJ84")
 * @param {string} [o.targetId] id dokumentu, gdyby trzeba było go odszukać
 * @param {string[]} [o.changes] lista „pole: wartość"
 */
export function zapiszWDzienniku({ action, subject = '', targetId = '', changes = [] } = {}) {
  const kto = ktoWPanelu();
  if (!kto || !action) return;

  F.addDoc(col(PATHS.auditLog), {
    at:       F.serverTimestamp(),
    who:      kto.email,
    uid:      kto.uid,
    action:   String(action).slice(0, 40),
    subject:  String(subject || '').slice(0, 120),
    targetId: String(targetId || '').slice(0, 60),
    /* Twarde granice są też w regułach — tutaj przycinamy, żeby zapis
       w ogóle doszedł do skutku, zamiast odbić się od reguły. */
    changes:  (Array.isArray(changes) ? changes : [])
                .filter(Boolean)
                .map(s => String(s).slice(0, 80))
                .slice(0, 10)
  }).catch(err => console.warn('Dziennik zmian: wpis nie przeszedł.', err));
}

/* ==========================================================================
   ZAPAMIĘTANE GODZINY OTWARCIA (settings/openingHours)
   --------------------------------------------------------------------------
   Kopia ostatnio pobranego tygodnia z wizytówki Google. Sama strona jej nie
   potrzebuje — służy wyłącznie do ODPOWIEDZI NA PYTANIE „czy coś się zmieniło”.
   Bez niej panel nie miałby z czym porównać świeżo pobranych godzin i albo
   milczałby o zmianach, albo zgłaszał je przy każdym otwarciu.

   `autoExcluded` to lista dat, które panel sam dopisał do wykluczeń. Dzień
   raz dopisany nigdy nie wraca: gdyby obsługa świadomie cofnęła wykluczenie,
   automat nie ma go zakładać od nowa przy następnym otwarciu panelu.
   ========================================================================== */
export const openingHoursRef = () => ref(PATHS.settings, 'openingHours');

export async function readSyncedHours() {
  const snap = await F.getDoc(openingHoursRef());
  return snap.exists() ? snap.data() : null;
}

export const saveSyncedHours = (days, autoExcluded = []) =>
  F.setDoc(openingHoursRef(), {
    days:         Array.isArray(days) ? days : [],
    autoExcluded: [...new Set(autoExcluded)].filter(Boolean).slice(-200),
    syncedAt:     F.serverTimestamp()
  }, { merge: true });

/** Nasłuch na dziennik od podanej chwili — wyłącznie dla panelu. */
export function watchAuditLog(odKiedy, cb, onError) {
  const q = F.query(col(PATHS.auditLog),
    F.where('at', '>=', odKiedy),
    F.orderBy('at', 'desc'),
    F.limit(500));
  return F.onSnapshot(q,
    s => cb(s.docs.map(d => {
      const w = d.data();
      /* `serverTimestamp()` przez moment po zapisie jest `null` — dokument
         już jest, ale serwer nie nadał mu jeszcze czasu. Podstawiamy „teraz",
         żeby świeży wpis nie wypadł z osi czasu na te pół sekundy. */
      return { id: d.id, ...w, at: w.at && w.at.toDate ? w.at.toDate() : new Date() };
    })),
    err => { console.error('watchAuditLog', err); if (onError) onError(err); });
}

/**
 * To, co w tym samym czasie zrobili KLIENCI — odczytane z dat utworzenia
 * rezerwacji i zapisów, bez żadnego nowego pola w bazie.
 *
 * Dziennik zapisuje tylko ruchy obsługi, bo tylko obsługa ma prawo do niego
 * pisać. Gdyby oś czasu pokazywała wyłącznie je, wyglądałoby to tak, jakby
 * w bawialni nic się nie działo między kliknięciami w panelu — a przecież
 * najczęstsze zdarzenie na stronie to rezerwacja od klienta. Te wpisy są
 * wyliczane przy każdym otwarciu zakładki i niczego nie zapisują.
 *
 * Zapytanie chodzi po jednym polu (`createdAt`), więc wystarcza indeks, który
 * Firestore zakłada sam — nie trzeba niczego dokładać w konsoli.
 */
export async function listClientEvents(odKiedy) {
  const pobierz = async (sciezka, action, opis) => {
    try {
      const snap = await F.getDocs(F.query(col(sciezka),
        F.where('createdAt', '>=', odKiedy),
        F.orderBy('createdAt', 'desc'),
        F.limit(300)));
      return snap.docs
        /* Wejścia przy drzwiach zakłada obsługa i ma już swój wpis
           w dzienniku — tutaj byłyby drugi raz. */
        .filter(d => d.data().source !== 'walkin')
        .map(d => {
          const w = d.data();
          return {
            id: `${action}:${d.id}`,
            at: w.createdAt && w.createdAt.toDate ? w.createdAt.toDate() : null,
            who: 'klient',
            action,
            subject: opis(w, d.id),
            targetId: d.id,
            changes: []
          };
        })
        .filter(w => w.at);
    } catch (err) {
      console.warn(`Dziennik: nie udało się pobrać (${sciezka}).`, err);
      return [];
    }
  };

  const [rez, zap] = await Promise.all([
    pobierz(PATHS.bookings, 'booking.client',
      (w, id) => `Rezerwacja ${orderRef(id)}${w.date ? ` na ${w.date}` : ''}`),
    pobierz(PATHS.registrations, 'registration.client',
      (w, id) => `Zapis ${orderRef(id)}${w.eventTitle ? ` — ${w.eventTitle}` : ''}`)
  ]);
  return [...rez, ...zap];
}

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

/** Zajęcia w dzienniku opisujemy nazwą i datą — samo id nic nie mówi. */
const opisZajec = e => e
  ? `${String(e.title || 'zajęcia')}${e.date ? `, ${e.date}` : ''}${e.start ? ` ${e.start}` : ''}`
  : 'zajęcia';

export async function saveEvent(id, data) {
  const payload = { ...data, updatedAt: F.serverTimestamp() };
  if (id) {
    await F.updateDoc(ref(PATHS.events, id), payload);
    zapiszWDzienniku({ action: 'event.update', subject: opisZajec(data), targetId: id,
                       changes: opisZmian(data) });
    return id;
  }
  payload.createdAt = F.serverTimestamp();
  const r = await F.addDoc(col(PATHS.events), payload);
  zapiszWDzienniku({ action: 'event.create', subject: opisZajec(data), targetId: r.id });
  return r.id;
}

/** Usuwa zajęcia RAZEM ze zdjęciami — inaczej zostałyby w bazie na zawsze. */
export async function deleteEvent(id) {
  /* Nazwę czytamy PRZED usunięciem — po nim zostałoby w dzienniku samo id,
     a po usuniętych zajęciach nie ma już czego nim odszukać. Usuwanie zdarza
     się rzadko, więc ten jeden odczyt nikogo nie kosztuje. */
  const co = await getEvent(id).catch(() => null);
  await deleteEventImages(id).catch(e => console.warn('deleteEventImages:', e.message));
  const wynik = await F.deleteDoc(ref(PATHS.events, id));
  zapiszWDzienniku({ action: 'event.delete', subject: opisZajec(co), targetId: id });
  return wynik;
}

/** Kopiuje zajęcia na inną datę (licznik zapisanych startuje od zera). */
export async function duplicateEvent(id, newDate) {
  const src = await getEvent(id);
  if (!src) throw new Error('Nie znaleziono zajęć do skopiowania.');
  const { id: _drop, createdAt, updatedAt, ...rest } = src;
  const kopia = await saveEvent(null, { ...rest, date: newDate || src.date, booked: 0 });
  /* kopia bez zdjęć wyglądałaby jak pomyłka — przenosimy całą galerię */
  await copyEventImages(id, kopia).catch(e => console.warn('copyEventImages:', e.message));
  return kopia;
}

/** Kopiuje zajęcia na kolejne tygodnie: [{date}] */
export async function repeatOnDates(id, dates) {
  const src = await getEvent(id);
  if (!src) throw new Error('Nie znaleziono zajęć.');
  const made = [];
  for (const date of dates) {
    /* `booked: 0` — kopia zaczyna z pustą listą miejsc, a nie z zajętymi
       przez oryginał. Znaczniki czasu odcinamy, żeby kopia dostała własne. */
    const { id: _drop, createdAt, updatedAt, ...rest } = src;
    const kopia = await saveEvent(null, { ...rest, date, booked: 0 });
    await copyEventImages(id, kopia).catch(e => console.warn('copyEventImages:', e.message));
    made.push(kopia);
  }
  return made;
}

/** Powielenie co tydzień — cienka nakładka na `repeatOnDates`. */
export async function repeatWeekly(id, weeks) {
  const src = await getEvent(id);
  if (!src) throw new Error('Nie znaleziono zajęć.');
  const base = new Date(src.date + 'T00:00:00');
  const dates = [];
  for (let i = 1; i <= weeks; i++) {
    const d = new Date(base); d.setDate(d.getDate() + 7 * i);
    dates.push(isoDate(d));
  }
  return repeatOnDates(id, dates);
}

/* ==========================================================================
   ZDJĘCIA ZAJĘĆ
   --------------------------------------------------------------------------
   Jedno zdjęcie = jeden dokument w `eventImages`. Kolejność trzyma pole
   `order`, a sortujemy po stronie przeglądarki — dzięki temu zapytanie ma
   tylko jeden warunek (`eventId`) i nie wymaga zakładania indeksu złożonego
   w konsoli Firebase.
   ========================================================================== */

/** Wszystkie zdjęcia zajęć, w zapisanej kolejności. */
export async function listEventImages(eventId) {
  if (!eventId) return [];
  const q = F.query(col(PATHS.eventImages), F.where('eventId', '==', eventId));
  const snap = await F.getDocs(q);
  return snap.docs
    .map(d => ({ id: d.id, ...d.data() }))
    .sort((a, b) => (Number(a.order) || 0) - (Number(b.order) || 0));
}

/** Ile zdjęć mają te zajęcia — do pytania „usunąć razem ze zdjęciami?". */
export async function countEventImages(eventId) {
  return (await listEventImages(eventId)).length;
}

/**
 * Zapisuje w bazie to, co administrator poukładał na ekranie.
 * @param {string} eventId
 * @param {{create:Array, remove:string[], reorder:Array}} plan  z galleryPlan()
 * @param {(done:number, all:number)=>void} [onProgress]
 */
export async function applyGallery(eventId, plan, onProgress) {
  const { create = [], remove = [], reorder = [] } = plan || {};
  const all = create.length + remove.length + reorder.length;
  let done = 0;
  const step = () => { done++; if (onProgress) onProgress(done, all); };

  /* Najpierw kasujemy — zwalnia miejsce i porządkuje numerację. */
  for (const id of remove) { await F.deleteDoc(ref(PATHS.eventImages, id)); step(); }

  for (const item of create) {
    await F.addDoc(col(PATHS.eventImages), {
      eventId,
      kind:   item.kind || 'data',
      src:    item.src,
      name:   item.name || '',
      width:  Number(item.width)  || 0,
      height: Number(item.height) || 0,
      bytes:  Number(item.bytes)  || 0,
      order:  Number(item.order)  || 0,
      createdAt: F.serverTimestamp()
    });
    step();
  }

  for (const { id, order } of reorder) {
    await F.updateDoc(ref(PATHS.eventImages, id), { order });
    step();
  }
  return { created: create.length, removed: remove.length, reordered: reorder.length };
}

/** Kasuje wszystkie zdjęcia zajęć (wywoływane przy usuwaniu zajęć). */
export async function deleteEventImages(eventId) {
  const imgs = await listEventImages(eventId);
  for (const img of imgs) await F.deleteDoc(ref(PATHS.eventImages, img.id));
  return imgs.length;
}

/** Przepisuje galerię na inne zajęcia — przy duplikacie i powtórkach co tydzień. */
export async function copyEventImages(fromId, toId) {
  const imgs = await listEventImages(fromId);
  for (const img of imgs) {
    const { id: _drop, createdAt, eventId: _ev, ...rest } = img;
    await F.addDoc(col(PATHS.eventImages), { ...rest, eventId: toId, createdAt: F.serverTimestamp() });
  }
  return imgs.length;
}

/** Czyści stare adresy URL po ich przeniesieniu do `eventImages`. */
export function clearLegacyImages(eventId) {
  return F.updateDoc(ref(PATHS.events, eventId), { images: [] });
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

export async function updateRegistration(id, patch) {
  await F.updateDoc(ref(PATHS.registrations, id), { ...patch, updatedAt: F.serverTimestamp() });
  zapiszWDzienniku({ action: 'registration.update', subject: `Zapis ${orderRef(id)}`,
                     targetId: id, changes: opisZmian(patch) });
}

export async function deleteRegistration(id) {
  const wynik = await F.deleteDoc(ref(PATHS.registrations, id));
  zapiszWDzienniku({ action: 'registration.delete', subject: `Zapis ${orderRef(id)}`, targetId: id });
  return wynik;
}

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

/**
 * Zamienia rezerwację bawialni na „wizytę" w kształcie, który rozumie ranking.
 * Dzięki temu ranking liczy wszystkie odwiedziny tak samo — bez znaczenia,
 * czy dziecko przyszło na zajęcia, czy po prostu do bawialni.
 */
export function visitFromBooking(b, dayEnd) {
  const names = (b.children || []).map(c => String(c.name || '').trim()).filter(Boolean);
  const endMin = bookingEndMin(b, dayEnd);
  const pad = n => String(n).padStart(2, '0');
  return {
    phone:           b.phone || '',
    phoneKey:        b.phoneKey || normPhone(b.phone),
    email:           b.email || '',
    parentFirstName: b.parentFirstName || '',
    parentLastName:  b.parentLastName || '',
    childFirstName:  names.join(', '),      // ranking trzyma jedno pole na dzieci
    childLastName:   '',
    qty:             Number(b.qty) || 1,
    eventDate:       b.date || '',
    eventStart:      b.start || '',
    eventEnd:        `${pad(Math.floor(endMin / 60))}:${pad(endMin % 60)}`,
    stayUntil:       b.stayUntil || ''
  };
}

/** Dopisuje / cofa wizytę w bawialni w rankingu. delta = +1 albo -1. */
export const applyBookingToRanking = (b, delta) =>
  applyVisitToRanking(visitFromBooking(b), delta);

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

export { computePresence, presenceTimeline, countAtMin, manualActive, presenceForSite }
  from './mc-common.js';

/** Zapisuje wyliczony stan do bazy (wywoływane z panelu admina).
    `capacity` podaje się tylko wtedy, gdy ma się zmienić — bez tego zostaje
    to, co administrator ustawił w zakładce „Licznik w bawialni". Wcześniej
    każde odświeżenie licznika cofało maksimum do wartości domyślnej. */
export async function pushPresence({ count, untilMin, manual = false, capacity, timeline }) {
  const doc = {
    count: Number(count) || 0,
    until: untilMin ? `${String(Math.floor(untilMin/60)).padStart(2,'0')}:${String(untilMin%60).padStart(2,'0')}` : '',
    date: todayISO(),
    manual: !!manual,
    updatedAt: F.serverTimestamp()
  };
  if (capacity !== undefined && capacity !== null) doc.capacity = Number(capacity) || SETTINGS.capacity;
  /* Rozkład godzinowy dnia — z niego strona główna przelicza licznik sama,
     zamiast czekać na kolejne kliknięcie w panelu. Zapisujemy same liczby:
     od której minuty, do której i ile dzieci. */
  if (Array.isArray(timeline)) {
    doc.timeline = timeline.map(t => ({
      from: Math.max(0, Math.round(Number(t.from) || 0)),
      to:   Math.max(0, Math.round(Number(t.to)   || 0)),
      qty:  Math.max(1, Math.round(Number(t.qty)  || 1))
    })).filter(t => t.to > t.from);
  }
  await F.setDoc(presenceRef(), doc, { merge: true });
}

/** Samo maksimum (mianownik licznika) — bez ruszania liczby dzieci i trybu. */
export async function setPresenceCapacity(capacity) {
  const ile = Math.max(1, Number(capacity) || SETTINGS.capacity);
  await F.setDoc(presenceRef(), { capacity: ile, updatedAt: F.serverTimestamp() }, { merge: true });
  zapiszWDzienniku({ action: 'presence.capacity', subject: 'Licznik w bawialni',
                     changes: opisZmian({ capacity: ile }) });
}

/** Ręczne nadpisanie licznika z panelu (zakładka 3). */
export async function setPresenceManual(count, untilHHMM, capacity) {
  await F.setDoc(presenceRef(), {
    count: Number(count) || 0,
    until: untilHHMM || '',
    date: todayISO(),
    capacity: Number(capacity) || SETTINGS.capacity,
    manual: true,
    /* Ręczne nadpisanie obowiązuje TYLKO w dniu zapisu — decyduje o tym pole
       `date` (patrz `manualActive`). Rozkład czyścimy, żeby strona nie liczyła
       sobie po swojemu wbrew liczbie wpisanej ręcznie. */
    timeline: [],
    updatedAt: F.serverTimestamp()
  }, { merge: true });
  zapiszWDzienniku({ action: 'presence.manual', subject: `Licznik na ${todayISO()}`,
                     changes: opisZmian({ count: Number(count) || 0, until: untilHHMM || '' }) });
}

export async function clearPresenceManual() {
  await F.setDoc(presenceRef(), { manual: false }, { merge: true });
  zapiszWDzienniku({ action: 'presence.auto', subject: `Licznik na ${todayISO()}` });
}

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
  zapiszWDzienniku({ action: 'visits.add', subject: 'Licznik odwiedzin',
                     changes: [`zmiana o ${by > 0 ? '+' : ''}${by}`] });
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
  zapiszWDzienniku({ action: 'visits.base', subject: 'Licznik odwiedzin',
                     changes: opisZmian({ visitsBase: Number(base) || 0,
                                          ...(count === undefined ? {} : { visitsCount: Number(count) || 0 }) }) });
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
    /* Rozliczenie i ranking prowadzi administrator — klient nie może tego
       ustawić przy zakładaniu rezerwacji (pilnują tego też reguły). */
    paid:            false,
    countedInRanking: false,
    stayUntil:       data.stayUntil || '',
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
/**
 * Ile spraw czeka na obsługę — NIEZALEŻNIE od tego, który tydzień jest akurat
 * otwarty na ekranie. Stąd osobny nasłuch: listy w panelu ciągną tylko jeden
 * tydzień, więc plakietka licząca z nich gubiła wszystko, co ktoś zarezerwował
 * dalej niż siedem dni naprzód.
 *
 *   bookings       status 'pending'          → rezerwacja czeka na decyzję
 *   registrations  status inny niż 'confirmed' → zapis jeszcze nierozliczony
 *
 * Liczymy od dzisiaj w przód: plakietka ma mówić „ktoś się wybiera", a nie
 * ciągnąć za sobą całą historię. Dzień odczytujemy przy każdym odczycie, więc
 * panel otwarty przez północ sam przeskakuje na nową datę.
 *
 * @param {(c: {bookings:number, registrations:number, total:number}) => void} cb
 * @returns {() => void} funkcja odpinająca oba nasłuchy
 */
/**
 * Czy wpis czeka na obsługę — jedna definicja dla plakietek przy zakładkach
 * i dla czerwonych kropek przy pojedynczych wierszach. Gdyby każde miejsce
 * liczyło po swojemu, plakietka pokazywałaby co innego niż lista pod nią.
 *
 *   rezerwacja  → nikt jej jeszcze nie zaakceptował ani nie odrzucił
 *   zapis       → jeszcze nierozliczony (nie ma „przyszedł + opłacone")
 */
export const bookingNeedsAttention = b => ((b && b.status) || 'pending') === 'pending';
export const registrationNeedsAttention = r => ((r && r.status) || 'new') !== 'confirmed';

export function watchTodo(cb, onError) {
  const stan = { bookings: 0, registrations: 0 };
  const podaj = () => cb({ ...stan, total: stan.bookings + stan.registrations });
  const fail = gdzie => err => {
    console.error('watchTodo/' + gdzie, err);
    if (onError) onError(err);
  };

  /* Zapytania biorą szeroko (od dnia podpięcia), a właściwy dzień i status
     odsiewamy już u siebie — inaczej trzeba by złożonego indeksu w Firestore
     na każdą parę pól. */
  const od = todayISO();

  const offB = F.onSnapshot(
    F.query(col(PATHS.bookings), F.where('date', '>=', od)),
    s => {
      const dzis = todayISO();
      stan.bookings = s.docs.map(d => d.data())
        .filter(b => (b.date || '') >= dzis && bookingNeedsAttention(b)).length;
      podaj();
    }, fail('bookings'));

  const offR = F.onSnapshot(
    F.query(col(PATHS.registrations), F.where('eventDate', '>=', od)),
    s => {
      const dzis = todayISO();
      stan.registrations = s.docs.map(d => d.data())
        .filter(r => (r.eventDate || '') >= dzis && registrationNeedsAttention(r)).length;
      podaj();
    }, fail('registrations'));

  podaj();
  return () => { offB(); offR(); };
}

/* ==========================================================================
   WYKLUCZENIA REZERWACJI
   --------------------------------------------------------------------------
   Dzień, w którym nie przyjmujemy rezerwacji bawialni — remont, impreza na
   wyłączność, wolne. Admin zaznacza go w panelu, klient nie może się na niego
   zapisać.

   IDENTYFIKATOREM DOKUMENTU JEST DATA ('2026-09-20'). To nie jest kosmetyka:
     • jeden dzień może być wykluczony tylko raz — duplikaty są niemożliwe
       z definicji, bez żadnego sprawdzania w kodzie,
     • reguła w firestore.rules potrafi zajrzeć po samej dacie
       (`exists(/exclusions/$(data.date))`) i odrzucić rezerwację po stronie
       serwera. Blokada w formularzu jest wygodą; ta reguła jest zabezpieczeniem.

   Odczyt jest publiczny — formularz rezerwacji musi wiedzieć, że dzień
   odpada, zanim ktoś wypełni pół strony. Zapis: tylko administrator.

   DWA TEKSTY, DWIE PUBLICZNOŚCI. `reason` to notatka wewnętrzna i nigdy nie
   wychodzi poza panel. Dopiero `showOnSite` wypycha dzień na stronę główną,
   a `publicNote` jest tym, co przeczyta tam klient. Rozdzielamy je, bo powód
   bywa dosłowny („urodzinki Zosi, mama zapłaciła gotówką”), a strona główna
   ma powiedzieć tylko tyle, ile trzeba.
   ========================================================================== */

/** Kształt dokumentu, jeden na dzień. `reason` widzi wyłącznie obsługa. */
const exclusionDoc = (dateISO, reason, { showOnSite = false, publicNote = '' } = {}) => ({
  date:       dateISO,
  reason:     String(reason || '').trim().slice(0, 200),
  showOnSite: !!showOnSite,
  publicNote: String(publicNote || '').trim().slice(0, 120),
  createdAt:  F.serverTimestamp()
});

/* Sam zapis, bez dziennika — używają go obie funkcje niżej. Dzięki temu
   seria kilkudziesięciu dni zostawia w dzienniku JEDEN wpis („seria 12 dni”),
   a nie kilkanaście identycznych linijek, przez które nie widać reszty. */
const zapiszWykluczenie = (dateISO, reason, opcje) =>
  F.setDoc(ref(PATHS.exclusions, dateISO), exclusionDoc(dateISO, reason, opcje));

/** Wyklucza jeden dzień. Powtórzone wywołanie tylko nadpisuje powód. */
export async function addExclusion(dateISO, reason = '', opcje = {}) {
  await zapiszWykluczenie(dateISO, reason, opcje);
  zapiszWDzienniku({ action: 'exclusion.add', subject: `Dzień ${dateISO}`, targetId: dateISO,
                     changes: opisZmian({ reason, ...opcje }) });
}

/** Wyklucza całą serię dni. Zapisujemy pojedynczo — serie są krótkie
    (kilkanaście dni), a jeden nieudany zapis nie ma psuć reszty. */
export async function addExclusions(dates = [], reason = '', opcje = {}) {
  const ok = [];
  for (const d of [...new Set(dates)].filter(Boolean).slice(0, 120)) {
    await zapiszWykluczenie(d, reason, opcje);
    ok.push(d);
  }
  if (ok.length) {
    zapiszWDzienniku({
      action:  'exclusion.add',
      subject: `Seria ${ok.length} dni, ${ok[0]} – ${ok[ok.length - 1]}`,
      targetId: ok[0],
      changes: opisZmian({ reason, ...opcje })
    });
  }
  return ok;
}

/**
 * Wykluczenie założone przez automat, nie przez człowieka.
 *
 * Osobna funkcja, a nie `addExclusion` z dodatkowym parametrem, bo w dzienniku
 * ma zostać ślad, że to nie była decyzja obsługi tylko odczyt z wizytówki —
 * inaczej nikt po tygodniu nie odróżni jednego od drugiego. Widoczność na
 * stronie głównej jest tu włączona z założenia: dzień zamknięty wbrew
 * zwykłemu grafikowi to dokładnie ten przypadek, o którym klient ma wiedzieć
 * ZANIM przyjedzie.
 */
export async function addAutoExclusion(dateISO, { reason = '', publicNote = '' } = {}) {
  await zapiszWykluczenie(dateISO, reason, { showOnSite: true, publicNote });
  zapiszWDzienniku({
    action: 'exclusion.auto', subject: `Dzień ${dateISO}`, targetId: dateISO,
    changes: opisZmian({ reason, showOnSite: true, publicNote })
  });
}

export async function removeExclusion(dateISO) {
  const wynik = await F.deleteDoc(ref(PATHS.exclusions, dateISO));
  zapiszWDzienniku({ action: 'exclusion.remove', subject: `Dzień ${dateISO}`, targetId: dateISO });
  return wynik;
}

/** Nasłuch na wszystkie wykluczenia od podanego dnia w przód. */
export function watchExclusions(fromISO, cb, onError) {
  const q = F.query(col(PATHS.exclusions), F.where('date', '>=', fromISO || todayISO()));
  return F.onSnapshot(q,
    s => cb(s.docs.map(d => ({ id: d.id, ...d.data() }))
             .sort((a, b) => (a.date || '').localeCompare(b.date || ''))),
    err => { console.error('watchExclusions', err); if (onError) onError(err); });
}

/**
 * Nasłuch dla STRONY GŁÓWNEJ: tylko te dni, które obsługa świadomie
 * zaznaczyła jako „widoczne dla klienta”, i tylko od dzisiaj w przód.
 *
 * Filtrujemy w przeglądarce, a nie zapytaniem `where('showOnSite','==',true)`,
 * z dwóch powodów: dokumenty sprzed tej zmiany w ogóle nie mają tego pola
 * (zapytanie by je pominęło, ale i tak mają być niewidoczne), a drugi warunek
 * zakresowy na innym polu wymagałby osobnego indeksu złożonego. Lista liczy
 * kilkanaście pozycji — nie ma czego oszczędzać.
 */
export function watchPublicExclusions(cb, onError) {
  return watchExclusions(todayISO(),
    list => cb(list.filter(e => e.showOnSite === true)),
    onError);
}

/** Jednorazowy odczyt — formularz rezerwacji nie potrzebuje nasłuchu. */
export async function listExclusions(fromISO) {
  const q = F.query(col(PATHS.exclusions), F.where('date', '>=', fromISO || todayISO()));
  const snap = await F.getDocs(q);
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

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
export async function setBookingStatus(id, status, adminNote = '') {
  await F.updateDoc(ref(PATHS.bookings, id), {
    status,
    adminNote: String(adminNote || ''),
    decidedAt: F.serverTimestamp(),
    updatedAt: F.serverTimestamp()
  });
  zapiszWDzienniku({ action: 'booking.status', subject: `Rezerwacja ${orderRef(id)}`,
                     targetId: id, changes: opisZmian({ status, adminNote }) });
}

export async function deleteBooking(id) {
  const wynik = await F.deleteDoc(ref(PATHS.bookings, id));
  zapiszWDzienniku({ action: 'booking.delete', subject: `Rezerwacja ${orderRef(id)}`, targetId: id });
  return wynik;
}

/**
 * Dziecko wprowadzone ręcznie przy drzwiach — ktoś przyszedł z ulicy, bez zapisu.
 * Zapisujemy to jako rezerwację od razu zaakceptowaną, z oznaczeniem `source`.
 * Dzięki temu bez żadnego dodatkowego kodu wchodzi do licznika na stronie,
 * do listy „Czas zabawy" i — po odhaczeniu opłaty — do rankingu.
 */
export async function createWalkin({ children = [], start, stayUntil, duration = 'open',
                                    paymentMethod = '', phone = '', paid = false, note = '' }) {
  const date = todayISO();
  /* Dzieci przychodzą jako pary imię + data urodzenia. Data urodzenia jest
     opcjonalna, ale to ona decyduje o progu wiekowym w cenniku — bez niej
     dziecko liczy się jako pełnopłatne. */
  const kids = (Array.isArray(children) ? children : [])
    .map(c => ({
      name: String(c.name || '').trim(),
      dob:  c.dob || '',
      /* Próg wiekowy podany wprost — tak pyta o niego karta „Nowe wejście"
         w panelu (dwa przyciski zamiast daty). Bez niego decyduje data. */
      ...(isAgeTier(c.tier) ? { tier: c.tier } : {})
    }))
    .filter(c => c.name || c.dob)
    .slice(0, 10);
  if (!kids.length) throw new Error('Podaj imię przynajmniej jednego dziecka.');

  /* Ten sam cennik, co w formularzu klienta: taryfa dnia, progi wiekowe
     i zniżka rodzeństwa. Wejście przy drzwiach nie może kosztować inaczej
     niż to samo wejście zarezerwowane przez stronę. */
  const q = quote({ date, duration, children: kids });

  const doc = {
    date,
    start:           start || '',
    stayUntil:       stayUntil || '',
    duration,
    durationLabel:   (DURATIONS.find(d => d.id === duration) || {}).label || 'wejście z ulicy',
    children:        q.lines.map(l => ({ name: l.name, dob: l.dob, tier: l.tier, price: l.price })),
    qty:             kids.length,
    tariff:          q.tariff,
    base:            q.base,
    total:           q.total,
    siblingApplies:  q.siblingApplies,
    paymentMethod:   String(paymentMethod || '').trim(),
    parentFirstName: '', parentLastName: '',
    email:           '', phone: String(phone || '').trim(), phoneKey: normPhone(phone),
    note:            String(note || '').trim(),
    source:          'walkin',
    status:          BOOKING_STATUS.accepted,   // przy drzwiach nie ma co akceptować
    adminNote:       '',
    paid:            !!paid,
    countedInRanking: false,
    uid:             null,
    createdAt:       F.serverTimestamp()
  };

  const r = await F.addDoc(col(PATHS.bookings), doc);
  zapiszWDzienniku({
    action:  'walkin.create',
    subject: `Wejście z ulicy ${orderRef(r.id)}`,
    targetId: r.id,
    changes: opisZmian({ qty: doc.qty, duration: doc.duration, start: doc.start,
                         total: doc.total, paid: doc.paid })
  });
  return { id: r.id, ...doc };
}

/** Dokłada minuty do pobytu (przycisk „+15 min"). */
export async function extendBooking(b, minutes) {
  const endMin = bookingEndMin(b) + (Number(minutes) || 0);
  const pad = n => String(n).padStart(2, '0');
  const hhmm = `${pad(Math.floor(Math.max(0, endMin) / 60) % 24)}:${pad(Math.max(0, endMin) % 60)}`;
  await updateBooking(b.id, { stayUntil: hhmm });
  return hhmm;
}

/** Dowolna zmiana w rezerwacji — wyłącznie administrator (opłata, godzina wyjścia). */
export async function updateBooking(id, patch) {
  await F.updateDoc(ref(PATHS.bookings, id), { ...patch, updatedAt: F.serverTimestamp() });
  zapiszWDzienniku({ action: 'booking.update', subject: `Rezerwacja ${orderRef(id)}`,
                     targetId: id, changes: opisZmian(patch) });
}

/** Odhacza, że rezerwacja została już policzona w liczniku odwiedzin. */
export async function markBookingCounted(id, counted) {
  await F.updateDoc(ref(PATHS.bookings, id),
    { countedInVisits: !!counted, updatedAt: F.serverTimestamp() });
  zapiszWDzienniku({ action: 'booking.update', subject: `Rezerwacja ${orderRef(id)}`,
                     targetId: id, changes: opisZmian({ countedInVisits: !!counted }) });
}

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
