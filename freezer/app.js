(function(){
"use strict";
var APP_VERSION = "1";
/* Same backend and same saved passcode and name as the recipe app. */
var API = "https://script.google.com/macros/s/AKfycbyCJiO1v_3d9OV8CSvS589vksbBhpK7HgRU8xpBzXIptD8kO33NE2Ly3hCxxu2wwJ35/exec";
var K = {pass:"recipebox:pass", who:"recipebox:who", cache:"freezer:cache", queue:"freezer:queue"};
var SEND_DELAY = 1200;   /* taps within this window are sent as one change */

function lsGet(k){ try{ return localStorage.getItem(k); }catch(e){ return null; } }
function lsSet(k,v){ try{ localStorage.setItem(k,v); }catch(e){} }
function lsDel(k){ try{ localStorage.removeItem(k); }catch(e){} }
function readJSON(k, d){ try{ var v=JSON.parse(lsGet(k)||"null"); return v==null?d:v; }catch(e){ return d; } }

var pass = lsGet(K.pass) || "", who = lsGet(K.who) || "";
var items = [], log = [], loaded = false, lastSync = 0, syncing = false;
var pending = readJSON(K.queue, {});   /* taps not sent yet: {itemId: delta} */
var inflight = {};                     /* taps being sent right now */
var view = "list", filter = "All", query = "", showOut = false, actWho = "Everyone";
var keepVisible = {};                  /* items you just tapped stay put until you leave the view */
var sheet = null;                      /* {type:"item", id, editing} or {type:"add", ...} */
var sendTimer = null, retryTimer = null;

var $ = function(s){ return document.querySelector(s); };
var esc = function(s){ return String(s==null?"":s).replace(/[&<>"']/g,function(c){ return {"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]; }); };
var I = {
  search:'<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke-width="2" stroke-linecap="round" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="M20 20l-3.5-3.5"/></svg>',
  plus:'<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke-width="2.4" stroke-linecap="round" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg>',
  back:'<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M15 5l-7 7 7 7"/></svg>',
  close:'<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke-width="2.2" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg>',
  pencil:'<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 20h4L19 9l-4-4L4 16v4z"/></svg>',
  trash:'<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M5 7h14M10 7V4h4v3M7 7l1 13h8l1-13"/></svg>'
};

/* ---------- names and matching ---------- */
function stem(w){ if(/(oes|ches|shes|sses|xes)$/.test(w)) return w.slice(0,-2); if(/ies$/.test(w)&&w.length>4) return w.slice(0,-3)+"y"; if(/ves$/.test(w)) return w.slice(0,-3)+"f"; if(/[^s]s$/.test(w)&&w.length>3) return w.slice(0,-1); return w; }
function key(s){ return String(s||"").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g,"").replace(/[^a-z0-9]+/g," ").trim().split(" ").filter(Boolean).map(stem).join(" "); }
function lower(s){ s=String(s||""); return s.charAt(0).toLowerCase()+s.slice(1); }
function name(n){ return n && n===who ? "You" : (n||"Someone"); }

/* ---------- counts ---------- */
function byId(id){ return items.filter(function(x){ return x.id===id; })[0]; }
function count(it){ return Math.max(0, it.count + (inflight[it.id]||0) + (pending[it.id]||0)); }
function groups(){ var seen={}, out=[]; items.forEach(function(x){ if(!seen[x.group]){ seen[x.group]=1; out.push(x.group); } }); return out; }
function lastEntry(id){ for(var i=0;i<log.length;i++){ if(log[i].itemId===id && (log[i].kind==="add"||log[i].kind==="remove")) return log[i]; } return null; }

/* ---------- dates ---------- */
function dayDiff(d){ var a=new Date(d); a.setHours(0,0,0,0); var b=new Date(); b.setHours(0,0,0,0); return Math.round((b-a)/86400000); }
function shortDay(iso){
  var d=new Date(iso); if(isNaN(d)) return "";
  var n=dayDiff(d);
  if(n===0) return "Today"; if(n===1) return "Yesterday";
  if(n<7) return d.toLocaleDateString(undefined,{weekday:"short"});
  var o={month:"short",day:"numeric"}; if(d.getFullYear()!==new Date().getFullYear()) o.year="numeric";
  return d.toLocaleDateString(undefined,o);
}
function longDay(iso){
  var d=new Date(iso); if(isNaN(d)) return "";
  var n=dayDiff(d); if(n===0) return "Today"; if(n===1) return "Yesterday";
  var o={weekday:"short",month:"short",day:"numeric"}; if(d.getFullYear()!==new Date().getFullYear()) o.year="numeric";
  return d.toLocaleDateString(undefined,o);
}
function ago(t){
  var m=Math.round((Date.now()-t)/60000);
  if(m<1) return "just now"; if(m<60) return m+" min ago";
  var h=Math.round(m/60); if(h<24) return h+" hr ago";
  return shortDay(new Date(t).toISOString());
}

