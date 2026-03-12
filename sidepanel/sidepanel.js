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
const welcomeState = document.getElementById('welcomeState');

let conversationHistory = [];
let isLoading = false;
let pageContext = null;
let currentPanel = 'chat';

// === CORE UI FUNCTIONS ===

function showToast(message, type = 'info', duration = 2500) {
  const container = document.getElementById('toastContainer');
  const toast = document.createElement('div');
  toast.className = 'toast toast-' + type;
  toast.innerHTML = '<span class="toast-dot"></span>' + escapeHtml(message);
  container.appendChild(toast);
  setTimeout(() => {
    toast.style.animation = 'toastOut 0.25s ease-in forwards';
    toast.addEventListener('animationend', () => toast.remove());
  }, duration);
}

function switchPanel(panel) {
  collectiveBtn.classList.remove('nav-active');
  insightsBtn.classList.remove('nav-active');

  chatContainer.style.display = 'none';
  inputArea.style.display = 'none';
  insightsPanel.style.display = 'none';
  collectivePanel.style.display = 'none';

  switch (panel) {
    case 'chat':
      chatContainer.style.display = 'block';
      inputArea.style.display = 'block';
      break;
    case 'insights':
      insightsPanel.style.display = 'block';
      insightsBtn.classList.add('nav-active');
      break;
    case 'collective':
      collectivePanel.style.display = 'block';
      collectiveBtn.classList.add('nav-active');
      break;
  }

  currentPanel = panel;
}

async function updateWelcomeState() {
  if (messagesEl.children.length === 0) {
    welcomeState.classList.remove('hidden');

    // Check onboarding
    const { onboardingDone } = await chrome.storage.local.get(['onboardingDone']);
    const welcomeTitle = document.getElementById('welcomeTitle');
    const welcomeSubtitle = document.getElementById('welcomeSubtitle');
    const welcomeStats = document.getElementById('welcomeStats');
    const welcomeSuggestions = document.getElementById('welcomeSuggestions');

    if (!onboardingDone) {
      welcomeTitle.textContent = 'Bienvenido a Logic.';
      welcomeSubtitle.textContent = 'Busca conexiones entre areas del conocimiento. Cada insight verificado eleva tu certeza.';
      welcomeStats.style.display = 'none';
    } else {
      welcomeTitle.textContent = 'Hazte una pregunta.';
      welcomeSubtitle.textContent = 'Logic te ayudara a descubrir verdades que amplien tu vision.';

      // Load stats
      try {
        const [insightsRes, gapsRes] = await Promise.all([
          chrome.runtime.sendMessage({ type: 'getInsights' }),
          chrome.runtime.sendMessage({ type: 'getSuggestedGaps' }).catch(() => ({ gaps: [] }))
        ]);
        const insights = insightsRes.insights || [];
        const gaps = gapsRes.gaps || [];

        if (insights.length > 0) {
          // Count unique levels
          const levels = new Set();
          insights.forEach(i => {
            if (i.level) i.level.split('+').forEach(l => levels.add(l.trim()));
          });

          document.getElementById('statInsights').textContent = insights.length;
          document.getElementById('statLevels').textContent = levels.size;
          document.getElementById('statFrontiers').textContent = gaps.length;
          welcomeStats.style.display = 'flex';

          // Dynamic suggestion chips based on frontiers
          if (gaps.length > 0) {
            welcomeSuggestions.innerHTML = '';
            const gap = gaps[0];
            const chip1 = document.createElement('button');
            chip1.className = 'suggestion-chip';
            chip1.textContent = 'Explorar ' + gap.level_a + ' + ' + gap.level_b;
            chip1.addEventListener('click', () => { userInput.value = 'Que relacion hay entre ' + gap.level_a + ' y ' + gap.level_b + '?'; userInput.focus(); autoResize(); });
            welcomeSuggestions.appendChild(chip1);

            if (gaps.length > 1) {
              const gap2 = gaps[1];
              const chip2 = document.createElement('button');
              chip2.className = 'suggestion-chip';
              chip2.textContent = 'Explorar ' + gap2.level_a + ' + ' + gap2.level_b;
              chip2.addEventListener('click', () => { userInput.value = 'Que relacion hay entre ' + gap2.level_a + ' y ' + gap2.level_b + '?'; userInput.focus(); autoResize(); });
              welcomeSuggestions.appendChild(chip2);
            }

            const chipFree = document.createElement('button');
            chipFree.className = 'suggestion-chip';
            chipFree.textContent = 'Pregunta libre';
            chipFree.addEventListener('click', () => { userInput.focus(); });
            welcomeSuggestions.appendChild(chipFree);
          }
        } else {
          welcomeStats.style.display = 'none';
        }
      } catch (e) {
        welcomeStats.style.display = 'none';
      }
    }
  } else {
    welcomeState.classList.add('hidden');
  }
}

