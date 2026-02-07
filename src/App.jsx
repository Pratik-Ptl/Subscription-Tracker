import { useEffect, useMemo, useState } from "react";
import "./App.css";

/** ---------- Helpers (no extra files needed) ---------- **/
const STORAGE_KEY = "subtrack:v1";

function safeParse(json, fallback) {
  try {
    const v = JSON.parse(json);
    return v ?? fallback;
  } catch {
    return fallback;
  }
}

function uid() {
  if (typeof crypto !== "undefined" && crypto.randomUUID) return crypto.randomUUID();
  return String(Date.now()) + "-" + Math.random().toString(16).slice(2);
}

function pad2(n) {
  return String(n).padStart(2, "0");
}

// Format as YYYY-MM-DD (local)
function toYMD(date) {
  const d = new Date(date);
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

// Parse YYYY-MM-DD as local date
function fromYMD(ymd) {
  const [y, m, d] = ymd.split("-").map(Number);
  return new Date(y, (m || 1) - 1, d || 1);
}

function daysUntil(ymd) {
  const today = new Date();
  const start = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const due = fromYMD(ymd);
  const ms = due.getTime() - start.getTime();
  return Math.round(ms / (1000 * 60 * 60 * 24));
}

function daysInMonth(year, monthIndex) {
  return new Date(year, monthIndex + 1, 0).getDate();
}

function addMonthsClamped(date, monthsToAdd) {
  const d = new Date(date);
  const day = d.getDate();

  // Move to 1st to avoid overflow then clamp day
  d.setDate(1);
  d.setMonth(d.getMonth() + monthsToAdd);

  const dim = daysInMonth(d.getFullYear(), d.getMonth());
  d.setDate(Math.min(day, dim));
  return d;
}

function nextDueYMD(currentYMD, cycle) {
  const current = fromYMD(currentYMD);

  let next;
  if (cycle === "weekly") {
    next = new Date(current);
    next.setDate(next.getDate() + 7);
  } else if (cycle === "monthly") {
    next = addMonthsClamped(current, 1);
  } else if (cycle === "quarterly") {
    next = addMonthsClamped(current, 3);
  } else if (cycle === "yearly") {
    next = addMonthsClamped(current, 12);
  } else {
    next = addMonthsClamped(current, 1);
  }

  return toYMD(next);
}

function monthlyEquivalent(amount, cycle) {
  const a = Number(amount) || 0;
  if (cycle === "monthly") return a;
  if (cycle === "yearly") return a / 12;
  if (cycle === "weekly") return (a * 52) / 12;
  if (cycle === "quarterly") return a / 3;
  return a;
}

function yearlyEquivalent(amount, cycle) {
  const a = Number(amount) || 0;
  if (cycle === "monthly") return a * 12;
  if (cycle === "yearly") return a;
  if (cycle === "weekly") return a * 52;
  if (cycle === "quarterly") return a * 4;
  return a * 12;
}

function downloadFile(filename, content, type = "text/plain;charset=utf-8") {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function escapeICS(s) {
  return String(s ?? "")
    .replace(/\\/g, "\\\\")
    .replace(/\n/g, "\\n")
    .replace(/,/g, "\\,")
    .replace(/;/g, "\\;");
}

function cycleToRRule(cycle) {
  if (cycle === "weekly") return "FREQ=WEEKLY;INTERVAL=1";
  if (cycle === "monthly") return "FREQ=MONTHLY;INTERVAL=1";
  if (cycle === "quarterly") return "FREQ=MONTHLY;INTERVAL=3";
  if (cycle === "yearly") return "FREQ=YEARLY;INTERVAL=1";
  return "FREQ=MONTHLY;INTERVAL=1";
}

// DTSTART as local “floating time” 09:00 to make it practical
function makeICS(sub) {
  const dt = fromYMD(sub.nextDue);
  const dtstamp = new Date();
  const dtStart =
    `${dt.getFullYear()}${pad2(dt.getMonth() + 1)}${pad2(dt.getDate())}T090000`;
  const dtStamp =
    `${dtstamp.getUTCFullYear()}${pad2(dtstamp.getUTCMonth() + 1)}${pad2(dtstamp.getUTCDate())}T${pad2(dtstamp.getUTCHours())}${pad2(dtstamp.getUTCMinutes())}${pad2(dtstamp.getUTCSeconds())}Z`;

  const uidVal = escapeICS(sub.id) + "@subtrack";
  const summary = escapeICS(`${sub.name} payment due`);
  const description = escapeICS(
    `${sub.name}\nAmount: ${sub.currency}${Number(sub.amount || 0).toFixed(2)}\nCycle: ${sub.cycle}\nCategory: ${sub.category || "—"}\n\nCreated with SubTrack`
  );

  // Alarm: 1 day before at 09:00
  const ics = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//SubTrack//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "BEGIN:VEVENT",
    `UID:${uidVal}`,
    `DTSTAMP:${dtStamp}`,
    `DTSTART:${dtStart}`,
    `RRULE:${cycleToRRule(sub.cycle)}`,
    `SUMMARY:${summary}`,
    `DESCRIPTION:${description}`,
    "BEGIN:VALARM",
    "ACTION:DISPLAY",
    "DESCRIPTION:Subscription reminder",
    "TRIGGER:-P1D",
    "END:VALARM",
    "END:VEVENT",
    "END:VCALENDAR",
  ].join("\r\n");

  return ics + "\r\n";
}

function toCSV(subs) {
  const headers = ["name", "amount", "currency", "cycle", "nextDue", "category", "notes"];
  const escape = (v) => {
    const s = String(v ?? "");
    if (s.includes('"') || s.includes(",") || s.includes("\n")) {
      return `"${s.replace(/"/g, '""')}"`;
    }
    return s;
  };

  const rows = [
    headers.join(","),
    ...subs.map((s) =>
      headers.map((h) => escape(s[h])).join(",")
    ),
  ];

  return rows.join("\n");
}

/** ---------- UI ---------- **/
const CATEGORY_OPTIONS = [
  "Streaming",
  "Music",
  "Cloud/Storage",
  "Gym/Fitness",
  "Utilities",
  "Education",
  "Software",
  "Games",
  "Other",
];

const CYCLE_OPTIONS = [
  { value: "monthly", label: "Monthly" },
  { value: "yearly", label: "Yearly" },
  { value: "weekly", label: "Weekly" },
  { value: "quarterly", label: "Quarterly" },
];

const CURRENCY_OPTIONS = ["$", "CAD $", "USD $", "₹", "€", "£"];

function badgeForDue(days) {
  if (days < 0) return { text: `${Math.abs(days)}d overdue`, tone: "bad" };
  if (days === 0) return { text: "Due today", tone: "bad" };
  if (days <= 3) return { text: `Due in ${days}d`, tone: "warn" };
  if (days <= 14) return { text: `Due in ${days}d`, tone: "ok" };
  return { text: `Due in ${days}d`, tone: "muted" };
}

export default function App() {
  const [subs, setSubs] = useState(() => {
    const raw = localStorage.getItem(STORAGE_KEY);
    return safeParse(raw, []);
  });

  const [query, setQuery] = useState("");
  const [filterCat, setFilterCat] = useState("All");

  const [form, setForm] = useState({
    name: "",
    amount: "",
    currency: "$",
    cycle: "monthly",
    nextDue: toYMD(new Date()),
    category: "Streaming",
    notes: "",
  });

  const [editingId, setEditingId] = useState(null);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(subs));
  }, [subs]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return subs
      .filter((s) => {
        const matchesQuery =
          !q ||
          s.name.toLowerCase().includes(q) ||
          (s.category || "").toLowerCase().includes(q) ||
          (s.notes || "").toLowerCase().includes(q);

        const matchesCat = filterCat === "All" || s.category === filterCat;
        return matchesQuery && matchesCat;
      })
      .sort((a, b) => {
        // sort by nextDue ascending
        return fromYMD(a.nextDue).getTime() - fromYMD(b.nextDue).getTime();
      });
  }, [subs, query, filterCat]);

  const totals = useMemo(() => {
    let monthly = 0;
    let yearly = 0;
    for (const s of subs) {
      monthly += monthlyEquivalent(s.amount, s.cycle);
      yearly += yearlyEquivalent(s.amount, s.cycle);
    }
    return { monthly, yearly };
  }, [subs]);

  function resetForm() {
    setForm({
      name: "",
      amount: "",
      currency: "$",
      cycle: "monthly",
      nextDue: toYMD(new Date()),
      category: "Streaming",
      notes: "",
    });
    setEditingId(null);
  }

  function onSubmit(e) {
    e.preventDefault();

    const name = form.name.trim();
    const amount = Number(form.amount);

    if (!name) return alert("Please enter a subscription name.");
    if (!Number.isFinite(amount) || amount <= 0) return alert("Please enter a valid amount (> 0).");
    if (!form.nextDue) return alert("Please select a due date.");

    const payload = {
      id: editingId ?? uid(),
      name,
      amount: amount.toFixed(2),
      currency: form.currency,
      cycle: form.cycle,
      nextDue: form.nextDue,
      category: form.category,
      notes: form.notes?.trim() ?? "",
      createdAt: editingId ? undefined : new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    setSubs((prev) => {
      if (editingId) {
        return prev.map((s) => (s.id === editingId ? { ...s, ...payload } : s));
      }
      return [payload, ...prev];
    });

    resetForm();
  }

  function onEdit(sub) {
    setEditingId(sub.id);
    setForm({
      name: sub.name,
      amount: sub.amount,
      currency: sub.currency,
      cycle: sub.cycle,
      nextDue: sub.nextDue,
      category: sub.category || "Other",
      notes: sub.notes || "",
    });
    window.location.hash = "#top";
  }

  function onDelete(id) {
    if (!confirm("Delete this subscription?")) return;
    setSubs((prev) => prev.filter((s) => s.id !== id));
  }

  function onMarkPaid(sub) {
    const next = nextDueYMD(sub.nextDue, sub.cycle);
    setSubs((prev) => prev.map((s) => (s.id === sub.id ? { ...s, nextDue: next, updatedAt: new Date().toISOString() } : s)));
  }

  function exportCSV() {
    const csv = toCSV(subs);
    downloadFile(`subtrack-${toYMD(new Date())}.csv`, csv, "text/csv;charset=utf-8");
  }

  function downloadICS(sub) {
    const ics = makeICS(sub);
    const safeName = sub.name.replace(/[^\w\- ]+/g, "").trim().replace(/\s+/g, "-").toLowerCase() || "subscription";
    downloadFile(`reminder-${safeName}.ics`, ics, "text/calendar;charset=utf-8");
  }

  return (
    <div className="page" id="top">
      <header className="header">
        <div className="nav">
          <div className="brand">
            <div className="logoDot" />
            <div>
              <div className="brandName">SubTrack</div>
              <div className="brandSub">Subscription & spending tracker</div>
            </div>
          </div>

          <div className="navRight">
            <button className="chipBtn" onClick={exportCSV} title="Export all subscriptions to CSV">
              Export CSV
            </button>
            <a className="chipBtn ghost" href="#about">
              About
            </a>
          </div>
        </div>
      </header>

      <main className="container">
        <section className="hero">
          <div className="pill">Stage 1 · LocalStorage · Calendar reminders (.ics)</div>

          <h1>
            Track subscriptions. <span className="accent">Never miss</span> a renewal.
          </h1>

          <p className="sub">
            Add your memberships/subscriptions, see upcoming due dates, estimate monthly spend, and download calendar reminders.
          </p>

          <div className="stats">
            <div className="stat">
              <div className="statNum">{subs.length}</div>
              <div className="statLabel">Active items</div>
            </div>
            <div className="stat">
              <div className="statNum">
                {totals.monthly.toFixed(2)}
              </div>
              <div className="statLabel">Monthly estimate</div>
            </div>
            <div className="stat">
              <div className="statNum">
                {totals.yearly.toFixed(2)}
              </div>
              <div className="statLabel">Yearly estimate</div>
            </div>
          </div>
        </section>

        <div className="grid2">
          <section className="card">
            <div className="cardHead">
              <h2>{editingId ? "Edit subscription" : "Add subscription"}</h2>
              {editingId ? (
                <button className="smallBtn" onClick={resetForm}>
                  Cancel edit
                </button>
              ) : null}
            </div>

            <form className="form" onSubmit={onSubmit}>
              <label>
                Name
                <input
                  value={form.name}
                  onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))}
                  placeholder="Netflix, Spotify, Gym..."
                  required
                />
              </label>

              <div className="row">
                <label>
                  Amount
                  <input
                    value={form.amount}
                    onChange={(e) => setForm((p) => ({ ...p, amount: e.target.value }))}
                    placeholder="e.g. 12.99"
                    inputMode="decimal"
                    required
                  />
                </label>

                <label>
                  Currency
                  <select value={form.currency} onChange={(e) => setForm((p) => ({ ...p, currency: e.target.value }))}>
                    {CURRENCY_OPTIONS.map((c) => (
                      <option key={c} value={c}>{c}</option>
                    ))}
                  </select>
                </label>
              </div>

              <div className="row">
                <label>
                  Billing cycle
                  <select value={form.cycle} onChange={(e) => setForm((p) => ({ ...p, cycle: e.target.value }))}>
                    {CYCLE_OPTIONS.map((c) => (
                      <option key={c.value} value={c.value}>{c.label}</option>
                    ))}
                  </select>
                </label>

                <label>
                  Next due date
                  <input
                    type="date"
                    value={form.nextDue}
                    onChange={(e) => setForm((p) => ({ ...p, nextDue: e.target.value }))}
                    required
                  />
                </label>
              </div>

              <label>
                Category
                <select value={form.category} onChange={(e) => setForm((p) => ({ ...p, category: e.target.value }))}>
                  {CATEGORY_OPTIONS.map((c) => (
                    <option key={c} value={c}>{c}</option>
                  ))}
                </select>
              </label>

              <label>
                Notes (optional)
                <textarea
                  value={form.notes}
                  onChange={(e) => setForm((p) => ({ ...p, notes: e.target.value }))}
                  placeholder="Any extra info (trial ends, cancel link, etc.)"
                  rows={3}
                />
              </label>

              <button className="btn primary" type="submit">
                {editingId ? "Save changes" : "Add subscription"}
              </button>
            </form>
          </section>

          <section className="card">
            <div className="cardHead">
              <h2>Upcoming</h2>
              <div className="filters">
                <input
                  className="search"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search name, category, notes…"
                />
                <select value={filterCat} onChange={(e) => setFilterCat(e.target.value)}>
                  <option value="All">All</option>
                  {CATEGORY_OPTIONS.map((c) => (
                    <option key={c} value={c}>{c}</option>
                  ))}
                </select>
              </div>
            </div>

            {filtered.length === 0 ? (
              <div className="empty">
                <div className="emptyTitle">No subscriptions yet</div>
                <div className="emptyText">Add your first one on the left — it will appear here sorted by due date.</div>
              </div>
            ) : (
              <div className="list">
                {filtered.map((s) => {
                  const d = daysUntil(s.nextDue);
                  const b = badgeForDue(d);
                  return (
                    <article className="item" key={s.id}>
                      <div className="itemTop">
                        <div>
                          <div className="itemName">{s.name}</div>
                          <div className="itemMeta">
                            <span className={`badge ${b.tone}`}>{b.text}</span>
                            <span className="dot" />
                            <span className="metaText">{s.category || "—"}</span>
                            <span className="dot" />
                            <span className="metaText">
                              {s.currency}{Number(s.amount).toFixed(2)} · {s.cycle}
                            </span>
                          </div>
                        </div>

                        <div className="itemAmt">
                          <div className="amtMain">
                            {s.currency}{Number(s.amount).toFixed(2)}
                          </div>
                          <div className="amtSub">
                            ~{monthlyEquivalent(s.amount, s.cycle).toFixed(2)}/mo
                          </div>
                        </div>
                      </div>

                      <div className="itemBottom">
                        <div className="dueLine">
                          Next due: <span className="dueDate">{s.nextDue}</span>
                          {s.notes ? <span className="note"> · {s.notes}</span> : null}
                        </div>

                        <div className="actions">
                          <button className="smallBtn" onClick={() => onMarkPaid(s)} title="Advance next due date">
                            Mark paid
                          </button>
                          <button className="smallBtn" onClick={() => downloadICS(s)} title="Download calendar reminder (.ics)">
                            Add reminder
                          </button>
                          <button className="smallBtn ghost" onClick={() => onEdit(s)}>
                            Edit
                          </button>
                          <button className="smallBtn danger" onClick={() => onDelete(s.id)}>
                            Delete
                          </button>
                        </div>
                      </div>
                    </article>
                  );
                })}
              </div>
            )}
          </section>
        </div>

        <section id="about" className="card">
          <div className="cardHead">
            <h2>How reminders work (Stage 1)</h2>
          </div>
          <p className="aboutText">
            Click <b>Add reminder</b> on any subscription to download an <b>.ics</b> calendar file. Import it into your calendar
            and you’ll get reminders automatically. (Stage 2 can add email reminders with login + a scheduled backend.)
          </p>
        </section>

        <footer className="footer">© {new Date().getFullYear()} Pratik Patel · SubTrack</footer>
      </main>
    </div>
  );
}
