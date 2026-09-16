# UDF (UYAP Doküman Formatı) — çalışma notları

Bu belge, `app/utils/udf.ts` motorunun dayandığı format bilgisini kaydeder.

İki bölümü karıştırmayın:

- **Ölçülmüş** başlığı altındaki her sayı, bu depodaki gerçek UYAP dosyalarından
  `scripts/udf-probe.mjs` ile üretilmiştir. Kendiniz doğrulayabilirsiniz:

  ```bash
  node scripts/udf-probe.mjs tests/fixtures/gercek-basvuru.udf
  ```

- **Doğrulanmamış** başlığı altındakiler başka projelerin/sitelerin iddialarıdır.
  Elimizde örneği yok; koda girmeden önce gerçek bir dosyayla ölçülmelidir.

Gerçek dosyaların kaynağı: [`tests/fixtures/KAYNAKLAR.md`](../tests/fixtures/KAYNAKLAR.md).

---

## 1. Arşiv

`.udf` bir ZIP'tir. Ölçülen girdiler:

| Girdi | Zorunlu mu | İçerik |
| --- | --- | --- |
| `content.xml` | **Evet** — yoksa dosya reddedilir | Belgenin tamamı |
| `documentproperties.xml` | Hayır | Java `properties` DTD'si; `uyapdogrulamakodu`, `uyapsicil` anahtarları |
| `sign.sgn` | Hayır | E-imza. Elimizdeki örnekte içerik sanitize edilip sıfırlanmış; **imza standardı bilinmiyor** |

İki gerçek dosyadan biri `documentproperties.xml` taşımıyor, diğeri `sign.sgn`
taşımıyor: ikisi de isteğe bağlı.

## 2. `content.xml` iskeleti

```xml
<?xml version="1.0" encoding="UTF-8" ?>            ← prologdan sonra bir boşluk + boş satır
<template format_id="1.8">
  <content><![CDATA[ belgenin BÜTÜN metni ]]></content>
  <elements> … paragraflar, tablolar, üst/altbilgi … </elements>
  <styles> … </styles>
  <webID id="…" />
</template>
```

**Ölçülmüş:** her iki gerçek dosyada `format_id="1.8"`, kodlama BOM'suz UTF-8,
satır sonu LF (`\r` sayısı 0), kök eleman `<template>`.

## 3. Ofset modeli — motorun dayandığı değişmez

Metin tek bir CDATA bloğunda durur; biçimlendirme elemanları bu metne
`startOffset` + `length` ile bağlanır. Metni değiştirmek, kendisinden sonraki
**bütün** ofsetleri kaydırır.

**Ölçülmüş:**

| | `gercek-basvuru.udf` | `gercek-tablolu.udf` |
| --- | --- | --- |
| Metin uzunluğu | 1418 | 1396 |
| Kapsanan | 1417 | 1395 |
| Kapsanmayan kuyruk | `"\n"` | `"\n"` |
| Parça sayısı | 49 | 153 |
| Kendinden kapanmayan parça | 0 | 0 |
| Sıfır uzunluklu parça | 0 | 0 |
| Boşluk / çakışma | 0 | 0 |

Yani gerçek UYAP çıktısında parçalar metni **boşluksuz ve çakışmasız** kaplar,
geriye yalnızca son bir satır sonu kalır ve ofset taşıyan her parça kendinden
kapanır (`<content … />`).

Motor bu kuralın **tamamını dayatmaz**: boşluk, çakışma ve metnin sonunu aşan
kapsama reddedilir, ama kapsanmayan kuyruk ne uzunlukta olursa olsun kabul
edilir. Sebebi: kapsanmayan kuyruk belgeyi bozamaz, bayat bir ofset bozar —
ve `.udf` üreten başka araçlar metni kendi düzenlerine göre kaplıyor olabilir.

## 4. Eleman ve öznitelik dağarcığı

**Ölçülmüş** (parantez içi: geçiş sayısı, sırasıyla başvuru / tablolu):

| Eleman | Ne yapar |
| --- | --- |
| `content` (49 / 65) | Biçimlendirilmiş metin parçası |
| `paragraph` (35 / 33) | Paragraf; kendi satır sonu **kapsadığı aralığın içindedir** |
| `space` (1 / 45) | Kendi ofsetini taşıyan boşluk parçası |
| `field` (0 / 44) | Doldurulabilir alan: `fieldName`, `fieldType`, `isList`, `isErasable` |
| `table` / `row` / `cell` (tablolu) | Tablo; **hücreler aynı metin havuzuna işaret eder** |
| `header` / `footer` | Üst/altbilgi; `pageNumber-spec`, `pageNumber-seperator` (bu yazımla), `pageNumber-font*`, `pageNumber-color` |
| `pageFormat` | `mediaSizeName`, kenar boşlukları, `paperOrientation`, `headerFOffset`, `footerFOffset` |
| `styles` / `style` | Stil zinciri |
| `webID` | Değeri içinde `ad=` biçimli metin barındırabilen kimlik |

