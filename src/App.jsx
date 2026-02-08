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
    if (s.includes('"') || s.includes(",") || s.includes("\n")) return `"${s.replace(/"/g, '""')}"`;
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

  // Toast
  const [toast, setToast] = useState(null); // { text, tone }
  function showToast(text, tone = "ok") {
    setToast({ text, tone });
  }
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 2800);
    return () => clearTimeout(t);
  }, [toast]);

  // Cooldown for magic link
  const [cooldown, setCooldown] = useState(0);
  useEffect(() => {
    if (cooldown <= 0) return;
    const t = setInterval(() => setCooldown((c) => Math.max(0, c - 1)), 1000);
    return () => clearInterval(t);
  }, [cooldown]);

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
    document.documentElement.style.colorScheme = theme;
    localStorage.setItem("subtrack:theme", theme);
  }, [theme]);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(subs));
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

  async function refreshFromDb() {
    if (!session?.user?.id) return;
    const { data, error } = await supabase
      .from("subscriptions")
      .select("*")
      .order("next_due", { ascending: true });

    if (!error) setSubs((data || []).map(dbToUi));
    else showToast("Refresh failed: " + error.message, "bad");
  }

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
        showToast(`Load failed: ${error.message}`, "bad");
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

  async function onSubmit(e) {
    e.preventDefault();

    const name = form.name.trim();
    const amount = Number(form.amount);
    if (!name) return showToast("Please enter a subscription name.", "warn");
    if (!Number.isFinite(amount) || amount <= 0)
      return showToast("Enter a valid amount (> 0).", "warn");

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

      if (error) showToast("Saved locally, but cloud save failed: " + error.message, "warn");
      else await refreshFromDb();
    }

    resetForm();
    showToast(editingId ? "Saved!" : "Added!", "ok");
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
    showToast("Editing item…", "muted");
  }

  async function onDelete(id) {
    if (!confirm("Delete this subscription?")) return;

    setSubs((prev) => prev.filter((s) => s.id !== id));

    if (session?.user?.id) {
      const { error } = await supabase.from("subscriptions").delete().eq("id", id);
      if (error) showToast("Cloud delete failed: " + error.message, "bad");
      else await refreshFromDb();
    }

    showToast("Deleted.", "muted");
  }

  async function onMarkPaid(sub) {
    const next = nextDueYMD(sub.nextDue, sub.cycle);

    setSubs((prev) => prev.map((s) => (s.id === sub.id ? { ...s, nextDue: next } : s)));

    if (session?.user?.id) {
      const { error } = await supabase.from("subscriptions").update({ next_due: next }).eq("id", sub.id);
      if (error) showToast("Cloud update failed: " + error.message, "bad");
      else await refreshFromDb();
    }

    showToast("Marked paid → next due updated.", "ok");
  }

  function exportCSV() {
    const csv = toCSV(subs);
    downloadFile(`subtrack-${toYMD(new Date())}.csv`, csv, "text/csv;charset=utf-8");
    showToast("Exported CSV.", "ok");
  }

  async function signInMagicLink() {
    const e = email.trim();
    setAuthMsg("");

    if (!e) {
      showToast("Please enter your email first.", "warn");
      return;
    }

    if (cooldown > 0) {
      showToast(`Please wait ${cooldown}s before requesting another link.`, "muted");
      return;
    }

    setAuthMsg("Sending magic link…");

    const emailRedirectTo = new URL(import.meta.env.BASE_URL, window.location.origin).toString();

    const { error } = await supabase.auth.signInWithOtp({
      email: e,
      options: { emailRedirectTo },
    });

    if (error) {
      setAuthMsg(error.message);
      showToast(error.message, "bad");
      if (String(error.message || "").toLowerCase().includes("rate")) setCooldown(120);
      return;
    }

    const msg = "✅ Magic link sent — check your email.";
    setAuthMsg(msg);
    showToast(msg, "ok");
    setCooldown(60);
    document.getElementById("signin")?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  async function signOut() {
    await supabase.auth.signOut();

    setSubs([]);
    localStorage.removeItem(STORAGE_KEY);

    setEmail("");
    setAuthMsg("");
    setQuery("");
    setFilterCat("All");
    resetForm();

    showToast("Signed out. Cleared local data.", "muted");
  }

  async function importLocalToCloud() {
    if (!session?.user?.id) return showToast("Sign in first.", "warn");

    if (!confirm("Import your current local subscriptions into your cloud account? (May create duplicates)"))
      return;

    const userId = session.user.id;
    const rows = subs.map((s) => uiToDb(s, userId));

    const { error } = await supabase.from("subscriptions").insert(rows);

    if (error) showToast("Import failed: " + error.message, "bad");
    else {
      showToast("Imported to cloud!", "ok");
      await refreshFromDb();
    }
  }

  const toneClasses = {
    ok: "bg-emerald-500/15 text-emerald-200 border-emerald-400/20 dark:text-emerald-200",
    warn: "bg-amber-500/15 text-amber-200 border-amber-400/20 dark:text-amber-200",
    bad: "bg-rose-500/15 text-rose-200 border-rose-400/20 dark:text-rose-200",
    muted: "bg-white/10 text-white/90 border-white/15 dark:text-white/90",
  };

  const badgeTone = {
    ok: "bg-emerald-500/10 text-emerald-200 border-emerald-400/20",
    warn: "bg-amber-500/10 text-amber-200 border-amber-400/20",
    bad: "bg-rose-500/10 text-rose-200 border-rose-400/20",
    muted: "bg-white/10 text-white/80 border-white/15",
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-950 via-slate-950 to-slate-900 text-white dark:text-white
                    dark:from-slate-950 dark:to-slate-900
                    bg-[radial-gradient(900px_600px_at_14%_12%,rgba(124,58,237,0.18),transparent_60%),radial-gradient(900px_600px_at_86%_22%,rgba(34,211,238,0.12),transparent_58%),radial-gradient(900px_600px_at_66%_88%,rgba(52,211,153,0.09),transparent_55%)]
                    dark:bg-[radial-gradient(900px_600px_at_14%_12%,rgba(124,58,237,0.18),transparent_60%),radial-gradient(900px_600px_at_86%_22%,rgba(34,211,238,0.12),transparent_58%),radial-gradient(900px_600px_at_66%_88%,rgba(52,211,153,0.09),transparent_55%)]
                    "
         style={{
           // Light theme background override:
           ...(theme === "light"
             ? {
                 backgroundImage:
                   "radial-gradient(900px 600px at 14% 12%, rgba(124,58,237,0.10), transparent 60%), radial-gradient(900px 600px at 86% 22%, rgba(34,211,238,0.08), transparent 58%), radial-gradient(900px 600px at 66% 88%, rgba(52,211,153,0.06), transparent 55%), linear-gradient(180deg, #f6f7ff, #ffffff)",
                 color: "#0b1220",
               }
             : {}),
         }}
    >
      {/* Toast */}
      {toast ? (
        <div
          className={`fixed top-4 left-1/2 z-50 -translate-x-1/2 rounded-2xl border px-4 py-3 text-sm shadow-2xl backdrop-blur
          ${toneClasses[toast.tone] || toneClasses.ok}`}
        >
          {toast.text}
        </div>
      ) : null}

      {/* Header */}
      <header
        className={`sticky top-0 z-40 border-b backdrop-blur ${
          theme === "light"
            ? "border-slate-200/60 bg-white/75"
            : "border-white/10 bg-slate-950/40"
        }`}
      >
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 py-4">
          <div className="flex items-center gap-3">
            <div className="h-3 w-3 rounded-full bg-gradient-to-br from-violet-500 via-cyan-400 to-emerald-400 shadow-[0_0_0_8px_rgba(124,58,237,0.12)]" />
            <div className="leading-tight">
              <div className="text-sm font-extrabold tracking-tight" style={{ color: theme === "light" ? "#0b1220" : undefined }}>
                SubTrack
              </div>
              <div className="text-xs opacity-70" style={{ color: theme === "light" ? "rgba(11,18,32,0.65)" : undefined }}>
                Login + Cloud Sync
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-end gap-2">
            <button
              className={`rounded-full border px-3 py-2 text-xs font-semibold transition hover:-translate-y-0.5 hover:shadow-lg
              ${theme === "light"
                ? "border-slate-200 bg-white text-slate-900 hover:shadow-slate-900/10"
                : "border-white/10 bg-white/5 text-white hover:shadow-black/30"}`}
              onClick={() => setTheme((t) => (t === "dark" ? "light" : "dark"))}
              type="button"
            >
              {theme === "dark" ? "Light mode" : "Dark mode"}
            </button>

            <button
              className={`rounded-full border px-3 py-2 text-xs font-semibold transition hover:-translate-y-0.5 hover:shadow-lg
              ${theme === "light"
                ? "border-slate-200 bg-white text-slate-900 hover:shadow-slate-900/10"
                : "border-white/10 bg-white/5 text-white hover:shadow-black/30"}`}
              onClick={exportCSV}
              type="button"
            >
              Export CSV
            </button>

            {session ? (
              <button
                className={`rounded-full border px-3 py-2 text-xs font-semibold transition hover:-translate-y-0.5 hover:shadow-lg
                ${theme === "light"
                  ? "border-slate-200 bg-white text-slate-900 hover:shadow-slate-900/10"
                  : "border-white/10 bg-white/5 text-white hover:shadow-black/30"}`}
                onClick={signOut}
                type="button"
              >
                Sign out
              </button>
            ) : (
              <a
                className={`rounded-full border px-3 py-2 text-xs font-semibold transition hover:-translate-y-0.5 hover:shadow-lg
                ${theme === "light"
                  ? "border-slate-200 bg-white text-slate-900 hover:shadow-slate-900/10"
                  : "border-white/10 bg-white/5 text-white hover:shadow-black/30"}`}
                href="#signin"
              >
                Sign in
              </a>
            )}
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 pb-14 pt-8">
        {/* Hero */}
        <section>
          <div
            className={`inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-semibold shadow-sm
            ${theme === "light"
              ? "border-slate-200 bg-white text-slate-800"
              : "border-white/10 bg-white/5 text-white/80"}`}
          >
            {session ? "Signed in · Sync enabled" : "Signed out · Local only"}
          </div>

          <h1 className="mt-4 text-3xl font-extrabold tracking-tight sm:text-5xl">
            Subscriptions, organized.{" "}
            <span className="bg-gradient-to-r from-violet-500 via-cyan-400 to-emerald-400 bg-clip-text text-transparent">
              Synced everywhere.
            </span>
          </h1>

          <p className="mt-3 max-w-2xl text-sm leading-7 opacity-80 sm:text-base">
            Add memberships, track due dates, and estimate spend. Magic link login lets you open this on any PC.
          </p>

          {/* Stats */}
          <div className="mt-6 grid gap-3 sm:grid-cols-3">
            {[
              { label: "Items", value: subs.length },
              { label: "Monthly estimate", value: totals.monthly.toFixed(2) },
              { label: "Yearly estimate", value: totals.yearly.toFixed(2) },
            ].map((x) => (
              <div
                key={x.label}
                className={`rounded-2xl border p-4 shadow-sm transition hover:-translate-y-0.5 hover:shadow-xl
                ${theme === "light"
                  ? "border-slate-200 bg-white/80 hover:shadow-slate-900/10"
                  : "border-white/10 bg-white/5 hover:shadow-black/35"}`}
              >
                <div className="text-xl font-bold tracking-tight">{x.value}</div>
                <div className="mt-1 text-xs opacity-65">{x.label}</div>
              </div>
            ))}
          </div>
        </section>

        {/* Auth card */}
        {!session ? (
          <section
            id="signin"
            className={`mt-6 rounded-3xl border p-5 shadow-xl
            ${theme === "light"
              ? "border-slate-200 bg-white/85 shadow-slate-900/10"
              : "border-white/10 bg-white/5 shadow-black/35"}`}
          >
            <div className="flex items-center justify-between gap-2">
              <h2 className="text-sm font-semibold">Sign in to sync</h2>
            </div>

            <div className="mt-4 grid gap-3">
              <label className="grid gap-2 text-xs font-semibold opacity-70">
                Email
                <input
                  className={`w-full rounded-2xl border px-4 py-3 text-sm outline-none transition focus:ring-4
                  ${theme === "light"
                    ? "border-slate-200 bg-white text-slate-900 placeholder:text-slate-400 focus:ring-cyan-200"
                    : "border-white/10 bg-slate-950/30 text-white placeholder:text-white/40 focus:ring-cyan-500/20"}`}
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@example.com"
                />
              </label>

              <button
                className={`inline-flex items-center justify-center rounded-2xl px-4 py-3 text-sm font-semibold transition
                ${cooldown > 0 ? "opacity-60" : "hover:-translate-y-0.5 hover:shadow-xl"}
                ${theme === "light"
                  ? "border border-slate-200 bg-gradient-to-r from-violet-500/20 via-cyan-400/20 to-emerald-400/20 text-slate-900 hover:shadow-slate-900/10"
                  : "border border-white/10 bg-gradient-to-r from-violet-500/20 via-cyan-400/20 to-emerald-400/15 text-white hover:shadow-black/35"}`}
                onClick={signInMagicLink}
                type="button"
                disabled={cooldown > 0}
              >
                {cooldown > 0 ? `Wait ${cooldown}s` : "Send magic link"}
              </button>

              {authMsg ? (
                <p className="text-sm opacity-80">{authMsg}</p>
              ) : null}
            </div>
          </section>
        ) : (
          <section
            className={`mt-6 rounded-3xl border p-5 shadow-xl
            ${theme === "light"
              ? "border-slate-200 bg-white/85 shadow-slate-900/10"
              : "border-white/10 bg-white/5 shadow-black/35"}`}
          >
            <div className="flex items-center justify-between gap-2">
              <h2 className="text-sm font-semibold">Sync tools</h2>
              <button
                className={`rounded-full border px-3 py-2 text-xs font-semibold transition hover:-translate-y-0.5 hover:shadow-lg
                ${theme === "light"
                  ? "border-slate-200 bg-white text-slate-900 hover:shadow-slate-900/10"
                  : "border-white/10 bg-white/5 text-white hover:shadow-black/30"}`}
                onClick={importLocalToCloud}
                type="button"
              >
                Import local → cloud
              </button>
            </div>

            <p className="mt-3 text-sm opacity-80">
              You’re signed in as <b>{session.user.email}</b>. Your subscriptions are stored in Supabase and will appear on any device.
              {loading ? " (Loading…)" : ""}
            </p>
          </section>
        )}

        {/* Grid */}
        <div className="mt-6 grid gap-4 lg:grid-cols-[1.02fr_1.5fr]">
          {/* Add/Edit */}
          <section
            className={`rounded-3xl border p-5 shadow-xl
            ${theme === "light"
              ? "border-slate-200 bg-white/85 shadow-slate-900/10"
              : "border-white/10 bg-white/5 shadow-black/35"}`}
          >
            <div className="flex items-center justify-between gap-2">
              <h2 className="text-sm font-semibold">{editingId ? "Edit subscription" : "Add subscription"}</h2>
              {editingId ? (
                <button
                  className={`rounded-full border px-3 py-2 text-xs font-semibold transition hover:-translate-y-0.5 hover:shadow-lg
                  ${theme === "light"
                    ? "border-slate-200 bg-white text-slate-900 hover:shadow-slate-900/10"
                    : "border-white/10 bg-white/5 text-white hover:shadow-black/30"}`}
                  onClick={resetForm}
                  type="button"
                >
                  Cancel
                </button>
              ) : null}
            </div>

            <form className="mt-4 grid gap-3" onSubmit={onSubmit}>
              <label className="grid gap-2 text-xs font-semibold opacity-70">
                Name
                <input
                  className={`w-full rounded-2xl border px-4 py-3 text-sm outline-none transition focus:ring-4
                  ${theme === "light"
                    ? "border-slate-200 bg-white text-slate-900 placeholder:text-slate-400 focus:ring-cyan-200"
                    : "border-white/10 bg-slate-950/30 text-white placeholder:text-white/40 focus:ring-cyan-500/20"}`}
                  value={form.name}
                  onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))}
                  placeholder="Netflix, Spotify, Gym..."
                  required
                />
              </label>

              <div className="grid gap-3 sm:grid-cols-2">
                <label className="grid gap-2 text-xs font-semibold opacity-70">
                  Amount
                  <input
                    className={`w-full rounded-2xl border px-4 py-3 text-sm outline-none transition focus:ring-4
                    ${theme === "light"
                      ? "border-slate-200 bg-white text-slate-900 placeholder:text-slate-400 focus:ring-cyan-200"
                      : "border-white/10 bg-slate-950/30 text-white placeholder:text-white/40 focus:ring-cyan-500/20"}`}
                    value={form.amount}
                    onChange={(e) => setForm((p) => ({ ...p, amount: e.target.value }))}
                    placeholder="e.g. 12.99"
                    inputMode="decimal"
                    required
                  />
                </label>

                <label className="grid gap-2 text-xs font-semibold opacity-70">
                  Currency
                  <select
                    className={`w-full rounded-2xl border px-4 py-3 text-sm outline-none transition focus:ring-4
                    ${theme === "light"
                      ? "border-slate-200 bg-white text-slate-900 focus:ring-cyan-200"
                      : "border-white/10 bg-slate-950/30 text-white focus:ring-cyan-500/20"}`}
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

              <div className="grid gap-3 sm:grid-cols-2">
                <label className="grid gap-2 text-xs font-semibold opacity-70">
                  Billing cycle
                  <select
                    className={`w-full rounded-2xl border px-4 py-3 text-sm outline-none transition focus:ring-4
                    ${theme === "light"
                      ? "border-slate-200 bg-white text-slate-900 focus:ring-cyan-200"
                      : "border-white/10 bg-slate-950/30 text-white focus:ring-cyan-500/20"}`}
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

                <label className="grid gap-2 text-xs font-semibold opacity-70">
                  Next due date
                  <input
                    type="date"
                    className={`w-full rounded-2xl border px-4 py-3 text-sm outline-none transition focus:ring-4
                    ${theme === "light"
                      ? "border-slate-200 bg-white text-slate-900 focus:ring-cyan-200"
                      : "border-white/10 bg-slate-950/30 text-white focus:ring-cyan-500/20"}`}
                    value={form.nextDue}
                    onChange={(e) => setForm((p) => ({ ...p, nextDue: e.target.value }))}
                    required
                  />
                </label>
              </div>

              <label className="grid gap-2 text-xs font-semibold opacity-70">
                Category
                <select
                  className={`w-full rounded-2xl border px-4 py-3 text-sm outline-none transition focus:ring-4
                  ${theme === "light"
                    ? "border-slate-200 bg-white text-slate-900 focus:ring-cyan-200"
                    : "border-white/10 bg-slate-950/30 text-white focus:ring-cyan-500/20"}`}
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

              <label className="grid gap-2 text-xs font-semibold opacity-70">
                Notes (optional)
                <textarea
                  rows={3}
                  className={`w-full rounded-2xl border px-4 py-3 text-sm outline-none transition focus:ring-4
                  ${theme === "light"
                    ? "border-slate-200 bg-white text-slate-900 placeholder:text-slate-400 focus:ring-cyan-200"
                    : "border-white/10 bg-slate-950/30 text-white placeholder:text-white/40 focus:ring-cyan-500/20"}`}
                  value={form.notes}
                  onChange={(e) => setForm((p) => ({ ...p, notes: e.target.value }))}
                  placeholder="Trial ends, cancel link, etc."
                />
              </label>

              <button
                className={`inline-flex items-center justify-center rounded-2xl px-4 py-3 text-sm font-semibold transition hover:-translate-y-0.5 hover:shadow-xl
                ${theme === "light"
                  ? "border border-slate-200 bg-gradient-to-r from-violet-500/20 via-cyan-400/20 to-emerald-400/20 text-slate-900 hover:shadow-slate-900/10"
                  : "border border-white/10 bg-gradient-to-r from-violet-500/20 via-cyan-400/20 to-emerald-400/15 text-white hover:shadow-black/35"}`}
                type="submit"
              >
                {editingId ? "Save changes" : "Add subscription"}
              </button>
            </form>
          </section>

          {/* Upcoming */}
          <section
            className={`rounded-3xl border p-5 shadow-xl
            ${theme === "light"
              ? "border-slate-200 bg-white/85 shadow-slate-900/10"
              : "border-white/10 bg-white/5 shadow-black/35"}`}
          >
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <h2 className="text-sm font-semibold">Upcoming</h2>

              <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                <input
                  className={`w-full rounded-2xl border px-4 py-3 text-sm outline-none transition focus:ring-4 sm:w-80
                  ${theme === "light"
                    ? "border-slate-200 bg-white text-slate-900 placeholder:text-slate-400 focus:ring-cyan-200"
                    : "border-white/10 bg-slate-950/30 text-white placeholder:text-white/40 focus:ring-cyan-500/20"}`}
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search name, category, notes…"
                />

                <select
                  className={`w-full rounded-2xl border px-4 py-3 text-sm outline-none transition focus:ring-4 sm:w-44
                  ${theme === "light"
                    ? "border-slate-200 bg-white text-slate-900 focus:ring-cyan-200"
                    : "border-white/10 bg-slate-950/30 text-white focus:ring-cyan-500/20"}`}
                  value={filterCat}
                  onChange={(e) => setFilterCat(e.target.value)}
                >
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
              <div
                className={`mt-4 rounded-2xl border border-dashed p-4 text-sm opacity-80
                ${theme === "light" ? "border-slate-200 bg-white" : "border-white/15 bg-white/5"}`}
              >
                <div className="font-semibold">No subscriptions yet</div>
                <div className="mt-1">Add your first one — it will appear here sorted by due date.</div>
              </div>
            ) : (
              <div className="mt-4 grid gap-3">
                {filtered.map((s) => {
                  const d = daysUntil(s.nextDue);
                  const b = badgeForDue(d);

                  return (
                    <article
                      key={s.id}
                      className={`rounded-2xl border p-4 transition hover:-translate-y-0.5 hover:shadow-xl
                      ${theme === "light"
                        ? "border-slate-200 bg-white hover:shadow-slate-900/10"
                        : "border-white/10 bg-white/5 hover:shadow-black/35"}`}
                    >
                      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                        <div>
                          <div className="text-sm font-semibold">{s.name}</div>

                          <div className="mt-2 flex flex-wrap items-center gap-2 text-xs opacity-90">
                            <span
                              className={`inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-semibold
                              ${badgeTone[b.tone] || badgeTone.ok}`}
                            >
                              {b.text}
                            </span>

                            <span className="opacity-60">•</span>
                            <span className="opacity-80">{s.category || "—"}</span>

                            <span className="opacity-60">•</span>
                            <span className="opacity-80">
                              {s.currency}
                              {Number(s.amount).toFixed(2)} · {s.cycle}
                            </span>
                          </div>
                        </div>

                        <div className="text-left sm:text-right">
                          <div className="text-sm font-semibold">
                            {s.currency}
                            {Number(s.amount).toFixed(2)}
                          </div>
                          <div className="mt-1 text-xs opacity-70">
                            ~{monthlyEquivalent(s.amount, s.cycle).toFixed(2)}/mo
                          </div>
                        </div>
                      </div>

                      <div className="mt-3 flex flex-col gap-3 border-t pt-3 sm:flex-row sm:items-center sm:justify-between"
                           style={{
                             borderColor: theme === "light" ? "rgba(148,163,184,0.35)" : "rgba(255,255,255,0.10)",
                           }}
                      >
                        <div className="text-sm opacity-80">
                          Next due: <span className="font-semibold opacity-100">{s.nextDue}</span>
                          {s.notes ? <span className="opacity-70"> · {s.notes}</span> : null}
                        </div>

                        <div className="flex flex-wrap items-center gap-2 sm:justify-end">
                          <button
                            className={`rounded-full border px-3 py-2 text-xs font-semibold transition hover:-translate-y-0.5 hover:shadow-lg
                            ${theme === "light"
                              ? "border-slate-200 bg-white text-slate-900 hover:shadow-slate-900/10"
                              : "border-white/10 bg-white/5 text-white hover:shadow-black/30"}`}
                            type="button"
                            onClick={() => onMarkPaid(s)}
                          >
                            Mark paid
                          </button>
                          <button
                            className={`rounded-full border px-3 py-2 text-xs font-semibold transition hover:-translate-y-0.5 hover:shadow-lg
                            ${theme === "light"
                              ? "border-slate-200 bg-white text-slate-900 hover:shadow-slate-900/10"
                              : "border-white/10 bg-white/5 text-white hover:shadow-black/30"}`}
                            type="button"
                            onClick={() => onEdit(s)}
                          >
                            Edit
                          </button>
                          <button
                            className={`rounded-full border px-3 py-2 text-xs font-semibold transition hover:-translate-y-0.5 hover:shadow-lg
                            ${theme === "light"
                              ? "border-rose-200 bg-rose-50 text-rose-700 hover:shadow-rose-900/10"
                              : "border-rose-400/20 bg-rose-500/10 text-rose-200 hover:shadow-black/30"}`}
                            type="button"
                            onClick={() => onDelete(s.id)}
                          >
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

        <footer className="mt-8 text-center text-xs opacity-60">
          © {new Date().getFullYear()} Pratik Patel · SubTrack
        </footer>
      </main>
    </div>
  );
}
  