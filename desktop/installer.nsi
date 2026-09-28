; 멜로디 스케치패드 설치 프로그램 (NSIS) — electron-builder가 만든 dist/win-unpacked 를 담아요
Unicode true
!define APPNAME "멜로디 스케치패드"
!define EXE "MelodySketchpad.exe"
!ifndef VERSION
  !define VERSION "5.1.0"
!endif
!define UNKEY "Software\Microsoft\Windows\CurrentVersion\Uninstall\space.refracta.melodysketchpad"
Name "${APPNAME}"
OutFile "dist/MelodySketchpad-Setup-${VERSION}.exe"
InstallDir "$LOCALAPPDATA\Programs\MelodySketchpad"
InstallDirRegKey HKCU "${UNKEY}" "InstallLocation"
RequestExecutionLevel user
SetCompressor /SOLID lzma
VIProductVersion "${VERSION}.0"
VIAddVersionKey "ProductName" "${APPNAME}"
VIAddVersionKey "CompanyName" "Melody Sketchpad"
VIAddVersionKey "FileVersion" "${VERSION}"
VIAddVersionKey "ProductVersion" "${VERSION}"
VIAddVersionKey "FileDescription" "${APPNAME} 설치"
VIAddVersionKey "LegalCopyright" "© Melody Sketchpad"

!include "MUI2.nsh"
!define MUI_ICON "icon.ico"
!define MUI_UNICON "icon.ico"
!define MUI_ABORTWARNING
!define MUI_FINISHPAGE_RUN "$INSTDIR\${EXE}"
!define MUI_FINISHPAGE_RUN_TEXT "${APPNAME} 실행하기"
!insertmacro MUI_PAGE_WELCOME
!insertmacro MUI_PAGE_DIRECTORY
!insertmacro MUI_PAGE_INSTFILES
!insertmacro MUI_PAGE_FINISH
!insertmacro MUI_UNPAGE_CONFIRM
!insertmacro MUI_UNPAGE_INSTFILES
!insertmacro MUI_LANGUAGE "Korean"

Section "설치"
  nsExec::Exec 'taskkill /IM ${EXE} /F'   ; 켜져 있으면 끄고 덮어써요 (업데이트)
  Sleep 500
  SetOutPath "$INSTDIR"
  File /r "dist/win-unpacked/*"
  File "icon.ico"
  WriteUninstaller "$INSTDIR\Uninstall.exe"
  CreateShortCut "$DESKTOP\${APPNAME}.lnk" "$INSTDIR\${EXE}" "" "$INSTDIR\icon.ico"
  CreateShortCut "$SMPROGRAMS\${APPNAME}.lnk" "$INSTDIR\${EXE}" "" "$INSTDIR\icon.ico"
  ; 제어판 "앱 제거"
  WriteRegStr HKCU "${UNKEY}" "DisplayName" "${APPNAME}"
  WriteRegStr HKCU "${UNKEY}" "DisplayVersion" "${VERSION}"
  WriteRegStr HKCU "${UNKEY}" "Publisher" "Melody Sketchpad"
  WriteRegStr HKCU "${UNKEY}" "DisplayIcon" "$INSTDIR\icon.ico"
  WriteRegStr HKCU "${UNKEY}" "InstallLocation" "$INSTDIR"
  WriteRegStr HKCU "${UNKEY}" "UninstallString" '"$INSTDIR\Uninstall.exe"'
  WriteRegStr HKCU "${UNKEY}" "QuietUninstallString" '"$INSTDIR\Uninstall.exe" /S'
  WriteRegDWORD HKCU "${UNKEY}" "NoModify" 1
  WriteRegDWORD HKCU "${UNKEY}" "NoRepair" 1
  ; .msk 파일 두 번 클릭 → 앱에서 열기
  WriteRegStr HKCU "Software\Classes\.msk" "" "MelodySketchpad.Song"
  WriteRegStr HKCU "Software\Classes\MelodySketchpad.Song" "" "멜로디 스케치패드 곡"
  WriteRegStr HKCU "Software\Classes\MelodySketchpad.Song\DefaultIcon" "" "$INSTDIR\icon.ico"
  WriteRegStr HKCU "Software\Classes\MelodySketchpad.Song\shell\open\command" "" '"$INSTDIR\${EXE}" "%1"'
  System::Call 'shell32::SHChangeNotify(i 0x08000000, i 0, p 0, p 0)'
SectionEnd

Function .onInstSuccess
  IfSilent 0 +2
    Exec '"$INSTDIR\${EXE}"'   ; 자동 업데이트(창 없는 설치) 뒤에는 앱을 다시 켜요
FunctionEnd

Section "Uninstall"
  nsExec::Exec 'taskkill /IM ${EXE} /F'
  Delete "$DESKTOP\${APPNAME}.lnk"
  Delete "$SMPROGRAMS\${APPNAME}.lnk"
  RMDir /r "$INSTDIR"
  DeleteRegKey HKCU "${UNKEY}"
  DeleteRegKey HKCU "Software\Classes\MelodySketchpad.Song"
  ReadRegStr $0 HKCU "Software\Classes\.msk" ""
  StrCmp $0 "MelodySketchpad.Song" 0 +2
    DeleteRegKey HKCU "Software\Classes\.msk"
  System::Call 'shell32::SHChangeNotify(i 0x08000000, i 0, p 0, p 0)'
SectionEnd
