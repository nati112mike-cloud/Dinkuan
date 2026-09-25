import Link from "next/link";
import { Fragment } from "react";

/** Caption text with #hashtags and @mentions linked. */
export function Caption({ text, className = "" }: { text: string; className?: string }) {
  const parts = text.split(/((?:^|(?<=\s))[#@][\p{L}\p{M}\p{N}_.]+)/u);
  return (
    <p className={`whitespace-pre-line break-words ${className}`}>
      {parts.map((part, i) => {
        if (part.startsWith("#") && part.length > 1) {
          return (
            <Link key={i} href={`/tag/${encodeURIComponent(part.slice(1).toLowerCase())}`} className="font-semibold text-tent-600">
              {part}
            </Link>
          );
        }
        if (part.startsWith("@") && /^@[a-z0-9_.]{3,30}$/i.test(part.replace(/\.$/, ""))) {
          const name = part.replace(/\.$/, "").slice(1).toLowerCase();
          return (
            <Fragment key={i}>
              <Link href={`/u/${name}`} className="font-semibold text-tent-600">
                @{name}
              </Link>
              {part.endsWith(".") ? "." : ""}
            </Fragment>
          );
        }
        return <Fragment key={i}>{part}</Fragment>;
      })}
    </p>
  );
}
