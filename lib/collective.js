// collective.js — Logica de inteligencia colectiva
// Normalizacion, compartir relaciones, verificar updates

function normalizeLevelCombo(combo) {
  return combo
    .split('+')
    .map(s => s.trim().toUpperCase())
    .filter(s => s.length > 0)
    .filter((s, i, arr) => arr.indexOf(s) === i)
    .sort()
    .join('+');
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

  if (!insight || !insight.level) return { error: 'NO_LEVEL' };

  const userHash = await getOrCreateUserHash();
  const levelCombo = normalizeLevelCombo(insight.level);

  if (!levelCombo) return { error: 'INVALID_LEVEL' };

  const cBefore = parseFloat(insight.c_before) || 0;
  const cAfter = parseFloat(insight.c_after) || 0;

  try {
    await client.shareRelation({
      level_combo: levelCombo,
      description: (insight.description || '').substring(0, 280),
      c_before: Math.min(Math.max(cBefore, 0), 9.99),
      c_after: Math.min(Math.max(cAfter, 0), 9.99),
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
