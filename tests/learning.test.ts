import {test} from 'node:test';
import assert from 'node:assert/strict';
import {clozeExample} from '../src/learningText.ts';
test('cloze hides all whole-word occurrences including Unicode and leaves other words intact',()=>{
  assert.equal(clozeExample('Grüße! Viele Grüße aus Köln.','Grüße'),'[…]! Viele […] aus Köln.');
  assert.equal(clozeExample('Ich lerne gerne. Lernen macht Spaß.','lerne'),'Ich […] gerne. Lernen macht Spaß.');
  assert.equal(clozeExample('Go, go! Going home.','go'),'[…], […]! Going home.');
});
test('cloze supports phrases and literal punctuation without exposing a regex',()=>{
  assert.equal(clozeExample('Ich freue mich auf morgen.','freue mich'),'Ich […] auf morgen.');
  assert.equal(clozeExample('I learn C++.','C++'),'I learn […].');
  assert.equal(clozeExample('hello',''),'hello');
});
