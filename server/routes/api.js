'use strict';

import express from 'express';
import { body, param, validationResult } from 'express-validator';
import {
  loadProducts,
  saveProducts,
  loadCategories,
  saveCategories,
} from '../store.js';
import {
  isConfigured,
  requireAuth,
  csrfGuard,
  loginRateLimit,
  writeRateLimit,
  issueCsrfToken,
  verifyPassword,
  getSessionName,
} from '../auth.js';
import { uploadFile } from '../github.js';

const router = express.Router();

// JSON bodies are parsed by the app-level middleware in server/index.js.
router.use(express.urlencoded({ extended: true }));

function handleValidation(req, res, next) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      error: 'validation_failed',
      message: 'Please correct the form errors.',
      fields: errors.array().map((e) => ({ field: e.path, message: e.msg })),
    });
  }
  return next();
}

// Strip HTML from user-supplied text fields to avoid stored XSS.
function sanitizeText(value) {
  if (value === null || value === undefined) {return '';}
  return String(value).replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim();
}

function sanitizeProduct(input) {
  const images = Array.isArray(input.images)
    ? input.images.filter((u) => typeof u === 'string' && u.trim())
    : input.image ? [input.image] : [];
  return {
    id: sanitizeText(input.id),
    slug: sanitizeText(input.slug) || sanitizeText(input.id),
    name: sanitizeText(input.name),
    description: sanitizeText(input.description),
    price: Number(input.price) || 0,
    originalPrice:
      input.originalPrice === null || input.originalPrice === undefined || input.originalPrice === ''
        ? null
        : Number(input.originalPrice) || null,
    images,
    image: images[0] || '',
    category: sanitizeText(input.category) || 'Other',
    material: sanitizeText(input.material),
    sizes: Array.isArray(input.sizes)
      ? input.sizes.filter((s) => typeof s === 'string' && s.trim())
      : [],
    colour: sanitizeText(input.colour),
    colours: Array.isArray(input.colours)
      ? input.colours.filter((c) => typeof c === 'string' && c.trim())
    : input.colour
      ? [sanitizeText(input.colour)]
      : [],
    stockStatus: input.stockStatus === 'out_of_stock' ? 'out_of_stock' : 'in_stock',
    available: input.available !== false,
    published: input.published !== false,
    featured: input.featured === true,
    bestseller: input.bestseller === true,
    meeshoUrl:
      input.meeshoUrl === null || input.meeshoUrl === undefined || input.meeshoUrl === ''
        ? null
        : sanitizeText(input.meeshoUrl),
  };
}

// ----- public read routes -----

router.get('/api/products', async (req, res) => {
  try {
    const { products = [], sha, source } = await loadProducts();
    const published = req.query.published !== 'false';
    const list = published
      ? products.filter((p) => p.published !== false && p.available !== false)
      : products;
    res.json({ products: list, source, sha, count: list.length });
  } catch {
    res.status(502).json({ error: 'upstream', message: 'Unable to load products right now.' });
  }
});

router.get('/api/products/:id', async (req, res) => {
  try {
    const { products = [] } = await loadProducts();
    const product = products.find((p) => p.id === req.params.id);
    if (!product) {return res.status(404).json({ error: 'not_found', message: 'Product not found.' });}
    res.json({ product });
  } catch {
    res.status(502).json({ error: 'upstream', message: 'Unable to load the product right now.' });
  }
});

router.get('/api/categories', async (req, res) => {
  try {
    const { categories = [], source } = await loadCategories();
    res.json({ categories, source });
  } catch {
    res.status(502).json({ error: 'upstream', message: 'Unable to load categories right now.' });
  }
});

// ----- protected write routes -----

const productValidation = [
  body('id').matches(/^[a-z0-9-]+$/).withMessage('Use lowercase letters, numbers and hyphens only.'),
  body('slug').optional({ checkFalsy: true }).matches(/^[a-z0-9-]+$/).withMessage('Slug must be lowercase, numbers, hyphens.'),
  body('name').notEmpty().withMessage('Name is required.').trim().escape(),
  body('description').notEmpty().withMessage('Description is required.'),
  body('price').isNumeric({ min: 0 }).withMessage('Price must be a number zero or greater.'),
  body('category').notEmpty().withMessage('Category is required.'),
  body('material').optional().trim().escape(),
  body('stockStatus').optional().isIn(['in_stock', 'out_of_stock']),
  body('available').optional().isBoolean(),
  body('published').optional().isBoolean(),
body('featured').optional().isBoolean(),
body('bestseller').optional().isBoolean(),
];

