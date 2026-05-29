import DOMPurify from "isomorphic-dompurify";
import { marked, type Tokens } from "marked";

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

class CustomRenderer extends marked.Renderer {
  override heading(token: Tokens.Heading): string {
    const text = this.parser.parseInline(token.tokens);
    const sizeClass =
      token.depth === 1 ? "text-2xl mt-8" :
      token.depth === 2 ? "text-xl mt-7" :
      token.depth === 3 ? "text-lg mt-6" :
      "text-base mt-5";
    return `<h${token.depth} class="font-display font-semibold text-[var(--accent)] mb-3 ${sizeClass}">${text}</h${token.depth}>\n`;
  }

  override link(token: Tokens.Link): string {
    const text = this.parser.parseInline(token.tokens);
    return `<a href="${token.href}" class="text-[var(--accent)] underline underline-offset-2 hover:text-[var(--ink)]" title="${token.title || ""}">${text}</a>`;
  }

  override list(token: Tokens.List): string {
    const ordered = token.ordered;
    const listTag = ordered ? "ol" : "ul";
    const listClass = ordered ? "list-decimal pl-6 mb-5 space-y-1" : "list-disc pl-6 mb-5 space-y-1";
    let body = "";
    for (const item of token.items) {
      body += this.listitem(item);
    }
    return `<${listTag} class="${listClass}">${body}</${listTag}>\n`;
  }

  override listitem(item: Tokens.ListItem): string {
    const text = this.parser.parse(item.tokens);
    return `<li class="text-[14.5px] leading-[1.7] text-[var(--ink)]">${text}</li>`;
  }

  override paragraph(token: Tokens.Paragraph): string {
    const text = this.parser.parseInline(token.tokens);
    return `<p class="mb-5 text-[14.5px] leading-[1.7] text-[var(--ink)] [text-wrap:pretty] last:mb-0">${text}</p>\n`;
  }

  override blockquote(token: Tokens.Blockquote): string {
    const text = this.parser.parse(token.tokens);
    return `<blockquote class="border-l-2 border-[var(--accent)] pl-4 ml-0 mr-0 mb-5 italic text-[var(--ink-dim)]">${text}</blockquote>\n`;
  }

  override codespan(token: Tokens.Codespan): string {
    return `<code class="font-mono text-[0.9em] bg-[var(--bg-2)] px-[0.4rem] py-[0.2rem] rounded-[2px] border border-[var(--line)]">${escapeHtml(token.text)}</code>`;
  }

  override code(token: Tokens.Code): string {
    return `<pre class="bg-[var(--bg-2)] border border-[var(--line)] p-4 rounded-[2px] overflow-x-auto mb-5"><code class="font-mono text-[0.85em] bg-transparent p-0 border-none rounded-none block">${escapeHtml(token.text)}</code></pre>\n`;
  }

  override strong(token: Tokens.Strong): string {
    const text = this.parser.parseInline(token.tokens);
    return `<strong class="font-semibold text-[var(--ink)]">${text}</strong>`;
  }

  override em(token: Tokens.Em): string {
    const text = this.parser.parseInline(token.tokens);
    return `<em class="italic text-[var(--ink-dim)]">${text}</em>`;
  }

  override hr(): string {
    return `<hr class="border-0 border-t border-[var(--line-strong)] my-7" />\n`;
  }

  override table(token: Tokens.Table): string {
    let headerHtml = "";
    for (const cell of token.header) {
      const text = this.parser.parseInline(cell.tokens);
      headerHtml += `<th class="font-mono text-[10.5px] uppercase tracking-[.06em] text-[var(--ink-faint)] border-b border-[var(--line-strong)] font-semibold px-[14px] py-[11px] text-left">${text}</th>`;
    }

    let bodyHtml = "";
    for (const row of token.rows) {
      let rowHtml = "";
      for (const cell of row) {
        const text = this.parser.parseInline(cell.tokens);
        rowHtml += `<td class="text-[13.5px] text-[var(--ink)] px-[14px] py-[11px] text-left">${text}</td>`;
      }
      bodyHtml += `<tr class="border-t border-[var(--line)] first:border-t-0">${rowHtml}</tr>`;
    }

    return `<div class="panel my-5 overflow-x-auto">
  <table class="w-full border-collapse">
    <thead>
      <tr>${headerHtml}</tr>
    </thead>
    <tbody>
      ${bodyHtml}
    </tbody>
  </table>
</div>\n`;
  }
}

interface MarkdownProps {
  content: string;
  className?: string;
}

const customRenderer = new CustomRenderer();

export function Markdown({ content, className }: MarkdownProps) {
  const rawHtml = marked.parse(content || "", {
    async: false,
    breaks: true,
    renderer: customRenderer,
  }) as string;
  const cleanHtml = DOMPurify.sanitize(rawHtml);

  return (
    <div
      className={className ? `${className} markdown-content` : "markdown-content"}
      dangerouslySetInnerHTML={{ __html: cleanHtml }}
    />
  );
}
