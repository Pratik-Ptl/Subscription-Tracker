// src/App.jsx
import { useEffect, useState } from "react";
import { Navigate, Route, Routes, useNavigate } from "react-router-dom";
import { supabase } from "./supabaseClient";

// Pages
import Login from "./pages/Login.jsx";
import Signup from "./pages/Signup.jsx";
import Tracker from "./pages/Tracker.jsx";
import Profile from "./pages/Profile.jsx";
import Verified from "./pages/Verified.jsx";
import ResetPassword from "./pages/ResetPassword.jsx";

import "./App.css";

// Guest mode key (session-only)
const GUEST_MODE_KEY = "subtrack:mode";

function ProtectedRoute({ session, isGuest, children }) {
  if (!session && !isGuest) return <Navigate to="/login" replace />;
  return children;
}

// IMPORTANT: allow guests to visit /login and /signup (only block if real session exists)
function AuthRoute({ session, children }) {
  if (session) return <Navigate to="/app" replace />;
  return children;
}

export default function App() {
  const nav = useNavigate();

  // Theme
  const [theme, setTheme] = useState(() => {
    const saved = localStorage.getItem("subtrack:theme");
    if (saved === "light" || saved === "dark") return saved;
    const prefersDark =
      window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches;
    return prefersDark ? "dark" : "light";
  });

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    document.documentElement.style.colorScheme = theme;
    localStorage.setItem("subtrack:theme", theme);
  }, [theme]);

  // Session
  const [session, setSession] = useState(null);
  const [isRecovery, setIsRecovery] = useState(false);

  // Guest mode (sessionStorage only)
  const [isGuest, setIsGuest] = useState(() => {
    return sessionStorage.getItem(GUEST_MODE_KEY) === "guest";
  });

  function enterGuest() {
    setIsGuest(true);
    sessionStorage.setItem(GUEST_MODE_KEY, "guest");
  }

  function exitGuest() {
    setIsGuest(false);
    sessionStorage.removeItem(GUEST_MODE_KEY);
  }

  useEffect(() => {
    let mounted = true;

    supabase.auth.getSession().then(({ data }) => {
      if (!mounted) return;
      setSession(data.session || null);
    });

    const { data: sub } = supabase.auth.onAuthStateChange((event, newSession) => {
      setSession(newSession || null);

      // Detect password recovery flow
      if (event === "PASSWORD_RECOVERY") {
        setIsRecovery(true);
        return;
      }

      // If the user is truly logged in, exit guest mode automatically
      if (newSession) {
        sessionStorage.removeItem(GUEST_MODE_KEY);
        setIsGuest(false);
      }
    });

    return () => {
      mounted = false;
      sub?.subscription?.unsubscribe?.();
    };
  }, []);

  // Redirect to reset-password page when recovery event is detected
  useEffect(() => {
    if (isRecovery) {
      nav("/reset-password", { replace: true });
    }
  }, [isRecovery, nav]);

  return (
    <Routes>
      {/* ✅ Always land on /login from root */}
      <Route path="/" element={<Navigate to="/login" replace />} />

      <Route
        path="/login"
        element={
          <AuthRoute session={session}>
            <Login theme={theme} setTheme={setTheme} enterGuest={enterGuest} />
          </AuthRoute>
        }
      />

      <Route
        path="/signup"
        element={
          <AuthRoute session={session}>
            <Signup theme={theme} setTheme={setTheme} />
          </AuthRoute>
        }
      />

      <Route
        path="/profile"
        element={session ? <Profile session={session} theme={theme} setTheme={setTheme} /> : <Navigate to="/login" replace />}
      />


      <Route
        path="/app"
        element={
          <ProtectedRoute session={session} isGuest={isGuest}>
            <Tracker
              session={session}
              theme={theme}
              setTheme={setTheme}
              isGuest={isGuest}
              exitGuest={exitGuest}
            />
          </ProtectedRoute>
        }
      />

      <Route path="/verified" element={<Verified theme={theme} setTheme={setTheme} />} />

      <Route path="/reset-password" element={
        isRecovery || session
          ? <ResetPassword theme={theme} setTheme={setTheme} />
          : <Navigate to="/login" replace />
      } />

      {/* fallback */}
      <Route path="*" element={<Navigate to="/login" replace />} />
    </Routes>
  );
}
