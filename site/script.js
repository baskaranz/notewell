// Notewell Product Page Interactions

const THEMES = {
  'default-dark': {
    bg: '#1a1a1a', bgElev: '#222222', bgSidebar: '#171717', border: '#2e2e2e',
    text: '#e8e8e8', textDim: '#9a9a9a', accent: '#d1483a', selected: '#2a2a2a',
    codeBg: 'rgba(255,255,255,0.08)', selBg: 'rgba(209,72,58,0.28)',
  },
  'default-light': {
    bg: '#ffffff', bgElev: '#f4f4f5', bgSidebar: '#f7f7f8', border: '#e4e4e7',
    text: '#1c1c1e', textDim: '#8a8a8e', accent: '#d1483a', selected: '#ececed',
    codeBg: 'rgba(0,0,0,0.06)', selBg: 'rgba(209,72,58,0.18)',
  },
  'solarized-light': {
    bg: '#fdf6e3', bgElev: '#eee8d5', bgSidebar: '#f5efdc', border: '#e3dcc3',
    text: '#073642', textDim: '#93a1a1', accent: '#268bd2', selected: '#e3dcc3',
    codeBg: 'rgba(0,0,0,0.05)', selBg: 'rgba(38,139,210,0.18)',
  },
  'solarized-dark': {
    bg: '#002b36', bgElev: '#073642', bgSidebar: '#04323d', border: '#0a4b5a',
    text: '#eee8d5', textDim: '#839496', accent: '#268bd2', selected: '#073642',
    codeBg: 'rgba(255,255,255,0.06)', selBg: 'rgba(38,139,210,0.28)',
  },
  'dracula': {
    bg: '#282a36', bgElev: '#343746', bgSidebar: '#21222c', border: '#44475a',
    text: '#f8f8f2', textDim: '#6272a4', accent: '#bd93f9', selected: '#44475a',
    codeBg: 'rgba(255,255,255,0.08)', selBg: 'rgba(189,147,249,0.3)',
  },
  'nord': {
    bg: '#2e3440', bgElev: '#3b4252', bgSidebar: '#292e39', border: '#434c5e',
    text: '#eceff4', textDim: '#7b88a1', accent: '#88c0d0', selected: '#434c5e',
    codeBg: 'rgba(255,255,255,0.07)', selBg: 'rgba(136,192,208,0.28)',
  },
  'gotham': {
    bg: '#0c1014', bgElev: '#11161c', bgSidebar: '#0a0e12', border: '#1b2b34',
    text: '#c3d1cf', textDim: '#5a7c82', accent: '#2aa889', selected: '#11252b',
    codeBg: 'rgba(255,255,255,0.05)', selBg: 'rgba(42,168,137,0.25)',
  },
  'charcoal': {
    bg: '#1e1e1e', bgElev: '#272727', bgSidebar: '#1a1a1a', border: '#333333',
    text: '#dcdcdc', textDim: '#8a8a8a', accent: '#8a97a6', selected: '#2c2c2c',
    codeBg: 'rgba(255,255,255,0.07)', selBg: 'rgba(138,151,166,0.25)',
  },
  'sepia': {
    bg: '#f6f1e7', bgElev: '#efe8d8', bgSidebar: '#f1ebdd', border: '#e2d8c3',
    text: '#433b2e', textDim: '#8a7f68', accent: '#b5651d', selected: '#e8e0cd',
    codeBg: 'rgba(0,0,0,0.05)', selBg: 'rgba(181,101,29,0.18)',
  },
};

