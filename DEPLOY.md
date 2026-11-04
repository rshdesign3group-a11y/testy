# Deploying with GitHub Secrets

1. **Rotate the old key.** The previous Helius key was committed to the repository, so it is in the git history.
   In the Helius dashboard create a new key (and delete the old one). In *Access Control* allow only your site's domain.
2. In GitHub: **Settings -> Secrets and variables -> Actions -> New repository secret**
   - Name: `HELIUS_API_KEY`
   - Value: the new key (only the key, not the URL)
3. **Settings -> Pages -> Build and deployment -> Source: GitHub Actions**.
4. Push to `main`. The workflow `.github/workflows/pages.yml` writes the secret into `js/config.js` on the build server
   and publishes the site. The repository itself never contains the key.

If your repository root is the parent of `deep-holes/`, move the `.github` folder to the repository root and change
the workflow so the `sed` path is `deep-holes/js/config.js` and the upload `path` is `deep-holes`.

Local development: leave the placeholder as is. The wallet NFT picker shows demo pictures.

> A key used in browser code can always be read by visitors of the site. Secrets only keep it out of the repository.
> For real secrecy proxy the RPC through a tiny server (for example a Cloudflare Worker) that holds the key.
