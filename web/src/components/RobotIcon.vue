<script lang="ts" setup>
import { isTranslating, translationAlert } from '@/util';

const vars = useThemeVars();
const showGirl = ref(false);

const iconColor = computed(() => {
  switch (translationAlert.value) {
    case 'warning':
      return '#f0a020';
    case 'error':
      return '#d03050';
    default:
      return isTranslating.value ? '#2080f0' : vars.value.primaryColor;
  }
});
</script>

<template>
  <n-icon
    v-bind="$attrs"
    :color="iconColor"
    :class="{ 'robot-pulse': isTranslating || translationAlert === 'error' }"
    style="
      cursor: pointer;
      transition:
        color 0.5s ease,
        transform 0.3s ease,
        opacity 0.3s ease;
    "
    @click="showGirl = !showGirl"
  >
    <svg
      version="1.0"
      xmlns="http://www.w3.org/2000/svg"
      width="512.000000pt"
      height="512.000000pt"
      viewBox="0 0 512.000000 512.000000"
      preserveAspectRatio="xMidYMid meet"
    >
      <g
        transform="translate(0.000000,512.000000) scale(0.100000,-0.100000)"
        stroke="none"
      >
        <path
          d="M1438 4566 c-65 -34 -120 -64 -123 -67 -2 -3 96 -199 219 -435 l224
-429 -614 -3 -614 -2 0 -400 0 -400 -185 0 -185 0 0 -750 0 -750 185 0 185 0
0 -400 0 -400 2030 0 2030 0 0 400 0 400 185 0 185 0 0 750 0 750 -185 0 -185
0 -2 398 -3 397 -614 3 c-534 2 -612 4 -607 17 3 8 104 204 225 435 l219 420
-124 64 -124 63 -19 -31 c-10 -17 -128 -241 -261 -499 l-243 -467 -481 2 -481
3 -245 470 c-135 259 -252 482 -260 497 l-15 27 -117 -63z m349 -1669 c203
-106 213 -388 18 -498 -187 -105 -416 29 -414 241 1 118 50 199 150 249 59 30
70 32 139 29 43 -3 89 -12 107 -21z m1789 -5 c98 -50 162 -169 151 -279 -23
-224 -292 -330 -461 -182 -62 55 -88 108 -94 192 -8 119 44 213 150 267 58 29
69 31 138 27 50 -2 89 -11 116 -25z m-126 -1372 l0 -280 -890 0 -890 0 0 280
0 280 890 0 890 0 0 -280z"
        />
      </g>
    </svg>
  </n-icon>

  <img
    v-if="showGirl"
    src="https://n.novelia.cc/files-extra/girl.6e4fe22c238737fd028247f8f0cfd4ee.webp"
    style="
      width: 200px;
      position: fixed;
      right: -30px;
      bottom: -30px;
      transform: rotate(-15deg);
      user-select: none;
    "
  />
</template>

<style scoped>
.robot-pulse {
  animation: pulse 1.5s ease-in-out infinite;
}

@keyframes pulse {
  0%,
  100% {
    transform: scale(1);
    opacity: 1;
  }
  50% {
    transform: scale(1.12);
    opacity: 0.6;
  }
}
</style>
