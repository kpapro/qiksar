<template>
  <q-page class="row items-center justify-evenly">
    <q-btn
      class="q-mt-xl"
      color="white"
      text-color="blue"
      to="/tenants"
      label="Maintain Tenants"
      no-caps
    />
    <q-btn
      class="q-mt-xl"
      color="white"
      text-color="blue"
      to="/members"
      label="Maintain Members"
      no-caps
    />
    <q-btn
      class="q-mt-xl"
      color="white"
      text-color="blue"
      to="/articles"
      label="Maintain Articles"
      no-caps
    />
    <q-btn
      class="q-mt-xl"
      color="white"
      text-color="blue"
      to="/article_status"
      label="Maintain Article Status"
      no-caps
    />
    <q-btn
      class="q-mt-xl"
      color="white"
      text-color="blue"
      to="/groups"
      label="Maintain Groups"
      no-caps
    />
    <q-btn
      class="q-mt-xl"
      color="white"
      text-color="blue"
      to="/roles"
      label="Maintain Roles"
      no-caps
    />
    <q-btn
      class="q-mt-xl"
      color="white"
      text-color="blue"
      to="/status"
      label="Maintain Status"
      no-caps
    />
  </q-page>
</template>

<script lang="ts">
import { defineComponent } from 'vue';
import { AuthWrapper } from 'src/boot/qiksar';

export default defineComponent({
  name: 'PageIndex',
  components: {},
  setup() {
    return {
      logout: () => {
        void AuthWrapper.Logout();
      },
    };
  },
});
</script>
