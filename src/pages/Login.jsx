// src/pages/Login.jsx
import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { supabase } from "../supabaseClient";

export default function Login({ theme, setTheme, enterGuest }) {
  const nav = useNavigate();
  const [params] = useSearchParams();

  const light = theme === "light";
  const fromGuest = params.get("fromGuest") === "1";
  const confirmed = params.get("confirmed") === "1";

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [loading, setLoading] = useState(false);
  const [toast, setToast] = useState(null);
  const [errorMsg, setErrorMsg] = useState("");

  // Forgot password state
  const [showForgot, setShowForgot] = useState(false);
  const [forgotEmail, setForgotEmail] = useState("");
  const [forgotLoading, setForgotLoading] = useState(false);
  const [forgotCooldown, setForgotCooldown] = useState(0);

  // Unconfirmed email popup state
  const [showConfirmPopup, setShowConfirmPopup] = useState(false);
  const [resendLoading, setResendLoading] = useState(false);
  const [resendCooldown, setResendCooldown] = useState(0);
  const [popupMsg, setPopupMsg] = useState("");

  const bg = useMemo(() => {
    return light
      ? "radial-gradient(900px 600px at 14% 12%, rgba(124,58,237,0.12), transparent 60%), radial-gradient(900px 600px at 86% 22%, rgba(34,211,238,0.10), transparent 58%), radial-gradient(900px 600px at 66% 88%, rgba(52,211,153,0.08), transparent 55%), linear-gradient(180deg, #f0f0ff, #ffffff)"
      : "radial-gradient(900px 600px at 14% 12%, rgba(124,58,237,0.22), transparent 60%), radial-gradient(900px 600px at 86% 22%, rgba(34,211,238,0.15), transparent 58%), radial-gradient(900px 600px at 66% 88%, rgba(52,211,153,0.12), transparent 55%), linear-gradient(180deg, #020617, #0b1220)";
  }, [light]);

  const gc = light
    ? { bg: "rgba(255,255,255,0.82)", border: "rgba(15,23,42,0.10)", shadow: "0 8px 32px rgba(0,0,0,0.07), inset 0 1px 0 rgba(255,255,255,0.9)" }
    : { bg: "linear-gradient(135deg, rgba(255,255,255,0.08) 0%, rgba(255,255,255,0.03) 100%)", border: "rgba(255,255,255,0.12)", shadow: "0 8px 32px rgba(0,0,0,0.28), inset 0 1px 0 rgba(255,255,255,0.12)" };

  const inputStyle = {
    borderColor: light ? "rgba(15,23,42,0.12)" : "rgba(255,255,255,0.12)",
    background: light ? "rgba(255,255,255,0.9)" : "rgba(2,6,23,0.35)",
    backdropFilter: "blur(8px)",
  };

  function popToast(text) { setToast(text); }

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 2600);
    return () => clearTimeout(t);
  }, [toast]);

  useEffect(() => {
    if (confirmed) popToast("✅ Email confirmed! You can log in now.");
  }, [confirmed]);

  // Cooldown timers
  useEffect(() => {
    if (forgotCooldown <= 0) return;
    const t = setTimeout(() => setForgotCooldown(c => c - 1), 1000);
    return () => clearTimeout(t);
  }, [forgotCooldown]);

  useEffect(() => {
    if (resendCooldown <= 0) return;
    const t = setTimeout(() => setResendCooldown(c => c - 1), 1000);
    return () => clearTimeout(t);
  }, [resendCooldown]);

  async function onLogin(e) {
    e.preventDefault();
    setErrorMsg("");
    const e1 = email.trim();
    if (!e1 || !password) { setErrorMsg("Please enter email and password."); return; }
    setLoading(true);
    const { error } = await supabase.auth.signInWithPassword({ email: e1, password });
    setLoading(false);
    if (error) {
      const msg = (error.message || "").toLowerCase();
      if (msg.includes("not confirmed") || msg.includes("email not confirmed")) {
        setShowConfirmPopup(true);
        setPopupMsg("");
        return;
      }
      setErrorMsg(error.message || "Login failed.");
      return;
    }
    nav("/app", { replace: true });
  }

  async function sendResetEmail() {
    const target = forgotEmail.trim();
    if (!target || forgotCooldown > 0) return;
    setForgotLoading(true);
    const redirectTo = `${window.location.origin}/reset-password`;
    const { error } = await supabase.auth.resetPasswordForEmail(target, { redirectTo });
    setForgotLoading(false);
    if (error) { popToast("Failed to send reset email"); return; }
    popToast("Check your email for a reset link");
    setForgotCooldown(60);
    setShowForgot(false);
  }

  async function resendConfirmation() {
    const target = email.trim().toLowerCase();
    if (!target || resendCooldown > 0) return;
    setResendLoading(true);
    setPopupMsg("");
    const emailRedirectTo = `${window.location.origin}/verified`;
    const { error } = await supabase.auth.resend({ type: "signup", email: target, options: { emailRedirectTo } });
    setResendLoading(false);
    if (error) { setPopupMsg("Failed to resend. Try again later."); return; }
    setPopupMsg("✅ Confirmation email sent! Check your inbox.");
    setResendCooldown(60);
  }

  function continueAsGuest() {
    enterGuest();
    nav("/app", { replace: true });
  }

  return (
    <div className="min-h-screen" style={{ backgroundImage: bg, color: light ? "#0b1220" : "white" }}>
      {/* Toast */}
      {toast && (
        <div className="fixed top-4 left-1/2 z-50 -translate-x-1/2 rounded-2xl border px-4 py-3 text-sm shadow-2xl"
          style={{ borderColor: gc.border, background: light ? "rgba(255,255,255,0.95)" : "rgba(15,23,42,0.85)", backdropFilter: "blur(20px)" }}>
          {toast}
        </div>
      )}

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

      {/* Split layout */}
      <div className="grid min-h-[calc(100vh-57px)] md:grid-cols-2">

        {/* Left — brand panel */}
        <aside className="relative hidden overflow-hidden md:flex md:flex-col md:justify-between p-10"
          style={{ background: light ? "rgba(124,58,237,0.04)" : "rgba(124,58,237,0.08)", borderRight: `1px solid ${light ? "rgba(124,58,237,0.12)" : "rgba(124,58,237,0.18)"}` }}>
          {/* Glow blob */}
          <div className="pointer-events-none absolute inset-0" style={{ background: "radial-gradient(60% 60% at 30% 40%, rgba(124,58,237,0.18), transparent), radial-gradient(40% 40% at 70% 70%, rgba(34,211,238,0.12), transparent)", filter: "blur(24px)" }} />

          <div className="relative">
            <img src="/logo.svg" alt="SubTrack" className="h-14 w-14 rounded-2xl shadow-lg" />
            <div className="mt-5 text-3xl font-extrabold tracking-tight" style={{ color: light ? "#3b0764" : "white" }}>SubTrack</div>
            <div className="mt-2 text-base" style={{ color: light ? "rgba(59,7,100,0.65)" : "rgba(255,255,255,0.55)" }}>
              Every subscription, always in view.
            </div>
          </div>

          <ul className="relative space-y-4 text-sm" style={{ color: light ? "rgba(59,7,100,0.7)" : "rgba(255,255,255,0.6)" }}>
            {["Track all subscriptions in one place", "Know exactly what's due and when", "Export and analyze your spending"].map(f => (
              <li key={f} className="flex items-center gap-2">
                <span style={{ color: "#7c3aed" }}>✦</span> {f}
              </li>
            ))}
          </ul>

          {/* Decorative mini-cards */}
          <div className="relative flex flex-col gap-3">
            {[
              { name: "Streaming", price: "$15.99/mo", due: "in 3 days", color: "#7c3aed" },
              { name: "Cloud Storage", price: "$2.99/mo", due: "in 8 days", color: "#22d3ee" },
              { name: "Music", price: "$10.99/mo", due: "in 12 days", color: "#ec4899" },
            ].map((s, i) => (
              <div key={s.name} className="rounded-2xl border p-3.5 card-in flex items-center gap-3"
                style={{ background: light ? "rgba(255,255,255,0.7)" : "linear-gradient(135deg, rgba(255,255,255,0.09), rgba(255,255,255,0.03))", borderColor: light ? "rgba(124,58,237,0.15)" : "rgba(255,255,255,0.12)", boxShadow: light ? "0 4px 16px rgba(124,58,237,0.1)" : "0 4px 20px rgba(0,0,0,0.3), inset 0 1px 0 rgba(255,255,255,0.10)", backdropFilter: "blur(16px)", animationDelay: `${i * 120}ms` }}>
                <div className="h-9 w-9 rounded-xl flex-shrink-0 flex items-center justify-center text-sm font-extrabold text-white" style={{ background: s.color, opacity: 0.85 }}>
                  {s.name[0]}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-bold">{s.name}</div>
                  <div className="text-xs" style={{ opacity: 0.5 }}>{s.price}</div>
                </div>
                <div className="text-xs font-semibold" style={{ color: "#10b981" }}>{s.due}</div>
              </div>
            ))}
          </div>
        </aside>

        {/* Right — form */}
        <div className="flex flex-col justify-center px-6 py-10 sm:px-12">
          <div className="mx-auto w-full max-w-sm">
            <h1 className="text-2xl font-extrabold tracking-tight">Welcome back</h1>
            <p className="mt-1.5 text-sm" style={{ opacity: 0.6 }}>Sign in to your account</p>

            {fromGuest && (
              <div className="mt-4 rounded-2xl border px-4 py-3 text-sm"
                style={{ borderColor: "rgba(16,185,129,0.25)", background: light ? "rgba(236,253,245,0.9)" : "rgba(16,185,129,0.10)" }}>
                ✅ After login, your guest data will be imported automatically.
              </div>
            )}

            <form className="mt-6 grid gap-3" onSubmit={onLogin}>
              <label className="grid gap-1.5 text-xs font-semibold" style={{ opacity: 0.7 }}>
                Email
                <input className="w-full rounded-2xl border px-4 py-3 text-sm outline-none transition focus:ring-2"
                  style={{ ...inputStyle, focusRingColor: "rgba(124,58,237,0.4)" }}
                  value={email} onChange={e => setEmail(e.target.value)}
                  placeholder="you@example.com" autoComplete="email" />
              </label>

              <label className="grid gap-1.5 text-xs font-semibold" style={{ opacity: 0.7 }}>
                Password
                <div className="relative">
                  <input className="w-full rounded-2xl border px-4 py-3 pr-14 text-sm outline-none transition"
                    style={inputStyle}
                    value={password} onChange={e => setPassword(e.target.value)}
                    placeholder="••••••••" type={showPw ? "text" : "password"} autoComplete="current-password" />
                  <button type="button" onClick={() => setShowPw(s => !s)}
                    className="absolute right-2 top-1/2 -translate-y-1/2 rounded-xl border px-2.5 py-1 text-xs font-semibold transition hover:opacity-100"
                    style={{ borderColor: light ? "rgba(15,23,42,0.12)" : "rgba(255,255,255,0.12)", background: light ? "rgba(255,255,255,0.8)" : "rgba(255,255,255,0.08)", opacity: 0.8 }}>
                    {showPw ? "Hide" : "Show"}
                  </button>
                </div>
              </label>

              <div className="flex justify-end -mt-1">
                <button type="button" className="text-xs font-semibold underline underline-offset-4 transition hover:opacity-80"
                  style={{ color: "#7c3aed" }}
                  onClick={() => { setForgotEmail(email); setShowForgot(true); }}>
                  Forgot password?
                </button>
              </div>

              <button className="rounded-2xl border px-4 py-3 text-sm font-bold text-white transition hover:-translate-y-0.5 hover:shadow-xl disabled:opacity-60"
                style={{ background: "linear-gradient(90deg, #7c3aed, #6d28d9)", border: "none", boxShadow: "0 4px 16px rgba(124,58,237,0.4)" }}
                type="submit" disabled={loading}>
                {loading ? "Signing in…" : "Sign in"}
              </button>

              {errorMsg && (
                <div className="rounded-2xl border px-4 py-3 text-sm"
                  style={{ borderColor: "rgba(248,113,113,0.3)", background: light ? "rgba(254,242,242,0.9)" : "rgba(244,63,94,0.12)", color: light ? "rgb(153,27,27)" : "rgba(255,255,255,0.9)" }}>
                  {errorMsg}
                </div>
              )}
            </form>

            <div className="mt-4 grid gap-2">
              <button className="rounded-2xl border px-4 py-3 text-sm font-semibold transition hover:-translate-y-0.5"
                style={{ borderColor: gc.border, borderStyle: "dashed", background: light ? "rgba(255,255,255,0.5)" : "rgba(255,255,255,0.03)" }}
                type="button" onClick={continueAsGuest}>
                Continue as guest
              </button>

              <div className="flex items-center justify-between pt-1 text-sm">
                <span style={{ opacity: 0.6 }}>New here?</span>
                <Link className="font-semibold underline underline-offset-4" to="/signup" style={{ color: "#7c3aed" }}>
                  Create account
                </Link>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Forgot Password Modal */}
      {showForgot && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: "rgba(0,0,0,0.5)", backdropFilter: "blur(6px)" }}
          onClick={e => { if (e.target === e.currentTarget) setShowForgot(false); }}>
          <div className="w-full max-w-sm rounded-3xl border p-6 card-in"
            style={{ background: light ? "rgba(255,255,255,0.95)" : "linear-gradient(135deg, rgba(15,23,42,0.95), rgba(15,23,42,0.88))", borderColor: gc.border, boxShadow: gc.shadow, backdropFilter: "blur(20px)" }}>
            <div className="text-lg font-extrabold">Reset password</div>
            <p className="mt-1.5 text-sm" style={{ opacity: 0.6 }}>We'll send a reset link to your email</p>

            <input className="mt-4 w-full rounded-2xl border px-4 py-3 text-sm outline-none transition focus:ring-2"
              style={{ ...inputStyle, focusRingColor: "rgba(124,58,237,0.4)" }}
              value={forgotEmail} onChange={e => setForgotEmail(e.target.value)}
              placeholder="you@example.com" autoComplete="email" />

            <div className="mt-4 flex gap-2">
              <button type="button" className="flex-1 rounded-2xl border px-4 py-3 text-sm font-semibold transition hover:-translate-y-0.5"
                style={{ borderColor: gc.border, background: light ? "rgba(255,255,255,0.5)" : "rgba(255,255,255,0.06)" }}
                onClick={() => setShowForgot(false)}>
                Cancel
              </button>
              <button type="button"
                className="flex-1 rounded-2xl px-4 py-3 text-sm font-bold text-white transition hover:-translate-y-0.5 hover:shadow-xl disabled:opacity-60"
                style={{ background: "linear-gradient(90deg, #7c3aed, #6d28d9)", boxShadow: "0 4px 16px rgba(124,58,237,0.4)" }}
                disabled={forgotLoading || forgotCooldown > 0 || !forgotEmail.trim()}
                onClick={sendResetEmail}>
                {forgotLoading ? "Sending…" : forgotCooldown > 0 ? `Wait ${forgotCooldown}s` : "Send reset link"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Unconfirmed Email Popup */}
      {showConfirmPopup && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: "rgba(0,0,0,0.5)", backdropFilter: "blur(6px)" }}
          onClick={e => { if (e.target === e.currentTarget) setShowConfirmPopup(false); }}>
          <div className="w-full max-w-sm rounded-3xl border p-6 card-in"
            style={{ background: light ? "rgba(255,255,255,0.95)" : "linear-gradient(135deg, rgba(15,23,42,0.95), rgba(15,23,42,0.88))", borderColor: gc.border, boxShadow: gc.shadow, backdropFilter: "blur(20px)" }}>

            <div className="flex items-center gap-3">
              <div className="h-11 w-11 rounded-2xl flex-shrink-0 flex items-center justify-center text-lg"
                style={{ background: "linear-gradient(135deg, rgba(245,158,11,0.2), rgba(245,158,11,0.08))", border: "1px solid rgba(245,158,11,0.25)" }}>
                ✉
              </div>
              <div>
                <div className="text-base font-extrabold">Email not confirmed</div>
                <p className="text-sm" style={{ opacity: 0.6 }}>Check your inbox or resend it</p>
              </div>
            </div>

            <div className="mt-4 rounded-2xl border px-4 py-3 text-sm"
              style={{ borderColor: "rgba(245,158,11,0.25)", background: light ? "rgba(255,251,235,0.9)" : "rgba(245,158,11,0.08)" }}>
              Your account exists but the email <strong>{email.trim()}</strong> hasn't been verified yet. Check your inbox (and spam folder) or resend the confirmation.
            </div>

            {popupMsg && (
              <div className="mt-3 rounded-2xl border px-4 py-3 text-sm"
                style={{ borderColor: popupMsg.includes("✅") ? "rgba(16,185,129,0.25)" : "rgba(248,113,113,0.3)",
                  background: popupMsg.includes("✅") ? (light ? "rgba(236,253,245,0.9)" : "rgba(16,185,129,0.10)") : (light ? "rgba(254,242,242,0.9)" : "rgba(244,63,94,0.12)") }}>
                {popupMsg}
              </div>
            )}

            <div className="mt-4 flex gap-2">
              <button type="button" className="flex-1 rounded-2xl border px-4 py-3 text-sm font-semibold transition hover:-translate-y-0.5"
                style={{ borderColor: gc.border, background: light ? "rgba(255,255,255,0.5)" : "rgba(255,255,255,0.06)" }}
                onClick={() => setShowConfirmPopup(false)}>
                Close
              </button>
              <button type="button"
                className="flex-1 rounded-2xl px-4 py-3 text-sm font-bold text-white transition hover:-translate-y-0.5 hover:shadow-xl disabled:opacity-60"
                style={{ background: "linear-gradient(90deg, #f59e0b, #d97706)", boxShadow: "0 4px 16px rgba(245,158,11,0.35)" }}
                disabled={resendLoading || resendCooldown > 0}
                onClick={resendConfirmation}>
                {resendLoading ? "Sending…" : resendCooldown > 0 ? `Resend in ${resendCooldown}s` : "Resend confirmation"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
