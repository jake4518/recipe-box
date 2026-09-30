
(function(){
"use strict";
/* ---------- where the data lives ---------- */
var API = "https://script.google.com/macros/s/AKfycbyCJiO1v_3d9OV8CSvS589vksbBhpK7HgRU8xpBzXIptD8kO33NE2Ly3hCxxu2wwJ35/exec";
var K = {cache:"recipebox:cache", pass:"recipebox:pass", who:"recipebox:who", pending:"recipebox:pending"};
function lsGet(k){ try{ return localStorage.getItem(k); }catch(e){ return null; } }
function lsSet(k,v){ try{ localStorage.setItem(k,v); return true; }catch(e){ return false; } }
function lsDel(k){ try{ localStorage.removeItem(k); }catch(e){} }
var pass = lsGet(K.pass) || "", who = lsGet(K.who) || "";
var recipes = [], byId = {}, loaded = false;
function normalize(r){
  if(r.meals==null) r.meals=1; if(r.planned==null) r.planned=false;
  r.tags=r.tags||{}; ["meal","main","diet"].forEach(function(k){ r.tags[k]=r.tags[k]||[]; });
  r.protein=r.protein||[]; r.aka=r.aka||[]; r.ingredients=r.ingredients||[]; r.steps=r.steps||[];
  r.source=r.source||{name:"",url:""};
  return r;
}
function setRecipes(list){
  recipes=(list||[]).map(normalize).sort(function(a,b){ return a.title.localeCompare(b.title); });
  byId={}; recipes.forEach(function(r){ byId[r.id]=r; });
  buildHay();
}
function saveCache(){ lsSet(K.cache, JSON.stringify({savedAt:Date.now(), recipes:recipes})); }
function upsert(r){ setRecipes(recipes.filter(function(x){ return x.id!==r.id; }).concat([r])); saveCache(); }
function removeLocal(id){ setRecipes(recipes.filter(function(x){ return x.id!==id; })); saveCache(); }

/* Photos just uploaded take about a minute to go live on GitHub, so show the local copy until then. */
var pending=(function(){ try{ return JSON.parse(lsGet(K.pending)||"{}")||{}; }catch(e){ return {}; } })();
(function(){ var now=Date.now(), ch=false; Object.keys(pending).forEach(function(k){ if(!pending[k]||now-pending[k].t>30*60*1000){ delete pending[k]; ch=true; } }); if(ch) lsSet(K.pending, JSON.stringify(pending)); })();
function addPending(name, full, thumb){ pending[name]={full:full, thumb:thumb, t:Date.now()}; lsSet(K.pending, JSON.stringify(pending)); }
function photoSrc(r, size){
  var p=r.photo, sz=size==="full"?"full":"thumb"; if(!p) return "";
  if(p.indexOf("data:")===0) return p;
  if(pending[p]) return pending[p][sz];
  return "photos/"+sz+"/"+encodeURIComponent(p);
}

var $ = function(s){ return document.querySelector(s); };
var esc = function(s){ return String(s==null?"":s).replace(/[&<>"']/g,function(c){return {"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c];}); };
var clone = function(o){ return JSON.parse(JSON.stringify(o)); };
var reduced = window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches;

var I = {
  clock:'<svg width="15" height="15" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>',
  sun:'<svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></svg>',
  caret:'<svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true"><path d="M6 9l6 6 6-6"/></svg>',
  back:'<svg width="22" height="22" viewBox="0 0 24 24" aria-hidden="true"><path d="M15 5l-7 7 7 7"/></svg>',
  close:'<svg width="22" height="22" viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg>',
  pencil:'<svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true"><path d="M4 20h4L19 9l-4-4L4 16v4z"/></svg>',
  plus:'<svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg>',
  sliders:'<svg width="20" height="20" viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h10M18 7h2M4 17h2M10 17h10"/><circle cx="16" cy="7" r="2"/><circle cx="8" cy="17" r="2"/></svg>',
  bookmark:'<svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true"><path d="M6 3h12v18l-6-4.2L6 21V3z"/></svg>',
  shuffle:'<svg width="20" height="20" viewBox="0 0 24 24" aria-hidden="true"><path d="M16 3h5v5M4 20 21 3M21 16v5h-5M15 15l6 6M4 4l5 5"/></svg>'
};

/* ---------- page skeleton ---------- */
$("#app").innerHTML =
'<div class="wrap">'+
  '<header class="head"><div class="headrow"><div><h1>Our Recipe Box</h1><p id="count"></p></div>'+
  '<button class="btn primary small" id="addBtn" data-act="add" aria-label="Add recipe" hidden>'+I.plus+'<span class="lbl">Add recipe</span></button></div></header>'+
  '<div class="tabs" id="tabs"></div><div id="planbar" class="planbar"></div>'+
  '<div class="searchbar"><input id="q" type="search" placeholder="Search by name or ingredient" enterkeyhint="search" autocomplete="off" aria-label="Search recipes">'+
  '<div id="quick" class="quick"></div><div id="active" class="active"></div></div>'+
  '<main id="grid" class="grid"></main>'+
'</div>'+
'<div class="bar"><button class="btn" data-act="filters" id="filterBtn"></button>'+
'<button class="btn pop" data-act="surprise">'+I.shuffle+'Surprise us</button></div>'+
'<div id="detail" class="overlay" hidden></div>'+
'<div id="editor" class="overlay" hidden></div>'+
'<div id="gate" class="overlay" hidden></div>'+
'<div id="filterScrim" class="scrim" hidden><div class="panel" role="dialog" aria-modal="true" aria-label="Filters">'+
  '<div class="phead"><h2 id="filterTitle">Filters</h2><button class="btn small" id="filterClear" data-act="clearall">Clear all</button></div>'+
  '<div class="pbody" id="filterBody"></div><div class="pfoot"><button class="btn primary" data-act="closefilters" id="filterDone"></button></div></div></div>'+
'<div id="pickScrim" class="scrim" hidden><div class="panel" id="pickBox" role="dialog" aria-modal="true" aria-label="Recipe suggestions"></div></div>'+
'<div id="toast" class="toast" role="status" hidden></div>';

/* ---------- filter groups ---------- */
var MEAL_LBL = {1:"One-fer", 2:"Two-fer"}, T_A = "1 hour or less", T_B = "Over 1 hour";
var GROUPS = [
  {key:"protein",  label:"Protein",         get:function(r){return r.protein||[]}, first:"Vegetarian"},
  {key:"meals",     label:"One-fer or Two-fer", get:function(r){return [MEAL_LBL[r.meals]||MEAL_LBL[1]]}, order:[MEAL_LBL[1],MEAL_LBL[2]]},
  {key:"main",     label:"Main ingredient", get:function(r){return r.tags.main||[]}},
  {key:"effort",   label:"Effort",          get:function(r){return [r.tags.effort]}},
  {key:"cuisine",  label:"Cuisine",         get:function(r){return [r.tags.cuisine]}},
  {key:"meal",     label:"Meal",            get:function(r){return r.tags.meal||[]}, order:["Breakfast","Brunch","Lunch","Dinner","Side","Snack","Condiment","Dessert"]},
  {key:"diet",     label:"Other diets",     get:function(r){return r.tags.diet||[]}}
];
var QUICK = [{key:"protein", label:"Protein"}, {key:"meals", label:"Once or twice"}, {key:"meal", label:"Meal"}];
var QUICK_KEYS = {protein:1, meals:1, meal:1};
var sheetKey = null;
function findGroup(key){ return GROUPS.filter(function(g){ return g.key===key; })[0]; }
var view = "all";
var sel = {}; GROUPS.forEach(function(g){ sel[g.key]={}; });
var query = "";
var route = {id:null};
var canEdit = false, ed = null;

var fold = function(s){ return String(s==null?"":s).toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g,"").replace(/[^a-z0-9]+/g," ").trim(); };
var hay = {};
function buildHay(){
  hay = {};
  recipes.forEach(function(r){
    var parts=[r.title,r.tags.cuisine,r.source&&r.source.name].concat(r.aka||[],r.protein||[],r.tags.main||[],r.tags.diet||[],r.tags.meal||[]);
    r.ingredients.forEach(function(g){ g.items.forEach(function(i){ parts.push(i); }); });
    hay[r.id]=fold(parts.join(" "));
  });
}
buildHay();

