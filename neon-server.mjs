import http from 'node:http';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createCloudHandler } from './cloud-server.mjs';
import { createNeonDatabase } from './lib/neon-database.mjs';
import { createNeonIdentity,SITE_ORIGIN } from './lib/neon-auth.mjs';
import { createNeonStorage } from './lib/neon-storage.mjs';
export function createNeonHandler({secure=true,...options}={}) {
  const database=createNeonDatabase(process.env.DATABASE_URL);
  return createCloudHandler({...options,secure,backend:'neon',database,...createNeonIdentity(database,{secure}),handleStorage:createNeonStorage(database),config:{url:SITE_ORIGIN}});
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url))http.createServer(createNeonHandler({secure:false})).listen(Number(process.env.PORT||5175),'127.0.0.1',()=>console.log('Neon app listening'));
