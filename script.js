// VARNAM BANGLES showcase interactions. Product galleries support multiple images and a zoom lightbox.
const WHATSAPP_NUMBER = "919492300643"; // Business WhatsApp number with country code, without + or spaces.
function whatsappUrl(message) {
  return WHATSAPP_NUMBER ? `https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(message)}` : "";
}
let revealObserver = null;
document.querySelectorAll(".nav-links").forEach(nav => {
  const storyLink = [...nav.querySelectorAll("a")].find(link => link.textContent.trim() === "Our Story");
  if (storyLink) storyLink.href = "story.html";
  if (![...nav.querySelectorAll("a")].some(link => link.textContent.trim() === "Contact")) {
    nav.insertAdjacentHTML("beforeend", '<a href="contact.html">Contact</a>');
  }
});
document.querySelectorAll("footer").forEach(footer => {
  if (footer.querySelector(".footer-links")) return;
  footer.insertAdjacentHTML("beforeend", '<span class="footer-links"><a href="story.html">Our Story</a><a href="contact.html">Contact</a></span>');
});
document.querySelectorAll("[data-whatsapp-message]").forEach(link => {
  const url = whatsappUrl(link.dataset.whatsappMessage);
  if (url) link.href = url;
  else {
    link.removeAttribute("href");
    link.removeAttribute("target");
    link.removeAttribute("rel");
    link.setAttribute("aria-disabled", "true");
    link.classList.add("is-unavailable");
  }
});
const menuToggle = document.querySelector(".menu-toggle");
const navLinks = document.querySelector(".nav-links");
if (menuToggle && navLinks) {
  navLinks.id = navLinks.id || "site-navigation";
  menuToggle.setAttribute("aria-controls", navLinks.id);
  menuToggle.setAttribute("aria-haspopup", "true");
  function setMenuOpen(open) {
    navLinks.classList.toggle("open", open);
    menuToggle.classList.toggle("is-open", open);
    menuToggle.setAttribute("aria-expanded", String(open));
    navLinks.setAttribute("aria-hidden", String(!open && window.matchMedia("(max-width: 620px)").matches));
    menuToggle.textContent = open ? "×" : "☰";
  }
  function closeMenu() { setMenuOpen(false); }
  setMenuOpen(false);
  menuToggle.addEventListener("click", () => setMenuOpen(!navLinks.classList.contains("open")));
  navLinks.addEventListener("click", event => {
    if (event.target.closest("a")) closeMenu();
  });
  document.addEventListener("click", event => {
    if (navLinks.classList.contains("open") && !navLinks.contains(event.target) && !menuToggle.contains(event.target)) closeMenu();
  });
  document.addEventListener("keydown", event => {
    if (event.key === "Escape" && navLinks.classList.contains("open")) {
      closeMenu();
      menuToggle.focus();
    }
  });
  window.addEventListener("resize", () => {
    const mobile = window.matchMedia("(max-width: 620px)").matches;
    if (!mobile) setMenuOpen(false);
    else navLinks.setAttribute("aria-hidden", String(!navLinks.classList.contains("open")));
  }, { passive: true });
}
function readWishlist() {
  try { return JSON.parse(localStorage.getItem("varnamWishlist") || "[]"); } catch { return []; }
}
function writeWishlist(ids) { localStorage.setItem("varnamWishlist", JSON.stringify(ids)); }
function productCard(product, compact = false) {
  const liked = readWishlist().includes(product.id);
  return `<article class="product reveal ${product.bestseller ? "is-bestseller" : ""}">
    <div class="product-photo-wrap">
      <a class="product-photo" href="product.html?id=${encodeURIComponent(product.id)}" aria-label="View ${product.name}" style="background-image:url('${product.image}')"></a>
      ${product.bestseller ? '<span class="bestseller-badge">Bestseller</span>' : ""}
      <button class="wishlist-button ${liked ? "liked" : ""}" data-wishlist="${product.id}" aria-label="${liked ? "Remove from" : "Add to"} wishlist" title="Save favourite">${liked ? "♥" : "♡"}</button>
    </div>
    <p class="product-category">${product.category}</p><h3><a href="product.html?id=${encodeURIComponent(product.id)}">${product.name}</a></h3>
    <p class="price">₹${product.price}</p>
    <a class="button button-small" href="product.html?id=${encodeURIComponent(product.id)}">View details <span>↗</span></a>
  </article>`;
}
function renderWishlistState() {
  document.querySelectorAll("[data-wishlist]").forEach(btn => {
    const liked = readWishlist().includes(btn.dataset.wishlist);
    btn.classList.toggle("liked", liked); btn.textContent = liked ? "♥" : "♡";
    btn.setAttribute("aria-label", liked ? "Remove from wishlist" : "Add to wishlist");
  });
}
document.addEventListener("click", event => {
  const button = event.target.closest("[data-wishlist]");
  if (!button) return;
  const id = button.dataset.wishlist; let ids = readWishlist();
  ids = ids.includes(id) ? ids.filter(value => value !== id) : [...ids, id];
  writeWishlist(ids); renderWishlistState();
  button.classList.add("heart-pop"); setTimeout(() => button.classList.remove("heart-pop"), 300);
});
const featuredProducts = document.querySelector("#featuredProducts");
if (featuredProducts) {
  const popular = [...PRODUCTS].sort((a,b) => Number(b.bestseller) - Number(a.bestseller));
  featuredProducts.innerHTML = popular.slice(0,4).map(p => productCard(p)).join("");
}
const catalogProducts = document.querySelector("#catalogProducts");
if (catalogProducts) {
  const params = new URLSearchParams(location.search);
  const category = params.get("category") || "All";
  const title = document.querySelector("#categoryTitle");
  if (title) title.textContent = category === "All" ? "Our Collections" : `${category} Bangles`;
  const desc = document.querySelector("#categoryDescription");
  if (desc) desc.textContent = category === "All" ? "Explore designs for every mood and occasion." : `Discover our ${category.toLowerCase()} bangle designs.`;
  document.querySelectorAll("#categoryTabs a").forEach(a => {
    const value = new URL(a.href).searchParams.get("category") || "All";
    if (value.toLowerCase() === category.toLowerCase()) a.classList.add("selected");
  });
  const search = document.querySelector("#productSearch");
  const colour = document.querySelector("#colourFilter");
  const sort = document.querySelector("#sortProducts");
  const bestOnly = document.querySelector("#bestsellerOnly");
  function renderCatalog() {
    const term = (search?.value || "").trim().toLowerCase();
    const selectedColour = colour?.value || "";
    let filtered = PRODUCTS.filter(p => (category === "All" || p.category.toLowerCase() === category.toLowerCase())
      && (!term || `${p.name} ${p.category} ${p.colour} ${p.material}`.toLowerCase().includes(term))
      && (!selectedColour || p.colour === selectedColour)
      && (!bestOnly?.checked || p.bestseller));
    if (sort?.value === "price-low") filtered.sort((a,b) => a.price - b.price);
    if (sort?.value === "price-high") filtered.sort((a,b) => b.price - a.price);
    if (sort?.value === "name") filtered.sort((a,b) => a.name.localeCompare(b.name));
    if (sort?.value === "featured") filtered.sort((a,b) => Number(b.bestseller) - Number(a.bestseller));
    catalogProducts.innerHTML = filtered.map(p => productCard(p)).join("");
    const empty = document.querySelector("#emptyMessage");
    if (empty) { empty.hidden = filtered.length > 0; empty.textContent = "No products match your search. Try another keyword or filter."; }
    observeReveals(); renderWishlistState();
  }
  [search, colour, sort, bestOnly].forEach(el => el?.addEventListener(el === search ? "input" : "change", renderCatalog));
  renderCatalog();
}
const detailPhoto = document.querySelector("#detailPhoto");
if (detailPhoto) {
  const id = new URLSearchParams(location.search).get("id");
  const product = PRODUCTS.find(p => p.id === id) || PRODUCTS[0];
  document.title = `${product.name} | Varnam Bangles`;
  document.querySelector("#crumbProduct").textContent = product.name;
  document.querySelector("#detailCategory").textContent = product.category.toUpperCase() + " COLLECTION";
  document.querySelector("#detailName").textContent = product.name;
  document.querySelector("#detailPrice").textContent = `₹${product.price}`;
  document.querySelector("#detailDescription").textContent = product.description;
  document.querySelector("#detailCategoryValue").textContent = product.category;
  document.querySelector("#detailColour").textContent = product.colour || "Please enquire";
  document.querySelector("#detailMaterial").textContent = product.material || "Please enquire";
  // Product data can provide images: ["photo-1.jpg", "photo-2.jpg", ...].
  // Until real product photos are available, the gallery falls back to the sample hero image.
  const galleryImages = Array.isArray(product.images) && product.images.length
    ? product.images
    : [product.image];
  const galleryThumbnails = document.querySelector("#galleryThumbnails");
  const galleryCounter = document.querySelector("#galleryCounter");
  const galleryCaption = document.querySelector("#galleryCaption");
  const lightbox = document.querySelector("#imageLightbox");
  const lightboxImage = document.querySelector("#lightboxImage");
  const lightboxCaption = document.querySelector("#lightboxCaption");
  const lightboxCount = document.querySelector("#lightboxCount");
  let activeGalleryIndex = 0;
  let previousFocus = null;

  function renderGallery() {
    const image = galleryImages[activeGalleryIndex];
    detailPhoto.style.backgroundImage = `url("${image}")`;
    detailPhoto.dataset.image = image;
    detailPhoto.setAttribute("aria-label", `Enlarge ${product.name}, image ${activeGalleryIndex + 1} of ${galleryImages.length}`);
    galleryCounter.textContent = `${activeGalleryIndex + 1} / ${galleryImages.length}`;
    galleryCaption.textContent = galleryImages.length > 1
      ? `View ${activeGalleryIndex + 1} of ${galleryImages.length} · A closer look at the details`
      : "A closer look at the details";
    galleryThumbnails.innerHTML = galleryImages.length > 1
      ? galleryImages.map((src, index) => `
          <button class="gallery-thumbnail ${index === activeGalleryIndex ? "is-active" : ""}"
            type="button" data-gallery-index="${index}"
            aria-label="View image ${index + 1}" aria-pressed="${index === activeGalleryIndex}"
            style="background-image:url(&quot;${src}&quot;)"></button>`).join("")
      : "";
    galleryThumbnails.hidden = galleryImages.length < 2;
    document.querySelector("#lightboxPrev").hidden = galleryImages.length < 2;
    document.querySelector("#lightboxNext").hidden = galleryImages.length < 2;
    lightboxImage.src = image;
    lightboxImage.alt = `${product.name} — image ${activeGalleryIndex + 1}`;
    lightboxCaption.textContent = product.name;
    lightboxCount.textContent = `${activeGalleryIndex + 1} / ${galleryImages.length}`;
  }

  function changeGalleryImage(index) {
    activeGalleryIndex = (index + galleryImages.length) % galleryImages.length;
    renderGallery();
  }

  function openLightbox() {
    previousFocus = document.activeElement;
    renderGallery();
    lightbox.classList.add("is-open");
    lightbox.setAttribute("aria-hidden", "false");
    document.body.classList.add("lightbox-open");
    document.querySelector("#lightboxClose").focus();
  }

  function closeLightbox() {
    lightbox.classList.remove("is-open");
    lightbox.setAttribute("aria-hidden", "true");
    document.body.classList.remove("lightbox-open");
    if (previousFocus) previousFocus.focus();
  }

  detailPhoto.addEventListener("click", openLightbox);
  galleryThumbnails.addEventListener("click", event => {
    const thumbnail = event.target.closest("[data-gallery-index]");
    if (thumbnail) changeGalleryImage(Number(thumbnail.dataset.galleryIndex));
  });
  document.querySelector("#lightboxClose").addEventListener("click", closeLightbox);
  document.querySelector("#lightboxPrev").addEventListener("click", () => changeGalleryImage(activeGalleryIndex - 1));
  document.querySelector("#lightboxNext").addEventListener("click", () => changeGalleryImage(activeGalleryIndex + 1));
  lightbox.addEventListener("click", event => {
    if (event.target === lightbox && !suppressLightboxClick) closeLightbox();
  });
  document.addEventListener("keydown", event => {
    if (!lightbox.classList.contains("is-open")) return;
    if (event.key === "Escape") closeLightbox();
    if (event.key === "ArrowLeft") changeGalleryImage(activeGalleryIndex - 1);
    if (event.key === "ArrowRight") changeGalleryImage(activeGalleryIndex + 1);
  });
  let detailTouch = null;
  let suppressPhotoClick = false;
  detailPhoto.addEventListener("touchstart", event => {
    if (event.touches.length === 1) {
      detailTouch = {x: event.touches[0].clientX, y: event.touches[0].clientY, horizontal: false};
    }
  }, { passive: true });
  detailPhoto.addEventListener("touchmove", event => {
    if (!detailTouch || event.touches.length !== 1) return;
    const deltaX = event.touches[0].clientX - detailTouch.x;
    const deltaY = event.touches[0].clientY - detailTouch.y;
    if (Math.abs(deltaX) > 10 && Math.abs(deltaX) > Math.abs(deltaY)) {
      detailTouch.horizontal = true;
      event.preventDefault();
    }
  }, { passive: false });
  detailPhoto.addEventListener("touchend", event => {
    if (!detailTouch) return;
    const deltaX = event.changedTouches[0].clientX - detailTouch.x;
    if (detailTouch.horizontal && Math.abs(deltaX) > 45 && galleryImages.length > 1) {
      changeGalleryImage(activeGalleryIndex + (deltaX < 0 ? 1 : -1));
      suppressPhotoClick = true;
      window.setTimeout(() => { suppressPhotoClick = false; }, 350);
    }
    detailTouch = null;
  }, { passive: true });
  detailPhoto.addEventListener("touchcancel", () => { detailTouch = null; }, { passive: true });
  let lightboxTouch = null;
  let suppressLightboxClick = false;
  lightbox.addEventListener("touchstart", event => {
    if (event.touches.length === 1) {
      lightboxTouch = {x: event.touches[0].clientX, y: event.touches[0].clientY, horizontal: false};
    }
  }, { passive: true });
  lightbox.addEventListener("touchmove", event => {
    if (!lightboxTouch || event.touches.length !== 1) return;
    const deltaX = event.touches[0].clientX - lightboxTouch.x;
    const deltaY = event.touches[0].clientY - lightboxTouch.y;
    if (Math.abs(deltaX) > 10 && Math.abs(deltaX) > Math.abs(deltaY)) {
      lightboxTouch.horizontal = true;
      event.preventDefault();
    }
  }, { passive: false });
  lightbox.addEventListener("touchend", event => {
    if (!lightboxTouch) return;
    const deltaX = event.changedTouches[0].clientX - lightboxTouch.x;
    if (lightboxTouch.horizontal && Math.abs(deltaX) > 45 && galleryImages.length > 1) {
      changeGalleryImage(activeGalleryIndex + (deltaX < 0 ? 1 : -1));
      suppressLightboxClick = true;
      window.setTimeout(() => { suppressLightboxClick = false; }, 350);
    }
    lightboxTouch = null;
  }, { passive: true });
  lightbox.addEventListener("touchcancel", () => { lightboxTouch = null; }, { passive: true });
  detailPhoto.addEventListener("click", event => {
    if (suppressPhotoClick) {
      event.preventDefault();
      event.stopPropagation();
    }
  }, true);
  renderGallery();

  const sizeSelect = document.querySelector("#sizeChoice");
  sizeSelect.innerHTML = (product.sizes || []).map(size => `<option value="${size}">${size}</option>`).join("");
  document.querySelector("#detailBuy").href = product.meeshoUrl;
  const whatsapp = document.querySelector("#detailWhatsApp");
  function updateWhatsAppLink() {
    const size = sizeSelect.value || "not specified";
    const message = `Hi Varnam Bangles, I would like to enquire about ${product.name} (₹${product.price}), size ${size}. Is it available?`;
    const url = whatsappUrl(message);
    if (url) whatsapp.href = url;
    else {
      whatsapp.removeAttribute("href");
      whatsapp.removeAttribute("target");
      whatsapp.removeAttribute("rel");
      whatsapp.setAttribute("aria-disabled", "true");
      whatsapp.classList.add("is-unavailable");
    }
  }
  sizeSelect.addEventListener("change", updateWhatsAppLink); updateWhatsAppLink();
  const related = PRODUCTS.filter(p => p.id !== product.id).sort((a,b) => Number(b.bestseller)-Number(a.bestseller)).slice(0,3);
  document.querySelector("#relatedProducts").innerHTML = related.map(p => productCard(p, true)).join("");
  observeReveals(); renderWishlistState();
}
function observeReveals() {
  const items = document.querySelectorAll(".reveal:not(.revealed)");
  if (!items.length) return;
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches || !("IntersectionObserver" in window)) {
    items.forEach(item => item.classList.add("revealed"));
    return;
  }
  if (!revealObserver) {
    revealObserver = new IntersectionObserver(entries => entries.forEach(entry => {
      if (entry.isIntersecting) {
        entry.target.classList.add("revealed");
        revealObserver.unobserve(entry.target);
      }
    }), {threshold: 0.08, rootMargin: "0px 0px -4%"});
  }
  items.forEach(item => revealObserver.observe(item));
}
observeReveals();
