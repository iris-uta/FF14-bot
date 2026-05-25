import { createDb } from "../client";

// createDb runs migrations by default (autoMigrate: true).
const db = createDb();
console.log("✓ Migrations applied");
process.exit(0);
