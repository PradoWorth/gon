/* GON — Auth & Cloud Sync */
(function(){
  'use strict';

  var FIREBASE_CONFIG = {
    apiKey:            "AIzaSyDX9AzzxLpr9QsvArO1F_KTPVCsd40cEMg",
    authDomain:        "appgon-ffb2a.firebaseapp.com",
    projectId:         "appgon-ffb2a",
    storageBucket:     "appgon-ffb2a.firebasestorage.app",
    messagingSenderId: "755042358247",
    appId:             "1:755042358247:web:e34b96b675d33b1a7d2342"
  };

  var _auth = null;
  var _db   = null;
  var _user = null;
  var _readyCallbacks = [];
  var _ready = false;
  var _saveTimer = null;

  function notifyReady(){
    if (_ready) return;
    _ready = true;
    var cbs = _readyCallbacks.slice();
    _readyCallbacks = [];
    cbs.forEach(function(fn){ try{ fn(_user); }catch(e){ console.error(e); } });
  }

  function init(){
    if (typeof firebase === 'undefined'){
      console.warn('[GonAuth] Firebase SDK não encontrado');
      notifyReady();
      return;
    }
    if (!firebase.apps.length){
      firebase.initializeApp(FIREBASE_CONFIG);
    }
    _auth = firebase.auth();
    _db   = firebase.firestore();

    _auth.onAuthStateChanged(function(user){
      console.log('[GonAuth] onAuthStateChanged:', user ? user.email : 'null');
      _user = user;
      notifyReady();
    });
  }

  function signIn(){
    if (!_auth) return;
    var provider = new firebase.auth.GoogleAuthProvider();
    provider.setCustomParameters({ prompt: 'select_account' });
    _auth.signInWithRedirect(provider).catch(function(err){
      console.error('[GonAuth] signIn error:', err);
    });
  }

  function signOut(){
    if (!_auth) return;
    _auth.signOut().then(function(){ window.location.reload(); });
  }

  function onReady(fn){
    if (_ready){ fn(_user); return; }
    _readyCallbacks.push(fn);
  }

  function currentUser(){ return _user; }

  function docRef(){
    if (!_db || !_user) return null;
    return _db.collection('users').doc(_user.uid).collection('data').doc('state');
  }

  function saveDB(dbObj){
    if (!_user) return;
    var ref = docRef();
    if (!ref) return;
    if (_saveTimer) clearTimeout(_saveTimer);
    _saveTimer = setTimeout(function(){
      _saveTimer = null;
      ref.set(JSON.parse(JSON.stringify(dbObj))).catch(function(e){
        console.warn('[GonAuth] saveDB error:', e);
      });
    }, 2000);
  }

  function saveDBNow(dbObj){
    if (!_user) return;
    var ref = docRef();
    if (!ref) return;
    if (_saveTimer){ clearTimeout(_saveTimer); _saveTimer = null; }
    ref.set(JSON.parse(JSON.stringify(dbObj))).catch(function(e){
      console.warn('[GonAuth] saveDBNow error:', e);
    });
  }

  function loadDB(){
    return new Promise(function(resolve){
      if (!_user){ resolve(null); return; }
      var ref = docRef();
      if (!ref){ resolve(null); return; }
      ref.get().then(function(snap){
        resolve(snap.exists ? snap.data() : null);
      }).catch(function(e){
        console.warn('[GonAuth] loadDB error:', e);
        resolve(null);
      });
    });
  }

  window.GonAuth = { init:init, onReady:onReady, signIn:signIn, signOut:signOut,
                     saveDB:saveDB, saveDBNow:saveDBNow, loadDB:loadDB, currentUser:currentUser };
})();
