// Neon Auth client. Supabase is no longer used for authentication.
import { createAuthClient } from 'https://esm.sh/@neondatabase/auth';
import { SupabaseAuthAdapter } from 'https://esm.sh/@neondatabase/auth/vanilla/adapters';

const authUrl = 'https://ep-little-meadow-azqb0pzt.neonauth.c-3.ap-southeast-1.aws.neon.tech/lastyear_today/auth';
const clientPromise = Promise.resolve(createAuthClient(authUrl, { adapter: SupabaseAuthAdapter() }));

window.LYT_AUTH_READY = clientPromise;
window.LYT_AUTH_CLIENT = {
  auth: {
    async getSession() {
      const client = await clientPromise;
      return client.getSession();
    },
    async signInWithPassword(credentials) {
      const client = await clientPromise;
      return client.signInWithPassword(credentials);
    },
    async signUp(credentials) {
      const client = await clientPromise;
      return client.signUp(credentials);
    },
    async signOut() {
      const client = await clientPromise;
      return client.signOut();
    },
    async getUser() {
      const client = await clientPromise;
      return client.getUser();
    },
    async onAuthStateChange(callback) {
      const client = await clientPromise;
      return client.onAuthStateChange(callback);
    }
  }
};
