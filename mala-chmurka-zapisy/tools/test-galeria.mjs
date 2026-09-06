/* ==========================================================================
   Mała Chmurka — testy galerii zdjęć zajęć
   --------------------------------------------------------------------------
   Sprawdzają to, co przy zdjęciach najłatwiej zepsuć:
     • które pliki w ogóle wpuszczamy (format, waga, limit sztuk),
     • jak liczymy rozmiar po zmniejszeniu i wymiary miniatury,
     • czy przestawianie kolejności nie gubi ani nie duplikuje zdjęć,
     • czy plan zapisu (co utworzyć, co skasować, co przenumerować) zgadza się
       z tym, co administrator poukładał na ekranie,
     • czy strona zajęć pokazuje właściwy zestaw zdjęć (nowe albo stare adresy).

   URUCHOMIENIE:   node tools/test-galeria.mjs   (z katalogu mala-chmurka-zapisy)
   Bez zależności i bez emulatora — sam Node.
   ========================================================================== */

import { IMG, imageFileError, fitSize, dataUrlBytes, humanBytes, moveItem,
         galleryPlan, gallerySignature, gallerySources } from '../assets/mc-common.js';

let pass = 0, fail = 0;
function ok(name, cond, dump = '') {
  if (cond) { console.log('  OK   ' + name); pass++; }
  else { console.log('  FAIL ' + name + (dump ? '\n         ' + dump : '')); fail++; }
}
const eq = (name, got, want) =>
  ok(`${name} → ${JSON.stringify(want)}`, got === want, `dostałem: ${JSON.stringify(got)}`);
const same = (name, got, want) =>
  ok(`${name} → ${JSON.stringify(want)}`,
     JSON.stringify(got) === JSON.stringify(want), `dostałem: ${JSON.stringify(got)}`);

/* Atrapa pliku — tyle, ile potrzebuje imageFileError. */
const plik = (name, type, size) => ({ name, type, size });

/* ============================================ KTÓRE PLIKI WPUSZCZAMY ==== */
console.log('\n=== SPRAWDZANIE PLIKU ===');

eq('zwykły JPG przechodzi',
   imageFileError(plik('warsztaty.jpg', 'image/jpeg', 2 * 1024 * 1024)), null);
eq('PNG przechodzi',
   imageFileError(plik('domek.png', 'image/png', 500 * 1024)), null);
eq('WEBP przechodzi',
   imageFileError(plik('sala.webp', 'image/webp', 300 * 1024)), null);

ok('PDF odpada z czytelnym powodem',
   /nie jest zdjęcie/.test(imageFileError(plik('cennik.pdf', 'application/pdf', 1000)) || ''),
   imageFileError(plik('cennik.pdf', 'application/pdf', 1000)));

ok('nazwa pliku wraca w komunikacie — wiadomo, który plik zawinił',
   (imageFileError(plik('cennik.pdf', 'application/pdf', 1000)) || '').includes('cennik.pdf'));

ok('HEIC z iPhone odpada z podpowiedzią, co zrobić',
   /JPG/.test(imageFileError(plik('IMG_0042.heic', 'image/heic', 1024)) || ''),
   imageFileError(plik('IMG_0042.heic', 'image/heic', 1024)));

ok('plik cięższy niż limit odpada',
   /za dużo/.test(imageFileError(plik('raw.jpg', 'image/jpeg', IMG.maxSourceBytes + 1)) || ''));
eq('plik dokładnie w limicie jeszcze przechodzi',
   imageFileError(plik('raw.jpg', 'image/jpeg', IMG.maxSourceBytes)), null);

ok('po zapełnieniu galerii nie da się dołożyć więcej',
   /najwyżej/.test(imageFileError(plik('extra.jpg', 'image/jpeg', 1000), IMG.maxCount) || ''));
eq('jedno miejsce wolne — plik wchodzi',
   imageFileError(plik('extra.jpg', 'image/jpeg', 1000), IMG.maxCount - 1), null);

ok('brak pliku nie wywraca funkcji', typeof imageFileError(null) === 'string');

/* ================================================== ROZMIAR I WYMIARY ==== */
console.log('\n=== ROZMIAR I WYMIARY ===');

same('poziome zdjęcie mieści się w dłuższym boku',
     fitSize(4000, 3000, 1400), { w: 1400, h: 1050 });
same('pionowe zdjęcie liczy się od wysokości',
     fitSize(3000, 4000, 1400), { w: 1050, h: 1400 });
