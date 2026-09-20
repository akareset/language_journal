import {getSettings,t} from './i18n';
import { useEffect } from 'react';
import { EditorContent, useEditor, useEditorState } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import type { Draft } from './note';
import { Icon, type IconName } from './Icon';

export function NoteEditor({ initial, locked, onChange, onBlur }: {
  initial: Draft;
  locked: boolean; onBlur: () => void;
  onChange: (document: Draft['document'], plainText: string) => void;
}) {
  const editor = useEditor({
    extensions: [StarterKit.configure({ link: { openOnClick: false } })],
    content: initial.document,
    editorProps: { attributes: { 'aria-label': t('Journal entry'), lang: initial.language, spellcheck: String(getSettings().spellcheck) } },
    onBlur: () => onBlur(),
    onUpdate: ({ editor }) => onChange(editor.getJSON(), editor.getText({ blockSeparator: '\n' })),
  });
  const active = useEditorState({ editor, selector: ({ editor }) => ({
    bold: editor?.isActive('bold'), italic: editor?.isActive('italic'), underline: editor?.isActive('underline'),
    bulletList: editor?.isActive('bulletList'), orderedList: editor?.isActive('orderedList'),
    blockquote: editor?.isActive('blockquote'), heading: editor?.isActive('heading', { level: 2 }),
    empty: editor?.isEmpty ?? true, canUndo: editor?.can().undo(), canRedo: editor?.can().redo(),
  }) });
  useEffect(() => { editor?.setEditable(!locked, false); }, [editor, locked]);
  const buttons: { icon: IconName; label: string; pressed?: boolean; action: () => void }[] = [
    { icon: 'bold', label: 'Bold (Ctrl+B)', pressed: active?.bold, action: () => { editor?.chain().focus().toggleBold().run(); } },
    { icon: 'italic', label: 'Italic (Ctrl+I)', pressed: active?.italic, action: () => { editor?.chain().focus().toggleItalic().run(); } },
    { icon: 'underline', label: 'Underline (Ctrl+U)', pressed: active?.underline, action: () => { editor?.chain().focus().toggleUnderline().run(); } },
    { icon: 'list', label: 'Bullet list', pressed: active?.bulletList, action: () => { editor?.chain().focus().toggleBulletList().run(); } },
    { icon: 'numbered', label: 'Numbered list', pressed: active?.orderedList, action: () => { editor?.chain().focus().toggleOrderedList().run(); } },
    { icon: 'quote', label: 'Block quote', pressed: active?.blockquote, action: () => { editor?.chain().focus().toggleBlockquote().run(); } },
  ];
  return <div className="editor-panel">
    <div className="editor-toolbar" role="group" aria-label={t("Text formatting")}>
      <select aria-label={t("Paragraph style")} value={active?.heading ? 'heading' : 'paragraph'} disabled={locked || !editor}
        onChange={event => event.target.value === 'heading' ? editor?.chain().focus().setHeading({ level: 2 }).run() : editor?.chain().focus().setParagraph().run()}>
        <option value="paragraph">{t("Normal")}</option><option value="heading">{t("Heading")}</option>
      </select>
      <span className="toolbar-divider" />
      {buttons.map(button => <button className="icon-button" key={button.icon} title={t(button.label)} aria-label={t(button.label)} aria-pressed={!!button.pressed} disabled={locked || !editor}
        onMouseDown={event => event.preventDefault()} onClick={button.action}><Icon name={button.icon} size={16} /></button>)}
      <span className="toolbar-spacer" />
      <button className="icon-button" aria-label={t("Undo")} title={t("Undo (Ctrl+Z)")} disabled={locked || !active?.canUndo} onMouseDown={event => event.preventDefault()} onClick={() => editor?.chain().focus().undo().run()}><Icon name="undo" size={15} /></button>
      <button className="icon-button" aria-label={t("Redo")} title={t("Redo (Ctrl+Y)")} disabled={locked || !active?.canRedo} onMouseDown={event => event.preventDefault()} onClick={() => editor?.chain().focus().redo().run()}><Icon name="redo" size={15} /></button>
    </div>
    <div className="editor-wrap">
      <EditorContent editor={editor} />
      {active?.empty && <div className="editor-placeholder" aria-hidden="true">{t("What has been on your mind today?")}<span>{t("Begin anywhere. This space is yours.")}</span></div>}
    </div>
  </div>;
}
