// src/pages/Login.jsx
import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { supabase } from "../supabaseClient";

export default function Login({ theme, setTheme, enterGuest }) {
  const nav = useNavigate();
  const [params] = useSearchParams();

  const light = theme === "light";

  // ✅ only show this if user came from guest homepage
  const fromGuest = params.get("fromGuest") === "1";

  // optional: show confirmed popup if you use /login?confirmed=1
  const confirmed = params.get("confirmed") === "1";

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const [showPw, setShowPw] = useState(false);
  const [loading, setLoading] = useState(false);

  const [toast, setToast] = useState(null);
  const [errorMsg, setErrorMsg] = useState("");

  const bg = useMemo(() => {
    return light
      ? "radial-gradient(900px 600px at 14% 12%, rgba(124,58,237,0.10), transparent 60%), radial-gradient(900px 600px at 86% 22%, rgba(34,211,238,0.08), transparent 58%), radial-gradient(900px 600px at 66% 88%, rgba(52,211,153,0.06), transparent 55%), linear-gradient(180deg, #f6f7ff, #ffffff)"
      : "radial-gradient(900px 600px at 14% 12%, rgba(124,58,237,0.18), transparent 60%), radial-gradient(900px 600px at 86% 22%, rgba(34,211,238,0.12), transparent 58%), radial-gradient(900px 600px at 66% 88%, rgba(52,211,153,0.09), transparent 55%), linear-gradient(180deg, #020617, #0b1220)";
  }, [light]);

  function popToast(text) {
    setToast(text);
  }

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 2600);
    return () => clearTimeout(t);
  }, [toast]);

  useEffect(() => {
    if (confirmed) popToast("✅ Email confirmed! You can log in now.");
  }, [confirmed]);

  async function onLogin(e) {
    e.preventDefault();
    setErrorMsg("");

    const e1 = email.trim();
    if (!e1 || !password) {
      setErrorMsg("Please enter email and password.");
      popToast("Missing info");
      return;
    }

    setLoading(true);

    const { error } = await supabase.auth.signInWithPassword({
      email: e1,
      password,
    });

    setLoading(false);

    if (error) {
      const msg = error.message || "Login failed.";
      setErrorMsg(msg);
      popToast("Login failed");
      return;
    }

    // Tracker will do the “guest import” automatically if flags exist
    nav("/app", { replace: true });
  }

  function continueAsGuest() {
    enterGuest();
    nav("/app", { replace: true });
  }

  return (
    <div className="min-h-screen" style={{ backgroundImage: bg, color: light ? "#0b1220" : "white" }}>
      {/* Toast */}
      {toast ? (
        <div
          className="fixed top-4 left-1/2 z-50 -translate-x-1/2 rounded-2xl border px-4 py-3 text-sm shadow-2xl backdrop-blur"
          style={{
            borderColor: light ? "rgba(15,23,42,0.12)" : "rgba(255,255,255,0.12)",
            background: light ? "rgba(255,255,255,0.88)" : "rgba(255,255,255,0.10)",
          }}
        >
          {toast}
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
        <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-4">
          <div className="flex items-center gap-3">
            <div className="h-3 w-3 rounded-full bg-gradient-to-br from-violet-500 via-cyan-400 to-emerald-400 shadow-[0_0_0_8px_rgba(124,58,237,0.12)]" />
            <div className="leading-tight">
              <div className="text-sm font-extrabold tracking-tight">SubTrack</div>
              <div className="text-xs opacity-70">Log in</div>
            </div>
          </div>

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
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-4 py-10">
        <div
          className="mx-auto max-w-xl rounded-3xl border p-6 shadow-2xl"
          style={{
            borderColor: light ? "rgba(15,23,42,0.10)" : "rgba(255,255,255,0.10)",
            background: light ? "rgba(255,255,255,0.85)" : "rgba(255,255,255,0.06)",
          }}
        >
          <h1 className="text-2xl font-extrabold tracking-tight">Welcome back</h1>
          <p className="mt-2 text-sm opacity-75">Log in with your email and password.</p>

          {/* ✅ Only show this when user came from guest homepage */}
          {fromGuest ? (
            <div
              className="mt-4 rounded-2xl border px-4 py-3 text-sm"
              style={{
                borderColor: light ? "rgba(16,185,129,0.20)" : "rgba(52,211,153,0.22)",
                background: light ? "rgba(236,253,245,0.92)" : "rgba(16,185,129,0.10)",
              }}
            >
              ✅ After you log in, your guest data will be imported into your account automatically.
            </div>
          ) : null}

          <form className="mt-6 grid gap-3" onSubmit={onLogin}>
            <label className="grid gap-2 text-xs font-semibold opacity-70">
              Email
              <input
                className="w-full rounded-2xl border px-4 py-3 text-sm outline-none transition focus:ring-4"
                style={{
                  borderColor: light ? "rgba(15,23,42,0.12)" : "rgba(255,255,255,0.12)",
                  background: light ? "white" : "rgba(2,6,23,0.25)",
                }}
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                autoComplete="email"
              />
            </label>

            <label className="grid gap-2 text-xs font-semibold opacity-70">
              Password
              <div className="relative">
                <input
                  className="w-full rounded-2xl border px-4 py-3 pr-12 text-sm outline-none transition focus:ring-4"
                  style={{
                    borderColor: light ? "rgba(15,23,42,0.12)" : "rgba(255,255,255,0.12)",
                    background: light ? "white" : "rgba(2,6,23,0.25)",
                  }}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  type={showPw ? "text" : "password"}
                  autoComplete="current-password"
                />
                <button
                  type="button"
                  onClick={() => setShowPw((s) => !s)}
                  className="absolute right-2 top-1/2 -translate-y-1/2 rounded-xl border px-2.5 py-1 text-xs font-semibold opacity-80 transition hover:opacity-100"
                  style={{
                    borderColor: light ? "rgba(15,23,42,0.12)" : "rgba(255,255,255,0.12)",
                    background: light ? "rgba(255,255,255,0.75)" : "rgba(255,255,255,0.08)",
                  }}
                >
                  {showPw ? "Hide" : "Show"}
                </button>
              </div>
            </label>

            <button
              className="rounded-2xl border px-4 py-3 text-sm font-semibold transition hover:-translate-y-0.5 hover:shadow-xl disabled:opacity-60"
              style={{
                borderColor: light ? "rgba(15,23,42,0.12)" : "rgba(255,255,255,0.12)",
                background:
                  "linear-gradient(90deg, rgba(124,58,237,0.18), rgba(34,211,238,0.14), rgba(52,211,153,0.12))",
              }}
              type="submit"
              disabled={loading}
            >
              {loading ? "Logging in…" : "Log in"}
            </button>

            {errorMsg ? (
              <div
                className="rounded-2xl border px-4 py-3 text-sm"
                style={{
                  borderColor: light ? "rgba(239,68,68,0.18)" : "rgba(248,113,113,0.22)",
                  background: light ? "rgba(254,242,242,0.9)" : "rgba(244,63,94,0.12)",
                  color: light ? "rgb(153,27,27)" : "rgba(255,255,255,0.92)",
                }}
              >
                {errorMsg}
              </div>
            ) : null}
          </form>

          <div className="mt-6 grid gap-3">
            <button
              className="rounded-2xl border px-4 py-3 text-sm font-semibold transition hover:-translate-y-0.5 hover:shadow-xl"
              style={{
                borderColor: light ? "rgba(15,23,42,0.12)" : "rgba(255,255,255,0.12)",
                background: light ? "white" : "rgba(255,255,255,0.06)",
              }}
              type="button"
              onClick={continueAsGuest}
            >
              Continue as guest
            </button>

            <div className="flex items-center justify-between text-sm">
              <span className="opacity-70">New here?</span>
              <Link className="font-semibold underline underline-offset-4" to="/signup">
                Create an account
              </Link>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
