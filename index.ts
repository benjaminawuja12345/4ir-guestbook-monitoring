
/*
 * 4IR Solutions SRE Assessment
 * Pulumi Kubernetes Guestbook with Apache and Redis monitoring
 */

import * as k8s from "@pulumi/kubernetes";
import * as pulumi from "@pulumi/pulumi";

// Configuration
const config = new pulumi.Config();
const isMinikube = config.getBoolean("isMinikube");

// Redis Exporter configuration shared by the leader and replica.
// Each exporter connects to Redis within its own Kubernetes pod.
const redisExporterImage = "oliver006/redis_exporter:v1.93.0";

const redisExporterContainer = () => ({
    name: "redis-exporter",
    image: redisExporterImage,

    env: [
        {
            name: "REDIS_ADDR",
            value: "redis://127.0.0.1:6379",
        },
    ],

    ports: [
        {
            name: "redis-metrics",
            containerPort: 9121,
        },
    ],

    resources: {
        requests: {
            cpu: "25m",
            memory: "32Mi",
        },
        limits: {
            cpu: "100m",
            memory: "128Mi",
        },
    },

    readinessProbe: {
        httpGet: {
            path: "/metrics",
            port: 9121,
        },
        initialDelaySeconds: 5,
        periodSeconds: 10,
    },
});

//
// REDIS LEADER
//

const redisLeaderLabels = { app: "redis-leader" };

const redisLeaderDeployment = new k8s.apps.v1.Deployment(
    "redis-leader",
    {
        spec: {
            selector: {
                matchLabels: redisLeaderLabels,
            },

            template: {
                metadata: {
                    labels: redisLeaderLabels,
                },

                spec: {
                    containers: [
                        // Redis leader
                        {
                            name: "redis-leader",
                            image: "redis:8.2.10-alpine",

                            resources: {
                                requests: {
                                    cpu: "100m",
                                    memory: "100Mi",
                                },
                            },

                            ports: [
                                {
                                    name: "redis",
                                    containerPort: 6379,
                                },
                            ],
                        },

                        // Prometheus Redis Exporter sidecar
                        redisExporterContainer(),
                    ],
                },
            },
        },
    }
);

//
// REDIS LEADER SERVICE
//

const redisLeaderService = new k8s.core.v1.Service(
    "redis-leader",
    {
        metadata: {
            name: "redis-leader",
            labels: redisLeaderLabels,
        },

        spec: {
            ports: [
                // Original Redis application traffic
                {
                    name: "redis",
                    port: 6379,
                    targetPort: 6379,
                },

                // Prometheus Redis metrics
                {
                    name: "redis-metrics",
                    port: 9121,
                    targetPort: "redis-metrics",
                },
            ],

            selector: redisLeaderLabels,
        },
    }
);

//
// REDIS REPLICA
//

const redisReplicaLabels = { app: "redis-replica" };

const redisReplicaDeployment = new k8s.apps.v1.Deployment(
    "redis-replica",
    {
        spec: {
            selector: {
                matchLabels: redisReplicaLabels,
            },

            template: {
                metadata: {
                    labels: redisReplicaLabels,
                },

                spec: {
                    containers: [
                        // Redis replica, connected to Redis leader
                        {
                            name: "replica",
                            image: "redis:8.2.10-alpine",

                            command: [
                                "redis-server",
                            ],

                            args: [
                                "--replicaof",
                                "redis-leader",
                                "6379",
                            ],

                            resources: {
                                requests: {
                                    cpu: "100m",
                                    memory: "100Mi",
                                },
                            },

                            env: [
                                {
                                    name: "GET_HOSTS_FROM",
                                    value: "dns",
                                },
                            ],

                            ports: [
                                {
                                    name: "redis",
                                    containerPort: 6379,
                                },
                            ],
                        },

                        // Prometheus Redis Exporter sidecar
                        redisExporterContainer(),
                    ],
                },
            },
        },
    }
);

//
// REDIS REPLICA SERVICE
//

const redisReplicaService = new k8s.core.v1.Service(
    "redis-replica",
    {
        metadata: {
            name: "redis-replica",
            labels: redisReplicaLabels,
        },

        spec: {
            ports: [
                // Original Redis application traffic
                {
                    name: "redis",
                    port: 6379,
                    targetPort: 6379,
                },

                // Prometheus Redis metrics
                {
                    name: "redis-metrics",
                    port: 9121,
                    targetPort: "redis-metrics",
                },
            ],

            selector: redisReplicaLabels,
        },
    }
);

//
// GUESTBOOK FRONTEND
//

const frontendLabels = { app: "frontend" };

const frontendDeployment = new k8s.apps.v1.Deployment(
    "frontend",
    {
        spec: {
            selector: {
                matchLabels: frontendLabels,
            },

            replicas: 3,

            template: {
                metadata: {
                    labels: frontendLabels,
                },

                spec: {
                    containers: [

                        // Original Guestbook application
                        {
                            name: "frontend",
                            image: "pulumi/guestbook-php-redis",

                            resources: {
                                requests: {
                                    cpu: "100m",
                                    memory: "100Mi",
                                },
                            },

                            env: [
                                {
                                    name: "GET_HOSTS_FROM",
                                    value: "dns",
                                },
                            ],

                            ports: [
                                {
                                    name: "http",
                                    containerPort: 80,
                                },
                            ],
                        },

                        // Apache Prometheus Exporter sidecar
                        {
                            name: "apache-exporter",
                            image: "lusotycoon/apache-exporter:v1.0.0",

                            args: [
                                "--scrape_uri=http://127.0.0.1/server-status?auto",
                            ],

                            resources: {
                                requests: {
                                    cpu: "50m",
                                    memory: "64Mi",
                                },

                                limits: {
                                    cpu: "200m",
                                    memory: "128Mi",
                                },
                            },

                            ports: [
                                {
                                    name: "http-metrics",
                                    containerPort: 9117,
                                },
                            ],

                            readinessProbe: {
                                httpGet: {
                                    path: "/metrics",
                                    port: 9117,
                                },

                                initialDelaySeconds: 5,
                                periodSeconds: 10,
                            },
                        },
                    ],
                },
            },
        },
    }
);

//
// GUESTBOOK FRONTEND SERVICE
//

const frontendService = new k8s.core.v1.Service(
    "frontend",
    {
        metadata: {
            name: "frontend",

            labels: {
                app: "frontend",
            },
        },

        spec: {
            type: isMinikube ? "ClusterIP" : "LoadBalancer",

            ports: [
                // Original HTTP application
                {
                    name: "http",
                    port: 80,
                    targetPort: 80,
                },

                // Apache Exporter metrics
                {
                    name: "http-metrics",
                    port: 9117,
                    targetPort: 9117,
                },
            ],

            selector: frontendLabels,
        },
    }
);

//
// PULUMI OUTPUTS
//

export let frontendIp: pulumi.Output<string>;

if (isMinikube) {
    frontendIp = frontendService.spec.clusterIP;
} else {
    frontendIp = frontendService.status.loadBalancer.ingress[0].ip;
}

// Include Prometheus and Grafana infrastructure
export * from "./monitoring";
