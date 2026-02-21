import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "../supabaseClient";

export default function Signup({ theme, setTheme }) {
  const light = theme === "light";

  // required fields
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [dob, setDob] = useState("");
  const [gender, setGender] = useState("male");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  // optional photo (we’ll upload later in Profile page)
  const [photo, setPhoto] = useState(null);

  const [showPw, setShowPw] = useState(false);
  const [loading, setLoading] = useState(false);

  const [toast, setToast] = useState(null);
  const [msg, setMsg] = useState("");
  const [errorMsg, setErrorMsg] = useState("");

  // After submit, we may show resend UI (signup page only)
  const [submittedOnce, setSubmittedOnce] = useState(false);
  const [resendEmail, setResendEmail] = useState("");
  const [resendMsg, setResendMsg] = useState("");
  const [resendCooldown, setResendCooldown] = useState(0);
  const [resending, setResending] = useState(false);

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
    if (resendCooldown <= 0) return;
    const t = setInterval(() => setResendCooldown((c) => Math.max(0, c - 1)), 1000);
    return () => clearInterval(t);
  }, [resendCooldown]);

  function validate() {
    if (!firstName.trim()) return "First name is required.";
    if (!lastName.trim()) return "Last name is required.";
    if (!dob) return "Date of birth is required.";
    if (!gender) return "Gender is required.";
    if (!email.trim()) return "Email is required.";
    if (!password) return "Password is required.";
    if (password.length < 8) return "Password should be at least 8 characters.";
    return "";
  }

  async function checkEmailStatus(emailLower) {
    // Calls your deployed Edge Function: check-email
    const { data, error } = await supabase.functions.invoke("check-email", {
      body: { email: emailLower },
    });

    if (error) throw error;
    // expected: { exists: boolean, confirmed: boolean }
    return data;
  }

  async function resendConfirmation(targetEmail) {
    const e = String(targetEmail || "").trim().toLowerCase();
    if (!e) return;

    if (resendCooldown > 0) return;

    setResending(true);
    setResendMsg("");
    setErrorMsg("");

    // After clicking confirm, user lands on /verified
    const emailRedirectTo = `${window.location.origin}/verified`;

    const { error } = await supabase.auth.resend({
      type: "signup",
      email: e,
      options: { emailRedirectTo },
    });

    setResending(false);

    if (error) {
      setErrorMsg(error.message);
      popToast("Resend failed");
      return;
    }

    setResendMsg("✅ Confirmation email resent. Check inbox/spam, then come back to log in.");
    setResendCooldown(60);
    popToast("Confirmation resent ✅");
  }

  async function onSignup(e) {
    e.preventDefault();
    setMsg("");
    setErrorMsg("");
    setResendMsg("");

    const v = validate();
    if (v) {
      popToast(v);
      setErrorMsg(v);
      return;
    }

    const emailLower = email.trim().toLowerCase();
    setSubmittedOnce(true);
    setResendEmail(emailLower);

    setLoading(true);

    // 1) Pre-check: already exists?
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
        setErrorMsg("This email is registered but not confirmed yet. Please confirm your email to log in.");
        popToast("Not confirmed yet");
        // Show resend UI (only because they clicked signup)
        return;
      }
    } catch (err) {
      // If function fails, we still attempt signup (don’t block)
      // But we keep it quiet to avoid confusing UX
    }

    // 2) Signup
    const emailRedirectTo = `${window.location.origin}/verified`;

    const { data, error } = await supabase.auth.signUp({
      email: emailLower,
      password,
      options: {
        emailRedirectTo,
        data: {
          first_name: firstName.trim(),
          last_name: lastName.trim(),
          dob,
          gender,
          // We’ll upload photo later and store URL then:
          avatar_url: "",
        },
      },
    });

    setLoading(false);

    if (error) {
      // Sometimes Supabase hides “already registered”, but if it does appear:
      const m = (error.message || "").toLowerCase();
      if (m.includes("already") && m.includes("registered")) {
        setErrorMsg("This email is already registered. Please log in instead.");
      } else {
        setErrorMsg(error.message);
      }
      popToast("Signup failed");
      return;
    }

    // Photo upload: skip for now (no session if email confirmation is ON)
    if (photo) {
      // We’ll do avatar upload later on Profile page after login
      setMsg("✅ Account created. Please confirm your email. (Photo upload will be available after you log in.)");
    } else {
      setMsg("✅ Account created. Please check your email to confirm your account, then log in.");
    }

    popToast("Check your email ✅");

    // If confirm email is OFF, user might be logged in immediately:
    if (data?.session) {
      setMsg("✅ Signed up and logged in.");
    }
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
              <div className="text-xs opacity-70">Sign up</div>
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
          <h1 className="text-2xl font-extrabold tracking-tight">Create your account</h1>
          <p className="mt-2 text-sm opacity-75">
            After signup, you must confirm your email before you can log in.
          </p>

          <form className="mt-6 grid gap-3" onSubmit={onSignup}>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="grid gap-2 text-xs font-semibold opacity-70">
                First name *
                <input
                  className="w-full rounded-2xl border px-4 py-3 text-sm outline-none transition focus:ring-4"
                  style={{
                    borderColor: light ? "rgba(15,23,42,0.12)" : "rgba(255,255,255,0.12)",
                    background: light ? "white" : "rgba(2,6,23,0.25)",
                  }}
                  value={firstName}
                  onChange={(e) => setFirstName(e.target.value)}
                  placeholder="First Name"
                />
              </label>

              <label className="grid gap-2 text-xs font-semibold opacity-70">
                Last name *
                <input
                  className="w-full rounded-2xl border px-4 py-3 text-sm outline-none transition focus:ring-4"
                  style={{
                    borderColor: light ? "rgba(15,23,42,0.12)" : "rgba(255,255,255,0.12)",
                    background: light ? "white" : "rgba(2,6,23,0.25)",
                  }}
                  value={lastName}
                  onChange={(e) => setLastName(e.target.value)}
                  placeholder="Last Name"
                />
              </label>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <label className="grid gap-2 text-xs font-semibold opacity-70">
                Date of birth *
                <input
                  type="date"
                  className="w-full rounded-2xl border px-4 py-3 text-sm outline-none transition focus:ring-4"
                  style={{
                    borderColor: light ? "rgba(15,23,42,0.12)" : "rgba(255,255,255,0.12)",
                    background: light ? "white" : "rgba(2,6,23,0.25)",
                  }}
                  value={dob}
                  onChange={(e) => setDob(e.target.value)}
                />
              </label>

              <label className="grid gap-2 text-xs font-semibold opacity-70">
                Gender *
                <select
                  className="w-full rounded-2xl border px-4 py-3 text-sm outline-none transition focus:ring-4"
                  style={{
                    borderColor: light ? "rgba(15,23,42,0.12)" : "rgba(255,255,255,0.12)",
                    background: light ? "white" : "rgba(2,6,23,0.25)",
                  }}
                  value={gender}
                  onChange={(e) => setGender(e.target.value)}
                >
                  <option value="male">Male</option>
                  <option value="female">Female</option>
                  <option value="other">Other</option>
                </select>
              </label>
            </div>

            <label className="grid gap-2 text-xs font-semibold opacity-70">
              Email *
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
              Password * <span className="font-normal opacity-70">(min 8 chars)</span>
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
                  autoComplete="new-password"
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

            <label className="grid gap-2 text-xs font-semibold opacity-70">
              Profile photo <span className="font-normal opacity-70">(optional)</span>
              <input
                type="file"
                accept="image/*"
                className="w-full rounded-2xl border px-4 py-3 text-sm outline-none"
                style={{
                  borderColor: light ? "rgba(15,23,42,0.12)" : "rgba(255,255,255,0.12)",
                  background: light ? "white" : "rgba(2,6,23,0.25)",
                }}
                onChange={(e) => setPhoto(e.target.files?.[0] || null)}
              />
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
              {loading ? "Creating account…" : "Create account"}
            </button>

            {/* Errors */}
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

            {/* Success message */}
            {msg ? <div className="text-sm opacity-80">{msg}</div> : null}

            {/* Resend section — ONLY after the user clicked signup once */}
            {submittedOnce ? (
              <div
                className="rounded-2xl border px-4 py-3 text-sm"
                style={{
                  borderColor: light ? "rgba(15,23,42,0.10)" : "rgba(255,255,255,0.10)",
                  background: light ? "rgba(255,255,255,0.75)" : "rgba(255,255,255,0.05)",
                }}
              >
                <div className="font-semibold">Didn’t get the confirmation email?</div>
                <div className="mt-1 opacity-75">
                  We’ll resend it to: <span className="font-semibold">{resendEmail}</span>
                </div>

                {resendMsg ? <div className="mt-2 opacity-80">{resendMsg}</div> : null}

                <button
                  type="button"
                  onClick={() => resendConfirmation(resendEmail)}
                  disabled={resending || resendCooldown > 0 || !resendEmail}
                  className="mt-3 rounded-2xl border px-4 py-2 text-sm font-semibold transition hover:-translate-y-0.5 hover:shadow-xl disabled:opacity-60"
                  style={{
                    borderColor: light ? "rgba(15,23,42,0.12)" : "rgba(255,255,255,0.12)",
                    background: light ? "white" : "rgba(255,255,255,0.06)",
                  }}
                >
                  {resendCooldown > 0 ? `Resend in ${resendCooldown}s` : resending ? "Resending…" : "Resend confirmation email"}
                </button>
              </div>
            ) : null}

            <div className="mt-2 flex items-center justify-between text-sm">
              <span className="opacity-70">Already have an account?</span>
              <Link className="font-semibold underline underline-offset-4" to="/login">
                Log in
              </Link>
            </div>
          </form>
        </div>
      </main>
    </div>
  );
}
