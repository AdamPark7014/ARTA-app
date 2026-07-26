#!/bin/sh
set -e
echo "Waiting for database…"
i=0
while [ "$i" -lt 40 ]; do
  if node -e "const {PrismaClient}=require('@prisma/client'); const p=new PrismaClient(); p.\$queryRawUnsafe('SELECT 1').then(()=>p.\$disconnect()).then(()=>process.exit(0)).catch(()=>process.exit(1))"; then
    echo "Database is up"
    break
  fi
  i=$((i + 1))
  echo "  retry $i…"
  sleep 1
done
if [ "$i" -ge 40 ]; then
  echo "Database not reachable"
  exit 1
fi
echo "Prisma migrate deploy…"
npx prisma migrate deploy
echo "Seed…"
npx ts-node --transpile-only prisma/seed.ts || echo "Seed skipped/failed (may already be applied)"
echo "Starting API…"
exec node dist/apps/api/src/main.js
