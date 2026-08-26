@echo off
title JARVIS XTTS Server (port 8012)
cd /d %~dp0
echo Memulai JARVIS XTTS Server... (model dimuat sekali, tunggu sampai "Server berjalan")
venv\Scripts\python.exe xtts_server.py
pause
