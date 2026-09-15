<script setup lang="ts">
import { computed, ref } from 'vue'
import type { FieldError } from '~/composables/useGenerator'

const props = defineProps<{
  accept: string
  buttonLabel: string
  hint: string
  icon: string
  fileName?: string
  badge?: string
  error?: FieldError | null
  disabled?: boolean
}>()

const emit = defineEmits<{ select: [file: File] }>()

const input = ref<HTMLInputElement | null>(null)
const dragging = ref(false)

/** A file is loaded and healthy: the step is done. */
const filled = computed(() => Boolean(props.fileName) && !props.error)

function pick(file: File | undefined) {
  if (file) emit('select', file)
}

function onDrop(event: DragEvent) {
  dragging.value = false
  if (props.disabled) return
  pick(event.dataTransfer?.files?.[0])
}

function onChange(event: Event) {
  const target = event.target as HTMLInputElement
  pick(target.files?.[0])
  // Reset so re-selecting the same file still fires a change event.
  target.value = ''
}
</script>

<template>
  <div class="space-y-3">
    <div
      class="rounded-[var(--ui-radius)] border border-dashed text-center transition-all"
      :class="[
        // A completed step does not need to keep shouting: it shrinks to a
        // single confirmation line so the eye moves on to what is still open.
        filled ? 'px-4 py-4' : 'px-6 py-8',
        dragging
          ? 'border-primary bg-primary/5'
          : filled
            ? 'border-primary/40 bg-primary/5'
            : error
              ? 'border-error bg-error/5'
              : 'border-accented bg-elevated/30 hover:border-primary/50'
      ]"
      @dragover.prevent="dragging = !disabled"
      @dragleave.prevent="dragging = false"
      @drop.prevent="onDrop"
    >
      <input ref="input" type="file" :accept="accept" class="hidden" @change="onChange" />

      <div v-if="filled" class="flex flex-wrap items-center justify-center gap-x-3 gap-y-2">
        <UIcon name="i-lucide-circle-check" class="size-5 shrink-0 text-primary" />
        <p class="font-medium break-anywhere">
          {{ fileName }}
          <UBadge
            v-if="badge"
            :label="badge"
            color="primary"
            variant="subtle"
            size="sm"
            class="ml-1 align-middle"
          />
        </p>
        <UButton
          label="Değiştir"
          icon="i-lucide-refresh-cw"
          color="neutral"
          variant="ghost"
          size="sm"
          class="min-h-9"
          :disabled="disabled"
          @click="input?.click()"
        />
      </div>

      <div v-else>
        <!-- UIcon renders an inline span, so it needs `block` to sit on its own
             line above the button rather than beside it. -->
        <UIcon :name="icon" class="mx-auto block size-8 text-dimmed" />
        <UButton
          :label="buttonLabel"
          icon="i-lucide-upload"
          class="mt-3 min-h-11 px-5"
          :disabled="disabled"
          @click="input?.click()"
        />
        <p class="mt-3 text-sm text-muted mx-auto max-w-prose">{{ hint }}</p>
      </div>

    </div>

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
