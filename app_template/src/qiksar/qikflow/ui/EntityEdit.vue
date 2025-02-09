<template>
  <div v-if="store.RecordLoaded && !store.busy">
    <div class="row" v-for="(field, key) in editableFields()" v-bind:key="key">
      <div class="col">
        <component
          :is="components[field.Editor]"
          :field="field"
          :entity="reactive_record"
          :update_mode="UpdateMode"
          @update:modelValue="updateEntity(field, $event)"
        />
      </div>
    </div>
  </div>

  <div class="row">
    <q-btn v-if="!currentRecordId()" @click="insertEntity()" class="q-mt-xl" label="Save" />
    <q-btn v-if="currentRecordId()" @click="deleteEntity()" class="q-mt-xl" label="Delete" />
    <q-btn to="/" class="q-mt-xl" label="Home" />
  </div>
</template>

<script lang="ts" setup>

import { onBeforeMount, ref, Ref } from 'vue';
import { CreateStore } from 'src/qiksar/qikflow/store/GenericStore';
import { Dictionary, GqlRecord } from '../base/GqlTypes';

import EntityEditImage from './EntityEditImage.vue';
import EntityEditLichert from './EntityEditLichert.vue';
import EntityEditMultiCheck from './EntityEditMultiCheck.vue';
import EntityEditSelect from './EntityEditSelect.vue';
import EntityEditTags from './EntityEditTags.vue';
import EntityEditText from './EntityEditText.vue';
import EntityEditMarkdown  from './EntityEditMarkdown.vue';

import EntityField from '../base/EntityField';

const components = {
  EntityEditImage,
  EntityEditLichert,
  EntityEditMultiCheck,
  EntityEditSelect,
  EntityEditTags,
  EntityEditText,
  EntityEditMarkdown,
} as Dictionary;

const props = defineProps<{
  context: {
    entity_id: string;
    entity_type: string;
    real_time: { type: boolean; default: false };
  };
}>();

// eslint-disable-next-line vue/no-setup-props-destructure
let id: string = props.context.entity_id;

// Indicates if a record is being inserted or updated
const UpdateMode = ref(false);

// create store for the required view/schema
const store = CreateStore(props.context.entity_type);

const reactive_record = ref({} as GqlRecord) as Ref<GqlRecord>;

function setReactiveRecord(entity: GqlRecord): void {
  reactive_record.value = entity;
  UpdateMode.value = true;
}

// Fetch the entity to edit
onBeforeMount(async () => {
  if (id && id.length > 0 && id != 'new') {
    await store.FetchById(id, !store.view.IsEnum).then(() => {
      setReactiveRecord(store.CurrentRecord);
    });
  } else {
    // prepare a new record for insert
    setReactiveRecord(store.NewRecord);
  }
});

// Get a collection of editable fields
function editableFields(): Record<string, EntityField> {
  return store.view.EditableFields as Record<string, EntityField>;
}

// Extract the ID of the current entity in the store
function currentRecordId(): string | undefined {
  const id = reactive_record.value[store.view.Schema.Key] as string;
  return id;
}

async function insertEntity(): Promise<void> {
  reactive_record.value = await store.Add(reactive_record.value);
}

function updateEntity(field: EntityField, value: unknown): void {
  const original = { ...store.CurrentRecord };
  store.CurrentRecord[field.AffectedFieldName] = value;

  if (props.context.real_time && currentRecordId())
    void store.Update(store.CurrentRecord, original);
}

function deleteEntity() {
  void store.Delete(reactive_record.value[store.view.Schema.Key] as string);
}
</script>
