<template>
  <n-drawer :width="280" :auto-focus="false" placement="left">
    <n-drawer-content
      :native-scrollbar="false"
      :scrollbar-props="{ trigger: 'none' }"
      header-style="height: 100px; padding: 0"
    >
      <template #header>
        <div
          style="
            position: absolute;
            width: 100%;
            height: 100px;
            top: 0;
            background: #41a782;
          "
        />
        <img
          src="https://n.novelia.cc/files-extra/girl.6e4fe22c238737fd028247f8f0cfd4ee.webp"
          style="position: absolute; top: 0; height: 120px; margin: 8px 0 0 8px"
        />
      </template>
      <div style="margin-top: 36px">
        <slot />
      </div>
    </n-drawer-content>
  </n-drawer>
</template>
