// Explicit command: sends only these app secrets to the linked Vercel project.
// Values are passed via stdin, never command-line arguments or output.
import { spawnSync } from 'node:child_process';
import { supabaseConfig } from '../lib/supabase-config.mjs';
supabaseConfig();
for(const name of ['SUPABASE_URL','SUPABASE_PUBLISHABLE_KEY','SUPABASE_SECRET_KEY']) {
  const command=`npx --yes vercel@59.20.0 env add ${name} production --sensitive --force`;
  const result=spawnSync('cmd.exe',['/d','/s','/c',command],{input:process.env[name],encoding:'utf8',windowsHide:true});
  if(result.status!==0){console.error(`Failed to set ${name}; inspect Vercel environment settings.`);process.exit(1);}
  console.log(`${name}: configured for production`);
}
