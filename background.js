importScripts('system-prompt.js');
importScripts('lib/supabase.js');
importScripts('lib/collective.js');

chrome.action.onClicked.addListener((tab) => {
  chrome.sidePanel.open({ tabId: tab.id });
});

chrome.runtime.onInstalled.addListener(() => {
  chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });
  chrome.alarms.create('checkCollectiveUpdates', { periodInMinutes: 360 });
});

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === 'checkCollectiveUpdates') {
    checkForUpdates();
  }
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'chat') {
    handleChat(message.messages, message.model).then(sendResponse);
    return true;
  }
  if (message.type === 'getPageContent') {
    getPageContent(message.tabId).then(sendResponse);
    return true;
  }
  if (message.type === 'validateKey') {
    validateApiKey(message.apiKey).then(sendResponse);
    return true;
  }
  if (message.type === 'saveInsight') {
    saveInsight(message.insight).then(sendResponse);
    return true;
  }
  if (message.type === 'getInsights') {
    getInsights().then(sendResponse);
    return true;
  }
  if (message.type === 'deleteInsight') {
    deleteInsight(message.index).then(sendResponse);
    return true;
  }
  if (message.type === 'saveCorrection') {
    saveCorrection(message.correction).then(sendResponse);
    return true;
  }
  if (message.type === 'getCorrections') {
    getCorrections().then(sendResponse);
    return true;
  }
  if (message.type === 'deleteCorrection') {
    deleteCorrection(message.index).then(sendResponse);
    return true;
  }
  if (message.type === 'exportInsights') {
    exportInsightsToFile().then(sendResponse);
    return true;
  }
  if (message.type === 'shareRelation') {
    shareRelation(message.insight).then(sendResponse);
    return true;
  }
  if (message.type === 'checkUpdates') {
    checkForUpdates().then(sendResponse);
    return true;
  }
  if (message.type === 'getPendingUpdates') {
    getPendingUpdates().then(sendResponse);
    return true;
  }
  if (message.type === 'acknowledgeUpdate') {
    acknowledgeUpdate(message.updateId, message.version).then(sendResponse);
    return true;
  }
  if (message.type === 'getCollectiveStatus') {
    isCollectiveEnabled().then(enabled => sendResponse({ enabled }));
    return true;
  }
  if (message.type === 'setCollectiveStatus') {
    chrome.storage.local.set({ collectiveEnabled: message.enabled }).then(() => {
      sendResponse({ success: true });
    });
    return true;
  }
});

async function getApiKey() {
  const result = await chrome.storage.local.get(['apiKey']);
  return result.apiKey || null;
}

async function getModel() {
  const result = await chrome.storage.local.get(['model']);
  return result.model || 'claude-opus-4-20250514';
}

async function handleChat(messages, modelOverride) {
  const apiKey = await getApiKey();
  if (!apiKey) {
    return { error: 'NO_API_KEY' };
  }

  const model = modelOverride || await getModel();

  // Build system prompt with corrections
  let systemPrompt = SYSTEM_PROMPT;
  const { corrections = [] } = await chrome.storage.local.get(['corrections']);
  if (corrections.length > 0) {
    const correctionLines = corrections.map((c, i) => `${i + 1}. ${c.text}`).join('\n');
    systemPrompt += `\n\n---\n\n## CORRECCIONES DEL OPERADOR\n\nEl operador (S1) ha registrado las siguientes correcciones a partir de errores previos. Integralas en tu razonamiento — son territorio verificado:\n\n${correctionLines}`;
  }

  // Inject collective knowledge
  const { integratedUpdates = [] } = await chrome.storage.local.get(['integratedUpdates']);
  if (integratedUpdates.length > 0) {
    const updateLines = integratedUpdates.map((u, i) =>
      `${i + 1}. [${u.level_combo}] ${u.description} (convergencia: ${u.convergence_count} usuarios)`
    ).join('\n');
    systemPrompt += `\n\n---\n\n## CONOCIMIENTO COLECTIVO VERIFICADO\n\nLas siguientes relaciones han sido descubiertas independientemente por multiples usuarios y verificadas por S1:\n\n${updateLines}`;
  }

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'anthropic-dangerous-direct-browser-access': 'true'
      },
      body: JSON.stringify({
        model: model,
        max_tokens: 4096,
        system: systemPrompt,
        messages: messages
      })
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      if (response.status === 401) {
        return { error: 'INVALID_API_KEY' };
      }
      return { error: 'API_ERROR', details: errorData.error?.message || response.statusText };
    }

    const data = await response.json();
    return {
      content: data.content[0].text,
      usage: data.usage
    };
  } catch (err) {
    return { error: 'NETWORK_ERROR', details: err.message };
  }
}

