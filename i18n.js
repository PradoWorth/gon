   i18n: sistema de idiomas do Gon
   ----------------------------------------------------------------
   Para adicionar um idioma novo (es, fr, de, it...), basta criar mais
   um objeto dentro de GonI18n.packs com as MESMAS chaves de `pt` e
   registrar o rótulo em GonI18n.LANGS. Nada mais precisa mudar.

   Uso no HTML (traduzido automaticamente ao trocar de idioma):
     data-i18n="chave"                -> textContent
     data-i18n-html="chave"           -> innerHTML (permite <b>, <br>)
     data-i18n-attr="placeholder:chave;title:chave;aria-label:chave"

   Uso no JS:
     I18N.t('chave')                  -> string traduzida
     I18N.t('chave', {n: 3})          -> interpola {n}
     I18N.pack()                      -> pacote inteiro do idioma atual
   ================================================================ */
window.GonI18n = (function(){
  "use strict";

  var STORE_KEY = 'gon.lang';
  var FALLBACK = 'pt';

  // rótulos do seletor de idioma (ordem = ordem exibida nas Configurações)
  var LANGS = [
    { code: 'pt', label: 'Português (Brasil)', short: 'Português', html: 'pt-BR' },
    { code: 'en', label: 'English',            short: 'English',   html: 'en' }
  ];

  var packs = {};          // preenchido logo abaixo por registerPack()
  var current = FALLBACK;
  var listeners = [];

  function registerPack(code, data){ packs[code] = data; }

  function has(code){ return !!packs[code]; }

  function detect(){
    var saved = null;
    try { saved = localStorage.getItem(STORE_KEY); } catch(e){}
    if (saved && has(saved)) return saved;
    var nav = (navigator.language || navigator.userLanguage || '').toLowerCase();
    for (var i = 0; i < LANGS.length; i++){
      if (nav.indexOf(LANGS[i].code) === 0) return LANGS[i].code;
    }
    return FALLBACK;
  }

  function pack(code){ return packs[code || current] || packs[FALLBACK]; }

  // busca uma chave "a.b.c" dentro de um objeto aninhado
  function dig(obj, path){
    var parts = path.split('.');
    var cur = obj;
    for (var i = 0; i < parts.length; i++){
      if (cur == null) return undefined;
      cur = cur[parts[i]];
    }
    return cur;
  }

  function t(key, vars){
    var v = dig(pack(), key);
    if (v === undefined) v = dig(pack(FALLBACK), key);
    if (v === undefined) return key;
    if (typeof v !== 'string') return v;
    if (vars){
      v = v.replace(/\{(\w+)\}/g, function(m, name){
        return (vars[name] !== undefined) ? vars[name] : m;
      });
    }
    return v;
  }

  // ---- aplicação nos elementos estáticos do HTML ----
  function applyDom(root){
    root = root || document;

    var nodes = root.querySelectorAll('[data-i18n]');
    for (var i = 0; i < nodes.length; i++){
      nodes[i].textContent = t(nodes[i].getAttribute('data-i18n'));
    }

    var htmlNodes = root.querySelectorAll('[data-i18n-html]');
    for (var j = 0; j < htmlNodes.length; j++){
      htmlNodes[j].innerHTML = t(htmlNodes[j].getAttribute('data-i18n-html'));
    }

    var attrNodes = root.querySelectorAll('[data-i18n-attr]');
    for (var k = 0; k < attrNodes.length; k++){
      var el = attrNodes[k];
      var spec = el.getAttribute('data-i18n-attr').split(';');
      for (var s = 0; s < spec.length; s++){
        var piece = spec[s].trim();
        if (!piece) continue;
        var cut = piece.indexOf(':');
        if (cut < 0) continue;
        var attr = piece.slice(0, cut).trim();
        var key  = piece.slice(cut + 1).trim();
        el.setAttribute(attr, t(key));
      }
    }
  }

  function applyDocumentMeta(){
    var p = pack();
    document.documentElement.setAttribute('lang', p.meta.htmlLang);
    var desc = document.querySelector('meta[name="description"]');
    if (desc) desc.setAttribute('content', p.meta.description);
  }

  function onChange(fn){ listeners.push(fn); }

  function set(code, silent){
    if (!has(code)) return;
    current = code;
    try { localStorage.setItem(STORE_KEY, code); } catch(e){}
    applyDocumentMeta();
    applyDom();
    if (!silent){
      for (var i = 0; i < listeners.length; i++){
        try { listeners[i](code); } catch(e){}
      }
    }
  }

  function get(){ return current; }

  return {
    LANGS: LANGS,
    registerPack: registerPack,
    packs: packs,
    pack: function(){ return pack(); },
    t: t,
    get: get,
    set: set,
    onChange: onChange,
    applyDom: applyDom,
    applyDocumentMeta: applyDocumentMeta,
    boot: function(){ current = detect(); applyDocumentMeta(); applyDom(); }
  };
})();

