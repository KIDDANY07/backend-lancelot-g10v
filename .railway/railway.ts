import { defineRailway, github, project, service, volume } from "railway/iac";

export const partial = "ml";

export default defineRailway(() => {
  const lancelotMlVolume = volume("lancelot-ml-volume", {
    alerts: { usage: { "100": {}, "80": {}, "95": {} } },
    allowOnlineResize: true,
    region: "us-east4-eqdc4a",
    sizeMB: 5000,
  });

  const lancelotMl = service("lancelot-ml", {
    source: github("KIDDANY07/backend-lancelot-g10v", {
      branch: "main",
      checkSuites: true,
      rootDirectory: "/ml-service",
    }),
    build: {
      buildEnvironment: "V3",
      builder: "DOCKERFILE",
      dockerfilePath: "/ml-service/Dockerfile",
      watchPatterns: ["/ml-service/**"],
    },
    deploy: {
      healthcheckPath: "/health",
      healthcheckTimeout: 120,
    },
    replicas: { "us-east4-eqdc4a": 1 },
    volumeMounts: { "/app/models": lancelotMlVolume },
  });

  return project("LANCELOT", {
    variables: { managed: false },
    resources: [lancelotMl, lancelotMlVolume],
  });
});
