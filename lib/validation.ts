import { z } from "zod";
import { Problem } from "./db";
export const str = (max = 160) => z.string().trim().min(1).max(max);
export const date = z.string().datetime({ offset: true });
export const email = z.string().trim().toLowerCase().email().max(254);
export const creds = z.object({
  email,
  password: z.string().min(1).max(160),
  code: z.string().max(6).optional(),
  name: str(70).optional(),
});
export const eventFields = z
  .object({ title: str(), start: date, end: date })
  .refine(
    (v) => Date.parse(v.end) > Date.parse(v.start),
    "End time must follow start time.",
  );
export async function body(req: Request, max = 65536) {
  const reader = req.body?.getReader();
  if (!reader) throw new Problem(400, "Request body is required.");
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.length;
    if (size > max) {
      await reader.cancel();
      throw new Problem(413, "Request exceeds the size limit.");
    }
    chunks.push(value);
  }
  return Buffer.concat(chunks);
}
export async function json(req: Request) {
  if (!req.headers.get("content-type")?.startsWith("application/json"))
    throw new Problem(415, "Use application/json.");
  try {
    return JSON.parse((await body(req)).toString());
  } catch (e) {
    if (e instanceof Problem) throw e;
    throw new Problem(400, "Invalid JSON.");
  }
}
