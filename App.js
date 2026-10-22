const $=s=>document.querySelector(s);
const TYPES={dtt:'Tentativa Discreta',ta:'Análise de Tarefas',nat:'Ensino Naturalístico'};
const HELPS=['Física total','Física parcial','Gestual','Verbal','Visual','Modelo','Variadas'];
const BEH=['Agressão','Autolesão','Fuga','Birra','Estereotipia'];
const REI=['Elogio','Brinquedo','Lanche','Tablet','Música','Abraço'];
const LAB={i:'Independente',a:'Com ajuda',e:'Erro'};
const ADMIN={k:'tiatay',show:'TiaTay',name:'Tia Tay',admin:true};
const esc=s=>String(s).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const norm=s=>s.normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/\s+/g,'').toLowerCase().replace(/[^a-z0-9._-]/g,'');
const uid=()=>Math.random().toString(36).slice(2,9);
const dkey=v=>{const d=new Date(v);return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0')};
const hm=v=>new Date(v).toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit'});
const TOL=15;
function aMatch(a,dx){
 const sa=(dx.agenda||[]).filter(x=>x.pid===a.pid&&x.date===a.date),ss=dx.sessions.filter(x=>x.pid===a.pid&&dkey(x.date)===a.date),pr=[];
 sa.forEach(x=>ss.forEach(s=>pr.push({x,s,d:Math.abs(new Date(s.date)-new Date(x.date+'T'+x.time+':00'))})));
 pr.sort((p,q)=>p.d-q.d);const ux=new Set(),us=new Set();
 for(const p of pr){if(ux.has(p.x.id)||us.has(p.s))continue;ux.add(p.x.id);us.add(p.s);if(p.x.id===a.id)return p.s}
 return null;
}
function aStat(a,dx){
 dx=dx||db;const sc=new Date(a.date+'T'+a.time+':00'),now=new Date();
 const s=aMatch(a,dx);
 if(s){const m=Math.round((new Date(s.date)-sc)/60000);return m>TOL?{c:'rt',t:'Realizada com atraso de '+m+' min'}:{c:'ok',t:'Realizada no horário'}}
 if(now<sc)return{c:'ag',t:'Agendada'};
 const m=Math.round((now-sc)/60000);
 if(m<=TOL)return{c:'ag',t:'Aguardando início'};
 return dkey(now)===a.date?{c:'at',t:'Atrasada: '+m+' min sem registro'}:{c:'no',t:'Não realizada'};
}
/* ---------- Firebase (nuvem) ---------- */
const cfgErr=typeof FIREBASE_CONFIG==='undefined'||!FIREBASE_CONFIG.apiKey||/COLE/.test(FIREBASE_CONFIG.apiKey);
if(!cfgErr)firebase.initializeApp(FIREBASE_CONFIG);
const auth=cfgErr?null:firebase.auth(),fs=cfgErr?null:firebase.firestore();
if(fs)fs.enablePersistence({synchronizeTabs:true}).catch(()=>{});
const ADMIN_MAIL=typeof ADMIN_EMAIL==='undefined'?'tiatay@tiatay.app':ADMIN_EMAIL;
const emailOf=k=>k===ADMIN.k?ADMIN_MAIL:k+'@tiatay.app';
const EMPTY=()=>({patients:[],sessions:[],agenda:[]});
const dk=k=>'abacoleta_'+k;
const TABS=['patients','sessions','agenda'];
const CACHE={},LAST={},LS={},UNS=[];
let U=[],uMap={},CHATS=[],comsA=[],comsB=[],booting=true,flash=null,authMsg='',tid=0;
const erro=e=>{console.error(e);const t=$('#st');if(t)t.textContent='Erro: '+((e&&e.code)||'sincronização')};
const jstr=o=>JSON.stringify(o,(k,v)=>v&&typeof v==='object'&&!Array.isArray(v)?Object.keys(v).sort().reduce((r,x)=>(r[x]=v[x],r),{}):v);
const mk=(id,d)=>({id,k:d.k,show:d.show||d.name,name:d.name,foto:d.foto||'',admin:d.r==='a',role:d.r==='p'?'pai':d.r==='f'?'func':undefined,kid:d.kid});
const allUsers=()=>U;
const load=k=>{listen(k);return CACHE[k]||EMPTY()};
const dref=(k,t)=>fs.collection('data').doc(k).collection(t);
async function commit(ops){try{for(let i=0;i<ops.length;i+=400){const b=fs.batch();ops.slice(i,i+400).forEach(f=>f(b));await b.commit()}}catch(e){erro(e)}}

/* re-desenha a tela quando chegam dados novos de outro aparelho */
function after(){
 clearTimeout(tid);
 tid=setTimeout(()=>{
  if(!user)return;
  const ae=document.activeElement||{},typing=['INPUT','TEXTAREA','SELECT'].includes(ae.tagName)&&ae.id!=='cm';
  if(!ses&&!eg&&!ed&&!typing)render();
 },120);
}
/* escuta em tempo real os dados de um profissional (responsáveis só enxergam a própria criança) */
function listen(k){
 if(!k||LS[k]||!fs)return;LS[k]=1;
 const c=CACHE[k]=CACHE[k]||EMPTY(),lk=LAST[k]={patients:{},sessions:{},agenda:{}},pai=user&&roleOf(user)==='p',pid=pai?(user.kid||{}).pid:null;
 const fill=(t,docs)=>{c[t]=docs.map(d=>({...d.data(),id:d.id}));lk[t]={};c[t].forEach(o=>lk[t][o.id]=jstr(o));after()};
 const on=(t,q)=>UNS.push(q.onSnapshot(s=>fill(t,s.docs),e=>console.warn(t,e.code)));
 if(pai){
  UNS.push(dref(k,'patients').doc(pid).onSnapshot(s=>fill('patients',s.exists?[s]:[]),e=>console.warn(e.code)));
  on('sessions',dref(k,'sessions').where('pid','==',pid));on('agenda',dref(k,'agenda').where('pid','==',pid));
 }else TABS.forEach(t=>on(t,dref(k,t)));
}
/* grava só o que mudou em db (patients, sessions, agenda) */
function save(){
 const k=vk;if(!fs||!LAST[k])return;const ops=[];
 TABS.forEach(t=>{
  const old=LAST[k][t],seen={};
  (db[t]||[]).forEach(o=>{seen[o.id]=1;const s=jstr(o);if(old[o.id]!==s){old[o.id]=s;const r=dref(k,t).doc(o.id),v=JSON.parse(s);ops.push(b=>b.set(r,v))}});
  Object.keys(old).forEach(id=>{if(!seen[id]){delete old[id];const r=dref(k,t).doc(id);ops.push(b=>b.delete(r))}});
 });
 if(ops.length)commit(ops);
}
function mergeIn(x){TABS.forEach(t=>{db[t]=db[t]||[];(x[t]||[]).forEach(o=>{if(o&&o.id&&!db[t].some(y=>y.id===o.id))db[t].push(o)})})}
function startShared(){
 const r=roleOf(user),uc=fs.collection('users'),cc=fs.collection('chats'),mc=fs.collection('coms');
 const addU=(docs,all)=>{
  if(all)uMap={};
  docs.forEach(d=>{uMap[d.id]=mk(d.id,d.data())});
  U=Object.values(uMap).sort((a,b)=>(b.admin?1:0)-(a.admin?1:0)||String(a.name).localeCompare(String(b.name)));
  if(all)U.filter(u=>u.role!=='pai').forEach(u=>listen(u.k));
  after();
 };
 if(r==='a')UNS.push(uc.onSnapshot(s=>addU(s.docs,true),e=>console.warn('users',e.code)));
 else{
  UNS.push(uc.where('r','==','a').onSnapshot(s=>addU(s.docs),e=>console.warn('admin',e.code)));
  if(r==='p'&&user.kid)UNS.push(uc.where('k','==',user.kid.uk).onSnapshot(s=>addU(s.docs),e=>console.warn('prof',e.code)));
 }
 UNS.push((r==='a'?cc:cc.where('th','==',user.k)).onSnapshot(s=>{CHATS=s.docs.map(d=>({...d.data(),id:d.id})).sort((a,b)=>a.t<b.t?-1:1);after()},e=>console.warn('chats',e.code)));
 const cl=(q,set)=>UNS.push(q.onSnapshot(s=>{set(s.docs.map(d=>({...d.data(),id:d.id})));after()},e=>console.warn('coms',e.code)));
 if(r==='a')cl(mc,v=>comsA=v);
 else{cl(mc.where('to','==','t'),v=>comsA=v);cl(mc.where('to','==',r==='p'?'p':'f'),v=>comsB=v)}
 if(r!=='p'){const rc=fs.collection('reports');UNS.push((r==='a'?rc:rc.where('k','==',user.k)).onSnapshot(s=>{REPS=s.docs.map(d=>({...d.data(),id:d.id}));after()},e=>console.warn('reports',e.code)))}
}
function stopAll(){
 UNS.splice(0).forEach(f=>{try{f()}catch(e){}});
 [LS,CACHE,LAST].forEach(o=>Object.keys(o).forEach(k=>delete o[k]));
 U=[];uMap={};CHATS=[];comsA=[];comsB=[];REPS=[];ed=null;relPid='';
}
/* cria o login de outra pessoa sem deslogar a administradora (usa um segundo "app" do Firebase) */
async function criarConta(k,senha){
 const a2=(firebase.apps.find(x=>x.name==='sec')||firebase.initializeApp(FIREBASE_CONFIG,'sec')).auth();
 let c;
 try{c=await a2.createUserWithEmailAndPassword(emailOf(k),senha)}
 catch(e){
  if(e.code!=='auth/email-already-in-use')throw e;
  try{c=await a2.signInWithEmailAndPassword(emailOf(k),senha)}catch(e2){throw e}
 }
 const id=c.user.uid;await a2.signOut();return id;
}
const errCriar=e=>{const c=e&&e.code||'';
 if(c==='auth/email-already-in-use')return 'Esse login já existiu antes no Firebase. Apague-o em Authentication no Console ou use outro nome.';
 if(c==='auth/operation-not-allowed')return 'Ative o login por E-mail/Senha no Firebase (Authentication).';
 if(c.includes('permission'))return 'Sem permissão. Confira as regras do Firestore.';
 if(c==='auth/network-request-failed')return 'Sem internet.';
 return 'Não foi possível criar: '+(c||e);};
function apagarUsuario(k){
 const u=U.find(x=>x.k===k);if(!u||u.admin)return;
 const refs=[fs.collection('users').doc(u.id),fs.collection('cpfs').doc(k)],c=CACHE[k];
 if(c)TABS.forEach(t=>c[t].forEach(o=>refs.push(dref(k,t).doc(o.id))));
 CHATS.filter(x=>x.th===k).forEach(x=>refs.push(fs.collection('chats').doc(x.id)));
 if(vk===k){vk=user.k;db=load(vk)}
 commit(refs.map(r=>b=>b.delete(r)));
}
function setFoto(f){const me=U.find(u=>u.id===user.id);user.foto=f;if(me)me.foto=f;fs.collection('users').doc(user.id).update({foto:f}).catch(erro)}




let user=null,vk='',db=EMPTY(),view='pac',cur=null,eg=null,ses=null,gp='',gg='',msg='',delAsk='',finMsg=null,cth='',rf0=false;
let cd=dkey(new Date()),cm={y:new Date().getFullYear(),m:new Date().getMonth()};

const P=id=>db.patients.find(p=>p.id===id);

async function hash(s){
 try{const b=await crypto.subtle.digest('SHA-256',new TextEncoder().encode('aba:'+s));return[...new Uint8Array(b)].map(x=>x.toString(16).padStart(2,'0')).join('')}
 catch(e){let h=5381;for(const c of 'aba:'+s)h=(h*33^c.charCodeAt(0))>>>0;return'f'+h}
}
function cpfOk(c){
 if(c.length!==11||/^(\d)\1{10}$/.test(c))return false;
 for(const n of[9,10]){let s=0;for(let i=0;i<n;i++)s+=c[i]*(n+1-i);if((s*10%11)%10!=c[n])return false}
 return true;
}
function pct(s){let t={i:0,a:0,e:0};Object.values(s.trials).forEach(a=>a.forEach(c=>t[c[0]]++));const n=t.i+t.a+t.e;return{n,i:n?Math.round(t.i/n*100):0,a:n?Math.round(t.a/n*100):0,e:n?Math.round(t.e/n*100):0}}

/* ---------- Login ---------- */
function vAuth(){
 const logo='<span class="logo hero" role="img" aria-label="Tia Tay, Desenvolvimento Infantil e Neurodivergências"></span><h2 style="text-align:center">Tia Tay Coleta</h2>';
 if(cfgErr)return logo+'<div class="card"><p class="am">Falta configurar o Firebase. Preencha o arquivo firebase-config.js.</p></div>';
 if(booting)return logo+'<p class="mu" style="text-align:center">Carregando...</p>';
 return logo+'<div class="card"><label for="lu">Usuário (nome sem espaços)</label><input id="lu" autocomplete="username" autocapitalize="none"><label for="lp">Senha</label><input id="lp" type="password" autocomplete="current-password"><p class="am" id="am">'+esc(authMsg)+'</p><button class="btn pr big" data-a="login">Entrar</button><button class="lnk" data-a="forgot">Esqueci a senha do administrador</button><p class="mu">Não tem acesso? Peça à Tia Tay para criar seu usuário.</p></div>'+instCard();
}
function enter(x){stopAll();user=x;uMap={[x.id]:x};U=[x];vk=x.k;startShared();db=roleOf(x)==='p'?EMPTY():load(vk);view=roleOf(x)==='p'?'cal':'pac';cur=null;eg=null;ses=null;cth='';finMsg=null;authMsg='';ed=null;relPid='';booting=false;render()}
async function doLogin(){
 const ru=$('#lu').value.trim().toLowerCase(),k=ru===ADMIN_MAIL.toLowerCase()?ADMIN.k:norm(ru),raw=$('#lp').value,p=k===ADMIN.k?raw:raw.replace(/\D/g,''),am=$('#am');
 if(!k||!p){am.textContent='Digite usuário e senha.';return}
 am.textContent='Entrando...';
 try{await auth.signInWithEmailAndPassword(emailOf(k),p)}
 catch(e){am.textContent=e.code==='auth/network-request-failed'?'Sem conexão com a internet.':e.code==='auth/too-many-requests'?'Muitas tentativas. Aguarde alguns minutos.':'Usuário ou senha incorretos.'}
}
async function doAddUser(){
 const name=$('#un').value.trim().replace(/\s+/g,' '),cpf=$('#uc').value.replace(/\D/g,''),am=$('#am');
 if(name.length<3)return am.textContent='Digite o nome completo.';
 if(!cpfOk(cpf))return am.textContent='CPF inválido.';
 const k=norm(name),ph=await hash(cpf);
 if(k.length<3)return am.textContent='Nome inválido.';
 if(k===ADMIN.k||U.some(z=>z.k===k))return am.textContent='Já existe um usuário com esse nome.';
 try{
  if(!(await fs.collection('cpfs').where('ph','==',ph).get()).empty)return am.textContent='Este CPF já tem usuário.';
  am.textContent='Criando...';
  const id=await criarConta(k,cpf);
  await fs.collection('users').doc(id).set({k,show:name.replace(/\s+/g,''),name,r:'f'});
  await fs.collection('cpfs').doc(k).set({ph});
  flash={id:'am',ok:1,txt:'Usuário criado: '+name.replace(/\s+/g,'')+'. A senha é o CPF.'};
 }catch(e){return am.textContent=errCriar(e)}
 render();
}

/* ---------- Telas ---------- */
function vPac(){
 if(!cur)return '<h2>Pacientes</h2><div class="card"><input id="pn" placeholder="Nome do paciente"><button class="btn pr big" data-a="addp">Adicionar paciente</button></div>'+(db.patients.map(p=>`<div class="card row2"><span><b>${esc(p.name)}</b><br><span class="mu">${p.programs.length} programa(s)</span></span><button class="btn" data-a="open" data-id="${p.id}">Abrir</button></div>`).join('')||'<p class="mu">Nenhum paciente ainda. Adicione o primeiro acima.</p>');
 const p=P(cur);if(!p){cur=null;return vPac()}
 if(eg)return vGForm(p);
 return `<button class="lnk" data-a="back">‹ Pacientes</button><h2>${esc(p.name)}</h2>`+p.programs.map(g=>`<div class="card"><b>${esc(g.name)}</b><div class="mu">${TYPES[g.type]}, ${g.items.length} itens${(g.helps||[]).length?'. Ajuda: '+g.helps.join(', ')+(g.helpsNote?' ('+esc(g.helpsNote)+')':''):''}</div>${g.desc?`<p class="mu">${esc(g.desc)}</p>`:''}<div class="row"><button class="btn pr" data-a="start" data-id="${g.id}">Iniciar sessão</button><button class="btn" data-a="gedit" data-id="${g.id}">Editar</button></div></div>`).join('')+'<button class="btn pr big" data-a="gnew">Novo programa</button>';
}
function vGForm(p){
 const g=eg==='new'?{name:'',type:'dtt',desc:'',helps:[],items:[]}:p.programs.find(x=>x.id===eg);
 if(!g){eg=null;return vPac()}
 return `<button class="lnk" data-a="gcancel">‹ Voltar</button><h2>${eg==='new'?'Novo programa':'Editar programa'}</h2><div class="card"><label for="gn">Nome</label><input id="gn" value="${esc(g.name)}"><label for="gt">Tipo de ensino</label><select id="gt">${Object.entries(TYPES).map(([k,v])=>`<option value="${k}" ${k===g.type?'selected':''}>${v}</option>`).join('')}</select><label for="gd">Descrição do programa</label><textarea id="gd" rows="3">${esc(g.desc||'')}</textarea><label>Tipos de ajuda usados</label><div style="margin-bottom:10px">${HELPS.map(h=>`<button class="chip ${(g.helps||[]).includes(h)?'on':''}" data-a="gh" data-k="${h}">${h}</button>`).join('')}</div><div id="gvw" style="margin-bottom:10px" ${(g.helps||[]).includes('Variadas')?'':'hidden'}><label for="gv">Quais ajudas variadas? Escreva aqui</label><input id="gv" value="${esc(g.helpsNote||'')}" placeholder="Ex.: toque no ombro, apontar, dica sonora"></div><label for="gi">Alvos ou passos (um por linha)</label><textarea id="gi" rows="5">${esc(g.items.join('\n'))}</textarea><button class="btn pr big" data-a="gsave">Salvar programa</button>${eg==='new'?'':`<div class="row"><button class="btn ce" data-a="gdel">${delAsk==='g'+eg?'Confirmar exclusão':'Excluir programa'}</button></div>`}</div>`;
}
function vSes(){
 if(!ses)return '<h2>Sessão</h2><p class="mu">Abra um paciente e toque em “Iniciar sessão”.</p>';
 const p=P(ses.pid),hs=ses.prog.helps||[];
 return `<h2>${esc(p?p.name:'Paciente')}</h2><div class="mu" style="margin-bottom:12px">${esc(ses.prog.name)}, ${TYPES[ses.prog.type]}<br>Início: ${hm(ses.date)}${ses.prog.desc?'<br>'+esc(ses.prog.desc):''}</div>`+
 (hs.length?`<div class="card"><h3>Tipo de ajuda desta sessão</h3>${hs.map(h=>`<button class="chip ${ses.h===h?'on':''}" data-a="sh" data-k="${h}">${h}</button>`).join('')}${ses.h==='Variadas'&&ses.prog.helpsNote?`<div class="mu">${esc(ses.prog.helpsNote)}</div>`:''}</div>`:'')+
 ses.prog.items.map((it,n)=>`<div class="card"><b>${esc(it)}</b><div class="dots">${ses.trials[it].map(c=>`<i class="d${c[0]}" title="${esc(c)}"></i>`).join('')}</div><div class="row">${['i','a','e'].map(c=>`<button class="btn c${c}" data-a="t" data-n="${n}" data-c="${c}">${LAB[c]}</button>`).join('')}<button class="btn" data-a="undo" data-n="${n}" aria-label="Desfazer">↶</button></div></div>`).join('')+
 '<div class="card"><h3>Comportamentos inadequados</h3>'+BEH.map(b=>`<div class="row2"><span>${b}</span><span><button class="btn" data-a="bm" data-k="${b}">−</button> <b>${ses.beh[b]||0}</b> <button class="btn" data-a="bp" data-k="${b}">+</button></span></div>`).join('')+'</div>'+
 '<div class="card"><h3>Reforçadores usados</h3>'+REI.map(r=>`<button class="chip ${ses.rf.includes(r)?'on':''}" data-a="rf" data-k="${r}">${r}</button>`).join('')+'</div>'+
 `<div class="card"><h3>Fatores externos e observações</h3><textarea id="ob" rows="3">${esc(ses.obs)}</textarea></div><button class="btn pr big" data-a="fin">Finalizar e salvar</button>`;
}
function vGra(){
 const pt=P(gp),pr=pt&&pt.programs.find(g=>g.id===gg);
 let h='<h2>Gráficos</h2><div class="card"><select id="sp"><option value="">Escolha o paciente</option>'+db.patients.map(p=>`<option value="${p.id}" ${p.id===gp?'selected':''}>${esc(p.name)}</option>`).join('')+'</select>';
 if(pt)h+='<select id="sg"><option value="">Escolha o programa</option>'+pt.programs.map(g=>`<option value="${g.id}" ${g.id===gg?'selected':''}>${esc(g.name)}</option>`).join('')+'</select>';
 h+='</div>';
 if(!pr)return h+'<p class="mu">Escolha um paciente e um programa para ver a evolução.</p>';
 const ss=db.sessions.filter(s=>s.pid===gp&&s.prog.id===gg).sort((a,b)=>a.date<b.date?-1:1);
 if(!ss.length)return h+'<p class="mu">Ainda não há sessões deste programa.</p>';
 const W=320,H=160,x=i=>ss.length>1?30+i*(W-50)/(ss.length-1):W/2,y=v=>H-25-v*(H-45)/100;
 const pts=ss.map((s,i)=>`${x(i)},${y(pct(s).i)}`).join(' ');
 h+=`<div class="card"><h3>% de respostas independentes</h3><svg viewBox="0 0 ${W} ${H}" width="100%" role="img" aria-label="Evolução por sessão">`+
 [0,50,100].map(v=>`<line x1="26" x2="${W-10}" y1="${y(v)}" y2="${y(v)}" stroke="var(--bd)"/><text x="2" y="${y(v)+4}" font-size="10" fill="var(--mu)">${v}%</text>`).join('')+
 `<polyline points="${pts}" fill="none" stroke="var(--pr)" stroke-width="2.5"/>`+
 ss.map((s,i)=>`<circle cx="${x(i)}" cy="${y(pct(s).i)}" r="4" fill="var(--pr)"/><text x="${x(i)}" y="${H-8}" font-size="9" text-anchor="middle" fill="var(--mu)">${new Date(s.date).toLocaleDateString('pt-BR',{day:'2-digit',month:'2-digit'})}</text>`).join('')+'</svg></div>';
 h+='<div class="card sc"><table><tr><th>Data</th><th>Indep.</th><th>Ajuda</th><th>Erro</th><th>Comport.</th></tr>'+ss.map(s=>{const p=pct(s);return `<tr><td>${new Date(s.date).toLocaleDateString('pt-BR')}</td><td>${p.i}%</td><td>${p.a}%</td><td>${p.e}%</td><td>${Object.values(s.beh).reduce((a,b)=>a+b,0)}</td></tr>`}).join('')+'</table></div>';
 return h;
}
function vCal(){
 const {y,m}=cm,off=new Date(y,m,1).getDay(),nd=new Date(y,m+1,0).getDate(),bs={},ba={},ad=user.admin;
 db.sessions.forEach(s=>{(bs[dkey(s.date)]=bs[dkey(s.date)]||[]).push(s)});
 (db.agenda||[]).forEach(a=>{(ba[a.date]=ba[a.date]||[]).push(a)});
 let cells='<span></span>'.repeat(off);
 for(let d=1;d<=nd;d++){const k=y+'-'+String(m+1).padStart(2,'0')+'-'+String(d).padStart(2,'0'),as=ba[k]||[],bad=as.some(a=>['at','no'].includes(aStat(a).c));cells+=`<button class="day ${(bs[k]||[]).length?'has':''} ${as.length?'ap':''} ${bad?'bad':''} ${k===cd?'sel':''}" data-a="day" data-k="${k}">${d}${as.length?`<i>${as.length}</i>`:''}</button>`}
 const pn=id=>{const p=P(id);return p?p.name:'Paciente removido'};
 const ags=(ba[cd]||[]).sort((a,b)=>a.time<b.time?-1:1).map(a=>{const st=aStat(a);return `<div class="card st-${st.c}"><div class="row2"><b>${a.time} - ${esc(pn(a.pid))}</b><span class="tag ${st.c}">${st.t}</span></div>${a.note?`<div class="mu">${esc(a.note)}</div>`:''}<div class="row"><button class="btn" data-a="aopen" data-id="${a.pid}">Abrir paciente</button>${ad?`<button class="btn ce" data-a="adel" data-id="${a.id}">${delAsk==='a'+a.id?'Confirmar remoção':'Remover'}</button>`:''}</div></div>`}).join('');
 const ses_=(bs[cd]||[]).map(s=>{const p=pct(s),mins=s.end?Math.round((new Date(s.end)-new Date(s.date))/60000):0;return `<div class="card"><b>${esc(pn(s.pid))}</b><div class="mu">${esc(s.prog.name)}<br>${p.i}% independente em ${p.n} registros${ad?`<br>Início ${hm(s.date)}${s.end?`, fim ${hm(s.end)} (${mins} min)`:''}${s.end?` <span class="tag ${mins>=MIN_SESSAO?'ok':'at'}">${mins>=MIN_SESSAO?'Completa':'Incompleta'}</span>`:''}`:''}</div>${s.obs?`<div class="mu">${esc(s.obs)}</div>`:''}</div>`}).join('');
 const vn=(allUsers().find(u=>u.k===vk)||{}).name||'';
 const form=ad?(db.patients.length?`<div class="card"><h3>Agendar atendimento</h3><label for="ad">Dia</label><input id="ad" type="date" value="${cd}"><label for="ah">Horário</label><input id="ah" type="time"><label for="ap">Paciente</label><select id="ap">${db.patients.map(p=>`<option value="${p.id}">${esc(p.name)}</option>`).join('')}</select><label for="an">Observação</label><input id="an"><p class="am" id="am"></p><button class="btn pr big" data-a="aadd">Adicionar à agenda de ${esc(vn)}</button></div>`:'<p class="mu">Para agendar, cadastre um paciente na aba Pacientes desta pessoa.</p>'):'';
 return `${finMsg?`<div class="card fin ${finMsg.ok?'st-ok':'st-at'}"><b>Sessão finalizada</b><br>Duração: ${finMsg.mn} min<br>${finMsg.ok?'Sessão completa.':'Sessão incompleta: menos de '+MIN_SESSAO+' min.'}</div>`:''}<h2>Agenda</h2><div class="card"><div class="row2"><button class="btn" data-a="mo" data-d="-1" aria-label="Mês anterior">‹</button><b>${new Date(y,m,1).toLocaleDateString('pt-BR',{month:'long',year:'numeric'})}</b><button class="btn" data-a="mo" data-d="1" aria-label="Próximo mês">›</button></div><div class="cal">${['D','S','T','Q','Q','S','S'].map(x=>`<small>${x}</small>`).join('')}${cells}</div></div><h3>${cd.split('-').reverse().join('/')}</h3>${ags||''}${ses_}${!ags&&!ses_?'<p class="mu">Nada agendado nem registrado neste dia.</p>':''}${form}`;
}
function vDad(){
 let old=false;try{old=!!localStorage.getItem(dk(vk))}catch(e){}
 return `<h2>Dados</h2><div class="card"><b>${db.sessions.length}</b> sessão(ões) e <b>${db.patients.length}</b> paciente(s) salvos na nuvem<p class="mu">${esc(msg)}</p></div>`+(old?'<div class="card"><h3>Dados antigos deste aparelho</h3><p class="mu">Há dados da versão anterior, salvos só neste celular. Envie para a nuvem uma vez.</p><button class="btn pr big" data-a="mig">Enviar para a nuvem</button></div>':'')+`<div class="card"><h3>Backup</h3><textarea id="bk" rows="5" placeholder="O backup aparece aqui. Cole um backup para restaurar."></textarea><div class="row"><button class="btn" data-a="exp">Gerar backup</button><button class="btn" data-a="imp">Restaurar</button></div></div>`;
}
/* ---------- Papéis, fotos, comunicados e chat ---------- */
const staff=()=>allUsers().filter(u=>u.role!=='pai');
const roleOf=u=>u.admin?'a':u.role==='pai'?'p':'f';
const MIN_SESSAO=50;
const lget=(k,d)=>{try{return JSON.parse(localStorage.getItem(k))||d}catch(e){return d}};
const lset=(k,v)=>{try{localStorage.setItem(k,JSON.stringify(v))}catch(e){}};
const foto=k=>(allUsers().find(u=>u.k===k)||{}).foto||'';
const av=(k,name,sz)=>{const f=foto(k);return f.startsWith('data:image/')?`<span class="av ${sz||''}" style="background-image:url(${f})"></span>`:`<span class="av ${sz||''}">${esc(((name||'?').trim()[0]||'?').toUpperCase())}</span>`};
const chats=()=>CHATS;
const coms=()=>{const m={};comsA.concat(comsB).forEach(c=>m[c.id]=c);return Object.values(m)};
const comFor=()=>coms().filter(c=>roleOf(user)==='a'||c.to==='t'||c.to===roleOf(user)).sort((a,b)=>a.t<b.t?1:-1);
const unreadChat=()=>{const m=chats();return roleOf(user)==='a'?m.filter(x=>x.from!==ADMIN.k&&!x.r).length:m.filter(x=>x.th===user.k&&x.from===ADMIN.k&&!x.r).length};
const unreadCom=()=>{if(roleOf(user)==='a')return 0;let s='';try{s=localStorage.getItem('abavisto_'+user.k)||''}catch(e){}return comFor().filter(c=>c.t>s).length};
function markRead(th){const a=roleOf(user)==='a',ids=[];CHATS.forEach(x=>{if(x.th===th&&!x.r&&(a?x.from!==ADMIN.k:x.from===ADMIN.k)){x.r=true;ids.push(x.id)}});ids.forEach(id=>fs.collection('chats').doc(id).update({r:true}).catch(erro))}
async function doAddParent(){
 const name=$('#rn').value.trim().replace(/\s+/g,' '),cpf=$('#rc').value.replace(/\D/g,''),uk=$('#re').value,pid=$('#rp').value,am=$('#am2');
 if(name.length<3)return am.textContent='Digite o nome do responsável.';
 if(!cpfOk(cpf))return am.textContent='CPF inválido.';
 if(!uk||!pid)return am.textContent='Escolha a funcionária e a criança.';
 const k=norm(name),ph=await hash(cpf);
 if(k.length<3)return am.textContent='Nome inválido.';
 if(k===ADMIN.k||U.some(z=>z.k===k))return am.textContent='Já existe um usuário com esse nome.';
 try{
  if(!(await fs.collection('cpfs').where('ph','==',ph).get()).empty)return am.textContent='Este CPF já tem usuário.';
  am.textContent='Criando...';
  const id=await criarConta(k,cpf);
  await fs.collection('users').doc(id).set({k,show:name.replace(/\s+/g,''),name,r:'p',kid:{uk,pid}});
  await fs.collection('cpfs').doc(k).set({ph});
  flash={id:'am2',ok:1,txt:'Conta criada: '+name.replace(/\s+/g,'')+'. A senha é o CPF.'};
 }catch(e){return am.textContent=errCriar(e)}
 render();
}
function vAgPai(){
 const kd=user.kid||{},d=load(kd.uk),p=d.patients.find(x=>x.id===kd.pid),ow=allUsers().find(u=>u.k===kd.uk),hoje=dkey(new Date());
 const L=(d.agenda||[]).filter(a=>a.pid===kd.pid).sort((a,b)=>(a.date+a.time)<(b.date+b.time)?-1:1);
 const lab=a=>{const c=aStat(a,d).c;return c==='ok'||c==='rt'?['Realizada','ok']:c==='no'?['Não realizada','no']:['Agendada','ag']};
 const card=a=>{const [t,c]=lab(a);return `<div class="card"><div class="row2"><b>${a.date.split('-').reverse().join('/')} às ${a.time}</b><span class="tag ${c}">${t}</span></div><div class="mu">${esc(ow?ow.name:'')}${a.note?'<br>'+esc(a.note):''}</div></div>`};
 const prox=L.filter(a=>a.date>=hoje),ant=L.filter(a=>a.date<hoje).reverse();
 return `<h2>Agenda de ${esc(p?p.name:'seu filho(a)')}</h2><h3>Próximos atendimentos</h3>`+(prox.map(card).join('')||'<p class="mu">Nenhum atendimento agendado.</p>')+(ant.length?'<h3>Anteriores</h3>'+ant.map(card).join(''):'');
}
function vAvi(){
 const ad=roleOf(user)==='a',L=comFor();
 if(!ad)try{localStorage.setItem('abavisto_'+user.k,new Date().toISOString())}catch(e){}
 return '<h2>Comunicados</h2>'+(ad?'<div class="card"><h3>Novo comunicado</h3><label for="cti">Título</label><input id="cti"><label for="cx">Mensagem</label><textarea id="cx" rows="4"></textarea><label for="cw">Para</label><select id="cw"><option value="t">Todos</option><option value="p">Pais e responsáveis</option><option value="f">Funcionárias</option></select><p class="am" id="am"></p><button class="btn pr big" data-a="cadd">Enviar comunicado</button></div>':'')+(L.map(c=>`<div class="card"><div class="row2"><b>${esc(c.title)}</b><span class="mu">${new Date(c.t).toLocaleDateString('pt-BR')}</span></div><p style="white-space:pre-wrap;margin:6px 0">${esc(c.txt)}</p>${ad?`<div class="row2"><span class="tag">${({t:'Todos',p:'Pais',f:'Funcionárias'})[c.to]}</span><button class="btn ce" data-a="cdel" data-id="${c.id}">${delAsk==='c'+c.id?'Confirmar exclusão':'Excluir'}</button></div>`:''}</div>`).join('')||'<p class="mu">Nenhum comunicado ainda.</p>');
}
function vCha(){
 const ad=roleOf(user)==='a';
 if(ad&&!cth){
  const m=chats();
  return '<h2>Conversas</h2>'+(allUsers().filter(u=>!u.admin).map(u=>{const mm=m.filter(x=>x.th===u.k),l=mm[mm.length-1],un=mm.filter(x=>x.from!==ADMIN.k&&!x.r).length;return `<button class="conv" data-a="cth" data-k="${u.k}">${av(u.k,u.name)}<span class="cb"><b>${esc(u.name)}</b><span class="mu">${u.role==='pai'?'Responsável':'Funcionária'}${l?': '+esc(l.txt.slice(0,40)):''}</span></span>${un?`<i class="bd2">${un}</i>`:''}</button>`}).join('')||'<p class="mu">Crie usuários na aba Equipe para conversar.</p>');
 }
 const th=ad?cth:user.k,other=ad?allUsers().find(u=>u.k===th):(allUsers().find(u=>u.admin)||ADMIN);
 if(!other){cth='';return vCha()}
 markRead(th);
 const mm=chats().filter(x=>x.th===th);
 return `${ad?'<button class="lnk" data-a="cback">‹ Conversas</button>':''}<div class="chead">${av(other.k,other.name,'lg')}<b>${esc(other.name)}</b></div><div class="msgs">${mm.map(x=>`<div class="bub ${x.from===user.k?'me':'ot'}">${esc(x.txt)}<small>${hm(x.t)}</small></div>`).join('')||'<p class="mu" style="text-align:center">Nenhuma mensagem ainda. Diga olá!</p>'}</div><div class="cbar"><input id="cm" placeholder="Mensagem" autocomplete="off"><button class="btn pr" data-a="send">Enviar</button></div>`;
}
function vPer(){
 return `<h2>Meu perfil</h2><div class="card" style="text-align:center">${av(user.k,user.name,'xl')}<h3 style="margin-top:10px">${esc(user.name)}</h3><p class="mu">Usuário: ${esc(user.show)}</p><label class="btn" for="pf" style="display:inline-block;cursor:pointer">Escolher foto</label><input id="pf" type="file" accept="image/*" style="position:absolute;left:-9999px">${foto(user.k)?'<div class="row"><button class="btn" data-a="pdel">Remover foto</button></div>':''}</div>${instCard()}`;
}
function vEq(){
 const hoje=dkey(new Date()),ptn=(d,id)=>{const p=d.patients.find(x=>x.id===id);return p?p.name:'Paciente removido'};
 const tl=staff().flatMap(u=>{const d=load(u.k);return(d.agenda||[]).filter(a=>a.date===hoje).map(a=>({u,a,d}))}).sort((x,y)=>x.a.time<y.a.time?-1:1);
 const inc=d=>d.sessions.filter(s=>s.end&&(new Date(s.end)-new Date(s.date))/60000<MIN_SESSAO).length;
 const emp=staff(),opts=k=>load(k).patients.map(p=>`<option value="${p.id}">${esc(p.name)}</option>`).join('');
 const cards=emp.map(u=>{const d=load(u.k),last=d.sessions.map(s=>s.date).sort().pop(),pend=(d.agenda||[]).filter(a=>['at','no'].includes(aStat(a,d).c)).length;return `<div class="card"><span class="who">${av(u.k,u.name)}<b>${esc(u.name)}</b>${u.admin?' (administradora)':''}</span><div class="mu">Usuário: ${esc(u.show)}<br>${d.patients.length} paciente(s), ${d.sessions.length} sessão(ões). Última: ${last?new Date(last).toLocaleDateString('pt-BR'):'nenhuma'}<br>Pendências na agenda: ${pend}. Sessões incompletas: ${inc(d)}</div><div class="row"><button class="btn pr" data-a="see" data-k="${u.k}">Ver e editar dados</button><button class="btn" data-a="seecal" data-k="${u.k}">Agenda</button>${u.admin?'':`<button class="btn" data-a="chatwith" data-k="${u.k}">Conversar</button><button class="btn ce" data-a="udel" data-k="${u.k}">${delAsk==='u'+u.k?'Confirmar exclusão':'Excluir'}</button>`}</div></div>`}).join('');
 const pais=allUsers().filter(u=>u.role==='pai').map(u=>{const d=load(u.kid.uk),p=d.patients.find(x=>x.id===u.kid.pid),o=allUsers().find(x=>x.k===u.kid.uk);return `<div class="card"><span class="who">${av(u.k,u.name)}<b>${esc(u.name)}</b></span><div class="mu">Usuário: ${esc(u.show)}<br>Criança: ${esc(p?p.name:'removida')}. Profissional: ${esc(o?o.name:'removida')}</div><div class="row"><button class="btn" data-a="chatwith" data-k="${u.k}">Conversar</button><button class="btn ce" data-a="udel" data-k="${u.k}">${delAsk==='u'+u.k?'Confirmar exclusão':'Excluir'}</button></div></div>`}).join('')||'<p class="mu">Nenhuma conta de responsável ainda.</p>';
 return '<h2>Equipe</h2><div class="card"><h3>Hoje</h3>'+(tl.map(({u,a,d})=>{const st=aStat(a,d);return `<div class="row2"><span>${a.time} - ${esc(u.name)}<br><span class="mu">${esc(ptn(d,a.pid))}</span></span><span class="tag ${st.c}">${st.t}</span></div>`}).join('')||'<p class="mu">Nenhum atendimento agendado para hoje.</p>')+'</div>'+cards+
 '<div class="card"><h3>Criar funcionária</h3><label for="un">Nome completo</label><input id="un"><label for="uc">CPF</label><input id="uc" inputmode="numeric" placeholder="000.000.000-00"><p class="am" id="am"></p><button class="btn pr big" data-a="uadd">Criar funcionária</button><p class="mu">O usuário é o nome sem espaços e a senha é o CPF.</p></div>'+
 '<h2>Pais e responsáveis</h2>'+pais+
 '<div class="card"><h3>Criar conta de responsável</h3><label for="rn">Nome do responsável</label><input id="rn"><label for="rc">CPF</label><input id="rc" inputmode="numeric" placeholder="000.000.000-00"><label for="re">Funcionária da criança</label><select id="re">'+emp.map(u=>`<option value="${u.k}">${esc(u.name)}</option>`).join('')+'</select><label for="rp">Criança</label><select id="rp">'+(emp[0]?opts(emp[0].k):'')+'</select><p class="am" id="am2"></p><button class="btn pr big" data-a="radd">Criar conta de responsável</button><p class="mu">A criança precisa estar cadastrada como paciente da funcionária escolhida. O responsável vê só a agenda dela, os comunicados e o chat com a Tia Tay.</p></div>';
}
/* ---------- Relatórios (editor tipo Word, salvo na nuvem) ---------- */
let REPS=[],ed=null,relPid='',edRange=null,edImg=null,edTimer=0;
const PALETA=['#14101a','#5a189a','#9d4edd','#c77dff','#d1495b','#e09f00','#2b9348','#2a6f97','#735a85','#ffffff'];
const FONTES=['Figtree','Arial','Georgia','Times New Roman','Verdana','Trebuchet MS','Courier New'];
const TAMS=[10,12,14,16,18,20,24,28,32,40];
const SIMPLE=['undo','redo','bold','italic','underline','strikeThrough','subscript','superscript','insertUnorderedList','insertOrderedList','justifyLeft','justifyCenter','justifyRight','justifyFull','indent','outdent','removeFormat','insertHorizontalRule'];
const dtf=s=>{try{return new Date(s).toLocaleString('pt-BR',{day:'2-digit',month:'2-digit',year:'numeric',hour:'2-digit',minute:'2-digit'})}catch(e){return ''}};
/* remove qualquer coisa perigosa (scripts, onclick, links javascript:) do HTML do relatório */
function limpa(h){
 const t=new DOMParser().parseFromString('<body>'+h,'text/html');
 t.querySelectorAll('script,iframe,object,embed,link,meta,style,form,base,svg,math,audio,video,source,input,button,textarea,select').forEach(n=>n.remove());
 t.body.querySelectorAll('*').forEach(n=>{
  [...n.attributes].forEach(a=>{
   const nm=a.name.toLowerCase(),v=a.value.trim().toLowerCase();
   if(nm.startsWith('on')||nm==='srcdoc'||nm==='formaction')n.removeAttribute(a.name);
   else if((nm==='href'||nm==='src'||nm==='xlink:href')&&!/^(https?:|mailto:|#|data:image\/(png|jpe?g|gif|webp);base64,)/.test(v))n.removeAttribute(a.name);
   else if(nm==='style'&&/url\(|expression|javascript:|@import/.test(v))n.removeAttribute(a.name);
  });
  if(n.tagName==='A'){n.setAttribute('target','_blank');n.setAttribute('rel','noopener noreferrer')}
 });
 return t.body.innerHTML;
}
const tirasel=h=>h.replace(/\sclass="sel"/g,'');
const setRs=(t,er)=>{const e=$('#rs');if(e){e.textContent=t;e.style.color=er?'var(--er)':''}};
const schedSave=()=>{clearTimeout(edTimer);edTimer=setTimeout(saveRep,1500)};
async function saveRep(){
 clearTimeout(edTimer);
 if(!ed||ed.html===null||ed.err||!ed.dirty)return;
 const Pp=$('#paper'),T=$('#rt'),m=REPS.find(x=>x.id===ed.id);if(!Pp||!m)return;
 const html=tirasel(Pp.innerHTML),title=((T?T.value:ed.title)||'').trim()||'Sem título',kb=Math.round(new Blob([html]).size/1024);
 if(kb>900){setRs('Relatório grande demais ('+kb+' KB). Remova imagens para salvar.',1);return}
 ed.html=html;ed.title=title;ed.dirty=false;setRs('Salvando...');
 const now=new Date().toISOString(),rd=fs.collection('reports').doc(m.id),b=fs.batch();
 b.set(rd.collection('content').doc('body'),{k:m.k,html,updated:now});
 b.update(rd,{title,updated:now,size:kb});
 try{await b.commit();m.title=title;m.updated=now;setRs('Salvo · '+kb+' KB de 900 KB')}
 catch(e){if(ed)ed.dirty=true;setRs('Erro ao salvar. Tentando de novo...',1);erro(e);setTimeout(saveRep,5000)}
}
function openRep(id){
 ed={id,html:null,dirty:false,tab:'ini'};render();
 fs.collection('reports').doc(id).collection('content').doc('body').get().then(s=>{
  if(!ed||ed.id!==id)return;
  ed.html=limpa(s.exists?s.data().html||'':'');if(!ed.html.trim())ed.html='<p><br></p>';render();
 }).catch(e=>{erro(e);if(ed&&ed.id===id){ed.err=true;render()}});
}
function edFocus(){const Pp=$('#paper');if(!Pp)return;Pp.focus();if(edRange){const s=getSelection();s.removeAllRanges();s.addRange(edRange)}}
const cellNow=()=>{const s=getSelection();let n=s.anchorNode;if(!n)return null;n=n.nodeType===3?n.parentElement:n;const c=n&&n.closest?n.closest('td,th'):null;return c&&$('#paper').contains(c)?c:null};
const tblHtml=(r,c)=>{let h='<table class="rt"><tbody>';for(let i=0;i<r;i++){h+='<tr>';for(let j=0;j<c;j++)h+=i?'<td><br></td>':'<th><br></th>';h+='</tr>'}return h+'</tbody></table><p><br></p>'};
const rowsToTable=rows=>{const w=Math.max(1,...rows.map(r=>r.length));return '<table class="rt"><tbody>'+rows.map((r,i)=>'<tr>'+Array.from({length:w},(_,j)=>{const v=esc(String(r[j]==null?'':r[j]));return i?'<td>'+v+'</td>':'<th>'+v+'</th>'}).join('')+'</tr>').join('')+'</tbody></table><p><br></p>'};
function parseCSV(t){
 const f=t.split(/\r?\n/)[0]||'',d=(f.match(/;/g)||[]).length>(f.match(/,/g)||[]).length?';':',',rows=[];let r=[],c='',q=false;
 for(let i=0;i<t.length;i++){const ch=t[i];
  if(q){if(ch==='"'){if(t[i+1]==='"'){c+='"';i++}else q=false}else c+=ch}
  else if(ch==='"')q=true;
  else if(ch===d){r.push(c);c=''}
  else if(ch==='\n'||ch==='\r'){if(ch==='\r'&&t[i+1]==='\n')i++;r.push(c);rows.push(r);r=[];c=''}
  else c+=ch}
 if(c!==''||r.length){r.push(c);rows.push(r)}
 return rows.filter(x=>x.some(v=>String(v).trim()!==''));
}
const loadXlsx=()=>new Promise((ok,no)=>{if(window.XLSX)return ok();const s=document.createElement('script');s.src='https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js';s.onload=ok;s.onerror=()=>no(new Error('xlsx'));document.head.appendChild(s)});
async function edSheet(f){
 try{
  let rows;
  if(/\.csv$/i.test(f.name))rows=parseCSV(await f.text());
  else{await loadXlsx();const wb=XLSX.read(await f.arrayBuffer(),{type:'array'});rows=XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]],{header:1,raw:false,defval:''})}
  rows=rows.slice(0,500).map(r=>r.slice(0,30));if(!rows.length)throw 0;
  edFocus();document.execCommand('insertHTML',false,rowsToTable(rows));ed.dirty=true;setRs('Editando...');schedSave();
 }catch(e){alert('Não foi possível ler a planilha. Use um arquivo .csv ou .xlsx.')}
}
/* imagens são reduzidas (até 1000 px) antes de entrar no relatório */
function edImgInsert(f){
 const rd=new FileReader();
 rd.onload=()=>{const im=new Image();im.onload=()=>{
  const s=Math.min(1,1000/im.width),c=document.createElement('canvas');c.width=Math.max(1,Math.round(im.width*s));c.height=Math.max(1,Math.round(im.height*s));
  const x=c.getContext('2d');x.fillStyle='#fff';x.fillRect(0,0,c.width,c.height);x.drawImage(im,0,0,c.width,c.height);
  edFocus();document.execCommand('insertImage',false,c.toDataURL('image/jpeg',.72));ed.dirty=true;setRs('Editando...');schedSave();
 };im.src=rd.result};
 rd.readAsDataURL(f);
}
function edCmd(c,v,el){
 const Pp=$('#paper');if(!Pp||!ed)return;
 if(c==='tab'){ed.tab=v;document.querySelectorAll('.tbg').forEach(x=>x.classList.toggle('on',x.dataset.g===v));document.querySelectorAll('.ett button').forEach(x=>x.classList.toggle('pr',x.dataset.c===v));return}
 if(c==='imgpick'){$('#rimg').click();return}
 if(c==='xl'){$('#rxl').click();return}
 const m=REPS.find(x=>x.id===ed.id)||{};
 if(c==='print'){saveRep();const t=$('#rt'),h=$('.ponly h1');if(h&&t)h.textContent=t.value;window.print();return}
 if(c==='doc'){
  const t0=(($('#rt')||{}).value||'relatorio'),t=t0.normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^\w\- ]+/g,'').trim()||'relatorio';
  const h='<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word"><head><meta charset="utf-8"><title>'+esc(t0)+'</title><style>body{font-family:Arial;font-size:12pt}table{border-collapse:collapse}td,th{border:1px solid #999;padding:4px}th{background:#ecd9f8}img{max-width:100%}</style></head><body><h1>'+esc(t0)+'</h1><p>Paciente: '+esc(m.pname||'')+'</p>'+tirasel(Pp.innerHTML)+'</body></html>';
  const a=document.createElement('a');a.href=URL.createObjectURL(new Blob(['\ufeff',h],{type:'application/msword'}));a.download=t+'.doc';document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(a.href),4000);return;
 }
 edFocus();
 document.execCommand('styleWithCSS',false,true);
 const cell=cellNow();
 if(['rowadd','coladd','rowdel','coldel','tbldel','cellbg'].includes(c)&&!cell){alert('Clique dentro de uma célula da tabela primeiro.');return}
 if(SIMPLE.includes(c))document.execCommand(c,false,null);
 else switch(c){
  case 'block':document.execCommand('formatBlock',false,v==='p'?'<p>':'<'+v+'>');break;
  case 'font':document.execCommand('fontName',false,v);break;
  case 'size':document.execCommand('styleWithCSS',false,false);document.execCommand('fontSize',false,'7');Pp.querySelectorAll('font[size="7"]').forEach(f=>{f.removeAttribute('size');f.style.fontSize=v+'px'});break;
  case 'fore':case 'forec':document.execCommand('foreColor',false,v);break;
  case 'back':document.execCommand('hiliteColor',false,v);break;
  case 'link':{let u=prompt('Endereço do link (ex.: https://...)','https://');if(!u||u==='https://')return;if(!/^(https?:|mailto:)/i.test(u))u='https://'+u;document.execCommand('createLink',false,u);break}
  case 'table':{const x=(prompt('Linhas x colunas','3x3')||'').match(/(\d+)\D+(\d+)/);if(!x)return;document.execCommand('insertHTML',false,tblHtml(Math.min(+x[1],50),Math.min(+x[2],12)));break}
  case 'pb':document.execCommand('insertHTML',false,'<hr class="pgbr"><p><br></p>');break;
  case 'rowadd':{const tr=cell.parentElement,n=tr.cloneNode(true);n.querySelectorAll('td,th').forEach(x=>{x.innerHTML='<br>';x.style.removeProperty('background-color')});tr.after(n);break}
  case 'coladd':{const i=cell.cellIndex;[...cell.closest('table').rows].forEach(r=>{const x=r.insertCell(i+1);x.innerHTML='<br>'});break}
  case 'rowdel':{const t=cell.closest('table');cell.parentElement.remove();if(!t.rows.length)t.remove();break}
  case 'coldel':{const t=cell.closest('table'),i=cell.cellIndex;[...t.rows].forEach(r=>{if(r.cells[i])r.deleteCell(i)});if(!t.rows[0]||!t.rows[0].cells.length)t.remove();break}
  case 'tbldel':cell.closest('table').remove();break;
  case 'cellbg':cell.style.backgroundColor=v;break;
  case 'imgw':if(!edImg){alert('Toque em uma imagem primeiro.');return}edImg.style.width=v;edImg.style.height='auto';break;
  case 'imgdel':if(!edImg){alert('Toque em uma imagem primeiro.');return}edImg.remove();edImg=null;break;
  default:return;
 }
 ed.dirty=true;setRs('Editando...');schedSave();
}
function tbHtml(){
 const T=ed.tab||'ini',B=(c,t,l,x)=>`<button type="button" class="tb" data-e="${c}"${x||''} title="${t}" aria-label="${t}">${l}</button>`,
  S=(c,t,o)=>`<select class="tbs" data-e="${c}" aria-label="${t}"><option value="">${t}</option>${o}</select>`,
  G=(id,h)=>`<div class="tbg${T===id?' on':''}" data-g="${id}">${h}</div>`,
  C=(c,t,l,v)=>`<label class="tb tbc" title="${t}">${l}<input type="color" data-e="${c}" value="${v}" aria-label="${t}"></label>`;
 const tabs=[['ini','Início'],['ins','Inserir'],['tab','Tabela'],['img','Imagem'],['arq','Arquivo']].map(([id,l])=>`<button type="button" class="btn${T===id?' pr':''}" data-e="tab" data-c="${id}">${l}</button>`).join('');
 return `<div class="etb"><div class="ett">${tabs}</div>`+
 G('ini',B('undo','Desfazer','↶')+B('redo','Refazer','↷')+
  S('block','Estilo','<option value="p">Parágrafo</option><option value="h1">Título 1</option><option value="h2">Título 2</option><option value="h3">Título 3</option><option value="blockquote">Citação</option>')+
  S('font','Fonte',FONTES.map(f=>`<option value="${f}">${f}</option>`).join(''))+
  S('size','Tamanho',TAMS.map(n=>`<option value="${n}">${n}</option>`).join(''))+
  B('bold','Negrito','<b>N</b>')+B('italic','Itálico','<i>I</i>')+B('underline','Sublinhado','<u>S</u>')+B('strikeThrough','Tachado','<s>T</s>')+B('subscript','Subscrito','x₂')+B('superscript','Sobrescrito','x²')+
  C('fore','Cor do texto','<span style="border-bottom:3px solid #9d4edd">A</span>','#9d4edd')+C('back','Marca-texto','🖍','#fff59d')+
  PALETA.map(c=>`<button type="button" class="sw" data-e="forec" data-c="${c}" style="background:${c}" title="Cor ${c}" aria-label="Cor ${c}"></button>`).join('')+
  B('justifyLeft','Alinhar à esquerda','Esq.')+B('justifyCenter','Centralizar','Centro')+B('justifyRight','Alinhar à direita','Dir.')+B('justifyFull','Justificar','Just.')+
  B('insertUnorderedList','Lista com marcadores','• Lista')+B('insertOrderedList','Lista numerada','1. Lista')+B('indent','Aumentar recuo','Recuo +')+B('outdent','Diminuir recuo','Recuo −')+B('removeFormat','Limpar formatação','Limpar'))+
 G('ins',B('link','Inserir link','Link')+B('imgpick','Inserir imagem','Imagem')+B('table','Inserir tabela','Tabela')+B('xl','Importar planilha (.csv ou .xlsx)','Planilha')+B('insertHorizontalRule','Linha horizontal','Linha')+B('pb','Quebra de página','Quebra de página')+'<input type="file" id="rimg" accept="image/*" hidden><input type="file" id="rxl" accept=".csv,.xlsx,.xls" hidden>')+
 G('tab',B('rowadd','Adicionar linha','+ Linha')+B('coladd','Adicionar coluna','+ Coluna')+B('rowdel','Excluir linha','− Linha')+B('coldel','Excluir coluna','− Coluna')+C('cellbg','Cor da célula','Cor da célula','#ecd9f8')+B('tbldel','Excluir tabela','Excluir tabela'))+
 G('img',B('imgw','25% da largura','25%',' data-c="25%"')+B('imgw','50% da largura','50%',' data-c="50%"')+B('imgw','100% da largura','100%',' data-c="100%"')+B('imgdel','Remover imagem','Remover imagem'))+
 G('arq',B('print','Imprimir ou salvar em PDF','Imprimir / PDF')+B('doc','Baixar para o Word (.doc)','Baixar Word (.doc)'))+'</div>';
}
function vEd(){
 const m=REPS.find(x=>x.id===ed.id)||{},bk='<div class="edbar"><button class="lnk" data-a="rclose">‹ Relatórios</button><span id="rs" class="mu"></span></div>';
 if(ed.err)return bk+'<div class="card"><p class="am">Não foi possível abrir este relatório. Verifique a internet e tente de novo.</p></div>';
 if(ed.html===null)return bk+'<p class="mu">Carregando...</p>';
 const ti=ed.title!=null?ed.title:(m.title||'');
 return bk+`<input id="rt" class="rtitle" value="${esc(ti)}" placeholder="Título do relatório" aria-label="Título do relatório"><p class="mu rinfo">Paciente: <b>${esc(m.pname||'')}</b></p>${tbHtml()}<div id="paper" class="paper" contenteditable="true" spellcheck="true" lang="pt-BR">${ed.html}</div><div class="ponly"><h1></h1><p>Paciente: ${esc(m.pname||'')}</p></div>`;
}
function vRel(){
 if(ed)return vEd();
 const ad=roleOf(user)==='a';
 if(!relPid){
  let h='<h2>Relatórios</h2><p class="mu">Escolha o paciente para ver ou criar relatórios.</p>';
  h+=db.patients.map(p=>{const n=REPS.filter(x=>x.pid===p.id).length;return `<div class="card row2"><span><b>${esc(p.name)}</b><br><span class="mu">${n} relatório(s)</span></span><button class="btn" data-a="rpat" data-id="${p.id}">Abrir</button></div>`}).join('')||'<p class="mu">Nenhum paciente cadastrado'+(ad?' para este profissional':'')+'.</p>';
  if(ad&&REPS.length){
   const nm=k=>(allUsers().find(u=>u.k===k)||{}).name||k;
   h+='<h3 style="margin-top:18px">Relatórios recentes de toda a clínica</h3>'+[...REPS].sort((a,b)=>a.updated<b.updated?1:-1).slice(0,10).map(x=>`<div class="card row2"><span><b>${esc(x.title||'Sem título')}</b><br><span class="mu">${esc(x.pname||'')} · ${esc(nm(x.k))} · ${dtf(x.updated)}</span></span><button class="btn" data-a="ropen" data-id="${x.id}">Abrir</button></div>`).join('');
  }
  return h;
 }
 const p=P(relPid);if(!p){relPid='';return vRel()}
 const L=REPS.filter(x=>x.pid===relPid).sort((a,b)=>a.updated<b.updated?1:-1);
 return `<button class="lnk" data-a="rpback">‹ Pacientes</button><h2>${esc(p.name)}</h2><button class="btn pr big" data-a="rnew">+ Novo relatório</button><div style="height:12px"></div>`+(L.map(x=>`<div class="card row2"><span><b>${esc(x.title||'Sem título')}</b><br><span class="mu">${dtf(x.updated)} · ${esc(x.byName||'')}</span></span><span class="row" style="margin:0"><button class="btn" data-a="ropen" data-id="${x.id}">Abrir</button><button class="btn" data-a="rdel" data-id="${x.id}">${delAsk==='r'+x.id?'Confirmar':'Excluir'}</button></span></div>`).join('')||'<p class="mu">Nenhum relatório ainda para este paciente.</p>');
}
/* eventos do editor */
document.addEventListener('mousedown',e=>{const b=e.target.closest&&e.target.closest('button[data-e]');if(b)e.preventDefault()});
document.addEventListener('click',e=>{
 if(!ed)return;
 const b=e.target.closest('button[data-e]');
 if(b){edCmd(b.dataset.e,b.dataset.c,b);return}
 const im=e.target.closest('#paper img');
 document.querySelectorAll('#paper img.sel').forEach(i=>i.classList.remove('sel'));
 edImg=im||null;
 if(im){im.classList.add('sel');const r=document.createRange();r.selectNode(im);const s=getSelection();s.removeAllRanges();s.addRange(r)}
});
document.addEventListener('change',e=>{
 const t=e.target;if(!ed||!t.dataset)return;
 if(t.dataset.e&&t.value){edCmd(t.dataset.e,t.value,t);if(t.tagName==='SELECT')t.selectedIndex=0}
 else if(t.id==='rimg'&&t.files[0]){edImgInsert(t.files[0]);t.value=''}
 else if(t.id==='rxl'&&t.files[0]){edSheet(t.files[0]);t.value=''}
});
document.addEventListener('input',e=>{if(ed&&(e.target.id==='paper'||e.target.id==='rt')){ed.dirty=true;setRs('Editando...');schedSave()}});
document.addEventListener('selectionchange',()=>{if(!ed)return;const s=getSelection(),Pp=$('#paper');if(Pp&&s.rangeCount&&Pp.contains(s.getRangeAt(0).commonAncestorContainer))edRange=s.getRangeAt(0).cloneRange()});
document.addEventListener('paste',e=>{
 if(!ed||!e.target.closest||!e.target.closest('#paper'))return;
 const cd=e.clipboardData;if(!cd)return;
 const it=[...(cd.items||[])].find(i=>i.type&&i.type.startsWith('image/'));
 if(it){e.preventDefault();edImgInsert(it.getAsFile());return}
 const h=cd.getData('text/html');
 if(h){e.preventDefault();document.execCommand('insertHTML',false,limpa(h))}
});
document.addEventListener('visibilitychange',()=>{if(document.hidden)saveRep()});
addEventListener('pagehide',()=>saveRep());

