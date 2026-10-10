// Neon Auth client. Supabase is no longer used for authentication.
(function () {
  const clientPromise = Promise.all([
    import('https://esm.sh/@neondatabase/auth'),
    import('https://esm.sh/@neondatabase/auth/vanilla/adapters')
  ]).then(([authModule, adapters]) => {
    const client = authModule.createAuthClient(
      'https://ep-little-meadow-azqb0pzt.neonauth.c-3.ap-southeast-1.aws.neon.tech/lastyear_today/auth',
      { adapter: adapters.SupabaseAuthAdapter() }
    );
    return client;
  });
  window.LYT_AUTH_READY = clientPromise;
  window.LYT_AUTH_CLIENT = {
    auth: {
      async getSession() { return (await clientPromise).getSession(); },
      async signInWithPassword(credentials) { return (await clientPromise).signInWithPassword(credentials); },
      async signInWithOAuth(options) { return (await clientPromise).signInWithOAuth(options); },
      async signUp(credentials) { return (await clientPromise).signUp(credentials); },
      async signOut() { return (await clientPromise).signOut(); },
      async getUser() { return (await clientPromise).getUser(); },
      async onAuthStateChange(callback) { return (await clientPromise).onAuthStateChange(callback); }
    }
  };
})();
