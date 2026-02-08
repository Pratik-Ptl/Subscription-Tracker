import { useEffect, useMemo, useState } from "react";
import "./App.css";
import { supabase } from "./supabaseClient";

/** ---------- Helpers ---------- **/
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

function toYMD(date) {
  const d = new Date(date);
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

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
  } else if (cycle === "monthly") next = addMonthsClamped(current, 1);
  else if (cycle === "quarterly") next = addMonthsClamped(current, 3);
  else if (cycle === "yearly") next = addMonthsClamped(current, 12);
  else next = addMonthsClamped(current, 1);
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

function toCSV(subs) {
  const headers = ["name", "amount", "currency", "cycle", "nextDue", "category", "notes"];
  const escape = (v) => {
    const s = String(v ?? "");
    if (s.includes('"') || s.includes(",") || s.includes("\n")) {
      return `"${s.replace(/"/g, '""')}"`;
    }
    return s;
  };
  const rows = [headers.join(","), ...subs.map((s) => headers.map((h) => escape(s[h])).join(","))];
  return rows.join("\n");
}

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

/** ---------- Supabase mapping ---------- **/
function dbToUi(row) {
  return {
    id: row.id,
    name: row.name,
    amount: String(row.amount),
    currency: row.currency,
    cycle: row.cycle,
    nextDue: row.next_due,
    category: row.category || "Other",
    notes: row.notes || "",
  };
}

function uiToDb(sub, userId) {
  return {
    id: sub.id,
    user_id: userId,
    name: sub.name,
    amount: Number(sub.amount),
    currency: sub.currency,
    cycle: sub.cycle,
    next_due: sub.nextDue,
    category: sub.category,
    notes: sub.notes || null,
  };
}

