import React, { useState, useEffect } from "react";

export const T = {
  bg:"#FAF8F5", surface:"#F5F2EE", linen:"#F5F2EE", ink:"#3D4621", ink2:"#7A7A6F", ink3:"#8A8A80",
  border:"#E8E4DC", terra:"#9B7EC8", terraLt:"#EDE4F7", sage:"#7A9E74", sageLt:"#D8EAD8", gold:"#B8860B",
  ochre:"#9B7E30", earth:"#8B6F47", navy:"#3D4621", modal:"#FFFFFF", card:"#FFFFFF",
  serif:'"Libre Baskerville", Georgia, serif', sans:'"Raleway", -apple-system, sans-serif',
  shadow:"0 1px 3px rgba(61,70,33,0.08)",
  shadowLg:"0 4px 16px rgba(155,126,200,0.1)",
  disabled:"#B8B8AD",
  success:"#7A9E74", warning:"#B8860B", error:"#C05A5A",
};

export const useBreakpoint = () => {
  const [w, setW] = useState(typeof window !== "undefined" ? window.innerWidth : 1024);
  useEffect(() => {
    const handler = () => setW(window.innerWidth);
    window.addEventListener("resize", handler);
    return () => window.removeEventListener("resize", handler);
  }, []);
  return { isMobile: w < 768, isTablet: w >= 768 && w < 1100, isDesktop: w >= 1100, width: w };
};

export const Field = ({label,value,onChange,type="text",placeholder,rows:r}) => (
  <div style={{marginBottom:14}}>
    {label&&<div style={{fontSize:11,fontWeight:600,color:T.ink2,textTransform:"uppercase",letterSpacing:".05em",marginBottom:6}}>{label}</div>}
    {r?<textarea value={value} onChange={onChange} placeholder={placeholder} rows={r} style={{width:"100%",padding:"13px 16px",background:"transparent",border:"none",borderBottom:`2px solid transparent`,borderRadius:0,color:T.ink,fontSize:14,resize:"vertical",lineHeight:1.6,outline:"none",transition:"border-color .2s"}} onFocus={e=>e.target.style.borderBottomColor=T.terra} onBlur={e=>e.target.style.borderBottomColor="transparent"}/>
      :<input value={value} onChange={onChange} type={type} placeholder={placeholder} style={{width:"100%",padding:"13px 16px",background:"transparent",border:"none",borderBottom:`2px solid transparent`,borderRadius:0,color:T.ink,fontSize:15,outline:"none",transition:"border-color .2s"}} onFocus={e=>e.target.style.borderBottomColor=T.terra} onBlur={e=>e.target.style.borderBottomColor="transparent"}/>}
  </div>
);