// Init
async function init() {
  const { apiKey, providers = {} } = await chrome.storage.local.get(['apiKey', 'providers']);
  const hasKey = apiKey || Object.values(providers).some(p => p && p.key);
  if (!hasKey) {
    showNoKeyState();
  } else {
    showChatState();
  }
  updateWelcomeState();
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
  switchPanel('chat');
}

// === MESSAGES ===

function addSystemMessage(text) {
  const div = document.createElement('div');
  div.className = 'message message-system';
  div.innerHTML = `<div class="message-content">${renderMarkdown(text)}</div>`;
  messagesEl.appendChild(div);
  updateWelcomeState();
  scrollToBottom();
}

function addUserMessage(text, hasPageContext) {
  const div = document.createElement('div');
  div.className = 'message message-user';

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
    const response = await chrome.runtime.sendMessage({
      type: 'saveCorrection',
      correction: { text: text }
    });
    if (response.success) {
      corrBtn.textContent = 'Guardada';
      corrBtn.classList.add('saved');
      showToast('Correccion guardada', 'success');
    }
  });
  div.appendChild(corrBtn);

  messagesEl.appendChild(div);
  updateWelcomeState();
  scrollToBottom();
}

function addAssistantMessage(text) {
  const { cleanText, insight } = extractInsight(text);

  const div = document.createElement('div');
  div.className = 'message message-assistant';
  div.innerHTML = `<div class="message-content">${renderMarkdown(cleanText)}</div>`;

  if (insight) {
    const notif = document.createElement('div');
    notif.className = 'insight-notification';

    // Summary (always visible, compact)
    const summary = document.createElement('div');
    summary.className = 'insight-summary';
    summary.innerHTML = `<span class="insight-dot"></span><span class="insight-summary-text">Insight: ${escapeHtml(insight.level)}</span><span class="insight-expand-arrow">\u25B8</span>`;
    summary.addEventListener('click', () => {
      notif.classList.toggle('expanded');
    });

    // Details (hidden by default)
    const details = document.createElement('div');
    details.className = 'insight-details';

    const desc = document.createElement('div');
    desc.className = 'insight-text';
    desc.textContent = insight.description;

    const cInfo = document.createElement('div');
    cInfo.className = 'insight-text';
    cInfo.style.cssText = 'font-size:11px; color: var(--text-muted); margin-top:4px;';
    cInfo.textContent = 'C: ' + insight.c_before + ' \u2192 ' + insight.c_after;

    const btnRow = document.createElement('div');
    btnRow.style.cssText = 'display:flex;gap:6px;margin-top:8px;';

    const btn = document.createElement('button');
    btn.textContent = 'Aceptar';
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      btn.disabled = true;
      const response = await chrome.runtime.sendMessage({
        type: 'saveInsight',
        insight: insight
      });
      if (response.success) {
        showToast('Insight guardado', 'success');
        btn.textContent = 'Guardado';
        btn.style.background = 'var(--success)';
        updateInsightsBadge();
        // Suggest next frontier after a brief delay
        setTimeout(async () => {
          try {
            const gapsRes = await chrome.runtime.sendMessage({ type: 'getSuggestedGaps' });
            const gaps = gapsRes.gaps || [];
            if (gaps.length > 0) {
              const g = gaps[0];
              showToast('Siguiente frontera: ' + g.level_a + ' + ' + g.level_b, 'info', 4000);
            }
          } catch (e) {}
        }, 1500);
      }
    });

    const shareBtn = document.createElement('button');
    shareBtn.textContent = 'Compartir';
    shareBtn.className = 'share-btn';
    shareBtn.addEventListener('click', async (e) => {
      e.stopPropagation();
      const statusRes = await chrome.runtime.sendMessage({ type: 'getCollectiveStatus' });
      if (!statusRes.enabled) {
        showToast('Activa la red en Configuracion', 'info');
        return;
      }
      shareBtn.disabled = true;
      const response = await chrome.runtime.sendMessage({
        type: 'shareRelation',
        insight: insight
      });
      if (response.success) {
        showToast('Relacion compartida', 'success');
        shareBtn.textContent = 'Compartida';
        shareBtn.style.borderColor = 'var(--success)';
        shareBtn.style.color = 'var(--success)';
      } else if (response.error === 'ALREADY_SHARED') {
        showToast('Ya compartida', 'info');
        shareBtn.textContent = 'Ya compartida';
      } else if (response.error && response.error.includes('RATE_LIMITED')) {
        showToast('Limite: 3 relaciones por dia', 'error');
        shareBtn.disabled = false;
      } else {
        showToast('Error al compartir', 'error');
        shareBtn.disabled = false;
      }
    });

    btnRow.appendChild(btn);
    btnRow.appendChild(shareBtn);
    details.appendChild(desc);
    details.appendChild(cInfo);
    details.appendChild(btnRow);

    notif.appendChild(summary);
    notif.appendChild(details);
    div.appendChild(notif);
  }

  messagesEl.appendChild(div);
  updateWelcomeState();
  scrollToBottom();
}

