<template>
  <UError
    class="min-h-[calc(100dvh-var(--web-kit-header-height))]"
    :error="{
      statusMessage: '404 页面不存在',
      message: '怎么回事捏？',
    }"
    :clear="false"
  />
</template>
