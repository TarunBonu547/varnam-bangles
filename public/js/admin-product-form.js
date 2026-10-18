(function(){
  function cookie(name){
    const m = document.cookie.match(new RegExp("(?:^|; )"+name+"=([^;]*)"));
    return m ? decodeURIComponent(m[1]) : "";
  }
  function listValue(name){
    var el = document.querySelector('select[name="'+name+'"], input[name="'+name+'"]');
    if(!el) return [];
    if(el.tagName==="SELECT") return el.value?[el.value]:[];
    return el.value.split(",").map(function(s){ return s.trim(); }).filter(Boolean);
  }
  document.getElementById("productForm").addEventListener("submit", async function(e){
    e.preventDefault();
    var form = e.target;
    var fd = new FormData(form);
    var body = {
      id: fd.get("id"),
      name: fd.get("name"),
      slug: fd.get("slug"),
      description: fd.get("description"),
      price: fd.get("price"),
      originalPrice: fd.get("originalPrice") || null,
      category: fd.get("category"),
      material: fd.get("material"),
      colour: fd.get("colour"),
      stockStatus: "in_stock",
      available: fd.get("available")==="1",
      published: fd.get("published")==="1",
      featured: fd.get("featured")==="1",
      bestseller: fd.get("bestseller")==="1",
      meeshoUrl: fd.get("meeshoUrl") || null,
      images: listValue("images")||[],
      colours: listValue("colours")||[],
      sizes: listValue("sizes")||[]
    };
    var action = form.getAttribute("action");
    var method = form.getAttribute("method")||"POST";
    var btn = form.querySelector('button[type="submit"]');
    var orig = btn.textContent;
    btn.textContent = "Saving…"; btn.disabled = true;
    try{
      var res = await fetch(action, {
        method: method, headers:{"Content-Type":"application/json","X-XSRF-TOKEN": cookie("XSRF-TOKEN")}, body:JSON.stringify(body), credentials:"same-origin"
      });
      var data = await res.json().catch(()=>({}));
      if(res.ok){
        showToast((method==="POST"?"Product created.":"Product saved."));
        setTimeout(function(){ window.location.href = "/admin/products"; }, 700);
      } else {
        if(data.fields){
          data.fields.forEach(function(f){
            var inp = form.querySelector('[name="'+f.field+'"]');
            if(inp){ inp.classList.add("error"); var d=document.createElement("p"); d.className="field-error"; d.textContent=f.message; inp.parentElement.appendChild(d); }
          });
          showToast("Please fix the highlighted fields.");
        } else {
          showToast(data.message || "Could not save the product.");
        }
      }
    }catch(err){
      showToast("Unable to reach the server.");
    } finally {
      btn.textContent = orig; btn.disabled = false;
    }
  });
  function showToast(msg){
    var t = document.createElement("div");
    t.textContent = msg; t.style.position="fixed"; t.style.top="12px"; t.style.right="12px";
    t.style.background="var(--wine)"; t.style.color="#fff"; t.style.padding="10px 16px"; t.style.borderRadius="3px";
    t.style.zIndex="100"; t.style.fontSize="12px"; document.body.appendChild(t);
    setTimeout(function(){ t.remove(); }, 3000);
  }
  document.getElementById("cancelFormBtn").addEventListener("click", function(){
    window.location.href = "/admin/products";
  });
})();
