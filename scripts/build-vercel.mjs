import { build } from 'esbuild';
import { cp, mkdir, writeFile, rm } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { supabaseConfig } from '../lib/supabase-config.mjs';

const root=process.cwd(), output=resolve(root,'.vercel/output');
if(output!==join(root,'.vercel','output'))throw Error('Unexpected build directory');
const config=supabaseConfig();
await rm(output,{recursive:true,force:true});
await mkdir(join(output,'functions/api/index.func'),{recursive:true});
await cp(resolve(root,'dist'),join(output,'static'),{recursive:true});
await build({entryPoints:['api/index.mjs'],outfile:join(output,'functions/api/index.func/index.mjs'),bundle:true,platform:'node',format:'esm',target:'node24',
  banner:{js:"import { createRequire as _createRequire } from 'node:module'; const require = _createRequire(import.meta.url);"}});
await writeFile(join(output,'functions/api/index.func/.vc-config.json'),JSON.stringify({runtime:'nodejs24.x',handler:'index.mjs',launcherType:'Nodejs',maxDuration:60,regions:['hnd1']}));
await writeFile(join(output,'config.json'),JSON.stringify({version:3,routes:[
  {src:'/(.*)',headers:{'X-Content-Type-Options':'nosniff','X-Frame-Options':'DENY','Referrer-Policy':'same-origin',
    'Content-Security-Policy':`default-src 'self'; img-src 'self' data: ${config.url}; media-src 'self' ${config.url}; connect-src 'self' ${config.url}; script-src 'self'; style-src 'self'; object-src 'none'; base-uri 'self'; frame-ancestors 'none'`},continue:true},
  {src:'/api/(.*)',dest:'/api/index'}, {src:'/uploads/(.*)',dest:'/api/index'},
  {handle:'filesystem'}, {src:'/',dest:'/index.html'},
]}));
console.log('Built Vercel output: static assets and bundled Node API. No secrets embedded.');
