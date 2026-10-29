# Altyazı düzeltmeleri — V21

Bu sürüm, Türkçe çeviri kaynağı seçimiyle başlayan düzeltmeleri; ekran sınırları, film/dizi tarzı toplu gösterim ve manuel dil seçimiyle birlikte içerir. Değişiklikler mevcut TizenTube kaynaklarının üzerine eklenmiştir.

## Biriken değişiklikler

- **Kaynak seçimi:** Otomatik dublaja ait altyazının Türkçe çeviriye kaynak olmasını önleyen deneysel koruma eklendi. Uygun özgün otomatik altyazı tek ve kesin olarak belirlenebildiğinde onun tam, imzalı adresi kullanılır. Belirsiz eşleşmelerde istek değiştirilmez. Koruma kaynak kodunda tanılama moduyla başlar; yeniden yazma `ttCaptionSourceGuard=rewrite` seçimiyle etkinleşir.
- **Ekran sınırları:** Alt bölümdeki yatay altyazılar simetrik bir güvenli alana alınır. Uzun satırlar bu alan içinde kırılır; yazı boyutu ve oynatıcının ölçümleri dikkate alınır. Üstte konumlandırılmış veya dikey altyazı pencereleri bu düzenlemenin dışında kalır.
- **Film/dizi tarzı gösterim:** Desteklenen, kelimeleri sonradan eklenen JSON3 altyazılar, tüm metni birlikte beliren ve gösterim boyunca sabit kalan parçalara dönüştürülür. Cümleler, duraklamalar ve konuşmacı geçişleri dikkate alınır; parçalar ortalanır ve en fazla iki satıra sığdırılır. Metin uzunluğuna göre okuma süresi hedeflenir; boşluklardan ve sınırlı zaman kaydırmasından yararlanılır. Metin özetlenmez.
- **Tüm diller:** Bu dönüşüm otomatik Türkçe çeviriyle sınırlı değildir; desteklenen özgün ve diğer dildeki altyazılarda da çalışır. Zaten tamamı birlikte gösterilen altyazıların metni ve zamanlaması yeniden oluşturulmaz. Güvenle dönüştürülemeyen biçimler oynatıcının kendi gösterimine bırakılır.
- **V21 dil seçimi:** Menüden seçilen özgün dil veya başka çeviri, dil değişimi sırasındaki geçici altyazı kapanması nedeniyle Türkçeye geri dönmez. CC düğmesiyle gerçekten kapatılıp yeniden açıldığında Türkçe otomatik seçilir: uygun doğrudan Türkçe altyazı varsa o, yoksa uygun kaynağın Türkçe çevirisi kullanılır. Kapalı CC kendiliğinden açılmaz. Eksik video bilgisi, reklam ve aynı videodaki oynatıcı değişimleri manuel seçimi sıfırlamaz.

## Doğrulama ve sınırlar

- 123 kaynak testi geçti. Buna dil değişimi, CC açma/kapatma, geçici boş yanıtlar, reklam ve oynatıcı değişimi kontrolleri dahildir.
- Yakalanmış YouTube TV API koduyla yapılan 19 tarayıcı kontrolü geçti. Bu kontrollerde ana uygulama, yükleme ve ağ/gösterim bağımlılıklarının bir bölümü taklit edildi; tam video oynatımı sınanmadı.
- Özgün İngilizce örnek, gerçek altyazı gösterici koduyla çevrimdışı olarak 720p, 1080p ve 4K'da; %100 ve %150 yazı boyutlarında denetlendi. Örneklenen metinlerin sabitliği, ortalanması, iki satır sınırı ve ekran sınırları doğrulandı.
- Android 11 emülatöründe V20 üzerine V21 güncellemesi, sürüm kontrolü, uygulamanın açılması ve gömülü kodun yüklenmesi başarılı oldu. APK imzası ve bütünlüğü doğrulandı.

Fiziksel TV'de V21 ve gerçek video üzerindeki altyazı görünümü henüz sınanmadı. Çok hızlı konuşmalarda metni eksiltmeden hem rahat okuma süresini hem konuşmayla tam eşzamanı sağlamak her zaman mümkün değildir. Geçici kapanmayı ayırt eden kontrol, yakalanmış oynatıcıdaki aynı işlem içinde tamamlanan dil değiştirme davranışına dayanır; farklı veya gelecekteki oynatıcı davranışları ek inceleme gerektirebilir.

## APK

Dosya: `TizenTube-Altyazi-Sinema-v21.apk`  
Sürüm: `2.0.3-caption-test.21` — sürüm kodu `20321`

SHA-256:

```text
0ed86772dad17f33859eb2732ebbefc9289637f9dadca414aa600c17b6fb31e6
```