/* ---------- toast ---------- */
var toastTimer=null, toastUndo=null;
function toast(msg, undo, ms){
  var t=$("#toast"); toastUndo=undo||null;
  t.className="toast"+(undo?"":" solo");
  t.innerHTML='<span>'+esc(msg)+'</span>'+(undo?'<button data-act="undo">Undo</button>':'');
  t.hidden=false; clearTimeout(toastTimer);
  toastTimer=setTimeout(function(){ t.hidden=true; toastUndo=null; }, ms||(undo?5000:3500));
}
function hideToast(){ $("#toast").hidden=true; toastUndo=null; }

/* ---------- talking to the backend ---------- */
function isOnline(){ return navigator.onLine!==false; }
function api(action, data){
  var body={action:action, passcode:pass, who:who};
  if(data) Object.keys(data).forEach(function(k){ body[k]=data[k]; });
  return fetch(API,{method:"POST", headers:{"Content-Type":"text/plain;charset=utf-8"}, body:JSON.stringify(body), redirect:"follow"})
    .then(function(r){ return r.text(); }, function(){ throw {error:"network"}; })
    .then(function(t){ try{ return JSON.parse(t); }catch(e){ throw {error:"bad_response"}; } })
    .then(function(res){ if(action!=="ping" && res && res.error==="bad_passcode"){ lockOut(); throw res; } return res; });
}
function problem(e, fallback){
  var err=(e&&e.error)||"";
  if(err==="bad_passcode") return;
  if(err==="network"||!isOnline()) toast("Couldn't reach the freezer list. Check your connection and try again.",null,5000);
  else toast(fallback||"Something went wrong. Try again.",null,5000);
}
function saveCache(){ lsSet(K.cache, JSON.stringify({items:items, log:log.slice(0,400), at:lastSync})); }
function saveQueue(){ lsSet(K.queue, JSON.stringify(pending)); }
function busy(){ return Object.keys(pending).length+Object.keys(inflight).length>0; }

function refresh(force){
  if(!pass||syncing||!isOnline()) return;
  if(!force && Date.now()-lastSync<30000) return;
  syncing=true; renderSync();
  api("freezerList").then(function(res){
    syncing=false;
    if(!res.ok) throw res;
    if(Object.keys(inflight).length){ setTimeout(function(){ refresh(true); },1500); return; }   /* wait until our taps land */
    items=res.items||[]; log=res.log||[]; loaded=true; lastSync=Date.now();
    saveCache(); render();
  }).catch(function(e){
    syncing=false; renderSync();
    if(!loaded){ loaded=true; render(); problem(e,"Couldn't load the freezer list. Close and reopen the app to try again."); }
  });
}

function scheduleSend(){ clearTimeout(sendTimer); sendTimer=setTimeout(send, SEND_DELAY); }
function send(){
  if(!pass||!isOnline()){ renderSync(); return; }
  Object.keys(pending).forEach(function(id){
    if(inflight[id]) return;   /* one change per item at a time */
    var d=pending[id]; delete pending[id]; saveQueue();
    if(!d) return;
    inflight[id]=d; renderSync();
    api("freezerAdjust",{id:id, delta:d}).then(function(res){
      delete inflight[id];
      if(!res.ok){
        if(res.error==="not_found"){ items=items.filter(function(x){ return x.id!==id; }); saveCache(); render(); toast("That item was deleted on the other phone."); return; }
        throw res;
      }
      var cur=byId(id);
      if(cur && res.item && (!cur.updatedAt || res.item.updatedAt>=cur.updatedAt)){ cur.count=res.item.count; cur.updatedAt=res.item.updatedAt; cur.updatedBy=res.item.updatedBy; }
      if(res.entry) log.unshift(res.entry);
      lastSync=Date.now(); saveCache(); render();
      if(pending[id]) scheduleSend();
    }).catch(function(e){
      delete inflight[id];
      pending[id]=(pending[id]||0)+d; if(!pending[id]) delete pending[id];
      saveQueue(); render();
      if(e && e.error==="bad_passcode") return;
      clearTimeout(retryTimer); retryTimer=setTimeout(send, 15000);
    });
  });
}

/* ---------- tapping + and - ---------- */
function tap(id, d, quiet){
  var it=byId(id); if(!it) return;
  if(d<0 && count(it)===0) return;
  pending[id]=(pending[id]||0)+d; if(!pending[id]) delete pending[id];
  keepVisible[id]=true; saveQueue(); render(); scheduleSend();
  if(!quiet) toast((d>0?"Added 1 ":"Took out 1 ")+lower(it.name)+", "+(count(it)?count(it)+" left":"none left"), function(){ tap(id,-d,true); hideToast(); });
}

