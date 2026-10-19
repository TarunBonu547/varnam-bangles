(function () {
  var toggle = document.querySelector('.mobile-menu-toggle');
  var closeBtn = document.querySelector('.mobile-menu-close');
  var sidebar = document.querySelector('.admin-sidebar');
  var overlay = document.getElementById('adminOverlay');
  var links = sidebar ? sidebar.querySelectorAll('nav a') : [];
  var expanded = false;
  function setOpen(open) {
    expanded = open;
    if (sidebar) { sidebar.classList.toggle('open', open); }
    if (overlay) { overlay.classList.toggle('open', open); }
    if (toggle) {
      toggle.setAttribute('aria-expanded', String(open));
      toggle.setAttribute('aria-label', open ? 'Close navigation' : 'Open navigation');
    }
  }
  if (toggle) { toggle.addEventListener('click', function () { setOpen(!expanded); }); }
  if (closeBtn) { closeBtn.addEventListener('click', function () { setOpen(false); }); }
  if (overlay) { overlay.addEventListener('click', function () { setOpen(false); }); }
  links.forEach(function (link) {
    link.addEventListener('click', function () { setOpen(false); });
  });
  document.addEventListener('keydown', function (event) {
    if (event.key === 'Escape' && expanded) { setOpen(false); }
  });
})();
