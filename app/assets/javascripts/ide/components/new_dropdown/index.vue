<script>
import { mapActions } from 'vuex';
import icon from '~/vue_shared/components/icon.vue';
import upload from './upload.vue';
import ItemButton from './button.vue';
import { modalTypes } from '../../constants';

export default {
  components: {
    icon,
    upload,
    ItemButton,
  },
  props: {
    type: {
      type: String,
      required: true,
    },
    path: {
      type: String,
      required: false,
      default: '',
    },
    isOpen: {
      type: Boolean,
      required: false,
      default: false,
    },
  },
  watch: {
    isOpen() {
      this.$nextTick(() => {
        this.$refs.dropdownMenu.scrollIntoView({
          block: 'nearest',
        });
      });
    },
  },
  methods: {
    ...mapActions(['createTempEntry', 'openNewEntryModal', 'deleteEntry']),
    createNewItem(type) {
      this.openNewEntryModal({ type, path: this.path });
      this.$emit('toggle', false);
    },
    openDropdown() {
      this.$emit('toggle', !this.isOpen);
    },
  },
  modalTypes,
};
</script>

<template>
  <div class="ide-new-btn">
    <div
      :class="{
        show: isOpen,
      }"
      class="dropdown d-flex"
    >
      <button
        :aria-label="__('Create new file or directory')"
        type="button"
        class="rounded border-0 d-flex ide-entry-dropdown-toggle"
        @click.stop="openDropdown()"
      >
        <icon name="ellipsis_v" /> <icon name="chevron-down" />
      </button>
      <ul ref="dropdownMenu" class="dropdown-menu dropdown-menu-right">
        <template v-if="type === 'tree'">
          <li>
            <item-button
              :label="__('New file')"
              class="d-flex"
              icon="doc-new"
              icon-classes="mr-2"
              @click="createNewItem('blob')"
            />
          </li>
          <li><upload :path="path" @create="createTempEntry" /></li>
          <li>
            <item-button
              :label="__('New directory')"
              class="d-flex"
              icon="folder-new"
              icon-classes="mr-2"
              @click="createNewItem($options.modalTypes.tree)"
            />
          </li>
          <li class="divider"></li>
        </template>
        <li>
          <item-button
            :label="__('Rename/Move')"
            class="d-flex"
            icon="pencil"
            icon-classes="mr-2"
            @click="createNewItem($options.modalTypes.rename)"
          />
        </li>
        <li>
          <item-button
            :label="__('Delete')"
            class="d-flex"
            icon="remove"
            icon-classes="mr-2"
            @click="deleteEntry(path)"
          />
        </li>
      </ul>
    </div>
  </div>
</template>
