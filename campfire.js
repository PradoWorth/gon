

  // ================================================================
  //  CAMPFIRE SCENE: canvas pixel art animation
  //  Gon = replica exata do avatar principal (mesma grade, mesmos raios,
  //  mesmo pulse, mesmo blink). Em pe, parado, segurando graveto.
  // ================================================================
  function initCampfireInstance(canvasId){
    var cv=document.getElementById(canvasId);
    if(!cv) return;
    var c=cv.getContext('2d');
    c.imageSmoothingEnabled=false;
    var W=128,H=96;
    cv.width=W; cv.height=H;

    /* ---------- palette ---------- */
    var sk='#D97757',sk2='#c4654a',sk3='#b05540',
        ey='#1a1410',
        st='#6b4226',st2='#4d2e18',st3='#8a5a3a',
        ma='#f0e6d0',ma2='#d8cbb0',mat='#b08040',
        lg='#5b3a2a',lg2='#3d2419',lg3='#7a4a30',lg4='#8b5535',
        f0='#8b2010',f1='#c05030',f2='#D97757',f3='#e89440',f4='#ffc040',f5='#ffe888',f6='#fff4d0',
        em1='#ff6820',em2='#c04010',em3='#801800',
        gr1='#2a3818',gr2='#3a4a22',gr3='#2e4018',
        tw1='#5a3820',tw2='#3a2410';

    var t=0, sparks=[], hParts=[];
    var PI2=Math.PI*2;
    var reducedMotion=window.matchMedia&&window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    /* ---- MOUSE HOVER: faíscas extras ao passar o mouse pelo fogo ---- */
    var mouse={x:-999,y:-999,active:false};
    var fireHoverCx=86, fireHoverCy=56, fireHoverR=24; /* área aproximada das chamas, no espaço interno de desenho */
    function updateMouseFromEvent(e){
      var rect=cv.getBoundingClientRect();
      if(!rect.width||!rect.height) return;
      var scaleX=W/rect.width, scaleY=H/rect.height;
      var mx=(e.clientX-rect.left)*scaleX;
      var my=(e.clientY-rect.top)*scaleY+10; /* compensa o translate(0,-10) do render() */
      mouse.x=mx; mouse.y=my;
      var ddx=mx-fireHoverCx, ddy=my-fireHoverCy;
      mouse.active=(ddx*ddx+ddy*ddy)<(fireHoverR*fireHoverR);
    }
    cv.addEventListener('mousemove', updateMouseFromEvent);
    cv.addEventListener('mouseleave', function(){ mouse.active=false; });

    /* head particles */
    for(var i=0;i<8;i++) hParts.push(mkHP());
    function mkHP(){return{
      ox:(Math.random()-.5)*20,oy:(Math.random()-.5)*16-4,
      ph:Math.random()*PI2,sp:.008+Math.random()*.014,
      ax:1.5+Math.random()*2.5,ay:1+Math.random()*1.8,
      sz:Math.random()>.35?2:1,dk:Math.random()>.5,
      life:180+Math.random()*260|0,age:Math.random()*100|0
    };}

    function R(x,y,w,h,col){c.fillStyle=col;c.fillRect(x|0,y|0,w,h);}

    /*
     * Avatar grid: original SVG = 102x102 viewport, 6px cells = 17x17 game-pixel grid.
     * Canvas uses P=2 canvas-px per game-pixel => avatar bbox = 34x34 cpx.
     */
    var P=2;

    /* ---- pulse helpers (reproduce the CSS keyframes exactly) ---- */
    function tipPulse(delay){
      var phase=(t/60*PI2/1.7)+delay/1.7*PI2;
      var v=.5+.5*Math.sin(phase-Math.PI/2);
      return{s:.4+.6*v, a:.25+.75*v};
    }
    function segPulse(delay){
      var phase=(t/60*PI2/1.7)+delay/1.7*PI2;
      var v=.5+.5*Math.sin(phase-Math.PI/2);
      return{s:.8+.2*v, a:.6+.4*v};
    }
    function diagPulse(delay){
      var phase=(t/60*PI2/2.3)+delay/2.3*PI2;
      var v=.5+.5*Math.sin(phase-Math.PI/2);
      return{s:.5+.5*v, a:.15+.75*v};
    }

    /* draw pulsing square: center cx,cy -- full size sz -- scale s -- opacity a */
    function RPulse(cx,cy,sz,s,a,col){
      var half=sz*s/2;
      c.globalAlpha=a;
      c.fillStyle=col;
      c.fillRect(Math.round(cx-half),Math.round(cy-half),Math.ceil(sz*s),Math.ceil(sz*s));
      c.globalAlpha=1;
    }

    /* ---- GON (exact original avatar, standing still) ---- */
    function drawGon(){
      var gx=16, gy=42; /* top-left of 17-gp bounding box */

      /* octagonal core body (5 rows, matching SVG rects exactly) */
      R(gx+7*P, gy+6*P, 3*P, P, sk);   /* row 6: 3 wide */
      R(gx+6*P, gy+7*P, 5*P, P, sk);   /* row 7: 5 wide */
      R(gx+5*P, gy+8*P, 7*P, P, sk);   /* row 8: 7 wide (widest) */
      R(gx+6*P, gy+9*P, 5*P, P, sk);   /* row 9: 5 wide */
      R(gx+7*P, gy+10*P, 3*P, P, sk);  /* row10: 3 wide */

      /* eyes (1gp x 1.5gp each => 2cpx x 3cpx) */
      var blinkCycle=(t/60)%5.4;
      var eyeH=3;
      if(blinkCycle>4.97&&blinkCycle<5.13) eyeH=1;
      R(gx+7*P, gy+7*P+1, P, eyeH, ey);
      R(gx+9*P, gy+7*P+1, P, eyeH, ey);

      /* N ray: segB + tipA */
      var nS=segPulse(0), nT=tipPulse(0);
      RPulse(gx+8*P+1, gy+5*P+1, P, nS.s, nS.a, sk);
      RPulse(gx+8*P+1, gy+3.5*P+1, P, nT.s, nT.a, sk);

      /* W ray: segB + tipA */
      var wS=segPulse(1.27), wT=tipPulse(1.27);
      RPulse(gx+4*P+1, gy+8*P+1, P, wS.s, wS.a, sk);
      RPulse(gx+2.5*P+1, gy+8*P+1, P, wT.s, wT.a, sk);

      /* E ray: segB + tipA */
      var eS=segPulse(.42), eT=tipPulse(.42);
      RPulse(gx+12*P+1, gy+8*P+1, P, eS.s, eS.a, sk);
      RPulse(gx+13.5*P+1, gy+8*P+1, P, eT.s, eT.a, sk);

      /* diagonal sparks - inner ring (d1-d4) */
      var dD=[0,.6,1.1,1.7];
      var dP=[[5.5,5.5],[10.5,5.5],[10.5,10.5],[5.5,10.5]];
      for(var i=0;i<4;i++){
        var dp=diagPulse(dD[i]);
        RPulse(gx+dP[i][0]*P+1, gy+dP[i][1]*P+1, P, dp.s, dp.a, sk);
      }
      /* diagonal sparks - outer ring (d5-d8) */
      var dD2=[.3,.9,1.4,2.0];
      var dP2=[[4,4],[12,4],[12,12],[4,12]];
      for(var i=0;i<4;i++){
        var dp=diagPulse(dD2[i]);
        RPulse(gx+dP2[i][0]*P+1, gy+dP2[i][1]*P+1, P, dp.s, dp.a, sk);
      }

      /* legs (standing still, straight down) */
      R(gx+7*P, gy+11*P, P, 2*P, sk);   /* left leg */
      R(gx+6*P, gy+13*P, 2*P, P, sk);   /* left foot */
      R(gx+9*P, gy+11*P, P, 2*P, sk);   /* right leg */
      R(gx+9*P, gy+13*P, 2*P, P, sk);   /* right foot */

      /* arm (right side, extending toward stick) */
      R(gx+11*P, gy+8*P+1, 3, P, sk);
    }

    /* ---- STICK + MARSHMALLOW ---- */
    function drawStick(){
      var sx=41, sy=59;
      var armTilt=Math.sin(t*.01)*.5;
      var at=Math.round(armTilt);
      for(var i=0;i<30;i++){
        var px=sx+i;
        var py=sy+Math.round(i*.25)+at;
        R(px,py,1,1,i<10?st2:st);
        if(i%6===0) R(px,py+1,1,1,st2);
      }
      var mx=sx+29, my=sy+Math.round(29*.25)+at;
      R(mx-1,my-2,4,5,ma);
      R(mx,my-1,2,3,ma2);
      var tf=Math.sin(t*.018);
      if(tf>0) R(mx+2,my-1,1,3,mat);
      else R(mx-1,my-1,1,3,mat);
    }

    /* ---- GROUND ---- */
    var grassPos=[[8,80],[14,81],[22,82],[38,81],[52,82],[90,81],[98,82],[106,80],[84,82],[46,80],[64,81],[76,82],[112,81]];
    function drawGrass(){
      for(var i=0;i<grassPos.length;i++){
        var gx=grassPos[i][0],gy=grassPos[i][1];
        var sw=Math.round(Math.sin(t*.018+i*2.3)*.7);
        var col=i%3===0?gr3:i%2?gr1:gr2;
        R(gx+sw,gy-3,1,3,col);
        R(gx+1+sw,gy-2,1,2,col);
        if(i%2===0) R(gx-1+sw,gy-2,1,2,gr1);
      }
    }
    function drawTwigs(){
      R(30,82,1,1,tw1);R(31,83,1,1,tw2);R(32,82,1,1,tw1);
      R(30,83,1,1,tw2);R(32,83,1,1,tw2);
      R(58,83,2,1,tw1);R(59,82,1,1,tw2);R(60,83,1,1,tw1);
      R(100,83,1,1,tw1);R(101,82,1,1,tw2);R(102,83,1,1,tw1);
    }

    /* ---- FIRE LOGS ---- */
    function drawLogs(){
      var fx=86,fy=74;
      for(var i=0;i<18;i++){
        var x=fx-9+i,y=fy-2+Math.round((i-9)*.35);
        R(x,y,2,2,i>5&&i<13?lg3:lg);
        if(i%3===0) R(x,y+2,2,1,lg2);
      }
      for(var i=0;i<18;i++){
        var x=fx-8+i,y=fy+2-Math.round((i-9)*.35);
        R(x,y,2,2,i>5&&i<13?lg4:lg);
        if(i%3===1) R(x,y+2,2,1,lg2);
      }
      R(fx-4,fy-3,10,2,em2);
      R(fx-3,fy-4,8,1,em3);
      var ep=Math.sin(t*.07)*.3+.7;
      c.globalAlpha=ep;
      R(fx-2,fy-3,6,1,em1);
      c.globalAlpha=1;
    }

    /* ---- FIRE FLAMES ---- */
    function drawFire(){
      var fx=86,fy=70;
      var ft=t*.055;
      for(var dx=-7;dx<=7;dx++){
        var x=fx+dx,ad=Math.abs(dx);
        var maxH=28-ad*2.8+Math.sin(ft*1.3+dx*.9)*3+Math.sin(ft*.6+dx*1.7)*2;
        if(maxH<2) continue;
        maxH=maxH|0;
        for(var dy=0;dy<maxH;dy++){
          var r=dy/maxH;
          var sway=Math.round(Math.sin(ft*1.1+dy*.35+dx*.25)*1.4);
          var col;
          if(r<.12)col=f0;else if(r<.25)col=f1;else if(r<.4)col=f2;
          else if(r<.55)col=f3;else if(r<.7)col=f4;else if(r<.85)col=f5;else col=f6;
          R(x+sway,fy-dy,1,1,col);
        }
      }
      for(var dx=-3;dx<=3;dx++){
        var x=fx+dx,ad=Math.abs(dx);
        var maxH=20-ad*4+Math.sin(ft*1.05+dx+2)*2.5;
        if(maxH<2) continue;
        maxH=maxH|0;
        for(var dy=4;dy<maxH;dy++){
          var sway=Math.round(Math.sin(ft*1.3+dy*.4)*1);
          R(x+sway,fy-dy,1,1,dy>maxH-4?f6:dy>maxH-8?f5:f4);
        }
      }
    }

    /* ---- SPARKS ---- */
    function updateSparks(){
      if(!reducedMotion&&Math.random()<.18){
        sparks.push({x:82+Math.random()*8,y:48+Math.random()*6,
          vx:(Math.random()-.5)*.35,vy:-.15-Math.random()*.35,
          life:50+Math.random()*70|0,age:0,bright:Math.random()>.35,sz:1});
      }
      if(!reducedMotion&&mouse.active){
        var hoverCount=Math.random()<.55?2:1;
        for(var k=0;k<hoverCount;k++){
          sparks.push({x:fireHoverCx+(Math.random()-.5)*7,y:fireHoverCy-2+(Math.random()-.5)*8,
            vx:(Math.random()-.5)*.4,vy:-.3-Math.random()*.5,
            life:18+Math.random()*26|0,age:0,bright:Math.random()>.25,sz:.45+Math.random()*.3});
        }
      }
      for(var i=sparks.length-1;i>=0;i--){
        var s=sparks[i];
        s.x+=s.vx;s.y+=s.vy;s.age++;
        if(s.age>=s.life){sparks.splice(i,1);continue;}
        if((1-s.age/s.life)<.25&&Math.random()>.5) continue;
        R(s.x,s.y,s.sz,s.sz,s.bright?f4:f2);
      }
    }

    /* ---- HEAD PARTICLES ---- */
    function updateHP(){
      var cx=16+8.5*P, cy=42+6*P;
      for(var i=0;i<hParts.length;i++){
        var p=hParts[i];
        p.age++;
        if(p.age>=p.life){hParts[i]=mkHP();hParts[i].age=0;continue;}
        if((1-p.age/p.life)<.15&&Math.random()>.5) continue;
        var px=cx+p.ox+Math.sin(p.ph+t*p.sp)*p.ax;
        var py=cy+p.oy+Math.cos(p.ph+t*p.sp*.7)*p.ay;
        R(px,py,p.sz,p.sz,p.dk?sk3:sk);
      }
    }

    /* ---- GLOW ---- */
    function drawGlow(){
      var fx=86,fy=58;
      var pulse=.07+Math.sin(t*.04)*.025;
      var grd=c.createRadialGradient(fx,fy,3,fx,fy,44);
      grd.addColorStop(0,'rgba(255,160,60,'+pulse+')');
      grd.addColorStop(.5,'rgba(217,119,87,'+(pulse*.4)+')');
      grd.addColorStop(1,'rgba(217,119,87,0)');
      c.fillStyle=grd;
      c.fillRect(0,0,W,H);
    }

    /* ---- RENDER LOOP ---- */
    function render(){
      c.clearRect(0,0,W,H);
      t++;
      c.save();
      c.translate(0,-10); /* sobe a cena inteira um pouco dentro do canvas */
      drawGrass();
      drawTwigs();
      drawLogs();
      drawGon();
      drawStick();
      drawFire();
      updateSparks();
      updateHP();
      drawGlow();
      c.restore();
      requestAnimationFrame(render);
    }

    var aboutEl=document.getElementById('pvAbout');
    if(aboutEl){
      var obs=new MutationObserver(function(muts){
        for(var i=0;i<muts.length;i++){
          if(!aboutEl.hidden){render();obs.disconnect();return;}
        }
      });
      obs.observe(aboutEl,{attributes:true,attributeFilter:['hidden']});
      if(!aboutEl.hidden) render();
    } else { render(); }
  }
  initCampfireInstance('gonCampfire');
  initCampfireInstance('gonCampfire2');

