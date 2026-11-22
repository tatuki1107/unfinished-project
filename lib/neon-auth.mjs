import { createAuthServer, extractNeonAuthCookies, serializeSetCookie, processAuthMiddleware } from '@neondatabase/auth/server';

export const SITE_ORIGIN='https://unfinished-project-eta.vercel.app';
export const fail=(status,message)=>{throw Object.assign(new Error(message),{status});};
export const json=(res,status,value)=>{res.writeHead(status,{'content-type':'application/json; charset=utf-8','cache-control':'no-store'});res.end(JSON.stringify(value));};
export async function input(req){const chunks=[];let size=0;for await(const chunk of req){size+=chunk.length;if(size>256*1024)fail(413,'送信内容が大きすぎます');chunks.push(chunk);}try{return JSON.parse(Buffer.concat(chunks).toString()||'{}');}catch{fail(400,'入力形式が不正です');}}
export function createNeonIdentity(db,{baseUrl=process.env.NEON_AUTH_BASE_URL,cookieSecret=process.env.NEON_AUTH_COOKIE_SECRET,secure=true}={}) {
  if(!baseUrl||!cookieSecret||cookieSecret.length<32)throw Error('Neon Auth configuration is required');
  const options={baseUrl,cookieSecret,sessionDataTtl:60,sameSite:'lax'};
  const append=(res,cookie)=>res.setHeader('set-cookie',[...(res.getHeader('set-cookie')||[]),cookie]);
  const auth=(req,res)=>createAuthServer({...options,context:()=>({
    getCookies:()=>extractNeonAuthCookies(req.headers.cookie||''),
    setCookie:(name,value,settings)=>append(res,serializeSetCookie({name,value,...settings,secure})),
    getHeader:name=>req.headers[name.toLowerCase()]||null,
    getOrigin:()=>SITE_ORIGIN,getFramework:()=> 'node',
  })});
  async function profile(user) {
    if(!user)return null;
    await db.sql.query('INSERT INTO public.profiles(id,display_name) VALUES ($1,$2) ON CONFLICT (id) DO NOTHING',[user.id,String(user.name||'新しい作者').slice(0,60)]);
    const [p]=await db.sql.query('SELECT * FROM public.profiles WHERE id=$1',[user.id]);
    return {id:p.id,email:user.email,displayName:p.display_name,bio:p.bio,role:p.role};
  }
  const identity=async(req,res)=>{
    if(!extractNeonAuthCookies(req.headers.cookie||''))return null;
    const result=await auth(req,res).getSession({query:{disableCookieCache:'true'}});
    if(result.error)fail(503,'ログイン状態を確認できません。時間をおいて再試行してください。');
    return profile(result.data?.user);
  };
  const check=result=>{
    if(!result.error)return result.data;
    const {code,status}=result.error;
    if(status===429)fail(429,'操作が集中しています。時間をおいて再試行してください。');
    if(code==='email_not_confirmed')fail(400,'メールアドレスの確認が必要です。新規登録画面で確認コードを入力してください。');
    if(['invalid_credentials','user_not_found'].includes(code))fail(400,'メールアドレスまたはパスワードが正しくありません。');
    if(['user_already_exists','email_exists'].includes(code))fail(400,'このメールアドレスは登録済みです。ログインしてください。');
    console.error('Neon auth request failed',String(code||'AUTH_ERROR').replace(/[^A-Z_0-9]/gi,''));
    fail(status>=500?503:400,'認証処理を完了できません。入力内容を確認し、時間をおいて再試行してください。');
  };
  async function handleAuth(req,res,path,method){
    const client=auth(req,res);
    if(path==='/api/auth/callback'&&method==='GET'){
      const request=new Request(new URL(req.url,SITE_ORIGIN),{headers:req.headers});
      const outcome=await processAuthMiddleware({...options,request,pathname:'/api/auth/callback',skipRoutes:[],loginUrl:'/auth-complete.html?provider=neon'});
      for(const c of outcome.cookies||[])append(res,c);
      if(outcome.action==='redirect_oauth'){res.writeHead(302,{location:outcome.redirectUrl.toString(),'cache-control':'no-store'});res.end();return;}
      res.writeHead(302,{location:'/auth-complete.html?provider=neon','cache-control':'no-store'});res.end();return;
    }
    if(method!=='POST')fail(405,'対応していない操作です');
    const data=await input(req);
    if(path==='/api/auth/verify'){
      const email=String(data.email||'').trim(),otp=String(data.otp||'').trim();
      if(!/^\S+@\S+\.\S+$/.test(email)||!/^\d{6}$/.test(otp))fail(400,'メールアドレスと6桁の確認コードを入力してください');
      check(await client.emailOtp.verifyEmail({email,otp}));return json(res,200,{ok:true});
    }
    if(path==='/api/auth/logout'){check(await client.signOut());return json(res,200,{ok:true});}
    if(['/api/auth/register','/api/auth/login','/api/auth/recover','/api/auth/resend'].includes(path)){
      const email=String(data.email||'').trim();
      if(email.length>180||!/^\S+@\S+\.\S+$/.test(email))fail(400,'正しいメールアドレスを入力してください');
      const callbackURL=SITE_ORIGIN+'/api/auth/callback';
      if(path.endsWith('/resend')||path.endsWith('/recover')){
        const result=path.endsWith('/resend')?await client.emailOtp.sendVerificationOtp({email,type:'email-verification'}):await client.requestPasswordReset({email,redirectTo:SITE_ORIGIN+'/auth-complete.html?provider=neon&type=recovery'});
        // Same response for missing, confirmed and pending accounts.
        if(!['user_not_found','email_exists','user_already_exists'].includes(result.error?.code))check(result);
        return json(res,200,{ok:true});
      }
      const password=String(data.password||'');
      if(password.length<8||password.length>128)fail(400,'8〜128文字のパスワードを入力してください');
      if(path.endsWith('/register')){
        const name=String(data.displayName||'').trim().slice(0,60);if(!name)fail(400,'表示名を入力してください');
        const result=check(await client.signUp.email({email,password,name,callbackURL}));
        return json(res,200,{user:result?.token?await profile(result.user):null,confirmationRequired:!result?.token});
      }
      const result=check(await client.signIn.email({email,password,callbackURL}));
      return json(res,200,{user:await profile(result.user)});
    }
    if(path==='/api/auth/password'){
      const password=String(data.password||'');if(password.length<8||password.length>128)fail(400,'8〜128文字で入力してください');
      // Recovery tokens are supplied by the mailed reset link, never a user ID.
      if(!data.token)fail(400,'再設定メールから開き直してください');
      check(await client.resetPassword({newPassword:password,token:String(data.token)}));
      return json(res,200,{ok:true});
    }
    fail(404,'認証リンクが古くなっています。新しい確認メールを再送してください。');
  }
  return {identity,handleAuth};
}