export default function App() {
  // Theme
  const [theme, setTheme] = useState(() => {
    const saved = localStorage.getItem("subtrack:theme");
    if (saved === "light" || saved === "dark") return saved;
    const prefersDark =
      window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches;
    return prefersDark ? "dark" : "light";
  });

  // Auth
  const [session, setSession] = useState(null);
  const [email, setEmail] = useState("");
  const [authMsg, setAuthMsg] = useState("");

  // Data
  const [subs, setSubs] = useState(() => safeParse(localStorage.getItem(STORAGE_KEY), []));
  const [loading, setLoading] = useState(false);

  // UI
  const [query, setQuery] = useState("");
  const [filterCat, setFilterCat] = useState("All");
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState({
    name: "",
    amount: "",
    currency: "$",
    cycle: "monthly",
    nextDue: toYMD(new Date()),
    category: "Streaming",
    notes: "",
  });

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    localStorage.setItem("subtrack:theme", theme);
  }, [theme]);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(subs));
  }, [subs]);

  // session
  useEffect(() => {
    let mounted = true;

    supabase.auth.getSession().then(({ data }) => {
      if (!mounted) return;
      setSession(data.session || null);
    });

    const { data: sub } = supabase.auth.onAuthStateChange((_event, newSession) => {
      setSession(newSession || null);
    });

    return () => {
      mounted = false;
      sub?.subscription?.unsubscribe?.();
    };
  }, []);

  // load from DB when logged in
  useEffect(() => {
    if (!session?.user?.id) return;

    (async () => {
      setLoading(true);
      const { data, error } = await supabase
        .from("subscriptions")
        .select("*")
        .order("next_due", { ascending: true });

      if (error) {
        setAuthMsg(`Load failed: ${error.message}`);
        setLoading(false);
        return;
      }

      setSubs((data || []).map(dbToUi));
      setLoading(false);
    })();
  }, [session?.user?.id]);

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
      .sort((a, b) => fromYMD(a.nextDue).getTime() - fromYMD(b.nextDue).getTime());
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

  async function refreshFromDb() {
    if (!session?.user?.id) return;
    const { data, error } = await supabase
      .from("subscriptions")
      .select("*")
      .order("next_due", { ascending: true });
    if (!error) setSubs((data || []).map(dbToUi));
  }

  async function onSubmit(e) {
    e.preventDefault();

    const name = form.name.trim();
    const amount = Number(form.amount);
    if (!name) return alert("Please enter a subscription name.");
    if (!Number.isFinite(amount) || amount <= 0) return alert("Please enter a valid amount (> 0).");

    const payload = {
      id: editingId ?? uid(),
      name,
      amount: amount.toFixed(2),
      currency: form.currency,
      cycle: form.cycle,
      nextDue: form.nextDue,
      category: form.category,
      notes: form.notes?.trim() ?? "",
    };

    setSubs((prev) => {
      if (editingId) return prev.map((s) => (s.id === editingId ? { ...s, ...payload } : s));
      return [payload, ...prev];
    });

    if (session?.user?.id) {
      const { error } = await supabase
        .from("subscriptions")
        .upsert(uiToDb(payload, session.user.id), { onConflict: "id" });

      if (error) {
        alert("Saved locally, but cloud save failed: " + error.message);
      } else {
        await refreshFromDb();
      }
    }

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

  async function onDelete(id) {
    if (!confirm("Delete this subscription?")) return;

    setSubs((prev) => prev.filter((s) => s.id !== id));

    if (session?.user?.id) {
      const { error } = await supabase.from("subscriptions").delete().eq("id", id);
      if (error) alert("Cloud delete failed: " + error.message);
      else await refreshFromDb();
    }
  }

  async function onMarkPaid(sub) {
    const next = nextDueYMD(sub.nextDue, sub.cycle);

    setSubs((prev) => prev.map((s) => (s.id === sub.id ? { ...s, nextDue: next } : s)));

    if (session?.user?.id) {
      const { error } = await supabase
        .from("subscriptions")
        .update({ next_due: next })
        .eq("id", sub.id);

      if (error) alert("Cloud update failed: " + error.message);
      else await refreshFromDb();
    }
  }

  function exportCSV() {
    const csv = toCSV(subs);
    downloadFile(`subtrack-${toYMD(new Date())}.csv`, csv, "text/csv;charset=utf-8");
  }

  async function signInMagicLink() {
    setAuthMsg("");
    const e = email.trim();
    if (!e) return;

    const emailRedirectTo = new URL(import.meta.env.BASE_URL, window.location.origin).toString();

await supabase.auth.signInWithOtp({
  email: e,
  options: { emailRedirectTo },
});


    if (error) setAuthMsg(error.message);
    else setAuthMsg("✅ Check your email for the sign-in link.");
  }

  async function signOut() {
    await supabase.auth.signOut();
    setAuthMsg("");
  }

  async function importLocalToCloud() {
    if (!session?.user?.id) return alert("Sign in first.");
    if (
      !confirm(
        "Import your current local subscriptions into your cloud account? (May create duplicates)"
      )
    )
      return;

    const userId = session.user.id;
    const rows = subs.map((s) => uiToDb(s, userId));
    const { error } = await supabase.from("subscriptions").insert(rows);

    if (error) alert("Import failed: " + error.message);
    else {
      alert("Imported!");
      await refreshFromDb();
    }
  }

  return (
    <div className="page" id="top">
      <header className="header">
        <div className="nav">
          <div className="brand">
            <div className="logoDot" />
            <div>
              <div className="brandName">SubTrack</div>
              <div className="brandSub">Stage 2 · Login + Cloud Sync</div>
            </div>
          </div>

          <div className="navRight">
            <button
              className="chipBtn ghost"
              onClick={() => setTheme((t) => (t === "dark" ? "light" : "dark"))}
              title="Toggle theme"
            >
              {theme === "dark" ? "Light mode" : "Dark mode"}
            </button>

            <button className="chipBtn" onClick={exportCSV}>
              Export CSV
            </button>

            {session ? (
              <button className="chipBtn ghost" onClick={signOut}>
                Sign out
              </button>
            ) : (
              <a className="chipBtn ghost" href="#signin">
                Sign in
              </a>
            )}
          </div>
        </div>
      </header>

      <main className="container">
        <section className="hero">
          <div className="pill">
            {session ? "Signed in · Sync enabled" : "Local mode · Sign in to sync across devices"}
          </div>

          <h1>
            Subscriptions, organized. <span className="accent">Synced everywhere.</span>
          </h1>

          <p className="sub">
            Add memberships, track due dates, and estimate spend. Stage 2 adds login + cloud storage so your app works on any PC.
          </p>

          <div className="stats">
            <div className="stat">
              <div className="statNum">{subs.length}</div>
              <div className="statLabel">Items</div>
            </div>
            <div className="stat">
              <div className="statNum">{totals.monthly.toFixed(2)}</div>
              <div className="statLabel">Monthly estimate</div>
            </div>
            <div className="stat">
              <div className="statNum">{totals.yearly.toFixed(2)}</div>
              <div className="statLabel">Yearly estimate</div>
            </div>
          </div>
        </section>

        {!session ? (
          <section className="card" id="signin" style={{ marginTop: 16 }}>
            <div className="cardHead">
              <h2>Sign in to sync</h2>
            </div>

            <div className="form">
              <label>
                Email
                <input
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@example.com"
                />
              </label>

              <button className="btn primary" onClick={signInMagicLink}>
                Send magic link
              </button>

              {authMsg ? <p className="aboutText" style={{ margin: 0 }}>{authMsg}</p> : null}
            </div>
          </section>
        ) : (
          <section className="card" style={{ marginTop: 16 }}>
            <div className="cardHead">
              <h2>Sync tools</h2>
              <button className="smallBtn" onClick={importLocalToCloud}>
                Import local → cloud
              </button>
            </div>
            <p className="aboutText">
              You’re signed in as <b>{session.user.email}</b>. Your subscriptions are stored in Supabase and will appear on any device when you log in.
              {loading ? " (Loading…)" : ""}
            </p>
          </section>
        )}

        <div className="grid2" style={{ marginTop: 16 }}>
          <section className="card">
            <div className="cardHead">
              <h2>{editingId ? "Edit subscription" : "Add subscription"}</h2>
              {editingId ? (
                <button className="smallBtn ghost" onClick={resetForm}>
                  Cancel
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
                  <select
                    value={form.currency}
                    onChange={(e) => setForm((p) => ({ ...p, currency: e.target.value }))}
                  >
                    {CURRENCY_OPTIONS.map((c) => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                  </select>
                </label>
              </div>

              <div className="row">
                <label>
                  Billing cycle
                  <select
                    value={form.cycle}
                    onChange={(e) => setForm((p) => ({ ...p, cycle: e.target.value }))}
                  >
                    {CYCLE_OPTIONS.map((c) => (
                      <option key={c.value} value={c.value}>
                        {c.label}
                      </option>
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
                <select
                  value={form.category}
                  onChange={(e) => setForm((p) => ({ ...p, category: e.target.value }))}
                >
                  {CATEGORY_OPTIONS.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              </label>

              <label>
                Notes (optional)
                <textarea
                  value={form.notes}
                  onChange={(e) => setForm((p) => ({ ...p, notes: e.target.value }))}
                  placeholder="Trial ends, cancel link, etc."
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
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {filtered.length === 0 ? (
              <div className="empty">
                <div className="emptyTitle">No subscriptions yet</div>
                <div className="emptyText">Add your first one — it will appear here sorted by due date.</div>
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
                              {s.currency}
                              {Number(s.amount).toFixed(2)} · {s.cycle}
                            </span>
                          </div>
                        </div>

                        <div className="itemAmt">
                          <div className="amtMain">
                            {s.currency}
                            {Number(s.amount).toFixed(2)}
                          </div>
                          <div className="amtSub">~{monthlyEquivalent(s.amount, s.cycle).toFixed(2)}/mo</div>
                        </div>
                      </div>

                      <div className="itemBottom">
                        <div className="dueLine">
                          Next due: <span className="dueDate">{s.nextDue}</span>
                          {s.notes ? <span className="note"> · {s.notes}</span> : null}
                        </div>

                        <div className="actions">
                          <button className="smallBtn" onClick={() => onMarkPaid(s)}>
                            Mark paid
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

        <footer className="footer">© {new Date().getFullYear()} Pratik Patel · SubTrack</footer>
      </main>
    </div>
  );
}
