/* @ds-bundle: {"format":3,"namespace":"VelaDesignSystem_f6c677","components":[{"name":"DownloadRow","sourcePath":"components/app/DownloadRow.jsx"},{"name":"FormatToggle","sourcePath":"components/app/FormatToggle.jsx"},{"name":"PlaylistMode","sourcePath":"components/app/PlaylistMode.jsx"},{"name":"UrlBar","sourcePath":"components/app/UrlBar.jsx"},{"name":"Button","sourcePath":"components/core/Button.jsx"},{"name":"IconButton","sourcePath":"components/core/IconButton.jsx"},{"name":"Badge","sourcePath":"components/feedback/Badge.jsx"},{"name":"ProgressBar","sourcePath":"components/feedback/ProgressBar.jsx"},{"name":"Spinner","sourcePath":"components/feedback/Spinner.jsx"},{"name":"Checkbox","sourcePath":"components/forms/Checkbox.jsx"},{"name":"Input","sourcePath":"components/forms/Input.jsx"},{"name":"SegmentedControl","sourcePath":"components/forms/SegmentedControl.jsx"},{"name":"Select","sourcePath":"components/forms/Select.jsx"},{"name":"Switch","sourcePath":"components/forms/Switch.jsx"}],"sourceHashes":{"components/app/DownloadRow.jsx":"69d9c33a9bb5","components/app/FormatToggle.jsx":"e9fed816e3da","components/app/PlaylistMode.jsx":"6cf2ca86342f","components/app/UrlBar.jsx":"e0d7a852055d","components/core/Button.jsx":"d4f26ef42b00","components/core/IconButton.jsx":"76081216c165","components/feedback/Badge.jsx":"ca8e03f2f28c","components/feedback/ProgressBar.jsx":"3c844791ec06","components/feedback/Spinner.jsx":"ad7d5d812a8a","components/forms/Checkbox.jsx":"78102fa06a28","components/forms/Input.jsx":"6d10e808fe27","components/forms/SegmentedControl.jsx":"8adcadc4425f","components/forms/Select.jsx":"d4eecac2cf3c","components/forms/Switch.jsx":"91700d3328b7"},"inlinedExternals":[],"unexposedExports":[]} */

