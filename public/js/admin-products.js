(function(){
  function cookie(name){
    const m = document.cookie.match(new RegExp("(?:^|; )"+name+"=([^;]*)"));
    return m ? decodeURIComponent(m[1]) : "";
  }
  async function del(id){
    if(!confirm("Delete this product? This cannot be undone.")) return;
    const res = await fetch("/api/products/"+encodeURIComponent(id), {
      method:"DELETE", headers:{"X-XSRF-TOKEN": cookie("XSRF-TOKEN")}, credentials:"same-origin"
    });
    const row = document.getElementById("product-row-"+id);
    if(res.ok){
      if(row) row.remove();
      showToast("Product deleted.");
    } else {
      const data = await res.json().catch(()=>({}));
      alert(data.message || "Could not delete the product.");
    }
  }
  document.querySelectorAll('[data-delete]').forEach(function(btn){
    btn.addEventListener("click", function(){ del(btn.dataset.delete); });
  });
  function showToast(msg){
    var t = document.createElement("div");
    t.textContent = msg; t.style.position="fixed"; t.style.top="12px"; t.style.right="12px";
    t.style.background="var(--wine)"; t.style.color="#fff"; t.style.padding="10px 16px"; t.style.borderRadius="3px";
    t.style.zIndex="100"; t.style.fontSize="12px"; document.body.appendChild(t);
    setTimeout(function(){ t.remove(); }, 3000);
  }
})();
