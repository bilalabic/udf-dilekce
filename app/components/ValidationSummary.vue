<script setup lang="ts">
import { computed } from 'vue'
import type { ExcelNotices, ValidationResult } from '~/types'

const props = defineProps<{
  validation: ValidationResult | null
  templateName?: string
  templateFormat?: string
  templateSyntax?: 'square' | 'curly'
  excelName?: string
  notices?: ExcelNotices
}>()

defineEmits<{ toggleIgnored: [field: string] }>()

/** Things the reader decided on the user's behalf, stated plainly. */
const noticeList = computed(() => {
  const n = props.notices
  if (!n) return []

  const items: string[] = []
  if (n.sheetCount > 1) {
    items.push(`${n.sheetCount} sayfadan “${n.sheetName}” okundu.`)
  }
  if (n.skippedEmptyRows > 0) {
    items.push(`${n.skippedEmptyRows} tamamen boş satır atlandı.`)
  }
  if (n.reformattedDateCells > 0) {
    items.push(
      `${n.reformattedDateCells} hücre Excel’de gerçek tarih olduğu için gg.aa.yyyy biçiminde yazıldı.`
    )
  }
  return items
})

const stats = computed(() => {
  if (!props.validation) return []

  return [
    { label: 'Şablondaki alan', value: props.validation.placeholderCount, icon: 'i-lucide-braces' },
    { label: 'Excel sütunu', value: props.validation.columnCount, icon: 'i-lucide-columns-3' },
    { label: 'Eşleşen alan', value: props.validation.matched.length, icon: 'i-lucide-link' },
    { label: 'Kayıt sayısı', value: props.validation.rowCount, icon: 'i-lucide-list' }
  ]
})
</script>

<template>
  <div v-if="!validation" class="flex items-center gap-3 rounded-[var(--ui-radius)] border border-dashed border-muted px-4 py-6 text-sm text-muted">
    <UIcon name="i-lucide-clipboard-check" class="size-5 shrink-0" />
    <span>Doğrulama özeti, her iki dosya da yüklendikten sonra burada görünür.</span>
  </div>

  <div v-else class="space-y-4">
    <div class="grid grid-cols-2 gap-3 sm:grid-cols-4">
      <div
        v-for="stat in stats"
        :key="stat.label"
        class="rounded-[var(--ui-radius)] bg-elevated/60 px-3 py-3"
      >
        <div class="flex items-center gap-1.5 text-xs text-muted">
          <UIcon :name="stat.icon" class="size-3.5" />
          <span>{{ stat.label }}</span>
        </div>
        <p class="mt-1 text-2xl font-semibold tabular-nums">{{ stat.value }}</p>
      </div>
    </div>

    <dl class="grid gap-2 text-sm sm:grid-cols-2">
      <div class="flex items-baseline gap-2">
        <dt class="shrink-0 text-muted">Şablon:</dt>
        <dd class="break-anywhere font-medium">
          {{ templateName }}
          <UBadge v-if="templateFormat" :label="templateFormat" color="primary" variant="subtle" size="sm" />
        </dd>
      </div>
      <div class="flex items-baseline gap-2">
        <dt class="shrink-0 text-muted">Excel:</dt>
        <dd class="break-anywhere font-medium">{{ excelName }}</dd>
      </div>
    </dl>

    <UAlert
      v-if="validation.ok"
      color="success"
      variant="subtle"
      icon="i-lucide-circle-check"
      title="Tüm zorunlu alanlar mevcut. Belgeler oluşturulabilir."
    />

    <template v-else>
      <UAlert
        v-for="message in validation.errors"
        :key="message"
        color="error"
        variant="subtle"
        icon="i-lucide-circle-alert"
        :title="message"
      />

      <div
        v-if="validation.missingFields.length > 0 && templateSyntax === 'square'"
        class="rounded-[var(--ui-radius)] border border-muted p-3"
      >
        <p class="text-sm text-muted">
          Köşeli parantezli her ifade alan sayılır. Bunlardan biri aslında düz metinse
          (örneğin <code class="font-mono text-xs">[Madde 5]</code>) “alan değil” deyin;
          belgede olduğu gibi kalır.
        </p>
        <ul class="mt-3 space-y-1.5">
          <li
            v-for="field in validation.missingFields"
            :key="field"
            class="flex items-center justify-between gap-3"
          >
            <code class="break-anywhere font-mono text-sm">[{{ field }}]</code>
            <UButton
              label="alan değil"
              icon="i-lucide-text-cursor"
              color="neutral"
              variant="outline"
              size="xs"
              class="min-h-8 shrink-0"
              @click="$emit('toggleIgnored', field)"
            />
          </li>
        </ul>
      </div>
    </template>

    <div
      v-if="validation.ignoredFields.length > 0"
      class="rounded-[var(--ui-radius)] border border-muted p-3"
    >
      <p class="text-xs text-muted">Düz metin sayılan ifadeler (belgede değişmeden kalır):</p>
      <ul class="mt-2 space-y-1.5">
        <li
          v-for="field in validation.ignoredFields"
          :key="field"
          class="flex items-center justify-between gap-3"
        >
          <code class="break-anywhere font-mono text-sm text-dimmed">[{{ field }}]</code>
          <UButton
            label="geri al"
            icon="i-lucide-undo-2"
            color="neutral"
            variant="ghost"
            size="xs"
            class="min-h-8 shrink-0"
            @click="$emit('toggleIgnored', field)"
          />
        </li>
      </ul>
    </div>

    <UAlert
      v-if="noticeList.length > 0"
      color="info"
      variant="subtle"
      icon="i-lucide-info"
      title="Excel okunurken"
    >
      <template #description>
        <ul class="list-disc space-y-1 pl-4">
          <li v-for="item in noticeList" :key="item">{{ item }}</li>
        </ul>
      </template>
    </UAlert>

    <div class="space-y-2">
      <UCollapsible v-if="validation.placeholderCount > 0">
        <UButton
          :label="`Şablonda bulunan alanlar (${validation.placeholderCount})`"
          color="neutral"
          variant="ghost"
          size="sm"
          trailing-icon="i-lucide-chevron-down"
          block
          class="min-h-9 justify-between"
        />
        <template #content>
          <div class="flex flex-wrap gap-1.5 px-1 pt-3">
            <UBadge
              v-for="field in validation.matched"
              :key="field"
              :label="field"
              color="success"
              variant="subtle"
              class="font-mono"
            />
            <UBadge
              v-for="field in validation.missingFields"
              :key="field"
              :label="field"
              color="error"
              variant="subtle"
              class="font-mono"
            />
          </div>
        </template>
      </UCollapsible>

      <UCollapsible v-if="validation.unusedColumns.length > 0">
        <UButton
          :label="`Kullanılmayan Excel sütunları (${validation.unusedColumns.length})`"
          color="neutral"
          variant="ghost"
          size="sm"
          trailing-icon="i-lucide-chevron-down"
          block
          class="min-h-9 justify-between"
        />
        <template #content>
          <div class="px-1 pt-3">
            <p class="mb-2 text-xs text-muted">Bu sütunlar yok sayılır, sorun oluşturmaz.</p>
            <div class="flex flex-wrap gap-1.5">
              <UBadge
                v-for="column in validation.unusedColumns"
                :key="column"
                :label="column"
                color="neutral"
                variant="subtle"
                class="font-mono"
              />
            </div>
          </div>
        </template>
      </UCollapsible>
    </div>
  </div>
</template>
