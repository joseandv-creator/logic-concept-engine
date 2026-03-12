const apiKeyInput = document.getElementById('apiKeyInput');
const modelSelect = document.getElementById('modelSelect');
const saveBtn = document.getElementById('saveBtn');
const toggleVisibility = document.getElementById('toggleVisibility');
const keyStatus = document.getElementById('keyStatus');
const collectiveToggle = document.getElementById('collectiveToggle');

// Load saved settings
async function loadSettings() {
  const { apiKey, model, collectiveEnabled } = await chrome.storage.local.get(['apiKey', 'model', 'collectiveEnabled']);
  if (apiKey) {
    apiKeyInput.value = apiKey;
  }
  if (model) {
    modelSelect.value = model;
  }
  collectiveToggle.checked = !!collectiveEnabled;
}

// Toggle password visibility
toggleVisibility.addEventListener('click', () => {
  const isPassword = apiKeyInput.type === 'password';
  apiKeyInput.type = isPassword ? 'text' : 'password';
});

// Save
saveBtn.addEventListener('click', async () => {
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
    apiKey: apiKey
  });

  if (result.valid) {
    const collectiveEnabled = collectiveToggle.checked;
    const supabaseUrl = 'https://mvropqfconacrexevcsn.supabase.co';
    const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im12cm9wcWZjb25hY3JleGV2Y3NuIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzMyODQzNjQsImV4cCI6MjA4ODg2MDM2NH0.nNsTsNDgK2GNs1LTtL7KcixHXoFNmmb2fApzyBf5Tv4';
    await chrome.storage.local.set({ apiKey, model, collectiveEnabled, supabaseUrl, supabaseKey });
    showStatus('Guardado correctamente', 'success');
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