function addErrorMessage(text) {
  const div = document.createElement('div');
  div.className = 'error-message';
  div.textContent = text;
  messagesEl.appendChild(div);
  updateWelcomeState();
  scrollToBottom();
}

function showLoading() {
  const div = document.createElement('div');
  div.className = 'message message-assistant';
  div.id = 'loadingIndicator';
  div.innerHTML = `
    <div class="message-content typing-indicator">
      <div class="loading-dots">
        <span></span><span></span><span></span>
      </div>
    </div>
  `;
  messagesEl.appendChild(div);
  updateWelcomeState();
  scrollToBottom();
}

function hideLoading() {
  const el = document.getElementById('loadingIndicator');
  if (el) el.remove();
}

function scrollToBottom() {
  chatContainer.scrollTop = chatContainer.scrollHeight;
}

// === INSIGHT EXTRACTION ===

function extractInsight(text) {
  const insightRegex = /```INSIGHT\s*\n([\s\S]*?)```/;
  const match = text.match(insightRegex);

  if (!match) return { cleanText: text, insight: null };

  const cleanText = text.replace(insightRegex, '').trim();

  try {
    const raw = JSON.parse(match[1].trim());
    const validation = validateInsight(raw);
    if (!validation.valid) {
      console.warn('Insight rejected by validation:', validation.errors);
      return { cleanText, insight: null };
    }
    return { cleanText, insight: validation.cleaned };
  } catch (e) {
    return { cleanText: text, insight: null };
  }
}

// === BADGES ===

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

// === INSIGHTS PANEL ===

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
        <div class="insight-c">C: ${escapeHtml(String(insight.c_before))} \u2192 ${escapeHtml(String(insight.c_after))}</div>
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

  switchPanel('insights');
}

