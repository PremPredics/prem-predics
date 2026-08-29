// Test double only. Never imported by production code.
export function fakeSupabase(tables, { cap = 1000, handler, user = { id: 'test-user', email: 'test@example.invalid' } } = {}) {
  const calls = [];
  const authListeners = [];
  class Query {
    constructor(table) { this.table = table; this.filters = []; this.orders = []; this.method = 'read'; }
    select(_fields, options = {}) { this.countRequested = options.count; return this; }
    eq(key, value) { this.filters.push((row) => String(row[key]) === String(value)); return this; }
    in(key, values) { this.filters.push((row) => values.map(String).includes(String(row[key]))); return this; }
    order(key, { ascending = true } = {}) { this.orders.push([key, ascending]); return this; }
    range(from, to) { this.from = from; this.to = to; return this; }
    maybeSingle() { this.single = true; return this; }
    abortSignal(signal) { this.signal = signal; return this; }
    upsert(payload, options = {}) { this.method = 'upsert'; this.payload = payload; this.conflict = options.onConflict; return this; }
    async execute() {
      calls.push(this);
      if (handler) {
        const response = await handler(this);
        if (response !== undefined) return response;
      }
      if (this.table.startsWith('rpc:')) return { data: true, error: null };
      if (!(this.table in tables)) return { data: null, error: { code: '42P01', message: 'Missing test table' } };
      if (this.method === 'upsert') {
        const keys = (this.conflict || 'id').split(',');
        const old = tables[this.table].find((r) => keys.every((key) => String(r[key]) === String(this.payload[key])));
        if (old) Object.assign(old, this.payload);
        else tables[this.table].push({ ...this.payload });
        return { data: null, error: null };
      }
      let data = tables[this.table].filter((row) => this.filters.every((f) => f(row)));
      data = [...data].sort((a, b) => {
        for (const [key, ascending] of this.orders) {
          const comparison = typeof a[key] === 'number' ? a[key] - b[key] : String(a[key]).localeCompare(String(b[key]));
          if (comparison) return ascending ? comparison : -comparison;
        }
        return 0;
      });
      const count = this.countRequested ? data.length : null;
      const from = this.from || 0;
      data = data.slice(from, Math.min(this.to == null ? Infinity : this.to + 1, from + cap));
      if (this.single && data.length > 1) return { data: null, error: { code: 'PGRST116', message: 'Multiple rows' } };
      return { data: this.single ? data[0] || null : data, error: null, count };
    }
    then(resolve, reject) { return this.execute().then(resolve, reject); }
  }
  return {
    tables, calls,
    from: (table) => new Query(table),
    rpc: (name) => new Query(`rpc:${name}`),
    auth: {
      getSession: async () => ({ data: { session: user ? { user } : null }, error: null }),
      getUser: async () => ({ data: { user }, error: null }),
      signInWithPassword: async () => ({ data: { user }, error: null }),
      onAuthStateChange: (callback) => {
        authListeners.push(callback);
        return { data: { subscription: { unsubscribe() {} } } };
      },
    },
    emitAuth: (nextUser, event) => { for (const callback of authListeners) callback(event, nextUser ? { user: nextUser } : null); },
  };
}
