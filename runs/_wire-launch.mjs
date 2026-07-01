// Rewrites .vscode/launch.json so every util-method debug config runs its
// per-method runner: program → ${workspaceFolder}\runs\<Class>\<method>.mjs.
// Non-util tools (ai-rename, ai-rename-gemini, chat-export) are kept verbatim.
import { writeFileSync } from 'node:fs';
import path from 'node:path';

// Derive the project root relatively from this script's own location — runs/ is
// one folder below the root. Never hardcode an absolute path (the project moves).
const ROOT = path.resolve(import.meta.dirname, '..');
const prog = (cls, method) => `\${workspaceFolder}\\runs\\${cls}\\${method}.mjs`;

const cfg = (name, cls, method, args, outputStd = false) => ({
    type: 'node',
    request: 'launch',
    name,
    skipFiles: ['<node_internals>/**'],
    program: prog(cls, method),
    args,
    console: 'integratedTerminal',
    ...(outputStd ? { outputCapture: 'std' } : {}),
});
const raw = (name, program, args) => ({
    type: 'node',
    request: 'launch',
    name,
    skipFiles: ['<node_internals>/**'],
    program: `\${workspaceFolder}\\${program}`,
    args,
    console: 'integratedTerminal',
});

const X = 'd:\\FileType\\Office\\Projects\\XLSX\\Protects\\One 2.xlsx';

