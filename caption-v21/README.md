# TizenTube — Okan altyazı düzeltmeleri (V21)

Bu klasör, özgün TizenTube kaynaklarıyla birlikte bu çalışmada yapılan tüm birikimli altyazı ve Android paketleme değişikliklerini saklar. Temel kaynak: [reisxd/TizenTube](https://github.com/reisxd/TizenTube), `f99945a84ff767bf14ad8c1146e8e3fd49a3d628`. Android tabanı: [TizenTubeCobalt v2.0.3](https://github.com/reisxd/TizenTubeCobalt/releases/tag/v2.0.3).

- Türkçe çeviri kaynağı koruması, güvenli ekran sınırları ve ortalı gösterim.
- Desteklenen bütün dillerde kelime eklenmesi yerine film/dizi tarzı sabit altyazı parçaları.
- CC düğmesiyle açınca otomatik Türkçe; menüden başka dil seçince seçimin korunması.
- Android'de yerel betik yükleme yardımcısı ve önceki paketleme düzeltmelerinin kaynakları.

[Tüm değişiklikler ve sınırlar](docs/caption-fixes.md) · [V21 sürüm notları](release/v21/RELEASE_NOTES.md) · [Doğrulama sonuçları](release/v21/validation.json) · [Android kaynakları ve derleme bilgisi](android-caption/README.md)

## Kaynak kodunu çalıştırma

Node.js ve npm kurulu bir ortamda:

```sh
cd mods
npm ci
npm run build
cd ..
node --test tests/*.test.mjs
```

Test edilen V21 paketinin tam JavaScript dosyası `release/v21/userScript.js` içindedir. 123 kaynak testi, yakalanmış oynatıcı API koduyla 19 tarayıcı kontrolü ve Android 11 emülatöründe güncelleme/açılış kontrolü geçti. Fiziksel TV'de V21 ve gerçek video altyazı görünümü henüz doğrulanmadı. İlgili testlerin taklit edilen bağımlılıkları ve sınırlamaları sürüm notlarında belirtilmiştir.

## APK ve bütünlük

Son test paketi: `TizenTube-Altyazi-Sinema-v21.apk` (`2.0.3-caption-test.21`, sürüm kodu `20321`). APK bu kaynak kodu yüklemesine dahil değildir. Yayımlanan sürüm ekleri için [Releases](https://github.com/okanakgul05/TizenTubeCobalt2/releases) bölümüne bakın.

SHA-256: `0ed86772dad17f33859eb2732ebbefc9289637f9dadca414aa600c17b6fb31e6`.

İmza anahtarı, parolalar, oturum bilgileri ve geçici cihaz verileri bu depoya dahil değildir. Başka imza anahtarıyla oluşturulan bir APK, mevcut kurulumun üzerine güncelleme olarak kurulamaz. Android araçlarının kapsamı ve yeniden paketleme sınırları `android-caption/README.md` içinde açıklanır.

Özgün Tizen sürüm iş akışı, bu depoda otomatik çalıştırılmadan `docs/upstream-build-release.yaml` içinde korunmuştur. Projenin özgün lisansı ve katkı bilgileri aşağıdadır.

---

# ▶️ TizenTube
<p align="center">
    <img width="600px" src=".github/assets/TizenTube Standalone Banner.png">
    <br>
    <sub> TizenTube logo, banner and README by <a href="https://github.com/Zyborg777">@Zyborg777</a> </sub>
</p>

**TizenTube** is a TizenBrew module that enhances your favourite streaming websites viewing experience by removing ads and adding support for Sponsorblock. **Now works as a standalone app!**

** **
🤖 **Looking for an app for Android TVs?** Check out [TizenTube Cobalt](https://github.com/reisxd/TizenTubeCobalt). It offers everything TizenTube has for Android TVs.


<p align="left">
    <a href="https://github.com/reisxd/TizenTubeCobalt/releases/latest">
        <picture>
            <img width="250px"
                src=".github/assets/TizenTube_Cobalt_dl-button.png" />
        </picture>
    </a>
</p>

## ❓ How to install

Follow the guide in the [Installation Guide](./docs/README.md).

## ✨ Features
- 📺 **Picture-in-Picture Mode**
- 🛑 **Ad Blocker**: Enjoy your favourite streaming website without interruptions from ads.
- ❗ **SponsorBlock Support**: Automatically skip sponsored segments in videos.
- ⏭️ **Video Speed Control**: Adjust playback speed to your preference.
- 🔺 **[DeArrow](https://dearrow.ajay.app/) Support**: Remove clickbait and misleading video titles.
- ➕ **More to come!** Request features via [issues](https://github.com/reisxd/TizenTube/issues/new).

## 🌐 Community and Support 
| Links |
| ------------- |
| [r/TizenTube Subreddit](https://www.reddit.com/r/TizenTube/)  |
| [Discord Server](https://discord.gg/m2P7v8Y2qR)  | 
| [Telegram](https://t.me/tizentubeofficial)  |
| [Matrix Space](https://matrix.to/#/!BLE5ubNYktI30e8K0j:matrix.6513006.xyz)  |
| [Report Issues / Request Features](https://github.com/reisxd/TizenTube/issues)  |
