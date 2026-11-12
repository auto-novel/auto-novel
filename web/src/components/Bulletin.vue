<template>
  <UCard
    class="notice bg-embedded text-sm leading-[1.6] text-ink ring-divider"
    :ui="{ body: 'px-6 py-5 sm:px-6 sm:py-5' }"
  >
    <slot />
  </UCard>
</template>

<style>
.notice p {
  margin-top: 0.4em;
  margin-bottom: 0em;
}
.notice ul {
  margin-top: 0.4em;
  margin-bottom: 0em;
}
</style>
