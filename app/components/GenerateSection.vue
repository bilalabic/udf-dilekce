<script setup lang="ts">
import type { FieldError } from '~/composables/useGenerator'
import type { SkippedRow } from '~/types'

defineProps<{
  canGenerate: boolean
  rowCount: number
  status: 'idle' | 'working' | 'done'
  progress: number
  processed: number
  documentCount: number
  outputLabel: string
  skipped: SkippedRow[]
  memoryEstimateMb: number
  memoryWarning: boolean
  error?: FieldError | null
}>()

defineEmits<{ generate: []; download: []; cancel: [] }>()
</script>

<template>
  <div class="space-y-4">
    <template v-if="status === 'done'">
      <UAlert
        :color="skipped.length > 0 ? 'warning' : 'success'"
        variant="subtle"
        :icon="skipped.length > 0 ? 'i-lucide-triangle-alert' : 'i-lucide-party-popper'"
        :title="
          skipped.length > 0
            ? `${documentCount} belge oluşturuldu, ${skipped.length} satır atlandı.`
            : `${documentCount} belge başarıyla oluşturuldu.`
        "
        :description="`Her belge ${outputLabel} biçiminde ve tek bir ZIP arşivinde.`"
      />

      <div
        v-if="skipped.length > 0"
        class="rounded-[var(--ui-radius)] border border-warning/40 bg-warning/5 p-3"
      >
        <p class="text-sm font-medium">Bu satırlar için belge üretilmedi:</p>
        <ul class="mt-2 space-y-1 text-sm text-muted">
          <li v-for="row in skipped" :key="row.excelRow">
            <strong class="text-toned">Excel satır {{ row.excelRow }}</strong> — {{ row.reason }}
          </li>
        </ul>
        <p class="mt-2 text-xs text-muted">
          Bu liste ZIP’in içindeki <code class="font-mono">_RAPOR.txt</code> dosyasında da yer alır.
        </p>
      </div>
      <div class="flex flex-wrap items-center gap-3">
        <UButton
          label="ZIP İndir"
          icon="i-lucide-download"
          size="xl"
          class="min-h-12 px-6 text-base"
          @click="$emit('download')"
        />
        <p class="text-sm text-muted">Yeni bir dosya yüklerseniz belgeler yeniden oluşturulur.</p>
      </div>
    </template>

    <template v-else>
      <UButton
        :label="
          status === 'working'
            ? 'Belgeler oluşturuluyor…'
            : rowCount > 0
              ? `${rowCount} Belge Oluştur`
              : 'Belgeleri Oluştur'
        "
        :icon="status === 'working' ? undefined : 'i-lucide-file-cog'"
        :loading="status === 'working'"
        :disabled="!canGenerate"
        size="xl"
        class="min-h-12 px-6 text-base"
        @click="$emit('generate')"
      />

      <UAlert
        v-if="memoryWarning && status !== 'working'"
        color="warning"
        variant="subtle"
        icon="i-lucide-triangle-alert"
        title="Bu parti tarayıcı için büyük olabilir"
        :description="`Şablon boyutu ve satır sayısına göre yaklaşık ${Math.round(memoryEstimateMb)} MB bellek gerekir. Listeyi bölerek birkaç parti hâlinde üretmeniz daha güvenli olur.`"
      />

      <div v-if="status === 'working'" class="space-y-2">
        <UProgress :model-value="progress" :max="100" />
        <div class="flex items-center justify-between gap-3">
          <p class="text-sm text-muted tabular-nums" aria-live="polite">
            {{ processed }} / {{ rowCount }} belge hazırlandı
          </p>
          <UButton
            label="İptal"
            icon="i-lucide-x"
            color="neutral"
            variant="outline"
            size="sm"
            class="min-h-9"
            @click="$emit('cancel')"
          />
        </div>
      </div>
    </template>

    <UAlert
      v-if="error"
      color="error"
      variant="subtle"
      icon="i-lucide-triangle-alert"
      :title="error.message"
      :description="error.detail"
    />
  </div>
</template>
