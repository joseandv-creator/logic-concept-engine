-- Logic — Red Colectiva de Relaciones
-- Ejecutar en Supabase SQL Editor

-- 1. TABLA: shared_relations
-- Cada relacion compartida por un usuario anonimo
CREATE TABLE shared_relations (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  level_combo TEXT NOT NULL,
  description TEXT NOT NULL,
  c_before NUMERIC(3,2) NOT NULL,
  c_after NUMERIC(3,2) NOT NULL,
  user_hash TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT unique_user_combo UNIQUE (user_hash, level_combo)
);

CREATE INDEX idx_level_combo ON shared_relations(level_combo);
CREATE INDEX idx_created_at ON shared_relations(created_at);

-- 2. TABLA: convergent_relations
-- Relaciones revisadas por el curator (S1)
CREATE TABLE convergent_relations (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  level_combo TEXT NOT NULL UNIQUE,
  convergence_count INT NOT NULL,
  description TEXT NOT NULL,
  avg_c_before NUMERIC(3,2),
  avg_c_after NUMERIC(3,2),
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  curator_note TEXT,
  reviewed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  published_at TIMESTAMPTZ
);

CREATE INDEX idx_convergent_status ON convergent_relations(status);

-- 3. TABLA: system_updates
-- Updates aprobados que la extension consume
CREATE TABLE system_updates (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  level_combo TEXT NOT NULL,
  description TEXT NOT NULL,
  convergence_count INT NOT NULL,
  curator_note TEXT,
  version INT NOT NULL DEFAULT 1,
  published_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_updates_version ON system_updates(version);

-- 4. RLS
ALTER TABLE shared_relations ENABLE ROW LEVEL SECURITY;
ALTER TABLE convergent_relations ENABLE ROW LEVEL SECURITY;
ALTER TABLE system_updates ENABLE ROW LEVEL SECURITY;

-- shared_relations: cualquiera puede insertar
CREATE POLICY "anon_insert" ON shared_relations
  FOR INSERT TO anon WITH CHECK (true);

-- shared_relations: solo leer los propios (por user_hash en header)
CREATE POLICY "anon_read_own" ON shared_relations
  FOR SELECT TO anon
  USING (true);

-- convergent_relations: solo service_role
CREATE POLICY "service_role_all" ON convergent_relations
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- system_updates: lectura publica
CREATE POLICY "anon_read_updates" ON system_updates
  FOR SELECT TO anon USING (true);

-- service_role full access a system_updates
CREATE POLICY "service_role_updates" ON system_updates
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- 5. FUNCION: check_convergence
CREATE OR REPLACE FUNCTION check_convergence(threshold INT DEFAULT 3)
RETURNS TABLE (
  level_combo TEXT,
  unique_users BIGINT,
  avg_c_before NUMERIC,
  avg_c_after NUMERIC,
  descriptions TEXT[]
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    sr.level_combo,
    COUNT(DISTINCT sr.user_hash) AS unique_users,
    ROUND(AVG(sr.c_before), 2) AS avg_c_before,
    ROUND(AVG(sr.c_after), 2) AS avg_c_after,
    ARRAY_AGG(DISTINCT sr.description) AS descriptions
  FROM shared_relations sr
  WHERE sr.level_combo NOT IN (
    SELECT cr.level_combo FROM convergent_relations cr
  )
  GROUP BY sr.level_combo
  HAVING COUNT(DISTINCT sr.user_hash) >= threshold
  ORDER BY COUNT(DISTINCT sr.user_hash) DESC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
