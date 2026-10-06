// Comments on a photo: a panel in the viewer, and the latest ones under the photo in the feed.
// Anyone in the event can comment; you can delete your own, and the host (in pub golf also the
// judge) can hide anyone's.
import { html, useState, useEffect, useRef, Avatar, Icon, IconButton } from '../kit.js';
import { commentPhoto, removeComment } from '../../app/photos.js';
import { COMMENT_MAX } from '../../game/photos.js';
import { eventUi } from '../screens/event.js';
import { toast } from '../ui-store.js';
import { haptic } from '../feedback.js';
import { fmtAgo } from '../format.js';

const nameOf = (d, pid) => (pid === d.me ? 'Dig' : d.players.get(pid)?.name || 'En gæst');

// Opens the viewer on a photo with its comments; 'write' puts the cursor in the text field.
export const openComments = (photo, mode = 'read') => eventUi.set({ photo: photo.key, comments: mode, show: false });

function Comment({ d, c, onRemove }) {
  const mine = c.pid === d.me;
  return html`<div class="vcomment">
    <${Avatar} player=${d.players.get(c.pid)} size=${30} />
    <div class="vcomment__body">
      <p><strong>${nameOf(d, c.pid)}</strong> ${c.txt}</p>
      <small>
        ${fmtAgo(c.ts, d.t)}
        ${onRemove
          ? html` · <button type="button" class="vcomment__remove" aria-label=${mine ? 'Slet din kommentar' : `Skjul kommentaren fra ${nameOf(d, c.pid)}`} onClick=${onRemove}>
                ${mine ? 'Slet' : 'Skjul'}
              </button>`
          : null}
      </small>
    </div>
  </div>`;
}

// The panel in the viewer, in place of its bottom bar. The caption comes first, as the
// photographer's own words.
export function CommentsPanel({ room, d, photo, write, onClose }) {
  const list = d.comments.get(photo.key) || [];
  const [text, setText] = useState('');
  const input = useRef(null);
  const end = useRef(null);
  useEffect(() => {
    if (write) input.current?.focus({ preventScroll: true });
  }, [photo.key, write]);
  // The newest comment in view — when the panel opens and when one arrives.
  useEffect(() => end.current?.scrollIntoView?.({ block: 'end' }), [photo.key, list.length]);

  const send = (e) => {
    e.preventDefault();
    if (!commentPhoto(room, photo, text)) return;
    setText('');
    haptic(8);
  };
  const remove = (c) => {
    removeComment(room, c);
    toast(c.pid === room.pid ? 'Kommentaren er slettet' : 'Kommentaren er skjult for alle', { icon: '🗑️' });
  };
  return html`<section class="viewer__comments" aria-label="Kommentarer">
    <header class="viewer__chead">
      <h2>Kommentarer${list.length ? html` <span>${list.length}</span>` : null}</h2>
      <${IconButton} icon="chevron-down" label="Skjul kommentarer" onClick=${onClose} />
    </header>
    <div class="viewer__clist">
      ${photo.cap ? html`<${Comment} d=${d} c=${{ pid: photo.pid, txt: photo.cap, ts: photo.ts }} />` : null}
      ${list.map((c) => html`<${Comment} key=${c.key} d=${d} c=${c} onRemove=${c.pid === room.pid || d.canHidePhotos ? () => remove(c) : null} />`)}
      ${list.length ? null : html`<p class="viewer__cempty">Ingen kommentarer endnu — skriv den første.</p>`}
      <span ref=${end}></span>
    </div>
    <form class="viewer__cform" onSubmit=${send}>
      <${Avatar} player=${d.mePlayer} size=${30} />
      <input
        ref=${input}
        class="input"
        maxlength=${COMMENT_MAX}
        placeholder="Skriv en kommentar …"
        aria-label="Skriv en kommentar"
        enterkeyhint="send"
        autocomplete="off"
        value=${text}
        onInput=${(e) => setText(e.currentTarget.value)}
      />
      <button type="submit" class="viewer__send" aria-label="Send kommentar" disabled=${!text.trim()}><${Icon} name="arrow-up" size=${18} /></button>
    </form>
  </section>`;
}

// Under a photo in the feed: the two newest comments, and the way to the rest.
export function FeedComments({ d, photo }) {
  const list = d.comments.get(photo.key) || [];
  if (!list.length) return null;
  return html`<div class="feed-comments">
    ${list.length > 2
      ? html`<button type="button" class="feed-comments__all" onClick=${() => openComments(photo)}>Se alle ${list.length} kommentarer</button>`
      : null}
    ${list.slice(-2).map((c) => html`<p key=${c.key}><strong>${nameOf(d, c.pid)}</strong> ${c.txt}</p>`)}
  </div>`;
}

export function CommentButton({ d, photo }) {
  const n = d.comments.get(photo.key)?.length || 0;
  return html`<button type="button" class=${n ? 'react' : 'react react--add'} aria-label=${n ? `Kommentarer: ${n}` : 'Skriv en kommentar'} onClick=${() => openComments(photo, n ? 'read' : 'write')}>
    <${Icon} name="message-circle" size=${14} />${n ? html`<span aria-hidden="true">${n}</span>` : null}
  </button>`;
}
