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
      validLevels: [...VALID_LEVELS],
      totalPrinciples: VALID_LEVELS.size
    }
  };
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
