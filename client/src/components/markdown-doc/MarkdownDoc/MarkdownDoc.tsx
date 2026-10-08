import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { MD_COMPONENTS } from "./constants";

/** Renders markdown with the app's element styles. Raw HTML is never rendered. */
export function MarkdownDoc({ children }: { children: string }) {
  return (
    <ReactMarkdown remarkPlugins={[remarkGfm]} components={MD_COMPONENTS}>
      {children}
    </ReactMarkdown>
  );
}
