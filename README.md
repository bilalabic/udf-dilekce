<div align="center">

# Toplu Dilekçe Oluşturucu

**Bir şablon + bir Excel listesi = yüzlerce hazır belge.**

Word (`.docx`) veya UYAP (`.udf`) şablonunuzu ve Excel listenizi yükleyin;
her satır için ayrı bir belge üretilsin, hepsi tek bir ZIP olarak insin.

Tüm işlem tarayıcınızda yapılır — dosyalarınız hiçbir sunucuya gitmez.

</div>

---

## Öne çıkanlar

- **İki biçim, kayıpsız.** `.docx` şablondan `.docx`, `.udf` şablondan `.udf` çıkar.
  Biçimler arasında dönüştürme yapılmaz, hiçbir biçimlendirme çeviride kaybolmaz.
- **Biçimlendirme korunur.** Yazı tipleri, tablolar, görseller, üstbilgi/altbilgi,
  kenar boşlukları, imza alanları — hepsi olduğu gibi kalır.
- **Hiçbir şey sunucuya gitmez.** Arka uç, veritabanı, depolama ve dış servis çağrısı yoktur.
  İkonlar bile pakete gömülüdür.
- **Sessiz karar yoktur.** Atlanan boş satır, okunan Excel sayfası, yeniden biçimlendirilen
  tarih — hepsi ekranda bildirilir.
- **Hatalı satır partiyi çökertmez.** O satır atlanır, kalanlar üretilir, sebebi ZIP'in
  içindeki `_RAPOR.txt` dosyasına yazılır.
- **Gerçek UYAP dosyalarıyla doğrulanmıştır.** 112 otomatik test, bunların 21'i gerçek
  UYAP Doküman Editörü çıktıları üzerinde.

---

## İçindekiler

