# frozen_string_literal: true

# This spec is a lightweight version of:
#   * project/tree_restorer_spec.rb
#
# In depth testing is being done in the above specs.
# This spec tests that restore project works
# but does not have 100% relation coverage.

require 'spec_helper'

describe Gitlab::ImportExport::RelationTreeRestorer do
  include ImportExport::CommonUtil

  let(:user) { create(:user) }
  let(:shared) { Gitlab::ImportExport::Shared.new(importable) }
  let(:members_mapper) { Gitlab::ImportExport::MembersMapper.new(exported_members: {}, user: user, importable: importable) }

  let(:importable_hash) do
    json = IO.read(path)
    ActiveSupport::JSON.decode(json)
  end

  let(:relation_tree_restorer) do
    described_class.new(
      user:             user,
      shared:           shared,
      relation_reader:  relation_reader,
      importable:       importable,
      object_builder:   object_builder,
      members_mapper:   members_mapper,
      relation_factory: relation_factory,
      reader:           reader
    )
  end

  subject { relation_tree_restorer.restore }

  shared_examples 'import project successfully' do
    it 'restores project tree' do
      expect(subject).to eq(true)
    end

    describe 'imported project' do
      let(:project) { Project.find_by_path('project') }

      before do
        subject
      end

      it 'has the project attributes and relations' do
        expect(project.description).to eq('Nisi et repellendus ut enim quo accusamus vel magnam.')
        expect(project.labels.count).to eq(3)
        expect(project.boards.count).to eq(1)
        expect(project.project_feature).not_to be_nil
        expect(project.custom_attributes.count).to eq(2)
        expect(project.project_badges.count).to eq(2)
        expect(project.snippets.count).to eq(1)
      end
    end
  end

  context 'when restoring a project' do
    let(:path) { 'spec/fixtures/lib/gitlab/import_export/complex/project.json' }
    let(:importable) { create(:project, :builds_enabled, :issues_disabled, name: 'project', path: 'project') }
    let(:object_builder) { Gitlab::ImportExport::Project::ObjectBuilder }
    let(:relation_factory) { Gitlab::ImportExport::Project::RelationFactory }
    let(:reader) { Gitlab::ImportExport::Reader.new(shared: shared) }

    context 'using legacy reader' do
      let(:relation_reader) { Gitlab::ImportExport::JSON::LegacyReader::File.new(path, reader.project_relation_names) }

      it_behaves_like 'import project successfully'
    end
  end
end
