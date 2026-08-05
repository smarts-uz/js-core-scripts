// Rewrites every sheller/* launcher to point at the per-method runners under
// scripts/<Class>/<method>.mjs. One menu entry = one runner file.
import { writeFileSync } from 'node:fs';
import path from 'node:path';

// Derive the project root relatively from this script's own location —
// scripts/ is one folder below the root. Never hardcode an absolute path (the
// project moves).
const ROOT = path.resolve(import.meta.dirname, '..');
const SH = path.join(ROOT, 'sheller');
const R = (cls, method) => `${ROOT}\\scripts\\${cls}\\${method}.mjs`;

// NoClose launcher line → a per-method runner
const L = (label, cls, method, args = '') =>
    `NoClose;${label};node.exe "${R(cls, method)}"${args ? ' ' + args : ''}`;

// Launcher line → the compiled humanize Tauri app.exe directly, using the
// SAME "NoClose;Label;command" shape as every other entry (the app itself
// manages its own window once launched; NoClose here just keeps the
// launcher's own console channel consistent with every other entry in this
// file). Opens with the clicked file pre-filled (via get_launch_file_path,
// see humanize/src-tauri/src/lib.rs) instead of the user picking it again.
const HUMANIZE_EXE = `${ROOT}\\humanize\\src-tauri\\target\\release\\app.exe`;
const H = (label) => `NoClose;${label};"${HUMANIZE_EXE}" "%1"`;