function plannedCount(){ return recipes.filter(function(r){ return r.planned; }).length; }
function selCount(){ var n=0; GROUPS.forEach(function(g){ n+=Object.keys(sel[g.key]).length; }); return n; }
function matches(r){
  if(view==="plan" && !r.planned) return false;
  for(var i=0;i<GROUPS.length;i++){
    var g=GROUPS[i];
    if(Object.keys(sel[g.key]).length && !g.get(r).some(function(v){ return sel[g.key][v]; })) return false;
  }
  var q=fold(query.trim());
  return !q || hay[r.id].indexOf(q)>-1;
}
function options(g){
  var s={}; recipes.forEach(function(r){ g.get(r).forEach(function(v){ if(v) s[v]=1; }); });
  var a=Object.keys(s);
  if(g.order) a.sort(function(x,y){ var i=g.order.indexOf(x), j=g.order.indexOf(y); if(i<0) i=99; if(j<0) j=99; return i-j || x.localeCompare(y); });
  else a.sort(function(x,y){ if(x===g.first) return -1; if(y===g.first) return 1; return x.localeCompare(y); });
  return a;
}

/* ---------- ingredient text helpers ---------- */
var UNITS="tsp|tbsp|teaspoons?|tablespoons?|cups?|cans?|packages?|packets?|pkg|cloves?|heads?|bunch(?:es)?|stems?|stalks?|sprigs?|sheets?|slices?|pieces?|fillets?|jars?|bottles?|boxe?s?|handfuls?|lbs?|pounds?|oz|ounces?|kg|grams?|g|ml|liters?|litres?|l|quarts?|cm|mm|inch(?:es)?|in|pinch(?:es)?|dash(?:es)?|large|medium|small";
var NUM="(?:\\d+\\s+)?\\d+\\/\\d+|\\d+(?:\\.\\d+)?(?:\\s?[¼½¾⅓⅔⅛⅜⅝⅞])?|[¼½¾⅓⅔⅛⅜⅝⅞]";
/* amount = number, optional range ("2-3", "1 ½ - 2", "2 to 3"), optional (14 oz) note, optional unit */
var QTY = new RegExp("^("+NUM+")(?:\\s*[-\u2013\u2014]\\s*("+NUM+")|\\s+to\\s+("+NUM+"))?((?:\\s*\\([^)]*\\))?(?:\\s*(?:"+UNITS+")\\b\\.?(?:\\s*\\([^)]*\\))?)?)","i");
function splitIng(line){
  var m=QTY.exec(line); if(!m) return ["", line];
  var q=m[1]+(m[2]?"\u2013"+m[2]:(m[3]?" to "+m[3]:""))+m[4];
  return [q.replace(/\s+/g," ").trim(), line.slice(m[0].length).replace(/^\s*\.?\s*/,"").replace(/^of\s+/i,"").trim()];
}
function ingToText(gs){ return gs.map(function(g){ return (g.group?g.group+":\n":"")+g.items.join("\n"); }).join("\n\n"); }
function textToIng(t){
  var groups=[], cur=null;
  String(t).split(/\r?\n/).forEach(function(l){
    l=l.trim(); if(!l) return;
    if(l.slice(-1)===":"){ cur={group:l.slice(0,-1).trim()||null,items:[]}; groups.push(cur); return; }
    if(!cur){ cur={group:null,items:[]}; groups.push(cur); }
    cur.items.push(l);
  });
  return groups.filter(function(g){ return g.items.length; });
}
function textToSteps(t){
  return String(t).split(/\r?\n/).map(function(l){ return l.trim().replace(/^\d+[.)]\s+/,""); }).filter(Boolean);
}
function csv(t){ return String(t).split(",").map(function(x){ return x.trim(); }).filter(Boolean); }

