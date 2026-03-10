# Virtual Enterprise (OpenClaw Enterprise Edition)

A high-performance Desktop application (macOS/Linux/Windows) built with **Tauri + React + TailwindCSS**, offering a powerful environment to manage fully-isolated digital employee containers based on Docker.

## Core Features
1. **Docker Container Management**: Dynamically spin up and teardown full Docker sandboxes (Digital Employees) via a user-friendly UI.
2. **Container File Explorer**: The internal file system of the workspace volume mapped to the employee is projected dynamically into the UI through a real-time reactive file tree (powered by `notify-rust` + Server-Sent Events).
3. **Interactive Control Terminal**: You can send and execute bash commands to the active container, with stdout/stderr securely redirected back to the React UI in real-time.
4. **Custom Image Architecture**: Pack your own environment logic (Python, Pip, internal configs) into a Docker template `openclaw-base`, creating an instantly ready agent execution engine on startup without dirtying the host environment.

## Tech Stack
- **Frontend Layer**: React 18, Vite, Typecript, TailwindCSS, Lucide-React.
- **Backend IPC Layer**: Rust, Tauri, `serde_json`, `notify`.
- **System Layer**: Docker Engine (Must be installed and authenticated on the host machine).

## Prerequisites
1. Installed Docker Desktop or Orbstack (for macOS)
2. Rust Toolchains: `curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh`
3. Node.JS (>=18.x) & npm.

## Quick Start
```bash
# Clone the repository
git clone git@github.com:Steve65535/virtual_enterprize.git
cd virtual_enterprize

# Install Frontend packages
npm install

# Start the development server and Tauri runtime
npm run tauri dev
```

> **Note:** Because this app runs container commands via Rust's `Command::new("docker")`, please ensure `docker` is available in your shell environment and you have enough disk space and permissions.

## Build for Production
To bundle the application into a `.dmg` or `.app` for macOS:
```bash
npm run tauri build
```

## Security Posture
- This application launches Docker containers (`ubuntu` or your custom base images) with strict limits specified in the Dashboard (CPU & Memory Limits).
- We mount a specifically assigned volume per digital employee at `/tmp/openclaw_{uuid}` into `/workspace`, ensuring their operations and code artifacts do not leak into your primary macOS host file system.

## License
MIT
