; Guncelleme, eski surum kaldirilamadiginda da tamamlansin.
;
; Eski surumler uygulamayi resources\app.asar icinde tasiyordu. Baska bir program (disk tarayici,
; antivirus) bu dosyayi acik tutuyorsa eski kaldirici onu tasiyamiyor, dosyalari geri koyup 2
; koduyla cikiyor; varsayilan davranis "Failed to uninstall old application files" deyip kurulumu
; birakmak.
;
; Yeni surumde app.asar yok (uygulama resources\app klasorunde). Ama eski app.asar yerinde kalirsa
; Electron onu resources\app'ten once yukluyor: uygulama eski surumle aciliyor, guncellemeyi yeniden
; indirip kapaniyor ve bu boyle surup gidiyor. Bu yuzden eski app.asar siliniyor; silinemiyorsa
; (kilitli) yeni surum yandaki klasore ("<klasor> 2") kuruluyor, kisayollar ve kayit oraya donuyor.

; Kaldirici derlemesinde kullanilmiyor (kullanilmayan degisken uyarisi hata sayiliyor).
!ifndef BUILD_UNINSTALLER
  Var s97Relocated
!endif

!macro customUnInstallCheck
  ClearErrors
  ${if} ${FileExists} "$INSTDIR\resources\app.asar"
    Delete "$INSTDIR\resources\app.asar"
    ${if} ${FileExists} "$INSTDIR\resources\app.asar"
      ; Kilitli: eski klasorden silinebilen her sey siliniyor, kurulum yandaki klasore.
      RMDir /r "$INSTDIR"
      StrCpy $INSTDIR "$INSTDIR 2"
      StrCpy $appExe "$INSTDIR\${APP_EXECUTABLE_FILENAME}"
      StrCpy $s97Relocated "true"
    ${endif}
  ${endif}
  ClearErrors
!macroend

!macro customUnInstallCheckCurrentUser
  ClearErrors
!macroend

!macro customInstall
  ${if} $s97Relocated == "true"
    ; Korunan kisayollar eski klasoru gosteriyor: yeni yere yeniden olusturuluyor.
    CreateShortCut "$newStartMenuLink" "$appExe" "" "$appExe" 0 "" "" "${APP_DESCRIPTION}"
    WinShell::SetLnkAUMI "$newStartMenuLink" "${APP_ID}"
    ${if} ${FileExists} "$newDesktopLink"
      CreateShortCut "$newDesktopLink" "$appExe" "" "$appExe" 0 "" "" "${APP_DESCRIPTION}"
      WinShell::SetLnkAUMI "$newDesktopLink" "${APP_ID}"
    ${endif}
    StrCpy $launchLink "$appExe"
  ${else}
    ; Daha once yan klasore tasinmis kurulum: eski klasordeki artik dosya serbest kaldiysa temizleniyor.
    ; Yalniz bilinen artik dosya ve bos klasorler siliniyor (RMDir ozyinelemesiz).
    StrCpy $0 $INSTDIR "" -2
    ${if} $0 == " 2"
      StrCpy $0 $INSTDIR -2
      Delete "$0\resources\app.asar"
      RMDir "$0\resources"
      RMDir "$0"
    ${endif}
  ${endif}
  ClearErrors
!macroend