async function getPageContent(tabId) {
  try {
    const results = await chrome.scripting.executeScript({
      target: { tabId: tabId },
      func: () => {
        const title = document.title || '';
        const url = window.location.href;
        const meta = document.querySelector('meta[name="description"]');
        const description = meta ? meta.content : '';

        let mainContent = '';
        const selectors = ['article', 'main', '[role="main"]', '.post-content', '.article-body', '.entry-content'];
        for (const sel of selectors) {
          const el = document.querySelector(sel);
          if (el && el.innerText.trim().length > 200) {
            mainContent = el.innerText.trim();
            break;
          }
        }

        if (!mainContent) {
          const clone = document.body.cloneNode(true);
          ['nav', 'footer', 'header', 'aside', '.sidebar', '.nav', '.menu', '.ad', '.ads', '.cookie', '[role="navigation"]', '[role="banner"]'].forEach(sel => {
            clone.querySelectorAll(sel).forEach(el => el.remove());
          });
          mainContent = clone.innerText.trim();
        }

        const headings = [];
        document.querySelectorAll('h1, h2, h3').forEach(h => {
          const text = h.innerText.trim();
          if (text) headings.push(h.tagName + ': ' + text);
        });

        let output = 'TITULO: ' + title + '\nURL: ' + url + '\n';
        if (description) output += 'DESCRIPCION: ' + description + '\n';
        if (headings.length > 0) output += '\nESTRUCTURA:\n' + headings.slice(0, 15).join('\n') + '\n';
        output += '\nCONTENIDO:\n' + mainContent;
        return output.substring(0, 8000);
      }
    });
    return { content: results[0]?.result || '' };
  } catch (err) {
    return { error: err.message };
  }
}

async function saveInsight(insight) {
  const { insights = [] } = await chrome.storage.local.get(['insights']);
  insight.date = new Date().toISOString();
  insight.status = 'pending';
  insights.push(insight);
  await chrome.storage.local.set({ insights });
  syncInsightsToFile();
  return { success: true, count: insights.length };
}

async function getInsights() {
  const { insights = [] } = await chrome.storage.local.get(['insights']);
  return { insights };
}

async function deleteInsight(index) {
  const { insights = [] } = await chrome.storage.local.get(['insights']);
  if (index >= 0 && index < insights.length) {
    insights.splice(index, 1);
    await chrome.storage.local.set({ insights });
    syncInsightsToFile();
  }
  return { success: true, insights };
}

async function saveCorrection(correction) {
  const { corrections = [] } = await chrome.storage.local.get(['corrections']);
  correction.date = new Date().toISOString();
  corrections.push(correction);
  await chrome.storage.local.set({ corrections });
  syncInsightsToFile();
  return { success: true, count: corrections.length };
}

async function getCorrections() {
  const { corrections = [] } = await chrome.storage.local.get(['corrections']);
  return { corrections };
}

async function deleteCorrection(index) {
  const { corrections = [] } = await chrome.storage.local.get(['corrections']);
  if (index >= 0 && index < corrections.length) {
    corrections.splice(index, 1);
    await chrome.storage.local.set({ corrections });
    syncInsightsToFile();
  }
  return { success: true, corrections };
}

// Auto-bridge: sync insights+corrections to disk as JSON
async function syncInsightsToFile() {
  const { insights = [] } = await chrome.storage.local.get(['insights']);
  const { corrections = [] } = await chrome.storage.local.get(['corrections']);
  const data = JSON.stringify({ insights, corrections, lastSync: new Date().toISOString() }, null, 2);
  const blob = new Blob([data], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  try {
    await chrome.downloads.download({
      url: url,
      filename: 'logic-insights.json',
      conflictAction: 'overwrite',
      saveAs: false
    });
  } catch (err) {
    console.error('Sync to file failed:', err);
  }
}

// Manual export: download insights as JSON with saveAs dialog
async function exportInsightsToFile() {
  const { insights = [] } = await chrome.storage.local.get(['insights']);
  const { corrections = [] } = await chrome.storage.local.get(['corrections']);
  const data = JSON.stringify({ insights, corrections, exportDate: new Date().toISOString() }, null, 2);
  const blob = new Blob([data], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  try {
    await chrome.downloads.download({
      url: url,
      filename: 'logic-insights-export.json',
      conflictAction: 'uniquify',
      saveAs: true
    });
    return { success: true };
  } catch (err) {
    return { error: err.message };
  }
}

async function validateApiKey(apiKey) {
  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'anthropic-dangerous-direct-browser-access': 'true'
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 10,
        messages: [{ role: 'user', content: 'Hi' }]
      })
    });

    if (response.ok) {
      return { valid: true };
    }
    if (response.status === 401) {
      return { valid: false, error: 'API key invalida' };
    }
    return { valid: false, error: `Error: ${response.statusText}` };
  } catch (err) {
    return { valid: false, error: err.message };
  }
}
