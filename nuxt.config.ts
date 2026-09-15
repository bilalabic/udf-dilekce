export default defineNuxtConfig({
  compatibilityDate: '2025-01-01',
  // Fully client-side: uploaded files never reach a server.
  ssr: false,
  devtools: { enabled: false },
  modules: ['@nuxt/ui'],
  css: ['~/assets/main.css'],
  // Icons are bundled from the locally installed collection, so the running app
  // never calls the Iconify API - the same privacy promise as the file handling.
  icon: {
    provider: 'none',
    clientBundle: {
      scan: true,
      includeCustomCollections: true
    }
  },
  app: {
    head: {
      htmlAttrs: { lang: 'tr' },
      title: 'Toplu Dilekçe Oluşturucu',
      meta: [
        { charset: 'utf-8' },
        { name: 'viewport', content: 'width=device-width, initial-scale=1' },
        {
          name: 'description',
          content:
            'Excel listesi ve Word/UYAP şablonundan toplu dilekçe oluşturun. Dosyalarınız tarayıcınızdan çıkmaz.'
        }
      ]
    }
  }
})
