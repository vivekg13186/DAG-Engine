<script setup>
import { RouterView } from "vue-router";
import UserMenu from "./components/UserMenu.vue";
</script>

<template>
  <RouterView />
  <!-- Floating top-right badge with signed-in user + logout. Hides
       itself on /login and other public routes (see UserMenu.vue). -->
  <UserMenu />
</template>
