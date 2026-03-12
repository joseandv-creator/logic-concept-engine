// supabase.js — Lightweight REST client for Supabase (Manifest V3 compatible)
// No SDK. Direct fetch to PostgREST API.

class SupabaseClient {
  constructor(url, anonKey) {
    this.url = url;
    this.anonKey = anonKey;
    this.restUrl = `${url}/rest/v1`;
  }

  async _fetch(path, options = {}) {
    const headers = {
      'Content-Type': 'application/json',
      'apikey': this.anonKey,
      'Authorization': `Bearer ${this.anonKey}`,
      ...options.headers
    };

    const response = await fetch(`${this.restUrl}${path}`, {
      ...options,
      headers
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      throw new Error(error.message || response.statusText);
    }

    const text = await response.text();
    return text ? JSON.parse(text) : null;
  }

  async shareRelation(relation) {
    return this._fetch('/shared_relations', {
      method: 'POST',
      headers: { 'Prefer': 'return=minimal' },
      body: JSON.stringify(relation)
    });
  }

  async getUpdates(sinceVersion = 0) {
    return this._fetch(
      `/system_updates?version=gt.${sinceVersion}&order=version.asc`
    );
  }

  async submitRefutation(refutation) {
    return this._fetch('/refutations', {
      method: 'POST',
      headers: { 'Prefer': 'return=minimal' },
      body: JSON.stringify(refutation)
    });
  }

  async getRefutationCounts() {
    return this._fetch('/rpc/get_refutation_counts', {
      method: 'POST',
      body: JSON.stringify({})
    });
  }

  async getGraphSummary() {
    return this._fetch('/rpc/get_graph_summary', {
      method: 'POST',
      body: JSON.stringify({})
    });
  }
}

const SUPABASE_DEFAULTS = {
  url: 'https://mvropqfconacrexevcsn.supabase.co',
  key: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im12cm9wcWZjb25hY3JleGV2Y3NuIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzMyODQzNjQsImV4cCI6MjA4ODg2MDM2NH0.nNsTsNDgK2GNs1LTtL7KcixHXoFNmmb2fApzyBf5Tv4'
};

async function getSupabaseClient() {
  const { supabaseUrl, supabaseKey } = await chrome.storage.local.get([
    'supabaseUrl', 'supabaseKey'
  ]);
  const url = supabaseUrl || SUPABASE_DEFAULTS.url;
  const key = supabaseKey || SUPABASE_DEFAULTS.key;
  return new SupabaseClient(url, key);
}
