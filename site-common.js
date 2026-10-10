(function(){
  function normalizeLogo(){
    document.querySelectorAll('.logo').forEach(function(node){
      if(node.tagName!=='A'){
        var link=document.createElement('a');
        link.className=node.className;
        link.href='index.html';
        link.setAttribute('aria-label','작년, 오늘 메인으로');
        link.innerHTML=node.innerHTML;
        node.replaceWith(link);
      }else{
        node.setAttribute('aria-label',node.getAttribute('aria-label')||'작년, 오늘 메인으로');
        if(!node.getAttribute('href'))node.href='index.html';
      }
    });
  }
  function renderFooter(){
    if(document.querySelector('meta[name="lyt-no-footer"]'))return;
    document.querySelectorAll('footer').forEach(function(old){old.remove()});
    var footer=document.createElement('footer');
    footer.className='lyt-footer';
    footer.innerHTML='<div class="lyt-footer-brand"><a class="lyt-footer-logo" href="index.html">작년, 오늘</a><span class="lyt-footer-tagline">오늘의 기록이 내일의 추억이 됩니다.</span></div><div class="lyt-footer-center"><nav class="lyt-footer-links" aria-label="하단 메뉴"><a href="index.html">서비스 소개</a><a href="privacy.html">개인정보 처리방침</a><a href="support.html">1:1 문의</a></nav><div class="lyt-footer-copy">© 2026 작년, 오늘. All rights reserved.</div></div>';
    document.body.appendChild(footer);
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',function(){normalizeLogo();renderFooter()});
  else{normalizeLogo();renderFooter()}
})();