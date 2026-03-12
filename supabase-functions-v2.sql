-- =====================================================
-- FUNCTIONS (execute separately in SQL Editor)
-- =====================================================

-- Function 1: build_relation_graph
CREATE OR REPLACE FUNCTION build_relation_graph()
RETURNS INT AS $$
DECLARE
  processed INT := 0;
  rec RECORD;
  levels TEXT[];
  i INT;
  j INT;
  lev_a TEXT;
  lev_b TEXT;
BEGIN
  FOR rec IN
    SELECT sr.id, sr.level_combo, sr.user_hash
    FROM shared_relations sr
    WHERE NOT EXISTS (
      SELECT 1 FROM relation_graph rg WHERE rg.shared_relation_id = sr.id
    )
  LOOP
    levels := string_to_array(rec.level_combo, '+');
    IF array_length(levels, 1) >= 2 THEN
      FOR i IN 1..array_length(levels, 1) - 1 LOOP
        FOR j IN (i + 1)..array_length(levels, 1) LOOP
          lev_a := levels[i];
          lev_b := levels[j];
          IF lev_a > lev_b THEN
            lev_a := levels[j];
            lev_b := levels[i];
          END IF;
          INSERT INTO relation_graph (from_level, to_level, shared_relation_id, user_hash)
          VALUES (lev_a, lev_b, rec.id, rec.user_hash)
          ON CONFLICT DO NOTHING;
        END LOOP;
      END LOOP;
    END IF;
    processed := processed + 1;
  END LOOP;
  RETURN processed;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function 2: get_graph_summary
CREATE OR REPLACE FUNCTION get_graph_summary()
RETURNS TABLE (
  from_level TEXT,
  to_level TEXT,
  edge_count BIGINT,
  unique_users BIGINT
) AS $$
BEGIN
  RETURN QUERY
  SELECT rg.from_level, rg.to_level,
    COUNT(*) AS edge_count,
    COUNT(DISTINCT rg.user_hash) AS unique_users
  FROM relation_graph rg
  GROUP BY rg.from_level, rg.to_level
  ORDER BY edge_count DESC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function 3: check_convergence (REPLACE with weighted_score)
CREATE OR REPLACE FUNCTION check_convergence(threshold INT DEFAULT 3)
RETURNS TABLE (
  level_combo TEXT,
  unique_users BIGINT,
  avg_c_before NUMERIC,
  avg_c_after NUMERIC,
  descriptions TEXT[],
  weighted_score NUMERIC
) AS $$
BEGIN
  RETURN QUERY
  SELECT sr.level_combo,
    COUNT(DISTINCT sr.user_hash) AS unique_users,
    ROUND(AVG(sr.c_before), 2) AS avg_c_before,
    ROUND(AVG(sr.c_after), 2) AS avg_c_after,
    ARRAY_AGG(DISTINCT sr.description) AS descriptions,
    ROUND(AVG(sr.c_after - sr.c_before) * COUNT(DISTINCT sr.user_hash), 4) AS weighted_score
  FROM shared_relations sr
  WHERE sr.level_combo NOT IN (
    SELECT cr.level_combo FROM convergent_relations cr
  )
  GROUP BY sr.level_combo
  HAVING COUNT(DISTINCT sr.user_hash) >= threshold
  ORDER BY weighted_score DESC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function 4: detect_gaps
CREATE OR REPLACE FUNCTION detect_gaps()
RETURNS TABLE (
  level_a TEXT,
  level_b TEXT
) AS $$
BEGIN
  RETURN QUERY
  WITH known_levels AS (
    SELECT DISTINCT unnest(string_to_array(sr2.level_combo, '+')) AS level
    FROM shared_relations sr2
  ),
  all_pairs AS (
    SELECT a.level AS level_a, b.level AS level_b
    FROM known_levels a CROSS JOIN known_levels b
    WHERE a.level < b.level
  ),
  existing_pairs AS (
    SELECT DISTINCT rg.from_level, rg.to_level FROM relation_graph rg
  )
  SELECT ap.level_a, ap.level_b
  FROM all_pairs ap
  LEFT JOIN existing_pairs ep ON ap.level_a = ep.from_level AND ap.level_b = ep.to_level
  WHERE ep.from_level IS NULL
  ORDER BY ap.level_a, ap.level_b;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function 5: detect_contradictions
CREATE OR REPLACE FUNCTION detect_contradictions(min_descriptions INT DEFAULT 2)
RETURNS TABLE (
  level_combo TEXT,
  description_count BIGINT,
  unique_users BIGINT,
  descriptions TEXT[],
  user_hashes TEXT[]
) AS $$
BEGIN
  RETURN QUERY
  SELECT sr.level_combo,
    COUNT(DISTINCT sr.description) AS description_count,
    COUNT(DISTINCT sr.user_hash) AS unique_users,
    ARRAY_AGG(DISTINCT sr.description) AS descriptions,
    ARRAY_AGG(DISTINCT sr.user_hash) AS user_hashes
  FROM shared_relations sr
  GROUP BY sr.level_combo
  HAVING COUNT(DISTINCT sr.description) >= min_descriptions
  ORDER BY description_count DESC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function 6: get_refutation_counts
CREATE OR REPLACE FUNCTION get_refutation_counts()
RETURNS TABLE (
  update_id UUID,
  refutation_count BIGINT
) AS $$
BEGIN
  RETURN QUERY
  SELECT r.update_id, COUNT(*) AS refutation_count
  FROM refutations r
  GROUP BY r.update_id
  ORDER BY refutation_count DESC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
