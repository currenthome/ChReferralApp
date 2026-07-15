"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import Shell from "@/components/Shell";
import { api } from "@/lib/firebaseClient";
import QRCode from "qrcode";

export default function Share() {
  const [data, setData] = useState(null);
  const [qr, setQr] = useState("");
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    api("/api/share")
      .then(async (d) => {
        setData(d);
        setQr(await QRCode.toDataURL(d.link, { width: 400, margin: 1, color: { dark: "#1A1A2E" } }));
      })
      .catch(() => setData({ error: true }));
  }, []);

  async function copy() {
    try {
      await navigator.clipboard.writeText(data.link);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {}
  }

  if (!data) return <Shell><div className="spinner">Loading…</div></Shell>;

  return (
    <Shell>
      <h1>Share & recruit</h1>
      <p className="sub" style={{ marginBottom: 18 }}>
        Post your personal link or QR code anywhere — socials, texts, flyers. Anyone who applies through it is automatically credited to you.
      </p>

      <div className="sharestat" style={{ background: "var(--cyanlight)", border: "1px solid var(--cyan)", borderRadius: 12, padding: "12px 14px", marginBottom: 18, fontWeight: 300, fontSize: 13, color: "var(--slate)" }}>
        <b style={{ fontWeight: 700, color: "var(--charcoal)" }}>{data.appliedCount}</b> {data.appliedCount === 1 ? "person has" : "people have"} applied through your link.
      </div>

      <label>Your personal link</label>
      <div style={{ display: "flex", gap: 8, marginBottom: 20 }}>
        <input readOnly value={data.link} style={{ flex: 1, fontSize: 13, fontWeight: 500 }} />
        <button
          onClick={copy}
          style={{ flex: "none", fontFamily: "inherit", fontWeight: 700, fontSize: 13, padding: "0 18px", borderRadius: 12, border: "none", background: copied ? "#17C964" : "var(--cyan)", color: "var(--charcoal)", cursor: "pointer" }}
        >
          {copied ? "Copied!" : "Copy"}
        </button>
      </div>

      {qr && (
        <div style={{ background: "#fff", border: "1px solid var(--gray)", borderRadius: 16, padding: 22, textAlign: "center", marginBottom: 20 }}>
          <img src={qr} alt="Your QR code" style={{ width: 200, height: 200, display: "block", margin: "0 auto 14px", borderRadius: 8 }} />
          <div style={{ fontWeight: 700, fontSize: 14 }}>Your QR code</div>
          <div style={{ fontWeight: 300, fontSize: 12, color: "var(--slate)", marginTop: 4 }}>
            Screenshot it and drop it in your posts or stories.
          </div>
        </div>
      )}

      <Link href={`/apply/${data.code}`} style={{ textDecoration: "none" }}>
        <button className="btnghost" style={{ width: "100%" }}>See what applicants see ›</button>
      </Link>
    </Shell>
  );
}
