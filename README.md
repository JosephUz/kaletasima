# Kale Taşıma — Demo5 / 0.3

Üç katlı kaleler, saklı hazineler ve altın ağacının çevresinde dövüş.

## Açılış

Docker Desktop açıkken **Baslat.cmd** dosyasına çift tıkla. Oyun **http://localhost:5185** adresindedir.

```sh
docker compose up -d --build
docker compose ps
docker compose logs --tail 50
```

Konteyner adı `kale-tasima`; otomatik yeniden başlatma ve `/health` sağlık kontrolü vardır. Port yalnız bu bilgisayara açılır. Docker olmadan geliştirme: `npm ci` ardından `npm start` (aynı porttaki konteyneri önce durdur).

## Modlar

- **Tek başına:** sen ve 4 rakip bot, 5 kale.
- **Co-op:** 5 maviye karşı 5 kırmızı. İnsanlar mavi takımdaki boş koltuklara geçer; diğer koltuklar bottur.
- **PvP:** 5 maviye karşı 5 kırmızı. İki takımın boş koltuklarına da oturulur. Kaça kaç seçimi yoktur.
- On kişilik modlarda daha geniş bir çember vardır; mavi ve kırmızı kaleler dönüşümlü dizilir. Bütün kapılar merkeze bakar.

Oda sahibi maçı başlatır. Oda kodu veya katılma linkiyle girilir; maç devam ederken boş koltuğa katılmak da mümkündür. Kopan oyuncuyu bot devralır; 60 saniye içinde aynı sekmeden yeniden bağlanırsa koltuğuna döner. Oda sahibi ayrılırsa yetki diğer bağlı oyuncuya geçer. Maç sonunda sahibi yeni maç için lobiye dönebilir.

## Kurallar

- Solo: kalende **10 eşya** biriktirip **60 saniye** koru. Co-op/PvP: **takım toplamı 20 eşya** ve 60 saniye.
- Eşya sayısı hedefin (solo 10, takım 20) altına düşerse sayaç sıfırlanır. Son savunma sırasında liderin / lider takımın kapıları açık kalır; kapıyı kilitleyip risksiz beklemek mümkün değildir.
- Her kalede 3 kat, her katta 4 oda vardır. Eşyayı kendi kalende seçtiğin odada bırak; koridora bırakmak puan kazandırmaz.
- Eşyaları ve rakipleri yalnız aynı odada/katta görürsün. Üst katlar saydam, diğer odalar siliktir. Kamera ile karakter arasına giren kale dışarıdayken de saydamlaşır.
- Mini harita yoktur. Sis ve görüş mesafesi sınırı yoktur; merkezden kaleler görünür. Sağ üstte eşya sıralaması, sağ altta kendi kale bilgisi kalır.
- Yeni altın yalnız ortadaki **altın ağacına sopa vurulunca** çıkar. Başlangıçta veya zamanla yere rastgele altın doğmaz. Vuruş başına 2 altın; yere düşmüş altın sayısı sınırlıdır.
- Dışarıdaki sopa darbesi rakibin mevcut altınlarından en fazla 3 tanesini düşürür. **Kale sahibi kendi kalesindeyken altın düşürmez.** Takım arkadaşları birbirine zarar vermez.
- **Zıplarken sopa ve fırlatılan sopa isabetleri etkisizdir.** Havadayken Boşluk'a tekrar basarak ikinci kez zıplayabilirsin. İkinci basış yükselişi yeniden başlatır; üçüncü zıplama yoktur. Yere inince hakların yenilenir.
- Sopa fırlat sersemletir, eldeki eşyayı düşürür ve geri döner. Hazırlanma göstergesi karakterin üstündedir, hazır olunca kaybolur.
- Kapı sahibi dışarıdayken veya sersemken açıktır. G ile açık tutulabilir. Kapalı kalede mahsur kalan rakip en geç 25 saniye sonra eşyasını bırakarak kendi kalesine döner.
- Botlar güçlü rakibi ve kazanma sayacı başlayan takımı hedefler; odaları arar, ağaçtan altın çıkarır, eşya satın alır, kaçan taşıyıcıya fırlatılan sopa atar ve tehditlerden zıplayarak kaçınır.

## Kısayollar

