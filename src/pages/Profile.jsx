import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "../supabaseClient";

function genderEmoji(g) {
  if (g === "female") return "👩";
  if (g === "male") return "👨";
  return "🧑";
}

export default function Profile({ session, theme, setTheme }) {
  const nav = useNavigate();
  const light = theme === "light";

  const [toast, setToast] = useState(null);
  function showToast(text) {
    setToast(text);
    window.clearTimeout(showToast._t);
    showToast._t = window.setTimeout(() => setToast(null), 2600);
  }

  const bg = useMemo(() => {
    return light
      ? "radial-gradient(900px 600px at 14% 12%, rgba(124,58,237,0.10), transparent 60%), radial-gradient(900px 600px at 86% 22%, rgba(34,211,238,0.08), transparent 58%), radial-gradient(900px 600px at 66% 88%, rgba(52,211,153,0.06), transparent 55%), linear-gradient(180deg, #f6f7ff, #ffffff)"
      : "radial-gradient(900px 600px at 14% 12%, rgba(124,58,237,0.18), transparent 60%), radial-gradient(900px 600px at 86% 22%, rgba(34,211,238,0.12), transparent 58%), radial-gradient(900px 600px at 66% 88%, rgba(52,211,153,0.09), transparent 55%), linear-gradient(180deg, #020617, #0b1220)";
  }, [light]);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [dob, setDob] = useState("");
  const [gender, setGender] = useState("other");
  const [avatarUrl, setAvatarUrl] = useState("");

  const [newPhoto, setNewPhoto] = useState(null);
  const [preview, setPreview] = useState("");

  useEffect(() => {
    if (!session?.user?.id) return;
    (async () => {
      setLoading(true);
      const { data, error } = await supabase
        .from("profiles")
        .select("*")
        .eq("id", session.user.id)
        .single();

      if (error) {
        showToast("Failed to load profile.");
        setLoading(false);
        return;
      }

      setFirstName(data.first_name || "");
      setLastName(data.last_name || "");
      setDob(data.dob ? String(data.dob) : "");
      setGender(data.gender || "other");
      setAvatarUrl(data.avatar_url || "");
      setLoading(false);
    })();
  }, [session?.user?.id]);

  useEffect(() => {
    if (!newPhoto) {
      setPreview("");
      return;
    }
    const url = URL.createObjectURL(newPhoto);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [newPhoto]);

  async function uploadAvatar(userId, file) {
    const ext = file.name.split(".").pop() || "png";
    const path = `${userId}/avatar-${Date.now()}.${ext}`;

    const up = await supabase.storage.from("avatars").upload(path, file, {
      upsert: true,
      cacheControl: "3600",
    });
    if (up.error) throw up.error;

    const pub = supabase.storage.from("avatars").getPublicUrl(path);
    const url = pub?.data?.publicUrl;
    if (!url) throw new Error("No public URL");
    return url;
  }

  async function onSave(e) {
    e.preventDefault();
    if (!session?.user?.id) return;

    if (!firstName.trim() || !lastName.trim() || !dob || !gender) {
      showToast("Please fill all required fields.");
      return;
    }

    setSaving(true);
    try {
      let nextAvatar = avatarUrl;

      if (newPhoto) {
        nextAvatar = await uploadAvatar(session.user.id, newPhoto);
      }

      const { error } = await supabase
        .from("profiles")
        .update({
          first_name: firstName.trim(),
          last_name: lastName.trim(),
          dob,
          gender,
          avatar_url: nextAvatar || null,
        })
        .eq("id", session.user.id);

      if (error) throw error;

      // optional: keep auth metadata updated too
      await supabase.auth.updateUser({
        data: {
          first_name: firstName.trim(),
          last_name: lastName.trim(),
          dob,
          gender,
          avatar_url: nextAvatar || "",
        },
      });

      setAvatarUrl(nextAvatar || "");
      setNewPhoto(null);
      showToast("Saved ✅");
    } catch (err) {
      showToast(err?.message || "Save failed.");
    } finally {
      setSaving(false);
    }
  }

  const shownAvatar = preview || avatarUrl;

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
          {toast}
        </div>
      ) : null}

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
              <div className="text-xs opacity-60">Profile</div>
            </div>
          </div>

          <div className="flex items-center gap-2">
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

            <button
              className="rounded-full border px-3 py-1.5 text-xs font-semibold transition hover:-translate-y-0.5"
              style={{
                borderColor: light ? "rgba(15,23,42,0.12)" : "rgba(255,255,255,0.12)",
                background: light ? "white" : "rgba(255,255,255,0.06)",
              }}
              onClick={() => nav("/app")}
              type="button"
            >
              ← Back
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-4 py-10">
        <div
          className="mx-auto max-w-2xl rounded-3xl border p-6 shadow-2xl"
          style={{
            borderColor: light ? "rgba(15,23,42,0.10)" : "rgba(255,255,255,0.12)",
            background: light ? "rgba(255,255,255,0.90)" : "linear-gradient(135deg, rgba(255,255,255,0.09) 0%, rgba(255,255,255,0.03) 100%)",
            boxShadow: light ? "0 8px 32px rgba(0,0,0,0.07), inset 0 1px 0 rgba(255,255,255,0.9)" : "0 8px 32px rgba(0,0,0,0.28), inset 0 1px 0 rgba(255,255,255,0.12)",
            backdropFilter: "blur(20px)",
          }}
        >
          <h1 className="text-2xl font-extrabold tracking-tight">Your profile</h1>
          <p className="mt-2 text-sm opacity-75">Edit your personal info and avatar.</p>

          {loading ? (
            <div className="mt-6 text-sm opacity-75">Loading…</div>
          ) : (
            <form className="mt-6 grid gap-4" onSubmit={onSave}>
              {/* Avatar */}
              <div className="flex items-center gap-4">
                <div className="h-20 w-20 overflow-hidden rounded-2xl flex-shrink-0"
                  style={{ background: "linear-gradient(135deg, #7c3aed, #22d3ee, #10b981)", boxShadow: "0 4px 16px rgba(124,58,237,0.35)" }}>
                  {shownAvatar ? (
                    <img src={shownAvatar} alt="Avatar" className="h-full w-full object-cover" />
                  ) : (
                    <div className="grid h-full w-full place-items-center text-3xl text-white">
                      {genderEmoji(gender)}
                    </div>
                  )}
                </div>

                <label className="grid gap-2 text-xs font-semibold opacity-70">
                  Change photo (optional)
                  <input
                    type="file"
                    accept="image/*"
                    className="w-full rounded-2xl border px-4 py-3 text-sm outline-none"
                    style={{
                      borderColor: light ? "rgba(15,23,42,0.12)" : "rgba(255,255,255,0.12)",
                      background: light ? "white" : "rgba(2,6,23,0.25)",
                    }}
                    onChange={(e) => setNewPhoto(e.target.files?.[0] || null)}
                  />
                </label>
              </div>

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

              <button
                className="rounded-2xl px-4 py-3 text-sm font-bold text-white transition hover:-translate-y-0.5 hover:shadow-xl disabled:opacity-60"
                style={{
                  background: "linear-gradient(90deg, #7c3aed, #6d28d9)",
                  boxShadow: "0 4px 16px rgba(124,58,237,0.4)",
                  border: "none",
                }}
                type="submit"
                disabled={saving}
              >
                {saving ? "Saving…" : "Save changes"}
              </button>
            </form>
          )}
        </div>
      </main>
    </div>
  );
}
