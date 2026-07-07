## Ne değişti?

<!-- Kısaca ne yaptığını ve neden gerektiğini anlat. -->

## İlgili issue

<!-- ör. Fixes #12 -->

## Nasıl doğrulandı?

<!-- Hangi senaryoyu denedin? Aşağıdakiler geçiyor mu? -->

- [ ] `npx tsc --noEmit -p tsconfig.json` temiz
- [ ] `node esbuild.js --production` başarılı
- [ ] `node --check media/main.js` temiz (webview değiştiyse)
- [ ] Elle test edildi (Extension Development Host / kurulu `.vsix`)

## Kontrol listesi

- [ ] Branch özelliğe göre adlandırıldı (`feat/…`, `fix/…`)
- [ ] Çevredeki kod stiline uyuldu; gereksiz yorum eklenmedi
- [ ] Güvenlik değişmezleri (bkz. CONTRIBUTING) zayıflatılmadı
- [ ] İç/geçici dosyalar (ROADMAP, e2e, build çıktıları) commit'e dahil edilmedi