| Tuş | İşlev |
|---|---|
| WASD / oklar | Kameraya göre hareket |
| Shift | Koş |
| Boşluk, havadayken tekrar Boşluk | Zıpla / çift zıpla |
| Sol tık / F | Sopa; altın ağacına vur |
| Sağ tık / Q | Sopa fırlat |
| E | Eşyayı al / bırak / odada sakla |
| B | Kendi kalende 15 altına eşya |
| G | Kendi kapını açık tut / otomatik korumaya al |
| 1 / 2 / 3 | Arka koridordaki tek merdivende kat seç |
| V | İzometrik / omuz üstü kamera |
| Tab | Omuz kamerasında fareyi bırak / kilitle |
| Tekerlek | İzometrik yakınlık |
| F1 / Esc | Kısayollar / menü |

Merdivenin yanında kat düğmeleri de görünür. Menüde grafik ve ses ayarı vardır. Çevrim içi maç menü açıkken devam eder.

## Uygulama ve doğrulama

`sim.js` kurallar ve botlar; `castle.js` döndürülmüş kale geometrisi, yollar ve görüş; `view.js` Three.js görüntüsü; `main.js` ekranlar ve girdi; `rooms.mjs` yetkili oda sunucusu; `net.js` istemci bağlantısı.

Sunucu 30 Hz simülasyon, 15 Hz kişiye göre filtrelenmiş durum gönderir. Görüş dışındaki rakip konumları, eşyalar ve kapı durumları gönderilmez. İstemci ara değerlerle hareketi yumuşatır. Görüş dışındaki kale modelleri çizilmez; geometri/malzeme paylaşımı, yeniden kullanılan nişan geometrisi, sınırlı piksel oranı, grafik ayarları ve düşük kare hızında otomatik kalite azaltma kullanılır.

```sh
npm test
node tests/network-smoke.mjs
node tests/browser-smoke.mjs
```

Son iki test çalışan sunucu ister. Tarayıcı testi Chrome ve Playwright kullanır; `PLAYWRIGHT_MODULE` ile kurulu Playwright modülünün file URL'si verilebilir. Ağ testi 10 gerçek WebSocket istemcisi, koltuk doluluğu, yeniden bağlanma ve yetki devrini kontrol eder. Tarayıcı testi iki bağımsız oturumla modları ve oynanışı doğrular. Ekran görüntüleri `artifacts/` içine yazılır. Çok oyunculu internet gecikmesi ve insanlarla oyun dengesi bu yerel kontrollerin kapsamı dışındadır.

Three.js MIT lisansı `vendor/THREE-LICENSE.txt` içindedir. Görseller ve sesler prosedürel üretilir.

- Sıralama eşya sayısı ve eldeki altını gösterir. Görülen 30+ altınlı rakipler botların yağma hedefidir.
- Sersemleme 10 saniyedir; süre bitince oyuncu kendi kalesinin zemin katında ayılır, taşıdığı eşya vurulduğu yerde kalır. Ardından 2,5 saniye yeniden sersemleme koruması vardır. Sersemken sopa kullanılabilir ve başlamış savuruş iptal olmaz. Botlar sopadan kusursuz zıplamaz; dövüş kararları 220–400 ms aralıklıdır.
- Her kale iki eşya ile başlar; takımlı maçta başlangıç toplamı takım başına 10 eşyadır.

- Kalene rakip girdiğinde ekran kenarları kırmızı yanıp söner. Son rakip çıkınca uyarı kapanır; dost oyuncular alarmı tetiklemez. Çevrim içi maçta uzakta olsan da kendi kalenin alarmını alırsın.

- Kale içindeki davetsize sopa isabeti, altını olmasa bile 3 altın düşürür; bakiyesi sıfırın altına inmez. Bu altınları yalnız kale sahibi ve takım arkadaşları toplayabilir. Kale sahibi kendi kalesinde altın düşürmez. Dışarıda yalnız mevcut altın çalınır.

- Sağ tık / Q eldeki tek sopayı fırlatır. Sopa isabette, duvarda veya menzil sonunda kaybolur; geri dönmez ve süreyle yenilenmez. Silahsızken kendi kale kapısının dışındaki kasaya yaklaş ve E ile ücretsiz yeni sopa al. Botlar da kasaya dönmek zorundadır. Kalede ayılmak sopa vermez.

- Sis ve uzaklık temelli görünürlük sınırı kaldırıldı. Tüm kaleler ve açık alandaki oyuncular/eşyalar uzaklık sınırı olmadan görünür. Kale odası ve kat gizliliği korunur.

- Sopa fırlatma menzili 24 birimdir. Botlar gelen sopaya 350–550 ms sonra, her sopa için tek seferde %35 olasılıkla zıplamayı dener.

- Başarılı sersemletmede 5 altın düşer; mevcut bakiyeden düşülür, eksik tutar üretilir ve bakiye eksiye inmez. Kendi kalesindeki sahibin koruması ve kale altınlarının yalnız kale takımınca toplanması devam eder.
