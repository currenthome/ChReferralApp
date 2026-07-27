import { sendMail } from "./mail";
import { MILESTONE_DISTROS } from "./constants";

// Hire and Day-30 emails to the payout distros (payroll, recruiting, Skip),
// spelling out the referrer's rewards so payout owners never miss one.
export async function notifyHiredDistros({ referral, scoring }) {
  const money = (c) => (c ? ` + $${c}` : "");
  await sendMail({
    to: MILESTONE_DISTROS,
    subject: `Referral hire: ${referral.candidateName} (${referral.dept})`,
    text:
      `${referral.candidateName} was hired in ${referral.dept} — referred by ${referral.referrerName}.\n\n` +
      `Rewards for ${referral.referrerName}, awarded automatically:\n` +
      `- Start date: ${scoring.start.pts} points${money(scoring.start.cash)} on their first day\n` +
      `- Day 30: ${scoring.day30.pts} points${money(scoring.day30.cash)} after ${scoring.day30.days || 30} days\n\n` +
      `Recruiting sets the start date in the portal; rewards run from there.`,
  });
}

export async function notifyDay30Distros({ referral, scoring }) {
  const money = (c) => (c ? ` + $${c}` : "");
  await sendMail({
    to: MILESTONE_DISTROS,
    subject: `Day 30 reached: ${referral.candidateName} (${referral.dept})`,
    text:
      `${referral.candidateName} hit Day 30 in ${referral.dept}.\n\n` +
      `${referral.referrerName} earned ${scoring.day30.pts} points${money(scoring.day30.cash)} for this milestone.`,
  });
}

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
