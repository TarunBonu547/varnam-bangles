(function(){
  function cookie(name){
    const m = document.cookie.match(new RegExp("(?:^|; )"+name+"=([^;]*)"));
    return m ? decodeURIComponent(m[1]) : "";
  }
  function showToast(msg){
    var t = document.createElement("div");
    t.textContent = msg; t.style.position="fixed"; t.style.top="12px"; t.style.right="12px";
    t.style.background="var(--wine)"; t.style.color="#fff"; t.style.padding="10px 16px"; t.style.borderRadius="3px";
    t.style.zIndex="100"; t.style.fontSize="12px"; document.body.appendChild(t);
    setTimeout(function(){ t.remove(); }, 3000);
  }
  async function del(key){
    if(!confirm("Delete this category? Products using it will still keep their category value.")) return;
    const res = await fetch("/api/categories/"+encodeURIComponent(key), {
      method:"DELETE", headers:{"X-XSRF-TOKEN": cookie("XSRF-TOKEN")}, credentials:"same-origin"
    });
    if(res.ok){ document.getElementById("cat-row-"+key).remove(); showToast("Category deleted."); }
    else { const d=await res.json().catch(()=>({})); alert(d.message||"Could not delete category."); }
  }
  window.editCat = function(key, label){
    document.getElementById("editWrap").style.display = "";
    var f = document.getElementById("editCatForm");
    f.elements["key"].value = key;
    f.elements["label"].value = label;
    window.scrollTo({top:0, behavior:"smooth"});
  };
  window.closeEdit = function(){ document.getElementById("editWrap").style.display = "none"; };
  document.getElementById("editCatForm").addEventListener("submit", async function(e){
    e.preventDefault();
    var f = e.target, fd = new FormData(f);
    const key = fd.get("key"), label = fd.get("label");
    const res = await fetch("/api/categories/"+encodeURIComponent(key), {
      method:"PUT", headers:{"Content-Type":"application/json","X-XSRF-TOKEN": cookie("XSRF-TOKEN")}, body:JSON.stringify({key,label}), credentials:"same-origin"
    });
    if(res.ok){ closeEdit(); location.reload(); }
    else { const d=await res.json().catch(()=>({})); alert(d.message||"Could not update category."); }
  });
  document.getElementById("categoryForm").addEventListener("submit", async function(e){
    e.preventDefault();
    var f = e.target, fd = new FormData(f);
    const res = await fetch("/api/categories", {
      method:"POST", headers:{"Content-Type":"application/json","X-XSRF-TOKEN": cookie("XSRF-TOKEN")}, body:JSON.stringify({key:fd.get("key"),label:fd.get("label")}), credentials:"same-origin"
    });
    if(res.ok){ f.reset(); location.reload(); }
    else { const d=await res.json().catch(()=>({})); alert(d.message||"Could not add category."); }
  });
  document.querySelectorAll('[data-delete]').forEach(function(btn){
    btn.addEventListener("click", function(){ del(btn.dataset.delete); });
  });
  document.querySelectorAll('[data-edit-key]').forEach(function(btn){
    btn.addEventListener("click", function(){
      editCat(btn.dataset.editKey, btn.dataset.editLabel);
    });
  });
  document.getElementById("cancelEditBtn").addEventListener("click", closeEdit);
})();