const files = {
    'Docx.appshell': [
        '.docx',
        [
            L('Word to MD', 'Word', 'wordToMD', '--file "%1"'),
            L('Word Homoglyph (All)', 'Homoglyph', 'word', '--file "%1"'),
            L('Word Homoglyph (Chars...)', 'Homoglyph', 'word', '--file "%1" --chars "%2"'),
            L('Word Homoglyph (Ask)', 'Homoglyph', 'wordAsk', '--file "%1"'),
            L('Protect File (Ask)', 'Word', 'protectFileAsk', '--file "%1"'),
            L('Unprotect File (Ask)', 'Word', 'unProtectFileAsk', '--file "%1"'),
            H('Homoglyph Replace (Humanize)'),
        ],
    ],
    'Xlsx.appshell': [
        '.xlsx',
        [
            L('Protect Worksheets (Ask)', 'Excels', 'protectSheetAsk', '--file "%1"'),
            L('Unprotect Worksheets (Ask)', 'Excels', 'unProtectSheetAsk', '--file "%1"'),
            L('Protect File (Ask)', 'Excels', 'protectFileAsk', '--file "%1"'),
            L('Unprotect File (Ask)', 'Excels', 'unProtectFileAsk', '--file "%1"'),
            L('Hide & Protect Sheet (Ask)', 'Excels', 'hideProtectSheetAsk', '--file "%1"'),
            L('Unhide & Unprotect Sheet (Ask)', 'Excels', 'unHideUnProtectSheetAsk', '--file "%1"'),
            L('Excel Homoglyph (All)', 'Homoglyph', 'excel', '--file "%1"'),
            L('Excel Homoglyph (Chars...)', 'Homoglyph', 'excel', '--file "%1" --chars "%2"'),
            L('Excel Homoglyph (Ask)', 'Homoglyph', 'excelAsk', '--file "%1"'),
            // Contract .xltx → .xlsx convert (self-contained runner over Excels)
            L('Contract Convert (.xltx→.xlsx)', 'Excels', 'contractConvert', '--input "%1"'),
            H('Homoglyph Replace (Humanize)'),
        ],
    ],
    'Md.appshell': [
        '.md',
        [
            L('MD to HTML', 'Markdown', 'convertToHtml', '--file "%1"'),
            L('MD to Word', 'Markdown', 'convertToWord', '--file "%1"'),
            L('MD to Word (No PDF)', 'Markdown', 'convertToWord', '--file "%1" --gen-pdf false'),
            L('MD to Word TOC', 'Markdown', 'convertToWordTOC', '--file "%1"'),
            L(
                'MD to Word TOC (No PDF)',
                'Markdown',
                'convertToWordTOC',
                '--file "%1" --gen-pdf false'
            ),
            L('MD Merge', 'Markdown', 'merge', '%*'),
            L('MD Homoglyph (All)', 'Homoglyph', 'markdown', '--file "%1"'),
            L('MD Homoglyph (Chars...)', 'Homoglyph', 'markdown', '--file "%1" --chars "%2"'),
            L('MD Homoglyph (Ask)', 'Homoglyph', 'markdownAsk', '--file "%1"'),
        ],
    ],
    'Pptx.appshell': [
        '.pptx',
        [
            L('PPT Homoglyph (All)', 'Homoglyph', 'powerpoint', '--file "%1"'),
            L('PPT Homoglyph (Chars...)', 'Homoglyph', 'powerpoint', '--file "%1" --chars "%2"'),
            L('PPT Homoglyph (Ask)', 'Homoglyph', 'powerpointAsk', '--file "%1"'),
            L('Protect File (Ask)', 'PowerPoints', 'protectFileAsk', '--file "%1"'),
            L('Unprotect File (Ask)', 'PowerPoints', 'unProtectFileAsk', '--file "%1"'),
            H('Homoglyph Replace (Humanize)'),
        ],
    ],
    'Mht.appshell': [
        '.mht',
        [L('MHTML to HTML', 'Chromes', 'saveHtmlFromMht', '--mhtml "%1" --offline')],
    ],
    'Mhtml.appshell': [
        '.mhtml',
        [L('MHTML to HTML', 'Chromes', 'saveHtmlFromMht', '--mhtml "%1" --offline')],
    ],
    'Yml.appshell': [
        '.yml',
        [
            L('Category', 'Category', 'run', '--yaml "%1"'),
            L('Revert', 'Category', 'revert', '--yaml "%1"'),
            // Contract workflow (self-contained runners over Word/Excels/Yamls)
            L('Contract → Word', 'Word', 'contract', '--yaml "%1"'),
            L('Contract → Excel', 'Excels', 'contract', '--yaml "%1"'),
            L('Contract Fill Yaml', 'Yamls', 'contractFill', '--yaml "%1"'),
            L('Contract Update Yaml', 'Yamls', 'contractUpdate', '--yaml "%1"'),
        ],
    ],
    // OLX scraper pipeline — self-contained runners over Chromes/Puppe/Phone.
    // The primary input is a saved data .mhtml passed as "%1".
    'Olx.appshell': [
        '.mhtml',
        [
            L('OLX App One (pages+pagination)', 'Olx', 'appOne', '--app "%1"'),
            L('OLX App Two (offers+phones)', 'Olx', 'appTwo', '--app "%1"'),
            L('OLX App Three (phones+merge)', 'Olx', 'appThree', '--app "%1"'),
            L('OLX Offers', 'Olx', 'offers', '--app "%1"'),
            L('OLX Pages', 'Olx', 'pages', '--app "%1"'),
            L('OLX Phone', 'Olx', 'phone', '--app "%1"'),
            L('OLX Finder', 'Olx', 'finder', '--app "%1"'),
            L('OLX Merge', 'Olx', 'merge', '--app "%1"'),
            L('OLX Checker (no-phone)', 'Olx', 'checker', '--app "%1"'),
        ],
    ],
    'Folder.appshell': [
        'Folder',
        [
            L('Make Structure', 'Scanner', 'run', '--sourceFolder "%1" --maxLevel 5'),
            L('MHTML to HTML', 'Chromes', 'convertFolderMhtToHtm', '--folder "%1"'),
            L('Copy HTML URLs', 'Chromes', 'processPathsToClipboard', '"%1"'),
            L('Merge YAMLs', 'Yamls', 'mergeYamlsInFolder', '--folder "%1"'),
            L('Merge Excels', 'Excels', 'mergeFiles', '"%1"'),
        ],
    ],
    'Docx.appmany': ['.docx', [L('Merge Word Files', 'Word', 'merge', '$files')]],
    'Md.appmany': ['.md', [L('Merge MD Files', 'Markdown', 'merge', '$files')]],
    'Xlsx.appmany': ['.xlsx', [L('Merge Excel Files', 'Excels', 'mergeFiles', '$files')]],
    'Pptx.appmany': ['.pptx', [L('Merge PowerPoint Files', 'PowerPoints', 'merge', '$files')]],
    'Folder.appmany': [
        'Folder',
        [
            L('Merge Word Folders', 'Word', 'mergeFolder', '$files'),
            L('Merge Excel Folders', 'Excels', 'mergeFolder', '$files'),
            L('Merge PowerPoint Folders', 'PowerPoints', 'mergeFolder', '$files'),
        ],
    ],
    'ALL.appmany': [
        '*',
        [L('Copy URL(s) to Clipboard', 'Chromes', 'processPathsToClipboard', '$files')],
    ],
};

for (const [name, [head, lines]] of Object.entries(files)) {
    writeFileSync(path.join(SH, name), [head, ...lines].join('\n') + '\n', 'utf8');
    console.log(`✅ sheller/${name} (${lines.length})`);
}

// ALL.applnk — global registry context entry → scripts/Registry/clean.mjs
writeFileSync(
    path.join(SH, 'ALL.applnk'),
    `DevApp\\Context\nnode.exe;Registry Clean;"${R('Registry', 'clean')}"\n`,
    'utf8'
);
console.log('✅ sheller/ALL.applnk');
