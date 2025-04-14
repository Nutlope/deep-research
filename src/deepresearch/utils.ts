/**
 * Utility functions for the Deep Research Cookbook
 */

/**
 * Convert markdown to HTML
 *
 * @param markdown The markdown content to convert
 * @returns HTML content
 */
export function markdownToHtml(markdown: string): string {
  // This is a simple implementation that handles basic markdown
  // For a more comprehensive solution, consider using a library like marked or markdown-it

  let html = markdown;

  // Headers
  html = html.replace(/^# (.*$)/gm, "<h1>$1</h1>");
  html = html.replace(/^## (.*$)/gm, "<h2>$1</h2>");
  html = html.replace(/^### (.*$)/gm, "<h3>$1</h3>");
  html = html.replace(/^#### (.*$)/gm, "<h4>$1</h4>");
  html = html.replace(/^##### (.*$)/gm, "<h5>$1</h5>");
  html = html.replace(/^###### (.*$)/gm, "<h6>$1</h6>");

  // Bold
  html = html.replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>");
  html = html.replace(/__(.*?)__/g, "<strong>$1</strong>");

  // Italic
  html = html.replace(/\*(.*?)\*/g, "<em>$1</em>");
  html = html.replace(/_(.*?)_/g, "<em>$1</em>");

  // Links
  html = html.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>');

  // Lists
  html = html.replace(/^\s*\*\s(.*$)/gm, "<li>$1</li>");
  html = html.replace(/^\s*-\s(.*$)/gm, "<li>$1</li>");
  html = html.replace(/^\s*\d+\.\s(.*$)/gm, "<li>$1</li>");

  // Wrap lists in ul/ol tags
  html = html.replace(/(<li>.*<\/li>)\n/g, "<ul>$1</ul>\n");

  // Paragraphs
  html = html.replace(/^\s*(\n)?(.+)/gm, function (m) {
    return /\<(\/)?(h1|h2|h3|h4|h5|h6|ul|ol|li|blockquote|pre|img)/.test(m)
      ? m
      : "<p>" + m + "</p>";
  });

  // Line breaks
  html = html.replace(/\n/g, "<br>");

  return html;
}
