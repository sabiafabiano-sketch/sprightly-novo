@echo off
title Controle Financeiro Familiar - Iniciar para Celular
chcp 65001 >nul
cd /d "%~dp0"
echo.
echo Iniciando servidor para celular...
echo.
powershell -NoProfile -ExecutionPolicy Bypass -File "servidor_celular.ps1"
if errorlevel 1 (
    echo.
    echo Ocorreu um erro ao iniciar. Pressione qualquer tecla para sair...
    pause >nul
)
