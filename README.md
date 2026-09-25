# Kale Taşıma — 0.4

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
- **Oda kur:** 5 maviye karşı 5 kırmızı, 10 koltuk. Mod seçilmez; oyuncular istedikleri koltuğa oturur, boş koltuklar bottur.
  Oyuncuların hepsi aynı takımdaysa **Co-op** (botlara karşı birlikte), iki takımda da oyuncu varsa **PvP** olur. Lobide o
  anki mod görünür; maç sürerken karşı takıma katılan olursa maç PvP'ye döner. Kaça kaç seçimi yoktur.
- On kişilik modlarda daha geniş bir çember vardır; mavi ve kırmızı kaleler dönüşümlü dizilir. Bütün kapılar merkeze bakar.

**Bot zorluğu** giriş ekranında seçilir (Kolay / Normal / Zor, varsayılan Normal; tarayıcı hatırlar). Çevrim içi odada oda kuranın seçimi geçerlidir ve lobide görünür.

- Kolay ve Normal: botlar eşyalarını (başlangıç, satın alınan, taşınan) hep 1. kata koyar.
- Zor: botlar eşyalarını üç kata dağıtır; botun altın ağacı vuruşu 2 yerine 4 altın düşürür (oyuncular için 2).

Oda sahibi maçı başlatır. Oda kodu veya katılma linkiyle girilir; maç devam ederken boş koltuğa katılmak da mümkündür. Kopan oyuncuyu bot devralır; 60 saniye içinde aynı sekmeden yeniden bağlanırsa koltuğuna döner. Oda sahibi ayrılırsa yetki diğer bağlı oyuncuya geçer. Maç sonunda sahibi yeni maç için lobiye dönebilir.

## Telefon ve Android

**Dokunmatik** (telefon, tablet, uygulama; masaüstünde `?touch`): dokunmatik ekran algılanınca açılır, ekran yataydır (dik tutunca "yan çevir" uyarısı). Sol yarıda parmağın değdiği yerde **joystick** belirir, sonuna kadar itmek koşudur; sağ yarıda parmak kaydırmak kamerayı çevirir. Telefonda **izometrik** kamerayla başlar (yukarıdan eğik, oyuncu ortada; kale içindeyken üst katlar ve duvarlar silikleşir): VUR / FIRLAT aynı kattaki en yakın rakibe, yoksa baktığın yöne nişan alır. Üstteki **🎥** omuz üstüne geçirir (artıyla nişan; seçim hatırlanır); masaüstünde omuz üstüyle başlar, **V** ya da 🎥 ile geçilir. Ayarlar `ISO` (config.js). Sağ altta **VUR** (basılı tutunca vurmaya devam eder), **FIRLAT**, **TAŞI** (yakında alınacak eşya varken parlar) ve **ZIPLA**; Eşya al ve kat düğmeleri ekrandakilerdir. Skor tablosu Skor düğmesiyle açılır. Kod: `src/touch.js` (joystick, düğmeler), `src/input.js` (eşleme), `src/platform.js`. Test: `node tests/touch-smoke.mjs` (telefon taklidi, `GAME_URL`).

**Çok oyunculu anahtarı**: `src/config.js` → `ONLINE = { web, app }`: tarayıcıda (`web`) ve Android uygulamasında (`app`) oda kur / odaya katıl açık mı. Uygulamada kapalı: sunucuya hiç bağlanılmaz, oda düğmelerinde **YAKINDA** yazar, tek başına oyun aynen oynanır. Tarayıcıda `?app` ile uygulama kipi denenir.

