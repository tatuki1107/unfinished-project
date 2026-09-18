import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { canRead, canEdit, createCloudHandler, authErrorMessage } from '../cloud-server.mjs';

test('auth errors mention email confirmation only for that specific failure',()=>{
  assert.match(authErrorMessage({code:'invalid_credentials'}),/メールアドレスまたはパスワード/);
  assert.doesNotMatch(authErrorMessage({code:'invalid_credentials'}),/メール確認/);
  assert.match(authErrorMessage({code:'email_not_confirmed'}),/メール確認待ち/);
  assert.match(authErrorMessage({status:429}),/時間をおいて/);
  assert.doesNotMatch(authErrorMessage({message:'private server details'},true),/private server details/);
});

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
