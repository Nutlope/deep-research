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

/**
 * Save research report to a file
 *
 * @param report The research report in markdown format
 * @param filename The filename to save to
 * @returns Promise that resolves when the file is saved
 */
export async function saveResearchReport(
  report: string,
  filename: string
): Promise<void> {
  // Convert markdown to HTML
  const reportHtml = markdownToHtml(report);

  // Create a complete HTML document
  const htmlDocument = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Research Report</title>
  <style>
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, 'Open Sans', 'Helvetica Neue', sans-serif;
      line-height: 1.6;
      max-width: 800px;
      margin: 0 auto;
      padding: 20px;
    }
    h1, h2, h3, h4, h5, h6 {
      margin-top: 24px;
      margin-bottom: 16px;
      font-weight: 600;
      line-height: 1.25;
    }
    p {
      margin-bottom: 16px;
    }
    a {
      color: #0366d6;
      text-decoration: none;
    }
    a:hover {
      text-decoration: underline;
    }
    ul, ol {
      padding-left: 2em;
      margin-bottom: 16px;
    }
    code {
      padding: 0.2em 0.4em;
      margin: 0;
      font-size: 85%;
      background-color: rgba(27, 31, 35, 0.05);
      border-radius: 3px;
      font-family: 'SFMono-Regular', Consolas, 'Liberation Mono', Menlo, monospace;
    }
    pre {
      padding: 16px;
      overflow: auto;
      font-size: 85%;
      line-height: 1.45;
      background-color: #f6f8fa;
      border-radius: 3px;
    }
    blockquote {
      padding: 0 1em;
      color: #6a737d;
      border-left: 0.25em solid #dfe2e5;
      margin: 0 0 16px 0;
    }
  </style>
</head>
<body>
  ${reportHtml}
</body>
</html>
  `;

  // In a browser environment, we can use the File System Access API
  if (typeof window !== "undefined" && "showSaveFilePicker" in window) {
    try {
      const handle = await (window as any).showSaveFilePicker({
        suggestedName: filename,
        types: [
          {
            description: "HTML Document",
            accept: { "text/html": [".html"] },
          },
        ],
      });

      const writable = await handle.createWritable();
      await writable.write(htmlDocument);
      await writable.close();

      console.log(`\x1b[32m💾 Research report saved as ${filename}\x1b[0m`);
    } catch (error) {
      console.error("\x1b[41m❌ Error saving file:\x1b[0m", error);
      throw error;
    }
  } else {
    // In a Node.js environment, we can use the fs module
    // This would require importing the fs module at the top of the file
    // and using fs.writeFileSync or fs.promises.writeFile
    console.warn("File saving is not supported in this environment");
    throw new Error("File saving is not supported in this environment");
  }
}
