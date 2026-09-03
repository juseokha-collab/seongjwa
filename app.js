(function(){
  "use strict";

  var PALETTE = ["#e8b84b","#b98be0","#5fd1c9","#e8849b","#7fb0e8","#e8a75f","#8fd17a","#d68fe0","#6fcf9e","#e0c56f"];
  var SUBROW_H = 46;
  var LANE_PAD = 22;
  var PX_PER_YEAR = 2.4;
  var MARGIN_L = 90, MARGIN_R = 90, MARGIN_TOP = 60, MARGIN_BOTTOM = 40;
  var LABEL_PAD = 14;
  var YEAR_ROW_H = 34;
  var NODE_LABEL_FONT = "Consolas,'JetBrains Mono',monospace";
  var measureCtx = document.createElement("canvas").getContext("2d");
  function labelHalfWidth(p){
    measureCtx.font = "700 12px "+NODE_LABEL_FONT;
    var nameW = measureCtx.measureText(p.name).width;
    measureCtx.font = "9px "+NODE_LABEL_FONT;
    var yearW = measureCtx.measureText(yearsLabel(p)).width;
    return Math.max(nameW, yearW)/2;
  }

  var LS_KEY = "seongjwa.state.v1";

  function uid(prefix){ return prefix+"_"+Date.now().toString(36)+Math.random().toString(36).slice(2,7); }

  function defaultState(){
    return {
      categories:[
        {id:"phil", name:"철학", color:PALETTE[0], subs:[]},
        {id:"music", name:"음악", color:PALETTE[1], subs:[]},
        {id:"history", name:"역사", color:PALETTE[2], subs:[]},
        {id:"lit", name:"문학", color:PALETTE[3], subs:[]}
      ],
      people:[],
      relationships:[],
      timeAnchors:{}
    };
  }

  function normalizeState(s){
    s.categories.forEach(function(c){ if(!c.subs) c.subs=[]; });
    s.people.forEach(function(p){ if(p.subId===undefined) p.subId=null; if(p.manualRow===undefined) p.manualRow=null; });
    if(!s.timeAnchors) s.timeAnchors={};
    return s;
  }

  var STATE = normalizeState(loadLocal() || defaultState());
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
    var c = {id:uid("cat"), name:name, color:PALETTE[STATE.categories.length % PALETTE.length], subs:[]};
    STATE.categories.push(c);
    return c;
  }
  function ensureSub(catId, name){
    name = (name||"").trim();
    var c = catOf(catId);
    if(!c || !name) return null;
    if(!c.subs) c.subs=[];
    var found = null;
    c.subs.forEach(function(s){ if(s.name===name) found=s; });
    if(found) return found;
    var s = {id:uid("sub"), name:name};
    c.subs.push(s);
    return s;
  }
  function findSub(catId, subId){
    var c = catOf(catId);
    if(!c || !c.subs) return null;
    var found=null;
    c.subs.forEach(function(s){ if(s.id===subId) found=s; });
    return found;
  }
  function personColor(p){
    var c = catOf(p.catId);
    var sub = p.subId ? findSub(p.catId, p.subId) : null;
    return (sub && sub.color) ? sub.color : (c ? c.color : "#9ba1c4");
  }

  // ---------------- layout ----------------
  var MIN_ANCHOR_GAP = 60;
  // The scale is defined by century marks the user can drag left/right (see #yearRow).
  // Dragging a mark left narrows the span before it (and widens the one after); dragging
  // it right does the opposite. Anything without a manual position falls back to a plain
  // linear default so the ticks start out evenly spaced.
  function buildYearToX(minY, maxY){
    var startCent = Math.floor(minY/100)*100;
    var endCent = Math.ceil(maxY/100)*100;
    if(endCent<=startCent) endCent = startCent+100;
    var centYears = [];
    for(var yr=startCent; yr<=endCent; yr+=100) centYears.push(yr);
    if(centYears.length<2) centYears.push(centYears[centYears.length-1]+100);

    var ticks = centYears.map(function(yr){
      var manual = STATE.timeAnchors[String(yr)];
      var x = (manual!=null) ? manual : (MARGIN_L + (yr-startCent)*PX_PER_YEAR);
      return {year:yr, x:x};
    });
    for(var i=1;i<ticks.length;i++){
      if(ticks[i].x <= ticks[i-1].x + MIN_ANCHOR_GAP) ticks[i].x = ticks[i-1].x + MIN_ANCHOR_GAP;
    }

    function yearToX(year){
      var first=ticks[0], last=ticks[ticks.length-1];
      if(year<=first.year) return first.x-(first.year-year)*PX_PER_YEAR;
      if(year>=last.year) return last.x+(year-last.year)*PX_PER_YEAR;
      for(var i=0;i<ticks.length-1;i++){
        if(year>=ticks[i].year && year<=ticks[i+1].year){
          var span=ticks[i+1].year-ticks[i].year;
          var t=span?(year-ticks[i].year)/span:0;
          return ticks[i].x+t*(ticks[i+1].x-ticks[i].x);
        }
      }
      return last.x;
    }
    return {yearToX:yearToX, maxX: ticks[ticks.length-1].x, ticks:ticks};
  }
  function computeLayout(){
    var active = activeCatIds || STATE.categories.map(function(c){ return c.id; });
    var activeCats = STATE.categories.filter(function(c){ return active.indexOf(c.id)>-1; });
    var activePeople = STATE.people.filter(function(p){ return active.indexOf(p.catId)>-1; });

    var years = activePeople.map(function(p){ return p.sortYear; });
    var minY = years.length ? Math.min.apply(null,years) : 1900;
    var maxY = years.length ? Math.max.apply(null,years) : 2026;
    if(minY===maxY){ minY-=10; maxY+=10; }

    var scale = buildYearToX(minY, maxY);
    var xOf = {};
    activePeople.forEach(function(p){ xOf[p.id] = scale.yearToX(p.sortYear); });

    // pack people within each category into sub-rows so close-in-time people stack vertically
    // instead of being pushed apart horizontally (which would distort the timeline)
    var subRowOf = {}, rowCountByCat = {};
    activeCats.forEach(function(c){
      var members = activePeople.filter(function(p){ return p.catId===c.id; })
        .sort(function(a,b){ return xOf[a.id]-xOf[b.id]; });
      var rowEnds = []; // {x, hw} of the last-placed label in each row (holes allowed)
      members.forEach(function(p){
        var x = xOf[p.id];
        var hw = labelHalfWidth(p);
        if(p.manualRow!=null){
          subRowOf[p.id]=p.manualRow;
          rowEnds[p.manualRow]={x:x,hw:hw};
          return;
        }
        var placed = false;
        for(var r=0;r<rowEnds.length;r++){
          if(!rowEnds[r]){ continue; }
          var need = rowEnds[r].hw + hw + LABEL_PAD;
          if(x - rowEnds[r].x >= need){ subRowOf[p.id]=r; rowEnds[r]={x:x,hw:hw}; placed=true; break; }
        }
        if(!placed){
          var newRow=rowEnds.length;
          for(var k=0;k<rowEnds.length;k++){ if(!rowEnds[k]){ newRow=k; break; } }
          subRowOf[p.id]=newRow; rowEnds[newRow]={x:x,hw:hw};
        }
      });
      rowCountByCat[c.id] = Math.max(1, rowEnds.length);
    });

    var laneTop = {};
    var cursorY = MARGIN_TOP;
    activeCats.forEach(function(c){
      laneTop[c.id] = cursorY;
      cursorY += rowCountByCat[c.id]*SUBROW_H + LANE_PAD;
    });
    var height = Math.max(cursorY - LANE_PAD + MARGIN_BOTTOM, MARGIN_TOP+SUBROW_H+MARGIN_BOTTOM);

    var pos = {};
    activePeople.forEach(function(p){
      var row = subRowOf[p.id]||0;
      pos[p.id] = {x:xOf[p.id], y:laneTop[p.catId]+row*SUBROW_H+SUBROW_H/2};
    });

    var width = scale.maxX + MARGIN_R;
    activePeople.forEach(function(p){ if(pos[p.id].x+MARGIN_R > width) width = pos[p.id].x+MARGIN_R; });
    var scrollEl = document.getElementById("stageScroll");
    var minCanvasWidth = (scrollEl && scrollEl.clientWidth) ? scrollEl.clientWidth : 900;

    return {pos:pos, minY:minY, maxY:maxY, width:Math.max(width,minCanvasWidth), height:height, activeCats:activeCats, laneTop:laneTop, rowCountByCat:rowCountByCat, yearToX:scale.yearToX, ticks:scale.ticks};
  }

  function fmtYear(y){
    y = Math.round(y);
    return y<0 ? ("BC "+(-y)) : (""+y);
  }
  function yearsLabel(p){
    return fmtYear(p.sortYear);
  }
  function panelYearsLabel(p){
    if(p.deathYear==null) return fmtYear(p.sortYear);
    var age = p.deathYear - p.sortYear;
    if(p.birthMonth!=null && p.deathMonth!=null){
      var earlier = p.deathMonth < p.birthMonth || (p.deathMonth===p.birthMonth && p.birthDay!=null && p.deathDay!=null && p.deathDay<p.birthDay);
      if(earlier) age -= 1;
    }
    return fmtYear(p.sortYear)+"-"+fmtYear(p.deathYear)+" ("+age+")";
  }
  function parseDateInput(str){
    str = (str||"").trim();
    if(!str) return null;
    var neg = false;
    if(str[0]==="-"){ neg=true; str=str.slice(1); }
    var parts = str.split(".").map(function(s){ return s.trim(); }).filter(function(s){ return s!==""; });
    if(!parts.length) return null;
    var y = parseInt(parts[0],10);
    if(isNaN(y)) return null;
    if(neg) y = -y;
    var m = parts.length>1 ? parseInt(parts[1],10) : null;
    var d = parts.length>2 ? parseInt(parts[2],10) : null;
    if(m!=null && isNaN(m)) m=null;
    if(d!=null && isNaN(d)) d=null;
    return {y:y, m:m, d:d};
  }
  function formatDateInput(y,m,d){
    if(y==null || isNaN(y)) return "";
    var s = ""+y;
    if(m!=null){ s += "."+m; if(d!=null) s += "."+d; }
    return s;
  }

  // ---------------- hover tooltip ----------------
  function showTooltip(p, evt){
    var tt=document.getElementById("nodeTooltip");
    var c = catOf(p.catId);
    var sub = p.subId ? findSub(p.catId, p.subId) : null;
    var meta = panelYearsLabel(p) + (c ? (" · "+c.name+(sub?(" · "+sub.name):"")) : "");
    tt.innerHTML =
      '<div class="tt-name">'+escapeHtml(p.name)+'</div>'+
      '<div class="tt-meta">'+escapeHtml(meta)+'</div>'+
      (p.bio ? '<div class="tt-bio">'+escapeHtml(p.bio)+'</div>' : "");
    tt.style.display="block";
    positionTooltip(evt);
  }
  function positionTooltip(evt){
    var tt=document.getElementById("nodeTooltip");
    var pad=16;
    var x=evt.clientX+pad, y=evt.clientY+pad;
    var rect=tt.getBoundingClientRect();
    if(x+rect.width > window.innerWidth-8) x = evt.clientX - rect.width - pad;
    if(y+rect.height > window.innerHeight-8) y = evt.clientY - rect.height - pad;
    tt.style.left=Math.max(8,x)+"px";
    tt.style.top=Math.max(8,y)+"px";
  }
  function hideTooltip(){
    document.getElementById("nodeTooltip").style.display="none";
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
  var dragState=null, justDraggedId=null;
  function svgPoint(e){
    var pt = stage.createSVGPoint();
    pt.x=e.clientX; pt.y=e.clientY;
    var ctm = stage.getScreenCTM();
    if(!ctm) return {x:0,y:0};
    var p = pt.matrixTransform(ctm.inverse());
    return {x:p.x, y:p.y};
  }

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
        renderLegend(); renderStage();
      };}(c.id));
      legend.appendChild(b);
    });
  }

  function renderStage(){
    var layout = computeLayout();
    stage.setAttribute("viewBox","0 0 "+layout.width+" "+layout.height);
    stage.style.width = layout.width+"px";
    stage.style.height = layout.height+"px";
    stage.innerHTML="";
    nodeEls={}; edgeEls=[];

    emptyHint.style.display = STATE.people.length ? "none" : "flex";

    // lane label column (offset down by YEAR_ROW_H to line up with the svg, which sits below the sticky year header)
    laneCol.style.height = (layout.height+YEAR_ROW_H)+"px";
    laneCol.innerHTML="";
    layout.activeCats.forEach(function(c){
      var bandH = layout.rowCountByCat[c.id]*SUBROW_H;
      var d=document.createElement("div");
      d.className="lane-label";
      d.style.top=(YEAR_ROW_H+layout.laneTop[c.id]+bandH/2-11)+"px";
      d.innerHTML='<span class="dot" style="background:'+c.color+'"></span>'+escapeHtml(c.name);
      laneCol.appendChild(d);
    });

    // sticky year header row
    var yearRow=document.getElementById("yearRow");
    yearRow.style.width = layout.width+"px";
    yearRow.innerHTML="";
    layout.ticks.forEach(function(tick, i){
      var t=document.createElement("div");
      t.className="year-tick";
      t.style.left=tick.x+"px";
      t.textContent=fmtYear(tick.year);
      var prevX = i>0 ? layout.ticks[i-1].x : null;
      var nextX = i<layout.ticks.length-1 ? layout.ticks[i+1].x : null;
      t.addEventListener("pointerdown", function(year,el,lo,hi,startX){ return function(e){
        e.preventDefault();
        e.stopPropagation();
        var st = {startClientX:e.clientX, moved:false};
        function clamp(nx){
          if(lo!=null) nx = Math.max(nx, lo+MIN_ANCHOR_GAP);
          if(hi!=null) nx = Math.min(nx, hi-MIN_ANCHOR_GAP);
          return nx;
        }
        function onMove(ev){
          var dx = ev.clientX - st.startClientX;
          if(Math.abs(dx)>3) st.moved=true;
          if(st.moved) el.style.left = clamp(startX+dx)+"px";
        }
        function onUp(ev){
          document.removeEventListener("pointermove", onMove);
          document.removeEventListener("pointerup", onUp);
          if(st.moved){
            var dx = ev.clientX - st.startClientX;
            STATE.timeAnchors[String(year)] = clamp(startX+dx);
            commit();
          }
        }
        document.addEventListener("pointermove", onMove);
        document.addEventListener("pointerup", onUp);
      }; }(tick.year, t, prevX, nextX, tick.x));
      yearRow.appendChild(t);
    });

    // bg stars
    var bg=el("g",{"aria-hidden":"true"});
    var starCount = Math.max(60, Math.round(layout.width/16));
    for(var i=0;i<starCount;i++){
      var sx=Math.random()*layout.width, sy=Math.random()*layout.height, sr=Math.random()*1.1+0.3;
      bg.appendChild(el("circle",{class:"bg-star",cx:sx,cy:sy,r:sr,opacity:(Math.random()*0.5+0.12).toFixed(2)}));
    }
    stage.appendChild(bg);

    // century gridlines (labels render in the sticky, draggable #yearRow header instead)
    var gl=el("g",{"aria-hidden":"true"});
    layout.ticks.forEach(function(tick){
      var xg = tick.x;
      if(xg<MARGIN_L-5 || xg>layout.width-10) return;
      gl.appendChild(el("line",{x1:xg,y1:0,x2:xg,y2:layout.height-MARGIN_BOTTOM+6,class:"grid-line"}));
    });
    stage.appendChild(gl);

    // lane band dividers
    var laneDiv=el("g",{"aria-hidden":"true"});
    layout.activeCats.forEach(function(c,i){
      if(i===0) return;
      var y=layout.laneTop[c.id]-LANE_PAD/2;
      laneDiv.appendChild(el("line",{x1:MARGIN_L-20,y1:y,x2:layout.width-MARGIN_R+20,y2:y,class:"lane-divider"}));
    });
    stage.appendChild(laneDiv);

    var defs=el("defs",{});
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
      if(!posA||!posB) return;
      var midX=(posA.x+posB.x)/2, midY=(posA.y+posB.y)/2;
      var dist=Math.abs(posB.x-posA.x);
      var bow=Math.max(18, Math.min(60, dist*0.18));
      var ctrlX=midX, ctrlY=midY-bow;
      var tdx=posB.x-ctrlX, tdy=posB.y-ctrlY;
      var tlen=Math.sqrt(tdx*tdx+tdy*tdy)||1;
      var NODE_R=7;
      var endX=posB.x-tdx/tlen*NODE_R, endY=posB.y-tdy/tlen*NODE_R;
      var attrs={class:"edge", d:"M"+posA.x+","+posA.y+" Q"+ctrlX+","+ctrlY+" "+endX+","+endY, "stroke-linecap":"round", "stroke-dasharray":"1 3.4"};
      var line=el("path",attrs);
      line.dataset.a=pa.id; line.dataset.b=pb.id; line.dataset.rid=r.id;
      edgeLayer.appendChild(line);
      edgeEls.push(line);
    });
    stage.appendChild(edgeLayer);

    // nodes
    var nodeLayer=el("g");
    STATE.people.forEach(function(p){
      var pos = layout.pos[p.id];
      if(!pos) return;
      var c = catOf(p.catId);
      var color = personColor(p);
      var g=el("g",{class:"node", tabindex:"0", role:"button", "aria-label":p.name+", "+yearsLabel(p)+(c?(", "+c.name):""), "data-id":p.id});
      g.appendChild(el("circle",{class:"ring", cx:pos.x, cy:pos.y, r:11, fill:"none", stroke:"transparent"}));
      g.appendChild(el("circle",{class:"core", cx:pos.x, cy:pos.y, r:5.5, fill:color, filter:"url(#starglow)"}));
      var name=el("text",{x:pos.x, y:pos.y-24, "text-anchor":"middle"});
      name.textContent = p.name;
      g.appendChild(name);
      var yrs=el("text",{class:"years", x:pos.x, y:pos.y-12, "text-anchor":"middle"});
      yrs.textContent = yearsLabel(p);
      g.appendChild(yrs);
      g.addEventListener("click", function(id){ return function(e){
        e.stopPropagation();
        if(justDraggedId===id){ justDraggedId=null; return; }
        selectNode(id);
      }; }(p.id));
      g.addEventListener("keydown", function(id){ return function(e){ if(e.key==="Enter"||e.key===" "){ e.preventDefault(); selectNode(id);} }; }(p.id));
      g.addEventListener("mouseenter", function(pp){ return function(e){ if(!dragState) showTooltip(pp,e); }; }(p));
      g.addEventListener("mousemove", function(e){ if(!dragState) positionTooltip(e); });
      g.addEventListener("mouseleave", hideTooltip);
      g.addEventListener("pointerdown", function(pp,gg,startPos,catLaneTop){ return function(e){
        if(e.button!=null && e.button!==0) return;
        e.preventDefault();
        e.stopPropagation();
        hideTooltip();
        dragState = gg; // marks "a drag is in progress on this element" for the tooltip/click guards
        var startSvgY = svgPoint(e).y;
        var st = {moved:false};
        function onMove(ev){
          var dy = svgPoint(ev).y - startSvgY;
          if(Math.abs(dy)>3) st.moved=true;
          if(st.moved) gg.setAttribute("transform","translate(0,"+dy+")");
        }
        function onUp(ev){
          document.removeEventListener("pointermove", onMove);
          document.removeEventListener("pointerup", onUp);
          dragState = null;
          if(st.moved){
            var dy = svgPoint(ev).y - startSvgY;
            var finalY = startPos.y + dy;
            pp.manualRow = Math.max(0, Math.round((finalY - catLaneTop - SUBROW_H/2)/SUBROW_H));
            gg.removeAttribute("transform");
            justDraggedId = pp.id;
            setTimeout(function(){ justDraggedId=null; }, 300);
            commit();
          }
        }
        document.addEventListener("pointermove", onMove);
        document.addEventListener("pointerup", onUp);
      }; }(p, g, pos, layout.laneTop[p.catId]));
      nodeLayer.appendChild(g);
      nodeEls[p.id]=g;
    });
    stage.appendChild(nodeLayer);

    if(currentId){
      if(nodeEls[currentId]) highlightSelection(currentId);
      else clearSelection();
    }
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
    hideTooltip();
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
    var color=personColor(p);
    var relLines = STATE.relationships.filter(function(r){ return r.a===id || r.b===id; });

    var html="";
    html+='<button class="panel-close" id="panelClose" aria-label="닫기">✕</button>';
    var sub = p.subId ? findSub(p.catId, p.subId) : null;
    html+='<span class="badge"><span class="dot" style="background:'+color+'"></span>'+escapeHtml(c?c.name:"")+(sub?(' · '+escapeHtml(sub.name)):'')+'</span>';
    html+='<div class="panel-actions"><button class="mini-btn" id="editPersonBtn">수정</button><button class="mini-btn danger" id="deletePersonBtn">삭제</button></div>';
    html+='<h2>'+escapeHtml(p.name)+' <span class="update-count" title="수정 횟수">('+(p.updateCount||0)+')</span></h2>';
    html+='<div class="years">'+escapeHtml(panelYearsLabel(p))+
      (p.manualRow!=null ? ' <button type="button" class="mini-btn" id="resetRowBtn" title="자동 배치로 되돌리기">위치 초기화</button>' : '')+
      '</div>';
    html+='<p class="bio">'+escapeHtml(p.bio||"")+'</p>';

    html+='<h3>관계 · '+relLines.length+'</h3>';
    html+='<ul class="rel-list">';
    relLines.forEach(function(r){
      var otherId = r.a===id ? r.b : r.a;
      var other = personOf(otherId);
      if(!other) return;
      html+='<li class="rel-item" data-jump="'+other.id+'">'+
        '<span class="dot" style="background:'+personColor(other)+'"></span>'+
        '<span class="rel-name">'+escapeHtml(other.name)+'</span>'+
        '<button class="rel-del" data-rid="'+r.id+'" aria-label="관계 삭제">✕</button>'+
      '</li>';
    });
    html+='</ul>';
    if(!relLines.length) html+='<div class="note-empty">아직 연결된 관계가 없습니다.</div>';

    var otherPeople = STATE.people.filter(function(x){ return x.id!==id; });
    function relLabel(x){ return x.name+" ("+fmtYear(x.sortYear)+")"; }
    html+='<div class="rel-add">';
    html+='<input type="text" id="relTarget" list="relTargetList" placeholder="'+(otherPeople.length?"인물 검색":"추가할 인물이 없습니다")+'"'+(otherPeople.length?"":" disabled")+'>';
    html+='<datalist id="relTargetList">'+otherPeople.map(function(x){ return '<option value="'+escapeHtml(relLabel(x))+'">'; }).join("")+'</datalist>';
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
    var resetRowBtn=document.getElementById("resetRowBtn");
    if(resetRowBtn) resetRowBtn.addEventListener("click",function(){ p.manualRow=null; commit(); });
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
      var typed=document.getElementById("relTarget").value.trim();
      var target = otherPeople.filter(function(x){ return relLabel(x)===typed; })[0];
      if(!target){ alert("목록에서 인물을 선택해주세요."); return; }
      var exists = STATE.relationships.some(function(r){ return (r.a===id&&r.b===target.id)||(r.a===target.id&&r.b===id); });
      if(exists){ alert("이미 연결된 관계가 있어요."); return; }
      STATE.relationships.push({id:uid("rel"), a:id, b:target.id});
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
  function autoGrow(el){
    el.style.height="auto";
    el.style.height=(el.scrollHeight+2)+"px";
  }
  function openPersonModal(id){
    editingId = id||null;
    var p = id ? personOf(id) : null;
    var modal=document.getElementById("personModal");
    document.getElementById("pmTitle").textContent = p ? "인물 수정" : "새 인물 추가";
    document.getElementById("pmName").value = p ? p.name : "";
    document.getElementById("pmYear").value = p ? formatDateInput(p.sortYear, p.birthMonth, p.birthDay) : "";
    document.getElementById("pmDeathYear").value = p ? formatDateInput(p.deathYear, p.deathMonth, p.deathDay) : "";
    var bioEl=document.getElementById("pmBio");
    bioEl.value = p ? (p.bio||"") : "";
    autoGrow(bioEl);
    var initCatId = p ? p.catId : (STATE.categories[0]&&STATE.categories[0].id);
    renderCatOptions(initCatId);
    document.getElementById("pmNewCat").value="";
    document.getElementById("pmNewCat").style.display="none";
    renderSubOptions(initCatId, p ? p.subId : null);
    document.getElementById("pmNewSub").value="";
    document.getElementById("pmNewSub").style.display="none";
    modal.classList.add("open");
    modal.setAttribute("aria-hidden","false");
    document.getElementById("pmName").focus();
  }
  function renderCatOptions(selectedId){
    var sel=document.getElementById("pmCat");
    sel.innerHTML = STATE.categories.map(function(c){ return '<option value="'+c.id+'"'+(c.id===selectedId?" selected":"")+'>'+escapeHtml(c.name)+'</option>'; }).join("") + '<option value="__new__">+ 새 분야 추가</option>';
  }
  function renderSubOptions(catId, selectedSubId){
    var sel=document.getElementById("pmSub");
    var c = catId==="__new__" ? null : catOf(catId);
    var subs = (c && c.subs) ? c.subs : [];
    sel.innerHTML = '<option value="">(없음)</option>' +
      subs.map(function(s){ return '<option value="'+s.id+'"'+(s.id===selectedSubId?" selected":"")+'>'+escapeHtml(s.name)+'</option>'; }).join("") +
      '<option value="__new__">+ 새 서브 카테고리 추가</option>';
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
      renderSubOptions(this.value, null);
      document.getElementById("pmNewSub").value="";
      document.getElementById("pmNewSub").style.display="none";
    });
    document.getElementById("pmSub").addEventListener("change",function(){
      var newField=document.getElementById("pmNewSub");
      if(this.value==="__new__"){ newField.style.display="block"; newField.focus(); }
      else newField.style.display="none";
    });
    document.getElementById("pmBio").addEventListener("input", function(){ autoGrow(this); });
    document.getElementById("pmCancel").addEventListener("click", closePersonModal);
    document.getElementById("pmClose").addEventListener("click", closePersonModal);
    document.getElementById("addPersonBtn").addEventListener("click", function(){ openPersonModal(null); });
    document.getElementById("pmForm").addEventListener("submit", function(e){
      e.preventDefault();
      var name=document.getElementById("pmName").value.trim();
      var birth = parseDateInput(document.getElementById("pmYear").value);
      var bio=document.getElementById("pmBio").value.trim();
      var catSel=document.getElementById("pmCat").value;
      if(!name || !birth){ alert("이름과 출생년(예: 1960 또는 1960.3.5)은 필수예요."); return; }
      var deathRaw = document.getElementById("pmDeathYear").value.trim();
      var death = null;
      if(deathRaw!==""){
        death = parseDateInput(deathRaw);
        if(!death){ alert("사망년 형식이 올바르지 않아요 (예: 2010 또는 2010.1.14)."); return; }
      }
      var catId = catSel;
      if(catSel==="__new__"){
        var newName=document.getElementById("pmNewCat").value.trim();
        if(!newName){ alert("새 분야 이름을 입력해주세요."); return; }
        catId = ensureCategory(newName).id;
      }
      var subSel = document.getElementById("pmSub").value;
      var subId = null;
      if(subSel==="__new__"){
        var newSubName = document.getElementById("pmNewSub").value.trim();
        if(newSubName) subId = ensureSub(catId, newSubName).id;
      } else if(subSel!==""){
        subId = subSel;
      }
      var fields = {
        name:name, bio:bio, catId:catId, subId:subId,
        sortYear:birth.y, birthMonth:birth.m, birthDay:birth.d,
        deathYear: death?death.y:null, deathMonth: death?death.m:null, deathDay: death?death.d:null
      };
      if(editingId){
        var p=personOf(editingId);
        for(var k in fields) p[k]=fields[k];
        p.updateCount = (p.updateCount||0) + 1;
      } else {
        fields.id=uid("p"); fields.notes=[]; fields.updateCount=0;
        STATE.people.push(fields);
      }
      closePersonModal();
      commit();
    });
  }

  // ---------------- category management ----------------
  function renderCatList(){
    var wrap=document.getElementById("catList");
    if(!STATE.categories.length){ wrap.innerHTML='<div class="cat-empty">등록된 분야가 없습니다.</div>'; return; }
    wrap.innerHTML = STATE.categories.map(function(c){
      var count = STATE.people.filter(function(p){ return p.catId===c.id; }).length;
      var subs = c.subs||[];
      var subHtml = subs.map(function(s){
        var scount = STATE.people.filter(function(p){ return p.catId===c.id && p.subId===s.id; }).length;
        return '<div class="sub-row" data-cat="'+c.id+'" data-sub="'+s.id+'">'+
          '<input type="color" class="sub-color-input" data-cat="'+c.id+'" data-sub="'+s.id+'" value="'+(s.color||c.color)+'" title="'+(s.color?"이 서브 카테고리만의 색":"기본은 분야 색을 그대로 씀")+'">'+
          '<input type="text" class="sub-name-input" value="'+escapeHtml(s.name)+'">'+
          '<span class="cat-count">'+scount+'명</span>'+
          (s.color?'<button type="button" class="mini-btn sub-color-reset" data-cat="'+c.id+'" data-sub="'+s.id+'" title="기본색으로">↺</button>':'')+
          '<button type="button" class="mini-btn danger sub-del" data-cat="'+c.id+'" data-sub="'+s.id+'"'+(scount>0?' disabled title="인물이 있어 삭제할 수 없어요"':'')+'>삭제</button>'+
        '</div>';
      }).join("");
      subHtml += '<div class="sub-add-row" data-cat="'+c.id+'">'+
        '<input type="text" class="sub-new-input" placeholder="새 서브 카테고리">'+
        '<button type="button" class="mini-btn sub-add-btn" data-cat="'+c.id+'">+ 추가</button>'+
      '</div>';
      return '<div class="cat-block">'+
        '<div class="cat-row" data-id="'+c.id+'">'+
          '<span class="dot" style="background:'+c.color+'"></span>'+
          '<input type="text" class="cat-name-input" value="'+escapeHtml(c.name)+'">'+
          '<span class="cat-count">'+count+'명</span>'+
          '<button type="button" class="mini-btn danger cat-del" data-id="'+c.id+'"'+(count>0?' disabled title="인물이 있어 삭제할 수 없어요"':'')+'>삭제</button>'+
        '</div>'+
        '<div class="sub-list">'+subHtml+'</div>'+
      '</div>';
    }).join("");
    wrap.querySelectorAll(".cat-del").forEach(function(btn){
      btn.addEventListener("click", function(){
        var id=btn.getAttribute("data-id");
        var c=catOf(id);
        if(!c || btn.disabled) return;
        if(!confirm('"'+c.name+'" 분야를 삭제할까요?')) return;
        STATE.categories = STATE.categories.filter(function(x){ return x.id!==id; });
        if(activeCatIds){ var idx=activeCatIds.indexOf(id); if(idx>-1) activeCatIds.splice(idx,1); }
        commit();
        renderCatList();
      });
    });
    wrap.querySelectorAll(".sub-del").forEach(function(btn){
      btn.addEventListener("click", function(){
        var catId=btn.getAttribute("data-cat"), subId=btn.getAttribute("data-sub");
        var c=catOf(catId);
        if(!c || btn.disabled) return;
        var s=findSub(catId,subId);
        if(!confirm('"'+(s?s.name:"")+'" 서브 카테고리를 삭제할까요?')) return;
        c.subs = (c.subs||[]).filter(function(x){ return x.id!==subId; });
        commit();
        renderCatList();
      });
    });
    wrap.querySelectorAll(".sub-add-btn").forEach(function(btn){
      btn.addEventListener("click", function(){
        var catId=btn.getAttribute("data-cat");
        var input=btn.parentNode.querySelector(".sub-new-input");
        var name=input.value.trim();
        if(!name) return;
        ensureSub(catId, name);
        commit();
        renderCatList();
      });
    });
    wrap.querySelectorAll(".sub-color-input").forEach(function(inp){
      inp.addEventListener("change", function(){
        var catId=inp.getAttribute("data-cat"), subId=inp.getAttribute("data-sub");
        var s=findSub(catId,subId);
        if(s){ s.color=inp.value; commit(); renderCatList(); }
      });
    });
    wrap.querySelectorAll(".sub-color-reset").forEach(function(btn){
      btn.addEventListener("click", function(){
        var catId=btn.getAttribute("data-cat"), subId=btn.getAttribute("data-sub");
        var s=findSub(catId,subId);
        if(s){ s.color=null; commit(); renderCatList(); }
      });
    });
  }
  function openCatModal(){
    renderCatList();
    var modal=document.getElementById("catModal");
    modal.classList.add("open");
    modal.setAttribute("aria-hidden","false");
  }
  function closeCatModal(){
    var modal=document.getElementById("catModal");
    modal.classList.remove("open");
    modal.setAttribute("aria-hidden","true");
  }
  function initCatModal(){
    document.getElementById("manageCatBtn").addEventListener("click", openCatModal);
    document.getElementById("catClose").addEventListener("click", closeCatModal);
    document.getElementById("catCancel").addEventListener("click", closeCatModal);
    document.getElementById("catSaveBtn").addEventListener("click", function(){
      var rows=document.querySelectorAll("#catList .cat-row");
      var ok=true;
      rows.forEach(function(row){
        var id=row.getAttribute("data-id");
        var input=row.querySelector(".cat-name-input");
        var name=input.value.trim();
        if(!name){ ok=false; return; }
        var c=catOf(id);
        if(c) c.name=name;
      });
      document.querySelectorAll("#catList .sub-row").forEach(function(row){
        var catId=row.getAttribute("data-cat"), subId=row.getAttribute("data-sub");
        var input=row.querySelector(".sub-name-input");
        var name=input.value.trim();
        if(!name){ ok=false; return; }
        var s=findSub(catId,subId);
        if(s) s.name=name;
      });
      if(!ok){ alert("분야·서브 카테고리 이름은 비워둘 수 없어요."); return; }
      closeCatModal();
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

  // ---------------- spotlight ----------------
  function spotlightRandomPerson(){
    if(!STATE.people.length) return;
    var catsWithPeople = STATE.categories.filter(function(c){
      return STATE.people.some(function(p){ return p.catId===c.id; });
    });
    if(!catsWithPeople.length) return;
    var cat = catsWithPeople[Math.floor(Math.random()*catsWithPeople.length)];
    var members = STATE.people.filter(function(p){ return p.catId===cat.id; });
    var person = members[Math.floor(Math.random()*members.length)];
    selectNode(person.id);
    var body=document.getElementById("panelBody");
    if(body && body.firstChild){
      var tag=document.createElement("div");
      tag.className="spotlight-tag";
      tag.textContent="🎲 오늘의 리마인드";
      body.insertBefore(tag, body.firstChild);
    }
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
    initCatModal();
    initSearch();
    initTheme();
    renderAll();
    spotlightRandomPerson();
  });

  window.SEONGJWA = {
    get: function(){ return STATE; },
    replace: function(newState){
      var keepId = currentId;
      STATE = normalizeState(newState);
      activeCatIds = null;
      if(keepId && personOf(keepId)){
        currentId = keepId; // keep the open panel (e.g. random spotlight) alive across a cloud sync
      } else {
        clearSelectionSilent();
      }
      persistLocal();
      renderAll();
    },
    onSave: null
  };
  function clearSelectionSilent(){
    currentId=null;
    if(stage) stage.classList.remove("selected-fade");
    var panel=document.getElementById("panel");
    if(panel){ panel.classList.remove("open"); panel.setAttribute("aria-hidden","true"); }
  }
})();
