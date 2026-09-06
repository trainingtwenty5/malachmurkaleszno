/* ==========================================================================
   Mała Chmurka — galeria zdjęć zajęć (panel administratora)

   Co robi ten plik:
     • przyjmuje zdjęcia upuszczone myszką, wybrane z dysku albo wklejone
       ze schowka (Ctrl+V),
     • zmniejsza je w przeglądarce, ZANIM cokolwiek poleci do bazy,
     • pozwala przestawiać kolejność (przeciąganiem albo strzałkami) i kasować
       pojedyncze zdjęcie,
     • zapisuje wszystko dopiero przy „Zapisz" — tak jak resztę formularza,
       więc „Anuluj" naprawdę anuluje.

   DLACZEGO ZDJĘCIA SIEDZĄ W FIRESTORE, A NIE W FIREBASE STORAGE
   --------------------------------------------------------------------------
   Storage wymaga planu Blaze (karta płatnicza), a ta strona stoi na GitHub
   Pages i nie ma żadnego backendu. Firestore w darmowym planie wystarcza,
   pod jednym warunkiem: dokument nie może przekroczyć 1 MiB. Dlatego każde
   zdjęcie jest tu zmniejszane do IMG.maxSide i przeliczane na JPEG, aż zmieści
   się w budżecie (IMG.targetBytes, twardy limit IMG.maxStoredChars).

   Gdyby kiedyś doszedł płatny plan — wystarczy podmienić `readImageFile()`
   tak, żeby wrzucała plik do Storage i zwracała `{ kind: 'url', src: link }`.
   Reszta (kolejność, kasowanie, zapis) zadziała bez zmian.
   ========================================================================== */

import { esc, IMG, imageFileError, fitSize, dataUrlBytes, humanBytes,
         moveItem, galleryPlan, gallerySignature, askConfirm, askText }
  from './mc-common.js';
import { listEventImages, applyGallery, clearLegacyImages } from './mc-data.js';

/* ==========================================================================
   1. ODCZYT I ZMNIEJSZENIE PLIKU
   ========================================================================== */

/** Dekoduje plik do czegoś, co da się narysować na płótnie. */
async function decodeImage(file) {
  if (typeof createImageBitmap === 'function') {
    try { return { img: await createImageBitmap(file), free: b => b.close && b.close() }; }
    catch { /* starsze Safari nie umie createImageBitmap z pliku — próbujemy niżej */ }
  }
  const url = URL.createObjectURL(file);
  const img = await new Promise((resolve, reject) => {
    const el = new Image();
    el.onload  = () => resolve(el);
    el.onerror = () => reject(new Error('Przeglądarka nie potrafi otworzyć tego pliku.'));
    el.src = url;
  }).catch(err => { URL.revokeObjectURL(url); throw err; });
  return { img, free: () => URL.revokeObjectURL(url) };
}

/** Rysuje obraz na płótnie o zadanych wymiarach (białe tło — JPEG nie ma alfy). */
function draw(img, w, h) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, w, h);
  ctx.drawImage(img, 0, 0, w, h);
  return c;
}

const shrink = (canvas, k) =>
  draw(canvas, Math.max(1, Math.round(canvas.width * k)), Math.max(1, Math.round(canvas.height * k)));

/**
 * Plik z dysku → gotowa pozycja galerii.
 * Schodzi z jakością, a gdy to nie wystarcza — także z rozmiarem, aż zdjęcie
 * zmieści się w dokumencie Firestore.
 * @returns {Promise<{kind:string, src:string, name:string, width:number, height:number, bytes:number}>}
 */
export async function readImageFile(file) {
  const { img, free } = await decodeImage(file);
  try {
    const start = fitSize(img.width, img.height, IMG.maxSide);
    let canvas = draw(img, start.w, start.h);
    let best = null;

    for (let round = 0; round < 5; round++) {
      for (const q of [0.82, 0.7, 0.58, 0.45]) {
        const src = canvas.toDataURL('image/jpeg', q);
        const bytes = dataUrlBytes(src);
        if (src.length <= IMG.maxStoredChars && (!best || bytes < best.bytes)) {
          best = { src, bytes, width: canvas.width, height: canvas.height };
        }
        /* trafiliśmy w budżet — nie ma po co psuć jakości dalej */
        if (bytes <= IMG.targetBytes && src.length <= IMG.maxStoredChars) {
          return { kind: 'data', name: file.name || 'zdjęcie.jpg', ...best };
        }
      }
      canvas = shrink(canvas, 0.75);
    }

    if (best) return { kind: 'data', name: file.name || 'zdjęcie.jpg', ...best };
    throw new Error(`Nie udało się zmniejszyć „${file.name}" na tyle, żeby zmieściło się w bazie.`);
  } finally {
    free(img);
  }
}

