/* ==========================================================================
   Mała Chmurka — licznik na stronie głównej.

   WPIĘCIE: wystarczy jedna linijka w index.html, tuż przed </body>:
       <script type="module" src="/assets/mc-licznik.js"></script>

   Skrypt sam wstawia licznik nad sekcją „120 m² / 0–6 lat / 7 dni / 4 domki".
   Jeśli chcesz go w innym miejscu, wstaw w HTML pusty <div id="mc-licznik"></div>
   — skrypt użyje wtedy tego miejsca.
   ========================================================================== */
import { SETTINGS, appUrl } from './firebase-config.js';
import { watchPresence, watchStats } from './mc-data.js';

/* ---------------------------------------------------------------- STYLE --- */
const css = `
.mc-live{background:var(--cream,#FBF7F1);padding:clamp(18px,3vw,26px) 0 0}
.mc-live-inner{display:grid;grid-template-columns:1.35fr 1fr;gap:14px}
.mc-live-card{display:flex;align-items:center;gap:14px;background:#fff;
  border:1px solid var(--line,#E3D9CB);border-radius:var(--radius-lg,28px);
  box-shadow:var(--shadow-sm,0 2px 10px rgba(44,53,64,.06));padding:18px 22px}
.mc-live-card.is-open{border-color:#BFE0C9;background:linear-gradient(180deg,#F4FBF6,#fff)}
.mc-dot{width:13px;height:13px;border-radius:50%;background:#C7CDD4;flex:none;position:relative}
.mc-live-card.is-open .mc-dot{background:#2F8F5B}
.mc-live-card.is-open .mc-dot::after{content:"";position:absolute;inset:-6px;border-radius:50%;
  border:2px solid rgba(47,143,91,.45);animation:mcPulse 2s ease-out infinite}
@keyframes mcPulse{0%{transform:scale(.7);opacity:1}100%{transform:scale(1.25);opacity:0}}
.mc-live-k{display:block;font-size:.86rem;color:var(--muted,#6B7885);letter-spacing:.02em}
.mc-live-v{display:block;font-family:var(--font-head,'Quicksand',sans-serif);font-weight:700;
  font-size:clamp(1.35rem,2.6vw,1.8rem);color:var(--navy,#3D5A78);line-height:1.15}
.mc-live-v em{font-style:normal;color:var(--muted,#6B7885);font-weight:600;font-size:.72em}
.mc-live-until{display:block;font-size:.9rem;color:var(--brand-deep,#3E7C89);font-weight:600;margin-top:2px}
.mc-live-cta{margin-left:auto;flex:none}
@media (max-width:760px){
  .mc-live-inner{grid-template-columns:1fr}
  .mc-live-card{padding:14px 16px;border-radius:var(--radius,18px)}
  .mc-live-cta{display:none}
}
@media (prefers-reduced-motion:reduce){.mc-live-card.is-open .mc-dot::after{animation:none}}
`;

const style = document.createElement('style');
style.textContent = css;
document.head.appendChild(style);

/* ----------------------------------------------------------------- HTML --- */
const box = document.createElement('section');
box.className = 'mc-live';
box.setAttribute('aria-label', 'Aktualna frekwencja w bawialni');
box.innerHTML = `
  <div class="container mc-live-inner">
    <div class="mc-live-card" id="mcNowCard">
      <span class="mc-dot" aria-hidden="true"></span>
      <div>
        <span class="mc-live-k" id="mcNowK">Teraz w bawialni</span>
        <span class="mc-live-v" id="mcNowV">— <em>/ ${SETTINGS.capacity}</em></span>
        <span class="mc-live-until" id="mcNowUntil"></span>
      </div>
      <a class="btn btn-primary mc-live-cta" href="${appUrl('zapisz-sie-na-zajecia.html')}">Zapisz się</a>
    </div>
    <div class="mc-live-card">
      <div>
        <span class="mc-live-k">Odwiedziło nas już</span>
        <span class="mc-live-v"><span id="mcVisits">${SETTINGS.visitsBase}</span> <em>dzieci</em></span>
        <span class="mc-live-until">dziękujemy, że jesteście z nami</span>
      </div>
    </div>
  </div>`;

const slot = document.getElementById('mc-licznik');
if (slot) slot.replaceWith(box);
else {
  const facts = document.querySelector('.facts');
  if (facts) facts.parentNode.insertBefore(box, facts);
  else document.body.prepend(box);
}

/* ------------------------------------------------------------- LOGIKA ---- */
const pad = n => String(n).padStart(2, '0');
const nowMin = () => { const d = new Date(); return d.getHours() * 60 + d.getMinutes(); };
const todayISO = () => { const d = new Date(); return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`; };
const toMin = t => { const [h, m] = String(t || '').split(':').map(Number); return (h || 0) * 60 + (m || 0); };
const osoby = n => n === 1 ? '1 os.' : `${n} os.`;

let presence = null;

function paint() {
  const card = document.getElementById('mcNowCard');
  const cap = (presence && presence.capacity) || SETTINGS.capacity;
  let count = (presence && Number(presence.count)) || 0;
  const until = presence && presence.until;

  /* licznik obowiązuje tylko dzisiaj i tylko do ustawionej godziny */
  if (!presence || presence.date !== todayISO()) count = 0;
  if (until && nowMin() >= toMin(until)) count = 0;

  document.getElementById('mcNowV').innerHTML = `${osoby(count)} <em>/ ${cap}</em>`;
  document.getElementById('mcNowUntil').textContent =
    count > 0 && until ? `w bawialni do ${until}` : '';
  document.getElementById('mcNowK').textContent =
    count > 0 ? 'Teraz w bawialni' : 'W bawialni jest teraz luźno';
  card.classList.toggle('is-open', count > 0);
}

watchPresence(p => { presence = p; paint(); });
watchStats(s => {
  if (!s) return;
  const total = (Number(s.visitsBase) || SETTINGS.visitsBase) + (Number(s.visitsCount) || 0);
  document.getElementById('mcVisits').textContent = total;
});

paint();
setInterval(paint, 30000);   // sam wyzeruje się po upływie godziny
