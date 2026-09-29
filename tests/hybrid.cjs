const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const {execFileSync} = require('node:child_process');
const os = require('node:os');
const base = path.resolve(__dirname, '..');
function node() {return {textContent:'', children:[], append(n){this.children.push(n)}, replaceChildren(){this.children=[];this.textContent=''}};}
const context = {window:{}, document:{createElement:node}, URL, URLSearchParams, AbortController, DOMException, TextEncoder, setTimeout, clearTimeout};
vm.runInNewContext(fs.readFileSync(path.join(base,'selection-translator.js'),'utf8'),context);
const C=context.window.SelectionTranslator;
const entry={word:'resilient',phonetic_uk:'/test/',cefr_level:'C1',definitions:[{definition_vi:'kiên cường', example_en:'<img src=x onerror=alert(1)>',synonyms:['strong']} ]};
function instance(lookup) {
 let calls=0;
 return Object.assign(Object.create(C.prototype),{source:'en',target:'vi',maxBytes:500,lookupTimeout:10,lookup,translate:async()=>{calls++; return 'dịch dự phòng'},getCalls:()=>calls,cache:new Map(),version:0,host:{style:{}},original:node(),result:node(),footer:node(),position(){}});
}
const options=()=>({source:'en',target:'vi',signal:new AbortController().signal});
(async()=>{
 const hit=instance(async()=>entry);
 assert.equal((await hit.resolve('resilient',options())).type,'dictionary');assert.equal(hit.getCalls(),0);
 for(const lookup of [async()=>null,async()=>{throw Error('offline')},()=>new Promise(()=>{})]){
   const i=instance(lookup);const v=await i.resolve('missing',options());assert.equal(v.type,'translation');assert.equal(i.getCalls(),1);
 }
 const aborted=options();aborted.signal=AbortSignal.abort();const a=instance(async()=>entry);
 await assert.rejects(()=>a.resolve('word',aborted));assert.equal(a.getCalls(),0);
 await hit.show('resilient',{});await hit.show('resilient',{});assert.equal(hit.cache.size,1);
 assert.equal(hit.result.children[2].children[1].textContent,'<img src=x onerror=alert(1)>');
 await hit.show('ế'.repeat(170),{});assert.match(hit.result.textContent,/quá dài/);
 let finish;const race=instance(t=>t==='old'?new Promise(r=>finish=r):Promise.resolve(entry));race.lookupTimeout=1000;
 const pending=race.show('old',{});await Promise.resolve();await race.show('new',{});finish({...entry,word:'old'});await pending;
 assert.equal(race.result.children[0].textContent,'resilient');
 const broken=instance(async()=>{throw Error('offline')});await broken.show('word',{});assert.equal(broken.cache.size,0);
 const temp=fs.mkdtempSync(path.join(os.tmpdir(),'dictionary-test-'));const db=path.join(temp,'test.sqlite');
 try {
  execFileSync('php',['-r',String.raw`$d=new SQLite3($argv[1]);$d->exec("CREATE TABLE words(id INTEGER,word TEXT,phonetic_uk TEXT,phonetic_us TEXT,cefr_level TEXT,audio_url TEXT); CREATE TABLE definitions(id INTEGER,word_id INTEGER,part_of_speech TEXT,definition_en TEXT,definition_vi TEXT,example_en TEXT,example_vi TEXT,synonyms TEXT);");$d->exec("INSERT INTO words VALUES(1,'resilient','/uk/','/us/','C1',''); INSERT INTO definitions VALUES(1,1,'adjective','strong','kiên cường','example','ví dụ','[\"strong\"]');");`,db]);
  const query=q=>JSON.parse(execFileSync('php',['-r',`$_GET['q']=$argv[1]; require $argv[2];`,q,path.join(base,'api/lookup.php')],{env:{...process.env,DICTIONARY_DB_PATH:db},encoding:'utf8'}));
  const before=fs.readFileSync(db);
  const found=query(' “RESILIENT!” ');assert.equal(found.found,true);assert.equal(found.entry.cefr_level,'C1');assert.equal(found.entry.definitions[0].synonyms[0],'strong');
  assert.equal(query("' OR 1=1 --").found,false);assert.equal(query('unknown').found,false);assert.equal(query('x'.repeat(501)).error,'invalid_query');assert.equal(query('').error,'invalid_query');assert.ok(before.equals(fs.readFileSync(db)));
 } finally {fs.rmSync(temp,{recursive:true,force:true});}
 console.log('PASS: local hit, miss/error/timeout fallback, abort, cache, stale response, safe rendering, UTF-8 limit, PHP normalization, SQL injection handling, read-only DB.');
})().catch(error=>{console.error(error);process.exitCode=1});
