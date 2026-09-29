const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict'),path=require('node:path');
let spoken=[],audioCount=0,cancelled=0;
class Audio {
 constructor(url){this.url=url;audioCount++;}
 play(){return this.url.includes('broken')?Promise.reject(Error('broken')):Promise.resolve();}
 pause(){this.paused=true} removeAttribute(){} load(){}
}
const window={Audio,SpeechSynthesisUtterance:class {constructor(text){this.text=text}},speechSynthesis:{getVoices:()=>[{lang:'en-US',name:'Google US English'},{lang:'en-GB',name:'UK voice'}],speak:u=>spoken.push(u),cancel:()=>cancelled++}};
const context={window,document:{baseURI:'http://localhost/'},URL,setTimeout,clearTimeout};
vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../selection-translator.js'),'utf8'),context);
const C=window.SelectionTranslator;
const item=()=>Object.assign(Object.create(C.prototype),{current:'hello',speechLang:'en-US',audioStatus:{},playbackId:0});
(async()=>{
 const test=item();
 assert.equal(test.chooseVoice([{name:'Albert'},{name:'Samantha'}]).name,'Samantha');
 assert.equal(test.chooseVoice([{name:'Zarvox'}]),undefined);
 assert.equal(test.chooseVoice([{name:'Samantha'},{name:'Alex'}],'Alex').name,'Alex');
 let ready;
 window.speechSynthesis.addEventListener=(name,fn)=>{ready=fn};
 window.speechSynthesis.removeEventListener=()=>{};
 const voices=window.speechSynthesis.getVoices;
 window.speechSynthesis.getVoices=()=>[];
 const waiting=item();const initial=spoken.length;waiting.playPronunciation();assert.equal(spoken.length,initial);
 window.speechSynthesis.getVoices=voices;ready();assert.equal(spoken.length,initial+1);waiting.stopPlayback();
 spoken=[];cancelled=0;
 const t=item();t.playPronunciation();assert.equal(spoken.at(-1).text,'hello');assert.match(spoken.at(-1).voice.name,/Google/);
 t.playPronunciation('en-GB');assert.equal(spoken.at(-1).lang,'en-GB');assert.equal(cancelled,1);t.stopPlayback();
 const a=item();a.audioEntry={word:'hello',audio_url:'https://example.com/audio.mp3'};const before=spoken.length;a.playPronunciation();await Promise.resolve();assert.equal(spoken.length,before);assert.match(a.audioStatus.textContent,/audio từ điển/);a.stopPlayback();
 a.audioEntry.audio_url='https://example.com/broken.mp3';a.playPronunciation();await new Promise(setImmediate);assert.equal(spoken.length,before+1);a.stopPlayback();
 const count=audioCount;a.audioEntry.audio_url='javascript:alert(1)';a.playPronunciation();assert.equal(audioCount,count);a.stopPlayback();
 a.audioEntry.audio_url='https://example.com/broken.mp3';const old=spoken.length;a.playPronunciation();a.stopPlayback();await new Promise(setImmediate);assert.equal(spoken.length,old);
 delete window.speechSynthesis;a.audioEntry=null;a.playPronunciation();assert.match(a.audioStatus.textContent,/chưa hỗ trợ/);
 console.log('PASS: browser speech, Google preference, UK voice, audio priority, broken audio fallback, unsafe URL rejection, stop cancellation, unsupported browser.');
})().catch(e=>{console.error(e);process.exitCode=1});
