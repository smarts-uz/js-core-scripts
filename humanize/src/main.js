const { invoke } = window.__TAURI__.core;
const { open } = window.__TAURI__.dialog;
const { listen } = window.__TAURI__.event;

let pickedFilePath = null;
let lastOutputPath = null;

function showApp() {
    document.querySelector('#login-screen').style.display = 'none';
    document.querySelector('#app').style.display = 'flex';
    applyLaunchFileIfAny();
}

// When the app was launched with a file path on the command line (a
// right-click "Open with Humanize" Explorer verb, or `app.exe "<path>"`
// directly), pre-fill it as the picked file once the user reaches the main
// screen — so they aren't asked to choose it again after signing in.
async function applyLaunchFileIfAny() {
    const launchPath = await invoke('get_launch_file_path');
    if (launchPath) {
        pickedFilePath = launchPath;
        document.querySelector('#picked-file').textContent = launchPath;
    }
}

function showLogin(message) {
    document.querySelector('#login-screen').style.display = 'flex';
    document.querySelector('#app').style.display = 'none';
    document.querySelector('#login-error').textContent = message || '';
    document.querySelector('#login-warning-card').style.display = 'none';
}

// The Rust side returns a STRUCTURED error (auth::LoginError, tagged by
// "kind") rather than a plain string, so a wrong-machine rejection can be
// told apart from a wrong-password rejection and rendered as its own
// warning card naming the bound machine.
function showWrongDeviceWarning(boundDeviceName) {
    document.querySelector('#login-error').textContent = '';
    const card = document.querySelector('#login-warning-card');
    const nameEl = document.querySelector('#login-warning-device-name');
    nameEl.textContent = boundDeviceName || 'an unknown PC';
    card.style.display = 'block';
}

async function onLogin() {
    const email = document.querySelector('#login-email').value.trim();
    const password = document.querySelector('#login-password').value;
    const errorEl = document.querySelector('#login-error');
    const warningCard = document.querySelector('#login-warning-card');
    const loginBtn = document.querySelector('#login-btn');

    warningCard.style.display = 'none';
    if (!email || !password) {
        errorEl.textContent = 'Enter both email and password.';
        return;
    }

    loginBtn.disabled = true;
    errorEl.textContent = 'Signing in…';
    try {
        await invoke('login', { email, password });
        document.querySelector('#login-password').value = '';
        errorEl.textContent = '';
        showApp();
    } catch (err) {
        if (err && err.kind === 'WrongDevice') {
            showWrongDeviceWarning(err.bound_device_name);
        } else if (err && err.kind === 'InvalidCredentials') {
            errorEl.textContent = err.message;
        } else {
            // Fallback for a non-structured error (e.g. a Rust panic message).
            errorEl.textContent = typeof err === 'string' ? err : JSON.stringify(err);
        }
    } finally {
        loginBtn.disabled = false;
    }
}

async function onLogout() {
    try {
        await invoke('logout');
    } catch {
        // Non-fatal — the login screen is shown regardless.
    }
    showLogin('');
}

// A repeat launch on the SAME machine skips the login screen if a session
// was already stored (see auth.rs::has_stored_session) — it does not
// re-validate the token against Supabase; a later 401 from any command
// would need to send the user back to login, but none of this app's
// current commands (run_homoglyph, reveal_in_explorer, …) call Supabase
// themselves, so that path does not arise yet.
async function bootstrapSession() {
    const hasSession = await invoke('has_stored_session');
    if (hasSession) {
        showApp();
    } else {
        showLogin('');
    }
}

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
        filters: [
            {
                name: 'All supported files',
                extensions: ['docx', 'doc', 'xlsx', 'xlsm', 'xls', 'pptx', 'ppt', 'md', 'txt'],
            },
            { name: 'Word Document', extensions: ['docx', 'doc'] },
            { name: 'Excel Workbook', extensions: ['xlsx', 'xlsm', 'xls'] },
            { name: 'PowerPoint Presentation', extensions: ['pptx', 'ppt'] },
            { name: 'Markdown / Text', extensions: ['md', 'txt'] },
        ],
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
    bootstrapSession();
    loadCheckboxGrid();
    document.querySelector('#login-btn').addEventListener('click', onLogin);
    document.querySelector('#login-password').addEventListener('keydown', (e) => {
        if (e.key === 'Enter') onLogin();
    });
    document.querySelector('#logout-btn').addEventListener('click', onLogout);
    document.querySelector('#pick-file-btn').addEventListener('click', pickFile);
    document.querySelector('#ok-btn').addEventListener('click', onOk);
    document.querySelector('#cancel-btn').addEventListener('click', onCancel);
    document.querySelector('#open-explorer-btn').addEventListener('click', onOpenExplorer);
    document.querySelector('#open-default-app-btn').addEventListener('click', onOpenDefaultApp);
});
