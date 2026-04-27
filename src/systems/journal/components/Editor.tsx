"use client";

import { useEditor, EditorContent, Editor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Placeholder from "@tiptap/extension-placeholder";
import { Markdown, type MarkdownStorage } from "tiptap-markdown";
import { useEffect } from "react";

interface JournalEditorProps {
  initialBody?: string;
  onChange?: (body: string) => void;
  onEditorReady?: (editor: Editor) => void;
}

export function JournalEditor({
  initialBody = "",
  onChange,
  onEditorReady,
}: JournalEditorProps) {
  const editor = useEditor({
    extensions: [
      // StarterKit 3.x bundles Link; configure it here instead of importing
      // separately (which produces a duplicate-extension warning at runtime).
      StarterKit.configure({ link: { openOnClick: false } }),
      Placeholder.configure({
        placeholder: "What did you build, learn, or wrestle with?",
      }),
      Markdown.configure({ html: false, breaks: true, linkify: true }),
    ],
    content: initialBody,
    immediatelyRender: false,
    onUpdate({ editor }) {
      const storage = editor.storage as unknown as { markdown: MarkdownStorage };
      onChange?.(storage.markdown.getMarkdown());
    },
  });

  useEffect(() => {
    if (editor && onEditorReady) onEditorReady(editor);
  }, [editor, onEditorReady]);

  return <EditorContent editor={editor} />;
}
