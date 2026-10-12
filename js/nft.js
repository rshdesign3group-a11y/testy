/**
 * Lists the NFTs owned by a wallet (Solana DAS `getAssetsByOwner`, Helius).
 * Includes compressed NFTs, pages through all results, caches per wallet.
 * Returns { demo: boolean, items: [{ id, name, image }] }
 */
import { DAS_RPC_URL } from "./config.js?v=13";

const ipfs = (u) => (u || "").replace(/^ipfs:\/\//, "https://ipfs.io/ipfs/").replace(/^ar:\/\//, "https://arweave.net/");
const cache = new Map();   // owner -> Promise<{demo, items}>

export const NFT_LIMIT = 50;      // only the 50 most recent NFTs can be chosen

async function rpc(owner) {
  const res = await fetch(DAS_RPC_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0", id: "deep-holes", method: "getAssetsByOwner",
      params: { ownerAddress: owner, page: 1, limit: NFT_LIMIT, sortBy: { sortBy: "created", sortDirection: "desc" }, displayOptions: { showFungible: false } }
    })
  });
  if (!res.ok) throw new Error("RPC error " + res.status);
  const json = await res.json();
  if (json.error) throw new Error(json.error.message || "RPC error");
  return json.result?.items || [];
}

async function load(owner) {
  if (!DAS_RPC_URL) {
    return { demo: true, items: Array.from({ length: 8 }, (_, i) => ({
      id: "demo" + i, name: `Demo NFT #${i + 1}`, image: `https://picsum.photos/seed/dh-nft${i}/480/480` })) };
  }
  const all = await rpc(owner);
  const items = all.filter((a) => a.ownership?.owner ? a.ownership.owner === owner : true).map((a) => {
    const files = a.content?.files || [];
    const file = files.find((f) => (f.mime || "").startsWith("image/")) || files[0];
    const image = ipfs(file?.cdn_uri || a.content?.links?.image || file?.uri);
    return { id: a.id, name: a.content?.metadata?.name || "NFT", image, compressed: !!a.compression?.compressed };
  }).filter((n) => n.image).slice(0, NFT_LIMIT);
  return { demo: false, items };
}

/** Cached lookup; pass force=true to refresh. */
export function fetchWalletNFTs(owner, force = false) {
  if (force || !cache.has(owner)) {
    const p = load(owner);
    cache.set(owner, p);
    p.catch(() => cache.delete(owner));               // failed lookups can be retried
  }
  return cache.get(owner);
}
