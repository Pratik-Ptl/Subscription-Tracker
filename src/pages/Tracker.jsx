// src/pages/Tracker.jsx
import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { supabase } from "../supabaseClient";

/** -----------------------
 * Storage keys
 * ---------------------- */
const GUEST_SESSION_KEY = "subtrack:guest:v1"; // sessionStorage (clears when tab closes)
const GUEST_EXPORT_KEY = "subtrack:guestExport"; // localStorage (temporary handoff to login/signup)
const GUEST_PENDING_IMPORT_KEY = "subtrack:guestPendingImport"; // localStorage flag

/** -----------------------
 * Helpers
 * ---------------------- */
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
    const [y, m, d] = String(ymd).split("-").map(Number);
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

function badgeForDue(days) {
    if (days < 0) return { text: `${Math.abs(days)}d overdue`, tone: "bad" };
    if (days === 0) return { text: "Due today", tone: "bad" };
    if (days <= 3) return { text: `Due in ${days}d`, tone: "warn" };
    if (days <= 14) return { text: `Due in ${days}d`, tone: "ok" };
    return { text: `Due in ${days}d`, tone: "muted" };
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

/** -----------------------
 * Supabase mapping
 * ---------------------- */
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

function genderEmoji(g) {
    if (g === "female") return "👩";
    if (g === "male") return "👨";
    return "🧑";
}


/** -----------------------
 * Component
 * ---------------------- */
export default function Tracker({ session, theme, setTheme, isGuest, exitGuest }) {
    const nav = useNavigate();
    const light = theme === "light";

    // ✅ reactive pendingImport (so UI can update when localStorage changes)
    const [pendingImport, setPendingImport] = useState(
        () => localStorage.getItem(GUEST_PENDING_IMPORT_KEY) === "1"
    );
    const [importing, setImporting] = useState(false);


    // prevent import twice
    const importRanRef = useRef(false);

    // Toast
    const [toast, setToast] = useState(null); // { text, tone }
    function showToast(text, tone = "ok") {
        setToast({ text, tone });
    }
    useEffect(() => {
        if (!toast) return;
        const t = setTimeout(() => setToast(null), 2600);
        return () => clearTimeout(t);
    }, [toast]);

    const bg = useMemo(() => {
        return light
            ? "radial-gradient(900px 600px at 14% 12%, rgba(124,58,237,0.10), transparent 60%), radial-gradient(900px 600px at 86% 22%, rgba(34,211,238,0.08), transparent 58%), radial-gradient(900px 600px at 66% 88%, rgba(52,211,153,0.06), transparent 55%), linear-gradient(180deg, #f6f7ff, #ffffff)"
            : "radial-gradient(900px 600px at 14% 12%, rgba(124,58,237,0.18), transparent 60%), radial-gradient(900px 600px at 86% 22%, rgba(34,211,238,0.12), transparent 58%), radial-gradient(900px 600px at 66% 88%, rgba(52,211,153,0.09), transparent 55%), linear-gradient(180deg, #020617, #0b1220)";
    }, [light]);

    // Profile (only if logged in)
    const [profile, setProfile] = useState(null);

    // Data
    const [subs, setSubs] = useState(() => {
        if (isGuest) return safeParse(sessionStorage.getItem(GUEST_SESSION_KEY), []);
        return [];
    });

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

    // Profile menu
    const [menuOpen, setMenuOpen] = useState(false);
    const menuRef = useRef(null);

    useEffect(() => {
        function onDoc(e) {
            if (!menuRef.current) return;
            if (!menuRef.current.contains(e.target)) setMenuOpen(false);
        }
        document.addEventListener("mousedown", onDoc);
        return () => document.removeEventListener("mousedown", onDoc);
    }, []);

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

    // Persist guest subs (sessionStorage)
    useEffect(() => {
        if (!isGuest) return;
        sessionStorage.setItem(GUEST_SESSION_KEY, JSON.stringify(subs));
    }, [subs, isGuest]);

    // Load profile + subscriptions from DB when logged in
    useEffect(() => {
        if (!session?.user?.id) return;

        (async () => {
            setLoading(true);

            // profile
            const p = await supabase.from("profiles").select("*").eq("id", session.user.id).single();
            if (!p.error) setProfile(p.data || null);

            // subs
            const { data, error } = await supabase
                .from("subscriptions")
                .select("*")
                .order("next_due", { ascending: true });

            if (error) {
                showToast("Load failed: " + error.message, "bad");
                setLoading(false);
                return;
            }

            setSubs((data || []).map(dbToUi));
            setLoading(false);
        })();
    }, [session?.user?.id]);

    async function refreshFromDb() {
        if (!session?.user?.id) return;
        const { data, error } = await supabase
            .from("subscriptions")
            .select("*")
            .order("next_due", { ascending: true });

        if (error) showToast("Refresh failed: " + error.message, "bad");
        else setSubs((data || []).map(dbToUi));
    }

    // ✅ Auto-import guest data after login (if pending)
    useEffect(() => {
  if (!session?.user?.id) return;

  (async () => {
    const shouldImport = localStorage.getItem(GUEST_PENDING_IMPORT_KEY) === "1";
    if (!shouldImport) return;

    setImporting(true);

    const exported = safeParse(localStorage.getItem(GUEST_EXPORT_KEY), []);
    if (!Array.isArray(exported) || exported.length === 0) {
      localStorage.removeItem(GUEST_PENDING_IMPORT_KEY);
      localStorage.removeItem(GUEST_EXPORT_KEY);
      setImporting(false);
      return;
    }

    try {
      const userId = session.user.id;
      const rows = exported.map((s) => uiToDb(s, userId));

      const { error } = await supabase
        .from("subscriptions")
        .upsert(rows, { onConflict: "id" });

      if (error) {
        showToast("Import failed: " + error.message, "bad");
        setImporting(false);
        return;
      }

      localStorage.removeItem(GUEST_PENDING_IMPORT_KEY);
      localStorage.removeItem(GUEST_EXPORT_KEY);
      try { sessionStorage.removeItem(GUEST_SESSION_KEY); } catch {}

      showToast("✅ Imported your guest data into your account!", "ok");
      await refreshFromDb();
    } catch {
      showToast("Import failed.", "bad");
    } finally {
      setImporting(false);
    }
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
        if (!Number.isFinite(amount) || amount <= 0) return showToast("Enter a valid amount (> 0).", "warn");

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

        // If logged in, save to DB
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
        showToast("Editing…", "muted");
        window.scrollTo({ top: 0, behavior: "smooth" });
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

    async function signOut() {
        await supabase.auth.signOut();
        showToast("Signed out.", "muted");
        nav("/login", { replace: true });
    }

    // ✅ Guest -> login/signup with “save my data”
    function goAuth(path) {
        localStorage.setItem(GUEST_EXPORT_KEY, JSON.stringify(subs));
        localStorage.setItem(GUEST_PENDING_IMPORT_KEY, "1");
        setPendingImport(true);
        setMenuOpen(false);
        nav(`${path}?fromGuest=1`, { replace: false });
    }

    const displayName =
        session && profile
            ? `${profile.first_name || ""} ${profile.last_name || ""}`.trim() || session.user.email
            : isGuest
                ? "Guest"
                : "—";

    const avatarGlyph =
        session && profile
            ? (profile.first_name?.[0] || session.user.email?.[0] || "U").toUpperCase()
            : isGuest
                ? "G"
                : "U";

    return (
        <div className="min-h-screen" style={{ backgroundImage: bg, color: light ? "#0b1220" : "white" }}>
            {toast ? (
                <div
                    className="fixed top-4 left-1/2 z-50 -translate-x-1/2 rounded-2xl border px-4 py-3 text-sm shadow-2xl backdrop-blur"
                    style={{
                        borderColor: light ? "rgba(15,23,42,0.12)" : "rgba(255,255,255,0.12)",
                        background: light ? "rgba(255,255,255,0.88)" : "rgba(255,255,255,0.10)",
                    }}
                >
                    {toast.text}
                </div>
            ) : null}

            {/* Header */}
            <header
                className="sticky top-0 z-40 border-b backdrop-blur"
                style={{
                    borderColor: light ? "rgba(15,23,42,0.10)" : "rgba(255,255,255,0.10)",
                    background: light ? "rgba(255,255,255,0.78)" : "rgba(2,6,23,0.45)",
                }}
            >
                <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 py-4">
                    <div className="flex items-center gap-3">
                        <div className="h-3 w-3 rounded-full bg-gradient-to-br from-violet-500 via-cyan-400 to-emerald-400 shadow-[0_0_0_8px_rgba(124,58,237,0.12)]" />
                        <div className="leading-tight">
                            <div className="text-sm font-extrabold tracking-tight">SubTrack</div>
                            <div className="text-xs opacity-70">
                                {session ? "Signed in · Cloud sync" : isGuest ? "Guest mode" : "—"}
                            </div>
                        </div>
                    </div>

                    <div className="flex items-center gap-2">
                        <button
                            className="rounded-full border px-3 py-2 text-xs font-semibold transition hover:-translate-y-0.5 hover:shadow-lg"
                            style={{
                                borderColor: light ? "rgba(15,23,42,0.12)" : "rgba(255,255,255,0.12)",
                                background: light ? "white" : "rgba(255,255,255,0.06)",
                            }}
                            onClick={() => setTheme((t) => (t === "dark" ? "light" : "dark"))}
                            type="button"
                        >
                            {theme === "dark" ? "Light mode" : "Dark mode"}
                        </button>

                        <button
                            className="rounded-full border px-3 py-2 text-xs font-semibold transition hover:-translate-y-0.5 hover:shadow-lg"
                            style={{
                                borderColor: light ? "rgba(15,23,42,0.12)" : "rgba(255,255,255,0.12)",
                                background: light ? "white" : "rgba(255,255,255,0.06)",
                            }}
                            onClick={exportCSV}
                            type="button"
                        >
                            Export CSV
                        </button>

                        {/* Profile */}
                        <div className="relative group" ref={menuRef}>
                            <button
                                type="button"
                                onClick={() => setMenuOpen((s) => !s)}
                                className="flex items-center gap-2 rounded-full border px-2.5 py-2 text-xs font-semibold transition hover:-translate-y-0.5 hover:shadow-lg"
                                style={{
                                    borderColor: light ? "rgba(15,23,42,0.12)" : "rgba(255,255,255,0.12)",
                                    background: light ? "white" : "rgba(255,255,255,0.06)",
                                }}
                                title={isGuest ? "Guest (click for login/signup)" : "Profile"}
                            >
                                <div className="relative h-8 w-8 overflow-hidden rounded-full bg-gradient-to-br from-violet-500 via-cyan-400 to-emerald-400">
                                    {session && profile?.avatar_url ? (
                                        <img src={profile.avatar_url} alt="Avatar" className="h-full w-full object-cover" />
                                    ) : (
                                        <div className="grid h-full w-full place-items-center text-sm font-extrabold text-white">
                                            {isGuest ? "G" : genderEmoji(profile?.gender)}
                                        </div>
                                    )}
                                </div>

                                <span className="hidden sm:inline">{displayName}</span>
                            </button>

                            {/* Hover helper (only shows when hovering the profile button) */}
                            <div
                                className="pointer-events-none absolute right-0 mt-2 whitespace-nowrap rounded-xl border px-3 py-1.5 text-xs font-semibold opacity-0 shadow-xl backdrop-blur transition group-hover:opacity-100"
                                style={{
                                    borderColor: light ? "rgba(15,23,42,0.12)" : "rgba(255,255,255,0.12)",
                                    background: light ? "rgba(255,255,255,0.92)" : "rgba(2,6,23,0.75)",
                                }}
                            >
                                {isGuest ? "Log in / Sign up to save" : "See profile"}
                            </div>

                            {menuOpen ? (
                                <div
                                    className="absolute right-0 mt-2 w-64 rounded-2xl border p-3 text-sm shadow-2xl backdrop-blur"
                                    style={{
                                        borderColor: light ? "rgba(15,23,42,0.12)" : "rgba(255,255,255,0.12)",
                                        background: light ? "rgba(255,255,255,0.92)" : "rgba(2,6,23,0.75)",
                                    }}
                                >
                                    {isGuest ? (
                                        <>
                                            <div className="font-extrabold">Guest</div>
                                            <div className="mt-1 opacity-80">
                                                Want to save your data? Log in or sign up — we’ll import what you added.
                                            </div>

                                            <div className="mt-3 grid gap-2">
                                                <button
                                                    className="rounded-xl border px-3 py-2 text-sm font-semibold transition hover:-translate-y-0.5 hover:shadow-lg"
                                                    style={{
                                                        borderColor: light ? "rgba(15,23,42,0.12)" : "rgba(255,255,255,0.12)",
                                                        background: light ? "white" : "rgba(255,255,255,0.06)",
                                                    }}
                                                    type="button"
                                                    onClick={() => goAuth("/login")}
                                                >
                                                    Log in to save
                                                </button>

                                                <button
                                                    className="rounded-xl border px-3 py-2 text-sm font-semibold transition hover:-translate-y-0.5 hover:shadow-lg"
                                                    style={{
                                                        borderColor: light ? "rgba(15,23,42,0.12)" : "rgba(255,255,255,0.12)",
                                                        background:
                                                            "linear-gradient(90deg, rgba(124,58,237,0.18), rgba(34,211,238,0.14), rgba(52,211,153,0.12))",
                                                    }}
                                                    type="button"
                                                    onClick={() => goAuth("/signup")}
                                                >
                                                    Create account
                                                </button>

                                                <button
                                                    className="rounded-xl border px-3 py-2 text-xs font-semibold opacity-80 transition hover:opacity-100"
                                                    style={{
                                                        borderColor: light ? "rgba(239,68,68,0.18)" : "rgba(248,113,113,0.22)",
                                                        background: light ? "rgba(254,242,242,0.9)" : "rgba(244,63,94,0.12)",
                                                    }}
                                                    type="button"
                                                    onClick={() => {
                                                        setMenuOpen(false);
                                                        exitGuest?.();
                                                        nav("/login", { replace: true });
                                                    }}
                                                >
                                                    Exit guest
                                                </button>
                                            </div>
                                        </>
                                    ) : (
                                        <>
                                            <div className="font-extrabold">Account</div>
                                            <div className="mt-1 opacity-80">{session?.user?.email}</div>

                                            <div className="mt-3 grid gap-2">
                                                <button
                                                    className="rounded-xl border px-3 py-2 text-sm font-semibold transition hover:-translate-y-0.5 hover:shadow-lg"
                                                    style={{
                                                        borderColor: light ? "rgba(15,23,42,0.12)" : "rgba(255,255,255,0.12)",
                                                        background: light ? "white" : "rgba(255,255,255,0.06)",
                                                    }}
                                                    type="button"
                                                    onClick={() => {
                                                        setMenuOpen(false);
                                                        nav("/profile");
                                                    }}
                                                >
                                                    See profile
                                                </button>

                                                <button
                                                    className="rounded-xl border px-3 py-2 text-sm font-semibold transition hover:-translate-y-0.5 hover:shadow-lg"
                                                    style={{
                                                        borderColor: light ? "rgba(239,68,68,0.18)" : "rgba(248,113,113,0.22)",
                                                        background: light ? "rgba(254,242,242,0.9)" : "rgba(244,63,94,0.12)",
                                                    }}
                                                    type="button"
                                                    onClick={signOut}
                                                >
                                                    Sign out
                                                </button>
                                            </div>
                                        </>
                                    )}
                                </div>
                            ) : null}
                        </div>

                    </div>
                </div>
            </header>

            <main className="mx-auto max-w-6xl px-4 py-8">
                {/* Guest banner */}
                {isGuest ? (
                    <div
                        className="mb-5 rounded-3xl border px-5 py-4 text-sm shadow-xl"
                        style={{
                            borderColor: light ? "rgba(245,158,11,0.25)" : "rgba(251,191,36,0.25)",
                            background: light ? "rgba(255,251,235,0.92)" : "rgba(245,158,11,0.10)",
                        }}
                    >
                        <div className="font-extrabold">Guest mode</div>
                        <div className="mt-1 opacity-85">
                            Your data is stored only in this browser tab. If you close the tab, it’s gone.
                        </div>
                        <div className="mt-3 flex flex-wrap gap-2">
                            <button
                                className="rounded-xl border px-3 py-2 text-sm font-semibold transition hover:-translate-y-0.5 hover:shadow-lg"
                                style={{
                                    borderColor: light ? "rgba(15,23,42,0.12)" : "rgba(255,255,255,0.12)",
                                    background: light ? "white" : "rgba(255,255,255,0.06)",
                                }}
                                type="button"
                                onClick={() => goAuth("/login")}
                            >
                                Log in to save
                            </button>
                            <button
                                className="rounded-xl border px-3 py-2 text-sm font-semibold transition hover:-translate-y-0.5 hover:shadow-lg"
                                style={{
                                    borderColor: light ? "rgba(15,23,42,0.12)" : "rgba(255,255,255,0.12)",
                                    background:
                                        "linear-gradient(90deg, rgba(124,58,237,0.18), rgba(34,211,238,0.14), rgba(52,211,153,0.12))",
                                }}
                                type="button"
                                onClick={() => goAuth("/signup")}
                            >
                                Create account
                            </button>
                        </div>
                    </div>
                ) : null}

                {/* Stats */}
                <section className="grid gap-3 sm:grid-cols-3">
                    <div
                        className="rounded-3xl border p-4 shadow-xl"
                        style={{
                            borderColor: light ? "rgba(15,23,42,0.10)" : "rgba(255,255,255,0.10)",
                            background: light ? "rgba(255,255,255,0.85)" : "rgba(255,255,255,0.06)",
                        }}
                    >
                        <div className="text-xs font-semibold opacity-70">Items</div>
                        <div className="mt-1 text-2xl font-extrabold tracking-tight">{subs.length}</div>
                    </div>

                    <div
                        className="rounded-3xl border p-4 shadow-xl"
                        style={{
                            borderColor: light ? "rgba(15,23,42,0.10)" : "rgba(255,255,255,0.10)",
                            background: light ? "rgba(255,255,255,0.85)" : "rgba(255,255,255,0.06)",
                        }}
                    >
                        <div className="text-xs font-semibold opacity-70">Monthly estimate</div>
                        <div className="mt-1 text-2xl font-extrabold tracking-tight">{totals.monthly.toFixed(2)}</div>
                    </div>

                    <div
                        className="rounded-3xl border p-4 shadow-xl"
                        style={{
                            borderColor: light ? "rgba(15,23,42,0.10)" : "rgba(255,255,255,0.10)",
                            background: light ? "rgba(255,255,255,0.85)" : "rgba(255,255,255,0.06)",
                        }}
                    >
                        <div className="text-xs font-semibold opacity-70">Yearly estimate</div>
                        <div className="mt-1 text-2xl font-extrabold tracking-tight">{totals.yearly.toFixed(2)}</div>
                    </div>
                </section>

                {/* Main grid */}
                <section className="mt-5 grid items-start gap-4 lg:grid-cols-[1fr_1.4fr]">
                    {/* Add/Edit */}
                    <div
                        className="self-start rounded-3xl border p-5 shadow-2xl"
                        style={{
                            borderColor: light ? "rgba(15,23,42,0.10)" : "rgba(255,255,255,0.10)",
                            background: light ? "rgba(255,255,255,0.85)" : "rgba(255,255,255,0.06)",
                        }}
                    >
                        <div className="flex items-center justify-between gap-2">
                            <h2 className="text-lg font-extrabold tracking-tight">
                                {editingId ? "Edit subscription" : "Add subscription"}
                            </h2>
                            {editingId ? (
                                <button
                                    className="rounded-full border px-3 py-2 text-xs font-semibold transition hover:-translate-y-0.5 hover:shadow-lg"
                                    style={{
                                        borderColor: light ? "rgba(15,23,42,0.12)" : "rgba(255,255,255,0.12)",
                                        background: light ? "white" : "rgba(255,255,255,0.06)",
                                    }}
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
                                    className="w-full rounded-2xl border px-4 py-3 text-sm outline-none transition focus:ring-4"
                                    style={{
                                        borderColor: light ? "rgba(15,23,42,0.12)" : "rgba(255,255,255,0.12)",
                                        background: light ? "white" : "rgba(2,6,23,0.25)",
                                    }}
                                    value={form.name}
                                    onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))}
                                    placeholder="Netflix, Spotify, Gym…"
                                    required
                                />
                            </label>

                            <div className="grid gap-3 sm:grid-cols-2">
                                <label className="grid gap-2 text-xs font-semibold opacity-70">
                                    Amount
                                    <input
                                        className="w-full rounded-2xl border px-4 py-3 text-sm outline-none transition focus:ring-4"
                                        style={{
                                            borderColor: light ? "rgba(15,23,42,0.12)" : "rgba(255,255,255,0.12)",
                                            background: light ? "white" : "rgba(2,6,23,0.25)",
                                        }}
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
                                        className="w-full rounded-2xl border px-4 py-3 text-sm outline-none transition focus:ring-4"
                                        style={{
                                            borderColor: light ? "rgba(15,23,42,0.12)" : "rgba(255,255,255,0.12)",
                                            background: light ? "white" : "rgba(2,6,23,0.25)",
                                        }}
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
                                        className="w-full rounded-2xl border px-4 py-3 text-sm outline-none transition focus:ring-4"
                                        style={{
                                            borderColor: light ? "rgba(15,23,42,0.12)" : "rgba(255,255,255,0.12)",
                                            background: light ? "white" : "rgba(2,6,23,0.25)",
                                        }}
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
                                        className="w-full rounded-2xl border px-4 py-3 text-sm outline-none transition focus:ring-4"
                                        style={{
                                            borderColor: light ? "rgba(15,23,42,0.12)" : "rgba(255,255,255,0.12)",
                                            background: light ? "white" : "rgba(2,6,23,0.25)",
                                        }}
                                        value={form.nextDue}
                                        onChange={(e) => setForm((p) => ({ ...p, nextDue: e.target.value }))}
                                        required
                                    />
                                </label>
                            </div>

                            <label className="grid gap-2 text-xs font-semibold opacity-70">
                                Category
                                <select
                                    className="w-full rounded-2xl border px-4 py-3 text-sm outline-none transition focus:ring-4"
                                    style={{
                                        borderColor: light ? "rgba(15,23,42,0.12)" : "rgba(255,255,255,0.12)",
                                        background: light ? "white" : "rgba(2,6,23,0.25)",
                                    }}
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
                                    className="w-full rounded-2xl border px-4 py-3 text-sm outline-none transition focus:ring-4"
                                    style={{
                                        borderColor: light ? "rgba(15,23,42,0.12)" : "rgba(255,255,255,0.12)",
                                        background: light ? "white" : "rgba(2,6,23,0.25)",
                                    }}
                                    value={form.notes}
                                    onChange={(e) => setForm((p) => ({ ...p, notes: e.target.value }))}
                                    placeholder="Trial ends, cancel link, etc."
                                    rows={3}
                                />
                            </label>

                            <button
                                className="rounded-2xl border px-4 py-3 text-sm font-semibold transition hover:-translate-y-0.5 hover:shadow-xl"
                                style={{
                                    borderColor: light ? "rgba(15,23,42,0.12)" : "rgba(255,255,255,0.12)",
                                    background:
                                        "linear-gradient(90deg, rgba(124,58,237,0.18), rgba(34,211,238,0.14), rgba(52,211,153,0.12))",
                                }}
                                type="submit"
                            >
                                {editingId ? "Save changes" : "Add subscription"}
                            </button>
                        </form>
                    </div>

                    {/* List */}
                    <div
                        className="rounded-3xl border p-5 shadow-2xl"
                        style={{
                            borderColor: light ? "rgba(15,23,42,0.10)" : "rgba(255,255,255,0.10)",
                            background: light ? "rgba(255,255,255,0.85)" : "rgba(255,255,255,0.06)",
                        }}
                    >
                        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                            <h2 className="text-lg font-extrabold tracking-tight">Upcoming</h2>

                            <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row">
                                <input
                                    className="w-full rounded-2xl border px-4 py-3 text-sm outline-none transition focus:ring-4 sm:w-[320px]"
                                    style={{
                                        borderColor: light ? "rgba(15,23,42,0.12)" : "rgba(255,255,255,0.12)",
                                        background: light ? "white" : "rgba(2,6,23,0.25)",
                                    }}
                                    value={query}
                                    onChange={(e) => setQuery(e.target.value)}
                                    placeholder="Search name, category, notes…"
                                />
                                <select
                                    className="w-full rounded-2xl border px-4 py-3 text-sm outline-none transition focus:ring-4 sm:w-[160px]"
                                    style={{
                                        borderColor: light ? "rgba(15,23,42,0.12)" : "rgba(255,255,255,0.12)",
                                        background: light ? "white" : "rgba(2,6,23,0.25)",
                                    }}
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

                        {loading ? <div className="mt-4 text-sm opacity-75">Loading…</div> : null}

                        {filtered.length === 0 ? (
                            <div className="mt-4 rounded-3xl border border-dashed p-5 opacity-85">
                                <div className="font-extrabold">No subscriptions yet</div>
                                <div className="mt-1 text-sm opacity-80">Add your first one — it will appear here by due date.</div>
                            </div>
                        ) : (
                            <div className="mt-4 grid gap-3">
                                {filtered.map((s) => {
                                    const d = daysUntil(s.nextDue);
                                    const b = badgeForDue(d);

                                    const badgeStyle =
                                        b.tone === "bad"
                                            ? {
                                                border: light ? "1px solid rgba(239,68,68,0.20)" : "1px solid rgba(248,113,113,0.25)",
                                                background: light ? "rgba(254,242,242,0.9)" : "rgba(244,63,94,0.12)",
                                            }
                                            : b.tone === "warn"
                                                ? {
                                                    border: light ? "1px solid rgba(245,158,11,0.25)" : "1px solid rgba(251,191,36,0.25)",
                                                    background: light ? "rgba(255,251,235,0.9)" : "rgba(245,158,11,0.10)",
                                                }
                                                : b.tone === "ok"
                                                    ? {
                                                        border: light ? "1px solid rgba(16,185,129,0.20)" : "1px solid rgba(52,211,153,0.22)",
                                                        background: light ? "rgba(236,253,245,0.9)" : "rgba(16,185,129,0.10)",
                                                    }
                                                    : {
                                                        border: light ? "1px solid rgba(15,23,42,0.10)" : "1px solid rgba(255,255,255,0.12)",
                                                        background: light ? "rgba(255,255,255,0.7)" : "rgba(255,255,255,0.06)",
                                                    };

                                    return (
                                        <article
                                            key={s.id}
                                            className="rounded-3xl border p-4 transition hover:-translate-y-0.5 hover:shadow-xl"
                                            style={{
                                                borderColor: light ? "rgba(15,23,42,0.10)" : "rgba(255,255,255,0.10)",
                                                background: light ? "rgba(255,255,255,0.75)" : "rgba(2,6,23,0.25)",
                                            }}
                                        >
                                            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                                                <div>
                                                    <div className="text-base font-extrabold tracking-tight">{s.name}</div>

                                                    <div className="mt-2 flex flex-wrap items-center gap-2 text-xs font-semibold">
                                                        <span className="rounded-full px-3 py-1" style={badgeStyle}>
                                                            {b.text}
                                                        </span>
                                                        <span className="opacity-70">•</span>
                                                        <span className="opacity-80">{s.category || "—"}</span>
                                                        <span className="opacity-70">•</span>
                                                        <span className="opacity-80">
                                                            {s.currency}
                                                            {Number(s.amount).toFixed(2)} · {s.cycle}
                                                        </span>
                                                    </div>
                                                </div>

                                                <div className="text-right">
                                                    <div className="text-sm font-extrabold">
                                                        {s.currency}
                                                        {Number(s.amount).toFixed(2)}
                                                    </div>
                                                    <div className="mt-1 text-xs opacity-75">
                                                        ~{monthlyEquivalent(s.amount, s.cycle).toFixed(2)}/mo
                                                    </div>
                                                </div>
                                            </div>

                                            <div
                                                className="mt-3 flex flex-col gap-3 border-t pt-3 sm:flex-row sm:items-center sm:justify-between"
                                                style={{ borderColor: light ? "rgba(15,23,42,0.08)" : "rgba(255,255,255,0.08)" }}
                                            >
                                                <div className="text-sm opacity-85">
                                                    Next due: <span className="font-semibold">{s.nextDue}</span>
                                                    {s.notes ? <span className="opacity-75"> · {s.notes}</span> : null}
                                                </div>

                                                <div className="flex flex-wrap gap-2">
                                                    <button
                                                        className="rounded-xl border px-3 py-2 text-xs font-semibold transition hover:-translate-y-0.5 hover:shadow-lg"
                                                        style={{
                                                            borderColor: light ? "rgba(15,23,42,0.12)" : "rgba(255,255,255,0.12)",
                                                            background: light ? "white" : "rgba(255,255,255,0.06)",
                                                        }}
                                                        type="button"
                                                        onClick={() => onMarkPaid(s)}
                                                    >
                                                        Mark paid
                                                    </button>

                                                    <button
                                                        className="rounded-xl border px-3 py-2 text-xs font-semibold transition hover:-translate-y-0.5 hover:shadow-lg"
                                                        style={{
                                                            borderColor: light ? "rgba(15,23,42,0.12)" : "rgba(255,255,255,0.12)",
                                                            background: light ? "white" : "rgba(255,255,255,0.06)",
                                                        }}
                                                        type="button"
                                                        onClick={() => onEdit(s)}
                                                    >
                                                        Edit
                                                    </button>

                                                    <button
                                                        className="rounded-xl border px-3 py-2 text-xs font-semibold transition hover:-translate-y-0.5 hover:shadow-lg"
                                                        style={{
                                                            borderColor: light ? "rgba(239,68,68,0.18)" : "rgba(248,113,113,0.22)",
                                                            background: light ? "rgba(254,242,242,0.9)" : "rgba(244,63,94,0.12)",
                                                        }}
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
                    </div>
                </section>

                <footer className="mt-8 text-center text-xs opacity-70">
                    © {new Date().getFullYear()} Pratik Patel · SubTrack
                </footer>
            </main>
        </div>
    );
}
