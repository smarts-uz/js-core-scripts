// Rewrites every shell/* launcher to point at the per-method runners under
// runs/<Class>/<method>.mjs. One menu entry = one runner file.
import { writeFileSync } from 'node:fs';
import path from 'node:path';

const ROOT = 'd:\\Develop\\Manager\\App\\AI\\Category\\Move\\Sources\\js_ai_category';
const SH = path.join(ROOT, 'shell');
const R = (cls, method) => `${ROOT}\\runs\\${cls}\\${method}.mjs`;

// NoClose launcher line → a per-method runner
const L = (label, cls, method, args = '') =>
    `NoClose;${label};node.exe "${R(cls, method)}"${args ? ' ' + args : ''}`;

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
        ],
    ],
    'Xlsx.appshell': [
        '.xlsx',
        [
            L(
                'Replace @ (Formula)',
                'Excels',
                'replaceFormula',
                '--file "%1" --search "@" --replace ""'
            ),
            L(
                'Replace @ (Formula2)',
                'Excels',
                'replaceFormula2',
                '--file "%1" --search "@" --replace ""'
            ),
            L(
                'Replace @ (FormulaArray)',
                'Excels',
                'replaceFormulaArray',
                '--file "%1" --search "@" --replace ""'
            ),
            L(
                'Replace @ (Standard)',
                'Excels',
                'replaceStandart',
                '--file "%1" --search "@" --replace ""'
            ),
            L(
                'Replace @ (Formula All)',
                'Excels',
                'replaceFormulaAll',
                '--file "%1" --search "@" --replace ""'
            ),
            L('Excel Recalc', 'Excels', 'recalculate', '--file "%1"'),
            L('Change Font to Arial', 'Excels', 'changeFont', '--file "%1" --font "Arial"'),
            L('Protect Worksheets (Ask)', 'Excels', 'protectSheetAsk', '--file "%1"'),
            L('Unprotect Worksheets (Ask)', 'Excels', 'unProtectSheetAsk', '--file "%1"'),
            L('Protect File (Ask)', 'Excels', 'protectFileAsk', '--file "%1"'),
            L('Unprotect File (Ask)', 'Excels', 'unProtectFileAsk', '--file "%1"'),
            L('Hide & Protect Sheet (Ask)', 'Excels', 'hideProtectSheetAsk', '--file "%1"'),
            L('Unhide & Unprotect Sheet (Ask)', 'Excels', 'unHideUnProtectSheetAsk', '--file "%1"'),
            L('Excel Homoglyph (All)', 'Homoglyph', 'excel', '--file "%1"'),
            L('Excel Homoglyph (Chars...)', 'Homoglyph', 'excel', '--file "%1" --chars "%2"'),
            L('Excel Homoglyph (Ask)', 'Homoglyph', 'excelAsk', '--file "%1"'),
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
    console.log(`✅ shell/${name} (${lines.length})`);
}

// ALL.applnk — global registry context entry → runs/Registry/clean.mjs
writeFileSync(
    path.join(SH, 'ALL.applnk'),
    `DevApp\\Context\nnode.exe;Registry Clean;"${R('Registry', 'clean')}"\n`,
    'utf8'
);
console.log('✅ shell/ALL.applnk');
