@echo off
chcp 65001 >nul
title Instalar - Site Livro Efi
cd /d "%~dp0"
echo.
echo ========================================
echo  INSTALANDO DEPENDENCIAS DO SITE
echo ========================================
echo.
where node >nul 2>nul
if errorlevel 1 (
  echo ERRO: Node.js nao foi encontrado.
  echo Instale o Node.js LTS em https://nodejs.org/
  pause
  exit /b 1
)
call npm.cmd install
if errorlevel 1 (
  echo.
  echo A instalacao falhou. Copie o erro mostrado acima.
  pause
  exit /b 1
)
if not exist .env (
  copy /Y .env.example .env >nul
  echo.
  echo Arquivo .env criado automaticamente.
)
echo.
echo Instalacao concluida.
echo Agora edite o arquivo .env e depois execute INICIAR_SITE.bat
pause
