; Kubby Windows Installer (NSIS)
;
; Build from macOS:  makensis -NOCD -DINPUTDIR="dist/kubby-win-x64" installer/windows/kubby.nsi
; Build from Windows: makensis -DINPUTDIR="dist\kubby-win-x64" installer\windows\kubby.nsi
;
; Produces KubbySetup.exe that:
;   - Installs to C:\Program Files\Kubby
;   - Lets user choose a data directory (default %LOCALAPPDATA%\Kubby)
;   - Migrates old data if the user picks a new location
;   - Creates Start Menu + Desktop shortcuts
;   - Registers in Add/Remove Programs
;   - Preserves user data on uninstall (unless user opts to delete)

!include "MUI2.nsh"
!include "nsDialogs.nsh"
!include "LogicLib.nsh"
!include "StrFunc.nsh"
${StrRep}

; ─── General ────────────────────────────────────────────
Name "Kubby"
OutFile "dist\KubbySetup.exe"
InstallDir "$PROGRAMFILES64\Kubby"
InstallDirRegKey HKLM "Software\Kubby" "InstallDir"
RequestExecutionLevel admin
Unicode True

; ─── Version Info ───────────────────────────────────────
!define VERSION "0.1.0"
VIProductVersion "0.1.0.0"
VIAddVersionKey "ProductName" "Kubby"
VIAddVersionKey "ProductVersion" "${VERSION}"
VIAddVersionKey "FileDescription" "Kubby Media Server Installer"
VIAddVersionKey "LegalCopyright" "MIT License"

; ─── Variables ──────────────────────────────────────────
Var DataDir
Var DataDirText
Var ExistingPort

; ─── MUI Settings ───────────────────────────────────────
!define MUI_ABORTWARNING
; Icon paths relative to project root (forward slashes for cross-platform makensis)
!define MUI_ICON "launcher/assets/icon.ico"
!define MUI_UNICON "launcher/assets/icon.ico"

; ─── Pages ──────────────────────────────────────────────
!insertmacro MUI_PAGE_WELCOME
!insertmacro MUI_PAGE_DIRECTORY
Page custom DataDirPage DataDirPageLeave
!insertmacro MUI_PAGE_INSTFILES
!define MUI_FINISHPAGE_RUN "$INSTDIR\kubby.exe"
!define MUI_FINISHPAGE_RUN_TEXT "Launch Kubby"
!insertmacro MUI_PAGE_FINISH

!insertmacro MUI_UNPAGE_CONFIRM
!insertmacro MUI_UNPAGE_INSTFILES

; ─── Language ───────────────────────────────────────────
!insertmacro MUI_LANGUAGE "English"

; ─── Close Running Instance & Init ──────────────────────
Function .onInit
  ; Ensure shell folder variables ($LOCALAPPDATA, $DESKTOP, etc.) resolve
  ; to the actual logged-in user, not the admin account from UAC elevation.
  SetShellVarContext current

  ; Kill running Kubby + child node.exe process tree before install/upgrade
  nsExec::ExecToLog 'taskkill /F /T /IM kubby.exe'
  Sleep 2000

  ; Pre-populate data directory from previous install or use default
  ReadRegStr $DataDir HKLM "Software\Kubby" "DataDir"
  ${If} $DataDir == ""
    StrCpy $DataDir "$LOCALAPPDATA\Kubby"
  ${EndIf}
FunctionEnd

; ─── Custom Page: Data Directory ────────────────────────
Function DataDirPage
  !insertmacro MUI_HEADER_TEXT "Data Directory" "Choose where Kubby stores its data."
  nsDialogs::Create 1018
  Pop $0

  ${NSD_CreateLabel} 0 0 100% 36u \
    "Select the directory where Kubby will store its database, metadata,$\r$\nand media information. The default location is recommended for most users."
  Pop $0

  ${NSD_CreateDirRequest} 0 50u 74% 12u "$DataDir"
  Pop $DataDirText

  ${NSD_CreateBrowseButton} 76% 50u 24% 12u "Browse..."
  Pop $0
  ${NSD_OnClick} $0 OnBrowseDataDir

  nsDialogs::Show
FunctionEnd

Function OnBrowseDataDir
  nsDialogs::SelectFolderDialog "Select Kubby Data Directory" "$DataDir"
  Pop $0
  ${If} $0 != "error"
    ${NSD_SetText} $DataDirText $0
  ${EndIf}
FunctionEnd

Function DataDirPageLeave
  ${NSD_GetText} $DataDirText $DataDir
FunctionEnd