const configurations = [
    cfg('Word to MD', 'Word', 'wordToMD', ['--file', 'd:\\path\\to\\test.docx']),
    cfg('Scan Folders (Statistic)', 'Scanner', 'run', [
        '--sourceFolder',
        'd:\\Humans\\Medicine\\Disserta\\Statistic',
        '--maxLevel',
        '5',
    ]),
    cfg('Run Category (AZK App 1)', 'Category', 'run', [
        '--yaml',
        'D:\\Humans\\Medicine\\Disserta\\Statistic\\AIC\\AZK\\3\\1773681723823_AZK App 1.yml',
    ]),
    cfg('Revert Category (Main-Asp)', 'Category', 'revert', [
        '--yaml',
        'd:\\Humans\\Medicine\\Disserta\\Statistic\\AIC\\Main-Asp.yml',
    ]),
    cfg('MHTML to HTML (Download)', 'Chromes', 'saveHtmlFromMht', [
        '--mhtml',
        'd:\\Humans\\Medicine\\Disserta\\CalcStat\\MsExcel\\Analysis ToolPak\\ALL\\Excel Data Analysis Toolpak.mhtml',
        '--delete',
    ]),
    cfg('URL(s) to Clipboard (Example)', 'Chromes', 'processPathsToClipboard', [
        'd:\\Humans\\Medicine\\Disserta\\CalcStat\\MsExcel\\real-statistics.com\\Element\\Enlarge Dialog Box On Mac.mhtml',
        'd:\\Humans\\Medicine\\Disserta\\CalcStat\\MsExcel\\real-statistics.com\\Element\\Excel 64 Bits.mhtml',
    ]),
    cfg('Merge YAMLs in Folder', 'Yamls', 'mergeYamlsInFolder', [
        '--folder',
        'd:\\Humans\\Medicine\\Disserta\\CalcStat\\MsExcel\\real-statistics.com\\Features\\ALL',
    ]),
    cfg(
        'Excel Replace Formula (@)',
        'Excels',
        'replaceFormula',
        ['--file', X, '--search', '@', '--replace', ''],
        true
    ),
    cfg(
        'Excel Replace Formula2 (@)',
        'Excels',
        'replaceFormula2',
        ['--file', X, '--search', '@', '--replace', ''],
        true
    ),
    cfg(
        'Excel Replace FormulaArray (@)',
        'Excels',
        'replaceFormulaArray',
        ['--file', X, '--search', '@', '--replace', ''],
        true
    ),
    cfg(
        'Excel Replace Standard (@)',
        'Excels',
        'replaceStandart',
        ['--file', X, '--search', '@', '--replace', ''],
        true
    ),
    cfg(
        'Excel Replace Formula All (@)',
        'Excels',
        'replaceFormulaAll',
        ['--file', X, '--search', '@', '--replace', ''],
        true
    ),
    cfg('Excel Recalc', 'Excels', 'recalculate', ['--file', X], true),
    cfg(
        'Excel Change Font to Arial',
        'Excels',
        'changeFont',
        ['--file', X, '--font', 'Arial'],
        true
    ),
    cfg('MD to HTML (TMT Neuropsychological Assessment)', 'Markdown', 'convertToHtml', [
        '--file',
        'd:\\Humans\\Medicine\\Diagnos\\Neurolog\\Attention\\Trail Making Test, TMT\\Normals\\TMT_Neuropsychological_Assessment_v1.md',
    ]),
    cfg('MD to Word (TMT Protocol)', 'Markdown', 'convertToWord', [
        '--file',
        'd:\\Humans\\Medicine\\Disserta\\Statistic\\App\\Durdona\\M-1 POCD Features\\Protocol\\Statistical Protocol.md',
    ]),
    cfg('MD to Word TOC (Statistical Protocol)', 'Markdown', 'convertToWordTOC', [
        '--file',
        'd:\\Humans\\Medicine\\Disserta\\Statistic\\App\\Durdona\\M-1 POCD Features\\Protocol\\Statistical Protocol.md',
    ]),
    cfg('Word Merge Folders', 'Word', 'mergeFolder', [
        'd:\\Develop\\Manager\\App\\AI\\Category\\Move\\Cmdline\\word-merge-folders\\4. I-BOB\\',
        'd:\\Develop\\Manager\\App\\AI\\Category\\Move\\Cmdline\\word-merge-folders\\5. II-BOB\\',
        'd:\\Develop\\Manager\\App\\AI\\Category\\Move\\Cmdline\\word-merge-folders\\6. III-BOB\\',
    ]),
    cfg(
        'Merge Excels in Folder',
        'Excels',
        'mergeFiles',
        [
            'd:\\Humans\\Medicine\\Disserta\\Statistic\\App\\Durdona\\M-2 Diagnostic Value\\Durdona\\8',
        ],
        true
    ),
    cfg('Excel Protect Worksheets Ask', 'Excels', 'protectSheetAsk', ['--file', X]),
    cfg('Excel Unprotect Worksheets Ask', 'Excels', 'unProtectSheetAsk', ['--file', X]),
    cfg('Excel Protect File Ask', 'Excels', 'protectFileAsk', ['--file', X]),
    cfg('Excel Unprotect File Ask', 'Excels', 'unProtectFileAsk', ['--file', X]),
    cfg('Excel Hide Protect Sheet Ask', 'Excels', 'hideProtectSheetAsk', ['--file', X]),
    cfg('Excel Unhide Unprotect Sheet Ask', 'Excels', 'unHideUnProtectSheetAsk', ['--file', X]),
    cfg(
        'Excel Merge Folders',
        'Excels',
        'mergeFolder',
        ['d:\\path\\to\\folderA', 'd:\\path\\to\\folderB'],
        true
    ),
    cfg(
        'PowerPoint Merge Files',
        'PowerPoints',
        'merge',
        ['d:\\path\\to\\a.pptx', 'd:\\path\\to\\b.pptx'],
        true
    ),
    cfg(
        'PowerPoint Merge Folders',
        'PowerPoints',
        'mergeFolder',
        ['d:\\path\\to\\folderA', 'd:\\path\\to\\folderB'],
        true
    ),
    cfg('Word Homoglyph All Chars', 'Homoglyph', 'word', [
        '--file',
        'd:\\Humans\\Languag\\ReWrite\\App\\Disser\\Article 4\\Article 4.docx',
    ]),
    cfg('Word Homoglyph Ask', 'Homoglyph', 'wordAsk', [
        '--file',
        'd:\\Humans\\Languag\\ReWrite\\App\\Disser\\Article 4\\Article 4.docx',
    ]),
    cfg('MD Homoglyph All Chars', 'Homoglyph', 'markdown', [
        '--file',
        'd:\\Humans\\Languag\\ReWrite\\App\\POCD\\POCD_maqola 3.md',
    ]),
    cfg('MD Homoglyph Ask', 'Homoglyph', 'markdownAsk', [
        '--file',
        'd:\\Humans\\Languag\\ReWrite\\App\\POCD\\POCD_maqola 3.md',
    ]),
    cfg('MD Merge Files', 'Markdown', 'merge', [
        'd:\\Humans\\Medicine\\Disserta\\Statistic\\App\\Durdona\\AI\\Diagnose\\Diagnose Electroencephalography EEG 5.md',
        'd:\\Humans\\Medicine\\Disserta\\Statistic\\App\\Durdona\\AI\\Diagnose\\Diagnose Luria s Memory Word Test LMWT 5.md',
    ]),
    raw('AI Rename by Content', 'ai-rename.js', [
        'd:\\path\\to\\file1.md',
        'd:\\path\\to\\file2.md',
        '--effort',
        'max',
    ]),
    raw('Gemini Rename by Content', 'ai-rename-gemini.js', [
        'd:\\path\\to\\file1.md',
        'd:\\path\\to\\file2.md',
        '--level',
        '4',
    ]),
    cfg('Excel Homoglyph All Chars', 'Homoglyph', 'excel', ['--file', 'd:\\path\\to\\test.xlsx']),
    cfg('Excel Homoglyph Ask', 'Homoglyph', 'excelAsk', ['--file', 'd:\\path\\to\\test.xlsx']),
    cfg('PPT Homoglyph All Chars', 'Homoglyph', 'powerpoint', [
        '--file',
        'd:\\path\\to\\test.pptx',
    ]),
    cfg('PPT Homoglyph Ask', 'Homoglyph', 'powerpointAsk', ['--file', 'd:\\path\\to\\test.pptx']),
    cfg('Word Protect File Ask', 'Word', 'protectFileAsk', ['--file', 'd:\\path\\to\\test.docx']),
    cfg('Word Unprotect File Ask', 'Word', 'unProtectFileAsk', [
        '--file',
        'd:\\path\\to\\test.docx',
    ]),
    cfg('PPT Protect File Ask', 'PowerPoints', 'protectFileAsk', [
        '--file',
        'd:\\path\\to\\test.pptx',
    ]),
    cfg('PPT Unprotect File Ask', 'PowerPoints', 'unProtectFileAsk', [
        '--file',
        'd:\\path\\to\\test.pptx',
    ]),
    raw('Export Chat to .claude', 'chat-export.js', []),
    cfg('Registry Clean (PATH)', 'Registry', 'clean', ['--hives', 'Both']),

    // ── Contract presets — 2 examples PER COMMAND (single --yaml + batch --all),
    //    NOT one per firm. Any firm just swaps the path.
    cfg('Contract Fill Yaml (single)', 'Yamls', 'contractFill', ['--yaml', 'd:\\FSystem\\ALL\\Humans\\Rentalls\\External\\AL-INOBAT\\ALL.contract']),
    cfg('Contract Fill Yaml (batch --all)', 'Yamls', 'contractFill', ['--all', 'd:\\FSystem\\ALL\\Humans\\Rentalls\\AnvarIkr\\ALL.contractall']),
    cfg('Contract Update Yaml (single)', 'Yamls', 'contractUpdate', ['--yaml', 'd:\\FSystem\\ALL\\Humans\\Rentalls\\External\\RASH-PHARMA\\ALL.contract']),
    cfg('Contract Update Yaml (batch --all)', 'Yamls', 'contractUpdate', ['--all', 'd:\\FSystem\\ALL\\Humans\\Rentalls\\AnvarIkr\\ALL.contractall']),
    cfg('Contract → Word (single)', 'Word', 'contract', ['--yaml', 'd:\\FSystem\\ALL\\Humans\\Rentalls\\AnvarIkr\\ZOKIROV CONSTRUCTION\\ALL.contract']),
    cfg('Contract → Word (batch --all)', 'Word', 'contract', ['--all', 'd:\\FSystem\\ALL\\Humans\\Rentalls\\AnvarIkr\\ALL.contractall']),
    cfg('Contract → Excel (single)', 'Excels', 'contract', ['--yaml', 'd:\\FSystem\\ALL\\Humans\\Rentalls\\External\\RASH-PHARMA\\ALL.contract']),
    cfg('Contract → Excel (batch --all)', 'Excels', 'contract', ['--all', 'd:\\FSystem\\ALL\\Humans\\Rentalls\\AnvarIkr\\ALL.contractall']),
    cfg('Contract Convert (explicit output)', 'Excels', 'contractConvert', ['--input', 'd:\\Humans\\Building\\Rentalls\\ActReco\\Projects\\Act 90.xltx', '--output', 'd:\\Humans\\Building\\Rentalls\\ActReco\\Projects\\Act 90.xlsx']),
    cfg('Contract Convert (auto output)', 'Excels', 'contractConvert', ['--input', 'd:\\Humans\\Building\\Rentalls\\ActReco\\Projects\\Act 90.xltx']),

    // ── OLX scrape presets — 2 examples PER COMMAND (two different data sources),
    //    NOT one per firm. Any project just swaps the --app path.
    ...[
        ['appOne', 'App One'], ['appTwo', 'App Two'], ['appThree', 'App Three'],
        ['offers', 'Offers'], ['pages', 'Pages'], ['phone', 'Phone'],
        ['finder', 'Finder'], ['merge', 'Merge'], ['checker', 'Checker'], ['testing', 'Testing'],
    ].flatMap(([m, label]) => [
        cfg(`OLX ${label} (LED)`, 'Olx', m, ['--app', 'd:\\Develop\\Utilities\\Scraper\\Projects\\olx.uz JS\\Projects\\LED\\ALL.olxapp']),
        cfg(`OLX ${label} (Osmos)`, 'Olx', m, ['--app', 'd:\\Humans\\Equipme\\Equipme\\Watering\\Обратный осмос\\ALL.olxapp']),
    ]),
];

const header = `{
  // Use IntelliSense to learn about possible attributes.
  // Hover to view descriptions of existing attributes.
  // For more information, visit: https://go.microsoft.com/fwlink/?linkid=830387
  "version": "0.2.0",
  "configurations": `;

const body = JSON.stringify(configurations, null, 2)
    .split('\n')
    .map((l, i) => (i === 0 ? l : '  ' + l))
    .join('\n');

writeFileSync(path.join(ROOT, '.vscode', 'launch.json'), header + body + '\n}\n', 'utf8');
console.log(`✅ wrote .vscode/launch.json with ${configurations.length} configurations`);
