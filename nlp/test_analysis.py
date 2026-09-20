import unittest
import spacy
from analyze import analyze

class AnalysisTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.nlp = spacy.load('de_core_news_sm', exclude=['ner'])
    def words(self, text):
        return {w['key']: w for w in analyze(self.nlp, text)['lemmas']}
    def test_inflections_and_function_words(self):
        words = self.words('Der Mann ging nach Hause. Der Mann geht nach Hause.')
        self.assertEqual(words['gehen']['count'], 2)
        self.assertNotIn('der', words)
        self.assertNotIn('nach', words)
        self.assertEqual({f['form'] for f in words['gehen']['forms']}, {'ging', 'geht'})
        self.assertTrue(all(f['morph'] for f in words['gehen']['forms']))
    def test_reflexives_and_separable_verbs(self):
        words = self.words('Ich freue mich. Sie freut sich. Ich habe mich gefreut. Sie steht auf. Wir ruhen uns aus.')
        self.assertEqual(words['sich freuen']['count'], 3)
        self.assertIn('aufstehen', words)
        self.assertIn('sich ausruhen', words)
    def test_ordinary_object_is_not_reflexive(self):
        words = self.words('Sie sieht mich. Ich sehe sie.')
        self.assertIn('sehen', words)
        self.assertNotIn('sich sehen', words)
    def test_empty_and_articles(self):
        self.assertEqual(self.words(''), {})
        self.assertEqual(self.words('der die das und oder aber'), {})



class EnglishTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.nlp = spacy.load('en_core_web_sm', exclude=['ner'])
    def test_english_inflections_pos_morphology_and_stop_words(self):
        words = {w['key']: w for w in analyze(self.nlp, 'The children went home. A child goes home. I am writing and I wrote a beautiful note.')['lemmas']}
        self.assertEqual(words['go']['count'], 2)
        self.assertEqual(words['child']['count'], 2)
        self.assertEqual(words['write']['count'], 2)
        self.assertNotIn('the', words)
        self.assertNotIn('be', words)
        self.assertEqual(words['beautiful']['pos'], 'ADJ')
        self.assertTrue(words['write']['forms'][0]['morph'])
        self.assertFalse(any(k.startswith('sich ') for k in words))

if __name__ == '__main__':
    unittest.main()
