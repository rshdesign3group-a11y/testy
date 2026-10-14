/**
 * Public configuration.
 *
 * The Helius API key is NOT stored in the repository any more. The GitHub Actions
 * workflow (.github/workflows/pages.yml) replaces the placeholder below with the
 * repository secret HELIUS_API_KEY while deploying. Without the secret (local
 * development) the NFT picker simply runs in demo mode.
 *
 * NOTE: a key used by browser code is always visible to visitors of the site.
 * In the Helius dashboard restrict it to your domain (Access Control).
 */
const HELIUS_KEY = "__HELIUS_API_KEY__";
export const DAS_RPC_URL = HELIUS_KEY.startsWith("__") ? "" : `https://mainnet.helius-rpc.com/?api-key=${HELIUS_KEY}`;

/** The wallet that owns the game: it gets the admin panel and the first (founder) hole. Public address. */
export const ADMIN_WALLET = "8radQBX8A5M2NPfQcjPDCRAPVUBzx2vhcVwQQtaPExR3";
