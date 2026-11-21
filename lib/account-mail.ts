import { randomBytes } from "node:crypto";
import { audit, database, must, query } from "./db";
import { hash, password, mfaValid, unseal } from "./security";
import { requestJson } from "./providers/http";
export type Purpose = "reset" | "verify";
export const mailReady = () =>
  !!(
    process.env.RESEND_API_KEY &&
    process.env.AUTH_EMAIL_FROM &&
    process.env.APP_ORIGIN
  );
export async function issueChallenge(
  uid: string,
  to: string,
  purpose: Purpose,
) {
  must(mailReady(), "Account email service has not been configured.", 503);
  const token = randomBytes(32).toString("hex"),
    digest = hash(token);
  await query(
    "INSERT INTO identity_challenges(digest,user_id,purpose,expires) VALUES($1,$2,$3,now()+interval '20 minutes') ON CONFLICT(user_id,purpose) DO UPDATE SET digest=excluded.digest,expires=excluded.expires",
    [digest, uid, purpose],
  );
  const link = new URL("/account-access", process.env.APP_ORIGIN);
  link.hash = new URLSearchParams({ token, purpose }).toString();
  const action =
    purpose === "verify" ? "Verify your email" : "Reset your password";
  await requestJson("Account email", "https://api.resend.com/emails", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: "Bearer " + process.env.RESEND_API_KEY,
      "Idempotency-Key": digest,
    },
    body: JSON.stringify({
      from: process.env.AUTH_EMAIL_FROM,
      to: [to],
      subject: action + " for S.C.A.R.L.E.T.",
      text:
        action +
        " using this link within 20 minutes.\n\n" +
        link.href +
        "\n\nIf you did not request this, you can ignore this message.",
    }),
  });
}
export async function acceptChallenge(
  token: string,
  purpose: Purpose,
  newPassword?: string,
  code?: string,
) {
  const digest = hash(token);
  await (
    await database()
  ).tx(async (q) => {
    const [row] = await q(
      "DELETE FROM identity_challenges WHERE digest=$1 AND purpose=$2 AND expires>now() RETURNING user_id",
      [digest, purpose],
    );
    must(row, "This link has expired or has already been used.", 400);
    if (purpose === "verify") {
      await q("UPDATE users SET email_verified=true WHERE id=$1", [
        row.user_id,
      ]);
    } else {
      must(
        newPassword && newPassword.length >= 12 && newPassword.length <= 160,
        "Choose a password of 12–160 characters.",
      );
      const [user] = await q("SELECT mfa FROM users WHERE id=$1 FOR UPDATE", [
        row.user_id,
      ]);
      if (user.mfa)
        must(
          mfaValid(await unseal(user.mfa), code || ""),
          "Enter your current authenticator code.",
          403,
        );
      const pw = await password(newPassword);
      await q("UPDATE users SET passhash=$2,email_verified=true WHERE id=$1", [
        row.user_id,
        pw,
      ]);
      await q("DELETE FROM sessions WHERE user_id=$1", [row.user_id]);
    }
    await audit(
      row.user_id,
      purpose === "verify" ? "Email verified" : "Password reset",
      "security",
      "",
      q,
    );
  });
}
