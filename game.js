"use strict";
const $=id=>document.getElementById(id);
const SUITS=["♠","♥","♣","♦"];
const PIPS={11:"В",12:"Д",13:"К",14:"Т"};
const GARMENTS=["шарф","жакет","спідницю","блузу","легінси"];
const STORE="duel_dressup_game_v2";
let memory={wins:0,losses:0,draws:0,stage:0};
try{
 const old=JSON.parse(localStorage.getItem(STORE));
 if(old&&typeof old==="object")for(const key of Object.keys(memory))
   if(Number.isInteger(old[key])&&old[key]>=0)memory[key]=old[key];
 memory.stage=Math.min(5,Math.max(0,memory.stage));
}catch(_){}
let game=null, epoch=0, sound=false, ctx=null, toastTimer=null;
const save=()=>{try{localStorage.setItem(STORE,JSON.stringify(memory));}catch(_){}};
const choice=a=>a[Math.floor(Math.random()*a.length)];
const pip=c=>PIPS[c.v]||String(c.v);
const name=c=>pip(c)+c.s;
const escape=s=>String(s).replace(/[&<>"']/g,ch=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[ch]));
const beats=(def,atk,trump)=>(def.s===atk.s&&def.v>atk.v)||(def.s===trump&&atk.s!==trump);
function sortHand(a){return a.slice().sort((x,y)=>(x.s===game.trump)-(y.s===game.trump)||x.v-y.v||SUITS.indexOf(x.s)-SUITS.indexOf(y.s))}
function audio(f=550,delay=0){
 if(!sound)return;
 try{
 ctx??=new(window.AudioContext||window.webkitAudioContext)();
 const oscillator=ctx.createOscillator(), gain=ctx.createGain(), time=ctx.currentTime+delay;
 oscillator.type="sine";oscillator.frequency.value=f;
 gain.gain.setValueAtTime(.0001,time);
 gain.gain.exponentialRampToValueAtTime(.035,time+.018);
 gain.gain.exponentialRampToValueAtTime(.0001,time+.15);
 oscillator.connect(gain);gain.connect(ctx.destination);
 oscillator.start(time);oscillator.stop(time+.16);
 }catch(_){}
}
function toast(message){const el=$("toast");el.textContent=message;el.classList.add("show");clearTimeout(toastTimer);toastTimer=setTimeout(()=>el.classList.remove("show"),2400)}
function say(message){$("bubble").textContent=message}
function report(message){
 if(!game)return;
 game.logs.unshift(message);game.logs=game.logs.slice(0,3);
 $("log").innerHTML=game.logs.map(x=>'<div class="logitem">'+escape(x)+'</div>').join("");
}
function delay(callback,ms=650){
 const active=epoch;
 setTimeout(()=>{if(epoch===active&&game&&game.phase!=="over")callback()},ms);
}
function cardHTML(card,classes="",attributes=""){
 const color=(card.s==="♥"||card.s==="♦")?" red":"";
 return '<div class="card'+color+' '+classes+'" '+attributes+' aria-label="'+name(card)+'"><span class="rank">'+pip(card)+'<small>'+card.s+'</small></span><span class="middle">'+card.s+'</span><span class="rank bottom">'+pip(card)+'</span></div>';
}
function rankSet(){
 const ranks=new Set();
 for(const p of game.table){ranks.add(p.atk.v);if(p.def)ranks.add(p.def.v)}
 return ranks;
}
function canAttack(c){
 return game.table.length<game.limit&&(!game.table.length||rankSet().has(c.v));
}
function canPlay(c){
 if(game.phase==="attack"||game.phase==="ai_take")return canAttack(c);
 if(game.phase==="defend"){
  const p=game.table[game.target];
  return !!p&&!p.def&&beats(c,p.atk,game.trump);
 }
 return false;
}
function render(){
 if(!game)return;
 $("user-score").textContent=memory.wins;
 $("ai-score").textContent=memory.losses;
 $("matches").textContent=memory.wins+memory.losses+memory.draws;
 $("trump-symbol").textContent=game.trump;
 $("trump-symbol").classList.toggle("red",game.trump==="♦"||game.trump==="♥");
 $("deck-count").textContent=game.deck.length;
 $("deck-icon").classList.toggle("empty",game.deck.length===0);
 $("ai-count").textContent=game.ai.length;
 $("ai-hand").innerHTML=game.ai.map(()=>'<div class="card back" aria-label="Закрита карта"></div>').join("");
 $("player-count").textContent=game.me.length+" карт";
 $("player-hand").innerHTML=sortHand(game.me).map(c=>cardHTML(c,canPlay(c)?"playable":"unavailable",'data-id="'+c.id+'" role="button" tabindex="'+(canPlay(c)?0:-1)+'"')).join("");
 for(const el of $("player-hand").querySelectorAll("[data-id]")){
  const act=()=>play(Number(el.dataset.id));
  el.addEventListener("click",act);
  el.addEventListener("keydown",e=>{if(e.key==="Enter"||e.key===" "){e.preventDefault();act()}});
 }
 if(game.table.length===0){
  $("table-center").innerHTML='<div class="table-empty"><div class="suits">♠ ♥ ♣ ♦</div><strong>Карти на стіл</strong><small>Хай переможе кмітливіший</small></div>';
 }else{
  $("table-center").innerHTML=game.table.map((p,i)=>{
   const selectable=game.phase==="defend"&&!p.def;
   return '<div class="pair '+(selectable?"selectable":"")+' '+(selectable&&game.target===i?"selected":"")+'" '+(selectable?'data-target="'+i+'" role="button" tabindex="0" title="Вибрати карту для відбиття"':"")+'>'+cardHTML(p.atk)+(p.def?cardHTML(p.def,"cover"):"")+'</div>';
  }).join("");
  for(const el of $("table-center").querySelectorAll("[data-target]")){
   const act=()=>{game.target=Number(el.dataset.target);render()};
   el.addEventListener("click",act);
   el.addEventListener("keydown",e=>{if(e.key==="Enter"||e.key===" "){e.preventDefault();act()}});
  }
 }
 const phases={
  attack:["Твоя атака","Підкидай карту або заверши відбитий хід"],
  ai_defend:["Суперниця захищається","Суперниця обирає карту"],
  ai_take:["Суперниця забирає","Можеш підкинути або віддати всі карти"],
  ai_attack:["Хід суперниці","Суперниця готує атаку"],
  defend:["Твій захист","Відбий карту або забери карти"],
  ai_throw:["Суперниця підкидає","Зачекай завершення ходу"],
  over:["Партію завершено","Розпочни наступну партію"]
 };
 $("phase-title").textContent=phases[game.phase]?.[0]||"Підготовка";
 $("phase-desc").textContent=phases[game.phase]?.[1]||"";
 $("hand-instruction").textContent=game.phase==="attack"?"Обери карту":game.phase==="defend"?"Обери карту для відбиття":game.phase==="ai_take"?"Можна підкинути":"Очікуй";
 $("done").hidden=!["attack","ai_take"].includes(game.phase);
 $("done").textContent=game.phase==="ai_take"?"Завершити підкидання →":"Бито ✓";
 $("done").disabled=game.phase==="attack"&&(!game.table.length||game.table.some(p=>!p.def));
 $("take").hidden=game.phase!=="defend";
 $("outcome").hidden=game.phase!=="over";
}
function pull(who,id){
 const arr=game[who],index=arr.findIndex(c=>c.id===id);
 return index<0?null:arr.splice(index,1)[0];
}
function play(id){
 if(!game||!["attack","ai_take","defend"].includes(game.phase))return;
 const card=game.me.find(c=>c.id===id);
 if(!card)return;
 if(game.phase==="defend"){
  const p=game.table[game.target];
  if(!p||p.def){toast("Обери карту на столі, яку хочеш відбити.");return}
  if(!beats(card,p.atk,game.trump)){toast("Ця карта не відбиває атаку.");return}
  pull("me",id);p.def=card;audio(760);
  report("Ти відбив "+name(p.atk)+" картою "+name(card)+".");
  const next=game.table.findIndex(t=>!t.def);
  if(next>=0){game.target=next;render();return}
  game.phase="ai_attack";render();delay(aiThrow,690);return;
 }
 if(!canAttack(card)){toast("Підкидати можна тільки номінали зі столу.");return}
 pull("me",id);game.table.push({atk:card,def:null});audio(550);
 report("Ти атакував "+name(card)+".");
 if(game.phase==="ai_take"){
  say(choice(["Підкидай, я вже забираю. 😒","Не поспішай радіти!","Ці карти мені ще знадобляться."]));
  render();return;
 }
 game.phase="ai_defend";
 say(choice(["Цікава карта. Зараз подивимось.","Думаєш, мене цим налякаєш?","Хм. Треба подумати."]));
 render();delay(aiDefend,650);
}
function aiDefend(){
 if(game.phase!=="ai_defend")return;
 const p=game.table[game.table.length-1];
 if(!p||p.def)return;
 const options=sortHand(game.ai.filter(c=>beats(c,p.atk,game.trump)));
 if(options.length){
  const selected=pull("ai",options[0].id);
  p.def=selected;game.phase="attack";audio(720);
  report("Суперниця відбила "+name(p.atk)+" картою "+name(selected)+".");
  say(choice(["Відбила! Що наступне? 😌","Це було нескладно.","Давай ще одну."]));
 }else{
  game.phase="ai_take";
  report("Суперниця вирішила забрати карти.");
  say(choice(["Гаразд, забираю. Але запам'ятаю!","Схоже, доведеться взяти.","Сьогодні тобі трохи щастить..."]));
 }
 render();
}
function done(){
 if(game.phase==="ai_take"){finishRound(false);return}
 if(game.phase==="attack"&&game.table.length&&game.table.every(t=>t.def)){finishRound(true);return}
 toast("Спочатку дочекайся завершення захисту.");
}
function take(){
 if(game.phase!=="defend")return;
 game.phase="ai_throw";report("Ти вирішив забрати карти.");
 say(choice(["Забираєш? Тоді тримай ще.","А може, була карта? 😏","Іноді краще забрати."]));
 render();
 delay(()=>{
  let thrown=0;
  while(thrown<2&&game.table.length<game.limit){
   const options=sortHand(game.ai.filter(c=>rankSet().has(c.v)));
   if(!options.length||Math.random()<.22)break;
   const c=pull("ai",options[0].id);
   game.table.push({atk:c,def:null});report("Суперниця підкинула "+name(c)+".");thrown++;
  }
  render();delay(()=>finishRound(false),550);
 },490);
}
function aiBegin(){
 if(game.phase!=="ai_attack")return;
 if(!game.ai.length){finishRound(true);return}
 const c=pull("ai",sortHand(game.ai)[0].id);
 game.table.push({atk:c,def:null});game.target=game.table.length-1;
 game.phase="defend";audio(480);
 report("Суперниця атакувала "+name(c)+".");
 say(choice(["Тепер моя черга. Відбивайся! 😏","А от на це в тебе щось є?","Не розслабляйся!"]));
 render();
}
function aiThrow(){
 if(game.phase!=="ai_attack")return;
 const options=sortHand(game.ai.filter(c=>rankSet().has(c.v)));
 if(options.length&&game.table.length<game.limit&&(Math.random()<.76||game.me.length<=2)){
  const c=pull("ai",options[0].id);
  game.table.push({atk:c,def:null});game.target=game.table.length-1;
  game.phase="defend";audio(475);
  report("Суперниця підкинула "+name(c)+".");
  say(choice(["І ще одна!","Тримай підкидну!","А цю відіб'єш?"]));
  render();
 }else finishRound(true);
}
function draw(who){while(game[who].length<6&&game.deck.length)game[who].push(game.deck.pop())}
function finishRound(defended){
 const attacker=game.attacker,defender=attacker==="me"?"ai":"me";
 const tableCards=game.table.flatMap(p=>p.def?[p.atk,p.def]:[p.atk]);
 if(defended){game.discard+=tableCards.length;report("Бито! У відбій пішло "+tableCards.length+" карт.")}
 else{game[defender].push(...tableCards);report((defender==="me"?"Ти забрав ":"Суперниця забрала ")+tableCards.length+" карт.")}
 game.table=[];draw(attacker);draw(defender);audio(defended?840:345);
 if(game.deck.length===0&&(game.me.length===0||game.ai.length===0)){
  finishGame(game.me.length===0&&game.ai.length===0?"draw":game.me.length===0?"me":"ai");return;
 }
 const next=defended?defender:attacker;
 say(choice(["Наступний раунд!","Гра ще не закінчилася.","Продовжуємо. Найцікавіше попереду!"]));
 beginRound(next);
}
function beginRound(attacker){
 game.attacker=attacker;game.table=[];game.target=0;
 game.limit=Math.min(6,game[attacker==="me"?"ai":"me"].length);
 game.phase=attacker==="me"?"attack":"ai_attack";
 render();
 if(attacker==="ai")delay(aiBegin,720);
}
function makeDeck(){
 const cards=[];let id=0;
 for(const s of SUITS)for(let v=6;v<=14;v++)cards.push({id:id++,s,v});
 for(let i=cards.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[cards[i],cards[j]]=[cards[j],cards[i]]}
 return cards;
}
function wardrobe(){
 $("stage-label").textContent=memory.stage+" / 5";
 ["scarf","jacket","skirt","blouse","tights"].forEach((key,i)=>{
  $("layer-"+key).classList.toggle("off",memory.stage>i);
  const el=document.querySelector('.garment[data-tier="'+(i+1)+'"]');
  el.classList.toggle("off",memory.stage>i);
  el.title=memory.stage>i?"Знято":"Одягнуто";
 });
}
function finishGame(winner){
 game.phase="over";
 if(winner==="me"){
  memory.wins++;
  const before=memory.stage;memory.stage=Math.min(5,before+1);
  $("outcome-emoji").textContent="🏆";$("outcome-title").textContent="Ти переміг!";
  $("outcome-text").textContent="Суперниця залишилася з картами. Партія за тобою.";
  $("outcome-clothes").textContent=before<5?"−1 річ: знято "+GARMENTS[before]+".":"Максимальний рівень. Базове закрите вбрання залишається.";
  say(choice(["Вітаю! Але це тільки одна партія.","Гаразд, цього разу ти кращий.","Реванш обов'язково буде!"]));
  audio(860);audio(1050,.13);
 }else if(winner==="ai"){
  memory.losses++;
  const before=memory.stage;memory.stage=Math.max(0,before-1);
  $("outcome-emoji").textContent="🎴";$("outcome-title").textContent="Цього разу я виграла!";
  $("outcome-text").textContent="Ти залишився з картами. Суперниця бере реванш.";
  $("outcome-clothes").textContent=before>0?"+1 річ: повернуто "+GARMENTS[before-1]+".":"Весь одяг уже на місці.";
  say(choice(["Ну що, реванш? 😏","Карти сьогодні на моєму боці.","Це була гарна партія!"]));
  audio(400);audio(500,.12);
 }else{
  memory.draws++;$("outcome-emoji").textContent="🤝";$("outcome-title").textContent="Нічия!";
  $("outcome-text").textContent="У вас обох закінчилися карти.";
  $("outcome-clothes").textContent="Гардероб без змін.";
  say("Нічия теж буває. Зіграємо ще?");
 }
 save();wardrobe();render();
}
function newGame(){
 epoch++;
 const deck=makeDeck(),me=[],ai=[];
 for(let i=0;i<6;i++){me.push(deck.pop());ai.push(deck.pop())}
 const trump=deck[0].s;
 game={deck,me,ai,trump,table:[],attacker:"me",target:0,limit:6,discard:0,phase:"",logs:[]};
 const p=Math.min(...me.filter(c=>c.s===trump).map(c=>c.v));
 const a=Math.min(...ai.filter(c=>c.s===trump).map(c=>c.v));
 const first=p<a?"me":a<p?"ai":Math.random()<.5?"me":"ai";
 report("Партію роздано. Козир — "+trump+".");
 say(choice(["Ну що, зіграємо? 😏","Готова до реваншу!","Я сьогодні налаштована серйозно."]));
 beginRound(first);
}
$("done").addEventListener("click",done);
$("take").addEventListener("click",take);
$("next").addEventListener("click",newGame);
$("restart").addEventListener("click",()=>{
 if(game?.phase==="over"){newGame();return}
 if(confirm("Скасувати поточну партію та почати нову? Рахунок не зміниться."))newGame();
});
$("sound").addEventListener("click",()=>{
 sound=!sound;$("sound").textContent=sound?"♪ Звук: увімк.":"♪ Звук: вимк.";audio(700);
});
wardrobe();newGame();