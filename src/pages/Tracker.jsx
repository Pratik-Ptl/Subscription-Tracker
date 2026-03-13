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

const CATEGORY_COLORS = {
    "Streaming": "rgba(124,58,237,0.45)",
    "Music": "rgba(236,72,153,0.45)",
    "Cloud/Storage": "rgba(34,211,238,0.35)",
    "Gym/Fitness": "rgba(52,211,153,0.4)",
    "Utilities": "rgba(245,158,11,0.4)",
    "Education": "rgba(59,130,246,0.4)",
    "Software": "rgba(99,102,241,0.4)",
    "Games": "rgba(249,115,22,0.4)",
    "Other": "rgba(148,163,184,0.35)",
};

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
            : "radial-gradient(900px 600px at 14% 12%, rgba(124,58,237,0.22), transparent 60%), radial-gradient(900px 600px at 86% 22%, rgba(34,211,238,0.15), transparent 58%), radial-gradient(900px 600px at 66% 88%, rgba(52,211,153,0.12), transparent 55%), linear-gradient(180deg, #020617, #0b1220)";
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
    const [showForm, setShowForm] = useState(false);
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
        setShowForm(false);
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

    const nextDueDays = useMemo(() => {
        if (!subs.length) return "—";
        const min = Math.min(...subs.map((s) => daysUntil(s.nextDue)));
        return min < 0 ? "Overdue" : min;
    }, [subs]);

    const topCurrency = useMemo(() => {
        if (!subs.length) return "$";
        const counts = {};
        for (const s of subs) counts[s.currency] = (counts[s.currency] || 0) + 1;
        return Object.entries(counts).sort((a, b) => b[1] - a[1])[0][0];
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
        setShowForm(true);
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

    // ✅ Guest -> login/signup with "save my data"
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

    const glassCard = {
        borderColor: light ? "rgba(15,23,42,0.10)" : "rgba(255,255,255,0.12)",
        background: light ? "rgba(255,255,255,0.90)" : "linear-gradient(135deg, rgba(255,255,255,0.09) 0%, rgba(255,255,255,0.03) 100%)",
        boxShadow: light ? "0 8px 32px rgba(0,0,0,0.07), inset 0 1px 0 rgba(255,255,255,0.9)" : "0 8px 32px rgba(0,0,0,0.28), inset 0 1px 0 rgba(255,255,255,0.12)",
        backdropFilter: "blur(20px)",
    };

    const inputStyle = {
        borderColor: light ? "rgba(15,23,42,0.12)" : "rgba(255,255,255,0.12)",
        background: light ? "rgba(255,255,255,0.9)" : "rgba(2,6,23,0.35)",
        color: light ? "#0b1220" : "white",
    };

    // Inner components
    function StatCard({ label, value, unit, glow, icon }) {
        return (
            <div className="rounded-3xl border p-4 shadow-xl card-in" style={{
                borderColor: light ? "rgba(15,23,42,0.10)" : "rgba(255,255,255,0.12)",
                background: light ? "rgba(255,255,255,0.82)" : "linear-gradient(135deg, rgba(255,255,255,0.08), rgba(255,255,255,0.03))",
                boxShadow: light ? "0 8px 32px rgba(0,0,0,0.07), inset 0 1px 0 rgba(255,255,255,0.9)" : `0 8px 32px rgba(0,0,0,0.28), 0 0 40px -15px ${glow}, inset 0 1px 0 rgba(255,255,255,0.12)`,
                backdropFilter: "blur(20px)",
            }}>
                <div className="flex items-center justify-between">
                    <div className="text-xs font-semibold opacity-60">{label}</div>
                    <div style={{ fontSize: 16, opacity: 0.45 }}>{icon}</div>
                </div>
                <div className="mt-2 text-2xl font-extrabold tracking-tight">
                    {unit && unit !== "" && unit !== "day" && unit !== "days" && unit !== "Overdue"
                        ? <span className="text-base font-semibold opacity-60 mr-0.5">{unit}</span>
                        : null}
                    {value}
                    {(unit === "day" || unit === "days")
                        ? <span className="text-sm font-semibold opacity-60 ml-1">{unit}</span>
                        : null}
                </div>
            </div>
        );
    }

    function ActionBtn({ onClick, children, danger }) {
        return (
            <button type="button" onClick={onClick}
                className="rounded-xl border px-2.5 py-1.5 text-xs font-semibold transition hover:-translate-y-0.5"
                style={{
                    borderColor: danger
                        ? (light ? "rgba(239,68,68,0.18)" : "rgba(248,113,113,0.22)")
                        : (light ? "rgba(15,23,42,0.12)" : "rgba(255,255,255,0.12)"),
                    background: danger
                        ? (light ? "rgba(254,242,242,0.9)" : "rgba(244,63,94,0.10)")
                        : (light ? "rgba(255,255,255,0.7)" : "rgba(255,255,255,0.06)"),
                }}>
                {children}
            </button>
        );
    }

    return (
        <div className="min-h-screen" style={{ backgroundImage: bg, color: light ? "#0b1220" : "white" }}>
            {toast ? (
                <div
                    className="fixed top-4 left-1/2 z-50 -translate-x-1/2 rounded-2xl border px-4 py-3 text-sm shadow-2xl backdrop-blur"
                    style={{
                        borderColor: light ? "rgba(15,23,42,0.12)" : "rgba(255,255,255,0.12)",
                        background: light ? "rgba(255,255,255,0.95)" : "rgba(15,23,42,0.85)",
                        backdropFilter: "blur(20px)",
                    }}
                >
                    {toast.text}
                </div>
            ) : null}

            {/* Header */}
            <header
                className="sticky top-0 z-40 border-b"
                style={{
                    borderColor: light ? "rgba(15,23,42,0.08)" : "rgba(255,255,255,0.08)",
                    background: light ? "rgba(255,255,255,0.75)" : "rgba(2,6,23,0.55)",
                    backdropFilter: "blur(20px)",
                }}
            >
                <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 py-3">
                    <div className="flex items-center gap-3">
                        <img src="/logo.svg" alt="SubTrack" className="h-8 w-8 rounded-xl flex-shrink-0" />
                        <div className="leading-tight">
                            <div className="text-sm font-extrabold tracking-tight">SubTrack</div>
                            <div className="text-xs opacity-60">
                                {session ? "Cloud sync" : isGuest ? "Guest mode" : "—"}
                            </div>
                        </div>
                    </div>

                    <div className="flex items-center gap-2">
                        <button
                            className="rounded-full border px-3 py-1.5 text-xs font-semibold transition hover:opacity-80"
                            style={{
                                borderColor: light ? "rgba(15,23,42,0.12)" : "rgba(255,255,255,0.12)",
                                background: light ? "white" : "rgba(255,255,255,0.06)",
                            }}
                            onClick={() => setTheme((t) => (t === "dark" ? "light" : "dark"))}
                            type="button"
                        >
                            {theme === "dark" ? "☀ Light" : "☾ Dark"}
                        </button>

                        <button
                            className="hidden sm:block rounded-full border px-3 py-1.5 text-xs font-semibold transition hover:opacity-80"
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
                                className="flex items-center gap-2 rounded-full border px-2.5 py-1.5 text-xs font-semibold transition hover:opacity-80"
                                style={{
                                    borderColor: light ? "rgba(15,23,42,0.12)" : "rgba(255,255,255,0.12)",
                                    background: light ? "white" : "rgba(255,255,255,0.06)",
                                }}
                            >
                                <div className="relative h-7 w-7 overflow-hidden rounded-full" style={{ background: "linear-gradient(135deg, #7c3aed, #22d3ee, #10b981)" }}>
                                    {session && profile?.avatar_url ? (
                                        <img src={profile.avatar_url} alt="Avatar" className="h-full w-full object-cover" />
                                    ) : (
                                        <div className="grid h-full w-full place-items-center text-xs font-extrabold text-white">
                                            {isGuest ? "G" : genderEmoji(profile?.gender)}
                                        </div>
                                    )}
                                </div>
                                <span className="hidden sm:inline">{displayName}</span>
                            </button>

                            {menuOpen ? (
                                <div
                                    className="absolute right-0 mt-2 w-64 rounded-2xl border p-3 text-sm shadow-2xl"
                                    style={{
                                        borderColor: light ? "rgba(15,23,42,0.12)" : "rgba(255,255,255,0.12)",
                                        background: light ? "rgba(255,255,255,0.95)" : "rgba(2,6,23,0.88)",
                                        backdropFilter: "blur(20px)",
                                        zIndex: 60,
                                    }}
                                >
                                    {isGuest ? (
                                        <>
                                            <div className="font-extrabold">Guest</div>
                                            <div className="mt-1 opacity-80">
                                                Want to save your data? Log in or sign up — we'll import what you added.
                                            </div>

                                            <div className="mt-3 grid gap-2">
                                                <button
                                                    className="rounded-xl border px-3 py-2 text-sm font-semibold transition hover:-translate-y-0.5"
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
                                                    className="rounded-xl border px-3 py-2 text-sm font-semibold transition hover:-translate-y-0.5"
                                                    style={{
                                                        borderColor: "rgba(124,58,237,0.3)",
                                                        background: "linear-gradient(90deg, rgba(124,58,237,0.18), rgba(34,211,238,0.14), rgba(52,211,153,0.12))",
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
                                                    className="rounded-xl border px-3 py-2 text-sm font-semibold transition hover:-translate-y-0.5"
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
                                                    className="rounded-xl border px-3 py-2 text-sm font-semibold transition hover:-translate-y-0.5"
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
                            Your data is stored only in this browser tab. If you close the tab, it's gone.
                        </div>
                        <div className="mt-3 flex flex-wrap gap-2">
                            <button
                                className="rounded-xl border px-3 py-2 text-sm font-semibold transition hover:-translate-y-0.5"
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
                                className="rounded-xl border px-3 py-2 text-sm font-semibold transition hover:-translate-y-0.5"
                                style={{
                                    borderColor: "rgba(124,58,237,0.3)",
                                    background: "linear-gradient(90deg, rgba(124,58,237,0.18), rgba(34,211,238,0.14), rgba(52,211,153,0.12))",
                                }}
                                type="button"
                                onClick={() => goAuth("/signup")}
                            >
                                Create account
                            </button>
                        </div>
                    </div>
                ) : null}

                {/* Stats — 4 cards with colored glows */}
                <section className="grid gap-3 grid-cols-2 lg:grid-cols-4">
                    <StatCard
                        label="Subscriptions"
                        value={subs.length}
                        unit=""
                        glow="rgba(124,58,237,0.35)"
                        icon="◈"
                    />
                    <StatCard
                        label="Per month"
                        value={totals.monthly.toFixed(2)}
                        unit={topCurrency}
                        glow="rgba(34,211,238,0.3)"
                        icon="↻"
                    />
                    <StatCard
                        label="Per year"
                        value={totals.yearly.toFixed(2)}
                        unit={topCurrency}
                        glow="rgba(52,211,153,0.3)"
                        icon="◎"
                    />
                    <StatCard
                        label="Next due"
                        value={nextDueDays}
                        unit={typeof nextDueDays === "number" ? (nextDueDays === 1 ? "day" : "days") : ""}
                        glow="rgba(245,158,11,0.35)"
                        icon="◷"
                    />
                </section>

                {/* Subscription list */}
                <section className="mt-5 rounded-3xl border shadow-2xl" style={glassCard}>
                    <div className="p-5 pb-0">
                        <div className="flex flex-wrap items-center justify-between gap-3">
                            <h2 className="text-lg font-extrabold tracking-tight">Upcoming</h2>
                            <div className="flex items-center gap-2">
                                <button
                                    type="button"
                                    onClick={() => { resetForm(); setShowForm(true); }}
                                    className="rounded-2xl border px-4 py-2 text-sm font-bold text-white transition hover:-translate-y-0.5 hover:shadow-xl"
                                    style={{ background: "linear-gradient(90deg, #7c3aed, #6d28d9)", border: "none", boxShadow: "0 4px 12px rgba(124,58,237,0.4)" }}
                                >
                                    + Add
                                </button>
                            </div>
                        </div>

                        {/* Search + category pills */}
                        <div className="mt-3">
                            <input
                                className="w-full rounded-2xl border px-4 py-2.5 text-sm outline-none transition"
                                style={inputStyle}
                                value={query}
                                onChange={(e) => setQuery(e.target.value)}
                                placeholder="Search name, category, notes…"
                            />
                        </div>

                        <div className="pill-row mt-3 pb-4" style={{ borderBottom: `1px solid ${light ? "rgba(15,23,42,0.08)" : "rgba(255,255,255,0.07)"}` }}>
                            {["All", ...CATEGORY_OPTIONS].map((cat) => (
                                <button
                                    key={cat}
                                    type="button"
                                    onClick={() => setFilterCat(cat)}
                                    className="shrink-0 rounded-full border px-3 py-1.5 text-xs font-semibold transition"
                                    style={{
                                        borderColor: filterCat === cat
                                            ? "rgba(124,58,237,0.6)"
                                            : (light ? "rgba(15,23,42,0.12)" : "rgba(255,255,255,0.12)"),
                                        background: filterCat === cat
                                            ? "linear-gradient(90deg, rgba(124,58,237,0.25), rgba(34,211,238,0.18))"
                                            : (light ? "rgba(255,255,255,0.6)" : "rgba(255,255,255,0.04)"),
                                        color: filterCat === cat ? (light ? "#4c1d95" : "white") : undefined,
                                    }}
                                >
                                    {cat}
                                </button>
                            ))}
                        </div>
                    </div>

                    <div className="p-5 pt-4">
                        {loading ? <div className="text-sm opacity-75">Loading…</div> : null}

                        {filtered.length === 0 ? (
                            <div className="rounded-3xl border border-dashed p-8 text-center"
                                style={{ borderColor: light ? "rgba(15,23,42,0.12)" : "rgba(255,255,255,0.12)" }}>
                                <div className="text-2xl opacity-40">◈</div>
                                <div className="mt-2 font-extrabold">No subscriptions yet</div>
                                <div className="mt-1 text-sm opacity-70">Tap + Add to track your first subscription.</div>
                            </div>
                        ) : (
                            <div className="grid gap-3">
                                {filtered.map((s) => {
                                    const d = daysUntil(s.nextDue);
                                    const b = badgeForDue(d);

                                    const urgencyBorder = d < 0
                                        ? "rgba(244,63,94,0.7)"
                                        : d <= 7
                                            ? "rgba(245,158,11,0.7)"
                                            : "rgba(52,211,153,0.35)";

                                    const avatarBg = CATEGORY_COLORS[s.category] || "rgba(124,58,237,0.35)";

                                    const badgeStyle =
                                        b.tone === "bad"
                                            ? {
                                                border: light ? "1px solid rgba(239,68,68,0.20)" : "1px solid rgba(248,113,113,0.25)",
                                                background: light ? "rgba(254,242,242,0.9)" : "rgba(244,63,94,0.12)",
                                                color: light ? "rgb(153,27,27)" : "rgba(255,255,255,0.9)",
                                            }
                                            : b.tone === "warn"
                                                ? {
                                                    border: light ? "1px solid rgba(245,158,11,0.25)" : "1px solid rgba(251,191,36,0.25)",
                                                    background: light ? "rgba(255,251,235,0.9)" : "rgba(245,158,11,0.10)",
                                                    color: light ? "rgb(120,60,0)" : "rgba(255,255,255,0.85)",
                                                }
                                                : b.tone === "ok"
                                                    ? {
                                                        border: light ? "1px solid rgba(16,185,129,0.20)" : "1px solid rgba(52,211,153,0.22)",
                                                        background: light ? "rgba(236,253,245,0.9)" : "rgba(16,185,129,0.10)",
                                                        color: light ? "rgb(6,78,59)" : "rgba(255,255,255,0.85)",
                                                    }
                                                    : {
                                                        border: light ? "1px solid rgba(15,23,42,0.10)" : "1px solid rgba(255,255,255,0.12)",
                                                        background: light ? "rgba(255,255,255,0.7)" : "rgba(255,255,255,0.06)",
                                                    };

                                    return (
                                        <article
                                            key={s.id}
                                            className="rounded-2xl border transition hover:-translate-y-0.5 hover:shadow-xl"
                                            style={{
                                                borderColor: light ? "rgba(15,23,42,0.08)" : "rgba(255,255,255,0.09)",
                                                borderLeft: `3px solid ${urgencyBorder}`,
                                                background: light ? "rgba(255,255,255,0.78)" : "linear-gradient(135deg, rgba(255,255,255,0.07), rgba(255,255,255,0.02))",
                                                boxShadow: light ? "0 4px 16px rgba(0,0,0,0.06)" : "0 4px 20px rgba(0,0,0,0.25), inset 0 1px 0 rgba(255,255,255,0.08)",
                                                backdropFilter: "blur(12px)",
                                                padding: "0.875rem 1rem",
                                            }}
                                        >
                                            {/* Top row: avatar + name + amount */}
                                            <div className="flex items-start justify-between gap-3">
                                                <div className="flex items-center gap-3 min-w-0">
                                                    <div style={{
                                                        width: 40, height: 40, borderRadius: 12,
                                                        background: avatarBg,
                                                        display: "grid", placeItems: "center",
                                                        fontSize: 16, fontWeight: 800, color: "white", flexShrink: 0,
                                                    }}>
                                                        {s.name[0]?.toUpperCase() || "?"}
                                                    </div>
                                                    <div className="min-w-0">
                                                        <div className="font-extrabold tracking-tight truncate">{s.name}</div>
                                                        <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                                                            <span className="text-xs opacity-60">{s.category || "—"}</span>
                                                            <span className="rounded-full px-2 py-0.5 text-xs font-semibold" style={badgeStyle}>{b.text}</span>
                                                        </div>
                                                    </div>
                                                </div>
                                                <div className="text-right shrink-0">
                                                    <div className="font-extrabold text-base">{s.currency}{Number(s.amount).toFixed(2)}</div>
                                                    <div className="text-xs opacity-60">~{monthlyEquivalent(s.amount, s.cycle).toFixed(2)}/mo</div>
                                                </div>
                                            </div>

                                            {/* Divider + actions */}
                                            <div className="flex items-center justify-between gap-2 mt-3 pt-3 flex-wrap"
                                                style={{ borderTop: `1px solid ${light ? "rgba(15,23,42,0.08)" : "rgba(255,255,255,0.07)"}` }}>
                                                <div className="text-xs opacity-60 truncate">
                                                    Due {s.nextDue}{s.notes ? ` · ${s.notes}` : ""}
                                                </div>
                                                <div className="flex gap-1.5 shrink-0">
                                                    <ActionBtn onClick={() => onMarkPaid(s)}>✓ Paid</ActionBtn>
                                                    <ActionBtn onClick={() => onEdit(s)}>Edit</ActionBtn>
                                                    <ActionBtn onClick={() => onDelete(s.id)} danger>✕</ActionBtn>
                                                </div>
                                            </div>
                                        </article>
                                    );
                                })}
                            </div>
                        )}
                    </div>
                </section>

                <footer className="mt-8 text-center text-xs opacity-50">
                    © {new Date().getFullYear()} Pratik Patel · SubTrack
                </footer>
            </main>

            {/* FAB */}
            <button
                onClick={() => { resetForm(); setShowForm(true); }}
                type="button"
                className="fixed bottom-6 right-6 z-40 h-14 w-14 rounded-full text-2xl font-bold text-white transition hover:-translate-y-1"
                style={{
                    background: "linear-gradient(135deg, #7c3aed, #22d3ee)",
                    boxShadow: "0 4px 24px rgba(124,58,237,0.5)",
                }}
            >
                +
            </button>

            {/* Add/Edit modal */}
            {showForm ? (
                <div
                    className="fixed inset-0 z-50 flex items-center justify-center p-4"
                    style={{ background: "rgba(0,0,0,0.6)", backdropFilter: "blur(6px)" }}
                    onClick={(e) => { if (e.target === e.currentTarget) resetForm(); }}
                >
                    <div
                        className="w-full max-w-lg rounded-3xl border p-6 shadow-2xl card-in overflow-y-auto"
                        style={{
                            ...glassCard,
                            maxHeight: "90vh",
                            color: light ? "#0b1220" : "white",
                        }}
                    >
                        <div className="flex items-center justify-between mb-4">
                            <h2 className="text-xl font-extrabold tracking-tight">
                                {editingId ? "Edit subscription" : "New subscription"}
                            </h2>
                            <button
                                onClick={resetForm}
                                type="button"
                                className="rounded-full border px-3 py-1.5 text-sm font-semibold transition hover:opacity-100"
                                style={{
                                    borderColor: light ? "rgba(15,23,42,0.12)" : "rgba(255,255,255,0.15)",
                                    background: light ? "rgba(255,255,255,0.8)" : "rgba(255,255,255,0.06)",
                                    opacity: 0.7,
                                }}
                            >
                                ✕
                            </button>
                        </div>

                        <form className="grid gap-3" onSubmit={onSubmit}>
                            <label className="grid gap-1.5 text-xs font-semibold opacity-70">
                                Name
                                <input
                                    className="w-full rounded-2xl border px-4 py-3 text-sm outline-none transition focus:ring-2"
                                    style={inputStyle}
                                    value={form.name}
                                    onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))}
                                    placeholder="Netflix, Spotify, Gym…"
                                    required
                                    autoFocus
                                />
                            </label>

                            <div className="grid gap-3 sm:grid-cols-2">
                                <label className="grid gap-1.5 text-xs font-semibold opacity-70">
                                    Amount
                                    <input
                                        className="w-full rounded-2xl border px-4 py-3 text-sm outline-none transition focus:ring-2"
                                        style={inputStyle}
                                        value={form.amount}
                                        onChange={(e) => setForm((p) => ({ ...p, amount: e.target.value }))}
                                        placeholder="e.g. 12.99"
                                        inputMode="decimal"
                                        required
                                    />
                                </label>

                                <label className="grid gap-1.5 text-xs font-semibold opacity-70">
                                    Currency
                                    <select
                                        className="w-full rounded-2xl border px-4 py-3 text-sm outline-none transition focus:ring-2"
                                        style={inputStyle}
                                        value={form.currency}
                                        onChange={(e) => setForm((p) => ({ ...p, currency: e.target.value }))}
                                    >
                                        {CURRENCY_OPTIONS.map((c) => (
                                            <option key={c} value={c}>{c}</option>
                                        ))}
                                    </select>
                                </label>
                            </div>

                            <div className="grid gap-3 sm:grid-cols-2">
                                <label className="grid gap-1.5 text-xs font-semibold opacity-70">
                                    Billing cycle
                                    <select
                                        className="w-full rounded-2xl border px-4 py-3 text-sm outline-none transition focus:ring-2"
                                        style={inputStyle}
                                        value={form.cycle}
                                        onChange={(e) => setForm((p) => ({ ...p, cycle: e.target.value }))}
                                    >
                                        {CYCLE_OPTIONS.map((c) => (
                                            <option key={c.value} value={c.value}>{c.label}</option>
                                        ))}
                                    </select>
                                </label>

                                <label className="grid gap-1.5 text-xs font-semibold opacity-70">
                                    Next due date
                                    <input
                                        type="date"
                                        className="w-full rounded-2xl border px-4 py-3 text-sm outline-none transition focus:ring-2"
                                        style={inputStyle}
                                        value={form.nextDue}
                                        onChange={(e) => setForm((p) => ({ ...p, nextDue: e.target.value }))}
                                        required
                                    />
                                </label>
                            </div>

                            <label className="grid gap-1.5 text-xs font-semibold opacity-70">
                                Category
                                <select
                                    className="w-full rounded-2xl border px-4 py-3 text-sm outline-none transition focus:ring-2"
                                    style={inputStyle}
                                    value={form.category}
                                    onChange={(e) => setForm((p) => ({ ...p, category: e.target.value }))}
                                >
                                    {CATEGORY_OPTIONS.map((c) => (
                                        <option key={c} value={c}>{c}</option>
                                    ))}
                                </select>
                            </label>

                            <label className="grid gap-1.5 text-xs font-semibold opacity-70">
                                Notes (optional)
                                <textarea
                                    className="w-full rounded-2xl border px-4 py-3 text-sm outline-none transition focus:ring-2"
                                    style={inputStyle}
                                    value={form.notes}
                                    onChange={(e) => setForm((p) => ({ ...p, notes: e.target.value }))}
                                    placeholder="Trial ends, cancel link, etc."
                                    rows={2}
                                />
                            </label>

                            <button
                                className="rounded-2xl px-4 py-3 text-sm font-bold text-white transition hover:-translate-y-0.5 hover:shadow-xl disabled:opacity-60 mt-1"
                                style={{ background: "linear-gradient(90deg, #7c3aed, #6d28d9)", boxShadow: "0 4px 16px rgba(124,58,237,0.4)" }}
                                type="submit"
                            >
                                {editingId ? "Save changes" : "Add subscription"}
                            </button>
                        </form>
                    </div>
                </div>
            ) : null}
        </div>
    );
}
