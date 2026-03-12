-- =====================================================
-- LOGIC COLLECTIVE v2: Graph, Refutations, Gaps, Contradictions
-- Execute in Supabase SQL Editor (split into parts if needed)
-- =====================================================

-- PART 1: New tables
-- =====================================================

-- Table: relation_graph (edges from level_combos)
CREATE TABLE IF NOT EXISTS relation_graph (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  from_level TEXT NOT NULL,
  to_level TEXT NOT NULL,
  shared_relation_id UUID NOT NULL REFERENCES shared_relations(id) ON DELETE CASCADE,
  user_hash TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT unique_edge_per_relation UNIQUE (from_level, to_level, shared_relation_id)
);

CREATE INDEX IF NOT EXISTS idx_graph_from ON relation_graph(from_level);
CREATE INDEX IF NOT EXISTS idx_graph_to ON relation_graph(to_level);
CREATE INDEX IF NOT EXISTS idx_graph_user ON relation_graph(user_hash);

-- Table: refutations
CREATE TABLE IF NOT EXISTS refutations (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  update_id UUID NOT NULL REFERENCES system_updates(id) ON DELETE CASCADE,
  user_hash TEXT NOT NULL,
  context_description TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT unique_user_refutation UNIQUE (user_hash, update_id)
);

CREATE INDEX IF NOT EXISTS idx_refutation_update ON refutations(update_id);

-- Column: weighted_score on convergent_relations
ALTER TABLE convergent_relations ADD COLUMN IF NOT EXISTS weighted_score NUMERIC(8,4) DEFAULT 0;

-- =====================================================
-- PART 2: RLS Policies
-- =====================================================

ALTER TABLE relation_graph ENABLE ROW LEVEL SECURITY;

CREATE POLICY "service_role_graph" ON relation_graph
  FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY "anon_read_graph" ON relation_graph
  FOR SELECT TO anon USING (true);

ALTER TABLE refutations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "anon_insert_refutation" ON refutations
  FOR INSERT TO anon WITH CHECK (true);

CREATE POLICY "anon_read_refutations" ON refutations
  FOR SELECT TO anon USING (true);

CREATE POLICY "service_role_refutations" ON refutations
  FOR ALL TO service_role USING (true) WITH CHECK (true);
