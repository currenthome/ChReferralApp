import { createRemoteJWKSet, jwtVerify } from "jose";

// Verifies Firebase ID tokens directly against Google's published signing keys,
// per Firebase's third-party verification spec: RS256 signature, issuer
// https://securetoken.google.com/<project>, audience = project id, unexpired.
// (Replaces firebase-admin/auth, whose jwks-rsa dependency breaks on Vercel.)
const JWKS = createRemoteJWKSet(
  new URL("https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com")
);

export async function verifyFirebaseToken(token) {
  const projectId = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;
  const { payload } = await jwtVerify(token, JWKS, {
    algorithms: ["RS256"],
    issuer: `https://securetoken.google.com/${projectId}`,
    audience: projectId,
  });
  if (!payload.sub) throw new Error("Token has no subject");
  return {
    uid: payload.sub,
    email: payload.email,
    name: payload.name,
    picture: payload.picture,
  };
}
