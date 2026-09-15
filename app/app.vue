<script setup lang="ts">
import { computed } from 'vue'
import { useGenerator } from '~/composables/useGenerator'
import { TEMPLATE_ACCEPT, TEMPLATE_FORMATS } from '~/utils/template'

const {
  template,
  excel,
  templateError,
  excelError,
  validation,
  canGenerate,
  status,
  progress,
  processed,
  documentCount,
  generationError,
  skippedRows,
  toggleIgnored,
  memoryEstimateMb,
  memoryWarning,
  cancel,
  selectTemplate,
  selectExcel,
  generate,
  download
} = useGenerator()

const colorMode = useColorMode()

const isDark = computed({
  get: () => colorMode.value === 'dark',
  set: (value) => {
    colorMode.preference = value ? 'dark' : 'light'
  }
})

/** Written in script: nested braces inside a template interpolation do not parse. */
const CURLY_EXAMPLE = '{{ALAN_ADI}}'

const templateFormatLabel = computed(() =>
  template.value ? TEMPLATE_FORMATS[template.value.format].label : undefined
)

const outputLabel = computed(() =>
  template.value ? TEMPLATE_FORMATS[template.value.format].extension : '.docx'
)

/** Steps turn green only once they are genuinely complete. */
const steps = computed(() => [
  { done: Boolean(template.value) },
  { done: Boolean(excel.value) },
  { done: validation.value?.ok === true },
  { done: status.value === 'done' }
])
</script>