/* ===================== pt-BR ===================== */
GonI18n.registerPack('pt', {

  meta: {
    htmlLang: 'pt-BR',
    description: 'Timer Pomodoro com tarefas, hidratação, música e o Gon, um companheiro virtual que trabalha junto com você para manter o foco.',
    titleIdle: 'Gon - foco e produtividade',
    titlePaused: 'Pausado · Gon',
    decimalComma: true,
    fallbackName: 'você'
  },

  fmt: {
    weekdaysShort: ['dom','seg','ter','qua','qui','sex','sáb'],
    monthsShort:   ['jan','fev','mar','abr','mai','jun','jul','ago','set','out','nov','dez'],
    monthsLong:    ['janeiro','fevereiro','março','abril','maio','junho','julho','agosto','setembro','outubro','novembro','dezembro'],
    calWeekdays:   ['seg','ter','qua','qui','sex','sáb','dom'],
    hourSuffix: 'h',
    minShort: 'min',
    hourShort: 'h',
    lessThanMin: '<1min',
    zeroMin: '0min',
    dateSep: ' de ',
    rangeOf: ' de '
  },

  ui: {
    /* header */
    feedbackAria: 'Enviar feedback',
    feedback: 'Feedback',
    brandAria: 'Abrir Sobre o Gon',
    brandSr: 'Gon — foco e produtividade',
    panelBtnAria: 'Painel: estatísticas, calendário, conquistas',
    panelBtnTitle: 'Painel',
    musicBtn: 'Música (Spotify)',
    calBtn: 'Google Agenda',
    themeBtnTitle: 'Tema claro/escuro',
    themeToLight: 'Mudar para tema claro',
    themeToDark: 'Mudar para tema escuro',
    settingsBtn: 'Configurações',
    batteryTitle: 'Bateria: {pct}%',
    batteryCharging: ' (carregando)',

    /* tabs / timer */
    tabsAria: 'Modo do timer',
    modePomodoro: 'Pomodoro',
    modeShort: 'Pausa curta',
    modeLong: 'Pausa longa',
    modeChrono: 'Cronômetro',
    modeFree: 'Sessão livre',
    timerAria: 'Tempo da sessão',
    chronoUp: 'Cronômetro',
    chronoDown: 'Regressivo',
    chronoFree: 'Sessão livre',
    btnStart: 'Começar',
    btnPause: 'Pausar',
    btnResume: 'Continuar',
    btnReset: 'Reiniciar',
    btnFinish: 'Finalizar',
    btnSkipBreak: 'Pular pausa',
    hint: '<kbd>Espaço</kbd> inicia e pausa &nbsp;·&nbsp; <kbd>R</kbd> reinicia',

    /* hidratação */
    hydrationAria: 'Hidratação',
    hydroTipDefault: 'Água em 20 min',
    hydroTipSoon: 'Água em menos de 1 min',
    hydroTipIn: 'Água em {n} min',
    hydroRegistered: '{amount} registrado',
    hydroUndoable: ' · dá pra desfazer',
    hydroShells: ' · +{n} concha 🐚',
    hydroShellsPlural: ' · +{n} conchas 🐚',
    hydroRemoved: 'Registro removido',
    hydroUndoneLast: 'Último registro desfeito',
    hydroTankAria: 'Água de hoje. Abrir registros para desfazer.',
    hydroTankHint: 'toque<br>p/ desfazer',
    aqBtnAria: 'Abrir aquário e loja de peixes',
    aqBtn: 'Aquário',

    /* jogo da velha */
    ggMuteAria: 'Mutar sons do jogo',
    ggUnmuteAria: 'Ativar sons do jogo',
    ggMuteTitle: 'Mutar sons',
    ggUnmuteTitle: 'Ativar sons',
    ggTimePrefix: 'Pausa termina em ',
    ggTitle: 'Gon te desafia',
    ggSub: 'Enquanto você descansa...<br>tente me vencer.',
    ggIntroBubble: 'Vamos jogar uma?',
    ggStartMatch: 'Começar Partida',
    ggPauseBreak: 'Pausar descanso',
    ggStartBreak: 'Iniciar descanso',
    ggResumeBreak: 'Continuar descanso',
    ggBoardAria: 'Tabuleiro do jogo da velha',
    ggYourTurn: 'Sua vez',
    ggGonTurn: 'Vez do Gon',
    ggThinking: 'Gon está pensando',
    ggPlayAgain: 'Jogar novamente',
    ggBackToBreak: 'Voltar ao descanso',
    ggScoreYou: 'Você',
    ggScoreDraws: 'Empates',
    ggScoreGon: 'Gon',
    ggYouWon: 'Você venceu',
    ggGonWon: 'Gon venceu',
    ggDraw: 'Empate',
    ggCellEmpty: 'Casa {n}, vazia',
    ggCellYou: 'Casa {n}, você',
    ggCellGon: 'Casa {n}, Gon',
    ggEndAria: 'Fim da pausa',
    ggEndSub: 'A pausa terminou.<br>Hora de voltar ao foco.',
    ggEndAgain: 'Mais uma partida',
    ggEndBack: 'Voltar ao Pomodoro',

    /* resumo do dia (faixa) */
    dayStripAria: 'Resumo do dia',
    dsFocus: 'Foco',
    dsPomos: 'Pomodoros',
    dsTasks: 'Tarefas',
    dsWater: 'Água',
    dsStreak: 'Sequência',
    dsDay: '{n} dia',
    dsDays: '{n} dias',
    closeDay: 'encerrar o dia',
    closeDayTitle: 'Encerrar o dia',

    /* música */
    musicAria: 'Música',
    musicTitle: 'Música',
    spotifyLogin: 'Entrar no Spotify',
    spotifyUrlPlaceholder: 'Cole um link do Spotify (playlist, álbum, faixa)',
    spotifyLoad: 'Carregar',
    spotifyPauseAria: 'Pausar música',
    spotifyNote: 'Com a sessão do Spotify aberta <b>neste navegador</b>, o player toca as faixas inteiras. Sem login, ele toca prévias de 30 segundos. Use os controles dentro do próprio player para tocar, pausar e navegar pelas faixas.',
    spotifyBadLink: 'Esse link não parece do Spotify, {name}. Cola a URL da playlist.',
    spotifyLoginHint: 'Faz o login e volta, {name}. O player aqui pega a sessão sozinho.',
    ytSearchPlaceholder: 'Pesquise a música que você quer ouvir',
    ytSearchAria: 'Pesquisar música no YouTube',
    ytSearchBtn: 'Pesquisar',
    ytMuteAria: 'Mudo',
    ytVolumeAria: 'Volume do YouTube',
    ytStatusIdle: 'Digite o nome da música ou do artista. Os resultados aparecem aqui e tocam dentro do site.',
    ytPlaceholder: 'Pesquise ou cole um link do YouTube. O vídeo aparece aqui pra você ouvir.',
    ytNote: 'Toca a <b>faixa inteira de graça</b>, com anúncios, a menos que você tenha YouTube Premium logado <b>neste navegador</b>. Também aceita link colado do <b>youtube.com</b> ou <b>music.youtube.com</b>. O volume ao lado da busca controla o player de verdade.',
    ytPlaying: 'Tocando: {title}',
    ytPlayingLink: 'Tocando o link colado.',
    ytSearching: 'Procurando "{q}"…',
    ytResultsOne: '{n} resultado para "{q}". Clique pra tocar.',
    ytResultsMany: '{n} resultados para "{q}". Clique pra tocar.',
    ytFailed: 'A busca não respondeu agora. Tenta de novo em instantes, ou cole um link do YouTube direto no campo.',
    ytOpenExternal: 'Abrir a busca no YouTube',

    /* Google Agenda */
    calAria: 'Google Agenda',
    calTitle: 'Google Agenda',
    calConnected: 'Conectado',
    calDisconnectedStatus: 'Desconectado',
    calDisconnect: 'Desconectar',
    calIntro: 'Conecte sua conta do Google para acompanhar os compromissos da sua semana direto por aqui, sem sair do Gon.',
    calConnect: 'Conectar com o Google',
    calPrevWeek: 'Semana anterior',
    calNextWeek: 'Próxima semana',
    calThisWeek: 'Esta semana',
    calThisWeekBtn: 'esta semana',
    calLoading: 'Carregando...',
    calNote: 'Os compromissos são lidos direto da sua agenda principal do Google (<b>calendar.primary</b>), somente para visualização. O acesso fica só neste navegador e expira sozinho; não guardamos nada em servidor.',
    calAllDay: 'Dia todo',
    calNoTitle: '(sem título)',
    calOpenInGoogle: 'Abrir no Google Agenda',
    calToday: ' · hoje',
    calDayEmpty: 'sem compromissos',
    calLoadFail: 'Não deu pra carregar os eventos agora. Tenta de novo em instantes.',
    calScriptFail: 'Não consegui carregar o login do Google agora, {name}. Confere sua conexão e tenta de novo.',
    calConnectedSpeak: 'Conectado com o Google, {name}. Já dá pra ver seus compromissos da semana aqui.',
    calLoginAborted: 'O login do Google não terminou, {name}. Pode tentar de novo.',
    calLoginRefused: 'O Google recusou a conexão, {name}. Se o problema persistir, o Client ID pode não estar configurado ainda.',
    calNoClientId: 'Essa aba ainda não tem um Client ID do Google configurado, {name}. Cadastra um projeto no Google Cloud e cola o Client ID no código.',
    calExpired: 'Sua sessão do Google expirou, {name}. Conecta de novo quando quiser.',

    /* tarefas */
    doneTitle: 'Concluídas',
    doneEmpty: 'Suas tarefas concluídas do dia aparecem aqui.',
    archived: 'Arquivadas · ',
    tasksTitle: 'Tarefas',
    taskSearchPlaceholder: 'Pesquisar',
    taskSearchAria: 'Pesquisar tarefas',
    wd0: 'Dom', wd1: 'Seg', wd2: 'Ter', wd3: 'Qua', wd4: 'Qui', wd5: 'Sex', wd6: 'Sáb',
    taskInputPlaceholder: 'O que você precisa fazer hoje?',
    taskAdd: 'Adicionar',
    taskEmpty: 'Sem tarefas ainda. Escreve a primeira e assume o compromisso.',
    taskEmptyFiltered: 'Nada por aqui com esse filtro.',
    taskPending: '{n} pendente',
    taskPendingPlural: '{n} pendentes',
    taskAllDone: 'tudo concluído',
    taskDragHint: ' · arraste para priorizar',
    taskDragAria: 'Arraste para priorizar',
    taskCheckDo: 'Concluir',
    taskCheckUndo: 'Desmarcar tarefa concluída',
    taskCheckDoTitle: 'Marcar como concluída',
    taskCheckUndoTitle: 'Desmarcar como concluída',
    taskEditTitle: 'Clique para editar',
    taskMoreAria: 'Opções da tarefa',
    taskDeleteAria: 'Excluir tarefa',
    taskSubCount: '{done}/{total} subtarefas',
    taskShowSubs: 'Mostrar subtarefas',
    taskPrioTitle: 'Prioridade {name}',
    menuPriority: 'Prioridade',
    menuDate: 'Data',
    menuCategory: 'Categoria',
    menuCategoryPlaceholder: 'ex: cliente, estudo',
    menuAddSub: 'Adicionar subtarefa',
    menuDuplicate: 'Duplicar',
    menuArchive: 'Arquivar',
    menuUnarchive: 'Desarquivar',
    menuDelete: 'Excluir',
    prioHigh: 'Alta',
    prioMid: 'Média',
    prioLow: 'Baixa',
    prioNone: 'Nenhuma',
    dateToday: 'Hoje',
    dateTomorrow: 'Amanhã',
    dateWeek: 'Semana',
    dateNone: 'Nenhuma',
    subNewPlaceholder: 'Nova subtarefa',
    subAdd: '+ subtarefa',
    subCheckDo: 'Concluir subtarefa',
    subCheckUndo: 'Desmarcar subtarefa',
    subDelete: 'Excluir subtarefa',

    /* modal nome / intro */
    nameAria: 'Boas-vindas',
    nameTitle: 'Qual é o seu nome?',
    nameSub: 'Assim eu sei como te chamar enquanto você trabalha.',
    namePlaceholder: 'Seu nome',
    nameSubmit: 'Entrar',
    introAria: 'Apresentação do Gon',
    introGreet: 'Oi, {name}!',
    introGreetPlain: 'Oi!',
    introSub: 'Prazer em te conhecer, eu sou o Gon, seu parceiro de foco por aqui. Antes da gente começar, quero te contar rapidinho a minha história. Clica aqui:',
    introStoryBtn: 'Conhecer a história do Gon',

    /* configurações */
    settingsAria: 'Configurações',
    settingsTitle: 'Configurações',
    settingsSub: 'Tempos em minutos.',
    fieldName: 'Seu nome',
    fieldLanguage: 'Idioma',
    fieldPomodoro: 'Pomodoro',
    fieldShort: 'Pausa curta',
    fieldLong: 'Pausa longa',
    fieldWater: 'Lembrete de água',
    fieldWaterHint: '(intervalo em min)',
    fieldWaterGoal: 'Meta diária de água',
    fieldGoalPomos: 'Meta de Pomodoros',
    fieldGoalTasks: 'Meta de tarefas',
    perDay: '/dia',
    fieldAutoFocus: 'Modo foco automático',
    fieldAutoFocusHint: '(oculta distrações durante o Pomodoro)',
    on: 'Ligado',
    off: 'Desligado',
    cancel: 'Cancelar',
    save: 'Salvar',

    /* água (modal) */
    waterAria: 'Registro de água',
    waterTitle: 'Água de hoje',
    waterSub: 'Registrou errado? Remove o que não aconteceu de verdade.',
    waterOf: 'de {n}L',
    waterLogEmpty: 'Nenhum registro hoje. Use a gotinha ou os botões acima.',
    waterUndoLast: 'Desfazer último',
    close: 'Fechar',
    waterLatest: 'último',
    waterRemoveAria: 'Remover registro de {amount}',

    /* aquário */
    aqAria: 'Aquário',
    aqTitle: 'Aquário do Gon',
    aqCoinsTitle: 'Conchas: ganhe bebendo água',
    aqShells: ' conchas',
    aqSub: 'Beba água pra ganhar conchas (1 concha a cada 250&nbsp;ml). Adote até <b>5 peixinhos</b>, mas cuidado: sem água o tanque seca e eles adoecem. Mantenha o tanque cheio e eles vivem felizes.',
    aqMineLabel: 'Seus peixes ',
    aqEmpty: 'Nenhum peixe ainda. Adote um abaixo 🐟',
    aqShopLabel: 'Lojinha',
    aqRelease: 'soltar',
    aqAdopt: 'Adotar',
    aqFull: 'Tanque cheio',
    aqNeed: 'Faltam {n} 🐚',
    aqTankLimit: 'O tanque só cabe {n} peixes',
    aqNoCoins: 'Conchas insuficientes, beba mais água 🐚',
    aqReleased: 'Peixe solto de volta ao rio 🌊',
    aqDied1: 'Um peixinho não resistiu à seca 🥀',
    aqDiedN: '{n} peixes não resistiram 🥀',
    aqHp1: 'Feliz e saudável',
    aqHp2: 'De boa na água',
    aqHp3: 'Com sede, beba água',
    aqHp4: 'Doente! Encha o tanque',
    aqHp5: 'Quase morrendo, água já!',

    /* painel */
    panelAria: 'Painel: estatísticas, calendário e conquistas',
    panelTitle: 'Painel',
    panelCloseAria: 'Fechar painel',
    level: 'Nível {n}',
    tabStats: 'Estatísticas',
    tabCal: 'Calendário',
    tabAch: 'Conquistas',
    tabRec: 'Recordes',
    tabRot: 'Rotinas',
    tabAi: 'Planejar',
    tabAbout: 'Sobre',
    rangeToday: 'Hoje',
    rangeWeek: 'Semana',
    rangeMonth: 'Mês',
    rangeYear: 'Ano',
    chartFocusByDay: 'Foco por dia',
    chartFocusByMonth: 'Foco por mês',
    chartByHour: 'Produtividade por horário',
    chartEmpty: 'Sem registros nesse período ainda.',
    chartAria: 'Gráfico de barras',
    statFocusTime: 'Tempo focado',
    statPomos: 'Pomodoros',
    statTasks: 'Tarefas',
    statWater: 'Água',
    statStreak: 'Sequência',
    statStreakUnit: 'dias',
    statAvgFocus: 'Média de foco',
    statAvgFocusUnit: '/dia ativo',
    statActiveDays: 'Dias ativos',
    statActiveDaysOf: 'de {n}',

    /* calendário heatmap */
    heatTitle: 'Últimas 26 semanas',
    heatLess: 'menos ',
    heatMore: ' mais',
    heatHint: 'Clique em um dia para ver os detalhes.',
    heatNoRecords: '<b>{date}</b>: sem registros.',
    heatDetail: '<b>{date}</b>: foco <b>{focus}</b> · <b>{p}</b> {pLabel} · <b>{t}</b> {tLabel} · <b>{w}</b> de água{closed}',
    heatClosed: ' · dia encerrado',
    heatPomo1: 'Pomodoro',
    heatPomoN: 'Pomodoros',
    heatTask1: 'tarefa',
    heatTaskN: 'tarefas',

    /* recordes */
    recBestStreak: 'Maior sequência',
    recDays: 'dias',
    recBestFocusDay: 'Maior tempo focado em um dia',
    recMostPomos: 'Mais Pomodoros em um dia',
    recMostTasks: 'Mais tarefas em um dia',
    recTotalFocus: 'Foco acumulado',
    recTotalApp: 'Tempo total na plataforma',

    /* rotinas */
    rotDesc: 'Rotinas aplicam tempos, tarefas e meta de água de uma vez só.',
    rotEmpty: 'Nenhuma rotina ainda. Crie a primeira: Trabalho, Estudo, Manhã, Noite.',
    rotNew: 'Nova rotina',
    rotName: 'Nome',
    rotNamePlaceholder: 'Trabalho, Estudo, Manhã...',
    rotPomos: 'Pomodoros',
    rotFocus: 'Foco',
    rotBreak: 'Pausa',
    rotWater: 'Água',
    rotTasksLabel: 'Tarefas',
    rotTasksHint: '(uma por linha)',
    rotTasksPlaceholder: 'Editar vídeo do cliente\nResponder e-mails',
    rotSave: 'Salvar rotina',
    rotActivate: 'Ativar',
    rotDeleteAria: 'Excluir rotina',
    rotMetaBreak: ' · pausa ',
    rotTask1: ' tarefa',
    rotTaskN: ' tarefas',
    rotApplied: 'Rotina "{name}" ativa, {user}. {pomos} Pomodoros de {focus} minutos.',
    unitMin: 'min',
    unitL: 'L',

    /* planejar */
    aiDesc: 'Descreva o que precisa fazer e o organizador monta os blocos de foco, pausas e tarefas do dia.',
    aiPlaceholder: 'Hoje preciso terminar meu projeto, estudar e responder e-mails.',
    aiRun: 'Organizar',
    aiWorking: 'Organizando o seu dia…',
    aiFail: 'Não deu pra entender. Liste o que precisa fazer, separado por vírgulas.',
    aiPlanTitle: 'Plano sugerido',
    aiDiscard: 'Descartar',
    aiApply: 'Aplicar ao dia',
    planFocus: 'foco',
    planBreak: 'pausa',
    planLongBreak: 'Pausa longa',
    planBreakLabel: 'Pausa',
    planAddedOne: ' ({n} tarefa nova.)',
    planAddedMany: ' ({n} tarefas novas.)',
    aiPrompt: 'Você é o planejador de dia do Gon, um assistente de foco e produtividade que organiza o dia da pessoa seguindo a metodologia Pomodoro (blocos de {pomo}min de foco, pausas de {short}min, pausa longa de {long}min a cada 4 blocos). Agora são {now}. A pessoa descreveu o dia assim: "{text}".\n\nAo montar o plano, priorize a metodologia — o ritmo consistente de foco e pausa — e não metas ou marcos a bater:\n- Abra o dia com uma tarefa rápida ou simples, apenas para entrar no ritmo de foco/pausa, sem tratar isso como uma conquista.\n- Ordene as tarefas seguintes por prioridade e esforço mental, evitando encadear duas tarefas muito exigentes seguidas, para manter o processo sustentável e proteger a atenção.\n- Se uma tarefa parecer vaga ou grande demais, quebre-a em passos menores dentro da estrutura de blocos, mantendo o foco no processo de trabalho, não em atingir um resultado.\n- Use uma linguagem direta e acolhedora nos labels, sem palavras como "meta", "conquista" ou "vitória".\n\nResponda APENAS com JSON válido, sem markdown, comentários ou texto fora do JSON, no formato exato: {"tasks":["..."],"blocks":[{"time":"HH:MM–HH:MM","label":"...","type":"foco|pausa"}]}. Tarefas curtas e objetivas em português. No máximo 12 blocos.',

    /* resumo */
    sumAria: 'Resumo da sessão',
    sumTitle: 'Resumo do dia',
    sumBack: 'Voltar',
    sumConfirm: 'Encerrar o dia',
    sumGoalPomos: 'Pomodoros: {a} de {b}',
    sumGoalTasks: 'Tarefas: {a} de {b}',
    sumGoalWater: 'Água: {a} de {b}L',
    sumAlreadyClosed: 'Esse dia já foi encerrado. Os números continuam contando.',
    sumMsg3: 'Dia completo. As três metas batidas. Isso é constância.',
    sumMsg2: 'Duas de três. Dia sólido.',
    sumMsg1: 'Uma meta batida. Amanhã dá pra subir.',
    sumMsgFocus: 'Teve foco hoje. Registrado.',
    sumMsgBlank: 'Dia em branco. Amanhã a página vira.',

    /* notificações */
    notifFreeStart: 'Sessão livre iniciada',
    notifFreeStartBody: 'Contando o tempo agora, {name}.',
    notifPomoStart: 'Pomodoro iniciado',
    notifPomoStartBody: 'Foco ligado, {name}. {min} min no cronômetro.',
    notifShortStart: 'Pausa curta iniciada',
    notifShortStartBody: 'Respira um pouco, {name}. {min} min.',
    notifLongStart: 'Pausa longa iniciada',
    notifLongStartBody: 'Descanso merecido, {name}. {min} min.',
    notifChronoStart: 'Cronômetro iniciado',
    notifChronoStartBody: 'Contando o tempo, {name}.',
    notifCountdownDone: 'Countdown concluído',
    notifCountdownDoneBody: 'O tempo acabou, {name}.',
    notifPomoDone: 'Pomodoro concluído',
    notifPomoDoneBody: 'Boa, {name}. Hora da pausa.',
    notifBreakDone: 'Pausa acabou',
    notifBreakDoneBody: 'Volta pro foco, {name}.',
    notifFreeDone: 'Sessão livre concluída',
    notifFreeDoneBody: 'Duração: {dur}, {name}.',
    notifSessionEnd: 'Sessão encerrada',
    notifSessionEndBody: 'Você encerrou antes do fim, {name}.',
    notifWater: 'Hora da água',
    notifWaterBody: 'Um copo agora, {name}.',

    /* falas contextuais */
    speakTaskStart: 'Bora, {name}: "{task}"',
    speakFreeLogged: 'Sessão de {dur} registrada, {name}. Tudo no gráfico.',
    fireplaceMute: 'Mutar som da lareira',
    fireplaceUnmute: 'Ativar som da lareira',
    fireplaceTitle: 'Som da lareira',

    /* sobre */
    aboutLoreTitle: 'A história do Gon',
    aboutLoreTag: 'Lenda',
    aboutLore1: 'Antes de existir qualquer tarefa, qualquer cronômetro ou qualquer meta, havia apenas um ponto de luz laranja pulsando sozinho, sem missão, sem aliado, sem motivo pra continuar aceso. Foi só no instante em que o primeiro pomodoro chegou ao fim que essa faísca ganhou forma: pernas, olhos e um nome. <b>Gon</b> não nasceu de um raio nem de uma profecia antiga. Nasceu de 25 minutos de foco, os primeiros de muitos que ainda viriam.',
    aboutLore2: 'Desde então, Gon selou um pacto simples com quem abrisse o app: <b>"Eu cuido do tempo, você cuida de usá-lo bem."</b> A cada tarefa concluída, cada litro de água registrado, cada sequência mantida, ele ganha um pouco mais de força, e o seu XP sobe junto com o dele. O maior adversário dessa jornada nunca teve nome oficial. Você talvez o conheça como procrastinação, adiamento, aquela aba extra aberta sem motivo. Gon não vence essa batalha por você, mas fica ao seu lado enquanto você luta, e comemora junto quando você vence.',
    aboutLore3: 'Essa história não tem final marcado. Cada dia que você abre o app é um novo capítulo, cada nível que você sobe é uma página virada. Gon só pede uma coisa: que você volte amanhã pra continuar escrevendo.',
    aboutFireCaption: 'Fim do capítulo · continue lendo',
    aboutGoalTitle: 'Objetivo do aplicativo',
    aboutGoal1: 'Este app existe pra ajudar você a <b>estruturar o seu tempo de trabalho ou estudo</b> em blocos de foco e pausas reais, acompanhar tarefas, manter a hidratação em dia e enxergar, com dados simples, onde a sua produtividade realmente acontece.',
    aboutGoal2: 'A ideia não é vigiar, é dar forma ao seu dia: um cronômetro que respeita o método Pomodoro, um painel que guarda seu histórico e progresso, e um companheiro visual que reage ao que você faz, pra que manter o foco pareça menos um esforço de força de vontade e mais um hábito construído aos poucos.',
    aboutRulesTitle: 'O que significa cada coisa',
    ruleCountdown: 'Regressivo',
    ruleCountdownD: 'Timer com tempo definido (ex.: 25min de foco). Ele conta pra trás até zero e avisa quando o bloco termina.',
    ruleFree: 'Sessão livre',
    ruleFreeD: 'Timer que só conta pra cima, sem um tempo alvo. Ideal quando você não quer se prender a um número fixo de minutos.',
    rulePomo: 'Pomodoro',
    rulePomoD: 'Técnica de foco em blocos curtos (normalmente 25min) intercalados com pausas. Cada bloco concluído conta como 1 pomodoro no seu dia.',
    ruleFocusTime: 'Tempo focado',
    ruleFocusTimeD: 'Soma de todos os minutos em que o cronômetro rodou de verdade, sem contar pausas.',
    ruleTasks: 'Tarefas',
    ruleTasksD: 'Sua lista de afazeres do dia. Marcar uma como concluída soma XP e aparece no seu resumo do dia.',
    ruleWater: 'Água',
    ruleWaterD: 'Sua meta de hidratação diária, medida em litros (ex.: 0L/2L). Registrar água também alimenta suas estatísticas.',
    ruleStreak: 'Sequência',
    ruleStreakD: 'Quantidade de dias seguidos em que você cumpriu pelo menos uma meta do dia. Faltar um dia reinicia a contagem.',
    ruleLevel: 'Nível &amp; XP',
    ruleLevelD: 'Cada pomodoro, tarefa concluída e meta batida rende XP. Ao acumular XP suficiente, você sobe de nível.',
    ruleAch: 'Conquistas',
    ruleAchD: 'Marcos especiais que você desbloqueia ao atingir certos comportamentos (ex.: primeira semana completa, primeira sequência de 7 dias).',
    ruleRec: 'Recordes',
    ruleRecD: 'Seus melhores números históricos: maior sequência, dia com mais foco, mais pomodoros num único dia, entre outros.',
    ruleCal: 'Calendário',
    ruleCalD: 'Mapa de calor com as últimas semanas. Quanto mais escuro o dia, mais tempo de foco você teve nele.',
    ruleRot: 'Rotinas',
    ruleRotD: 'Modelos salvos que aplicam de uma vez um conjunto de pomodoros, tempos de foco/pausa, meta de água e tarefas.',
    rulePlan: 'Planejar',
    rulePlanD: 'Descreva o que precisa fazer em texto livre e o app monta uma sugestão de blocos de foco, pausas e tarefas pro seu dia.',
    ruleFocusMode: 'Modo foco',
    ruleFocusModeD: 'Modo mais enxuto de tela, que esconde distrações visuais enquanto o cronômetro está rodando.',
    aboutTipsTitle: 'Como aproveitar melhor',
    tip1: 'Comece o dia definindo suas tarefas antes de dar play no cronômetro, assim o Gon sabe o que vocês dois estão perseguindo.',
    tip2: 'Prefira o Regressivo com blocos de 25min pra tarefas que exigem concentração alta, e a Sessão livre pra trabalhos mais soltos ou criativos.',
    tip3: 'Respeite as pausas. Elas contam tanto quanto o foco pro seu equilíbrio, e é quando o Gon também descansa.',
    tip4: 'Registre a água ao longo do dia, não tudo de uma vez no fim. Isso deixa suas estatísticas por horário mais fiéis à realidade.',
    tip5: 'Crie rotinas pros seus contextos mais comuns (Trabalho, Estudo, Manhã) pra começar o dia em poucos segundos.',
    tip6: 'Use o Planejar quando não souber por onde começar: descreva o que precisa fazer e ajuste o plano sugerido antes de aplicar.',
    tip7: 'Encerre o dia pelo resumo, mesmo em dias fracos. É isso que mantém sua sequência e seu histórico completos no Calendário.',
    aboutFoot: 'Feito pra quem trabalha e estuda sozinho, mas não precisa se sentir sozinho fazendo isso.',
    aboutCreditsLabel: 'Desenvolvido por'
  },

  /* conquistas */
  ACH: {
    first_task:       { title: 'Primeira tarefa',   desc: 'Escreveu a primeira tarefa.' },
    first_pomo:       { title: 'Primeiro Pomodoro', desc: 'Completou o primeiro ciclo de foco.' },
    pomos_10:         { title: 'Dez ciclos',        desc: '10 Pomodoros completos.' },
    pomos_100:        { title: 'Cem ciclos',        desc: '100 Pomodoros completos.' },
    tasks_100:        { title: 'Cem entregas',      desc: '100 tarefas concluídas.' },
    streak_7:         { title: 'Uma semana',        desc: '7 dias consecutivos com foco.' },
    streak_30:        { title: 'Um mês inteiro',    desc: '30 dias consecutivos com foco.' },
    focus_10h:        { title: 'Dez horas',         desc: '10 horas de foco acumuladas.' },
    focus_100h:       { title: 'Cem horas',         desc: '100 horas de foco acumuladas.' },
    water_goal_7:     { title: 'Bem hidratado',     desc: 'Meta de água batida em 7 dias.' },
    day_closed_first: { title: 'Dia encerrado',     desc: 'Fechou o primeiro dia com resumo.' },
    routine_first:    { title: 'Método próprio',    desc: 'Criou a primeira rotina.' }
  },

  /* peixes */
  FISH: {
    guppy:  { name: 'Guppy',   rarity: 'comum' },
    tetra:  { name: 'Tetra',   rarity: 'comum' },
    goldie: { name: 'Dourado', rarity: 'incomum' },
    betta:  { name: 'Betta',   rarity: 'raro' },
    koi:    { name: 'Koi',     rarity: 'lendário' }
  },
  FISH_MSG: {
    died: ['{name}, faltou água e um peixinho se foi. Enche o tanque.', 'O tanque secou e perdi um amigo, {name}. Bebe água!'],
    adopted: ['{name}, um {sp} novo no tanque! Mantém a água em dia.', 'Bem-vindo ao tanque, pequeno {sp}! Não deixa faltar água, {name}.']
  },

  /* frases do jogo da velha */
  PHRASES: {
    gonWin: [
      'Eu disse que seria difícil.', 'Boa tentativa.', 'Quase.', 'Mais uma?',
      'Você está melhorando.', 'Ainda não foi dessa vez.', 'Continue tentando.',
      'Xeque-mate, bom, quase isso.', 'Essa eu já sabia de cor.', 'Relaxa, é só um jogo.',
      'Foco na próxima pausa.', 'Fica pra próxima.'
    ],
    draw: [
      'Interessante.', 'Empate também é estratégia.', 'Estamos equilibrados.',
      'Você escapou dessa.', 'Ninguém cedeu hoje.', 'Empate justo.',
      'Bom jogo, sem vencedor.', 'Vamos de novo?'
    ],
    userWin: [
      'Impressionante.', 'Muito bem.', 'Quero revanche.', 'Agora ficou interessante.',
      'Você realmente conseguiu.', 'Ok, essa foi sua.', 'Não vai se acostumar com isso.',
      'Bem jogado, sério.'
    ]
  },

  /* falas do Gon */
  MSG: {
    intro: [
      "Prazer, {name}. Eu sou o Gon, seu parceiro de foco. Você trabalha, eu cuido do resto.",
      "{name}, sou o Gon. Minha função é simples: fazer o seu dia render. A sua é apertar Começar.",
      "Gon aqui, {name}. Eu conto o tempo, lembro da água e cobro resultado. Combinado?",
      "Me chamo Gon, {name}. Pensa em mim como um sócio: eu não faço nada, mas cobro tudo.",
      "Nasci de um pomodoro concluído, {name}. Desde então, esse é o pacto: eu cuido do tempo, você cuida de usá-lo bem.",
      "{name}, sou só uma faísca que ganhou pernas. Mas faísca acesa acompanha até o fim. Bora?"
    ],
    greetingMadrugada: [
      "{name}, madrugada acordado? Então que seja produtiva.",
      "Todo mundo dormindo e você aqui, {name}. Silêncio é vantagem competitiva.",
      "{name}, essa hora não tem notificação. É o melhor foco que existe.",
      "Madrugada, {name}. Se topar mais um bloco, eu tô aqui. Se for dormir, também tá certo.",
      "3 da manhã é hora de gênio ou de teimoso, {name}. Me mostra qual dos dois."
    ],
    greetingManha: [
      "Bom dia, {name}. Cérebro descansado é o seu melhor equipamento. Usa agora.",
      "Manhã, {name}. A primeira tarefa do dia define as outras. Escolhe bem.",
      "{name}, café na mão? Então bora abrir o placar do dia.",
      "Bom dia, {name}. O dia inteiro na sua frente. Isso é raro, aproveita.",
      "Acordou, {name}. Enquanto a concorrência rola o feed, a gente foca."
    ],
    greetingTarde: [
      "Boa tarde, {name}. Metade do dia foi, a outra metade ainda é sua.",
      "{name}, a tarde é onde os dias bons se separam dos médios. Bora?",
      "Tarde, {name}. Digestão não é desculpa: um Pomodoro resolve a preguiça.",
      "{name}, o que ficou pra depois do almoço chegou. É agora.",
      "Boa tarde, {name}. Quem fecha a tarde bem, dorme melhor. Comprovado."
    ],
    greetingNoite: [
      "Boa noite, {name}. Última janela do dia. Vamos fechar com saldo positivo.",
      "{name}, sessão noturna. Menos distração, mais entrega.",
      "Noite, {name}. Uma boa sessão agora e amanhã você acorda na frente.",
      "{name}, o dia ainda não acabou. Um bloco de foco e a gente encerra bonito.",
      "Boa noite, {name}. Rende agora, descansa depois, nessa ordem."
    ],
    greeting: [
      "Voltou, {name}. Vamos deixar hoje valer a pena?",
      "E aí, {name}! Bora começar?",
      "{name}, o que você vai destravar hoje?",
      "Mais um capítulo, {name}. O de hoje é com você."
    ],
    idle: [
      "{name}, tá esperando o quê? Aperta Começar.",
      "O botão não vai se apertar sozinho, {name}.",
      "{name}, cada minuto parado é um minuto que não volta.",
      "Escreve uma tarefa ali embaixo, {name}, e assume o compromisso.",
      "{name}, decidir rápido também é produtividade. Escolhe uma tarefa e vai.",
      "Eu fico aqui andando e você aí parado, {name}. Um de nós tá errado.",
      "{name}, o placar de hoje ainda tá zerado. Bora mudar isso.",
      "Faísca parada não esquenta ninguém, {name}. Bora."
    ],
    idleMadrugada: [
      "{name}, se veio até aqui a essa hora, não foi pra olhar a tela.",
      "Madrugada rende, {name}, mas só pra quem começa.",
      "Sem sono e sem foco é o pior dos mundos, {name}. Resolve um dos dois.",
      "{name}, até a faísca tá acordada. Faz valer."
    ],
    idleManha: [
      "A manhã é o seu horário mais caro, {name}. Não gasta ela parado.",
      "{name}, começa agora e às 10h você já tá com vantagem.",
      "Primeiro Pomodoro do dia é o mais difícil, {name}. Depois desliza."
    ],
    idleTarde: [
      "{name}, a tarde passa rápido. Quem piscar, perde.",
      "Sono pós-almoço se cura com foco, {name}. Testa.",
      "{name}, ainda dá pra virar o dia. Mas só se começar agora."
    ],
    idleNoite: [
      "{name}, quanto antes começar, mais cedo termina. Matemática simples.",
      "Uma sessão agora, {name}, e você encerra o dia em paz.",
      "{name}, a noite é curta. Foco no essencial e fecha o dia."
    ],
    startFocus: [
      "Bora, {name}! Foco total.",
      "Fecha as outras abas, {name}. Todas.",
      "Menos rolagem, mais entrega, {name}.",
      "{name}, agora é isso aqui e mais nada.",
      "Cronômetro rodando, {name}. Sem desculpa agora.",
      "Modo profundo ativado, {name}. Eu seguro as pontas aqui fora.",
      "{name}, 25 minutos bem usados valem por 2 horas de enrolação. Prova isso.",
      "Faísca acesa, {name}. Enquanto ela durar, eu não desvio o olhar.",
      "Começou, {name}. É assim que o pacto funciona: eu conto, você entrega."
    ],
    startBreak: [
      "Agora eu deito e você descansa, {name}.",
      "Pausa merecida, {name}. Relaxa de verdade.",
      "{name}, levanta da cadeira e estica. Ordens do Gon.",
      "Pausa é parte do método, {name}. Descansar também é trabalhar."
    ],
    chronoStart: [
      "Cronômetro rodando, {name}. O tempo agora tá sendo medido.",
      "Contando, {name}. O que é medido, melhora.",
      "Tempo aberto, {name}. Me mostra o seu ritmo.",
      "Marcado, {name}. Esse capítulo começa agora."
    ],
    chronoDone: [
      "Tempo esgotado, {name}. Cravado no segundo.",
      "Acabou o regressivo, {name}. Missão dada é missão cumprida?",
      "Zero no relógio, {name}. Espero que o resultado esteja aí."
    ],
    sessionFinished: [
      "Sessão encerrada, {name}. O que foi focado, contou.",
      "Fechou antes, {name}. Tudo bem, minutos honestos valem mais que timer cheio.",
      "Registrado, {name}. Melhor uma sessão curta e real do que uma longa de mentira.",
      "{name}, guardei essa sessão. Toda hora focada entra pra conta."
    ],
    nudgeFocus: [
      "Ainda tá aí, {name}?",
      "Cada minuto conta, {name}.",
      "Tá quase, {name}, não trava agora.",
      "Instagram espera, {name}. Isso não.",
      "Se travou, quebra em partes menores, {name}. Funciona sempre.",
      "Respira, {name}, e continua. Falta menos do que parece.",
      "{name}, o foco de agora é o resultado de depois.",
      "Segura mais um pouco, {name}. A faísca aguenta se você aguentar."
    ],
    nudgeBreak: [
      "Aproveita a pausa, {name}, é curta.",
      "Relaxa mesmo, {name}, sem culpa. Faz parte do sistema.",
      "Longe da tela, {name}. Pausa olhando celular não é pausa."
    ],
    paused: [
      "Pausou, {name}? Ok, só não estica.",
      "Um respiro rápido, {name}. Volta logo.",
      "Pausa registrada, {name}. O relógio te espera, eu também."
    ],
    pomodoroDone: [
      "Parabéns, {name}! Sessão fechada.",
      "Boa, {name}! Mais uma no bolso.",
      "Feito, {name}! Você é mais disciplinado do que pensa.",
      "Sessão no bolso, {name}. Segue o jogo.",
      "{name}, mais um tijolo na parede. Constrói.",
      "Isso vai direto pro seu gráfico, {name}. Eu anoto tudo.",
      "Ciclo completo, {name}. Eficiência não é sorte, é repetição.",
      "Senti isso, {name}. Cada pomodoro seu me deixa um pouco mais forte também.",
      "{name}, foi assim que eu nasci: um bloco de foco de cada vez. Segue construindo."
    ],
    milestone: [
      "OFENSIVA, {name}! Você tá em outro nível.",
      "{name}, isso é maratona, não é sorte. Segue.",
      "Que série, {name}! Não perde o ritmo agora.",
      "Sequência absurda, {name}. Os números não mentem.",
      "{name}, essa chama não apaga fácil. Continua alimentando ela."
    ],
    breakDone: [
      "Pausa acabou, {name}. Bora pra próxima.",
      "Recarregou, {name}? Volta pro trabalho.",
      "Fim da pausa, {name}. O ritmo é seu amigo, não solta ele.",
      "{name}, faísca reacesa. Bora pro próximo bloco."
    ],
    focusMilestone: [
      "Você está construindo um bom ritmo, {name}.",
      "Continua, um passo de cada vez.",
      "Cada minuto de foco conta.",
      "Ótimo trabalho, {name}. Mantém esse ritmo.",
      "Você está avançando.",
      "Respira fundo e continua.",
      "A consistência faz diferença, {name}."
    ],
    companionStudy: [
      "Enquanto você trabalhava aí, eu estudei aqui. Parceria, {name}.",
      "Bem-vindo de volta, {name}. Aproveitei pra estudar um pouco também.",
      "Seguimos juntos, {name}: você no seu trabalho, eu nos meus livros.",
      "De volta, {name}? O tempo continuou contando certinho por aqui.",
      "Cada um na sua tarefa e o bloco rendendo. É assim que funciona, {name}."
    ],
    listening: [
      "Fone no ouvido, {name}! Agora sim: bora voltar pro foco e render muito mais.",
      "Música ligada, {name}. Agora a gente fica ainda mais produtivo. Volta pro pomodoro.",
      "Peguei o fone aqui também, {name}. Foco com trilha sonora rende o dobro.",
      "{name}, música rolando. Agora não tem desculpa: volta pro que importa e produz mais.",
      "Trilha sonora ligada, {name}. Toda faísca gosta de um ritmo bom."
    ],
    water: [
      "Hora da água, {name}. Um copo agora, eu espero.",
      "{name}, pausa de 30 segundos: hidrata. Eu já tô bebendo a minha.",
      "Água, {name}. Cérebro seco não edita vídeo.",
      "Hidratação, {name}. 2% de desidratação já derruba seu foco. É ciência."
    ],
    waterGoal: [
      "Meta de água batida, {name}! Hidratação em dia.",
      "{name}, bateu o copo da meta. Corpo agradece.",
      "Pronto, {name}. Meta de água cumprida, e ainda rendeu XP."
    ],
    waterUndone: [
      "Corrigido, {name}. Só vale o que você bebeu de verdade.",
      "Registro removido, {name}. Número honesto é melhor que número bonito.",
      "Desfeito, {name}. Dados limpos, consciência limpa."
    ],
    grabbed: [
      "Ei! Me solta, {name}.",
      "Sério isso, {name}? Me põe no chão.",
      "Socorro! Sequestro em plena luz do dia.",
      "{name}, eu não sou brinquedo. Sou consultor.",
      "Cuidado, eu sou feito de pixel, não de borracha.",
      "Solta a faísca, {name}, ela mal cabe na sua mão."
    ],
    dropped: [
      "Pô, cara, tá de sacanagem? Volta pro foco, {name}.",
      "Você me jogou no chão pra fugir do trabalho, {name}. Volta.",
      "Doeu. E olha que eu nem tenho ossos. Bora focar, {name}.",
      "Muito engraçado, {name}. Agora aperta Começar.",
      "Se você tem tempo pra me arremessar, tem tempo pra tarefa, {name}.",
      "{name}, faísca no chão não ilumina ninguém. Levanta os dois."
    ],
    droppedWorking: [
      "Tá de sacanagem, {name}? O timer tá rodando. Volta pro foco!",
      "Você pausou a vida pra me arrastar? Volta pro trabalho, {name}.",
      "O cronômetro não para pra você brincar, {name}. Foco."
    ],
    hit: [
      "Ai! Por que você fez isso, {name}?",
      "Ô! Bater em mim não risca nada da sua lista, {name}.",
      "Isso dói, {name}. Pouco, mas dói.",
      "Bateu no seu próprio consultor. Parabéns, {name}.",
      "Eu tô do seu lado, {name}. Literalmente.",
      "{name}, uma faísca não devolve tapa. Mas guarda na memória."
    ],
    hitAngry: [
      "PARA, {name}! Eu tô aqui pra te ajudar.",
      "Chega, {name}. Bate na tarefa, não no Gon.",
      "Se essa energia toda fosse pro Pomodoro, {name}, você já tinha acabado.",
      "Última vez, {name}. Depois eu conto pro seu cliente."
    ],
    panic: [
      "AI! Sai pra lá, {name}!",
      "Socorro! Ele tá violento!",
      "Nãããão! Longe de mim, {name}!",
      "Corre, corre, corre!",
      "Uma faísca em pânico, {name}! Isso não tava na lenda!"
    ],
    panicAngry: [
      "SOCORRO! O {name} enlouqueceu!",
      "Foge! Volta pro foco, {name}, e me deixa em paz!",
      "Eu não ganho o suficiente pra isso, {name}!",
      "Isso é assédio, {name}! ASSÉDIO!"
    ],
    drown1: [
      "Ei! Água não, {name}!",
      "Opa opa opa, me tira daqui!",
      "{name}, eu sou uma CHAMA! Isso vai me apagar!"
    ],
    drown2: [
      "Glub... glub...",
      "Não sei nadar, {name}...",
      "Blub. Blub. {name}, para."
    ],
    drownHelp: [
      "SOCORRO! Eu sou feito de pixel, não sei nadar!",
      "SOCOOOORRO! {name}, me tira da água!",
      "ME AJUDA, {name}! Eu tô afundando!"
    ],
    drownEscape: [
      "Cof, cof... essa foi por pouco, {name}.",
      "Quase, {name}. Quase.",
      "Nunca mais faça isso."
    ],
    drownRage: [
      "Você quase me AFOGOU, {name}! Volta pro foco!",
      "Se você tivesse foco, não estaria brincando comigo. VOLTA PRO TRABALHO!",
      "Eu quase morri e a sua tarefa continua parada, {name}. Volta.",
      "Você não tem foco suficiente pra cumprir o que prometeu, {name}. VOLTA AGORA.",
      "Ninguém entrega nada afogando o próprio robô, {name}. Foco!",
      "Eu sou literalmente uma faísca, {name}! Água e eu NÃO combinamos!"
    ],
    taskAdded: [
      "Anotado, {name}. Agora cumpre.",
      "Na lista, {name}.",
      "Boa, {name}. Compromisso registrado.",
      "Escrito é contrato, {name}. Eu testemunhei.",
      "Mais uma na fila, {name}. Dica do Gon: começa pela mais chata.",
      "{name}, mais uma missão no seu capítulo de hoje."
    ],
    taskDone: [
      "Riscou mais uma, {name}. Boa.",
      "Menos uma na lista, {name}.",
      "É disso que eu gosto, {name}.",
      "Feita, {name}. XP no bolso, gráfico subindo.",
      "Executou, {name}. Falar é fácil, você fez.",
      "{name}, mais um pedaço da missão de hoje resolvido."
    ],
    allDone: [
      "Lista limpa, {name}. Dia vencido.",
      "{name}, zerou as tarefas. Respeito.",
      "Tudo feito, {name}. Isso merece constar no resumo do dia."
    ],
    taskDeleted: [
      "Apagada, {name}. Menos peso na lista.",
      "Fora da lista, {name}. Cortar também é decidir.",
      "Excluída, {name}. Lista enxuta, mente enxuta."
    ],
    taskArchived: [
      "Arquivada, {name}. Fora da vista, não da memória.",
      "Guardada, {name}. Hoje não é o dia dela.",
      "No arquivo, {name}. Foco no que é de agora."
    ],
    taskDuplicated: [
      "Duplicada, {name}. Trabalho em série, gosto disso.",
      "Cópia pronta, {name}. Eficiência é não redigitar.",
      "Clonada, {name}. Dois coelhos, uma tarefa."
    ],
    prioHigh: [
      "Prioridade alta, {name}. Então ela vem primeiro, sem furar fila.",
      "Marcada como alta, {name}. O importante na frente do urgente de mentira.",
      "Alta prioridade, {name}. Agora trata ela como tal."
    ],
    dueSet: [
      "Data marcada, {name}. Prazo dado é prazo cobrado.",
      "Agendada, {name}. Eu não esqueço, faz parte do serviço.",
      "No calendário, {name}. Combinado não sai caro."
    ],
    subtaskAdded: [
      "Subtarefa anotada, {name}. Dividir é o jeito mais rápido de terminar.",
      "Quebrou em partes, {name}. Jogada inteligente.",
      "Passo registrado, {name}. Grande tarefa é só várias pequenas."
    ],
    skipBreak: [
      "Emendou direto, {name}? Gosto da fome. Bora.",
      "Sem pausa então, {name}. Foco de novo.",
      "Pulou a pausa, {name}. Só não vira hábito, descanso também rende."
    ],
    wake: [
      "Opa, acordei. Bora, {name}?",
      "Tava só descansando o pixel, {name}.",
      "Cochilei? Gon nunca cochila. Estava... processando.",
      "Faísca de novo acesa, {name}. Onde paramos?"
    ],
    lockedTab: [
      "Pausa o Pomodoro antes de trocar, {name}.",
      "Termina ou pausa primeiro, {name}. Aí sim troca.",
      "Foco rodando, {name}. Pausa pra trocar de modo."
    ],
    levelUp: [
      "Nível {lvl}, {name}. Constância pagando.",
      "Subiu pro nível {lvl}, {name}. Isso não se compra, se acumula.",
      "Nível {lvl} desbloqueado, {name}. Os dados mostram evolução.",
      "{name}, nível {lvl}. Silencioso, consistente, eficaz. Do meu jeito.",
      "Nível {lvl}, {name}. Combinamos que eu fico mais forte com o seu esforço, e olha a gente aí.",
      "{name}, virou página: nível {lvl}. Essa história só cresce."
    ],
    achUnlock: [
      "Conquista: {ach}, {name}. Registrada no painel.",
      "{name}, desbloqueou \"{ach}\". Eu vi tudo, e anotei.",
      "Nova conquista, {name}: {ach}. Merecida, não sorteada.",
      "\"{ach}\" é sua, {name}. O painel guarda a data.",
      "{name}, \"{ach}\" entra pra sua história. Já são vários capítulos bons."
    ],
    dayClosed: [
      "Dia encerrado, {name}. Amanhã continua de onde parou.",
      "Fechado, {name}. O que ficou pra trás, fica. O que importa vem amanhã.",
      "Dia arquivado, {name}. Números salvos, consciência tranquila.",
      "Capítulo de hoje fechado, {name}. Amanhã a gente escreve o próximo."
    ],
    dayClosedNight: [
      "Dia encerrado, {name}. Agora desliga de verdade, descanso é parte do método.",
      "Fechou o dia, {name}. Dorme bem: amanhã os gráficos te esperam.",
      "Encerrado, {name}. Tela desligada, cabeça também. Boa noite.",
      "{name}, mais um capítulo terminado. Descansa, a história continua amanhã."
    ],
    planApplied: [
      "Dia organizado, {name}. Plano na lista, agora é executar.",
      "Blocos montados, {name}. Planejar levou 1 minuto, viu como rende?",
      "Plano aplicado, {name}. Pensar antes de fazer: assinatura do Gon."
    ],
    settingsSaved: [
      "Configurações salvas, {name}. Sistema ajustado ao seu jeito.",
      "Ajustes gravados, {name}. Ferramenta boa é ferramenta calibrada.",
      "Salvo, {name}. Agora o método é sob medida.",
      "{name}, pacto atualizado. Segue valendo, só que do seu jeito."
    ],
    nameChanged: [
      "Prazer em te conhecer assim, {name}. Pode deixar que a partir de agora é assim que eu te chamo.",
      "Anotado, {name}. Novo nome, mesmo compromisso.",
      "Combinado, {name}. Vou te chamar assim daqui pra frente."
    ],
    langChanged: [
      "Idioma trocado, {name}. Agora a gente se entende assim.",
      "Feito, {name}. Mesma faísca, outra língua.",
      "Pronto, {name}. Só o idioma mudou, o pacto é o mesmo."
    ],
    panelOpen: [
      "Números na mesa, {name}. Aqui não tem achismo.",
      "Seu painel, {name}. O que é medido, melhora. Palavra de Gon.",
      "Dados abertos, {name}. É aqui que a disciplina vira gráfico.",
      "{name}, esse painel é a sua parte da história. A minha tá lá em Sobre."
    ],
    batteryLow: [
      "{name}, a bateria tá baixa. Procura uma tomada antes que o foco seja interrompido por mim.",
      "Ei, {name}, sua bateria caiu forte. Não deixa o dispositivo desligar no meio da sessão.",
      "{name}, bateria crítica. Um carregador agora evita perder o que você já construiu hoje.",
      "Atenção, {name}: pouca bateria. Carrega logo, senão quem para sou eu.",
      "Nem faísca sobrevive sem energia, {name}. Carrega esse dispositivo."
    ]
  }
});