; ─── Installer Section ──────────────────────────────────
Section "Install"
  SetOutPath "$INSTDIR"

  ; Copy all files from the flat build directory
  ; INPUTDIR is passed via -D flag from the packaging script
  File "${INPUTDIR}\kubby.exe"

  SetOutPath "$INSTDIR\node"
  File /r "${INPUTDIR}\node\*.*"

  SetOutPath "$INSTDIR\bin"
  File /r "${INPUTDIR}\bin\*.*"

  SetOutPath "$INSTDIR\server"
  File /r "${INPUTDIR}\server\*.*"

  SetOutPath "$INSTDIR"

  ; ── Create data directory ──
  CreateDirectory "$DataDir"

  ; ── Migrate old data if user chose a non-default directory ──
  StrCmp "$DataDir" "$LOCALAPPDATA\Kubby" skipMigrate
  IfFileExists "$LOCALAPPDATA\Kubby\kubby.db" 0 skipMigrate

  MessageBox MB_YESNO|MB_ICONQUESTION \
    "Existing Kubby data found at:$\n$LOCALAPPDATA\Kubby$\n$\nMigrate data to the new location?" \
    IDYES doMigrate IDNO skipMigrate

  doMigrate:
    CopyFiles /SILENT "$LOCALAPPDATA\Kubby\kubby.db" "$DataDir"

    ; Verify the critical file was actually copied
    IfFileExists "$DataDir\kubby.db" 0 migrateFailed

    IfFileExists "$LOCALAPPDATA\Kubby\kubby.db-wal" 0 noWal
      CopyFiles /SILENT "$LOCALAPPDATA\Kubby\kubby.db-wal" "$DataDir"
    noWal:

    IfFileExists "$LOCALAPPDATA\Kubby\kubby.db-shm" 0 noShm
      CopyFiles /SILENT "$LOCALAPPDATA\Kubby\kubby.db-shm" "$DataDir"
    noShm:

    IfFileExists "$LOCALAPPDATA\Kubby\secret.key" 0 noSecret
      CopyFiles /SILENT "$LOCALAPPDATA\Kubby\secret.key" "$DataDir"
    noSecret:

    IfFileExists "$LOCALAPPDATA\Kubby\metadata\*.*" 0 noMeta
      CopyFiles /SILENT "$LOCALAPPDATA\Kubby\metadata" "$DataDir"
    noMeta:

    ; Clean up: only delete each old file after confirming its copy exists
    IfFileExists "$DataDir\kubby.db" 0 +2
      Delete "$LOCALAPPDATA\Kubby\kubby.db"
    IfFileExists "$DataDir\kubby.db-wal" 0 +2
      Delete "$LOCALAPPDATA\Kubby\kubby.db-wal"
    IfFileExists "$DataDir\kubby.db-shm" 0 +2
      Delete "$LOCALAPPDATA\Kubby\kubby.db-shm"
    IfFileExists "$DataDir\secret.key" 0 +2
      Delete "$LOCALAPPDATA\Kubby\secret.key"
    IfFileExists "$DataDir\metadata\*.*" 0 +2
      RMDir /r "$LOCALAPPDATA\Kubby\metadata"

    Goto skipMigrate

  migrateFailed:
    MessageBox MB_OK|MB_ICONEXCLAMATION \
      "Failed to copy data to:$\n$DataDir$\n$\nKubby will use the default data location instead."
    StrCpy $DataDir "$LOCALAPPDATA\Kubby"

  skipMigrate:

  ; ── Write config.json to fixed config location ──
  CreateDirectory "$LOCALAPPDATA\Kubby"

  ; If using default dataDir, only create config.json when it doesn't exist yet
  ; (preserves user's port and any other settings on upgrade)
  StrCmp "$DataDir" "$LOCALAPPDATA\Kubby" handleDefaultConfig

  ; --- Custom dataDir: must write/update config.json with dataDir field ---

  ; Read existing port from config.json so we don't overwrite it
  StrCpy $ExistingPort "8665"
  IfFileExists "$LOCALAPPDATA\Kubby\config.json" 0 writeCustomConfig
  nsExec::ExecToStack `powershell -NoProfile -Command "try{(Get-Content -Raw '$LOCALAPPDATA\Kubby\config.json'|ConvertFrom-Json).port}catch{8665}"`
  Pop $0  ; exit code
  Pop $ExistingPort
  ${StrRep} $ExistingPort $ExistingPort "$\r" ""
  ${StrRep} $ExistingPort $ExistingPort "$\n" ""
  ${StrRep} $ExistingPort $ExistingPort " " ""
  StrCmp $ExistingPort "" 0 writeCustomConfig
  StrCpy $ExistingPort "8665"

  writeCustomConfig:
  ; Escape backslashes for JSON
  ${StrRep} $1 "$DataDir" "\" "\\"
  FileOpen $0 "$LOCALAPPDATA\Kubby\config.json" w
  FileWrite $0 '{$\r$\n  "port": $ExistingPort,$\r$\n  "dataDir": "$1"$\r$\n}$\r$\n'
  FileClose $0
  Goto configDone

  handleDefaultConfig:
    IfFileExists "$LOCALAPPDATA\Kubby\config.json" configDone
    FileOpen $0 "$LOCALAPPDATA\Kubby\config.json" w
    FileWrite $0 '{$\r$\n  "port": 8665$\r$\n}$\r$\n'
    FileClose $0

  configDone:

  ; Write uninstaller
  WriteUninstaller "$INSTDIR\uninstall.exe"

  ; Registry: install path, data path, uninstall info
  WriteRegStr HKLM "Software\Kubby" "InstallDir" "$INSTDIR"
  WriteRegStr HKLM "Software\Kubby" "DataDir" "$DataDir"
  WriteRegStr HKLM "Software\Microsoft\Windows\CurrentVersion\Uninstall\Kubby" \
    "DisplayName" "Kubby"
  WriteRegStr HKLM "Software\Microsoft\Windows\CurrentVersion\Uninstall\Kubby" \
    "UninstallString" '"$INSTDIR\uninstall.exe"'
  WriteRegStr HKLM "Software\Microsoft\Windows\CurrentVersion\Uninstall\Kubby" \
    "DisplayIcon" '"$INSTDIR\kubby.exe"'
  WriteRegStr HKLM "Software\Microsoft\Windows\CurrentVersion\Uninstall\Kubby" \
    "DisplayVersion" "${VERSION}"
  WriteRegStr HKLM "Software\Microsoft\Windows\CurrentVersion\Uninstall\Kubby" \
    "Publisher" "Kubby"
  WriteRegDWORD HKLM "Software\Microsoft\Windows\CurrentVersion\Uninstall\Kubby" \
    "NoModify" 1
  WriteRegDWORD HKLM "Software\Microsoft\Windows\CurrentVersion\Uninstall\Kubby" \
    "NoRepair" 1

  ; Start Menu shortcuts
  CreateDirectory "$SMPROGRAMS\Kubby"
  CreateShortCut "$SMPROGRAMS\Kubby\Kubby.lnk" "$INSTDIR\kubby.exe" "" "$INSTDIR\kubby.exe"
  CreateShortCut "$SMPROGRAMS\Kubby\Uninstall Kubby.lnk" "$INSTDIR\uninstall.exe"

  ; Desktop shortcut
  CreateShortCut "$DESKTOP\Kubby.lnk" "$INSTDIR\kubby.exe" "" "$INSTDIR\kubby.exe"
SectionEnd

; ─── Close Running Instance Before Uninstall ─────────────
Function un.onInit
  SetShellVarContext current
  nsExec::ExecToLog 'taskkill /F /T /IM kubby.exe'
  Sleep 2000
FunctionEnd

; ─── Uninstaller Section ────────────────────────────────
Section "Uninstall"
  ; Remove installed files
  RMDir /r "$INSTDIR\node"
  RMDir /r "$INSTDIR\bin"
  RMDir /r "$INSTDIR\server"
  Delete "$INSTDIR\kubby.exe"
  Delete "$INSTDIR\uninstall.exe"
  RMDir "$INSTDIR"

  ; Remove shortcuts
  Delete "$SMPROGRAMS\Kubby\Kubby.lnk"
  Delete "$SMPROGRAMS\Kubby\Uninstall Kubby.lnk"
  RMDir "$SMPROGRAMS\Kubby"
  Delete "$DESKTOP\Kubby.lnk"

  ; Read data directory from registry before removing keys
  ReadRegStr $1 HKLM "Software\Kubby" "DataDir"

  ; Remove registry keys
  DeleteRegKey HKLM "Software\Microsoft\Windows\CurrentVersion\Uninstall\Kubby"
  DeleteRegKey HKLM "Software\Kubby"

  ; Ask user if they want to delete user data
  ; Branch based on whether a custom data directory was used
  ${If} $1 == ""
  ${OrIf} $1 == "$LOCALAPPDATA\Kubby"
    ; Default location — single directory
    MessageBox MB_YESNO|MB_ICONQUESTION \
      "Do you want to delete all Kubby user data (database, settings, metadata)?$\n$\nLocation: $LOCALAPPDATA\Kubby$\n$\nClick 'No' to keep your data for future installations." \
      IDYES deleteDefault IDNO skipDelete
    deleteDefault:
      RMDir /r "$LOCALAPPDATA\Kubby"
      Goto skipDelete
  ${Else}
    ; Custom location — two directories
    MessageBox MB_YESNO|MB_ICONQUESTION \
      "Do you want to delete all Kubby user data?$\n$\nConfig: $LOCALAPPDATA\Kubby$\nData: $1$\n$\nClick 'No' to keep your data for future installations." \
      IDYES deleteCustom IDNO skipDelete
    deleteCustom:
      RMDir /r "$LOCALAPPDATA\Kubby"
      RMDir /r "$1"
  ${EndIf}

  skipDelete:
SectionEnd
