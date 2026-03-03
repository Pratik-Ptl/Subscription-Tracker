// src/pages/ResetPassword.jsx
import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "../supabaseClient";

export default function ResetPassword({ theme, setTheme }) {
  const nav = useNavigate();
  const light = theme === "light";

  const [password, setPassword] = useState("");
  const [confirmPw, setConfirmPw] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");
  const [success, setSuccess] = useState(false);

  const bg = useMemo(() => {
    return light
      ? "radial-gradient(900px 600px at 14% 12%, rgba(124,58,237,0.12), transparent 60%), radial-gradient(900px 600px at 86% 22%, rgba(34,211,238,0.10), transparent 58%), linear-gradient(180deg, #f0f0ff, #ffffff)"
      : "radial-gradient(900px 600px at 14% 12%, rgba(124,58,237,0.22), transparent 60%), radial-gradient(900px 600px at 86% 22%, rgba(34,211,238,0.15), transparent 58%), linear-gradient(180deg, #020617, #0b1220)";
  }, [light]);

  const gc = light
    ? { bg: "rgba(255,255,255,0.82)", border: "rgba(15,23,42,0.10)", shadow: "0 8px 32px rgba(0,0,0,0.07), inset 0 1px 0 rgba(255,255,255,0.9)" }
    : { bg: "linear-gradient(135deg, rgba(255,255,255,0.08) 0%, rgba(255,255,255,0.03) 100%)", border: "rgba(255,255,255,0.12)", shadow: "0 8px 32px rgba(0,0,0,0.28), inset 0 1px 0 rgba(255,255,255,0.12)" };

  const inputStyle = {
    borderColor: light ? "rgba(15,23,42,0.12)" : "rgba(255,255,255,0.12)",
    background: light ? "rgba(255,255,255,0.9)" : "rgba(2,6,23,0.35)",
    backdropFilter: "blur(8px)",
  };

  async function onSubmit(e) {
    e.preventDefault();
    setErrorMsg("");

    if (!password || !confirmPw) {
      setErrorMsg("Please fill in both fields.");
      return;
    }
    if (password.length < 6) {
      setErrorMsg("Password must be at least 6 characters.");
      return;
    }
    if (password !== confirmPw) {
      setErrorMsg("Passwords do not match.");
      return;
    }

    setLoading(true);
    const { error } = await supabase.auth.updateUser({ password });
    setLoading(false);

    if (error) {
      setErrorMsg(error.message || "Failed to update password.");
      return;
    }

    setSuccess(true);
    // Sign out so they can log in fresh with new password
    await supabase.auth.signOut();
  }

  return (
    <div className="min-h-screen" style={{ backgroundImage: bg, color: light ? "#0b1220" : "white" }}>
      {/* Header */}
      <header className="sticky top-0 z-40 border-b" style={{ borderColor: light ? "rgba(15,23,42,0.08)" : "rgba(255,255,255,0.08)", background: light ? "rgba(255,255,255,0.75)" : "rgba(2,6,23,0.55)", backdropFilter: "blur(20px)" }}>
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3">
          <div className="flex items-center gap-3">
            <img src="/logo.svg" alt="SubTrack" className="h-8 w-8 rounded-xl flex-shrink-0" />
            <span className="font-extrabold tracking-tight">SubTrack</span>
          </div>
          <button className="rounded-full border px-3 py-1.5 text-xs font-semibold transition hover:-translate-y-0.5"
            style={{ borderColor: gc.border, background: light ? "white" : "rgba(255,255,255,0.06)" }}
            onClick={() => setTheme(t => t === "dark" ? "light" : "dark")} type="button">
            {theme === "dark" ? "☀ Light" : "☾ Dark"}
          </button>
        </div>
      </header>

      {/* Center card */}
      <div className="flex items-center justify-center px-4" style={{ minHeight: "calc(100vh - 57px)" }}>
        <div className="w-full max-w-sm rounded-3xl border p-8 card-in"
          style={{ background: light ? "rgba(255,255,255,0.85)" : "linear-gradient(135deg, rgba(255,255,255,0.08), rgba(255,255,255,0.03))", borderColor: gc.border, boxShadow: gc.shadow, backdropFilter: "blur(20px)" }}>

          {!success ? (
            <>
              {/* Icon */}
              <div className="mx-auto h-14 w-14 rounded-2xl flex items-center justify-center text-2xl"
                style={{ background: "linear-gradient(135deg, rgba(124,58,237,0.2), rgba(124,58,237,0.08))", border: "1px solid rgba(124,58,237,0.25)" }}>
                🔒
              </div>

              <h1 className="mt-5 text-center text-xl font-extrabold tracking-tight">Set new password</h1>
              <p className="mt-1.5 text-center text-sm" style={{ opacity: 0.6 }}>Enter your new password below</p>

              <form className="mt-6 grid gap-3" onSubmit={onSubmit}>
                <label className="grid gap-1.5 text-xs font-semibold" style={{ opacity: 0.7 }}>
                  New password
                  <div className="relative">
                    <input className="w-full rounded-2xl border px-4 py-3 pr-14 text-sm outline-none transition"
                      style={inputStyle}
                      value={password} onChange={e => setPassword(e.target.value)}
                      placeholder="••••••••" type={showPw ? "text" : "password"} autoComplete="new-password" />
                    <button type="button" onClick={() => setShowPw(s => !s)}
                      className="absolute right-2 top-1/2 -translate-y-1/2 rounded-xl border px-2.5 py-1 text-xs font-semibold transition hover:opacity-100"
                      style={{ borderColor: light ? "rgba(15,23,42,0.12)" : "rgba(255,255,255,0.12)", background: light ? "rgba(255,255,255,0.8)" : "rgba(255,255,255,0.08)", opacity: 0.8 }}>
                      {showPw ? "Hide" : "Show"}
                    </button>
                  </div>
                </label>

                <label className="grid gap-1.5 text-xs font-semibold" style={{ opacity: 0.7 }}>
                  Confirm password
                  <input className="w-full rounded-2xl border px-4 py-3 text-sm outline-none transition"
                    style={inputStyle}
                    value={confirmPw} onChange={e => setConfirmPw(e.target.value)}
                    placeholder="••••••••" type={showPw ? "text" : "password"} autoComplete="new-password" />
                </label>

                <button className="mt-1 rounded-2xl px-4 py-3 text-sm font-bold text-white transition hover:-translate-y-0.5 hover:shadow-xl disabled:opacity-60"
                  style={{ background: "linear-gradient(90deg, #7c3aed, #6d28d9)", boxShadow: "0 4px 16px rgba(124,58,237,0.4)" }}
                  type="submit" disabled={loading}>
                  {loading ? "Updating…" : "Update password"}
                </button>

                {errorMsg && (
                  <div className="rounded-2xl border px-4 py-3 text-sm"
                    style={{ borderColor: "rgba(248,113,113,0.3)", background: light ? "rgba(254,242,242,0.9)" : "rgba(244,63,94,0.12)", color: light ? "rgb(153,27,27)" : "rgba(255,255,255,0.9)" }}>
                    {errorMsg}
                  </div>
                )}
              </form>
            </>
          ) : (
            <>
              {/* Success state */}
              <div className="mx-auto h-14 w-14 rounded-2xl flex items-center justify-center text-2xl"
                style={{ background: "linear-gradient(135deg, rgba(16,185,129,0.2), rgba(16,185,129,0.08))", border: "1px solid rgba(16,185,129,0.25)" }}>
                ✓
              </div>

              <h1 className="mt-5 text-center text-xl font-extrabold tracking-tight">Password updated!</h1>
              <p className="mt-1.5 text-center text-sm" style={{ opacity: 0.6 }}>You can now sign in with your new password</p>

              <button className="mt-6 w-full rounded-2xl px-4 py-3 text-sm font-bold text-white transition hover:-translate-y-0.5 hover:shadow-xl"
                style={{ background: "linear-gradient(90deg, #7c3aed, #6d28d9)", boxShadow: "0 4px 16px rgba(124,58,237,0.4)" }}
                onClick={() => nav("/login", { replace: true })}>
                Go to login
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
