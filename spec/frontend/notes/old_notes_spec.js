/* eslint-disable import/no-commonjs, no-new */

import $ from 'jquery';
import _ from 'underscore';
import MockAdapter from 'axios-mock-adapter';
import axios from '~/lib/utils/axios_utils';
import * as urlUtility from '~/lib/utils/url_utility';
import '~/behaviors/markdown/render_gfm';
import { createSpyObj } from 'helpers/jest_helpers';
import { setTestTimeoutOnce } from 'helpers/timeout';
import { TEST_HOST } from 'helpers/test_constants';

// These must be imported synchronously because they pull dependencies
// from the DOM.
window.jQuery = $;
require('autosize');
require('~/commons');
require('~/notes');

const { Notes } = window;
const FLASH_TYPE_ALERT = 'alert';
const NOTES_POST_PATH = /(.*)\/notes\?html=true$/;
const fixture = 'snippets/show.html';
let mockAxios;

window.project_uploads_path = `${TEST_HOST}/uploads`;
window.gon = window.gon || {};
window.gl = window.gl || {};
gl.utils = gl.utils || {};
gl.utils.disableButtonIfEmptyField = () => {};

describe('Old Notes (~/notes.js)', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    loadFixtures(fixture);

    // Re-declare this here so that test_setup.js#beforeEach() doesn't
    // overwrite it.
    mockAxios = new MockAdapter(axios);

    $.ajax = () => {
      throw new Error('$.ajax should not be called through!');
    };

    // These jQuery+DOM tests are super flaky so increase the timeout to avoid
    // random failures.
    // It seems that running tests in parallel increases failure rate.
    jest.setTimeout(4000);
    setTestTimeoutOnce(4000);
  });

  afterEach(() => {
    // The Notes component sets a polling interval. Clear it after every run.
    // Make sure to use jest.runOnlyPendingTimers() instead of runAllTimers().
    jest.clearAllTimers();

    return axios.waitForAll().finally(() => mockAxios.restore());
  });

  it('loads the Notes class into the DOM', () => {
    expect(Notes).toBeDefined();
    expect(Notes.name).toBe('Notes');
  });

  describe('addBinding', () => {
    it('calls postComment when comment button is clicked', () => {
      jest.spyOn(Notes.prototype, 'postComment');

      new window.Notes('', []);
      $('.js-comment-button').click();
      expect(Notes.prototype.postComment).toHaveBeenCalled();
    });
  });

  describe('task lists', () => {
    beforeEach(() => {
      mockAxios.onAny().reply(200, {});
      new Notes('', []);
    });

    it('modifies the Markdown field', () => {
      const changeEvent = document.createEvent('HTMLEvents');
      changeEvent.initEvent('change', true, true);
      $('input[type=checkbox]')
        .attr('checked', true)[0]
        .dispatchEvent(changeEvent);

      expect($('.js-task-list-field.original-task-list').val()).toBe('- [x] Task List Item');
    });

    it('submits an ajax request on tasklist:changed', () => {
      jest.spyOn(axios, 'patch');

      const lineNumber = 8;
      const lineSource = '- [ ] item 8';
      const index = 3;
      const checked = true;

      $('.js-task-list-container').trigger({
        type: 'tasklist:changed',
        detail: { lineNumber, lineSource, index, checked },
      });

      expect(axios.patch).toHaveBeenCalledWith(undefined, {
        note: {
          note: '',
          lock_version: undefined,
          update_task: { index, checked, line_number: lineNumber, line_source: lineSource },
        },
      });
    });
  });

  describe('comments', () => {
    let notes;
    let autosizeSpy;
    let textarea;

    beforeEach(() => {
      notes = new Notes('', []);

      textarea = $('.js-note-text');
      textarea.data('autosave', {
        reset: () => {},
      });
      autosizeSpy = jest.fn();
      $(textarea).on('autosize:update', autosizeSpy);

      jest.spyOn(notes, 'renderNote');

      $('.js-comment-button').on('click', e => {
        const $form = $(this);
        e.preventDefault();
        notes.addNote($form, {});
        notes.reenableTargetFormSubmitButton(e);
        notes.resetMainTargetForm(e);
      });
    });

    it('autosizes after comment submission', () => {
      textarea.text('This is an example comment note');
      expect(autosizeSpy).not.toHaveBeenCalled();
      $('.js-comment-button').click();
      expect(autosizeSpy).toHaveBeenCalled();
    });

    it('should not place escaped text in the comment box in case of error', () => {
      const deferred = $.Deferred();
      jest.spyOn($, 'ajax').mockReturnValueOnce(deferred);
      $(textarea).text('A comment with `markup`.');

      deferred.reject();
      $('.js-comment-button').click();

      expect($(textarea).val()).toBe('A comment with `markup`.');

      $.ajax.mockRestore();
      expect($.ajax.mock).toBeUndefined();
    });
  });

  describe('updateNote', () => {
    let notes;
    let noteEntity;
    let $notesContainer;

    beforeEach(() => {
      notes = new Notes('', []);
      window.gon.current_username = 'root';
      window.gon.current_user_fullname = 'Administrator';
      const sampleComment = 'foo';
      noteEntity = {
        id: 1234,
        html: `<li class="note note-row-1234 timeline-entry" id="note_1234">
                <div class="note-text">${sampleComment}</div>
                </li>`,
        note: sampleComment,
        valid: true,
      };

      $notesContainer = $('ul.main-notes-list');
      const $form = $('form.js-main-target-form');
      $form.find('textarea.js-note-text').val(sampleComment);

      mockAxios.onPost(NOTES_POST_PATH).reply(200, noteEntity);
    });

    it('updates note and resets edit form', () => {
      jest.spyOn(notes, 'revertNoteEditForm');
      jest.spyOn(notes, 'setupNewNote');

      $('.js-comment-button').click();

      const $targetNote = $notesContainer.find(`#note_${noteEntity.id}`);
      const updatedNote = Object.assign({}, noteEntity);
      updatedNote.note = 'bar';
      notes.updateNote(updatedNote, $targetNote);

      expect(notes.revertNoteEditForm).toHaveBeenCalledWith($targetNote);
      expect(notes.setupNewNote).toHaveBeenCalled();
    });
  });

  describe('updateNoteTargetSelector', () => {
    const hash = 'note_foo';
    let $note;

    beforeEach(() => {
      $note = $(`<div id="${hash}"></div>`);
      jest.spyOn($note, 'filter');
      jest.spyOn($note, 'toggleClass');
    });

    afterEach(() => {
      expect(typeof urlUtility.getLocationHash.mock).toBe('object');
      urlUtility.getLocationHash.mockRestore();
      expect(urlUtility.getLocationHash.mock).toBeUndefined();
      expect(urlUtility.getLocationHash()).toBeNull();
    });

    // urlUtility is a dependency of the notes module. Its getLocatinHash() method should be called internally.

    it('sets target when hash matches', () => {
      jest.spyOn(urlUtility, 'getLocationHash').mockReturnValueOnce(hash);

      Notes.updateNoteTargetSelector($note);

      expect(urlUtility.getLocationHash).toHaveBeenCalled();
      expect($note.filter).toHaveBeenCalledWith(`#${hash}`);
      expect($note.toggleClass).toHaveBeenCalledWith('target', true);
    });

    it('unsets target when hash does not match', () => {
      jest.spyOn(urlUtility, 'getLocationHash').mockReturnValueOnce('note_doesnotexist');

      Notes.updateNoteTargetSelector($note);

      expect(urlUtility.getLocationHash).toHaveBeenCalled();
      expect($note.toggleClass).toHaveBeenCalledWith('target', false);
    });

    it('unsets target when there is not a hash fragment anymore', () => {
      jest.spyOn(urlUtility, 'getLocationHash').mockReturnValueOnce(null);

      Notes.updateNoteTargetSelector($note);

      expect(urlUtility.getLocationHash).toHaveBeenCalled();
      expect($note.toggleClass).toHaveBeenCalledWith('target', false);
    });
  });

  describe('renderNote', () => {
    let notes;
    let note;
    let $notesList;

    beforeEach(() => {
      note = {
        id: 1,
        valid: true,
        note: 'heya',
        html: '<div>heya</div>',
      };
      $notesList = createSpyObj('$notesList', ['find', 'append']);

      notes = createSpyObj('notes', [
        'setupNewNote',
        'refresh',
        'collapseLongCommitList',
        'updateNotesCount',
        'putConflictEditWarningInPlace',
      ]);
      notes.taskList = createSpyObj('tasklist', ['init']);
      notes.note_ids = [];
      notes.updatedNotesTrackingMap = {};

      jest.spyOn(Notes, 'isNewNote');
      jest.spyOn(Notes, 'isUpdatedNote');
      jest.spyOn(Notes, 'animateAppendNote');
      jest.spyOn(Notes, 'animateUpdateNote');
    });

    describe('when adding note', () => {
      it('should call .animateAppendNote', () => {
        Notes.isNewNote.mockReturnValueOnce(true);
        Notes.prototype.renderNote.call(notes, note, null, $notesList);

        expect(Notes.animateAppendNote).toHaveBeenCalledWith(note.html, $notesList);
      });
    });

    describe('when note was edited', () => {
      it('should call .animateUpdateNote', () => {
        Notes.isNewNote.mockReturnValueOnce(false);
        Notes.isUpdatedNote.mockReturnValueOnce(true);
        const $note = $('<div>');
        $notesList.find.mockReturnValueOnce($note);
        const $newNote = $(note.html);
        Notes.animateUpdateNote.mockReturnValueOnce($newNote);

        Notes.prototype.renderNote.call(notes, note, null, $notesList);

        expect(Notes.animateUpdateNote).toHaveBeenCalledWith(note.html, $note);
        expect(notes.setupNewNote).toHaveBeenCalledWith($newNote);
      });

      describe('while editing', () => {
        it('should update textarea if nothing has been touched', () => {
          Notes.isNewNote.mockReturnValueOnce(false);
          Notes.isUpdatedNote.mockReturnValueOnce(true);
          const $note = $(`<div class="is-editing">
            <div class="original-note-content">initial</div>
            <textarea class="js-note-text">initial</textarea>
          </div>`);
          $notesList.find.mockReturnValueOnce($note);
          Notes.prototype.renderNote.call(notes, note, null, $notesList);

          expect($note.find('.js-note-text').val()).toEqual(note.note);
        });

        it('should call .putConflictEditWarningInPlace', () => {
          Notes.isNewNote.mockReturnValueOnce(false);
          Notes.isUpdatedNote.mockReturnValueOnce(true);
          const $note = $(`<div class="is-editing">
            <div class="original-note-content">initial</div>
            <textarea class="js-note-text">different</textarea>
          </div>`);
          $notesList.find.mockReturnValueOnce($note);
          Notes.prototype.renderNote.call(notes, note, null, $notesList);

          expect(notes.putConflictEditWarningInPlace).toHaveBeenCalledWith(note, $note);
        });
      });
    });
  });

  describe('isUpdatedNote', () => {
    it('should consider same note text as the same', () => {
      const result = Notes.isUpdatedNote(
        {
          note: 'initial',
        },
        $(`<div>
          <div class="original-note-content">initial</div>
        </div>`),
      );

      expect(result).toEqual(false);
    });

    it('should consider same note with trailing newline as the same', () => {
      const result = Notes.isUpdatedNote(
        {
          note: 'initial\n',
        },
        $(`<div>
          <div class="original-note-content">initial\n</div>
        </div>`),
      );

      expect(result).toEqual(false);
    });

    it('should consider different notes as different', () => {
      const result = Notes.isUpdatedNote(
        {
          note: 'foo',
        },
        $(`<div>
          <div class="original-note-content">bar</div>
        </div>`),
      );

      expect(result).toEqual(true);
    });
  });

  describe('renderDiscussionNote', () => {
    let discussionContainer;
    let note;
    let notes;
    let $form;
    let row;

    beforeEach(() => {
      note = {
        html: '<li></li>',
        discussion_html: '<div></div>',
        discussion_id: 1,
        discussion_resolvable: false,
        diff_discussion_html: false,
      };
      $form = createSpyObj('$form', ['closest', 'find']);
      $form.length = 1;
      row = createSpyObj('row', ['prevAll', 'first', 'find']);

      notes = createSpyObj('notes', ['isParallelView', 'updateNotesCount']);
      notes.note_ids = [];

      jest.spyOn(Notes, 'isNewNote');
      jest.spyOn(Notes, 'animateAppendNote').mockImplementation();
      Notes.isNewNote.mockReturnValue(true);
      notes.isParallelView.mockReturnValue(false);
      row.prevAll.mockReturnValue(row);
      row.first.mockReturnValue(row);
      row.find.mockReturnValue(row);
    });

    describe('Discussion root note', () => {
      let body;

      beforeEach(() => {
        body = createSpyObj('body', ['attr']);
        discussionContainer = { length: 0 };

        $form.closest.mockReturnValueOnce(row).mockReturnValue($form);
        $form.find.mockReturnValue(discussionContainer);
        body.attr.mockReturnValue('');
      });

      it('should call Notes.animateAppendNote', () => {
        Notes.prototype.renderDiscussionNote.call(notes, note, $form);

        expect(Notes.animateAppendNote).toHaveBeenCalledWith(
          note.discussion_html,
          $('.main-notes-list'),
        );
      });

      it('should append to row selected with line_code', () => {
        $form.length = 0;
        note.discussion_line_code = 'line_code';
        note.diff_discussion_html = '<tr></tr>';

        const line = document.createElement('div');
        line.id = note.discussion_line_code;
        document.body.appendChild(line);

        // Override mocks for this single test
        $form.closest.mockReset();
        $form.closest.mockReturnValue($form);

        Notes.prototype.renderDiscussionNote.call(notes, note, $form);

        expect(line.nextSibling.outerHTML).toEqual(note.diff_discussion_html);
      });
    });

    describe('Discussion sub note', () => {
      beforeEach(() => {
        discussionContainer = { length: 1 };

        $form.closest.mockReturnValueOnce(row).mockReturnValueOnce($form);
        $form.find.mockReturnValue(discussionContainer);

        Notes.prototype.renderDiscussionNote.call(notes, note, $form);
      });

      it('should call Notes.animateAppendNote', () => {
        expect(Notes.animateAppendNote).toHaveBeenCalledWith(note.html, discussionContainer);
      });
    });
  });

  describe('animateAppendNote', () => {
    let noteHTML;
    let $notesList;
    let $resultantNote;

    beforeEach(() => {
      noteHTML = '<div></div>';
      $notesList = createSpyObj('$notesList', ['append']);

      $resultantNote = Notes.animateAppendNote(noteHTML, $notesList);
    });

    it('should have `fade-in-full` class', () => {
      expect($resultantNote.hasClass('fade-in-full')).toEqual(true);
    });

    it('should append note to the notes list', () => {
      expect($notesList.append).toHaveBeenCalledWith($resultantNote);
    });
  });

  describe('animateUpdateNote', () => {
    let noteHTML;
    let $note;
    let $updatedNote;

    beforeEach(() => {
      noteHTML = '<div></div>';
      $note = createSpyObj('$note', ['replaceWith']);

      $updatedNote = Notes.animateUpdateNote(noteHTML, $note);
    });

    it('should have `fade-in` class', () => {
      expect($updatedNote.hasClass('fade-in')).toEqual(true);
    });

    it('should call replaceWith on $note', () => {
      expect($note.replaceWith).toHaveBeenCalledWith($updatedNote);
    });
  });

  describe('putEditFormInPlace', () => {
    it('should call GLForm with GFM parameter passed through', () => {
      const notes = new Notes('', []);
      const $el = $(`
        <div>
          <form></form>
        </div>
      `);

      notes.putEditFormInPlace($el);

      expect(notes.glForm.enableGFM).toBeTruthy();
    });
  });

  describe('postComment & updateComment', () => {
    const sampleComment = 'foo';
    const note = {
      id: 1234,
      html: `<li class="note note-row-1234 timeline-entry" id="note_1234">
              <div class="note-text">${sampleComment}</div>
              </li>`,
      note: sampleComment,
      valid: true,
    };
    let notes;
    let $form;
    let $notesContainer;

    function mockNotesPost() {
      mockAxios.onPost(NOTES_POST_PATH).reply(200, note);
    }

    function mockNotesPostError() {
      mockAxios.onPost(NOTES_POST_PATH).networkError();
    }

    beforeEach(() => {
      notes = new Notes('', []);
      window.gon.current_username = 'root';
      window.gon.current_user_fullname = 'Administrator';
      $form = $('form.js-main-target-form');
      $notesContainer = $('ul.main-notes-list');
      $form.find('textarea.js-note-text').val(sampleComment);
    });

    it('should show placeholder note while new comment is being posted', () => {
      mockNotesPost();

      $('.js-comment-button').click();

      expect($notesContainer.find('.note.being-posted').length).toBeGreaterThan(0);
    });

    it('should remove placeholder note when new comment is done posting', done => {
      mockNotesPost();

      $('.js-comment-button').click();

      setImmediate(() => {
        expect($notesContainer.find('.note.being-posted').length).toEqual(0);
        done();
      });
    });

    describe('postComment', () => {
      it('disables the submit button', done => {
        const $submitButton = $form.find('.js-comment-submit-button');

        expect($submitButton).not.toBeDisabled();
        const dummyEvent = {
          preventDefault() {},
          target: $submitButton,
        };
        mockAxios.onPost(NOTES_POST_PATH).replyOnce(() => {
          expect($submitButton).toBeDisabled();
          return [200, note];
        });

        notes
          .postComment(dummyEvent)
          .then(() => {
            expect($submitButton).not.toBeDisabled();
          })
          .then(done)
          .catch(done.fail);
      });
    });

    it('should show actual note element when new comment is done posting', done => {
      mockNotesPost();

      $('.js-comment-button').click();

      setImmediate(() => {
        expect($notesContainer.find(`#note_${note.id}`).length).toBeGreaterThan(0);
        done();
      });
    });

    it('should reset Form when new comment is done posting', done => {
      mockNotesPost();

      $('.js-comment-button').click();

      setImmediate(() => {
        expect($form.find('textarea.js-note-text').val()).toEqual('');
        done();
      });
    });

    it('should show flash error message when new comment failed to be posted', done => {
      mockNotesPostError();
      jest.spyOn(notes, 'addFlash');

      $('.js-comment-button').click();

      setImmediate(() => {
        expect(notes.addFlash).toHaveBeenCalled();
        // JSDom doesn't support the :visible selector yet
        expect(notes.flashContainer.style.display).not.toBe('none');
        done();
      });
    });

    // This is a bad test carried over from the Karma -> Jest migration.
    // The corresponding test in the Karma suite tests for
    // elements and methods that don't actually exist, and gives a false
    // positive pass.
    /*
    it('should show flash error message when comment failed to be updated', done => {
      mockNotesPost();
      jest.spyOn(notes, 'addFlash').mockName('addFlash');

      $('.js-comment-button').click();

      deferredPromise()
        .then(() => {
          const $noteEl = $notesContainer.find(`#note_${note.id}`);
          $noteEl.find('.js-note-edit').click();
          $noteEl.find('textarea.js-note-text').val(updatedComment);

          mockNotesPostError();

          $noteEl.find('.js-comment-save-button').click();
          notes.updateComment({preventDefault: () => {}});
        })
        .then(() => deferredPromise())
        .then(() => {
          const $updatedNoteEl = $notesContainer.find(`#note_${note.id}`);

          expect($updatedNoteEl.hasClass('.being-posted')).toEqual(false); // Remove being-posted visuals
          expect(
            $updatedNoteEl
              .find('.note-text')
              .text()
              .trim(),
          ).toEqual(sampleComment); // See if comment reverted back to original

          expect(notes.addFlash).toHaveBeenCalled();
          expect(notes.flashContainer.style.display).not.toBe('none');
          done();
        })
        .catch(done.fail);
    }, 5000);
    */
  });

  describe('postComment with Slash commands', () => {
    const sampleComment = '/assign @root\n/award :100:';
    const note = {
      commands_changes: {
        assignee_id: 1,
        emoji_award: '100',
      },
      errors: {
        commands_only: ['Commands applied'],
      },
      valid: false,
    };
    let $form;
    let $notesContainer;

    beforeEach(() => {
      mockAxios.onPost(NOTES_POST_PATH).reply(200, note);

      new Notes('', []);
      window.gon.current_username = 'root';
      window.gon.current_user_fullname = 'Administrator';
      gl.awardsHandler = {
        addAwardToEmojiBar: () => {},
        scrollToAwards: () => {},
      };
      gl.GfmAutoComplete = {
        dataSources: {
          commands: '/root/test-project/autocomplete_sources/commands',
        },
      };
      $form = $('form.js-main-target-form');
      $notesContainer = $('ul.main-notes-list');
      $form.find('textarea.js-note-text').val(sampleComment);
    });

    it('should remove slash command placeholder when comment with slash commands is done posting', done => {
      jest.spyOn(gl.awardsHandler, 'addAwardToEmojiBar');
      $('.js-comment-button').click();

      expect($notesContainer.find('.system-note.being-posted').length).toEqual(1); // Placeholder shown

      setImmediate(() => {
        expect($notesContainer.find('.system-note.being-posted').length).toEqual(0); // Placeholder removed
        done();
      });
    });
  });

  describe('update comment with script tags', () => {
    const sampleComment = '<script></script>';
    const updatedComment = '<script></script>';
    const note = {
      id: 1234,
      html: `<li class="note note-row-1234 timeline-entry" id="note_1234">
              <div class="note-text">${sampleComment}</div>
              </li>`,
      note: sampleComment,
      valid: true,
    };
    let $form;
    let $notesContainer;

    beforeEach(() => {
      mockAxios.onPost(NOTES_POST_PATH).reply(200, note);

      new Notes('', []);
      window.gon.current_username = 'root';
      window.gon.current_user_fullname = 'Administrator';
      $form = $('form.js-main-target-form');
      $notesContainer = $('ul.main-notes-list');
      $form.find('textarea.js-note-text').html(sampleComment);
    });

    it('should not render a script tag', done => {
      $('.js-comment-button').click();

      setImmediate(() => {
        const $noteEl = $notesContainer.find(`#note_${note.id}`);
        $noteEl.find('.js-note-edit').click();
        $noteEl.find('textarea.js-note-text').html(updatedComment);
        $noteEl.find('.js-comment-save-button').click();

        const $updatedNoteEl = $notesContainer
          .find(`#note_${note.id}`)
          .find('.js-task-list-container');

        expect(
          $updatedNoteEl
            .find('.note-text')
            .text()
            .trim(),
        ).toEqual('');

        done();
      });
    });
  });

  describe('getFormData', () => {
    let $form;
    let sampleComment;
    let notes;

    beforeEach(() => {
      notes = new Notes('', []);

      $form = $('form');
      sampleComment = 'foobar';
    });

    it('should return form metadata object from form reference', () => {
      $form.find('textarea.js-note-text').val(sampleComment);
      const { formData, formContent, formAction } = notes.getFormData($form);

      expect(formData.indexOf(sampleComment)).toBeGreaterThan(-1);
      expect(formContent).toEqual(sampleComment);
      expect(formAction).toEqual($form.attr('action'));
    });

    it('should return form metadata with sanitized formContent from form reference', () => {
      jest.spyOn(_, 'escape');

      sampleComment = '<script>alert("Boom!");</script>';
      $form.find('textarea.js-note-text').val(sampleComment);

      const { formContent } = notes.getFormData($form);

      expect(_.escape).toHaveBeenCalledWith(sampleComment);
      expect(formContent).toEqual('&lt;script&gt;alert(&quot;Boom!&quot;);&lt;/script&gt;');
    });
  });

  describe('hasQuickActions', () => {
    let notes;

    beforeEach(() => {
      notes = new Notes('', []);
    });

    it('should return true when comment begins with a quick action', () => {
      const sampleComment = '/wip\n/milestone %1.0\n/merge\n/unassign Merging this';
      const hasQuickActions = notes.hasQuickActions(sampleComment);

      expect(hasQuickActions).toBeTruthy();
    });

    it('should return false when comment does NOT begin with a quick action', () => {
      const sampleComment = 'Hey, /unassign Merging this';
      const hasQuickActions = notes.hasQuickActions(sampleComment);

      expect(hasQuickActions).toBeFalsy();
    });

    it('should return false when comment does NOT have any quick actions', () => {
      const sampleComment = 'Looking good, Awesome!';
      const hasQuickActions = notes.hasQuickActions(sampleComment);

      expect(hasQuickActions).toBeFalsy();
    });
  });

  describe('stripQuickActions', () => {
    it('should strip quick actions from the comment which begins with a quick action', () => {
      const notes = new Notes();
      const sampleComment = '/wip\n/milestone %1.0\n/merge\n/unassign Merging this';
      const stripedComment = notes.stripQuickActions(sampleComment);

      expect(stripedComment).toBe('');
    });

    it('should strip quick actions from the comment but leaves plain comment if it is present', () => {
      const notes = new Notes();
      const sampleComment = '/wip\n/milestone %1.0\n/merge\n/unassign\nMerging this';
      const stripedComment = notes.stripQuickActions(sampleComment);

      expect(stripedComment).toBe('Merging this');
    });

    it('should NOT strip string that has slashes within', () => {
      const notes = new Notes();
      const sampleComment = 'http://127.0.0.1:3000/root/gitlab-shell/issues/1';
      const stripedComment = notes.stripQuickActions(sampleComment);

      expect(stripedComment).toBe(sampleComment);
    });
  });

  describe('getQuickActionDescription', () => {
    const availableQuickActions = [
      { name: 'close', description: 'Close this issue', params: [] },
      { name: 'title', description: 'Change title', params: [{}] },
      { name: 'estimate', description: 'Set time estimate', params: [{}] },
    ];
    let notes;

    beforeEach(() => {
      notes = new Notes();
    });

    it('should return executing quick action description when note has single quick action', () => {
      const sampleComment = '/close';

      expect(notes.getQuickActionDescription(sampleComment, availableQuickActions)).toBe(
        'Applying command to close this issue',
      );
    });

    it('should return generic multiple quick action description when note has multiple quick actions', () => {
      const sampleComment = '/close\n/title [Duplicate] Issue foobar';

      expect(notes.getQuickActionDescription(sampleComment, availableQuickActions)).toBe(
        'Applying multiple commands',
      );
    });

    it('should return generic quick action description when available quick actions list is not populated', () => {
      const sampleComment = '/close\n/title [Duplicate] Issue foobar';

      expect(notes.getQuickActionDescription(sampleComment)).toBe('Applying command');
    });
  });

  describe('createPlaceholderNote', () => {
    const sampleComment = 'foobar';
    const uniqueId = 'b1234-a4567';
    const currentUsername = 'root';
    const currentUserFullname = 'Administrator';
    const currentUserAvatar = 'avatar_url';
    let notes;

    beforeEach(() => {
      notes = new Notes('', []);
    });

    it('should return constructed placeholder element for regular note based on form contents', () => {
      const $tempNote = notes.createPlaceholderNote({
        formContent: sampleComment,
        uniqueId,
        isDiscussionNote: false,
        currentUsername,
        currentUserFullname,
        currentUserAvatar,
      });
      const $tempNoteHeader = $tempNote.find('.note-header');

      expect($tempNote.prop('nodeName')).toEqual('LI');
      expect($tempNote.attr('id')).toEqual(uniqueId);
      expect($tempNote.hasClass('being-posted')).toBeTruthy();
      expect($tempNote.hasClass('fade-in-half')).toBeTruthy();
      $tempNote.find('.timeline-icon > a, .note-header-info > a').each((i, el) => {
        expect(el.getAttribute('href')).toEqual(`/${currentUsername}`);
      });

      expect($tempNote.find('.timeline-icon .avatar').attr('src')).toEqual(currentUserAvatar);
      expect($tempNote.find('.timeline-content').hasClass('discussion')).toBeFalsy();
      expect(
        $tempNoteHeader
          .find('.d-none.d-sm-inline-block')
          .text()
          .trim(),
      ).toEqual(currentUserFullname);

      expect(
        $tempNoteHeader
          .find('.note-headline-light')
          .text()
          .trim(),
      ).toEqual(`@${currentUsername}`);

      expect(
        $tempNote
          .find('.note-body .note-text p')
          .text()
          .trim(),
      ).toEqual(sampleComment);
    });

    it('should return constructed placeholder element for discussion note based on form contents', () => {
      const $tempNote = notes.createPlaceholderNote({
        formContent: sampleComment,
        uniqueId,
        isDiscussionNote: true,
        currentUsername,
        currentUserFullname,
      });

      expect($tempNote.prop('nodeName')).toEqual('LI');
      expect($tempNote.find('.timeline-content').hasClass('discussion')).toBeTruthy();
    });

    it('should return a escaped user name', () => {
      const currentUserFullnameXSS = 'Foo <script>alert("XSS")</script>';
      const $tempNote = notes.createPlaceholderNote({
        formContent: sampleComment,
        uniqueId,
        isDiscussionNote: false,
        currentUsername,
        currentUserFullname: currentUserFullnameXSS,
        currentUserAvatar,
      });
      const $tempNoteHeader = $tempNote.find('.note-header');

      expect(
        $tempNoteHeader
          .find('.d-none.d-sm-inline-block')
          .text()
          .trim(),
      ).toEqual('Foo &lt;script&gt;alert(&quot;XSS&quot;)&lt;/script&gt;');
    });
  });

  describe('createPlaceholderSystemNote', () => {
    const sampleCommandDescription = 'Applying command to close this issue';
    const uniqueId = 'b1234-a4567';
    let notes;

    beforeEach(() => {
      notes = new Notes('', []);
      jest.spyOn(_, 'escape');
    });

    it('should return constructed placeholder element for system note based on form contents', () => {
      const $tempNote = notes.createPlaceholderSystemNote({
        formContent: sampleCommandDescription,
        uniqueId,
      });

      expect($tempNote.prop('nodeName')).toEqual('LI');
      expect($tempNote.attr('id')).toEqual(uniqueId);
      expect($tempNote.hasClass('being-posted')).toBeTruthy();
      expect($tempNote.hasClass('fade-in-half')).toBeTruthy();
      expect(
        $tempNote
          .find('.timeline-content i')
          .text()
          .trim(),
      ).toEqual(sampleCommandDescription);
    });
  });

  describe('appendFlash', () => {
    it('shows a flash message', () => {
      const notes = new Notes('', []);
      notes.addFlash('Error message', FLASH_TYPE_ALERT, notes.parentTimeline.get(0));

      const flash = $('.flash-alert')[0];
      expect(document.contains(flash)).toBe(true);
      expect(flash.parentNode.style.display).toBe('block');
    });
  });

  describe('clearFlash', () => {
    beforeEach(() => {
      $(document).off('ajax:success');
    });

    it('hides visible flash message', () => {
      const notes = new Notes('', []);
      notes.addFlash('Error message 1', FLASH_TYPE_ALERT, notes.parentTimeline.get(0));
      const flash = $('.flash-alert')[0];
      notes.clearFlash();
      expect(flash.parentNode.style.display).toBe('none');
      expect(notes.flashContainer).toBeNull();
    });
  });
});
