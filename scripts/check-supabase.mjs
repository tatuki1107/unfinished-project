import { supabaseConfig, checkSupabase } from '../lib/supabase-config.mjs';

try {
  const results = await checkSupabase(supabaseConfig());
  for (const result of results) console.log(JSON.stringify(result));
  if (results.some(result => !result.ok)) process.exitCode = 1;
} catch {
  console.error('Supabase configuration is missing or invalid. Check .env.local; no values are printed.');
  process.exitCode = 1;
}
