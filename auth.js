/* ================================================================
   GON — Auth & Cloud Sync
   Firebase Authentication (Google Sign-In) + Cloud Firestore
   ================================================================
   Como funciona:
   • GonAuth.init()       — inicializa Firebase, tenta restaurar sessão
   • GonAuth.onReady(fn)  — fn(user) chamada quando auth estiver pronta
   • GonAuth.saveDB(db)   — salva o objeto DB do app na nuvem
   • GonAuth.loadDB()     — retorna Promise<db|null> com dados da nuvem
   • GonAuth.signOut()    — desloga e recarrega
   ================================================================ */

(function(){
  'use strict';

  /* ---- configuração do projeto Firebase ----
     Substitua pelos valores do seu projeto no console.firebase.google.com */
  var FIREBASE_CONFIG = {
    apiKey:            "AIzaSyDX9AzzxLpr9QsvArO1F_KTPVCsd40cEMg",
    authDomain:        "appgon-ffb2a.firebaseapp.com",
    projectId:         "appgon-ffb2a",
    storageBucket:     "appgon-ffb2a.firebasestorage.app",
    messagingSenderId: "755042358247",
    appId:             "1:755042358247:web:e34b96b675d33b1a7d2342"
  };

  /* nome do documento no Firestore onde cada usuário guarda seus dados */
  var DOC_NAME = 'state';
  var COLLECTION = 'users';

  /* ---- estado interno ---- */
  var _app = null;
  var _auth = null;
  var _db = null;
  var _user = null;           // firebase User ou null
  var _ready = false;
  var _readyCallbacks = [];
  var _saveDebounce = null;
  var _pendingDB = null;      // DB salvo antes do auth estar pronto

  /* ---- helpers ---- */
  function docRef(){
    if (!_db || !_user) return null;
    return _db.collection(COLLECTION).doc(_user.uid).collection('data').doc(DOC_NAME);
  }

  function fireAndForget(promise){
    if (promise && typeof promise.catch === 'function'){
      promise.catch(function(e){ console.warn('[GonAuth] save error', e); });
    }
  }

  function notifyReady(){
    _ready = true;
    var cbs = _readyCallbacks.slice();
    _readyCallbacks = [];
    cbs.forEach(function(fn){ try{ fn(_user); }catch(e){} });
    /* se havia um save pendente enquanto o auth não estava pronto, executa agora */
    if (_pendingDB && _user){
      GonAuth.saveDB(_pendingDB);
      _pendingDB = null;
    }
  }

  /* ---- inicialização ---- */
  function init(){
    /* Firebase já foi carregado pelos scripts no index.html */
    if (typeof firebase === 'undefined'){
      console.error('[GonAuth] Firebase SDK não encontrado. Verifique os scripts no index.html.');
      notifyReady(); /* não trava o app */
      return;
    }

    /* inicializa o app (evita duplicação em hot-reloads) */
    if (!firebase.apps.length){
      _app = firebase.initializeApp(FIREBASE_CONFIG);
    } else {
      _app = firebase.apps[0];
    }

    _auth = firebase.auth();
    _db   = firebase.firestore();

    /* tenta usar cache offline para funcionar sem internet */
    _db.enablePersistence({ synchronizeTabs: true }).catch(function(){});

    /* captura resultado de um redirect de login anterior (se houver) */
    _auth.getRedirectResult().catch(function(err){
      console.error('[GonAuth] redirect result error', err);
      /* mostra mensagem de erro na tela de login */
      var statusEl = document.getElementById('loginStatusText');
      var loginBtn = document.getElementById('loginGoogleBtn');
      if (statusEl) statusEl.textContent = 'Erro ao fazer login. Tente novamente.';
      if (loginBtn) { loginBtn.disabled = false; loginBtn.style.opacity = '1'; }
    });

    /* ouve mudanças de estado de autenticação */
    _auth.onAuthStateChanged(function(user){
      _user = user;
      notifyReady();
    });
  }

  /* ---- salvar na nuvem (debounce de 2s para não sobrecarregar) ---- */
  function saveDB(dbObj){
    if (!_user){
      /* ainda não autenticado: guarda para executar quando estiver pronto */
      _pendingDB = dbObj;
      return;
    }
    var ref = docRef();
    if (!ref) return;

    if (_saveDebounce) clearTimeout(_saveDebounce);
    _saveDebounce = setTimeout(function(){
      _saveDebounce = null;
      fireAndForget(
        ref.set(JSON.parse(JSON.stringify(dbObj)), { merge: false })
      );
    }, 2000);
  }

  /* salva imediatamente (usado no beforeunload) */
  function saveDBNow(dbObj){
    if (!_user) return;
    var ref = docRef();
    if (!ref) return;
    if (_saveDebounce){ clearTimeout(_saveDebounce); _saveDebounce = null; }
    fireAndForget(ref.set(JSON.parse(JSON.stringify(dbObj)), { merge: false }));
  }

  /* ---- carregar da nuvem ---- */
  function loadDB(){
    return new Promise(function(resolve){
      if (!_user){ resolve(null); return; }
      var ref = docRef();
      if (!ref){ resolve(null); return; }
      ref.get().then(function(snap){
        resolve(snap.exists ? snap.data() : null);
      }).catch(function(e){
        console.warn('[GonAuth] loadDB error', e);
        resolve(null);
      });
    });
  }

  /* ---- sign in com Google ---- */
  function signIn(){
    if (!_auth) return;
    var provider = new firebase.auth.GoogleAuthProvider();
    provider.setCustomParameters({ prompt: 'select_account' });
    /* Redirect funciona em qualquer domínio (GitHub Pages, mobile, Safari).
       Popup falha quando o domínio não está autorizado no Firebase Console
       ou quando o navegador bloqueia janelas popup. */
    _auth.signInWithRedirect(provider).catch(function(err){
      console.error('[GonAuth] signIn error', err);
    });
  }

  /* ---- sign out ---- */
  function signOut(){
    if (!_auth) return;
    _auth.signOut().then(function(){ window.location.reload(); });
  }

  /* ---- onReady: chama fn(user) quando auth estiver pronta ---- */
  function onReady(fn){
    if (_ready){ fn(_user); return; }
    _readyCallbacks.push(fn);
  }

  /* ---- usuário atual ---- */
  function currentUser(){ return _user; }

  /* ---- expõe a API global ---- */
  window.GonAuth = {
    init:        init,
    onReady:     onReady,
    signIn:      signIn,
    signOut:     signOut,
    saveDB:      saveDB,
    saveDBNow:   saveDBNow,
    loadDB:      loadDB,
    currentUser: currentUser
  };

})();
