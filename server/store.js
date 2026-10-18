'use strict';

import { readFileSync } from 'node:fs';
import { getFileJson, setFileJson, deleteFileJson, githubConfigured } from './github.js';
import { PRODUCTS as legacyProducts } from '../products.js';

const PRODUCTS_PATH = 'data/products.json';
const CATEGORIES_PATH = 'data/categories.json';

const legacyCategories = JSON.parse(
  readFileSync(new URL('../data/categories.json', import.meta.url), 'utf8')
).categories;

// Short-lived read cache so the public storefront doesn't hit GitHub on every
// page load. Writes invalidate it immediately.
const cache = new Map();

function cacheKey(path) { return path; }

function getCached(path) {
  const entry = cache.get(cacheKey(path));
  if (!entry) {return null;}
  const ttlMs = Number(process.env.DATA_CACHE_TTL_MS || 60000);
  if (Date.now() - entry.fetchedAt > ttlMs) {return null;}
  return entry.data;
}

function setCached(path, data) {
  cache.set(cacheKey(path), { data, fetchedAt: Date.now() });
}

function invalidate(path) {
  cache.delete(cacheKey(path));
}

// Legacy fallback kept so the storefront never shows an empty catalogue when
// GitHub is unreachable or unconfigured.
export async function loadProducts() {
  if (!githubConfigured()) {
    return { products: legacyProducts.map(normalizeLegacy), source: 'legacy', sha: null };
  }
  const cached = getCached(PRODUCTS_PATH);
  if (cached) {return { ...cached, source: 'cache' };}
  try {
    const { content, sha } = await getFileJson(PRODUCTS_PATH);
    const data = JSON.parse(content);
    setCached(PRODUCTS_PATH, data);
    return { ...data, sha, source: 'github' };
  } catch (err) {
    console.warn('[varnam] Failed to read products from GitHub; using legacy catalogue.', err.message);
    return { products: legacyProducts.map(normalizeLegacy), source: 'legacy', sha: null };
  }
}

export async function saveProducts(products, message) {
  if (!githubConfigured()) {throw new Error('GitHub is not configured on the server.');}
  const payload = { version: 1, updatedAt: new Date().toISOString(), products };
  await setFileJson(PRODUCTS_PATH, payload, message);
  invalidate(PRODUCTS_PATH);
  return { ok: true };
}

export async function loadCategories() {
  if (!githubConfigured()) {
    return { categories: legacyCategories, source: 'legacy' };
  }
  const cached = getCached(CATEGORIES_PATH);
  if (cached) {return { ...cached, source: 'cache' };}
  try {
    const { content, sha } = await getFileJson(CATEGORIES_PATH);
    const data = JSON.parse(content);
    setCached(CATEGORIES_PATH, data);
    return { ...data, sha, source: 'github' };
  } catch (err) {
    console.warn('[varnam] Failed to read categories from GitHub; using legacy list.', err.message);
    return { categories: legacyCategories, source: 'legacy' };
  }
}

export async function saveCategories(categories, message) {
  if (!githubConfigured()) {throw new Error('GitHub is not configured on the server.');}
  const payload = { version: 1, updatedAt: new Date().toISOString(), categories };
  await setFileJson(CATEGORIES_PATH, payload, message);
  invalidate(CATEGORIES_PATH);
  return { ok: true };
}

export async function deleteProductFile(message) {
  if (!githubConfigured()) {throw new Error('GitHub is not configured on the server.');}
  await deleteFileJson(PRODUCTS_PATH, message);
  invalidate(PRODUCTS_PATH);
  return { ok: true };
}

function normalizeLegacy(p) {
  return {
    id: p.id,
    slug: p.slug || p.id,
    name: p.name,
    description: p.description || '',
    price: Number(p.price) || 0,
    originalPrice: p.originalPrice || null,
    images: Array.isArray(p.images) && p.images.length ? p.images : [p.image].filter(Boolean),
    image: p.image || '',
    category: p.category || 'Other',
    material: p.material || '',
    sizes: Array.isArray(p.sizes) ? p.sizes : [],
    colour: p.colour || '',
    colours: p.colour ? [p.colour] : [],
    stockStatus: p.available === false ? 'out_of_stock' : 'in_stock',
    available: p.available !== false,
    published: p.published !== false,
    featured: Boolean(p.bestseller || p.featured),
    bestseller: Boolean(p.bestseller),
    meeshoUrl: p.meeshoUrl || null,
    createdAt: p.createdAt || new Date().toISOString(),
    updatedAt: p.updatedAt || new Date().toISOString(),
  };
}
