/**
 * cinematicStyles.ts — Programmatic CSS injection for the cinematic tutor
 *
 * All classes prefixed with `ct-` to avoid collisions with IDE styles.
 * Injected as a <style> tag on mount, removed on unmount.
 */

const STYLE_ID = 'ct-cinematic-styles';

export function injectCinematicStyles() {
    if (document.getElementById(STYLE_ID)) return;
    const style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = CSS_TEXT;
    document.head.appendChild(style);
}

export function removeCinematicStyles() {
    const el = document.getElementById(STYLE_ID);
    if (el) el.remove();
}

const CSS_TEXT = `
/* ══════════════════════════════════════════════
   CINEMATIC TUTOR — Scoped styles (ct- prefix)
   ══════════════════════════════════════════════ */

/* ── Layout ── */
.ct-hdr { display:flex; align-items:center; justify-content:space-between; padding:10px 20px; background:rgba(13,13,15,.95); border-bottom:1px solid var(--border, #1e1e28); z-index:100; }
.ct-hdr-l { display:flex; align-items:center; gap:12px; }
.ct-logo { font-size:13px; font-weight:700; color:var(--green, #4ec9b0); letter-spacing:2px; text-transform:uppercase; }
.ct-logo span { color:var(--text-dim, #555566); font-weight:400; }
.ct-ftab { padding:5px 14px; background:var(--bg-panel, #13131a); border:1px solid var(--border, #1e1e28); border-radius:6px; font-size:11px; color:var(--text, #c8c8d0); font-family:'JetBrains Mono',monospace; }
.ct-hdr-r { display:flex; align-items:center; gap:12px; }

/* ── Badge ── */
.ct-badge { padding:3px 10px; border-radius:16px; font-size:10px; font-weight:600; letter-spacing:.5px; }
.ct-badge.ct-idle { background:rgba(255,255,255,.04); color:var(--text-dim, #555566); }
.ct-badge.ct-on { background:rgba(78,201,176,.12); color:var(--green, #4ec9b0); animation:ct-bp 1.5s infinite; }
.ct-badge.ct-done { background:rgba(78,201,176,.15); color:var(--green-bright, #6fffe9); }
@keyframes ct-bp { 0%,100%{box-shadow:none} 50%{box-shadow:0 0 10px 2px rgba(78,201,176,.25)} }

/* ── Controls ── */
.ct-ctrl { display:flex; align-items:center; gap:8px; padding:8px 20px; background:var(--bg-dark, #0d0d0f); border-bottom:1px solid var(--border, #1e1e28); }
.ct-btn { padding:7px 18px; border:none; border-radius:7px; font-family:'Outfit',sans-serif; font-size:12px; font-weight:600; cursor:pointer; transition:all .2s; }
.ct-btn.ct-p { background:var(--green, #4ec9b0); color:#0d0d0f; }
.ct-btn.ct-p:hover { background:var(--green-bright, #6fffe9); }
.ct-btn.ct-s { background:rgba(255,255,255,.05); color:var(--text, #c8c8d0); border:1px solid var(--border, #1e1e28); }
.ct-btn.ct-d { background:rgba(224,108,117,.1); color:var(--red, #e06c75); border:1px solid rgba(224,108,117,.2); }
.ct-spd { display:flex; align-items:center; gap:6px; margin-left:auto; font-size:10px; color:var(--text-dim, #555566); }
.ct-spd input { width:90px; accent-color:var(--green, #4ec9b0); }

/* ── Editor Wrapper ── */
.ct-ew { flex:1; position:relative; overflow:hidden; padding:14px 18px; background:var(--bg-dark, #0d0d0f); }
.ct-ei { position:relative; height:100%; border-radius:12px; border:1px solid var(--border, #1e1e28); overflow:hidden; background:var(--bg-panel, #13131a); box-shadow:0 4px 24px rgba(0,0,0,.4); }

/* ── Vignette ── */
.ct-vig { position:absolute; inset:0; pointer-events:none; z-index:10; opacity:0; transition:opacity .6s; }
.ct-vig.ct-on { opacity:1; }
.ct-vig svg { width:100%; height:100%; }

/* ── Spotlight ── */
.ct-spot { position:absolute; left:50px; border:2px solid var(--green, #4ec9b0); border-radius:10px; box-shadow:0 0 16px rgba(78,201,176,.3); pointer-events:none; transition:top 0s,height 0s,width 0s,right .15s,left .15s; z-index:12; opacity:0; }
.ct-spot.ct-v { opacity:1; }

/* ── Arrow Layer ── */
.ct-alyr { position:absolute; inset:0; pointer-events:none; z-index:13; }
.ct-alyr svg { width:100%; height:100%; }

/* ── Code Editor ── */
.ct-ed { display:flex; height:100%; overflow-y:auto; overflow-x:hidden; font-family:'JetBrains Mono',monospace; font-size:13px; line-height:22px; }
.ct-gut { width:52px; flex-shrink:0; text-align:right; padding:8px 10px 80vh 0; color:var(--text-dim, #555566); font-size:11px; user-select:none; background:var(--bg-dark, #0f0f14); border-right:1px solid var(--border, #1e1e28); }
.ct-gl { height:22px; display:flex; align-items:center; justify-content:flex-end; position:relative; }
.ct-gl .ct-gy { position:absolute; left:3px; width:3px; height:14px; border-radius:2px; opacity:0; transition:all .3s; }
.ct-gl.ct-a .ct-gy { opacity:1; background:var(--green, #4ec9b0); box-shadow:0 0 8px var(--green, #4ec9b0); }
.ct-gl.ct-t .ct-gy { opacity:.35; background:var(--green, #4ec9b0); }
.ct-co { flex:1; padding:8px 14px 80vh 14px; position:relative; }

/* ── Code Lines ── */
.ct-cl { height:22px; white-space:pre; position:relative; border-left:2px solid transparent; padding-left:6px; transition:background .3s,border-color .3s; }
.ct-cl.ct-hi { background:rgba(97,175,239,.12); border-left-color:var(--blue, #61afef); border-left-width:3px; }
.ct-cl.ct-tr { background:transparent; border-left-color:transparent; }
.ct-cl.ct-old { background:rgba(224,108,117,.12); border-left-color:rgba(224,108,117,.6); border-left-width:3px; color:var(--red, #e06c75); }
.ct-cl.ct-sw { background:rgba(224,108,117,.3) !important; box-shadow:inset 0 0 20px rgba(224,108,117,.15); }
.ct-cl.ct-gh { opacity:0; height:0; overflow:hidden; transition:opacity .3s,height .3s; }

/* ── Cursor ── */
.ct-cur { display:inline-block; width:2px; height:15px; background:var(--green-bright, #6fffe9); box-shadow:0 0 8px var(--green, #4ec9b0); animation:ct-bk .7s infinite; vertical-align:text-bottom; margin-left:1px; }
@keyframes ct-bk { 0%,100%{opacity:1} 50%{opacity:.15} }

/* ── Flash Effects ── */
.ct-ff { animation:ct-afc .6s ease-out; border-radius:2px; }
.ct-fk { animation:ct-afp .6s ease-out; border-radius:2px; }
.ct-ft { animation:ct-afb .6s ease-out; border-radius:2px; }
@keyframes ct-afc { 0%{background:rgba(86,212,245,.3);text-shadow:0 0 12px rgba(86,212,245,.7)} 100%{background:transparent;text-shadow:none} }
@keyframes ct-afp { 0%{background:rgba(198,120,221,.3);text-shadow:0 0 12px rgba(198,120,221,.7)} 100%{background:transparent;text-shadow:none} }
@keyframes ct-afb { 0%{background:rgba(97,175,239,.3);text-shadow:0 0 12px rgba(97,175,239,.7)} 100%{background:transparent;text-shadow:none} }

/* ── Syntax Colors ── */
.ct-sk { color:#c678dd; }
.ct-st { color:#61afef; }
.ct-sf { color:#56d4f5; }
.ct-ss { color:#98c379; }
.ct-sn { color:#d19a66; }
.ct-sc { color:#5c6370; font-style:italic; }
.ct-sd { color:#e06c75; }
.ct-sm { color:#e5c07b; }
.ct-se { color:#e5c07b; }

/* ── Section Divider ── */
.ct-sdiv { position:relative; height:28px; display:flex; align-items:center; gap:10px; padding-left:6px; margin:4px 0; opacity:0; transform:translateX(-20px); transition:opacity .4s,transform .4s; }
.ct-sdiv.ct-v { opacity:1; transform:translateX(0); }
.ct-sdiv .ct-dl { flex:1; height:1px; background:linear-gradient(90deg,var(--green, #4ec9b0),transparent); transform-origin:left; animation:ct-sw .6s ease-out; }
.ct-sdiv .ct-dt { font-family:'Outfit',sans-serif; font-size:10px; font-weight:600; color:var(--green, #4ec9b0); letter-spacing:.5px; text-transform:uppercase; white-space:nowrap; }
@keyframes ct-sw { from{transform:scaleX(0)} to{transform:scaleX(1)} }

/* ── Thinking Dots ── */
.ct-thi { display:inline-flex; gap:4px; padding:2px 0; height:22px; align-items:center; }
.ct-thi div { width:5px; height:5px; border-radius:50%; background:var(--green, #4ec9b0); opacity:.3; animation:ct-tha .8s infinite; }
.ct-thi div:nth-child(2) { animation-delay:.15s; }
.ct-thi div:nth-child(3) { animation-delay:.3s; }
@keyframes ct-tha { 0%,100%{opacity:.2;transform:scale(.8)} 50%{opacity:1;transform:scale(1.2)} }

/* ── Explanation Panel ── */
.ct-ep { position:absolute; width:480px; z-index:20; padding:16px; pointer-events:none; opacity:0; transition:opacity .4s,top .3s ease-out,left .15s ease-out; }
.ct-ep.ct-v { opacity:1; pointer-events:auto; }
.ct-ec { background:rgba(10,10,16,.94); border:1px solid rgba(78,201,176,.15); border-radius:18px; padding:0; backdrop-filter:blur(20px); box-shadow:0 16px 60px rgba(0,0,0,.7),0 0 50px rgba(78,201,176,.05); animation:ct-ci .4s ease-out; overflow:hidden; }
@keyframes ct-ci { from{opacity:0;transform:translateX(12px)} to{opacity:1;transform:translateX(0)} }
.ct-ec-vis { width:100%; background:rgba(0,0,0,.3); border-bottom:1px solid rgba(255,255,255,.04); }
.ct-ec-vis canvas { display:block; width:100%; }
.ct-ec-body { padding:16px 20px; }
.ct-ec-lbl { font-size:12px; font-weight:700; letter-spacing:1.2px; text-transform:uppercase; margin-bottom:10px; display:flex; align-items:center; gap:8px; }
.ct-ec-lbl .ct-dot { width:8px; height:8px; border-radius:50%; box-shadow:0 0 8px currentColor; }
.ct-ec-lbl.cm { color:#5c6370; } .ct-ec-lbl.cm .ct-dot { background:#5c6370; }
.ct-ec-lbl.fn { color:#56d4f5; } .ct-ec-lbl.fn .ct-dot { background:#56d4f5; }
.ct-ec-lbl.ty { color:#61afef; } .ct-ec-lbl.ty .ct-dot { background:#61afef; }
.ct-ec-lbl.vr { color:#e5c07b; } .ct-ec-lbl.vr .ct-dot { background:#e5c07b; }
.ct-ec-lbl.dir { color:#e06c75; } .ct-ec-lbl.dir .ct-dot { background:#e06c75; }
.ct-ec-desc { font-size:12px; color:var(--text, #c8c8d0); line-height:1.6; margin-bottom:14px; }
.ct-ec-foot { display:flex; align-items:center; gap:10px; }
.ct-ec-btn { padding:8px 24px; border-radius:8px; border:1px solid var(--green, #4ec9b0); background:rgba(78,201,176,.1); color:var(--green, #4ec9b0); font-family:"Outfit",sans-serif; font-size:12px; font-weight:600; cursor:pointer; transition:all .15s; }
.ct-ec-btn:hover { background:rgba(78,201,176,.18); box-shadow:0 0 16px rgba(78,201,176,.3); }
.ct-ec-tmr { height:6px; background:var(--border, #1e1e28); border-radius:3px; overflow:hidden; flex:1; }
.ct-ec-tf { height:100%; background:var(--green, #4ec9b0); border-radius:3px; width:100%; transition:width linear; }
.ct-ec-explain { padding:8px 20px; border-radius:6px; border:1px solid rgba(86,212,245,.2); background:rgba(86,212,245,.06); color:#56d4f5; font-family:'Outfit',sans-serif; font-size:11px; font-weight:600; cursor:pointer; transition:all .15s; margin-right:6px; }
.ct-ec-explain:hover { background:rgba(86,212,245,.12); box-shadow:0 0 12px rgba(86,212,245,.15); }

/* ── Visualizer Controls ── */
.ct-vis-ctrl { display:flex; flex-wrap:wrap; align-items:center; gap:12px; padding:14px 20px; background:rgba(0,0,0,.2); border-top:1px solid rgba(255,255,255,.04); font-size:11px; color:var(--text-dim, #555566); }
.ct-vis-ctrl label { display:flex; align-items:center; gap:8px; font-size:13px; cursor:pointer; white-space:nowrap; }
.ct-vis-ctrl input[type=range] { width:120px; accent-color:var(--green, #4ec9b0); height:3px; }
.ct-vis-ctrl .ct-val { color:var(--green, #4ec9b0); font-family:'JetBrains Mono',monospace; font-size:10px; min-width:36px; }

/* ── Token Highlight ── */
.ct-tok-hl { background:rgba(86,212,245,.25); border-radius:3px; padding:0 2px; box-shadow:0 0 8px rgba(86,212,245,.3); animation:ct-tokpulse 1s ease-in-out infinite; }
@keyframes ct-tokpulse { 0%,100%{box-shadow:0 0 8px rgba(86,212,245,.3)} 50%{box-shadow:0 0 16px rgba(86,212,245,.5)} }

/* ── Mini Explanation (tokens + connections) ── */
.ct-mini-exp { position:absolute; z-index:30; width:340px; padding:14px 16px; background:rgba(10,10,16,.95); border:1px solid rgba(86,212,245,.2); border-radius:12px; backdrop-filter:blur(16px); box-shadow:0 8px 40px rgba(0,0,0,.6); opacity:0; transform:translateX(8px); transition:opacity .3s,transform .3s,top .15s ease-out,left .15s ease-out; pointer-events:auto; }
.ct-mini-exp.ct-v { opacity:1; transform:translateX(0); }
.ct-mini-exp .ct-me-tok { font-family:'JetBrains Mono',monospace; font-size:11px; color:#56d4f5; background:rgba(86,212,245,.08); padding:3px 8px; border-radius:5px; display:inline-block; margin-bottom:8px; border:1px solid rgba(86,212,245,.15); }
.ct-mini-exp .ct-me-desc { font-size:12px; color:var(--text, #c8c8d0); line-height:1.55; }
.ct-mini-exp .ct-me-nav { display:flex; align-items:center; gap:6px; margin-top:10px; padding-top:8px; border-top:1px solid rgba(255,255,255,.06); }
.ct-mini-exp .ct-me-btn { padding:6px 14px; border-radius:6px; border:1px solid rgba(86,212,245,.2); background:rgba(86,212,245,.08); color:#56d4f5; font-family:'Outfit',sans-serif; font-size:11px; font-weight:600; cursor:pointer; transition:all .15s; }
.ct-mini-exp .ct-me-btn:hover { background:rgba(86,212,245,.15); }
.ct-mini-exp .ct-me-btn.ct-done { border-color:rgba(78,201,176,.2); background:rgba(78,201,176,.08); color:var(--green, #4ec9b0); }
.ct-mini-exp .ct-me-btn.ct-done:hover { background:rgba(78,201,176,.15); }
.ct-mini-exp .ct-me-pg { font-size:11px; color:var(--text-dim, #555566); margin-left:auto; }

/* ── Progress Bar ── */
.ct-rbar { display:flex; align-items:center; gap:8px; padding:8px 20px; background:rgba(78,201,176,.03); border-top:1px solid rgba(78,201,176,.08); opacity:0; transform:translateY(8px); transition:all .5s; }
.ct-rbar.ct-v { opacity:1; transform:translateY(0); }
.ct-rbar .ct-trk { flex:1; height:3px; background:var(--border, #1e1e28); border-radius:2px; overflow:hidden; }
.ct-rbar .ct-fl { height:100%; background:var(--green, #4ec9b0); border-radius:2px; transition:width .15s; }
.ct-rbar .ct-tm { font-size:10px; color:var(--text-dim, #555566); font-family:'JetBrains Mono',monospace; min-width:35px; }
`;
