/* =========================
   SubTrack — Elegant UI CSS
   Works with the App.jsx I gave you
   ========================= */

/* ---------- Theme tokens ---------- */
:root{
  /* background + surfaces */
  --bg: #070A12;
  --bg2: #0A1020;
  --surface: rgba(255,255,255,0.06);
  --surface2: rgba(255,255,255,0.085);
  --stroke: rgba(255,255,255,0.12);
  --stroke2: rgba(255,255,255,0.18);

  /* text */
  --text: rgba(255,255,255,0.92);
  --muted: rgba(255,255,255,0.72);
  --muted2: rgba(255,255,255,0.58);

  /* accents */
  --a1: #7c3aed;  /* violet */
  --a2: #22d3ee;  /* cyan */
  --a3: #34d399;  /* green */

  /* layout */
  --radius: 18px;
  --radius2: 14px;

  /* shadows (softer, more premium) */
  --shadow-sm: 0 10px 30px rgba(0,0,0,0.22);
  --shadow:    0 18px 60px rgba(0,0,0,0.32);

  /* weights */
  --w-regular: 500;
  --w-medium: 600;
  --w-semibold: 650;
  --w-bold: 760;
  --w-heavy: 860;
}

:root[data-theme="light"]{
  --bg: #f7f8ff;
  --bg2:#ffffff;
  --surface: rgba(10,16,32,0.045);
  --surface2: rgba(10,16,32,0.06);
  --stroke: rgba(10,16,32,0.12);
  --stroke2: rgba(10,16,32,0.18);

  --text: rgba(7,10,18,0.92);
  --muted: rgba(7,10,18,0.70);
  --muted2: rgba(7,10,18,0.55);

  --shadow-sm: 0 10px 30px rgba(15,18,35,0.10);
  --shadow:    0 18px 60px rgba(15,18,35,0.14);
}

/* ---------- Base ---------- */
*{ box-sizing: border-box; }
html, body{ height: 100%; }

body{
  margin: 0;
  color: var(--text);
  background:
    radial-gradient(900px 600px at 14% 12%, rgba(124,58,237,0.22), transparent 60%),
    radial-gradient(900px 600px at 86% 22%, rgba(34,211,238,0.14), transparent 58%),
    radial-gradient(900px 600px at 66% 88%, rgba(52,211,153,0.10), transparent 55%),
    linear-gradient(180deg, var(--bg), var(--bg2));
  font-family: ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, "Apple Color Emoji","Segoe UI Emoji";
  font-weight: var(--w-regular);
  letter-spacing: -0.01em;
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
}

a{ color: inherit; text-decoration: none; }
button, input, select, textarea{ font: inherit; color: inherit; }
button{ border: none; background: none; }

/* better focus */
:focus{ outline: none; }
:focus-visible{
  box-shadow: 0 0 0 4px rgba(34,211,238,0.14);
  border-radius: 12px;
}

/* ---------- Page wrapper ---------- */
.page{
  min-height: 100vh;
  position: relative;
}

/* subtle “sheen” overlay */
.page::before{
  content: "";
  position: fixed;
  inset: 0;
  pointer-events: none;
  background:
    radial-gradient(900px 400px at 50% -10%, rgba(255,255,255,0.06), transparent 60%),
    radial-gradient(800px 500px at 10% 90%, rgba(255,255,255,0.04), transparent 55%);
  opacity: 0.8;
}

/* ---------- Header / Nav ---------- */
.header{
  position: sticky;
  top: 0;
  z-index: 50;
  border-bottom: 1px solid var(--stroke);
  background: rgba(10,16,32,0.35);
  backdrop-filter: blur(14px);
}

:root[data-theme="light"] .header{
  background: rgba(255,255,255,0.75);
}

.nav{
  max-width: 1100px;
  margin: 0 auto;
  padding: 16px 18px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 14px;
}

.brand{
  display: flex;
  align-items: center;
  gap: 12px;
}