/* ---------- page ---------- */
$("#app").innerHTML=
'<div class="wrap">'+
  '<header class="head"><div><div class="kicker">Garage freezer</div><h1 id="title">Freezer</h1></div>'+
  '<button class="sync" id="sync" data-act="refresh" aria-label="Refresh"></button></header>'+
  '<div id="listTop"><label class="search">'+I.search+'<input id="q" type="search" placeholder="Search the freezer" autocomplete="off" enterkeyhint="search" aria-label="Search the freezer"></label>'+
  '<div class="chips" id="chips"></div></div>'+
  '<div id="actTop" hidden><div class="chips" id="whoChips"></div></div>'+
  '<main id="main"></main>'+
  '<p class="ver">Freezer version '+APP_VERSION+'</p>'+
'</div>'+
'<div class="bar"><div class="barin">'+
  '<button class="addbtn" data-act="add">'+I.plus+'Add new item</button>'+
  '<nav class="tabs"><button class="tab" data-view="list">Freezer</button><button class="tab" data-view="activity">Activity</button></nav>'+
'</div></div>'+
'<div id="sheet" class="sheet" hidden></div>'+
'<div id="gate" class="sheet" hidden></div>'+
'<div id="toast" class="toast" role="status" hidden></div>';

function renderSync(){
  var s=$("#sync"), outN=items.filter(function(x){ return count(x)===0; }).length, status;
  if(Object.keys(pending).length||Object.keys(inflight).length) status=isOnline()?"Saving…":"Offline, will save later";
  else if(syncing && !lastSync) status="Loading…";
  else if(!isOnline()) status="Offline";
  else status=lastSync?"Synced "+ago(lastSync):"";
  s.innerHTML=(loaded?'<b>'+outN+' item'+(outN===1?'':'s')+' out</b><br>':'')+esc(status);
}

function render(){
  var total=items.reduce(function(s,x){ return s+count(x); },0);
  $("#title").textContent = view==="activity" ? "Activity" : (loaded||items.length ? total+" pack"+(total===1?"":"s") : "Freezer");
  $("#listTop").hidden = view!=="list"; $("#actTop").hidden = view!=="activity";
  document.querySelectorAll(".tab").forEach(function(t){ t.setAttribute("aria-pressed", String(t.dataset.view===view)); });
  renderSync();
  if(view==="list") renderList(); else renderActivity();
  if(sheet) renderSheet();
}

function itemRow(it, inOut){
  var c=count(it), e=lastEntry(it.id), meta=[];
  if(it.staple) meta.push("Staple");
  if(e) meta.push(e.who==="Starting list" ? "Starting count, "+shortDay(e.at) : name(e.who)+(e.kind==="add"?" added ":" took out ")+Math.abs(e.change)+", "+shortDay(e.at));
  var metaTxt=meta.join(" · ");
  if(inOut){
    return '<div class="row out"><button class="rmain" data-open="'+esc(it.id)+'"><span class="rname">'+esc(it.name)+'</span><span class="rmeta">'+esc(it.group+(metaTxt?" · "+metaTxt:""))+'</span></button>'+
      '<button class="sbtn ghostplus" data-tap="'+esc(it.id)+'" data-d="1" aria-label="Add one '+esc(it.name)+'">+</button></div>';
  }
  return '<div class="row'+(c===0?' out':'')+'"><button class="rmain" data-open="'+esc(it.id)+'"><span class="rname">'+esc(it.name)+'</span>'+(metaTxt?'<span class="rmeta">'+esc(metaTxt)+'</span>':'')+'</button>'+
    '<div class="step"><button class="sbtn" data-tap="'+esc(it.id)+'" data-d="-1" aria-label="Take one '+esc(it.name)+' out"'+(c===0?' disabled':'')+'>−</button>'+
    '<span class="cnt'+(c===0?' out':'')+'">'+(c===0?'Out':c)+'</span>'+
    '<button class="sbtn plus" data-tap="'+esc(it.id)+'" data-d="1" aria-label="Add one '+esc(it.name)+'">+</button></div></div>';
}