// Image upload validation
const MAX_IMAGE_BYTES = 1024 * 1024; // 1 MB
const ALLOWED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp'];

const uploadValidation = [
  body('productId').matches(/^[a-z0-9-]+$/).withMessage('Product ID is required.'),
  body('files').isArray({ min: 1 }).withMessage('At least one image is required.'),
  body('files.*.name').notEmpty().withMessage('Image filename is required.'),
  body('files.*.type').custom((type) => ALLOWED_IMAGE_TYPES.includes(type)).withMessage('Only JPEG, PNG and WebP images are allowed.'),
  body('files.*.size').isNumeric({ min: 1, max: MAX_IMAGE_BYTES }).withMessage('Image must be between 1 byte and 1 MB.'),
  body('files.*.data').notEmpty().withMessage('Image data is required.'),
];

router.post(
  '/api/upload',
  requireAuth,
  csrfGuard,
  writeRateLimit,
  uploadValidation,
  handleValidation,
  async (req, res) => {
    try {
      const { productId, files } = req.body;
      const uploaded = [];
      for (const file of files) {
        const ext = file.name.split('.').pop().toLowerCase();
        const safeName = file.name.replace(/[^a-z0-9.-]/gi, '_').toLowerCase();
        const path = `data/images/${productId}/${Date.now()}-${safeName}`;
        const message = `Add product image ${safeName} for ${productId} via Varnam admin`;
        const fileUrl = await uploadFile(path, file.data, message);
        uploaded.push({ name: file.name, url: fileUrl, path });
      }
      res.status(201).json({ ok: true, urls: uploaded.map((u) => u.url), files: uploaded });
    } catch (err) {
      res.status(502).json({ error: 'upload_failed', message: err.message || 'Image upload failed.' });
    }
  }
);

router.post(
  '/api/products',
  requireAuth,
  csrfGuard,
  writeRateLimit,
  productValidation,
  handleValidation,
  async (req, res) => {
    try {
      const { products = [] } = await loadProducts();
      const product = sanitizeProduct(req.body);
      if (!product.id) {
        return res.status(400).json({ error: 'validation_failed', fields: [{ field: 'id', message: 'Product ID is required.' }] });
      }
      if (products.some((p) => p.id === product.id)) {
        return res.status(409).json({ error: 'duplicate_id', message: 'A product with this ID already exists.' });
      }
      const now = new Date().toISOString();
      product.createdAt = now;
      product.updatedAt = now;
      const next = [...products, product];
      await saveProducts(next, `Add product ${product.id} via Varnam admin`);
      res.status(201).json({ ok: true, product, message: 'Product created.' });
    } catch (err) {
      res.status(502).json({ error: 'upstream', message: err.message || 'Could not create the product.' });
    }
  }
);

router.put(
  '/api/products/:id',
  requireAuth,
  csrfGuard,
  writeRateLimit,
  param('id').notEmpty(),
  productValidation,
  handleValidation,
  async (req, res) => {
    try {
      const { products = [] } = await loadProducts();
      const index = products.findIndex((p) => p.id === req.params.id);
      if (index === -1) {
        return res.status(404).json({ error: 'not_found', message: 'Product not found.' });
      }
      const product = sanitizeProduct(req.body);
      product.id = req.params.id; // id is immutable
      product.updatedAt = new Date().toISOString();
      if (!product.createdAt) {product.createdAt = product.updatedAt;}
      const next = [...products];
      next[index] = product;
      await saveProducts(next, `Update product ${product.id} via Varnam admin`);
      res.json({ ok: true, product, message: 'Product updated.' });
    } catch (err) {
      res.status(502).json({ error: 'upstream', message: err.message || 'Could not update the product.' });
    }
  }
);

router.delete(
  '/api/products/:id',
  requireAuth,
  csrfGuard,
  writeRateLimit,
  param('id').notEmpty(),
  handleValidation,
  async (req, res) => {
    try {
      const { products = [] } = await loadProducts();
      const index = products.findIndex((p) => p.id === req.params.id);
      if (index === -1) {
        return res.status(404).json({ error: 'not_found', message: 'Product not found.' });
      }
      const removed = products[index];
      const next = products.filter((p) => p.id !== req.params.id);
      await saveProducts(next, `Delete product ${req.params.id} via Varnam admin`);
      res.json({ ok: true, product: removed, message: 'Product deleted.' });
    } catch (err) {
      res.status(502).json({ error: 'upstream', message: err.message || 'Could not delete the product.' });
    }
  }
);

const categoryValidation = [
  body('key').notEmpty().trim().withMessage('Category key is required.'),
  body('label').notEmpty().trim().withMessage('Category label is required.'),
];

