@echo off
chcp 65001 >nul
title Site Livro Efi
cd /d "%~dp0"
if not exist node_modules (
  echo Dependencias ainda nao instaladas.
  echo Execute primeiro o arquivo INSTALAR.bat
  pause
  exit /b 1
)
if not exist .env (
  copy /Y .env.example .env >nul
  echo Arquivo .env criado. Preencha as credenciais da Efi quando for testar pagamentos.
)
echo.
echo Iniciando o site...
echo Depois abra: http://localhost:3000
echo Para encerrar, pressione Ctrl+C.
echo.
call npm.cmd start
pause
