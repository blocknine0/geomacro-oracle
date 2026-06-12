export function buildSecurityReport(
  security: any
) {

  return {

    securityScore:
      security.securityScore,

    critical:
      security.critical,

    high:
      security.high,

    medium:
      security.medium,

    recommendation:
      security.securityScore < 80
        ? "Update dependencies"
        : "Healthy"
  };
}