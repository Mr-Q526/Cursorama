@echo off
setlocal
cd /d "%~dp0"
if exist "release\win-unpacked\Cursorama.exe" (
  start "" "release\win-unpacked\Cursorama.exe"
) else (
  call npm start
)
