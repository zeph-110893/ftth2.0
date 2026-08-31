# Deploying on MikroTik RB5009 (Alpine Linux Container)

This application is fully optimized to run inside an **Alpine Linux container** on **MikroTik RouterOS v7** (RB5009 series / ARM64 architecture).

---

## 🛠️ Key Technical Highlights for MikroTik RB5009

1. **Pure WebAssembly SQLite (`sql.js`)**:
   - Uses WASM-compiled SQLite without native C++ compilation dependencies (`node-gyp`, `glibc`, `python3`, or `g++`).
   - Runs natively on Alpine Linux (`musl libc`) and ARM64 architecture (Marvell Armada 7040 CPU in RB5009).

2. **Standalone Single-Bundle Express Server**:
   - Compiles client assets and server routes into `dist/server.cjs` via `esbuild`.
   - Lightweight memory footprint (~60MB RAM usage), ideal for router container environments.

---

## 🚀 Step 1: Build the Container Image for ARM64

Build the Docker image for `linux/arm64` (RB5009 architecture):

```bash
# Build multi-platform or ARM64 image
docker buildx build --platform linux/arm64 -t ftth-billing:latest --load .
```

Or push it to your private/public registry (e.g. Docker Hub or GitHub Container Registry):

```bash
docker buildx build --platform linux/arm64 -t yourusername/ftth-billing:latest --push .
```

---

## ⚡ Step 2: Enable Container Feature on MikroTik RB5009

On your MikroTik router (RouterOS v7.4+):

1. **Enable Container Package**:
   ```routeros
   /system/package/enable container
   ```
   *(Requires hard reboot or physical button press on RouterOS)*

2. **Configure VETH Interface & IP**:
   ```routeros
   /interface/veth/add name=veth-ftth ip-address=172.17.0.2/24 gateway=172.17.0.1
   /interface/bridge/add name=bridge-container
   /interface/bridge/port add bridge=bridge-container interface=veth-ftth
   /ip/address/add address=172.17.0.1/24 interface=bridge-container
   ```

3. **Configure NAT & Port Forwarding** (to access Web UI at `http://<Router-IP>:3000`):
   ```routeros
   /ip/firewall/nat/add chain=srcnat action=masquerade src-address=172.17.0.0/24
   /ip/firewall/nat/add chain=dstnat action=dst-nat to-addresses=172.17.0.2 to-ports=3000 protocol=tcp dst-port=3000
   ```

---

## 📦 Step 3: Run Container on MikroTik RouterOS

1. **Set Environment & Mount (for persistent database storage)**:
   ```routeros
   /container/mounts/add name=ftth_db src=disk1/ftth_data dst=/app/data
   ```

2. **Add & Start Container**:
   ```routeros
   /container/config/set registry-url=https://registry-1.docker.io tmpdir=disk1/pull
   /container/add remote-image=yourusername/ftth-billing:latest interface=veth-ftth root-dir=disk1/ftth-root logging=yes mounts=ftth_db
   /container/start 0
   ```

3. **Access Web Application**:
   Open browser at `http://<MikroTik-IP>:3000`.
