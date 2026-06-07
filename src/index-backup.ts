import { generateGlobalRisk } from "./signals/global-risk.js";

async function main() {
  const risk =
    await generateGlobalRisk();

  console.log(
    JSON.stringify(risk, null, 2)
  );
}

main();