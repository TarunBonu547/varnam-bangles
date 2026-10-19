(function(){
  var MAX_IMAGE_BYTES = 1024 * 1024;
  var ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp"];

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
  function generateIdFromName(name){
    return String(name || "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');
  }

  // ----- Image upload -----
  var uploadInput = document.getElementById("imageUpload");
  var previewsBox = document.getElementById("imagePreviews");
  var pending = []; // { file, dataUrl }

  function renderPreviews(){
    if(!previewsBox) return;
    previewsBox.innerHTML = "";
    pending.forEach(function(item, index){
      var wrap = document.createElement("div");
      wrap.className = "image-preview";

      var img = document.createElement("img");
      img.src = item.dataUrl;
      img.alt = item.file.name;
      wrap.appendChild(img);

      var remove = document.createElement("button");
      remove.type = "button";
      remove.className = "remove";
      remove.setAttribute("aria-label", "Remove " + item.file.name);
      remove.textContent = "×";
      remove.addEventListener("click", function(){
        pending.splice(index, 1);
        renderPreviews();
      });
      wrap.appendChild(remove);

      var tag = document.createElement("span");
      tag.className = "primary" + (index === 0 ? " active" : "");
      tag.textContent = index === 0 ? "Cover" : "Make cover";
      if(index !== 0){
        tag.style.cursor = "pointer";
        tag.addEventListener("click", function(){
          var moved = pending.splice(index, 1)[0];
          pending.unshift(moved);
          renderPreviews();
        });
      }
      wrap.appendChild(tag);

      previewsBox.appendChild(wrap);
    });
  }

  if(uploadInput){
    uploadInput.addEventListener("change", function(){
      var files = Array.prototype.slice.call(uploadInput.files || []);
      var rejected = 0;
      files.forEach(function(file){
        if(ALLOWED_TYPES.indexOf(file.type) === -1){
          rejected++;
          return;
        }
        if(file.size > MAX_IMAGE_BYTES){
          rejected++;
          return;
        }
        var reader = new FileReader();
        reader.onload = function(e){
          pending.push({ file: file, dataUrl: e.target.result });
          renderPreviews();
        };
        reader.onerror = function(){
          rejected++;
        };
        reader.readAsDataURL(file);
      });
      uploadInput.value = "";
      if(rejected > 0){
        showToast(rejected + " file(s) skipped. Use JPEG, PNG or WebP under 1 MB.");
      }
    });
  }

  // Upload pending images to the server and return their public URLs.
  async function uploadPendingImages(productId){
    if(!pending.length) return [];
    var res = await fetch("/api/upload", {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-XSRF-TOKEN": cookie("XSRF-TOKEN") },
      credentials: "same-origin",
      body: JSON.stringify({
        productId: productId,
        files: pending.map(function(u){
          return {
            name: u.file.name,
            type: u.file.type,
            size: u.file.size,
            data: String(u.dataUrl).split(",")[1] || ""
          };
        })
      })
    });
    var data = await res.json().catch(function(){ return {}; });
    if(!res.ok){
      var err = new Error(data.message || "Image upload failed.");
      err.status = res.status;
      throw err;
    }
    return data.urls || [];
  }

  document.getElementById("productForm").addEventListener("submit", async function(e){
    e.preventDefault();
    var form = e.target;
    var fd = new FormData(form);
    var id = fd.get("id") || "";
    if (!id) { id = generateIdFromName(fd.get("name")); }

    var images = listValue("images");
    var btn = form.querySelector('button[type="submit"]');
    var orig = btn.textContent;

    if(pending.length){
      btn.textContent = "Uploading images…"; btn.disabled = true;
      try{
        var uploaded = await uploadPendingImages(id);
        images = images.concat(uploaded);
      }catch(err){
        showToast(err.message || "Image upload failed. The product was not saved.");
        btn.textContent = orig; btn.disabled = false;
        return;
      }
    }

    var body = {
      id: id,
      name: fd.get("name"),
      slug: fd.get("slug") || undefined,
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
      images: images,
      colours: listValue("colours")||[],
      sizes: listValue("sizes")||[]
    };
    var action = form.getAttribute("action");
    var method = form.getAttribute("method")||"POST";
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
