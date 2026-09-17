// Server-only configuration. Never place this module under public/.
export function supabaseConfig(env = process.env) {
  for (const name of ['SUPABASE_URL', 'SUPABASE_PUBLISHABLE_KEY', 'SUPABASE_SECRET_KEY']) {
    if (!env[name]?.trim()) throw new Error(`${name} is required`);
  }
  let url;
  try { url = new URL(env.SUPABASE_URL); } catch { throw new Error('SUPABASE_URL is invalid'); }
  if (url.protocol !== 'https:' || !/^[a-z0-9-]+\.supabase\.co$/.test(url.hostname) ||
      url.username || url.password || url.port || url.search || url.hash || url.pathname !== '/') {
    throw new Error('SUPABASE_URL must be a hosted Supabase HTTPS origin');
  }
  if (!env.SUPABASE_PUBLISHABLE_KEY.startsWith('sb_publishable_')) throw new Error('Publishable key format is invalid');
  if (!env.SUPABASE_SECRET_KEY.startsWith('sb_secret_')) throw new Error('Secret key format is invalid');
  const bucket = env.SUPABASE_STORAGE_BUCKET || 'project-files';
  if (bucket !== 'project-files') throw new Error('Storage bucket must match the project-files migration');
  return Object.freeze({ url: url.origin, publishableKey: env.SUPABASE_PUBLISHABLE_KEY,
    secretKey: env.SUPABASE_SECRET_KEY, bucket });
}

// Read-only probes. Return status and booleans only; never response bodies or keys.
export async function checkSupabase(config, fetcher = fetch) {
  const checks = [
    ['auth', '/auth/v1/settings', config.publishableKey],
    ['database', '/rest/v1/', config.secretKey],
    ['storage', '/storage/v1/bucket', config.secretKey],
    ['schema', '/rest/v1/projects?select=id&limit=0', config.secretKey],
    ['bucket', `/storage/v1/bucket/${config.bucket}`, config.secretKey],
  ];
  return Promise.all(checks.map(async ([service, path, key]) => {
    try {
      const response = await fetcher(new URL(path, config.url), {
        headers: { apikey: key }, signal: AbortSignal.timeout(15000), redirect: 'error',
      });
      let ok = response.ok;
      if (service === 'bucket' && ok) {
        const bucket = await response.json();
        ok = bucket.id === config.bucket && bucket.public === false;
      } else await response.body?.cancel();
      return { service, status: response.status, ok };
    } catch { return { service, ok: false, error: 'CONNECTION_FAILED' }; }
  }));
}