router.post(
  '/api/categories',
  requireAuth,
  csrfGuard,
  writeRateLimit,
  categoryValidation,
  handleValidation,
  async (req, res) => {
    try {
      const { categories = [] } = await loadCategories();
      const key = sanitizeText(req.body.key);
      const label = sanitizeText(req.body.label);
      if (categories.some((c) => c.key === key)) {
        return res.status(409).json({ error: 'duplicate_id', message: 'This category already exists.' });
      }
      const next = [...categories, { key, label, createdAt: new Date().toISOString() }];
      await saveCategories(next, `Add category ${key} via Varnam admin`);
      res.status(201).json({ ok: true, category: { key, label } });
    } catch (err) {
      res.status(502).json({ error: 'upstream', message: err.message || 'Could not create the category.' });
    }
  }
);

router.put(
  '/api/categories/:key',
  requireAuth,
  csrfGuard,
  writeRateLimit,
  param('key').notEmpty(),
  categoryValidation,
  handleValidation,
  async (req, res) => {
    try {
      const { categories = [] } = await loadCategories();
      const index = categories.findIndex((c) => c.key === req.params.key);
      if (index === -1) {
        return res.status(404).json({ error: 'not_found', message: 'Category not found.' });
      }
      const next = [...categories];
      next[index] = { ...next[index], label: sanitizeText(req.body.label), updatedAt: new Date().toISOString() };
      await saveCategories(next, `Update category ${req.params.key} via Varnam admin`);
      res.json({ ok: true, category: next[index] });
    } catch (err) {
      res.status(502).json({ error: 'upstream', message: err.message || 'Could not update the category.' });
    }
  }
);

router.delete(
  '/api/categories/:key',
  requireAuth,
  csrfGuard,
  writeRateLimit,
  param('key').notEmpty(),
  handleValidation,
  async (req, res) => {
    try {
      const { categories = [] } = await loadCategories();
      if (categories.some((c) => c.key === 'All')) {
        // never remove the default All category
      }
      const index = categories.findIndex((c) => c.key === req.params.key);
      if (index === -1) {
        return res.status(404).json({ error: 'not_found', message: 'Category not found.' });
      }
      if (categories[index].key === 'All') {
        return res.status(400).json({ error: 'protected', message: 'The default category cannot be removed.' });
      }
      const next = categories.filter((c) => c.key !== req.params.key);
      await saveCategories(next, `Delete category ${req.params.key} via Varnam admin`);
      res.json({ ok: true, message: 'Category deleted.' });
    } catch (err) {
      res.status(502).json({ error: 'upstream', message: err.message || 'Could not delete the category.' });
    }
  }
);

// ----- auth routes -----

router.post(
  '/admin/login',
  loginRateLimit,
  body('email').notEmpty().normalizeEmail().withMessage('Email is required.'),
  body('password').notEmpty().withMessage('Password is required.'),
  handleValidation,
  async (req, res) => {
    if (!isConfigured()) {
      return res.status(503).json({ error: 'not_configured', message: 'Admin authentication is not configured on the server.' });
    }
    const adminEmail = process.env.ADMIN_EMAIL;
    const adminHash = process.env.ADMIN_PASSWORD_HASH;
    const { email, password } = req.body;
    if (!adminEmail || String(email).toLowerCase() !== String(adminEmail).toLowerCase()) {
      return res.status(401).json({ error: 'invalid_credentials', message: 'Invalid email or password.' });
    }
    const ok = await verifyPassword(password, adminHash);
    if (!ok) {
      return res.status(401).json({ error: 'invalid_credentials', message: 'Invalid email or password.' });
    }
    req.session.admin = { email: adminEmail, loggedInAt: new Date().toISOString() };
    req.session.csrfToken = issueCsrfToken(req);
    res.cookie('XSRF-TOKEN', req.session.csrfToken, {
      httpOnly: false,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      path: '/',
    });
    res.json({
      ok: true,
      message: 'Signed in.',
      admin: { email: adminEmail },
      csrfToken: req.session.csrfToken,
    });
  }
);

router.post('/admin/logout', requireAuth, csrfGuard, (req, res) => {
  req.session.destroy(() => {
    res.clearCookie(getSessionName());
    if (req.accepts(['json', 'html']) === 'html') {
      return res.redirect('/admin/login');
    }
    res.json({ ok: true, message: 'Signed out.' });
  });
});

router.get('/admin/session', (req, res) => {
  const admin = req.session && req.session.admin ? { email: req.session.admin.email } : null;
  res.json({ authenticated: Boolean(admin), admin });
});

export default router;