const ALLOW={a:['pac','ses','gra','rel','cal','dad','eq','avi','cha','per'],f:['pac','ses','gra','rel','cal','dad','avi','cha','per'],p:['cal','avi','cha','per']};
function render(){
 if(ed&&ed.html!==null&&$('#paper')){ed.html=$('#paper').innerHTML;const t=$('#rt');if(t)ed.title=t.value}
 const r=user?roleOf(user):'',ci=$('#cm'),keep=ci?ci.value:'',foc=!!ci&&document.activeElement===ci;
 if(user&&!ALLOW[r].includes(view))view=r==='p'?'cal':'pac';
 $('nav').style.display=user?'flex':'none';$('#out').hidden=!user;$('#me').hidden=!user;
 if(user)$('#me').innerHTML=av(user.k,user.name);
 const bar=r==='a'&&!['eq','avi','cha','per'].includes(view)&&!(view==='rel'&&ed)?`<div class="vbar"><label for="vs">Ver dados de</label><select id="vs">${staff().map(u=>`<option value="${u.k}" ${u.k===vk?'selected':''}>${esc(u.name)}</option>`).join('')}</select></div>`:'';
 $('#main').innerHTML=user?bar+({pac:vPac,ses:vSes,gra:vGra,cal:r==='p'?vAgPai:vCal,dad:vDad,rel:vRel,eq:vEq,avi:vAvi,cha:vCha,per:vPer})[view]():vAuth();
 document.querySelectorAll('nav button').forEach(b=>{b.dataset.l=b.dataset.l||b.textContent;b.classList.toggle('on',b.dataset.v===view);b.hidden=!(user&&b.dataset.r.includes(r));const n=user?(b.dataset.v==='cha'?unreadChat():b.dataset.v==='avi'?unreadCom():0):0;b.textContent=b.dataset.l+(n?' ('+n+')':'')});
 $('#st').textContent=navigator.onLine?'Online':'Offline';
 $('#main').classList.toggle('wide',!!(user&&view==='rel'&&ed));
 if(ed&&$('#rs'))setRs(ed.err?'':ed.dirty?'Alterações não salvas':'Salvo');
 if(flash){const el=$('#'+flash.id);if(el){el.style.color=flash.ok?'var(--ok)':'';el.textContent=flash.txt}}
 const cn=$('#cm');if(cn){cn.value=keep;if(foc||rf0)cn.focus();scrollTo(0,document.body.scrollHeight)}rf0=false;
}

