// js/utils/parser.js - Advanced Post Content & Metadata Parser

export function parsePostMetadata(content) {
  if (!content || typeof content !== 'string') {
    return { hashtags: [], mentions: [], cleanedContent: '' };
  }

  // 1. Extract unique hashtags (supports letters, numbers, underscores, and unicode for localization)
  const rawHashtags = content.match(/#[a-zA-Z0-9_\u00C0-\u024F]+/g) || [];
  const hashtags = [...new Set(rawHashtags.map(tag => tag.toLowerCase()))];

  // 2. Extract unique mentions (e.g., @CitizenObserver)
  const rawMentions = content.match(/@[a-zA-Z0-9_]+/g) || [];
  const mentions = [...new Set(rawMentions.map(mention => mention.slice(1)))]; // Strip the '@' prefix

  // 3. Optional: Basic link or entity cleanup if needed
  const cleanedContent = content.trim();

  return {
    hashtags,
    mentions,
    cleanedContent
  };
}

/**
 * Formats content strings into HTML with clickable hashtag and mention links
 */
export function renderRichTextContent(content) {
  if (!content) return '';
  
  // Escape HTML to prevent XSS
  const safeContent = content
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');

  // Highlight hashtags
  let formatted = safeContent.replace(
    /(#[a-zA-Z0-9_\u00C0-\u024F]+)/g,
    '<span class="text-amber-400 font-medium hover:underline cursor-pointer hashtag-link" data-tag="$1">$1</span>'
  );

  // Highlight mentions
  formatted = formatted.replace(
    /(@[a-zA-Z0-9_]+)/g,
    '<span class="text-sky-400 font-medium hover:underline cursor-pointer mention-link" data-user="$1">$1</span>'
  );

  return formatted;
}
