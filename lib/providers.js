// providers.js — Multi-provider abstraction layer
// Supports Anthropic Claude and OpenAI GPT models

class BaseProvider {
  constructor(config) { this.config = config; }
  async chat(messages, systemPrompt, model) { throw new Error('not implemented'); }
  async validateKey(apiKey) { throw new Error('not implemented'); }
  getModels() { return []; }
  getName() { return 'base'; }
}

class AnthropicProvider extends BaseProvider {
  getName() { return 'anthropic'; }

  getModels() {
    return [
      { id: 'claude-opus-4-20250514', name: 'Claude Opus (recomendado)' },
      { id: 'claude-sonnet-4-20250514', name: 'Claude Sonnet (rapido, economico)' }
    ];
  }

  async chat(messages, systemPrompt, model) {
    const apiKey = this.config.key;
    if (!apiKey) return { error: 'NO_API_KEY' };

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
        if (response.status === 401) return { error: 'INVALID_API_KEY' };
        return { error: 'API_ERROR', details: errorData.error?.message || response.statusText };
      }

      const data = await response.json();
      return { content: data.content[0].text, usage: data.usage };
    } catch (err) {
      return { error: 'NETWORK_ERROR', details: err.message };
    }
  }

  async validateKey(apiKey) {
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
      if (response.ok) return { valid: true };
      if (response.status === 401) return { valid: false, error: 'API key invalida' };
      return { valid: false, error: `Error: ${response.statusText}` };
    } catch (err) {
      return { valid: false, error: err.message };
    }
  }
}

class OpenAIProvider extends BaseProvider {
  getName() { return 'openai'; }

  getModels() {
    return [
      { id: 'gpt-4o', name: 'GPT-4o' },
      { id: 'gpt-4o-mini', name: 'GPT-4o Mini (economico)' }
    ];
  }

  async chat(messages, systemPrompt, model) {
    const apiKey = this.config.key;
    if (!apiKey) return { error: 'NO_API_KEY' };

    // OpenAI uses system message as first message in array
    const oaiMessages = [
      { role: 'system', content: systemPrompt },
      ...messages
    ];

    try {
      const response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`
        },
        body: JSON.stringify({
          model: model,
          max_tokens: 4096,
          messages: oaiMessages
        })
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        if (response.status === 401) return { error: 'INVALID_API_KEY' };
        return { error: 'API_ERROR', details: errorData.error?.message || response.statusText };
      }

      const data = await response.json();
      return {
        content: data.choices[0].message.content,
        usage: data.usage
      };
    } catch (err) {
      return { error: 'NETWORK_ERROR', details: err.message };
    }
  }

  async validateKey(apiKey) {
    try {
      const response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`
        },
        body: JSON.stringify({
          model: 'gpt-4o-mini',
          max_tokens: 10,
          messages: [{ role: 'user', content: 'Hi' }]
        })
      });
      if (response.ok) return { valid: true };
      if (response.status === 401) return { valid: false, error: 'API key invalida' };
      return { valid: false, error: `Error: ${response.statusText}` };
    } catch (err) {
      return { valid: false, error: err.message };
    }
  }
}

const PROVIDERS = {
  anthropic: AnthropicProvider,
  openai: OpenAIProvider
};

function createProvider(name, config) {
  const ProviderClass = PROVIDERS[name];
  if (!ProviderClass) throw new Error('Unknown provider: ' + name);
  return new ProviderClass(config);
}

async function getActiveProvider() {
  const { activeProvider = 'anthropic', providers = {} } =
    await chrome.storage.local.get(['activeProvider', 'providers']);
  const providerConfig = providers[activeProvider] || {};
  return { provider: createProvider(activeProvider, providerConfig), providerConfig, activeProvider };
}
