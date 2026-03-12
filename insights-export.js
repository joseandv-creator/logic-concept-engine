// Logic — Export/Import System
// Each node carries the full system. If the server dies, any node can seed a new one.

async function loadStats() {
  const [insightsRes, correctionsRes] = await Promise.all([
    chrome.runtime.sendMessage({ type: 'getInsights' }),
    chrome.runtime.sendMessage({ type: 'getCorrections' })
  ]);

  const snapshotRes = await chrome.runtime.sendMessage({ type: 'getLocalSnapshot' });

  document.getElementById('insightCount').textContent = (insightsRes.insights || []).length;
  document.getElementById('correctionCount').textContent = (correctionsRes.corrections || []).length;

  const { integratedUpdates = [] } = await chrome.storage.local.get(['integratedUpdates']);
  document.getElementById('integratedCount').textContent = integratedUpdates.length;

  const snapshot = snapshotRes.snapshot;
  const infoEl = document.getElementById('snapshotInfo');
  if (snapshot) {
    const date = new Date(snapshot.timestamp).toLocaleString();
    infoEl.textContent = `Ultimo snapshot: ${date} — ${snapshot.shared_relations.length} relaciones, ${snapshot.node_count} nodos`;
  } else {
    infoEl.textContent = 'Sin snapshot colectivo. Click "Actualizar Snapshot" para descargar.';
  }
}

// Export
document.getElementById('exportBtn').addEventListener('click', async () => {
  const btn = document.getElementById('exportBtn');
  const status = document.getElementById('exportStatus');
  btn.disabled = true;
  status.textContent = 'Preparando exportacion...';
  status.className = 'status';

  try {
    const data = await chrome.runtime.sendMessage({ type: 'getFullExport' });
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `logic-node-${new Date().toISOString().slice(0,10)}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    status.textContent = 'Exportado. Este archivo contiene tu nodo completo.';
    status.className = 'status success';
  } catch (err) {
    status.textContent = 'Error: ' + err.message;
    status.className = 'status error';
  }
  btn.disabled = false;
});

// Update snapshot
document.getElementById('snapshotBtn').addEventListener('click', async () => {
  const status = document.getElementById('exportStatus');
  status.textContent = 'Descargando snapshot del colectivo...';
  status.className = 'status';

  try {
    const res = await chrome.runtime.sendMessage({ type: 'downloadSnapshot' });
    if (res.success) {
      status.textContent = `Snapshot actualizado: ${res.timestamp} — ${res.node_count} nodos activos`;
      status.className = 'status success';
      loadStats();
    } else {
      status.textContent = 'Error: ' + (res.error || 'unknown');
      status.className = 'status error';
    }
  } catch (err) {
    status.textContent = 'Error: ' + err.message;
    status.className = 'status error';
  }
});

// Preview
document.getElementById('previewBtn').addEventListener('click', async () => {
  const pre = document.getElementById('dataPreview');
  if (pre.style.display === 'block') {
    pre.style.display = 'none';
    return;
  }

  const data = await chrome.runtime.sendMessage({ type: 'getFullExport' });
  pre.textContent = JSON.stringify(data, null, 2);
  pre.style.display = 'block';
});

// Import
document.getElementById('importBtn').addEventListener('click', () => {
  document.getElementById('fileInput').click();
});

document.getElementById('fileInput').addEventListener('change', async (e) => {
  const file = e.target.files[0];
  if (!file) return;

  const status = document.getElementById('importStatus');
  status.textContent = 'Leyendo archivo...';
  status.className = 'status';

  try {
    const text = await file.text();
    const data = JSON.parse(text);

    if (data.exportVersion !== 1) {
      status.textContent = 'Error: formato no reconocido (exportVersion != 1)';
      status.className = 'status error';
      return;
    }

    // Show summary before importing
    const nodeInsights = (data.node && data.node.insights) ? data.node.insights.length : 0;
    const nodeCorrections = (data.node && data.node.corrections) ? data.node.corrections.length : 0;
    const collectiveRelations = (data.collective && data.collective.shared_relations) ? data.collective.shared_relations.length : 0;

    status.textContent = `Importando: ${nodeInsights} insights, ${nodeCorrections} correcciones, ${collectiveRelations} relaciones colectivas...`;

    const res = await chrome.runtime.sendMessage({ type: 'importFullExport', data });
    if (res.success) {
      status.textContent = `Importado: ${res.imported.join(', ')}. Sistema restaurado.`;
      status.className = 'status success';
      loadStats();
    } else {
      status.textContent = 'Error: ' + (res.error || 'unknown');
      status.className = 'status error';
    }
  } catch (err) {
    status.textContent = 'Error: ' + err.message;
    status.className = 'status error';
  }

  e.target.value = '';
});

loadStats();