**Android APK (Android Studio gerekmez)**: JDK 21 ve Android SDK komut satırı araçları `%USERPROFILE%\android` altında taşınabilir kurulu (başka yerdeyse `JAVA_HOME` / `ANDROID_HOME`). `npm run apk` oyun dosyalarını `dist/`e toplar, Capacitor ile `android/` projesine kopyalar, Gradle ile derler: telefona kurulacak imzalı **`apk/KaleTasima.apk`**, Play Store için `apk/KaleTasima.aab`, incelemek için `apk/KaleTasima-debug.apk`. USB hata ayıklama açık telefona doğrudan kurmak için `npm run apk -- --install`. Uygulama (`com.josephuz.kaletasima`) oyunu kendi içinden açar (internetsiz oynanır), yatay ve tam ekrandır, Android geri tuşu menü / geri olur. Yayın anahtarı `android/*-release.jks`, şifresi `android/keystore.properties` (git'e girmez; **yedeklenmeli**). Simge ve açılış görseli `node scripts/icons.mjs`; Play Store görselleri `store/`.

## Kurallar

- Solo: kalende **10 eşya** biriktirip **60 saniye** koru. Co-op/PvP: **takım toplamı 50 eşya** ve 60 saniye.
- Eşya sayısı hedefin (solo 10, takım 50) altına düşerse sayaç sıfırlanır. Kale kapıları hep açıktır ve hiç kilitlenmez; herkes her an başka kaleye girebilir. Kapıda bekleyen sahip içeri gireni sıkıştırır ama arkasını da kollamalıdır.
- Kale 21×24 birimdir ve 3 katlıdır; her kat tek büyük salondur (oda yok). Eşyayı kendi kalende istediğin katta istediğin yere bırakabilirsin; kale dışına bırakılan eşya puan sayılmaz. Salonda zıplama ve sopa dövüşü yapılabilir.
- Kale içindeyken dışarısı (açık alan) görünür; kale içindeki eşyaları ve rakipleri yalnız aynı kattayken görürsün. Üst katlar saydamdır. Kamera ile karakter arasına giren kale dışarıdayken de saydamlaşır.
- Mini harita yoktur. Sis ve görüş mesafesi sınırı yoktur; merkezden kaleler görünür. Sağ üstte eşya sıralaması, sağ altta kendi kale bilgisi kalır.
- Yeni altın yalnız ortadaki **altın ağacına sopa vurulunca** çıkar. Başlangıçta veya zamanla yere rastgele altın doğmaz. Vuruş başına 2 altın; yere düşmüş altın sayısı sınırlıdır.
- Herkesin **3 canı** vardır. Sopa darbesi hiçbir yerde altın düşürmez, 1 can götürür. Can 0 olunca oyuncu **bayılır** (taşıdığı eşya vurulduğu yerde kalır); bayılma bitince kendi kalesinin zemin katında canı dolu ve elinde sopayla doğar. Bu sürede kalesi korumasızdır. Takım arkadaşları birbirine zarar vermez.
- Baygın oyuncuya vurulan her sopa can götürmez, bayılmayı 1 saniye uzatır. Bir bayılma toplamda en çok **30 saniye** sürer (sahibi baygınken kale korumasızdır).
- **Zıplarken sopa ve fırlatılan sopa isabetleri etkisizdir.** Havadayken Boşluk'a tekrar basarak ikinci kez zıplayabilirsin. İkinci basış yükselişi yeniden başlatır; üçüncü zıplama yoktur. Yere inince hakların yenilenir.
- Fırlatılan sopa can götürmez; bayıltır ve eldeki eşyayı düşürür. Hazırlanma göstergesi karakterin üstündedir, hazır olunca kaybolur.
- Bayılıp ya da canı bitip kalesinde doğan oyuncu her zaman elinde sopayla doğar.
- Botlar güçlü rakibi ve kazanma sayacı başlayan takımı hedefler; katları arar, ağaçtan altın çıkarır, eşya satın alır, kaçan taşıyıcıya fırlatılan sopa atar ve tehditlerden zıplayarak kaçınır. Baygın rakibe sopa fırlatmazlar. Bir rakibe (kalesine, kendisine ya da kalesindeki eşyaya) bir bot yöneldiyse başka bot o rakibi seçmez; botlar tek yere çullanmaz. Kazanma geri sayımı yokken meydana (kale dışına) düşmüş eşyaya öncelik verirler. Sürekli eşya çalmazlar: her bot kendi sırasıyla ara sıra 8–12 sn ağaçtan altın çıkarır, sonra 15–30 sn başka işe döner (geri sayımda ağaç zamanı yoktur).

## Kısayollar

| Tuş | İşlev |
|---|---|
| WASD / oklar | Kameraya göre hareket |
| Shift | Koş |
| Boşluk, havadayken tekrar Boşluk | Zıpla / çift zıpla |
| Sol tık / F | Sopa; altın ağacına vur, rakibin canını götür |
| Sağ tık / Q | Sopa fırlat |
| E | Eşyayı al / bırak / odada sakla |
| B | Kendi kalende 15 altına eşya |
| 1 / 2 / 3 | Salonun arkasındaki tek merdivende kat seç (0,8 sn tırmanma: karakter ve kamera kata kayar, "↑ 2. KAT" yazısı çıkar; bu sırada yürünmez) |
| Tab | Omuz kamerasında fareyi bırak / kilitle |
| F1 / Esc | Kısayollar / menü |

Merdivenin yanında kat düğmeleri de görünür. Menüde grafik ve ses ayarı vardır. Çevrim içi maç menü açıkken devam eder.

## Uygulama ve doğrulama

Dosya düzeni Çayır Muhafızı ile aynıdır: kökte `index.html`, `style.css`, `game.js` (giriş noktası) ve `server.mjs`; sunucu odaları `server/`, oyun kodu `src/` altındadır. three.js npm paketinden (`node_modules/three/build`) `/vendor/` yolundan sunulur; sunucu bunlar dışında hiçbir dosyayı vermez.

| Dosya | İçerik |
| --- | --- |
| `src/config.js` | Kurallar (`RULES`), kale ölçüleri (`CASTLE`), zorluklar, renkler, adlar |
| `src/castle.js` | Kale geometrisi: yerel/dünya koordinatı, duvarlar ve çarpışma, görüş, merdiven, rota |
| `src/rules.js` | Ortak yardımcılar: mesafe, kale içi, skor, kale alarmı, olay kuyruğu |
| `src/items.js` | Eşya, altın, sopa kasaları, E ile al / bırak / sakla, satın alma, altın ağacı |
| `src/combat.js` | Sopa (can), fırlatılan sopa (bayıltır), zıplama, bayılma ve kalede doğma |
| `src/ai.js` | Botlar: hedef seçimi, hedef paylaşımı, yürüme, dövüş ve kaçınma |
| `src/world.js` | Dünya kurulumu, oyuncu girdisi, simülasyon adımı (hareket, altın toplama, kazanma) |
| `src/net/snapshot.js` | Sunucu paketleri: oyuncuya yalnız gördüğü durum, girdi sınırlama |
| `src/net/client.js` | Tarayıcı bağlantısı, yeniden bağlanma |
| `src/view/gameview.js` | Three.js sahnesi, omuz üstü kamera, çizim |
| `src/view/models.js`, `effects.js` | Arena / kale / karakter / eşya modelleri; parçacık ve uçan yazılar |
| `src/main.js` | İstemci uygulaması: tek başına ve çevrim içi döngü |
| `src/input.js`, `ui.js`, `screens.js` | Girdi ve fare kilidi; oyun içi arayüz; menüler, lobi, maç karnesi |
| `server/rooms.mjs` | Odalar ve lobi, 30 Hz otoriter simülasyon |

Simülasyon (`world.js` ve bağımlıları) hem tarayıcıda (tek başına) hem sunucuda (çevrim içi) aynen koşar.

Sunucu 30 Hz simülasyon, 15 Hz kişiye göre filtrelenmiş durum gönderir. Görüş dışındaki rakip konumları ve eşyalar gönderilmez. İstemci ara değerlerle hareketi yumuşatır. Görüş dışındaki kale modelleri çizilmez; geometri/malzeme paylaşımı, yeniden kullanılan nişan geometrisi, sınırlı piksel oranı, grafik ayarları ve düşük kare hızında otomatik kalite azaltma kullanılır.

```sh
npm test
node tests/network-smoke.mjs
node tests/browser-smoke.mjs
```

Son iki test çalışan sunucu ister. Tarayıcı testi Chrome ve Playwright kullanır; `PLAYWRIGHT_MODULE` ile kurulu Playwright modülünün file URL'si verilebilir. Ağ testi 10 gerçek WebSocket istemcisi, koltuk doluluğu, yeniden bağlanma ve yetki devrini kontrol eder. Tarayıcı testi iki bağımsız oturumla modları ve oynanışı doğrular. Ekran görüntüleri `artifacts/` içine yazılır. Çok oyunculu internet gecikmesi ve insanlarla oyun dengesi bu yerel kontrollerin kapsamı dışındadır.

Three.js (MIT lisanslı) npm paketinden gelir: `node_modules/three/LICENSE`. Görseller ve sesler prosedürel üretilir.

- Sıralama eşya sayısı ve eldeki altını gösterir. Görülen 30+ altınlı rakipler botların yağma hedefidir.
- Sersemleme 10 saniyedir; süre bitince oyuncu kendi kalesinin zemin katında elinde sopayla ayılır, taşıdığı eşya vurulduğu yerde kalır. Ardından 2,5 saniye yeniden sersemleme koruması vardır. Sersemken sopa kullanılabilir ve başlamış savuruş iptal olmaz. Botlar sopadan kusursuz zıplamaz; dövüş kararları 220–400 ms aralıklıdır.
- Her kale iki eşya ile başlar; takımlı maçta başlangıç toplamı takım başına 10 eşyadır.

- Kalene rakip girdiğinde ekran kenarları kırmızı yanıp söner. Son rakip çıkınca ya da kaledeki rakiplerin hepsi baygınken uyarı kapanır; baygın davetsiz ve dost oyuncular alarmı tetiklemez. Çevrim içi maçta uzakta olsan da kendi kalenin alarmını alırsın.

- Sağ tık / Q eldeki tek sopayı fırlatır. Sopa isabette, duvarda veya menzil sonunda kaybolur; geri dönmez ve süreyle yenilenmez. Silahsızken herhangi bir kalenin kapısının önündeki kasaya yaklaş ve E ile ücretsiz yeni sopa al. Botlar da en yakın kasaya gider. Kalede doğmak / ayılmak yeni sopa verir.

- Sis ve uzaklık temelli görünürlük sınırı kaldırıldı. Tüm kaleler ve açık alandaki oyuncular/eşyalar uzaklık sınırı olmadan görünür. Kale içinden de dışarısı görünür. Kale içindeki kat gizliliği korunur.

- Sopa fırlatma menzili 24 birimdir. Botlar gelen sopaya 350–550 ms sonra, her sopa için tek seferde %35 olasılıkla zıplamayı dener.

- **Her bayılışta** (fırlatılan sopa ya da can bitmesi, kendi kalesinde de) 5 altın yere düşer; bayılanın altını yetmese de düşer (eksik tutar üretilir, bakiye eksiye inmez). Rakibi bayıltmak her zaman altın kazandırır; bunun dışında yeni altın yalnız altın ağacından çıkar. Kale içinde düşen altını yalnız o kalenin takımı toplar.
