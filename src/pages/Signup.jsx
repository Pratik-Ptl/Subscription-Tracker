import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "../supabaseClient";

export default function Signup({ theme, setTheme }) {
  const light = theme === "light";

  const [step, setStep] = useState(1);

  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [dob, setDob] = useState("");
  const [gender, setGender] = useState("male");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [photo, setPhoto] = useState(null);

  const [showPw, setShowPw] = useState(false);
  const [loading, setLoading] = useState(false);

  const [toast, setToast] = useState(null);
  const [msg, setMsg] = useState("");
  const [errorMsg, setErrorMsg] = useState("");

  const [submittedOnce, setSubmittedOnce] = useState(false);
  const [resendEmail, setResendEmail] = useState("");
  const [resendMsg, setResendMsg] = useState("");
  const [resendCooldown, setResendCooldown] = useState(0);
  const [resending, setResending] = useState(false);

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
    if (resendCooldown <= 0) return;
    const t = setInterval(() => setResendCooldown(c => Math.max(0, c - 1)), 1000);
    return () => clearInterval(t);
  }, [resendCooldown]);

  function validateStep1() {
    if (!firstName.trim()) return "First name is required.";
    if (!lastName.trim()) return "Last name is required.";
    if (!dob) return "Date of birth is required.";
    if (!gender) return "Gender is required.";
    return "";
  }

  function validateStep2() {
    if (!email.trim()) return "Email is required.";
    if (!password) return "Password is required.";
    if (password.length < 8) return "Password must be at least 8 characters.";
    return "";
  }

  function onNext(e) {
    e.preventDefault();
    setErrorMsg("");
    const v = validateStep1();
    if (v) { setErrorMsg(v); popToast(v); return; }
    setStep(2);
  }

  async function checkEmailStatus(emailLower) {
    const { data, error } = await supabase.functions.invoke("check-email", { body: { email: emailLower } });
    if (error) throw error;
    return data;
  }

  async function resendConfirmation(targetEmail) {
    const e = String(targetEmail || "").trim().toLowerCase();
    if (!e || resendCooldown > 0) return;
    setResending(true);
    setResendMsg("");
    setErrorMsg("");
    const emailRedirectTo = `${window.location.origin}/verified`;
    const { error } = await supabase.auth.resend({ type: "signup", email: e, options: { emailRedirectTo } });
    setResending(false);
    if (error) { setErrorMsg(error.message); popToast("Resend failed"); return; }
    setResendMsg("✅ Confirmation email resent. Check inbox/spam.");
    setResendCooldown(60);
    popToast("Confirmation resent ✅");
  }

  async function onSignup(e) {
    e.preventDefault();
    setMsg("");
    setErrorMsg("");
    setResendMsg("");
    const v = validateStep2();
    if (v) { popToast(v); setErrorMsg(v); return; }

    const emailLower = email.trim().toLowerCase();
    setSubmittedOnce(true);
    setResendEmail(emailLower);
    setLoading(true);

    try {
      const status = await checkEmailStatus(emailLower);
      if (status?.exists && status?.confirmed) {
        setLoading(false);
        setErrorMsg("This email is already registered. Please log in instead.");
        popToast("Already registered");
        return;
      }
      if (status?.exists && !status?.confirmed) {
        setLoading(false);
        setErrorMsg("This email is registered but not confirmed yet.");
        popToast("Not confirmed yet");
        return;
      }
    } catch {}

    const emailRedirectTo = `${window.location.origin}/verified`;
    const { data, error } = await supabase.auth.signUp({
      email: emailLower,
      password,
      options: {
        emailRedirectTo,
        data: { first_name: firstName.trim(), last_name: lastName.trim(), dob, gender, avatar_url: "" },
      },
    });

    setLoading(false);

    if (error) {
      const m = (error.message || "").toLowerCase();
      setErrorMsg(m.includes("already") && m.includes("registered")
        ? "This email is already registered. Please log in instead."
        : error.message);
      popToast("Signup failed");
      return;
    }

    setMsg(photo
      ? "✅ Account created! Check your email to confirm. (Upload your photo after you log in.)"
      : "✅ Account created! Check your email to confirm, then log in.");
    popToast("Check your email ✅");
    if (data?.session) setMsg("✅ Signed up and logged in.");
  }

  return (
    <div className="min-h-screen" style={{ backgroundImage: bg, color: light ? "#0b1220" : "white" }}>
      {toast && (
        <div className="fixed top-4 left-1/2 z-50 -translate-x-1/2 rounded-2xl border px-4 py-3 text-sm shadow-2xl"
          style={{ borderColor: gc.border, background: light ? "rgba(255,255,255,0.95)" : "rgba(15,23,42,0.85)", backdropFilter: "blur(20px)" }}>
          {toast}
        </div>
      )}

      <header className="sticky top-0 z-40 border-b" style={{ borderColor: light ? "rgba(15,23,42,0.08)" : "rgba(255,255,255,0.08)", background: light ? "rgba(255,255,255,0.75)" : "rgba(2,6,23,0.55)", backdropFilter: "blur(20px)" }}>
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3">
          <div className="flex items-center gap-3">
            <div className="h-8 w-8 rounded-xl flex-shrink-0" style={{ background: "linear-gradient(135deg, #7c3aed, #22d3ee, #10b981)" }} />
            <span className="font-extrabold tracking-tight">SubTrack</span>
          </div>
          <button className="rounded-full border px-3 py-1.5 text-xs font-semibold transition hover:-translate-y-0.5"
            style={{ borderColor: gc.border, background: light ? "white" : "rgba(255,255,255,0.06)" }}
            onClick={() => setTheme(t => t === "dark" ? "light" : "dark")} type="button">
            {theme === "dark" ? "☀ Light" : "☾ Dark"}
          </button>
        </div>
      </header>

      <main className="mx-auto max-w-xl px-4 py-10">
        <div className="rounded-3xl border p-6 shadow-2xl"
          style={{ borderColor: gc.border, background: gc.bg, boxShadow: gc.shadow, backdropFilter: "blur(20px)" }}>

          {/* Step indicator */}
          <div className="flex items-center gap-2 mb-6">
            {[1, 2].map(n => (
              <div key={n} className="flex items-center gap-2">
                <div style={{
                  width: 28, height: 28, borderRadius: "50%", display: "grid", placeItems: "center",
                  fontSize: 12, fontWeight: 800,
                  background: step >= n ? "linear-gradient(135deg, #7c3aed, #22d3ee)" : (light ? "rgba(15,23,42,0.08)" : "rgba(255,255,255,0.08)"),
                  color: step >= n ? "white" : (light ? "rgba(15,23,42,0.35)" : "rgba(255,255,255,0.35)"),
                  transition: "all 0.3s",
                }}>{n}</div>
                {n < 2 && (
                  <div style={{ width: 36, height: 2, borderRadius: 2, background: step > n ? "rgba(124,58,237,0.6)" : (light ? "rgba(15,23,42,0.12)" : "rgba(255,255,255,0.12)"), transition: "background 0.3s" }} />
                )}
              </div>
            ))}
            <span className="ml-2 text-xs" style={{ opacity: 0.5 }}>
              {step === 1 ? "Personal info" : "Your account"}
            </span>
          </div>

          <h1 className="text-2xl font-extrabold tracking-tight">
            {step === 1 ? "Tell us about you" : "Create your account"}
          </h1>
          <p className="mt-1.5 text-sm" style={{ opacity: 0.6 }}>
            {step === 1 ? "Step 1 of 2 — personal details" : "Step 2 of 2 — email & password"}
          </p>

          {/* Step 1 */}
          {step === 1 && (
            <form className="mt-6 grid gap-3" onSubmit={onNext}>
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="grid gap-1.5 text-xs font-semibold" style={{ opacity: 0.7 }}>
                  First name *
                  <input className="w-full rounded-2xl border px-4 py-3 text-sm outline-none transition"
                    style={inputStyle} value={firstName} onChange={e => setFirstName(e.target.value)} placeholder="First Name" />
                </label>
                <label className="grid gap-1.5 text-xs font-semibold" style={{ opacity: 0.7 }}>
                  Last name *
                  <input className="w-full rounded-2xl border px-4 py-3 text-sm outline-none transition"
                    style={inputStyle} value={lastName} onChange={e => setLastName(e.target.value)} placeholder="Last Name" />
                </label>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <label className="grid gap-1.5 text-xs font-semibold" style={{ opacity: 0.7 }}>
                  Date of birth *
                  <input type="date" className="w-full rounded-2xl border px-4 py-3 text-sm outline-none transition"
                    style={inputStyle} value={dob} onChange={e => setDob(e.target.value)} />
                </label>
                <label className="grid gap-1.5 text-xs font-semibold" style={{ opacity: 0.7 }}>
                  Gender *
                  <select className="w-full rounded-2xl border px-4 py-3 text-sm outline-none transition"
                    style={inputStyle} value={gender} onChange={e => setGender(e.target.value)}>
                    <option value="male">Male</option>
                    <option value="female">Female</option>
                    <option value="other">Other</option>
                  </select>
                </label>
              </div>

              <label className="grid gap-1.5 text-xs font-semibold" style={{ opacity: 0.7 }}>
                Profile photo <span className="font-normal" style={{ opacity: 0.6 }}>(optional)</span>
                <input type="file" accept="image/*" className="w-full rounded-2xl border px-4 py-3 text-sm outline-none"
                  style={inputStyle} onChange={e => setPhoto(e.target.files?.[0] || null)} />
              </label>

              {errorMsg && (
                <div className="rounded-2xl border px-4 py-3 text-sm"
                  style={{ borderColor: "rgba(248,113,113,0.3)", background: light ? "rgba(254,242,242,0.9)" : "rgba(244,63,94,0.12)", color: light ? "rgb(153,27,27)" : "rgba(255,255,255,0.9)" }}>
                  {errorMsg}
                </div>
              )}

              <button className="rounded-2xl px-4 py-3 text-sm font-bold text-white transition hover:-translate-y-0.5 hover:shadow-xl"
                style={{ background: "linear-gradient(90deg, #7c3aed, #6d28d9)", boxShadow: "0 4px 16px rgba(124,58,237,0.4)" }}
                type="submit">
                Next →
              </button>

              <div className="flex items-center justify-between text-sm pt-1">
                <span style={{ opacity: 0.6 }}>Already have an account?</span>
                <Link className="font-semibold underline underline-offset-4" to="/login" style={{ color: "#7c3aed" }}>Log in</Link>
              </div>
            </form>
          )}

          {/* Step 2 */}
          {step === 2 && (
            <form className="mt-6 grid gap-3" onSubmit={onSignup}>
              <label className="grid gap-1.5 text-xs font-semibold" style={{ opacity: 0.7 }}>
                Email *
                <input className="w-full rounded-2xl border px-4 py-3 text-sm outline-none transition"
                  style={inputStyle} value={email} onChange={e => setEmail(e.target.value)}
                  placeholder="you@example.com" autoComplete="email" />
              </label>

              <label className="grid gap-1.5 text-xs font-semibold" style={{ opacity: 0.7 }}>
                Password * <span className="font-normal" style={{ opacity: 0.6 }}>(min 8 chars)</span>
                <div className="relative">
                  <input className="w-full rounded-2xl border px-4 py-3 pr-14 text-sm outline-none transition"
                    style={inputStyle} value={password} onChange={e => setPassword(e.target.value)}
                    placeholder="••••••••" type={showPw ? "text" : "password"} autoComplete="new-password" />
                  <button type="button" onClick={() => setShowPw(s => !s)}
                    className="absolute right-2 top-1/2 -translate-y-1/2 rounded-xl border px-2.5 py-1 text-xs font-semibold transition hover:opacity-100"
                    style={{ borderColor: light ? "rgba(15,23,42,0.12)" : "rgba(255,255,255,0.12)", background: light ? "rgba(255,255,255,0.8)" : "rgba(255,255,255,0.08)", opacity: 0.8 }}>
                    {showPw ? "Hide" : "Show"}
                  </button>
                </div>
              </label>

              <button className="rounded-2xl px-4 py-3 text-sm font-bold text-white transition hover:-translate-y-0.5 hover:shadow-xl disabled:opacity-60"
                style={{ background: "linear-gradient(90deg, #7c3aed, #6d28d9)", boxShadow: "0 4px 16px rgba(124,58,237,0.4)" }}
                type="submit" disabled={loading}>
                {loading ? "Creating account…" : "Create account"}
              </button>

              <button type="button" onClick={() => { setErrorMsg(""); setStep(1); }}
                className="rounded-2xl border px-4 py-2.5 text-sm font-semibold transition hover:opacity-80"
                style={{ borderColor: gc.border, background: "transparent", opacity: 0.7 }}>
                ← Back
              </button>

              {errorMsg && (
                <div className="rounded-2xl border px-4 py-3 text-sm"
                  style={{ borderColor: "rgba(248,113,113,0.3)", background: light ? "rgba(254,242,242,0.9)" : "rgba(244,63,94,0.12)", color: light ? "rgb(153,27,27)" : "rgba(255,255,255,0.9)" }}>
                  {errorMsg}
                </div>
              )}

              {msg && <div className="rounded-2xl border px-4 py-3 text-sm" style={{ borderColor: "rgba(52,211,153,0.25)", background: light ? "rgba(236,253,245,0.9)" : "rgba(16,185,129,0.10)" }}>{msg}</div>}

              {submittedOnce && (
                <div className="rounded-2xl border px-4 py-3 text-sm"
                  style={{ borderColor: gc.border, background: light ? "rgba(255,255,255,0.6)" : "rgba(255,255,255,0.04)" }}>
                  <div className="font-semibold">Didn't get the email?</div>
                  <div className="mt-1" style={{ opacity: 0.7 }}>We'll resend to: <span className="font-semibold">{resendEmail}</span></div>
                  {resendMsg && <div className="mt-1.5" style={{ opacity: 0.8 }}>{resendMsg}</div>}
                  <button type="button" onClick={() => resendConfirmation(resendEmail)}
                    disabled={resending || resendCooldown > 0 || !resendEmail}
                    className="mt-3 rounded-2xl border px-4 py-2 text-sm font-semibold transition hover:-translate-y-0.5 disabled:opacity-60"
                    style={{ borderColor: gc.border, background: light ? "white" : "rgba(255,255,255,0.06)" }}>
                    {resendCooldown > 0 ? `Resend in ${resendCooldown}s` : resending ? "Resending…" : "Resend confirmation email"}
                  </button>
                </div>
              )}
            </form>
          )}
        </div>
      </main>
    </div>
  );
}
