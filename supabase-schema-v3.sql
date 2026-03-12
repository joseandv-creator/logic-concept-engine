-- =====================================================
-- SCHEMA V3: Pipeline corrections
-- =====================================================

-- 1. Add descriptions array to system_updates
ALTER TABLE system_updates ADD COLUMN IF NOT EXISTS descriptions TEXT[] DEFAULT '{}';

-- 2. Replace check_convergence with description_count + stddev
DROP FUNCTION IF EXISTS check_convergence(INT);

CREATE OR REPLACE FUNCTION check_convergence(threshold INT DEFAULT 3)
RETURNS TABLE (
  level_combo TEXT,
  unique_users BIGINT,
  avg_c_before NUMERIC,
  avg_c_after NUMERIC,
  descriptions TEXT[],
  weighted_score NUMERIC,
  description_count BIGINT,
  c_stddev NUMERIC
) AS $fn$
BEGIN
  RETURN QUERY
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
  HAVING COUNT(DISTINCT sr.user_hash) >= threshold
  ORDER BY weighted_score DESC;
END;
$fn$ LANGUAGE plpgsql SECURITY DEFINER;
