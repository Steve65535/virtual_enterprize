# Phase 5: Digital Employee Local Collaboration & Network Architecture

## Background & Objective
Currently, the digital employees (Agents) are fully isolated within their respective Docker sandboxes. While they can perform independent backend or frontend execution tasks, their ability to communicate natively relies on slow, external messaging platforms like Feishu.

The objective of **Phase 5** is to establish a high-performance, strictly local **Digital Enterprise Intranet**, tearing down the wall between isolated sandboxes and enabling true inter-agent physical collaboration.

## Core Collaboration Mechanisms

### 1. The "Shared File Cabinet" (Docker Shared Volume)
**Concept**: A physical directory on the host machine mounted globally to all active sandboxes.
**Implementation**: 
- Create a global directory on the host: `/tmp/openclaw_enterprise_shared`.
- Update `start_sandbox` in Rust to mount this directory to `/enterprise_shared` via `-v /tmp/openclaw_enterprise_shared:/enterprise_shared`.
- **Use Case**: 
  - Employee A (Data Scraper) crawls raw JSON data and saves it to `/enterprise_shared/raw_data.json`.
  - Employee B (Data Analyst) is triggered by an FS event in their isolated sandbox to immediately read and parse `/enterprise_shared/raw_data.json`.
  - Cost is zero, speed is instantaneous.

### 2. The "Internal Company Network" (Docker Custom Bridge)
**Concept**: A dedicated internal network where each digital employee receives a static internal DNS name (Hostname identical to their Employee Name).
**Implementation**:
- Auto-create a Docker bridge network: `docker network create openclaw-net`.
- Modify container launching to include `--network openclaw-net --network-alias {employee_name}`.
- **Use Case**:
  - Employee A runs a FastAPI server at `localhost:8000`.
  - Employee B runs a React Frontend dev server.
  - Employee B can directly hit Employee A's API by calling `http://{employee_name_A}:8000/api/users`.
  - True microservice and inter-agent networking simulation.

### 3. The "Manager's Dispatch Bus" (Local SSE / WebSockets)
**Concept**: Replaces Feishu channels. The Rust backend acts as the central messaging nervous system.
**Implementation**:
- Establish a light WebSocket or memory-based message bus in the Rust Tauri app.
- Provide a `send_message_to_colleague` CLI tool/Rust interceptor inside the base image.
- When an agent completes a task, it invokes the tool indicating `@Frontend_Dev: API is ready`. 
- Rust routes this command and executes a wake-up bash script or IPC event on the target employee's environment to notify them.

---

## Action Plan for Tomorrow

### Task 1: Engine Layer Networking (Rust)
- [ ] Implement startup check to ensure `openclaw-net` exists.
- [ ] Modify `start_sandbox` command to attach new containers to `openclaw-net` with `employee.name` as alias.
- [ ] Create `/tmp/openclaw_enterprise_shared` directory globally and mount it.

### Task 2: Core Inter-Agent Communication (Base Image logic)
- [ ] Build a simple python script `openclaw_msg.py` embedded in `openclaw-base`.
- [ ] This script will send HTTP POST requests to a port exposed by the Host (the Rust Backend Server) or write to a dedicated socket.
- [ ] Example syntax: `claw_msg --to "Steve (Data)" --msg "I have placed the file in /enterprise_shared/report.txt"`.

### Task 3: Dashboard Upgrades
- [ ] Add a visual "Network topology/Status" indicator in the Dashboard.
- [ ] Manage network limits (Option to completely sever an employee from the open internet while keeping them on the intranet).
- [ ] Expose an UI log of "Inter-employee communications" to act as a local, private company chatroom.
