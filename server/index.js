'use strict';

import { config as dotenvConfig } from 'dotenv';
dotenvConfig();
import express from 'express';
import helmet from 'helmet';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { sessionMiddleware, isConfigured, requireAuthPage, issueCsrfToken } from './auth.js';
import apiRouter from './routes/api.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = process.cwd();

const app = express();

app.set('trust proxy', 1);
app.set('views', path.join(__dirname, 'views'));
app.set('view engine', 'ejs');

app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));
app.use(helmet.contentSecurityPolicy({
  useNonces: true,
  directives: {
    defaultSrc: ["'self'"],
    scriptSrc: ["'self'"],
    styleSrc: ["'self'", 'https://fonts.googleapis.com'],
    imgSrc: ["'self'", 'data:', 'https:'],
    fontSrc: ["'self'", 'https://fonts.gstatic.com'],
    connectSrc: ["'self'"],
    frameAncestors: ["'none'"],
  },
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(sessionMiddleware());

// Serve static assets from the public directory (external JS, CSS, images).
app.use(express.static(path.join(root, 'public'), { dotfiles: 'ignore' }));

// One-time flash messages + shared view locals.
app.use((req, res, next) => {
  res.locals.flash = req.session.flash || null;
  res.locals.adminEmail = (req.session && req.session.admin) ? req.session.admin.email : null;
  res.locals.csrfToken = req.session.csrfToken || null;
  res.locals.cspNonce = res.locals.cspNonce || '';
  if (req.session.flash) {delete req.session.flash;}
  next();
});

// Block direct access to sensitive files/directories. Public data (data/*.json)
// remains served so the storefront can fall back to it.
const sensitive = [
  '/server',
  '/data/schema.json',
  '/package.json',
  '/package-lock.json',
  '/.env',
  '/.git',
  '/node_modules',
];
app.use((req, res, next) => {
  const url = req.url.split('?')[0];
  if (sensitive.some((s) => url === s || url.startsWith(s + '/'))) {
    return res.status(403).end();
  }
  next();
});

// CORS for the API so the storefront can call it from a different origin
// (e.g. GitHub Pages) and the admin can be reached cross-origin with credentials.
app.use((req, res, next) => {
  if (req.url.startsWith('/api/') || req.url.startsWith('/admin/')) {
    const origin = req.headers.origin;
    if (origin) {
      res.setHeader('Access-Control-Allow-Origin', origin);
      res.setHeader('Access-Control-Allow-Credentials', 'true');
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-XSRF-TOKEN, Cookie');
      res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    }
    if (req.method === 'OPTIONS') {return res.status(204).end();}
  }
  next();
});

// Public API + auth endpoints.
app.use('/', apiRouter);

// Storefront root.
app.get('/', (req, res) => {
  res.sendFile(path.join(root, 'index.html'));
});

// ----- server-rendered admin UI -----

async function computeStats() {
  const { products = [] } = await (await import('./store.js')).loadProducts();
  const total = products.length;
  const available = products.filter((p) => p.available !== false).length;
  const outOfStock = total - available;
  const featured = products.filter((p) => p.featured === true).length;
  const recent = [...products]
    .sort((a, b) => new Date(b.updatedAt || b.createdAt || 0) - new Date(a.updatedAt || a.createdAt || 0))
    .slice(0, 5);
  return { total, available, outOfStock, featured, recent };
}

function csrfTokenForView(req) {
  if (!req.session.csrfToken) {
    req.session.csrfToken = issueCsrfToken(req);
  }
  return req.session.csrfToken;
}

// Issue/refresh the XSRF-TOKEN cookie so browser clients can read it.
app.use('/admin', (req, res, next) => {
  if (req.session && !req.session.csrfToken) {
    req.session.csrfToken = issueCsrfToken(req);
  }
  res.cookie('XSRF-TOKEN', req.session.csrfToken || '', {
    httpOnly: false, // readable by JS for fetch-based clients
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
  });
  next();
});

app.get('/admin/login', (req, res) => {
  if (req.session && req.session.admin) {return res.redirect('/admin');}
  if (!isConfigured()) {
    return res.status(503).render('admin/error', {
      title: 'Not configured',
      message:
        'Admin authentication is not configured on the server. Set SESSION_SECRET, ADMIN_EMAIL and ADMIN_PASSWORD_HASH.',
    });
  }
  const csrfToken = csrfTokenForView(req);
  res.render('admin/login', { title: 'Sign in', csrfToken });
});

app.get('/admin', requireAuthPage, async (req, res) => {
  const stats = await computeStats();
  const csrfToken = csrfTokenForView(req);
  res.render('admin/dashboard', {
    title: 'Dashboard',
    adminEmail: req.session.admin.email,
    csrfToken,
    ...stats,
  });
});

app.get('/admin/products', requireAuthPage, async (req, res) => {
  const { products = [] } = await (await import('./store.js')).loadProducts();
  const { q, category, stock, featured, sort } = req.query;
  let list = products.filter((p) => p.published !== false); // admin sees all published drafts too
  if (q) {
    const term = String(q).trim().toLowerCase();
    list = list.filter(
      (p) =>
        p.name.toLowerCase().includes(term) ||
        p.id.toLowerCase().includes(term) ||
        (p.slug || '').toLowerCase().includes(term)
    );
  }
  if (category) {list = list.filter((p) => p.category === category);}
  if (stock === 'in_stock') {list = list.filter((p) => p.stockStatus === 'in_stock');}
  if (stock === 'out_of_stock') {list = list.filter((p) => p.stockStatus === 'out_of_stock');}
  if (featured === 'true') {list = list.filter((p) => p.featured === true);}
  if (featured === 'false') {list = list.filter((p) => p.featured !== true);}
  if (sort === 'price-low') {list = [...list].sort((a, b) => a.price - b.price);}
  if (sort === 'price-high') {list = [...list].sort((a, b) => b.price - a.price);}
  if (sort === 'name') {list = [...list].sort((a, b) => a.name.localeCompare(b.name));}
  // default: newest first
  else {list = [...list].sort((a, b) => new Date(b.updatedAt || b.createdAt || 0) - new Date(a.updatedAt || a.createdAt || 0));}

  const { categories = [] } = await (await import('./store.js')).loadCategories();
  const csrfToken = csrfTokenForView(req);
  res.render('admin/products/index', {
    title: 'Products',
    adminEmail: req.session.admin.email,
    csrfToken,
    products: list,
    categories,
    filters: { q: q || '', category: category || '', stock: stock || '', featured: featured || '', sort: sort || 'newest' },
  });
});

app.get('/admin/products/new', requireAuthPage, async (req, res) => {
  const { categories = [] } = await (await import('./store.js')).loadCategories();
  const csrfToken = csrfTokenForView(req);
  res.render('admin/products/form', {
    title: 'Add product',
    adminEmail: req.session.admin.email,
    csrfToken,
    product: null,
    action: '/api/products',
    method: 'POST',
    errors: null,
    values: {},
    categories,
  });
});

app.get('/admin/products/edit/:id', requireAuthPage, async (req, res) => {
  const { products = [] } = await (await import('./store.js')).loadProducts();
  const product = products.find((p) => p.id === req.params.id);
  if (!product) {return res.status(404).render('admin/error', { title: 'Not found', message: 'Product not found.' });}
  const { categories = [] } = await (await import('./store.js')).loadCategories();
  const csrfToken = csrfTokenForView(req);
  res.render('admin/products/form', {
    title: 'Edit product',
    adminEmail: req.session.admin.email,
    csrfToken,
    product,
    action: `/api/products/${encodeURIComponent(req.params.id)}`,
    method: 'PUT',
    errors: null,
    values: product,
    categories,
  });
});

app.get('/admin/categories', requireAuthPage, async (req, res) => {
  const { categories = [], source } = await (await import('./store.js')).loadCategories();
  const csrfToken = csrfTokenForView(req);
  res.render('admin/categories', {
    title: 'Categories',
    adminEmail: req.session.admin.email,
    csrfToken,
    categories,
    source,
  });
});

// Storefront static files (last, so API/admin routes win).
app.use(express.static(root, { dotfiles: 'ignore', index: false }));

app.use((req, res) => {
  res.status(404).format({
    html: () => res.status(404).render('admin/error', { title: 'Not found', message: 'Page not found.' }),
    json: () => res.status(404).json({ error: 'not_found', message: 'Not found.' }),
    default: () => res.status(404).send('Not found'),
  });
});

app.use((err, req, res, _next) => {
  console.error(err);
  const status = err.status || 500;
  res.status(status).format({
    html: () => res.status(status).render('admin/error', { title: 'Error', message: err.message || 'Server error.' }),
    json: () => res.status(status).json({ error: 'server', message: err.message || 'Server error.' }),
    default: () => res.status(status).send(err.message || 'Server error'),
  });
});

const port = Number(process.env.PORT || 3000);
if (import.meta.main) {
  app.listen(port, () => {
    console.log(`Varnam admin server listening on http://localhost:${port}`);
    if (!isConfigured()) {
      console.log('[varnam] Admin login disabled: configure SESSION_SECRET, ADMIN_EMAIL, ADMIN_PASSWORD_HASH, and GitHub vars.');
    }
  });
}

export default app;
