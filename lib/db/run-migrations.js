import pg from "pg";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Read .env from the root workspace
const envPath = path.resolve(__dirname, "../../.env");
if (!fs.existsSync(envPath)) {
  console.error(".env file not found at root");
  process.exit(1);
}

const envContent = fs.readFileSync(envPath, "utf-8");
let databaseUrl = "";
for (const line of envContent.split("\n")) {
  if (line.startsWith("DATABASE_URL=")) {
    databaseUrl = line.split("=")[1].trim();
    break;
  }
}

if (!databaseUrl) {
  console.error("DATABASE_URL not found in .env");
  process.exit(1);
}

const step = process.argv[2];
if (step !== "pre" && step !== "post") {
  console.error("Please specify 'pre' or 'post' migration step");
  process.exit(1);
}

const sqlFile = step === "pre" ? "0000_pre_init.sql" : "0001_init.sql";
const sqlPath = path.resolve(__dirname, "./migrations", sqlFile);

if (!fs.existsSync(sqlPath)) {
  console.error(`Migration SQL file not found: ${sqlFile}`);
  process.exit(1);
}

const sql = fs.readFileSync(sqlPath, "utf-8");

const pool = new pg.Pool({
  connectionString: databaseUrl,
  ssl: {
    rejectUnauthorized: false
  }
});

console.log(`Running database migration: ${sqlFile}...`);
try {
  await pool.query(sql);
  console.log(`Successfully applied ${sqlFile}`);
} catch (err) {
  console.error(`Error applying migration ${sqlFile}:`, err);
  process.exit(1);
} finally {
  await pool.end();
}
