const messagesEl = document.getElementById('messages');
const userInput = document.getElementById('userInput');
const sendBtn = document.getElementById('sendBtn');
const clearBtn = document.getElementById('clearBtn');
const settingsBtn = document.getElementById('settingsBtn');
const openSettingsBtn = document.getElementById('openSettingsBtn');
const analyzePageBtn = document.getElementById('analyzePageBtn');
const insightsBtn = document.getElementById('insightsBtn');
const closeInsightsBtn = document.getElementById('closeInsightsBtn');
const insightsPanel = document.getElementById('insightsPanel');
const insightsList = document.getElementById('insightsList');
const collectiveBtn = document.getElementById('collectiveBtn');
const collectivePanel = document.getElementById('collectivePanel');
const closeCollectiveBtn = document.getElementById('closeCollectiveBtn');
const collectiveContent = document.getElementById('collectiveContent');
const chatContainer = document.getElementById('chatContainer');
const noKeyMessage = document.getElementById('noKeyMessage');
const inputArea = document.getElementById('inputArea');

let conversationHistory = [];
let isLoading = false;
let pageContext = null;

// Init
async function init() {
  const { apiKey } = await chrome.storage.local.get(['apiKey']);
  if (!apiKey) {
    showNoKeyState();
  } else {
    showChatState();
  }
  updateInsightsBadge();
  updateCollectiveBadge();
}

function showNoKeyState() {
  noKeyMessage.style.display = 'flex';
  chatContainer.style.display = 'none';
  inputArea.style.display = 'none';
}

function showChatState() {
  noKeyMessage.style.display = 'none';
  chatContainer.style.display = 'block';
  inputArea.style.display = 'block';
  insightsPanel.style.display = 'none';
}

// Messages
function addSystemMessage(text) {
  const div = document.createElement('div');
  div.className = 'message';
  div.innerHTML = `
    <span class="message-role system">sistema</span>
    <div class="message-content">${renderMarkdown(text)}</div>
  `;
  messagesEl.appendChild(div);
  scrollToBottom();
}

function addUserMessage(text, hasPageContext) {
  const div = document.createElement('div');
  div.className = 'message';

  const role = document.createElement('span');
  role.className = 'message-role';
  role.textContent = 'tu';
  div.appendChild(role);

  if (hasPageContext) {
    const badge = document.createElement('div');
    badge.className = 'page-context';
    badge.textContent = 'Contexto de pagina incluido';
    div.appendChild(badge);
  }

  const content = document.createElement('div');
  content.className = 'message-content';
  content.textContent = text;
  div.appendChild(content);

  const corrBtn = document.createElement('button');
  corrBtn.className = 'correction-btn';
  corrBtn.textContent = 'Guardar como correccion';
  corrBtn.addEventListener('click', async () => {
    corrBtn.disabled = true;
    corrBtn.textContent = 'Guardando...';
    const response = await chrome.runtime.sendMessage({
      type: 'saveCorrection',
      correction: { text: text }
    });
    if (response.success) {
      corrBtn.textContent = 'Correccion guardada';
      corrBtn.classList.add('saved');
    }
  });
  div.appendChild(corrBtn);

  messagesEl.appendChild(div);
  scrollToBottom();
}

