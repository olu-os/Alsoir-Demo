export function decodeHtmlEntities(input: unknown): string {
  const text = typeof input === 'string' ? input : '';
  if (!text) return '';

  // Minimal HTML entity decoding for common cases seen in email snippets.
  // This is intentionally conservative and does not render HTML.
  return text
    .replaceAll('&amp;', '&')
    .replaceAll('&lt;', '<')
    .replaceAll('&gt;', '>')
    .replaceAll('&quot;', '"')
    .replaceAll('&#39;', "'")
    .replaceAll('&#x27;', "'");
}
