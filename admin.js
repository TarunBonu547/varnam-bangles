import { ADMIN_EMAILS } from './firebase-config.js';
import {
  collection, db, deleteDoc, deleteObject, doc, getDownloadURL, getDocs, getFirebaseAuth, isFirebaseConfigured,
  onAuthStateChanged, ref, setDoc, signInWithEmailAndPassword, signOut, storage, uploadBytes
} from './firebase-client.js';
import { PRODUCTS as legacyProducts } from './products.js';

const form = document.querySelector('#productForm');
const productList = document.querySelector('#adminProductList');
const message = document.querySelector('#adminMessage');
const imageInput = document.querySelector('#productImages');
const imagePreview = document.querySelector('#imagePreview');
const selectedFiles = [];
const removedImageUrls = new Set();
let editingProduct = null;
let currentUser = null;

function showMessage(text, type = 'info') {
  message.textContent = text;
  message.className = `admin-message ${type}`;
  message.hidden = !text;
}
function isAdmin(user) { return user && ADMIN_EMAILS.map(email => email.toLowerCase()).includes(user.email.toLowerCase()); }
function imageRecords(product) { return Array.isArray(product?.imageRecords) ? product.imageRecords : (product?.images || []).map(url => ({ url })); }
function resetForm() {
  form.reset(); editingProduct = null; selectedFiles.length = 0; removedImageUrls.clear(); imagePreview.innerHTML = ''; document.querySelector('#productId').readOnly = false;
  document.querySelector('#formTitle').textContent = 'Add a product';
  document.querySelector('#cancelEdit').hidden = true;
}
function renderPreviews(existing = []) {
  imagePreview.innerHTML = [...existing.filter(image => !removedImageUrls.has(image.url)).map(image => `<figure data-existing-url="${image.url}"><img src="${image.url}" alt=""><button type="button" data-remove-existing="${image.url}" aria-label="Remove image">×</button></figure>`), ...selectedFiles.map((file, index) => `<figure><img src="${URL.createObjectURL(file)}" alt=""><button type="button" data-remove-file="${index}" aria-label="Remove image">×</button></figure>`)].join('');
}
function productFromForm() {
  return {
    id: document.querySelector('#productId').value.trim(), name: document.querySelector('#productName').value.trim(),
    description: document.querySelector('#productDescription').value.trim(), price: Number(document.querySelector('#productPrice').value),
    category: document.querySelector('#productCategory').value, colour: document.querySelector('#productColour').value.trim(),
    material: document.querySelector('#productMaterial').value.trim(), sizes: document.querySelector('#productSizes').value.split(',').map(value => value.trim()).filter(Boolean),
    meeshoUrl: document.querySelector('#productMeesho').value.trim(), bestseller: document.querySelector('#productFeatured').checked,
    available: document.querySelector('#productAvailable').checked, published: true
  };
}
function fillForm(product) {
  editingProduct = product; selectedFiles.length = 0; removedImageUrls.clear(); document.querySelector('#productId').readOnly = true; document.querySelector('#formTitle').textContent = 'Edit product'; document.querySelector('#cancelEdit').hidden = false;
  for (const [selector, value] of [['#productId', product.id], ['#productName', product.name], ['#productDescription', product.description], ['#productPrice', product.price], ['#productCategory', product.category], ['#productColour', product.colour], ['#productMaterial', product.material], ['#productSizes', (product.sizes || []).join(', ')], ['#productMeesho', product.meeshoUrl]]) {document.querySelector(selector).value = value || '';}
  document.querySelector('#productFeatured').checked = Boolean(product.bestseller); document.querySelector('#productAvailable').checked = product.available !== false;
  renderPreviews(imageRecords(product)); window.scrollTo({ top: 0, behavior: 'smooth' });
}
async function renderProducts() {
  const snapshot = await getDocs(collection(db, 'products'));
  const term = document.querySelector('#adminSearch').value.trim().toLowerCase(); const filter = document.querySelector('#adminFilter').value;
  const products = snapshot.docs.map(item => ({ id: item.id, ...item.data() })).filter(product => (!term || `${product.name} ${product.category} ${product.material || ''}`.toLowerCase().includes(term)) && (!filter || (filter === 'available' && product.available !== false) || (filter === 'unavailable' && product.available === false) || (filter === 'featured' && product.bestseller === true)));
  productList.innerHTML = products.length ? products.map(product => `<article class="admin-product-row"><img src="${(imageRecords(product)[0] || {}).url || ''}" alt=""><div><strong>${product.name}</strong><span>${product.category} · ₹${product.price} · ${product.available === false ? 'Unavailable' : 'Available'}</span></div><button class="button button-small" data-edit-id="${product.id}">Edit</button><button class="button admin-danger" data-delete-id="${product.id}">Delete</button></article>`).join('') : '<p class="admin-empty">No Firestore products yet. Import the existing catalogue below.</p>';
}
async function uploadImages(productId, files) {
  return Promise.all(files.map(async file => { const path = `products/${productId}/${crypto.randomUUID()}-${file.name}`; const storageRef = ref(storage, path); await uploadBytes(storageRef, file, { contentType: file.type }); return { url: await getDownloadURL(storageRef), path, name: file.name }; }));
}
async function saveProduct(event) {
  event.preventDefault();
  const product = productFromForm();
  if (!product.id || !product.name || !product.price) {return showMessage('Name, ID and price are required.', 'error');}
  try {
    const oldImages = imageRecords(editingProduct); const keptImages = [...imagePreview.querySelectorAll('[data-existing-url]')].map(item => oldImages.find(image => image.url === item.dataset.existingUrl)).filter(Boolean);
    const newImages = await uploadImages(product.id, selectedFiles); const imageRecordsToSave = [...keptImages, ...newImages];
    product.imageRecords = imageRecordsToSave; product.images = imageRecordsToSave.map(image => image.url); product.image = product.images[0] || '';
    await setDoc(doc(db, 'products', product.id), product);
    for (const image of oldImages.filter(image => image.path && !imageRecordsToSave.some(saved => saved.path === image.path))) {await deleteObject(ref(storage, image.path)).catch(() => {});}
    showMessage('Product saved successfully.', 'success'); resetForm(); await renderProducts();
  } catch (error) { console.error(error); showMessage(error.message || 'Could not save the product.', 'error'); }
}
async function importLegacy() {
  if (!confirm('Import only products whose IDs do not already exist in Firestore?')) {return;}
  const snapshot = await getDocs(collection(db, 'products')); const existing = new Set(snapshot.docs.map(item => item.id));
  await Promise.all(legacyProducts.filter(product => !existing.has(product.id)).map(product => setDoc(doc(db, 'products', product.id), { ...product, published: true, available: true, imageRecords: (product.images || [product.image]).map(url => ({ url })) })));
  showMessage('Legacy catalogue imported without overwriting existing products.', 'success'); await renderProducts();
}
function setupApp() {
  if (!isFirebaseConfigured()) {return showMessage('Add your Firebase values in firebase-config.js before using the admin panel.', 'error');}
  onAuthStateChanged(getFirebaseAuth(), async user => { currentUser = user; document.querySelector('#loginPanel').hidden = isAdmin(user); document.querySelector('#dashboardPanel').hidden = !isAdmin(user); if (isAdmin(user)) { document.querySelector('#adminEmail').textContent = user.email; await renderProducts(); } else if (user) { await signOut(getFirebaseAuth()); showMessage('This account is not authorized for administration.', 'error'); } });
}
document.querySelector('#loginForm').addEventListener('submit', async event => { event.preventDefault(); try { await signInWithEmailAndPassword(getFirebaseAuth(), document.querySelector('#loginEmail').value.trim(), document.querySelector('#loginPassword').value); } catch { showMessage('Sign-in failed. Check the email and password.', 'error'); } });
document.querySelector('#signOut').addEventListener('click', () => signOut(getFirebaseAuth()));
form.addEventListener('submit', saveProduct); document.querySelector('#cancelEdit').addEventListener('click', resetForm); document.querySelector('#importLegacy').addEventListener('click', importLegacy);
imageInput.addEventListener('change', event => { selectedFiles.push(...event.target.files); event.target.value = ''; renderPreviews(imageRecords(editingProduct)); });
imagePreview.addEventListener('click', event => { const existing = event.target.closest('[data-remove-existing]'); const file = event.target.closest('[data-remove-file]'); if (existing) { removedImageUrls.add(existing.dataset.removeExisting); existing.remove(); } if (file) { selectedFiles.splice(Number(file.dataset.removeFile), 1); file.closest('figure').remove(); } });
productList.addEventListener('click', async event => { const edit = event.target.closest('[data-edit-id]'); const remove = event.target.closest('[data-delete-id]'); if (edit) { const snapshot = await getDocs(collection(db, 'products')); const item = snapshot.docs.find(docItem => docItem.id === edit.dataset.editId); if (item) {fillForm({ id: item.id, ...item.data() });} } if (remove && confirm('Delete this product and its uploaded images?')) { const snapshot = await getDocs(collection(db, 'products')); const item = snapshot.docs.find(docItem => docItem.id === remove.dataset.deleteId); if (item) { for (const image of imageRecords(item)) {if (image.path) {await deleteObject(ref(storage, image.path)).catch(() => {});}} await deleteDoc(doc(db, 'products', remove.dataset.deleteId)); showMessage('Product deleted.', 'success'); await renderProducts(); } } });
document.querySelector('#adminSearch').addEventListener('input', renderProducts); document.querySelector('#adminFilter').addEventListener('change', renderProducts);
setupApp();