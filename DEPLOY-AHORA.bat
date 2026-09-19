@echo off
title HALO PANEL - Deploy a Vercel
cd /d "%~dp0"

echo === HALO PANEL DEPLOY ===
echo.

echo [1/5] Eliminando git lock si existe...
if exist ".git\index.lock" (
    del /f ".git\index.lock"
    echo    Lock eliminado.
) else (
    echo    No habia lock.
)

echo.
echo [2/5] Ejecutando lint...
npm run lint
if errorlevel 1 goto error

echo.
echo [3/5] Ejecutando build...
npm run build
if errorlevel 1 goto error

echo.
echo [4/5] Agregando todos los cambios...
git add -A
if errorlevel 1 goto error

echo.
echo [5/5] Haciendo commit y push...
set /p MSG="Mensaje de commit: "
if "%MSG%"=="" set MSG=chore: actualizacion panel
git commit -m "%MSG%"
if errorlevel 1 (
    echo    Nada nuevo que commitear o error.
)

echo.
git push origin main
if errorlevel 1 goto error

echo.
echo ==========================================
echo  LISTO. GitHub queda actualizado.
echo  Cierra esta ventana cuando quieras.
echo ==========================================
pause
exit /b 0

:error
echo.
echo ERROR en el paso anterior. Revisa los mensajes de arriba.
pause
exit /b 1
