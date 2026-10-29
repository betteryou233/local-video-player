@echo off
setlocal
if not exist "%~dp0runtime\pythonw.exe" (
  echo Download the portable ZIP from Releases and extract it completely.
  echo For a source checkout, use: python launch.py --open
  pause
  exit /b 1
)
start "" "%~dp0runtime\pythonw.exe" "%~dp0launch.py" --open
endlocal
