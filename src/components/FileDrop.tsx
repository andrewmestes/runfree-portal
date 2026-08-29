"use client";

import { useRef, useState } from "react";

/**
 * One place to put files, whatever they are.
 *
 * Andrew: "Let's just make it 'drop files here' ... That way it's easy to just
 * add any file type in one location, also make it either a choose file or a
 * drag and drop from a computer to upload files."
 *
 * It replaced two labelled inputs — IMAGE and DOCUMENT, one file each — which
 * asked the person adding a flipchart photo to first decide which of the two
 * boxes a photo belongs in, and silently offered no room for a second one.
 */
export type StagedFile = { file: File; isImage: boolean; url?: string };

export function isImageFile(f: File): boolean {
  return f.type.startsWith("image/");
}

export default function FileDrop({
  staged,
  onAdd,
  onRemove,
  note,
}: {
  staged: StagedFile[];
  onAdd: (files: File[]) => void;
  onRemove: (index: number) => void;
  /** Shown under the zone — e.g. which image will become the card's picture. */
  note?: string;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);

  function take(list: FileList | null) {
    if (!list || list.length === 0) return;
    onAdd(Array.from(list));
  }

  return (
    <div>
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setOver(true);
        }}
        onDragLeave={() => setOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setOver(false);
          take(e.dataTransfer.files);
        }}
        onClick={() => input.current?.click()}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            input.current?.click();
          }
        }}
        className={`cursor-pointer rounded-xl border-2 border-dashed px-4 py-6 text-center transition ${
          over
            ? "border-runfree-magenta bg-runfree-pink/40"
            : "border-gray-300 hover:border-runfree-magenta/50 hover:bg-runfree-indigo/20"
        }`}
      >
        <p className="text-sm font-semibold text-runfree-ink">Drop files here</p>
        <p className="mt-1 text-xs text-gray-500">
          Photos, PDFs, anything — or <span className="font-semibold text-runfree-magentaDeep">choose files</span>
        </p>
        <input
          ref={input}
          type="file"
          multiple
          data-filedrop=""
          className="hidden"
          onChange={(e) => {
            take(e.target.files);
            // Let the same file be picked again after a remove.
            e.target.value = "";
          }}
        />
      </div>

      {staged.length > 0 && (
        <ul className="mt-3 space-y-1.5">
          {staged.map((s, i) => (
            <li
              key={`${s.file.name}-${i}`}
              className="flex items-center gap-2.5 rounded-lg bg-gray-50 px-3 py-2"
            >
              {s.isImage && s.url ? (
                /* eslint-disable-next-line @next/next/no-img-element */
                <img src={s.url} alt="" className="h-9 w-9 shrink-0 rounded object-cover" />
              ) : (
                <span className="grid h-9 w-9 shrink-0 place-items-center rounded bg-white text-gray-400 ring-1 ring-gray-200">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4">
                    <path d="M14 3v5h5" />
                    <path d="M19 8v11a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h7z" />
                  </svg>
                </span>
              )}
              <span className="min-w-0 flex-1 truncate text-xs text-gray-700">{s.file.name}</span>
              <button
                type="button"
                onClick={() => onRemove(i)}
                className="shrink-0 text-[11px] font-semibold text-gray-400 transition hover:text-runfree-magentaDeep"
              >
                Remove
              </button>
            </li>
          ))}
        </ul>
      )}

      {note && <p className="mt-2 text-[11px] text-gray-500">{note}</p>}
    </div>
  );
}
