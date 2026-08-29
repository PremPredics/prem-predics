import { supabase } from './supabase-client.js';
import { boundedRead } from './async-read.js';

let pendingUser = null;

// Presentation only. Database access/admin authorization still uses Supabase
// JWT verification and RLS. Share the SDK session read across homepage modules
// instead of making three blocking network getUser calls on every visit.
export function getSessionUser() {
  if (!pendingUser) {
    pendingUser = boundedRead(() => supabase.auth.getSession())
      .then(({ data, error }) => {
        if (error) throw error;
        return data?.session?.user || null;
      }).finally(() => { pendingUser = null; });
  }
  return pendingUser;
}

export function onSessionUserChange(callback) {
  const { data } = supabase.auth.onAuthStateChange((event, session) => {
    // Never call another Supabase method while the auth callback holds its lock.
    setTimeout(() => callback(session?.user || null, event), 0);
  });
  return () => data.subscription.unsubscribe();
}
