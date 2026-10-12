'use strict';

const $ = (id) => document.getElementById(id);

// Passphrase prompt. Resolves the passphrase, or null if cancelled.
// opts: { title, message, okLabel, confirm }  (confirm shows a second "match" field)
export function askPassphrase(opts = {}) {
  const { title = 'Passphrase', message = '', okLabel = 'OK', confirm = false } = opts;
  return new Promise((resolve) => {
    const overlay = $('modal');
    const p1 = $('modal-pass'), p2 = $('modal-pass2');
    const err = $('modal-error'), ok = $('modal-ok'), cancel = $('modal-cancel');
    $('modal-title').textContent = title;
    const msg = $('modal-msg');
    msg.textContent = message; msg.hidden = !message;
    ok.textContent = okLabel;
    p1.hidden = false; p1.value = ''; p2.value = '';
    p2.hidden = !confirm;
    err.hidden = true;
    overlay.hidden = false;
    setTimeout(() => p1.focus(), 30);

    const cleanup = () => {
      overlay.hidden = true;
      ok.removeEventListener('click', onOk);
      cancel.removeEventListener('click', onCancel);
      overlay.removeEventListener('keydown', onKey, true);
      overlay.removeEventListener('mousedown', onBackdrop);
    };
    const finish = (v) => { cleanup(); resolve(v); };
    const showErr = (m) => { err.textContent = m; err.hidden = false; };

    const onOk = () => {
      const v = p1.value;
      if (!v) return showErr('Enter a passphrase.');
      if (confirm && v !== p2.value) return showErr('Passphrases do not match.');
      finish(v);
    };
    const onCancel = () => finish(null);
    const onKey = (e) => {
      if (e.key === 'Enter') { e.preventDefault(); onOk(); }
      else if (e.key === 'Escape') { e.preventDefault(); onCancel(); }
    };
    const onBackdrop = (e) => { if (e.target === overlay) onCancel(); };

    ok.addEventListener('click', onOk);
    cancel.addEventListener('click', onCancel);
    overlay.addEventListener('keydown', onKey, true);
    overlay.addEventListener('mousedown', onBackdrop);
  });
}

// Yes/no confirm reusing the same modal. Resolves true/false.
export function confirmModal(opts = {}) {
  const { title = 'Are you sure?', message = '', okLabel = 'OK' } = opts;
  return new Promise((resolve) => {
    const overlay = $('modal');
    const p1 = $('modal-pass'), p2 = $('modal-pass2');
    const err = $('modal-error'), ok = $('modal-ok'), cancel = $('modal-cancel');
    $('modal-title').textContent = title;
    const msg = $('modal-msg'); msg.textContent = message; msg.hidden = !message;
    ok.textContent = okLabel;
    p1.hidden = true; p2.hidden = true; err.hidden = true;
    overlay.hidden = false;
    setTimeout(() => ok.focus(), 30);

    const cleanup = () => {
      overlay.hidden = true; p1.hidden = false;
      ok.removeEventListener('click', onOk);
      cancel.removeEventListener('click', onCancel);
      overlay.removeEventListener('keydown', onKey, true);
    };
    const onOk = () => { cleanup(); resolve(true); };
    const onCancel = () => { cleanup(); resolve(false); };
    const onKey = (e) => {
      if (e.key === 'Enter') { e.preventDefault(); onOk(); }
      else if (e.key === 'Escape') { e.preventDefault(); onCancel(); }
    };
    ok.addEventListener('click', onOk);
    cancel.addEventListener('click', onCancel);
    overlay.addEventListener('keydown', onKey, true);
  });
}
