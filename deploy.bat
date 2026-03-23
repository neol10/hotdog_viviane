@echo off
setlocal
cd /d "%~dp0"

echo.
echo ==========================================
echo 🌭 HOTDOG VIVIANE - DEPLOY AUTOMATICO 🚀
echo ==========================================
echo.

echo [1/2] Sincronizando site (GitHub/Vercel)...
git add .
git commit -m "auto: deploy geral de correcoes"
git push

echo.
echo [2/2] Subindo funcoes de notificacao (Supabase)...
call npx supabase functions deploy send-order-push --project-ref mnygtmcwgkrkqluaqyfe --no-verify-jwt

echo.
echo ==========================================
echo ✅ TUDO PRONTO! O sistema foi atualizado.
echo ==========================================
echo.
pause
