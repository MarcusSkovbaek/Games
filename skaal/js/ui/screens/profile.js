// Profile form: name + photo (with a pan/zoom cropper that exports a small square JPEG).
import { html, useState, useRef, useEffect, Button, Icon, Sheet, cx } from '../kit.js';
import { toast } from '../ui-store.js';

const OUT = 256; // exported avatar size in px
const MAX_CHARS = 90_000;

export function PhotoPicker({ value, onChange, size = 148 }) {
  const [file, setFile] = useState(null);
  const inputRef = useRef(null);
  return html`<div>
    <label class=${cx('photo-pick', value && 'has-photo')} style=${{ width: `${size}px`, height: `${size}px` }}>
      ${value
        ? html`<img src=${value} alt="Dit profilbillede" />`
        : html`<span class="photo-pick__empty"><${Icon} name="camera" size=${34} stroke=${1.6} />Tilføj billede</span>`}
      <span class="photo-pick__badge" aria-hidden="true"><${Icon} name=${value ? 'pencil' : 'plus'} size=${18} stroke=${2.4} /></span>
      <input
        ref=${inputRef}
        type="file"
        accept="image/*"
        aria-label="Vælg profilbillede"
        onChange=${(e) => {
          const f = e.currentTarget.files?.[0];
          e.currentTarget.value = '';
          if (!f) return;
          if (!f.type.startsWith('image/')) {
            toast('Vælg venligst et billede', { icon: '🖼️', tone: 'bad' });
            return;
          }
          setFile(f);
        }}
      />
    </label>
    ${value
      ? html`<div class="row" style=${{ justifyContent: 'center', marginTop: '10px' }}>
          <${Button} variant="ghost" size="sm" icon="trash" onClick=${() => onChange(null)}>Fjern billede<//>
        </div>`
      : null}
    <${CropSheet}
      file=${file}
      onCancel=${() => setFile(null)}
      onDone=${(url) => {
        setFile(null);
        onChange(url);
      }}
    />
  </div>`;
}

