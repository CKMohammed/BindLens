@echo off
setlocal
title BindLens - install
cd /d "%~dp0"

if not exist "%~dp0BindLens.pyw" (
  echo.
  echo  BindLens.pyw is not next to this file.
  echo  Please right-click the BindLens zip, choose "Extract All",
  echo  open the extracted folder and double-click Install.bat again.
  echo.
  pause
  exit /b 1
)

set "DEST=%LOCALAPPDATA%\BindLens App"
set "PY=py"
where py >nul 2>nul || set "PY=python"
where %PY% >nul 2>nul || (
  echo.
  echo  Python is not installed. Please install it from https://www.python.org/downloads/
  echo  ^(tick "Add python.exe to PATH"^), then run Install.bat again.
  echo.
  pause
  exit /b 1
)

echo.
echo  1/3  Installing what BindLens needs (PyMuPDF and drag-and-drop support)...
%PY% -m pip install --upgrade --disable-pip-version-check pymupdf tkinterdnd2

echo.
echo  2/3  Copying BindLens to its own place: "%DEST%"
if /i "%~dp0"=="%DEST%\" goto copied
robocopy "%~dp0." "%DEST%" /E /XD __pycache__ /XF BindLens-error.log /NFL /NDL /NJH /NJS /NP >nul
if errorlevel 8 (
  echo  Could not copy the files. BindLens will run from this folder instead.
  set "DEST=%~dp0."
)
:copied

echo.
echo  3/3  Putting the BindLens icon on your desktop and in the Start menu...
%PY% "%DEST%\BindLens.pyw" --shortcut

echo.
echo  Done. From now on open BindLens with its icon on the desktop.
echo  (You can delete the zip and this folder - BindLens and your books are kept.)
echo.
start "" /d "%DEST%" "%DEST%\Start BindLens.bat"
timeout /t 6 >nul
