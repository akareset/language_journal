# AI Insights implementation

1. Keep note storage and autosave local. Only an explicit Analyze action sends a saved text snapshot and the configured teaching prompt to the selected provider.
2. Store named provider/model profiles and separate explanation language (German, English, Ukrainian) in SQLite. Store credentials only in Windows Credential Manager; never return a stored key to the webview. Fixed HTTPS provider endpoints, bounded requests, no secret-bearing error bodies or logs.
3. Use a versioned strict JSON contract and an application-owned rule catalog. Treat notes as data, omit speculative corrections, and explain meaning-dependent suggestions without confidence percentages.
4. Persist immutable note/document snapshots, provider/model, prompt, languages, findings, excluded-finding count, and timestamps. Reject malformed or incomplete responses as failures; validate each finding independently against an exact quote and occurrence.
5. Diff contextual quotes locally by words. Highlight grammar/articles red, word choice purple, optional naturalness orange. Show affected word-order phrases with a struck-through original and an arrow to the replacement.
6. Accept through a ProseMirror transaction, retaining unchanged content and marks; autosave the resulting note and acceptance event atomically. Dismiss records an event before hiding a card. Normal editor undo restores the document; decisions remain an audit trail of actions, not a claim that a correction is still present.
7. Freeze old feedback on its original snapshot when the document changes. Do not apply stale offsets. Keep history accessible per note and through Insights; weekly/monthly aggregation is deferred.
8. Test migration, response validation, provider envelopes, atomic/idempotent decisions, Unicode anchors, formatting, undo, stale feedback and the existing autosave workflow. Live provider checks require a user's configured key and explicit Analyze action.

The editable teaching prompt lives in `src-tauri/src/ai-prompt.txt`. The schema and mandatory anchoring rules are application-controlled, independent of that prompt.

## Final interface

Place review in the right-hand panel instead of the vocabulary preview. Keep writing statistics and streak above it. At narrow widths, keep review below the editor rather than hiding it. Settings uses a single Add API action and a modal containing only provider and password input; select the active API and its model outside the modal. Other AI settings are explanation language, optional naturalness and an expandable tutor prompt.

## Response contract v1

The model must return this shape, without Markdown or extra properties:

```json
{
  "findings": [
    {
      "ruleId": "grammar.article",
      "category": "grammar",
      "quote": "Ich sehe der Hund.",
      "replacement": "Ich sehe den Hund.",
      "occurrence": 0,
      "explanation": "Sehen takes a direct object in the accusative: den Hund.",
      "meaningNote": ""
    }
  ]
}
```

`occurrence` selects an exact, case-sensitive, non-overlapping occurrence of the contextual quote (zero-based). Rust assigns finding IDs and UTF-16 offsets after validation; models do not choose edit positions. The local diff marks just `der`, with replacement `den`. Words in a word-order finding use the entire phrase. All response strings are rendered as text, never HTML.

Rule IDs and their intended scopes are predefined in Rust and described in the default prompt: articles (including their declension), case, agreement, verb form, tense, preposition, pronoun, word order, spelling, punctuation, capitalization, word choice, collocation, naturalness, other. Use the most specific supported identifier. Schema/rule changes require an explicit contract version change so later reviews can interpret old records.

Whole-response parse errors, missing envelopes, refusal, truncation, interrupted transport, and oversized responses fail the analysis. Within a valid envelope, malformed/unknown/overlapping/unanchored/no-op findings are excluded independently and counted. Zero valid plus nonzero excluded findings is incomplete feedback, never “no mistakes.”

## Future review ideas

Aggregate accepted/dismissed patterns per stable rule and note language; offer a short weekly practice exercise for recurring article/case mistakes; compare word-choice patterns over time. Keep meaning-dependent suggestions distinguishable, and treat model output and user decisions as observations rather than ground-truth measures of proficiency. These summaries and exercises are not part of this implementation.
