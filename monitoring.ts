
/*
 * 4IR Solutions SRE Assessment
 * Prometheus, Grafana, and ServiceMonitor infrastructure
 */
import * as fs from "fs";
import * as k8s from "@pulumi/kubernetes";
import * as pulumi from "@pulumi/pulumi";

// Configuration
const config = new pulumi.Config();

const grafanaPassword = config.requireSecret(
    "grafanaAdminPassword"
);

const minikubeIp = config.require("minikubeIp");

//
// MONITORING NAMESPACE
//

const monitoringNamespace =
    new k8s.core.v1.Namespace(
        "monitoring-namespace",
        {
            metadata: {
                name: "monitoring",

                labels: {
                    "app.kubernetes.io/part-of":
                        "guestbook-monitoring",
                },
            },
        }
    );

//
// PROMETHEUS AND GRAFANA HELM RELEASE
//

const monitoring = new k8s.helm.v3.Release(
    "monitoring-stack",
    {
        name: "monitoring-stack",

        chart: "kube-prometheus-stack",

        version: "89.2.0",

        namespace: monitoringNamespace.metadata.name,

        repositoryOpts: {
            repo:
                "https://prometheus-community.github.io/helm-charts",
        },

        timeout: 900,

        values: {
            //
            // Grafana
            //
            grafana: {
                enabled: true,

                adminUser: "admin",
                adminPassword: grafanaPassword,

                service: {
                    type: "NodePort",
                    nodePort: 30030,
                },

                // Do not auto-update bundled plugins.
                // Prevents the Prometheus datasource plugin
                // from being replaced on a read-only filesystem.
                "grafana.ini": {
                    plugins: {
                        preinstall_auto_update: false,
                    },
                },
            },

            //
            // Prometheus
            //
            prometheus: {
                prometheusSpec: {
                    retention: "24h",

                    // Discover custom ServiceMonitors
                    // regardless of Helm release labels.
                    serviceMonitorSelectorNilUsesHelmValues: false,

                    // Look for ServiceMonitors across namespaces.
                    serviceMonitorNamespaceSelector: {},

                    podMonitorSelectorNilUsesHelmValues: false,

                    podMonitorNamespaceSelector: {},
                },
            },

            //
            // Alertmanager
            //
            alertmanager: {
                enabled: false,
            },
        },
    },
    {
        dependsOn: [
            monitoringNamespace,
        ],
    }
);

//
// PULUMI OUTPUTS
//

export const grafanaNamespace =
    monitoringNamespace.metadata.name;

export const grafanaServiceName =
    pulumi.output("monitoring-stack-grafana");

export const grafanaAdminUser = "admin";

export const grafanaAdminPassword =
    grafanaPassword;

export const grafanaUrl =
    pulumi.interpolate`http://${minikubeIp}:30030`;

//
// GUESTBOOK FRONTEND SERVICEMONITOR
//

const guestbookServiceMonitor =
    new k8s.apiextensions.CustomResource(
        "guestbook-servicemonitor",
        {
            apiVersion: "monitoring.coreos.com/v1",

            kind: "ServiceMonitor",

            metadata: {
                name: "guestbook",

                namespace: monitoringNamespace.metadata.name,

                labels: {
                    app: "guestbook",
                },
            },

            spec: {
                // Frontend Service is in default namespace
                namespaceSelector: {
                    matchNames: [
                        "default",
                    ],
                },

                // Match the frontend Service
                selector: {
                    matchLabels: {
                        app: "frontend",
                    },
                },

                endpoints: [
                    {
                        port: "http-metrics",
                        path: "/metrics",
                        interval: "30s",
                        scrapeTimeout: "10s",
                    },
                ],
            },
        },
        {
            // Ensure the Prometheus operator and
            // ServiceMonitor CRD exist first.
            dependsOn: [
                monitoring,
                monitoringNamespace,
            ],
        }
    );

//
// REDIS LEADER AND REPLICA SERVICEMONITOR
//

const redisServiceMonitor =
    new k8s.apiextensions.CustomResource(
        "redis-servicemonitor",
        {
            apiVersion: "monitoring.coreos.com/v1",

            kind: "ServiceMonitor",

            metadata: {
                name: "redis",

                namespace: monitoringNamespace.metadata.name,

                labels: {
                    app: "guestbook",
                },
            },

            spec: {
                // Both Redis Services are in default namespace
                namespaceSelector: {
                    matchNames: [
                        "default",
                    ],
                },

                // Discover both Redis leader and replica
                selector: {
                    matchExpressions: [
                        {
                            key: "app",
                            operator: "In",

                            values: [
                                "redis-leader",
                                "redis-replica",
                            ],
                        },
                    ],
                },

                endpoints: [
                    {
                        port: "redis-metrics",
                        path: "/metrics",
                        interval: "30s",
                        scrapeTimeout: "10s",
                    },
                ],
            },
        },
        {
            // Wait until monitoring stack CRDs exist
            dependsOn: [
                monitoring,
                monitoringNamespace,
            ],
        }
    );



//
// GRAFANA DASHBOARD AS CODE
//

// Read the exported Grafana dashboard JSON.
// The file is included in the project repository.
const guestbookDashboardJson = fs.readFileSync(
    "./dashboards/guestbook.json",
    "utf8"
);

// Create a ConfigMap that Grafana's dashboard sidecar can discover.
const guestbookDashboardConfigMap =
    new k8s.core.v1.ConfigMap(
        "guestbook-grafana-dashboard",
        {
            metadata: {
                name: "guestbook-grafana-dashboard",
                namespace: monitoringNamespace.metadata.name,
                labels: {
                    grafana_dashboard: "1",
                },
            },
            data: {
                "guestbook.json": guestbookDashboardJson,
            },
        },
        {
            dependsOn: [
                monitoring,
                monitoringNamespace,
            ],
        }
    );