- [Hızlı başlangıç](#hızlı-başlangıç)
- [Nasıl kullanılır](#nasıl-kullanılır)
- [Şablon hazırlama](#şablon-hazırlama)
- [Kurallar ve davranışlar](#kurallar-ve-davranışlar)
- [Gizlilik](#gizlilik)
- [Teknik: işin zor kısmı](#teknik-işin-zor-kısmı)
- [Doğrulama](#doğrulama)
- [Geliştirme](#geliştirme)
- [Dağıtım](#dağıtım)
- [Bilinen sınırlar](#bilinen-sınırlar)

---

## Hızlı başlangıç

```bash
npm install
npm run dev
```

Tarayıcıda `http://localhost:3000` adresini açın.

## Nasıl kullanılır

| Adım | Ne yapılır |
| --- | --- |
| **1** | Şablonu yükleyin (`.docx` veya `.udf`) |
| **2** | Excel listesini yükleyin (`.xlsx`) |
| **3** | Doğrulama özetini kontrol edin |
| **4** | `N Belge Oluştur` → `ZIP İndir` |

Excel'in **ilk satırı** sütun adlarını içerir, sonraki her satır bir belge olur.
Sütun adları şablondaki alan adlarıyla birebir aynı olmalıdır.

```
AD_SOYAD          | TC_KIMLIK   | ADRES    | TARIH
Ahmet Yılmaz      | 12345678901 | Elazığ   | 01.09.2026
Mehmet Kaya       | 98765432109 | Mardin   | 02.09.2026
```

## Şablon hazırlama

Şablonda iki ayraç biçimi desteklenir. Uygulama hangisinin kullanıldığını **kendisi anlar**:

| Biçim | Ne zaman kullanılır | Davranış |
| --- | --- | --- |
| `{{AD_SOYAD}}` | **Önerilen** | Şablonda tek bir `{{...}}` varsa yalnızca bunlar alan sayılır. Köşeli parantezli metin (`[Madde 5]`) dokunulmadan kalır. Belirsizlik yoktur. |
| `[AD_SOYAD]` | Mevcut şablonlar | Köşeli parantezli **her** ifade alan sayılır. Alan olmayanları arayüzden **"alan değil"** ile işaretlersiniz; belgede olduğu gibi kalır. |

> **Neden `{{...}}` önerilir?** Hukuk metinleri köşeli parantez doludur — gerçek bir UYAP
> arabuluculuk formunda `[İşçi İle İşveren İlişkisinden Kaynaklanan (Nisbi)]` ifadesine
> rastladık. Çift süslü parantez bu metinlerde geçmediği için hiçbir zaman işaretleme
> yapmanız gerekmez.

**UDF şablonları için:** Alanları **UYAP Editör ile** yazın. Dosyayı Not Defteri gibi bir
metin düzenleyiciyle açıp değiştirmek biçimlendirme konumlarını bozar; uygulama böyle bir
dosyayı zaten kabul etmez ve sebebini söyler.

## Kurallar ve davranışlar

**Alanlar**

- Şablondaki tüm alanların Excel'de karşılığı olmalıdır. Fazladan Excel sütunları sorun oluşturmaz.
- Boş hücreler belgede boş bırakılır. Aynı alan şablonda birden çok kez kullanılabilir.
- Alan adları büyük/küçük harf dahil birebir eşleşmelidir.

**Veri**

- Kimlik numarası gibi uzun sayılar bilimsel gösterime dönüşmez.
- Tarihleri Excel'de **metin** olarak tutmanız önerilir; o zaman belgede yazdığınız gibi görünür.
  Gerçek tarih hücreleri `gg.aa.yyyy` biçiminde yazılır ve bu ekranda bildirilir.

**Dosya adları**

- `AD_SOYAD` sütunu varsa kullanılır: `Dilekce_001_Ahmet_Yilmaz.docx`
- Yoksa sıra numarası: `Dilekce_001.docx`
- Türkçe harfler ASCII karşılığına çevrilir (ZIP açıcıların bir kısmı bozuyor).

**Sessiz karar yoktur**

Okuma sırasında verilen her karar ekranda bildirilir: çok sayfalı Excel'de hangi sayfanın
okunduğu, kaç boş satırın atlandığı, kaç hücrenin tarih olduğu için yeniden biçimlendirildiği.

**Hatalı satırlar**

Bir satır hata verirse o satır atlanır, diğerleri üretilir. Atlananlar hem ekranda hem de
ZIP içindeki `_RAPOR.txt` dosyasında **Excel satır numarasıyla** listelenir — arşivi günler
sonra açtığınızda eksiği fark edersiniz. Hiçbir belge üretilemezse işlem hatayla durur.

**Büyük listeler**

Belgeler ve ZIP aynı anda bellekte durur; tepe kullanım yaklaşık
*şablon boyutu × satır sayısı × 2*'dir. Tahmin 400 MB'ı aşarsa uygulama önceden uyarır.
Üretim sırasında **İptal** ile durdurulabilir.

## Gizlilik

Bu uygulama ad, adres, T.C. kimlik numarası gibi kişisel verilerle çalışır. Bu yüzden:

- Yüklenen dosyalar **tarayıcıdan çıkmaz**. Arka uç yoktur.
- Çalışma sırasında **hiçbir dış istek yapılmaz** — ölçüldü, doğrulandı.
  İkonlar pakete gömülüdür, yazı tipi veya analitik çağrısı yoktur.
- Hiçbir veri saklanmaz; sayfayı kapattığınızda hepsi gider.
- **E-imza:** İmzalı bir UDF şablonu yüklenirse `sign.sgn` çıktıya kopyalanmaz. İmza
  değiştirilmemiş orijinal baytları imzalar; metin değişince geçerli kalamaz. Geçersiz bir
  imzayı belgede bırakmaktansa kaldırmak doğrudur. Üretilen belgeleri kendiniz imzalamalısınız.

## Teknik: işin zor kısmı

İki biçimin de kendine özgü bir tuzağı var. Bu uygulamanın asıl değeri burada.

### DOCX: parçalanmış alanlar

Word, görsel olarak bitişik görünen `[AD_SOYAD]` metnini birden fazla XML parçasına bölebilir:

```xml
<w:r><w:t>[AD_</w:t></w:r><w:r><w:t>SOYAD]</w:t></w:r>
```

Bu yüzden düz metin değiştirme yetmez. [docxtemplater](https://docxtemplater.com) kullanılır:
parçalanmış alanları birleştirir ve belgenin geri kalanına dokunmaz.

### UDF: karakter ofsetleri

UDF, içinde `content.xml` bulunan bir ZIP'tir. DOCX'ten farklı olarak belgenin **tüm metni
tek bir CDATA bloğunda** durur ve biçimlendirme elemanları bu metne **karakter ofseti** ile
bağlanır:

```xml
<content><![CDATA[Sayın [AD_SOYAD], başvurunuz alınmıştır.]]></content>
<elements>
  <paragraph><content startOffset="6" length="10"/></paragraph>
</elements>
```

10 karakterlik `[AD_SOYAD]` yerine 12 karakterlik bir değer yazmak, kendisinden sonraki
**bütün** ofsetleri 2 kaydırır. Ofsetleri güncellemeden metni değiştirmek, açıldığında
biçimlendirmesi kaymış bir dosya üretir.

`app/utils/udf.ts` bu yüzden metni değiştirdikten sonra `startOffset`/`length` taşıyan **her**
elemanı yeniden hesaplar — tablo hücreleri de aynı metin havuzuna işaret ettiği için ağacın
tamamı taranır. Eleman eklenmez; yalnızca iki sayı değişir. Böylece kodun tanımadığı her şey
(tablolar, görseller, alan tanımları, `webID`) olduğu gibi korunur.

Tek istisna: bir değiştirmenin tamamen yuttuğu `content` / `space` / `tab` / `field` parçaları
silinir, çünkü gerçek UYAP dosyalarında sıfır uzunluklu parça **hiç yoktur**. `image` ise ikili
veri taşıdığı için silinmez.

Gerçek UYAP çıktıları incelenerek doğrulanan format kuralları:

| Kural | Değer |
| --- | --- |
| `format_id` | `1.8` |
| Arşiv içeriği | `content.xml` (zorunlu), `documentproperties.xml`, `sign.sgn` |
| Ofset kapsaması | Boşluksuz ve çakışmasız; son bir satır sonu karakteri hiçbir elemanca kaplanmaz |
| Paragraf sonu | Paragrafın kendi satır sonu karakteri, kapsadığı aralığın **içindedir** |
| Kodlama | BOM'suz UTF-8, satır sonu LF |

## Doğrulama

En önemli değişmez şudur: **üretilen belgede ofsetlerin işaret ettiği parçalar birleştirildiğinde
metnin tamamı, boşluksuz ve çakışmasız biçimde yeniden oluşmalıdır.** Bu kontrol hem testlerde
hem de **çalışma zamanında** yapılır — tutarsız bir çıktı üretilirse dosya yazılmaz, anlaşılır
bir hata verilir. Bozuk bir belge sessizce ZIP'e giremez.

### Gerçek UYAP dosyalarıyla

`tests/fixtures/gercek-*.udf` dosyaları sanitize edilmiş, MIT lisanslı **gerçek** UYAP
belgeleridir (kaynak: [`tests/fixtures/KAYNAKLAR.md`](tests/fixtures/KAYNAKLAR.md)).
Bunlar üzerinde doğrulananlar:

- **Bozmama** — değiştirilecek alan yokken belge **byte byte aynı** kalarak çıkar.
- **Yapı korunumu** — ofsetler gerçekten kaydığında bile etiket ve öznitelik dağarcığı
  değişmez; prolog ve `<styles>` bölümü aynen kalır.
- **Tam örtüşme** — 153 parça taşıyan gerçek bir belgede bile ofsetler metni kusursuz kaplar.
- **Uçtan uca** — gerçek belgeden türetilmiş şablon + Excel ile üretilen belgelerde Türkçe
  karakterler ve `<table>` / `<field>` / `<webID>` bölümleri yerinde kalır.

```bash
npm test          # 112 test
npm run typecheck # TypeScript denetimi
npm run fixtures  # örnek dosyaları yeniden üretir
```

## Geliştirme

**Yığın:** Nuxt 4 · Vue 3 · TypeScript · Nuxt UI 4 (Tailwind CSS v4)

| Yol | Görev |
| --- | --- |
| `app/utils/template.ts` | Biçime göre doğru motoru seçen tek giriş noktası |
| `app/utils/docx.ts` | Word şablonu: alan bulma ve belge üretme |
| `app/utils/udf.ts` | UYAP şablonu: alan bulma, metin değiştirme, ofset yeniden hesaplama |
| `app/utils/excel.ts` | Excel okuma ve hücre değerlerini metne çevirme |
| `app/utils/validation.ts` | Alan/sütun karşılaştırması |
| `app/utils/generate.ts` | Toplu üretim, ilerleme, iptal, atlanan satır raporu |
| `app/utils/filename.ts` | Dosya adı üretimi ve temizleme |
| `app/utils/zip.ts` | ZIP paketleme |
| `app/composables/useGenerator.ts` | Uygulama durumu |
| `app/components/` | Arayüz bileşenleri |

Belge işleme mantığı arayüzden tamamen ayrıdır: `app/utils/` içindeki hiçbir dosya Vue'ya
bağımlı değildir ve hepsi doğrudan test edilir.

### Tasarım

Zümrüt/teal vurgu, kurşuni-yeşil nötr zemin. Tüm renk çiftleri WCAG 2.2'ye göre ölçüldü:

| Çift | Açık tema | Koyu tema |
| --- | --- | --- |
| Gövde metni / yüzey | 17.69:1 AAA | 14.64:1 AAA |
| İkincil metin / yüzey | 6.01:1 AA | 6.84:1 AA |
| Buton yazısı / buton | 5.47:1 AA | 9.16:1 AAA |

Renkler tek yerden, `app/assets/main.css` içindeki tasarım token'larından yönetilir.
Ana eylem 48px, ikincil eylemler 36px dokunma hedefi (WCAG 2.5.8 asgari 24px).
Koyu/açık tema başlıktaki düğmeyle değişir, varsayılan olarak sistem tercihini izler.

## Dağıtım

```bash
npm run generate
```

`.output/public` klasörü herhangi bir statik sunucuya yüklenebilir (gzip ile ~270 KB).
Sunucu tarafı çalışma zamanı gerekmez.

Vercel'e bağlıdır: `main` dalına her push otomatik dağıtılır. Yapılandırma
[`vercel.json`](vercel.json) dosyasındadır.

## Bilinen sınırlar

- **UDF çıktıları resmî UYAP Editör uygulamasında açılarak denenmedi.** Testler biçimsel
  doğruluğu gösterir, editörün kabulünü garanti etmez. Canlı kullanımdan önce kendi
  şablonunuzla bir deneme yapıp çıktıyı UYAP Editör'de açın.
- UDF şablonlarda hücre içi satır sonları tek satıra indirilir; çok satırlı adres için
  ayrı alanlar kullanın.
- Yalnızca `.docx`, `.udf` ve `.xlsx` desteklenir. Eski `.doc` ve `.xls` desteklenmez.
- PDF üretimi yoktur.
