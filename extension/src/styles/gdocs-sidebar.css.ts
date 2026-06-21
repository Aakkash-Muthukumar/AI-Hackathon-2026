/** Scaffold Google Docs sidebar — launcher + floating slide-in panel styles. */
export const GDOCS_SIDEBAR_CSS = `
:root,.scaffold-root{
  --sf-blue:#2563eb;
  --sf-blue-dark:#1d4ed8;
  --sf-track:#e6f1fb;
  --sf-ink:#1e293b;
  --sf-muted:#64748b;
  --sf-dot:#93b8f0;
  --sf-ease:cubic-bezier(.22,1,.36,1);
  --sf-panel-radius:20px;
  --sf-float-gap:16px;
}

.scaffold-launcher{
  position:fixed;right:0;top:50%;transform:translateY(-50%);
  height:72px;width:46px;background:var(--sf-blue);border:none;
  border-radius:16px 0 0 16px;display:flex;align-items:center;
  justify-content:flex-start;gap:9px;overflow:hidden;cursor:pointer;
  padding:0 0 0 13px;box-shadow:-2px 0 14px rgba(37,99,235,.3);
  transition:width .42s var(--sf-ease),transform .42s var(--sf-ease),opacity .3s ease;
  z-index:2147483000;font-family:system-ui,-apple-system,"Segoe UI",sans-serif;
}
.scaffold-launcher:hover{width:148px}
.scaffold-launcher:focus-visible{outline:3px solid #93b8f0;outline-offset:2px}
.sf-mark{flex:0 0 auto;display:block}
.sf-word{color:#fff;font-size:16px;font-weight:500;white-space:nowrap;opacity:0;
  transform:translateX(-8px);transition:opacity .26s ease .04s,transform .34s var(--sf-ease) .04s}
.scaffold-launcher:hover .sf-word{opacity:1;transform:translateX(0)}
.sf-launch-cov{position:absolute;bottom:0;left:0;right:0;height:3px;background:rgba(255,255,255,.25)}
.sf-launch-cov-fill{height:100%;transition:width .6s var(--sf-ease)}

.scaffold-bottom-bar{
  position:fixed;bottom:0;left:0;right:0;height:12px;background:transparent;
  cursor:pointer;z-index:2147482999;overflow:visible;transition:height .2s ease;
  font-family:system-ui,-apple-system,"Segoe UI",sans-serif;
}
.scaffold-bottom-bar.expanded{height:44px}
.scaffold-bottom-inner{
  position:absolute;bottom:0;left:0;right:0;height:12px;background:#e5e7eb;
  display:flex;align-items:flex-end;overflow:visible;
}
.scaffold-bottom-fill{height:100%;display:flex;align-items:flex-end;transition:width .5s ease}
.scaffold-bottom-seg{
  height:12px;flex-shrink:0;position:relative;
  transition:width .18s ease,height .18s ease;
}
.scaffold-bottom-seg.hovered{height:22px;border-radius:4px 4px 0 0}
.scaffold-bottom-tip{
  position:absolute;bottom:100%;left:50%;transform:translateX(-50%);
  margin-bottom:6px;padding:5px 10px;background:#1e293b;color:#fff;
  font-size:11px;font-weight:500;border-radius:6px;white-space:nowrap;
  pointer-events:none;box-shadow:0 2px 10px rgba(0,0,0,.18);z-index:1;
}

.scaffold-sidebar{
  position:fixed;
  top:var(--sf-float-gap);right:var(--sf-float-gap);bottom:var(--sf-float-gap);
  width:340px;height:auto;max-height:calc(100vh - 32px);
  background:#fff;
  border:1px solid rgba(2,8,40,.08);
  border-radius:var(--sf-panel-radius);
  box-shadow:0 12px 48px rgba(2,8,40,.16),0 4px 16px rgba(2,8,40,.08);
  transform:translateX(calc(100% + var(--sf-float-gap) + 8px));
  transition:transform .55s var(--sf-ease),opacity .35s ease;
  z-index:2147483001;
  display:flex;flex-direction:column;font-family:system-ui,-apple-system,"Segoe UI",sans-serif;
  overflow:hidden;
}
.scaffold-open .scaffold-sidebar{transform:translateX(0)}
.scaffold-open .scaffold-launcher{opacity:0;transform:translateY(-50%) translateX(72px);pointer-events:none}

.sf-head{background:var(--sf-blue);height:54px;display:flex;align-items:center;
  justify-content:space-between;padding:0 16px;flex:0 0 auto}
.sf-logo{display:flex;align-items:center;gap:8px;color:#fff;font-size:16px;font-weight:500}
.sf-actions{display:flex;align-items:center;gap:4px}
.sf-iconbtn{background:transparent;border:none;color:#fff;width:32px;height:32px;
  border-radius:10px;display:flex;align-items:center;justify-content:center;cursor:pointer;
  font-size:18px;line-height:1;transition:background .15s ease;padding:0}
.sf-iconbtn:hover{background:rgba(255,255,255,.18)}
.sf-iconbtn:disabled{opacity:.5;cursor:not-allowed}
.sf-iconbtn svg{width:18px;height:18px}
.sf-spin{animation:sf-spin .6s ease}
@keyframes sf-spin{from{transform:rotate(0)}to{transform:rotate(360deg)}}

.sf-body{padding:16px;overflow-y:auto;flex:1 1 auto;min-height:0}
.sf-row{opacity:0;transform:translateY(12px);transition:opacity .5s ease,transform .5s ease}
.scaffold-open .sf-row{opacity:1;transform:none}

.sf-sel-wrap{margin:0 0 18px}
.sf-sel{width:100%;height:38px;border:1px solid rgba(2,8,40,.18);border-radius:10px;
  padding:0 12px;font-size:14px;color:var(--sf-ink);background:#fff;cursor:pointer;
  appearance:auto}
.sf-sel:disabled{opacity:.6;cursor:not-allowed}

.sf-cov-top{display:flex;justify-content:space-between;align-items:baseline;margin:0 0 7px}
.sf-lbl{font-size:11px;letter-spacing:.8px;color:var(--sf-muted);text-transform:uppercase}
.sf-cov-pct{font-size:15px;font-weight:500;color:var(--sf-blue)}
.sf-cov-bar{height:8px;border-radius:6px;background:var(--sf-track);overflow:hidden;margin:0 0 24px}
.sf-cov-fill{width:0;height:100%;border-radius:6px;transition:width .9s var(--sf-ease) .28s;display:flex;overflow:hidden}
.scaffold-open .sf-cov-fill{width:var(--cov,0%)}
.sf-cov-seg{height:100%;flex-shrink:0}

.sf-req{margin:0 0 18px}
.sf-req-top{display:flex;justify-content:space-between;align-items:center;margin:0 0 6px;gap:8px}
.sf-req-name{font-size:14px;color:var(--sf-ink);display:flex;align-items:center;gap:8px;min-width:0}
.sf-req-name span:last-child{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.sf-dot{width:11px;height:11px;border-radius:3px;background:var(--sf-dot);flex:0 0 auto}
.sf-req-pct{font-size:13px;font-weight:500;color:var(--sf-muted);flex-shrink:0}
.sf-req-bar{height:5px;border-radius:5px;background:var(--sf-track);overflow:hidden;margin:0 0 8px}
.sf-req-bf{height:100%;border-radius:5px;width:0;transition:width .8s var(--sf-ease) .4s}
.scaffold-open .sf-req-bf{width:var(--w)}

.sf-bul{font-size:12.5px;color:var(--sf-muted);display:flex;gap:7px;margin:0 0 4px;line-height:1.45}
.sf-bul::before{content:"";width:4px;height:4px;border-radius:50%;background:var(--sf-dot);margin-top:7px;flex:0 0 auto}

.sf-foot{font-size:12px;color:#94a3b8;padding:12px 16px;border-top:1px solid rgba(2,8,40,.08);
  display:flex;align-items:center;justify-content:space-between;flex:0 0 auto;background:#fafbfc;
  border-radius:0 0 var(--sf-panel-radius) var(--sf-panel-radius)}
.sf-foot-btn{background:none;border:none;cursor:pointer;padding:2px;color:#cbd5e1;display:flex}
.sf-foot-btn:hover{color:#64748b}

.sf-center{display:flex;justify-content:center;padding:32px 0}
.sf-msg{text-align:center;color:var(--sf-muted);font-size:13px;line-height:1.6;margin:24px 0}
.sf-msg a{color:var(--sf-blue)}
.sf-auth-btn{display:inline-flex;align-items:center;gap:6px;padding:9px 16px;border-radius:10px;
  border:none;background:var(--sf-blue);color:#fff;font-size:13px;font-weight:600;cursor:pointer}
.sf-auth-btn:disabled{opacity:.6;cursor:wait}
.sf-warn{margin-top:16px;padding:12px 14px;border-radius:12px;background:#fef9c3;
  border:1px solid #fde047;font-size:12px;color:#713f12;line-height:1.6}
.sf-err{color:#ef4444;font-size:11px;margin-bottom:10px}

@media (prefers-reduced-motion:reduce){
  .scaffold-sidebar,.scaffold-launcher,.sf-row,.sf-cov-fill,.sf-req-bf,.sf-launch-cov-fill,.scaffold-bottom-bar,.scaffold-bottom-seg{transition-duration:.01ms!important}
}
`
