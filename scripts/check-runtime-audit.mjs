import { spawnSync } from "node:child_process";

const allowedAdvisories = new Set([
  "https://github.com/advisories/GHSA-36qx-fr4f-26g5",
  "https://github.com/advisories/GHSA-378v-28hj-76wf",
  "https://github.com/advisories/GHSA-3g8h-86w9-wvmq",
  "https://github.com/advisories/GHSA-3x4c-7xq6-9pq8",
  "https://github.com/advisories/GHSA-848j-6mx2-7j84",
  "https://github.com/advisories/GHSA-8h8q-6873-q5fj",
  "https://github.com/advisories/GHSA-8rgj-285w-qcq4",
  "https://github.com/advisories/GHSA-9g9p-9gw9-jx7f",
  "https://github.com/advisories/GHSA-c4j6-fc7j-m34r",
  "https://github.com/advisories/GHSA-ffhc-5mcf-pf4q",
  "https://github.com/advisories/GHSA-ggv3-7p47-pfv8",
  "https://github.com/advisories/GHSA-gx5p-jg67-6x7h",
  "https://github.com/advisories/GHSA-h25m-26qc-wcjf",
  "https://github.com/advisories/GHSA-h64f-5h5j-jqjh",
  "https://github.com/advisories/GHSA-hhf6-3xpg-pggx",
  "https://github.com/advisories/GHSA-q4gf-8mx6-v5v3",
  "https://github.com/advisories/GHSA-qx2v-qp2m-jg93",
  "https://github.com/advisories/GHSA-vfv6-92ff-j949",
  "https://github.com/advisories/GHSA-wfc6-r584-vfw7",
]);

const allowedPackages = new Set([
  "@coinbase/wallet-sdk",
  "@ethersproject/abi",
  "@ethersproject/abstract-provider",
  "@ethersproject/abstract-signer",
  "@ethersproject/contracts",
  "@ethersproject/hash",
  "@ethersproject/hdnode",
  "@ethersproject/json-wallets",
  "@ethersproject/providers",
  "@ethersproject/signing-key",
  "@ethersproject/transactions",
  "@ethersproject/wallet",
  "@ethersproject/wordlists",
  "@privy-io/js-sdk-core",
  "@privy-io/public-api",
  "@privy-io/react-auth",
  "bn.js",
  "elliptic",
  "ethers",
  "ethjs-unit",
  "next",
  "number-to-bn",
  "postcss",
  "web3-core",
  "web3-core-helpers",
  "web3-core-method",
  "web3-core-requestmanager",
  "web3-core-subscriptions",
  "web3-eth-iban",
  "web3-providers-http",
  "web3-providers-ipc",
  "web3-providers-ws",
  "web3-utils",
]);

const result = spawnSync("npm", ["audit", "--omit=dev", "--json"], {
  encoding: "utf8",
  shell: process.platform === "win32",
});

if (result.error) {
  console.error(`Unable to run npm audit: ${result.error.message}`);
  process.exit(1);
}

let report;
try {
  report = JSON.parse(result.stdout);
} catch {
  console.error(result.stderr || "npm audit did not return valid JSON");
  process.exit(1);
}

if (
  report.error ||
  !report.vulnerabilities ||
  !report.metadata?.vulnerabilities
) {
  console.error("npm audit did not return a complete vulnerability report");
  process.exit(1);
}

const vulnerabilities = Object.entries(report.vulnerabilities);
const totals = report.metadata.vulnerabilities;
const advisoryUrls = new Set(vulnerabilities.flatMap(([, value]) =>
  (value.via ?? [])
    .filter((entry) => typeof entry === "object" && entry.url)
    .map((entry) => entry.url)
));
const unexpectedAdvisories = [...advisoryUrls]
  .filter((url) => !allowedAdvisories.has(url));
const unexpectedPackages = vulnerabilities
  .map(([name]) => name)
  .filter((name) => !allowedPackages.has(name));
const missingAdvisorySources = vulnerabilities.length > 0 && advisoryUrls.size === 0;

if (
  unexpectedAdvisories.length ||
  unexpectedPackages.length ||
  missingAdvisorySources ||
  Number(totals.critical ?? 0) > 0 ||
  Number(totals.high ?? 0) > 3 ||
  Number(totals.total ?? 0) > 33
) {
  console.error(JSON.stringify({
    message: "Runtime dependency risk exceeded the reviewed baseline",
    unexpectedAdvisories,
    unexpectedPackages,
    missingAdvisorySources,
    totals,
  }, null, 2));
  process.exit(1);
}

console.log(JSON.stringify({
  ok: true,
  residualAdvisories: [...advisoryUrls].sort(),
  affectedPackages: vulnerabilities.map(([name]) => name).sort(),
  totals,
}, null, 2));
