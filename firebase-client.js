import { PRODUCTS as legacyProducts } from './products.js';

// Normalise any product source into the shape the storefront expects.
function normalizeProduct(product) {
  const images = Array.isArray(product.images) && product.images.length
    ? product.images
    : [product.image].filter(Boolean);
  return {
    ...product,
    id: product.id,
    slug: product.slug || product.id,
    name: product.name,
    description: product.description || '',
    price: Number(product.price) || 0,
    originalPrice: product.originalPrice || null,
    images,
    image: images[0] || product.image || '',
    category: product.category || 'Other',
    material: product.material || '',
    sizes: Array.isArray(product.sizes) ? product.sizes : [],
    colour: product.colour || '',
    colours: Array.isArray(product.colours) ? product.colours : (product.colour ? [product.colour] : []),
    stockStatus: product.stockStatus || (product.available === false ? 'out_of_stock' : 'in_stock'),
    available: product.available !== false,
    published: product.published !== false,
    featured: Boolean(product.featured || product.bestseller),
    bestseller: Boolean(product.bestseller),
    meeshoUrl: product.meeshoUrl || null,
    createdAt: product.createdAt,
    updatedAt: product.updatedAt,
  };
}

// Order of data sources: same-origin admin API, then the public JSON file,
// then the legacy in-memory catalogue. The storefront always has data.
async function fetchJson(url) {
  const res = await fetch(url, { cache: 'no-store' });
  if (!res.ok) {throw new Error(`HTTP ${res.status}`);}
  return res.json();
}

export async function loadProducts() {
  // 1) Same-origin API (server-backed, GitHub source of truth).
  try {
    const data = await fetchJson('/api/products');
    if (Array.isArray(data.products) && data.products.length) {
      return data.products.map(normalizeProduct).filter(p => p.published && p.available);
    }
  } catch (err) {
    console.warn('[varnam] /api/products unavailable.', err.message);
  }
  // 2) Public JSON file (works on static hosting without the server).
  try {
    const data = await fetchJson('/data/products.json');
    const products = Array.isArray(data.products) ? data.products : Array.isArray(data) ? data : [];
    if (products.length) {return products.map(normalizeProduct).filter(p => p.published && p.available);}
  } catch (err) {
    console.warn('[varnam] /data/products.json unavailable.', err.message);
  }
  // 3) Legacy in-memory catalogue.
  return legacyProducts.map(normalizeProduct).filter(p => p.published && p.available);
}

// Kept for backwards compatibility with the legacy Firebase admin files.
export function isFirebaseConfigured() { return false; }
export function getFirebaseAuth() { return null; }
export const onAuthStateChanged = null;
export const signInWithEmailAndPassword = null;
export const signOut = null;
export const collection = null;
export const deleteDoc = null;
export const doc = null;
export const getDocs = null;
export const query = null;
export const setDoc = null;
export const storage = null;
export const ref = null;
export const uploadBytes = null;
export const getDownloadURL = null;
export const deleteObject = null;
export const db = null;

export { normalizeProduct };
