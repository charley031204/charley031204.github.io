(function(b){window.lcs_do=d;
function a(e){!function(f,g){g=g||"ntm";
window["ntm_"+f]=g,window[g]=window[g]||[],window[g].push({"ntm.start":+new Date});
f=document.getElementsByTagName("script")[0],g=document.createElement("script");
g.async=!0,g.src=e,f.parentNode.insertBefore(g,f)
}("b7032129a433","ntm_news")
}function c(g){try{var h=g||{};
var f={event:"nLogPageViewService",nLogPageshow:true,nLogPageviewSti:h.sti||"",nLogPageviewGdid:h.gdid||""};
window.ntm_news.push(f)
}catch(i){}}function d(f){try{neloSender.sendInfoToNelo("[ntm/lcsdo] lcsdo 잔여 호출 식별 etc: "+f);
c({sti:(f&&f.sti)?f.sti:"",gdid:""})
}catch(g){neloSender.sendErrorToNelo("[ntm/lcsdo] ntm/lcsdo pageview 전송 오류 etc: "+f)
}}b.ntmInit=a;
b.ntmCustomPageViewSend=c;
b.lcsdoException=d
})(window);(function(c){window.nclk=a;
window.g_ssc=window.g_ssc||"Mnews.v2";
window.nsc=window.g_ssc;
function a(l,o,h,d,f,k,j){var p=b(l);
var m=$(p.currentTarget);
try{var n={event:"nLogClickService",ns_code:window.nsc,click_element:m[0],click_event:l,click_area:o,click_rank:d,click_cid:h};
if(k){try{n.nlogEvt=JSON.parse(k)
}catch(l){neloSender.sendErrorToNelo("[nclkWrap] 클릭코드 extra 전송 오류 : "+k)
}}window.ntm_news.push(n)
}catch(l){}}function b(f){var d=f;
if("nodeType" in f&&f.nodeType>=1){d=window.event||f
}if(f&&f.currentElement&&f.currentElement.__jindo__id){d=window.event
}return d
}c.nlogClickSend=a
})(window);