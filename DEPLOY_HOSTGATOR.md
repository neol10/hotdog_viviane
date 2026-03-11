# Deploy na HostGator (subpasta /agenciadaspizzas)

Objetivo: publicar este site em `https://newneo.com.br/agenciadaspizzas/`.

## 1) Upload (Arquivos)
1. No cPanel da HostGator, abra **Gerenciador de Arquivos**.
2. Entre em `public_html/` (ou a pasta raiz do domínio `newneo.com.br`).
3. Crie a pasta: `agenciadaspizzas`.
4. Faça upload **de todos os arquivos** deste projeto para dentro dessa pasta (incluindo `.htaccess`).

Estrutura final esperada:
- `public_html/agenciadaspizzas/index.html`
- `public_html/agenciadaspizzas/admin.html`
- `public_html/agenciadaspizzas/comanda.html`
- `public_html/agenciadaspizzas/sw.js`
- `public_html/agenciadaspizzas/manifest.json`
- `public_html/agenciadaspizzas/styles.css`
- `public_html/agenciadaspizzas/logo pizza.jpg`
- `public_html/agenciadaspizzas/img/...`

## 2) Teste rápido pós-upload
Abra no navegador:
- `https://newneo.com.br/agenciadaspizzas/`
- `https://newneo.com.br/agenciadaspizzas/admin.html`
- `https://newneo.com.br/agenciadaspizzas/comanda.html`

### PWA / Cache (importante)
- Depois do primeiro acesso, faça um **hard refresh** (Ctrl+F5) se você já tinha aberto antes.
- Se você testou antes na raiz do domínio, pode existir cache antigo do Service Worker. Nesse caso:
  - No Chrome: `Configurações > Privacidade e segurança > Configurações do site > Ver permissões e dados...` e limpe os dados do domínio.

## 3) (Opcional) Redirecionar `https://newneo.com.br/` para `/agenciadaspizzas/`
Se você quiser que ao acessar o domínio sem caminho ele já vá para a subpasta:

- Se já existir `public_html/.htaccess`: copie e cole as linhas do arquivo `HTACCESS_PUBLIC_HTML_ROOT.txt` no final.
- Se não existir: crie `public_html/.htaccess` e cole o conteúdo do `HTACCESS_PUBLIC_HTML_ROOT.txt`.

Quando tiver certeza, troque `R=302` por `R=301` (redirecionamento permanente).

## 4) Observações
- Este projeto já está ajustado para rodar em subpasta: manifest, service worker e links não usam mais paths absolutos `/...`.
- O `.htaccess` dentro de `/agenciadaspizzas` ajuda a evitar cache “grudado” em `sw.js` e HTML, e deixa cache forte para assets.