document.addEventListener('click',e=>{
 const b=e.target.closest('[data-a]');if(!b)return;
 const a=b.dataset.a,d=b.dataset;
 if(a==='gh'){b.classList.toggle('on');if(d.k==='Variadas'){const w=$('#gvw');if(w)w.hidden=!b.classList.contains('on')}return}
 if(a==='login'){doLogin();return}
 if(a==='uadd'){doAddUser();return}
 if(a==='radd'){doAddParent();return}
if(a==='out'){ed=null;relPid='';user=null;ses=null;cur=null;eg=null;authMsg='';auth.signOut()}
else if(a==='nav'){if(ed){saveRep();ed=null}relPid='';view=d.v;msg='';delAsk='';eg=null;finMsg=null;cth='';flash=null}
 else if(a==='addp'){const n=$('#pn').value.trim();if(!n)return;db.patients.push({id:uid(),name:n,programs:[]});save()}
 else if(a==='open')cur=d.id;
 else if(a==='back'){cur=null;eg=null}
 else if(a==='gnew')eg='new';
 else if(a==='gedit'){eg=d.id;delAsk=''}
 else if(a==='gcancel'){eg=null;delAsk=''}
 else if(a==='gsave'){
  const n=$('#gn').value.trim(),it=[...new Set($('#gi').value.split('\n').map(s=>s.trim()).filter(Boolean))];
  if(!n||!it.length)return;
  const hl=[...document.querySelectorAll('.chip.on[data-a="gh"]')].map(x=>x.dataset.k),v={name:n,type:$('#gt').value,desc:$('#gd').value.trim(),helps:hl,helpsNote:hl.includes('Variadas')?$('#gv').value.trim():'',items:it},p=P(cur);
  if(eg==='new')p.programs.push({id:uid(),...v});else Object.assign(p.programs.find(x=>x.id===eg),v);
  save();eg=null;
 }
 else if(a==='gdel'){if(delAsk==='g'+eg){const p=P(cur);p.programs=p.programs.filter(x=>x.id!==eg);save();eg=null;delAsk=''}else delAsk='g'+eg}
 else if(a==='start'){const g=P(cur).programs.find(x=>x.id===d.id);ses={id:uid(),pid:cur,date:new Date().toISOString(),prog:JSON.parse(JSON.stringify(g)),trials:{},beh:{},rf:[],obs:'',h:(g.helps||[])[0]||''};g.items.forEach(i=>ses.trials[i]=[]);view='ses'}
 else if(a==='sh')ses.h=d.k;
 else if(a==='t')ses.trials[ses.prog.items[d.n]].push(d.c==='a'&&ses.h?'a|'+ses.h:d.c);
 else if(a==='undo')ses.trials[ses.prog.items[d.n]].pop();
 else if(a==='bp')ses.beh[d.k]=(ses.beh[d.k]||0)+1;
 else if(a==='bm')ses.beh[d.k]=Math.max(0,(ses.beh[d.k]||0)-1);
 else if(a==='rf'){const i=ses.rf.indexOf(d.k);i<0?ses.rf.push(d.k):ses.rf.splice(i,1)}
 else if(a==='fin'){const en=new Date(),mn=Math.max(1,Math.round((en-new Date(ses.date))/60000));db.sessions.push({...ses,end:en.toISOString()});finMsg={mn,ok:mn>=MIN_SESSAO};save();gp=ses.pid;gg=ses.prog.id;cd=dkey(ses.date);cm={y:new Date(ses.date).getFullYear(),m:new Date(ses.date).getMonth()};ses=null;view='cal'}
 else if(a==='day')cd=d.k;
else if(a==='cadd'){const t=$('#cti').value.trim(),x=$('#cx').value.trim();if(!t||!x){$('#am').textContent='Preencha o título e a mensagem.';return}const c={id:uid(),t:new Date().toISOString(),title:t,txt:x,to:$('#cw').value};comsA.push(c);fs.collection('coms').doc(c.id).set(c).catch(erro)}
else if(a==='cdel'){if(delAsk==='c'+d.id){comsA=comsA.filter(c=>c.id!==d.id);comsB=comsB.filter(c=>c.id!==d.id);fs.collection('coms').doc(d.id).delete().catch(erro);delAsk=''}else delAsk='c'+d.id}
 else if(a==='cth'||a==='chatwith'){cth=d.k;view='cha'}
 else if(a==='cback')cth='';
else if(a==='send'){const x=$('#cm').value.trim();if(!x)return;const th=roleOf(user)==='a'?cth:user.k,m={id:uid(),th,from:user.k,txt:x,t:new Date().toISOString(),r:false};CHATS.push(m);fs.collection('chats').doc(m.id).set(m).catch(erro);$('#cm').value='';rf0=true}
 else if(a==='inst'){if(inst){inst.prompt();inst=null}}
else if(a==='pdel')setFoto('');
 else if(a==='forgot'){if(/@tiatay\.app$/.test(ADMIN_MAIL))authMsg='O administrador usa e-mail interno. Para trocar a senha, use o Console do Firebase (Authentication).';else{auth.sendPasswordResetEmail(ADMIN_MAIL).catch(()=>{});authMsg='Se o e-mail do administrador estiver cadastrado, enviamos o link para criar uma nova senha.'}}
 else if(a==='aopen'){cur=d.id;eg=null;view='pac'}
 else if(a==='aadd'){const dt=$('#ad').value,tm=$('#ah').value,pid=$('#ap').value;if(!dt||!tm||!pid){$('#am').textContent='Preencha dia, horário e paciente.';return}(db.agenda=db.agenda||[]).push({id:uid(),date:dt,time:tm,pid,note:$('#an').value.trim()});save();cd=dt;const t=new Date(dt+'T00:00:00');cm={y:t.getFullYear(),m:t.getMonth()}}
 else if(a==='adel'){if(delAsk==='a'+d.id){db.agenda=(db.agenda||[]).filter(x=>x.id!==d.id);save();delAsk=''}else delAsk='a'+d.id}
 else if(a==='seecal'){vk=d.k;db=load(vk);cur=null;eg=null;ses=null;view='cal'}
 else if(a==='mo'){const t=new Date(cm.y,cm.m+ +d.d,1);cm={y:t.getFullYear(),m:t.getMonth()}}
 else if(a==='see'){vk=d.k;db=load(vk);cur=null;eg=null;ses=null;view='pac'}
else if(a==='udel'){if(delAsk==='u'+d.k){apagarUsuario(d.k);delAsk=''}else delAsk='u'+d.k}
 else if(a==='exp'){$('#bk').value=JSON.stringify(db);return}
else if(a==='imp'){try{const x=JSON.parse($('#bk').value);if(x.patients&&x.sessions){mergeIn(x);save();msg='Backup restaurado.'}else msg='Backup inválido.'}catch(er){msg='Backup inválido.'}}
 else if(a==='mig'){try{const x=JSON.parse(localStorage.getItem(dk(vk))||'null');if(x&&x.patients){mergeIn(x);save();msg='Dados antigos enviados para a nuvem.'}else msg='Não há dados antigos para este usuário.'}catch(er){msg='Não foi possível ler os dados antigos.'}}
 else if(a==='rpat')relPid=d.id;
 else if(a==='rpback')relPid='';
 else if(a==='ropen'){openRep(d.id);return}
 else if(a==='rclose'){saveRep();ed=null}
 else if(a==='rnew'){const pt=P(relPid);if(!pt)return;const now=new Date().toISOString(),m={id:uid(),k:vk,pid:pt.id,pname:pt.name,title:'Relatório '+new Date().toLocaleDateString('pt-BR'),by:user.k,byName:user.name,created:now,updated:now,size:1};REPS.push(m);const b=fs.batch(),rd=fs.collection('reports').doc(m.id);b.set(rd,m);b.set(rd.collection('content').doc('body'),{k:m.k,html:'<p><br></p>',updated:now});b.commit().catch(erro);openRep(m.id);return}
 else if(a==='rdel'){if(delAsk==='r'+d.id){const id=d.id,rd=fs.collection('reports').doc(id),b=fs.batch();REPS=REPS.filter(x=>x.id!==id);b.delete(rd.collection('content').doc('body'));b.delete(rd);b.commit().catch(erro);delAsk=''}else delAsk='r'+d.id}
 render();
});
document.addEventListener('input',e=>{if(e.target.id==='ob'&&ses)ses.obs=e.target.value});
document.addEventListener('change',e=>{
 const i=e.target.id;
 if(i==='sp'){gp=e.target.value;gg='';render()}
 if(i==='sg'){gg=e.target.value;render()}
 if(i==='vs'){relPid='';vk=e.target.value;db=load(vk);cur=null;eg=null;ses=null;render()}
 if(i==='re'){$('#rp').innerHTML=load(e.target.value).patients.map(p=>`<option value="${p.id}">${esc(p.name)}</option>`).join('')}
if(i==='pf'&&e.target.files[0]){const rd=new FileReader();rd.onload=()=>{const im=new Image();im.onload=()=>{const c=document.createElement('canvas'),z=Math.min(im.width,im.height);c.width=c.height=160;c.getContext('2d').drawImage(im,(im.width-z)/2,(im.height-z)/2,z,z,0,0,160,160);setFoto(c.toDataURL('image/jpeg',.8));render()};im.src=rd.result};rd.readAsDataURL(e.target.files[0])}
});
document.addEventListener('keydown',e=>{if(e.key==='Enter'&&!user&&e.target.tagName==='INPUT'){const b=document.querySelector('[data-a=login]');if(b)b.click()}if(e.key==='Enter'&&!e.shiftKey&&e.target.id==='cm'){e.preventDefault();const b=document.querySelector('[data-a=send]');if(b)b.click()}});
addEventListener('online',render);addEventListener('offline',render);
let inst=null;
const instCard=()=>`<div class="card"><h3>Instalar o aplicativo</h3>${inst?'<button class="btn pr big" data-a="inst">Instalar no aparelho</button>':'<p class="mu">No celular, abra o menu do navegador e toque em “Instalar app” ou “Adicionar à tela inicial”. No iPhone, use Compartilhar e depois “Adicionar à Tela de Início”.</p>'}</div>`;
addEventListener('beforeinstallprompt',e=>{e.preventDefault();inst=e;render()});
addEventListener('appinstalled',()=>{inst=null;render()});
if('serviceWorker' in navigator&&location.protocol.startsWith('http'))addEventListener('load',()=>navigator.serviceWorker.register('sw.js').catch(()=>{}));

setInterval(()=>{if(user&&!ses&&['cal','eq'].includes(view)&&!['INPUT','TEXTAREA','SELECT'].includes((document.activeElement||{}).tagName))render()},60000);
if(cfgErr){booting=false;render()}
else auth.onAuthStateChanged(async fu=>{
 if(!fu){stopAll();user=null;ses=null;cur=null;eg=null;booting=false;render();return}
 try{
  const sn=await fs.collection('users').doc(fu.uid).get();
  if(!sn.exists){authMsg='Esta conta não tem perfil no sistema. Peça à Tia Tay para criar seu usuário.';await auth.signOut();return}
  enter(mk(sn.id,sn.data()));
 }catch(e){authMsg='Não foi possível carregar sua conta. Verifique a internet e recarregue.';booting=false;render()}
});