function renderList(){
  var gs=groups();
  if(filter!=="All" && gs.indexOf(filter)<0) filter="All";
  $("#chips").innerHTML=["All"].concat(gs).map(function(g){ return '<button class="chip" data-filter="'+esc(g)+'" aria-pressed="'+(g===filter)+'">'+esc(g)+'</button>'; }).join("");
  var q=key(query), searching=!!q;
  var match=function(it){ return !searching || key(it.name).indexOf(q)>-1 || key(it.group).indexOf(q)>-1; };
  var shown=function(it){ return searching || count(it)>0 || it.staple || keepVisible[it.id]; };
  var html="", outs=[];
  gs.forEach(function(g){
    if(filter!=="All" && g!==filter) return;
    var list=items.filter(function(x){ return x.group===g && match(x); }).sort(function(a,b){ return a.name.localeCompare(b.name); });
    var vis=list.filter(shown);
    list.forEach(function(x){ if(!shown(x)) outs.push(x); });
    if(!vis.length) return;
    var packs=list.reduce(function(s,x){ return s+count(x); },0);
    html+='<section class="group"><div class="ghead"><h2>'+esc(g)+'</h2><span>'+packs+' pack'+(packs===1?'':'s')+'</span></div><div class="card">'+vis.map(function(x){ return itemRow(x,false); }).join("")+'</div></section>';
  });
  if(outs.length){
    html+='<button class="outtoggle" data-act="toggleout" aria-expanded="'+showOut+'"><span>'+outs.length+' other item'+(outs.length===1?' is':'s are')+' out</span><span>'+(showOut?'Hide':'Show')+'</span></button>';
    if(showOut) html+='<div class="card outcard">'+outs.sort(function(a,b){ return a.name.localeCompare(b.name); }).map(function(x){ return itemRow(x,true); }).join("")+'</div>';
  }
  if(!html){
    if(searching) html='<div class="empty"><p>Nothing called “'+esc(query.trim())+'” in the freezer.</p><button class="btn primary" data-act="add" data-name="'+esc(query.trim())+'">Add “'+esc(query.trim())+'”</button></div>';
    else if(!loaded) html='<div class="empty"><p>Loading the freezer…</p></div>';
    else html='<div class="empty"><p>The freezer list is empty.</p><button class="btn primary" data-act="add">Add the first item</button></div>';
  }
  $("#main").innerHTML=html;
}

/* ---------- activity ---------- */
function entryText(e){
  var item=lower(e.itemName), n=Math.abs(e.change);
  if(e.who==="Starting list") return "Started with "+n+" "+item;
  if(e.kind==="add") return name(e.who)+" added "+n+" "+item;
  if(e.kind==="remove") return name(e.who)+" took out "+n+" "+item;
  if(e.kind==="delete") return name(e.who)+" deleted "+item;
  return name(e.who)+" edited "+item;
}
function badge(e){
  if(e.kind==="edit") return '<div class="badge edit">'+I.pencil+'</div>';
  if(e.kind==="delete") return '<div class="badge delete">'+I.trash+'</div>';
  return '<div class="badge '+e.kind+'">'+(e.change>0?'+':'−')+Math.abs(e.change)+'</div>';
}
function leftText(e){
  if(e.kind==="add"||e.kind==="remove") return e.countAfter? e.countAfter+" left" : "Out";
  return "";
}
function renderActivity(){
  var names=[]; log.forEach(function(e){ if(e.who && e.who!=="Starting list" && names.indexOf(e.who)<0) names.push(e.who); });
  names.sort(function(a,b){ return a===who?-1:b===who?1:a.localeCompare(b); });
  if(actWho!=="Everyone" && names.indexOf(actWho)<0) actWho="Everyone";
  $("#whoChips").innerHTML=["Everyone"].concat(names).map(function(n){ return '<button class="chip" data-who="'+esc(n)+'" aria-pressed="'+(n===actWho)+'">'+esc(n==="Everyone"?n:name(n))+'</button>'; }).join("");
  var list=log.filter(function(e){ return actWho==="Everyone" || e.who===actWho; }).slice(0,200);
  if(!list.length){ $("#main").innerHTML='<div class="empty"><p>'+(loaded?'No activity yet. Changes show up here as you add and take things out.':'Loading…')+'</p></div>'; return; }
  var secs=[["This week",[]],["Last week",[]],["Earlier",[]]];
  list.forEach(function(e){ var n=dayDiff(new Date(e.at)); secs[n<7?0:n<14?1:2][1].push(e); });
  $("#main").innerHTML='<div class="feed">'+secs.filter(function(s){ return s[1].length; }).map(function(s){
    return '<h2>'+s[0]+'</h2><div class="card">'+s[1].map(function(e){
      var sub=longDay(e.at)+(e.kind==="edit"&&e.detail?". "+e.detail:"");
      return '<div class="erow">'+badge(e)+'<div class="etext"><b>'+esc(entryText(e))+'</b><span>'+esc(sub)+'</span></div><span class="eleft">'+esc(leftText(e))+'</span></div>';
    }).join("")+'</div>';
  }).join("")+'</div>';
}