Ofset taşıyan parçalarda en sık görülen öznitelikler: `startOffset`, `length`,
`resolver`, `size`, `bold`, `fieldName`, `fieldType`, `isList`, `fieldGroupName`,
`isErasable`, `family`, `underline`, `Alignment`, `LeftIndent`, `RightIndent`.

Stiller: `default` → `hvl-default` → `edf_<epoch-ms>` zinciri; `resolver` bir
üst stili gösterir. Renkler işaretli 32-bit Java ARGB tamsayısıdır
(`-16777216` = siyah, `-13421773` = `#333333`). `LineSpacing` **eklemelidir**:
`0.5`, 1.5 satır aralığı demektir (`gercek-basvuru.udf`: 22 kez `0.0`, 12 kez `0.5`).

## 5. Özel karakterler

**Ölçülmüş:** TAB metnin içinde gerçek `\t` olarak durur (15 / 22 kez) ve kendi
parçasında taşınabilir. `\r` hiç yok. Boş paragraf işareti (U+200B) ve nesne yer
tutucu (U+FFFC) bu iki dosyada **geçmiyor** — motor yine de ikisini de sıradan
karakter olarak sayar, çünkü sayım karakter bazlıdır.

Karakter sayımı UTF-16 kod birimi üzerindendir; gerçek editör Java (Swing)
olduğu için ölçüm birimi birebir aynıdır. Kod noktası bazlı sayan üçüncü parti
araçlar yalnızca BMP dışı karakterlerde (emoji) ayrışır.

## 6. Bu motorun davranışı

- Metni değiştirir, sonra `startOffset`/`length` taşıyan **her** elemanı yeniden
  hesaplar. Eleman eklenmez, ağaç yeniden yapılandırılmaz.
- Bir değiştirmenin tamamen yuttuğu `content` / `space` / `tab` / `field`
  parçaları silinir (gerçek dosyalarda sıfır uzunluklu parça yoktur). `image`
  silinmez: ikili veri taşır.
- Üretimden sonra kapsama yeniden ölçülür; tutarsızsa dosya **yazılmaz**.
- `sign.sgn` çıktıya kopyalanmaz: imza değiştirilmemiş baytları imzalar.
- Diğer bütün arşiv girdileri korunur — `documentproperties.xml` dahil.
  **Dikkat:** şablon gerçek bir UYAP belgesiyse üretilen belgeler o belgenin
  `uyapdogrulamakodu` değerini taşımaya devam eder. Bu bilinçli bir seçimdir
  (bkz. `tests/udf-real.test.ts`, "drops only the signature"), ama gerçek bir
  belgeyi şablon olarak kullanırken akılda tutulmalıdır.

### Bilinen sınır

Ofsetler düzenli ifadeyle bulunur. Tek tırnaklı bir öznitelik değerinin içinde
birebir `length="12"` metni geçseydi yanlış yakalanabilirdi. Gerçek UYAP çıktısı
özniteliklerini çift tırnakla yazdığı ve çift tırnaklı bir değer ham `"`
içeremeyeceği için bu durum pratikte oluşmaz; `webID` değerindeki `IMQtrI=`
benzeri metinler de bu yüzden zararsızdır.

## 7. Doğrulanmamış iddialar

Aşağıdakiler başka projelerin/sitelerin beyanıdır. Elimizde örnek dosya yok,
bu yüzden **koda hiçbirine göre karar verilmedi**:

- İmzanın bazı dosyalarda `signature.p7s` (PKCS#7/CMS) adıyla durduğu.
- `resolver="hvl-oncesi"` varyantı ve kök elemanın `<document>` olabildiği.
- Arşivde `binary/` ve `styles/` girdileri bulunabildiği.
- Görsel boyutunun px mi pt mi olduğu, `ListLevel`in 0 mı 1 mi tabanlı olduğu,
  `columnSpans`ın birimi, `paperOrientation`ın manzara değeri.
- UYAP'ın `.usf` uzantısının ne olduğu (resmî menülerde geçiyor, tanımı yok).

Bunlardan biri gerekirse: gerçek bir dosya bulun, `scripts/udf-probe.mjs` ile
ölçün, sonucu buraya **ölçülmüş** olarak yazın.

## 8. Hâlâ kapanmamış halka

Üretilen dosyalar resmî UYAP Doküman Editörü'nde açılarak denenmedi. Testler
biçimsel doğruluğu gösterir, editörün kabulünü garanti etmez.