.logoDot{
  width: 11px;
  height: 11px;
  border-radius: 50%;
  background: linear-gradient(135deg, var(--a1), var(--a2), var(--a3));
  box-shadow: 0 0 0 7px rgba(124,58,237,0.11);
}

.brandName{
  font-weight: var(--w-heavy);
  letter-spacing: -0.03em;
}

.brandSub{
  margin-top: 2px;
  font-size: 12px;
  color: var(--muted2);
  font-weight: var(--w-regular);
}

.navRight{
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
  justify-content: flex-end;
}

/* ---------- Container ---------- */
.container{
  max-width: 1100px;
  margin: 0 auto;
  padding: 22px 18px 52px;
}

/* ---------- Hero ---------- */
.hero{
  padding: 20px 0 6px;
}

.pill{
  display: inline-flex;
  align-items: center;
  gap: 10px;
  padding: 8px 12px;
  border-radius: 999px;
  border: 1px solid var(--stroke);
  background: rgba(255,255,255,0.05);
  color: var(--muted);
  font-weight: var(--w-medium);
}

.hero h1{
  margin: 14px 0 10px;
  font-size: clamp(30px, 4vw, 46px);
  line-height: 1.1;
  letter-spacing: -0.045em;
  font-weight: var(--w-heavy);
}

.accent{
  background: linear-gradient(90deg, var(--a1), var(--a2), var(--a3));
  -webkit-background-clip: text;
  background-clip: text;
  color: transparent;
}

.sub{
  margin: 0;
  max-width: 74ch;
  color: var(--muted);
  font-size: 15px;
  line-height: 1.7;
}

/* ---------- Stat cards ---------- */
.stats{
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 12px;
  margin-top: 18px;
}

.stat{
  border: 1px solid var(--stroke);
  background: linear-gradient(180deg, rgba(255,255,255,0.06), rgba(255,255,255,0.035));
  border-radius: var(--radius);
  padding: 14px 14px;
  box-shadow: var(--shadow-sm);
}

.statNum{
  font-weight: var(--w-bold);
  font-size: 22px;
  letter-spacing: -0.01em;
}

.statLabel{
  margin-top: 6px;
  color: var(--muted2);
  font-weight: var(--w-medium);
  font-size: 12px;
}

/* ---------- Cards ---------- */
.grid2{
  display: grid;
  grid-template-columns: 1.02fr 1.5fr;
  gap: 14px;
}

.card{
  border: 1px solid var(--stroke);
  background: rgba(255,255,255,0.05);
  border-radius: calc(var(--radius) + 2px);
  padding: 16px;
  box-shadow: var(--shadow);
  position: relative;
  overflow: hidden;
}

.card::after{
  content:"";
  position:absolute;
  inset: -1px;
  pointer-events:none;
  background: radial-gradient(800px 220px at 30% 0%, rgba(34,211,238,0.10), transparent 55%);
  opacity: 0.9;
}

.card > *{ position: relative; z-index: 1; }

.cardHead{
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  padding-bottom: 12px;
  border-bottom: 1px solid var(--stroke);
  margin-bottom: 14px;
}

.cardHead h2{
  margin: 0;
  font-size: 15px;
  letter-spacing: -0.01em;
  font-weight: var(--w-semibold);
}

.aboutText{
  color: var(--muted);
  line-height: 1.7;
  font-weight: var(--w-regular);
}

/* ---------- Form ---------- */
.form{ display: grid; gap: 12px; }

label{
  display: grid;
  gap: 8px;
  color: var(--muted);
  font-weight: var(--w-medium);
  font-size: 13px;
}

input, select, textarea{
  background: rgba(255,255,255,0.055);
  border: 1px solid var(--stroke);
  border-radius: var(--radius2);
  padding: 12px 12px;
  transition: transform .15s ease, border-color .15s ease, box-shadow .15s ease, background .15s ease;
}

