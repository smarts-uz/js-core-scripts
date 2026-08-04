const { invoke } = window.__TAURI__.core;
const { open } = window.__TAURI__.dialog;
const { listen } = window.__TAURI__.event;

let pickedFilePath = null;
let lastOutputPath = null;

// Cyrillic look-alikes render visually identical to their Latin counterpart
// (that's the whole point of a "perfect stealth" homoglyph) — so the diff
// list shows each character's Unicode codepoint too, otherwise "A → A" reads
// as a no-op even though a real Latin U+0041 became Cyrillic U+0410.
function codepoint(ch) {
    return 'U+' + ch.codePointAt(0).toString(16).toUpperCase().padStart(4, '0');
}

// Live diff + progress bar, driven by the Rust side's "homoglyph-progress"
// event — one event per character pair, fired while the COM replace loop
// is actually running (see src-tauri/src/homoglyph.rs's on_progress hook).
listen('homoglyph-progress', (event) => {
    const { index, total, latin, cyrillic, found } = event.payload;
    const bar = document.querySelector('#progress-bar');
    const label = document.querySelector('#progress-label');
    bar.max = total;
    bar.value = index;
    label.textContent = `${index} / ${total}`;

    const diffList = document.querySelector('#diff-list');
    const item = document.createElement('li');
    item.className = found ? 'diff-item diff-found' : 'diff-item diff-not-found';
    item.innerHTML = `
        <span class="diff-char diff-before">${latin} <small>${codepoint(latin)}</small></span>
        <span class="diff-arrow">→</span>
        <span class="diff-char diff-after">${cyrillic} <small>${codepoint(cyrillic)}</small></span>
        <span class="diff-status">${found ? 'replaced' : 'not found'}</span>
    `;
    diffList.appendChild(item);
    diffList.scrollTop = diffList.scrollHeight;
});

async function loadCheckboxGrid() {
    const chars = await invoke('list_homoglyph_chars');
    const container = document.querySelector('#checkbox-list');
    container.innerHTML = '';
    for (const ch of chars) {
        const label = document.createElement('label');
        label.className = 'checkbox-item';
        const checkbox = document.createElement('input');
        checkbox.type = 'checkbox';
        checkbox.value = ch;
        checkbox.checked = true; // all-checked default, per the checkbox-grid convention
        checkbox.dataset.char = ch;
        label.appendChild(checkbox);
        label.appendChild(document.createTextNode(ch));
        container.appendChild(label);
    }
}

async function pickFile() {
    const selected = await open({
        multiple: false,
        filters: [{ name: 'Word Document', extensions: ['docx'] }],
    });
    if (selected) {
        pickedFilePath = selected;
        document.querySelector('#picked-file').textContent = selected;
    }
}

function getCheckedChars() {
    const checked = document.querySelectorAll('#checkbox-list input[type=checkbox]:checked');
    return Array.from(checked)
        .map((el) => el.dataset.char)
        .join('');
}

async function onOk() {
    const resultMsg = document.querySelector('#result-msg');
    const resultBlock = document.querySelector('#result-block');
    const resultPath = document.querySelector('#result-path');
    const progressCard = document.querySelector('#progress-card');
    const progressBar = document.querySelector('#progress-bar');
    const progressLabel = document.querySelector('#progress-label');
    const diffList = document.querySelector('#diff-list');

    resultBlock.style.display = 'none';
    resultPath.textContent = '';
    if (!pickedFilePath) {
        progressCard.style.display = 'block';
        resultMsg.textContent = 'Pick a file first.';
        diffList.innerHTML = '';
        progressBar.value = 0;
        progressLabel.textContent = '';
        return;
    }
    const chars = getCheckedChars();

    // Reset progress + diff for this run.
    diffList.innerHTML = '';
    progressBar.value = 0;
    progressLabel.textContent = `0 / ${chars.length}`;
    resultMsg.textContent = 'Running…';
    progressCard.style.display = 'block';

    try {
        const outputPath = await invoke('run_homoglyph', { filePath: pickedFilePath, chars });
        lastOutputPath = outputPath;
        resultMsg.textContent = 'Replace finished.';
        resultPath.textContent = outputPath;
        resultBlock.style.display = 'flex';
    } catch (err) {
        resultMsg.textContent = `Error: ${err}`;
    }
}

async function onOpenExplorer() {
    if (!lastOutputPath) return;
    try {
        await invoke('reveal_in_explorer', { filePath: lastOutputPath });
    } catch (err) {
        document.querySelector('#result-msg').textContent = `Error opening Explorer: ${err}`;
    }
}

async function onOpenDefaultApp() {
    if (!lastOutputPath) return;
    try {
        await invoke('open_in_default_app', { filePath: lastOutputPath });
    } catch (err) {
        document.querySelector('#result-msg').textContent = `Error opening file: ${err}`;
    }
}

function onCancel() {
    pickedFilePath = null;
    lastOutputPath = null;
    document.querySelector('#picked-file').textContent = 'No file selected';
    document.querySelector('#result-msg').textContent = '';
    document.querySelector('#result-block').style.display = 'none';
    document.querySelector('#result-path').textContent = '';
    document.querySelector('#progress-card').style.display = 'none';
    document.querySelector('#diff-list').innerHTML = '';
    document.querySelectorAll('#checkbox-list input[type=checkbox]').forEach((el) => {
        el.checked = true;
    });
}

window.addEventListener('DOMContentLoaded', () => {
    loadCheckboxGrid();
    document.querySelector('#pick-file-btn').addEventListener('click', pickFile);
    document.querySelector('#ok-btn').addEventListener('click', onOk);
    document.querySelector('#cancel-btn').addEventListener('click', onCancel);
    document.querySelector('#open-explorer-btn').addEventListener('click', onOpenExplorer);
    document.querySelector('#open-default-app-btn').addEventListener('click', onOpenDefaultApp);
});