same('kwadrat zostaje kwadratem', fitSize(2000, 2000, 1400), { w: 1400, h: 1400 });
same('małe zdjęcie nie jest powiększane', fitSize(600, 400, 1400), { w: 600, h: 400 });
same('zdjęcie dokładnie w limicie zostaje bez zmian', fitSize(1400, 900, 1400), { w: 1400, h: 900 });
same('bardzo wąska panorama nie schodzi do zera', fitSize(5000, 3, 1400), { w: 1400, h: 1 });

eq('data URL bez wypełnienia liczy się poprawnie',
   dataUrlBytes('data:image/jpeg;base64,' + 'A'.repeat(8)), 6);
eq('jeden znak wypełnienia odejmuje jeden bajt',
   dataUrlBytes('data:image/jpeg;base64,' + 'A'.repeat(7) + '='), 5);
eq('dwa znaki wypełnienia odejmują dwa bajty',
   dataUrlBytes('data:image/jpeg;base64,' + 'A'.repeat(6) + '=='), 4);
eq('zwykły adres URL nie jest liczony jako plik', dataUrlBytes('/img/warsztaty.jpg'), 0);
eq('pusta wartość daje zero', dataUrlBytes(''), 0);

eq('bajty', humanBytes(512), '512 B');
eq('kilobajty', humanBytes(320 * 1024), '320 kB');
eq('megabajty po polsku, z przecinkiem', humanBytes(2.5 * 1024 * 1024), '2,5 MB');

ok('budżet jednego zdjęcia mieści się w dokumencie Firestore (1 MiB)',
   IMG.maxStoredChars < 1048576);
ok('cel kompresji jest niżej niż twardy limit',
   IMG.targetBytes < IMG.maxStoredChars * 3 / 4);

/* ==================================================== ZMIANA KOLEJNOŚCI == */
console.log('\n=== ZMIANA KOLEJNOŚCI ===');

const L = ['a', 'b', 'c', 'd'];

same('przesunięcie w lewo', moveItem(L, 2, 1), ['a', 'c', 'b', 'd']);
same('przesunięcie w prawo', moveItem(L, 1, 2), ['a', 'c', 'b', 'd']);
same('na sam początek — nowa okładka', moveItem(L, 3, 0), ['d', 'a', 'b', 'c']);
same('na sam koniec', moveItem(L, 0, 3), ['b', 'c', 'd', 'a']);
same('w to samo miejsce nic nie zmienia', moveItem(L, 2, 2), ['a', 'b', 'c', 'd']);
same('pierwsze w lewo zostaje na miejscu', moveItem(L, 0, -1), ['a', 'b', 'c', 'd']);
same('ostatnie w prawo zostaje na miejscu', moveItem(L, 3, 4), ['a', 'b', 'c', 'd']);
same('nieistniejąca pozycja niczego nie psuje', moveItem(L, 9, 0), ['a', 'b', 'c', 'd']);
same('oryginalna lista zostaje nietknięta', L, ['a', 'b', 'c', 'd']);
eq('po przestawieniu nadal są cztery zdjęcia', moveItem(L, 3, 0).length, 4);

/* ======================================================== PLAN ZAPISU ==== */
console.log('\n=== PLAN ZAPISU ===');

const stare = [{ id: 'i1' }, { id: 'i2' }, { id: 'i3' }];
const wiersz = (id, isNew = false) => ({ id, isNew, kind: 'data', src: 'data:…', name: id });

{
  const p = galleryPlan(stare, stare.map(x => wiersz(x.id)));
  same('nic nie ruszone → nic do zrobienia',
       [p.create.length, p.remove.length, p.reorder.length], [0, 0, 0]);
}

{
  const p = galleryPlan(stare, [...stare.map(x => wiersz(x.id)), wiersz('nowe-1', true)]);
  eq('dołożone zdjęcie trafia do utworzenia', p.create.length, 1);
  eq('nowe zdjęcie dostaje kolejność na końcu', p.create[0].order, 3);
  eq('nic nie kasujemy', p.remove.length, 0);
  eq('reszta zostaje na swoich miejscach', p.reorder.length, 0);
}

{
  const p = galleryPlan(stare, [wiersz('i1'), wiersz('i3')]);
  same('skasowane zdjęcie trafia do usunięcia', p.remove, ['i2']);
  same('to, co zostało, dostaje nową numerację', p.reorder, [{ id: 'i3', order: 1 }]);
}

