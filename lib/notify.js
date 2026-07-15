import { sendMail } from "./mail";

// Routing rule: managers see their own department's referrals;
// the Recruiting department's managers see everything.
export async function notifyManagers(db, { dept, type, referralId, candidateName, byName, message }) {
  const usersSnap = await db
    .collection("users")
    .where("role", "==", "manager")
    .get();

  const targets = usersSnap.docs
    .map((d) => ({ uid: d.id, ...d.data() }))
    .filter((u) => u.active !== false && (u.dept === dept || u.dept === "Recruiting"));

  const now = new Date().toISOString();
  const batch = db.batch();
  for (const t of targets) {
    const ref = db.collection("notifications").doc();
    batch.set(ref, {
      toUid: t.uid,
      type,
      referralId,
      candidateName,
      byName,
      dept,
      message,
      read: false,
      at: now,
    });
  }
  await batch.commit();

  const emails = targets.map((t) => t.email).filter(Boolean);
  await sendMail({
    to: emails,
    subject: `Referral: ${candidateName} (${dept})`,
    text: `${message}\n\nOpen the portal to take action.`,
  });
}

// Bare stage-change updates to the referrer — deliberately minimal detail.
// email: false writes only the in-app bell notification.
export async function notifyReferrer(db, { referral, message, email = true }) {
  const userSnap = await db.collection("users").doc(referral.referrerUid).get();
  if (!userSnap.exists) return;
  const referrer = userSnap.data();

  await db.collection("notifications").add({
    toUid: referral.referrerUid,
    type: "stage",
    referralId: referral.id,
    candidateName: referral.candidateName,
    dept: referral.dept,
    message,
    read: false,
    at: new Date().toISOString(),
  });

  if (email && referrer.email) {
    await sendMail({
      to: [referrer.email],
      subject: `Update on your referral: ${referral.candidateName}`,
      text: `${message}\n\nCheck My Referrals in the portal for details.`,
    });
  }
}
