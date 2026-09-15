/* Original miniature island artwork. Static landscapes are rasterized once;
   pieces and legal-location indicators remain crisp, interactive SVG. */
(function(HL){
 'use strict';
 var NS='http://www.w3.org/2000/svg', builds=0,paints=0,queued=false,paintPromise=Promise.resolve();
 var colors={wood:['#708f50','#345d43'],brick:['#cc9365','#98684e'],sheep:['#c0cf81','#799958'],wheat:['#e9c479','#b58a47'],ore:['#9ba6a9','#677b82'],desert:['#debb81','#b58d59']};
 function el(t,a,p){var n=document.createElementNS(NS,t);Object.keys(a||{}).forEach(function(k){if(k==='text')n.textContent=a[k];else n.setAttribute(k,a[k])});if(p)p.appendChild(n);return n}
 function path(p,d,fill,stroke,w){return el('path',{d:d,fill:fill||'none',stroke:stroke||'none','stroke-width':w||1,'stroke-linejoin':'round','stroke-linecap':'round'},p)}
 function poly(r,cy){return Array.from({length:6},function(_,i){var a=i*Math.PI/3-Math.PI/2;return(r*Math.cos(a)).toFixed(2)+','+(cy+r*Math.sin(a)).toFixed(2)}).join(' ')}
 function tree(p,x,y,s){var g=el('g',{transform:'translate('+x+' '+y+') scale('+s+')'},p);el('ellipse',{cx:3,cy:3,rx:10,ry:4,fill:'#183b2d',opacity:.22},g);path(g,'M-1 3L-1-8L2-8L2 3Z','#926543');path(g,'M0-29L-10-8L-6-8L-13-1L0 3L12-1L7-8L10-8Z','#275448','#153c35',.7);path(g,'M0-28L-9-8L-4-9L-10-2L0 0Z','#82ad69');path(g,'M0-27L0 0L8-2L3-9L6-8Z','#467f57');path(g,'M-7-10L0-8L6-10M-9-3L0 0L8-3','none','#9eba80',.55)}
 function rock(p,x,y,s){var g=el('g',{transform:'translate('+x+' '+y+') scale('+s+')'},p);path(g,'M-19 9L-11-7L0-25L10-12L20 8L3 15Z','#4f6470','#405762',.5);path(g,'M-19 9L-11-7L0-25L-3 10Z','#b9c3be');path(g,'M0-25L10-12L20 8L-3 10Z','#829a9f');path(g,'M0-25L7-15L3-16L1-11L-3-16L-8-13Z','#f0efe0');path(g,'M3-8L9 2L4 8L12 8M-11 4L-5-7','none','#d0d4bf',.7)}
 function house(p,x,y,c,city){var g=el('g',{transform:'translate('+x+' '+y+')',class:city?'city':'settlement'},p),co=HL.Render.PLAYER_HEX[c];
  el('ellipse',{cx:2,cy:6,rx:city?17:12,ry:5,fill:'#0d242a',opacity:.65},g);
  function block(x,y,w,h){path(g,'M'+x+' '+y+'l'+w+' -4l'+(w*.65)+' 5v'+h+'l-'+w+' 4l-'+(w*.65)+' -5Z',co.dark,'#142a2c',1);path(g,'M'+x+' '+y+'l'+(w*.65)+' 5v'+h+'l-'+(w*.65)+' -5Z',co.fill);path(g,'M'+(x+w*.65)+' '+(y+5)+'l'+w+' -4v'+h+'l-'+w+' 4Z',co.light);path(g,'M'+(x-2)+' '+y+'l'+(w*.45)+' -8l'+(w+2)+' -4l'+(w*.65)+' 12l-'+(w+2)+' 5Z',co.dark,'#ffe4a5',.75);path(g,'M'+(x-2)+' '+y+'l'+(w*.45)+' -8l'+(w*.8)+' 13Z',co.fill);path(g,'M'+(x+w*.7+2)+' '+(y+7)+'v4m4-5v4','none','#24373b',1.8)}
  if(city){block(-14,-7,11,12);block(-1,-16,10,19);path(g,'M4-27V-35l9 2l-9 4Z',co.light,'#fff1be',.6)}else block(-10,-7,12,12);
  return g;
 }
 function landscape(defs,res){var s=el('g',{id:'land-'+res},defs);var c=colors[res];el('polygon',{points:poly(45.5,0),fill:c[0]},s);
  path(s,'M-39-22Q-20-11 0-26Q23-30 39-19L39 23L0 45L-39 23Z',c[1]);
  path(s,'M-38 20Q-22 3 0 8Q24 3 38 21L0 44Z',c[0]);
  if(res==='wood'){
   path(s,'M-35 21Q-10 5 20-28','none','#b1b87f',3);
   [[-19,-16,.65],[0,-24,.65],[17,-10,.9],[-29,4,.8],[-9,0,1],[29,8,.55],[-19,20,.62],[10,10,.7]].forEach(a=>tree(s,...a));
  }else if(res==='ore'){
   rock(s,-15,-6,.78);rock(s,11,-4,1.02);rock(s,29,15,.44);rock(s,-29,19,.45);
   path(s,'M8 5Q13 12 7 25L-1 35','none','#c6bba1',2);
   path(s,'M-8 11v-9l7-3l7 6v10Z','#263f47','#b5b3a0',1.8);path(s,'M-4 12V3l5-1v12','#122c36');
  }else if(res==='brick'){
   path(s,'M-36 8L-21-23L5-34L25-20L38 8L22 22L-23 22Z','#a86c4e');
   path(s,'M-36 8L-21-23L5-34L-5-9L-18 13Z','#e1a572');path(s,'M-5-9L5-34L25-20L13-4L21 12L-2 20Z','#be835d');
   path(s,'M-28-6L-15 0L-2-3M0-18L13-16L23-13M-33 7L-19 13L-7 10M19 4L30 6','none','#f1c796',1.8);
   [[-24,21],[-14,23],[20,22]].forEach(a=>{path(s,'M'+a[0]+' '+a[1]+'l8-3l6 3v4l-8 3l-6-3Z','#d58b60','#815039',.8);path(s,'M'+a[0]+' '+a[1]+'l8-3l6 3l-8 3Z','#f2bc8b')});
  }else if(res==='wheat'){
   path(s,'M-37-18L-8-35L20-20L-10-3Z','#a88145','#f1d58d',1);
   path(s,'M-37-14L-10 1L-15 23L-39 13Z','#d7a75b','#f1d58d',1);
   path(s,'M-4-1L25-18L38-2L10 13Z','#c19046','#f1d58d',1);
   for(var i=0;i<7;i++){path(s,'M'+(-33+i*4)+' '+(-19-i*2)+'l23 13','none','#f8d885',1.8);path(s,'M'+(i*4)+' '+(-i*2)+'l9 8','none','#f6d385',1.3)}
   path(s,'M17 10L20-14L26-14L31 10Z','#f1d8a3','#987349',.8);path(s,'M18-14L23-24L28-14Z','#786452');
   path(s,'M23-13L10-25M23-13L36-1M23-13L35-26M23-13L11 0','none','#695c42',2);path(s,'M12-24L17-25L24-15M34-25L35-20L25-12M34-2L29-1L23-11M12-1L11-6L22-14','none','#fff0c0',3);
  }else if(res==='sheep'){
   path(s,'M-38 10Q-15-13 12-16Q24-17 36-7','none','#d6dca0',2);
   path(s,'M-31-17L-6-29M-28-21v9M-20-25v9M-12-29v9','none','#eee3b3',1.7);
   [[-17,-7],[6,-15],[24,1],[-27,15],[14,24]].forEach(a=>{el('ellipse',{cx:a[0]+2,cy:a[1]+4,rx:7,ry:3,fill:'#537544',opacity:.25},s);path(s,'M'+(a[0]-3)+' '+a[1]+'v6m7-6v6','none','#475641',1.6);el('ellipse',{cx:a[0],cy:a[1],rx:6.5,ry:4.5,fill:'#f9efcf',stroke:'#d5d6ac','stroke-width':.6},s);el('ellipse',{cx:a[0]+6,cy:a[1]+1,rx:2.5,ry:3,fill:'#4d604f'},s)});
   [[-5,29],[27,-13],[-28,-7]].forEach(a=>{path(s,'M'+a[0]+' '+a[1]+'l1-4m-1 3l-3-2','none','#e5e4a9',1)});
  }else{
   path(s,'M-40 16Q-6-16 35-1Q3-1-10 21Q-28 31-40 16Z','#efd39d');path(s,'M-34-16Q-3-24 19-23Q-12-16-15-4Z','#f5dca6');
   path(s,'M12 20L12 3M12 10L6 7V2M12 13L18 9V5','none','#647953',3);path(s,'M-23 12L-20 0L-13-2L-9 8Z','#b78d58','#eed2a0',.9);
  }
  el('polygon',{points:poly(45.5,0),fill:'none',stroke:'#e9d5a0','stroke-width':.9,opacity:.6},s);
 }
 function defs(svg){var d=el('defs',{},svg);var gr=el('radialGradient',{id:'sea-art',cx:'45%',cy:'42%',r:'65%'},d);[['0%','#33696d'],['70%','#194754'],['100%','#092632']].forEach(a=>el('stop',{offset:a[0],'stop-color':a[1]},gr));Object.keys(colors).forEach(k=>landscape(d,k));return d}
 function staticBoard(svg,state){var d=defs(svg),g=el('g',{id:'island-static'},svg);el('rect',{x:-260,y:-235,width:520,height:470,rx:24,fill:'url(#sea-art)'},g);
  for(var i=0;i<48;i++){var x=((i*79)%490)-245,y=((i*47)%440)-220;if(Math.hypot(x,y)<170)continue;path(g,'M'+x+' '+y+'q5 3 10 0m3 0q4 3 8 0','none','#659391',.7)}
  el('ellipse',{cx:0,cy:12,rx:223,ry:195,fill:'#17353b',opacity:.55},g);
  // Coastal shelf, shadows and foam are shared by the original board graph.
  state.board.tiles.forEach(t=>el('polygon',{points:poly(49,7),transform:'translate('+t.x+' '+t.y+')',fill:'#274b4d',stroke:'#639489','stroke-width':4},g));
  state.board.tiles.slice().sort((a,b)=>a.y-b.y).forEach(t=>{var h=el('g',{transform:'translate('+t.x+' '+t.y+')','data-tile-id':t.id},g);el('polygon',{points:poly(47,4),fill:'#967b57',stroke:'#263e3b','stroke-width':.9},h);el('use',{href:'#land-'+t.res},h)});
  state.board.ports.forEach(port=>{var a=state.board.verticesById[port.v1],b=state.board.verticesById[port.v2],x=(a.x+b.x)/2,y=(a.y+b.y)/2,px=Math.max(-232,Math.min(232,port.iconX)),py=Math.max(-212,Math.min(212,port.iconY));path(g,'M'+x+' '+y+'L'+px+' '+py,'none','#c1ad7e',5);path(g,'M'+x+' '+y+'L'+px+' '+py,'none','#746b51',2);var p=el('g',{transform:'translate('+px+' '+py+')'},g);el('title',{text:(port.res==='?'?'Any resource':port.res)+' port: '+(port.res==='?'?'3:1':'2:1')},p);el('rect',{x:-19,y:-20,width:38,height:36,rx:7,fill:'#133945',stroke:'#c7b280','stroke-width':1},p);var icon=el('g',{transform:'translate(0 -9)'},p);if(port.res==='?')el('text',{x:0,y:4,'text-anchor':'middle','font-size':12,'font-weight':700,fill:'#efd7a0',text:'ANY'},icon);else if(port.res==='wood'){path(icon,'M0-8L-7 4H-2V7H2V4H7Z','#9abf83','#dfe0ad',.6)}else if(port.res==='brick'){path(icon,'M-9-3L1-6L9-2V4L-1 7L-9 3Z','#cb8c65','#edc998',.6);path(icon,'M-9-3L-1 0L9-2M-1 0V7','none','#eed1a2',.6)}else if(port.res==='sheep'){el('ellipse',{cx:-1,cy:0,rx:7,ry:5,fill:'#f4eccc'},icon);el('ellipse',{cx:6,cy:1,rx:3,ry:3,fill:'#8ca38a'},icon);path(icon,'M-4 3V7M3 3V7','none','#e3dabb',1.4)}else if(port.res==='wheat'){path(icon,'M0-7V8M0-4L-4-7M0 0L-5-4M0 4L-5 0M0-3L4-7M0 1L5-3M0 5L5 1','none','#efd18a',2)}else{path(icon,'M-10 6L-2-8L5 1L8-3L13 6Z','#a9bec1','#e7e6ce',.7);path(icon,'M-2-8L1-2L-3-3L-5-1Z','#fff4d3')};el('text',{x:0,y:11,'text-anchor':'middle','font-family':'Trebuchet MS,Arial,sans-serif','font-size':14,'font-weight':800,fill:'#fff3cf',text:port.res==='?'?'3:1':'2:1'},p)});
  var raw='<svg xmlns="'+NS+'" viewBox="-260 -235 520 470" width="1040" height="940" font-family="Trebuchet MS,Arial,sans-serif">'+d.outerHTML+g.outerHTML+'</svg>',img=new Image(),canvas=document.getElementById('board-art');
  img.onload=function(){if(svg._board!==state.board)return;canvas.width=1040;canvas.height=940;svg._staticImage=img;g.replaceChildren();canvas.style.visibility='visible';requestPaint(svg)};img.src='data:image/svg+xml;charset=utf-8,'+encodeURIComponent(raw);builds++;
 }
 function render(svg,state){
  if(svg._board!==state.board){svg._board=state.board;svg._staticImage=null;svg.classList.remove('raster-ready');svg.replaceChildren();document.getElementById('board-art').style.visibility='hidden';staticBoard(svg,state);el('g',{id:'art-pieces'},svg);['vertices','edges','tiles','cursor'].forEach(k=>el('g',{id:'overlay-'+k},svg))}
  var layer=svg.querySelector('#art-pieces');layer.replaceChildren();
  state.board.tiles.forEach(t=>{if(!t.token)return;var g=el('g',{transform:'translate('+t.x+' '+(t.y+18)+')'},layer),hot=t.token===6||t.token===8;el('ellipse',{cx:1,cy:3,rx:12,ry:11,fill:'#20342a',opacity:.5},g);el('circle',{r:12,fill:'#f5e3b6',stroke:hot?'#a86243':'#baa377','stroke-width':1.4},g);el('text',{x:0,y:2,'text-anchor':'middle','font-size':16,'font-weight':800,fill:hot?'#9c3f2e':'#32433c',text:t.token},g);var n=6-Math.abs(7-t.token);for(var i=0;i<n;i++)el('circle',{cx:(i-(n-1)/2)*2.4,cy:7,r:.85,fill:hot?'#9c3f2e':'#32433c'},g)});
  state.players.forEach(p=>Object.keys(p.roads).forEach(id=>{var e=state.board.edgesById[id],a=state.board.verticesById[e.v1],b=state.board.verticesById[e.v2],co=HL.Render.PLAYER_HEX[p.color];path(layer,'M'+a.x+' '+(a.y+2)+'L'+b.x+' '+(b.y+2),'none','#173131',9);path(layer,'M'+a.x+' '+a.y+'L'+b.x+' '+b.y,'none',co.dark,7);path(layer,'M'+a.x+' '+(a.y-1)+'L'+b.x+' '+(b.y-1),'none',co.fill,5);path(layer,'M'+a.x+' '+(a.y-2)+'L'+b.x+' '+(b.y-2),'none',co.light,1.2)}));
  var pieces=[];state.players.forEach(p=>['settlements','cities'].forEach(k=>Object.keys(p[k]).forEach(id=>{var v=state.board.verticesById[id];pieces.push({p:p,v:v,city:k==='cities'})})));pieces.sort((a,b)=>a.v.y-b.v.y).forEach(o=>house(layer,o.v.x,o.v.y,o.p.color,o.city));
  var t=state.board.tiles.find(t=>t.id===state.board.robberTileId);if(t){var g=el('g',{transform:'translate('+t.x+' '+(t.y-5)+')',class:'robber-piece'},layer);el('ellipse',{cx:2,cy:9,rx:12,ry:4,fill:'#152d36',opacity:.6},g);path(g,'M-10 7L-6-7Q-10-20 0-25Q10-20 6-7L10 7Q0 14-10 7Z','#354450','#d5c89b',1);path(g,'M0-24Q-8-16-4-10L0 6L-9 7L-5-7Z','#77817a');path(g,'M-4-16Q0-20 4-16L3-10L-3-10Z','#162933');path(g,'M-2-14H2','none','#efd7a3',1)}
  paints++;
  requestPaint(svg);
 }
 function drawNode(ctx,n){
  if(n.nodeType!==1)return;ctx.save();
  var transforms=n.transform&&n.transform.baseVal;if(transforms)for(var i=0;i<transforms.numberOfItems;i++){var m=transforms.getItem(i).matrix;ctx.transform(m.a,m.b,m.c,m.d,m.e,m.f);}
  var tag=n.localName,style=getComputedStyle(n),opacity=parseFloat(style.opacity);ctx.globalAlpha*=Number.isFinite(opacity)?opacity:1;
  if(tag==='g'){Array.from(n.children).forEach(function(c){drawNode(ctx,c);});ctx.restore();return;}
  var num=function(k){return parseFloat(n.getAttribute(k))||0;},shape=new Path2D();
  if(tag==='path')shape=new Path2D(n.getAttribute('d')||'');
  else if(tag==='circle')shape.arc(num('cx'),num('cy'),num('r'),0,Math.PI*2);
  else if(tag==='ellipse')shape.ellipse(num('cx'),num('cy'),num('rx'),num('ry'),0,0,Math.PI*2);
  else if(tag==='line'){shape.moveTo(num('x1'),num('y1'));shape.lineTo(num('x2'),num('y2'));}
  else if(tag==='polygon'){var points=(n.getAttribute('points')||'').trim().split(/[ ,]+/).map(Number);for(var j=0;j<points.length;j+=2){if(j===0)shape.moveTo(points[j],points[j+1]);else shape.lineTo(points[j],points[j+1]);}shape.closePath();}
  else if(tag==='rect'){shape.roundRect(num('x'),num('y'),num('width'),num('height'),num('rx'));}
  var fill=style.fill,stroke=style.stroke;
  if(tag==='text'){ctx.font=style.fontWeight+' '+style.fontSize+' '+style.fontFamily;ctx.textAlign=n.getAttribute('text-anchor')==='middle'?'center':'left';ctx.textBaseline='alphabetic';ctx.fillStyle=fill;ctx.fillText(n.textContent,num('x'),num('y'));}
  else{if(fill&&fill!=='none'){ctx.fillStyle=fill;ctx.fill(shape);}if(stroke&&stroke!=='none'){ctx.strokeStyle=stroke;ctx.lineWidth=parseFloat(style.strokeWidth)||1;ctx.lineCap=style.strokeLinecap||'round';ctx.lineJoin=style.strokeLinejoin||'round';var dash=style.strokeDasharray;ctx.setLineDash(dash==='none'?[]:dash.split(/[ ,]+/).map(parseFloat));ctx.stroke(shape);}}
  ctx.restore();
 }
 function requestPaint(svg){
  if(queued)return;queued=true;
  paintPromise=Promise.resolve().then(function(){queued=false;if(!svg._staticImage)return;
   var canvas=document.getElementById('board-art'),ctx=canvas.getContext('2d');ctx.clearRect(0,0,1040,940);ctx.drawImage(svg._staticImage,0,0);ctx.save();ctx.translate(520,470);ctx.scale(2,2);
   ['art-pieces','overlay-vertices','overlay-edges','overlay-tiles','overlay-cursor'].forEach(function(id){var g=svg.querySelector('#'+id);if(g)drawNode(ctx,g);});ctx.restore();svg.classList.add('raster-ready');
  }).catch(function(error){svg.classList.remove('raster-ready');console.error('Board paint failed',error);});
 }

 function menu(){var box=document.querySelector('.logo-mark');if(!box)return;var svg=el('svg',{viewBox:'-90 -66 180 125',width:250,height:174,'aria-hidden':'true'});var d=defs(svg);['wood','wheat','ore'].forEach((k,i)=>el('use',{href:'#land-'+k,transform:'translate('+((i-1)*53)+' '+(i===1?12:-7)+') scale(.63)'},svg));house(svg,-7,-9,'white',true);house(svg,29,20,'red',false);box.replaceChildren(svg);}
 HL.Render.renderBoard=render;
 ['clearOverlays','showVertexCandidates','showEdgeCandidates','showTileCursor'].forEach(function(k){var original=HL.Render[k];HL.Render[k]=function(){var result=original.apply(null,arguments);requestPaint(arguments[0]);return result;};});
 HL.Art={menu:menu,ready:function(){return paintPromise;},stats:function(){return{staticBuilds:builds,paints:paints,canvasBytes:1040*940*4}}};
})(window.HL);