function CropSheet({ file, onCancel, onDone }) {
  const [img, setImg] = useState(null);
  const [zoom, setZoom] = useState(1);
  const [pos, setPos] = useState({ x: 0, y: 0 });
  const [error, setError] = useState(null);
  const [view, setView] = useState(300); // rendered cropper size in CSS px
  const pointers = useRef(new Map());
  const gesture = useRef(null);
  const boxRef = useRef(null);

  // Callback ref: the cropper only mounts once the sheet has opened, so measure it then.
  const measureRef = (el) => {
    boxRef.current = el;
    if (el && el.clientWidth && el.clientWidth !== view) setView(el.clientWidth);
  };
  useEffect(() => {
    const onResize = () => boxRef.current?.clientWidth && setView(boxRef.current.clientWidth);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  useEffect(() => {
    if (!file) return;
    setImg(null);
    setError(null);
    setZoom(1);
    setPos({ x: 0, y: 0 });
    const url = URL.createObjectURL(file);
    const el = new Image();
    el.decoding = 'async';
    el.onload = () => setImg(el);
    el.onerror = () => setError('Billedet kunne ikke åbnes. Prøv et andet.');
    el.src = url;
    return () => URL.revokeObjectURL(url);
  }, [file]);

  const base = img ? Math.max(view / img.naturalWidth, view / img.naturalHeight) : 1;
  const scale = base * zoom;
  const clamp = (p, s = scale) => {
    if (!img) return p;
    const mx = Math.max(0, (img.naturalWidth * s - view) / 2);
    const my = Math.max(0, (img.naturalHeight * s - view) / 2);
    return { x: Math.max(-mx, Math.min(mx, p.x)), y: Math.max(-my, Math.min(my, p.y)) };
  };
  const setZoomClamped = (z) => {
    const nz = Math.max(1, Math.min(4, z));
    setZoom(nz);
    setPos((p) => clamp(p, base * nz));
  };

  const onPointerDown = (e) => {
    e.currentTarget.setPointerCapture?.(e.pointerId);
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    gesture.current = { pos, zoom, pts: new Map(pointers.current) };
  };
  const onPointerMove = (e) => {
    if (!pointers.current.has(e.pointerId) || !gesture.current) return;
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const k = 1;
    const start = gesture.current;
    const ids = [...pointers.current.keys()];
    if (ids.length === 1) {
      const s0 = start.pts.get(ids[0]);
      const cur = pointers.current.get(ids[0]);
      if (!s0) return;
      setPos(clamp({ x: start.pos.x + (cur.x - s0.x) * k, y: start.pos.y + (cur.y - s0.y) * k }));
    } else if (ids.length >= 2) {
      const [a, b] = ids;
      const a0 = start.pts.get(a);
      const b0 = start.pts.get(b);
      if (!a0 || !b0) {
        gesture.current = { pos, zoom, pts: new Map(pointers.current) };
        return;
      }
      const d0 = Math.hypot(a0.x - b0.x, a0.y - b0.y) || 1;
      const a1 = pointers.current.get(a);
      const b1 = pointers.current.get(b);
      const d1 = Math.hypot(a1.x - b1.x, a1.y - b1.y);
      setZoomClamped(start.zoom * (d1 / d0));
    }
  };
  const onPointerUp = (e) => {
    pointers.current.delete(e.pointerId);
    gesture.current = { pos, zoom, pts: new Map(pointers.current) };
  };
  const onWheel = (e) => {
    e.preventDefault();
    setZoomClamped(zoom * (e.deltaY < 0 ? 1.08 : 0.92));
  };

  const exportPhoto = () => {
    const canvas = document.createElement('canvas');
    canvas.width = OUT;
    canvas.height = OUT;
    const ctx = canvas.getContext('2d');
    const k = OUT / view;
    ctx.fillStyle = '#111';
    ctx.fillRect(0, 0, OUT, OUT);
    ctx.imageSmoothingQuality = 'high';
    ctx.translate(OUT / 2 + pos.x * k, OUT / 2 + pos.y * k);
    ctx.scale(scale * k, scale * k);
    ctx.drawImage(img, -img.naturalWidth / 2, -img.naturalHeight / 2);
    let url = '';
    for (const q of [0.86, 0.76, 0.64, 0.5]) {
      url = canvas.toDataURL('image/jpeg', q);
      if (url.length <= MAX_CHARS) break;
    }
    onDone(url);
  };

  return html`<${Sheet}
    open=${!!file}
    onClose=${onCancel}
    title="Tilpas dit billede"
    subtitle="Træk for at flytte · knib eller brug skyderen for at zoome"
    footer=${html`<div class="btn-row">
      <${Button} variant="secondary" onClick=${onCancel}>Annullér<//>
      <${Button} disabled=${!img} onClick=${exportPhoto} icon="check">Brug billede<//>
    </div>`}
  >
    ${error
      ? html`<div class="form-error"><${Icon} name="info" size=${18} />${error}</div>`
      : html`<div
            class="cropper"
            ref=${measureRef}
            onPointerDown=${onPointerDown}
            onPointerMove=${onPointerMove}
            onPointerUp=${onPointerUp}
            onPointerCancel=${onPointerUp}
            onWheel=${onWheel}
          >
            ${img
              ? html`<img
                  src=${img.src}
                  alt=""
                  width=${img.naturalWidth}
                  height=${img.naturalHeight}
                  style=${{
                    width: `${img.naturalWidth}px`,
                    height: `${img.naturalHeight}px`,
                    transform: `translate(-50%, -50%) translate(${pos.x}px, ${pos.y}px) scale(${scale})`,
                  }}
                />`
              : html`<div style=${{ display: 'grid', placeItems: 'center', height: '100%' }}><span class="spinner"></span></div>`}
            <div class="cropper__mask"></div>
          </div>
          <div class="zoom-row">
            <${Icon} name="image" size=${16} />
            <input type="range" min="1" max="4" step="0.01" value=${zoom} aria-label="Zoom" onInput=${(e) => setZoomClamped(Number(e.currentTarget.value))} />
            <${Icon} name="image" size=${24} />
          </div>`}
  <//>`;
}

export function ProfileForm({ initialName = '', initialPhoto = null, submitLabel = 'Fortsæt', onSubmit, busy, children }) {
  const [name, setName] = useState(initialName);
  const [photo, setPhoto] = useState(initialPhoto);
  const [error, setError] = useState(null);
  const submit = (e) => {
    e.preventDefault();
    const clean = name.trim();
    if (clean.length < 1) {
      setError('Skriv dit navn, så de andre kan se, hvem du er.');
      return;
    }
    setError(null);
    onSubmit({ name: clean.slice(0, 32), photo });
  };
  return html`<form class="stack stack--l" onSubmit=${submit} novalidate>
    <${PhotoPicker} value=${photo} onChange=${setPhoto} />
    <label class="field">
      <span class="field__label">Dit navn</span>
      <input
        class="input"
        type="text"
        name="name"
        autocomplete="nickname"
        maxlength="32"
        placeholder="Fx Mads eller Kaptajn Kæmpe"
        value=${name}
        onInput=${(e) => setName(e.currentTarget.value)}
      />
      <span class="field__hint">Vises på scoreboardet for alle deltagere.</span>
    </label>
    ${error ? html`<div class="form-error" role="alert"><${Icon} name="info" size=${18} />${error}</div>` : null}
    ${children}
    <${Button} type="submit" size="lg" block loading=${busy} iconRight="chevron-right">${submitLabel}<//>
  </form>`;
}
