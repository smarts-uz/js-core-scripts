// In-memory stand-in for classes/Secrets.js — keys.yml shape service -> kind -> firm.
// A test fills the store (`secrets.reset({ didox: { partner_key: { SRental: 'pk' } } })`),
// the class under test reads it through get(service, kind, firm), and every
// set() lands in `saved` plus the store, so nothing ever touches a real keys.yml.

export function makeSecretsMock() {
  const store = {};
  const saved = [];

  const mock = {
    store,
    saved,
    reset(data = {}) {
      Object.keys(store).forEach((service) => delete store[service]);
      Object.assign(store, structuredClone(data));
      saved.length = 0;
    },
    get(service, kind, firm) {
      return store?.[service]?.[kind]?.[firm] ?? null;
    },
    set(service, kind, firm, value) {
      store[service] ??= {};
      store[service][kind] ??= {};
      store[service][kind][firm] = value;
      saved.push({ service, kind, firm, value });
      return true;
    },
    env(name) {
      return process.env[name] ?? null;
    },
  };

  return mock;
}
