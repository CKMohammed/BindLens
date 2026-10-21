; BookReader by BindLens - Windows installer (Inno Setup 6): BindLens, only reading (built as BookReader.exe). Built by .github/workflows/build-windows.yml.
; Installs for the person who runs it (no administrator needed) in %LOCALAPPDATA%\Programs\BindLens.
; Your books, marks and settings live in %APPDATA%\BindLens and are never touched by installing or uninstalling.

#ifndef AppVer
  #define AppVer "0.0"
#endif

[Setup]
AppId={{9B1D4C2E-6A7F-4E3B-8C5D-2F1A0E9D7B64}
AppName=BookReader
AppVersion={#AppVer}
AppVerName=BookReader {#AppVer}
AppPublisher=Mohammed Chahboune Kadi
AppPublisherURL=https://bindlens.com
AppSupportURL=https://github.com/CKMohammed/BindLens
AppCopyright=Copyright (C) 2026 Mohammed Chahboune Kadi - GNU AGPL v3
DefaultDirName={localappdata}\Programs\BookReader
DefaultGroupName=BookReader
DisableProgramGroupPage=yes
DisableDirPage=auto
PrivilegesRequired=lowest
OutputDir=..\Output
OutputBaseFilename=BookReader Setup
SetupIconFile=..\BookReader.ico
UninstallDisplayIcon={app}\BookReader.exe
UninstallDisplayName=BookReader
LicenseFile=..\LICENSE.txt
Compression=lzma2/max
SolidCompression=yes
WizardStyle=modern
ArchitecturesAllowed=x64compatible
ArchitecturesInstallIn64BitMode=x64compatible
CloseApplications=yes
RestartApplications=no

[Languages]
Name: "english"; MessagesFile: "compiler:Default.isl"
Name: "spanish"; MessagesFile: "compiler:Languages\Spanish.isl"

[Tasks]
Name: "desktopicon"; Description: "{cm:CreateDesktopIcon}"; GroupDescription: "{cm:AdditionalIcons}"

[Files]
Source: "..\dist\BookReader\*"; DestDir: "{app}"; Flags: ignoreversion recursesubdirs createallsubdirs

[Icons]
Name: "{autoprograms}\BookReader"; Filename: "{app}\BookReader.exe"; WorkingDir: "{app}"; Comment: "BookReader - read your folders"
Name: "{autodesktop}\BookReader"; Filename: "{app}\BookReader.exe"; WorkingDir: "{app}"; Comment: "BookReader - read your folders"; Tasks: desktopicon

[Run]
Filename: "{app}\BookReader.exe"; Description: "{cm:LaunchProgram,BookReader}"; Flags: nowait postinstall skipifsilent

[UninstallDelete]
; files BindLens makes next to itself (logo icons, its log) - not your books, not your settings
Type: files; Name: "{app}\BindLens-*.ico"
Type: files; Name: "{app}\BindLens-error.log"
Type: files; Name: "{app}\selftest.txt"
