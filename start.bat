@echo off
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo Node.js fehlt. Bitte von https://nodejs.org die LTS-Version installieren, dann start.bat neu starten.
  pause
  exit /b 1
)
if not exist data mkdir data
rem Die PIN fragt und schreibt Node, nicht cmd: "set /p" plus "echo" hat frueher
rem "ECHO ist ausgeschaltet" in data\sl.pin hinterlassen. tools\slpin.js erkennt
rem solche Reste und fragt dann neu.
node tools\slpin.js
title DYE.TV - Cloud OFF
echo.
echo  Spielleiter   http://127.0.0.1:3478/ember
echo  Spieler       http://127.0.0.1:3478/player
echo  Zu Hause      sobald der Titel Cloud ON zeigt, steht die Adresse in der Leitstelle
echo.
start /b node tools\tunnel.js
rem Nur der erste Lauf zeigt die Glut-Animation und oeffnet den Browser.
rem Abschalten: set DYE_NO_ANIM=1 bzw. set DYE_NO_BROWSER=1 vor dem Start.
set DYE_FRISCHER_START=1
:emberloop
node server.js
if errorlevel 42 (
  set DYE_FRISCHER_START=
  echo Neustart ...
  timeout /t 1 /nobreak >nul
  goto emberloop
)
echo Server beendet.
pause
