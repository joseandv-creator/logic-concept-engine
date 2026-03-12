// collective.js — Logica de inteligencia colectiva
// Normalizacion, compartir relaciones, verificar updates

function normalizeLevelCombo(combo) {
  const result = validateLevelCombo(combo);
  if (!result.valid) return null;
  return result.normalized;
}

async function getOrCreateUserHash() {
  const { userHash } = await chrome.storage.local.get(['userHash']);
  if (userHash) return userHash;
  const newHash = crypto.randomUUID();
  await chrome.storage.local.set({ userHash: newHash });
  return newHash;
}

async function shareRelation(insight) {
  const client = await getSupabaseClient();
  if (!client) return { error: 'NO_CONFIG' };

  // Use unified validation
  const validation = validateInsight(insight);
  if (!validation.valid) {
    return { error: 'INVALID_INSIGHT: ' + validation.errors.join(', ') };
  }

  const userHash = await getOrCreateUserHash();
  const clean = validation.cleaned;

  try {
    await client.shareRelation({
      level_combo: clean.level,
      description: clean.description.substring(0, 280),
      c_before: clean.c_before,
      c_after: clean.c_after,
      user_hash: userHash
    });
    return { success: true };
  } catch (err) {
    if (err.message && err.message.includes('unique_user_combo')) {
      return { error: 'ALREADY_SHARED' };
    }
    console.error('shareRelation error:', err.message);
    return { error: err.message };
  }
}

async function checkForUpdates() {
  const client = await getSupabaseClient();
  if (!client) return { updates: [] };

  const { lastUpdateVersion = 0 } = await chrome.storage.local.get(['lastUpdateVersion']);

  try {
    const updates = await client.getUpdates(lastUpdateVersion);
    if (updates && updates.length > 0) {
      const { pendingUpdates = [] } = await chrome.storage.local.get(['pendingUpdates']);
      const newUpdates = updates.filter(u =>
        !pendingUpdates.some(p => p.id === u.id)
      );
      if (newUpdates.length > 0) {
        await chrome.storage.local.set({
          pendingUpdates: [...pendingUpdates, ...newUpdates]
        });
      }
      return { updates: newUpdates };
    }
    return { updates: [] };
  } catch (err) {
    return { error: err.message, updates: [] };
  }
}

async function acknowledgeUpdate(updateId, newVersion) {
  const { pendingUpdates = [] } = await chrome.storage.local.get(['pendingUpdates']);
  const filtered = pendingUpdates.filter(u => u.id !== updateId);
  await chrome.storage.local.set({
    pendingUpdates: filtered,
    lastUpdateVersion: newVersion
  });
  return { success: true };
}

async function getPendingUpdates() {
  const { pendingUpdates = [] } = await chrome.storage.local.get(['pendingUpdates']);
  return { updates: pendingUpdates };
}

async function isCollectiveEnabled() {
  const { collectiveEnabled = false } = await chrome.storage.local.get(['collectiveEnabled']);
  return collectiveEnabled;
}

async function submitRefutation(updateId, contextDescription) {
  const client = await getSupabaseClient();
  if (!client) return { error: 'NO_CONFIG' };

  const userHash = await getOrCreateUserHash();

  try {
    await client.submitRefutation({
      update_id: updateId,
      user_hash: userHash,
      context_description: (contextDescription || '').substring(0, 280)
    });
    return { success: true };
  } catch (err) {
    if (err.message && err.message.includes('unique_user_refutation')) {
      return { error: 'ALREADY_REFUTED' };
    }
    console.error('submitRefutation error:', err.message);
    return { error: err.message };
  }
}

async function getRefutationCounts() {
  const client = await getSupabaseClient();
  if (!client) return { counts: {} };

  try {
    const results = await client.getRefutationCounts();
    const countsMap = {};
    (results || []).forEach(r => {
      countsMap[r.update_id] = r.refutation_count;
    });
    return { counts: countsMap };
  } catch (err) {
    return { error: err.message, counts: {} };
  }
}

async function getGraphSummary() {
  const client = await getSupabaseClient();
  if (!client) return { edges: [] };

  try {
    const edges = await client.getGraphSummary();
    return { edges: edges || [] };
  } catch (err) {
    return { error: err.message, edges: [] };
  }
}

// --- Distributed Persistence ---

async function downloadSnapshot() {
  const client = await getSupabaseClient();
  if (!client) return { error: 'NO_CONFIG' };

  try {
    const snapshot = await client.getFullSnapshot();
    await chrome.storage.local.set({ collectiveSnapshot: snapshot });
    console.log('Snapshot saved:', snapshot.timestamp, '—', snapshot.shared_relations.length, 'relations,', snapshot.node_count, 'nodes');
    return { success: true, timestamp: snapshot.timestamp, node_count: snapshot.node_count };
  } catch (err) {
    console.error('downloadSnapshot error:', err.message);
    return { error: err.message };
  }
}

async function getLocalSnapshot() {
  const { collectiveSnapshot } = await chrome.storage.local.get(['collectiveSnapshot']);
  return collectiveSnapshot || null;
}

