chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'extractContent') {
    try {
      const data = extractPageData();
      sendResponse({ content: data });
    } catch (e) {
      sendResponse({ content: document.body.innerText.substring(0, 6000) });
    }
  }
  return true;
});

function extractPageData() {
  const title = document.title || '';
  const url = window.location.href;
  const meta = document.querySelector('meta[name="description"]');
  const description = meta ? meta.content : '';

  // Get main content - prioritize article/main elements
  let mainContent = '';
  const selectors = ['article', 'main', '[role="main"]', '.post-content', '.article-body', '.entry-content'];

  for (const sel of selectors) {
    const el = document.querySelector(sel);
    if (el && el.innerText.trim().length > 200) {
      mainContent = el.innerText.trim();
      break;
    }
  }

  // Fallback to body but clean it up
  if (!mainContent) {
    // Remove nav, footer, sidebar, ads
    const clone = document.body.cloneNode(true);
    const remove = ['nav', 'footer', 'header', 'aside', '.sidebar', '.nav', '.menu', '.ad', '.ads', '.cookie', '[role="navigation"]', '[role="banner"]', '[role="complementary"]'];
    remove.forEach(sel => {
      clone.querySelectorAll(sel).forEach(el => el.remove());
    });
    mainContent = clone.innerText.trim();
  }

  // Get headings for structure
  const headings = [];
  document.querySelectorAll('h1, h2, h3').forEach(h => {
    const text = h.innerText.trim();
    if (text) headings.push(`${h.tagName}: ${text}`);
  });

  // Build structured output
  let output = `TITULO: ${title}\nURL: ${url}\n`;
  if (description) output += `DESCRIPCION: ${description}\n`;
  if (headings.length > 0) output += `\nESTRUCTURA:\n${headings.slice(0, 15).join('\n')}\n`;
  output += `\nCONTENIDO:\n${mainContent}`;

  // Truncate to reasonable size
  return output.substring(0, 8000);
}
