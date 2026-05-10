<!--
  Floating user-badge widget — top-right of every authenticated page.

  Shows the signed-in user's email and role. Clicking opens a menu
  with a Logout action. Hidden when no user is loaded (e.g. on the
  login page) or when route.meta.public is true.

  Why a floating widget instead of a shared layout chrome:
    The existing pages each manage their own header / toolbar (no
    AppShell exists). Threading a top-bar through every page would
    be a much larger refactor for PR 3. The fixed-position badge is
    a one-component drop-in that's invisible when not relevant.
-->

<template>
  <div v-if="visible" class="user-menu">
    <q-btn
      no-caps
      dense
      flat
      class="user-btn"
      :ripple="false"
    >
      <div class="row items-center q-gutter-sm">
        <q-avatar size="28px" color="primary" text-color="white">
          {{ initials }}
        </q-avatar>
        <div class="column items-start">
          <div class="user-email">{{ auth.user.email }}</div>
          <div class="user-role">{{ auth.user.role }}</div>
        </div>
        <q-icon name="expand_more" size="18px" />
      </div>

      <q-menu anchor="bottom right" self="top right">
        <q-list dense style="min-width: 200px">
          <q-item-label header class="text-caption">
            Signed in as
          </q-item-label>
          <q-item>
            <q-item-section>
              <q-item-label>{{ auth.user.email }}</q-item-label>
              <q-item-label caption>
                role: {{ auth.user.role }}
              </q-item-label>
            </q-item-section>
          </q-item>
          <q-separator />
          <q-item clickable v-close-popup @click="onLogout">
            <q-item-section avatar>
              <q-icon name="logout" />
            </q-item-section>
            <q-item-section>Sign out</q-item-section>
          </q-item>
        </q-list>
      </q-menu>
    </q-btn>
  </div>
</template>

<script setup>
import { computed } from "vue";
import { useRoute, useRouter } from "vue-router";
import { auth } from "../stores/auth.js";

const route  = useRoute();
const router = useRouter();

const visible = computed(() => {
  if (route.meta?.public) return false;
  return auth.isAuthenticated;
});

const initials = computed(() => {
  const e = auth.user?.email || "";
  const local = e.split("@")[0] || "?";
  // Take the first letter of the local-part. If the local-part has
  // a separator (.- or _) split on it and grab one letter from each
  // segment up to two — gives `vg` for `vivek.gangadharan@…`.
  const parts = local.split(/[._-]/).filter(Boolean);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return (local.slice(0, 2) || "?").toUpperCase();
});

async function onLogout() {
  await auth.logout();
  router.replace({ name: "login" });
}
</script>

<style scoped>
.user-menu {
  position: fixed;
  top: 12px;
  right: 16px;
  z-index: 9000;
}
.user-btn {
  background: white;
  border: 1px solid #e2e8f0;
  border-radius: 10px;
  padding: 4px 10px;
  box-shadow: 0 1px 3px rgba(15, 23, 42, 0.06);
}
.user-email {
  font-size: 12px;
  font-weight: 500;
  line-height: 1.1;
  color: #0f172a;
}
.user-role {
  font-size: 10px;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  color: #64748b;
  line-height: 1.1;
}
</style>
