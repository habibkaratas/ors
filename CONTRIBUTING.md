# Katkı Rehberi

Örs'e katkıda bulunmak istediğin için teşekkürler. Örs **yerel-öncelikli** bir
kodlama asistanıdır; katkılar bu felsefeyi (bulut zorlaması yok, kilitlenme yok,
şeffaf onay) korumalıdır.

## Başlamadan önce

- Büyük bir değişiklik veya yeni özellik için **önce bir issue aç** ve yaklaşımı
  konuşalım. Böylece boşa emek harcanmaz.
- Küçük düzeltmeler (typo, net bug) için doğrudan PR açabilirsin.

## Geliştirme ortamı

```bash
npm install
npm run compile     # geliştirme derlemesi (sourcemap)
npm run watch       # değişiklikleri izle + otomatik yeniden derleme
```

VSCode'da klasörü aç, **F5** → Extension Development Host penceresi açılır.
Ön koşul: yerelde bir **Ollama** sunucusu çalışıyor olmalı (bkz. README).

Paketleme:

```bash
npm run package     # kök dizinde ors.vsix üretir
```

## Branch ve PR akışı

1. Repo'yu **fork**'la.
2. Değişikliğin için bir dal aç — **özelliğe göre**, katmana göre değil:
   - `feat/kisa-aciklama` — yeni özellik
   - `fix/kisa-aciklama` — hata düzeltmesi
   - `docs/…`, `refactor/…`, `chore/…`
   > Bir değişiklik genelde birçok `src/` katmanına dokunur (ör. bir özellik
   > `webview/` + `shared/` + `tools/`). Bu normaldir; branch'i özelliğe göre tut.
3. `master`'a karşı **PR** aç. PR şablonunu doldur.
4. **CI** (tsc + build) yeşil olmalı. Maintainer inceleyip **squash-merge** eder.

`master` korumalıdır: doğrudan push ve force-push kapalıdır; her şey PR'dan geçer.

## Kod standartları

- **Çevredeki kodun stiline uy** — adlandırma, yoğunluk, dil.
- **Gereksiz yorum yazma.** Yalnızca koddan anlaşılmayan "neden"i açıkla; "ne yaptığını"
  tekrar eden yorumlar eklenmez.
- Değişikliğin öncesinde şunlar geçmeli:
  ```bash
  npx tsc --noEmit -p tsconfig.json
  node esbuild.js --production
  node --check media/main.js
  ```

## Güvenlik değişmezleri (zayıflatılamaz)

Aşağıdakiler bilinçli güvenlik önlemleridir; bir PR bunları gevşetemez:

- Komut-enjeksiyon deseni: `/[;|`]|\$\(|&&|\|\|/`
- Yol hapsi / symlink-kaçış koruması (`resolvePath`, `realpathSync`)
- Onay kapısı (yazma ve komutlar önizleme + onaydan geçer)
- `buildSafeEnv()` ile alt-süreçlerden sırların ayıklanması
- Araç kategorileri: kod çalıştıran araç `read` olarak etiketlenmez

Güvenlikle ilgili bir açığı sorumlu şekilde bildirmek istersen, herkese açık issue
yerine maintainer ile özel iletişime geç.

## Commit'lenmeyecekler

`.gitignore` kapsamındaki iç/geçici dosyalar commit edilmez: `node_modules/`,
`out/`, `e2e/` (test scriptleri), `ROADMAP.md` ve benzeri çalışma/plan dosyaları.

## Lisans

Katkı göndererek, katkının projenin **MIT** lisansı altında yayımlanacağını kabul
etmiş olursun.
