"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/components/AuthProvider";
import { signInWithGoogle } from "@/lib/firebaseClient";

export default function Login() {
  const { user, loading, refreshProfile } = useAuth();
  const router = useRouter();
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!loading && user) router.replace("/home");
  }, [loading, user, router]);

  async function handleSignIn() {
    setError("");
    setBusy(true);
    try {
      await signInWithGoogle();
      await refreshProfile();
      router.replace("/home");
    } catch (e) {
      setError(
        e.message?.includes("popup")
          ? "Sign-in was closed before finishing — try again."
          : e.message || "Sign-in failed — try again."
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <div className="header">
        <div>
          <div className="wordmark"><span className="cur">CURRENT</span><span className="home">HOME</span></div>
          <div className="subtag">EMPLOYEE REFERRALS</div>
        </div>
      </div>
      <div className="wrap">
        <h1>Welcome</h1>
        <p className="sub">
          Log in with your Current Home Google account to refer great people for open roles and track your points.
        </p>
        {error && <div className="toast warn">{error}</div>}
        <button className="btn" onClick={handleSignIn} disabled={busy}>
          {busy ? "Signing in…" : "Sign in with Google"}
        </button>
        <p className="note">Use your @currenthome.com account. No separate password needed.</p>
      </div>
    </>
  );
}
