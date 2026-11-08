// Deterministic tests of actual source functions with synthetic delayed responses.
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const root = path.resolve(__dirname,'..');
const read=p=>fs.readFileSync(path.join(root,p),'utf8');
const deferred=()=>{let resolve,reject; const promise=new Promise((a,b)=>{resolve=a;reject=b;});return {promise,resolve,reject};};
module.exports=async function run(){
  let checks=0;
  const ok=(v,label)=>{assert.ok(v,label);checks++;};
  const cat=read('catalogue/src/app.js');
  const route=cat.slice(cat.indexOf('async function route()'),cat.indexOf('/* --------------------------------------------------------- recently opened */'));
  function fixture(){
    const pending=[], remembered=[], scrolls=[];
    const S={locked:false,session:{token:'synthetic'},list:null,model:null};
    const location={hash:'#/model/A'};
    const context=vm.createContext({S,location,JSON,PAGE:60,
      parseHash:()=>({view:location.hash.split('?')[0].split('/')[1],arg:location.hash.split('?')[0].split('/')[2],params:new URLSearchParams(location.hash.split('?')[1]||'')}),
      filtersFrom:p=>({q:p.get('q')||''}),apiFilters:f=>f,
      render:()=>{},rememberModel:id=>remembered.push(id),
      window:{scrollY:0,scrollTo:(...args)=>scrolls.push(args)},
      call:()=>{const d=deferred();pending.push(d);return d.promise;}
    });
    vm.runInContext(route,context);
    return {S,location,pending,remembered,scrolls,route:()=>vm.runInContext('route()',context)};
  }
  for(const rejectOld of [false,true]){
    const f=fixture(); const a=f.route(); f.location.hash='#/model/B';const b=f.route();
    f.pending[1].resolve({id:'B'});await b;
    if(rejectOld) f.pending[0].reject(new Error('old failure'));else f.pending[0].resolve({id:'A'});
    await a;
    ok(f.S.model.id==='B' && f.S.model.data.id==='B' && !f.S.model.error,'old model response cannot overwrite B');
    ok(f.remembered.join(',')==='B','stale model does not alter recently opened');
  }
  for(const lock of [true,false]){
    const f=fixture();const a=f.route();
    if(lock){f.S.locked=true;f.S.model=null;}else f.S.session={token:'replacement'};
    f.pending[0].resolve({id:'A'});await a;
    ok(!f.S.model?.data,'lock/session switch discards product response');
    ok(f.remembered.length===0,'lock/session switch does not retain recent product');
  }
  {
    const f=fixture();f.location.hash='#/list?q=A';const a=f.route();
    f.location.hash='#/list?q=B';const b=f.route();
    f.location.hash='#/list?q=A';const a2=f.route();
    f.pending[2].resolve({rows:['new A'],total:1});await a2;
    f.pending[0].resolve({rows:['old A'],total:1});await a;
    f.pending[1].resolve({rows:['B'],total:1});await b;
    ok(f.S.list.rows[0]==='new A','A-B-A list requests use request identity, not just equal keys');
  }
  {
    const f=fixture();const a=f.route(); f.location.hash='#/list?q=X';const list=f.route();
    f.pending[1].resolve({rows:['X'],total:1});await list;
    const before=f.scrolls.length;f.pending[0].resolve({id:'A'});await a;
    ok(f.scrolls.length===before,'late detail response does not reset new route scroll');
  }
  const crm=read('crm/src/app.js');
  const load=crm.slice(crm.indexOf('let listSeq = 0;'),crm.indexOf('// After a write:'));
  for(const rejectOld of [false,true]){
    const d=deferred();const S={locked:false,session:{token:'old'},rows:['placeholder']};
    const context=vm.createContext({S,call:()=>d.promise,listParams:()=>({}),renderListHost:()=>{},renderScoreboard:()=>{},refreshWalk:()=>{}});
    vm.runInContext(load,context);const running=vm.runInContext('loadList()',context);
    S.locked=true;
    if(rejectOld)d.reject(new Error('old failure'));else d.resolve({rows:['private old data'],total:1});
    await running;
    ok(S.rows[0]==='placeholder' && !S.error,'CRM ignores pending success/error after lock');
  }
  {
    const d=deferred();const S={locked:false,session:{token:'old'},rows:[]};
    const context=vm.createContext({S,call:()=>d.promise,listParams:()=>({}),renderListHost:()=>{},renderScoreboard:()=>{},refreshWalk:()=>{}});
    vm.runInContext(load,context);const running=vm.runInContext('loadList()',context);
    S.session={token:'new'};d.resolve({rows:['old session data'],total:1});await running;
    ok(S.rows.length===0,'CRM ignores response after session replacement');
  }
  const api=read('crm/src/api/index.ts');
  const expression=api.match(/median_spend:\s*([\s\S]*?),\s*top_decile_share:/)[1];
  for(const [values,expected] of [[[],0],[[10],10],[[100,20],60],[[100,70,20],70],[[100,80,30,10],55],[[1,0],.5]]){
    const actual=vm.runInNewContext(expression,{spend:values,Math});
    ok(actual===expected,'median for '+JSON.stringify(values));
  }
  return checks;
};
if(require.main===module)module.exports().then(n=>console.log(n+' correctness checks passed')).catch(e=>{console.error(e);process.exitCode=1;});
