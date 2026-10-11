import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeHighlight from "rehype-highlight";
import { cn } from "@/lib/utils";

/**
 * Safe Markdown rendering: raw HTML is not rendered (no rehype-raw), and
 * react-markdown's default URL transform drops javascript:/data: links.
 */
export function Markdown({ children, className }: { children: string; className?: string }) {
  if (!children?.trim()) return null;
  return (
    <div className={cn("prose-cq text-sm", className)}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        rehypePlugins={[[rehypeHighlight, { detect: false, ignoreMissing: true }]]}
        skipHtml
        components={{
          a: ({ href, children }) => (
            <a href={href} rel="noopener noreferrer nofollow" target={href?.startsWith("/") ? undefined : "_blank"}>
              {children}
            </a>
          ),
          img: ({ alt }) => <span className="text-muted">[image: {alt}]</span>,
        }}
      >
        {children}
      </ReactMarkdown>
    </div>
  );
}
