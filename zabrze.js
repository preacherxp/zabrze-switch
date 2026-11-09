/* zabrze-switch — restored heritage, contemporary culture and the city’s football arena. */
(() => {
  const { PAD_Y, BW, BH, clamp, mix, smooth, rng } = CitySwitch;
  const NOON=0,GOLD=1,DUSK=2,NIGHT=3,DAWN=4;
  let M,N;
  const SKY = [
    ['#568bb4', '#7aaaca', '#a9cadd', '#d1e2e7', '#f2ebd6'],
    ['#7798b5', '#b6b0b5', '#e2b19a', '#f5bc87', '#ffe2ac'],
    ['#293d65', '#545576', '#a07686', '#da9b89', '#f4bd9d'],
    ['#080f22', '#101c34', '#1a2b43', '#2d4052', '#4b5960'],
    ['#425a7e', '#7d8fa3', '#bdadb0', '#e6c7b8', '#f5e4cd'],
  ];
  const palette=({mat,neon})=>{
    mat('BRICK','#b36b49');
    mat('BRICK_D','#915437');
    mat('ROOF','#5b6268');
    mat('ROOF_D','#414c55');
    mat('ROOF_L','#83898b');
    mat('STEEL','#7b8a8a');
    mat('STEEL_D','#3e555c');
    mat('WHEEL','#d1a956');
    mat('WHEEL_D','#a28142');
    mat('WINDOW','#6e919d');
    mat('WINDOW_H','#b8d6d9');
    mat('TRIM','#efeada');
    mat('PALE','#d9d9cc');
    mat('PALE_D','#b5c3bd');
    mat('GOLD','#6c5427');
    mat('ARENA_GLASS','#76948d');
    mat('LIFT_GLASS','#97b1b8');
    mat('LIFT_CAB','#4e6a76');
    mat('TREE','#588065');
    mat('TREE_D','#355f4c');
    mat('TREE_L','#7ea16e');
    mat('TIMBER_D','#6a5742');
    mat('PLANTER','#7a877d');
    mat('STONE','#c7c6b6');
    mat('STONE_D','#a1aaa0');
    mat('PAVE','#c8ccbf',{[NIGHT]:'#2d3e4a'});
    mat('PAVE_D','#b1b8ae',{[NIGHT]:'#233440'});
    mat('CLOUD','#f3f5ec',{[GOLD]:'#ffe3bd',[DUSK]:'#bc97ab',[NIGHT]:'#304657',[DAWN]:'#d8c8c8'});
    mat('CLOUD_SH','#d6e1de',{[GOLD]:'#e0b79e',[DUSK]:'#8e708b',[NIGHT]:'#243749',[DAWN]:'#b6abb7'});
    neon('LED_SOFT','#f7f4df','#dce9ed',.28);
    neon('OFFICE','#b9d7df','#93c9df',.12);
    neon('FLOOD','#eac68c','#e6ae70',.18);
    neon('GOLD_SIGN','#f5d998','#e3bd68',.2);
    neon('LAMP_POOL','#565a52','#e8c88a',.04);
  };
  const grade = [
    ([r, g, b]) => [r, g, b],
    ([r, g, b]) => [r * 1.02 + .03, g * .85 + .02, b * .72],
    ([r, g, b]) => [r * .57 + .035, g * .51 + .025, b * .61 + .04],
    ([r, g, b]) => [r * .22 + .025, g * .26 + .03, b * .36 + .045],
    ([r, g, b]) => [r * .73 + .04, g * .7 + .03, b * .77 + .04],
  ];
  const line = (x0, y0, x1, y1, cb) => {
    const dx = Math.abs(x1 - x0), dy = -Math.abs(y1 - y0);
    const sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1;
    let err = dx + dy;
    for (;;) {
      cb(x0, y0);
      if (x0 === x1 && y0 === y1) break;
      const e2 = err * 2;
      if (e2 >= dy) { err += dy; x0 += sx; }
      if (e2 <= dx) { err += dx; y0 += sy; }
    }
  };
  const tree = (w, cx, cy, rw, rh, r) => {
    for (let y = -rh; y <= rh; y++) {
      for (let x = -rw; x <= rw; x++) {
        const d = (x * x) / (rw * rw) + (y * y) / (rh * rh);
        if (d > 1 + (r() - 0.5) * 0.3) continue;
        const v = r();
        let m = M.TREE;
        if (y > rh * 0.2 || x > rw * 0.4) m = v < 0.7 ? M.TREE_D : M.TREE;
        else if (y < -rh * 0.25 && x < rw * 0.2) m = v < 0.55 ? M.TREE_L : M.TREE;
        else if (v < 0.3) m = M.TREE_D;
        w.px(cx + x, cy + y, m);
      }
    }
  };

  const smoothSky = (w, key, ctx) => {
    const stops = SKY[key].map(ctx.rgb);
    const end = PAD_Y + 106;
    const at = (y) => {
      const p = clamp(Math.pow(clamp(y, 0, BH) / end, 1.25)) * 3.999;
      const lo = Math.floor(p);
      return stops[lo].map((v, i) => mix(v, stops[lo + 1][i], p - lo));
    };
    for (let y = 0; y < BH; y++) {
      w.skyLo[key][y] = ctx.pack(at(y));
      w.skyHi[key][y] = ctx.pack(at(y + 4));
    }
  };

  const drawSky = (w, dt, hour) => {
    const h = hour;
    if (h < 18.4) {
      const t = clamp((h - 12) / (18.1 - 12));
      const low = smooth(15.6, 17.4, h);
      w.sun(mix(118, 8, t), mix(16, 58, t * t * t), low > 0.3 ? 6 : 5, low);
    } else if (h > 29.2) {
      const t = clamp((h - 29.2) / (36 - 29.2));
      const low = 1 - smooth(30.2, 31.8, h);
      w.sun(mix(304, 118, t), mix(82, 16, Math.sqrt(t)), low > 0.3 ? 6 : 5, low);
    }
    if (h > 18.6 && h < 29.4) w.moon(mix(96, 142, (h - 18.6) / 10.8), mix(30, 18, Math.sin(((h - 18.6) / 10.8) * Math.PI)));
    for (const c of w.strata) {
      c.x += c.v * dt;
      if (c.x > 370) c.x = -c.w - 40;
      const cx = Math.round(c.x);
      for (let i = 0; i < c.w; i++) {
        const edge = Math.min(i, c.w - i);
        const thick = Math.round(Math.min(edge * 0.12, 1.5) + Math.sin(i * 0.17 + c.w) * 0.8 + 0.5);
        for (let j = -thick; j <= 0; j++) {
          if ((i + j * 3 + c.y) % 5 === 0 && edge < 18) continue;
          w.pxSky(cx + i, c.y + j, j === 0 ? M.CLOUD_SH : M.CLOUD);
        }
      }
    }
  };

  const drawSquare = (w) => {
    // Large pale paving slabs, with a darker granite band across the pedestrian square.
    for (let y = 112; y < 150; y++) for (let x = -40; x < 360; x++) {
      const joint = y % 5 === 0 || (x + (Math.floor(y / 5) % 2) * 6) % 12 === 0;
      w.px(x, y, joint ? M.PAVE_D : M.PAVE);
    }
    w.rect(-40, 135, 400, 2, M.STONE_D);
    w.rect(-40, 137, 400, 1, M.PAVE_D);
  };

  const drawCarnall = (w) => {
    w.rect(15, 87, 72, 31, M.BRICK);
    w.rect(13, 84, 76, 3, M.ROOF);
    for(let y=89;y<117;y+=3)for(let x=16;x<86;x++)if((x+y)%7)w.px(x,y,M.BRICK_D);
    for(const x of [21,34,47,60,73]){
      w.rect(x,91,7,8,M.WINDOW);w.lightRect(x+1,92,5,6,N.WARM,w.venueG);
    }
    w.hsign(18,101,64,10,'CARNALL',{font:5,n:N.LED_SOFT,g:w.venueG,board:M.ROOF,off:M.TRIM});
    w.rect(44,112,13,6,M.WINDOW);w.lightRect(45,112,11,6,N.WARM,w.venueG);
    // A preserved visitor headframe, not a smoking working colliery.
    for(const [ax,bx] of [[29,22],[53,67]])line(ax,47,bx,87,(x,y)=>{w.px(x,y,M.STEEL);w.px(x+1,y,M.STEEL_D);});
    for(let y=47;y<87;y+=10){
      const left=29-Math.round((y-47)*.17),right=54+Math.round((y-47)*.32);
      line(left,y,right,y+10,(x,py)=>w.px(x,py,M.STEEL_D));
      line(right,y,left,y+10,(x,py)=>w.px(x,py,M.STEEL_D));
      w.rect(left,y,right-left,1,M.STEEL);
    }
    w.rect(23,47,38,3,M.STEEL);w.rect(23,44,38,1,M.STEEL_D);
    for(let x=23;x<62;x+=5)w.rect(x,43,1,4,M.STEEL_D);
    const cx=40,cy=35;
    for(let a=0;a<Math.PI*2;a+=.08){
      w.px(cx+Math.round(Math.cos(a)*11),cy+Math.round(Math.sin(a)*11),M.WHEEL);
      w.px(cx+Math.round(Math.cos(a)*9),cy+Math.round(Math.sin(a)*9),M.WHEEL_D);
    }
    for(let a=0;a<Math.PI*2;a+=Math.PI/4)line(cx,cy,cx+Math.round(Math.cos(a)*10),cy+Math.round(Math.sin(a)*10),(x,y)=>w.px(x,y,M.WHEEL_D));
    line(cx,cy,31,47,(x,y)=>w.px(x,y,M.STEEL_D));line(cx,cy,50,47,(x,y)=>w.px(x,y,M.STEEL_D));
  };
  const drawCarboneum = (w) => {
    const cx=133;
    // The glazed modern lift annex stands separately beside the restored brick tower.
    w.rect(168,48,17,70,M.LIFT_GLASS);w.rect(168,47,17,2,M.STEEL);
    for(let y=51;y<117;y+=7)w.rect(168,y,17,1,M.STEEL_D);
    for(const x of [169,176,183])w.rect(x,49,1,68,M.STEEL_D);
    w.lightRect(170,110,12,6,N.OFFICE,w.venueG);
    // Open supports, central core and the metal balcony ring are essential to this silhouette.
    w.rect(128,60,11,34,M.BRICK_D);
    for(const x of [106,118,149,159])w.rect(x,60,5,36,M.BRICK);
    w.rect(108,78,54,1,M.STEEL);w.rect(107,83,56,1,M.STEEL_D);
    for(let x=109;x<162;x+=4)w.rect(x,78,1,6,M.STEEL_D);
    for(const x of [109,152])w.lightRect(x,65,2,11,N.FLOOD,w.venueG);
    // Polygonal brick base with daylight windows and a visitor entrance.
    w.rect(106,94,57,24,M.BRICK);w.rect(157,94,6,24,M.BRICK_D);
    w.rect(104,92,61,3,M.ROOF);
    for(const x of [110,121,133,145,156]){
      w.rect(x,96,4,5,M.WINDOW);w.lightRect(x,97,4,3,N.WARM,w.venueG);
      w.rect(x,112,4,6,M.WINDOW);w.lightRect(x,113,4,5,N.WARM,w.venueG);
    }
    w.hsign(105,102,59,10,'CARBONEUM',{font:5,n:N.LED_SOFT,g:w.venueG,board:M.ROOF,off:M.TRIM});
    // Broad dark tank enclosure, sloping shoulders and the little domed lantern.
    for(let y=35;y<62;y++){
      const half=23+Math.floor((y-35)*.4);
      for(let x=-half;x<=half;x++)w.px(cx+x,y,x>17?M.ROOF_D:x<-14?M.ROOF_L:M.ROOF);
    }
    for(let y=23;y<35;y++){
      const half=5+Math.round((y-23)*1.65);
      w.rect(cx-half,y,half*2+1,1,M.ROOF);
      w.px(cx-half,y,M.ROOF_L);
    }
    w.rect(cx-8,18,17,6,M.ROOF_D);w.rect(cx-5,15,11,4,M.ROOF);
    w.rect(cx-2,13,5,3,M.ROOF_D);
    for(const x of [cx-4,cx,cx+4])w.tube(x,20,M.WINDOW,N.WARM_DIM,w.venueG);
    w.rect(cx-8,39,9,7,M.TRIM);w.rect(cx-7,40,7,5,M.WINDOW_H);w.rect(cx-4,40,1,5,M.STEEL_D);
    w.rect(cx-34,62,68,2,M.ROOF_L);
  };
  const drawDmit = (w) => {
    w.rect(189,94,47,24,M.PALE);
    w.rect(197,82,31,12,M.PALE_D);
    for(let i=0;i<6;i++)w.rect(196+i,83+i,1,11-i,M.PALE);
    for(let x=200;x<226;x+=6)w.rect(x,85,3,7,M.WINDOW);
    w.hsign(198,94,29,10,'DMIT',{font:5,n:N.GOLD_SIGN,g:w.venueG,board:M.PALE,off:M.GOLD});
    for(let x=191;x<230;x+=8){w.rect(x,107,6,10,M.WINDOW);w.lightRect(x+1,108,4,8,N.WARM,w.venueG);}
    w.rect(187,118,51,1,M.STONE_D);
  };
  const drawArena = (w) => {
    // The verified ribbed exterior is shown without asserting a future stand configuration.
    for(let dx=0;dx<69;dx++){
      const edge=Math.min(dx,68-dx),inset=Math.max(0,7-Math.floor(edge/3));
      const top=83+inset,bottom=115-inset;
      w.rect(242+dx,top,1,bottom-top,M.ARENA_GLASS);
      w.px(242+dx,top,M.TRIM);w.px(242+dx,bottom,M.STEEL);
      if(dx%7<2)w.lightRect(242+dx,top+4,1,Math.max(1,bottom-top-9),N.WARM,w.arenaG);
    }
    for(let x=247;x<304;x+=8){
      w.rect(x,87,1,25,M.STEEL);
      line(x,86,Math.min(x+8,305),112,(px,y)=>w.px(px,y,M.STEEL_D));
      line(x,112,Math.min(x+8,305),86,(px,y)=>w.px(px,y,M.STEEL_D));
    }
    w.rect(241,115,71,3,M.PALE_D);
    w.hsign(257,98,39,10,'ARENA',{font:5,n:N.LED_SOFT,g:w.arenaG,board:M.STEEL_D,off:M.TRIM});
    w.rect(250,118,53,2,M.STONE);w.rect(246,120,61,1,M.STONE_D);
  };
  const build=(w,ctx)=>{
    M=ctx.M;N=ctx.N;
    for(let key=NOON;key<=DAWN;key++)smoothSky(w,key,ctx);
    w.noSignal=true;w.walkTop=118;w.roadTop=140;
    w.venueG=w.addGroup(17.8,30,'room');w.arenaG=w.addGroup(18.2,25,'room');w.lampG=w.addGroup(17.6,30.4,'neon',{soft:true});
    w.depth=0;for(let x=-40;x<360;x+=19)w.rect(x,96+Math.abs(x%8),18,22,M.FAR1);
    w.depth=2;drawSquare(w);drawDmit(w);drawCarnall(w);drawCarboneum(w);drawArena(w);
    for(const x of [-15,186,316,349]){w.rect(x,109,1,16,M.TIMBER_D);tree(w,x,104,6,9,rng(x+400));w.rect(x-5,123,11,3,M.PLANTER);}
    // Lantern lamps in the gaps between buildings, each with a pool of light on the paving.
    for(const x of [92,239]){
      w.rect(x,101,1,25,M.STEEL);w.rect(x-1,125,3,1,M.STEEL_D);
      w.rect(x-2,97,5,1,M.STEEL_D);w.rect(x-1,98,3,3,M.TRIM);w.lightRect(x-1,98,3,3,N.LED_SOFT,w.lampG);
      for(let dy=0;dy<3;dy++)for(let dx=-6+dy*2;dx<=6-dy*2;dx++)if(Math.abs(dx)<4-dy||(dx+dy)%2===0)w.light(x+dx,126+dy,N.LAMP_POOL,w.lampG);
    }
    w.strata=[{x:-20,y:7,w:65,v:.4},{x:215,y:19,w:70,v:.5}];
    w.cat.x=202;w.cat.y=129;
    for(const [x,y,dir,speed,style] of [[24,125,1,5,'coat'],[88,128,-1,4,'shirt'],[143,124,1,5,'coat'],[235,127,-1,5,'suit'],[298,125,1,4,'shirt']])w.peds.push({x,y,dir,speed,style,phase:x%3});
    w.personStyles.coat=[M.TREE_D,M.SUIT,M.HAIR];
  };
  const draw=(w,dt,hour)=>{
    drawSky(w,dt,hour);
    // Visitors ride the modern glass lift; the heritage headframe remains still.
    const y=63+Math.round((Math.sin(w.t*.3)+1)*22);
    w.rect(170,y,12,7,M.LIFT_CAB);w.rect(171,y+1,10,5,M.WINDOW_H);
    w.lightRect(172,y+2,8,3,N.OFFICE,w.venueG);
    w.drawPeople(dt,hour);w.drawCat(dt,hour);
    // The cycle lane runs along the granite band, where the curved ends still show the whole bike.
    const bx=Math.round((w.t*12+20)%420)-50,by=137;
    for(const cx of [bx,bx+12])for(let a=0;a<Math.PI*2;a+=.3)w.px(cx+Math.round(Math.cos(a)*3),by+Math.round(Math.sin(a)*3),M.STEEL_D);
    for(const [x0,y0,x1,y1] of [[0,0,5,-5],[5,-5,8,0],[8,0,0,0],[5,-5,10,-5],[10,-5,12,0]])line(bx+x0,by+y0,bx+x1,by+y1,(x,py)=>w.px(x,py,M.BRICK));
    w.rect(bx+5,by-13,3,3,M.SKIN);w.rect(bx+4,by-10,4,5,M.TREE_D);
    line(bx+5,by-5,bx+6+Math.floor(w.t*5)%2*2,by-1,(x,py)=>w.px(x,py,M.SUIT));
    line(bx+7,by-8,bx+10,by-6,(x,py)=>w.px(x,py,M.SKIN));
  };
  CitySwitch.define('zabrze-switch',{
    city:'Zabrze',label:'Zabrze day and night',tube:['#e5b66f','#76c6cf'],body:['#e8e6dc','#14212a'],glass:'clear',
    sky:SKY,grade,palette,build,draw,
    glyphs:{W:['#...#','#...#','#.#.#','#.#.#','.#.#.']},
    street:(M)=>[M.PAVE,M.PAVE_D,M.STONE,M.STONE_D],
    weather:(h)=>({wet:.25*smooth(18.5,20,h)*(1-smooth(29,31,h))}),
    post:(w)=>w.reflect(),startle:(w)=>{w.cat.puff=1.4;},
  });
})();
