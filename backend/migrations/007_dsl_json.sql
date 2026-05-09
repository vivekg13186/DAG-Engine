-- DSL switched from YAML to JSON.
--
-- The on-disk + on-the-wire format is now JSON. We rename the `yaml`
-- column on `graphs` to `dsl` so the column name matches its content.
-- The cached `parsed` JSONB column is unchanged — it has always held the
-- engine-ready object regardless of source format.
--
-- Existing rows already contain JSON-equivalent data inside `parsed`. We
-- simply re-serialise that JSONB into the new `dsl` text column so the
-- text and the parsed cache stay in lock-step. Any rows that were stored
-- with bad parsed JSON (extremely unlikely — every successful POST went
-- through the validator) keep their original yaml text via the COALESCE
-- so nothing is destroyed.

ALTER TABLE graphs ADD COLUMN IF NOT EXISTS dsl TEXT;

UPDATE graphs
   SET dsl = COALESCE(jsonb_pretty(parsed), yaml)
 WHERE dsl IS NULL;

ALTER TABLE graphs ALTER COLUMN dsl SET NOT NULL;

-- The legacy column is no longer read by the code path. Drop it.
ALTER TABLE graphs DROP COLUMN IF EXISTS yaml;