(() => {

const __ds_ns = (window.VelaDesignSystem_f6c677 = window.VelaDesignSystem_f6c677 || {});

const __ds_scope = {};

(__ds_ns.__errors = __ds_ns.__errors || []);

// components/app/DownloadRow.jsx
try { (() => {
(function () {
  const id = 'vela-dlrow-css';
  if (document.getElementById(id)) return;
  const s = document.createElement('style');
  s.id = id;
  s.textContent = `
@keyframes vela-dl-sweep{from{transform:translateX(-100%)}to{transform:translateX(220%)}}
.vdlrow{display:flex;align-items:center;gap:12px;padding:10px 12px;background:var(--vela-surface-2);border-radius:var(--radius-md);border:1px solid var(--vela-border-subtle);transition:background 150ms}
.vdlrow:hover{background:var(--vela-surface-hover)}
.vdlrow-icon{width:36px;height:36px;border-radius:var(--radius-sm);display:flex;align-items:center;justify-content:center;flex-shrink:0}
.vdlrow-icon.vdli-video{background:var(--vela-primary-soft);color:var(--vela-video)}
.vdlrow-icon.vdli-audio{background:var(--vela-secondary-soft);color:var(--vela-audio)}
.vdlrow-icon svg{width:17px;height:17px}
.vdlrow-body{flex:1;min-width:0}
.vdlrow-name{font:var(--type-sm);color:var(--vela-text);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;margin-bottom:4px}
.vdlrow-meta{display:flex;align-items:center;gap:8px;margin-bottom:6px}
.vdlrow-size{font-family:var(--font-mono);font-size:11px;color:var(--vela-text-3);font-variant-numeric:tabular-nums}
.vdlrow-status{font:var(--type-xs);color:var(--vela-text-3)}
.vdlrow-status.st-done{color:var(--vela-success)}
.vdlrow-status.st-error{color:var(--vela-danger)}
.vdlrow-status.st-downloading{color:var(--teal-400)}
.vdlrow-track{width:100%;height:3px;background:var(--vela-surface-3);border-radius:var(--radius-full);overflow:hidden}
.vdlrow-fill{height:100%;border-radius:var(--radius-full);transition:width 400ms ease-out;position:relative}
.vdlrow-fill.fv{background:var(--vela-gradient)}
.vdlrow-fill.fa{background:var(--vela-secondary)}
.vdlrow-fill.fd{background:var(--vela-success)}
.vdlrow-fill.fe{background:var(--vela-danger)}
.vdlrow-fill.fq{background:var(--vela-surface-3);overflow:hidden}
.vdlrow-fill.fq::after{content:'';position:absolute;inset:0;background:linear-gradient(90deg,transparent,var(--vela-primary),transparent);animation:vela-dl-sweep 1.4s ease-in-out infinite}
.vdlrow-actions{display:flex;gap:3px;flex-shrink:0}
.vdlrow-btn{width:28px;height:28px;border-radius:var(--radius-sm);border:none;background:transparent;color:var(--vela-text-3);cursor:pointer;display:flex;align-items:center;justify-content:center;transition:background 100ms,color 100ms}
.vdlrow-btn:hover{background:var(--vela-surface-3);color:var(--vela-text)}
.vdlrow-btn.vdlb-danger:hover{background:var(--vela-danger-soft);color:var(--vela-danger)}
.vdlrow-btn svg{width:14px;height:14px}
  `;
  document.head.appendChild(s);
})();
const IFolder = () => /*#__PURE__*/React.createElement("svg", {
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: "2",
  strokeLinecap: "round",
  strokeLinejoin: "round"
}, /*#__PURE__*/React.createElement("path", {
  d: "M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"
}));
const IRetry = () => /*#__PURE__*/React.createElement("svg", {
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: "2",
  strokeLinecap: "round",
  strokeLinejoin: "round"
}, /*#__PURE__*/React.createElement("path", {
  d: "M21 2v6h-6"
}), /*#__PURE__*/React.createElement("path", {
  d: "M3 12a9 9 0 0 1 15-6.7L21 8"
}), /*#__PURE__*/React.createElement("path", {
  d: "M3 22v-6h6"
}), /*#__PURE__*/React.createElement("path", {
  d: "M21 12a9 9 0 0 1-15 6.7L3 16"
}));
const ITrash = () => /*#__PURE__*/React.createElement("svg", {
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: "2",
  strokeLinecap: "round",
  strokeLinejoin: "round"
}, /*#__PURE__*/React.createElement("path", {
  d: "M3 6h18"
}), /*#__PURE__*/React.createElement("path", {
  d: "M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"
}));
const IVid = () => /*#__PURE__*/React.createElement("svg", {
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: "2",
  strokeLinecap: "round",
  strokeLinejoin: "round"
}, /*#__PURE__*/React.createElement("path", {
  d: "m22 8-6 4 6 4V8z"
}), /*#__PURE__*/React.createElement("rect", {
  width: "14",
  height: "12",
  x: "2",
  y: "6",
  rx: "2"
}));
const IAud = () => /*#__PURE__*/React.createElement("svg", {
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: "2",
  strokeLinecap: "round",
  strokeLinejoin: "round"
}, /*#__PURE__*/React.createElement("path", {
  d: "M9 18V5l12-2v13"
}), /*#__PURE__*/React.createElement("circle", {
  cx: "6",
  cy: "18",
  r: "3"
}), /*#__PURE__*/React.createElement("circle", {
  cx: "18",
  cy: "16",
  r: "3"
}));
function DownloadRow({
  filename = 'Untitled',
  format = 'video',
  status = 'queued',
  progress = 0,
  filesize,
  speed,
  onRemove,
  onRetry,
  onOpenFolder
}) {
  const pct = Math.min(100, Math.max(0, progress));
  const statusLabel = {
    queued: 'In queue',
    downloading: speed ? speed + ' /s' : pct + '%',
    done: 'Complete',
    error: 'Failed — click retry'
  }[status] || status;
  const fillCls = {
    video: 'fv',
    audio: 'fa',
    done: 'fd',
    error: 'fe',
    queued: 'fq'
  }[status === 'done' ? 'done' : status === 'error' ? 'error' : status === 'queued' ? 'queued' : format] || 'fv';
  return /*#__PURE__*/React.createElement("div", {
    className: "vdlrow"
  }, /*#__PURE__*/React.createElement("div", {
    className: `vdlrow-icon vdli-${format}`
  }, format === 'audio' ? /*#__PURE__*/React.createElement(IAud, null) : /*#__PURE__*/React.createElement(IVid, null)), /*#__PURE__*/React.createElement("div", {
    className: "vdlrow-body"
  }, /*#__PURE__*/React.createElement("div", {
    className: "vdlrow-name",
    title: filename
  }, filename), /*#__PURE__*/React.createElement("div", {
    className: "vdlrow-meta"
  }, filesize && /*#__PURE__*/React.createElement("span", {
    className: "vdlrow-size"
  }, filesize), /*#__PURE__*/React.createElement("span", {
    className: `vdlrow-status st-${status}`
  }, statusLabel)), /*#__PURE__*/React.createElement("div", {
    className: "vdlrow-track"
  }, /*#__PURE__*/React.createElement("div", {
    className: `vdlrow-fill ${fillCls}`,
    style: status === 'queued' ? {
      width: '100%'
    } : {
      width: (status === 'done' ? 100 : pct) + '%'
    }
  }))), /*#__PURE__*/React.createElement("div", {
    className: "vdlrow-actions"
  }, status === 'error' && onRetry && /*#__PURE__*/React.createElement("button", {
    className: "vdlrow-btn",
    onClick: onRetry,
    title: "Retry"
  }, /*#__PURE__*/React.createElement(IRetry, null)), status === 'done' && onOpenFolder && /*#__PURE__*/React.createElement("button", {
    className: "vdlrow-btn",
    onClick: onOpenFolder,
    title: "Open folder"
  }, /*#__PURE__*/React.createElement(IFolder, null)), /*#__PURE__*/React.createElement("button", {
    className: "vdlrow-btn vdlb-danger",
    onClick: onRemove,
    title: "Remove"
  }, /*#__PURE__*/React.createElement(ITrash, null))));
}
Object.assign(__ds_scope, { DownloadRow });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/app/DownloadRow.jsx", error: String((e && e.message) || e) }); }

// components/app/FormatToggle.jsx
try { (() => {
(function () {
  const id = 'vela-ft-css';
  if (document.getElementById(id)) return;
  const s = document.createElement('style');
  s.id = id;
  s.textContent = `
.vft{display:inline-flex;background:var(--vela-surface-3);border-radius:var(--radius-md);padding:3px;gap:2px;border:1px solid var(--vela-border-subtle)}
.vft-btn{display:flex;align-items:center;gap:7px;border:none;background:transparent;cursor:pointer;border-radius:calc(var(--radius-md) - 2px);transition:background 120ms,color 120ms,box-shadow 120ms;padding:0 16px;height:32px;font:var(--type-sm);font-weight:500;color:var(--vela-text-3)}
.vft-btn:hover:not(.vft-active){background:var(--vela-surface-2);color:var(--vela-text-2)}
.vft-btn.vft-active.vft-video{background:var(--vela-video);color:var(--vela-on-primary);box-shadow:var(--shadow-sm),var(--glow-primary)}
.vft-btn.vft-active.vft-audio{background:var(--vela-audio);color:var(--vela-text-on-accent);box-shadow:var(--shadow-sm),var(--glow-secondary)}
.vft-btn svg{width:15px;height:15px;flex-shrink:0}
.vft-tag{font-size:9px;font-weight:700;letter-spacing:.07em;background:oklch(0 0 0/.22);padding:1px 4px;border-radius:3px}
  `;
  document.head.appendChild(s);
})();
function FormatToggle({
  value = 'video',
  onChange
}) {
  return /*#__PURE__*/React.createElement("div", {
    className: "vft",
    role: "group",
    "aria-label": "Output format"
  }, /*#__PURE__*/React.createElement("button", {
    className: ['vft-btn vft-video', value === 'video' ? 'vft-active' : ''].join(' '),
    onClick: () => onChange && onChange('video'),
    "aria-pressed": value === 'video'
  }, /*#__PURE__*/React.createElement("svg", {
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: "2",
    strokeLinecap: "round",
    strokeLinejoin: "round"
  }, /*#__PURE__*/React.createElement("path", {
    d: "m22 8-6 4 6 4V8z"
  }), /*#__PURE__*/React.createElement("rect", {
    width: "14",
    height: "12",
    x: "2",
    y: "6",
    rx: "2"
  })), "Video ", /*#__PURE__*/React.createElement("span", {
    className: "vft-tag"
  }, "MP4")), /*#__PURE__*/React.createElement("button", {
    className: ['vft-btn vft-audio', value === 'audio' ? 'vft-active' : ''].join(' '),
    onClick: () => onChange && onChange('audio'),
    "aria-pressed": value === 'audio'
  }, /*#__PURE__*/React.createElement("svg", {
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: "2",
    strokeLinecap: "round",
    strokeLinejoin: "round"
  }, /*#__PURE__*/React.createElement("path", {
    d: "M9 18V5l12-2v13"
  }), /*#__PURE__*/React.createElement("circle", {
    cx: "6",
    cy: "18",
    r: "3"
  }), /*#__PURE__*/React.createElement("circle", {
    cx: "18",
    cy: "16",
    r: "3"
  })), "Audio ", /*#__PURE__*/React.createElement("span", {
    className: "vft-tag"
  }, "MP3")));
}
Object.assign(__ds_scope, { FormatToggle });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/app/FormatToggle.jsx", error: String((e && e.message) || e) }); }

// components/app/PlaylistMode.jsx
try { (() => {
(function () {
  const id = 'vela-pm-css';
  if (document.getElementById(id)) return;
  const s = document.createElement('style');
  s.id = id;
  s.textContent = `
.vpm{display:flex;flex-direction:column;gap:6px}
.vpm-lbl{font:var(--type-caption);color:var(--vela-text-3);text-transform:uppercase;letter-spacing:var(--tracking-caps)}
.vpm-opts{display:flex;gap:6px}
.vpm-opt{flex:1;display:flex;align-items:center;gap:10px;padding:10px 12px;background:var(--vela-surface-2);border:1.5px solid var(--vela-border);border-radius:var(--radius-md);cursor:pointer;transition:border-color 150ms,background 150ms;user-select:none}
.vpm-opt:hover:not(.vpm-active){border-color:var(--vela-border-strong)}
.vpm-opt.vpm-active{border-color:var(--vela-primary-line);background:var(--vela-primary-soft)}
.vpm-icon{width:32px;height:32px;border-radius:var(--radius-sm);display:flex;align-items:center;justify-content:center;background:var(--vela-surface-3);flex-shrink:0;color:var(--vela-text-3);transition:background 150ms,color 150ms}
.vpm-opt.vpm-active .vpm-icon{background:var(--vela-primary);color:var(--vela-on-primary)}
.vpm-icon svg{width:16px;height:16px}
.vpm-name{font:var(--type-sm);color:var(--vela-text);line-height:1.3}
.vpm-desc{font:var(--type-xs);color:var(--vela-text-3);margin-top:2px}
.vpm-dot{width:16px;height:16px;border-radius:50%;border:1.5px solid var(--vela-border-strong);flex-shrink:0;margin-left:auto;display:flex;align-items:center;justify-content:center;transition:border-color 150ms}
.vpm-opt.vpm-active .vpm-dot{border-color:var(--vela-primary-text)}
.vpm-dot-inner{width:8px;height:8px;border-radius:50%;background:var(--vela-primary);opacity:0;transition:opacity 150ms}
.vpm-opt.vpm-active .vpm-dot-inner{opacity:1}
  `;
  document.head.appendChild(s);
})();
const IconSingle = () => /*#__PURE__*/React.createElement("svg", {
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: "2",
  strokeLinecap: "round",
  strokeLinejoin: "round"
}, /*#__PURE__*/React.createElement("path", {
  d: "m22 8-6 4 6 4V8z"
}), /*#__PURE__*/React.createElement("rect", {
  width: "14",
  height: "12",
  x: "2",
  y: "6",
  rx: "2"
}));
const IconSplit = () => /*#__PURE__*/React.createElement("svg", {
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: "2",
  strokeLinecap: "round",
  strokeLinejoin: "round"
}, /*#__PURE__*/React.createElement("rect", {
  x: "2",
  y: "3",
  width: "20",
  height: "4",
  rx: "1"
}), /*#__PURE__*/React.createElement("rect", {
  x: "2",
  y: "10",
  width: "20",
  height: "4",
  rx: "1"
}), /*#__PURE__*/React.createElement("rect", {
  x: "2",
  y: "17",
  width: "20",
  height: "4",
  rx: "1"
}));
function PlaylistMode({
  mode = 'split',
  onChange
}) {
  const opts = [{
    value: 'single',
    icon: /*#__PURE__*/React.createElement(IconSingle, null),
    name: 'Full playlist',
    desc: 'One merged file'
  }, {
    value: 'split',
    icon: /*#__PURE__*/React.createElement(IconSplit, null),
    name: 'Individual tracks',
    desc: 'Separate files'
  }];
  return /*#__PURE__*/React.createElement("div", {
    className: "vpm"
  }, /*#__PURE__*/React.createElement("span", {
    className: "vpm-lbl"
  }, "Playlist mode"), /*#__PURE__*/React.createElement("div", {
    className: "vpm-opts"
  }, opts.map(o => /*#__PURE__*/React.createElement("div", {
    key: o.value,
    className: ['vpm-opt', mode === o.value ? 'vpm-active' : ''].filter(Boolean).join(' '),
    onClick: () => onChange && onChange(o.value),
    role: "radio",
    "aria-checked": mode === o.value
  }, /*#__PURE__*/React.createElement("div", {
    className: "vpm-icon"
  }, o.icon), /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("div", {
    className: "vpm-name"
  }, o.name), /*#__PURE__*/React.createElement("div", {
    className: "vpm-desc"
  }, o.desc)), /*#__PURE__*/React.createElement("div", {
    className: "vpm-dot"
  }, /*#__PURE__*/React.createElement("div", {
    className: "vpm-dot-inner"
  }))))));
}
Object.assign(__ds_scope, { PlaylistMode });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/app/PlaylistMode.jsx", error: String((e && e.message) || e) }); }

// components/app/UrlBar.jsx
try { (() => {
(function () {
  const id = 'vela-urlbar-css';
  if (document.getElementById(id)) return;
  const s = document.createElement('style');
  s.id = id;
  s.textContent = `
.vurl{display:flex;align-items:center;background:var(--vela-surface-2);border:1px solid var(--vela-border);border-radius:var(--radius-lg);overflow:hidden;transition:border-color 150ms,box-shadow 150ms;height:44px}
.vurl:focus-within{border-color:var(--vela-primary-line);box-shadow:var(--ring-focus)}
.vurl.vurl-filled{border-color:var(--vela-border-strong)}
.vurl-input{flex:1;background:transparent;border:none;outline:none;color:var(--vela-text);font-family:var(--font-mono);font-size:13px;padding:0 14px;min-width:0}
.vurl-input::placeholder{font-family:var(--font-sans);font-size:14px;color:var(--vela-text-3)}
.vurl-clear{width:34px;height:100%;background:transparent;border:none;color:var(--vela-text-3);cursor:pointer;display:flex;align-items:center;justify-content:center;transition:color 100ms;flex-shrink:0}
.vurl-clear:hover{color:var(--vela-danger)}
.vurl-clear svg{width:15px;height:15px}
.vurl-paste{display:flex;align-items:center;gap:6px;height:100%;padding:0 14px;background:var(--vela-surface-3);border:none;border-left:1px solid var(--vela-border);color:var(--vela-text-2);font:var(--type-sm);cursor:pointer;transition:background 120ms,color 120ms;flex-shrink:0;letter-spacing:.01em}
.vurl-paste:hover{background:var(--vela-primary-soft);color:var(--vela-primary-text)}
.vurl-paste svg{width:15px;height:15px}
  `;
  document.head.appendChild(s);
})();
function UrlBar({
  value = '',
  onChange,
  onPaste,
  onClear,
  placeholder = 'Paste a video or playlist URL…'
}) {
  const filled = value && value.length > 0;
  async function handlePaste() {
    try {
      const t = await navigator.clipboard.readText();
      onChange && onChange(t);
      onPaste && onPaste(t);
    } catch {
      onPaste && onPaste('');
    }
  }
  return /*#__PURE__*/React.createElement("div", {
    className: 'vurl' + (filled ? ' vurl-filled' : '')
  }, /*#__PURE__*/React.createElement("input", {
    className: "vurl-input",
    value: value,
    onChange: e => onChange && onChange(e.target.value),
    placeholder: placeholder,
    spellCheck: false,
    autoComplete: "off"
  }), filled && /*#__PURE__*/React.createElement("button", {
    className: "vurl-clear",
    onClick: () => {
      onChange && onChange('');
      onClear && onClear();
    },
    "aria-label": "Clear"
  }, /*#__PURE__*/React.createElement("svg", {
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: "2",
    strokeLinecap: "round"
  }, /*#__PURE__*/React.createElement("line", {
    x1: "18",
    y1: "6",
    x2: "6",
    y2: "18"
  }), /*#__PURE__*/React.createElement("line", {
    x1: "6",
    y1: "6",
    x2: "18",
    y2: "18"
  }))), /*#__PURE__*/React.createElement("button", {
    className: "vurl-paste",
    onClick: handlePaste
  }, /*#__PURE__*/React.createElement("svg", {
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: "2",
    strokeLinecap: "round",
    strokeLinejoin: "round"
  }, /*#__PURE__*/React.createElement("rect", {
    width: "8",
    height: "4",
    x: "8",
    y: "2",
    rx: "1"
  }), /*#__PURE__*/React.createElement("path", {
    d: "M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"
  })), "Paste"));
}
Object.assign(__ds_scope, { UrlBar });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/app/UrlBar.jsx", error: String((e && e.message) || e) }); }

// components/core/Button.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
const CSS = `
.vela-btn{
  --_h: var(--control-md);
  display:inline-flex; align-items:center; justify-content:center; gap:8px;
  height:var(--_h); padding:0 16px;
  font:var(--weight-semibold) var(--text-base)/1 var(--font-sans);
  letter-spacing:var(--tracking-snug);
  border:1px solid transparent; border-radius:var(--radius-md);
  cursor:pointer; white-space:nowrap; user-select:none;
  transition:background var(--dur-fast) var(--ease-out),
             border-color var(--dur-fast) var(--ease-out),
             color var(--dur-fast) var(--ease-out),
             transform var(--dur-instant) var(--ease-out),
             box-shadow var(--dur-fast) var(--ease-out);
}
.vela-btn:focus-visible{ outline:none; box-shadow:var(--ring-focus); }
.vela-btn:active{ transform:translateY(0.5px) scale(0.985); }
.vela-btn[disabled]{ cursor:not-allowed; opacity:0.45; transform:none; box-shadow:none; }

.vela-btn--sm{ --_h:var(--control-sm); padding:0 12px; font-size:var(--text-sm); border-radius:var(--radius-sm); }
.vela-btn--lg{ --_h:var(--control-lg); padding:0 22px; font-size:var(--text-md); }
.vela-btn--block{ width:100%; }
.vela-btn--icon-only{ padding:0; width:var(--_h); }

.vela-btn__spinner{ width:15px; height:15px; border-radius:50%;
  border:2px solid currentColor; border-right-color:transparent;
  animation:vela-btn-spin 0.7s linear infinite; opacity:0.9; }
@keyframes vela-btn-spin{ to{ transform:rotate(360deg); } }
.vela-btn svg{ width:16px; height:16px; flex:0 0 auto; }
.vela-btn--lg svg{ width:18px; height:18px; }

/* primary */
.vela-btn--primary{ background:var(--vela-primary); color:var(--vela-on-primary); box-shadow:var(--glow-primary), var(--edge-highlight); }
.vela-btn--primary:hover:not([disabled]){ background:var(--vela-primary-hover); }
.vela-btn--primary:active:not([disabled]){ background:var(--vela-primary-press); }

/* secondary (filled indigo) */
.vela-btn--secondary{ background:var(--vela-secondary); color:#fff; box-shadow:var(--glow-secondary), var(--edge-highlight); }
.vela-btn--secondary:hover:not([disabled]){ background:var(--vela-secondary-hover); }

/* neutral / outline */
.vela-btn--neutral{ background:var(--vela-surface-3); color:var(--vela-text); border-color:var(--vela-border); box-shadow:var(--edge-highlight); }
.vela-btn--neutral:hover:not([disabled]){ background:var(--vela-overlay); border-color:var(--vela-border-strong); }

/* ghost */
.vela-btn--ghost{ background:transparent; color:var(--vela-text-2); }
.vela-btn--ghost:hover:not([disabled]){ background:var(--vela-surface-3); color:var(--vela-text); }

/* soft tinted */
.vela-btn--soft{ background:var(--vela-primary-soft); color:var(--vela-primary-text); }
.vela-btn--soft:hover:not([disabled]){ background:var(--vela-primary-line); color:var(--vela-text); }

/* danger */
.vela-btn--danger{ background:var(--vela-danger-soft); color:var(--vela-danger); }
.vela-btn--danger:hover:not([disabled]){ background:var(--vela-danger); color:#fff; }
`;
if (typeof document !== 'undefined' && !document.getElementById('vela-btn-css')) {
  const el = document.createElement('style');
  el.id = 'vela-btn-css';
  el.textContent = CSS;
  document.head.appendChild(el);
}
function Button({
  variant = 'primary',
  size = 'md',
  block = false,
  loading = false,
  disabled = false,
  iconLeft = null,
  iconRight = null,
  iconOnly = false,
  type = 'button',
  className = '',
  children,
  ...rest
}) {
  const cls = ['vela-btn', `vela-btn--${variant}`, size !== 'md' ? `vela-btn--${size}` : '', block ? 'vela-btn--block' : '', iconOnly ? 'vela-btn--icon-only' : '', className].filter(Boolean).join(' ');
  return /*#__PURE__*/React.createElement("button", _extends({
    type: type,
    className: cls,
    disabled: disabled || loading
  }, rest), loading && /*#__PURE__*/React.createElement("span", {
    className: "vela-btn__spinner",
    "aria-hidden": "true"
  }), !loading && iconLeft, !iconOnly && children != null && /*#__PURE__*/React.createElement("span", null, children), !loading && iconRight);
}
Object.assign(__ds_scope, { Button });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/core/Button.jsx", error: String((e && e.message) || e) }); }

// components/core/IconButton.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
const CSS = `
.vela-iconbtn{
  --_s: var(--control-md);
  display:inline-flex; align-items:center; justify-content:center;
  width:var(--_s); height:var(--_s); padding:0;
  color:var(--vela-text-2); background:transparent;
  border:1px solid transparent; border-radius:var(--radius-md);
  cursor:pointer; transition:background var(--dur-fast) var(--ease-out),
    color var(--dur-fast) var(--ease-out), border-color var(--dur-fast) var(--ease-out),
    transform var(--dur-instant) var(--ease-out);
}
.vela-iconbtn svg{ width:18px; height:18px; }
.vela-iconbtn:hover:not([disabled]){ background:var(--vela-surface-3); color:var(--vela-text); }
.vela-iconbtn:active:not([disabled]){ transform:scale(0.92); }
.vela-iconbtn:focus-visible{ outline:none; box-shadow:var(--ring-focus); }
.vela-iconbtn[disabled]{ opacity:0.4; cursor:not-allowed; }
.vela-iconbtn--sm{ --_s:var(--control-sm); border-radius:var(--radius-sm); }
.vela-iconbtn--sm svg{ width:16px; height:16px; }
.vela-iconbtn--lg{ --_s:var(--control-lg); }
.vela-iconbtn--lg svg{ width:20px; height:20px; }
.vela-iconbtn--solid{ background:var(--vela-surface-3); border-color:var(--vela-border); color:var(--vela-text); }
.vela-iconbtn--solid:hover:not([disabled]){ background:var(--vela-overlay); }
.vela-iconbtn--active{ background:var(--vela-primary-soft); color:var(--vela-primary-text); }
.vela-iconbtn--danger:hover:not([disabled]){ background:var(--vela-danger-soft); color:var(--vela-danger); }
`;
if (typeof document !== 'undefined' && !document.getElementById('vela-iconbtn-css')) {
  const el = document.createElement('style');
  el.id = 'vela-iconbtn-css';
  el.textContent = CSS;
  document.head.appendChild(el);
}
function IconButton({
  size = 'md',
  variant = 'ghost',
  active = false,
  danger = false,
  disabled = false,
  className = '',
  children,
  ...rest
}) {
  const cls = ['vela-iconbtn', size !== 'md' ? `vela-iconbtn--${size}` : '', variant === 'solid' ? 'vela-iconbtn--solid' : '', active ? 'vela-iconbtn--active' : '', danger ? 'vela-iconbtn--danger' : '', className].filter(Boolean).join(' ');
  return /*#__PURE__*/React.createElement("button", _extends({
    type: "button",
    className: cls,
    disabled: disabled
  }, rest), children);
}
Object.assign(__ds_scope, { IconButton });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/core/IconButton.jsx", error: String((e && e.message) || e) }); }

// components/feedback/Badge.jsx
try { (() => {
(function () {
  const id = 'vela-badge-css';
  if (document.getElementById(id)) return;
  const s = document.createElement('style');
  s.id = id;
  s.textContent = `
.vbadge{display:inline-flex;align-items:center;gap:4px;border-radius:var(--radius-full);white-space:nowrap;font-weight:500;letter-spacing:.02em}
.vbadge.vbsm{padding:2px 7px;font-size:10px;line-height:1.4}
.vbadge.vbmd{padding:3px 9px;font-size:11px;line-height:1.4}
.vbadge.vblg{padding:4px 11px;font-size:12px;line-height:1.4}
.vbadge svg{width:10px;height:10px;flex-shrink:0}
.vbadge.vb-default{background:var(--vela-surface-3);color:var(--vela-text-2)}
.vbadge.vb-primary{background:var(--vela-primary-soft);color:var(--teal-300)}
.vbadge.vb-secondary{background:var(--vela-secondary-soft);color:var(--indigo-300)}
.vbadge.vb-success{background:var(--vela-success-soft);color:var(--vela-success)}
.vbadge.vb-warning{background:var(--vela-warning-soft);color:var(--vela-warning)}
.vbadge.vb-danger{background:var(--vela-danger-soft);color:var(--vela-danger)}
.vbadge.vb-info{background:var(--vela-info-soft);color:var(--vela-info)}
.vbadge.vb-video{background:var(--vela-primary-soft);color:var(--vela-video)}
.vbadge.vb-audio{background:var(--vela-secondary-soft);color:var(--vela-audio)}
  `;
  document.head.appendChild(s);
})();
function Badge({
  children,
  variant = 'default',
  size = 'md',
  icon
}) {
  return /*#__PURE__*/React.createElement("span", {
    className: ['vbadge', 'vb-' + variant, 'vb' + size].join(' ')
  }, icon && icon, children);
}
Object.assign(__ds_scope, { Badge });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/feedback/Badge.jsx", error: String((e && e.message) || e) }); }

// components/feedback/ProgressBar.jsx
try { (() => {
(function () {
  const id = 'vela-pb-css';
  if (document.getElementById(id)) return;
  const s = document.createElement('style');
  s.id = id;
  s.textContent = `
@keyframes vela-pb-ind{from{transform:translateX(-100%) scaleX(.6)}to{transform:translateX(280%) scaleX(.6)}}
.vpb-wrap{display:flex;flex-direction:column;gap:5px}
.vpb-header{display:flex;justify-content:space-between;align-items:center}
.vpb-label{font:var(--type-sm);color:var(--vela-text-2)}
.vpb-val{font:var(--type-data);color:var(--vela-text-3);font-variant-numeric:tabular-nums;font-size:11px}
.vpb-track{width:100%;background:var(--vela-surface-3);border-radius:var(--radius-full);overflow:hidden}
.vpb-track.vpb-xs{height:3px}
.vpb-track.vpb-sm{height:4px}
.vpb-track.vpb-md{height:6px}
.vpb-track.vpb-lg{height:8px}
.vpb-fill{height:100%;border-radius:var(--radius-full);transition:width 350ms ease-out}
.vpb-fill.vpb-primary{background:var(--vela-primary);box-shadow:0 0 8px oklch(0.507 .101 135.6/.5)}
.vpb-fill.vpb-secondary{background:var(--vela-secondary);box-shadow:0 0 8px oklch(0.97 0 0/.25)}
.vpb-fill.vpb-gradient{background:var(--vela-gradient);box-shadow:0 0 10px oklch(0.507 .101 135.6/.45)}
.vpb-fill.vpb-success{background:var(--vela-success)}
.vpb-fill.vpb-danger{background:var(--vela-danger)}
.vpb-fill.vpb-ind{width:40%!important;animation:vela-pb-ind 1.3s ease-in-out infinite}
  `;
  document.head.appendChild(s);
})();
function ProgressBar({
  value = 0,
  label,
  showValue = false,
  size = 'sm',
  color = 'primary',
  indeterminate = false
}) {
  const pct = Math.min(100, Math.max(0, value));
  return /*#__PURE__*/React.createElement("div", {
    className: "vpb-wrap"
  }, (label || showValue) && /*#__PURE__*/React.createElement("div", {
    className: "vpb-header"
  }, label && /*#__PURE__*/React.createElement("span", {
    className: "vpb-label"
  }, label), showValue && !indeterminate && /*#__PURE__*/React.createElement("span", {
    className: "vpb-val"
  }, pct, "%")), /*#__PURE__*/React.createElement("div", {
    className: 'vpb-track vpb-' + size,
    role: "progressbar",
    "aria-valuenow": pct,
    "aria-valuemin": 0,
    "aria-valuemax": 100
  }, /*#__PURE__*/React.createElement("div", {
    className: ['vpb-fill', 'vpb-' + color, indeterminate ? 'vpb-ind' : ''].filter(Boolean).join(' '),
    style: indeterminate ? {} : {
      width: pct + '%'
    }
  })));
}
Object.assign(__ds_scope, { ProgressBar });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/feedback/ProgressBar.jsx", error: String((e && e.message) || e) }); }

// components/feedback/Spinner.jsx
try { (() => {
(function () {
  const id = 'vela-spin-css';
  if (document.getElementById(id)) return;
  const s = document.createElement('style');
  s.id = id;
  s.textContent = `
@keyframes vela-spin{to{transform:rotate(360deg)}}
.vspin{display:inline-flex;align-items:center;justify-content:center;animation:vela-spin .72s linear infinite;flex-shrink:0}
.vspin.vspin-xs svg{width:12px;height:12px}
.vspin.vspin-sm svg{width:16px;height:16px}
.vspin.vspin-md svg{width:22px;height:22px}
.vspin.vspin-lg svg{width:32px;height:32px}
.vspin.vspin-primary{color:var(--vela-primary-text)}
.vspin.vspin-secondary{color:var(--vela-secondary)}
.vspin.vspin-muted{color:var(--vela-text-3)}
.vspin.vspin-white{color:#fff}
  `;
  document.head.appendChild(s);
})();
function Spinner({
  size = 'md',
  color = 'primary'
}) {
  const r = 9,
    c = 2 * Math.PI * r;
  return /*#__PURE__*/React.createElement("span", {
    className: ['vspin', 'vspin-' + size, 'vspin-' + color].join(' '),
    role: "status",
    "aria-label": "Loading"
  }, /*#__PURE__*/React.createElement("svg", {
    viewBox: "0 0 24 24",
    fill: "none"
  }, /*#__PURE__*/React.createElement("circle", {
    cx: "12",
    cy: "12",
    r: r,
    stroke: "currentColor",
    strokeOpacity: ".2",
    strokeWidth: "2.5"
  }), /*#__PURE__*/React.createElement("circle", {
    cx: "12",
    cy: "12",
    r: r,
    stroke: "currentColor",
    strokeWidth: "2.5",
    strokeLinecap: "round",
    strokeDasharray: c,
    strokeDashoffset: c * .75
  })));
}
Object.assign(__ds_scope, { Spinner });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/feedback/Spinner.jsx", error: String((e && e.message) || e) }); }

// components/forms/Checkbox.jsx
try { (() => {
(function () {
  const id = 'vela-cb-css';
  if (document.getElementById(id)) return;
  const s = document.createElement('style');
  s.id = id;
  s.textContent = `
.vcb{display:inline-flex;align-items:center;gap:8px;cursor:pointer;user-select:none}
.vcb.vcb-dis{opacity:0.45;pointer-events:none}
.vcb-box{width:16px;height:16px;flex-shrink:0;border-radius:var(--radius-xs);border:1.5px solid var(--vela-border-strong);background:var(--vela-surface-3);display:flex;align-items:center;justify-content:center;transition:background 120ms,border-color 120ms,box-shadow 120ms}
.vcb-hinput{position:absolute;opacity:0;width:0;height:0}
.vcb.vcb-checked .vcb-box,.vcb.vcb-mixed .vcb-box{background:var(--vela-primary);border-color:var(--vela-primary)}
.vcb-mark{color:var(--vela-on-primary);display:none;pointer-events:none}
.vcb.vcb-checked .vcb-mark,.vcb.vcb-mixed .vcb-mark{display:flex}
.vcb:focus-within .vcb-box{box-shadow:var(--ring-focus)}
.vcb-lbl{font:var(--type-sm);color:var(--vela-text-2)}
  `;
  document.head.appendChild(s);
})();
function Checkbox({
  checked = false,
  onChange,
  indeterminate = false,
  label,
  disabled = false
}) {
  return /*#__PURE__*/React.createElement("label", {
    className: ['vcb', checked ? 'vcb-checked' : '', indeterminate ? 'vcb-mixed' : '', disabled ? 'vcb-dis' : ''].filter(Boolean).join(' ')
  }, /*#__PURE__*/React.createElement("input", {
    className: "vcb-hinput",
    type: "checkbox",
    checked: checked,
    onChange: e => onChange && onChange(e.target.checked),
    disabled: disabled
  }), /*#__PURE__*/React.createElement("span", {
    className: "vcb-box"
  }, /*#__PURE__*/React.createElement("span", {
    className: "vcb-mark"
  }, indeterminate ? /*#__PURE__*/React.createElement("svg", {
    width: "10",
    height: "2",
    viewBox: "0 0 10 2"
  }, /*#__PURE__*/React.createElement("line", {
    x1: "0",
    y1: "1",
    x2: "10",
    y2: "1",
    stroke: "currentColor",
    strokeWidth: "2",
    strokeLinecap: "round"
  })) : /*#__PURE__*/React.createElement("svg", {
    width: "10",
    height: "8",
    viewBox: "0 0 10 8"
  }, /*#__PURE__*/React.createElement("polyline", {
    points: "1,4 4,7 9,1",
    stroke: "currentColor",
    strokeWidth: "2",
    fill: "none",
    strokeLinecap: "round",
    strokeLinejoin: "round"
  })))), label && /*#__PURE__*/React.createElement("span", {
    className: "vcb-lbl"
  }, label));
}
Object.assign(__ds_scope, { Checkbox });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/forms/Checkbox.jsx", error: String((e && e.message) || e) }); }

// components/forms/Input.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
(function () {
  const id = 'vela-input-css';
  if (document.getElementById(id)) return;
  const s = document.createElement('style');
  s.id = id;
  s.textContent = `
.vi-wrap{display:flex;flex-direction:column;gap:5px}
.vi-lbl{font:var(--type-caption);color:var(--vela-text-3);text-transform:uppercase;letter-spacing:var(--tracking-caps)}
.vi-field{display:flex;align-items:center;background:var(--vela-surface-3);border:1px solid var(--vela-border);border-radius:var(--radius-md);transition:border-color 120ms,box-shadow 120ms;position:relative}
.vi-field:focus-within{border-color:var(--vela-primary-line);box-shadow:var(--ring-focus)}
.vi-field.vi-err{border-color:var(--vela-danger)}
.vi-field.vi-err:focus-within{box-shadow:0 0 0 3px oklch(0.67 0.18 22/0.22)}
.vi-field.vi-dis{opacity:0.45;pointer-events:none}
.vi-field.vi-sm{height:var(--control-sm);border-radius:var(--radius-sm)}
.vi-field.vi-md{height:var(--control-md)}
.vi-field.vi-lg{height:var(--control-lg);border-radius:var(--radius-lg)}
.vi-pre,.vi-suf{display:flex;align-items:center;padding:0 10px;color:var(--vela-text-3);flex-shrink:0}
.vi-pre svg,.vi-suf svg{width:15px;height:15px}
.vi-pre+.vi-inp{padding-left:4px}
.vi-inp{flex:1;background:transparent;border:none;outline:none;color:var(--vela-text);font:var(--type-body);padding:0 12px;width:0;min-width:0}
.vi-sm .vi-inp{font:var(--type-sm);padding:0 10px}
.vi-lg .vi-inp{font-size:15px;padding:0 14px}
.vi-inp::placeholder{color:var(--vela-text-3)}
.vi-hint{font:var(--type-caption);color:var(--vela-text-3)}
.vi-errmsg{font:var(--type-caption);color:var(--vela-danger)}
  `;
  document.head.appendChild(s);
})();
function Input({
  label,
  value,
  onChange,
  placeholder,
  error,
  hint,
  prefix,
  suffix,
  size = 'md',
  disabled = false,
  type = 'text',
  ...rest
}) {
  return /*#__PURE__*/React.createElement("div", {
    className: "vi-wrap"
  }, label && /*#__PURE__*/React.createElement("label", {
    className: "vi-lbl"
  }, label), /*#__PURE__*/React.createElement("div", {
    className: ['vi-field', 'vi-' + size, error ? 'vi-err' : '', disabled ? 'vi-dis' : ''].filter(Boolean).join(' ')
  }, prefix && /*#__PURE__*/React.createElement("span", {
    className: "vi-pre"
  }, prefix), /*#__PURE__*/React.createElement("input", _extends({
    className: "vi-inp",
    type: type,
    value: value,
    onChange: e => onChange && onChange(e.target.value),
    placeholder: placeholder,
    disabled: disabled
  }, rest)), suffix && /*#__PURE__*/React.createElement("span", {
    className: "vi-suf"
  }, suffix)), error && /*#__PURE__*/React.createElement("span", {
    className: "vi-errmsg"
  }, error), hint && !error && /*#__PURE__*/React.createElement("span", {
    className: "vi-hint"
  }, hint));
}
Object.assign(__ds_scope, { Input });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/forms/Input.jsx", error: String((e && e.message) || e) }); }

// components/forms/SegmentedControl.jsx
try { (() => {
(function () {
  const id = 'vela-seg-css';
  if (document.getElementById(id)) return;
  const s = document.createElement('style');
  s.id = id;
  s.textContent = `
.vseg{display:inline-flex;background:var(--vela-surface-3);border-radius:var(--radius-md);padding:3px;gap:2px;border:1px solid var(--vela-border-subtle)}
.vseg-btn{flex:1;display:flex;align-items:center;justify-content:center;gap:6px;border:none;background:transparent;color:var(--vela-text-3);cursor:pointer;border-radius:calc(var(--radius-md) - 2px);transition:background 120ms,color 120ms;font:var(--type-sm);white-space:nowrap;padding:0 12px}
.vseg.vseg-sm .vseg-btn{height:calc(var(--control-sm) - 6px);font:var(--type-xs);padding:0 8px}
.vseg.vseg-md .vseg-btn{height:calc(var(--control-md) - 6px)}
.vseg.vseg-lg .vseg-btn{height:calc(var(--control-lg) - 6px);font-size:15px;padding:0 16px}
.vseg-btn svg{width:14px;height:14px;flex-shrink:0}
.vseg-btn:hover:not(.vseg-active):not(:disabled){background:var(--vela-surface-2);color:var(--vela-text-2)}
.vseg-btn.vseg-active{background:var(--vela-primary);color:var(--vela-on-primary);box-shadow:var(--shadow-xs)}
.vseg-btn.vseg-active.vseg-secondary{background:var(--vela-secondary);color:#fff}
.vseg-btn:disabled{opacity:0.45;cursor:not-allowed}
  `;
  document.head.appendChild(s);
})();
function SegmentedControl({
  options = [],
  value,
  onChange,
  size = 'md',
  color = 'primary',
  disabled = false
}) {
  return /*#__PURE__*/React.createElement("div", {
    className: 'vseg vseg-' + size,
    role: "group"
  }, options.map(opt => /*#__PURE__*/React.createElement("button", {
    key: opt.value,
    className: ['vseg-btn', value === opt.value ? 'vseg-active' : '', value === opt.value && color === 'secondary' ? 'vseg-secondary' : ''].filter(Boolean).join(' '),
    onClick: () => !disabled && onChange && onChange(opt.value),
    disabled: disabled,
    "aria-pressed": value === opt.value
  }, opt.icon && opt.icon, opt.label)));
}
Object.assign(__ds_scope, { SegmentedControl });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/forms/SegmentedControl.jsx", error: String((e && e.message) || e) }); }

// components/forms/Select.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
(function () {
  const id = 'vela-sel-css';
  if (document.getElementById(id)) return;
  const s = document.createElement('style');
  s.id = id;
  s.textContent = `
.vsel-wrap{display:flex;flex-direction:column;gap:5px}
.vsel-lbl{font:var(--type-caption);color:var(--vela-text-3);text-transform:uppercase;letter-spacing:var(--tracking-caps)}
.vsel-field{position:relative}
.vsel{appearance:none;-webkit-appearance:none;width:100%;background:var(--vela-surface-3);border:1px solid var(--vela-border);border-radius:var(--radius-md);color:var(--vela-text);font:var(--type-body);padding:0 32px 0 12px;height:var(--control-md);cursor:pointer;outline:none;transition:border-color 120ms,box-shadow 120ms}
.vsel:hover{border-color:var(--vela-border-strong)}
.vsel:focus{border-color:var(--vela-primary-line);box-shadow:var(--ring-focus)}
.vsel:disabled{opacity:0.45;cursor:not-allowed}
.vsel option{background:var(--vela-overlay,#2a2d38);color:var(--vela-text)}
.vsel-arrow{position:absolute;right:10px;top:50%;transform:translateY(-50%);pointer-events:none;color:var(--vela-text-3)}
.vsel-arrow svg{width:12px;height:12px}
  `;
  document.head.appendChild(s);
})();
function Select({
  label,
  value,
  onChange,
  options = [],
  placeholder,
  disabled = false,
  ...rest
}) {
  return /*#__PURE__*/React.createElement("div", {
    className: "vsel-wrap"
  }, label && /*#__PURE__*/React.createElement("label", {
    className: "vsel-lbl"
  }, label), /*#__PURE__*/React.createElement("div", {
    className: "vsel-field"
  }, /*#__PURE__*/React.createElement("select", _extends({
    className: "vsel",
    value: value,
    onChange: e => onChange && onChange(e.target.value),
    disabled: disabled
  }, rest), placeholder && /*#__PURE__*/React.createElement("option", {
    value: ""
  }, placeholder), options.map(o => /*#__PURE__*/React.createElement("option", {
    key: o.value,
    value: o.value
  }, o.label))), /*#__PURE__*/React.createElement("span", {
    className: "vsel-arrow"
  }, /*#__PURE__*/React.createElement("svg", {
    viewBox: "0 0 12 12",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: "1.8",
    strokeLinecap: "round"
  }, /*#__PURE__*/React.createElement("polyline", {
    points: "2,4 6,8 10,4"
  })))));
}
Object.assign(__ds_scope, { Select });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/forms/Select.jsx", error: String((e && e.message) || e) }); }

// components/forms/Switch.jsx
try { (() => {
(function () {
  const id = 'vela-sw-css';
  if (document.getElementById(id)) return;
  const s = document.createElement('style');
  s.id = id;
  s.textContent = `
.vsw{display:inline-flex;align-items:center;gap:8px;cursor:pointer;user-select:none}
.vsw.vsw-dis{opacity:0.45;pointer-events:none}
.vsw-track{position:relative;border-radius:var(--radius-full);background:var(--vela-surface-3);border:1px solid var(--vela-border);transition:background 150ms,border-color 150ms,box-shadow 150ms;flex-shrink:0}
.vsw-md .vsw-track{width:36px;height:20px}
.vsw-sm .vsw-track{width:28px;height:16px}
.vsw-thumb{position:absolute;top:50%;transform:translateY(-50%);border-radius:50%;background:var(--slate-400);transition:left 150ms cubic-bezier(0.34,1.4,0.64,1),background 150ms}
.vsw-md .vsw-thumb{width:14px;height:14px;left:2px}
.vsw-sm .vsw-thumb{width:10px;height:10px;left:2px}
.vsw.vsw-on .vsw-track{background:var(--vela-primary);border-color:var(--vela-primary)}
.vsw.vsw-on .vsw-thumb{background:#fff;left:calc(100% - 16px)}
.vsw-sm.vsw-on .vsw-thumb{left:calc(100% - 12px)}
.vsw-lbl{font:var(--type-sm);color:var(--vela-text-2)}
.vsw:focus-within .vsw-track{box-shadow:var(--ring-focus)}
.vsw-inp{position:absolute;opacity:0;width:0;height:0}
  `;
  document.head.appendChild(s);
})();
function Switch({
  checked = false,
  onChange,
  label,
  size = 'md',
  disabled = false
}) {
  return /*#__PURE__*/React.createElement("label", {
    className: ['vsw', 'vsw-' + size, checked ? 'vsw-on' : '', disabled ? 'vsw-dis' : ''].filter(Boolean).join(' ')
  }, /*#__PURE__*/React.createElement("input", {
    className: "vsw-inp",
    type: "checkbox",
    checked: checked,
    onChange: e => onChange && onChange(e.target.checked),
    disabled: disabled
  }), /*#__PURE__*/React.createElement("span", {
    className: "vsw-track"
  }, /*#__PURE__*/React.createElement("span", {
    className: "vsw-thumb"
  })), label && /*#__PURE__*/React.createElement("span", {
    className: "vsw-lbl"
  }, label));
}
Object.assign(__ds_scope, { Switch });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/forms/Switch.jsx", error: String((e && e.message) || e) }); }

__ds_ns.DownloadRow = __ds_scope.DownloadRow;

__ds_ns.FormatToggle = __ds_scope.FormatToggle;

__ds_ns.PlaylistMode = __ds_scope.PlaylistMode;

__ds_ns.UrlBar = __ds_scope.UrlBar;

__ds_ns.Button = __ds_scope.Button;

__ds_ns.IconButton = __ds_scope.IconButton;

__ds_ns.Badge = __ds_scope.Badge;

__ds_ns.ProgressBar = __ds_scope.ProgressBar;

__ds_ns.Spinner = __ds_scope.Spinner;

__ds_ns.Checkbox = __ds_scope.Checkbox;

__ds_ns.Input = __ds_scope.Input;

__ds_ns.SegmentedControl = __ds_scope.SegmentedControl;

__ds_ns.Select = __ds_scope.Select;

__ds_ns.Switch = __ds_scope.Switch;

})();
