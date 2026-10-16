; BindLens - Windows installer (Inno Setup 6). Built by .github/workflows/build-windows.yml.
; Installs for the person who runs it (no administrator needed) in %LOCALAPPDATA%\Programs\BindLens.
; Your books, marks and settings live in %APPDATA%\BindLens and are never touched by installing or uninstalling.

#ifndef AppVer
  #define AppVer "0.0"
#endif

[Setup]
AppId={{704F6DB6-88DF-4EFA-A43F-45C7479A4763}
AppName=BindLens
AppVersion={#AppVer}
AppVerName=BindLens {#AppVer}
AppPublisher=Mohammed Chahboune Kadi
AppPublisherURL=https://bindlens.com
AppSupportURL=https://github.com/CKMohammed/BindLens
AppCopyright=Copyright (C) 2026 Mohammed Chahboune Kadi - GNU AGPL v3
DefaultDirName={localappdata}\Programs\BindLens
DefaultGroupName=BindLens
DisableProgramGroupPage=yes
DisableDirPage=auto
PrivilegesRequired=lowest
OutputDir=..\Output
OutputBaseFilename=BindLens Setup
SetupIconFile=..\BindLens.ico
UninstallDisplayIcon={app}\BindLens.exe
UninstallDisplayName=BindLens
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
Source: "..\dist\BindLens\*"; DestDir: "{app}"; Flags: ignoreversion recursesubdirs createallsubdirs

[Icons]
Name: "{autoprograms}\BindLens"; Filename: "{app}\BindLens.exe"; WorkingDir: "{app}"; Comment: "BindLens - your folders as books"
Name: "{autodesktop}\BindLens"; Filename: "{app}\BindLens.exe"; WorkingDir: "{app}"; Comment: "BindLens - your folders as books"; Tasks: desktopicon

[Run]
Filename: "{app}\BindLens.exe"; Description: "{cm:LaunchProgram,BindLens}"; Flags: nowait postinstall skipifsilent

[UninstallDelete]
; files BindLens makes next to itself (logo icons, its log) - not your books, not your settings
Type: files; Name: "{app}\BindLens-*.ico"
Type: files; Name: "{app}\BindLens-error.log"
Type: files; Name: "{app}\selftest.txt"
