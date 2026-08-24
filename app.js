(function(){
  "use strict";

  var PALETTE = ["#e8b84b","#b98be0","#5fd1c9","#e8849b","#7fb0e8","#e8a75f","#8fd17a","#d68fe0","#6fcf9e","#e0c56f"];
  var REL_TYPES = ["사제","영향","교류"];
  var LANE_H = 110;
  var PX_PER_YEAR = 2.4;
  var MARGIN_L = 90, MARGIN_R = 90, MARGIN_TOP = 60, MARGIN_BOTTOM = 40;
  var MIN_GAP = 46;

  var LS_KEY = "seongjwa.state.v1";

  function uid(prefix){ return prefix+"_"+Date.now().toString(36)+Math.random().toString(36).slice(2,7); }

  function defaultState(){
    return {
      categories:[
        {id:"phil", name:"철학", color:PALETTE[0]},
        {id:"music", name:"음악", color:PALETTE[1]},
        {id:"history", name:"역사", color:PALETTE[2]},
        {id:"lit", name:"문학", color:PALETTE[3]}
      ],
      people:[],
      relationships:[]
    };
  }

  var STATE = loadLocal() || defaultState();
  var activeCatIds = null; // null = all on
  var currentId = null;

  function loadLocal(){
    try{
      var raw = localStorage.getItem(LS_KEY);
      if(!raw) return null;
      var s = JSON.parse(raw);
      if(!s || !s.categories || !s.people || !s.relationships) return null;
      return s;
    }catch(e){ return null; }
  }
  function persistLocal(){
    try{ localStorage.setItem(LS_KEY, JSON.stringify(STATE)); }catch(e){}
  }
  function notifyCloud(){ if(window.SEONGJWA && window.SEONGJWA.onSave) window.SEONGJWA.onSave(); }
  function commit(){ persistLocal(); renderAll(); notifyCloud(); }

  function byId(arr,id){ for(var i=0;i<arr.length;i++) if(arr[i].id===id) return arr[i]; return null; }
  function catOf(id){ return byId(STATE.categories,id); }
  function personOf(id){ return byId(STATE.people,id); }

  // ---------------- category ----------------
  function ensureCategory(name){
    name = (name||"").trim();
    if(!name) return null;
    var found = null;
    STATE.categories.forEach(function(c){ if(c.name===name) found=c; });
    if(found) return found;
    var c = {id:uid("cat"), name:name, color:PALETTE[STATE.categories.length % PALETTE.length]};
    STATE.categories.push(c);
    return c;
  }

  // ---------------- layout ----------------
  function computeLayout(){
    var lanes = {};
    STATE.categories.forEach(function(c,i){ lanes[c.id]=i; });
    var years = STATE.people.map(function(p){ return p.sortYear; });
    var minY = years.length ? Math.min.apply(null,years) : 1900;
    var maxY = years.length ? Math.max.apply(null,years) : 2026;
    if(minY===maxY){ minY-=10; maxY+=10; }
    var span = maxY-minY;

    var pos = {};
    STATE.people.forEach(function(p){
      var lane = lanes[p.catId]!==undefined ? lanes[p.catId] : 0;
      var x = MARGIN_L + (p.sortYear-minY)*PX_PER_YEAR;
      var y = MARGIN_TOP + lane*LANE_H + LANE_H/2;
      pos[p.id] = {x:x,y:y,lane:lane};
    });

    // collision nudge per lane, sorted by x
    var byLane = {};
    STATE.people.forEach(function(p){
      var l = pos[p.id].lane;
      (byLane[l]=byLane[l]||[]).push(p.id);
    });
    Object.keys(byLane).forEach(function(l){
      var ids = byLane[l].slice().sort(function(a,b){ return pos[a].x-pos[b].x; });
      for(var i=1;i<ids.length;i++){
        var prev=pos[ids[i-1]], cur=pos[ids[i]];
        if(cur.x - prev.x < MIN_GAP) cur.x = prev.x + MIN_GAP;
      }
    });

    var width = MARGIN_L + span*PX_PER_YEAR + MARGIN_R;
    STATE.people.forEach(function(p){ if(pos[p.id].x+MARGIN_R > width) width = pos[p.id].x+MARGIN_R; });
    var height = MARGIN_TOP + Math.max(STATE.categories.length,1)*LANE_H + MARGIN_BOTTOM;

    return {pos:pos, minY:minY, maxY:maxY, width:Math.max(width,900), height:height, lanes:lanes};
  }

  function fmtYear(y){
    y = Math.round(y);
    return y<0 ? ("BC "+(-y)) : (""+y);
  }

  // ---------------- svg render ----------------
  var svgNS = "http://www.w3.org/2000/svg";
  function el(tag,attrs){
    var e=document.createElementNS(svgNS,tag);
    for(var k in attrs) e.setAttribute(k,attrs[k]);
    return e;
  }

  var stage, laneCol, emptyHint;
  var nodeEls={}, edgeEls=[];

  function renderAll(){
    renderLegend();
    renderStage();
    renderPanel(currentId);
  }

  function renderLegend(){
    var legend = document.getElementById("legend");
    legend.innerHTML="";
    STATE.categories.forEach(function(c){
      var on = !activeCatIds || activeCatIds.indexOf(c.id)>-1;
      var b=document.createElement("button");
      b.className="chip"+(on?"":" off");
      b.setAttribute("aria-pressed", on?"true":"false");
      b.innerHTML='<span class="dot" style="background:'+c.color+'"></span>'+escapeHtml(c.name);
      b.addEventListener("click",function(id){ return function(){
        if(!activeCatIds) activeCatIds = STATE.categories.map(function(c){return c.id;});
        var idx = activeCatIds.indexOf(id);
        if(idx>-1) activeCatIds.splice(idx,1); else activeCatIds.push(id);
        renderLegend(); applyFilter();
      };}(c.id));
      legend.appendChild(b);
    });
  }

  function applyFilter(){
    var active = activeCatIds || STATE.categories.map(function(c){return c.id;});
    STATE.people.forEach(function(p){
      var visible = active.indexOf(p.catId)>-1;
      var g = nodeEls[p.id];
      if(!g) return;
      g.querySelectorAll("circle.core, text").forEach(function(n){ n.style.opacity = visible?"":"0.12"; });
    });
    edgeEls.forEach(function(line){
      var pa=personOf(line.dataset.a), pb=personOf(line.dataset.b);
      var visible = pa && pb && active.indexOf(pa.catId)>-1 && active.indexOf(pb.catId)>-1;
      line.style.opacity = visible?"":"0.05";
    });
  }

  function renderStage(){
    var layout = computeLayout();
    stage.setAttribute("viewBox","0 0 "+layout.width+" "+layout.height);
    stage.style.minWidth = layout.width+"px";
    stage.innerHTML="";
    nodeEls={}; edgeEls=[];

    emptyHint.style.display = STATE.people.length ? "none" : "flex";

    // lane label column
    laneCol.style.height = layout.height+"px";
    laneCol.innerHTML="";
    STATE.categories.forEach(function(c,i){
      var d=document.createElement("div");
      d.className="lane-label";
      d.style.top=(MARGIN_TOP+i*LANE_H+LANE_H/2-11)+"px";
      d.innerHTML='<span class="dot" style="background:'+c.color+'"></span>'+escapeHtml(c.name);
      laneCol.appendChild(d);
    });

    // bg stars
    var bg=el("g",{"aria-hidden":"true"});
    var starCount = Math.max(60, Math.round(layout.width/16));
    for(var i=0;i<starCount;i++){
      var sx=Math.random()*layout.width, sy=Math.random()*layout.height, sr=Math.random()*1.1+0.3;
      bg.appendChild(el("circle",{class:"bg-star",cx:sx,cy:sy,r:sr,opacity:(Math.random()*0.5+0.12).toFixed(2)}));
    }
    stage.appendChild(bg);

    // century gridlines
    var gl=el("g",{"aria-hidden":"true"});
    var startCent = Math.floor(layout.minY/100)*100;
    for(var yr=startCent; yr<=layout.maxY+100; yr+=100){
      var x = MARGIN_L + (yr-layout.minY)*PX_PER_YEAR;
      if(x<MARGIN_L-5 || x>layout.width-10) continue;
      gl.appendChild(el("line",{x1:x,y1:MARGIN_TOP-24,x2:x,y2:layout.height-MARGIN_BOTTOM+6,class:"grid-line"}));
      var t=el("text",{x:x,y:MARGIN_TOP-30,class:"grid-label","text-anchor":"middle"});
      t.textContent = fmtYear(yr);
      gl.appendChild(t);
    }
    stage.appendChild(gl);

    var defs=el("defs",{});
    var marker=el("marker",{id:"arrow",viewBox:"0 0 10 10",refX:"8",refY:"5",markerWidth:"7",markerHeight:"7",orient:"auto-start-reverse"});
    marker.appendChild(el("path",{d:"M0,0 L10,5 L0,10 z",fill:"var(--line-mid)"}));
    defs.appendChild(marker);
    var glow=el("filter",{id:"starglow",x:"-60%",y:"-60%",width:"220%",height:"220%"});
    glow.innerHTML='<feGaussianBlur stdDeviation="3.2" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge>';
    defs.appendChild(glow);
    stage.appendChild(defs);

    // edges
    var edgeLayer=el("g");
    STATE.relationships.forEach(function(r){
      var pa=personOf(r.a), pb=personOf(r.b);
      if(!pa||!pb) return;
      var posA=layout.pos[pa.id], posB=layout.pos[pb.id];
      var dash = r.type==="영향" ? "5 4" : (r.type==="교류" ? "1 3.4" : null);
      var attrs={class:"edge", x1:posA.x, y1:posA.y, x2:posB.x, y2:posB.y, "stroke-linecap":"round"};
      if(dash) attrs["stroke-dasharray"]=dash;
      if(r.type!=="교류") attrs["marker-end"]="url(#arrow)";
      var line=el("line",attrs);
      line.dataset.a=pa.id; line.dataset.b=pb.id; line.dataset.rid=r.id;
      edgeLayer.appendChild(line);
      edgeEls.push(line);
    });
    stage.appendChild(edgeLayer);

    // nodes
    var nodeLayer=el("g");
    STATE.people.forEach(function(p){
      var c = catOf(p.catId);
      var color = c? c.color : "#9ba1c4";
      var pos = layout.pos[p.id];
      var g=el("g",{class:"node", tabindex:"0", role:"button", "aria-label":p.name+", "+(p.years||fmtYear(p.sortYear))+(c?(", "+c.name):""), "data-id":p.id});
      g.appendChild(el("circle",{class:"ring", cx:pos.x, cy:pos.y, r:11, fill:"none", stroke:"transparent"}));
      g.appendChild(el("circle",{class:"core", cx:pos.x, cy:pos.y, r:5.5, fill:color, filter:"url(#starglow)"}));
      var name=el("text",{x:pos.x, y:pos.y-14, "text-anchor":"middle"});
      name.textContent = p.name;
      g.appendChild(name);
      var yrs=el("text",{class:"years", x:pos.x, y:pos.y+22, "text-anchor":"middle"});
      yrs.textContent = p.years || fmtYear(p.sortYear);
      g.appendChild(yrs);
      g.addEventListener("click", function(id){ return function(e){ e.stopPropagation(); selectNode(id); }; }(p.id));
      g.addEventListener("keydown", function(id){ return function(e){ if(e.key==="Enter"||e.key===" "){ e.preventDefault(); selectNode(id);} }; }(p.id));
      nodeLayer.appendChild(g);
      nodeEls[p.id]=g;
    });
    stage.appendChild(nodeLayer);

    applyFilter();
    if(currentId) highlightSelection(currentId);
  }

  function highlightSelection(id){
    stage.classList.add("selected-fade");
    var relatedIds={}; relatedIds[id]=true;
    edgeEls.forEach(function(l){
      var match = l.dataset.a===id || l.dataset.b===id;
      l.classList.toggle("active-edge", match);
      if(match){ relatedIds[l.dataset.a]=true; relatedIds[l.dataset.b]=true; }
    });
    Object.keys(nodeEls).forEach(function(nid){
      nodeEls[nid].classList.toggle("active-node", !!relatedIds[nid]);
    });
  }

  function clearSelection(){
    currentId=null;
    stage.classList.remove("selected-fade");
    Object.keys(nodeEls).forEach(function(nid){ nodeEls[nid].classList.remove("active-node"); });
    edgeEls.forEach(function(l){ l.classList.remove("active-edge"); });
    var panel=document.getElementById("panel");
    panel.classList.remove("open"); panel.setAttribute("aria-hidden","true");
  }

  function selectNode(id){
    currentId=id;
    highlightSelection(id);
    renderPanel(id);
    var panel=document.getElementById("panel");
    panel.classList.add("open"); panel.setAttribute("aria-hidden","false");
    scrollNodeIntoView(id);
  }

  function scrollNodeIntoView(id){
    var layout = computeLayout();
    var pos = layout.pos[id];
    if(!pos) return;
    var wrap = document.getElementById("stageScroll");
    var target = pos.x - wrap.clientWidth/2;
    wrap.scrollTo({left:Math.max(0,target), behavior:"smooth"});
  }

  function escapeHtml(s){
    return (s||"").replace(/[&<>"']/g,function(c){ return {"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]; });
  }

  // ---------------- detail panel ----------------
  function renderPanel(id){
    var body=document.getElementById("panelBody");
    if(!id){ body.innerHTML=""; return; }
    var p=personOf(id);
    if(!p){ clearSelection(); return; }
    var c=catOf(p.catId);
    var color=c?c.color:"#9ba1c4";
    var relLines = STATE.relationships.filter(function(r){ return r.a===id || r.b===id; });

    var html="";
    html+='<button class="panel-close" id="panelClose" aria-label="닫기">✕</button>';
    html+='<span class="badge"><span class="dot" style="background:'+color+'"></span>'+escapeHtml(c?c.name:"")+'</span>';
    html+='<div class="panel-actions"><button class="mini-btn" id="editPersonBtn">수정</button><button class="mini-btn danger" id="deletePersonBtn">삭제</button></div>';
    html+='<h2>'+escapeHtml(p.name)+'</h2>';
    html+='<div class="years">'+escapeHtml(p.years||fmtYear(p.sortYear))+'</div>';
    html+='<p class="bio">'+escapeHtml(p.bio||"")+'</p>';

    html+='<h3>관계 · '+relLines.length+'</h3>';
    html+='<ul class="rel-list">';
    relLines.forEach(function(r){
      var otherId = r.a===id ? r.b : r.a;
      var other = personOf(otherId);
      if(!other) return;
      var oc = catOf(other.catId);
      html+='<li class="rel-item" data-jump="'+other.id+'">'+
        '<span class="dot" style="background:'+(oc?oc.color:"#9ba1c4")+'"></span>'+
        '<span class="rel-name">'+escapeHtml(other.name)+'</span>'+
        '<span class="rel-type">'+escapeHtml(r.type)+'</span>'+
        '<button class="rel-del" data-rid="'+r.id+'" aria-label="관계 삭제">✕</button>'+
      '</li>';
    });
    html+='</ul>';
    if(!relLines.length) html+='<div class="note-empty">아직 연결된 관계가 없습니다.</div>';

    var otherPeople = STATE.people.filter(function(x){ return x.id!==id; });
    html+='<div class="rel-add">';
    html+='<select id="relTarget">'+ (otherPeople.length? otherPeople.map(function(x){ return '<option value="'+x.id+'">'+escapeHtml(x.name)+'</option>'; }).join("") : '<option value="">추가할 인물이 없습니다</option>') +'</select>';
    html+='<select id="relType">'+REL_TYPES.map(function(t){ return '<option value="'+t+'">'+t+'</option>'; }).join("")+'</select>';
    html+='<button class="mini-btn" id="relAddBtn"'+(otherPeople.length?"":" disabled")+'>+ 연결</button>';
    html+='</div>';

    html+='<h3>나의 노트</h3>';
    html+='<div class="notes">';
    (p.notes||[]).slice().reverse().forEach(function(n){
      html+='<div class="note-card"><div class="note-date">'+escapeHtml(n.date)+'<button class="note-del" data-nid="'+n.id+'" aria-label="노트 삭제">✕</button></div><div class="note-text">'+escapeHtml(n.text)+'</div></div>';
    });
    html+='</div>';
    if(!(p.notes&&p.notes.length)) html+='<div class="note-empty">아직 기록한 노트가 없습니다.</div>';

    html+='<div class="note-add">';
    html+='<textarea id="noteText" rows="2" placeholder="오늘 배운 점, 느낀 점을 적어보세요"></textarea>';
    html+='<button class="mini-btn primary" id="noteAddBtn">+ 노트 추가</button>';
    html+='</div>';

    body.innerHTML=html;

    document.getElementById("panelClose").addEventListener("click",function(e){ e.stopPropagation(); clearSelection(); });
    document.getElementById("editPersonBtn").addEventListener("click",function(){ openPersonModal(p.id); });
    document.getElementById("deletePersonBtn").addEventListener("click",function(){
      if(!confirm(p.name+"을(를) 삭제할까요? 연결된 관계도 함께 삭제됩니다.")) return;
      STATE.people = STATE.people.filter(function(x){ return x.id!==p.id; });
      STATE.relationships = STATE.relationships.filter(function(r){ return r.a!==p.id && r.b!==p.id; });
      clearSelection();
      commit();
    });
    body.querySelectorAll(".rel-item").forEach(function(item){
      item.addEventListener("click",function(e){
        if(e.target.closest(".rel-del")) return;
        selectNode(item.getAttribute("data-jump"));
      });
    });
    body.querySelectorAll(".rel-del").forEach(function(btn){
      btn.addEventListener("click",function(e){
        e.stopPropagation();
        var rid=btn.getAttribute("data-rid");
        STATE.relationships = STATE.relationships.filter(function(r){ return r.id!==rid; });
        commit();
      });
    });
    var relAddBtn=document.getElementById("relAddBtn");
    if(relAddBtn) relAddBtn.addEventListener("click",function(){
      var target=document.getElementById("relTarget").value;
      var type=document.getElementById("relType").value;
      if(!target) return;
      var exists = STATE.relationships.some(function(r){ return (r.a===id&&r.b===target)||(r.a===target&&r.b===id); });
      if(exists){ alert("이미 연결된 관계가 있어요."); return; }
      STATE.relationships.push({id:uid("rel"), a:id, b:target, type:type});
      commit();
    });
    body.querySelectorAll(".note-del").forEach(function(btn){
      btn.addEventListener("click",function(e){
        e.stopPropagation();
        var nid=btn.getAttribute("data-nid");
        p.notes = (p.notes||[]).filter(function(n){ return n.id!==nid; });
        commit();
      });
    });
    var noteAddBtn=document.getElementById("noteAddBtn");
    if(noteAddBtn) noteAddBtn.addEventListener("click",function(){
      var txt=document.getElementById("noteText").value.trim();
      if(!txt) return;
      var d=new Date();
      var dateStr=d.getFullYear()+"."+String(d.getMonth()+1).padStart(2,"0")+"."+String(d.getDate()).padStart(2,"0");
      p.notes = p.notes||[];
      p.notes.push({id:uid("note"), date:dateStr, text:txt});
      commit();
    });
  }

  // ---------------- person modal ----------------
  var editingId=null;
  function openPersonModal(id){
    editingId = id||null;
    var p = id ? personOf(id) : null;
    var modal=document.getElementById("personModal");
    document.getElementById("pmTitle").textContent = p ? "인물 수정" : "새 인물 추가";
    document.getElementById("pmName").value = p ? p.name : "";
    document.getElementById("pmYear").value = p ? p.sortYear : "";
    document.getElementById("pmYears").value = p ? (p.years||"") : "";
    document.getElementById("pmBio").value = p ? (p.bio||"") : "";
    renderCatOptions(p ? p.catId : (STATE.categories[0]&&STATE.categories[0].id));
    document.getElementById("pmNewCat").value="";
    document.getElementById("pmNewCat").style.display="none";
    modal.classList.add("open");
    modal.setAttribute("aria-hidden","false");
    document.getElementById("pmName").focus();
  }
  function renderCatOptions(selectedId){
    var sel=document.getElementById("pmCat");
    sel.innerHTML = STATE.categories.map(function(c){ return '<option value="'+c.id+'"'+(c.id===selectedId?" selected":"")+'>'+escapeHtml(c.name)+'</option>'; }).join("") + '<option value="__new__">+ 새 분야 추가</option>';
  }
  function closePersonModal(){
    var modal=document.getElementById("personModal");
    modal.classList.remove("open");
    modal.setAttribute("aria-hidden","true");
    editingId=null;
  }

  function initModal(){
    document.getElementById("pmCat").addEventListener("change",function(){
      var newField=document.getElementById("pmNewCat");
      if(this.value==="__new__"){ newField.style.display="block"; newField.focus(); }
      else newField.style.display="none";
    });
    document.getElementById("pmCancel").addEventListener("click", closePersonModal);
    document.getElementById("personModal").addEventListener("click", function(e){ if(e.target===this) closePersonModal(); });
    document.getElementById("addPersonBtn").addEventListener("click", function(){ openPersonModal(null); });
    document.getElementById("pmForm").addEventListener("submit", function(e){
      e.preventDefault();
      var name=document.getElementById("pmName").value.trim();
      var yearRaw=document.getElementById("pmYear").value;
      var years=document.getElementById("pmYears").value.trim();
      var bio=document.getElementById("pmBio").value.trim();
      var catSel=document.getElementById("pmCat").value;
      if(!name || yearRaw===""){ alert("이름과 정렬 연도는 필수예요."); return; }
      var catId = catSel;
      if(catSel==="__new__"){
        var newName=document.getElementById("pmNewCat").value.trim();
        if(!newName){ alert("새 분야 이름을 입력해주세요."); return; }
        catId = ensureCategory(newName).id;
      }
      var sortYear = parseInt(yearRaw,10);
      if(editingId){
        var p=personOf(editingId);
        p.name=name; p.sortYear=sortYear; p.years=years; p.bio=bio; p.catId=catId;
      } else {
        STATE.people.push({id:uid("p"), name:name, sortYear:sortYear, years:years, bio:bio, catId:catId, notes:[]});
      }
      closePersonModal();
      commit();
    });
  }

  // ---------------- theme ----------------
  function initTheme(){
    var btn=document.getElementById("themeToggle");
    function sync(){
      var isLight = document.documentElement.getAttribute("data-theme")==="light";
      btn.textContent = isLight ? "☀" : "🌙";
      btn.setAttribute("aria-label", isLight ? "다크 모드로 전환" : "라이트 모드로 전환");
    }
    sync();
    btn.addEventListener("click", function(){
      var isLight = document.documentElement.getAttribute("data-theme")==="light";
      if(isLight){ document.documentElement.removeAttribute("data-theme"); try{ localStorage.setItem("seongjwa.theme","dark"); }catch(e){} }
      else{ document.documentElement.setAttribute("data-theme","light"); try{ localStorage.setItem("seongjwa.theme","light"); }catch(e){} }
      sync();
    });
  }

  // ---------------- search ----------------
  function initSearch(){
    var input=document.getElementById("searchInput");
    input.addEventListener("keydown", function(e){
      if(e.key!=="Enter") return;
      var q=input.value.trim().toLowerCase();
      if(!q) return;
      var match = STATE.people.find(function(p){ return p.name.toLowerCase().indexOf(q)>-1; });
      if(match) selectNode(match.id);
    });
  }

  // ---------------- boot ----------------
  document.addEventListener("DOMContentLoaded", function(){
    stage=document.getElementById("stage");
    laneCol=document.getElementById("laneCol");
    emptyHint=document.getElementById("emptyHint");

    stage.addEventListener("click", function(){ clearSelection(); });
    document.getElementById("emptyAddBtn").addEventListener("click", function(){ openPersonModal(null); });

    initModal();
    initSearch();
    initTheme();
    renderAll();
  });

  window.SEONGJWA = {
    get: function(){ return STATE; },
    replace: function(newState){
      STATE = newState;
      activeCatIds = null;
      clearSelectionSilent();
      persistLocal();
      renderAll();
    },
    onSave: null
  };
  function clearSelectionSilent(){
    currentId=null;
    if(stage) stage.classList.remove("selected-fade");
  }
})();
