# Gon - Foco e Produtividade

Timer Pomodoro com tarefas, hidratação, música e um companheiro virtual.

## Estrutura do projeto

```
gon/
├── index.html        # HTML principal (1.1k linhas — era 12k no arquivo único)
├── sw.js             # Service Worker (PWA — arquivo separado obrigatório)
├── README.md         # Este arquivo
├── css/
│   └── style.css     # Todo o CSS (~3.500 linhas)
└── js/
    ├── i18n.js       # Sistema de idiomas (~2.000 linhas)
    ├── app.js        # Lógica principal (~5.200 linhas)
    └── campfire.js   # Animação da fogueira (~320 linhas)
```

## Como subir no GitHub Pages

1. Crie um repositório no GitHub (ex: `gon`)
2. Suba todos os arquivos mantendo a estrutura de pastas
3. Vá em **Settings → Pages → Source** e selecione a branch `main`
4. Acesse em `https://seu-usuario.github.io/gon/`

## Observações importantes

- O arquivo `sw.js` (Service Worker) precisa estar na **raiz do projeto** — não dentro de `/js/`. Navegadores exigem isso por segurança.
- Se você não tiver o `sw.js`, o PWA (instalar como app / modo offline) não vai funcionar, mas o site carrega normalmente.
- Os hashes SHA-256 da CSP foram removidos do `index.html` porque com arquivos `.js` externos eles não são necessários — a diretiva `'self'` já cobre tudo.

## O que foi separado

| Arquivo original | Linhas | O que virou |
|---|---|---|
| `<style>` no HTML | 3.497 | `css/style.css` |
| `<script>` i18n | 2.011 | `js/i18n.js` |
| `<script>` app principal | 5.199 | `js/app.js` |
| `<script>` campfire | 320 | `js/campfire.js` |
| HTML puro | 1.053 | `index.html` |
