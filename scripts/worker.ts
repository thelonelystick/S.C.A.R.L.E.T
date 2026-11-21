import { Queue, Worker } from "bullmq";
import { tick, finishMaintenance } from "../lib/engine";
async function main() {
  if (!process.env.DATABASE_URL || !process.env.REDIS_URL)
    throw Error("Worker requires DATABASE_URL and REDIS_URL.");
  const u = new URL(process.env.REDIS_URL);
  const connection = {
    host: u.hostname,
    port: Number(u.port || 6379),
    username: decodeURIComponent(u.username),
    password: decodeURIComponent(u.password),
    ...(u.protocol === "rediss:" ? { tls: {} } : {}),
  };
  const queue = new Queue("scarlet-scheduler", { connection });
  await queue.upsertJobScheduler(
    "tick",
    { every: 2500 },
    { name: "tick", opts: { removeOnComplete: 20, removeOnFail: 100 } },
  );
  await queue.upsertJobScheduler(
    "maintenance",
    { every: 3600000 },
    { name: "maintenance", opts: { removeOnComplete: 1 } },
  );
  const worker = new Worker(
    "scarlet-scheduler",
    async (j) => (j.name === "maintenance" ? finishMaintenance() : tick(8)),
    { connection, concurrency: 1 },
  );
  worker.on("failed", (j) => console.error("Job failed", j?.id));
  for (const signal of ["SIGTERM", "SIGINT"])
    process.once(signal, async () => {
      await worker.close();
      await queue.close();
      process.exit(0);
    });
}
main().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