/* ---------- pieces ---------- */
function tile(r, size){
  var src=photoSrc(r, size), emo=esc(r.emoji||"🍽️");
  return '<div class="tile" style="--h:'+(r.hue||0)+'">'+
    (src?'<img src="'+esc(src)+'" alt="'+esc(r.title)+'" loading="lazy" data-emo="'+emo+'">':'<span class="emo" aria-hidden="true">'+emo+'</span>')+'</div>';
}
document.addEventListener("error", function(e){
  var t=e.target; if(!t || t.tagName!=="IMG" || !t.hasAttribute("data-emo")) return;
  var s=document.createElement("span"); s.className="emo"; s.setAttribute("aria-hidden","true"); s.textContent=t.getAttribute("data-emo")||"🍽️";
  t.replaceWith(s);
}, true);
function fmtTime(m){
  m=Math.round(m||0); if(m<=0) return "";
  var h=Math.floor(m/60), n=m%60;
  return h ? (h+" hr"+(n?" "+n+" min":"")) : n+" min";
}
function pills(r, withTime){
  var p=(r.protein||[]).map(function(x){ return '<span class="pill'+(x==="Vegetarian"?' veg':'')+'">'+esc(x)+'</span>'; });
  if(r.meals>=2) p.push('<span class="pill lo">'+MEAL_LBL[2]+'</span>');
  if(withTime && r.timeMin>0) p.push('<span class="pill time">'+I.clock+fmtTime(r.timeMin)+'</span>');
  return '<div class="pills">'+p.join("")+'</div>';
}
function planToggleHTML(r){
  if(canEdit) return '<button class="planbtn" data-toggleplan="'+esc(r.id)+'" aria-pressed="'+(!!r.planned)+'" aria-label="'+(r.planned?'Remove from meal plan: ':'Add to meal plan: ')+esc(r.title)+'">'+I.bookmark+'</button>';
  if(r.planned) return '<span class="planbadge" aria-label="In meal plan" title="In meal plan">'+I.bookmark+'</span>';
  return "";
}
function card(r){
  return '<article class="card"><button class="card-main" data-open="'+esc(r.id)+'">'+tile(r)+
    '<div class="cbody"><h3>'+esc(r.title)+'</h3>'+pills(r)+'</div></button>'+planToggleHTML(r)+'</article>';
}
function ingredientsHTML(r){
  return r.ingredients.map(function(g){
    return (g.group?'<h4>'+esc(g.group)+'</h4>':'')+'<ul>'+g.items.map(function(line){
      var s=splitIng(line);
      return '<li><label><input type="checkbox"><span>'+(s[0]?'<span class="q">'+esc(s[0])+'</span> ':'')+esc(s[1])+'</span></label></li>';
    }).join("")+'</ul>';
  }).join("");
}
function safeUrl(u){ return /^https?:\/\//i.test(u||"") ? u : ""; }
function sourceHTML(r){
  var s=r.source||{}, url=safeUrl(s.url);
  if(url){
    var host=s.name||url; try{ host=new URL(url).hostname.replace(/^www\./,""); }catch(e){}
    return 'Original recipe: <a href="'+esc(url)+'" target="_blank" rel="noopener noreferrer">'+esc(host)+'</a>';
  }
  return s.name ? 'Source: '+esc(s.name) : '';
}

/* ---------- toast ---------- */
var toastTimer=null;
function toast(msg,ms){ var t=$("#toast"); t.textContent=msg; t.hidden=false; clearTimeout(toastTimer); toastTimer=setTimeout(function(){ t.hidden=true; },ms||3500); }

/* ---------- list ---------- */
function renderQuick(){
  $("#quick").innerHTML=QUICK.map(function(q){
    var vals=Object.keys(sel[q.key]), n=vals.length;
    var label = n===0 ? q.label : (n===1 ? vals[0] : q.label+" ("+n+")");
    return '<button class="qf" data-qf="'+q.key+'" aria-pressed="'+(n>0)+'" aria-haspopup="dialog"><span>'+esc(label)+'</span>'+I.caret+'</button>';
  }).join("");
}
function renderTabs(){
  var n=plannedCount();
  $("#tabs").innerHTML=
    '<button class="tab" data-view="all" aria-pressed="'+(view==="all")+'">All recipes</button>'+
    '<button class="tab" data-view="plan" aria-pressed="'+(view==="plan")+'">'+I.bookmark+'Meal plan'+(n?' <span class="tcount">'+n+'</span>':'')+'</button>';
  $("#planbar").innerHTML = (view==="plan" && canEdit && n) ? '<button class="btn small" data-act="clearplan">Clear meal plan</button>' : "";
}
function rankMatches(list){
  var q=fold(query.trim()); if(!q) return list;
  var rank=function(r){ if(fold(r.title).indexOf(q)>-1) return 0; if((r.aka||[]).some(function(a){ return fold(a).indexOf(q)>-1; })) return 1; return 2; };
  return list.map(function(r,i){ return {r:r,k:rank(r),i:i}; }).sort(function(a,b){ return a.k-b.k || a.i-b.i; }).map(function(x){ return x.r; });
}
function renderList(){
  var list=rankMatches(recipes.filter(matches));
  var pool = view==="plan" ? plannedCount() : recipes.length;
  var noun = view==="plan" ? "planned" : "recipes";
  $("#count").textContent = pool===0 ? "" : (list.length===pool ? pool+" "+noun : list.length+" of "+pool+" "+noun);
  if(list.length) $("#grid").innerHTML=list.map(card).join("");
  else if(view==="plan" && pool===0) $("#grid").innerHTML='<div class="empty"><p>Nothing planned yet.</p><p style="margin-top:-8px">Tap the bookmark on any recipe to add it here.</p><button class="btn primary" data-view="all">Browse recipes</button></div>';
  else if(recipes.length) $("#grid").innerHTML='<div class="empty"><p>No recipes match those filters.</p><button class="btn primary" data-act="clearall">Clear filters</button></div>';
  else if(!loaded) $("#grid").innerHTML='<div class="empty"><p>Loading recipes…</p></div>';
  else $("#grid").innerHTML='<div class="empty"><p>No recipes yet.</p>'+(canEdit?'<button class="btn primary" data-act="add">Add the first one</button>':'')+'</div>';
  var chips=[];
  GROUPS.forEach(function(g){ if(QUICK_KEYS[g.key]) return; Object.keys(sel[g.key]).forEach(function(v){
    chips.push('<button class="chip rm" data-rm="'+g.key+'" data-v="'+esc(v)+'">'+esc(v)+' ×</button>');
  }); });
  if(chips.length>1) chips.push('<button class="chip clear" data-act="clearall">Clear all</button>');
  $("#active").innerHTML=chips.join("");
  var n=selCount();
  $("#filterBtn").innerHTML=I.sliders+'Filters'+(n?' <span class="badge">'+n+'</span>':'');
  $("#addBtn").hidden=!canEdit;
  renderTabs(); renderQuick();
}
function syncPressed(){
  document.querySelectorAll("[data-g]").forEach(function(el){ el.setAttribute("aria-pressed",!!sel[el.dataset.g][el.dataset.v]); });
}

/* ---------- filter sheet ---------- */
function drawFilters(){
  var groups = sheetKey ? [findGroup(sheetKey)] : GROUPS, html="";
  groups.forEach(function(g){
    var opts=options(g); if(!opts.length) return;
    html+=(sheetKey?'':'<h3>'+esc(g.label)+'</h3>')+'<div class="chips">'+opts.map(function(v){
      return '<button class="chip'+(v===MEAL_LBL[2]?' lo':'')+'" data-g="'+g.key+'" data-v="'+esc(v)+'" aria-pressed="'+(!!sel[g.key][v])+'">'+esc(v)+'</button>';
    }).join("")+'</div>';
  });
  var title = sheetKey ? findGroup(sheetKey).label : "Filters";
  $("#filterTitle").textContent=title;
  $("#filterScrim .panel").setAttribute("aria-label", title);
  var cb=$("#filterClear"); cb.textContent = sheetKey ? "Clear" : "Clear all"; cb.dataset.act = sheetKey ? "cleargroup" : "clearall";
  $("#filterBody").innerHTML=html; updateDone();
}
function openFilters(key){ sheetKey=key||null; drawFilters(); $("#filterScrim").hidden=false; }
function clearGroup(key){ sel[key]={}; renderList(); syncPressed(); if(!$("#filterScrim").hidden) updateDone(); }
function updateDone(){ var n=recipes.filter(matches).length; $("#filterDone").textContent="Show "+n+" recipe"+(n===1?"":"s"); }
function clearAll(){ GROUPS.forEach(function(g){ sel[g.key]={}; }); renderList(); syncPressed(); if(!$("#filterScrim").hidden) updateDone(); }

/* ---------- detail ---------- */
function detailHTML(r){
  var src=sourceHTML(r);
  return '<div class="dwrap">'+
    '<div class="dnav"><button class="iconbtn" data-act="up" aria-label="Back to all recipes">'+I.back+'</button>'+
    (canEdit?'<button class="btn small" data-act="edit" data-id="'+esc(r.id)+'">'+I.pencil+'Edit</button>':'<span></span>')+'</div>'+
    '<div class="dhero">'+tile(r,"full")+'</div>'+
    '<h2 class="dtitle">'+esc(r.title)+'</h2>'+pills(r,true)+
    '<p class="dplanwrap">'+
      (canEdit?'<button class="btn small dplan" data-toggleplan="'+esc(r.id)+'" aria-pressed="'+(!!r.planned)+'">'+I.bookmark+(r.planned?'In meal plan':'Add to meal plan')+'</button>'
              :(r.planned?'<span class="pill dplan">'+I.bookmark+'In meal plan</span>':''))+
      (wakeSupported()?'<button class="btn small dwake" data-act="wake" aria-pressed="'+wakeWanted+'">'+I.sun+(wakeWanted?'Screen on':'Keep screen on')+'</button>':'')+
    '</p>'+
    (src?'<p class="src">'+src+'</p>':'')+
    (r.notes?'<p class="heads">'+esc(r.notes)+'</p>':'')+
    '<div class="dcols"><section class="ing"><h3>Ingredients</h3>'+ingredientsHTML(r)+'</section>'+
    '<section class="dir"><h3>Directions</h3><ol>'+r.steps.map(function(s){ return '<li>'+esc(s)+'</li>'; }).join("")+'</ol></section></div>'+
    (r.meals>=2&&r.mealsNote?'<section class="left"><h3>The second meal</h3><p>'+esc(r.mealsNote)+'</p></section>':'')+
  '</div>';
}

/* ---------- keep the screen on while a recipe is open ---------- */
var wake=null, wakeBusy=false, wakeWanted=lsGet("recipebox:wake")!=="off";
function wakeSupported(){ return "wakeLock" in navigator; }
function syncWake(){
  if(!wakeSupported()) return;
  var want = wakeWanted && !!route.id && document.visibilityState==="visible";
  if(want && !wake && !wakeBusy){
    wakeBusy=true;
    navigator.wakeLock.request("screen").then(function(l){
      wakeBusy=false; wake=l;
      l.addEventListener("release", function(){ if(wake===l) wake=null; });
      if(!(wakeWanted && route.id)) syncWake();
    }).catch(function(){ wakeBusy=false; });
  } else if(!want && wake){
    var l=wake; wake=null; l.release().catch(function(){});
  }
}
function toggleWake(btn){
  wakeWanted=!wakeWanted; lsSet("recipebox:wake", wakeWanted?"on":"off");
  if(btn){ btn.setAttribute("aria-pressed", String(wakeWanted)); btn.innerHTML=I.sun+(wakeWanted?"Screen on":"Keep screen on"); }
  toast(wakeWanted?"Your screen will stay on while a recipe is open.":"Your screen will sleep like normal.");
  syncWake();
}

/* ---------- routing (phone back button closes the recipe) ---------- */
function parseHash(){
  var p=(location.hash||"").replace(/^#\/?/,"").split("/");
  return (p[0]==="r" && byId[p[1]]) ? {id:p[1]} : {id:null};
}
function apply(rt){
  var prev=route; route=rt;
  var d=$("#detail");
  closeSheets();
  if(rt.id){ if(prev.id!==rt.id || d.hidden){ d.innerHTML=detailHTML(byId[rt.id]); d.hidden=false; d.scrollTop=0; } }
  else { d.hidden=true; d.innerHTML=""; }
  document.documentElement.classList.toggle("noscroll", !!rt.id || !$("#editor").hidden || !$("#gate").hidden);
  syncWake();
}
function nav(id){
  try{ history.pushState({app:1},"", "#"+(id?"/r/"+id:"")); }catch(e){}
  apply({id:id||null});
}
function up(){
  if(history.state && history.state.app){ history.back(); return; }
  try{ history.replaceState(null,"","#"); }catch(e){}
  apply({id:null});
}
window.addEventListener("popstate", function(){ apply(parseHash()); });

/* ---------- surprise: 2-3 suggestions ---------- */
var deck={sig:"",ids:[],i:0,last:[]}, spinTimer=null;
function shuffle(a){ for(var i=a.length-1;i>0;i--){ var j=Math.floor(Math.random()*(i+1)); var t=a[i]; a[i]=a[j]; a[j]=t; } return a; }
function sig(){ return JSON.stringify([GROUPS.map(function(g){ return Object.keys(sel[g.key]).sort(); }), query.trim(), recipes.length]); }
function pickCount(n){ return n<=2 ? n : (n>=6 ? 3 : 2); }
var MAIN_MEALS={Breakfast:1,Brunch:1,Lunch:1,Dinner:1};
function isMain(r){ var m=r.tags.meal||[]; return !m.length || m.some(function(x){ return MAIN_MEALS[x]; }); }
function nextBatch(){
  var pool=recipes.filter(matches); if(!pool.length) return null;
  var mainsOnly=false;
  if(!Object.keys(sel.meal).length){ var mains=pool.filter(isMain); if(mains.length && mains.length<pool.length){ pool=mains; mainsOnly=true; } }
  var n=pickCount(pool.length), s=sig();
  if(deck.sig!==s || deck.i+n>deck.ids.length){
    var last=deck.sig===s ? deck.last : [];
    var ids=shuffle(pool.map(function(r){ return r.id; }));
    if(pool.length>n) ids=ids.filter(function(x){ return last.indexOf(x)<0; }).concat(ids.filter(function(x){ return last.indexOf(x)>-1; }));
    deck={sig:s,ids:ids,i:0,last:[]};
  }
  var batch=deck.ids.slice(deck.i,deck.i+n); deck.i+=n; deck.last=batch;
  return {items:batch.map(function(id){ return byId[id]; }), total:pool.length, mainsOnly:mainsOnly};
}
function pickRows(items,cls){
  return items.map(function(r){
    return '<button class="prow '+cls+'" data-open="'+esc(r.id)+'">'+tile(r)+'<div><h3>'+esc(r.title)+'</h3>'+pills(r)+'</div></button>';
  }).join("");
}
function showPick(){
  clearInterval(spinTimer);
  var box=$("#pickBox"), b=nextBatch();
  $("#pickScrim").hidden=false;
  if(!b){
    box.innerHTML='<div class="pickhead"><h2>Nothing to pick from</h2><p>No recipes match your current filters.</p></div>'+
      '<div class="pickfoot"><button class="btn" data-act="closepick">Close</button><button class="btn primary" data-act="clearpick">Clear filters</button></div>';
    return;
  }
  var filtered = selCount() || query.trim();
  var head='<div class="pickhead"><h2>How about one of these?</h2><p>'+(filtered?'From '+b.total+' recipe'+(b.total===1?'':'s')+' matching your filters':(b.mainsOnly?'From '+b.total+' main dishes':'From all '+b.total+' recipes'))+'</p></div>';
  var foot='<div class="pickfoot"><button class="btn" data-act="closepick">Close</button>'+(b.total>b.items.length?'<button class="btn primary" data-act="surprise">Shuffle again</button>':'')+'</div>';
  function land(){ box.innerHTML=head+'<div class="plist">'+pickRows(b.items,"land")+'</div>'+foot; }
  if(reduced || recipes.length<2){ land(); return; }
  box.innerHTML=head+'<div class="plist">'+pickRows(b.items,"spin")+'</div>'+foot;
  var tiles=[].slice.call(box.querySelectorAll(".prow .tile")), n=0;
  spinTimer=setInterval(function(){
    tiles.forEach(function(t){
      var x=recipes[Math.floor(Math.random()*recipes.length)];
      t.querySelector(".emo") && (t.querySelector(".emo").textContent=x.emoji||"🍽️");
      t.style.setProperty("--h",x.hue||0);
    });
    if(++n>=8){ clearInterval(spinTimer); land(); }
  },95);
}
function closeSheets(){ clearInterval(spinTimer); $("#filterScrim").hidden=true; $("#pickScrim").hidden=true; }

/* ---------- saving: talks to the Google Sheet through Apps Script ---------- */
var OFFLINE_MSG="You're offline. Editing comes back when you're connected.";
function isOnline(){ return navigator.onLine!==false; }
function api(action, data){
  var body={action:action, passcode:pass, who:who};
  if(data) Object.keys(data).forEach(function(k){ body[k]=data[k]; });
  return fetch(API,{method:"POST", headers:{"Content-Type":"text/plain;charset=utf-8"}, body:JSON.stringify(body), redirect:"follow"})
    .then(function(res){ return res.text(); }, function(){ throw {error:"network"}; })
    .then(function(t){ try{ return JSON.parse(t); }catch(e){ throw {error:"bad_response", detail:String(t).replace(/<[^>]*>/g," ").replace(/\s+/g," ").trim().slice(0,160)}; } })
    .then(function(res){ if(action!=="ping" && res && res.ok===false && res.error==="bad_passcode") lockOut(); return res; });
}
function problem(e, fallback){
  var err=(e&&e.error)||"", detail=String((e&&e.detail)||"");
  if(err==="bad_passcode") toast("The passcode changed. Enter the new one to keep going.",6000);
  else if(err==="network"||!isOnline()) toast("Couldn't reach the recipe box. Check your connection and try again.",5000);
  else if(detail.indexOf("github_token")>-1) toast("The photo didn't upload because the GitHub token expired. Renew it, or remove the photo and save.",8000);
  else {
    var why = detail || (e && e.message) || err;
    toast((fallback||"Something went wrong. Try again.")+(why?" ("+why.slice(0,160)+")":""),9000);
    if(window.console) console.error(e);
  }
}
function setBusy(b, label){
  var s=document.querySelector('[data-act="saveed"]'); if(s){ s.disabled=b; s.textContent=b?(label||"Saving…"):"Save recipe"; }
  var d=document.querySelector('[data-act="deleteed"]'); if(d){ d.disabled=b; if(!b){ delete d.dataset.armed; d.textContent="Delete"; } }
}
function refreshViews(){
  renderQuick(); renderList();
  if(route.id){
    if(!byId[route.id]){ up(); return; }
    var d=$("#detail"), keep=d.scrollTop; d.innerHTML=detailHTML(byId[route.id]); d.scrollTop=keep;
  }
}

var lastSync=0, syncing=false;
function refresh(force){
  if(!pass||syncing||!isOnline()) return;
  if(!force && Date.now()-lastSync<30000) return;
  syncing=true;
  api("list").then(function(res){
    syncing=false; if(!res.ok) throw res;
    lastSync=Date.now(); loaded=true; setRecipes(res.recipes); saveCache(); refreshViews();
    if(!route.id && parseHash().id) apply(parseHash());
  }).catch(function(e){
    syncing=false; if(e&&e.error==="bad_passcode") return;
    if(!loaded){ loaded=true; renderList(); problem(e,"Couldn't load recipes. Close and reopen the app to try again."); }
  });
}
function updateCanEdit(){ var v=!!pass&&isOnline(); if(v!==canEdit){ canEdit=v; refreshViews(); } }

function togglePlanned(id){
  var r=byId[id]; if(!r) return;
  if(!isOnline()){ toast(OFFLINE_MSG); return; }
  var was=r.planned; r.planned=!was; saveCache(); refreshViews();
  api("plan",{id:id, planned:!was}).then(function(res){ if(!res.ok) throw res; }).catch(function(e){
    if(byId[id]){ byId[id].planned=was; saveCache(); refreshViews(); }
    problem(e,"Couldn't update the meal plan. Try again.");
  });
}
function clearPlan(){
  var on=recipes.filter(function(r){ return r.planned; }).map(function(r){ return r.id; });
  if(!on.length){ toast("Nothing on the meal plan yet."); return; }
  if(!isOnline()){ toast(OFFLINE_MSG); return; }
  on.forEach(function(id){ byId[id].planned=false; }); saveCache(); refreshViews();
  api("clearPlan").then(function(res){ if(!res.ok) throw res; toast("Meal plan cleared."); }).catch(function(e){
    on.forEach(function(id){ if(byId[id]) byId[id].planned=true; }); saveCache(); refreshViews();
    problem(e,"Couldn't clear the meal plan. Try again.");
  });
}

/* Photos are resized on the phone, then sent as a full size and a thumbnail. */
function loadImg(src){ return new Promise(function(res,rej){ var i=new Image(); i.onload=function(){ res(i); }; i.onerror=rej; i.src=src; }); }
function encodeImg(img, w, h, q){
  var c=document.createElement("canvas"); c.width=w; c.height=h; c.getContext("2d").drawImage(img,0,0,w,h);
  var u=c.toDataURL("image/webp",q); return u.indexOf("data:image/webp")===0 ? u : c.toDataURL("image/jpeg",Math.min(0.9,q+0.08));
}
function uploadPhoto(id, dataUrl){
  return loadImg(dataUrl).then(function(img){
    var W=img.naturalWidth, H=img.naturalHeight;
    var fs=Math.min(1,1000/Math.max(W,H)), ts=Math.min(1,480/Math.min(W,H));
    var full=encodeImg(img,Math.round(W*fs),Math.round(H*fs),0.72), thumb=encodeImg(img,Math.round(W*ts),Math.round(H*ts),0.62);
    return api("photo",{id:id, full:full.split(",")[1], thumb:thumb.split(",")[1]}).then(function(res){
      if(!res.ok) throw res; addPending(res.photo, full, thumb); return res.photo;
    });
  });
}

/* ---------- passcode screen ---------- */
function gateHTML(){
  return '<div class="edwrap gate">'+
   '<div class="gatehead"><div class="gateicon" aria-hidden="true">🍳</div><h2>Our Recipe Box</h2><p>Enter the passcode to open the box. You only do this once on this phone.</p></div>'+
   '<div class="field"><label class="flabel" for="g-pass">Passcode</label><input id="g-pass" type="password" autocomplete="current-password" enterkeyhint="next"></div>'+
   '<div class="field"><label class="flabel" for="g-who">Your name</label><input id="g-who" type="text" autocomplete="given-name" enterkeyhint="go" value="'+esc(who)+'" placeholder="Shown on recipes you edit"></div>'+
   '<button class="btn primary big gatebtn" data-act="unlock">Open recipe box</button>'+
  '</div>';
}
function showGate(){
  var g=$("#gate"); if(!g.hidden) return;
  g.innerHTML=gateHTML(); g.hidden=false; document.documentElement.classList.add("noscroll");
  setTimeout(function(){ var p=document.getElementById("g-pass"); if(p) p.focus(); },60);
}
function hideGate(){ var g=$("#gate"); g.hidden=true; g.innerHTML=""; document.documentElement.classList.toggle("noscroll", !!route.id || !!ed); }
function lockOut(){ pass=""; lsDel(K.pass); canEdit=false; showGate(); }
function unlock(){
  var p=document.getElementById("g-pass").value.trim(), w=document.getElementById("g-who").value.trim();
  if(!p){ toast("Enter the passcode."); return; }
  if(!w){ toast("Add your name so edits show who made them."); return; }
  if(!isOnline()){ toast("You need a connection the first time."); return; }
  var b=document.querySelector('[data-act="unlock"]'); b.disabled=true; b.textContent="Checking…";
  var reset=function(){ b.disabled=false; b.textContent="Open recipe box"; };
  var prev=pass; pass=p;
  api("ping").then(function(res){
    if(!res.ok){ pass=prev; reset(); toast(res.error==="bad_passcode"?"That passcode didn't work. Try again.":"Something went wrong. Try again."); return; }
    lsSet(K.pass,p); who=w; lsSet(K.who,w); $("#toast").hidden=true; hideGate(); updateCanEdit(); renderList(); refresh(true);
  }).catch(function(e){ pass=prev; reset(); problem(e); });
}

/* ---------- editor ---------- */
var PROTEINS=["Vegetarian","Chicken","Ground beef","Beef","Sausage","Pork","Fish","Shrimp","Tofu"];
var MEALS=["Breakfast","Brunch","Lunch","Dinner","Side","Snack","Condiment","Dessert"];
function hueFor(s){ var h=0; for(var i=0;i<s.length;i++) h=(h*31+s.charCodeAt(i))%360; return h; }
function slug(s){ return s.toLowerCase().replace(/[^a-z0-9]+/g,"-").replace(/^-|-$/g,"").slice(0,40)||"recipe"; }
function uniqueId(title){ var base=slug(title), id=base; while(byId[id]) id=base+"-"+Math.random().toString(36).slice(2,6); return id; }
function guessEmoji(title,protein){
  var t=(title||"").toLowerCase(), rules=[[/burger/,"🍔"],[/pizza/,"🍕"],[/taco|burrito|quesadilla/,"🌮"],[/pasta|spaghetti|penne|noodle|mac|lasagna/,"🍝"],[/soup|stew|chili|chowder/,"🍲"],[/salad/,"🥗"],[/curry/,"🍛"],[/rice|bowl|risotto/,"🍚"],[/egg|shakshuka|omelet|frittata/,"🍳"],[/sandwich|wrap/,"🥪"],[/pancake|waffle/,"🥞"],[/cake|cookie|brownie|pie/,"🍰"]];
  for(var i=0;i<rules.length;i++) if(rules[i][0].test(t)) return rules[i][1];
  var p=(protein||[])[0];
  return {"Chicken":"🍗","Ground beef":"🥩","Beef":"🥩","Sausage":"🌭","Pork":"🥓","Fish":"🐟","Shrimp":"🍤","Tofu":"🥡","Vegetarian":"🥗"}[p]||"🍽️";
}
function blankRecipe(){
  return {title:"",emoji:"🍽️",hue:Math.floor(Math.random()*360),photo:null,protein:[],meals:1,mealsNote:"",planned:false,
    source:{name:"",url:""},timeMin:0,tags:{meal:["Dinner"],main:[],cuisine:"",effort:"",diet:[]},notes:"",aka:[],ingredients:[],steps:[]};
}
function proteinChoices(){
  var s={}, out=[]; PROTEINS.concat(recipes.reduce(function(a,r){ return a.concat(r.protein||[]); },[]), ed.protein).forEach(function(p){ if(!s[p]){ s[p]=1; out.push(p); } });
  return out;
}
function proteinChipsHTML(){
  return proteinChoices().map(function(p){ return '<button class="chip" data-edp="'+esc(p)+'" aria-pressed="'+(ed.protein.indexOf(p)>-1)+'">'+esc(p)+'</button>'; }).join("");
}
function mealChipsHTML(){
  return MEALS.concat(ed.meal.filter(function(m){ return MEALS.indexOf(m)<0; })).map(function(m){ return '<button class="chip" data-edm="'+esc(m)+'" aria-pressed="'+(ed.meal.indexOf(m)>-1)+'">'+esc(m)+'</button>'; }).join("");
}
function mealsChipsHTML(){
  return [1,2].map(function(n){ return '<button class="chip'+(n===2?' lo':'')+'" data-edn="'+n+'" aria-pressed="'+(ed.meals===n)+'">'+MEAL_LBL[n]+'</button>'; }).join("");
}
function photoRowHTML(){
  var prev={photo:ed.photo,emoji:(document.getElementById("ed-emoji")||{}).value||ed.emoji,hue:ed.hue,title:"Preview"};
  return tile(prev)+'<div class="pbtns"><button class="btn small" data-act="photo">'+(ed.photo?'Change photo':'Add photo')+'</button>'+(ed.photo?'<button class="btn small" data-act="rmphoto">Remove</button>':'')+'</div>';
}
function datalist(id,vals){ return '<datalist id="'+id+'">'+vals.map(function(v){ return '<option value="'+esc(v)+'">'; }).join("")+'</datalist>'; }
function uniq(a){ var s={}; return a.filter(function(x){ if(!x||s[x]) return false; s[x]=1; return true; }); }
function editorHTML(r){
  var efforts=uniq(["Weeknight","Weekend project"].concat(recipes.map(function(x){ return x.tags.effort; })));
  var cuisines=uniq(recipes.map(function(x){ return x.tags.cuisine; }));
  return '<div class="edwrap">'+
   '<div class="edtop"><button class="iconbtn" data-act="cancel" aria-label="Cancel">'+I.close+'</button><h2>'+(ed.isNew?'Add recipe':'Edit recipe')+'</h2><span style="width:44px"></span></div>'+
   (ed.isNew?'<div class="field importbox"><label class="flabel" for="ed-import">Import from a link</label><div class="otherp"><input id="ed-import" type="url" inputmode="url" placeholder="Paste a recipe link" autocomplete="off" enterkeyhint="go"><button class="btn small" data-act="import">Import</button></div><p class="hint">Fills in what it can from the recipe page. Check everything before saving.</p></div>':'')+
   '<div class="field"><label class="flabel" for="ed-title">Name</label><input id="ed-title" type="text" value="'+esc(r.title)+'" autocomplete="off"></div>'+
   '<div class="field"><span class="flabel">Photo</span><div class="photoedit" id="edPhotoRow">'+photoRowHTML()+'</div><input type="file" id="ed-photo" accept="image/*" hidden>'+
   '<p class="hint">No photo? An emoji is used instead. You can change it under More details.</p></div>'+
      '<div class="field"><span class="flabel">Main protein</span><div class="chips" id="edProtein">'+proteinChipsHTML()+'</div>'+
   '<div class="otherp"><input id="ed-otherp" type="text" placeholder="Something else, like Lamb" autocomplete="off"><button class="btn small" data-act="addother">Add</button></div></div>'+
   '<div class="field"><span class="flabel">How many meals does it usually make?</span><div class="chips" id="edMeals">'+mealsChipsHTML()+'</div>'+
   '<input id="ed-lo-note" type="text" style="margin-top:10px" placeholder="Optional tip for the second meal, like &quot;freezes well&quot;" value="'+esc(r.mealsNote)+'"></div>'+
   '<div class="field"><label class="flabel" for="ed-ing">Ingredients</label><textarea id="ed-ing" spellcheck="false">'+esc(ingToText(r.ingredients))+'</textarea>'+
   '<p class="hint">One per line. To make a group, add a line ending in a colon, like &quot;Toppings:&quot;.</p></div>'+
   '<div class="field"><label class="flabel" for="ed-steps">Directions</label><textarea id="ed-steps">'+esc(r.steps.join("\n"))+'</textarea><p class="hint">One step per line. Numbers are added for you.</p></div>'+
   '<div class="field"><label class="flabel" for="ed-notes">Notes</label><textarea id="ed-notes" class="short">'+esc(r.notes)+'</textarea></div>'+
   '<div class="row2 field"><div><label class="flabel" for="ed-src-name">Source</label><input id="ed-src-name" type="text" placeholder="Hello Fresh, Mom, a blog…" value="'+esc(r.source.name)+'"></div>'+
   '<div><label class="flabel" for="ed-src-url">Link</label><input id="ed-src-url" type="url" inputmode="url" placeholder="Leave empty if none" value="'+esc(r.source.url)+'"></div></div>'+
   '<details class="more"><summary>More details</summary>'+
     '<div class="field"><label class="flabel" for="ed-emoji">Emoji (shown when there\'s no photo)</label><input id="ed-emoji" type="text" maxlength="8" value="'+esc(r.emoji)+'" style="max-width:120px"></div>'+
     '<div class="field"><label class="flabel" for="ed-aka">Also searchable as</label><input id="ed-aka" type="text" value="'+esc((r.aka||[]).join(", "))+'" placeholder="Other spellings or names"><p class="hint">Never shown. Helps search find it, like &quot;dal, dahl&quot;. Separate with commas.</p></div>'+
     '<div class="field"><span class="flabel">Meal</span><div class="chips" id="edMeal">'+mealChipsHTML()+'</div></div>'+
     '<div class="row2 field"><div><label class="flabel" for="ed-time">Total minutes</label><input id="ed-time" type="number" inputmode="numeric" min="0" value="'+(r.timeMin||"")+'"></div>'+
     '<div><label class="flabel" for="ed-effort">Effort</label><input id="ed-effort" type="text" list="dl-effort" value="'+esc(r.tags.effort)+'" placeholder="Weeknight"></div></div>'+
     '<div class="field"><label class="flabel" for="ed-cuisine">Cuisine</label><input id="ed-cuisine" type="text" list="dl-cuisine" value="'+esc(r.tags.cuisine)+'"></div>'+
     '<div class="field"><label class="flabel" for="ed-main">Main ingredients</label><input id="ed-main" type="text" value="'+esc((r.tags.main||[]).join(", "))+'" placeholder="Pasta, Beans"><p class="hint">Separate with commas.</p></div>'+
     '<div class="field"><label class="flabel" for="ed-diet">Other diet tags</label><input id="ed-diet" type="text" value="'+esc((r.tags.diet||[]).join(", "))+'" placeholder="Gluten-free, Dairy-free"></div>'+
     datalist("dl-effort",efforts)+datalist("dl-cuisine",cuisines)+
   '</details>'+
   '<div class="edfoot">'+(ed.isNew?'':'<button class="btn danger" data-act="deleteed">Delete</button>')+'<button class="btn primary big" data-act="saveed">Save recipe</button></div>'+
  '</div>';
}
function readForm(){
  var v=function(id){ var e=document.getElementById(id); return e?e.value:""; };
  var url=v("ed-src-url").trim(); if(url && !/^https?:\/\//i.test(url)) url="https://"+url;
  return {
    id:ed.id, title:v("ed-title").trim(), emoji:v("ed-emoji").trim()||"🍽️", hue:ed.hue, photo:ed.photo,
    protein:ed.protein.slice(), meals:ed.meals, mealsNote:v("ed-lo-note").trim(),
    source:{name:v("ed-src-name").trim(), url:url}, timeMin:parseInt(v("ed-time"),10)||0,
    tags:{meal:ed.meal.slice(), main:csv(v("ed-main")), cuisine:v("ed-cuisine").trim(), effort:v("ed-effort").trim(), diet:csv(v("ed-diet"))},
    notes:v("ed-notes").trim(), aka:csv(v("ed-aka")), ingredients:textToIng(v("ed-ing")), steps:textToSteps(v("ed-steps"))
  };
}
function openEditor(id, draft){
  var base = draft || (id ? clone(byId[id]) : blankRecipe());
  ed = {isNew:!id, id:id||null, emoji:base.emoji||"🍽️", photo:base.photo||null, hue:base.hue||0, protein:(base.protein||[]).slice(),
        meal:(base.tags.meal||[]).slice(), meals:base.meals>=2?2:1, emojiTouched:!!id||!!draft, armed:false, snap:""};
  var box=$("#editor"); box.innerHTML=editorHTML(base); box.hidden=false; box.scrollTop=0;
  document.documentElement.classList.add("noscroll");
  ed.snap=JSON.stringify(readForm());
}
/* ---------- import from a recipe link ---------- */
function guessProtein(title, ings){
  var t=(title+" \n"+ings.join(" \n")).toLowerCase()
    .replace(/(chicken|beef|vegetable|fish|bone)[ -]?(broth|stock|bouillon|base)/g," ").replace(/fish sauce|oyster sauce/g," ");
  var rules=[["Shrimp",/shrimp|prawn/],["Fish",/salmon|\bcod\b|tilapia|halibut|tuna|\bfish\b|trout|haddock|mahi|snapper|sea bass/],
    ["Ground beef",/ground beef|minced beef|beef mince/],["Beef",/steak|\bbeef\b|brisket|chuck|sirloin|short rib/],
    ["Sausage",/sausage|chorizo|kielbasa|bratwurst|andouille/],["Pork",/\bpork\b|bacon|\bham\b|prosciutto|pancetta|carnitas/],
    ["Chicken",/chicken/],["Tofu",/tofu|tempeh/]];
  var out=rules.filter(function(r){ return r[1].test(t); }).map(function(r){ return r[0]; });
  if(out.indexOf("Ground beef")>-1 && !/steak|brisket|chuck|sirloin|short rib/.test(t)) out=out.filter(function(x){ return x!=="Beef"; });
  return out.length ? out.slice(0,2) : ["Vegetarian"];
}
function guessMeals(cats, title){
  var t=(cats.join(" ")+" "+title).toLowerCase(), out=[];
  [["Breakfast",/breakfast/],["Brunch",/brunch/],["Lunch",/lunch/],["Dinner",/dinner|main|entr[eé]e|supper/],["Side",/side/],
   ["Snack",/snack|appetizer|starter/],["Condiment",/sauce|condiment|dressing|\bdip\b|spice|seasoning/],["Dessert",/dessert|baking|cookie|cake/]]
   .forEach(function(r){ if(r[1].test(t)) out.push(r[0]); });
  return out.length ? out : ["Dinner"];
}
function importLink(){
  var box=document.getElementById("ed-import"), url=(box&&box.value||"").trim();
  if(!url){ toast("Paste a recipe link first."); if(box) box.focus(); return; }
  if(!isOnline()){ toast(OFFLINE_MSG); return; }
  var btn=document.querySelector('[data-act="import"]'); btn.disabled=true; btn.textContent="Importing…";
  var reset=function(){ if(btn.isConnected){ btn.disabled=false; btn.textContent="Import"; } };
  api("import",{url:url}).then(function(res){
    reset();
    if(!res.ok){
      var msg={import_no_recipe:"Couldn't find a recipe on that page. You can still fill it in yourself.",
               import_blocked:"That site blocks imports, so this one needs to be filled in by hand.",
               import_fetch_failed:"Couldn't open that link. Check it and try again."}[res.error];
      if(msg){ toast(msg,6000); return; }
      throw res;
    }
    if(!ed) return;
    var x=res.recipe, cur=readForm(), time=x.timeMin||0;
    var protein=guessProtein(x.title, x.ingredients);
    var draft=blankRecipe();
    draft.title=x.title||cur.title; draft.hue=ed.hue; draft.photo=ed.photo;
    draft.protein=protein; draft.meals=x.servings>=4?2:1;
    draft.emoji=guessEmoji(draft.title, protein);
    draft.source={name:x.sourceName||"", url:x.sourceUrl||url};
    draft.timeMin=time;
    draft.tags={meal:guessMeals(x.category||[], draft.title), main:[], cuisine:x.cuisine||"", effort:"", diet:[]};
    draft.ingredients=[{group:null, items:x.ingredients||[]}];
    draft.steps=x.steps||[];
    openEditor(null, draft);
    ed.snap="";   /* so closing without saving still asks first */
    var found=[x.ingredients&&x.ingredients.length?"ingredients":"", x.steps&&x.steps.length?"directions":""].filter(Boolean);
    toast(found.length===2?"Imported. Double-check protein and One-fer or Two-fer, then save.":"Imported what it could. Some parts were missing, so fill in the rest.",6000);
  }).catch(function(e){ reset(); problem(e,"Couldn't import that link."); });
}

function closeEditor(){
  $("#editor").hidden=true; $("#editor").innerHTML=""; ed=null;
  document.documentElement.classList.toggle("noscroll", !!route.id || !$("#gate").hidden);
}
function saveEditor(){
  var r=readForm();
  if(!r.title){ toast("Give the recipe a name."); document.getElementById("ed-title").focus(); return; }
  if(!r.protein.length){ toast("Pick a protein, or Vegetarian."); return; }
  if(!isOnline()){ toast("You're offline. Your changes are still here, save once you're connected.",5000); return; }
  var isNew=!r.id; if(isNew) r.id=uniqueId(r.title);
  if(isNew && ed) ed.id=null;
  var orig=byId[r.id];
  r.planned = isNew ? false : !!(orig && orig.planned);
  var base = isNew ? "" : ((orig && orig.updatedAt) || "");
  var step=Promise.resolve();
  if(r.photo && r.photo.indexOf("data:")===0){
    setBusy(true,"Uploading photo…");
    step=uploadPhoto(r.id, r.photo).then(function(name){ r.photo=name; if(ed) ed.photo=name; });
  }
  step.then(function(){ setBusy(true,"Saving…"); return sendSave(r, base, isNew); })
      .catch(function(e){ setBusy(false); problem(e,"Couldn't save. Try again."); });
}
function sendSave(r, base, isNew){
  return api("save",{recipe:r, baseUpdatedAt:base}).then(function(res){
    if(res.ok){
      upsert(res.recipe); closeEditor(); refreshViews();
      if(isNew) nav(res.recipe.id);
      toast(isNew?"Recipe added.":"Saved.");
      return;
    }
    if(res.error==="conflict" && res.current){
      setBusy(false);
      var name=res.current.updatedBy||"Someone";
      if(confirm(name+" just changed this recipe.\n\nOK loads their version (your edits here will be lost).\nCancel keeps yours and saves over theirs.")){
        upsert(res.current); closeEditor(); refreshViews(); toast("Loaded the latest version.");
        return;
      }
      setBusy(true,"Saving…");
      return sendSave(r, res.current.updatedAt, isNew);
    }
    throw res;
  });
}
function deleteEditor(btn){
  if(!btn.dataset.armed){
    btn.dataset.armed="1"; btn.textContent="Tap again to delete";
    setTimeout(function(){ if(btn.isConnected && btn.dataset.armed){ delete btn.dataset.armed; btn.textContent="Delete"; } },3500); return;
  }
  if(!isOnline()){ toast(OFFLINE_MSG); return; }
  var id=ed.id, orig=byId[id];
  setBusy(true); btn.textContent="Deleting…";
  sendDelete(id, (orig&&orig.updatedAt)||"");
}
function sendDelete(id, base){
  api("delete",{id:id, baseUpdatedAt:base}).then(function(res){
    if(res.ok){ removeLocal(id); closeEditor(); renderQuick(); renderList(); up(); toast("Recipe deleted."); return; }
    if(res.error==="conflict" && res.current){
      if(confirm((res.current.updatedBy||"Someone")+" just changed this recipe. Delete it anyway?")){ sendDelete(id, res.current.updatedAt); return; }
      upsert(res.current); closeEditor(); refreshViews(); return;
    }
    throw res;
  }).catch(function(e){ setBusy(false); problem(e,"Couldn't delete. Try again."); });
}
function processPhoto(file){
  return new Promise(function(res,rej){
    var fr=new FileReader(); fr.onerror=rej;
    fr.onload=function(){
      var img=new Image(); img.onerror=rej;
      img.onload=function(){
        var s=Math.min(1,1000/Math.max(img.naturalWidth,img.naturalHeight)), c=document.createElement("canvas");
        c.width=Math.round(img.naturalWidth*s); c.height=Math.round(img.naturalHeight*s);
        c.getContext("2d").drawImage(img,0,0,c.width,c.height);
        var webp=c.toDataURL("image/webp",0.85);
        res(webp.indexOf("data:image/webp")===0 ? webp : c.toDataURL("image/jpeg",0.78));
      };
      img.src=fr.result;
    };
    fr.readAsDataURL(file);
  });
}

/* ---------- events ---------- */
document.addEventListener("click",function(e){
  var t=e.target;
  if(t.id==="filterScrim"||t.id==="pickScrim"){ closeSheets(); return; }
  var b=t.closest("[data-act],[data-open],[data-g],[data-qf],[data-rm],[data-edp],[data-edm],[data-edn],[data-toggleplan],[data-view]");
  if(!b) return;
  if(b.dataset.view){ view=b.dataset.view; renderList(); window.scrollTo(0,0); return; }
  if(b.dataset.open){ closeSheets(); nav(b.dataset.open); return; }
  if(b.dataset.qf){ openFilters(b.dataset.qf); return; }
  if(b.dataset.toggleplan){
    if(!canEdit){ toast(pass?OFFLINE_MSG:"Enter the passcode to change the meal plan."); return; }
    togglePlanned(b.dataset.toggleplan);
    return;
  }
  if(b.dataset.g){
    var k=b.dataset.g, v=b.dataset.v;
    if(sel[k][v]) delete sel[k][v]; else sel[k][v]=true;
    syncPressed(); renderList(); updateDone(); return;
  }
  if(b.dataset.rm){ delete sel[b.dataset.rm][b.dataset.v]; renderList(); return; }
  if(b.dataset.edp){
    var p=b.dataset.edp, i=ed.protein.indexOf(p);
    if(i>-1) ed.protein.splice(i,1);
    else { if(p==="Vegetarian") ed.protein=[]; else ed.protein=ed.protein.filter(function(x){ return x!=="Vegetarian"; }); ed.protein.push(p); }
    $("#edProtein").innerHTML=proteinChipsHTML(); autoEmoji(); return;
  }
  if(b.dataset.edm){
    var m=b.dataset.edm, j=ed.meal.indexOf(m); if(j>-1) ed.meal.splice(j,1); else ed.meal.push(m);
    b.setAttribute("aria-pressed", j<0); return;
  }
  if(b.dataset.edn){ ed.meals=+b.dataset.edn; $("#edMeals").innerHTML=mealsChipsHTML(); return; }
  switch(b.dataset.act){
    case "filters": openFilters(null); break;
    case "cleargroup": if(sheetKey) clearGroup(sheetKey); break;
    case "closefilters": $("#filterScrim").hidden=true; break;
    case "clearall": clearAll(); break;
    case "clearplan": clearPlan(); break;
    case "clearpick": clearAll(); showPick(); break;
    case "surprise": showPick(); break;
    case "closepick": closeSheets(); break;
    case "up": up(); break;
    case "add": if(canEdit) openEditor(null); break;
    case "edit": if(canEdit) openEditor(b.dataset.id); break;
    case "cancel":
      if(ed && JSON.stringify(readForm())!==ed.snap && !ed.armed){ ed.armed=true; toast("You have unsaved changes. Tap the X again to discard them."); setTimeout(function(){ if(ed) ed.armed=false; },4000); }
      else closeEditor();
      break;
    case "saveed": saveEditor(); break;
    case "unlock": unlock(); break;
    case "wake": toggleWake(b); break;
    case "import": importLink(); break;
    case "deleteed": deleteEditor(b); break;
    case "photo": document.getElementById("ed-photo").click(); break;
    case "rmphoto": ed.photo=null; $("#edPhotoRow").innerHTML=photoRowHTML(); break;
    case "addother": {
      var inp=document.getElementById("ed-otherp"), val=inp.value.trim();
      if(val){ if(ed.protein.indexOf(val)<0){ ed.protein=ed.protein.filter(function(x){ return x!=="Vegetarian"; }); ed.protein.push(val); } inp.value=""; $("#edProtein").innerHTML=proteinChipsHTML(); autoEmoji(); }
      break;
    }
  }
});
function autoEmoji(){
  if(!ed||ed.emojiTouched) return;
  var e=document.getElementById("ed-emoji"); if(!e) return;
  e.value=guessEmoji(document.getElementById("ed-title").value, ed.protein);
  $("#edPhotoRow").innerHTML=photoRowHTML();
}
document.addEventListener("input",function(e){
  var id=e.target.id;
  if(id==="q"){ query=e.target.value; renderList(); return; }
  if(!ed) return;
  if(id==="ed-title") autoEmoji();
  if(id==="ed-emoji"){ ed.emojiTouched=true; $("#edPhotoRow").innerHTML=photoRowHTML(); }
});
document.addEventListener("change",function(e){
  if(e.target.id!=="ed-photo"||!ed) return;
  var f=e.target.files&&e.target.files[0]; if(!f) return;
  processPhoto(f).then(function(url){ ed.photo=url; $("#edPhotoRow").innerHTML=photoRowHTML(); }, function(){ toast("Couldn't read that photo. Try a different one."); });
  e.target.value="";
});
document.addEventListener("keydown",function(e){
  if(e.key==="Enter" && e.target.id==="g-pass"){ e.preventDefault(); var gw=document.getElementById("g-who"); if(gw) gw.focus(); return; }
  if(e.key==="Enter" && e.target.id==="g-who"){ e.preventDefault(); unlock(); return; }
  if(e.key==="Enter" && e.target.id==="ed-import"){ e.preventDefault(); importLink(); return; }
  if(e.key==="Enter" && e.target.id==="ed-otherp"){ e.preventDefault(); var b=document.querySelector('[data-act="addother"]'); b&&b.click(); return; }
  if(e.key!=="Escape") return;
  if(!$("#gate").hidden) return;
  if(!$("#filterScrim").hidden||!$("#pickScrim").hidden){ closeSheets(); return; }
  if(ed){ var c=document.querySelector('[data-act="cancel"]'); c&&c.click(); return; }
  if(route.id) up();
});

/* ---------- start ---------- */
(function(){ try{ var c=JSON.parse(lsGet(K.cache)||"null"); if(c && c.recipes && c.recipes.length){ setRecipes(c.recipes); loaded=true; } }catch(e){} })();
canEdit=!!pass && isOnline();
renderQuick(); renderList();
apply(parseHash());
if(!pass) showGate(); else refresh(true);

window.addEventListener("online", function(){ updateCanEdit(); refresh(true); });
window.addEventListener("offline", function(){ updateCanEdit(); toast("You're offline. You can still browse, editing is paused.",5000); });
document.addEventListener("visibilitychange", function(){ syncWake(); if(document.visibilityState==="visible"){ updateCanEdit(); refresh(false); } });

if("serviceWorker" in navigator){
  window.addEventListener("load", function(){ navigator.serviceWorker.register("sw.js").catch(function(){}); });
}
})();