<template>
  <UApp>
    <main class="mx-auto w-full max-w-3xl px-4 py-10 sm:px-6 sm:py-14">
      <header class="mb-10">
        <div class="flex items-start justify-between gap-4">
          <div>
            <h1 class="text-balance text-3xl font-semibold tracking-tight sm:text-4xl">
              Toplu Dilekçe Oluşturucu
            </h1>
            <p class="mt-3 max-w-prose text-pretty text-muted">
              Bir Word (.docx) veya UYAP (.udf) şablonu ile bir Excel listesinden, her satır için
              ayrı bir belge oluşturun. Üretilen belgeler şablonla aynı biçimde olur.
            </p>
          </div>

          <UButton
            :icon="isDark ? 'i-lucide-sun' : 'i-lucide-moon'"
            color="neutral"
            variant="ghost"
            size="md"
            class="size-10"
            :aria-label="isDark ? 'Açık temaya geç' : 'Koyu temaya geç'"
            @click="isDark = !isDark"
          />
        </div>

        <UBadge
          color="primary"
          variant="subtle"
          size="lg"
          icon="i-lucide-shield-check"
          label="Dosyalarınız tarayıcınızda işlenir, hiçbir sunucuya gönderilmez"
          class="mt-5"
        />
      </header>

      <div class="space-y-5">
        <UCard v-for="(step, index) in steps" :key="index" variant="subtle">
          <template #header>
            <div class="flex items-center gap-3">
              <span
                class="grid size-7 shrink-0 place-items-center rounded-full text-sm font-semibold transition-colors"
                :class="
                  step.done
                    ? 'bg-primary text-inverted'
                    : 'bg-accented text-toned'
                "
              >
                <UIcon v-if="step.done" name="i-lucide-check" class="size-4" />
                <template v-else>{{ index + 1 }}</template>
              </span>
              <h2 class="font-semibold">
                <template v-if="index === 0">Şablonu yükleyin</template>
                <template v-else-if="index === 1">Excel listesini yükleyin</template>
                <template v-else-if="index === 2">Doğrulama özeti</template>
                <template v-else>Belgeleri oluşturun</template>
              </h2>
            </div>
          </template>

          <FileDropZone
            v-if="index === 0"
            :accept="TEMPLATE_ACCEPT"
            button-label="Şablon Seç"
            icon="i-lucide-file-text"
            hint="Word (.docx) veya UYAP (.udf) dosyası sürükleyip bırakın. Alanları {{AD_SOYAD}} biçiminde yazmanız önerilir; [AD_SOYAD] de çalışır."
            :file-name="template?.fileName"
            :badge="templateFormatLabel"
            :error="templateError"
            :disabled="status === 'working'"
            @select="selectTemplate"
          />


          <FileDropZone
            v-else-if="index === 1"
            accept=".xlsx"
            button-label="Excel Seç"
            icon="i-lucide-table-2"
            hint="Excel’in (.xlsx) ilk satırı sütun adlarını içermelidir ve bu adlar şablondaki alanlarla birebir aynı olmalıdır."
            :file-name="excel?.fileName"
            :error="excelError"
            :disabled="status === 'working'"
            @select="selectExcel"
          />

          <ValidationSummary
            v-else-if="index === 2"
            :validation="validation"
            :template-name="template?.fileName"
            :template-format="templateFormatLabel"
            :template-syntax="template?.syntax"
            :excel-name="excel?.fileName"
            :notices="excel?.notices"
            @toggle-ignored="toggleIgnored"
          />

          <GenerateSection
            v-else
            :can-generate="canGenerate"
            :row-count="excel?.rows.length ?? 0"
            :status="status"
            :progress="progress"
            :processed="processed"
            :document-count="documentCount"
            :output-label="outputLabel"
            :skipped="skippedRows"
            :memory-estimate-mb="memoryEstimateMb"
            :memory-warning="memoryWarning"
            :error="generationError"
            @generate="generate"
            @download="download"
            @cancel="cancel"
          />

          <!-- Stands outside the v-if/v-else-if chain above: inserting it in
               the middle would make the chain's v-else fire on step 1 too. -->
          <UAlert
            v-if="index === 0 && template?.notices.hasSignature"
            class="mt-3"
            color="warning"
            variant="subtle"
            icon="i-lucide-shield-off"
            title="Bu şablon e-imzalı"
            description="İmza, değiştirilmemiş orijinal dosyayı imzalar; metin değişince geçerli kalamaz. Bu yüzden üretilen belgelere taşınmaz, imzayı kendiniz atmanız gerekir."
          />
        </UCard>
      </div>

      <footer class="mt-10">
        <UCollapsible>
          <UButton
            label="Dosya biçimi gereksinimleri"
            icon="i-lucide-circle-help"
            trailing-icon="i-lucide-chevron-down"
            color="neutral"
            variant="ghost"
            size="sm"
            block
            class="min-h-9 justify-between"
          />
          <template #content>
            <ul class="mt-3 space-y-2 px-1 text-sm text-muted">
              <li>
                Şablon <strong class="text-toned">.docx</strong> veya
                <strong class="text-toned">.udf</strong>, liste
                <strong class="text-toned">.xlsx</strong> olmalıdır; eski .doc ve .xls
                desteklenmez.
              </li>
              <li>Çıktı biçimi şablonla aynıdır: .docx şablondan .docx, .udf şablondan .udf.</li>
              <li>
                Alanlar iki biçimde yazılabilir:
                <code class="font-mono text-xs">{{ CURLY_EXAMPLE }}</code> (önerilen) veya
                <code class="font-mono text-xs">[ALAN_ADI]</code>. Şablonda çift süslü parantez
                varsa yalnızca onlar alan sayılır, köşeli parantezli metin olduğu gibi kalır.
              </li>
              <li>
                Alan adı ile Excel sütun adı birebir aynı yazılmalıdır (büyük/küçük harf dahil).
              </li>
              <li>
                Şablondaki tüm alanların Excel’de karşılığı olmalıdır; fazladan Excel sütunları
                sorun oluşturmaz.
              </li>
              <li>Boş hücreler belgede boş bırakılır. Aynı alan birden çok kez kullanılabilir.</li>
              <li>Tarihleri metin olarak yazmanız önerilir; böylece belgede yazdığınız gibi görünür.</li>
              <li>
                <code class="font-mono text-xs">AD_SOYAD</code> sütunu varsa dosya adlarında
                kullanılır: <code class="font-mono text-xs">Dilekce_001_Ahmet_Yilmaz.docx</code>
              </li>
              <li>
                UDF şablonlarda hücre içi satır sonları tek satıra indirilir ve e-imza
                (<code class="font-mono text-xs">sign.sgn</code>) çıktıya taşınmaz.
              </li>
              <li>
                UDF şablonuna alanları <strong class="text-toned">UYAP Editör ile</strong> yazın.
                Dosyayı Not Defteri gibi bir metin düzenleyiciyle açıp değiştirmek biçimlendirme
                konumlarını bozar; uygulama böyle bir dosyayı kabul etmez.
              </li>
            </ul>
          </template>
        </UCollapsible>
      </footer>
    </main>
  </UApp>
</template>