// === COLLECTIVE PANEL ===

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
    // Bulk integrate button
    if (updates.length >= 2) {
      const bulkBtn = document.createElement('button');
      bulkBtn.className = 'bulk-integrate-btn';
      bulkBtn.textContent = 'Integrar todos (' + updates.length + ')';
      bulkBtn.addEventListener('click', async () => {
        bulkBtn.disabled = true;
        bulkBtn.textContent = 'Integrando...';
        const { integratedUpdates = [] } = await chrome.storage.local.get(['integratedUpdates']);
        for (const u of updates) {
          u.integrated_at = new Date().toISOString();
          integratedUpdates.push(u);
          await chrome.runtime.sendMessage({
            type: 'acknowledgeUpdate',
            updateId: u.id,
            version: u.version
          });
        }
        await chrome.storage.local.set({ integratedUpdates });
        showToast('Todos integrados', 'success');
        updateCollectiveBadge();
        showCollectivePanel();
      });
      collectiveContent.appendChild(bulkBtn);
    }

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

      // Show perspectives if available
      if (update.descriptions && update.descriptions.length > 1) {
        const persps = document.createElement('div');
        persps.className = 'update-perspectives';
        persps.textContent = update.descriptions.slice(0, 3).join(' | ');
        card.appendChild(level);
        card.appendChild(convergence);
        card.appendChild(desc);
        card.appendChild(persps);
      } else {
        card.appendChild(level);
        card.appendChild(convergence);
        card.appendChild(desc);
      }

      const integrateBtn = document.createElement('button');
      integrateBtn.textContent = 'Integrar';
      integrateBtn.addEventListener('click', async () => {
        integrateBtn.disabled = true;
        integrateBtn.textContent = 'Integrando...';

        const { integratedUpdates = [] } = await chrome.storage.local.get(['integratedUpdates']);
        update.integrated_at = new Date().toISOString();
        integratedUpdates.push(update);
        await chrome.storage.local.set({ integratedUpdates });

        await chrome.runtime.sendMessage({
          type: 'acknowledgeUpdate',
          updateId: update.id,
          version: update.version
        });

        showToast('Integrado', 'success');
        integrateBtn.textContent = 'Integrado';
        integrateBtn.style.background = 'var(--success)';
        updateCollectiveBadge();
      });

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

  // Integrated updates section (with refutation + deprecation + feedback)
  const [
    { integratedUpdates = [] },
    { deprecatedUpdates = [] },
    { feedbackGiven = {} }
  ] = await Promise.all([
    chrome.storage.local.get(['integratedUpdates']),
    chrome.storage.local.get(['deprecatedUpdates']),
    chrome.storage.local.get(['feedbackGiven'])
  ]);

  // Check feedback due
  let feedbackDue = [];
  try {
    const fdRes = await chrome.runtime.sendMessage({ type: 'checkFeedbackDue' });
    feedbackDue = fdRes.due || [];
  } catch (e) {}
  const feedbackDueIds = new Set(feedbackDue.map(u => u.id));

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
      const isDeprecated = deprecatedUpdates.includes(update.id);
      const card = document.createElement('div');
      card.className = 'update-card integrated' + (isDeprecated ? ' deprecated' : '');

      const level = document.createElement('div');
      level.className = 'update-level';
      level.textContent = update.level_combo;

      if (isDeprecated) {
        const badge = document.createElement('span');
        badge.className = 'deprecated-badge';
        badge.textContent = 'REFUTADO';
        level.appendChild(badge);
      }

      const meta = document.createElement('div');
      meta.className = 'update-convergence';
      const refCount = refutationCounts[update.id] || 0;
      const descCount = (update.descriptions && update.descriptions.length > 0)
        ? ' \u00B7 ' + update.descriptions.length + ' perspectivas'
        : '';
      meta.textContent = update.convergence_count + ' convergencias \u00B7 ' + refCount + ' refutaciones' + descCount;

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

      // Feedback prompt (7+ days after integration)
      if (feedbackDueIds.has(update.id) && feedbackGiven[update.id] === undefined) {
        const feedbackRow = document.createElement('div');
        feedbackRow.className = 'feedback-row';
        feedbackRow.innerHTML = '<span class="feedback-prompt">Ha sido util?</span>';

        const yesBtn = document.createElement('button');
        yesBtn.className = 'feedback-btn feedback-yes';
        yesBtn.textContent = 'Si';
        yesBtn.addEventListener('click', async () => {
          yesBtn.disabled = true;
          noBtn.disabled = true;
          await chrome.runtime.sendMessage({ type: 'submitFeedback', updateId: update.id, useful: true });
          showToast('Gracias por el feedback', 'success');
          feedbackRow.innerHTML = '<span class="feedback-given">Feedback enviado</span>';
        });

        const noBtn = document.createElement('button');
        noBtn.className = 'feedback-btn feedback-no';
        noBtn.textContent = 'No';
        noBtn.addEventListener('click', async () => {
          yesBtn.disabled = true;
          noBtn.disabled = true;
          await chrome.runtime.sendMessage({ type: 'submitFeedback', updateId: update.id, useful: false });
          showToast('Gracias por el feedback', 'info');
          feedbackRow.innerHTML = '<span class="feedback-given">Feedback enviado</span>';
        });

        feedbackRow.appendChild(yesBtn);
        feedbackRow.appendChild(noBtn);
        card.appendChild(feedbackRow);
      } else if (feedbackGiven[update.id] !== undefined) {
        const given = document.createElement('div');
        given.className = 'feedback-given';
        given.textContent = feedbackGiven[update.id] ? 'Feedback: util' : 'Feedback: no util';
        card.appendChild(given);
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
          showToast('Ya refutado', 'info');
          refuteBtn.textContent = 'Ya refutado';
          refuteBtn.className = 'refute-btn refuted';
        } else if (res.success) {
          showToast('Refutacion enviada', 'success');
          refuteBtn.textContent = 'Refutado';
          refuteBtn.className = 'refute-btn refuted';
        } else {
          showToast('Error al refutar', 'error');
          refuteBtn.disabled = false;
        }
      });
      card.appendChild(refuteBtn);
      collectiveContent.appendChild(card);
    });
  }

  // Fronteras section (gap suggestions)
  try {
    const gapsRes = await chrome.runtime.sendMessage({ type: 'getSuggestedGaps' });
    const gaps = gapsRes.gaps || [];
    if (gaps.length > 0) {
      const gapHeader = document.createElement('div');
      gapHeader.className = 'section-header';
      gapHeader.textContent = 'Fronteras (' + gaps.length + ')';
      collectiveContent.appendChild(gapHeader);

      const gapInfo = document.createElement('p');
      gapInfo.className = 'collective-info';
      gapInfo.textContent = 'Pares de niveles que has explorado por separado pero nadie ha conectado aun.';
      collectiveContent.appendChild(gapInfo);

      gaps.forEach(g => {
        const card = document.createElement('div');
        card.className = 'gap-suggestion';
        card.innerHTML = `
          <div class="gap-levels">${escapeHtml(g.level_a)} + ${escapeHtml(g.level_b)}</div>
          <div class="gap-prompt">Has explorado ${escapeHtml(g.level_a)} y ${escapeHtml(g.level_b)} por separado. Que relacion hay entre ellos?</div>
        `;
        collectiveContent.appendChild(card);
      });
    }
  } catch (e) {}

  switchPanel('collective');
}

