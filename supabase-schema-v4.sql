-- =====================================================
-- SCHEMA V4: Robustness improvements
-- =====================================================

-- 1. Integration feedback table
CREATE TABLE IF NOT EXISTS integration_feedback (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  update_id UUID NOT NULL REFERENCES system_updates(id) ON DELETE CASCADE,
  user_hash TEXT NOT NULL,
  useful BOOLEAN NOT NULL,
  integrated_days INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT unique_user_feedback UNIQUE (user_hash, update_id)
);

CREATE INDEX IF NOT EXISTS idx_feedback_update ON integration_feedback(update_id);

ALTER TABLE integration_feedback ENABLE ROW LEVEL SECURITY;

CREATE POLICY "anon_insert_feedback" ON integration_feedback
  FOR INSERT TO anon WITH CHECK (true);

CREATE POLICY "anon_read_feedback" ON integration_feedback
  FOR SELECT TO anon USING (true);

CREATE POLICY "service_role_feedback" ON integration_feedback
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- 2. get_deprecated_updates function
CREATE OR REPLACE FUNCTION get_deprecated_updates(threshold INT DEFAULT 3)
RETURNS TABLE (
  update_id UUID,
  refutation_count BIGINT
) AS $fn$
BEGIN
  RETURN QUERY
  SELECT r.update_id, COUNT(*) AS refutation_count
  FROM refutations r
  GROUP BY r.update_id
  HAVING COUNT(*) >= threshold
  ORDER BY refutation_count DESC;
END;
$fn$ LANGUAGE plpgsql SECURITY DEFINER;

-- 3. get_feedback_summary function
CREATE OR REPLACE FUNCTION get_feedback_summary()
RETURNS TABLE (
  update_id UUID,
  total_feedback BIGINT,
  useful_count BIGINT,
  not_useful_count BIGINT,
  usefulness_ratio NUMERIC
) AS $fn$
BEGIN
  RETURN QUERY
  SELECT f.update_id,
    COUNT(*) AS total_feedback,
    COUNT(*) FILTER (WHERE f.useful = true) AS useful_count,
    COUNT(*) FILTER (WHERE f.useful = false) AS not_useful_count,
    ROUND(
      COUNT(*) FILTER (WHERE f.useful = true)::NUMERIC / NULLIF(COUNT(*), 0),
    2) AS usefulness_ratio
  FROM integration_feedback f
  GROUP BY f.update_id
  ORDER BY usefulness_ratio DESC;
END;
$fn$ LANGUAGE plpgsql SECURITY DEFINER;

-- 4. auto_approve_convergent function
CREATE OR REPLACE FUNCTION auto_approve_convergent()
RETURNS INT AS $fn$
DECLARE
  approved_count INT := 0;
  rec RECORD;
  next_ver INT;
  now_ts TIMESTAMPTZ := NOW();
BEGIN
  FOR rec IN
    SELECT sr.level_combo,
      COUNT(DISTINCT sr.user_hash) AS unique_users,
      ROUND(AVG(sr.c_before), 2) AS avg_c_before,
      ROUND(AVG(sr.c_after), 2) AS avg_c_after,
      ARRAY_AGG(DISTINCT sr.description) AS descriptions,
      ROUND(AVG(sr.c_after - sr.c_before) * COUNT(DISTINCT sr.user_hash), 4) AS weighted_score,
      COUNT(DISTINCT sr.description) AS description_count,
      ROUND(COALESCE(STDDEV(sr.c_after - sr.c_before), 0), 4) AS c_stddev
    FROM shared_relations sr
    WHERE sr.level_combo NOT IN (
      SELECT cr.level_combo FROM convergent_relations cr
    )
    GROUP BY sr.level_combo
    HAVING COUNT(DISTINCT sr.user_hash) >= 5
      AND COUNT(DISTINCT sr.description) = 1
      AND ROUND(COALESCE(STDDEV(sr.c_after - sr.c_before), 0), 4) < 0.1
      AND ROUND(AVG(sr.c_after - sr.c_before) * COUNT(DISTINCT sr.user_hash), 4) > 0
  LOOP
    SELECT COALESCE(MAX(version), 0) + 1 INTO next_ver FROM system_updates;

    INSERT INTO convergent_relations (
      level_combo, convergence_count, description, avg_c_before, avg_c_after,
      status, curator_note, reviewed_at, published_at
    ) VALUES (
      rec.level_combo, rec.unique_users, rec.descriptions[1],
      rec.avg_c_before, rec.avg_c_after,
      'approved', 'Auto-aprobado por consenso distribuido', now_ts, now_ts
    ) ON CONFLICT (level_combo) DO NOTHING;

    IF FOUND THEN
      INSERT INTO system_updates (
        level_combo, description, descriptions, convergence_count,
        curator_note, version, published_at
      ) VALUES (
        rec.level_combo, rec.descriptions[1], rec.descriptions,
        rec.unique_users, 'Auto-aprobado por consenso distribuido',
        next_ver, now_ts
      );
      approved_count := approved_count + 1;
    END IF;
  END LOOP;
  RETURN approved_count;
END;
$fn$ LANGUAGE plpgsql SECURITY DEFINER;