const NOTE_CONTENTS = {
  welcome: {
    title: 'Welcome to Notewell 👋',
    html: `
      <h1 class="demo-h1">Welcome to Notewell 👋</h1>
      <p class="demo-lead">Notewell is a local-first Markdown notes app. This note is a quick tour — edit it however you like, or press <kbd>⌘N</kbd> to start your own.</p>
      
      <h2 class="demo-h2">Formatting</h2>
      <p class="demo-p">Write <strong>bold</strong>, <em>italic</em>, <del>strikethrough</del>, and <code>inline code</code>. You can even mix them for <strong><em>bold italic</em></strong>.</p>
      
      <blockquote class="demo-quote">
        Blockquotes are handy for a highlighted thought.<br />
        <span class="quote-author">— someone wise</span>
      </blockquote>

      <h2 class="demo-h2">Tasks</h2>
      <ul class="demo-tasks">
        <li class="task-item"><label><input type="checkbox" checked /> An open task</label></li>
        <li class="task-item"><label><input type="checkbox" checked /> A finished task</label></li>
        <li class="task-item"><label><input type="checkbox" /> Toggle me by clicking the checkbox</label></li>
      </ul>

      <h2 class="demo-h2">Links, tags &amp; backlinks</h2>
      <ul class="demo-list">
        <li>A web link: <a href="https://example.com" class="demo-link" target="_blank">Notewell on the web</a></li>
        <li>A tag: <span class="tag-pill">#welcome</span> — click it in the sidebar to filter</li>
        <li>A note link: <span class="wikilink-pill" data-target="another">[[Another note]]</span> — wiki-style backlinks</li>
      </ul>

      <h2 class="demo-h2">Tables</h2>
      <div class="demo-table-wrap">
        <table class="demo-table">
          <thead>
            <tr><th>Action</th><th>Shortcut</th></tr>
          </thead>
          <tbody>
            <tr><td>New note</td><td><kbd>⌘N</kbd></td></tr>
            <tr><td>Search</td><td><kbd>⌘F</kbd></td></tr>
            <tr><td>Lock / Unlock</td><td><kbd>⌘L</kbd></td></tr>
            <tr><td>Live / Markdown</td><td><kbd>⌘\\</kbd></td></tr>
          </tbody>
        </table>
      </div>

      <hr class="demo-hr" />

      <h2 class="demo-h2">A few tips</h2>
      <ul class="demo-list">
        <li>Switch between <strong>Live</strong> and <strong>Markdown</strong> modes from the top-right.</li>
        <li>Change the look with the <strong>appearance</strong> button — there are nine themes.</li>
        <li><strong>Lock</strong> a note with <kbd>⌘L</kbd> to encrypt it behind a passphrase.</li>
      </ul>
      <p class="demo-p">Happy writing! <span class="tag-pill">#notewell</span></p>
    `,
    words: '260 words · edited 12 Oct · SQLite local',
    backlink: 'Another note 📝',
    backlinkTarget: 'another'
  },
  another: {
    title: 'Another note 📝',
    html: `
      <h1 class="demo-h1">Another note 📝</h1>
      <p class="demo-lead">This note is linked from <span class="wikilink-pill" data-target="welcome">[[Welcome to Notewell 👋]]</span>.</p>
      
      <p class="demo-p">Notice how backlinks work: since this note mentions the welcome note, you will see it listed under backlinks at the bottom of that note, and clicking <code>[[Welcome to Notewell 👋]]</code> jumps right back.</p>

      <h2 class="demo-h2">Instant Wikilink Creation</h2>
      <p class="demo-p">Try creating your own links between notes using <code>[[Note Title]]</code> syntax. If the note does not exist yet, Notewell creates it instantly on click.</p>
      
      <p class="demo-p"><span class="tag-pill">#notewell</span> <span class="tag-pill">#features</span></p>
    `,
    words: '64 words · edited 12 Oct · SQLite local',
    backlink: 'Welcome to Notewell 👋',
    backlinkTarget: 'welcome'
  }
};