/* ==========================================================================
   2. WIDŻET
   ========================================================================== */

const ICON = `<svg viewBox="0 0 24 24" aria-hidden="true" width="30" height="30">
  <path fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"
        d="M12 16V4m0 0L8 8m4-4 4 4M4 15v3a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-3"/></svg>`;

let seq = 0;
const tempId = () => `nowe-${++seq}`;

/**
 * Wstawia galerię do podanego elementu.
 *
 * @param {HTMLElement} host      pusty kontener w formularzu
 * @param {object} [opts]
 * @param {Function} [opts.onChange]  wołane po każdej zmianie (do wykrywania
 *                                    niezapisanych zmian w oknie edycji)
 * @returns {{load:Function, reset:Function, items:Function, count:Function,
 *            signature:Function, isDirty:Function, plan:Function, commit:Function}}
 */
export function mountGallery(host, { onChange } = {}) {
  /* `base` to stan z bazy, `items` to stan na ekranie. Różnica między nimi
     jest tym, co pojedzie do Firestore przy zapisie. */
  let base = [];
  let items = [];
  let legacy = [];            // stare adresy URL z pola events.images
  let openSig = '';           // odcisk galerii z chwili otwarcia okna
  let busy = false;

  host.classList.add('gal');
  host.innerHTML = `
    <div class="gal-drop" tabindex="0" role="button"
         aria-label="Dodaj zdjęcia: przeciągnij pliki albo kliknij, żeby wybrać z dysku">
      ${ICON}
      <b>Przeciągnij zdjęcia tutaj</b>
      <span>albo kliknij i wybierz je z dysku · JPG, PNG, WEBP · można też wkleić przez Ctrl+V</span>
      <input type="file" accept="image/*" multiple hidden>
    </div>
    <div class="gal-msg" role="status" aria-live="polite"></div>
    <ul class="gal-grid"></ul>
    <div class="gal-foot">
      <span class="gal-count"></span>
      <button type="button" class="btn btn-soft btn-sm" data-a="url">Wklej adres URL</button>
    </div>`;

  const drop  = host.querySelector('.gal-drop');
  const input = host.querySelector('input[type=file]');
  const grid  = host.querySelector('.gal-grid');
  const msgEl = host.querySelector('.gal-msg');
  const count = host.querySelector('.gal-count');

  const say = (kind, text) => {
    msgEl.innerHTML = text ? `<div class="alert alert-${kind}">${esc(text)}</div>` : '';
  };
  const changed = () => { render(); if (onChange) onChange(); };

  /* ------------------------------------------------------------- rysowanie */
  function render() {
    grid.innerHTML = items.map((it, i) => `
      <li class="gal-item${it.isNew ? ' is-new' : ''}" draggable="true" data-i="${i}">
        <div class="gal-thumb"><img alt="" loading="lazy"></div>
        <div class="gal-tags">
          ${i === 0 ? '<span class="gal-tag gal-tag-cover">Okładka</span>' : ''}
          ${it.isNew ? '<span class="gal-tag gal-tag-new">nowe</span>' : ''}
          ${it.kind === 'url' ? '<span class="gal-tag">adres URL</span>' : ''}
        </div>
        <div class="gal-name" title="${esc(it.name || '')}">${esc(it.name || 'zdjęcie')}</div>
        <div class="gal-size">${it.width ? `${it.width}×${it.height}` : ''}${
          it.bytes ? ` · ${esc(humanBytes(it.bytes))}` : ''}</div>
        <div class="gal-acts">
          <button type="button" data-a="left"  data-i="${i}" title="Przesuń wcześniej"
                  aria-label="Przesuń wcześniej" ${i === 0 ? 'disabled' : ''}>←</button>
          <button type="button" data-a="right" data-i="${i}" title="Przesuń później"
                  aria-label="Przesuń później" ${i === items.length - 1 ? 'disabled' : ''}>→</button>
          <button type="button" data-a="del" data-i="${i}" class="gal-del"
                  title="Usuń zdjęcie" aria-label="Usuń zdjęcie">Usuń</button>
        </div>
      </li>`).join('');

    /* Adresy wstawiamy z JavaScriptu, a nie w szablonie: data URL potrafi mieć
       kilkaset tysięcy znaków i sklejanie go w tekst HTML niepotrzebnie
       zamula przeglądarkę przy każdym przerysowaniu. */
    grid.querySelectorAll('.gal-thumb img').forEach((img, i) => { img.src = items[i].src; });

    count.textContent = items.length
      ? `${items.length} z ${IMG.maxCount} zdjęć · pierwsze jest okładką na stronie zajęć`
      : 'Brak zdjęć — zajęcia pokażą się z domyślną grafiką.';
  }

  /* ------------------------------------------------------------ dokładanie */
  async function addFiles(files) {
    const lista = [...(files || [])].filter(f => f && (f.type || '').startsWith('image/'));
    if (!lista.length) return say('bad', 'Wśród upuszczonych plików nie ma zdjęć.');
    if (busy) return;

    busy = true;
    const bledy = [];
    let dodane = 0;

    for (const [i, file] of lista.entries()) {
      const err = imageFileError(file, items.length);
      if (err) { bledy.push(err); continue; }

      say('info', `Przygotowuję zdjęcia… (${i + 1} z ${lista.length})`);
      /* oddajemy klatkę przeglądarce, żeby komunikat zdążył się pokazać */
      await new Promise(r => setTimeout(r, 0));
      try {
        const img = await readImageFile(file);
        items = [...items, { id: tempId(), isNew: true, ...img }];
        dodane++;
        render();
      } catch (e) {
        bledy.push(`„${file.name}": ${e.message}`);
      }
    }

    busy = false;
    if (bledy.length) say('bad', bledy.join(' '));
    else if (dodane) say('ok', dodane === 1
      ? 'Dodano zdjęcie. Zmiany zapiszą się razem z zajęciami.'
      : `Dodano ${dodane} zdjęcia. Zmiany zapiszą się razem z zajęciami.`);
    if (dodane && onChange) onChange();
  }

  /* --------------------------------------------------------------- akcje */
  grid.addEventListener('click', async e => {
    const b = e.target.closest('button[data-a]');
    if (!b) return;
    const i = Number(b.dataset.i);

    if (b.dataset.a === 'left')  { items = moveItem(items, i, i - 1); return changed(); }
    if (b.dataset.a === 'right') { items = moveItem(items, i, i + 1); return changed(); }

    if (b.dataset.a === 'del') {
      const it = items[i];
      const ok = await askConfirm({
        title: 'Usunąć to zdjęcie?',
        text: it.isNew
          ? 'To zdjęcie nie zostało jeszcze zapisane — po prostu zniknie z listy.'
          : 'Zdjęcie zniknie z galerii, a z bazy zostanie skasowane przy zapisie zajęć.',
        details: [it.name || 'zdjęcie', it.bytes ? humanBytes(it.bytes) : ''].filter(Boolean),
        confirmLabel: 'Tak, usuń zdjęcie'
      });
      if (!ok) return;
      items = items.filter((_, k) => k !== i);
      say('', '');
      changed();
    }
  });

  /* ---------------------------------------------- wybór pliku i upuszczanie */
  drop.addEventListener('click', () => input.click());
  drop.addEventListener('keydown', e => {
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); input.click(); }
  });
  input.addEventListener('change', () => { addFiles(input.files); input.value = ''; });

  const hasFiles = e => [...((e.dataTransfer && e.dataTransfer.types) || [])].includes('Files');

  ['dragenter', 'dragover'].forEach(t => host.addEventListener(t, e => {
    if (!hasFiles(e)) return;
    e.preventDefault();
    host.classList.add('is-over');
  }));
  host.addEventListener('dragleave', e => {
    if (e.target === host || !host.contains(e.relatedTarget)) host.classList.remove('is-over');
  });
  host.addEventListener('drop', e => {
    if (!hasFiles(e)) return;
    e.preventDefault();
    host.classList.remove('is-over');
    addFiles(e.dataTransfer.files);
  });

  /* Wklejenie ze schowka działa tylko wtedy, gdy galeria jest na ekranie —
     inaczej Ctrl+V na innej podstronie dokładałby zdjęcia po cichu. */
  document.addEventListener('paste', e => {
    if (!host.isConnected || !host.offsetParent) return;
    const pliki = [...((e.clipboardData && e.clipboardData.files) || [])];
    if (pliki.length) { e.preventDefault(); addFiles(pliki); }
  });

  /* ------------------------------------------ przeciąganie zmienia kolejność */
  /* Uwaga: kolejność zmieniamy dopiero przy upuszczeniu, a nie na bieżąco przy
     `dragover`. Przerysowanie siatki w trakcie przeciągania kasuje z DOM-u
     element, który przeciągamy — przeglądarka przerywa wtedy całą operację
     i nie dostaje `dragend`. Podgląd załatwia sama klasa `.is-target`. */
  let dragFrom = null;
  const clearMarks = () => grid.querySelectorAll('.gal-item')
    .forEach(li => li.classList.remove('is-target', 'is-dragging'));

  grid.addEventListener('dragstart', e => {
    const li = e.target.closest('.gal-item');
    if (!li) return;
    dragFrom = Number(li.dataset.i);
    li.classList.add('is-dragging');
    e.dataTransfer.effectAllowed = 'move';
    /* Firefox nie zaczyna przeciągania bez jakichkolwiek danych */
    e.dataTransfer.setData('text/plain', String(dragFrom));
  });
  grid.addEventListener('dragover', e => {
    if (dragFrom === null) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    const li = e.target.closest('.gal-item');
    grid.querySelectorAll('.gal-item.is-target').forEach(x => x.classList.remove('is-target'));
    if (li && Number(li.dataset.i) !== dragFrom) li.classList.add('is-target');
  });
  grid.addEventListener('drop', e => {
    if (dragFrom === null) return;
    e.preventDefault();
    const li = e.target.closest('.gal-item');
    const to = li ? Number(li.dataset.i) : dragFrom;
    const from = dragFrom;
    dragFrom = null;
    clearMarks();
    if (to === from) return;
    items = moveItem(items, from, to);
    changed();
  });
  grid.addEventListener('dragend', () => { dragFrom = null; clearMarks(); });

  /* --------------------------------------------------------- adres z ręki */
  host.querySelector('[data-a="url"]').addEventListener('click', async () => {
    if (items.length >= IMG.maxCount)
      return say('bad', `Limit to ${IMG.maxCount} zdjęć na zajęcia.`);
    const url = await askText({
      title: 'Zdjęcie spod adresu',
      text: 'Wstaw zdjęcie, które leży już gdzieś na serwerze — nic się nie wgrywa, zapisujemy sam adres.',
      label: 'Adres zdjęcia',
      placeholder: '/img/warsztaty.jpg',
      hint: 'Może być ścieżka na tej stronie albo pełny adres https://…',
      confirmLabel: 'Dodaj zdjęcie'
    });
    if (!url) return;
    items = [...items, {
      id: tempId(), isNew: true, kind: 'url', src: url,
      name: url.split('/').pop() || url, width: 0, height: 0, bytes: 0
    }];
    say('ok', 'Adres dodany. Zapisze się razem z zajęciami.');
    changed();
  });

  render();   // pusta galeria od razu opisuje samą siebie, jeszcze przed load()

  /* ==================================================== interfejs dla strony */
  return {
    /** Wczytuje galerię zajęć; bez identyfikatora — czyści widok (nowe zajęcia). */
    async load(eventId, event) {
      say('', '');
      legacy = [];
      if (!eventId) { base = []; items = []; render(); return; }
      try {
        base = await listEventImages(eventId);
        items = base.map(i => ({ ...i, isNew: false }));

        /* Zgodność wstecz: zajęcia sprzed galerii mają adresy w polu images[].
           Pokazujemy je jak zwykłe pozycje; przy zapisie przeniosą się do
           kolekcji eventImages i stare pole zostanie wyczyszczone. */
        const stare = (event && event.images || []).filter(Boolean);
        if (!base.length && stare.length) {
          legacy = stare;
          items = stare.map(src => ({
            id: tempId(), isNew: true, kind: 'url', src,
            name: src.split('/').pop() || src, width: 0, height: 0, bytes: 0
          }));
        }
      } catch (e) {
        base = []; items = [];
        say('bad', 'Nie udało się wczytać zdjęć: ' + e.message);
      }
      openSig = gallerySignature(items);
      render();
    },

    reset() { base = []; items = []; legacy = []; openSig = ''; say('', ''); render(); },

    items:     () => items,
    count:     () => items.length,
    signature: () => gallerySignature(items),
    /* Liczy się zmiana OD OTWARCIA okna, a nie różnica wobec bazy: zajęcia
       sprzed galerii mają adresy w starym polu images[] i zaraz po wczytaniu
       wyglądają jak same nowe pozycje. Bez tego każde takie zajęcia pytałyby
       o niezapisane zmiany, choć administrator niczego nie tknął. */
    isDirty:   () => gallerySignature(items) !== openSig,
    plan:      () => galleryPlan(base, items),

    /**
     * Wysyła do bazy różnicę między tym, co było, a tym, co widać.
     * @param {string} eventId  identyfikator zajęć (już zapisanych)
     */
    async commit(eventId) {
      const plan = galleryPlan(base, items);
      if (!plan.create.length && !plan.remove.length && !plan.reorder.length) return null;

      const wynik = await applyGallery(eventId, plan, (done, all) =>
        say('info', `Zapisuję zdjęcia… (${done} z ${all})`));

      /* Adresy przeniesione ze starego pola — czyścimy je, żeby zdjęcia nie
         dublowały się na stronie zajęć. */
      if (legacy.length) {
        await clearLegacyImages(eventId).catch(e => console.warn('clearLegacyImages:', e.message));
        legacy = [];
      }

      base = await listEventImages(eventId);
      items = base.map(i => ({ ...i, isNew: false }));
      openSig = gallerySignature(items);
      render();
      say('', '');
      return wynik;
    }
  };
}
