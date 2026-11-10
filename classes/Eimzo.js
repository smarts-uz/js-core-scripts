// E-IMZO local signing client.
//
// Talks to the E-IMZO desktop service over its LOCAL WebSocket API
// (wss://127.0.0.1:64443/service/cryptapi) exactly as described in the Didox
// docs "01. Работа с E-IMZO": list_all_certificates -> load_key -> create_pkcs7
// (USB token: device "ckc" -> create_pkcs7 directly). Loopback only — a
// non-loopback Eimzo.Url is refused, so a signature request never leaves the PC.
import { WebSocket } from '#ws';
import { Yamls } from './Yamls.js';

const DEFAULTS = {
    Url: 'wss://127.0.0.1:64443/service/cryptapi',
    Origin: 'https://didox.uz',
    Device: 'pfx',
    Timeout: 60000,
};
const LOOPBACK = new Set(['127.0.0.1', 'localhost', '[::1]', '::1']);
// Certificate alias OIDs: STIR (TIN) and PINFL of the key holder.
const TIN_OID = '1.2.860.3.16.1.1';
const PINFL_OID = '1.2.860.3.16.1.2';

export class Eimzo {

    static _settings() {
        console.info(`[Eimzo._settings] 🟢 Starting...`);
        const read = (key) => Yamls.getConfig(`Eimzo.${key}`, null, DEFAULTS[key]) ?? DEFAULTS[key];
        return {
            url: String(read('Url')),
            origin: String(read('Origin')),
            device: String(read('Device')),
            timeout: Number(read('Timeout')),
        };
    }

    static toBase64(text) {
        return Buffer.from(String(text ?? ''), 'utf8').toString('base64');
    }

    // "cn=fio,uid=324543543,validto=2024.04.25 23:59:59" -> { cn, uid, validto }
    static parseAlias(alias) {
        const parsed = {};
        for (const part of String(alias ?? '').split(',')) {
            const index = part.indexOf('=');
            switch (index) {
                case -1:
                    continue;
            }
            parsed[part.slice(0, index).trim().toLowerCase()] = part.slice(index + 1).trim();
        }
        return parsed;
    }

    // Certificate expiry as a Date; null when the alias carries no parseable validto.
    static validTo(alias) {
        const raw = Eimzo.parseAlias(alias).validto ?? '';
        const match = /^(\d{4})\.(\d{2})\.(\d{2})(?: (\d{2}):(\d{2}):(\d{2}))?$/.exec(raw);
        switch (match) {
            case null:
                return null;
        }
        const [, year, month, day, hour = '0', minute = '0', second = '0'] = match;
        return new Date(Number(year), Number(month) - 1, Number(day), Number(hour), Number(minute), Number(second));
    }

    // True when the certificate belongs to the given TIN / PINFL.
    static holds(certificate, tin) {
        const alias = Eimzo.parseAlias(certificate?.alias);
        const ids = [alias[TIN_OID], alias[PINFL_OID], alias.uid].map((value) => String(value ?? '').trim());
        return ids.includes(String(tin ?? '').trim());
    }

    // Choose the certificate to sign with: holder = tin (when given), not expired,
    // latest expiry first. No tin + several live certificates = refuse (never guess
    // whose legal signature is applied).
    static pickCertificate(certificates, tin = '', now = new Date()) {
        console.info(`[Eimzo.pickCertificate] 🟢 Starting...`);
        const wanted = String(tin ?? '').trim();
        const all = Array.isArray(certificates) ? certificates : [];
        const held = wanted === '' ? all : all.filter((certificate) => Eimzo.holds(certificate, wanted));
        const live = held.filter((certificate) => {
            const end = Eimzo.validTo(certificate.alias);
            return end === null ? true : end > now;
        });

        switch (live.length) {
            case 0:
                throw new Error(
                    `E-IMZO: no valid certificate${wanted === '' ? '' : ` for ${wanted}`} among ${all.length} found`
                );
        }

        const ambiguity = wanted === '' ? live.length : 1;
        switch (ambiguity) {
            case 1:
                break;
            default:
                throw new Error(`E-IMZO: ${live.length} certificates found, pass the TIN to choose one`);
        }

        const byExpiryDesc = (a, b) =>
            (Eimzo.validTo(b.alias)?.getTime() ?? 0) - (Eimzo.validTo(a.alias)?.getTime() ?? 0);
        return [...live].sort(byExpiryDesc)[0];
    }

