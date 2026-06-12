import { execSync } from "child_process";

export async function getSecurityScore() {

  try {

    const audit = execSync(
      "npm audit --json",
      { encoding: "utf8" }
    );

    const data = JSON.parse(audit);

    const critical =
      data.metadata.vulnerabilities.critical || 0;

    const high =
      data.metadata.vulnerabilities.high || 0;

    const moderate =
      data.metadata.vulnerabilities.moderate || 0;

    const score =
      Math.max(
        0,
        100 -
        critical * 25 -
        high * 10 -
        moderate * 3
      );

    let recommendation = "Healthy";

    if (critical > 0)
      recommendation = "Fix critical vulnerabilities";

    else if (high > 0)
      recommendation = "Update dependencies";

    return {
      securityScore: score,
      critical,
      high,
      medium: moderate,
      recommendation
    };

  } catch {

    return {
      securityScore: 100,
      critical: 0,
      high: 0,
      medium: 0,
      recommendation: "Audit unavailable"
    };
  }
}