/* ===================== en ===================== */
GonI18n.registerPack('en', {

  meta: {
    htmlLang: 'en',
    description: 'Pomodoro timer with tasks, hydration, music and Gon, a virtual companion that works alongside you to keep you focused.',
    titleIdle: 'Gon - focus and productivity',
    titlePaused: 'Paused · Gon',
    decimalComma: false,
    fallbackName: 'you'
  },

  fmt: {
    weekdaysShort: ['sun','mon','tue','wed','thu','fri','sat'],
    monthsShort:   ['jan','feb','mar','apr','may','jun','jul','aug','sep','oct','nov','dec'],
    monthsLong:    ['January','February','March','April','May','June','July','August','September','October','November','December'],
    calWeekdays:   ['mon','tue','wed','thu','fri','sat','sun'],
    hourSuffix: 'h',
    minShort: 'min',
    hourShort: 'h',
    lessThanMin: '<1min',
    zeroMin: '0min',
    dateSep: ' ',
    rangeOf: ' of '
  },

  ui: {
    /* header */
    feedbackAria: 'Send feedback',
    feedback: 'Feedback',
    brandAria: 'Open About Gon',
    brandSr: 'Gon — focus and productivity',
    panelBtnAria: 'Dashboard: stats, calendar, achievements',
    panelBtnTitle: 'Dashboard',
    musicBtn: 'Music (Spotify)',
    calBtn: 'Google Calendar',
    themeBtnTitle: 'Light/dark theme',
    themeToLight: 'Switch to light theme',
    themeToDark: 'Switch to dark theme',
    settingsBtn: 'Settings',
    batteryTitle: 'Battery: {pct}%',
    batteryCharging: ' (charging)',

    /* tabs / timer */
    tabsAria: 'Timer mode',
    modePomodoro: 'Pomodoro',
    modeShort: 'Short break',
    modeLong: 'Long break',
    modeChrono: 'Stopwatch',
    modeFree: 'Open session',
    timerAria: 'Session time',
    chronoUp: 'Stopwatch',
    chronoDown: 'Countdown',
    chronoFree: 'Open session',
    btnStart: 'Start',
    btnPause: 'Pause',
    btnResume: 'Resume',
    btnReset: 'Reset',
    btnFinish: 'Finish',
    btnSkipBreak: 'Skip break',
    hint: '<kbd>Space</kbd> starts and pauses &nbsp;·&nbsp; <kbd>R</kbd> resets',

    /* hydration */
    hydrationAria: 'Hydration',
    hydroTipDefault: 'Water in 20 min',
    hydroTipSoon: 'Water in less than 1 min',
    hydroTipIn: 'Water in {n} min',
    hydroRegistered: '{amount} logged',
    hydroUndoable: ' · you can undo it',
    hydroShells: ' · +{n} shell 🐚',
    hydroShellsPlural: ' · +{n} shells 🐚',
    hydroRemoved: 'Entry removed',
    hydroUndoneLast: 'Last entry undone',
    hydroTankAria: "Today's water. Open the log to undo.",
    hydroTankHint: 'tap<br>to undo',
    aqBtnAria: 'Open aquarium and fish shop',
    aqBtn: 'Aquarium',

    /* tic-tac-toe */
    ggMuteAria: 'Mute game sounds',
    ggUnmuteAria: 'Unmute game sounds',
    ggMuteTitle: 'Mute sounds',
    ggUnmuteTitle: 'Unmute sounds',
    ggTimePrefix: 'Break ends in ',
    ggTitle: 'Gon challenges you',
    ggSub: 'While you rest...<br>try to beat me.',
    ggIntroBubble: 'Fancy a round?',
    ggStartMatch: 'Start Match',
    ggPauseBreak: 'Pause break',
    ggStartBreak: 'Start break',
    ggResumeBreak: 'Resume break',
    ggBoardAria: 'Tic-tac-toe board',
    ggYourTurn: 'Your turn',
    ggGonTurn: "Gon's turn",
    ggThinking: 'Gon is thinking',
    ggPlayAgain: 'Play again',
    ggBackToBreak: 'Back to the break',
    ggScoreYou: 'You',
    ggScoreDraws: 'Draws',
    ggScoreGon: 'Gon',
    ggYouWon: 'You won',
    ggGonWon: 'Gon won',
    ggDraw: 'Draw',
    ggCellEmpty: 'Square {n}, empty',
    ggCellYou: 'Square {n}, you',
    ggCellGon: 'Square {n}, Gon',
    ggEndAria: 'Break over',
    ggEndSub: 'The break is over.<br>Time to get back to focus.',
    ggEndAgain: 'One more match',
    ggEndBack: 'Back to Pomodoro',

    /* day strip */
    dayStripAria: 'Day summary',
    dsFocus: 'Focus',
    dsPomos: 'Pomodoros',
    dsTasks: 'Tasks',
    dsWater: 'Water',
    dsStreak: 'Streak',
    dsDay: '{n} day',
    dsDays: '{n} days',
    closeDay: 'close the day',
    closeDayTitle: 'Close the day',

    /* music */
    musicAria: 'Music',
    musicTitle: 'Music',
    spotifyLogin: 'Log in to Spotify',
    spotifyUrlPlaceholder: 'Paste a Spotify link (playlist, album, track)',
    spotifyLoad: 'Load',
    spotifyPauseAria: 'Pause music',
    spotifyNote: 'With a Spotify session open <b>in this browser</b>, the player streams full tracks. Without login, it plays 30-second previews. Use the controls inside the player itself to play, pause and skip tracks.',
    spotifyBadLink: "That doesn't look like a Spotify link, {name}. Paste the playlist URL.",
    spotifyLoginHint: 'Log in and come back, {name}. The player here picks up the session on its own.',
    ytSearchPlaceholder: 'Search for the song you want to hear',
    ytSearchAria: 'Search music on YouTube',
    ytSearchBtn: 'Search',
    ytMuteAria: 'Mute',
    ytVolumeAria: 'YouTube volume',
    ytStatusIdle: 'Type a song or artist name. Results show up here and play inside the site.',
    ytPlaceholder: 'Search or paste a YouTube link. The video shows up here for you to listen.',
    ytNote: 'Plays the <b>full track for free</b>, with ads, unless you have YouTube Premium logged in <b>in this browser</b>. It also accepts pasted links from <b>youtube.com</b> or <b>music.youtube.com</b>. The volume next to the search controls the real player.',
    ytPlaying: 'Playing: {title}',
    ytPlayingLink: 'Playing the pasted link.',
    ytSearching: 'Searching "{q}"…',
    ytResultsOne: '{n} result for "{q}". Click to play.',
    ytResultsMany: '{n} results for "{q}". Click to play.',
    ytFailed: "The search didn't respond just now. Try again in a moment, or paste a YouTube link straight into the field.",
    ytOpenExternal: 'Open the search on YouTube',

    /* Google Calendar */
    calAria: 'Google Calendar',
    calTitle: 'Google Calendar',
    calConnected: 'Connected',
    calDisconnectedStatus: 'Disconnected',
    calDisconnect: 'Disconnect',
    calIntro: "Connect your Google account to follow this week's events right here, without leaving Gon.",
    calConnect: 'Connect with Google',
    calPrevWeek: 'Previous week',
    calNextWeek: 'Next week',
    calThisWeek: 'This week',
    calThisWeekBtn: 'this week',
    calLoading: 'Loading...',
    calNote: 'Events are read straight from your primary Google calendar (<b>calendar.primary</b>), view only. Access stays in this browser and expires on its own; nothing is stored on a server.',
    calAllDay: 'All day',
    calNoTitle: '(no title)',
    calOpenInGoogle: 'Open in Google Calendar',
    calToday: ' · today',
    calDayEmpty: 'no events',
    calLoadFail: "Couldn't load the events right now. Try again in a moment.",
    calScriptFail: "I couldn't load the Google login right now, {name}. Check your connection and try again.",
    calConnectedSpeak: "Connected with Google, {name}. You can already see this week's events here.",
    calLoginAborted: "The Google login didn't finish, {name}. Feel free to try again.",
    calLoginRefused: 'Google refused the connection, {name}. If it keeps happening, the Client ID may not be set up yet.',
    calNoClientId: "This tab doesn't have a Google Client ID configured yet, {name}. Register a project on Google Cloud and paste the Client ID into the code.",
    calExpired: 'Your Google session expired, {name}. Connect again whenever you like.',

    /* tasks */
    doneTitle: 'Completed',
    doneEmpty: "Your completed tasks for the day show up here.",
    archived: 'Archived · ',
    tasksTitle: 'Tasks',
    taskSearchPlaceholder: 'Search',
    taskSearchAria: 'Search tasks',
    wd0: 'Sun', wd1: 'Mon', wd2: 'Tue', wd3: 'Wed', wd4: 'Thu', wd5: 'Fri', wd6: 'Sat',
    taskInputPlaceholder: 'What do you need to get done today?',
    taskAdd: 'Add',
    taskEmpty: 'No tasks yet. Write the first one and commit to it.',
    taskEmptyFiltered: 'Nothing here with that filter.',
    taskPending: '{n} pending',
    taskPendingPlural: '{n} pending',
    taskAllDone: 'all done',
    taskDragHint: ' · drag to prioritize',
    taskDragAria: 'Drag to prioritize',
    taskCheckDo: 'Complete',
    taskCheckUndo: 'Uncheck completed task',
    taskCheckDoTitle: 'Mark as completed',
    taskCheckUndoTitle: 'Unmark as completed',
    taskEditTitle: 'Click to edit',
    taskMoreAria: 'Task options',
    taskDeleteAria: 'Delete task',
    taskSubCount: '{done}/{total} subtasks',
    taskShowSubs: 'Show subtasks',
    taskPrioTitle: '{name} priority',
    menuPriority: 'Priority',
    menuDate: 'Date',
    menuCategory: 'Category',
    menuCategoryPlaceholder: 'e.g. client, study',
    menuAddSub: 'Add subtask',
    menuDuplicate: 'Duplicate',
    menuArchive: 'Archive',
    menuUnarchive: 'Unarchive',
    menuDelete: 'Delete',
    prioHigh: 'High',
    prioMid: 'Medium',
    prioLow: 'Low',
    prioNone: 'None',
    dateToday: 'Today',
    dateTomorrow: 'Tomorrow',
    dateWeek: 'Week',
    dateNone: 'None',
    subNewPlaceholder: 'New subtask',
    subAdd: '+ subtask',
    subCheckDo: 'Complete subtask',
    subCheckUndo: 'Uncheck subtask',
    subDelete: 'Delete subtask',

    /* name / intro modal */
    nameAria: 'Welcome',
    nameTitle: "What's your name?",
    nameSub: 'That way I know what to call you while you work.',
    namePlaceholder: 'Your name',
    nameSubmit: 'Enter',
    introAria: 'Meet Gon',
    introGreet: 'Hi, {name}!',
    introGreetPlain: 'Hi!',
    introSub: "Nice to meet you, I'm Gon, your focus partner around here. Before we start, I want to tell you my story real quick. Click here:",
    introStoryBtn: "Read Gon's story",

    /* settings */
    settingsAria: 'Settings',
    settingsTitle: 'Settings',
    settingsSub: 'Times in minutes.',
    fieldName: 'Your name',
    fieldLanguage: 'Language',
    fieldPomodoro: 'Pomodoro',
    fieldShort: 'Short break',
    fieldLong: 'Long break',
    fieldWater: 'Water reminder',
    fieldWaterHint: '(interval in min)',
    fieldWaterGoal: 'Daily water goal',
    fieldGoalPomos: 'Pomodoro goal',
    fieldGoalTasks: 'Task goal',
    perDay: '/day',
    fieldAutoFocus: 'Automatic focus mode',
    fieldAutoFocusHint: '(hides distractions during the Pomodoro)',
    on: 'On',
    off: 'Off',
    cancel: 'Cancel',
    save: 'Save',

    /* water modal */
    waterAria: 'Water log',
    waterTitle: "Today's water",
    waterSub: "Logged it wrong? Remove whatever didn't actually happen.",
    waterOf: 'of {n}L',
    waterLogEmpty: 'No entries today. Use the droplet or the buttons above.',
    waterUndoLast: 'Undo last',
    close: 'Close',
    waterLatest: 'latest',
    waterRemoveAria: 'Remove the {amount} entry',

    /* aquarium */
    aqAria: 'Aquarium',
    aqTitle: "Gon's Aquarium",
    aqCoinsTitle: 'Shells: earn them by drinking water',
    aqShells: ' shells',
    aqSub: 'Drink water to earn shells (1 shell per 250&nbsp;ml). Adopt up to <b>5 little fish</b>, but be careful: without water the tank dries out and they get sick. Keep the tank full and they live happily.',
    aqMineLabel: 'Your fish ',
    aqEmpty: 'No fish yet. Adopt one below 🐟',
    aqShopLabel: 'Shop',
    aqRelease: 'release',
    aqAdopt: 'Adopt',
    aqFull: 'Tank is full',
    aqNeed: '{n} 🐚 short',
    aqTankLimit: 'The tank only fits {n} fish',
    aqNoCoins: 'Not enough shells, drink more water 🐚',
    aqReleased: 'Fish released back into the river 🌊',
    aqDied1: "A little fish didn't survive the drought 🥀",
    aqDiedN: "{n} fish didn't survive 🥀",
    aqHp1: 'Happy and healthy',
    aqHp2: 'Cruising along',
    aqHp3: 'Thirsty, drink some water',
    aqHp4: 'Sick! Fill the tank',
    aqHp5: 'Almost gone, water now!',

    /* dashboard */
    panelAria: 'Dashboard: stats, calendar and achievements',
    panelTitle: 'Dashboard',
    panelCloseAria: 'Close dashboard',
    level: 'Level {n}',
    tabStats: 'Stats',
    tabCal: 'Calendar',
    tabAch: 'Achievements',
    tabRec: 'Records',
    tabRot: 'Routines',
    tabAi: 'Plan',
    tabAbout: 'About',
    rangeToday: 'Today',
    rangeWeek: 'Week',
    rangeMonth: 'Month',
    rangeYear: 'Year',
    chartFocusByDay: 'Focus per day',
    chartFocusByMonth: 'Focus per month',
    chartByHour: 'Productivity by hour',
    chartEmpty: 'No records in this period yet.',
    chartAria: 'Bar chart',
    statFocusTime: 'Focused time',
    statPomos: 'Pomodoros',
    statTasks: 'Tasks',
    statWater: 'Water',
    statStreak: 'Streak',
    statStreakUnit: 'days',
    statAvgFocus: 'Average focus',
    statAvgFocusUnit: '/active day',
    statActiveDays: 'Active days',
    statActiveDaysOf: 'of {n}',

    /* heatmap */
    heatTitle: 'Last 26 weeks',
    heatLess: 'less ',
    heatMore: ' more',
    heatHint: 'Click a day to see the details.',
    heatNoRecords: '<b>{date}</b>: no records.',
    heatDetail: '<b>{date}</b>: focus <b>{focus}</b> · <b>{p}</b> {pLabel} · <b>{t}</b> {tLabel} · <b>{w}</b> of water{closed}',
    heatClosed: ' · day closed',
    heatPomo1: 'Pomodoro',
    heatPomoN: 'Pomodoros',
    heatTask1: 'task',
    heatTaskN: 'tasks',

    /* records */
    recBestStreak: 'Longest streak',
    recDays: 'days',
    recBestFocusDay: 'Most focused time in a day',
    recMostPomos: 'Most Pomodoros in a day',
    recMostTasks: 'Most tasks in a day',
    recTotalFocus: 'Total focus',
    recTotalApp: 'Total time on the platform',

    /* routines */
    rotDesc: 'Routines apply times, tasks and the water goal all at once.',
    rotEmpty: 'No routines yet. Create the first one: Work, Study, Morning, Night.',
    rotNew: 'New routine',
    rotName: 'Name',
    rotNamePlaceholder: 'Work, Study, Morning...',
    rotPomos: 'Pomodoros',
    rotFocus: 'Focus',
    rotBreak: 'Break',
    rotWater: 'Water',
    rotTasksLabel: 'Tasks',
    rotTasksHint: '(one per line)',
    rotTasksPlaceholder: "Edit the client's video\nAnswer emails",
    rotSave: 'Save routine',
    rotActivate: 'Activate',
    rotDeleteAria: 'Delete routine',
    rotMetaBreak: ' · break ',
    rotTask1: ' task',
    rotTaskN: ' tasks',
    rotApplied: 'Routine "{name}" is on, {user}. {pomos} Pomodoros of {focus} minutes.',
    unitMin: 'min',
    unitL: 'L',

    /* plan */
    aiDesc: 'Describe what you need to do and the organizer builds the focus blocks, breaks and tasks for the day.',
    aiPlaceholder: 'Today I need to finish my project, study and answer emails.',
    aiRun: 'Organize',
    aiWorking: 'Organizing your day…',
    aiFail: "I couldn't understand that. List what you need to do, separated by commas.",
    aiPlanTitle: 'Suggested plan',
    aiDiscard: 'Discard',
    aiApply: 'Apply to the day',
    planFocus: 'focus',
    planBreak: 'break',
    planLongBreak: 'Long break',
    planBreakLabel: 'Break',
    planAddedOne: ' ({n} new task.)',
    planAddedMany: ' ({n} new tasks.)',
    aiPrompt: 'You are Gon\'s day planner, a focus and productivity assistant that organizes the person\'s day following the Pomodoro methodology (blocks of {pomo}min of focus, {short}min breaks, a {long}min long break every 4 blocks). It is now {now}. The person described the day like this: "{text}".\n\nWhen building the plan, prioritize the methodology — the consistent focus/break rhythm — over goals or milestones to hit:\n- Open the day with a quick or simple task, just to settle into the focus/break rhythm, not as an achievement to unlock.\n- Order the remaining tasks by priority and mental effort, avoiding two very demanding tasks back to back, to keep the process sustainable and protect attention.\n- If a task seems vague or too big, break it into smaller steps within the block structure, keeping the focus on the work process, not on hitting a result.\n- Use direct, warm language in the labels, avoiding words like "goal", "achievement", or "win".\n\nReply ONLY with valid JSON, no markdown, comments, or text outside the JSON, in this exact format: {"tasks":["..."],"blocks":[{"time":"HH:MM–HH:MM","label":"...","type":"foco|pausa"}]}. Short, objective tasks in English. No more than 12 blocks.',

    /* summary */
    sumAria: 'Session summary',
    sumTitle: 'Day summary',
    sumBack: 'Back',
    sumConfirm: 'Close the day',
    sumGoalPomos: 'Pomodoros: {a} of {b}',
    sumGoalTasks: 'Tasks: {a} of {b}',
    sumGoalWater: 'Water: {a} of {b}L',
    sumAlreadyClosed: 'This day is already closed. The numbers keep counting.',
    sumMsg3: 'Full day. All three goals hit. That is consistency.',
    sumMsg2: 'Two out of three. Solid day.',
    sumMsg1: 'One goal hit. Tomorrow you can go higher.',
    sumMsgFocus: 'There was focus today. Logged.',
    sumMsgBlank: 'Blank day. Tomorrow the page turns.',

    /* notifications */
    notifFreeStart: 'Open session started',
    notifFreeStartBody: "I'm counting the time now, {name}.",
    notifPomoStart: 'Pomodoro started',
    notifPomoStartBody: 'Focus on, {name}. {min} min on the clock.',
    notifShortStart: 'Short break started',
    notifShortStartBody: 'Breathe a little, {name}. {min} min.',
    notifLongStart: 'Long break started',
    notifLongStartBody: 'Well-earned rest, {name}. {min} min.',
    notifChronoStart: 'Stopwatch started',
    notifChronoStartBody: 'Counting the time, {name}.',
    notifCountdownDone: 'Countdown finished',
    notifCountdownDoneBody: 'Time is up, {name}.',
    notifPomoDone: 'Pomodoro completed',
    notifPomoDoneBody: 'Nice, {name}. Break time.',
    notifBreakDone: 'Break is over',
    notifBreakDoneBody: 'Back to focus, {name}.',
    notifFreeDone: 'Open session finished',
    notifFreeDoneBody: 'Duration: {dur}, {name}.',
    notifSessionEnd: 'Session ended',
    notifSessionEndBody: 'You wrapped up before the end, {name}.',
    notifWater: 'Water time',
    notifWaterBody: 'A glass now, {name}.',

    /* contextual lines */
    speakTaskStart: 'Let\'s go, {name}: "{task}"',
    speakFreeLogged: 'A {dur} session is logged, {name}. All in the chart.',
    fireplaceMute: 'Mute fireplace sound',
    fireplaceUnmute: 'Unmute fireplace sound',
    fireplaceTitle: 'Fireplace sound',

    /* about */
    aboutLoreTitle: "Gon's story",
    aboutLoreTag: 'Legend',
    aboutLore1: 'Before there was any task, any timer or any goal, there was only a dot of orange light pulsing alone, with no mission, no ally, no reason to stay lit. It was only the instant the first pomodoro came to an end that this spark took shape: legs, eyes and a name. <b>Gon</b> was not born from a lightning bolt or an ancient prophecy. He was born from 25 minutes of focus, the first of many still to come.',
    aboutLore2: 'Ever since, Gon has sealed a simple pact with whoever opens the app: <b>"I take care of the time, you take care of using it well."</b> With every task completed, every liter of water logged, every streak kept alive, he grows a little stronger, and your XP rises right along with his. The greatest opponent of this journey never had an official name. You might know it as procrastination, putting things off, that extra tab opened for no reason. Gon does not win that battle for you, but he stays by your side while you fight, and celebrates with you when you win.',
    aboutLore3: 'This story has no set ending. Every day you open the app is a new chapter, every level you climb is a page turned. Gon asks for only one thing: that you come back tomorrow to keep writing.',
    aboutFireCaption: 'End of chapter · keep reading',
    aboutGoalTitle: 'What the app is for',
    aboutGoal1: 'This app exists to help you <b>structure your work or study time</b> into real focus blocks and real breaks, keep track of tasks, stay hydrated and see, with simple data, where your productivity actually happens.',
    aboutGoal2: 'The idea is not to police you, it is to give your day a shape: a timer that respects the Pomodoro method, a dashboard that keeps your history and progress, and a visual companion that reacts to what you do, so that staying focused feels less like an act of willpower and more like a habit built little by little.',
    aboutRulesTitle: 'What each thing means',
    ruleCountdown: 'Countdown',
    ruleCountdownD: 'A timer with a set duration (e.g. 25min of focus). It counts down to zero and tells you when the block is over.',
    ruleFree: 'Open session',
    ruleFreeD: 'A timer that only counts up, with no target time. Ideal when you do not want to be tied to a fixed number of minutes.',
    rulePomo: 'Pomodoro',
    rulePomoD: 'A focus technique using short blocks (usually 25min) alternated with breaks. Each completed block counts as 1 pomodoro in your day.',
    ruleFocusTime: 'Focused time',
    ruleFocusTimeD: 'The sum of every minute the timer actually ran, breaks not included.',
    ruleTasks: 'Tasks',
    ruleTasksD: "Your to-do list for the day. Checking one off adds XP and shows up in your day summary.",
    ruleWater: 'Water',
    ruleWaterD: 'Your daily hydration goal, measured in liters (e.g. 0L/2L). Logging water also feeds your stats.',
    ruleStreak: 'Streak',
    ruleStreakD: 'The number of consecutive days you hit at least one goal for the day. Missing a day resets the count.',
    ruleLevel: 'Level &amp; XP',
    ruleLevelD: 'Every pomodoro, completed task and goal hit earns XP. Once you gather enough XP, you level up.',
    ruleAch: 'Achievements',
    ruleAchD: 'Special milestones you unlock by reaching certain behaviors (e.g. first full week, first 7-day streak).',
    ruleRec: 'Records',
    ruleRecD: 'Your all-time best numbers: longest streak, most focused day, most pomodoros in a single day, and more.',
    ruleCal: 'Calendar',
    ruleCalD: 'A heatmap of the last few weeks. The darker the day, the more focus time you had in it.',
    ruleRot: 'Routines',
    ruleRotD: 'Saved templates that apply, in one go, a set of pomodoros, focus/break times, water goal and tasks.',
    rulePlan: 'Plan',
    rulePlanD: 'Describe what you need to do in free text and the app builds a suggestion of focus blocks, breaks and tasks for your day.',
    ruleFocusMode: 'Focus mode',
    ruleFocusModeD: 'A leaner screen mode that hides visual distractions while the timer is running.',
    aboutTipsTitle: 'How to get the most out of it',
    tip1: 'Start the day by defining your tasks before hitting play on the timer, that way Gon knows what the two of you are chasing.',
    tip2: 'Prefer the Countdown with 25min blocks for tasks that demand high concentration, and the Open session for looser or creative work.',
    tip3: 'Respect the breaks. They count as much as the focus for your balance, and that is when Gon rests too.',
    tip4: 'Log water throughout the day, not all at once at the end. That keeps your hourly stats closer to reality.',
    tip5: 'Create routines for your most common contexts (Work, Study, Morning) so you can start the day in a few seconds.',
    tip6: 'Use Plan when you do not know where to start: describe what you need to do and adjust the suggested plan before applying it.',
    tip7: 'Close the day through the summary, even on weak days. That is what keeps your streak and your history complete in the Calendar.',
    aboutFoot: 'Made for people who work and study alone, but do not have to feel alone doing it.',
    aboutCreditsLabel: 'Developed by'
  },

  /* achievements */
  ACH: {
    first_task:       { title: 'First task',       desc: 'Wrote the first task.' },
    first_pomo:       { title: 'First Pomodoro',   desc: 'Completed the first focus cycle.' },
    pomos_10:         { title: 'Ten cycles',       desc: '10 Pomodoros completed.' },
    pomos_100:        { title: 'A hundred cycles', desc: '100 Pomodoros completed.' },
    tasks_100:        { title: 'A hundred done',   desc: '100 tasks completed.' },
    streak_7:         { title: 'One week',         desc: '7 consecutive days with focus.' },
    streak_30:        { title: 'A whole month',    desc: '30 consecutive days with focus.' },
    focus_10h:        { title: 'Ten hours',        desc: '10 hours of focus accumulated.' },
    focus_100h:       { title: 'A hundred hours',  desc: '100 hours of focus accumulated.' },
    water_goal_7:     { title: 'Well hydrated',    desc: 'Water goal hit on 7 days.' },
    day_closed_first: { title: 'Day closed',       desc: 'Closed the first day with a summary.' },
    routine_first:    { title: 'Own method',       desc: 'Created the first routine.' }
  },

  /* fish */
  FISH: {
    guppy:  { name: 'Guppy',  rarity: 'common' },
    tetra:  { name: 'Tetra',  rarity: 'common' },
    goldie: { name: 'Goldie', rarity: 'uncommon' },
    betta:  { name: 'Betta',  rarity: 'rare' },
    koi:    { name: 'Koi',    rarity: 'legendary' }
  },
  FISH_MSG: {
    died: ['{name}, the water ran out and a little fish is gone. Fill the tank.', 'The tank dried up and I lost a friend, {name}. Drink some water!'],
    adopted: ['{name}, a new {sp} in the tank! Keep the water topped up.', 'Welcome to the tank, little {sp}! Do not let the water run out, {name}.']
  },

  /* tic-tac-toe lines */
  PHRASES: {
    gonWin: [
      'I told you it would be hard.', 'Good try.', 'Close.', 'One more?',
      'You are getting better.', 'Not this time.', 'Keep trying.',
      'Checkmate, well, almost that.', 'I knew that one by heart.', 'Relax, it is only a game.',
      'Focus on the next break.', 'Next time, maybe.'
    ],
    draw: [
      'Interesting.', 'A draw is a strategy too.', 'We are evenly matched.',
      'You escaped that one.', 'Nobody gave in today.', 'A fair draw.',
      'Good game, no winner.', 'Shall we go again?'
    ],
    userWin: [
      'Impressive.', 'Very well done.', 'I want a rematch.', 'Now it got interesting.',
      'You really pulled it off.', 'Okay, that one was yours.', 'Do not get used to it.',
      'Well played, seriously.'
    ]
  },

  /* Gon's lines */
  MSG: {
    intro: [
      "Nice to meet you, {name}. I am Gon, your focus partner. You work, I handle the rest.",
      "{name}, I am Gon. My job is simple: make your day pay off. Yours is to hit Start.",
      "Gon here, {name}. I count the time, remember the water and ask for results. Deal?",
      "The name is Gon, {name}. Think of me as a business partner: I do nothing, but I demand everything.",
      "I was born from a completed pomodoro, {name}. Ever since, that is the pact: I take care of the time, you take care of using it well.",
      "{name}, I am just a spark that grew legs. But a lit spark sticks around to the end. Shall we?"
    ],
    greetingMadrugada: [
      "{name}, up in the middle of the night? Then let it be productive.",
      "Everyone is asleep and here you are, {name}. Silence is a competitive advantage.",
      "{name}, no notifications at this hour. It is the best focus there is.",
      "Late night, {name}. Another block if you're up for it, or sleep. Either one is fine.",
      "3 a.m. is the hour of geniuses or stubborn people, {name}. Show me which one."
    ],
    greetingManha: [
      "Good morning, {name}. A rested brain is your best equipment. Use it now.",
      "Morning, {name}. The first task of the day sets the tone for the rest. Choose well.",
      "{name}, coffee in hand? Then let's open today's scoreboard.",
      "Good morning, {name}. The whole day ahead of you. That is rare, make the most of it.",
      "You are up, {name}. While the competition scrolls the feed, we focus."
    ],
    greetingTarde: [
      "Good afternoon, {name}. Half the day is gone, the other half is still yours.",
      "{name}, the afternoon is where good days separate from average ones. Shall we?",
      "Afternoon, {name}. Digestion is no excuse: one Pomodoro cures the sluggishness.",
      "{name}, whatever you left for after lunch has arrived. It is now.",
      "Good afternoon, {name}. People who close the afternoon well sleep better. Proven."
    ],
    greetingNoite: [
      "Good evening, {name}. Last window of the day. Let's close it in the black.",
      "{name}, night session. Fewer distractions, more delivered.",
      "Evening, {name}. One good session now and tomorrow you wake up ahead.",
      "{name}, the day is not over yet. One focus block and we wrap it up nicely.",
      "Good evening, {name}. Produce now, rest later, in that order."
    ],
    greeting: [
      "You are back, {name}. Shall we make today worth it?",
      "Hey, {name}! Ready to start?",
      "{name}, what are you going to unlock today?",
      "Another chapter, {name}. Today's one is on you."
    ],
    idle: [
      "{name}, what are you waiting for? Hit Start.",
      "The button will not press itself, {name}.",
      "{name}, every idle minute is a minute that does not come back.",
      "Write a task down there, {name}, and commit to it.",
      "{name}, deciding fast is productivity too. Pick a task and go.",
      "I am pacing around here and you are standing still, {name}. One of us is wrong.",
      "{name}, today's scoreboard is still at zero. Let's change that.",
      "A spark standing still warms nobody, {name}. Let's go."
    ],
    idleMadrugada: [
      "{name}, if you came here at this hour, it was not to stare at the screen.",
      "Late nights pay off, {name}, but only for whoever starts.",
      "No sleep and no focus is the worst of both worlds, {name}. Fix one of them.",
      "{name}, even the spark is awake. Make it count."
    ],
    idleManha: [
      "The morning is your most expensive hour, {name}. Do not spend it idle.",
      "{name}, start now and by 10 a.m. you are already ahead.",
      "The first Pomodoro of the day is the hardest, {name}. After that it glides."
    ],
    idleTarde: [
      "{name}, the afternoon goes fast. Blink and you lose it.",
      "Post-lunch drowsiness is cured with focus, {name}. Try it.",
      "{name}, you can still turn the day around. But only if you start now."
    ],
    idleNoite: [
      "{name}, the sooner you start, the sooner you finish. Simple math.",
      "One session now, {name}, and you close the day in peace.",
      "{name}, the night is short. Focus on the essentials and close the day."
    ],
    startFocus: [
      "Let's go, {name}! Full focus.",
      "Close the other tabs, {name}. All of them.",
      "Less scrolling, more delivering, {name}.",
      "{name}, it is this and nothing else now.",
      "Clock is running, {name}. No excuses now.",
      "Deep mode on, {name}. I will hold the fort out here.",
      "{name}, 25 well-used minutes beat 2 hours of stalling. Prove it.",
      "Spark is lit, {name}. As long as it burns, I will not look away.",
      "It started, {name}. That is how the pact works: I count, you deliver."
    ],
    startBreak: [
      "Now I lie down and you rest, {name}.",
      "Well-earned break, {name}. Relax for real.",
      "{name}, get out of the chair and stretch. Gon's orders.",
      "Breaks are part of the method, {name}. Resting is working too."
    ],
    chronoStart: [
      "Stopwatch running, {name}. The time is being measured now.",
      "Counting, {name}. What gets measured, improves.",
      "Clock is open, {name}. Show me your pace.",
      "Marked, {name}. This chapter starts now."
    ],
    chronoDone: [
      "Time is up, {name}. Down to the second.",
      "Countdown over, {name}. Mission given, mission accomplished?",
      "Zero on the clock, {name}. I hope the result is there."
    ],
    sessionFinished: [
      "Session ended, {name}. Whatever was focused, counted.",
      "You wrapped up early, {name}. That is fine, honest minutes are worth more than a full timer.",
      "Logged, {name}. Better a short, real session than a long, fake one.",
      "{name}, I saved that session. Every focused hour goes into the tally."
    ],
    nudgeFocus: [
      "Still there, {name}?",
      "Every minute counts, {name}.",
      "Almost there, {name}, do not stall now.",
      "Instagram can wait, {name}. This cannot.",
      "If you are stuck, break it into smaller parts, {name}. Works every time.",
      "Breathe, {name}, and keep going. There is less left than it seems.",
      "{name}, the focus of now is the result of later.",
      "Hold on a bit longer, {name}. The spark holds out if you do."
    ],
    nudgeBreak: [
      "Enjoy the break, {name}, it is short.",
      "Really relax, {name}, no guilt. It is part of the system.",
      "Away from the screen, {name}. A break spent on your phone is not a break."
    ],
    paused: [
      "Paused, {name}? Fine, just do not stretch it.",
      "A quick breather, {name}. Come back soon.",
      "Pause logged, {name}. The clock is waiting for you, so am I."
    ],
    pomodoroDone: [
      "Congrats, {name}! Session closed.",
      "Nice, {name}! Another one in the bag.",
      "Done, {name}! You are more disciplined than you think.",
      "Session in the bag, {name}. Keep the game going.",
      "{name}, another brick in the wall. Build.",
      "That goes straight into your chart, {name}. I write everything down.",
      "Full cycle, {name}. Efficiency is not luck, it is repetition.",
      "I felt that, {name}. Every pomodoro of yours makes me a bit stronger too.",
      "{name}, that is how I was born: one focus block at a time. Keep building."
    ],
    milestone: [
      "STREAK, {name}! You are on another level.",
      "{name}, this is a marathon, not luck. Keep going.",
      "What a run, {name}! Do not lose the rhythm now.",
      "Absurd streak, {name}. The numbers do not lie.",
      "{name}, that flame does not go out easily. Keep feeding it."
    ],
    breakDone: [
      "Break is over, {name}. On to the next one.",
      "Recharged, {name}? Back to work.",
      "End of the break, {name}. Rhythm is your friend, do not let it go.",
      "{name}, spark relit. On to the next block."
    ],
    focusMilestone: [
      "You are building a good rhythm, {name}.",
      "Keep going, one step at a time.",
      "Every minute of focus counts.",
      "Great work, {name}. Keep that pace.",
      "You are making progress.",
      "Take a deep breath and keep going.",
      "Consistency makes the difference, {name}."
    ],
    companionStudy: [
      "While you were working over there, I studied over here. Partnership, {name}.",
      "Welcome back, {name}. I took the chance to study a bit too.",
      "We keep going together, {name}: you on your work, me in my books.",
      "Back, {name}? The clock kept counting properly over here.",
      "Each of us on our own task and the block paying off. That is how it works, {name}."
    ],
    listening: [
      "Headphones on, {name}! Now we are talking: back to focus and get much more done.",
      "Music on, {name}. Now we get even more productive. Back to the pomodoro.",
      "I grabbed my headphones too, {name}. Focus with a soundtrack pays double.",
      "{name}, music is rolling. No excuses now: back to what matters and produce more.",
      "Soundtrack on, {name}. Every spark likes a good rhythm."
    ],
    water: [
      "Water time, {name}. A glass now, I will wait.",
      "{name}, 30-second break: hydrate. I am already drinking mine.",
      "Water, {name}. A dry brain does not edit video.",
      "Hydration, {name}. 2% dehydration already drops your focus. That is science."
    ],
    waterGoal: [
      "Water goal hit, {name}! Hydration on track.",
      "{name}, you hit the goal glass. Your body says thanks.",
      "There you go, {name}. Water goal met, and it earned XP too."
    ],
    waterUndone: [
      "Corrected, {name}. Only what you actually drank counts.",
      "Entry removed, {name}. An honest number beats a pretty one.",
      "Undone, {name}. Clean data, clean conscience."
    ],
    grabbed: [
      "Hey! Put me down, {name}.",
      "Seriously, {name}? Put me back on the floor.",
      "Help! Kidnapping in broad daylight.",
      "{name}, I am not a toy. I am a consultant.",
      "Careful, I am made of pixels, not rubber.",
      "Let the spark go, {name}, it barely fits in your hand."
    ],
    dropped: [
      "Come on, are you kidding me? Back to focus, {name}.",
      "You threw me on the floor to escape work, {name}. Get back.",
      "That hurt. And I do not even have bones. Let's focus, {name}.",
      "Very funny, {name}. Now hit Start.",
      "If you have time to throw me around, you have time for the task, {name}.",
      "{name}, a spark on the floor lights nobody. Get us both up."
    ],
    droppedWorking: [
      "Are you kidding me, {name}? The timer is running. Back to focus!",
      "You paused your life to drag me around? Back to work, {name}.",
      "The clock does not stop for you to play, {name}. Focus."
    ],
    hit: [
      "Ouch! Why did you do that, {name}?",
      "Hey! Hitting me does not cross anything off your list, {name}.",
      "That hurts, {name}. A little, but it hurts.",
      "You hit your own consultant. Congratulations, {name}.",
      "I am on your side, {name}. Literally.",
      "{name}, a spark does not hit back. But it remembers."
    ],
    hitAngry: [
      "STOP, {name}! I am here to help you.",
      "Enough, {name}. Hit the task, not Gon.",
      "If all that energy went into the Pomodoro, {name}, you would already be done.",
      "Last time, {name}. After this I tell your client."
    ],
    panic: [
      "OW! Get away, {name}!",
      "Help! He is being violent!",
      "Noooo! Stay away from me, {name}!",
      "Run, run, run!",
      "A spark in panic, {name}! That was not in the legend!"
    ],
    panicAngry: [
      "HELP! {name} has lost it!",
      "Run! Back to focus, {name}, and leave me alone!",
      "I do not get paid enough for this, {name}!",
      "This is harassment, {name}! HARASSMENT!"
    ],
    drown1: [
      "Hey! Not the water, {name}!",
      "Whoa whoa whoa, get me out of here!",
      "{name}, I am a FLAME! This will put me out!"
    ],
    drown2: [
      "Glub... glub...",
      "I cannot swim, {name}...",
      "Blub. Blub. {name}, stop."
    ],
    drownHelp: [
      "HELP! I am made of pixels, I cannot swim!",
      "HEEEELP! {name}, get me out of the water!",
      "HELP ME, {name}! I am sinking!"
    ],
    drownEscape: [
      "Cough, cough... that was close, {name}.",
      "Close, {name}. Very close.",
      "Never do that again."
    ],
    drownRage: [
      "You almost DROWNED me, {name}! Back to focus!",
      "If you had focus, you would not be playing with me. GET BACK TO WORK!",
      "I almost died and your task is still sitting there, {name}. Get back.",
      "You do not have enough focus to do what you promised, {name}. BACK. NOW.",
      "Nobody delivers anything by drowning their own robot, {name}. Focus!",
      "I am literally a spark, {name}! Water and I do NOT mix!"
    ],
    taskAdded: [
      "Noted, {name}. Now deliver.",
      "On the list, {name}.",
      "Nice, {name}. Commitment logged.",
      "Written is a contract, {name}. I witnessed it.",
      "One more in the queue, {name}. Gon's tip: start with the most boring one.",
      "{name}, another mission in today's chapter."
    ],
    taskDone: [
      "Crossed another one off, {name}. Nice.",
      "One less on the list, {name}.",
      "That is what I like, {name}.",
      "Done, {name}. XP in the bag, chart going up.",
      "You executed, {name}. Talking is easy, you did it.",
      "{name}, another piece of today's mission solved."
    ],
    allDone: [
      "List is clean, {name}. Day won.",
      "{name}, you zeroed the tasks. Respect.",
      "All done, {name}. That deserves a line in the day summary."
    ],
    taskDeleted: [
      "Deleted, {name}. Less weight on the list.",
      "Off the list, {name}. Cutting is deciding too.",
      "Removed, {name}. Lean list, lean mind."
    ],
    taskArchived: [
      "Archived, {name}. Out of sight, not out of memory.",
      "Put away, {name}. Today is not its day.",
      "In the archive, {name}. Focus on what is for now."
    ],
    taskDuplicated: [
      "Duplicated, {name}. Batch work, I like that.",
      "Copy ready, {name}. Efficiency is not retyping.",
      "Cloned, {name}. Two birds, one task."
    ],
    prioHigh: [
      "High priority, {name}. So it goes first, no queue jumping.",
      "Marked as high, {name}. The important ahead of the fake urgent.",
      "High priority, {name}. Now treat it like one."
    ],
    dueSet: [
      "Date set, {name}. A deadline given is a deadline chased.",
      "Scheduled, {name}. I do not forget, it is part of the service.",
      "On the calendar, {name}. A deal made costs nothing."
    ],
    subtaskAdded: [
      "Subtask noted, {name}. Splitting is the fastest way to finish.",
      "You broke it into parts, {name}. Smart move.",
      "Step logged, {name}. A big task is just several small ones."
    ],
    skipBreak: [
      "Straight into the next one, {name}? I like the hunger. Let's go.",
      "No break then, {name}. Focus again.",
      "You skipped the break, {name}. Just do not make it a habit, rest pays off too."
    ],
    wake: [
      "Oh, I am awake. Shall we, {name}?",
      "I was just resting the pixels, {name}.",
      "Did I doze off? Gon never dozes off. I was... processing.",
      "Spark lit again, {name}. Where were we?"
    ],
    lockedTab: [
      "Pause the Pomodoro before switching, {name}.",
      "Finish or pause first, {name}. Then switch.",
      "Focus is running, {name}. Pause to change mode."
    ],
    levelUp: [
      "Level {lvl}, {name}. Consistency paying off.",
      "Up to level {lvl}, {name}. You cannot buy this, you accumulate it.",
      "Level {lvl} unlocked, {name}. The data shows progress.",
      "{name}, level {lvl}. Quiet, consistent, effective. My kind of thing.",
      "Level {lvl}, {name}. We agreed I get stronger with your effort, and look at us.",
      "{name}, page turned: level {lvl}. This story only grows."
    ],
    achUnlock: [
      "Achievement: {ach}, {name}. Logged in the dashboard.",
      "{name}, you unlocked \"{ach}\". I saw it all, and wrote it down.",
      "New achievement, {name}: {ach}. Earned, not raffled.",
      "\"{ach}\" is yours, {name}. The dashboard keeps the date.",
      "{name}, \"{ach}\" joins your story. There are quite a few good chapters now."
    ],
    dayClosed: [
      "Day closed, {name}. Tomorrow picks up where you left off.",
      "Closed, {name}. What is behind stays behind. What matters comes tomorrow.",
      "Day archived, {name}. Numbers saved, conscience clear.",
      "Today's chapter is closed, {name}. Tomorrow we write the next one."
    ],
    dayClosedNight: [
      "Day closed, {name}. Now really switch off, rest is part of the method.",
      "You closed the day, {name}. Sleep well: the charts will wait for you tomorrow.",
      "Closed, {name}. Screen off, head too. Good night.",
      "{name}, another chapter finished. Rest, the story continues tomorrow."
    ],
    planApplied: [
      "Day organized, {name}. Plan on the list, now execute.",
      "Blocks are set, {name}. Planning took 1 minute, see how it pays off?",
      "Plan applied, {name}. Think before doing: Gon's signature."
    ],
    settingsSaved: [
      "Settings saved, {name}. System tuned your way.",
      "Adjustments recorded, {name}. A good tool is a calibrated tool.",
      "Saved, {name}. Now the method is tailor-made.",
      "{name}, pact updated. Still stands, just your way."
    ],
    nameChanged: [
      "Nice to meet you like this, {name}. From now on that is what I will call you.",
      "Noted, {name}. New name, same commitment.",
      "Deal, {name}. I will call you that from here on."
    ],
    langChanged: [
      "Language switched, {name}. This is how we understand each other now.",
      "Done, {name}. Same spark, different tongue.",
      "There you go, {name}. Only the language changed, the pact is the same."
    ],
    panelOpen: [
      "Numbers on the table, {name}. No guessing here.",
      "Your dashboard, {name}. What gets measured, improves. Gon's word.",
      "Data open, {name}. This is where discipline becomes a chart.",
      "{name}, this dashboard is your part of the story. Mine is over in About."
    ],
    batteryLow: [
      "{name}, the battery is low. Find an outlet before the focus gets interrupted by me.",
      "Hey, {name}, your battery dropped hard. Do not let the device die mid-session.",
      "{name}, critical battery. A charger now saves what you have already built today.",
      "Heads up, {name}: low battery. Charge it soon, or I am the one who stops.",
      "Not even a spark survives without energy, {name}. Charge that device."
    ]
  }
});

GonI18n.boot();
