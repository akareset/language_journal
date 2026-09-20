"""Local JSON-lines worker. Only linguistic analysis; Rust owns all storage."""
import json
import sys
import unicodedata
from collections import Counter

MEANINGFUL_POS = {"NOUN", "PROPN", "VERB", "ADJ", "ADV", "INTJ"}
FUNCTION_VERBS = {"sein", "haben", "werden", "können", "müssen", "sollen", "wollen", "dürfen", "mögen"}


def is_reflexive(verb):
    subjects = []
    for head in [verb, *verb.ancestors]:
        subjects = [child for child in head.children if child.dep_ == "sb"]
        if subjects:
            break
    for child in verb.children:
        if child.tag_ == "PRF" or "Yes" in child.morph.get("Reflex"):
            return True
        # The small German model sometimes labels "mich" in "ich habe mich
        # gefreut" as PPER. Resolve first/second-person coreference via subjects.
        if child.pos_ == "PRON" and child.dep_ in {"oa", "da"}:
            if child.lower_ == "sich":
                return True
            person = child.morph.get("Person")
            if person in (["1"], ["2"]) and any(
                subject.morph.get("Person") == person
                and subject.morph.get("Number") == child.morph.get("Number") for subject in subjects
            ):
                return True
    return False


def analyze(nlp, text):
    language = nlp.lang
    doc = nlp(unicodedata.normalize("NFC", text))
    groups = {}
    for token in doc:
        if token.pos_ not in MEANINGFUL_POS or token.like_url or token.like_email:
            continue
        lemma = unicodedata.normalize("NFC", token.lemma_.strip())
        if not lemma or not any(char.isalpha() for char in lemma):
            continue
        # spaCy's broad German stop list includes lexical gehen/ging/geht.
        # Keep content nouns and lexical verbs; exclude function POS entirely,
        # auxiliary/modal lemmas explicitly, and stop-listed modifiers.
        if token.pos_ == "VERB" and lemma.lower() in (FUNCTION_VERBS if language == "de" else {"be", "have", "do", "can", "will", "shall", "may", "must"}):
            continue
        if (token.is_stop or lemma.lower() in nlp.Defaults.stop_words) and token.pos_ not in {"VERB", "NOUN", "PROPN"}:
            continue
        if token.pos_ == "VERB" and language == "de":
            particles = [child for child in token.children if child.dep_ == "svp" or child.tag_ == "PTKVZ"]
            for particle in sorted(particles, key=lambda item: item.i):
                prefix = particle.lower_
                if not lemma.lower().startswith(prefix):
                    lemma = prefix + lemma
            # The German parser attaches reflexive pronouns to their governing
            # verb. PRF distinguishes reflexive mich/dich/sich from other objects.
            reflexive = is_reflexive(token)
            if reflexive:
                lemma = "sich " + lemma
        key = lemma.lower()  # Preserve ß: casefold would conflate Maße and Masse.
        group_key = (key, token.pos_)
        group = groups.setdefault(group_key, {
            "key": key, "lemma": lemma, "pos": token.pos_, "count": 0,
            "firstPosition": token.i, "forms": Counter(),
        })
        group["count"] += 1
        form = (token.text, str(token.morph))
        group["forms"][form] += 1
    lemmas = []
    for group in groups.values():
        group["forms"] = [{"form": form, "morph": morph, "count": count}
                          for (form, morph), count in group["forms"].items()]
        lemmas.append(group)
    return {"lemmas": lemmas, "modelVersion": f"{nlp.lang}_{nlp.meta['name']} {nlp.meta['version']}"}


def main():
    sys.stdin.reconfigure(encoding="utf-8")
    sys.stdout.reconfigure(encoding="utf-8")
    import spacy
    models = {"de": "de_core_news_sm", "en": "en_core_web_sm"}
    pipelines = {}
    for line in sys.stdin:
        try:
            request = json.loads(line)
            language = request.get("language", "de")
            if language not in models:
                raise ValueError("Unsupported language")
            if language not in pipelines:
                pipelines[language] = spacy.load(models[language], exclude=["ner"])
            result = analyze(pipelines[language], request["text"])
        except Exception as error:
            result = {"error": f"Local analysis failed: {error}. Run scripts/setup-nlp.ps1 and retry."}
        print(json.dumps(result, ensure_ascii=False), flush=True)


if __name__ == "__main__":
    main()