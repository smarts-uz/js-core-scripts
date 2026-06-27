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
    
    // Convert Mermaid code blocks to a Kroki PNG image. PNG (not SVG) is used
    // because Word embeds a raster image at its true pixel size, whereas a
    // linked SVG arrives as a tiny 24x24 placeholder. The URL is downloaded to
    // a local file later, in the async _postProcessHtml step, so the picture is
    // EMBEDDED rather than linked (survives moving the .docx).
    renderer.code = ({ text, lang }) => {
      if (lang === 'mermaid') {
        try {
          const compressed = zlib.deflateSync(Buffer.from(text, 'utf8'));
          const base64url = compressed.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
          const url = `https://kroki.io/mermaid/png/${base64url}`;
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

  /**
   * Downloads a remote image (e.g. a Kroki-rendered Mermaid PNG) to a local
   * `_assets` folder and returns the absolute local path, so Word EMBEDS it
   * instead of linking a remote URL. Returns null on any failure (the caller
   * then keeps the original URL).
   *
   * @param {string} url       Remote http(s) image URL.
   * @param {string} assetsDir Folder to save the downloaded file into.
   * @param {number} index     Index used to build a stable unique filename.
   * @returns {Promise<string|null>} Absolute local path, or null.
   */
  static async _downloadImage(url, assetsDir, index) {
    console.info(`[Markdown._downloadImage] 🟢 Starting... url=${url}`);
    try {
      const res = await fetch(url);
      if (!res.ok) {
        console.warn(`[Markdown._downloadImage] HTTP ${res.status} for ${url}`);
        return null;
      }
      const contentType = res.headers.get('content-type') || '';
      const ext = contentType.includes('png') ? '.png'
        : contentType.includes('jpeg') || contentType.includes('jpg') ? '.jpg'
        : contentType.includes('gif') ? '.gif'
        : contentType.includes('svg') ? '.svg'
        : '.png';
      Markdown._ensureDir(assetsDir);
      const buf = Buffer.from(await res.arrayBuffer());
      const outPath = path.join(assetsDir, `remote_${index}${ext}`);
      fs.writeFileSync(outPath, buf);
      console.info(`[Markdown._downloadImage] ✅ Saved: ${outPath} (${buf.length} bytes)`);
      return outPath;
    } catch (e) {
      console.error(`[Markdown._downloadImage] ❌ Failed for ${url}:`, e.message);
      return null;
    }
  }

  static async _postProcessHtml(htmlContent, parsedDir) {
    console.info(`[Markdown._postProcessHtml] 🟢 Starting...`);

    let processed = htmlContent;

    // 0. Download every remote http(s) <img> (e.g. Kroki Mermaid PNG) to a local
    //    file so Word embeds it at full size instead of linking a remote URL.
    const assetsDir = path.join(parsedDir, '_assets');
    const remoteSrcs = [...processed.matchAll(/<img[^>]+src="(https?:\/\/[^"]+)"/ig)].map(m => m[1]);
    const uniqueRemote = [...new Set(remoteSrcs)];
    console.log(`[Markdown._postProcessHtml] Remote images to download: ${uniqueRemote.length}`);
    for (let i = 0; i < uniqueRemote.length; i++) {
      const src = uniqueRemote[i];
      const localPath = await Markdown._downloadImage(src, assetsDir, i);
      if (localPath) {
        // Replace every occurrence of this exact URL with the local absolute path.
        processed = processed.split(`src="${src}"`).join(`src="${localPath}"`);
      }
    }

    // 1. Fix relative image paths so Word can resolve and embed them
    processed = processed.replace(/<img[^>]+src="([^"]+)"/ig, (match, src) => {
      if (!src.match(/^(https?:\/\/|data:|file:\/\/\/)/i)) {
        const absolutePath = path.resolve(parsedDir, src);
        return match.replace(src, absolutePath);
      }
      return match;
    });

    // 2. Convert <mark> to Word-compatible highlights
    processed = processed.replace(/<mark>([\s\S]*?)<\/mark>/gi, '<span style="background:yellow">$1</span>');

    // 3. Convert marked-footnote reference markers to Word native footnote refs.
    //    Current marked-footnote emits  id="footnote-ref-1" href="#footnote-1",
    //    older versions emitted  id="fnref:1" href="#fn:1". Match BOTH the
    //    "footnote-ref-N / footnote-N" and the legacy "fnref:N / fn:N" forms so a
    //    library version bump never silently breaks footnotes again.
    processed = processed.replace(
      /<sup><a id="(?:footnote-ref-|fnref:)(\d+)"[^>]*href="#(?:footnote-|fn:)\1"[^>]*>(\d+)<\/a><\/sup>/g,
      `<a style='mso-footnote-id:ftn$1' href="#_ftn$1" name="_ftnref$1" title=""><span class=MsoFootnoteReference><span style='mso-special-character:footnote'><!--[if !supportFootnotes]-->[$2]<!--[endif]--></span></span></a>`
    );

    // 4. Convert the marked-footnote definition list to the Word footnote format.
    //    The section may carry data-footnotes and an <h2 class="sr-only"> label
    //    before the <ol> — tolerate any content between <section> and <ol>.
    processed = processed.replace(
      /<section class="footnotes"[^>]*>[\s\S]*?<ol>([\s\S]*?)<\/ol>\s*<\/section>/gi,
      (_match, listContent) => {
        // Each <li> id is "footnote-N" (new) or "fn:N" (legacy); the back-ref
        // link (↩) at the end is stripped — Word recreates it natively.
        let footnotes = listContent.replace(
          /<li id="(?:footnote-|fn:)(\d+)">([\s\S]*?)<a href="#(?:footnote-ref-|fnref:)\1"[^>]*>[\s\S]*?<\/a>([\s\S]*?)<\/li>/gi,
          `<div style='mso-element:footnote' id=ftn$1><p class=MsoFootnoteText><a style='mso-footnote-id:ftn$1' href="#_ftnref$1" name="_ftn$1" title="">[$1]</a> $2$3</p></div>`
        );
        return `<div style='mso-element:footnote-list'>${footnotes}</div>`;
      }
    );

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
   * Breaks the link on every linked inline picture so the image bytes are
   * stored inside the document (embedded), not merely referenced. Word's
   * Selection.InsertFile imports <img> tags as LINKED pictures by default,
   * which break the moment the .docx is moved or the source file/URL is gone.
   *
   * For each linked InlineShape we set SavePictureWithDocument=true then call
   * BreakLink, converting it to a true embedded picture.
   *
   * @param {object} doc - An open Word.Document COM object.
   */
  static _embedLinkedPictures(doc) {
    console.info(`[Markdown._embedLinkedPictures] 🟢 Starting...`);
    let embedded = 0;
    const count = doc.InlineShapes.Count;
    console.log(`[Markdown._embedLinkedPictures] InlineShapes: ${count}`);
    for (let i = 1; i <= count; i++) {
      const shape = doc.InlineShapes.Item(i);
      try {
        const link = shape.LinkFormat;
        if (link) {
          link.SavePictureWithDocument = true;
          link.BreakLink();
          embedded++;
        }
      } catch (e) {
        // Shape has no LinkFormat (already embedded / OMath / chart) — skip.
      }
    }
    console.info(`[Markdown._embedLinkedPictures] ✅ Embedded ${embedded} linked picture(s).`);
  }

  /**
   * Resolves a Word template path from a config key that now holds a FOLDER.
   * The latest "Basename N" .docx inside that folder is picked (matching rules
   * via Files.getLatestMatchingFile). For backward compatibility, if the config
   * value already points directly at an existing .docx file, that file is used.
   *
   * @param {string} configKey - e.g. 'Templates.WordMd' or 'Templates.WordMdTOC'
   * @returns {string|null} Absolute path of the resolved template .docx, or null.
   */
  static _resolveTemplate(configKey) {
    console.info(`[Markdown._resolveTemplate] 🟢 Starting... configKey=${configKey}`);
    const configured = Yamls.getConfig(configKey);
    console.log(`[Markdown._resolveTemplate] Configured value: ${configured}`);

    if (!configured) {
      console.warn(`[Markdown._resolveTemplate] No value configured for ${configKey}`);
      return null;
    }

    // Backward-compatible: a direct file path still works.
    if (fs.existsSync(configured) && fs.statSync(configured).isFile()) {
      console.info(`[Markdown._resolveTemplate] Using direct file path: ${configured}`);
      return configured;
    }

    // Folder mode: pick the latest "Basename N" .docx from the folder.
    const latest = Files.getLatestMatchingFile(configured, '.docx');
    console.info(`[Markdown._resolveTemplate] Latest template resolved: ${latest}`);
    return latest;
  }

  /**
   * Shared conversion core used by both convertToWord and convertToWordTOC.
   *
   * Pipeline: read .md → marked → post-process HTML → write temp HTML →
   * resolve template (latest file from folder) → copy template to DOC/ →
   * open in Word → run the format-specific `insertFn` → save → optional PDF →
   * close & cleanup.
   *
   * The only difference between the plain and TOC flows is HOW the HTML is
   * inserted, so that step is injected as `insertFn(selection, doc, tempHtmlPath,
   * wordApp)`. It must return true on success, or false to abort (the doc is
   * then closed without saving). Any TOC/field refresh also happens inside it.
   *
   * @param {string}   filePath      Source .md path.
   * @param {boolean}  genPdf        Also export a PDF.
   * @param {string}   configKey     Config key holding the template FOLDER.
   * @param {string}   label         Label for logs/dialogs (e.g. 'convertToWord').
   * @param {string|null} templatePath Explicit template override (file or folder).
   * @param {function} insertFn      Format-specific insertion callback.
   * @returns {string|undefined} Absolute path of the generated .docx.
   */
  static async _convertToWordCore(filePath, genPdf, configKey, label, templatePath, insertFn) {
    console.info(`[Markdown._convertToWordCore] 🟢 Starting... label=${label}`);
    if (!winax) return Dialogs.warningBox('Native automation (winax) is not available.', label);

    const absPath = path.resolve(filePath);
    if (!fs.existsSync(absPath)) return Dialogs.warningBox(`File not found: ${absPath}`, label);

    try {
      console.log(`📂 Reading Markdown file: ${absPath}`);
      const markdown = fs.readFileSync(absPath, 'utf8');

      console.log(`🔄 Converting to HTML buffer...`);
      let htmlContent = marked.parse(markdown, { renderer: Markdown._getRenderer() });

      const parsed = path.parse(absPath);

      // Apply advanced post-processing (Images, Footnotes, Highlights)
      htmlContent = await Markdown._postProcessHtml(htmlContent, parsed.dir);

      const tempHtmlPath = path.join(parsed.dir, `${parsed.name}_temp_${Date.now()}.html`);
      const finalHtml    = Markdown._buildTempHtml(htmlContent);
      fs.writeFileSync(tempHtmlPath, finalHtml, 'utf8');

      // Resolve template: explicit override → else latest file from config folder.
      let resolvedTemplate = templatePath;
      if (resolvedTemplate && fs.existsSync(resolvedTemplate) && fs.statSync(resolvedTemplate).isDirectory()) {
        resolvedTemplate = Files.getLatestMatchingFile(resolvedTemplate, '.docx');
      }
      if (!resolvedTemplate) {
        resolvedTemplate = Markdown._resolveTemplate(configKey);
      }
      console.log(`[Markdown._convertToWordCore] Resolved template: ${resolvedTemplate}`);
      if (!resolvedTemplate || !fs.existsSync(resolvedTemplate))
        return Dialogs.warningBox(`Word template not found (key ${configKey}): ${resolvedTemplate}`, label);

      const docDir = path.join(parsed.dir, 'DOC');
      Markdown._ensureDir(docDir);
      let newPath = path.join(docDir, `${parsed.name}.docx`);
      newPath = Files.incrementFileName(newPath);
      console.log(`[Markdown._convertToWordCore] Output docx: ${newPath}`);
      fs.copyFileSync(resolvedTemplate, newPath);

      const wordApp = new winax.Object('Word.Application');
      wordApp.Visible = false;
      wordApp.DisplayAlerts = 0;

      try {
        console.log(`📂 Opening template docx: ${newPath}`);
        const doc       = wordApp.Documents.Open(newPath);
        const selection = wordApp.Selection;

        const inserted = insertFn(selection, doc, tempHtmlPath, wordApp);
        if (inserted === false) {
          doc.Close(false);
          return Dialogs.warningBox(`Content insertion failed for: ${resolvedTemplate}`, label);
        }

        // Word's InsertFile imports <img> as LINKED pictures (Type=4). Break the
        // links so every image (local files + downloaded Mermaid PNGs) is stored
        // INSIDE the .docx and survives moving the file.
        Markdown._embedLinkedPictures(doc);

        console.log(`\n💾 Word docx saved: ${newPath}`);
        doc.Save();

        if (genPdf) {
          Markdown._exportDocToPdf(newPath, doc, parsed.dir);
        }

        doc.Close(false);
      } finally {
        try { wordApp.Quit(); } catch (e) {}
        try { winax.release(wordApp); } catch (e) {}
        if (fs.existsSync(tempHtmlPath)) fs.unlinkSync(tempHtmlPath);
      }

      return newPath;
    } catch (error) {
      console.error('❌ Error:', error);
      return Dialogs.warningBox(error.message, `${label} Error`);
    }
  }

  /**
   * Converts a Markdown file to Word .docx (plain template, no TOC).
   * The .docx is saved in a `DOC` folder next to the source .md file.
   * If genPdf is true (default) a PDF is also exported to a `PDF` folder.
   *
   * Template config key: Templates.WordMd (a FOLDER — latest file is picked).
   *
   * @param {string}  filePath
   * @param {boolean} [genPdf=true]  Also export a PDF alongside the .docx
   * @param {string|null} [templatePath] Explicit template file/folder override.
   * @returns {string}  Absolute path of the generated .docx
   */
  static convertToWord(filePath, genPdf = true, templatePath = null) {
    console.info(`[Markdown.convertToWord] 🟢 Starting...`);
    return Markdown._convertToWordCore(
      filePath, genPdf, 'Templates.WordMd', 'convertToWord', templatePath,
      (selection, _doc, tempHtmlPath) => {
        selection.EndKey(6); // wdStory
        selection.InsertFile(tempHtmlPath);
        return true;
      }
    );
  }

  /**
   * Converts a Markdown file to a Word .docx using a TOC-enabled template.
   * The template must contain the literal placeholder text "{Content}" where
   * the converted content should be inserted. After insertion the existing
   * Table of Contents field in the document is refreshed automatically.
   * The .docx is saved in a `DOC` folder next to the source .md file.
   * If genPdf is true (default) a PDF is also exported to a `PDF` folder.
   *
   * Template config key: Templates.WordMdTOC (a FOLDER — latest file is picked).
   *
   * @param {string}  filePath
   * @param {boolean} [genPdf=true]  Also export a PDF alongside the .docx
   * @param {string|null} [templatePath] Explicit template file/folder override.
   * @returns {string}  Absolute path of the generated .docx
   */
  static convertToWordTOC(filePath, genPdf = true, templatePath = null) {
    console.info(`[Markdown.convertToWordTOC] 🟢 Starting...`);
    return Markdown._convertToWordCore(
      filePath, genPdf, 'Templates.WordMdTOC', 'convertToWordTOC', templatePath,
      (selection, doc, tempHtmlPath) => {
        // Use Selection.Find so that a successful match actually MOVES the
        // selection to the found text — doc.Content.Find does NOT do this.
        selection.HomeKey(6); // wdStory — move to document start

        const find = selection.Find;
        find.ClearFormatting();
        find.Text = '{Content}';
        find.Replacement.Text = '';
        find.Forward = true;
        find.Wrap = 1; // wdFindContinue
        const found = find.Execute();

        if (!found) {
          console.warn(`[Markdown.convertToWordTOC] Placeholder "{Content}" not found in template.`);
          return false;
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
        return true;
      }
    );
  }

  static async convertToHtml(filePath) {
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
      htmlContent = await Markdown._postProcessHtml(htmlContent, parsed.dir);

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