{
  const p = galleryPlan(stare, [wiersz('i3'), wiersz('i1'), wiersz('i2')]);
  same('przestawienie zmienia kolejność wszystkich trzech',
       p.reorder, [{ id: 'i3', order: 0 }, { id: 'i1', order: 1 }, { id: 'i2', order: 2 }]);
  eq('przestawianie niczego nie kasuje', p.remove.length, 0);
  eq('przestawianie niczego nie tworzy', p.create.length, 0);
}

{
  /* Najgorszy przypadek naraz: jedno usunięte, jedno nowe na przodzie,
     reszta przesunięta. Tak wygląda typowa sesja porządkowania galerii. */
  const p = galleryPlan(stare, [wiersz('nowe-7', true), wiersz('i3'), wiersz('i1')]);
  same('usunięte', p.remove, ['i2']);
  eq('nowe zdjęcie idzie na pozycję zero — zostaje okładką', p.create[0].order, 0);
  same('stare przesuwają się o jedno w dół',
       p.reorder, [{ id: 'i3', order: 1 }, { id: 'i1', order: 2 }]);
}

{
  const p = galleryPlan([], [wiersz('nowe-1', true), wiersz('nowe-2', true)]);
  same('nowe zajęcia: same nowe zdjęcia, po kolei',
       p.create.map(c => c.order), [0, 1]);
}

{
  const p = galleryPlan(stare, []);
  same('wyczyszczenie galerii kasuje wszystko', p.remove, ['i1', 'i2', 'i3']);
}

ok('plan przyjmuje też samą listę identyfikatorów',
   galleryPlan(['i1', 'i2'], [wiersz('i2')]).remove.join() === 'i1');

/* ====================================== ODCISK GALERII (czy jest zmiana) = */
console.log('\n=== WYKRYWANIE ZMIAN ===');

const A = [wiersz('i1'), wiersz('i2'), wiersz('i3')];
eq('ta sama galeria daje ten sam odcisk',
   gallerySignature(A), gallerySignature([wiersz('i1'), wiersz('i2'), wiersz('i3')]));
ok('przestawienie zmienia odcisk',
   gallerySignature(A) !== gallerySignature(moveItem(A, 0, 2)));
ok('usunięcie zmienia odcisk',
   gallerySignature(A) !== gallerySignature(A.slice(0, 2)));
ok('dołożenie zmienia odcisk',
   gallerySignature(A) !== gallerySignature([...A, wiersz('nowe-1', true)]));
eq('pusta galeria ma pusty odcisk', gallerySignature([]), '');
eq('brak listy nie wywraca funkcji', gallerySignature(null), '');

/* ============================================ CO WIDZI KLIENT NA STRONIE = */
console.log('\n=== ZDJĘCIA NA STRONIE ZAJĘĆ ===');

const wgrane = [
  { id: 'i2', src: 'b.jpg', order: 1 },
  { id: 'i1', src: 'a.jpg', order: 0 },
  { id: 'i3', src: 'c.jpg', order: 2 }
];

same('kolejność bierze się z pola order, a nie z bazy',
     gallerySources(wgrane, []), ['a.jpg', 'b.jpg', 'c.jpg']);
same('wgrane zdjęcia wygrywają ze starymi adresami',
     gallerySources(wgrane, ['/img/stare.jpg']), ['a.jpg', 'b.jpg', 'c.jpg']);
same('bez wgranych zostają stare adresy (zgodność wstecz)',
     gallerySources([], ['/img/stare.jpg', '/img/inne.jpg']),
     ['/img/stare.jpg', '/img/inne.jpg']);
same('puste wpisy w starych adresach są pomijane',
     gallerySources([], ['/img/a.jpg', '', null]), ['/img/a.jpg']);
same('zajęcia bez żadnych zdjęć dają pustą listę', gallerySources([], []), []);
same('brak obu list też jest bezpieczny', gallerySources(null, null), []);
same('zdjęcie bez pola order ląduje na początku, nie znika',
     gallerySources([{ id: 'x', src: 'x.jpg' }, { id: 'y', src: 'y.jpg', order: 1 }], []),
     ['x.jpg', 'y.jpg']);

/* ======================================================================== */
console.log(`\n================  ${pass} zaliczonych, ${fail} niezaliczonych  ================`);
process.exit(fail ? 1 : 0);
