import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { canRead, canEdit, createCloudHandler } from '../cloud-server.mjs';

test('cloud permissions distinguish public, unlisted, draft, owner and admin',()=>{
  const p={author_id:'owner',status:'published',visibility:'public'};
  assert.equal(canRead(p,null),true);
  assert.equal(canRead({...p,visibility:'unlisted'},null),true);
  assert.equal(canRead({...p,visibility:'private'},null),false);
  assert.equal(canRead({...p,status:'draft'},{id:'other'}),false);
  assert.equal(canRead({...p,status:'draft'},{id:'owner'}),true);
  assert.equal(canRead({...p,visibility:'private'},{id:'admin',role:'admin'}),true);
  assert.equal(canEdit(p,null),false);
  assert.equal(canEdit(p,{id:'other'}),false);
  assert.equal(canEdit(p,{id:'owner'}),true);
});

test('cloud rejects cross-origin writes without contacting Supabase',async()=>{
  const server=http.createServer(createCloudHandler({config:{url:'https://example.supabase.co',secretKey:'sb_secret_test',publishableKey:'sb_publishable_test',bucket:'project-files'},secure:false}));
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const base=`http://127.0.0.1:${server.address().port}`;
  try {
    for(const origin of [undefined,'https://evil.example']) {
      const r=await fetch(base+'/api/projects',{method:'POST',headers:origin?{origin}:{},body:'{}'});
      assert.equal(r.status,403);
    }
    const health=await fetch(base+'/api/health');assert.deepEqual(await health.json(),{ok:true,backend:'supabase'});
    const session=await fetch(base+'/api/session');assert.deepEqual(await session.json(),{user:null,backend:'supabase'});
    assert.equal(session.headers.get('cache-control'),'no-store');
  } finally { await new Promise(resolve=>server.close(resolve)); }
});
