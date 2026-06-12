import { execSync } from 'child_process';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import pino from 'pino';

export class Logs {
    constructor() {
        // Reuse the singleton if console was already wrapped.
        if (global.__utils_instance__) {
            return global.__utils_instance__;
        }
        global.__utils_instance__ = this;

        // Logs folder lives in the parent of utils/. fileURLToPath fixes the old
        // __dirname usage, which is undefined under ESM ("type": "module") and threw.
        const logsDir = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'logs');
        fs.mkdirSync(logsDir, { recursive: true });

        // pino + pino-roll give structured logs with daily rotation and a 7-file
        // retention limit — the maintained replacement for the stale (and not even
        // installed) bunyan + bunyan-rotating-file-stream stack.
        let fileLogger = null;
        try {
            fileLogger = pino(
                { name: 'core', level: 'info' },
                pino.transport({
                    target: 'pino-roll',
                    options: {
                        file: path.join(logsDir, 'app'),
                        frequency: 'daily',
                        mkdir: true,
                        limit: { count: 7 },
                    },
                })
            );
        } catch (err) {
            // Logging is best-effort — never let logger setup break the app.
            global.console.error('Logs: pino setup failed, file logging disabled:', err.message);
        }

        // Override the individual console methods (instead of replacing the whole
        // console object) so terminal output is preserved AND every call is also
        // written to the rotating log file. The previous bunyan logger had no
        // `.log` method, which would have broken every console.log in the codebase.
        const orig = {
            log: console.log.bind(console),
            info: console.info.bind(console),
            debug: console.debug.bind(console),
            warn: console.warn.bind(console),
            error: console.error.bind(console),
        };
        const toMsg = (args) => args
            .map((a) => (typeof a === 'string' ? a : (() => { try { return JSON.stringify(a); } catch { return String(a); } })()))
            .join(' ');
        const wrap = (origFn, level) => (...args) => {
            origFn(...args);
            if (fileLogger) { try { fileLogger[level](toMsg(args)); } catch { /* ignore logging errors */ } }
        };
        console.log = wrap(orig.log, 'info');
        console.info = wrap(orig.info, 'info');
        console.debug = wrap(orig.debug, 'debug');
        console.warn = wrap(orig.warn, 'warn');
        console.error = wrap(orig.error, 'error');
    }

    async showMessageBox(message, title = 'Error') {
    console.info(`[Logs.showMessageBox] 🟢 Starting...`);
        try {
            const safeMsg = message.replace(/"/g, "'");
            execSync(`msg * "${title}: ${safeMsg}"`);
        } catch (err) {
            console.error('⚠️ Failed to show message box:', err.message);
        }
    }



    cleanPath(p) {
    console.info(`[Logs.cleanPath] 🟢 Starting...`);
        return p.replace(/\\\\+/g, "\\").replace(/\\/g, "/");
    }
}