function addAssistantMessage(text) {
  // Extract insight if present
  const { cleanText, insight } = extractInsight(text);

  const div = document.createElement('div');
  div.className = 'message';

  div.innerHTML = `
    <span class="message-role system">logic</span>
    <div class="message-content">${renderMarkdown(cleanText)}</div>
  `;

  if (insight) {
    const notif = document.createElement('div');
    notif.className = 'insight-notification';

    const label = document.createElement('div');
    label.className = 'insight-label';
    label.textContent = 'INSIGHT DETECTADO — ' + insight.level;

    const desc = document.createElement('div');
    desc.className = 'insight-text';
    desc.textContent = insight.description;

    const cInfo = document.createElement('div');
    cInfo.className = 'insight-text';
    cInfo.style.cssText = 'font-size:11px; color: var(--text-muted);';
    cInfo.textContent = 'C: ' + insight.c_before + ' → ' + insight.c_after;

    const btn = document.createElement('button');
    btn.textContent = 'Aceptar insight';
    btn.addEventListener('click', async () => {
      btn.disabled = true;
      btn.textContent = 'Guardando...';
      const response = await chrome.runtime.sendMessage({
        type: 'saveInsight',
        insight: insight
      });
      if (response.success) {
        btn.textContent = 'Guardado';
        btn.style.background = 'var(--success)';
        updateInsightsBadge();
      }
    });

    const shareBtn = document.createElement('button');
    shareBtn.textContent = 'Compartir relacion';
    shareBtn.className = 'share-btn';
    shareBtn.addEventListener('click', async () => {
      const statusRes = await chrome.runtime.sendMessage({ type: 'getCollectiveStatus' });
      if (!statusRes.enabled) {
        shareBtn.textContent = 'Activa en Config';
        shareBtn.style.color = 'var(--text-muted)';
        return;
      }
      shareBtn.disabled = true;
      shareBtn.textContent = 'Compartiendo...';
      const response = await chrome.runtime.sendMessage({
        type: 'shareRelation',
        insight: insight
      });
      if (response.success) {
        shareBtn.textContent = 'Compartida';
        shareBtn.style.borderColor = 'var(--success)';
        shareBtn.style.color = 'var(--success)';
      } else if (response.error === 'ALREADY_SHARED') {
        shareBtn.textContent = 'Ya compartida';
      } else {
        shareBtn.textContent = 'Error';
        setTimeout(() => {
          shareBtn.textContent = 'Compartir relacion';
          shareBtn.disabled = false;
        }, 2000);
      }
    });

    const btnRow = document.createElement('div');
    btnRow.style.cssText = 'display:flex;gap:6px;';
    btnRow.appendChild(btn);
    btnRow.appendChild(shareBtn);

    notif.appendChild(label);
    notif.appendChild(desc);
    notif.appendChild(cInfo);
    notif.appendChild(btnRow);
    div.appendChild(notif);
  }

  messagesEl.appendChild(div);
  scrollToBottom();
}

function addErrorMessage(text) {
  const div = document.createElement('div');
  div.className = 'error-message';
  div.textContent = text;
  messagesEl.appendChild(div);
  scrollToBottom();
}

function showLoading() {
  const div = document.createElement('div');
  div.className = 'loading';
  div.id = 'loadingIndicator';
  div.innerHTML = `
    <div class="loading-dots">
      <span></span><span></span><span></span>
    </div>
    <span>Procesando...</span>
  `;
  messagesEl.appendChild(div);
  scrollToBottom();
}

function hideLoading() {
  const el = document.getElementById('loadingIndicator');
  if (el) el.remove();
}

function scrollToBottom() {
  chatContainer.scrollTop = chatContainer.scrollHeight;
}

// Insight extraction
function extractInsight(text) {
  const insightRegex = /```INSIGHT\s*\n([\s\S]*?)```/;
  const match = text.match(insightRegex);

  if (!match) return { cleanText: text, insight: null };

  const cleanText = text.replace(insightRegex, '').trim();

  try {
    const insight = JSON.parse(match[1].trim());
    return { cleanText, insight };
  } catch (e) {
    return { cleanText: text, insight: null };
  }
}

// (accept insight is handled inline via addEventListener in addAssistantMessage)

// Insights badge
async function updateInsightsBadge() {
  const response = await chrome.runtime.sendMessage({ type: 'getInsights' });
  const existing = insightsBtn.querySelector('.insight-badge');
  if (existing) existing.remove();

  if (response.insights && response.insights.length > 0) {
    const badge = document.createElement('span');
    badge.className = 'insight-badge';
    insightsBtn.appendChild(badge);
  }
}

