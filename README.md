
# Kubernetes Guestbook Monitoring with Pulumi

## Overview

This project extends the Pulumi Kubernetes TypeScript Guestbook example with a Prometheus and Grafana monitoring stack.

It demonstrates deploying an application to Kubernetes using infrastructure as code, exporting application and backend metrics, and visualizing those metrics in a Grafana dashboard.

The solution was developed and tested using Ubuntu 24.04, Minikube, and Pulumi.

## Architecture

The deployment includes:

- Three Guestbook frontend replicas.
- One Redis leader and one Redis replica.
- An Apache Prometheus Exporter sidecar in each frontend pod.
- A Redis Prometheus Exporter sidecar in each Redis pod.
- Prometheus and Grafana deployed with the `kube-prometheus-stack` Helm chart.
- Kubernetes ServiceMonitors for discovering application metrics.
- A six-panel Grafana dashboard provisioned through a Pulumi-managed ConfigMap.

### Monitoring data flow

```text
Guestbook frontends (3)
  └── Apache Exporters :9117
             │
             ├── ServiceMonitor: guestbook
             │
Redis leader ── Redis Exporter :9121
Redis replica ─ Redis Exporter :9121
             │
             └── ServiceMonitor: redis
                          │
                       Prometheus
                          │
                        Grafana
                          │
                 Guestbook SRE Dashboard
```

## Prerequisites

Install and configure:

- Docker
- Minikube
- kubectl
- Helm
- Node.js and npm
- Pulumi CLI

A local Kubernetes cluster must be running before deploying the project.

Start Minikube:

```bash
minikube start --driver=docker
```

Verify the cluster:

```bash
kubectl get nodes
```

## Installation

Clone this repository and enter the project directory:

```bash
git clone <REPOSITORY_URL>
cd 4ir-guestbook-monitoring
```

Install dependencies:

```bash
npm ci
```

Select the Pulumi local backend:

```bash
pulumi login --local
```

Create a development stack if one does not already exist:

```bash
pulumi stack init dev
```

Configure the deployment:

```bash
pulumi config set isMinikube true
pulumi config set minikubeIp "$(minikube ip)"
pulumi config set --secret grafanaAdminPassword
```

The final command prompts for a Grafana administrator password. Do not commit that password to Git.

Preview the deployment:

```bash
pulumi preview
```

Deploy:

```bash
pulumi up
```

Confirm the update when prompted.

## Accessing the Guestbook

For a local Minikube deployment, run:

```bash
kubectl port-forward svc/frontend 8080:80
```

Open:

http://localhost:8080

Leave the port-forward terminal running while using the application.

## Accessing Grafana

Retrieve the Grafana URL:

```bash
pulumi stack output grafanaUrl
```

For the tested Minikube environment, Grafana is exposed using NodePort `30030`.

The administrator username is:

```text
admin
```

The password is set securely using Pulumi configuration.

To retrieve it locally:

```bash
pulumi stack output grafanaAdminPassword --show-secrets
```

Do not include the password in screenshots, public repositories, or assessment submissions.

Open Grafana and navigate to **Dashboards → 4IR Guestbook SRE Monitoring**.

## Accessing Prometheus

Start a local port-forward:

```bash
kubectl port-forward -n monitoring \
  svc/monitoring-stack-kube-prom-prometheus 9090:9090
```

Open:

http://localhost:9090/targets

The application ServiceMonitors should show:

- Guestbook: three frontend exporter targets.
- Redis: one leader exporter and one replica exporter.

A healthy deployment should show all five application exporter targets as UP.

## Grafana Dashboard

The dashboard definition is stored at:

```text
dashboards/guestbook.json
```

Pulumi loads this file and creates a ConfigMap labeled:

```text
grafana_dashboard=1
```

Grafana's dashboard sidecar discovers this ConfigMap and loads the dashboard.

The dashboard includes six panels:

| Panel | Prometheus query |
|---|---|
| HTTP Requests per Second | `sum(rate(apache_accesses_total[5m]))` |
| Total Apache Requests | `sum(apache_accesses_total)` |
| Healthy Frontend Replicas | `sum(up{job="frontend"})` |
| Redis Instance Health | `redis_up` |
| Redis Connected Clients | `redis_connected_clients` |
| Redis Memory Usage | `redis_memory_used_bytes` |

## Verification

Check the Kubernetes workloads:

```bash
kubectl get deployments
kubectl get pods
kubectl get pods -n monitoring
```

Check the application Services:

```bash
kubectl get svc frontend redis-leader redis-replica
```

Check custom ServiceMonitors:

```bash
kubectl get servicemonitors -n monitoring
```

Verify the dashboard ConfigMap:

```bash
kubectl get configmap guestbook-grafana-dashboard \
  -n monitoring --show-labels
```

Verify Redis replication by running:

```bash
kubectl exec deployment/redis-leader-48f3a3c9 \
  -c redis-leader -- redis-cli INFO replication
```

Note: Kubernetes Deployment names may differ between installations. Use `kubectl get deployments` to find the actual name.

On the leader, inspect the connected replica count and replication status.

Verify that the Pulumi deployment has no drift:

```bash
pulumi preview
```

A clean preview should report no planned changes.

## Monitoring Implementation

### Frontend

Each Guestbook pod runs an Apache Exporter sidecar.

The exporter reads Apache server status information from the local frontend container and exposes Prometheus metrics on port `9117`.

A ServiceMonitor discovers all three frontend exporters.

### Redis

Both Redis pods run Redis Exporter sidecars.

Each exporter connects to its local Redis instance using `127.0.0.1:6379` and exposes metrics on port `9121`.

A ServiceMonitor discovers the leader and replica Services.

### Prometheus and Grafana

The monitoring stack is installed using the pinned `kube-prometheus-stack` Helm chart.

Grafana is configured with a secret administrator password and a NodePort Service for local access.

Automatic updates of bundled Grafana plugins are disabled to avoid a plugin update failure observed with the Grafana image used in the test environment.

## Known Limitations

- Redis does not currently use persistent volumes. Restarting Redis pods can result in lost Guestbook messages.
- The original example frontend image includes outdated application dependencies and should be modernized before production use.
- Grafana is exposed over HTTP using a NodePort. This is intended only for local development and assessment testing.
- Prometheus retention is configured for 24 hours.
- This example does not provide production-grade high availability, ingress TLS, or authentication for all application endpoints.
- The Apache Exporter exposes server-level statistics but does not provide per-request HTTP error-rate metrics.
- This project does not configure application-specific alerting rules.

## Project Structure

```text
.
├── index.ts
├── monitoring.ts
├── dashboards/
│   └── guestbook.json
├── Pulumi.yaml
├── package.json
├── package-lock.json
├── tsconfig.json
├── .gitignore
└── README.md
```

## Cleanup

To remove the deployed resources:

```bash
pulumi destroy
```

Confirm the destruction when prompted.

## Acknowledgment

Based on the Pulumi Kubernetes TypeScript Guestbook example, extended with Prometheus, Grafana, Apache Exporter, Redis Exporter, ServiceMonitors, and dashboard provisioning for an SRE technical assessment.