:root[data-theme="light"] input,
:root[data-theme="light"] select,
:root[data-theme="light"] textarea{
  background: rgba(255,255,255,0.82);
}

input::placeholder, textarea::placeholder{
  color: rgba(255,255,255,0.45);
}
:root[data-theme="light"] input::placeholder,
:root[data-theme="light"] textarea::placeholder{
  color: rgba(7,10,18,0.40);
}

input:focus, select:focus, textarea:focus{
  border-color: rgba(34,211,238,0.45);
  box-shadow: 0 0 0 4px rgba(34,211,238,0.12);
}

textarea{ resize: vertical; }

.row{
  display: grid;
  grid-template-columns: 1fr 0.85fr;
  gap: 10px;
}

.filters{
  display: flex;
  align-items: center;
  gap: 10px;
}

.search{ width: min(360px, 48vw); }

/* ---------- Buttons ---------- */
.chipBtn{
  border: 1px solid var(--stroke);
  background: rgba(255,255,255,0.06);
  padding: 10px 12px;
  border-radius: 999px;
  font-weight: var(--w-medium);
  cursor: pointer;
  transition: transform .15s ease, box-shadow .15s ease, border-color .15s ease, background .15s ease;
}

.chipBtn:hover{
  transform: translateY(-1px);
  border-color: rgba(34,211,238,0.26);
  box-shadow: 0 12px 26px rgba(0,0,0,0.20);
}

.chipBtn.ghost{
  background: transparent;
}

.btn{
  border: 1px solid var(--stroke);
  border-radius: 16px;
  padding: 12px 14px;
  cursor: pointer;
  font-weight: var(--w-semibold);
  transition: transform .15s ease, box-shadow .15s ease, border-color .15s ease, filter .15s ease;
}

.btn:hover{ transform: translateY(-1px); }

.btn.primary{
  border-color: rgba(34,211,238,0.26);
  background:
    linear-gradient(90deg, rgba(124,58,237,0.22), rgba(34,211,238,0.18), rgba(52,211,153,0.14));
  box-shadow: 0 18px 45px rgba(0,0,0,0.30);
}

.btn.primary:hover{
  filter: brightness(1.05);
  box-shadow: 0 22px 55px rgba(0,0,0,0.34);
}

/* disabled (cooldown) */
.btn:disabled,
.smallBtn:disabled,
.chipBtn:disabled{
  opacity: 0.55;
  cursor: not-allowed;
  transform: none !important;
  box-shadow: none !important;
}

/* small buttons */
.smallBtn{
  border: 1px solid var(--stroke);
  background: rgba(255,255,255,0.06);
  padding: 9px 11px;
  border-radius: 999px;
  cursor: pointer;
  font-weight: var(--w-medium);
  transition: transform .15s ease, border-color .15s ease, box-shadow .15s ease;
}

.smallBtn:hover{
  transform: translateY(-1px);
  border-color: rgba(124,58,237,0.24);
  box-shadow: 0 12px 24px rgba(0,0,0,0.16);
}

.smallBtn.ghost{ background: transparent; }

.smallBtn.danger{
  border-color: rgba(231,76,60,0.26);
  background: rgba(231,76,60,0.06);
}

.smallBtn.danger:hover{
  border-color: rgba(231,76,60,0.46);
  box-shadow: 0 16px 30px rgba(231,76,60,0.12);
}

/* ---------- List ---------- */
.list{ display: grid; gap: 12px; }

.item{
  border: 1px solid var(--stroke);
  background: rgba(255,255,255,0.04);
  border-radius: var(--radius);
  padding: 14px;
  transition: transform .15s ease, border-color .15s ease, box-shadow .15s ease, background .15s ease;
}

.item:hover{
  transform: translateY(-1px);
  border-color: rgba(34,211,238,0.18);
  box-shadow: var(--shadow-sm);
  background: rgba(255,255,255,0.05);
}

.itemTop{
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
}

