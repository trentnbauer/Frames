/* eslint-disable */
// @ts-nocheck
// Generated from design_handoff_frames/prototype/Proto Header.dc.html by the converter. The markup is the design; do not hand-edit it, wire data through `v`.
import { Fragment } from 'react';
import { st, useGo, useDCLogic } from './runtime';



export default function ProtoHeader({ v: vIn = {} as any, ...props }: { v?: any; [k: string]: any }) {
  const go = useGo();
  const lv = {};
  const v = { ...props, ...lv, ...vIn };
  return (<><header style={{"display":"grid","gridTemplateColumns":"1fr auto 1fr","alignItems":"center","marginBottom":"48px"}}><span style={{"cursor":"pointer","display":"flex","alignItems":"center","gap":"10px","font":"italic 400 22px/1 'Instrument Serif',Georgia,serif"}} onClick={() => go("home")}><svg width="24" height="20" viewBox="0 0 24 20"><rect x="5.6" y="5.6" width="18" height="14" fill="none" stroke="var(--text)" strokeOpacity=".4" strokeWidth="1.25" /><rect x="0" y="0" width="18" height="14" fill="var(--text)" /></svg>Frames</span><span /><div className="dc-root" style={{"display":"flex","justifyContent":"flex-end","alignItems":"center","gap":"6px"}}><div style={{"cursor":"pointer","display":"flex","alignItems":"center","gap":"10px","fontSize":"13px","color":"var(--text2)","height":"36px","padding":"0 10px 0 4px","borderRadius":"999px"}} onClick={() => go("profile")} className="protoheader-h1"><span style={{"width":"28px","height":"28px","borderRadius":"50%","background":"url(photos/p8.jpg) center/cover","boxShadow":"inset 0 0 0 1px color-mix(in srgb, var(--text) 12%, transparent)"}} />Trent <span style={{"color":"var(--faint)"}}>▾</span></div><span title="Notifications" style={{"cursor":"pointer","position":"relative","width":"36px","height":"36px","display":"grid","placeItems":"center","borderRadius":"999px","color":"var(--text2)"}} onClick={() => go("notifs")} className="protoheader-h2"><svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4"><path d="M3.5 11.5V7a4.5 4.5 0 0 1 9 0v4.5l1 1h-11z" /><path d="M6.5 14h3" /></svg><i style={{"position":"absolute","top":"7px","right":"8px","width":"8px","height":"8px","borderRadius":"50%","background":"oklch(0.72 0.15 45)","boxShadow":"0 0 0 2px var(--bg)"}} /></span></div></header></>);
}