// Insights panel
async function showInsightsPanel() {
  const [insightsRes, correctionsRes] = await Promise.all([
    chrome.runtime.sendMessage({ type: 'getInsights' }),
    chrome.runtime.sendMessage({ type: 'getCorrections' })
  ]);
  const insights = insightsRes.insights || [];
  const corrections = correctionsRes.corrections || [];

  insightsList.innerHTML = '';

  // Insights section
  const insightsHeader = document.createElement('div');
  insightsHeader.className = 'section-header';
  insightsHeader.textContent = 'Insights';
  insightsList.appendChild(insightsHeader);

  if (insights.length === 0) {
    const empty = document.createElement('p');
    empty.className = 'empty-insights';
    empty.textContent = 'No hay insights acumulados aun.';
    insightsList.appendChild(empty);
  } else {
    insights.forEach((insight, index) => {
      const card = document.createElement('div');
      card.className = 'insight-card';

      const date = new Date(insight.date);
      const dateStr = date.toLocaleDateString('es', { day: 'numeric', month: 'short', year: 'numeric' });

      card.innerHTML = `
        <div class="insight-level">${escapeHtml(insight.level)}</div>
        <div class="insight-description">${escapeHtml(insight.description)}</div>
        <div class="insight-c">C: ${escapeHtml(insight.c_before)} → ${escapeHtml(insight.c_after)}</div>
        <div class="insight-why">${escapeHtml(insight.why)}</div>
        <div class="insight-date">${dateStr}</div>
        <div class="insight-actions"></div>
      `;

      const deleteBtn = document.createElement('button');
      deleteBtn.className = 'delete-insight';
      deleteBtn.textContent = 'Eliminar';
      deleteBtn.addEventListener('click', async () => {
        await chrome.runtime.sendMessage({ type: 'deleteInsight', index });
        updateInsightsBadge();
        showInsightsPanel();
      });
      card.querySelector('.insight-actions').appendChild(deleteBtn);

      insightsList.appendChild(card);
    });
  }

  // Corrections section
  const corrHeader = document.createElement('div');
  corrHeader.className = 'section-header';
  corrHeader.textContent = 'Correcciones (' + corrections.length + ')';
  insightsList.appendChild(corrHeader);

  if (corrections.length === 0) {
    const empty = document.createElement('p');
    empty.className = 'empty-insights';
    empty.textContent = 'No hay correcciones guardadas. Cuando corrijas a Logic, guarda tu mensaje como correccion para que aprenda.';
    insightsList.appendChild(empty);
  } else {
    corrections.forEach((corr, index) => {
      const card = document.createElement('div');
      card.className = 'correction-card';

      const date = new Date(corr.date);
      const dateStr = date.toLocaleDateString('es', { day: 'numeric', month: 'short', year: 'numeric' });

      const textEl = document.createElement('div');
      textEl.className = 'correction-text';
      textEl.textContent = corr.text;

      const dateEl = document.createElement('div');
      dateEl.className = 'insight-date';
      dateEl.textContent = dateStr;

      const actions = document.createElement('div');
      actions.className = 'insight-actions';

      const deleteBtn = document.createElement('button');
      deleteBtn.className = 'delete-insight';
      deleteBtn.textContent = 'Eliminar';
      deleteBtn.addEventListener('click', async () => {
        await chrome.runtime.sendMessage({ type: 'deleteCorrection', index });
        showInsightsPanel();
      });
      actions.appendChild(deleteBtn);

      card.appendChild(textEl);
      card.appendChild(dateEl);
      card.appendChild(actions);
      insightsList.appendChild(card);
    });
  }

  chatContainer.style.display = 'none';
  inputArea.style.display = 'none';
  insightsPanel.style.display = 'block';
}

// (delete insight is handled inline via addEventListener in showInsightsPanel)

function hideInsightsPanel() {
  insightsPanel.style.display = 'none';
  chatContainer.style.display = 'block';
  inputArea.style.display = 'block';
}

