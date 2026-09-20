import {test} from 'node:test';
import assert from 'node:assert/strict';
import {applySettings,getSettings,t} from '../src/i18n.ts';
import {blankNote,defaultTitle} from '../src/note.ts';
import {Autosave} from '../src/autosave.ts';
test('German defaults and English language affect labels and new notes, never custom content',()=>{
 assert.deepEqual(getSettings(),{language:'de',spellcheck:false});
 assert.equal(t('Settings'),'Einstellungen');
 const german=blankNote('2026-09-19');assert.equal(german.language,'de');
 applySettings({language:'en',spellcheck:false});
 assert.equal(t('Settings'),'Settings');assert.equal(blankNote('2026-09-19').language,'en');
 assert.equal(defaultTitle('2026-09-19'),'Saturday 19 September');
 assert.equal(german.language,'de');
 const queue=new Autosave(german,async()=>{});assert.throws(()=>queue.update({...german,language:'en'}));queue.dispose();
 applySettings({language:'de',spellcheck:false});
 assert.equal(defaultTitle('2026-09-19'),'Samstag, 19. September');
});
