// Node >=22.13: execute the actual edge source with Deno/fetch stubs; no network.
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const {stripTypeScriptTypes} = require('node:module');
module.exports = async function run() {
  let checks = 0;
  const ok = (v,label) => {assert.ok(v,label); checks++;};
  for (const tool of ['crm','catalogue']) {
    const source = fs.readFileSync(path.join(__dirname,'..',tool,'src/api/index.ts'),'utf8');
    const js = stripTypeScriptTypes(source.replace(/^import .*;\s*$/m,''));
    let handler;
    const state={ mode:'success', dbCalls:0, expiry:'2099-01-01T00:00:00Z', allowed:true, active:true };
    const fixedNow = Date.parse('2026-11-08T12:00:00Z');
    class Clock extends Date { static now() { return fixedNow; } }
    const context = vm.createContext({
      Request,Response,TextEncoder,URL,Date:Clock,Number,Array,JSON,Error,
      console:{error:()=>{}},
      Deno:{env:{get:()=> 'https://synthetic.invalid'},serve:fn=>{handler=fn;}},
      fetch:async url=>{
        state.dbCalls++;
        let data;
        if(String(url).includes('editor_sessions?')) {
          data=[{display_name:'Synthetic',expires_at:state.expiry,can_view_crm:state.allowed,can_edit_crm:true,can_view_catalogue:state.allowed}];
        } else if(String(url).includes('board_users?')) {
          data=state.active ? [{can_view_crm:true,can_edit_crm:true,can_view_catalogue:true,can_manage_catalogue:false}] : [];
        } else {throw new Error('Unexpected database request');}
        return new Response(JSON.stringify(data),{status:200});
      }
    });
    vm.runInContext(js,context,{filename:tool+'/api/index.ts'});
    vm.runInContext('globalThis.checkSession = requireSession; globalThis.originalHandle = handle; globalThis.HttpError = HttpErr;',context);
    // Stub business dispatch only; request parsing, responses and errors remain real.
    context.dispatch = async () => {
      if(state.mode==='internal') throw new Error('PRIVATE_DATABASE_DETAIL');
      if(state.mode==='conflict') throw new context.HttpError(409,'Expected conflict.');
      return {ok:true};
    };
    vm.runInContext('handle = globalThis.dispatch;',context);
    const send=body=>handler(new Request('https://synthetic.invalid',{method:'POST',body}));
    for(const body of ['null','[]','"text"','123','true','{']) {
      const res=await send(body);
      ok(res.status===400,tool+' rejects invalid request shape '+body);
      ok(res.headers.get('cache-control')==='no-store',tool+' no-store on validation');
    }
    let res=await send('{}');
    ok(res.status===200,tool+' accepts object');
    ok(res.headers.get('cache-control')==='no-store',tool+' no-store on success');
    state.mode='internal'; res=await send('{}');
    ok(res.status===500,tool+' server failure status');
    ok(!(await res.text()).includes('PRIVATE_DATABASE_DETAIL'),tool+' hides internal detail');
    state.mode='conflict'; res=await send('{}');
    ok(res.status===409 && (await res.json()).error==='Expected conflict.',tool+' preserves expected conflict');
    res=await handler(new Request('https://synthetic.invalid',{method:'GET'}));
    ok(res.status===405,tool+' rejects wrong method');
    for(const expiry of ['invalid-date',null,undefined,'2000-01-01T00:00:00Z','2026-11-08T12:00:00Z']) {
      state.expiry=expiry; state.dbCalls=0;
      await assert.rejects(()=>context.checkSession('synthetic-session-token-long'),e=>e.status===401);
      ok(state.dbCalls===1,tool+' refuses invalid/expired session before user lookup');
    }
    state.expiry='2099-01-01T00:00:00Z';
    ok((await context.checkSession('synthetic-session-token-long')).name==='Synthetic',tool+' accepts valid session');
    state.allowed=false;
    await assert.rejects(()=>context.checkSession('synthetic-session-token-long'),e=>e.status===403); checks++;
    state.allowed=true; state.active=false;
    await assert.rejects(()=>context.checkSession('synthetic-session-token-long'),e=>e.status===403); checks++;
  }
  return checks;
};
if(require.main===module) module.exports().then(n=>console.log(n+' API boundary checks passed')).catch(e=>{console.error(e);process.exitCode=1;});
