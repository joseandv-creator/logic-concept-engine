const providerSelect = document.getElementById('providerSelect');
const apiKeyInput = document.getElementById('apiKeyInput');
const apiKeyLabel = document.getElementById('apiKeyLabel');
const modelSelect = document.getElementById('modelSelect');
const saveBtn = document.getElementById('saveBtn');
const toggleVisibility = document.getElementById('toggleVisibility');
const keyStatus = document.getElementById('keyStatus');
const collectiveToggle = document.getElementById('collectiveToggle');
const consoleLink = document.getElementById('consoleLink');

const PROVIDER_MODELS = {
  anthropic: [
    { id: 'claude-opus-4-20250514', name: 'Claude Opus (recomendado)' },
    { id: 'claude-sonnet-4-20250514', name: 'Claude Sonnet (rapido, economico)' }
  ],
  openai: [
    { id: 'gpt-4o', name: 'GPT-4o' },
    { id: 'gpt-4o-mini', name: 'GPT-4o Mini (economico)' }
  ]
};

const PROVIDER_UI = {
  anthropic: {
    label: 'API Key de Anthropic',
    placeholder: 'sk-ant-...',
    console: 'Obtén tu API key en <a href="https://console.anthropic.com/settings/keys" target="_blank">console.anthropic.com</a>',
    icon: 'A',
    iconClass: 'anthropic',
    name: 'Anthropic (Claude)'
  },
  openai: {
    label: 'API Key de OpenAI',
    placeholder: 'sk-...',
    console: 'Obtén tu API key en <a href="https://platform.openai.com/api-keys" target="_blank">platform.openai.com</a>',
    icon: 'O',
    iconClass: 'openai',
    name: 'OpenAI (GPT)'
  }
};

const providerCard = document.getElementById('providerCard');
const providerIcon = document.getElementById('providerIcon');
const providerName = document.getElementById('providerName');
const providerStatus = document.getElementById('providerStatus');

let currentProviderKeys = {};

function populateModels(providerName, selectedModel) {
  modelSelect.innerHTML = '';
  const models = PROVIDER_MODELS[providerName] || [];
  models.forEach(m => {
    const opt = document.createElement('option');
    opt.value = m.id;
    opt.textContent = m.name;
    modelSelect.appendChild(opt);
  });
  if (selectedModel) modelSelect.value = selectedModel;
}

function updateProviderUI(name) {
  const ui = PROVIDER_UI[name] || PROVIDER_UI.anthropic;
  apiKeyLabel.textContent = ui.label;
  apiKeyInput.placeholder = ui.placeholder;
  consoleLink.innerHTML = ui.console;
  updateProviderCard(name);
}

function updateProviderCard(name) {
  const ui = PROVIDER_UI[name] || PROVIDER_UI.anthropic;
  providerIcon.textContent = ui.icon;
  providerIcon.className = 'provider-icon ' + ui.iconClass;
  providerName.textContent = ui.name;
  updateConnectionStatus(name);
}

function updateConnectionStatus(name) {
  const key = currentProviderKeys[name] || apiKeyInput.value.trim();
  const dot = providerStatus.querySelector('.status-dot');
  if (key) {
    providerCard.classList.add('connected');
    dot.classList.add('connected');
    providerStatus.innerHTML = '<span class="status-dot connected"></span> Configurado';
  } else {
    providerCard.classList.remove('connected');
    dot.classList.remove('connected');
    providerStatus.innerHTML = '<span class="status-dot"></span> Sin configurar';
  }
}

async function loadSettings() {
  const stored = await chrome.storage.local.get([
    'activeProvider', 'providers', 'collectiveEnabled',
    'apiKey', 'model' // legacy fields for migration
  ]);

  let activeProvider = stored.activeProvider || 'anthropic';
  let providers = stored.providers || {};

  // Migration: old single-key format → new multi-provider format
  if (stored.apiKey && !stored.providers) {
    providers = {
      anthropic: { key: stored.apiKey, model: stored.model || 'claude-opus-4-20250514' }
    };
    await chrome.storage.local.set({ activeProvider: 'anthropic', providers });
  }

  currentProviderKeys = {};
  for (const [name, config] of Object.entries(providers)) {
    currentProviderKeys[name] = config.key || '';
  }

  providerSelect.value = activeProvider;
  updateProviderUI(activeProvider);

  const config = providers[activeProvider] || {};
  apiKeyInput.value = config.key || '';
  populateModels(activeProvider, config.model);
  collectiveToggle.checked = !!stored.collectiveEnabled;
}

// Provider change: save current key, load new provider's key
providerSelect.addEventListener('change', () => {
  const prev = Object.keys(PROVIDER_UI).find(k => k !== providerSelect.value) || 'anthropic';
  currentProviderKeys[prev] = apiKeyInput.value.trim();

  const next = providerSelect.value;
  updateProviderUI(next);
  apiKeyInput.value = currentProviderKeys[next] || '';
  populateModels(next);
  keyStatus.textContent = '';
  keyStatus.className = 'status';
  updateConnectionStatus(next);
});

// Toggle password visibility
toggleVisibility.addEventListener('click', () => {
  const isPassword = apiKeyInput.type === 'password';
  apiKeyInput.type = isPassword ? 'text' : 'password';
});

// Save
saveBtn.addEventListener('click', async () => {
  const activeProvider = providerSelect.value;
  const apiKey = apiKeyInput.value.trim();
  const model = modelSelect.value;

  if (!apiKey) {
    showStatus('Ingresa tu API key', 'error');
    return;
  }

  saveBtn.disabled = true;
  showStatus('Validando API key...', 'loading');

  const result = await chrome.runtime.sendMessage({
    type: 'validateKey',
    apiKey: apiKey,
    provider: activeProvider
  });

  if (result.valid) {
    // Save current key in memory
    currentProviderKeys[activeProvider] = apiKey;

    // Build providers object
    const providers = {};
    for (const [name, key] of Object.entries(currentProviderKeys)) {
      if (key) {
        providers[name] = { key };
      }
    }
    // Set model for active provider
    if (providers[activeProvider]) {
      providers[activeProvider].model = model;
    }

    const collectiveEnabled = collectiveToggle.checked;
    const supabaseUrl = 'https://mvropqfconacrexevcsn.supabase.co';
    const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im12cm9wcWZjb25hY3JleGV2Y3NuIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzMyODQzNjQsImV4cCI6MjA4ODg2MDM2NH0.nNsTsNDgK2GNs1LTtL7KcixHXoFNmmb2fApzyBf5Tv4';

    await chrome.storage.local.set({
      activeProvider, providers, collectiveEnabled,
      supabaseUrl, supabaseKey
    });
    showStatus('Guardado correctamente', 'success');
    updateConnectionStatus(activeProvider);
  } else {
    showStatus(result.error || 'API key invalida', 'error');
  }

  saveBtn.disabled = false;
});

function showStatus(text, type) {
  keyStatus.textContent = text;
  keyStatus.className = `status ${type}`;
}

// Save on Enter
apiKeyInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') {
    saveBtn.click();
  }
});

loadSettings();
