; Kubby Windows Installer (NSIS)
;
; Build from macOS:  makensis -NOCD -DINPUTDIR="dist/kubby-win-x64" installer/windows/kubby.nsi
; Build from Windows: makensis -DINPUTDIR="dist\kubby-win-x64" installer\windows\kubby.nsi
;
; Produces KubbySetup.exe that:
;   - Installs to C:\Program Files\Kubby
;   - Creates Start Menu + Desktop shortcuts
;   - Registers in Add/Remove Programs
;   - Preserves user data (%LOCALAPPDATA%\Kubby) on uninstall

!include "MUI2.nsh"

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

; ─── MUI Settings ───────────────────────────────────────
!define MUI_ABORTWARNING
; Icon paths relative to project root (forward slashes for cross-platform makensis)
!define MUI_ICON "launcher/assets/icon.ico"
!define MUI_UNICON "launcher/assets/icon.ico"

; ─── Pages ──────────────────────────────────────────────
!insertmacro MUI_PAGE_WELCOME
!insertmacro MUI_PAGE_DIRECTORY
!insertmacro MUI_PAGE_INSTFILES
!define MUI_FINISHPAGE_RUN "$INSTDIR\kubby.exe"
!define MUI_FINISHPAGE_RUN_TEXT "Launch Kubby"
!insertmacro MUI_PAGE_FINISH

!insertmacro MUI_UNPAGE_CONFIRM
!insertmacro MUI_UNPAGE_INSTFILES

; ─── Language ───────────────────────────────────────────
!insertmacro MUI_LANGUAGE "English"

; ─── Close Running Instance ──────────────────────────────
Function .onInit
  ; Kill running Kubby + child node.exe process tree before install/upgrade
  nsExec::ExecToLog 'taskkill /F /T /IM kubby.exe'
  Sleep 2000
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

  ; Write uninstaller
  WriteUninstaller "$INSTDIR\uninstall.exe"

  ; Registry: install path + uninstall info
  WriteRegStr HKLM "Software\Kubby" "InstallDir" "$INSTDIR"
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

  ; Remove registry keys
  DeleteRegKey HKLM "Software\Microsoft\Windows\CurrentVersion\Uninstall\Kubby"
  DeleteRegKey HKLM "Software\Kubby"

  ; Ask user if they want to delete user data
  MessageBox MB_YESNO|MB_ICONQUESTION \
    "Do you want to delete all Kubby user data (database, settings, metadata)?$\n$\nData location: $LOCALAPPDATA\Kubby$\n$\nClick 'No' to keep your data for future installations." \
    IDYES deleteData IDNO skipDelete
  deleteData:
    RMDir /r "$LOCALAPPDATA\Kubby"
  skipDelete:
SectionEnd
