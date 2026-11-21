import { database } from "../lib/db";
process.env.SCARLET_RUN_MIGRATIONS = "1";
database()
  .then(() => {
    console.log("Database migrations are current.");
    process.exit(0);
  })
  .catch((e) => {
    console.error(e.message);
    process.exit(1);
  });