.itemName{
  font-weight: var(--w-semibold);
  letter-spacing: -0.01em;
}

.itemMeta{
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
  margin-top: 8px;
}

.dot{
  width: 4px;
  height: 4px;
  border-radius: 99px;
  background: var(--stroke2);
}

.metaText{
  color: var(--muted);
  font-weight: var(--w-regular);
  font-size: 12px;
}

.badge{
  display: inline-flex;
  align-items: center;
  padding: 6px 10px;
  border-radius: 999px;
  border: 1px solid var(--stroke);
  font-weight: var(--w-medium);
  font-size: 12px;
}

.badge.ok{
  background: rgba(52,211,153,0.10);
  border-color: rgba(52,211,153,0.18);
}

.badge.warn{
  background: rgba(241,196,15,0.12);
  border-color: rgba(241,196,15,0.22);
}

.badge.bad{
  background: rgba(231,76,60,0.12);
  border-color: rgba(231,76,60,0.22);
}

.badge.muted{
  background: rgba(255,255,255,0.05);
}

.itemAmt{
  text-align: right;
  min-width: 150px;
}

.amtMain{
  font-weight: var(--w-semibold);
  letter-spacing: -0.01em;
}

.amtSub{
  margin-top: 6px;
  color: var(--muted2);
  font-weight: var(--w-regular);
  font-size: 12px;
}

.itemBottom{
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-top: 12px;
  padding-top: 12px;
  border-top: 1px solid var(--stroke);
  flex-wrap: wrap;
}

.dueLine{
  color: var(--muted);
  font-weight: var(--w-regular);
  font-size: 13px;
  line-height: 1.6;
}

.dueDate{
  color: var(--text);
  font-weight: var(--w-medium);
}

.note{ color: var(--muted2); }

/* ---------- Empty state ---------- */
.empty{
  padding: 18px 12px;
  border: 1px dashed var(--stroke);
  border-radius: var(--radius);
  background: rgba(255,255,255,0.035);
}

.emptyTitle{
  font-weight: var(--w-semibold);
  letter-spacing: -0.01em;
}

.emptyText{
  margin-top: 8px;
  color: var(--muted);
  line-height: 1.65;
}

/* ---------- Footer ---------- */
.footer{
  margin-top: 22px;
  color: var(--muted2);
  font-size: 12px;
  text-align: center;
}

/* ---------- Toast ---------- */
.toast{
  position: fixed;
  top: 16px;
  left: 50%;
  transform: translateX(-50%);
  z-index: 9999;
  padding: 12px 14px;
  border-radius: 14px;
  backdrop-filter: blur(12px);
  border: 1px solid rgba(255,255,255,0.14);
  box-shadow: 0 18px 48px rgba(0,0,0,0.30);
  max-width: min(560px, 92vw);
  font-weight: var(--w-medium);
}

.toast.ok { background: rgba(46, 204, 113, 0.12); }
.toast.warn { background: rgba(241, 196, 15, 0.14); }
.toast.bad { background: rgba(231, 76, 60, 0.14); }
.toast.muted { background: rgba(255, 255, 255, 0.09); }

:root[data-theme="light"] .toast{
  border: 1px solid rgba(10,16,32,0.16);
  box-shadow: 0 18px 48px rgba(15,18,35,0.12);
}

/* ---------- Reduced motion ---------- */
@media (prefers-reduced-motion: reduce){
  *{ transition: none !important; }
  .item:hover, .chipBtn:hover, .btn:hover, .smallBtn:hover{
    transform: none !important;
  }
}

/* ---------- Responsive ---------- */
@media (max-width: 920px){
  .grid2{ grid-template-columns: 1fr; }
  .itemAmt{ text-align: left; min-width: unset; }
  .stats{ grid-template-columns: 1fr; }
  .row{ grid-template-columns: 1fr; }
  .filters{ width: 100%; }
  .search{ width: 100%; }
}
