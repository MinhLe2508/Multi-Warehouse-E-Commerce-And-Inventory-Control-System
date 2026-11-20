interface AccountEmail {
  fullName: string;
  title: string;
  intro: string;
  actionLabel: string;
  url: string;
  ttl: string;
  recovery: string;
  footer: string;
  username?: string;
}

function escapeHtml(value: string): string {
  const entities: Record<string, string> = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  };
  return value.replace(/[&<>"']/g, (character) => entities[character]);
}

export function renderAccountEmail(data: AccountEmail) {
  const title = escapeHtml(data.title);
  const url = escapeHtml(data.url);
  const intro = escapeHtml(data.intro);
  const action = escapeHtml(data.actionLabel);
  const username = data.username ? escapeHtml(data.username) : null;
  const deadline = `Liên kết dùng một lần và có hiệu lực trong ${data.ttl} kể từ khi được tạo.`;

  const text = [
    'MultiMart',
    data.title,
    '',
    `Xin chào ${data.fullName},`,
    data.intro,
    ...(data.username ? [`Tên đăng nhập: ${data.username}`] : []),
    '',
    data.actionLabel,
    data.url,
    '',
    deadline,
    data.recovery,
    '',
    data.footer,
  ].join('\n');

  const html = `<!doctype html>
<html lang="vi"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${title}</title></head>
<body style="margin:0;padding:0;background:#eef3fa;font-family:Arial,sans-serif;color:#0f172a">
  <span style="display:none;max-height:0;max-width:0;overflow:hidden;opacity:0;color:transparent">${intro}</span>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#eef3fa">
    <tr><td align="center" style="padding:28px 12px">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:580px;border:1px solid #dde6f1;border-radius:16px;background:#fff">
        <tr><td bgcolor="#0f2348" style="padding:20px 27px;border-radius:15px 15px 0 0;color:#fff;font-weight:bold;font-size:23px;letter-spacing:-.5px">Multi<span style="color:#93c5fd">Mart</span></td></tr>
        <tr><td style="padding:26px 27px;font-size:15px;line-height:1.65">
          <h1 style="font-size:26px;line-height:1.2;margin:0 0 17px;color:#10234a">${title}</h1>
          <p style="margin:0 0 8px">Xin chào <strong>${escapeHtml(data.fullName)}</strong>,</p>
          <p style="margin:0 0 16px">${intro}</p>
          ${username ? `<p style="margin:0 0 16px;padding:11px 14px;border-radius:8px;background:#eff6ff">Tên đăng nhập <strong>${username}</strong></p>` : ''}
          <table role="presentation" cellspacing="0" cellpadding="0" style="margin:0 0 18px">
            <tr><td bgcolor="#2563eb" style="border-radius:8px"><a href="${url}" style="display:inline-block;padding:12px 18px;border-radius:8px;color:#fff;text-decoration:none;font-size:15px;font-weight:bold">${action}</a></td></tr>
          </table>
          <p style="margin:0 0 15px;padding:11px 14px;border-radius:8px;background:#eff6ff;color:#1e3a8a;font-size:14px">${escapeHtml(deadline)}</p>
          <p style="margin:0 0 10px;color:#475569;font-size:14px">${escapeHtml(data.recovery)}</p>
          <p style="margin:0;color:#475569;font-size:13px">Nếu nút không mở được, dùng <a href="${url}" style="color:#1d4ed8">liên kết này</a>.</p>
        </td></tr>
        <tr><td style="padding:16px 27px;border-top:1px solid #e2e8f0;color:#475569;font-size:13px;line-height:1.55">${escapeHtml(data.footer)}</td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`;

  return { html, text };
}
