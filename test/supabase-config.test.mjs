import test from 'node:test';
import assert from 'node:assert/strict';
import { supabaseConfig, checkSupabase } from '../lib/supabase-config.mjs';

const env = { SUPABASE_URL: 'https://example.supabase.co',
  SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_test', SUPABASE_SECRET_KEY: 'sb_secret_test' };

test('Supabase config rejects missing keys and non-Supabase destinations', () => {
  assert.equal(supabaseConfig(env).bucket, 'project-files');
  assert.throws(() => supabaseConfig({ ...env, SUPABASE_SECRET_KEY: '' }));
  for (const url of ['http://example.supabase.co','https://example.com','https://example.supabase.co.evil.com',
    'https://user:pass@example.supabase.co', 'https://example.supabase.co/path']) {
    assert.throws(() => supabaseConfig({ ...env, SUPABASE_URL: url }));
  }
});

test('read-only checks use correct keys, no redirects, no sensitive output', async () => {
  const calls = [];
  const results = await checkSupabase(supabaseConfig(env), async (url, options) => {
    calls.push([url, options]);
    return new Response(url.pathname.endsWith('/project-files')
      ? JSON.stringify({ id: 'project-files', public: false }) : '{}', { status: 200 });
  });
  assert.equal(results.length, 5);
  assert.ok(results.every(r => r.ok));
  assert.equal(calls[0][1].headers.apikey, env.SUPABASE_PUBLISHABLE_KEY);
  assert.equal(calls[1][1].headers.apikey, env.SUPABASE_SECRET_KEY);
  assert.ok(calls.every(([,o]) => !o.method && o.redirect === 'error'));
  assert.ok(!JSON.stringify(results).includes('sb_secret'));
});

test('missing schema, public bucket, and network errors fail safely', async () => {
  const results = await checkSupabase(supabaseConfig(env), async url => {
    if (url.pathname === '/auth/v1/settings') throw new Error(env.SUPABASE_SECRET_KEY);
    if (url.pathname === '/rest/v1/projects') return new Response('{}', { status: 404 });
    return new Response(JSON.stringify({ id: 'project-files', public: true }));
  });
  assert.equal(results.find(r => r.service === 'auth').ok, false);
  assert.equal(results.find(r => r.service === 'schema').ok, false);
  assert.equal(results.find(r => r.service === 'bucket').ok, false);
  assert.ok(!JSON.stringify(results).includes(env.SUPABASE_SECRET_KEY));
});
