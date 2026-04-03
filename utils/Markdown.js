import fs from 'fs';
import path from 'path';
import { marked } from 'marked';

export class Markdown {
  constructor() {}

  static convertToHtml(filePath) {
    const absPath = path.resolve(filePath);

    if (!fs.existsSync(absPath)) {
      throw new Error(`convertToHtml: File not found: ${absPath}`);
    }

    try {
      console.log(`📂 Reading Markdown file: ${absPath}`);
      const markdown = fs.readFileSync(absPath, 'utf8');

      console.log(`🔄 Converting to HTML...`);
      const htmlContent = marked.parse(markdown);

      const parsed = path.parse(absPath);
      const newPath = path.join(parsed.dir, `${parsed.name}.html`);
      
      const finalHtml = `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<title>${parsed.name}</title>
<style>
body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif; line-height: 1.6; max-width: 800px; margin: 0 auto; padding: 2rem; color: #333; }
code { background: #f4f4f4; padding: 2px 4px; border-radius: 4px; }
pre { background: #f4f4f4; padding: 1rem; overflow-x: auto; border-radius: 4px; }
blockquote { border-left: 4px solid #ccc; margin: 0; padding-left: 1rem; color: #666; }
table { border-collapse: collapse; width: 100%; margin-bottom: 1rem; }
th, td { border: 1px solid #ddd; padding: 8px; text-align: left; }
th { background-color: #f2f2f2; }
</style>
</head>
<body>
${htmlContent}
</body>
</html>`;

      fs.writeFileSync(newPath, finalHtml, 'utf8');

      console.log(`\n💾 HTML saved: ${newPath}`);
      return newPath;
    } catch (error) {
      throw new Error(`convertToHtml: Failed to convert Markdown to HTML: ${error.message}`);
    }
  }
}
