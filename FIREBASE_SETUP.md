# Configuração do Firebase para o Gon

## Passo a passo completo

### 1. Criar o projeto no Firebase Console

1. Acesse [console.firebase.google.com](https://console.firebase.google.com)
2. Clique em **Adicionar projeto**
3. Dê o nome **gon-produtividade** (ou outro de sua preferência)
4. Desative o Google Analytics (opcional, não é necessário)
5. Clique em **Criar projeto**

---

### 2. Registrar o app Web

1. Na tela do projeto, clique no ícone **</>** (Web)
2. Dê o apelido **gon-web**
3. **NÃO marque** "Firebase Hosting" (a menos que queira hospedar lá)
4. Clique em **Registrar app**
5. **Copie o objeto `firebaseConfig`** que aparece na tela:

```javascript
const firebaseConfig = {
  apiKey: "AIza...",
  authDomain: "gon-produtividade.firebaseapp.com",
  projectId: "gon-produtividade",
  storageBucket: "gon-produtividade.appspot.com",
  messagingSenderId: "123456789",
  appId: "1:123...:web:abc..."
};
```

6. Abra o arquivo **`auth.js`** e substitua os valores em `FIREBASE_CONFIG` pelos do seu projeto.

---

### 3. Ativar Google Sign-In

1. No menu lateral, vá em **Authentication → Sign-in method**
2. Clique em **Google**
3. Ative e salve
4. Em **Domínios autorizados**, adicione o domínio onde você vai hospedar o site
   - Para testes locais: `localhost` já está adicionado por padrão

---

### 4. Criar o banco de dados Firestore

1. No menu lateral, vá em **Firestore Database**
2. Clique em **Criar banco de dados**
3. Selecione **Iniciar no modo de produção**
4. Escolha a região mais próxima de você (ex: `us-east1` ou `southamerica-east1`)
5. Clique em **Ativar**

---

### 5. Configurar as regras de segurança

1. No Firestore, clique na aba **Regras**
2. Substitua o conteúdo pelo que está em `firestore.rules`:

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /users/{userId}/{document=**} {
      allow read, write: if request.auth != null && request.auth.uid == userId;
    }
    match /{document=**} {
      allow read, write: if false;
    }
  }
}
```

3. Clique em **Publicar**

---

### 6. Atualizar o authDomain no index.html (CSP)

No `index.html`, a diretiva `frame-src` já inclui `https://*.firebaseapp.com`.
Se seu projeto tiver um domínio customizado, adicione-o também na CSP.

---

### 7. Atualizar o Service Worker

No `sw.js`, adicione os domínios do Firebase na lista `externalHosts` para que o SW não intercepte as chamadas de auth:

```javascript
var externalHosts = [
  // ... hosts existentes ...
  'firestore.googleapis.com',
  'identitytoolkit.googleapis.com',
  'securetoken.googleapis.com',
  'firebase.googleapis.com',
];
```

---

## Estrutura de dados no Firestore

```
users/
  {uid}/
    data/
      state  ← objeto DB completo do usuário (JSON)
```

Cada usuário tem acesso exclusivamente ao seu próprio documento.

---

## Teste local

Para testar localmente sem HTTPS, use `localhost` ou o emulador do Firebase:

```bash
npm install -g firebase-tools
firebase emulators:start --only auth,firestore
```

---

## Cuota gratuita do Firebase (Spark Plan)

- **Firestore**: 1GB de armazenamento, 50K leituras/dia, 20K escritas/dia
- **Authentication**: 10.000 usuários/mês
- Para um app pessoal ou pequeno, o plano gratuito é suficiente.
