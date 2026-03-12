let client = null;

class CuratorClient {
  constructor(url, serviceKey) {
    this.url = url;
    this.serviceKey = serviceKey;
    this.restUrl = `${url}/rest/v1`;
  }

  async _fetch(path, options = {}) {
    const headers = {
      'Content-Type': 'application/json',
      'apikey': this.serviceKey,
      'Authorization': `Bearer ${this.serviceKey}`,
      ...options.headers
    };
    const response = await fetch(`${this.restUrl}${path}`, { ...options, headers });
    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      throw new Error(error.message || response.statusText);
    }
    const text = await response.text();
    return text ? JSON.parse(text) : null;
  }

  async rpc(fnName, params = {}) {
    const response = await fetch(`${this.url}/rest/v1/rpc/${fnName}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': this.serviceKey,
        'Authorization': `Bearer ${this.serviceKey}`
      },
      body: JSON.stringify(params)
    });
    if (!response.ok) throw new Error(await response.text());
    return response.json();
  }

  async detectConvergence(threshold = 3) {
    return this.rpc('check_convergence', { threshold });
  }

  async getStats() {
    const relations = await this._fetch('/shared_relations?select=level_combo,user_hash');
    const uniqueUsers = new Set((relations || []).map(r => r.user_hash)).size;
    const uniqueCombos = new Set((relations || []).map(r => r.level_combo)).size;
    return {
      totalRelations: (relations || []).length,
      uniqueUsers,
      uniqueCombos
    };
  }

  async approveRelation(levelCombo, description, curatorNote, convergenceCount, avgCBefore, avgCAfter, descriptions) {
    const existing = await this._fetch('/system_updates?order=version.desc&limit=1');
    const nextVersion = (existing && existing.length > 0) ? existing[0].version + 1 : 1;
    const now = new Date().toISOString();

    await this._fetch('/convergent_relations', {
      method: 'POST',
      headers: { 'Prefer': 'return=minimal' },
      body: JSON.stringify({
        level_combo: levelCombo,
        convergence_count: convergenceCount,
        description: description,
        avg_c_before: avgCBefore,
        avg_c_after: avgCAfter,
        status: 'approved',
        curator_note: curatorNote,
        reviewed_at: now,
        published_at: now
      })
    });

    await this._fetch('/system_updates', {
      method: 'POST',
      headers: { 'Prefer': 'return=minimal' },
      body: JSON.stringify({
        level_combo: levelCombo,
        description: description,
        descriptions: descriptions || [],
        convergence_count: convergenceCount,
        curator_note: curatorNote,
        version: nextVersion,
        published_at: now
      })
    });

    return { success: true, version: nextVersion };
  }

  async rejectRelation(levelCombo, convergenceCount) {
    await this._fetch('/convergent_relations', {
      method: 'POST',
      headers: { 'Prefer': 'return=minimal' },
      body: JSON.stringify({
        level_combo: levelCombo,
        convergence_count: convergenceCount,
        description: '',
        status: 'rejected',
        reviewed_at: new Date().toISOString()
      })
    });
    return { success: true };
  }

  async getApprovedUpdates() {
    return this._fetch('/system_updates?order=version.desc') || [];
  }

  async buildGraph() {
    return this.rpc('build_relation_graph');
  }

  async getGraphSummary() {
    return this.rpc('get_graph_summary');
  }

  async detectGaps() {
    return this.rpc('detect_gaps');
  }

  async detectContradictions(minDescriptions = 2) {
    return this.rpc('detect_contradictions', { min_descriptions: minDescriptions });
  }

  async getRefutationCounts() {
    return this.rpc('get_refutation_counts');
  }

  async getRefutations() {
    return this._fetch('/refutations?order=created_at.desc') || [];
  }

  async getFullSnapshot() {
    const [
      shared_relations,
      convergent_relations,
      system_updates,
      relation_graph,
      refutations
    ] = await Promise.all([
      this._fetch('/shared_relations?select=*&order=created_at.desc&limit=5000').catch(() => []),
      this._fetch('/convergent_relations?select=*').catch(() => []),
      this._fetch('/system_updates?select=*&order=version.desc').catch(() => []),
      this._fetch('/relation_graph?select=*').catch(() => []),
      this._fetch('/refutations?select=*&order=created_at.desc').catch(() => [])
    ]);

    return {
      timestamp: new Date().toISOString(),
      shared_relations: shared_relations || [],
      convergent_relations: convergent_relations || [],
      system_updates: system_updates || [],
      relation_graph: relation_graph || [],
      refutations: refutations || [],
      node_count: new Set((shared_relations || []).map(r => r.user_hash)).size
    };
  }

  async seedTable(tableName, rows) {
    if (!rows || rows.length === 0) return 0;
    // Insert in batches of 100
    let inserted = 0;
    for (let i = 0; i < rows.length; i += 100) {
      const batch = rows.slice(i, i + 100);
      await this._fetch(`/${tableName}`, {
        method: 'POST',
        headers: {
          'Prefer': 'return=minimal,resolution=ignore-duplicates'
        },
        body: JSON.stringify(batch)
      });
      inserted += batch.length;
    }
    return inserted;
  }

  async seedFromSnapshot(snapshot) {
    const results = {};
    const tables = ['shared_relations', 'convergent_relations', 'system_updates', 'relation_graph', 'refutations'];
    for (const table of tables) {
      if (snapshot[table] && snapshot[table].length > 0) {
        try {
          results[table] = await this.seedTable(table, snapshot[table]);
        } catch (err) {
          results[table] = 'error: ' + err.message;
        }
      } else {
        results[table] = 0;
      }
    }
    return results;
  }
}

// DOM
const connectBtn = document.getElementById('connectBtn');
const detectBtn = document.getElementById('detectBtn');
const supabaseUrlInput = document.getElementById('supabaseUrl');
const serviceKeyInput = document.getElementById('serviceKey');
const connectionStatus = document.getElementById('connectionStatus');
const statsSection = document.getElementById('statsSection');
const convergenceSection = document.getElementById('convergenceSection');
const approvedSection = document.getElementById('approvedSection');
const graphSection = document.getElementById('graphSection');
const gapsSection = document.getElementById('gapsSection');
const contradictionsSection = document.getElementById('contradictionsSection');
const refutationsSection = document.getElementById('refutationsSection');
const seedSection = document.getElementById('seedSection');

// Load saved config
const savedUrl = localStorage.getItem('curator_url');
const savedKey = localStorage.getItem('curator_key');
if (savedUrl) supabaseUrlInput.value = savedUrl;
if (savedKey) serviceKeyInput.value = savedKey;

connectBtn.addEventListener('click', async () => {
  const url = supabaseUrlInput.value.trim();
  const key = serviceKeyInput.value.trim();
  if (!url || !key) {
    connectionStatus.textContent = 'Completa ambos campos';
    connectionStatus.className = 'status error';
    return;
  }

  client = new CuratorClient(url, key);
  localStorage.setItem('curator_url', url);
  localStorage.setItem('curator_key', key);

  try {
    const stats = await client.getStats();
    connectionStatus.textContent = 'Conectado';
    connectionStatus.className = 'status success';

    // Show stats
    document.getElementById('stats').innerHTML = `
      <div class="stat"><span class="stat-value">${stats.totalRelations}</span><span class="stat-label">Relaciones</span></div>
      <div class="stat"><span class="stat-value">${stats.uniqueUsers}</span><span class="stat-label">Usuarios</span></div>
      <div class="stat"><span class="stat-value">${stats.uniqueCombos}</span><span class="stat-label">Combos unicos</span></div>
    `;
    statsSection.style.display = 'block';
    convergenceSection.style.display = 'block';
    approvedSection.style.display = 'block';
    graphSection.style.display = 'block';
    gapsSection.style.display = 'block';
    contradictionsSection.style.display = 'block';
    refutationsSection.style.display = 'block';
    seedSection.style.display = 'block';

    loadApproved();
    loadRefutations();
  } catch (err) {
    connectionStatus.textContent = 'Error: ' + err.message;
    connectionStatus.className = 'status error';
  }
});

detectBtn.addEventListener('click', async () => {
  if (!client) return;
  const threshold = parseInt(document.getElementById('threshold').value) || 3;
  const list = document.getElementById('convergenceList');
  list.innerHTML = '<p class="loading-text">Detectando...</p>';

  try {
    const results = await client.detectConvergence(threshold);
    list.innerHTML = '';

    if (!results || results.length === 0) {
      list.innerHTML = '<p class="empty">No hay convergencias sobre el umbral.</p>';
      return;
    }

    results.forEach(r => {
      const card = document.createElement('div');
      card.className = 'convergence-card';

      const header = document.createElement('div');
      header.className = 'conv-header';
      header.innerHTML = `<span class="conv-level">${r.level_combo}</span><span class="conv-count">${r.unique_users} usuarios</span>`;

      const cValues = document.createElement('div');
      cValues.className = 'conv-c';
      const ws = r.weighted_score !== undefined ? ` · score: ${r.weighted_score}` : '';
      const stddev = r.c_stddev !== undefined ? ` · σ: ${r.c_stddev}` : '';
      const descCount = r.description_count !== undefined ? ` · ${r.description_count} perspectivas` : '';
      cValues.textContent = `C promedio: ${r.avg_c_before} → ${r.avg_c_after}${ws}${stddev}${descCount}`;

      const descs = document.createElement('div');
      descs.className = 'conv-descriptions';
      descs.innerHTML = '<strong>Descripciones:</strong>';
      (r.descriptions || []).forEach(d => {
        const p = document.createElement('p');
        p.textContent = '• ' + d;
        descs.appendChild(p);
      });

      const form = document.createElement('div');
      form.className = 'conv-form';

      const descInput = document.createElement('textarea');
      descInput.placeholder = 'Descripcion canonica (la que verian todos)';
      descInput.rows = 2;

      const noteInput = document.createElement('input');
      noteInput.type = 'text';
      noteInput.placeholder = 'Nota del curator (requerida)';

      const actions = document.createElement('div');
      actions.className = 'conv-actions';

      const approveBtn = document.createElement('button');
      approveBtn.className = 'approve-btn';
      approveBtn.textContent = 'Aprobar';
      approveBtn.addEventListener('click', async () => {
        const desc = descInput.value.trim();
        const note = noteInput.value.trim();
        if (!desc) { descInput.style.borderColor = '#ef4444'; return; }
        if (!note) { noteInput.style.borderColor = '#ef4444'; return; }
        approveBtn.disabled = true;
        approveBtn.textContent = 'Aprobando...';
        try {
          await client.approveRelation(
            r.level_combo, desc, note,
            r.unique_users, r.avg_c_before, r.avg_c_after,
            r.descriptions || []
          );
          card.style.borderColor = '#22c55e';
          approveBtn.textContent = 'Aprobado';
          rejectBtn.remove();
          loadApproved();
        } catch (err) {
          approveBtn.textContent = 'Error: ' + err.message;
        }
      });

      const rejectBtn = document.createElement('button');
      rejectBtn.className = 'reject-btn';
      rejectBtn.textContent = 'Rechazar';
      rejectBtn.addEventListener('click', async () => {
        rejectBtn.disabled = true;
        try {
          await client.rejectRelation(r.level_combo, r.unique_users);
          card.style.opacity = '0.4';
          rejectBtn.textContent = 'Rechazado';
          approveBtn.remove();
        } catch (err) {
          rejectBtn.textContent = 'Error';
        }
      });

      actions.appendChild(approveBtn);
      actions.appendChild(rejectBtn);
      form.appendChild(descInput);
      form.appendChild(noteInput);
      form.appendChild(actions);

      card.appendChild(header);
      card.appendChild(cValues);
      card.appendChild(descs);
      card.appendChild(form);
      list.appendChild(card);
    });
  } catch (err) {
    list.innerHTML = '<p class="error">Error: ' + err.message + '</p>';
  }
});

async function loadApproved() {
  if (!client) return;
  const list = document.getElementById('approvedList');
  try {
    const updates = await client.getApprovedUpdates();
    list.innerHTML = '';
    if (!updates || updates.length === 0) {
      list.innerHTML = '<p class="empty">No hay updates publicados.</p>';
      return;
    }
    updates.forEach(u => {
      const card = document.createElement('div');
      card.className = 'approved-card';
      const date = new Date(u.published_at).toLocaleDateString('es', { day: 'numeric', month: 'short', year: 'numeric' });
      card.innerHTML = `
        <div class="approved-header">
          <span class="approved-level">${u.level_combo}</span>
          <span class="approved-version">v${u.version}</span>
        </div>
        <p class="approved-desc">${u.description}</p>
        <div class="approved-meta">${u.convergence_count} usuarios · ${date}</div>
      `;
      if (u.curator_note) {
        const note = document.createElement('p');
        note.className = 'approved-note';
        note.textContent = u.curator_note;
        card.appendChild(note);
      }
      list.appendChild(card);
    });
  } catch (err) {
    list.innerHTML = '<p class="error">Error: ' + err.message + '</p>';
  }
}

// Graph handlers
document.getElementById('buildGraphBtn').addEventListener('click', async () => {
  if (!client) return;
  const result = document.getElementById('graphResult');
  result.innerHTML = '<p class="loading-text">Construyendo grafo...</p>';
  try {
    const processed = await client.buildGraph();
    result.innerHTML = `<p class="status success">Grafo construido: ${processed} relaciones procesadas.</p>`;
  } catch (err) {
    result.innerHTML = '<p class="error">Error: ' + err.message + '</p>';
  }
});

document.getElementById('viewGraphBtn').addEventListener('click', async () => {
  if (!client) return;
  const result = document.getElementById('graphResult');
  result.innerHTML = '<p class="loading-text">Cargando resumen...</p>';
  try {
    const edges = await client.getGraphSummary();
    result.innerHTML = '';
    if (!edges || edges.length === 0) {
      result.innerHTML = '<p class="empty">No hay aristas en el grafo. Construye primero.</p>';
      return;
    }
    edges.forEach(e => {
      const card = document.createElement('div');
      card.className = 'graph-edge';
      const density = e.unique_users >= 3 ? 'mapeado' : e.unique_users >= 2 ? 'emergente' : 'frontera';
      card.classList.add('density-' + density);
      card.innerHTML = `
        <span class="edge-pair">${e.from_level} — ${e.to_level}</span>
        <span class="edge-meta">${e.edge_count} conexiones · ${e.unique_users} usuarios · <em>${density}</em></span>
      `;
      result.appendChild(card);
    });
  } catch (err) {
    result.innerHTML = '<p class="error">Error: ' + err.message + '</p>';
  }
});

// Gaps handler
document.getElementById('detectGapsBtn').addEventListener('click', async () => {
  if (!client) return;
  const list = document.getElementById('gapsList');
  list.innerHTML = '<p class="loading-text">Detectando huecos...</p>';
  try {
    const gaps = await client.detectGaps();
    list.innerHTML = '';
    if (!gaps || gaps.length === 0) {
      list.innerHTML = '<p class="empty">No hay huecos — todas las combinaciones estan exploradas.</p>';
      return;
    }
    // Group by first level
    const grouped = {};
    gaps.forEach(g => {
      if (!grouped[g.level_a]) grouped[g.level_a] = [];
      grouped[g.level_a].push(g.level_b);
    });
    Object.keys(grouped).sort().forEach(levelA => {
      const group = document.createElement('div');
      group.className = 'gap-group';
      group.innerHTML = `<span class="gap-level">${levelA}</span><span class="gap-targets">sin conexion con: ${grouped[levelA].join(', ')}</span>`;
      list.appendChild(group);
    });
    const total = document.createElement('p');
    total.className = 'gap-total';
    total.textContent = gaps.length + ' combinaciones inexploradas';
    list.appendChild(total);
  } catch (err) {
    list.innerHTML = '<p class="error">Error: ' + err.message + '</p>';
  }
});

// Contradictions handler
document.getElementById('detectContradictionsBtn').addEventListener('click', async () => {
  if (!client) return;
  const list = document.getElementById('contradictionsList');
  list.innerHTML = '<p class="loading-text">Detectando contradicciones...</p>';
  try {
    const results = await client.detectContradictions();
    list.innerHTML = '';
    if (!results || results.length === 0) {
      list.innerHTML = '<p class="empty">No hay contradicciones detectadas.</p>';
      return;
    }
    results.forEach(r => {
      const card = document.createElement('div');
      card.className = 'contradiction-card';
      let descsHtml = (r.descriptions || []).map(d => '<p>• ' + d + '</p>').join('');
      card.innerHTML = `
        <div class="contradiction-header">
          <span class="contradiction-level">${r.level_combo}</span>
          <span class="contradiction-count">${r.description_count} descripciones · ${r.unique_users} usuarios</span>
        </div>
        <div class="contradiction-descriptions">${descsHtml}</div>
      `;
      list.appendChild(card);
    });
  } catch (err) {
    list.innerHTML = '<p class="error">Error: ' + err.message + '</p>';
  }
});

// Refutations loader
async function loadRefutations() {
  if (!client) return;
  const list = document.getElementById('refutationsList');
  try {
    const [refutations, counts] = await Promise.all([
      client.getRefutations(),
      client.getRefutationCounts()
    ]);

    list.innerHTML = '';
    if (!counts || counts.length === 0) {
      list.innerHTML = '<p class="empty">No hay refutaciones registradas.</p>';
      return;
    }

    // Get update info for context
    const updates = await client.getApprovedUpdates();
    const updateMap = {};
    (updates || []).forEach(u => { updateMap[u.id] = u; });

    counts.forEach(c => {
      const update = updateMap[c.update_id];
      const card = document.createElement('div');
      card.className = 'refutation-card';
      if (c.refutation_count >= 3) card.classList.add('threshold-reached');
      card.innerHTML = `
        <div class="refutation-header">
          <span class="refutation-level">${update ? update.level_combo : c.update_id.substring(0,8)}</span>
          <span class="refutation-count">${c.refutation_count} refutaciones</span>
        </div>
        <p class="refutation-desc">${update ? update.description : 'Update no encontrado'}</p>
      `;
      list.appendChild(card);
    });
  } catch (err) {
    list.innerHTML = '<p class="error">Error: ' + err.message + '</p>';
  }
}

// Seed: Export snapshot
document.getElementById('exportSnapshotBtn').addEventListener('click', async () => {
  if (!client) return;
  const status = document.getElementById('seedStatus');
  status.textContent = 'Descargando snapshot completo de Supabase...';
  status.className = 'status';

  try {
    const snapshot = await client.getFullSnapshot();
    const blob = new Blob([JSON.stringify(snapshot, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `logic-seed-${new Date().toISOString().slice(0,10)}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    const total = snapshot.shared_relations.length + snapshot.convergent_relations.length +
                  snapshot.system_updates.length + snapshot.relation_graph.length + snapshot.refutations.length;
    status.textContent = `Exportado: ${total} registros, ${snapshot.node_count} nodos. Este archivo puede re-sembrar cualquier Supabase.`;
    status.className = 'status success';
  } catch (err) {
    status.textContent = 'Error: ' + err.message;
    status.className = 'status error';
  }
});

// Seed: Import snapshot to Supabase
document.getElementById('importSnapshotBtn').addEventListener('click', () => {
  document.getElementById('seedFileInput').click();
});

document.getElementById('seedFileInput').addEventListener('change', async (e) => {
  const file = e.target.files[0];
  if (!file || !client) return;

  const status = document.getElementById('seedStatus');
  status.textContent = 'Leyendo archivo...';
  status.className = 'status';

  try {
    const text = await file.text();
    const snapshot = JSON.parse(text);

    if (!snapshot.timestamp || !snapshot.shared_relations) {
      status.textContent = 'Error: no es un snapshot valido (falta timestamp o shared_relations)';
      status.className = 'status error';
      return;
    }

    status.textContent = 'Sembrando datos en Supabase...';

    const results = await client.seedFromSnapshot(snapshot);
    const summary = Object.entries(results)
      .map(([table, count]) => `${table}: ${count}`)
      .join(', ');

    status.textContent = `Semilla completada: ${summary}`;
    status.className = 'status success';
  } catch (err) {
    status.textContent = 'Error: ' + err.message;
    status.className = 'status error';
  }

  e.target.value = '';
});

// Auto-connect if saved
if (savedUrl && savedKey) {
  connectBtn.click();
}
