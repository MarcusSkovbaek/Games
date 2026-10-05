// QR code as crisp SVG (qrcode-generator, MIT).
import { html, useMemo } from './kit.js';
import qrcode from '../vendor/qrcode.mjs';

export function QR({ text, label = 'QR-kode' }) {
  const svg = useMemo(() => {
    const qr = qrcode(0, 'M');
    qr.addData(text);
    qr.make();
    const n = qr.getModuleCount();
    let path = '';
    for (let r = 0; r < n; r++) {
      for (let c = 0; c < n; c++) if (qr.isDark(r, c)) path += `M${c} ${r}h1v1h-1z`;
    }
    return `<svg viewBox="-2 -2 ${n + 4} ${n + 4}" shape-rendering="crispEdges" role="img" aria-label="${label}"><path fill="#0b0912" d="${path}"/></svg>`;
  }, [text]);
  return html`<div class="qr" dangerouslySetInnerHTML=${{ __html: svg }}></div>`;
}