/* ---------- sheets: item page and add page ---------- */
function openSheet(s){
  var wasOpen=!!sheet; sheet=s; renderSheet();
  $("#sheet").hidden=false; $("#sheet").scrollTop=0;
  document.documentElement.classList.add("noscroll","sheetopen");
  if(!wasOpen){ try{ history.pushState({sheet:1},"",location.href); }catch(e){} }
  if(s.type==="add") setTimeout(function(){ var n=$("#addName"); if(n){ n.focus(); n.setSelectionRange(n.value.length,n.value.length); } },60);
}
function closeSheet(){ if(!sheet) return; try{ history.back(); }catch(e){ reallyClose(); } }
function reallyClose(){
  sheet=null; $("#sheet").hidden=true; $("#sheet").innerHTML="";
  document.documentElement.classList.remove("noscroll","sheetopen");
  render();
}
window.addEventListener("popstate", function(){ if(sheet) reallyClose(); });

function renderSheet(){
  if(!sheet) return;
  if(sheet.type==="item") return renderItem();
  if(sheet.type==="add") return renderAddMatches();
}

function renderItem(){
  var it=byId(sheet.id);
  if(!it){ reallyClose(); return; }
  var box=$("#sheet");
  if(sheet.editing){ if(!box.querySelector("#edName")) box.innerHTML=editHTML(it); return; }
  var c=count(it), hist=log.filter(function(e){ return e.itemId===it.id; });
  var adds=hist.filter(function(e){ return e.kind==="add"; }), oldest=adds.length?adds[adds.length-1]:null;
  box.innerHTML='<div class="sin">'+
    '<div class="snav"><button class="iconbtn" data-act="close" aria-label="Back to the freezer">'+I.back+'</button><button class="btn" data-act="edit">Edit</button></div>'+
    '<div class="dkicker">'+esc(it.group)+'</div><h1 class="dtitle">'+esc(it.name)+'</h1>'+
    (oldest&&c?'<p class="dsub">First added '+esc(lower(longDay(oldest.at)))+'</p>':'')+
    '<div class="bigcount"><button class="sbtn" data-tap="'+esc(it.id)+'" data-d="-1" aria-label="Take one out"'+(c===0?' disabled':'')+'>−</button>'+
      '<div class="num"><b>'+c+'</b><span>'+(c===1?'pack left':'packs left')+'</span></div>'+
      '<button class="sbtn plus" data-tap="'+esc(it.id)+'" data-d="1" aria-label="Add one">+</button></div>'+
    '<button class="toggle" data-act="staple" aria-pressed="'+(!!it.staple)+'"><span><b>Staple</b><small>Keep it on the list when it hits 0</small></span><span class="switch" aria-hidden="true"><i></i></span></button>'+
    '<div class="hhead"><h2>History</h2><span>'+(hist.length?hist.length+' change'+(hist.length===1?'':'s'):'')+'</span></div>'+
    (hist.length?'<div class="tl">'+hist.map(function(e){
      var before=e.countAfter-e.change, line;
      if(e.who==="Starting list") line="Started with "+Math.abs(e.change);
      else if(e.kind==="add") line=name(e.who)+" added "+e.change;
      else if(e.kind==="remove") line=name(e.who)+" took out "+Math.abs(e.change);
      else line=name(e.who)+" edited it";
      var sub=longDay(e.at)+(e.kind==="edit"?(e.detail?", "+e.detail.charAt(0).toLowerCase()+e.detail.slice(1):""):", "+before+" to "+e.countAfter);
      return '<div class="tli"><div class="rail">'+badge(e)+'</div><div class="txt"><b>'+esc(line)+'</b><span>'+esc(sub)+'</span></div></div>';
    }).join("")+'</div>':'<p class="note">No changes yet.</p>')+
  '</div>';
}

function editHTML(it){
  var gs=groups();
  sheet.group=sheet.group||it.group;
  return '<div class="sin">'+
    '<div class="snav"><button class="iconbtn" data-act="canceledit" aria-label="Cancel">'+I.close+'</button><span></span></div>'+
    '<h1 class="dtitle" style="font-size:24px">Edit item</h1>'+
    '<label class="field"><span class="flabel">Name</span><input class="input" id="edName" type="text" value="'+esc(it.name)+'" autocomplete="off" maxlength="60"></label>'+
    '<div class="field"><span class="flabel">Group</span><div class="wrapchips" id="edGroups">'+groupChips(gs, sheet.group)+'</div>'+
    '<input class="input" id="edNewGroup" type="text" placeholder="New group name" autocomplete="off" maxlength="40" hidden></div>'+
    '<div class="edbtns"><button class="btn danger" data-act="delete">Delete</button><button class="btn primary" data-act="saveedit">Save</button></div>'+
    '<p class="note">Deleting removes it from the list. Its history stays in the Activity tab.</p>'+
  '</div>';
}
function groupChips(gs, current){
  if(gs.indexOf(current)<0 && current) gs=gs.concat([current]);
  return gs.map(function(g){ return '<button class="chip" data-group="'+esc(g)+'" aria-pressed="'+(g===current)+'">'+esc(g)+'</button>'; }).join("")+
    '<button class="chip dashed" data-act="newgroup">+ New group</button>';
}
function pickedGroup(){
  var ng=$("#edNewGroup")||$("#addNewGroup");
  if(ng && !ng.hidden && ng.value.trim()) return ng.value.trim();
  return sheet.group;
}

