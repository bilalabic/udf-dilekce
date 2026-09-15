# Test dosyalarının kaynağı

## Sentetik (bu depoda üretilir)

`sablon.docx`, `sablon-curly.docx`, `sablon.udf`, `liste.xlsx` dosyaları
`npm run fixtures` ile üretilir. Kaynak: `scripts/make-fixtures.mjs` ve
`scripts/make-udf-fixture.mjs`.

## Gerçek UYAP çıktıları

`gercek-basvuru.udf` ve `gercek-tablolu.udf`, UYAP Doküman Editörü tarafından
üretilmiş **gerçek** dosyalardır. Motorun sentetik varsayımlara değil gerçek
biçime karşı doğrulanabilmesi için buradalar.

- Kaynak: https://github.com/mfozmen/udfly `samples/fixtures/`
  (`fixture-mediation-application.udf`, `fixture-mediation-form-with-table.udf`)
- Lisans: MIT
- İçerik: kaynakta sanitize edilmiştir; kişisel veri içermez
  (örn. "AHMET YILMAZ TEST", "11111111110", "0500 000 00 00").

Bu dosyalar **değiştirilmeden** saklanır; testler bunları bozup bozmadığımızı
ölçer.
