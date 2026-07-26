// e2e tests run against a dedicated `arta_test` database — never the dev/prod one.
// In CI, DATABASE_URL is already provided pointed at a throwaway Postgres service.
// Locally, it's derived from apps/api/.env (same credentials, different db name) so
// no separate secret needs to be stored for tests. Either way the pathname is forced
// to /arta_test as a safety net: this suite must never run against real data.
const fs = require('fs');
const path = require('path');
const os = require('os');

function baseUrl() {
  if (process.env.DATABASE_URL) return process.env.DATABASE_URL;
  const envPath = path.join(__dirname, '..', '.env');
  const envRaw = fs.existsSync(envPath) ? fs.readFileSync(envPath, 'utf8') : '';
  const match = envRaw.match(/DATABASE_URL="([^"]+)"/);
  if (!match) {
    throw new Error(
      'No DATABASE_URL in the environment and no apps/api/.env to derive one from — e2e tests need a Postgres to target.',
    );
  }
  return match[1];
}

const url = new URL(baseUrl());
url.pathname = '/arta_test';
process.env.DATABASE_URL = url.toString();
process.env.JWT_SECRET = process.env.JWT_SECRET || 'e2e-test-secret';
process.env.UPLOAD_DIR = process.env.UPLOAD_DIR || path.join(os.tmpdir(), 'arta-e2e-uploads');
