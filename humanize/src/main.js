const { invoke } = window.__TAURI__.core;
const { open } = window.__TAURI__.dialog;

let pickedFilePath = null;

async function loadCheckboxGrid() {
    const chars = await invoke('list_homoglyph_chars');
    const container = document.querySelector('#checkbox-list');
    container.innerHTML = '';
    for (const ch of chars) {
        const label = document.createElement('label');
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
    if (!pickedFilePath) {
        resultMsg.textContent = 'Pick a file first.';
        return;
    }
    const chars = getCheckedChars();
    resultMsg.textContent = 'Running…';
    try {
        const outputPath = await invoke('run_homoglyph', { filePath: pickedFilePath, chars });
        resultMsg.textContent = `Saved: ${outputPath}`;
    } catch (err) {
        resultMsg.textContent = `Error: ${err}`;
    }
}

function onCancel() {
    pickedFilePath = null;
    document.querySelector('#picked-file').textContent = '';
    document.querySelector('#result-msg').textContent = '';
}

window.addEventListener('DOMContentLoaded', () => {
    loadCheckboxGrid();
    document.querySelector('#pick-file-btn').addEventListener('click', pickFile);
    document.querySelector('#ok-btn').addEventListener('click', onOk);
    document.querySelector('#cancel-btn').addEventListener('click', onCancel);
});
