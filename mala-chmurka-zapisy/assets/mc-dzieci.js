/* ==========================================================================
   Mała Chmurka — pamięć dzieci.

   Po co: jeżeli ktoś raz zapisał Zosię na zajęcia, przy kolejnym zapisie
   nie chcemy go pytać o to samo. Formularz podpowiada dzieci, które już zna,
   a rodzic tylko zaznacza, które przychodzą.

   Skąd bierzemy dane:
     • zalogowani — z własnej historii (zapisy na zajęcia + rezerwacje
       bawialni); nic nowego nie trzymamy w bazie, więc nie ma nowych reguł
       ani nowych miejsc, w których mogłyby wyciec dane osobowe;
     • wszyscy — z pamięci przeglądarki (localStorage), żeby podpowiedzi
       działały także bez konta, na tym jednym urządzeniu.

   Wszystkie odczyty są w try/catch: gdy reguły Firestore nie są jeszcze
   opublikowane albo sieć padnie, formularz ma działać dalej, po prostu
   bez podpowiedzi.
   ========================================================================== */

const LS_KEY = 'mc_dzieci';

/* ------------------------------------------------------------- helpery --- */

const clean = s => String(s ?? '').trim().replace(/\s+/g, ' ');

/** Klucz tożsamości dziecka: imię + nazwisko + data urodzenia. */
export function childKey(c) {
  return [clean(c && c.firstName).toLowerCase(),
          clean(c && c.lastName).toLowerCase(),
          clean(c && c.dob)].join('|');
}

/** Czy wpis nadaje się do zapamiętania (samo imię to za mało bez daty). */
export const isUsableChild = c => !!(c && clean(c.firstName));

/** Jednolity kształt: { firstName, lastName, dob }. */
export function normChild(c = {}) {
  return {
    firstName: clean(c.firstName ?? c.name),
    lastName:  clean(c.lastName),
    dob:       clean(c.dob)
  };
}

/** Pełne imię i nazwisko do pokazania na ekranie. */
export const childLabel = c => [clean(c.firstName), clean(c.lastName)].filter(Boolean).join(' ');

/**
 * Scala kilka list dzieci w jedną, bez powtórek.
 * Wpis z datą urodzenia wygrywa z wpisem bez daty (uzupełniamy braki).
 */
export function mergeChildren(...lists) {
  const out = new Map();
  lists.flat().filter(Boolean).map(normChild).filter(isUsableChild).forEach(c => {
    /* dopasowanie po imieniu i nazwisku, żeby ten sam dzieciak z dwóch
       źródeł — raz z datą, raz bez — nie zrobił się dwoma wpisami */
    const soft = `${c.firstName.toLowerCase()}|${c.lastName.toLowerCase()}`;
    const prev = out.get(soft);
    if (!prev) { out.set(soft, c); return; }
    out.set(soft, {
      firstName: prev.firstName || c.firstName,
      lastName:  prev.lastName  || c.lastName,
      dob:       prev.dob       || c.dob
    });
  });
  return [...out.values()];
}

/* ------------------------------------------------- pamięć przeglądarki --- */

/** Dzieci zapamiętane na tym urządzeniu (działa też bez konta). */
export function localChildren() {
  try {
    const raw = JSON.parse(localStorage.getItem(LS_KEY) || '[]');
    return Array.isArray(raw) ? mergeChildren(raw) : [];
  } catch { return []; }
}

/** Dopisuje dzieci do pamięci przeglądarki (bez powtórek). */
export function rememberChildren(children) {
  try {
    const merged = mergeChildren(localChildren(), children);
    localStorage.setItem(LS_KEY, JSON.stringify(merged.slice(0, 20)));
    return merged;
  } catch { return []; }
}

export function forgetChildren() {
  try { localStorage.removeItem(LS_KEY); } catch { /* nic nie szkodzi */ }
}

/* ----------------------------------------------------- historia z bazy --- */

/** Wyciąga dzieci z jednego zapisu na zajęcia (nowy i stary kształt). */
function childrenOfRegistration(r) {
  if (Array.isArray(r.children) && r.children.length) return r.children.map(normChild);
  return [normChild({ firstName: r.childFirstName, lastName: r.childLastName, dob: r.childDob })];
}

/** Wyciąga dzieci z jednej rezerwacji bawialni. */
function childrenOfBooking(b) {
  if (!Array.isArray(b.children)) return [];
  return b.children.map(c => {
    const parts = clean(c.name).split(' ');
    return normChild({ firstName: parts[0], lastName: parts.slice(1).join(' '), dob: c.dob });
  });
}

/**
 * Dzieci, które znamy dla zalogowanego użytkownika.
 * Łączy historię z bazy z pamięcią przeglądarki. Nigdy nie rzuca wyjątkiem —
 * przy braku uprawnień albo bez sieci zwraca po prostu to, co ma lokalnie.
 *
 * @param {string|null} uid
 * @param {{ myRegistrations?: Function, myBookings?: Function }} io  — funkcje z mc-data.js
 */
export async function knownChildren(uid, io = {}) {
  const local = localChildren();
  if (!uid) return local;

  const fromDb = [];
  try {
    if (io.myRegistrations) {
      const regs = await io.myRegistrations(uid);
      regs.forEach(r => fromDb.push(...childrenOfRegistration(r)));
    }
  } catch (e) { console.warn('knownChildren (zajęcia):', e.message); }

  try {
    if (io.myBookings) {
      const books = await io.myBookings(uid);
      books.forEach(b => fromDb.push(...childrenOfBooking(b)));
    }
  } catch (e) { console.warn('knownChildren (bawialnia):', e.message); }

  const merged = mergeChildren(fromDb, local);
  /* to, co przyszło z bazy, warto mieć też lokalnie — na wypadek wylogowania */
  if (fromDb.length) rememberChildren(merged);
  return merged;
}
