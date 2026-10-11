@echo off
cd /d "%~dp0"
where pyw >nul 2>nul && (start "" pyw "%~dp0BindLens.pyw" & exit /b)
where pythonw >nul 2>nul && (start "" pythonw "%~dp0BindLens.pyw" & exit /b)
start "" python "%~dp0BindLens.pyw"
