(function(){
  const form = document.getElementById("loginForm");
  function show(field, msg){
    const el = document.getElementById(field);
    if(!el) return;
    const old = el.parentElement.querySelector(".field-error");
    if(old) old.remove();
    if(msg){
      el.classList.add("error");
      const d = document.createElement("p"); d.className="field-error"; d.textContent=msg;
      el.parentElement.appendChild(d);
    } else el.classList.remove("error");
  }
  function cookie(name){
    const m = document.cookie.match(new RegExp("(?:^|; )"+name+"=([^;]*)"));
    return m ? decodeURIComponent(m[1]) : "";
  }
  form.addEventListener("submit", async (e)=>{
    e.preventDefault();
    show("loginEmail",""); show("loginPassword","");
    const fd = new FormData(form);
    const body = Object.fromEntries(fd);
    try{
      const res = await fetch("/admin/login", {
        method:"POST", headers:{"Content-Type":"application/json","X-XSRF-TOKEN": cookie("XSRF-TOKEN")}, body:JSON.stringify(body),
        credentials:"same-origin",
      });
      const data = await res.json().catch(()=>({}));
      if(res.ok){ window.location.href = "/admin"; return; }
      if(data.fields){
        data.fields.forEach(f=>show(f.field, f.message));
      } else {
        show("loginPassword", data.message || "Sign in failed. Try again.");
      }
    }catch(err){
      show("loginPassword", "Unable to reach the server. Try again.");
    }
  });
})();
