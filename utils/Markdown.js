import fs from 'fs';
import path from 'path';
import { marked, Renderer } from 'marked';
import markedFootnote from 'marked-footnote';
import markedKatex from 'marked-katex-extension';
import zlib from 'zlib';

marked.use(markedFootnote());
marked.use(markedKatex({ throwOnError: false, output: 'mathml' }));
import { Yamls } from './Yamls.js';
import { Dialogs } from './Dialogs.js';
import { Files } from './Files.js';
import { Word } from './Word.js';

let winax;
try {
  winax = (await import('winax')).default;
} catch (e) {
  // winax not available
}

export class Markdown {
  constructor() {}

  /**
   * Returns a marked Renderer that maps headings to their exact levels.
   * # (depth 1) → <h1>, ## (depth 2) → <h2>, etc. Clamps depth between 1 and 6.
   */
  static _getRenderer() {
    console.info(`[Markdown._getRenderer] 🟢 Starting...`);
    const renderer = new Renderer();
    renderer.heading = ({ text, depth }) => {
      const level = Math.min(Math.max(depth, 1), 6);
      return `<h${level}>${text}</h${level}>\n`;
    };
    
    // Convert Mermaid code blocks to Kroki SVG images
    renderer.code = ({ text, lang, escaped }) => {
      if (lang === 'mermaid') {
        try {
          const compressed = zlib.deflateSync(Buffer.from(text, 'utf8'));
          const base64url = compressed.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
          const url = `https://kroki.io/mermaid/svg/${base64url}`;
          return `<img src="${url}" alt="Mermaid diagram" />\n`;
        } catch(e) {
          console.error("Mermaid kroki render error:", e);
        }
      }
      return `<pre><code class="language-${lang}">${text}</code></pre>\n`;
    };

    // Convert Horizontal Rule to Word Page Break
    renderer.hr = () => {
      return `<br clear="all" style="page-break-before:always" />\n`;
    };

    return renderer;
  }

