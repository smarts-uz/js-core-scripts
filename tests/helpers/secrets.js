// In-memory stand-in for classes/Secrets.js, shared by the integration specs
// (Didox / MySoliq / IjaraSoliq / KapitalBank). It never touches the real
// keys.yml, so a developer's actual credentials can't leak into — or change the
// outcome of — a test.
//
// Store keys are "service.kind.firm"; get() mirrors the real null-on-missing
// contract. Usage:
//   const secrets = createSecretsMock();
//   jest.unstable_mockModule(utilsModule('Secrets.js'), () => ({ Secrets: secrets.mock }));
//   beforeEach(() => secrets.clear());
//   secrets.set('didox', 'user_key', 'SRental', 'ukey');   // set
//   secrets.set('didox', 'user_key', 'SRental', undefined); // remove
import { jest } from '@jest/globals';

export function createSecretsMock() {
  const store = new Map();
  const key = (service, kind, firm) => `${service}.${kind}.${firm}`;

  const mock = {
    get: jest.fn((service, kind, firm) => store.get(key(service, kind, firm)) ?? null),
    env: jest.fn((name) => process.env[name] ?? null),
    _set: jest.fn((service, kind, firm, value) => {
      store.set(key(service, kind, firm), String(value));
    }),
  };

  return {
    mock,
    set(service, kind, firm, value) {
      if (value === undefined) {
        store.delete(key(service, kind, firm));
        return;
      }
      store.set(key(service, kind, firm), value);
    },
    clear() {
      store.clear();
    },
  };
}
