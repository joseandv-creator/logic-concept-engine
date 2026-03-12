-- =====================================================
-- SCHEMA V5: Anti-gaming + Semantic convergence
-- =====================================================

-- 1. Rate limit: max 3 shared relations per user per day
CREATE OR REPLACE FUNCTION check_rate_limit(p_user_hash TEXT)
RETURNS BOOLEAN AS $fn$
DECLARE
  recent_count INT;
BEGIN
  SELECT COUNT(*) INTO recent_count
  FROM shared_relations
  WHERE user_hash = p_user_hash
    AND created_at > NOW() - INTERVAL '24 hours';
  RETURN recent_count < 3;
END;
$fn$ LANGUAGE plpgsql SECURITY DEFINER;

-- 2. Safe share: RPC with rate limit check before INSERT
CREATE OR REPLACE FUNCTION share_relation_safe(
  p_user_hash TEXT,
  p_level_combo TEXT,
  p_description TEXT,
  p_c_before NUMERIC DEFAULT 0,
  p_c_after NUMERIC DEFAULT 0
) RETURNS JSONB AS $fn$
BEGIN
  IF NOT check_rate_limit(p_user_hash) THEN
    RETURN jsonb_build_object('error', 'RATE_LIMITED', 'message', 'Max 3 relaciones por dia');
  END IF;

  INSERT INTO shared_relations (user_hash, level_combo, description, c_before, c_after)
  VALUES (p_user_hash, p_level_combo, p_description, p_c_before, p_c_after);

  RETURN jsonb_build_object('success', true);
END;
$fn$ LANGUAGE plpgsql SECURITY DEFINER;

-- 3. Minimum engagement: user must have 1+ relation older than 7 days
CREATE OR REPLACE FUNCTION has_minimum_engagement(p_user_hash TEXT)
RETURNS BOOLEAN AS $fn$
DECLARE
  old_count INT;
BEGIN
  SELECT COUNT(*) INTO old_count
  FROM shared_relations
  WHERE user_hash = p_user_hash
    AND created_at < NOW() - INTERVAL '7 days';
  RETURN old_count >= 1;
END;
$fn$ LANGUAGE plpgsql SECURITY DEFINER;

-- 4. Jaccard similarity between two word sets
CREATE OR REPLACE FUNCTION jaccard_words(a TEXT, b TEXT)
RETURNS NUMERIC AS $fn$
DECLARE
  w_a TEXT[];
  w_b TEXT[];
  union_count INT;
  intersect_count INT;
BEGIN
  w_a := string_to_array(lower(regexp_replace(a, '[^a-zA-Z0-9áéíóúñü ]', '', 'g')), ' ');
  w_b := string_to_array(lower(regexp_replace(b, '[^a-zA-Z0-9áéíóúñü ]', '', 'g')), ' ');

  -- Remove empty strings
  w_a := array_remove(w_a, '');
  w_b := array_remove(w_b, '');

  SELECT COUNT(*) INTO union_count FROM (
    SELECT DISTINCT unnest(w_a || w_b)
  ) t;

  SELECT COUNT(*) INTO intersect_count FROM (
    SELECT unnest(w_a) INTERSECT SELECT unnest(w_b)
  ) t;

  IF union_count = 0 THEN RETURN 0; END IF;
  RETURN intersect_count::NUMERIC / union_count::NUMERIC;
END;
$fn$ LANGUAGE plpgsql IMMUTABLE SECURITY DEFINER;

-- Check minimum pairwise Jaccard across all descriptions
CREATE OR REPLACE FUNCTION check_jaccard_similarity(
  p_descriptions TEXT[],
  p_threshold NUMERIC DEFAULT 0.5
) RETURNS BOOLEAN AS $fn$
DECLARE
  i INT;
  j INT;
  sim NUMERIC;
BEGIN
  IF array_length(p_descriptions, 1) IS NULL OR array_length(p_descriptions, 1) <= 1 THEN
    RETURN true;
  END IF;

  FOR i IN 1..array_length(p_descriptions, 1) - 1 LOOP
    FOR j IN i + 1..array_length(p_descriptions, 1) LOOP
      sim := jaccard_words(p_descriptions[i], p_descriptions[j]);
      IF sim < p_threshold THEN
        RETURN false;
      END IF;
    END LOOP;
  END LOOP;

  RETURN true;
END;
$fn$ LANGUAGE plpgsql IMMUTABLE SECURITY DEFINER;

-- 5. Updated auto_approve_convergent with engagement filter + Jaccard
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
    -- Only count users with minimum engagement (7+ day old relation)
    AND has_minimum_engagement(sr.user_hash)
    GROUP BY sr.level_combo
    HAVING COUNT(DISTINCT sr.user_hash) >= 5
      -- Allow up to 3 distinct descriptions (was = 1)
      AND COUNT(DISTINCT sr.description) <= 3
      AND ROUND(COALESCE(STDDEV(sr.c_after - sr.c_before), 0), 4) < 0.1
      AND ROUND(AVG(sr.c_after - sr.c_before) * COUNT(DISTINCT sr.user_hash), 4) > 0
  LOOP
    -- For multi-description: verify semantic similarity via Jaccard
    IF rec.description_count > 1 THEN
      IF NOT check_jaccard_similarity(rec.descriptions, 0.5) THEN
        CONTINUE;
      END IF;
    END IF;

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
