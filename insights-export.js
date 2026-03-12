async function loadData() {
  const [insightsRes, correctionsRes] = await Promise.all([
    chrome.runtime.sendMessage({ type: 'getInsights' }),
    chrome.runtime.sendMessage({ type: 'getCorrections' })
  ]);

  const data = {
    insights: insightsRes.insights || [],
    corrections: correctionsRes.corrections || [],
    readAt: new Date().toISOString()
  };

  document.getElementById('data').textContent = JSON.stringify(data, null, 2);
}

loadData();