function saveEdit(){
  var it=byId(sheet.id); if(!it) return;
  var nm=($("#edName").value||"").replace(/\s+/g," ").trim(), g=pickedGroup();
  if(!nm){ toast("Give it a name."); return; }
  var clash=items.filter(function(x){ return x.id!==it.id && key(x.name)===key(nm); })[0];
  if(clash){ toast("There's already an item called "+clash.name+"."); return; }
  if(!isOnline()){ toast("You're offline. Try again once you're connected."); return; }
  var b=document.querySelector('[data-act="saveedit"]'); b.disabled=true; b.textContent="Saving…";
  api("freezerUpdate",{id:it.id, changes:{name:nm, group:g}}).then(function(res){
    if(!res.ok){
      if(res.error==="name_taken"){ toast("There's already an item called "+((res.existing&&res.existing.name)||nm)+"."); b.disabled=false; b.textContent="Save"; return; }
      throw res;
    }
    Object.assign(it, res.item); if(res.entry) log.unshift(res.entry);
    saveCache(); sheet.editing=false; sheet.group=null; render(); toast("Saved.");
  }).catch(function(e){ b.disabled=false; b.textContent="Save"; problem(e,"Couldn't save. Try again."); });
}
function deleteItem(btn){
  if(!btn.dataset.armed){
    btn.dataset.armed="1"; btn.classList.add("armed"); btn.textContent="Tap again to delete";
    setTimeout(function(){ if(btn.isConnected){ delete btn.dataset.armed; btn.classList.remove("armed"); btn.textContent="Delete"; } },3500);
    return;
  }
  if(!isOnline()){ toast("You're offline. Try again once you're connected."); return; }
  var it=byId(sheet.id); if(!it) return;
  btn.disabled=true; btn.textContent="Deleting…";
  delete pending[it.id]; saveQueue();
  api("freezerDelete",{id:it.id}).then(function(res){
    if(!res.ok) throw res;
    items=items.filter(function(x){ return x.id!==it.id; });
    if(res.entry) log.unshift(res.entry);
    saveCache(); closeSheet(); toast("Deleted "+lower(it.name)+".");
  }).catch(function(e){ btn.disabled=false; delete btn.dataset.armed; btn.classList.remove("armed"); btn.textContent="Delete"; problem(e,"Couldn't delete. Try again."); });
}
function toggleStaple(){
  var it=byId(sheet.id); if(!it) return;
  if(!isOnline()){ toast("You're offline. Try again once you're connected."); return; }
  var was=!!it.staple; it.staple=!was; render();
  api("freezerUpdate",{id:it.id, changes:{staple:!was}}).then(function(res){
    if(!res.ok) throw res;
    Object.assign(it, res.item); if(res.entry) log.unshift(res.entry); saveCache(); render();
  }).catch(function(e){ it.staple=was; render(); problem(e,"Couldn't change that. Try again."); });
}