  static _postProcessHtml(htmlContent, parsedDir) {
    console.info(`[Markdown._postProcessHtml] 🟢 Starting...`);
    
    // 1. Fix relative image paths so Word can resolve and embed them
    let processed = htmlContent.replace(/<img[^>]+src="([^"]+)"/ig, (match, src) => {
      if (!src.match(/^(https?:\/\/|data:|file:\/\/\/)/i)) {
        const absolutePath = path.resolve(parsedDir, src);
        return match.replace(src, absolutePath);
      }
      return match;
    });

    // 2. Convert <mark> to Word-compatible highlights
    processed = processed.replace(/<mark>([\s\S]*?)<\/mark>/gi, '<span style="background:yellow">$1</span>');

    // 3. Convert marked-footnote output to Word native footnotes
    processed = processed.replace(/<sup><a id="fnref:(\d+)" href="#fn:\1"[^>]*>(\d+)<\/a><\/sup>/g, 
      `<a style='mso-footnote-id:ftn$1' href="#_ftn$1" name="_ftnref$1" title=""><span class=MsoFootnoteReference><span style='mso-special-character:footnote'><!--[if !supportFootnotes]-->[$2]<!--[endif]--></span></span></a>`
    );

    // 4. Convert marked-footnote definition list to Word footnote format
    processed = processed.replace(/<section class="footnotes"[^>]*>\s*<ol>([\s\S]*?)<\/ol>\s*<\/section>/gi, (match, listContent) => {
      let footnotes = listContent.replace(/<li id="fn:(\d+)">([\s\S]*?)<a href="#fnref:\1"[^>]*>.*?<\/a>([\s\S]*?)<\/li>/gi, 
        `<div style='mso-element:footnote' id=ftn$1><p class=MsoFootnoteText><a style='mso-footnote-id:ftn$1' href="#_ftnref$1" name="_ftn$1" title="">[$1]</a> $2$3</p></div>`
      );
      return `<div style='mso-element:footnote-list'>${footnotes}</div>`;
    });

    return processed;
  }

  /**
   * Wraps converted HTML in a minimal document with table-border styles.
   * Word's InsertFile respects basic CSS, so this ensures tables rendered
   * from Markdown always arrive with visible cell borders.
   */
  static _buildTempHtml(htmlContent) {
    console.info(`[Markdown._buildTempHtml] 🟢 Starting...`);
    return [
      '<html><head><meta charset="utf-8"><style>',
      'table { border-collapse: collapse; width: 100%; }',
      'th, td { border: 1pt solid black; padding: 3pt 6pt; vertical-align: top; }',
      'th { background-color: #F2F2F2; font-weight: bold; }',
      '</style></head><body>',
      htmlContent,
      '</body></html>',
    ].join('');
  }

  /** Creates a directory (and any parents) if it does not already exist. */
  static _ensureDir(dirPath) {
    console.info(`[Markdown._ensureDir] 🟢 Starting...`);
    if (!fs.existsSync(dirPath)) {
      fs.mkdirSync(dirPath, { recursive: true });
    }
  }

  /**
   * Exports an already-open Word document to PDF via COM automation.
   * The PDF is placed in a `PDF` folder within the specified `baseDir`.
   * The caller is responsible for closing `doc` afterwards.
   *
   * @param {string} docxPath  Absolute path of the saved .docx (used for filename)
   * @param {object} doc       An already-open Word.Document COM object
   * @param {string} baseDir   The directory where the PDF/ folder should be created
   * @returns {string}         Absolute path of the generated PDF
   */
  static _exportDocToPdf(docxPath, doc, baseDir) {
    console.info(`[Markdown._exportDocToPdf] 🟢 Starting...`);
    Markdown._ensureDir(path.join(baseDir, 'PDF'));

    const parsed  = path.parse(docxPath);
    let pdfPath = path.join(baseDir, 'PDF', `${parsed.name}.pdf`);
    pdfPath = Files.incrementFileName(pdfPath);

    console.log(`📄 Exporting PDF: ${pdfPath}`);
    // wdExportFormatPDF = 17
    doc.ExportAsFixedFormat(pdfPath, 17);

    console.log(`✅ PDF saved: ${pdfPath}`);
    return pdfPath;
  }

  /**
   * Converts a Markdown file to Word .docx (plain template, no TOC).
   * The .docx is saved in a `DOC` folder next to the source .md file.
   * If genPdf is true (default) a PDF is also exported to a `PDF` folder.
   *
   * Template config key: Templates.WordMd
   *
   * @param {string}  filePath
   * @param {object}  [opts]
   * @param {boolean} [opts.genPdf=true]  Also export a PDF alongside the .docx
   * @returns {string}  Absolute path of the generated .docx
   */
  static convertToWord(filePath, genPdf = true, templatePath = null) {
    console.info(`[Markdown.convertToWord] 🟢 Starting...`);
    if (!winax) return Dialogs.warningBox('Native automation (winax) is not available.', 'convertToWord');

    const absPath = path.resolve(filePath);
    if (!fs.existsSync(absPath)) return Dialogs.warningBox(`File not found: ${absPath}`, 'convertToWord');

    try {
      console.log(`📂 Reading Markdown file: ${absPath}`);
      const markdown = fs.readFileSync(absPath, 'utf8');

      console.log(`🔄 Converting to HTML buffer...`);
      let htmlContent = marked.parse(markdown, { renderer: Markdown._getRenderer() });

      const parsed      = path.parse(absPath);
      
      // Apply advanced post-processing (Images, Footnotes, Highlights)
      htmlContent = Markdown._postProcessHtml(htmlContent, parsed.dir);

      const tempHtmlPath = path.join(parsed.dir, `${parsed.name}_temp_${Date.now()}.html`);

      const finalHtml = Markdown._buildTempHtml(htmlContent);
      fs.writeFileSync(tempHtmlPath, finalHtml, 'utf8');

      if (!templatePath) {
        templatePath = Yamls.getConfig('Templates.WordMd');
      }
      if (!templatePath || !fs.existsSync(templatePath))
        return Dialogs.warningBox(`Word template not found at: ${templatePath}`, 'convertToWord');

      const docDir  = path.join(parsed.dir, 'DOC');
      Markdown._ensureDir(docDir);
      let newPath = path.join(docDir, `${parsed.name}.docx`);
      newPath = Files.incrementFileName(newPath);
      fs.copyFileSync(templatePath, newPath);

      const wordApp = new winax.Object('Word.Application');
      wordApp.Visible = false;
      wordApp.DisplayAlerts = 0;

      try {
        console.log(`📂 Opening template docx: ${newPath}`);
        const doc       = wordApp.Documents.Open(newPath);
        const selection = wordApp.Selection;
        selection.EndKey(6); // wdStory

        selection.InsertFile(tempHtmlPath);

        console.log(`\n💾 Word docx saved: ${newPath}`);
        doc.Save();

        if (genPdf) {
          Markdown._exportDocToPdf(newPath, doc, parsed.dir);
        }

        doc.Close(false);
      } finally {
        try { wordApp.Quit(); } catch(e) {}
        try { winax.release(wordApp); } catch(e) {}
        if (fs.existsSync(tempHtmlPath)) fs.unlinkSync(tempHtmlPath);
      }

      return newPath;
    } catch (error) {
      console.error('❌ Error:', error);
      return Dialogs.warningBox(error.message, 'convertToWord Error');
    }
  }

  /**
   * Converts a Markdown file to a Word .docx using a TOC-enabled template.
   * The template must contain the literal placeholder text "{Content}" where
   * the converted content should be inserted. After insertion the existing
   * Table of Contents field in the document is refreshed automatically.
   * The .docx is saved in a `DOC` folder next to the source .md file.
   * If genPdf is true (default) a PDF is also exported to a `PDF` folder.
   *
   * Template config key: Templates.WordMdTOC
   *
   * @param {string}  filePath
   * @param {object}  [opts]
   * @param {boolean} [opts.genPdf=true]  Also export a PDF alongside the .docx
   * @returns {string}  Absolute path of the generated .docx
   */
  static convertToWordTOC(filePath, genPdf = true, templatePath = null) {
    console.info(`[Markdown.convertToWordTOC] 🟢 Starting...`);
    if (!winax) return Dialogs.warningBox('Native automation (winax) is not available.', 'convertToWordTOC');

    const absPath = path.resolve(filePath);
    if (!fs.existsSync(absPath)) return Dialogs.warningBox(`File not found: ${absPath}`, 'convertToWordTOC');

    try {
      console.log(`📂 Reading Markdown file: ${absPath}`);
      const markdown = fs.readFileSync(absPath, 'utf8');

      console.log(`🔄 Converting to HTML buffer...`);
      let htmlContent = marked.parse(markdown, { renderer: Markdown._getRenderer() });

      const parsed       = path.parse(absPath);

      // Apply advanced post-processing (Images, Footnotes, Highlights)
      htmlContent = Markdown._postProcessHtml(htmlContent, parsed.dir);

      const tempHtmlPath = path.join(parsed.dir, `${parsed.name}_temp_${Date.now()}.html`);

      const finalHtml = Markdown._buildTempHtml(htmlContent);
      fs.writeFileSync(tempHtmlPath, finalHtml, 'utf8');

      if (!templatePath) {
        templatePath = Yamls.getConfig('Templates.WordMdTOC');
      }
      if (!templatePath || !fs.existsSync(templatePath))
        return Dialogs.warningBox(`TOC template not found at: ${templatePath}`, 'convertToWordTOC');

      const docDir  = path.join(parsed.dir, 'DOC');
      Markdown._ensureDir(docDir);
      let newPath = path.join(docDir, `${parsed.name}.docx`);
      newPath = Files.incrementFileName(newPath);
      fs.copyFileSync(templatePath, newPath);

      const wordApp = new winax.Object('Word.Application');
      wordApp.Visible = false;
      wordApp.DisplayAlerts = 0;

      try {
        console.log(`📂 Opening TOC template docx: ${newPath}`);
        const doc = wordApp.Documents.Open(newPath);

        // Use Selection.Find so that a successful match actually MOVES the
        // selection to the found text — doc.Content.Find does NOT do this.
        const selection = wordApp.Selection;
        selection.HomeKey(6); // wdStory — move to document start

        const find = selection.Find;
        find.ClearFormatting();
        find.Text = '{Content}';
        find.Replacement.Text = '';
        find.Forward = true;
        find.Wrap = 1; // wdFindContinue
        const found = find.Execute();

        if (!found) {
          doc.Close(false);
          return Dialogs.warningBox(`Placeholder "{Content}" not found in template: ${templatePath}`, 'convertToWordTOC');
        }

        // Selection is now positioned exactly on "{Content}" — delete it and
        // insert the converted HTML content in its place.
        selection.Delete();
        selection.InsertFile(tempHtmlPath);

        // Programmatically refresh every Table of Contents in the document.
        console.log(`🔄 Updating Table of Contents...`);
        const tocCount = doc.TablesOfContents.Count;
        for (let i = 1; i <= tocCount; i++) {
          doc.TablesOfContents.Item(i).Update();
        }
        // Also update all remaining fields (page refs, etc.)
        doc.Fields.Update();

        console.log(`\n💾 Word (TOC) docx saved: ${newPath}`);
        doc.Save();

        if (genPdf) {
          Markdown._exportDocToPdf(newPath, doc, parsed.dir);
        }

        doc.Close(false);
      } finally {
        try { wordApp.Quit(); } catch(e) {}
        try { winax.release(wordApp); } catch(e) {}
        if (fs.existsSync(tempHtmlPath)) fs.unlinkSync(tempHtmlPath);
      }

      return newPath;
    } catch (error) {
      console.error('❌ Error:', error);
      return Dialogs.warningBox(error.message, 'convertToWordTOC Error');
    }
  }

  static convertToHtml(filePath) {
    console.info(`[Markdown.convertToHtml] 🟢 Starting...`);
    const absPath = path.resolve(filePath);

    if (!fs.existsSync(absPath)) return Dialogs.warningBox(`File not found: ${absPath}`, 'convertToHtml');

    try {
      console.log(`📂 Reading Markdown file: ${absPath}`);
      const markdown = fs.readFileSync(absPath, 'utf8');

      console.log(`🔄 Converting to HTML...`);
      let htmlContent = marked.parse(markdown, { renderer: Markdown._getRenderer() });

      const parsed   = path.parse(absPath);
      
      // Apply advanced post-processing (Images, Footnotes, Highlights)
      htmlContent = Markdown._postProcessHtml(htmlContent, parsed.dir);

      const htmDir   = path.join(parsed.dir, 'HTM');
      Markdown._ensureDir(htmDir);
      const newPath  = path.join(htmDir, `${parsed.name}.html`);

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
      console.error('❌ Error:', error);
      return Dialogs.warningBox(error.message, 'convertToHtml Error');
    }
  }
  /**
   * Replaces Latin characters in a Markdown file with visually identical
   * Cyrillic homoglyphs using the shared PERFECT_STEALTH map from Word.
   * Works on plain UTF-8 text — no COM/winax required.
   *
   * @param {string} fileName - Path to the source .md file.
   * @param {string|null} chars - If null, all mapped chars are replaced.
   *   If a string (e.g. "STy"), only those chars present in the map are replaced.
   * @returns {string|undefined} Path to the saved output file.
   */
  static homoglyph(fileName, chars = null) {
    console.info(`[Markdown.homoglyph] 🟢 Starting...`);
    const absPath = path.resolve(fileName);

    if (!fs.existsSync(absPath)) {
      Dialogs.warningBox(`File not found: ${absPath}`, 'Error');
      return;
    }

    const replaceMap = Word.buildHomoglyphMap(chars);

    if (Object.keys(replaceMap).length === 0) {
      console.warn('⚠️ Markdown.homoglyph: No valid replacement characters found. Nothing to do.');
      return;
    }

    // Build output path: "<basename> Norm.md", auto-incremented
    const ext = path.extname(absPath);
    const baseName = Files.getBaseName(absPath, ext);
    const dir = path.dirname(absPath);
    const homoglyphSuffix = Yamls.getConfig('Markdown.HomoglyphSuffix', null, ' Norm') || ' Norm';
    const baseOutputPath = path.join(dir, `${baseName}${homoglyphSuffix}${ext}`);
    const outputPath = Files.incrementFileName(baseOutputPath);

    // Read source, apply character substitutions, write output
    let content = fs.readFileSync(absPath, 'utf8');
    for (const [latin, cyrillic] of Object.entries(replaceMap)) {
      const escaped = latin.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      content = content.replace(new RegExp(escaped, 'g'), cyrillic);
      console.log(`🔄 '${latin}' → '${cyrillic}'`);
    }

    fs.writeFileSync(outputPath, content, 'utf8');
    console.log(`✅ Markdown homoglyph saved: ${outputPath}`);
    return outputPath;
  }

  /**
   * Prompts the user with an input box containing all PERFECT_STEALTH keys.
   * The user can remove characters, but adding new ones will be ignored.
   * Calls homoglyph with the selected characters.
   *
   * @param {string} fileName - Path to the source .md file.
   * @returns {string|undefined} Path to the saved output file.
   */
  static homoglyphAsk(fileName) {
    console.info(`[Markdown.homoglyphAsk] 🟢 Starting...`);
    const allChars = Object.keys(Word.buildHomoglyphMap()).join('');
    const defaultChars = Yamls.getConfig('ChoosedChars.Markdown', null, allChars) || allChars;

    const selectedChars = Dialogs.inputBox(
      'Leave only the characters you want to replace (adding new symbols is prohibited):',
      'Select Homoglyph Characters',
      defaultChars
    );

    if (selectedChars === null) {
      console.log('homoglyphAsk: Cancelled by user.');
      return;
    }

    const validChars = selectedChars.split('').filter(ch => allChars.includes(ch)).join('');

    // Persist the user's choice for next time
    Yamls.setConfig('ChoosedChars.Markdown', validChars);

    return this.homoglyph(fileName, validChars);
  }

  /**
   * Merges an array of Markdown files into a single .md file.
   *
   * Output location : the same folder that contains the first file.
   * Output filename  : <thatFolderName> 1.md, auto-incremented if it already
   *                    exists (e.g. "Diagnose 1.md", "Diagnose 2.md", …).
   *
   * Between each file's content, `lineBetween` empty lines are inserted so
   * the sections are visually separated when the result is opened in an editor
   * or converted to another format.
   *
   * @param {string[]}   files        - Absolute (or resolvable) paths to the .md
   *                                   files to merge, in the desired order.
   * @param {number|null} lineBetween - Number of empty lines to insert between
   *                                   each file's content. When null (default)
   *                                   the value is read from config key
   *                                   `Markdown.LineBetween` (fallback: 20).
   * @returns {string|undefined} Absolute path of the written output file,
   *                             or undefined on error / empty input.
   */
  static merge(files, lineBetween = null) {
    console.info(`[Markdown.merge] 🟢 Starting...`);

    if (!Array.isArray(files) || files.length === 0) {
      console.warn('⚠️ Markdown.merge: No files provided.');
      return;
    }

    // Resolve every path up-front and validate existence
    const absPaths = files.map(f => path.resolve(f));
    for (const p of absPaths) {
      if (!fs.existsSync(p)) {
        return Dialogs.warningBox(`File not found: ${p}`, 'Markdown.merge');
      }
    }

    try {
      // Output goes into the same folder as the first file, named after that folder
      const firstDir   = path.dirname(absPaths[0]);
      const folderName = path.basename(firstDir);

      Markdown._ensureDir(firstDir);

      const baseOutPath = path.join(firstDir, `${folderName} 1.md`);
      const outPath     = Files.incrementFileName(baseOutPath);

      // Resolve lineBetween: explicit arg → config → hard fallback 20
      const lineCount = (lineBetween !== null && lineBetween !== undefined)
        ? Number(lineBetween)
        : Number(Yamls.getConfig('Markdown.LineBetween', null, 20) ?? 20);
      const separator = '\n'.repeat(lineCount + 1); // +1 keeps the last line of prev file
      console.log(`📏 Lines between files: ${lineCount}`);

      // Read and join all files with the configured separator
      console.log(`📂 Merging ${absPaths.length} file(s) → ${outPath}`);
      const parts = absPaths.map((p, i) => {
        console.log(`  [${i + 1}/${absPaths.length}] Reading: ${p}`);
        return fs.readFileSync(p, 'utf8');
      });

      const merged = parts.join(separator);
      fs.writeFileSync(outPath, merged, 'utf8');

      console.log(`✅ Markdown.merge: Saved → ${outPath}`);
      return outPath;
    } catch (error) {
      console.error('❌ Markdown.merge error:', error);
      return Dialogs.warningBox(error.message, 'Markdown.merge Error');
    }
  }
}
