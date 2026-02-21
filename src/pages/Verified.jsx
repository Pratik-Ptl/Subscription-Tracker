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
              <div className="text-xs opacity-70">Email confirmed</div>
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

      <main className="mx-auto max-w-5xl px-4 py-12">
        <div
          className="mx-auto max-w-xl rounded-3xl border p-7 shadow-2xl"
          style={{
            borderColor: light ? "rgba(15,23,42,0.10)" : "rgba(255,255,255,0.10)",
            background: light ? "rgba(255,255,255,0.90)" : "rgba(255,255,255,0.06)",
          }}
        >
          <h1 className="text-2xl font-extrabold tracking-tight">✅ Email confirmed</h1>
          <p className="mt-2 text-sm opacity-80">
            Your account is verified. You can log in now with your email and password.
          </p>

          <button
            className="mt-6 rounded-2xl border px-4 py-3 text-sm font-semibold transition hover:-translate-y-0.5 hover:shadow-xl"
            style={{
              borderColor: light ? "rgba(15,23,42,0.12)" : "rgba(255,255,255,0.12)",
              background: "linear-gradient(90deg, rgba(124,58,237,0.18), rgba(34,211,238,0.14), rgba(52,211,153,0.12))",
            }}
            onClick={() => nav("/login", { replace: true })}
            type="button"
          >
            Go to Login
          </button>
        </div>
      </main>
    </div>
  );
}
