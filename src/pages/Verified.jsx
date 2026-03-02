import { useEffect, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "../supabaseClient";

export default function Verified({ theme, setTheme }) {
  const nav = useNavigate();
  const light = theme === "light";

  const bg = useMemo(() => {
    return light
      ? "radial-gradient(900px 600px at 14% 12%, rgba(124,58,237,0.10), transparent 60%), radial-gradient(900px 600px at 86% 22%, rgba(34,211,238,0.08), transparent 58%), radial-gradient(900px 600px at 66% 88%, rgba(52,211,153,0.06), transparent 55%), linear-gradient(180deg, #f6f7ff, #ffffff)"
      : "radial-gradient(900px 600px at 14% 12%, rgba(124,58,237,0.18), transparent 60%), radial-gradient(900px 600px at 86% 22%, rgba(34,211,238,0.12), transparent 58%), radial-gradient(900px 600px at 66% 88%, rgba(52,211,153,0.09), transparent 55%), linear-gradient(180deg, #020617, #0b1220)";
  }, [light]);

  useEffect(() => {
    // If confirm link created a session, sign out so user can log in normally.
    supabase.auth.signOut().catch(() => {});
  }, []);

  return (
    <div className="min-h-screen" style={{ backgroundImage: bg, color: light ? "#0b1220" : "white" }}>
      <header
        className="sticky top-0 z-40 border-b"
        style={{
          borderColor: light ? "rgba(15,23,42,0.08)" : "rgba(255,255,255,0.08)",
          background: light ? "rgba(255,255,255,0.75)" : "rgba(2,6,23,0.55)",
          backdropFilter: "blur(20px)",
        }}
      >
        <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-3">
          <div className="flex items-center gap-3">
            <img src="/logo.svg" alt="SubTrack" className="h-8 w-8 rounded-xl flex-shrink-0" />
            <div className="leading-tight">
              <div className="text-sm font-extrabold tracking-tight">SubTrack</div>
              <div className="text-xs opacity-60">Email confirmed</div>
            </div>
          </div>

          <button
            className="rounded-full border px-3 py-1.5 text-xs font-semibold transition hover:-translate-y-0.5"
            style={{
              borderColor: light ? "rgba(15,23,42,0.12)" : "rgba(255,255,255,0.12)",
              background: light ? "white" : "rgba(255,255,255,0.06)",
            }}
            onClick={() => setTheme((t) => (t === "dark" ? "light" : "dark"))}
            type="button"
          >
            {theme === "dark" ? "☀ Light" : "☾ Dark"}
          </button>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-4 py-12">
        <div
          className="mx-auto max-w-md rounded-3xl border p-8 shadow-2xl text-center card-in"
          style={{
            borderColor: light ? "rgba(15,23,42,0.10)" : "rgba(255,255,255,0.12)",
            background: light ? "rgba(255,255,255,0.90)" : "linear-gradient(135deg, rgba(255,255,255,0.09) 0%, rgba(255,255,255,0.03) 100%)",
            boxShadow: light ? "0 8px 32px rgba(0,0,0,0.07), inset 0 1px 0 rgba(255,255,255,0.9)" : "0 8px 32px rgba(0,0,0,0.28), 0 0 60px -20px rgba(52,211,153,0.3), inset 0 1px 0 rgba(255,255,255,0.12)",
            backdropFilter: "blur(20px)",
          }}
        >
          <div className="mx-auto mb-4 h-14 w-14 rounded-2xl flex items-center justify-center text-3xl"
            style={{ background: "linear-gradient(135deg, rgba(16,185,129,0.2), rgba(52,211,153,0.15))", border: "1px solid rgba(52,211,153,0.3)" }}>
            ✅
          </div>
          <h1 className="text-2xl font-extrabold tracking-tight">Email confirmed!</h1>
          <p className="mt-2 text-sm opacity-70">
            Your account is verified. You can log in now with your email and password.
          </p>

          <button
            className="mt-6 w-full rounded-2xl px-4 py-3 text-sm font-bold text-white transition hover:-translate-y-0.5 hover:shadow-xl"
            style={{
              background: "linear-gradient(90deg, #7c3aed, #6d28d9)",
              boxShadow: "0 4px 16px rgba(124,58,237,0.4)",
              border: "none",
            }}
            onClick={() => nav("/login", { replace: true })}
            type="button"
          >
            Go to Login →
          </button>
        </div>
      </main>
    </div>
  );
}