/* add page: type a name, see what's already tracked, or create it */
function openAdd(prefill){
  var s={type:"add", group:null, qty:1};
  var gs=groups(); s.group=filter!=="All"?filter:(gs[0]||"Other");
  $("#sheet").innerHTML='<div class="sin">'+
    '<div class="snav"><button class="iconbtn" data-act="close" aria-label="Close">'+I.close+'</button><span></span></div>'+
    '<h1 class="dtitle" style="font-size:24px">Add to freezer</h1>'+
    '<label class="field"><span class="flabel">What is it?</span><input class="input" id="addName" type="text" autocomplete="off" maxlength="60" enterkeyhint="done" value="'+esc(prefill||"")+'"></label>'+
    '<div id="addMatches"></div>'+
  '</div>';
  openSheet(s);
}
function renderAddMatches(){
  var box=$("#addMatches"); if(!box) return;
  var raw=($("#addName").value||"").replace(/\s+/g," ").trim(), q=key(raw);
  if(!q){ box.innerHTML='<p class="note">Start typing and anything already in the freezer list shows up here, so nothing gets added twice.</p>'; return; }
  var words=q.split(" ");
  var hits=items.filter(function(x){ var k=key(x.name); return k.indexOf(q)>-1 || q.indexOf(k)>-1 || words.every(function(w){ return k.indexOf(w)>-1; }); })
    .sort(function(a,b){ return (key(a.name)===q?-1:0)-(key(b.name)===q?-1:0) || a.name.localeCompare(b.name); }).slice(0,6);
  var exact=hits.filter(function(x){ return key(x.name)===q; })[0];
  var html="";
  if(hits.length){
    html+='<section class="sec"><h2>'+(exact?'Already in the freezer list':'Already tracked')+'</h2><div class="card">'+hits.map(function(x){
      var c=count(x);
      return '<div class="mrow"><div class="etext"><b'+(c?'':' style="color:var(--muted)"')+'>'+esc(x.name)+'</b><span>'+esc(x.group)+', '+(c?c+' in freezer':'out')+'</span></div>'+
        '<button class="btn '+(c?'primary':'')+'" data-useitem="'+esc(x.id)+'">'+(c?'Add to this':'Bring back')+'</button></div>';
    }).join("")+'</div></section>';
  }
  if(!exact){
    html+='<section class="sec'+(hits.length?' divider':'')+'" style="'+(hits.length?'padding-top:4px':'')+'">'+
      '<h2 style="margin-top:'+(hits.length?'18px':'0')+'">'+(hits.length?'Or create “'+esc(raw)+'” as new':'New item')+'</h2>'+
      '<div class="field" style="margin-top:6px"><span class="flabel">Group</span><div class="wrapchips" id="addGroups">'+groupChips(groups(), sheet.group)+'</div>'+
      '<input class="input" id="addNewGroup" type="text" placeholder="New group name" autocomplete="off" maxlength="40"'+(sheet.newGroup?'':' hidden')+' value="'+esc(sheet.newGroupText||"")+'"></div>'+
      '<div class="lineflex"><b>How many packs?</b><div class="step"><button class="sbtn" data-act="qty" data-d="-1" aria-label="Fewer"'+(sheet.qty<=1?' disabled':'')+'>−</button>'+
      '<span class="cnt">'+sheet.qty+'</span><button class="sbtn plus" data-act="qty" data-d="1" aria-label="More">+</button></div></div>'+
      '<button class="btn big solid" style="margin-top:22px" data-act="create">Add '+esc(raw)+'</button>'+
    '</section>';
  }
  box.innerHTML=html;
}
function createItem(btn){
  var raw=($("#addName").value||"").replace(/\s+/g," ").trim();
  if(!raw){ toast("Type what it is first."); return; }
  var g=pickedGroup();
  if(!g){ toast("Pick a group."); return; }
  if(!isOnline()){ toast("You're offline. Try again once you're connected."); return; }
  btn.disabled=true; btn.textContent="Adding…";
  api("freezerAdd",{name:raw, group:g, count:sheet.qty}).then(function(res){
    if(!res.ok) throw res;
    var cur=byId(res.item.id);
    if(cur) Object.assign(cur,res.item); else items.push(res.item);
    if(res.entry) log.unshift(res.entry);
    keepVisible[res.item.id]=true;
    saveCache(); closeSheet();
    toast(res.merged ? "Added to "+lower(res.item.name)+", which was already on the list." : "Added "+res.item.count+" "+lower(res.item.name)+".", null, 4500);
  }).catch(function(e){ btn.disabled=false; btn.textContent="Add "+raw; problem(e,"Couldn't add that. Try again."); });
}

/* ---------- passcode (only if the recipe app hasn't been set up on this phone) ---------- */
function showGate(){
  var g=$("#gate"); if(!g.hidden) return;
  g.innerHTML='<div class="sin gate"><h1>Garage freezer</h1><p>Enter the same passcode you use for the recipe box. You only do this once on this phone.</p>'+
    '<label class="field"><span class="flabel">Passcode</span><input class="input" id="gPass" type="password" autocomplete="current-password" enterkeyhint="next"></label>'+
    '<label class="field"><span class="flabel">Your name</span><input class="input" id="gWho" type="text" autocomplete="given-name" enterkeyhint="go" value="'+esc(who)+'" placeholder="Shown on changes you make"></label>'+
    '<button class="btn primary big" style="margin-top:22px" data-act="unlock">Open the freezer</button></div>';
  g.hidden=false; document.documentElement.classList.add("noscroll");
  setTimeout(function(){ var p=$("#gPass"); if(p) p.focus(); },60);
}
function lockOut(){ pass=""; lsDel(K.pass); showGate(); toast("The passcode changed. Enter the new one to keep going.",null,6000); }
function unlock(){
  var p=($("#gPass").value||"").trim(), w=($("#gWho").value||"").trim();
  if(!p){ toast("Enter the passcode."); return; }
  if(!w){ toast("Add your name so changes show who made them."); return; }
  if(!isOnline()){ toast("You need a connection the first time."); return; }
  var b=document.querySelector('[data-act="unlock"]'); b.disabled=true; b.textContent="Checking…";
  var prev=pass; pass=p;
  api("ping").then(function(res){
    if(!res.ok){ pass=prev; b.disabled=false; b.textContent="Open the freezer"; toast(res.error==="bad_passcode"?"That passcode didn't work. Try again.":"Something went wrong. Try again."); return; }
    lsSet(K.pass,p); who=w; lsSet(K.who,w);
    var g=$("#gate"); g.hidden=true; g.innerHTML=""; document.documentElement.classList.remove("noscroll"); hideToast();
    refresh(true); send();
  }).catch(function(e){ pass=prev; b.disabled=false; b.textContent="Open the freezer"; problem(e); });
}

