import React, { type ReactNode } from "react";

interface FormattedChatMessageProps {
  content: string;
  isUser?: boolean;
}

/**
 * Phân tích và render inline formatting:
 * - **in đậm** -> <strong> (chữ đậm, không còn dấu **)
 * - `mã/sku` -> <code> (badge tag đẹp mắt, không còn dấu `)
 * - *in nghiêng* -> <em>
 */
function renderInlineFormatting(text: string, isUser: boolean): ReactNode[] {
  // Regex bắt các cặp: **bold**, `code`, *italic*
  const tokenRegex = /(\*\*[^*]+\*\*|`[^`]+`|\*[^*]+\*)/g;
  const parts = text.split(tokenRegex);

  return parts.map((part, index) => {
    if (!part) return null;

    // Bold: **text**
    if (part.startsWith("**") && part.endsWith("**") && part.length >= 4) {
      const boldText = part.slice(2, -2);
      return (
        <strong
          key={index}
          className={isUser ? "font-bold text-white" : "font-semibold text-slate-950"}
        >
          {boldText}
        </strong>
      );
    }

    // Code / Tag: `code`
    if (part.startsWith("`") && part.endsWith("`") && part.length >= 2) {
      const codeText = part.slice(1, -1);
      return (
        <code
          key={index}
          className={
            isUser
              ? "rounded bg-white/20 px-1 py-0.5 font-mono text-[12px] text-white"
              : "rounded-md border border-slate-200 bg-slate-100 px-1.5 py-0.5 font-mono text-[12px] font-medium text-brand-700"
          }
        >
          {codeText}
        </code>
      );
    }

    // Italic: *text*
    if (part.startsWith("*") && part.endsWith("*") && part.length >= 2) {
      const italicText = part.slice(1, -1);
      return (
        <em key={index} className="italic">
          {italicText}
        </em>
      );
    }

    // Plain text
    return <React.Fragment key={index}>{part}</React.Fragment>;
  });
}

/**
 * Component hiển thị nội dung tin nhắn Chatbot:
 * - Bỏ dấu sao **, thay bằng thẻ in đậm nổi bật
 * - Bỏ dấu backtick `, thay bằng thẻ mã gọn gàng
 * - Format danh sách đầu dòng (bullet points) thụt lề thoáng mắt, dễ đọc
 * - Phông chữ tối ưu, dãn dòng thư thái
 */
export default function FormattedChatMessage({ content, isUser = false }: FormattedChatMessageProps) {
  if (isUser) {
    return <div className="whitespace-pre-wrap break-words">{content}</div>;
  }

  const lines = content.split("\n");

  return (
    <div className="space-y-1.5 text-[13.5px] leading-relaxed text-slate-800">
      {lines.map((line, lineIdx) => {
        const trimmed = line.trim();

        // Dòng trống
        if (!trimmed) {
          return <div key={lineIdx} className="h-1.5" />;
        }

        // Dòng thụt lề cấp 2 (ví dụ "  - Khu vực Miền Bắc: Còn hàng")
        if (line.startsWith("  - ") || line.startsWith("    - ") || line.startsWith("\t- ")) {
          const itemText = line.replace(/^\s*-\s*/, "");
          return (
            <div key={lineIdx} className="ml-5 flex items-start gap-1.5 text-slate-700">
              <span className="text-slate-400 select-none">•</span>
              <span className="flex-1">{renderInlineFormatting(itemText, false)}</span>
            </div>
          );
        }

        // Dòng danh sách cấp 1 (bắt đầu bằng "• ", "- ", "* ")
        if (trimmed.startsWith("• ") || trimmed.startsWith("- ") || trimmed.startsWith("* ")) {
          const itemText = trimmed.replace(/^[•\-*]\s*/, "");
          return (
            <div key={lineIdx} className="ml-1.5 flex items-start gap-2 text-slate-800">
              <span className="text-brand-600 font-bold select-none">•</span>
              <span className="flex-1">{renderInlineFormatting(itemText, false)}</span>
            </div>
          );
        }

        // Dòng văn bản bình thường
        return (
          <p key={lineIdx} className="break-words">
            {renderInlineFormatting(line, false)}
          </p>
        );
      })}
    </div>
  );
}

