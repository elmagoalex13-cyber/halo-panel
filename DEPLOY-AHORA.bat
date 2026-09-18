@echo off
title HALO PANEL - Deploy a Vercel
cd /d "%~dp0"

echo === HALO PANEL DEPLOY ===
echo.

echo [1/4] Eliminando git lock si existe...
if exist ".git\index.lock" (
    del /f ".git\index.lock"
    echo    Lock eliminado.
) else (
    echo    No habia lock.
)

echo.
echo [2/4] Agregando todos los cambios...
git add -A
if errorlevel 1 goto error

echo.
echo [3/4] Haciendo commit...
git commit -m "feat: pipeline completo — upload bar, import URL, enviar al runner, fix estados"
if errorlevel 1 (
    echo    Nada nuevo que commitear o error.
)

echo.
echo [4/4] Haciendo push a GitHub (dispara Vercel)...
git push origin main
if errorlevel 1 goto error

echo.
echo ==========================================
echo  LISTO. Vercel desplegara en 1-2 minutos.
echo  Cierra esta ventana cuando quieras.
echo ==========================================
pause
exit /b 0

:error
echo.
echo ERROR en el paso anterior. Revisa los mensajes de arriba.
pause
exit /b 1
