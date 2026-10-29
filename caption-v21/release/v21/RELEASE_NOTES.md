# TizenTube Altyazı Sinema V21

V21, altyazıyı menüden başka bir dile geçirince Türkçeye geri dönmesi sorununu düzeltir. Dil seçimi sırasındaki geçici kapanma ile CC düğmesinin gerçekten kapatılması ayrılır. Manuel dil seçimi korunur; CC düğmesiyle yeniden açıldığında uygun Türkçe altyazı veya Türkçe otomatik çeviri seçilir. Kapalı altyazı kendiliğinden açılmaz.

Sürüm, önceki düzeltmeleri de içerir: Türkçe çeviri için kaynak koruması, yatay altyazılarda güvenli ekran alanı, desteklenen JSON3 altyazılarda kelime eklenmesi yerine sabit ve ortalı parçalar, iki satır sınırı ve metnin uzunluğunu dikkate alan okuma süresi. Bu gösterim desteklenen özgün ve çevrilmiş altyazılarda tüm dillere uygulanır. Kaynak kodundaki deneysel kaynak koruması tanılama moduyla başlar; yeniden yazma ayrıca etkinleştirilir. Ayrıntılar `docs/caption-fixes.md` içindedir.

## Doğrulama

- 123 kaynak testi geçti.
- Yakalanmış oynatıcı API koduyla 19 tarayıcı kontrolü geçti. Ana uygulama yaşam döngüsü ile ağ/gösterim bağımlılıkları kısmen taklit edildi.
- Android 11 emülatöründe V20 üzerine güncelleme, sürüm kontrolü, açılış ve gömülü kodun hazır olması doğrulandı.
- APK bütünlüğü, hizalama, V2/V3 imzaları ve önceki sürümle aynı imza kimliği doğrulandı. APK içindeki JavaScript, yayımlanacak `userScript.js` ile birebir aynı.

V21 fiziksel TV'de ve gerçek video altyazı görünümüyle henüz sınanmadı. Desteklenmeyen altyazı biçimleri kendi gösterimine bırakılır. Çok hızlı konuşmalarda metni eksiltmeden her parçayı rahat okuma süresince göstermek her zaman mümkün değildir.

## Dosyalar

APK: `TizenTube-Altyazi-Sinema-v21.apk`  
Sürüm: `2.0.3-caption-test.21` — `20321`  
Paket: `io.github.captiontest.tizentube`

`SHA256SUMS`, APK ve JavaScript dağıtım dosyasının özetlerini içerir. `validation.json`, sürüm ve paket doğrulamasını; değişen üretim kaynakları ile testlerin SHA-256 değerlerini içerir. Ham kaynak özetleri test edilen dosya baytlarına aittir; ayrıca Git satır sonu dönüşümleri için LF biçimine çevrilmiş özetler verilir. Diğer JSON dosyaları test ve emülatör sonuçlarının yerel dizinler ve ham kayıtlar çıkarılmış özetleridir.