document.addEventListener('DOMContentLoaded', () => {
  const windowEl = document.querySelector('.app-window');
  const themeChips = document.querySelectorAll('.theme-chip');

  // 1. Theme Switcher
  themeChips.forEach((chip) => {
    chip.addEventListener('click', () => {
      const themeId = chip.dataset.theme;
      const theme = THEMES[themeId];
      if (!theme) return;

      themeChips.forEach((c) => c.classList.remove('active'));
      chip.classList.add('active');

      // Update app window mockup custom properties
      windowEl.style.setProperty('--mock-bg', theme.bg);
      windowEl.style.setProperty('--mock-bg-elev', theme.bgElev);
      windowEl.style.setProperty('--mock-bg-sidebar', theme.bgSidebar);
      windowEl.style.setProperty('--mock-border', theme.border);
      windowEl.style.setProperty('--mock-text', theme.text);
      windowEl.style.setProperty('--mock-text-dim', theme.textDim);
      windowEl.style.setProperty('--mock-accent', theme.accent);
      windowEl.style.setProperty('--mock-selected', theme.selected);
      windowEl.style.setProperty('--mock-code-bg', theme.codeBg);
      windowEl.style.setProperty('--mock-sel-bg', theme.selBg);
    });
  });

  // 2. Mode Switcher (Live vs Split)
  const btnLive = document.getElementById('demo-mode-live');
  const btnSplit = document.getElementById('demo-mode-split');
  const paneLive = document.getElementById('pane-live');
  const paneSplit = document.getElementById('pane-split');

  if (btnLive && btnSplit) {
    btnLive.addEventListener('click', () => {
      btnLive.classList.add('active');
      btnSplit.classList.remove('active');
      paneLive.classList.add('active');
      paneSplit.classList.remove('active');
    });

    btnSplit.addEventListener('click', () => {
      btnSplit.classList.add('active');
      btnLive.classList.remove('active');
      paneLive.classList.remove('active');
      paneSplit.classList.add('active');
    });
  }

  // 3. Interactive Note Switching (Clicking cards or wikilinks)
  function switchNote(noteKey) {
    const data = NOTE_CONTENTS[noteKey];
    if (!data) return;

    // Update note cards in notelist
    document.querySelectorAll('.note-card').forEach((card) => {
      card.classList.toggle('active', card.dataset.note === noteKey);
    });

    // Update title
    const titleEl = document.getElementById('mockup-title');
    if (titleEl) titleEl.textContent = data.title;

    // Update Live Pane content
    const scrollEl = document.querySelector('.editor-content-scroll');
    if (scrollEl) {
      scrollEl.innerHTML = data.html;
      bindWikilinks();
    }

    // Update Footer meta & backlinks
    const wordsEl = document.querySelector('.meta-words');
    if (wordsEl) wordsEl.textContent = data.words;

    const backlinkBtn = document.querySelector('.meta-bl-pill');
    if (backlinkBtn) {
      backlinkBtn.textContent = data.backlink;
      backlinkBtn.dataset.target = data.backlinkTarget;
    }
  }

  function bindWikilinks() {
    document.querySelectorAll('.wikilink-pill').forEach((pill) => {
      pill.addEventListener('click', () => switchNote(pill.dataset.target));
    });
  }

  document.querySelectorAll('.note-card').forEach((card) => {
    card.addEventListener('click', () => switchNote(card.dataset.note));
  });

  document.querySelectorAll('.meta-bl-pill').forEach((btn) => {
    btn.addEventListener('click', () => switchNote(btn.dataset.target));
  });

  bindWikilinks();

  // 4. Download Links Configuration
  // Points to official release asset URL (can be customized via data attribute or env)
  const dmgBtn = document.getElementById('dmg-download-btn');
  const zipBtn = document.getElementById('zip-download-btn');
  
  // Set default download targets to GitHub Release or direct CDN
  const defaultDmgUrl = 'https://github.com/baskaranz/notewell/releases/download/v1.0.0/Notewell-1.0.0-arm64.dmg';
  const defaultZipUrl = 'https://github.com/baskaranz/notewell/releases/download/v1.0.0/Notewell-1.0.0-arm64-mac.zip';

  if (dmgBtn) dmgBtn.setAttribute('href', defaultDmgUrl);
  if (zipBtn) zipBtn.setAttribute('href', defaultZipUrl);
});
