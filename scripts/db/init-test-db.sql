-- Runs once, on a fresh docker volume (docker-entrypoint-initdb.d).
--
-- `pnpm test` points at its own database via `.env.test` so the suite can
-- truncate freely without wiping the development data. The schema itself is
-- not created here: every DB-touching test calls `migrate()` on start-up.
CREATE DATABASE phobos_test OWNER phobos;
