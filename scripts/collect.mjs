import { runCollection } from "../lib/pipeline.mjs";
import { closePool } from "../lib/db.mjs";
try {
  const result = await runCollection("cron");
  console.log(JSON.stringify(result, null, 2));
  if (result.status !== "success") process.exitCode = 1;
} catch (e) {
  console.error(
    "Collecte impossible :",
    e.status === 409 ? e.message : e.code || e.name,
  );
  process.exitCode = 1;
} finally {
  await closePool();
}
