import { query } from "./db";
/** An invoicing adapter may maintain the server-owned plan field. The settings API cannot edit it. */
export async function entitlements(uid: string) {
  const base = {
    dailyModelCalls: Number(process.env.DAILY_MODEL_CALLS) || 40,
    dailyWorkflows: 120,
    storageBytes: 50 * 1024 * 1024,
  };
  const limits = process.env.PLAN_LIMITS_JSON;
  if (!limits) return base;
  const [u] = await query(
    "SELECT settings->>'plan' AS plan FROM users WHERE id=$1",
    [uid],
  );
  const configured = JSON.parse(limits)[u?.plan || "default"] || {};
  for (const field of Object.keys(base) as (keyof typeof base)[]) {
    if (Number.isSafeInteger(configured[field]) && configured[field] > 0)
      base[field] = configured[field];
  }
  return base;
}