// === MARKDOWN RENDERING ===

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

// === SEND MESSAGE ===

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

  // Mark onboarding done on first message
  chrome.storage.local.get(['onboardingDone'], ({ onboardingDone }) => {
    if (!onboardingDone) chrome.storage.local.set({ onboardingDone: true });
  });

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

// === ANALYZE PAGE ===

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

// === UTILITIES ===

function autoResize() {
  userInput.style.height = 'auto';
  userInput.style.height = Math.min(userInput.scrollHeight, 120) + 'px';
}

// === EVENT LISTENERS ===

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
  updateWelcomeState();
});

settingsBtn.addEventListener('click', () => {
  chrome.runtime.openOptionsPage();
});

openSettingsBtn.addEventListener('click', () => {
  chrome.runtime.openOptionsPage();
});

insightsBtn.addEventListener('click', () => {
  if (currentPanel === 'insights') {
    switchPanel('chat');
  } else {
    showInsightsPanel();
  }
});

closeInsightsBtn.addEventListener('click', () => switchPanel('chat'));

const exportInsightsBtn = document.getElementById('exportInsightsBtn');
exportInsightsBtn.addEventListener('click', async () => {
  exportInsightsBtn.disabled = true;
  exportInsightsBtn.textContent = 'Exportando...';
  const response = await chrome.runtime.sendMessage({ type: 'exportInsights' });
  if (response && response.success) {
    showToast('Exportado', 'success');
  } else {
    showToast('Error al exportar', 'error');
  }
  exportInsightsBtn.textContent = 'Exportar';
  exportInsightsBtn.disabled = false;
});

chrome.storage.onChanged.addListener((changes) => {
  if (changes.apiKey || changes.providers) {
    chrome.storage.local.get(['apiKey', 'providers'], ({ apiKey, providers = {} }) => {
      const hasKey = apiKey || Object.values(providers).some(p => p && p.key);
      if (hasKey) {
        showChatState();
        updateWelcomeState();
      }
    });
  }
});

analyzePageBtn.addEventListener('click', analyzePage);

collectiveBtn.addEventListener('click', () => {
  if (currentPanel === 'collective') {
    switchPanel('chat');
  } else {
    showCollectivePanel();
  }
});

closeCollectiveBtn.addEventListener('click', () => switchPanel('chat'));

// Suggestion chips
document.querySelectorAll('.suggestion-chip').forEach(chip => {
  chip.addEventListener('click', () => {
    userInput.value = chip.textContent;
    userInput.focus();
    autoResize();
  });
});

init();
