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

    // ── Contract workflow (shell-out runners → cmd/js-winax-contract) ──────────
    cfg('Contract → Word', 'Word', 'contract', ['--yaml', 'd:\\path\\to\\contract.yml']),
    cfg('Contract → Excel', 'Excels', 'contract', ['--yaml', 'd:\\path\\to\\contract.yml']),
    cfg('Contract Convert (.xltx→.xlsx)', 'Excels', 'contractConvert', [
        '--input',
        'd:\\path\\to\\template.xltx',
    ]),
    cfg('Contract Fill Yaml', 'Yamls', 'contractFill', ['--yaml', 'd:\\path\\to\\contract.yml']),
    cfg('Contract Update Yaml', 'Yamls', 'contractUpdate', ['--yaml', 'd:\\path\\to\\contract.yml']),

    // ── OLX scraper pipeline (shell-out runners → cmd/js-scraper-olx.uz) ───────
    cfg('OLX App One', 'Olx', 'appOne', ['--app', 'd:\\path\\to\\data.mhtml']),
    cfg('OLX App Two', 'Olx', 'appTwo', ['--app', 'd:\\path\\to\\data.mhtml']),
    cfg('OLX App Three', 'Olx', 'appThree', ['--app', 'd:\\path\\to\\data.mhtml']),
    cfg('OLX Offers', 'Olx', 'offers', ['--app', 'd:\\path\\to\\data.mhtml']),
    cfg('OLX Pages', 'Olx', 'pages', ['--app', 'd:\\path\\to\\data.mhtml']),
    cfg('OLX Phone', 'Olx', 'phone', ['--app', 'd:\\path\\to\\data.mhtml']),
    cfg('OLX Finder', 'Olx', 'finder', ['--app', 'd:\\path\\to\\data.mhtml']),
    cfg('OLX Merge', 'Olx', 'merge', ['--app', 'd:\\path\\to\\data.mhtml']),
    cfg('OLX Checker', 'Olx', 'checker', ['--app', 'd:\\path\\to\\data.mhtml']),
    cfg('OLX Testing', 'Olx', 'testing', ['--app', 'd:\\path\\to\\data.mhtml']),

    // ── Merged named contract presets (was .vscode/launch contract.json) ───────
    // Repointed from the old flat cmd/*.js programs to the runs/ shell-out runners.
    cfg('Contract yamls zokirov', 'Yamls', 'contractFill', ['--yaml', 'd:\\FSystem\\ALL\\Humans\\Rentalls\\External\\AL-INOBAT\\ALL.contract']),
    cfg('Contract yamls ALL', 'Yamls', 'contractFill', ['--all', 'd:\\FSystem\\ALL\\Humans\\Rentalls\\AnvarIkr\\ALL.contractall']),
    cfg('Contract yamls ALL Saodat', 'Yamls', 'contractFill', ['--all', 'd:\\FSystem\\ALL\\Humans\\Rentalls\\Saodats\\ALL.contractall']),
    cfg('Contract yamls MuhimQurilish', 'Yamls', 'contractFill', ['--yaml', 'd:\\FSystem\\ALL\\Humans\\Rentalls\\External\\STROYBRO\\ALL.contract']),
    cfg('Contract yamls STROYBRO', 'Yamls', 'contractFill', ['--yaml', 'd:\\FSystem\\ALL\\Humans\\Rentalls\\External\\STROYBRO\\ALL.contract']),
    cfg('Contract yamls MEDIA', 'Yamls', 'contractFill', ['--yaml', 'd:\\FSystem\\ALL\\Humans\\Rentalls\\External\\MEDIA ILLUSION\\ALL.contract']),
    cfg('Contract yamls umtc', 'Yamls', 'contractFill', ['--yaml', 'd:\\FSystem\\ALL\\Humans\\Rentalls\\Saodats\\UMTC\\ALL.contract']),
    cfg('Contract yamls NIKITIN', 'Yamls', 'contractFill', ['--yaml', 'd:\\FSystem\\ALL\\Humans\\Rentalls\\JMR uz2b\\YaTT NIKITIN ALEKSEY\\ALL.contract']),
    cfg('Contract yamls KO’MIR', 'Yamls', 'contractFill', ['--yaml', 'd:\\FSystem\\ALL\\Humans\\Rentalls\\Perfects\\ZHONGWU HENHE KOMIR\\ALL.contract']),
    cfg('Contract update ALL AnvarIkr', 'Yamls', 'contractUpdate', ['--all', 'd:\\FSystem\\ALL\\Humans\\Rentalls\\AnvarIkr\\ALL.contractall']),
    cfg('Contract update LH CROSS BORDER', 'Yamls', 'contractUpdate', ['--yaml', 'd:\\FSystem\\ALL\\Humans\\Rentalls\\Perfects\\LH CROSS BORDER TRANSPORTATION\\ALL.contract']),
    cfg('Contract update RASH', 'Yamls', 'contractUpdate', ['--yaml', 'd:\\FSystem\\ALL\\Humans\\Rentalls\\External\\RASH-PHARMA\\ALL.contract']),
    cfg('Contract words ZOKIROV', 'Word', 'contract', ['--yaml', 'd:\\FSystem\\ALL\\Humans\\Rentalls\\AnvarIkr\\ZOKIROV CONSTRUCTION\\ALL.contract']),
    cfg('Contract words COLONIUM', 'Word', 'contract', ['--yaml', 'd:\\FSystem\\ALL\\Humans\\Rentalls\\Founder\\THE COLONIUM\\ALL.contract']),
    cfg('Contract words ALL AnvarIkr', 'Word', 'contract', ['--all', 'd:\\FSystem\\ALL\\Humans\\Rentalls\\AnvarIkr\\ALL.contractall']),
    cfg('Contract words ALL Saodat', 'Word', 'contract', ['--all', 'd:\\FSystem\\ALL\\Humans\\Rentalls\\Saodats\\ALL.contractall']),
    cfg('Contract excels HUA YAN GUO', 'Excels', 'contract', ['--yaml', 'd:\\FSystem\\ALL\\Humans\\Rentalls\\ErdunShi\\HUA YAN GUO JI TOU ZI FA ZHAN\\ALL.contract']),
    cfg('Contract excels LH CROSS BORDER', 'Excels', 'contract', ['--yaml', 'd:\\FSystem\\ALL\\Humans\\Rentalls\\Perfects\\LH CROSS BORDER TRANSPORTATION\\ALL.contract']),
    cfg('Contract excels ASHALIFE', 'Excels', 'contract', ['--yaml', 'd:\\FSystem\\ALL\\Humans\\Rentalls\\Perfects\\ASHALIFE PHARMA\\ALL.contract']),
    cfg('Contract excels RASH', 'Excels', 'contract', ['--yaml', 'd:\\FSystem\\ALL\\Humans\\Rentalls\\External\\RASH-PHARMA\\ALL.contract']),
    cfg('Contract excels ISTS', 'Excels', 'contract', ['--yaml', 'd:\\FSystem\\ALL\\Humans\\Rentalls\\External\\ISTS\\ALL.contract']),
    cfg('Contract excels AET', 'Excels', 'contract', ['--yaml', 'd:\\FSystem\\ALL\\Humans\\Rentalls\\ErdunShi\\AETHERIS\\ALL.contract']),
    cfg('Contract excels ALL', 'Excels', 'contract', ['--all', 'd:\\FSystem\\ALL\\Humans\\Rentalls\\AnvarIkr\\ALL.contractall']),
    cfg('Contract excel-convert (explicit)', 'Excels', 'contractConvert', ['--input', 'd:\\Humans\\Building\\Rentalls\\ActReco\\Projects\\Act 90.xltx', '--output', 'd:\\Humans\\Building\\Rentalls\\ActReco\\Projects\\Act 90.xlsx']),
    cfg('Contract excel-convert (auto)', 'Excels', 'contractConvert', ['--input', 'd:\\Humans\\Building\\Rentalls\\ActReco\\Projects\\Act 90.xltx']),

    // ── Merged named OLX scrape presets (was .vscode/launch scrape.json) ───────
    cfg('OLX App One LED', 'Olx', 'appOne', ['--app', 'd:\\Develop\\Utilities\\Scraper\\Projects\\olx.uz JS\\Projects\\LED\\ALL.olxapp']),
    cfg('OLX App Two LED', 'Olx', 'appTwo', ['--app', 'd:\\Develop\\Utilities\\Scraper\\Projects\\olx.uz JS\\Projects\\LED\\ALL.olxapp']),
    cfg('OLX App Two Osmos', 'Olx', 'appTwo', ['--app', 'd:\\Humans\\Equipme\\Equipme\\Watering\\Обратный осмос\\ALL.olxapp']),
    cfg('OLX pages LED', 'Olx', 'pages', ['--app', 'd:\\Develop\\Utilities\\Scraper\\Projects\\olx.uz JS\\Projects\\LED\\ALL.olxapp']),
    cfg('OLX offers LED', 'Olx', 'offers', ['--app', 'd:\\Develop\\Utilities\\Scraper\\Projects\\olx.uz JS\\Projects\\LED\\ALL.olxapp']),
    cfg('OLX finder LED', 'Olx', 'finder', ['--app', 'd:\\Develop\\Utilities\\Scraper\\Projects\\olx.uz JS\\Projects\\LED\\ALL.olxapp']),
    cfg('OLX phone LED', 'Olx', 'phone', ['--app', 'd:\\Develop\\Utilities\\Scraper\\Projects\\olx.uz JS\\Projects\\LED\\ALL.olxapp']),
    cfg('OLX merge LED', 'Olx', 'merge', ['--app', 'd:\\Develop\\Utilities\\Scraper\\Projects\\olx.uz JS\\Projects\\LED\\ALL.olxapp']),
    cfg('OLX Testing LED', 'Olx', 'testing', ['--app', 'd:\\Develop\\Utilities\\Scraper\\Projects\\olx.uz JS\\Projects\\LED\\ALL.olxapp']),
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