// Markdown rendering (basic)
function renderMarkdown(text) {
  let html = escapeHtml(text);

  // Code blocks
  html = html.replace(/```(\w*)\n([\s\S]*?)```/g, '<pre><code>$2</code></pre>');

  // Inline code
  html = html.replace(/`([^`]+)`/g, '<code>$1</code>');

  // Headers
  html = html.replace(/^### (.+)$/gm, '<h3>$1</h3>');
  html = html.replace(/^## (.+)$/gm, '<h2>$1</h2>');
  html = html.replace(/^# (.+)$/gm, '<h1>$1</h1>');

  // Bold
  html = html.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');

  // Italic
  html = html.replace(/\*([^*]+)\*/g, '<em>$1</em>');

  // Horizontal rules
  html = html.replace(/^---$/gm, '<hr>');

  // Lists
  html = html.replace(/^- (.+)$/gm, '<li>$1</li>');
  html = html.replace(/(<li>.*<\/li>\n?)+/g, '<ul>$&</ul>');

  // Numbered lists
  html = html.replace(/^\d+\. (.+)$/gm, '<li>$1</li>');

  // C scores highlighting
  html = html.replace(/\bC\s*=\s*([\d.]+)/g, '<span class="c-score">C = $1</span>');
  html = html.replace(/\bC\s*[<>≥≤]=?\s*([\d.]+)/g, (match) => `<span class="c-score">${match}</span>`);
  html = html.replace(/\b[SOR]\(v\)\s*=\s*([\d.]+)/g, (match) => `<span class="c-score">${match}</span>`);

  // Paragraphs
  html = html.replace(/\n\n/g, '</p><p>');
  html = '<p>' + html + '</p>';

  // Clean up empty paragraphs
  html = html.replace(/<p>\s*<\/p>/g, '');
  html = html.replace(/<p>\s*(<h[123]>)/g, '$1');
  html = html.replace(/(<\/h[123]>)\s*<\/p>/g, '$1');
  html = html.replace(/<p>\s*(<hr>)\s*<\/p>/g, '$1');
  html = html.replace(/<p>\s*(<ul>)/g, '$1');
  html = html.replace(/(<\/ul>)\s*<\/p>/g, '$1');
  html = html.replace(/<p>\s*(<pre>)/g, '$1');
  html = html.replace(/(<\/pre>)\s*<\/p>/g, '$1');

  return html;
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

// Send message
async function sendMessage() {
  const text = userInput.value.trim();
  if (!text || isLoading) return;

  isLoading = true;
  sendBtn.disabled = true;
  userInput.value = '';
  autoResize();

  let fullMessage = text;
  const hasContext = !!pageContext;

  if (pageContext) {
    fullMessage = `[Contexto de la pagina web actual]\n${pageContext}\n\n[Pregunta del usuario]\n${text}`;
    pageContext = null;
    analyzePageBtn.classList.remove('active');
  }

  addUserMessage(text, hasContext);

  conversationHistory.push({ role: 'user', content: fullMessage });

  showLoading();

  const response = await chrome.runtime.sendMessage({
    type: 'chat',
    messages: conversationHistory
  });

  hideLoading();

  if (response.error) {
    if (response.error === 'NO_API_KEY') {
      addErrorMessage('No hay API key configurada. Abre la configuracion.');
    } else if (response.error === 'INVALID_API_KEY') {
      addErrorMessage('API key invalida. Verifica tu configuracion.');
    } else {
      addErrorMessage(`Error: ${response.details || response.error}`);
    }
    conversationHistory.pop();
  } else {
    conversationHistory.push({ role: 'assistant', content: response.content });
    addAssistantMessage(response.content);
  }

  isLoading = false;
  sendBtn.disabled = false;
  userInput.focus();
}

// Analyze page
async function analyzePage() {
  if (pageContext) {
    pageContext = null;
    analyzePageBtn.classList.remove('active');
    return;
  }

  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab || !tab.id) {
    addErrorMessage('No se encontro una pestana activa.');
    return;
  }

  try {
    const response = await chrome.runtime.sendMessage({
      type: 'getPageContent',
      tabId: tab.id
    });

    if (response.error) {
      addErrorMessage('No se pudo acceder a esta pagina. Navega a una pagina web normal e intenta de nuevo.');
    } else if (response.content && response.content.trim().length > 0) {
      pageContext = response.content;
      analyzePageBtn.classList.add('active');
    } else {
      addErrorMessage('La pagina no tiene contenido extraible.');
    }
  } catch (err) {
    addErrorMessage('No se puede acceder a esta pagina. Navega a una pagina web e intenta de nuevo.');
  }
}

// Auto resize textarea
function autoResize() {
  userInput.style.height = 'auto';
  userInput.style.height = Math.min(userInput.scrollHeight, 120) + 'px';
}

// Event listeners
sendBtn.addEventListener('click', sendMessage);

userInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    sendMessage();
  }
});

userInput.addEventListener('input', autoResize);

clearBtn.addEventListener('click', () => {
  conversationHistory = [];
  messagesEl.innerHTML = '';
  pageContext = null;
  analyzePageBtn.classList.remove('active');
});

settingsBtn.addEventListener('click', () => {
  chrome.runtime.openOptionsPage();
});

openSettingsBtn.addEventListener('click', () => {
  chrome.runtime.openOptionsPage();
});

insightsBtn.addEventListener('click', () => {
  if (insightsPanel.style.display === 'block') {
    hideInsightsPanel();
  } else {
    showInsightsPanel();
  }
});

closeInsightsBtn.addEventListener('click', hideInsightsPanel);

const exportInsightsBtn = document.getElementById('exportInsightsBtn');
exportInsightsBtn.addEventListener('click', async () => {
  exportInsightsBtn.disabled = true;
  exportInsightsBtn.textContent = 'Exportando...';
  const response = await chrome.runtime.sendMessage({ type: 'exportInsights' });
  if (response && response.success) {
    exportInsightsBtn.textContent = 'Exportado';
    setTimeout(() => {
      exportInsightsBtn.textContent = 'Exportar';
      exportInsightsBtn.disabled = false;
    }, 2000);
  } else {
    exportInsightsBtn.textContent = 'Error';
    setTimeout(() => {
      exportInsightsBtn.textContent = 'Exportar';
      exportInsightsBtn.disabled = false;
    }, 2000);
  }
});

// Listen for storage changes (API key added)
chrome.storage.onChanged.addListener((changes) => {
  if (changes.apiKey && changes.apiKey.newValue) {
    showChatState();
    if (messagesEl.children.length === 0) {
      showChatState();
    }
  }
});

analyzePageBtn.addEventListener('click', analyzePage);

// Collective panel
async function updateCollectiveBadge() {
  const response = await chrome.runtime.sendMessage({ type: 'getPendingUpdates' });
  const existing = collectiveBtn.querySelector('.collective-badge');
  if (existing) existing.remove();

  if (response.updates && response.updates.length > 0) {
    const badge = document.createElement('span');
    badge.className = 'collective-badge';
    badge.textContent = response.updates.length;
    collectiveBtn.appendChild(badge);
  }
}

async function showCollectivePanel() {
  const [statusRes, updatesRes] = await Promise.all([
    chrome.runtime.sendMessage({ type: 'getCollectiveStatus' }),
    chrome.runtime.sendMessage({ type: 'getPendingUpdates' })
  ]);

  collectiveContent.innerHTML = '';

  // Sharing toggle
  const toggleSection = document.createElement('div');
  toggleSection.className = 'collective-toggle';
  const toggleLabel = document.createElement('span');
  toggleLabel.textContent = 'Participar en la red';
  toggleLabel.style.cssText = 'font-size:12px;color:var(--text-secondary);';
  const toggleSwitch = document.createElement('input');
  toggleSwitch.type = 'checkbox';
  toggleSwitch.checked = statusRes.enabled;
  toggleSwitch.addEventListener('change', async () => {
    await chrome.runtime.sendMessage({
      type: 'setCollectiveStatus',
      enabled: toggleSwitch.checked
    });
  });
  toggleSection.appendChild(toggleLabel);
  toggleSection.appendChild(toggleSwitch);
  collectiveContent.appendChild(toggleSection);

  // Info text
  const info = document.createElement('p');
  info.className = 'collective-info';
  info.textContent = 'Comparte relaciones entre niveles del sistema. Solo se comparte la combinacion de niveles y descripcion. Identidad anonima.';
  collectiveContent.appendChild(info);

  // Updates section
  const updates = updatesRes.updates || [];
  const updatesHeader = document.createElement('div');
  updatesHeader.className = 'section-header';
  updatesHeader.textContent = 'Actualizaciones (' + updates.length + ')';
  collectiveContent.appendChild(updatesHeader);

  if (updates.length === 0) {
    const empty = document.createElement('p');
    empty.className = 'empty-insights';
    empty.textContent = 'No hay actualizaciones pendientes.';
    collectiveContent.appendChild(empty);
  } else {
    updates.forEach(update => {
      const card = document.createElement('div');
      card.className = 'update-card';

      const level = document.createElement('div');
      level.className = 'update-level';
      level.textContent = update.level_combo;

      const convergence = document.createElement('div');
      convergence.className = 'update-convergence';
      convergence.textContent = update.convergence_count + ' usuarios independientes';

      const desc = document.createElement('div');
      desc.className = 'update-description';
      desc.textContent = update.description;

      const integrateBtn = document.createElement('button');
      integrateBtn.textContent = 'Integrar';
      integrateBtn.addEventListener('click', async () => {
        integrateBtn.disabled = true;
        integrateBtn.textContent = 'Integrando...';

        // Save to integrated updates
        const { integratedUpdates = [] } = await chrome.storage.local.get(['integratedUpdates']);
        integratedUpdates.push(update);
        await chrome.storage.local.set({ integratedUpdates });

        // Acknowledge
        await chrome.runtime.sendMessage({
          type: 'acknowledgeUpdate',
          updateId: update.id,
          version: update.version
        });

        integrateBtn.textContent = 'Integrado';
        integrateBtn.style.background = 'var(--success)';
        updateCollectiveBadge();
      });

      card.appendChild(level);
      card.appendChild(convergence);
      card.appendChild(desc);
      if (update.curator_note) {
        const note = document.createElement('div');
        note.className = 'update-note';
        note.textContent = update.curator_note;
        card.appendChild(note);
      }
      card.appendChild(integrateBtn);
      collectiveContent.appendChild(card);
    });
  }

  // Integrated updates section (with refutation)
  const { integratedUpdates = [] } = await chrome.storage.local.get(['integratedUpdates']);
  if (integratedUpdates.length > 0) {
    let refutationCounts = {};
    try {
      const rcRes = await chrome.runtime.sendMessage({ type: 'getRefutationCounts' });
      refutationCounts = rcRes.counts || {};
    } catch (e) {}

    const intHeader = document.createElement('div');
    intHeader.className = 'section-header';
    intHeader.textContent = 'Integrados (' + integratedUpdates.length + ')';
    collectiveContent.appendChild(intHeader);

    integratedUpdates.forEach(update => {
      const card = document.createElement('div');
      card.className = 'update-card integrated';

      const level = document.createElement('div');
      level.className = 'update-level';
      level.textContent = update.level_combo;

      const meta = document.createElement('div');
      meta.className = 'update-convergence';
      const refCount = refutationCounts[update.id] || 0;
      meta.textContent = update.convergence_count + ' convergencias · ' + refCount + ' refutaciones';

      const desc = document.createElement('div');
      desc.className = 'update-description';
      desc.textContent = update.description;

      card.appendChild(level);
      card.appendChild(meta);
      card.appendChild(desc);

      if (update.curator_note) {
        const note = document.createElement('div');
        note.className = 'update-note';
        note.textContent = update.curator_note;
        card.appendChild(note);
      }

      const refuteBtn = document.createElement('button');
      refuteBtn.className = 'refute-btn';
      refuteBtn.textContent = 'No se sostuvo';
      refuteBtn.addEventListener('click', async () => {
        refuteBtn.disabled = true;
        refuteBtn.textContent = 'Enviando...';
        const res = await chrome.runtime.sendMessage({
          type: 'submitRefutation',
          updateId: update.id,
          contextDescription: 'Refutado desde sidepanel por el operador'
        });
        if (res.error === 'ALREADY_REFUTED') {
          refuteBtn.textContent = 'Ya refutado';
          refuteBtn.className = 'refute-btn refuted';
        } else if (res.success) {
          refuteBtn.textContent = 'Refutado';
          refuteBtn.className = 'refute-btn refuted';
        } else {
          refuteBtn.textContent = 'Error';
          refuteBtn.disabled = false;
        }
      });
      card.appendChild(refuteBtn);
      collectiveContent.appendChild(card);
    });
  }

  chatContainer.style.display = 'none';
  inputArea.style.display = 'none';
  insightsPanel.style.display = 'none';
  collectivePanel.style.display = 'block';
}

function hideCollectivePanel() {
  collectivePanel.style.display = 'none';
  chatContainer.style.display = 'block';
  inputArea.style.display = 'block';
}

collectiveBtn.addEventListener('click', () => {
  if (collectivePanel.style.display === 'block') {
    hideCollectivePanel();
  } else {
    showCollectivePanel();
  }
});

closeCollectiveBtn.addEventListener('click', hideCollectivePanel);

init();
