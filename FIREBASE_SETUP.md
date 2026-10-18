# Varnam Bangles Firebase setup

## 1. Create the Firebase project

1. Create a Firebase project at [console.firebase.google.com](https://console.firebase.google.com/).
2. Add a Web app and copy its config into `firebase-config.js`. Keep the file in the repository; web API keys are identifiers, not service-account secrets.
3. Enable **Authentication > Sign-in method > Email/Password**.
4. Create a Firestore database in production mode.
5. Enable Firebase Storage.
6. In `firebase-config.js`, replace the placeholder admin email with the exact account email that will manage the catalogue.
7. Replace the same placeholder email in both `firestore.rules` and `storage.rules`, then publish those rules from the Firebase Console or Firebase CLI.

The frontend does not contain a service-account key or private server credential. The rules, not the hidden URL, protect writes.

## 2. Create the admin account

In **Authentication > Users**, choose **Add user**, enter the authorized email and a strong password, then open `admin.html` on the deployed site. Do not enable public sign-up. The email must appear in all three places: `firebase-config.js`, `firestore.rules`, and `storage.rules`.

## 3. Migrate the existing catalogue safely

1. Deploy the code with the Firebase config and rules.
2. Open `/admin.html` on the GitHub Pages site and sign in.
3. Click **Import existing catalogue** and confirm.
4. The import creates only missing document IDs from `products.js`; it never overwrites a Firestore document. Existing remote data is therefore preserved.
5. Edit each imported product to add real photos and its Meesho URL. The old Unsplash sample URLs remain usable until replaced.

Each product is stored in the `products` collection. Image URLs and Storage paths are stored as metadata in `imageRecords`; replacing or deleting a product removes old uploaded files when their paths are known. Existing external image URLs are never deleted.

## 4. Test the workflow

1. Visit the homepage, Collections page, and a product detail URL. With Firebase configured and `published: true`, changes should appear without a GitHub commit.
2. In the dashboard, add a product with two images, edit its description, remove one image, mark it featured/unavailable, and save.
3. Confirm the public catalogue hides unavailable products and that the detail gallery shows the remaining image.
4. Delete the test product and confirm its Firebase Storage files are removed.
5. In a private browser window, verify visitors can read published products but cannot sign in or write data.

## 5. Publish to GitHub Pages

```powershell
git add .
git commit -m "Add Firebase catalogue admin panel"
git push origin main
```

The site uses relative links and module imports, so the same files work at `https://<account>.github.io/varnam-bangles/` and at `https://varnambangles.in/`. Configure the custom domain as it is today; no hardcoded root path is required.

## Security rule source

The deployable rule files are `firestore.rules` and `storage.rules`. They allow public reads only for products marked `published: true`, allow public image reads, and restrict all product and image writes/deletes to the explicit admin email list. Keep the email lists synchronized when an administrator changes.