/* ---------- events ---------- */
document.addEventListener("click", function(e){
  var b=e.target.closest("button"); if(!b) return;
  var d=b.dataset;
  if(d.tap){ tap(d.tap, +d.d); return; }
  if(d.open){ openSheet({type:"item", id:d.open}); return; }
  if(d.filter){ filter=d.filter; keepVisible={}; render(); window.scrollTo(0,0); return; }
  if(d.who){ actWho=d.who; render(); return; }
  if(d.view){ if(view!==d.view){ view=d.view; keepVisible={}; render(); window.scrollTo(0,0); } return; }
  if(d.useitem){ sheet={type:"item", id:d.useitem}; $("#sheet").scrollTop=0; renderSheet(); return; }
  if(d.group){
    sheet.group=d.group; var ng=$("#edNewGroup")||$("#addNewGroup"); if(ng){ ng.hidden=true; ng.value=""; } sheet.newGroup=false; sheet.newGroupText="";
    document.querySelectorAll("[data-group]").forEach(function(x){ x.setAttribute("aria-pressed", String(x.dataset.group===d.group)); });
    return;
  }
  switch(d.act){
    case "undo": if(toastUndo) toastUndo(); break;
    case "refresh": refresh(true); break;
    case "add": openAdd(d.name||(view==="list"?query.trim():"")); break;
    case "close": closeSheet(); break;
    case "toggleout": showOut=!showOut; render(); break;
    case "edit": sheet.editing=true; sheet.group=null; renderSheet(); $("#sheet").scrollTop=0; break;
    case "canceledit": sheet.editing=false; sheet.group=null; renderSheet(); break;
    case "saveedit": saveEdit(); break;
    case "delete": deleteItem(b); break;
    case "staple": toggleStaple(); break;
    case "newgroup": {
      var ng=$("#edNewGroup")||$("#addNewGroup"); if(!ng) break;
      ng.hidden=false; ng.focus(); sheet.newGroup=true; sheet.group="";
      document.querySelectorAll("[data-group]").forEach(function(x){ x.setAttribute("aria-pressed","false"); });
      break;
    }
    case "qty": sheet.qty=Math.max(1, sheet.qty+(+d.d)); renderAddMatches(); break;
    case "create": createItem(b); break;
    case "unlock": unlock(); break;
  }
});
document.addEventListener("input", function(e){
  if(e.target.id==="q"){ query=e.target.value; keepVisible={}; renderList(); return; }
  if(e.target.id==="addName"){ renderAddMatches(); return; }
  if(e.target.id==="addNewGroup"){ sheet.newGroupText=e.target.value; return; }
});
document.addEventListener("keydown", function(e){
  if(e.key!=="Enter") return;
  if(e.target.id==="gPass"){ e.preventDefault(); $("#gWho").focus(); }
  else if(e.target.id==="gWho"){ e.preventDefault(); unlock(); }
  else if(e.target.id==="addName"){ e.preventDefault(); e.target.blur(); }
});

/* ---------- start ---------- */
(function(){ var c=readJSON(K.cache,null); if(c && c.items){ items=c.items; log=c.log||[]; lastSync=c.at||0; loaded=true; } })();
render();
if(!pass) showGate(); else { refresh(true); if(Object.keys(pending).length) send(); }

window.addEventListener("online", function(){ refresh(true); send(); renderSync(); });
window.addEventListener("offline", renderSync);
document.addEventListener("visibilitychange", function(){
  if(document.visibilityState==="visible"){ keepVisible={}; render(); refresh(false); send(); }
  else if(Object.keys(pending).length){ clearTimeout(sendTimer); send(); }   /* save right away when you leave the app */
});
setInterval(renderSync, 60000);

if("serviceWorker" in navigator){
  window.addEventListener("load", function(){ navigator.serviceWorker.register("sw.js", {updateViaCache:"none"}).then(function(r){ r.update().catch(function(){}); }).catch(function(){}); });
  var hadController=!!navigator.serviceWorker.controller, reloading=false;
  navigator.serviceWorker.addEventListener("controllerchange", function(){
    if(!hadController || reloading || busy() || sheet) return;
    reloading=true; location.reload();
  });
}
})();
