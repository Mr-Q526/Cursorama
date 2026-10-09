!include "FileFunc.nsh"
!include "LogicLib.nsh"
!include "${BUILD_RESOURCES_DIR}\installer-catalog.nsh"
!define CURSORAMA_INSTALLER_FAILURE 2

; 只卸载已知程序文件；工程、成片、目录配置和用户放入的其他文件保留。
!macro customRemoveFiles
  GetFullPathName $R9 "$INSTDIR"
  ${If} $R9 == ""
    SetErrorLevel ${CURSORAMA_INSTALLER_FAILURE}
    Quit
  ${EndIf}
  GetFullPathName $R8 "$INSTDIR\resources"
  ${GetParent} "$R8" $R7
  ${If} $R7 != $R9
    SetErrorLevel ${CURSORAMA_INSTALLER_FAILURE}
    Quit
  ${EndIf}
  SetOutPath "$TEMP"
  ClearErrors
  Delete "$INSTDIR\${APP_EXECUTABLE_FILENAME}"
  ${If} ${Errors}
    Abort "$(cursoramaFilesBusy)"
  ${EndIf}
  Delete "$INSTDIR\${UNINSTALL_FILENAME}"
  Delete "$INSTDIR\chrome_100_percent.pak"
  Delete "$INSTDIR\chrome_200_percent.pak"
  Delete "$INSTDIR\d3dcompiler_47.dll"
  Delete "$INSTDIR\dxcompiler.dll"
  Delete "$INSTDIR\dxil.dll"
  Delete "$INSTDIR\ffmpeg.dll"
  Delete "$INSTDIR\icudtl.dat"
  Delete "$INSTDIR\LICENSE.electron.txt"
  Delete "$INSTDIR\LICENSES.chromium.html"
  Delete "$INSTDIR\resources.pak"
  Delete "$INSTDIR\snapshot_blob.bin"
  Delete "$INSTDIR\v8_context_snapshot.bin"
  Delete "$INSTDIR\version"
  Delete "$INSTDIR\vk_swiftshader_icd.json"
  Delete "$INSTDIR\vk_swiftshader.dll"
  Delete "$INSTDIR\vulkan-1.dll"
  Delete "$INSTDIR\LICENSE"
  Delete "$INSTDIR\THIRD_PARTY_NOTICES.md"
  Delete "$INSTDIR\使用说明.txt"
  Delete "$INSTDIR\resources\app.asar"
  Delete "$INSTDIR\resources\app-update.yml"
  Delete "$INSTDIR\resources\default_app.asar"
  Delete "$INSTDIR\resources\ffmpeg.exe"
  Delete "$INSTDIR\resources\icon.png"
  Delete "$INSTDIR\resources\elevate.exe"
  Delete "$INSTDIR\resources\native\pointer-tracker.ps1"
  Delete "$INSTDIR\resources\third-party\FFmpeg-LICENSE.txt"
  Delete "$INSTDIR\resources\third-party\FFmpeg-BUILD-INFO.txt"
  RMDir "$INSTDIR\resources\native"
  RMDir "$INSTDIR\resources\third-party"
  RMDir "$INSTDIR\resources"
  GetFullPathName $R8 "$INSTDIR\locales"
  ${GetParent} "$R8" $R7
  ${If} $R7 == $R9
    Delete "$INSTDIR\locales\*.pak"
    RMDir "$INSTDIR\locales"
  ${EndIf}
  RMDir "$INSTDIR"
!macroend
