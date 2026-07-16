  "use strict";

  // ================= i18n =================
  // Tudo que é exibido ao usuário passa por T('chave') ou pelas tabelas
  // reconstruídas em refreshI18n(). Trocar de idioma = repopular as tabelas
  // e re-renderizar, sem recarregar a página.
  var I18N = window.GonI18n;
  function T(k, v){ return I18N.t(k, v); }

  // tabelas montadas a partir do pacote de idioma ativo; refeitas em I18N.onChange
  function i18nModeNames(){
    return { pomodoro: T('ui.modePomodoro'), short: T('ui.modeShort'), long: T('ui.modeLong'), chrono: T('ui.modeChrono') };
  }
  function i18nPrioNames(){
    return { 3: T('ui.prioHigh'), 2: T('ui.prioMid'), 1: T('ui.prioLow') };
  }

  // ================= state =================
  var userName = '';
  var durations = { pomodoro: 25, short: 5, long: 15 };
  var waterIntervalMin = 20;
  var dropWaterY = 3; // topo do preenchimento do gotinha do cabeçalho (usado pela onda contínua)
  var waterGoalLiters = 2;
  var mlToday = 0;
  var waterLog = [];      // {id, ml, at}: histórico do dia, permite desfazer
  var waterSeq = 1;
  var tipLockUntil = 0;   // segura o texto da dica depois de um registro
  var waterDayKey = new Date().toDateString();
  var modeNames = i18nModeNames();

  // ================= cor de sessão =================
  // cada modo tem sua própria cor de destaque; ela substitui TODO o laranja
  // (--accent) do site assim que a pessoa entra nesse modo, inclusive a cor
  // padrão do avatar, que herda --avatar-color de --accent no :root.
  var SESSION_COLORS = { pomodoro: '#D97757', short: '#2E9A48', long: '#9370DB', chrono: '#2E7BD1' };
  /* cor mais escura de cada modo: tom mais profundo para o gradiente */
  var SESSION_COLORS_DARK = { pomodoro: '#C96B45', short: '#279147', long: '#8260CC', chrono: '#2673C8' };
  var currentAccentHex = SESSION_COLORS.pomodoro;
  // favicon: mesmo desenho de sempre (a faísca), só troca de cor por modo.
  // gerado via <canvas> -> PNG em vez de SVG cru: o Chrome (e às vezes o
  // Firefox) não repinta de forma confiável o ícone da aba quando o favicon
  // é um SVG trocado dinamicamente por JS. PNG funciona de forma consistente.
  // troca via <link> novo em vez de reaproveitar o antigo pelo mesmo motivo:
  // alguns navegadores só releem o ícone quando o NÓ do <link> é substituído.
  var faviconRects = [
    // corpo da faísca (cor do modo)
    [42,36,18,6],[36,42,30,6],[30,48,42,6],[36,54,30,6],[42,60,18,6],
    [48,30,6,6],[48,21,6,6],[24,48,6,6],[15,48,6,6],[72,48,6,6],[81,48,6,6],
    [33,33,6,6],[63,33,6,6],[63,63,6,6],[33,63,6,6],
    [24,24,6,6],[72,24,6,6],[72,72,6,6],[24,72,6,6]
  ];
  var faviconEyes = [ [42,45,6,9], [54,45,6,9] ]; // sempre escuros
  var faviconCanvas = null;
  var lastFaviconColor = null;
  function updateFavicon(hex){
    if (hex === lastFaviconColor) return;
    lastFaviconColor = hex;
    var N = 64, VB = 84, OX = 9, OY = 8, scale = N / VB;
    if (!faviconCanvas) faviconCanvas = document.createElement('canvas');
    faviconCanvas.width = N; faviconCanvas.height = N;
    var ctx = faviconCanvas.getContext('2d');
    ctx.clearRect(0, 0, N, N);
    ctx.imageSmoothingEnabled = false;
    function px(v){ return Math.round(v * scale); }
    function drawRects(list, color){
      ctx.fillStyle = color;
      for (var i = 0; i < list.length; i++){
        var r = list[i];
        var x = px(r[0] - OX), y = px(r[1] - OY);
        var w = Math.max(1, px(r[0] - OX + r[2]) - x);
        var h = Math.max(1, px(r[1] - OY + r[3]) - y);
        ctx.fillRect(x, y, w, h);
      }
    }
    drawRects(faviconRects, hex);
    drawRects(faviconEyes, '#121212');
    var href = faviconCanvas.toDataURL('image/png');
    var old = document.getElementById('faviconLink');
    var link = document.createElement('link');
    link.rel = 'icon';
    link.type = 'image/png';
    link.id = 'faviconLink';
    link.href = href;
    if (old && old.parentNode) old.parentNode.replaceChild(link, old);
    else document.head.appendChild(link);
  }
  function applySessionColor(mode){
    currentAccentHex = SESSION_COLORS[mode] || SESSION_COLORS.pomodoro;
    document.documentElement.style.setProperty('--accent', currentAccentHex);
    updateFavicon(currentAccentHex);
    /* degradê sutil nos botões e elementos com fundo sólido */
    var light = SESSION_COLORS[mode] || SESSION_COLORS.pomodoro;
    var dark  = SESSION_COLORS_DARK[mode] || SESSION_COLORS_DARK.pomodoro;
    var gradient = 'linear-gradient(135deg, ' + light + ' 0%, ' + dark + ' 100%)';
    document.documentElement.style.setProperty('--accent-gradient', gradient);
    /* --accent-dark: usada pelo gradiente SVG do logo GON */
    document.documentElement.style.setProperty('--accent-dark', dark);
  }
  applySessionColor('pomodoro'); // favicon já nasce gerado via canvas/PNG, no modo inicial

  var state = {
    mode: 'pomodoro',
    remaining: durations.pomodoro * 60,
    total: durations.pomodoro * 60,
    running: false,
    timerId: null,
    cyclesCompleted: 0,
    streak: 0,
    leftDuringFocus: false,
    hiddenAt: 0
  };

  var tasks = [];        // {id, text, done}
  var taskSeq = 1;
  var nextWaterAt = Date.now() + waterIntervalMin * 60000;
  var sleeping = false;
  var tempState = null;  // 'drinking' | 'proud'
  var dragState = null;  // 'held' | 'falling': tem prioridade sobre tudo
  var tempTimer = null;
  var lastActive = Date.now();
  var notifAsked = false;

  // ================= dom =================
  var $ = function(id){ return document.getElementById(id); };

  // ---- tema claro/escuro ----
  var THEME_KEY = 'gon.theme';
  var themeBtn = $('themeBtn'), themeIconSun = $('themeIconSun'), themeIconMoon = $('themeIconMoon');
  function applyTheme(theme){
    var isLight = theme === 'light';
    if (isLight) document.documentElement.setAttribute('data-theme', 'light');
    else document.documentElement.removeAttribute('data-theme');
    themeIconSun.hidden = !isLight;
    themeIconMoon.hidden = isLight;
    var label = isLight ? T('ui.themeToDark') : T('ui.themeToLight');
    themeBtn.setAttribute('aria-label', label);
    themeBtn.title = label;
  }
  applyTheme(document.documentElement.getAttribute('data-theme') === 'light' ? 'light' : 'dark');
  themeBtn.addEventListener('click', function(){
    var next = document.documentElement.getAttribute('data-theme') === 'light' ? 'dark' : 'light';
    applyTheme(next);
    try { localStorage.setItem(THEME_KEY, next); } catch(e){}
  });
  var timeDisplay = $('timeDisplay'), modeLabel = $('modeLabel'), ring = $('ring');
  var taskNow = $('taskNow');
  var startBtn = $('startBtn'), resetBtn = $('resetBtn'), skipBtn = $('skipBtn');
  var dotsWrap = $('dots');
  var tabs = document.querySelectorAll('.tab');
  var cardEl = document.querySelector('.card');
  var tabsEl = document.querySelector('.tabs');
  var clockTime = $('clockTime'), clockDate = $('clockDate');
  var inputName = $('inputName');
  var settingsBtn = $('settingsBtn'), settingsOverlay = $('settingsOverlay');
  var cancelBtn = $('cancelBtn'), saveBtn = $('saveBtn');
  var inputPomodoro = $('inputPomodoro'), inputShort = $('inputShort'), inputLong = $('inputLong'), inputWater = $('inputWater');
  var waterGoalSelect = $('waterGoalSelect'), wgOpts = document.querySelectorAll('#waterGoalSelect .wg-opt');
  var nameOverlay = $('nameOverlay'), nameInput = $('nameInput'), nameSubmit = $('nameSubmit');
  var introOverlay = $('introOverlay'), introGreet = $('introGreet'), introStoryBtn = $('introStoryBtn');
  var avatarLayer = $('avatarLayer'), avatarHolder = $('avatarHolder'), avatarFlip = $('avatarFlip');
  var bubble = $('bubble'), confettiContainer = $('confetti');
  var hydration = $('hydration'), hydroTip = $('hydroTip'), waterFill = $('waterFill'), hydroCount = $('hydroCount');
  var hydroPopover = $('hydroPopover'), hydroOpts = document.querySelectorAll('.hydro-opt');
  var hydroTank = $('hydroTank'), hydroTankFill = $('hydroTankFill'), hydroTankLabel = $('hydroTankLabel'), hydroTankLabelValue = $('hydroTankLabelValue'), hydroTankLabelPct = $('hydroTankLabelPct'), hydroTankGoal = $('hydroTankGoal');

  /* ================= onda fluida do tanque de hidratação =================
     Mesma técnica de "onda-do-mar": várias camadas de senoides somadas,
     desenhadas em <canvas> e animadas quadro a quadro (em vez do recorte
     em degraus/pixel art de antes), com uma linha de espuma na crista.
     Detecta sozinho se o tanque está em pé (desktop) ou deitado como
     barra (mobile) e desenha a crista do lado certo em cada caso. */
  (function initHydroWave(){
    var canvas = document.getElementById('hydroWaveCanvas');
    if (!canvas || !hydroTankFill) return;
    var ctx = canvas.getContext('2d');
    var w = 0, h = 0, horizontal = false;
    var dpr = Math.min(window.devicePixelRatio || 1, 2);

    function resize(){
      var r = hydroTankFill.getBoundingClientRect();
      w = Math.max(1, Math.round(r.width));
      h = Math.max(1, Math.round(r.height));
      canvas.width = w * dpr;
      canvas.height = h * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      // a orientação (crista em cima vs crista do lado) tem que vir do
      // formato do TANQUE (fixo), não do preenchimento: o preenchimento
      // fica bem fininho quando tem pouca água e isso enganava a conta,
      // fazendo achar que era o formato "barra deitada" do celular.
      var tr = hydroTank.getBoundingClientRect();
      horizontal = tr.width > tr.height;
    }
    if (window.ResizeObserver){
      new ResizeObserver(resize).observe(hydroTankFill);
    } else {
      window.addEventListener('resize', resize);
    }
    resize();

    // camadas: da mais distante da crista (topo/fundo, sutil) até a mais
    // próxima (crista real, mais brilhante e com espuma)
    var layers = [
      { depthFrac: 0.62, amp: 4.5, freq: 0.055, speed: 1.05, color: 'rgba(58,120,190,0.45)', foam: 0 },
      { depthFrac: 0.30, amp: 3.4, freq: 0.075, speed: 1.5,  color: 'rgba(74,144,217,0.55)', foam: 0 },
      { depthFrac: 0.0,  amp: 2.4, freq: 0.10,  speed: 1.9,  color: null,                     foam: 0.55 }
    ];

    var reduced = false;
    try { reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches; } catch(e){}

    var t = 0;
    function waveOffset(pos, layer, tt){
      return Math.sin(pos * layer.freq + tt * layer.speed) * layer.amp
           + Math.sin(pos * layer.freq * 2.2 - tt * layer.speed * 1.4) * layer.amp * 0.4;
    }

    /* ---- espuminha no rastro do dedo/mouse ---- */
    var foams = [];
    var lastPX = null, lastPY = null;

    function spawnFoamAt(x, y){
      // borrachudas de espuma: um pouco menores que antes
      var count = 2 + Math.floor(Math.random() * 2);
      for (var i = 0; i < count; i++){
        foams.push({
          x: x + (Math.random() - 0.5) * 5,
          y: y + (Math.random() - 0.5) * 5,
          vx: (Math.random() - 0.5) * 0.25,
          vy: -0.12 - Math.random() * 0.2,
          r: 0.6 + Math.random() * 1,
          maxR: 1.3 + Math.random() * 1.3,
          age: 0,
          life: 22 + Math.floor(Math.random() * 14)
        });
      }
      // partículas pequenas: espalham mais rápido e mais longe, somem antes
      var specks = 3 + Math.floor(Math.random() * 3);
      for (var j = 0; j < specks; j++){
        var ang = Math.random() * Math.PI * 2;
        var speed = 0.15 + Math.random() * 0.35;
        foams.push({
          x: x,
          y: y,
          vx: Math.cos(ang) * speed,
          vy: Math.sin(ang) * speed - 0.15,
          r: 0.3 + Math.random() * 0.4,
          maxR: 0.5 + Math.random() * 0.5,
          age: 0,
          life: 12 + Math.floor(Math.random() * 10)
        });
      }
      if (foams.length > 180) foams.splice(0, foams.length - 180);
    }

    /* ---- vapor: sobe quando o Gon (que é uma chama) toca a água ---- */
    var steams = [];
    function spawnSteamAt(x, y){
      var count = 2 + Math.floor(Math.random() * 2);
      for (var i = 0; i < count; i++){
        steams.push({
          x: x + (Math.random() - 0.5) * 10,
          y: y + (Math.random() - 0.5) * 6,
          vx: (Math.random() - 0.5) * 0.35,
          vy: -0.45 - Math.random() * 0.5,
          r: 1.6 + Math.random() * 1.8,
          maxR: 5 + Math.random() * 5,
          age: 0,
          life: 40 + Math.floor(Math.random() * 26)
        });
      }
      if (steams.length > 140) steams.splice(0, steams.length - 140);
    }
    function drawSteam(){
      for (var i = steams.length - 1; i >= 0; i--){
        var f = steams[i];
        f.age++;
        if (f.age >= f.life){ steams.splice(i, 1); continue; }
        // vapor esfria e desacelera a subida, e balança de leve pros lados
        f.vy *= 0.985;
        f.x += f.vx + Math.sin(f.age * 0.15) * 0.15;
        f.y += f.vy;
        var p = f.age / f.life;
        var alpha = (1 - p) * 0.5;
        var rad = f.r + (f.maxR - f.r) * p;
        ctx.beginPath();
        ctx.fillStyle = 'rgba(255,255,255,' + alpha.toFixed(2) + ')';
        ctx.arc(f.x, f.y, rad, 0, Math.PI * 2);
        ctx.fill();
      }
    }


    function handlePointerMove(e){
      var rect = hydroTankFill.getBoundingClientRect();
      var x = e.clientX - rect.left;
      var y = e.clientY - rect.top;
      if (x < 0 || y < 0 || x > rect.width || y > rect.height) return;
      if (lastPX === null){
        spawnFoamAt(x, y);
        lastPX = x; lastPY = y;
        return;
      }
      var dx = x - lastPX, dy = y - lastPY;
      var dist = Math.sqrt(dx * dx + dy * dy);
      var steps = Math.max(1, Math.floor(dist / 6));
      for (var s = 1; s <= steps; s++){
        spawnFoamAt(lastPX + dx * (s / steps), lastPY + dy * (s / steps));
      }
      lastPX = x; lastPY = y;
    }
    hydroTank.addEventListener('pointermove', handlePointerMove);
    hydroTank.addEventListener('pointerdown', function(e){ lastPX = null; lastPY = null; handlePointerMove(e); });
    hydroTank.addEventListener('pointerleave', function(){ lastPX = null; lastPY = null; });
    hydroTank.addEventListener('pointercancel', function(){ lastPX = null; lastPY = null; });

    function drawFoam(){
      for (var i = foams.length - 1; i >= 0; i--){
        var f = foams[i];
        f.age++;
        if (f.age >= f.life){ foams.splice(i, 1); continue; }
        f.x += f.vx; f.y += f.vy;
        var p = f.age / f.life;
        var alpha = (1 - p) * 0.8;
        var rad = f.r + (f.maxR - f.r) * p;
        ctx.beginPath();
        ctx.fillStyle = 'rgba(255,255,255,' + alpha.toFixed(2) + ')';
        ctx.arc(f.x, f.y, rad, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    function draw(){
      requestAnimationFrame(draw);
      if (w <= 1 || h <= 1) return;
      ctx.clearRect(0, 0, w, h);

      var crestGrad = horizontal
        ? ctx.createLinearGradient(w, 0, 0, 0)
        : ctx.createLinearGradient(0, 0, 0, h);
      crestGrad.addColorStop(0, 'rgba(247,221,150,0.95)');
      crestGrad.addColorStop(0.45, 'rgba(120,178,229,0.7)');
      crestGrad.addColorStop(1, 'rgba(74,144,217,0.5)');

      layers.forEach(function(layer){
        // no vertical (desktop) a altura do preenchimento já tem um teto fixo
        // (a própria altura do tanque), então a profundidade proporcional
        // sempre fica num intervalo bom. Já a largura da barra horizontal
        // (mobile) não tem teto, ela estica pro espaço disponível na tela,
        // então limitamos a referência usada aqui pra profundidade não
        // esticar mais que isso e as camadas não parecerem 3 ondas soltas.
        var depthRef = horizontal ? Math.min(w, 260) : h;
        var base = horizontal ? w - layer.depthFrac * depthRef : layer.depthFrac * depthRef;
        ctx.beginPath();
        if (horizontal){
          ctx.moveTo(w, 0);
          for (var y = 0; y <= h; y += 3){
            ctx.lineTo(base - waveOffset(y, layer, t), y);
          }
          ctx.lineTo(w, h);
        } else {
          ctx.moveTo(0, 0);
          ctx.lineTo(w, 0);
          for (var x = w; x >= 0; x -= 3){
            ctx.lineTo(x, base + waveOffset(x, layer, t));
          }
        }
        ctx.closePath();
        ctx.fillStyle = layer.color || crestGrad;
        ctx.fill();

        if (layer.foam){
          ctx.beginPath();
          var started = false;
          if (horizontal){
            for (var y2 = 0; y2 <= h; y2 += 3){
              var xf = base - waveOffset(y2, layer, t);
              if (!started){ ctx.moveTo(xf, y2); started = true; } else { ctx.lineTo(xf, y2); }
            }
          } else {
            for (var x2 = 0; x2 <= w; x2 += 3){
              var yf = base + waveOffset(x2, layer, t);
              if (!started){ ctx.moveTo(x2, yf); started = true; } else { ctx.lineTo(x2, yf); }
            }
          }
          ctx.strokeStyle = 'rgba(255,255,255,' + layer.foam + ')';
          ctx.lineWidth = 1;
          ctx.stroke();
        }
      });

      // brilho de sol na superfície: um facho suave e quente que desce a
      // partir da borda da água e vai sumindo, por cima das camadas de onda
      // (as camadas em si são finas demais perto da crista pra sozinhas
      // darem essa sensação de luz entrando na água)
      var sunReach = Math.min(horizontal ? w : h, 70);
      var sunGrad = horizontal
        ? ctx.createLinearGradient(w, 0, w - sunReach, 0)
        : ctx.createLinearGradient(0, 0, 0, sunReach);
      sunGrad.addColorStop(0, 'rgba(255,231,168,0.55)');
      sunGrad.addColorStop(1, 'rgba(255,231,168,0)');
      ctx.fillStyle = sunGrad;
      if (horizontal){
        ctx.fillRect(w - sunReach, 0, sunReach, h);
      } else {
        ctx.fillRect(0, 0, w, sunReach);
      }

      drawFoam();
      drawSteam();

      if (!reduced) t += 0.045;
    }
    draw();

    // exposto pra fora do módulo: permite que outras partes do app (como o
    // "afogamento" do avatar ao ser arrastado pra dentro d'água) disparem a
    // mesma espuma/borrachudas, convertendo coordenadas de tela (clientX/Y)
    // pro espaço local do preenchimento do tanque.
    window.spawnHydroFoam = function(clientX, clientY, bursts){
      var rect = hydroTankFill.getBoundingClientRect();
      if (rect.width < 1 || rect.height < 1) return;
      var x = clientX - rect.left;
      var y = clientY - rect.top;
      var margin = 24;
      if (x < -margin || y < -margin || x > rect.width + margin || y > rect.height + margin) return;
      x = Math.max(0, Math.min(rect.width, x));
      y = Math.max(0, Math.min(rect.height, y));
      var n = bursts || 1;
      for (var i = 0; i < n; i++) spawnFoamAt(x, y);
    };
    window.spawnHydroSteam = function(clientX, clientY, bursts){
      var rect = hydroTankFill.getBoundingClientRect();
      if (rect.width < 1 || rect.height < 1) return;
      var x = clientX - rect.left;
      var y = clientY - rect.top;
      var margin = 24;
      if (x < -margin || y < -margin || x > rect.width + margin || y > rect.height + margin) return;
      x = Math.max(0, Math.min(rect.width, x));
      y = Math.max(0, Math.min(rect.height, y));
      var n = bursts || 1;
      for (var i = 0; i < n; i++) spawnSteamAt(x, y);
    };
  })();

  /* ================= onda do gotinha do cabeçalho =================
     O ícone pequeno de hidratação (contagem regressiva pro próximo copo)
     também ganha a borda de cima animada, em vez do topo reto de antes,
     mesma ideia da onda do tanque grande, só que como um <path> de SVG
     (o ícone é pequeno demais pra valer a pena um canvas separado). */
  (function initDropWave(){
    var path = document.getElementById('waterFill');
    if (!path) return;
    var reduced = false;
    try { reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches; } catch(e){}
    var t = 0;
    var W = 28, BOTTOM = 36, STEP = 4, AMP = 1.1;
    function build(){
      var y = (typeof dropWaterY === 'number') ? dropWaterY : 3;
      var d = 'M0,' + (y + Math.sin(t) * AMP).toFixed(2);
      for (var x = 0; x <= W; x += STEP){
        var yy = y + Math.sin(x * 0.35 + t * 1.6) * AMP + Math.sin(x * 0.6 - t * 2.1) * AMP * 0.4;
        d += ' L' + x + ',' + yy.toFixed(2);
      }
      d += ' L' + W + ',' + BOTTOM + ' L0,' + BOTTOM + ' Z';
      path.setAttribute('d', d);
    }
    function loop(){
      requestAnimationFrame(loop);
      build();
      if (!reduced) t += 0.06;
    }
    loop();
  })();
  var waterOverlay = $('waterOverlay'), waterLogList = $('waterLogList'), waterLogEmpty = $('waterLogEmpty');
  var waterTotalValue = $('waterTotalValue'), waterTotalGoal = $('waterTotalGoal');
  var waterUndoBtn = $('waterUndoBtn'), waterCloseBtn = $('waterCloseBtn');
  var waterQuickBtns = document.querySelectorAll('.water-quick .wq');
  var taskInput = $('taskInput'), taskAdd = $('taskAdd'), taskList = $('taskList');
  var taskEmpty = $('taskEmpty'), taskSummary = $('taskSummary');
  var donePanel = $('donePanel'), doneList = $('doneList'), doneCount = $('doneCount');
  var musicBtn = $('musicBtn');
  var musicPanel = $('musicPanel'), spotifyEmbed = $('spotifyEmbed'), spotifyLogin = $('spotifyLogin');
  var spotifyUrl = $('spotifyUrl'), spotifyLoad = $('spotifyLoad');
  var spotifyMuteBtn = $('spotifyMuteBtn'), spotifyVolumeIcon = $('spotifyVolumeIcon');
  var musicChips = document.querySelectorAll('#musicPresets .chip');
  var musicTabs = document.querySelectorAll('#musicTabs .music-tab');
  var serviceSpotify = $('serviceSpotify'), serviceYoutube = $('serviceYoutube');
  var ytFrame = $('ytFrame'), ytSearch = $('ytSearch'), ytSearchBtn = $('ytSearchBtn');
  var ytStatus = $('ytStatus'), ytResults = $('ytResults'), ytEmbedWrap = $('ytEmbedWrap');
  var ytVolume = $('ytVolume'), ytMuteBtn = $('ytMuteBtn'), ytVolumeIcon = $('ytVolumeIcon');

  // ---- refs Google Agenda ----
  var calBtn = $('calBtn'), calPanel = $('calPanel');
  var calStatusDot = $('calStatusDot'), calStatusText = $('calStatusText');
  var calConnectBtn = $('calConnectBtn'), calDisconnectBtn = $('calDisconnectBtn');
  var calDisconnected = $('calDisconnected'), calConnected = $('calConnected');
  var calPrevDay = $('calPrevDay'), calNextDay = $('calNextDay'), calTodayBtn = $('calTodayBtn');
  var calDayLabel = $('calDayLabel'), calEventList = $('calEventList');

  // ---- refs v2 ----
  var archList = $('archList'), archToggle = $('archToggle'), archCount = $('archCount');
  var taskSearch = $('taskSearch'), tfChips = document.querySelectorAll('.tf-chip');
  var chronoOpts = $('chronoOpts'), chronoOptBtns = document.querySelectorAll('.chrono-opt');
  var finishBtn = $('finishBtn');
  var dayStrip = $('dayStrip'), dsFocus = $('dsFocus'), dsPomos = $('dsPomos'), dsPomosBar = $('dsPomosBar');
  var dsTasks = $('dsTasks'), dsTasksBar = $('dsTasksBar'), dsWater = $('dsWater'), dsWaterBar = $('dsWaterBar');
  var dsStreak = $('dsStreak'), closeDayBtn = $('closeDayBtn');
  var panelBtn = $('panelBtn'), panelOverlay = $('panelOverlay'), panelClose = $('panelClose');
  var pvTabs = document.querySelectorAll('#pvTabs .pv-tab');
  var pvViews = { stats: $('pvStats'), cal: $('pvCal'), ach: $('pvAch'), rec: $('pvRec'), rot: $('pvRot'), ai: $('pvAi'), about: $('pvAbout') };
  var levelTag = $('levelTag'), levelFill = $('levelFill'), levelXp = $('levelXp');
  var statRange = $('statRange'), segBtns = document.querySelectorAll('#statRange .seg-btn');
  var statGrid = $('statGrid'), chartDays = $('chartDays'), chartDaysBlock = $('chartDaysBlock'), chartDaysTitle = $('chartDaysTitle'), chartHours = $('chartHours');
  var heatGrid = $('heatGrid'), heatDetail = $('heatDetail');
  var achGrid = $('achGrid'), recList = $('recList');
  var rotList = $('rotList'), rotEmpty = $('rotEmpty'), rotNewBtn = $('rotNewBtn'), rotForm = $('rotForm');
  var rotName = $('rotName'), rotPomos = $('rotPomos'), rotFocus = $('rotFocus'), rotBreak = $('rotBreak'), rotWater = $('rotWater'), rotTasks = $('rotTasks');
  var rotCancel = $('rotCancel'), rotSave = $('rotSave');
  var aiInput = $('aiInput'), aiRun = $('aiRun'), aiStatus = $('aiStatus'), aiPlan = $('aiPlan'), planList = $('planList');
  var aiDiscard = $('aiDiscard'), aiApply = $('aiApply');
  var summaryOverlay = $('summaryOverlay'), sumDate = $('sumDate'), sumGrid = $('sumGrid'), sumGoals = $('sumGoals'), sumMsg = $('sumMsg');
  var sumClose = $('sumClose'), sumConfirm = $('sumConfirm');
  var inputGoalPomos = $('inputGoalPomos'), inputGoalTasks = $('inputGoalTasks');
  var focusModeSelect = $('focusModeSelect'), fmOpts = document.querySelectorAll('#focusModeSelect .wg-opt');

  var CIRC = 2 * Math.PI * 114;
  ring.style.strokeDasharray = CIRC;
  ring.style.strokeDashoffset = 0;

  // ================= clock =================
  var days = I18N.pack().fmt.weekdaysShort;
  var months = I18N.pack().fmt.monthsShort;
  function updateClock(){
    var d = new Date();
    var h = d.getHours(), m = d.getMinutes();
    clockTime.textContent = (h<10?'0':'')+h + ':' + (m<10?'0':'')+m;
    clockDate.textContent = days[d.getDay()] + ', ' + d.getDate() + ' ' + months[d.getMonth()];
  }
  updateClock();
  setInterval(updateClock, 1000);

  // ================= battery =================
  var batteryIndicator = $('batteryIndicator'), batteryPercent = $('batteryPercent');
  var batteryAlerted = false;
  function renderBattery(bat){
    var pct = Math.round(bat.level * 100);
    var isLow = !bat.charging && pct <= 15;
    batteryPercent.textContent = pct + '%';
    batteryIndicator.classList.toggle('is-charging', bat.charging);
    batteryIndicator.classList.toggle('is-low', isLow);
    batteryIndicator.title = T('ui.batteryTitle', { pct: pct }) + (bat.charging ? T('ui.batteryCharging') : '');
    batteryIndicator.style.display = 'inline-flex';
    if (isLow && !batteryAlerted){
      batteryAlerted = true;
      setTempState('ouch', 2400);
      speak(pick(MSG.batteryLow));
    } else if (!isLow){
      batteryAlerted = false;
    }
  }
  if (navigator.getBattery){
    navigator.getBattery().then(function(bat){
      renderBattery(bat);
      bat.addEventListener('levelchange', function(){ renderBattery(bat); });
      bat.addEventListener('chargingchange', function(){ renderBattery(bat); });
    }).catch(function(){ /* API indisponível, mantém oculto */ });
  }

  // ================= messages (sem emojis) =================
  // ================= Gon: o parceiro de foco =================
  // Descontraído, rápido no raciocínio e obcecado por eficiência.
  // Provoca de leve, mas sempre empurra pra ação.
  // todas as falas do Gon vivem no pacote de idioma (GonI18n)
  var MSG = I18N.pack().MSG;

  function pick(arr){ return arr[Math.floor(Math.random()*arr.length)]; }
  function fillName(t){ return t.replace(/\{name\}/g, userName || I18N.pack().meta.fallbackName); }

  // período do dia: Gon fala diferente de madrugada, manhã, tarde e noite
  function dayPeriod(){
    var h = new Date().getHours();
    if (h < 5) return 'madrugada';
    if (h < 12) return 'manha';
    if (h < 18) return 'tarde';
    return 'noite';
  }
  function greetingByTime(){
    var p = dayPeriod();
    var pool = p === 'madrugada' ? MSG.greetingMadrugada :
               p === 'manha' ? MSG.greetingManha :
               p === 'tarde' ? MSG.greetingTarde : MSG.greetingNoite;
    return pick(pool.concat(MSG.greeting));
  }
  function idlePool(){
    var p = dayPeriod();
    var extra = p === 'madrugada' ? MSG.idleMadrugada :
                p === 'manha' ? MSG.idleManha :
                p === 'tarde' ? MSG.idleTarde : MSG.idleNoite;
    return MSG.idle.concat(extra);
  }

  var bubbleTimeout = null;
  function keepBubbleOnScreen(){
    bubble.style.setProperty('--bubble-shift', '0px');
    var margin = 10;
    var rect = bubble.getBoundingClientRect();
    var shift = 0;
    if (rect.left < margin) shift = margin - rect.left;
    else if (rect.right > window.innerWidth - margin) shift = (window.innerWidth - margin) - rect.right;
    if (shift !== 0) bubble.style.setProperty('--bubble-shift', shift.toFixed(1) + 'px');
  }
  function speak(text){
    var msg = fillName(text);
    bubble.textContent = msg;
    bubble.classList.add('show');
    if (bubbleTimeout) clearTimeout(bubbleTimeout);
    var dur = Math.max(3200, Math.min(8000, 2600 + msg.length * 45));
    bubbleTimeout = setTimeout(function(){ bubble.classList.remove('show'); }, dur);
  }

  // ================= avatar state machine =================
  function baseState(){
    if (state.running) return state.mode === 'pomodoro' ? 'working' : 'resting';
    return sleeping ? 'sleeping' : 'idle';
  }
  function applyState(){
    if (dragState){ avatarHolder.dataset.state = dragState; return; }
    avatarHolder.dataset.state = tempState || baseState();
  }
  function setTempState(s, ms){
    if (tempTimer) clearTimeout(tempTimer);
    tempState = s;
    applyState();
    tempTimer = setTimeout(function(){
      tempState = null;
      applyState();
    }, ms);
  }
  function wake(){
    lastActive = Date.now();
    if (sleeping){
      sleeping = false;
      applyState();
      speak(pick(MSG.wake));
    }
  }
  // fall asleep when idle too long (no timer running, no interaction)
  setInterval(function(){
    if (!userName || state.running || sleeping || tempState) return;
    if (Date.now() - lastActive > 90000){
      sleeping = true;
      applyState();
    }
  }, 5000);
  document.addEventListener('click', wake);
  document.addEventListener('keydown', function(){ lastActive = Date.now(); });

  // ================= avatar: caminhada, arrasto e queda =================
  var HOLDER = 68;   // largura/altura do avatar em px (fallback; o real vem de getHolderSize())
  function getHolderSize(){
    return (avatarHolder && avatarHolder.offsetWidth) || HOLDER;
  }
  var BOTTOM = 18;   // distância do chão até a base da tela (bottom da .avatar-layer)
  var GRAV   = 0.9;  // px por frame² (a 60fps de referência)
  var BOUNCE = 0.34; // quanto da velocidade sobra em cada quique
  var REF_FRAME = 1000 / 60;  // 60fps de referência: todo o movimento é normalizado por dt / REF_FRAME,
                               // assim a velocidade real (px/s) fica igual não importa o frame rate do aparelho

  var avatar = { x: 80, y: 0, vx: 0, vy: 0, direction: 1, speed: 0.55, facing: 1, pauseFrames: 0 };
  var dragging = false, falling = false;
  var grabDx = 0, grabDy = 0;
  var lastPx = 0, lastPy = 0, lastT = 0, velX = 0, velY = 0;
  var moved = false, suppressClick = false;
  var pressT = 0, grabSpeakTimer = null;   // quando o dedo/mouse encostou
  var hits = 0, hitTimer = null;           // tapas seguidos escalam a reação
  var panicking = false, panicUntil = 0, calmTimer = null;
  var drownT = 0, drownStage = 0, drownRage = false, activePointerId = null;
  var lastDrownFoam = 0;
  var umbrellaUp = false, umbrellaTimer = null;
  var lastFrame = performance.now();
  var DROWN_MS = 2600;                     // tempo até se afogar de vez

  function minX(){ return 4; }
  function maxX(){ return Math.max(8, window.innerWidth - getHolderSize() - 4); }
  var WALK_MARGIN = 60; // distância mínima da borda antes do Gon virar durante o passeio normal
  function walkMinX(){ return minX() + WALK_MARGIN; }
  function walkMaxX(){ return Math.max(walkMinX() + 1, maxX() - WALK_MARGIN); }
  function maxY(){ return Math.max(0, window.innerHeight - getHolderSize() - BOTTOM - 8); }
  function clamp(v, a, b){ return v < a ? a : (v > b ? b : v); }

  function renderAvatarPos(){
    avatarLayer.style.transform = 'translate(' + avatar.x.toFixed(1) + 'px, ' + (-avatar.y).toFixed(1) + 'px)';
  }
  function setFacing(dir){
    if (dir !== avatar.facing){
      avatar.facing = dir;
      avatarFlip.classList.toggle('facing-left', dir === -1);
    }
  }

  // --- afogamento: arrastar o avatar até a gota / o tanque de água ---
  function hexLerp(a, b, t){
    function ch(h, i){ return parseInt(h.substr(1 + i*2, 2), 16); }
    var r = Math.round(ch(a,0) + (ch(b,0) - ch(a,0)) * t);
    var g = Math.round(ch(a,1) + (ch(b,1) - ch(a,1)) * t);
    var bl= Math.round(ch(a,2) + (ch(b,2) - ch(a,2)) * t);
    return 'rgb(' + r + ',' + g + ',' + bl + ')';
  }
  function overlaps(a, b){
    return a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;
  }
  var lastOverWater = false, lastOverWaterCheck = 0;
  var OVERWATER_THROTTLE_MS = 50;  // ~20x/s é de sobra pra um medidor que enche em 2.6s;
                                    // evita forçar layout (getBoundingClientRect x3) em todo frame do arrasto
  function overWater(){
    var now = performance.now();
    if (now - lastOverWaterCheck < OVERWATER_THROTTLE_MS) return lastOverWater;
    lastOverWaterCheck = now;
    var r = avatarHolder.getBoundingClientRect();
    // encolhe a caixa do avatar: tem que encostar de verdade, não só chegar perto
    var hit = { left: r.left + 18, right: r.right - 18, top: r.top + 18, bottom: r.bottom - 12 };
    var over = false;

    // gotinha do topo: encostar nela afoga o avatar, mesmo com o contador zerado
    if (hydration && hydration.offsetParent){
      if (overlaps(hit, hydration.getBoundingClientRect())) over = true;
    }
    // tanque grande: usa o retângulo do próprio preenchimento (hydroTankFill), que
    // cresce de baixo pra cima com --fill. Vazio = altura 0 = nunca sobrepõe;
    // parte de cima sem água (acima do nível) também fica de fora naturalmente.
    if (!over && hydroTankFill && hydroTankFill.offsetParent){
      var fillRect = hydroTankFill.getBoundingClientRect();
      if (fillRect.height > 2 && overlaps(hit, fillRect)) over = true;
    }

    lastOverWater = over;
    return over;
  }
  function paintDrown(){
    if (drownT > 0.02){
      avatarHolder.classList.add('drowning');
      avatarHolder.style.setProperty('--avatar-color', hexLerp(currentAccentHex, '#4A90D9', drownT));
    } else {
      avatarHolder.classList.remove('drowning');
      avatarHolder.style.removeProperty('--avatar-color');
    }
  }
  function clearDrown(){
    drownT = 0; drownStage = 0;
    lastOverWaterCheck = 0; lastOverWater = false;  // força reavaliação imediata no próximo arrasto
    avatarHolder.classList.remove('drowning');
    avatarHolder.style.removeProperty('--avatar-color');
  }

  // --- rubor de impacto: fica levemente vermelho ao cair e some sozinho ---
  // (o .skin já tem transition: fill 0.7s ease, então basta soltar a
  // propriedade que a cor volta suavemente pro tom natural do avatar)
  var flashRedTimer = null;
  function flashRed(){
    if (flashRedTimer){ clearTimeout(flashRedTimer); flashRedTimer = null; }
    avatarHolder.style.setProperty('--avatar-color', 'var(--stress-red)');
    flashRedTimer = setTimeout(function(){
      avatarHolder.style.removeProperty('--avatar-color');
      flashRedTimer = null;
    }, 1500);
  }
  function tickDrown(dt){
    var wet = overWater();
    if (wet) drownT = Math.min(1, drownT + dt / DROWN_MS);
    else     drownT = Math.max(0, drownT - dt / (DROWN_MS * 0.6));  // fora d'água ele se recupera

    if (wet && dragState !== 'drowning'){ dragState = 'drowning'; applyState(); }
    if (!wet && dragState === 'drowning'){
      dragState = 'held';
      applyState();
      if (drownStage > 0){ speak(pick(MSG.drownEscape)); drownStage = 0; }
    }
    if (wet){
      if (drownT > 0.75 && drownStage < 3){ drownStage = 3; speak(pick(MSG.drownHelp)); }
      else if (drownT > 0.42 && drownStage < 2){ drownStage = 2; speak(pick(MSG.drown2)); }
      else if (drownT > 0.10 && drownStage < 1){ drownStage = 1; speak(pick(MSG.drown1)); }

      // ele debate na água: espuma + bolinhas saem do ponto onde ele está
      // se debatendo, cada vez mais intensas conforme se aproxima de afogar.
      // como o Gon é uma chama, o contato com a água também solta vapor.
      if (window.spawnHydroFoam){
        var nowFoam = performance.now();
        if (nowFoam - lastDrownFoam > 65){
          lastDrownFoam = nowFoam;
          var r = avatarHolder.getBoundingClientRect();
          var fx = r.left + r.width / 2 + (Math.random() - 0.5) * 14;
          var fy = r.top + r.height * 0.6 + (Math.random() - 0.5) * 8;
          window.spawnHydroFoam(fx, fy, 1 + Math.floor(drownT * 2));
          if (window.spawnHydroSteam) window.spawnHydroSteam(fx, fy, 1 + Math.floor(drownT * 2));
        }
      }
    }
    paintDrown();
    if (drownT >= 1){
      // splash final, mais forte, no instante em que ele afoga de vez
      if (window.spawnHydroFoam){
        var rf = avatarHolder.getBoundingClientRect();
        window.spawnHydroFoam(rf.left + rf.width / 2, rf.top + rf.height * 0.6, 6);
        if (window.spawnHydroSteam) window.spawnHydroSteam(rf.left + rf.width / 2, rf.top + rf.height * 0.6, 8);
      }
      escapeWater();
    }
  }
  // ele se solta sozinho: escorrega da sua mão e cai
  function escapeWater(){
    dragging = false;
    try{ if (activePointerId !== null) avatarHolder.releasePointerCapture(activePointerId); }catch(err){}
    avatarHolder.classList.remove('grabbing');
    if (grabSpeakTimer){ clearTimeout(grabSpeakTimer); grabSpeakTimer = null; }
    suppressClick = true;
    setTimeout(function(){ suppressClick = false; }, 4000);  // rede de segurança

    drownStage = 0;      // continua azul durante a queda; a cor volta ao tocar o chão
    drownRage = true;
    moved = false;
    avatar.vx = (avatar.x < window.innerWidth / 2) ? 2.6 : -2.6;   // se joga pra longe da água
    avatar.vy = 1.5;
    falling = true;
    dragState = 'falling';
    applyState();
  }

  // --- guarda-chuva: sempre que começa a cair confete ---
  function raiseUmbrella(ms){
    // no meio de um arrasto/queda/surto ele tem coisa mais urgente pra fazer
    if (dragging || falling || panicking) return;
    umbrellaUp = true;
    avatarHolder.classList.remove('umbrella');
    void avatarHolder.offsetWidth;          // reinicia a animação de abertura
    avatarHolder.classList.add('umbrella');
    avatarHolder.classList.add('stand');
    if (umbrellaTimer) clearTimeout(umbrellaTimer);
    umbrellaTimer = setTimeout(dropUmbrella, ms);
  }
  function dropUmbrella(){
    if (umbrellaTimer){ clearTimeout(umbrellaTimer); umbrellaTimer = null; }
    umbrellaUp = false;
    avatarHolder.classList.remove('umbrella');
  }

  function animateAvatar(){
    var st = avatarHolder.dataset.state;
    var now = performance.now();
    var dt = Math.min(50, now - lastFrame);
    lastFrame = now;

    // normaliza o passo por tempo real decorrido (dt), não por "1 frame" fixo;
    // assim a velocidade em px/s fica igual em qualquer frame rate/aparelho
    var step = dt / REF_FRAME;

    if (bubble.classList.contains('show')) keepBubbleOnScreen();

    if (dragging){
      if (pointerDirty){ positionFromPointer(rawCx, rawCy); pointerDirty = false; }
      tickDrown(dt);
    } else if (falling){
      avatar.vy -= GRAV * step;             // vy positivo = subindo
      avatar.y  += avatar.vy * step;
      avatar.x  += avatar.vx * step;
      avatar.vx *= Math.pow(0.99, step);

      if (avatar.x <= minX()){
        avatar.x = minX(); avatar.vx = -avatar.vx * 0.5; setFacing(1);
        flashRed();
      }
      if (avatar.x >= maxX()){
        avatar.x = maxX(); avatar.vx = -avatar.vx * 0.5; setFacing(-1);
        flashRed();
      }

      if (avatar.y <= 0){
        avatar.y = 0;
        if (Math.abs(avatar.vy) > 3.4){
          avatar.vy = -avatar.vy * BOUNCE;   // quica
          avatar.vx *= 0.62;
        } else {
          land();
        }
      }
      renderAvatarPos();
    } else if (panicking){
      avatarHolder.classList.remove('stand');
      avatar.x += 3.6 * avatar.direction * step;
      if (avatar.x >= maxX()){ avatar.x = maxX(); avatar.direction = -1; }
      if (avatar.x <= minX()){ avatar.x = minX(); avatar.direction = 1; }
      setFacing(avatar.direction);
      renderAvatarPos();
      if (performance.now() >= panicUntil) calmDown();
    } else if (st === 'idle' && avatar.pauseFrames <= 0 && !umbrellaUp){
      avatarHolder.classList.remove('stand');
      avatar.x += avatar.speed * avatar.direction * step;
      if (avatar.x >= walkMaxX()){ avatar.x = walkMaxX(); avatar.direction = -1; avatar.pauseFrames = 50; }
      if (avatar.x <= walkMinX()){ avatar.x = walkMinX(); avatar.direction = 1; avatar.pauseFrames = 50; }
      setFacing(avatar.direction);
      renderAvatarPos();
    } else {
      if (avatar.pauseFrames > 0){ avatar.pauseFrames -= step; avatarHolder.classList.add('stand'); }
      else avatarHolder.classList.remove('stand');
    }

    requestAnimationFrame(animateAvatar);
  }

  function land(){
    falling = false;
    panicking = false;
    clearDrown();
    avatar.vy = 0;
    avatar.vx = 0;
    avatar.y = 0;
    dragState = null;
    applyState();
    renderAvatarPos();

    avatarHolder.classList.remove('landed');
    void avatarHolder.offsetWidth;   // reinicia a animação de impacto
    avatarHolder.classList.add('landed');
    setTimeout(function(){ avatarHolder.classList.remove('landed'); }, 450);

    lastActive = Date.now();
    if (sleeping){ sleeping = false; }
    if (drownRage){
      drownRage = false;
      startPanic('drown');
      return;
    }
    flashRed();   // levemente vermelho ao tocar o chão, depois volta à cor natural
    speak(pick(state.running ? MSG.droppedWorking : MSG.dropped));
  }


  // --- levar um tapa: reclamar ou surtar e sair correndo ---
  function calmDown(){
    panicking = false;
    if (calmTimer){ clearTimeout(calmTimer); calmTimer = null; }
    if (dragState === 'panic' || dragState === 'ouch') dragState = null;
    applyState();
    avatar.pauseFrames = 50;   // recupera o fôlego antes de voltar a passear
  }
  function startPanic(kind){
    panicking = true;
    var long = (kind === 'drown');
    panicUntil = performance.now() + (long ? 4200 : 2200 + Math.random() * 1400);
    // foge pro lado mais distante da tela
    avatar.direction = (avatar.x < window.innerWidth / 2) ? 1 : -1;
    dragState = 'panic';
    applyState();
    if (long){
      speak(pick(MSG.drownRage));
      if (calmTimer) clearTimeout(calmTimer);
      calmTimer = setTimeout(function(){
        if (panicking) speak(pick(MSG.drownRage));
      }, 2100);
    } else {
      speak(pick(hits >= 3 ? MSG.panicAngry : MSG.panic));
    }
  }
  function hitAvatar(){
    lastActive = Date.now();
    sleeping = false;
    dropUmbrella();

    hits++;
    if (hitTimer) clearTimeout(hitTimer);
    hitTimer = setTimeout(function(){ hits = 0; }, 7000);

    // insistiu? ele surta. nas primeiras vezes, é sorte
    if (hits >= 4 || Math.random() < 0.45){
      startPanic();
      return;
    }

    panicking = false;
    dragState = 'ouch';
    applyState();
    speak(pick(hits >= 3 ? MSG.hitAngry : MSG.hit));
    if (calmTimer) clearTimeout(calmTimer);
    calmTimer = setTimeout(calmDown, 1100);
  }

  // --- arrastar: mouse, dedo e caneta pelo mesmo caminho ---
  var pointerDirty = false, rawCx = 0, rawCy = 0;
  function positionFromPointer(cx, cy){
    var topY = cy - grabDy;
    avatar.x = clamp(cx - grabDx, minX(), maxX());
    avatar.y = clamp((window.innerHeight - BOTTOM - getHolderSize()) - topY, 0, maxY());
    renderAvatarPos();
  }

  avatarHolder.addEventListener('pointerdown', function(e){
    e.preventDefault();
    var r = avatarHolder.getBoundingClientRect();
    grabDx = e.clientX - r.left;
    grabDy = e.clientY - r.top;
    dragging = true;
    falling = false;
    panicking = false;
    drownRage = false;
    dropUmbrella();
    activePointerId = e.pointerId;
    clearDrown();
    if (calmTimer){ clearTimeout(calmTimer); calmTimer = null; }
    moved = false;
    pressT = performance.now();
    avatar.vx = 0; avatar.vy = 0;
    velX = 0; velY = 0;
    lastPx = e.clientX; lastPy = e.clientY; lastT = performance.now();
    rawCx = e.clientX; rawCy = e.clientY; pointerDirty = false;

    try{ avatarHolder.setPointerCapture(e.pointerId); }catch(err){}
    avatarHolder.classList.add('grabbing');
    avatarHolder.classList.remove('stand');
    dragState = 'held';
    applyState();
    lastActive = Date.now();
    sleeping = false;
    // um toque rápido é tapa, não sequestro: só reclama se segurar mesmo
    if (grabSpeakTimer) clearTimeout(grabSpeakTimer);
    grabSpeakTimer = setTimeout(function(){
      if (dragging) speak(pick(MSG.grabbed));
    }, 280);
  });


  avatarHolder.addEventListener('pointermove', function(e){
    if (!dragging) return;
    var now = performance.now();
    var dt = Math.max(8, now - lastT);
    velX = ((e.clientX - lastPx) / dt) * 16;
    velY = ((e.clientY - lastPy) / dt) * 16;
    lastPx = e.clientX; lastPy = e.clientY; lastT = now;

    if (Math.abs(velX) > 0.4 || Math.abs(velY) > 0.4) moved = true;
    if (velX > 1.2) setFacing(1);
    else if (velX < -1.2) setFacing(-1);

    rawCx = e.clientX; rawCy = e.clientY; pointerDirty = true;
  });

  function releaseAvatar(e){
    if (!dragging) return;
    dragging = false;
    try{ avatarHolder.releasePointerCapture(e.pointerId); }catch(err){}
    avatarHolder.classList.remove('grabbing');
    if (grabSpeakTimer){ clearTimeout(grabSpeakTimer); grabSpeakTimer = null; }
    if (drownStage > 0) speak(pick(MSG.drownEscape));
    clearDrown();

    // toque curto, sem arrastar, com ele no chão = tapa
    var wasTap = !moved && (performance.now() - pressT) < 350 && avatar.y <= 0.5;
    if (wasTap){
      moved = false;
      avatar.vx = 0; avatar.vy = 0;
      hitAvatar();
      return;
    }

    // um arrasto termina em 'click': engole esse clique pra não acionar
    // botões que estavam embaixo do avatar (nem acordar/fechar popovers)
    if (moved){
      suppressClick = true;
      setTimeout(function(){ suppressClick = false; }, 80);
    }
    moved = false;

    // se ficou parado por um tempo antes de soltar, não arremessa
    if (performance.now() - lastT > 120){ velX = 0; velY = 0; }
    avatar.vx = clamp(velX, -16, 16);
    avatar.vy = clamp(-velY, -22, 22);   // tela cresce pra baixo, física cresce pra cima

    if (avatar.y <= 0.5 && avatar.vy <= 0){
      land();                 // soltou já no chão: cai na hora
    } else {
      falling = true;
      dragState = 'falling';
      applyState();
    }
  }
  avatarHolder.addEventListener('pointerup', releaseAvatar);
  avatarHolder.addEventListener('pointercancel', releaseAvatar);
  document.addEventListener('click', function(e){
    if (suppressClick){
      e.stopPropagation();
      e.preventDefault();
      suppressClick = false;   // engole só um clique e rearma
    }
  }, true);

  window.addEventListener('resize', function(){
    avatar.x = clamp(avatar.x, minX(), maxX());
    avatar.y = clamp(avatar.y, 0, maxY());
    renderAvatarPos();
    syncCardHeight();
  });
  // remedição pós-carregamento: a fonte Inter pode chegar depois da primeira
  // medição e mudar levemente a altura das linhas de texto
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(syncCardHeight);
  window.addEventListener('load', syncCardHeight);

  renderAvatarPos();
  requestAnimationFrame(animateAvatar);
  setInterval(function(){
    if (avatarHolder.dataset.state === 'idle' && Math.random() < 0.5){
      avatar.pauseFrames = 30 + Math.floor(Math.random()*70);
    }
  }, 9000);
  // ================= streak =================
  // widget visual removido a pedido do usuário; state.streak continua existindo
  // só para alimentar as comemorações de marco (a cada 3º/5º pomodoro do dia)
  function renderStreak(){}
  function pulseStreak(){}

  // ================= dots =================
  function renderDots(){
    dotsWrap.innerHTML = '';
    for (var i=0;i<4;i++){
      var d = document.createElement('div');
      d.className = 'dot' + (i < (state.cyclesCompleted % 4) ? ' filled' : '');
      dotsWrap.appendChild(d);
    }
  }

  // ================= timer =================
  function formatTime(s){
    if (s >= 3600){
      var h = Math.floor(s/3600), m2 = Math.floor((s%3600)/60), s2 = s%60;
      return h + ':' + (m2<10?'0':'')+m2 + ':' + (s2<10?'0':'')+s2;
    }
    var m = Math.floor(s/60), sec = s % 60;
    return (m<10?'0':'')+m + ':' + (sec<10?'0':'')+sec;
  }
  function updateRing(){
    var pct = state.total > 0 ? state.remaining / state.total : 0;
    ring.style.strokeDashoffset = CIRC * (1 - pct);
  }
  function updateTitle(){
    var shown = isFreeRun() ? chronoElapsed : state.remaining;
    if (state.running) document.title = formatTime(shown) + ' · Gon';
    else if (isFreeRun() ? chronoElapsed > 0 : state.remaining !== state.total) document.title = I18N.pack().meta.titlePaused;
    else document.title = I18N.pack().meta.titleIdle;
  }
  function firstPendingTask(){
    for (var i=0;i<tasks.length;i++) if (!tasks[i].done) return tasks[i];
    return null;
  }
  function renderTaskNow(){
    // desativado: não exibir qual tarefa está em andamento durante o pomodoro,
    // só o tempo e o texto "Pomodoro" devem aparecer no anel
    taskNow.hidden = true;
  }
  function setTimeDisplay(text){
    timeDisplay.textContent = text;
    // formato H:MM:SS (duas ":") = passou de 1h, encolhe pra continuar
    // cabendo e centralizado dentro do círculo
    timeDisplay.classList.toggle('is-long', text.indexOf(':') !== text.lastIndexOf(':'));
  }
  function render(){
    if (isFreeRun()){
      setTimeDisplay(formatTime(chronoElapsed));
      modeLabel.textContent = chronoDir === 'free' ? T('ui.modeFree') : T('ui.modeChrono');
      // o anel completa uma volta por minuto
      ring.style.strokeDashoffset = CIRC * (1 - ((chronoElapsed % 60) / 60));
      startBtn.textContent = state.running ? T('ui.btnPause') : (chronoElapsed === 0 ? T('ui.btnStart') : T('ui.btnResume'));
    } else {
      setTimeDisplay(formatTime(state.remaining));
      modeLabel.textContent = modeNames[state.mode];
      updateRing();
      startBtn.textContent = state.running ? T('ui.btnPause') : (state.remaining === state.total ? T('ui.btnStart') : T('ui.btnResume'));
      if (window.GonGame && (state.mode === 'short' || state.mode === 'long')) GonGame.updateTime(state.remaining);
    }
    updateTitle();
    skipBtn.hidden = (state.mode === 'pomodoro' || state.mode === 'chrono');
    if (state.mode === 'short' || state.mode === 'long'){
      var ggLabel = state.running ? T('ui.ggPauseBreak')
        : (state.remaining === state.total ? T('ui.ggStartBreak') : T('ui.ggResumeBreak'));
      document.querySelectorAll('.gg-pause-btn').forEach(function(b){ b.textContent = ggLabel; });
    }
    finishBtn.hidden = !(document.body.classList.contains('focus-on') || (isFreeRun() && (state.running || chronoElapsed > 0)));
    tabsEl.classList.toggle('is-locked', state.running);
    renderDots();
    renderTaskNow();
    renderDayStrip();
  }
  // guarda o tempo restante de cada modo, pra nao perder progresso ao trocar de aba
  var savedRemaining = {
    pomodoro: durations.pomodoro * 60,
    short: durations.short * 60,
    long: durations.long * 60
  };
  // padroniza a altura do card: mede a altura "natural" da view padrão
  // (Pomodoro/Cronômetro, com anel + toggle + botões + dots + hint) e trava
  // essa medida como mínimo, pra Pausa curta/longa (jogo da velha) nunca
  // deixar o card menor nem maior: o conteúdo do jogo fica centralizado
  // dentro desse espaço fixo (ver .card.is-game{ justify-content:center })
  function syncCardHeight(){
    if (!cardEl) return;
    var wasGame = cardEl.classList.contains('is-game');
    if (wasGame) cardEl.classList.remove('is-game');
    cardEl.style.minHeight = '';
    var h = cardEl.offsetHeight;
    if (wasGame) cardEl.classList.add('is-game');
    if (h) cardEl.style.minHeight = h + 'px';
  }

  function switchMode(mode, opts){
    var forceReset = !!(opts && opts.reset);
    // salva onde o modo atual parou antes de sair dele
    if (isFreeRun()) savedElapsed[state.mode] = chronoElapsed;
    else savedRemaining[state.mode] = state.remaining;

    state.mode = mode;
    applySessionColor(mode);
    chronoDir = modeSelection[mode];
    updateChronoUI(mode);

    if (isFreeRun()){
      chronoElapsed = forceReset ? 0 : (savedElapsed[mode] || 0);
      state.total = 0;
      state.remaining = 0;
    } else {
      state.total = durations[mode]*60;
      state.remaining = forceReset ? state.total : Math.min(savedRemaining[mode], state.total);
    }
    pause();
    syncFocusMilestones(isFreeRun() ? chronoElapsed : state.total - state.remaining);
    tabs.forEach(function(t){
      var on = t.dataset.mode === mode;
      t.classList.toggle('active', on);
      t.setAttribute('aria-pressed', on ? 'true' : 'false');
    });
    applyState();
    render();
    if (window.GonGame) GonGame.onModeChange(mode);
    syncCardHeight();
  }
  // âncora do relógio real: o tick calcula quantos segundos DE VERDADE se
  // passaram desde o último tick, em vez de assumir "1 por chamada". Isso
  // corrige o atraso clássico de Pomodoro em aba de segundo plano: o
  // navegador estrangula o setInterval (chega a rodar 1x por minuto), mas
  // como cada tick compensa o tempo perdido, 25 min continuam sendo 25 min.
  var lastTickAt = 0;

  // ---- marcos de foco: reconhecimento por conquista real ----
  // Aos 10, 20, 30... minutos de sessão o Gon reconhece o progresso com um
  // aceno breve. O gatilho é o tempo de foco JÁ conquistado, nunca uma
  // suposição sobre o comportamento (reforço positivo + senso de competência).
  var FOCUS_MILESTONES = [10, 20, 30, 45, 60, 90, 120]; // minutos
  var sessionMilestoneIdx = 0;
  // realinha o ponteiro ao tempo já decorrido SEM anunciar (usado ao trocar
  // de modo, retomar ou resetar, pra não repetir marcos já reconhecidos)
  function syncFocusMilestones(elapsedSec){
    sessionMilestoneIdx = 0;
    while (sessionMilestoneIdx < FOCUS_MILESTONES.length &&
           elapsedSec >= FOCUS_MILESTONES[sessionMilestoneIdx] * 60){
      sessionMilestoneIdx++;
    }
  }
  function checkFocusMilestones(elapsedSec){
    var crossed = false;
    while (sessionMilestoneIdx < FOCUS_MILESTONES.length &&
           elapsedSec >= FOCUS_MILESTONES[sessionMilestoneIdx] * 60){
      sessionMilestoneIdx++;
      crossed = true;
    }
    // só fala com a aba visível: é um aceno discreto no ambiente, nunca uma
    // interrupção do trabalho que está acontecendo em outra janela
    if (crossed && !document.hidden) speak(pick(MSG.focusMilestone));
  }

  function tick(){
    var now = Date.now();
    var elapsed = Math.round((now - lastTickAt) / 1000);
    if (elapsed < 1) return;
    lastTickAt += elapsed * 1000;
    if (isFreeRun()){
      chronoElapsed += elapsed;
      if (chronoDir === 'free'){
        v2FocusSecond(elapsed);
        checkFocusMilestones(chronoElapsed);
      }
      render();
      return;
    }
    var step = Math.min(elapsed, state.remaining);
    state.remaining -= step;
    if (state.mode === 'pomodoro'){
      v2FocusSecond(step);
      checkFocusMilestones(state.total - state.remaining);
    }
    if (state.remaining <= 0){ state.remaining = 0; render(); finishSession(); return; }
    render();
  }
  function startNotifyInfo(){
    if (chronoDir === 'free'){
      return { title: T('ui.notifFreeStart'), body: fillName(T('ui.notifFreeStartBody')) };
    }
    if (state.mode === 'pomodoro') return { title: T('ui.notifPomoStart'), body: fillName(T('ui.notifPomoStartBody', { min: durations.pomodoro })) };
    if (state.mode === 'short') return { title: T('ui.notifShortStart'), body: fillName(T('ui.notifShortStartBody', { min: durations.short })) };
    if (state.mode === 'long') return { title: T('ui.notifLongStart'), body: fillName(T('ui.notifLongStartBody', { min: durations.long })) };
    return { title: T('ui.notifChronoStart'), body: fillName(T('ui.notifChronoStartBody')) };
  }
  function start(){
    if (state.running) return;
    var freshStart = isFreeRun() ? (chronoElapsed === 0) : (state.remaining === state.total);
    state.running = true;
    lastTickAt = Date.now();
    syncFocusMilestones(isFreeRun() ? chronoElapsed : state.total - state.remaining);
    state.timerId = setInterval(tick, 1000);
    wake();
    applyState();
    render();
    askNotifPermission();
    if (freshStart){
      var info = startNotifyInfo();
      notify(info.title, info.body);
    }
    if (state.mode === 'pomodoro' && settingsV2.autoFocus) enterFocusMode();
    if (chronoDir === 'free' || state.mode === 'pomodoro'){
      var t = firstPendingTask();
      if (t) speak(T('ui.speakTaskStart', { name: '{name}', task: shorten(t.text, 42) }));
      else speak(pick(MSG.startFocus));
    } else if (state.mode === 'chrono'){
      speak(pick(MSG.chronoStart));
    } else {
      speak(pick(MSG.startBreak));
    }
  }
  function pause(){
    state.running = false;
    if (state.timerId){ clearInterval(state.timerId); state.timerId = null; }
    applyState();
    render();
  }
  function toggleStartPause(){
    if (state.running){ pause(); speak(pick(MSG.paused)); }
    else start();
  }
  function reset(){
    pause();
    if (isFreeRun()) chronoElapsed = 0;
    state.remaining = state.total;
    syncFocusMilestones(0);
    exitFocusMode();
    render();
  }
  function skipBreak(){
    switchMode('pomodoro');
    speak(pick(MSG.skipBreak));
  }
  function shorten(t, n){ return t.length > n ? t.slice(0, n-1) + '…' : t; }

  function finishSession(){
    pause();
    beep();
    exitFocusMode();
    if (state.mode === 'chrono'){
      // countdown regressivo chegou a zero
      savedRemaining.chrono = state.total;
      state.remaining = state.total;
      launchConfetti(45);
      speak(pick(MSG.chronoDone));
      notify(T('ui.notifCountdownDone'), fillName(T('ui.notifCountdownDoneBody')));
      render();
      return;
    }
    // esse modo terminou (chegou a zero); da proxima vez que for aberto, deve comecar do zero, nao continuar em 0
    savedRemaining[state.mode] = state.total;
    if (state.mode === 'pomodoro'){
      state.cyclesCompleted++;
      state.streak++;
      v2PomodoroDone();
      renderStreak();
      pulseStreak();
      renderDots();
      var milestone = (state.streak >= 3 && (state.streak === 3 || state.streak % 5 === 0));
      if (milestone){
        sfxMilestone();
        launchConfetti(130);
        speak(pick(MSG.milestone));
      } else {
        launchConfetti(45);
        speak(pick(MSG.pomodoroDone));
      }
      notify(T('ui.notifPomoDone'), fillName(T('ui.notifPomoDoneBody')));
      var next = (state.cyclesCompleted % 4 === 0) ? 'long' : 'short';
      setTimeout(function(){ switchMode(next, {reset:true}); }, 2400);
    } else {
      launchConfetti(45);
      speak(pick(MSG.breakDone));
      notify(T('ui.notifBreakDone'), fillName(T('ui.notifBreakDoneBody')));
      if (window.GonGame && GonGame.isActive()){
        // com o jogo em andamento, quem decide o próximo passo é o modal do Gon
        GonGame.onBreakEnd();
      } else {
        setTimeout(function(){ switchMode('pomodoro', {reset:true}); }, 1600);
      }
    }
  }

  function beep(){
    try{
      var ctx = new (window.AudioContext || window.webkitAudioContext)();
      var o = ctx.createOscillator(), g = ctx.createGain();
      o.type='sine'; o.frequency.value=660;
      g.gain.value=0.06;
      o.connect(g); g.connect(ctx.destination);
      o.start();
      g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.9);
      o.stop(ctx.currentTime + 0.9);
    }catch(e){}
  }

  // ================= efeitos sonoros (sintetizados, sem arquivos externos) =================
  // um único AudioContext compartilhado; criado/retomado sob demanda pra respeitar
  // a política de autoplay do navegador (só liga de fato após 1º gesto do usuário)
  var sfxCtx = null;
  function getSfxCtx(){
    try{
      if (!sfxCtx) sfxCtx = new (window.AudioContext || window.webkitAudioContext)();
      if (sfxCtx.state === 'suspended') sfxCtx.resume();
      return sfxCtx;
    }catch(e){ return null; }
  }
  // tom simples (osc + envelope curto), base pra dings, pops e chimes
  function sfxTone(freq, opts){
    var ctx = getSfxCtx();
    if (!ctx) return;
    opts = opts || {};
    var dur = opts.dur || 0.16;
    var vol = opts.vol != null ? opts.vol : 0.07;
    var t0 = ctx.currentTime + (opts.delay || 0);
    var o = ctx.createOscillator(), g = ctx.createGain();
    o.type = opts.type || 'sine';
    o.frequency.setValueAtTime(freq, t0);
    if (opts.toFreq) o.frequency.exponentialRampToValueAtTime(Math.max(20, opts.toFreq), t0 + dur);
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(vol, t0 + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    o.connect(g); g.connect(ctx.destination);
    o.start(t0); o.stop(t0 + dur + 0.03);
  }
  // --- sons específicos, cada um ligado a um momento estratégico da UI ---
  function sfxTaskDone(){ sfxTone(740, { dur:0.10, vol:0.07 }); sfxTone(988, { dur:0.14, vol:0.06, delay:0.06 }); }
  function sfxAllDone(){ [660,880,1108,1320].forEach(function(f,i){ sfxTone(f, { dur:0.18, vol:0.06, delay:i*0.07 }); }); }
  function sfxMilestone(){ [523,659,784,1047].forEach(function(f,i){ sfxTone(f, { dur:0.22, vol:0.07, delay:i*0.09 }); }); }
  function sfxDrop(){ sfxTone(560, { dur:0.11, vol:0.05, toFreq:300 }); }

  // ================= som ambiente de lareira (aba "Sobre", sintetizado) =================
  // ruído filtrado formando um "sopro" grave e constante + estalos aleatórios,
  // tudo em volume bem baixo, só pra dar aconchego à cena da fogueira
  var Fireplace = (function(){
    var K_MUTE = 'gon.fireplaceMuted';
    var ctx = null, master = null, bedSrc = null, crackleTimer = null, running = false;
    var muted = false;
    try { muted = localStorage.getItem(K_MUTE) === '1'; } catch(e){}

    function saveMuted(v){ try{ localStorage.setItem(K_MUTE, v ? '1' : '0'); }catch(e){} }

    function ensureCtx(){
      try{
        if (!ctx) ctx = new (window.AudioContext || window.webkitAudioContext)();
        if (ctx.state === 'suspended') ctx.resume();
        return ctx;
      }catch(e){ return null; }
    }

    // ruído marrom (integra ruído branco): mais grave e macio que ruído branco puro
    function makeBedBuffer(c){
      var dur = 4, bufSize = c.sampleRate * dur;
      var buffer = c.createBuffer(1, bufSize, c.sampleRate);
      var data = buffer.getChannelData(0);
      var last = 0;
      for (var i=0;i<bufSize;i++){
        var white = Math.random()*2-1;
        last = (last + 0.02*white) / 1.02;
        data[i] = last * 3.2;
      }
      return buffer;
    }

    function crackleOnce(){
      if (!running || !ctx) return;
      try{
        var dur = 0.03 + Math.random()*0.045;
        var buf = ctx.createBuffer(1, Math.max(1, Math.floor(ctx.sampleRate*dur)), ctx.sampleRate);
        var d = buf.getChannelData(0);
        for (var i=0;i<d.length;i++) d[i] = Math.random()*2-1;
        var src = ctx.createBufferSource();
        src.buffer = buf;
        var bp = ctx.createBiquadFilter();
        bp.type = 'bandpass';
        bp.frequency.value = 1000 + Math.random()*2800;
        bp.Q.value = 1.1;
        var g = ctx.createGain();
        var vol = 0.0028 + Math.random()*0.0048;
        g.gain.setValueAtTime(0.0001, ctx.currentTime);
        g.gain.exponentialRampToValueAtTime(vol, ctx.currentTime + 0.006);
        g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + dur);
        src.connect(bp); bp.connect(g); g.connect(master);
        src.start(); src.stop(ctx.currentTime + dur + 0.02);
      }catch(e){}
    }
    function scheduleCrackle(){
      if (!running) return;
      var delay = 500 + Math.random()*1700;
      crackleTimer = setTimeout(function(){ crackleOnce(); scheduleCrackle(); }, delay);
    }

    function start(){
      if (running || muted) return;
      var c = ensureCtx();
      if (!c) return;
      running = true;

      master = c.createGain();
      master.gain.setValueAtTime(0.0001, c.currentTime);
      master.gain.linearRampToValueAtTime(0.007, c.currentTime + 1.6);
      master.connect(c.destination);

      var bed = c.createBufferSource();
      bed.buffer = makeBedBuffer(c);
      bed.loop = true;
      var lp = c.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.value = 380;
      bed.connect(lp); lp.connect(master);
      bed.start();
      bedSrc = bed;

      scheduleCrackle();
    }

    function stop(){
      if (!running) return;
      running = false;
      if (crackleTimer){ clearTimeout(crackleTimer); crackleTimer = null; }
      if (master && ctx){
        try{
          master.gain.cancelScheduledValues(ctx.currentTime);
          master.gain.setValueAtTime(master.gain.value, ctx.currentTime);
          master.gain.linearRampToValueAtTime(0.0001, ctx.currentTime + 0.5);
        }catch(e){}
      }
      var src = bedSrc; bedSrc = null;
      setTimeout(function(){ try{ if (src) src.stop(); }catch(e){} }, 600);
    }

    function isMuted(){ return muted; }
    function setMuted(v, activeNow){
      muted = !!v;
      saveMuted(muted);
      if (muted) stop();
      else if (activeNow) start();
    }

    return { start: start, stop: stop, isMuted: isMuted, setMuted: setMuted };
  })();

  // ================= som de grilos (sintetizado) =================
  // toca só enquanto a cena do Gon com a fogueira está visível na tela,
  // como uma camada extra de ambientação noturna por trás da lareira
  var Crickets = (function(){
    var ctx = null, master = null, chirpTimer = null, running = false;

    function ensureCtx(){
      try{
        if (!ctx) ctx = new (window.AudioContext || window.webkitAudioContext)();
        if (ctx.state === 'suspended') ctx.resume();
        return ctx;
      }catch(e){ return null; }
    }

    // um "canto" de grilo: pequeno trem de pulsos agudos (~3.8-4.7kHz)
    function chirpOnce(){
      if (!running || !ctx) return;
      try{
        var baseFreq = 3800 + Math.random()*900;
        var pulses = 3 + Math.floor(Math.random()*3);
        var t0 = ctx.currentTime;
        for (var i=0;i<pulses;i++){
          var pt = t0 + i*0.045;
          var o = ctx.createOscillator();
          o.type = 'sine';
          o.frequency.setValueAtTime(baseFreq, pt);
          var g = ctx.createGain();
          var vol = 0.005 + Math.random()*0.005;
          g.gain.setValueAtTime(0.0001, pt);
          g.gain.exponentialRampToValueAtTime(vol, pt + 0.006);
          g.gain.exponentialRampToValueAtTime(0.0001, pt + 0.024);
          o.connect(g); g.connect(master);
          o.start(pt); o.stop(pt + 0.03);
        }
      }catch(e){}
    }
    function scheduleChirp(){
      if (!running) return;
      var delay = 1300 + Math.random()*2800;
      chirpTimer = setTimeout(function(){ chirpOnce(); scheduleChirp(); }, delay);
    }

    function start(){
      if (running) return;
      var c = ensureCtx();
      if (!c) return;
      running = true;
      master = c.createGain();
      master.gain.setValueAtTime(0.0001, c.currentTime);
      master.gain.linearRampToValueAtTime(1, c.currentTime + 1.2);
      master.connect(c.destination);
      scheduleChirp();
    }
    function stop(){
      if (!running) return;
      running = false;
      if (chirpTimer){ clearTimeout(chirpTimer); chirpTimer = null; }
      if (master && ctx){
        try{
          master.gain.cancelScheduledValues(ctx.currentTime);
          master.gain.setValueAtTime(master.gain.value, ctx.currentTime);
          master.gain.linearRampToValueAtTime(0.0001, ctx.currentTime + 0.4);
        }catch(e){}
      }
    }

    return { start: start, stop: stop };
  })();

  // periodic nudges
  setInterval(function(){
    if (!state.running) return;
    if (state.mode === 'pomodoro') speak(pick(MSG.nudgeFocus));
    else speak(pick(MSG.nudgeBreak));
  }, 30000);
  setInterval(function(){
    if (state.running || !userName || sleeping) return;
    if (bubble.classList.contains('show')) return;
    speak(pick(idlePool()));
  }, 24000);

  // ================= hydration =================
  function waterRemainingMs(){ return nextWaterAt - Date.now(); }
  function fmtLiters(ml){
    var l = ml / 1000;
    // no casas decimais desnecessárias: 1L em vez de 1.0L, mas 1.2L quando quebrado
    var v = String(Math.round(l * 10) / 10);
    if (I18N.pack().meta.decimalComma) v = v.replace('.', ',');
    return v + 'L';
  }
  function fmtMl(ml){
    return ml >= 1000 ? (Math.round(ml / 100) / 10) + ' L' : ml + ' ml';
  }
  function fmtHour(ts){
    var d = new Date(ts);
    var h = d.getHours(), m = d.getMinutes();
    return (h<10?'0':'')+h + ':' + (m<10?'0':'')+m;
  }
  function recalcWater(){
    var sum = 0;
    for (var i=0;i<waterLog.length;i++) sum += waterLog[i].ml;
    mlToday = sum;
  }
  function renderWaterAll(){
    renderHydroCount();
    renderHydroTank();
    renderWaterLog();
    v2WaterSync();
  }
  function checkWaterDayRollover(){
    var today = new Date().toDateString();
    if (today !== waterDayKey){
      waterDayKey = today;
      waterLog = [];
      recalcWater();
      renderWaterAll();
    }
  }
  function renderHydroCount(){
    var goalMl = waterGoalLiters * 1000;
    hydroCount.textContent = fmtLiters(mlToday) + '/' + waterGoalLiters + 'L';
    hydration.classList.toggle('goal-met', mlToday >= goalMl);
    hydration.classList.toggle('has-water', mlToday > 0);
  }
  function renderHydroTank(){
    var goalMl = waterGoalLiters * 1000;
    var pct = Math.max(0, Math.min(1, mlToday / goalMl));
    // uma única variável serve pros dois eixos (coluna no desktop, barra no celular)
    hydroTank.style.setProperty('--fill', (pct * 100).toFixed(1) + '%');
    hydroTankLabelValue.textContent = fmtLiters(mlToday);
    hydroTankLabelPct.textContent = Math.round(pct * 100) + '%';
    hydroTankGoal.textContent = waterGoalLiters + 'L';
    hydroTank.classList.toggle('goal-met', mlToday >= goalMl);
    hydroTank.classList.toggle('has-water', mlToday > 0);
  }

  // --- histórico + desfazer ---
  function renderWaterLog(){
    waterLogList.innerHTML = '';
    waterTotalValue.textContent = fmtLiters(mlToday);
    waterTotalGoal.textContent = T('ui.waterOf', { n: waterGoalLiters });
    waterUndoBtn.disabled = waterLog.length === 0;
    waterUndoBtn.style.opacity = waterLog.length === 0 ? '0.4' : '1';
    waterLogEmpty.classList.toggle('show', waterLog.length === 0);

    // mais recente primeiro
    for (var i = waterLog.length - 1; i >= 0; i--){
      (function(entry, isLatest){
        var li = document.createElement('li');
        if (isLatest) li.className = 'latest';

        var amt = document.createElement('span');
        amt.className = 'wl-amt';
        amt.textContent = fmtMl(entry.ml);

        var time = document.createElement('span');
        time.className = 'wl-time';
        time.textContent = fmtHour(entry.at);

        li.appendChild(amt);
        li.appendChild(time);

        if (isLatest){
          var tag = document.createElement('span');
          tag.className = 'wl-tag';
          tag.textContent = T('ui.waterLatest');
          li.appendChild(tag);
        }

        var del = document.createElement('button');
        del.className = 'del';
        del.textContent = '×';
        del.setAttribute('aria-label', T('ui.waterRemoveAria', { amount: fmtMl(entry.ml) }));
        del.addEventListener('click', function(){ removeWaterEntry(entry.id); });
        li.appendChild(del);

        waterLogList.appendChild(li);
      })(waterLog[i], i === waterLog.length - 1);
    }
  }
  function removeWaterEntry(id){
    var before = waterLog.length;
    waterLog = waterLog.filter(function(e){ return e.id !== id; });
    if (waterLog.length === before) return;
    recalcWater();
    renderWaterAll();
    flashHydroTip(T('ui.hydroRemoved'));
    speak(pick(MSG.waterUndone));
  }
  function undoLastWater(){
    if (!waterLog.length) return;
    waterLog.pop();
    recalcWater();
    renderWaterAll();
    flashHydroTip(T('ui.hydroUndoneLast'));
    speak(pick(MSG.waterUndone));
  }
  function openWaterLog(){
    checkWaterDayRollover();
    renderWaterLog();
    waterOverlay.classList.add('open');
  }
  function closeWaterLog(){ waterOverlay.classList.remove('open'); }

  function flashHydroTip(msg){
    hydroTip.textContent = msg;
    tipLockUntil = Date.now() + 2600;
    hydration.classList.add('pin');
    setTimeout(function(){ hydration.classList.remove('pin'); }, 2600);
  }

  function tickWater(){
    if (!userName) return;
    checkWaterDayRollover();
    var total = waterIntervalMin * 60000;
    var rem = waterRemainingMs();
    if (rem <= 0){
      triggerWater();
      rem = total;
    }
    var pct = Math.max(0, Math.min(1, rem / total));
    // full: y=3 · empty: y=33 (drop spans y 2..34)
    dropWaterY = 3 + (1 - pct) * 30;
    hydration.classList.toggle('urgent', rem <= 120000);
    if (Date.now() < tipLockUntil) return; // não sobrescreve o aviso de "desfeito"
    var mins = Math.ceil(rem / 60000);
    hydroTip.textContent = mins <= 1 ? T('ui.hydroTipSoon') : T('ui.hydroTipIn', { n: mins });
  }
  function triggerWater(){
    nextWaterAt = Date.now() + waterIntervalMin * 60000;
    speak(pick(MSG.water));
    setTempState('drinking', 4600);
    notify(T('ui.notifWater'), fillName(T('ui.notifWaterBody')));
  }
  function logWater(amountMl){
    sfxDrop();
    checkWaterDayRollover();
    var goalMl = waterGoalLiters * 1000;
    var wasMet = mlToday >= goalMl;
    waterLog.push({ id: waterSeq++, ml: amountMl, at: Date.now() });
    recalcWater();
    renderWaterAll();
    nextWaterAt = Date.now() + waterIntervalMin * 60000;
    setTempState('drinking', 2200);
    var shells = window.__aqDrink ? window.__aqDrink(amountMl) : 0;
    flashHydroTip(T('ui.hydroRegistered', { amount: fmtMl(amountMl) }) +
      (shells > 0 ? T(shells > 1 ? 'ui.hydroShellsPlural' : 'ui.hydroShells', { n: shells }) : T('ui.hydroUndoable')));
    if (!wasMet && mlToday >= goalMl){
      speak(pick(MSG.waterGoal));
      launchConfetti(45);
    }
  }
  function closeHydroPopover(){
    hydration.classList.remove('pop-open');
  }
  setInterval(tickWater, 1000);

  // gotinha = registrar · tanque/barra = ver e desfazer
  hydration.addEventListener('click', function(e){
    e.stopPropagation();
    if (e.target.closest('.hydro-opt')) return; // tratado no listener do botão
    hydration.classList.toggle('pop-open');
  });
  hydroOpts.forEach(function(btn){
    btn.addEventListener('click', function(e){
      e.stopPropagation();
      var ml = parseInt(btn.getAttribute('data-ml'), 10) || 0;
      logWater(ml);
      closeHydroPopover();
    });
  });
  document.addEventListener('click', function(){ closeHydroPopover(); });

  hydroTank.addEventListener('click', function(e){
    e.stopPropagation();
    openWaterLog();
  });
  hydroTank.addEventListener('keydown', function(e){
    if (e.key === 'Enter' || e.code === 'Space'){
      e.preventDefault();
      e.stopPropagation();
      openWaterLog();
    }
  });
  waterQuickBtns.forEach(function(btn){
    btn.addEventListener('click', function(e){
      e.stopPropagation();
      logWater(parseInt(btn.getAttribute('data-ml'), 10) || 0);
    });
  });
  waterUndoBtn.addEventListener('click', undoLastWater);
  waterCloseBtn.addEventListener('click', closeWaterLog);
  waterOverlay.addEventListener('click', function(e){ if (e.target === waterOverlay) closeWaterLog(); });

  // ================= tasks =================
  // ---- tarefas v2: prioridade, categoria, data, subtarefas, filtros, arquivo ----
  var taskFilter = new Date().getDay(); // 0=domingo ... 6=sábado, começa no dia de hoje
  var taskQuery = '';
  var openSubs = {};     // id -> subtarefas expandidas
  var openMenuId = null; // menu "⋯" aberto
  var openSubInput = null;
  var PRIO_NAMES = i18nPrioNames();

  function canDragTasks(){ return !taskQuery; }
  function fmtDue(due){
    var p = due.split('-');
    var d = new Date(+p[0], +p[1]-1, +p[2]);
    var names = I18N.pack().fmt.weekdaysShort;
    return names[d.getDay()] + ' ' + d.getDate() + '/' + (d.getMonth()+1);
  }
  // devolve a data (YYYY-MM-DD) do dia da semana `dow` (0=domingo..6=sábado)
  // dentro da semana atual (domingo a sábado)
  function weekdayDate(dow){
    var start = new Date();
    start.setDate(start.getDate() - start.getDay());
    var d = new Date(start.getFullYear(), start.getMonth(), start.getDate() + dow);
    return v2DayKey(d);
  }
  function taskMatches(t){
    if (taskQuery){
      var q = taskQuery;
      var hit = t.text.toLowerCase().indexOf(q) !== -1 ||
                (t.category || '').toLowerCase().indexOf(q) !== -1 ||
                (t.subtasks || []).some(function(s){ return s.text.toLowerCase().indexOf(q) !== -1; });
      if (!hit) return false;
    }
    return t.due === weekdayDate(taskFilter);
  }
  function closeTaskMenu(){
    if (openMenuId === null) return;
    openMenuId = null;
    renderTasks();
  }
  document.addEventListener('click', function(e){
    if (openMenuId !== null && !e.target.closest('.task-menu') && !e.target.closest('.t-more')) closeTaskMenu();
  });

  function buildTaskMenu(t){
    var menu = document.createElement('div');
    menu.className = 'task-menu';
    menu.addEventListener('click', function(e){ e.stopPropagation(); });

    function mkLabel(txt){
      var l = document.createElement('div');
      l.className = 'tmz-label';
      l.textContent = txt;
      return l;
    }
    function mkSep(){
      var s = document.createElement('div');
      s.className = 'tmz-sep';
      return s;
    }
    function mkBtn(txt, fn, danger){
      var b = document.createElement('button');
      b.textContent = txt;
      if (danger) b.className = 'tmz-danger';
      b.addEventListener('click', function(){ fn(); });
      return b;
    }

    // prioridade
    menu.appendChild(mkLabel(T('ui.menuPriority')));
    var prow = document.createElement('div');
    prow.className = 'tmz-row';
    [[3,T('ui.prioHigh')],[2,T('ui.prioMid')],[1,T('ui.prioLow')],[0,T('ui.prioNone')]].forEach(function(pair){
      var b = document.createElement('button');
      b.textContent = pair[1];
      if ((t.priority || 0) === pair[0]) b.classList.add('on');
      b.addEventListener('click', function(){
        t.priority = pair[0];
        openMenuId = null;
        saveAll(); renderTasks();
        if (pair[0] === 3) speak(pick(MSG.prioHigh));
      });
      prow.appendChild(b);
    });
    menu.appendChild(prow);

    // data
    menu.appendChild(mkLabel(T('ui.menuDate')));
    var drow = document.createElement('div');
    drow.className = 'tmz-row';
    var todayK = v2DayKey(new Date());
    var tomK = v2DayKey(new Date(Date.now() + 86400000));
    var weekK = v2DayKey(v2EndOfWeek());
    [[T('ui.dateToday'), todayK],[T('ui.dateTomorrow'), tomK],[T('ui.dateWeek'), weekK],[T('ui.dateNone'), null]].forEach(function(pair){
      var b = document.createElement('button');
      b.textContent = pair[0];
      if ((t.due || null) === pair[1]) b.classList.add('on');
      b.addEventListener('click', function(){
        t.due = pair[1];
        openMenuId = null;
        saveAll(); renderTasks();
        if (pair[1]) speak(pick(MSG.dueSet));
      });
      drow.appendChild(b);
    });
    menu.appendChild(drow);

    // categoria
    menu.appendChild(mkLabel(T('ui.menuCategory')));
    var cat = document.createElement('input');
    cat.type = 'text';
    cat.maxLength = 24;
    cat.placeholder = T('ui.menuCategoryPlaceholder');
    cat.value = t.category || '';
    cat.addEventListener('keydown', function(e){
      if (e.key === 'Enter'){
        t.category = cat.value.trim();
        openMenuId = null;
        saveAll(); renderTasks();
      }
      if (e.key === 'Escape') closeTaskMenu();
    });
    menu.appendChild(cat);

    menu.appendChild(mkSep());
    menu.appendChild(mkBtn(T('ui.menuAddSub'), function(){
      openSubs[t.id] = true;
      openSubInput = t.id;
      openMenuId = null;
      renderTasks();
    }));
    menu.appendChild(mkBtn(T('ui.menuDuplicate'), function(){
      var copy = {
        id: taskSeq++, text: t.text, done: false,
        priority: t.priority || 0, category: t.category || '',
        due: t.due || null, archived: false,
        subtasks: (t.subtasks || []).map(function(s){ return { id: subSeq++, text: s.text, done: false }; })
      };
      var idx = tasks.indexOf(t);
      tasks.splice(idx + 1, 0, copy);
      openMenuId = null;
      saveAll(); renderTasks();
      speak(pick(MSG.taskDuplicated));
    }));
    menu.appendChild(mkBtn(t.archived ? T('ui.menuUnarchive') : T('ui.menuArchive'), function(){
      t.archived = !t.archived;
      openMenuId = null;
      saveAll(); renderTasks();
      if (t.archived) speak(pick(MSG.taskArchived));
    }));
    menu.appendChild(mkSep());
    menu.appendChild(mkBtn(T('ui.menuDelete'), function(){ deleteTask(t.id); }, true));
    return menu;
  }

  function buildSubList(t){
    var ul = document.createElement('ul');
    ul.className = 'subtasks';
    (t.subtasks || []).forEach(function(s){
      var li = document.createElement('li');
      var chk = document.createElement('button');
      chk.className = 'sub-check' + (s.done ? ' on' : '');
      chk.setAttribute('aria-label', s.done ? T('ui.subCheckUndo') : T('ui.subCheckDo'));
      chk.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>';
      chk.addEventListener('click', function(){
        s.done = !s.done;
        if (s.done) sfxTaskDone();
        saveAll(); renderTasks();
      });
      var span = document.createElement('span');
      span.className = 'sub-txt' + (s.done ? ' done' : '');
      span.textContent = s.text;
      var del = document.createElement('button');
      del.className = 'sub-del';
      del.textContent = '×';
      del.setAttribute('aria-label', T('ui.subDelete'));
      del.addEventListener('click', function(){
        t.subtasks = t.subtasks.filter(function(x){ return x.id !== s.id; });
        saveAll(); renderTasks();
      });
      li.appendChild(chk); li.appendChild(span); li.appendChild(del);
      ul.appendChild(li);
    });
    var addLi = document.createElement('li');
    if (openSubInput === t.id){
      var inp = document.createElement('input');
      inp.className = 'sub-add-input';
      inp.type = 'text';
      inp.maxLength = 80;
      inp.placeholder = T('ui.subNewPlaceholder');
      inp.addEventListener('keydown', function(e){
        if (e.key === 'Enter'){
          var v = inp.value.trim();
          if (v){
            if (!t.subtasks) t.subtasks = [];
            t.subtasks.push({ id: subSeq++, text: v, done: false });
            saveAll();
            speak(pick(MSG.subtaskAdded));
          }
          openSubInput = null;
          renderTasks();
        }
        if (e.key === 'Escape'){ openSubInput = null; renderTasks(); }
      });
      inp.addEventListener('blur', function(){
        var v = inp.value.trim();
        if (v){
          if (!t.subtasks) t.subtasks = [];
          t.subtasks.push({ id: subSeq++, text: v, done: false });
          saveAll();
        }
        openSubInput = null;
        renderTasks();
      });
      addLi.appendChild(inp);
      setTimeout(function(){ inp.focus(); }, 30);
    } else {
      var add = document.createElement('button');
      add.className = 'sub-add';
      add.textContent = T('ui.subAdd');
      add.addEventListener('click', function(){
        openSubInput = t.id;
        renderTasks();
      });
      addLi.appendChild(add);
    }
    ul.appendChild(addLi);
    return ul;
  }

  function buildTaskLi(t){
    var li = document.createElement('li');
    li.dataset.id = t.id;
    if (openSubs[t.id]) li.classList.add('sub-open');

    var main = document.createElement('div');
    main.className = 't-main';

    if (!t.done && !t.archived && canDragTasks()){
      var grip = document.createElement('div');
      grip.className = 'drag-handle';
      grip.setAttribute('aria-label', T('ui.taskDragAria'));
      grip.setAttribute('title', T('ui.taskDragAria'));
      grip.innerHTML = '<svg viewBox="0 0 10 16" fill="currentColor"><circle cx="3" cy="3" r="1.2"/><circle cx="7" cy="3" r="1.2"/><circle cx="3" cy="8" r="1.2"/><circle cx="7" cy="8" r="1.2"/><circle cx="3" cy="13" r="1.2"/><circle cx="7" cy="13" r="1.2"/></svg>';
      grip.addEventListener('pointerdown', function(e){ startTaskDrag(e, li); });
      main.appendChild(grip);
    }

    if (t.priority){
      var dot = document.createElement('span');
      dot.className = 'prio-dot p' + t.priority;
      dot.title = T('ui.taskPrioTitle', { name: (PRIO_NAMES[t.priority] || '').toLowerCase() });
      main.appendChild(dot);
    }

    var chk = document.createElement('button');
    chk.className = 'check' + (t.done ? ' on' : '');
    chk.setAttribute('aria-label', t.done ? T('ui.taskCheckUndo') : T('ui.taskCheckDo'));
    chk.setAttribute('title', t.done ? T('ui.taskCheckUndoTitle') : T('ui.taskCheckDoTitle'));
    chk.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>';
    chk.addEventListener('click', function(){ toggleTask(t.id); });
    main.appendChild(chk);

    var body = document.createElement('div');
    body.className = 't-body';
    var span = document.createElement('span');
    span.className = 'txt';
    span.textContent = t.text;
    span.setAttribute('title', T('ui.taskEditTitle'));
    span.addEventListener('click', function(){ startEditTask(t.id, li, span); });
    body.appendChild(span);

    var metaBits = [];
    if (t.category) metaBits.push('<span>' + escHtml(t.category) + '</span>');
    if (t.due){
      var overdue = !t.done && t.due < v2DayKey(new Date());
      metaBits.push('<span class="tm-due' + (overdue ? ' overdue' : '') + '">' + fmtDue(t.due) + '</span>');
    }
    if (t.subtasks && t.subtasks.length){
      var sd = t.subtasks.filter(function(s){ return s.done; }).length;
      metaBits.push('<span>' + escHtml(T('ui.taskSubCount', { done: sd, total: t.subtasks.length })) + '</span>');
    }
    if (metaBits.length){
      var meta = document.createElement('div');
      meta.className = 'task-meta';
      meta.innerHTML = metaBits.join('<span>·</span>');
      body.appendChild(meta);
    }
    main.appendChild(body);

    if (t.subtasks && t.subtasks.length){
      var caret = document.createElement('button');
      caret.className = 't-caret';
      caret.setAttribute('aria-label', T('ui.taskShowSubs'));
      caret.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 6 15 12 9 18"/></svg>';
      caret.addEventListener('click', function(){
        openSubs[t.id] = !openSubs[t.id];
        renderTasks();
      });
      main.appendChild(caret);
    }

    var more = document.createElement('button');
    more.className = 't-more';
    more.textContent = '⋯';
    more.setAttribute('aria-label', T('ui.taskMoreAria'));
    more.addEventListener('click', function(e){
      e.stopPropagation();
      openMenuId = (openMenuId === t.id) ? null : t.id;
      renderTasks();
    });
    main.appendChild(more);

    var del = document.createElement('button');
    del.className = 'del';
    del.textContent = '×';
    del.setAttribute('aria-label', T('ui.taskDeleteAria'));
    del.addEventListener('click', function(){ deleteTask(t.id); });
    main.appendChild(del);

    li.appendChild(main);
    if (openMenuId === t.id) li.appendChild(buildTaskMenu(t));
    if (openSubs[t.id]) li.appendChild(buildSubList(t));
    return li;
  }

  function renderTasks(){
    taskList.innerHTML = '';
    doneList.innerHTML = '';
    archList.innerHTML = '';
    var pending = 0, done = 0, archived = 0;
    tasks.forEach(function(t){
      if (t.archived){
        archived++;
        if (!archList.hidden) archList.appendChild(buildTaskLi(t));
        return;
      }
      if (!taskMatches(t)) return;
      var li = buildTaskLi(t);
      if (t.done){ doneList.appendChild(li); done++; }
      else { taskList.appendChild(li); pending++; }
    });
    var totalNonArchived = tasks.filter(function(t){ return !t.archived; }).length;
    taskEmpty.style.display = (pending === 0 && done === 0) ? 'block' : 'none';
    taskEmpty.textContent = (totalNonArchived > 0)
      ? T('ui.taskEmptyFiltered')
      : T('ui.taskEmpty');
    donePanel.classList.toggle('is-empty', done === 0 && archived === 0);
    doneCount.textContent = done;
    archToggle.hidden = (archived === 0);
    archCount.textContent = archived;
    var sum = pending > 0
      ? T(pending === 1 ? 'ui.taskPending' : 'ui.taskPendingPlural', { n: pending })
      : (done > 0 ? T('ui.taskAllDone') : '');
    if (pending > 1 && canDragTasks()) sum += T('ui.taskDragHint');
    taskSummary.textContent = sum;
    renderTaskNow();
    renderDayStrip();
  }
  function startEditTask(id, li, span){
    if (li.querySelector('.txt-edit')) return; // já em edição
    var current = span.textContent;
    var input = document.createElement('input');
    input.type = 'text';
    input.className = 'txt-edit';
    input.maxLength = 120;
    input.value = current;
    span.parentNode.replaceChild(input, span);
    input.focus();
    input.setSelectionRange(input.value.length, input.value.length);
    var finished = false;
    function commit(){
      if (finished) return;
      finished = true;
      var v = input.value.trim();
      renameTask(id, v || current);
    }
    function cancel(){
      if (finished) return;
      finished = true;
      renderTasks();
    }
    input.addEventListener('blur', commit);
    input.addEventListener('keydown', function(e){
      if (e.key === 'Enter'){ e.preventDefault(); input.blur(); }
      else if (e.key === 'Escape'){ e.preventDefault(); cancel(); }
    });
  }
  function renameTask(id, newText){
    for (var i=0;i<tasks.length;i++){
      if (tasks[i].id === id){ tasks[i].text = newText; break; }
    }
    saveAll();
    renderTasks();
  }
  function addTask(){
    var v = taskInput.value.trim();
    if (!v) { taskInput.focus(); return; }
    tasks.push({ id: taskSeq++, text: v, done: false, priority: 0, category: '', due: weekdayDate(taskFilter), archived: false, subtasks: [] });
    taskInput.value = '';
    taskInput.focus();
    v2TaskCreated();
    saveAll();
    renderTasks();
    speak(pick(MSG.taskAdded));
  }
  function toggleTask(id){
    for (var i=0;i<tasks.length;i++){
      if (tasks[i].id === id){
        tasks[i].done = !tasks[i].done;
        v2TaskToggled(tasks[i].done);
        if (tasks[i].done){
          var allDone = tasks.filter(function(t){ return !t.archived; }).every(function(t){ return t.done; });
          if (allDone && tasks.length > 1){
            sfxAllDone();
            speak(pick(MSG.allDone));
            launchConfetti(60);
          } else {
            sfxTaskDone();
            speak(pick(MSG.taskDone));
            launchConfetti(28);
          }
        }
        break;
      }
    }
    saveAll();
    renderTasks();
  }
  function deleteTask(id){
    var t = tasks.find(function(x){ return x.id === id; });
    // se a tarefa apagada já estava concluída, desconta do contador do dia
    // (Tarefas no resumo de baixo) e do XP ganho por ela, do mesmo jeito que
    // desmarcar a tarefa faria. Sem isso, apagar uma concluída deixava o
    // número "preso" lá embaixo mesmo sem a tarefa existir mais.
    if (t && t.done) v2TaskToggled(false);
    tasks = tasks.filter(function(x){ return x.id !== id; });
    openMenuId = null;
    saveAll();
    renderTasks();
    speak(pick(MSG.taskDeleted));
  }
  taskSearch.addEventListener('input', function(){
    taskQuery = taskSearch.value.trim().toLowerCase();
    renderTasks();
  });
  tfChips.forEach(function(chip){
    // marca hoje como aba ativa ao carregar a página
    if (+chip.getAttribute('data-f') === taskFilter) chip.classList.add('active');
    chip.addEventListener('click', function(){
      taskFilter = +chip.getAttribute('data-f');
      tfChips.forEach(function(c){ c.classList.toggle('active', c === chip); });
      renderTasks();
    });
  });
  archToggle.addEventListener('click', function(){
    archList.hidden = !archList.hidden;
    renderTasks();
  });
  taskAdd.addEventListener('click', addTask);
  taskInput.addEventListener('keydown', function(e){
    if (e.key === 'Enter') addTask();
  });

  // ---- arrastar para priorizar (funciona com mouse e toque) ----
  // move só na vertical; ao soltar, reordena o array `tasks` pela ordem do DOM.
  // topo = mais urgente (também vira o "agora:"). vale p/ pendentes e concluídas.
  var taskDrag = null;
  function startTaskDrag(e, li){
    if (taskDrag) return;
    if (e.button !== undefined && e.button !== 0) return;   // só botão principal do mouse
    if (li.querySelector('.txt-edit')) return;               // não arrasta durante edição
    var list = li.parentNode;
    var rect = li.getBoundingClientRect();
    var ph = document.createElement('li');
    ph.className = 'task-placeholder';
    ph.style.height = rect.height + 'px';
    list.insertBefore(ph, li);
    li.classList.add('dragging');
    li.style.width = rect.width + 'px';
    li.style.left = rect.left + 'px';
    li.style.top = rect.top + 'px';
    taskDrag = { li: li, list: list, ph: ph, left: rect.left, grabY: e.clientY - rect.top, moved: false, pid: e.pointerId };
    document.body.style.userSelect = 'none';
    document.addEventListener('pointermove', onTaskDragMove);
    document.addEventListener('pointerup', onTaskDragEnd);
    document.addEventListener('pointercancel', onTaskDragEnd);
    e.preventDefault();
    e.stopPropagation();
  }
  function onTaskDragMove(e){
    if (!taskDrag) return;
    if (taskDrag.pid != null && e.pointerId !== taskDrag.pid) return;
    var d = taskDrag;
    d.moved = true;
    d.li.style.left = d.left + 'px';                          // trava o X: arrasta só na vertical
    d.li.style.top  = (e.clientY - d.grabY) + 'px';
    var sibs = d.list.querySelectorAll('li:not(.dragging):not(.task-placeholder)');
    var placed = false;
    for (var i=0;i<sibs.length;i++){
      var r = sibs[i].getBoundingClientRect();
      if (e.clientY < r.top + r.height/2){ d.list.insertBefore(d.ph, sibs[i]); placed = true; break; }
    }
    if (!placed) d.list.appendChild(d.ph);
    e.preventDefault();
  }
  function onTaskDragEnd(e){
    if (!taskDrag) return;
    var d = taskDrag;
    document.removeEventListener('pointermove', onTaskDragMove);
    document.removeEventListener('pointerup', onTaskDragEnd);
    document.removeEventListener('pointercancel', onTaskDragEnd);
    d.list.insertBefore(d.li, d.ph);                          // solta na posição do placeholder
    d.list.removeChild(d.ph);
    d.li.classList.remove('dragging');
    d.li.style.width = d.li.style.left = d.li.style.top = '';
    document.body.style.userSelect = '';
    taskDrag = null;
    if (d.moved) commitTaskOrder();
  }
  function commitTaskOrder(){
    var order = [];
    [].forEach.call(taskList.querySelectorAll(':scope > li'), function(li){ if (li.dataset.id) order.push(+li.dataset.id); });
    [].forEach.call(doneList.querySelectorAll(':scope > li'), function(li){ if (li.dataset.id) order.push(+li.dataset.id); });
    tasks.sort(function(a,b){
      var ia = order.indexOf(a.id), ib = order.indexOf(b.id);
      if (ia === -1 && ib === -1) return 0;
      if (ia === -1) return 1;   // fora do filtro atual: mantém depois
      if (ib === -1) return -1;
      return ia - ib;
    });
    saveAll();
    renderTasks();
  }

  // ================= troca de janela durante o foco =================
  // Filosofia: sair da aba durante um Pomodoro NÃO é distração. IDEs, Figma,
  // planilhas, PDFs, documentação: o trabalho quase sempre acontece em outras
  // janelas. O produto presume boa intenção: se a pessoa iniciou a sessão, ela
  // quer trabalhar. O Gon nunca fiscaliza, nunca cobra, nunca quebra a
  // ofensiva por isso. O reconhecimento vem dos marcos de foco conquistados
  // (ver checkFocusMilestones), baseados em tempo real de sessão.
  document.addEventListener('visibilitychange', function(){
    if (document.hidden){
      if (state.running && state.mode === 'pomodoro'){
        state.leftDuringFocus = true;
        state.hiddenAt = Date.now();
      }
    } else {
      // voltou pra aba: acerta o relógio na hora, sem esperar o próximo tick
      // (o display atualiza no instante em que a pessoa volta a olhar)
      if (state.running) tick();
      if (state.leftDuringFocus){
        state.leftDuringFocus = false;
        var away = Date.now() - state.hiddenAt;
        if (away >= 60000){
          // ausência longa: o Gon acompanhou estudando, como parceiro
          setTempState('studyjump', 550);
          setTimeout(function(){ setTempState('studying', 5000); }, 550);
          speak(pick(MSG.companionStudy));
        }
        // ausências curtas: silêncio. Alternar janelas faz parte do trabalho.
      }
    }
  });

  // ================= notifications =================
  // ícone reaproveitado do favicon já embutido no <head>
  var NOTIF_ICON = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAYAAABzenr0AAAAnElEQVR4nGNgGAUjHTCSq/Fmefh/ZL5650qyzGIi1wHUAizYBKnlO3SzsJkz4CEw4A4gKmixBSOuaCIU5BQ7gBRAjAMGPAqIcgA5uYBYPQMeAljLAXzAeu5eOPtosjNOMZIdQG5CwwUImQeLogGPggF3ANGpm9QoGjK5gCgHkJNAidUzNEKAloDkgohQ4iI1urAaNtoiGgWjYEQBAHp+QNhstvhCAAAAAElFTkSuQmCC';
  function askNotifPermission(){
    if (notifAsked || !('Notification' in window)) return;
    notifAsked = true;
    if (Notification.permission === 'default'){
      try{ Notification.requestPermission(); }catch(e){}
    }
  }
  function notify(title, body){
    if (!document.hidden) return;
    if (!('Notification' in window) || Notification.permission !== 'granted') return;
    try{ new Notification(title, { body: body, icon: NOTIF_ICON }); }catch(e){}
  }

  // ================= keyboard shortcuts =================
  document.addEventListener('keydown', function(e){
    var tag = (document.activeElement && document.activeElement.tagName) || '';
    if (tag === 'INPUT' || tag === 'TEXTAREA') {
      if (e.key === 'Escape') document.activeElement.blur();
      return;
    }
    // qualquer modal aberto bloqueia os atalhos. A lista era enumerada e o
    // aquário (e o painel/resumo) ficavam de fora: Espaço disparava o timer
    // escondido e R resetava com o modal na frente
    var modalOpen = !!document.querySelector('.overlay.open');
    if (e.code === 'Space'){
      if (modalOpen) return;
      e.preventDefault();
      toggleStartPause();
    } else if (e.key === 'r' || e.key === 'R'){
      if (modalOpen) return;
      reset();
    } else if (e.key === 'Escape'){
      settingsOverlay.classList.remove('open');
      waterOverlay.classList.remove('open');
      summaryOverlay.classList.remove('open');
    }
  });

  // ================= música (Spotify) =================
  // O player oficial do Spotify é embutido via iframe. Se o usuário estiver logado
  // no Spotify neste navegador, o embed toca as faixas completas; deslogado, toca
  // prévias de 30s. O botão "Entrar no Spotify" abre a tela de login do Spotify.
  var musicOpen = false;

  var hasTriggeredListening = false;
  function triggerListening(){
    setTempState('listening', 6500);
    speak(pick(MSG.listening));
  }
  function toggleMusic(){
    musicOpen = !musicOpen;
    musicPanel.classList.toggle('open', musicOpen);
    musicBtn.classList.toggle('active', musicOpen);
    musicBtn.setAttribute('aria-expanded', musicOpen ? 'true' : 'false');
    if (musicOpen){
      musicPanel.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      // já existe uma playlist pré-carregada no player (mesmo sem trocar de faixa),
      // então a reação do avatar dispara ao abrir o painel, não só ao trocar a música.
      if (!hasTriggeredListening){
        hasTriggeredListening = true;
        triggerListening();
      }
    }
  }
  musicBtn.addEventListener('click', toggleMusic);

  spotifyLogin.addEventListener('click', function(){
    window.open('https://accounts.spotify.com/login', '_blank', 'noopener');
    speak(T('ui.spotifyLoginHint'));
  });

  // aceita link web (open.spotify.com/...), link com locale (/intl-pt/) e URI (spotify:playlist:ID)
  function parseSpotify(input){
    var s = (input || '').trim();
    if (!s) return null;
    var uri = s.match(/^spotify:(playlist|album|track|artist|episode|show):([A-Za-z0-9]+)/);
    if (uri) return uri[1] + '/' + uri[2];
    var url = s.match(/open\.spotify\.com\/(?:intl-[a-z-]+\/)?(playlist|album|track|artist|episode|show)\/([A-Za-z0-9]+)/);
    if (url) return url[1] + '/' + url[2];
    return null;
  }
  // ---- Spotify iFrame API ----
  // Importante: a API oficial do Spotify NÃO oferece nenhum método de volume
  // (setVolume não existe: é uma limitação conhecida e reclamada há anos pelos
  // próprios devs na comunidade do Spotify, sem solução por parte deles). O que a
  // API realmente expõe são play(), pause(), resume(), togglePlay(), seek() e
  // loadUri()/loadEntity(). Por isso o botão aqui pausa/retoma a faixa em vez de
  // controlar volume; é o máximo que dá pra fazer de verdade com o Spotify.
  // ---- Spotify via iframe estático (abordagem robusta) ----
  // Em vez da iframe-api do Spotify (que depende de handshake postMessage e
  // renderiza em branco quando o painel está oculto na criação, em problemas de
  // timing e, sobretudo, quando o arquivo é aberto por file:// sem servidor),
  // embutimos um <iframe> apontando direto pro player de embed. Trocar de
  // playlist/faixa é só trocar o .src do iframe. O play/pause e a barra de
  // progresso ficam nos controles nativos dentro do próprio player do Spotify.
  function spotifyEmbedUrl(path){
    // path no formato "playlist/ID", "album/ID", "track/ID", "artist/ID", etc.
    return 'https://open.spotify.com/embed/' + path + '?utm_source=generator';
  }

  function loadSpotify(path){
    spotifyEmbed.src = spotifyEmbedUrl(path);
    hasTriggeredListening = true;
    triggerListening();
  }

  function setActiveChip(el){
    musicChips.forEach(function(c){ c.classList.toggle('active', c === el); });
  }
  musicChips.forEach(function(chip){
    chip.addEventListener('click', function(){
      loadSpotify(chip.getAttribute('data-uri'));
      setActiveChip(chip);
    });
  });
  function loadFromInput(){
    var path = parseSpotify(spotifyUrl.value);
    if (!path){
      speak(T('ui.spotifyBadLink'));
      spotifyUrl.focus();
      return;
    }
    loadSpotify(path);
    setActiveChip(null);
    spotifyUrl.value = '';
  }
  spotifyLoad.addEventListener('click', loadFromInput);
  spotifyUrl.addEventListener('keydown', function(e){ if (e.key === 'Enter') loadFromInput(); });

  // ---- alternância de serviço (Spotify / YouTube Music) ----
  var currentService = 'spotify';
  function switchService(svc){
    currentService = svc;
    var isYt = svc === 'youtube';
    serviceSpotify.hidden = isYt;
    serviceYoutube.hidden = !isYt;
    spotifyLogin.style.display = isYt ? 'none' : '';
    musicTabs.forEach(function(t){
      t.classList.toggle('active', t.getAttribute('data-service') === svc);
    });
  }
  musicTabs.forEach(function(tab){
    tab.addEventListener('click', function(){ switchService(tab.getAttribute('data-service')); });
  });

  // ---- YouTube (Music) =================
  // Player oficial do YouTube, controlado pela YouTube IFrame Player API (essa,
  // ao contrário da do Spotify, tem setVolume/mute/unMute de verdade e funciona).
  // Toca faixas inteiras de graça (com anúncios, salvo YouTube Premium logado no
  // navegador). Aceita links do youtube.com e do music.youtube.com; vídeo avulso
  // ou playlist.
  function parseYoutube(input){
    var s = (input || '').trim();
    if (!s) return null;
    var m;
    if ((m = s.match(/(?:youtu\.be\/|\/shorts\/|\/embed\/)([A-Za-z0-9_-]{11})/))) return { type:'video', id:m[1] };
    if ((m = s.match(/[?&]v=([A-Za-z0-9_-]{11})/)))                              return { type:'video', id:m[1] };
    if ((m = s.match(/[?&]list=([A-Za-z0-9_-]+)/)))                              return { type:'list',  id:m[1] };
    if (/^[A-Za-z0-9_-]{11}$/.test(s))                                          return { type:'video', id:s };
    if (/^(PL|RD|OL|UU|FL|LL)[A-Za-z0-9_-]+$/.test(s))                          return { type:'list',  id:s };
    return null;
  }

  var ytPlayer = null;
  var ytPlayerReady = false;
  var pendingYtLoad = null;
  var ytMuted = false;
  var ytLastVolume = 70;

  window.onYouTubeIframeAPIReady = function(){
    ytPlayer = new YT.Player('ytFrame', {
      width: '100%',
      height: '152',
      playerVars: { rel: 0, modestbranding: 1, origin: window.location.origin },
      events: {
        onReady: function(){
          ytPlayerReady = true;
          ytPlayer.setVolume(parseInt(ytVolume.value, 10));
          if (pendingYtLoad){
            applyYtLoad(pendingYtLoad.item, pendingYtLoad.autoplay);
            pendingYtLoad = null;
          }
        }
      }
    });
  };
  var ytApiScript = document.createElement('script');
  ytApiScript.src = 'https://www.youtube.com/iframe_api';
  ytApiScript.async = true;
  document.head.appendChild(ytApiScript);

  function applyYtLoad(item, autoplay){
    if (item.type === 'list'){
      ytPlayer.loadPlaylist({ list: item.id });
    } else {
      ytPlayer.loadVideoById(item.id);
    }
    if (!autoplay) ytPlayer.pauseVideo();
  }
  function loadYoutube(item, autoplay){
    if (!item) return;
    ytEmbedWrap.classList.add('has-track');
    if (ytPlayerReady){
      applyYtLoad(item, autoplay);
    } else {
      pendingYtLoad = { item: item, autoplay: autoplay };
    }
    hasTriggeredListening = true;
    triggerListening();
  }

  function paintYtVolume(){
    var v = parseInt(ytVolume.value, 10);
    ytVolume.style.setProperty('--vol-fill', v + '%');
  }
  ytVolume.addEventListener('input', function(){
    var v = parseInt(ytVolume.value, 10);
    if (ytPlayerReady) ytPlayer.setVolume(v);
    ytMuted = v === 0;
    ytVolumeIcon.classList.toggle('muted', ytMuted);
    paintYtVolume();
  });
  paintYtVolume();
  ytMuteBtn.addEventListener('click', function(){
    var v = parseInt(ytVolume.value, 10);
    if (v > 0){
      ytLastVolume = v;
      ytVolume.value = 0;
    } else {
      ytVolume.value = ytLastVolume || 70;
    }
    ytVolume.dispatchEvent(new Event('input'));
  });

  // ---- busca de música dentro do site ----
  // Sem chave de API: consulta instâncias públicas (Piped/Invidious) só pra
  // BUSCAR; a reprodução é sempre pelo player oficial do YouTube embutido.
  var YT_SOURCES = [
    { base: 'https://pipedapi.kavin.rocks',       kind: 'piped' },
    { base: 'https://pipedapi.adminforge.de',     kind: 'piped' },
    { base: 'https://api.piped.private.coffee',   kind: 'piped' },
    { base: 'https://pipedapi.drgns.space',       kind: 'piped' },
    { base: 'https://inv.nadeko.net',             kind: 'invidious' },
    { base: 'https://invidious.nerdvpn.de',       kind: 'invidious' }
  ];
  var ytBusy = false;
  var ytLastQuery = '';

  function fmtSecs(s){
    s = Math.max(0, parseInt(s, 10) || 0);
    var m = Math.floor(s / 60), r = s % 60;
    if (m >= 60){
      var h = Math.floor(m / 60); m = m % 60;
      return h + ':' + (m<10?'0':'') + m + ':' + (r<10?'0':'') + r;
    }
    return m + ':' + (r<10?'0':'') + r;
  }
  function fetchTimeout(url, ms){
    return new Promise(function(resolve, reject){
      var ctl = ('AbortController' in window) ? new AbortController() : null;
      var timer = setTimeout(function(){
        if (ctl) ctl.abort();
        reject(new Error('timeout'));
      }, ms);
      fetch(url, ctl ? { signal: ctl.signal } : {})
        .then(function(r){
          clearTimeout(timer);
          if (!r.ok) throw new Error('http ' + r.status);
          return r.json();
        })
        .then(resolve)
        .catch(function(e){ clearTimeout(timer); reject(e); });
    });
  }
  function normalizePiped(data){
    var items = (data && data.items) || [];
    return items.filter(function(it){
      return it && (it.type === 'stream' || it.url && it.url.indexOf('/watch') === 0);
    }).map(function(it){
      var m = (it.url || '').match(/[?&]v=([A-Za-z0-9_-]{11})/);
      return m ? {
        id: m[1],
        title: it.title || '',
        channel: it.uploaderName || '',
        dur: it.duration || 0,
        thumb: it.thumbnail || ''
      } : null;
    }).filter(Boolean);
  }
  function normalizeInvidious(data){
    return (Array.isArray(data) ? data : []).filter(function(it){
      return it && it.type === 'video' && it.videoId;
    }).map(function(it){
      var th = (it.videoThumbnails || []).filter(function(t){ return t.quality === 'medium' || t.quality === 'default'; });
      return {
        id: it.videoId,
        title: it.title || '',
        channel: it.author || '',
        dur: it.lengthSeconds || 0,
        thumb: th.length ? th[0].url : 'https://i.ytimg.com/vi/' + it.videoId + '/mqdefault.jpg'
      };
    });
  }
  function searchSource(src, query){
    var q = encodeURIComponent(query);
    if (src.kind === 'piped'){
      // primeiro tenta o filtro de músicas; se vier vazio, busca geral
      return fetchTimeout(src.base + '/search?q=' + q + '&filter=music_songs', 5000)
        .then(function(d){
          var r = normalizePiped(d);
          if (r.length) return r;
          return fetchTimeout(src.base + '/search?q=' + q + '&filter=videos', 5000).then(normalizePiped);
        });
    }
    return fetchTimeout(src.base + '/api/v1/search?q=' + q + '&type=video', 5000).then(normalizeInvidious);
  }
  function ytDoSearch(query){
    // dispara em todas as fontes em paralelo; a primeira que responder com
    // resultados vence; as outras são ignoradas.
    return new Promise(function(resolve, reject){
      var pendings = YT_SOURCES.length;
      var done = false;
      YT_SOURCES.forEach(function(src){
        searchSource(src, query).then(function(results){
          pendings--;
          if (!done && results.length){
            done = true;
            resolve(results);
          } else if (!done && pendings === 0){
            reject(new Error('sem resultados'));
          }
        }).catch(function(){
          pendings--;
          if (!done && pendings === 0) reject(new Error('todas as fontes falharam'));
        });
      });
    });
  }
  function renderYtResults(results, query){
    ytResults.innerHTML = '';
    results.slice(0, 8).forEach(function(r){
      var li = document.createElement('li');
      li.dataset.vid = r.id;
      var img = document.createElement('img');
      img.className = 'yt-thumb';
      img.loading = 'lazy';
      img.alt = '';
      img.src = r.thumb || ('https://i.ytimg.com/vi/' + r.id + '/mqdefault.jpg');
      img.onerror = function(){ img.src = 'https://i.ytimg.com/vi/' + r.id + '/mqdefault.jpg'; img.onerror = null; };
      var info = document.createElement('div');
      info.className = 'yt-info';
      var t = document.createElement('span');
      t.className = 'yt-title';
      t.textContent = r.title;
      var m = document.createElement('span');
      m.className = 'yt-meta';
      m.textContent = r.channel;
      info.appendChild(t); info.appendChild(m);
      var dur = document.createElement('span');
      dur.className = 'yt-dur';
      dur.textContent = r.dur ? fmtSecs(r.dur) : '';
      li.appendChild(img); li.appendChild(info); li.appendChild(dur);
      li.addEventListener('click', function(){
        [].forEach.call(ytResults.querySelectorAll('.playing'), function(x){ x.classList.remove('playing'); });
        li.classList.add('playing');
        loadYoutube({ type: 'video', id: r.id }, true);
        ytStatus.textContent = T('ui.ytPlaying', { title: r.title });
      });
      ytResults.appendChild(li);
    });
    ytResults.hidden = false;
    ytStatus.textContent = T(results.length === 1 ? 'ui.ytResultsOne' : 'ui.ytResultsMany', { n: results.length, q: query });
  }
  function ytSearchFailed(query){
    ytResults.hidden = true;
    ytStatus.textContent = T('ui.ytFailed');
    var old = document.getElementById('ytOpenExt');
    if (old) old.remove();
    var btn = document.createElement('button');
    btn.id = 'ytOpenExt';
    btn.className = 'yt-open-ext';
    btn.textContent = T('ui.ytOpenExternal');
    btn.addEventListener('click', function(){
      window.open('https://music.youtube.com/search?q=' + encodeURIComponent(query), '_blank');
    });
    ytStatus.parentNode.insertBefore(btn, ytStatus.nextSibling);
  }
  function runYtSearch(){
    var raw = ytSearch.value.trim();
    if (!raw){ ytSearch.focus(); return; }
    // link colado? toca direto, sem busca
    var direct = parseYoutube(raw);
    if (direct && /youtu\.be|youtube\.com|^[A-Za-z0-9_-]{11}$|^(PL|RD|OL|UU|FL|LL)/.test(raw)){
      loadYoutube(direct, true);
      ytStatus.textContent = T('ui.ytPlayingLink');
      ytResults.hidden = true;
      ytSearch.value = '';
      return;
    }
    if (ytBusy) return;
    ytBusy = true;
    ytLastQuery = raw;
    var old = document.getElementById('ytOpenExt');
    if (old) old.remove();
    ytResults.hidden = true;
    ytStatus.textContent = T('ui.ytSearching', { q: raw });
    ytSearchBtn.disabled = true;
    ytDoSearch(raw).then(function(results){
      ytBusy = false;
      ytSearchBtn.disabled = false;
      if (ytLastQuery !== raw) return;
      renderYtResults(results, raw);
    }).catch(function(){
      ytBusy = false;
      ytSearchBtn.disabled = false;
      if (ytLastQuery !== raw) return;
      ytSearchFailed(raw);
    });
  }
  ytSearchBtn.addEventListener('click', runYtSearch);
  ytSearch.addEventListener('keydown', function(e){ if (e.key === 'Enter') runYtSearch(); });

  // ================= Google Agenda =================
  // Integração 100% client-side via Google Identity Services (OAuth token client).
  // Só LEITURA (calendar.readonly): o usuário conecta a conta dele e vê a agenda
  // da semana aqui. O app não cria nem edita eventos.
  // Não existe backend aqui, então o token vive só na memória desta aba: expira
  // sozinho (~1h) e precisa reconectar depois disso. Não fica nada salvo em servidor.
  //
  // >>> PRA ATIVAR: troque GOOGLE_CLIENT_ID abaixo pelo Client ID OAuth do seu
  // projeto no Google Cloud Console (Google Auth Platform > Clients > Criar cliente,
  // tipo "Aplicativo da Web" / "Web application"). Em "Origens JavaScript autorizadas"
  // cadastre a origem onde esse arquivo roda: pra testar, http://localhost:8000;
  // em produção, https://seudominio.com (só esquema + host, sem caminho, sem barra final).
  // Também habilite a "Google Calendar API" no projeto (APIs e Serviços > Biblioteca).
  //
  // ATENÇÃO (usuários reais): ler o calendário é um escopo "sensível". Enquanto o app
  // estiver em modo teste, só até 100 usuários cadastrados na tela de consentimento
  // conseguem conectar (com aviso de "app não verificado", e a permissão expira em 7 dias).
  // Pra liberar pra qualquer pessoa, é preciso publicar e passar pela verificação do Google.
  var GOOGLE_CLIENT_ID = 'SEU_GOOGLE_CLIENT_ID.apps.googleusercontent.com';
  var GOOGLE_SCOPE = 'https://www.googleapis.com/auth/calendar.readonly';

  var gTokenClient = null;
  var gAccessToken = null;
  var gTokenExpiresAt = 0;
  var calOpen = false;
  var calSelectedDate = new Date();
  var calGisReady = false;

  var CAL_MONTHS = I18N.pack().fmt.monthsShort;
  var CAL_WD = I18N.pack().fmt.calWeekdays;

  // segunda-feira 00:00 da semana que contém d
  function calMondayOf(d){
    var x = new Date(d); x.setHours(0,0,0,0);
    var wd = x.getDay();              // 0=dom .. 6=sáb
    var off = (wd === 0) ? -6 : (1 - wd);
    x.setDate(x.getDate() + off);
    return x;
  }

  function calWeekBounds(d){
    var start = calMondayOf(d);
    var end = new Date(start); end.setDate(end.getDate() + 6); end.setHours(23,59,59,999);
    return { start: start, end: end };
  }

  function calFmtWeekLabel(d){
    var b = calWeekBounds(d);
    var s = b.start, e = b.end;
    var sd = s.getDate(), ed = e.getDate();
    if (s.getMonth() === e.getMonth()){
      return sd + '–' + ed + I18N.pack().fmt.dateSep + CAL_MONTHS[s.getMonth()];
    }
    return sd + ' ' + CAL_MONTHS[s.getMonth()] + ' – ' + ed + ' ' + CAL_MONTHS[e.getMonth()];
  }

  function calDateKey(d){
    return d.getFullYear() + '-' +
      String(d.getMonth()+1).padStart(2,'0') + '-' +
      String(d.getDate()).padStart(2,'0');
  }

  // chave local (YYYY-MM-DD) do dia em que o evento começa
  function calEventDayKey(ev){
    if (ev.start && ev.start.dateTime) return calDateKey(new Date(ev.start.dateTime));
    if (ev.start && ev.start.date) return calDateKey(new Date(ev.start.date + 'T00:00:00'));
    return null;
  }

  // horário de início (ms) pra ordenar dentro do dia; dia-todo vem primeiro
  function calEventStartMs(ev){
    if (ev.start && ev.start.dateTime) return new Date(ev.start.dateTime).getTime();
    if (ev.start && ev.start.date) return new Date(ev.start.date + 'T00:00:00').getTime();
    return 0;
  }

  function calSetConnectedUI(isOn){
    calStatusDot.classList.toggle('is-on', isOn);
    calStatusText.textContent = isOn ? T('ui.calConnected') : T('ui.calDisconnectedStatus');
    calDisconnectBtn.hidden = !isOn;
    calConnectBtn.hidden = isOn;
    calDisconnected.hidden = isOn;
    calConnected.hidden = !isOn;
  }

  function ensureGisLoaded(cb){
    if (calGisReady && window.google && google.accounts && google.accounts.oauth2){ cb(); return; }
    var s = document.createElement('script');
    s.src = 'https://accounts.google.com/gsi/client';
    s.async = true;
    s.defer = true;
    s.onload = function(){ calGisReady = true; cb(); };
    s.onerror = function(){
      speak(T('ui.calScriptFail'));
    };
    document.head.appendChild(s);
  }

  function initTokenClient(){
    if (gTokenClient) return;
    gTokenClient = google.accounts.oauth2.initTokenClient({
      client_id: GOOGLE_CLIENT_ID,
      scope: GOOGLE_SCOPE,
      callback: function(resp){
        if (resp && resp.access_token){
          gAccessToken = resp.access_token;
          gTokenExpiresAt = Date.now() + ((resp.expires_in || 3600) * 1000);
          calSetConnectedUI(true);
          calSelectedDate = new Date();
          calRenderDayLabel();
          calFetchEvents();
          speak(T('ui.calConnectedSpeak'));
          setTempState('proud', 2200);
        } else {
          speak(T('ui.calLoginAborted'));
        }
      },
      error_callback: function(){
        speak(T('ui.calLoginRefused'));
      }
    });
  }

  function calConnect(){
    if (GOOGLE_CLIENT_ID.indexOf('SEU_GOOGLE_CLIENT_ID') === 0){
      speak(T('ui.calNoClientId'));
      return;
    }
    ensureGisLoaded(function(){
      initTokenClient();
      gTokenClient.requestAccessToken({ prompt: gAccessToken ? '' : 'consent' });
    });
  }

  function calDisconnect(){
    if (gAccessToken && window.google && google.accounts && google.accounts.oauth2){
      google.accounts.oauth2.revoke(gAccessToken, function(){});
    }
    gAccessToken = null;
    gTokenExpiresAt = 0;
    calSetConnectedUI(false);
  }

  function calAuthedFetch(url, options){
    options = options || {};
    options.headers = options.headers || {};
    options.headers['Authorization'] = 'Bearer ' + gAccessToken;
    return fetch(url, options).then(function(r){
      if (r.status === 401){
        // token expirou ou foi revogado por fora
        calDisconnect();
        speak(T('ui.calExpired'));
        throw new Error('token expired');
      }
      return r;
    });
  }

  function calRenderDayLabel(){
    calDayLabel.textContent = calFmtWeekLabel(calSelectedDate);
  }

  function calEscapeHtml(s){
    var d = document.createElement('div');
    d.textContent = s || '';
    return d.innerHTML;
  }

  // uma linha de evento
  function calEventRowHtml(ev){
    var timeStr;
    if (ev.start && ev.start.dateTime){
      var st = new Date(ev.start.dateTime);
      timeStr = String(st.getHours()).padStart(2,'0') + ':' + String(st.getMinutes()).padStart(2,'0');
    } else {
      timeStr = T('ui.calAllDay');
    }
    var title = calEscapeHtml(ev.summary || T('ui.calNoTitle'));
    var link = ev.htmlLink ?
      '<a class="cal-event-link" href="' + ev.htmlLink + '" target="_blank" rel="noopener" title="' + calEscapeHtml(T('ui.calOpenInGoogle')) + '"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg></a>' : '';
    return '<div class="cal-event"><span class="cal-event-time">' + timeStr + '</span><span class="cal-event-title">' + title + '</span>' + link + '</div>';
  }

  // monta a semana: 7 dias (seg→dom), cada um com seus eventos
  function calRenderWeek(items){
    var start = calMondayOf(calSelectedDate);
    var byDay = {};
    (items || []).forEach(function(ev){
      var key = calEventDayKey(ev);
      if (!key) return;
      (byDay[key] = byDay[key] || []).push(ev);
    });
    var todayKey = calDateKey(new Date());
    var html = '';
    for (var i = 0; i < 7; i++){
      var d = new Date(start); d.setDate(start.getDate() + i);
      var key = calDateKey(d);
      var isToday = key === todayKey;
      var evs = (byDay[key] || []).sort(function(a,b){ return calEventStartMs(a) - calEventStartMs(b); });
      html += '<div class="cal-day-group">';
      html += '<div class="cal-day-header' + (isToday ? ' is-today' : '') + '">'
        + CAL_WD[i] + ' · ' + String(d.getDate()).padStart(2,'0')
        + (isToday ? T('ui.calToday') : '') + '</div>';
      if (!evs.length){
        html += '<div class="cal-day-empty">' + calEscapeHtml(T('ui.calDayEmpty')) + '</div>';
      } else {
        evs.forEach(function(ev){ html += calEventRowHtml(ev); });
      }
      html += '</div>';
    }
    calEventList.innerHTML = html;
  }

  function calFetchEvents(){
    if (!gAccessToken) return;
    calEventList.innerHTML = '<div class="cal-loading">' + calEscapeHtml(T('ui.calLoading')) + '</div>';
    var b = calWeekBounds(calSelectedDate);
    var url = 'https://www.googleapis.com/calendar/v3/calendars/primary/events'
      + '?timeMin=' + encodeURIComponent(b.start.toISOString())
      + '&timeMax=' + encodeURIComponent(b.end.toISOString())
      + '&singleEvents=true&orderBy=startTime&maxResults=250';
    calAuthedFetch(url).then(function(r){ return r.json(); }).then(function(data){
      calRenderWeek(data.items || []);
    }).catch(function(){
      calEventList.innerHTML = '<div class="cal-empty">' + calEscapeHtml(T('ui.calLoadFail')) + '</div>';
    });
  }

  function toggleCal(){
    calOpen = !calOpen;
    calPanel.classList.toggle('open', calOpen);
    calBtn.classList.toggle('active', calOpen);
    calBtn.setAttribute('aria-expanded', calOpen ? 'true' : 'false');
    if (calOpen){
      calPanel.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      calRenderDayLabel();
      if (gAccessToken) calFetchEvents();
    }
  }
  calBtn.addEventListener('click', toggleCal);
  calConnectBtn.addEventListener('click', calConnect);
  calDisconnectBtn.addEventListener('click', calDisconnect);

  calPrevDay.addEventListener('click', function(){
    calSelectedDate.setDate(calSelectedDate.getDate() - 7);
    calRenderDayLabel();
    calFetchEvents();
  });
  calNextDay.addEventListener('click', function(){
    calSelectedDate.setDate(calSelectedDate.getDate() + 7);
    calRenderDayLabel();
    calFetchEvents();
  });
  calTodayBtn.addEventListener('click', function(){
    calSelectedDate = new Date();
    calRenderDayLabel();
    calFetchEvents();
  });

  // ================= confetti =================
  function launchConfetti(count){
    // sempre que cair confete, o avatar comemora pulando de alegria
    setTempState('proud', 2200);
    var inkColor = getComputedStyle(document.documentElement).getPropertyValue('--ink').trim() || '#FFFFDF';
    var colors = [currentAccentHex, inkColor];
    for (var i=0;i<count;i++){
      var p = document.createElement('div');
      p.className = 'confetti-piece';
      p.style.left = Math.random()*100 + '%';
      p.style.background = colors[Math.floor(Math.random()*colors.length)];
      p.style.width = (5 + Math.random()*6) + 'px';
      p.style.height = (8 + Math.random()*8) + 'px';
      p.style.animationDelay = (Math.random()*0.5) + 's, ' + (Math.random()*0.6) + 's';
      p.style.animationDuration = (2.4 + Math.random()*1.8) + 's, ' + (0.6 + Math.random()*0.6) + 's';
      confettiContainer.appendChild(p);
    }
    setTimeout(function(){
      while (confettiContainer.firstChild) confettiContainer.removeChild(confettiContainer.firstChild);
    }, 5400);
  }

  // ================= modals =================
  var introPendingGreeting = false;
  function submitName(){
    var v = nameInput.value.trim();
    if (!v){ nameInput.focus(); return; }
    userName = v.charAt(0).toUpperCase() + v.slice(1);
    saveAll();
    nameOverlay.classList.remove('open');
    nextWaterAt = Date.now() + waterIntervalMin * 60000;
    lastActive = Date.now();
    // primeira visita: Gon se apresenta e convida a pessoa a conhecer a história dele
    // antes de liberar o app; a saudação por horário fica pra depois de fechar o painel.
    introGreet.textContent = T('ui.introGreet', { name: userName });
    introPendingGreeting = true;
    setTimeout(function(){ introOverlay.classList.add('open'); }, 400);
  }
  nameSubmit.addEventListener('click', submitName);
  nameInput.addEventListener('keydown', function(e){ if (e.key === 'Enter') submitName(); });
  setTimeout(function(){ nameInput.focus(); }, 300);

  function openAboutPanel(){
    pvCurrent = 'about';
    pvTabs.forEach(function(t){ t.classList.toggle('active', t.getAttribute('data-v') === 'about'); });
    openPanel();
  }
  introStoryBtn.addEventListener('click', function(){
    introOverlay.classList.remove('open');
    openAboutPanel();
  });

  var brandLogo = $('brandLogo');
  brandLogo.addEventListener('click', openAboutPanel);
  brandLogo.addEventListener('keydown', function(e){
    if (e.key === 'Enter' || e.key === ' '){ e.preventDefault(); openAboutPanel(); }
  });

  var pendingWaterGoalLiters = waterGoalLiters;
  function setWaterGoalSelectValue(liters){
    pendingWaterGoalLiters = liters;
    wgOpts.forEach(function(btn){
      btn.classList.toggle('active', parseInt(btn.getAttribute('data-l'),10) === liters);
    });
  }
  wgOpts.forEach(function(btn){
    btn.addEventListener('click', function(){
      setWaterGoalSelectValue(parseInt(btn.getAttribute('data-l'),10));
    });
  });
  function openSettings(){
    inputName.value = userName;
    inputPomodoro.value = durations.pomodoro;
    inputShort.value = durations.short;
    inputLong.value = durations.long;
    inputWater.value = waterIntervalMin;
    setWaterGoalSelectValue(waterGoalLiters);
    inputGoalPomos.value = settingsV2.goalPomos;
    inputGoalTasks.value = settingsV2.goalTasks;
    setFocusModeSelect(settingsV2.autoFocus);
    settingsOverlay.classList.add('open');
  }
  function closeSettings(){ settingsOverlay.classList.remove('open'); }
  saveBtn.addEventListener('click', function(){
    var newName = inputName.value.trim();
    var nameWasChanged = false;
    if (newName && newName !== userName){
      userName = newName.charAt(0).toUpperCase() + newName.slice(1);
      nameWasChanged = true;
    }
    durations.pomodoro = Math.min(1440, Math.max(1, parseInt(inputPomodoro.value,10) || 25));
    durations.short    = Math.min(60,  Math.max(1, parseInt(inputShort.value,10) || 5));
    durations.long     = Math.min(90,  Math.max(1, parseInt(inputLong.value,10) || 15));
    var w = Math.min(120, Math.max(1, parseInt(inputWater.value,10) || 20));
    if (w !== waterIntervalMin){
      waterIntervalMin = w;
      nextWaterAt = Date.now() + waterIntervalMin * 60000;
    }
    waterGoalLiters = pendingWaterGoalLiters;
    settingsV2.goalPomos = Math.min(30, Math.max(1, parseInt(inputGoalPomos.value,10) || 8));
    settingsV2.goalTasks = Math.min(50, Math.max(1, parseInt(inputGoalTasks.value,10) || 5));
    settingsV2.autoFocus = pendingAutoFocus;
    saveAll();
    renderWaterAll();
    renderDayStrip();
    closeSettings();
    speak(nameWasChanged ? pick(MSG.nameChanged) : pick(MSG.settingsSaved));
    // atualiza os tempos guardados dos modos que nao estao em uso pro novo valor configurado
    ['pomodoro','short','long'].forEach(function(m){
      if (m !== state.mode) savedRemaining[m] = durations[m] * 60;
    });
    switchMode(state.mode, { reset: !isFreeRun() });
  });
  cancelBtn.addEventListener('click', closeSettings);
  settingsOverlay.addEventListener('click', function(e){ if (e.target === settingsOverlay) closeSettings(); });
  settingsBtn.addEventListener('click', openSettings);

  // ================= events =================
  startBtn.addEventListener('click', toggleStartPause);
  resetBtn.addEventListener('click', reset);
  skipBtn.addEventListener('click', skipBreak);
  // controles do descanso na view do jogo (a .controls padrão fica oculta em .card.is-game);
  // existem em duas telas (desafio e partida), por isso a seleção por classe
  var ggPauseBtns = document.querySelectorAll('.gg-pause-btn');
  var ggSkipBtns = document.querySelectorAll('.gg-skip-btn');
  ggPauseBtns.forEach(function(b){ b.addEventListener('click', toggleStartPause); });
  ggSkipBtns.forEach(function(b){ b.addEventListener('click', skipBreak); });
  tabs.forEach(function(t){
    t.addEventListener('click', function(){
      if (state.running){
        t.classList.remove('locked-shake');
        void t.offsetWidth; // reinicia a animação se clicar de novo
        t.classList.add('locked-shake');
        speak(pick(MSG.lockedTab));
        return;
      }
      switchMode(t.dataset.mode);
    });
  });

  // ================================================================
  // v2.0: persistência, estatísticas, calendário, conquistas,
  // níveis, rotinas, cronômetro, modo foco, planejar, resumo.
  // ================================================================

  // ---- helpers ----
  function escHtml(s){
    return String(s).replace(/[&<>"']/g, function(c){
      return { '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c];
    });
  }
  function v2DayKey(d){
    return d.getFullYear() + '-' + String(d.getMonth()+1).padStart(2,'0') + '-' + String(d.getDate()).padStart(2,'0');
  }
  function v2EndOfWeek(){
    var d = new Date();
    d.setDate(d.getDate() + (6 - d.getDay())); // sábado desta semana
    return d;
  }
  function fmtDur(sec){
    var f = I18N.pack().fmt;
    if (sec < 60) return sec > 0 ? f.lessThanMin : f.zeroMin;
    var m = Math.round(sec/60);
    if (m < 60) return m + f.minShort;
    var h = Math.floor(m/60), r = m % 60;
    return r > 0 ? h + f.hourShort + (r<10?'0':'') + r : h + f.hourShort;
  }
  function fmtL(ml){
    var v = (ml/1000).toFixed(ml % 1000 === 0 ? 0 : 1);
    if (I18N.pack().meta.decimalComma) v = v.replace('.', ',');
    return v + 'L';
  }

  // ---- armazenamento ----
  var PF_KEY = 'gon.v2';
  var storeOk = (function(){
    try { localStorage.setItem('__pf_t','1'); localStorage.removeItem('__pf_t'); return true; }
    catch(e){ return false; }
  })();
  var DB = {
    name: '', settings: null, tasks: null, taskSeq: 1, subSeq: 1,
    days: {}, xp: 0, ach: {}, routines: [], rotSeq: 1,
    appSec: 0, water: null, fish: null
  };
  var dbDirty = false;
  function markDirty(){ dbDirty = true; }
  function saveAll(){
    DB.name = userName;
    DB.settings = {
      pomodoro: durations.pomodoro, short: durations.short, long: durations.long,
      waterInt: waterIntervalMin, waterGoal: waterGoalLiters,
      goalPomos: settingsV2.goalPomos, goalTasks: settingsV2.goalTasks, autoFocus: settingsV2.autoFocus
    };
    DB.tasks = tasks;
    DB.taskSeq = taskSeq;
    DB.subSeq = subSeq;
    DB.water = { day: waterDayKey, log: waterLog, seq: waterSeq };
    dbDirty = false;
    if (!storeOk) return;
    try { localStorage.setItem(PF_KEY, JSON.stringify(DB)); } catch(e){}
  }
  function loadAll(){
    if (!storeOk) return;
    try {
      var raw = localStorage.getItem(PF_KEY);
      if (!raw) return;
      var d = JSON.parse(raw);
      if (d && typeof d === 'object'){
        for (var k in DB){ if (d[k] !== undefined) DB[k] = d[k]; }
      }
    } catch(e){}
  }

  // ---- registro diário ----
  function v2Today(){
    var k = v2DayKey(new Date());
    if (!DB.days[k]) DB.days[k] = { f:0, p:0, t:0, w:0, hours:{}, closed:false, wg:false };
    return DB.days[k];
  }
  var v2SaveTick = 0;
  // aceita quantos segundos registrar de uma vez (o tick compensado pode
  // precisar creditar vários segundos após a aba voltar do segundo plano)
  function v2FocusSecond(n){
    n = Math.max(1, n | 0);
    var d = v2Today();
    d.f += n;
    var h = new Date().getHours();
    d.hours[h] = (d.hours[h] || 0) + n;
    v2SaveTick += n;
    if (v2SaveTick >= 15){ v2SaveTick = 0; markDirty(); }
    if (totalFocusSec() >= 36000) unlockAch('focus_10h');
    if (totalFocusSec() >= 360000) unlockAch('focus_100h');
  }
  function v2PomodoroDone(){
    var d = v2Today();
    d.p++;
    addXp(20);
    unlockAch('first_pomo');
    if (totalPomos() >= 10) unlockAch('pomos_10');
    if (totalPomos() >= 100) unlockAch('pomos_100');
    var s = v2StreakDays();
    if (s >= 7) unlockAch('streak_7');
    if (s >= 30) unlockAch('streak_30');
    markDirty();
    renderDayStrip();
  }
  function v2TaskCreated(){
    unlockAch('first_task');
  }
  function v2TaskToggled(nowDone){
    var d = v2Today();
    if (nowDone){
      d.t++;
      addXp(5);
      if (totalTasksDone() >= 100) unlockAch('tasks_100');
    } else {
      d.t = Math.max(0, d.t - 1);
      DB.xp = Math.max(0, DB.xp - 5);
    }
    markDirty();
    renderDayStrip();
  }
  function v2WaterSync(){
    var d = v2Today();
    d.w = mlToday;
    if (!d.wg && mlToday >= waterGoalLiters * 1000){
      d.wg = true;
      addXp(10);
      if (waterGoalDays() >= 7) unlockAch('water_goal_7');
    }
    markDirty();
    renderDayStrip();
  }

  // ---- agregações ----
  function totalFocusSec(){
    var s = 0;
    for (var k in DB.days) s += DB.days[k].f || 0;
    return s;
  }
  function totalPomos(){
    var s = 0;
    for (var k in DB.days) s += DB.days[k].p || 0;
    return s;
  }
  function totalTasksDone(){
    var s = 0;
    for (var k in DB.days) s += DB.days[k].t || 0;
    return s;
  }
  function waterGoalDays(){
    var s = 0;
    for (var k in DB.days) if (DB.days[k].wg) s++;
    return s;
  }
  function v2StreakDays(){
    // dias consecutivos (terminando hoje ou ontem) com pelo menos 1 pomodoro
    var n = 0;
    var d = new Date();
    var today = DB.days[v2DayKey(d)];
    if (!today || !today.p){ d.setDate(d.getDate() - 1); } // hoje ainda sem pomodoro: conta a partir de ontem
    while (true){
      var rec = DB.days[v2DayKey(d)];
      if (rec && rec.p > 0){ n++; d.setDate(d.getDate() - 1); }
      else break;
    }
    return n;
  }
  function bestStreakDays(){
    var keys = Object.keys(DB.days).filter(function(k){ return DB.days[k].p > 0; }).sort();
    var best = 0, run = 0, prev = null;
    keys.forEach(function(k){
      if (prev){
        var pd = new Date(prev + 'T12:00:00');
        pd.setDate(pd.getDate() + 1);
        run = (v2DayKey(pd) === k) ? run + 1 : 1;
      } else run = 1;
      if (run > best) best = run;
      prev = k;
    });
    return best;
  }

  // ---- XP / níveis ----
  function xpForLevel(n){ return 100 + (n - 1) * 50; } // custo para sair do nível n
  function levelInfo(){
    var xp = DB.xp, lvl = 1;
    while (xp >= xpForLevel(lvl)){ xp -= xpForLevel(lvl); lvl++; }
    return { level: lvl, into: xp, need: xpForLevel(lvl) };
  }
  function addXp(n){
    var before = levelInfo().level;
    DB.xp += n;
    var after = levelInfo().level;
    if (after > before) speak(pick(MSG.levelUp).replace(/\{lvl\}/g, after));
    markDirty();
    renderLevel();
  }
  function renderLevel(){
    var li = levelInfo();
    levelTag.textContent = T('ui.level', { n: li.level });
    levelFill.style.width = Math.round((li.into / li.need) * 100) + '%';
    levelXp.textContent = li.into + '/' + li.need + ' xp';
  }

  // ---- conquistas ----
  // só o id e a forma vivem aqui; título e descrição vêm do pacote de idioma
  var ACH = [
    { id:'first_task',       shape:'circle'  },
    { id:'first_pomo',       shape:'circle'  },
    { id:'pomos_10',         shape:'diamond' },
    { id:'pomos_100',        shape:'diamond' },
    { id:'tasks_100',        shape:'square'  },
    { id:'streak_7',         shape:'hex'     },
    { id:'streak_30',        shape:'hex'     },
    { id:'focus_10h',        shape:'tri'     },
    { id:'focus_100h',       shape:'tri'     },
    { id:'water_goal_7',     shape:'circle'  },
    { id:'day_closed_first', shape:'square'  },
    { id:'routine_first',    shape:'hex'     }
  ];
  function achText(id){ return I18N.pack().ACH[id] || { title: id, desc: '' }; }
  function achShapeSvg(shape){
    var inner;
    if (shape === 'diamond') inner = '<rect class="ach-shape" x="6" y="6" width="12" height="12" transform="rotate(45 12 12)"/>';
    else if (shape === 'square') inner = '<rect class="ach-shape" x="5" y="5" width="14" height="14" rx="2"/>';
    else if (shape === 'tri') inner = '<polygon class="ach-shape" points="12,4 21,19 3,19"/>';
    else if (shape === 'hex') inner = '<polygon class="ach-shape" points="12,3 20,7.5 20,16.5 12,21 4,16.5 4,7.5"/>';
    else inner = '<circle class="ach-shape" cx="12" cy="12" r="8"/>';
    return '<svg viewBox="0 0 24 24">' + inner + '<circle class="ach-core" cx="12" cy="12" r="2.4"/></svg>';
  }
  function unlockAch(id){
    if (DB.ach[id]) return;
    var a = null;
    for (var i=0;i<ACH.length;i++) if (ACH[i].id === id) a = ACH[i];
    if (!a) return;
    DB.ach[id] = Date.now();
    markDirty();
    launchConfetti(30);
    speak(pick(MSG.achUnlock).replace(/\{ach\}/g, achText(id).title));
  }
  function renderAch(){
    achGrid.innerHTML = ACH.map(function(a){
      var ts = DB.ach[a.id];
      var date = '';
      if (ts){
        var d = new Date(ts);
        date = '<span class="ach-date">' + String(d.getDate()).padStart(2,'0') + '/' + String(d.getMonth()+1).padStart(2,'0') + '/' + d.getFullYear() + '</span>';
      }
      var txt = achText(a.id);
      return '<div class="ach-item' + (ts ? ' unlocked' : '') + '">' +
        '<div class="ach-mark">' + achShapeSvg(a.shape) + '</div>' +
        '<div class="ach-body"><p class="ach-title">' + escHtml(txt.title) + '</p><p class="ach-desc">' + escHtml(txt.desc) + '</p>' + date + '</div></div>';
    }).join('');
  }

  function renderDayStrip(){
    if (!dsFocus) return;
    var d = v2Today();
    dsFocus.textContent = fmtDur(d.f);
    dsPomos.textContent = d.p + '/' + settingsV2.goalPomos;
    dsPomosBar.style.width = Math.min(100, Math.round((d.p / settingsV2.goalPomos) * 100)) + '%';
    dsTasks.textContent = d.t + '/' + settingsV2.goalTasks;
    dsTasksBar.style.width = Math.min(100, Math.round((d.t / settingsV2.goalTasks) * 100)) + '%';
    dsWater.textContent = fmtL(d.w) + '/' + waterGoalLiters + 'L';
    dsWaterBar.style.width = Math.min(100, Math.round((d.w / (waterGoalLiters * 1000)) * 100)) + '%';
    var s = v2StreakDays();
    dsStreak.textContent = T(s === 1 ? 'ui.dsDay' : 'ui.dsDays', { n: s });
  }

  // ---- modo foco ----
  function enterFocusMode(){ document.body.classList.add('focus-on'); finishBtn.hidden = false; }
  function exitFocusMode(){ document.body.classList.remove('focus-on'); }
  finishBtn.addEventListener('click', function(){
    pause();
    if (isFreeRun()){
      var elapsed = chronoElapsed;
      chronoElapsed = 0;
      savedElapsed[state.mode] = 0;
      state.remaining = state.total;
      speak(elapsed >= 60 ? T('ui.speakFreeLogged', { dur: fmtDur(elapsed), name: '{name}' }) : pick(MSG.sessionFinished));
      notify(T('ui.notifFreeDone'), fillName(T('ui.notifFreeDoneBody', { dur: fmtDur(elapsed), name: '{name}' })));
    } else {
      savedRemaining[state.mode] = state.total;
      state.remaining = state.total;
      speak(pick(MSG.sessionFinished));
      notify(T('ui.notifSessionEnd'), fillName(T('ui.notifSessionEndBody')));
    }
    exitFocusMode();
    markDirty();
    render();
  });

  // ---- cronômetro / sessão livre ----
  // cada modo lembra sua última opção escolhida: pomodoro/short/long usam
  // "down" (regressivo, duração fixa) ou "free" (sessão livre, sem duração);
  // chrono usa "up" (cronômetro livre) ou "free" (sessão livre).
  var modeSelection = { pomodoro: 'down', short: 'down', long: 'down', chrono: 'up' };
  var chronoDir = modeSelection.pomodoro; // reflete a opção do modo ativo
  var chronoElapsed = 0;
  var savedElapsed = { pomodoro: 0, short: 0, long: 0, chrono: 0 };
  function isFreeRun(){
    return chronoDir === 'free' || (state.mode === 'chrono' && chronoDir === 'up');
  }
  function updateChronoUI(mode){
    // na aba Cronômetro não existe uma escolha real: o cronômetro em si já
    // É a "sessão livre" (conta pra cima, sem meta). Um regressivo não faz
    // sentido aqui (isso já é o papel do Pomodoro/Pausa curta/Pausa longa),
    // então o toggle inteiro só aparece nas outras 3 abas, onde a escolha
    // entre Regressivo e Sessão livre é de fato uma escolha.
    chronoOpts.hidden = (mode === 'chrono');
    chronoOptBtns.forEach(function(btn){
      var dir = btn.getAttribute('data-dir');
      btn.hidden = (mode === 'chrono') ? (dir === 'down') : (dir === 'up');
      btn.classList.toggle('active', dir === chronoDir);
    });
  }
  chronoOptBtns.forEach(function(btn){
    btn.addEventListener('click', function(){
      if (state.running || btn.hidden) return;
      var dir = btn.getAttribute('data-dir');
      chronoDir = dir;
      modeSelection[state.mode] = dir;
      chronoOptBtns.forEach(function(b){ b.classList.toggle('active', b === btn); });
      chronoElapsed = 0;
      savedElapsed[state.mode] = 0;
      if (isFreeRun()){
        state.total = 0;
        state.remaining = 0;
      } else {
        state.total = durations[state.mode] * 60;
        state.remaining = state.total;
        savedRemaining[state.mode] = state.total;
      }
      render();
    });
  });

  // ---- configurações v2 ----
  var settingsV2 = { goalPomos: 8, goalTasks: 5, autoFocus: true };
  var subSeq = 1;
  var pendingAutoFocus = settingsV2.autoFocus;
  function setFocusModeSelect(on){
    pendingAutoFocus = !!on;
    fmOpts.forEach(function(btn){
      btn.classList.toggle('active', (btn.getAttribute('data-v') === '1') === pendingAutoFocus);
    });
  }
  fmOpts.forEach(function(btn){
    btn.addEventListener('click', function(){ setFocusModeSelect(btn.getAttribute('data-v') === '1'); });
  });

  // ---- painel ----
  var pvCurrent = 'stats';
  var statRangeSel = 'today';
  var panelSpoken = false;
  function openPanel(){
    panelOverlay.classList.add('open');
    renderLevel();
    renderPanelView();
    if (pvCurrent === 'about') Fireplace.start();
    syncCrickets();
    if (!panelSpoken){ panelSpoken = true; speak(pick(MSG.panelOpen)); }
  }
  function closePanel(){
    panelOverlay.classList.remove('open');
    Fireplace.stop();
    Crickets.stop();
    if (introPendingGreeting){
      introPendingGreeting = false;
      setTimeout(function(){ speak(greetingByTime()); }, 400);
    }
  }
  panelBtn.addEventListener('click', openPanel);
  panelClose.addEventListener('click', closePanel);
  panelOverlay.addEventListener('click', function(e){ if (e.target === panelOverlay) closePanel(); });
  pvTabs.forEach(function(tab){
    tab.addEventListener('click', function(){
      pvCurrent = tab.getAttribute('data-v');
      pvTabs.forEach(function(t){ t.classList.toggle('active', t === tab); });
      renderPanelView();
      if (pvCurrent === 'about') Fireplace.start(); else { Fireplace.stop(); Crickets.stop(); }
      syncCrickets();
    });
  });
  // grilos: só cantam enquanto a cena do Gon com a fogueira está de fato
  // visível na tela (o usuário precisa rolar até ela dentro da aba "Sobre").
  // syncCrickets fica exposta pra ser chamada tanto pelo observer de rolagem
  // quanto na hora de abrir o painel, já que o overlay fica no layout (só
  // com opacidade 0) mesmo fechado, então o observer sozinho não pega isso.
  var campfireVisible = new Set();
  function syncCrickets(){
    var shouldSing = campfireVisible.size > 0 && pvCurrent === 'about' && panelOverlay.classList.contains('open');
    if (shouldSing) Crickets.start(); else Crickets.stop();
  }
  (function(){
    var campfireTargets = [$('gonCampfire'), $('gonCampfire2')].filter(Boolean);
    if (!campfireTargets.length || !('IntersectionObserver' in window)) return;
    var io = new IntersectionObserver(function(entries){
      entries.forEach(function(en){
        if (en.isIntersecting) campfireVisible.add(en.target); else campfireVisible.delete(en.target);
      });
      syncCrickets();
    }, { threshold: 0.4 });
    campfireTargets.forEach(function(t){ io.observe(t); });
  })();
  var fireplaceSoundBtn = $('fireplaceSoundBtn');
  if (fireplaceSoundBtn){
    function updateFireplaceBtn(){
      fireplaceSoundBtn.classList.toggle('muted', Fireplace.isMuted());
      var label = Fireplace.isMuted() ? T('ui.fireplaceUnmute') : T('ui.fireplaceMute');
      fireplaceSoundBtn.setAttribute('aria-label', label);
      fireplaceSoundBtn.title = T('ui.fireplaceTitle');
    }
    fireplaceSoundBtn.addEventListener('click', function(e){
      e.stopPropagation();
      Fireplace.setMuted(!Fireplace.isMuted(), pvCurrent === 'about' && panelOverlay.classList.contains('open'));
      updateFireplaceBtn();
    });
    updateFireplaceBtn();
    I18N.onChange(updateFireplaceBtn);
  }
  function renderPanelView(){
    for (var k in pvViews) pvViews[k].hidden = (k !== pvCurrent);
    if (pvCurrent === 'stats') renderStats();
    else if (pvCurrent === 'cal') renderHeat();
    else if (pvCurrent === 'ach') renderAch();
    else if (pvCurrent === 'rec') renderRecords();
    else if (pvCurrent === 'rot') renderRoutines();
  }
  segBtns.forEach(function(btn){
    btn.addEventListener('click', function(){
      statRangeSel = btn.getAttribute('data-r');
      segBtns.forEach(function(b){ b.classList.toggle('active', b === btn); });
      renderStats();
    });
  });

  // ---- estatísticas ----
  function rangeKeys(range){
    var keys = [];
    var d = new Date();
    if (range === 'today'){ keys.push(v2DayKey(d)); return keys; }
    var n = range === 'week' ? 7 : range === 'month' ? 30 : 365;
    for (var i = n - 1; i >= 0; i--){
      var dd = new Date();
      dd.setDate(dd.getDate() - i);
      keys.push(v2DayKey(dd));
    }
    return keys;
  }
  function sumRange(keys){
    var out = { f:0, p:0, t:0, w:0, hours:{}, days:0 };
    keys.forEach(function(k){
      var d = DB.days[k];
      if (!d) return;
      out.f += d.f || 0; out.p += d.p || 0; out.t += d.t || 0; out.w += d.w || 0;
      if ((d.f || 0) > 0 || (d.p || 0) > 0) out.days++;
      for (var h in d.hours) out.hours[h] = (out.hours[h] || 0) + d.hours[h];
    });
    return out;
  }
  function statItem(label, value){
    return '<div class="stat-item"><span class="si-label">' + label + '</span><span class="si-value">' + value + '</span></div>';
  }
  function renderStats(){
    var keys = rangeKeys(statRangeSel);
    var s = sumRange(keys);
    var html = statItem(T('ui.statFocusTime'), fmtDur(s.f)) +
               statItem(T('ui.statPomos'), s.p) +
               statItem(T('ui.statTasks'), s.t) +
               statItem(T('ui.statWater'), fmtL(s.w));
    if (statRangeSel === 'today'){
      html += statItem(T('ui.statStreak'), v2StreakDays() + ' <small>' + escHtml(T('ui.statStreakUnit')) + '</small>');
    } else {
      var act = Math.max(1, s.days);
      html += statItem(T('ui.statAvgFocus'), fmtDur(Math.round(s.f / act)) + ' <small>' + escHtml(T('ui.statAvgFocusUnit')) + '</small>');
      html += statItem(T('ui.statActiveDays'), s.days + ' <small>' + escHtml(T('ui.statActiveDaysOf', { n: keys.length })) + '</small>');
    }
    statGrid.innerHTML = html;

    // foco por dia / por mês
    if (statRangeSel === 'today'){
      chartDaysBlock.hidden = true;
    } else {
      chartDaysBlock.hidden = false;
      var values = [], labels = [];
      if (statRangeSel === 'year'){
        chartDaysTitle.textContent = T('ui.chartFocusByMonth');
        var months = I18N.pack().fmt.monthsShort;
        var now = new Date();
        for (var i = 11; i >= 0; i--){
          var m = new Date(now.getFullYear(), now.getMonth() - i, 1);
          var pref = m.getFullYear() + '-' + String(m.getMonth()+1).padStart(2,'0');
          var tot = 0;
          for (var k in DB.days) if (k.indexOf(pref) === 0) tot += DB.days[k].f || 0;
          values.push(Math.round(tot/60));
          labels.push(months[m.getMonth()]);
        }
      } else {
        chartDaysTitle.textContent = T('ui.chartFocusByDay');
        var wd = I18N.pack().fmt.weekdaysShort;
        keys.forEach(function(k, idx){
          var d = DB.days[k];
          values.push(d ? Math.round((d.f || 0)/60) : 0);
          if (statRangeSel === 'week'){
            var dt = new Date(k + 'T12:00:00');
            labels.push(wd[dt.getDay()]);
          } else {
            labels.push((idx % 5 === 0 || idx === keys.length-1) ? k.slice(8) + '/' + k.slice(5,7) : '');
          }
        });
      }
      chartDays.innerHTML = buildBars(values, labels, I18N.pack().fmt.minShort);
    }

    // produtividade por horário
    var hv = [], hl = [];
    for (var h = 0; h < 24; h++){
      hv.push(Math.round((s.hours[h] || 0)/60));
      hl.push(h % 3 === 0 ? String(h) + I18N.pack().fmt.hourSuffix : '');
    }
    chartHours.innerHTML = buildBars(hv, hl, I18N.pack().fmt.minShort);
  }
  function buildBars(values, labels, unit){
    var max = 0;
    values.forEach(function(v){ if (v > max) max = v; });
    if (max === 0) return '<p class="chart-empty">' + escHtml(T('ui.chartEmpty')) + '</p>';
    var W = 640, H = 110, pad = 2, axisH = 14;
    var n = values.length;
    var bw = (W - pad * (n - 1)) / n;
    var parts = ['<svg viewBox="0 0 ' + W + ' ' + (H + axisH) + '" preserveAspectRatio="none" role="img" aria-label="' + escHtml(T('ui.chartAria')) + '">'];
    values.forEach(function(v, i){
      var h = v === 0 ? 2 : Math.max(3, Math.round((v / max) * (H - 8)));
      var x = i * (bw + pad);
      var y = H - h;
      parts.push('<rect class="bar' + (v === 0 ? ' dim' : '') + '" x="' + x.toFixed(1) + '" y="' + y + '" width="' + bw.toFixed(1) + '" height="' + h + '" rx="1.5"><title>' + v + ' ' + unit + '</title></rect>');
      if (labels[i]) parts.push('<text class="axis-label" x="' + (x + bw/2).toFixed(1) + '" y="' + (H + axisH - 3) + '" text-anchor="middle">' + labels[i] + '</text>');
    });
    parts.push('</svg>');
    return parts.join('');
  }

  // ---- calendário (heatmap) ----
  function renderHeat(){
    var cells = [];
    var today = new Date();
    var start = new Date();
    start.setDate(start.getDate() - (25 * 7 + today.getDay())); // domingo de 26 semanas atrás
    var d = new Date(start);
    while (d <= today){
      var k = v2DayKey(d);
      var rec = DB.days[k];
      var min = rec ? Math.round((rec.f || 0)/60) : 0;
      var lvl = min === 0 ? 0 : min < 15 ? 1 : min < 45 ? 2 : min < 90 ? 3 : 4;
      cells.push('<button class="heat-cell' + (lvl ? ' i' + lvl : '') + '" data-k="' + k + '" title="' + k.slice(8) + '/' + k.slice(5,7) + '" aria-label="' + k + '"></button>');
      d.setDate(d.getDate() + 1);
    }
    // completa a última coluna até sábado (dia 6) para o grid ficar uniforme
    var lastDay = today.getDay(); // 0=dom … 6=sáb
    var missing = lastDay === 6 ? 0 : 6 - lastDay;
    var fd = new Date(today);
    for (var i = 0; i < missing; i++){
      fd.setDate(fd.getDate() + 1);
      var fk = v2DayKey(fd);
      cells.push('<button class="heat-cell future" data-k="' + fk + '" title="' + fk.slice(8) + '/' + fk.slice(5,7) + '" aria-label="' + fk + '"></button>');
    }
    heatGrid.innerHTML = cells.join('');
    heatDetail.textContent = T('ui.heatHint');
    [].forEach.call(heatGrid.querySelectorAll('.heat-cell'), function(cell){
      cell.addEventListener('click', function(){
        [].forEach.call(heatGrid.querySelectorAll('.sel'), function(c){ c.classList.remove('sel'); });
        cell.classList.add('sel');
        var k = cell.getAttribute('data-k');
        var rec = DB.days[k];
        var dt = new Date(k + 'T12:00:00');
        var label = String(dt.getDate()).padStart(2,'0') + '/' + String(dt.getMonth()+1).padStart(2,'0') + '/' + dt.getFullYear();
        if (!rec || (!rec.f && !rec.p && !rec.t && !rec.w)){
          heatDetail.innerHTML = T('ui.heatNoRecords', { date: label });
        } else {
          heatDetail.innerHTML = T('ui.heatDetail', {
            date: label,
            focus: fmtDur(rec.f || 0),
            p: (rec.p || 0),
            pLabel: T((rec.p || 0) === 1 ? 'ui.heatPomo1' : 'ui.heatPomoN'),
            t: (rec.t || 0),
            tLabel: T((rec.t || 0) === 1 ? 'ui.heatTask1' : 'ui.heatTaskN'),
            w: fmtL(rec.w || 0),
            closed: rec.closed ? T('ui.heatClosed') : ''
          });
        }
      });
    });
  }

  // ---- recordes ----
  function renderRecords(){
    var maxF = 0, maxP = 0, maxT = 0;
    for (var k in DB.days){
      var d = DB.days[k];
      if ((d.f || 0) > maxF) maxF = d.f;
      if ((d.p || 0) > maxP) maxP = d.p;
      if ((d.t || 0) > maxT) maxT = d.t;
    }
    var rows = [
      [T('ui.recBestStreak'), bestStreakDays() + ' <small>' + escHtml(T('ui.recDays')) + '</small>'],
      [T('ui.recBestFocusDay'), fmtDur(maxF)],
      [T('ui.recMostPomos'), String(maxP)],
      [T('ui.recMostTasks'), String(maxT)],
      [T('ui.recTotalFocus'), fmtDur(totalFocusSec())],
      [T('ui.recTotalApp'), fmtDur(DB.appSec)]
    ];
    recList.innerHTML = rows.map(function(r){
      return '<li><span class="rec-name">' + escHtml(r[0]) + '</span><span class="rec-val">' + r[1] + '</span></li>';
    }).join('');
  }

  // ---- rotinas ----
  function renderRoutines(){
    rotEmpty.hidden = DB.routines.length > 0;
    rotList.innerHTML = '';
    DB.routines.forEach(function(r){
      var li = document.createElement('li');
      li.className = 'rot-item';
      var info = document.createElement('div');
      info.className = 'rot-info';
      var uMin = I18N.pack().fmt.minShort;
      info.innerHTML = '<p class="rot-name">' + escHtml(r.name) + '</p>' +
        '<span class="rot-meta">' + r.pomos + ' × ' + r.focus + uMin + escHtml(T('ui.rotMetaBreak')) + r.brk + uMin + ' · ' + r.water + 'L' +
        (r.tasks.length ? ' · ' + r.tasks.length + escHtml(T(r.tasks.length === 1 ? 'ui.rotTask1' : 'ui.rotTaskN')) : '') + '</span>';
      var apply = document.createElement('button');
      apply.className = 'btn btn-ghost btn-small';
      apply.textContent = T('ui.rotActivate');
      apply.addEventListener('click', function(){ applyRoutine(r); });
      var del = document.createElement('button');
      del.className = 'rot-del';
      del.textContent = '×';
      del.setAttribute('aria-label', T('ui.rotDeleteAria'));
      del.addEventListener('click', function(){
        DB.routines = DB.routines.filter(function(x){ return x.id !== r.id; });
        saveAll();
        renderRoutines();
      });
      li.appendChild(info); li.appendChild(apply); li.appendChild(del);
      rotList.appendChild(li);
    });
  }
  function applyRoutine(r){
    durations.pomodoro = r.focus;
    durations.short = r.brk;
    waterGoalLiters = r.water;
    settingsV2.goalPomos = r.pomos;
    r.tasks.forEach(function(txt){
      var exists = tasks.some(function(t){ return !t.done && !t.archived && t.text.toLowerCase() === txt.toLowerCase(); });
      if (!exists) tasks.push({ id: taskSeq++, text: txt, done: false, priority: 0, category: r.name, due: v2DayKey(new Date()), archived: false, subtasks: [] });
    });
    if (!state.running && state.mode !== 'chrono') switchMode('pomodoro', { reset: true });
    saveAll();
    renderTasks();
    renderWaterAll();
    renderDayStrip();
    closePanel();
    speak(T('ui.rotApplied', { name: r.name, user: '{name}', pomos: r.pomos, focus: r.focus }));
  }
  rotNewBtn.addEventListener('click', function(){
    rotForm.hidden = false;
    rotNewBtn.hidden = true;
    rotName.focus();
  });
  rotCancel.addEventListener('click', function(){
    rotForm.hidden = true;
    rotNewBtn.hidden = false;
  });
  rotSave.addEventListener('click', function(){
    var name = rotName.value.trim();
    if (!name){ rotName.focus(); return; }
    DB.routines.push({
      id: DB.rotSeq++,
      name: name,
      pomos: Math.min(20, Math.max(1, parseInt(rotPomos.value,10) || 4)),
      focus: Math.min(180, Math.max(1, parseInt(rotFocus.value,10) || 25)),
      brk: Math.min(60, Math.max(1, parseInt(rotBreak.value,10) || 5)),
      water: Math.min(5, Math.max(1, parseInt(rotWater.value,10) || 2)),
      tasks: rotTasks.value.split('\n').map(function(s){ return s.trim(); }).filter(Boolean).slice(0, 12)
    });
    unlockAch('routine_first');
    saveAll();
    rotName.value = ''; rotTasks.value = '';
    rotForm.hidden = true;
    rotNewBtn.hidden = false;
    renderRoutines();
  });

  // ---- planejar (organizador do dia) ----
  var aiPlanData = null;
  function planFromText(text){
    var parts = text.split(/\n|,|;| e (?=[a-záéíóúâêôãõç])/i)
      .map(function(s){ return s.replace(/^(hoje\s+)?(eu\s+)?(preciso|tenho que|quero|vou|devo)\s+/i, '').trim(); })
      .map(function(s){ return s.replace(/[.!]+$/, '').trim(); })
      .filter(function(s){ return s.length > 2; })
      .slice(0, 10);
    if (!parts.length) return null;
    var blocks = [];
    var t = new Date();
    t.setMinutes(t.getMinutes() + (5 - (t.getMinutes() % 5)) % 5, 0, 0); // arredonda pros próximos 5min
    function hm(d){ return String(d.getHours()).padStart(2,'0') + ':' + String(d.getMinutes()).padStart(2,'0'); }
    var pomoCount = 0;
    parts.forEach(function(p, idx){
      var start = new Date(t);
      t.setMinutes(t.getMinutes() + durations.pomodoro);
      blocks.push({ time: hm(start) + '–' + hm(t), label: p.charAt(0).toUpperCase() + p.slice(1), type: 'foco' });
      pomoCount++;
      if (idx < parts.length - 1){
        var bStart = new Date(t);
        var bMin = (pomoCount % 4 === 0) ? durations.long : durations.short;
        t.setMinutes(t.getMinutes() + bMin);
        blocks.push({ time: hm(bStart) + '–' + hm(t), label: (pomoCount % 4 === 0) ? T('ui.planLongBreak') : T('ui.planBreakLabel'), type: 'pausa' });
      }
    });
    return { tasks: parts, blocks: blocks };
  }
  function renderPlan(plan){
    aiPlanData = plan;
    planList.innerHTML = plan.blocks.map(function(b){
      var isBreak = b.type !== 'foco';
      return '<li' + (isBreak ? ' class="is-break"' : '') + '><span class="plan-time">' + escHtml(b.time) + '</span><span class="plan-label">' + escHtml(b.label) + '</span><span class="plan-tag">' + escHtml(T(isBreak ? 'ui.planBreak' : 'ui.planFocus')) + '</span></li>';
    }).join('');
    aiPlan.hidden = false;
  }
  aiRun.addEventListener('click', function(){
    var text = aiInput.value.trim();
    if (!text){ aiInput.focus(); return; }
    aiRun.disabled = true;
    aiStatus.hidden = false;
    aiStatus.textContent = T('ui.aiWorking');
    aiPlan.hidden = true;
    var finished = false;
    function fallback(){
      if (finished) return;
      finished = true;
      aiRun.disabled = false;
      var plan = planFromText(text);
      if (!plan){
        aiStatus.textContent = T('ui.aiFail');
        return;
      }
      aiStatus.hidden = true;
      renderPlan(plan);
    }
    var timer = setTimeout(fallback, 9000);
    try {
      fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: 'claude-sonnet-4-6',
          max_tokens: 1000,
          messages: [{
            role: 'user',
            content: T('ui.aiPrompt', {
              pomo: durations.pomodoro,
              short: durations.short,
              long: durations.long,
              now: new Date().getHours() + ':' + String(new Date().getMinutes()).padStart(2,'0'),
              text: text.replace(/"/g, "'")
            })
          }]
        })
      }).then(function(r){ return r.json(); }).then(function(data){
        if (finished) return;
        var txt = (data.content || []).map(function(c){ return c.text || ''; }).join('');
        var clean = txt.replace(/```json|```/g, '').trim();
        var plan = JSON.parse(clean);
        if (!plan || !plan.blocks || !plan.blocks.length) throw new Error('vazio');
        finished = true;
        clearTimeout(timer);
        aiRun.disabled = false;
        aiStatus.hidden = true;
        renderPlan(plan);
      }).catch(function(){ clearTimeout(timer); fallback(); });
    } catch(e){ clearTimeout(timer); fallback(); }
  });
  aiDiscard.addEventListener('click', function(){
    aiPlan.hidden = true;
    aiPlanData = null;
  });
  aiApply.addEventListener('click', function(){
    if (!aiPlanData) return;
    var added = 0;
    (aiPlanData.tasks || []).forEach(function(txt){
      var exists = tasks.some(function(t){ return !t.done && !t.archived && t.text.toLowerCase() === String(txt).toLowerCase(); });
      if (!exists && String(txt).trim()){
        tasks.push({ id: taskSeq++, text: String(txt).trim(), done: false, priority: 0, category: '', due: v2DayKey(new Date()), archived: false, subtasks: [] });
        added++;
      }
    });
    saveAll();
    renderTasks();
    closePanel();
    aiPlan.hidden = true;
    speak(added > 0 ? pick(MSG.planApplied) + T(added === 1 ? 'ui.planAddedOne' : 'ui.planAddedMany', { n: added }) : pick(MSG.planApplied));
  });

  // ---- resumo do dia ----
  function openSummary(){
    var d = v2Today();
    var now = new Date();
    var months = I18N.pack().fmt.monthsLong;
    var dsep = I18N.pack().fmt.dateSep;
    sumDate.textContent = now.getDate() + dsep + months[now.getMonth()] + dsep + now.getFullYear();
    sumGrid.innerHTML = statItem(T('ui.statFocusTime'), fmtDur(d.f)) +
      statItem(T('ui.statPomos'), d.p) +
      statItem(T('ui.statTasks'), d.t) +
      statItem(T('ui.statWater'), fmtL(d.w));
    var chk = '<svg viewBox="0 0 24 24" fill="none" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>';
    var goals = [
      { met: d.p >= settingsV2.goalPomos, label: T('ui.sumGoalPomos', { a: d.p, b: settingsV2.goalPomos }) },
      { met: d.t >= settingsV2.goalTasks, label: T('ui.sumGoalTasks', { a: d.t, b: settingsV2.goalTasks }) },
      { met: d.w >= waterGoalLiters * 1000, label: T('ui.sumGoalWater', { a: fmtL(d.w), b: waterGoalLiters }) }
    ];
    var met = goals.filter(function(g){ return g.met; }).length;
    sumGoals.innerHTML = goals.map(function(g){
      return '<div class="sum-goal' + (g.met ? ' met' : '') + '"><span class="sg-mark">' + chk + '</span>' + escHtml(g.label) + '</div>';
    }).join('');
    sumMsg.textContent = d.closed ? T('ui.sumAlreadyClosed') :
      met === 3 ? T('ui.sumMsg3') :
      met === 2 ? T('ui.sumMsg2') :
      met === 1 ? T('ui.sumMsg1') :
      d.f > 0 ? T('ui.sumMsgFocus') :
      T('ui.sumMsgBlank');
    sumConfirm.hidden = d.closed;
    summaryOverlay.classList.add('open');
  }
  closeDayBtn.addEventListener('click', openSummary);
  sumClose.addEventListener('click', function(){ summaryOverlay.classList.remove('open'); });
  summaryOverlay.addEventListener('click', function(e){ if (e.target === summaryOverlay) summaryOverlay.classList.remove('open'); });
  sumConfirm.addEventListener('click', function(){
    var d = v2Today();
    if (!d.closed){
      d.closed = true;
      addXp(15);
      unlockAch('day_closed_first');
      saveAll();
    }
    summaryOverlay.classList.remove('open');
    var hh = new Date().getHours();
    speak(pick(hh >= 19 || hh < 4 ? MSG.dayClosedNight : MSG.dayClosed));
  });

  // ---- virada do dia / tempo de plataforma ----
  var v2TodayKey = v2DayKey(new Date());
  setInterval(function(){
    var k = v2DayKey(new Date());
    if (k !== v2TodayKey){
      v2TodayKey = k;
      state.streak = 0;
      state.cyclesCompleted = 0;
      renderStreak();
      renderDots();
      renderDayStrip();
      markDirty();
    }
  }, 30000);
  setInterval(function(){
    if (!document.hidden){ DB.appSec += 60; markDirty(); }
  }, 60000);
  setInterval(function(){ if (dbDirty) saveAll(); }, 5000);
  window.addEventListener('beforeunload', function(){ saveAll(); });

  // ---- inicialização v2 ----
  function v2Init(){
    loadAll();
    if (DB.settings){
      var s = DB.settings;
      if (s.pomodoro) durations.pomodoro = s.pomodoro;
      if (s.short) durations.short = s.short;
      if (s.long) durations.long = s.long;
      if (s.waterInt) waterIntervalMin = s.waterInt;
      if (s.waterGoal) waterGoalLiters = s.waterGoal;
      if (s.goalPomos) settingsV2.goalPomos = s.goalPomos;
      if (s.goalTasks) settingsV2.goalTasks = s.goalTasks;
      if (s.autoFocus !== undefined) settingsV2.autoFocus = !!s.autoFocus;
      state.total = durations.pomodoro * 60;
      state.remaining = state.total;
    }
    if (DB.tasks && DB.tasks.length !== undefined){
      tasks = DB.tasks.map(function(t){
        return {
          id: t.id, text: t.text, done: !!t.done,
          priority: t.priority || 0, category: t.category || '',
          due: t.due || null, archived: !!t.archived,
          subtasks: t.subtasks || []
        };
      });
      taskSeq = DB.taskSeq || (tasks.length + 1);
      subSeq = DB.subSeq || 1;
    }
    // tarefas concluídas de dias anteriores são arquivadas na virada
    var todayK = v2DayKey(new Date());
    if (DB.water && DB.water.day === new Date().toDateString()){
      waterLog = DB.water.log || [];
      waterSeq = DB.water.seq || 1;
      recalcWater();
    }
    var todayRec = DB.days[todayK];
    if (todayRec){
      state.streak = todayRec.p || 0;
      state.cyclesCompleted = todayRec.p || 0;
      renderStreak();
    }
    if (DB.name){
      userName = DB.name;
      nameOverlay.classList.remove('open');
      nextWaterAt = Date.now() + waterIntervalMin * 60000;
      lastActive = Date.now();
      setTimeout(function(){ speak(greetingByTime()); }, 800);
    }
    renderLevel();
    renderDayStrip();
  }

  // ================= init =================
  v2Init();
  renderTasks();
  render();
  renderWaterAll();
  tickWater();

  // ================================================================
  // GON GAME: Jogo da Velha (Pausa Curta / Pausa Longa)
  //
  // Nota de organização: o sistema roda como um único arquivo .html
  // (sem bundler/servidor), então os "módulos" pedidos (game.js, ai.js,
  // storage.js, ui.js, animations.js, audio.js, modal.js) foram mantidos
  // como namespaces isolados dentro deste mesmo IIFE, cada um cuida de
  // uma responsabilidade só e não conhece os detalhes internos dos outros,
  // exatamente como se fossem arquivos separados, só que sem quebrar o
  // requisito de "carregar instantaneamente e funcionar offline" de um
  // arquivo único. Reaproveita helpers já existentes do app (sfxTone,
  // start(), switchMode(), $).
  // ================================================================
  window.GonGame = (function(){
    "use strict";

    // ---------------------------------------------------------------
    // storage.js: placar e estatísticas em LocalStorage
    // ---------------------------------------------------------------
    var Storage = {
      K_SCORE: 'gon.ttt.score',
      K_STATS: 'gon.ttt.stats',
      K_MUTE:  'gon.ttt.muted',
      loadScore: function(){
        try{ return Object.assign({win:0,draw:0,lose:0}, JSON.parse(localStorage.getItem(this.K_SCORE))); }
        catch(e){ return {win:0,draw:0,lose:0}; }
      },
      saveScore: function(s){ try{ localStorage.setItem(this.K_SCORE, JSON.stringify(s)); }catch(e){} },
      loadStats: function(){
        try{ return Object.assign({games:0,wins:0,losses:0,draws:0,streak:0,bestStreak:0,totalDurationMs:0}, JSON.parse(localStorage.getItem(this.K_STATS))); }
        catch(e){ return {games:0,wins:0,losses:0,draws:0,streak:0,bestStreak:0,totalDurationMs:0}; }
      },
      saveStats: function(s){ try{ localStorage.setItem(this.K_STATS, JSON.stringify(s)); }catch(e){} },
      loadMute: function(){ try{ return localStorage.getItem(this.K_MUTE) === '1'; }catch(e){ return false; } },
      saveMute: function(v){ try{ localStorage.setItem(this.K_MUTE, v ? '1' : '0'); }catch(e){} }
    };

    // ---------------------------------------------------------------
    // ai.js: Minimax com poda Alpha-Beta (Gon nunca perde de propósito),
    // mas com uma camada de personalidade por cima: o Gon não deve jogar
    // como uma IA perfeita, e sim como um humano experiente jogando.
    //
    // Em ~15% das partidas (dentro da faixa de 10-20% pedida), o Gon
    // decide no início daquela partida que vai cometer no máximo um
    // pequeno deslize natural em algum momento. Esse deslize nunca pode
    // ignorar uma vitória óbvia disponível nem deixar de bloquear uma
    // ameaça óbvia do usuário; ele só entra em situações "cinzentas",
    // trocando a jogada matematicamente perfeita por uma jogada boa,
    // mas ainda segura (nunca escolhe algo que jogue a partida fora).
    // ---------------------------------------------------------------
    var AI = {
      LINES: [[0,1,2],[3,4,5],[6,7,8],[0,3,6],[1,4,7],[2,5,8],[0,4,8],[2,4,6]],
      SLIP_CHANCE: 0.15,
      SLIP_MARGIN: 2, // quão "boa" (não perfeita) uma jogada de deslize pode ser
      slipGame: false,
      slipUsed: false,
      newGame: function(){
        this.slipGame = Math.random() < this.SLIP_CHANCE;
        this.slipUsed = false;
      },
      // true se 'player' vence colocando a marca na célula i (célula deve estar vazia)
      wouldWin: function(b, i, player){
        b[i] = player;
        var res = this.checkWinner(b);
        b[i] = null;
        return !!(res && res.player === player);
      },
      checkWinner: function(b){
        for (var i = 0; i < this.LINES.length; i++){
          var l = this.LINES[i];
          if (b[l[0]] && b[l[0]] === b[l[1]] && b[l[1]] === b[l[2]]) return { player: b[l[0]], line: l };
        }
        return null;
      },
      isFull: function(b){ for (var i = 0; i < 9; i++) if (!b[i]) return false; return true; },
      // 'O' (Gon) maximiza, 'X' (usuário) minimiza; profundidade penaliza vitórias
      // demoradas e empates forçados são preferidos a derrotas
      minimax: function(b, depth, isMax, alpha, beta){
        var res = this.checkWinner(b);
        if (res) return res.player === 'O' ? (10 - depth) : (depth - 10);
        if (this.isFull(b)) return 0;
        if (isMax){
          var best = -Infinity;
          for (var i = 0; i < 9; i++){
            if (b[i]) continue;
            b[i] = 'O';
            best = Math.max(best, this.minimax(b, depth + 1, false, alpha, beta));
            b[i] = null;
            alpha = Math.max(alpha, best);
            if (beta <= alpha) break;
          }
          return best;
        }
        var worst = Infinity;
        for (var j = 0; j < 9; j++){
          if (b[j]) continue;
          b[j] = 'X';
          worst = Math.min(worst, this.minimax(b, depth + 1, true, alpha, beta));
          b[j] = null;
          beta = Math.min(beta, worst);
          if (beta <= alpha) break;
        }
        return worst;
      },
      bestMove: function(b){
        var scored = [], bestScore = -Infinity, move = -1;
        for (var i = 0; i < 9; i++){
          if (b[i]) continue;
          b[i] = 'O';
          var score = this.minimax(b, 0, false, -Infinity, Infinity);
          b[i] = null;
          scored.push({ i: i, score: score });
          if (score > bestScore){ bestScore = score; move = i; }
        }

        // situação "óbvia" 1: existe uma vitória imediata disponível.
        // situação "óbvia" 2: o usuário tem uma ameaça imediata (venceria
        // na próxima jogada se o Gon não bloqueasse). Em ambos os casos
        // o Gon nunca desliza, joga sempre a jogada certa.
        var obvious = false;
        for (var k = 0; k < scored.length; k++){
          if (this.wouldWin(b, scored[k].i, 'O')) { obvious = true; break; }
        }
        if (!obvious){
          for (var t = 0; t < 9; t++){
            if (!b[t] && this.wouldWin(b, t, 'X')) { obvious = true; break; }
          }
        }

        // fora de situações óbvias, se esta partida "tem direito" a um
        // deslize e ele ainda não foi usado, troca a jogada perfeita por
        // uma jogada boa (dentro de uma margem pequena de pontuação),
        // nunca escolhendo algo que leve a uma derrota com jogo perfeito
        // do outro lado (score < 0).
        if (!obvious && this.slipGame && !this.slipUsed){
          var candidates = scored.filter(function(s){
            return s.i !== move && s.score >= 0 && s.score >= bestScore - this.SLIP_MARGIN;
          }, this);
          if (candidates.length){
            this.slipUsed = true;
            return candidates[Math.floor(Math.random() * candidates.length)].i;
          }
        }

        return move;
      }
    };

    // ---------------------------------------------------------------
    // audio.js: sons discretos, sintetizados (reaproveita sfxTone do app)
    // ---------------------------------------------------------------
    var Audio = {
      muted: Storage.loadMute(),
      toggle: function(){ this.muted = !this.muted; Storage.saveMute(this.muted); return this.muted; },
      click:   function(){ if (!this.muted) sfxTone(520, { dur:0.07, vol:0.05 }); },
      gonMove: function(){ if (!this.muted) sfxTone(400, { dur:0.10, vol:0.045, toFreq:320 }); },
      win:     function(){ if (!this.muted) [523,659,784,1047].forEach(function(f,i){ sfxTone(f, { dur:0.18, vol:0.06, delay:i*0.08 }); }); },
      lose:    function(){ if (!this.muted) sfxTone(220, { dur:0.30, vol:0.05, toFreq:130 }); },
      draw:    function(){ if (!this.muted) sfxTone(392, { dur:0.20, vol:0.05 }); }
    };

    // ---------------------------------------------------------------
    // animations.js: piscar e "pensar" do avatar do Gon
    // ---------------------------------------------------------------
    var Animations = {
      blinkTimer: null,
      start: function(avatarEl, isActiveFn){
        if (this.blinkTimer) clearInterval(this.blinkTimer);
        this.blinkTimer = setInterval(function(){
          if (!isActiveFn()) return;
          avatarEl.classList.add('blink');
          setTimeout(function(){ avatarEl.classList.remove('blink'); }, 140);
        }, 3400 + Math.random() * 2200);
      }
    };

    // ---------------------------------------------------------------
    // frases do Gon: evita repetição consecutiva por categoria
    // ---------------------------------------------------------------
    var PHRASES = {
      last: { gonWin: null, draw: null, userWin: null },
      pick: function(key){
        var arr = I18N.pack().PHRASES[key], choice;
        do { choice = arr[Math.floor(Math.random() * arr.length)]; }
        while (arr.length > 1 && choice === this.last[key]);
        this.last[key] = choice;
        return choice;
      }
    };

    // ---------------------------------------------------------------
    // game.js: orquestra o estado da partida
    // ---------------------------------------------------------------
    var board = [null,null,null,null,null,null,null,null,null];
    var boardEls = [];
    var playing = false;   // tela do tabuleiro visível (vs. tela de desafio)
    var thinking = false;
    var over = false;
    var gonTimer = null;
    var matchStartTs = 0;

    // refs de UI (preenchidos no init)
    var els = {};

    function setStatus(text, cls){
      els.status.textContent = text;
      els.status.className = 'gg-status' + (cls ? ' ' + cls : '');
    }

    function buildBoard(){
      els.board.innerHTML = '';
      boardEls = [];
      for (var i = 0; i < 9; i++){
        (function(idx){
          var cell = document.createElement('button');
          cell.type = 'button';
          cell.className = 'gg-cell';
          cell.dataset.idx = idx;
          cell.setAttribute('aria-label', T('ui.ggCellEmpty', { n: idx + 1 }));
          cell.innerHTML = '<svg class="gg-mark" viewBox="0 0 40 40"></svg>';
          cell.addEventListener('click', onCellClick);
          els.board.appendChild(cell);
          boardEls.push(cell);
        })(i);
      }
      els.board.removeEventListener('keydown', onBoardKeydown);
      els.board.addEventListener('keydown', onBoardKeydown);
    }

    function onBoardKeydown(e){
      var idx = boardEls.indexOf(document.activeElement);
      if (idx === -1) idx = 0;
      var row = Math.floor(idx / 3), col = idx % 3;
      if (e.key === 'ArrowUp') row = (row + 2) % 3;
      else if (e.key === 'ArrowDown') row = (row + 1) % 3;
      else if (e.key === 'ArrowLeft') col = (col + 2) % 3;
      else if (e.key === 'ArrowRight') col = (col + 1) % 3;
      else return;
      e.preventDefault();
      boardEls[row * 3 + col].focus();
    }

    function placeMark(idx, mark){
      board[idx] = mark;
      var cell = boardEls[idx];
      cell.disabled = true;
      var svg = cell.querySelector('svg');
      if (mark === 'O'){
        svg.innerHTML = '<circle class="gg-mark-o" cx="20" cy="20" r="13"/>';
        cell.setAttribute('aria-label', T('ui.ggCellGon', { n: idx + 1 }));
      } else {
        svg.innerHTML = '<line class="gg-mark-x" x1="9" y1="9" x2="31" y2="31"/><line class="gg-mark-x" x1="31" y1="9" x2="9" y2="31"/>';
        cell.setAttribute('aria-label', T('ui.ggCellYou', { n: idx + 1 }));
      }
      requestAnimationFrame(function(){ requestAnimationFrame(function(){ svg.classList.add('gg-in'); }); });
    }

    function highlightLine(line, player){
      var color = player === 'X' ? 'var(--gg-user-win)' : 'var(--accent)';
      line.forEach(function(i){
        boardEls[i].classList.add('gg-win');
        boardEls[i].style.color = color;
      });
    }

    function onCellClick(e){
      if (!playing || thinking || over) return;
      var idx = parseInt(e.currentTarget.dataset.idx, 10);
      if (board[idx]) return;
      placeMark(idx, 'X');
      Audio.click();
      if (!afterMove()){
        setStatus(T('ui.ggGonTurn'), '');
        scheduleGonMove();
      }
    }

    function scheduleGonMove(){
      thinking = true;
      setStatus(T('ui.ggThinking'), 'gg-thinking');
      els.avatar.classList.add('think');
      var delay = 600 + Math.random() * 600;
      gonTimer = setTimeout(function(){
        thinking = false;
        els.avatar.classList.remove('think');
        var idx = AI.bestMove(board);
        if (idx === -1) return;
        placeMark(idx, 'O');
        Audio.gonMove();
        if (!afterMove()) setStatus(T('ui.ggYourTurn'), '');
      }, delay);
    }

    // roda depois de qualquer jogada (usuário ou Gon); retorna true se a
    // partida terminou (vitória ou empate)
    function afterMove(){
      var res = AI.checkWinner(board);
      if (res){
        over = true;
        highlightLine(res.line, res.player);
        endMatch(res.player === 'X' ? 'win' : 'lose');
        return true;
      }
      if (AI.isFull(board)){
        over = true;
        endMatch('draw');
        return true;
      }
      return false;
    }

    function endMatch(result){
      var text, cls, phrase;
      if (result === 'win'){ text = T('ui.ggYouWon'); cls = 'gg-win-user'; phrase = PHRASES.pick('userWin'); Audio.win(); }
      else if (result === 'lose'){ text = T('ui.ggGonWon'); cls = 'gg-win-gon'; phrase = PHRASES.pick('gonWin'); Audio.lose(); }
      else { text = T('ui.ggDraw'); cls = ''; phrase = PHRASES.pick('draw'); Audio.draw(); }
      setStatus(text, cls);
      els.bubble.textContent = phrase;
      els.bubble.classList.add('show');
      recordResult(result);
      els.actions.hidden = false;
    }

    function recordResult(result){
      var score = Storage.loadScore();
      var stats = Storage.loadStats();
      stats.games++;
      if (result === 'win'){ score.win++; stats.wins++; stats.streak++; stats.bestStreak = Math.max(stats.bestStreak, stats.streak); }
      else if (result === 'lose'){ score.lose++; stats.losses++; stats.streak = 0; }
      else { score.draw++; stats.draws++; stats.streak = 0; }
      stats.totalDurationMs += Math.max(0, Date.now() - matchStartTs);
      Storage.saveScore(score);
      Storage.saveStats(stats);
      renderScore();
    }

    function renderScore(){
      var s = Storage.loadScore();
      els.scoreWin.textContent = s.win;
      els.scoreDraw.textContent = s.draw;
      els.scoreLose.textContent = s.lose;
    }

    function newMatch(){
      if (gonTimer){ clearTimeout(gonTimer); gonTimer = null; }
      board = [null,null,null,null,null,null,null,null,null];
      AI.newGame();
      over = false; thinking = false; playing = true;
      matchStartTs = Date.now();
      buildBoard();
      els.actions.hidden = true;
      els.bubble.classList.remove('show');
      els.bubble.textContent = '';
      setStatus(T('ui.ggYourTurn'), '');
      els.play.classList.add('show');
      els.intro.style.display = 'none';
    }

    function showIntro(){
      if (gonTimer){ clearTimeout(gonTimer); gonTimer = null; }
      playing = false;
      els.play.classList.remove('show');
      els.intro.style.display = 'flex';
      els.introBubble.classList.remove('show');
      setTimeout(function(){ if (!playing) els.introBubble.classList.add('show'); }, 500);
    }

    function updateMuteIcon(){
      els.muteBtn.classList.toggle('muted', Audio.muted);
      els.muteBtn.setAttribute('aria-label', Audio.muted ? T('ui.ggUnmuteAria') : T('ui.ggMuteAria'));
      els.muteBtn.title = Audio.muted ? T('ui.ggUnmuteTitle') : T('ui.ggMuteTitle');
    }

    // mostra quanto falta da pausa (duração vem de "durations.short"/"durations.long",
    // que já são editáveis em Ajustes, o jogo só espelha o mesmo cronômetro real,
    // nunca cria uma contagem própria) e avisa visualmente nos últimos 30s
    function updateTime(remainingSeconds){
      if (!els.timeValue) return;
      els.timeValue.textContent = formatTime(remainingSeconds);
      els.time.classList.toggle('gg-time-low', remainingSeconds > 0 && remainingSeconds <= 30);
    }

    // ---------------------------------------------------------------
    // modal.js: aviso de fim de pausa durante a partida
    // ---------------------------------------------------------------
    function openEndModal(){ els.endOverlay.classList.add('open'); }
    function closeEndModal(){ els.endOverlay.classList.remove('open'); }

    // ---------------------------------------------------------------
    // API pública, ligada aos hooks do app principal (switchMode / finishSession)
    // ---------------------------------------------------------------
    function isActive(){ return els.card.classList.contains('is-game'); }

    function onModeChange(mode){
      if (mode === 'short' || mode === 'long'){
        els.card.classList.add('is-game');
        if (!playing) showIntro();
        updateTime(state.remaining);
      } else {
        els.card.classList.remove('is-game');
        closeEndModal();
        if (gonTimer){ clearTimeout(gonTimer); gonTimer = null; }
      }
    }

    function onBreakEnd(){
      openEndModal();
    }

    function init(){
      els.card = document.querySelector('.card');
      els.view = $('gameView');
      els.avatar = $('ggAvatar');
      els.time = $('ggTime');
      els.timeValue = $('ggTimeValue');
      els.intro = $('ggIntro');
      els.introBubble = $('ggIntroBubble');
      els.startBtn = $('ggStartBtn');
      els.play = $('ggPlay');
      els.board = $('ggBoard');
      els.status = $('ggStatus');
      els.bubble = $('ggPlayBubble');
      els.actions = $('ggActions');
      els.againBtn = $('ggAgainBtn');
      els.backBtn = $('ggBackBtn');
      els.scoreWin = $('ggScoreWin');
      els.scoreDraw = $('ggScoreDraw');
      els.scoreLose = $('ggScoreLose');
      els.muteBtn = $('ggMuteBtn');
      els.endOverlay = $('ggEndOverlay');
      els.endAgainBtn = $('ggEndAgainBtn');
      els.endBackBtn = $('ggEndBackBtn');

      renderScore();
      updateMuteIcon();

      els.startBtn.addEventListener('click', function(){
        start();          // idempotente: só liga a contagem da pausa se ainda não estiver rodando
        newMatch();
      });
      els.againBtn.addEventListener('click', newMatch);
      els.backBtn.addEventListener('click', showIntro);
      els.muteBtn.addEventListener('click', function(){ Audio.toggle(); updateMuteIcon(); });
      els.endAgainBtn.addEventListener('click', function(){ closeEndModal(); newMatch(); });
      els.endBackBtn.addEventListener('click', function(){ closeEndModal(); switchMode('pomodoro', { reset:true }); });
      els.endOverlay.addEventListener('click', function(e){ if (e.target === els.endOverlay) closeEndModal(); });

      Animations.start(els.avatar, isActive);
    }

    // relabela tudo que já está na tela quando o idioma muda
    function relabel(){
      updateMuteIcon();
      for (var i = 0; i < boardEls.length; i++){
        var mark = board[i];
        boardEls[i].setAttribute('aria-label', T(mark === 'X' ? 'ui.ggCellYou' : mark === 'O' ? 'ui.ggCellGon' : 'ui.ggCellEmpty', { n: i + 1 }));
      }
      if (playing && !over && !thinking) setStatus(T('ui.ggYourTurn'), '');
    }

    return { init: init, onModeChange: onModeChange, onBreakEnd: onBreakEnd, isActive: isActive, updateTime: updateTime, relabel: relabel };
  })();

  GonGame.init();
  GonGame.onModeChange(state.mode);

  // ================================================================
  // IDIOMA: seletor nas Configurações + atualização instantânea
  //
  // Trocar de idioma NÃO recarrega a página: o GonI18n reescreve os
  // textos estáticos (data-i18n) e aqui a gente remonta as tabelas em
  // memória (falas, nomes de modo, meses...) e repinta o que já estava
  // desenhado. A escolha é salva em localStorage por GonI18n.set().
  // ================================================================
  var langSelect = $('langSelect');
  function renderLangSelect(){
    if (!langSelect) return;
    langSelect.innerHTML = '';
    I18N.LANGS.forEach(function(l){
      var b = document.createElement('button');
      b.type = 'button';
      b.className = 'wg-opt wg-accent' + (I18N.get() === l.code ? ' active' : '');
      b.setAttribute('data-lang', l.code);
      b.textContent = l.short;
      b.title = l.label;
      b.addEventListener('click', function(){
        if (I18N.get() === l.code) return;
        I18N.set(l.code);
        speak(pick(MSG.langChanged));
      });
      langSelect.appendChild(b);
    });
  }
  renderLangSelect();

  I18N.onChange(function(){
    // 1) tabelas em memória
    MSG        = I18N.pack().MSG;
    modeNames  = i18nModeNames();
    PRIO_NAMES = i18nPrioNames();
    days       = I18N.pack().fmt.weekdaysShort;
    months     = I18N.pack().fmt.monthsShort;
    CAL_MONTHS = I18N.pack().fmt.monthsShort;
    CAL_WD     = I18N.pack().fmt.calWeekdays;

    // 2) o que já está desenhado na tela
    renderLangSelect();
    applyTheme(document.documentElement.getAttribute('data-theme') === 'light' ? 'light' : 'dark');
    updateClock();
    render();
    renderTasks();
    renderWaterAll();
    renderDayStrip();
    renderLevel();
    tickWater();
    if (panelOverlay.classList.contains('open')) renderPanelView();
    if (window.GonGame && GonGame.relabel) GonGame.relabel();
    if (gAccessToken){ calRenderDayLabel(); calFetchEvents(); }
  });

  // ================================================================
  // AQUÁRIO: peixinhos vivos no tanque + lojinha
  //
  // Ideia: beber água (logWater) enche o tanque e rende "conchas". Com
  // conchas, o usuário adota peixes na lojinha (no máximo 5). Enquanto o
  // tanque tem água, os peixes ficam bem; se o tanque seca (o usuário para
  // de beber), eles perdem vida aos poucos e, se a vida zera, morrem e
  // somem. Mantendo o tanque cheio (meta do dia batida), eles se recuperam.
  // Toda a persistência vive em DB.fish (salvo junto do resto em gon.v2).
  // ================================================================
  (function initAquarium(){

    // ---- catálogo de espécies (cores planas, boas em ~14px) ----
    // nome e raridade vêm do pacote de idioma (SPECIES guarda só o visual/preço)
    var SPECIES = {
      guppy:  { price:3,  body:'#E0865B', belly:'#F2C6A6', fin:'#C85C3A' },
      tetra:  { price:6,  body:'#3FA9D6', belly:'#BFE9F7', fin:'#E24C4B' },
      goldie: { price:10, body:'#E8B23C', belly:'#F7E1A0', fin:'#D98A1E' },
      betta:  { price:16, body:'#9B4DD6', belly:'#D8A8F0', fin:'#E0489B' },
      koi:    { price:28, body:'#F2EFE8', belly:'#FFFFFF', fin:'#E0865B', spot:'#E0653A' }
    };
    function fishText(kind){ return I18N.pack().FISH[kind] || { name: kind, rarity: '' }; }
    var ORDER = ['guppy','tetra','goldie','betta','koi'];
    var MAX_FISH = 5;
    var DECAY_PER_HOUR = 2.6;   // vida/hora perdida com tanque seco
    var REGEN_PER_HOUR = 4.5;   // vida/hora recuperada com o tanque cheio

    var TAU = Math.PI * 2;
    function now(){ return Date.now(); }
    function clamp(v,a,b){ return v<a?a:(v>b?b:v); }

    // ---- cores: mistura / escurece conforme a saúde cai ----
    function hex2rgb(h){ h=h.replace('#',''); if(h.length===3){h=h[0]+h[0]+h[1]+h[1]+h[2]+h[2];}
      return [parseInt(h.slice(0,2),16),parseInt(h.slice(2,4),16),parseInt(h.slice(4,6),16)]; }
    function mix(a,b,t){ var A=hex2rgb(a),B=hex2rgb(b);
      return 'rgb('+Math.round(A[0]+(B[0]-A[0])*t)+','+Math.round(A[1]+(B[1]-A[1])*t)+','+Math.round(A[2]+(B[2]-A[2])*t)+')'; }
    // saúde baixa -> mais "acinzentado/doente"
    function moodCol(base, hp, dry){
      if (dry) return mix(base, '#D93A2C', clamp((100-hp)/100, 0, 1) * 0.85);
      return mix(base, '#8A93A0', clamp((100-hp)/100,0,1)*0.72);
    }

    // ---- estado persistente ----
    function st(){
      if (!DB.fish || typeof DB.fish !== 'object') DB.fish = {};
      var f = DB.fish;
      if (!Array.isArray(f.list)) f.list = [];
      if (typeof f.coins !== 'number' || f.coins < 0) f.coins = 0;
      if (typeof f.seq !== 'number') f.seq = 1;
      if (typeof f.checkedAt !== 'number') f.checkedAt = now();
      // normaliza cada peixe e descarta espécie desconhecida
      f.list = f.list.filter(function(p){ return p && SPECIES[p.kind]; });
      for (var i=0;i<f.list.length;i++){
        var p=f.list[i];
        if (typeof p.hp !== 'number') p.hp = 100;
        p.hp = clamp(p.hp,0,100);
        if (typeof p.id !== 'number') p.id = f.seq++;
        if (typeof p.born !== 'number') p.born = now();
      }
      return f;
    }
    function goalMl(){ return waterGoalLiters * 1000; }
    function fillFrac(){ var g=goalMl(); return g>0 ? clamp(mlToday/g,0,1) : 0; }

    // ---- saúde: decai/recupera conforme a água ----
    function updateHealth(){
      var f = st();
      var t = now();
      var dtH = (t - f.checkedAt) / 3600000;
      f.checkedAt = t;
      if (dtH <= 0 || !f.list.length) return;
      if (dtH > 48) dtH = 48; // trava contra gaps/relógio absurdos
      var frac = fillFrac();
      var rate;
      if (mlToday >= goalMl())      rate = REGEN_PER_HOUR;          // tanque cheio: recupera
      else if (frac >= 0.25)        rate = -DECAY_PER_HOUR * 0.35;  // meia água: dano leve
      else if (frac > 0)            rate = -DECAY_PER_HOUR * 0.7;
      else                          rate = -DECAY_PER_HOUR;         // tanque seco
      var delta = rate * dtH;
      var died = 0;
      for (var i=f.list.length-1;i>=0;i--){
        var p = f.list[i];
        p.hp = clamp(p.hp + delta, 0, 100);
        if (p.hp <= 0){ spawnGhost(p); f.list.splice(i,1); died++; }
      }
      if (died){
        flashHydroTip(died===1 ? T('ui.aqDied1') : T('ui.aqDiedN', { n: died }));
        try { speak(pick(I18N.pack().FISH_MSG.died)); } catch(e){}
        updateBadge();
      }
      markDirty();
    }

    // ---- ao beber água (chamado dentro de logWater) ----
    window.__aqDrink = function(ml){
      var f = st();
      updateHealth();
      var earned = Math.round((ml||0) / 250);           // 250->1, 500->2, 1L->4
      if (earned > 0) f.coins += earned;
      var bump = 20 + Math.min(20, (ml||0)/50);          // alimenta os vivos
      for (var i=0;i<f.list.length;i++){
        f.list[i].hp = clamp(f.list[i].hp + bump, 0, 100);
        f.list[i].happyUntil = now() + 2600;
      }
      f.fedAt = now(); f.checkedAt = now();
      spawnFlakes(6 + f.list.length*2);
      markDirty(); updateBadge();
      if (isOpen()) renderStore();
      return earned;
    };

    // ---- sprite estático (loja / lista) ----
    function fishSVG(kind, w){
      var sp = SPECIES[kind]; w = w || 54; var h = Math.round(w*0.62);
      var spot = sp.spot ? '<ellipse cx="15" cy="12" rx="4" ry="3" fill="'+sp.spot+'"/><ellipse cx="24" cy="17" rx="3" ry="2.4" fill="'+sp.spot+'"/>' : '';
      return '<svg class="aq-fish-ico" viewBox="0 0 40 25" width="'+w+'" height="'+h+'" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">'
        + '<path d="M8 12.5 L2 8 L2 17 Z" fill="'+sp.fin+'"/>'                       /* cauda */
        + '<ellipse cx="22" cy="12.5" rx="14" ry="8" fill="'+sp.body+'"/>'           /* corpo */
        + '<path d="M10 12.5 a12 8 0 0 0 24 0 Z" fill="'+sp.belly+'" opacity="0.85"/>' /* barriga */
        + '<path d="M20 5 L27 3 L24 9 Z" fill="'+sp.fin+'"/>'                        /* nadadeira */
        + spot
        + '<circle cx="31" cy="11" r="1.7" fill="#1a1a18"/><circle cx="31.6" cy="10.4" r="0.6" fill="#fff"/>'
        + '</svg>';
    }

    // ================= canvas: peixes nadando de verdade =================
    var canvas = document.getElementById('fishCanvas');
    var ctx = canvas ? canvas.getContext('2d') : null;
    var cw=0, ch=0, horizontal=false, dpr=Math.min(window.devicePixelRatio||1, 2);
    var render = {};      // id -> estado efêmero de animação (não persiste)
    var flakes = [];      // comidinha caindo
    var ghosts = [];      // peixe morto subindo e sumindo
    var reduced = false;
    try { reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches; } catch(e){}

    function resizeCanvas(){
      if (!canvas || !ctx || !hydroTank) return;
      // mede o PRÓPRIO canvas: ele preenche o padding-box do tanque (sem os
      // 2px de borda). Medir o tanque inteiro esticava o desenho e
      // desalinhava a linha d'água dos peixes em relação à onda.
      var r = canvas.getBoundingClientRect();
      cw = Math.max(1, Math.round(r.width));
      ch = Math.max(1, Math.round(r.height));
      var tr = hydroTank.getBoundingClientRect();
      horizontal = tr.width > tr.height;
      canvas.width = cw*dpr; canvas.height = ch*dpr;
      ctx.setTransform(dpr,0,0,dpr,0,0);
    }
    if (canvas){
      if (window.ResizeObserver) new ResizeObserver(resizeCanvas).observe(hydroTank);
      else window.addEventListener('resize', resizeCanvas);
      resizeCanvas();
    }

    // retângulo de água disponível (onde os peixes podem nadar).
    // SURF: folga abaixo da linha d'água, a nadadeira sobe ~6px acima do
    // centro do peixe e a onda oscila mais alguns px; sem essa folga eles
    // furavam a superfície. WALL/FLOOR: folga das paredes e do fundo.
    // Tanque seco: vira uma faixinha no fundo (peixes encalhados).
    var SURF = 13, WALL = 9, FLOOR = 7;
    function waterRect(){
      var frac = fillFrac();
      if (horizontal){
        var right = cw * frac;
        var x1 = Math.max(WALL + 4, right - SURF);
        return { x0: WALL, y0: FLOOR, x1: x1, y1: ch - FLOOR };
      } else {
        var top = ch * (1 - frac);
        var y0 = Math.min(ch - 18, top + SURF);
        return { x0: WALL, y0: y0, x1: cw - WALL, y1: ch - FLOOR };
      }
    }

    function ensureRender(p, rect){
      if (render[p.id]) return render[p.id];
      var r = {
        x: rect.x0 + Math.random()*(rect.x1-rect.x0),
        y: rect.y0 + Math.random()*(rect.y1-rect.y0),
        vx: (Math.random()<0.5?-1:1)*(0.15+Math.random()*0.2),
        vy: (Math.random()-0.5)*0.1,
        phase: Math.random()*TAU
      };
      render[p.id] = r; return r;
    }

    function spawnFlakes(n){
      if (!canvas || reduced) { return; }
      var rect = waterRect();
      for (var i=0;i<n;i++){
        flakes.push({
          x: rect.x0 + Math.random()*(rect.x1-rect.x0),
          y: rect.y0 - 2 - Math.random()*4,
          vy: 0.25 + Math.random()*0.35,
          drift: (Math.random()-0.5)*0.2,
          r: 0.8 + Math.random()*0.8,
          age:0, life: 70 + Math.random()*50|0,
          col: Math.random()<0.5 ? '#E8B23C' : '#C97B3A'
        });
      }
      if (flakes.length > 60) flakes.splice(0, flakes.length-60);
    }
    function spawnGhost(p){
      if (!canvas) return;
      var r = render[p.id] || { x: cw/2, y: ch/2, vx:0, phase:0 };
      ghosts.push({ kind:p.kind, x:r.x, y:r.y, dir:r.vx>=0?1:-1, phase:r.phase||0, age:0, life:55 });
      delete render[p.id];
    }

    function drawFish(x, y, dir, sp, hp, phase, happy, dry){
      var s = 1;
      ctx.save();
      ctx.translate(x, y);
      if (hp < 22){ ctx.rotate((22-hp)/22 * 0.5); }
      ctx.scale(dir*s * 0.72, s * 0.72);
      var alpha = hp < 12 ? 0.5 + 0.5*(hp/12) : 1;
      ctx.globalAlpha = alpha;
      var body = moodCol(sp.body, hp, dry), belly = moodCol(sp.belly, hp, dry), fin = moodCol(sp.fin, hp, dry);
      var wig = Math.sin(phase) * (hp>30 ? 1.5 : 0.5) * (happy?1.6:1);
      ctx.beginPath();
      ctx.moveTo(-5,0); ctx.lineTo(-9.5,-3.2+wig); ctx.lineTo(-9.5,3.2+wig); ctx.closePath();
      ctx.fillStyle = fin; ctx.fill();
      ctx.beginPath(); ctx.ellipse(0,0,7,4.2,0,0,TAU); ctx.fillStyle=body; ctx.fill();
      ctx.beginPath(); ctx.ellipse(0.5,1.4,5,2.4,0,0,TAU); ctx.fillStyle=belly; ctx.globalAlpha=alpha*0.8; ctx.fill(); ctx.globalAlpha=alpha;
      if (sp.spot){ ctx.fillStyle=moodCol(sp.spot,hp,dry);
        ctx.beginPath(); ctx.ellipse(-1,-1,2,1.4,0,0,TAU); ctx.fill();
        ctx.beginPath(); ctx.ellipse(3,1,1.5,1,0,0,TAU); ctx.fill(); }
      ctx.beginPath(); ctx.moveTo(-1,-3.6); ctx.lineTo(4,-6+wig*0.4); ctx.lineTo(3,-3.4); ctx.closePath();
      ctx.fillStyle=fin; ctx.fill();
      ctx.beginPath(); ctx.arc(4.4,-0.6,1.5,0,TAU); ctx.fillStyle='#1a1a18'; ctx.fill();
      if (hp <= 8){
        ctx.strokeStyle='#1a1a18'; ctx.lineWidth=0.7;
        ctx.beginPath(); ctx.moveTo(3.4,-1.6); ctx.lineTo(5.4,0.4); ctx.moveTo(5.4,-1.6); ctx.lineTo(3.4,0.4); ctx.stroke();
      } else {
        ctx.beginPath(); ctx.arc(4.9,-1.1,0.5,0,TAU); ctx.fillStyle='#fff'; ctx.fill();
      }
      ctx.restore();
    }

    // ---- interação com mouse ----
    var mouse = { x: -9999, y: -9999, active: false };
    var MOUSE_RADIUS = 28;
    if (canvas){
      canvas.addEventListener('mousemove', function(e){
        var r = canvas.getBoundingClientRect();
        mouse.x = (e.clientX - r.left) * (cw / r.width);
        mouse.y = (e.clientY - r.top)  * (ch / r.height);
        mouse.active = true;
      });
      canvas.addEventListener('mouseleave', function(){ mouse.active = false; mouse.x = -9999; mouse.y = -9999; });
    }

    // ---- alvo aleatório por peixe ----
    function pickTarget(rect){
      return {
        tx: rect.x0 + Math.random()*(rect.x1-rect.x0),
        ty: rect.y0 + Math.random()*(rect.y1-rect.y0),
        ttl: 200 + Math.random()*260|0
      };
    }
    function ensureTarget(r, rect){
      if (!r.ttl || r.ttl <= 0){ var t=pickTarget(rect); r.tx=t.tx; r.ty=t.ty; r.ttl=t.ttl; }
    }

    // ---- dano em tempo real com tanque seco (~5s para matar) ----
    var dryDmgAccum = 0;
    var DRY_DMG_PER_SEC = 20;
    function applyDryDamage(k){
      if (fillFrac() > 0 || !DB.fish || !DB.fish.list || !DB.fish.list.length){ dryDmgAccum=0; return; }
      dryDmgAccum += DRY_DMG_PER_SEC * (k/60);
      if (dryDmgAccum < 1) return;
      var dmg = Math.floor(dryDmgAccum); dryDmgAccum -= dmg;
      var f = DB.fish, died = 0;
      for (var i=f.list.length-1;i>=0;i--){
        f.list[i].hp = clamp(f.list[i].hp - dmg, 0, 100);
        if (f.list[i].hp <= 0){ spawnGhost(f.list[i]); f.list.splice(i,1); died++; }
      }
      if (died){
        flashHydroTip(died===1 ? T('ui.aqDied1') : T('ui.aqDiedN', { n: died }));
        try { speak(pick(I18N.pack().FISH_MSG.died)); } catch(e){}
        markDirty(); updateBadge();
        if (typeof isOpen==='function' && isOpen() && typeof renderStore==='function') renderStore();
      }
    }

    var tt = 0;
    var lastFrameT = 0;
    function loop(ts){
      requestAnimationFrame(loop);
      if (!ctx || cw<=1) return;
      var k = 1;
      if (ts){
        if (lastFrameT) k = clamp((ts - lastFrameT) / (1000/60), 0.25, 3);
        lastFrameT = ts;
      }
      ctx.clearRect(0,0,cw,ch);
      if (!reduced) tt += k;
      var f = DB.fish; if (!f || !f.list) f = { list:[] };
      var rect = waterRect();
      var speedK = reduced ? 0 : 1;
      var isDry = fillFrac() <= 0;

      if (!reduced) applyDryDamage(k);

      for (var i=0;i<f.list.length;i++){
        var p = f.list[i];
        var r = ensureRender(p, rect);
        var lively = clamp(p.hp/100, 0.12, 1);
        var happy = p.happyUntil && now() < p.happyUntil;
        if (speedK){
          ensureTarget(r, rect);
          r.ttl -= k;

          // distância ao mouse
          var mdx = r.x - mouse.x, mdy = r.y - mouse.y;
          var mdist = mouse.active ? Math.sqrt(mdx*mdx+mdy*mdy) : 99999;
          var nearMouse = mdist < MOUSE_RADIUS;

          // boost temporário ao ser perturbado
          if (nearMouse) r.scareBoost = Math.min((r.scareBoost||0) + (1-mdist/MOUSE_RADIUS)*0.04*k, 1);
          r.scareBoost = (r.scareBoost||0) * Math.pow(0.96, k);

          // velocidade alvo: lenta por padrão, leve pico ao ser perturbado
          var baseSpeed = (0.25 + 0.15*lively) * (isDry?0.3:1);
          var targetSpeed = baseSpeed * (1 + r.scareBoost * 1.8);

          // direção ao alvo (foge do mouse quando perto)
          var tx = nearMouse && mdist>1 ? r.x+(mdx/mdist)*40 : r.tx;
          var ty = nearMouse && mdist>1 ? r.y+(mdy/mdist)*40 : r.ty;
          var ddx=tx-r.x, ddy=ty-r.y, ddist=Math.sqrt(ddx*ddx+ddy*ddy);
          if (ddist>1){
            var steer=0.018*k;
            r.vx += (ddx/ddist*targetSpeed - r.vx)*steer;
            r.vy += (ddy/ddist*targetSpeed*0.6 - r.vy)*steer;
          }
          r.vx += (Math.random()-0.5)*0.004*k;
          r.vy += (Math.random()-0.5)*0.004*k;
          var spd=Math.sqrt(r.vx*r.vx+r.vy*r.vy), maxSpd=targetSpeed*1.1;
          if (spd>maxSpd){ r.vx=r.vx/spd*maxSpd; r.vy=r.vy/spd*maxSpd; }

          r.x += r.vx*k; r.y += r.vy*k;

          // bordas
          if (r.x < rect.x0){ r.x=rect.x0; r.vx=Math.abs(r.vx)*0.5; r.tx=rect.x1-10; }
          if (r.y > rect.y1){ r.y=rect.y1; r.vy=-Math.abs(r.vy)*0.5; }
          if (horizontal){
            if (r.y < rect.y0){ r.y=rect.y0; r.vy=Math.abs(r.vy)*0.5; }
            if (r.x > rect.x1){ r.x=rect.x1; r.vx=-Math.abs(r.vx)*0.5; }
          } else {
            if (r.x > rect.x1){ r.x=rect.x1; r.vx=-Math.abs(r.vx)*0.5; r.tx=rect.x0+10; }
            if (r.y < rect.y0){ r.y=rect.y0; r.vy=Math.abs(r.vy)*0.5; }
          }
          r.phase += (0.06 + lively*0.03 + (r.scareBoost||0)*0.08)*k;
        } else {
          r.x = clamp(r.x, rect.x0, rect.x1); r.y = clamp(r.y, rect.y0, rect.y1);
        }
        var dir = r.vx >= 0 ? 1 : -1;
        drawFish(r.x, r.y, dir, SPECIES[p.kind], p.hp, r.phase, happy, isDry);
      }

      // comidinha
      for (var q=flakes.length-1;q>=0;q--){
        var fl=flakes[q]; fl.age += k;
        if (fl.age>=fl.life || fl.y>ch){ flakes.splice(q,1); continue; }
        fl.y += fl.vy*k; fl.x += fl.drift*k;
        ctx.globalAlpha = clamp(1 - fl.age/fl.life, 0, 1)*0.9;
        ctx.fillStyle = fl.col;
        ctx.beginPath(); ctx.arc(fl.x, fl.y, fl.r, 0, TAU); ctx.fill();
      }
      ctx.globalAlpha = 1;

      // peixe morto: dissolve vermelho no lugar
      for (var g=ghosts.length-1;g>=0;g--){
        var gh=ghosts[g]; gh.age += k;
        if (gh.age>=gh.life){ ghosts.splice(g,1); continue; }
        ctx.globalAlpha = clamp(1 - gh.age/gh.life, 0, 1)*0.85;
        drawFish(gh.x, gh.y, gh.dir||1, SPECIES[gh.kind], 0, gh.phase||0, false, true);
      }
      ctx.globalAlpha = 1;
    }
    if (canvas) loop();

    // ================= loja (modal) =================
    var overlay = $('aqOverlay'), btn = $('aqBtn'), badge = $('aqBtnBadge');
    var elCoins = $('aqCoins'), elCount = $('aqCount'), elMine = $('aqMine'),
        elEmpty = $('aqEmpty'), elShop = $('aqShop');
    function isOpen(){ return overlay && overlay.classList.contains('open'); }

    function hpColor(hp){
      if (hp >= 60) return '#4FB477';
      if (hp >= 30) return '#E8B23C';
      return 'var(--stress-red)';
    }
    function hpStatus(hp){
      if (hp >= 80) return T('ui.aqHp1');
      if (hp >= 55) return T('ui.aqHp2');
      if (hp >= 30) return T('ui.aqHp3');
      if (hp >= 12) return T('ui.aqHp4');
      return T('ui.aqHp5');
    }

    function renderStore(){
      var f = st();
      updateHealth();
      elCoins.textContent = f.coins;
      elCount.textContent = f.list.length + '/' + MAX_FISH;

      // meus peixes
      elMine.innerHTML = '';
      elEmpty.hidden = f.list.length > 0;
      f.list.forEach(function(p){
        var sp = SPECIES[p.kind];
        var row = document.createElement('div'); row.className = 'aq-mine-item';
        row.innerHTML =
          fishSVG(p.kind, 40) +
          '<div class="aq-mine-info">' +
            '<div class="aq-mine-name">'+ escHtml(fishText(p.kind).name) +'</div>' +
            '<div class="aq-hp"><i style="width:'+ Math.round(p.hp) +'%;background:'+ hpColor(p.hp) +'"></i></div>' +
            '<div class="aq-mine-status">'+ hpStatus(p.hp) +' · '+ Math.round(p.hp) +'%</div>' +
          '</div>';
        var rel = document.createElement('button');
        rel.className = 'aq-release'; rel.type='button'; rel.textContent = T('ui.aqRelease');
        rel.addEventListener('click', function(){ releaseFish(p.id); });
        row.appendChild(rel);
        elMine.appendChild(row);
      });

      // lojinha
      elShop.innerHTML = '';
      ORDER.forEach(function(kind){
        var sp = SPECIES[kind];
        var card = document.createElement('div'); card.className='aq-card';
        card.innerHTML =
          fishSVG(kind, 54) +
          '<div class="aq-card-name">'+ escHtml(fishText(kind).name) +'</div>' +
          '<div class="aq-card-rarity">'+ escHtml(fishText(kind).rarity) +'</div>' +
          '<div class="aq-card-price"><svg viewBox="0 0 16 16" aria-hidden="true"><path d="M8 1 C4 1 1 4 1 8 C1 12 4 15 8 15 L8 8 Z" fill="currentColor"/><path d="M8 1 C12 1 15 4 15 8 C15 12 12 15 8 15 L8 8 Z" fill="currentColor" opacity="0.55"/></svg>'+ sp.price +'</div>';
        var buy = document.createElement('button');
        buy.className='aq-adopt'; buy.type='button';
        var full = f.list.length >= MAX_FISH;
        var broke = f.coins < sp.price;
        if (full){ buy.textContent=T('ui.aqFull'); buy.disabled=true; }
        else if (broke){ buy.textContent=T('ui.aqNeed', { n: sp.price-f.coins }); buy.disabled=true; }
        else { buy.textContent=T('ui.aqAdopt'); }
        buy.addEventListener('click', function(){ adopt(kind); });
        card.appendChild(buy);
        elShop.appendChild(card);
      });
    }

    function adopt(kind){
      var f = st(); var sp = SPECIES[kind];
      if (!sp) return;
      if (f.list.length >= MAX_FISH){ flashHydroTip(T('ui.aqTankLimit', { n: MAX_FISH })); return; }
      if (f.coins < sp.price){ flashHydroTip(T('ui.aqNoCoins')); return; }
      f.coins -= sp.price;
      f.list.push({ id: f.seq++, kind: kind, hp: 100, born: now(), happyUntil: now()+2600 });
      markDirty(); updateBadge(); renderStore();
      try { launchConfetti(24); } catch(e){}
      try {
        var spName = fishText(kind).name;
        speak(pick(I18N.pack().FISH_MSG.adopted).replace(/\{sp\}/g, spName));
      } catch(e){}
    }
    function releaseFish(id){
      var f = st();
      f.list = f.list.filter(function(p){ return p.id !== id; });
      delete render[id];
      markDirty(); updateBadge(); renderStore();
      flashHydroTip(T('ui.aqReleased'));
    }

    function updateBadge(){
      if (!badge) return;
      var n = (DB.fish && DB.fish.list) ? DB.fish.list.length : 0;
      if (n > 0){ badge.hidden = false; badge.textContent = n; }
      else { badge.hidden = true; }
    }

    function open(){ updateHealth(); renderStore(); overlay.classList.add('open'); }
    function close(){ overlay.classList.remove('open'); }

    // idioma trocado com o aquário aberto: repinta a lista/loja
    I18N.onChange(function(){ if (isOpen()) renderStore(); });

    if (btn) btn.addEventListener('click', open);
    if ($('aqCloseBtn')) $('aqCloseBtn').addEventListener('click', close);
    if (overlay) overlay.addEventListener('click', function(e){ if (e.target === overlay) close(); });
    document.addEventListener('keydown', function(e){ if (e.key === 'Escape' && isOpen()) close(); });

    // ---- boot ----
    st();
    updateHealth();     // aplica o tempo em que o app ficou fechado
    updateBadge();
    setInterval(function(){
      updateHealth();
      updateBadge();
      if (isOpen()) renderStore();
    }, 30000);
    document.addEventListener('visibilitychange', function(){
      if (!document.hidden){ resizeCanvas(); updateHealth(); updateBadge(); if (isOpen()) renderStore(); }
    });

  })();

})();
