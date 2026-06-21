"use client";

import { useEffect, useRef } from "react";

const OVERLAY_CSS = `
.sf-complete-overlay{
  position:fixed;inset:0;z-index:9999;
  display:flex;align-items:center;justify-content:center;
  background:rgba(15,23,42,.28);
  opacity:0;pointer-events:none;transition:opacity .3s ease;
}
.sf-complete-overlay.show{opacity:1;pointer-events:auto}
.sf-cpanel{
  width:300px;background:#fff;border-radius:18px;
  border:0.5px solid rgba(2,8,40,.1);box-shadow:0 16px 50px rgba(2,8,40,.22);
  padding:32px 24px 28px;text-align:center;
}
.sf-cstage{position:relative;width:120px;height:128px;margin:0 auto 16px}
.sf-cmark{position:absolute;left:50%;top:50%;transform:translate(-50%,-50%)}
.sf-cpole{fill:#14b8a6}
.sf-cplk{transform-box:fill-box;transform-origin:left center;transform:scaleX(1);fill:#14b8a6}
.sf-cring{
  position:absolute;left:50%;top:50%;width:84px;height:84px;border-radius:50%;
  border:2.5px solid #14b8a6;transform:translate(-50%,-50%) scale(.5);opacity:0;
}
.sf-cbadge{
  position:absolute;right:14px;bottom:12px;width:34px;height:34px;border-radius:50%;
  background:#14b8a6;display:flex;align-items:center;justify-content:center;
  box-shadow:0 3px 10px rgba(20,184,166,.4);
}
.sf-ck{stroke-dasharray:20;stroke-dashoffset:0}
.sf-ctitle{font-size:18px;font-weight:500;color:#1e293b;margin:0 0 4px}
.sf-csub{font-size:13px;color:#64748b;margin:0}
@media (prefers-reduced-motion:no-preference){
  .sf-complete-overlay.show .sf-cpanel{opacity:0;transform:scale(.92);animation:sfCardIn .4s cubic-bezier(.22,1,.36,1) forwards}
  .sf-complete-overlay.show .sf-cplk{fill:#2563eb;animation:sfGrow .4s ease forwards,sfToTeal .5s ease .92s forwards}
  .sf-complete-overlay.show .sf-pBot{animation-delay:.1s,.92s}
  .sf-complete-overlay.show .sf-p3{animation-delay:.22s,.92s}
  .sf-complete-overlay.show .sf-p2{animation-delay:.34s,.92s}
  .sf-complete-overlay.show .sf-pTop{animation-delay:.46s,.92s}
  .sf-complete-overlay.show .sf-cpole{fill:#2563eb;animation:sfToTeal .5s ease .92s forwards}
  .sf-complete-overlay.show .sf-cring{animation:sfRingOut 1s ease-out .98s forwards}
  .sf-complete-overlay.show .sf-cring2{animation:sfRingOut 1s ease-out 1.14s forwards}
  .sf-complete-overlay.show .sf-cbadge{transform:scale(0);animation:sfPop .45s cubic-bezier(.34,1.56,.64,1) 1.0s forwards}
  .sf-complete-overlay.show .sf-ck{stroke-dashoffset:20;animation:sfDraw .3s ease 1.22s forwards}
  .sf-complete-overlay.show .sf-ctitle{opacity:0;transform:translateY(8px);animation:sfRise .45s ease 1.08s forwards}
  .sf-complete-overlay.show .sf-csub{opacity:0;transform:translateY(8px);animation:sfRise .45s ease 1.2s forwards}
}
@keyframes sfCardIn{to{opacity:1;transform:scale(1)}}
@keyframes sfGrow{from{transform:scaleX(0)}to{transform:scaleX(1)}}
@keyframes sfToTeal{from{fill:#2563eb}to{fill:#14b8a6}}
@keyframes sfRingOut{0%{transform:translate(-50%,-50%) scale(.5);opacity:.5}100%{transform:translate(-50%,-50%) scale(1.75);opacity:0}}
@keyframes sfPop{0%{transform:scale(0)}70%{transform:scale(1.15)}100%{transform:scale(1)}}
@keyframes sfDraw{to{stroke-dashoffset:0}}
@keyframes sfRise{to{opacity:1;transform:none}}
`;

interface Props {
  show: boolean;
  title: string;
  onDismiss: () => void;
}

export function CompleteOverlay({ show, title, onDismiss }: Props) {
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const overlayRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!show) return;
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(onDismiss, 3200);
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [show, onDismiss]);

  useEffect(() => {
    if (!show || !overlayRef.current) return;
    const ov = overlayRef.current;
    ov.classList.remove("show");
    void ov.offsetWidth;
    ov.classList.add("show");
  }, [show, title]);

  if (!show) return null;

  return (
    <>
      <style>{OVERLAY_CSS}</style>
      <div
        ref={overlayRef}
        className="sf-complete-overlay show"
        role="dialog"
        aria-label="Assignment complete"
        onClick={onDismiss}
      >
        <div className="sf-cpanel" onClick={(e) => e.stopPropagation()}>
          <div className="sf-cstage">
            <div className="sf-cring" />
            <div className="sf-cring sf-cring2" />
            <div className="sf-cmark">
              <svg viewBox="0 0 96 110" width="92" height="105" aria-hidden="true">
                <rect className="sf-cpole" x="6" y="4" width="8" height="102" rx="4" />
                <rect className="sf-cpole" x="82" y="4" width="8" height="102" rx="4" />
                <rect className="sf-cpole" x="2" y="103" width="16" height="6" rx="3" />
                <rect className="sf-cpole" x="78" y="103" width="16" height="6" rx="3" />
                <rect className="sf-cplk sf-pTop" x="16" y="16" width="64" height="12" rx="4" />
                <rect className="sf-cplk sf-p2" x="16" y="38" width="64" height="12" rx="4" />
                <rect className="sf-cplk sf-p3" x="16" y="60" width="64" height="12" rx="4" />
                <rect className="sf-cplk sf-pBot" x="16" y="82" width="64" height="12" rx="4" />
              </svg>
            </div>
            <div className="sf-cbadge">
              <svg
                width="18"
                height="18"
                viewBox="0 0 24 24"
                fill="none"
                stroke="#fff"
                strokeWidth="3"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <path className="sf-ck" d="M5 13l4 4 10-10" />
              </svg>
            </div>
          </div>
          <p className="sf-ctitle">Assignment complete</p>
          <p className="sf-csub">{title}</p>
        </div>
      </div>
    </>
  );
}
