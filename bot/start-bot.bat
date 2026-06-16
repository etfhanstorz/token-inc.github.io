@echo off
cd /d "%~dp0"
set NODE_TLS_REJECT_UNAUTHORIZED=0
npm start >> bot.log 2>&1
pause