async function getFullExport() {
  const [
    { insights = [] },
    { corrections = [] },
    { integratedUpdates = [] },
    { collectiveSnapshot = null }
  ] = await Promise.all([
    chrome.storage.local.get(['insights']),
    chrome.storage.local.get(['corrections']),
    chrome.storage.local.get(['integratedUpdates']),
    chrome.storage.local.get(['collectiveSnapshot'])
  ]);

  return {
    exportVersion: 1,
    exportDate: new Date().toISOString(),
    node: {
      insights,
      corrections,
      integratedUpdates
    },
    collective: collectiveSnapshot,
    system: {
      levelFormat: LEVEL_FORMAT.source,
      exportVersion: 1
    }
  };
}

// --- Robustness: Deprecation, Gaps, Feedback ---

async function checkForDeprecated() {
  const client = await getSupabaseClient();
  if (!client) return { deprecated: [] };

  try {
    const results = await client.getDeprecatedUpdates(3);
    if (results && results.length > 0) {
      const deprecatedIds = results.map(r => r.update_id);
      await chrome.storage.local.set({ deprecatedUpdates: deprecatedIds });
      return { deprecated: deprecatedIds };
    }
    await chrome.storage.local.set({ deprecatedUpdates: [] });
    return { deprecated: [] };
  } catch (err) {
    return { error: err.message, deprecated: [] };
  }
}

async function computeSuggestedGaps() {
  const { insights = [], collectiveSnapshot = null } = await chrome.storage.local.get([
    'insights', 'collectiveSnapshot'
  ]);

  if (!collectiveSnapshot || !collectiveSnapshot.relation_graph) return [];

  const userLevels = new Set();
  insights.forEach(i => {
    if (i.level) {
      i.level.split('+').forEach(l => userLevels.add(l.trim().toUpperCase()));
    }
  });

  if (userLevels.size < 2) return [];

  const existingPairs = new Set();
  (collectiveSnapshot.relation_graph || []).forEach(e => {
    existingPairs.add(e.from_level + '+' + e.to_level);
  });

  const userLevelArray = [...userLevels].sort();
  const gaps = [];
  for (let i = 0; i < userLevelArray.length; i++) {
    for (let j = i + 1; j < userLevelArray.length; j++) {
      const a = userLevelArray[i];
      const b = userLevelArray[j];
      const key = a < b ? a + '+' + b : b + '+' + a;
      if (!existingPairs.has(key)) {
        gaps.push({ level_a: a, level_b: b });
      }
    }
  }

  const limited = gaps.slice(0, 5);
  await chrome.storage.local.set({ suggestedGaps: limited });
  return limited;
}

async function submitFeedback(updateId, useful) {
  const client = await getSupabaseClient();
  if (!client) return { error: 'NO_CONFIG' };

  const userHash = await getOrCreateUserHash();
  const { integratedUpdates = [] } = await chrome.storage.local.get(['integratedUpdates']);
  const update = integratedUpdates.find(u => u.id === updateId);
  const integratedDays = update && update.integrated_at
    ? Math.floor((Date.now() - new Date(update.integrated_at).getTime()) / 86400000)
    : 0;

  try {
    await client.submitFeedback({
      update_id: updateId,
      user_hash: userHash,
      useful: useful,
      integrated_days: integratedDays
    });
    const { feedbackGiven = {} } = await chrome.storage.local.get(['feedbackGiven']);
    feedbackGiven[updateId] = useful;
    await chrome.storage.local.set({ feedbackGiven });
    return { success: true };
  } catch (err) {
    if (err.message && err.message.includes('unique_user_feedback')) {
      return { error: 'ALREADY_SUBMITTED' };
    }
    return { error: err.message };
  }
}

async function checkFeedbackDue() {
  const { integratedUpdates = [], feedbackGiven = {} } = await chrome.storage.local.get([
    'integratedUpdates', 'feedbackGiven'
  ]);
  const now = Date.now();
  const SEVEN_DAYS = 7 * 24 * 60 * 60 * 1000;

  return integratedUpdates.filter(u => {
    if (feedbackGiven[u.id] !== undefined) return false;
    if (!u.integrated_at) return false;
    return (now - new Date(u.integrated_at).getTime()) >= SEVEN_DAYS;
  });
}

async function runAutoApproval() {
  const client = await getSupabaseClient();
  if (!client) return { approved: 0 };

  try {
    // Need service role for auto_approve — uses anon key which won't have write access
    // to convergent_relations. This RPC runs as SECURITY DEFINER so it works.
    const response = await client._fetch('/rpc/auto_approve_convergent', {
      method: 'POST',
      body: JSON.stringify({})
    });
    const count = typeof response === 'number' ? response : 0;
    console.log('Auto-approval run:', count, 'relations auto-approved');
    return { approved: count };
  } catch (err) {
    console.error('Auto-approval error:', err.message);
    return { error: err.message, approved: 0 };
  }
}

async function importFullExport(data) {
  if (!data || data.exportVersion !== 1) {
    return { error: 'Invalid export format' };
  }

  const ops = {};

  if (data.node) {
    if (Array.isArray(data.node.insights)) ops.insights = data.node.insights;
    if (Array.isArray(data.node.corrections)) ops.corrections = data.node.corrections;
    if (Array.isArray(data.node.integratedUpdates)) ops.integratedUpdates = data.node.integratedUpdates;
  }

  if (data.collective) {
    ops.collectiveSnapshot = data.collective;
  }

  await chrome.storage.local.set(ops);
  return { success: true, imported: Object.keys(ops) };
}