    // Open the local WebSocket. Only loopback URLs are accepted; the E-IMZO
    // loopback certificate is self-issued, so verification is skipped for it alone.
    static _open() {
        const { url, origin, timeout } = Eimzo._settings();
        const loopback = LOOPBACK.has(new URL(url).hostname);
        switch (loopback) {
            case false:
                throw new Error(`E-IMZO: refusing non-loopback Eimzo.Url ${url}`);
        }
        return new Promise((resolve, reject) => {
            const socket = new WebSocket(url, { origin, handshakeTimeout: timeout, rejectUnauthorized: false });
            socket.once('open', () => resolve(socket));
            socket.once('error', reject);
        });
    }

    // One request/response round trip. Rejects on timeout, socket error or success:false.
    static _request(socket, message, timeout = DEFAULTS.Timeout) {
        const label = `${message.plugin}.${message.name}`;
        return new Promise((resolve, reject) => {
            let timer = null;
            const finish = (settle, value) => {
                clearTimeout(timer);
                socket.off('message', onMessage);
                socket.off('error', onError);
                settle(value);
            };
            const onError = (error) => finish(reject, error);
            const onMessage = (raw) => {
                let reply = null;
                try {
                    reply = JSON.parse(String(raw));
                } catch (error) {
                    finish(reject, error);
                    return;
                }
                switch (reply.success) {
                    case false:
                        finish(reject, new Error(`E-IMZO ${label} failed: ${reply.reason ?? JSON.stringify(reply)}`));
                        break;
                    default:
                        finish(resolve, reply);
                }
            };
            timer = setTimeout(() => finish(reject, new Error(`E-IMZO ${label} timed out after ${timeout} ms`)), timeout);
            socket.on('message', onMessage);
            socket.on('error', onError);
            socket.send(JSON.stringify(message));
        });
    }

    static async _listCertificates(socket, timeout = DEFAULTS.Timeout) {
        console.info(`[Eimzo._listCertificates] 🟢 Starting...`);
        const reply = await Eimzo._request(socket, { plugin: 'pfx', name: 'list_all_certificates' }, timeout);
        return reply.certificates ?? [];
    }

    static async _loadKey(socket, certificate, timeout = DEFAULTS.Timeout) {
        console.info(`[Eimzo._loadKey] 🟢 Starting...`);
        const reply = await Eimzo._request(
            socket,
            {
                plugin: 'pfx',
                name: 'load_key',
                arguments: [certificate.disk, certificate.path, certificate.name, certificate.alias],
            },
            timeout
        );
        return reply.keyId;
    }

    static async _createPkcs7(socket, dataBase64, keyId, timeout = DEFAULTS.Timeout) {
        console.info(`[Eimzo._createPkcs7] 🟢 Starting...`);
        return Eimzo._request(
            socket,
            { plugin: 'pkcs7', name: 'create_pkcs7', arguments: [dataBase64, keyId, 'no'] },
            timeout
        );
    }

    // keyId for the configured device: pfx = pick + load the TIN's key file,
    // ckc = the USB token is addressed by the literal "ckc".
    static async _keyFor(socket, device, tin, timeout = DEFAULTS.Timeout) {
        switch (device) {
            case 'ckc':
                return 'ckc';
            default: {
                const certificates = await Eimzo._listCertificates(socket, timeout);
                const certificate = Eimzo.pickCertificate(certificates, tin);
                return Eimzo._loadKey(socket, certificate, timeout);
            }
        }
    }

    // Sign base64 data with the key of `tin`. Returns { pkcs7_64, signature_hex,
    // signer_serial_number, success } — the pair Didox's /v1/dsvs/timestamp wants.
    static async sign(dataBase64, tin = '') {
        console.info(`[Eimzo.sign] 🟢 Starting...`);
        const { device, timeout } = Eimzo._settings();
        const socket = await Eimzo._open();
        try {
            const keyId = await Eimzo._keyFor(socket, device, tin, timeout);
            return await Eimzo._createPkcs7(socket, dataBase64, keyId, timeout);
        } finally {
            socket.close();
        }
    }
}
