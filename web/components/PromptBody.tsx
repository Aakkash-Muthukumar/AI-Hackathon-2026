/** Renders assignment prompt text with separator lines contained inside the card. */

const SEPARATOR_RE = /^[\s\-_=─━—–·.]{4,}$/;

function isSeparatorLine(line: string): boolean {
  const trimmed = line.trim();
  if (trimmed.length < 4) return false;
  return SEPARATOR_RE.test(trimmed);
}

export function PromptBody({ text }: { text: string }) {
  const lines = text.split("\n");

  return (
    <div className="min-w-0 space-y-1.5 text-sm text-gray-700 leading-relaxed">
      {lines.map((line, i) => {
        if (isSeparatorLine(line)) {
          return <hr key={i} className="my-3 border-0 border-t border-gray-200" />;
        }
        if (line.trim() === "") {
          return <div key={i} className="h-2" aria-hidden="true" />;
        }
        return (
          <p
            key={i}
            className="whitespace-pre-wrap break-words [overflow-wrap:anywhere]"
          >
            {line}
          </p>
        );
      })}
    </div>
  );
}
