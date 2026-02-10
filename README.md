# paywall-node

Minimal **Node (Express)** implementation of an **x402 paywalled download**.

## Setup

```bash
cd ~/paywall-node
cp .env.example .env
# edit .env (PAY_TO etc)

# put the file you want to serve here (or change PROTECTED_FILE)
mkdir -p protected
printf "hello" > protected/asset.bin

npm install
npm run dev
```

## Routes

- `GET /health` (free)
- `GET /download` (x402-protected)

## Notes

- Test facilitator: `https://www.x402.org/facilitator`
- Default network is Base Sepolia: `eip155:84532`
